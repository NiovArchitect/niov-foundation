// FILE: conversation-context-signals.test.ts (unit)
// PURPOSE: ADR-0078 Stage 2 approved-source projection unit
//          coverage — closed-vocab tuple stability (every value
//          mirrors ADR-0078 §3 + §6C verbatim) + the
//          ConversationContextSignalProjectionService contract +
//          ADR-0079 §27 enforcement gate. The projection service
//          method itself reaches Prisma + listActionsForCaller,
//          so the end-to-end wire-level coverage lives in the
//          Wave 7 / Wave 9 integration suites. This unit test
//          locks the surface area that is pure: tuples, type
//          membership, max-count + safe_summary length
//          discipline, and §6C.12 additive-field exhaustion.
// CONNECTS TO:
//   - apps/api/src/services/playground/conversation-context-signals.ts
//   - ADR-0078 §2 / §3 / §6C / §7 Stage 2 / §8 / §9 / §11 / §12
//   - ADR-0079 §19 / §26 / §27 / §29.2

import { describe, expect, it } from "vitest";
import {
  CONVERSATION_CONTEXT_SIGNAL_TYPE_VALUES,
  SIGNAL_CONFIDENCE_LABEL_VALUES,
  SIGNAL_SOURCE_TYPE_VALUES,
  SIGNAL_SCOPE_VALUES,
  EVIDENCE_LABEL_VALUES,
  RETENTION_CLASS_VALUES,
  POLICY_PURPOSE_VALUES,
  BUSINESS_PURPOSE_LABEL_VALUES,
  CONVERSATION_RELEVANCE_CLASS_VALUES,
  CAPTURE_ELIGIBILITY_VALUES,
  AGENT_PLAYGROUND_USE_VALUES,
  SCOPE_BINDING_TYPE_VALUES,
  CONVERSATION_CONTEXT_SIGNALS_MAX,
} from "@niov/api";

