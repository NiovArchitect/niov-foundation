# Foundation vs. NIOV Labs Federation Cloud — Terminology Doctrine

**Status:** Canonical terminology doctrine (Founder-authorized, 2026-06-18).
This is a docs-only clarification. It does **not** rename code, Prisma models,
routes, or services, and it does **not** change runtime behavior. Keep Foundation
code names where they represent substrate enforcement; keep existing marketplace
code names already implemented. Marketplace surfaces are clarified here as **early
Federation Cloud surfaces**.

## The two layers — never conflate them

### Foundation — the governed substrate / protocol / operating layer

Foundation is the rails. It owns and enforces:

- DMWs (Decentralized Memory Wallets)
- Memory Capsules
- COSMP (Contextual Orchestration and Scoped Memory Protocol)
- ProofOfAccess
- Entity + Authority Envelope; identity and entity authority
- consent · opt-in · revocation · retention · audit · policy
- high-sensitivity review · data-grant enforcement
- metering substrate · transaction permissioning · future settlement authorization
- safe access delivery · tenant isolation
- personal and enterprise memory governance

Foundation answers: who is this entity? what can it know / do / request / buy /
sell? what memory/data can it access? what requires consent? what requires
review? what proof exists? what retention applies? what was audited? what
transaction is allowed?

### NIOV Labs Federation Cloud — the marketplace/exchange layer powered by Foundation

Federation Cloud is the NIOV Labs marketplace/exchange cloud **on top of**
Foundation — where consumer/user/org **data packages** and **capability
packages** are discovered, requested, priced, metered, purchased, licensed,
routed, governed, and monetized. It is **not** merely a UI marketplace; the
**Marketplace UI is one surface** of Federation Cloud.

Federation Cloud is where third parties go to buy or request **governed access**
to data/capabilities for their DMWs, apps, AI tools, LLMs, AI agents, services,
games, worlds, analytics, personalization, future super-applications, future
microtransaction-driven services, and future AI-agent/device commerce.

## Hierarchy

- **Foundation** = governed infrastructure (the rails).
- **NIOV Labs Federation Cloud** = the governed marketplace/exchange layer running
  on those rails.
- **Otzar** = first-party application / Work OS on top of Foundation.
- Other apps / tools / agents / worlds / services consume Foundation **and**
  Federation Cloud APIs.

## Data doctrine

Users, consumers, and organizations **do not lose ownership** of their data. They
use DMWs and Memory Capsules to grant **governed access rights**. Third parties
buy/request **access rights, not uncontrolled raw data**. Federation Cloud lets
third parties request or buy governed access for their DMWs and systems, while
**Foundation enforces consent, proof, policy, retention, revocation, and audit**.

Federation Cloud maps to concrete Foundation primitives — it is not vague
branding. It uses: DMWs, Memory Capsules, COSMP, ProofOfAccess, consent, grants,
reviews, retention, revocation, audit, metering, and future settlement
authorization. It supports personal and enterprise contexts.

Federation Cloud is intended to support (concrete primitives, not all built yet):
consumer data packages · personal-DMW data packages · enterprise/org data
packages · Memory Capsule packages · safe projections · proof-only access ·
retrieval/query access · aggregate/depersonalized signals · governed capability
packages · pricing / market-rate logic · metering · transaction cuts / revenue
share · future settlement · routing to the right buyers/apps/agents/services ·
audit + proof of what was accessed · buyer/provider access-request lifecycle ·
future reputation / misuse handling · future SDK/API for third-party
apps/LLMs/tools/agents/worlds/services.

## Strategic positioning

Federation Cloud is NIOV's AI-native governed data/capability **exchange** —
discovery, routing, indexing, access, monetization, and transaction flow —
**governed by Foundation** instead of uncontrolled scraping, opaque ad targeting,
or raw data extraction.

## Standing guardrails (do not state otherwise)

- Foundation ≠ Federation Cloud. The marketplace is **not** "only a UI" or "only a
  listing catalog."
