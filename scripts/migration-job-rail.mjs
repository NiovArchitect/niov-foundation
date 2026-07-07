#!/usr/bin/env node
// FILE: migration-job-rail.mjs
// PURPOSE: [MIGRATION-JOB-RAIL] Codifies the pilot-ops runbook §2 additive-
//          migration procedure (the P2022 lesson) as ONE fail-closed script
//          instead of ad-hoc curl. Sequence, ALL before merging code that
//          reads the new column/table:
//            1. FAIL-CAPABLE CANARY: submit a job that MUST fail
//               (process.exit(1)). If the job rail reports it "succeeded",
//               the rail is lying (the silent-no-op failure mode that
//               caused the P2022 auth outage) -- ABORT.
//            2. IDEMPOTENT DDL JOB: the author-provided node script
//               (prisma.$executeRawUnsafe with IF NOT EXISTS /
//               duplicate_object guards), base64-shipped, running with the
//               service's own env. Poll to succeeded.
//            3. INDEPENDENT VERIFY JOB: the author-provided second script
//               that SELECTs information_schema/pg_indexes and exits
//               non-zero if anything is missing. Poll to succeeded.
//          SAFETY: refuses to submit anything without --execute (default
//          is a dry-run that prints the plan); DDL/verify scripts are
//          author-reviewed files, never generated here; destructive
//          migrations stay founder-tier and do NOT ride this rail.
// USAGE:
//   RENDER_API_KEY=… node scripts/migration-job-rail.mjs \
//     --ddl scripts/migrations/<change>.ddl.mjs \
//     --verify scripts/migrations/<change>.verify.mjs \
//     [--service srv-d8t17sm7r5hc73ed5h6g] [--execute]
// CONNECTS TO: CT docs/otzar/OTZAR_PILOT_OPS_RUNBOOK.md §2 (the BINDING
//          procedure), docs/operations/deployment-runbook.md,
//          tests/unit/migration-job-rail.test.ts (pure-logic coverage).

import { readFileSync } from "node:fs";

export const DEFAULT_SERVICE_ID = "srv-d8t17sm7r5hc73ed5h6g"; // otzar-api
const RENDER_API = "https://api.render.com/v1";
const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 10 * 60_000;

// WHAT: Build the job start command that ships an author-provided node
//        script to the service environment, base64-encoded.
// INPUT: The script source text.
// OUTPUT: The Render job startCommand string.
// WHY: base64 survives shell quoting on the job runner; the service's own
//      env supplies DATABASE_URL so no credential ever leaves Render.
export function jobCommandFor(scriptSource) {
  const b64 = Buffer.from(scriptSource, "utf8").toString("base64");
  return `node -e "eval(Buffer.from('${b64}','base64').toString('utf8'))"`;
}

// WHAT: The canary command -- a job that MUST fail.
// INPUT: None.
// OUTPUT: The startCommand string.
// WHY: Runbook §2 step 1 -- proves the job rail actually reports failure
//      before we trust it to report DDL success.
export function canaryCommand() {
  return 'node -e "process.exit(1)"';
}

// WHAT: Decide the rail verdict for a finished canary job.
// INPUT: The job's terminal status string.
// OUTPUT: true when the rail is trustworthy (the canary FAILED as it must).
// WHY: A "succeeded" canary is the exact lying-rail signature -- abort.
export function canaryProvesRail(status) {
  return status === "failed";
}

// WHAT: Classify a Render job status as terminal.
// INPUT: The status string from GET /jobs/:id.
// OUTPUT: true when polling should stop.
export function isTerminal(status) {
  return ["succeeded", "failed", "canceled"].includes(status);
}

async function renderFetch(apiKey, path, init = {}) {
  const res = await fetch(`${RENDER_API}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Render API ${path} -> ${res.status}`);
  }
  return body;
}

async function submitJob(apiKey, serviceId, startCommand) {
  const body = await renderFetch(apiKey, `/services/${serviceId}/jobs`, {
    method: "POST",
    body: JSON.stringify({ startCommand }),
  });
  return body.id;
}

