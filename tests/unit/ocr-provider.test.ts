// FILE: ocr-provider.test.ts
// PURPOSE: Phase 1227 — pure tests for the OCR provider adapter:
//          honest status reporting per provider, always-working
//          DEMO_FIXTURE + PLAIN_TEXT paths, blocked/uninstalled
//          providers fail closed with calm copy. No DB.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEMO_OBSERVE_FIXTURE_TEXT,
  extractTextWithProvider,
  listOCRProviderStatuses,
} from "../../apps/api/src/services/otzar/ocr-provider.js";

const ENV_KEYS = [
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_REGION",
  "GOOGLE_CLOUD_VISION_API_KEY",
];
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("Phase 1227 — listOCRProviderStatuses", () => {
  it("DEMO_FIXTURE and PLAIN_TEXT are always available", () => {
    const rows = listOCRProviderStatuses();
    expect(rows.find((r) => r.provider === "DEMO_FIXTURE")?.status).toBe(
      "DEMO_ONLY",
    );
    expect(rows.find((r) => r.provider === "PLAIN_TEXT")?.status).toBe(
      "READY",
    );
  });

  it("cloud providers are BLOCKED_BY_KEY without credentials", () => {
    const rows = listOCRProviderStatuses();
    expect(rows.find((r) => r.provider === "AWS_TEXTRACT")?.status).toBe(
      "BLOCKED_BY_KEY",
    );
    expect(rows.find((r) => r.provider === "GOOGLE_VISION")?.status).toBe(
      "BLOCKED_BY_KEY",
    );
  });

  it("cloud providers flip to READY when credentials are present", () => {
    process.env.AWS_ACCESS_KEY_ID = "test";
    process.env.AWS_SECRET_ACCESS_KEY = "test";
    process.env.AWS_REGION = "us-east-1";
    process.env.GOOGLE_CLOUD_VISION_API_KEY = "test";
    const rows = listOCRProviderStatuses();
    expect(rows.find((r) => r.provider === "AWS_TEXTRACT")?.status).toBe(
      "READY",
    );
    expect(rows.find((r) => r.provider === "GOOGLE_VISION")?.status).toBe(
      "READY",
    );
  });

  it("TESSERACT_LOCAL is honestly NEEDS_PROVIDER_INSTALL (no silent dependency)", () => {
    const rows = listOCRProviderStatuses();
    expect(rows.find((r) => r.provider === "TESSERACT_LOCAL")?.status).toBe(
      "NEEDS_PROVIDER_INSTALL",
    );
  });

  it("descriptions use calm copy, never developer vocabulary", () => {
    for (const row of listOCRProviderStatuses()) {
      for (const banned of ["payload", "schema", "adapter", "JSON", "OCR provider payload"]) {
        expect(row.description).not.toContain(banned);
      }
    }
  });
});

describe("Phase 1227 — extractTextWithProvider", () => {
  it("DEMO_FIXTURE returns the canonical demo text deterministically", () => {
    const r = extractTextWithProvider("DEMO_FIXTURE", {});
    expect(r.ok).toBe(true);
    if (r.ok === false) throw new Error("expected ok");
    expect(r.text).toBe(DEMO_OBSERVE_FIXTURE_TEXT);
    // The fixture must hit the Phase 1213 DEMO_SCRIPTED auto-detect
    // (title phrase + the three demo participants).
    const lc = r.text.toLowerCase();
    expect(lc).toContain("launch follow-up meeting");
    expect(lc).toContain("david");
    expect(lc).toContain("samiksha");
    expect(lc).toContain("annie");
  });

  it("PLAIN_TEXT passes provided text through and requires it", () => {
    const ok = extractTextWithProvider("PLAIN_TEXT", {
      plain_text: "Decision: ship it.",
    });
    expect(ok).toEqual({
      ok: true,
      text: "Decision: ship it.",
      provider: "PLAIN_TEXT",
    });
    const missing = extractTextWithProvider("PLAIN_TEXT", {});
    expect(missing.ok).toBe(false);
    if (missing.ok === false)
      expect(missing.code).toBe("PLAIN_TEXT_REQUIRED");
  });

  it("uninstalled and credential-blocked providers fail closed", () => {
    const tess = extractTextWithProvider("TESSERACT_LOCAL", {});
    expect(tess.ok).toBe(false);
    if (tess.ok === false) expect(tess.code).toBe("PROVIDER_NEEDS_INSTALL");

    const aws = extractTextWithProvider("AWS_TEXTRACT", {});
    expect(aws.ok).toBe(false);
    if (aws.ok === false) expect(aws.code).toBe("PROVIDER_BLOCKED_BY_KEY");

    const gv = extractTextWithProvider("GOOGLE_VISION", {});
    expect(gv.ok).toBe(false);
    if (gv.ok === false) expect(gv.code).toBe("PROVIDER_BLOCKED_BY_KEY");
  });

  it("a configured-but-unactivated cloud provider stays honest", () => {
    process.env.AWS_ACCESS_KEY_ID = "test";
    process.env.AWS_SECRET_ACCESS_KEY = "test";
    process.env.AWS_REGION = "us-east-1";
    const aws = extractTextWithProvider("AWS_TEXTRACT", {});
    expect(aws.ok).toBe(false);
    if (aws.ok === false) expect(aws.code).toBe("PROVIDER_NEEDS_INSTALL");
  });
});
