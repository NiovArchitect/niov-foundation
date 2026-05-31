# ADR-0019: Cryptographic-Suite Posture

Status: Active
Date: 2026-05-07
Trigger: Codex cryptographic-posture audit (investigation-
only) following ADR-0018 deployment-target agnosticism
codification; substrate-honest finding that Foundation's
zero-Shor's-vulnerable-crypto property emerged from
deliberate primitive selection but lacks an ADR codifying
the posture as deliberate. Sub-box 7's anticipated
ATTESTATION_ALGORITHM landing (currently planned as
RS256 or ES256 per `crypto-config.ts` header) is the
inflection point requiring PQC-or-hybrid framing before
the asymmetric crypto lands.

## Context

### Audit findings (empirical)

Codex's cryptographic-posture audit (run before ADR-0019
drafting; investigation-only; not committed) established
the following empirically:

- Foundation uses ONLY symmetric cryptography in
  production today: HS256 (HMAC-SHA-256) for JWT
  signing, SHA-256 for content/audit/dedup hashing,
  AES-256-GCM for content encryption, bcrypt for
  password hashing, Node `randomBytes` / `randomUUID`
  for nonces and IDs.
- Zero Shor's-algorithm-vulnerable primitives in active
  use: no RSA, no ECDSA, no Ed25519, no ECDH, no DH,
  no DSA. The audit's `Q2.d` grep for asymmetric crypto
  / KDF returned ZERO matches across `apps/`,
  `packages/`, `scripts/`, `tests/`.
- `Wallet.public_key` schema field reserved at
  `packages/database/prisma/schema.prisma:30` but
  populated with placeholder strings (`pk_person_<id>`,
  `pk_org_<id>`, `pk_twin_<id>`, `pk_otzar_<id>`) — no
  actual cryptographic public keys today. The schema
  anticipates DMW signing-key adoption; the
  implementation uses placeholder identifiers pending a
  cryptographic-mechanism decision.
- Capsules are NOT cryptographically signed. Integrity
  comes from SHA-256 `content_hash` + audit chain hash
  + JWT-authenticated write authorization. The `Q4.a`
  grep for capsule signature operations returned only
  one passing comment about future work.
- `CRYPTO_CONFIG` (`packages/auth/src/crypto-config.ts`)
  centralizes algorithm choices and is `Object.freeze`-d
  per ADR-0003. Some call sites still hardcode literal
  algorithm strings rather than routing through the
  config: `createCipheriv("aes-256-gcm", ...)` at
  `crypto.ts:34`; `createHash("sha256")` at multiple
  sites; `"sha256:"` prefix in `observation.service.ts`.
  These are `Q5` crypto-agility findings (rated 2/5).
- `CRYPTO_CONFIG` header explicitly anticipates Sub-box
  7's `ATTESTATION_ALGORITHM` landing as RS256 or ES256:
  *"Section 12.5 Sub-box 7 ... extends this configuration
  with an asymmetric signing path (RS256 or ES256) used
  for compliance attestations published to external
  recipients ... a parallel ATTESTATION_ALGORITHM
  constant joins this config when Sub-box 7 lands."*
  Both RS256 and ES256 are Shor's-vulnerable.

### Why post-quantum readiness matters for COSMP/DMW commercial reach

Parallel to ADR-0018's commercial-reach framing applied
to the cryptographic dimension. Customer categories
that increasingly require PQC-readiness as a procurement
gate:

- **DoD CNSA 2.0 mandate** (memorandum NSM-10): NSS
  systems migrating to PQC by 2030-2035; new IL5+
  acquisitions increasingly require crypto-agility
  planning today. Defense procurement officers flag
  Shor's-vulnerable crypto as a transition-risk
  exposure.
- **Federal civilian under NSM-10**: agencies preparing
  PQC migration roadmaps; 3PAO assessors flag Shor's-
  vulnerable crypto in FedRAMP High audit cycles.
- **Forward-looking enterprise** (financial services,
  healthcare with long-lived data, defense industrial
  base): security review increasingly asks for PQC-
  readiness evidence. SEC retention requirements
  (decades-long) make signature longevity a real
  concern.
- **EU NIS2 Directive** affected entities: cybersecurity
  risk management explicitly requires considering
  quantum threats as part of organizational risk
  posture.

Foundation's substrate is already in a remarkably strong
position — not because PQC migration was completed but
because asymmetric crypto was never adopted. Codifying
this as deliberate posture converts the property from
emergent fact to maintained discipline. The commercial
reach into PQC-mandated categories depends on this
documentation existing; without it, the property is
invisible to procurement reviewers reading the ADR
network one decision at a time.

### Why the property must be deliberate, not emergent

Same logic as ADR-0018's emergence-fragility argument
applied to the cryptographic dimension:

