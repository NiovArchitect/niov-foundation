# ADR-0026: Dual-Control Middleware Pattern + Privileged Endpoint Registry + Per-Route Binding Discipline

**Status**: Active
**Date**: 2026-05-12
**Trigger**: Sub-box 2 Phase 1 architecturally required a substrate that
gates LIVE privileged endpoints (`PATCH /api/v1/platform/monetization/config`,
`POST /api/v1/platform/orgs`) with second-approver verification, audit-chain
integration, and forward-compatibility with the Sub-box 2 Phase 2 Elixir/BEAM
coordination layer. `COMPLIANCE_ARCHITECTURE_REVIEW.md` Tension 3 ("Multi-person
integrity (1.5) vs Operational velocity") canonicalized the architectural
decision — an *enumerated dual-control set, not a general primitive* — but no
runtime substrate existed. This ADR bundles the substrate the 10-commit
Sub-box 2 Phase 1 arc (sub-phases A→J) builds: the runtime registry, the
`requireDualControl` Fastify preHandler, and the per-route binding discipline.

## Context

The COSMP protocol keeps humans permanently in control of what AI can know
(RULE 0 — the Foundation Rule). A subset of platform-tier operations — the
70/30 revenue-split mutation; org creation (Dandelion Phase 0) — are
high-stakes enough that a *single* `can_admin_niov` actor should not execute
them unilaterally: they warrant a second human's explicit approval. This is
the "multi-person integrity" requirement of `COMPLIANCE_ARCHITECTURE_REVIEW.md`
Tension 3, reconciled with operational velocity by the *enumerated set*
discipline — dual-control is applied to a small, deliberately-curated list of
operations, not bolted onto every write.

Before this arc, the substrate gap was complete: there was no runtime registry
of privileged endpoints, no middleware that intercepts a privileged request
and verifies a second-approver gate, and no audit-chain wiring for the
verification sequence. The conceptual frame existed (Tension 3; the
`EscalationRequest`/HITL substrate per RAA 12.8 §5.2; the Zone U1 audit-chain
trust root per RAA 12.7 §2.5) but the code did not.

This ADR's substrate is also patent-implementation-record evidence (per
ADR-0020 two-register IP discipline — Register 2, concrete form): every commit
on `origin/main` is contemporaneous evidence of the patent-protected COSMP/DMW
architecture's dual-control gate. The 10-commit arc and this bundling ADR are
the implementation-record register for that gate.

The dual-control substrate has three artifacts (the three-artifact substrate
split, per `docs/architecture/dual-control-operations-canonical-record.md` §1):
the **runtime registry** holds only what the middleware operates on; the
**canonical-record doc** holds the full 8-operation enumeration across 4
categories; the **Tension 3 amendment** is the source-of-substance.

## Decision

The dual-control substrate is the following three artifacts plus a binding
discipline.

