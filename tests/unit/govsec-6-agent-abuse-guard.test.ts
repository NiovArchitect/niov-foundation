// FILE: govsec-6-agent-abuse-guard.test.ts
// PURPOSE: Unit tests for GOVSEC.6 pure-function guards at
//          apps/api/src/services/govsec/agent-abuse-guard.ts.
//          Verifies the 4 helper assertions against canonical
//          confused-deputy + AI-grantor + cross-tenant + AI-agent
//          connector-write scenarios.
// CONNECTS TO: apps/api/src/services/govsec/agent-abuse-guard.ts.

import { describe, expect, it } from "vitest";
import {
  assertAiAgentMayInvokeConnector,
  assertAiGrantConstraints,
  assertNotConfusedDeputy,
  assertSameOrgConnectorTarget,
  type CallerIdentity,
} from "../../apps/api/src/services/govsec/agent-abuse-guard";

const PERSON_A: CallerIdentity = {
  entity_id: "person-a",
  entity_type: "PERSON",
  org_id: "org-1",
};
const PERSON_B: CallerIdentity = {
  entity_id: "person-b",
  entity_type: "PERSON",
  org_id: "org-2",
};
const AI_AGENT: CallerIdentity = {
  entity_id: "ai-1",
  entity_type: "AI_AGENT",
  org_id: "org-1",
};
const ORPHAN_PERSON: CallerIdentity = {
  entity_id: "person-orphan",
  entity_type: "PERSON",
  org_id: null,
};