- **Drift over time**: future contributors (or AI agents)
  reach for `@noble/ed25519`, `node-forge` RSA, or
  `jose` for an asymmetric-signature feature without
  realizing the PQC-readiness cost. By the time the
  import lands in a commit, reverting it is more work
  than preventing it would have been. The
  `CRYPTO_CONFIG` header's "Sub-box 7 will use RS256 or
  ES256" forward reference is itself an instance of
  this drift waiting to happen.
- **Audit invisibility**: compliance reviewers reading
  Foundation's substrate one decision at a time may
  not see the deliberate posture; an ADR makes it
  visible. CNSA 2.0 / NSM-10 / NIS2 reviewers asking
  "what's your PQC-readiness posture?" need a documented
  answer, not "we don't use asymmetric crypto today,
  trust us."
- **Strategic fragility**: NIOV's commercial reach into
  PQC-mandated customer categories depends on this
  property; an undocumented property is a property at
  risk.

Documenting the posture as deliberate converts the PQC-
readiness from an emergent fact to a maintained
discipline. The maintenance discipline (component 3
below) is the artifact this ADR creates beyond
descriptive documentation.

### Why Sub-box 7 is the inflection point

`CRYPTO_CONFIG` header at
`packages/auth/src/crypto-config.ts:36-44` explicitly
states:

> *"Section 12.5 Sub-box 7 ... extends this configuration
> with an asymmetric signing path (RS256 or ES256) used
> for compliance attestations published to external
> recipients. The current HS256 algorithm covers internal
> session tokens only; the asymmetric path lands when
> verifiable-credentials infrastructure is needed.
> JWT_ALGORITHM stays HS256 for session tokens; a
> parallel ATTESTATION_ALGORITHM constant joins this
> config when Sub-box 7 lands."*

RS256 and ES256 are BOTH Shor's-vulnerable. If Sub-box 7
lands with these primitives as drafted in the header,
Foundation introduces its first quantum-vulnerable
crypto and incurs PQC-migration debt before the broader
enterprise even discovers the need. The current header
is forward-looking design intent, not a commitment, but
it represents the active drift trajectory absent
intervention.

ADR-0019 must steer Sub-box 7's primitive selection
toward (a) PQC primitives directly (FIPS 203 / 204 /
205), or (b) hybrid signature schemes (classical + PQC
simultaneously during transition; verifiers accept
either; transition is graceful), from day one — not as
a future migration after RS256/ES256 has shipped.

### Patent-holder implementation-record dimension

Parallel to ADR-0018: cryptographic-resilience documented
as deliberate is substrate evidence audit reviewers and
acquisition officers evaluate during due-diligence,
3PAO assessment, and procurement security review. A
documented posture is concrete evidence; an emergent
property is not.

Per audit finding (h): documented patent claims (US
12,517,919, US 12,164,537, US 12,399,904) appear at
protocol/pattern level (operation enumeration, privacy-
aggregation pattern, layer structure), not specific-
primitive level. The codebase's documentation of the
patents — *"Canonical expansion locked by patent
US 12,517,919"* (`docs/reference/glossary.md` for
COSMP), *"invalidated cryptographically. See US patent
12,517,919"* (for ABT), *"privacy-preserving aggregation
pattern is protected by patent US 12,517,919"* (for
Hive Intelligence) — implies algorithmic flexibility
within the patented protocol semantics. Operator owns
the authoritative patent-claim reading; ADR-0019 commits
to primitive flexibility within whatever protocol-level
semantics the patents specify.

CLAUDE.md explicit guidance applies: *"Do not assume
the patent text — verify against US 12,517,919."* The
ADR-0019 framing here describes the codebase's
documentation of the patents, not the patents
themselves.

## Decision

The Cryptographic-Suite Posture has three components.

### 1. Substrate is post-quantum ready by primitive selection

Foundation today uses ONLY primitives that survive the
quantum transition with appropriate key sizes:

**(a) Signatures**: HS256 (HMAC-SHA-256) for JWT tokens
(session, declaration, gateway). Quantum-resistant;
Grover's algorithm provides only quadratic speedup
(256→128-bit security); remains practical at 256-bit
key strength. NIST SP 800-131A approved.

**(b) Hashes**: SHA-256 for capsule `content_hash`,
audit chain `event_hash`, observation dedup hash, LLM
input hash, encryption-key derivation. Quantum-resistant
for collision resistance at ~128-bit level under
Grover. FIPS 180-4 approved.

**(c) Symmetric encryption**: AES-256-GCM with 12-byte
IV + 32-byte key for capsule content encryption
(`packages/auth/src/crypto.ts`). Quantum-resistant;
Grover halves to 128-bit security; remains practical
with 256-bit keys. FIPS NIST SP 800-38D approved.

**(d) Password hashing**: bcrypt (12 rounds production /
4 rounds test). Blowfish-based KDF; not a Shor's
target; quantum-resistant. NIST SP 800-63B Appendix
A.3 approved.

**(e) Random / nonce generation**: Node `randomBytes` /
`randomUUID` (CSPRNG via OpenSSL). Quantum-resistant
when seeded by hardware RNG.

