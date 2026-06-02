# ADR-0093 — Billing/Entitlements Completion Doctrine (Design-Only)

**Status:** Accepted 2026-06-02

**Authorization:** `[FOUNDER-AUTH — W5 + LIVING ENTERPRISE INTELLIGENCE AUTONOMOUS BUILD]` per RULE 20.

## Context

LEI sequence Step 9 per Founder direction:

> "B4 entitlement/seat ledger is complete. But billing is not complete."
> "Missing: subscription lifecycle; org plan lifecycle; seat upgrades; seat downgrades; usage metering; invoices; enterprise contracts; plan enforcement at capability boundary; connector pack entitlements; voice usage entitlements; AI teammate/twin entitlements; Hive entitlements; premium audit/compliance entitlements."
> "Doctrine: Billing says what the organization purchased. Governance says what the system may safely do. Customers should not pay extra just to have memory be safe. Baseline DMW/memory safety must be included or priced in."
> "Do not choose Stripe/Coinbase/Circle/payment provider without Founder decision."
> "Next billing work should complete internal billing lifecycle/usage substrate first, no live provider."

### Substrate-honest pre-flight (RULE 13)

B1-B4 substrate state 2026-06-02:

- **B1 LIVE** — ADR-0083 base + Amendment 1 (Accepted 2026-06-01) canonical doctrine. $250 base + Standard/Professional/Executive/Admin seat tiers + 9 capability packs + 16 usage meters + Enterprise tier. 10 non-negotiable billing governance postures locked.
- **B2 LIVE** — Static entitlement catalog at `docs/entitlement-catalog/`. 4 plans (Starter-Pilot $250 + Team + Business + Enterprise) + 6 seat tiers ($25-$300/mo) + 9 capability packs + 8 connector pack families + 16 usage meters + 18 governance rules + 13 non-paywallable safety rules + 5 downgrade policies + 13 enterprise add-ons. Validator green.
- **B3 LIVE** — CT Billing Preview at `/billing`. 12 panels (read-only). No runtime billing. No payment provider. No entitlement enforcement. No feature gating. No customer subscription mutation.
- **B4 LANDED design substrate** — Internal entitlement/seat ledger at `docs/entitlement-ledger/`. 4 seed ledgers (one per plan archetype) + 8 conceptual entitlement objects (BillingAccount + Plan + SeatEntitlement + CapabilityPackEntitlement + FeatureEntitlement + UsageMeter + EntitlementCheck + DowngradePolicy). Validator enforces cross-B2 catalog references. **Runtime state: DESIGN_SUBSTRATE_ONLY.**

LIVE monetization substrate (Section 12C.0 per ADR-0021 + ADR-0026 §Operation A):

- `MonetizationEvent` (per-capsule-access revenue split ledger; 70/30 fee/holder split)
- `MonetizationConfig` (global config; dual-control-gated update per ADR-0026)
- `MonetizationSuggestion` (Section 10 Loop 6 recommendations)
- `WalletBalance` (per-entity balance ledger)
- `monetization.service.ts` (260 lines; triggers events AFTER user response per zero-latency guarantee; retries up to 10)
- 3 wallet routes (`GET /api/v1/wallet/balance`, `GET /api/v1/wallet/history`, `PATCH /api/v1/wallet/monetization/toggle`) + 1 platform route (`PATCH /api/v1/platform/monetization/config` dual-control-gated)

**The gap ADR-0093 closes:** B5-B8 are queued. Each requires per-slice Founder authorization. The Founder direction explicitly defers payment provider (B7) and prioritizes "internal billing lifecycle/usage substrate first, no live provider." ADR-0093 names the candidate slices that fit that window (B5 entitlement check + B5 seat lifecycle + B6 usage meter foundation) WITHOUT pre-empting Founder pricing decisions (per-seat / per-pack USD).

### The 13 Founder-named missing capabilities mapped to LIVE / FORWARD-SUBSTRATE

