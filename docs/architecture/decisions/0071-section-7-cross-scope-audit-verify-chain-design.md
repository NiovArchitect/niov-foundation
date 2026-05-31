# ADR-0071: Section 7 Cross-Scope Audit Verify-Chain Design (design-only)

## Status

Accepted 2026-05-31

Decider: Founder. Authorized at
`[FOUNDER-ADR-0071-SECTION-7-CROSS-SCOPE-AUDIT-VERIFY-CHAIN-DESIGN-AUTH]`
(2026-05-31).

This is a **design-only contract ADR**. It locks the
substrate contract for expanding
`GET /api/v1/audit/verify-chain` from self-only to the
canonical Section 7 four-scope matrix (`self` / `org` /
`platform` / `regulator`). Implementation is **forward-
substrate** behind a separate Founder authorization at the
implementation slice.

**No code, no schema migration, no new routes, no new audit
literal, no service-method signature change, no regulator
portal implementation, no evidence room implementation, no
legal hold implementation, no disclosure workflow, no
external delivery provider, no Control Tower UI, no BEAM
implementation, no Python implementation, no blockchain /
GATS / payment work, no compliance certification, no legal-
advice engine in this commit.**

## Context

### Why a new ADR

ADR-0070 §Forward queue item 1 names "Section 7 cross-chain
`verify-chain` scope expansion" as the forward substrate
that closes the gap between the self-only verify-chain LIVE
today and the regulator-ready evidence flows the doctrine
canonicalizes. ADR-0071 is the design contract for that
expansion.

ADR-0071 inherits ADR-0070's regulator-ready doctrine (§3.7
examination room workflow + §3.10 scoped regulator access
never raw + §8 security/privilege boundaries + §9 legal-
advice boundary) and ADR-0069's substrate-coherence law
(§2.1 TypeScript/Fastify owns the API contract layer; §3
domain 7 audit/event ingestion at scale is BEAM-fit at
future scale). It is **not** the examination room or the
evidence package; it is the chain-integrity verification
primitive that those future surfaces will compose against.

### Substrate-honest Phase 0 (verified at HEAD `d1aabe4`)

LIVE substrate:

- **`GET /api/v1/audit/verify-chain`** (bearer + `read`)
  at `apps/api/src/routes/audit.routes.ts:130-153`. Calls
  `verifyAuditChainForCaller(callerId)` at
  `apps/api/src/services/audit/audit-view.service.ts:855`.
  Returns `VerifyAuditChainView { actor_entity_id, valid,
  total_events, broken_at }` per §351-356.
- **`verifyAuditChain(entity_id)`** primitive at
  `packages/database/src/queries/audit.ts:753`. Walks ALL
  `AuditEvent` rows where `actor_entity_id = entityId`
  ordered by `timestamp ASC`. For each row, recomputes
  `event_hash = sha256Hex(canonicalRecord({audit_id +
  event_type + actor_entity_id + target_entity_id +
  target_capsule_id + session_id + outcome + denial_reason
  + details + ip_address + timestamp + previous_event_hash
  + lawful_basis_id + lawful_basis_chain_hash}))` (14
  fields per ADR-0036 §Sub-decision 5) and verifies
  `previous_event_hash` linkage. Returns
  `VerifyAuditChainResult { valid, totalEvents, brokenAt }`.
- **`AuditViewScope = "self" | "org" | "platform"`** at
  audit-view.service.ts:161. NOTE: regulator scope is
  **NOT** a member of this scope-enum — regulator is a
  separate `/regulator-view` route with mandatory
  `lawful_basis_id` and `AUDIT_VIEW_REGULATOR` audit
  discriminator. ADR-0071 §3 adds `regulator` to the
  verify-chain-only scope vocabulary; the existing list/
  single/export routes are NOT touched.
- **`scope=org`** requires `can_admin_org` TAR check;
  **`scope=platform`** requires `can_admin_niov`. Existing
  `callerHasAdminCapability` / `callerHasPlatformCapability`
  TAR-authoritative helpers at audit-view.service.ts:504+.
