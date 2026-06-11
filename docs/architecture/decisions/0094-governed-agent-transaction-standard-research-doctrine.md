# ADR-0094 — Governed Agent Transaction Standard Research Doctrine (Research/ADR Only)

**Status:** Accepted 2026-06-02

**Authorization:** `[FOUNDER-AUTH — W5 + LIVING ENTERPRISE INTELLIGENCE AUTONOMOUS BUILD]` per RULE 20.

## Context

LEI sequence Step 10 (final) per Founder direction:

> "Do not start live blockchain or payments yet. But preserve Foundation direction: Anyone can move USDC. Foundation proves the transaction was allowed."
> "Future objects: BuyerIntent / SpendingCapability / ResourceOffer / PaymentIntent / SettlementReceipt / DeliveryReceipt / FoundationTransactionReceipt / ChainAnchorReference"
> "For now: research/ADR only unless explicitly authorized; no real USDC; no Coinbase CDP; no Circle; no Base transaction; no x402 live settlement."
> "Foundation must remain rail-agnostic."

This ADR is **research/ADR only** — no code, no schema, no dependency added, no payment rail integration, no USDC movement, no Coinbase CDP wiring, no Circle integration, no Base transaction, no x402 facilitator integration, no blockchain anchor write, no settlement infrastructure, no Stripe Connect for monetization payout, no fiat ACH, no SWIFT, no CBDC research arc beyond canonical citations.

Every implementation slice GA1-GA10 named in §9 below requires separate per-slice Founder authorization with its own RULE 21 per-rail research arc.

## Decision

### 1. The doctrine — Foundation is the rail-agnostic AUTHORIZATION-EVIDENCE layer; not a payment rail

Foundation's canonical doctrine for governed agent transactions:

- **"Anyone can move USDC."**
- **"Foundation proves the transaction was allowed."**
- **"Foundation must remain rail-agnostic."**

The Governed Agent Transaction Standard (GATS) is the cryptographically-chained authorization-evidence substrate that any payment rail (x402 / EIP-3009 / Circle Gateway / Coinbase CDP / SWIFT / ACH / future CBDC) can REFERENCE as proof of pre-transaction authorization — without Foundation itself moving funds, without Foundation depending on any single rail's continued existence, and without Foundation requiring any specific blockchain.

The Foundation contribution is **NOT the rail**. The Foundation contribution is **the authorization decision record + cryptographic chain that survives independent of the rail.**

### 2. The 5 inviolable bans (Founder direction; preserved verbatim)

Per Founder direction every GATS implementation slice GA1-GA10 + every customer-facing surface + every operator-facing surface MUST preserve:

1. **No real USDC movement** — Foundation does NOT initiate USDC transfers on any chain.
2. **No Coinbase CDP integration** — Foundation does NOT wire Coinbase Cloud Developer Platform Agentic Wallets / Facilitator at runtime.
3. **No Circle integration** — Foundation does NOT wire Circle Agent Stack / Circle Gateway / Circle Wallets at runtime.
4. **No Base transaction** — Foundation does NOT submit transactions to Base (or any other L2) at runtime.
5. **No x402 live settlement** — Foundation does NOT wire the x402 payment-required HTTP flow as a live facilitator at runtime.

Each ban remains canonical until a separate Founder authorization explicitly amends per RULE 20.

### 3. The 8 canonical GATS objects (Founder direction; preserved verbatim)

Per Founder direction the 8 future-substrate objects are canonical at the doctrine register:

| Object | Owner | Purpose |
|---|---|---|
| **BuyerIntent** | Caller (the agent or entity wanting to buy) | Closed-vocab declaration of what is being requested + why + under what scope envelope |
| **SpendingCapability** | Caller's Foundation-issued envelope | Caller's pre-authorized spending bounds (max amount, max frequency, jurisdiction scope, per-purpose binding, revocability) |
| **ResourceOffer** | Seller (the resource provider) | Seller's terms (price, currency-agnostic value, delivery commitment, rail acceptance set) |
| **PaymentIntent** | Caller + Foundation co-signed | The pre-settlement decision record: caller wants to pay, Foundation authorizes per policy + dual-control + lawful-basis, rail-to-use is named but rail-execution is external |
| **SettlementReceipt** | Rail (x402 facilitator / Circle Gateway / CDP / SWIFT / etc.) | Rail's confirmation that funds moved (Foundation receives a reference; does NOT produce) |
| **DeliveryReceipt** | Seller | Seller's confirmation that resource was delivered (Foundation receives a reference; does NOT produce) |
| **FoundationTransactionReceipt** | Foundation (the unique Foundation contribution) | Cryptographically-chained authorization-evidence record proving the transaction was governed; survives independent of rail/settlement vendor lifecycle; queryable by regulator / auditor / dispute-resolution counterparty |
| **ChainAnchorReference** | Foundation (optional; rail-specific) | Optional reference to a blockchain anchor where the receipt's hash was anchored for additional tamper-evidence; rail-specific (may anchor to Base, Ethereum L1, Polygon, Solana, Bitcoin Lightning, Cardano, or any future chain Foundation supports anchoring to) |

These 8 objects are CONCEPTUAL at this slice — they are NOT Prisma models, NOT wire-format messages, NOT services. Each GA-slice MAY land one or more objects per per-slice Founder authorization.

### 4. RULE 21 vendor research arc embedded

Research conducted 2026-06-02 against canonical authoritative sources.

#### 4.1 x402

- **Originator:** Coinbase (launched 2025). **Current governance:** x402 Foundation (co-founded by Coinbase + Cloudflare; transitioned September 2025). Coinbase repo (`github.com/coinbase/x402`) explicitly states *"a development fork"*; canonical repo is `github.com/x402-foundation/x402`. **License:** Apache-2.0. Source: https://github.com/coinbase/x402 + https://blog.cloudflare.com/x402/
- **Wire format:** HTTP headers `PAYMENT-REQUIRED` (server → client), `PAYMENT-SIGNATURE` (client → server), `PAYMENT-RESPONSE`. CAIP-2 chain identifiers (e.g., `eip155:8453` for Base). SDKs in TypeScript / Go / Python.
- **Rail-agnostic posture:** Per spec *"network, token, and currency agnostic"* aiming to *"support all networks (both crypto & fiat)."* Coinbase-hosted facilitator currently settles ERC-20 on Base / Polygon / Arbitrum / World / Solana. **Custom facilitators architecturally supported.**
- **USDC relationship:** USDC is preferred but NOT required. Spec supports *"EIP-3009 tokens like USDC for the smoothest experience"* OR *"any ERC-20 via Permit2."* Coinbase is optional, NOT required.
- **Adoption status:** No formal alpha/beta/GA designation found in canonical docs. Coinbase publicly reported ~69,000 active agents + ~165M transactions + ~$50M cumulative volume by late April 2026. AWS Bedrock AgentCore Payments + Cloudflare Workers have native integrations. Production-deployed-but-evolving; no stable v1.0 GA statement located.
- Sources: https://github.com/coinbase/x402 + https://docs.cdp.coinbase.com/x402/welcome + https://www.coinbase.com/developer-platform/discover/launches/x402 + https://blog.cloudflare.com/x402/

#### 4.2 Coinbase CDP (Cloud Developer Platform) Agentic Wallets + x402 Facilitator

- Agentic Wallets secured in Trusted Execution Environments (TEEs) for non-custodial self-custody. *"First wallet infrastructure built specifically for agents."*
- CDP x402 Facilitator verifies and settles payments so sellers avoid running blockchain infrastructure; free tier of 1,000 tx/month.
- CDP states the facilitator *"includes compliance controls to manage sanctions and illicit finance risks on every transaction."*
- Detailed ToS for facilitator operations was NOT located in surfaced documentation.
- Source: https://www.coinbase.com/developer-platform/discover/launches/agentic-wallets

