// FILE: priming.ts
// PURPOSE: STEP 0 of conductSession. Runs 5 parallel queries
//          (Promise.allSettled) for the caller's working context,
//          formats them into a single string injected before Layer
//          1 of the assembly. Cached in Redis under
//          otzar:prime:{owner_entity_id} with TTL 300s. Per-query
//          failures degrade to "none" rather than tanking the whole
//          conductSession.
// CONNECTS TO: prisma (DECISION / IntelligencePattern /
//              ExternalEntity / COMMITMENT capsule queries),
//              KVCache (priming cache), otzar.service.ts.

import { prisma } from "@niov/database";
import type { KVCache } from "./cache.js";

// WHAT: How long the priming string stays cached.
const PRIMING_TTL_SECONDS = 300;

// WHAT: Successful return shape.
// INPUT: Used as a return type only.
// OUTPUT: None.
// WHY: cached=true on cache hit lets tests assert hit/miss; the
//      text field is the single string injected before Layer 1.
export interface PrimingResult {
  text: string;
  cached: boolean;
}

// WHAT: Item shapes produced by each subquery.
// INPUT: Used as return types from getXxxx helpers.
// OUTPUT: None.
// WHY: Typed so formatPrimingContext can render them without
//      re-parsing arbitrary shapes. Fields kept minimal -- the
//      LLM sees the rendered text, not the raw rows.
interface CommitmentItem { description: string; due_at: Date | null; }
interface EscalationItem { description: string; severity: string; }
interface DecisionItem { topic: string; outcome: string; }
interface PatternItem { pattern_type: string; description: string; }
interface ExternalItem { name: string; entity_type: string; }

// WHAT: Render the structured priming block from per-category
//        result lists. Empty result → "none" (consistent format
//        across cache hits/misses).
function formatPrimingContext(args: {
  commitments: CommitmentItem[];
  escalations: EscalationItem[];
  decisions: DecisionItem[];
  patterns: PatternItem[];
  externals: ExternalItem[];
}): string {
  const renderList = <T>(
    items: T[],
    render: (i: T) => string,
  ): string => (items.length === 0 ? "none" : items.map(render).join("; "));

  return [
    "[PRIMING CONTEXT]",
    `Active commitments due soon: ${renderList(
      args.commitments,
      (c) => `${c.description}${c.due_at ? ` (due ${c.due_at.toISOString()})` : ""}`,
    )}`,
    `Recent relevant decisions: ${renderList(
      args.decisions,
      (d) => `${d.topic}: ${d.outcome}`,
    )}`,
    `Patterns relevant to your work: ${renderList(
      args.patterns,
      (p) => `${p.pattern_type} -- ${p.description}`,
    )}`,
    `External entities in context: ${renderList(
      args.externals,
      (e) => `${e.name} (${e.entity_type})`,
    )}`,
    `Pending approvals: ${renderList(
      args.escalations,
      (e) => `[${e.severity}] ${e.description}`,
    )}`,
    "[END PRIMING]",
  ].join("\n");
}

// WHAT: Real "commitments due in N hours" query (Section 11C wire-up).
// INPUT: ownerEntityId, lookahead hours (typically 48).
// OUTPUT: COMMITMENT capsules in caller's wallet with
//         commitment_date in [now, now+lookaheadHours).
// WHY: Section 11C's observation pipeline writes COMMITMENT capsules
//      with structured commitment_date values parsed from LLM
//      extraction. This query closes the loop: priming surfaces the
//      caller's near-term commitments to the LLM at conversation
//      start. Capsules with null commitment_date (auto-close
//      degraded path, manual writes, etc.) are excluded by the
//      gte/lte filter naturally.
async function getCommitmentsDueSoon(
  ownerEntityId: string,
  lookaheadHours: number,
): Promise<CommitmentItem[]> {
  const wallet = await prisma.wallet.findUnique({
    where: { entity_id: ownerEntityId },
    select: { wallet_id: true },
  });
  if (wallet === null) return [];
  const now = new Date();
  const horizon = new Date(now.getTime() + lookaheadHours * 60 * 60 * 1000);
  const rows = await prisma.memoryCapsule.findMany({
    where: {
      wallet_id: wallet.wallet_id,
      capsule_type: "COMMITMENT",
      deleted_at: null,
      commitment_date: { gte: now, lte: horizon },
    },
    orderBy: { commitment_date: "asc" },
    take: 10,
    select: { payload_summary: true, commitment_date: true },
  });
  return rows.map((r) => ({
    description: r.payload_summary,
    due_at: r.commitment_date,
  }));
}

// WHAT: Stub for "pending escalations" query. Returns [].
// INPUT: ownerEntityId, top-N limit.
// OUTPUT: Always [] for 11B.
// WHY: EscalationRequest table doesn't exist yet. The Section 14
//      admin-tooling box introduces it. Until then this priming
//      slot stays "none".
//
// TODO(Section 14): Replace with prisma.escalationRequest.findMany
// where target_entity_id = ownerEntityId, status = "PENDING",
// order severity desc, take = limit.
async function getEscalationsPending(
  _ownerEntityId: string,
  _limit: number,
): Promise<EscalationItem[]> {
  return [];
}

