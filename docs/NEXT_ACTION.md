# NEXT ACTION — Operational Baton

> Tier 1 of the Foundation 5-tier docs hierarchy. Read first in
> every new session. ≤ 150 lines by design.
> Tier 2 master index: [`CURRENT_BUILD_STATE.md`](CURRENT_BUILD_STATE.md).
> Tier 3 section detail: [`current-build-state/`](current-build-state/).
> Tier 4 build-log: [`build-log/`](build-log/).
> Tier 5 ADRs: [`architecture/decisions/`](architecture/decisions/).

## Where we are

- **Main HEAD:** `d1aabe4` (ADR-0070 Regulator-Ready Foundation Doctrine merged).
- **Latest merged PR:** [#130](https://github.com/NiovArchitect/niov-foundation/pull/130) — ADR-0070 Regulator-Ready Foundation Doctrine — Examination-Ready Evidence Flows (doctrine-only).
- **Active branch / PR:** `adr-0071-section-7-cross-scope-verify-chain-design` (ADR-0071 design-contract ADR; design-only; awaiting PR).
- **Section 1 status: PRODUCTION-GRADE COMPLETE for v1 drift-detection + Wave 5 review-gated proposed-pattern + Wave 6A + Wave 6B (active-pattern-consumption FULLY LIVE) 2026-05-31** — Wave 5 LANDED via ADR-0066 (PRs #113/#114/#115; `7661ba9` impl). **Wave 6A LANDED PR #121 `6b84a99`** (visibility half). **Wave 6B LANDED via ADR-0067 (PR #123) + impl PR #124 `625ddbf`** (influence half — sidecar field on AssembleContextSuccess + labeled L_ALIGNMENT prompt section in conductSession; reuses Wave 6A projection; ZERO score-boost; ZERO capsule pipeline mutation; ZERO new audit literal; ZERO schema migration; 14 integration tests). Symbiotic alignment loop closed at both visibility + influence registers.
- **Section 6 status:** PRODUCTION-GRADE COMPLETE for Foundation backend scope (v1) + Wave 6 + Wave 7 extensions LIVE — 6 live aggregates total (v1 4 + Wave 6 per-ActionType action-runtime health + Wave 7 org-level compliance-posture per ADR-0061 §8 forward queue; PRs #117 `2c4336a` + #119 `2b83116`); ZERO new audit literal across any Section 6 wave.
- **Section 5 status: PARTIAL with Waves 1+2+3+4 LIVE** — Wave 1 ADR-0060 + Wave 2 inspector (3 routes) + Wave 3 ADR-0065 product-vision + **Wave 4 LANDED 2026-05-30 (PR #111)** — `PlaygroundScenario` Prisma model + 5 owner-first CRUD routes + 38 integration tests; ADMIN_ACTION audit; zero new audit literal; SAFE persistence layer for future Wave 5+ scenario engine.
- **Section 3 status: PRODUCTION-GRADE COMPLETE for v1 same-org Foundation backend scope**.
- **Live `ACTION_*` emitters:** 10 of 10. **Real per-`ActionType` handlers:** 3 of 3 LIVE.
- **Cancel surface:** non-RUNNING (any caller) + RUNNING (caller with valid GOVSEC.5 break-glass grant; ADR-0050).
- **Operator-tunable runtime knobs:** `ActionPolicy.retry_budget` + `attempt_timeout_ms_override` LIVE; forensic-visibility loop CLOSED end-to-end.
- **TypeScript baseline:** exactly 4 canonical residual errors.
- **Repo visibility:** PUBLIC. Branch protection: 4 required canonical CI checks + force-push blocked + admin-enforced + secret scanning + push protection + dependabot updates enabled. Required-review count: 0 (solo-developer pragmatic).

## Exact next action

**Founder-clarified framing (re-asserted across all docs):** "Section 2 production-grade complete for internal Foundation autonomous-execution-substrate scope" means the **internal autonomous execution substrate** is complete, **not** that Otzar is an internal-only product. External tool integrations (Slack / email / SMS / push / Google Workspace / Microsoft / Linear / Jira / Salesforce / etc.) remain **required future production capabilities** and are tracked under **Section 4 — MCP / Connectors** as governed adapters. Section 2's internal-only scope is the safe foundation that those future external adapters must consume; it is not a substitute for them.

## ADR-0071 IN FLIGHT — Section 7 Cross-Scope Audit Verify-Chain Design (design-only)

Active branch `adr-0071-section-7-cross-scope-verify-chain-design`. Design-only — no code, no schema, no new routes, no new audit literal, no service-method signature change, no CI change. Closes ADR-0070 §Forward queue item 1 at the design register. Expands `GET /api/v1/audit/verify-chain` from self-only to the canonical Section 7 4-scope matrix (`self` / `org` / `platform` / `regulator`). Locks: 4-scope matrix + SAFE `VerifyChainView` projection (16 allowed fields + enumerated forbidden fields) + query/window controls (default 30d for org/platform; regulator window bounded by LawfulBasis valid range; `VERIFY_CHAIN_MAX_EVENTS = 10_000` perf cap) + verification semantics (per-chain self / multi-chain org+platform / lawful-basis-bound continuity for regulator that proves chain integrity without leaking invisible adjacent events) + reuse of existing `AUDIT_VIEW_VERIFY_CHAIN` literal with extended meta (ZERO new audit literal) + closed-vocab failure codes (UNAUTHORIZED / FORBIDDEN / INVALID_SCOPE / LAWFUL_BASIS_REQUIRED / NOT_FOUND / EXPIRED / REGULATOR_TARGET_MISMATCH / SCOPE_NOT_ALLOWED / WINDOW_TOO_LARGE / CHAIN_VERIFICATION_FAILED-as-200-with-verified-false / INSUFFICIENT_DATA-as-200-vacuous-success / INTERNAL_ERROR) + ADR-0070 §3.7/§3.10/§8/§9 interaction (chain-integrity primitive, NOT examination room / evidence package / disclosure workflow / regulator approval) + ADR-0069 §6 architecture check applied at §11 (v1 stays TypeScript; future continuous chain verification + streaming + multi-region fanout are §3 domain 7 BEAM-fit candidates).

## ADR-0070 LANDED — Regulator-Ready Foundation Doctrine (PR #130)

Doctrine ADR. 4th canonical doctrine alongside ADR-0027 governance / ADR-0048 personalization / ADR-0052 Otzar DGI / ADR-0069 BEAM substrate-coherence law. Canonicalizes examination-ready-by-default sentence + mandatory neutral compliance vocabulary + 12 core principles + 20 less-obvious blind spots + 10 proposed future substrate sections + section-by-section interactions + security/privilege boundaries + legal-advice boundary. ADR-0036 LawfulBasis + ADR-0049 GOVSEC + ADR-0050 break-glass + Section 7 Wave 5 regulator-view + Section 6 Wave 7 compliance-posture stay LIVE and ADR-0070 names them as existing canonical primitives the broader regulator-ready product surface composes against.

## ADR-0069 LANDED — Elixir/BEAM Substrate-Coherence Law (PR #129)

Doctrine ADR. Canonical sentence: *"Elixir should run the living processes. TypeScript should expose the product/API contract. Python should perform intelligence-heavy computation. Foundation governance should bind all of them."* Four-language division of labor + 7 BEAM strong-fit domains + mandatory 8-question architecture check for future ADRs touching long-running coordination.

## Otzar Wave 3 IMPLEMENTATION LANDED — Scoped Twin Proactivity (PR #127)

PR #127 `8474863` ships ADR-0068 v1 — pull-based, computed-on-read `proactive_cards?[]` sidecar on `MyTwinView` derived purely from existing self-scoped substrate. NEW `apps/api/src/services/otzar/proactivity.service.ts` with `assembleProactiveCards` pure helper + 5 closed-vocab card_types + locked closed-vocab templates + cap 4 + deterministic SHA-256 16-char `card_key`. 3 NEW additive pure helpers (`findOldestPendingProposedForOwner`, `computeStaleContextLabelForEntity`, `computeDriftRollupLabelForEntity`) extracted from Wave 5/4A/4C to preserve ADR-0068 §11 ZERO-new-audit posture (RULE 13 + RULE 18 correction surfaced inline; RULE 1 additive only). `GET /api/v1/otzar/my-twin?include_proactive_cards=false` opt-out. **ZERO** schema migration / new audit literal / `NotificationService` integration / Action creation / `conductSession` / `assembleContext` touch / LLM-generated text / manager visibility / external delivery. 18 integration tests + 90/90 Wave 5/6A/6B/4A/4C regression preserved. Closes ADR-0052 §9 proactivity-vs-autonomy + ADR-0053 §5 "proactive suggestions" forward-queue entries at the implementation register.

## Section 1 Waves 6A+6B LANDED — symbiotic active-pattern-consumption (PRs #121 + #124)

Wave 6A NEW `accepted_patterns[]` on `getMyTwin` (visibility half; ADR-0066). Wave 6B sidecar-field design lock NEW `alignment_patterns?` on `AssembleContextSuccess` + `include_alignment_patterns?` opt-out on `POST /api/v1/coe/context` + labeled `L_ALIGNMENT` prompt section in `conductSession` 8-layer assembly (influence half; ADR-0067). ZERO score-boost (ADR-0022 frozen anchor). ZERO capsule pipeline mutation. ZERO new audit literal. ZERO schema migration. 15+14 integration tests. Active-pattern-consumption FULLY LIVE at both visibility + influence registers.

## Section 6 Waves 6+7 LANDED — analytics aggregates (PRs #117 + #119)

Wave 6 per-ActionType action-runtime health + Wave 7 org-level compliance-posture; both metadata-only + k=5 floor + `ADMIN_ACTION:ANALYTICS_READ` audit + ZERO new audit literal + NOT legal advice / certification / employee scoring / manager surveillance. 6 live aggregates total.

## Recommended next production section

**Tier 1 cross-section alternatives (no Founder product decision required)**:

- **Section 7 cross-chain verify-chain** — extending self-only `verify-chain` to org-admin / platform / regulator scope. Carries perf + leakage review per Section 7 doc; would need a separate slice with its own QLOCK.
- **Section 6 additional aggregates** beyond Wave 7 — would require ADR-0061 amendment (persistent caching / operator-tunable k threshold). FORWARD-SUBSTRATE without explicit Founder authorization.

**Tier 3 — multi-decision; defer**:

- **Section 5 Wave 5 candidate generation** per ADR-0065 §7 — 4 outstanding Founder decisions.
- **Section 4 SDK-bound connectors** — each adapter own QLOCK + RULE 21 + OAuth credential decision.

## Founder Sleep Directive preferences — status

  1. ~~Section 3 Hives~~ — **CLOSED 2026-05-30 production-grade complete for v1 same-org Foundation backend scope.**
  2. ~~Section 5 Agent Playground Waves 2+3~~ — LANDED 2026-05-30 (#100/#101 inspector foundation + ADR-0065 long-term product-vision ADR).
  3. ~~Section 6 Enterprise Analytics~~ — **CLOSED 2026-05-30 production-grade complete for Foundation backend scope (v1)** (4-aggregate arc).
  4. ~~Section 1 Employee Intelligence Core~~ — **CLOSED 2026-05-30 production-grade complete for v1 Foundation drift-detection backend scope** (3-signal arc; Wave 4B SKIPPED per RULE 13).
  2. ~~Section 9 Admin/Governance~~ — substantively complete per Hardening Wave C; AI-generated exec summaries = Founder product decision per ADR-0052.
  3. ~~Section 5 Agent Playground~~ — ADR-0060 LANDED (#86); Wave 2 = Founder Authorization (4 checkpoints).
  4. ~~Section 6 Enterprise Analytics~~ — ADR-0061 LANDED; Wave 2 = Founder Authorization (5 checkpoints).

**Remaining work hits real stop conditions** (per Founder-listed criteria): Section 1 advanced drift signals + Section 3 Wave 4 Layer 2/3 + Section 3 Wave 5 consumer half + Section 3 Wave 6+ (Broadway + weighting + Twin-to-Twin) + Section 4 SDK-bound connectors + encrypted-at-rest secrets + Section 5/6 Wave 2 + Section 7 cross-chain verify-chain + Section 8 (Founder-excluded) + Section 10 GOVSEC.6–10 (RULE 20-gated per phase).

**Earlier waves + section detail:** [`current-build-state/`](current-build-state/) (Section 1 / Section 2 / Section 4 / Section 7 / Section 9 detail files).

## Current stop conditions

- CI fails.
- mergeStateStatus is not CLEAN / MERGEABLE.
- Working tree is dirty in unexpected ways.
- TypeScript baseline changes away from exactly 4 canonical residuals.
- no-leak guard fails.
- no-console anchor fails.
- A command requires secrets or production DB.
- A production migration is required.
- Generated client / schema drift appears unexpectedly.
- Implementation requires touching Control Tower / frontend / connectors / MCP / browser automation / native-app automation / voice / Sesame / desktop edge UX / wearable lens UX before the current QLOCK permits it.
- Online research reveals a material contradiction with approved ADRs / CURRENT_BUILD_STATE.md / implementation-proven repo state.
- The recommended path would require destructive data behavior.
- The recommended path would create obvious enterprise security / privacy risk.
- You cannot verify substrate even after targeted research.
- Founder explicitly asks you to pause.

**Not stop conditions:** normal section boundary; completed PR; completed docs refresh; discovered gap when research provides a clear safe recommendation.

## Key live / not-live truth

**LIVE (Section 1 Wave 3 — Otzar drift detection per ADR-0058; see [`current-build-state/01-employee-intelligence-core.md`](current-build-state/01-employee-intelligence-core.md)):**
- `GET /api/v1/otzar/conversations/:id/drift-signals` — pure derived read-only coaching/alignment trust loop.
- Closed-vocabulary v1 signal labels: `CORRECTION_VELOCITY_ELEVATED` (>3 corrections in conversation) + `RECURRING_CORRECTION_THEME` (2+ corrections share a non-generic topic tag; auto-tags excluded).
- Self-scoped (entity_id match); cross-caller → 403 NOT_CONVERSATION_OWNER; unknown id → 404 CONVERSATION_NOT_FOUND; bearer absent → 401.
- ADMIN_ACTION:DRIFT_SIGNAL_READ audit emission (no new audit literal).
- Topic tag VALUES never traverse the wire (the LABEL fires; tags stay in caller's wallet — strictest no-leak interpretation).
- Founder boundary preserved: NEVER manager visibility, NEVER employee scoring, NEVER psychological inference, NEVER punitive policy enforcement, NEVER raw conversation content.

**LIVE (Section 4 Waves 1+2+3+4+5+7 + Hardening B — connector substrate; see [`current-build-state/04-mcp-connectors.md`](current-build-state/04-mcp-connectors.md)):**
- `ConnectorBinding` Prisma model with `secret_ref` env-var-NAME pattern (never raw secret at rest); 5 admin routes on `/api/v1/org/connectors[/:id]` all `can_admin_org`-gated.
- `INVOKE_CONNECTOR` ActionType rides full Action runtime lifecycle (LOW risk_tier; 8 provider error_class → handler `CONNECTOR_<class>`).
- `OutboundWebhookProvider` real adapter (HTTPS POST + HMAC-SHA-256 signing; pure node stdlib).
- `NotificationService.connectorFanOut` opt-in hook fires per matching binding. Wave 5 direct mode (default) + Wave 7 action mode (opt-in via `config.fan_out_mode = "action"` — routes through Action runtime for full retry / cancellation / ACTION_* audit chain).
- `verifyInboundHmac` reusable receive-side verifier (Hardening Wave B; 8-reason closed enum; timing-safe; replay-window-bounded).
- Zero new audit literals across all waves — `ADMIN_ACTION` + `details.action` discriminator pattern preserved (DISPATCHED / FAILED / ENQUEUED + 5 admin discriminators).

**LIVE (Section 7 Waves 1+2+3+4+5 + Hardening A — unified audit viewer + NDJSON + CSV export; see [`current-build-state/07-full-audit-viewer.md`](current-build-state/07-full-audit-viewer.md)):**
- `GET /api/v1/audit/events[?scope=self|org|platform]` — paginated audit-event list. Scope gates TAR-authoritative. Filters AND-narrow; cap 100; SAFE projection.
- `GET /api/v1/audit/events/:id[?scope=self|org|platform]` — single-event drilldown with prev/next chain refs scoped to the same fence; enumeration-safe 404.
- `GET /api/v1/audit/events/export[?scope=self|org|platform&format=ndjson|csv&max_rows=...]` — bounded NDJSON or CSV export (Hardening A added CSV). Hard cap `EXPORT_AUDIT_EVENTS_MAX_ROWS=10000` + optional smaller `max_rows`; `application/x-ndjson` or `text/csv` content-type; `x-audit-row-count` / `x-audit-truncated` / `x-audit-scope` / `x-audit-format` headers.
- `GET /api/v1/audit/events/regulator-view?lawful_basis_id=...` — regulator-tier read via ADR-0036 LawfulBasis 9-condition enforcement; cross-basis isolation; 8 enforcement failure codes → 404 / 403 / 500.
- `GET /api/v1/audit/verify-chain` — caller's OWN audit chain. **Self-only across all 5 waves** per Founder direction.
- Read-audit emission: `ADMIN_ACTION` + `details.action` ∈ all 9 `AUDIT_VIEW_*` labels (no new audit literal across any wave).

**LIVE (Section 2 — see [`current-build-state/02-autonomous-execution-core.md`](current-build-state/02-autonomous-execution-core.md)):** 9 Action HTTP routes (POST + cancel + GET viewer/list/attempt-detail/attempt-list + GET/PUT `/api/v1/org/action-policies` dual-control gated) + 3 notification inbox routes (Wave 12 / PR #58); 3/3 real handlers LIVE (RECORD_CAPSULE + PROPOSE_PERMISSION_GRANT + SEND_INTERNAL_NOTIFICATION-internal-only); 10/10 `ACTION_*` audit emitters LIVE; executor + scheduler + expiry sweep + per-attempt AbortController; operator-tunable `ActionPolicy.retry_budget` + `attempt_timeout_ms_override` (Wave 6/7); forensic-visibility loop CLOSED end-to-end (Wave 8 PR #51).

**NOT LIVE (intentional future-substrate; do NOT auto-implement):**
External notification delivery (each adapter = own QLOCK + RULE 21 research arc) + `NotificationPreference` opt-out model + per-Notification audit literals + admin cross-recipient list + Notification detail-view + explicit `GET /api/v1/org/actions` + active AbortSignal consumption + per-action ActionPolicy cache + Control Tower UX / voice / ambient / lens UX. All RULE 20 / Founder-direction gated.

## Which section file to read next

→ [`current-build-state/03-hives-team-intelligence.md`](current-build-state/03-hives-team-intelligence.md) for Section 3 detail + ADR-0059 §7 Wave 3+ forward queue.
→ [`current-build-state/02-autonomous-execution-core.md`](current-build-state/02-autonomous-execution-core.md) for ADR-0057 PR #18→#32 lineage + Founder gap-locks + RULE 13 disclosures.
→ [`CURRENT_BUILD_STATE.md`](CURRENT_BUILD_STATE.md) — master 10-section status + global do-not-claim list.

## Discipline reminders

- **Wave-based delivery:** group related slices in one wave; docs refresh once per completed wave. **Pattern lock (PR cycle):** branch → narrow slice → tests + no-leak + no-console + typecheck baseline → commit → push → PR → CI green + CLEAN → merge → local main equals origin/main → next slice → at wave close: concise docs refresh.
- **RULE 21** research arc for substrate-architectural pastes. **RULE 16** no `console.*` in `apps/api/src`. **RULE 10** soft-delete only. **RULE 4** audit chain integrity (`writeAuditEvent` before response).

## Update rule (mandatory)

After every wave-close (not per individual PR for routine work):
1. Update this file's "Where we are" + "Exact next action" + "Recent merges" implications.
2. Keep this file ≤ 150 lines.
3. Update the relevant `current-build-state/XX-section.md` with detailed notes (don't starve of necessary detail).
4. Update `CURRENT_BUILD_STATE.md` only for: HEAD / latest-PR / status-row / queue-order / global-truth changes.
5. For a **major** architectural landing (new substrate cluster, security/governance landing, schema change, cross-section integration, complex runtime behavior, RULE 21 paste), also write a tier-4 `build-log/YYYY-MM-DD-pr-XX-slug.md` entry. Routine routes do NOT need build-log entries.