- **9 read-audit literals** existing at audit-view.service.ts
  :485-493: `AUDIT_VIEW_LIST / EVENT / VERIFY_CHAIN /
  ORG_LIST / ORG_EVENT / PLATFORM_LIST / PLATFORM_EVENT /
  EXPORT / REGULATOR`. **`AUDIT_VIEW_VERIFY_CHAIN`** is
  already emitted; ADR-0071 extends its `meta` (scope +
  optional lawful_basis_id + checked_event_count + window)
  without adding a new literal.
- **`/api/v1/audit/events/regulator-view`** LIVE (ADR-0036
  Sub-box 3 Wave 5) — `lawful_basis_id` REQUIRED; 9-condition
  ADR-0036 enforcement; SAFE projection drops fields
  outside basis; existing failure codes:
  `LAWFUL_BASIS_NOT_FOUND / LAWFUL_BASIS_EXPIRED /
  REGULATOR_TARGET_MISMATCH` + jurisdiction / authority /
  data-class checks.
- **Pagination/perf caps**: `MAX_AUDIT_EVENTS_PAGE_SIZE = 100`
  + `EXPORT_AUDIT_EVENTS_MAX_ROWS = 10_000`. No window
  cap for verify-chain at v1 self-only (the caller's own
  chain is bounded by their activity volume).

### What is missing (the design gap ADR-0071 closes)

- No `scope` query param on `verify-chain` — the route is
  hard-coded self-only.
- No window controls on `verify-chain` — `verifyAuditChain`
  walks the entire actor chain unbounded. At self-only
  this is acceptable; at org/platform scope it is a perf
  trap (millions of rows possible).
- No regulator-scope chain verification — the existing
  `/regulator-view` returns events but does NOT verify
  chain integrity around them. Regulator examination
  readiness needs cryptographic chain-continuity proof for
  the events visible under a `lawful_basis_id`.
- No canonical failure-code vocabulary for the scope-
  aware verify-chain surface.
- No closed-vocab `failure_reason` enum for chain breaks
  at the SAFE projection register (the existing self-only
  surface returns `broken_at: string | null` and nothing
  else when invalid).

ADR-0071 closes these gaps at the design register.

### Patent + doctrine alignment

- **ADR-0070 §3.7** (examination room workflow): scoped
  regulator access + access logs + minimal data exposure
  + no raw backdoors. Verify-chain is a chain-integrity
  primitive, NOT an examination room; the design
  preserves §3.7's "no raw backdoor" + "minimal exposure"
  invariants.
- **ADR-0070 §3.10** (scoped regulator access): lawful-
  basis-bound + expiration-aware + auditable. Inherited
  by-construction from existing ADR-0036 substrate.
- **ADR-0070 §8** (security / privacy / privilege
  boundaries): forbidden fields enumerated; ADR-0071 §5
  Forbidden Fields inherits.
- **ADR-0070 §9** (legal-advice boundary): verify-chain
  proves chain-hash integrity; it does NOT certify
  compliance, attest disclosure timeliness, or claim legal
  sufficiency.
- **ADR-0069 §2.1** (TypeScript owns the product/API
  contract layer): ADR-0071 v1 stays TypeScript route +
  service work; no BEAM at this slice.
- **ADR-0069 §3 domain 7** (audit/event ingestion at
  scale): future continuous verification or high-throughput
  chain integrity streaming is BEAM-fit per ADR-0069 §6
  architecture check.
- **US 12,517,919 + 12,164,537 + 12,399,904**: audit-chain
  integrity is the canonical "proof of governed access"
  primitive across the three patents. Cross-scope
  verification operationalizes that proof for org-admin,
  niov-admin, and regulator audiences without violating
  RULE 0.

## Decision

Foundation expands `GET /api/v1/audit/verify-chain` to the
canonical Section 7 four-scope matrix (`self` / `org` /
`platform` / `regulator`) at the design contract register.
Locks below; implementation is forward-substrate.

### 1. Four-scope matrix

