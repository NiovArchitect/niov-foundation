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
        .filter((r) => r.required_envs.length > 0 && r.category !== "AI")
        .every((r) => r.oauth_scopes.length > 0 || r.provider_name === "SMTP_EMAIL"),
    ).toBe(true);
  });

  it("every adapter declares can_write=false until the send path is wired", () => {
    const rows = listConnectorAdapters();
    expect(rows.every((r) => r.can_write === false)).toBe(true);
  });
});
