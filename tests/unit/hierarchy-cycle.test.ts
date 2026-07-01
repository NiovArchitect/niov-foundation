// FILE: tests/unit/hierarchy-cycle.test.ts
// PURPOSE: [PROD-UX-HIER] The manager-assignment cycle guard: a person can
//          never (directly or transitively) manage themselves, long chains
//          terminate, and legitimate re-parenting is allowed.
import { describe, expect, it } from "vitest";
import { wouldCreateCycle } from "../../apps/api/src/services/governance/hierarchy.service.js";

describe("hierarchy — wouldCreateCycle", () => {
  it("self-management is a cycle", () => {
    expect(wouldCreateCycle([], "a", "a")).toBe(true);
  });

  it("direct swap (my report becomes my manager) is a cycle", () => {
    // a manages b; assigning a's manager = b would loop.
    expect(wouldCreateCycle([["a", "b"]], "a", "b")).toBe(true);
  });

  it("transitive loop through a chain is a cycle", () => {
    // a→b→c; making a report to c loops.
    expect(
      wouldCreateCycle(
        [
          ["a", "b"],
          ["b", "c"],
        ],
        "a",
        "c",
      ),
    ).toBe(true);
  });

  it("legitimate assignment and re-parenting are allowed", () => {
    expect(wouldCreateCycle([], "b", "a")).toBe(false);
    expect(
      wouldCreateCycle(
        [
          ["a", "b"],
          ["a", "c"],
        ],
        "c",
        "b",
      ),
    ).toBe(false);
  });

  it("terminates on long chains (no infinite walk)", () => {
    const edges: Array<[string, string]> = [];
    for (let i = 0; i < 500; i++) edges.push([`m${i}`, `m${i + 1}`]);
    expect(wouldCreateCycle(edges, "m500", "m0")).toBe(false);
    expect(wouldCreateCycle(edges, "m0", "m500")).toBe(true);
  });
});
