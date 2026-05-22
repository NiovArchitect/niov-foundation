# ADR-0050 — GOVSEC.5 Break-Glass / Time-Boxed Audit

- **Status:** Proposed 2026-05-22
- **Phase:** GOVSEC.5 (Admin privilege, break-glass, dual-control) — design-first
  ADR; **no code in this phase**.
- **Gap:** GAP-K1 (insider threat / break-glass misuse — "no break-glass").
- **Supersedes / amends:** none. Companion to ADR-0049 (GOVSEC umbrella),
  ADR-0026 (dual-control middleware pattern), ADR-0036 (REGULATOR + LawfulBasis
  time-boxed access), ADR-0002 (append-only audit chain).

## Context

GOVSEC.5 (per ADR-0049) closes when **dual-control self-approval is resolved,
break-glass exists with mandatory time-boxed audit, and privileged routes are
throttled; tests prove self-approval rejection + break-glass audit completeness.**
Two of the three criteria have landed:

- **GAP-B4 (privileged-route throttle):** G4-C mapped the 4 dual-control
  `PRIVILEGED_ENDPOINTS` routes to a strict `privileged` gateway limit (5/min).
- **GAP-C1 (self-approval):** `escalation.service.ts` `transitionPendingForCaller`
  now rejects `caller === source_entity_id` with `ESCALATION_FORBIDDEN` (before the
  target/resolver gate), closing the self-target placeholder hole; a distinct
  second human is required to approve a dual-control escalation.

**GAP-K1 (break-glass) is greenfield** — there is no break-glass / emergency /
override implementation in the codebase. The two-person dual-control on the 4
privileged operations (revenue-split mutation, tenant provisioning, REGULATOR
access grant/revoke) is now genuinely two-person (post GAP-C1), which means that
if the **second approver is unavailable during a genuine emergency**, the
operation cannot proceed. A government-grade system needs an *auditable, time-
boxed* emergency path so availability does not force operators to weaken
dual-control — without reintroducing a self-approval loophole or a perpetual
bypass.

This ADR locks the **design** of that break-glass capability so a later,
separately-authorized EXECUTE phase can implement it safely. **No code, schema,
audit literal, or test changes are made in this ADR phase.**

## Standards / Source Basis (RULE 21 research arc, retrieved 2026-05-22)

- **NIST SP 800-53 Rev. 5** — AC-3 (Access Enforcement) + AC-6 (Least Privilege)
  require access decisions enforced at the resource; AU-2/AU-6/AU-12 require
  generation and review of audit records for privileged actions. Emergency access
  must remain within the access-enforcement + audit envelope, not outside it.
- **NIST SP 800-207 (Zero Trust Architecture)** — continuous verification + least
  privilege; standing privilege is replaced by per-request, context-evaluated
  access. Break-glass is the bounded, audited exception, not a standing role.
- **Just-in-Time (JIT) privileged access** — the prevailing pattern: no standing
  emergency rights; access is granted for a **minimal, time-bound window**
  (industry guidance: tens of minutes) and auto-revoked, with every use logged.
- **Break-glass best practice (PAM / regulated systems, incl. HIPAA emergency-
  access procedures)** — emergency access must be: explicitly invoked with a
  recorded justification; **time-bound with automatic expiry**; subject to a
  **two-person / multi-person control** (either before activation or as mandatory
  post-hoc review); recorded in a **tamper-proof audit trail**; scoped narrowly;
  and reviewed after use.
- **SOC 2 CC6 / ISO 27001 (A.5.18 / A.8.2 privileged access)** — privileged and
  emergency access require authorization, time limits, logging, and periodic
  review.
