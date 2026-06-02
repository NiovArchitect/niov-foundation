// FILE: voice-provider-text-only.test.ts
// PURPOSE: VF.2 unit tests for the voice-first runtime substrate
//          per ADR-0085 §4 + §5 + §8. Verifies:
//            - VoiceProviderAdapter dispatch (4 adapter slots →
//              TEXT_ONLY fail-closed fallback for VF.3/VF.6
//              forward-substrate slots)
//            - VOICE_PROVIDER_TYPES frozen-anchor contract
//              (mirrors CONNECTOR_REGISTRY frozen anchor)
//            - TextOnlyVoiceProvider transcribe + synthesize
//              success + 8 closed-vocab failure codes
//            - VOICE_SOURCE_SURFACES enumerates all 13 canonical
//              surfaces from ADR-0085 §7
//            - constructEnvelope emits VOICE_INTENT_RECEIVED audit
//              event BEFORE returning per RULE 4
//            - Risk-tier discrimination: LOW → NOT_NEEDED + NONE;
//              MEDIUM → PENDING + NONE; HIGH → PENDING + PENDING
//            - SAFE audit details schema (no transcript_text leak;
//              no Bearer / no OAuth / no secret in details)
//            - constructEnvelope VALIDATION rejects unknown
//              surface / unknown intent_class / missing caller /
//              missing tenant
//            - emitVoiceLifecycleAudit fires the 5 lifecycle
//              literals correctly + carries the same SAFE schema
//
// CONNECTS TO:
//   - apps/api/src/services/voice/voice-provider.service.ts
//   - apps/api/src/services/voice/text-only-voice.provider.ts
//   - apps/api/src/services/voice/voice-intent-envelope.ts
//   - packages/database/src/queries/audit.ts (AUDIT_EVENT_TYPE_VALUES
//     extension verifying 6 NEW voice literals appended)

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock @niov/database writeAuditEvent BEFORE importing voice
// modules so the mock takes effect at module load. Use vi.hoisted
// so the mock function reference exists when vi.mock's factory
// runs (vitest hoists vi.mock above imports but not local consts).
const { writeAuditEventMock } = vi.hoisted(() => ({
  writeAuditEventMock: vi.fn(),
}));

vi.mock("@niov/database", async () => {
  const actual: Record<string, unknown> = await vi.importActual(
    "@niov/database",
  );
  return {
    ...actual,
    writeAuditEvent: writeAuditEventMock,
  };
});

import {
  TextOnlyVoiceProvider,
  VOICE_PROVIDER_TYPES,
  VOICE_SOURCE_SURFACES,
  constructEnvelope,
  emitVoiceLifecycleAudit,
  getVoiceProviderAsync,
  isVoiceSourceSurface,
  type ConstructEnvelopeInput,
  type VoiceProviderType,
  type VoiceSourceSurface,
} from "@niov/api";
import { AUDIT_EVENT_TYPE_VALUES } from "@niov/database";

beforeEach(() => {
  writeAuditEventMock.mockReset();
  writeAuditEventMock.mockResolvedValue({
    audit_id: "11111111-1111-1111-1111-111111111111",
  });
});

afterEach(() => {
  writeAuditEventMock.mockReset();
});

describe("VF.2 — VOICE_PROVIDER_TYPES frozen-anchor contract", () => {
  it("contains exactly 4 adapter slots (TEXT_ONLY + LOCAL_MOCK + SESAME + FUTURE)", () => {
    expect(VOICE_PROVIDER_TYPES.length).toBe(4);
    expect([...VOICE_PROVIDER_TYPES].sort()).toEqual([
      "FUTURE",
      "LOCAL_MOCK",
      "SESAME",
      "TEXT_ONLY",
    ]);
  });

  it("is frozen — Object.isFrozen returns true", () => {
    expect(Object.isFrozen(VOICE_PROVIDER_TYPES)).toBe(true);
  });
});