| scope | gate | scope fence | chain set verified | lawful_basis_id |
|---|---|---|---|---|
| `self` | bearer + `read` | caller's own `actor_entity_id` | one chain (caller's) | n/a |
| `org` | bearer + `read` + `can_admin_org` TAR-authoritative | EntityMembership-scoped same-org entities | N chains (one per same-org entity in window) | n/a |
| `platform` | bearer + `read` + `can_admin_niov` TAR-authoritative | platform-wide | M chains in window | n/a |
| `regulator` | bearer + `read` + REGULATOR EntityType + ADR-0036 9-condition enforcement | events visible under `lawful_basis_id` only | continuity verification of chain SEGMENTS around visible events | REQUIRED |

`scope=self` is default; `scope=` query param accepts the
4 values verbatim; invalid string → 400 `INVALID_SCOPE`.

### 2. Regulator scope semantics

Regulator verify-chain MUST:

- Require `lawful_basis_id` query param. Missing → 400
  `LAWFUL_BASIS_REQUIRED`.
- Resolve `LawfulBasis` via the existing ADR-0036
  primitive. Unknown id → 404 `LAWFUL_BASIS_NOT_FOUND`.
- Verify the LawfulBasis is still active per ADR-0036
  9-condition enforcement: `revoked_at IS NULL` AND
  `valid_until > NOW()`. Expired → 403
  `LAWFUL_BASIS_EXPIRED`. (Inherits existing existing
  `regulator-view` semantics verbatim.)
- Verify the caller is the REGULATOR target of the basis
  via existing `regulator-view` enforcement. Mismatch →
  403 `REGULATOR_TARGET_MISMATCH` (existing code).
- Verify chain CONTINUITY around the events visible to
  this basis: for each visible event, recompute
  `event_hash` from the 14-field canonical record + verify
  `previous_event_hash` matches the PRIOR row in the same
  `actor_entity_id` chain. Continuity verification touches
  the prior row's `event_hash` but does NOT expose the
  prior row's other fields (e.g., `details`,
  `target_capsule_id`, `event_type`) — the response
  surfaces only chain-link integrity, not the surrounding
  events.
- Respect jurisdiction / authority / data-class checks
  per ADR-0036 §Sub-decision 5. Failure → existing 403
  codes inherited verbatim.

The regulator-scope output proves "the audit chain around
the events I am permitted to see is cryptographically
intact" without leaking the existence or content of
invisible adjacent events beyond what `previous_event_hash`
already exposes structurally (the hash chain itself).

### 3. SAFE `VerifyChainView` projection

```ts
export type VerifyChainScope = "self" | "org" | "platform" | "regulator";

export type VerifyChainFailureReason =
  | "HASH_MISMATCH"
  | "PREVIOUS_LINK_MISMATCH"
  | "MISSING_PREVIOUS_EVENT"
  | "CANONICAL_RECORD_DRIFT";

export interface VerifyChainView {
  ok: true;
  scope: VerifyChainScope;
  verified: boolean;
  checked_event_count: number;
  chain_algorithm: "SHA-256/14-field-canonical-record";

  // Window bounds — required for org/platform/regulator;
  // optional for self.
  window_start: string | null; // ISO timestamp
  window_end: string | null;

  // Boundary hashes — exposed at v1 only when verified=true
  // for self/org/platform. For regulator scope, boundary
  // hashes are scoped to visible events only and may be
  // null if the visible event set is empty.
  first_event_id: string | null;
  last_event_id: string | null;
  first_event_hash: string | null; // safe; already on-chain
  last_event_hash: string | null;

  // Failure detail — populated only when verified=false.
  broken_at_event_id: string | null;
  failure_reason: VerifyChainFailureReason | null;

  // Regulator-scope only.
  lawful_basis_id: string | null;

  // Closed-vocab honest copy at service tier.
  evidence_note: string;
  honest_note: string;
}
```

### 4. Allowed fields (enumerated)

`ok` + `scope` + `verified` + `checked_event_count` +
`chain_algorithm` + `window_start` + `window_end` +
`first_event_id` + `last_event_id` + `first_event_hash` +
`last_event_hash` + `broken_at_event_id` +
`failure_reason` + `lawful_basis_id` + `evidence_note` +
`honest_note`.

