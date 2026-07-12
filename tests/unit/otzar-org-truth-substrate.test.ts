// FILE: tests/unit/otzar-org-truth-substrate.test.ts
// PURPOSE: [SECTION-10 ORG-TRUTH — substrate] Pure (no-DB) proof that the organizational-truth
//          substrate's vocabulary + key normalizer are wired: the 8 ORG_TRUTH_* audit events are
//          recognized, the ORG_TRUTH_PROMOTION decision-point constant is exported (and deliberately
//          NOT yet remediable), and computeOrgTruthKey is deterministic, scope-separating, and
//          derived only from governed identifiers (never prose). Model create/CAS/partial-unique
//          behavior is proven in the runtime increment (post-activation), not here.
import { describe, expect, it } from "vitest";
import {
  AUDIT_EVENT_TYPE_VALUES,
  isKnownAuditEventType,
  ORG_TRUTH_PROMOTION_DECISION_POINT,
  REMEDIABLE_DECISION_POINTS,
  computeOrgTruthKey,
} from "@niov/database";

const ORG_TRUTH_EVENTS = [
  "ORG_TRUTH_CANDIDATE_SUBMITTED",
  "ORG_TRUTH_CONFLICT_OPENED",
  "ORG_TRUTH_CONFLICT_UPDATED",
  "ORG_TRUTH_PROMOTED",
  "ORG_TRUTH_SUPERSEDED",
  "ORG_TRUTH_RETRACTED",
  "ORG_TRUTH_CONFLICT_RESOLVED",
  "ORG_TRUTH_REVIEW_OBLIGATION_CREATED",
] as const;

describe("org-truth substrate vocabulary (§10)", () => {
  it("registers all 8 ORG_TRUTH_* audit events (union + iterable list + guard in sync)", () => {
    for (const e of ORG_TRUTH_EVENTS) {
      expect(AUDIT_EVENT_TYPE_VALUES).toContain(e);
      expect(isKnownAuditEventType(e)).toBe(true);
    }
    // No duplicates crept into the iterable list.
    expect(new Set(AUDIT_EVENT_TYPE_VALUES).size).toBe(AUDIT_EVENT_TYPE_VALUES.length);
  });

  it("exports the ORG_TRUTH_PROMOTION decision point, NOT yet wired as remediable", () => {
    expect(ORG_TRUTH_PROMOTION_DECISION_POINT).toBe("ORG_TRUTH_PROMOTION");
    // The sweep must not act on promotion snapshots until the runtime increment opts in.
    expect(REMEDIABLE_DECISION_POINTS).not.toContain(ORG_TRUTH_PROMOTION_DECISION_POINT);
  });
});

describe("computeOrgTruthKey (§5 deterministic key)", () => {
  const base = { org_entity_id: "ORG-1", decision_domain: "Finance", topic: "Expense Approval Threshold" };

  it("is deterministic + case/whitespace-normalized (equal scopes converge)", () => {
    const a = computeOrgTruthKey(base);
    const b = computeOrgTruthKey({ org_entity_id: "  org-1 ", decision_domain: "finance", topic: "expense   approval  threshold" });
    expect(a).toBe(b);
    expect(a).toBe("org-1:finance:-:-:-:expense approval threshold");
  });

  it("separates scope: different org / domain / subject / workspace / topic → different keys", () => {
    const k = computeOrgTruthKey(base);
    expect(computeOrgTruthKey({ ...base, org_entity_id: "ORG-2" })).not.toBe(k);
    expect(computeOrgTruthKey({ ...base, decision_domain: "legal" })).not.toBe(k);
    expect(computeOrgTruthKey({ ...base, subject_ref_class: "PROJECT", subject_ref: "P-9" })).not.toBe(k);
    expect(computeOrgTruthKey({ ...base, workspace_id: "W-1" })).not.toBe(k);
    expect(computeOrgTruthKey({ ...base, topic: "launch date" })).not.toBe(k);
  });

  it("treats absent subject/workspace as a stable placeholder, not a collision", () => {
    const withNulls = computeOrgTruthKey({ ...base, subject_ref: null, subject_ref_class: null, workspace_id: null });
    const withUndef = computeOrgTruthKey(base);
    expect(withNulls).toBe(withUndef);
    // A real subject must NOT collide with the "no subject" placeholder.
    expect(computeOrgTruthKey({ ...base, subject_ref_class: "-", subject_ref: "-" })).toBe(withUndef); // literal "-" topic-free scope
    expect(computeOrgTruthKey({ ...base, subject_ref_class: "PROJECT", subject_ref: "P-1" })).not.toBe(withUndef);
  });
});
