// FILE: agent-abuse-guard.ts
// PURPOSE: GOVSEC.6 — pure-function guards against agent abuse and
//          confused-deputy attacks. Used at any boundary where an
//          AI agent (or Action runtime) is about to act on behalf
//          of, or in proximity to, another principal:
//
//            - Action create-time defense-in-depth check that
//              caller identity matches the Action's source_entity_id
//              (catches programming bugs that could leave a stale
//              source_entity_id; the structural path in
//              action.service.ts already sets this correctly, so
//              this guard is defense-in-depth).
//
//            - Future connector adapter (C2+) pre-flight that the
//              caller's tenant matches the adapter target tenant
//              (catches cross-tenant calls before they touch
//              an external API).
//
//            - AI-grantor invariants re-asserted at any call-site
//              that proposes a permission grant outside the canonical
//              packages/database createPermission path. The DB
//              query already enforces these invariants (RULE 0);
//              this module makes them available at higher layers
//              without round-tripping through the DB.
//
//          Pure functions. No DB I/O. No audit emission. No HTTP
//          coupling. Callers compose the result into their own
//          audit and error envelopes.
//
//          Closure target: ADR-0049 §GOVSEC.6 — AI-grantor rejection
//          + SESSION_ONLY-for-AI-grants enforced in code (already
//          live at packages/database/src/queries/permission.ts);
//          confused-deputy chains blocked; output-handling /
//          prompt-leak controls exist (reuses existing no-leak
//          guard). This module is the explicit composable surface
//          future connector + LLM runtime slices consume.
// CONNECTS TO: packages/database/src/queries/permission.ts
//              (sovereignty rules), apps/api/src/services/action/
//              action.service.ts (create-time caller identity),
//              future C2+ connector adapters.

// ────────────────────────────────────────────────────────────────
// Closed-vocabulary failure codes. Each is a stable string the
// caller can switch on without depending on the underlying
// Error message text.
// ────────────────────────────────────────────────────────────────
export type AgentAbuseGuardFailureCode =
  | "CALLER_NOT_ACTION_OWNER"
  | "AI_GRANTOR_TO_AI_GRANTEE"
  | "AI_GRANTOR_LONG_TERM_FORBIDDEN"
  | "AI_GRANTOR_PERMANENT_FORBIDDEN"
  | "CALLER_TENANT_MISMATCH"
  | "AI_AGENT_CONNECTOR_TARGET_UNAUTHORIZED";

// ────────────────────────────────────────────────────────────────
// Pure value types. Importers pass the smallest viable shape so
// the helpers stay decoupled from Prisma model shapes.
// ────────────────────────────────────────────────────────────────
export interface CallerIdentity {
  entity_id: string;
  entity_type: string;
  org_id: string | null;
}

export interface ActionRow {
  source_entity_id: string;
}

export interface AiGrantConstraintsInput {
  grantor_type: string;
  grantee_type: string;
  duration_type: "SESSION_ONLY" | "TEMPORARY" | "LONG_TERM" | "PERMANENT";
}

export interface ConnectorTargetTenant {
  org_id: string;
}

// ────────────────────────────────────────────────────────────────
// Discriminated-union result. Callers can `if (!result.ok)` and
// reach `result.code` + `result.reason` without text parsing.
// ────────────────────────────────────────────────────────────────
export type GuardResult =
  | { ok: true }
  | { ok: false; code: AgentAbuseGuardFailureCode; reason: string };

const OK: GuardResult = { ok: true };
function deny(code: AgentAbuseGuardFailureCode, reason: string): GuardResult {
  return { ok: false, code, reason };
}

// ────────────────────────────────────────────────────────────────
// 1. CONFUSED-DEPUTY at the Action runtime boundary.
//    The structural path in action.service.ts sets
//    source_entity_id = callerEntityId at create-time. This guard
//    is defense-in-depth: it asserts the invariant any time a
//    caller is about to act on, mutate, or run a handler against
//    an existing Action row. Bugs that load a stale row, or
//    a future code path that constructs an Action object without
//    going through action.service.ts, would be caught here.
// ────────────────────────────────────────────────────────────────
export function assertNotConfusedDeputy(
  caller: CallerIdentity,
  action: ActionRow,
): GuardResult {
  if (caller.entity_id !== action.source_entity_id) {
    return deny(
      "CALLER_NOT_ACTION_OWNER",
      "caller entity does not own this Action row",
    );
  }
  return OK;
}

