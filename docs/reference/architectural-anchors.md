# Architectural Anchors

Foundation runtime invariants enforced by tests. Each anchor locks
an architectural property that future engineers (human or LLM)
cannot break without surfacing a red test.

This catalog is **committed substrate**. The audit chain analogy
applies: just as the audit chain is enforced append-only by
Postgres BEFORE DELETE trigger (ADR-0002), the anchor catalog is
enforced by being committed substrate that every contributor
reads before making architectural decisions.

**Current count:** 8 anchors (as of [DOCS-CATALOG-REFRESH-ANCHORS] —
commit 2 of 2 of the [DOCS-CATALOG-REFRESH] mini-arc; `cf10637`
parent; 2026-05-12)

## Anchor Mechanisms — Three Substrate-Tier Tamper-Resistance Patterns

The 8 anchors in this catalog use distinct substrate-tier
tamper-resistance mechanisms. A session extending this catalog must
match the new anchor to one of these patterns (or document a new
mechanism explicitly):

1. **Filter-narrowing / regex-scan / fallback-assertion tests** —
   anchors 1-4. The architectural property is enforced via test
   substrate that asserts the runtime behavior: cross-org filter
   narrowing (anchors 1+2 per ADR-0006), no-`console.*` regex scan
   (anchor 3 per ADR-0005), `writeAuditEvent` chainKey-priority
   fallback assertion (anchor 4 per ADR-0002).
2. **`Object.freeze` tamper-prevention** — anchors 5+6
   (`CRYPTO_CONFIG`, `SYSTEM_PRINCIPALS` per ADR-0003). The
   configuration object is `Object.freeze`-wrapped at module load;
   tamper attempts throw at runtime; the test asserts
   `Object.isFrozen(...)` plus the specific values. The substrate
   property is the freeze itself.
3. **Value-pin assertions** — anchor 7 (`combined_score` per
   ADR-0022). The numeric coefficients are pinned via explicit
   `expect(...).toBeCloseTo(value, precision)` assertions
   (`tests/unit/coe.test.ts:132-136` — four value-pin assertions for
   the 0.45 / 0.35 / 0.20 / 1.0 invariants; `:121-129` for recency
   monotonicity). Changing a coefficient breaks a direct value-pin.
4. **Behavioral-lock assertions** — anchor 8 (`RELEVANCE_FORGET_FLOOR`
   per ADR-0022). The constant value is NOT directly pinned; the
   *behavior the constant gates* is tested — the `relevance_score < 0.2`
   exclusion test (`coe.test.ts:170`) + the FOUNDATIONAL bypass test
   (`coe.test.ts:141-145`) + a relational lower-bound assertion
   (`coe.test.ts:316` — `expect(0.05).toBeLessThan(RELEVANCE_FORGET_FLOOR)`).
   Changing the constant would not break a direct value-pin (none
   exists); it would break the behavioral assertions about the
   exclusion / bypass semantics.

## Summary

| # | Anchor | Locks | Test | Drift | Commit | Status |
|---|---|---|---|---|---|---|
| 1 | DRIFT 9 (audit) | Cross-org leak prevention on `/audit` | `tests/integration/admin-routes.test.ts` | 9 | `2aa1a88` | ACTIVE |
| 2 | DRIFT 9 (permissions) | Cross-org leak prevention on `/permissions` | `tests/integration/admin-routes.test.ts` | 9 | `2aa1a88` | ACTIVE |
| 3 | DRIFT 2 Option C | No `console.*` in `apps/api/src` | `tests/unit/no-console-in-api-src.test.ts` | 2C | `f3359fb` | ACTIVE |
| 4 | DRIFT 12 | `writeAuditEvent` backwards-compat fallback | `tests/unit/audit-system-principals.test.ts` | 12 | `f3359fb` | ACTIVE |
| 5 | Frozen `CRYPTO_CONFIG` | Tamper anchor on cryptography config | `tests/unit/boot-validation.test.ts` | — | `f3359fb` | ACTIVE |
| 6 | Frozen `SYSTEM_PRINCIPALS` | Tamper anchor on system-principal enumeration | `tests/unit/audit-system-principals.test.ts` | — | `f3359fb` | ACTIVE |
| 7 | `combined_score` coefficient invariants | The 0.45/0.35/0.20 tag/base/recency ratios + sum=1.0 + recency monotonicity (per ADR-0022) | `tests/unit/coe.test.ts:132-136` (value-pin) + `:121-129` (recency monotonicity) | — | catalog landed `cf10637`+1 ([DOCS-CATALOG-REFRESH-ANCHORS]); test substrate predates | ACTIVE |
| 8 | `RELEVANCE_FORGET_FLOOR` behavioral lock | The 0.2 intentional-forgetting floor (`relevance_score < 0.2` excluded; FOUNDATIONAL Capsules bypass) (per ADR-0022 + ADR-0021) | `tests/unit/coe.test.ts:170` (exclusion) + `:141-145` (FOUNDATIONAL bypass) + `:316` (relational lower-bound) | — | catalog landed `cf10637`+1 ([DOCS-CATALOG-REFRESH-ANCHORS]); test substrate predates | ACTIVE |