- **Foundation-internal precedent** — `LawfulBasis` (ADR-0036) is the canonical
  time-boxed-grant model already in this repo: `valid_from` + **mandatory
  `valid_until`** ("no perpetual lawful basis"), chain-hashed, audited. Break-glass
  mirrors this pattern. The append-only audit chain (ADR-0002) and its
  `AUDIT_EVENT_TYPE_VALUES` literal list (`audit.ts`) are the audit substrate;
  new append-only literals (e.g. `RATE_LIMITED` at G4-B1, `REGULATOR_ACCESS_*` at
  Sub-box 3) are added to `audit.ts` **without** amending ADR-0002.

(Sources summarized in repo style; not over-quoted.)

## Decision

Break-glass is a **time-boxed emergency grant**, designed as follows. All points
are LOCKED by Founder authorization at this ADR's landing.

1. **Model (LOCK).** Break-glass is a *time-boxed emergency grant*, not a
   permanent role, not a general bypass, and **not a way to self-approve**. It is
   invoked with an **explicit justification**, **scoped to a specific privileged
   action/route** (or a narrow operation family), and carries a **mandatory
   `valid_until`** — **no perpetual break-glass access**.

2. **Scope (LOCK).** Initial scope is the **4 dual-control `PRIVILEGED_ENDPOINTS`
   routes only** — `PATCH /api/v1/platform/monetization/config`,
   `POST /api/v1/platform/orgs`, `POST /api/v1/regulator/access-grants`,
   `POST /api/v1/regulator/access-revocations`. The broader org-admin
   `requireAdminCapability` route set is a **separate GOVSEC.5 follow-on** and is
   NOT in the first break-glass code phase.

3. **Dual-control relationship (LOCK).** The **normal path remains dual-control**
   (a distinct second human approves the escalation). Break-glass is a
   **constrained emergency alternative**, never a weakening of dual-control. The
   **GAP-C1 self-approval guard remains intact** — `caller === source_entity_id`
   stays forbidden in ordinary dual-control approval, and break-glass must NOT
   reintroduce a caller/self-approval loophole. **Chosen relationship:** an
   authorized actor invokes a short, time-boxed emergency grant; the privileged
   action may proceed under a valid, unexpired grant; and a **mandatory post-hoc
   two-person audit/review trail** is required (matching the matrix's "mandatory
   time-boxed two-person audit"). (The first code phase MAY instead require a
   second actor *before* activation; this ADR fixes the security properties, and
   the EXECUTE phase's QLOCK selects between "invoke + mandatory post-hoc
   two-person review" and "second-actor-before-activation" — both satisfy the
   properties in §Security properties.)

4. **Audit (LOCK).** Break-glass requires **explicit audit completeness**. The
   future code phase must emit append-only audit events for, at minimum:
   **break-glass invoked**, **break-glass used/consumed for a privileged action**,
   **break-glass expired/closed**, and **break-glass reviewed** (if post-hoc
   review is the chosen model). These will be **new append-only literals in
   `audit.ts`** (e.g. `BREAK_GLASS_INVOKED` / `BREAK_GLASS_USED` /
   `BREAK_GLASS_EXPIRED` / `BREAK_GLASS_REVIEWED` — exact names fixed at the
   EXECUTE QLOCK). **ADR-0002 amendment is NOT required** merely for additive
   literals — `audit.ts` is the append-only literal list and ADR-0002 governs the
   chain mechanism + BEFORE-DELETE trigger; this is the established precedent
   (G4-B1 `RATE_LIMITED`, Sub-box 3 `REGULATOR_ACCESS_*`, ADR-0042
   `CAPSULE_MUTATION_*`). **No `audit.ts` change in this ADR phase.**

5. **Schema (LOCK).** The future code phase will require a **`BreakGlassGrant`-
   style table** (or equivalent substrate), mirroring the `LawfulBasis`
   time-boxed pattern: invoker/source entity; scoped action/route; justification;
   `valid_from`; **mandatory `valid_until`**; status; and audit/review linkage.
   **`EscalationRequest.expires_at` is NOT sufficient** — it time-boxes a dual-
   control escalation's *approval validity*, not a temporary *emergency access
   grant* (different lifecycle, different actor model, different audit contract).
   **No schema/migration in this ADR phase.**

