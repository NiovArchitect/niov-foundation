# NIOV Foundation — Current Build State

**Status:** Tier 2 of the Foundation 5-tier docs hierarchy.
Lean master index by design. Tier 1 operational baton:
[`docs/NEXT_ACTION.md`](NEXT_ACTION.md). Tier 3 per-section
detail: [`docs/current-build-state/`](current-build-state/).
Tier 4 PR-specific build-log:
[`docs/build-log/`](build-log/). Tier 5 ADRs:
[`docs/architecture/decisions/`](architecture/decisions/).

**Last updated:** 2026-05-29
(Section 7 Wave 3 LANDED — niov-admin/platform scope on the
unified viewer. Section 2 remains production-grade complete
for the internal Foundation autonomous-execution-substrate
scope; external tool integrations remain required future
production work under Section 4 — MCP / Connectors per
Founder clarification.).

## Current state

- **Latest main HEAD:** `e914480e57a2a8d33ddae8d655965c7cdf055862`
- **Latest merged PR:** [#64](https://github.com/NiovArchitect/niov-foundation/pull/64) — Add Section 7 Wave 3 niov-admin/platform scope on unified audit viewer (2026-05-29).
- **Active branch / PR:** wave-close docs refresh (this commit).
- **Active production section:** Section 2 — Autonomous Execution Core.
- **TypeScript baseline:** exactly 4 canonical residual errors per ADR-0015 Decision B Amendment 1.
- **Live `ACTION_*` audit emitters:** 10 of 10 (canonical ADR-0057 §10 vocabulary fully wired).
- **Real per-`ActionType` handlers:** **3 of 3 LIVE** (RECORD_CAPSULE + PROPOSE_PERMISSION_GRANT + SEND_INTERNAL_NOTIFICATION per Wave 11 internal-only handler).
- **Cancel surface:** non-RUNNING (any source caller) + RUNNING (caller with valid GOVSEC.5 break-glass grant; ADR-0050) + process-local AbortController plumbing for mid-attempt interruption.
- **Read surface:** create + cancel + GET viewer + GET list + GET attempt detail — Action Inbox / Detail / Attempt drilldown complete.
- **Repo posture:** PUBLIC. Branch protection on `main`: 4 required canonical CI checks + force-push blocked + admin-enforced + secret scanning + push protection + dependabot security updates enabled. `required_approving_review_count = 0` (solo-developer pragmatic).

## 10 production section status

| # | Section | Status | Detail |
|---|---|---|---|
| 1 | Employee Intelligence Core | Foundational substrate landed pre-Section-12; **Otzar Wave 2A/B/C all LIVE on main** (`3bb773d` / `1ffa01d` / `c56bd57`, 2026-05-27/28). Wave 3 drift detection remains forward-substrate (no ADR yet). | [`01-employee-intelligence-core.md`](current-build-state/01-employee-intelligence-core.md) |
| 2 | Autonomous Execution Core | **PRODUCTION-GRADE COMPLETE for internal Foundation autonomous-execution-substrate scope** (Wave 12 closeout). Create + cancel (non-RUNNING + RUNNING-via-break-glass) + GET viewer + GET list + GET attempt detail + GET attempt list LIVE; 10 of 10 `ACTION_*` emitters LIVE; 3 of 3 real handlers LIVE; admin `/org/action-policies` LIVE with operator-tunable retry_budget + attempt_timeout_ms_override; forensic-visibility loop CLOSED end-to-end; 3 internal-only notification inbox routes LIVE per PR #58 (GET list + PUT read + PUT dismiss; SAFE projection; enumeration-safe 404). Internal-only = the Foundation autonomous-execution-substrate is complete; external tool integrations (Slack / email / SMS / push / Google Workspace / Microsoft / Linear / Jira / Salesforce / etc.) remain **required future production capabilities** under **Section 4 — MCP / Connectors** as governed adapters. Per-Notification audit literals / admin-cross-recipient list / cache / `NotificationPreference` opt-out intentional future-substrate. | [`02-autonomous-execution-core.md`](current-build-state/02-autonomous-execution-core.md) |
| 3 | Hives / Team Intelligence | Not started. Forward-substrate. | [`03-hives-team-intelligence.md`](current-build-state/03-hives-team-intelligence.md) |
| 4 | MCP / Connectors | Not started. Deferred per ADR-0057 §17 + ADR-0058. | [`04-mcp-connectors.md`](current-build-state/04-mcp-connectors.md) |
| 5 | Agent Playground | Not started. Forward-substrate after Section 4. | [`05-agent-playground.md`](current-build-state/05-agent-playground.md) |
| 6 | Enterprise Analytics | Not started. Forward-substrate after Section 3. | [`06-enterprise-analytics.md`](current-build-state/06-enterprise-analytics.md) |
| 7 | Full Audit Viewer | **PARTIAL — Waves 1+2+3 LIVE.** Primitives LIVE; unified self+org+platform viewer LIVE at `GET /api/v1/audit/events[?scope=...]` + `/:id[?scope=...]`; `GET /verify-chain` self-only. `scope=org`: TAR `can_admin_org` gate + OR-fence + cross-org leak guard. `scope=platform`: TAR `can_admin_niov` gate + unfenced cross-org visibility (mirrors `/platform/audit` + `/console/audit` at unified entry point). Filters AND-narrow under all 3 scopes; enumeration-safe 404 preserved. Read-audit emission via `ADMIN_ACTION:AUDIT_VIEW_*` (no new audit literal). Export + regulator-tier access + Control Tower UX + cross-chain verify-chain = forward-substrate (Waves 4-6 + forward-substrate). | [`07-full-audit-viewer.md`](current-build-state/07-full-audit-viewer.md) |
| 8 | Billing / Entitlements | Monetization substrate partial (`PRICING_TABLE`, 70/30 split). Entitlements layer forward-substrate. | [`08-billing-entitlements.md`](current-build-state/08-billing-entitlements.md) |
| 9 | Admin / Governance Control Tower | Backend contracts consumed by frontend partially LIVE; CT frontend lives in [`otzar-control-tower`](https://github.com/NiovArchitect/otzar-control-tower). | [`09-admin-governance-control-tower.md`](current-build-state/09-admin-governance-control-tower.md) |
| 10 | Deployment / Security / Go-Live | Track A closed; ADR-0011/0013/0015/0018/0019/0024/0025/0047 substrate LIVE; GOVSEC.5 (ADR-0050) Accepted; GOVSEC.2–4 + GOVSEC.6–10 forward-substrate. | [`10-deployment-security-go-live.md`](current-build-state/10-deployment-security-go-live.md) |

## Recent merges (last 10 implementation + docs PRs)

| PR | Commit | Description |
|---|---|---|
| [#64](https://github.com/NiovArchitect/niov-foundation/pull/64) | `e914480` | Add Section 7 Wave 3 niov-admin/platform scope on unified audit viewer |
| [#63](https://github.com/NiovArchitect/niov-foundation/pull/63) | `78fcdb9` | Wave-close docs refresh for #62 |
| [#62](https://github.com/NiovArchitect/niov-foundation/pull/62) | `026300f` | Add Section 7 Wave 2 org-admin scope on /api/v1/audit/events + /:id |
| [#61](https://github.com/NiovArchitect/niov-foundation/pull/61) | `43dd2fe` | Wave-close docs refresh for #60 + Founder-clarified scope re-framing |
| [#60](https://github.com/NiovArchitect/niov-foundation/pull/60) | `10155b9` | Add Section 7 Wave 1 unified self-scope audit-events viewer |
| [#59](https://github.com/NiovArchitect/niov-foundation/pull/59) | `58f6ddc` | Wave-close docs refresh for #58 + Section 2 closeout |
| [#58](https://github.com/NiovArchitect/niov-foundation/pull/58) | `2acd5c7` | Add ADR-0057 notification inbox routes (Wave 12 internal-only read surface) |
| [#57](https://github.com/NiovArchitect/niov-foundation/pull/57) | `e9611c3` | Wave-close docs refresh for #56 |
| [#56](https://github.com/NiovArchitect/niov-foundation/pull/56) | `e2ebfe8` | Add ADR-0057 SEND_INTERNAL_NOTIFICATION internal-only real handler |
| [#55](https://github.com/NiovArchitect/niov-foundation/pull/55) | `870cb70` | Wave-close docs refresh for #54 |

## Immediate next work queue

> **Section 7 Waves 1+2+3 LANDED** at PRs #60 + #62 + #64 (unified viewer with self + org-admin + niov-admin/platform scope + chain verification). **Active focus: Section 7.** Continuing through Waves 4-6 per Founder autonomous authorization.

**Section 7 next slices:**

1. **Section 7 Wave 4 — export surface** (NDJSON first for safe streaming; rate-limited; chunked; reuses unified scope=self|org|platform gate).
2. **Section 7 Wave 5 — regulator-tier audit access** via ADR-0036 REGULATOR + LawfulBasis attestation.
3. **Section 7 Wave 6 — Section 7 closeout** docs + production-grade-complete recommendation.
4. **Section 7 forward-substrate — Control Tower audit-viewer UX** (frontend; lives in `otzar-control-tower`; out of Foundation scope).
5. **Section 7 forward-substrate — org-admin / platform verify-chain** (cross-chain verification = leakage / perf risk; separate QLOCK).

**Other sections waiting on Founder direction:**

- **Section 4 — MCP / Connectors** — canonical home for external tool integrations. Each adapter wave = its own Founder QLOCK + RULE 21 research arc.
- **Section 1 Wave 3 drift detection ADR** — RULE 20-gated.
- **GOVSEC.5 follow-on `requireAdminCapability` throttle** — RULE 20-gated.
- **Section 9 — Admin / Governance Control Tower backend contracts** — partially LIVE.

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

5-tier hierarchy: tier 1 [`NEXT_ACTION.md`](NEXT_ACTION.md) → tier 2 this file → tier 3 [`current-build-state/XX-section.md`](current-build-state/) → tier 4 [`build-log/`](build-log/) → tier 5 [`architecture/decisions/`](architecture/decisions/). Companion: [`research/`](research/) holds RULE 21 pre-authorization research arcs for future substrate-architectural pastes — research is not modification, so AI assistants land arcs autonomously; the substantive implementation wave that consumes an arc requires Founder QLOCK per RULE 20.

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
