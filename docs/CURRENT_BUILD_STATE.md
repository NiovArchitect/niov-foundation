# NIOV Foundation — Current Build State

**Status:** Tier 2 of the Foundation 5-tier docs hierarchy.
Lean master index by design. Tier 1 operational baton:
[`docs/NEXT_ACTION.md`](NEXT_ACTION.md). Tier 3 per-section
detail: [`docs/current-build-state/`](current-build-state/).
Tier 4 PR-specific build-log:
[`docs/build-log/`](build-log/). Tier 5 ADRs:
[`docs/architecture/decisions/`](architecture/decisions/).

**Last updated:** 2026-05-30
(Hardening Wave A/B/C LANDED across closed sections: Section 7
CSV export (PR #76); Section 4 inbound HMAC verification helper
(PR #77); Section 9 substrate-honest doc refresh (this commit
chain). Section 4 + Section 7 + Section 2 remain production-grade
complete for their scopes. Sections requiring new ADRs (Section 1
Wave 3 surveillance-vs-coaching boundary; Section 3 Hives;
GOVSEC phases) remain Founder-QLOCK-gated.).

## Current state

- **Latest main HEAD:** `3cda556` (Hardening Wave B; this commit chain adds Wave C docs)
- **Latest merged PR:** [#77](https://github.com/NiovArchitect/niov-foundation/pull/77) — Add Hardening Wave B — Section 4 inbound HMAC verification helper (2026-05-30).
- **Active branch / PR:** `hardening-wave-c-section-9-docs` (Section 9 substrate-honest doc refresh + master + baton refresh).
- **Active production section:** Hardening waves across closed sections (Section 7 CSV export + Section 4 inbound HMAC verifier + Section 9 doc-drift fix); next-section autonomous start is blocked by Founder-product-decision-required sections (Section 1 Wave 3 surveillance-vs-coaching boundary + Section 3 Hives ADR + GOVSEC phases). Awaiting Founder direction on next-section authorization OR additional forward-substrate work within closed sections.
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
| 4 | MCP / Connectors | **PRODUCTION-GRADE COMPLETE for Foundation backend scope — Waves 1+2+3+4+5 LIVE + Hardening Wave B (inbound HMAC verification helper) LIVE.** Provider abstraction + `ConnectorBinding` model (secret_ref env-var NAME only; never raw secret) + 5 admin routes on `/api/v1/org/connectors[/:id]` + `INVOKE_CONNECTOR` ActionType + `OutboundWebhookProvider` (HTTPS POST + HMAC-SHA-256 signing; pure node stdlib) + `NotificationService` fan-out bridge + `verifyInboundHmac` reusable receive-side verifier (8-reason closed enum; timing-safe; replay-window-bounded). 5 admin `ADMIN_ACTION` discriminators + 2 fan-out discriminators — **zero new audit literals**. SDK-bound connectors + encrypted-at-rest secret column + Action-runtime-integrated fan-out variant = forward-substrate behind their own future QLOCKs. | [`04-mcp-connectors.md`](current-build-state/04-mcp-connectors.md) |
| 5 | Agent Playground | Not started. Forward-substrate after Section 4. | [`05-agent-playground.md`](current-build-state/05-agent-playground.md) |
| 6 | Enterprise Analytics | Not started. Forward-substrate after Section 3. | [`06-enterprise-analytics.md`](current-build-state/06-enterprise-analytics.md) |
| 7 | Full Audit Viewer | **PRODUCTION-GRADE COMPLETE for Foundation backend scope — Waves 1+2+3+4+5 LIVE + Hardening Wave A (CSV export) LIVE.** Canonical 4-scope matrix (self / org-admin / niov-admin / regulator) live across 3 read shapes (list / single-event / export); `verify-chain` self-only. Regulator access via ADR-0036 LawfulBasis 9-condition enforcement (Wave 5 PR #68). Export supports both `format=ndjson` (Wave 4) and `format=csv` (Hardening A PR #76; RFC 4180; CRLF terminators; `x-audit-format` header). All gates TAR-authoritative; filters AND-narrow; cross-basis isolation tested; SAFE projection; ADMIN_ACTION:AUDIT_VIEW_* (no new audit literal across any wave). Control Tower UX + cross-chain verify-chain + proactive `REGULATOR_ACCESS_EXPIRED` emitter = forward-substrate. | [`07-full-audit-viewer.md`](current-build-state/07-full-audit-viewer.md) |
| 8 | Billing / Entitlements | Monetization substrate partial (`PRICING_TABLE`, 70/30 split). Entitlements layer forward-substrate. | [`08-billing-entitlements.md`](current-build-state/08-billing-entitlements.md) |
| 9 | Admin / Governance Control Tower | **Backend contracts substantively complete for a Control Tower v1 frontend.** Live surfaces: Otzar Wave 2A/B/C (per Section 1 confirmation) + Action runtime (Section 2) + Audit viewer (Section 7 self/org/platform/regulator + NDJSON + CSV) + Connector admin (Section 4 — 5 routes + INVOKE_CONNECTOR + fan-out + inbound HMAC verifier) + break-glass + regulator window + escalations. AI-generated executive summary projections per ADR-0052 doctrine remain forward-substrate behind a Founder product decision. CT frontend lives in [`otzar-control-tower`](https://github.com/NiovArchitect/otzar-control-tower). | [`09-admin-governance-control-tower.md`](current-build-state/09-admin-governance-control-tower.md) |
| 10 | Deployment / Security / Go-Live | Track A closed; ADR-0011/0013/0015/0018/0019/0024/0025/0047 substrate LIVE; GOVSEC.5 (ADR-0050) Accepted; GOVSEC.2–4 + GOVSEC.6–10 forward-substrate. | [`10-deployment-security-go-live.md`](current-build-state/10-deployment-security-go-live.md) |

## Recent merges (last 10 implementation + docs PRs)

| PR | Commit | Description |
|---|---|---|
| [#77](https://github.com/NiovArchitect/niov-foundation/pull/77) | `3cda556` | Add Hardening Wave B — Section 4 inbound HMAC verification helper |
| [#76](https://github.com/NiovArchitect/niov-foundation/pull/76) | `538bea8` | Add Hardening Wave A — Section 7 CSV export |
| [#75](https://github.com/NiovArchitect/niov-foundation/pull/75) | `188ddb2` | Close out Section 4 (Wave 6) — production-grade complete for Foundation backend scope |
| [#74](https://github.com/NiovArchitect/niov-foundation/pull/74) | `6258f17` | Add Section 4 Wave 5 NotificationService external fan-out bridge |
| [#73](https://github.com/NiovArchitect/niov-foundation/pull/73) | `c24dcc1` | Add Section 4 Wave 4 OutboundWebhookProvider — first real connector |
| [#72](https://github.com/NiovArchitect/niov-foundation/pull/72) | `4009b25` | Add Section 4 Wave 3 INVOKE_CONNECTOR ActionType + handler |
| [#71](https://github.com/NiovArchitect/niov-foundation/pull/71) | `40b5e2e` | Add Section 4 Wave 2 ConnectorBinding model + admin routes + audit |
| [#70](https://github.com/NiovArchitect/niov-foundation/pull/70) | `4142735` | Add Section 4 Wave 1 ConnectorProvider abstraction + registry |
| [#69](https://github.com/NiovArchitect/niov-foundation/pull/69) | `ddd954a` | Close out Section 7 (Wave 6) — production-grade complete for Foundation backend scope |
| [#68](https://github.com/NiovArchitect/niov-foundation/pull/68) | `9ec214e` | Add Section 7 Wave 5 regulator-tier audit access via ADR-0036 |
| [#67](https://github.com/NiovArchitect/niov-foundation/pull/67) | `0c065f4` | Wave-close docs refresh for #66 |
| [#66](https://github.com/NiovArchitect/niov-foundation/pull/66) | `f316a51` | Add Section 7 Wave 4 NDJSON audit export surface |

## Immediate next work queue

> **Hardening Wave A/B/C LANDED** across closed sections. Section 7 CSV export (PR #76) + Section 4 inbound HMAC verification helper (PR #77) + Section 9 substrate-honest doc refresh (this commit chain). **Section 4 + Section 7 + Section 2 + Section 9 backend contracts remain production-grade complete for their scopes.** Next-section autonomous start is blocked across multiple sections by real stop conditions surfaced at Phase 0 verification (see below).

**Section starts genuinely RULE-20-gated (Founder product decision required):**

1. **Section 1 Wave 3 — Otzar drift detection ADR** — substrate explicitly mandates Founder ADR before any Wave 3 code lands (surveillance-vs-coaching boundary is Founder product decision per ADR-0052 + Section 1 line 142–146).
2. **Section 3 Hives** — substrate explicitly requires "authorized research arc" + RULE 21 + likely new ADR before any implementation.
3. **Section 5 Agent Playground** — large new substrate; needs ADR.
4. **Section 6 Enterprise Analytics** — large new substrate; needs ADR.
5. **Section 8 Billing / Entitlements** — Founder-excluded scope.
6. **Section 10 GOVSEC.6–10** — each phase RULE 20-gated by ADR-0049 umbrella.

**Section 4 forward-substrate (RULE 20-gated; sequencing only):**

- SDK-bound connectors (Slack OAuth / Gmail / Microsoft Graph / Salesforce / Linear / Jira / SMS / Push) — each its own QLOCK + RULE 21 research arc; each requires OAuth token storage schema + key-management.
- Encrypted-at-rest secret column for per-tenant credentials (ADR-0019 cryptographic-suite extension).
- Action-runtime-integrated fan-out variant (current Wave 5 is fire-and-forget; the variant would couple Section 2 ↔ Action runtime for retry guarantees).
- Control Tower connector admin UX (frontend; out of Foundation scope).

**Section 7 forward-substrate (autonomous-clean if/when prioritized):**

- Proactive `REGULATOR_ACCESS_EXPIRED` emitter via SCHEDULER sweep at `valid_until` crossing per ADR-0036 Sub-decision 4 (existing ADR; pure implementation).
- Org-admin / platform / regulator `verify-chain` (cross-chain perf + leakage review; separate QLOCK).
- Control Tower audit-viewer UX (frontend; out of Foundation scope).

**Section 9 forward-substrate (Founder product decision required):**

- AI-generated executive summary projections per ADR-0052 doctrine (what-happened / why / needs-approval / risk / recommended-action) — needs Founder direction on which summaries + how scoped before implementation.

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
