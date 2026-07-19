import { describe, expect, it } from "vitest";
import {
  encodeCandidateSummary,
  extractWorkStyleCandidates,
  parseCandidateSummary,
  sanitizeLearningLabel,
} from "../../../apps/api/src/services/otzar/work-style-learning.service.js";

describe("work-style-learning pure helpers", () => {
  it("sanitizes secrets and emails", () => {
    expect(sanitizeLearningLabel("password: hunter2 and a@b.com")).toMatch(
      /redacted|email/i,
    );
  });

  it("extracts structured candidates without raw content", () => {
    const c = extractWorkStyleCandidates({
      sessionId: "00000000-0000-0000-0000-000000000001",
      taskLabel: "Executive launch brief",
      signals: [
        { signalType: "structure", safeLabel: "Moved decision and impact first" },
        { signalType: "review", safeLabel: "Draft before send external" },
        { signalType: "tool", safeLabel: "Used Google Docs then PDF" },
      ],
    });
    expect(c.length).toBeGreaterThanOrEqual(2);
    expect(c.every((x) => !/password|hunter/i.test(x.plain))).toBe(true);
    expect(c.some((x) => x.correctionType === "SENSITIVITY_BOUNDARY")).toBe(
      true,
    );
  });

  it("round-trips candidate encoding", () => {
    const s = encodeCandidateSummary({
      sessionId: "00000000-0000-0000-0000-000000000001",
      category: "writing_style",
      plain: "Prefer concise executive summaries.",
      portability: "portable",
      evidence: 3,
    });
    const p = parseCandidateSummary(s);
    expect(p?.plain).toContain("concise");
    expect(p?.portability).toBe("portable");
  });
});
