// FILE: beam-fabric-client.ts
// PURPOSE: Phase 1281 — governed BEAM coordination dispatch. When a
//          WorkLedgerEntry is created, Foundation emits a WorkOsEvent to
//          the BEAM coordination fabric (collaboration_supervisor
//          POST /events/work-os) IF BEAM is healthy. BEAM coordinates /
//          fans out / classifies watchdogs only — it NEVER executes an
//          external write and is NEVER a policy authority. Honest:
//          ledger creation does not depend on this; dispatch failure is
//          recorded, never faked as success.
// CONNECTS TO: work-os/work-ledger.service.ts (createLedgerEntry),
//          apps/collaboration_supervisor router /events/work-os.
//
// SECURITY: reads only BEAM_RUNTIME_URL/ENABLED (names, not printed);
// the event payload carries ids + safe scalars only — no tokens/secrets.

export type CoordinationRuntime =
  | "TYPESCRIPT_ONLY"
  | "BEAM_DISPATCHED"
  | "BEAM_UNAVAILABLE"
  | "BEAM_FAILED";

export interface WorkOsEvent {
  event_id: string;
  org_entity_id: string;
  ledger_entry_id: string;
  event_type: string;
  ledger_type: string;
  status: string;
  priority: string;
  source_type: string;
  extraction_source: string;
  work_plan_id?: string;
  owner_entity_id?: string;
  requester_entity_id?: string;
  target_entity_id?: string;
  next_action?: string;
  due_at?: string;
  audit_required: true;
  created_at: string;
}

export interface BeamDispatchConfig {
  enabled?: boolean;
  beamUrl?: string | null;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface BeamDispatchResult {
  coordination_runtime: CoordinationRuntime;
  event_id: string;
  watcher?: string;
  error_code?: string;
}

const DEFAULT_TIMEOUT_MS = 2_000;

// WHAT: Dispatch one WorkOsEvent to the BEAM fabric (best-effort).
// OUTPUT: BEAM_DISPATCHED on a 2xx accept; BEAM_UNAVAILABLE when BEAM is
//         off/unaddressed; BEAM_FAILED on a network/non-2xx error. Never
//         throws — the caller's ledger write must not depend on this.
export async function dispatchWorkOsEvent(
  event: WorkOsEvent,
  config: BeamDispatchConfig = {},
): Promise<BeamDispatchResult> {
  const enabled = config.enabled ?? process.env.BEAM_RUNTIME_ENABLED === "true";
  const beamUrl = config.beamUrl ?? process.env.BEAM_RUNTIME_URL ?? null;
  if (!enabled || beamUrl === null || beamUrl.length === 0) {
    return { coordination_runtime: "BEAM_UNAVAILABLE", event_id: event.event_id };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const fetchFn = config.fetchImpl ?? fetch;
  try {
    const res = await fetchFn(`${beamUrl}/events/work-os`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // The BEAM /events/work-os contract keys the tenant as `tenant_id`;
      // Foundation's tenant IS org_entity_id. Send both so the event
      // validates (BEAM 422s a payload missing tenant_id) while the
      // org_entity_id field remains for any consumer that reads it.
      body: JSON.stringify({ ...event, tenant_id: event.org_entity_id }),
      signal: controller.signal,
    });
    if (!res.ok) {
      return {
        coordination_runtime: "BEAM_FAILED",
        event_id: event.event_id,
        error_code: `http_${res.status}`,
      };
    }
    let watcher: string | undefined;
    try {
      const json = (await res.json()) as { watcher?: unknown };
      if (typeof json.watcher === "string") watcher = json.watcher;
    } catch {
      /* a 2xx with an unreadable body is still an accept */
    }
    return {
      coordination_runtime: "BEAM_DISPATCHED",
      event_id: event.event_id,
      ...(watcher !== undefined ? { watcher } : {}),
    };
  } catch {
    return {
      coordination_runtime: "BEAM_FAILED",
      event_id: event.event_id,
      error_code: "fetch_failed",
    };
  } finally {
    clearTimeout(timer);
  }
}

// ── Watcher actor bridge (Phase 1287-B) ─────────────────────────────────────
// Foundation sends a bounded, SCOPED candidate set (derived from its own
// deterministic watcher findings) to the long-lived BEAM watcher actor and
// receives ADVISORY candidate findings. Foundation re-validates every candidate
// (id ∈ allowed set, watcher_type matches the deterministic finding, closed-vocab
// severity, safe text) before anything is surfaced. Honest status, never throws.

export type BeamWatcherStatus =
  | "BEAM_ENRICHED"
  | "NOT_CONFIGURED"
  | "UNHEALTHY"
  | "TIMEOUT"
  | "ERROR";

// The safe candidate Foundation sends (ids + closed-vocab + signals only).
export interface BeamWatcherCandidateInput {
  candidate_id: string;
  watcher_type: string;
  severity: string;
  status?: string;
  age_hours?: number | null;
  overdue?: boolean;
  blocked?: boolean;
  waiting_on?: boolean;
  no_next_action?: boolean;
}

// One advisory candidate BEAM returns.
export interface BeamWatcherCandidate {
  candidate_id: string;
  watcher_type: string;
  severity: string;
  reason: string;
  recommendation: string;
  confidence: string;
  source: string; // "BEAM_ADVISORY"
}

export interface BeamWatcherResult {
  status: BeamWatcherStatus;
  candidates: BeamWatcherCandidate[];
  correlation_id: string;
  actor_id: string | null;
  evaluated_at: string | null;
}

const WATCHER_TYPES = ["OVERDUE_WORK", "UNRESOLVED_BLOCKER", "STALE_WAITING_ON", "NO_NEXT_ACTION"];
const WATCHER_SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

function emptyWatcher(status: BeamWatcherStatus, correlation_id: string): BeamWatcherResult {
  return { status, candidates: [], correlation_id, actor_id: null, evaluated_at: null };
}

// WHAT: validate a raw BEAM watcher response into a closed-vocab result.
// WHY: BEAM is advisory; Foundation refuses to trust anything not closed-vocab.
//      reason/recommendation are length-capped defensively. (Authoritative
//      id/scope validation happens in the watcher service against the allowed
//      set — this is shape validation only.)
function validateWatcherResponse(raw: unknown, correlation_id: string): BeamWatcherResult | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.candidates)) return null;
  const candidates: BeamWatcherCandidate[] = [];
  for (const item of o.candidates) {
    if (typeof item !== "object" || item === null) continue;
    const c = item as Record<string, unknown>;
    if (typeof c.candidate_id !== "string" || c.candidate_id.length === 0) continue;
    if (!WATCHER_TYPES.includes(c.watcher_type as string)) continue;
    candidates.push({
      candidate_id: c.candidate_id,
      watcher_type: c.watcher_type as string,
      severity: WATCHER_SEVERITIES.includes(c.severity as string) ? (c.severity as string) : "MEDIUM",
      reason: typeof c.reason === "string" ? c.reason.slice(0, 200) : "",
      recommendation: typeof c.recommendation === "string" ? c.recommendation.slice(0, 200) : "",
      confidence: typeof c.confidence === "string" && c.confidence.length > 0 ? c.confidence : "MEDIUM",
      source: typeof c.source === "string" ? c.source : "BEAM_ADVISORY",
    });
  }
  return {
    status: "BEAM_ENRICHED",
    candidates,
    correlation_id: typeof o.correlation_id === "string" ? o.correlation_id : correlation_id,
    actor_id: typeof o.actor_id === "string" ? o.actor_id : null,
    evaluated_at: typeof o.evaluated_at === "string" ? o.evaluated_at : null,
  };
}

