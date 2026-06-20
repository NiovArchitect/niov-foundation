// FILE: tests/unit/avp-positive-live-server-safety.test.ts (unit)
// PURPOSE: F-1363 — anchor the safety invariants of the repeatable local live
//          server harness (scripts/avp-positive-live-server.mts) at the source
//          level so they cannot silently regress: it refuses production, refuses a
//          non-local DATABASE_URL, loads the local test env with OVERRIDE before
//          dynamic-importing workspace packages (so it never builds the Prisma
//          client against the root-`.env` production target), enables the seed
//          endpoint only locally, and never writes the token to a committed path.
//          Source-scan only — no DB, no server boot.
// CONNECTS TO: scripts/avp-positive-live-server.mts.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = readFileSync(fileURLToPath(new URL("../../scripts/avp-positive-live-server.mts", import.meta.url)), "utf8");

describe("avp-positive-live-server harness safety anchors", () => {
  it("1. refuses NODE_ENV=production", () => {
    expect(SRC).toContain('NODE_ENV === "production"');
    expect(SRC).toContain("refuses NODE_ENV=production");
  });
  it("2. refuses a non-local DATABASE_URL by default", () => {
    expect(SRC).toContain("isLocalDb");
    expect(SRC).toContain("AVP_LIVE_ALLOW_NONLOCAL_DB");
    expect(SRC).toContain("refuses a non-local DATABASE_URL");
  });
  it("3. loads .env.test with override BEFORE importing workspace packages", () => {
    const overrideIdx = SRC.indexOf('".env.test", override: true');
    const firstDynImport = SRC.indexOf('await import("@niov/');
    expect(overrideIdx).toBeGreaterThan(0);
    expect(firstDynImport).toBeGreaterThan(overrideIdx); // override precedes dynamic imports
  });
  it("4. uses dynamic imports for workspace packages (not static top-level)", () => {
    expect(SRC).toContain('await import("@niov/api")');
    expect(SRC).toContain('await import("@niov/database")');
    expect(SRC).not.toMatch(/^import .* from "@niov\//m);
  });
  it("5. enables the dev-gated seed endpoint flag", () => {
    expect(SRC).toContain('FOUNDATION_ENABLE_LOCAL_AVP_SEED = "true"');
  });
  it("6. writes runtime metadata only under /tmp, chmod 600", () => {
    expect(SRC).toContain('"/tmp/avp-live.json"');
    expect(SRC).toContain("0o600");
    // never a committed path
    expect(SRC).not.toContain("packages/");
    expect(SRC).not.toContain("apps/api/src");
  });
  it("7. the READY line never prints the token", () => {
    expect(SRC).toContain("token=[REDACTED]");
    expect(SRC).toMatch(/AVP_LIVE_READY[^\n]*\[REDACTED\]/);
  });
});
