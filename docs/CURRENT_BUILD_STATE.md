# NIOV Foundation — Current Build State

**Status:** Tier 2 of the Foundation 5-tier docs hierarchy.
Lean master index by design. Tier 1 operational baton:
[`docs/NEXT_ACTION.md`](NEXT_ACTION.md). Tier 3 per-section
detail: [`docs/current-build-state/`](current-build-state/).
Tier 4 PR-specific build-log:
[`docs/build-log/`](build-log/). Tier 5 ADRs:
[`docs/architecture/decisions/`](architecture/decisions/).

**Last updated:** 2026-05-29
([FOUNDATION-CURRENT-BUILD-STATE-SPLIT-ARCHITECTURE-QLOCK]).

## Current state

- **Latest main HEAD:** `75933ad0e608aa18ed51b6d664b7eb51febe6f93`
- **Latest merged PR:** [#32](https://github.com/NiovArchitect/niov-foundation/pull/32) — Add ADR-0057 GET actions list route (2026-05-29).
- **Active branch / PR:** docs split slice (this commit).
- **Active production section:** Section 2 — Autonomous Execution Core.
- **TypeScript baseline:** exactly 4 canonical residual errors per ADR-0015 Decision B Amendment 1.
- **Live `ACTION_*` audit emitters:** 10 of 10 (canonical ADR-0057 §10 vocabulary fully wired).

## 10 production section status

| # | Section | Status | Detail |
|---|---|---|---|
| 1 | Employee Intelligence Core | Foundational substrate landed pre-Section-12; Otzar Wave 2A/B/C designs accepted (code forward-substrate). | [`01-employee-intelligence-core.md`](current-build-state/01-employee-intelligence-core.md) |
| 2 | Autonomous Execution Core | **PARTIAL — production-grade.** Create + cancel + GET viewer + GET list LIVE; 10 of 10 `ACTION_*` emitters LIVE; stub handlers only. | [`02-autonomous-execution-core.md`](current-build-state/02-autonomous-execution-core.md) |
| 3 | Hives / Team Intelligence | Not started. Forward-substrate. | [`03-hives-team-intelligence.md`](current-build-state/03-hives-team-intelligence.md) |
| 4 | MCP / Connectors | Not started. Deferred per ADR-0057 §17 + ADR-0058. | [`04-mcp-connectors.md`](current-build-state/04-mcp-connectors.md) |
| 5 | Agent Playground | Not started. Forward-substrate after Section 4. | [`05-agent-playground.md`](current-build-state/05-agent-playground.md) |
| 6 | Enterprise Analytics | Not started. Forward-substrate after Section 3. | [`06-enterprise-analytics.md`](current-build-state/06-enterprise-analytics.md) |
| 7 | Full Audit Viewer | Primitives LIVE (`queryAuditEvents`, `verifyAuditChain`). Viewer route + UX forward-substrate. | [`07-full-audit-viewer.md`](current-build-state/07-full-audit-viewer.md) |
| 8 | Billing / Entitlements | Monetization substrate partial (`PRICING_TABLE`, 70/30 split). Entitlements layer forward-substrate. | [`08-billing-entitlements.md`](current-build-state/08-billing-entitlements.md) |
| 9 | Admin / Governance Control Tower | Backend contracts consumed by frontend partially LIVE; CT frontend lives in [`otzar-control-tower`](https://github.com/NiovArchitect/otzar-control-tower). | [`09-admin-governance-control-tower.md`](current-build-state/09-admin-governance-control-tower.md) |
| 10 | Deployment / Security / Go-Live | Track A closed; ADR-0011/0013/0015/0018/0019/0024/0025/0047 substrate LIVE; GOVSEC.5 (ADR-0050) Accepted; GOVSEC.2–4 + GOVSEC.6–10 forward-substrate. | [`10-deployment-security-go-live.md`](current-build-state/10-deployment-security-go-live.md) |

## Recent merges (last 10 implementation + docs PRs)

| PR | Commit | Description |
|---|---|---|
| [#32](https://github.com/NiovArchitect/niov-foundation/pull/32) | `75933ad` | Add ADR-0057 GET actions list route |
| [#31](https://github.com/NiovArchitect/niov-foundation/pull/31) | `bcdacc7` | Docs refresh for #30 |
| [#30](https://github.com/NiovArchitect/niov-foundation/pull/30) | `8af6f77` | Add ADR-0057 GET action viewer route |
| [#29](https://github.com/NiovArchitect/niov-foundation/pull/29) | `1254f6d` | Docs refresh for #28 |
| [#28](https://github.com/NiovArchitect/niov-foundation/pull/28) | `8d9c1bc` | Add ADR-0057 action cancel route (non-RUNNING) |
| [#27](https://github.com/NiovArchitect/niov-foundation/pull/27) | `910b286` | Docs refresh for #26 |
| [#26](https://github.com/NiovArchitect/niov-foundation/pull/26) | `fe46e22` | Add ADR-0057 action lifecycle executor substrate |
| [#25](https://github.com/NiovArchitect/niov-foundation/pull/25) | `7949841` | Docs refresh for #24 |
| [#24](https://github.com/NiovArchitect/niov-foundation/pull/24) | `487fce1` | Add ADR-0057 action create route |
| [#23](https://github.com/NiovArchitect/niov-foundation/pull/23) | `7f30f5b` | Docs refresh for #22 |

## Immediate next work queue

1. **`[ADR-0057-PER-TYPE-HANDLERS-RESEARCH-ARC-QLOCK]`** — first real per-`ActionType` handler. `RECORD_CAPSULE` is the natural first surface (wires Action runtime to COSMP WRITE). RULE 21 research arc REQUIRED (crosses Action↔COSMP boundary). Details: [Section 2](current-build-state/02-autonomous-execution-core.md#next-slices-priority-order).
2. **`[ADR-0057-RUNNING-CANCEL-BREAK-GLASS-EXECUTE-VERIFY-AUTH]`** — privileged `RUNNING → CANCELLED` on the GOVSEC.5 break-glass substrate (ADR-0050) + `AbortController` plumbing.
3. **`[ADR-0057-ACTIONPOLICY-RETRY-BUDGET-AND-TIMEOUT-SCHEMA-QLOCK]`** — promote LOCK-GAP-1 + LOCK-GAP-2 from service-tier constants to schema fields.
4. Wave 2A/B/C Otzar employee-twin route implementations (Section 1 priority).
5. GOVSEC.5 follow-on `requireAdminCapability` throttle.

## Critical Do-NOT-claim list (global truths)

- "Autonomous Execution is fully live." — runtime executes through **stub handlers only**; real per-`ActionType` business effects are forward-substrate.
- "AI Twins can fully execute actions on real systems." — they cannot until per-type handlers land.
- "Connectors / MCP are live." — deferred per ADR-0057 §17 + ADR-0058.
- "Cancel works for RUNNING actions." — non-RUNNING only; RUNNING-cancellation requires break-glass substrate.
- "`ACTION_TIMED_OUT` is an audit literal." — no; the vocabulary is closed at 10. Timeouts emit `ACTION_FAILED` with `error_class = "EXECUTOR_TIMEOUT"`.
- "Sesame / voice / desktop edge / wearable lens UX is live." — forward product architecture, not implemented.
- "Otzar supports browser automation / native-app automation / MCP connectors." — false; future authorized slices only.
- "TypeScript has zero errors." — baseline is 4 canonical residuals (ADR-0015 Decision B Amendment 1).
- "All 10 production sections are complete." — only Section 1 (foundational) + Section 2 (PARTIAL) + CI-guard pre-arm are at production grade.
- "Migrations were applied." — only when explicitly authorized + executed via `db:push:test` (ADR-0025).

## Global product directives (preserved)

- **Otzar is voice-first, low-click, ambient, desktop/laptop edge-native, wearable-ready.** Ambient screen-edge confirmations / risks / approvals / blockers / next actions are the daily surface; the lens edge-of-vision is the future surface.
- **Sesame-style voice MUST map into the governed Action runtime.** Voice is the interface; COSMP / governance is the law; Otzar is the agentic enterprise brain; Actions are the body; the ambient edge is the daily surface. Voice MUST NEVER bypass policy, scoped permissions, audit, dual-control, or approvals.
- **Perplexity Computer / Comet is a competitive forcing function**, not a feature directive. Personal AI computer / browser automation / native-app automation / web tools / connectors / voice are becoming table stakes; Otzar's moat is governed enterprise autonomy, scoped memory, Action runtime + dual-control, role hierarchy, audit, team / hive intelligence, voice-first, ambient edge UX, enterprise-context native.
- **Perplexity may win "personal AI computer." Otzar must win "governed autonomous enterprise."**

## Docs architecture rule (mandatory)

5-tier hierarchy: tier 1 [`NEXT_ACTION.md`](NEXT_ACTION.md) → tier 2 this file → tier 3 [`current-build-state/XX-section.md`](current-build-state/) → tier 4 [`build-log/`](build-log/) → tier 5 [`architecture/decisions/`](architecture/decisions/).

Per `[FOUNDATION-VELOCITY-CORRECTION]`, docs refresh fires **once per completed wave**, not after every individual PR. Update **all** of:

1. [`docs/NEXT_ACTION.md`](NEXT_ACTION.md) — operational baton (≤ 150 lines).
2. The relevant `docs/current-build-state/XX-section.md` — detailed canonical record (don't starve of necessary detail).
3. This master file ONLY for: latest main HEAD, latest merged PR, 10-section status row changes, next-work-queue re-order, global do-not-claim list changes.
4. A tier-4 `docs/build-log/YYYY-MM-DD-pr-XX-slug.md` entry ONLY for **major** architectural landings (new substrate cluster, security/governance landing, schema change, cross-section integration, complex runtime behavior, RULE 21 paste). Routine routes skip this.

**Do not** bloat this master with per-PR file-by-file detail. That belongs in the section file or the build-log entry.

Master target size: ≤ 500 lines. Cap: 1,000 lines.

Lean docs ≠ less rigorous docs. Move detail to the correct layer; do not delete clarity. See [`current-build-state/README.md`](current-build-state/README.md) + [`build-log/README.md`](build-log/README.md) for the full refresh discipline.

## Founder authorization

This index + the per-section split landed per Founder QLOCK
`[FOUNDATION-CURRENT-BUILD-STATE-SPLIT-ARCHITECTURE-QLOCK]`
(2026-05-29). RULE / ADR modifications continue to require
explicit Founder authorization per RULE 20.