// WHAT: ask the long-lived BEAM watcher actor to confirm + score a bounded,
//        scoped candidate set. Never throws; honest status when BEAM is off /
//        unhealthy / slow / drifting.
export async function evaluateWatchersOnBeam(
  input: { tenant_id: string; correlation_id: string; candidates: BeamWatcherCandidateInput[] },
  config: BeamDispatchConfig = {},
): Promise<BeamWatcherResult> {
  const enabled = config.enabled ?? process.env.BEAM_RUNTIME_ENABLED === "true";
  const beamUrl = config.beamUrl ?? process.env.BEAM_RUNTIME_URL ?? null;
  if (!enabled || beamUrl === null || beamUrl.length === 0) {
    return emptyWatcher("NOT_CONFIGURED", input.correlation_id);
  }
  if (input.candidates.length === 0) {
    return emptyWatcher("BEAM_ENRICHED", input.correlation_id); // nothing to evaluate, no call
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const fetchFn = config.fetchImpl ?? fetch;
  try {
    const res = await fetchFn(`${beamUrl}/watchers/evaluate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenant_id: input.tenant_id,
        correlation_id: input.correlation_id,
        candidates: input.candidates,
      }),
      signal: controller.signal,
    });
    if (!res.ok) return emptyWatcher("ERROR", input.correlation_id);
    const raw = (await res.json()) as unknown;
    return validateWatcherResponse(raw, input.correlation_id) ?? emptyWatcher("ERROR", input.correlation_id);
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return emptyWatcher(aborted ? "TIMEOUT" : "UNHEALTHY", input.correlation_id);
  } finally {
    clearTimeout(timer);
  }
}

// Map a ledger_type to the WorkOsEvent event_type.
export function eventTypeForLedger(ledgerType: string, status: string): string {
  if (status === "BLOCKED") return "BLOCKER_CREATED";
  if (status === "NEEDS_PARTICIPANT_CONFIRMATION") return "PARTICIPANT_CONFIRMATION_REQUIRED";
  if (status === "NEEDS_APPROVAL") return "APPROVAL_REQUIRED";
  switch (ledgerType) {
    case "FOLLOW_UP":
      return "FOLLOW_UP_CREATED";
    case "TASK":
      return "TASK_CREATED";
    case "MEETING":
      return "MEETING_PROPOSAL_CREATED";
    case "COMMITMENT":
      return "COMMITMENT_CREATED";
    default:
      return "WORK_LEDGER_ENTRY_CREATED";
  }
}
