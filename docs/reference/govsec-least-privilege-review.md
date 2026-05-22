# GOVSEC.5 GAP-K2 Least-Privilege Capability Review

- **Status:** Completed / documented 2026-05-22
- **Scope:** policy-runbook review record for **GAP-K2 only** (per
  `docs/reference/govsec-control-matrix.md` GAP-K2: surface "TAR caps /
  clearance ceiling"; threat "no least-privilege capability review"; type
  **policy-runbook**; evidence **review record**; closure criterion
  **"least-privilege review documented"**).
- **State:** this document is the GAP-K2 closure evidence. **GOVSEC.5 closure is
  deferred to a separate closure cascade** — this review does not flip GOVSEC.5.
- **Companion:** ADR-0049 (GOVSEC umbrella) §GAP-K2 note; `govsec-control-matrix.md`
  GAP-K2 row.

This is an internal evidence review against the repo substrate at
`origin/main` `f06be711738ebbbaedffa7fa3dc41affba5da5ba`. No external research.

---

## A. Source basis (substrate inspected)

- `docs/reference/govsec-control-matrix.md` — GAP-K2 row + the GOVSEC.5 gap set
  (GAP-C1 + GAP-K1 + GAP-K2).
- `docs/architecture/decisions/0049-govsec-government-grade-hardening.md` —
  GOVSEC.5 phase scope + closure criteria notes.
- `packages/database/prisma/schema.prisma` — `TokenAttributeRepository` (TAR)
  capability model + `Session` clearance snapshot.
- `apps/api/src/middleware/admin.middleware.ts` — `requireAdminCapability` +
  the `AdminCapability` type.
- `apps/api/src/middleware/dual-control.middleware.ts` +
  `apps/api/src/security/privileged-endpoints.ts` — the dual-control gate +
  the privileged-endpoint registry.
- `apps/api/src/middleware/gateway.middleware.ts` — the throttle classes
  (`privileged` 5/min, `admin_reset` 5/min, `admin` 60/min, `default` 300/min).
- Route files: `platform.routes.ts`, `regulator.routes.ts`,
  `break-glass.routes.ts`, `org.routes.ts`, `auth-admin.routes.ts`,
  `otzar-observation.routes.ts`.
- `apps/api/src/services/governance/break-glass.service.ts` +
  `escalation.service.ts` — the break-glass + dual-control service tiers.
- Tests: dual-control-binding, regulator-routes, gateway-privileged-throttle,
  gateway-org-admin-throttle, break-glass-integration, escalation.

---

## B. Capability inventory (TAR model)

Capabilities live on `TokenAttributeRepository` (Prisma, schema §`model
TokenAttributeRepository`) as a flat set of boolean flags plus a clearance
integer; `clearance_ceiling` is snapshotted into `Session` at issue time.

| Capability | Type | Default | Purpose |
|---|---|---|---|
| `can_login` | Boolean | `true` | Authenticate / open a session |
| `can_read_capsules` | Boolean | `true` | Read Memory Capsule content/metadata |
| `can_write_capsules` | Boolean | `true` | Create / update capsules |
| `can_share_capsules` | Boolean | `true` | Grant access to other entities |
| `can_create_hives` | Boolean | `false` | Create Hive Intelligence groupings |
| `can_access_external_api` | Boolean | `false` | Use the external/developer API |
| `can_admin_niov` | Boolean | `false` | **NIOV-platform admin** (highest tier) |
| `can_admin_org` | Boolean | `false` | **Org-tenant admin** (tenant tier) |
| `clearance_ceiling` | Int | `0` | Max clearance for capsule/data access |
| `monetization_role` | enum | — | 70/30 monetization role |
| `compliance_frameworks` | — | — | Bound compliance regimes |
| `status` | enum | — | TAR lifecycle (`ACTIVE` required for any cap) |

**Observation:** the model is a *flat capability set* (capability-based, not
RBAC role hierarchy). Admin authority is expressed by exactly two flags
(`can_admin_niov`, `can_admin_org`); data authority is expressed by the
read/write/share flags + `clearance_ceiling`. Per RULE 0, AI entities carry
lower default ceilings (enforced elsewhere in the COSMP permission path).

---

## C. Admin capability enforcement

- `requireAdminCapability(authService, capability)`
  (`apps/api/src/middleware/admin.middleware.ts`) is the per-route admin gate.
- `AdminCapability = "can_admin_org" | "can_admin_niov"` — **exactly two admin
  tiers**; the type prevents a route from requesting an unsupported capability.
- Enforcement: validate the bearer session (`read`-tier), fetch the TAR, and
  require `tar.status === "ACTIVE"` **and** `tar[capability] === true`; otherwise
  `403 ADMIN_CAPABILITY_REQUIRED`. The capability flag — not the session tier —
  does the authorization work.