describe("VF.2 — getVoiceProviderAsync dispatch", () => {
  it("TEXT_ONLY returns a TextOnlyVoiceProvider instance", async () => {
    const provider = await getVoiceProviderAsync("TEXT_ONLY");
    expect(provider).toBeInstanceOf(TextOnlyVoiceProvider);
  });

  it("LOCAL_MOCK dispatches to LocalMockVoiceProvider (VF.3 LANDED)", async () => {
    // VF.3 LANDED: LOCAL_MOCK is now a real concrete adapter, no
    // longer a TextOnlyVoiceProvider fallback. Imported here at
    // call-time so this assertion does not require touching the
    // module-level imports.
    const { LocalMockVoiceProvider } = await import("@niov/api");
    const provider = await getVoiceProviderAsync("LOCAL_MOCK");
    expect(provider).toBeInstanceOf(LocalMockVoiceProvider);
  });

  it("SESAME falls back to TextOnlyVoiceProvider (forward-substrate at VF.6; Founder-gated)", async () => {
    const provider = await getVoiceProviderAsync("SESAME");
    expect(provider).toBeInstanceOf(TextOnlyVoiceProvider);
  });

  it("FUTURE falls back to TextOnlyVoiceProvider (adapter seam; no concrete impl)", async () => {
    const provider = await getVoiceProviderAsync("FUTURE");
    expect(provider).toBeInstanceOf(TextOnlyVoiceProvider);
  });

  it("unknown VoiceProviderType fails closed to TextOnlyVoiceProvider", async () => {
    // Type assertion to test the fail-closed default branch.
    const provider = await getVoiceProviderAsync(
      "SESAME_PREMIUM" as VoiceProviderType,
    );
    expect(provider).toBeInstanceOf(TextOnlyVoiceProvider);
  });
});

describe("VF.2 — TextOnlyVoiceProvider transcribe success", () => {
  it("returns the typed payload as the transcript verbatim", async () => {
    const provider = new TextOnlyVoiceProvider();
    const result = await provider.transcribe({
      text_only_payload: "What did I commit to in yesterday's meeting?",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.transcript_text).toBe(
        "What did I commit to in yesterday's meeting?",
      );
      expect(result.redacted).toBe(false);
      expect(result.mode).toBe("fixture");
    }
  });
});

describe("VF.2 — TextOnlyVoiceProvider transcribe validation", () => {
  it("rejects audio_ref without text_only_payload", async () => {
    const provider = new TextOnlyVoiceProvider();
    const result = await provider.transcribe({});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error_class).toBe("VALIDATION");
    }
  });

  it("rejects empty text_only_payload", async () => {
    const provider = new TextOnlyVoiceProvider();
    const result = await provider.transcribe({ text_only_payload: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error_class).toBe("VALIDATION");
    }
  });
});

describe("VF.2 — TextOnlyVoiceProvider synthesize", () => {
  it("returns identity-equal audio_ref for valid text + voice_id", async () => {
    const provider = new TextOnlyVoiceProvider();
    const result = await provider.synthesize(
      "Your Twin will draft a reply.",
      "default-voice",
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.audio_ref.text_only_payload).toBe(
        "Your Twin will draft a reply.",
      );
      expect(result.mode).toBe("fixture");
    }
  });

  it("rejects empty text as VALIDATION", async () => {
    const provider = new TextOnlyVoiceProvider();
    const result = await provider.synthesize("", "default-voice");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error_class).toBe("VALIDATION");
    }
  });

  it("rejects empty voice_id as VALIDATION", async () => {
    const provider = new TextOnlyVoiceProvider();
    const result = await provider.synthesize("Hello", "");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error_class).toBe("VALIDATION");
    }
  });
});

describe("VF.2 — VOICE_SOURCE_SURFACES frozen-anchor (13 canonical surfaces)", () => {
  it("contains exactly 13 canonical surfaces from ADR-0085 §7", () => {
    expect(VOICE_SOURCE_SURFACES.length).toBe(13);
    expect([...VOICE_SOURCE_SURFACES].sort()).toEqual([
      "ADMIN_TWIN",
      "AGENT_PLAYGROUND",
      "AI_TEAMMATE",
      "AI_TWIN",
      "APPROVAL_REQUEST",
      "AUDIT_EXPLANATION",
      "CONNECTOR_QUESTION",
      "EXECUTIVE_BRIEFING",
      "HIVE",
      "MEETING_FOLLOWUP",
      "ONBOARDING",
      "PROPOSED_ACTION",
      "WORKFLOW_RECOMMENDATION",
    ]);
  });

  it("is frozen — Object.isFrozen returns true", () => {
    expect(Object.isFrozen(VOICE_SOURCE_SURFACES)).toBe(true);
  });

  it("isVoiceSourceSurface accepts every canonical value", () => {
    for (const surface of VOICE_SOURCE_SURFACES) {
      expect(isVoiceSourceSurface(surface)).toBe(true);
    }
  });

  it("isVoiceSourceSurface rejects unknown values", () => {
    expect(isVoiceSourceSurface("UNKNOWN_SURFACE")).toBe(false);
    expect(isVoiceSourceSurface("")).toBe(false);
    expect(isVoiceSourceSurface(null)).toBe(false);
    expect(isVoiceSourceSurface(123)).toBe(false);
  });
});

