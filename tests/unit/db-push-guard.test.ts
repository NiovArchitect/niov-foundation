// FILE: tests/unit/db-push-guard.test.ts (unit)
// PURPOSE: Phase 1297-B — locks the fail-closed Prisma db-push guard
//          (scripts/prisma-db-push-guard.sh) that closes the production
//          schema-push incident. Proves: BOTH DATABASE_URL and DIRECT_URL must
//          be set + localhost; the literal incident (DIRECT_URL unset) is
//          denied; cloud/pooler hosts are denied; destructive flags are
//          refused; credentials are never printed (redaction); and the
//          sanctioned npm entry points + .gitignore route/ignore correctly.
// CONNECTS TO: scripts/prisma-db-push-guard.sh, scripts/prisma-db-push-test.sh,
//          package.json + packages/database/package.json (db:push), .gitignore.

import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const GUARD = "scripts/prisma-db-push-guard.sh";
const LOCAL = "postgresql://postgres:postgres@localhost:5433/foundation_test";
// Synthetic production-looking URLs — NEVER the real production credentials.
const FAKE_SECRET = "p4ssw0rd_DO_NOT_PRINT";
const FAKE_PROD = `postgresql://postgres.fake:${FAKE_SECRET}@aws-1-us-east-2.pooler.supabase.com:5432/postgres`;

// Run the guard in --check mode (validate only; never connects / pushes) with a
// crafted env. We replace the whole env so an unset DIRECT_URL is truly unset.
function runGuard(env: Record<string, string>, extraArgs: string[] = []) {
  const r = spawnSync("bash", [GUARD, "--check", ...extraArgs], {
    cwd: ROOT,
    encoding: "utf8",
    env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", ...env },
  });
  return { status: r.status, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

describe("prisma-db-push-guard — fail-closed BOTH-URL validation (1297-B)", () => {
  it("allows localhost DATABASE_URL + localhost DIRECT_URL (--check, no push)", () => {
    const r = runGuard({ DATABASE_URL: LOCAL, DIRECT_URL: LOCAL });
    expect(r.status).toBe(0);
    expect(r.out).toContain("validation passed");
  });

  it("DENIES the literal incident: DATABASE_URL localhost + DIRECT_URL UNSET", () => {
    const r = runGuard({ DATABASE_URL: LOCAL }); // DIRECT_URL intentionally absent
    expect(r.status).toBe(1);
    expect(r.out).toContain("DIRECT_URL is not set");
  });

  it("DENIES a production DIRECT_URL even when DATABASE_URL is localhost", () => {
    const r = runGuard({ DATABASE_URL: LOCAL, DIRECT_URL: FAKE_PROD });
    expect(r.status).toBe(1);
    expect(r.out.toLowerCase()).toContain("supabase");
  });

  it("DENIES a production DATABASE_URL (Supabase pooler host)", () => {
    const r = runGuard({ DATABASE_URL: FAKE_PROD, DIRECT_URL: LOCAL });
    expect(r.status).toBe(1);
  });

  it("DENIES when DATABASE_URL is unset", () => {
    const r = runGuard({ DIRECT_URL: LOCAL });
    expect(r.status).toBe(1);
    expect(r.out).toContain("DATABASE_URL is not set");
  });

  it("REFUSES destructive flags (--accept-data-loss)", () => {
    const r = runGuard({ DATABASE_URL: LOCAL, DIRECT_URL: LOCAL }, ["--accept-data-loss"]);
    expect(r.status).toBe(1);
    expect(r.out).toContain("destructive flag");
  });

  it("REDACTS credentials — never prints the password", () => {
    const r = runGuard({ DATABASE_URL: FAKE_PROD, DIRECT_URL: FAKE_PROD });
    expect(r.out).not.toContain(FAKE_SECRET);
  });
});

describe("sanctioned db-push entry points route through the guard (1297-B)", () => {
  it("root package.json db:push invokes the guard (no bare prisma db push)", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
    expect(pkg.scripts["db:push"]).toContain("prisma-db-push-guard.sh");
    expect(pkg.scripts["db:push"]).not.toMatch(/prisma db push/);
  });

  it("@niov/database workspace db:push invokes the guard (no bare prisma db push)", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "packages/database/package.json"), "utf8"));
    expect(pkg.scripts["db:push"]).toContain("prisma-db-push-guard.sh");
    expect(pkg.scripts["db:push"]).not.toMatch(/prisma db push/);
  });

  it("db:push:test still pins the test DB via the wrapper", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
    expect(pkg.scripts["db:push:test"]).toContain("prisma-db-push-test.sh");
  });

  it("no scripts/*.sh outside the allowlist invokes a bare `prisma db push`", () => {
    const allow = new Set([
      "prisma-db-push-guard.sh",
      "prisma-db-push-test.sh",
      "test-db-push-wrapper.sh",
    ]);
    const offenders: string[] = [];
    for (const f of readdirSync(join(ROOT, "scripts")).filter((n) => n.endsWith(".sh"))) {
      if (allow.has(f)) continue;
      const body = readFileSync(join(ROOT, "scripts", f), "utf8");
      // A real invocation line (not a comment / echo) containing `prisma db push`.
      for (const line of body.split("\n")) {
        const t = line.trim();
        if (t.startsWith("#") || t.includes("echo") || t.includes("printf")) continue;
        if (/prisma db push/.test(t)) offenders.push(`${f}: ${t}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it(".env.save is git-ignored (secrets backup never committable)", () => {
    const r = spawnSync("git", ["check-ignore", ".env.save"], { cwd: ROOT, encoding: "utf8" });
    expect(r.status).toBe(0); // status 0 = path is ignored
  });
});