// WHAT: DECISION capsules whose payload_summary contains tokens
//        from the current message. Real query for 11B; vector
//        similarity is Section 14+.
// INPUT: orgEntityId (null = caller is orgless), the message
//        text, max number to return.
// OUTPUT: Up to N DecisionItems sorted by created_at desc.
// WHY: Surfaces past decisions on similar topics so the LLM can
//      reference org precedent rather than re-deciding from
//      scratch. LIKE-based match is crude but cheap and behaves
//      predictably; vector similarity replaces this in Section 14+.
async function getRelevantDecisions(
  orgEntityId: string | null,
  message: string,
  limit: number,
): Promise<DecisionItem[]> {
  if (orgEntityId === null) return [];
  // Tokenize the message into useful keywords. Lowercase, drop
  // 1-2 char words, dedupe, take top 10.
  const tokens = Array.from(
    new Set(
      message
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length >= 3),
    ),
  ).slice(0, 10);
  if (tokens.length === 0) return [];
  // Find DECISION capsules in the org wallet where payload_summary
  // contains any of the tokens.
  const orgWallet = await prisma.wallet.findUnique({
    where: { entity_id: orgEntityId },
    select: { wallet_id: true },
  });
  if (orgWallet === null) return [];
  const rows = await prisma.memoryCapsule.findMany({
    where: {
      wallet_id: orgWallet.wallet_id,
      capsule_type: "DECISION",
      deleted_at: null,
      OR: tokens.map((t) => ({
        payload_summary: { contains: t, mode: "insensitive" as const },
      })),
    },
    orderBy: { created_at: "desc" },
    take: limit,
    select: { topic_tags: true, payload_summary: true },
  });
  return rows.map((r) => ({
    topic: r.topic_tags[0] ?? "untitled",
    outcome: r.payload_summary,
  }));
}

// WHAT: Active IntelligencePattern rows for the org.
// INPUT: orgEntityId, callerRole (unused in 11B until role-relevance
//        column lands), max number.
// OUTPUT: Up to N PatternItems by occurrence_count desc.
// WHY: Patterns surface recurring blockers / coordination failures
//      so the LLM can flag if the current message touches a known
//      issue. role_relevance filtering degrades to "any role" until
//      11C adds the column.
async function getActivePatterns(
  orgEntityId: string | null,
  _callerRole: string,
  limit: number,
): Promise<PatternItem[]> {
  if (orgEntityId === null) return [];
  const rows = await prisma.intelligencePattern.findMany({
    where: { org_entity_id: orgEntityId, status: "ACTIVE" },
    orderBy: { occurrence_count: "desc" },
    take: limit,
    select: { pattern_type: true, description: true },
  });
  return rows.map((r) => ({
    pattern_type: r.pattern_type,
    description: r.description,
  }));
}

// WHAT: ExternalEntity rows mentioned in the last lookback days.
// INPUT: orgEntityId, lookback days.
// OUTPUT: Up to 7 ExternalItems by last_mentioned desc.
// WHY: Lets the LLM recognize names from current external context
//      (clients, partners) the team has been engaging with recently.
async function getExternalEntitiesMentioned(
  orgEntityId: string | null,
  lookbackDays: number,
): Promise<ExternalItem[]> {
  if (orgEntityId === null) return [];
  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
  const rows = await prisma.externalEntity.findMany({
    where: {
      org_entity_id: orgEntityId,
      last_mentioned: { gte: since },
    },
    orderBy: { last_mentioned: "desc" },
    take: 7,
    select: { name: true, entity_type: true },
  });
  return rows.map((r) => ({ name: r.name, entity_type: r.entity_type }));
}

// WHAT: Get the priming string for a caller, fresh or cached.
// INPUT: ownerEntityId (the caller / employee), orgEntityId (org
//        the caller belongs to or null), callerRole, message,
//        cache.
// OUTPUT: PrimingResult with text + cached flag.
// WHY: Cache miss runs the 5 subqueries in Promise.allSettled
//      (one failure doesn't tank the rest), formats, caches.
//      Cache hit returns the cached string with cached=true so
//      tests can assert hit/miss.
//
// NESTED TRUNCATION: if priming text > 1500 tokens (which it
// shouldn't given per-category limits), trim categories in this
// order: externals → patterns → decisions → escalations →
// commitments. We don't compute tokens here -- the simple line
// limits above keep priming well under 1500 tokens in practice.
// Section 11C may revisit if richer subqueries push the total up.
export async function getPriming(args: {
  ownerEntityId: string;
  orgEntityId: string | null;
  callerRole: string;
  message: string;
  cache: KVCache;
}): Promise<PrimingResult> {
  const cacheKey = `otzar:prime:${args.ownerEntityId}`;
  const cached = await args.cache.get(cacheKey);
  if (cached !== null) {
    return { text: cached, cached: true };
  }
  // Run 5 subqueries in parallel. Promise.allSettled so one
  // failed query degrades gracefully to "none" rather than
  // crashing the whole priming computation.
  const settled = await Promise.allSettled([
    getCommitmentsDueSoon(args.ownerEntityId, 48),
    getEscalationsPending(args.ownerEntityId, 5),
    getRelevantDecisions(args.orgEntityId, args.message, 3),
    getActivePatterns(args.orgEntityId, args.callerRole, 3),
    getExternalEntitiesMentioned(args.orgEntityId, 7),
  ]);
  const valueOrEmpty = <T>(s: PromiseSettledResult<T[]>): T[] =>
    s.status === "fulfilled" ? s.value : [];
  const text = formatPrimingContext({
    commitments: valueOrEmpty(settled[0]!),
    escalations: valueOrEmpty(settled[1]!),
    decisions: valueOrEmpty(settled[2]!),
    patterns: valueOrEmpty(settled[3]!),
    externals: valueOrEmpty(settled[4]!),
  });
  await args.cache.set(cacheKey, text, PRIMING_TTL_SECONDS);
  return { text, cached: false };
}

export { formatPrimingContext, PRIMING_TTL_SECONDS };
