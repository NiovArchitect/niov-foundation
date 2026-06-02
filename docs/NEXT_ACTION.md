# NEXT ACTION — Operational Baton

> Tier 1 of the Foundation 5-tier docs hierarchy. Read first in
> every new session. ≤ 150 lines by design.
> Tier 2 master index: [`CURRENT_BUILD_STATE.md`](CURRENT_BUILD_STATE.md).
> Tier 3 section detail: [`current-build-state/`](current-build-state/).
> Tier 4 build-log: [`build-log/`](build-log/).
> Tier 5 ADRs: [`architecture/decisions/`](architecture/decisions/).

## Where we are

- **Foundation main HEAD:** `35d7e84` (VF.2 voice runtime PR #211 LIVE; **VF.3 LocalMockVoiceProvider + integration tests in flight**). **CT main HEAD:** `4e19e07` (PR #27 — CT C4-A Jira Cloud admin path LIVE). Sections 5 + 7 + 9 Approvals + 9 Policies remain PRODUCTION-GRADE COMPLETE. **VF.3 LANDING per ADR-0085 §8 (autonomous-continuation-authorized)** — Classification C backend runtime. NEW `apps/api/src/services/voice/local-mock-voice.provider.ts` (LocalMockVoiceProvider with 8 forced-failure fixture keys + 10-entry deterministic FIXTURE_TRANSCRIPTS catalog keyed by canonical voice-intent names + typed-prose fallback + default-catalog fallback). MOD `voice-provider.service.ts` LOCAL_MOCK dispatch now returns LocalMockVoiceProvider (previously fell back to TextOnly). MOD barrel exports `@niov/api`. MOD existing VF.2 unit test reflects the dispatch change. NEW `tests/unit/local-mock-voice-provider.test.ts` (27 tests across forced-failure dispatch + deterministic catalog resolution + fallback paths + synthesize round-trip + privacy invariant). NEW `tests/integration/voice-envelope-runtime.test.ts` (9 tests asserting constructEnvelope writes real VOICE_INTENT_RECEIVED audit row + SAFE schema preserved end-to-end + audit chain verifyAuditChain green + risk-tier discrimination at audit-substrate register + emitVoiceLifecycleAudit threads consecutive rows + multi-surface enum persistence). Unit suite 1326 → 1353 (+27); integration suite +9. Typecheck 4-error baseline preserved. NO Sesame; NO audio; NO new route; NO CT change. **Next recommended:** **VF.4** (CT voice surface scaffolding — text-only talk button on AI Twin page; uses TextOnlyVoiceProvider only — no microphone access, no audio capture — autonomous-continuation-authorized per ADR-0085 §8) OR **CT C4-B Linear admin path** OR **C-GitHub runtime** OR **D6-ENTERPRISE-AUDIT-ONLY-TABLES**. VF.5+ require explicit Founder authorization per Sesame readiness assessment closeout.
- **Latest merged PR (Foundation):** [#211](https://github.com/NiovArchitect/niov-foundation/pull/211) — VF.2 voice runtime (VoiceProviderAdapter + TextOnlyVoiceProvider + VoiceIntentEnvelope + 6 NEW audit literals). **Latest CT PR:** [#27](https://github.com/NiovArchitect/otzar-control-tower/pull/27) — CT C4-A Jira Cloud admin path.
- **Latest merged PRs (CT):** [#16](https://github.com/NiovArchitect/otzar-control-tower/pull/16) Section 9 Approvals + [#17](https://github.com/NiovArchitect/otzar-control-tower/pull/17) Section 9 Policies.
- **Active branch / PR (Foundation):** `foundation-voice-first-vf-3-local-mock-and-integration` — Classification C VF.3 LocalMockVoiceProvider + integration tests per ADR-0085 §8 (autonomous-continuation-authorized). NEW local-mock-voice.provider.ts + 27 NEW unit tests + 9 NEW integration tests asserting envelope-to-audit-chain end-to-end + barrel exports + docs refresh.
- **Section 1 status: PRODUCTION-GRADE COMPLETE for v1 drift-detection + Wave 5 review-gated proposed-pattern + Wave 6A + Wave 6B (active-pattern-consumption FULLY LIVE) 2026-05-31** — Wave 5 LANDED via ADR-0066 (PRs #113/#114/#115; `7661ba9` impl). **Wave 6A LANDED PR #121 `6b84a99`** (visibility half). **Wave 6B LANDED via ADR-0067 (PR #123) + impl PR #124 `625ddbf`** (influence half — sidecar field on AssembleContextSuccess + labeled L_ALIGNMENT prompt section in conductSession; reuses Wave 6A projection; ZERO score-boost; ZERO capsule pipeline mutation; ZERO new audit literal; ZERO schema migration; 14 integration tests). Symbiotic alignment loop closed at both visibility + influence registers.
- **Section 6 status:** PRODUCTION-GRADE COMPLETE for Foundation backend scope (v1) + Wave 6 + Wave 7 extensions LIVE — 6 live aggregates total (v1 4 + Wave 6 per-ActionType action-runtime health + Wave 7 org-level compliance-posture per ADR-0061 §8 forward queue; PRs #117 `2c4336a` + #119 `2b83116`); ZERO new audit literal across any Section 6 wave.
- **Section 5 status: LIVE end-to-end with ADR-0076 §4.2 + §5.2 vNext runtime + Section 2 Action read-surface lifecycle integration 2026-05-31** — Foundation Waves 1-9 LIVE + ADR-0076 Amendment 1 (PR #151) + vNext runtime LIVE in lockstep (Foundation PR #152 + CT PR #7) + **Wave 10 Section 2 Action read-surface integration LIVE (CT PR #8 `ade4981`)**. CT cockpit now distinguishes all three lifecycle states (simulation / proposed / executed) honestly via `GET /api/v1/actions/:id` (ADR-0057 §9 + §10) consumed verbatim with ZERO Foundation backend changes. NEW `ActionLifecyclePanel` + `api.actions.getAction` namespace + closed-vocab `actionLifecycleSummary()` mapping each Section 2 ActionStatus → honest copy; lazy TanStack Query (no polling); user-initiated Refresh button only; NO Execute / Approve / Cancel / Retry button in Wave 10; NO Section 2 mutation surface; NO Section 2 bypass; NO new Foundation API / schema / audit literal; 16 NEW lifecycle tests + 126/126 total CT tests + 256+ Foundation Section 5 integration tests preserved. ADR-0077 §8.4 three-state-lifecycle honesty CANONICAL across both repos.
- **Section 3 status: PRODUCTION-GRADE COMPLETE for v1 same-org Foundation backend scope**.
- **Live `ACTION_*` emitters:** 10 of 10. **Real per-`ActionType` handlers:** 3 of 3 LIVE.
- **Cancel surface:** non-RUNNING (any caller) + RUNNING (caller with valid GOVSEC.5 break-glass grant; ADR-0050).
- **Operator-tunable runtime knobs:** `ActionPolicy.retry_budget` + `attempt_timeout_ms_override` LIVE; forensic-visibility loop CLOSED end-to-end.
- **TypeScript baseline:** exactly 4 canonical residual errors.
- **Repo visibility:** PUBLIC. Branch protection: 4 required canonical CI checks + force-push blocked + admin-enforced + secret scanning + push protection + dependabot updates enabled. Required-review count: 0 (solo-developer pragmatic).

## Exact next action

**Founder-clarified framing (re-asserted across all docs):** "Section 2 production-grade complete for internal Foundation autonomous-execution-substrate scope" means the **internal autonomous execution substrate** is complete, **not** that Otzar is an internal-only product. External tool integrations (Slack / email / SMS / push / Google Workspace / Microsoft / Linear / Jira / Salesforce / etc.) remain **required future production capabilities** and are tracked under **Section 4 — MCP / Connectors** as governed adapters. Section 2's internal-only scope is the safe foundation that those future external adapters must consume; it is not a substitute for them.

## Section 5 Wave 10 LIVE — Agent Playground enterprise decision cockpit (PRs Foundation #149 + Control Tower #6)

ADR-0077 (PR #149 `eba1e3a` 2026-05-31) locked the consumer-experience contract. Wave 10 implementation slice landed in `otzar-control-tower` at PR #6 `cf3483f` 2026-05-31 under Founder UX decision Option A (NEW `/agent-playground` route; existing `/playground` Placeholder preserved). 6 panels consume the 6 Foundation Agent Playground routes verbatim via NEW `api.playground.*` namespace (10 methods). Wave 4-9 Foundation type mirrors landed at `src/lib/types/foundation.ts`. 4 honesty postures enforced (hierarchy / conversation-context — "not available in this version" / evidence-posture / execution-boundary 3-state lifecycle with "Action proposed (not executed)" framing). Wave 8 governed transition: explicit acknowledgement + confirmation modal + `caller_confirmation: true` + fresh `crypto.randomUUID` idempotency_key per submit (NEVER reused). Forbidden-UI-copy + no-leak + no-Execute-button guard tests all pass. 22 NEW Wave 10 unit tests + 110/110 total CT tests; build + lint + typecheck green. Section 5 Agent Playground end-to-end enterprise cockpit is now LIVE for the completed v1 scope.

## Section 5 Wave 9 Option A LANDED — multi-agent simulation orchestration (PRs #146/#147/#148)

ADR-0076 + Wave 9 Option A + closeout. NEW `PlaygroundSimulationService` + NEW route `POST /api/v1/playground/scenarios/:id/simulations` + 47 integration tests. Sequential `Promise.allSettled` over (branch_definition × agent_role) ≤ 24; each combo invokes Wave 7 once; closed-vocab lens projection. Founder behavioral + enterprise-decision-output clarifications 2026-05-31 applied as additive `enterprise_decision_posture` extension. NO agent-debate / chain-of-thought / Action creation / LLM / Python / BEAM. Audit `PLAYGROUND_SIMULATION_EXECUTED` discriminator only.

## ADR-0071 LANDED — Section 7 cross-scope verify-chain (PRs #131/#132/#133)

ADR-0071 design (#131 `3512bed`) + implementation (#132 `ffc0548` Option A clean break) + closeout docs (#133 `6ab71e9`) all LIVE. `GET /api/v1/audit/verify-chain?scope=self|org|platform|regulator` now LIVE with NEW canonical response fields (`verified` / `checked_event_count` / `chain_algorithm` / `window_start/end` / `first_event_id+hash` / `last_event_id+hash` / `broken_at_event_id` / `failure_reason` / `lawful_basis_id` / `evidence_note` / `honest_note`); old `valid` / `total_events` / `broken_at` aliases NOT emitted. `VERIFY_CHAIN_MAX_EVENTS = 10_000`; 30-day default window for org/platform; regulator window bounded by LawfulBasis `valid_from`→`valid_until`. ADR-0036 9-condition LawfulBasis enforcement reused verbatim. ZERO new audit literal — extended `AUDIT_VIEW_VERIFY_CHAIN` meta. ZERO schema migration. **Section 7 PRODUCTION-GRADE COMPLETE across all 4 read shapes × 4 scopes**. Closes ADR-0070 §Forward queue item 1 at the canonical-execution register.

## ADR-0070 LANDED — Regulator-Ready Foundation Doctrine (PR #130)

Doctrine ADR. 4th canonical doctrine alongside ADR-0027 governance / ADR-0048 personalization / ADR-0052 Otzar DGI / ADR-0069 BEAM substrate-coherence law. Canonicalizes examination-ready-by-default sentence + mandatory neutral compliance vocabulary + 12 core principles + 20 less-obvious blind spots + 10 proposed future substrate sections + section-by-section interactions + security/privilege boundaries + legal-advice boundary. ADR-0036 LawfulBasis + ADR-0049 GOVSEC + ADR-0050 break-glass + Section 7 Wave 5 regulator-view + Section 6 Wave 7 compliance-posture stay LIVE and ADR-0070 names them as existing canonical primitives the broader regulator-ready product surface composes against.

## ADR-0069 LANDED — Elixir/BEAM Substrate-Coherence Law (PR #129)

Doctrine ADR. Canonical sentence: *"Elixir should run the living processes. TypeScript should expose the product/API contract. Python should perform intelligence-heavy computation. Foundation governance should bind all of them."* Four-language division of labor + 7 BEAM strong-fit domains + mandatory 8-question architecture check for future ADRs touching long-running coordination.

## Earlier LANDED arcs

- Section 5 Waves 4/5/6/7/8: persistent scenarios + candidate generation + outcome comparison + best-path recommendation + governed-transition (PRs #111/#136/#139/#142/#145).
- Otzar Wave 3 (PR #127): ADR-0068 v1 `proactive_cards?[]` sidecar on `MyTwinView`; 18 tests.
- Section 1 Waves 6A+6B (PRs #121+#124): symbiotic active-pattern-consumption FULLY LIVE; 29 tests.
- Section 6 Waves 6+7 (PRs #117+#119): analytics aggregates metadata-only; 6 live aggregates.

## Recommended next production section

**Tier 1 cross-section alternatives (no Founder product decision required)**:

- **Section 6 additional aggregates** beyond Wave 7 — would require ADR-0061 amendment (persistent caching / operator-tunable k threshold). FORWARD-SUBSTRATE without explicit Founder authorization.
- **Section 5 Wave 10 implementation slice** — frontend code in `otzar-control-tower`. ADR-0077 contract LANDED design-only. Requires repo-switch + separate Founder authorization at slice (`[FOUNDER-SECTION-5-WAVE-10-CONTROL-TOWER-IMPLEMENTATION-AUTH]`).
- **ADR-0080 Wave 3 CT/Dandelion Preview LIVE 2026-06-01** per `[FOUNDER-ADR-0080-WAVE-3-CT-DANDELION-READ-ONLY-PREVIEW-AUTH]` + `[FOUNDER-ADR-0080-WAVE-3-ADDENDUM-DEEP-ROLE-EXAMPLES-AND-COLLABORATION-MAPS]` + ADR-0080 Amendment 2 (CT PR #18). Read-only `/onboarding` page composes against CT-side static catalog mirror; 11 panels (doctrine + counts + role browser + role depth roadmap + EA spotlight + EA collaboration map + tools + workflows + connector presets + Dandelion three-tier flow + DMW education + governed envelope); 29 NEW CT tests; 218/218 total CT tests pass; canonical DMW lines preserved ("Your Memory Wallet is how Otzar remembers safely." + "Dandelion shapes the starter profile; the DMW scopes memory; Foundation governance authorizes use."). Substrate-honest role-depth: 1 DEEP (EA) + 14 STARTER + 13 NOT_YET_MODELED + 2 SUBSUMED. NO Foundation schema, NO route, NO runtime activation, NO permission grants, NO connector activations, NO Twin profile creation, NO LLM/Python/BEAM, NO new audit literal, NO `dandelion.service.ts` mutation. **AUTONOMOUS BUILD ACTIVE** per `[FOUNDER-AUTONOMOUS-OTZAR-COMPLETE-BUILD-WHILE-FOUNDER-RESTS-AUTH]`. Next bounded slices: **Wave 2.1 role-depth expansion** (Foundation static catalog) → **Wave 6 connector-priority matrix** → **Section 10 ops hardening**. Section 4 first-connector + Section 8 Billing + Section 9 Workflows remain Founder-decision-gated.

**Tier 3 — multi-decision; defer**: Section 5 Wave 6/9 persistence + Wave 5/6/9 Option B (Python) + Wave 9 Option C (BEAM) per ADR-0028 + Section 4 SDK-bound connectors. All require dedicated ADR + Founder authorization.

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