- Users are **not** selling uncontrolled raw data.
- **Raw content access remains deferred** (Founder-gated).
- **Real settlement remains deferred** (no real funds / providers / chain signing).
- Cross-org discovery is **provider-opt-in only**.
- Personal DMWs **default private**.
- High-sensitivity data remains **stricter**; **CHILDREN remains denied** unless a
  dedicated future policy program is explicitly authorized.
- Foundation, Federation Cloud, and Oasis are **not** "complete."

## What the shipped marketplace arc actually is

The cross-org marketplace work shipped in the 1301-A / 1302-A / 1303-A arc is the
**first Federation Cloud surface** powered by Foundation:

- **1301-A** (Foundation) — cross-org marketplace **discovery**, gated +
  provider-opt-in; high-sensitivity hard-blocked. (The governed discoverability
  substrate.)
- **1302-A** (CT) — the Marketplace **Discovery Shell**: a read-only catalog
  browser + an honest, non-consummating request-access surface. (One Federation
  Cloud UI surface.)
- **1303-A** (Foundation) — governed per-capsule delivery **hardening**
  (safe-projection / proof-only; content-query inference oracle closed).

These are early surfaces, not the whole of Federation Cloud. Future Federation
Cloud modules (access-request lifecycle, provider approval queue, metering after
grant, pricing/market-rate, transaction-cut ledger, settlement research,
misuse/dispute, reputation, third-party SDK/API, admin/ops console, production
observability) remain to be built and are **not** implied by the shipped arc.

## Federation Cloud is NOT only individual listings — DMW cohorts are a future product class

**Status:** Strategic doctrine (Founder-authorized, 2026-06-18). Forward-looking —
**no cohort mechanics are implemented yet.** This section exists so build sessions
stop treating Federation Cloud as merely a one-listing-at-a-time marketplace. It
adds **naming and future-proofing only**; it is **not** an ADR and introduces no
RULE. Do not implement cohort models, counts, UI, or monetization from this section.

Federation Cloud is the privacy-preserving, AI-native, **Foundation-governed** data /
capability **exchange** for the AI-agent / device / world economy. It is the strategic
problem space that concepts like Google Privacy Sandbox aimed at (useful market/user/
context signals without uncontrolled raw personal-data extraction) — **used only as a
strategic analogy, not a model to copy.** Foundation keeps sovereignty, consent,
proof, retention, revocation, audit, and transaction permissioning; Federation Cloud
packages those governed primitives into exchangeable products.

### Federation Cloud data/capability product classes (future)

1. Individual data packages
2. Enterprise / org data packages
3. Personal DMW data packages
4. Memory Capsule bundles
5. Safe-projection products
6. Proof-only products
7. Retrieval / query products
8. Aggregate signal products
9. Depersonalized signal products
10. **DMW data cohorts** ← a first-class future product class, not just listings
11. Agent / device transaction-data cohorts
12. App / world / game behavior cohorts
13. Market-rate cohort products
14. Metered cohort access
15. Future revenue share / transaction cuts
16. Future settlement (still deferred)

### Definitions (future vocabulary)

- **DMW** — governed memory wallet/container for a person, org, app, agent, device.
- **Memory Capsule** — the atomic governed memory/data unit.
- **Data Package** — a product over one provider's selected DMW/Capsule scopes.
- **Cohort Data Product** — a governed aggregate / depersonalized / signal product
  composed from **many** DMW or Memory Capsule scopes under policy. **Never exposes
  raw individual capsules by default.**
- **Cohort Signal** — the buyer-facing output (aggregate count, trend, distribution,
  score, intent band, context cluster, proof-only result, safe summary).
- **Cohort Membership** — the policy-bound, consent-aware, revocable, sensitivity-aware
  rule deciding whether a DMW/Capsule may contribute.
- **Contribution Accounting** — privacy-safe record of which DMWs contributed (for
  future revenue share, revocation impact, and proof) **without exposing raw
  identities to buyers.**