describe("VF.2 — AUDIT_EVENT_TYPE_VALUES extension: 6 NEW voice literals appended", () => {
  it.each([
    "VOICE_INTENT_RECEIVED",
    "VOICE_INTENT_CONFIRMED",
    "VOICE_INTENT_REJECTED",
    "VOICE_INTENT_EXPIRED",
    "VOICE_INTENT_REDACTED",
    "VOICE_INTENT_DELIVERED",
  ])("includes %s", (literal) => {
    expect(AUDIT_EVENT_TYPE_VALUES).toContain(literal);
  });
});

function makeInput(
  overrides: Partial<ConstructEnvelopeInput> = {},
): ConstructEnvelopeInput {
  return {
    caller_entity_id: "caller-1",
    tenant_org_entity_id: "tenant-1",
    source_surface: "AI_TWIN",
    transcript_text: "Summarize my unread Linear issues",
    intent_class: "LOW",
    ...overrides,
  };
}

describe("VF.2 — constructEnvelope risk-tier discrimination", () => {
  it("LOW → confirmation NOT_NEEDED + approval NONE", async () => {
    const envelope = await constructEnvelope(makeInput({ intent_class: "LOW" }));
    expect(envelope.confirmation_state).toBe("NOT_NEEDED");
    expect(envelope.approval_chain_state).toBe("NONE");
  });

  it("MEDIUM → confirmation PENDING + approval NONE", async () => {
    const envelope = await constructEnvelope(
      makeInput({ intent_class: "MEDIUM", source_surface: "PROPOSED_ACTION" }),
    );
    expect(envelope.confirmation_state).toBe("PENDING");
    expect(envelope.approval_chain_state).toBe("NONE");
  });

  it("HIGH → confirmation PENDING + approval PENDING", async () => {
    const envelope = await constructEnvelope(
      makeInput({ intent_class: "HIGH", source_surface: "APPROVAL_REQUEST" }),
    );
    expect(envelope.confirmation_state).toBe("PENDING");
    expect(envelope.approval_chain_state).toBe("PENDING");
  });
});

