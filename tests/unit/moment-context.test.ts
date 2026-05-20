// FILE: moment-context.test.ts (unit)
// PURPOSE: Cover the Foundation/COSMP moment-context resolver at PERS.2
//          per ADR-0048 Q-PERS.2-δ + ζ. Deterministic via injected now;
//          no external provider calls. Proves deterministic time,
//          timezone local-time derivation, safe fallback marking,
//          permissioned-optional location/calendar/device, current-task
//          representation without persistence, per-field TTL/freshness,
//          graceful degradation (typed absence; no hallucinated
//          specificity), and temporal-class → freshness/TTL mapping.
// CONNECTS TO: apps/api/src/services/personalization/moment-context.service.ts
//              + permission-envelope.service.ts + temporal-personalization.ts
//              via @niov/api barrel.

import { describe, expect, it } from "vitest";
import {
  resolveMomentContext,
  resolvePermissionEnvelope,
  getTemporalPolicy,
  SAFE_FALLBACK_TIMEZONE,
  type PermissionEnvelope,
  type ScopedGrant,
  type MomentField,
} from "@niov/api";

const WALLET = "11111111-1111-1111-1111-111111111111";
const ACTOR = "33333333-3333-3333-3333-333333333333";
const FIXED_NOW = new Date("2026-05-19T17:30:00.000Z");

function envelopeWith(
  requested: string[],
  grants: Record<string, ScopedGrant> = {},
): PermissionEnvelope {
  return resolvePermissionEnvelope({
    actor_entity_id: ACTOR,
    wallet_id: WALLET,
    entity_type: "PERSON",
    domain: "personal",
    requested_context: requested,
    grants,
  });
}

function field(env: ReturnType<typeof resolveMomentContext>, key: string): MomentField | undefined {
  return env.fields.find((f) => f.key === key);
}

describe("resolveMomentContext — deterministic time + timezone", () => {
  it("injected now produces a deterministic current_time_iso", () => {
    const out = resolveMomentContext({
      now: FIXED_NOW,
      permissions: envelopeWith([]),
    });
    expect(out.current_time_iso).toBe("2026-05-19T17:30:00.000Z");
  });

  it("derives local_time for a provided timezone (EntityProfile)", () => {
    const out = resolveMomentContext({
      now: FIXED_NOW,
      entity_profile_timezone: "America/New_York",
      permissions: envelopeWith([]),
    });
    const lt = field(out, "local_time");
    expect(lt?.available).toBe(true);
    expect(typeof lt?.value).toBe("string");
    expect(out.timezone.value).toBe("America/New_York");
    expect(out.timezone.source).toBe("entity_profile");
    expect(out.timezone.fallback).toBe(false);
  });

  it("safe timezone fallback is clearly marked fallback + uncertain (never user truth)", () => {
    const out = resolveMomentContext({
      now: FIXED_NOW,
      permissions: envelopeWith([]),
    });
    expect(out.timezone.value).toBe(SAFE_FALLBACK_TIMEZONE);
    expect(out.timezone.source).toBe("fallback_default");
    expect(out.timezone.fallback).toBe(true);
    expect(out.timezone.uncertain).toBe(true);
  });

  it("caller-input timezone takes precedence over profile + session", () => {
    const out = resolveMomentContext({
      now: FIXED_NOW,
      entity_profile_timezone: "America/New_York",
      session: { timezone: "Europe/London" },
      permissions: envelopeWith([]),
      caller_inputs: { timezone: "Asia/Tokyo" },
    });
    expect(out.timezone.value).toBe("Asia/Tokyo");
    expect(out.timezone.source).toBe("caller_input");
  });
});