- **Usage Unit** — the metered thing a buyer consumes (one cohort query, aggregate
  signal, proof, safe projection, personalization result, agent/device action
  authorization, world/app context access, retrieval result, marketplace access event).
- **Foundation Proof** — Foundation proves the buyer was allowed to access the signal
  and (eventually) that the transaction/payment/use was allowed.

### Cohorts must never be a backdoor for raw data

Default cohort rules (design intent — enforce when built, do **not** fake): no raw
Memory Capsule body · no direct identity exposure · no `storage_location` · no
embedding payload · no sensitive `content_hash` · no raw medical/biometric/children
content · no bystander-sensitive leakage · no training/model-improvement unless
explicitly allowed · no redistribution/resale/commercial use unless explicitly allowed
· minimum-cohort-size + sensitivity thresholds eventually enforced · k-anonymity /
small-cell-suppression / differential-privacy-style noise / query-budget concepts are
design targets — **do not claim them if not implemented** · proof + audit required ·
consent / opt-in / revocation enforceable · revenue share must account for contributing
DMWs if monetized. HEALTH stricter; MEDICAL stricter than HEALTH; BIOMETRIC stricter;
**CHILDREN remains denied** unless a dedicated future program is Founder-authorized.

Cohort **access modes** (future vocabulary, safest-first): `COHORT_PROOF_ONLY`,
`COHORT_AGGREGATE_SIGNAL`, `COHORT_DEPERSONALIZED_SIGNAL`, `COHORT_TREND`,
`COHORT_DISTRIBUTION`, `COHORT_SCORE`, `COHORT_RETRIEVAL_QUERY` (strict scoping only),
`COHORT_INTENT_BAND`, `COHORT_CONTEXT_CLUSTER`, `COHORT_MARKET_RATE`,
`COHORT_EVALUATION_SIGNAL`, `COHORT_PERSONALIZATION_SIGNAL`. Raw individual data is
**never** a default mode. Purpose limitation is required (defaults: TRAINING denied,
MODEL_IMPROVEMENT denied, REDISTRIBUTION denied, RESALE denied, COMMERCIAL_USE denied,
RAW_ACCESS denied).

### Microtransaction framing

Anyone can move money. **Foundation proves the transaction was allowed; Federation
Cloud routes, meters, prices, and monetizes the exchange.** Future metered/priced
units include safe-projection reads, proof-only reads, retrieval queries, cohort
signals, aggregate insights, personalization events, LLM-context calls, agent-runtime
access, device transactions, app/world context requests, data-grant usage, and
marketplace requests. Real settlement remains deferred until a Founder-chosen provider.

### Forward phase

**Phase 1305-A: Federation Cloud Cohort Data Product Substrate** (backend-only, not
CT-UI-first) will investigate/design: `CohortDataProduct` / `CohortContribution` /
`CohortAccessGrant` / `CohortUsageLedger` / `CohortProof` (or equivalents),
cohort-access-mode vocabulary, minimum-aggregation thresholds, consent inheritance,
revocation effects, retention/expiry, proof shape, a **mock** economic usage ledger,
buyer request flow, no-leak cohort projections, high-sensitivity cohort denial rules,
personal-DMW opt-in defaults, and AI-agent/device microtransaction hooks. 1305-A must
**not** create fake cohorts/demand, claim differential-privacy/k-anonymity if not
implemented, allow raw data, enable real settlement, or enable training/model-
improvement by default. Until 1305-A lands, cohorts are doctrine only — no cohort
counts, badges, UI, or monetization anywhere.

