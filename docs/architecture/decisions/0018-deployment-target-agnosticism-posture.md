# ADR-0018: Deployment-Target Agnosticism Posture

Status: Active
Date: 2026-05-07
Trigger: Codex deployment-posture audit (investigation-
only) following ADR-0017 production discipline
application; substrate-honest finding that Foundation's
4/5 portability rating lacks an ADR codifying the
posture as deliberate

## Context

Foundation's substrate has accumulated a property that
hasn't been documented as a deliberate decision: it can
deploy on any Postgres-compatible target without code
changes. Codex's deployment-posture audit (run before
ADR-0018 drafting; investigation-only; not committed)
established this empirically:

- Zero cloud-vendor SDK imports across `@supabase/*`,
  `@aws-sdk/*`, `@azure/*`, `@google-cloud/*`,
  `@upstash/*`, `firebase-admin` anywhere in `apps/`,
  `packages/`, `scripts/`, `tests/`
- Zero Postgres extension dependencies (no `extensions`
  declaration in `schema.prisma`, no `previewFeatures`
  for postgresExtensions, no `@@extension(...)` on any
  model, zero `CREATE EXTENSION` SQL anywhere)
- Provider-agnostic Prisma datasource (`provider =
  "postgresql"`, not vendor-specific)
- Standard `postgresql://` connection URL via env var
  (`DATABASE_URL` + `DIRECT_URL`)
- Zero Supabase-specific feature usage (no RLS, no
  realtime channels, no auth helpers, no edge functions,
  no `supabase/` directory)
- Service-owned auth gate (ADR-0004) instead of cloud-
  managed auth — `AuthService` is application-layer and
  identity-provider-pluggable
- Containerized Postgres for tests (ADR-0013) instead
  of vendor-locked test substrate
- Zero infrastructure-as-code committed in the repo
  (no Terraform, no CloudFormation, no Pulumi, no
  Kubernetes manifests, no Helm charts) — production
  deployment is customer-side