---

## 1. DRIFT 9 — Cross-org leak prevention (audit endpoint)

**Status:** ACTIVE
**Test:** `tests/integration/admin-routes.test.ts`
**Drift Reference:** DRIFT 9
**Introduced In:** `2aa1a88` (Section 12C.0 Commit 1)

### What It Locks

`GET /api/v1/org/audit` query filters narrow within the caller's
existing org-scope and never broaden it. A crafted query value
on `event_type`, `actor_entity_id`, or `target_entity_id`
parameters cannot return audit rows from another tenant's
organization. The org-scope predicate is the outermost AND clause;
filter parameters are inner AND clauses that further restrict
the result set.

### Why This Matters

Foundation is multi-tenant; audit events from one organization
contain operational data (who acted on what, when, with what
outcome) that another organization must not see. A filter-based
escape would be a privilege escalation. SOC 2 CC6.1 (logical
access controls) explicitly requires that a tenant's audit
visibility be scoped to that tenant; FedRAMP Moderate AC-3
(access enforcement) requires the same. A regression here would
surface as a procurement audit failure, a SOC 2 finding, or
worst case a customer breach disclosure.

### How It Is Enforced

The integration test seeds two organizations (orgA, orgB), then
issues `GET /api/v1/org/audit?event_type=...` and similar filter
queries from orgA's admin token with crafted values that target
orgB's data. The test asserts the response array is empty (or
contains only orgA rows) for every crafted-value variant. Filter
permutations include single filter, combined filters
(`event_type` + `actor_entity_id`), and edge cases (UUID values
matching orgB entities). The org-scope predicate runs as the
outer Prisma `where` AND clause; filters compose as inner AND
clauses, never as OR.

### How To Extend This Anchor

When a new query filter is added to `/api/v1/org/audit`
(or any sibling org-scoped endpoint), extend this anchor by
adding a test case that uses that filter to attempt cross-org
escape. The pattern: seed two orgs, craft a filter value that
matches a row in orgB, query as orgA admin, assert empty
response. Filters that pass typecheck but allow cross-org reads
are a privilege escalation; the anchor catches them at the test
gate.

---

## 2. DRIFT 9 — Cross-org leak prevention (permissions endpoint)

**Status:** ACTIVE
**Test:** `tests/integration/admin-routes.test.ts`
**Drift Reference:** DRIFT 9
**Introduced In:** `2aa1a88` (Section 12C.0 Commit 1)

### What It Locks

`GET /api/v1/org/permissions` `?bridge_id=` filter narrows within
the caller's existing org-scope and never broaden it. A crafted
`bridge_id` UUID that matches a Permission row in another tenant's
org cannot return that row. Same architectural property as the
audit endpoint anchor (entry 1 above), applied at a different
HTTP surface.

### Why This Matters

Permission rows describe who has what access to which Memory
Capsules. Cross-org visibility into another tenant's permission
graph reveals: who their employees are, what data they share
with whom, and which Memory Capsules exist in their wallets.
SOC 2 CC6.1 + FedRAMP AC-3 implications are the same as the
audit endpoint. The Permission graph is also intelligence about
the customer's organizational structure — a cross-tenant leak
would be a competitive harm in addition to a compliance
violation.

### How It Is Enforced