async function pollJob(apiKey, serviceId, jobId) {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  for (;;) {
    const body = await renderFetch(
      apiKey,
      `/services/${serviceId}/jobs/${jobId}`,
    );
    const status = body.status ?? "";
    if (isTerminal(status)) return status;
    if (Date.now() > deadline) {
      throw new Error(`Job ${jobId} did not reach a terminal state in time`);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

function parseArgs(argv) {
  const args = { execute: false, service: DEFAULT_SERVICE_ID };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--execute") args.execute = true;
    else if (a === "--ddl") args.ddl = argv[++i];
    else if (a === "--verify") args.verify = argv[++i];
    else if (a === "--service") args.service = argv[++i];
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const log = (m) => process.stdout.write(`${m}\n`);
  if (!args.ddl || !args.verify) {
    log("Usage: migration-job-rail.mjs --ddl <file> --verify <file> [--service <id>] [--execute]");
    process.exit(2);
  }
  const apiKey = process.env.RENDER_API_KEY;
  const ddlSource = readFileSync(args.ddl, "utf8");
  const verifySource = readFileSync(args.verify, "utf8");
  // Honest-idempotence heuristics: the DDL author must show their guards.
  if (!/IF NOT EXISTS|duplicate_object|IF EXISTS/i.test(ddlSource)) {
    log("ABORT: the DDL script carries no idempotence guard (IF NOT EXISTS / duplicate_object). Runbook §2 requires idempotent DDL.");
    process.exit(2);
  }
  if (!/process\.exit\(1\)|process\.exitCode/.test(verifySource)) {
    log("ABORT: the verify script never sets a non-zero exit — it cannot fail, so it cannot verify. Runbook §2 requires a fail-capable verify.");
    process.exit(2);
  }

  log(`Migration job rail — service ${args.service}`);
  log(`  1. canary: ${canaryCommand()}`);
  log(`  2. DDL:    ${args.ddl} (${ddlSource.length} bytes, base64-shipped)`);
  log(`  3. verify: ${args.verify} (${verifySource.length} bytes, base64-shipped)`);
  if (!args.execute) {
    log("DRY RUN (no jobs submitted). Re-run with --execute to run the rail.");
    return;
  }
  if (!apiKey) {
    log("ABORT: RENDER_API_KEY is not set in the environment.");
    process.exit(2);
  }

  // 1. Fail-capable canary.
  const canaryId = await submitJob(apiKey, args.service, canaryCommand());
  const canaryStatus = await pollJob(apiKey, args.service, canaryId);
  if (!canaryProvesRail(canaryStatus)) {
    log(`ABORT: canary job ${canaryId} reported '${canaryStatus}' — a canary that must fail did not. The job rail is not telling the truth; nothing was submitted.`);
    process.exit(1);
  }
  log(`  canary ${canaryId}: failed as required — the rail reports failures ✓`);

  // 2. Idempotent DDL.
  const ddlId = await submitJob(apiKey, args.service, jobCommandFor(ddlSource));
  const ddlStatus = await pollJob(apiKey, args.service, ddlId);
  if (ddlStatus !== "succeeded") {
    log(`ABORT: DDL job ${ddlId} -> ${ddlStatus}. Inspect the job logs in Render; nothing further was submitted.`);
    process.exit(1);
  }
  log(`  DDL ${ddlId}: succeeded ✓`);

  // 3. Independent verify.
  const verifyId = await submitJob(apiKey, args.service, jobCommandFor(verifySource));
  const verifyStatus = await pollJob(apiKey, args.service, verifyId);
  if (verifyStatus !== "succeeded") {
    log(`ABORT: verify job ${verifyId} -> ${verifyStatus}. The schema change is NOT proven — do not merge dependent code.`);
    process.exit(1);
  }
  log(`  verify ${verifyId}: succeeded ✓`);
  log("Rail complete: schema change applied AND independently verified. Safe to merge the dependent code (runbook §2 step 4).");
}

const isDirectRun =
  typeof process.argv[1] === "string" &&
  import.meta.url.endsWith(process.argv[1].split("/").pop() ?? "");
if (isDirectRun) {
  main().catch((err) => {
    process.stdout.write(`ABORT: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}