describe("VF.2 — constructEnvelope emits VOICE_INTENT_RECEIVED audit before returning (RULE 4)", () => {
  it("calls writeAuditEvent exactly once with VOICE_INTENT_RECEIVED literal", async () => {
    await constructEnvelope(makeInput());
    expect(writeAuditEventMock).toHaveBeenCalledTimes(1);
    const call = writeAuditEventMock.mock.calls[0]?.[0];
    expect(call?.event_type).toBe("VOICE_INTENT_RECEIVED");
    expect(call?.outcome).toBe("SUCCESS");
    expect(call?.actor_entity_id).toBe("caller-1");
    expect(call?.target_entity_id).toBe("tenant-1");
  });

  it("audit details carry SAFE schema: intent_id + source_surface + intent_class + confirmation_state + approval_chain_state + transcript_redacted + transcript_redaction_reason + retention_class", async () => {
    await constructEnvelope(
      makeInput({ intent_class: "MEDIUM", source_surface: "AI_TEAMMATE" }),
    );
    const details = writeAuditEventMock.mock.calls[0]?.[0]?.details;
    expect(details).toBeDefined();
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

  it("audit details NEVER carry transcript_text (RULE 0 + ADR-0085 §5 FORBIDDEN)", async () => {
    await constructEnvelope(
      makeInput({ transcript_text: "send my secret bot-token xoxb-very-secret" }),
    );
    const details = writeAuditEventMock.mock.calls[0]?.[0]?.details;
    expect(details).not.toHaveProperty("transcript_text");
    // Serialized form must never echo the transcript content.
    const serialized = JSON.stringify(details);
    expect(serialized).not.toMatch(/xoxb-/);
    expect(serialized).not.toMatch(/secret/);
    expect(serialized).not.toMatch(/bearer/i);
  });

  it("envelope.audit_event_id is set from the audit write result", async () => {
    writeAuditEventMock.mockResolvedValueOnce({
      audit_id: "22222222-2222-2222-2222-222222222222",
    });
    const envelope = await constructEnvelope(makeInput());
    expect(envelope.audit_event_id).toBe(
      "22222222-2222-2222-2222-222222222222",
    );
  });

  it("if writeAuditEvent rejects, constructEnvelope rejects (RULE 4 fail-closed)", async () => {
    writeAuditEventMock.mockRejectedValueOnce(new Error("audit chain broken"));
    await expect(constructEnvelope(makeInput())).rejects.toThrow(
      /audit chain broken/,
    );
  });
});

describe("VF.2 — constructEnvelope VALIDATION", () => {
  it("rejects unknown source_surface", async () => {
    await expect(
      constructEnvelope(
        makeInput({ source_surface: "UNKNOWN" as VoiceSourceSurface }),
      ),
    ).rejects.toThrow(/source_surface/);
  });

  it("rejects unknown intent_class", async () => {
    await expect(
      constructEnvelope(
        makeInput({ intent_class: "CRITICAL" as ConstructEnvelopeInput["intent_class"] }),
      ),
    ).rejects.toThrow(/intent_class/);
  });

  it("rejects empty caller_entity_id", async () => {
    await expect(
      constructEnvelope(makeInput({ caller_entity_id: "" })),
    ).rejects.toThrow(/caller_entity_id/);
  });

  it("rejects empty tenant_org_entity_id", async () => {
    await expect(
      constructEnvelope(makeInput({ tenant_org_entity_id: "" })),
    ).rejects.toThrow(/tenant_org_entity_id/);
  });
});

describe("VF.2 — constructEnvelope retention + redaction defaults", () => {
  it("defaults retention_class to STANDARD when not provided", async () => {
    const envelope = await constructEnvelope(makeInput());
    expect(envelope.retention_class).toBe("STANDARD");
  });

  it("defaults transcript_redacted to false and transcript_redaction_reason to null", async () => {
    const envelope = await constructEnvelope(makeInput());
    expect(envelope.transcript_redacted).toBe(false);
    expect(envelope.transcript_redaction_reason).toBeNull();
  });

  it("when transcript_redacted=true without explicit reason, defaults reason to FORBIDDEN_INTENT", async () => {
    const envelope = await constructEnvelope(
      makeInput({ transcript_redacted: true }),
    );
    expect(envelope.transcript_redacted).toBe(true);
    expect(envelope.transcript_redaction_reason).toBe("FORBIDDEN_INTENT");
  });

  it("respects explicit transcript_redaction_reason when transcript_redacted=true", async () => {
    const envelope = await constructEnvelope(
      makeInput({
        transcript_redacted: true,
        transcript_redaction_reason: "NON_WORK",
      }),
    );
    expect(envelope.transcript_redaction_reason).toBe("NON_WORK");
  });
});

describe("VF.2 — emitVoiceLifecycleAudit fires the 5 lifecycle literals", () => {
  const literals = [
    "VOICE_INTENT_CONFIRMED",
    "VOICE_INTENT_REJECTED",
    "VOICE_INTENT_EXPIRED",
    "VOICE_INTENT_REDACTED",
    "VOICE_INTENT_DELIVERED",
  ] as const;

  it.each(literals)(
    "emitVoiceLifecycleAudit fires literal %s with SAFE details + returns audit_event_id",
    async (literal) => {
      writeAuditEventMock.mockResolvedValueOnce({
        audit_id: "33333333-3333-3333-3333-333333333333",
      });
      const result = await emitVoiceLifecycleAudit({
        literal,
        intent_id: "intent-1",
        caller_entity_id: "caller-1",
        tenant_org_entity_id: "tenant-1",
        source_surface: "AI_TWIN",
        intent_class: "MEDIUM",
        confirmation_state: "CONFIRMED",
        approval_chain_state: "NONE",
        transcript_redacted: false,
        transcript_redaction_reason: null,
        retention_class: "STANDARD",
      });
      expect(result.audit_event_id).toBe(
        "33333333-3333-3333-3333-333333333333",
      );
      const call = writeAuditEventMock.mock.calls[0]?.[0];
      expect(call?.event_type).toBe(literal);
      // SAFE schema: 8 fields; no transcript_text.
      expect(Object.keys(call?.details).sort()).toEqual([
        "approval_chain_state",
        "confirmation_state",
        "intent_class",
        "intent_id",
        "retention_class",
        "source_surface",
        "transcript_redacted",
        "transcript_redaction_reason",
      ]);
    },
  );
});