| Gap | LIVE substrate | Forward-substrate slice |
|---|---|---|
| subscription lifecycle | — | B5 Subscription model + renewal/cancellation state machine |
| org plan lifecycle | B2 static PlanTemplate catalog | B5 runtime Plan instance per org + upgrade/downgrade workflows |
| seat upgrades | B4 ledger design only | B5 SeatEntitlement runtime + tier mutations + audit emissions |
| seat downgrades | B4 ledger design only | B5 + B8 downgrade policy enforcement (preserve audit chain per ADR-0083 §1 ban 4) |
| usage metering | MonetizationEvent (capsule-access only) | B6 multi-meter substrate (16 meter types per B2 catalog) |
| invoices | — | B7 payment provider integration (Founder-gated) |
| enterprise contracts | B1 doctrine ($custom) | B8 contract template + SLA tracking |
| plan enforcement at capability boundary | — | B5 EntitlementCheck service + policy evaluator coordination |
| connector pack entitlements | B2 catalog (8 families) | B5 CapabilityPackEntitlement for connector activation gates per ADR-0083 §9.9 stage 2 |
| voice usage entitlements | B2 catalog candidate | B6 usage meter + B5 entitlement check at INVOKE_CONNECTOR / voice provider boundary |
| AI teammate/twin entitlements | B1 seat tiers (Standard/Professional/Executive/Admin) | B5 seat tier activation per ADR-0080 TwinTemplate scope envelope |
| Hive entitlements | B1 doctrine (Section 3 team scale → packs) | B5 + departmental/team mapping to seat/pack entitlements |
| premium audit/compliance entitlements | B2 "Advanced Audit/Compliance Pack" | B5 CapabilityPackEntitlement for org/platform verify-chain unlock + B6 export volume metering |

## Decision

### 1. Billing Completion is a CAPABILITY-GATE LAYER atop the LIVE B1-B4 design substrate

Billing Completion is NOT a wholesale Section 8 rebuild. B1 doctrine + B2 static catalog + B3 CT preview + B4 entitlement ledger design substrate stay canonical. Billing Completion ADDS the runtime capability-gate layer that enforces what was already designed.

Same substrate-honest framing pattern as ADR-0091 §6 (BEAM expansion) + ADR-0092 §5 (DMW Runtime expansion): existing substrate stays canonical; expansion ADDS the runtime register.

### 2. The 4 canonical doctrine lines (Founder direction; preserved verbatim across every B-slice)

Per Founder direction these 4 lines are canonical for every future B5-B8 slice + every customer-facing surface + every operator-facing surface:

- **"Billing says what the organization purchased."**
- **"Governance says what the system may safely do."**
- **"Customers should not pay extra just to have memory be safe."**
- **"Baseline DMW/memory safety must be included or priced in."**

These lines extend the 8 canonical billing doctrine lines preserved verbatim in ADR-0083 §1 Amendment 1.

### 3. The 10 non-negotiable billing governance postures (ADR-0083 §1 Amendment 1 preserved)

Per ADR-0083 §1 the 10 governance postures stay canonical for every B5-B8 slice:

1. Entitlements gate features, NOT audit/evidence
2. Billing NEVER destroys audit or evidence
3. Non-payment disables NEW premium actions, NEVER deletes retained records
4. Downgrades preserve historical audit
5. Security/governance features NEVER unsafe-paywalled
6. Compliance retention always intact
7. DMW auto-provisioning always at base tier
8. Same-org boundary + cross-tenant isolation NEVER weakened
9. Regulator-ready posture preserved per ADR-0070
10. Audit chain integrity verification at base tier

### 4. NO payment provider in this slice or any subsequent slice WITHOUT explicit Founder decision

Per Founder direction *"Do not choose Stripe/Coinbase/Circle/payment provider without Founder decision."* B7 (payment provider integration) is explicitly Founder-decision-gated and requires:

1. Separate Founder authorization
2. RULE 21 vendor research arc per candidate provider (Stripe + Chargebee + Paddle + Circle + Stripe Connect + Coinbase Commerce + custom enterprise invoicing)
3. ADR with vendor research findings embedded
4. PCI / regulatory compliance review per ADR-0070 regulator-ready posture
5. Per-tenant rollout cadence (canary first; multi-tenant GA after)

V1 substrate B5-B6 work canonical per this ADR is **internal billing lifecycle / usage substrate WITHOUT a live provider**.

