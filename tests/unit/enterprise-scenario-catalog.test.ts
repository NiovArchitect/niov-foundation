// FILE: enterprise-scenario-catalog.test.ts
// PURPOSE: Lock the 128-scenario catalog contract (32 per family).
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());

describe("enterprise scenario catalog", () => {
  it("JSON declares 32 scenarios per family (128 total)", () => {
    const raw = readFileSync(
      resolve(root, "docs/otzar/enterprise-scenario-catalog.json"),
      "utf8",
    );
    const cat = JSON.parse(raw) as {
      totals: { user: number; collaboration: number; ai_teammate: number; third_party: number; all: number };
      families: Record<string, { count: number; ids: string[] }>;
    };
    expect(cat.totals.user).toBe(32);
    expect(cat.totals.collaboration).toBe(32);
    expect(cat.totals.ai_teammate).toBe(32);
    expect(cat.totals.third_party).toBe(32);
    expect(cat.totals.all).toBe(128);
    for (const key of ["user", "collaboration", "ai_teammate", "third_party"]) {
      const f = cat.families[key]!;
      expect(f.count).toBe(32);
      expect(f.ids).toHaveLength(32);
      expect(new Set(f.ids).size).toBe(32);
    }
  });

  it("markdown catalog exists and names all four families", () => {
    const md = readFileSync(
      resolve(root, "docs/otzar/ENTERPRISE_SCENARIO_CATALOG.md"),
      "utf8",
    );
    expect(md).toMatch(/User scenarios/);
    expect(md).toMatch(/Collaboration scenarios/);
    expect(md).toMatch(/AI Teammate scenarios/);
    expect(md).toMatch(/Third-party scenarios/);
    expect(md).toMatch(/\*\*U-32\*\*/);
    expect(md).toMatch(/\*\*C-32\*\*/);
    expect(md).toMatch(/\*\*T-32\*\*/);
    expect(md).toMatch(/\*\*X-32\*\*/);
  });
});