6. **Integration (LOCK).** The future code phase may require: a service to
   create/validate/close break-glass grants; a route to invoke break-glass;
   `dual-control.middleware.ts` recognition of a valid, unexpired grant as an
   alternative authorization (without weakening the normal dual-control or the
   GAP-C1 guard); audit emission for invoke/use/expiry/review; and tests proving
   audit completeness. **This ADR does not authorize code** — the code phase
   requires a separate `[…-EXECUTE-VERIFY-AUTH]`.

7. **Status (LOCK).** After this ADR phase, **GAP-K1 is "designed / ADR
   Proposed", not closed**. **GOVSEC.5 remains OPEN** and cannot close until the
   break-glass code + audit-completeness tests land. **GAP-O7 remains open**;
   **D2-C / ip_whitelist / `getOrgSettingsOrDefaults` remain deferred to
   GOVSEC.7**; GOVSEC.7 is untouched.

## Non-goals

- **Not** implementing break-glass (no code/schema/audit literal/tests) in this
  ADR phase.
- **Not** closing GOVSEC.5 or GAP-K1.
- **Not** implementing the org-admin route-set throttle (separate follow-on).
- **Not** touching D2-C / ip_whitelist / `getOrgSettingsOrDefaults` / GOVSEC.7.
- **Not** changing the G4-C privileged throttle or the G4-B2-B swarm counter.
- **Not** modifying `audit.ts` / schema / production code in this ADR phase.

## Proposed future substrate (for the EXECUTE phase, not landed here)

- A `BreakGlassGrant`-style table (mirroring `LawfulBasis`): invoker entity,
  scoped action/route, justification, `valid_from`, mandatory `valid_until`,
  status, audit/review linkage.
- New append-only audit literals in `audit.ts` (invoke / use / expire / review).
- A break-glass service (create/validate/close), a route to invoke, and
  `dual-control.middleware.ts` recognition of a valid grant.
- Integration + unit tests proving audit completeness, time-boxing, scoping, and
  that the GAP-C1 self-approval guard and the normal dual-control path are intact.

## Security properties (must hold in the code phase)

- **No perpetual emergency access** — mandatory `valid_until`; expiry enforced.
- **No self-approval loophole** — the GAP-C1 `caller === source` guard remains;
  break-glass is a distinct, audited path, never a self-approval.
- **Scoped** — a grant authorizes only its specific action/route.
- **Mandatory justification** — recorded at invocation.
- **Mandatory audit** — invoke / use / expiry (+ review) all on the append-only
  chain.
- **Expiry + closure** — grants auto-expire; expired grants are rejected.
- **Reviewability** — mandatory post-hoc two-person audit/review trail (or
  second-actor-before-activation), per the EXECUTE QLOCK.

## Test plan for the future code phase

- Invocation requires an authorized actor; unauthorized invocation rejected.
- `valid_until` is mandatory; a grant without it is rejected.
- Expired grants are rejected (the privileged action does not proceed).
- A grant is scoped only to its intended route/action (no cross-action use).
- Under a valid, unexpired grant, the privileged route proceeds (if the model
  allows direct proceed) — exercised against the 4 `PRIVILEGED_ENDPOINTS`.
- All usage is audited (invoke / use / expiry); post-hoc review is audited if
  included; audit completeness asserted.
- The GAP-C1 self-approval guard remains intact (`caller === source` still
  forbidden in ordinary dual-control approval).
- G4-C privileged throttle still applies to the routes; G4-B2-B swarm unchanged.
- No GAP-O7 closure; no CI p99/timing assertions; no real Redis.

## Implementation lineage

- **ADR phase (`05c334d`):** docs-only — ADR-0050 Proposed + catalog/back-
  citation updates. No code, schema, audit literal, or tests.
