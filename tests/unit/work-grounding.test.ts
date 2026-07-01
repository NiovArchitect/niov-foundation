// FILE: tests/unit/work-grounding.test.ts (unit)
// PURPOSE: Slice E — the grounding block formatter is deterministic, bounded, and
//          honest-empty. Empty input → "" (so conductSession adds nothing and the
//          prompt is byte-identical); non-empty → a labeled, capped block that
//          tells the model to ground on these facts and not invent.
import { describe, expect, it } from "vitest";
import { formatWorkGroundingBlock } from "../../apps/api/src/services/work-os/work-grounding.js";
import type { OrgQueryResult } from "../../apps/api/src/services/work-os/org-query.service.js";

function r(over: Partial<OrgQueryResult>): OrgQueryResult {
  return {
    result_id: "x", result_type: "COMMITMENT", title: "Repo access", summary: null,
    source_type: "TRANSCRIPT", source_system: "transcript", source_evidence: null,
    source_conversation_id: null, owner: null, requester: null, project_id: null,
    project_hint: null, team_hint: null, status: "PROPOSED", confidence: null,
    sensitivity: null, scope_label: "self", created_at: "", updated_at: "",
    execution: null, connector_gap: null, dandelion_seed: null, audit_pointer: null,
    ...over,
  };
}

describe("work-grounding block formatter", () => {
  it("returns empty string for no results (prompt stays byte-identical)", () => {
    expect(formatWorkGroundingBlock([])).toBe("");
  });

  it("labels the block as the caller's OWN grounded facts and tells the model not to invent", () => {
    const block = formatWorkGroundingBlock([r({ title: "Grant repo access", status: "BLOCKED", owner: "David" })]);
    expect(block).toMatch(/YOUR WORK RECORD/);
    expect(block).toMatch(/inventing it/i);
    expect(block).toMatch(/authorized/i);
    expect(block).toMatch(/Grant repo access \[BLOCKED, owner David\]/);
  });

  it("includes source evidence + connector gap when present", () => {
    const block = formatWorkGroundingBlock([
      r({ title: "Repo access", status: "PROPOSED", source_evidence: "David owns the repo access work", connector_gap: { required_connector: "GITHUB", capability_state: "not_connected" } }),
    ]);
    expect(block).toMatch(/needs GITHUB/);
    expect(block).toMatch(/evidence: "David owns the repo access work"/);
  });

  it("caps at 5 rows and truncates long titles/evidence (bounded — safe outside budget)", () => {
    const many = Array.from({ length: 12 }, (_, i) => r({ title: `Item ${i} ${"x".repeat(200)}`, source_evidence: "y".repeat(200) }));
    const block = formatWorkGroundingBlock(many);
    const bulletLines = block.split("\n").filter((l) => l.startsWith("- "));
    expect(bulletLines.length).toBe(5);
    // Title truncated to ≤120, evidence to ≤90.
    for (const l of bulletLines) {
      const titlePart = l.slice(2, l.indexOf(" ["));
      expect(titlePart.length).toBeLessThanOrEqual(120);
    }
    expect(block).not.toMatch(/y{100}/); // evidence capped
  });
});
