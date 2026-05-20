// FILE: moment-context.service.ts
// PURPOSE: Foundation/COSMP moment-context resolver for the
//          personalization-orchestration substrate (ADR-0048 Phase 3
//          Sub-Arc 3; PERS.2 per Q-PERS.2-δ + Q-PERS.2-ζ). Returns a
//          typed moment-context envelope from an injected `now`, a
//          resolved timezone (EntityProfile / session / caller input
//          with a clearly-marked safe fallback), and permissioned
//          OPTIONAL caller inputs (location / calendar / device / active
//          app / current task) — degrading gracefully (typed absence, no
//          hallucinated specificity) when a signal is missing or denied.
//
// CONNECTS TO:
//   - apps/api/src/services/personalization/temporal-personalization.ts
//     (per-field TTL/freshness from the temporal class policy)
//   - apps/api/src/services/personalization/permission-envelope.service.ts
//     (the resolved envelope decides which moment fields may be
//     populated)
//   - docs/architecture/decisions/0048-personalization-orchestration-substrate.md
//     (§Hybrid API Strategy resolveMomentContext; Q-PERS.2-δ + ζ)
//
// Pure deterministic TypeScript (Q-PERS.2-θ): `now` is injected (no
// Date.now()); NO external calendar/location/weather provider calls; NO
// network; NO production data access; NO Elixir. Referentially
// transparent; portable to a future Elixir register per ADR-0028
// forward-substrate.

import type {
  PermissionEnvelope,
  ResolvedContextKey,
} from "./permission-envelope.service.js";
import type { TemporalClass } from "./temporal-personalization.js";
import { getTemporalPolicy } from "./temporal-personalization.js";

// WHAT: Safe fallback timezone used ONLY when no timezone is resolvable.
// WHY: Matches EntityProfile.timezone @default("America/New_York") so a
//      missing timezone degrades to a known, explicitly-marked fallback
//      rather than failing — but it is flagged `fallback: true` +
//      `uncertain: true` so downstream never presents it as user truth
//      (Q-PERS.2-δ + ζ).
export const SAFE_FALLBACK_TIMEZONE = "America/New_York";

// WHAT: Where the resolved timezone came from.
// WHY: The caller / PERS.4 needs provenance so a fallback timezone is
//      never mistaken for a user-confirmed value.
export type TimezoneSource =
  | "caller_input"
  | "entity_profile"
  | "session"
  | "fallback_default";

// WHAT: A resolved timezone with provenance + uncertainty marking.
// WHY: Q-PERS.2-δ — safe fallback must be marked fallback/uncertain and
//      must not be presented as user truth.
export interface ResolvedTimezone {
  readonly value: string;
  readonly source: TimezoneSource;
  readonly fallback: boolean;
  readonly uncertain: boolean;
}

// WHAT: Why a moment-context field is absent (machine-readable for
//        PERS.4 degraded-mode contract).
export type MomentDegradedReason =
  | "not_provided"
  | "permission_denied"
  | "permission_missing"
  | "integration_unavailable";

// WHAT: A single resolved moment-context field.
//        - available + value present when the field was supplied AND
//          permissioned.
//        - available=false + degraded_reason when missing/denied — never
//          a hallucinated value.
// WHY: Q-PERS.2-δ + ζ — typed availability with per-field TTL/freshness
//      and uncertainty/degraded indicators.
export interface MomentField {
  readonly key: string;
  readonly available: boolean;
  readonly value: unknown | null;
  readonly temporalClass: TemporalClass;
  readonly ttlSeconds: number | null;
  readonly freshness: string;
  readonly uncertain: boolean;
  readonly degraded_reason: MomentDegradedReason | null;
}