- **NIOV-platform admin (`can_admin_niov`)** is the highest tier (platform-wide
  operations); **org-tenant admin (`can_admin_org`)** is scoped to a tenant's
  own org administration. The two are distinct and non-overlapping in the
  middleware (a route names exactly one).

---

## D. Route-to-capability inventory

### D.1 `can_admin_niov` (NIOV-platform tier)

| Route family / path | Capability | Risk class | Defense-in-depth | LP assessment | Finding |
|---|---|---|---|---|---|
| `PATCH /api/v1/platform/monetization/config` | can_admin_niov | High (economic) | dual-control + `privileged` 5/min + break-glass-only emergency | Appropriate — highest tier + two-person + strict throttle | OK |
| `POST /api/v1/platform/orgs` | can_admin_niov | High (tenant provisioning) | dual-control + `privileged` 5/min + break-glass | Appropriate | OK |
| `POST /api/v1/regulator/access-grants` | can_admin_niov | High (regulatory access) | dual-control + `privileged` 5/min + LawfulBasis | Appropriate | OK |
| `POST /api/v1/regulator/access-revocations` | can_admin_niov | High | dual-control + `privileged` 5/min | Appropriate | OK |
| `/api/v1/platform/*` reads (`/anomalies` `/audit` `/loops` `/stats`) | can_admin_niov | Med (platform observability) | `admin` 60/min throttle | Acceptable — read-only platform telemetry, platform-tier appropriate | OK |
| `POST /api/v1/break-glass/grants` (invoke) | can_admin_niov | High (emergency authority) | time-box + single-use + scope + `admin` 60/min | Appropriate (see §F) | OK |
| `POST /api/v1/break-glass/grants/:id/review` (review) | can_admin_niov | High (two-person audit) | reviewer ≠ source + `admin` 60/min | Appropriate | OK |

### D.2 `can_admin_org` (org-tenant tier)

| Route family / path | Capability | Risk class | Defense-in-depth | LP assessment | Finding |
|---|---|---|---|---|---|
| `/api/v1/org/*` (~38: members, entities, ai-teammates, intelligence, onboarding, workflows; GET/POST/PATCH/DELETE) | can_admin_org | Med (tenant admin) | `admin` 60/min throttle; tenant-scoped by org context | Acceptable — tenant admins manage their own org; scope is the tenant boundary | OK; coarse (see §J) |
| `POST /api/v1/auth/admin-register` | can_admin_org | Med (provision a tenant user) | `admin` 60/min | Acceptable | OK |
| `POST /api/v1/auth/admin-reset` | can_admin_org | Med-High (credential reset trigger) | `admin_reset` 5/min (strict) | Acceptable — stricter throttle reflects the higher risk | OK |
| `POST /api/v1/otzar/domain/vocabulary` | can_admin_org | Low-Med (domain config) | `admin` 60/min | Acceptable | OK |

---

## E. Privileged-endpoint assessment (the 4 `PRIVILEGED_ENDPOINTS`)

For all four (`PATCH /platform/monetization/config`, `POST /platform/orgs`,
`POST /regulator/access-grants`, `POST /regulator/access-revocations`):

- **Capability:** `can_admin_niov` (highest tier).
- **Dual-control:** required — a second distinct human must APPROVE an
  `EscalationRequest` before the handler runs (ADR-0026).
- **Privileged throttle:** `privileged` 5/min, entity-scoped (G4-C / GAP-B4).
- **Break-glass:** the only constrained emergency bypass — time-boxed,
  single-use, scoped to exactly these 4 action types, two-person post-hoc review
  (ADR-0050).
- **Self-approval guard:** preserved — `caller === source_entity_id` is rejected
  (`ESCALATION_FORBIDDEN`, GAP-C1), so a single actor cannot self-approve.

**Assessment:** least-privilege is **acceptable** under the current two-tier
admin model: the highest-stakes routes require the highest capability **and** a
second human **and** a strict throttle **and** an audited, time-boxed, single-use
emergency path. The capability is not "overly broad" relative to the action,
because the action is gated by multiple independent compensating controls beyond
the capability flag itself. No immediate code change required.

---

## F. Break-glass assessment

- Invoke + review both require `can_admin_niov`.
- Grant is **time-boxed** (mandatory non-null `valid_until`; no perpetual grant),
  carries an **explicit justification**, is **scoped** to the 4 privileged
  action types, is **single-use** (atomic ACTIVE→USED), and the **reviewer must
  differ from the source** (`BREAK_GLASS_SELF_REVIEW_FORBIDDEN`); **justification
  never leaks** in responses or audit metadata; routes carry the `admin` 60/min
  throttle.

