// FILE: org-query.service.ts
// PURPOSE: Slice B — the UNIFIED ORG QUERY LAYER. A governed, scoped read over
//          the ONE canonical rail (WorkLedgerEntry) that lets Otzar retrieve the
//          whole organization picture — self / project / team / org / admin — and
//          a data-grounding function Otzar can call before it answers or acts.
//          NO new data model, NO second memory system, NO separate graph silo:
//          this is a query LAYER over the same table every source now feeds
//          (transcripts + Slice-A connector source events alike).
// GOVERNANCE: scope is enforced BEFORE the query (self = own rows; project =
//          active membership; team/org/admin = manager/can_admin_org). Rows are
//          post-quarantine (noise never became a row) and only scoped summary +
//          evidence quotes are returned — never raw transcript. Dandelion seeds
//          (ORG_SEEDING) are admin-only. No cross-tenant leak (org_entity_id).
// CONNECTS TO: work-ledger.service.ts (the rail), identity/resolve-entities.ts,
//          otzar/work-project.service.ts (membership), semantic-retrieval (sibling).

import { prisma } from "@niov/database";
import type { Prisma, WorkLedgerEntry } from "@prisma/client";
import { resolveEntityNames, nameFrom } from "../identity/resolve-entities.js";
import { isActiveProjectMember } from "../otzar/work-project.service.js";

export type OrgQueryScope = "self" | "project" | "team" | "org" | "admin";
export type OrgQueryFilter = "all" | "blockers" | "connector_gaps" | "seeds";
export type OrgQuerySort = "relevance" | "recent";

/** Statuses that mean "this is stuck / needs attention" (a blocker or gap). */
const BLOCKER_STATUSES = new Set([
  "BLOCKED", "NEEDS_OWNER", "NEEDS_APPROVAL", "NEEDS_TARGET_RESOLUTION",
  "NEEDS_PARTICIPANT_CONFIRMATION", "NEEDS_AUTHORITY", "RUNTIME_MISSING",
]);
const CLOSED_STATUSES = new Set(["CANCELLED", "EXPIRED"]);

export interface OrgQueryResult {
  result_id: string;
  result_type: string; // ledger_type
  title: string;
  summary: string | null;
  source_type: string;
  source_system: string;
  source_evidence: string | null;
  source_conversation_id: string | null;
  owner: string | null;
  requester: string | null;
  project_id: string | null;
  project_hint: string | null;
  team_hint: string | null;
  status: string;
  confidence: number | null;
  sensitivity: string | null;
  scope_label: OrgQueryScope;
  created_at: string;
  updated_at: string;
  execution: {
    execution_type: string | null;
    execution_mode: string | null;
    required_connector: string | null;
    capability_state: string | null;
    next_best_action: string | null;
  } | null;
  connector_gap: { required_connector: string | null; capability_state: string | null } | null;
  dandelion_seed: { seed_type: string | null; approval_required: boolean; subject_name: string | null } | null;
  audit_pointer: string | null;
}

export interface OrgQueryArgs {
  org_entity_id: string;
  caller_entity_id: string;
  is_manager: boolean;
  scope: OrgQueryScope;
  query?: string;
  project_id?: string;
  filter?: OrgQueryFilter;
  sort?: OrgQuerySort;
  limit?: number;
}

export type OrgQueryOutcome =
  | { ok: true; scope: OrgQueryScope; results: OrgQueryResult[]; count: number; provenance: string }
  | { ok: false; code: "SCOPE_NOT_PERMITTED" | "NOT_PROJECT_MEMBER" | "INVALID_REQUEST"; message: string };

const MAX_LIMIT = 100;
// Common words carry no relevance signal — including them would make every row
// "match" a query and defeat the grounding's insufficiency check.
const STOPWORDS = new Set([
  "the", "for", "and", "was", "are", "you", "with", "this", "that", "from", "will",
  "has", "have", "not", "but", "all", "any", "can", "our", "your", "their", "who",
  "what", "when", "where", "how", "why", "into", "onto", "about", "over", "under",
  "out", "off", "per", "via", "get", "got", "let", "did", "does", "done", "were",
]);
/** Meaningful query tokens (≥3 chars, not a stopword). */
function queryTokens(q: string): string[] {
  return q.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}
const asObj = (v: unknown): Record<string, unknown> => (typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {});
const asStr = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);

/** Extract the source system: connector rows carry details.source_system (Slice A);
 *  transcripts derive it from source_type. Never returns a UUID or raw text. */
function sourceSystemOf(row: WorkLedgerEntry, details: Record<string, unknown>): string {
  return (asStr(details.source_system) ?? row.source_type ?? "work_ledger").toLowerCase();
}

