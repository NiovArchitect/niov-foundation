// FILE: semantic-retrieval.service.ts
// PURPOSE: Phase 1285-W — the semantic retrieval + memory reranking substrate.
//          Foundation deterministically assembles a SCOPED, RBAC/ABAC-checked
//          candidate set over durable Work Ledger records (work items, decisions,
//          blockers, follow-ups, commitments, meeting captures, notifications,
//          internal-note/direct-message rows), computes a deterministic lexical
//          base ranking, and OPTIONALLY asks the advisory Python reranker to
//          reorder ONLY those candidates. Foundation re-validates every reranked
//          id against the allowed set, so Python can never introduce, broaden,
//          or cross-tenant a result. No user flow blocks on Python: when Python
//          is absent/unhealthy/slow/drifting the deterministic order is what
//          surfaces, with an honest envelope status.
//          This phase does NOT touch COE, SimilarityService, the embedding
//          provider, ADR-0022, or pgvector (those are the Founder-locked
//          MemoryCapsule governed lane; semantic capsule retrieval is deferred).
// CONNECTS TO: routes/work-os-ledger.routes.ts (the /work-os/semantic-retrieval/
//          query route); resolve-entities.ts (canonical names); intelligence/
//          python-rerank.service.ts (advisory client); intelligence/
//          python-intelligence.ts (envelope + validation); packages/database
//          (prisma); tests/unit/semantic-retrieval.test.ts.

import { prisma } from "@niov/database";
import type { WorkLedgerEntry } from "@prisma/client";
import { resolveEntityNames, type ResolvedName } from "../identity/resolve-entities.js";
import {
  rerankCandidates,
  type SemanticRerankPayloadCandidate,
  type SemanticRerankRuntimeConfig,
} from "../intelligence/python-rerank.service.js";
import {
  buildSemanticRetrievalEnvelope,
  validateSemanticRetrievalEnvelope,
  type PythonIntelligenceEnvelope,
} from "../intelligence/python-intelligence.js";

// A resolved counterpart label. Never a raw UUID as the meaning — display_name
// is the primary label; entity_id rides along only for safe linking.
export interface RetrievalEntity {
  entity_id: string | null;
  display_name: string;
  unresolved: boolean;
}

// A Foundation-allowed candidate, assembled from a durable record the caller is
// already authorized to see. related_people are display names (no UUIDs).
export interface SemanticRetrievalCandidate {
  candidate_id: string; // ledger_entry_id
  candidate_type: string; // ledger_type (DECISION / BLOCKER / FOLLOW_UP / ...)
  title: string;
  summary: string | null;
  source_type: string;
  created_at: string;
  updated_at: string;
  status: string;
  related_people: string[]; // resolved display names, caller excluded
  related_person: RetrievalEntity | null; // primary counterpart for display
}

// One governed retrieval result returned to the caller.
export interface SemanticRetrievalResult {
  result_id: string; // ledger_entry_id
  result_type: string;
  title: string;
  summary: string | null;
  score: number;
  reason: string;
  source: { source_system: "work_ledger"; ledger_entry_id: string };
  route: string;
  related_person: RetrievalEntity | null;
  created_at: string;
  updated_at: string;
  scope_label: "personal";
  provenance: string; // "python:semantic-rerank" | "foundation:deterministic-lexical"
}

const CANDIDATE_POOL_LIMIT = 200; // durable rows considered before ranking
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;
const DONE_STATUSES = ["CANCELLED", "EXPIRED"];
const DETERMINISTIC_PROVENANCE = "foundation:deterministic-lexical";
const PYTHON_PROVENANCE = "python:semantic-rerank";

// Function words that carry no retrieval signal — kept in parity with the
// Python reranker's stopword set so deterministic + advisory agree on tokens.
const STOPWORDS = new Set<string>([
  "the", "a", "an", "and", "or", "but", "is", "are", "was", "were", "be",
  "been", "to", "of", "in", "on", "for", "with", "at", "by", "from", "up",
  "about", "into", "over", "after", "as", "so",
  "what", "which", "who", "whom", "whose", "when", "where", "why", "how",
  "did", "do", "does", "done",
  "i", "you", "we", "they", "he", "she", "it", "me", "my", "our", "your",
  "their", "this", "that", "these", "those", "there", "here",
  "show", "find", "get", "tell", "give", "list", "related", "relating",
  "all", "any", "some", "can", "could", "would", "should", "will", "shall",
  "has", "have", "had", "since", "last", "recent",
]);

const TITLE_WEIGHT = 3;
const PEOPLE_WEIGHT = 2;
const SUMMARY_WEIGHT = 1;
const META_WEIGHT = 1;

// WHAT: tokenize text into a deduped relevance-token set.
// WHY: lowercase, drop stopwords + sub-2-char fragments; same rule both sides.
function tokenize(text: string): Set<string> {
  const out = new Set<string>();
  for (const t of text.toLowerCase().split(/[^a-z0-9_-]+/)) {
    if (t.length >= 2 && !STOPWORDS.has(t)) out.add(t);
  }
  return out;
}

