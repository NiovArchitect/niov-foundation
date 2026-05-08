# ADR-0016: Pin-and-Optimize Framework

Status: Active
Date: 2026-05-07
Trigger: Track A Gate 7 (ADR-0015 Decisions E + H)

## Context

Track A Gate 7's CI workflow architecture surfaced a tension
that produced unexpected architectural depth. Decision E
pinned `postgres:16.4-alpine` for parity-with-local
reasoning. Decision H pinned Node `22.11.0` for LTS-
compliance reasoning. Both decisions pinned external
dependencies, but they optimized different dominant
concerns:

- Decision E: parity with the empirically-verified local
  runtime that produced ADR-0011's reproducibility evidence
- Decision H: enterprise/government compliance posture
  (SOC 2, FedRAMP, ISO 27001) — even though parity with
  local was achievable via Node 24.13.1, LTS-compliance
  was the dominant concern for the runtime's role in audit
  cycles

What looked like potential contradiction (Decision E
optimizes parity; Decision H optimizes LTS posture even
when parity was also achievable) revealed a more general
principle: **pinning is the foundational discipline; the
optimization axis varies per resource based on which
concern dominates that resource's role in the substrate.**

This ADR elevates the principle to a canonical reference
framework. Future pinning decisions across Foundation —
Anthropic SDK versions, Prisma versions, cryptographic
library versions, capsule schema versions, runtime
container images, etc. — apply the same framework: pin
first, identify the dominant axis, document the axis
choice.

### Why "pin everything" is insufficient on its own

Pinning is necessary but not sufficient. Two pins can
agree on "stable version locked" but disagree on which
version is correct. Without explicit axis documentation,
future contributors face the same multi-axis tradeoff with
no guidance: should they pin to LTS? To parity with
operator's machine? To latest patch? To last-known-good?
The framework eliminates the choice paralysis by requiring
each pinning decision to declare its dominant axis.

### Why "optimize for parity" is insufficient on its own