function firstEvidenceQuote(evidence: unknown): string | null {
  if (Array.isArray(evidence) && evidence.length > 0) {
    const e = asObj(evidence[0]);
    return asStr(e.quote);
  }
  return null;
}

function rowToResult(
  row: WorkLedgerEntry,
  scope: OrgQueryScope,
  names: Map<string, { display_name: string; unresolved: boolean }>,
): OrgQueryResult {
  const details = asObj(row.details);
  const plan = asObj(details.execution_plan);
  const hasPlan = Object.keys(plan).length > 0;
  const capability = asStr(plan.capabilityState);
  const requiredConnector = asStr(plan.requiredConnector);
  const isSeed = row.ledger_type === "ORG_SEEDING";
  // A connector gap = a plan that needs a connector that isn't connected.
  const connectorGap =
    requiredConnector !== null && requiredConnector !== "NONE" && requiredConnector !== "INTERNAL" &&
    capability !== null && capability !== "connected"
      ? { required_connector: requiredConnector, capability_state: capability }
      : null;
  return {
    result_id: row.ledger_entry_id,
    result_type: row.ledger_type,
    title: row.title,
    summary: row.summary,
    source_type: row.source_type,
    source_system: sourceSystemOf(row, details),
    source_evidence: firstEvidenceQuote(row.evidence) ?? asStr(details.source_evidence),
    source_conversation_id: row.conversation_id ?? asStr(details.source_conversation_id) ?? asStr(details.meeting_capture_id),
    owner: row.owner_entity_id ? nameFrom(names, row.owner_entity_id) : null,
    requester: row.requester_entity_id ? nameFrom(names, row.requester_entity_id) : null,
    project_id: row.project_id,
    project_hint: asStr(details.project_hint),
    team_hint: asStr(details.team_hint),
    status: row.status,
    confidence: row.confidence_score,
    sensitivity: asStr(details.sensitivity),
    scope_label: scope,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    execution: hasPlan
      ? {
          execution_type: asStr(plan.executionType),
          execution_mode: asStr(plan.executionMode),
          required_connector: requiredConnector,
          capability_state: capability,
          next_best_action: asStr(plan.nextBestAction),
        }
      : null,
    connector_gap: connectorGap,
    dandelion_seed: isSeed
      ? { seed_type: asStr(details.seed_type), approval_required: details.approval_required === true, subject_name: asStr(details.subject_name) }
      : null,
    audit_pointer: row.audit_event_id ?? null,
  };
}

/** Deterministic lexical relevance over title + summary + the SOURCE EVIDENCE
 *  quote (so a query matches the grounded evidence, e.g. "repo access", even when
 *  the extracted title is terse). No LLM. */
function lexicalScore(row: WorkLedgerEntry, tokens: string[]): number {
  if (tokens.length === 0) return 0;
  const quote = firstEvidenceQuote(row.evidence) ?? "";
  const hay = `${row.title} ${row.summary ?? ""} ${quote}`.toLowerCase();
  let hits = 0;
  for (const t of tokens) if (hay.includes(t)) hits += 1;
  return hits;
}

/**
 * The unified governed query. Resolves + ENFORCES the scope, reads the canonical
 * ledger, and returns rich, evidence-bearing results — never raw transcript,
 * never another user's private work, never admin seeds to non-admins.
 */