The integration test seeds orgA and orgB, builds a real
Permission row in orgB (with a known `bridge_id`), and queries
`GET /api/v1/org/permissions?bridge_id=<orgB-bridge-id>` from
orgA's admin token. The test asserts the response is empty.
The org-scope predicate (`grantor_entity_id` IN orgScope OR
`grantee_entity_id` IN orgScope) AND `status = 'ACTIVE'` is the
outer fence; the `bridge_id` filter is the inner narrowing
clause.

### How To Extend This Anchor

When a new query filter lands on `/api/v1/org/permissions`,
extend by following the same pattern as anchor 1: cross-org
fixture data + crafted filter value + assertion of empty
response. Future Section 12.5 Sub-box 2 (jurisdiction tagging)
and Sub-box 8 (cross-tenant compliance benchmarking) will both
add filters here; both must include an extended cross-org test.

---

## 3. DRIFT 2 Option C — No `console.*` in `apps/api/src`

**Status:** ACTIVE
**Test:** `tests/unit/no-console-in-api-src.test.ts`
**Drift Reference:** DRIFT 2 Option C
**Introduced In:** `f3359fb` (Section 12C.0 Commit 2)

### What It Locks

Zero `console.{log,error,warn,info,debug}` CALL sites in
`apps/api/src/`. All operational logging in the API layer goes
through the structured logger — either the shared module-level
instance at `apps/api/src/logger.ts` or the request-scoped
logger via `request.log.*` / `fastify.log.*` (Fastify's pino
configuration in `apps/api/src/server.ts`).

### Why This Matters

`console.*` output bypasses Pino's structured logging path and
its redact-paths configuration. Three concrete consequences if
the anchor is broken: (1) PII may leak via `console.log` calls
that escape the redact paths defined in
`docs/STRUCTURED_LOGGING_SCHEMA.md`; (2) SIEM ingestion of
container logs becomes inconsistent — Splunk, Datadog Cloud
SIEM, Sentinel, and Chronicle all parse JSON-line output cleanly
but choke on freeform `console.log` strings; (3) FedRAMP ConMon
(NIST 800-53 Rev 5 CA-7) "automated log analysis" requirement
fails. ESLint `no-console` rule was deferred during Section 12C.0
plan-draft due to the cost of adopting ESLint; this Vitest
invariant test is the runtime equivalent (DRIFT 2 Option C
resolution; see ADR-0005).

### How It Is Enforced

The test recursively walks every `.ts` file under `apps/api/src/`
and matches against the regex
`/console\.(?:log|error|warn|info|debug)\s*\(/`. The pattern
distinguishes CALL sites from JSDoc literal mentions: it
requires the trailing `(` after the method name, so doc text
like `console.error only` is excluded while `console.error(...)`
is matched. On match, the test fails with a multi-line error
message listing every offending `path:line` so contributors
know exactly what to fix.

### How To Extend This Anchor

When a new module joins `apps/api/src/`, the existing test
covers it automatically (recursive walk includes new files). No
explicit extension needed. If future work introduces a new
log-method name (e.g., `logger.fatal` becomes a direct
`console.fatal` call somewhere), extend the regex alternation
group to cover the additional method. Production code should
never need this — `console.fatal` is not a standard Node.js
method — but the anchor is conservative.

---

## 4. DRIFT 12 — `writeAuditEvent` backwards-compat fallback

**Status:** ACTIVE
**Test:** `tests/unit/audit-system-principals.test.ts`
**Drift Reference:** DRIFT 12
**Introduced In:** `f3359fb` (Section 12C.0 Commit 2)

### What It Locks

`writeAuditEvent` called without `actor_entity_id` AND without
`system_principal` falls back to the legacy `SYSTEM_CHAIN_KEY`
sentinel for `chainKey` selection. Pre-Section-12C.0 audit rows
written under the legacy sentinel remain on a verifiable hash
chain; existing callers that emit audit events without either
modern parameter continue working unchanged. The chainKey
priority is `actor_entity_id` → `system_principal` → legacy
`SYSTEM_CHAIN_KEY`; see ADR-0006 and
`packages/database/src/queries/audit.ts:251`.

### Why This Matters