Parity-with-local is the right call when local-vs-CI
divergence directly threatens reproducibility evidence
(Decision E's case: ADR-0011's variance bounds were
empirically measured against `postgres:16.4-alpine`; CI on
a different image would invalidate the bounds). But parity
is the wrong call when local choice is itself driven by
operator convenience rather than substrate posture. Node
24.13.1 (operator's local default before Decision H) was
not chosen for compliance reasons; pinning CI to match it
would have inherited a non-LTS posture incidentally.

### Why "optimize for compliance" is insufficient on its own

LTS pinning is the right call when audit reviewers are the
dominant downstream consumer of the pin (Decision H's
case: SOC 2 / FedRAMP / ISO 27001 reviewers expect
documented LTS guarantees). But it's the wrong default
when audit isn't the dominant concern. Pinning Postgres to
"the LTS version" makes no sense — Postgres doesn't ship
LTS labels; it ships major releases with multi-year
support windows. Forcing every pin into a compliance frame
produces nonsensical decisions for resources where
compliance isn't the dominant concern.

### Why per-resource axis selection is the correct architectural answer

Different resources play different substrate roles. The
runtime in which production code executes faces compliance
scrutiny in audit cycles. The DB image faces variance
scrutiny in reproducibility cycles. The Anthropic SDK
faces API-stability scrutiny in nightly drift cycles. Each
resource has a dominant downstream consumer; pinning
should optimize for that consumer's concern. Different
axes for different resources is not inconsistency — it's
context-aware engineering. The cost is that the framework
must be made explicit so future readers (compliance
reviewers, contributors, AI agents) can verify the axis
choice was deliberate.

## Decision

The Pin-and-Optimize Framework has three components:

### 1. Pin first

Every external dependency that affects substrate behavior
gets pinned to a specific version. Pinned resources
include:

- Runtime versions (Node, Python, etc.)
- Container images (Postgres, Redis, etc.)
- Package dependencies (npm packages, Prisma, etc.)
- Third-party API SDK versions (Anthropic, OpenAI, etc.)
- Cryptographic algorithm versions
- Schema versions (capsule schemas, audit log schemas)

Moving tags introduce non-determinism that breaks
reproducibility, compounds debugging cost, and creates
audit-trail gaps. **Pinning is non-negotiable.** Tags like
`postgres:16-alpine` (within-major moving) or `node:22`
(within-major moving) or `^0.27.0` (semver-range moving)
all violate this.

### 2. Identify the dominant concern axis per resource

Each pinned resource exists in a multi-axis tradeoff space.
The dominant axis is not always the same across resources.
Known axes Foundation has identified:

- **Parity-with-local axis**: minimizes local-vs-CI surprise;
  preserves empirical evidence captured against local
  runtime
- **LTS-compliance axis**: aligns with enterprise/government
  audit cycles (SOC 2, FedRAMP, ISO 27001 reviewers
  prefer documented LTS support windows)
- **Security-posture axis**: prioritizes patch availability
  for known vulnerabilities; minimizes CVE exposure window
- **API-stability axis**: minimizes breaking-change exposure
  to upstream third-party API drift
- **Schema-compatibility axis**: preserves backward
  compatibility for stored data (capsules created under
  prior schemas must remain readable indefinitely)
- **Cost-optimization axis**: minimizes per-call or per-run
  costs (especially relevant for billed external APIs)
- **Performance-optimization axis**: minimizes runtime
  resource consumption
- **Audit-trail-stability axis**: preserves consistent
  forensic record across versions; relevant for crypto
  and signature subsystems

Each pinned resource must have its dominant axis
identified deliberately. Default isn't allowed; the
absence of a documented axis is itself a substrate-honest
gap. Discovering an unpinned resource OR a pinned resource
without dominant-axis documentation is itself a drift
worth surfacing.

### 3. Document the dominant-axis choice

Every pinning decision lands in an ADR (or ADR amendment)
with explicit reasoning:

- What was pinned (specific version)
- What axes were considered
- Which axis dominates and why
- What trade-offs were accepted on non-dominant axes
- What re-evaluation triggers should re-open the decision

The documentation requirement is non-optional. Future
readers (compliance reviewers, contributors, future-you on
a different machine, AI agents helping with future
substrate work) need the reasoning chain to make
consistent decisions about new resources.

## Worked Examples

### Postgres image (ADR-0015 Decision E)

- **Pinned**: `postgres:16.4-alpine`
- **Dominant axis**: parity-with-local
- **Reasoning**: ADR-0011's reproducibility evidence
  (~4.1% unit+integration variance, ~7.6% real-LLM
  variance) was produced empirically against
  `postgres:16.4-alpine` running locally; CI parity
  prevents environment-induced variance from contaminating
  the empirical baseline. Drift G7-A surfaced when the
  Track A Gate 7 primer drafted `postgres:16-alpine`
  (within-major moving); the pin correction restored
  parity and applied the same logic that rejected
  `postgres:latest` in ADR-0015's Alternatives Considered.
- **Trade-off accepted**: minor patch updates within 16.x
  require deliberate re-pinning rather than auto-tracking;
  security-patch-cadence axis loses to determinism axis.
- **Re-evaluation triggers**: Postgres 16 EOL approach;
  major performance regression observed in 16.4; security
  CVE that requires upgrading within-major.

### Node runtime (ADR-0015 Decision H)

- **Pinned**: `22.11.0` via `.nvmrc`
- **Dominant axis**: LTS-compliance posture
- **Reasoning**: SOC 2 / FedRAMP / ISO 27001 reviewers
  prefer or require runtime versions with documented LTS
  guarantees. Node 22 LTS supports through April 2027,
  covering the 2026 audit window. Node 24 LTS doesn't
  begin until October 2026; running on the current/non-LTS
  line during the 2026 audit window invites
  due-diligence pushback. The operator deliberately
  migrated local Node from `v24.13.1` to `v22.11.0` to
  match this pin — accepting that local-vs-CI parity
  required local to follow CI's compliance stance, not the
  reverse.
- **Trade-off accepted**: deliberate divergence from
  Decision E's parity-axis reasoning. Node 22 LTS may have
  weaker performance characteristics than Node 24 in
  specific workloads; the audit-posture gain dominates.
- **Re-evaluation triggers**: Node 22 enters maintenance
  (April 2027); migrate to next LTS line via deliberate
  `.nvmrc` edit + ADR amendment.

### Anthropic SDK version

- **Currently**: package.json range `^0.92.0` (semver-range,
  not strictly pinned)
- **Dominant axis (when pinned)**: API-stability
- **Status**: queued for explicit pinning decision.
  Foundation makes real Anthropic API calls in nightly
  CI (per ADR-0015's `nightly-real-llm.yml` workflow);
  any API breaking change cascades through real-LLM
  tests. The current `^0.92.0` range allows minor and
  patch updates within 0.x — which the SDK's pre-1.0
  versioning treats as potentially-breaking. The semver
  range is currently constrained by `package-lock.json`
  to a specific resolved version, but the range itself
  permits unpinned drift on next `npm install` without
  lock.
- **Action**: Gate 8+ work to pin explicitly via narrow
  range or exact version; document API-stability axis
  with re-evaluation trigger on Anthropic 1.0 release or
  major SDK redesign.

### Prisma version

- **Currently**: 6.19.3 (from package-lock.json's
  resolved versions; package.json declares `prisma`
  range)
- **Dominant axis**: schema-migration-safety
- **Reasoning** (anticipated): Prisma version pins affect
  schema migration generation, client API surface, and
  query semantics. A major-version bump (e.g., to Prisma
  7) requires deliberate evaluation against schema
  stability — production data created under Prisma 6's
  schema model must remain operable.
- **Status**: 7.x available upstream; major version bump
  requires deliberate evaluation. Currently held at 6.19.3
  by lock-file resolution, but no explicit ADR-level
  documentation exists.
- **Action**: Section 10+ work to evaluate Prisma 7
  migration with axis documented (or re-affirm 6.x pin
  with explicit re-evaluation triggers).

### Capsule schema version

- **Currently**: implicit via `packages/database/prisma/
  schema.prisma` evolution; no explicit version field on
  capsule records
- **Dominant axis**: backward-compatibility for stored
  data
- **Reasoning**: production capsules created under prior
  schema iterations must remain readable indefinitely.
  Patent claims tie capsule durability to user
  sovereignty; schema migrations that drop columns or
  change semantic meanings of fields silently break the
  claim. Each schema evolution must produce a forward-
  compatible migration path or an explicit versioned
  capsule shape.
- **Status**: queued for explicit ADR documentation. No
  capsule rows currently carry a per-record version
  field; schema evolution happens via Prisma migrations
  without an explicit version marker on individual
  records.
- **Action**: Section 9+ work to evaluate explicit
  capsule schema versioning per the Pin-and-Optimize
  Framework's five-question template; specific
  implementation (schema_version column, migration
  framework, backward-compatible reader logic) is
  Section 9 product work, not Pin-and-Optimize framework
  scope.

### Vitest version

- **Currently**: `^2.1.8` declared in package.json
  (semver-range, locked to 2.1.9 by package-lock.json)
- **Dominant axis**: API-stability for the test substrate
- **Reasoning**: vitest is the deterministic substrate
  underlying ADR-0011's three-tier stratification. A
  vitest major-version bump (3.x) could change config
  shape, fork/thread semantics, or fixture-resolution
  behavior — invalidating the empirical reproducibility
  evidence ADR-0011 amendment captured. Test substrate
  changes require deliberate evaluation, not auto-tracking.
- **Status**: implicitly pinned via lock; lacks explicit
  ADR documentation
- **Action**: Gate 8+ documentation work; affirm or
  formalize the pin with an ADR amendment.

### Deployment-target category (ADR-0018)

- **Pinned**: Postgres-compatible deployment-target
  category (Postgres 16+ semantics, `postgresql://`
  connection, role/permission model, pgbouncer-aware
  connection pool) — not a specific vendor or product.
  Current operator deployment: Supabase-hosted.
- **Dominant axis**: substrate-portability for commercial
  reach across procurement-mandated customer categories
  (managed cloud, sovereign cloud, on-premise, air-
  gapped, blockchain reserved-for-future).
- **Reasoning**: ADR-0018's coherence audit empirically
  verified Foundation has zero vendor SDK imports, zero
  Postgres extensions, and provider-agnostic Prisma —
  the substrate is already deployment-target agnostic
  by inherited substrate decisions (ADR-0001 wallet
  architecture, ADR-0004 service-owned auth gate,
  ADR-0006 cross-org leak prevention via filter
  narrowing, ADR-0013 containerized Postgres). Pinning
  the deployment-target category (not a specific vendor)
  preserves COSMP/DMW commercial reach across
  procurement gates (DoD CNSA 2.0, NSM-10, FedRAMP,
  EU NIS2, on-premise compliance environments) without
  per-customer substrate forking. The pin is enforced
  by deliberate non-decisions (no vendor SDK adoption,
  no Postgres extensions) verified at audit time, not
  by a specific config-file constraint.
- **Trade-off accepted**: per-deployment optimization
  opportunities sacrificed (Supabase-specific Realtime
  channels, AWS-specific RDS Proxy caching, Azure-
  specific managed identity integration). The
  agnosticism floor outweighs vendor-specific
  performance gains because procurement-mandated
  categories require zero-vendor-lock evidence;
  cost/performance optimization loses to substrate-
  portability when commercial reach depends on
  portability.
- **Re-evaluation triggers**: customer requirement
  that's not Postgres-compatible (e.g., DynamoDB-only
  deployment); substrate decision to adopt a vendor-
  specific feature (gets its own ADR per ADR-0018's
  relaxation framework); blockchain integration
  category activation per NIOV roadmap.

### Cryptographic-suite (ADR-0019)

- **Pinned**: symmetric-only cryptographic suite via
  `CRYPTO_CONFIG` (`packages/auth/src/crypto-config.ts`)
  with `Object.freeze` + boot-validation anchor tests
  per ADR-0003: HS256 (JWT), SHA-256 (hashes), AES-256-
  GCM (content), bcrypt rounds=12-prod / 4-test
  (passwords). Future asymmetric crypto (e.g.,
  Sub-box 7's `ATTESTATION_ALGORITHM`) MUST be PQC
  primitives (FIPS 204 ML-DSA, FIPS 203 ML-KEM, FIPS
  205 SLH-DSA) or hybrid schemes per ADR-0019's six-
  step decision template; pre-quantum asymmetric
  primitives (RS256, ES256, Ed25519, ECDSA) are
  rejected.
- **Dominant axis**: security-posture for post-quantum
  readiness. Foundation's substrate is already post-
  quantum ready by primitive selection (zero Shor's-
  algorithm-vulnerable crypto in production per
  ADR-0019's audit). Codifying as deliberate posture
  preserves the property as a maintained discipline
  rather than emergent fact.
- **Reasoning**: PQC-readiness is increasingly a
  procurement gate for DoD CNSA 2.0, federal civilian
  under NSM-10, EU NIS2 affected entities, and
  forward-looking enterprise (SEC retention, HIPAA
  long-lived data, defense industrial base). Sub-box
  7's anticipated `ATTESTATION_ALGORITHM` landing is
  the substrate's first asymmetric inflection point
  — pre-positioning the discipline before that ADR
  lands prevents RS256/ES256 from incurring PQC-
  migration debt. CRYPTO_CONFIG centralization +
  ADR-0003 freeze pattern + boot-validation anchor
  tests serve the pinning discipline directly: every
  algorithm is pinned at the constant level;
  modification requires deliberate code change with
  anchor-test re-verification; no runtime mutation
  possible.
- **Trade-off accepted**: PQC primitive sizes are
  larger than classical alternatives (ML-DSA-65
  signatures ~3.3 KB vs ~64 bytes for Ed25519; SLH-DSA
  signatures 8-50 KB). Hybrid schemes during transition
  double signing work. The audit-posture and PQC-
  readiness gains dominate over performance optimization
  because audit reviewers and acquisition officers
  evaluate cryptographic resilience as substrate
  evidence during due-diligence; audit-trail-stability
  axis benefits as a secondary consequence (algorithm
  changes propagate through every signature/hash/
  encryption record, so stability itself is substrate
  evidence).
- **Re-evaluation triggers**: NIST PQC standards
  updates (additional FIPS publications); cryptanalysis
  advances against current primitives (lattice-based
  schemes are an active research area); customer-
  specific compliance constraints (CNSS Policy 15,
  FIPS 140-3 module restrictions); Sub-box 7
  implementation ADR (the next asymmetric crypto
  primitive selection). Per-primitive re-evaluation
  triggers are documented in ADR-0019's worked
  examples.

## Decision Template for Future Pinning Decisions

When a new pinning decision arises, the ADR (or ADR
amendment) introducing it must answer:

1. **What is being pinned** (specific version, with full
   precision — exact patch, not range)?
2. **What axes were considered**? At minimum: parity,
   LTS-compliance, security, API-stability, cost,
   performance, audit-trail. Add resource-specific axes as
   needed.
3. **Which axis dominates** for this resource and why?
4. **What trade-offs are accepted** on non-dominant axes?
5. **What re-evaluation triggers** should re-open this
   decision (LTS expiration, security patch availability,
   major version available, dependency drift, etc.)?

This template is canonical. Pinning decisions that skip
any of the five questions are incomplete and require
amendment before merge.

## Consequences

### Easier

- Future pinning decisions follow a documented framework
  rather than ad-hoc reasoning; consistency improves.
- Compliance reviewers see explicit trade-off reasoning,
  not assertion; positions Foundation favorably for
  SOC 2 / FedRAMP / ISO 27001 audit cycles.
- Investor due diligence on substrate quality answered
  with deployable evidence: the ADR worked-examples
  section is itself a presentation-ready artifact.
- New contributors (or new AI agents helping with
  substrate work) can apply the framework to new
  resources without re-deriving the reasoning from
  first principles.
- Anti-patterns become explicitly named: "pin everything
  to LTS" and "pin everything to local parity" are
  recognized as different mistakes, neither correct as a
  global default.
- Patent-holder implementation record gains another
  documented architectural principle; reinforces the
  pattern of converting tacit engineering judgment into
  explicit architectural artifacts.
- The framework integrates naturally with existing
  substrate discipline: every pin gets an ADR; every ADR
  cites this framework; every audit produces a
  traceable evidence chain.
- Discovery of unpinned-or-undocumented resources
  becomes itself a substrate-honest finding, not a
  silent gap.

### Harder

- Every new pinning decision requires explicit ADR work
  (or amendment to an existing ADR). The
  five-question template adds documentation overhead to
  decisions that previously could be made informally.
  Low-stakes pins (e.g., a small dev-dependency where
  the axis is clearly cost-optimization) still require
  documentation; the discipline applies even when
  "everyone knows" the right pin.
- Re-evaluation triggers must be tracked across
  resources. LTS expirations, security patches, major
  versions available, dependency drift — all require
  someone (or automated tooling) to remember the
  triggers and re-open the relevant ADRs at the right
  time. Missing a re-evaluation window leaves Foundation
  on stale or unsupported pins.
- Different axes for different resources can produce
  apparent inconsistency that requires explanation to
  reviewers. A reviewer accustomed to "everything
  pinned to LTS" or "everything pinned to local parity"
  may flag the divergence between Decision E and
  Decision H as a contradiction; explaining the
  per-resource-axis pattern is itself ongoing work.
- The framework discipline applies even when wrong —
  selecting the wrong dominant axis for a resource
  produces a poor pin despite following the framework.
  The framework is a reasoning scaffold, not a
  substitute for actual technical judgment about each
  resource's substrate role. Skill-level dependency
  remains.
- Future Node 22 → 24 migration becomes scheduled work
  the team must remember and execute deliberately rather
  than auto-tracking. Same applies to Postgres 16
  end-of-life (currently unspecified upstream;
  monitoring required), Anthropic SDK 1.0 release,
  Prisma 7 evaluation, vitest 3 evaluation. The
  scheduled-work backlog grows with each new pin.
- Operator burden of maintaining axis-mapping discipline
  scales with substrate growth. Each new external
  dependency requires triage: should it be pinned? what's
  the dominant axis? Foundation's substrate is still
  growing; the maintenance overhead grows with it.
- Trade-offs documented in ADRs become themselves
  substrate that must remain accurate as the world
  changes. If Anthropic releases v1.0 with breaking
  changes, the "API-stability" trade-off documentation
  in the SDK pin's ADR may need updating to reflect
  the new constraints; documentation drift is its own
  failure mode the framework requires guarding against.
- Ad-hoc pinning was the prior state; converting all
  existing implicit pins (vitest, Prisma, Anthropic SDK,
  TypeScript itself, etc.) to explicit framework
  documentation is its own multi-gate Gate 8+ work
  backlog. The framework lands; the conversion work it
  implies is sizeable.
- Edge cases where multiple axes are equally dominant
  (e.g., a resource where both parity AND LTS-compliance
  matter equally) require operator judgment to break
  ties, and that judgment may need its own
  meta-documentation. The framework reduces ambiguity
  but doesn't eliminate it.

## Alternatives Considered

- **Pin nothing (anti-pattern)**: rejected. Moving tags
  break reproducibility (ADR-0011's variance evidence
  becomes impossible to defend), compound debugging cost,
  and create audit-trail gaps. This was the implicit
  pre-Track-A state for several dependencies and
  produced concrete pain (e.g., Drift G7-PRE-A package-
  lock drift pre-Gate-7). Pinning is the floor.

- **Pin everything to LTS regardless of resource role**:
  rejected. Postgres doesn't ship LTS labels; Anthropic
  SDK doesn't ship LTS labels; capsule schemas don't ship
  LTS labels. Forcing every pin into the LTS frame
  produces nonsensical decisions for resources where
  audit-compliance isn't the dominant concern. The Node
  pin (Decision H) genuinely was LTS-driven; the Postgres
  pin (Decision E) genuinely was parity-driven; treating
  them identically would have inverted one of the two
  reasoning chains.

- **Pin everything to local parity regardless of resource
  role**: rejected. Operator's local Node was 24.13.1
  before Decision H; pinning CI to match would have
  inherited a non-LTS posture for a runtime where audit
  reviewers are the dominant downstream consumer. Local
  is convenience; CI is substrate. Substrate concerns
  dominate when the local choice was incidental.

- **Auto-track latest patches within major versions**:
  rejected as a default. Auto-tracking introduces
  non-determinism that breaks reproducibility evidence;
  the same logic that rejected `postgres:latest` in
  ADR-0015 Decision E's Alternatives applies to within-
  major auto-track. **Adopted in narrow contexts** for
  security-patch-cadence-dominant resources where the
  audit-trail can absorb the per-patch deltas (e.g.,
  Dependabot security alerts on package vulnerabilities;
  these will be Gate 8 work).

- **Per-resource ad-hoc decisions without framework**:
  rejected. This was the pre-ADR-0016 state; produced
  Decision E + Decision H independently before the
  pattern was named. The independent decisions worked
  out fine in those two cases, but produced no
  reusable scaffold for future decisions. Without the
  framework, every new pinning decision re-derives the
  reasoning, with growing risk of inconsistency over
  time.

- **Centralize all pins in one config file (e.g.,
  `pins.yaml`)**: rejected as the framework's lone
  artifact. A central pin manifest is useful as
  operational tooling but doesn't replace per-pin
  reasoning. Each pin still needs its dominant-axis ADR
  documentation. A `pins.yaml` may be Gate 9+ tooling
  on top of the framework, not a replacement.

## References

- **ADR-0011** (three-tier test stratification + Gate 6
  reproducibility amendment) — reproducibility evidence
  depends on Postgres image pin per Decision E; this ADR
  documents why parity-with-local is the right axis for
  that pin.
- **ADR-0013** (containerized Postgres for unit +
  integration tiers) — established the
  `postgres:16.4-alpine` pin that Decision E inherited
  and Decision H pattern-matched against (different axis,
  same pinning discipline).
- **ADR-0015** (CI Workflow Architecture) — Decisions E
  + H introduced the dominant-concern-per-axis pattern
  that this ADR elevates to canonical framework.
- `78cf1b5` (Track A Gate 7) — landed ADR-0015 with
  Decisions E + H.
- `9f8e909` (Track A Gate 7-post) — Drift G7-E
  resolution reinforced the parity reasoning for
  env-loading patterns; same parity-axis logic as
  Decision E, applied to a different resource layer.

Bidirectional citations (cited from):

- Track A Gate 8a (commit `3febf83`) added ADR-0016
  back-references in ADR-0015's References section
  (Decisions E + H retroactively cite this canonical
  framework).
- Track A Gate 8b (commit `3a571fb`) added ADR-0016
  references in `CLAUDE.md` Section 7 (operational
  pointer for Pin-and-Optimize Framework). Track A
  Gate 8c will add an ADR-0016 reference in a
  forthcoming `docs/contributing/testing.md` when the
  testing documentation lands.
- **ADR-0017** (Production Discipline; landed `444cf56`)
  — cites ADR-0016 as companion ADR forming the substrate-
  discipline canonical references pair. ADR-0016 covers
  what-to-pin (substrate-pinning); ADR-0017 covers
  how-to-investigate-drifts (substrate-maintenance). The
  forward-tense reference in this section's earlier
  drafting is delivered.
- **ADR-0018** (Deployment-Target Agnosticism Posture;
  landed `657a794`) — cites ADR-0016 as the framework
  governing deployment-target category pin discipline.
  The Pin-and-Optimize five-question template applies
  to deployment-target decisions; the new Worked
  Examples entry "Deployment-target category (ADR-0018)"
  makes the pattern explicit. ADR-0018 is the third
  leg of the substrate-discipline canonical references
  (ADR-0016 what-to-pin + ADR-0017 how-to-investigate
  + ADR-0018 where-to-deploy); CLAUDE.md Section 6's
  "framing growth-drift acknowledgment" narrative
  explains why this ADR's body language stays as "pair"
  while the canonical-reference set has grown to four
  members.
- **ADR-0019** (Cryptographic-Suite Posture; landed
  `7216784`) — cites ADR-0016 as the framework
  governing cryptographic-primitive pin discipline.
  The Pin-and-Optimize five-question template applies
  to per-primitive PQC-or-hybrid selection; the new
  Worked Examples entry "Cryptographic-suite
  (ADR-0019)" makes the pattern explicit. ADR-0019
  is the fourth leg of the substrate-discipline
  canonical references (what-to-pin + how-to-
  investigate + where-to-deploy + cryptographic-
  suite); the asymmetric framing language across
  ADR-0016/0017/0018/0019 is growth drift, not
  contradiction (CLAUDE.md Section 6 narrative).
- Future pinning decisions (Anthropic SDK explicit pin,
  Prisma version evaluation, capsule schema versioning,
  vitest version evaluation) will cite ADR-0016 as their
  reasoning scaffold and worked-examples reference.