function overlap(query: Set<string>, text: string): number {
  if (text.length === 0) return 0;
  let hits = 0;
  for (const t of tokenize(text)) if (query.has(t)) hits++;
  return hits;
}

// WHAT: the deterministic lexical relevance score + short reason for a candidate.
// WHY: this is BOTH the safe base ordering and the fallback when Python is down.
//      Field-weighted overlap (title + a related person's name matter most).
function deterministicScore(
  queryTokens: Set<string>,
  c: SemanticRetrievalCandidate,
): { score: number; reason: string } {
  const titleHits = overlap(queryTokens, c.title);
  const peopleHits = overlap(queryTokens, c.related_people.join(" "));
  const summaryHits = overlap(queryTokens, c.summary ?? "");
  const metaHits = overlap(queryTokens, `${c.candidate_type} ${c.source_type} ${c.status}`);
  const score =
    titleHits * TITLE_WEIGHT +
    peopleHits * PEOPLE_WEIGHT +
    summaryHits * SUMMARY_WEIGHT +
    metaHits * META_WEIGHT;
  if (score <= 0) return { score: 0, reason: "No lexical match" };
  const contributions: Array<[number, string]> = [
    [titleHits * TITLE_WEIGHT, "Matched query terms in the title"],
    [peopleHits * PEOPLE_WEIGHT, "Matched a related person"],
    [summaryHits * SUMMARY_WEIGHT, "Matched query terms in the summary"],
    [metaHits * META_WEIGHT, "Matched the work type or status"],
  ];
  contributions.sort((a, b) => b[0] - a[0]);
  return { score, reason: contributions[0]![1] };
}

function canonical(
  names: Map<string, ResolvedName>,
  id: string | null,
): RetrievalEntity | null {
  if (id === null) return null;
  const r = names.get(id);
  if (r === undefined) return { entity_id: id, display_name: "Unknown entity", unresolved: true };
  return { entity_id: id, display_name: r.display_name, unresolved: r.unresolved };
}

// WHAT: assemble the Foundation-allowed candidate set for the caller.
// INPUT: org + caller (+ optional source_filter on candidate_type/source_type).
// OUTPUT: SemanticRetrievalCandidate[] — only durable rows the caller may see.
// WHY: RBAC/ABAC + tenant scope are enforced HERE (org_entity_id + caller is
//      owner/target/requester), mirroring getMyWork / Comms. Python only ever
//      sees what this returns; cross-tenant rows are impossible by construction.
export async function getSemanticRetrievalCandidates(args: {
  org_entity_id: string;
  caller_entity_id: string;
  source_filter?: string[];
}): Promise<SemanticRetrievalCandidate[]> {
  const rows = await prisma.workLedgerEntry.findMany({
    where: {
      org_entity_id: args.org_entity_id,
      OR: [
        { owner_entity_id: args.caller_entity_id },
        { target_entity_id: args.caller_entity_id },
        { requester_entity_id: args.caller_entity_id },
      ],
      NOT: { status: { in: DONE_STATUSES } },
    },
    orderBy: { updated_at: "desc" }, // recency is the deterministic tiebreak
    take: CANDIDATE_POOL_LIMIT,
  });

  const names = await resolveEntityNames(
    rows.flatMap((r) => [r.owner_entity_id, r.requester_entity_id, r.target_entity_id]),
  );

  const filter =
    args.source_filter && args.source_filter.length > 0
      ? new Set(args.source_filter.map((s) => s.toUpperCase()))
      : null;

  const candidates: SemanticRetrievalCandidate[] = [];
  for (const r of rows as WorkLedgerEntry[]) {
    if (
      filter !== null &&
      !filter.has(r.ledger_type.toUpperCase()) &&
      !filter.has(r.source_type.toUpperCase())
    ) {
      continue;
    }
    // All distinct participants resolved to display names, caller excluded, so
    // "blockers related to <Name>" matches whoever the counterpart is.
    const participantIds = [r.owner_entity_id, r.requester_entity_id, r.target_entity_id].filter(
      (id): id is string => id !== null && id !== args.caller_entity_id,
    );
    const relatedPeople = Array.from(
      new Set(participantIds.map((id) => canonical(names, id)?.display_name).filter((n): n is string => !!n)),
    );
    const counterpartId = participantIds[0] ?? null;
    candidates.push({
      candidate_id: r.ledger_entry_id,
      candidate_type: r.ledger_type,
      title: r.title,
      summary: r.summary ?? r.next_action ?? null,
      source_type: r.source_type,
      created_at: r.created_at.toISOString(),
      updated_at: r.updated_at.toISOString(),
      status: r.status,
      related_people: relatedPeople,
      related_person: canonical(names, counterpartId),
    });
  }
  return candidates;
}