When `SYSTEM_PRINCIPALS` was introduced in Section 12C.0 Item 7,
the temptation was to require every system emission to declare
a principal. Doing so would have broken every pre-existing
audit row that wrote under the null-actor path: `verifyAuditChain`
walks rows ordered by timestamp and recomputes the hash; a
chainKey priority change without backwards-compat would silently
invalidate the chain on old rows. SOC 2 CC4.1 + CC7.2 explicitly
require continuous audit integrity — a regression would surface
as a "tamper detected" report on rows that are not actually
tampered. NIST 800-53 AU-9 (protection of audit information) is
weakened if integrity verification produces false positives.

### How It Is Enforced

The unit test calls `writeAuditEvent` with neither
`actor_entity_id` nor `system_principal` and asserts: (1) the
call returns a valid audit row (UUID `audit_id`, hash chain
links to prior null-actor event); (2) the persisted row's
`actor_entity_id` is null; (3) the row's `details` JSON does
NOT contain a `system_principal` key (legacy emissions are
distinguishable from new SYSTEM_PRINCIPALS-tagged emissions);
(4) `verifyAuditChain` reconstructs the chain successfully. The
assertion list is the contract for "what backwards-compat means
here" — adding fields to the legacy emission shape would break
the third assertion.

### How To Extend This Anchor

When future work adds a new optional parameter to
`WriteAuditEventInput` (Section 12.5 work may add lawful-basis
fields per Family 1, jurisdiction fields per Sub-box 2), extend
the anchor by adding an assertion that the legacy fallback path
ignores the new parameter when both it AND the legacy
parameters are absent. The general rule: adding optional
parameters never breaks the legacy fallback; the anchor catches
regressions where a "required" parameter slips in.

---

## 5. Frozen `CRYPTO_CONFIG` (tamper anchor)

**Status:** ACTIVE
**Test:** `tests/unit/boot-validation.test.ts`
**Drift Reference:** Frozen-config tamper anchor pattern (see
ADR-0003)
**Introduced In:** `f3359fb` (Section 12C.0 Commit 2)

### What It Locks

`Object.isFrozen(CRYPTO_CONFIG)` is true at runtime. The
algorithm choices (HS256 for JWT signing, AES-256-GCM for
content encryption, SHA-256 for content + audit hashing), the
bcrypt rounds (12 production, 4 test, 10 production minimum),
and the byte-length minima (`JWT_SECRET_MIN_BYTES = 32`,
`ENCRYPTION_KEY_REQUIRED_BYTES = 32`) cannot be mutated at
runtime. Tampering attempts in strict mode throw `TypeError`;
in non-strict mode they fail silently — the runtime
`Object.isFrozen` assertion in the test catches the latter.

### Why This Matters

`CRYPTO_CONFIG` is the most security-critical configuration in
Foundation. A buggy refactor (or a malicious diff) that swaps
HS256 for `none` algorithm would make every JWT forgeable; a
swap from AES-256-GCM to a weaker cipher would break FIPS 140-3
validation; lowering bcrypt rounds below 10 weakens password
hashing against modern GPU attacks per NIST SP 800-63B Appendix
A.3. Tamper resistance via `Object.freeze()` plus the runtime
test prevents both intentional and accidental mutation. See
ADR-0003 (frozen-config tamper anchors) and
`docs/FIPS_DEPLOYMENT_POSTURE.md`.

### How It Is Enforced

The unit test imports `CRYPTO_CONFIG` from `@niov/auth` and
asserts `Object.isFrozen(CRYPTO_CONFIG)` is `true`. A
companion test verifies the specific values
(`CRYPTO_CONFIG.JWT_ALGORITHM === "HS256"`,
`CRYPTO_CONFIG.BCRYPT_ROUNDS_MIN_PRODUCTION === 10`, etc.) so
silent mutation between commits surfaces as a value mismatch
even if the Object.freeze was bypassed via proxy. The
`packages/auth/src/crypto-config.ts` source uses
`Object.freeze(CRYPTO_CONFIG)` on the literal object expression.

### How To Extend This Anchor

