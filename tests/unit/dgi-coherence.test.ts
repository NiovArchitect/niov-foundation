// FILE: dgi-coherence.test.ts
// PURPOSE: [DGI-COHERENCE WAVE-1 + WAVE-2] Pure selection + system-block
//          rendering + closed-vocab coherence_status. Multi-Twin must never
//          silently blend; the DGI strip must stay leak-safe (titles/counts
//          only) and honest about empty / blocked / unpaired states.

import { describe, expect, it } from "vitest";
import {
  selectPrimaryTwinStrict,
  renderDgiSystemBlock,
  twinPairingFromSelection,
  deriveCoherenceStatus,
  type DgiCoherenceSnapshot,
} from "../../apps/api/src/services/otzar/dgi-coherence.service.js";
import type { Entity } from "@prisma/client";

function twinEntity(id: string): Entity {
  return {
    entity_id: id,
    entity_type: "AI_AGENT",
    display_name: `Twin ${id.slice(0, 4)}`,
    email: null,
    public_key: "pk",
    status: "ACTIVE",
    password_hash: null,
    failed_auth_attempts: 0,
    suspended_at: null,
    created_at: new Date("2026-01-01T00:00:00.000Z"),
    updated_at: new Date("2026-01-01T00:00:00.000Z"),
    deleted_at: null,
  } as Entity;
}

function baseSnap(
  overrides: Partial<DgiCoherenceSnapshot> = {},
): DgiCoherenceSnapshot {
  return {
    open_obligations_count: 0,
    open_obligation_titles: [],
    open_org_truth_conflicts_count: 0,
    active_personal_corrections_count: 0,
    active_twin_authority_grants_count: 0,
    open_incoming_handoffs_count: 0,
    open_incoming_handoff_titles: [],
    twin_pairing_status: "OK",
    twin_entity_id: "11111111-1111-1111-1111-111111111111",
    eligible_twin_count: 1,
    coherence_status: "HEALTHY",
    attention_count: 0,
    system_block: "",
    ...overrides,
  };
}

describe("selectPrimaryTwinStrict", () => {
  it("returns TWIN_NOT_FOUND when resolver yields null", () => {
    const r = selectPrimaryTwinStrict(null);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("TWIN_NOT_FOUND");
    expect(r.eligible_count).toBe(0);
  });

  it("accepts exactly one eligible Twin", () => {
    const twin = twinEntity("11111111-1111-1111-1111-111111111111");
    const r = selectPrimaryTwinStrict({ twin, eligible_count: 1 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.twin.entity_id).toBe(twin.entity_id);
  });

  it("fails closed on multiple eligible Twins (never silent oldest pick)", () => {
    const twin = twinEntity("11111111-1111-1111-1111-111111111111");
    const r = selectPrimaryTwinStrict({ twin, eligible_count: 2 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("TWIN_AMBIGUOUS");
    expect(r.eligible_count).toBe(2);
    expect(r.message).toMatch(/will not blend/i);
  });
});

describe("twinPairingFromSelection + deriveCoherenceStatus", () => {
  it("maps OK selection to HEALTHY when no attention items", () => {
    const twin = twinEntity("11111111-1111-1111-1111-111111111111");
    const pairing = twinPairingFromSelection(
      selectPrimaryTwinStrict({ twin, eligible_count: 1 }),
    );
    expect(pairing.twin_pairing_status).toBe("OK");
    const d = deriveCoherenceStatus({
      twin_pairing_status: pairing.twin_pairing_status,
      open_obligations_count: 0,
      open_org_truth_conflicts_count: 0,
      open_incoming_handoffs_count: 0,
    });
    expect(d.coherence_status).toBe("HEALTHY");
    expect(d.attention_count).toBe(0);
  });

  it("elevates to NEEDS_ATTENTION when obligations/conflicts/handoffs open", () => {
    const d = deriveCoherenceStatus({
      twin_pairing_status: "OK",
      open_obligations_count: 2,
      open_org_truth_conflicts_count: 1,
      open_incoming_handoffs_count: 1,
    });
    expect(d.coherence_status).toBe("NEEDS_ATTENTION");
    expect(d.attention_count).toBe(4);
  });

  it("BLOCKED dominates work pressure when multi-Twin", () => {
    const twin = twinEntity("11111111-1111-1111-1111-111111111111");
    const pairing = twinPairingFromSelection(
      selectPrimaryTwinStrict({ twin, eligible_count: 3 }),
    );
    expect(pairing.twin_pairing_status).toBe("TWIN_AMBIGUOUS");
    const d = deriveCoherenceStatus({
      twin_pairing_status: pairing.twin_pairing_status,
      open_obligations_count: 5,
      open_org_truth_conflicts_count: 0,
      open_incoming_handoffs_count: 0,
    });
    expect(d.coherence_status).toBe("BLOCKED");
    expect(d.attention_count).toBe(5);
  });

  it("UNPAIRED when no Twin", () => {
    const pairing = twinPairingFromSelection(selectPrimaryTwinStrict(null));
    expect(pairing.twin_pairing_status).toBe("TWIN_NOT_FOUND");
    const d = deriveCoherenceStatus({
      twin_pairing_status: pairing.twin_pairing_status,
      open_obligations_count: 0,
      open_org_truth_conflicts_count: 0,
      open_incoming_handoffs_count: 0,
    });
    expect(d.coherence_status).toBe("UNPAIRED");
  });
});

describe("renderDgiSystemBlock", () => {
  it("renders governed strip without inventing work when empty", () => {
    const empty = baseSnap();
    const text = renderDgiSystemBlock(empty);
    expect(text).toContain("DGI COHERENCE");
    expect(text).toContain("none recorded");
    expect(text).toContain("Organizational truth conflicts open for review: none");
    expect(text).toContain("Open incoming handoffs: none");
    expect(text).toContain("Coherence status: HEALTHY");
    expect(text).toContain("Twin pairing: single active");
    expect(text).not.toMatch(/password|token|secret|transcript/i);
  });

  it("surfaces open obligations, handoffs, and conflict counts when present", () => {
    const snap = baseSnap({
      open_obligations_count: 2,
      open_obligation_titles: ["Ship release notes", "Confirm legal review"],
      open_org_truth_conflicts_count: 1,
      active_personal_corrections_count: 3,
      active_twin_authority_grants_count: 1,
      open_incoming_handoffs_count: 1,
      open_incoming_handoff_titles: ["GTM ownership transfer"],
      coherence_status: "NEEDS_ATTENTION",
      attention_count: 4,
    });
    const text = renderDgiSystemBlock(snap);
    expect(text).toContain("Open obligations");
    expect(text).toContain("Ship release notes");
    expect(text).toContain("Organizational truth conflicts awaiting authorized review: 1");
    expect(text).toContain("Active personal work-style corrections");
    expect(text).toContain("Active Twin authority grants");
    expect(text).toContain("Open incoming responsibility handoffs: 1");
    expect(text).toContain("GTM ownership transfer");
    expect(text).toContain("Do not invent a winner");
    expect(text).toContain("NEEDS_ATTENTION");
  });

  it("states multi-Twin block honestly", () => {
    const snap = baseSnap({
      twin_pairing_status: "TWIN_AMBIGUOUS",
      twin_entity_id: null,
      eligible_twin_count: 2,
      coherence_status: "BLOCKED",
    });
    const text = renderDgiSystemBlock(snap);
    expect(text).toContain("BLOCKED");
    expect(text).toMatch(/will not|Do not proceed with blended/i);
    expect(text).toContain("2 eligible");
  });
});
