// FILE: tests/unit/foundation-ambient-device.test.ts (unit)
// PURPOSE: Phase 1291-A — locks the ambient-packet disposition evaluator
//          (evaluateAmbientPacket): raw frames / unsupported sources / no
//          consent → BLOCKED; bystander-sensitive NEVER becomes org memory;
//          no-view / audio commands REQUIRE verifiable confirmation (no fake
//          confirmation); org memory needs visibility=org + confirmed + write
//          authority; device-claimed identity is never trusted; safe default is
//          WORK_LEDGER_ONLY.
// CONNECTS TO: apps/api/src/services/foundation/ambient-device.service.ts.

import { describe, expect, it } from "vitest";
import { evaluateAmbientPacket } from "@niov/api";
import type { AmbientPacketInput, AmbientDeviceEnvelopeInputs } from "@niov/api";

function pkt(over: Partial<AmbientPacketInput> = {}): AmbientPacketInput {
  return {
    source_type: "GLASSES_NOTE",
    mode: "manual_capture",
    text: "a short device note",
    consent: {
      user_initiated: true,
      capture_visible_to_user: true,
      bystander_sensitive: false,
    },
    visibility: { scope: "private" },
    ...over,
  };
}

const WRITER: AmbientDeviceEnvelopeInputs = {
  entity_type: "PERSON",
  can_write_capsules: true,
};
const confirmed = { user_confirmed: true, confirmation_mode: "TAP" as const };

describe("evaluateAmbientPacket — prohibitions (BLOCKED)", () => {
  it("blocks raw media frames outright", () => {
    const d = evaluateAmbientPacket(pkt({ raw_media_keys: ["frame-1.jpg"] }), WRITER);
    expect(d.disposition).toBe("BLOCKED");
    expect(d.reason_code).toBe("raw-frame-forbidden");
  });

  it("blocks unsupported (visual/biometric/location) source types", () => {
    const d = evaluateAmbientPacket(pkt({ source_type: "GLASSES_VISUAL_FRAME" }), WRITER);
    expect(d.disposition).toBe("BLOCKED");
    expect(d.reason_code).toBe("source-not-supported");
  });

  it("blocks when consent is not user-initiated + visible", () => {
    const d = evaluateAmbientPacket(
      pkt({ consent: { user_initiated: false, capture_visible_to_user: true, bystander_sensitive: false } }),
      WRITER,
    );
    expect(d.disposition).toBe("BLOCKED");
    expect(d.reason_code).toBe("consent-required");
  });

  it("blocks empty text (text-only protocol)", () => {
    const d = evaluateAmbientPacket(pkt({ text: "   " }), WRITER);
    expect(d.disposition).toBe("BLOCKED");
    expect(d.reason_code).toBe("text-required");
  });

  it("never trusts a device-claimed identity", () => {
    const d = evaluateAmbientPacket(pkt({ device_id: "claims-to-be-admin" }), WRITER);
    expect(d.device_identity_trusted).toBe(false);
  });
});

describe("evaluateAmbientPacket — no-view / audio confirmation", () => {
  it("requires verifiable confirmation for a no-view command", () => {
    const d = evaluateAmbientPacket(pkt({ mode: "no_view_command" }), WRITER);
    expect(d.disposition).toBe("REQUIRES_CONFIRMATION");
    expect(d.requires_confirmation).toBe(true);
  });

  it("a recorded voice flag without an explicit confirmation is NOT enough", () => {
    const d = evaluateAmbientPacket(
      pkt({ mode: "audio_confirmation", confirmation: { user_confirmed: true, confirmation_mode: "NONE" } }),
      WRITER,
    );
    expect(d.disposition).toBe("REQUIRES_CONFIRMATION");
  });
});

describe("evaluateAmbientPacket — bystander-sensitive never org", () => {
  it("a confirmed bystander-sensitive packet is downgraded to PRIVATE", () => {
    const d = evaluateAmbientPacket(
      pkt({
        visibility: { scope: "org" },
        consent: { user_initiated: true, capture_visible_to_user: true, bystander_sensitive: true },
        confirmation: confirmed,
      }),
      WRITER,
    );
    expect(d.disposition).toBe("MEMORY_CAPSULE_PRIVATE");
    expect(d.allowed_into_org_memory).toBe(false);
  });

  it("an unconfirmed bystander-sensitive packet requires confirmation, never org", () => {
    const d = evaluateAmbientPacket(
      pkt({ visibility: { scope: "org" }, consent: { user_initiated: true, capture_visible_to_user: true, bystander_sensitive: true } }),
      WRITER,
    );
    expect(d.disposition).toBe("REQUIRES_CONFIRMATION");
    expect(d.allowed_into_org_memory).toBe(false);
  });
});

describe("evaluateAmbientPacket — org + private memory gating", () => {
  it("org visibility + confirmed + write authority → MEMORY_CAPSULE_ORG", () => {
    const d = evaluateAmbientPacket(
      pkt({ visibility: { scope: "org" }, confirmation: confirmed }),
      WRITER,
    );
    expect(d.disposition).toBe("MEMORY_CAPSULE_ORG");
    expect(d.allowed_into_org_memory).toBe(true);
  });

  it("org visibility + confirmed but NO write authority → REQUIRES_CONFIRMATION (not org)", () => {
    const d = evaluateAmbientPacket(
      pkt({ visibility: { scope: "org" }, confirmation: confirmed }),
      { entity_type: "APPLICATION", can_write_capsules: false },
    );
    expect(d.disposition).toBe("REQUIRES_CONFIRMATION");
    expect(d.allowed_into_org_memory).toBe(false);
  });

  it("private visibility + confirmed → MEMORY_CAPSULE_PRIVATE", () => {
    const d = evaluateAmbientPacket(pkt({ visibility: { scope: "private" }, confirmation: confirmed }), WRITER);
    expect(d.disposition).toBe("MEMORY_CAPSULE_PRIVATE");
  });

  it("unconfirmed manual capture defaults to WORK_LEDGER_ONLY (safe)", () => {
    const d = evaluateAmbientPacket(pkt({ visibility: { scope: "unknown" } }), WRITER);
    expect(d.disposition).toBe("WORK_LEDGER_ONLY");
    expect(d.allowed_into_org_memory).toBe(false);
  });
});
