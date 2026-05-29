# Current Build State — Section Detail Index

This directory holds the **per-section** detailed canonical record
for the 10 Foundation production sections. The master operational
index lives one level up at
[`../CURRENT_BUILD_STATE.md`](../CURRENT_BUILD_STATE.md) and is
intentionally kept lean.

## Architecture

- **Master:** `docs/CURRENT_BUILD_STATE.md` — operational index.
  Latest main HEAD, latest merged PR, current active branch / PR,
  10-section status table, next-slice queue, links to each section
  file, global do-not-claim list, global product directives.
  Target size: ≤ 500 lines (cap ≤ 1,000 lines).
- **Section files:** `docs/current-build-state/XX-name.md` — one per
  production section. Detailed canonical record for that section
  only: live status, landed PRs + commit hashes, routes / services /
  schema / tests landed, what is live vs not live, RULE 13
  disclosures specific to the section, next slices for the section,
  risks / forward-substrate, back-link to the master.

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

**Do not bloat the master.** The master is for "what is the state
of the system right now"; the section files are for "what
specifically landed in this section's history."

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
