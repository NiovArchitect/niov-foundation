# NEXT ACTION — Operational Baton

> Tier 1 of the Foundation 5-tier docs hierarchy. Read first in
> every new session. ≤ 150 lines by design.
> Tier 2 master index: [`CURRENT_BUILD_STATE.md`](CURRENT_BUILD_STATE.md).
> Tier 3 section detail: [`current-build-state/`](current-build-state/).
> Tier 4 build-log: [`build-log/`](build-log/).
> Tier 5 ADRs: [`architecture/decisions/`](architecture/decisions/).

## Where we are

- **Main HEAD:** `6ea2bee` (Section 1 Wave 6B closeout docs merged).
- **Latest merged PR:** [#125](https://github.com/NiovArchitect/niov-foundation/pull/125) — Section 1 Wave 6B closeout docs.
- **Active branch / PR:** `section-1-wave-3-twin-proactivity-adr` (Otzar Wave 3 Twin Proactivity ADR-0068; design-only; awaiting PR).
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

## Otzar Wave 3 DESIGN LANDED — Scoped Twin Proactivity (ADR-0068)

Design-only — **no code, no schema, no new audit literal, no new route, no service-method signature change in this commit**. Locks v1 as a pull-based computed-on-read `proactive_cards?[]` sidecar on `getMyTwin` derived purely from existing self-scoped substrate (Wave 5 readers + Wave 4A/4C drift signals + `reviewed_at` periodic check-in). 5 closed-vocab card_types at v1 (`ACCEPTED_PATTERN_REMINDER` + `PROPOSED_PATTERN_REVIEW_AVAILABLE` + `STALE_CONTEXT_REFRESH_SUGGESTED` + `DRIFT_REVIEW_SUGGESTED` + `ALIGNMENT_CHECK_IN`); cap 4 cards per response; `include_proactive_cards: false` opt-out (mirrors Wave 6B precedent); deterministic `card_key` for client-side dismiss; ZERO `NotificationService` integration at v1 (Twin-as-source semantic forward-substrate); ZERO `conductSession` preamble; ZERO external delivery; ZERO autonomous execution; ZERO Action creation; ZERO Control Tower frontend; ZERO LLM-generated text; ZERO manager visibility. Closes ADR-0052 §9 proactivity-vs-autonomy + ADR-0053 §5 "proactive suggestions" forward-queue entries at the design register. **Implementation slice forward-substrate behind separate Founder authorization** per ADR-0068 §"Founder authorization".

## Section 1 Wave 6B LANDED — symbiotic priming hook into assembleContext (PR #124)

ADR-0067 (PR #123) + impl PR #124 `625ddbf`. Sidecar-field design lock (Option d). NEW `alignment_patterns?` on `AssembleContextSuccess` (reuses Wave 6A `AcceptedPatternAdvisoryView` verbatim). NEW `include_alignment_patterns?: boolean` body field on `POST /api/v1/coe/context` (default true; explicit owner opt-out). NEW labeled `L_ALIGNMENT` prompt section in `conductSession` 8-layer assembly between priming and L1 — `[OWNER'S ACCEPTED ALIGNMENT PATTERNS — visible advisory context the owner has reviewed and accepted as alignment guidance. These are owner-controlled hints, not memory rewrites; the owner remains sovereign...]` followed by bulleted SAFE rows. ZERO score-boost (ADR-0022 frozen anchor). ZERO capsule pipeline mutation (counters identical with/without sidecar). ZERO new audit literal. ZERO schema migration. 14 integration tests. **Active-pattern-consumption is now FULLY LIVE** at both visibility (Wave 6A) and influence (Wave 6B) registers.

## Section 1 Wave 6A LANDED — symbiotic accepted-pattern advisory surface (PR #121)

NEW `accepted_patterns[]` field on `GET /api/v1/otzar/my-twin` projecting the caller's OWN ACCEPTED `OtzarProposedPattern` rows as visible alignment guidance. **Symbiotic framing**: the user teaches the Twin through review-and-acceptance; the Twin reflects accepted patterns back as visible alignment memory — NOT correction logging, NOT coaching, NOT compliance, NOT surveillance. SAFE projection enforced by `AcceptedPatternAdvisoryView` (7-field strict subset); v1 limit 5 / cap 25; reviewed_at DESC; PROPOSED/REJECTED/ARCHIVED excluded; cross-owner isolation verified. NO assembleContext touch (Wave 6B forward-substrate); NO new audit literal; NO schema migration; 15 integration tests.

## Section 6 Wave 7 LANDED — org-level compliance-posture aggregate (PR #119)

NEW `POST /api/v1/analytics/compliance-posture` + `getCompliancePostureForOrg` service method + 20 integration tests per ADR-0061 §8 forward queue. Org-level **metadata-only compliance posture surface** — **NOT legal advice; NOT certification; NOT employee compliance scoring; NOT manager surveillance.** 5-label closed-vocab: HEALTHY (all subscribed frameworks active + no recent failures) / WATCH (inactive or unknown framework subscribed) / DEGRADED (recent COMPLIANCE_CHECK_FAILED in window) / NOT_CONFIGURED (no profile or empty frameworks[]) / INSUFFICIENT_POPULATION (k=5 fail). Same `can_admin_org` + same-org + k=5 + ADMIN_ACTION:ANALYTICS_READ audit contract as Waves 2-6. **ZERO new audit literal.** Substrate-honest deferral of LawfulBasis + REGULATOR_ACCESS_* counts pending safe org-attribution. **6 live aggregates total**.

## Section 6 Wave 6 LANDED — per-ActionType action-runtime health (PR #117)

NEW `POST /api/v1/analytics/action-runtime-by-action-type` + 16 integration tests. Extends Wave 3 with per-ActionType breakdown. Envelope `OK_BY_ROW | INSUFFICIENT_POPULATION` + per-row `HEALTHY | DEGRADED | UNHEALTHY | INSUFFICIENT_VOLUME`. **NOT employee scoring; NOT manager surveillance.** Section file: [`current-build-state/06-enterprise-analytics.md`](current-build-state/06-enterprise-analytics.md).

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

**LIVE (Section 2 — full surface; see [`current-build-state/02-autonomous-execution-core.md`](current-build-state/02-autonomous-execution-core.md) for detail):**
- 9 HTTP routes: `POST /api/v1/actions` + cancel (non-RUNNING + RUNNING-via-break-glass) + GET viewer + GET list + GET attempt-detail + GET attempt-list + GET/PUT `/api/v1/org/action-policies` (dual-control gated; PR #49 accepts the override fields).
- 3 notification inbox routes (Wave 12 / PR #58): `GET /api/v1/notifications` + `PUT /:id/read` + `PUT /:id/dismiss` — self-scope only; SAFE projection (no `body_redacted`); enumeration-safe 404.
- 3 of 3 real per-`ActionType` handlers LIVE: RECORD_CAPSULE (PR #35) + PROPOSE_PERMISSION_GRANT (PR #41) + SEND_INTERNAL_NOTIFICATION-internal-only (PR #56 — `Notification` model + `NotificationService` + RULE 0 cross-org DENY).
- 10 of 10 `ACTION_*` audit emitters LIVE.
- Executor + scheduler + expiry sweep runtime + per-attempt AbortController plumbing.
- Operator-tunable `ActionPolicy.retry_budget` + `attempt_timeout_ms_override` (Wave 6/7 PR #47/49); resolved `timeout_ms` persists onto `ActionAttempt` + projects onto attempt-detail (Wave 8 PR #51); forensic-visibility loop CLOSED end-to-end.

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