When a new security-critical configuration is added to
`CRYPTO_CONFIG`, extend by adding the new constant to the
literal in `packages/auth/src/crypto-config.ts` and adding a
value-assertion test for it (alongside the existing
`Object.isFrozen` assertion which covers the new field
automatically). Section 12.5 Sub-box 7 (asymmetric attestation
signing path) will add `ATTESTATION_ALGORITHM` and
`ATTESTATION_KEY_*` fields — both will be covered by the
existing freeze assertion plus new value assertions per field.

---

## 6. Frozen `SYSTEM_PRINCIPALS` (tamper anchor)

**Status:** ACTIVE
**Test:** `tests/unit/audit-system-principals.test.ts`
**Drift Reference:** Frozen-config tamper anchor pattern (see
ADR-0003)
**Introduced In:** `f3359fb` (Section 12C.0 Commit 2)

### What It Locks

`Object.isFrozen(SYSTEM_PRINCIPALS)` is true at runtime. The
enumeration of system principals (`SCHEDULER`, `BOOT_VALIDATOR`,
`COMPLIANCE_SEEDER`, `FEEDBACK_LOOP`) cannot be mutated. New
principals can be added to the source literal in
`packages/database/src/queries/audit.ts`, but runtime mutation
of the frozen export is prevented.

### Why This Matters

`SYSTEM_PRINCIPALS` is the source-of-truth enumeration that
audit reconstruction uses to attribute system-initiated events
to specific subsystems. NIST 800-53 Rev 5 AU-2 (event logging
— who/what/when/where/source/outcome) requires system actor
enumeration distinct from human actors; collapsing system
events back to a single sentinel chain (the pre-12C.0 state)
weakens audit attribution and makes FedRAMP / SOC 2 system-
activity coverage ambiguous. Tamper resistance via
`Object.freeze()` ensures a buggy refactor cannot accidentally
remove a principal value (which would orphan audit rows
written under that principal) or inject an extra value
(which would break exhaustive-switch coverage in any
discriminated-union pattern).

### How It Is Enforced

The unit test imports `SYSTEM_PRINCIPALS` from `@niov/database`
and asserts `Object.isFrozen(SYSTEM_PRINCIPALS)` is `true`. A
companion test verifies the specific principal values
(`SYSTEM_PRINCIPALS.SCHEDULER === "__niov_system_scheduler__"`,
etc.) so any drift in the literal values surfaces as a test
failure. The `packages/database/src/queries/audit.ts` source
uses `Object.freeze({ SCHEDULER: ..., BOOT_VALIDATOR: ..., ... })`
on the literal object expression.

### How To Extend This Anchor

When a new system subsystem needs audit attribution, extend by
adding a new key to the `SYSTEM_PRINCIPALS` literal in
`packages/database/src/queries/audit.ts` AND adding a value-
assertion test for it. Adding a principal does not require an
ADR (it strengthens the existing pattern). Removing a principal
DOES require an ADR (orphan audit rows under the removed value
would no longer have an attribution path). The frozen assertion
covers new additions automatically.

---

## 7. `combined_score` coefficient invariants

**Status:** ACTIVE
**Test:** `tests/unit/coe.test.ts:132-136` (coefficient lock) +
`tests/unit/coe.test.ts:121-129` (recency monotonicity lock)
**Drift Reference:** combined_score formula canonicalization (see
ADR-0022); the INT-6 frozen-anchors-family extension path (RAA 12.8
§6.6 + §7.4)
**Cataloged In:** `cf10637`+1 ([DOCS-CATALOG-REFRESH-ANCHORS] —
commit 2 of 2 of the [DOCS-CATALOG-REFRESH] mini-arc); the test
substrate predates this catalog entry (ADR-0022 lineage)

### What It Locks

The `combined_score(tagOverlap, baseRelevance, recency)` formula
coefficients — `tagOverlap * 0.45 + baseRelevance * 0.35 + recency
* 0.2` at `apps/api/src/services/coe/keywords.ts:87-93` (inline
numeric literals) — the 0.45 / 0.35 / 0.20 tag/base/recency ratios,
the sum-=-1.0 constraint, and the `recencyScore` monotonicity
envelope (fresh = 1.0, old = 0.0, monotonic decreasing in between).
`combined_score` is the canonical retrieval-ranking primitive: every
COE retrieval ranks Capsules by this formula.

### Why This Matters