**Phase 1305-A — LANDED (registry + policy evaluator only).** The backend
substrate now exists: the additive `CohortDataProduct` registry model
(`packages/database/prisma/schema.prisma`) + `CohortProductStatus` enum, the
`FederationCloudCohortService`
(`apps/api/src/services/foundation/federation-cloud-cohort.service.ts`) with a
pure `evaluateCohortPolicy` decision engine + SAFE projection, and the bearer-
gated routes `POST/GET /api/v1/foundation/cohorts`, `GET …/:id`,
`PATCH …/:id/status`, `POST …/:id/evaluate` (`apps/api/src/routes/cohort.routes.ts`).
Audit literals `COHORT_PRODUCT_REGISTERED / _UPDATED / _ARCHIVED /
COHORT_ACCESS_EVALUATED` (additive; no ADR-0002 amendment). Governance is forced
safe (consent/opt-in/proof/revocation/raw_body_excluded true); training /
model-improvement / redistribution / commercial-use default false;
`minimum_cohort_size >= 50`; HIGH_SENSITIVITY → `REVIEW_REQUIRED`; CHILDREN →
`DENIED`; CROSS_ORG discovery is STANDARD-only. **Honesty markers are explicit
and always set:** `threshold_enforced=false` and `signal_available` /
`signal_delivered=false` — there is NO `CohortContribution` table, NO real
contributors, NO real signal delivery, NO real aggregation/privacy math
(k-anonymity / differential privacy NOT implemented), and NO settlement.
`ALLOW_EVALUATION` means "admissible in principle", never "here is a signal".
Still forward-substrate (NOT built): `CohortContribution` / `CohortAccessGrant`
/ `CohortUsageLedger` / `CohortProof`, real aggregation + privacy math, the
buyer request/settlement flow, and any cohort UI / counts / monetization.

**Phase 1306-A — LANDED (`CohortContribution` accounting only).** The internal
contribution-accounting substrate now exists: the `CohortContribution` model +
`CohortContributionStatus` enum + `CohortContributionService` (provider/admin
record/list/revoke) + nested routes under `/api/v1/foundation/cohorts/:id/contributions`.
Contributor identity (`contributor_entity_id` / `contributor_org_entity_id` /
`wallet_id`) is **internal-only — never returned over HTTP**; buyers have no
contribution-facing surface at all. Eligibility honors the linked consent's live
state (a revoked/expired `marketplace_data_consents` row drops the contribution
from the eligible count) per RULE 0. `threshold_enforced` **remains false** — the
`minimum_cohort_size` floor is accounted but not enforced at any delivery point
until 1308-A. Still forward-substrate after 1306-A: `CohortAccessRequest` (1307-A),
proof + safe aggregate signal delivery (1308-A), usage metering + mock economics
(1309-A), contribution-weighted revenue share, and any cohort UI / counts /
monetization. The earlier "NO `CohortContribution` table" sentence above describes
the 1305-A state and is preserved as contemporaneous record.

**Phase 1307-A — LANDED (`CohortAccessRequest` lifecycle; no delivery).** The
governed access-request lifecycle a **buyer** follows BEFORE any signal/proof is
delivered now exists: the `CohortAccessRequest` model + `CohortAccessRequestStatus`
enum + `CohortAccessRequestService` (`create`/`list`/`decide`/`revoke`) + nested
routes under `/api/v1/foundation/cohorts/:id/access-requests`. A buyer requests a
`(use, access_mode)`; CHILDREN cohorts auto-`DENY` at intake; HIGH_SENSITIVITY is
`PENDING` + `requires_review`; everything admissible is `PENDING` — **never
auto-approved**. **Requesting is NOT granting**: an AI buyer
(AI_AGENT/DEVICE/APPLICATION) MAY create a request, but only a **HUMAN** entity may
**decide or revoke** (a restricted AI class is refused `NOT_AUTHORIZED`), and a
buyer can **never** approve its own request (`SELF_APPROVAL_FORBIDDEN`) — RULE 0 +
stop condition #7. An **APPROVED request delivers NO data, NO signal, NO payout**
(`signal_available: false`) — it is permission-to-proceed only; real delivery is
1308-A. `provider_org` / `buyer_org` / `decided_by` are internal-only (never
projected). Still forward-substrate after 1307-A: proof + safe aggregate signal
delivery (1308-A), usage metering + mock economics (1309-A), contribution-weighted
revenue share, and any cohort UI / counts / monetization.