describe("GOVSEC.6 — assertNotConfusedDeputy", () => {
  it("allows when caller owns the Action row", () => {
    const result = assertNotConfusedDeputy(PERSON_A, {
      source_entity_id: "person-a",
    });
    expect(result.ok).toBe(true);
  });

  it("denies when caller is not the Action owner (confused-deputy)", () => {
    const result = assertNotConfusedDeputy(PERSON_A, {
      source_entity_id: "person-b",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("CALLER_NOT_ACTION_OWNER");
    }
  });

  it("denies AI_AGENT trying to drive another principal's Action", () => {
    const result = assertNotConfusedDeputy(AI_AGENT, {
      source_entity_id: "person-a",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("CALLER_NOT_ACTION_OWNER");
    }
  });
});

describe("GOVSEC.6 — assertAiGrantConstraints (RULE 0 sovereignty)", () => {
  it("allows PERSON → PERSON LONG_TERM", () => {
    const result = assertAiGrantConstraints({
      grantor_type: "PERSON",
      grantee_type: "PERSON",
      duration_type: "LONG_TERM",
    });
    expect(result.ok).toBe(true);
  });

  it("allows PERSON → AI_AGENT TEMPORARY", () => {
    const result = assertAiGrantConstraints({
      grantor_type: "PERSON",
      grantee_type: "AI_AGENT",
      duration_type: "TEMPORARY",
    });
    expect(result.ok).toBe(true);
  });

  it("allows AI_AGENT → PERSON SESSION_ONLY", () => {
    const result = assertAiGrantConstraints({
      grantor_type: "AI_AGENT",
      grantee_type: "PERSON",
      duration_type: "SESSION_ONLY",
    });
    expect(result.ok).toBe(true);
  });

  it("denies AI_AGENT → AI_AGENT (cannot grant to AI)", () => {
    const result = assertAiGrantConstraints({
      grantor_type: "AI_AGENT",
      grantee_type: "AI_AGENT",
      duration_type: "SESSION_ONLY",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("AI_GRANTOR_TO_AI_GRANTEE");
    }
  });

  it("denies AI_AGENT grantor LONG_TERM", () => {
    const result = assertAiGrantConstraints({
      grantor_type: "AI_AGENT",
      grantee_type: "PERSON",
      duration_type: "LONG_TERM",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("AI_GRANTOR_LONG_TERM_FORBIDDEN");
    }
  });

  it("denies AI_AGENT grantor PERMANENT", () => {
    const result = assertAiGrantConstraints({
      grantor_type: "AI_AGENT",
      grantee_type: "PERSON",
      duration_type: "PERMANENT",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("AI_GRANTOR_PERMANENT_FORBIDDEN");
    }
  });

  it("denies AI_AGENT → AI_AGENT even with PERMANENT (multiple violations)", () => {
    const result = assertAiGrantConstraints({
      grantor_type: "AI_AGENT",
      grantee_type: "AI_AGENT",
      duration_type: "PERMANENT",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // AI-to-AI fires first per the helper's evaluation order
      expect(result.code).toBe("AI_GRANTOR_TO_AI_GRANTEE");
    }
  });
});

describe("GOVSEC.6 — assertSameOrgConnectorTarget", () => {
  it("allows same-org connector access", () => {
    const result = assertSameOrgConnectorTarget(PERSON_A, { org_id: "org-1" });
    expect(result.ok).toBe(true);
  });

  it("denies cross-tenant connector access", () => {
    const result = assertSameOrgConnectorTarget(PERSON_A, { org_id: "org-2" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("CALLER_TENANT_MISMATCH");
    }
  });

  it("denies caller with null org_id (orphaned principal)", () => {
    const result = assertSameOrgConnectorTarget(ORPHAN_PERSON, {
      org_id: "org-1",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("CALLER_TENANT_MISMATCH");
    }
  });

  it("denies cross-tenant even when caller is a PERSON principal", () => {
    const result = assertSameOrgConnectorTarget(PERSON_B, { org_id: "org-1" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("CALLER_TENANT_MISMATCH");
    }
  });
});

describe("GOVSEC.6 — assertAiAgentMayInvokeConnector", () => {
  it("allows PERSON caller for both read and write intents", () => {
    expect(
      assertAiAgentMayInvokeConnector(PERSON_A, { write_intent: false }).ok,
    ).toBe(true);
    expect(
      assertAiAgentMayInvokeConnector(PERSON_A, { write_intent: true }).ok,
    ).toBe(true);
  });

  it("allows AI_AGENT caller for read intent", () => {
    const result = assertAiAgentMayInvokeConnector(AI_AGENT, {
      write_intent: false,
    });
    expect(result.ok).toBe(true);
  });

  it("denies AI_AGENT caller for write intent (must route through human approval)", () => {
    const result = assertAiAgentMayInvokeConnector(AI_AGENT, {
      write_intent: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("AI_AGENT_CONNECTOR_TARGET_UNAUTHORIZED");
    }
  });
});

describe("GOVSEC.6 — failure codes are closed-vocab", () => {
  it("never returns a code outside the documented enum", () => {
    const codes = new Set<string>();
    const samples = [
      assertNotConfusedDeputy(PERSON_A, { source_entity_id: "person-b" }),
      assertAiGrantConstraints({
        grantor_type: "AI_AGENT",
        grantee_type: "AI_AGENT",
        duration_type: "SESSION_ONLY",
      }),
      assertAiGrantConstraints({
        grantor_type: "AI_AGENT",
        grantee_type: "PERSON",
        duration_type: "LONG_TERM",
      }),
      assertAiGrantConstraints({
        grantor_type: "AI_AGENT",
        grantee_type: "PERSON",
        duration_type: "PERMANENT",
      }),
      assertSameOrgConnectorTarget(PERSON_A, { org_id: "org-2" }),
      assertAiAgentMayInvokeConnector(AI_AGENT, { write_intent: true }),
    ];
    const allowed = new Set([
      "CALLER_NOT_ACTION_OWNER",
      "AI_GRANTOR_TO_AI_GRANTEE",
      "AI_GRANTOR_LONG_TERM_FORBIDDEN",
      "AI_GRANTOR_PERMANENT_FORBIDDEN",
      "CALLER_TENANT_MISMATCH",
      "AI_AGENT_CONNECTOR_TARGET_UNAUTHORIZED",
    ]);
    for (const result of samples) {
      if (!result.ok) codes.add(result.code);
    }
    for (const code of codes) {
      expect(allowed.has(code)).toBe(true);
    }
    // Ensure all 6 failure codes were exercised at least once
    expect(codes.size).toBe(6);
  });
});