Coefficient drift would change retrieval semantics across every
Capsule operation — a session that "tuned" the weights without
coordinated test update would silently re-rank the substrate's
intelligence. The 0.45/0.35/0.20 distribution encodes the
architectural claim that semantic-match (tagOverlap) dominates,
accumulated-usefulness (baseRelevance) is the middle signal, and
freshness (recency) is the tiebreaker — per ADR-0022 + RAA 12.7
§3.3 ("weights are the architecture, not arbitrary numbers"). The
formula is also patent-implementation territory under US 12,517,919
(substrate-architecture-level coverage); the anchor keeps the
canonical coefficients on a verifiable test chain.

### How It Is Enforced

VALUE-PIN mechanism. `tests/unit/coe.test.ts:132-136` —
`it("combinedScore weights match the spec (0.45 / 0.35 / 0.20)",
...)` with four explicit `expect(combinedScore(...)).toBeCloseTo(value,
5)` assertions: `combinedScore(1,0,0) ≈ 0.45`, `combinedScore(0,1,0)
≈ 0.35`, `combinedScore(0,0,1) ≈ 0.2`, `combinedScore(1,1,1) ≈ 1.0`.
`tests/unit/coe.test.ts:121-129` — `it("recencyScore is 1.0 for
fresh, 0.0 for old, monotonic between", ...)` pins the recency
envelope. Any coefficient change without coordinated test update
fails CI.

### How To Extend This Anchor

Per the ADR-0022 amendment §"Forward-queue: formula extension to
Step 2E engineering": the `INFORMATIVENESS_WEIGHT` 4th-coefficient
formula extension (`combined_score = tag*w_tag + base*w_relevance +
recency*w_recency + informativeness*w_informativeness`, sum-=-1.0
preserved; coefficient redistribution candidates — conservative
`w_informativeness = 0.10` → `0.405/0.315/0.180`; mid `0.20` →
`0.36/0.28/0.16`; aggressive `0.30` → `0.315/0.245/0.14`; default
conservative) is Step 2E engineering substrate per RAA 12.8 §7.3 +
§7.5 — when it lands, the `coe.test.ts:132-136` anchor test extends
to validate the 4-coefficient sum invariant and the value-pins for
the new weights. A pure coefficient retune (preserving the sum
constraint and the signal hierarchy) requires an ADR-0022 amendment
+ coordinated test update.

---

## 8. `RELEVANCE_FORGET_FLOOR` behavioral lock

**Status:** ACTIVE
**Test:** `tests/unit/coe.test.ts:170` (exclusion behavior) +
`tests/unit/coe.test.ts:141-145` (FOUNDATIONAL bypass) +
`tests/unit/coe.test.ts:316` (relational lower-bound assertion)
**Drift Reference:** intentional-forgetting threshold (see ADR-0022
References + ADR-0021 FOUNDATIONAL retrieval-privilege class); the
INT-6 frozen-anchors-family extension path (RAA 12.8 §6.6 + §7.4)
**Cataloged In:** `cf10637`+1 ([DOCS-CATALOG-REFRESH-ANCHORS] —
commit 2 of 2 of the [DOCS-CATALOG-REFRESH] mini-arc); the test
substrate predates this catalog entry (ADR-0021/ADR-0022 lineage)

### What It Locks

The intentional-forgetting envelope around `RELEVANCE_FORGET_FLOOR =
0.2` at `apps/api/src/services/coe/coe.service.ts:44`: a
non-FOUNDATIONAL Capsule with `relevance_score < 0.2` is excluded
from regular retrieval ("intentional forgetting"); FOUNDATIONAL
Capsules are always included regardless of `relevance_score` (the
FOUNDATIONAL retrieval-privilege class per ADR-0021); and the floor
sits above the per-cycle Loop-1 decay step (`RELEVANCE_UNUSED_DECAY
= 0.02`) so that a Capsule decays toward — not past — the floor over
multiple unused cycles.

### Why This Matters