### 5. Forbidden fields (enumerated; inherited from
ADR-0070 §8 + repo-wide no-leak)

- Raw audit `details` JSON.
- Raw event payloads / event-type-specific bodies.
- Raw memory / capsule contents.
- Raw transcripts.
- Prompts.
- Chain-of-thought.
- Embeddings / vectors.
- Storage locations.
- Content hashes unrelated to audit-chain hash (capsule
  `content_hash`, `embedding_content_hash` MUST NOT leak).
- Bridge IDs.
- Secret refs.
- Permission internals.
- Unrelated cross-org data.
- Unrelated employee / client / customer data.
- Privileged legal material.
- Confidential business strategy outside matter scope.
- `previous_event_hash` chains other than at the
  enumerated boundary hashes (`first_event_hash` +
  `last_event_hash`) — the verifier walks them internally
  but does NOT surface the full per-row hash linkage.
- Event-level `actor_entity_id` lists at org/platform
  scope (the SAFE projection aggregates over the in-scope
  set; per-entity chain results are NOT surfaced unless
  verified=false and the breaker entity is in-scope and
  is the caller themselves at self scope).

### 6. Query / window controls

```
GET /api/v1/audit/verify-chain
  ?scope=self|org|platform|regulator
  &lawful_basis_id=<uuid>           // REQUIRED for regulator
  &subject_entity_id=<uuid>         // OPTIONAL; self/org/platform only;
                                    // narrows to a single chain within scope
  &from=<ISO timestamp>             // OPTIONAL; default scope-specific
  &to=<ISO timestamp>               // OPTIONAL; default = now
  &max_events=<int>                 // OPTIONAL; capped; see below
```

**Window defaults** (per Section 7 perf precedent):

- `self`: no window required (caller's chain is bounded
  by their activity volume); window optional.
- `org` / `platform`: default last 30 days; explicit
  window required to override; `from`+`to` mandatory if
  default is overridden.
- `regulator`: window MUST be ≤ the `LawfulBasis.valid_from`
  → `LawfulBasis.valid_until` range; oversized → 400
  `WINDOW_TOO_LARGE`.

**Hard cap** (perf bound): `VERIFY_CHAIN_MAX_EVENTS = 10_000`
(mirrors `EXPORT_AUDIT_EVENTS_MAX_ROWS`). Estimated row
count > cap → 400 `WINDOW_TOO_LARGE` with response detail
indicating the cap and the recommended narrower window.

**`subject_entity_id` semantics**:

- `self`: ignored; verification is always the caller.
- `org`: optional narrowing to a single same-org entity
  within window. Cross-org subject → 404 (enumeration-safe;
  same code as unknown id).
- `platform`: optional narrowing to any single entity.
- `regulator`: NOT accepted; regulator scope is
  `lawful_basis_id`-bound; presence of `subject_entity_id`
  on regulator-scope request → 400 `INVALID_FIELD`.

### 7. Verification semantics

#### 7.1 Per-chain verification (self / single subject_entity_id)

Reuses the existing `verifyAuditChain(entity_id)` primitive
verbatim. Returns `valid` + `total_events` + `brokenAt`.
SAFE projection populates the view fields per §3.

#### 7.2 Multi-chain verification (org / platform)

Iterates the in-scope entity set within window:

- Org: `EntityMembership.parent_id = caller's org` AND
  `child.deleted_at IS NULL`.
- Platform: all `Entity.deleted_at IS NULL` rows.

For each entity, runs `verifyAuditChain` scoped to the
window (the primitive may need a window-aware variant —
forward-substrate per §11). First broken chain short-
circuits the result: `verified=false`,
`broken_at_event_id=<broken row>`, `failure_reason=<reason>`.

`checked_event_count` = sum of events verified across all
chains until the first break (or sum total if all chains
valid).

`first_event_id` / `last_event_id` / `first_event_hash` /
`last_event_hash` = first and last row in the entire
in-scope cross-chain window ordered by timestamp ASC.
These represent the timeline boundary, NOT per-chain
boundaries.

#### 7.3 Lawful-basis-bound verification (regulator)

