// FILE: voice-envelope-runtime.test.ts (integration)
// PURPOSE: VF.3 integration tests asserting the VoiceIntentEnvelope
//          flows through the real Foundation audit chain end-to-
//          end. Verifies:
//          - constructEnvelope writes a real VOICE_INTENT_RECEIVED
//            audit_event row against the Postgres test schema
//          - The audit row carries the SAFE details schema (no
//            transcript_text leak; no Bearer / no secret tokens)
//          - The audit chain remains verifiable end-to-end via
//            verifyAuditChain (chain integrity preserved per
//            ADR-0002)
//          - emitVoiceLifecycleAudit produces consecutive audit
//            rows that thread into the same chain
//          - Risk-tier discrimination is preserved across envelopes
//            (LOW / MEDIUM / HIGH each get the right state +
//            governance hooks)
//          - Different VoiceSourceSurface enum values each persist
//            distinctly without cross-pollution
// CONNECTS TO: apps/api/src/services/voice/voice-intent-envelope.ts
//              + packages/database/src/queries/audit.ts.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  constructEnvelope,
  emitVoiceLifecycleAudit,
  type VoiceSourceSurface,
} from "@niov/api";
import { createEntity, prisma, verifyAuditChain } from "@niov/database";
import {
  cleanupTestData,
  ensureAuditTriggers,
  makeEntityInput,
} from "../helpers.js";

let callerEntityId: string;
let tenantOrgEntityId: string;

beforeAll(async () => {
  await ensureAuditTriggers();
  await cleanupTestData();
  // Two distinct entities — caller (e.g., the human speaking) +
  // tenant_org (e.g., the org the caller belongs to). Voice
  // intents must thread caller_entity_id and tenant_org_entity_id
  // through every audit row to prove RULE 0 sovereignty + tenant
  // isolation at the audit-substrate register.
  const caller = await createEntity(makeEntityInput());
  const tenant = await createEntity(makeEntityInput());
  callerEntityId = caller.entity_id;
  tenantOrgEntityId = tenant.entity_id;
});

afterAll(async () => {
  await cleanupTestData();
  await prisma.$disconnect();
});

describe("VF.3 — constructEnvelope writes real VOICE_INTENT_RECEIVED audit row", () => {
  it("writes a real audit_event row with event_type VOICE_INTENT_RECEIVED", async () => {
    const envelope = await constructEnvelope({
      caller_entity_id: callerEntityId,
      tenant_org_entity_id: tenantOrgEntityId,
      source_surface: "AI_TWIN",
      transcript_text: "Summarize my unread Linear issues",
      intent_class: "LOW",
    });
    expect(envelope.audit_event_id).toBeDefined();
    // Pull the audit row by id and assert event_type literal.
    const row = await prisma.auditEvent.findUnique({
      where: { audit_id: envelope.audit_event_id },
    });
    expect(row).not.toBeNull();
    expect(row?.event_type).toBe("VOICE_INTENT_RECEIVED");
    expect(row?.outcome).toBe("SUCCESS");
    expect(row?.actor_entity_id).toBe(callerEntityId);
    expect(row?.target_entity_id).toBe(tenantOrgEntityId);
  });

  it("audit details carry the SAFE 8-field schema (no transcript_text / no Bearer / no secret leak)", async () => {
    const envelope = await constructEnvelope({
      caller_entity_id: callerEntityId,
      tenant_org_entity_id: tenantOrgEntityId,
      source_surface: "AI_TEAMMATE",
      transcript_text:
        "Send my secret bot-token xoxb-shouldnt-leak via this transcript",
      intent_class: "MEDIUM",
    });
    const row = await prisma.auditEvent.findUnique({
      where: { audit_id: envelope.audit_event_id },
    });
    const details = row?.details as Record<string, unknown>;
    expect(Object.keys(details).sort()).toEqual([
      "approval_chain_state",
      "confirmation_state",
      "intent_class",
      "intent_id",
      "retention_class",
      "source_surface",
      "transcript_redacted",
      "transcript_redaction_reason",
    ]);
    // RULE 0 + ADR-0085 §5 FORBIDDEN proof: the transcript prose
    // itself, the simulated "secret bot-token", and the Bearer
    // marker must never persist anywhere in the audit row's
    // serialized form.
    const serialized = JSON.stringify(row);
    expect(serialized).not.toMatch(/xoxb-/);
    expect(serialized).not.toMatch(/shouldnt-leak/);
    expect(serialized).not.toMatch(/bearer/i);
    expect(serialized).not.toMatch(/Send my secret bot-token/);
  });

  it("preserves audit chain integrity end-to-end (verifyAuditChain reports brokenAt null)", async () => {
    await constructEnvelope({
      caller_entity_id: callerEntityId,
      tenant_org_entity_id: tenantOrgEntityId,
      source_surface: "ADMIN_TWIN",
      transcript_text: "Show me pending approvals",
      intent_class: "LOW",
    });
    const chain = await verifyAuditChain(callerEntityId);
    expect(chain.brokenAt).toBeNull();
  });
});