### 5. The 3 candidate slices that fit the "no live provider" Founder window

ADR-0093 enumerates 3 candidate slices; Founder picks at per-slice authorization. Each candidate fits the "internal billing lifecycle / usage substrate first, no live provider" window per Founder direction.

**Candidate A: B5-α Entitlement Check Runtime**

- Scope: NEW `Entitlement` Prisma model + `EntitlementCheckService.assertEntitled(callerEntityId, capability_name)` service-tier helper.
- Substrate: per-org runtime Entitlement instance (seeded from B4 ledger design substrate); per-call check returns `403 ENTITLEMENT_INSUFFICIENT` (not generic FORBIDDEN) when caller's seat tier or capability pack does not cover the requested capability.
- Wiring: at the policy evaluator boundary in `auth → clearance → entitlement → permission → policy` order per RULE 5 precedence.
- Composes against: Section 4 connector activation (CapabilityPackEntitlement check at binding-create-time + INVOKE_CONNECTOR boundary) + Dandelion Activation Pack (D2-D8 stages per ADR-0082) + Workflow Stage 3+ (ADR-0081).
- 1 NEW audit literal candidate: `ENTITLEMENT_CHECK_DENIED` (append-only per ADR-0042 §Q-γ.1).
- Founder pricing decision: NOT required at this candidate (entitlement check is governance gate; pricing decision deferred to B5-β).

**Candidate B: B5-β Seat Lifecycle Mutation Surface**

- Scope: NEW Billing Admin routes `POST /api/v1/billing/admin/seats/upgrade` + `POST /api/v1/billing/admin/seats/downgrade` + service-tier helpers + audit emissions.
- Substrate: mutates `Entitlement.seats[].tier` (requires Candidate A LANDED first); enforces ADR-0083 §1 downgrade policy at runtime (preserve audit chain + disable new premium actions + preserve read access to audit/evidence).
- Composes against: Candidate A entitlement substrate + ADR-0026 dual-control discipline (privileged BILLING_ADMIN_SEAT_MUTATION descriptor; new PRIVILEGED_ENDPOINTS entry).
- 2 NEW audit literal candidates: `SEAT_UPGRADED` + `SEAT_DOWNGRADED`.
- Founder pricing decision: required if this candidate lands at substantive runtime tier; the route may land at design-only tier first (Candidate B-design) without pricing.

**Candidate C: B6 Usage Meter Foundation**

- Scope: NEW `UsageMeter` runtime + `UsageMeterSnapshot` Prisma model (per-org per-meter rolling counter with hourly/daily snapshots).
- Substrate: instantiates 16 meter types from B2 catalog (twin seats + Dandelion runs + workflow runs + connector actions + audit exports + storage volume + simulation runs + evidence packages + voice usage + Python compute + connector API call volume + capsule storage + verify-chain query volume + W5 promotion volume + AI Teammate delegations + premium audit reads).
- Service: `MeterService.meterUsage(orgEntityId, meter_name, delta)` increments + persists snapshot; **enforcement deferred** to B5-γ (when Founder pricing + B5-α LIVE both ready).
- Composes against: existing event sources at LIVE substrates — INVOKE_CONNECTOR (Section 4) + W5 promotions (ADR-0086 PROPOSED_ACTION_REFERENCED audit) + voice intent envelope (ADR-0085 §5) + audit exports (Section 7).
- 1-2 NEW audit literal candidates: `USAGE_METER_RECORDED` + `USAGE_METER_THRESHOLD_REACHED`.
- Founder pricing decision: NOT required at this candidate (meter foundation is tracking-only; enforcement deferred).

**Candidates compose** — Candidate A enables capability-gate enforcement; Candidate B mutates Entitlement state; Candidate C tracks usage for future enforcement + B7 payment provider handoff. The Founder picker at per-slice authorization MAY land them in any order; substrate composition stays coherent because each candidate is additive.

### 6. The 7 pre-implementation requirements (every B5-B8 slice MUST satisfy)

Per Founder direction every Billing Completion expansion slice MUST:

1. **Audit existing Section 8 substrate per RULE 13** — the per-gap LIVE / FORWARD-SUBSTRATE map above is canonical pre-flight reference.
2. **Verify Prisma schema additivity** — new models extend `schema.prisma` via additive forward-substrate per ADR-0021 deliberate-blocker pattern; no breaking changes to LIVE `MonetizationEvent` / `MonetizationConfig` / `WalletBalance`.
3. **Verify migration discipline** — every new model lands via `db:push:test` per ADR-0025 (NEVER bare `prisma db push`).
4. **Verify audit literal additions** — new literals via ADR-0042 §Q-γ.1 clean-transition (append-only).
5. **Verify same-org boundary at query tier** — every Entitlement check scopes to caller's org per ADR-0049 GOVSEC.7.
6. **Verify dual-control discipline** — privileged billing operations (seat mutations + plan changes + entitlement overrides) gated by ADR-0026 route-bound static posture; new PRIVILEGED_ENDPOINTS entries.
7. **Verify "memory safety baseline" is NEVER paywalled** — every new entitlement check MUST allow the 13 non-paywallable safety rules per B2 catalog regardless of seat tier or pack ownership.

### 7. Implementation ladder — 10 forward-substrate slices

V1 is doctrine-only at this ADR. Each implementation slice B5-α through B8 requires separate Founder authorization.

- **B5-α — Entitlement Check Runtime** (Candidate A from §5). Single Prisma model + EntitlementCheckService + service-tier helper + integration tests.
- **B5-β-design — Seat Lifecycle Mutation Surface (design-only)** (Candidate B from §5 at design tier; route stubs + service shape; NO pricing decision required).
- **B5-β-runtime — Seat Lifecycle Mutation Surface (runtime)** (Candidate B substantive; Founder pricing decision required).
- **B5-γ — Subscription Lifecycle State Machine** (Subscription model + renewal/cancellation state machine; composes against B5-α + B5-β-runtime).
- **B6-α — Usage Meter Foundation (tracking-only)** (Candidate C from §5; NO enforcement).
- **B6-β — Usage Meter Enforcement** (Founder pricing + B5-α LIVE; per-meter threshold enforcement).
- **B7-design — Payment Provider Selection ADR (Founder-gated)** (RULE 21 vendor research arc per candidate provider; PCI/regulatory review).
- **B7-runtime — Payment Provider Integration (Founder-gated; per-tenant canary first)**.
- **B8-α — Enterprise Contracts (custom pricing + SLA tracking)**.
- **B8-β — Enterprise Billing Operations (multi-tenant production GA + downgrades at scale)**.

### 8. NO Python / Sesame / BEAM / DMW Runtime / connector-write / blockchain bypass

Per cross-LEI sequence discipline: Billing Completion does NOT bypass Python (ADR-0090), Sesame CSM-1B (ADR-0089), BEAM (ADR-0091), DMW Runtime (ADR-0092), Section 4 connector writes (ADR-0084 ≥C6), Section 2 Action authority (ADR-0057), W5 promotion gate (ADR-0086), ECIL surveillance bans (ADR-0088 §4), or blockchain/USDC.

### 9. NO new model / dep / audit literal / migration at this ADR

Design-only. No `schema.prisma` change. No `AUDIT_EVENT_TYPE_VALUES` extension. No Prisma migration. No new dependency. No new route. No new service. No new PRIVILEGED_ENDPOINTS entry. The ADR locks the doctrine + candidate slate; each B5-B8 slice lands its own substrate.

### 10. RULE 0 sovereignty preserved at every tier

Every Billing Completion expansion inherits same-org boundary per ADR-0049 GOVSEC.7, entity-bound scoping per RULE 0, and the ADR-0083 §1 ban *"security/governance features NEVER unsafe-paywalled."*

Entitlement checks NEVER deny:
- Audit chain read at base tier (ADR-0083 §1 posture 10)
- Audit chain verify-chain at self-scope (base tier)
- DMW auto-provisioning at base tier (ADR-0083 §1 posture 7)
- LawfulBasis attestation (ADR-0036 regulator-readiness)
- Soft-delete operations (RULE 10)
- Permission revocation (RULE 0)
- Voice-intent envelope construction at VF.4 LIVE tier (ADR-0085 §5)

### 11. Patent-implementation evidence