Iterates `AuditEvent` rows where `lawful_basis_id = :basis`
within the basis's `valid_from` → `valid_until` window:

- For each visible row, recompute `event_hash` per the
  14-field canonical record.
- Verify `previous_event_hash` matches the prior row in
  the SAME `actor_entity_id` chain even if that prior row
  is NOT visible under the basis. This requires reading
  the prior row's `event_hash` value (one column read,
  not the row's data fields) to verify continuity.
- The prior row's `event_hash` value itself is NOT
  surfaced in the response — only used to verify the link.

This gives the regulator cryptographic proof that the
chain around the events they are permitted to see is
intact without leaking the existence or content of
invisible adjacent events beyond what the chain hashes
already structurally expose.

#### 7.4 Failure semantics

When `verified=false`:

- `broken_at_event_id`: ID of the row whose hash failed
  recomputation OR whose `previous_event_hash` mismatched.
  Under regulator scope, `broken_at_event_id` is exposed
  ONLY if that row is itself visible under `lawful_basis_id`;
  otherwise `broken_at_event_id=null` and
  `failure_reason="HASH_MISMATCH"` is set without naming
  the row (regulator learns "chain is broken" without
  learning where in the invisible neighborhood).
- `failure_reason`: closed-vocab union per §3.
- Boundary hashes (`first_event_hash` / `last_event_hash`)
  are still populated (they are part of the visible
  window).

### 8. Read-audit posture

Reuses existing `AUDIT_VIEW_VERIFY_CHAIN` literal with
extended `meta`:

```
event_type: "ADMIN_ACTION"
outcome: "SUCCESS"
actor_entity_id: callerEntityId
details:
  action: "AUDIT_VIEW_VERIFY_CHAIN"
  scope: "self" | "org" | "platform" | "regulator"
  checked_event_count: number
  verified: boolean
  window_start: ISO | null
  window_end: ISO | null
  lawful_basis_id: string | null   // regulator scope only
```

**NO** new audit literal. `details.action` discriminator
already covers it. **Forbidden** in audit details: any
forbidden field per §5 (no raw event IDs except
`broken_at_event_id` where it is already permitted at the
response tier; no `previous_event_hash` enumeration).

Failed scope-gate denials (UNAUTHORIZED / FORBIDDEN /
SCOPE_NOT_ALLOWED / LAWFUL_BASIS_*) follow Section 7
existing pattern: emit deny-tier read-audit at the
response register where appropriate; do NOT enumerate
unknown lawful_basis_ids in the audit details.

### 9. Closed-vocab failure codes

| code | http | semantic |
|---|---|---|
| `UNAUTHORIZED` | 401 | bearer missing or invalid |
| `FORBIDDEN` | 403 | bearer valid but lacks scope capability |
| `INVALID_SCOPE` | 400 | scope value not in 4-member set |
| `INVALID_FIELD` | 400 | query param value malformed |
| `LAWFUL_BASIS_REQUIRED` | 400 | regulator scope w/o lawful_basis_id |
| `LAWFUL_BASIS_NOT_FOUND` | 404 | basis id not found (enumeration-safe) |
| `LAWFUL_BASIS_EXPIRED` | 403 | basis revoked or past valid_until |
| `REGULATOR_TARGET_MISMATCH` | 403 | inherited from ADR-0036 |
| `SCOPE_NOT_ALLOWED` | 403 | TAR capability missing |
| `WINDOW_TOO_LARGE` | 400 | requested window exceeds VERIFY_CHAIN_MAX_EVENTS |
| `CHAIN_VERIFICATION_FAILED` | 200 | NOT a failure code — surfaced as `verified=false` body, NOT HTTP error |
| `INSUFFICIENT_DATA` | 200 | zero events in window; `verified=true` + `checked_event_count=0` (honest zero-state) |
| `INTERNAL_ERROR` | 500 | unexpected runtime failure |

NOTE: `CHAIN_VERIFICATION_FAILED` is NOT an HTTP error
condition — chain break is a successful verification
result that reports `verified=false`. The HTTP status is
200 + body carries `failure_reason` + `broken_at_event_id`.
This mirrors the existing self-only verify-chain
behavior verbatim.