// WHAT: Caller-provided OPTIONAL moment inputs. None are required; none
//        are persisted at PERS.2.
// WHY: Q-PERS.2-δ — location/calendar/device/active_app/current_task are
//      permissioned optional caller inputs, not stored substrate.
export interface MomentCallerInputs {
  readonly timezone?: string | null;
  readonly location?: unknown;
  readonly calendar?: unknown;
  readonly device?: unknown;
  readonly active_app?: unknown;
  readonly current_task?: unknown;
}

// WHAT: Minimal session view the resolver reads for timezone provenance.
// WHY: Resolver is pure — the caller supplies the session-derived
//      timezone (if any) rather than the resolver reading the DB.
export interface MomentSessionView {
  readonly timezone?: string | null;
}

// WHAT: Input to the moment-context resolver.
// WHY: `now` injected for deterministic tests (Q-PERS.2-δ); `permissions`
//      is the resolved envelope that gates which fields may populate.
export interface MomentContextInput {
  readonly now: Date;
  readonly entity_profile_timezone?: string | null;
  readonly session?: MomentSessionView;
  readonly permissions: PermissionEnvelope;
  readonly caller_inputs?: MomentCallerInputs;
}

// WHAT: The typed moment-context envelope.
// WHY: PERS.3 buildPersonalizedWorkingSet consumes this to build the
//      moment slice of the working set.
export interface MomentContextEnvelope {
  readonly current_time_iso: string;
  readonly timezone: ResolvedTimezone;
  readonly fields: readonly MomentField[];
}

// Context keys this resolver populates from caller inputs, with their
// temporal class for TTL/freshness stamping. (Identity/timezone are
// handled separately above.)
const MOMENT_FIELD_KEYS: Readonly<Record<string, TemporalClass>> =
  Object.freeze({
    location: "REAL_TIME",
    calendar: "REAL_TIME",
    device: "REAL_TIME",
    active_app: "REAL_TIME",
    current_task: "REAL_TIME",
  });

// WHAT: Resolve a timezone with provenance + fallback marking.
// INPUT: caller input, EntityProfile timezone, session timezone.
// OUTPUT: ResolvedTimezone (value + source + fallback + uncertain).
// WHY: Precedence caller_input > entity_profile > session > safe
//      fallback; the fallback is explicitly marked so it is never
//      presented as user truth (Q-PERS.2-δ).
function resolveTimezone(input: MomentContextInput): ResolvedTimezone {
  const fromCaller = input.caller_inputs?.timezone;
  if (typeof fromCaller === "string" && fromCaller.length > 0) {
    return { value: fromCaller, source: "caller_input", fallback: false, uncertain: false };
  }
  const fromProfile = input.entity_profile_timezone;
  if (typeof fromProfile === "string" && fromProfile.length > 0) {
    return { value: fromProfile, source: "entity_profile", fallback: false, uncertain: false };
  }
  const fromSession = input.session?.timezone;
  if (typeof fromSession === "string" && fromSession.length > 0) {
    return { value: fromSession, source: "session", fallback: false, uncertain: false };
  }
  return {
    value: SAFE_FALLBACK_TIMEZONE,
    source: "fallback_default",
    fallback: true,
    uncertain: true,
  };
}

// WHAT: Derive a wall-clock local-time string for the resolved timezone.
// INPUT: the injected now + resolved timezone value.
// OUTPUT: a locale-time string in the resolved timezone, or null if the
//         timezone is not a valid IANA zone.
// WHY: Local-time derivation (Q-PERS.2-δ) using only Intl (no I/O); a
//      bad timezone degrades to null rather than throwing.
function deriveLocalTime(now: Date, timezone: string): string | null {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(now);
  } catch {
    return null;
  }
}

// WHAT: Build the availability map from the resolved permission envelope.
// WHY: A field may only populate if its envelope entry is available.
function availabilityFor(
  permissions: PermissionEnvelope,
): Map<string, ResolvedContextKey> {
  const map = new Map<string, ResolvedContextKey>();
  for (const r of permissions.resolved) {
    map.set(r.key, r);
  }
  return map;
}