The floor implements the substrate's "intentional forgetting"
property — Capsules that have proven persistently un-useful drop out
of retrieval rather than diluting context. Changing the floor
without updating the exclusion semantics (or the FOUNDATIONAL
bypass) would break the substrate invariant: too low and forgetting
never happens; too high and useful-but-quiet Capsules get
prematurely dropped; bypass-removal would let a low-relevance
FOUNDATIONAL Capsule fall out of retrieval, which contradicts
ADR-0021's FOUNDATIONAL-first invariant. The floor is patent-
implementation territory per RAA 12.7 §3.3 (cognitive-science
intentional-forgetting framing) + ADR-0021.

### How It Is Enforced

BEHAVIORAL-LOCK mechanism — the constant value is NOT directly
pinned; the behavior it gates is tested. `tests/unit/coe.test.ts:170`
— `it("non-FOUNDATIONAL capsule with relevance_score < 0.2 is
excluded from regular retrieval", ...)` (the exclusion behavior).
`tests/unit/coe.test.ts:141-145` — `it("FOUNDATIONAL capsules are
always included regardless of relevance_score", ...)` with a
fixture scored "WAY below the 0.2 floor" (the bypass). `tests/unit/coe.test.ts:316`
— `expect(0.05).toBeLessThan(RELEVANCE_FORGET_FLOOR)` (a relational
lower-bound assertion that fails if the floor ever drops to ≤ 0.05).
Changing the constant value would not break a direct value-pin
(none exists); it would break the exclusion / bypass behavioral
assertions (or the relational lower-bound, for an extreme change).

### How To Extend This Anchor

A floor retune (e.g., to 0.15 or 0.25) requires updating the
exclusion-semantics tests' fixture scores + re-verifying the
FOUNDATIONAL-bypass interaction + re-checking the floor stays above
`RELEVANCE_UNUSED_DECAY`; per ADR-0022 References (which cites
`RELEVANCE_FORGET_FLOOR = 0.2 at coe.service.ts:44`) + ADR-0021's
FOUNDATIONAL retrieval-privilege class. The floor is a tunable
threshold but its behavioral envelope — exclusion below it,
FOUNDATIONAL bypass, sits-above-decay-step — is the substrate
invariant the anchor protects. Adding a value-pin
(`expect(RELEVANCE_FORGET_FLOOR).toBe(0.2)`) alongside the
behavioral assertions would convert this to a hybrid value-pin +
behavioral-lock anchor — a strengthening that does not require an
ADR.

---

## Anchor Lifecycle

How to propose, add, evolve, or retire an anchor.

- **Propose:** New anchors emerge during build cycles when a
  drift report identifies an architectural property that should
  be locked. The proposal happens inline during the relevant
  primer's drift-resolution phase. Document the property, the
  failure mode, and the test mechanism.

- **Add:** A new anchor lands in a code commit alongside its
  test. The architectural-anchors.md catalog is updated in the
  same commit. An ADR is required if the anchor introduces a
  new architectural pattern (vs strengthening an existing one).

- **Evolve:** Anchors strengthen over time as new failure modes
  are identified. Strengthening (adding more test cases, broader
  grep patterns, additional `Object.isFrozen` targets) does not
  require an ADR — the anchor's existing ADR (if any) is
  amended in the References section.

- **Retire:** Retiring an anchor requires an ADR superseding the
  prior one. Retirement is rare and indicates that the
  architectural property is no longer relevant (e.g., the
  underlying surface has been removed) or has been subsumed by
  a stronger anchor.

## Adding New Anchors To This Catalog

When a new anchor lands:
1. Add a row to the top-of-file summary table.
2. Add a per-anchor detail section with all five sub-sections
   (What It Locks, Why This Matters, How It Is Enforced, How To
   Extend This Anchor) filled in.
3. Update the count in the file header (e.g., "8 anchors" → "9
   anchors") and update the "as of … <hash>" stamp to the new
   commit. If the new anchor uses a mechanism not already listed in
   "Anchor Mechanisms", add it there too.
4. Cross-reference the anchor's commit hash against the actual
   git log before committing.
5. If the anchor introduces a new architectural pattern,
   reference its ADR in the "Drift Reference" field.

## See Also

- `docs/architecture/decisions/` — Architecture Decision Records
- `docs/reference/glossary.md` — Term definitions
- `docs/reference/section-12-progress.md` — Section progress tracker
- `CLAUDE.md` — Operating manual; anchors are referenced from
  Section 6.
