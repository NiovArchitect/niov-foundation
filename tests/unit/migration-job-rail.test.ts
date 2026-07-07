// FILE: tests/unit/migration-job-rail.test.ts
// PURPOSE: [MIGRATION-JOB-RAIL] Pure-logic coverage for the codified
//          runbook-§2 additive-migration rail (scripts/migration-job-rail
//          .mjs): the canary verdict (a canary that "succeeded" means the
//          job rail is lying — the P2022 signature), base64 job-command
//          construction, and terminal-status classification. The live
//          Render submission path is deliberately NOT exercised here —
//          the script's dry-run default plus these invariants keep the
//          dangerous parts honest without touching any deploy surface.
// CONNECTS TO: scripts/migration-job-rail.mjs, CT
//          docs/otzar/OTZAR_PILOT_OPS_RUNBOOK.md §2.

import { describe, expect, it } from "vitest";
// eslint-disable-next-line no-restricted-imports -- plain-file script import
import {
  canaryCommand,
  canaryProvesRail,
  isTerminal,
  jobCommandFor,
  DEFAULT_SERVICE_ID,
} from "../../scripts/migration-job-rail.mjs";

describe("[MIGRATION-JOB-RAIL] canary verdict", () => {
  it("a FAILED canary proves the rail reports failures", () => {
    expect(canaryProvesRail("failed")).toBe(true);
  });
  it("a SUCCEEDED canary is the lying-rail signature — never trusted", () => {
    expect(canaryProvesRail("succeeded")).toBe(false);
  });
  it("non-terminal / canceled statuses never prove the rail", () => {
    expect(canaryProvesRail("running")).toBe(false);
    expect(canaryProvesRail("canceled")).toBe(false);
    expect(canaryProvesRail("")).toBe(false);
  });
  it("the canary command is a guaranteed non-zero exit", () => {
    expect(canaryCommand()).toContain("process.exit(1)");
  });
});

describe("[MIGRATION-JOB-RAIL] job command construction", () => {
  it("ships the script base64-encoded and decodes back byte-identical", () => {
    const src = "await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS x()`);";
    const cmd = jobCommandFor(src);
    const b64 = cmd.match(/Buffer\.from\('([^']+)','base64'\)/)?.[1] ?? "";
    expect(Buffer.from(b64, "base64").toString("utf8")).toBe(src);
    // No raw quotes from the payload leak into the shell command.
    expect(cmd).not.toContain("$executeRawUnsafe");
  });
});

describe("[MIGRATION-JOB-RAIL] terminal classification", () => {
  it("succeeded / failed / canceled are terminal; running / pending are not", () => {
    expect(isTerminal("succeeded")).toBe(true);
    expect(isTerminal("failed")).toBe(true);
    expect(isTerminal("canceled")).toBe(true);
    expect(isTerminal("running")).toBe(false);
    expect(isTerminal("pending")).toBe(false);
  });
  it("targets otzar-api by default", () => {
    expect(DEFAULT_SERVICE_ID).toBe("srv-d8t17sm7r5hc73ed5h6g");
  });
});