**Foundation does NOT use:**
- RSA (any key size) — Shor's-vulnerable
- ECDSA (any curve including P-256, P-384, P-521,
  secp256k1) — Shor's-vulnerable
- Ed25519 / Ed448 — Shor's-vulnerable
- ECDH (any curve) — Shor's-vulnerable
- DH (Diffie-Hellman finite-field) — Shor's-vulnerable
- DSA — Shor's-vulnerable

**This is a positive design property, not an oversight.**
The codebase's audit-confirmed absence of asymmetric
crypto reflects deliberate substrate decisions
(ADR-0004's service-owned auth gate rejects cloud-
managed asymmetric auth; ADR-0001's wallet architecture
uses hash-based integrity; ADR-0009's COSMP operations
specify protocol semantics at hash/HMAC level rather
than at signature level) plus the cumulative non-
decision of never adopting asymmetric crypto libraries.

### 2. Architectural decisions that produce the post-quantum readiness

The posture emerges from a deliberate set of inherited
decisions and non-decisions:

- **ADR-0003** (frozen-config tamper anchors):
  `CRYPTO_CONFIG` centralization pattern. Algorithm
  choices live in ONE place (`packages/auth/src/crypto-
  config.ts`); migration is a deliberate code change
  with anchor tests, not a runtime mutation. ADR-0003's
  explicit forward-reference to *"Section 12.5 Sub-box
  7 attestation algorithm parameters will follow the
  same pattern"* is COMPATIBLE with PQC-or-hybrid
  primitive selection — extension is allowed.
- **`CRYPTO_CONFIG` existing constants**: HS256, SHA-256,
  AES-256-GCM, bcrypt — every primitive in active use
  is symmetric and quantum-resistant. Each constant has
  an anchor test (`tests/unit/boot-validation.test.ts`)
  asserting the freeze.
- **Symmetric-only design choice**: Foundation derives
  capsule integrity from hash chain + JWT authorization
  rather than per-capsule asymmetric signatures. This
  was a substrate-quality decision that compoundingly
  enables PQC readiness — every capsule that ships
  today is post-quantum-readable for free.
- **`Wallet.public_key` placeholder pattern**: schema
  reserves the field for future signing-keys but
  populates with placeholder strings until the
  cryptographic mechanism is selected. The reservation
  preserves optionality without committing to specific
  primitive (verified by audit `Q4.c`).
- **Absence of third-party asymmetric crypto libraries**:
  no `@noble/curves`, no `node-forge`, no `jose` for
  RSA/EC, no `elliptic`, no `jsrsasign`, no `tweetnacl`,
  no `libsodium`. Audit `Q1.b` verified zero matches.
- **Sub-box 7 forward reference**: `CRYPTO_CONFIG`
  header documents the planned `ATTESTATION_ALGORITHM`
  landing but does not prescribe specific primitive —
  leaves the choice for ADR-tracked decision (this
  ADR resolves the choice toward PQC-or-hybrid).
- **ADR-0004** (service-owned auth gate): rejects
  cloud-managed auth that would import vendor SDKs
  with asymmetric crypto. AuthService's IDP-pluggable
  design accommodates classical IDPs today but does
  not lock asymmetric primitives into the substrate.
- **ADR-0009** (COSMP 7-operation enumeration): patent
  claims at protocol level. Operations specified
  semantically (AUTHENTICATE, NEGOTIATE, READ, WRITE,
  SHARE, AUDIT, REVOKE) without prescribing
  cryptographic primitives — primitive flexibility
  preserved.

### 3. Maintenance discipline that preserves post-quantum readiness

The post-quantum readiness is a maintained property,
not a static fact. Specific disciplines preserve it:

**No asymmetric primitive adoption without PQC-or-hybrid
framing.** Before introducing any asymmetric crypto
(signatures, key exchange, public-key encryption),
produce an ADR documenting:
- What requires asymmetric crypto (the use case that
  pure symmetric can't serve)
- Whether the use case can be served by FIPS 204
  (ML-DSA) for signatures, FIPS 203 (ML-KEM) for key
  encapsulation, FIPS 205 (SLH-DSA) for long-lived
  signatures
- If hybrid (classical + PQC during transition):
  protocol design for accepting both signatures during
  validation, transition timeline, sunset criteria for
  classical leg
- Re-evaluation triggers: NIST PQC standards updates,
  cryptanalysis advances, customer requirements

**No call-site hardcoding of algorithm literals.** Every
algorithm choice routes through `CRYPTO_CONFIG`.
Existing hardcoded sites identified in audit `Q5`:
`createCipheriv("aes-256-gcm", ...)` at `crypto.ts:34,
57`; `createHash("sha256")` at multiple sites including
`tar.ts:179`, `observation.service.ts:131`, `read.
service.ts:152`, `audit.ts`; `"sha256:"` prefix in
`observation.service.ts:130` and `otzar.service.ts:546,
732`. These work today (the literal matches
`CRYPTO_CONFIG.HASH_ALGORITHM`'s `"sha256"` value) but
undermine the centralized-constant discipline. Cleanup
is Gate 8d carryforward.

**No `CRYPTO_CONFIG` modification without anchor test.**
Per ADR-0003 freeze pattern: every new constant added
to `CRYPTO_CONFIG` gets its own anchor test verifying
the freeze. Adding `ATTESTATION_ALGORITHM`,
`ATTESTATION_ALGORITHM_PQC`, `HASH_ALGORITHM_LONG_LIVED`,
or any future addition requires both the constant
addition and the anchor test in the same commit.

**No algorithm migration without in-flight data
handling.** When migrating an algorithm in
`CRYPTO_CONFIG` (rare; typically responding to
cryptanalysis advances or NIST standards updates):
- Document the migration ADR (what's changing, why,
  re-evaluation triggers, sunset criteria for prior
  algorithm)
- Handle in-flight data (data hashed/encrypted under
  prior algorithm needs migration path; capsule
  `content_hash` migration is the most consequential —
  every existing capsule's hash must remain verifiable
  during transition)
- Update boot-validation anchor test to reflect new
  algorithm
- Verify call sites that hardcode literals match the
  new value (ideally: Gate 8d cleanup eliminates these
  before any migration is attempted)

#### When discipline relaxation IS appropriate

Three cases paralleling ADR-0018's relaxation framework,
applied to the cryptographic dimension:

- **Performance-critical hot paths where PQC overhead
  is unacceptable.** ML-DSA-65 signatures are larger
  (~3.3 KB vs ~64 bytes for Ed25519) and slower
  (~10× signing latency). If a use case demands sub-
  millisecond signatures at high throughput (e.g.,
  per-request signing in a mobile chat protocol where
  battery and bandwidth dominate), the relaxation
  lands as an ADR documenting (a) why pure PQC was
  insufficient, (b) what hybrid scheme bridges the
  classical-PQC transition, (c) what re-evaluation
  triggers exist, (d) whether the use case can be
  re-architected to remove the per-operation signing
  requirement.
- **Operator-side operational tooling that doesn't run
  in production.** Maintenance scripts, monitoring
  dashboards, log shippers, fixture-recording scripts
  can use any crypto primitives because they don't
  run inside the Foundation runtime. The boundary is
  *"what runs in `apps/api/src/` at customer deployment
  time"* — outside that boundary, operator-side
  tooling isn't part of the cryptographic-suite
  substrate.
- **Customer-specific compliance constraints.** Some
  regulatory environments mandate specific algorithms
  (FIPS 140-3 module restrictions; classified-system
  algorithm allowlists from CNSS Policy 15; sovereign-
  customer sovereign-crypto-suite mandates). Customer-
  side constraints may require different primitives
  than Foundation's default; the discipline
  accommodates this via `CRYPTO_CONFIG`-driven config
  with deployment-time overrides documented per
  ADR-0018's customer-side configuration boundary.

## Worked Examples

### Current symmetric-only stack (ACTIVE)

- **Status**: ACTIVE. Foundation in production today
  uses only HS256, SHA-256, AES-256-GCM, bcrypt,
  Node `randomBytes`. Codex's audit verified
  empirically — zero Shor's-vulnerable primitives in
  active use.
- **Posture**: post-quantum ready by primitive selection;
  every active primitive survives the quantum
  transition with appropriate key sizes.
- **What this unblocks**: PQC-mandated customer
  categories (DoD CNSA 2.0; federal civilian under
  NSM-10; forward-looking enterprise; EU NIS2 affected
  entities) without migration debt. "Harvest now,
  decrypt later" exposure is near-zero — Foundation's
  substrate has no asymmetric ciphertexts for a future
  quantum computer to retroactively decrypt.
- **Outstanding work**: Gate 8d cleanup of hardcoded
  algorithm literals at non-`CRYPTO_CONFIG`-routed
  call sites (`createCipheriv("aes-256-gcm", ...)`,
  `createHash("sha256")`, `"sha256:"` prefix in
  `observation.service.ts`). Crypto-agility 2/5
  baseline rises to 3/5 once cleanup completes.

### Sub-box 7 ATTESTATION_ALGORITHM (QUEUED)

- **Status**: QUEUED. Sub-box 7 lands when verifiable-
  credentials infrastructure is needed — compliance
  attestations published to external recipients (3PAO
  assessors, customer auditors, regulatory bodies).
- **Posture (anticipated)**: ADR-0019 steers the
  primitive selection toward FIPS 204 (ML-DSA-65 or
  ML-DSA-87) directly OR hybrid (ES256 + ML-DSA
  during transition; verifier accepts either).
  RS256/ES256-only (per current `crypto-config.ts`
  header anticipation) is **REJECTED** by ADR-0019.
- **What this unblocks**: external compliance
  attestation publishing without introducing PQC-
  migration debt at the substrate's first asymmetric
  inflection point.
- **Outstanding work**: Sub-box 7 implementation ADR
  must select primitive per this discipline; anchor
  test for `ATTESTATION_ALGORITHM` constant; protocol
  design for hybrid signature acceptance if hybrid
  chosen; coordination with external recipients on
  signature-format support (3PAO assessors and
  regulators may not yet accept ML-DSA signatures, so
  hybrid may be the practical path during transition).

### DMW signing-keys (RESERVED)

- **Status**: RESERVED. `Wallet.public_key` field
  exists in schema but currently populated with
  placeholder strings (`pk_person_<id>`,
  `pk_org_<id>`, `pk_twin_<id>`, `pk_otzar_<id>`).
  Activation pending DMW protocol implementation.
- **Posture (anticipated)**: when DMW signing-keys go
  live, the cryptographic mechanism MUST be PQC-
  resistant or hybrid. Specific primitive selection
  (ML-DSA vs hybrid scheme vs SLH-DSA for long-lived
  capsule signatures) deferred to the ADR landing
  alongside DMW activation. The decision affects
  every capsule signed for the rest of Foundation's
  operational life — long-lived signatures argue for
  SLH-DSA's hash-based conservatism over lattice-
  based ML-DSA.
- **What this unblocks**: DMW protocol implementation
  with PQC-readiness baked in from day one; capsule
  signatures with multi-decade verification
  durability.
- **Outstanding work**: DMW signing-key activation ADR;
  schema migration from placeholder strings to actual
  public keys; protocol design for signature
  verification; key-rotation policy (PQC keys are
  larger and rotation has higher network cost).

### Blockchain integration (RESERVED)

- **Status**: RESERVED. Per ADR-0018's reserved-for-
  future blockchain category.
- **Posture (anticipated)**: blockchain integration
  primitives (capsule cryptographic anchoring, smart-
  contract signatures, blockchain-issued identity
  signatures) MUST be PQC-resistant or hybrid. If the
  selected blockchain doesn't natively support PQC
  (most public chains today use ECDSA / Ed25519,
  Shor's-vulnerable), integration must layer PQC on
  top — Foundation-side signatures using ML-DSA with
  the blockchain providing only the immutability
  substrate, not the cryptographic identity layer.
- **What this unblocks**: blockchain integration
  without introducing PQC-migration debt at the
  protocol-substrate boundary; preserves Foundation's
  substrate-cryptographic-resilience even when the
  underlying blockchain has weaker cryptographic
  posture.
- **Outstanding work**: blockchain integration design
  (per ADR-0018 reserved-for-future); PQC compatibility
  assessment for candidate blockchains; layered-PQC
  protocol design if the selected blockchain is
  classical-only.

### Long-lived signatures (RESERVED)

- **Status**: RESERVED. Use case: signatures on
  archival data, audit trails, capsule signatures
  intended to remain verifiable for 30+ years.
- **Posture (anticipated)**: SLH-DSA (FIPS 205, hash-
  based) is the conservative choice for very-long-
  lived signatures because hash-based schemes have
  smaller cryptanalytic risk than lattice-based
  alternatives. Lattice cryptanalysis is an active
  research area; hash-based security reduces to
  collision resistance which is much better understood.
  For 30+ year horizons, SLH-DSA's stability
  outweighs its larger signature size (~8-50 KB
  depending on parameter set).
- **What this unblocks**: archival audit trails for
  customers requiring multi-decade verifiability —
  defense (signature longevity for classified records),
  healthcare records (HIPAA + state records-retention
  laws), financial records (SEC retention), legal
  evidence (long-tail litigation), patent-application
  records.
- **Outstanding work**: use-case-specific ADR if/when
  long-lived signature requirement surfaces; signature-
  size budget analysis (8-50 KB SLH-DSA signatures
  vs Foundation's ~2 KB capsule average — non-trivial
  storage overhead); verification-cost analysis (SLH-
  DSA verification is fast but signature size affects
  network).

## Decision Template for Future Cryptographic Decisions

When a new cryptographic operation is needed (new use
case requires signatures, new encryption pattern
needed, algorithm migration triggered), the work
follows this six-step template:

1. **Identify the cryptographic operation needed**:
   signature / hash / symmetric encryption / asymmetric
   encryption / KDF / random / HMAC / key exchange.
2. **Verify whether existing `CRYPTO_CONFIG` primitive
   covers the operation**. If yes: route through the
   existing constant; document the use site; do not
   hardcode the algorithm literal at the call site.
3. **If new primitive needed: PQC-aware selection**.
   For signatures, prefer ML-DSA (FIPS 204) or hybrid
   (classical + ML-DSA). For key encapsulation, prefer
   ML-KEM (FIPS 203). For long-lived signatures (30+
   year verifiability), prefer SLH-DSA (FIPS 205).
   Reject pure pre-quantum asymmetric primitives
   unless an ADR documents relaxation rationale per
   §3 above.
4. **Add new constant to `CRYPTO_CONFIG` with anchor
   test**. Per ADR-0003 freeze pattern. The constant +
   the test land in the same commit as the use site.
5. **Document the addition with re-evaluation triggers**:
   what would invalidate the choice (cryptanalysis
   advances, NIST standards updates, customer
   requirements, performance discovery). Each pinning
   decision per ADR-0016's framework.
6. **(If migration) document the migration path** for
   in-flight data. Hashes hashed under prior algorithm
   need migration; ciphertexts encrypted under prior
   algorithm need migration; signatures signed under
   prior algorithm need verification path until
   sunset. Migration ADRs document the sunset criteria
   for the prior algorithm explicitly.

This template is canonical alongside:
- ADR-0016's five-question template (substrate-pinning)
- ADR-0017's nine-step template (substrate-investigation)
- ADR-0018's five-step template (substrate-portability)
- This ADR-0019 six-step template (substrate-
  cryptographic-resilience)

Together the four templates constitute Foundation's
substrate-discipline operational toolkit covering
substrate-quality lifecycle: what-to-pin (0016) +
how-to-investigate (0017) + where-to-deploy (0018) +
cryptographic-suite (0019).

## Consequences

### Easier

- COSMP/DMW commercial reach extends to PQC-mandated
  customer categories (CNSA 2.0, NSM-10, EU NIS2,
  forward-looking enterprise) without migration debt.
- Compliance reviewers see deliberate-architectural-
  decision documentation; PQC-readiness is no longer
  invisible to ADR-by-ADR review. CNSA 2.0 / NSM-10 /
  3PAO assessors get a documented answer to "what's
  your PQC-readiness posture?"
- Patent-holder implementation record gains documented
  cryptographic-resilience discipline — substrate
  evidence for due-diligence, 3PAO assessment, and
  procurement security review across enterprise and
  government customer pipelines.
- "Harvest now, decrypt later" exposure minimized;
  Foundation's symmetric-only stack has nothing for a
  future quantum computer to retroactively decrypt.
  The exposure surface that does exist (JWT_SECRET
  leak → token forgery) is short-lived and not
  quantum-specific.
- Sub-box 7 inflection point pre-positioned with PQC
  primitive selection (ML-DSA or hybrid) rather than
  incurring migration debt by landing RS256/ES256 as
  drafted in `crypto-config.ts` header.
- DMW signing-keys, blockchain integration, long-lived
  signatures all have PQC-readiness baked in from day
  one — when these activate, primitive selection is
  guided by this ADR rather than re-derived per
  decision.
- The discipline integrates with ADR-0016 + ADR-0017
  + ADR-0018 as the fourth leg of substrate-discipline
  canonical references covering substrate-cryptographic-
  resilience.
- Algorithm migration path documented (`CRYPTO_CONFIG`
  + anchor test + in-flight data handling) is reusable
  template for any future cryptographic migration.

### Harder

- Discipline maintenance — every new feature involving
  crypto must be evaluated for PQC compatibility
  before primitive selection. Adding a vector-search
  feature, a verifiable-credentials integration, a
  blockchain anchor, or a federated-IDP attestation
  each requires pre-flight PQC assessment.
- PQC primitives have larger signatures and slower
  operations than classical alternatives. ML-DSA-65
  signatures are ~3.3 KB vs ~64 bytes for Ed25519;
  signing latency is ~10× slower. SLH-DSA signatures
  are 8-50 KB. Some use cases trade performance for
  PQC-readiness.
- Hybrid signature schemes during transition double
  the signing work and increase storage overhead.
  External recipients (3PAO assessors, regulators)
  may not yet accept PQC-only signatures, so hybrid
  is the practical transition path — paying double
  cost during the transition.
- Some deployment environments may not have PQC
  primitives available in their cryptographic library
  versions; deployment-side updates required.
  Node.js's `node:crypto` does not yet support FIPS
  203/204/205 directly (as of 2026); Foundation may
  need to import a third-party PQC library
  (`@noble/post-quantum` or similar) when Sub-box 7
  lands, breaking the audit-confirmed zero-third-party-
  asymmetric-crypto-library posture for the first
  time. The introduction of this library is itself a
  substrate change that must be documented per the
  discipline.
- The framework is a discipline, not automation;
  someone (operator or automated tooling that doesn't
  exist yet) must enforce it across PRs and ADRs.
  The strongest enforcement today is operator review
  in the three-approvals discipline (ADR-0017
  Principle 6).
- Crypto-agility 2/5 baseline means migration requires
  call-site cleanup (Gate 8d carryforward) before
  being fully clean. The hardcoded algorithm literals
  at `createCipheriv("aes-256-gcm", ...)`,
  `createHash("sha256")`, `"sha256:"` prefix sites
  represent legacy substrate that must be addressed
  before any algorithm migration can land cleanly.
- Patent-claim-vs-implementation-flexibility tension
  remains; ADR-0019 commits to primitive flexibility
  within whatever protocol-level semantics the
  patents specify, but operator owns authoritative
  patent reading. If a patent claim turns out to
  specify a particular asymmetric primitive at the
  protocol level, ADR-0019's primitive flexibility
  framing may need amendment.
- ADR-0019 itself becomes substrate that requires
  maintenance as PQC standards evolve and primitives
  mature. NIST may publish FIPS 206/207 (additional
  PQC standards) in coming years; cryptanalysis
  advances may invalidate specific parameter sets;
  this ADR's framing must remain accurate as the
  field matures.
- Some customer environments may mandate specific
  algorithms outside Foundation's default (CNSS Policy
  15 algorithm allowlists; FIPS 140-3 module
  restrictions); `CRYPTO_CONFIG` must accommodate
  config-driven primitive overrides while preserving
  core posture. Designing the override mechanism
  without breaking the freeze invariant is non-trivial
  substrate work.

## Alternatives Considered

- **Document the de-facto PQC-readiness without
  codifying the discipline**: rejected. Same logic as
  ADR-0018's emergence-fragility argument applied to
  crypto. Today's audit was possible because no
  asymmetric crypto had been adopted, but Sub-box 7's
  inflection point looms. Without explicit discipline,
  RS256/ES256 lands as drafted in `crypto-config.ts`
  header and Foundation incurs PQC-migration debt for
  the first time. A documented property without a
  maintenance discipline is a property at risk.

- **Migrate cryptographic posture only when a customer
  requires it**: rejected. Preventive discipline is
  significantly less costly than curative migration.
  Reverting RS256/ES256 after Sub-box 7 lands is
  harder than landing PQC-or-hybrid from the start.
  The cost of a future PQC migration scales with the
  number of asymmetric-crypto-using customers and
  the volume of signatures created under classical
  primitives — both of which grow over time.

- **Commit to specific PQC algorithm today (e.g.,
  *"Foundation will use ML-DSA-65 for all asymmetric
  signatures"*)**: rejected. Framework preserves
  optionality among FIPS 203/204/205 because use-case
  specifics determine the right choice (ML-DSA for
  general signatures; SLH-DSA for long-lived; ML-KEM
  for key exchange). Pre-commitment would either
  lock in the wrong primitive for some use case or
  require ADR amendment when use-case-specific tensions
  surface.

- **Maintain pre-quantum stack and plan migration when
  NIST 2030-2035 window arrives**: rejected. Foundation
  is already post-quantum ready by primitive selection;
  ADR-0019 codifies preservation, not migration. The
  "wait for the migration window" framing assumes
  Foundation has classical asymmetric crypto today
  that needs migration; the audit confirmed this is
  not the case. The inflection point is Sub-box 7,
  not an external NIST deadline.

- **Defer cryptographic posture to per-ADR decisions
  without canonical reference**: rejected. Substrate-
  discipline canonical references exist precisely
  because per-decision approaches drift. ADR-0019 is
  the canonical reference future cryptographic
  decisions cite — Sub-box 7 ADR, DMW signing-keys
  ADR, blockchain integration ADRs, long-lived
  signature ADRs all cite this framework rather than
  re-deriving the PQC-readiness reasoning per
  decision.

- **Pre-import PQC libraries today as a forward-looking
  measure**: rejected. The substrate-honest position
  is that asymmetric crypto isn't needed today;
  pre-importing a PQC library before any asymmetric
  use case exists creates supply-chain surface area
  without operational benefit. The discipline is to
  import the library when the first asymmetric use
  case lands (Sub-box 7 most likely) AND to document
  the import as the deliberate inflection point per
  this ADR's discipline.

## References

- **ADR-0001** (three-wallet architecture) — `Wallet.
  public_key` field reserved for future signing-keys;
  schema reservation pre-positions DMW activation
  with PQC-readiness optionality.
- **ADR-0003** (frozen-config tamper anchors) —
  `CRYPTO_CONFIG` freeze pattern; explicitly
  anticipates Sub-box 7 `ATTESTATION_ALGORITHM`
  addition. The freeze pattern is COMPATIBLE with
  PQC-or-hybrid primitive selection — extension via
  new constants is the documented pattern.
- **ADR-0004** (service-owned auth gate) — rejects
  cloud-managed asymmetric auth; preserves cryptographic-
  primitive flexibility at the IDP boundary.
- **ADR-0009** (COSMP 7-operation enumeration) —
  patent US 12,517,919 reference; patent claims at
  protocol level (operation semantics) not primitive
  level (specific cryptographic algorithms).
- **ADR-0011** (three-tier test stratification + Gate
  6 reproducibility evidence) — empirical evidence
  base that includes cryptographic-posture
  verification when CI accumulates n.
- **ADR-0016** (Pin-and-Optimize Framework) — companion
  ADR; cryptographic-suite as queued worked example
  category (Gate 8e amendment alongside deployment-
  target worked example). Pin-and-Optimize's dominant-
  axis reasoning applies to cryptographic primitives
  (security-posture axis dominates for PQC primitive
  selection).
- **ADR-0017** (Production Discipline) — companion
  ADR; Principle 1 (convert inference to observation)
  produced the cryptographic-posture audit; Principle
  5 (substrate-honesty as discipline, not
  documentation) required this ADR rather than
  allowing the property to remain emergent.
- **ADR-0018** (Deployment-Target Agnosticism Posture)
  — companion ADR; structural template for posture-
  codification ADRs. ADR-0019 follows the same
  three-component structure (substrate property +
  inherited decisions + maintenance discipline +
  worked examples + decision template).
- Codex cryptographic-posture audit (investigation-
  only; not committed; surfaced empirical evidence
  cited in Context section).
- `444cf56` (ADR-0017 Production Discipline) — the
  discipline this ADR applies.
- `782154c` (ADR-0016 Pin-and-Optimize Framework) —
  the framework this ADR extends to cryptographic-
  suite category.
- `657a794` (ADR-0018 Deployment-Target Agnosticism
  Posture) — companion ADR; ADR-0019 is the parallel
  posture for the cryptographic dimension.
- `3a571fb` (Track A Gate 8b CLAUDE.md update) —
  CLAUDE.md will receive a follow-up amendment after
  ADR-0019 lands to add ADR-0019 to Section 5 list.

Bidirectional citations (cited from):

- Future ADR-0016 amendment will add cryptographic-
  suite as a worked example category (Gate 8e
  carryforward, alongside deployment-target worked
  example).
- CLAUDE.md will receive a follow-up amendment after
  ADR-0019 lands to add ADR-0019 to Section 5 list
  and reference cryptographic-suite discipline in
  Section 7 (Gate 8b-amendment; queued).
- Future Sub-box 7 ADR will cite ADR-0019 as canonical
  reference for `ATTESTATION_ALGORITHM` primitive
  selection — PQC primitive (ML-DSA) or hybrid
  (ES256 + ML-DSA) per this discipline.
- Future DMW signing-keys ADR will cite ADR-0019 as
  canonical reference for signing-key primitive
  selection — schema migration from `Wallet.
  public_key` placeholder strings to actual
  cryptographic public keys must select PQC or hybrid
  primitives.
- Future blockchain integration ADR(s) will cite
  ADR-0019 for PQC-readiness requirements at the
  blockchain-Foundation cryptographic boundary.
- Future long-lived signature use case ADR(s) will
  cite ADR-0019's SLH-DSA preference for multi-
  decade signature verifiability.
- Future Gate 8d cleanup commit (hardcoded algorithm
  literal removal at `createCipheriv("aes-256-gcm",
  ...)`, `createHash("sha256")`, `"sha256:"` prefix
  sites) will cite ADR-0019 as the cleanup
  motivation — restoring crypto-agility from 2/5
  toward 3-4/5 by routing all algorithm choices
  through `CRYPTO_CONFIG`.
- Operator's commercial conversations and procurement
  responses can cite ADR-0019 alongside ADR-0018 as
  substrate evidence of cryptographic-resilience
  posture for due-diligence, RFP, and acquisition
  contexts (especially CNSA 2.0, NSM-10, EU NIS2,
  3PAO assessment, FedRAMP High audit, CMMC Level 5
  contexts).
- ADR-0036 (REGULATOR Principal + Lawful-Basis
  Attestation Pattern; Proposed 2026-05-15; Sub-box 3
  sub-phase 1) — **load-bearing**: ADR-0036
  Sub-decision 5 cites this ADR's SHA-256 cryptographic
  binding posture for the `lawful_basis_chain_hash`
  content-commitment hash + `canonical_record/1`
  AuditEvent.event_hash chain link. The hybrid binding
  (`lawful_basis_id` + `lawful_basis_chain_hash` per
  Q2 LOCKED Option γ) substantively extends this ADR's
  SHA-256 canonical for chain links into regulatory-
  access territory; post-quantum-ready by primitive
  selection canonical preserved at substantive
  register substantively.
- ADR-0071 (Section 7 Cross-Scope Audit Verify-Chain
  Design; design-only ADR landed 2026-05-31) —
  load-bearing: ADR-0071 §3 SAFE projection canonicalizes
  `chain_algorithm = "SHA-256/14-field-canonical-record"`
  as the public chain-algorithm identifier surfaced at the
  verify-chain response register. The identifier names
  this ADR's SHA-256 canonical for AuditEvent chain links
  + ADR-0036's 14-field canonical_record byte-equivalent
  binding (positions 13+14 = lawful_basis_id +
  lawful_basis_chain_hash). ADR-0071 does NOT modify or
  supersede this ADR; the cryptographic-suite posture
  stays canonical.