Per ADR-0020 two-register IP discipline. Billing Completion advances the patent-implementation evidence trail by canonicalizing the **governance-vs-billing separation at the substrate-architectural register**: billing entitles capabilities; governance authorizes per-capability execution; the two are orthogonal. This is the implementation half of the patent claim *"Foundation governance authorizes capability only inside approved map boundaries"* (per ADR-0082 cartographer doctrine) — billing decides what's IN the customer's map; governance decides what's safe to execute within it.

## Consequences

**Positive.**

- The Billing Completion register is named, bounded, and locked. The 4 Founder doctrine lines + 10 non-negotiable governance postures stay canonical.
- The 13 Founder-named gaps map cleanly to LIVE / FORWARD-SUBSTRATE substrate.
- The 3 candidate slices fit the "no live provider" Founder window. Each is additive to B1-B4 LIVE design substrate.
- Payment provider B7 is explicitly Founder-decision-gated with RULE 21 research-arc requirement.
- The 7 pre-implementation requirements lock the per-slice discipline.
- 10-slice forward-substrate ladder B5-α through B8-β is enumerated; each slice has bounded scope.
- Composition with Hive Intelligence Runtime (ADR-0087) + W5 (ADR-0086) + ECIL (ADR-0088) + Sesame (ADR-0089) + Python (ADR-0090) + BEAM (ADR-0091) + DMW Runtime (ADR-0092) is explicit at the sibling-substrate-layer register.
- The §10 explicit list of operations that MUST stay free at base tier prevents future drift into accidentally paywalling memory safety.

**Negative.**

- The 3 candidates compose; the Founder picker may need to weigh which order maximizes downstream value (Candidate A enables Candidate B + Candidate C enforcement; pricing decision required for Candidate B at runtime tier).
- Each candidate adds Prisma model(s). The Foundation schema surface widens.
- Per-meter usage metering (Candidate C) may have non-trivial write volume at scale; B6-α tracking-only stays in Postgres; future B6-β enforcement may require Redis or per-org partition for atomic counter performance per ADR-0017 Production Discipline.

**Forward-substrate (NOT authorized by this ADR).**

- All 10 implementation slices B5-α through B8-β.
- Payment provider selection ADR + integration (B7; Founder-decision-gated).
- Multi-tenant production GA of billing runtime (B8-β).
- Cross-tenant billing analytics aggregation (would violate ADR-0049 GOVSEC.7).
- Stripe Connect for monetization-revenue payout (composes against existing MonetizationEvent LIVE substrate; Founder-decision-gated).
- Coinbase Commerce / Circle / blockchain payment rails (Founder-gated; ADR-0019 PQC-aware crypto suite already preserves the substrate for future migration if a chain settlement rail is authorized).

## Alternatives

**Alternative A: Bundle Candidates A + B + C into V1.** Rejected per Founder direction *"Start with internal billing lifecycle/usage substrate first."* Bundling violates the bounded-scope discipline established by ADRs 0089/0090/0091/0092.

**Alternative B: Skip the doctrine ADR; land Candidate A directly.** Rejected — established LEI sequence pattern (ADRs 0088-0092) is doctrine-first.

**Alternative C: Pick Candidate A at this ADR.** Rejected — the Founder picker at per-slice authorization determines which slice lands first based on next LEI sequence consumer. ADR-0093 names candidates; doesn't pick.

**Alternative D: Land B7 payment provider integration in this slice.** Rejected per Founder direction *"Do not choose Stripe/Coinbase/Circle/payment provider without Founder decision."* B7 explicitly Founder-decision-gated.

**Alternative E: Migrate existing MonetizationEvent to a new Subscription-based model.** Rejected — substrate-honest framing keeps existing LIVE substrate canonical. MonetizationEvent serves per-capsule-access revenue split (ADR-0021); Section 8 Billing Completion is orthogonal (subscription + entitlement). Both run side-by-side.

**Alternative F: Land USD pricing decisions at this ADR.** Rejected per ADR-0083 §1 Amendment 1 *"per-seat / per-pack USD pricing requires explicit Founder pricing decision."* Pricing decisions are NOT in scope for ADR-0093; they remain at per-slice Founder authorization at B5-β-runtime.

