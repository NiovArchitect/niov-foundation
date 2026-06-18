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