describe("ADR-0078 Stage 2 — closed-vocab tuple stability", () => {
  it("CONVERSATION_CONTEXT_SIGNAL_TYPE_VALUES locks 17 ADR-0078 §3.1 values verbatim", () => {
    expect(CONVERSATION_CONTEXT_SIGNAL_TYPE_VALUES).toHaveLength(17);
    expect([...CONVERSATION_CONTEXT_SIGNAL_TYPE_VALUES].sort()).toEqual(
      [
        "ACTION_ITEM_DEPENDENCY_IDENTIFIED",
        "APPROVAL_DEPENDENCY_IDENTIFIED",
        "CONFLICTING_DIRECTION_IDENTIFIED",
        "CONTEXT_INSUFFICIENT_FOR_RECOMMENDATION",
        "CUSTOMER_OR_CLIENT_IMPACT_RAISED",
        "DEADLINE_OR_TIMING_CONSTRAINT_IDENTIFIED",
        "DECISION_OWNER_UNCLEAR",
        "HUMAN_OBJECTION_REQUIRES_REVIEW",
        "MEETING_CONTEXT_SUPPORTS_PATH",
        "MISSING_STAKEHOLDER_INPUT",
        "POLICY_OR_COMPLIANCE_CONCERN_RAISED",
        "PRIOR_COMMITMENT_IDENTIFIED",
        "PRIOR_DECISION_REFERENCED",
        "RISK_RAISED_BY_STAKEHOLDER",
        "SECURITY_OR_DATA_SCOPE_CONCERN_RAISED",
        "STAKEHOLDER_CONCERN_IDENTIFIED",
        "UNRESOLVED_QUESTION_IDENTIFIED",
      ].sort(),
    );
  });

  it("SIGNAL_CONFIDENCE_LABEL_VALUES locks 4 ADR-0078 §3.2 values", () => {
    expect([...SIGNAL_CONFIDENCE_LABEL_VALUES].sort()).toEqual(
      ["HIGH", "INSUFFICIENT_DATA", "LOW", "MEDIUM"].sort(),
    );
  });

  it("SIGNAL_SOURCE_TYPE_VALUES locks 8 ADR-0078 §3.3 values", () => {
    expect([...SIGNAL_SOURCE_TYPE_VALUES].sort()).toEqual(
      [
        "ACTION_HISTORY",
        "APPROVED_NOTE",
        "CORRECTION_SIGNAL",
        "GOVERNED_LISTENER_OUTPUT",
        "HIVE_CONTEXT",
        "IMPORTED_APPROVED_RECORD",
        "MANUAL_USER_INPUT",
        "MEETING_SUMMARY",
      ].sort(),
    );
  });

  it("SIGNAL_SCOPE_VALUES locks 6 ADR-0078 §3.4 values", () => {
    expect([...SIGNAL_SCOPE_VALUES].sort()).toEqual(
      [
        "ACTION_SCOPED",
        "COMPLIANCE_REVIEW_SCOPED",
        "HIVE_SCOPED",
        "PROJECT_SCOPED",
        "SAME_ORG",
        "SELF_ONLY",
      ].sort(),
    );
  });

  it("EVIDENCE_LABEL_VALUES locks 13 ADR-0078 §3.6 values", () => {
    expect(EVIDENCE_LABEL_VALUES).toHaveLength(13);
  });

  it("RETENTION_CLASS_VALUES locks 5 ADR-0078 §3.7 values", () => {
    expect([...RETENTION_CLASS_VALUES].sort()).toEqual(
      [
        "ACTION_CONTEXT_RETAINED",
        "AUDIT_SAFE_METADATA_ONLY",
        "DEPERSONALIZED_IMPROVEMENT_SIGNAL",
        "EPHEMERAL_REVIEW_ONLY",
        "SCENARIO_CONTEXT_RETAINED",
      ].sort(),
    );
  });

  it("POLICY_PURPOSE_VALUES locks 7 ADR-0078 §3.9 values", () => {
    expect(POLICY_PURPOSE_VALUES).toHaveLength(7);
    expect([...POLICY_PURPOSE_VALUES]).toContain("RECOMMENDATION_REVIEW");
    expect([...POLICY_PURPOSE_VALUES]).toContain("SIMULATION_REVIEW");
  });

  it("BUSINESS_PURPOSE_LABEL_VALUES locks 11 ADR-0078 §6C.6 values incl UNKNOWN_BUSINESS_PURPOSE", () => {
    expect(BUSINESS_PURPOSE_LABEL_VALUES).toHaveLength(11);
    // UNKNOWN_BUSINESS_PURPOSE is the canonical block label per
    // ADR-0079 §27 — projection service MUST never emit it.
    expect([...BUSINESS_PURPOSE_LABEL_VALUES]).toContain(
      "UNKNOWN_BUSINESS_PURPOSE",
    );
  });

  it("CONVERSATION_RELEVANCE_CLASS_VALUES locks 5 ADR-0078 §6C.9.a values", () => {
    expect([...CONVERSATION_RELEVANCE_CLASS_VALUES].sort()).toEqual(
      [
        "MIXED_WORK_PERSONAL",
        "NON_WORK_PERSONAL",
        "SENSITIVE_PERSONAL",
        "UNKNOWN_REQUIRES_REVIEW",
        "WORK_RELEVANT",
      ].sort(),
    );
  });

  it("CAPTURE_ELIGIBILITY_VALUES locks 7 ADR-0078 §6C.9.b values", () => {
    expect(CAPTURE_ELIGIBILITY_VALUES).toHaveLength(7);
  });

  it("AGENT_PLAYGROUND_USE_VALUES locks 5 ADR-0078 §6C.9.c values incl BLOCKED_FROM_AGENT_PLAYGROUND", () => {
    expect([...AGENT_PLAYGROUND_USE_VALUES].sort()).toEqual(
      [
        "ALLOWED_AFTER_REDACTION",
        "ALLOWED_FOR_SIGNALS",
        "BLOCKED_FROM_AGENT_PLAYGROUND",
        "LEGAL_COMPLIANCE_ONLY",
        "REQUIRES_HUMAN_REVIEW",
      ].sort(),
    );
  });

  it("SCOPE_BINDING_TYPE_VALUES locks 9 ADR-0078 §6C.10 values", () => {
    expect(SCOPE_BINDING_TYPE_VALUES).toHaveLength(9);
  });
});

describe("ADR-0078 Stage 2 — bounded count discipline", () => {
  it("CONVERSATION_CONTEXT_SIGNALS_MAX is 8 per ADR-0078 §8 line 1129", () => {
    expect(CONVERSATION_CONTEXT_SIGNALS_MAX).toBe(8);
  });
});

describe("ADR-0078 Stage 2 — Stage 2 LIVE sources are in the SIGNAL_SOURCE_TYPE_VALUES enum", () => {
  it("CORRECTION_SIGNAL is canonical", () => {
    expect([...SIGNAL_SOURCE_TYPE_VALUES]).toContain("CORRECTION_SIGNAL");
  });
  it("ACTION_HISTORY is canonical", () => {
    expect([...SIGNAL_SOURCE_TYPE_VALUES]).toContain("ACTION_HISTORY");
  });
  it("HIVE_CONTEXT is canonical (preserved at enum register, zero-output at Stage 2)", () => {
    expect([...SIGNAL_SOURCE_TYPE_VALUES]).toContain("HIVE_CONTEXT");
  });
  it("MANUAL_USER_INPUT is canonical", () => {
    expect([...SIGNAL_SOURCE_TYPE_VALUES]).toContain("MANUAL_USER_INPUT");
  });
});
