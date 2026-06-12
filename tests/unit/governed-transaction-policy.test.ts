// FILE: governed-transaction-policy.test.ts
// PURPOSE: Phase 1250 — locks the pure transaction policy gate:
//          rails other than MOCK_RAIL are forbidden even with
//          credentials; AI / device / machine actors never
//          auto-approve; suspended actors are blocked at any amount;
//          microtransactions stay policy-gated; high value requires
//          dual control; and the new audit literals are registered.

import { describe, expect, it } from "vitest";
import {
  AUDIT_EVENT_TYPE_VALUES,
  isKnownAuditEventType,
} from "../../packages/database/src/queries/audit.js";
import {
  DUAL_CONTROL_MIN_USD,
  MICROTRANSACTION_MAX_USD,
  evaluateMockTransactionPolicy,
  type TransactionPolicyInput,
} from "../../apps/api/src/services/governance/governed-transaction.service.js";

function base(
  overrides: Partial<TransactionPolicyInput> = {},
): TransactionPolicyInput {
  return {
    actor_class: "HUMAN",
    actor_status: "ACTIVE",
    amount_usd: 25,
    rail: "MOCK_RAIL",
    org_requires_human_approval: true,
    org_auto_approve_low_risk: false,
    ...overrides,
  };
}

describe("Phase 1250 — transaction policy gate (pure)", () => {
  it("real rails are forbidden even when credentials exist — credentials never authorize", () => {
    for (const rail of ["CIRCLE_GATEWAY", "COINBASE_BASE", "anything-else"]) {
      const r = evaluateMockTransactionPolicy(base({ rail }));
      expect(r.decision).toBe("FORBIDDEN");
      expect(r.reason_code).toBe(
        "rail-not-executable-credentials-never-authorize",
      );
    }
  });

  it("out-of-bounds amounts are forbidden", () => {
    for (const amount of [0, -5, Number.NaN, Number.POSITIVE_INFINITY, 2_000_000]) {
      expect(
        evaluateMockTransactionPolicy(base({ amount_usd: amount })).decision,
      ).toBe("FORBIDDEN");
    }
  });

  it("suspended actors are blocked at ANY amount — the kill switch reaches microtransactions", () => {
    const r = evaluateMockTransactionPolicy(
      base({ actor_status: "SUSPENDED", amount_usd: 0.01 }),
    );
    expect(r.decision).toBe("FORBIDDEN");
    expect(r.reason_code).toBe("actor-not-active");
  });

  it("AI, device, and machine actors NEVER auto-approve — a human approves at any amount", () => {
    for (const actor of ["AI_TWIN", "AI_EMPLOYEE", "DEVICE", "AGENT"] as const) {
      const micro = evaluateMockTransactionPolicy(
        base({
          actor_class: actor,
          amount_usd: 0.05,
          org_requires_human_approval: false,
          org_auto_approve_low_risk: true,
        }),
      );
      expect(micro.decision).toBe("REQUIRE_HUMAN_APPROVAL");
      expect(micro.reason_code).toBe(
        "ai-or-machine-actor-requires-human-approval",
      );
      expect(micro.required_approvals).toBe(1);
    }
  });

  it("regulators cannot transact on the internal surface", () => {
    expect(
      evaluateMockTransactionPolicy(base({ actor_class: "REGULATOR" })).decision,
    ).toBe("FORBIDDEN");
  });

  it("high value requires dual control — two approvals, even for humans", () => {
    const r = evaluateMockTransactionPolicy(
      base({ amount_usd: DUAL_CONTROL_MIN_USD }),
    );
    expect(r.decision).toBe("REQUIRE_DUAL_CONTROL");
    expect(r.required_approvals).toBe(2);
    // AI at high value is also dual-control (the stricter gate wins).
    const ai = evaluateMockTransactionPolicy(
      base({ actor_class: "AI_EMPLOYEE", amount_usd: 5000 }),
    );
    expect(ai.decision).toBe("REQUIRE_DUAL_CONTROL");
  });

  it("micro auto-approve happens ONLY for humans, only when the org opted in", () => {
    const allowed = evaluateMockTransactionPolicy(
      base({
        amount_usd: MICROTRANSACTION_MAX_USD,
        org_requires_human_approval: false,
        org_auto_approve_low_risk: true,
      }),
    );
    expect(allowed.decision).toBe("AUTO_APPROVE");
    expect(allowed.required_approvals).toBe(0);
    // Org didn't opt in → approval required even for $0.10.
    const noOptIn = evaluateMockTransactionPolicy(
      base({
        amount_usd: 0.1,
        org_requires_human_approval: false,
        org_auto_approve_low_risk: false,
      }),
    );
    expect(noOptIn.decision).toBe("REQUIRE_HUMAN_APPROVAL");
    // Org-wide human-approval posture overrides the micro lane.
    const orgGate = evaluateMockTransactionPolicy(
      base({
        amount_usd: 0.1,
        org_requires_human_approval: true,
        org_auto_approve_low_risk: true,
      }),
    );
    expect(orgGate.decision).toBe("REQUIRE_HUMAN_APPROVAL");
  });

  it("standard human transactions require one human approval by default", () => {
    const r = evaluateMockTransactionPolicy(
      base({ amount_usd: 50, org_requires_human_approval: false }),
    );
    expect(r.decision).toBe("REQUIRE_HUMAN_APPROVAL");
    expect(r.required_approvals).toBe(1);
  });

  it("the 5 transaction audit literals are registered (type union + runtime array)", () => {
    for (const literal of [
      "TRANSACTION_INTENT_PROPOSED",
      "TRANSACTION_INTENT_APPROVED",
      "TRANSACTION_INTENT_DENIED",
      "TRANSACTION_INTENT_REVOKED",
      "TRANSACTION_MOCK_SETTLED",
    ]) {
      expect(AUDIT_EVENT_TYPE_VALUES).toContain(literal);
      expect(isKnownAuditEventType(literal)).toBe(true);
    }
  });

  it("policy reason codes are closed-vocab markers, never free prose", () => {
    const samples = [
      evaluateMockTransactionPolicy(base()),
      evaluateMockTransactionPolicy(base({ rail: "CIRCLE_GATEWAY" })),
      evaluateMockTransactionPolicy(base({ amount_usd: 9999 })),
    ];
    for (const s of samples) {
      expect(s.reason_code).toMatch(/^[a-z0-9-]+$/);
    }
  });
});

describe("Phase 1256C — Work Comms schema package is present and complete", () => {
  it("all 10 Work Comms tables + 4 enums exist in the Prisma schema (additive package)", async () => {
    const { readFileSync } = await import("node:fs");
    const schema = readFileSync(
      new URL(
        "../../packages/database/prisma/schema.prisma",
        import.meta.url,
      ),
      "utf8",
    );
    for (const table of [
      "work_comms_identities",
      "work_comms_org_profiles",
      "work_comms_threads",
      "work_comms_participants",
      "work_comms_messages",
      "work_comms_call_sessions",
      "work_comms_transcript_segments",
      "work_comms_extractions",
      "work_comms_consent_events",
      "work_comms_retention_policies",
    ]) {
      expect(schema, table).toContain(`@@map("${table}")`);
    }
    for (const en of [
      "WorkCommsConsentState",
      "WorkCommsThreadType",
      "WorkCommsParticipantRole",
      "WorkCommsMessageSource",
    ]) {
      expect(schema).toContain(`enum ${en}`);
    }
    // Phone numbers are never plaintext: hash + secret ref only.
    expect(schema).toContain("phone_e164_hash");
    expect(schema).toContain("phone_secret_ref");
    expect(schema).not.toContain("phone_e164_plain");
  });
});