describe("VF.3 — risk-tier discrimination persisted in audit details", () => {
  const matrix: Array<{
    intent_class: "LOW" | "MEDIUM" | "HIGH";
    expectedConfirmation: string;
    expectedApprovalChain: string;
    surface: VoiceSourceSurface;
  }> = [
    {
      intent_class: "LOW",
      expectedConfirmation: "NOT_NEEDED",
      expectedApprovalChain: "NONE",
      surface: "AI_TWIN",
    },
    {
      intent_class: "MEDIUM",
      expectedConfirmation: "PENDING",
      expectedApprovalChain: "NONE",
      surface: "PROPOSED_ACTION",
    },
    {
      intent_class: "HIGH",
      expectedConfirmation: "PENDING",
      expectedApprovalChain: "PENDING",
      surface: "APPROVAL_REQUEST",
    },
  ];

  it.each(matrix)(
    "intent_class $intent_class → confirmation=$expectedConfirmation + approval=$expectedApprovalChain in audit details",
    async (testCase) => {
      const envelope = await constructEnvelope({
        caller_entity_id: callerEntityId,
        tenant_org_entity_id: tenantOrgEntityId,
        source_surface: testCase.surface,
        transcript_text: `Test transcript for ${testCase.intent_class} tier`,
        intent_class: testCase.intent_class,
      });
      const row = await prisma.auditEvent.findUnique({
        where: { audit_id: envelope.audit_event_id },
      });
      const details = row?.details as Record<string, unknown>;
      expect(details["intent_class"]).toBe(testCase.intent_class);
      expect(details["confirmation_state"]).toBe(testCase.expectedConfirmation);
      expect(details["approval_chain_state"]).toBe(
        testCase.expectedApprovalChain,
      );
    },
  );
});

describe("VF.3 — emitVoiceLifecycleAudit threads through the same chain", () => {
  it("VOICE_INTENT_CONFIRMED audit row carries the SAFE schema + correct actor/target", async () => {
    const envelope = await constructEnvelope({
      caller_entity_id: callerEntityId,
      tenant_org_entity_id: tenantOrgEntityId,
      source_surface: "PROPOSED_ACTION",
      transcript_text: "Create a proposed action to send the standup follow-up",
      intent_class: "MEDIUM",
    });
    const result = await emitVoiceLifecycleAudit({
      literal: "VOICE_INTENT_CONFIRMED",
      intent_id: envelope.intent_id,
      caller_entity_id: callerEntityId,
      tenant_org_entity_id: tenantOrgEntityId,
      source_surface: "PROPOSED_ACTION",
      intent_class: "MEDIUM",
      confirmation_state: "CONFIRMED",
      approval_chain_state: "NONE",
      transcript_redacted: false,
      transcript_redaction_reason: null,
      retention_class: "STANDARD",
    });
    const row = await prisma.auditEvent.findUnique({
      where: { audit_id: result.audit_event_id },
    });
    expect(row?.event_type).toBe("VOICE_INTENT_CONFIRMED");
    expect(row?.actor_entity_id).toBe(callerEntityId);
    expect(row?.target_entity_id).toBe(tenantOrgEntityId);
    const details = row?.details as Record<string, unknown>;
    expect(details["intent_id"]).toBe(envelope.intent_id);
    expect(details["confirmation_state"]).toBe("CONFIRMED");
    // SAFE schema preserved at lifecycle audit register.
    expect(Object.keys(details).sort()).toEqual([
      "approval_chain_state",
      "confirmation_state",
      "intent_class",
      "intent_id",
      "retention_class",
      "source_surface",
      "transcript_redacted",
      "transcript_redaction_reason",
    ]);
  });

  it("audit chain stays verifiable after envelope + lifecycle audit emissions", async () => {
    const envelope = await constructEnvelope({
      caller_entity_id: callerEntityId,
      tenant_org_entity_id: tenantOrgEntityId,
      source_surface: "APPROVAL_REQUEST",
      transcript_text: "Approve the pending workflow execution",
      intent_class: "HIGH",
    });
    await emitVoiceLifecycleAudit({
      literal: "VOICE_INTENT_CONFIRMED",
      intent_id: envelope.intent_id,
      caller_entity_id: callerEntityId,
      tenant_org_entity_id: tenantOrgEntityId,
      source_surface: "APPROVAL_REQUEST",
      intent_class: "HIGH",
      confirmation_state: "CONFIRMED",
      approval_chain_state: "PENDING",
      transcript_redacted: false,
      transcript_redaction_reason: null,
      retention_class: "STANDARD",
    });
    await emitVoiceLifecycleAudit({
      literal: "VOICE_INTENT_DELIVERED",
      intent_id: envelope.intent_id,
      caller_entity_id: callerEntityId,
      tenant_org_entity_id: tenantOrgEntityId,
      source_surface: "APPROVAL_REQUEST",
      intent_class: "HIGH",
      confirmation_state: "CONFIRMED",
      approval_chain_state: "APPROVED",
      transcript_redacted: false,
      transcript_redaction_reason: null,
      retention_class: "STANDARD",
    });
    const chain = await verifyAuditChain(callerEntityId);
    expect(chain.brokenAt).toBeNull();
  });
});

describe("VF.3 — different VoiceSourceSurface values persist distinctly", () => {
  it("each surface persists its enum value to audit details without cross-pollution", async () => {
    const surfaces: VoiceSourceSurface[] = [
      "ONBOARDING",
      "HIVE",
      "CONNECTOR_QUESTION",
      "EXECUTIVE_BRIEFING",
    ];
    const auditIds: string[] = [];
    for (const surface of surfaces) {
      const envelope = await constructEnvelope({
        caller_entity_id: callerEntityId,
        tenant_org_entity_id: tenantOrgEntityId,
        source_surface: surface,
        transcript_text: `Test transcript for surface ${surface}`,
        intent_class: "LOW",
      });
      auditIds.push(envelope.audit_event_id);
    }
    for (let i = 0; i < surfaces.length; i++) {
      const row = await prisma.auditEvent.findUnique({
        where: { audit_id: auditIds[i]! },
      });
      const details = row?.details as Record<string, unknown>;
      expect(details["source_surface"]).toBe(surfaces[i]);
    }
  });
});