**Assessment:** acceptable; no weaker-than-appropriate capability found. A 60/min
ceiling is far above any legitimate emergency cadence while bounding abuse. The
emergency authority is tightly constrained beyond the capability flag.

---

## G. Org-admin assessment

- `can_admin_org` covers the org tenant-admin route surface (`/api/v1/org/*` +
  `auth-admin` admin-register/admin-reset + otzar domain/vocabulary).
- The org-admin route-set throttle (`admin` 60/min, entity-scoped) is now landed
  (GAP-B4 follow-on), so this surface is no longer on the generous `default`
  (300/min).

**Assessment:** acceptable under the current org-admin tier. Tenant admins act
within their own org boundary. A finer-grained set of org sub-capabilities
(e.g. separating member-management from workflow-configuration from
intelligence-read) **may** be useful later but is **not required** to close
GAP-K2 (see §J forward-substrate).

---

## H. Clearance-ceiling assessment

- `clearance_ceiling` exists on the TAR (`@default(0)`) and is snapshotted into
  the `Session` at issue time.
- It governs **capsule/data access** (the COSMP permission path), not route admin
  capability by itself; admin routes are gated by the `can_admin_*` flags, while
  data access is gated by clearance + the read/write/share flags + per-capsule
  conditions.

**Assessment:** no immediate conflict with the route capability model — the two
authorization axes (admin-route capability vs. data clearance) are orthogonal and
both default-deny for elevated access (`can_admin_*` default `false`,
`clearance_ceiling` default `0`). No change required.

---

## I. Defense-in-depth controls (summary)

The capability model is reinforced by independent layers, so a coarse capability
flag is not the sole gate on any high-risk action:

- **Dual-control** (two-person APPROVE) on the 4 privileged routes.
- **Self-approval prohibition** (GAP-C1) — `caller ≠ source`.
- **Break-glass** — time-boxed, single-use, scoped, two-person-reviewed emergency
  path (GAP-K1 / ADR-0050).
- **Throttle tiers** — `privileged` 5/min, `admin_reset` 5/min, `admin` 60/min,
  `default` 300/min, plus the G4-B2-B distributed-swarm counter.
- **Default-deny capabilities** — `can_admin_niov` / `can_admin_org` /
  `can_create_hives` / `can_access_external_api` all default `false`;
  `clearance_ceiling` defaults `0`.
- **RULE 0** — AI entities carry lower default permission ceilings than humans.
- **Append-only audit** (ADR-0002) on privileged + break-glass actions.

---

## J. Findings

1. **No immediate least-privilege violation requiring code was found.** No route
   grants more authority than its action needs once the layered compensating
   controls are accounted for; the highest-risk routes carry the highest
   capability plus dual-control plus strict throttle plus a constrained
   emergency path.
2. **The model is coarse but defensible.** Admin authority is expressed by two
   tiers (`can_admin_niov`, `can_admin_org`); data authority by the read/write/
   share flags + `clearance_ceiling`. The coarseness is compensated by
   defense-in-depth (§I).
3. **GAP-K2 closure criterion is satisfied** by this documented review (the
   matrix requires a "review record" / "least-privilege review documented").
4. **Forward-substrate recommendation (NOT implemented):** if finer granularity
   is later desired, a future Founder-authorized ADR + code phase could split
   `can_admin_org` into narrower org sub-capabilities (member-management vs.
   workflow-config vs. intelligence-read) and/or introduce per-action capability
   tokens. This is an enhancement opportunity at Sev Low / Like Low, **not** a
   GAP-K2 closure blocker.

---

## K. Non-goals (this phase)

No schema changes; no new capabilities; no route changes; no middleware changes;
no audit literals; no ADR-0002 amendment; no GOVSEC.5 closure; no code of any
kind. This is a documentation/evidence review only.

---

## L. Closure statement

- **GAP-K2:** CLOSED / documented (this review is the evidence record).
- **GOVSEC.5:** remains **OPEN** — closure is a separate cascade. With GAP-C1
  (resolved) + GAP-K1 (CLOSED) + the org-admin throttle (CLOSED) + GAP-K2 (this
  review) all landed, GOVSEC.5 has no remaining open gap, but its OPEN→CLOSED
  flip (and reconciliation of the ADR-0049 §closure-criteria narrow-checklist vs.
  broader-phase-scope drift surfaced at BG.3) is performed in a separate
  Founder-authorized GOVSEC.5 closure cascade, not here.
- **GAP-O7:** remains open. · **D2-C / ip_whitelist / `getOrgSettingsOrDefaults`:**
  deferred to GOVSEC.7. · **GOVSEC.7:** untouched.

Founder authorization explicit at
`[GOVSEC-GOVERNMENT-GRADE-HARDENING-GOVSEC5-GAP-K2-LEAST-PRIVILEGE-EXECUTE-VERIFY-AUTH]`.
