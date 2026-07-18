// FILE: responsibility-graph.ts
// PURPOSE: [SECTION-12-WORKGRAPH] Build a transcript responsibility graph BEFORE
//          generating follow-up cards. Otzar must understand the work structure
//          — who leads, who owns, who supports, who reviews, who is optional,
//          who is excluded — not just a flat list of tasks. The graph then
//          drives card generation (a lead gets a coordination card, not a random
//          IC task) and feeds the recipient-governance gate (an owner/support
//          relation is a work-connection proof path).
//
//          DETERMINISTIC + PURE: this parses explicit linguistic signals
//          (assignment / leadership / support / review / approval phrasing). It
//          does not invent relationships and does not fuzzy-match — a person is
//          only placed in the graph when the transcript explicitly connects them
//          to the work. No hardcoded people; the fixture names are test data
//          only.
// CONNECTS TO: comms-extract.service.ts (graph drives card generation),
//              recipient-governance.ts (work-connection proof),
//              tests/unit/responsibility-graph.test.ts.

export type ResponsibilityRole =
  | "meeting_lead"
  | "founder_context_authority"
  | "owner"
  | "support"
  | "reviewer"
  | "approver"
  | "optional_advisor";

export interface ResponsibilityNode {
  /** The name token as it appears in the transcript (e.g. "David", "Shiney"). */
  name: string;
  role: ResponsibilityRole;
  /** Short description of the work they own/support, when extractable. */
  workItem: string | null;
  /** The transcript span that established this relation (the proof quote). */
  evidence: string;
  confidence: "high" | "medium" | "low";
}

export interface ResponsibilityGraph {
  lead: ResponsibilityNode | null;
  founderAuthority: ResponsibilityNode | null;
  nodes: ResponsibilityNode[];
}

const NAME = "([A-Z][A-Za-z]+)";

