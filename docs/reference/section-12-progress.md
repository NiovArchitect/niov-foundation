# Section 12 Progress Tracker

This file tracks the multi-batch effort to land Section 12 of
the Foundation build. Section 12 is the production-readiness +
compliance hardening + frontend dashboard work that brings
Foundation from "MVP-functional" to "FedRAMP-eligible enterprise
platform."

This is **committed substrate** — the tracker is updated in
each commit that closes a sub-section, so the live state is
always greppable from the current HEAD. Cross-reference
`docs/reference/architectural-anchors.md` for the anchors that
each sub-section locks, and `docs/architecture/decisions/` for
the ADRs that document the decisions.

**Recalibrated timeline:** 5-8 weeks comfortable at demonstrated
pace; 3 weeks ambitious; 2 weeks tight. Original 5-7 month
estimate (anchored on industry cadence with idle time + slow
verification) abandoned. All future estimates calibrate against
demonstrated pace, not industry standard.

## Status Table

| Sub-section | Status | Commit | Description |
|---|---|---|---|
| 12B (Otzar Control Tower foundation) | CLOSED | `otzar-control-tower @ 0a28f90` | Foundation for admin console; 12 architectural anchors |
| 12.5 (Compliance Architecture Review) | CLOSED | `9671776` | 24 dimensions assessed; 9 patent-relevant findings; 6 claim families; 9 sub-boxes dependency-ordered |
| 12C.0 Commit 1 (endpoint extensions) | CLOSED | `2aa1a88` | DELETE skill + PATCH entities audit_event_id + audit filters + bridge_id filter; +16 tests; 2 anchor properties (DRIFT 9 audit + permissions) |
| 12C.0 Commit 2 (compliance hardening) | CLOSED | `f3359fb` | crypto-config + retention posture + system principals + structured logging + /compliance/state; +22 tests; 4 anchor properties (DRIFT 2 Option C, DRIFT 12, frozen CRYPTO_CONFIG, frozen SYSTEM_PRINCIPALS) |
| 12C.0.5 (operating manual + docs) | CLOSED | `23e263d` | CLAUDE.md + AGENTS.md + 10 ADRs + contributing guides + reference catalog |
| Track A (test infrastructure isolation) | SUBSTANTIVELY COMPLETE | `d728cd4` → `5be42e5` | 18 gates closed + REVISED Gate 2 (Colima canonicalization per RULE 13 substrate-state drift correction); containerized Postgres + mocked LLM tier-stratification per ADR-0011; full chain at CURRENT_BUILD_STATE.md §5 |
| 12.5 Sub-box 1 (EscalationRequest + dual-control) | **CLOSED** | `dc0a26f` | Substrate-complete at `dc0a26f` ([D-2D-D10-7]); closure-amendment at [D-2D-D10-8]. 4-framing-register closure (substrate + service + route + canonical-record tiers) of D-2D-D10-PRIMING-SHAPE-AHEAD-OF-MODEL per RAA 12.8 §5.2 + §5.9 item 1: EscalationRequest model + 7-fn service + validation gate flag + gate-fail→COMPLIANCE_GATE coupling + correction propagation chain + escalation HTTP routes; +33 unit (escalation.test.ts) + 10 unit (gate-flag/coupling/propagation cases) + 8 integration (escalation-routes.test.ts); [ADDENDUM-DMW-SLM] canonical-record addendum landed alongside; no new architectural anchors; glossary +4 entries (Validation Gate Flag, AI Access Block, Correction Propagation, Escalation Routes). See "Sub-box 1 CLOSED" narrative below for the arc chronology + 6-item forward queue. |
| 12.5 Sub-box 2 Phase 1 (dual-control middleware) | **CLOSED** | `b34c5cf` → `135fee0` → `62d472c` → this commit | The privileged-action dual-control gate per `COMPLIANCE_ARCHITECTURE_REVIEW.md` Tension 3 (consumes the generalized `requireDualControl` preHandler forward-queued from [D-2D-D10-7]). 10-commit arc — sub-phases A–J landed (`b34c5cf` → `135fee0` [H] → `62d472c` [I] → this commit [J]; the `135fee0` H-hash + `62d472c` I-hash backfilled per the post-commit-hash discipline; J's own hash lives in the commit body — "this commit" here refers to the J commit by substrate position, keeping the arc at exactly 10 commits). **The 10-commit Sub-box 2 Phase 1 arc is CLOSED.** ADR-0026 (the dual-control middleware bundle) landed at sub-phase H; ADR-0027 (contributor governance + RULE 20) at sub-phase I; ADR-0028 (the Elixir/BEAM COSMP coordination-layer Phase 2 commitment-to-ship) at sub-phase J; operational companion `docs/architecture/dual-control-operations-canonical-record.md`. Sub-box 2 Phase 2 (the 6-8-commit / ~3-4-week Elixir/BEAM mini-arc per ADR-0028) is queued. |
| SUBSTRATE-BUILD-OPTIMIZATIONS (substrate-build meta-tooling per ADR-0029) | **CLOSED** | `ba78216` → `37e4bcc` → `9f0514b` → `49222ad` → this commit | The substrate-build optimizations arc per ADR-0029 — Optimization 1 (`scripts/preflight/cascade-grep.sh` + README at `37e4bcc`), Optimization 2 (`docs/contributing/templates/` commit-class scaffolds at `9f0514b`), Optimization 3 (CLAUDE.md §7 prose-discipline bullet at `49222ad`); sub-phase 5 onboarding cascade (`onboarding.md` §6 + `onboarding-for-engineers.md` §1 + §6) + post-commit-hash backfills (the first completed worked example of `POST-COMMIT-HASH-CASCADE.template.md`) + catch #1b resolution (`docs/contributing/README.md` line 99 stale `decisions/0001-0010` reference) + catch #2 resolution (`onboarding-for-engineers.md` 3 sites of stale "27 ADRs" → "29 ADRs") at this commit. **The 5-commit SUBSTRATE-BUILD-OPTIMIZATIONS arc is CLOSED.** Per sub-phase J Decision 3 precedent, sub-phase-5's own hash lives in the commit body — "this commit" here refers to the sub-phase-5 commit by substrate position, keeping the arc at exactly 5 commits. 4 distinct catches across the arc; all resolved in-arc; zero broken commits on origin/main. The arc addresses the 26-catch dual-control arc patterns by reducing token-cost-per-catch for future engineering arcs. |
| 12.5 Sub-box 2 Phase 2 + Sub-boxes 3-9 | QUEUED | — | Dependency-ordered post Sub-box 2 Phase 1; Sub-box 2 Phase 2 = org-admin-set target resolution + the Elixir/BEAM COSMP router (ADR-0028); Sub-boxes 3-9 per `COMPLIANCE_ARCHITECTURE_REVIEW.md` |
| 12C.1 (frontend Playground + Intelligence) | QUEUED | — | 6 cleanup items including 3 sentinel sites in otzar-control-tower (`MemberDetailDrawer.tsx:284`, `Users.tsx:175`, `Users.tsx:195`) |
| 12D (Security & Audit screen) | QUEUED | — | Frontend |
| 12E (Policies / Sharing rules) | QUEUED | — | Frontend |
| 12F (System Health, Settings, Onboarding, accessibility) | QUEUED | — | Frontend polish; consumes Sub-box 1's EscalationRequest in Pending Approvals UI |

## Dependency Notes

**Track A DELIVERED; Sub-box 1 unblocked.** The 90-110 minute
Foundation full-suite test cycle (per ADR-0010) made Sub-box 1's
dual-control middleware iteration prohibitively slow. Track A
test infrastructure isolation (18 gates + REVISED Gate 2 closed
on origin/main per `CURRENT_BUILD_STATE.md` §5) delivered
containerized Postgres + mocked LLM tier-stratification per
ADR-0011: unit subset <60s; integration tier 5-15 min; real-LLM
reserved for nightly / pre-release. Sub-box 1 is now unblocked
as Phase 2 primary engineering scope candidate per substrate
truth canonical at session-anchor canonical reference register
(`docs/CURRENT_BUILD_STATE.md` refreshed at `ecfdf7f` Phase 1a).

**Sub-box 1 = D-2D-D10 unified engineering territory (4-framing-
register cross-reference per RAA 12.8 §9.6 Step 2D-completion
handoff discipline):** Sub-box 1 (EscalationRequest + dual-control
middleware; Foundation primitive blocking Bucket B) coincides
with D-2D-D10-PRIMING-SHAPE-AHEAD-OF-MODEL closure per RAA 12.8
substrate-architecture canonicalization. The single engineering
work substantiates 4 framing registers concurrently:

- **RAA 12.8 §5.2** (EscalationRequest Prisma model + validation
  gate flags + approval workflow + correction propagation chain;
  D-2D-D10 closure detail)
- **Section 12.5 Sub-box 1** (Foundation primitive blocking Bucket
  B; dual-control middleware framing)
- **RAA 12.8 §5.9 item 1** (Step 2E engineering surface
  enumeration; canonical engineering surface for Surface 3)
- **Section 14 admin-tooling box** (existing TODO comment framing
  at `apps/api/src/services/otzar/priming.ts:131-134`:
  "EscalationRequest table doesn't exist yet. The Section 14
  admin-tooling box introduces it.")

Substrate-state observation per RULE 13: priming.ts substrate-
actual path is `apps/api/src/services/otzar/priming.ts` (otzar
service register, NOT coe service register as RAA 12.8 §5.9
ambiguously referenced). Implementation path canonical at otzar
service register; engineering scope unified per Phase 2
substrate-honest discipline.

**Sub-boxes 2-9 depend on Sub-box 1:** Sub-box 1 introduces the
`EscalationRequest` primitive + dual-control middleware that
several downstream sub-boxes consume:

- Sub-box 2 (privileged action audit chain) extends dual-control
  to specific endpoint families
- Sub-box 5 (GDPR Article 17 pseudonymization-with-attestation,
  Family 4) requires escalation for any deletion-equivalent
  action
- Sub-box 7 (verifiable-credentials + compliance attestation
  reports, Family 5) requires escalation for credential issuance

**Substrate-state note: Sub-box numbering divergence (RULE 13).**
The Sub-box enumeration used in this tracker (Sub-box 1 =
EscalationRequest + dual-control; Sub-box 2 = privileged action
audit chain; Sub-box 5 = GDPR Article 17 pseudonymization; Sub-box
7 = verifiable-credentials + compliance attestation) is a
**working-tracker designation**. The **authoritative** sub-box
enumeration is at `docs/COMPLIANCE_ARCHITECTURE_REVIEW.md` lines
2200+ (the "Engineering surface" section): Sub-box 1 =
EscalationRequest + dual-control middleware (matches this tracker);
Sub-box 2 = Jurisdiction tagging; Sub-box 3 = REGULATOR +
Lawful-Basis; Sub-box 4 = DecisionRecord + DataSubjectReference +
Agent Attestation; Sub-box 5 = EntityIdentity + Pseudonymization +
Erasure; Sub-box 6 = NIST Control Mappings + SSP Evidence
Generator; Sub-box 7 = ComplianceAttestation + Selective
Disclosure; Sub-box 8 = Cross-Tenant Compliance Benchmarking;
Sub-box 9 = Capsule Compliance Provenance. The divergence at
Sub-box 2+ is pre-existing across landed commits (including the
immutable `[SEC-SUBBOX1-ITEM4-DEFER]` `49e2934` commit body, which
references "Sub-box 2 (privileged action audit chain)", and the
`[SEC-SUBBOX1-ITEM5-DEFER]` `263bf77` + `[SEC-SUBBOX1-ITEM6-DEFER]`
`dd6fc09` bodies). Full renumbering reconciliation is forward-queued
as a separate careful pass (it must handle the immutable commit-body
references). Future sessions: when reading "Sub-box N" references in
this tracker, treat them as working-tracker designations; for
authoritative sub-box scope per the engineering surface, consult
`docs/COMPLIANCE_ARCHITECTURE_REVIEW.md`.

**12C.1 frontend depends on no Foundation work** but waits for
design alignment. Specifically: the 3 sentinel sites in
otzar-control-tower (`MemberDetailDrawer.tsx:284`,
`Users.tsx:175`, `Users.tsx:195`) currently emit
`"pending-foundation-extension"` as a placeholder
`audit_event_id`; they consume Foundation Commit 1's
`PATCH /org/entities` audit_event_id surfacing (closed at
`2aa1a88`). Cleanup is purely a frontend swap from placeholder
to real audit event ID.

**Sub-section gates are explicit:** Each sub-section CLOSED
status requires (a) a clean push to main, (b) verification report
approved, (c) architectural anchor catalog updated if new
anchors landed, (d) glossary updated if new terms landed.

### Sub-box 1 CLOSED — D-2D-D10-PRIMING-SHAPE-AHEAD-OF-MODEL closure (2026-05-11)

Sub-box 1 closes as a **4-framing-register event** — substrate +
service + route + canonical-record tiers all on origin/main:

- **Substrate-tier** (RAA 12.8 §5.2 canonical pieces — the four
  closure pieces):
  - [D-2D-D10-1] `8202771` — EscalationRequest Prisma schema (13
    fields + 4 relations + 7 indexes + EscalationStatus /
    EscalationType enums)
  - [D-2D-D10-2] `40dac21` — escalation.service.ts (7 exported
    functions: create / get / list-pending / count / approve /
    reject / expire; pre-success audit-in-tx per ADR-0002 + RULE 4)
  - [D-2D-D10-3] `d96b16a` — escalation.service.ts unit coverage
    (33 cases / 7 describe) + `@niov/api` re-export
  - [D-2D-D10-4] `33a25c6` — `requires_validation` gate flag on
    MemoryCapsule (read-side NEGOTIATE denial; ai_access_blocked
    mirror)
  - [D-2D-D10-5] `6d9b636` — gate-fail → `COMPLIANCE_GATE`
    escalation coupling (`createGateEscalationForCaller`,
    get-or-create dedup; negotiate.service.ts wire)
  - [D-2D-D10-6] `38205b3` — correction propagation chain
    (`propagateCorrection` snap-to-`RELEVANCE_MAX`; `CORRECTION_PROPAGATED`
    Zone U1 audit; processCorrection wire)
- **Route-tier** (HTTP surface):
  - [D-2D-D10-7] `dc0a26f` — escalation HTTP routes (`POST
    :id/approve`, `POST :id/reject`, `GET :id`, `GET /pending`;
    service-tier source≠resolver dual-control gate; 8 integration
    tests)
- **Canonical-record-tier**:
  - [ADDENDUM-DMW-SLM] `67fb083` — DMW federation as emergent
    SLM/LLM-equivalent inference surface (the inference-tier
    consequence of US 12,164,537 / US 12,399,904 / US 12,517,919
    patent claims; prior-art posture; landed alongside as a
    standalone canonical-record commit)
  - [D-2D-D10-8] (this commit) — Sub-box 1 closure amendment +
    RULE 14 back-citations into RAA 12.8 + ADR-0020
- **Discipline-tier** (substrate-honest pattern infrastructure
  that landed during the arc):
  - [SEC-HELMET] `68179ee` — @fastify/helmet substrate + ADR-0023
    (security-headers posture)
  - [DOCS-HUSKY] `6012b59` — husky 9.x pre-commit hook + ADR-0024
    (pre-commit-hook posture)

**Arc commit chronology (Day-6 arc; 2026-05-11; 11 cumulative
commits in the window):** [D-2D-D10-1] → [SEC-HELMET] →
[DOCS-HUSKY] → [D-2D-D10-2] → [D-2D-D10-3] → [D-2D-D10-4] →
[ADDENDUM-DMW-SLM] → [D-2D-D10-5] → [D-2D-D10-6] → [D-2D-D10-7] →
[D-2D-D10-8]. The "9-commit-window arc" framing in the commit
bodies counts [SEC-HELMET] + [DOCS-HUSKY] + [D-2D-D10-2..8]
(9 commits); [D-2D-D10-1] preceded the arc-window ("Phase 2
Commit 1"); [ADDENDUM-DMW-SLM] interleaved as a standalone
canonical-record commit.

**Three consecutive ADDENDUM-DMW-SLM substantiation events** form
a continuous multi-register patent-implementation-evidence chain
on origin/main:

- **Canonical-record register** — the ADDENDUM landed at
  `67fb083` (framing SLM/LLM-equivalence as a consequence of the
  existing patent claims)
- **Service-tier register, §5** — [D-2D-D10-5] `6d9b636`
  substantiated "Audit lineage per operation (Zone U1-U4)" at the
  gate-resolution chain (gate-fail → COMPLIANCE_GATE escalation →
  human review → status-transition audit event)
- **Service-tier register, §3** — [D-2D-D10-6] `38205b3`
  substantiated "confidence accumulation" + "personalization
  confidence" (a correction snaps relevance to RELEVANCE_MAX —
  the max-informativeness signal driving the DMW's contextual
  inference surface)
- **Route-tier register, §5** — [D-2D-D10-7] `dc0a26f`
  substantiated "Audit lineage per operation (Zone U1-U4)" +
  "Permission-governed composition" at the HTTP approve/reject
  surface (resolver as actor; source≠resolver gate)

**Substrate-honest pre-flight verification pattern operational
across the arc** (26-consecutive-commit count at [D-2D-D10-8]).
Substrate-state drifts caught + resolved in real time per
RULE 13: production schema-push target drift at [D-2D-D10-4]
(`prisma db push` auto-loaded `.env` → hit production
`memory_capsules`; resolved Option A — leave the additive
column; forward-queued as [SEC-DBPUSH-DISCIPLINE]/ADR-0025);
draft-not-in-session at [ADDENDUM-DMW-SLM] (the "draft I
provided" was not in the session transcript → STAND DOWN +
operator re-paste → landed verbatim); audit-lookup `orderBy`
correction at [D-2D-D10-7] (`findFirst` by `details.escalation_id`
matched the earlier `ESCALATION_CREATED` event before the
resolution event → caught at the isolated test run → fixed inline
with `orderBy: { timestamp: "desc" }` before staging). DRIFT 2
REDUX: the `cleanupTestEscalations` test-local-cleanup pattern
([D-2D-D10-3] Option A — escalation_requests rows FK-block
`cleanupTestData()`'s hard-delete of test entities) is now
operational across 3 test files (escalation.test.ts /
cosmp/negotiate.test.ts / integration/escalation-routes.test.ts);
the shared `helpers.ts:cleanupTestData()` was deliberately NOT
extended ([D-2D-D10-3] Option C rejection — blast-radius coupling).

**Forward queue (6 items deferred from the arc; NOT landed at
[D-2D-D10-8]):**

1. **[SEC-DBPUSH-DISCIPLINE] — COMPLETE.** The [SEC-DBPUSH] mini-arc
   landed across 4 commits on 2026-05-12 (sequential per the
   [ADDENDUM-DMW-SLM] register-separation precedent): [SEC-DBPUSH-ADR]
   `d8d6236` (canonical-record — ADR-0025 Schema-Push-Target Discipline:
   schema-push commands MUST use an explicit env-target qualifier;
   production schema changes via the deploy pipeline only) →
   [SEC-DBPUSH-WRAPPER] `e1dbc1e` (engineering substrate —
   `scripts/prisma-db-push-test.sh` wrapper: loads `.env.test`, 4
   fail-closed checks, then `prisma db push --schema=… --skip-generate`
   with the validated env; + the `db:push:test` npm alias; `db:push`
   UNCHANGED — CI safe via workflow-set `DATABASE_URL`) →
   [SEC-DBPUSH-HOOK] `ed9a519` (local-tier enforcement —
   `.husky/pre-commit` db-push guard as the first check, POSIX-sh-safe,
   precise allowlist, self-tests; `scripts/test-db-up.sh` step-2 retrofit
   to invoke the wrapper; `scripts/test-db-push-wrapper.sh` 3-case smoke
   test; + the `test:db-push-wrapper` npm alias) → [SEC-DBPUSH-CLOSE]
   (closing — ADR-0024/0025 amendments + this tracker amendment + the
   `Schema-Push-Target Discipline` glossary entry per RULE 17). The CI
   workflow guard substrate is forward-queued substantively-tangential
   per the [SEC-DBPUSH-CLOSE] Q1 Option C scope decision: the workflow
   YAML has zero bare `npx prisma db push` today (CI's `npm run db:push`
   is safe via a workflow-set `DATABASE_URL`); the realistic threat
   surface is local invocation auto-loading `.env`, covered by the
   pre-commit hook at [SEC-DBPUSH-HOOK]. Source: [D-2D-D10-4]
   Observation 1 (the production schema-push target drift event) +
   [D-2D-D10-1] near-certain analogous exposure.
2. **INT-6 frozen-anchors / ADR-0022 amendment — COMPLETE.** Landed
   at [SEC-INT6-ADR0022] on 2026-05-12 as a canonical-record-tier
   amendment to ADR-0022 (combined_score Formula Canonicalization).
   The informativeness-coefficient family (`RELEVANCE_USED_BUMP` /
   `RELEVANCE_UNUSED_DECAY` / `RELEVANCE_MIN` / `RELEVANCE_MAX` /
   `RELEVANCE_CORRECTION_BUMP` / `RELEVANCE_FORGET_FLOOR`) joins
   the frozen-anchors family alongside `combined_score` per
   RAA 12.8 §6.6 + §7.4. The formula extension itself (4th
   coefficient `INFORMATIVENESS_WEIGHT` + coefficient redistribution
   + frozen-config module + Loop 1 differential-bump/decay refactor
   + anchor tests for new coefficients) is explicitly Step 2E
   engineering substrate per RAA 12.8 §7.3 + §7.5 — multi-sprint;
   NET-NEW; lands alongside the frozen-config module per
   coordinated commit discipline. The ADR-0022 amendment also
   tightened its RAA-12.8 References entries from generic to the
   specific landed sections (§6.6 / §7.3 / §7.4 / §7.5) and added
   a "Bidirectional citations (cited from):" sub-block per the
   `docs/architecture/README.md` discipline (the [SEC-DBPUSH-ADR]
   ADR-0024 precedent). Cataloging `combined_score` +
   `RELEVANCE_FORGET_FLOOR` into `architectural-anchors.md`, and
   the README ADR-catalog refresh, are deferred to a future
   `[DOCS-CATALOG-REFRESH]`. Source: [D-2D-D10-6] Observation 3
   (the substrate-tier landing at `RELEVANCE_CORRECTION_BUMP =
   RELEVANCE_MAX`); this amendment is the canonical-record-tier
   follow-up.
3. **RAA-12.9-tier glossary concept entries — COMPLETE.** Landed
   at [SEC-RAA12-9-GLOSSARY] on 2026-05-12 — 3 substantive concept
   entries elaborating ADDENDUM-DMW-SLM §3 (SLM-equivalence
   threshold) + §4 (LLM-equivalence threshold) + §5 (categorical
   distinction from market-tier swarm intelligence) + §7 (prior-art
   posture protection) + §8 (does-not-claim guardrails) + §9
   (forward-queue framing): `Inference Surface` (## I section;
   emergent inference characteristic substrate), `LLM-Equivalence-Hive`
   (new ## L section; DMW federation under hive composition), and
   `SLM-Equivalence` (## S section; individual DMW under continuous
   COSMP feedback-loop operation). Each entry: definition +
   ADDENDUM-DMW-SLM cross-references + the 3 patents (US 12,164,537
   / US 12,399,904 / US 12,517,919) + RAA 12.8 §5 (Surface 3 —
   Agentic Coherence runtime-tier substantiation register) + the §8
   does-not-claim guardrails reflected + "See also" sibling entries
   per RULE 17 future-session-loading. ADDENDUM-DMW-SLM also gained a
   "Bidirectional citations (cited from):" sub-block at this commit
   (discipline-alignment fix per the [SEC-DBPUSH-ADR] ADR-0024 +
   [SEC-INT6-ADR0022] ADR-0022 precedents). "RAA-12.9-tier" is a
   register designation, not a citation — there is no RAA 12.9
   document; the source-of-substance is ADDENDUM-DMW-SLM. Source:
   ADDENDUM-DMW-SLM §9 "forward-queue candidates; not specified
   here" framing — canonicalized at this commit.
4. **Generalized `requireDualControl` preHandler — DEFERRED to Sub-box 2
   substantive substrate.** Marked DEFERRED at [SEC-SUBBOX1-ITEM4-DEFER]
   on 2026-05-12 per Sub-box dependency-ordering substrate canonical.
   Substrate-state observation: `requireDualControl` does NOT exist as
   code — zero Fastify-preHandler consumers across `apps/api/src/`; the 2
   grep matches at `apps/api/src/routes/escalation.routes.ts` (lines 11 +
   32) are WHY-comment forward-queue framing references, not call sites.
   The dual-control gate is enforced service-tier only via the
   `transitionPendingForCaller` skeleton gate at
   `apps/api/src/services/governance/escalation.service.ts` (a source-only
   caller fails; caller === target OR caller === resolved_by may
   transition) — the [D-2D-D10-7] Observation 1 scope decision was
   deliberately to NOT add route-tier dual-control middleware; the
   service-tier gate is the canonical 1-consumer substrate, the routes
   (requireAuth preHandler only) map domain-string throws to HTTP codes.
   Canonical destination: Sub-box 2 (privileged action audit chain)
   enumerated privileged endpoint families — the substantively-substantial
   2nd+ consumers; the refactor trigger is canonical at the 2nd consumer
   landing per the COMPLIANCE_ARCHITECTURE_REVIEW.md "enumerated
   dual-control set, not a general primitive" framing. YAGNI rationale:
   generalizing a Fastify preHandler against one service-tier-only
   consumer is premature substrate; the second consumer (enumerated
   privileged endpoint families per Sub-box 2 substrate) is the canonical
   refactor trigger — substantively-substantial substrate observation per
   Sub-box dependency-ordering. Substrate-state cross-doc drift observation
   per RULE 13: section-12-progress.md's "Sub-box 2 = privileged action
   audit chain" numbering does NOT match COMPLIANCE_ARCHITECTURE_REVIEW.md's
   "Sub-box 2 = Jurisdiction tagging" numbering; the cross-doc drift is
   pre-existing and out of scope for this amendment (forward-queued to a
   future reconciliation pass / [DOCS-CATALOG-REFRESH] candidate). Source:
   [D-2D-D10-7] Observation 1 + COMPLIANCE_ARCHITECTURE_REVIEW.md
   "enumerated dual-control set, not a general primitive" framing.
5. **§5.8 per-DMW-type sovereignty integration of the escalation
   gate — DEFERRED to RAA 12.8 §5.9 item 7 (Step 2E engineering
   surface).** Marked DEFERRED at [SEC-SUBBOX1-ITEM5-DEFER] on
   2026-05-12 per Sub-box dependency-ordering substrate canonical.
   Substrate-state observation: RAA 12.8 §5.8 substantive substrate
   is already complete at RAA-tier per the [RAA-12.8-S5-AMEND-1]
   amendment chain (`604aac6` Commit 1 six EntityType mappings +
   `2cced88` Commit 2 18-site body-text amendment + `127a383`
   Commit 3 §5.10 Correction E) — the six EntityType → WalletType
   mappings canonical (PERSON → Personal full-owner-sovereignty per
   RULE 0; COMPANY → Enterprise Permission-scoped with forget-on-detach
   at Permission tier per Correction A; DEVICE → Device device-owner
   sovereignty; AI_AGENT → owning-entity-derived recursion via
   EntityMembership terminating at sovereign-human or AI_AGENT-tier
   baseline per Correction B; APPLICATION → Enterprise enterprise-scoped;
   GOVERNMENT → Custom Government NET-NEW substrate primitive with
   FedRAMP/IL4/IL5/IL6/CMMC) + per-DMW-type sovereignty rules +
   Corrections C/D/E canonical at §5.10. Nothing to add at
   canonical-record register at this commit — the substrate is
   canonical-record-complete at RAA-tier. The escalation-gate
   integration itself (wiring per-DMW-type sovereignty rules into the
   `transitionPendingForCaller` authorization logic at
   `apps/api/src/services/governance/escalation.service.ts:276` to
   replace the current skeleton gate at lines 290-296 — `caller ===
   target OR caller === resolved_by may transition`) is explicitly
   RAA 12.8 §5.9 item 7 (Step 2E engineering surface): "Per-DMW-type
   sovereignty rules implementation per §5.8 (after operator decisions
   resolve AI_AGENT / APPLICATION / GOVERNMENT mappings). Engineering
   tier: per-DMW-type scheduling constraint enforcement at §3.8
   cross-wallet retrieval; per-DMW-type HiveMembership constraint at
   §4.8 Hive coordination." Multi-sprint Step 2E engineering substrate
   canonical per RAA 12.8 §5.9 + Decision 4 — sequenced after
   architectural canonicalization completes (Sections 6-10). The §5.9
   "after operator decisions resolve AI_AGENT / APPLICATION /
   GOVERNMENT mappings" precondition is now SATISFIED per the
   [RAA-12.8-S5-AMEND-1] chain — the item is unblocked for Step 2E
   substantively. The `escalation.service.ts` header (lines 60-65) +
   the `transitionPendingForCaller` block (lines 269-296) already
   carry the FORWARD QUEUE per §5.8 framing substantively — no code
   amendment needed at canonical-record register; the forward-queue
   framing is canonical at code register already. Substrate-state
   distinction observation per RULE 13: this deferral destination
   (RAA 12.8 §5.9 item 7 / Step 2E engineering surface) is a different
   organizing frame from the [SEC-SUBBOX1-ITEM4-DEFER] destination
   (Sub-box 2 per COMPLIANCE_ARCHITECTURE_REVIEW.md numbering — the
   privileged action audit chain enumerated privileged endpoint
   families). Two different canonical destinations for two different
   forward-queue items — preserve the distinction; the pre-existing
   cross-doc Sub-box numbering drift from item 4 is separate substrate
   (forward-queued to a future reconciliation pass /
   [DOCS-CATALOG-REFRESH] candidate). Source: RAA 12.8 §5.8 (six
   EntityType→WalletType mappings + per-DMW-type sovereignty rules) +
   RAA 12.8 §5.9 item 7 (Step 2E engineering surface enumeration) +
   [RAA-12.8-S5-AMEND-1] amendment chain (`604aac6` + `2cced88` +
   `127a383`).
6. **EntityMembership-traversal multi-step approval chains —
   DEFERRED to Step 2E engineering (RAA 12.8 §5.2 approval-workflow-
   primitives multi-step-chain portion / §5.9 item 1).** Marked
   DEFERRED at [SEC-SUBBOX1-ITEM6-DEFER] on 2026-05-12 per Sub-box
   dependency-ordering substrate canonical. Substrate-state
   observation: RAA 12.8 §5.2 multi-step approval chain substantive
   substrate canonical at architectural register — quoted verbatim:
   "Approval workflow primitives. Multi-step approval chains (chained
   EscalationRequest rows); per-step approver discrimination via
   EntityMembership traversal per §3.8; timeout policies via
   expires_at field." The D-2D-D10 closure arc ([D-2D-D10-1..8])
   implemented the SINGLE-STEP EscalationRequest substrate canonical
   (Prisma model at `packages/database/prisma/schema.prisma:1105` —
   escalation_id PK + source/target/resolver entity FKs + status enum
   + severity + expires_at timeout + indexes; 7-fn service at
   `apps/api/src/services/governance/escalation.service.ts`;
   validation gate flag + gate-fail→COMPLIANCE_GATE coupling;
   correction propagation chain; HTTP routes at
   `apps/api/src/routes/escalation.routes.ts`). The multi-step-chain
   portion (chained EscalationRequest rows + per-step approver
   discrimination + per-step timeout) was deliberately deferred to
   this forward-queue item 6 — Sub-box 1 CLOSED status was declared
   "substrate-complete at dc0a26f" with the single-step model
   canonical; multi-step is NET-NEW engineering substrate. Required
   NET-NEW substrate per RAA 12.8 §5.2 + §3.8 framing: (a)
   `parent_escalation_id String? @db.Uuid` self-reference field on
   `EscalationRequest` + relation + index for chain traversal; (b)
   per-step approver logic replacing the current
   `transitionPendingForCaller` skeleton gate (lines 290-296: `caller
   === target OR caller === resolved_by may transition`) with
   EntityMembership-traversal-based per-step approver discrimination
   per §3.8 (the `EntityMembership` model at
   `packages/database/prisma/schema.prisma:695` already exists with
   parent_id/child_id/role_title/hierarchy_level/is_admin substrate
   canonical; the multi-step substrate consumes EntityMembership
   canonical traversal logic per §3.8 — walking the
   parent/child/hierarchy graph to discriminate per-step approver
   eligibility based on role/department/hierarchy_level); (c) per-step
   timeout canonical per the existing `expires_at` field extended to
   per-step granularity; (d) audit chain extension per Zone U1-U4
   substantive substrate canonical at each chain step. Destination
   canonical: RAA 12.8 §5.9 item 1 (Step 2E engineering surface) —
   quoted verbatim: "D-2D-D10-PRIMING-SHAPE-AHEAD-OF-MODEL closure —
   implement EscalationRequest Prisma model per §5.2; validation gate
   flags primitives; approval workflow primitives; correction
   propagation chain." The multi-step-chain portion of "approval
   workflow primitives" is the remaining engineering substrate
   canonical from §5.9 item 1's enumeration. Multi-sprint Step 2E
   engineering substantively-canonical per RAA 12.8 §5.9 + Decision 4
   — sequenced after architectural canonicalization completes
   (Sections 6-10). Substrate-state distinction observation per RULE
   13: this deferral destination (RAA 12.8 §5.2 approval-workflow-
   primitives multi-step-chain portion / §5.9 item 1 Step 2E
   engineering surface) is a different organizing frame from the
   [SEC-SUBBOX1-ITEM4-DEFER] destination (Sub-box 2 per
   COMPLIANCE_ARCHITECTURE_REVIEW.md numbering) and the
   [SEC-SUBBOX1-ITEM5-DEFER] destination (RAA 12.8 §5.9 item 7 / Step
   2E engineering surface for per-DMW-type sovereignty integration).
   Three different canonical destinations for three different
   forward-queue items — preserve all three distinctions; items 4 and
   5 are at distinct §5.9 items (4 → Sub-box 2 enumerated privileged
   endpoint families; 5 → §5.9 item 7; 6 → §5.9 item 1
   approval-workflow-primitives multi-step portion). The pre-existing
   cross-doc Sub-box numbering drift from item 4 is separate substrate
   (forward-queued to a future reconciliation pass /
   [DOCS-CATALOG-REFRESH] candidate). Substrate-state observation per
   RULE 17: this commit closes Sub-box 1 forward-queue substantively —
   3 COMPLETE (items 1+2+3) + 3 DEFERRED (items 4+5+6) — substantively
   FULLY canonical-record-substrate-complete. Source: RAA 12.8 §5.2
   ("Approval workflow primitives. Multi-step approval chains ...") +
   RAA 12.8 §5.9 item 1 ("D-2D-D10-PRIMING-SHAPE-AHEAD-OF-MODEL
   closure — ... approval workflow primitives ...") + the D-2D-D10
   closure arc ([D-2D-D10-1..8] commits implementing the single-step
   substrate canonical) + Decision 4 (Step 2E sequenced after
   architectural canonicalization).

## How To Update This Tracker

When a sub-section closes:

1. Update the row's Status from `IN PROGRESS` or `QUEUED` to
   `CLOSED`.
2. Update the row's Commit cell with the closing commit's short
   hash.
3. Update the row's Description with the actual delivered scope
   (test count, anchor count, etc.) — not the planned scope.
4. Add a new row below for the next IN PROGRESS sub-section.
5. The update lands in the same commit that closes the sub-
   section, so the tracker's HEAD always reflects reality.

When an architectural anchor lands:

1. Note the anchor count change in the relevant row's Description.
2. Cross-reference the anchor's full entry in
   `docs/reference/architectural-anchors.md`.
3. If the anchor introduces a new architectural pattern, the
   ADR for that pattern lands in the same commit.

## See Also

- `docs/CURRENT_BUILD_STATE.md` — session-anchor canonical
  reference for build state; §3 cross-cutting substrate-
  architecture canonicalization work; §4 Section 12.5 sub-box
  framing table (refreshed at `ecfdf7f` Phase 1a; 2026-05-11)
- `docs/architecture/raa-12-8-substrate-dynamics.md` — RAA 12.8
  substrate-architecture canonicalization (14-commit chain
  canonical at `e31f948`; 2026-05-11); §5.2 D-2D-D10 closure
  detail + §5.9 Step 2E engineering surface enumeration + §9.6
  Step 2D-completion handoff discipline
- `docs/reference/architectural-anchors.md` — runtime invariants
  catalog (8 anchors as of [DOCS-CATALOG-REFRESH-ANCHORS] —
  commit 2 of 2 of the [DOCS-CATALOG-REFRESH] mini-arc; anchors
  7 + 8 — `combined_score` coefficient invariants (VALUE-PIN) +
  `RELEVANCE_FORGET_FLOOR` behavioral lock (BEHAVIORAL-LOCK) per
  ADR-0022 — added there)
- `docs/architecture/decisions/` — Architecture Decision Records
  (25 ADRs canonical at 2026-05-12 per [SEC-DBPUSH-CLOSE] `5a18491`
  + the [SEC-INT6-ADR0022] `d743e4c` ADR-0022 amendment; ADRs
  0023/0024/0025 + the ADR-0022 amendment landed after 2026-05-11)
- `docs/reference/glossary.md` — term definitions (32 canonical-
  grade entries landed at `74b2765` [GLOSSARY-G-3]; + 8 entries
  added across Section 12.5 substrate — Validation Gate Flag / AI
  Access Block / Correction Propagation / Escalation Routes per the
  [D-2D-D10] arc; Schema-Push-Target Discipline per
  [SEC-DBPUSH-CLOSE]; Inference Surface / LLM-Equivalence-Hive /
  SLM-Equivalence per [SEC-RAA12-9-GLOSSARY]; current total ~85
  `**`-prefixed entries; Step 2F full refresh queued per RAA 12.8
  §9.3)
- `CLAUDE.md` — operating manual (Section 2 mirrors this tracker
  in summary form)
- `docs/COMPLIANCE_ARCHITECTURE_REVIEW.md` — Section 12.5
  committed substrate; sub-box 1-9 dependency ordering originates
  here