**1. Runtime registry — `apps/api/src/security/privileged-endpoints.ts`.**
A type-safe `PRIVILEGED_ENDPOINTS` const (`as const` — import-time-loaded
immutable substrate; the BEAM-pattern-3 posture: state from a durable source)
carrying ONLY the LIVE Category (1) entries — the 2 operations that exist as
Fastify routes today: `PATCH /api/v1/platform/monetization/config` (Operation A —
`PLATFORM_MONETIZATION_CONFIG_UPDATE`) and `POST /api/v1/platform/orgs`
(Operation B — `PLATFORM_ORG_CREATION`), both `can_admin_niov`-gated. An
`isPrivilegedEndpoint(method, route)` type guard (method-sensitive — a matching
route under a different method is NOT a privileged endpoint, preventing an
accidental dual-control bypass via method substitution). A
`dualControlDescription(actionType) => \`DUAL_CONTROL:${actionType}\`` helper —
the exact-match carrier of the action-descriptor type in the `EscalationRequest`
`description` column (the model has no `details` JSON column; the canonical
record §3 step 3 anticipated this — "action descriptor match via description or
a future action field").

**2. Fastify preHandler middleware — `apps/api/src/middleware/dual-control.middleware.ts`.**
A factory `requireDualControl(endpoint: PrivilegedEndpoint)` returning an async
preHandler bound to that descriptor (the descriptor is the binding-time input,
the request the call-time input — mirroring the `requireAdminCapability(authService,
capability)` factory pattern; no Fastify v5 `request.routeOptions.url` runtime
dependency, and method-substitution coverage already lives at the registry tier).
The preHandler:
- 401 `AUTH_REQUIRED` if `request.auth.entity_id` is absent (hook-ordering guard
  — see the BINDING CONTRACT below);
- writes the Zone U1 `ADMIN_ACTION` audit-event sequence per the canonical
  record §4: `DUAL_CONTROL_VERIFICATION_PRE → DUAL_CONTROL_ESCALATION_LOOKUP →
  (DUAL_CONTROL_APPROVAL_VERIFIED + DUAL_CONTROL_HANDLER_DELEGATED)` on the
  approved path, or `DUAL_CONTROL_HANDLER_DENIED` on the denied path;
  `outcome ∈ {SUCCESS, DENIED}` per the actual `AuditOutcome` enum;
- the read-side check is `findApprovedDualControlForCaller` — the DB read lives
  in the service tier per RULE 9 (the middleware never touches Prisma); the
  authorization decision is the pure transform `evaluateDualControlState(
  callerEntityId, actionDescriptor, foundEscalation) → DualControlOutcome`;
- on `ESCALATION_PENDING` it get-or-creates the PENDING dual-control escalation
  via `getOrCreatePendingDualControlForCaller` (dedup'd — a retrying caller does
  not flood the approver queue; mirrors `createGateEscalationForCaller`) and
  returns 403 with the `escalation_id`;
- on a thrown DB read / audit write (TransientFailure) returns 503 with a
  retry-after hint and a best-effort `DUAL_CONTROL_TRANSIENT_FAILURE` `ERROR`
  audit event — the `DualControlFailure` discriminated union (`TransientFailure |
  PermanentFailure`) models the future Elixir supervisor's `{:error, :transient}`
  / `{:error, :permanent}` split.

**3. Per-route binding — `apps/api/src/routes/platform.routes.ts`.**
At the head of `registerPlatformRoutes`, each LIVE privileged endpoint's
descriptor is resolved once from the registry with a throw-guard
(`if (!endpoint) throw new Error(...)` — a substrate-integrity assertion, not a
request-path branch; `PRIVILEGED_ENDPOINTS` is `as const` so the entry provably
exists; the guard fails fast at server boot if the registry ever drifts). The
route's `preHandler` is an array — `[requireAdminCapability(authService,
"can_admin_niov"), requireDualControl(endpoint)]`.

**The BINDING CONTRACT.** preHandler order is load-bearing:
`requireAdminCapability` MUST run first — it populates `request.auth.entity_id`,
which `requireDualControl` reads. A caller lacking `can_admin_niov` gets 403
`ADMIN_CAPABILITY_REQUIRED` from `requireAdminCapability` and `requireDualControl`
never runs (no `DUAL_CONTROL_*` audit events). RULE 5 — authentication →
clearance → permission → conditions.

**The 6 BEAM-compatibility patterns** (per the canonical record §5; chosen so a
future Elixir/BEAM port per ADR-0028 is a port, not a rewrite). They land as
documented structural choices in the middleware:
1. **Message-passing semantics over shared state** — each verification is an
   independent request → outcome transform; no shared mutable state between
   concurrent invocations. Maps to Elixir `GenServer.call/cast`.
2. **Supervisor-friendly failure modes** — failures throw into the preHandler
   `try/catch` and are modelled by the `DualControlFailure` discriminated union
   (`TransientFailure` retryable vs `PermanentFailure` escalate-to-parent).
3. **State reconstructible from durable storage** — no in-memory
   `EscalationRequest` cache; every verification reads current Postgres state.
4. **Event-sourced audit semantics** — the Zone U1 events are immutable
   (ADR-0002 append-only chain + BEFORE DELETE trigger); written as a sequence,
   each with independent causation context; partial sequences on crash are
   acceptable substrate state. The `DUAL_CONTROL_TRANSIENT_FAILURE` marker is
   the §4-adjacent failure-mode event (outside the normal 5-event sequence).
5. **Idempotent verification keys** — the `EscalationRequest.escalation_id` is
   the idempotency key; replaying the same verification yields the same outcome.
6. **Pure transformation over imperative control** — the authorization decision
   is the pure function `evaluateDualControlState`; side effects (DB reads,
   audit writes, reply) are explicit at the edges.

**The `executePhase0` architectural-boundary pattern.** Test setup primitives
that need *an org* (the `createOrgAndAdmin` helpers) bypass the dual-control-gated
`POST /platform/orgs` HTTP route and call the `executePhase0` service function
directly — an org-setup primitive should not depend on the route's auth/dual-control
gates (the architecturally-correct boundary; future-proofs against any further
gates added to that route). See the sub-phase G catch resolution below.

The arc commits (Sub-box 2 Phase 1, sub-phases A→G LIVE; H this commit; I + J
forward):
- A `[SEC-DUAL-CONTROL-ENUM]` `b34c5cf` — `EscalationType.DUAL_CONTROL_REQUIRED`
- B `[SEC-TENSION-3-AMENDMENT]` `6a1a380` — Tension 3 4-category reframe
- C `[SEC-DUAL-CONTROL-CANONICAL-RECORD]` `d42e2a6` — the canonical record doc
- D `[SEC-PRIVILEGED-REGISTRY]` `9628efa` — the runtime registry + 9 unit tests
- E `[SEC-DUAL-CONTROL-MIDDLEWARE]` `3f2f329` — the preHandler + 2 service helpers + 12 unit tests
- F `[SEC-DUAL-CONTROL-BINDING-CONFIG]` `34eea82` — Operation A binding + 7 integration tests
- G `[SEC-DUAL-CONTROL-BINDING-ORGS]` `ceb418f` — Operation B binding + 8 integration tests
- H `[SEC-DUAL-CONTROL-ADR]` (this commit) — this ADR + the cascade
- I `[SEC-CONTRIBUTOR-GOVERNANCE]` — ADR-0027 + RULE 20 + `onboarding-for-engineers.md` (forward)
- J `[SEC-BEAM-FORWARD-SUBSTRATE]` — ADR-0028 (the Elixir/BEAM coordination-layer commitment-to-ship) (forward)

## Implementation Detail

**EscalationRequest lifecycle.** A privileged request with no APPROVED
dual-control escalation for the `(caller, descriptor)` pair gets a PENDING
`EscalationRequest` created (get-or-create — dedup'd on `(source_entity_id,
escalation_type="DUAL_CONTROL_REQUIRED", status="PENDING", description=
dualControlDescription(actionType))`) and a 403 carrying the `escalation_id`.
A second approver `APPROVE`s it via `POST /api/v1/escalations/:id/approve`
(`approveEscalationForCaller` → the `transitionPendingForCaller` skeleton gate:
`caller === target_entity_id || caller === resolved_by_entity_id` may transition;
`source_entity_id` alone cannot self-resolve). The caller re-issues the request;
`findApprovedDualControlForCaller` now finds the APPROVED row; the middleware
delegates to the route handler. The handler then executes the privileged
operation and writes its own audit event (`MONETIZATION_CONFIG_UPDATE` for
Operation A; `DANDELION_PHASE_0_COMPLETE` — the `executePhase0` summary event —
for Operation B).

**Zone U1 audit-event sequence** (canonical record §4): the 5 markers
`DUAL_CONTROL_VERIFICATION_PRE → DUAL_CONTROL_ESCALATION_LOOKUP →
DUAL_CONTROL_APPROVAL_VERIFIED → DUAL_CONTROL_HANDLER_DELEGATED |
DUAL_CONTROL_HANDLER_DENIED`, plus the §4-adjacent failure-mode marker
`DUAL_CONTROL_TRANSIENT_FAILURE` (preHandler `try/catch` path; `outcome:
"ERROR"`; not part of the normal sequence — added to the canonical record §4 in
this commit per the sub-phase E substrate-state observation). `event_type:
"ADMIN_ACTION"` with a `details.action` discriminator (the same pattern the
existing escalation events use); standalone `writeAuditEvent` calls (each its
own transaction — the "independent causation context" framing; there is no
single mutation to bind the sequence to).

**The read/approve split.** The middleware does READ-side verification only —
it confirms an APPROVED dual-control `EscalationRequest` exists. Approver
semantics (the source ≠ resolver / §5.8 skeleton gate) are enforced upstream
at the approve route's service tier (`approveEscalationForCaller` → internal
`transitionPendingForCaller`). The middleware never replicates that gate.

**The `description`-as-carrier substrate.** The `EscalationRequest` model
(`schema.prisma:1106-1132`) has no `details` JSON column — it has `description:
String` and `resolution_metadata: Json?`. The `description` column is the
action-descriptor carrier, keyed by `dualControlDescription(actionType)`
(`DUAL_CONTROL:${actionType}`, exact-match). Both the create-side
(`getOrCreatePendingDualControlForCaller`) and the read-side
(`findApprovedDualControlForCaller`) route through that helper so the write and
the query use identical semantics. A future dedicated `EscalationRequest`
action field would replace this; until then it is the carrier.

**The throw-guard.** `const orgCreationEndpoint = PRIVILEGED_ENDPOINTS.find(
e => e.actionDescriptor.type === "PLATFORM_ORG_CREATION"); if (!orgCreationEndpoint)
throw new Error(...)` at the head of `registerPlatformRoutes` — a
substrate-integrity assertion that fails fast at server boot. `PRIVILEGED_ENDPOINTS`
is `as const`, so the entries provably exist; the guard catches registry drift,
never a runtime branch.

## Consequences

**Easier:**
- Both LIVE Phase-1 privileged endpoints (Operation A `PATCH /monetization/config`;
  Operation B `POST /orgs`) enforce dual-control; the substrate is canonical on
  `origin/main`.
- Adding a new privileged endpoint is mechanical: 1 `PRIVILEGED_ENDPOINTS` entry
  + 1 `preHandler` array element + 1 throw-guard + 1 integration test.
- Full Zone U1 audit-chain integration is verified end-to-end: 9 registry unit
  tests (sub-phase D) + 12 middleware unit tests (sub-phase E, real containerized
  Postgres) + 15 integration tests (sub-phases F + G, real DB, full audit chain).
- The `executePhase0` bypass pattern keeps ~61 dependent tests (the
  `createOrgAndAdmin` helper across `admin-routes.test.ts` / `audit-event-id-surfacing.test.ts`
  / `compliance-state.test.ts`) decoupled from the route's gates.
- The 6 BEAM-compatibility patterns make the Sub-box 2 Phase 2 Elixir/BEAM port
  (ADR-0028) a port, not a rewrite.
- Patent-implementation-record evidence at the Register-2 canonical register
  (ADR-0020): the 10-commit arc + this ADR are the dual-control gate's
  implementation record.

**Harder:**
- **`target_entity_id` placeholder (sub-phase E/G).** The auto-created PENDING
  escalation targets the caller (`target_entity_id = callerEntityId`) as a
  placeholder — the canonical record §3 step 6 specifies "a designated approver
  or the requesting org's admin set", but org-admin-set resolution is
  forward-queued (Sub-box 2 Phase 2). The §5.8 skeleton gate currently allows
  `caller === target` self-resolve. So at Phase 1 the gate is STRUCTURALLY
  present (preHandler binds, the Zone U1 sequence fires, the EscalationRequest
  lifecycle works) but does not yet enforce a *distinct second human* — until
  Phase 2 resolves the org-admin target set. This is not a regression: the prior
  state had no gate at all. The limitation is documented in the file headers
  (`dual-control.middleware.ts` SUBSTRATE-STATE LIMITATION block;
  `getOrCreatePendingDualControlForCaller` JSDoc).
- **`DUAL_CONTROL_TRANSIENT_FAILURE` is a 6th action discriminator beyond the
  canonical record §4's 5.** It is a supervisor-failure-mode marker (BEAM
  pattern 2), reconciled into §4 in this commit as a §4-adjacent marker.

## Substrate-State Catches Resolved

The substantive engineering sub-phases (E/F/G) surfaced 13 substrate-state
catches at pre-flight / pre-edit per RULE 18 + RULE 13 — all caught before any
edits landed:

**Sub-phase E (11 catches):**
- #1 — `transitionPendingForCaller`'s actual gate semantics (`caller === target ||
  caller === resolver` may transition; `source` alone cannot; source-self-resolve
  allowed when `source === target` per §5.8) differ from the idealized "resolver ≠
  source — no self-approval" framing; the middleware does read-side state
  verification only, so this is upstream-enforced.
- #2 — RULE 9: the DB read for an APPROVED escalation is a service function
  (`findApprovedDualControlForCaller`), not a middleware Prisma call.
- #3 — audit-event action discriminators are the canonical record §4
  `DUAL_CONTROL_*` forms, not the idealized `PRE_VERIFICATION` family.
- #4 — Fastify v5 removed `request.routerPath`; resolved via descriptor-as-factory-param
  (no `routeOptions.url` runtime dependency).
- #5 — the unit-tier test uses real containerized Postgres (the `escalation.test.ts`
  pattern), not `vi.mock` (no repo precedent for module-mocking).
- #6 — `description`-as-carrier: the `EscalationRequest` model has no `details`
  JSON column; the `description` column carries the action-descriptor type via
  `dualControlDescription`.
- #7 — `AuditOutcome` enum is `{SUCCESS, DENIED, ERROR}` — no `PENDING`; the
  verification-step events use `outcome: "SUCCESS"`.
- #8 — `TransientFailure` arises from the preHandler `try/catch` around the DB
  read + audit writes, not from the pure `evaluateDualControlState`.
- #9 — `target_entity_id` placeholder (see Consequences above).
- #10 — get-or-create dedup: the denied path must dedup an existing PENDING
  escalation (`getOrCreatePendingDualControlForCaller`), mirroring
  `createGateEscalationForCaller` — prevents approver-queue flooding on retries.
- #11 — the §4-adjacent `DUAL_CONTROL_TRANSIENT_FAILURE` marker (reconciled into
  the canonical record §4 in this commit).

**Sub-phase F (1 catch):**
- #12 — binding `requireDualControl` to `PATCH /monetization/config` breaks the
  pre-existing `admin-routes.test.ts` monetization-config tests (they expect
  422/200 from callers with no APPROVED escalation; the gate now returns 403
  first). Resolved by re-homing that `describe` block into
  `dual-control-binding-config.test.ts`, adapted with pre-approval setup. The
  RULE 18 extension: pre-flight now verifies *all* test files referencing the
  substrate being modified, not just the substrate itself.

**Sub-phase G (1 catch):**
- #13 — `POST /platform/orgs` is a far more central route than `PATCH
  /monetization/config`: it is used as an org-setup primitive via
  `createOrgAndAdmin()` helpers in three integration files (~61 dependent tests),
  not tested in one. Binding `requireDualControl` would have broken all of them.
  Resolved with a 5-file scope: re-home the dedicated route `describe` block (per
  the sub-phase F precedent) + rewire the three setup helpers to call
  `executePhase0` directly (the architecturally-correct boundary). Also corrected:
  the org-creation audit marker is `DANDELION_PHASE_0_COMPLETE` (the `executePhase0`
  summary event), not the non-existent `ORG_CREATION`.

The substrate-honest pre-flight verification pattern (RULE 12 / RULE 13 / RULE
18) operated across the arc; all catches surfaced inline and were resolved with
operator confirmation before edits chained.

## Forward Queue

- **Sub-box 2 Phase 2 — org-admin-set target resolution.** The
  `target_entity_id: callerEntityId` placeholder is replaced with the requesting
  org's admin set (or a designated approver), so the gate enforces a *distinct
  second human*. Phase 2 deliverable.
- **ADR-0028 (sub-phase J) — Elixir/BEAM coordination layer commitment-to-ship
  (LANDED).** The Sub-box 2 Phase 2 Elixir/BEAM COSMP router as a production
  service; the 6 BEAM-compatibility patterns adopted in this ADR's middleware
  substrate make the port mechanical. ADR-0028 landed at sub-phase J
  `[SEC-BEAM-FORWARD-SUBSTRATE]` and back-cites this ADR for the 6 patterns it
  commits to ship — see the "(cited from)" block below; the Phase 2 mini-arc
  (6-8 commits / ~3-4 weeks) ports those patterns to production Elixir/BEAM.
- **`section-12-progress.md` + canonical-record §6 `H ✅ <hash>` cascade.** This
  commit's hash is cascaded into the canonical-record §6 arc-list (`H ✅ <hash>`)
  and the `section-12-progress.md` Sub-box 2 row at sub-phase I (the
  post-commit-hash cascade discipline: each sub-phase cascades the prior
  sub-phase's hash).
- **A future dedicated `EscalationRequest` action field** would replace the
  `description`-as-carrier substrate; until then `dualControlDescription` is the
  carrier.

## Amendment 1 — Phase E Target Resolution for Auto-Created Dual-Control Escalations (Accepted 2026-05-28)

**Status**: Accepted 2026-05-28 · Docs-only design amendment ·
**No code, schema, route, service, middleware, or test change in this
QLOCK.** Authorized by Founder per RULE 20 at
`[ADR-0026-AMENDMENT-1-PHASE-E-TARGET-RESOLUTION-WRITE-AND-ACCEPT-AUTH]`.
Implementation is the explicit scope of a separate next-phase
EXECUTE-VERIFY QLOCK (see §11). This amendment lands the canonical
Phase E target-resolution **policy**; it does not modify the
substrate-state-truth `docs/CURRENT_BUILD_STATE.md`, the implementation
in `apps/api/src/services/governance/escalation.service.ts` +
`apps/api/src/middleware/dual-control.middleware.ts` +
`apps/api/src/security/privileged-endpoints.ts`, or any other ADR
(specifically not ADR-0050 — its §BG.3 prose reconciliation is queued
as a separate amendment per `docs/CURRENT_BUILD_STATE.md` 2026-05-28
refresh).

### 1. Rule 0 substrate correction (current behavior, file:line evidence)

Per Rule 0 — Documentation-First / No-Guessing — the following are
implementation-proven, not architectural intent:

- **GAP-C1 self-approval block is CLOSED at service tier.**
  `apps/api/src/services/governance/escalation.service.ts:397-407`
  enforces `if (callerEntityId === existing.source_entity_id) throw
  new Error("ESCALATION_FORBIDDEN")` *first*, before the
  target/resolver gate. The two-person invariant is intact: a caller
  cannot transition a row whose `source_entity_id` equals their own
  `entity_id`, even when the row's `target_entity_id` is also the
  caller (the §Consequences placeholder).
- **The Phase E target placeholder is LIVE on `main`.**
  `apps/api/src/services/governance/escalation.service.ts:316`:
  `target_entity_id: callerEntityId, // placeholder; Phase 2
  substrate resolves`. The placeholder is also documented in the
  middleware JSDoc at
  `apps/api/src/middleware/dual-control.middleware.ts:38-50`
  ("SUBSTRATE-STATE LIMITATION (sub-phase E)") and in this ADR's
  §Consequences ("Harder") + §Forward Queue.
- **The transition gate is `caller === target_entity_id || caller ===
  resolved_by_entity_id`.** `escalation.service.ts:410-412`. With
  `target_entity_id` set to the caller (placeholder) and
  `resolved_by_entity_id` defaulting to `null` at create-time, the
  only identity that could satisfy `mayTransition` is the caller
  themselves — who is blocked first by GAP-C1.
- **Net consequence is liveness, not self-approval.** Auto-created
  PENDING dual-control `EscalationRequest` rows cannot be approved
  by any independent party via the API. The 4 PRIVILEGED_ENDPOINTS
  (`apps/api/src/security/privileged-endpoints.ts:PRIVILEGED_ENDPOINTS`
  — Operation A `PLATFORM_MONETIZATION_CONFIG_UPDATE`, Operation B
  `PLATFORM_ORG_CREATION`, Operation C `REGULATOR_ACCESS_GRANT`,
  Operation D `REGULATOR_ACCESS_REVOKE`) are **deadlocked in
  practice** under the auto-create path unless an operator manually
  pre-creates a row via `POST /api/v1/escalations` with an explicit
  non-caller `target_entity_id`.
- **The risk this amendment closes is the liveness deadlock, not the
  self-approval risk** (which GAP-C1 has already closed at the
  service tier).

This amendment lands the **target-resolution policy** that, once
implemented in a next-phase EXECUTE-VERIFY QLOCK, replaces the
placeholder at `escalation.service.ts:316` with a real independent
target and removes the deadlock.

### 2. Decision — Phase E Target-Resolution Policy

The canonical Phase E target-resolution policy is the following six
invariants. All six must hold at the implementation tier (next QLOCK)
or the implementation is non-conformant.

**Invariant 1 — Source preservation.** Auto-created
`EscalationRequest.source_entity_id` MUST remain the
caller/requester's `entity_id`. The source is the identity that
initiated the privileged request; it is the source of record and is
already the input to the GAP-C1 self-approval guard at
`escalation.service.ts:406-407`. No part of Phase E may rewrite the
source.

**Invariant 2 — Target independence.** Auto-created
`target_entity_id` MUST be resolved to an independent eligible
approver entity_id that is NOT the caller. Specifically:
`target_entity_id !== source_entity_id` MUST hold at the database
write. This is the structural distinct-second-human invariant; the
service-tier GAP-C1 guard prevents the source from transitioning even
if a later code change accidentally re-introduces a same-identity
target, but the amendment policy is that the target must be
structurally independent **at create-time**, not relied on a
downstream guard.

**Invariant 3 — Resolver null on creation.**
`resolved_by_entity_id` MUST remain `null` at create-time and MUST
only be set when an approver transitions PENDING → APPROVED/REJECTED
(the existing behavior at `escalation.service.ts:439`). Phase E does
not change resolver semantics; it only changes how target is
selected.

**Invariant 4 — Fail-closed on no eligible target.** If the target
resolver cannot identify any independent eligible approver under the
policy below (§3), the middleware MUST fail closed with a clear
error envelope and a Zone U1 audit event. No fallback may silently
target the caller. No fallback may silently allow self-approval. No
fallback may bypass dual-control. The middleware MUST NOT delegate
to the route handler under any fail-closed path.

**Invariant 5 — Deterministic + auditable selection.** The target
resolver MUST be a pure function over `(callerEntityId,
actionDescriptor, repository state)` returning either a single
non-caller `entity_id` or a `null`-class failure. Determinism is
required for testability (BEAM-compatibility pattern 6, pure
transformation, mirroring this ADR §5) and for auditability (Zone U1
events must reproduce the same target on replay).

**Invariant 6 — Policy-bound and org-scoped (no cross-org leak).**
Target candidates MUST be filtered to entities within the caller's
own organisation (for operations with org scope) or within the NIOV
platform admin set (for platform-tier operations). Cross-org
candidates MUST be excluded by construction at the repository query
tier. The amendment policy never widens scope; org-scope guards in
the candidate query are the source-of-truth for cross-org leak
prevention (same architectural anchor as `admin-routes.test.ts:596+`
"DRIFT 9" cross-org leak guard).

### 3. Target-resolution order

The target resolver MUST attempt the following candidate classes in
order. The first class that yields exactly one eligible non-caller
candidate wins; if a class yields zero or ambiguous results, the
resolver advances to the next class. If all classes are exhausted,
the resolver returns the fail-closed result (§Invariant 4).

**Class A — Explicit operation-specific target in the privileged
endpoint metadata.** If the `EscalationActionDescriptor.metadata` for
the matched `PrivilegedEndpoint` carries an explicit target_entity_id
(future-substrate; not present today in `privileged-endpoints.ts`),
the resolver uses that candidate. **Today this class always returns
no candidate** because no current entry in `PRIVILEGED_ENDPOINTS`
carries explicit target metadata; it is documented as the highest
precedence so future operation-specific routing (e.g., per-customer
designated approver) lands cleanly without re-ordering.

**Class B — Org-level eligible approver excluding the caller.** For
operations whose `authTier` is `can_admin_org`, the resolver queries
the caller's organisation for entities holding the required admin
capability (same `authTier` as the matched `PrivilegedEndpoint`),
excluding `entity_id = callerEntityId`. Today **no Category (1) LIVE
entry in `PRIVILEGED_ENDPOINTS` has `authTier = can_admin_org`** —
all 4 LIVE entries are `can_admin_niov`. This class is documented to
land cleanly when org-tier privileged operations enter the registry
(per the canonical-record doc's forward-substrate operations).

**Class C — NIOV platform-admin approver excluding the caller.** For
operations whose `authTier` is `can_admin_niov` (all 4 LIVE entries
today: Operations A/B/C/D), the resolver queries the set of entities
holding `can_admin_niov = true` on their TAR, excluding `entity_id =
callerEntityId`. Selection within Class C uses deterministic
tie-breaking (lowest `entity_id` lexicographically) for testability
+ Zone U1 audit replay parity. The TAR query MUST be the
service-tier read; the middleware MUST NOT touch Prisma per this
ADR's §Decision RULE-9 invariant.

**Class D — Fail closed.** If Class A through Class C all return
zero candidates (e.g., a single-`can_admin_niov` deployment where
the only candidate IS the caller, or a TAR-query failure), the
resolver returns the fail-closed result. The middleware emits the
fail-closed Zone U1 audit event (§7) and returns a 503-class error
to the caller. The privileged route handler is NEVER invoked under
this path.

Class A is documented as highest-precedence (forward-substrate) so
that operation-specific designated-approver semantics can land
without re-ordering. Class C is the production default for all 4
current LIVE PRIVILEGED_ENDPOINTS.

### 4. Operation-tier mapping (the 4 current LIVE PRIVILEGED_ENDPOINTS)

Per `apps/api/src/security/privileged-endpoints.ts:PRIVILEGED_ENDPOINTS`
at HEAD `fee777f` (the 4 Category (1) LIVE entries):

| Op | Endpoint | Action descriptor | Source | Target class | Approver capability | Fail-closed behavior | Audit expectation |
|---|---|---|---|---|---|---|---|
| **A** | `PATCH /api/v1/platform/monetization/config` | `PLATFORM_MONETIZATION_CONFIG_UPDATE` | caller (`callerEntityId`) | Class C (platform-admin) | `can_admin_niov` | 503; no handler invocation; emit fail-closed Zone U1 event | Existing `DUAL_CONTROL_VERIFICATION_PRE → DUAL_CONTROL_ESCALATION_LOOKUP → DUAL_CONTROL_HANDLER_DENIED` sequence + NEW Zone U1 marker (see §7) when target resolution fails |
| **B** | `POST /api/v1/platform/orgs` | `PLATFORM_ORG_CREATION` | caller | Class C | `can_admin_niov` | 503; no `executePhase0`; no Dandelion bootstrapping | Same shape as A |
| **C** | `POST /api/v1/regulator/access-grants` | `REGULATOR_ACCESS_GRANT` | caller | Class C | `can_admin_niov` | 503; no `createLawfulBasisInTx` invocation; no audit chain extension | Same shape as A |
| **D** | `POST /api/v1/regulator/access-revocations` | `REGULATOR_ACCESS_REVOKE` | caller | Class C | `can_admin_niov` | 503; no `LawfulBasis.revoked_at` write; no `REGULATOR_ACCESS_REVOKED` event | Same shape as A |

All 4 LIVE entries map to Class C today because all 4 are
`can_admin_niov`-tier. Class B (org-admin) becomes load-bearing when
the canonical-record doc's forward-substrate org-tier operations
(e.g., operation 6 TAR clearance-ceiling per the
`docs/architecture/dual-control-operations-canonical-record.md`
enumeration) enter the registry. Class A becomes load-bearing if any
LIVE entry adds explicit target metadata.

### 5. Failure semantics

The target resolver MUST surface the following failure classes
distinctly so middleware behavior + audit telemetry remain
substrate-honest:

- **No eligible target (Class A–C all empty)** → fail closed.
  Suggested error code: `ESCALATION_TARGET_NOT_FOUND`. Middleware
  returns 503 with retry-after hint (consistent with this ADR's
  existing `DualControlFailure.TransientFailure` envelope shape for
  503-class responses). Zone U1 marker per §7.
- **Caller is the only eligible approver (single-admin deployment)**
  → fail closed; treat as `ESCALATION_TARGET_NOT_FOUND` semantically
  (the operator must add a second admin or use break-glass per
  ADR-0050; both paths remain accountable).
- **Cross-org candidate surfaced by a buggy query** → fail closed
  by construction. The org-scope filter MUST run at the repository
  query tier; if the resolver receives a cross-org candidate it MUST
  reject it and treat the result as `ESCALATION_TARGET_INVALID`.
- **Stale / soft-deleted / inactive candidate** → excluded at the
  query tier (`deleted_at IS NULL`, `status = ACTIVE`); if surfaced
  due to a race, the resolver MUST treat as `ESCALATION_TARGET_INVALID`.
- **Class C ambiguous resolution (multiple equal-priority approvers
  beyond the deterministic tie-breaker)** → deterministic
  tie-breaking (lowest `entity_id` lexicographically) eliminates
  ambiguity by construction. No `ESCALATION_TARGET_AMBIGUOUS` code
  is required today; reserved for future Class-B / Class-A semantics
  where multiple designated approvers could legitimately satisfy
  the policy.
- **Resolver internal error (DB timeout, TAR-query exception)** →
  modeled as `DualControlFailure.TransientFailure` per this ADR's
  existing discriminated-union pattern; 503 + retry-after; Zone U1
  `DUAL_CONTROL_TRANSIENT_FAILURE` marker per the existing §4 of the
  canonical record.

Error codes naming convention follows existing patterns in the
`escalation.service.ts` error vocabulary (`ESCALATION_NOT_FOUND`,
`ESCALATION_FORBIDDEN`, `ESCALATION_INVALID_TRANSITION`). The exact
introduction of `ESCALATION_TARGET_NOT_FOUND` /
`ESCALATION_TARGET_INVALID` is part of the next EXECUTE-VERIFY scope;
this amendment proposes them and does not introduce them.

### 6. Audit requirements (forward-substrate for next code QLOCK)

The next EXECUTE-VERIFY QLOCK MUST extend the Zone U1 sequence to
cover the fail-closed path without breaking the existing 5-event +
1-failure-mode taxonomy. Specifically:

- The middleware-tier auto-create path MUST record
  `source_entity_id`, the resolved `target_entity_id`, the
  `actionDescriptor.type`, the route + method, and a
  `target_resolution_reason` in safe details metadata. The
  `target_resolution_reason` is one of: `"explicit-metadata"` (Class
  A), `"org-admin-pool"` (Class B), `"platform-admin-pool"` (Class
  C), or `"no-eligible-target"` (Class D / fail-closed).
- Audit details MUST NOT carry secrets, request bodies, raw header
  values, permission envelope internals, cross-org data, or any
  candidate identities beyond the chosen target. The audit MUST NOT
  enumerate the candidate-pool size or non-chosen candidate
  `entity_id`s (no candidate-pool disclosure).
- The fail-closed path MUST emit a Zone U1 ADMIN_ACTION event with
  `outcome: "DENIED"` and `details.action =
  "DUAL_CONTROL_NO_APPROVER_AVAILABLE"` (NEW marker name proposed
  here; uses the existing `event_type: "ADMIN_ACTION"` literal —
  **no new `AuditEventType` literal**, consistent with this ADR's
  existing marker discipline at §Implementation Detail "the same
  pattern the existing escalation events use"). The marker details
  carry `actionDescriptor.type`, route, method, and
  `target_resolution_reason: "no-eligible-target"`. No new
  `AUDIT_EVENT_TYPE_VALUES` entry is required.
- The fail-closed event MUST be written even if the in-tx audit
  write itself fails; in that case the middleware falls into the
  existing `TransientFailure` envelope (`DUAL_CONTROL_TRANSIENT_FAILURE`
  marker) per this ADR's existing handling. The two markers
  (`DUAL_CONTROL_NO_APPROVER_AVAILABLE` for policy fail-closed;
  `DUAL_CONTROL_TRANSIENT_FAILURE` for I/O fail-closed) are
  distinguishable downstream.
- The privileged route handler MUST NEVER be invoked under either
  fail-closed path. The substrate-integrity assertion is the same as
  the existing throw-guard on registry drift: structural by
  construction, not request-path branching.
- The approve / reject path retains the existing GAP-C1 source-cannot-
  resolve invariant at `escalation.service.ts:406-407`. Phase E does
  not weaken it; it complements it by guaranteeing that the target
  at create-time is structurally distinct from the source. The two
  guards together provide defense in depth.

### 7. Break-glass relationship (no modification to ADR-0050)

Per Rule 0 substrate state at HEAD `fee777f`:

- **ADR-0050 BG.2 is LIVE.** The dual-control middleware
  (`apps/api/src/middleware/dual-control.middleware.ts:445-487`)
  calls `validateBreakGlassGrant(callerEntityId,
  actionDescriptor.type)` and on success `markBreakGlassUsed`,
  delegating to the route handler under a `BREAK_GLASS_DELEGATED`
  marker per ADR-0050 §BG.3 closure evidence. This amendment does
  **NOT** modify break-glass.
- **Phase E does not weaken break-glass.** Break-glass remains
  time-boxed (mandatory `valid_until`), single-use (atomic
  `markBreakGlassUsed`), explicitly-justified, and audited
  (`BREAK_GLASS_INVOKED` / `BREAK_GLASS_USED` / `BREAK_GLASS_EXPIRED`
  / `BREAK_GLASS_REVIEWED` audit literals + the
  `BREAK_GLASS_DELEGATED` marker). Phase E's fail-closed target-
  resolution path runs AFTER break-glass validation in the same
  middleware order as today: a valid grant short-circuits Phase E
  entirely (break-glass delegates directly to the handler before
  any escalation lookup or target-resolution path executes).
- **Break-glass is not a general bypass for target resolution.**
  Break-glass remains an emergency time-boxed alternative to the
  normal approve-flow, NOT a way to skip the target-resolver
  altogether outside emergencies. A future GOVSEC.5-follow-on may
  reconsider grant-issuance ergonomics if Phase E's deadlock-removal
  creates routine traffic; that is forward-substrate and out of
  scope for this amendment.
- **ADR-0050 §BG.3 prose remains stale relative to GOVSEC.5 phase
  closure** per `docs/CURRENT_BUILD_STATE.md` 2026-05-28 refresh.
  A separate ADR-0050 minor-amendment QLOCK reconciles that; this
  amendment does **NOT** modify ADR-0050.

### 8. Non-goals

This amendment does not, and the next EXECUTE-VERIFY QLOCK
implementing Phase E MUST not:

- modify code, schema, routes, services, middleware, tests, package
  files, CI workflows, AGENTS.md, CLAUDE.md, or `docs/CURRENT_BUILD_STATE.md`
  in this docs-only QLOCK
- expand the set of `PRIVILEGED_ENDPOINTS` beyond the 4 current LIVE
  entries
- modify break-glass (ADR-0050) or BG.2 wiring
- modify the GOVSEC.5 closure record or ADR-0049 umbrella status
- introduce Autonomous Execution Core privileged actions
- introduce MCP / Connector write actions
- modify Control Tower (`otzar-control-tower`) UI surfaces
- modify entitlement / billing surfaces
- perform a broad rewrite of dual-control middleware semantics
  beyond the target-resolution change
- weaken the GAP-C1 self-approval guard at
  `escalation.service.ts:406-407`
- enumerate candidate-pool size in audit details (no candidate-pool
  disclosure)
- ship without the fail-closed Zone U1 marker

### 9. Tests required for the next EXECUTE-VERIFY QLOCK

The next QLOCK MUST add or update at least the following tests. Test
file locations follow existing repo precedent (real containerized
Postgres at the unit + integration tiers; no `vi.mock` per the
sub-phase E catch #5 substrate precedent).

**Unit tier (`tests/unit/escalation.test.ts` extend, or new
`tests/unit/escalation-target-resolver.test.ts`):**

1. Target resolver picks the deterministic lowest-`entity_id`
   non-caller candidate from a multi-admin pool (Class C).
2. Target resolver excludes the caller from the candidate set even
   when the caller IS a `can_admin_niov` entity.
3. Target resolver returns the fail-closed sentinel when the
   candidate set after caller-exclusion is empty
   (single-admin org).
4. Target resolver never returns a cross-org candidate (org-scope
   filter is structural at the query tier).
5. Class A explicit-metadata target (forward-substrate hook) is
   chosen ahead of Class B/C when present.
6. Soft-deleted / inactive admin candidates are excluded.

**Integration tier (`tests/integration/dual-control-binding-config.test.ts`
+ `tests/integration/dual-control-binding-orgs.test.ts` extend, or
new `tests/integration/dual-control-phase-e.test.ts`):**

7. End-to-end privileged request → auto-created PENDING escalation
   has `target_entity_id` != `source_entity_id` for all 4 LIVE
   PRIVILEGED_ENDPOINTS (Operations A/B/C/D).
8. The independently-resolved target can approve the escalation;
   re-issued privileged request now delegates to the handler.
9. GAP-C1 still rejects source-side self-approval **after** Phase E
   (even when source coincidentally matches a candidate in the pool
   due to a misconfigured admin set, GAP-C1 trumps target match).
10. Single-admin deployment fails closed at the privileged route with
    503-class response + `DUAL_CONTROL_NO_APPROVER_AVAILABLE` Zone
    U1 marker; no privileged handler invocation.
11. Break-glass regression: a valid `BreakGlassGrant` for
    `actionDescriptor.type` still short-circuits Phase E and
    delegates to the handler; Phase E target resolution is NOT
    invoked on the break-glass path.
12. No-leak wire test: response envelope on fail-closed contains no
    candidate `entity_id`s, no cross-org data, no candidate-pool
    size, no organisation membership information.
13. Audit details verification: `details.action =
    "DUAL_CONTROL_NO_APPROVER_AVAILABLE"` + `target_resolution_reason
    = "no-eligible-target"` + only the route/method/actionDescriptor
    fields documented in §6.
14. Cross-org leak guard: caller in org A; cross-org admin in org B;
    target resolver MUST NOT return org-B candidate even if org-B
    admin has `can_admin_niov`. (Mirrors `admin-routes.test.ts:596+`
    "DRIFT 9" anchor pattern.)

**Regression (must continue to pass):**

15. All existing tests in `tests/unit/escalation.test.ts` + the
    binding test files (`dual-control-binding-config.test.ts`,
    `dual-control-binding-orgs.test.ts`,
    `dual-control-binding-regulator.test.ts` if present) +
    `break-glass-integration.test.ts` + the BG.2-path tests.
16. RULE 16 no-console anchor (`tests/unit/no-console-in-api-src.test.ts`).
17. TS 12-error baseline preserved.

### 10. Implementation guidance for the next EXECUTE-VERIFY QLOCK

This amendment is design-only and intentionally does not write code.
The next QLOCK implementer MUST:

- Re-read this Amendment 1 + the §Decision substrate above + the
  updated `docs/CURRENT_BUILD_STATE.md` 2026-05-28 entry before
  any implementation.
- Surface any Rule 0 conflicts inline per RULE 13 (substrate-honest
  pre-flight) before implementing.

**Likely files to change** (the future QLOCK MUST re-verify each at
pre-flight and adjust as substrate evolves):

- `apps/api/src/services/governance/escalation.service.ts` — add the
  target resolver helper (likely `resolveDualControlTarget(
  callerEntityId, actionDescriptor, prismaClient)` returning a
  discriminated union `{ ok: true; target_entity_id: string;
  resolution_reason: ResolutionReason } | { ok: false; reason:
  "NO_ELIGIBLE_TARGET" | "INVALID_CANDIDATE" }`); replace the
  placeholder at line 316.
- `apps/api/src/middleware/dual-control.middleware.ts` — invoke the
  resolver before `getOrCreatePendingDualControlForCaller`; on
  `{ ok: false }` emit the Zone U1 fail-closed marker and return
  503-class with the safe error envelope; never delegate. Remove
  the SUBSTRATE-STATE LIMITATION block at lines 38-50 once the
  placeholder is gone.
- `apps/api/src/security/privileged-endpoints.ts` — optionally extend
  `EscalationActionDescriptor.metadata` typing if Class A
  explicit-metadata routing lands in the same EXECUTE-VERIFY; if
  not, leave the registry untouched (forward-substrate only).
- Tests — extend per §9.
- `docs/architecture/dual-control-operations-canonical-record.md` —
  update §3 step 6 if the canonical-record's target-resolution prose
  needs aligning to the resolver's name. **Optional**; out of scope
  for this amendment.

**Branch suggestion for the next EXECUTE-VERIFY QLOCK:**
`feature/adr-0026-phase-e-target-resolver-execute-verify-{yyyy-mm-dd}`.

**Verification commands for the next EXECUTE-VERIFY QLOCK** (per
repo precedent):

- `npx tsc --noEmit -p tsconfig.json` — TS 12-error baseline preserved
- `npm run test:unit -- escalation` (and any new resolver test file)
- `npm run test:unit -- no-console-in-api-src` — RULE 16 anchor
- `npm run test:integration -- dual-control` — extend coverage
- `npm run test:integration -- break-glass` — BG.2 regression
- `tests/integration/admin-routes.test.ts` Drift-9 cross-org leak
  guard regression (any test referencing org-scope filter parity)

### 11. Production dependency — Phase E lands before new privileged surfaces

This amendment formalises the §Forward Queue dependency: Phase E
target-resolution MUST land at the implementation tier (via a
separate next-phase EXECUTE-VERIFY QLOCK) **before** any of the
following:

- Adding a 5th or higher entry to `PRIVILEGED_ENDPOINTS` (every new
  privileged endpoint inherits the current deadlock under the
  placeholder).
- Autonomous Execution Core privileged actions (Production Section
  §2; whatever privileged surface lands MUST already have a real
  Phase E target).
- MCP / Connector write actions that route through dual-control
  (Production Section §4; same reason).
- Expanded admin / governance operations relying on dual-control
  (Production Section §9).
- Any operator-facing UX in Control Tower that exposes the
  EscalationRequest queue (otherwise the queue surfaces deadlocked
  rows).

This is the substrate-honest hard-block: Phase E is a **liveness
prerequisite** for expansion, per the Founder Directive "all 10
production sections required, none deferrable as optional later"
recorded in `docs/CURRENT_BUILD_STATE.md` 2026-05-28 refresh.

### 12. Safe / unsafe claims after this amendment

**Safe to claim** after this amendment is Accepted:

- ADR-0026 Phase E target-resolution **policy** is canonical and
  accepted.
- The 4 LIVE PRIVILEGED_ENDPOINTS will use Class C platform-admin
  pool selection once the next EXECUTE-VERIFY QLOCK lands code.
- The dual-control self-approval block (GAP-C1) remains closed at
  the service tier per `escalation.service.ts:406-407`.
- The Phase E liveness gap is fully documented and ready for
  implementation; no further design QLOCK is required before code.
- Break-glass (ADR-0050 / BG.2) remains live and unchanged.

**Unsafe to claim** (until the next EXECUTE-VERIFY QLOCK lands and
tests pass): any framing that asserts Phase E has shipped as code,
that auto-created dual-control escalations have been unblocked at
runtime, that the dual-control surface has production-grade
end-to-end coverage for customer flows, that the 4 PRIVILEGED_ENDPOINTS
have customer-tested approval paths, that Autonomous Execution Core
/ MCP / Connectors are live, or that all 10 production sections are
launch-ready. See `docs/CURRENT_BUILD_STATE.md` 2026-05-28 refresh
for the canonical substrate-honest claims posture across the 10
production sections; the unsafe-claim phrasing forbidden in this
repo is enumerated there and in ADR-0055 §Decision 9.

### 13. Forward queue from this amendment

The next QLOCKs in sequence, none implemented here:

- `[ADR-0026-AMENDMENT-1-PHASE-E-COMMIT-AND-PUSH-AUTH]` — docs-only
  commit + push of this amendment.
- `[ADR-0026-AMENDMENT-1-PHASE-E-PR-AUTH]` — PR.
- `[ADR-0026-AMENDMENT-1-PHASE-E-PR-REVIEW-STATUS-QLOCK]` — review
  status.
- `[ADR-0026-AMENDMENT-1-PHASE-E-FOUNDER-MERGE-AUTH]` — merge.
- `[ADR-0026-PHASE-E-TARGET-RESOLVER-EXECUTE-VERIFY-AUTH]` (NEW;
  code QLOCK that implements §3 + §6 + §9) — this is the QLOCK that
  removes the deadlock.

**Founder authorization for this amendment** explicit at
`[ADR-0026-AMENDMENT-1-PHASE-E-TARGET-RESOLUTION-WRITE-AND-ACCEPT-AUTH]`
per RULE 20.

**Rule 21 research-arc note for this amendment:** Online research
was **not performed** in this session (no operator-confirmed online
access). The amendment proceeds from repo-internal authoritative
substrate only: ADR-0026 §Decision + §Forward Queue, ADR-0050 §BG.3,
COMPLIANCE_ARCHITECTURE_REVIEW.md Tension 3, RAA 12.8 §5.2 (HITL
escalation chain), `docs/CURRENT_BUILD_STATE.md` 2026-05-28 refresh,
and implementation-proven file:line evidence cited inline. No
external four-eyes / segregation-of-duties / enterprise-IAM source
was consulted; the canonical principles (source ≠ approver,
fail-closed target selection, auditability, break-glass
accountability + time-boxing, distinct-second-human invariant) are
already canonical in the repo substrate cited above. A future
Founder-authorized QLOCK MAY add a research-arc preface to this
amendment if external corroboration is required for
audit/certification purposes (e.g., SOC 2 CC6.3 segregation of
duties evidence pack); that is forward-substrate.

Bidirectional citations (cited from):

- `docs/architecture/dual-control-operations-canonical-record.md` — the
  implementation-facing canonical record this ADR bundles (the full 8-operation
  enumeration across 4 categories; the Zone U1 audit-event sequence §4; the 6
  BEAM-compatibility patterns §5; the 10-commit arc §6). The canonical record
  cross-references this ADR as its decision-record companion (landed at
  sub-phase H `[SEC-DUAL-CONTROL-ADR]`).
- ADR-0002 (append-only audit chain with BEFORE DELETE trigger) — the Zone U1
  audit-chain substrate the `requireDualControl` preHandler writes its 5-event
  (+ 1 failure-mode) sequence to; the immutability the event-sourced-audit BEAM
  pattern relies on. ADR-0002's "(cited from)" block back-cites this ADR.
- ADR-0028 (Forward-Substrate: Elixir/BEAM Coordination Layer for Capsule
  Supervision + OtzarComm + DBGI Integration; landed at sub-phase J
  `[SEC-BEAM-FORWARD-SUBSTRATE]`) — commits to ship the 6 BEAM-compatibility
  patterns this ADR's middleware substrate documents at substrate-state register;
  ADR-0028 is the Sub-box 2 Phase 2 mini-arc commitment that ports those patterns
  to production Elixir/BEAM (a 6-8-commit / ~3-4-week mini-arc; the three-language
  stack — Fastify+TypeScript API + Elixir COSMP + Python ML + Postgres storage).
- ADR-0030 (Phase 2 Elixir/BEAM Implementation: Mix Umbrella + COSMP Router +
  DBGI Supervisor + Three-Language Stack Canonicalization; landed at Block B
  sub-phase 1 `[BEAM-PHASE-2-ADR]`) — **load-bearing**: ADR-0030 is the Phase 2
  implementation ADR; the 19-sub-phase Block B mini-arc (expanded 13 → 14 at
  sub-phase 4a per Q-G split — see ADR-0031; 14 → 15 at sub-phase 5a per
  Q-P split — see ADR-0032; 15 → 16 at sub-phase 5b-i per Q-R split — see
  ADR-0033; 16 → 17 at sub-phase 5b-iii per Q-NEW-SPLIT split — see ADR-0033
  §Forward path; 17 → 18 at sub-phase 6a per Q-NEW-SPLIT-2 split — see ADR-0034;
  18 → 19 at sub-phase 6c per Q-NEW-SPLIT-3 split — see ADR-0035) ports the 6 BEAM-compatibility patterns
  documented in this ADR's §5 (at substrate-state register — TypeScript code
  mimicking BEAM) to **Register-2** (production Elixir/BEAM substrate).
  ADR-0030 §Implementation Detail includes a pattern→Elixir-idiom mapping
  table treating this ADR's §5 as the canonical source. Per ADR-0020
  two-register IP discipline, the §5 patterns existed at
  substrate-state-register from ADR-0026's H-commit; Phase 2 makes them
  observable substrate at Register-2.
- ADR-0031 (BEAM Routing Substrate Architecture; landed at sub-phase 4a
  `[BEAM-COSMP-GENSERVER-ADR]`) — **load-bearing**: ADR-0031 cites this
  ADR's §5 6 BEAM-compatibility patterns and identifies the **load-bearing
  subset for sub-phase 4b routing GenServer instantiation — patterns 1
  (message-passing semantics), 2 (supervisor-friendly failure modes), 6
  (pure transformation over imperative control)**. Patterns 3 (state
  reconstructible from durable storage), 4 (event-sourced audit semantics),
  5 (idempotent verification keys) **forward-queue to sub-phases 5/6** with
  their consumers (gRPC interop + Postgres integration). ADR-0031 §Decision
  documents the per-pattern instantiation register.
- ADR-0036 (REGULATOR Principal + Lawful-Basis Attestation Pattern;
  Proposed 2026-05-15; Sub-box 3 sub-phase 1) — **load-bearing**: ADR-0036
  Sub-decision 6 cites this ADR's `requireDualControl` Fastify preHandler
  + `PRIVILEGED_ENDPOINTS` runtime registry + per-route binding discipline
  for binding to the regulator-grant route (`POST /api/v1/regulator/grant`)
  at sub-phase 5 `[SUB-BOX-3-ROUTES]` register. Regulator-grant routes
  inherit this ADR's substrate; no new dual-control primitive needed.
  Regulator access cannot bypass dual-control where required per ADR-0036
  Sub-decision 6 + §Consequences canonical at substantive register.
