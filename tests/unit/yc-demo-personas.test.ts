// FILE: yc-demo-personas.test.ts
// PURPOSE: Pure allowlist + public card shape for YC demo launcher.

import { describe, expect, it } from "vitest";
import {
  YC_DEMO_PERSONAS,
  findPersonaByKey,
  publicPersonaCards,
} from "../../apps/api/src/services/demo/yc-demo-personas.js";

describe("yc-demo-personas", () => {
  it("includes required HelioGrid review roles", () => {
    const keys = YC_DEMO_PERSONAS.map((p) => p.key);
    expect(keys).toContain("organization_lead");
    expect(keys).toContain("application_review_lead");
    expect(keys).toContain("technical_diligence_lead");
    expect(keys).toContain("security_lead");
    expect(keys).toContain("market_review_lead");
    expect(keys).toContain("regular_reviewer");
    expect(keys).toContain("contractor");
  });

  it("public cards never expose emails or passwords", () => {
    const cards = publicPersonaCards();
    const raw = JSON.stringify(cards);
    expect(raw).not.toMatch(/@/);
    expect(raw).not.toMatch(/password/i);
    expect(findPersonaByKey("security_lead")?.role_title).toMatch(/Security/i);
  });
});
