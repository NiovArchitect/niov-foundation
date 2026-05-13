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
  implementation ADR; the 14-sub-phase Block B mini-arc (expanded from 13 at
  sub-phase 4a per Q-G split) ports the 6 BEAM-compatibility patterns
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
