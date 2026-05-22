# NIOV Foundation — Current Build State

**Status:** Persistent canonical reference. Updated as build
progresses. Future Claude Code sessions should view this document
at session start to load current build state regardless of
conversation context loss.

**Last updated:** 2026-05-15 ([SUB-BOX-3-CLOSURE] minimum-touch
update per Sub-phase 7 Q-NEW-1 LOCKED Option α — adds the CAR
Sub-box 3 (REGULATOR + Lawful-Basis per ADR-0036) closure entry
canonical at substantive register substantively without
performing a broader staleness refresh. Substrate-honest scope:
Sub-box 1 + Sub-box 2 Phase 1 + Block B Phase 2 + ADRs 0023-0035
remain stale at this entry register; broader refresh forward-queued
as a separate substrate-honest mini-arc canonical at substantive
register substantively when substrate justifies. Prior `**Last
updated:**` was 2026-05-11 [DOCS-BUILD-STATE-REFRESH] post-Track A
+ RAA 12.8 canonicalization).

## Phase 3 Sub-Arc 3 — Foundation/COSMP Personalization-Orchestration Substrate IN FLIGHT 2026-05-19 at PERS.1 -- ADR-0048 NEW Proposed; PERS.2-PERS.6 forward-substrate

**Status: IN FLIGHT** at PERS.1 `[COSMP-PERSONALIZATION-ADR]`.

Phase 3 Sub-Arc 3 (Foundation/COSMP Personalization-Orchestration
Substrate) IN FLIGHT 2026-05-19 at PERS.1 per Founder Q-PERS-α α-1
LOCK at `[COSMP-PERSONALIZATION-ORCHESTRATION-QLOCK]` register
substantively. ADR-0048 NEW (Foundation/COSMP Personalization-
Orchestration Substrate; Status Proposed 2026-05-19). PERS.1 does
NOT close Sub-Arc 3; PERS.6 closure cascade flips ADR-0048 Status →
Accepted at canonical-state register substantively. Sub-arc 2
remains CLOSED. Phase 3 global status NOT flipped (Phase 3 closure
requires separate explicit Founder QLOCK).

#### PERS.1 LANDED — ADR-0048 NEW Proposed; governed personalization-orchestration substrate canonicalized (2026-05-19)

**Status:** PERS.1 `[COSMP-PERSONALIZATION-ADR]` LANDED 2026-05-19
docs-only ADR creation (4 MOD + 1 NEW) per Founder Q-PERS-α α-1
LOCK + Q-PERS-β β-1 + Q-PERS-γ γ-1 + Q-PERS-δ δ-3 + Q-PERS-ε ε-1 +
Q-PERS-ζ ζ-1 + Q-PERS-η η-1 + Q-PERS-θ θ-2 + Q-PERS-ι ι-1 +
Q-PERS-κ κ-1 + Q-PERS-λ λ-1 LOCKS at
`[COSMP-PERSONALIZATION-ORCHESTRATION-QLOCK]` +
`[COSMP-PERSONALIZATION-PERS.1-EXECUTE-VERIFY-AUTH]` register
substantively.

**ADR-0048 Proposed 2026-05-19.** Canonical Foundation/COSMP
personalization-orchestration model lands at canonical-prose
register substantively per Founder directive: the Foundation/COSMP
constructs the governed working set BEFORE the LLM sees context; the
LLM must never decide what memory it is allowed to see; apps compose
UX; Otzar consumes the working set; agents reason over the working
set; permissions/wallet-boundaries/clearance/audit/capsule-state
remain Foundation-owned. Personalization is dynamic (changes by
moment, location, role, task, permission state), permission-aware but
not permission-fragile.

**Substrate sites (5 authorized files; 4 MOD; 1 NEW)**: NEW
`docs/architecture/decisions/0048-personalization-orchestration-substrate.md`
(canonical ADR with RULE 21 Hawkseye research arc + 4-tier permission
matrix + stable/dynamic/ephemeral personalization-capsule taxonomy +
Foundation/API/Otzar/LLM boundary + hybrid buildPersonalizedWorkingSet
API strategy + 5 proposed audit literals + TurboQuant future-research
deferral + privacy-policy implications + 12-row adversarial threat
model TP1-TP12 + 11 Q-PERS sub-decisions + 6-sub-phase Implementation
Lineage) + MOD `docs/reference/section-12-progress.md` (NEW Sub-Arc 3
row IN FLIGHT with PERS.1 LANDED prose) + MOD this
`docs/CURRENT_BUILD_STATE.md` (NEW Sub-Arc 3 H2 + this PERS.1 LANDED
H4) + MOD `docs/architecture/README.md` (NEW ADR-0048 catalog entry
Status Proposed 2026-05-19) + MOD `CLAUDE.md` (NEW ADR-0048 catalog
mirror entry Status Proposed 2026-05-19).

**Substrate-state observations canonical at ADR-0048**: COE
assembleContext (`coe.service.ts:172`) is the LIVE governed 7-step
working-set constructor — the Founder's core principle (LLM does not
decide what it sees) is already implemented; the personalization arc
EXTENDS it. EntityProfile.timezone + name + job_title LIVE
(preferred_name/pronouns/locale GREENFIELD); OrgSettings enterprise
governance defaults LIVE; TwinConfig role+autonomy LIVE;
Permission.conditions JSON consent-extensible; Otzar priming moment-
aware time precedent; degraded-mode app-layer patterns exist (not
Foundation-canonical); CapsuleType personalization taxonomy partially
canonical. Missing GREENFIELD/PARTIAL: moment-context resolver +
4-tier permission envelope + Foundation-tier degraded contract +
cross-context scoped-authorization workflow + high-level
buildPersonalizedWorkingSet API + personalization-signal recording
with provenance.

**Governing RULES at substrate-architectural register substantively**:
RULE 0 (personalization cannot silently expand authority, infer
forbidden context, or cross personal/enterprise DMW boundaries) +
RULE 10 (no deletion semantics) + RULE 11 (Prisma/Ecto boundary; BEAM
locality reuse DMWWorker/WalletCache) + RULE 12 (pre-flight grep
verified COE + EntityProfile + OrgSettings + TwinConfig + Permission +
Otzar priming + CapsuleType at HEAD `03ebcd7`) + RULE 13 (missing
substrate + permission gaps + API bottleneck + cross-context leakage
risk surfaced inline) + RULE 20 (Founder authorization required and
granted) + RULE 21 (Hawkseye research arc embedded; 15+ documented
public sources retrieved 2026-05-19).

**12-row adversarial threat model canonical at ADR-0048** (TP1-TP12;
net verdict: no code-tier vulnerability in existing governed-retrieval
substrate; HIGH-severity TP1 personal→enterprise leak + TP2
enterprise→personal leak + TP3 permission-denied hallucinated context
are about NEW moment-context + degraded + cross-context surfaces
canonicalized PERS.2-PERS.6 before app/UI consumption).

**Forbidden / preserved boundaries enumerated at PERS.1**: no apps/**
/ packages/** / tests/** / scripts/** / schema.prisma / Elixir /
audit.ts / new audit literals / glossary / existing-ADR modifications
(besides ADR-0048 catalog refs); no production-affecting actions; no
database mutations; no real OpenAI calls; no Supabase mutation; no
secret exposure. **Sub-arc 2 remains CLOSED. Phase 3 global status
NOT flipped.**

**PERS.2 permission-envelope + moment-context resolver forward-
substrate next**: permission-envelope resolver + moment-context
resolver (location/calendar/device permissioned; timezone reuse) +
schema disposition for location/device/preferred_name/pronouns/locale
(prefer conditions-JSON + capsule-based; schema delta only if Founder
authorizes). PERS.3 buildPersonalizedWorkingSet API + PERS.4 degraded-
mode contract + PERS.5 synthetic DMW simulation harness (10 scenarios)
+ PERS.6 closure cascade forward-substrate. **No implementation yet** —
PERS.1 is docs-only.

Founder authorization explicit per RULE 20 at
`[COSMP-PERSONALIZATION-ORCHESTRATION-SUBSTRATE-HAWKSEYE]` +
`[COSMP-PERSONALIZATION-ORCHESTRATION-QLOCK]` +
`[COSMP-PERSONALIZATION-PERS.1-EXECUTE-VERIFY-AUTH]`.

#### PERS.2 LANDED — permission-envelope + moment-context resolvers; temporal personalization model implemented (2026-05-19)

**Status:** PERS.2 `[COSMP-PERMISSION-ENVELOPE-MOMENT-CONTEXT]`
substantive service + test phase LANDED 2026-05-19 (5 NEW + 3 MOD;
8 files) per Founder Q-PERS.2-α α-1 + Q-PERS.2-β β-1 + Q-PERS.2-γ γ-1
+ Q-PERS.2-δ δ-1 + Q-PERS.2-ε ε-1 + Q-PERS.2-ζ ζ-1 + Q-PERS.2-η η-1 +
Q-PERS.2-θ θ-1 + Q-PERS.2-ι + Q-PERS.2-κ κ-1 LOCKS at
`[COSMP-PERMISSION-ENVELOPE-MOMENT-CONTEXT-QLOCK]` +
`[COSMP-PERMISSION-ENVELOPE-MOMENT-CONTEXT-EXECUTE-VERIFY-AUTH]`
register substantively.

- **PERS.2 substantive service/test phase LANDED.** First substantive
  code phase of Sub-Arc 3 (PERS.1 was docs-only).
- **ADR-0048 remains Proposed** (PERS.6 closure cascade is the Status-
  flip commit).
- **Sub-Arc 3 remains IN FLIGHT.**
- **Sub-arc 2 remains CLOSED.**
- **PERS.3 buildPersonalizedWorkingSet API next.**
- **No schema changes** per Q-PERS.2-β β-1 LOCK (location/device/
  preferred_name/pronouns/locale all caller-provided optional inputs
  or deferred; zero schema delta — all required substrate already
  exists: EntityProfile.timezone + OrgSettings + Permission.conditions
  + Session + Entity/Wallet types).
- **No audit literals** per Q-PERS.2-η η-1 LOCK (audit-intent metadata
  only).
- **No Elixir changes** per Q-PERS.2-θ θ-1 LOCK.
- **No external provider calls** per Q-PERS.2-δ (resolvers are pure
  deterministic TypeScript; injected `now`; no calendar/location/
  weather/network/production-data access).

**Substrate sites (8 authorized files; 5 NEW + 3 MOD)**: NEW
`apps/api/src/services/personalization/temporal-personalization.ts`
(Q-PERS.2-ε temporal personalization model — 5 classes REAL_TIME +
REPEATED_PATTERN + STABLE_IDENTITY + CONTEXTUAL_PREFERENCE +
SENSITIVE_ENRICHMENT; each defines freshness behavior + defaultTtlSeconds
+ defaultPermissionTier + conflictUpdatePosture + oneOffCanUpdateDurable
Memory + uncertaintyDisclosureRequiredWhenAbsent; frozen TEMPORAL_POLICIES;
consistent-yet-dynamic doctrine — real-time updates fast, repeated
patterns stable unless repeated contrary change, stable identity no
thrash from one-off, contextual preference context-scoped, sensitive
enrichment scoped+permissioned) + NEW
`apps/api/src/services/personalization/permission-envelope.service.ts`
(Q-PERS.2-γ resolvePermissionEnvelope; 4-tier mapping required /
accuracy_enhancing / optional_enrichment / denied_or_unavailable;
personal/enterprise discrimination; OrgSettings dept_data_isolation
enterprise defaults; Permission.conditions-style ScopedGrant
authorization; cross_wallet_blocked + cross_context_blocked guards — no
silent bridging; fail-closed unknown_context_key; machine-readable
EnvelopeReason; audit-intent metadata only) + NEW
`apps/api/src/services/personalization/moment-context.service.ts`
(Q-PERS.2-δ + ζ resolveMomentContext; injected now; timezone precedence
caller_input > entity_profile > session > SAFE_FALLBACK_TIMEZONE clearly
marked fallback+uncertain; Intl local-time derivation; permissioned-
optional location/calendar/device/active_app; current_task caller-
context represented-not-persisted; per-field TTL/freshness; typed
MomentDegradedReason; no hallucinated specificity; no external provider
calls) + MOD `apps/api/src/index.ts` (barrel re-exports for the 3 NEW
modules) + NEW `tests/unit/permission-envelope.test.ts` + NEW
`tests/unit/moment-context.test.ts` + MOD this CURRENT_BUILD_STATE
(this PERS.2 LANDED H4) + MOD section-12-progress (PERS.2 LANDED prose).

**PERS.2 baseline deltas**: TS=12 baseline preserved (zero new TS
errors); no-console 1/1 preserved; unit 566 → 566+N (N NEW
personalization tests); integration 213+1 skipped preserved; mix
compile clean; Elixir cosmp_router 223+1 skipped + dbgi_supervisor
67/0/19 preserved.

**Critical coherence preserved at PERS.2**: ADR-0048 Status preserved
Proposed 2026-05-19; Sub-Arc 3 IN FLIGHT; Sub-arc 2 CLOSED; no
schema.prisma; no package.json/lockfiles; no audit.ts + no new audit
literals; no Elixir; no DB migrations; no real DB mutation; no
buildPersonalizedWorkingSet endpoint (PERS.3 deferred); no synthetic
DMW harness (PERS.5 deferred); no app/Otzar UX; no README/CLAUDE/
glossary/existing-ADR changes (minimum-touch; catalogs refresh at
PERS.6 closure); no production-affecting actions; no external provider
integrations; no secret exposure.

**PERS.3 buildPersonalizedWorkingSet API forward-substrate next**:
high-level orchestrator composing COE assembleContext +
resolveMomentContext + resolvePermissionEnvelope in one round trip +
COSMP primitives + caching (DMWWorker/WalletCache/priming-TTL
precedent). PERS.4 degraded-mode contract + PERS.5 synthetic DMW
simulation harness (10 scenarios) + PERS.6 closure cascade forward-
substrate.

Founder authorization explicit per RULE 20 at
`[COSMP-PERMISSION-ENVELOPE-MOMENT-CONTEXT-QLOCK]` +
`[COSMP-PERMISSION-ENVELOPE-MOMENT-CONTEXT-EXECUTE-VERIFY-AUTH]`.

#### PERS.3 LANDED — buildPersonalizedWorkingSet service-level orchestrator composes permission envelope + moment context + COE (2026-05-19)

**Status:** PERS.3 `[COSMP-BUILD-WORKING-SET-API]` substantive service +
test phase LANDED 2026-05-19 (2 NEW + 3 MOD; 5 files, under the
Q-PERS.3-κ κ-1 ≤8-file ceiling) per Founder Q-PERS.3-α α-1 + Q-PERS.3-β
β-1 + Q-PERS.3-γ γ-1 + Q-PERS.3-δ δ-1 + Q-PERS.3-ε ε-1 + Q-PERS.3-ζ ζ-1
+ Q-PERS.3-η η-1 + Q-PERS.3-θ θ-1 + Q-PERS.3-ι ι-1 + Q-PERS.3-κ κ-1 +
Q-PERS.3-λ LOCKS at `[COSMP-BUILD-WORKING-SET-API-HAWKSEYE-QLOCK]` +
`[COSMP-BUILD-WORKING-SET-API-EXECUTE-VERIFY-AUTH]`.

- **PERS.3 service-level orchestrator LANDED.** `WorkingSetService.
  buildPersonalizedWorkingSet` composes the proven governed substrate in
  one high-level call: authoritative session→wallet resolution (injected
  `SessionContextResolver`) → domain READ from the established
  `wallet_type` (ENTERPRISE→enterprise, else personal; DEVICE→personal) →
  `resolvePermissionEnvelope` (PERS.2) → `resolveMomentContext` (PERS.2,
  injected `now`) → WRAP COE `assembleContext` (injected `ContextAssembler`
  seam) → compose the governed working set. The Foundation constructs the
  working set BEFORE the LLM sees context.
- **WRAP, not mutate, COE** per β-1 — `assembleContext` is consumed via a
  structural seam; `coe.service.ts` is untouched.
- **Fail-closed with zero personalization leakage** — an invalid/expired
  session, a missing wallet, or a COE failure returns only `ok/code/
  message` (no moment, no permissions, no capsules).
- **ADR-0048 remains Proposed** (PERS.6 closure cascade is the Status-flip
  commit).
- **Sub-Arc 3 remains IN FLIGHT.**
- **Sub-arc 2 remains CLOSED.**
- **PERS.4 `[COSMP-DEGRADED-MODE-CONTRACT]` degraded-mode contract next.**
- **Route/server wiring deferred** per γ-1 (service lands defined-but-
  unwired; production wiring at PERS.4).
- **Synthetic DMW simulation deferred to PERS.5.**
- **No COE mutation** (β-1; `coe.service.ts` + `keywords.ts` untouched).
- **No schema changes.**
- **No audit literals** per ε-1 (the wrapped `assembleContext` emits
  `COE_ASSEMBLE_CONTEXT`; the orchestrator returns `audit_intent` metadata
  only).
- **No Elixir changes.**
- **No external provider calls** (composition is deterministic; injected
  `now`; no DB access in the orchestrator — the injected resolver owns the
  authoritative lookup).

**Substrate sites (5 authorized files; 2 NEW + 3 MOD)**: NEW
`apps/api/src/services/personalization/working-set.service.ts`
(`WorkingSetService` + `buildPersonalizedWorkingSet` + `SessionContextResolver`
/ `ContextAssembler` injection seams + `WorkingSetInput` / `WorkingSetSuccess`
/ `WorkingSetFailure` / `WorkingSetPermissionSummary` / `WorkingSetDegradedEntry`
/ `WorkingSetStats` types + `domainForWalletType`) + NEW
`tests/unit/working-set.test.ts` (personal/enterprise/DEVICE domain
derivation + fail-closed no-leakage on session/wallet/COE failure +
cross_wallet_blocked + cross_context_blocked + moment degraded surfaced +
per-field TTL/freshness + deterministic injected `now` + no raw vector/
distance/embedding fields + audit_intent-without-literal) + MOD
`apps/api/src/index.ts` (barrel re-export for `WorkingSetService` + types
only) + MOD `docs/reference/section-12-progress.md` (PERS.3 LANDED prose;
Sub-Arc 3 preserved IN FLIGHT) + MOD this `CURRENT_BUILD_STATE.md` (this
PERS.3 LANDED H4).

Founder authorization explicit per RULE 20 at
`[COSMP-BUILD-WORKING-SET-API-HAWKSEYE-QLOCK]` +
`[COSMP-BUILD-WORKING-SET-API-EXECUTE-VERIFY-AUTH]`.

#### PERS.4 LANDED — degraded-mode truth contract integrated into working-set response (2026-05-19)

**Status:** PERS.4 `[COSMP-DEGRADED-MODE-CONTRACT]` substantive contract +
integration + test phase LANDED 2026-05-19 (2 NEW + 5 MOD; 7 files, under
the Q-PERS.4-ι ι-2 ≤8-file ceiling) per Founder Q-PERS.4-α α-2 + Q-PERS.4-β
β-1 + Q-PERS.4-γ γ-1 + Q-PERS.4-δ δ-1 + Q-PERS.4-ε ε-1 + Q-PERS.4-ζ ζ-1 +
Q-PERS.4-η η-1 + Q-PERS.4-θ θ-1 + Q-PERS.4-ι ι-2 + Q-PERS.4-κ + Q-PERS.4-λ
λ-1 LOCKS at `[COSMP-DEGRADED-MODE-CONTRACT-HAWKSEYE-QLOCK]` +
`[COSMP-DEGRADED-MODE-CONTRACT-EXECUTE-VERIFY-AUTH]`.

- **PERS.4 degraded-mode contract LANDED.** A new
  `degraded-mode-contract.ts` canonicalizes one degraded/uncertainty
  taxonomy (13 `DegradedReason` values), a per-reason `DISCLOSURE_POLICY`
  use policy (disposition + may_use_as_truth + must_disclose_uncertainty +
  may_request_permission + must_not_fabricate), the frozen
  `CONSUMER_OBLIGATIONS`, and pure normalization
  (`buildDegradedContract` / `mapEnvelopeReason` / `mapMomentReason` /
  `disclosurePolicyFor` / `classifyFailClosed`). `WorkingSetService` now
  carries the canonical contract (`degraded: DegradedContractEntry[]`) plus
  `consumer_obligations` in its response.
- **The Foundation now truthfully discloses context state** — denied /
  missing / fallback / uncertain / blocked / sensitive — so consumers
  cannot misuse it. Timezone fallback surfaces `fallback_used`
  (`fallback_not_truth`); low-confidence fields surface `uncertain`; the COE
  aggregate denial surfaces a single `clearance_blocked` entry.
- **ADR-0048 remains Proposed** (PERS.6 closure cascade is the Status-flip
  commit).
- **Sub-Arc 3 remains IN FLIGHT.**
- **Sub-arc 2 remains CLOSED.**
- **PERS.5 `[COSMP-SYNTHETIC-DMW-SIMULATION]` synthetic DMW simulation
  next.**
- **Route/server wiring deferred to PERS.5** per δ-1 (the simulation harness
  exercises the full path; production `SessionContextResolver` + route land
  there).
- **Audit literals deferred** per ε-1 (`WORKING_SET_BUILT` /
  `PERSONALIZATION_DEGRADED` remain ADR-0048 forward-substrate; the
  contract carries advisory metadata only).
- **`stale` is defined but NOT emitted at PERS.4** — caller moment inputs
  are fresh in-request with no as-of timestamp; emitting `stale` would be a
  false claim. Emission is forward-substrate for a freshness clock /
  ADR-0045 capsule-staleness integration.
- **Consumer obligations are DECLARED but not enforced in-process** —
  downstream enforcement is app/agent + future integration-test
  responsibility; the Foundation's PERS.4 duty is truthful disclosure.
- **Audience & disclosure tiers (Founder doctrine)** — the contract is
  MACHINE-FACING + FOUNDATION-FACING BY DEFAULT, not a render target for
  end users. Agents + Foundation services consume the full machine-readable
  truth contract (so they do not hallucinate / over-personalize / misuse
  missing/denied/stale/fallback context); Foundation / Federation
  administrators get deeper diagnostic + audit views; future self-repair
  agents use the signals to diagnose, propose safe repairs, and build an
  audit trail. End-user consumers (apps/Otzar) should surface only
  graceful, experience-level uncertainty — and only when it improves trust
  or actionability — never raw degraded reasons, Memory Capsule
  diagnostics, resolver failure details, capsule-denial counts, or repair
  telemetry. Translating the contract into a user-appropriate experience is
  an app/UX-layer responsibility (ADR-0048 "apps compose UX"); PERS.4 adds
  this as doctrine only — no behavior change.
- **No schema changes.**
- **No audit literals.**
- **No Elixir changes.**
- **No external provider calls** (the contract is pure deterministic
  TypeScript; no I/O; no DB access; no `Date.now()`).
- **No COE mutation / no route / no `server.ts`** (β-1 + δ-1;
  `coe.service.ts`, `keywords.ts`, and `cosmp/**` untouched).

**Substrate sites (7 authorized files; 2 NEW + 5 MOD)**: NEW
`apps/api/src/services/personalization/degraded-mode-contract.ts` + NEW
`tests/unit/degraded-mode-contract.test.ts` + MOD
`apps/api/src/services/personalization/working-set.service.ts` (consume the
contract; replace `WorkingSetDegradedEntry` with `DegradedContractEntry`;
add `consumer_obligations`) + MOD `tests/unit/working-set.test.ts` (assert
the canonical contract + obligations + fallback/uncertain/sensitive/
clearance entries + fail-closed no-leakage) + MOD `apps/api/src/index.ts`
(export the contract surface; drop `WorkingSetDegradedEntry`) + MOD
`docs/reference/section-12-progress.md` (PERS.4 LANDED prose; Sub-Arc 3
preserved IN FLIGHT) + MOD this `CURRENT_BUILD_STATE.md` (this PERS.4
LANDED H4).

Founder authorization explicit per RULE 20 at
`[COSMP-DEGRADED-MODE-CONTRACT-HAWKSEYE-QLOCK]` +
`[COSMP-DEGRADED-MODE-CONTRACT-EXECUTE-VERIFY-AUTH]`.

#### PERS.5a LANDED — SessionContextResolver + consumer/admin working-set projections (2026-05-20)

**Status:** PERS.5a `[COSMP-SYNTHETIC-DMW-VIEWS]` substantive service + test
phase LANDED 2026-05-20 (2 NEW source + 2 NEW tests + 3 MOD; 7 files —
Q-PERS.5-κ 5a ceiling ≤6 → ≤7 per RULE 13 because two new tested modules
require proper per-module testing) — the first sub-phase of the PERS.5
3-sub-phase mini-arc (PERS.5a views + PERS.5b simulation + PERS.5c closure)
per Founder Q-PERS.5-α α-1 + the Q-PERS.5a-α through ζ LOCKS at
`[COSMP-SYNTHETIC-DMW-SIMULATION-HAWKSEYE-QLOCK]` +
`[COSMP-SYNTHETIC-DMW-VIEWS-EXECUTE-VERIFY-AUTH]`.

- **Production SessionContextResolver service-layer implementation LANDED**
  per Q-PERS.5-δ δ-1. `createSessionContextResolver(authService, lookup)` is
  pure coordination over an injected `SessionValidator` (the live AuthService
  satisfies it) + a `WalletContextLookup` storage seam: validate session
  (fail-closed with the session code) → resolve the established wallet
  (fail-closed `INVALID_REQUEST` when absent) → entity type → profile
  timezone → authoritative `{entity_id, wallet_id, wallet_type, entity_type,
  timezone}`. The `prismaWalletContextLookup(prisma)` factory is the real
  storage seam — **integration-exercised at PERS.5b**, not unit-tested at 5a.
- **projectConsumerView / projectAdminView LANDED** per Q-PERS.5-γ γ-1.
  `projectAdminView` = full machine truth (`{view:"admin"} & Omit<
  WorkingSetSuccess,"ok">`). `projectConsumerView` = an allow-listed graceful
  subset (`view`, `domain`, `current_time_iso`, `timezone_uncertain`,
  `capsules`, `has_uncertainty`, `has_withheld_context`,
  `may_request_permission`).
- **Consumer view strips raw Foundation diagnostics by default** — no
  degraded reasons, dispositions, advisories, stats, audit_intent,
  consumer_obligations, permission summary, or moment-field internals; the
  coarse flags are derived from the degraded contract's dispositions. The
  consumer view is a strict subset that never adds data.
- **Admin view preserves machine truth** — agents / Foundation services /
  administrators receive the full working set incl. the degraded contract.
- **Route/server wiring deferred** per Q-PERS.5-δ (no route, no `server.ts`
  at 5a).
- **PERS.5b synthetic lifelike multi-day DMW simulation next** — 5 employees
  (realistic personal lives, routines, work preferences, calendar
  constraints, communication styles, project roles, hierarchy, clearance,
  departments, ABAC) + 5 digital twins + 1 enterprise DMW + 1 project
  source-of-truth (+ optional enterprise/project AI twin), proving all 8
  governance obligations across ~10 scenarios; integration-tier; carries the
  production resolver real-path verification + the two-view proof.
- **No schema changes.**
- **No audit literals.**
- **No Elixir changes.**
- **No external provider calls** (resolver reads only through the injected
  lookup; views are pure; no `Date.now()`).
- **No production-affecting action.**

**Substrate sites (7 authorized files; 2 NEW source + 2 NEW tests + 3 MOD)**:
NEW `apps/api/src/services/personalization/session-context-resolver.ts` +
NEW `apps/api/src/services/personalization/working-set-views.ts` + NEW
`tests/unit/session-context-resolver.test.ts` + NEW
`tests/unit/working-set-views.test.ts` + MOD `apps/api/src/index.ts` (barrel
re-export) + MOD `docs/reference/section-12-progress.md` (PERS.5a prose;
Sub-Arc 3 preserved IN FLIGHT) + MOD this `CURRENT_BUILD_STATE.md` (this
PERS.5a H4).

Founder authorization explicit per RULE 20 at
`[COSMP-SYNTHETIC-DMW-SIMULATION-HAWKSEYE-QLOCK]` +
`[COSMP-SYNTHETIC-DMW-VIEWS-EXECUTE-VERIFY-AUTH]`.

#### PERS.5b LANDED — lifelike multi-DMW simulation proving all 8 governance obligations (2026-05-20)

**Status:** PERS.5b `[COSMP-SYNTHETIC-DMW-SIMULATION]` substantive
integration-harness phase LANDED 2026-05-20 (2 NEW + 2 MOD; 4 files, under
the Q-PERS.5b-μ μ-2 ≤7 ceiling) — the second sub-phase of the PERS.5
3-sub-phase mini-arc — per Founder Q-PERS.5b-α α-1 + β-1 + γ-1 + δ-1 + ε-1 +
ζ-1 + η-1 + θ-1 + ι-1 + κ-1 + λ-1 + μ-2 + ν LOCKS at
`[COSMP-SYNTHETIC-DMW-SIMULATION-HAWKSEYE-QLOCK]` +
`[COSMP-SYNTHETIC-DMW-SIMULATION-EXECUTE-VERIFY-AUTH]`.

- **Lifelike multi-DMW world LANDED.** A new
  `tests/integration/helpers/synthetic-dmw-world.ts` seeds — via the REAL
  Foundation paths (createEntity → wallet/TAR, WriteService.createCapsule,
  createPermission, EntityMembership, AuthService.login) — 1 COMPANY
  enterprise DMW + its project source-of-truth, 5 distinct PERSON employees
  (Dana Okafor / Liang Wei / Priya Nair / Marco Rossi / Sara Haddad, each
  with role / department / hierarchy / clearance / routine / work style /
  comms style + personal-DMW capsules), and 5 login-capable AI_AGENT digital
  twins (PERSONAL wallets + operating memory + an authorized portable
  goal-summary alignment capsule; never the sensitive capsule).
- **All 8 governance obligations proven** by `synthetic-dmw-simulation.test.ts`
  across S1–S10 driving the real working-set spine (login → session →
  prismaWalletContextLookup → createSessionContextResolver →
  buildPersonalizedWorkingSet) + the NEGOTIATE permission path + the
  consumer/admin two-view projection.
- **Single-wallet working set is the spine; `coe.service.ts` UNTOUCHED.**
  Obligations 1–2 (no leakage) are proven structurally (the working set
  resolves only the session entity's wallet); obligation 4 (accepted = SoT)
  via the enterprise-entity working set; obligation 5 (twin scoped alignment)
  via a fixture-materialized authorized scoped-summary in the twin wallet +
  a SUMMARY-scope NEGOTIATE for the grant path.
- **Accepted→source-of-truth is fixture-modeled** (`promoteAcceptedDecision`
  writes only the accepted DECISION into the enterprise wallet; the
  un-accepted conversation stays in a personal wallet and is never promoted)
  — no schema change (δ-1).
- **Twin portability proven read-side + fixture discipline** (ε-1): twin
  wallets hold only portable `clearance_required=0` capsules + the authorized
  goal summary; the sensitive enterprise capsule (`clearance_required=6` +
  `ai_access_blocked`) is never written to any twin/personal wallet, and a
  twin NEGOTIATE of it is denied.
- **Pre-flight RULE 13 findings (test-only; no production code changed):**
  createTwin produces password-less twins → twins seeded login-capable via
  createEntity + manual EntityMembership/TwinConfig; TAR.clearance_ceiling
  (= defaultCeilingFor(type)) mutated via computeTARHash before login for
  per-employee session clearance; capsule content written via
  WriteService.createCapsule so the working set returns it.
- **ADR-0048 remains Proposed.**
- **Sub-Arc 3 remains IN FLIGHT.**
- **Sub-arc 2 remains CLOSED.**
- **PERS.5c `[COSMP-SYNTHETIC-DMW-CLOSURE]` closure cascade next** (docs-only);
  then PERS.6 closure cascade.
- **No schema / no audit literals / no Elixir / no server.ts / no routes / no
  cosmp service mutation** (ζ-1 + ν; tests + docs only).
- **No production-affecting action** (real DB is the test database;
  TEST_PREFIX-namespaced; cleanupTestData in afterAll).

**Substrate sites (4 authorized files; 2 NEW + 2 MOD)**: NEW
`tests/integration/helpers/synthetic-dmw-world.ts` + NEW
`tests/integration/synthetic-dmw-simulation.test.ts` + MOD
`docs/reference/section-12-progress.md` (PERS.5b prose; Sub-Arc 3 preserved
IN FLIGHT) + MOD this `CURRENT_BUILD_STATE.md` (this PERS.5b LANDED H4).

Founder authorization explicit per RULE 20 at
`[COSMP-SYNTHETIC-DMW-SIMULATION-HAWKSEYE-QLOCK]` +
`[COSMP-SYNTHETIC-DMW-SIMULATION-EXECUTE-VERIFY-AUTH]`.

#### PERS.5c CLOSED — synthetic DMW simulation mini-arc closed; PERS.6 closure cascade next (2026-05-20)

**Status:** PERS.5c `[COSMP-SYNTHETIC-DMW-CLOSURE]` docs-only closure cascade
LANDED 2026-05-20 (2 tracker MOD) per Founder Q-PERS.5c-α α-1 + β-1 + γ-1 +
δ-1 + ε-1 + ζ-1 + η-1 + θ-1 + ι-1 + κ-1 LOCKS at
`[COSMP-SYNTHETIC-DMW-CLOSURE-QLOCK-EXECUTE-VERIFY-AUTH]`.

- **PERS.5 mini-arc CLOSED.** The PERS.5 3-sub-phase mini-arc (5a views +
  5b simulation + 5c closure) is closed at the mini-arc register.
- **PERS.5a landed `d28f20f`** — production `SessionContextResolver`
  (`createSessionContextResolver` + `prismaWalletContextLookup`) +
  `projectConsumerView`/`projectAdminView` consumer/admin projection split.
- **PERS.5b landed `27db2e2`** — lifelike multi-day synthetic DMW simulation
  (5 employees + 5 digital twins + 1 enterprise DMW + project
  source-of-truth; accepted→SoT fixture convention; scoped-summary +
  SUMMARY-scope NEGOTIATE alignment; single-wallet spine; all 8 obligations
  proven across S1–S10; full CI success at run `26160755203`).
- **PERS.5c is docs-only closure** (this update; the two trackers only).
- **ADR-0048 remains Proposed** 2026-05-19.
- **Phase 3 Sub-Arc 3 remains IN FLIGHT.**
- **PERS.6 closure cascade next** — the final ADR-0048-acceptance / Sub-Arc-3
  closure cascade.
- **Single-wallet spine preserved; `coe.service.ts` untouched** across
  PERS.5a + PERS.5b + PERS.5c.
- **No schema changes.**
- **No audit literals.**
- **No Elixir changes.**
- **No route/server changes.**
- **No provider/external API changes.**
- **No production-affecting action.**

Founder authorization explicit per RULE 20 at
`[COSMP-SYNTHETIC-DMW-CLOSURE-QLOCK-EXECUTE-VERIFY-AUTH]`.

#### PERS.6 CLOSED — ADR-0048 Accepted; Phase 3 Sub-Arc 3 CLOSED; Phase 3 global closure deferred (2026-05-20)

**Status:** PERS.6 `[COSMP-PERSONALIZATION-CLOSURE]` final closure cascade
LANDED 2026-05-20 (docs-only; 5 MOD) per Founder Q-PERS.6-α α-1 + β-1 + γ-1 +
δ-1 + ε-1 + ζ-1 + η-1 + θ-2 LOCKS at
`[COSMP-PERSONALIZATION-CLOSURE-HAWKSEYE-QLOCK]` +
`[COSMP-PERSONALIZATION-CLOSURE-EXECUTE-VERIFY-AUTH]`.

- **PERS.6 docs-only closure.** Final closure cascade for ADR-0048 + Phase 3
  Sub-Arc 3 (the Personalization-Orchestration Substrate).
- **ADR-0048 Status flipped Proposed 2026-05-19 → Accepted 2026-05-20** (RULE
  20 Founder authorization explicit at this closure; ADR-0048 §Status +
  §Post-Closure Implementation Lineage + §Founder Authorization PERS.6
  addendum updated).
- **Phase 3 Sub-Arc 3 CLOSED.**
- **PERS mini-arc lineage:** PERS.1 `ce3a6a5` + PERS.2 `2fe7bfb` + PERS.3
  `8c16c14` + PERS.4 `d0980ce` + PERS.5a `d28f20f` + PERS.5b `27db2e2` +
  PERS.5c `8ad41fe` + PERS.6 this commit.
- **Sub-arc 2 CLOSED preserved.**
- **All Phase 3 sub-arcs are now CLOSED** (Sub-Arc 1 a/b/c/d + Sub-Arc 2 +
  Gaps 4/5/6 + Sub-Arc 3).
- **Phase 3 global status NOT flipped** per Q-PERS.6-δ δ-1 — the global-closure
  prerequisite is met, but Phase 3 global closure requires a **separate
  explicit Founder QLOCK**.
- **Audit literals deferred forward-substrate** (the 5 proposed literals are
  not implemented at closure; per Q-PERS.6-ε ε-1).
- **No ADR-0035 promotion** per Q-PERS.6-ζ ζ-1.
- **Single-wallet spine preserved; `coe.service.ts` untouched.**
- **No schema / audit / Elixir / route / server / provider changes.**
- **No production-affecting action.**

**Substrate sites (5 MOD docs-only)**: MOD
`docs/architecture/decisions/0048-personalization-orchestration-substrate.md`
(Status flip + Post-Closure Implementation Lineage reconciliation per RULE 13
+ Founder Authorization PERS.6 addendum + Sub-Arc 3 CLOSED note) + MOD
`docs/reference/section-12-progress.md` (Sub-Arc 3 row IN FLIGHT → CLOSED +
closure prose) + MOD this `CURRENT_BUILD_STATE.md` (this PERS.6 CLOSED H4) +
MOD `docs/architecture/README.md` (ADR-0048 catalog status-sync) + MOD
`CLAUDE.md` (ADR-0048 §5 catalog status-sync only; RULE 20 Founder-authorized;
no RULE touched).

Founder authorization explicit per RULE 20 at
`[COSMP-PERSONALIZATION-CLOSURE-HAWKSEYE-QLOCK]` +
`[COSMP-PERSONALIZATION-CLOSURE-EXECUTE-VERIFY-AUTH]`.

#### Phase 3 GLOBAL CLOSED — Dynamic Memory Accuracy at Scale; all sub-arcs CLOSED; deferred items carried forward (2026-05-20)

**Status:** Phase 3 (Dynamic Memory Accuracy at Scale) is **GLOBALLY CLOSED**
2026-05-20 at `[PHASE-3-GLOBAL-CLOSURE]` (tracker-docs-only; 2 MOD) per Founder
Q-P3C-α α-1 + β-1 + γ-1 + δ-1 + ε-1 + ζ-1 + η-1 LOCKS at
`[PHASE-3-GLOBAL-CLOSURE-EXECUTE-VERIFY-AUTH]`. **This is the separate Founder
QLOCK contemplated at PERS.6-δ** — the PERS.6 closure deliberately did NOT flip
Phase 3 global status; this performs it.

- **All Phase 3 sub-arcs CLOSED:**
  - Sub-Arc 1 — Sub-Phase a DMW Worker (ADR-0038) + Sub-Phase b Hive-Scale
    Per-DMW Dispatch ENTERPRISE (ADR-0039) + Sub-Phase c PERSONAL
    Promote-on-Activity (ADR-0039 Amendment 1) + Sub-Phase d DEVICE Cold-Shard
    (ADR-0040).
  - Sub-Arc 2 — Capsule Layer Substrate Umbrella (ADR-0041), **including Gap 1
    Capsule Mutation Discrimination (ADR-0042) and Gap 3 pgvector Embedding
    (ADR-0043) — both CLOSED under the Sub-Arc 2 umbrella with no dedicated
    status rows** — + Gap 4 Decay Execution (ADR-0044) + Gap 5 Capsule-Level
    Staleness (ADR-0045) + Gap 6 AI_AGENT EntityType-Discriminated Capsule
    Routing (ADR-0046).
  - Sub-Arc 3 — Foundation/COSMP Personalization-Orchestration Substrate
    (ADR-0048, Accepted 2026-05-20).
  - All per-gap + per-sub-arc ADRs (0038/0039/0040/0041/0042/0043/0044/0045/0046/0048)
    Accepted/CLOSED.
- **Carried forward as post-closure forward-substrate (explicitly NOT
  blockers):**
  - ADR-0044 dormant TTL / DecayType future amendments
  - ADR-0045 dormant filtering / ranking / lifecycle / audit-literal expansion /
    COE / SimilarityService / read.service / feedback.service integration
  - ADR-0046 G6.3 `resolveAiAgentWalletContext` helper (deferred; absent in code)
  - ADR-0048 five audit literals (`WORKING_SET_BUILT` +
    `CONTEXT_USED_MANIFEST_RECORDED` + `PERSONALIZATION_DEGRADED` +
    `CROSS_ENTITY_CONTEXT_REQUESTED` + `PERSONALIZATION_SIGNAL_RECORDED`;
    future clean-transition)
  - ADR-0048 route/server wiring for the working-set endpoint
  - ADR-0048 personalization signal recording
  - ADR-0048 caching / performance optimization (measure-first)
  - ADR-0048 TurboQuant research arc
  - ADR-0048 self-repair feedback loop
  - ADR-0048 stale emission / ADR-0045 freshness-clock integration
  - ADR-0048 privacy-policy implications
- **Audit literals = future clean-transition** (deferred; not implemented; the 5
  literals remain absent from `audit.ts`).
- **No ADR-0035 promotion** per Q-P3C-ε ε-1.
- **Tracker-docs-only**: this `CURRENT_BUILD_STATE.md` H4 + the
  `section-12-progress.md` Phase 3 GLOBAL CLOSURE row. The PERS.6 "global status
  NOT flipped" prose + the ADR-0048 / README / CLAUDE.md catalog "NOT flipped"
  notes are preserved as historical PERS.6 context and superseded by these
  markers; **no ADR / README / CLAUDE.md edit**.
- **Single-wallet spine preserved; `coe.service.ts` untouched.**
- **No schema / audit / Elixir / route / server / provider changes.**
- **No production-affecting action.**
- **Recommended next strategic arc (Founder-gated; not scheduled):**
  audit-literal clean-transition phase, then working-set API exposure.

Founder authorization explicit at `[PHASE-3-GLOBAL-CLOSURE-HAWKSEYE-QLOCK]` +
`[PHASE-3-GLOBAL-CLOSURE-EXECUTE-VERIFY-AUTH]`.

#### AUDIT.1 LANDED — 5 personalization audit literals defined (emission deferred to AUDIT.2) (2026-05-20)

**Status:** AUDIT.1 `[PERSONALIZATION-AUDIT-LITERAL-CLEAN-TRANSITION]`
define-only landing (2 code/test + 2 tracker MOD) per Founder Q-AUDIT-α α-2 +
β-1 + γ (no emission) + δ-1 + ε-1 + ζ-1 LOCKS at
`[PERSONALIZATION-AUDIT-LITERAL-CLEAN-TRANSITION-EXECUTE-VERIFY-AUTH]`. This is
**arc 1** of the two Founder-gated post-Phase-3-closure arcs.

- **5 personalization audit literals are now DEFINED** in
  `packages/database/src/queries/audit.ts` (per ADR-0048 §Audit-Literal
  Proposals / Q-PERS-θ θ-2; both the `AuditEventType` union and
  `AUDIT_EVENT_TYPE_VALUES`, satisfies guard preserved, append-only per
  ADR-0042 §Q-γ.1; 41 → 46 literals): `WORKING_SET_BUILT`,
  `CONTEXT_USED_MANIFEST_RECORDED`, `PERSONALIZATION_DEGRADED`,
  `CROSS_ENTITY_CONTEXT_REQUESTED`, `PERSONALIZATION_SIGNAL_RECORDED`.
- **Emissions remain deferred to AUDIT.2** — define-only; no `writeAuditEvent`
  emitter added; `WorkingSetService` / `SessionContextResolver` /
  permission-envelope / moment-context / temporal-personalization /
  degraded-mode / COE / read / write / negotiate all UNTOUCHED.
  - `WORKING_SET_BUILT` + `PERSONALIZATION_DEGRADED` → emit at **arc 2
    (working-set API exposure)**, the orchestrator's first production caller.
  - `CONTEXT_USED_MANIFEST_RECORDED` + `CROSS_ENTITY_CONTEXT_REQUESTED` +
    `PERSONALIZATION_SIGNAL_RECORDED` → emit with their future production flows
    (greenfield per ADR-0048 §missing).
- **Safe-metadata contract documented**: counts + outcome/domain/reason/
  provenance classes only.
- **Forbidden-metadata contract documented**: no raw capsule content / memory
  text / vectors / embeddings / distance / cosine / raw query / private content
  / cross-wallet leakage / precise location / consumer-facing diagnostics;
  preserve the consumer/admin view split + the single-wallet spine.
- **No schema / migration** (`event_type` is `String`); **no Elixir mirroring**
  (API-tier literal, per the `CAPSULE_SIMILARITY_SEARCH` precedent); **no ADR
  edit** (ADR-0048 §Audit-Literal Proposals preserved as the proposal record);
  no `coe.service.ts`; no `working-set.service.ts`; no route/server.
- **No production-affecting action** (vocabulary-only; no emission, no behavior
  change).
- **Next Founder-gated arc after AUDIT.1 = working-set API exposure** (arc 2;
  carries AUDIT.2 emission for `WORKING_SET_BUILT` + `PERSONALIZATION_DEGRADED`).
  **GOVSEC / government-grade hardening remains later and must NOT be started
  now.**

**Substrate sites (4 MOD)**: MOD `packages/database/src/queries/audit.ts` (5
literals + per-literal safe/forbidden-metadata contract comments) + MOD
`tests/unit/audit.test.ts` (presence + `isKnownAuditEventType` + no-duplicates)
+ MOD `docs/reference/section-12-progress.md` (AUDIT.1 row) + MOD this
`CURRENT_BUILD_STATE.md` (this AUDIT.1 H4).

Founder authorization explicit at
`[PERSONALIZATION-AUDIT-LITERAL-CLEAN-TRANSITION-HAWKSEYE-QLOCK]` +
`[PERSONALIZATION-AUDIT-LITERAL-CLEAN-TRANSITION-EXECUTE-VERIFY-AUTH]`.

#### WSAPI LANDED — working-set API exposure (consumer route + AUDIT.2 route-layer emission) (2026-05-20)

**Status:** WSAPI `[WORKING-SET-API-EXPOSURE]` landing (2 NEW + 3 MOD; 6
files) per Founder Q-WSAPI-α α-1 + β-3 + γ-1 + δ-2 + ε-1 + ζ-3 + η-1 LOCKS at
`[WORKING-SET-API-EXPOSURE-EXECUTE-VERIFY-AUTH]`. **arc 2** of the
post-Phase-3 sequence (follows AUDIT.1; GOVSEC later — NOT started).

- **Consumer-safe production route LANDED**: `POST
  /api/v1/personalization/working-set` (NEW
  `apps/api/src/routes/working-set.routes.ts`). bearer →
  `authService.validateSession` (audit actor context only) →
  `workingSetService.buildPersonalizedWorkingSet` → returns
  **`projectConsumerView` only**. `projectAdminView` is NOT invoked; the raw
  `WorkingSetSuccess` is never returned.
- **server.ts wiring**: constructs `WorkingSetService(createSessionContextResolver(
  authService, prismaWalletContextLookup(prisma)), coeService)` (the production
  resolver + COE assembleContext seam) + `registerWorkingSetRoutes(app,
  workingSetService, authService)`; barrel re-exports `registerWorkingSetRoutes`.
- **AUDIT.2 route-layer emission** (γ-1; `WorkingSetService` stays PURE — 0
  `writeAuditEvent`): `WORKING_SET_BUILT` on every success (safe counts +
  `domain` only); `PERSONALIZATION_DEGRADED` only when `degraded.length > 0`
  (reason-class histogram + counts only). Both awaited **before** the response
  per RULE 4 (audit-failure fails the request).
- **Fail-closed**: missing/invalid/expired session or service failure →
  route-style failure response, **no personalization audit literal, no
  payload**.
- **The other 3 literals remain defined-not-emitted** (future-substrate):
  `CONTEXT_USED_MANIFEST_RECORDED`, `CROSS_ENTITY_CONTEXT_REQUESTED`,
  `PERSONALIZATION_SIGNAL_RECORDED`.
- **`now` is server-set** (client-supplied `now` never trusted).
- **Gateway**: no rate-limit entry added — the peer COE retrieval route
  (`/api/v1/coe/context`) is likewise unmapped (session-auth is the gate);
  unmapped operations pass through. `gateway.middleware.ts` untouched.
- **No admin endpoint** (projectAdminView not route-exposed; deferred until a
  Foundation admin/agent/self-repair caller exists). No Otzar UX. No GOVSEC.
  No ADR edit (ADR-0048 §Hybrid API Strategy already contemplates the
  buildPersonalizedWorkingSet endpoint).
- **Untouched**: all personalization-service substrate (working-set.service.ts,
  session-context-resolver.ts, permission-envelope, moment-context,
  temporal-personalization, degraded-mode-contract, working-set-views.ts),
  `coe.service.ts`, `cosmp/**`, `audit.ts` (literals already defined at
  AUDIT.1), schema, Elixir, gateway.
- **Tests**: NEW `tests/integration/working-set-route.test.ts` — route
  integration + AUDIT.2 emission persistence (safe-counts / reason-histogram
  only) + consumer-view no-diagnostics + no raw vector/distance/embedding/
  cosine + fail-closed-no-audit + **synthetic-DMW route regression** (2
  employees + 1 twin + 1 enterprise; single-wallet spine proven at the HTTP
  boundary — no cross-wallet, no sensitive enterprise content in any consumer
  response).

**Substrate sites (6: 2 NEW + 4 MOD... 2 NEW + 3 MOD code/doc)**: NEW
`apps/api/src/routes/working-set.routes.ts` + NEW
`tests/integration/working-set-route.test.ts` + MOD `apps/api/src/server.ts`
(wiring) + MOD `apps/api/src/index.ts` (barrel) + MOD
`docs/reference/section-12-progress.md` (WSAPI row) + MOD this
`CURRENT_BUILD_STATE.md` (this WSAPI H4).

**Next Founder-gated arc = GOVSEC / government-grade hardening — NOT started.**

Founder authorization explicit at
`[WORKING-SET-API-EXPOSURE-HAWKSEYE-QLOCK]` +
`[WORKING-SET-API-EXPOSURE-EXECUTE-VERIFY-AUTH]`.

#### GOVSEC.1 LANDED — Government-Grade Hardening and Gap-Closure Program (umbrella; docs-only) (2026-05-20)

**Status:** GOVSEC.1 `[GOVSEC-GOVERNMENT-GRADE-HARDENING]` landing (2 NEW + 4 MOD;
6 files; docs-only) per Founder Q-GOVSEC-α α-1 + β-1 + γ-2 + η-3 (reserved for
code phases) + θ-3 LOCKS at
`[GOVSEC-GOVERNMENT-GRADE-HARDENING-G1-EXECUTE-VERIFY-AUTH]`.

- **GOVSEC is the master government-grade gap-closure arc** — not security-only
  and not compliance theater. It spans security, privacy, auditability,
  identity/session, AI/agent abuse, tenant isolation, supply chain, incident
  response, cryptography, operational resilience, correctness, scalability, and
  **optimization** (treated as government-grade readiness wherever it affects
  security under load, bot/swarm resistance, backpressure, latency under
  adversarial traffic, audit throughput, high-concurrency correctness, AI-agent
  coordination safety, tenant isolation at scale, or reliability during attacks/
  degraded states).
- **ADR-0049 created** (NEW `docs/architecture/decisions/0049-govsec-government-grade-hardening.md`;
  Status: Proposed) — umbrella ADR: Founder doctrine, standards basis, current
  substrate summary, master threat model A–L summary, gap-closure register
  summary, optimization register summary, 10-phase decomposition, per-phase
  closure criteria, and the 7 RULE 13 blind-spot resolutions (BS1–BS7).
- **Control matrix created** (NEW `docs/reference/govsec-control-matrix.md`) —
  source notes (retrieved 2026-05-20) + standards-to-substrate matrix (NIST
  800-53 AC/AU/IA/SC/SI/IR/SR + 800-63-4 + AI RMF + ZTMM v2.0 + OWASP API 2023 +
  OWASP LLM 2025 + SLSA + SOC 2 CC, each mapped to a named repo surface) + full
  threat model A–L + Master Gap-Closure Register + Optimization/Resilience
  Register + phase-ownership / test-strategy / closure-criteria matrices.
- **Master gap-closure register created** — every meaningful gap discovered in
  the planning pass is owned by gap-id with category, evidence, protection,
  description, severity, likelihood, phase owner, closure type, required tests,
  required audit/evidence, optimization impact, closure criteria, and disposition
  (blocker / high-priority forward-substrate / future-substrate). No gap unowned.
- **Optimization/resilience register created** (GAP-O1..O9) — audit throughput +
  hash-chain contention, gateway perf under adversarial load, AI-agent
  coordination under concurrency, tenant isolation at scale, profile separation,
  nonce/session validation perf, working-set latency under volume, CI scan cost,
  fail-closed under partial outages.
- **7 RULE 13 blind spots resolved at pre-flight:** BS1 ADMIN_ACTION is emitted
  widely (not a gap) · BS2 SESSION_EXPIRED/REVOKED unemitted (GAP-G1) · BS3
  AI-grantor/SESSION_ONLY unconfirmed in grant path (GAP-D1/D2) · BS4 hive/dept
  filtering absent in read/negotiate (GAP-F1) · BS5 `assembleContext` cited by
  symbol · BS6 synthetic-DMW S7 covers twin denial; narrowed (GAP-F3) · BS7
  `detectOperation` returns null → pass-through (GAP-B1).
- **No implementation yet.** No code/schema/CI/Elixir change; no new CLAUDE RULE.
- **GOVSEC.2 forward-substrate** (audit/security-event completion + machine-
  readable evidence foundation), and GOVSEC.3–10 forward-substrate — each gated
  by a separate Founder QLOCK.

**Substrate sites (6: 2 NEW + 4 MOD docs-only)**: NEW
`docs/architecture/decisions/0049-govsec-government-grade-hardening.md` + NEW
`docs/reference/govsec-control-matrix.md` + MOD
`docs/reference/section-12-progress.md` (GOVSEC.1 row) + MOD this
`CURRENT_BUILD_STATE.md` (this GOVSEC.1 H4) + MOD `docs/architecture/README.md`
(ADR-0049 catalog) + MOD `CLAUDE.md` (ADR-0049 catalog line; no new RULE).

Founder authorization explicit at
`[GOVSEC-GOVERNMENT-GRADE-HARDENING-HAWKSEYE-QLOCK]` +
`[GOVSEC-GOVERNMENT-GRADE-HARDENING-G1-EXECUTE-VERIFY-AUTH]`.

#### GOVSEC.2A LANDED — Session-Lifecycle Audit Emission Completion (GAP-G1) (2026-05-20)

**Status:** GOVSEC.2A `[GOVSEC-GOVERNMENT-GRADE-HARDENING]` landing — the **first
code-bearing GOVSEC phase** (1 MOD code + 1 MOD unit + 1 NEW integration + 3 docs
= 6 files) per Founder Q-GOVSEC2-α α-2 (split) + β-1 + γ-1 + δ (export→2B) + ε-1 +
ζ-3 + η-1 + θ-2 LOCKS at `[GOVSEC-GOVERNMENT-GRADE-HARDENING-G2A-EXECUTE-VERIFY-AUTH]`.

- **GAP-G1 closed** (session-lifecycle emission): `validateSession` now emits the
  modern hash-chained `SESSION_EXPIRED` / `SESSION_REVOKED` literals at its
  failure-detection branches via a private `emitSessionDenial` helper in
  `apps/api/src/services/auth.service.ts`. Matrix: JWT-expired/row-EXPIRED/
  nonce-absent → `SESSION_EXPIRED`; row-absent/TERMINATED → `SESSION_REVOKED`;
  INVALIDATED-status + TAR-hash-mismatch → `SESSION_REVOKED` with safe
  `subreason`. Bad/malformed token (`SESSION_INVALID`) and the success path emit
  nothing; `OPERATION_NOT_PERMITTED` emits nothing (authz, not lifecycle).
- **Modern `audit_events` hash chain used** — emissions land on the **actor's
  per-user chain** (no SCHEDULER-chain batch emission; GAP-O1 shared-chain
  advisory-lock contention avoided; success path adds no audit write).
- **No legacy `audit_logs` migration** — the `session.ts` `writeAudit(action)`
  legacy path is untouched; `packages/database/**`, `audit.ts`, `writeAuditEvent`,
  and `verifyAuditChain` are unchanged.
- **No new audit literal** — `SESSION_INVALIDATED` is **not** created; INVALIDATED
  branches map to `SESSION_REVOKED` (reason/subreason). `SESSION_CREATED`
  preserved as-is (refresh).
- **No schema change** (event_type is String; literals already defined).
- **No compliance/export implementation** — GOVSEC.2B machine-readable evidence
  export remains a **separate forward-substrate phase**.
- **No ADR-0002 amendment** (θ-2): GOVSEC.2A emits already-defined literals
  through the existing **unchanged** hash-chain architecture, so ADR-0002 is not
  amended; ADR-0049 carries a GOVSEC.2A progress note + the re-scope record + the
  RULE 13 two-audit-system clarification (legacy `audit_logs` via
  `writeAudit(action)` vs modern hash-chained `audit_events` via
  `writeAuditEvent(event_type)`; GOVSEC.2A targets the modern chain only).
- **Safe metadata** — `reason`/`subreason` enum classes + `session_id` +
  `actor_entity_id` + `outcome` only; never token/nonce/TAR-hash/secret/raw
  content. Per RULE 4 the audit write is awaited and not swallowed (fails closed).
- **GOVSEC.2B and GOVSEC.3 remain separate** forward-substrate phases, each
  gated by a distinct Founder QLOCK.
- **Tests:** 10 NEW unit (per-branch + bad-token-no-emission + success-no-emission
  + safe-metadata) + NEW `tests/integration/session-lifecycle-audit.test.ts` (8
  scenarios incl. `verifyAuditChain` valid:true after emissions + append-only
  UPDATE rejection).

**Substrate sites (6)**: MOD `apps/api/src/services/auth.service.ts` + MOD
`tests/unit/auth.test.ts` + NEW `tests/integration/session-lifecycle-audit.test.ts`
+ MOD `docs/reference/section-12-progress.md` + MOD this `CURRENT_BUILD_STATE.md`
+ MOD `docs/architecture/decisions/0049-govsec-government-grade-hardening.md`.

Founder authorization explicit at
`[GOVSEC-GOVERNMENT-GRADE-HARDENING-G2A-EXECUTE-VERIFY-AUTH]`.

#### GOVSEC.2B LANDED — Machine-Readable Evidence Export Foundation (GAP-G2) (2026-05-20)

**Status:** GOVSEC.2B `[GOVSEC-GOVERNMENT-GRADE-HARDENING]` landing — **helper/service
only** (1 MOD code + 2 NEW tests + 3 docs = 6 files) per Founder Q-GOVSEC2B-α α-1 +
β-1 + γ-2 + δ-3 + ε-1 + ζ-1 + η-3 + θ-2 LOCKS at
`[GOVSEC-GOVERNMENT-GRADE-HARDENING-G2B-EXECUTE-VERIFY-AUTH]`.

- **Evidence export helper exists** — two additive `ComplianceService` methods:
  `generateEvidenceExport(orgEntityId, options)` (pure deterministic core) +
  `generateEvidenceExportForCaller(sessionToken, options)` (validate session →
  `getOrgEntityId` org-scope → fail-closed; mirrors `getComplianceStateForCaller`).
- **Export is an OSCAL-compatible SUMMARY, not a full OSCAL package** —
  `export_type: "OSCAL_ASSESSMENT_RESULTS_SUMMARY"`, `oscal_compatible: true`;
  per-framework `observations` (control_id `au-2`, methods `["EXAMINE"]`,
  observation_class `audit_event_summary`, counts {passed, failed}) + `findings`
  (status satisfied/not-satisfied) + top-level `audit_event_summary` of
  (event_type, outcome, count). **Counts/classes only — no full AuditEvent rows,
  ip_address, event_hash, details JSON, actor/target ids, or recent_failures.**
  No SSP/SAP/SAR/POA&M generation.
- **Data source (δ-3):** `getComplianceState` per-framework verdicts + strict
  `prisma.auditEvent.count` scoped by `target_entity_id` (org). Read-only — **no
  writeAuditEvent; hash chain + GAP-O1 unaffected** (no advisory-lock contention).
- **Route exposure deferred** — there is **no route** in GOVSEC.2B
  (`compliance.routes.ts` untouched). Route exposure is deferred to **GOVSEC.5**
  (admin/authz + dual-control self-approval resolution) and/or **GOVSEC.7**
  (tenant isolation). The `…ForCaller` helper establishes the safe org-scoped
  contract a future route will use.
- **`/compliance/report` BOLA + full-row exposure (pre-existing) surfaced, NOT
  fixed here** — `GET /compliance/report` is bearer-only with no entity scoping
  and returns full AuditEvent rows (`recent_failures`). GOVSEC.2B's export does
  the OPPOSITE (org-scoped `…ForCaller` + counts-only). **GOVSEC.5 (authz) /
  GOVSEC.7 (tenant) own this access-route hardening.**
- **No schema change** (ζ-1; computed on-demand). **No ADR-0002 amendment** (θ-2;
  read-only projection, no audit-architecture semantic change). **GOVSEC.2A
  untouched** (auth.service.ts / audit.ts / session.ts / writeAuditEvent /
  verifyAuditChain unchanged). **GOVSEC.3 remains a separate** forward-substrate
  phase.
- **Tests:** NEW `tests/unit/evidence-export.test.ts` (9) + NEW
  `tests/integration/evidence-export.test.ts` (5; ForCaller auth path +
  cross-org isolation + forbidden-field regression + no-audit-rows +
  verifyAuditChain valid).

**Substrate sites (6)**: MOD `apps/api/src/services/compliance/compliance.service.ts`
+ NEW `tests/unit/evidence-export.test.ts` + NEW
`tests/integration/evidence-export.test.ts` + MOD
`docs/reference/section-12-progress.md` + MOD this `CURRENT_BUILD_STATE.md` + MOD
`docs/architecture/decisions/0049-govsec-government-grade-hardening.md`.

Founder authorization explicit at
`[GOVSEC-GOVERNMENT-GRADE-HARDENING-G2B-EXECUTE-VERIFY-AUTH]`.

#### GOVSEC.3A LANDED — Refresh Rotation / Old-Session Revocation (GAP-A4) (2026-05-20)

**Status:** GOVSEC.3A `[GOVSEC-GOVERNMENT-GRADE-HARDENING]` landing — the first
GOVSEC.3 auth/session hardening subphase (1 MOD code + 1 NEW integration test + 3
docs = 5 files) per Founder Q-GOVSEC3-α α-2 + β-1 + γ-1 + ε-1 **always-rotate** +
δ-3 + ζ-3 + η-3 + θ-2 LOCKS at
`[GOVSEC-GOVERNMENT-GRADE-HARDENING-G3A-EXECUTE-VERIFY-AUTH]`.

- **GAP-A4 closed by default** — `POST /api/v1/auth/refresh` now rotates: after
  the new session/nonce are created, the **old session is revoked** —
  `terminateSession(oldSessionId, entityId)` + **old nonce deleted** + a modern
  hash-chained `SESSION_REVOKED` (outcome `SUCCESS`, `details.reason: "rotated"`,
  `session_id` = old session) is emitted.
- **Old token replay denied** — the old session row is `TERMINATED` and its
  nonce is gone, so any further use of the old token fails validateSession.
- **New session remains valid** — the new token works; its `SESSION_CREATED`
  emission is preserved (detail flips `prior_session_kept_active: false` +
  `revoked_prior: true`).
- **Always-rotate** chosen over an opt-in `revoke_prior` flag (an opt-in flag
  would leave GAP-A4 partially open). The prior multi-tab active-session
  behavior is intentionally removed for government-grade closure (OWASP renew+
  destroy-old; NIST AC-12/IA-11; CISA secure defaults).
- **No validateSession hot-path change** — only refresh pays the cost (one
  terminate + one nonce delete + one audit emit, on the actor's per-user chain;
  GAP-O6 unaffected; no SCHEDULER/system_principal batch emission).
- **No idle/device/password-flow work** — GOVSEC.3B (password-change
  invalidation; `invalidateEntitySessions` ready, blocked on password flow),
  GOVSEC.3C (idle timeout; needs schema), GOVSEC.3D (device binding; needs
  schema) remain forward-substrate.
- **No schema change** (β-1; reuses `status`/`terminated_at`). **No new audit
  literal** (γ-1; SESSION_REVOKED reused — `SUCCESS`/`rotated` = successful
  lifecycle rotation, distinct from GOVSEC.2A's `DENIED` rejected-use path).
- **GOVSEC.2A untouched** (validateSession / emitSessionDenial / audit.ts /
  session.ts / writeAuditEvent / verifyAuditChain unchanged; `terminateSession`
  is called, not modified). **GOVSEC.2B untouched** (no compliance/evidence
  change). **Route-local** (no auth.service.ts helper).
- **Tests:** NEW `tests/integration/refresh-rotation.test.ts` (6 scenarios incl.
  double-refresh chain, replay denial, verifyAuditChain valid, append-only).

**Substrate sites (5)**: MOD `apps/api/src/routes/auth-admin.routes.ts` + NEW
`tests/integration/refresh-rotation.test.ts` + MOD
`docs/reference/section-12-progress.md` + MOD this `CURRENT_BUILD_STATE.md` + MOD
`docs/architecture/decisions/0049-govsec-government-grade-hardening.md`.

Founder authorization explicit at
`[GOVSEC-GOVERNMENT-GRADE-HARDENING-G3A-EXECUTE-VERIFY-AUTH]`.

#### GOVSEC.3B READINESS — Credential-Change Session Invalidation (GAP-A5; deferred-with-contract) (2026-05-20)

**Status:** GOVSEC.3B `[GOVSEC-GOVERNMENT-GRADE-HARDENING]` — **docs-only readiness**
(3 MOD docs) per Founder Q-GOVSEC3B-α α-2 + β-2 + γ-1 + δ-3 + ε-1 + ζ-1 + η-2 LOCKS
at `[GOVSEC-GOVERNMENT-GRADE-HARDENING-G3B-READINESS-EXECUTE-VERIFY-AUTH]`.

- **GAP-A5 is deferred-with-contract, not silently skipped.** There is **no
  credential-change flow today**: `POST /auth/admin-reset` is a stub (returns a
  UUID; no reset-token persistence, no email, no `password_hash` update) and
  `password_hash` has no update path (written only at entity creation). The
  GAP-A5 risk (a stale session surviving a credential change) is **unreachable**
  until Section 14+ ships credential-change/password/email infrastructure.
- **`invalidateEntitySessions` is available but incomplete for future GOVSEC
  use** — it invalidates all ACTIVE sessions (DB status → INVALIDATED) but
  writes only **legacy `audit_logs`** (not the modern hash-chained `audit_events`)
  and does **not** delete Redis nonces. Security is preserved today via the DB
  INVALIDATED status check (GOVSEC.2A maps it to `SESSION_REVOKED` reason
  `invalidated` on next use); the future flow's helper must add modern audit +
  nonce deletion.
- **Canonical closure contract landed (ADR-0049).** When the Section 14+
  credential-change flow ships it MUST: (1) list the entity's previously-ACTIVE
  sessions; (2) `invalidateEntitySessions(entity_id, "credential_changed",
  actor_id)`; (3) delete those sessions' nonces; (4) emit ONE aggregate modern
  `SESSION_REVOKED` (outcome `SUCCESS`, `reason: "credential_changed"`,
  `invalidated_count: N`) — reusing the existing literal (no new literal); (5)
  safe/minimized metadata; (6) replay tests; (7) `verifyAuditChain` valid.
- **No implementation landed** — no code, no route, no helper, no schema, no new
  audit literal, no email infra, no `invalidateEntitySessions` modification.
- **No ADR-0002 amendment** (no audit-architecture change). **GOVSEC.3A / 2A /
  2B unchanged.** GOVSEC.3C (idle timeout) / GOVSEC.3D (device binding) and
  GOVSEC.4/5/7 remain separate forward-substrate phases.

**Substrate sites (3, docs-only)**: MOD `docs/reference/section-12-progress.md` +
MOD this `CURRENT_BUILD_STATE.md` + MOD
`docs/architecture/decisions/0049-govsec-government-grade-hardening.md`.

Founder authorization explicit at
`[GOVSEC-GOVERNMENT-GRADE-HARDENING-G3B-READINESS-EXECUTE-VERIFY-AUTH]`.

#### GOVSEC.3C-A LANDED — Idle-Session Activity Tracking Substrate (GAP-A1 part 1) (2026-05-20)

**Status:** GOVSEC.3C-A `[GOVSEC-GOVERNMENT-GRADE-HARDENING]` landing — the first
**schema-bearing** GOVSEC code phase; **tracking only, no enforcement** (4
code/schema + 1 NEW test + 3 docs = 8 files) per Founder Q-GOVSEC3C-α α-2 + β-2 +
δ-2 + ε-2 + ζ-1 + θ-1 + ι-2 + κ-2 LOCKS at
`[GOVSEC-GOVERNMENT-GRADE-HARDENING-G3CA-EXECUTE-VERIFY-AUTH]` + Founder index.ts
8th-file authorization.

- **Schema-bearing tracking substrate landed** — NEW additive nullable
  `Session.last_activity_at DateTime?` (applied via `prisma db push` per ADR-0025;
  the local test DB was refreshed via `scripts/local-test-db-refresh.sh` because
  the bare `db:push:test` hit the documented pre-existing Ecto `schema_migrations`
  cross-language drift — ADR-0035 §9 38th observation / ADR-0047 PR.3).
- **`createSession` initializes `last_activity_at`** (= `issued_at`) so future
  enforcement always has a baseline.
- **`validateSession` success-path touches `last_activity_at`** via the NEW
  throttled `touchSessionActivity` helper (atomic `updateMany`; writes only when
  `last_activity_at` is null or older than a 60s threshold AND status ACTIVE).
  The touch is **best-effort** (try/catch): a failed tracking write must not fail
  an otherwise-valid request and cannot make an invalid session valid; if it lags,
  the session merely appears slightly more idle to the future GOVSEC.3C-B
  enforcement (a conservative, safe direction).
- **No rejection-behavior change** — no session is rejected by idle time; a
  1h-idle session still validates. **No idle enforcement.** **No
  `idle_timeout_minutes`** (GOVSEC.3C-B).
- **No audit event change** — 3C-A emits nothing new; `SESSION_EXPIRED` reason
  `idle_timeout` belongs to 3C-B. **No new audit literal.**
- **No Redis TTL refresh** (θ-1) — DB `last_activity_at` is authoritative;
  activity does not extend the Redis nonce TTL.
- **`touchSessionActivity` barrel re-export** added to `index.ts` (one additive
  line; the only index.ts change; authorized as the 8th file).
- **GOVSEC.2A** `emitSessionDenial` failure branches unchanged; **GOVSEC.3A**
  refresh rotation unchanged; **GOVSEC.3B** readiness untouched (docs continuity
  only). AAL2 idle ≤60min / AAL3 ≤15min documented for 3C-B.
- **GOVSEC.3C-B enforcement remains separate** forward-substrate; GOVSEC.3D/4/5/7
  untouched.
- **Tests:** NEW `tests/integration/session-idle-tracking.test.ts` (7 scenarios).

**Substrate sites (8)**: MOD `packages/database/prisma/schema.prisma` + MOD
`packages/database/src/queries/session.ts` + MOD `packages/database/src/index.ts`
+ MOD `apps/api/src/services/auth.service.ts` + NEW
`tests/integration/session-idle-tracking.test.ts` + MOD
`docs/reference/section-12-progress.md` + MOD this `CURRENT_BUILD_STATE.md` + MOD
`docs/architecture/decisions/0049-govsec-government-grade-hardening.md`.

Founder authorization explicit at
`[GOVSEC-GOVERNMENT-GRADE-HARDENING-G3CA-EXECUTE-VERIFY-AUTH]`.

#### GOVSEC.3C-B1 LANDED — Idle-Window Snapshot Substrate (GAP-A1 part 2; Option B) (2026-05-20)

**Status:** GOVSEC.3C-B1 `[GOVSEC-GOVERNMENT-GRADE-HARDENING]` landing —
schema-bearing **snapshot substrate, no enforcement** (5 code/schema + 1 NEW test
+ 3 docs = 9 files) per Founder Q-GOVSEC3CB-α α-2 + β-1+snapshot + γ-1 + κ-2 + λ-2
LOCKS + Option B design lock + auth-admin.routes.ts authorization at
`[GOVSEC-GOVERNMENT-GRADE-HARDENING-G3CB1-EXECUTE-VERIFY-AUTH]`.

- **Idle-window snapshot substrate landed (Option B).** NEW additive nullable
  `OrgSettings.idle_timeout_minutes Int?` (per-org config) + `Session.idle_timeout_minutes Int?`
  (per-session snapshot). The snapshot avoids a per-request org-settings lookup in
  validateSession (planning found that would add ~3 typical / up to ~16 worst-case
  reads per authed request, even for null-idle orgs — 2-8× hot-path amplification).
- **login snapshots from org settings** (auth.service.ts passes
  `orgSettings.idle_timeout_minutes` to `createSession`).
- **refresh snapshots from org settings** (auth-admin.routes.ts — one additive
  line; the GOVSEC.3A rotation logic is unchanged) so a refreshed session also
  carries the idle window.
- **validateSession does NOT perform an org-settings lookup** and is otherwise
  unchanged (GOVSEC.3C-A success-path touch + GOVSEC.2A failure branches
  preserved). B2 enforcement will read `sessionRow.idle_timeout_minutes` from the
  already-fetched row — zero extra reads.
- **No enforcement behavior landed** — a snapshot-set + aged session still
  validates. **No `SESSION_EXPIRED idle_timeout` emission.** **No new audit
  literal.** **No Redis TTL refresh.** **No `markSessionIdleExpired`.**
- **null default** = idle enforcement disabled until an org sets it (no surprise
  to consumer/enterprise tenants); standards-aligned (NIST AC-11/AC-12
  organization-defined; OWASP risk-tiered). The **GOVSEC government profile
  mandates AAL2 ≤60min / AAL3 ≤15min**.
- **GAP-A1 honest status:** substrate landed; runtime closure requires
  GOVSEC.3C-B2 enforcement + per-org config.
- Schema applied via `prisma db push` + `scripts/local-test-db-refresh.sh` +
  `db:generate`. **GOVSEC.3C-B2 enforcement remains separate** forward-substrate;
  GOVSEC.3D/4/5/7 untouched.
- **Tests:** NEW `tests/integration/session-idle-snapshot.test.ts` (7 scenarios).

**Substrate sites (9)**: MOD `packages/database/prisma/schema.prisma` + MOD
`apps/api/src/services/governance/org.ts` + MOD
`packages/database/src/queries/session.ts` + MOD
`apps/api/src/services/auth.service.ts` + MOD
`apps/api/src/routes/auth-admin.routes.ts` + NEW
`tests/integration/session-idle-snapshot.test.ts` + MOD
`docs/reference/section-12-progress.md` + MOD this `CURRENT_BUILD_STATE.md` + MOD
`docs/architecture/decisions/0049-govsec-government-grade-hardening.md`.

Founder authorization explicit at
`[GOVSEC-GOVERNMENT-GRADE-HARDENING-G3CB1-EXECUTE-VERIFY-AUTH]`.

---

#### GOVSEC.3C-B2 LANDED — Idle-Timeout Enforcement (GAP-A1 + GAP-A2) (2026-05-20)

**Status:** GOVSEC.3C-B2 `[GOVSEC-GOVERNMENT-GRADE-HARDENING]` landing — runtime
idle enforcement on the B1 snapshot + 3C-A activity substrate (3 code + 1 NEW test
+ 3 docs = 7 files) per Founder Q-GOVSEC3CB2-α α-1 + β-1 (no schema) + γ-1 + δ-1 +
ε-1 + ζ-1 + η-1 + θ-1 + ι-1 + κ-1 + λ-3 + μ-2 LOCKS at
`[GOVSEC-GOVERNMENT-GRADE-HARDENING-G3CB2-EXECUTE-VERIFY-AUTH]`.

- **Idle enforcement landed.** `validateSession` checks idle **after the DB status
  checks and before the TAR / operation / nonce checks**, using only the
  already-fetched session row — **zero extra org-settings reads** (Option B
  snapshot pays off).
- **Baseline** = `COALESCE(last_activity_at, issued_at)`; **window** =
  `sessionRow.idle_timeout_minutes * 60_000`; **null snapshot ⇒ no enforcement**.
- **Idle-expired sessions transition ACTIVE → EXPIRED** via NEW
  `markSessionIdleExpired` (atomic `updateMany` WHERE `status="ACTIVE"`; returns
  `count > 0`; audit-free; Redis-free; no timestamp) and **return
  `SESSION_EXPIRED`** (existing code; no new return code).
- **`SESSION_EXPIRED` `idle_timeout` audit emitted once** — only when the atomic
  transition wins (`count === 1`), so no duplicate emission under concurrency;
  reuses the GOVSEC.2A `emitSessionDenial` helper (outcome DENIED, actor chain).
  **No new audit literal.**
- **No schema change.** **No Redis TTL refresh.** **Best-effort nonce delete** —
  DB `EXPIRED` is authoritative if the delete fails.
- **`touchSessionActivity` is NOT called on an idle denial** (the idle return
  precedes the success-path touch).
- A **configured org/session is required** for idle enforcement (null-default;
  GOVSEC government profile mandates AAL2 ≤60min / AAL3 ≤15min). GAP-A2 closes via
  **lazy enforcement + the absolute TTL cap** — no proactive sweep / scheduler.
- **Tests:** NEW `tests/integration/session-idle-enforcement.test.ts` (helper
  transition/idempotent/non-ACTIVE + idle denial + single audit + safe metadata +
  DB-authoritative replay + null-no-enforcement + within-window-valid +
  not-touched + concurrency single-emit + replay no-duplicate + verifyAuditChain).
- **GOVSEC.3D / GOVSEC.4 / GOVSEC.5 / GOVSEC.7 remain separate** forward-substrate.

**Substrate sites (7)**: MOD `packages/database/src/queries/session.ts` + MOD
`packages/database/src/index.ts` + MOD `apps/api/src/services/auth.service.ts` +
NEW `tests/integration/session-idle-enforcement.test.ts` + MOD
`docs/reference/section-12-progress.md` + MOD this `CURRENT_BUILD_STATE.md` + MOD
`docs/architecture/decisions/0049-govsec-government-grade-hardening.md`.

Founder authorization explicit at
`[GOVSEC-GOVERNMENT-GRADE-HARDENING-G3CB2-EXECUTE-VERIFY-AUTH]`.

---

#### GOVSEC.3D-A LANDED — Device-Binding Snapshot Substrate (GAP-A3 part 1) (2026-05-21)

**Status:** GOVSEC.3D-A `[GOVSEC-GOVERNMENT-GRADE-HARDENING]` landing —
schema-bearing **device-binding snapshot substrate, no enforcement** (5 code/schema
+ 1 NEW test + 3 docs = 9 files) per Founder Q-GOVSEC3D-α α-1 + β-1 HMAC + γ-2 +
δ-1/ε-1 DEFERRED + η-3 + θ-1 + ι-2 + κ-2 LOCKS + auth.routes.ts 9th-file
authorization at `[GOVSEC-GOVERNMENT-GRADE-HARDENING-G3DA-DEVICE-BINDING-SNAPSHOT-EXECUTE-VERIFY-AUTH]`.

- **Device-binding snapshot substrate landed.** NEW additive nullable
  `Session.device_binding_hash String?`. Planning found the Session row had no
  device/ua/ip field (IP only logged in `audit_events`) and that
  `validateSession` receives no client context from any of its four hot-path
  callers — so enforcement is a separate phase (3D-B).
- **`AuthService.deviceBindingHash(userAgent)`** computes **HMAC-SHA256(normalized
  user-agent, jwtSecret)** via Node built-in `crypto` (no dependency; ADR-0019
  HS256 family). Trim-only normalization (preserves meaningful UA case);
  null/empty/whitespace user-agent → null (unbound).
- **login snapshots from the client user-agent** (auth.routes.ts passes
  `request.headers["user-agent"]` into the login context; auth.service.login
  computes the hash and snapshots it onto the session).
- **refresh snapshots from the client user-agent** (auth-admin.routes.ts — one
  additive line via `authService.deviceBindingHash(...)`; the GOVSEC.3A rotation
  logic is unchanged).
- **No raw user-agent or raw IP is persisted** anywhere on the Session row.
  **IP is excluded** from the binding material (brittle across mobile/NAT/VPN/
  proxy). No fingerprinting library; no precise fingerprinting.
- **validateSession is UNCHANGED** — no context threading into its callers, no
  binding check, no enforcement. GOVSEC.3C-A activity touch + 3C-B2 idle
  enforcement + GOVSEC.2A failure branches preserved.
- **No audit change.** No device-mismatch audit, no new audit literal. **No
  Redis/nonce change.**
- **GAP-A3 honest status:** binding material captured + snapshotted; mismatch
  rejection deferred to GOVSEC.3D-B (context threading + advisory/config-gated)
  and GOVSEC.3D-C (hard revoke + recovery/step-up, gated on GOVSEC.5).
- Schema applied via `prisma db push` + `scripts/local-test-db-refresh.sh` +
  `db:generate`. **GOVSEC.3D-B/C remain separate** forward-substrate;
  GOVSEC.4/5/7 untouched.
- **Tests:** NEW `tests/integration/session-device-binding.test.ts` (10 scenarios).

**Substrate sites (9)**: MOD `packages/database/prisma/schema.prisma` + MOD
`packages/database/src/queries/session.ts` + MOD
`apps/api/src/services/auth.service.ts` + MOD
`apps/api/src/routes/auth.routes.ts` + MOD
`apps/api/src/routes/auth-admin.routes.ts` + NEW
`tests/integration/session-device-binding.test.ts` + MOD
`docs/reference/section-12-progress.md` + MOD this `CURRENT_BUILD_STATE.md` + MOD
`docs/architecture/decisions/0049-govsec-government-grade-hardening.md`.

Founder authorization explicit at
`[GOVSEC-GOVERNMENT-GRADE-HARDENING-G3DA-DEVICE-BINDING-SNAPSHOT-EXECUTE-VERIFY-AUTH]`.

---

#### GOVSEC.3D-B LANDED — Device-Binding Context Threading + Advisory Detection (GAP-A3 part 2) (2026-05-21)

**Status:** GOVSEC.3D-B `[GOVSEC-GOVERNMENT-GRADE-HARDENING]` landing — client-context
threading into the normal-use validateSession callers + **advisory** device-binding
detection (7 code + 1 NEW test + 3 docs = 11 files) per Founder Q-GOVSEC3DB-α α-2 +
β-1 + γ-1 + δ-1 + ε-1 + ζ-1 + η-1 + θ-3 + ι-1 + κ-3 + λ-2 LOCKS at
`[GOVSEC-GOVERNMENT-GRADE-HARDENING-G3DB-CONTEXT-THREADING-EXECUTE-VERIFY-AUTH]`.

- **Context threading landed for the 5 normal-use callers.** Pre-flight found the
  actual `AuthService.validateSession` caller set is **6 files / 8 sites** (not the
  4 named): `auth.middleware.ts`, `admin.middleware.ts`, `developer.routes.ts` (×3),
  `working-set.routes.ts`, `wallet.routes.ts`, and `auth-admin.routes.ts:336`
  (refresh). The 5 normal-use callers are threaded; **`auth-admin.routes.ts:336`
  (refresh old-token validation) is intentionally left unthreaded** (refresh
  authorization, not normal-use; the refreshed session already snapshots a fresh
  binding hash per 3D-A; GOVSEC.3A rotation unchanged).
- **NEW `apps/api/src/middleware/request-context.ts`** `clientContextFrom(request)`
  returns `{ ip_address, user_agent }` (no hashing/normalization here; no IP
  binding; no raw storage). The 5 callers pass it into `validateSession`.
- **Advisory `device_bound` added to the validateSession success result.**
  `ValidateSessionContext.user_agent?` + `ValidateSuccess.device_bound?: boolean | null`.
  At θ-3 (success path, after every existing check incl. 3C-B2 idle + 3C-A touch):
  `true` = live UA HMAC matches the snapshot; `false` = mismatch (**session still
  valid**); `null` = null stored hash OR no live user-agent.
- **No behavior rejection.** A mismatch is advisory — no denial, no revoke, no new
  return code. **No response-shape change** (routes build responses separately).
- **No audit, no schema, no Redis/nonce change, no new audit literal.** A mismatch
  emits nothing and leaves the token usable.
- **refresh old-token validation remains unthreaded by design** (rationale above).
- **GAP-A3 status:** detection signal now available at validateSession; runtime
  closure (deny/revoke) remains GOVSEC.3D-C.
- **Tests:** NEW `tests/integration/session-device-binding-detection.test.ts`
  (7 scenarios incl. auth.middleware end-to-end).
- **GOVSEC.3D-C remains separate** (config-gated/hard enforcement + accurate
  `SESSION_REVOKED device_mismatch` audit + recovery, gated on GOVSEC.5);
  GOVSEC.4/5/7 untouched.

**Substrate sites (11)**: MOD `apps/api/src/services/auth.service.ts` + NEW
`apps/api/src/middleware/request-context.ts` + MOD
`apps/api/src/middleware/auth.middleware.ts` + MOD
`apps/api/src/middleware/admin.middleware.ts` + MOD
`apps/api/src/routes/developer.routes.ts` + MOD
`apps/api/src/routes/working-set.routes.ts` + MOD
`apps/api/src/routes/wallet.routes.ts` + NEW
`tests/integration/session-device-binding-detection.test.ts` + MOD
`docs/reference/section-12-progress.md` + MOD this `CURRENT_BUILD_STATE.md` + MOD
`docs/architecture/decisions/0049-govsec-government-grade-hardening.md`.

Founder authorization explicit at
`[GOVSEC-GOVERNMENT-GRADE-HARDENING-G3DB-CONTEXT-THREADING-EXECUTE-VERIFY-AUTH]`.

---

#### GOVSEC.3D-C READINESS — Device-Mismatch Enforcement (deferred to GOVSEC.5) (2026-05-21)

**Status:** GOVSEC.3D-C `[GOVSEC-GOVERNMENT-GRADE-HARDENING]` landing — **docs-only
readiness contract** (3 docs) per Founder Q-GOVSEC3DC-α α-1 + β-3/γ-1/ε-2/ζ-1/η-2
DEFERRED + δ-1 + θ-1 + ι-1 + κ-1 + λ-1 + μ-2 LOCKS at
`[GOVSEC-GOVERNMENT-GRADE-HARDENING-G3DC-DEVICE-MISMATCH-READINESS-EXECUTE-VERIFY-AUTH]`.

- **Docs-only.** No enforcement, no schema, no config substrate, no code.
- **Records the enforcement blocker:** no recovery/step-up/break-glass substrate
  exists — `/api/v1/auth/admin-reset` is a stub (PASSWORD_RESET_TRIGGERED trigger,
  no reset-completion flow); `OrgSettings.mfa_required` is an unenforced flag (not
  referenced by auth.service or middleware); no TOTP/second-factor/step-up route;
  the only practical recovery today is a full re-login.
- **3D-B advisory `device_bound` detection remains the only live device-binding
  behavior** (a mismatch does not deny/revoke/audit).
- **Future enforcement contract (deferred to a post-GOVSEC.5 phase):**
  config-gated via a future `OrgSettings.device_binding_mode` +
  `Session.device_binding_mode` snapshot (read free from the already-fetched row
  per the 3C-B1 idle-snapshot precedent; default null/off; enum shape deferred
  until GOVSEC.5); a future `markSessionDeviceMismatch` mirroring
  `markSessionIdleExpired` (atomic ACTIVE→TERMINATED/INVALIDATED, returns boolean,
  audit-free/Redis-free); reuse `SESSION_REVOKED` reason `device_mismatch` on an
  actual revoke only (no new audit literal; no ADR-0002 amendment); best-effort
  nonce delete with DB status authoritative; θ-1 missing-UA / ι-1 null-stored ⇒
  no enforcement; single-emit on transition win.
- **Hard enforcement is BLOCKED until GOVSEC.5** provides recovery/step-up/
  break-glass (κ-1) — hard deny/revoke on user-agent churn would create surprise
  re-login lockouts with no gentler alternative.
- **GAP-A3 honest status:** detection landed (3D-A snapshot + 3D-B advisory);
  runtime rejection/revoke gated on GOVSEC.5; **NOT runtime-enforcement closed.**
- **GOVSEC.4 / GOVSEC.5 / GOVSEC.7 remain separate** forward-substrate.

**Substrate sites (3, docs-only)**: MOD
`docs/architecture/decisions/0049-govsec-government-grade-hardening.md` + MOD
`docs/reference/section-12-progress.md` + MOD this `CURRENT_BUILD_STATE.md`.

Founder authorization explicit at
`[GOVSEC-GOVERNMENT-GRADE-HARDENING-G3DC-DEVICE-MISMATCH-READINESS-EXECUTE-VERIFY-AUTH]`.

---

#### GOVSEC.4 G4-A LANDED — Gateway Unmapped-Route Governance + Auth-Endpoint Limits (GAP-B1) (2026-05-21)

**Status:** GOVSEC.4 G4-A `[GOVSEC-GOVERNMENT-GRADE-HARDENING]` landing — gateway
gap-closure (1 code + 1 test + 3 docs = 5 files) per Founder Q-GOVSEC4-α α-5 +
β-1 + γ-3 + δ-1 + ε-4 + ζ-2 + η-1/η-4 + θ-3 + ι-2 LOCKS at
`[GOVSEC-GOVERNMENT-GRADE-HARDENING-G4A-UNMAPPED-ROUTE-GOVERNANCE-EXECUTE-VERIFY-AUTH]`.

- **Gateway/rate-limit gap closure started with G4-A.** GOVSEC.4 is split: G4-A =
  GAP-B1; G4-B = GAP-B2/B3 (bot/swarm + anomaly backpressure + any audit); G4-C =
  GAP-B4 (privileged-route throttle w/ GOVSEC.5); G4-D = GAP-O2/O7 (measured perf).
- **The gateway was already wired and Redis-backed** (`makeGatewayHook` via
  `app.addHook("onRequest", ...)`; `RedisRateLimitStore`/`MemoryRateLimitStore` in
  `rate-limit.ts`). G4-A is gap-closure, not greenfield.
- **G4-A closes unmapped-route pass-through:** the `operation === null` /
  `policy === undefined` pass-throughs are replaced by a `DEFAULT_FALLBACK`
  (300/min entity, also `DEFAULT_LIMITS.default`, overridable in tests) keyed on a
  shared `default` bucket (entity, IP fallback) — no route passes ungoverned.
- **refresh + admin-reset now governed:** NEW `OPERATION_RULES` + `DEFAULT_LIMITS`
  — `refresh` 20/min entity, `admin_reset` 5/min entity (high-risk stub).
- **Health/readiness exempt:** NEW narrow `isExemptPath`/`EXEMPT_RULES` keeps
  `GET /api/v1/health` unthrottled (deploy/CI probes never self-DoS'd).
- **No audit / no schema / no dependency.** Reuses the existing 429 envelope;
  γ-3 keying (op/`default` + entity, IP fallback); no raw UA/IP storage; no new
  org read; ip_whitelist STEP-1 + Loop-5 multiplier unchanged.
- **No anomaly wiring** (G4-B). **No privileged-route throttle** (G4-C).
- **G4-B / G4-C / G4-D remain separate** forward-substrate; **GOVSEC.5/7 remain
  separate.**
- **Tests:** MOD `tests/integration/gateway.test.ts` — isolated describe (own app +
  store + low ip-scoped overrides): refresh→429, admin-reset→429, unmapped
  wallet/balance→429 via fallback, health exempt under a tight default.

**Substrate sites (5)**: MOD `apps/api/src/middleware/gateway.middleware.ts` + MOD
`tests/integration/gateway.test.ts` + MOD `docs/reference/section-12-progress.md` +
MOD this `CURRENT_BUILD_STATE.md` + MOD
`docs/architecture/decisions/0049-govsec-government-grade-hardening.md`.

Founder authorization explicit at
`[GOVSEC-GOVERNMENT-GRADE-HARDENING-G4A-UNMAPPED-ROUTE-GOVERNANCE-EXECUTE-VERIFY-AUTH]`.

---

#### GOVSEC.4 G4-B1 LANDED — Rate-Limit-Denial Audit + GAP-B3 Correction (2026-05-21)

**Status:** GOVSEC.4 G4-B1 `[GOVSEC-GOVERNMENT-GRADE-HARDENING]` landing — bounded
rate-limit-denial audit (2 code + 1 test + 4 docs = 7 files) per Founder
Q-GOVSEC4B-α α-5 + β-2 + γ-2 + δ-1 + ε-4 + ζ-1 + η-3 + θ-3 + ι-3 + κ-2 LOCKS at
`[GOVSEC-GOVERNMENT-GRADE-HARDENING-G4B1-RATE-LIMIT-AUDIT-EXECUTE-VERIFY-AUTH]`.

- **G4-B split:** G4-B1 = rate-limit-denial audit + GAP-B3 docs correction;
  G4-B2 = general bot/swarm resistance (GAP-B2, deferred).
- **GAP-B3 correction (RULE 13):** planning found GAP-B3 **largely already closed
  for `read_content`** — `feedback.service.ts runLoop5Once` (via
  `readService.onContentRead`) emits the existing `ANOMALY_DETECTED` audit and
  calls `setMultiplier("read_content:entity:<id>", 0.5, 3600)`; the gateway reads
  the matching `getMultiplier(...)` (`effectiveLimit = perMinute * multiplier`).
  Anomaly→backpressure IS wired for read_content. G4-B1 does not re-wire it.
- **Rate-limit-denial audit landed:** NEW additive `RATE_LIMITED` literal (union +
  AUDIT_EVENT_TYPE_VALUES; ANOMALY_DETECTED precedent; no ADR-0002). Gateway 429
  branch: structured-logger warn for ALL denials (safe metadata) + a hash-chained
  `RATE_LIMITED` (DENIED) **only on first breach per key/window AND only when an
  authenticated entity is present** (per-entity chain; unauthenticated denials are
  logger-only to avoid SYSTEM_CHAIN_KEY contention per GAP-O1). ip_hash =
  HMAC-SHA256(ip, jwtSecret); **never raw IP/UA/body/query/token**.
- **No backpressure/multiplier change; no rate-limit.ts/redis.ts/feedback.service
  change; no auth.service/route/session change.** G4-A keying/fallback/health
  exemption/429 envelope preserved. **No schema; no dependency.**
- **G4-B2 (bot/swarm) / G4-C (privileged throttle) / G4-D (perf) remain separate**
  forward-substrate; **GOVSEC.5/7 remain separate.**
- **Tests:** MOD `tests/integration/gateway.test.ts` — authenticated first-breach →
  one RATE_LIMITED row (safe metadata, verifyAuditChain valid); unauthenticated →
  no chain row.

**Substrate sites (7)**: MOD `packages/database/src/queries/audit.ts` + MOD
`apps/api/src/middleware/gateway.middleware.ts` + MOD
`tests/integration/gateway.test.ts` + MOD `docs/reference/govsec-control-matrix.md`
+ MOD `docs/reference/section-12-progress.md` + MOD this `CURRENT_BUILD_STATE.md` +
MOD `docs/architecture/decisions/0049-govsec-government-grade-hardening.md`.

Founder authorization explicit at
`[GOVSEC-GOVERNMENT-GRADE-HARDENING-G4B1-RATE-LIMIT-AUDIT-EXECUTE-VERIFY-AUTH]`.

---

#### GOVSEC.4 G4-B2-A LANDED — Adversarial Swarm Harness + Readiness (GAP-B2 baseline) (2026-05-21)

**Status:** GOVSEC.4 G4-B2-A `[GOVSEC-GOVERNMENT-GRADE-HARDENING]` landing — test +
docs only (1 NEW test + 4 docs = 5 files) per Founder Q-GOVSEC4B2-α α-6 + β-4 + γ-5
+ δ-3/δ-4 + ε-1 + ζ-1/ζ-3 + η-2/η-3 + θ-3 + ι-3 + κ-2 LOCKS at
`[GOVSEC-GOVERNMENT-GRADE-HARDENING-G4B2A-SWARM-HARNESS-READINESS-EXECUTE-VERIFY-AUTH]`.

- **G4-B2 split:** B2-A = adversarial-sim harness + readiness/design (test + docs
  only); B2-B = production swarm counter, sequenced **after G4-D** perf.
- **No production code** — no gateway.middleware.ts / rate-limit.ts / redis.ts /
  feedback.service.ts / audit.ts change; no audit literal; no schema; no
  dependency; no backpressure code; no swarm counter.
- **GAP-B2 ↔ GAP-O2 coupling documented:** a general swarm signal needs an
  aggregate counter → operation-global = Redis hot key (GAP-O2 collapse);
  hashed-IP-cluster reduces it but still adds a per-request Redis op → must be
  measured by G4-D. Productionizing before G4-D risks the GAP-O2 failure mode.
- **Harness (`tests/integration/gateway-swarm.test.ts`) proves current posture:**
  single-source floods (login + default fallback) are **shed** by G4-A per-key
  limits; a **distributed-under-limit swarm is NOT shed today** (the residual,
  named so G4-B2-B can flip the expectation); health stays exempt under load.
- **GAP-B2 remains behaviorally OPEN** — closure is G4-B2-B after G4-D.
- **Future B2-B design (deferred):** synthetic keys via existing
  `RateLimitStore.hit`; operation + hashed-IP cluster; optional `setMultiplier`
  backpressure via the existing multiplier path; logger-only/no SYSTEM_CHAIN_KEY
  for unauthenticated; authenticated denials via G4-B1 RATE_LIMITED; thresholds
  after G4-D perf budget.
- **G4-D owns perf (GAP-O2/O7); G4-C owns privileged throttle (GAP-B4) w/
  GOVSEC.5; GOVSEC.5/7 remain separate.**

**Substrate sites (5)**: NEW `tests/integration/gateway-swarm.test.ts` + MOD
`docs/reference/govsec-control-matrix.md` + MOD
`docs/reference/section-12-progress.md` + MOD this `CURRENT_BUILD_STATE.md` + MOD
`docs/architecture/decisions/0049-govsec-government-grade-hardening.md`.

Founder authorization explicit at
`[GOVSEC-GOVERNMENT-GRADE-HARDENING-G4B2A-SWARM-HARNESS-READINESS-EXECUTE-VERIFY-AUTH]`.

---

#### GOVSEC.4 G4-D-D1 LANDED — Gateway Perf Op-Count Baseline + p99 Runbook (GAP-O2/O7) (2026-05-21)

**Status:** GOVSEC.4 G4-D-D1 `[GOVSEC-GOVERNMENT-GRADE-HARDENING]` landing — test +
docs only (1 NEW test + 1 NEW runbook + 4 docs = 6 files) per Founder
Q-GOVSEC4D-α α-5 + β-3/β-4 + γ-2/γ-3 + δ-1 + ε-3 + ζ-1/ζ-2 + η-3 LOCKS at
`[GOVSEC-GOVERNMENT-GRADE-HARDENING-G4D-D1-PERF-BASELINE-EXECUTE-VERIFY-AUTH]`.

- **Measure-first.** G4-D split: D1 = op-count baseline + p99 runbook + docs; D2 =
  optimization; D3 = post-optimization verification; G4-B2-B after D3.
- **No production code.** No gateway.middleware.ts / rate-limit.ts / redis.ts /
  feedback.service.ts / audit.ts change; no auth/schema/dependency/package/
  lockfile/CI change; no optimization.
- **CI cannot measure Redis** (no Redis service; tests use `MemoryRateLimitStore`)
  → CI gates a **deterministic op-count contract**; real Redis p99 is a
  **local/manual runbook**.
- **Op-count contract** (`tests/integration/gateway-perf-budget.test.ts`, via a
  test-only `CountingRateLimitStore`): health = **0** store calls; unauth
  governed / fallback = **1 hit + 1 getMultiplier + 0 setMultiplier**;
  authenticated governed = same store budget + the documented STEP-1 ip_whitelist
  `getOrgSettingsOrDefaults` **DB read**; 429-first-breach adds **no extra store
  calls** + **0 setMultiplier**. No timing/p99 in CI.
- **Runbook** (`docs/reference/govsec-perf-budget.md`): Redis round-trip baseline
  (`hit` = INCR + first-EXPIRE + TTL, **not pipelined**, ~2-3 round-trips;
  `getMultiplier` GET; ~3-4 round-trips/governed req), the D2 optimization
  targets, the local p99 procedure, privacy constraints, and G4-B2-B gating.
- **GAP-O2 closure pending D2/D3.** **GAP-O7** (working-set route p99) is a focused
  follow-on, **NOT closed by D1**.
- **G4-B2-B blocked until D3; G4-C / GOVSEC.5 / GOVSEC.7 remain separate.**

**Substrate sites (6)**: NEW `tests/integration/gateway-perf-budget.test.ts` + NEW
`docs/reference/govsec-perf-budget.md` + MOD `docs/reference/govsec-control-matrix.md`
+ MOD `docs/reference/section-12-progress.md` + MOD this `CURRENT_BUILD_STATE.md` +
MOD `docs/architecture/decisions/0049-govsec-government-grade-hardening.md`.

Founder authorization explicit at
`[GOVSEC-GOVERNMENT-GRADE-HARDENING-G4D-D1-PERF-BASELINE-EXECUTE-VERIFY-AUTH]`.

---

#### GOVSEC.4 G4-D-D2-A LANDED — Redis `hit` Hot-Path Optimization (single atomic Lua `EVAL`) (GAP-O2) (2026-05-21)

**Status:** GOVSEC.4 G4-D-D2-A `[GOVSEC-GOVERNMENT-GRADE-HARDENING]` landing —
production code + test + docs (1 MOD production + 1 NEW unit test + 5 MOD docs =
7 files) per Founder Q-GOVSEC4D-D2 LOCKS at
`[GOVSEC-GOVERNMENT-GRADE-HARDENING-G4D-D2A-REDIS-HIT-OPTIMIZATION-EXECUTE-VERIFY-AUTH]`.

- **D2 split.** D2-A = `RedisRateLimitStore.hit` only; **D2-B** (`getMultiplier`)
  deferred (co-designed with G4-B2-B, the swarm counter); **D2-C** (ip_whitelist
  DB read) deferred → GOVSEC.7.
- **Optimization.** `hit` is now a **single atomic Lua `EVAL`** (`HIT_LUA`: `INCR`
  + conditional first-hit `EXPIRE` + `TTL`, returning `{count, ttl}`) → **1
  round-trip** (down from ~2-3, not pipelined). Lua over pipeline/MULTI because the
  `EXPIRE` is conditional on the `INCR` result, which a single pipeline cannot
  express.
- **Latent-race fix.** A crash between the old separate `INCR` and the first-hit
  `EXPIRE` could orphan a no-TTL key (a permanent block for that key); the EVAL
  makes INCR + first-hit EXPIRE + TTL indivisible.
- **Behavior unchanged.** `count` / `ttl_seconds` (same `> 0` fallback) / the 429
  Retry-After are identical; errors propagate as before (no new fail-open /
  fail-closed / retry). `MemoryRateLimitStore` / `setMultiplier` / `getMultiplier`
  / `reset` **untouched**.
- **Test.** NEW `tests/unit/rate-limit.test.ts` (hand-rolled fake ioredis client;
  no real Redis, no timing/p99): exactly one `.eval` per `hit`; no separate
  `incr`/`expire`/`ttl`; script has INCR + conditional EXPIRE + TTL; parses
  `[count, ttl]` → `{count, ttl_seconds}` with the `<= 0` fallback; error
  propagation; `getMultiplier`/`setMultiplier` still GET / SET-EX with no `eval`.
  The G4-D-D1 `gateway-perf-budget.test.ts` op-count contract stays green
  unchanged (the gateway still calls `hit` once).
- **No** schema / dependency / package / lockfile / CI / Elixir / audit-architecture
  change; **no** `gateway.middleware.ts` change; **no ADR-0002 amendment**.
- **GAP-O2 closure still pending D3** (post-optimization verification). **GAP-O7**
  (working-set route p99) is **NOT closed here**.
- **G4-B2-B remains after D3; D2-B / D2-C / G4-C / GOVSEC.5 / GOVSEC.7 untouched.**

**Substrate sites (7)**: MOD `apps/api/src/rate-limit.ts` + NEW
`tests/unit/rate-limit.test.ts` + MOD `docs/reference/govsec-perf-budget.md` + MOD
`docs/reference/govsec-control-matrix.md` + MOD
`docs/reference/section-12-progress.md` + MOD this `CURRENT_BUILD_STATE.md` + MOD
`docs/architecture/decisions/0049-govsec-government-grade-hardening.md`.

Founder authorization explicit at
`[GOVSEC-GOVERNMENT-GRADE-HARDENING-G4D-D2A-REDIS-HIT-OPTIMIZATION-EXECUTE-VERIFY-AUTH]`.

---

#### GOVSEC.4 G4-D-D3 LANDED — Post-Optimization Verification + Status Recording (GAP-O2) (2026-05-21)

**Status:** GOVSEC.4 G4-D-D3 `[GOVSEC-GOVERNMENT-GRADE-HARDENING]` landing —
**docs-only** (5 MOD docs) per Founder LOCKS at
`[GOVSEC-GOVERNMENT-GRADE-HARDENING-G4D-D3-POST-OPTIMIZATION-VERIFICATION-EXECUTE-VERIFY-AUTH]`.

**G4-D-D3 verifies the D2-A Redis hit optimization and op-count budget, records GAP-O2 as optimization-verified under the documented local/manual p99 posture, keeps GAP-O7 open, and unblocks G4-B2-B without implementing it.**

- **Docs-only.** Production behavior is already verified by the existing tests and
  CI; no new code, no new test artifact. D3's only remaining work is
  status/closure recording.
- **Optimization landed.** G4-D-D2-A at `b6fe3b0aa84ac2630da0614041fcdfef344c7c51`;
  CI run `26265354599` passed all four jobs (Typecheck, Unit, Integration, Elixir).
- **D2-A evidence (re-confirmed):** `apps/api/src/rate-limit.ts` has `HIT_LUA`
  (INCR + conditional EXPIRE when `count == 1` + TTL); `hit()` uses one
  `this.client.eval` call; `ttl_seconds` fallback remains `ttl > 0 ? ttl :
  ttlSeconds`; existing error propagation preserved; no separate `client.incr` /
  `client.expire` / `client.ttl` hot-path calls remain; `tests/unit/rate-limit.test.ts`
  verifies EVAL semantics + fallback; `tests/integration/gateway-perf-budget.test.ts`
  verifies the gateway op-count budget (gateway still calls `hit` once; governed
  budget remains 1 hit + 1 getMultiplier + 0 setMultiplier; 429 adds no extra store
  calls); `gateway-swarm` green; full integration green; full CI green; the no-TTL
  orphan-key race is fixed by the atomic Lua EVAL.
- **GAP-O2 (conservative):** optimization verified; op-count budget verified;
  G4-B2-B unblocked. **Redis p99 / wall-clock burst behavior remains the documented
  local/manual runbook evidence (`docs/reference/govsec-perf-budget.md` §6/§9), NOT
  asserted as CI-closed.** No CI p99/timing assertions added.
- **GAP-O7 remains open** — working-set route p99 not solved, not closed.
- **G4-B2-B unblocked after D3** (post-optimization budget verified) **but NOT
  implemented** — a separate future phase. No production swarm counter, no
  `swarm:op` keys, no gateway `setMultiplier` call, no multiplier / backpressure /
  ip_whitelist change.
- **Deferrals preserved:** D2-B (`getMultiplier`) deferred + co-designed with
  G4-B2-B; D2-C (ip_whitelist DB read) deferred → GOVSEC.7; G4-C separate (tied to
  GOVSEC.5); GOVSEC.5 / GOVSEC.7 untouched.
- **No** production / test / schema / dependency / package / lockfile / CI /
  Elixir / `gateway.middleware.ts` / ADR-0002 / CLAUDE.md / README change.

**Substrate sites (5, docs-only)**: MOD `docs/reference/govsec-control-matrix.md`
+ MOD `docs/reference/govsec-perf-budget.md` + MOD
`docs/reference/section-12-progress.md` + MOD this `CURRENT_BUILD_STATE.md` + MOD
`docs/architecture/decisions/0049-govsec-government-grade-hardening.md`.

Founder authorization explicit at
`[GOVSEC-GOVERNMENT-GRADE-HARDENING-G4D-D3-POST-OPTIMIZATION-VERIFICATION-EXECUTE-VERIFY-AUTH]`.

---

#### GOVSEC.4 G4-B2-B LANDED — Production Swarm Counter (Fork α direct cluster shed) (GAP-B2 closure) (2026-05-21)

**Status:** GOVSEC.4 G4-B2-B `[GOVSEC-GOVERNMENT-GRADE-HARDENING]` landing — code +
tests + docs (9 files) per Founder LOCKs at
`[GOVSEC-GOVERNMENT-GRADE-HARDENING-G4B2-B-PRODUCTION-SWARM-COUNTER-EXECUTE-VERIFY-AUTH]`.

**GAP-B2 behaviorally CLOSED:** the distributed-under-limit swarm (many sources,
each within its own per-key limit) is now shed by an aggregate cluster counter; the
per-key limit stays the primary control.

- **Fork α — direct cluster shed** (NOT Fork β multiplier-backpressure).
- **Key shape:** `swarm:<op>:cluster:<bucket>`, `bucket = HMAC-SHA256(ip,
  jwtSecret) % 64` (reuses the G4-B1 ip_hash HMAC). **No raw IP / UA / body / token
  / entity ID / PII** in the key. Bounded cardinality ≈ operations × 64 keys per
  60s window — no operation-global hot key (GAP-O2).
- **Mechanism:** the gateway calls the existing `store.hit(swarmKey, 60)` (same
  D2-A atomic Lua EVAL fixed-window) **only** for requests that passed the per-key
  check; cluster count > per-op threshold → 429 (Retry-After from the cluster `hit`
  TTL). **No `setMultiplier`, no second `getMultiplier`** (Fork α; **D2-B remains
  deferred**). `RedisRateLimitStore` / `RateLimitStore` interface / `HIT_LUA` /
  `MemoryRateLimitStore` **untouched**.
- **Thresholds:** conservative per-op defaults (`SWARM_DEFAULT_LIMITS` /
  `SWARM_DEFAULT_FALLBACK`) + `SWARM_CLUSTER_COUNT=64` in `gateway.middleware.ts`,
  overridable per build (`buildApp({ swarmThresholdOverrides, swarmClusterCount })`)
  for deterministic tests. No DB read, no org settings, no `getOrgSettingsOrDefaults`,
  no schema.
- **Failure:** the swarm `hit` error propagates exactly like the per-key `hit` (no
  new fail-open / fail-closed / retry).
- **Audit/logging:** swarm denials are logger-only (privacy-safe, hashed IP); **no
  `SWARM_DETECTED` literal; no ADR-0002 amendment**; the G4-B1 first-breach chain
  audit is unchanged.
- **Op-count budget (intentional, gated on G4-D):** governed (passes per-key) now
  **2 hit + 1 getMultiplier + 0 setMultiplier** (per-key 429 short-circuits before
  the swarm counter = 1 hit; swarm 429 = 2 hit); health/unmapped stay as required.
- **Tests:** `gateway-swarm.test.ts` flips the two G4-B2-A residual cases to SHED +
  asserts the swarm key shape and that no raw IP appears in swarm keys
  (deterministic via N=1 + low thresholds + a recording store);
  `gateway-perf-budget.test.ts` op-count contract updated to 2 hit + 1
  getMultiplier + 0 setMultiplier (per-key 429 = 1 hit).
- **GAP-O7 remains open** — not closed; no route-p99 closure language; no CI
  p99/timing assertions.
- **Deferrals preserved:** D2-B / D2-C (→ GOVSEC.7) / G4-C (tied to GOVSEC.5) /
  GOVSEC.5 / GOVSEC.7 untouched.

**Substrate sites (9):** MOD `apps/api/src/middleware/gateway.middleware.ts` + MOD
`apps/api/src/server.ts` (buildApp test-injection wiring) + MOD
`tests/integration/gateway-swarm.test.ts` + MOD
`tests/integration/gateway-perf-budget.test.ts` + MOD
`docs/reference/govsec-control-matrix.md` + MOD `docs/reference/govsec-perf-budget.md`
+ MOD `docs/reference/section-12-progress.md` + MOD this `CURRENT_BUILD_STATE.md` +
MOD `docs/architecture/decisions/0049-govsec-government-grade-hardening.md`.

Founder authorization explicit at
`[GOVSEC-GOVERNMENT-GRADE-HARDENING-G4B2-B-PRODUCTION-SWARM-COUNTER-EXECUTE-VERIFY-AUTH]`.

---

#### GOVSEC.4 G4-D-D2-B LANDED — getMultiplier Optimization (Fork B docs-only no-op) (GAP-O2) (2026-05-21)

**Status:** GOVSEC.4 G4-D-D2-B `[GOVSEC-GOVERNMENT-GRADE-HARDENING]` landing —
**docs-only no-op** (5 MOD docs) per Founder Fork B LOCK at
`[GOVSEC-GOVERNMENT-GRADE-HARDENING-G4D-D2B-GETMULTIPLIER-OPTIMIZATION-EXECUTE-VERIFY-AUTH]`.

**`getMultiplier` has no safe further optimization at this phase — Fork B (no-op)
chosen; Fork A (producer-scoped skipping) rejected by default. No code or tests
change.**

- **getMultiplier substrate:** already **one minimal Redis GET / O(1)**; exactly
  **one production call site** (`apps/api/src/middleware/gateway.middleware.ts`
  `store.getMultiplier(key)`); **G4-B2-B added no second `getMultiplier` call** (the
  swarm path uses `store.hit` only).
- **setMultiplier / Loop-5:** the only production producer remains Loop-5
  (`apps/api/src/services/feedback/feedback.service.ts`
  `setMultiplier("read_content:entity:<id>", 0.5, 3600)`); only `read_content` has a
  producer; the TTL (3600s) + behavior are unchanged.
- **Caching rejected** — stale-multiplier risk (delayed Loop-5 throttle observation,
  stale `1.0`, or stale throttle after Redis expiry) weakens a security control.
- **Producer-scoped skipping (Fork A) rejected by default** — coupling the gateway
  to the producer set risks a silent backpressure bypass if a future producer targets
  another operation without updating gateway eligibility.
- **Combined `hit`+multiplier EVAL rejected** — would require forbidden `HIT_LUA` /
  `RedisRateLimitStore.hit` / `RateLimitStore` interface changes.
- **No code change; no tests added.** **Op-count budget unchanged** (passing per-key
  = 2 hit + 1 getMultiplier + 0 setMultiplier; per-key 429 = 1 hit; swarm 429 = 2
  hit); **Redis round-trip budget unchanged**.
- **Next real performance lever = D2-C (the authenticated STEP-1 ip_whitelist
  `getOrgSettingsOrDefaults` DB read), deferred to GOVSEC.7.** GAP-O2 stays
  optimization-verified under the documented local/manual p99 posture; **GAP-O7
  remains open**; no CI p99/timing assertions. G4-C separate (tied to GOVSEC.5);
  GOVSEC.5 / GOVSEC.7 untouched.

**Substrate sites (5, docs-only):** MOD `docs/reference/govsec-control-matrix.md` +
MOD `docs/reference/govsec-perf-budget.md` + MOD
`docs/reference/section-12-progress.md` + MOD this `CURRENT_BUILD_STATE.md` + MOD
`docs/architecture/decisions/0049-govsec-government-grade-hardening.md`.

Founder authorization explicit at
`[GOVSEC-GOVERNMENT-GRADE-HARDENING-G4D-D2B-GETMULTIPLIER-OPTIMIZATION-EXECUTE-VERIFY-AUTH]`.

---

#### GOVSEC.5 G4-C LANDED — Privileged-Route Throttle (4 dual-control PRIVILEGED_ENDPOINTS routes) (GAP-B4 slice) (2026-05-21)

**Status:** GOVSEC.5 G4-C `[GOVSEC-GOVERNMENT-GRADE-HARDENING]` landing — code +
tests + docs (8 files) per Founder LOCKs at
`[GOVSEC-GOVERNMENT-GRADE-HARDENING-GOVSEC5-G4C-PRIVILEGED-ROUTE-THROTTLE-EXECUTE-VERIFY-AUTH]`.

**GAP-B4 throttle slice CLOSED for the 4 dual-control `PRIVILEGED_ENDPOINTS`
routes.** G4-C is a GOVSEC.4-tail throttle slice coordinated with GOVSEC.5;
**GOVSEC.5 is NOT closed.**

- **Routes** (method-exact, mirroring `apps/api/src/security/privileged-endpoints.ts`):
  `PATCH /api/v1/platform/monetization/config`, `POST /api/v1/platform/orgs`,
  `POST /api/v1/regulator/access-grants`, `POST /api/v1/regulator/access-revocations`.
- **Framing correction:** post-G4-A these were governed by the generous `default`
  fallback (300/min), not literally unthrottled; G4-C maps them to a strict
  `privileged` gateway op (**5/min, entity-scoped**, matching the admin_reset posture).
- **Placement:** gateway data-table only — NEW `DEFAULT_LIMITS.privileged` (5/min) +
  4 NEW method-exact `OPERATION_RULES` patterns in `gateway.middleware.ts`.
  `detectOperation` logic, dual-control middleware, `requireDualControl`, admin
  middleware, auth-admin routes, route preHandlers, and the `privileged-endpoints.ts`
  registry are **unchanged** — two-person authorization is untouched; the gateway is
  the pre-auth throttle layer.
- **Op-count budget UNCHANGED** (these routes already passed through the gateway
  fallback): passing privileged request = 2 hit + 1 getMultiplier + 0 setMultiplier;
  per-key 429 = 1 hit; swarm 429 = 2 hit; the B2-B swarm counter still runs after the
  per-key check.
- **Audit:** reuses the G4-B1 `RATE_LIMITED` first-breach audit + logger; **no new
  audit literal** (no `PRIVILEGED_RATE_LIMITED`, no `SWARM_DETECTED`); **no ADR-0002
  amendment**.
- **Tests:** NEW `tests/integration/gateway-privileged-throttle.test.ts` (each of the
  4 routes 429s at the strict privileged limit; an ordinary unmapped route at the
  same volume does NOT 429 — distinct classification; method-exactness); MOD
  `tests/integration/gateway-perf-budget.test.ts` (privileged op-count case = 2 hit +
  1 getMultiplier + 0 setMultiplier + a `privileged` override).
- **GOVSEC.5 NOT closed** — broader org-admin `requireAdminCapability` route set +
  dual-control self-approval resolution + break-glass / time-boxed audit remain open
  follow-ons.
- **GAP-O7 remains open**; no CI p99/timing assertions; D2-C / ip_whitelist /
  `getOrgSettingsOrDefaults` untouched (→ GOVSEC.7); GOVSEC.7 untouched.

**Substrate sites (8):** MOD `apps/api/src/middleware/gateway.middleware.ts` + MOD
`tests/integration/gateway-perf-budget.test.ts` + NEW
`tests/integration/gateway-privileged-throttle.test.ts` + MOD
`docs/reference/govsec-control-matrix.md` + MOD `docs/reference/govsec-perf-budget.md`
+ MOD `docs/reference/section-12-progress.md` + MOD this `CURRENT_BUILD_STATE.md` +
MOD `docs/architecture/decisions/0049-govsec-government-grade-hardening.md`.

Founder authorization explicit at
`[GOVSEC-GOVERNMENT-GRADE-HARDENING-GOVSEC5-G4C-PRIVILEGED-ROUTE-THROTTLE-EXECUTE-VERIFY-AUTH]`.

---

#### GOVSEC.5 Self-Approval Resolution LANDED — dual-control two-person invariant (GAP-C1) (2026-05-21)

**Status:** GOVSEC.5 self-approval resolution `[GOVSEC-GOVERNMENT-GRADE-HARDENING]`
landing — code + tests + docs (6 files) per Founder LOCKs at
`[GOVSEC-GOVERNMENT-GRADE-HARDENING-GOVSEC5-SELF-APPROVAL-RESOLUTION-EXECUTE-VERIFY-AUTH]`.

**GAP-C1 RESOLVED — the initiator can no longer approve/resolve their own
dual-control escalation. GOVSEC.5 remains OPEN** (break-glass / time-boxed audit
GAP-K1 + broader org-admin route set remain).

- **Fix:** `apps/api/src/services/governance/escalation.service.ts`
  `transitionPendingForCaller` now enforces `caller === source_entity_id →
  ESCALATION_FORBIDDEN`, checked **before** the target/resolver gate so it holds
  even for the **self-target dual-control placeholder** (`target_entity_id ===
  source_entity_id`, from `getOrCreatePendingDualControlForCaller`) that previously
  let `caller === target` self-resolve a hollow dual-control.
- **Approver model:** smallest substrate-safe — a hard `resolver ≠ source`
  rejection at the existing transition gate. **No new approver registry; no schema
  change** (the model already has `source_entity_id` / `target_entity_id` /
  `resolved_by_entity_id`); the placeholder is **not** replaced (org-admin-set
  resolution remains forward-queued).
- **Distinct-approver path preserved:** a distinct target / designated resolver
  (≠ source) still approves (existing `escalation.test.ts` cases unchanged).
- **Read-side unchanged:** `requireDualControl` is untouched; reuses the existing
  `ESCALATION_FORBIDDEN` error (already mapped to 403 by `escalation.routes.ts`) +
  the `ADMIN_ACTION` audit. **No new audit literal, no `audit.ts` change, no
  ADR-0002 amendment.**
- **Substrate-honest note:** because the distinct-approver-target *creation* path
  (org-admin-set resolution) is forward-queued, the self-target dual-control
  escalation is now **fail-closed** (un-approvable) — safe; it closes the hollow
  self-approval, and the 4 G4-C privileged routes require a distinct approver.
- **Tests:** `tests/unit/escalation.test.ts` adds the self-target self-approval +
  self-reject rejection cases (GAP-C1); existing distinct-approver success +
  invalid-transition cases preserved.
- **G4-C privileged throttle unchanged; G4-B2-B swarm unchanged.** GAP-O7 remains
  open; no CI p99/timing assertions; D2-C / ip_whitelist / `getOrgSettingsOrDefaults`
  untouched (→ GOVSEC.7); GOVSEC.7 untouched.

**Substrate sites (6):** MOD `apps/api/src/services/governance/escalation.service.ts`
+ MOD `tests/unit/escalation.test.ts` + MOD
`docs/reference/govsec-control-matrix.md` + MOD
`docs/reference/section-12-progress.md` + MOD this `CURRENT_BUILD_STATE.md` + MOD
`docs/architecture/decisions/0049-govsec-government-grade-hardening.md`.

Founder authorization explicit at
`[GOVSEC-GOVERNMENT-GRADE-HARDENING-GOVSEC5-SELF-APPROVAL-RESOLUTION-EXECUTE-VERIFY-AUTH]`.

---

## CAR Sub-box 3 (REGULATOR + Lawful-Basis per ADR-0036): CLOSED 2026-05-15

CAR Sub-box 3 mini-arc CLOSED at sub-phase 7 `[SUB-BOX-3-CLOSURE]`
(this commit) per ADR-0036 §Implementation Detail. 7-sub-phase
lineage: `4981d3a → db6e0d7 → d0b5c64 → f9d0694 → 71af2c6 →
d6f9e18 → this commit`. ADR-0036 Status: Accepted. ADR-0036
Sub-decisions 1-8 all RESOLVED.

The REGULATOR principal class distinct from GOVERNMENT +
LawfulBasis Prisma model + LawfulBasisType enum (6 values:
SUBPOENA + REGULATORY_AUTHORITY + COURT_ORDER + DPA_REQUEST +
MLAT_REQUEST + CONSENT_OF_DATA_SUBJECT) + 3 AuditEvent event_type
literals (REGULATOR_ACCESS_GRANTED + REGULATOR_ACCESS_REVOKED +
REGULATOR_ACCESS_EXPIRED-reserved) + canonical_record/1 12 → 14
fields at TS + Elixir registers (positions 13 + 14 =
lawful_basis_id + lawful_basis_chain_hash) + LawfulBasis Elixir
mirror + 12 byte-equivalence fixture pairs + dual-control-gated
REGULATOR grant + revoke routes (can_admin_niov-tier;
PRIVILEGED_ENDPOINTS Operations C + D) + REGULATOR lawful-basis
enforcement at COSMP NEGOTIATE / readContent (TOCTOU re-check) /
SHARE / REVOKE entry points (per-request indexed point-lookups;
no global lock; no unbounded capsule scans; no capsule-content
authorization reads; no cross-request cache; revocation + expiry
fail-closed for new checks) all LANDED.

NO new SYSTEM_PRINCIPAL added (Sub-decision 8 RESOLVED at
sub-phase 5 commit body — Option β; SYSTEM_PRINCIPALS
frozen-anchor count remains 5). Patent-relevant per CAR §2.2
Family 1; extends US 12,164,537 (COSMP) + US 12,399,904 (DMW)
into regulatory-access territory.

CAR Sub-box 2 Jurisdiction Tagging remains QUEUED (distinct
substrate per ADR-0036 §Substrate-Honest Distinctions;
`Entity.jurisdiction` + `MemoryCapsule.jurisdiction` +
`AuditEvent.jurisdiction` + `OrgSettings.default_jurisdiction`
+ `assertJurisdictionalScope()` NOT landed). Whole-COSMP
high-concurrency orchestration substrate (BEAM/Broadway/GenStage
backpressure; per-capsule supervision; cross-DMW coordination
layer; per-DMW throughput controls; streaming capsule push/pull
semantics; billion-scale operation under live concurrent load)
remains architectural intent / forward-substrate per ADR-0028 +
the 6 BEAM-compatibility patterns from ADR-0026 §5; NOT
implemented at sub-phase 6 / 7.

Full sub-phase narrative + 12 forward-queued items + 5
substrate-build observations canonical at
`docs/reference/section-12-progress.md` Sub-box 3 row
substantively at substantive register substantively. Full
ADR-0036 §Post-Closure Implementation Lineage canonical at the
ADR register substantively per Q-NEW-4 LOCKED Option α at
sub-phase 7.

---

## CAR Sub-box 2 (Jurisdiction Tagging per ADR-0037): CLOSED 2026-05-15

CAR Sub-box 2 mini-arc CLOSED at sub-phase 6 `[CAR-SUB-BOX-2-CLOSURE]`
(this commit) per ADR-0037 §Implementation Detail. 6-sub-phase
lineage: `c72fabd → 93f96ec → 3fab20d → 6efdf44 → 7faf2ac → this
commit`. ADR-0037 Status: Accepted. ADR-0037 Sub-decisions 1-9 all
RESOLVED.

The data-tier jurisdiction-tagging substrate for CAR §1.6 Regional /
Sovereignty Boundaries + §2.4 Jurisdictional Scope LANDED:
`Entity.jurisdiction` + `MemoryCapsule.jurisdiction` +
`AuditEvent.jurisdiction` + `OrgSettings.default_jurisdiction`
schema fields (all `String?` nullable) + 3 B-tree indexes (entities
+ memory_capsules + audit_events) + `assertJurisdictionalScope`
pure-function helper at
`apps/api/src/services/cosmp/jurisdiction-enforcement.ts` +
service-tier defaulting cascade at `createEntity` (passthrough) +
`createCapsule` (owner Entity cascade) + `writeAuditEvent` (row
metadata passthrough) + COSMP enforcement at NEGOTIATE start-check
(before owner shortcut) + readContent TOCTOU re-check (before
content load) + SHARE per-capsule + REVOKE bounded-bridge fetch +
per-capsule + WRITE create-time cascade + WRITE update-time
actor↔existing capsule jurisdiction enforcement + REGULATOR
`LawfulBasis.jurisdiction_invoked` ↔ `MemoryCapsule.jurisdiction`
match via basis-authoritative actor substitution (with null-capsule
backward-compat guard preserving Sub-phase 3/4 null/null
boundary).

Preserved substrate-coherence boundaries: AuditEvent.jurisdiction
remains row metadata only (NOT in canonical_record/1);
canonical_record/1 remains 14 fields; Elixir audit-chain UNCHANGED;
12 fixture pairs UNCHANGED; cosmp_router default tier 137/0
PRESERVED.

Test substrate at closure: TypeScript baseline 12 preserved; unit
tier 508/508; integration tier 198 + 1 skipped (171 baseline + 20
sub-phase 4 jurisdiction-COSMP-enforcement + 7 sub-phase 5 REGULATOR
Section I); cosmp_router default tier 137/0; CI green at every
sub-phase landing.

Downstream CAR Sub-boxes dependency-unblocked at substrate-state
ground truth register substantively: Sub-box 4 (DecisionRecord +
DataSubjectReference + Agent Attestation); Sub-box 5
(jurisdiction-aware deletion variants + GDPR Article 17
pseudonymization); Sub-box 8 (Cross-Tenant Compliance Benchmarking
+ meta-jurisdiction aggregates); Sub-box 9 (Capsule Compliance
Provenance).

5 substrate-build observations forward-queued in commit-body-only
register per Q-NEW-9 LOCKED at sub-phase 1 + subsequent sub-phase
LOCKs (D-SCHEMA-DEFAULT-CONSTANT-COHERENCE-DRIFT +
D-INTERNAL-HELPER-UNIT-TEST-IMPORT-CONVENTION +
D-COSMP-METADATA-SELECT-CLAUSE-DRIFT +
D-REGULATOR-ACTOR-JURISDICTION-POLICY-DECISION +
D-REGULATOR-NULL-CAPSULE-BACKWARD-COMPAT-BOUNDARY); NOT promoted to
ADR-0035 §9 numbered cluster.

Forward-queued items preserved per ADR-0037 §Forward Queue: physical
data residency enforcement; legal transfer determination engine
(Schrems II / GDPR Article 44-50); real-time country/legal rules
engine; cross-region capsule transfer workflow; multi-jurisdiction
capsule support; canonical_record/1 jurisdiction binding
(cryptographic) if future evidence justifies; Cross-Tenant
Compliance Benchmarking patent-relevance analysis per CAR §1.6
forward path; AuditEvent.jurisdiction automatic operation-context
propagation refinement; GLOBAL wildcard / jurisdiction vocabulary
lock; grantee↔capsule or grantee↔actor jurisdiction checks for
SHARE if future policy requires; full `getCapsuleMetadata`
projection repair.

NOT claimed: legal compliance certification; physical data residency
enforcement; full FedRAMP / CMMC / GDPR certification; legal
transfer determination; real-time country/legal rules engine;
multi-jurisdiction capsule support; cross-region transfer
workflow; canonical_record/1 jurisdiction binding (cryptographic);
per-target LawfulBasis binding; grantee jurisdiction checks at
SHARE; GLOBAL wildcard; Sub-boxes 4 / 5 / 8 / 9 implementation;
full DMW-to-DMW orchestration; BEAM/Broadway high-volume
orchestration in this mini-arc; Federation Cloud monetization;
external PKI / EU eIDAS / national registry integration; direct
patent relevance. Patent relevance: NONE directly per CAR §1.6
verbatim ("region tagging is conventional").

Full sub-phase narrative + verification matrix + downstream
unblocked statement canonical at
`docs/reference/section-12-progress.md` CAR Sub-box 2 row
substantively at substantive register substantively. Full ADR-0037
§Post-Closure Implementation Lineage canonical at the ADR register
substantively per Q-NEW-2 LOCKED Option α at sub-phase 6.

---

## Phase 3: Dynamic Memory Accuracy at Scale -- Sub-Arc 1 Sub-Phase a (DMWWorker per ADR-0038): CLOSED 2026-05-15

Phase 3 (Dynamic Memory Accuracy at Scale) sub-arc 1 sub-phase a
Commit 1 of 3 LANDED at this commit per SYNTHESIS-SUB-PHASE-A-
DECOMPOSITION. ADR-0038 NEW (DMW Worker per-DMW Supervised Process;
Status Proposed 2026-05-15) lands the substrate-architectural
canonical for the DMWWorker GenServer module that uses the BEAM
scaffolding LANDED at sub-phases 8-11 (:pg + Registry +
DynamicSupervisor + Cluster.Supervisor + Phoenix.PubSub +
Phoenix.Tracker + Telemetry).

8 sub-decisions all locked at α-default per Q-A through Q-G:

- Sub-decision 1: module location at
  `apps/dbgi_supervisor/lib/dbgi_supervisor/dmw_worker.ex`.
- Sub-decision 2: identity addressing by entity_id via
  `{:via, Registry, {DbgiSupervisor.Registry, entity_id}}` Registry
  key + `"dmw:#{entity_id}"` Phoenix.Tracker topic.
- Sub-decision 3: tier dispatch axis on WalletType 3-tier
  (PERSONAL + ENTERPRISE + DEVICE) right-sized for sub-phase a.
- Sub-decision 4: lifecycle pattern lazy-spawn on first COSMP
  operation against the wallet's entity_id (consumer-tier-cost
  framing preserved; idle wallets cost nothing at memory-footprint
  register).
- Sub-decision 5: state stateless plus Phoenix.Tracker presence only
  at sub-phase a (ETS cache substrate forward-substrate).
- Sub-decision 6: DMWWorker vs cosmp_router relationship
  separate-layer (DMWWorker runs dbgi-tier lifecycle and
  coordination substrate; cosmp_router stays as single-GenServer
  COSMP-op dispatcher at sub-phase a; re-wire forward-substrate to
  sub-arc 1 sub-phase b and beyond).
- Sub-decision 7: 6 BEAM-compatibility patterns from ADR-0026 §5
  preserved by construction.
- Sub-decision 8: testability per ADR-0034 (name-configurable
  substrate + start_supervised! patterns; tests exercise spawn via
  DynamicSupervisor + Registry lookup + Phoenix.Tracker presence on
  init + presence absence on terminate + tier-differentiated
  behavior + parallel DMWWorkers for distinct entity_ids +
  stop-then-restart resilience).

Hybrid hot/cold framing canonical at substantive register:
ENTERPRISE wallets run always-hot per-DMW supervised process +
PERSONAL and AI_AGENT wallets promote-on-activity from cold shard
substrate to hot per-DMW substrate + DEVICE wallets run always-cold
shard-mapped substrate.

ADR-0028 §Forward Queue NEW append-only LANDED sub-paragraph
(sub-arc 1 sub-phase a closure update; preserves existing sub-phase
13 LANDED sub-paragraph unchanged at chronology-preservation
register) marks per-capsule supervised Elixir process forward-queue
item as substantively progressed at per-DMW granularity per
ADR-0038. Per-capsule granularity at finer-grained register and
remaining forward-looking items (OtzarComm message routing at
scale; Python ML substrate; multi-region production topology;
migration triggers; `:gproc` backward-compatibility;
partition-tolerance expansion) remain forward-substrate.

ADR-0028 §Bidirectional citations (cited from) NEW entry (RULE 14
back-citation) appends to existing sub-block at lines 250+ matching
the existing entry format (bulleted with em-dash separator at
ADR-substrate canonical-coherence register; ADR-0028 pre-existing
em-dash convention preserved at chronology-preservation register).

3-commit decomposition per SYNTHESIS-SUB-PHASE-A-DECOMPOSITION:

- Commit 1 `[BEAM-DBGI-DMWWORKER-ADR]` (this commit) -- docs-only
  ADR-0038 NEW + ADR-0028 amendments + catalog refreshes.
- Commit 2 `[BEAM-DBGI-DMWWORKER-CODE]` (forward-substrate) --
  substantive code at canonical-execution register substantively:
  NEW `apps/dbgi_supervisor/lib/dbgi_supervisor/dmw_worker.ex` +
  DynamicSupervisor wiring + Registry integration + Phoenix.Tracker
  integration + tier dispatch + tests at
  `apps/dbgi_supervisor/test/dbgi_supervisor/dmw_worker_test.exs`.
- Commit 3 `[BEAM-DBGI-DMWWORKER-CLOSURE]` (forward-substrate) --
  docs-only closure cascade: ADR-0038 Status Proposed → Accepted +
  NEW Post-Closure Implementation Lineage section + this section
  CLOSED + section-12-progress.md row CLOSED + architecture/README
  + CLAUDE.md ADR catalog ADR-0038 entry refresh + ADR-0028 second
  amendment if any.

Substrate-state ground truth register: sub-phase a delivers the
per-DMW supervised process substrate that the scaffolding has been
wired for. cosmp_router re-wire forward-substrate to sub-arc 1
sub-phase b and beyond; the architectural target named in the
README and monetization essay (hundreds to thousands of parallel
COSMP operations for the workloads that need it) does not deliver
at runtime until sub-arc 1 sub-phase b and beyond complete.

7 substrate-build observations forward-queued at commit-body-only
register substantively per Option β substrate-honest discipline:
D-AUTHORIZATION-PASTE-PROSE-VS-SCOPE-DISTINCTION +
D-ADR-CATALOG-ENTRY-CHRONOLOGY-RESIDUAL +
D-PUSH-RECONCILIATION-MID-COMMIT +
D-OPERATOR-CORRECTION-EXTENSION-DISCIPLINE +
D-OPERATOR-FRAMING-REALIGNMENT-DISCIPLINE +
D-SUBSTANTIVE-CASCADE-PROSE-DRIFT +
D-ADR-AMENDMENT-PATTERN-VARIANCE-DISCIPLINE (NEW canonical at this
commit). NOT promoted to ADR-0035 §9 numbered cluster.

Full sub-phase narrative + substrate-architectural framing
canonical at `docs/architecture/decisions/0038-dmw-worker-per-dmw-supervised-process.md`
ADR register substantively. Full section-12-progress.md row
canonical at `docs/reference/section-12-progress.md` Phase 3 row
substantively at substantive register.

## Sub-Arc 1 Sub-Phase a closure update (2026-05-15)

3-commit decomposition LANDED. ADR-0038 Status: Proposed -> Accepted
at this commit. All 8 sub-decisions RESOLVED.

**3-commit mini-arc lineage:**

- Commit 1 `[BEAM-DBGI-DMWWORKER-ADR]` `3b431bf` (docs-only)
- Commit 2 `[BEAM-DBGI-DMWWORKER-CODE]` `56e0eaa` (substantive code:
  DMWWorker module 160 lines + public API +93 lines + 13 tests
  171 lines)
- Commit 3 `[BEAM-DBGI-DMWWORKER-CLOSURE]` this commit (docs-only
  closure cascade)

**Verification matrix at closure:**

- Elixir compile clean
- DMWWorker targeted tests 13/0
- Full dbgi_supervisor default tier 55/0 (42 baseline preserved)
- CI green at Commits 1 + 2

**Substrate-state ground truth at sub-phase a closure:**

DMWWorker substrate is canonical at runtime register. Per-DMW
supervised process substrate that the BEAM scaffolding has been wired
for now exists at runtime. The architectural target named in the
README and monetization essay (hundreds to thousands of parallel
COSMP operations per DMW for the workloads that need it) does NOT
yet deliver at runtime because cosmp_router single-GenServer pattern
remains the serialization bottleneck.

**Forward-substrate to sub-arc 1 sub-phase b:**

cosmp_router re-wire to dispatch through per-entity DMWWorkers +
ENTERPRISE always-hot per-DMW process pool + PERSONAL/AI_AGENT
promote-on-activity tier promotion substrate + DEVICE cold-shard
mapping with K=128-1024 consistent-hash shards.

## Phase 3 Sub-Arc 2 Gap 6 -- AI_AGENT EntityType-Discriminated Capsule Routing IN FLIGHT 2026-05-19 at G6.1 -- ADR-0046 NEW Proposed; G6.2 + G6.4 forward-substrate; G6.3 DEFERRED

**Status: IN FLIGHT** at G6.1 `[BEAM-CAPSULE-ROUTING-ADR]`.

Phase 3 (Dynamic Memory Accuracy at Scale) Sub-arc 2 Gap 6 (AI_AGENT
EntityType-Discriminated Capsule Routing) IN FLIGHT 2026-05-19 at
G6.1 per Founder Q-G6-α α-1 LOCK + Q-G6-β β-1 LOCK + Q-G6-γ γ-1 LOCK
+ Q-G6-δ δ-1 LOCK + Q-G6-ε ε-2 LOCK + Q-G6-ζ ζ-1 LOCK + Q-G6-η η-2
LOCK + Q-G6-θ θ-1 LOCK + Q-G6-ι ι-1 (refined) LOCK at
`[BEAM-CAPSULE-ROUTING-G6-QLOCK]` register substantively. ADR-0046
NEW (AI_AGENT EntityType-Discriminated Capsule Routing; Status
Proposed 2026-05-19). G6.1 does NOT close Gap 6; G6.4 closure cascade
flips ADR-0046 Status → Accepted at canonical-state register
substantively. Sub-arc 2 remains IN FLIGHT throughout G6.1-G6.4.
G6.3 substantive `resolveAiAgentWalletContext` helper canonical at
**DEFERRED** forward-substrate disposition per Founder G6.3
disposition LOCK (not in current closure path; may land later if
separate Founder QLOCK explicitly authorizes AND G6.2 verification
proves unresolved ambiguity at wallet-defaulting tier).

#### G6.1 LANDED — ADR-0046 NEW Proposed; dual-context AI_AGENT routing canonicalized for production/government readiness (2026-05-19)

**Status:** G6.1 `[BEAM-CAPSULE-ROUTING-ADR]` LANDED 2026-05-19
docs-only ADR creation (4 MOD + 1 NEW) per Founder Q-G6-α α-1 LOCK +
Q-G6-β β-1 LOCK + Q-G6-γ γ-1 LOCK + Q-G6-δ δ-1 LOCK + Q-G6-ε ε-2
LOCK + Q-G6-ζ ζ-1 LOCK + Q-G6-η η-2 LOCK + Q-G6-θ θ-1 LOCK + Q-G6-ι
ι-1 (refined) LOCK at `[BEAM-CAPSULE-ROUTING-G6-QLOCK]` +
`[BEAM-CAPSULE-ROUTING-G6.1-EXECUTE-VERIFY-AUTH]` register
substantively.

**Canonical dual-context AI_AGENT routing model lands at canonical-
prose register substantively per Founder dual-context correction at
`[BEAM-CAPSULE-ROUTING-G6-FOUNDER-CORRECTION]` register
substantively**:

- **Personal AI Agent context**: EntityType = AI_AGENT; WalletType =
  PERSONAL; EntityMembership(parent=PERSON owner, child=AI_AGENT);
  `niov_can_access_contents = true`; used by humans outside
  enterprise context and by digital twin flows per ADR-0001 design
  intent; **LIVE production product flow** via
  `apps/api/src/services/governance/twin.service.ts:189-191`
  explicit `wallet_type: "PERSONAL"` override.
- **Enterprise AI Agent context**: EntityType = AI_AGENT; WalletType
  = ENTERPRISE; EntityMembership(parent=COMPANY / organization /
  agency, child=AI_AGENT); `niov_can_access_contents = false`;
  **forward-substrate product surface** for autonomous AI agents
  owned by an enterprise / organization / agency; defensive
  infrastructure live via `packages/database/src/queries/wallet.ts:
  39-58` `defaultWalletTypeFor(AI_AGENT) = ENTERPRISE` RULE 0 safe
  default; no current product code path creates Enterprise AI Agent
  entities at HEAD `5fcdbde` register substantively.
- **Defensive fallback**: `defaultWalletTypeFor(AI_AGENT) =
  ENTERPRISE` canonical RULE 0 safe default for bare AI_AGENT
  creates without explicit context; preserves RULE 0 by avoiding
  accidental PERSONAL/human-authority assumptions for AI agent
  entities created outside the canonical Personal AI Agent (twin)
  onboarding flow.
- **Canonical context-resolution signals**: explicit `wallet_type`
  override in `CreateEntityInput` (twin path) + EntityMembership
  parent/child relationship (parent=PERSON → Personal AI Agent;
  parent=COMPANY → Enterprise AI Agent) + defensive fallback when
  context is ambiguous.

**Substrate sites (5 authorized files; 4 MOD; 1 NEW)**: NEW
`docs/architecture/decisions/0046-ai-agent-entity-type-discriminated-capsule-routing.md`
(canonical dual-context ADR with RULE 21 research arc embedded
RS-G6-1 through RS-G6-4; 11-row enforcement surface inventory; 10-row
adversarial threat model T1-T10; 8 RULE 13 substrate-honest drift
surfaces for G6.2 cascade; 10 Q-G6 sub-decisions canonical; 4-phase
Implementation Lineage with G6.3 DEFERRED) + MOD
`docs/reference/section-12-progress.md` (NEW Gap 6 row IN FLIGHT
with this G6.1 LANDED prose) + MOD this `docs/CURRENT_BUILD_STATE.md`
(NEW Gap 6 H2 + this G6.1 LANDED H4) + MOD
`docs/architecture/README.md` (NEW ADR-0046 catalog entry Status
Proposed 2026-05-19) + MOD `CLAUDE.md` (NEW ADR-0046 catalog mirror
entry Status Proposed 2026-05-19).

**Governing RULES at substrate-architectural register substantively**:
RULE 0 (Humans Always Sovereign; AI_AGENT routing cannot silently
expand authority; AI entities have lower default permission ceilings
than humans; AI cannot grant LONG_TERM/PERMANENT; AI cannot grant to
AI; AI sovereignty cap on FULL scope; explicit human/entity recall
and override preserved) + RULE 10 (no deletion semantics preserved
for AI_AGENT operations) + RULE 11 (Prisma/Ecto cross-language
ownership boundary preserved; BEAM observer-only at G6.1) + RULE 12
(pre-flight grep substrate-state ground truth verified at HEAD
`5fcdbde` register substantively; all anchor citations grep-confirmed
pre-authorization) + RULE 13 (8 substrate-honest drift surfaces
enumerated inline for G6.2 cascade per RULE 14 bidirectional citation
discipline) + RULE 20 (Founder authorization required and granted) +
RULE 21 (current-source research arc embedded RS-G6-1 through
RS-G6-4; 4 streams; 20+ documented public sources retrieved
2026-05-19).

**RULE 21 research arc embedded at ADR-0046 §Context register
substantively** (4 streams retrieved 2026-05-19):

- **RS-G6-1 agent identity vs storage/account separation** (Mem0 +
  Aembit + ResilientCyber + GitGuardian + Built In; 2026 industry
  direction: Microsoft Entra Agent ID + Okta AI Agents in Universal
  Directory + Google Vertex AI Agent Identity model AI agents as
  first-class identity principals distinct from service accounts
  and human users; multi-scope memory tagging emerging best
  practice).
- **RS-G6-2 confused-deputy in agentic systems** (Cloud Security
  Alliance + HashiCorp + Quarkslab + BeyondTrust + Safeguard.sh;
  classical confused-deputy access-control vulnerability re-emerged
  as high-severity 2026 threat pattern in AI agent deployments;
  MCP server design + memory-as-trusted-context features +
  multi-agent input chains are canonical attack surfaces; NIOV's
  `isRestrictedAiClass` + `ai_capped` + `ai_access_blocked` +
  `requires_validation` + AI-cannot-grant-to-AI + AI-cannot-raise-AI
  + AI-FULL-scope-silent-cap substantively implement canonical
  mitigations).
- **RS-G6-3 enterprise/government auditability** (Atlan + IBL +
  BigID + MarkTechPost + AGAT Software; federal/SOC 2 compliance
  demand every AI agent interaction logged + attributed + exportable
  for FOIA/IG investigations; column-level lineage for provenance;
  active metadata for freshness signals; decision traces for audit
  trails; chain-of-custody logging at autonomous-operation register).
- **RS-G6-4 NIST AI Agent Standards Initiative + least-privilege
  capability tokens** (Build MVP Fast + WorkOS + Security Boulevard
  + Biometric Update + CSA; February 2026 NIST Center for AI
  Standards and Innovation launched the AI Agent Standards
  Initiative; federal direction: zero-trust principles for agent
  authorization + least-privilege task-scoped capability tokens +
  short-lived expiring tokens + task-scoped permissions + action-
  level approvals + chain-of-custody logging; SP 800-53 control
  overlays in development).

**11-row enforcement surface inventory canonical at ADR-0046 §B**:
defaultWalletTypeFor RULE 0 defensive fallback (wallet.ts:39-58) +
AI_AGENT clearance_ceiling 2 (tar.ts:105) + sovereignty cap on
raising AI ceiling (tar.ts:376-395) + AI cannot grant to AI
(permission.ts:106-110) + AI grantors default SESSION_ONLY
(permission.ts:122) + isRestrictedAiClass (negotiate.service.ts:
142-143) + AI sovereignty cap on FULL scope (negotiate.service.ts:
577-585) + ai_capped audit metadata (negotiate.service.ts:625-630) +
similarity SQL filters (similarity.service.ts:305-307) + embedding
provider denial (embedding.service.ts:19) + twin EntityMembership
fusion (twin.service.ts:182-220).

**10-row adversarial threat model canonical at ADR-0046 §Threat
Model** (T1-T10; net verdict: no code-tier vulnerability at HEAD
`5fcdbde`; T1+T2+T4+T5+T7 are documentation-canonicalization gaps
ADR-0046 closes; T3+T6+T8+T9+T10 substantively defended at
canonical-execution register substantively).

**8 RULE 13 substrate-honest drift surfaces canonical at ADR-0046 §C
for G6.2 doc-and-test cascade**:

- ADR-0001 L46+L90 Personal DMW claim for digital twins (preserve +
  narrow to Personal AI Agent context at G6.2 Amendment 1)
- glossary "Digital Twin Wallet" entry (preserve + narrow at G6.2;
  add NEW "Personal AI Agent" + "Enterprise AI Agent" entries)
- ADR-0039 L106-108 + L250-253 + Sub-decision 8 Amendment 1
  (dual-context routing path documentation gap; Amendment 2 at G6.2)
- ADR-0041 §Sub-decision 6 hard-mapping prose (replace with dual-
  context model at G6.2 amendment)
- `apps/cosmp_router/lib/cosmp_router/wallet_lookup.ex` moduledoc
  (dual-context correction at G6.2)
- `apps/cosmp_router/lib/cosmp_router/schemas/wallet.ex` moduledoc
  (dual-context correction at G6.2)
- `apps/cosmp_router/lib/cosmp_router/activity_counter.ex` L57
  comment (dual-context correction at G6.2)
- `apps/cosmp_router/lib/cosmp_router/grpc/server.ex:266` "Forward-
  substrate to AI_AGENT branch" comment (closure at G6.2)

**Substrate-state ground truth at G6.1 PRE-FLIGHT register
substantively**: AI_AGENT entity creation in current product flows =
`twin.service.ts:182-220` via `dandelion.service.ts:396` (explicit
`wallet_type: "PERSONAL"` override at twin.service.ts:189-191 +
EntityMembership(parent=PERSON owner, child=AI_AGENT twin) at twin.
service.ts STEP 3); no current product code path creates Enterprise
AI Agent entities; `defaultWalletTypeFor(AI_AGENT) = ENTERPRISE` is
defensive infrastructure for forward-substrate product surface;
`niov_can_access_contents = false` for ENTERPRISE wallets canonical
at `wallet.ts:68-70` register substantively per RULE 0; tests/unit/
wallet.test.ts:73-77 anchors bare-default behavior; tests/unit/
wallet.test.ts:322-block anchors explicit override behavior.

**Forbidden / preserved boundaries enumerated at G6.1**: no apps/**
code changes; no packages/** changes; no tests/** changes; no
scripts/** changes; no schema.prisma changes; no Elixir code/
docstring changes (G6.2 owns); no ADR-0001 modification (G6.2 owns);
no ADR-0039 modification (G6.2 owns); no ADR-0041 modification (G6.2
owns); no glossary modification (G6.2 owns); no grpc/server.ex
modification (G6.2 owns); no audit.ts changes; no new audit literals
at G6.1 per Q-G6-ζ ζ-1 LOCK; no SimilarityService modification
(G3.9 J5-J8 privacy proofs preserved per Q-G6-ι inheritance); no
production-affecting actions; no real OpenAI calls; no Supabase
mutation; no Elixir vector access; no secret exposure. **Sub-arc 2
remains IN FLIGHT** per Q-G6-θ θ-1 LOCK + ADR-0041 CL.1 scope patch.

**G6.2 doc-and-test cascade forward-substrate next**: ADR-0001
Amendment 1 (preserve + narrow Personal DMW claim to Personal AI
Agent context; add Enterprise AI Agent context companion); ADR-0039
Amendment 2 (dual-context routing path documentation); ADR-0041
§Sub-decision 6 amendment (replace hard-mapping prose with dual-
context model); glossary "Digital Twin Wallet" preserved + narrowed
+ NEW "Personal AI Agent" + "Enterprise AI Agent" entries; 3 Elixir
module docstring corrections (wallet_lookup.ex + schemas/wallet.ex +
activity_counter.ex); grpc/server.ex:266 forward-substrate comment
closure; CLAUDE.md ADR-0001/0039/0041 catalog updates; NEW TS unit
tests per Q-G6-η η-2 LOCK proving dual-context behavior. G6.3
substantive `resolveAiAgentWalletContext` helper canonical at
**DEFERRED** forward-substrate disposition per Founder G6.3
disposition LOCK (not in current closure path). G6.4 closure cascade
forward-substrate after G6.2: ADR-0046 Status `Proposed 2026-05-19`
→ `Accepted 2026-05-XX` + Gap 6 row Status flip IN FLIGHT → CLOSED
+ README + CLAUDE.md ADR-0046 catalog refresh + Sub-arc 2 preserved
IN FLIGHT pending later Sub-arc 2 closure cascade per ADR-0041 CL.1
scope patch.

Founder authorization explicit per RULE 20 at
`[BEAM-CAPSULE-ROUTING-G6-QLOCK]` + `[BEAM-CAPSULE-ROUTING-G6.1-EXECUTE-VERIFY-AUTH]`.

#### G6.2 LANDED — ADR-0046 dual-context routing propagated across 13 substrate sites (2026-05-19)

**Status:** G6.2 `[BEAM-CAPSULE-ROUTING-DOC-AND-TEST-CASCADE]` doc-
and-test cascade LANDED 2026-05-19 (13 MOD + 0 NEW corrected) per
Founder Q-G6.2-α α-1 + Q-G6.2-β β-1 + Q-G6.2-γ γ-1 + Q-G6.2-δ δ-1 +
Q-G6.2-ε ε-1 + Q-G6.2-ζ ζ-1 + Q-G6.2-η η-1 + Q-G6.2-θ θ-1 + Q-G6.2-ι
(13 MOD + 0 NEW corrected) + Q-G6.2-κ κ-1 LOCKS at
`[BEAM-CAPSULE-ROUTING-G6.2-QLOCK]` +
`[BEAM-CAPSULE-ROUTING-G6.2-QLOCK-CORRECTION]` (substrate-state
drifts D-G6.2-1 file-count + D-G6.2-2 ADR-0001 / ADR-0039 filename
resolved) + `[BEAM-CAPSULE-ROUTING-G6.2-EXECUTE-VERIFY-AUTH]`
register substantively.

**G6.2 propagated ADR-0046 dual-context routing model across 13
substrate sites canonical at canonical-prose register substantively**:

- ADR-0001 in-place Amendment 1: preserve Personal DMW / digital
  twin claim verbatim + narrow to Personal AI Agent context + add
  companion Enterprise AI Agent context + RULE 14 bidirectional
  citation to ADR-0046.
- ADR-0039 in-place Amendment 2: substrate-honest correction at
  canonical-prose register substantively (L106-108 + L250-253 +
  §Sub-decision 1 + §Amendment 1); document dual-context dispatch
  path (Personal AI Agent twin → PERSONAL → personal/promote-on-
  activity dispatch shim; Enterprise AI Agent → ENTERPRISE →
  DMWWorker hot dispatch); wallet_type column is canonical BEAM
  dispatch signal; prior substrate-build observations + research
  arc + Horde + cosmp_router pure-module decisions preserved
  verbatim; RULE 14 bidirectional citation to ADR-0046.
- ADR-0041 §Sub-decision 6 amendment: replace hard-mapping prose
  ("AI_AGENT continues mapping to PERSONAL wallet_type") with
  ADR-0046 dual-context model; preserve Gap 6 lineage; preserve
  Sub-arc 2 IN FLIGHT.
- ADR-0046 update: G6.2 cascade section + Implementation Lineage
  G6.1 row anchored at `c130826` + G6.2 row flipped LANDED
  2026-05-19 + Founder Authorization G6.2 citations.
- Glossary update: narrow "Digital Twin Wallet" entry to Personal
  AI Agent / twin context; NEW "Personal AI Agent" entry; NEW
  "Enterprise AI Agent" entry; cite ADR-0046 throughout.
- section-12-progress: G6.2 LANDED prose appended to Gap 6 row;
  Gap 6 row Status preserved IN FLIGHT; Sub-arc 2 umbrella row
  Status preserved IN FLIGHT.
- this CURRENT_BUILD_STATE NEW H4 section.
- CLAUDE.md ADR-0001 / ADR-0039 / ADR-0041 / ADR-0046 catalog
  entries with G6.2 amendment summaries.
- 3 Elixir module docstring corrections (canonical dual-context
  language; ADR-0046 citations; no routing logic changes; no
  Translator behavior changes):
  - `apps/cosmp_router/lib/cosmp_router/wallet_lookup.ex` moduledoc
  - `apps/cosmp_router/lib/cosmp_router/schemas/wallet.ex` moduledoc
  - `apps/cosmp_router/lib/cosmp_router/activity_counter.ex` L57
    comment
- `apps/cosmp_router/lib/cosmp_router/grpc/server.ex:266` forward-
  substrate AI_AGENT branch comment closure: canonical disposition
  per ADR-0046 — AI_AGENT routing is canonical, no separate
  AI_AGENT branch needed (wallet_type column is the canonical
  BEAM dispatch signal per ADR-0039 §Amendment 2).
- `tests/unit/wallet.test.ts` NEW dual-context tests (4 NEW tests
  in NEW `describe("AI_AGENT dual-context routing (ADR-0046)")`
  block: explicit PERSONAL override on AI_AGENT → PERSONAL wallet
  + explicit ENTERPRISE override on AI_AGENT → ENTERPRISE wallet
  + bare AI_AGENT direct-create RULE 0 defensive fallback to
  ENTERPRISE preserved + niov_can_access_contents differs
  correctly between Personal AI Agent and Enterprise AI Agent
  contexts).

**G6.2 baseline deltas at canonical-execution register substantively**:
TS=12 baseline preserved; no-console 1/1 preserved; unit 562 → 566
(+4 NEW dual-context tests per Q-G6.2-ζ ζ-1 LOCK); integration
213+1 skipped preserved; mix compile clean; Elixir cosmp_router
223+1 skipped preserved; dbgi_supervisor 67/0/19 preserved.

**Critical coherence preserved at G6.2**: ADR-0046 Status
preserved `Proposed 2026-05-19` per Q-G6.2-κ κ-1 LOCK (G6.4 closure
cascade is canonical Status-flip commit); Gap 6 row Status
preserved IN FLIGHT; Sub-arc 2 umbrella row Status preserved IN
FLIGHT; ADR-0022 + ADR-0033 + ADR-0035 + ADR-0042 + ADR-0043 +
ADR-0044 + ADR-0045 + ADR-0047 untouched at G6.2; no schema.prisma
changes; no audit.ts changes per Q-G6.2-η η-1 LOCK; no new audit
literals; no read.service / write.service / SimilarityService /
COE / permission / TAR / negotiate.service behavior changes
(forbidden boundaries preserved); no Elixir routing logic /
Translator behavior changes per Q-G6.2-ε ε-1 LOCK; no schema
discriminator changes per Q-G6.2-θ θ-1 LOCK; **G6.3 substantive
`resolveAiAgentWalletContext` helper remains DEFERRED forward-
substrate** per Founder G6.3 disposition LOCK (not in current
closure path); no production-affecting actions; no real OpenAI
calls; no Supabase mutation; no secret exposure.

**G6.4 closure cascade forward-substrate next**: ADR-0046 Status
flip `Proposed 2026-05-19` → `Accepted 2026-05-XX` + Gap 6 row
Status flip IN FLIGHT → CLOSED + README + CLAUDE.md ADR-0046
catalog refresh + Sub-arc 2 preserved IN FLIGHT pending later
Sub-arc 2 closure cascade per ADR-0041 CL.1 scope patch register
substantively.

Founder authorization explicit per RULE 20 at
`[BEAM-CAPSULE-ROUTING-G6-QLOCK]` +
`[BEAM-CAPSULE-ROUTING-G6.2-QLOCK]` +
`[BEAM-CAPSULE-ROUTING-G6.2-QLOCK-CORRECTION]` +
`[BEAM-CAPSULE-ROUTING-G6.2-EXECUTE-VERIFY-AUTH]`.

#### G6.4 CLOSED — Gap 6 AI_AGENT EntityType-Discriminated Capsule Routing closure cascade (ADR-0046 Accepted 2026-05-19)

**Status:** G6.4 `[BEAM-CAPSULE-ROUTING-CLOSURE]` docs-only closure
cascade LANDED 2026-05-19 (5 MOD) per Founder Q-G6.4-α α-1 LOCK +
Q-G6.4-β β-1 LOCK + Q-G6.4-γ γ-1 LOCK + Q-G6.4-δ δ-1 LOCK + Q-G6.4-ε
ε-1 LOCK + Q-G6.4-ζ ζ-1 LOCK + Q-G6.4-η η-1 LOCK at
`[BEAM-CAPSULE-ROUTING-G6.4-QLOCK]` +
`[BEAM-CAPSULE-ROUTING-G6.4-EXECUTE-VERIFY-AUTH]` register
substantively. **Gap 6 AI_AGENT EntityType-Discriminated Capsule
Routing CLOSED at canonical-state register substantively.** ADR-0046
Status flipped from `Proposed 2026-05-19` to **`Accepted 2026-05-19`**
per Q-G6.4-β β-1 LOCK. Gap 6 mini-arc 3/3 substantive sub-phases
LANDED (G6.1 LANDED `c130826` + G6.2 LANDED `9c3943d` + G6.3
DEFERRED + G6.4 LANDED this commit). Sub-arc 2 remains IN FLIGHT
per Q-G6.4-ζ ζ-1 LOCK. **G6.3 substantive `resolveAiAgentWalletContext`
helper remains DEFERRED forward-substrate** per Q-G6.4-η η-1 LOCK
(do not implement; do not add schema fields; do not modify runtime
service behavior). **Sub-arc 2 closure cascade is next** under
broader Sub-arc 2 closure register substantively per Q-G6.4-ζ ζ-1
LOCK + ADR-0041 CL.1 scope patch (separate later commit).

**Substrate sites (5 authorized files; 5 MOD; 0 NEW):** MOD
`docs/architecture/decisions/0046-ai-agent-entity-type-discriminated-capsule-routing.md`
(Status flip + NEW H2 `## G6.4 Closure Cascade (2026-05-19)` + NEW
H2 `## Post-Closure Implementation Lineage` with 4-commit table +
Implementation Lineage G6.2 row anchored at `9c3943d` +
Implementation Lineage G6.4 row flipped LANDED / Gap 6 CLOSED +
Founder Authorization G6.4 citations) + MOD
`docs/reference/section-12-progress.md` (Gap 6 row Status IN FLIGHT
→ CLOSED + commit lineage updated to `c130826 → 9c3943d → this
commit` with G6.3 DEFERRED noted + G6.4 LANDED closure prose
appended) + MOD this `docs/CURRENT_BUILD_STATE.md` (this NEW H4) +
MOD `docs/architecture/README.md` (ADR-0046 catalog Status flip
Proposed → Accepted + tail refresh with G6.2 + G6.4 substantive
landing summary) + MOD `CLAUDE.md` (ADR-0046 catalog mirror Status
flip Proposed → Accepted + parallel tail refresh).

**Governing RULES at substrate-architectural register substantively**:
RULE 0 (Humans Always Sovereign; AI_AGENT routing canonical at
dual-context register substantively; RULE 0 lower default permission
ceilings preserved at canonical-execution register substantively
across Personal AI Agent + Enterprise AI Agent + defensive fallback)
+ RULE 10 (no deletion semantics preserved) + RULE 11 (Prisma/Ecto
cross-language ownership boundary preserved at canonical-coherence
register substantively; no Elixir code changes at G6.4) + RULE 12
(pre-flight grep substrate-state ground truth verified at HEAD
`9c3943d` register substantively; all anchor citations grep-
confirmed pre-authorization) + RULE 13 (G6.4 closure rationale
surfaced clearly + ADR-0035 §9 promotion decision δ-1 surfaced with
rationale: G6.2 drifts resolved in-place through ADR-0001 + ADR-0039
+ ADR-0041 + glossary + Elixir docstrings + grpc comment + TS tests
+ no new recurring substrate-build discipline observation requires
ADR-0035 promotion at G6.4 + D-G6.2-1 file-count + D-G6.2-2 ADR-0001
/ ADR-0039 filename drifts handled immediately by QLOCK correction
and do not require ADR-0035 promotion now) + RULE 20 (Founder
authorization required and granted at G6.4 landing per
`[BEAM-CAPSULE-ROUTING-G6.4-QLOCK]` +
`[BEAM-CAPSULE-ROUTING-G6.4-EXECUTE-VERIFY-AUTH]`) + RULE 21
(current-source inspection canonical at G6.4 PRE-FLIGHT register
substantively).

**Post-Closure Implementation Lineage canonical at canonical-
execution register substantively per ADR-0020 two-register IP
discipline**:

- G6.1 `c130826` `[BEAM-CAPSULE-ROUTING-ADR]` — ADR-0046 NEW
  Proposed; canonical dual-context routing model; RULE 21 research
  arc embedded (RS-G6-1 through RS-G6-4; 20+ documented public
  sources retrieved 2026-05-19); 11-row enforcement surface
  inventory; 10-row adversarial threat model T1-T10; 8 RULE 13
  substrate-honest drift surfaces for G6.2 cascade; 10 Q-G6 sub-
  decisions canonical.
- G6.2 `9c3943d` `[BEAM-CAPSULE-ROUTING-DOC-AND-TEST-CASCADE]` —
  doc-and-test cascade; 13 MOD + 0 NEW corrected scope per Q-G6.2-ι
  (D-G6.2-1 + D-G6.2-2 drifts resolved at
  `[BEAM-CAPSULE-ROUTING-G6.2-QLOCK-CORRECTION]`); ADR-0001 in-place
  Amendment 1 + ADR-0039 in-place Amendment 2 + ADR-0041 §Sub-
  decision 6 amendment + ADR-0046 G6.2 cascade section + glossary
  narrowed + 2 NEW glossary entries + 3 Elixir module docstring
  corrections + grpc/server.ex:266 comment closure + CLAUDE.md
  catalog updates + 4 NEW dual-context TS unit tests; baseline
  deltas unit 562 → 566 (+4 NEW tests).
- G6.3 DEFERRED `[BEAM-CAPSULE-ROUTING-CONTEXT-RESOLVER]` — optional
  substantive `resolveAiAgentWalletContext` helper not in current
  closure path per Founder G6.3 disposition LOCK + Q-G6.4-η η-1
  LOCK; may land later only if separate Founder QLOCK explicitly
  authorizes AND a real product flow surfaces unresolved ambiguity
  at wallet-defaulting tier — G6.2 verification PASS substantively
  does not surface such ambiguity.
- G6.4 this commit `[BEAM-CAPSULE-ROUTING-CLOSURE]` — docs-only
  closure cascade; 5 MOD; ADR-0046 Status Proposed → Accepted; Gap
  6 row Status IN FLIGHT → CLOSED; README + CLAUDE.md ADR-0046
  catalogs flipped; NO ADR-0035 modification per Q-G6.4-δ δ-1 LOCK;
  Sub-arc 2 preserved IN FLIGHT per Q-G6.4-ζ ζ-1 LOCK; G6.3 helper
  preserved DEFERRED forward-substrate per Q-G6.4-η η-1 LOCK.

**Canonical closure precedent**: G4.4 (`a05040f` `[BEAM-CAPSULE-
DECAY-CLOSURE]`; 5 MOD docs-only; ADR-0044 Status flipped; **NO
ADR-0035 modification — minimum-touch precedent G6.4 mirrors
exactly**) + G5.4 (`5fcdbde` `[BEAM-CAPSULE-STALENESS-CLOSURE]`;
5 MOD docs-only; ADR-0045 Status flipped; NO ADR-0035 modification;
canonical 5-file scope identical to G6.4) + G3.10 (`08b10ef`
`[BEAM-CAPSULE-EMBEDDING-CLOSURE]`; 6 MOD docs-only; ADR-0043
Status flipped; ADR-0035 §9 cluster expansion 36 → 38 — G6.4 does
NOT follow this expansion-class precedent per Q-G6.4-δ δ-1 LOCK).
G6.4 mirrors G5.4 / G4.4 step-for-step: 5 MOD docs-only + Status
flip + Gap row flip + catalog mirrors + **NO ADR-0035 modification**
per Q-G6.4-δ δ-1 LOCK.

**ADR-0046 forward-substrate after closure**: dual-context AI_AGENT
routing model canonical at substrate-architectural register
substantively across ADR-0001 §Amendment 1 + ADR-0039 §Amendment 2
+ ADR-0041 §Sub-decision 6 amendment + ADR-0046 §Decision +
glossary + 3 Elixir module docstrings + grpc/server.ex:266 closure
+ TS dual-context test anchors. RULE 0 + RULE 10 no-auto-deletion
discipline preserved across both Personal AI Agent and Enterprise
AI Agent contexts. SimilarityService preserved UNTOUCHED per Q-G6-ι
inheritance; ADR-0043 G3.9 J5-J8 privacy proofs preserved.
Translator preserved unchanged at canonical-execution register
substantively. G6.3 `resolveAiAgentWalletContext` helper remains
DEFERRED dormant. **Sub-arc 2 closure cascade is next** (separate
later commit per Q-G6.4-ζ ζ-1 LOCK + ADR-0041 CL.1 scope patch).

Founder authorization explicit per RULE 20 at
`[BEAM-CAPSULE-ROUTING-G6-QLOCK]` +
`[BEAM-CAPSULE-ROUTING-G6.4-QLOCK]` +
`[BEAM-CAPSULE-ROUTING-G6.4-EXECUTE-VERIFY-AUTH]`.

### Sub-arc 2 CLOSED — Capsule Layer Substrate Umbrella closure cascade (ADR-0041 Accepted 2026-05-19)

**Status:** Sub-arc 2 `[BEAM-CAPSULE-LAYER-SUB-ARC-2-CLOSURE]`
docs-only closure cascade LANDED 2026-05-19 (5 MOD) per Founder
Q-SA2-α α-1 LOCK + Q-SA2-β β-1 LOCK + Q-SA2-γ γ-1 LOCK + Q-SA2-δ δ-1
LOCK + Q-SA2-ε ε-1 LOCK + Q-SA2-ζ ζ-1 LOCK + Q-SA2-η η-1 LOCK at
`[BEAM-CAPSULE-LAYER-SUB-ARC-2-CLOSURE-QLOCK]` +
`[BEAM-CAPSULE-LAYER-SUB-ARC-2-CLOSURE-EXECUTE-VERIFY-AUTH]`
register substantively.

**Phase 3 Sub-Arc 2 Capsule Layer Substrate Umbrella CLOSED at
canonical-state register substantively.** ADR-0041 Status flipped
from `Proposed 2026-05-17` to **`Accepted 2026-05-19`** per Q-SA2-β
β-1 LOCK. Sub-arc 2 umbrella row Status flipped IN FLIGHT → CLOSED
per Q-SA2-α α-1 LOCK at section-12-progress register substantively.

**All Sub-arc 2 per-gap ADRs canonical at canonical-state register
substantively as Accepted**:

- **ADR-0042** (Gap 1 Mutation Discrimination) — Accepted at G1.6
  closure (capsule mutation discrimination canonical: ADD / UPDATE
  / MERGE / NOOP).
- **ADR-0043** (Gap 3 pgvector Embedding) — Accepted 2026-05-18 at
  G3.10 `08b10ef` closure (pgvector substrate canonical: text-
  embedding-3-small @ 1536 dims; HNSW + cosine).
- **ADR-0044** (Gap 4 Decay Execution Formalization) — Accepted
  2026-05-18 at G4.4 `a05040f` closure (lazy-at-read; FOUNDATIONAL
  bypass; soft-delete-only).
- **ADR-0045** (Gap 5 Capsule-Level Staleness Detection) — Accepted
  2026-05-18 at G5.4 `5fcdbde` closure (4-dimension model; minimum-
  viable embedding lag at G5.3).
- **ADR-0046** (Gap 6 AI_AGENT EntityType-Discriminated Capsule
  Routing) — Accepted 2026-05-19 at G6.4 `5b5b143` closure (dual-
  context routing: Personal AI Agent + Enterprise AI Agent +
  defensive fallback).

**Companion hardening arc**: **ADR-0047** (Post-Gap-3 Production-
Readiness Hardening Mini-Arc) — Accepted 2026-05-18 at PR.4
`e60122c` closure (vitest fail-closed; local refresh + parity
verifier scripts; deployment runbook). Included in Sub-arc 2 closure
lineage as companion mini-arc that landed between Gap 3 closure and
Gap 4 start.

**G6.3 disposition**: G6.3 `[BEAM-CAPSULE-ROUTING-CONTEXT-RESOLVER]`
remains DEFERRED forward-substrate dormant per Founder G6.3
disposition LOCK + Q-G6.4-η η-1 LOCK preservation. Not a Sub-arc 2
closure blocker; current Gap 6 verification PASS substantively does
not surface unresolved ambiguity at wallet-defaulting tier.

**Substrate sites (5 authorized files; 5 MOD; 0 NEW)**: MOD
`docs/architecture/decisions/0041-capsule-layer-substrate-umbrella.md`
(Status flip + NEW H2 `## Sub-arc 2 Closure Cascade (2026-05-19)` +
NEW H2 `## Post-Closure Implementation Lineage` with 8-row table +
Founder Authorization Sub-arc 2 closure citations) + MOD
`docs/reference/section-12-progress.md` (Sub-arc 2 umbrella row
Status IN FLIGHT → CLOSED + commit lineage updated to `CL.1 → G1.6
→ G3.10 → PR.4 → G4.4 → G5.4 → G6.4 → this commit` + Sub-arc 2
closure prose appended) + MOD this `docs/CURRENT_BUILD_STATE.md`
(this NEW H3) + MOD `docs/architecture/README.md` (ADR-0041 catalog
Status flip Proposed → Accepted + tail refresh with complete per-
gap closure list) + MOD `CLAUDE.md` (ADR-0041 catalog mirror Status
flip Proposed → Accepted + parallel tail refresh).

**Governing RULES at substrate-architectural register substantively**:
RULE 0 (Humans Always Sovereign; capsule layer governance canonical
at canonical-execution register substantively across all per-gap
ADRs; AI_AGENT routing dual-context; staleness never deletes;
soft-delete-only) + RULE 10 (no deletion semantics preserved across
all per-gap ADRs) + RULE 11 (Prisma/Ecto cross-language ownership
boundary preserved; no Elixir code changes at Sub-arc 2 closure) +
RULE 12 (pre-flight grep substrate-state ground truth verified at
HEAD `5b5b143` register substantively; all anchor citations grep-
confirmed pre-authorization) + RULE 13 (Sub-arc 2 closure rationale
surfaced clearly; ADR-0035 §9 promotion decision δ-1 surfaced with
rationale: G3.10 already promoted Gap 3 observations 37th + 38th;
G4.4 / G5.4 / G6.4 followed minimum-touch precedent; G6.2 drifts
resolved in-place by corrected QLOCK; any future recurrent
substrate-build discipline issues may be promoted by later Founder-
authorized ADR amendment) + RULE 14 (bidirectional citation
discipline canonical across all per-gap ADRs + ADR-0001 §Amendment
1 + ADR-0039 §Amendment 2 + ADR-0041 §Sub-decision 6 amendment +
ADR-0046 §G6.2 cascade section + glossary updates) + RULE 20
(Founder authorization required and granted at Sub-arc 2 closure
landing per `[BEAM-CAPSULE-LAYER-SUB-ARC-2-CLOSURE-QLOCK]` +
`[BEAM-CAPSULE-LAYER-SUB-ARC-2-CLOSURE-EXECUTE-VERIFY-AUTH]`) + RULE
21 (current-source research arcs preserved at all per-gap ADRs +
ADR-0046 §Context register substantively; canonical research arc
sources canonical at canonical-knowledge register substantively).

**Canonical closure precedent**: G3.10 (`08b10ef`; 6 MOD docs-only;
ADR-0043 Status flipped; ADR-0035 §9 cluster expansion 36 → 38) +
G4.4 (`a05040f`; 5 MOD docs-only; ADR-0044 Status flipped; NO
ADR-0035 modification — minimum-touch precedent Sub-arc 2 mirrors at
umbrella tier) + G5.4 (`5fcdbde`; 5 MOD docs-only; ADR-0045 Status
flipped; NO ADR-0035 modification) + G6.4 (`5b5b143`; 5 MOD docs-
only; ADR-0046 Status flipped; NO ADR-0035 modification). Sub-arc 2
closure mirrors G4.4 / G5.4 / G6.4 minimum-touch precedent at the
umbrella tier.

**Critical coherence preserved at Sub-arc 2 closure**: ADR-0042 +
ADR-0043 + ADR-0044 + ADR-0045 + ADR-0046 + ADR-0047 untouched (5
per-gap ADRs + hardening companion remain Accepted at their per-gap
closure commits); ADR-0001 + ADR-0039 untouched (G6.2 owned
amendments); ADR-0022 + ADR-0033 + ADR-0035 untouched at Sub-arc 2
closure; no glossary modification (G6.2 owned); no Elixir code or
docstring changes (G6.2 owned); no apps/** / tests/** / packages/**
/ scripts/** / schema.prisma / CI workflow / package.json / lockfile
/ vitest config / docker-compose / .husky / mix files / audit.ts /
.env changes; no new audit literals; no read.service / COE /
feedback.service / write.service / SimilarityService / permission /
TAR / negotiate.service behavior changes; no Translator behavior
changes; no G6.3 helper implementation per Q-SA2-η η-1 LOCK; no
Foundation/COSMP personalization implementation per Q-SA2-η η-1
LOCK; no Phase 4 start; no production-affecting actions; no real
OpenAI calls; no Supabase mutation; no Elixir vector access; no
secret exposure.

**Phase 3 global status**: PRESERVED per Q-SA2-ζ ζ-1 LOCK. Sub-arc
2 closure cascade closes the Capsule Layer Substrate Umbrella
exclusively. Phase 3 closure requires separate explicit Founder
QLOCK + substrate-state proof that no other Phase 3 sub-arcs remain
open. Substrate-state ground truth at HEAD `5b5b143` register
substantively shows Phase 3 Sub-Arc 1 (Hive Substrate;
`[BEAM-DBGI-DEVICE-COLDSHARD-CLOSURE]` D.4 closed sub-arc 1) +
Phase 3 Sub-Arc 2 (this Sub-arc 2 closure) both substantively closed
at sub-arc level; any Phase 3 global closure remains forward-
substrate pending Founder QLOCK.

**Forward-substrate next strategic arc**: Foundation/COSMP
personalization-orchestration substrate Hawkseye per Q-SA2-η η-1
LOCK (research + Hawkseye phase first; substantive personalization /
orchestration implementation requires separate Founder authorization
+ Hawkseye disposition). G6.3 `resolveAiAgentWalletContext` helper
remains DEFERRED dormant. Forward-substrate items reserved across
Sub-arc 2 mini-arcs (ADR-0044 dormant TTL enforcement + DecayType
enum semantic; ADR-0045 dormant filtering / ranking / lifecycle /
audit-literal expansion; ADR-0046 G6.3 helper; ADR-0042 §Q-γ.1
clean-transition discipline; etc.) remain dormant unless future
Founder-authorized ADR amendments land them.

Founder authorization explicit per RULE 20 at
`[BEAM-CAPSULE-LAYER-SUB-ARC-2-CLOSURE-QLOCK]` +
`[BEAM-CAPSULE-LAYER-SUB-ARC-2-CLOSURE-EXECUTE-VERIFY-AUTH]`.

---

## Phase 3 Sub-Arc 2 Gap 5 -- Capsule-Level Staleness Detection IN FLIGHT 2026-05-18 at G5.1 -- ADR-0045 NEW Proposed; G5.2-G5.4 forward-substrate

**Status: IN FLIGHT** at G5.1 `[BEAM-CAPSULE-STALENESS-ADR]`.

Phase 3 (Dynamic Memory Accuracy at Scale) Sub-arc 2 Gap 5 (Capsule-
Level Staleness Detection) IN FLIGHT 2026-05-18 at G5.1 per Founder
Q-G5-α α-1 LOCK + Q-G5-μ 4-phase mini-arc LOCK at
`[BEAM-CAPSULE-STALENESS-G5-QLOCK]` register substantively. ADR-0045
NEW (Capsule-Level Staleness Detection; Status Proposed 2026-05-18).
G5.1 does NOT close Gap 5; G5.4 closure cascade flips ADR-0045 Status
→ Accepted at canonical-state register substantively. Sub-arc 2
remains IN FLIGHT throughout G5.1-G5.4. **Optional Gap 6 / ADR-0046
AI_AGENT EntityType-Discriminated Capsule Routing remains forward-
substrate** per ADR-0041 §Sub-decision 6 (optional; Founder may elect
post-Gap 5 closure).

#### G5.1 LANDED — ADR-0045 NEW Proposed (2026-05-18)

**Status:** G5.1 `[BEAM-CAPSULE-STALENESS-ADR]` LANDED 2026-05-18
(docs-only ADR creation; 4 MOD + 1 NEW) per Founder Q-G5-α α-1 LOCK +
Q-G5-β β-4 LOCK + Q-G5-γ γ-5 LOCK + Q-G5-δ δ-1 + δ-5 LOCK + Q-G5-ε
ε-4 LOCK + Q-G5-ζ ζ-5 LOCK + Q-G5-η canonical + Q-G5-θ canonical +
Q-G5-ι canonical + Q-G5-κ κ-1 LOCK + Q-G5-λ λ-1 LOCK + Q-G5-μ 4-phase
LOCK at `[BEAM-CAPSULE-STALENESS-G5-QLOCK]` +
`[BEAM-CAPSULE-STALENESS-G5.1-EXECUTE-VERIFY-AUTH]` register
substantively. ADR-0045 NEW (Capsule-Level Staleness Detection;
Status Proposed 2026-05-18). G5.1 does NOT close Gap 5; G5.4 closure
cascade flips ADR-0045 Status → Accepted at canonical-state register
substantively.

**Substrate sites (5 authorized files; 4 MOD + 1 NEW):** NEW
`docs/architecture/decisions/0045-capsule-level-staleness-detection.md`
+ MOD `docs/reference/section-12-progress.md` (NEW Gap 5 IN FLIGHT
row) + MOD this `docs/CURRENT_BUILD_STATE.md` (NEW H2 + this G5.1
H4) + MOD `docs/architecture/README.md` (NEW ADR-0045 catalog entry)
+ MOD `CLAUDE.md` (NEW ADR-0045 catalog entry mirror).

**Governing RULES at substrate-architectural register substantively**:
RULE 0 (Humans Always Sovereign; staleness never deletes; non-
destructive marking only; FOUNDATIONAL bypass + explicit-recall +
reversible filtering preserved) + RULE 11 (Prisma/Ecto cross-language
ownership boundary preserved per ADR-0033 §Decision 7 + Q-5BII-EXEC-5;
TypeScript owns capsule-level staleness semantics; BEAM observer-
only at G5.1) + RULE 12 (pre-flight grep substrate-state ground
truth verified for schema.prisma + feedback.service.ts + coe + read +
similarity + write + audit + tests) + RULE 13 (mandatory feedback-
loop staleness vs capsule-level staleness discrimination canonical
inline) + RULE 20 (Founder authorization required and granted) +
RULE 21 (current-source research arc embedded RS-G5-1 through
RS-G5-5; 14+ public sources retrieved 2026-05-18).

**Canonical 4-dimension staleness model per Atlan framework + RS-G5-3
canonical at canonical-execution register substantively**: content
age (per-capsule; last_updated_at + optional source_updated_at) +
embedding lag (per-capsule; gap between content_hash and hypothetical
embedding_content_hash) + coverage drift (corpus-level aggregate
metric) + semantic validity (per-capsule + cross-capsule; STALE
benchmark Implicit Conflict Type I + Type II invalidation taxonomy).

**Mandatory feedback-loop staleness vs capsule-level staleness
discrimination canonical at substrate-architectural register
substantively per RULE 13 + ADR-0041 §Sub-decision 5 Q-I LOCK
explicit**: existing feedback-loop staleness at `feedback.service.ts:
683 runLoop7Once` + `FEEDBACK_LOOP_STALE` audit literal + `Loop7Result
.stale_loops: string[]` targets FeedbackLoopHealth rows representing
loop runs (NOT MemoryCapsule rows); signal is `last_run` vs `2x
expected cron interval` (NOT content/embedding/source/validity
dimensions); action is operator alerting under
`SYSTEM_PRINCIPALS.FEEDBACK_LOOP` (NOT capsule retrieval suppression);
register is operational/observability (NOT capsule semantic
validity); MUST NOT be conflated with Gap 5 capsule-level staleness.

**RULE 21 research arc embedded at ADR-0045 §Context register
substantively**: RS-G5-1 STALE benchmark (arXiv:2605.06527; Implicit
Conflict failure mode; Type I/II invalidation taxonomy; 400 scenarios
/ 1,200 queries / 150K-token contexts) + Mem0 State of AI Agent Memory
2026 (staleness "unresolved in most frameworks"; ADD/UPDATE/DELETE/
NONE reconciliation; analog to ADR-0042 mutation discrimination) +
MemPalace 2026 (validity windows with end-date invalidation marking;
no deletion) + Memory Worth 2-counter primitive; RS-G5-2 arXiv:
2509.19376 simple recency prior (1.00 freshness task accuracy) +
Temporal-aware Matryoshka Representation Learning (TMRL) + RisingWave
RAG 2026 (stale retrieval rate; staleness gap 24h nightly / 60min
hourly) + Continuous-ETL RAG Freshness Measurement; RS-G5-3 Atlan LLM
Knowledge Base Freshness Scoring canonical 4-dimension framework
(content age + embedding lag + stale retrieval rate + coverage drift)
+ 3-layer monitoring (retrieval logging + corpus scanning + source-
system monitoring) + Context Drift Detection signals (schema version
staleness + glossary age + lineage gaps + ownership freshness);
RS-G5-4 DeDrift (arXiv:2308.02752) + Self-Aware Vector Embeddings
(arXiv:2604.20598) + MPZCH (arXiv:2602.17050) + Encord 2026 embedding
monitoring; RS-G5-5 When to Forget (arXiv:2604.12007) memory
governance primitive + Acuvity Memory Governance transparency
cornerstone + LinkedIn Cognitive Memory Agent human-validation
workflow (InfoQ 2026).

**Substrate-state ground truth at G5.1 PRE-FLIGHT register
substantively**: existing MemoryCapsule fields `content_hash` +
`ai_access_blocked` + `requires_validation` + `last_accessed_at` +
`last_updated_at` + `expires_at` (dormant per Gap 4 G4.2 O-G4.1-1) +
`relevance_score` + `decay_type`; **NO** `stale_score` /
`stale_reason` / `stale_checked_at` / `embedding_content_hash` /
`embedding_generated_at` / `source_updated_at` / `validity_window_end`
/ `staleness_lifecycle_state` field (all **GREENFIELD** at G5.1);
**NO** `CAPSULE_STALENESS_*` audit literal (greenfield); **NO**
capsule-level staleness signal at `coe.service.ts` or
`read.service.ts` or `similarity.service.ts` G3.6 SQL filter set or
`write.service.ts`; **NO** tests at capsule-level staleness register
(greenfield).

**Forbidden / preserved boundaries enumerated at G5.1**: no apps/**
/ tests/** / packages/** / scripts/** changes; no schema.prisma; no
CI workflows; no package.json / lockfile changes; no vitest config
changes; no docker-compose / .husky changes; no mix.exs / mix.lock;
no audit.ts changes; no new audit literals at G5.1 per Q-G5-ε ε-4
LOCK; no ADR-0022 amendment; no ADR-0033 amendment; no ADR-0035
modification at G5.1; no ADR-0041 modification (Gap 4/5/6
reservations preserved); no ADR-0042 / ADR-0043 / ADR-0044 / ADR-0047
modifications; no ADR-0046 renumbering; no Sub-arc 2 status flip to
CLOSED; no SimilarityService modification (G3.9 J5-J8 privacy proofs
preserved per Q-G5-ι); no production-affecting actions; no Elixir
vector access; no Elixir staleness computation; no vector / distance
/ raw query leakage at any G5 surface; no secret exposure.

**Forward-substrate after G5.1**:

- **G5.2** `[BEAM-CAPSULE-STALENESS-SUBSTRATE-OBSERVATION]` — docs-
  only substrate observation phase; surface schema additions
  disposition (Q-G5-δ G5.2 resolution: which of stale_score /
  embedding_content_hash / etc. are needed) + audit literal
  disposition (Q-G5-ε G5.2 resolution) + integration target
  disposition (Q-G5-ζ G5.2 resolution); G5.3 SKIP-or-implement
  determination
- **G5.3** `[BEAM-CAPSULE-STALENESS-IMPL]` — conditional substantive
  code if G5.2 proves implementation needed; OR formal SKIP record
  per G1.4 + G3.7 + G4.3 canonical SKIP precedent
- **G5.4** `[BEAM-CAPSULE-STALENESS-CLOSURE]` — docs-only closure
  cascade; ADR-0045 Status Proposed → Accepted; Gap 5 row Status
  IN FLIGHT → CLOSED; optional ADR-0035 §9 cluster decision; Sub-arc
  2 closure decision

**Founder LOCKS preservation:** Q-G5-α through Q-G5-μ LOCKED at
`[BEAM-CAPSULE-STALENESS-G5-QLOCK]` register substantively per RULE
20; G5.1 execution authorization at
`[BEAM-CAPSULE-STALENESS-G5.1-EXECUTE-VERIFY-AUTH]`.

#### G5.2 LANDED — Substrate observation resolution; G5.3 minimum-viable embedding lag implementation next (2026-05-18)

**Status:** G5.2 `[BEAM-CAPSULE-STALENESS-SUBSTRATE-OBSERVATION]`
LANDED 2026-05-18 (docs-only 3 MOD) per Founder Q-G5.2-α α-2 LOCK +
Q-G5.2-β β-1 LOCK + Q-G5.2-γ γ-2 LOCK + Q-G5.2-δ δ-2 LOCK + Q-G5.2-ε
ε-1 LOCK + Q-G5.2-ζ ζ-1 LOCK at
`[BEAM-CAPSULE-STALENESS-SUBSTRATE-OBSERVATION-G5.2-QLOCK]` +
`[BEAM-CAPSULE-STALENESS-SUBSTRATE-OBSERVATION-G5.2-EXECUTE-VERIFY-AUTH]`
register substantively. ADR-0045 Status preserved
`Proposed 2026-05-18` (G5.4 closure cascade is the canonical Status-
flip commit). Gap 5 row Status preserved IN FLIGHT; Sub-arc 2 status
field preserved IN FLIGHT. G5.2 advances Gap 5 mini-arc 1/4 → 2/4.
**G5.3 minimum-viable embedding lag implementation forward-substrate
next.**

**Substrate sites (3 authorized files; 3 MOD; 0 NEW):** MOD
`docs/architecture/decisions/0045-capsule-level-staleness-detection.md`
(NEW H2 `## G5.2 Substrate Observation Resolution (2026-05-18)` +
Q-G5.2-α/β/γ/δ/ε/ζ LOCK resolutions + NEW O-G5.2-1 substrate-state
observation + Founder Authorization G5.2 citations + Implementation
Lineage G5.2 row flipped `forward-substrate` → `G5.2 LANDED
2026-05-18` + G5.3 row scope updated to minimum-viable substantive)
+ MOD `docs/reference/section-12-progress.md` (G5.2 LANDED prose
appended to Gap 5 row) + MOD this `docs/CURRENT_BUILD_STATE.md`
(this NEW H4).

**Governing RULES at substrate-architectural register substantively**:
RULE 0 (no automatic deletion preserved; stale status explainable +
scoped + reversible) + RULE 10 (no deletion semantics; soft-delete-
only preserved) + RULE 11 (Prisma/Ecto cross-language ownership
boundary preserved per ADR-0033 §Decision 7 + Q-5BII-EXEC-5; BEAM
observer-only at G5.2) + RULE 12 (pre-flight grep substrate-state
ground truth verified for schema.prisma + feedback.service.ts +
audit.ts + Translator + indexes + migration discipline) + RULE 13
(NEW O-G5.2-1 substrate-state observation surfaced inline;
feedback_loop_score three-register discrimination canonical) + RULE
20 (Founder authorization required and granted) + RULE 21 (current-
source inspection canonical).

**G5.3 minimum-viable embedding lag substrate scope canonical at
canonical-execution register substantively per Q-G5.2-α α-2 LOCK +
Q-G5.2-γ γ-2 LOCK + Q-G5.2-δ δ-2 LOCK**:

- **2 NEW MemoryCapsule fields** via Prisma db push flow per
  ADR-0025: `embedding_content_hash String?` adjacent to existing
  `content_hash String` at `schema.prisma:132` + `embedding_generated_at
  DateTime?` adjacent to existing `last_updated_at DateTime` at
  `schema.prisma:164`; both nullable for graceful legacy capsule
  handling; no new index at G5.3 (filtering deferred)
- **Write.service integration**: write.service.ts createCapsule ADD
  branch sets `embedding_content_hash = content_hash` +
  `embedding_generated_at = now()` AFTER embedding generation
  succeeds; write.service.ts updateCapsule UPDATE/MERGE branches set
  fields after re-embedding; NOOP branch preserves fields (no re-
  set); failure path graceful per Gap 3 G3.5 Q-G3.5-α (fields remain
  NULL if EmbeddingProvider fails)
- **No filtering / ranking / lifecycle / audit literal expansion**
  at G5.3 per Q-G5.2-β β-1 LOCK + Q-G5.2-γ γ-2 LOCK + Q-G5.2-δ δ-2
  LOCK
- **Conditional cross-language Translator pass-through** per ADR-0033
  §Decision 7 + Q-5BII-EXEC-5 (if BEAM-side consumer requires; G5.3
  pre-flight verifies)
- **Tests** at G5.3: write-time embedding lag field population +
  NULL preservation on NOOP + graceful degradation on EmbeddingProvider
  failure + Translator round-trip + audit metadata preserves G3.9
  J5-J8 privacy proofs (no raw vector / no distance / no raw query
  in any G5 surface)

**NEW O-G5.2-1 substrate-state observation surfaced at G5.2 PRE-FLIGHT
per RULE 13**: `MemoryCapsule.feedback_loop_score Float @default(0.0)`
at `schema.prisma:110` is a per-capsule feedback-derived score
(populated by Loop 1 path at `feedback.service.ts`; cross-language
pass-through via Translator at `apps/cosmp_router/lib/cosmp_router/
capsule/translator.ex:93, 135` + Ecto schema at
`apps/cosmp_router/lib/cosmp_router/schemas/memory_capsule.ex:120`).
**Three distinct staleness/score registers now canonical** at
substrate-architectural register substantively that MUST NOT be
conflated at G5.3 or any future Gap 5 implementation:

1. **Loop-7 health staleness** (operational/observability) —
   targets `FeedbackLoopHealth` rows representing loop runs; signal
   is `last_run` vs cron cadence; mechanism is `runLoop7Once()` at
   `feedback.service.ts:683`; audit literal is `FEEDBACK_LOOP_STALE`
2. **Per-capsule feedback-derived score** (Loop 1 register) —
   `MemoryCapsule.feedback_loop_score` at `schema.prisma:110`;
   populated by Loop 1 path; per-capsule weighting alongside
   `relevance_score` + `access_count`; NOT a staleness signal
3. **Gap 5 capsule-level staleness** (semantic/currentness/validity)
   — greenfield at G5.1; G5.3 lands embedding lag dimension per
   α-2 LOCK; content age + coverage drift + semantic validity
   dimensions forward-substrate

G5.3 implementation MUST NOT conflate `feedback_loop_score` (register
#2) with Gap 5 staleness signals (register #3). `feedback_loop_score`
may inform semantic validity dimension in a future ADR amendment but
is NOT a staleness signal at canonical-prose register substantively
at G5.3 register.

**RAA 12.8 §D3 gap closure path canonical**: `docs/architecture/
raa-12-8-substrate-dynamics.md:139` D3 documents explicit gap "zero
confidence/certainty/provenance/trust dimension in schema or
services". Gap 5 is the canonical closure path for this gap at
substrate-architectural register substantively. However, G5.3 only
lands embedding-lag metadata per Q-G5.2-α α-2 LOCK minimum-viable
scope; confidence/certainty/provenance/trust dimensions remain
forward-substrate for future Founder-authorized ADR amendments
(content age + coverage drift + semantic validity dimensions per
Q-G5-γ γ-5 4-dimension framework).

**Forbidden / preserved boundaries enumerated at G5.2**: no apps/**
/ tests/** / packages/** / scripts/** changes; no schema.prisma; no
CI workflows; no package.json / lockfile changes; no vitest config
changes; no docker-compose / .husky changes; no mix.exs / mix.lock;
no audit.ts changes; no new audit literals at G5.2 (Q-G5.2-β β-1
LOCK); no ADR-0022 amendment; no ADR-0033 amendment; no ADR-0035
modification at G5.2; no ADR-0041 modification (Gap 4/5/6 reservations
preserved); no ADR-0042 / ADR-0043 / ADR-0044 / ADR-0047 modification;
no ADR-0046 renumbering; no README modification; no CLAUDE.md
modification at G5.2 (G5.4 closure does catalog refresh); no Sub-arc
2 status flip to CLOSED; no Gap 5 row Status flip to CLOSED; no
SimilarityService modification (G3.9 J5-J8 privacy proofs preserved
per Q-G5-ι); no read.service modification; no COE modification; no
feedback.service modification (preserved per O-G5.2-1 three-register
discrimination); no production-affecting actions; no Elixir vector
access; no Elixir staleness computation; no vector / distance / raw
query leakage at any G5 surface; no secret exposure.

**Forward-substrate after G5.2**:

- **G5.3** `[BEAM-CAPSULE-STALENESS-IMPL]` minimum-viable embedding
  lag implementation next (2 NEW MemoryCapsule fields via `prisma
  db push` flow per ADR-0025 + write.service integration + conditional
  Translator pass-through + tests; NO filtering / ranking / lifecycle
  / audit literal expansion)
- **G5.4** `[BEAM-CAPSULE-STALENESS-CLOSURE]` docs-only closure
  cascade; ADR-0045 Status Proposed → Accepted; Gap 5 row Status
  IN FLIGHT → CLOSED
- **Optional Gap 6 / ADR-0046** forward-substrate
- **Sub-arc 2 closure cascade** forward-substrate pending G5.4 +
  optional Gap 6 per ADR-0041 CL.1 scope patch

**Founder LOCKS preservation:** Q-G5.2-α α-2 + Q-G5.2-β β-1 +
Q-G5.2-γ γ-2 + Q-G5.2-δ δ-2 + Q-G5.2-ε ε-1 + Q-G5.2-ζ ζ-1 LOCKED at
`[BEAM-CAPSULE-STALENESS-SUBSTRATE-OBSERVATION-G5.2-QLOCK]` register
substantively per RULE 20; G5.2 execution authorization at
`[BEAM-CAPSULE-STALENESS-SUBSTRATE-OBSERVATION-G5.2-EXECUTE-VERIFY-AUTH]`.

#### G5.3 LANDED — Minimum-viable embedding lag implementation (2026-05-18)

**Status:** G5.3 `[BEAM-CAPSULE-STALENESS-IMPL]` substantive code
LANDED 2026-05-18 (11 MOD: 8 substantive + 3 docs) per Founder
Q-G5.3-α α-1 + Q-G5.3-β β-1 + Q-G5.3-γ γ-1 + Q-G5.3-δ δ-3 + Q-G5.3-ε
ε-1 + Q-G5.3-ζ ζ-1 + Q-G5.3-η η-1 + Q-G5.3-θ θ-1 + Q-G5.3-ι ι-1 +
Q-G5.3-κ κ-1 + Q-G5.3-μ μ-2 LOCKS at
`[BEAM-CAPSULE-STALENESS-IMPL-G5.3-QLOCK]` +
`[BEAM-CAPSULE-STALENESS-IMPL-G5.3-EXECUTE-VERIFY-AUTH]` register
substantively. ADR-0045 Status preserved `Proposed 2026-05-18` (G5.4
closure cascade is the canonical Status-flip commit per ζ-1
inheritance). Gap 5 row Status preserved IN FLIGHT (mini-arc 3/4);
Sub-arc 2 status preserved IN FLIGHT. **G5.4 closure cascade
forward-substrate next.**

**Substrate sites (11 authorized MOD; 0 NEW)**:

- MOD `packages/database/prisma/schema.prisma`: +2 fields per α-1
  (`embedding_content_hash String?` at L133 adjacent to `content_hash`
  + `embedding_generated_at DateTime?` at L165 adjacent to
  `last_updated_at`); no new indexes per β-1
- MOD `apps/api/src/services/cosmp/write.service.ts`:
  `createCapsule` ADD branch conditional Prisma data spread sets
  `embedding_content_hash = processed.content_hash` +
  `embedding_generated_at = new Date()` only when `embeddingResult.ok`
  per γ-1 + δ-3; `updateCapsule` UPDATE branch conditional `data`
  fields set when `embeddingResult.ok` per γ-1 + δ-3 + θ-1; MERGE
  branch naturally preserves via Prisma update without lag fields in
  data per ζ-1; NOOP returns before any DB write per η-1
- MOD `tests/unit/cosmp/write.test.ts`: +5 unit tests L1-L5 (L1 ADD
  success populates embedding_content_hash = content_hash +
  embedding_generated_at NOT NULL; L2 ADD provider failure leaves
  both fields NULL; L3 UPDATE success regenerates both fields to NEW
  content_hash + NEW timestamp; L4 UPDATE provider failure preserves
  OLD lag fields stale-detectable via embedding_content_hash !=
  content_hash; L5 NOOP preserves embedding lag metadata)
- MOD `tests/integration/embedding-write.test.ts`: +2 integration
  tests L6-L7 (L6 DB persistence via Prisma data path; L7 audit
  metadata does NOT leak embedding_content_hash or
  embedding_generated_at values per Q-G5.3-ι ι-1)
- MOD `apps/cosmp_router/lib/cosmp_router/schemas/memory_capsule.ex`:
  +2 Ecto fields per κ-1 (`field :embedding_content_hash, :string` at
  Patent layer 3 Rules adjacent to `content_hash` +
  `field :embedding_generated_at, :utc_datetime_usec` at Patent
  layer 5 Time adjacent to `last_updated_at`)
- MOD `apps/cosmp_router/lib/cosmp_router/capsule/translator.ex`:
  pack adds `embedding_content_hash: get(metadata, ...)` to Payload
  group + `embedding_generated_at: get(time, ...)` to Time group;
  unpack adds same fields to row → struct projection (Payload group
  + Time group); mirrors existing `content_hash` + `last_updated_at`
  + `relevance_score` + `feedback_loop_score` pass-through pattern
- MOD `apps/cosmp_router/test/cosmp_router/schemas/memory_capsule_test.exs`:
  +2 tests per κ-1 (embedding_content_hash field presence +
  embedding_generated_at field presence with type asserts); also
  @expected_fields list updated to include both new fields for the
  field-set parity test
- MOD `apps/cosmp_router/test/cosmp_router/capsule/translator_test.exs`:
  +2 round-trip tests per κ-1 (embedding_content_hash unpack
  round-trip + embedding_generated_at unpack round-trip) in NEW
  `describe "G5.3 — embedding lag metadata pass-through (Q-G5.3-κ
  κ-1)"` block
- MOD `docs/architecture/decisions/0045-capsule-level-staleness-detection.md`:
  +NEW H2 `## G5.3 Implementation (2026-05-18)` with 11 Q-G5.3 LOCK
  resolutions + UPDATE-failure stale-detection semantic canonical
  prose + critical-coherence enumeration; +Founder Authorization
  G5.3 citations; +Implementation Lineage G5.3 row flipped
  `forward-substrate` → `**G5.3 LANDED 2026-05-18**`
- MOD `docs/reference/section-12-progress.md`: G5.3 LANDED prose
  appended to Phase 3 Sub-Arc 2 Gap 5 row
- MOD this `docs/CURRENT_BUILD_STATE.md`: this NEW H4

**Governing RULES at substrate-architectural register substantively**:
RULE 0 (detection metadata only; no automatic deletion / filtering /
ranking / lifecycle / autonomy erosion) + RULE 10 (no deletion
semantics; soft-delete-only preserved) + RULE 11 (Prisma/Ecto cross-
language ownership boundary preserved per ADR-0033 §Decision 7 +
Q-5BII-EXEC-5; TypeScript owns write integration; BEAM observer-only
via Translator round-trip preservation per κ-1) + RULE 12 (pre-
flight grep substrate-state ground truth) + RULE 13 (UPDATE-failure
stale-detection semantic surfaced inline at ADR-0045 §G5.3; G5.3
adds DETECTION mechanism, does NOT introduce stale state — pre-
existing G3.5 Q-G3.5-α degrade-policy already creates `NEW
content_hash + OLD embedding` on UPDATE failure; feedback_loop_score
three-register discrimination preserved per O-G5.2-1) + RULE 20
(Founder authorization required and granted) + RULE 21 (current-
source inspection canonical).

**UPDATE-failure stale-detection semantic canonical at substrate-
architectural register substantively**:

- **UPDATE success** (canonical): NEW `content_hash` + NEW
  `embedding` + NEW `embedding_content_hash` (= NEW `content_hash`)
  + NEW `embedding_generated_at` → detection
  `embedding_content_hash == content_hash` → embedding-fresh
- **UPDATE failure** (degrade): NEW `content_hash` + OLD `embedding`
  + OLD `embedding_content_hash` + OLD `embedding_generated_at` →
  detection `embedding_content_hash != content_hash` →
  embedding-stale

Deterministic stale-embedding detection. No scoring model. No new
audit literals. Future ADR amendment may wire COE / similarity
ranking pressure on top of this detection metadata; G5.3 lands the
substrate.

**Baseline deltas at canonical-execution register substantively**:

- TS=12 baseline preserved
- no-console 1/1 preserved
- unit 557 → 562 (+5 L1-L5 tests)
- integration 211 + 1 skipped → 213 + 1 skipped (+2 L6-L7 tests)
- mix compile clean (canonical baseline)
- Elixir cosmp_router 219 + 1 skipped → 223 + 1 skipped (+4 tests:
  2 Ecto field presence + 2 Translator round-trip)
- dbgi_supervisor 67/0/19 excluded preserved

**Forbidden / preserved boundaries enumerated at G5.3**: no
read.service.ts modification; no COE modification; no
SimilarityService modification (G3.9 J5-J8 privacy proofs preserved
per Q-G5-ι); no feedback.service modification (O-G5.2-1 three-
register discrimination preserved); no audit.ts changes; no new
audit literals (Q-G5.3-ι ι-1); no stale_score / stale_reason /
stale_checked_at / source_updated_at / validity_window_end /
lifecycle enum fields; no new Prisma indexes (Q-G5.3-β β-1); no
filtering / ranking / deletion behavior; no vector / distance / raw
query / embedding sample leakage; no ADR-0022 / ADR-0033 / ADR-0035
/ ADR-0041 / ADR-0042 / ADR-0043 / ADR-0044 / ADR-0047 modification;
no ADR-0046 renumbering; no README / CLAUDE.md changes at G5.3
(G5.4 closure does catalog refresh); no Sub-arc 2 status flip to
CLOSED; no Gap 5 row Status flip to CLOSED; no ADR-0045 Status flip
(G5.4 closure cascade); no production-affecting actions; no real
OpenAI calls (FixtureBasedEmbeddingProvider in tests); no production
Supabase mutation; no production parity execution against real
target; no secret exposure.

**Forward-substrate after G5.3**:

- **G5.4** `[BEAM-CAPSULE-STALENESS-CLOSURE]` docs-only closure
  cascade next (ADR-0045 Status flip Proposed → Accepted + Gap 5 row
  Status IN FLIGHT → CLOSED + README + CLAUDE.md ADR-0045 catalog
  refresh + optional ADR-0035 §9 cluster decision + Sub-arc 2
  closure decision)
- **Optional Gap 6 / ADR-0046** AI_AGENT EntityType-Discriminated
  Capsule Routing remains forward-substrate per ADR-0041
  §Sub-decision 6
- **Sub-arc 2 closure cascade** forward-substrate pending G5.4 +
  optional Gap 6 per ADR-0041 CL.1 scope patch

**Founder LOCKS preservation:** Q-G5.3-α α-1 + Q-G5.3-β β-1 +
Q-G5.3-γ γ-1 + Q-G5.3-δ δ-3 + Q-G5.3-ε ε-1 + Q-G5.3-ζ ζ-1 + Q-G5.3-η
η-1 + Q-G5.3-θ θ-1 + Q-G5.3-ι ι-1 + Q-G5.3-κ κ-1 + Q-G5.3-μ μ-2
LOCKED at `[BEAM-CAPSULE-STALENESS-IMPL-G5.3-QLOCK]` register
substantively per RULE 20; G5.3 execution authorization at
`[BEAM-CAPSULE-STALENESS-IMPL-G5.3-EXECUTE-VERIFY-AUTH]`.

#### G5.4 CLOSED — Gap 5 Capsule-Level Staleness Detection closure cascade (ADR-0045 Accepted 2026-05-18)

**Status:** G5.4 `[BEAM-CAPSULE-STALENESS-CLOSURE]` docs-only closure
cascade LANDED 2026-05-18 (5 MOD) per Founder Q-G5.4-α α-1 LOCK +
Q-G5.4-β β-1 LOCK + Q-G5.4-γ γ-1 LOCK + Q-G5.4-δ δ-1 LOCK + Q-G5.4-ε
ε-1 LOCK + Q-G5.4-ζ ζ-1 LOCK + Q-G5.4-η η-1 LOCK at
`[BEAM-CAPSULE-STALENESS-CLOSURE-G5.4-QLOCK]` +
`[BEAM-CAPSULE-STALENESS-CLOSURE-G5.4-EXECUTE-VERIFY-AUTH]` register
substantively. **Gap 5 Capsule-Level Staleness Detection CLOSED at
canonical-state register substantively.** ADR-0045 Status flipped
from `Proposed 2026-05-18` to **`Accepted 2026-05-18`** per Q-G5.4-β
β-1 LOCK. Gap 5 mini-arc 4/4. Sub-arc 2 remains IN FLIGHT per
Q-G5.4-ζ ζ-1 LOCK. **Optional Gap 6 / ADR-0046 AI_AGENT EntityType-
Discriminated Capsule Routing starts next under Path A** per
Q-G5.4-η η-1 LOCK. Sub-arc 2 closure remains later forward-
substrate per ADR-0041 CL.1 scope patch.

**Substrate sites (5 authorized files; 5 MOD; 0 NEW):** MOD
`docs/architecture/decisions/0045-capsule-level-staleness-detection.md`
(Status flip + NEW H2 `## G5.4 Closure Cascade (2026-05-18)` + NEW
H2 `## Post-Closure Implementation Lineage` with 4-commit table +
Implementation Lineage G5.1 row anchored at `0a21d62` +
Implementation Lineage G5.4 row flipped LANDED + Founder
Authorization G5.4 citations) + MOD
`docs/reference/section-12-progress.md` (Gap 5 row Status IN FLIGHT
→ CLOSED + commit lineage updated to `0a21d62 → 14667a1 → e6e93b8
→ this commit` + G5.4 LANDED closure prose appended) + MOD this
`docs/CURRENT_BUILD_STATE.md` (this NEW H4) + MOD
`docs/architecture/README.md` (ADR-0045 catalog Status flip Proposed
→ Accepted + tail refresh with G5.2/G5.3/G5.4 substantive landing
summary) + MOD `CLAUDE.md` (ADR-0045 catalog mirror Status flip
Proposed → Accepted + parallel tail refresh).

**Governing RULES at substrate-architectural register substantively**:
RULE 0 (Humans Always Sovereign; staleness never deletes; non-
destructive marking only; FOUNDATIONAL bypass + explicit-recall +
reversible filtering preserved) + RULE 10 (no deletion; soft-delete-
only discipline preserved) + RULE 11 (Prisma/Ecto cross-language
ownership boundary preserved; BEAM observer-only at all G5 sub-
phases) + RULE 12 (pre-flight grep verified G3.10 + G4.4 + PR.4 +
G1.6 closure cascade precedents + ADR-0045 anchors + README/CLAUDE.md
catalog Status strings) + RULE 13 (G5.4 closure rationale surfaced
clearly + ADR-0035 §9 promotion decision δ-1 surfaced with rationale)
+ RULE 20 (Founder authorization required and granted at G5.4
landing per `[BEAM-CAPSULE-STALENESS-CLOSURE-G5.4-QLOCK]` +
`[BEAM-CAPSULE-STALENESS-CLOSURE-G5.4-EXECUTE-VERIFY-AUTH]`) + RULE
21 (current-source inspection canonical at G5.4 PRE-FLIGHT register
substantively).

**Post-Closure Implementation Lineage canonical at canonical-
execution register substantively per ADR-0020 two-register IP
discipline**:

- G5.1 `0a21d62` `[BEAM-CAPSULE-STALENESS-ADR]` — ADR-0045 NEW
  Proposed; 4 MOD + 1 NEW docs-only; canonical 4-dimension staleness
  model (content age + embedding lag + coverage drift + semantic
  validity); RULE 21 research arc embedded (RS-G5-1 through RS-G5-5;
  14+ public sources); 12 Q-G5 sub-decisions canonical; mandatory
  feedback-loop vs capsule-level staleness discrimination canonical
  per RULE 13.
- G5.2 `14667a1` `[BEAM-CAPSULE-STALENESS-SUBSTRATE-OBSERVATION]` —
  substrate observation phase; 3 MOD docs-only; Q-G5.2-α α-2
  minimum-viable embedding lag schema disposition; Q-G5.2-β β-1
  defer audit literals; Q-G5.2-γ γ-2 write.service-only integration;
  Q-G5.2-δ δ-2 G5.3 minimal substantive implementation; NEW O-G5.2-1
  substrate-state observation (feedback_loop_score three-register
  discrimination canonical).
- G5.3 `e6e93b8` `[BEAM-CAPSULE-STALENESS-IMPL]` — minimum-viable
  embedding lag implementation; 11 MOD substantive + docs; 2 NEW
  MemoryCapsule fields (`embedding_content_hash` +
  `embedding_generated_at`); write.service Prisma data conditional
  spread for ADD + UPDATE branches; Ecto schema + Translator pack/
  unpack pass-through; unit tests L1-L5 + integration tests L6-L7;
  baseline deltas: unit 557 → 562 (+5); integration 211 → 213 (+2);
  Elixir cosmp_router 219 → 223 (+4); dbgi_supervisor 67/0/19
  preserved.
- G5.4 this commit `[BEAM-CAPSULE-STALENESS-CLOSURE]` — docs-only
  closure cascade; 5 MOD; ADR-0045 Status Proposed → Accepted; Gap 5
  row Status IN FLIGHT → CLOSED; README + CLAUDE.md catalogs
  flipped; NO ADR-0035 modification per Q-G5.4-δ δ-1 LOCK.

**Canonical closure precedent**: G3.10 (`08b10ef` `[BEAM-CAPSULE-
EMBEDDING-CLOSURE]`; 6 MOD docs-only; ADR-0043 Status flipped;
ADR-0035 §9 cluster expansion 36 → 38) + G4.4 (`a05040f`
`[BEAM-CAPSULE-DECAY-CLOSURE]`; 5 MOD docs-only; ADR-0044 Status
flipped; **NO ADR-0035 modification — minimum-touch precedent G5.4
follows exactly**) + PR.4 (`e60122c` `[PR-HARDENING-RUNBOOK-
CLOSURE]`; 6 MOD + 1 NEW; ADR-0047 Status flipped; ADR-0035 §9 RULE
14 back-citation footers only) + G1.6 (`[BEAM-CAPSULE-MUTATION-
DISCRIMINATION-CLOSURE]`; 6 MOD docs-only). G5.4 mirrors G4.4 step-
for-step: 5 MOD docs-only + Status flip + Gap row flip + catalog
mirrors + **NO ADR-0035 modification** per Q-G5.4-δ δ-1 LOCK (G5.3
observations D-G5.3-DB-PUSH-PRISMA-GENERATE-SPLIT + D-G5.3-AUDIT-
LOOKUP-TARGET-COLUMN-vs-JSON-PATH remain canonical at commit-body-
only register; promotion to ADR-0035 §9 reserved for later Founder-
authorized amendment if recurrence proves it belongs).

**ADR-0045 forward-substrate after closure**: capsule-level staleness
detection model canonical at substrate-architectural register
substantively; minimum-viable embedding lag substrate LANDED at G5.3
(`embedding_content_hash` + `embedding_generated_at` fields +
write.service integration + Translator pass-through). Stale-
detection semantic at canonical-execution register substantively is
UPDATE-failure preservation (OLD lag metadata while NEW content_hash
lands → `embedding_content_hash != content_hash` is the stale
signal). Filtering / ranking / lifecycle / audit-literal expansion /
COE / SimilarityService / read.service / feedback.service
integration remain forward-substrate (dormant unless future Founder-
authorized ADR-0045 amendment lands). RULE 0 + RULE 10 no-auto-
deletion discipline preserved. SimilarityService preserved UNTOUCHED
per Q-G5-ι inheritance; ADR-0043 G3.9 J5-J8 privacy proofs
preserved. BEAM observer-only canonical per Q-G5-κ κ-1 LOCK; no
Elixir-side staleness computation; Translator round-trip
preservation only.

---

## Phase 3 Sub-Arc 2 Gap 4 -- Decay Execution Formalization IN FLIGHT 2026-05-18 at G4.1 -- ADR-0044 NEW Proposed; G4.2-G4.4 forward-substrate

**Status: IN FLIGHT** at G4.1 `[BEAM-CAPSULE-DECAY-ADR]`.

Current HEAD at G4.1: this commit.
Lineage: `e60122c` (PR.4 hardening closure register substantively) → this commit.

Phase 3 Sub-arc 2 Gap 4 (Decay Execution Formalization) IN FLIGHT at
G4.1 docs-only ADR creation commit register substantively per Founder
Q-G4-α α-1 LOCK + Q-G4-μ μ-2 LOCK at `[BEAM-CAPSULE-DECAY-G4-QLOCK]`
register substantively. **Governing RULES**: RULE 0 + RULE 11 +
RULE 12 + RULE 13 + RULE 20 + RULE 21 canonical per Founder QLOCK
Mode section.

ADR-0044 NEW (Decay Execution Formalization; Status Proposed
2026-05-18) canonical at canonical-prose register substantively.
**G4.1 LOCKS architectural canonicalization of existing lazy-at-read
decay substrate at canonical-execution register substantively per
ADR-0041 §Sub-decision 4 Q-H LOCK.** 12 Q-G4 sub-decisions LOCKED at
`[BEAM-CAPSULE-DECAY-G4-QLOCK]` per RULE 20.

**4-phase mini-arc decomposition per Q-G4-μ μ-2 LOCK**:

- **G4.1** `[BEAM-CAPSULE-DECAY-ADR]` this commit docs-only ADR-0044
  NEW Proposed + 4 docs MOD + 1 NEW ADR file
- **G4.2** `[BEAM-CAPSULE-DECAY-SUBSTRATE-OBSERVATION]` docs-only or
  minimal verification forward-substrate (resolves O-G4.1-1 + O-G4.1-2
  disposition)
- **G4.3** `[BEAM-CAPSULE-DECAY-IMPL]` conditional code-tier landing
  SKIP-by-default unless G4.2 proves required implementation
  forward-substrate
- **G4.4** `[BEAM-CAPSULE-DECAY-CLOSURE]` docs-only closure cascade +
  ADR-0044 Status Proposed → Accepted forward-substrate

**2 substrate-state observations surfaced per RULE 13** (require G4.2
disposition per Founder Q-G4-γ γ-5 LOCK):

- **O-G4.1-1**: `expires_at` TTL field exists at Prisma `MemoryCapsule:165`
  but no service-tier enforcement found at COE register substantively
- **O-G4.1-2**: DecayType enum 5 values (FOUNDATIONAL / TIME_BASED /
  ACCESS_BASED / PERMANENT / SESSION_ONLY) but only FOUNDATIONAL has
  explicit substrate behavior at COE register

**Sub-arc 2 status field remains IN FLIGHT** per Q-PR-δ + Q-PR-μ +
Q-G4-α + Q-G4-μ LOCK throughout G4.1-G4.4. Sub-arc 2 closure cascade
forward-substrate pending Gap 4 (this mini-arc) + Gap 5 (ADR-0045
reserved) + optional Gap 6 (ADR-0046 reserved) + later Sub-arc 2
closure cascade per ADR-0041 CL.1 scope patch register substantively.

ADR-0043 + ADR-0047 Status preserved as Accepted 2026-05-18 throughout
G4 mini-arc per Q-G4-η η-1 LOCK no-code-changes discipline. ADR-0022 +
ADR-0033 + ADR-0035 substantive bodies UNTOUCHED at G4.1 per Q-G4-θ +
Q-G4-κ + Q-G4-η LOCK.

#### G4.1 LANDED — ADR-0044 NEW Proposed (2026-05-18)

**Status:** G4.1 `[BEAM-CAPSULE-DECAY-ADR]` LANDED 2026-05-18 (docs-
only ADR creation; 4 MOD + 1 NEW) per Founder Q-G4-α α-1 LOCK +
Q-G4-μ μ-2 LOCK at `[BEAM-CAPSULE-DECAY-G4-QLOCK]` +
`[BEAM-CAPSULE-DECAY-ADR-G4.1-EXECUTE-VERIFY-AUTH]` register
substantively. ADR-0044 NEW (Decay Execution Formalization; Status
Proposed 2026-05-18). G4.1 does NOT close Gap 4; G4.4 closure cascade
flips ADR-0044 Status → Accepted at canonical-state register
substantively.

**Substrate sites (5 authorized files; 4 MOD + 1 NEW):** NEW
`docs/architecture/decisions/0044-decay-execution-formalization.md`
+ MOD `docs/architecture/README.md` (NEW ADR-0044 catalog entry) +
MOD `CLAUDE.md` (NEW ADR-0044 catalog entry mirror) + MOD
`docs/reference/section-12-progress.md` (NEW G4 IN FLIGHT row) +
MOD this `docs/CURRENT_BUILD_STATE.md` (NEW H2 + this G4.1 H4).

**Governing RULES at substrate-architectural register substantively**:
RULE 0 (Humans Always Sovereign; decay never deletes; FOUNDATIONAL
bypass + explicit-recall bypass + soft-delete-only discipline) +
RULE 11 (Prisma/Ecto cross-language ownership boundary preserved per
ADR-0033; TypeScript owns scoring/decay; BEAM observes via Translator
round-trip only) + RULE 12 (pre-flight grep; repo-evidence grounded)
+ RULE 13 (substrate traps surfaced inline) + RULE 20 (Founder
authorization required) + RULE 21 (research arc canonical at
canonical-knowledge register substantively).

**Substrate canonicalized at canonical-execution register substantively
per Q-G4-ι ι-1 LOCK**: COE forget-floor filter at
`coe.service.ts:44` (RELEVANCE_FORGET_FLOOR = 0.2) + `:235-238`
(forget-floor gate with FOUNDATIONAL bypass) + `:524-545` (Loop 1
hook); feedback constants at `feedback.service.ts:91-104` (5
RELEVANCE_* constants per ADR-0022 §Amendment 1); read-path
`last_accessed_at` touch at `read.service.ts:328-335`; async
`access_count` increment at `read.service.ts:772-788`; write-path
`decay_type` / `decay_rate` persistence at `write.service.ts:60-61` +
`:635-637` + `:661-662`; ADR-0022 combined_score recency at
`keywords.ts:74-92`; BEAM Translator round-trip preservation at
`apps/cosmp_router/lib/cosmp_router/capsule/translator.ex`.

**RULE 21 research arc embedded at ADR-0044 §Context register
substantively**: RS-1 Mem0 ranking-time decay (April 2026 algorithm;
1.5×/0.3× fresh-stale spread; ADD-only extraction) + RS-2 Ebbinghaus
1885 forgetting curve / SM-2 (1987) / FSRS (2022; power-law; 99.5%
outperforms SM-2) + RS-3 LRU/LFU/ARC cache eviction (analogy only
per Founder QLOCK RS-3 explicit clause; NOT deletion policy per RULE 0
+ RULE 10) + RS-4 RAG temporal weighting (alpha-blend
`α·cos(q,d) + (1-α)·0.5^(age/h)` + multi-factor formulas; arXiv
2509.19376 + 2510.16715) + RS-5 Oban + Quantum BEAM scheduler context
(future-substrate ONLY per Q-G4-κ κ-1 LOCK; NO hex-dep additions at
G4.1).

**Forbidden / preserved boundaries enumerated**: no apps/** /
tests/** / packages/** / scripts/** changes; no schema.prisma; no
CI workflows; no package.json / lockfile changes; no vitest config
changes; no docker-compose / .husky changes; no mix.exs / mix.lock;
no audit.ts changes; no new audit literals at G4.1; no ADR-0022
amendment; no ADR-0033 amendment; no ADR-0035 modification at G4.1;
no ADR-0043 Status change; no ADR-0047 Status change;
no ADR-0045 / ADR-0046 renumbering; Gap 4/5/6 reservations
preserved at ADR-0041 umbrella; no production-affecting actions;
no Elixir vector access; no Elixir decay computation at G4.1; no
secret exposure.

**Founder LOCKS preservation:** Q-G4-α through Q-G4-μ LOCKED at
`[BEAM-CAPSULE-DECAY-G4-QLOCK]` register substantively per RULE 20;
G4.1 execution authorization at `[BEAM-CAPSULE-DECAY-ADR-G4.1-EXECUTE-VERIFY-AUTH]`.

#### G4.2 LANDED — Substrate observation disposition (α-2 + β-2 defer; γ-1 G4.3 SKIP) (2026-05-18)

**Status:** G4.2 `[BEAM-CAPSULE-DECAY-SUBSTRATE-OBSERVATION]` LANDED
2026-05-18 (docs-only 3 MOD) per Founder Q-G4.2-α α-2 LOCK + Q-G4.2-β
β-2 LOCK + Q-G4.2-γ γ-1 LOCK + Q-G4.2-δ δ-1 LOCK at
`[BEAM-CAPSULE-DECAY-SUBSTRATE-OBSERVATION-G4.2-QLOCK]` +
`[BEAM-CAPSULE-DECAY-SUBSTRATE-OBSERVATION-G4.2-EXECUTE-VERIFY-AUTH]`
register substantively. ADR-0044 Status preserved
`Proposed 2026-05-18` (G4.4 closure cascade is the Status-flip
commit). Gap 4 row Status preserved IN FLIGHT; Sub-arc 2 status
field preserved IN FLIGHT. G4.2 does NOT close Gap 4.

**Substrate sites (3 authorized files; 3 MOD):** MOD
`docs/architecture/decisions/0044-decay-execution-formalization.md`
(NEW H2 `## G4.2 Substrate Observation Resolution (2026-05-18)` +
Founder Authorization G4.2 citations + Implementation Lineage G4.2
row updated to LANDED + G4.3 row updated to SKIP-by-default) + MOD
`docs/reference/section-12-progress.md` (G4.2 LANDED prose appended
to Gap 4 row) + MOD this `docs/CURRENT_BUILD_STATE.md` (this NEW H4).

**Governing RULES at substrate-architectural register substantively**:
RULE 0 (no automatic deletion; user/entity autonomy preserved) +
RULE 11 (Prisma/Ecto cross-language ownership boundary preserved) +
RULE 12 (pre-flight grep substrate-state ground truth verified for
expires_at + DecayType) + RULE 13 (NEW O-G4.2-3 substrate-state
observation surfaced inline) + RULE 20 (Founder authorization
required and granted) + RULE 21 (current-source inspection canonical
at G4.2 PRE-FLIGHT register substantively).

**Three substrate-state observations canonical at G4.2 substrate-
architectural register substantively:**

- **O-G4.1-1 expires_at TTL deferred** per Q-G4.2-α α-2 LOCK.
  MemoryCapsule.expires_at field exists at `schema.prisma:165`
  (`DateTime?`); persisted at create-time at `write.service.ts:675`;
  immutable post-create per `write.service.ts:1102` inline comment;
  no `@@index` on MemoryCapsule; no service-tier enforcement at
  `coe.service.ts` / `read.service.ts` / `similarity.service.ts`;
  no MemoryCapsule-level audit literal. Other models' expires_at
  ARE actively enforced via dedicated audit literals
  (`SESSION_EXPIRED` + `PERMISSION_EXPIRED` +
  `REGULATOR_ACCESS_EXPIRED`); MemoryCapsule has no such audit
  literal and Q-G4-η η-1 LOCK preserves "no new audit literals at
  G4". Deferral is substrate-honest and preserves RULE 0 no-
  automatic-deletion discipline.

- **O-G4.1-2 DecayType enum semantics deferred** per Q-G4.2-β β-2
  LOCK. Canonical runtime state at HEAD `7097bb8`: FOUNDATIONAL has
  explicit substrate behavior at `coe.service.ts:235` (forget-floor
  bypass) + `:250` (isFoundational flag) + `:253-259` (FOUNDATIONAL-
  first ordering + zero token budget consumption) +
  `write.service.ts:637` (storage_tier defaults to HOT); TIME_BASED
  is the write-time default at `write.service.ts:635` with no
  distinct behavior beyond `combined_score` recency per ADR-0022
  (which applies to ALL non-FOUNDATIONAL types equally);
  ACCESS_BASED + PERMANENT + SESSION_ONLY have no distinct runtime
  behavior at any register. Canonical state: "FOUNDATIONAL is
  special; all non-FOUNDATIONAL values share default ranking
  behavior".

- **O-G4.2-3 NEW substrate-state observation surfaced at G4.2 PRE-
  FLIGHT per RULE 13.** MemoryCapsule.expires_at is settable at
  create-time (`write.service.ts:675`) but explicitly immutable
  post-create (`write.service.ts:1102` inline comment + omission
  from `CapsuleUpdateInput`). Combined with absence of any service-
  tier enforcement (O-G4.1-1), the field is currently a persisted-
  but-unused metadata field at the capsule tier. No `@@index` on
  MemoryCapsule (indices at L270 + L368 + L617 belong to
  CapsulePermission + Session + RegulatorAccess respectively). No
  production data depends on the field's semantics. Reinforces
  Q-G4.2-α α-2 defer disposition. Folds into Q-G4.2-α α-2 LOCK
  rationale at canonical-coherence register substantively; no
  separate Q-LOCK required.

**G4.3 formal SKIP forward-substrate per Q-G4.2-γ γ-1 LOCK**:
separate SKIP commit canonical per G1.4 (`3505fde`
`[CAPSULE-MUTATION-ELIXIR-AUDIT]`) + G3.7 (`ee0b01b`
`[CAPSULE-EMBEDDING-BACKFILL]`) mini-arc SKIP precedents. SKIP NOT
folded into G4.2 or G4.4; preserves canonical SKIP commit pattern at
canonical-state register substantively.

**G4.4 closure cascade forward-substrate** — ADR-0044 Status flip
`Proposed 2026-05-18` → `Accepted 2026-05-1X` + Implementation
Lineage G4.4 row update + section-12-progress Gap 4 row Status flip
to CLOSED + this CURRENT_BUILD_STATE G4.4 H4 addition + optional
ADR-0035 §9 cluster expansion if Founder authorizes.

**Forbidden / preserved boundaries enumerated at G4.2**: no apps/**
/ tests/** / packages/** / scripts/** changes; no schema.prisma; no
CI workflows; no package.json / lockfile changes; no vitest config
changes; no docker-compose / .husky changes; no mix.exs / mix.lock;
no audit.ts changes; no new audit literals at G4.2; no ADR-0022
amendment; no ADR-0033 amendment; no ADR-0035 modification at G4.2;
no ADR-0043 Status change; no ADR-0047 Status change; no ADR-0041
modification (Gap 4/5/6 reservations preserved); no ADR-0045 /
ADR-0046 renumbering; no README / CLAUDE.md changes at G4.2; no
production-affecting actions; no Elixir vector access; no Elixir
decay computation; no secret exposure.

**Founder LOCKS preservation:** Q-G4.2-α α-2 + Q-G4.2-β β-2 +
Q-G4.2-γ γ-1 + Q-G4.2-δ δ-1 LOCKED at
`[BEAM-CAPSULE-DECAY-SUBSTRATE-OBSERVATION-G4.2-QLOCK]` register
substantively per RULE 20; G4.2 execution authorization at
`[BEAM-CAPSULE-DECAY-SUBSTRATE-OBSERVATION-G4.2-EXECUTE-VERIFY-AUTH]`.

#### G4.3 SKIPPED — Formal SKIP record (α-1 + β-1 + γ-1 + δ-3) (2026-05-18)

**Status:** G4.3 `[BEAM-CAPSULE-DECAY-IMPL]` formally SKIPPED
2026-05-18 (docs-only 3 MOD) per Founder Q-G4.3-α α-1 LOCK + Q-G4.3-β
β-1 LOCK + Q-G4.3-γ γ-1 LOCK + Q-G4.3-δ δ-3 LOCK at
`[BEAM-CAPSULE-DECAY-IMPL-G4.3-QLOCK]` +
`[BEAM-CAPSULE-DECAY-IMPL-G4.3-EXECUTE-VERIFY-AUTH]` register
substantively. **No implementation landed at G4.3.** ADR-0044 Status
preserved `Proposed 2026-05-18` (G4.4 closure cascade is the
canonical Status-flip commit per Q-G4.3-γ γ-1 LOCK). Gap 4 row Status
preserved IN FLIGHT; Sub-arc 2 status field preserved IN FLIGHT. G4.3
SKIP advances Gap 4 mini-arc 2/4 → 3/4; G4.4 closure cascade
forward-substrate is next.

**Substrate sites (3 authorized files; 3 MOD):** MOD
`docs/architecture/decisions/0044-decay-execution-formalization.md`
(NEW H2 `## G4.3 Formal SKIP Record (2026-05-18)` + Founder
Authorization G4.3 citations + Implementation Lineage G4.3 row
flipped `forward-substrate` → `G4.3 SKIPPED 2026-05-18`) + MOD
`docs/reference/section-12-progress.md` (G4.3 SKIPPED prose appended
to Gap 4 row) + MOD this `docs/CURRENT_BUILD_STATE.md` (this NEW
H4).

**Governing RULES at substrate-architectural register substantively**:
RULE 0 (no automatic deletion preserved) + RULE 11 (Prisma/Ecto
boundary preserved; no Elixir decay computation) + RULE 12 (pre-flight
grep substrate-state ground truth verified for SKIP precedents +
ADR-0044 anchors) + RULE 13 (SKIP rationale surfaced clearly; not
pretending implementation landed) + RULE 20 (Founder authorization
required and granted) + RULE 21 (current-source inspection canonical
at G4.3 PRE-FLIGHT register substantively).

**G4.3 SKIP rationale — substrate-state ground truth**: every
implementation surface that G4.3 could substantively touch was
deferred or excluded by prior locks:

- **Q-G4.2-α α-2 LOCK** at G4.2 deferred MemoryCapsule.expires_at
  TTL enforcement to a future Founder-authorized ADR amendment →
  removed TTL enforcement implementation from G4.3 scope.
- **Q-G4.2-β β-2 LOCK** at G4.2 deferred explicit non-FOUNDATIONAL
  DecayType enum semantics to a future Founder-authorized ADR
  amendment → removed DecayType enum semantics implementation from
  G4.3 scope.
- **Q-G4-η η-1 LOCK** at G4 mini-arc level: existing audit literals
  suffice; no new audit literals at G4 → removed audit-literal
  expansion from G4.3 scope.
- **Q-G4-θ θ-1 LOCK** at G4 mini-arc level: SimilarityService
  UNTOUCHED; ADR-0043 G3.9 J5-J8 privacy proofs preserved → removed
  COE / similarity-search integration from G4.3 scope.
- **Q-G4-κ κ-1 LOCK** at G4 mini-arc level: BEAM observer only; no
  Elixir-side decay computation; no scheduler dependency; no
  Oban/Quantum hex-dep → removed Elixir implementation from G4.3
  scope.
- **RULE 0 + RULE 10 + Q-G4-ζ LOCK**: decay never deletes; no
  automatic deletion; soft-delete-only discipline; FOUNDATIONAL
  bypass + explicit-recall bypass preserved → removed any deletion-
  class implementation from G4.3 scope.

**Canonical SKIP precedent citations**:

- **G1.4** commit `3505fde` `[CAPSULE-MUTATION-ELIXIR-AUDIT]` —
  formal SKIP per ADR-0042 §Sub-decision Q-ι default LOCK; 1 MOD
  docs-only minimum-touch SKIP record. G4.3 SKIP scope (3 MOD)
  follows the G1.4 minimum-touch pattern.
- **G3.7** commit `ee0b01b` `[CAPSULE-EMBEDDING-BACKFILL]` — formal
  SKIP per ADR-0043 §Sub-decision Q-G3.7-α α-1 LOCK + Q-G3.7-η
  5-MOD-docs-only scope LOCK; 5 MOD docs-only (included README +
  CLAUDE.md mid-arc catalog refresh). G4.3 SKIP scope is smaller
  than G3.7 because ADR-0044 catalog entries in README + CLAUDE.md
  were already added at G4.1 (`7097bb8`) and remain current.

**G4.4 closure cascade forward-substrate** — ADR-0044 Status flip
`Proposed 2026-05-18` → `Accepted 2026-05-XX` + Implementation
Lineage G4.4 row update + section-12-progress Gap 4 row Status flip
to CLOSED + this CURRENT_BUILD_STATE G4.4 H4 addition + optional
ADR-0035 §9 cluster expansion if Founder authorizes per Q-G4.3-δ δ-3
deferral.

**Forbidden / preserved boundaries enumerated at G4.3**: no apps/**
/ tests/** / packages/** / scripts/** changes; no schema.prisma; no
CI workflows; no package.json / lockfile changes; no vitest config
changes; no docker-compose / .husky changes; no mix.exs / mix.lock;
no audit.ts changes; no new audit literals at G4.3; no ADR-0022
amendment; no ADR-0033 amendment; no ADR-0035 modification at G4.3
(δ-3 LOCK deferral); no ADR-0043 Status change; no ADR-0047 Status
change; no ADR-0041 modification (Gap 4/5/6 reservations preserved);
no ADR-0045 / ADR-0046 renumbering; no README / CLAUDE.md changes at
G4.3 (β-1 LOCK); no Sub-arc 2 status flip to CLOSED; no Gap 4 row
status flip to CLOSED; no production-affecting actions; no Elixir
vector access; no Elixir decay computation; no secret exposure.

**Founder LOCKS preservation:** Q-G4.3-α α-1 + Q-G4.3-β β-1 +
Q-G4.3-γ γ-1 + Q-G4.3-δ δ-3 LOCKED at
`[BEAM-CAPSULE-DECAY-IMPL-G4.3-QLOCK]` register substantively per
RULE 20; G4.3 execution authorization at
`[BEAM-CAPSULE-DECAY-IMPL-G4.3-EXECUTE-VERIFY-AUTH]`.

#### G4.4 CLOSED — Gap 4 Decay Execution Formalization closure cascade (ADR-0044 Accepted 2026-05-18)

**Status:** G4.4 `[BEAM-CAPSULE-DECAY-CLOSURE]` docs-only closure
cascade LANDED 2026-05-18 (5 MOD) per Founder Q-G4.4-α α-1 LOCK +
Q-G4.4-β β-1 LOCK + Q-G4.4-γ γ-1 LOCK + Q-G4.4-δ δ-1 LOCK + Q-G4.4-ε
ε-1 LOCK + Q-G4.4-ζ ζ-1 LOCK + Q-G4.4-η η-1 LOCK at
`[BEAM-CAPSULE-DECAY-CLOSURE-G4.4-QLOCK]` +
`[BEAM-CAPSULE-DECAY-CLOSURE-G4.4-EXECUTE-VERIFY-AUTH]` register
substantively. **Gap 4 Decay Execution Formalization CLOSED at
canonical-state register substantively.** ADR-0044 Status flipped
from `Proposed 2026-05-18` to **`Accepted 2026-05-18`** per Q-G4.4-β
β-1 LOCK. Gap 4 mini-arc 4/4. Sub-arc 2 remains IN FLIGHT per
Q-G4.4-ζ ζ-1 LOCK. **Gap 5 / ADR-0045 Capsule-Level Staleness
Detection starts next** per Q-G4.4-η η-1 LOCK.

**Substrate sites (5 authorized files; 5 MOD; 0 NEW):** MOD
`docs/architecture/decisions/0044-decay-execution-formalization.md`
(Status flip + NEW H2 `## G4.4 Closure Cascade (2026-05-18)` + NEW
H2 `## Post-Closure Implementation Lineage` with 4-commit table +
Implementation Lineage G4.1 row anchored at `7097bb8` +
Implementation Lineage G4.4 row flipped LANDED + Founder
Authorization G4.4 citations) + MOD
`docs/reference/section-12-progress.md` (Gap 4 row Status IN FLIGHT
→ CLOSED + G4.4 closure prose appended) + MOD this
`docs/CURRENT_BUILD_STATE.md` (this NEW H4) + MOD
`docs/architecture/README.md` (ADR-0044 catalog Status flip Proposed
→ Accepted + tail refresh with G4.2/G4.3/G4.4 substantive landing
summary) + MOD `CLAUDE.md` (ADR-0044 catalog mirror Status flip
Proposed → Accepted + parallel tail refresh).

**Governing RULES at substrate-architectural register substantively**:
RULE 0 (no automatic deletion preserved) + RULE 11 (Prisma/Ecto
boundary preserved; no Elixir decay computation) + RULE 12 (pre-
flight grep verified G3.10 + PR.4 + G1.6 closure cascade precedents
+ ADR-0044 anchors + README/CLAUDE.md catalog Status strings) + RULE
13 (G4.4 closure rationale surfaced clearly + ADR-0035 §9 promotion
decision δ-1 surfaced with rationale + G4.1 Implementation Lineage
row anchor correction surfaced inline) + RULE 20 (Founder
authorization required and granted) + RULE 21 (current-source
inspection canonical at G4.4 PRE-FLIGHT register substantively).

**Post-Closure Implementation Lineage canonical at canonical-
execution register substantively per ADR-0020 two-register IP
discipline**:

- G4.1 `7097bb8` `[BEAM-CAPSULE-DECAY-ADR]` — ADR-0044 NEW Proposed;
  4 MOD + 1 NEW docs-only; canonicalizes existing lazy-at-read decay
  substrate; 2 substrate-state observations surfaced (O-G4.1-1
  expires_at TTL + O-G4.1-2 DecayType enum semantics); RULE 21
  research arc embedded.
- G4.2 `ce33c3a` `[BEAM-CAPSULE-DECAY-SUBSTRATE-OBSERVATION]` —
  substrate observation phase; 3 MOD docs-only; Q-G4.2-α α-2 deferred
  TTL; Q-G4.2-β β-2 deferred DecayType enum semantics; Q-G4.2-γ γ-1
  G4.3 formal SKIP determination; NEW O-G4.2-3 substrate-state
  observation surfaced.
- G4.3 `b558f64` `[BEAM-CAPSULE-DECAY-IMPL]` — formal SKIP record; 3
  MOD docs-only; no implementation landed; canonical SKIP commit
  pattern per G1.4 (`3505fde`) + G3.7 (`ee0b01b`) precedents; Q-G4.3-δ
  δ-3 deferred ADR-0035 §9 cluster decision to G4.4.
- G4.4 this commit `[BEAM-CAPSULE-DECAY-CLOSURE]` — docs-only closure
  cascade; 5 MOD; ADR-0044 Status Proposed → Accepted; Gap 4 row
  Status IN FLIGHT → CLOSED; README + CLAUDE.md catalogs flipped; NO
  ADR-0035 modification per Q-G4.4-δ δ-1 LOCK.

**Canonical closure precedent**: G3.10 (`08b10ef` `[BEAM-CAPSULE-
EMBEDDING-CLOSURE]`; 6 MOD docs-only; ADR-0043 Status flipped; ADR-
0035 §9 cluster expansion 36 → 38) + PR.4 (`e60122c` `[PR-HARDENING-
RUNBOOK-CLOSURE]`; 6 MOD + 1 NEW; ADR-0047 Status flipped; ADR-0035
§9 RULE 14 back-citation footers only) + G1.6 (`[BEAM-CAPSULE-
MUTATION-DISCRIMINATION-CLOSURE]`; 6 MOD docs-only). G4.4 follows
the canonical pattern one step lighter than PR.4 — NO ADR-0035
modification per Q-G4.4-δ δ-1 LOCK (G4 observations are specific
substrate-state facts about MemoryCapsule.expires_at + DecayType
enum semantics; no recurrence/generalizable substrate-build risk
proven; no existing ADR-0035 §9 observation directly corresponds for
back-citation).

**ADR-0044 forward-substrate after closure**: dormant unless future
Founder-authorized ADR amendment lands MemoryCapsule.expires_at TTL
enforcement (per Q-G4.2-α α-2 deferral) or non-FOUNDATIONAL DecayType
enum semantics (per Q-G4.2-β β-2 deferral). RULE 0 + RULE 10 + Q-G4-ζ
no-auto-deletion discipline preserved. SimilarityService preserved
UNTOUCHED per Q-G4-θ θ-1 LOCK; ADR-0043 G3.9 J5-J8 privacy proofs
preserved. BEAM observer-only canonical per Q-G4-κ κ-1 LOCK; no
Elixir-side decay computation; Translator round-trip preservation
only.

**Forbidden / preserved boundaries enumerated at G4.4**: no apps/**
/ tests/** / packages/** / scripts/** changes; no schema.prisma; no
CI workflows; no package.json / lockfile changes; no vitest config
changes; no docker-compose / .husky changes; no mix.exs / mix.lock;
no audit.ts changes; no new audit literals at G4.4; no ADR-0022
amendment; no ADR-0033 amendment; no ADR-0035 modification at G4.4
(δ-1 LOCK); no ADR-0041 modification (Gap 4/5/6 reservations
preserved); no ADR-0043 Status change; no ADR-0047 Status change; no
ADR-0045 / ADR-0046 renumbering; no Sub-arc 2 status flip to CLOSED
(ζ-1 LOCK); no production-affecting actions; no Elixir vector
access; no Elixir decay computation; no secret exposure.

**Forward-substrate after G4.4 closure**:

- **Gap 5 / ADR-0045** Capsule-Level Staleness Detection mini-arc is
  the canonical next-Gap per Q-G4.4-η η-1 LOCK + ADR-0041 §Sub-
  decision 5 canonical next-Gap ordering
- **Optional Gap 6 / ADR-0046** AI_AGENT EntityType-Discriminated
  Capsule Routing remains forward-substrate per ADR-0041 §Sub-
  decision 6 (optional)
- **Sub-arc 2 closure cascade** forward-substrate pending Gap 5 +
  optional Gap 6 per ADR-0041 CL.1 scope patch

**Founder LOCKS preservation:** Q-G4.4-α α-1 + Q-G4.4-β β-1 +
Q-G4.4-γ γ-1 + Q-G4.4-δ δ-1 + Q-G4.4-ε ε-1 + Q-G4.4-ζ ζ-1 + Q-G4.4-η
η-1 LOCKED at `[BEAM-CAPSULE-DECAY-CLOSURE-G4.4-QLOCK]` register
substantively per RULE 20; G4.4 execution authorization at
`[BEAM-CAPSULE-DECAY-CLOSURE-G4.4-EXECUTE-VERIFY-AUTH]`.

---

## Post-Gap-3 Production-Readiness Hardening Mini-Arc CLOSED 2026-05-18 at PR.4 -- PR.1+PR.2+PR.3+PR.4 LANDED; ADR-0047 Accepted

**Status: CLOSED** at PR.4 `[PR-HARDENING-RUNBOOK-CLOSURE]`.

Current HEAD at closure: this commit.
Lineage: `08b10ef` (Gap 3 G3.10 closure register substantively) → `b478191` (PR.1 ADR-0047 NEW Proposed) → `57edb3b` (PR.2 fail-closed vitest config + guard test) → `bb26126` (PR.3 local refresh + parity verifier) → this commit (PR.4 deployment runbook + closure cascade + ADR-0047 Accepted).

Post-Gap-3 production-readiness hardening mini-arc IN FLIGHT 2026-05-18
at PR.1 docs-only ADR creation commit register substantively per
Founder Q-PR-α LOCK Option α (run pre-Gap-4 hardening mini-arc) +
Q-PR-β LOCK Option β (4-sub-phase compressed PR.1-PR.4 decomposition)
at `[POST-GAP-3-PRODUCTION-READINESS-HARDENING-QLOCK]` register
substantively. **Governing RULES at substrate-architectural register
substantively**: RULE 0 + RULE 11 + RULE 12 + RULE 13 + RULE 20 +
RULE 21 canonical per Founder QLOCK Mode section. **Production-safety
hardening arc framing canonical (NOT convenience cleanup)** per
ADR-0035 §9 37th observation D-VITEST-NPX-CONFIG-DEFAULT-LOADS-
PRODUCTION-SUPABASE + 38th observation D-LOCAL-DEV-ENV-CROSS-LANGUAGE-
OWNERSHIP-DRIFT canonical at canonical-rule register substantively.

ADR-0047 NEW (Post-Gap-3 Production-Readiness Hardening Mini-Arc;
Status Proposed 2026-05-18) canonical at canonical-prose register
substantively at substrate-architectural register substantively per
Founder Q-PR-κ amended Option γ at `[Q-PR-κ-AMENDMENT-OPTION-γ]` +
`[PR-HARDENING-ADR-PR.1-EXECUTE-VERIFY-AUTH]` register substantively.
ADR-0044 Gap 4 Decay Execution Formalization / ADR-0045 Gap 5 Capsule-
Level Staleness Detection / ADR-0046 optional Gap 6 AI_AGENT
EntityType-Discriminated Capsule Routing forward-substrate
reservations **preserved** canonical at canonical-state register
substantively per patent-implementation evidence lineage at ADR-0041
umbrella per ADR-0020 two-register IP discipline. PR.1 Hawkseye
preflight surfaced D-PR.1-ADR-NUMBERING-FORWARD-SUBSTRATE-RESERVATION-
CASCADE-IMPACT canonical at RULE 13 substrate-honest register
substantively at ~78-reference renumbering cascade risk; Founder
amended Q-PR-κ to Option γ ADR-0047 selected at canonical-execution
register substantively at zero-cross-reference-modification register
substantively.

**4-sub-phase mini-arc decomposition**:

- **PR.1** `[PR-HARDENING-ADR]` this commit docs-only ADR-0047 NEW
  Proposed + 4 docs MOD + 1 NEW ADR file
- **PR.2** `[PR-VITEST-CONFIG-HARDENING]` substantive `vitest.config.ts`
  fail-closed default + NEW guard unit test forward-substrate
- **PR.3** `[PR-LOCAL-DB-AND-PARITY-HARDENING]` substantive NEW
  `scripts/local-test-db-refresh.sh` + NEW read-only production
  parity verification script + docs forward-substrate
- **PR.4** `[PR-HARDENING-RUNBOOK-CLOSURE]` NEW
  `docs/operations/deployment-runbook.md` + closure cascade +
  ADR-0047 Status → Accepted forward-substrate

**Pre-launch mandatory gate compressed per Q-PR-λ Option β**: PR.2
vitest config hardening + PR.3 production parity verifier + PR.4
deployment runbook mandatory before any live-production claim
canonical at canonical-state register substantively per RULE 0
production-safety boundary discipline.

Sub-arc 2 status field remains **IN FLIGHT** throughout the hardening
mini-arc per Q-PR-δ + Q-PR-μ LOCK at canonical-state register
substantively. Sub-arc 2 closure cascade forward-substrate pending
Gap 4 + Gap 5 + optional Gap 6 + later Sub-arc 2 closure cascade per
ADR-0041 CL.1 scope patch.

ADR-0043 Status preserved as Accepted 2026-05-18 throughout the
hardening mini-arc per Q-PR-η LOCK no-production-code-changes
discipline. ADR-0022 + ADR-0033 UNTOUCHED per Q-PR-ζ. ADR-0035
untouched at PR.1 per Q-PR-κ Option γ minimum-touch (§9 back-citation
deferred to PR.4 closure cascade).

Gap 4 starts ONLY after PR.4 lands canonical at canonical-state
register substantively per Q-PR-μ LOCK Option α.

#### PR.1 LANDED — ADR-0047 NEW Proposed (2026-05-18)

**Status:** PR.1 `[PR-HARDENING-ADR]` LANDED 2026-05-18 (docs-only
ADR creation; 4 MOD + 1 NEW) per Founder Q-PR-α LOCK Option α + Q-PR-β
LOCK Option β + Q-PR-κ amended Option γ at
`[Q-PR-κ-AMENDMENT-OPTION-γ]` + `[PR-HARDENING-ADR-PR.1-EXECUTE-VERIFY-AUTH]`
register substantively. ADR-0047 NEW (Post-Gap-3 Production-Readiness
Hardening Mini-Arc; Status Proposed 2026-05-18). PR.1 does NOT close
the hardening mini-arc; PR.4 closure cascade flips ADR-0047 Status →
Accepted at canonical-state register substantively.

**Substrate sites (5 authorized files; 4 MOD + 1 NEW):** NEW
`docs/architecture/decisions/0047-production-readiness-hardening.md`
+ MOD `docs/architecture/README.md` (NEW catalog entry) + MOD
`CLAUDE.md` (NEW catalog entry mirror) + MOD
`docs/reference/section-12-progress.md` (NEW Post-Gap-3 hardening row
canonical at canonical-state register substantively) + MOD this
`docs/CURRENT_BUILD_STATE.md` (NEW H2 + this PR.1 H4).

**Governing RULES at substrate-architectural register substantively**:
RULE 0 (Humans Always Sovereign; no production Supabase writes during
tests; no secret exposure; no vector/embedding/distance/audit
leakage) + RULE 11 (Wider Elixir/BEAM substrate check + Prisma/Ecto
cross-language ownership boundary discipline per ADR-0033 §Decision 7
+ Q-5BII-EXEC-5) + RULE 12 (Pre-flight grep before drafting;
repo-evidence grounded) + RULE 13 (Surface substrate traps and
uncertainty inline; do not silently fix or normalize) + RULE 20
(Founder authorization required before edits / staging / commits /
pushes / production-affecting actions) + RULE 21 (Current-source /
repo inspection at canonical-knowledge register substantively before
architecture or build recommendations).

**Production-safety hardening arc framing canonical (NOT convenience
cleanup)** per ADR-0035 §9 37th + 38th observations.

**11 Q-PR sub-decisions enumerated.** Q-PR-α Option α run hardening;
Q-PR-β Option β 4-sub-phase compressed PR.1-PR.4; Q-PR-γ Option α
fail-closed `vitest.config.ts` + NEW guard unit test at PR.2; Q-PR-δ
Option α NEW `scripts/local-test-db-refresh.sh` at PR.3 encoding
canonical 7-step refresh sequence; Q-PR-ε Option α NEW read-only
production parity verification script at PR.3 (no mutations; no secret
exposure; drift inventory only); Q-PR-ζ Option α defer CI label
freshness; Q-PR-η Option α defer TS baseline 12; Q-PR-θ Option α defer
pgvector_ex naming drift to α-3; Q-PR-ι Option α NEW
`docs/operations/deployment-runbook.md` at PR.4; Q-PR-κ amended
Option γ ADR-0047 selected (preserves ADR-0044/0045/0046 reservations);
Q-PR-λ Option β pre-launch mandatory gate compressed; Q-PR-μ Option α
Gap 4 starts only after PR.4 lands.

**RULE 13 surface preserved**: D-PR.1-ADR-NUMBERING-FORWARD-SUBSTRATE-
RESERVATION-CASCADE-IMPACT canonical at PR.1 Hawkseye preflight
register substantively (~78 cross-references to ADR-0044/0045/0046
across 7 files would have been modified under Option α renumbering
cascade; Option γ ADR-0047 selected avoids the cascade at canonical-
execution register substantively per Founder Q-PR-κ amendment).

**Forbidden / preserved boundaries enumerated:** no `apps/**` / no
`tests/**` / no `packages/**` / no `scripts/**` / no `schema.prisma` /
no DB scripts / no CI workflows / no package/lockfiles / no
`vitest.config*` changes at PR.1 / no `mix.exs` / no `mix.lock` / no
`audit.ts` / no new audit literals / no ADR-0022 amendment / no
ADR-0033 amendment / no ADR-0043 Status change / no ADR-0035
modification at PR.1 / no Gap 4/5/6 ADR renumbering / no production-
affecting actions / no secret exposure / no new files outside the 1
authorized NEW ADR file.

**Forward-substrate after PR.1:** PR.2 substantive vitest config
hardening + NEW guard unit test; PR.3 substantive NEW local DB
refresh script + NEW read-only production parity verification script;
PR.4 substantive NEW deployment runbook + closure cascade closes
hardening mini-arc + flips ADR-0047 Status → Accepted at canonical-
state register substantively.

**Founder LOCKS preservation:** Q-PR-α through Q-PR-μ LOCKED at
`[POST-GAP-3-PRODUCTION-READINESS-HARDENING-QLOCK]` register
substantively per RULE 20; Q-PR-κ amended at `[Q-PR-κ-AMENDMENT-OPTION-γ]`
register substantively per RULE 13 + RULE 20 patent-implementation
lineage preservation discipline; PR.1 execution authorization at
`[PR-HARDENING-ADR-PR.1-EXECUTE-VERIFY-AUTH]`.

#### PR.2 LANDED — Fail-closed vitest config + guard test (2026-05-18)

**Status:** PR.2 `[PR-VITEST-CONFIG-HARDENING]` LANDED 2026-05-18 at
commit `57edb3b54658f28349e0f34d5346e76a1888be42` (substantive 1 MOD
+ 1 NEW) per Founder Q-PR.2-α α-1 + Q-PR.2-β literal-"1" + Q-PR.2-γ
leave-package.json + Q-PR.2-δ + Q-PR.2-ε 5-it-blocks + Q-PR.2-ζ
no-docs + Q-PR.2-η 1 MOD + 1 NEW LOCKS at
`[PR-HARDENING-VITEST-CONFIG-PR.2-QLOCK]`.

**ADR-0035 §9 37th observation D-VITEST-NPX-CONFIG-DEFAULT-LOADS-
PRODUCTION-SUPABASE CLOSED at canonical-execution register
substantively** at PR.2 commit `57edb3b`.

**Substrate sites (2 authorized files; 1 MOD + 1 NEW):**
MOD `vitest.config.ts` hardened fail-closed default (loads `.env.test`
by default; opt-in path loads `.env` ONLY when
`ALLOW_PROD_TEST_ENV === "1"`; DATABASE_URL host validation throws
hostname-only error if non-local without opt-in). NEW
`tests/unit/test-env-config-safety.test.ts` 5 named-block guard
tests (NODE_ENV / DATABASE_URL defined / host localhost-family / host
NOT production Supabase pooler / .env.test was loaded).

**T2.8 runtime probe at PR.2 PRE-STAGE substantively verified RULE 0
boundary**: fake credentials (`fake-user`, `fake-pass`, fake-db)
NEVER appeared in error output; only hostname
`aws-1-us-east-2.pooler.supabase.com` (public DNS info) appeared.
Full unit tier 552 → 557 (552 baseline + 5 NEW guard tests).

**Forbidden / preserved boundaries enumerated:** no production
Supabase writes during tests; no `apps/**` / `tests/**` (beyond
authorized NEW guard test) / `packages/**` / `scripts/**` /
`schema.prisma` / CI / `package.json` / lockfile / other vitest
configs / `docker-compose` / `.husky` / `mix.exs` / `mix.lock` /
`audit.ts` changes; ADR-0022 + ADR-0033 + ADR-0035 + ADR-0043 +
ADR-0047 Status all preserved at PR.2 register substantively.

**Founder LOCKS preservation:** Q-PR.2-α α-1 + Q-PR.2-β/γ/δ/ε/ζ/η
LOCKED at `[PR-HARDENING-VITEST-CONFIG-PR.2-QLOCK]` per RULE 20;
PR.2 execution authorization at `[PR-HARDENING-VITEST-CONFIG-PR.2-EXECUTE-VERIFY-AUTH]`.

#### PR.3 LANDED — Local refresh + read-only parity verifier (2026-05-18)

**Status:** PR.3 `[PR-LOCAL-DB-AND-PARITY-HARDENING]` LANDED
2026-05-18 at commit `bb261265dba1408dc44130b1efe599638705ac75`
(substantive 2 NEW + 0 MOD) per Founder Q-PR.3-α α-1 + Q-PR.3-β β-4 +
Q-PR.3-γ γ-1 + Q-PR.3-δ δ-1 + Q-PR.3-ε ε-1 + Q-PR.3-ζ 11-check +
Q-PR.3-η stdout + exit codes + Q-PR.3-θ no-package.json + Q-PR.3-ι
no-docs + Q-PR.3-κ 2 NEW + 0 MOD LOCKS at
`[PR-HARDENING-LOCAL-DB-AND-PARITY-PR.3-QLOCK]`.

**ADR-0035 §9 38th observation D-LOCAL-DEV-ENV-CROSS-LANGUAGE-
OWNERSHIP-DRIFT CLOSED at canonical-execution register
substantively** at PR.3 commit `bb26126`. Read-only production parity
verification path added per ADR-0047 Sub-decision 4.

**Substrate sites (2 authorized files; 2 NEW + 0 MOD):**

NEW `scripts/local-test-db-refresh.sh` — canonical local refresh
wrapper. Fail-closed validation at host (`localhost` / `127.0.0.1`)
+ database (`foundation_test`) + port (`5433`) per β-4 LOCK. Drops
ONLY Ecto-owned tables (`schema_migrations` + `idempotency_keys`
per ADR-0033 §Q-5BII-EXEC-5); Prisma-owned shared tables NEVER
touched (RULE 11 boundary). Chains 5 canonical scripts. Supports
`--help` + `--dry-run`.

NEW `scripts/verify-production-parity.ts` — read-only parity
verifier. Requires `PARITY_DATABASE_URL` explicitly (Q-PR-ε α LOCK);
NEVER falls back to `DATABASE_URL`; NEVER loads `.env`. Refuses
localhost unless `ALLOW_LOCAL_PARITY_CHECK=1`. Uses PrismaClient
`datasourceUrl` override (Prisma 6.19.3 canonical pattern). READ-
ONLY `$queryRawUnsafe` SELECT-only queries. ZERO `$executeRaw`;
ZERO Prisma mutation verbs. 11 checks (10 REQUIRED + 1 INFO).
Exit codes 0/1/2 per Q-PR-η LOCK.

**T2.6 runtime probe at PR.3 PRE-STAGE substantively verified RULE 0
boundary**: fake credentials (`fake-user`, `fake-pass`, `fake-db`)
NEVER appeared in error output; only `host=fake-host.example.com
database=fake-db port=5432` (public DNS info + db-name + port)
appeared; ZERO DB connection attempted (`--dry-run`).

**Forbidden / preserved boundaries enumerated:** no `apps/**` /
`tests/**` / `packages/**` / `schema.prisma` / existing DB structural
scripts / CI / `package.json` / lockfile / vitest configs /
`docker-compose` / `.husky` / `mix.exs` / `mix.lock` / `audit.ts` /
docs / CLAUDE.md changes; ADR-0022 + ADR-0033 + ADR-0035 + ADR-0043
+ ADR-0047 Status all preserved at PR.3 register substantively.

**Founder LOCKS preservation:** Q-PR.3-α α-1 + Q-PR.3-β/γ/δ/ε/ζ/η/θ/ι/κ
LOCKED at `[PR-HARDENING-LOCAL-DB-AND-PARITY-PR.3-QLOCK]` per RULE 20;
PR.3 execution authorization at `[PR-HARDENING-LOCAL-DB-AND-PARITY-PR.3-EXECUTE-VERIFY-AUTH]`.

#### PR.4 LANDED — Deployment runbook + closure cascade (2026-05-18)

**Status:** PR.4 `[PR-HARDENING-RUNBOOK-CLOSURE]` LANDED 2026-05-18
at this commit (docs-only closure cascade; 6 MOD + 1 NEW). Per
Founder Q-PR.4-α α-1 + Q-PR.4-β β-1 + Q-PR.4-γ γ-1 + Q-PR.4-δ δ-1 +
Q-PR.4-ε ε-2 + Q-PR.4-ζ ζ-1 + Q-PR.4-η η-1 LOCKS at
`[PR-HARDENING-RUNBOOK-CLOSURE-PR.4-QLOCK]`.

**ADR-0047 Status flipped from `Proposed 2026-05-18` to `Accepted
2026-05-18`** at this commit per Q-PR.4-α α-1 LOCK. **Post-Gap-3
Production-Readiness Hardening Mini-Arc CLOSED at canonical-state
register substantively.**

**Substrate sites (7 authorized files; 6 MOD + 1 NEW):**
NEW `docs/operations/deployment-runbook.md` (13 sections per Q-PR.4-δ
δ-1 LOCK + ADR-0047 §Sub-decision 8 Q-PR-ι Option α LOCK); MOD ADR-0047
(Status flip + PR.2 H2 + PR.3 H2 + PR.4 H2 + Post-Closure Implementation
Lineage H2 with PR.1-PR.4 SHAs); MOD section-12-progress (Hardening row
Status IN FLIGHT → CLOSED + PR.2/PR.3/PR.4 prose); MOD this
CURRENT_BUILD_STATE (H2 visibility update + NEW PR.2/PR.3/PR.4 H4
sections); MOD README + CLAUDE.md ADR-0047 catalog entries (Status
Proposed → Accepted + PR.2/PR.3/PR.4 closure prose); MOD ADR-0035 §9
RULE 14 back-citation footers at 37th + 38th observations per
Q-PR.4-β β-1 LOCK (preserves observation bodies verbatim).

**Per Q-PR.4-γ γ-1 LOCK**: PR.1/PR.2/PR.3 in-arc RULE 13 observations
(D-PR.1-ADR-NUMBERING-FORWARD-SUBSTRATE-RESERVATION-CASCADE-IMPACT
+ D-PR.2-VERIFIER-GATE-20-REGEX-LITERAL-DOT-ESCAPING + D-PR.3-VERIFIER-
GATE-27-NEGATIVE-CONTEXT-DOCUMENTATION-FALSE-POSITIVE) remain
commit-body-only canonical at canonical-state register substantively
(NOT promoted to ADR-0035 §9 cluster at PR.4).

**Sub-arc 2 status field remains IN FLIGHT** per Q-PR-δ + Q-PR-ι +
Q-PR.4-α LOCK. **Gap 4 / ADR-0044 may start after PR.4 lands** per
Q-PR-μ Option α LOCK + Q-PR.4-η η-1 LOCK.

PR.4 closure satisfies pre-launch mandatory gate per Q-PR-λ Option β
LOCK (PR.2 vitest config hardening + PR.3 production parity verifier
+ PR.4 deployment runbook all LANDED).

**Forbidden / preserved boundaries enumerated:** no `apps/**` /
`tests/**` / `packages/**` / `scripts/**` / `schema.prisma` /
existing DB structural scripts / CI / `package.json` / lockfile /
vitest configs / `docker-compose` / `.husky` / `mix.exs` / `mix.lock`
/ `audit.ts` changes; ADR-0022 + ADR-0033 + ADR-0043 untouched;
ADR-0035 substantive body preserved (only RULE 14 back-citation
footers appended at 37th + 38th observations); Gap 4/5/6 reservations
preserved at ADR-0041; no production-affecting actions; no production
parity execution against a real target; no local DB mutation; no
secret exposure.

**Founder LOCKS preservation:** Q-PR.4-α α-1 + Q-PR.4-β/γ/δ/ε/ζ/η
LOCKED at `[PR-HARDENING-RUNBOOK-CLOSURE-PR.4-QLOCK]` per RULE 20;
PR.4 execution authorization at `[PR-HARDENING-RUNBOOK-CLOSURE-PR.4-EXECUTE-VERIFY-AUTH]`.

---

## Phase 3 Sub-Arc 2 -- Capsule Layer Substrate Umbrella IN FLIGHT 2026-05-17; Gap 1 CLOSED 2026-05-17 at G1.6; Gap 3 CLOSED 2026-05-18 at G3.10; G3.2 pgvector infra LANDED 2026-05-17; G3.3 pgvector schema LANDED 2026-05-17; G3.4 embedding provider LANDED 2026-05-17; G3.5 write integration LANDED 2026-05-17; G3.6 retrieval LANDED 2026-05-18; G3.7 conditional backfill SKIPPED 2026-05-18; G3.8 Elixir-boundary contract LANDED 2026-05-18; G3.9 production-contract integration tests LANDED 2026-05-18; G3.10 Gap 3 pgvector Embedding CLOSED 2026-05-18

**Status: IN FLIGHT** at CL.1 `[BEAM-CAPSULE-LAYER-ADR]`.

Current HEAD at CL.1: this commit.
Lineage: `3eaad71` (sub-arc 1 sub-phase d closure register substantively) → this commit.

**CL.1 docs-only umbrella commit canonical at canonical-prose register
substantively LOCKS the ADR-0041 architectural substrate. CL.1 does
NOT close Sub-arc 2. Sub-arc 2 remains IN FLIGHT pending per-gap ADR
mini-arcs and later Sub-arc 2 closure cascade register substantively
per Founder CL.1 scope patch at
`[BEAM-CAPSULE-LAYER-ADR-CL1-SCOPE-PATCH]` register substantively.**

Sub-arc 2 canonicalizes capsule layer substrate umbrella per ADR-0041
(NEW Proposed 2026-05-17). The umbrella ADR locks 4-gap inventory +
per-gap forward-substrate ADRs (ADR-0042 Gap 1 + ADR-0043 Gap 3 +
ADR-0044 Gap 4 + ADR-0045 Gap 5 + optional ADR-0046 AI_AGENT capsule
routing) + cross-cutting decisions (AI_AGENT EntityType-discriminated
routing per Founder Q-J LOCK + weighting per Entry #28 reference +
RULE 0 governance per Founder RULE 0 continuity patch).

**Per-gap mini-arc forward-substrate canonical at canonical-state
register substantively (per-gap mini-arc total commit count NOT
locked at this register substantively):**

- ADR-0042 Gap 1 Mutation Discrimination mini-arc (forward-substrate)
- ADR-0043 Gap 3 pgvector Embedding mini-arc (forward-substrate)
- ADR-0044 Gap 4 Decay Execution Formalization mini-arc
  (forward-substrate)
- ADR-0045 Gap 5 Capsule-Level Staleness Detection mini-arc
  (forward-substrate)
- optional ADR-0046 AI_AGENT EntityType-Discriminated Capsule
  Routing mini-arc (forward-substrate; if ADR-0041 §Sub-decision 1
  + ADR-0042 prose determines separate ADR warranted at canonical-
  coherence register substantively)
- Sub-arc 2 closure cascade register substantively at Sub-arc 2
  closure register substantively

**Runtime substrate at IN FLIGHT register substantively (CL.1 docs-only
preserves D.4 baseline at canonical-coherence register substantively):**

- MemoryCapsule Prisma schema canonical at packages/database/prisma/schema.prisma:95
  (27 fields including capsule_type, decay_type, decay_rate, version,
  content_hash, storage_tier; NOT greenfield)
- COSMP TypeScript services at apps/api/src/services/cosmp/ exist
  (negotiate, read, share, write, jurisdiction-enforcement,
  regulator-enforcement)
- Elixir capsule substrate at apps/cosmp_router/lib/cosmp_router/capsule/
  + capsule.ex + schemas/memory_capsule.ex per ADR-0031 7-layer +
  ADR-0033 cross-language data ownership
- Gap 1 (ADD/UPDATE/MERGE/NOOP mutation discrimination): GREENFIELD
  at MutationType/code register; version + previous_version +
  content_hash anchor substrate exists
- Gap 3 (pgvector embedding): GREENFIELD at code/schema register;
  only TODO comments at apps/api/src/services/otzar/priming.ts:150,158
- Gap 4 (decay execution): PARTIAL; lazy-at-read at
  apps/api/src/services/coe/coe.service.ts:235 + L387 forget-floor
  + L524 Loop 1 hook exist; scheduler/recompute substrate GREENFIELD
- Gap 5 (capsule-level staleness): GREENFIELD at capsule register;
  feedback-loop staleness exists separately at
  apps/api/src/services/feedback/feedback.service.ts:169 (stale_loops
  substrate) and MUST NOT be conflated per Founder Q-I LOCK
- AI_AGENT EntityType-discriminated capsule routing: PARTIAL;
  EntityType enum + AI_AGENT detection at
  apps/api/src/services/cosmp/negotiate.service.ts:143; capsule-
  routing branch greenfield
- Weighting per Entry #28: document-register only; combined_score
  canonical at ADR-0022 (0.45/0.35/0.20 coefficients)

**Founder Q-locks LOCKED at `[BEAM-CAPSULE-LAYER-QLOCK]` +
`[BEAM-CAPSULE-LAYER-ADR-RULE0-PATCH]` +
`[BEAM-CAPSULE-LAYER-ADR-CL1-SCOPE-PATCH]` register substantively:**

- Q-A: Option B umbrella + per-gap ADR strategy
- Q-B: ADR-0041 docs-only umbrella
- Q-C: per-gap ADR sequence (ADR-0042 Gap 1 + ADR-0043 Gap 3 +
  ADR-0044 Gap 4 + ADR-0045 Gap 5 + optional ADR-0046)
- Q-D: CL.0 substrate-state inventory (4-gap status locks)
- Q-E: HNSW + cosine recommended default for pgvector
- Q-F: text-embedding-3-small at 1536 dimensions recommended default
- Q-G: ADD/UPDATE/MERGE/NOOP NIOV-domain MutationType semantics
- Q-H: lazy-at-read decay execution recommended default
- Q-I: capsule-level staleness distinct from feedback-loop staleness
- Q-J: EntityType-discriminated capsule routing (AI_AGENT remains
  EntityType not WalletType; maps to PERSONAL wallet_type for storage)
- Q-K: CL.1 docs-only umbrella commit
- Q-L: `[BEAM-CAPSULE-LAYER-ADR]` tag
- RULE 0 continuity patch: verified at every preflight at canonical-
  rule register substantively for forward-substrate authorization
  pastes
- CL.1 scope patch: CL.1 LOCKS umbrella only; Sub-arc 2 remains
  IN FLIGHT; per-gap implementation forward-substrate; final
  closure requires later closure cascade

References canonical at canonical-coherence register substantively:
ADR-0041 (Capsule Layer Substrate Umbrella; Proposed at this commit
per §Status); ADR-0033 (cross-language data ownership; EntityType vs
WalletType canonical at canonical-knowledge register substantively);
ADR-0022 combined_score formula (anchor for weighting per Entry #28
forward-substrate); ADR-0034 (BEAM testability discipline); ADR-0025
(Schema-Push-Target Discipline; Prisma migration discipline);
ADR-0035 26th + 27th + 28th observations canonical at substrate-
architectural register substantively; ADR-0040 DEVICE Cold-Shard
Substrate (sub-arc 1 sub-phase d closure register substantively);
RULE 0 (Humans Always Sovereign canonical at canonical-rule register
substantively per CLAUDE.md L134); RULE 11 (Elixir/BEAM iteration-
loop research); RULE 13 (substrate-honest pre-flight surface); RULE
20 (founder authorization); RULE 21 (pre-authorization research arc
canonical per `67f6112` commit).

### Gap 1 — Capsule Mutation Discrimination (IN FLIGHT; G1.1 LANDED docs-only architectural lock 2026-05-17)

Status: G1.1 LANDED 2026-05-17 at `[BEAM-CAPSULE-MUTATION-DISCRIMINATION-ADR]` register substantively per ADR-0042 Proposed. G1.1 LOCKS architecture only at canonical-prose register substantively. G1.1 does NOT close Gap 1 at canonical-state register substantively. G1.1 does NOT close Sub-arc 2 at canonical-state register substantively.

Implementation lineage canonical at patent-implementation evidence register substantively per ADR-0020 two-register IP discipline canonical: G1.1 (this commit) docs-only ADR-0042 + Sub-arc 2 row update + Gap 1 H3 NEW + ADR-0042 catalog entries; G1.2 forward-substrate `[CAPSULE-MUTATION-PRISMA-MIGRATION]` substantive Prisma migration adding MutationType enum (ADD/UPDATE/MERGE/NOOP) + mutation_type MutationType? nullable column on MemoryCapsule + 4 NEW CAPSULE_MUTATION_* literals extending AUDIT_EVENT_TYPE_VALUES at packages/database/src/queries/audit.ts:104 + AuditEventType union extension at audit.ts:24 + isKnownAuditEventType extension at audit.ts:147; G1.3 forward-substrate `[CAPSULE-MUTATION-WRITE-SERVICE]` substantive discriminateMutation helper at write.service.ts adjacent to processContentForStorage at L200 + integration into createCapsule at L257 + updateCapsule at L420 + optional expected_version input + CAPSULE_VERSION_CONFLICT typed error + transition audit emission from CAPSULE_CREATED/CAPSULE_UPDATED to discriminated CAPSULE_MUTATION_* per Disposition Q-γ.1 LOCKED + widen writeAuditEventForCapsule helper at L765 + TS-canonical canonical_record port; conditional G1.4 forward-substrate `[CAPSULE-MUTATION-ELIXIR-AUDIT]` substantive Elixir audit/canonical/idempotency support if G1.4 pre-flight grep proves substantive Elixir change needed at canonical_record/1 field-projection register substantively, default disposition SKIP per Q-ι; G1.5 forward-substrate `[CAPSULE-MUTATION-TESTS]` substantive TS unit/integration tests + cross-language canonical_record byte-equivalence fixture extension + audit/idempotency tests; G1.6 forward-substrate `[BEAM-CAPSULE-MUTATION-DISCRIMINATION-CLOSURE]` docs-only closure cascade.

13 Sub-decisions canonical at ADR-0042 register substantively per Founder Q-α through Q-ν LOCKS at `[BEAM-CAPSULE-MUTATION-QLOCK]` + Q-γ.1 LOCKED at `[BEAM-CAPSULE-MUTATION-G1.1-QGAMMA-FINAL-AUTH]`: Q-α MutationType enum location → Prisma-owned (TypeScript canonical register); Q-β MutationType field → nullable mutation_type MutationType? on MemoryCapsule; Q-γ Audit event literal disposition → 4 NEW append-only CAPSULE_MUTATION_* literals with Disposition Q-γ.1 clean-transition LOCKED; Q-δ NOOP audit emission → audit-only with zero MemoryCapsule write and zero version increment; Q-ε Primary discriminator → split-discriminator content_hash + canonical_record + version/expected_version; Q-ζ TS-side canonical record → TS-canonical port matching Elixir audit.ex:146 byte-for-byte; Q-η Optimistic concurrency → optional expected_version + CAPSULE_VERSION_CONFLICT envelope per RFC 7232 If-Match canonical; Q-θ Mutation discrimination location → write.service.ts boundary at discriminateMutation helper preserving processContentForStorage exact substrate name per RULE 13; Q-ι Elixir role → support/verification only with conditional G1.4 substantive change if grep-proven; Q-κ AI_AGENT disposition → deferred to optional ADR-0046 per ADR-0041 §Sub-decision 6 carryover; Q-λ RULE 0 governance → explicit at every mutation-discrimination decision; Q-μ G1 mini-arc decomposition → 6 commits with conditional G1.4; Q-ν Tag prefix → mixed BEAM/CAPSULE.

Substrate-state ground truth at G1.1 register substantively per RULE 13 grep-grounded surface: existing AUDIT_EVENT_TYPE_VALUES at packages/database/src/queries/audit.ts:104 contains 36 literals substantively; capsule-class subset is exactly 5 literals (CAPSULE_CREATED, CAPSULE_METADATA_READ, CAPSULE_CONTENT_READ, CAPSULE_UPDATED, CAPSULE_DELETED); no generic write-class literal predates the discriminated set in the substrate; current write.service.ts emits "CAPSULE_CREATED" at L379-380 (createCapsule) and "CAPSULE_UPDATED" at L672-673 (updateCapsule) with writeAuditEventForCapsule helper at L765 typed eventType: "CAPSULE_CREATED" | "CAPSULE_UPDATED"; Elixir operations.ex emits distinct COSMP-tier event_types (COSMP_AUTHENTICATE/NEGOTIATE/READ/AUDIT) at operations.ex:84/109/134/268 with no current CAPSULE_MUTATION_* literal substantively.

Founder patches preserved verbatim across G1.1 + G1.0 research-arc + Path B compaction-loss recovery patch + RULE 0 continuity patch + placeholder patch + Step 3 patch + mini-arc-drift patch + Q-γ.1 final-authorization patch: Q-α through Q-ν all locked at α-default per `[BEAM-CAPSULE-MUTATION-QLOCK]` substantively; Q-γ.1 clean-transition LOCKED per `[BEAM-CAPSULE-MUTATION-G1.1-QGAMMA-FINAL-AUTH]`; RULE 0 explicit at preflight + ADR §Context + Sub-decisions Q-λ/Q-δ/Q-η + §References substantively; processContentForStorage exact substrate name preserved per RULE 13 ground-truth surface; Step 3 locked to single Disposition (a) updating existing Sub-arc 2 row only; no bracketed placeholders; G1 mini-arc decomposition restored to Founder-locked form (G1.4 conditional Elixir; G1.5 dedicated tests; G1.6 closure with full prefix); audit-literal claims grep-grounded with all references to non-existent literals removed entirely.

Per-G forward-substrate canonical at canonical-state register substantively: G1.2 substantive Prisma migration + audit-literal generation (forward-substrate); G1.3 substantive write.service.ts discrimination + audit-emission transition + TS canonical_record port (forward-substrate); conditional G1.4 substantive Elixir support if grep-proven (forward-substrate; default SKIP per Q-ι); G1.5 dedicated tests substantive (forward-substrate); G1.6 docs-only closure cascade (forward-substrate; closes Gap 1 at canonical-state register substantively); Sub-arc 2 closure cascade (forward-substrate; awaits all per-gap mini-arcs G1 + G3 + G4 + G5 + optional G6 per ADR-0041 CL.1 scope patch).

References: ADR-0042 (NEW) + ADR-0041 (parent umbrella) + ADR-0033 (cross-language data ownership + canonical_record byte-equivalence) + ADR-0026 §5 (6 BEAM-compatibility patterns preserved by construction) + ADR-0020 (patent-implementation evidence) + ADR-0002 (append-only audit chain + BEFORE DELETE trigger) + RULE 0 + RULE 4 + RULE 10 + RULE 13 + RULE 20 + RULE 21 + Patent US 12,517,919 + US 12,164,537 + US 12,399,904 + RFC 7232 §3.1 + Bernstein-Hadzilacos-Goodman §4.2 + Greg Young CQRS + Eric Evans DDD Domain Events.

#### G1.6 Closure Cascade — Gap 1 IN FLIGHT → CLOSED 2026-05-17

**Status transition:** Gap 1 Capsule Mutation Discrimination CLOSED at G1.6 `[BEAM-CAPSULE-MUTATION-DISCRIMINATION-CLOSURE]` register substantively. Status lineage: IN FLIGHT (G1.1 2026-05-17) → CLOSED (G1.6 2026-05-17) at canonical-state register substantively.

**G1 mini-arc landing lineage canonical at canonical-execution register substantively:**

- **G1.1** `[BEAM-CAPSULE-MUTATION-DISCRIMINATION-ADR]` `2cb0028` — docs-only architectural lock; ADR-0042 NEW Proposed.
- **G1.2** `[CAPSULE-MUTATION-PRISMA-MIGRATION]` `dfcbbb1` — substantive Prisma migration (MutationType enum + nullable mutation_type column + 4 NEW CAPSULE_MUTATION_* audit literals).
- **G1.3** `[CAPSULE-MUTATION-WRITE-SERVICE]` `16c562c` — substantive write.service.ts discrimination + expected_version OCC + CAPSULE_VERSION_CONFLICT envelope.
- **G1.3-fix** `[CAPSULE-MUTATION-WRITE-SERVICE-G1.3-INTEGRATION-FIX]` `8f047de` — minimal integration-tier test waiver extension.
- **G1.4** `[CAPSULE-MUTATION-ELIXIR-AUDIT]` `3505fde` — docs-only formal SKIP record.
- **G1.5** `[CAPSULE-MUTATION-TESTS]` `16567eb` — substantive test substrate.
- **G1.6** `[BEAM-CAPSULE-MUTATION-DISCRIMINATION-CLOSURE]` this commit — docs-only closure cascade.

**Forward-substrate to downstream consumers (post-Gap-1-closure):** MutationType
discriminator is now available to ADR-0022 combined_score formula, ADR-0044
lazy-at-read decay execution (forward-substrate), and ADR-0045 capsule-level
staleness detection (forward-substrate) per substrate-coherent register
substantively.

**Sub-arc 2 status at Gap 1 closure register substantively:** Gap 1 CLOSED substantively. Sub-arc 2 remains IN FLIGHT pending Gap 3 (ADR-0043 pgvector Embedding) + Gap 4 (ADR-0044 Decay Execution Formalization) + Gap 5 (ADR-0045 Capsule-Level Staleness Detection) + optional Gap 6 (ADR-0046 AI_AGENT EntityType-Discriminated Capsule Routing) per ADR-0041 CL.1 scope patch register substantively.

**ADR-0041 amendment at G1.6: NONE** per Q-G1.6-β LOCK. Gap 1 closure progress documented at this H4 + ADR-0042 §G1.6 H2 + section-12-progress Sub-arc 2 row inline update + architecture/README + CLAUDE.md ADR-0042 catalog refresh substantively.

**Substrate-build observation cluster expansion:** D-TEST-TIER-WAIVER-SCOPE-PRECISION promoted to ADR-0035 §9 cluster as 36th canonical observation at G1.6 register substantively per Q-G1.6-α LOCK. Recurrence-1: G1.3 Q-G1.3-ξ Option β minimal waiver scoped to unit tier only; integration-tier stale literals at jurisdiction-cosmp-enforcement.test.ts required follow-up commit `8f047de`.

### Gap 3 — pgvector Embedding (IN FLIGHT; G3.1 LANDED docs-only architectural lock 2026-05-17)

Status: G3.1 LANDED 2026-05-17 at `[BEAM-CAPSULE-EMBEDDING-ADR]` register substantively per ADR-0043 Proposed 2026-05-17. G3.1 LOCKS architecture only at canonical-prose register substantively. G3.1 does NOT close Gap 3 at canonical-state register substantively. G3.1 does NOT change schema, code, tests, CI, or Elixir.

Implementation lineage canonical at patent-implementation evidence register substantively per ADR-0020 two-register IP discipline: G3.1 (this commit) docs-only ADR-0043 NEW + Sub-arc 2 row inline update + this Gap 3 H3 NEW + ADR-0043 catalog entries at architecture/README + CLAUDE.md; G3.2 forward-substrate `[CAPSULE-EMBEDDING-INFRA]` pgvector-enabled Postgres image switch + ADR-0013/0015/0016 amendments; G3.3 forward-substrate `[CAPSULE-EMBEDDING-SCHEMA]` Prisma `embedding Unsupported("vector(1536)")?` field + `scripts/apply-pgvector-extension.ts` + `scripts/apply-hnsw-index.ts`; G3.4 forward-substrate `[CAPSULE-EMBEDDING-PROVIDER]` NEW `apps/api/src/services/embedding/embedding.service.ts` with OpenAIEmbeddingProvider + FixtureBasedEmbeddingProvider per ADR-0014 pattern; G3.5 forward-substrate `[CAPSULE-EMBEDDING-WRITE-INTEGRATION]` write.service.ts integration via Q-G3-ι regeneration matrix; G3.6 forward-substrate `[CAPSULE-EMBEDDING-RETRIEVAL]` searchBySimilarity + wallet-scoped + permission-scoped retrieval + CAPSULE_SIMILARITY_SEARCH audit literal + COE integration disposition per Q-G3-δ; G3.7 conditional forward-substrate `[CAPSULE-EMBEDDING-BACKFILL]` lazy-on-first-read default; G3.8 conditional forward-substrate `[CAPSULE-EMBEDDING-ELIXIR]` default skip per Q-G3-θ β-A LOCK; G3.9 forward-substrate `[CAPSULE-EMBEDDING-TESTS]` unit + integration + RULE 0 access boundary; G3.10 forward-substrate `[BEAM-CAPSULE-EMBEDDING-CLOSURE]` docs-only closure cascade.

11 Q-G3 sub-decisions / locks canonical at ADR-0043 register substantively per Founder Q-G3-α through Q-G3-κ LOCKS at `[CAPSULE-EMBEDDING-ADR-0043-QLOCK-DISPOSITION]`: Q-G3-α pgvector-enabled Postgres image LOCKED for local/test/CI (specific image pin deferred to G3.2); Q-G3-β Prisma-owned MemoryCapsule DDL per ADR-0033 with raw-SQL post-push scripts deferred to G3.3 (per RS-2 Prisma vector-type generated-client incomplete; raw `$queryRaw` required at runtime); Q-G3-γ text-embedding-3-small at 1536 dimensions production default LOCKED (Matryoshka truncation forward-substrate only); Q-G3-δ NO ADR-0022 amendment at G3.1 (combined_score formula preserved; four integration paths enumerated for G3.6); Q-G3-ε hybrid write-first / lazy-backfill strategy LOCKED; Q-G3-ζ embeddings as PII per RULE 0 with wallet_id + permission + clearance + ai_access_blocked + requires_validation gates mandatory; Q-G3-η NEW append-only CAPSULE_SIMILARITY_SEARCH audit literal proposed (docs-only at G3.1; substantive at G3.6); Q-G3-θ β-A skip Ecto vector field LOCKED (no pgvector_ex hex dep; no Ecto vector field); Q-G3-ι mutation_type discriminator drives embedding regeneration (ADD generate / UPDATE+MERGE regenerate / NOOP preserve); Q-G3 deployment-agnosticism per ADR-0018 (Supabase + AWS RDS + self-hosted parity); Q-G3-κ 10-commit G3 mini-arc decomposition with G3.7 + G3.8 conditional.

Substrate-state ground truth at G3.1 register substantively per RULE 13 grep-grounded surface: current Postgres image is vanilla `postgres:16.4-alpine` at `docker-compose.test.yml` + `.github/workflows/ci.yml` (3 service blocks) + `.github/workflows/nightly-real-llm.yml` (NO pgvector); no embedding code substrate (grep -rniE "pgvector|vector\(|text-embedding" against `*.ts`/`*.prisma`/`*.ex`/`*.exs`/`*.sql` returns empty); no Prisma vector field at `packages/database/prisma/schema.prisma:95-187`; ADR-0041 Q-E (HNSW + cosine) + Q-F (text-embedding-3-small at 1536) LOCKS preserved at L129/L130/L143/L144/L366; ADR-0022 combined_score formula at `apps/api/src/services/coe/keywords.ts:87-93` preserved verbatim (NO amendment at G3.1); β-A skip Ecto vector field per Q-G3-θ.

Founder LOCKS preservation: 11 Q-G3 sub-decisions / locks Q-G3-α through Q-G3-κ all LOCKED at `[CAPSULE-EMBEDDING-ADR-0043-QLOCK-DISPOSITION]` register substantively per RULE 20; G3.1 execution authorization at `[BEAM-CAPSULE-EMBEDDING-ADR-G3.1-EXECUTE-VERIFY-AUTH]` register substantively.

Forward-substrate canonical at canonical-state register substantively: G3.2 pgvector image switch + ADR-0013 / ADR-0015 / ADR-0016 amendments (forward-substrate); G3.3 Prisma schema + extension/index scripts (forward-substrate); G3.4 embedding provider (forward-substrate); G3.5 write-integration via mutation_type (forward-substrate); G3.6 retrieval + COE integration disposition (forward-substrate; ADR-0022 amendment authorization required if path a or b selected); G3.7 conditional backfill (forward-substrate; lazy-on-first-read default); G3.8 conditional Elixir (forward-substrate; default skip per β-A); G3.9 tests (forward-substrate); G3.10 docs-only closure cascade (forward-substrate; closes Gap 3 at canonical-state register substantively); Sub-arc 2 closure cascade (forward-substrate; awaits Gap 4 + Gap 5 + optional Gap 6 + later Sub-arc 2 closure cascade per ADR-0041 CL.1 scope patch).

References: ADR-0043 (NEW) + ADR-0041 §Sub-decision 3 (parent umbrella; Q-E + Q-F LOCKS load-bearing) + ADR-0042 (Gap 1 mutation_type substrate; Q-G3-ι integration load-bearing) + ADR-0022 (combined_score formula; explicit NO amendment at G3.1) + ADR-0025 (schema-push-target discipline) + ADR-0033 §Decision 7 (cross-language data-ownership boundary) + ADR-0026 §5 (6 BEAM-compatibility patterns) + ADR-0020 (patent-implementation evidence) + ADR-0018 (deployment-target agnosticism) + ADR-0013 + ADR-0015 + ADR-0016 (forward amendments at G3.2) + RULE 0 + RULE 4 + RULE 10 + RULE 13 + RULE 20 + RULE 21 + Patent US 12,517,919 + US 12,164,537 + US 12,399,904; RS-1 through RS-7 current public sources cited verbatim at ADR-0043 §Context register substantively.

#### G3.2 LANDED — pgvector image pin (2026-05-17)

**Status:** G3.2 `[CAPSULE-EMBEDDING-INFRA]` LANDED 2026-05-17 (single docs + infra commit) per ADR-0043 §Sub-decision 1 (Q-G3-α LOCK) + Q-G3.2-α LOCK at `[CAPSULE-EMBEDDING-INFRA-G3.2-QLOCK]`. pgvector-enabled Postgres image pin `pgvector/pgvector:0.8.2-pg16-trixie` LANDED at local/test/CI. G3.2 does NOT close Gap 3 at canonical-state register substantively. G3.2 does NOT change schema, code, tests, Elixir, or scripts.

**Substrate sites:** 5 substantive image substitutions across 3 infra files (`docker-compose.test.yml` L7 + `.github/workflows/ci.yml` 3 service blocks at Unit / Integration / Elixir tiers + `.github/workflows/nightly-real-llm.yml` L41) + 4 prose/comment refresh sites at `.github/workflows/ci.yml` per Q-G3.2-β LOCK (header comment + 2 `docker ps --filter ancestor=` failure-diagnostic lines + Elixir tier comment). Post-G3.2 invariant: zero `postgres:16.4-alpine` references remain in `docker-compose.test.yml` + `.github/workflows/`.

**ADR amendments at G3.2:** ADR-0013 §Amendment G3.2 Image Pin (NEW H2; in-place amendment per Q-G3.2-γ; Status preserved) + ADR-0015 §Decision E amendment at G3.2 (NEW H3 per ADR-0011 §Amendment convention per Q-G3.2-δ; Decision E body preserved) + ADR-0016 §Worked example — pgvector/pgvector:0.8.2-pg16-trixie image pin (G3.2) (NEW H3 worked-example subsection per Q-G3.2-ε) + ADR-0043 §G3.2 Progress — Image Pin LANDED (NEW H2; ADR-0043 Status preserved as Proposed 2026-05-17).

**ADR-0022 NOT amended at G3.2** — Q-G3-δ LOCK preserved; `combined_score` formula at `apps/api/src/services/coe/keywords.ts:87-93` untouched.

**Forward-substrate unchanged from G3.1 §G3.3-G3.10 enumeration:** G3.3 substantive Prisma `embedding Unsupported("vector(1536)")?` field + `scripts/apply-pgvector-extension.ts` + `scripts/apply-hnsw-index.ts` + `scripts/test-db-up.sh` post-push integration; G3.4 embedding provider; G3.5 write-integration via mutation_type; G3.6 retrieval + COE integration disposition; G3.7 conditional backfill; G3.8 conditional Elixir; G3.9 tests; G3.10 docs-only closure cascade.

**Founder LOCKS preservation:** 8 Q-G3.2 sub-decisions / locks Q-G3.2-α through Q-G3.2-θ all LOCKED at `[CAPSULE-EMBEDDING-INFRA-G3.2-QLOCK]` register substantively per RULE 20; G3.2 execution authorization at `[CAPSULE-EMBEDDING-INFRA-G3.2-EXECUTE-VERIFY-AUTH]`. CI label staleness (Unit tier `(371 tests)` / Integration tier `(111 tests + 1 skipped)`) KEPT DEFERRED per Q-G3.2-ζ; preserved forward-substrate from G1.6.

#### G3.3 LANDED — Prisma schema + extension + HNSW index (2026-05-17)

**Status:** G3.3 `[CAPSULE-EMBEDDING-SCHEMA]` LANDED 2026-05-17 (single docs + schema + scripts + CI/nightly orchestration commit) per ADR-0043 §Sub-decision 2 (Q-G3-β LOCK) + 12 Q-G3.3-α through Q-G3.3-λ LOCKS at `[CAPSULE-EMBEDDING-SCHEMA-G3.3-QLOCK]`. Prisma `embedding Unsupported("vector(1536)")?` field + `previewFeatures = ["postgresqlExtensions"]` + `extensions = [vector]` LANDED. ADR-0043 Status preserved as `Proposed 2026-05-17`. G3.3 does NOT close Gap 3.

**Substrate sites (11 authorized files):** 1 Prisma schema MOD (`packages/database/prisma/schema.prisma`) + 2 NEW scripts (`scripts/apply-pgvector-extension.ts` + `scripts/apply-hnsw-index.ts`) + 1 test-db-up retrofit (`scripts/test-db-up.sh` 5-step) + 2 CI workflow files (`.github/workflows/ci.yml` 3 service-bearing jobs + `.github/workflows/nightly-real-llm.yml`) + 4 docs/state files (ADR-0043 + section-12-progress + this CURRENT_BUILD_STATE + README) + 1 CLAUDE.md mirror = 11.

**HNSW index canonical:** `memory_capsules_embedding_hnsw_idx` USING hnsw (embedding vector_cosine_ops) WHERE embedding IS NOT NULL AND deleted_at IS NULL — partial per Q-G3.3-β LOCK; defaults `m = 16`, `ef_construction = 64` per Q-G3.3-ε LOCK + RS-4 pgvector canonical defaults (no explicit WITH clause).

**5-step bring-up per Q-G3.3-θ LOCK:** docker compose up → apply-pgvector-extension.ts → prisma-db-push-test.sh → apply-audit-triggers.ts → apply-hnsw-index.ts. Extension MUST run before db push (vector type registration); HNSW MUST run after db push (column existence). CI/nightly orchestration mirrors the same ordering per Q-G3.3-η LOCK.

**ADR-0022 NOT amended at G3.3** — Q-G3-δ LOCK preserved; combined_score formula at `apps/api/src/services/coe/keywords.ts:87-93` untouched. ADR-0011/0013/0015/0016/0025/0033/0034/0035/0041/0042 NOT amended either. ADR-0043 Status preserved at `Proposed 2026-05-17`.

**Substrate-state observation surfaced docs-only per Q-G3.3-λ LOCK:** **D-G3.3-LOCAL-CONTAINER-DRIFT** — during G3.3.0 preflight (post-G3.2), the running local test DB container was stale on `postgres:16.4-alpine` (started ~7 hours pre-G3.2). CI uses fresh containers per job and was unaffected (G3.2 CI 4/4 green verified). G3.3 verification refreshed the local container per Q-G3.3-ι (β): `docker compose down` + `up -d postgres` re-pulled the pgvector image. ADR-0035 cluster expansion deferred to G3.10 closure cascade for potential promotion if recurrence is proven.

**Forward-substrate unchanged from G3.1 + G3.2 enumeration:** G3.4 embedding provider + G3.5 write-integration via mutation_type + G3.6 retrieval + COE integration disposition per Q-G3-δ + G3.7 conditional backfill + G3.8 conditional Elixir per Q-G3-θ + G3.9 tests + G3.10 docs-only closure cascade.

**Founder LOCKS preservation:** 12 Q-G3.3 sub-decisions / locks Q-G3.3-α through Q-G3.3-λ all LOCKED at `[CAPSULE-EMBEDDING-SCHEMA-G3.3-QLOCK]` register substantively per RULE 20; G3.3 execution authorization at `[CAPSULE-EMBEDDING-SCHEMA-G3.3-EXECUTE-VERIFY-AUTH]`. CI label staleness KEPT DEFERRED per Q-G3.2-ζ (preserved forward-substrate from G1.6 + G3.2). D-G3.3-LOCAL-CONTAINER-DRIFT surfaced docs-only; ADR-0035 promotion deferred to G3.10 per Q-G3.3-λ.

#### G3.4 LANDED — Embedding provider substrate (2026-05-17)

**Status:** G3.4 `[CAPSULE-EMBEDDING-PROVIDER]` LANDED 2026-05-17 (single commit covering provider + tests + ADR/state/catalog updates) per ADR-0043 §Sub-decision 3 (Q-G3-γ LOCK; text-embedding-3-small @ 1536 dims) + 12 Q-G3.4 sub-decisions / locks Q-G3.4-α through Q-G3.4-λ at `[CAPSULE-EMBEDDING-PROVIDER-G3.4-QLOCK]`. ADR-0043 Status preserved as `Proposed 2026-05-17`. G3.4 does NOT close Gap 3.

**Substrate sites (8 authorized files):** 1 NEW provider single-file (`apps/api/src/services/embedding/embedding.service.ts`) + 1 barrel re-export MOD (`apps/api/src/index.ts`) + 1 NEW unit test (`tests/unit/embedding.test.ts`) + 4 docs/state files (ADR-0043 + section-12-progress + this CURRENT_BUILD_STATE + README) + 1 CLAUDE.md mirror = 8.

**Provider shape:** EmbeddingProvider interface (single-text per call per Q-G3.4-ε; opts.fixtureKey for ADR-0014-style test dispatch) + EmbeddingResult discriminated union (5 error_class values per Q-G3.4-κ: AUTH / RATE_LIMIT / PROVIDER_ERROR / DIMENSION_MISMATCH / VALIDATION; vector type number[] per Q-G3.4-δ) + OpenAIEmbeddingProvider (reuses OPENAI_API_KEY per Q-G3.4-θ; hardcoded text-embedding-3-small @ 1536 dims per Q-G3-γ + Q-G3.3-γ lockstep) + FixtureBasedEmbeddingProvider (strict-fixtureKey per ADR-0014 precedent; uses computeFixtureVector) + getEmbeddingProvider() factory (returns OpenAI default per Q-G3.4-β; no PREFERRED_EMBEDDING env switching) + computeFixtureVector helper (deterministic SHA-256 iterated 1536-dim number[] in [-1, 1]; no file-based fixtures required per Q-G3.4-γ).

**Privacy invariant per Q-G3-ζ LOCK + RULE 0:** vectors are server-side substrate only; never returned at the HTTP/gRPC API response boundary; never logged (model / dimensions / tokens_used metadata is permissible; vector content is NOT); never sent to AI_AGENT entities denied content access (future G3.5/G3.6 enforce per-capsule wallet_id + ai_access_blocked + requires_validation gates per Q-G3-ζ).

**Test discipline per Q-G3.4-η:** 10 unit tests at `tests/unit/embedding.test.ts` covering computeFixtureVector determinism/uniqueness/dimension/range, FixtureBasedEmbeddingProvider strict-fixtureKey/validation/canonical-success-shape, OpenAIEmbeddingProvider constructor missing-key fail-fast + explicit-apiKey instantiation, getEmbeddingProvider factory shape, discriminated-union narrowing, no-network independence proof. No real OpenAI calls in any test.

**Scope boundaries preserved:** No CircuitBreaker wrapper per Q-G3.4-ζ (provider not yet integrated into write path). No batch interface per Q-G3.4-ε (forward-substrate to G3.7 if bulk backfill authorized). No new dependency (openai SDK already at `package.json` L42). No write/retrieval integration (G3.5/G3.6 forward-substrate). No `CAPSULE_SIMILARITY_SEARCH` audit literal (G3.6 forward-substrate). No ADR-0022 amendment (Q-G3-δ preserved). No schema/DB-scripts/CI/Elixir/docker-compose changes.

**Forward-substrate unchanged from G3.1+G3.2+G3.3 enumeration:** G3.5 write-integration via Q-G3-ι mutation_type matrix + G3.6 retrieval + COE integration disposition per Q-G3-δ + G3.7 conditional backfill + G3.8 conditional Elixir + G3.9 integration tests + G3.10 docs-only closure cascade.

**Founder LOCKS preservation:** 12 Q-G3.4 sub-decisions / locks Q-G3.4-α through Q-G3.4-λ all LOCKED at `[CAPSULE-EMBEDDING-PROVIDER-G3.4-QLOCK]` register substantively per RULE 20; G3.4 execution authorization at `[CAPSULE-EMBEDDING-PROVIDER-G3.4-EXECUTE-VERIFY-AUTH]`.

#### G3.5 LANDED — Write integration via mutation_type matrix (2026-05-17)

**Status:** G3.5 `[CAPSULE-EMBEDDING-WRITE-INTEGRATION]` LANDED 2026-05-17 (single commit covering write integration + 9 new unit tests + 1 new integration test + ADR/state/catalog updates) per ADR-0043 §Sub-decision 9 (Q-G3-ι mutation_type matrix) + 12 Q-G3.5 sub-decisions / locks Q-G3.5-α through Q-G3.5-λ at `[CAPSULE-EMBEDDING-WRITE-G3.5-QLOCK]`. ADR-0043 Status preserved as `Proposed 2026-05-17`. G3.5 does NOT close Gap 3.

**Substrate sites (10 authorized files):** 1 NEW integration test (`tests/integration/embedding-write.test.ts`) + 9 MOD: `apps/api/src/services/cosmp/write.service.ts` (6th constructor arg + EmbeddingProvider import + createCapsule provider call + raw-SQL persist inside tx + audit metadata; updateCapsule UPDATE branch provider call + raw-SQL persist inside tx; MERGE branch skip-reason audit metadata) + `apps/api/src/server.ts` (passes `getEmbeddingProvider()` 6th arg) + `tests/unit/cosmp/write.test.ts` (makeServices override + 9 NEW E1-E9 tests; E7 + E8 stable verbatim names for Gate 24 isolation) + `tests/unit/feedback.test.ts` (makeServices 6th arg) + ADR-0043 + section-12-progress + this CURRENT_BUILD_STATE + README + CLAUDE.md = 10.

**Mutation matrix per Q-G3-ι + Q-G3.5-α/β LOCKS:** ADD (createCapsule) and UPDATE (updateCapsule UPDATE branch) call `embeddingProvider.generateEmbedding({ text: input.content }, { fixtureKey: capsuleId })` and persist via inline raw SQL when `ok: true`; MERGE skips the provider entirely (content_hash unchanged per Q-G3.5-β); NOOP skips the provider entirely (zero side effects per Q-G1.3-ζ). Provider failure → degrade gracefully per Q-G3.5-α: capsule write succeeds; embedding column preserves prior value (UPDATE) or stays NULL (ADD).

**Inline raw SQL per Q-G3.5-γ LOCK:** `tx.$executeRawUnsafe('UPDATE memory_capsules SET embedding = $1::vector(1536) WHERE capsule_id = $2::uuid', vectorLiteral, capsuleId)` at 2 sites (createCapsule + updateCapsule UPDATE branch). `vectorLiteral = '[' + vector.join(',') + ']'` is the canonical pgvector text input form. No helper in `packages/database/src/queries/capsule.ts` per Q-G3.5-γ; raw SQL co-located with the call site. Prisma generated client cannot project `Unsupported("vector(1536)")` per ADR-0043 §G3.3 + RS-2 Prisma Issue #27857.

**Audit metadata per Q-G3.5-η LOCK:** success path = `embedding_generated: true, embedding_model, embedding_dimensions, embedding_tokens_used`. Degrade path = `embedding_generated: false, embedding_failure_class, embedding_failure_message`. MERGE skip path = `embedding_generated: false, embedding_skip_reason: "merge_metadata_only_content_unchanged"`. NEVER vector content / `vector_hash` / `embedding_sample` / per-dimension stats per Q-G3-ζ + RULE 0 inversion-attack disposition (RS-5 Vec2Text + ALGEN + Zero2Text literature).

**Privacy invariant per Q-G3-ζ + Q-G3.5-η + RULE 0:** vectors are server-side substrate only; the WriteSuccess response shape never contains a vector / embedding field (Tier 1 Gate 25 + I2 integration test verify); audit details never contain vector content (Tier 1 Gate 25 verifies); the structured logger in write.service.ts has no `vector`-mentioning log line (Tier 1 Gate 8 verifies).

**Test substrate per Q-G3.5-ε + Q-G3.5-ζ + Q-G3.5-λ LOCKS:** `tests/unit/cosmp/write.test.ts` adds 9 NEW G3.5 tests E1-E9 covering provider call counts (E1/E4/E5/E6), audit metadata success shape (E2), no-vector-leak in audit (E3), degrade-policy behavior (E7 createCapsule degrade + E8 updateCapsule UPDATE degrade), and response-shape privacy (E9). E7 + E8 use the verbatim stable test names required by Gate 24 Part B for block isolation. The existing 26 G1.5 tests run unchanged via `FixtureBasedEmbeddingProvider` default in `makeServices()` per Q-G3.5-λ. `tests/unit/feedback.test.ts` `makeServices()` 6th-arg update is the only ripple per Q-G3.5-ε minimal-helper-update policy. NEW `tests/integration/embedding-write.test.ts` verifies DB persistence via raw SQL queryRaw round-trip (I1) + API-boundary no-vector (I2) + MERGE preservation byte-equal on `embedding::text` cast (I3). No real OpenAI calls in any test tier.

**Scope boundaries preserved at G3.5:** ADR-0022 NOT amended (Q-G3-δ preserved); AUDIT_EVENT_TYPE_VALUES + `CAPSULE_SIMILARITY_SEARCH` NOT touched (Q-G3.5-ι deferred to G3.6); `read.service.ts` / `coe.service.ts` / cosmp routes NOT touched (G3.6 forward-substrate); embedding service itself NOT touched (G3.4 unchanged); schema.prisma / DB scripts / CI workflows / `docker-compose.test.yml` / `.husky/pre-commit` / `package.json` / lockfiles NOT touched; Elixir source NOT touched (Q-G3-θ β-A LOCK preserved; G3.8 forward-substrate); ADR-0011/0013/0014/0015/0016/0022/0025/0033/0034/0035/0041/0042 NOT amended; ADR-0043 Status preserved at `Proposed 2026-05-17`.

**Forward-substrate unchanged from G3.1+G3.2+G3.3+G3.4 enumeration:** G3.6 `[CAPSULE-EMBEDDING-RETRIEVAL]` searchBySimilarity + `CAPSULE_SIMILARITY_SEARCH` audit literal + COE integration disposition per Q-G3-δ + G3.7 conditional backfill + G3.8 conditional Elixir per Q-G3-θ + G3.9 broader integration tests + G3.10 docs-only closure cascade.

**Founder LOCKS preservation:** 12 Q-G3.5 sub-decisions / locks Q-G3.5-α through Q-G3.5-λ all LOCKED at `[CAPSULE-EMBEDDING-WRITE-G3.5-QLOCK]` register substantively per RULE 20; G3.5 execution authorization at `[CAPSULE-EMBEDDING-WRITE-G3.5-EXECUTE-VERIFY-AUTH]`.

#### G3.6 LANDED — Similarity retrieval service + route + audit literal (2026-05-18)

**Status:** G3.6 `[CAPSULE-EMBEDDING-RETRIEVAL]` LANDED 2026-05-18 (single commit covering service + route + audit literal + tests + ADR/state/catalog updates) per ADR-0043 §Sub-decision 11 + 10 Q-G3.6 sub-decisions / locks Q-G3.6-α through Q-G3.6-κ at `[CAPSULE-EMBEDDING-RETRIEVAL-G3.6-QLOCK]`. ADR-0043 Status preserved as `Proposed 2026-05-17`. G3.6 does NOT close Gap 3.

**Substrate sites (12 authorized files):** 3 NEW + 9 MOD. NEW: `apps/api/src/services/cosmp/similarity.service.ts` + `tests/unit/cosmp/similarity.test.ts` + `tests/integration/similarity-search.test.ts`. MOD: `apps/api/src/index.ts` (barrel re-export) + `apps/api/src/server.ts` (instantiation + wire) + `apps/api/src/routes/cosmp.routes.ts` (extend `registerCosmpRoutes` signature + NEW POST /api/v1/cosmp/search route + 3 new 422 mappings at `statusForCode`) + `packages/database/src/queries/audit.ts` (append `CAPSULE_SIMILARITY_SEARCH` literal) + ADR-0043 + section-12-progress + this CURRENT_BUILD_STATE + README + CLAUDE.md = 12.

**RULE 0 SQL-tier filter set per Q-G3.6-γ (6 mandatory filters before ranking):** `wallet_id = $::uuid` + `deleted_at IS NULL` + `ai_access_blocked = false` + `requires_validation = false` + `clearance_required <= $session.clearance_ceiling` + `embedding IS NOT NULL`. All 6 filters fire at the SQL tier; no post-fetch privacy filtering. `ai_access_blocked` and `requires_validation` are NEW enforcement responsibilities at READ tier (G3.6 bypasses NEGOTIATE; previously only enforced at negotiate.service.ts).

**HNSW iterative scan posture per Q-G3.6-γ.2:** `SET LOCAL hnsw.iterative_scan = strict_order` + `SET LOCAL hnsw.ef_search = 100` applied per-query inside `prisma.$transaction`. RULE 21 research arc citation: pgvector's HNSW index applies WHERE filters AFTER index scan (default ef_search=40); iterative scan (pgvector 0.8.0+; our pinned 0.8.2) keeps scanning until enough matches accumulate or `hnsw.max_scan_tuples` (default 20,000) caps work. `strict_order` mode preserves exact distance ordering at the cost of some recall — chosen for audit-trail determinism.

**Audit metadata schema per Q-G3.6-δ.** ALLOWED fields: `query_length`, `topK`, `minSimilarity`, `result_count`, `filters_applied`, `embedding_generated`, plus `embedding_failure_class` + `embedding_failure_message` in degraded path. FORBIDDEN fields (NEVER appear in any code path): raw query text, truncated query, query keywords, `query_keywords_redacted`, query vector, result vectors, vector_hash, embedding_sample, embedding_first_*, vector_dim_*, per_result_distance distribution, per-dimension stats, cosine_distance, distances.

**Privacy invariant per Q-G3-ζ + Q-G3.6-γ.1 + RULE 0:** vectors and distances are server-side substrate only. SimilarityMatch + SimilaritySuccess + SimilarityDegraded response shapes omit any vector / embedding / distance field by construction. HTTP route handler returns the service result verbatim — no inline injection of forbidden fields. Tier 1 Gate 9 scans interface bodies; Gate 11 scans the route handler body; Gate 14 scans the audit details object body inside every `emitSimilarityAudit({ ...details: {...} })` call site.

**V2 Correction 5 — neutral `emitSimilarityAudit(outcome, ...)` helper:** single helper for all CAPSULE_SIMILARITY_SEARCH emissions; outcome param discriminates SUCCESS vs DENIED. Provider failure per Q-G3.6-θ is **degraded SUCCESS** with `embedding_generated: false` + `embedding_failure_class` + `embedding_failure_message` + `result_count: 0` (NEVER DENIED). Empty result per Q-G3.6-ι is **SUCCESS** with `result_count: 0` (NEVER DENIED). Only auth/session/permission/caller-bug failures (SESSION_*, OPERATION_NOT_PERMITTED, QUERY_INVALID, TOPK_OUT_OF_RANGE, WALLET_MISSING) emit `outcome: "DENIED"`.

**topK ceiling per Q-G3.6-η:** default 10; max 50; integers in [1, 50] only; out-of-range requests rejected with `TOPK_OUT_OF_RANGE` (HTTP 422) and emit DENIED audit row. No silent clamping.

**COE integration DEFERRED past G3.6 per Q-G3.6-ε:** `apps/api/src/services/coe/**` + `apps/api/src/services/coe/keywords.ts` + ADR-0022 ALL UNTOUCHED. Paths (a) replace_tagOverlap + (b) 4th_coefficient REQUIRE Founder-authorized ADR-0022 amendment per RULE 20 + coordinated test update at `tests/unit/coe.test.ts:132-136`. Paths (c) rerank post-fetch + (d) prefilter remain candidate dispositions for a future commit.

**Test substrate per Q-G3.6-ζ:** NEW `tests/unit/cosmp/similarity.test.ts` 12 unit tests S1-S12 with stable verbatim names. S3+S4+S5+S6+S7+S8+S9+S11 named-block isolation per Tier 1 Gate 15 (privacy-critical structural conditions verified inside each balanced-brace block). NEW `tests/integration/similarity-search.test.ts` 4 integration tests J1-J4 (J1 named-block isolation per Tier 1 Gate 16 / V2 Correction 4 — HTTP response body asserts no vector / embedding / distance fields). All tests use FixtureBasedEmbeddingProvider or in-test mock providers; no real OpenAI calls.

**Scope boundaries preserved:** ADR-0022 NOT amended (Q-G3-δ + Q-G3.6-ε); `apps/api/src/services/coe/**` NOT touched; `apps/api/src/services/coe/keywords.ts` NOT touched; `read.service.ts` / `write.service.ts` / `negotiate.service.ts` / `share.service.ts` / `jurisdiction-enforcement.ts` / `regulator-enforcement.ts` NOT touched; `embedding.service.ts` (G3.4) NOT touched; schema.prisma / DB scripts / CI workflows / `docker-compose.test.yml` / `.husky/pre-commit` / `package.json` / lockfiles NOT touched; Elixir source NOT touched (Q-G3-θ β-A); ADR-0011/0013/0014/0015/0016/0022/0025/0033/0034/0035/0041/0042 NOT amended; ADR-0043 Status preserved at `Proposed 2026-05-17`.

**Forward-substrate unchanged from G3.1+G3.2+G3.3+G3.4+G3.5 enumeration:** G3.7 `[CAPSULE-EMBEDDING-BACKFILL]` conditional (lazy-on-first-read default per Q-G3-ε); G3.8 `[CAPSULE-EMBEDDING-ELIXIR]` conditional (default skip per Q-G3-θ β-A); G3.9 broader integration tests; G3.10 `[BEAM-CAPSULE-EMBEDDING-CLOSURE]` docs-only closure cascade (closes Gap 3 at canonical-state register substantively).

**Founder LOCKS preservation:** 10 Q-G3.6 sub-decisions / locks Q-G3.6-α through Q-G3.6-κ all LOCKED at `[CAPSULE-EMBEDDING-RETRIEVAL-G3.6-QLOCK]` register substantively per RULE 20; G3.6 execution authorization at `[CAPSULE-EMBEDDING-RETRIEVAL-G3.6-EXECUTE-VERIFY-AUTH]`.

#### G3.7 SKIPPED — Conditional lazy backfill formally deferred (2026-05-18)

**Status:** G3.7 `[CAPSULE-EMBEDDING-BACKFILL]` formally SKIPPED 2026-05-18 (single docs-only commit; 5 MOD + 0 NEW) per Q-G3.7-α α-1 LOCK + Q-G3.7-η 5-MOD-docs-only scope LOCK at `[CAPSULE-EMBEDDING-BACKFILL-G3.7-QLOCK]`. ADR-0043 Status preserved as `Proposed 2026-05-17`. G3.7 does NOT close Gap 3.

**Substrate sites (5 authorized files; 5 MOD + 0 NEW):** ADR-0043 G3.7 SKIP H2 record + section-12-progress Sub-arc 2 row inline G3.7 SKIPPED + this CURRENT_BUILD_STATE (H2 visibility + this G3.7 SKIP H4) + README ADR-0043 catalog parenthetical + CLAUDE.md mirror.

**Substrate-state rationale.** At HEAD `371e108`, current production substrate has no proven population of legacy capsules requiring lazy backfill — every capsule on origin/main was created via post-G3.5 WriteService with embedding generation at create-time per Q-G3-ε ADD/UPDATE matrix. G3.6 similarity service already enforces `embedding IS NOT NULL` graceful-exclusion semantics in the raw SQL filter set (the 6 RULE 0 SQL-tier privacy filters per Q-G3.6-γ). Lazy backfill would convert exclusion to inclusion — solving a non-problem at current substrate-state. Q-G3-ε wording explicitly authorized this disposition: "lazy-on-first-read default suffices for production rollout; bulk-backfill remains forward-substrate at G3.7 conditional register substantively unless Founder explicitly authorizes later."

**Q-G3.7 sub-decisions under α-1 SKIP.** Q-G3.7-β trigger path N/A (no readContent / readMetadata / similarity-fallback / runtime trigger); Q-G3.7-γ update pattern N/A (no new raw SQL update site; no helper extraction); Q-G3.7-δ concurrency/idempotency N/A (no read-path mutation); Q-G3.7-ε audit posture N/A (no `CAPSULE_EMBEDDING_BACKFILL` literal at G3.7); Q-G3.7-ζ failure behavior N/A (no provider call).

**G1.4 SKIP precedent.** Commit `3505fde` `[CAPSULE-MUTATION-ELIXIR-AUDIT]` per ADR-0042 §Sub-decision Q-ι default LOCK landed the canonical mini-arc SKIP pattern G3.7 mirrors: docs-only formal SKIP record preserves G3 mini-arc lineage coherence (G3 mini-arc advances 6/10 → 7/10 after G3.7 SKIP lands) without expanding scope into a non-existent population.

**Scope boundaries preserved:** no `apps/api/**` / `tests/**` / `packages/**` / `scripts/**` / schema / CI workflows / `docker-compose.test.yml` / `.husky/pre-commit` / `package.json` / lockfiles / Elixir changes; no `audit.ts` changes (no `CAPSULE_EMBEDDING_BACKFILL` literal); ADR-0022 + ADR-0011/0013/0014/0015/0016/0025/0033/0034/0035/0041/0042 ALL UNTOUCHED; ADR-0043 Status preserved at `Proposed 2026-05-17`.

**Substrate-state observations forward-queued at commit-body-only register (not promoted to ADR-0035 §9 cluster at G3.7):** D-PRODUCTION-LAZY-BACKFILL-POPULATION-NON-EXISTENT-AT-G3.7-LANDING (zero legacy capsules) + D-RAW-SQL-EMBEDDING-UPDATE-DUPLICATION-CANDIDATE (2 sites in write.service.ts share identical raw SQL; helper-extraction candidate; forward-queue for future cleanup).

**Forward-substrate unchanged from G3.1+G3.2+G3.3+G3.4+G3.5+G3.6 enumeration:** G3.8 `[CAPSULE-EMBEDDING-ELIXIR]` conditional (default β-A skip per Q-G3-θ); G3.9 broader integration tests; G3.10 `[BEAM-CAPSULE-EMBEDDING-CLOSURE]` docs-only closure cascade (closes Gap 3 at canonical-state register substantively).

**Founder LOCKS preservation:** Q-G3.7-α α-1 + Q-G3.7-η LOCKED at `[CAPSULE-EMBEDDING-BACKFILL-G3.7-QLOCK]` register substantively per RULE 20; G3.7 execution authorization at `[CAPSULE-EMBEDDING-BACKFILL-G3.7-EXECUTE-VERIFY-AUTH]`.

#### G3.8 LANDED — Elixir-boundary contract for embedding column (2026-05-18)

**Status:** G3.8 `[CAPSULE-EMBEDDING-ELIXIR]` LANDED 2026-05-18 (substantive Elixir-boundary contract landing; **NOT a SKIP**) per Q-G3.8-α α-2 LOCK + Q-G3.8-β/γ/δ/ε at `[CAPSULE-EMBEDDING-ELIXIR-G3.8-QLOCK]`. ADR-0043 Status preserved as `Proposed 2026-05-17`. G3.8 does NOT close Gap 3.

**Substrate sites (7 authorized files; 7 MOD + 0 NEW):** 2 Elixir MOD (`apps/cosmp_router/lib/cosmp_router/schemas/memory_capsule.ex` moduledoc extension + `apps/cosmp_router/test/cosmp_router/schemas/memory_capsule_test.exs` NEW explicit named test) + 5 docs MOD (ADR-0043 G3.8 substantive H2 + section-12-progress Sub-arc 2 row inline + this CURRENT_BUILD_STATE H2 visibility + this G3.8 H4 + README + CLAUDE.md).

**Consumer-driven framing.** Foundation production readiness DELIBERATELY EXCLUDES Elixir-side vector access at HEAD `ee0b01b`. Architectural decision per ADR-0033 §Decision 7 cross-language data-ownership boundary + Q-G3-θ β-A LOCK + ADR-0028 / ADR-0030 / ADR-0039 BEAM coordination layer scope — NOT a not-yet state. TypeScript/Prisma own vector write (G3.5 WriteService inline raw SQL `$executeRawUnsafe`) + retrieval (G3.6 SimilarityService raw SQL pgvector cosine with HNSW iterative scan). BEAM/COSMP coordination (cosmp_router 7-RPC service surface + DMW worker per-DMW dispatch + DBGI supervisor) operates over 7 COSMP ops (Authenticate / Negotiate / Read / Write / Share / Revoke / Audit) + MemoryCapsule lifecycle/routing — **NOT embedding distance**.

**Q-G3.8 sub-decisions enumerated.** Q-G3.8-α α-2 LOCK (Elixir-boundary-doc guardrail with explicit named test); Q-G3.8-β LOCK (verbatim stable test title + canonical `refute :embedding in MemoryCapsule.__schema__(:fields)` form); Q-G3.8-γ LOCK (moduledoc note with 8 required content elements); Q-G3.8-δ LOCK (forward-substrate language: real consumer + Founder authorization + ADR-0033 amendment + `pgvector` canonical Hex name reconciliation + RULE 0 safeguards + Prisma DDL ownership); Q-G3.8-ε LOCK (7 MOD + 0 NEW scope).

**Substrate-enforced boundary contract.** Pre-existing field-set parity test at memory_capsule_test.exs L76-88 enforces "extra == []" at SUBSTRATE register (any field added to schema not in `@expected_fields` fails). NEW explicit named test (verbatim title `embedding column is Prisma-owned and intentionally absent from Ecto schema per Q-G3-θ β-A LOCK + ADR-0043 §Sub-decision 8`) converts the implicit substrate-state enforcement into an EXPLICIT NAMED CONTRACT contributors can grep for, anchored on the `:embedding` atom specifically.

**Moduledoc boundary paragraph.** Extended at memory_capsule.ex with H2 section "Embedding column boundary (G3.8 / Q-G3-θ β-A LOCK)" containing all 8 required content elements per Q-G3.8-γ: Prisma-owned + intentionally not Ecto-visible + 4 forward-substrate conditions (proven consumer + Founder authorization + ADR-0033 amendment + RULE 0 safeguards) + Q-G3-θ β-A current state + test anchor reference + D-PGVECTOR-EX naming reconciliation note.

**Forbidden / preserved boundaries enumerated:** no `mix.exs` / `mix.lock` changes; no `pgvector` / `pgvector_ex` dep; no Ecto vector field; no Translator pack/unpack extension; no protobuf / gRPC vector extension; no ADR-0033 amendment at G3.8 (cross-language data-ownership boundary preserved); ADR-0022 + ADR-0011/0013/0014/0015/0016/0025/0034/0035/0041/0042 ALL UNTOUCHED; `apps/api/**` UNTOUCHED; `apps/dbgi_supervisor/**` UNTOUCHED; all other `apps/cosmp_router/**` paths beyond the 2 authorized Elixir files UNTOUCHED; ADR-0043 Status preserved.

**3 RULE 13 forward-queued observations** (commit-body-only register substantively; NOT promoted to ADR-0035 §9 cluster at G3.8): D-PGVECTOR-EX-HEX-PACKAGE-NAME-DRIFT-AT-Q-G3-θ (canonical Hex package is `pgvector`, not `pgvector_ex` as Q-G3-θ wording says); D-ELIXIR-VECTOR-CONSUMER-DELIBERATELY-EXCLUDED-AT-FOUNDATION-PRODUCTION-READINESS (architectural decision, not not-yet state); D-IMPLICIT-VS-EXPLICIT-BOUNDARY-CONTRACT-AT-Q-G3-θ-G3.3-DEFERRAL (Q-G3-θ §G3.3 deferral language anticipated moduledoc note; G3.8 is the substrate-coherent landing point 6 commits later).

**G1.4 + G3.7 SKIP precedent comparison.** G3.8 mirrors the docs-only + minimal-Elixir-touch discipline of G1.4 (`3505fde` `[CAPSULE-MUTATION-ELIXIR-AUDIT]`) and G3.7 (`ee0b01b` `[CAPSULE-EMBEDDING-BACKFILL]`) but is SUBSTANTIVE LANDING (boundary contract LANDED) NOT a SKIP per Founder reframing. The reframing is substrate-coherent: a SKIP record alone is too passive for Foundation API production-bound surfaces; the boundary contract must be explicit and test-enforced at the Elixir register.

**Test surface at closure.** Cosmp_router default tier baseline 218 → 219 (1 NEW explicit named test added; all pre-existing tests preserved). No other test tier impact.

**Forward-substrate unchanged from G3.1+G3.2+G3.3+G3.4+G3.5+G3.6+G3.7 enumeration:** G3.9 broader integration tests; G3.10 `[BEAM-CAPSULE-EMBEDDING-CLOSURE]` docs-only closure cascade (closes Gap 3 at canonical-state register substantively).

**Founder LOCKS preservation:** Q-G3.8-α α-2 + Q-G3.8-β + Q-G3.8-γ + Q-G3.8-δ + Q-G3.8-ε LOCKED at `[CAPSULE-EMBEDDING-ELIXIR-G3.8-QLOCK]` register substantively per RULE 20; G3.8 execution authorization at `[CAPSULE-EMBEDDING-ELIXIR-G3.8-EXECUTE-VERIFY-AUTH]`.

#### G3.9 LANDED — broader integration tests (2026-05-18)

**Status:** G3.9 `[CAPSULE-EMBEDDING-PRODUCTION-CONTRACT]` LANDED 2026-05-18 at commit `fa80624` (substantive test-only landing) per Q-G3.9-α α-1 LOCK + 10 additional Q-G3.9 LOCKs at `[CAPSULE-EMBEDDING-PRODUCTION-CONTRACT-G3.9-QLOCK]`. ADR-0043 Status preserved as `Proposed 2026-05-17` at G3.9 (G3.10 flips to Accepted at the closure register substantively). G3.9 does NOT close Gap 3.

**Substrate sites (1 authorized file; 1 MOD + 0 NEW):** `tests/integration/similarity-search.test.ts` extended with 4 NEW integration tests J5-J8 inside a NEW `describe("G3.9 — production-contract end-to-end (J5-J8)", ...)` block. Existing J1-J4 describe block preserved verbatim.

**Production-contract framing.** Foundation production readiness requires integration-tier round-trip proof of write → search composition; unit-tier mocks are insufficient as sole proof for production-bound surfaces. G3.9 proves end-to-end ADD + UPDATE roundtrip under real DB/HNSW, integration-tier RULE 0 privacy filter joint adversarial fixture, and NULL embedding graceful exclusion under real HNSW.

**4 NEW integration tests (verbatim titles).** J5 end-to-end ADD via WriteService persists embedding then SimilaritySearch retrieves same-wallet capsule; J6 end-to-end UPDATE via WriteService regenerates embedding then SimilaritySearch reflects updated content; J7 integration-tier RULE 0 privacy filter joint adversarial fixture excludes all 4 disqualifying capsules under real HNSW; J8 integration-tier embedding-NULL capsule gracefully excluded without crash under real HNSW.

**J7 5-capsule labeled fixture composition.** 1 ELIGIBLE (passes all filters) + 1 BLOCKED (`ai_access_blocked = true`) + 1 PENDING (`requires_validation = true`) + 1 SOFT (`deleted_at IS NOT NULL`) + 1 HIGH-CLEARANCE (`clearance_required = 999` above default session ceiling). Each disqualifying capsule labeled via `topic_tags` for diagnostic clarity. Real DB + real HNSW exercise the 6 RULE 0 SQL-tier filters at `similarity.service.ts:303-308` jointly.

**Privacy invariants asserted in all 4 NEW tests.** HTTP response body MUST NOT contain `vector` / `embedding` / `distance` / `cosine_distance` substrings (verbatim negative assertions). CAPSULE_SIMILARITY_SEARCH audit row metadata safety asserted in J5: no raw query text (sentinel pattern) / no `query_text` / no `query_keywords` / no `vector_hash` / no `embedding_sample` / no `"distances"`.

**Integration baseline shift.** 207 passed + 1 skipped → 211 passed + 1 skipped after G3.9 LANDS (4 NEW J5-J8 tests added). Total focused-file count 4 → 8.

**Forbidden / preserved boundaries enumerated:** no production code changes; no `apps/**` / `apps/cosmp_router/**` / `apps/dbgi_supervisor/**` / `packages/**` / `scripts/**` / `schema.prisma` / DB scripts / CI workflows / package / lockfile / `mix.exs` / `mix.lock` / `audit.ts` / new audit literals / new files. ADR-0022 + ADR-0033 + ADR-0043 Status untouched. `coe/**` + `keywords.ts` + `read.service.ts` + `write.service.ts` + `similarity.service.ts` + `embedding.service.ts` UNTOUCHED.

**3 in-arc RULE 13 observations** (commit-body-only register substantively at G3.9 commit `fa80624`; 2 of 3 promoted to ADR-0035 §9 cluster at G3.10): D-J4-ALREADY-COVERS-3-OF-4-J7-FILTERS-AT-INTEGRATION-TIER (commit-body-only preserved at G3.10) + D-VITEST-NPX-CONFIG-DEFAULT-LOADS-PRODUCTION-SUPABASE-AT-G3.9-TIER-2 (PROMOTED to 37th §9 observation at G3.10) + D-PRISMA-ECTO-CROSS-LANGUAGE-SCHEMA-MIGRATIONS-OWNERSHIP-COLLISION-AT-LOCAL-REFRESH (folded into 38th §9 umbrella observation at G3.10).

**Forward-substrate after G3.9:** G3.10 `[BEAM-CAPSULE-EMBEDDING-CLOSURE]` docs-only closure cascade (closes Gap 3 at canonical-state register substantively).

**Founder LOCKS preservation:** Q-G3.9-α α-1 through Q-G3.9-λ LOCKED at `[CAPSULE-EMBEDDING-PRODUCTION-CONTRACT-G3.9-QLOCK]` register substantively per RULE 20; G3.9 execution authorization at `[CAPSULE-EMBEDDING-PRODUCTION-CONTRACT-G3.9-EXECUTE-VERIFY-AUTH]` + commit authorization at `[CAPSULE-EMBEDDING-PRODUCTION-CONTRACT-G3.9-COMMIT-AUTH]`.

#### G3.10 LANDED — Gap 3 pgvector Embedding CLOSED (2026-05-18)

**Status:** G3.10 `[BEAM-CAPSULE-EMBEDDING-CLOSURE]` LANDED 2026-05-18 — **Gap 3 CLOSED at canonical-state register substantively**. Docs-only closure cascade. 6 MOD + 0 NEW. ADR-0043 Status flipped from `Proposed 2026-05-17` to **`Accepted 2026-05-18`** at this commit register substantively per Q-G3.10-γ LOCK. **G3 mini-arc 10/10 complete.**

**Substrate sites (6 authorized files; 6 MOD + 0 NEW):** ADR-0043 Status flip + G3.9 H2 + G3.10 H2 + Post-Closure Implementation Lineage H2; section-12-progress Sub-arc 2 row inline G3.9 + G3.10 prose; this CURRENT_BUILD_STATE H2 visibility update + NEW G3.9 H4 + this G3.10 H4; README ADR-0043 catalog entry Proposed → Accepted; CLAUDE.md ADR-0043 catalog entry Proposed → Accepted; ADR-0035 §9 cluster expansion 37th + 38th observation H3 sections.

**11 Q-G3.10 LOCKs canonical at `[BEAM-CAPSULE-EMBEDDING-CLOSURE-G3.10-QLOCK]`.** Q-G3.10-α (docs-only closure cascade) + Q-G3.10-β (6 MOD + 0 NEW) + Q-G3.10-γ (ADR-0043 Status Proposed → Accepted) + Q-G3.10-δ (Sub-arc 2 remains IN FLIGHT) + Q-G3.10-ε Option α (ADR-0035 §9 promotions 37th + 38th) + Q-G3.10-ζ (no ADR-0022 / ADR-0033 amendment) + Q-G3.10-η (no production code/schema/test/CI/package/Elixir/audit changes) + Q-G3.10-θ (G3.10 closes Gap 3) + Q-G3.10-ι (Sub-arc 2 closure remains forward-substrate) + Q-G3.10-κ (COE / ADR-0022 integration remains forward-substrate; NOT a Gap 3 closure dependency).

**Sub-arc 2 status field remains IN FLIGHT per Q-G3.10-δ + Q-G3.10-ι.** Sub-arc 2 closure remains forward-substrate pending Gap 4 (ADR-0044 Decay Execution Formalization) + Gap 5 (ADR-0045 Capsule-Level Staleness Detection) + optional Gap 6 (ADR-0046 AI_AGENT EntityType-Discriminated Capsule Routing) + later Sub-arc 2 closure cascade per ADR-0041 CL.1 scope patch register substantively.

**ADR-0035 §9 cluster expansion (Option α; 37th + 38th observations).** Cluster 36 → 38 observations after G3.10 LANDS. 37th = **D-VITEST-NPX-CONFIG-DEFAULT-LOADS-PRODUCTION-SUPABASE** (critical production-safety substrate trap; bare `npx vitest run <file>` loads `.env` via legacy `vitest.config.ts` → production Supabase pooler; canonical commands MUST use `--config vitest.{unit,integration}.config.ts` OR `npm run test:{unit,integration}` which load `.env.test`). 38th = **D-LOCAL-DEV-ENV-CROSS-LANGUAGE-OWNERSHIP-DRIFT** (umbrella unifying D-G3.3-LOCAL-CONTAINER-DRIFT + D-LOCAL-ECTO-MIGRATION-STATE-DRIFT-AT-G3.8-TIER-2 + D-PRISMA-ECTO-CROSS-LANGUAGE-SCHEMA-MIGRATIONS-OWNERSHIP-COLLISION-AT-LOCAL-REFRESH at local-development environment + cross-language data ownership boundary per ADR-0033 §Decision 7 + Q-5BII-EXEC-5).

**Commit-body-only observations preserved at G3.10 (NOT §9 promoted).** D-PGVECTOR-EX-HEX-PACKAGE-NAME-DRIFT-AT-Q-G3-θ (cosmetic label; reconcile at α-3 implementation only) + D-ELIXIR-VECTOR-CONSUMER-DELIBERATELY-EXCLUDED-AT-FOUNDATION-PRODUCTION-READINESS (canonical at G3.8 H2 body) + D-IMPLICIT-VS-EXPLICIT-BOUNDARY-CONTRACT-AT-Q-G3-θ-G3.3-DEFERRAL (canonical at G3.8 amendment register) + D-J4-ALREADY-COVERS-3-OF-4-J7-FILTERS-AT-INTEGRATION-TIER (G3.9-paste-specific; no broader pattern).

**Forbidden / preserved boundaries at G3.10 (Q-G3.10-η enumeration):** no production code/schema/test/CI/package/Elixir/audit changes. No `apps/**` / no `tests/**` / no `packages/**` / no `scripts/**` / no `schema.prisma` / no DB scripts / no CI workflows / no package/lockfiles / no `mix.exs` / no `mix.lock` / no `audit.ts` / no new audit literals / no ADR-0022 amendment / no ADR-0033 amendment / no new files. `coe/**` + `keywords.ts` + `read.service.ts` + `write.service.ts` + `similarity.service.ts` + `embedding.service.ts` UNTOUCHED. All G3.9 production-contract test evidence preserved by construction.

**COE / ADR-0022 integration remains forward-substrate (Q-G3.10-κ).** ADR-0022 combined_score formula at `apps/api/src/services/coe/keywords.ts:87-93` preserved verbatim at G3.10. COE integration paths enumerated at ADR-0043 §Sub-decision 4 (replace tagOverlap / 4th coefficient / rerank / prefilter) remain forward-substrate; paths (a) + (b) require Founder-authorized ADR-0022 amendment if/when authorized. NOT a Gap 3 closure dependency.

**Patent-implementation evidence per ADR-0020 two-register IP discipline:** Gap 3 closure at G3.10 canonicalizes the pgvector embedding substrate as patent-implementation evidence per US 12,517,919 + US 12,164,537 + US 12,399,904. G3.1-G3.10 lineage at ADR-0043 §Post-Closure Implementation Lineage provides cryptographically-timestamped commit evidence at canonical-execution register substantively.

**Founder LOCKS preservation:** Q-G3.10-α through Q-G3.10-κ LOCKED at `[BEAM-CAPSULE-EMBEDDING-CLOSURE-G3.10-QLOCK]` register substantively per RULE 20; G3.10 execution authorization at `[BEAM-CAPSULE-EMBEDDING-CLOSURE-G3.10-EXECUTE-VERIFY-AUTH]`.

---

## Phase 3 Sub-Arc 1 Sub-Phase d -- DEVICE Cold-Shard Substrate CLOSED 2026-05-17

Status: CLOSED 2026-05-17 at D.4 `[BEAM-DBGI-DEVICE-COLDSHARD-CLOSURE]`.

Current HEAD at closure: this commit.
Lineage: `353c618` → `6e19f61` → `28a5abc` → this commit.

Sub-phase d implemented DEVICE cold-shard dispatch per ADR-0040. The
implementation uses a pure stateless `CosmpRouter.DeviceShard` module
implementing Jump Consistent Hash (Lamping-Veach 2014) and wires
DEVICE wallet_type dispatch through an explicit branch in
`CosmpRouter.GRPC.Server`.

**Runtime substrate at closure register substantively:**

- `CosmpRouter.DeviceShard` is pure and stateless.
- `CosmpRouter.DeviceShard.assign_shard/1` uses configured K default
  256.
- Valid K range is 128..1024.
- `grpc/server.ex` has explicit `{:ok, :device}` branch BEFORE
  `{:ok, _other_tier}`.
- `dispatch_device_shard/3` computes deterministic shard assignment
  and preserves Router request shape.
- DEVICE remains cold.
- DEVICE does NOT spawn DMWWorker.
- DEVICE does NOT create per-device GenServer.
- DEVICE does NOT use ETS hot path.
- DEVICE does NOT add supervised child.
- AI_AGENT remains outside DEVICE lane and maps to PERSONAL
  wallet_type at INSERT register per TS-side `defaultWalletTypeFor/1`
  helper canonical at `packages/database/src/queries/wallet.ts`
  register substantively.

**4-commit decomposition LANDED canonical at canonical-state register
substantively:**

- D.1 `353c618` `[BEAM-DBGI-DEVICE-COLDSHARD-ADR]` — docs-only
  (ADR-0040 NEW Proposed + D.0 Rule 21 research arc embedded + this
  row IN FLIGHT + catalog refreshes; 4-paths +628 insertions).
- D.2 `6e19f61` `[BEAM-DBGI-DEVICE-SHARD-MODULE]` — substantive code
  (NEW `apps/cosmp_router/lib/cosmp_router/device_shard.ex` 122 lines
  + NEW `apps/cosmp_router/test/cosmp_router/device_shard_test.exs`
  182 lines + MOD `config/config.exs` +7 lines; 15 NEW unit tests;
  Bitwise import + SHA-256 64-bit key + canonical Lamping-Veach Jump
  Hash + return bucket b not overshot j + fail-fast validation).
- D.3 `28a5abc` `[BEAM-DBGI-DEVICE-SHARD-DISPATCH-INTEGRATION]` —
  substantive code (MOD `apps/cosmp_router/lib/cosmp_router/grpc/server.ex`
  +36/-2 + NEW `apps/cosmp_router/test/cosmp_router/grpc/device_shard_dispatch_test.exs`
  233 lines; explicit `{:ok, :device}` branch + dispatch_device_shard/3
  helper + 7 NEW integration tests with discriminator pattern proving
  DEVICE no longer rides `_other_tier` catch-all).
- D.4 this commit `[BEAM-DBGI-DEVICE-COLDSHARD-CLOSURE]` — docs-only
  closure cascade (ADR-0040 Status Accepted + Post-Closure
  Implementation Lineage + this section NEW + section-12-progress.md
  CLOSED row + architecture/README + CLAUDE.md ADR-0040 catalog
  refresh + ADR-0038 Forward Queue closure + ADR-0035 28th observation
  promotion).

**Final test surface canonical at canonical-coherence register
substantively:**

- `CosmpRouter.DeviceShardTest`: 15/0
- `CosmpRouter.GRPC.DeviceShardDispatchTest`: 7/0
- `cosmp_router` default: 218/0 + 1 skipped
- `dbgi_supervisor` default: 67/0 (19 excluded)
- CI green across all 4 jobs at D.1 + D.2 + D.3 + D.4

**ADR-0038 §Forward Queue K=128-1024 DEVICE cold-shard item: CLOSED**
at canonical-state register substantively at this commit register
substantively per ADR-0040 §Sub-decision 7.

**Forward-substrate at canonical-state register substantively:**

- D.4 closes sub-arc 1 sub-phase d.
- Sub-arc 2 capsule layer Gaps 1+3+4+5 (ADD/UPDATE/MERGE/NOOP mutation
  discrimination + pgvector embedding + decay execution + staleness
  detection + weighting architecture per Entry #28; AI_AGENT
  EntityType-discriminated capsule routing forward-substrate at this
  register).
- Sub-arc 3 benchmark + bi-temporal + tier automation.
- Optional DEVICE shard observability/per-shard metrics remain
  forward-substrate at sub-arc 3 register substantively if later
  required.

References canonical at canonical-coherence register substantively:
ADR-0040 (DEVICE Cold-Shard Substrate; Accepted at this commit per
Post-Closure Implementation Lineage); ADR-0038 §Sub-decision 3 +
§Forward Queue line 249 (K=128-1024 consistent-hash shards target
LANDED at D.2 + D.3 + CLOSED at D.4 register substantively); ADR-0039
§Sub-decision 7 + Sub-decision 8 + Amendment 1 (DEVICE Router fallback
at sub-phase c register substantively superseded at sub-phase d
register substantively per ADR-0040 substrate); ADR-0034 (BEAM
testability discipline); ADR-0035 (substrate-build discipline; 28th
observation D-PASTE-AUTHORIZATION-FAILED-TO-GREP-DISPATCH-HELPER-ARG-
ORDER promoted at this commit register substantively); RULE 11
(Elixir/BEAM iteration-loop research); RULE 13 (substrate-honest
pre-flight surface); RULE 20 (founder authorization); RULE 21
(pre-authorization research arc canonical per `67f6112` commit).

---

## Phase 3: Dynamic Memory Accuracy at Scale -- Sub-Arc 1 Sub-Phase c (PERSONAL Promote-on-Activity per ADR-0039 Amendment 1): CLOSED 2026-05-17

Sub-arc 1 sub-phase c mini-arc CLOSED at HEAD parent `b7fa258` (C.4) +
this C.5 closure commit canonical at canonical-state register
substantively per ADR-0039 Amendment 1 canonical at canonical-prose
register substantively per ADR-0011 §Amendment canonical convention.
5-commit mini-arc decomposition canonical at operator decision register
substantively canonical at patent-implementation evidence register
substantively per ADR-0020 two-register IP discipline canonical.

**Substrate-state ground truth at closure register substantively:**

- PERSONAL promote-on-activity substrate canonical at canonical-
  execution register substantively. PERSONAL entities promote to per-
  DMW DMWWorker via Horde Registry canonical at canonical-execution
  register substantively when ActivityCounter threshold crossed (default
  5 activities canonical at canonical-state register substantively per
  ADR-0034 testability discipline canonical).
- Idle eviction periodic task canonical at canonical-execution register
  substantively releases DMWWorker resources canonical at canonical-
  state register substantively when entity inactivity exceeds configured
  idle TTL (default 5 minutes canonical at canonical-state register
  substantively).
- DEVICE tier preserves sub-phase a Router fallback canonical at
  backward-compat register substantively per ADR-0038 Sub-decision 3
  tier 3 register substantively (forward-substrate to sub-phase d cold-
  shard substrate canonical at canonical-architectural register
  substantively).
- AI_AGENT disposition forward-substrate at sub-arc 2 capsule layer
  canonical at canonical-coherence register substantively per
  D-AI-AGENT-ENTITY-TYPE-vs-WALLET-TYPE-DISCRIMINATION-DRIFT observation
  canonical at C.3 commit body register substantively (AI_AGENT
  canonical at EntityType register substantively per ADR-0033 cross-
  language data ownership register substantively NOT WalletType
  register; Prisma WalletType enum enumerates PERSONAL + ENTERPRISE +
  DEVICE only canonical at canonical-coherence register substantively;
  DbgiSupervisor.start_dmw_worker_horde/3 guard rejects :ai_agent at
  substrate-state register substantively).
- Test surface: cosmp_router 196/0 + 1 skipped (172 baseline at B.7 +
  11 NEW ActivityCounter at C.1 + 11 NEW eviction at C.2 + 6 NEW
  promote_on_activity at C.3 absolute reconciled per actual count) +
  dbgi_supervisor 67/0 default (19 excluded) + 86/0 integration
  baseline preserved at canonical-coherence register substantively
  (C.4 + C.5 docs-only commits register substantively).
- ADR-0039 Amendment 1 canonical at canonical-prose register
  substantively (H2 Amendment subsection per ADR-0011 canonical
  precedent at canonical-knowledge register substantively; preserves
  Accepted §Sub-decision 8 body audit trail at canonical-honest
  register substantively per ADR-0020 two-register IP discipline
  canonical).
- ADR-0035 cluster expansion 26th + 27th observations promoted at this
  closure commit canonical at substrate-architectural register
  substantively (26th: D-SUPERVISION-TREE-EXPANSION-TEST-COHERENCE-
  DRIFT recurrence-3 across B.3 redraft + B.5 + C.1 supervision tree
  expansion; 27th: D-PASTE-AUTHORING-FAILED-TO-GREP-CANONICAL-STATE-
  BEFORE-PREMISE-LOCK recurrence-6 across RULE 21 promotion paste +
  stop_dmw_worker_horde + carried context + D-DEVICE-SKIPS-PROMOTE-
  CHECK + ADR-0039 H3-vs-H2 amendment structural assumption + C.5
  path discovery).

**Forward-substrate canonical at canonical-state register
substantively:**

- Sub-arc 1 sub-phase d: DEVICE cold-shard substrate canonical at
  canonical-state register substantively (always-cold shard-mapped per
  ADR-0038 Sub-decision 3 tier 3 register substantively; K=128-1024
  consistent-hash shards forward-substrate at substrate-architectural
  register substantively).
- Sub-arc 2: capsule layer Gaps 1+3+4+5 (ADD/UPDATE/MERGE/NOOP mutation
  discrimination + pgvector embedding + decay execution + staleness
  detection + weighting architecture per Entry #28; AI_AGENT EntityType-
  discriminated dispatch substrate canonical at canonical-coherence
  register substantively forward-substrate at this register
  substantively).
- Sub-arc 3: benchmark + bi-temporal + tier automation canonical at
  canonical-state register substantively.

References canonical at canonical-coherence register substantively:
ADR-0039 (Accepted at B.7 closure register substantively per `3242c17`
+ Amendment 1 canonical at this mini-arc register substantively per
C.4 `b7fa258`); ADR-0011 (Amendment precedent canonical at canonical-
prose register substantively per H2 Amendment subsection convention);
ADR-0020 (two-register IP discipline canonical at canonical-
architectural register substantively); ADR-0033 (cross-language data
ownership; EntityType vs WalletType canonical at canonical-knowledge
register substantively); ADR-0034 (BEAM testability discipline);
ADR-0035 (substrate-build discipline; sub-arc 1 sub-phase c cluster
expansion 26th + 27th observations canonical at substrate-architectural
register substantively at this C.5 closure commit register
substantively); ADR-0038 (DMWWorker substrate canonical at sub-phase a
runtime register substantively); RULE 11 (Elixir/BEAM iteration-loop
research); RULE 13 (substrate-honest pre-flight surface); RULE 20
(founder authorization); RULE 21 (pre-authorization research arc
canonical per `67f6112` commit).

---

## Phase 3: Dynamic Memory Accuracy at Scale -- Sub-Arc 1 Sub-Phase b (Hive-Scale Per-DMW Dispatch ENTERPRISE per ADR-0039): CLOSED 2026-05-17

Sub-arc 1 sub-phase b mini-arc CLOSED at HEAD parent `3242c17` (B.6.3)
+ this B.7 closure commit canonical at canonical-state register
substantively per ADR-0039 §Post-Closure Implementation Lineage
canonical. 10 substantive commits + 1 revert + 1 redraft + 1 RULE 21
promotion mid-arc canonical at patent-implementation evidence register
substantively per ADR-0020 two-register IP discipline canonical.

**Substrate-state ground truth at closure register substantively:**

- Hive-scale per-DMW dispatch substrate for ENTERPRISE wallets
  canonical at runtime register substantively. The architectural
  target named at README + monetization essay register substantively
  delivers at runtime for ENTERPRISE tier canonical at canonical-
  execution register substantively.
- PERSONAL + DEVICE tier fallback to CosmpRouter.Router canonical at
  sub-phase a substrate register substantively.
- Test surface: cosmp_router 172/0 + 1 skipped (166 baseline + 6 NEW
  tier_routed_dispatch); dbgi_supervisor 63/0 default + 82/0
  integration.
- Cycle breakage canonical at canonical-architectural register
  substantively per Option ζ Adapter Pattern (cosmp_router ->
  dbgi_supervisor compile-time in_umbrella + runtime
  extra_applications; dbgi_supervisor -> cosmp_router NO compile-time
  dep; runtime via Application.get_env).
- RULE 21 promoted to canonical at CLAUDE.md register substantively
  mid-arc (commit `67f6112`); pre-authorization research arc
  discipline canonical at canonical-rule register substantively for
  forward-substrate substrate-architectural pastes.

**Forward-substrate canonical at canonical-state register
substantively:**

- Sub-arc 1 sub-phase c: PERSONAL + AI_AGENT promote-on-activity
  substrate canonical at canonical-state register substantively
  (tier promotion from cold shard substrate to per-DMW canonical at
  ENTERPRISE register substantively when activity threshold crossed).
- Sub-arc 1 sub-phase d: DEVICE cold-shard substrate canonical at
  canonical-state register substantively (always-cold shard-mapped
  per ADR-0038 Sub-decision 3 tier 3 register substantively).
- Sub-arc 2: capsule layer Gaps 1+3+4+5 (ADD/UPDATE/MERGE/NOOP
  mutation discrimination + pgvector embedding + decay execution +
  staleness detection + weighting architecture per Entry #28).
- Sub-arc 3: benchmark + bi-temporal + tier automation canonical at
  canonical-state register substantively.

References canonical at canonical-coherence register substantively:
ADR-0039 (Accepted at this commit register substantively); ADR-0033
(cross-language data ownership); ADR-0034 (BEAM testability
discipline); ADR-0035 (substrate-build discipline; sub-arc 1
sub-phase b cluster expansion 25th observation per RULE 21 promotion
commit); ADR-0038 (DMWWorker substrate canonical at sub-phase a
runtime register); RULE 11 (Elixir/BEAM iteration-loop research);
RULE 20 (founder authorization); RULE 21 (pre-authorization research
arc canonical per `67f6112` commit).

---

## Phase 3: Dynamic Memory Accuracy at Scale -- Sub-Arc 1 Sub-Phase b (Hive-Scale Per-DMW Dispatch ENTERPRISE per ADR-0039): IN FLIGHT 2026-05-16

Phase 3 (Dynamic Memory Accuracy at Scale) sub-arc 1 sub-phase b
Commit 1 of 7 LANDED at this commit per ADR-0039 §Decision
Sub-decision 9 7-commit mini-arc decomposition. ADR-0039 NEW (Hive-
Scale Per-DMW Dispatch Substrate for ENTERPRISE Wallets; Status
Proposed 2026-05-16) lands the substrate-architectural canonical for
hive-scale per-DMW dispatch substrate that delivers per-DMW
parallelism at hive scale at runtime for ENTERPRISE wallets at
sub-phase b closure.

13 sub-decisions all locked at α-default per Q-A through Q-G at
canonical-knowledge register substantively informed by 5 rounds of
research at canonical Elixir/BEAM register substantively:

- Sub-decision 1: per-DMW GenServer via Horde Registry + Horde
  DynamicSupervisor (Discord precedent; CRDT-based distributed
  Registry + handoff on node failure).
- Sub-decision 2: cosmp_router pure-module refactor at single-source-
  of-truth register (NEW `CosmpRouter.Operations` module; Elixir
  anti-pattern resolution).
- Sub-decision 3: DMWWorker COSMP op handlers invoking
  `CosmpRouter.Operations` primitives at module-level register.
- Sub-decision 4: NEW `CosmpRouter.WalletLookup` module (per-request
  indexed point-lookup inherited from ADR-0036).
- Sub-decision 5: NEW ETS read-optimized cache at
  `apps/cosmp_router/lib/cosmp_router/wallet_cache.ex`
  (read_concurrency + write_concurrency + decentralized_counters).
- Sub-decision 6: COSMP protobuf envelope extension with optional
  entity_id field across 7 op request messages.
- Sub-decision 7: tier-routed dispatch shim at `grpc/server.ex`
  (ENTERPRISE through DMWWorker via Horde Registry;
  PERSONAL/AI_AGENT/DEVICE through cosmp_router unchanged).
- Sub-decision 8: ENTERPRISE-only scope at sub-phase b register.
- Sub-decision 9: 7-commit mini-arc decomposition.
- Sub-decision 10: 6 BEAM-compatibility patterns from ADR-0026 §5
  preserved by construction.
- Sub-decision 11: Elixir anti-pattern compliance at canonical-
  knowledge register.
- Sub-decision 12: testability per ADR-0034.
- Sub-decision 13: patent-implementation evidence at canonical
  decision register.

7-commit decomposition per ADR-0039 §Decision Sub-decision 9:

- Commit B.1 `[BEAM-DBGI-HIVE-DISPATCH-ADR]` (this commit) --
  docs-only ADR-0039 NEW + ADR-0028 amendments + catalog refreshes.
- Commit B.2 `[BEAM-COSMP-OPERATIONS-PURE-MODULE]` (forward-substrate)
  -- NEW `apps/cosmp_router/lib/cosmp_router/operations.ex` + MOD
  `apps/cosmp_router/lib/cosmp_router/router.ex` + NEW unit tests.
- Commit B.3 `[BEAM-DBGI-HORDE-SUBSTRATE]` (forward-substrate) --
  NEW Horde Registry + Horde DynamicSupervisor supervised children
  at DbgiSupervisor + Horde dependency at mix.exs + NEW public API +
  NEW unit tests.
- Commit B.4 `[BEAM-DBGI-WALLET-LOOKUP-CODE]` (forward-substrate) --
  NEW `apps/cosmp_router/lib/cosmp_router/wallet_lookup.ex` + NEW
  unit tests.
- Commit B.5 `[BEAM-DBGI-WALLET-CACHE-ETS]` (forward-substrate) --
  NEW `apps/cosmp_router/lib/cosmp_router/wallet_cache.ex` +
  supervised ETS table + NEW unit tests.
- Commit B.6 `[BEAM-DBGI-HIVE-DISPATCH-INTEGRATION]`
  (forward-substrate) -- MOD `apps/cosmp_router/proto/cosmp.proto` +
  MOD `apps/api/src/services/cosmp-client.ts` + MOD
  `apps/dbgi_supervisor/lib/dbgi_supervisor/dmw_worker.ex` with 7
  COSMP op handle_call clauses + MOD
  `apps/cosmp_router/lib/cosmp_router/grpc/server.ex` with tier-
  routed dispatch shim + NEW integration tests.
- Commit B.7 `[BEAM-DBGI-HIVE-DISPATCH-CLOSURE]` (forward-substrate)
  -- docs-only closure cascade.

Substrate-state ground truth register: sub-phase b mini-arc IN
FLIGHT at this commit; cosmp_router single-GenServer pattern at HEAD
866e328 substantively refactors at Commit B.2 register to pure-
module primitives at single-source-of-truth register; per-DMW
parallelism at hive scale for ENTERPRISE tier delivers at runtime
at Commit B.6 closure register; sub-phase b mini-arc closes at
Commit B.7 closure cascade. Phoenix.PubSub hive fanout substrate +
Broadway pipeline at high-throughput register + hive algorithm at
weighting architecture per Entry #28 substantively forward-substrate
at sub-phase c + sub-phase d + sub-arc 2 register substantively at
canonical-state register substantively.

---

## Section 1 — One-paragraph summary

NIOV Foundation is the **AI Memory Governance Substrate** — the
patented infrastructure layer between language models and enterprise
institutional memory. The **Contextual Orchestration and Scoped
Memory Protocol (COSMP)** governs seven primitive operations on AI
memory; the **Decentralized Memory Wallet (DMW)** holds that memory
as cryptographically-governed capsules owned by the enterprise.
Foundation is **deployment-target agnostic** (managed cloud,
sovereign cloud, on-premise, air-gapped) per ADR-0018, **post-quantum-
ready by primitive selection** per ADR-0019, and runs underneath
**Otzar** (the first canonical application) and any future
enterprise or government applications. Three issued US patents
protect the architecture: **12,164,537** (Dec 2024), **12,399,904**
(Aug 2025), **12,517,919** (Jan 2026).

---

## Section 2 — Authoritative document hierarchy

| Document | Authority |
|---|---|
| ADRs 0001-0022 (`docs/architecture/decisions/`) | **CANONICAL** for architectural decisions |
| `origin/main` code | **CANONICAL** for substrate state |
| `CLAUDE.md` (repo root) | **CANONICAL** operator-facing reference |
| `docs/CURRENT_BUILD_STATE.md` (this document) | **CANONICAL** persistent build state |
| Patched S9-S17 Build Guide | **AUTHORITATIVE** for §9-§17 scope |
| Section 12 standalone Build Guide | **AUTHORITATIVE** for Section 12 sub-section management |
| `docs/reconciliation/2026-05-08-build-reconciliation.md` | **POINT-IN-TIME EVIDENCE** of authoritative hierarchy establishment |
| Original 12-section Foundation MVP Build Guide | **HISTORICAL ARTIFACT**; superseded |
| Strategic positioning docs (Manifesto, team memo, Homepage Copy) | **AUTHORITATIVE** for positioning |
| Otzar PRD | **PARTIALLY SUPERSEDED**; see reconciliation §6 |

---

## Section 3 — Build state by section

| § | Title | Status |
|---|---|---|
| 1 | Data Foundations | ✓ COMPLETE |
| 2 | Authentication | ✓ COMPLETE |
| 3 | COSMP Protocol | ✓ COMPLETE |
| 4 | COE | ✓ COMPLETE |
| 5 | Hive Intelligence | ✓ COMPLETE |
| 6 | Monetization Engine | ✓ COMPLETE |
| 7 | Compliance Router | ✓ COMPLETE |
| 8 | API Gateway | ✓ COMPLETE |
| 9 | Foundation Governance + Dandelion + Domain Seeding | ✓ CLOSED at `4027208` |
| 10 | Seven Feedback Loops | ✓ CLOSED at `298c0ad` |
| 11 | Otzar Conversation + Context Priming + Observation | ✓ CLOSED at `6b43bbd` |
| 12 | Control Tower Connection | **IN FLIGHT** (see Section 4) |
| 13 | Final Testing + Investor Demo | NOT STARTED |
| 14 | Autonomous Execution + Proactive Behaviors | NOT STARTED |
| 15 | Enterprise Hardening + Compliance | NOT STARTED |
| 16 | Otzar Product Completeness | NOT STARTED |
| 17 | Intelligence Engine — Full 6-Layer Stack | NOT STARTED |

**Cross-cutting substrate-architecture canonicalization work
(not numbered Sections; substrate-architecture register):**

- **Track A (test infrastructure isolation; 18 gates + REVISED
  Gate 2):** SUBSTANTIVELY COMPLETE on origin/main. Gate 1
  architectural lock `d728cd4` (2026-05-06) → Gate 8e `e829644`
  → Gate 8c `bea1b33` → Gate 8d `2fc025a` → Gate 9 `c399980` →
  Gate 8f `47d8596` → Gate 8h `c1b3d02` → Gate 10 `b1c02d4`
  (@v6/@v7 toolchain) → Gate 8g `95f4aca` (bcrypt 5→6) →
  TRACK-A-RULE-19 `75a90de` (ADR-0020 + RULE 19 canonicalization)
  → REVISED Gate 2 `5be42e5` (Colima canonicalization; ADR-0013
  amendment per RULE 13 substrate-state drift correction).
- **RAA 12.8 substrate-architecture canonicalization (14-commit
  chain; Sections 1-10 enumerated):** COMPLETE on origin/main.
  Outline `10ef10f` → §1 `78e376a` → §2 `a2335cd` → §3 `582216e`
  → §4 `271e9cc` → §5 `5eb3f49` → §6 `2148bfe` → §7 `1fa1c12` →
  §5.8 amendment chain (`604aac6` + `2cced88` + `127a383`) → §8
  `00d86a1` → §9 `7bb52a6` → §10 `e31f948` (canonical record
  closure per §9.6 Step 2D-completion handoff discipline).
- **Pre-RAA-12.8 ADR cluster (3 commits; 2026-05-10):**
  [GLOSSARY-G-3] `74b2765` + ADR-0021 `ba3ef11` (Capsule Type
  Extension Protocol) + ADR-0022 `3c2eb99` (combined_score
  Formula Canonicalization).

---

## Section 4 — Section 12 sub-section status

Per Section 12 standalone Build Guide.

| Sub-§ | Title | Status |
|---|---|---|
| 12A | Scaffolding · Auth · 16-screen layout | ✓ CLOSED — otzar-control-tower @ `b08881b` (4 tests) |
| 12B.0 | Foundation: audit_event_id surfacing | ✓ CLOSED — niov-foundation @ `6151812` (439 + 1 skipped) |
| 12B.1 | Frontend foundation lock-in | ✓ CLOSED — otzar-control-tower @ `9140220` (6 tests) |
| 12B.2 | Home extension + Users + Invite Wizard | ✓ CLOSED — otzar-control-tower @ `16bd02d` (8 tests) |
| 12B.3 | AI Teammates screen | ✓ CLOSED — otzar-control-tower @ `b4f17e2` (10 tests) |
| 12B.4 | Access Control matrix · 12B close | ✓ CLOSED — otzar-control-tower @ `0a28f90` (12 tests) |
| 12C | Playground · Intelligence dashboard | **→ BUILD NEXT** (target 14 tests + Foundation extensions) |
| 12D | Data & Knowledge · Security & Audit · Analytics · Conversations · Workflows | → BUILD (target 17 tests + Foundation extensions) |
| 12E | Policies · System Health · Settings | → BUILD (target 19 tests + Foundation extensions) |
| 12F | Onboarding wizard · Documentation · a11y · Playwright · Section 12 close | → BUILD (target ~22 tests) |

**otzar-control-tower HEAD:** `0a28f90` (closes 12B).
**niov-foundation HEAD:** `5be42e5` ([TRACK-A-G2] Gate 2
REVISED — Colima canonicalization).

**Section 12.5 sub-box framing (per `docs/reference/section-12-
progress.md`):**

| 12.5 Sub-box | Status | Description |
|---|---|---|
| 12.5 Sub-box 1 (EscalationRequest + dual-control) | **UNBLOCKED** | Foundation primitive previously blocking Bucket B; Track A complete; **Phase 2 primary engineering scope candidate**. Substrate-architecture coverage at RAA 12.8 §5.2 + §5.9 item 1 (D-2D-D10 closure) + Section 14 admin-tooling box (TODO comment framing at `apps/api/src/services/otzar/priming.ts:131-134`). |
| 12.5 Sub-box 2-9 | QUEUED | Dependency-ordered post Sub-box 1 (Sub-box 2 privileged action audit chain + Sub-box 5 GDPR Article 17 pseudonymization + Sub-box 7 verifiable-credentials + compliance attestation). |

Sub-box 1 = D-2D-D10 closure = unified engineering territory
at intersection of 4 framing registers (RAA 12.8 §5.2 + Section
12.5 Sub-box 1 + §5.9 item 1 + Section 14 admin-tooling box).
Single substantive engineering scope per Phase 2 today's
selection.

---

## Section 5 — Track A gate inventory

**Closed gates:**

| Gate | SHA |
|---|---|
| Track A Lock (ADRs 0011/0012/0013) | `d728cd4` |
| Gate 3a (Containerized Postgres) | `081d35e` |
| Gate 3 ADR (ADR-0014 supersedes ADR-0012) | `2a14dec` |
| Gate 3b (FixtureBasedLLMProvider + 10 fixtures) | `16b4482` |
| Gate 4 (Tier configs + npm scripts) | `925761d` |
| Gate 5a (Foundational substrate) | `c5c8b00` |
| Gate 5b (Consumer adoption + 3-tier verification) | `9260c53` |
| G5b-I Resolution | `fbc7942` |
| Gate 6 (Reproducibility verification; ADR-0011 amendment) | `cae8cf4` |
| Gate 7-pre | `e8a559e` |
| Gate 7 (CI workflow architecture; ADR-0015) | `78cf1b5` |
| Gate 7-post (Drift G7-E fix) | `9f8e909` |
| Gate 7-post-2 (Drift G7-PRE-C fix) | `2fbc057` |
| ADR-0016 (Pin-and-Optimize Framework) | `782154c` |
| ADR-0017 (Production Discipline) | `444cf56` |
| Gate 8a (ADR cross-citation back-references) | `3febf83` |
| Gate 8b (CLAUDE.md update) | `3a571fb` |
| ADR-0018 (Deployment-Target Agnosticism Posture) | `657a794` |
| ADR-0019 (Cryptographic-Suite Posture) | `7216784` |
| DOCS-ALIGN (FIPS_DEPLOYMENT_POSTURE.md) | `38d941f` |
| Gate 8b-amendment | `7269a7a` |
| Gate 8e (ADR-0016 amendment) | `e829644` |
| BUILD-RECONCILIATION + CANONICAL-REFERENCE | `95ad861` |
| Gate 8c (testing.md + onboarding.md) | `bea1b33` |
| Gate 8d (algorithm-literal cleanup) | `2fc025a` |
| RAA 12.7 (Dynamic Flow Architecture) | `0fd8da7` |
| Gate 9 (architectural framing integration) | `c399980` |
| Gate 8f (fast-uri 3.1.0→3.1.2 npm overrides) | `47d8596` |
| Gate 8h (canonical reference refresh) | `c1b3d02` |
| Gate 10 (GitHub Actions toolchain @v6/@v7) | `b1c02d4` |
| Gate 8g (bcrypt 5→6 closes 8x cluster) | `95f4aca` |
| TRACK-A-RULE-19 (ADR-0020 + RULE 19 canonicalization) | `75a90de` |
| GLOSSARY-G-3 (32 canonical-grade vocab entries) | `74b2765` |
| ADR-0021 (Capsule Type Extension Protocol) | `ba3ef11` |
| ADR-0022 (combined_score Formula Canonicalization) | `3c2eb99` |
| RAA 12.8 Outline (Three surfaces; four corrections folded) | `10ef10f` |
| RAA 12.8 §1 (three canonical framings) | `78e376a` |
| RAA 12.8 §2 (lateral class introduction; 6 lateral zones) | `a2335cd` |
| RAA 12.8 §3 (Surface 1 Scale Architecture; D-2D-D12 closure) | `582216e` |
| RAA 12.8 §4 (Surface 2 Relational Dynamics; D-2C-D2 + D-2D-D9 closure) | `271e9cc` |
| RAA 12.8 §5 (Surface 3 Agentic Coherence; four drifts closed) | `5eb3f49` |
| RAA 12.8 §6 (Cross-Surface Architectural Decisions; six INT-*) | `2148bfe` |
| RAA 12.8 §7 (Active-Learning Informativeness; ADR-0022 amendment path) | `1fa1c12` |
| RAA 12.8 §5.8 Amendment Commit 1 (six EntityType mappings) | `604aac6` |
| RAA 12.8 §5.8 Amendment Commit 2 (Path B-2 18-site body-text amendment) | `2cced88` |
| RAA 12.8 §5.8 Amendment Commit 3 (§5.10 NEW H3 Correction E) | `127a383` |
| RAA 12.8 §8 (Patent-Implementation-Evidence; Zone U2 + three-patent coverage map) | `00d86a1` |
| RAA 12.8 §9 (Forward Implications; 12 drift IDs canonical) | `7bb52a6` |
| RAA 12.8 §10 (References; canonical record closure) | `e31f948` |
| TRACK-A-G2 REVISED (Colima canonicalization; ADR-0013 amendment per RULE 13) | `5be42e5` |

**Chronological substrate-truth canonical at table position per
Zone U2 framing + memory entry #12 cryptographically-timestamped
evidence framing.** DRIFT 9 reconciliation per chronological
ordering: Gate 8e closed 2026-05-07 → Gate 8c closed 2026-05-08
→ Gate 8d closed 2026-05-08 (substrate-truth chronological
ordering canonical at commit chain register; supersedes prior
canonical-record reference orderings).

**Queued:** see Section 6 (PROTECTED-PRIORITY).

---

## Section 6 — PROTECTED-PRIORITY queued work

PROTECTED-PRIORITY queue tracks the two-gate window at the top of
the forward queue: the gate currently in flight (closed at end-of-
commit) and the gate immediately following it. Earlier closures
are tracked in §5 closed-gates table; deeper queue work is tracked
in §12 Recommended Architectural Additions and the Track A gate
plan.

### Track A Gate 8h — Canonical reference refresh (~1 hour)

**Status:** closed at end-of-commit.

**Scope:**

- `CLAUDE.md` §5 + §6 — "as of Track A Gate 8b-amendment" updated
  to "as of Track A Gate 8h"; §6 Track A list operational status
  refreshed (Gate 8b-amendment / 8c / 8d / 8e all marked CLOSED
  with SHAs). §6 historical framing (L348 + L398) preserved per
  Gate 9 D-2 option (c) precedent (contemporaneous accuracy).
- `docs/CURRENT_BUILD_STATE.md` — §4 niov-foundation HEAD updated
  `e829644` → `47d8596`; §5 closed-gates table appended with 6
  missing entries (BUILD-RECONCILIATION `95ad861`, Gate 8c
  `bea1b33`, Gate 8d `2fc025a`, RAA 12.7 `0fd8da7`, Gate 9
  `c399980`, Gate 8f `47d8596`); §6 rotated to Gate 8h
  closed-at-end-of-commit + Gate 8g queued; §8 test surface
  counts updated (Unit 370 → 371; Total 482 → 483; CI run
  25539791355 → 25611252522); §9 cross-repo niov-foundation HEAD
  `e829644` → `47d8596`.
- `.github/workflows/ci.yml` L63 — unit-tier job name label
  `(370 tests)` → `(371 tests)`. Cosmetic display only; vitest
  runs whatever passes.

**Lineage:** RAA 12.7 (`0fd8da7`) + Gate 9 (`c399980`) + Gate 8f
(`47d8596`) commit bodies all deferred canonical-reference
refresh to Gate 8h. D-G8H-1 substrate-honesty drift surfaced
during Gate 8h investigation: forward "Node.js 20→24" gate
predicted in Gate 8f / Gate 9 / RAA 12.7 commit bodies as
"Gate 8e" conflicted with closed Gate 8e (`e829644` ADR-0016
amendment, immutable record). D-1 resolution: forward
toolchain-modernization gate renamed to Gate 10. Gate 8x family
preserved as security-advisory cluster (8a/8b-amendment/8c/8d/
8e/8f/8g/8h); Gate 10 starts toolchain-modernization cluster.
Older commit-body forecasts referencing "Gate 8e Node.js 20→24"
become slightly inaccurate predictions but not substrate
violations per origin/main immutability discipline.

**Substrate-discipline alignment:** closes the canonical reference
staleness window opened by 2026-05-08/09/10 commit cycle. RULE
14 (bidirectional citation — §6 entries cite SHAs; SHAs cite §6
via commit-body cross-reference). RULE 13 (drift surfacing —
D-G8H-1 Gate 8e numbering, D-G8H-2 historical framing
preservation, D-G8H-3 last-verified CI run reference, D-G8H-E5
table format substrate-coherence, all surfaced inline before
silent fix).

### Track A Gate 8g — tar/bcrypt 5→6 breaking + remaining audit advisories (~2-3 hours; dedicated session)

**Status:** queued.

**Scope:**

- `tar` 5→6 transition (HIGH-severity advisories: hardlink path
  traversal, symlink poisoning, race condition on macOS APFS,
  drive-relative linkpath, etc. — 6 advisories total).
- `bcrypt` 5→6 transition (depends on `@mapbox/node-pre-gyp` →
  `tar` chain; bcrypt is critical password-hashing surface and
  the major-version migration affects auth code paths).
- Remaining `esbuild` advisory (moderate; dev-tree via
  `vitest`/`vite`/`vite-node`/`@vitest/mocker` chain — separate
  evaluation: dev-only surface vs production vulnerability).
- `npm audit fix --force` would auto-bump but introduces
  `vitest@4.1.5` breaking change; substrate-honesty
  investigation of impact required first.

**Lineage:** Gate 8f (`47d8596`) cleared 2 fast-uri advisories
non-breakingly; tar/bcrypt remaining HIGH-severity advisories
require breaking upgrades and dedicated fresh-sharpness session
per Gate 8f commit body and operator session-opening queue.

**Substrate-discipline alignment:** ADR-0016 Pin-and-Optimize
Framework (security-patch-cadence axis applies; whether to bump
bcrypt 5→6 also touches PQC migration trajectory per ADR-0019).
ADR-0017 Production Discipline (nine-step template applies to
breaking dependency upgrade — frame the drift, distinguish
observation/inference, verify empirically before fix design).
8x security-advisory cluster closes with Gate 8g.

---

## Section 7 — ADR inventory

All 22 ADRs at `docs/architecture/decisions/`. Substrate-discipline
canonical reference quartet **bolded** (ADR-0016/0017/0018/0019).
ADR-0020/0021/0022 added as independent ADR cluster at different
substrate registers (IP-discipline + extension-protocol +
scoring-formula vs substrate-discipline-canonical).

| ADR | Title |
|---|---|
| 0001 | Three-wallet architecture |
| 0002 | Append-only audit chain with BEFORE DELETE trigger |
| 0003 | Frozen-config tamper anchors |
| 0004 | Service-owned auth gate pattern |
| 0005 | No `console.*` in `apps/api/src` (DRIFT 2 Option C) |
| 0006 | Cross-org leak prevention via filter narrowing |
| 0007 | Manual bearer auth for `/compliance/*` endpoints |
| 0008 | `EntityComplianceProfile` is org-level, not aggregated |
| 0009 | COSMP 7-operation enumeration (locked per US 12,517,919) |
| 0010 | Foundation tests are legitimately slow (90-110 min) |
| 0011 | Three-tier test stratification |
| 0012 | Test-mode LLM provider hardening |
| 0013 | Containerized Postgres for unit and integration tiers |
| 0014 | FixtureBasedLLMProvider key-based dispatch (supersedes 0012 dispatch) |
| 0015 | CI Workflow Architecture |
| **0016** | **Pin-and-Optimize Framework** (substrate-pinning canonical reference) |
| **0017** | **Production Discipline** (substrate-investigation canonical reference) |
| **0018** | **Deployment-Target Agnosticism Posture** (substrate-portability canonical reference) |
| **0019** | **Cryptographic-Suite Posture** (substrate-cryptographic-resilience canonical reference) |
| 0020 | Two-Register IP Discipline (IP-discipline register; protected-name boundary + RULE 19 canonical at canonical-record register) |
| 0021 | Capsule Type Extension Protocol (extension-protocol register; CapsuleType enum extension pattern + SUBSTRATE_OBSERVATION territory) |
| 0022 | combined_score Formula Canonicalization (scoring-formula register; frozen-anchors family per INT-6; informativeness coefficient extension path per RAA 12.8 §7.4) |

---

## Section 8 — Test surface current state

| Tier | Count | Last verified |
|---|---|---|
| TypeScript unit | 508 / 508 | verified at HEAD c1ee061 pre-flight surface; CI run reference forward-queued at substrate-state register |
| TypeScript integration | 198 + 1 skipped | verified at HEAD c1ee061 pre-flight surface; CI run reference forward-queued at substrate-state register |
| Elixir cosmp_router default | 137 / 0 | verified at HEAD c1ee061 pre-flight surface; CI run reference forward-queued at substrate-state register |
| Elixir dbgi_supervisor default | 42 / 0 (19 excluded) | verified at HEAD c1ee061 pre-flight surface; CI run reference forward-queued at substrate-state register |
| Elixir dbgi_supervisor integration | 19 / 0 | verified at HEAD c1ee061 pre-flight surface; CI run reference forward-queued at substrate-state register |
| LLM-required nightly | (verify count when nightly runs) | (verify) |
| **Total** | **904 + 1 skipped** | verified at HEAD c1ee061 pre-flight surface; CI green at every substrate landing on origin/main |

Test count timeline reference: see
`docs/reconciliation/2026-05-08-build-reconciliation.md` Section 5
(311 → 482 across Sections 9, 10, 11, 12B Foundation, and Track A
Gate substrate work). Subsequent growth landed across BEAM Phase 2
(sub-phases 10-13), CAR Sub-box 3 mini-arc (7 sub-phases adding
REGULATOR + LawfulBasis + audit chain canonical_record/1 12→14
extension + 23 + 18 integration tests + 32 unit tests), and CAR
Sub-box 2 mini-arc (6 sub-phases adding jurisdiction tagging +
service helpers + COSMP enforcement + REGULATOR integration + 17
unit + 20 + 7 integration tests).

---

## Section 9 — Cross-repo state

| Repo | Role | HEAD |
|---|---|---|
| niov-foundation | Substrate (Foundation) | `5be42e5` (2026-05-11; [TRACK-A-G2] Gate 2 REVISED) |
| otzar-control-tower | Otzar Control Tower frontend | `0a28f90` (2026-05-05; closes 12B) |

**Cross-repo discipline** (per Section 12 standalone Build Guide):
"Foundation extensions land first as separate commits with their own
tests. Frontend lands second consuming the new contract."

Canonical Section 12B-Foundation extension commits on niov-foundation:
`6151812` (audit_event_id surfacing) → `ca6e982` (skill assignment
audit) → `ee4dafb` (AI Teammate detail read with cross-tenant
fail-closed).

---

## Section 10 — Authoritative architecture summary

**Foundation = the substrate** (memory governance + protocol +
execution control).

**COSMP = 7-operation protocol** (locked per ADR-0009 +
US 12,517,919):

1. AUTHENTICATE
2. NEGOTIATE
3. READ (2-step: metadata + content)
4. WRITE (owner + attributed)
5. SHARE
6. REVOKE
7. AUDIT

**DMW = Decentralized Memory Wallet** (3 wallet types per ADR-0001):

- Personal (institutional memory; portable with employee)
- Enterprise (zero-payload aggregation; org wallet)
- Device (per-device memory)

**Capsule structure (7 layers):** Payload, Metadata, Rules,
Relations, Time, Permissions, Audit.

**Substrate properties:**

- Deployment-target agnostic per ADR-0018.
- Post-quantum-ready by primitive selection per ADR-0019.
- Append-only audit chain per ADR-0002 (BEFORE DELETE trigger).
- Service-owned auth gate per ADR-0004.
- Cross-org leak prevention enforced runtime per ADR-0006.
- FIPS-deployment posture documented in
  `docs/FIPS_DEPLOYMENT_POSTURE.md`.

**Substrate-adjacent products:**

- **Otzar** = first canonical application built on Foundation.
- **Otzar Control Tower** = admin / governance UI for Otzar
  (16 screens; sub-sections 12A through 12F).
- Future applications: enterprise + government tier.

**Patent stack** (all personally held; NIOV Labs licenses):

- US 12,164,537 (Dec 2024) — ABT database / file management.
- US 12,399,904 (Aug 2025) — alert manager + TARs continuation.
- US 12,517,919 (Jan 2026) — COSMP / DMW continuation.

**Substrate-architecture canonicalization (RAA 12.8; 2026-05-11):**

RAA 12.8 substrate-architecture canonicalization complete on
origin/main at `e31f948` ([RAA-12.8-S10]; final commit in 14-commit
RAA 12.8 chain). Substrate-architecture coverage at three-patent
register canonical per §8.3 coverage map. Step 2D substrate-
architecture canonicalization complete per §9.6 handoff discipline;
Step 2E engineering work surface + Step 2F glossary refresh
handoff per coordinated architectural-engineering discipline.
Section 12.5 Sub-box 1 (EscalationRequest + dual-control middleware;
D-2D-D10 closure per §5.9 item 1) unblocked per Track A complete;
Phase 2 primary engineering scope candidate.

---

## Section 11 — Compliance + government-grade scope

### Implemented

- 7 framework seeds (per Build Guide §7): HIPAA, GDPR, CCPA,
  FedRAMP_Moderate, FERPA, SOC2, CMMC.
- `runComplianceChecks` injected into COSMP pipeline.
- Append-only audit chain with cryptographic enforcement per
  ADR-0002.
- TAR hash invalidation on session change per Section 1F /
  ADR-0001 family.
- Post-quantum-ready cryptographic posture per ADR-0019.
- Deployment-target agnosticism per ADR-0018 (sovereign cloud,
  on-prem, air-gapped, managed cloud).
- Section 12.5 Compliance Architecture Review (commit `9671776`)
  covered 24 dimensions and 6 patent claim families. Output:
  `docs/COMPLIANCE_ARCHITECTURE_REVIEW.md`.
- Structured logging schema documented in
  `docs/STRUCTURED_LOGGING_SCHEMA.md`.
- Audit retention posture documented in
  `docs/AUDIT_RETENTION_POSTURE.md`.
- FIPS deployment posture documented in
  `docs/FIPS_DEPLOYMENT_POSTURE.md`.

### Queued (Phase 2)

- **Section 15:** Enterprise Hardening + Compliance (per Patched
  Build Guide).
- **CNSA 2.0 attestation** (per ADR-0019 PQC-readiness framing;
  follow-on after Phase 2).
- **NIST SP 800-53 control mapping** (subset already implicit per
  Section 12.5 review; explicit mapping queued).
- **FedRAMP High vs Moderate distinction** — Build Guide §7 seeds
  Moderate; High requires additional posture.
- **Continuous compliance reporting endpoints** — verify which
  dimensions remain open per Section 12.5 review.

---

## Section 12 — Recommended Architectural Additions

Six forward-tracked architectural additions surfaced during the
2026-05-08 session. Each is captured here for dedicated future-session
investigation + design + ADR. **None are designed today;** this section
captures scoped concerns + research-grounded framings.

### 12.1 Multi-tenant federation architecture

**Concern:** Enterprise customers like Nike (with Nike USA, Nike
Japan, Nike Dubai as separate legal entities) need separate
sovereign data per tenant + admins + employees, with optional
consent-gated parent-org roll-up intelligence.

**Current state:**

- Foundation has organization-scoped entities, RBAC infrastructure,
  audit-chain enforcement, cross-org leak prevention (ADR-0006).
- Single-org multi-entity is built.
- Cross-org isolation is built.
- Cross-tenant federation (consent-gated parent-org intelligence) is
  NOT yet built.

**Research findings (2026-05-08):**

- Salesforce uses single shared multitenant database + multitenant
  kernel + OrgID partitioning at every query layer.
- Salesforce Hyperforce overlay provides per-region data residency
  (US / EU / UK / Germany / India / Japan / UAE / etc.).
- Salesforce treats Nike-USA / Nike-Japan / Nike-Dubai as separate
  ORGS within their respective regional Hyperforce instances.
- Industry assessment: "Hyperforce provides data residency at the
  country level, but does not natively support country-specific data
  isolation within a single org. Multinational enterprises must
  carefully consider their approach to data residency and
  cross-border data flows."
- Three-tier multi-tenant model categories: shared database / shared
  schema; shared database / separate schemas; separate databases per
  tenant.

**Recommended architecture for Foundation:**

- Per-region Foundation deployments for sovereign data residency
  (matches Hyperforce regional pattern).
- Within each regional deployment: multi-tenant kernel with strong
  tenant isolation (each subsidiary = own tenant, OrgID partitioning,
  RBAC + ABAC enforcement).
- Optional federation layer for parent-organization roll-up
  intelligence with explicit per-tenant consent gates and audit
  trails.

This is stronger than Salesforce's current native offering.
**Differentiator opportunity.**

**Recommended addition:** NEW ADR + scope work. Likely substantial
implementation cycle.

### 12.2 Capsule + COSMP + DMW interconnection map

**Concern:** Bilateral relationships between capsules, COSMP
operations, and DMW wallets are documented across multiple Build
Guide sections (1, 3, 5) but not surfaced as a single coherent
picture. The governance topology (how capsules flow through COSMP
operations within DMW boundaries) needs unified documentation.

**Current state:**

- Substrate is built (Sections 1, 3, 5 closed).
- `docs/reference/architectural-anchors.md` referenced in CLAUDE.md
  but flagged as having "mild secondary drift" deferred to Sub-box 7
  work.
- No single canonical interconnection map exists.

**Recommended addition:** Documentation work only. Single canonical
document showing full lifecycle:

- Capsule creation → 7-layer assembly → wallet assignment.
- COSMP 7 operations operating on capsules.
- DMW 3 wallet types holding capsules.
- Bilateral relationships: capsule ↔ wallet ↔ entity ↔ governance.
- Cross-references to ADRs and Build Guide sections.

**Effort:** ~2-4 hours documentation. No new substrate work
required.

### 12.3 Digital twin behavior specification

**Concern:** Specific agent behaviors not yet fully specified:

- Listeners + click-watching + workflow learning.
- Permission temporality model (short-term, long-term, indefinite).
- Cross-departmental collaboration rules (when does Twin A from
  Marketing get to ask Twin B from Engineering for context, governed
  by what?).
- After-hours autonomous operation with deferred permission
  requests.
- Federated learning across twins within an org.
- Twin portability when employee changes companies.

**Current state:**

- Section 11 (Otzar Conversation + Context Priming + Observation) —
  CLOSED (observation pipeline built).
- Section 14 (Autonomous Execution + Proactive Behaviors) —
  NOT STARTED.
- Section 16 (Otzar Product Completeness — federated learning, twin
  portability) — NOT STARTED.
- Section 17 (Intelligence Engine 6-Layer Stack) — NOT STARTED.

Behaviors above are partially in Section 14 / 16 / 17 scope but at
insufficient granularity. Specific gaps:

- Permission temporality model (short / long / indefinite) needs
  explicit ADR.
- Cross-departmental collaboration rules need explicit specification
  (RBAC + ABAC interaction with twin-to-twin requests).
- After-hours autonomous operation with deferred permission requests
  needs specification.

**Recommended addition:** NEW ADR for permission temporality + scope
expansion in Sections 14 / 16. Some new substrate work required
(permission temporality model, twin-to-twin collaboration gateway,
deferred permission queue).

### 12.4 LLM provider partnership architecture

**Concern:** Foundation should be positioned as valuable
intermediary for LLM providers (OpenAI, Anthropic, Google, etc.),
not as competitor. Need explicit architecture for:

- Model-agnostic routing (multi-LLM support per enterprise customer
  choice).
- No-train contractual commitments and technical enforcement.
- PII-stripping pipeline (Foundation produces clean data for LLM
  consumption).
- Allowlist enforcement at gateway (admin-controlled provider
  allowlists).

**Current state:**

- Foundation is LLM-provider-agnostic by design (substrate doesn't
  pick the LLM).
- LLM provider integration patterns not yet architected as explicit
  substrate component.
- PII-stripping happens implicitly via capsule governance but not
  surfaced as discrete pipeline.

**Research findings (2026-05-08):**

- Enterprise LLM gateways (Bifrost, Kong AI Gateway, Cloudflare AI
  Gateway, LiteLLM, OpenRouter) all emerging in 2026.
- 2026 enterprise procurement standards: GPAI deployer transparency,
  use-case risk classification, no-train commitments, incident
  notification, model-change notice.
- Anthropic (40% enterprise LLM API spend), OpenAI (27%), others —
  diversifying enterprise LLM stack.
- Industry framing: "Enterprises will no longer ask which LLM to
  use. They'll ask how to build memory that is private, precise, and
  persistent."

**Recommended Foundation positioning:**

- Foundation makes LLM providers deployable in regulated enterprise /
  government environments where they otherwise couldn't go.
- Symbiotic, not adversarial: "We govern; you reason. We bring the
  customers; you bring the capability."
- Foundation = the substrate that makes harnesses, agents,
  applications governable.

**Recommended addition:** NEW ADR for LLM provider integration
architecture + scope work for explicit PII-stripping pipeline +
allowlist gateway component.

### 12.5 Scale architecture (billion-entity / trillion-capsule)

**Concern:** Foundation's correctness-first substrate needs forward
architecture for billion-entity / trillion-capsule / millions-of-
applications scale.

**Current state:**

- Substrate is correct, not yet scaled.
- ADR-0018 codifies deployment-target agnosticism (where) but not
  scale architecture (how big).
- Single-deployment scale ceiling not specified.

**Required architecture:**

- Capsule storage tiering (hot / warm / cold tiers).
- Audit chain partitioning (sharded by tenant or time).
- Capsule index sharding (likely tenant-scoped with cross-shard
  query coordinator).
- Cache invalidation strategy at scale (TAR hash invalidation across
  distributed cache).
- COSMP operation queue (write / audit operations queueable at
  scale).

**Recommended addition:** Scale architecture document (architectural
specification, not yet implementation). Future implementation work
after specification lands.

**Not a YC-readiness blocker.** Path to scale is demonstrable;
implementation is forward work.

### 12.6 Category positioning (AI Memory Governance Substrate)

**Concern:** Foundation is not a harness. It's the substrate that
harnesses run on. Needs explicit category positioning to differentiate
from agent harnesses (Claude Code, OpenClaw-style tools) and from
LLM providers' own moves into agent orchestration.

**Research findings (2026-05-08):**

- "Agent harness" definition: software infrastructure wrapping
  around an LLM, handling tool calls, memory management within
  session, multi-step orchestration.
- Harnesses are per-application infrastructure.
- Foundation is per-enterprise infrastructure (different layer).
- LLM providers all moving up the stack toward agent orchestration
  (OpenAI acquihire of OpenClaw creator signals this).

**Foundation's category claim:**

- "AI Memory Governance Substrate" (technical audience).
- "Supra Infrastructure for Autonomous Enterprises" (strategic
  audience; per Manifesto).
- First canonical implementation of patented protocol (COSMP) and
  storage architecture (DMW) for AI memory governance.
- Salesforce, Microsoft, Google, LLM providers do NOT have substrate
  at this layer — they have application-layer features approximating
  parts of it.

**Differentiators:**

- Patent-protected protocol (COSMP — 3 issued patents).
- Cryptographic memory ownership (enterprise owns wallet; LLM rents
  access).
- Append-only audit chain.
- Post-quantum-ready primitive selection.
- Deployment-target agnosticism.
- Multi-tenant kernel (with federation as Recommended Addition
  12.1).

**Recommended addition:** Strategic positioning document + explicit
category-claim language in CLAUDE.md and canonical reference.
Possibly external positioning materials (whitepaper, technical
brief, investor deck supporting documents).

### 12.7 Dynamic Flow Architecture (CLOSED)

**Status:** CLOSED — landed at commit `0fd8da7` on origin/main
2026-05-09.

**Document:** `docs/architecture/dynamic-flow-architecture.md`
(1,451 lines, 15 sections, 2 Mermaid diagrams).

**Establishes:** Foundation as embodied substrate for AI cognition
— substrate-as-body framing, not substrate-as-brain. Codifies
bilateral-vs-unilateral zone discrimination (4 unilateral / 5
bilateral; default rule: bilateral). Classifies 10 dynamic-flow
capabilities as 5 SUBSTRATE / 2 PARTIAL / 3 NET-NEW. Encodes
qi-and-blood metaphor as architectural anchor; positions Foundation
for the ASI consumer trajectory. Adapts 8 public-domain research
patterns (CRDTs, Attention, Federated Learning, Logical clocks,
Spatial indexing, Active learning, Multi-armed bandits, Multi-source
query parallelism) within Foundation's patent-protected COSMP/DMW
envelope.

**Forward dependency:** RAA 12.2 (static interconnection map; queued)
builds over this dynamic flow foundation, not the other way around.

### 12.8 Substrate Dynamics: Scale, Relational Dynamics, Agentic Coherence (CLOSED)

**Status:** CLOSED — landed at commit `e31f948` ([RAA-12.8-S10];
final commit in 14-commit RAA 12.8 chain) on origin/main 2026-05-11.

**Document:** `docs/architecture/raa-12-8-substrate-dynamics.md`
(2778 lines; 10 H2 + 72 H3 + 261 H4; 14-commit canonical chain).

**Establishes:** Three architectural surfaces of substrate dynamics
canonicalized (Surface 1 Scale Architecture + Surface 2 Relational
Dynamics + Surface 3 Agentic Coherence). Six EntityType mappings
canonical per §5.8 amendment chain (PERSON / COMPANY / AI_AGENT
owning-entity-derived / DEVICE / APPLICATION / GOVERNMENT). §5.10
Correction E NEW substrate territory (substrate-vs-configuration
separation + permission-batching primitives + permission-class
taxonomy + permission-trickle-through-non-human-DMW + auto-grant
authorization + cognitive-load measurement). §8 Patent-
Implementation-Evidence Framing (Zone U2 patent-holder
implementation record substrate + Decision Patent-A defensive
publication strategy + three-patent coverage map: US 12,164,537 +
US 12,399,904 + US 12,517,919 substrate-architecture register).
§9.6 Step 2D-completion handoff discipline (Step 2E engineering
work surface + Step 2F glossary refresh + RAA 12.9 forward
dependency + OPERATOR REVIEW REQUIRED markers).

**Substrate-discipline pattern:** Eleven-consecutive-commit
substrate-honest pre-flight verification pattern operational
across full RAA 12.8 6-commit run (Sections 3-7 + §5.8 amendment
Commit 1 + Path B-2 backwards-propagation Commit 2 + Correction E
Commit 3 + §8 + §9 + §10). Path A discipline (preserve existing
numbering; expand substantively) + Option C discipline (range-
endpoint reference framings for D-2C-D1 + D-2D-D7 per substrate
truth) canonical at §10 References canonicalization.

**Forward dependencies:**
- **RAA 12.9** (Governance & Monetization at Scale; queued) cites
  RAA 12.8 cross-type balance policy as substrate dependency per
  §9.1 forward dependency framing.
- **§9.4 Future RAA candidates:** RAA on Self-Introspection
  Architecture + RAA on Multi-DMW Concurrent Flow + RAA on
  Permission-Class Taxonomy + RAA on Cognitive-Load Measurement +
  RAA on Auto-Grant Authorization (5 candidate territories
  surfaced from RAA 12.8 work; deferred to operator selection).
- **§9.5 ADR amendment paths:** ADR-0021 + ADR-0022 + ADR-0020 +
  ADR-0019 amendment paths + 6 new ADR candidate territories
  surfaced; deferred to operator selection.

---

## Section 13 — Source-of-truth pointers

| Type | Location |
|---|---|
| Architectural decisions | `docs/architecture/decisions/0001-*.md` through `0022-*.md` |
| RAA 12.8 substrate-dynamics canonicalization | `docs/architecture/raa-12-8-substrate-dynamics.md` (landed `e31f948` 2026-05-11) |
| Operator-facing canonical reference | `CLAUDE.md` (repo root) |
| Persistent build state (this document) | `docs/CURRENT_BUILD_STATE.md` (repo root level under docs/) |
| Compliance posture | `docs/FIPS_DEPLOYMENT_POSTURE.md` |
| Compliance Architecture Review | `docs/COMPLIANCE_ARCHITECTURE_REVIEW.md` (landed at `9671776`) |
| Audit retention posture | `docs/AUDIT_RETENTION_POSTURE.md` |
| Structured logging schema | `docs/STRUCTURED_LOGGING_SCHEMA.md` |
| Glossary | `docs/reference/glossary.md` |
| Architectural anchors | `docs/reference/architectural-anchors.md` (note: flagged for Sub-box 7 update) |
| Section 12 progress tracker | `docs/reference/section-12-progress.md` |
| Patched Build Guide PDF | `docs/NIOV_Master_Build_Guide_S9_S17_Patched.pdf` (gitignored, working reference) |
| Section 12 Build Guide (text) | `~/Desktop/NIOV Labs/github/builddocs/NIOV_Section_12_Build_Guide.txt` (working reference, not in repo) |
| Original 12-section Foundation MVP Build Guide | `~/Desktop/NIOV Labs/Otzar Dev/NIOV_Foundation_MVP_Build_Guide.txt` (historical artifact, not in repo) |
| Strategic positioning docs | `~/Desktop/NIOV Labs/Otzar Dev/` (pre-quartet, architecturally consistent, not in repo) |
| Reconciliation evidence | `docs/reconciliation/2026-05-08-build-reconciliation.md` |

---

## Section 14 — Update protocol

This document is the persistent canonical reference. **Update
conditions:**

- After any Section close → update Section 3 status.
- After any Track A gate close → update Section 5.
- After any new ADR landed → update Section 7.
- After any Recommended Architectural Addition gets designed and
  lands as ADR or scope → move from Section 12 to Section 7 +
  Section 5.
- After any major scope change → update Section 1 one-paragraph
  summary if needed.
- After any sub-section close on otzar-control-tower → update
  Section 4.
- After any test count change → update Section 8.

Updates are commit-tracked changes to this document. Future Claude
Code sessions should view this document at session start before any
work begins.

**Companion documents that may also need updates:**

- `CLAUDE.md` — when RULES change or when a new ADR is added (RULE
  14 bidirectional citation discipline).
- `docs/reference/section-12-progress.md` — when Section 12
  sub-sections advance.
- ADR back-citations — RULE 14 requires bidirectional citation
  closure within the same commit.