#### 4.3 Circle Agent Stack

- Launched May 11, 2026 with 5 components: Agent Wallets + Agent Marketplace + Circle CLI + Nanopayments (Circle Gateway) + Circle Skills. Source: https://www.circle.com/blog/introducing-circle-agent-stack-financial-infrastructure-for-the-agentic-economy
- Wallets hold/move USDC under *"human-defined policies."*
- Circle leverages **EIP-3009 `transferWithAuthorization`** — a cryptographic signature authorizing a third party to move USDC on the holder's behalf, distinct from the holder submitting the on-chain transaction themselves. The EIP-3009 itself is the primitive; Circle's Gateway / Agent Wallets consume it.
- Policies are *"enforced at the wallet layer,"* supporting time-bound spending limits + address allow/blocklists.
- Disclaimer per Circle: transactions *"may occur without real-time human review."* Full Circle ToS at `agents.circle.com/terms-of-use` (not fetched at this slice).
- Source: https://www.circle.com/blog/autonomous-payments-using-circle-wallets-usdc-and-x402

#### 4.4 Cross-vendor synthesis — the Foundation rail-agnostic authorization-evidence gap

All 3 surveyed vendors (x402 / Coinbase CDP / Circle Agent Stack) operate at the **payment-rail layer** (signature → settlement). None of the surveyed documentation describes a governed, audit-chained, COSMP-style **pre-transaction authorization decision record** that:

1. Survives independent of the rail vendor's continued existence
2. Proves WHICH entity authorized the transfer at time T
3. Proves UNDER WHICH POLICY (with what clearance / jurisdiction / dual-control state) the authorization was granted
4. Proves the LAWFUL BASIS (regulator-readiness per ADR-0036 + ADR-0070) the authorization invoked
5. Is portable across rails (USDC, fiat ACH, another stablecoin, CBDC, in-kind exchange)
6. Is queryable by regulator / auditor / dispute-resolution counterparty per ADR-0036 + ADR-0070 LawfulBasis substrate
7. Anchors into Foundation's existing cryptographically-chained audit substrate (ADR-0002 + RULE 4 + BEFORE DELETE trigger)
8. Inherits Foundation's existing sovereignty / tenant-isolation / dual-control / no-AI-to-AI-LONG_TERM-grant discipline (RULE 0 + ADR-0026 + ADR-0049)

Circle's *"policies enforced at the wallet layer"* and CDP's *"compliance controls on every transaction"* are **vendor-tier policy enforcement** — not cryptographically-chained, append-only authorization evidence portable across rails. The substrate-honest gap Foundation fills is precisely this: a rail-agnostic authorization-evidence layer.

### 5. The substrate-honest gap canonical — Foundation's contribution

Foundation's contribution to the governed agent transaction surface is the **`FoundationTransactionReceipt`** (object #7 in §3) — a cryptographically-chained authorization-evidence record that:

- Is produced BEFORE the payment rail executes (the `PaymentIntent` carries the receipt's hash; the rail receives it as input)
- Chains into the existing Foundation audit chain per ADR-0002 + RULE 4 (the receipt's `event_hash` includes the audit chain's `previous_event_hash`)
- Encodes the authorization decision: caller_entity_id + policy_envelope_hash + clearance_state + jurisdiction + lawful_basis_id + dual_control_satisfied + scope_envelope (per ADR-0048) + valid_until
- Carries an OPTIONAL `ChainAnchorReference` for additional tamper-evidence (object #8 in §3) when an anchor write is authorized at a future GA-slice
- Is queryable by regulator / auditor / counterparty per ADR-0036 LawfulBasis chain
- Is portable: any rail can reference the receipt; rails do NOT mutate the receipt

### 6. Composition contract with existing Foundation substrate

GATS V1 composes against (all LIVE):

- **ADR-0001 (three-wallet)** — every PaymentIntent originates from an entity_id with a wallet; same-org boundary applies
- **ADR-0002 (append-only audit chain)** — FoundationTransactionReceipt chains into this substrate
- **ADR-0019 (PQC-aware cryptographic suite)** — receipt signing inherits the canonical suite; future migration to PQC primitives preserved
- **ADR-0026 (dual-control)** — high-value PaymentIntent (above per-entity threshold; defined at GA-slice) requires dual-control gate
- **ADR-0036 (LawfulBasis)** — regulator-tier audit of FoundationTransactionReceipt rides existing LawfulBasis chain
- **ADR-0037 (jurisdiction tagging)** — PaymentIntent + receipt carry jurisdiction tags
- **ADR-0048 (working-set provenance)** — SpendingCapability is a scope envelope per the ADR-0048 4-tier permission envelope pattern
- **ADR-0049 (GOVSEC.7 tenant isolation)** — same-org boundary at receipt query tier
- **ADR-0050 (Break-Glass)** — emergency PaymentIntent never bypasses; uses break-glass per ADR-0050
- **ADR-0057 (Section 2 Action runtime)** — PaymentIntent COULD propose a Section 2 Action when actual fund movement is authorized at GA-slice (forward-substrate)
- **ADR-0070 (Regulator-Ready doctrine)** — receipt is regulator-readable evidence by design
- **ADR-0079 (Retention Class)** — receipt retention per `STANDARD` default; longer per ADR-0083 §1 posture 4 *"Downgrades preserve historical audit"*
- **ADR-0080 (PermissionBundle)** — SpendingCapability is issued per PermissionBundle
- **ADR-0083 §1 (Billing/Entitlements doctrine)** — *"Billing says what was purchased; governance says what's safe"* — GATS is the governance authorization-evidence layer; billing entitlement gates remain orthogonal per ADR-0083 + ADR-0093
- **ADR-0086 (W5 Action Promotion Runtime)** — high-value PaymentIntent promotion path (forward-substrate at GA-slice)
- **ADR-0088 (ECIL Doctrine)** — voice-initiated PaymentIntent inherits voice consent + scoping discipline (forward-substrate)
- **ADR-0089 §5 (VoiceProviderAdapter)** — voice-initiated PaymentIntent rides VoiceIntentEnvelope (forward-substrate)
- **ADR-0090 (Python Intelligence Runtime Readiness)** — Python computations producing SpendingCapability scoring use the §4 envelope discipline
- **ADR-0091 (BEAM Living Coordination)** — high-throughput PaymentIntent coordination at scale composes against BEAM (forward-substrate)
- **ADR-0092 (DMW Runtime Expansion)** — Consent Grant + Receipt substrate (Candidate A) composes orthogonally; FoundationTransactionReceipt is the TRANSACTION counterpart to the CONSENT receipt
- **ADR-0093 (Billing/Entitlements Completion)** — Entitlement check (B5-α) fires BEFORE PaymentIntent is authorized; entitlement-insufficient denies the intent

### 7. NO new model / schema / dep / audit literal / migration / runtime at this ADR

This is a research/ADR-only slice per Founder direction. No `schema.prisma` change. No `AUDIT_EVENT_TYPE_VALUES` extension. No Prisma migration. No new dependency. No new route. No new service. No payment rail integration. No USDC movement. No blockchain anchor write. The ADR locks the doctrine + research arc + 8 canonical objects + composition contract; each future GA-slice lands its own substrate per separate Founder authorization.

### 8. RULE 0 sovereignty preserved at every tier

Every GATS implementation slice inherits same-org boundary per ADR-0049 GOVSEC.7, entity-bound scoping per RULE 0, no AI clearance raise per RULE 0, no AI-to-AI LONG_TERM/PERMANENT grant per RULE 0.

Additional GATS-specific RULE 0 invariants:

- AI agents NEVER originate PaymentIntent without explicit human-tier SpendingCapability authorization
- Cross-tenant PaymentIntent is structurally forbidden (PaymentIntent inherits org boundary from SpendingCapability)
- No FoundationTransactionReceipt is ever issued without a verified LawfulBasis chain (per ADR-0036) when the value exceeds the per-entity regulator-trigger threshold (defined at GA-slice)
- Dual-control per ADR-0026 fires for high-value PaymentIntent above per-org threshold
- Voice-initiated PaymentIntent requires VF.4 LIVE confirmation per ADR-0085 §5 (forward-substrate at GA-slice when voice-initiated transactions are authorized)

### 9. Implementation ladder — 10 forward-substrate slices

V1 is research/ADR only at this slice. Each implementation slice GA1-GA10 requires separate Founder authorization with its own RULE 21 per-rail research arc.

- **GA1 — FoundationTransactionReceipt design ADR** (design-only). Defines the receipt schema + canonical_record byte-equivalence per ADR-0033 pattern + audit chain integration + composition contract with SpendingCapability + PaymentIntent.
- **GA2 — FoundationTransactionReceipt substrate landing** (substantive runtime; no rail integration). NEW Prisma model + service-tier helper + audit emission + dual-control gate for high-value receipts. No actual fund movement; receipts only.
- **GA3 — SpendingCapability substrate landing** (substantive runtime). NEW Prisma model composing against ADR-0080 PermissionBundle + ADR-0048 envelope discipline; revocable; time-bound; per-purpose scoped.
- **GA4 — BuyerIntent + ResourceOffer substrate landing** (substantive runtime). NEW Prisma models; closed-vocab; SAFE projection at query tier.
- **GA5 — PaymentIntent substrate landing + Section 2 Action proposal path** (substantive runtime). NEW Prisma model + W5 promotion path per ADR-0086 + Section 2 Action runtime composition per ADR-0057; entitlement check per ADR-0093 B5-α; jurisdiction enforcement per ADR-0037; LawfulBasis attestation per ADR-0036.
- **GA6 — First rail integration: rail-agnostic SettlementReceipt + DeliveryReceipt ingestion** (substantive runtime; first rail Founder-authorized per separate ADR + RULE 21 research arc). The first rail is FORWARD-SUBSTRATE; Founder picks. Foundation INGESTS rail-produced SettlementReceipt + DeliveryReceipt as input; does NOT initiate fund movement.
- **GA7 — ChainAnchorReference for tamper-evidence** (substantive runtime; Founder-gated; per-chain ADR + RULE 21 research arc per chain). Optional blockchain anchor write for receipt tamper-evidence. Rail-agnostic at the API tier; rail-specific at the anchor implementation.
- **GA8 — Multi-rail PaymentIntent routing** (substantive runtime; Founder-gated). Foundation supports multiple rail backends per PaymentIntent (caller picks rail at intent-time; Foundation verifies caller's SpendingCapability covers the chosen rail).
- **GA9 — Cross-rail PaymentIntent reconciliation** (substantive runtime; Founder-gated). Foundation reconciles SettlementReceipts from different rails against a single PaymentIntent (e.g., split payment across USDC + fiat ACH).
- **GA10 — Production GA across multiple tenants** (operational; Founder-gated rollout cadence).

**Per-rail RULE 21 research arcs explicitly NOT in this slice:**

- x402 facilitator integration (would require RULE 21 research arc at GA6+; vendor terms review at facilitator operations tier)
- Coinbase CDP Agentic Wallets integration (would require RULE 21 research arc + CDP ToS review)
- Circle Agent Stack integration (would require RULE 21 research arc + Circle ToS at `agents.circle.com/terms-of-use`)
- Base / Polygon / Arbitrum / Solana chain anchor write (would require per-chain RULE 21 research arc + L2 finality discipline)
- SWIFT / ACH / fiat rail integration (would require RULE 21 research arc + financial-rail regulatory posture review per ADR-0070)
- CBDC research (would require RULE 21 research arc per CBDC vendor per jurisdiction)
- Stripe Connect for monetization-revenue payout (forward-substrate per ADR-0093 §B7; Founder-decision-gated)

### 10. Patent-implementation evidence

Per ADR-0020 two-register IP discipline. GATS advances the patent-implementation evidence trail by canonicalizing the **rail-agnostic authorization-evidence substrate** at the substrate-architectural register. This is the implementation half of the patent claim that NIOV Foundation provides governed sovereignty across multi-rail value-transfer surfaces — distinct from any single rail's policy enforcement.

The cryptographically-timestamped GATS commit lineage (from this ADR forward) joins the patent-implementation evidence trail for US 12,517,919 (COSMP) + US 12,164,537 + US 12,399,904, with specific emphasis on Foundation's contribution to the agentic-transaction surface that vendor wallets / facilitators / gateways do NOT provide at the protocol layer.

## Amendment 1 — Phase 1250 Governed Transaction Readiness slice (2026-06-11)

**Authorization:** `[FOUNDER — GOVERNED TRANSACTION READINESS PASS /
USDC + BASE + DMW ENTITY TRANSACTION SUBSTRATE]` per RULE 20. The
Founder directive explicitly authorized safe, non-destructive
transaction-readiness substrate ("transaction intent model, mock
transaction service, mock settlement proof, … tests, docs, ADR
updates, enterprise demo mock transaction, audit event types, policy
gates") while explicitly forbidding real funds, live rails, unsafe
key handling, and settlement authorized by credentials alone.

**What landed (mock/readiness only — NOT GA2-GA5):**

- `apps/api/src/services/governance/governed-transaction.service.ts`
  + `apps/api/src/routes/otzar-settlement.routes.ts` — the governed
  MOCK transaction lifecycle: propose (DMW actor) → pure policy gate
  → human approval (dual control ≥ $1,000; self-approval forbidden)
  → MOCK settlement proof → append-only audit at every step.
- 5 append-only audit literals (`TRANSACTION_INTENT_PROPOSED` /
  `_APPROVED` / `_DENIED` / `_REVOKED` / `TRANSACTION_MOCK_SETTLED`)
  per ADR-0042 §Q-γ.1 clean-transition discipline.
- ZERO schema changes: the append-only audit chain (ADR-0002) is the
  intent store (event-sourced), so the governance substrate is PROD
  on the current production schema. The persistent GATS objects of
  §3 remain forward-substrate at the GA ladder — this slice proves
  the GOVERNANCE half without landing the models.
- Test locks: only MOCK_RAIL is executable; CIRCLE_GATEWAY /
  COINBASE_BASE intents are FORBIDDEN at the policy gate even with
  credentials present; AI / device / machine actors never
  auto-approve (§8 preserved); suspended actors blocked at propose
  AND settle; tenant isolation; regulator evidence redacted.

**What did NOT change:** the §2 five inviolable bans (verbatim,
canonical); the §9 GA1-GA10 per-slice authorization requirement for
persistent models and any real rail; rail-agnosticism; custody
posture (Foundation handles no private keys).

## Consequences

**Positive.**

- The Governed Agent Transaction Standard register is named, bounded, and locked at the doctrine tier.
- The 5 inviolable bans (Founder direction) are canonical for every future GA-slice.
- The 8 canonical GATS objects are scoped at the doctrine tier; each future GA-slice lands one or more objects with explicit per-slice Founder authorization.
- The RULE 21 vendor research arc against x402 + Coinbase CDP + Circle Agent Stack is embedded; future GA-slice ADRs inherit the research context.
- The substrate-honest gap (Foundation's rail-agnostic authorization-evidence layer) is named at the patent-implementation evidence register — Foundation's unique contribution to the agentic-transaction surface is locked.
- The composition contract with 17 LIVE Foundation ADR substrates is explicit; GATS does NOT introduce a parallel governance pipeline.
- The 10-slice forward-substrate ladder GA1-GA10 is enumerated; each slice has bounded scope.
- Rail-agnosticism is structural at the ADR tier — no rail-specific decisions land at this slice.

**Negative.**

- The 10-slice ladder is long. Each slice requires per-slice Founder authorization. GATS enters production gradually.
- Each rail integration at GA6+ requires its own RULE 21 research arc + vendor ToS review + regulatory posture review. Throughput depends on per-rail Founder cadence.
- The 5 explicit named bans (USDC + Coinbase CDP + Circle + Base + x402) may need to be revisited at each rail-integration ADR; the bans stay canonical until explicitly amended per RULE 20.

**Forward-substrate (NOT authorized by this ADR).**

- All 10 implementation slices GA1-GA10.
- Per-rail RULE 21 research arcs (x402, CDP, Circle, Base, Polygon, Arbitrum, Solana, SWIFT, ACH, CBDC, Stripe Connect).
- Multi-tenant production GA (GA10).
- Cross-tenant PaymentIntent (structurally forbidden per §8).
- Real USDC movement (forbidden per §2 ban 1).
- Coinbase CDP / Circle / Base / x402 live settlement integration (forbidden per §2 bans 2-5).
- Stripe Connect for monetization-revenue payout (forward-substrate per ADR-0093 §B7).
- ChainAnchorReference per specific chain (forward-substrate at GA7+).
- AI-initiated PaymentIntent without human-tier SpendingCapability (structurally forbidden per §8).

## Alternatives

**Alternative A: Skip the research doctrine ADR; land GA1 directly.** Rejected per Founder direction *"research/ADR only unless explicitly authorized."* The doctrine-first pattern established by ADRs 0088-0093 is canonical for LEI sequence steps.

**Alternative B: Pre-authorize x402 as the canonical first rail at this ADR.** Rejected per Founder direction *"no x402 live settlement"* + Foundation rail-agnostic posture. The first rail is forward-substrate to GA6 with its own ADR + RULE 21 research arc.

**Alternative C: Bundle the 5 inviolable bans into one revisable ban list.** Rejected — each ban is named explicitly to make per-rail authorization tractable. Founder MAY authorize one rail without lifting bans on others.

**Alternative D: Make FoundationTransactionReceipt optional (only produced when authorized).** Rejected — the FoundationTransactionReceipt IS Foundation's contribution to the surface. Making it optional erodes the rail-agnostic authorization-evidence layer that distinguishes Foundation from vendor wallets. Receipts are mandatory; rails are optional.

**Alternative E: Build a Foundation-operated USDC custody wallet at this slice.** Rejected per Founder direction *"no real USDC."* Custody is explicitly out of scope; Foundation is an authorization-evidence layer, not a custody/payment provider.

**Alternative F: Skip the ChainAnchorReference object as overkill.** Rejected — the optional anchor reference is the bridge between Foundation's off-chain authorization-evidence and any chain a future GA-slice authorizes for tamper-evidence anchoring. Keeping it canonical at the doctrine tier preserves the option without requiring any specific chain.

## Cross-references

ADR-0001 (three-wallet; PaymentIntent originates from wallet-owning entity) ·
ADR-0002 (append-only audit chain; FoundationTransactionReceipt chains in) ·
ADR-0019 (PQC-aware cryptographic suite; receipt signing inherits; future PQC migration preserved) ·
ADR-0020 (two-register IP discipline; patent-implementation evidence) ·
ADR-0021 (CapsuleType extension protocol; not used at this ADR) ·
ADR-0025 (schema-push-target discipline; future GA-slice models use `db:push:test`) ·
ADR-0026 (dual-control; high-value PaymentIntent gated) ·
ADR-0036 (LawfulBasis; regulator-readable receipt evidence) ·
ADR-0037 (jurisdiction tagging; PaymentIntent + receipt carry tags) ·
ADR-0042 §Q-γ.1 (clean-transition; future GA-slice audit literal additions) ·
ADR-0048 (working-set provenance; SpendingCapability is scope envelope) ·
ADR-0049 (GOVSEC.7 tenant isolation) ·
ADR-0050 (Break-Glass; emergency PaymentIntent path) ·
ADR-0052 §8 (Otzar DGI doctrine; Twin-to-Twin coordination respects PaymentIntent bounds) ·
ADR-0057 (Section 2 Action runtime; PaymentIntent could propose Section 2 Action at GA5) ·
ADR-0070 (Regulator-Ready doctrine; receipt as regulator evidence) ·
ADR-0077 §8.4 (Foundation-first cadence; CT transaction surface forward-substrate) ·
ADR-0079 (Retention Class; receipt STANDARD default; longer per ADR-0083 §1 posture 4) ·
ADR-0080 (PermissionBundle; SpendingCapability issued per bundle) ·
ADR-0083 + Amendment 1 (Section 8 Billing/Entitlements; billing/governance separation per §1 doctrine line — GATS is the governance evidence layer) ·
ADR-0085 §5 (VoiceIntentEnvelope; voice-initiated PaymentIntent forward-substrate) ·
ADR-0086 (W5 Action Promotion Runtime; high-value PaymentIntent promotion path at GA5) ·
ADR-0087 (Hive Intelligence Runtime V1; Hive-coordinated PaymentIntent forward-substrate) ·
ADR-0088 (ECIL Doctrine; voice-initiated PaymentIntent inherits scoping) ·
ADR-0089 (Sesame CSM-1B Readiness; voice-initiated PaymentIntent forward-substrate at VS5+) ·
ADR-0090 (Python Intelligence Runtime Readiness; SpendingCapability scoring uses §4 envelope discipline) ·
ADR-0091 (BEAM Living Coordination; high-throughput PaymentIntent forward-substrate) ·
ADR-0092 (DMW Runtime Expansion; Consent Grant + Receipt substrate is orthogonal CONSENT counterpart to GATS TRANSACTION receipt) ·
ADR-0093 (Billing/Entitlements Completion; entitlement check fires BEFORE PaymentIntent authorization).

External canonical sources (cited in §4):
- https://github.com/coinbase/x402
- https://docs.cdp.coinbase.com/x402/welcome
- https://www.coinbase.com/developer-platform/discover/launches/x402
- https://blog.cloudflare.com/x402/
- https://www.coinbase.com/developer-platform/discover/launches/agentic-wallets
- https://www.circle.com/blog/introducing-circle-agent-stack-financial-infrastructure-for-the-agentic-economy
- https://www.circle.com/blog/autonomous-payments-using-circle-wallets-usdc-and-x402

## RULE references

RULE 0 (humans always sovereign; AI agents NEVER originate PaymentIntent without human-tier SpendingCapability + no AI-to-AI LONG_TERM/PERMANENT grant + cross-tenant PaymentIntent structurally forbidden) + RULE 4 (audit chain integrity; FoundationTransactionReceipt chains in per ADR-0002) + RULE 9 (modular service-tier connections; GATS services compose via SpendingCapability + PaymentIntent envelopes) + RULE 10 (soft-delete; receipt retention per ADR-0079 STANDARD) + RULE 13 (substrate-honest pre-flight; embedded above as §4 vendor research findings) + RULE 14 (bidirectional citation; this ADR cites and is cited by ADR-0001 / ADR-0019 / ADR-0036 / ADR-0070 / ADR-0083 / ADR-0086 / ADR-0092 / ADR-0093 catalog entries) + RULE 16 (no console.* in apps/api/src; preserved — no code in this slice) + RULE 20 (Founder-only RULE/ADR modification; this ADR lands per `[FOUNDER-AUTH — W5 + LIVING ENTERPRISE INTELLIGENCE AUTONOMOUS BUILD]`) + RULE 21 (substrate-architectural research arc; §4 embeds canonical authoritative source URLs for x402 + Coinbase CDP + Circle Agent Stack; each future GA-slice rail integration requires its own per-rail RULE 21 research arc per §9 ladder).
