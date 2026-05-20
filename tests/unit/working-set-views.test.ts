// FILE: working-set-views.test.ts (unit)
// PURPOSE: Cover the Foundation-owned working-set projections at PERS.5a per
//          ADR-0048 Q-PERS.5-γ. Pure projections; no DB. Proves the admin
//          view carries the full machine truth, the consumer view strips
//          every raw Foundation diagnostic, the consumer view is a strict
//          subset (capsules identical, no invented data), the coarse
//          uncertainty flags derive from the degraded contract's
//          dispositions, and timezone_uncertain reflects the moment timezone.
// CONNECTS TO: apps/api/src/services/personalization/working-set-views.ts
//              + working-set.service.ts + degraded-mode-contract.ts via @niov/api.

import { describe, expect, it } from "vitest";
import {
  projectAdminView,
  projectConsumerView,
  disclosurePolicyFor,
  type WorkingSetSuccess,
  type DegradedContractEntry,
  type DegradedReason,
  type DegradedSource,
} from "@niov/api";

function entry(
  source: DegradedSource,
  key: string,
  reason: DegradedReason,
): DegradedContractEntry {
  const p = disclosurePolicyFor(reason);
  return {
    source,
    key,
    reason,
    disposition: p.disposition,
    may_use_as_truth: p.may_use_as_truth,
    must_disclose_uncertainty: p.must_disclose_uncertainty,
    may_request_permission: p.may_request_permission,
    must_not_fabricate: true,
    advisory: `${source}:${key}:${reason}`,
  };
}

function makeWs(
  degraded: DegradedContractEntry[],
  opts: { tzFallback?: boolean; tzUncertain?: boolean } = {},
): WorkingSetSuccess {
  const fallback = opts.tzFallback ?? false;
  return {
    ok: true,
    domain: "personal",
    moment: {
      current_time_iso: "2026-05-20T12:00:00.000Z",
      timezone: {
        value: "America/New_York",
        source: fallback ? "fallback_default" : "entity_profile",
        fallback,
        uncertain: opts.tzUncertain ?? fallback,
      },
      fields: [],
    },
    permissions: [
      {
        key: "entity_id",
        tier: "required",
        available: true,
        reason: "stable_identity_required",
        temporalClass: "STABLE_IDENTITY",
        audit_intent: "required_substrate:entity_id",
      },
    ],
    capsules: [
      { capsule_id: "c1", capsule_type: "PREFERENCE", topic_tags: ["x"], content: "hello" },
    ],
    stats: {
      capsules_loaded: 1,
      tokens_consumed: 100,
      capsules_skipped_low_relevance: 0,
      capsules_skipped_budget: 0,
      capsules_denied_permission: 2,
      context_keys_requested: 1,
      context_keys_available: 1,
      moment_fields_available: 0,
    },
    degraded,
    consumer_obligations: ["MUST NOT fabricate missing context"],
    audit_intent: `working_set_built:personal:capsules=1:ctx_keys=1/1:degraded=${degraded.length}`,
  };
}

describe("projectAdminView — full machine truth", () => {
  it("carries the degraded contract, stats, audit_intent, consumer_obligations", () => {
    const ws = makeWs([entry("permission", "health", "sensitive_enrichment_blocked")]);
    const admin = projectAdminView(ws);
    expect(admin.view).toBe("admin");
    expect(admin.degraded).toEqual(ws.degraded);
    expect(admin.stats).toEqual(ws.stats);
    expect(admin.audit_intent).toBe(ws.audit_intent);
    expect(admin.consumer_obligations).toEqual(ws.consumer_obligations);
    expect(admin.capsules).toEqual(ws.capsules);
  });
});

describe("projectConsumerView — graceful subset, no raw diagnostics", () => {
  it("strips every raw Foundation diagnostic from the serialized view", () => {
    const ws = makeWs(
      [
        entry("permission", "health", "sensitive_enrichment_blocked"),
        entry("timezone", "timezone", "fallback_used"),
      ],
      { tzFallback: true },
    );
    const consumer = projectConsumerView(ws);
    const s = JSON.stringify(consumer);
    for (const forbidden of [
      "sensitive_enrichment_blocked",
      "fallback_used",
      "low_confidence",
      "disposition",
      "advisory",
      "audit_intent",
      "consumer_obligations",
      "tokens_consumed",
      "stable_identity_required",
    ]) {
      expect(s).not.toContain(forbidden);
    }
  });

  it("exposes only the allow-listed keys", () => {
    const consumer = projectConsumerView(makeWs([]));
    expect(Object.keys(consumer).sort()).toEqual(
      [
        "capsules",
        "current_time_iso",
        "domain",
        "has_uncertainty",
        "has_withheld_context",
        "may_request_permission",
        "timezone_uncertain",
        "view",
      ].sort(),
    );
  });

  it("is a strict subset: capsules identical to the source, nothing invented", () => {
    const ws = makeWs([]);
    const consumer = projectConsumerView(ws);
    expect(consumer.capsules).toEqual(ws.capsules);
    expect(consumer.domain).toBe(ws.domain);
    expect(consumer.current_time_iso).toBe(ws.moment.current_time_iso);
  });

  it("derives has_withheld_context + may_request_permission from a withheld sensitive entry", () => {
    const ws = makeWs([entry("permission", "health", "sensitive_enrichment_blocked")]);
    const consumer = projectConsumerView(ws);
    expect(consumer.has_withheld_context).toBe(true);
    expect(consumer.may_request_permission).toBe(true);
  });

  it("derives has_uncertainty from a fallback_not_truth / low_confidence entry", () => {
    const fb = projectConsumerView(makeWs([entry("timezone", "timezone", "fallback_used")]));
    expect(fb.has_uncertainty).toBe(true);
    const lc = projectConsumerView(makeWs([entry("moment", "local_time", "uncertain")]));
    expect(lc.has_uncertainty).toBe(true);
  });

  it("a clean working set has all flags false", () => {
    const consumer = projectConsumerView(makeWs([]));
    expect(consumer.has_uncertainty).toBe(false);
    expect(consumer.has_withheld_context).toBe(false);
    expect(consumer.may_request_permission).toBe(false);
    expect(consumer.timezone_uncertain).toBe(false);
  });

  it("timezone_uncertain reflects the moment timezone fallback/uncertain", () => {
    expect(projectConsumerView(makeWs([], { tzFallback: true })).timezone_uncertain).toBe(true);
    expect(projectConsumerView(makeWs([], { tzUncertain: true })).timezone_uncertain).toBe(true);
    expect(projectConsumerView(makeWs([])).timezone_uncertain).toBe(false);
  });
});