export async function queryOrgWork(args: OrgQueryArgs): Promise<OrgQueryOutcome> {
  const { org_entity_id, caller_entity_id, is_manager, scope } = args;
  const limit = Math.min(Math.max(1, args.limit ?? 25), MAX_LIMIT);
  const filter: OrgQueryFilter = args.filter ?? "all";

  // ── Scope enforcement (BEFORE any read) ──────────────────────────────────
  const where: Prisma.WorkLedgerEntryWhereInput = { org_entity_id };
  if (scope === "self") {
    where.OR = [
      { owner_entity_id: caller_entity_id },
      { target_entity_id: caller_entity_id },
      { requester_entity_id: caller_entity_id },
    ];
    where.ledger_type = { notIn: ["ORG_SEEDING", "GOAL", "DOCUMENT_CONTEXT", "DOCUMENT"] }; // seeds/docs are not personal work
    where.status = { notIn: [...CLOSED_STATUSES] };
  } else if (scope === "project") {
    const projectId = args.project_id;
    if (typeof projectId !== "string" || projectId.length === 0) {
      return { ok: false, code: "INVALID_REQUEST", message: "project_id is required for project scope." };
    }
    const member = await isActiveProjectMember({ projectId, entityId: caller_entity_id });
    if (!member) {
      return { ok: false, code: "NOT_PROJECT_MEMBER", message: "Caller is not an active member of this project." };
    }
    where.project_id = projectId;
    where.ledger_type = { notIn: ["ORG_SEEDING", "GOAL", "DOCUMENT_CONTEXT", "DOCUMENT"] };
    where.status = { notIn: [...CLOSED_STATUSES] };
  } else if (scope === "team" || scope === "org") {
    if (!is_manager) {
      return { ok: false, code: "SCOPE_NOT_PERMITTED", message: "Team/org scope requires manager authority." };
    }
    where.ledger_type = { notIn: ["ORG_SEEDING", "GOAL", "DOCUMENT_CONTEXT", "DOCUMENT"] };
    where.status = { notIn: [...CLOSED_STATUSES] };
  } else if (scope === "admin") {
    if (!is_manager) {
      return { ok: false, code: "SCOPE_NOT_PERMITTED", message: "Admin scope requires organization-admin authority." };
    }
    where.ledger_type = "ORG_SEEDING"; // the governed Dandelion seed queue
  }

  // Structured filters that can be pushed to the DB.
  if (filter === "seeds") {
    if (scope !== "admin") return { ok: false, code: "SCOPE_NOT_PERMITTED", message: "Seeds are only queryable in admin scope." };
  } else if (filter === "blockers") {
    where.status = { in: [...BLOCKER_STATUSES] };
  }

  const rows = await prisma.workLedgerEntry.findMany({
    where,
    orderBy: args.sort === "recent" ? { updated_at: "desc" } : { created_at: "desc" },
    take: filter === "connector_gaps" || (args.query ?? "").trim().length > 0 ? MAX_LIMIT : limit,
  });

  // Optional lexical relevance filter (deterministic, stopword-free).
  const tokens = queryTokens(args.query ?? "");
  let scored = rows.map((r) => ({ r, score: lexicalScore(r, tokens) }));
  if (tokens.length > 0) scored = scored.filter((x) => x.score > 0).sort((a, b) => b.score - a.score);

  // Resolve owner/requester display names in one batch.
  const ids = scored.flatMap((x) => [x.r.owner_entity_id, x.r.requester_entity_id]);
  const names = await resolveEntityNames(ids);

  let results = scored.map((x) => rowToResult(x.r, scope, names));
  if (filter === "connector_gaps") results = results.filter((r) => r.connector_gap !== null);
  results = results.slice(0, limit);

  return {
    ok: true,
    scope,
    results,
    count: results.length,
    provenance: "foundation:governed-org-query",
  };
}

// ── Agent grounding ─────────────────────────────────────────────────────────

export interface GroundContextArgs {
  org_entity_id: string;
  caller_entity_id: string;
  is_manager: boolean;
  query: string;
  intent?: string;
}

export interface GroundedContext {
  ok: true;
  sufficient: boolean;
  results: OrgQueryResult[];
  scopes_searched: OrgQueryScope[];
  reason: string;
}

/**
 * What Otzar should call BEFORE it answers or acts: retrieve the relevant,
 * governed, evidence-bearing context for (caller, org, query) — and say plainly
 * when there ISN'T enough. Moves the agent from static prompt context to
 * data-grounded behaviour. It NEVER fabricates: it returns only real ledger rows
 * the caller is authorized to see, and flags insufficiency so the model can
 * decline rather than hallucinate.
 */
export async function groundContextForAgent(args: GroundContextArgs): Promise<GroundedContext> {
  const scopesSearched: OrgQueryScope[] = ["self"];
  const self = await queryOrgWork({
    org_entity_id: args.org_entity_id,
    caller_entity_id: args.caller_entity_id,
    is_manager: args.is_manager,
    scope: "self",
    query: args.query,
    limit: 8,
  });
  let results: OrgQueryResult[] = self.ok ? self.results : [];

  // A manager may also ground on org-wide work when their own record is thin.
  if (args.is_manager && results.length < 3) {
    scopesSearched.push("org");
    const org = await queryOrgWork({
      org_entity_id: args.org_entity_id,
      caller_entity_id: args.caller_entity_id,
      is_manager: args.is_manager,
      scope: "org",
      query: args.query,
      limit: 8,
    });
    if (org.ok) {
      const seen = new Set(results.map((r) => r.result_id));
      results = [...results, ...org.results.filter((r) => !seen.has(r.result_id))].slice(0, 10);
    }
  }

  const sufficient = results.length > 0;
  return {
    ok: true,
    sufficient,
    results,
    scopes_searched: scopesSearched,
    reason: sufficient
      ? `${results.length} governed, evidence-backed result(s) from the caller's authorized work record.`
      : "No governed context found for this query in the caller's authorized scope. Do not fabricate — say you don't have that information or ask for specifics.",
  };
}
