// FILE: connector-adapter-registry.test.ts
// PURPOSE: Phase 1224/1225/1226/1227 — unit tests for the
//          connector adapter registry.

import { describe, expect, it } from "vitest";
import {
  listConnectorAdapters,
  getConnectorAdapter,
} from "../../apps/api/src/services/connectors/connector-adapter-registry.js";

describe("connector adapter registry", () => {
  it("lists every documented connector", () => {
    const rows = listConnectorAdapters();
    const names = rows.map((r) => r.provider_name).sort();
    expect(names).toContain("GOOGLE_WORKSPACE");
    expect(names).toContain("SLACK");
    expect(names).toContain("MICROSOFT_365");
    expect(names).toContain("ZOOM");
    expect(names).toContain("SMTP_EMAIL");
    expect(names).toContain("OCR_TESSERACT");
    expect(names).toContain("OCR_AWS_TEXTRACT");
    expect(names).toContain("OCR_GOOGLE_VISION");
  });

  it("Google Workspace without keys = BLOCKED_BY_CREDENTIAL", () => {
    const prev = {
      id: process.env.GOOGLE_OAUTH_CLIENT_ID,
      secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    };
    delete process.env.GOOGLE_OAUTH_CLIENT_ID;
    delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    const g = getConnectorAdapter("GOOGLE_WORKSPACE");
    expect(g?.status).toBe("BLOCKED_BY_CREDENTIAL");
    expect(g?.missing_envs).toContain("GOOGLE_OAUTH_CLIENT_ID");
    expect(g?.missing_envs).toContain("GOOGLE_OAUTH_CLIENT_SECRET");
    if (prev.id !== undefined) process.env.GOOGLE_OAUTH_CLIENT_ID = prev.id;
    if (prev.secret !== undefined)
      process.env.GOOGLE_OAUTH_CLIENT_SECRET = prev.secret;
  });

  it("Slack with all credentials = BLOCKED_BY_APP_REVIEW (app_review_required=true)", () => {
    const prev = {
      a: process.env.SLACK_CLIENT_ID,
      b: process.env.SLACK_CLIENT_SECRET,
      c: process.env.SLACK_SIGNING_SECRET,
    };
    process.env.SLACK_CLIENT_ID = "test";
    process.env.SLACK_CLIENT_SECRET = "test";
    process.env.SLACK_SIGNING_SECRET = "test";
    const s = getConnectorAdapter("SLACK");
    expect(s?.status).toBe("BLOCKED_BY_APP_REVIEW");
    expect(s?.missing_envs).toEqual([]);
    if (prev.a !== undefined) process.env.SLACK_CLIENT_ID = prev.a;
    else delete process.env.SLACK_CLIENT_ID;
    if (prev.b !== undefined) process.env.SLACK_CLIENT_SECRET = prev.b;
    else delete process.env.SLACK_CLIENT_SECRET;
    if (prev.c !== undefined) process.env.SLACK_SIGNING_SECRET = prev.c;
    else delete process.env.SLACK_SIGNING_SECRET;
  });

  it("Tesseract OCR (no envs required) stays DISABLED until wired", () => {
    const t = getConnectorAdapter("OCR_TESSERACT");
    expect(t?.status).toBe("DISABLED");
    expect(t?.required_envs).toEqual([]);
  });

  it("required scopes are documented for every adapter that needs them", () => {
    const rows = listConnectorAdapters();
    expect(
      rows
        // AI + SETTLEMENT adapters authenticate by API key, not OAuth
        // scopes (Phase 1247 — Circle/Base rails per ADR-0094).
        .filter(
          (r) =>
            r.required_envs.length > 0 &&
            r.category !== "AI" &&
            r.category !== "SETTLEMENT",
        )
        .every((r) => r.oauth_scopes.length > 0 || r.provider_name === "SMTP_EMAIL"),
    ).toBe(true);
  });

  it("every adapter declares can_write=false until the send path is wired", () => {
    const rows = listConnectorAdapters();
    expect(rows.every((r) => r.can_write === false)).toBe(true);
  });
});

describe("Phase 1243 — setup steps + demo mode hardening", () => {
  it("every adapter declares plain-English setup steps and a demo-mode flag", () => {
    for (const row of listConnectorAdapters()) {
      expect(row.setup_steps.length, row.provider_name).toBeGreaterThan(0);
      expect(typeof row.demo_mode_available).toBe("boolean");
      for (const step of row.setup_steps) {
        expect(step.length).toBeGreaterThan(10);
        // Guidance only — never secrets or raw values.
        expect(step).not.toMatch(/sk-|secret=|password=/i);
      }
    }
  });

  it("write-capable adapters always state the approval gate in their steps", () => {
    for (const row of listConnectorAdapters()) {
      if (row.can_write) {
        const joined = row.setup_steps.join(" ").toLowerCase();
        expect(joined, row.provider_name).toContain("approval");
      }
    }
  });
});
