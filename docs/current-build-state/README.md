# Current Build State — Section Detail Index

Tier 3 of the Foundation 5-tier docs hierarchy. This directory
holds the **per-section** detailed canonical record for the 10
Foundation production sections. The master operational index
lives one level up at
[`../CURRENT_BUILD_STATE.md`](../CURRENT_BUILD_STATE.md) and is
intentionally kept lean.

## 5-tier documentation hierarchy

| Tier | Location | Purpose | Style |
|---|---|---|---|
| 1 | [`../NEXT_ACTION.md`](../NEXT_ACTION.md) | Operational baton | Compact, current, ≤ 150 lines. Read first every session. |
| 2 | [`../CURRENT_BUILD_STATE.md`](../CURRENT_BUILD_STATE.md) | Lean master index | Concise but authoritative. 10-section status + global truths. Cap ≤ 1000 lines. |
| 3 | this directory (`XX-section.md`) | Canonical section truth | Detailed enough for client-ready continuity. Don't starve of necessary detail. |
| 4 | [`../build-log/`](../build-log/) | PR-specific black-box recorder | Detailed for major architecture boundaries; short or skipped for routine routes. |
| 5 | [`../architecture/decisions/`](../architecture/decisions/) | ADRs — durable architectural law | Deep, precise, rigorous. Never compressed for speed. |

The key rule: **move detail to the correct layer; do not delete
clarity.** Lean docs ≠ less rigorous docs. Client-ready
documentation means the right level of detail in the right
document.

## Architecture

- **Master (tier 2):** `docs/CURRENT_BUILD_STATE.md` — operational
  index. Latest main HEAD, latest merged PR, current active
  branch / PR, 10-section status table, next-slice queue, links
  to each section file, global do-not-claim list, global product
  directives. Target size: ≤ 500 lines (cap ≤ 1,000 lines).
- **Section files (tier 3):** `docs/current-build-state/XX-name.md`
  — one per production section. Detailed canonical record for
  that section only: live status, landed PRs + commit hashes,
  routes / services / schema / tests landed, what is live vs not
  live, RULE 13 disclosures specific to the section, next slices
  for the section, risks / forward-substrate, back-link to the
  master. Do NOT over-compress major architecture state in these
  files; client-ready continuity requires the detail.

## The 10 sections

| # | File | Section |
|---|---|---|
| 1 | [01-employee-intelligence-core.md](01-employee-intelligence-core.md) | Employee Intelligence Core |
| 2 | [02-autonomous-execution-core.md](02-autonomous-execution-core.md) | Autonomous Execution Core |
| 3 | [03-hives-team-intelligence.md](03-hives-team-intelligence.md) | Hives / Team Intelligence |
| 4 | [04-mcp-connectors.md](04-mcp-connectors.md) | MCP / Connectors |
| 5 | [05-agent-playground.md](05-agent-playground.md) | Agent Playground |
| 6 | [06-enterprise-analytics.md](06-enterprise-analytics.md) | Enterprise Analytics |
| 7 | [07-full-audit-viewer.md](07-full-audit-viewer.md) | Full Audit Viewer |
| 8 | [08-billing-entitlements.md](08-billing-entitlements.md) | Billing / Entitlements |
| 9 | [09-admin-governance-control-tower.md](09-admin-governance-control-tower.md) | Admin / Governance Control Tower |
| 10 | [10-deployment-security-go-live.md](10-deployment-security-go-live.md) | Deployment / Security / Go-Live Operations |

## Refresh rule (mandatory)

For every completed **wave** (not every individual PR):

1. Update [`../NEXT_ACTION.md`](../NEXT_ACTION.md) — keep it
   ≤ 150 lines; the next-session operational baton.
2. Update `docs/CURRENT_BUILD_STATE.md` with a **short** index
   touchup (bump "latest main HEAD" + "latest merged PR" +
   relevant 10-section status row + one line per landed PR in
   the recent-merges table).
3. Update the relevant `docs/current-build-state/XX-section.md`
   with a **concise wave summary** — what landed, what's now
   live, what's still forward-substrate. Avoid 300+ line refreshes
   for routine routes; capture the truth, not the prose.

Per the `[FOUNDATION-VELOCITY-CORRECTION]` directive: docs
refresh fires **once per wave**, not after every small PR.
Implementation PRs may still be separate for safety. A wave
shares substrate, requires no schema migration, does not cross
into unrelated sections, and requires no new
product/architecture decisions.

For **major** architectural landings (new substrate cluster,
security/governance landing, schema change, cross-section
integration, complex runtime behavior, RULE 21 paste), also
write a tier-4 build-log entry per
[`../build-log/README.md`](../build-log/README.md). Routine
small routes do not need build-log entries — the section file
captures the truth.

**Do not bloat the master.** The master is for "what is the state
of the system right now"; the section files are for "what
specifically landed in this section's history."

**Do not starve section files of detail.** The founder's tier-3
discipline: detailed enough for client-ready continuity. Don't
over-compress major architecture state to chase a shorter file.

## Discipline preserved

The section split does not weaken any existing discipline:

- RULE 0 sovereignty + RULE 4 audit + RULE 10 soft-delete +
  RULE 12 pre-flight grep + RULE 13 surface drifts inline +
  RULE 14 bidirectional citations + RULE 20 patent-holder-only
  rule modification + RULE 21 pre-authorization research arc
  all apply to docs work in this directory.
- Every commit landing in any section file is still
  Founder-authorized per RULE 20 if it touches RULES /
  ADRs.
- Each section file ends with a back-link to the master so the
  citation graph is closed per RULE 14.