// WHAT: Resolve the typed moment-context envelope.
// INPUT: MomentContextInput (injected now + timezone sources +
//        resolved permissions + optional caller inputs).
// OUTPUT: MomentContextEnvelope with current time, resolved timezone,
//         and one MomentField per moment key.
// WHY: Q-PERS.2-δ + ζ — governed, deterministic, degrade-gracefully
//      moment context. Missing/denied inputs return typed absence with a
//      machine-readable degraded_reason; never a hallucinated value.
export function resolveMomentContext(
  input: MomentContextInput,
): MomentContextEnvelope {
  const timezone = resolveTimezone(input);
  const localTime = deriveLocalTime(input.now, timezone.value);
  const availability = availabilityFor(input.permissions);
  const callerInputs = input.caller_inputs ?? {};

  const fields: MomentField[] = Object.keys(MOMENT_FIELD_KEYS).map((key) => {
    const temporalClass = MOMENT_FIELD_KEYS[key] as TemporalClass;
    const policy = getTemporalPolicy(temporalClass);
    const providedValue = (callerInputs as Record<string, unknown>)[key];
    const provided = providedValue !== undefined && providedValue !== null;
    const envelopeEntry = availability.get(key);

    // current_task is caller-context, not permission-gated: it is the
    // request's own task and is represented (never persisted) when
    // provided.
    if (key === "current_task") {
      if (!provided) {
        return {
          key,
          available: false,
          value: null,
          temporalClass,
          ttlSeconds: policy.defaultTtlSeconds,
          freshness: policy.freshness,
          uncertain: policy.uncertaintyDisclosureRequiredWhenAbsent,
          degraded_reason: "not_provided",
        };
      }
      return {
        key,
        available: true,
        value: providedValue,
        temporalClass,
        ttlSeconds: policy.defaultTtlSeconds,
        freshness: policy.freshness,
        uncertain: false,
        degraded_reason: null,
      };
    }

    // Permissioned optional inputs: must be both provided AND available
    // in the envelope. Otherwise typed absence with a machine-readable
    // degraded reason — no hallucinated specificity.
    const permitted = envelopeEntry !== undefined && envelopeEntry.available;

    if (!permitted) {
      const reason: MomentDegradedReason =
        envelopeEntry === undefined
          ? "permission_missing"
          : "permission_denied";
      return {
        key,
        available: false,
        value: null,
        temporalClass,
        ttlSeconds: policy.defaultTtlSeconds,
        freshness: policy.freshness,
        uncertain: policy.uncertaintyDisclosureRequiredWhenAbsent,
        degraded_reason: reason,
      };
    }

    if (!provided) {
      return {
        key,
        available: false,
        value: null,
        temporalClass,
        ttlSeconds: policy.defaultTtlSeconds,
        freshness: policy.freshness,
        uncertain: policy.uncertaintyDisclosureRequiredWhenAbsent,
        degraded_reason: "integration_unavailable",
      };
    }

    return {
      key,
      available: true,
      value: providedValue,
      temporalClass,
      ttlSeconds: policy.defaultTtlSeconds,
      freshness: policy.freshness,
      uncertain: false,
      degraded_reason: null,
    };
  });

  // Local time rides as a derived REAL_TIME field so callers get its
  // freshness posture; null when the timezone is not a valid IANA zone.
  const localTimePolicy = getTemporalPolicy("REAL_TIME");
  fields.push({
    key: "local_time",
    available: localTime !== null,
    value: localTime,
    temporalClass: "REAL_TIME",
    ttlSeconds: localTimePolicy.defaultTtlSeconds,
    freshness: localTimePolicy.freshness,
    uncertain: localTime === null || timezone.uncertain,
    degraded_reason: localTime === null ? "integration_unavailable" : null,
  });

  return {
    current_time_iso: input.now.toISOString(),
    timezone,
    fields,
  };
}
