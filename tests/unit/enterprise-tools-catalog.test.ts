// FILE: enterprise-tools-catalog.test.ts
// PURPOSE: Phase E.1 — capability catalog is human language, maps to
//          real providers, and never lists MCP as a primary tool.

import { describe, expect, it } from "vitest";
import { ENTERPRISE_CAPABILITY_CATALOG } from "../../apps/api/src/services/otzar/enterprise-tools.service.js";

describe("ENTERPRISE_CAPABILITY_CATALOG", () => {
  it("covers core enterprise capabilities in human language", () => {
    const ids = ENTERPRISE_CAPABILITY_CATALOG.map((c) => c.capability_id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "calendars",
        "documents",
        "email",
        "chat",
        "meetings",
        "engineering",
        "voice",
      ]),
    );
    for (const c of ENTERPRISE_CAPABILITY_CATALOG) {
      expect(c.label.length).toBeGreaterThan(2);
      expect(c.description.length).toBeGreaterThan(10);
      expect(c.providers.length).toBeGreaterThan(0);
    }
  });

  it("never uses MCP as product vocabulary", () => {
    const blob = JSON.stringify(ENTERPRISE_CAPABILITY_CATALOG).toLowerCase();
    expect(blob).not.toContain("mcp");
    expect(blob).not.toContain("model context protocol");
  });

  it("self-serve options have oauth slugs when employee can connect", () => {
    for (const c of ENTERPRISE_CAPABILITY_CATALOG) {
      for (const p of c.providers) {
        if (p.employee_self_serve) {
          expect(p.oauth_slug).toMatch(/^[a-z]+$/);
        }
      }
    }
  });
});
