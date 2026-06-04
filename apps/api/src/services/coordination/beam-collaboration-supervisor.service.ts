// FILE: beam-collaboration-supervisor.service.ts
// PURPOSE: Phase 6 — TypeScript-side wrapper for the BEAM
//          Collaboration Handoff Supervisor per the [FOUNDER-AUTH —
//          COMPLETE FOUNDATION + OTZAR LIVE-TEST READINESS]
//          directive. Surfaces a SAFE supervised-status view for a
//          TwinCollaborationRequest. When BEAM is configured +
//          reachable, the wrapper asks the BEAM supervisor for its
//          live process state; otherwise it falls back to a
//          deterministic in-process projection built from the
//          existing Prisma row.
//
// DESIGN POSTURE (per directive):
//   - BEAM is NOT the policy authority. TypeScript / Foundation
//     governance remains the policy/API boundary.
//   - BEAM does NOT bypass approval / DMW scope / org policy /
//     employee revocation / audit.
//   - BEAM does NOT have side-effecting authority here — this
//     supervisor only reports status / health / next-tick
//     suggestion.
//   - When BEAM is disabled, unreachable, slow, or returns an
//     invalid shape, the wrapper falls back to the TS projection.
//     Today's live tests proceed without distributed Erlang.
//
// CONNECTS TO:
//   - apps/api/src/services/otzar/twin-collaboration.service.ts
//     (existing collaboration substrate; the BEAM supervisor
//     observes its lifecycle)
//   - packages/database (prisma.twinCollaborationRequest)

import { prisma } from "@niov/database";
import type { TwinCollaborationState } from "@prisma/client";

// WHAT: Provider state — closed-vocab so the consumer can switch on
//        whether BEAM coordination is actually live without parsing
//        free-form labels.
export type BeamProviderMode =
  | "DISABLED"
  | "READY_NOT_ACTIVE"
  | "ACTIVE"
  | "UNREACHABLE";

// WHAT: Closed-vocab next-tick suggestion the supervisor returns so
//        the consumer (e.g., a future MyTwinView panel) knows what
//        the supervisor would do next if it were live.
export type SupervisedNextTick =
  | "NONE"
  | "AWAIT_TARGET_ACCEPT"
  | "AWAIT_TARGET_RESPONSE"
  | "AWAIT_REQUESTER_COMPLETE"
  | "AWAIT_APPROVAL"
  | "RESURFACE_TO_REQUESTER"
  | "TERMINAL_NO_ACTION";

export interface BeamCollaborationSupervisedStatus {
  collaboration_id: string;
  state: TwinCollaborationState;
  provider_mode: BeamProviderMode;
  next_tick: SupervisedNextTick;
  has_blocked_reason: boolean;
  // ISO timestamp of when the supervisor (or fallback) last
  // computed this status. Always populated.
  observed_at: string;
}

export type SupervisedStatusResult =
  | { ok: true; status: BeamCollaborationSupervisedStatus }
  | {
      ok: false;
      code: "COLLABORATION_NOT_FOUND";
    };

// WHAT: Pure mapping from collaboration state → recommended next
//        tick the supervisor would emit. Used both by the
//        TypeScript fallback AND by the validator over the BEAM
//        response so the supervisor cannot return free-form / unsafe
//        next-tick values.
export function deriveNextTickForState(
  state: TwinCollaborationState,
  hasBlockedReason: boolean,
): SupervisedNextTick {
  if (hasBlockedReason || state === "BLOCKED") return "NONE";
  switch (state) {
    case "REQUESTED":
      return "AWAIT_TARGET_ACCEPT";
    case "ACCEPTED":
    case "IN_PROGRESS":
      return "AWAIT_TARGET_RESPONSE";
    case "NEEDS_APPROVAL":
      return "AWAIT_APPROVAL";
    case "COMPLETED":
    case "REJECTED":
    case "EXPIRED":
    case "CANCELED":
      return "TERMINAL_NO_ACTION";
  }
}

// WHAT: Validate the BEAM supervisor response shape. Defensive —
//        when the schema is wrong, the wrapper falls back to the
//        TS projection.
export interface BeamResponseShape {
  state: TwinCollaborationState;
  next_tick: SupervisedNextTick;
  has_blocked_reason: boolean;
  observed_at?: string;
}