function toResult(
  c: SemanticRetrievalCandidate,
  score: number,
  reason: string,
  provenance: string,
): SemanticRetrievalResult {
  return {
    result_id: c.candidate_id,
    result_type: c.candidate_type,
    title: c.title,
    summary: c.summary,
    score,
    reason,
    source: { source_system: "work_ledger", ledger_entry_id: c.candidate_id },
    route: "/app/my-work",
    related_person: c.related_person,
    created_at: c.created_at,
    updated_at: c.updated_at,
    scope_label: "personal",
    provenance,
  };
}

function toPayload(c: SemanticRetrievalCandidate): SemanticRerankPayloadCandidate {
  return {
    candidate_id: c.candidate_id,
    candidate_type: c.candidate_type,
    title: c.title,
    summary: c.summary,
    source_type: c.source_type,
    created_at: c.created_at,
    updated_at: c.updated_at,
    related_people: c.related_people,
    status: c.status,
  };
}

// WHAT: rank an already-assembled candidate set (deterministic base + advisory
//        Python rerank) and return governed results + the honest envelope.
// INPUT: query + candidates (Foundation-allowed) + optional limit/runtime/now.
// OUTPUT: { results, envelope }. results are relevance-bearing only (score > 0).
// WHY: pure-ish core (Python via injectable runtime) so the validation rules are
//      unit-testable without a DB. Deterministic order ALWAYS exists; Python only
//      reorders it when validated. No flow blocks on Python.
export async function rankSemanticCandidates(args: {
  query: string;
  candidates: SemanticRetrievalCandidate[];
  limit?: number;
  runtime?: SemanticRerankRuntimeConfig;
  nowIso?: string;
}): Promise<{ results: SemanticRetrievalResult[]; envelope: PythonIntelligenceEnvelope }> {
  const limit = Math.min(Math.max(1, args.limit ?? DEFAULT_LIMIT), MAX_LIMIT);
  const nowIso = args.nowIso ?? new Date().toISOString();
  const queryTokens = tokenize(args.query);

  // Deterministic base: score every candidate; keep only relevance-bearing ones.
  const det = args.candidates
    .map((c) => ({ c, ...deterministicScore(queryTokens, c) }))
    .filter((x) => x.score > 0);
  // Score desc; candidates already arrive recency-desc so equal scores keep the
  // most-recent first (stable sort preserves input order).
  det.sort((a, b) => b.score - a.score);

  const allowedIds = new Set(args.candidates.map((c) => c.candidate_id));

  // Ask Python to rerank ONLY the allowed candidate summaries (never throws).
  const started = Date.now();
  const rerank = await rerankCandidates(
    { query: args.query, candidates: args.candidates.map(toPayload), max_results: limit },
    args.runtime ?? {},
  );
  const latency = Date.now() - started;
  const envelope = validateSemanticRetrievalEnvelope(
    buildSemanticRetrievalEnvelope(rerank, latency, nowIso),
    allowedIds,
  );

  // FOUNDATION_VALIDATED → surface Python's order over Foundation content.
  if (envelope.authority === "FOUNDATION_VALIDATED") {
    const byId = new Map(args.candidates.map((c) => [c.candidate_id, c]));
    const results: SemanticRetrievalResult[] = [];
    for (const ranked of envelope.candidates) {
      const id = (ranked as { candidate_id: string }).candidate_id;
      const c = byId.get(id);
      if (c === undefined) continue; // belt-and-suspenders; validation already filtered
      const reason = (ranked as { reason?: string }).reason ?? "Reranked by relevance";
      const score = (ranked as { score?: number }).score ?? 0;
      results.push(toResult(c, score, reason, PYTHON_PROVENANCE));
    }
    return { results: results.slice(0, limit), envelope };
  }

  // Python down / drift / no-signal → deterministic order surfaces (honest).
  const results = det.slice(0, limit).map((x) => toResult(x.c, x.score, x.reason, DETERMINISTIC_PROVENANCE));
  return { results, envelope };
}

// WHAT: the governed semantic-retrieval query entrypoint (assemble + rank).
// INPUT: org + caller + query (+ optional source_filter / limit / runtime).
// OUTPUT: { results, envelope } — ranked results + the honest Python envelope.
// WHY: the route consumes this. Candidate assembly enforces scope; ranking is
//      advisory; Foundation is the authority end-to-end.
export async function querySemanticRetrieval(args: {
  org_entity_id: string;
  caller_entity_id: string;
  query: string;
  source_filter?: string[];
  limit?: number;
  runtime?: SemanticRerankRuntimeConfig;
}): Promise<{ results: SemanticRetrievalResult[]; envelope: PythonIntelligenceEnvelope }> {
  const candidates = await getSemanticRetrievalCandidates({
    org_entity_id: args.org_entity_id,
    caller_entity_id: args.caller_entity_id,
    ...(args.source_filter !== undefined ? { source_filter: args.source_filter } : {}),
  });
  return rankSemanticCandidates({
    query: args.query,
    candidates,
    ...(args.limit !== undefined ? { limit: args.limit } : {}),
    ...(args.runtime !== undefined ? { runtime: args.runtime } : {}),
  });
}

// Exposed for unit tests (the pure pieces).
export const __internals = { tokenize, deterministicScore };
