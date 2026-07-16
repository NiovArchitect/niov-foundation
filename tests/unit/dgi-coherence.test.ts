// FILE: dgi-coherence.test.ts
// PURPOSE: [DGI WAVE-1/2/3] Pure selection, system-block, signals, next-best-step.
//          Multi-Twin never silently blends; strip stays leak-safe; next step drives
//          product behavior (not display-only counts).

import { describe, expect, it } from "vitest";
import {
  selectPrimaryTwinStrict,
  renderDgiSystemBlock,
  twinPairingFromSelection,
  deriveCoherenceStatus,
  deriveCoherenceSignals,
  deriveNextBestStep,
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
  const next = deriveNextBestStep({
    twin_pairing_status: "OK",
    eligible_twin_count: 1,
    open_obligations_count: 0,
    open_obligation_titles: [],
    open_org_truth_conflicts_count: 0,
    open_incoming_handoffs_count: 0,
    open_incoming_handoff_titles: [],
    active_twin_authority_grants_count: 1,
  });
  return {
    open_obligations_count: 0,
    open_obligation_titles: [],
    open_org_truth_conflicts_count: 0,
    active_personal_corrections_count: 0,
    active_twin_authority_grants_count: 1,
    open_incoming_handoffs_count: 0,
    open_incoming_handoff_titles: [],
    twin_pairing_status: "OK",
    twin_entity_id: "11111111-1111-1111-1111-111111111111",
    eligible_twin_count: 1,
    coherence_status: "HEALTHY",
    attention_count: 0,
    signals: ["PAIRING_OK", "AUTHORITY_PRESENT"],
    next_best_step: next,
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
  });

  it("fails closed on multiple eligible Twins", () => {
    const twin = twinEntity("11111111-1111-1111-1111-111111111111");
    const r = selectPrimaryTwinStrict({ twin, eligible_count: 2 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("TWIN_AMBIGUOUS");
  });
});

describe("deriveNextBestStep", () => {
  it("fail-closes on multi-Twin before work pressure", () => {
    const step = deriveNextBestStep({
      twin_pairing_status: "TWIN_AMBIGUOUS",
      eligible_twin_count: 3,
      open_obligations_count: 99,
      open_obligation_titles: [],
      open_org_truth_conflicts_count: 5,
      open_incoming_handoffs_count: 2,
      open_incoming_handoff_titles: [],
      active_twin_authority_grants_count: 0,
    });
    expect(step.kind).toBe("RESOLVE_TWIN_PAIRING");
    expect(step.autonomy_ceiling).toBe("FAIL_CLOSED");
    expect(step.route_hint).toBe("/app/my-twin");
  });

  it("prioritizes org-truth conflict over obligations", () => {
    const step = deriveNextBestStep({
      twin_pairing_status: "OK",
      eligible_twin_count: 1,
      open_obligations_count: 3,
      open_obligation_titles: ["Ship it"],
      open_org_truth_conflicts_count: 1,
      open_incoming_handoffs_count: 1,
      open_incoming_handoff_titles: ["Handoff"],
      active_twin_authority_grants_count: 0,
    });
    expect(step.kind).toBe("REVIEW_ORG_TRUTH");
    expect(step.autonomy_ceiling).toBe("ESCALATE");
  });

  it("prioritizes handoff over obligations", () => {
    const step = deriveNextBestStep({
      twin_pairing_status: "OK",
      eligible_twin_count: 1,
      open_obligations_count: 2,
      open_obligation_titles: ["Ship it"],
      open_org_truth_conflicts_count: 0,
      open_incoming_handoffs_count: 1,
      open_incoming_handoff_titles: ["Shift transfer"],
      active_twin_authority_grants_count: 0,
    });
    expect(step.kind).toBe("ACKNOWLEDGE_HANDOFF");
    expect(step.safe_title).toMatch(/handoff/i);
  });

  it("advances obligations when only work remains", () => {
    const step = deriveNextBestStep({
      twin_pairing_status: "OK",
      eligible_twin_count: 1,
      open_obligations_count: 2,
      open_obligation_titles: ["Ship release notes"],
      open_org_truth_conflicts_count: 0,
      open_incoming_handoffs_count: 0,
      open_incoming_handoff_titles: [],
      active_twin_authority_grants_count: 1,
    });
    expect(step.kind).toBe("ADVANCE_OBLIGATION");
    expect(step.reason).toContain("Ship release notes");
  });
});

