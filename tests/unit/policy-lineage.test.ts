// FILE: tests/unit/policy-lineage.test.ts (unit)
// PURPOSE: F-1324 — lock the policy-lineage classifier against fabrication and
//          drift. Every reason→rule mapping must land in one of the 11 canonical
//          rule classes; all 11 classes must be reachable from REAL reason codes;
//          enforcement-point derivation must be deterministic.
// CONNECTS TO: apps/api/src/services/foundation/policy-lineage.service.ts

import { describe, expect, it } from "vitest";
import {
  POLICY_DECISION_EVENT_TYPES,
  REASON_TO_RULE,
  enforcementPointFor,
} from "../../apps/api/src/services/foundation/policy-lineage.service.js";

const RULE_CLASSES = [
  "CONSENT_REQUIRED",
  "CONSENT_GRANTED",
  "CONSENT_REVOKED",
  "HIGH_SENSITIVITY_BLOCK",
  "USE_NOT_PERMITTED",
  "ACCESS_MODE_BLOCKED",
  "ROLE_FORBIDDEN",
  "K_ANONYMITY_BLOCK",
  "GRANT_REVOKED",
  "GRANT_EXPIRED",
  "PROVIDER_SCOPE_REQUIRED",
];

describe("F-1324 policy-lineage classifier", () => {
  it("every reason maps to one of the 11 canonical rule classes (no invented class)", () => {
    for (const [reason, cls] of Object.entries(REASON_TO_RULE)) {
      expect(RULE_CLASSES, `${reason} → ${cls}`).toContain(cls);
    }
  });

  it("all 11 canonical rule classes are reachable from a real reason code", () => {
    const reachable = new Set(Object.values(REASON_TO_RULE));
    for (const cls of RULE_CLASSES) expect(reachable.has(cls as never)).toBe(true);
  });

  it("maps representative real reason codes to the expected classes", () => {
    expect(REASON_TO_RULE.CONSENT_REQUIRED).toBe("CONSENT_REQUIRED");
    expect(REASON_TO_RULE.CONTRIBUTOR_WITHDREW_CONSENT).toBe("CONSENT_REVOKED");
    expect(REASON_TO_RULE.HIGH_SENSITIVITY_DEFAULT_DENY).toBe("HIGH_SENSITIVITY_BLOCK");
    expect(REASON_TO_RULE.TRAINING_NOT_PERMITTED).toBe("USE_NOT_PERMITTED");
    expect(REASON_TO_RULE.BELOW_K_ANONYMITY_THRESHOLD).toBe("K_ANONYMITY_BLOCK");
    expect(REASON_TO_RULE.GRANT_NOT_ACTIVE).toBe("GRANT_REVOKED");
    expect(REASON_TO_RULE.RETENTION_EXPIRED).toBe("GRANT_EXPIRED");
    expect(REASON_TO_RULE.REVIEWER_NOT_PROVIDER_OWNER).toBe("PROVIDER_SCOPE_REQUIRED");
  });

  it("derives a deterministic enforcement point per event type", () => {
    expect(enforcementPointFor("MARKETPLACE_DATA_GRANT_READ_EVALUATED")).toBe("GRANT_READ_GATE");
    expect(enforcementPointFor("COHORT_SIGNAL_DELIVERED")).toBe("COHORT_DELIVERY_GATE");
    expect(enforcementPointFor("COHORT_ACCESS_DECIDED")).toBe("COHORT_ACCESS_GATE");
    expect(enforcementPointFor("HIGH_SENSITIVITY_POLICY_EVALUATED")).toBe("HIGH_SENSITIVITY_GATE");
    expect(enforcementPointFor("MARKETPLACE_ACCESS_EVALUATED")).toBe("LISTING_ACCESS_GATE");
    expect(enforcementPointFor("CONSENT_REVOKED")).toBe("CONSENT_GATE");
    expect(enforcementPointFor("SOMETHING_ELSE")).toBe("POLICY_GATE");
  });

  it("the decision-event floor admits policy decisions and excludes non-decisions", () => {
    for (const t of [
      "MARKETPLACE_DATA_GRANT_READ_EVALUATED",
      "COHORT_SIGNAL_DELIVERED",
      "HIGH_SENSITIVITY_POLICY_EVALUATED",
      "CONSENT_REVOKED",
    ]) {
      expect(POLICY_DECISION_EVENT_TYPES.has(t)).toBe(true);
    }
    for (const t of [
      "LOGIN_SUCCESS",
      "CONVERSATION_STARTED",
      "CAPSULE_CONTENT_READ",
      "LISTING_DISCOVERED",
      "ATTRIBUTION_VIEWED",
      "POLICY_LINEAGE_VIEWED",
    ]) {
      expect(POLICY_DECISION_EVENT_TYPES.has(t)).toBe(false);
    }
  });
});
