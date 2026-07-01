// FILE: work-grounding.ts
// PURPOSE: Slice E — format the caller's governed work context as a BOUNDED,
//          labeled prompt block so Otzar answers from real WorkLedger facts
//          instead of static prompt context. Consumed by conductSession as an
//          OUTSIDE-BUDGET sidecar (like L_ALIGNMENT) — it never enters the
//          truncation bundle, so it cannot displace the L8 conversation history.
//          The block is small and capped; empty input → empty block (the model
//          is told to say "I don't have that" rather than invent).
// CONNECTS TO: work-os/org-query.service.ts (OrgQueryResult), otzar.service.ts.

import type { OrgQueryResult } from "./org-query.service.js";

const MAX_ROWS = 5;
const MAX_TITLE = 120;
const MAX_EVIDENCE = 90;

/** Turn grounded, caller-scoped work rows into a compact grounding block. Returns
 *  "" for no rows — conductSession then adds nothing, so the prompt is unchanged. */
export function formatWorkGroundingBlock(results: readonly OrgQueryResult[]): string {
  if (results.length === 0) return "";
  const lines: string[] = [
    "[YOUR WORK RECORD — grounded facts from your governed work ledger. Answer from",
    "these when relevant; if the answer isn't here, say you don't have that",
    "information rather than inventing it. These are the caller's own authorized",
    "records only.]",
    "",
  ];
  for (const r of results.slice(0, MAX_ROWS)) {
    const owner = r.owner ? `, owner ${r.owner}` : "";
    const gap = r.connector_gap ? `, needs ${r.connector_gap.required_connector}` : "";
    const ev = r.source_evidence ? ` — evidence: "${String(r.source_evidence).slice(0, MAX_EVIDENCE)}"` : "";
    lines.push(`- ${String(r.title).slice(0, MAX_TITLE)} [${r.status}${owner}${gap}]${ev}`);
  }
  return lines.join("\n").trimEnd();
}