- **BG.1 — substrate-first (2026-05-22):** LANDED. Prisma `BreakGlassGrant` table
  (mandatory `valid_until`, `action_type` scope, review fields; db-push,
  Prisma-only, no migration) + `BreakGlassStatus` enum + the 4 additive
  `BREAK_GLASS_*` audit literals (no ADR-0002 amendment) + the break-glass service
  (`break-glass.service.ts`: create/validate/markUsed/expire/review; mandatory
  justification + future `valid_until`; 4-action `PRIVILEGED_ENDPOINTS` scope;
  single-use; **reviewer ≠ source** self-review prohibition; per-mutation audit
  in-tx) + service-level unit tests + the `@niov/api` barrel export. **No
  middleware/route wiring — NO live bypass.** Database-barrel re-export of the
  model types and the API-barrel re-export of the service functions were the
  mandatory central-export surfaces (the latter under a focused barrel-export
  authorization). The chosen relationship model is **authorized invoke + short
  time-box + mandatory post-hoc two-person review** (`reviewer ≠ source`).
- **BG.2 — live integration (2026-05-22):** LANDED. NEW
  `apps/api/src/routes/break-glass.routes.ts` — `POST /api/v1/break-glass/grants`
  (invoke) + `POST /api/v1/break-glass/grants/:grant_id/review` (review), both
  `requireAdminCapability("can_admin_niov")` (the tier of the 4 privileged
  endpoints); registered in `server.ts`. The live recognition seam in
  `dual-control.middleware.ts` fires **only in the Denied/PermanentFailure
  branch, after** no APPROVED escalation is found and **before** the
  get-or-create-PENDING + 403: it calls `validateBreakGlassGrant(callerEntityId,
  actionDescriptor.type)` and, if a valid grant exists, `markBreakGlassUsed` —
  delegating to the privileged handler **only if the consume succeeds** (the
  atomic ACTIVE→USED is the authoritative single-use gate and closes the
  validate-then-use TOCTOU window; a lost race / non-ACTIVE grant falls through
  to the normal 403). A normal APPROVED dual-control **always wins first** (that
  path returns earlier). The middleware does **not** call `expireBreakGlassGrant`
  (expired grants are excluded by `validateBreakGlassGrant`; no request-path
  expiry write). A `details.action = "DUAL_CONTROL_BREAK_GLASS_DELEGATED"` marker
  is written on the existing `ADMIN_ACTION` event_type (no new `AuditEventType`
  literal; `BREAK_GLASS_USED` is emitted in-tx by `markBreakGlassUsed`); audit
  metadata carries grant/action/route identifiers only — never the justification.
  NEW `tests/integration/break-glass-integration.test.ts`. **No schema / audit-
  literal / `privileged-endpoints.ts` / platform-or-regulator-handler / gateway /
  `escalation.service.ts` change.** GAP-C1 self-approval guard untouched. **GAP-K1
  remains NOT closed; GOVSEC.5 remains OPEN** (closure is BG.3).
- **BG.3 — closure (future):** ADR-0050 Proposed→Accepted + GAP-K1 closed + docs.
- **GOVSEC.5 closure (future):** when self-approval (done) + break-glass code +
  audit-completeness tests are all landed and verified.

## Founder authorization

Created under explicit Founder authorization per RULE 20 at
`[GOVSEC-GOVERNMENT-GRADE-HARDENING-GOVSEC5-BREAK-GLASS-TIMEBOXED-AUDIT-ADR-AUTH]`
(2026-05-22). RULE 21 research arc embedded in §Standards / Source Basis. Cites
ADR-0049 (GOVSEC umbrella), ADR-0026 (dual-control), ADR-0036 (LawfulBasis
time-boxed access), ADR-0002 (append-only audit chain), and GAP-C1 / GAP-B4 /
GAP-K1 per `docs/reference/govsec-control-matrix.md`.
