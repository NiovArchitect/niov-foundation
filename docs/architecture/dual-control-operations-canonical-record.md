# Dual-Control Operations Canonical Record

**Status:** Accepted
**Date:** 2026-05-13
**Trigger:** Sub-box 2 Phase 1 sub-phase C `[SEC-DUAL-CONTROL-CANONICAL-RECORD]` — the implementation-facing companion to the `COMPLIANCE_ARCHITECTURE_REVIEW.md` Tension 3 substrate-state correction (sub-phase B `6a1a380`). Future Claude Code / contributor sessions read this for the complete dual-control posture across the Foundation per RULE 17.

> **Post-closure amendment (2026-05-15; CAR Sub-box 3 sub-phase 7 `[SUB-BOX-3-CLOSURE]` per Q-NEW-2 LOCKED Option α):** the Sub-box 3 forward references in the body of this document (e.g., "REGULATOR is Sub-box 3 territory", "Forward path: LIVE binding at Sub-box 3 when the REGULATOR `EntityType` ships", "Sub-box 3 — operation 4 (REGULATOR access grant)") are now **substrate-state LIVE post-2026-05-15** per ADR-0036 sub-phases 5 + 6. The contemporaneous forward-reference text is preserved unchanged at substantive register substantively per substrate-honest discipline canonical at substantive register substantively (the original Sub-box 2 Phase 1 substrate-build observations remain canonical evidence at sub-phase E/F/G commit register substantively); this amendment note is the single canonical post-closure surface that surfaces the current substrate-state truth without rewriting the contemporaneous text. For the full Sub-box 3 closure substrate canonical at substantive register substantively see `docs/architecture/decisions/0036-regulator-principal-lawful-basis-attestation-pattern.md` §Post-Closure Implementation Lineage + `docs/reference/section-12-progress.md` CAR Sub-box 3 row.
**Scope:** The implementation-facing canonical record of all dual-control operations across the Foundation, organized by the 4-category framing from `COMPLIANCE_ARCHITECTURE_REVIEW.md` Tension 3 (source-of-substance). Provides per-operation implementation-facing details — route paths, authorization tiers, Zone U1 audit substrate, dual-control enforcement mechanisms, forward paths — that the `requireDualControl` Fastify preHandler (sub-phase E) and the integration-tier tests (sub-phases F + G) consume. Does NOT duplicate the Tension 3 amendment's architectural framing; it cross-references Tension 3 as source-of-substance and adds the operational layer.
**Cross-references:**
- `docs/COMPLIANCE_ARCHITECTURE_REVIEW.md` Tension 3 (source-of-substance; the 4-category enumeration; back-cited here)
- `packages/database/prisma/schema.prisma` — `EscalationType` enum (lines 482-490; the `DUAL_CONTROL_REQUIRED` value); `EscalationRequest` model (lines 1106-1132)
- `apps/api/src/services/governance/escalation.service.ts` — the 8-function escalation service surface + the internal `transitionPendingForCaller` skeleton gate
- `docs/architecture/dynamic-flow-architecture.md` RAA 12.7 §2.5 — Zone U1-U4 trust-root canonicalization (Zone U1 — Audit chain integrity at line 127; Zone U4 — Permission grant lineage at line 176)
- `docs/architecture/raa-12-8-substrate-dynamics.md` §1.x — Zone U1/U4 detail (line 312 Zone U1 + the ADR-0002 BEFORE DELETE trigger; line 318 Zone U4) — and §5.2 (line 1201; "Human-in-the-loop primitives expansion (closes D-2D-D10 drift)" — the `EscalationRequest`/HITL substrate the dual-control gate consumes; back-cited there)
- `docs/architecture/decisions/0002-append-only-audit-chain.md` (ADR-0002 — the `audit_events_immutable` BEFORE DELETE trigger; Category (3) DB-tier substrate)
- `CLAUDE.md` RULE 10 (the Capsule soft-delete invariant; Category (4) RULE-10-retired)
- `apps/api/src/routes/platform.routes.ts` — the 2 LIVE Phase 1 binding routes (`PATCH /api/v1/platform/monetization/config`, `POST /api/v1/platform/orgs`)
- `apps/api/src/routes/auth-admin.routes.ts` — the `can_admin_org`-tier account-creation routes (operation 1 forward-substrate)
- `apps/api/src/services/tar.ts:407` — the TAR clearance-ceiling service-tier update flow (operation 6 forward-substrate)
- `[SEC-DUAL-CONTROL-ENUM]` `b34c5cf` (the `DUAL_CONTROL_REQUIRED` `EscalationType` value, schema-canonical) + `[SEC-TENSION-3-AMENDMENT]` `6a1a380` (the Tension 3 4-category reframe)
- ADR-0026 `[SEC-DUAL-CONTROL-ADR]` at sub-phase H (the full dual-control middleware + privileged-endpoint-registry + per-route-binding-discipline pattern; cites this canonical record; reconciles this §4 with the 6th `DUAL_CONTROL_TRANSIENT_FAILURE` marker); ADR-0028 `[SEC-BEAM-FORWARD-SUBSTRATE]` at sub-phase J (the Elixir/BEAM coordination-layer commitment-to-ship — Sub-box 2 Phase 2; cites this canonical record's §5 for the 6 BEAM-compatibility patterns it commits to ship; the arc-closure commit)

---

## 1. Purpose

This document is the implementation-facing canonical record of dual-control across the Foundation. `COMPLIANCE_ARCHITECTURE_REVIEW.md` Tension 3 ("Multi-person integrity (1.5) vs Operational velocity") is the *source-of-substance* — it canonicalizes the architectural decision (an *enumerated dual-control set, not a general primitive*) and the 4-category organization of that set (LIVE / forward-substrate / DB-tier / RULE-10-retired). This record consumes that framing and adds the operational layer a session building or operating dual-control needs: per-operation route paths, authorization tiers, the Zone U1 audit-event sequence, the `EscalationRequest` model fields, the `escalation.service.ts` surface, the `requireDualControl` preHandler verification flow, the 6 BEAM-compatibility patterns the middleware adopts, and the forward paths for the not-yet-built operations. When a future session asks "what is the complete dual-control posture across the Foundation, and which operations are live?" — this document is the answer; for the architectural *why*, it points back to Tension 3.

## 2. The dual-control verification flow

The `requireDualControl` Fastify preHandler (sub-phase E; `apps/api/src/middleware/dual-control.middleware.ts`) sits between `requireAuth` / `requireAdminCapability` and the route handler for the LIVE Category (1) operations. The verification flow:

1. **Caller initiates** a privileged operation (e.g., `PATCH /api/v1/platform/monetization/config`). `requireAuth` + `requireAdminCapability(authService, "can_admin_niov")` have already run; `request.auth.entity_id` is the caller.
2. **The preHandler intercepts** the request before handler execution. It constructs a verification context — `{ callerEntityId, actionDescriptor, escalationId? }` — from the request (the `actionDescriptor` identifies the operation: e.g., `"PLATFORM_MONETIZATION_CONFIG_MUTATION"`; the optional `escalationId` is supplied by the caller when re-issuing the request after approval).
3. **The preHandler looks up** an `EscalationRequest` for this operation: `prisma.escalationRequest.findFirst({ where: { escalation_type: "DUAL_CONTROL_REQUIRED", source_entity_id: callerEntityId, /* action descriptor match via description or a future action field */, status: "APPROVED" } })` (or by `escalation_id` if the caller supplied it). Reads current state from Postgres — no in-memory cache (BEAM-compatibility pattern 3).
4. **The preHandler verifies approver semantics** via the `transitionPendingForCaller` skeleton-gate discipline at `escalation.service.ts:276`: the resolver (`resolved_by_entity_id`) must not equal the source (`source_entity_id`) — no self-approval — and the escalation must be `APPROVED` (not `PENDING` / `REJECTED` / `EXPIRED`, and not past `expires_at`). The authorization logic is a pure function `(callerEntity, actionDescriptor, escalationRequestState) → outcome` — side effects (audit writes, DB reads) are at the edges (BEAM-compatibility pattern 6).
5. **On APPROVED + valid approver**: the preHandler writes the Zone U1 audit-event sequence (§4 — PRE_VERIFICATION → ESCALATION_LOOKUP → APPROVAL_VERIFIED) and delegates to the route handler (HANDLER_DELEGATED). The handler executes the privileged operation.
6. **On not-yet-approved or denied**: if there is no `APPROVED` `EscalationRequest`, the preHandler creates a `PENDING` one (`createEscalationForCaller` with `escalation_type: "DUAL_CONTROL_REQUIRED"`, `severity: "HIGH"`, `target_entity_id` = a designated approver or the requesting org's admin set), writes the Zone U1 HANDLER_DENIED event with `denial_reason: "ESCALATION_PENDING"` (or `"ESCALATION_FORBIDDEN"` if the approver-equals-initiator check fails, or `"ESCALATION_EXPIRED"`), and returns `403` with the `escalation_id` so the caller can have a second approver `APPROVE` it (via `POST /api/v1/escalations/:id/approve`) and then re-issue the request with that `escalation_id`.

### `EscalationRequest` model (the request substrate)

`packages/database/prisma/schema.prisma:1106-1132` (single-step model; multi-step chains are deferred to RAA 12.8 §5.2 / §5.9 item 1 per `[SEC-SUBBOX1-ITEM6-DEFER]`):

- `escalation_id` — UUID PK
- `source_entity_id` — the initiator (the caller who triggered the gated operation)
- `target_entity_id` — the designated approver (or the org's admin set)
- `capsule_id?` — optional capsule context (null for the platform-level Category (1) operations)
- `escalation_type` — `EscalationType` — `DUAL_CONTROL_REQUIRED` for Category (1) (distinct from `HUMAN_REVIEW_REQUIRED` — AI-uncertainty trigger — and `COMPLIANCE_GATE` — the validation-gate-fail coupling per [D-2D-D10-5])
- `severity` — `String` (`"HIGH"` for the Category (1) operations)
- `description` — `String` (carries the action descriptor + the request payload summary for the approver)
- `status` — `EscalationStatus` — `PENDING` → `APPROVED` / `REJECTED` / `EXPIRED`
- `resolved_by_entity_id?` — the approver who resolved it (≠ `source_entity_id`)
- `resolution_metadata?` — `Json` (the approver's context / justification)
- `created_at` / `resolved_at?` / `expires_at?` — timestamps
- relations: `source_entity` / `target_entity` / `resolver_entity?` → `Entity`; `capsule?` → `MemoryCapsule`
- indexes on `source_entity_id`, `target_entity_id`, `resolved_by_entity_id`, `capsule_id`, `status`, `created_at`, `escalation_type`; `@@map("escalation_requests")`

### `escalation.service.ts` surface (the service substrate)

`apps/api/src/services/governance/escalation.service.ts` — 8 exported functions + 1 internal:

- `createEscalationForCaller(callerEntityId, input)` — creates a `PENDING` `EscalationRequest` (input: `target_entity_id`, `capsule_id?`, `escalation_type`, `severity`, `description`)
- `createGateEscalationForCaller(callerEntityId, capsuleId, ownerEntityId)` — the `COMPLIANCE_GATE` get-or-create dedup (per [D-2D-D10-5]; not used by the dual-control gate but shares the create path)
- `getEscalationForCaller(callerEntityId, escalationId)` — fetch one (throws `ESCALATION_NOT_FOUND` / `ESCALATION_FORBIDDEN`)
- `listEscalationsPendingForCaller(callerEntityId, asEntityId, limit)` — list `PENDING` escalations for an approver
- `countEscalationsPending(asEntityId)` — count
- `approveEscalationForCaller(callerEntityId, escalationId, resolutionMetadata?)` — `PENDING` → `APPROVED` (the `requireDualControl` preHandler's APPROVED state comes from here)
- `rejectEscalationForCaller(callerEntityId, escalationId, resolutionMetadata?)` — `PENDING` → `REJECTED`
- `expireEscalation(escalationId)` — `PENDING` → `EXPIRED` (cron / on-read TTL sweep)
- *(internal)* `transitionPendingForCaller(callerEntityId, escalationId, toStatus, auditAction, resolutionMetadata?)` — the state machine + the source≠resolver skeleton gate (`caller === target_entity_id || caller === resolved_by_entity_id` may transition; `source_entity_id` cannot self-resolve) + the Zone U1 audit write inside the same `prisma.$transaction` per RULE 4

## 3. The 4-category operation enumeration (implementation-facing)

The architectural framing of these 4 categories — *why* each operation is in its category, the substrate-state observations, the original Tension 3 entries — is canonical at `COMPLIANCE_ARCHITECTURE_REVIEW.md` Tension 3 (source-of-substance; not duplicated here). This section adds the implementation-facing fields.

### Category (1) — LIVE Phase 1 bindings

**Operation A — `PATCH /api/v1/platform/monetization/config`** (the 70/30 revenue-split mutation):
- Route path: `apps/api/src/routes/platform.routes.ts`
- Authorization tier: `can_admin_niov` (the `requireAdminCapability(authService, "can_admin_niov")` preHandler runs first; `requireDualControl` runs after it)
- Zone U1 audit substrate: `event_type: "ADMIN_ACTION"` + `details.action` discriminator — the dual-control sequence (`DUAL_CONTROL_VERIFICATION_PRE` → `DUAL_CONTROL_ESCALATION_LOOKUP` → `DUAL_CONTROL_APPROVAL_VERIFIED` → `DUAL_CONTROL_HANDLER_DELEGATED` / `DUAL_CONTROL_HANDLER_DENIED`) plus the operation's own audit event when it executes
- Dual-control mechanism: `requireDualControl` preHandler (sub-phase E); `EscalationRequest` with `escalation_type: "DUAL_CONTROL_REQUIRED"`, `severity: "HIGH"`; second approver ≠ initiator
- Substrate-state observation: the highest economic-impact substrate operation in the Foundation — a change to the 70/30 split affects every holder's monetization economics; this is *the* canonical example of "high-stakes operation that warrants dual-control"
- Forward path: LIVE at sub-phase F `[SEC-DUAL-CONTROL-BINDING-CONFIG]` (binding + integration-tier test per ADR-0011 — the full Zone U1 audit-chain end-to-end test)

**Operation B — `POST /api/v1/platform/orgs`** (org creation; Dandelion Phase 0):
- Route path: `apps/api/src/routes/platform.routes.ts`
- Authorization tier: `can_admin_niov`
- Zone U1 audit substrate: same dual-control `ADMIN_ACTION` sequence as Operation A, plus the `executePhase0` org-creation audit event
- Dual-control mechanism: `requireDualControl` preHandler (sub-phase E); `EscalationRequest` with `escalation_type: "DUAL_CONTROL_REQUIRED"`, `severity: "HIGH"`; second approver ≠ initiator
- Substrate-state observation: provisions new tenants on the Foundation — an org-creation event is rare and high-consequence (it grants a new tenant a wallet, a TAR, and the org-admin capability set)
- Forward path: LIVE at sub-phase G `[SEC-DUAL-CONTROL-BINDING-ORGS]` (binding + integration-tier test per ADR-0011)

### Category (2) — Forward-substrate route-tier operations

**Operation 1** (original Tension 3 entry: "Account creation with `can_admin_niov`"):
- Substrate-state observation: no `can_admin_niov`-tier account-creation route exists today; account creation operates at `can_admin_org` tier in `apps/api/src/routes/auth-admin.routes.ts`. The substrate-honest reframe (per Tension 3): high-stakes account creation should be dual-control-gated regardless of admin tier
- Forward path: Sub-box 2 Phase 2 LIVE binding once the canonical scope surfaces (the Phase 2 pre-flight determines whether to gate the `can_admin_org` account-creation route, a future `can_admin_niov` one, or both)

**Operation 4** (original Tension 3 entry: "Regulator access grant"):
- Substrate-state observation: the `EntityType` enum at `packages/database/prisma/schema.prisma:343-350` is `PERSON / COMPANY / AI_AGENT / DEVICE / APPLICATION / GOVERNMENT` — no `REGULATOR` value; REGULATOR is Sub-box 3 territory per the `COMPLIANCE_ARCHITECTURE_REVIEW.md` "Engineering surface" Sub-box enumeration
- Forward path: LIVE binding at Sub-box 3 when the REGULATOR `EntityType` ships (a regulator receiving FULL scope to a tenant's capsules is gated)

**Operation 5** (original Tension 3 entry: "Lawful-basis attestation issuance with no documented reference"):
- Substrate-state observation: no lawful-basis attestation substrate exists today; Sub-box 3/4 territory (REGULATOR + Lawful-Basis at Sub-box 3; DecisionRecord + DataSubjectReference + Agent Attestation at Sub-box 4)
- Forward path: LIVE binding at Sub-box 3 or 4 when the lawful-basis attestation substrate ships (issuance with `basis_reference` null/unverified requires a second attesting authority)

**Operation 6** (original Tension 3 entry: "TAR mutation lifting clearance ceiling above a threshold"):
- Substrate-state observation: `clearance_ceiling` exists on the TAR per `packages/database/prisma/schema.prisma`; a service-tier update flow exists at `apps/api/src/services/tar.ts:407`; no Fastify route currently surfaces this mutation
- Forward path: Sub-box 2 Phase 2 or 3 LIVE binding when the route substrate surfaces (`clearance_ceiling` raised to or above 5 requires dual approval)

### Category (3) — DB-tier substrate (not route-gateable; dual-control at the PostgreSQL role-permission tier)

**Operation 2** (original Tension 3 entry: "Audit-trigger-disable attempts"):
- Substrate-state observation: the `audit_events_immutable` BEFORE DELETE trigger is DB-level per ADR-0002 — DDL substrate, not a Fastify route
- Dual-control mechanism: the PostgreSQL role-permission tier — the database role that holds the DDL privilege to drop the trigger has its credentials dual-control-gated at the secrets-management substrate (not the Fastify preHandler tier). The `requireDualControl` middleware does NOT cover this operation
- Forward path: NOT in the `requireDualControl` middleware scope; the secrets-management substrate documents the role-credential dual-control discipline per ADR-0002. (A trigger-drop attempt also surfaces a high-severity Zone U1 audit event by construction — the chain integrity is the backstop even if the role-credential gate were bypassed.)

### Category (4) — RULE-10-retired

**Operation 3** (original Tension 3 entry: "Capsule mass-deletion exceeding N capsules in a single operation"):
- Substrate-state observation: per RULE 10 (the Capsule soft-delete invariant — "Nothing is ever deleted"), Capsules are soft-deleted via the `deleted_at` field (`schema.prisma:35` + `:153` + `:165` with `@@index([deleted_at])`); bulk hard-delete of Capsules is not a substrate operation in the Foundation
- Forward path: none — closed as architecturally incompatible with Foundation invariants. (Soft-delete is itself audited; a mass `deleted_at`-set would surface as a sequence of Zone U1 events; but there is no "mass-deletion" operation to gate.)

## 4. Zone U1 audit-event sequence (Zone U4 intersects on SHARE/REVOKE)

The `requireDualControl` preHandler writes its audit events in **Zone U1** (audit chain integrity per RAA 12.7 §2.5 — `dynamic-flow-architecture.md:127`; enforced append-only by the ADR-0002 BEFORE DELETE trigger; chained via `previous_event_hash` + SHA-256 through `CRYPTO_CONFIG.HASH_ALGORITHM`). Each event is `event_type: "ADMIN_ACTION"` with a `details.action` discriminator — the same pattern the existing escalation events use (`ESCALATION_CREATED` / `ESCALATION_APPROVED` / etc. at `escalation.service.ts`). The sequence for a Category (1) verification:

1. **`DUAL_CONTROL_VERIFICATION_PRE`** — written when the preHandler intercepts the request; `details`: `{ action: "DUAL_CONTROL_VERIFICATION_PRE", action_descriptor, caller_entity_id }`
2. **`DUAL_CONTROL_ESCALATION_LOOKUP`** — written when the preHandler queries the `EscalationRequest`; `details`: `{ action: "DUAL_CONTROL_ESCALATION_LOOKUP", action_descriptor, escalation_id, escalation_status }` (`escalation_id` null + `escalation_status` `"NONE"` if no escalation exists yet)
3. **`DUAL_CONTROL_APPROVAL_VERIFIED`** — written when the preHandler confirms `APPROVED` + valid-approver semantics; `details`: `{ action: "DUAL_CONTROL_APPROVAL_VERIFIED", action_descriptor, escalation_id, resolver_entity_id, approver_neq_initiator: true }`
4. **`DUAL_CONTROL_HANDLER_DELEGATED`** — written when the preHandler passes control to the route handler; `details`: `{ action: "DUAL_CONTROL_HANDLER_DELEGATED", action_descriptor, escalation_id }` — *or* —
5. **`DUAL_CONTROL_HANDLER_DENIED`** — written when the preHandler rejects (no `APPROVED` escalation → it just created a `PENDING` one; or approver = initiator; or expired); `details`: `{ action: "DUAL_CONTROL_HANDLER_DENIED", action_descriptor, escalation_id, denial_reason }` (`denial_reason` ∈ `{"ESCALATION_PENDING", "ESCALATION_FORBIDDEN", "ESCALATION_EXPIRED"}`)

Plus one **§4-adjacent failure-mode marker** (NOT part of the normal 5-event sequence above):

6. **`DUAL_CONTROL_TRANSIENT_FAILURE`** — written best-effort when the preHandler's DB read or an audit write *throws* (a BEAM-pattern-2 supervisor-retryable condition — a future Elixir supervisor would retry); `outcome: "ERROR"`; `details`: `{ action: "DUAL_CONTROL_TRANSIENT_FAILURE", action_descriptor, route, method }`. The preHandler then returns `503` with a `retry-after` hint; the verification fails closed (the handler is not delegated). Added to this §4 at sub-phase H `[SEC-DUAL-CONTROL-ADR]` per the sub-phase E substrate-state observation that the 6 BEAM-compatibility patterns require a typed failure-mode event for future Elixir supervisor reconstruction (ADR-0026 reconciliation).

Events 1-3 + 4 (delegated) form the happy-path sequence; events 1-2 + 5 (denied) form the rejection sequence. Each event is a standalone `writeAuditEvent` call (its own transaction — the "independent causation context" framing per BEAM-pattern-4; partial sequences on crash are acceptable substrate state per the ADR-0002 append-only chain). RULE 4 is satisfied at each event boundary (audit before response); if a DB read or audit write throws, the verification fails closed (the preHandler `try/catch` returns `503`; the handler is not delegated) and writes the §4-adjacent `DUAL_CONTROL_TRANSIENT_FAILURE` marker above. *(The sub-phase-C draft of this paragraph said "all events ... inside the preHandler's own transactional scope ... commit or roll back together" — reconciled here at sub-phase H to the as-implemented standalone-per-event posture chosen at sub-phase E.)*

**Zone U4 (permission grant lineage) intersection:** when the gated privileged operation *itself* involves a SHARE or REVOKE (none of the current Category (1) operations do, but a future Category (2) operation — e.g., a regulator-access-grant at Sub-box 3 — would), the operation's own SHARE/REVOKE writes its Zone U4 evidence (the `Permission` row with `bridge_id` / `status` / `revoked_at` / `revoked_by_entity_id` per `schema.prisma:279-306`) *in addition to* the dual-control Zone U1 sequence. Zones U2 (patent-holder implementation record — every commit on origin/main) and U3 (identity verification — the AUTHENTICATE flow with `tar_hash_at_creation`) are NOT in the dual-control middleware's write scope.

## 5. The 6 BEAM-compatibility patterns (the sub-phase E middleware adopts these)

The `requireDualControl` Fastify preHandler (sub-phase E) is implemented in TypeScript with 6 patterns chosen so a future Elixir/BEAM migration (per ADR-0028, sub-phase J) is a *port, not a rewrite*:

1. **Message-passing semantics over shared state.** Each dual-control verification is an independent message with explicit input/output payloads — a verification context `{ callerEntityId, actionDescriptor, escalationId? }` in, an outcome `{ delegated | denied, escalation_id, denial_reason? }` out. No shared mutable state between concurrent invocations. Maps to Elixir `GenServer.call/cast`.
2. **Supervisor-friendly failure modes.** Middleware failures (DB unreachable, audit-write fails, `EscalationRequest` lookup throws) throw typed errors via a discriminated union `type DualControlFailure = TransientFailure | PermanentFailure` — `TransientFailure` (a future supervisor retries) vs `PermanentFailure` (escalate to the parent). Maps to Elixir's `{:error, :transient}` / `{:error, :permanent}`.
3. **State reconstructible from durable storage.** The middleware does NOT cache `EscalationRequest` state in memory between requests — every verification reads the current state from Postgres. A future Elixir worker process can be spawned, crashed, and restarted with state hydrated from durable storage at any moment.
4. **Event-sourced audit semantics.** The Zone U1 audit events (§4) are immutable events (the existing `writeAuditEvent` pattern per ADR-0002 already enforces this — append-only, BEFORE DELETE trigger). The dual-control verification writes its events as a sequence; each event has independent causation context. Maps to Elixir's event-sourced supervision pattern.
5. **Idempotent verification keys.** Each verification accepts an idempotency key — the `EscalationRequest.escalation_id` serves this purpose. Replaying the same verification with the same key produces the same outcome. Maps to Elixir's idempotent message handling under at-least-once delivery. **[G1-DUAL-CONTROL amendment (2026-07-06, §9):** for payload-bound endpoints (`PrivilegedEndpoint.payloadBinding` — today `PLATFORM_ORG_CREATION` only) the approval is SINGLE-USE: replaying the verification after the guarded operation succeeded finds the approval consumed (APPROVED → EXPIRED) and yields a fresh PENDING escalation, not a second delegation. Idempotency of the *verification read* is preserved; idempotency of the *spend* is deliberately one-shot, like break-glass.**]**
6. **Pure transformation over imperative control.** The authorization logic is expressible as a pure function `(callerEntity, actionDescriptor, escalationRequestState) → outcome`. Side effects (audit writes, DB queries) are explicit and at the edges, not mixed throughout the verification logic. Maps to Elixir's pure-function-first idiom.

These patterns land as comments + type definitions + structural choices in the sub-phase E middleware code and are canonicalized in ADR-0028 at sub-phase J. BEAM is an optimization, not a requirement — the Foundation can ship its full Phase 1-9 substrate without BEAM; the substrate is built BEAM-compatible today to preserve the future architectural choice.

## 6. The Sub-box 2 Phase 1 arc (10 commits)

- **A** `[SEC-DUAL-CONTROL-ENUM]` `b34c5cf` ✅ — `EscalationType.DUAL_CONTROL_REQUIRED` schema-canonical (test-DB pushed via the ADR-0025 wrapper; production via the deploy pipeline; CI test tier picks it up automatically)
- **B** `[SEC-TENSION-3-AMENDMENT]` `6a1a380` ✅ — `COMPLIANCE_ARCHITECTURE_REVIEW.md` Tension 3 substrate-state correction (the 4-category reframe)
- **C** `[SEC-DUAL-CONTROL-CANONICAL-RECORD]` `d42e2a6` ✅ — this document
- **D** `[SEC-PRIVILEGED-REGISTRY]` `9628efa` ✅ — `apps/api/src/security/privileged-endpoints.ts` (the runtime registry; LIVE entries only — the 2 Category (1) operations; type-safe; 9 unit tests)
- **E** `[SEC-DUAL-CONTROL-MIDDLEWARE]` `3f2f329` ✅ — `apps/api/src/middleware/dual-control.middleware.ts` (consumes the registry; verifies an `APPROVED` `EscalationRequest`; writes the Zone U1 audit-event sequence per §4; adopts the 6 BEAM-compatibility patterns per §5; the 2 `escalation.service.ts` RULE-9 helpers; 12 unit tests)
- **F** `[SEC-DUAL-CONTROL-BINDING-CONFIG]` `34eea82` ✅ — bind `requireDualControl` to `PATCH /api/v1/platform/monetization/config` (Operation A LIVE); integration-tier test per ADR-0011 (full Zone U1 audit-chain end-to-end; 7 tests)
- **G** `[SEC-DUAL-CONTROL-BINDING-ORGS]` `ceb418f` ✅ — bind `requireDualControl` to `POST /api/v1/platform/orgs` (Operation B LIVE); integration-tier test per ADR-0011 (8 tests; the 3 `createOrgAndAdmin` setup helpers rewired to `executePhase0` direct calls)
- **H** `[SEC-DUAL-CONTROL-ADR]` `135fee0` ✅ — ADR-0026 ("Dual-Control Middleware Pattern + Privileged Endpoint Registry + Per-Route Binding Discipline"); cites this canonical record; reconciles this §4 (the 6th `DUAL_CONTROL_TRANSIENT_FAILURE` marker; the standalone-per-event paragraph); updates `section-12-progress.md` Sub-box 2 status + the CLAUDE.md §5 jump-table (25→26 ADRs) + the README ADR catalog (25→26) + ADR-0002's "(cited from)" block (the `135fee0` hash backfilled into this entry at sub-phase I `[SEC-CONTRIBUTOR-GOVERNANCE]` per the post-commit-hash discipline)
- **I** `[SEC-CONTRIBUTOR-GOVERNANCE]` `62d472c` ✅ — ADR-0027 ("Contributor Governance + AI-Alignment + Rule-Modification Authority") + RULE 20 (Rule-Modification Authority — only the patent-holder Founder may modify/add/remove RULES or ADRs) + `docs/contributing/onboarding-for-engineers.md` NEW (the human-engineer onboarding doc); cascade: 26→27 ADRs (README + CLAUDE.md §5) + 19→20 RULES (CLAUDE.md §3 + the preamble RULE-count reconciliation + `docs/contributing/onboarding.md`) + ADR-0020's "(cited from)" block + the `135fee0` H-hash backfill above (the `62d472c` hash backfilled into this entry at sub-phase J `[SEC-BEAM-FORWARD-SUBSTRATE]` per the post-commit-hash discipline)
- **J** `[SEC-BEAM-FORWARD-SUBSTRATE]` ✅ — ADR-0028 ("Forward-Substrate: Elixir/BEAM Coordination Layer for Capsule Supervision + OtzarComm + DBGI Integration"); this commit — the arc-closure commit; commits NIOV to ship the Elixir/BEAM COSMP coordination layer as Sub-box 2 Phase 2 (a 6-8-commit / ~3-4-week mini-arc; explicit Elixir, not raw Erlang; capsule supervision trees; OtzarComm messaging at scale; DBGI as supervised process groups; multi-region BEAM clustering; migration triggers — DMW capsule count >1M, OtzarComm projected >10M-100M daily, multi-region deployment; the 6 BEAM-compatibility patterns this record documents at §5; hybrid coexistence — Fastify+TypeScript API + Elixir coordination + Python intelligence + Postgres storage); cites ADR-0026 load-bearingly for the 6 BEAM patterns it commits to ship; cascade: 27→28 ADRs (README + CLAUDE.md §5) + the §6 I-hash backfill above + line 19 / §8 forward-cite → landed-citation conversions + ADR-0026's "(cited from)" block; the J-hash lives in the commit body — the "this commit" placeholders here + in `section-12-progress.md` + in the CLAUDE.md §5 ADR-0026 arc-hash chain refer to this commit by substrate position (keeps the arc at exactly 10 commits) (→ 28 ADRs) — **the 10-commit Sub-box 2 Phase 1 arc closes here**

## 7. Forward paths

- **Sub-box 2 Phase 2** — operation 1 (account creation; gate the `can_admin_org` route, a future `can_admin_niov` one, or both — Phase 2 pre-flight decides); operation 6 (TAR clearance-ceiling mutation; gate the route once it surfaces — possibly Phase 3). Sub-box 2 Phase 2 also ships the Elixir/BEAM COSMP router as a production service per ADR-0028 (a 6-8-commit / ~3-4-week mini-arc; the architectural-honesty discipline — Foundation can ship without it, but the substrate is built BEAM-compatible today).
- **Sub-box 3** — operation 4 (REGULATOR access grant; gate when the REGULATOR `EntityType` ships); operation 5 (lawful-basis attestation; gate when the lawful-basis substrate ships — possibly Sub-box 4).
- **Category (3)** — operation 2's dual-control stays at the PostgreSQL role-permission / secrets-management tier per ADR-0002; the secrets-management substrate documents the role-credential discipline; never enters the `requireDualControl` middleware scope.
- **Category (4)** — operation 3 is closed; no forward path (RULE-10-incompatible).

## 8. References

- `docs/COMPLIANCE_ARCHITECTURE_REVIEW.md` Tension 3 — the source-of-substance for the 4-category framing; the architectural decision (an *enumerated dual-control set, not a general primitive*)
- `packages/database/prisma/schema.prisma:482-490` — the `EscalationType` enum (`DUAL_CONTROL_REQUIRED` per `[SEC-DUAL-CONTROL-ENUM]` `b34c5cf`); `:1106-1132` — the `EscalationRequest` model; `:343-350` — the `EntityType` enum (no `REGULATOR`); `:35` + `:153` + `:165` — the `deleted_at` soft-delete fields; `:279-306` — the `Permission` model (Zone U4 evidence)
- `apps/api/src/services/governance/escalation.service.ts` — the 8-fn escalation service surface + the internal `transitionPendingForCaller` skeleton gate (the source≠resolver discipline)
- `apps/api/src/routes/platform.routes.ts` — the 2 LIVE Category (1) routes; `apps/api/src/routes/auth-admin.routes.ts` — the `can_admin_org` account-creation routes (operation 1); `apps/api/src/services/tar.ts:407` — the TAR clearance-ceiling service-tier flow (operation 6)
- `docs/architecture/dynamic-flow-architecture.md` RAA 12.7 §2.5 — the Zone U1-U4 trust-root canonicalization (Zone U1 — Audit chain integrity at line 127; Zone U4 — Permission grant lineage at line 176)
- `docs/architecture/raa-12-8-substrate-dynamics.md` §1.x — the Zone U1/U4 detail (line 312 Zone U1 + the ADR-0002 BEFORE DELETE trigger; line 318 Zone U4); `:1201` §5.2 ("Human-in-the-loop primitives expansion") — the `EscalationRequest`/HITL substrate this record builds on
- `docs/architecture/decisions/0002-append-only-audit-chain.md` — ADR-0002 (the `audit_events_immutable` BEFORE DELETE trigger; Category (3))
- `CLAUDE.md` — RULE 4 (audit trail is sacred — the audit write commits with the action), RULE 10 (the Capsule soft-delete invariant — Category (4)), RULE 17 (future-session-loading — this doc), ADR-0025 (the schema-push-target discipline used at sub-phase A)
- `[SEC-DUAL-CONTROL-ENUM]` `b34c5cf` + `[SEC-TENSION-3-AMENDMENT]` `6a1a380` — the Sub-box 2 Phase 1 sub-phases A + B; `[SEC-SUBBOX1-ITEM6-DEFER]` `dd6fc09` — the multi-step approval chain deferral (RAA 12.8 §5.2 / §5.9 item 1)
- ADR-0026 `[SEC-DUAL-CONTROL-ADR]` (sub-phase H — the full dual-control middleware + privileged-endpoint-registry + per-route-binding-discipline pattern; cites this canonical record; reconciles this §4); ADR-0028 `[SEC-BEAM-FORWARD-SUBSTRATE]` (sub-phase J — the Elixir/BEAM coordination-layer commitment-to-ship; cites this canonical record's §5 for the 6 BEAM-compatibility patterns; the arc-closure commit)

**Bidirectional citations (cited from):**

- `docs/COMPLIANCE_ARCHITECTURE_REVIEW.md` Tension 3 — the "Category cross-references" paragraph back-cites this canonical record as the implementation-facing per-operation companion (landed at sub-phase C `[SEC-DUAL-CONTROL-CANONICAL-RECORD]`)
- `docs/architecture/raa-12-8-substrate-dynamics.md` §5.2 — back-cites this canonical record as the implementation-facing companion that builds on the §5.2 `EscalationRequest` substrate (landed at sub-phase C `[SEC-DUAL-CONTROL-CANONICAL-RECORD]`)
- `docs/architecture/decisions/0026-dual-control-middleware-pattern.md` (ADR-0026; landed at sub-phase H `[SEC-DUAL-CONTROL-ADR]`) — cites this canonical record as the implementation-facing operational companion to the decision record; bundles the full dual-control pattern (the runtime registry + the `requireDualControl` preHandler + the per-route binding discipline + the 6 BEAM-compatibility patterns); reconciled this §4 (added the 6th `DUAL_CONTROL_TRANSIENT_FAILURE` marker; rewrote the standalone-per-event paragraph) and backfilled the §6 arc-list (C–G commit hashes; H ✅). `docs/architecture/dynamic-flow-architecture.md` RAA 12.7 §2.5 is referenced here as a foundational-canonicalization citation (the Zone U1-U4 trust-root layer) — no reciprocal back-cite at sub-phase C (RAA 12.7 §2.5 is referenced by-citation across the codebase without reciprocity; the RULE-14 foundational-vs-novel-citation distinction is forward-queued for a CLAUDE.md amendment, likely at sub-phase I alongside RULE 20).

## 9. Amendment 2 — [G1-DUAL-CONTROL] payload-bound single-use approvals (2026-07-06)

**Root cause (found in the Phase-0 pre-flight for `NIOV Smoke Org`):** a
dual-control approval was standing authority — `expires_at: null`, no
consume marker, and the match key was (source, `DUAL_CONTROL_REQUIRED`,
APPROVED, `DUAL_CONTROL:<TYPE>`) — so an approved `PLATFORM_ORG_CREATION`
could be replayed by the same source with ANY body to create further orgs
without a second approval. Unacceptable for the highest-trust platform
operation.

**The repair (no schema change):**

- **Payload binding (opt-in per endpoint).** `PrivilegedEndpoint.payloadBinding
  = { redact: [...] }` marks an operation payload-bound. The middleware
  computes `canonicalDualControlPayload(request.body, redact)` — sha256 over
  the recursively key-sorted JSON of the body minus the redacted fields —
  and (a) matches APPROVED escalations per-hash, (b) stamps the hash into
  `resolution_metadata.dual_control` on the auto-created PENDING row (dedup
  is per-payload). The approval therefore authorizes ONE exact payload.
  A different payload opens its own PENDING escalation.
- **Secret redaction.** Redacted fields (org creation: `admin_password`)
  never affect the hash and never leave the hash function; only their
  NAMES are recorded. The body itself is NEVER stored — ADR-0057 §10 +
  the CI no-leak guard forbid body echo in escalation metadata/audit; the
  approver verifies the payload out-of-band against the hash.
- **Single-use consume, atomic with the effect.** The middleware hands the
  verified escalation to the handler via `request.dualControl`; the guarded
  service spends it INSIDE its own transaction
  (`consumeApprovedDualControlInTx` — `executePhase0` STEP 0): a
  status-conditioned `updateMany` APPROVED → EXPIRED is the compare-and-swap
  (the break-glass `markBreakGlassUsed` pattern), `consumed_at` /
  `consumed_by_entity_id` land in `resolution_metadata.dual_control`, and
  the `DUAL_CONTROL_APPROVAL_CONSUMED` Zone U1 marker (existing
  ADMIN_ACTION event_type — no new audit literal) is written in-tx. A
  raced or replayed spend throws `DUAL_CONTROL_ALREADY_CONSUMED`, the
  transaction rolls back, and NO duplicate effect lands (the route maps the
  race to 409 `DUAL_CONTROL_APPROVAL_CONSUMED`). A failed guarded operation
  (e.g. 422) leaves the approval spendable — consume-on-success only.
- **Scope.** LIVE on `PLATFORM_ORG_CREATION` only. The other 6 registry
  entries keep the §5 Pattern-5 standing-approval semantics unchanged;
  extending `payloadBinding` to them is a per-operation decision (forward
  path: `PLATFORM_MONETIZATION_CONFIG_UPDATE` is the natural next
  candidate).

**Audit surface additions (safe fields only):** `payload_bound` +
`payload_hash` on `DUAL_CONTROL_VERIFICATION_PRE` /
`DUAL_CONTROL_ESCALATION_LOOKUP` / `DUAL_CONTROL_HANDLER_DENIED`;
the `DUAL_CONTROL_APPROVAL_CONSUMED` marker on the success path.

**Status note:** `EXPIRED` on a consumed row means "no longer spendable";
the honest distinction from time-expiry lives in
`resolution_metadata.dual_control.consumed_at` + the CONSUMED audit
marker. A dedicated `USED` EscalationStatus value would need a schema
migration and is deliberately NOT taken here.