export function validateBeamResponse(raw: unknown): BeamResponseShape | null {
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as {
    state?: unknown;
    next_tick?: unknown;
    has_blocked_reason?: unknown;
    observed_at?: unknown;
  };
  const ALLOWED_STATES: ReadonlySet<TwinCollaborationState> = new Set([
    "REQUESTED",
    "ACCEPTED",
    "NEEDS_APPROVAL",
    "BLOCKED",
    "IN_PROGRESS",
    "COMPLETED",
    "REJECTED",
    "EXPIRED",
    "CANCELED",
  ]);
  const ALLOWED_NEXT_TICKS: ReadonlySet<SupervisedNextTick> = new Set([
    "NONE",
    "AWAIT_TARGET_ACCEPT",
    "AWAIT_TARGET_RESPONSE",
    "AWAIT_REQUESTER_COMPLETE",
    "AWAIT_APPROVAL",
    "RESURFACE_TO_REQUESTER",
    "TERMINAL_NO_ACTION",
  ]);
  if (
    typeof obj.state !== "string" ||
    !ALLOWED_STATES.has(obj.state as TwinCollaborationState)
  )
    return null;
  if (
    typeof obj.next_tick !== "string" ||
    !ALLOWED_NEXT_TICKS.has(obj.next_tick as SupervisedNextTick)
  )
    return null;
  if (typeof obj.has_blocked_reason !== "boolean") return null;
  return {
    state: obj.state as TwinCollaborationState,
    next_tick: obj.next_tick as SupervisedNextTick,
    has_blocked_reason: obj.has_blocked_reason,
    ...(typeof obj.observed_at === "string"
      ? { observed_at: obj.observed_at }
      : {}),
  };
}

// WHAT: BEAM runtime configuration knobs. Used by tests to inject
//        fixtures deterministically.
export interface BeamRuntimeConfig {
  beamUrl?: string | null;
  enabled?: boolean;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

const DEFAULT_BEAM_TIMEOUT_MS = 800;

// WHAT: Get supervised status for a collaboration row.
// INPUT: collaboration_id + optional runtime config.
// OUTPUT: SupervisedStatusResult.
// WHY: Phase 6 first safe slice — the BEAM supervisor observes the
//      collaboration lifecycle without bypassing TS-side gates.
//      When BEAM is off / unreachable / invalid, the wrapper
//      returns a status derived from the existing Prisma row so
//      consumers always see a consistent shape.
export async function getCollaborationSupervisedStatus(
  collaborationId: string,
  runtime: BeamRuntimeConfig = {},
): Promise<SupervisedStatusResult> {
  const row = await prisma.twinCollaborationRequest.findUnique({
    where: { collaboration_id: collaborationId },
    select: {
      collaboration_id: true,
      state: true,
      blocked_reason: true,
    },
  });
  if (row === null) return { ok: false, code: "COLLABORATION_NOT_FOUND" };

  const beamEnabled =
    runtime.enabled ?? process.env.BEAM_RUNTIME_ENABLED === "true";
  const beamUrl =
    runtime.beamUrl ?? process.env.BEAM_RUNTIME_URL ?? null;

  if (!beamEnabled) {
    return {
      ok: true,
      status: buildFallbackStatus(row, "DISABLED"),
    };
  }
  if (beamUrl === null || beamUrl.length === 0) {
    return {
      ok: true,
      status: buildFallbackStatus(row, "READY_NOT_ACTIVE"),
    };
  }

  const timeoutMs = runtime.timeoutMs ?? DEFAULT_BEAM_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const fetchFn = runtime.fetchImpl ?? fetch;
  try {
    const response = await fetchFn(
      `${beamUrl}/supervised-status/${encodeURIComponent(collaborationId)}`,
      { signal: controller.signal },
    );
    if (!response.ok) {
      return {
        ok: true,
        status: buildFallbackStatus(row, "UNREACHABLE"),
      };
    }
    const raw = (await response.json()) as unknown;
    const validated = validateBeamResponse(raw);
    if (validated === null) {
      return {
        ok: true,
        status: buildFallbackStatus(row, "UNREACHABLE"),
      };
    }
    return {
      ok: true,
      status: {
        collaboration_id: row.collaboration_id,
        state: validated.state,
        provider_mode: "ACTIVE",
        next_tick: validated.next_tick,
        has_blocked_reason: validated.has_blocked_reason,
        observed_at: validated.observed_at ?? new Date().toISOString(),
      },
    };
  } catch {
    return {
      ok: true,
      status: buildFallbackStatus(row, "UNREACHABLE"),
    };
  } finally {
    clearTimeout(timer);
  }
}

function buildFallbackStatus(
  row: {
    collaboration_id: string;
    state: TwinCollaborationState;
    blocked_reason: string | null;
  },
  providerMode: BeamProviderMode,
): BeamCollaborationSupervisedStatus {
  const hasBlocked = row.blocked_reason !== null;
  return {
    collaboration_id: row.collaboration_id,
    state: row.state,
    provider_mode: providerMode,
    next_tick: deriveNextTickForState(row.state, hasBlocked),
    has_blocked_reason: hasBlocked,
    observed_at: new Date().toISOString(),
  };
}