describe("resolveMomentContext — permissioned optional fields", () => {
  it("location granted + provided returns available with TTL/freshness", () => {
    const grant: ScopedGrant = { wallet_id: WALLET, domain: "personal", granted: true };
    const out = resolveMomentContext({
      now: FIXED_NOW,
      permissions: envelopeWith(["location"], { location: grant }),
      caller_inputs: { location: { lat: 0, lon: 0 } },
    });
    const loc = field(out, "location");
    expect(loc?.available).toBe(true);
    expect(loc?.value).toEqual({ lat: 0, lon: 0 });
    expect(loc?.ttlSeconds).toBe(getTemporalPolicy("REAL_TIME").defaultTtlSeconds);
    expect(loc?.degraded_reason).toBeNull();
  });

  it("location permission denied returns typed absence (no value, machine-readable reason)", () => {
    const out = resolveMomentContext({
      now: FIXED_NOW,
      permissions: envelopeWith(["location"]), // requested but no grant -> not available
      caller_inputs: { location: { lat: 0, lon: 0 } },
    });
    const loc = field(out, "location");
    expect(loc?.available).toBe(false);
    expect(loc?.value).toBeNull();
    expect(loc?.degraded_reason).toBe("permission_denied");
  });

  it("calendar missing from envelope does not fail — typed permission_missing", () => {
    const out = resolveMomentContext({
      now: FIXED_NOW,
      permissions: envelopeWith([]), // calendar never requested
    });
    const cal = field(out, "calendar");
    expect(cal?.available).toBe(false);
    expect(cal?.value).toBeNull();
    expect(cal?.degraded_reason).toBe("permission_missing");
  });

  it("device/app missing does not fail", () => {
    const out = resolveMomentContext({
      now: FIXED_NOW,
      permissions: envelopeWith([]),
    });
    const dev = field(out, "device");
    expect(dev?.available).toBe(false);
    expect(dev?.degraded_reason).toBe("permission_missing");
  });

  it("granted but not provided returns integration_unavailable (no hallucinated specificity)", () => {
    const grant: ScopedGrant = { wallet_id: WALLET, domain: "personal", granted: true };
    const out = resolveMomentContext({
      now: FIXED_NOW,
      permissions: envelopeWith(["location"], { location: grant }),
      // location grant present but caller did NOT provide a value
    });
    const loc = field(out, "location");
    expect(loc?.available).toBe(false);
    expect(loc?.value).toBeNull();
    expect(loc?.degraded_reason).toBe("integration_unavailable");
  });
});

describe("resolveMomentContext — current task (caller context, not persisted)", () => {
  it("current_task caller input is represented when provided", () => {
    const out = resolveMomentContext({
      now: FIXED_NOW,
      permissions: envelopeWith([]),
      caller_inputs: { current_task: "plan_errands" },
    });
    const task = field(out, "current_task");
    expect(task?.available).toBe(true);
    expect(task?.value).toBe("plan_errands");
  });

  it("current_task absent yields typed not_provided absence", () => {
    const out = resolveMomentContext({
      now: FIXED_NOW,
      permissions: envelopeWith([]),
    });
    const task = field(out, "current_task");
    expect(task?.available).toBe(false);
    expect(task?.degraded_reason).toBe("not_provided");
  });
});

describe("temporal class → freshness/TTL mapping (Q-PERS.2-ε)", () => {
  it("REAL_TIME fields carry the short EXPIRES_FAST TTL", () => {
    const out = resolveMomentContext({ now: FIXED_NOW, permissions: envelopeWith([]) });
    const loc = field(out, "location");
    expect(loc?.freshness).toBe("EXPIRES_FAST");
    expect(loc?.ttlSeconds).toBe(300);
  });

  it("STABLE_IDENTITY has no time-based TTL; REPEATED_PATTERN is long-lived", () => {
    expect(getTemporalPolicy("STABLE_IDENTITY").defaultTtlSeconds).toBeNull();
    expect(getTemporalPolicy("REPEATED_PATTERN").defaultTtlSeconds).toBe(2592000);
  });

  it("no hallucinated specificity — every unavailable field has null value", () => {
    const out = resolveMomentContext({ now: FIXED_NOW, permissions: envelopeWith([]) });
    for (const f of out.fields) {
      if (!f.available) {
        expect(f.value).toBeNull();
      }
    }
  });
});
