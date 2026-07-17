import { describe, expect, it } from "vitest";
import { resolveProjectFromText } from "../../apps/api/src/services/otzar/project-context-resolve.js";

const projects = [
  {
    project_id: "p1",
    name: "Launch the enterprise customer pilot",
  },
  {
    project_id: "p2",
    name: "Q3 brand campaign",
  },
];

describe("resolveProjectFromText", () => {
  it("exact match on full project name", () => {
    const r = resolveProjectFromText({
      text: "We need to finish Launch the enterprise customer pilot this week.",
      projects,
    });
    expect(r.classification).toBe("exact");
    expect(r.project_id).toBe("p1");
    expect(r.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("multiple when two strong hits", () => {
    const r = resolveProjectFromText({
      text: "Launch the enterprise customer pilot and Q3 brand campaign both slip.",
      projects,
    });
    expect(r.classification).toBe("multiple");
    expect(r.project_id).toBeNull();
    expect(r.candidate_ids.length).toBeGreaterThanOrEqual(2);
  });

  it("none when no project mentioned", () => {
    const r = resolveProjectFromText({
      text: "Let's grab coffee tomorrow.",
      projects,
    });
    expect(r.classification).toBe("none");
    expect(r.project_id).toBeNull();
  });
});
