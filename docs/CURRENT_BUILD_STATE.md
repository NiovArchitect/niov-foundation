# NIOV Foundation — Current Build State

**Status:** Tier 2 of the Foundation 5-tier docs hierarchy.
Lean master index by design. Tier 1 operational baton:
[`docs/NEXT_ACTION.md`](NEXT_ACTION.md). Tier 3 per-section
detail: [`docs/current-build-state/`](current-build-state/).
Tier 4 PR-specific build-log:
[`docs/build-log/`](build-log/). Tier 5 ADRs:
[`docs/architecture/decisions/`](architecture/decisions/).

**Last updated:** 2026-05-30
(**Section 1 Wave 6A LANDED 2026-05-30** — PR #121 `6b84a99`
ships the symbiotic advisory surface on `GET /api/v1/otzar/
my-twin` (NEW `accepted_patterns[]` field projecting the
caller's OWN ACCEPTED OtzarProposedPattern rows as visible
alignment guidance). Symbiotic framing per Founder Wave 6A
clarification: the user teaches the Twin through review-and-
acceptance; the Twin reflects accepted patterns back as
visible alignment memory — NOT correction logging, NOT
employee coaching, NOT compliance reminders, NOT
surveillance. NO assembleContext touch (Wave 6B forward-
substrate). NO new audit literal. NO schema migration. 15
integration tests. Earlier last-updated context: **Section 6
Wave 7 LANDED 2026-05-30** — PR #119 `2b83116`
ships NEW `POST /api/v1/analytics/compliance-posture` +
`getCompliancePostureForOrg` AnalyticsService method + 20
integration tests per ADR-0061 §8 forward queue. Org-level
metadata-only compliance posture (NOT legal advice; NOT
certification; NOT employee compliance scoring); 5-label
closed-vocab (HEALTHY / WATCH / DEGRADED / NOT_CONFIGURED /
INSUFFICIENT_POPULATION); ADMIN_ACTION:ANALYTICS_READ audit
(ZERO new audit literal). 6 live aggregates total. Earlier
last-updated context: **Section 6 Wave 6 LANDED 2026-05-30**
— PR #117 `2c4336a` ships NEW
`POST /api/v1/analytics/action-runtime-by-action-type`
+ `getActionRuntimeByActionTypeForOrg` AnalyticsService method
+ 16 integration tests per ADR-0061 §8 forward queue. Per-
ActionType breakdown of action-runtime health; envelope-tier k=5
+ per-row ACTION_RUNTIME_MIN_VOLUME=10 redaction; ADMIN_ACTION:
ANALYTICS_READ audit (ZERO new audit literal). 5 live aggregates
total (v1 4 + Wave 6). Earlier last-updated context:
**Section 1 Wave 5 IMPLEMENTATION LANDED 2026-05-30** —
PR #114 `7661ba9` ships NEW `OtzarProposedPattern` Prisma model
+ 4 self-scoped review routes + `OtzarProposedPatternService` +
36 integration tests per ADR-0066 §3-§7. Auto-write =
AUTO-PROPOSE, NOT auto-commit; owner-first self-scope; ZERO new
audit literal (ADMIN_ACTION + 5-discriminator pattern); existing
org-scoped `IntelligencePattern` preserved unchanged per RULE 1
+ verified untouched across full test cycle; schema migration
via npm run db:push:test per ADR-0025. Earlier last-updated
context: **ADR-0066 LANDED design-only** —
`OtzarProposedPattern` review-gated proposal lifecycle for
recurring drift themes. Closes ADR-0058 §"Forward queue"
item 1 at the design register. NEW Prisma model proposed
(separate from existing org-scoped `IntelligencePattern`
which stays unchanged per RULE 1); 14 fields + 4 closed-vocab
discriminators + 4-route self-scoped review surface +
ADMIN_ACTION + 5-discriminator audit (no new audit literal).
All 12 v1 design questions resolved at ADR; implementation
slice forward-substrate behind separate Founder
authorization per RULE 20 + ADR-0066 §11. **Section 5 Wave
4 LANDED earlier 2026-05-30 — Agent Playground persistent
named scenarios** per ADR-0065 §7. PR #111 ships
`PlaygroundScenario` Prisma model + 5 owner-first CRUD routes
+ `PlaygroundScenarioService` + 38 integration tests. SAFE
persistence layer for future Waves 5-8; zero execution / LLM
/ multi-agent / external provider / Action creation / side
effects. ADMIN_ACTION + details.action discriminator audit;
no new audit literal; soft-archive per RULE 10. Schema
migration via npm run db:push:test per ADR-0025. Earlier
last-updated context preserved below for chronology. Plus
**Section 6 PRODUCTION-GRADE COMPLETE for Foundation backend
scope (v1).** 4-aggregate arc closure on top of ADR-0061
Wave 1 design: CORRECTION velocity 7d (PR #103) +
action-runtime success rate (PR #104) + connector activity
(PR #105) + hive participation (PR #106). All 4 aggregates
SAFE-projected; same-org sovereignty enforced by construction;
k=5 HIPAA Safe Harbor floor universal; can_admin_org gate
universal; ADMIN_ACTION + ANALYTICS_READ audit universal; no
new audit literal across any wave; zero schema migration;
zero new external dependencies; 55 integration tests across
4 test files. Foundation-strategic-context coherent (generic
Entity model + no blockchain/payment surface + no surveillance
framing). Plus Section 5 Waves 1+2+3 LIVE (inspector
foundation + product-vision ADR-0065). Section 3
PRODUCTION-GRADE COMPLETE for v1 same-org Foundation backend
scope.

Earlier last-updated context: Section 5 Wave 2 LANDED — Agent
Playground v1 implementation per ADR-0060 + Founder Wave 2
authorization.
**Important framing**: this is the **first backend substrate /
inspector foundation** for the long-term Agent Playground
product vision (enterprise simulation + multi-agent scenario
exploration + outcome comparison + best-path recommender +
governed transition from simulation to Action runtime;
DGI-style enterprise domain) — NOT the full product. 3
sandbox-only operator inspector routes shipped: policy-
evaluator tester via pure `evaluateActionPolicy`; connector
dry-run hard-wired to `FixtureBasedConnectorProvider`
(production providers unreachable by construction);
working-set inspector via `COE.assembleContext` with SAFE
projection stripping raw `content`. PlaygroundService class
+ 17 integration tests + barrel exports + server.ts wiring.
Zero side effects: no Action/ActionAttempt/Notification/
OtzarConversation/MemoryCapsule/ConnectorBinding row creation.
Zero new audit literals; zero schema migration; zero new
external dependencies. Wave 3 Control Tower frontend consumer
+ Wave 4+ multi-agent simulation engine + persistent scenario
memory + outcome comparison + best-path recommender + real-
provider dry-run all forward-substrate. ADR-0060 broadening
(or new product-vision ADR) recommended before Wave 3+. Plus
Section 3 PRODUCTION-GRADE COMPLETE for v1 same-org Foundation
backend scope from earlier today.).

## Current state

- **Latest main HEAD:** `6b84a99` (Section 1 Wave 6A symbiotic advisory surface; closeout docs PR pending)
- **Latest merged PR:** [#121](https://github.com/NiovArchitect/niov-foundation/pull/121) — Section 1 Wave 6A advisory surface (15 tests).
- **Active branch / PR:** `section-1-wave-6a-closeout-docs` (Wave 6A closeout docs; design-only).
- **Section 1 status:** PRODUCTION-GRADE COMPLETE for v1 Foundation drift-detection backend scope. Section 6 PRODUCTION-GRADE COMPLETE earlier 2026-05-30. Section 3 PRODUCTION-GRADE COMPLETE earlier 2026-05-30. **Section 5 PARTIAL with Waves 1+2+3+4 LIVE** (Wave 4 LANDED 2026-05-30).
- **TypeScript baseline:** exactly 4 canonical residual errors per ADR-0015 Decision B Amendment 1.
- **Live `ACTION_*` audit emitters:** 10 of 10 (canonical ADR-0057 §10 vocabulary fully wired).
- **Real per-`ActionType` handlers:** **3 of 3 LIVE** (RECORD_CAPSULE + PROPOSE_PERMISSION_GRANT + SEND_INTERNAL_NOTIFICATION per Wave 11 internal-only handler).
- **Cancel surface:** non-RUNNING (any source caller) + RUNNING (caller with valid GOVSEC.5 break-glass grant; ADR-0050) + process-local AbortController plumbing for mid-attempt interruption.
- **Read surface:** create + cancel + GET viewer + GET list + GET attempt detail — Action Inbox / Detail / Attempt drilldown complete.
- **Repo posture:** PUBLIC. Branch protection on `main`: 4 required canonical CI checks + force-push blocked + admin-enforced + secret scanning + push protection + dependabot security updates enabled. `required_approving_review_count = 0` (solo-developer pragmatic).

## 10 production section status

| # | Section | Status | Detail |
|---|---|---|---|
| 1 | Employee Intelligence Core | **PRODUCTION-GRADE COMPLETE for v1 Foundation drift-detection + Wave 5 review-gated proposed-pattern + Wave 6A symbiotic advisory surface 2026-05-30** — Wave 6A LANDED PR #121 `6b84a99` ships NEW symbiotic `accepted_patterns[]` projection on `GET /api/v1/otzar/my-twin` (caller's OWN ACCEPTED patterns as visible alignment guidance; SAFE projection enforced by AcceptedPatternAdvisoryView; v1 limit 5 / cap 25; reviewed_at DESC; symbiotic advisory_note template per pattern_label; NO assembleContext touch; NO new audit literal; NO schema migration; 15 integration tests). Wave 6B (priming hook into assembleContext) remains ADR/design forward-substrate per Founder operating direction. Earlier: — ADR-0066 + PR #114 (`7661ba9`) ship NEW `OtzarProposedPattern` Prisma model + 4 self-scoped review routes + `OtzarProposedPatternService` + recurrence-detection function + 36 integration tests. Auto-write = AUTO-PROPOSE, NOT auto-commit; owner-first self-scope; 3 closed-vocab source signal types (PER_CONVERSATION_DRIFT / WALLET_STALE_CONTEXT / CROSS_CONVERSATION_ROLLUP) + 3 pattern labels + 4-status lifecycle (PROPOSED / ACCEPTED / REJECTED / ARCHIVED); ADMIN_ACTION + 5-discriminator audit; ZERO new audit literal; existing org-scoped `IntelligencePattern` preserved unchanged per RULE 1 + verified untouched across full test cycle. Closes ADR-0058 §"Forward queue" item 1 at the implementation register. Otzar Wave 2A/B/C all LIVE (`3bb773d`/`1ffa01d`/`c56bd57`, 2026-05-27/28). Drift-detection arc complete: Wave 3 per-conversation drift signals (`779a286`/`e7b4a17`); **Wave 4A stale-context wallet signal** (PR #108); **Wave 4C cross-conversation rollup** (PR #109). 3 live drift-signal routes — all self-scoped + closed-vocab + locked coaching/boundary copy explicitly disclaiming surveillance framing; bearer + "read" only (never admin gate, never manager surface); `ADMIN_ACTION + DRIFT_SIGNAL_READ` audit with `source_signal` discriminator pattern (zero new audit literals); zero schema migration; 38 drift-arc integration tests. **Wave 4B (role-scope-conflict)** intentionally SKIPPED per RULE 13 — ADR-0058 §9 referenced POLICY_DRIFT error_class which is NOT emitted by any current handler; substrate-derivation impossible at v1. **Important scope wording**: closes the Foundation backend drift-detection substrate for v1 self-scoped coaching/alignment trust loop — NOT all future Employee Intelligence product work. Forward-substrate per ADR-0058 §"Forward queue": ~~IntelligencePattern auto-write~~ design landed at ADR-0066 2026-05-30 (implementation slice forward-substrate behind separate Founder authorization) + operator-tunable thresholds + drift digest connector fan-out + Control Tower drift UX + role-scope-conflict signal pending a POLICY_DRIFT producer. | [`01-employee-intelligence-core.md`](current-build-state/01-employee-intelligence-core.md) |
| 2 | Autonomous Execution Core | **PRODUCTION-GRADE COMPLETE for internal Foundation autonomous-execution-substrate scope** (Wave 12 closeout). Create + cancel (non-RUNNING + RUNNING-via-break-glass) + GET viewer + GET list + GET attempt detail + GET attempt list LIVE; 10 of 10 `ACTION_*` emitters LIVE; 3 of 3 real handlers LIVE; admin `/org/action-policies` LIVE with operator-tunable retry_budget + attempt_timeout_ms_override; forensic-visibility loop CLOSED end-to-end; 3 internal-only notification inbox routes LIVE per PR #58 (GET list + PUT read + PUT dismiss; SAFE projection; enumeration-safe 404). Internal-only = the Foundation autonomous-execution-substrate is complete; external tool integrations (Slack / email / SMS / push / Google Workspace / Microsoft / Linear / Jira / Salesforce / etc.) remain **required future production capabilities** under **Section 4 — MCP / Connectors** as governed adapters. Per-Notification audit literals / admin-cross-recipient list / cache / `NotificationPreference` opt-out intentional future-substrate. | [`02-autonomous-execution-core.md`](current-build-state/02-autonomous-execution-core.md) |
| 3 | Hives / Team Intelligence | **PRODUCTION-GRADE COMPLETE for v1 same-org Foundation backend scope** (final closeout 2026-05-30). 5-wave arc closure: Wave 1 ADR-0059 design (#85); Wave 2 service-tier safety enforcement (#88, +15 tests, 4 new failure codes); Wave 3 admin routes (#90/#91, 4 admin routes + SAFE projections + idempotent dissolve/force-remove + AI_AGENT admin-tier cleanup, +20 tests); Wave 4 governance_terms policy evaluator (#93/#94, 9 of 10 v1 terms wired; `require_admin_approval_for_invites` deferred; 6 new HiveFailure codes; ADR-0063 3-layer governance architecture; +20 tests); Wave 5 Hive Events producer spine (#96/#97, NEW `hive-events.ts` module + `HiveEventBus` + 5 closed-vocab events on same-org topics + SAFE payload projection + fire-and-forget; +13 tests). 8 live routes (4 public + 4 admin). 10 HiveService methods. 82 Section-3-specific test cases. Zero schema migrations + zero new audit literals across all 5 waves. RULE 0 same-org sovereignty enforced at 6 distinct points; no-leak protections enforced at 6 distinct surfaces (verified with secret-marker integration tests). **Important scope wording**: closes the **Foundation backend substrate for v1 same-org Hives** — NOT all future Hives/Team Intelligence product work. **Forward-substrate** (separate Founder authorization at each slice): Wave 4 Layer 2 enterprise governance policy registry + Wave 4 Layer 3 external governance source feeds + `require_admin_approval_for_invites` term + `HIVE_GOVERNANCE_ZERO_STATE` event + default `HiveEventBus` instantiation at server.ts + BEAM bridge / Phoenix.PubSub consumer half + Broadway guaranteed delivery + hive weighting algorithm + Twin-to-Twin proactive runtime + Otzar Twin subscription + Control Tower WebSocket bridge + Section 4 connector fan-out bridge + cross-org Hives + AI-generated executive summaries + `createTwin` standard-branch AI_AGENT carve-out resolution. | [`03-hives-team-intelligence.md`](current-build-state/03-hives-team-intelligence.md) |
| 4 | MCP / Connectors | **PRODUCTION-GRADE COMPLETE for Foundation backend scope — Waves 1+2+3+4+5+7 LIVE + Hardening Wave B LIVE.** Provider abstraction + `ConnectorBinding` model (secret_ref env-var NAME only) + 5 admin routes + `INVOKE_CONNECTOR` ActionType + `OutboundWebhookProvider` (HTTPS POST + HMAC-SHA-256) + `NotificationService` fan-out bridge (Wave 5 direct-mode default + Wave 7 Action-routed opt-in via `config.fan_out_mode`) + `verifyInboundHmac` reusable receive-side verifier. 5 admin `ADMIN_ACTION` discriminators + 3 fan-out discriminators (DISPATCHED + FAILED + ENQUEUED) — **zero new audit literals**. SDK-bound connectors + encrypted-at-rest secret column = forward-substrate behind their own future QLOCKs. | [`04-mcp-connectors.md`](current-build-state/04-mcp-connectors.md) |
| 5 | Agent Playground | **PARTIAL with Waves 1+2+3+4 LIVE (inspector foundation + product-vision ADR + persistent named scenarios).** Wave 1 ADR-0060 (#86) locks v1 inspector scope. Wave 2 (PR #100) ships 3 sandbox-only inspector routes (policy-evaluator / connector-dry-run / working-set) + PlaygroundService + 17 integration tests. Wave 3 ADR-0065 LANDED 2026-05-30 as NEW ADR sitting ABOVE ADR-0060 at the product-vision tier — canonicalizes the long-term DGI vision + 13-input set + 10-output set + human-in-the-loop doctrine + universal safety/no-leak doctrine + canonical 10-wave forward map. **Wave 4 LANDED 2026-05-30 (PR #111; `a2988ee`)** — NEW `PlaygroundScenario` Prisma model + 5 owner-first CRUD routes (`POST/GET /api/v1/playground/scenarios` + `GET/PUT/DELETE /api/v1/playground/scenarios/:id`) + `PlaygroundScenarioService` + 38 integration tests. SAFE persistence layer for the future Wave 5+ candidate-generation / outcome-comparison / best-path-recommender / governed-transition substrate. Owner-first self-scope per RULE 0; same-org enforcement when `org_entity_id` non-null; cross-owner/cross-org/unknown id all fold to `SCENARIO_NOT_FOUND` enumeration-safe 404; forbidden-field rejection on PUT; soft-archive per RULE 10 with idempotency. ADMIN_ACTION + details.action discriminator audit (CREATED/UPDATED/ARCHIVED); ZERO new audit literal; safe details only (no title/description text; no raw Json payloads). Schema migration via `npm run db:push:test` per ADR-0025. Wave 4 itself implements ZERO execution / LLM / multi-agent / external provider / Action creation / connector invocation / MemoryCapsule / OtzarConversation / live side effects — all Wave 5+ slices remain forward-substrate per ADR-0065 §7 with separate Founder authorization required at each. | [`05-agent-playground.md`](current-build-state/05-agent-playground.md) |
| 6 | Enterprise Analytics | **PRODUCTION-GRADE COMPLETE for Foundation backend scope (v1) + Wave 6 + Wave 7 extensions LIVE** (final v1 closeout 2026-05-30; Wave 6 LIVE 2026-05-30; Wave 7 LIVE 2026-05-30). 4-aggregate v1 arc + Wave 6 per-ActionType breakdown + Wave 7 compliance-posture on top of ADR-0061 Wave 1 design (#87): Wave 2 CORRECTION velocity 7d (#103); Wave 3 action-runtime success rate org-wide (#104); Wave 4 connector activity (#105); Wave 5 hive participation (#106); Wave 6 per-ActionType action-runtime health (PR #117; `2c4336a`); **Wave 7 org-level compliance-posture (PR #119; `2b83116`)** — metadata-only org-level posture surface (NOT legal advice; NOT certification; NOT employee compliance scoring); 5-label closed-vocab HEALTHY / WATCH / DEGRADED / NOT_CONFIGURED / INSUFFICIENT_POPULATION; reads EntityComplianceProfile + ComplianceFramework + recent COMPLIANCE_CHECK_PASSED/FAILED audit counts; deliberate exclusion of LawfulBasis + REGULATOR_ACCESS_* counts per substrate-honest finding (no org_entity_id column at v1); same auth + same-org + k=5 + ANALYTICS_READ (zero new audit literal); 20 integration tests. 6 live aggregates total (v1 4 + Wave 6 + Wave 7). All 4 aggregates SAFE-projected; same-org sovereignty enforced by construction; k=5 HIPAA Safe Harbor floor universal; `can_admin_org` gate universal; `ADMIN_ACTION + details.action="ANALYTICS_READ"` audit universal; no new audit literal across any wave; zero schema migration; zero new external dependencies; 55 integration tests. **Important scope wording**: closes the Foundation backend analytics substrate for v1 same-org admin reads — NOT all future analytics product work. **Forward-substrate**: additional aggregates + persistent projections + operator-tunable per-org threshold + cross-org analytics + differential privacy + AI-generated executive summaries + Control Tower UX + real-time/streaming + compliance-framework-specific aggregates (each its own slice + separate Founder authorization). Foundation-strategic-context coherent: generic Entity model preserved (AI_AGENT/DEVICE/APPLICATION/COMPANY aggregate identically), no blockchain/payment surface, no surveillance framing. | [`06-enterprise-analytics.md`](current-build-state/06-enterprise-analytics.md) |
| 7 | Full Audit Viewer | **PRODUCTION-GRADE COMPLETE for Foundation backend scope — Waves 1+2+3+4+5 LIVE + Hardening Wave A (CSV export) LIVE.** Canonical 4-scope matrix (self / org-admin / niov-admin / regulator) live across 3 read shapes (list / single-event / export); `verify-chain` self-only. Regulator access via ADR-0036 LawfulBasis 9-condition enforcement (Wave 5 PR #68). Export supports both `format=ndjson` (Wave 4) and `format=csv` (Hardening A PR #76; RFC 4180; CRLF terminators; `x-audit-format` header). All gates TAR-authoritative; filters AND-narrow; cross-basis isolation tested; SAFE projection; ADMIN_ACTION:AUDIT_VIEW_* (no new audit literal across any wave). Control Tower UX + cross-chain verify-chain = forward-substrate. **Proactive `REGULATOR_ACCESS_EXPIRED` emitter LIVE via Hardening Wave D (PR #79 / `dcff369`; 2026-05-29)** — `tickRegulatorAccessExpirySweep` on the Action scheduler cron host every 60s; idempotent + supersession-aware; `REGULATOR_ACCESS_EXPIRED` audit literal reserved at CAR Sub-box 3 sub-phase 5; 7 integration tests. (Substrate-honest doc-drift correction landed 2026-05-30: prior version of this row listed the emitter as forward-substrate.) | [`07-full-audit-viewer.md`](current-build-state/07-full-audit-viewer.md) |
| 8 | Billing / Entitlements | Monetization substrate partial (`PRICING_TABLE`, 70/30 split). Entitlements layer forward-substrate. | [`08-billing-entitlements.md`](current-build-state/08-billing-entitlements.md) |
| 9 | Admin / Governance Control Tower | **Backend contracts substantively complete for a Control Tower v1 frontend.** Live surfaces: Otzar Wave 2A/B/C (per Section 1 confirmation) + Action runtime (Section 2) + Audit viewer (Section 7 self/org/platform/regulator + NDJSON + CSV) + Connector admin (Section 4 — 5 routes + INVOKE_CONNECTOR + fan-out + inbound HMAC verifier) + break-glass + regulator window + escalations. AI-generated executive summary projections per ADR-0052 doctrine remain forward-substrate behind a Founder product decision. CT frontend lives in [`otzar-control-tower`](https://github.com/NiovArchitect/otzar-control-tower). | [`09-admin-governance-control-tower.md`](current-build-state/09-admin-governance-control-tower.md) |
| 10 | Deployment / Security / Go-Live | Track A closed; ADR-0011/0013/0015/0018/0019/0024/0025/0047 substrate LIVE; GOVSEC.5 (ADR-0050) Accepted; GOVSEC.2–4 + GOVSEC.6–10 forward-substrate. | [`10-deployment-security-go-live.md`](current-build-state/10-deployment-security-go-live.md) |

## Recent merges (last 10 implementation + docs PRs)

| PR | Commit | Description |
|---|---|---|
| [#121](https://github.com/NiovArchitect/niov-foundation/pull/121) | `6b84a99` | Add Section 1 Wave 6A — symbiotic accepted-pattern advisory surface on getMyTwin (15 tests) |
| [#120](https://github.com/NiovArchitect/niov-foundation/pull/120) | `c951764` | Close out Section 6 Wave 7 — compliance-posture docs |
| [#119](https://github.com/NiovArchitect/niov-foundation/pull/119) | `2b83116` | Add Section 6 Wave 7 — org-level compliance-posture aggregate (20 tests) |
| [#118](https://github.com/NiovArchitect/niov-foundation/pull/118) | `81eabd4` | Close out Section 6 Wave 6 — per-ActionType action-runtime health docs |
| [#117](https://github.com/NiovArchitect/niov-foundation/pull/117) | `2c4336a` | Add Section 6 Wave 6 — per-ActionType action-runtime health aggregate (16 tests) |
| [#116](https://github.com/NiovArchitect/niov-foundation/pull/116) | `e77bc82` | RULE 13 substrate-honest correction — Section 7 REGULATOR_ACCESS_EXPIRED emitter LIVE since Hardening Wave D |
| [#115](https://github.com/NiovArchitect/niov-foundation/pull/115) | `a1b7ca4` | Close out Section 1 Wave 5 — Otzar proposed-pattern docs |
| [#114](https://github.com/NiovArchitect/niov-foundation/pull/114) | `7661ba9` | Add Section 1 Wave 5 — Otzar proposed-pattern from recurring drift (36 tests) |
| [#113](https://github.com/NiovArchitect/niov-foundation/pull/113) | `ffa13a6` | Add Section 1 Wave 5 ADR-0066 — design-only |
| [#112](https://github.com/NiovArchitect/niov-foundation/pull/112) | `dbbe9c7` | Close out Section 5 Wave 4 — Agent Playground persistent named scenarios |
| [#111](https://github.com/NiovArchitect/niov-foundation/pull/111) | `a2988ee` | Add Section 5 Wave 4 — Agent Playground persistent named scenarios + safe CRUD |
| [#110](https://github.com/NiovArchitect/niov-foundation/pull/110) | `09f4144` | Close out Section 1 — Otzar drift detection production-grade complete (v1) |
| [#109](https://github.com/NiovArchitect/niov-foundation/pull/109) | `6bd0b70` | Add Section 1 Wave 4C — Otzar cross-conversation drift rollup |
| [#108](https://github.com/NiovArchitect/niov-foundation/pull/108) | `b6b4a16` | Add Section 1 Wave 4A — Otzar stale-context drift signal |
| [#107](https://github.com/NiovArchitect/niov-foundation/pull/107) | `2aa203a` | Close out Section 6 — Enterprise Analytics PRODUCTION-GRADE COMPLETE |
| [#106](https://github.com/NiovArchitect/niov-foundation/pull/106) | `a3d484c` | Add Section 6 Wave 5 — hive-participation aggregate |
| [#105](https://github.com/NiovArchitect/niov-foundation/pull/105) | `f629e23` | Add Section 6 Wave 4 — connector-activity aggregate |
| [#104](https://github.com/NiovArchitect/niov-foundation/pull/104) | `c8362cd` | Add Section 6 Wave 3 — action-runtime success rate aggregate |
| [#103](https://github.com/NiovArchitect/niov-foundation/pull/103) | `2d95597` | Add Section 6 Wave 2 — CORRECTION velocity 7d aggregate |
| [#102](https://github.com/NiovArchitect/niov-foundation/pull/102) | `40c3e80` | Add Section 5 Wave 3 — ADR-0065 Agent Playground long-term product-vision |
| [#101](https://github.com/NiovArchitect/niov-foundation/pull/101) | `9c34151` | Close out Section 5 Wave 2 — Agent Playground v1 docs |
| [#100](https://github.com/NiovArchitect/niov-foundation/pull/100) | `fd35c62` | Add Section 5 Wave 2 — Agent Playground v1 implementation |
| [#99](https://github.com/NiovArchitect/niov-foundation/pull/99) | `8807428` | Close out Section 3 — production-grade complete for v1 same-org Foundation backend scope |
| [#98](https://github.com/NiovArchitect/niov-foundation/pull/98) | `5c2308f` | Close out Section 3 Wave 5 — Hive Events producer docs |
| [#97](https://github.com/NiovArchitect/niov-foundation/pull/97) | `056c7c7` | Add Section 3 Wave 5 v1 — Hive Events producer substrate |
## Immediate next work queue

> **Section 5 Wave 4 LANDED** (PR #111 `a2988ee` 2026-05-30) — `PlaygroundScenario` persistence substrate. Section 6 + Section 1 + Section 3 + Section 4 + Section 7 each PRODUCTION-GRADE COMPLETE for their Foundation backend scope. Section 5 PARTIAL with Waves 1+2+3+4 LIVE; Wave 5 candidate-generation contract is the recommended next slice per ADR-0065 §7.

**Next-section preference order:**

1. ~~**Section 3 Hives / Team Intelligence**~~ — PRODUCTION-GRADE COMPLETE (closeout PR #99 2026-05-30).
2. ~~**Section 9 Admin / Governance backend contracts**~~ — substantively complete per Hardening Wave C.
3. ~~**Section 5 Agent Playground Waves 1-4**~~ — LIVE; Wave 5+ (candidate generation + outcome comparison + best-path recommender + governed transition to Action runtime + multi-agent orchestration + Control Tower frontend) requires separate Founder authorization at each slice per ADR-0065 §7.
4. ~~**Section 6 Enterprise Analytics**~~ — **PRODUCTION-GRADE COMPLETE for Foundation backend scope (v1)** (4-aggregate arc closure 2026-05-30; closeout PR #107).

**Forward-substrate within closed/partial sections:**

- **Section 1 advanced drift signals** (stale-context per ADR-0044/0045; role-scope-conflict per Section 2 ActionAttempt POLICY_DRIFT; cross-conversation Twin rollup; operator-tunable thresholds; drift digest connector fan-out via Section 4) — all forward-substrate per ADR-0058 §9; each is its own slice.
- **Section 8 Billing / Entitlements** — Founder-excluded scope (per session-start direction).
- **Section 10 GOVSEC.6–10** — each phase RULE 20-gated by ADR-0049 umbrella.

**Section 4 forward-substrate (RULE 20-gated; sequencing only):**

- SDK-bound connectors (Slack OAuth / Gmail / Microsoft Graph / Salesforce / Linear / Jira / SMS / Push) — each its own QLOCK + RULE 21 research arc; each requires OAuth token storage schema + key-management.
- Encrypted-at-rest secret column for per-tenant credentials (ADR-0019 cryptographic-suite extension).
- Action-runtime-integrated fan-out variant (current Wave 5 is fire-and-forget; the variant would couple Section 2 ↔ Action runtime for retry guarantees).
- Control Tower connector admin UX (frontend; out of Foundation scope).

**Section 7 forward-substrate (autonomous-clean if/when prioritized):**

- ~~Proactive `REGULATOR_ACCESS_EXPIRED` emitter via SCHEDULER sweep~~ — **LIVE** via Hardening Wave D (PR #79 / `dcff369`; 2026-05-29). Substrate-honest doc-drift correction landed 2026-05-30.
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