`INSUFFICIENT_DATA` is the honest zero-state when the
window resolves to zero events; `verified=true`
(vacuously) + `checked_event_count=0` + an `honest_note`
explaining that no events fell in the window. The caller
gets explicit confirmation that the result is empty by
design, not a silent zero.

### 10. ADR-0070 interaction (regulator-ready doctrine)

ADR-0071 supports ADR-0070's **examination-ready evidence
flows** by enabling cryptographic chain-integrity proof
for scoped audiences. It is **not** the examination room
(§3.7), the evidence package (§3.6), the disclosure
workflow (§3.5), or the regulator update workflow (§3.11)
itself; those each require their own future ADR per
§Forward queue items 3-11.

ADR-0071 specifically:

- Operationalizes ADR-0070 §3.10 scoped regulator access
  by extending the existing ADR-0036 9-condition lawful-
  basis enforcement to chain-integrity verification.
- Inherits ADR-0070 §8 security/privacy/privilege
  boundaries by-construction at §5 (forbidden fields).
- Inherits ADR-0070 §9 legal-advice boundary: verify-
  chain proves chain-hash integrity, NOT compliance,
  legal sufficiency, examination outcome, or regulator
  approval. Surface copy at the route + service tier
  uses ADR-0070 §9 allowed phrases ("chain integrity
  verified" / "no tamper detected in the scoped window" /
  "not a legal determination").
- Does NOT create a raw regulator backdoor: regulator
  scope is `lawful_basis_id`-bound + expiring +
  revocable + audited; no broader regulator access is
  enabled.
- Does NOT certify compliance, attest disclosure
  timeliness, or claim books-and-records completeness.
- Does NOT publish evidence packages.
- Does NOT disclose raw records beyond chain-link
  boundaries.

### 11. ADR-0069 interaction (BEAM substrate-coherence law)

ADR-0069 §6 mandatory architecture check applied to
verify-chain at v1:

1. **Is this a BEAM-fit problem?** No at v1. The verify-
   chain primitive is a synchronous request/response
   surface that walks audit rows ordered by timestamp.
   Existing `verifyAuditChain` runs in milliseconds for
   self-scope; org/platform with the 10_000 window cap
   stays well within TypeScript route latency budget.
2. **If yes, why BEAM?** Not applicable at v1.
3. **If no, why TypeScript?** ADR-0069 §2.1 — TypeScript/
   Fastify owns API contracts + product routes; verify-
   chain is a product route per §2.1.
4. **What in Postgres?** Audit rows remain durable truth
   per ADR-0069 §2.2 + ADR-0002. No process state.
5. **What in Python?** Nothing.
6. **How does Foundation governance bind?** RULE 0 owner-
   scope at self + TAR-authoritative capability checks at
   org/platform + ADR-0036 9-condition enforcement at
   regulator.
7. **No-leak boundary?** §5 forbidden fields enumerated.
8. **What should NOT be implemented yet?** Implementation
   slice; continuous verification; BEAM-backed streaming
   verifier (forward-substrate per §Forward queue).

**Future ADR-0069 §3 domain 7 BEAM-fit triggers** (each
requires separate Founder authorization + RULE 21 research
arc):

- Continuous chain verification at high throughput
  (millions of events per chain).
- Real-time tamper detection as background BEAM workers.
- Streaming chain-integrity reports for regulators across
  rolling windows.
- Multi-region chain verification with libcluster +
  Phoenix.PubSub fanout per ADR-0028/0030.

### 12. Explicit non-goals at this commit

- No code.
- No schema migration.
- No new routes (verify-chain route stays at
  `/api/v1/audit/verify-chain`; query param + service
  signature extend the existing route — design only).
- No service-method signature change in this commit
  (design contract only).
- No new audit literal.
- No regulator portal implementation.
- No evidence room implementation.
- No legal hold implementation.
- No disclosure workflow.
- No external delivery provider.
- No regulator delivery connector.
- No Control Tower UI.
- No BEAM implementation (v1 stays TypeScript).
- No Python implementation.
- No blockchain / GATS / payment work.
- No compliance certification.
- No legal advice.
- No CLAUDE.md bulk catalog edit.
- No bulk rewrite of older ADRs.
- No current active slice derailment.