## Cross-references

ADR-0002 (audit chain; preserved across all B-slices per posture 2) ·
ADR-0017 (Production Discipline; B6-α/β scale tuning) ·
ADR-0019 (PQC-aware Cryptographic-Suite Posture; future blockchain settlement rails inherit) ·
ADR-0020 (two-register IP discipline; governance-vs-billing separation canonical) ·
ADR-0021 (CapsuleType extension protocol; deliberate-blocker pattern for new Entitlement model) ·
ADR-0025 (schema-push-target discipline; every new model uses `db:push:test`) ·
ADR-0026 (dual-control; privileged billing operations bound per route-bound static posture; new PRIVILEGED_ENDPOINTS entries at B5-β-runtime) ·
ADR-0036 (LawfulBasis; preserved free at base tier per §10) ·
ADR-0042 §Q-γ.1 (clean-transition; future billing audit literal additions per slice) ·
ADR-0049 (GOVSEC.7 tenant isolation; same-org boundary inherited at every billing read) ·
ADR-0050 (Break-Glass; preserved free at base tier per §10) ·
ADR-0057 (Section 2 Action runtime; preserved; billing entitlement check rides policy evaluator boundary) ·
ADR-0070 (Regulator-Ready doctrine; preserved; entitlement checks NEVER deny regulator-ready evidence reads) ·
ADR-0077 §8.4 (Foundation-first cadence; CT billing surface forward-substrate) ·
ADR-0080 (PermissionBundle; preserved; entitlement check rides alongside permission check) ·
ADR-0081 (Section 9 Workflows doctrine; Workflow Stage 3+ entitlement check at B5-α) ·
ADR-0082 (Dandelion Activation Architecture; D2-D8 stage entitlement check at B5-α) ·
ADR-0083 + Amendment 1 (Section 8 Billing/Entitlements doctrine; parent — ADR-0093 closes the B5+ implementation ladder slot ADR-0083 §B5-B8 reserved) ·
ADR-0084 (Section 4 MCP / Connector Strategy; CapabilityPackEntitlement at connector activation gate B5-α) ·
ADR-0085 §5 (VoiceIntentEnvelope; voice usage meter at B6-α) ·
ADR-0086 (W5 Action Promotion Runtime; W5 promotion volume meter at B6-α) ·
ADR-0087 (Hive Intelligence Runtime V1; Hive entitlement at B5-α) ·
ADR-0088 (ECIL Doctrine; preserved; Tier 2+ content-summary entitlement at B5-α) ·
ADR-0089 (Sesame CSM-1B Readiness; voice provider entitlement at B5-α when VS5+ LIVE) ·
ADR-0090 (Python Intelligence Runtime Readiness; Python compute usage meter at B6-α) ·
ADR-0091 (BEAM Living Coordination Runtime Expansion Doctrine; sibling expansion-doctrine pattern) ·
ADR-0092 (DMW Runtime Expansion Doctrine; sibling expansion-doctrine pattern).

## RULE references

RULE 0 (humans always sovereign; Personal DMW free at base tier per §10) + RULE 4 (audit chain integrity; preserved across B-slices per posture 2) + RULE 5 (auth → clearance → entitlement → permission → policy precedence locked at B5-α) + RULE 9 (modular service-tier connections; EntitlementCheckService composes) + RULE 10 (soft-delete; preserved per §10) + RULE 13 (substrate-honest pre-flight; embedded above as the per-gap LIVE / FORWARD-SUBSTRATE map) + RULE 14 (bidirectional citation; this ADR cites and is cited by ADR-0083 + ADR-0091 + ADR-0092 catalog entries) + RULE 16 (no console.* in apps/api/src; preserved — no code in this slice) + RULE 20 (Founder-only RULE/ADR modification; this ADR lands per `[FOUNDER-AUTH — W5 + LIVING ENTERPRISE INTELLIGENCE AUTONOMOUS BUILD]`) + RULE 21 (substrate-architectural research arc; B7 payment provider selection at slice tier will require per-provider RULE 21 research arc; ADR-0093 doctrine tier is research-embedded via §Context substrate audit).
