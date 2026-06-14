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
