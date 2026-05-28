// FILE: otzar-conversation-corrections.test.ts (unit)
// PURPOSE: Pure-function coverage for the ADR-0055 Wave 2C
//          per-conversation correction-signal projection
//          (projectConversationCorrections). No DB, no LLM, no network
//          — exercises corrections_count / has_corrections /
//          last_correction_at ISO mapping, the fixed honest notes,
//          and the invariant that no raw correction payloads,
//          target_capsule_id, capsule IDs, vectors, storage_location,
//          content_hash, permission internals, drift/employee score,
//          or manager-visibility fields appear in output.
// CONNECTS TO: apps/api/src/services/otzar/conversation-corrections.ts.

import { describe, expect, it } from "vitest";
import { projectConversationCorrections } from "@niov/api";

describe("projectConversationCorrections -- counts + freshness", () => {
  it("zero state: corrections_count 0 → has_corrections false, last_correction_at null", () => {
    const v = projectConversationCorrections({
      conversation_id: "conv-1",
      corrections_count: 0,
      last_correction_at: null,
    });
    expect(v.conversation_id).toBe("conv-1");
    expect(v.corrections_count).toBe(0);
    expect(v.has_corrections).toBe(false);
    expect(v.last_correction_at).toBeNull();
  });

  it("non-zero count: has_corrections true; last_correction_at serialized as ISO string", () => {
    const at = new Date("2026-05-27T18:30:00.000Z");
    const v = projectConversationCorrections({
      conversation_id: "conv-2",
      corrections_count: 3,
      last_correction_at: at,
    });
    expect(v.corrections_count).toBe(3);
    expect(v.has_corrections).toBe(true);
    expect(v.last_correction_at).toBe("2026-05-27T18:30:00.000Z");
  });
});

describe("projectConversationCorrections -- fixed safe notes", () => {
  it("drift_prevention_note and continuity_note are honest non-surveillance prose", () => {
    const v = projectConversationCorrections({
      conversation_id: "conv-3",
      corrections_count: 1,
      last_correction_at: new Date("2026-05-27T00:00:00.000Z"),
    });
    expect(v.drift_prevention_note).toMatch(/within scope/i);
    expect(v.drift_prevention_note).toMatch(/not an employee score/i);
    expect(v.drift_prevention_note).toMatch(/does not expose raw messages/i);
    expect(v.continuity_note).toMatch(/scoped signals/i);
    expect(v.continuity_note).toMatch(/not a transcript/i);
  });
});

describe("projectConversationCorrections -- exact safe field set", () => {
  it("output keys equal exactly the safe set; no raw internals serialized", () => {
    const v = projectConversationCorrections({
      conversation_id: "conv-4",
      corrections_count: 2,
      last_correction_at: new Date("2026-05-27T12:00:00.000Z"),
    });
    expect(Object.keys(v).sort()).toEqual([
      "continuity_note",
      "conversation_id",
      "corrections_count",
      "drift_prevention_note",
      "has_corrections",
      "last_correction_at",
    ]);
    const json = JSON.stringify(v);
    // ADR-0055 §Decision 6 forbidden response fields — none of these
    // can appear because the input type omits them by construction.
    expect(json).not.toContain("payload_summary");
    expect(json).not.toContain("payload_content");
    expect(json).not.toContain("correction_capsule_id");
    expect(json).not.toContain("target_capsule_id");
    expect(json).not.toContain("storage_location");
    expect(json).not.toContain("content_hash");
    expect(json).not.toContain("embedding");
    expect(json).not.toContain("vector");
    expect(json).not.toContain("bridge_id");
    expect(json).not.toContain("capability_flags");
    expect(json).not.toContain("context_provenance");
    expect(json).not.toContain("drift_score");
    expect(json).not.toContain("employee_score");
    expect(json).not.toContain("best_practice_learned");
    expect(json).not.toContain("manager_visibility");
    // NOTE: the word "transcript" intentionally appears in
    // continuity_note ("not a transcript"); the keys-shape assertion
    // above already proves no transcript/message FIELD exists, so we
    // don't blanket-ban the word.
  });
});