describe("deriveCoherenceSignals", () => {
  it("emits CONFLICTED and HANDOFF_INCOMPLETE when present", () => {
    const s = deriveCoherenceSignals({
      twin_pairing_status: "OK",
      open_obligations_count: 1,
      open_org_truth_conflicts_count: 2,
      open_incoming_handoffs_count: 1,
      active_personal_corrections_count: 1,
      active_twin_authority_grants_count: 0,
    });
    expect(s).toContain("PAIRING_OK");
    expect(s).toContain("CONFLICTED");
    expect(s).toContain("HANDOFF_INCOMPLETE");
    expect(s).toContain("OBLIGATIONS_OPEN");
    expect(s).toContain("CORRECTIONS_ACTIVE");
    expect(s).toContain("AUTHORITY_MISSING");
  });
});

describe("renderDgiSystemBlock", () => {
  it("renders governed strip + next step without secrets", () => {
    const empty = baseSnap();
    const text = renderDgiSystemBlock(empty);
    expect(text).toContain("DGI COHERENCE");
    expect(text).toContain("Next best step");
    expect(text).toContain("private professional memory");
    expect(text).not.toMatch(/password|token|secret|transcript/i);
  });

  it("surfaces handoffs and conflict honesty", () => {
    const step = deriveNextBestStep({
      twin_pairing_status: "OK",
      eligible_twin_count: 1,
      open_obligations_count: 2,
      open_obligation_titles: ["Ship release notes"],
      open_org_truth_conflicts_count: 1,
      open_incoming_handoffs_count: 1,
      open_incoming_handoff_titles: ["GTM ownership transfer"],
      active_twin_authority_grants_count: 1,
    });
    const snap = baseSnap({
      open_obligations_count: 2,
      open_obligation_titles: ["Ship release notes"],
      open_org_truth_conflicts_count: 1,
      open_incoming_handoffs_count: 1,
      open_incoming_handoff_titles: ["GTM ownership transfer"],
      coherence_status: "NEEDS_ATTENTION",
      attention_count: 4,
      signals: ["PAIRING_OK", "CONFLICTED", "HANDOFF_INCOMPLETE", "OBLIGATIONS_OPEN"],
      next_best_step: step,
    });
    const text = renderDgiSystemBlock(snap);
    expect(text).toContain("Ship release notes");
    expect(text).toContain("Do not invent a winner");
    expect(text).toContain("REVIEW_ORG_TRUTH");
  });
});

describe("deriveCoherenceStatus pairing dominance", () => {
  it("BLOCKED dominates work pressure", () => {
    const d = deriveCoherenceStatus({
      twin_pairing_status: "TWIN_AMBIGUOUS",
      open_obligations_count: 5,
      open_org_truth_conflicts_count: 0,
      open_incoming_handoffs_count: 0,
    });
    expect(d.coherence_status).toBe("BLOCKED");
  });

  it("maps OK selection to HEALTHY when empty", () => {
    const twin = twinEntity("11111111-1111-1111-1111-111111111111");
    const pairing = twinPairingFromSelection(
      selectPrimaryTwinStrict({ twin, eligible_count: 1 }),
    );
    const d = deriveCoherenceStatus({
      twin_pairing_status: pairing.twin_pairing_status,
      open_obligations_count: 0,
      open_org_truth_conflicts_count: 0,
      open_incoming_handoffs_count: 0,
    });
    expect(d.coherence_status).toBe("HEALTHY");
  });
});