## Consequences

### Easier after this ADR

- The verify-chain implementation slice has a single
  canonical reference (this ADR §1-§12).
- The 4-scope matrix on verify-chain mirrors list / single
  / export precedent (cleaner for operator clients +
  Control Tower).
- Regulator-scope chain verification enables ADR-0070 §3.7
  examination-ready evidence WITHOUT introducing an
  examination room or evidence-package substrate.
- Closed-vocab failure codes give clients deterministic
  branching.
- The `VERIFY_CHAIN_MAX_EVENTS = 10_000` cap + window
  semantics prevent the org/platform/regulator scope
  expansion from becoming a perf trap.
- Future BEAM-backed continuous-verification slice has a
  clean handoff point at §11.

### Harder after this ADR

- The implementation slice MUST add a window-aware
  variant of `verifyAuditChain` to `packages/database/src/
  queries/audit.ts` (forward-substrate; the existing
  primitive walks full chain).
- The implementation slice MUST run the §6 perf-cap
  estimate query before chain walk (Prisma `count` first;
  if `> VERIFY_CHAIN_MAX_EVENTS` then `WINDOW_TOO_LARGE`).
- The regulator-scope §7.3 continuity verification needs
  careful Prisma query design — read `event_hash` of
  the prior row (single column) without leaking the row's
  data fields into any code path.
- Test surface expands: per-scope success path + per-
  scope failure path (chain break) + per-scope deny path
  + window-too-large path + lawful-basis-expired path +
  enumeration-safe paths + no-leak guard for forbidden
  fields. Estimated ≥ 25 integration tests at the
  implementation slice.
- The §3 SAFE projection introduces 4 NEW fields beyond
  the existing `VerifyAuditChainView` (chain_algorithm,
  failure_reason, window_start/end, first_event_id +
  hash, last_event_id + hash, lawful_basis_id,
  evidence_note, honest_note). Backward compatibility for
  existing self-scope clients preserved: the existing
  fields (`actor_entity_id`, `valid` → renamed to
  `verified`, `total_events` → renamed to
  `checked_event_count`, `broken_at` → renamed to
  `broken_at_event_id`) MAY be retained as aliases under
  a backwards-compat shim for one release, OR may be
  cleanly replaced if the Founder authorizes a clean
  break at the implementation slice. **Forward-substrate
  decision** — implementation slice QLOCK lands the
  backward-compat posture.

### Substrate-state catches resolved

- ADR-0070 §Forward queue item 1 closes at the design
  register; implementation slice closes it at the
  canonical-execution register.
- The Section 7 doc-tier reservation "Control Tower UX +
  cross-chain verify-chain = forward-substrate" closes
  on the cross-chain verify-chain half (Control Tower
  UX is `otzar-control-tower` repo scope and remains
  forward-substrate).
- The hard cap + window semantics establish a canonical
  pattern future verify-chain extensions (continuous
  verification, streaming) inherit.

## Forward queue

Each requires separate Founder authorization at its
implementation slice.

1. **ADR-0071 implementation slice** — extend
   `verifyAuditChain(entity_id)` to
   `verifyAuditChain(entity_id, { from?, to?, max_events? })`
   window-aware variant + extend
   `verifyAuditChainForCaller(callerId)` to
   `verifyAuditChainForScope({ callerId, scope, … })` +
   extend route to accept query params + extend
   `VerifyChainView` per §3 + add closed-vocab failure
   codes per §9 + add read-audit `meta` extension per §8
   + ≥ 25 integration tests + no-leak guard for §5
   forbidden fields + perf-cap estimate query + regulator-
   scope §7.3 continuity verifier + Section 7 doc update.
2. **Continuous chain verification** as background BEAM
   workers (ADR-0069 §3 domain 7 BEAM-fit candidate).
3. **Streaming chain-integrity reports** for regulators
   across rolling windows (BEAM-fit; per ADR-0028
   coordination layer).