function sentences(text: string): string[] {
  return text
    .replace(/\n+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function firstGroup(s: string, re: RegExp): { name: string; quote: string } | null {
  const m = s.match(re);
  if (m && m[1]) return { name: m[1], quote: s };
  return null;
}

// Leadership: "let David step in and lead", "David will lead the call", "hand
// the call (over) to David", "David is leading", "David, can you lead".
// NOTE: patterns are CASE-SENSITIVE — names must be capitalized ([A-Z]...), so a
// lowercase word like "the" can never be captured as a name. Only sentence-
// initial keywords are made case-tolerant (e.g. [Ll]et) since the rest are
// lowercase mid-sentence after a capitalized name.

// Leading the MEETING (the call/discussion/push) — distinct from "lead the team
// on <work>", which is ownership. The meeting object is required for the
// "X will/is going to lead" form so it never swallows an ownership sentence.
const LEAD_PATTERNS: RegExp[] = [
  new RegExp(`[Ll]et ${NAME}\\s+(?:step in and\\s+)?lead`),
  new RegExp(`[Hh]and(?:ing|ed)?\\s+(?:the\\s+)?(?:call|meeting)\\s+(?:over\\s+)?to ${NAME}`),
  new RegExp(`${NAME}\\s+(?:will|to|can|is going to)\\s+lead\\s+(?:the|this)\\s+(?:call|meeting|push|discussion|execution)`),
  new RegExp(`${NAME}\\s+is\\s+leading\\s+(?:the|this)\\s+(?:call|meeting|push|discussion|execution)`),
  new RegExp(`${NAME},?\\s+(?:can|could|please)\\s+you\\s+lead`),
  new RegExp(`${NAME}\\s+(?:will|to)\\s+coordinat`),
];

// Ownership / focal point: "Shiney is going to lead the team on X", "you are the
// focal point", "X owns Y", "X is the focal point", "X is responsible for Y".
// Enterprise-natural commitments: "David will complete the UI review",
// "Vishesh will ship ambient polish", "Annie will prepare the pack".
// Do NOT swallow support ("will support") or meeting lead ("will lead the call")
// — those patterns run first / separately with higher or distinct verbs.
const OWNER_ACTION =
  "(?:complete|ship|deliver|handle|finish|implement|build|write|send|prepare|draft|own|drive|run|fix|take|fix)";
const OWNER_PATTERNS: RegExp[] = [
  new RegExp(`${NAME}\\s+is going to lead the team`),
  new RegExp(`${NAME}\\s+is\\s+(?:the\\s+)?focal point`),
  new RegExp(`${NAME}\\s+owns?\\b`),
  new RegExp(`${NAME}\\s+is\\s+responsible for`),
  new RegExp(`${NAME}\\s+will own`),
  new RegExp(`${NAME}\\s+(?:will|is going to)\\s+${OWNER_ACTION}\\b`),
  // Speaker self-claim after attribution: "David: I own the UI review."
  new RegExp(`${NAME}:\\s+(?:.*\\b)?I\\s+(?:own|will own|will ${OWNER_ACTION})\\b`),
  // "… is mine" after speaker label (Vishesh: ambient orb polish is mine).
  new RegExp(`${NAME}:\\s+.*\\bis mine\\b`, "i"),
];

const SUPPORT_PATTERNS: RegExp[] = [
  new RegExp(`${NAME}\\s+(?:will|to|can)\\s+support`),
  new RegExp(`${NAME}\\s+is\\s+support(?:ing)?`),
  new RegExp(`${NAME}\\s+(?:will|can)\\s+help(?:\\s+with)?`),
  new RegExp(`${NAME}\\s+(?:will|to)\\s+assist`),
  new RegExp(`[Pp]ull in ${NAME}`),
];

const REVIEW_PATTERNS: RegExp[] = [
  new RegExp(`${NAME}\\s+(?:will|to|can)\\s+review`),
  new RegExp(`${NAME}\\s+is\\s+reviewing`),
];

const APPROVER_PATTERNS: RegExp[] = [
  new RegExp(`${NAME}\\s+(?:needs to|will|must)\\s+approve`),
  new RegExp(`[Gg]et ${NAME}(?:'s)?\\s+approval`),
];

const OPTIONAL_PATTERNS: RegExp[] = [
  new RegExp(`${NAME}\\s+is\\s+optional`),
  new RegExp(`${NAME}\\s+(?:can|may)\\s+(?:optionally\\s+)?advise`),
  new RegExp(`${NAME}\\s+for\\s+(?:optional|extra)\\s+`),
  new RegExp(`[Oo]ptionally,?\\s+${NAME}`),
];

const FOUNDER_PATTERNS: RegExp[] = [
  new RegExp(`${NAME}\\s+(?:hand|hands|handed|handing)`), // the person who hands off the call
];

// Try to extract a short work-item phrase after "on/for/with <work>".
function workItemOf(sentence: string): string | null {
  const m = sentence.match(/\b(?:on|for|with)\s+(?:the\s+)?([a-zA-Z][\w\s/-]{2,40}?)(?:[.,;]|$)/);
  return m && m[1] ? m[1].trim() : null;
}

function matchAny(
  sentence: string,
  patterns: RegExp[],
): { name: string; quote: string } | null {
  for (const re of patterns) {
    const hit = firstGroup(sentence, re);
    if (hit) return hit;
  }
  return null;
}

/** Build the responsibility graph from a transcript. Deterministic; only places
 *  a person when the transcript explicitly connects them to the work. */
export function buildResponsibilityGraph(transcript: string): ResponsibilityGraph {
  const sents = sentences(transcript);
  const byName = new Map<string, ResponsibilityNode>();
  let lead: ResponsibilityNode | null = null;
  let founderAuthority: ResponsibilityNode | null = null;

  // Role precedence: a meeting_lead/owner assignment outranks a support mention.
  const rank: Record<ResponsibilityRole, number> = {
    meeting_lead: 6,
    owner: 5,
    approver: 4,
    reviewer: 3,
    support: 2,
    optional_advisor: 1,
    founder_context_authority: 0,
  };

  const place = (
    name: string,
    role: ResponsibilityRole,
    quote: string,
    confidence: ResponsibilityNode["confidence"],
  ): ResponsibilityNode => {
    const existing = byName.get(name);
    const node: ResponsibilityNode = {
      name,
      role,
      workItem: workItemOf(quote),
      evidence: quote,
      confidence,
    };
    if (existing === undefined || rank[role] > rank[existing.role]) {
      byName.set(name, node);
      return node;
    }
    return existing;
  };

  for (const s of sents) {
    const leadHit = matchAny(s, LEAD_PATTERNS);
    if (leadHit) {
      const node = place(leadHit.name, "meeting_lead", leadHit.quote, "high");
      if (lead === null) lead = node;
      continue; // a lead sentence shouldn't double-count as ownership
    }
    const founderHit = matchAny(s, FOUNDER_PATTERNS);
    if (founderHit && founderHit.name !== (lead?.name ?? "")) {
      // The person handing off the call is the founder/context authority.
      const node = place(founderHit.name, "founder_context_authority", founderHit.quote, "medium");
      if (founderAuthority === null) founderAuthority = node;
    }
    const ownerHit = matchAny(s, OWNER_PATTERNS);
    if (ownerHit) { place(ownerHit.name, "owner", ownerHit.quote, "high"); continue; }
    const approverHit = matchAny(s, APPROVER_PATTERNS);
    if (approverHit) { place(approverHit.name, "approver", approverHit.quote, "high"); continue; }
    const reviewHit = matchAny(s, REVIEW_PATTERNS);
    if (reviewHit) { place(reviewHit.name, "reviewer", reviewHit.quote, "medium"); continue; }
    const optionalHit = matchAny(s, OPTIONAL_PATTERNS);
    if (optionalHit) { place(optionalHit.name, "optional_advisor", optionalHit.quote, "medium"); continue; }
    const supportHit = matchAny(s, SUPPORT_PATTERNS);
    if (supportHit) { place(supportHit.name, "support", supportHit.quote, "medium"); continue; }
  }

  return { lead, founderAuthority, nodes: Array.from(byName.values()) };
}

/**
 * WHAT: When the transcript graph is thin but LLM/demo extraction already
 *       listed clear commitments (and optional resolved follow-up targets),
 *       place owner nodes so planWorkItems can fan owned work into My Work.
 * WHY:  Ambient/LLM paths often extract "David will complete X" as a commitment
 *       string without the deterministic OWNER_PATTERNS firing (punctuation,
 *       speaker labels). Network-effect requires each proven owner to get a
 *       COMMITMENT row — FOLLOW_UP alone is the sender's draft, not their work.
 * NEVER invents people: only uses names already present in commitment text or
 *       a RESOLVED suggested-action target with a real entity_id.
 */
export function enrichResponsibilityGraphFromExtraction(
  graph: ResponsibilityGraph,
  args: {
    commitments: readonly string[];
    suggested_actions?: ReadonlyArray<{
      target: {
        display_name: string;
        entity_id: string | null;
      };
      source_excerpt: string | null;
      draft_text: string;
      resolution_status: string;
    }>;
  },
): ResponsibilityGraph {
  const byName = new Map<string, ResponsibilityNode>();
  for (const n of graph.nodes) byName.set(n.name.toLowerCase(), n);

  const placeOwner = (
    name: string,
    workItem: string | null,
    evidence: string,
  ): void => {
    const key = name.toLowerCase();
    const existing = byName.get(key);
    if (existing !== undefined && existing.role === "owner") return;
    if (existing !== undefined && existing.role === "meeting_lead") return;
    byName.set(key, {
      name: name.trim(),
      role: "owner",
      workItem,
      evidence,
      confidence: "medium",
    });
  };

  for (const c of args.commitments) {
    const text = c.trim();
    if (text.length === 0) continue;
    // "David will …" / "David Odie will …" / "David owns …"
    const m = text.match(
      new RegExp(
        `^${NAME}(?:\\s+${NAME})?\\s+(?:will|owns?|is responsible for|is going to)\\b`,
      ),
    );
    if (m && m[1]) {
      const name = m[1];
      const rest = text.replace(new RegExp(`^${name}(?:\\s+[A-Z][A-Za-z]+)?\\s+`), "").trim();
      placeOwner(name, rest.length > 0 ? rest : null, text);
    }
  }

  for (const a of args.suggested_actions ?? []) {
    if (a.resolution_status !== "RESOLVED" || a.target.entity_id === null) continue;
    const first =
      a.target.display_name.trim().split(/\s+/)[0] ?? a.target.display_name.trim();
    if (!/^[A-Z][A-Za-z]+$/.test(first)) continue;
    const evidence = a.source_excerpt?.trim() || a.draft_text;
    // Prefer matching commitment text for workItem; else draft snippet.
    const matchingCommitment = args.commitments.find((c) =>
      c.toLowerCase().includes(first.toLowerCase()),
    );
    placeOwner(
      first,
      matchingCommitment ?? a.draft_text.slice(0, 80),
      evidence,
    );
  }

  return {
    lead: graph.lead,
    founderAuthority: graph.founderAuthority,
    nodes: Array.from(byName.values()),
  };
}

/** Compose the lead's coordination card body from the graph — references the
 *  team's owners/supporters, NOT a random IC task. Returns null when there is no
 *  detected lead. */
export function buildLeadCoordinationCard(
  graph: ResponsibilityGraph,
): { lead: string; body: string; tracks: Array<{ name: string; role: ResponsibilityRole; workItem: string | null }> } | null {
  if (graph.lead === null) return null;
  const tracks = graph.nodes
    .filter((n) => n.name !== graph.lead!.name && n.role !== "founder_context_authority")
    .map((n) => ({ name: n.name, role: n.role, workItem: n.workItem }));
  const trackPhrases = tracks.map((t) => {
    const what = t.workItem ? ` (${t.workItem})` : "";
    const verb =
      t.role === "owner" ? "owns" : t.role === "support" ? "supports" : t.role === "reviewer" ? "reviews" : t.role === "approver" ? "approves" : "is on";
    return `${t.name} ${verb}${what}`;
  });
  const body =
    `${graph.lead.name} is leading this push.` +
    (trackPhrases.length > 0 ? ` Track: ${trackPhrases.join("; ")}.` : "");
  return { lead: graph.lead.name, body, tracks };
}
