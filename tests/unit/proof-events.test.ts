// FILE: tests/unit/proof-events.test.ts (unit)
// PURPOSE: F-1321 — guard the proof-event CLASS CATALOG against fabrication and
//          fidelity drift. The feed must only ever project REAL Foundation audit
//          literals; classes with no backing literal must be marked MISSING (not
//          invented); every non-EXACT class must carry an honest fidelity note;
//          and the 21 directive-mandated event classes must all be present.
// CONNECTS TO: apps/api/src/services/foundation/proof-events.service.ts

import { describe, expect, it } from "vitest";
import { AUDIT_EVENT_TYPE_VALUES } from "@niov/database";
import {
  PROOF_EVENT_CLASSES,
  PROOF_SOURCE_LITERALS,
} from "../../apps/api/src/services/foundation/proof-events.service.js";

// The 21 event classes the F-1321 directive mandates.
const REQUIRED_CLASSES = [
  "REQUEST_CREATED",
  "REQUEST_APPROVED",
  "REQUEST_DENIED",
  "CONSENT_GRANTED",
  "CONSENT_REVOKED",
  "GRANT_CREATED",
  "GRANT_READ",
  "GRANT_DENIED",
  "GRANT_REVOKED",
  "GRANT_EXPIRED",
  "CONTRIBUTION_JOINED",
  "CONTRIBUTION_WITHDRAWN",
  "COHORT_DELIVERY_ALLOWED",
  "COHORT_DELIVERY_SUPPRESSED",
  "COHORT_DELIVERY_DENIED",
  "LISTING_REGISTERED",
  "LISTING_DISCOVERED",
  "LISTING_ACCESS_EVALUATED",
  "METER_INCREMENTED",
  "SETTLEMENT_INTENT_CREATED",
  "POLICY_EVALUATED",
];

describe("F-1321 proof-event class catalog", () => {
  it("declares every directive-mandated event class", () => {
    const declared = new Set(PROOF_EVENT_CLASSES.map((c) => c.event_class));
    for (const cls of REQUIRED_CLASSES) expect(declared.has(cls)).toBe(true);
  });

  it("never invents a source literal — every source is a real audit literal", () => {
    const known = new Set(AUDIT_EVENT_TYPE_VALUES as readonly string[]);
    for (const spec of PROOF_EVENT_CLASSES) {
      for (const lit of spec.sources) {
        expect(known.has(lit), `${spec.event_class} → ${lit} must be a real audit literal`).toBe(true);
      }
    }
  });

  it("marks classes with no backing literal as MISSING (no fabrication)", () => {
    for (const spec of PROOF_EVENT_CLASSES) {
      if (spec.sources.length === 0) {
        expect(spec.fidelity).toBe("MISSING");
        expect(typeof spec.fidelity_note).toBe("string");
      } else {
        expect(spec.fidelity).not.toBe("MISSING");
      }
    }
  });

  it("requires an honest fidelity note on every non-EXACT class", () => {
    for (const spec of PROOF_EVENT_CLASSES) {
      if (spec.fidelity !== "EXACT") {
        expect((spec.fidelity_note ?? "").length).toBeGreaterThan(0);
      }
    }
  });

  it("PROOF_SOURCE_LITERALS is the de-duplicated union of all real sources", () => {
    expect(PROOF_SOURCE_LITERALS.length).toBe(new Set(PROOF_SOURCE_LITERALS).size);
    expect(PROOF_SOURCE_LITERALS.length).toBeGreaterThan(0);
    const fromClasses = new Set(PROOF_EVENT_CLASSES.flatMap((c) => c.sources));
    expect(new Set(PROOF_SOURCE_LITERALS)).toEqual(fromClasses);
  });

  it("LISTING_DISCOVERED and CONSENT_REVOKED are honestly marked MISSING", () => {
    const byClass = new Map(PROOF_EVENT_CLASSES.map((c) => [c.event_class, c]));
    expect(byClass.get("LISTING_DISCOVERED")?.fidelity).toBe("MISSING");
    expect(byClass.get("CONSENT_REVOKED")?.fidelity).toBe("MISSING");
  });
});
