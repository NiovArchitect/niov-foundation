// FILE: twin-tool-readiness.test.ts (unit, no DB)
// PURPOSE: [GAP-H TOOLS] Lock the honest readiness computation: ready ONLY
//          when every required tool has a matching enabled org binding; no
//          modeled requirements => not_configured (never fake ready);
//          human labels, deterministic binding matching.
// CONNECTS TO: services/otzar/twin-tool-readiness.ts.

import { describe, expect, it } from "vitest";
import {
  bindingSatisfiesTool,
  computeTwinToolReadiness,
  mergeOrgConnectedToolKeys,
  toolLabel,
} from "../../apps/api/src/services/otzar/twin-tool-readiness.js";

describe("[GAP-H TOOLS] computeTwinToolReadiness", () => {
  it("no modeled requirements is not_configured — NEVER ready", () => {
    const r = computeTwinToolReadiness([], ["slack", "github"], 2);
    expect(r.status).toBe("not_configured");
    expect(r.required_tools_count).toBe(0);
  });
  it("all required tools connected => ready", () => {
    const r = computeTwinToolReadiness(["SLACK", "GITHUB"], ["SLACK_WRITE", "github"], 2);
    expect(r.status).toBe("ready");
    expect(r.missing_tools).toHaveLength(0);
    expect(r.required_tools_count).toBe(2);
  });
  it("a missing required tool => needs_setup with a HUMAN label", () => {
    const r = computeTwinToolReadiness(["SLACK", "GITHUB"], ["slack"], 1);
    expect(r.status).toBe("needs_setup");
    expect(r.missing_tools).toEqual([{ tool_key: "GITHUB", label: "GitHub" }]);
  });
  it("no bindings at all => everything required is missing", () => {
    const r = computeTwinToolReadiness(["GOOGLE_WORKSPACE"], [], 0);
    expect(r.status).toBe("needs_setup");
    expect(r.missing_tools[0]?.label).toBe("Google Workspace");
  });
  it("OAuth-connected provider satisfies GOOGLE_WORKSPACE without bindings", () => {
    const r = computeTwinToolReadiness(
      ["SLACK", "GOOGLE_WORKSPACE"],
      [],
      0,
      ["GOOGLE_WORKSPACE"],
    );
    expect(r.status).toBe("needs_setup");
    expect(r.missing_tools.map((m) => m.tool_key)).toEqual(["SLACK"]);
    expect(r.connected_tools_count).toBeGreaterThanOrEqual(1);
  });
  it("mergeOrgConnectedToolKeys unions bindings + oauth", () => {
    expect(
      mergeOrgConnectedToolKeys(["SLACK_WRITE"], ["GOOGLE_WORKSPACE"]).sort(),
    ).toEqual(["GOOGLE_WORKSPACE", "SLACK_WRITE"]);
  });
  it("duplicate/blank requirement entries normalize safely", () => {
    const r = computeTwinToolReadiness(["slack", "SLACK", "  "], ["SLACK"], 1);
    expect(r.status).toBe("ready");
    expect(r.required_tools_count).toBe(1);
  });
});

describe("[GAP-H TOOLS] bindingSatisfiesTool", () => {
  it("exact + variant matches, case-insensitive", () => {
    expect(bindingSatisfiesTool("slack", "SLACK")).toBe(true);
    expect(bindingSatisfiesTool("SLACK_WRITE", "SLACK")).toBe(true);
    expect(bindingSatisfiesTool("github", "GITHUB")).toBe(true);
  });
  it("never cross-matches unrelated providers", () => {
    expect(bindingSatisfiesTool("gitlab", "GITHUB")).toBe(false);
    expect(bindingSatisfiesTool("google_workspace", "GITHUB")).toBe(false);
    expect(bindingSatisfiesTool("", "SLACK")).toBe(false);
  });
});

describe("[GAP-H TOOLS] toolLabel", () => {
  it("known keys map to registry display names; unknown keys humanize", () => {
    expect(toolLabel("GOOGLE_WORKSPACE")).toBe("Google Workspace");
    expect(toolLabel("GITHUB")).toBe("GitHub");
    expect(toolLabel("SOME_NEW_TOOL")).toBe("Some New Tool");
  });
});
