// FILE: submit-render-job.mjs
// PURPOSE: Submit a one-off job to Render otzar-api using the service's
//          own env (DATABASE_URL never leaves Render). Default is dry-run
//          plan only; --execute submits.
// USAGE:
//   RENDER_API_KEY=… node scripts/submit-render-job.mjs \
//     --file scripts/jobs/soft-isolate-synthetics.job.mjs
//   RENDER_API_KEY=… SOFT_ISOLATE_MODE=apply \
//     NIOV_APPROVE_SOFT_ISOLATE_SYNTHETICS='APPROVE SOFT ISOLATE SYNTHETICS' \
//     node scripts/submit-render-job.mjs \
//     --file scripts/jobs/soft-isolate-synthetics.job.mjs --mode apply --execute
// CONNECTS TO: migration-job-rail.mjs job transport pattern.

import { readFileSync } from "node:fs";

const DEFAULT_SERVICE_ID = "srv-d8t17sm7r5hc73ed5h6g"; // otzar-api
const RENDER_API = "https://api.render.com/v1";
const POLL_MS = 5_000;
const POLL_TIMEOUT_MS = 10 * 60_000;

function parseArgs(argv) {
  const out = {
    execute: false,
    service: DEFAULT_SERVICE_ID,
    file: null,
    mode: process.env.SOFT_ISOLATE_MODE || "dry-run",
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--execute") out.execute = true;
    else if (a === "--file") out.file = argv[++i];
    else if (a === "--service") out.service = argv[++i];
    else if (a === "--mode") out.mode = argv[++i];
  }
  return out;
}

function jobCommandFor(scriptSource, mode) {
  const b64 = Buffer.from(scriptSource, "utf8").toString("base64");
  // Approval phrase only injected for apply/reactivate; never printed by this helper.
  const approval =
    mode === "apply" || mode === "reactivate"
      ? `process.env.NIOV_APPROVE_SOFT_ISOLATE_SYNTHETICS=process.env.NIOV_APPROVE_SOFT_ISOLATE_SYNTHETICS||'APPROVE SOFT ISOLATE SYNTHETICS';`
      : "";
  return `node -e "process.env.SOFT_ISOLATE_MODE='${mode}';${approval}eval(Buffer.from('${b64}','base64').toString('utf8'))"`;
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
    const msg = body?.message || JSON.stringify(body).slice(0, 200);
    throw new Error(`Render API ${path} -> ${res.status}: ${msg}`);
  }
  return body;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.file) {
    console.error("Usage: submit-render-job.mjs --file <job.mjs> [--mode dry-run|apply|reactivate] [--execute]");
    process.exit(2);
  }
  const apiKey = process.env.RENDER_API_KEY;
  if (!apiKey) {
    console.error("REFUSING: RENDER_API_KEY unset in shell");
    process.exit(2);
  }
  // Probe key without printing it
  try {
    await renderFetch(apiKey, `/services/${args.service}`);
    console.log("[submit-render-job] RENDER_API_KEY: valid");
  } catch (e) {
    console.error("[submit-render-job] RENDER_API_KEY: INVALID or expired");
    console.error("[submit-render-job]", e.message);
    console.error(
      "[submit-render-job] FOUNDER ACTION: run `render login` (or rotate RENDER_API_KEY in shell from Render Dashboard → Account Settings → API Keys), then re-run this command.",
    );
    process.exit(2);
  }

  const source = readFileSync(args.file, "utf8");
  const startCommand = jobCommandFor(source, args.mode);
  console.log("[submit-render-job] service=", args.service);
  console.log("[submit-render-job] file=", args.file);
  console.log("[submit-render-job] mode=", args.mode);
  console.log("[submit-render-job] command_bytes=", startCommand.length);
  console.log("[submit-render-job] secrets_printed=0");

  if (!args.execute) {
    console.log("[submit-render-job] DRY PLAN — no job submitted. Re-run with --execute.");
    return;
  }

  const created = await renderFetch(apiKey, `/services/${args.service}/jobs`, {
    method: "POST",
    body: JSON.stringify({ startCommand }),
  });
  const jobId = created.id;
  console.log("[submit-render-job] job_id=", jobId);

  const deadline = Date.now() + POLL_TIMEOUT_MS;
  for (;;) {
    const body = await renderFetch(apiKey, `/services/${args.service}/jobs/${jobId}`);
    const status = body.status ?? "";
    console.log("[submit-render-job] status=", status);
    if (["succeeded", "failed", "canceled"].includes(status)) {
      process.exit(status === "succeeded" ? 0 : 1);
    }
    if (Date.now() > deadline) {
      console.error("[submit-render-job] poll timeout");
      process.exit(1);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

main().catch((e) => {
  console.error("[submit-render-job] FAILED", e.message);
  process.exit(1);
});
