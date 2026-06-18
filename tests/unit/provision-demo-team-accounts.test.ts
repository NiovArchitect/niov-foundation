// FILE: tests/unit/provision-demo-team-accounts.test.ts
// PURPOSE: Phase 1304-C — guard the safety invariants of the one-off demo
//          provisioning + verification scripts: an EXACT 8-email allowlist,
//          the exact approval phrase, password supplied via env only (no
//          hardcoded literal default), and no plaintext password / secret
//          baked into the source. These are pure, DB-free checks.
// CONNECTS TO: scripts/provision-demo-team-accounts.ts,
//              scripts/verify-demo-logins.ts.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = process.cwd();
const PROVISION = path.join(REPO_ROOT, "scripts/provision-demo-team-accounts.ts");
const VERIFY = path.join(REPO_ROOT, "scripts/verify-demo-logins.ts");

const EXPECTED_EMAILS = [
  "sadeil@niovlabs.com",
  "david@niovlabs.com",
  "vishesh@niovlabs.com",
  "samiksha@niovlabs.com",
  "shweta@niovlabs.com",
  "william@niovlabs.com",
  "annie@niovlabs.com",
  "walter@niovlabs.com",
] as const;

const APPROVAL_PHRASE = "APPROVE FULL DEMO TEAM ACCOUNTS — exact allowlist only";

describe("Phase 1304-C — demo provisioning script safety invariants", () => {
  const provisionSrc = readFileSync(PROVISION, "utf8");
  const verifySrc = readFileSync(VERIFY, "utf8");

  it("provision script lists EXACTLY the 8 allowlisted @niovlabs.com emails", () => {
    for (const e of EXPECTED_EMAILS) expect(provisionSrc).toContain(e);
    // No other @niovlabs.com person emails sneak in (twin/org bootstrap emails
    // are explicitly NOT person accounts and use different local-parts).
    const personEmails = [...provisionSrc.matchAll(/email:\s*"([^"]+@niovlabs\.com)"/g)].map(
      (m) => m[1],
    );
    expect(new Set(personEmails)).toEqual(new Set(EXPECTED_EMAILS));
    expect(personEmails).toHaveLength(EXPECTED_EMAILS.length);
  });

  it("never targets integration-test fixture accounts", () => {
    // The reassurance log mentions __niov_test__ ("NOT touched"); what must be
    // absent is any fixture EMAIL the script would act on.
    expect(provisionSrc).not.toContain("__niov_test__@");
    expect(provisionSrc).not.toContain("@niov.test");
  });

  it("requires the exact approval phrase + DEMO_SHARED_PASSWORD env", () => {
    expect(provisionSrc).toContain(APPROVAL_PHRASE);
    expect(provisionSrc).toContain("DEMO_SHARED_PASSWORD");
    expect(provisionSrc).toContain("NIOV_APPROVE_DEMO_TEAM_ACCOUNTS");
  });

  it("supplies the password via env only — no hardcoded literal default", () => {
    // demo-team-seed.ts uses `?? "<literal>"`; these one-off scripts must NOT.
    expect(provisionSrc).not.toMatch(/DEMO_SHARED_PASSWORD["'\]]*\s*\?\?\s*["']/);
    expect(verifySrc).not.toMatch(/DEMO_SHARED_PASSWORD["'\]]*\s*\?\?\s*["']/);
    // No 12+ char quoted password-shaped literal assigned to the password var.
    expect(provisionSrc).not.toMatch(/password\s*=\s*["'][^"']{12,}["']/i);
  });

  it("never deletes, never executes raw SQL / DDL (operations, not prose)", () => {
    // Precise: no Prisma delete CALLS and no raw-SQL execution. The safety
    // banner text ("no DDL, no db push") is allowed.
    expect(provisionSrc).not.toMatch(/\.\s*delete(Many)?\s*\(/);
    expect(provisionSrc).not.toMatch(/\$(execute|query)Raw(Unsafe)?\b/);
  });

  it("--help prints the allowlist + approval phrase and leaks no password", () => {
    const out = execFileSync(process.execPath, ["--import", "tsx", PROVISION, "--help"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      timeout: 60_000,
    });
    for (const e of EXPECTED_EMAILS) expect(out).toContain(e);
    expect(out).toContain(APPROVAL_PHRASE);
    expect(out).toContain("never prints the password");
    // Help text must not embed a concrete password-shaped literal.
    expect(out).not.toMatch(/[A-Za-z]+-[A-Za-z]+-\d{3}!/);
  });
});
