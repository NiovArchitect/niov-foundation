# NIOV Foundation — Current Build State

**Status:** Tier 2 of the Foundation 5-tier docs hierarchy.
Lean master index by design. Tier 1 operational baton:
[`docs/NEXT_ACTION.md`](NEXT_ACTION.md). Tier 3 per-section
detail: [`docs/current-build-state/`](current-build-state/).
Tier 4 PR-specific build-log:
[`docs/build-log/`](build-log/). Tier 5 ADRs:
[`docs/architecture/decisions/`](architecture/decisions/).

**Last updated:** 2026-05-29
([ADR-0057-PROPOSE-PERMISSION-GRANT-HANDLER-EXECUTE-VERIFY-AUTH]
wave-close + repo-now-public security audit).

## Current state

- **Latest main HEAD:** `67df915d98f417dd2652016f4e350229c4ef1fb6`
- **Latest merged PR:** [#41](https://github.com/NiovArchitect/niov-foundation/pull/41) — Add ADR-0057 PROPOSE_PERMISSION_GRANT real handler capability (2026-05-29).
- **Active branch / PR:** wave-close docs refresh (this commit).
- **Active production section:** Section 2 — Autonomous Execution Core.
- **TypeScript baseline:** exactly 4 canonical residual errors per ADR-0015 Decision B Amendment 1.
- **Live `ACTION_*` audit emitters:** 10 of 10 (canonical ADR-0057 §10 vocabulary fully wired).
- **Real per-`ActionType` handlers:** **2 of 3** (RECORD_CAPSULE + PROPOSE_PERMISSION_GRANT live; SEND_INTERNAL_NOTIFICATION remains stub — no backing notification substrate).
- **Cancel surface:** non-RUNNING (any source caller) + RUNNING (caller with valid GOVSEC.5 break-glass grant; ADR-0050) + process-local AbortController plumbing for mid-attempt interruption.
- **Read surface:** create + cancel + GET viewer + GET list + GET attempt detail — Action Inbox / Detail / Attempt drilldown complete.
- **Repo posture:** PUBLIC. Branch protection on `main`: 4 required canonical CI checks + force-push blocked + admin-enforced + secret scanning + push protection + dependabot security updates enabled. `required_approving_review_count = 0` (solo-developer pragmatic).

## 10 production section status

| # | Section | Status | Detail |
|---|---|---|---|
| 1 | Employee Intelligence Core | Foundational substrate landed pre-Section-12; **Otzar Wave 2A/B/C all LIVE on main** (`3bb773d` / `1ffa01d` / `c56bd57`, 2026-05-27/28). Wave 3 drift detection remains forward-substrate (no ADR yet). | [`01-employee-intelligence-core.md`](current-build-state/01-employee-intelligence-core.md) |
| 2 | Autonomous Execution Core | **PARTIAL — production-grade.** Create + cancel (non-RUNNING + RUNNING-via-break-glass) + GET viewer + GET list + GET attempt detail LIVE; 10 of 10 `ACTION_*` emitters LIVE; **RECORD_CAPSULE + PROPOSE_PERMISSION_GRANT real handlers LIVE** (2 of 3); SEND_INTERNAL_NOTIFICATION remains stub (no backing substrate); AbortController plumbing LIVE (no active consumers yet). | [`02-autonomous-execution-core.md`](current-build-state/02-autonomous-execution-core.md) |
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
| [#41](https://github.com/NiovArchitect/niov-foundation/pull/41) | `67df915` | Add ADR-0057 PROPOSE_PERMISSION_GRANT real handler capability |
| [#40](https://github.com/NiovArchitect/niov-foundation/pull/40) | `66ff448` | Wave-close docs refresh for #39 |
| [#39](https://github.com/NiovArchitect/niov-foundation/pull/39) | `fe8c095` | Add ADR-0057 ActionAttempt detail route |
| [#38](https://github.com/NiovArchitect/niov-foundation/pull/38) | `58a476b` | Wave-close docs refresh for #37 |
| [#37](https://github.com/NiovArchitect/niov-foundation/pull/37) | `4e3805d` | Add ADR-0057 RUNNING-cancel break-glass capability |
| [#36](https://github.com/NiovArchitect/niov-foundation/pull/36) | `952d60c` | Wave-close docs refresh for #35 |
| [#35](https://github.com/NiovArchitect/niov-foundation/pull/35) | `4ef4ed4` | Add ADR-0057 RECORD_CAPSULE real handler capability |
| [#34](https://github.com/NiovArchitect/niov-foundation/pull/34) | `d001e13` | Split CURRENT_BUILD_STATE into section indexes |
| [#32](https://github.com/NiovArchitect/niov-foundation/pull/32) | `75933ad` | Add ADR-0057 GET actions list route |
| [#31](https://github.com/NiovArchitect/niov-foundation/pull/31) | `bcdacc7` | Docs refresh for #30 |

## Immediate next work queue

> **Section 1 Wave 2A + 2B + 2C all LIVE** per substrate audit during Wave 5 reconnaissance. Section 01 file was previously stale (RULE 13 drift). Queue re-prioritized:

1. **`[ADR-0057-ACTIONPOLICY-RETRY-BUDGET-AND-TIMEOUT-SCHEMA-QLOCK]`** — promote LOCK-GAP-1 + LOCK-GAP-2 from service-tier constants to schema fields (Prisma migration via `db:push:test` per ADR-0025; cross-language Ecto parity check per ADR-0033). Substrate-architectural; tier-4 build-log expected.
2. **Wave 3 drift detection ADR** — Founder-authorized ADR for Section 1 Wave 3 (recurring-correction → `IntelligencePattern` auto-write, stale-context warnings, drift-signal contract, proactive-suggestion contract). Required before any Wave 3 code lands. Doctrine boundary: surveillance / productivity-policing framing explicitly forbidden per ADR-0052.
3. **SEND_INTERNAL_NOTIFICATION substrate research arc** (RULE 21; would unlock the 3rd real ActionType handler).
4. **GOVSEC.5 follow-on `requireAdminCapability` throttle.**
5. **`GET /api/v1/org/actions` explicit route** (substrate-coherent; lowest priority among Section 2 routes).

## Critical Do-NOT-claim list (global truths)

- "Autonomous Execution is fully live." — runtime executes through **stub handlers only**; real per-`ActionType` business effects are forward-substrate.
- "AI Twins can fully execute actions on real systems." — they cannot until per-type handlers land.
- "Connectors / MCP are live." — deferred per ADR-0057 §17 + ADR-0058.
- "Cancel works for any RUNNING action unconditionally." — RUNNING cancellation requires an ACTIVE GOVSEC.5 break-glass grant (ADR-0050) for `action_type = "ACTION_RUNNING_CANCEL"`; non-privileged callers without a grant get 403. The grant is single-use (status: ACTIVE → USED on consumption).
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
