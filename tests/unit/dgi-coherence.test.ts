// FILE: dgi-coherence.test.ts
// PURPOSE: [DGI-COHERENCE WAVE-1] Pure selection + system-block rendering.
//          Multi-Twin must never silently blend; the DGI strip must stay
//          leak-safe (titles/counts only) and honest about empty state.

import { describe, expect, it } from "vitest";
import {
  selectPrimaryTwinStrict,
  renderDgiSystemBlock,
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

describe("renderDgiSystemBlock", () => {
  it("renders governed strip without inventing work when empty", () => {
    const empty: DgiCoherenceSnapshot = {
      open_obligations_count: 0,
      open_obligation_titles: [],
      open_org_truth_conflicts_count: 0,
      active_personal_corrections_count: 0,
      active_twin_authority_grants_count: 0,
      system_block: "",
    };
    const text = renderDgiSystemBlock(empty);
    expect(text).toContain("DGI COHERENCE");
    expect(text).toContain("none recorded");
    expect(text).toContain("Organizational truth conflicts open for review: none");
    expect(text).not.toMatch(/password|token|secret|transcript/i);
  });

  it("surfaces open obligations and conflict counts when present", () => {
    const snap: DgiCoherenceSnapshot = {
      open_obligations_count: 2,
      open_obligation_titles: ["Ship release notes", "Confirm legal review"],
      open_org_truth_conflicts_count: 1,
      active_personal_corrections_count: 3,
      active_twin_authority_grants_count: 1,
      system_block: "",
    };
    const text = renderDgiSystemBlock(snap);
    expect(text).toContain("Open obligations");
    expect(text).toContain("Ship release notes");
    expect(text).toContain("Organizational truth conflicts awaiting authorized review: 1");
    expect(text).toContain("Active personal work-style corrections");
    expect(text).toContain("Active Twin authority grants");
    expect(text).toContain("Do not invent a winner");
  });
});