The agnosticism emerged from many deliberate decisions
(ADR-0001 wallet architecture, ADR-0004 service-owned
auth, ADR-0006 cross-org leak prevention via query-level
filtering, ADR-0013 containerized Postgres, ADR-0016
Pin-and-Optimize Framework's worked examples) plus the
absence of vendor SDK adoption. But no ADR ties the
threads together; the property is currently invisible to
compliance reviewers, government acquisition officers,
and enterprise procurement teams reading the ADR network
one decision at a time. They would see "Supabase
Postgres" documentation comments in CLAUDE.md and
ADR-0010/0011/0013 and conclude vendor lock-in exists.

This ADR codifies the posture as a deliberate
architectural decision. Future Foundation work — and any
AI agent helping with that work — applies the deployment-
target agnosticism discipline. Net effect: COSMP/DMW
commercial reach extends to every customer type with
Postgres-compatible infrastructure availability.

### Why deployment-target lock-in would constrain COSMP/DMW commercial reach

COSMP (Contextual Orchestration and Scoped Memory
Protocol; patent US 12,517,919) and DMW (Decentralized
Memory Wallet; patents US 12,164,537 + US 12,399,904)
are infrastructure-substrate-independent by their patent
claims. The protocols govern how entities cryptographically
own their memory capsules, not where the capsules
physically live. Lock-in to a single managed-Postgres
provider (e.g., Supabase) would constrain commercial
reach in three categorical ways:

- **Sovereign / government customers** require deployment
  in their cloud (FedRAMP-authorized regions, GovCloud,
  Azure Government, on-premise IL5/IL6) where the
  managed-Postgres provider may not exist or where their
  procurement explicitly forbids commercial-cloud
  deployment.
- **Enterprise customers with Microsoft / Google /
  Amazon stack mandates** would reject vendor-lock-in
  evidence in security review even if the chosen vendor
  is acceptable in principle.
- **Customers requiring data-residency guarantees** (EU
  GDPR Article 44 third-country transfer; sovereign
  wealth funds; defense industrial base) require
  deployment within their jurisdiction; the managed-
  Postgres provider's regional availability becomes a
  hard constraint.

Each category is a real customer pipeline NIOV is
positioned to address. Lock-in evidence in the
implementation record forecloses these pipelines before
procurement conversations begin.

### Why the property must be deliberate, not emergent

The agnosticism today is real but invisible. A property
that emerges from many decisions but isn't itself a
documented decision has three failure modes:

- **Drift over time**: future contributors (or AI agents)
  reach for `@supabase/realtime-js` for a real-time
  feature without realizing the agnosticism cost. By
  the time the import lands in a commit, reverting it
  is more work than preventing it would have been.
- **Audit invisibility**: compliance reviewers and
  acquisition officers reading ADRs one at a time see
  "uses Supabase" references and conclude lock-in.
  The agnosticism is a property of the substrate that
  doesn't speak for itself; it must be spoken for.
- **Strategic fragility**: NIOV's commercial reach
  depends on this property; a property without a
  documented owner is a property at risk.

Documenting the posture as deliberate converts the
agnosticism from an emergent fact to a maintained
discipline. The maintenance discipline (component 3
below) is the artifact this ADR creates beyond
descriptive documentation.

### Why the framework must accommodate future deployment-target categories without committing to specifics

NIOV's roadmap includes blockchain-substrate integration
(per the operator's stated direction). The specific
blockchain architecture has not been designed yet.
Premature commitment in this ADR to a specific
blockchain pattern (capsule cryptographic anchoring vs.
DMW signing-keys via blockchain identity vs. full
storage-substrate replacement vs. smart-contract-
enforced protocol semantics) would either lock in the
wrong design or require this ADR's amendment when
real design work surfaces tensions.

The framework reserves the blockchain category as a
deployment-target slot without committing to specifics.
Future blockchain ADR(s) extend or amend ADR-0018
rather than rewrite it. Same pattern applies to other
categorically-different future targets: edge compute
(WASM at edge nodes), serverless (compute-storage
separation), confidential compute (TEE-based
attestation). The framework is open to additions
without forcing premature design commitment.

### The patent-holder implementation-record dimension

Every commit on `origin/main` is contemporaneous evidence
of original implementation by the patent holder. The
deployment-target agnosticism property is itself
substrate evidence audit reviewers and acquisition
officers evaluate as part of their due-diligence work.
A documented agnosticism posture (this ADR) is concrete
evidence; an emergent agnosticism property is not.
Codifying the posture today, while the codebase still
demonstrably has the property, produces the strongest
possible implementation record.

## Decision

The Deployment-Target Agnosticism Posture has three
components.

### 1. Substrate is portable across all Postgres-compatible deployment targets

Foundation deploys on any target that meets four
constraints:

- Provides Postgres-compatible SQL semantics
  (Postgres 16 major version per ADR-0013)
- Accepts standard `postgresql://` connection URLs
  via `DATABASE_URL` + `DIRECT_URL` env vars
- Accepts the Postgres roles/permissions model
  Foundation uses (no cloud-specific role hierarchy
  assumed)
- Provides connection-pool semantics compatible with
  Prisma's pgbouncer-aware default

**Currently-supported deployment-target categories:**

**(a) Managed cloud Postgres** (commercial). Examples:
Supabase, AWS RDS for PostgreSQL, Azure Database for
PostgreSQL, Google Cloud SQL for PostgreSQL, Aurora
(Postgres-compatible mode), Neon, AlloyDB, Crunchy Bridge,
Render Postgres, Heroku Postgres, Fly.io Postgres. Any
of these works as a Foundation deployment target without
code changes — only the `DATABASE_URL` env var changes.

**(b) Sovereign / government cloud.** Examples: AWS
GovCloud RDS, Azure Government, Azure GovCloud Secret
(IL6), Google Cloud Government (BeyondCorp Enterprise +
managed Postgres), dedicated regional clouds (e.g.,
Oracle Government Cloud, IBM Cloud for Government,
SAP Sovereign Cloud). FedRAMP-authorized configurations
of any of the (a) providers count toward this category
when the customer's procurement requires authorized
boundaries.

**(c) On-premise / air-gapped.** Examples: bare-metal
Postgres 16+ on customer-managed infrastructure;
Postgres on customer-managed Kubernetes; Postgres in
classified environments (DoD CC SRG IL5, IL6); sovereign-
data-residency installations within customer-controlled
jurisdiction (e.g., banks with on-premise-only policies;
hospitals with HIPAA-locality requirements; sovereign
wealth funds; defense industrial base contractors).

**(d) Reserved-for-future: blockchain substrates.** Per
NIOV roadmap, COSMP/DMW protocol may extend to
decentralized substrates. Possible patterns include
capsule cryptographic anchoring (audit-trail anchor
without changing deployment substrate), DMW signing-keys
via blockchain identity (auth integration replacing or
augmenting ADR-0004), capsule storage decentralized
across blockchain nodes (full substrate replacement),
or smart-contract-enforced COSMP protocol semantics
(protocol enforcement layer above substrate). The
framework preserves optionality without committing to
specific blockchain architecture. Trigger for this
category's specification: concrete blockchain integration
design landing in NIOV's roadmap as a separate ADR or
Section.

### 2. Architectural decisions that produce the agnosticism

The posture emerges from a deliberate set of inherited
decisions. Each contributes a portability-preserving
property:

- **ADR-0001** (three-wallet architecture): wallet
  abstraction is database-agnostic; all wallet operations
  go through Prisma queries against generic Postgres.
- **ADR-0004** (service-owned auth gate pattern):
  rejects cloud-managed auth; AuthService is application-
  layer and identity-provider-pluggable. Customer
  deployments swap IDP integrations (Supabase Auth, AWS
  Cognito, Azure AD, Okta, on-prem LDAP) without
  changing application code.
- **ADR-0006** (cross-org leak prevention via filter
  narrowing): query-level filtering instead of database-
  level RLS; portable across Postgres providers without
  RLS policy migrations. Postgres providers vary in RLS
  feature parity; query-level filtering is universal.
- **ADR-0013** (containerized Postgres for tests):
  `postgres:16.4-alpine` matches managed-Postgres-16
  major semantics; test substrate not vendor-locked.
  Same code that passes tests against the containerized
  Postgres passes against any Postgres 16+ deployment.
- **ADR-0016** (Pin-and-Optimize Framework): substrate
  pinning discipline includes deployment-target as a
  worked example category (queued amendment per
  bidirectional citation; Gate 8e carryforward).
- **Absence of vendor SDK adoption**: deliberate
  non-decision. Foundation never imported `@supabase/*`,
  `@aws-sdk/*`, `@azure/*`, `@google-cloud/*`,
  `firebase-admin`, or `@upstash/*`. Codex's audit
  verified zero matches across all directories.
- **Absence of Postgres extension dependencies**:
  deliberate non-decision. Foundation uses ANSI SQL +
  Prisma's standard surface only. Common extensions
  (uuid-ossp, pgcrypto, pgvector) are widely available
  across vendors but Foundation doesn't require any of
  them.

### 3. Maintenance discipline that preserves agnosticism

The agnosticism is a maintained property, not a static
fact. Specific disciplines preserve it:

**No vendor SDK adoption without explicit ADR.** Before
importing `@supabase/*`, `@aws-sdk/*`, `@azure/*`, etc.,
produce an ADR documenting:
- Why agnosticism is being relaxed (what feature
  requires the SDK)
- What abstraction layer keeps application code
  vendor-portable even if a specific service uses the
  SDK (e.g., a `ContentStore` interface with multiple
  implementations behind it; the canonical example is
  `apps/api/src/content-store.ts:14`)
- What re-evaluation triggers exist for the relaxation
  (e.g., when the abstraction's overhead becomes
  acceptable)

**No Postgres extension adoption without explicit ADR.**
Same pattern; extensions are portability blockers and
require deliberate decision. If Foundation needs (e.g.)
pgvector for embeddings, the ADR documents which
deployment-target categories still work post-adoption
and which don't.

**No vendor-specific feature usage without abstraction.**
If Foundation needs (e.g.) realtime / row-level security
/ managed auth, the application code uses an abstraction
layer; the vendor implementation is one swappable
concrete behind the abstraction. The current example
template is `ContentStore` (abstract interface in
`content-store.ts`; `MemoryContentStore` is the in-memory
impl; `SupabaseContentStore` is named in comments as a
future swap-in). Future features follow the same pattern.

**Deployment-target choice is the customer's, not
NIOV's.** Foundation does not pre-commit to a particular
customer's cloud; the customer's environment provides
the `DATABASE_URL` and Foundation deploys. The operator's
own deployment (currently Supabase) is one customer
deployment among many possible deployments.

#### When discipline relaxation IS appropriate

The discipline is not absolute. Specific cases where
relaxation is acceptable, with their relaxation
rationales:

- **Performance-critical hot paths where abstraction has
  unacceptable overhead.** If a vendor-specific feature
  is the only viable path to required performance (e.g.,
  vendor-managed materialized views with sub-millisecond
  query latency), the relaxation lands as an ADR
  documenting (a) why abstraction was insufficient,
  (b) what alternative deployment-target categories
  remain after relaxation, (c) what abstraction layer
  contains the relaxation so application code remains
  portable.
- **Operator-side operational tooling that doesn't run in
  production.** Maintenance scripts, monitoring
  dashboards, log shippers — these can use vendor SDKs
  freely without affecting Foundation's deployment-
  target agnosticism, because they don't run inside
  the Foundation runtime. The boundary is "what runs
  in `apps/api/src/` at customer deployment time" —
  outside that boundary, operator-side tooling isn't
  part of the substrate.
- **Customer-specific deployment configuration.** Customer
  deployments may include vendor-specific IaC (Terraform
  for AWS RDS, ARM templates for Azure, Kubernetes
  manifests for on-premise) — this is customer-side
  work, not Foundation substrate. Foundation provides
  the agnostic application code; customers provide
  their environment's IaC.

The discipline applies to Foundation's substrate
(`apps/`, `packages/`, `tests/`, runtime config that
ships in the application). It does not apply to operator-
side tooling, customer-side IaC, or non-runtime
artifacts.

## Worked Examples

### Supabase (current operator deployment)

- **Status**: ACTIVE. Operator's own production
  deployment uses Supabase as the managed-Postgres
  provider. Stub Supabase env vars exist in `.env.test`
  (`SUPABASE_URL`, `SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_KEY`) but no runtime code reads
  them — they're test stubs preserved from earlier
  exploratory work and don't constitute coupling.
- **Posture**: agnosticism preserved. No Supabase-
  specific code; only `DATABASE_URL` pointing at
  Supabase endpoint. Codex's audit verified this
  empirically.
- **Trade-off**: Supabase-managed convenience (managed
  Postgres, automatic backups, point-in-time recovery,
  managed Postgres extensions when needed) for
  operator's deployment; same code runs anywhere else
  without modification.
- **Re-evaluation triggers**: Supabase pricing changes,
  Supabase outage patterns, customer requirement to
  deploy on different target, Supabase feature
  divergence from generic Postgres semantics.

### AWS GovCloud RDS for PostgreSQL (queued capability)

- **Status**: QUEUED. Would deploy when first DoD /
  federal civilian customer requires FedRAMP High /
  IL5 environment.
- **Posture**: code unchanged; `DATABASE_URL` points at
  GovCloud RDS endpoint. Encryption at rest is GovCloud
  KMS instead of operator's cloud KMS; encryption is
  RDS-managed, not application-layer.
- **Customer types unblocked**: federal civilian agencies
  (DOJ, DOI, GSA, etc.), DoD components (Army, Navy,
  Air Force, Space Force, USMC), intelligence community
  (NGA, NSA, DIA in IL5 contexts), federal contractors
  with FedRAMP-authorized prime requirements.
- **Outstanding work for first GovCloud deployment**:
  reference Terraform for GovCloud RDS provisioning;
  KMS integration documentation; FedRAMP audit-trail
  requirements crosswalk against ADR-0011's audit chain;
  documentation that compliance reviewers can hand to
  3PAO assessors during ATO process.

### Azure Database for PostgreSQL (queued capability)

- **Status**: QUEUED. Would deploy when first
  enterprise / government customer requires Microsoft-
  shop preference.
- **Posture**: code unchanged; same as GovCloud RDS
  pattern with Azure-specific KMS / Active Directory
  integration. Azure AD for IDP integration may
  require swap of `AuthService`'s identity provider
  (per ADR-0004's IDP-pluggable design); the swap is
  application-config, not application-code.
- **Customer types unblocked**: enterprise customers
  with Microsoft licensing agreements (typical Fortune
  500 IT shop preference); Azure Government customers
  with FedRAMP / DoD IL2-IL4 environments; healthcare
  customers leveraging Azure HIPAA-eligible services.
- **Outstanding work**: reference Terraform for Azure
  Database for PostgreSQL provisioning; Azure AD
  integration for SAML/OIDC if required; Azure
  Monitor / Application Insights crosswalk against
  ADR-0011's structured logging substrate.

### On-premise Postgres 16+ (queued capability)

- **Status**: QUEUED. Would deploy when first
  air-gapped / classified / sovereign-data-residency
  customer requires it.
- **Posture**: code unchanged; `DATABASE_URL` points at
  customer-managed Postgres. Customer's own KMS / IDP /
  monitoring stack integrates via the agnostic
  abstractions Foundation already provides.
- **Customer types unblocked**: classified DoD
  environments (IL6 air-gapped, where commercial-cloud
  deployment is forbidden), banks with on-premise
  policies, hospitals with HIPAA-on-premise requirements,
  sovereign wealth funds with data residency mandates,
  pharmaceutical R&D environments under IP-protection
  isolation, defense industrial base contractors with
  CMMC Level 5 requirements.
- **Outstanding work**: deployment runbook for air-
  gapped install; offline npm registry mirror (npm-mirror
  or Nexus); offline container registry (Harbor,
  Quay-ng); documented compliance posture for FedRAMP-
  equivalent on-premise audit; offline Anthropic API
  alternative (when LLM provider is required and
  internet egress is forbidden — per ADR-0014's
  fixture-replay pattern, offline operation IS already
  supported via FixtureBasedLLMProvider).

### Reserved: Blockchain substrates (future)

- **Status**: RESERVED. Framework preserves optionality
  without committing to specific blockchain architecture.
- **Posture (anticipated)**: significant design work
  pending; possible patterns include:
  - **Capsule cryptographic-proof anchoring** — audit-
    trail anchor; doesn't change deployment substrate
    materially (anchor proofs land in blockchain;
    capsules continue to live in Postgres)
  - **DMW signing-keys via blockchain identity** — auth
    integration; replaces or augments ADR-0004's
    service-owned auth gate with blockchain-issued
    signing keys
  - **Capsule storage decentralized across blockchain
    nodes** — full substrate replacement; would require
    Foundation to abstract its query layer behind a
    capsule-store interface that has both Postgres and
    blockchain implementations
  - **Smart-contract-enforced COSMP protocol semantics**
    — protocol enforcement layer; sits above substrate;
    Postgres deployment continues but COSMP protocol
    rules are also enforced via smart-contract checkpoints
- **Re-evaluation trigger**: concrete blockchain
  integration design landing in NIOV's roadmap as a
  separate ADR or Section.
- **Substrate-honest acknowledgment**: ADR-0018 does
  not commit to specifics here because specifics
  haven't been designed yet. Future blockchain ADR(s)
  amend or extend this ADR rather than rewrite it.

## Decision Template for Future Deployment-Target Decisions

When a new deployment-target requirement arises (customer
needs a target NIOV hasn't yet supported), the work
follows this five-step template:

1. **Identify the target's category**: managed cloud
   Postgres / sovereign cloud / on-premise / blockchain /
   other (case-by-case for niche or custom targets).
2. **Verify Postgres-compatibility constraints**:
   Postgres 16+ semantics, `postgresql://` connection,
   role/permission model, pgbouncer-aware connection
   pool.
3. **Identify deployment-target-specific work** (typically
   non-code): IaC templates, KMS integration, IDP
   integration, audit-trail crosswalk, monitoring
   integration, deployment runbook.
4. **Verify the agnosticism still holds**: zero new
   vendor SDK imports, zero new Postgres extensions,
   zero new vendor-specific feature usage. If agnosticism
   would be relaxed, follow component 3's discipline
   (ADR documenting the relaxation).
5. **Document the deployment** as a worked example in
   ADR-0018 (this ADR amended) or in a customer-specific
   deployment ADR.

Steps 1-4 produce zero application-code changes if the
agnosticism is preserved. Step 5 produces an ADR
amendment or new ADR documenting the deployment for
future reference.

This template is canonical. The five-question template
from ADR-0016 applies to pinning decisions; the nine-step
template from ADR-0017 applies to drift investigations;
this five-step template applies to deployment-target
decisions. Together the three templates constitute
Foundation's substrate-discipline operational toolkit.

## Consequences

### Easier

- COSMP/DMW commercial reach extends across all
  Postgres-compatible deployment-target categories —
  managed cloud, sovereign/government cloud, on-premise/
  air-gapped, plus reserved future blockchain category.
- Compliance reviewers see deliberate-architectural-
  decision documentation rather than accidental
  property; agnosticism is no longer invisible to ADR-
  by-ADR review.
- Patent-holder implementation record gains documented
  portability discipline — substrate evidence for
  enterprise/government audit cycles, due-diligence
  conversations, and 3PAO assessments.
- New customer onboarding to a new deployment target is
  non-code work (IaC + integration + runbook) rather
  than application-code modification; per-customer
  engineering effort scales with environment-specific
  setup, not Foundation's substrate.
- Foundation can deploy on customer-required
  infrastructure rather than NIOV-mandated infrastructure;
  reverses the typical SaaS lock-in where the vendor
  dictates the customer's stack.
- Government acquisition officers see explicit
  GovCloud / IL5 / IL6 / on-premise / air-gapped
  pathway; substrate documentation that procurement
  shops can evaluate without technical pre-engagement.
- Investor due diligence on substrate quality answered
  with deployable evidence — pointing at this ADR
  documents commercial-reach optionality.
- Future blockchain integration has framework optionality
  preserved; specific blockchain architecture work
  doesn't require this ADR's rewrite.
- The discipline integrates with ADR-0016 + ADR-0017
  as the third leg of substrate-discipline canonical
  references covering the substrate-quality lifecycle:
  what-to-pin (0016) + how-to-investigate (0017) +
  where-to-deploy (0018).
- Audit-readability for the ADR network is structurally
  preserved — every deployment-target decision lands
  as an ADR amendment to 0018 rather than as scattered
  per-customer commits.

### Harder

- Discipline maintenance — every new feature must be
  evaluated for agnosticism preservation. Adding a
  search feature, a real-time feature, a managed-auth
  integration, or a vector-search feature each requires
  pre-flight assessment: is there a vendor-agnostic
  path? if not, what's the abstraction? what's the ADR?
- Vendor SDK adoption requires explicit ADR overhead
  even when convenience is high. The convenience cost
  of "we'll just use the Supabase realtime SDK" is
  immediate; the ADR-overhead cost is real but bounded.
  Discipline trades the local convenience for the
  systemic property.
- Performance trade-offs — some vendor-specific
  features would be faster (vendor-managed materialized
  views, vendor-managed search indexes, vendor-managed
  realtime). The agnosticism trades performance for
  portability. Customers who care more about
  performance than portability may find Foundation's
  substrate slower than a vendor-locked alternative.
- Customer-side deployment work — Foundation provides
  agnostic substrate; each customer deployment requires
  their cloud's IaC / KMS / IDP integration as
  customer-side work. Customers expecting "drop-in
  install on our infrastructure" need to understand
  the bring-your-own-IaC model.
- IaC reference templates don't currently exist
  (separate work; not in this ADR scope). First customer
  deployment in each category (GovCloud, Azure, on-prem)
  produces reference IaC that subsequent customers in
  the same category can fork.
- The framework is a discipline, not automation —
  someone (operator or automated tooling that doesn't
  exist yet) must enforce it across PRs and ADRs. Without
  enforcement, the discipline drifts; the strongest
  enforcement today is operator review in the three-
  approvals discipline (ADR-0017 Principle 6).
- Edge cases requiring vendor-specific features
  (managed auth / row-level security / realtime / vector
  search) require abstraction-layer design with overhead.
  Each abstraction layer is itself substrate that must
  be maintained.
- Blockchain category is reserved without specifics —
  future blockchain work may surface tensions the
  framework doesn't yet anticipate. The reservation is
  intentional optionality but doesn't eliminate design
  cost.
- Documented deployment-target categories don't cover
  every possible customer requirement (e.g., a customer
  on a niche cloud or a custom Postgres fork) — the
  template handles them but case-by-case work remains.
- Substrate-honest acknowledgment of operator's actual
  Supabase deployment may surprise reviewers expecting
  cloud-agnostic posture to mean "no specific deployment
  exists." The ADR distinguishes operator's deployment
  (one customer's choice) from substrate's deployable
  surface (the agnostic property) — readers must hold
  the distinction.
- ADR-0018 itself becomes substrate that requires
  maintenance as deployment-target categories accumulate
  worked examples. The maintenance load is bounded but
  real.

## Alternatives Considered

- **Pre-commit to a single deployment target (e.g.,
  "Foundation only deploys on Supabase")**: rejected.
  Constrains COSMP/DMW commercial reach unacceptably
  — eliminates federal/government, on-premise/air-gapped,
  and Microsoft-/Google-stack-mandated customer
  categories from NIOV's pipeline before procurement
  conversations begin. The patent claims are infrastructure-
  substrate-independent; pre-committing to single
  infrastructure would forfeit a strategic property of
  the underlying IP.

- **Adopt vendor SDKs for convenience and document
  porting requirements as future work**: rejected.
  Agnosticism is easier to preserve than to recover.
  Reverting an `@supabase/*` import after it has
  spread through several services is significantly
  harder than preventing the import in the first place.
  The discipline is preventive, not curative.

- **Build deployment-specific forks per customer**:
  rejected. Multiplies maintenance burden by N
  customer deployments. The point of the agnostic
  substrate is that one codebase serves all
  deployment-target categories without forks; per-
  customer customization happens in deployment-side
  IaC + integration, not in application code.

- **Document the de-facto agnosticism without codifying
  the discipline**: rejected. Emergence without
  discipline drifts. Today's audit was possible because
  no vendor SDK had been adopted, but future temptation
  is high without explicit discipline. A documented
  property without a maintenance discipline is a
  property at risk.

- **Commit to specific blockchain architecture today**:
  rejected. Specifics haven't been designed; framework
  preserves optionality. Premature commitment would
  either lock in the wrong design or require this ADR's
  amendment when real design work surfaces tensions.
  The reserved-for-future framing is honest about the
  current state while preserving the deployment-target-
  category slot for future blockchain work.

- **Use a centralized deployment-target manifest (e.g.,
  `deployment-targets.yaml`)**: rejected as a substitute
  for ADR-0018. A central manifest is useful as
  operational tooling but doesn't replace per-target
  reasoning. Each target deployment still needs ADR-
  level documentation. A future `deployment-targets.yaml`
  may be operational tooling on top of the framework,
  not a replacement.

## References

- **ADR-0001** (three-wallet architecture) — wallet
  abstraction is database-agnostic by design; first-
  inheritance contributor to the agnosticism property.
- **ADR-0004** (service-owned auth gate pattern) —
  rejects cloud-managed auth; preserves IDP portability
  via application-layer `AuthService` with pluggable
  identity providers.
- **ADR-0006** (cross-org leak prevention via filter
  narrowing) — query-level filtering instead of
  database-level RLS; portable across Postgres providers
  without RLS policy migrations.
- **ADR-0013** (containerized Postgres for tests) —
  `postgres:16.4-alpine` matches managed-Postgres-16
  major semantics; test substrate vendor-agnostic;
  same code that passes tests passes against any
  Postgres 16+ deployment.
- **ADR-0010** ("Real Supabase" tail-latency context)
  — Supabase as operator's deployment target; provides
  the latency-evidence baseline ADR-0011 amendment
  references.
- **ADR-0011** (three-tier test stratification + Gate 6
  reproducibility evidence) — empirical evidence
  produced under operator's Supabase deployment;
  variance bounds extend to other Postgres providers
  with similar latency characteristics; CI accumulation
  refines bounds at scale per the amendment.
- **ADR-0016** (Pin-and-Optimize Framework) — companion
  ADR; deployment-target as a queued worked example
  category (Gate 8e amendment); the dominant-axis
  reasoning Pin-and-Optimize codifies applies to
  deployment-target decisions when relaxation is
  considered.
- **ADR-0017** (Production Discipline) — companion ADR;
  Principle 1 (convert inference to observation
  before fixing) produced the deployment-posture audit
  that informed this ADR; Principle 5 (substrate-
  honesty as discipline, not documentation) required
  this ADR rather than allowing the property to remain
  emergent. ADR-0018 is itself an application of
  Principle 5 to a strategic architectural question.
- Codex deployment-posture audit (investigation-only;
  not committed; surfaced empirical evidence cited in
  Context section).
- `444cf56` (ADR-0017) — the discipline this ADR
  applies.
- `782154c` (ADR-0016) — the framework this ADR
  extends to deployment-target category.
- `3a571fb` (Track A Gate 8b — CLAUDE.md update) — the
  most recent commit before this ADR; CLAUDE.md
  Section 5 will receive an amendment after ADR-0018
  lands to add ADR-0018 to the list and reframe
  Section 1's tech stack reference.

Bidirectional citations (cited from):

- Future ADR-0016 amendment will add deployment-target
  as a worked example category (Gate 8e carryforward;
  Anthropic SDK / Prisma / vitest / capsule schema
  worked examples currently cover other resource
  categories, but deployment-target deserves its own
  worked example given ADR-0018's framing).
- CLAUDE.md will receive a follow-up amendment after
  ADR-0018 lands to update Section 1 tech stack
  framing and add ADR-0018 to Section 5 list (Gate 8b
  amendment; queued).
- Future deployment-target additions (first GovCloud
  customer, first Azure customer, first on-premise
  customer, future blockchain integration) will cite
  ADR-0018 as their canonical reference and amend its
  worked-examples section.
- Future blockchain ADR(s) will cite ADR-0018's
  reserved-for-future framing and amend the worked
  examples to formalize the blockchain category's
  specifics.
- Operator's commercial conversations and procurement
  responses can cite ADR-0018 directly as substrate
  evidence of cloud-agnostic posture for due-diligence,
  RFP, and acquisition contexts.
- **ADR-0019** (Cryptographic-Suite Posture; forthcoming)
  — covers a parallel agnosticism concern: the
  cryptographic primitives underlying capsule
  signatures, DMW signing keys, and audit-trail
  integrity. Where ADR-0018 documents deployment-
  target portability (which Postgres-compatible
  infrastructure can host Foundation), ADR-0019 will
  document cryptographic-suite portability (which
  cryptographic algorithms Foundation depends on,
  crypto-agility for algorithm migration, post-quantum
  readiness posture per NIST PQC standards FIPS 203 /
  204 / 205, and hedging strategy against
  "harvest now, decrypt later" attacks). Together
  ADR-0018 + ADR-0019 cover the two substrate-
  portability dimensions enterprise/government
  customers evaluate during procurement: can it deploy
  on our infrastructure, and will its cryptographic
  guarantees survive into the post-quantum era.