// ────────────────────────────────────────────────────────────────
// 2. AI-GRANTOR invariants (RULE 0 sovereignty).
//    These are also enforced inside createPermission at the DB
//    tier; this helper makes them composable at any higher layer
//    (handler validation, future Twin-initiated grant proposal,
//    future connector-initiated grant proposal). The two layers
//    are not redundant — they are defense-in-depth and they let
//    the caller produce a closed-vocab error envelope without
//    parsing the DB exception text.
// ────────────────────────────────────────────────────────────────
export function assertAiGrantConstraints(
  input: AiGrantConstraintsInput,
): GuardResult {
  if (input.grantor_type === "AI_AGENT" && input.grantee_type === "AI_AGENT") {
    return deny(
      "AI_GRANTOR_TO_AI_GRANTEE",
      "AI_AGENT entities cannot grant permissions to other AI_AGENT entities",
    );
  }
  if (input.grantor_type === "AI_AGENT" && input.duration_type === "LONG_TERM") {
    return deny(
      "AI_GRANTOR_LONG_TERM_FORBIDDEN",
      "only PERSON entities can grant LONG_TERM access",
    );
  }
  if (
    input.grantor_type === "AI_AGENT" &&
    input.duration_type === "PERMANENT"
  ) {
    return deny(
      "AI_GRANTOR_PERMANENT_FORBIDDEN",
      "only PERSON entities can grant PERMANENT access",
    );
  }
  return OK;
}

// ────────────────────────────────────────────────────────────────
// 3. CROSS-TENANT denial for future connector adapters (C2+).
//    Future Slack / Google Workspace / Jira / Microsoft Graph /
//    GitHub adapters must call this before any external API
//    request. The check is structural: an entity with org_id X
//    must not be able to drive a connector binding whose target
//    org is Y, even if the binding row was somehow looked up
//    without an org filter. The runtime DB queries already
//    enforce per-org binding scope; this is the pre-flight
//    explicit assertion call-sites are encouraged to make.
// ────────────────────────────────────────────────────────────────
export function assertSameOrgConnectorTarget(
  caller: CallerIdentity,
  target: ConnectorTargetTenant,
): GuardResult {
  if (caller.org_id === null) {
    return deny(
      "CALLER_TENANT_MISMATCH",
      "caller has no org_id and cannot reach a tenant-scoped connector",
    );
  }
  if (caller.org_id !== target.org_id) {
    return deny(
      "CALLER_TENANT_MISMATCH",
      "caller org does not match connector target org",
    );
  }
  return OK;
}

// ────────────────────────────────────────────────────────────────
// 4. AI_AGENT direct connector invocation is denied at the
//    pre-flight layer. The expected path for an AI_AGENT to
//    cause a connector write is through the Action runtime with
//    an explicit PROPOSE_* handler under human approval. A direct
//    INVOKE_CONNECTOR by an AI_AGENT principal should be refused
//    at this pre-flight; the human approval flow then composes
//    on top by submitting the action as the human principal.
//    This matches ADR-0084 §2 read-first default + write-disabled
//    default discipline + ADR-0046 dual-context routing.
// ────────────────────────────────────────────────────────────────
export function assertAiAgentMayInvokeConnector(
  caller: CallerIdentity,
  options: { write_intent: boolean },
): GuardResult {
  if (caller.entity_type !== "AI_AGENT") return OK;
  if (options.write_intent) {
    return deny(
      "AI_AGENT_CONNECTOR_TARGET_UNAUTHORIZED",
      "AI_AGENT cannot directly invoke connector write actions; route through the Action runtime under human approval",
    );
  }
  // AI_AGENT may invoke read-first connectors only when the
  // surrounding Action runtime already proves human authorship
  // (source_entity_id resolves to a PERSON via a separate audited
  // path). Pre-flight permits read; consumers still gate via
  // workflow purpose binding + Map-region approval at runtime.
  return OK;
}
