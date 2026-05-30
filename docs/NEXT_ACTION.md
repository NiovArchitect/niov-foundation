# NEXT ACTION — Operational Baton

> Tier 1 of the Foundation 5-tier docs hierarchy. Read first in
> every new session. ≤ 150 lines by design.
> Tier 2 master index: [`CURRENT_BUILD_STATE.md`](CURRENT_BUILD_STATE.md).
> Tier 3 section detail: [`current-build-state/`](current-build-state/).
> Tier 4 build-log: [`build-log/`](build-log/).
> Tier 5 ADRs: [`architecture/decisions/`](architecture/decisions/).

## Where we are

- **Main HEAD:** `065e4f1` (Section 3 Wave 4 v1 — governance_terms policy evaluator)
- **Latest merged PR:** [#94](https://github.com/NiovArchitect/niov-foundation/pull/94) — Add Section 3 Wave 4 v1 — governance_terms policy evaluator.
- **Active branch / PR:** `section-3-wave-4-docs-closeout` (Wave 4 docs cascade; design-only).
- **Active production section:** Section 3 Wave 4 docs closeout. ADR-0063 design + Layer 1 implementation both LIVE; Section 3 is now PARTIAL with Waves 1+2+3+4 LIVE. ADR-0059 §Forward queue Wave 4 substantively CLOSED (Layer 1 implemented; Layers 2/3 forward-substrate per ADR-0063). Waves 5-8+ remain forward-substrate behind separate Founder authorization.
- **Live `ACTION_*` emitters:** 10 of 10.
- **Real per-`ActionType` handlers:** **3 of 3 LIVE** (RECORD_CAPSULE + PROPOSE_PERMISSION_GRANT + SEND_INTERNAL_NOTIFICATION). Wave 11 closed the "2 of 3" gap with Founder-direction-locked internal-only delivery; external providers remain forward-substrate as optional adapters.
- **Cancel surface:** non-RUNNING (any caller) + RUNNING (caller with valid GOVSEC.5 break-glass grant; ADR-0050).
- **Read surface:** create, cancel, GET viewer, GET list, GET attempt detail — full Action Inbox + Detail + Attempt drilldown.
- **Operator-tunable runtime knobs:** `ActionPolicy.retry_budget` + `ActionPolicy.attempt_timeout_ms_override` LIVE per PR #47; the `PUT /api/v1/org/action-policies` admin write-path accepts both fields per PR #49 (dual-control gated; null clears; positive int sets; 0/negative/float/string rejected 422; audit captures `_set` boolean flags, never the numeric values). Resolved per-attempt timeout persists onto `ActionAttempt.timeout_ms` for forensic visibility, projected on `GET /api/v1/org/action-policies` (list) + `GET /api/v1/actions/:id/attempts/:attempt_id` (attempt detail, per PR #51) — forensic-visibility loop CLOSED end-to-end.
- **TypeScript baseline:** exactly 4 canonical residual errors.
- **Repo visibility:** PUBLIC. Branch protection: 4 required canonical CI checks + force-push blocked + admin-enforced + secret scanning + push protection + dependabot updates enabled. Required-review count: 0 (solo-developer pragmatic; see PR #41 merge notes).

## Exact next action

**Founder-clarified framing (re-asserted across all docs):** "Section 2 production-grade complete for internal Foundation autonomous-execution-substrate scope" means the **internal autonomous execution substrate** is complete, **not** that Otzar is an internal-only product. External tool integrations (Slack / email / SMS / push / Google Workspace / Microsoft / Linear / Jira / Salesforce / etc.) remain **required future production capabilities** and are tracked under **Section 4 — MCP / Connectors** as governed adapters. Section 2's internal-only scope is the safe foundation that those future external adapters must consume; it is not a substitute for them.

## Section 3 Wave 4 LANDED (governance_terms policy evaluator; PRs #93 + #94)

ADR-0063 design (PR #93) + Layer 1 v1 implementation (PR #94) landed per Founder Wave 4 authorization. NEW pure-function evaluator at `apps/api/src/services/hive/governance-terms-evaluator.ts`; 9 of 10 v1 evaluable terms wired (`require_admin_approval_for_invites` DEFERRED — no admin invite path exists yet; would hard-freeze inviteToHive).

Wired terms at 3 HiveService call sites: `allowed_hive_types` (createHive) / `allowed_member_entity_types` + `allow_ai_agent_membership` (advisory) + `max_member_count` (inviteToHive) / `allowed_capsule_types_accessible` + `allowed_capsule_types_contributed` (both sites) / `dissolve_requires_admin` (no-op at v1) / `aggregate_min_member_count` (getHiveIntelligence zero-state via HIVE_INTELLIGENCE_READ + `details.zero_state_reason: "BELOW_AGGREGATE_MIN_MEMBER_COUNT"`) / `policy_source_ref` (metadata-only). Wave 2 `HIVE_TYPE_V1_ALLOWLIST` + AI_AGENT exclusion run FIRST at their respective sites.

6 new HiveFailure violation codes (5 → 403 fail-closed with safe messages; `GOVERNANCE_TERMS_MALFORMED` → 422). Lenient per-key parser: unrecognized keys IGNORED; per-key type-mismatch IGNORED; MALFORMED only when top-level value is not a JSON object. No-leak invariants verified via secret-marker integration tests (governance_terms object NEVER serialized to error messages or audit details).

3-layer governance architecture canonical at ADR-0063 substrate-architectural register:
- **Layer 1** (Local Hive `governance_terms`) — v1 implementable; this PR pair.
- **Layer 2** (Enterprise governance policy registry) — forward-substrate; future `OrgGovernancePolicy` model analogous to existing `ComplianceFramework`.
- **Layer 3** (External governance source feeds) — forward-substrate; future `GovernanceSource` + version + review-item models mirroring ADR-0036 LawfulBasis pattern; **monthly/quarterly default review cadence** (Founder lock); 7-step source-update lifecycle (review item → admin/legal approval → policy version → enforcement); no silent automatic enforcement changes.

Zero new audit literals. Zero schema migration. +20 Wave 4 integration tests; Wave 2/3 regressions preserved. TypeScript baseline 4 canonical residuals preserved.

Earlier waves on main: Section 3 Waves 1+2+3 (#85/#88/#89/#90/#91/#92) + Section 6 Wave 1 ADR-0061 + Section 5 Wave 1 ADR-0060 (#86) + Section 1 Wave 3 (#82/83/84) + Section 4 Wave 7 (#80) + Hardening A/B/C/D. Full lineage in [`CURRENT_BUILD_STATE.md`](CURRENT_BUILD_STATE.md).

## Founder Sleep Directive preferences — status

  1. ~~Section 3 Hives~~ — Waves 1+2+3+4 LANDED (#85, #88, #90/#91, #93/#94). Wave 4 Layer 2/3 substrate forward-substrate per ADR-0063; `require_admin_approval_for_invites` deferred until admin invite path exists.
  2. ~~Section 9 Admin/Governance~~ — substantively complete per Hardening Wave C; AI-generated exec summaries = Founder product decision per ADR-0052.
  3. ~~Section 5 Agent Playground~~ — ADR-0060 LANDED (#86); Wave 2 = Founder Authorization (4 checkpoints).
  4. ~~Section 6 Enterprise Analytics~~ — ADR-0061 LANDED; Wave 2 = Founder Authorization (5 checkpoints).

**Remaining work hits real stop conditions** (per Founder-listed criteria): Section 1 advanced drift signals + Section 3 Wave 4 Layer 2/3 (enterprise registry + external source feeds) + Section 3 Wave 5+ (PubSub + Broadway + weighting + Twin-to-Twin) + Section 4 SDK-bound connectors + encrypted-at-rest secrets + Section 5/6 Wave 2 + Section 7 cross-chain verify-chain + Section 8 (Founder-excluded) + Section 10 GOVSEC.6–10 (RULE 20-gated per phase).

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
- External notification delivery (email / SMS / Slack / push) — Founder-direction-locked at internal-only; each adapter = own QLOCK + RULE 21 research arc.
- Receiver-owned opt-out (`NotificationPreference` model) — RULE 20-gated.
- Per-Notification audit literals (`NOTIFICATION_DISPATCHED` / `_DELIVERY_FAILED` / `_OPT_OUT_RESPECTED`) — RULE 20-gated.
- Admin / cross-recipient notification list path — needs QLOCK + opt-out integration review.
- Notification detail-view route (would surface `body_redacted`) — needs separate no-leak review.
- Explicit `GET /api/v1/org/actions` route (served via `?org_scope=true` on unified list; marginal value).
- Active AbortSignal consumption by handlers (plumbed but unused).
- Per-action `ActionPolicy` lookup cache ("measure first" per ADR-0016).
- Connectors / MCP / Control Tower UX / voice / ambient / lens UX.

## Which section file to read next

→ [`current-build-state/03-hives-team-intelligence.md`](current-build-state/03-hives-team-intelligence.md) for Section 3 detail + ADR-0059 §7 Wave 3+ forward queue.
→ [`current-build-state/02-autonomous-execution-core.md`](current-build-state/02-autonomous-execution-core.md) for ADR-0057 PR #18→#32 lineage + Founder gap-locks + RULE 13 disclosures.
→ [`CURRENT_BUILD_STATE.md`](CURRENT_BUILD_STATE.md) — master 10-section status + global do-not-claim list.

## Discipline reminders

- **Wave-based delivery (per `[FOUNDATION-VELOCITY-CORRECTION]`):** group related slices in the same production section into one wave. Implementation PRs may still be separate for safety; docs refresh happens **once per completed wave**, not after every small PR. A wave shares substrate, requires no schema migration, does not cross into unrelated sections, requires no new product/architecture decisions, and can be verified safely as a sequence.
- **Pattern lock (PR cycle):** branch → implement narrow slice → targeted tests + no-leak + no-console + typecheck baseline → commit → push → open PR → wait for CI → merge if green + CLEAN → verify local main equals origin/main → next slice in the same wave (no docs refresh between) → at wave close: one concise docs refresh updating **`NEXT_ACTION.md` + relevant section file** + lean master index touchups.
- **RULE 21 research arc** required for substrate-architectural pastes (external libraries, new substrate patterns, cross-application boundaries, cross-language boundaries, wire-format changes).
- **No `console.*` in `apps/api/src`** (RULE 16; anchor test enforces).
- **Soft-delete only** (RULE 10; `deleted_at` timestamps, never DELETE).
- **Audit chain integrity** (RULE 4; `writeAuditEvent` before response; failure rolls back action).

## Update rule (mandatory)

After every wave-close (not per individual PR for routine work):
1. Update this file's "Where we are" + "Exact next action" + "Recent merges" implications.
2. Keep this file ≤ 150 lines.
3. Update the relevant `current-build-state/XX-section.md` with detailed notes (don't starve of necessary detail).
4. Update `CURRENT_BUILD_STATE.md` only for: HEAD / latest-PR / status-row / queue-order / global-truth changes.
5. For a **major** architectural landing (new substrate cluster, security/governance landing, schema change, cross-section integration, complex runtime behavior, RULE 21 paste), also write a tier-4 `build-log/YYYY-MM-DD-pr-XX-slug.md` entry. Routine routes do NOT need build-log entries.