4. **Multi-region chain verification** with libcluster +
   Phoenix.PubSub fanout (BEAM-fit; ADR-0028/0030
   substrate).
5. **Examination Room evidence-package integration** —
   future Examination Room ADR per ADR-0070 §Forward
   queue item 3 consumes ADR-0071 verify-chain results
   as one input among many in evidence packages.
6. **Legal hold integrity verification** — future Legal
   Hold ADR per ADR-0070 §Forward queue item 7 consumes
   ADR-0071 verify-chain to prove records under hold
   are tamper-free.
7. **Control Tower verify-chain consumer** — out of
   Foundation scope; lives in `otzar-control-tower`.

## Bidirectional citations

- Cites RULE 0 (sovereignty — every scope inherits scope
  by-construction at the route gate + service tier).
- Cites RULE 4 (audit before response — read-audit
  emission per §8).
- Cites RULE 13 (substrate-honest inline surfacing of
  scope-resolution + forbidden-field enforcement).
- Cites RULE 19 (two-register IP discipline — neutral
  compliance vocabulary per ADR-0070 §2 inherited).
- Cites RULE 20 (this ADR's creation explicitly Founder-
  authorized).
- Cites RULE 21 (substrate-architectural research arc —
  future BEAM-backed continuous verification will fire
  RULE 21).
- Cites ADR-0001 (RULE 0 source; three-wallet boundary).
- Cites ADR-0002 (append-only audit chain — `event_hash`
  + `previous_event_hash` + BEFORE DELETE trigger;
  load-bearing substrate; bidirectional back-citation
  landed in this commit).
- Cites ADR-0019 (cryptographic-suite posture —
  SHA-256 chain hash; bidirectional back-citation landed
  in this commit).
- Cites ADR-0026 (dual-control middleware pattern —
  precedent for sensitive-route TAR gates).
- Cites ADR-0036 (REGULATOR Principal + LawfulBasis
  Attestation Pattern — load-bearing for regulator scope;
  9-condition enforcement + lawful-basis-id binding +
  canonical_record positions 13+14 cryptographic binding
  preserved verbatim; bidirectional back-citation landed
  in this commit).
- Cites ADR-0037 (jurisdiction tagging — supports
  regulator scope discrimination).
- Cites ADR-0049 (GOVSEC umbrella — auth / dual-control /
  audit-chain integrity baseline).
- Cites ADR-0050 (GOVSEC.5 break-glass — scoped +
  expiring + audited pattern precedent).
- Cites ADR-0057 (Action runtime — future verify-chain
  background workers route through here if BEAM-backed).
- Cites ADR-0061 (Section 6 compliance posture SAFE
  projection precedent for response shape).
- Cites ADR-0069 (Elixir/BEAM Substrate-Coherence Law —
  v1 stays TypeScript per §2.1; future scale-driven
  BEAM-backed verification runs §6 architecture check).
- Cites ADR-0070 (Regulator-Ready Foundation Doctrine —
  §Forward queue item 1 closes at design register;
  §3.7 + §3.10 + §8 + §9 inherited; bidirectional back-
  citation landed in this commit).
- Section 7 docs: `current-build-state/07-full-audit-
  viewer.md` (LIVE Section 7 surfaces; cross-chain
  verify-chain forward-substrate reservation closes at
  the design register).
- Project memories (loaded at session start):
  `project_regulator_ready_foundation_substrate.md`
  (ADR-0070 long-form companion) +
  `project_elixir_beam_canonical_division_of_labor.md`
  (ADR-0069 long-form companion).

## Founder authorization

Per RULE 20: this ADR + the architecture/README.md
catalog entry + minimal bidirectional back-citation
snippets in ADR-0002 / ADR-0019 / ADR-0036 / ADR-0070 +
the NEXT_ACTION.md refresh land under explicit Founder
authorization at
`[FOUNDER-ADR-0071-SECTION-7-CROSS-SCOPE-AUDIT-VERIFY-CHAIN-DESIGN-AUTH]`
2026-05-31.

The authorization is **design-contract-ADR-only** — the
implementation slice (the §11 forward queue item 1 work)
requires a **separate Founder authorization** at the
implementation slice.
