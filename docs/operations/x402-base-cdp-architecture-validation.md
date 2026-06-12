# x402 / Base / CDP Architecture Validation — Phase 1260

**Status:** Phase 1260 deliverable (2026-06-12). Operations register —
validation evidence, NOT an authorization. Settlement remains
**NOT_AUTHORIZED**; the ADR-0094 §2 five inviolable bans are intact
and this document changes none of them. Credentials never activate
rails (ADR-0094 Amendment 1 policy-gate test locks).

**Question answered:** does the GATS architecture (ADR-0094) and the
Phase 1250 governed mock-transaction substrate still hold against the
CURRENT official Coinbase/Base/x402 stack — and what would a future
Founder-authorized GA6+ rail slice need to know that changed since
the ADR-0094 research arc (2026-06-02)?

**Verdict: the architecture holds.** Foundation's rail-agnostic
authorization-evidence posture is unaffected by every vendor change
found; in fact the churn documented in §3 (a protocol major-version
bump, a deprecated SDK, and a dead npm package — all within months)
is direct evidence FOR the core GATS claim that the authorization
record must survive independent of any rail vendor's lifecycle.

## 1. Research arc (RULE 21; conducted 2026-06-12)

All claims verified against official sources; full URL list in §6.

### 1.1 x402 — now protocol v2 under the x402 Foundation

- Canonical repo: `github.com/x402-foundation/x402` (Coinbase repo is
  a development fork). Spec docs: https://docs.x402.org
- **v2 flow:** `402 Payment Required` + `PAYMENT-REQUIRED` header →
  client retries with signed `PAYMENT-SIGNATURE` header → facilitator
  `/verify` + `/settle` → `PAYMENT-RESPONSE` header. Payload
  `x402Version: 2`.
- **v1→v2 renames:** headers `X-PAYMENT`/`X-PAYMENT-RESPONSE` →
  `PAYMENT-SIGNATURE`/`PAYMENT-RESPONSE`; network IDs now CAIP-2
  (`eip155:8453` Base mainnet, `eip155:84532` Base Sepolia); npm
  packages move from unscoped `x402*` (v1, still published) to scoped
  `@x402/*` (core/evm/express/fetch/fastify/… at v2.14.0).
- Schemes: `exact`, plus v2 `upto` and `batch-settlement`. Assets:
  EIP-3009 tokens (USDC smoothest) or any ERC-20 via Permit2.
- Facilitators: `https://x402.org/facilitator` (testnet, no auth) and
  CDP `https://api.cdp.coinbase.com/platform/v2/x402` (mainnet,
  CDP keys, free tier 1,000 tx/month, KYT/OFAC screening).
- **Full no-real-funds testnet path exists:** Base Sepolia + x402.org
  facilitator + CDP faucet (testnet ETH + USDC) — relevant ONLY if a
  future Founder authorization opens a sandbox validation slice; not
  authorized today.

### 1.2 Coinbase CDP

- Current SDK: `@coinbase/cdp-sdk` (Server Wallets v2; EVM/smart/
  Solana accounts). **Deprecated:** `@coinbase/coinbase-sdk` + Server
  Wallet v1 (deprecated 2026-02-02).
- Auth: `CDP_API_KEY_ID` + `CDP_API_KEY_SECRET` + `CDP_WALLET_SECRET`
  (the registry's two env names cover the API pair; a wallet secret
  would be a third credential at any future wallet slice).
- **CDP Policy Engine:** declarative accept/reject rules per
  operation (value caps in wei, address allowlists; project-level
  evaluates before account-level). AgentKit: `@coinbase/agentkit`
  (current) — `@coinbase/cdp-agentkit-core` deprecated.

### 1.3 Base MCP

- The npm/stdio `base-mcp` package is **dead** — repo archived
  2026-05-13 ("Do not use `npx base-mcp`"). Replacement: hosted
  remote MCP at `https://mcp.base.org` (HTTP transport), auth via
  Base Account OAuth (no CDP keys, no seed phrase), per-action human
  approval URLs for writes. Tools include transfers, swaps, signing,
  and x402 payments on Base + Base Sepolia.

### 1.4 Base chain facts

- Chain IDs: mainnet 8453, Sepolia 84532. Official RPCs
  (`mainnet.base.org` / `sepolia.base.org`) are rate-limited and not
  for production. USDC (Circle-official): mainnet
  `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`, Sepolia
  `0x036CbD53842c5426634e7929541eC2318f3dCF7e` (6 decimals).

### 1.5 Vendor governance primitives

- CDP Policy Engine (above), Base Account Spend Permissions (scoped
  token/allowance/period grants), Base MCP approval URLs. All are
  **vendor-tier policy enforcement** — none produce a portable,
  cryptographically-chained pre-transaction authorization record.
  ADR-0094 §4.4's gap analysis remains true under the current stack.

## 2. DMW transaction governance validation

Validated against the LIVE Phase 1250 substrate
(`apps/api/src/services/governance/governed-transaction.service.ts` +
`apps/api/src/routes/otzar-settlement.routes.ts`, ADR-0094
Amendment 1):

| Requirement | Status |
|---|---|
| Request / propose / approve / execute as SEPARATE capabilities | **HOLDS** — propose (DMW actor) → pure policy gate → human approval → mock settle are distinct steps; self-approval forbidden; dual control ≥ $1,000 per ADR-0026 |
| x402/MCP financial calls must be governed intents | **HOLDS structurally** — only MOCK_RAIL is executable; CIRCLE_GATEWAY / COINBASE_BASE intents are FORBIDDEN at the policy gate even with credentials present (test-locked). Any future Base MCP or x402 call would have to enter as a proposed intent or it cannot execute |
| AI actors never auto-approve | **HOLDS** — AI / device / machine actors never auto-approve (ADR-0094 §8 + Amendment 1 locks) |
| Audit before response (RULE 4) | **HOLDS** — 5 append-only literals (`TRANSACTION_INTENT_PROPOSED/_APPROVED/_DENIED/_REVOKED/TRANSACTION_MOCK_SETTLED`); the audit chain IS the intent store (event-sourced, zero schema changes) |
| Tenant isolation + suspension | **HOLDS** — suspended actors blocked at propose AND settle; cross-tenant intents structurally forbidden |

One observation for any future MCP slice: the hosted Base MCP's own
approval model (per-action human approval URLs) is COMPATIBLE with
but NOT a substitute for Foundation governance — a Base MCP tool
call still must ride a governed PaymentIntent; the vendor approval
URL is at most a second, outer confirmation.

## 3. Drift findings vs ADR-0094 §4 (RULE 13 — surfaced, not patched)

| # | Drift | Impact |
|---|---|---|
| D-1260-1 | x402 is now **protocol v2**: renamed headers, `x402Version: 2`, CAIP-2 network IDs, scoped `@x402/*` packages (v2.14.0). ADR-0094 §4.1 already names the v2 headers but predates the package/CAIP-2/scheme details | None to doctrine; any GA6+ x402 slice MUST target v2 (`@x402/*`, CAIP-2) and treat unscoped `x402*` v1 packages as legacy |
| D-1260-2 | CDP Server Wallet v1 + `@coinbase/coinbase-sdk` deprecated (2026-02-02); current is `@coinbase/cdp-sdk` Server Wallets v2 with a third secret (`CDP_WALLET_SECRET`) | None today (no CDP wiring exists — ban 2). Registry env names remain correct for the API pair; a wallet slice would add the third name |
| D-1260-3 | `base-mcp` npm package archived (2026-05-13); replaced by hosted `https://mcp.base.org` with Base Account OAuth | Any future Base MCP evaluation targets the hosted server; nothing in-repo referenced the npm package (verified by grep — zero hits) |
| D-1260-4 | New vendor governance primitives (CDP Policy Engine, Spend Permissions) | Strengthens, not weakens, the GATS gap analysis: still vendor-tier, still not portable authorization evidence |

**Proposed ADR-0094 Amendment 2 (DRAFT — Founder review required per
RULE 20; this document does NOT modify the ADR):** append a §4.5
"2026-06-12 re-verification" noting D-1260-1..4 with the §6 sources,
and extend §9's per-rail research-arc list with the hosted Base MCP
(OAuth/Base Account model) as a distinct integration surface from
CDP. No ban changes, no authorization changes.

## 4. What this validation does NOT do

No code, no schema, no dependency, no credential activation, no
testnet transaction, no live rail call, no ADR modification. The
five bans (no real USDC / no CDP / no Circle / no Base tx / no x402
live settlement) are untouched and re-confirmed as the operative
constraint for every surface that cites this document.

## 5. Forward path (each step Founder-gated per ADR-0094 §9)

1. GA1 FoundationTransactionReceipt design ADR (design-only) — ready
   to draft on authorization; §1 research satisfies the RULE 21
   pre-read for the x402/CDP/Base corner of that arc.
2. IF a sandbox validation slice is ever authorized: Base Sepolia +
   x402.org facilitator is the zero-real-funds path (§1.1).
3. Hosted Base MCP evaluation as its own research arc (D-1260-3).

## 6. Sources (retrieved 2026-06-12)

- https://github.com/x402-foundation/x402 · https://docs.x402.org ·
  https://docs.x402.org/guides/migration-v1-to-v2.md ·
  https://docs.x402.org/dev-tools/facilitators.md ·
  https://docs.x402.org/core-concepts/network-and-token-support.md
- https://docs.cdp.coinbase.com/x402/welcome ·
  https://docs.cdp.coinbase.com/server-wallets/v2/introduction/quickstart ·
  https://docs.cdp.coinbase.com/server-wallets/v1/introduction/quickstart ·
  https://docs.cdp.coinbase.com/server-wallets/v2/using-the-wallet-api/policies/overview
- https://github.com/coinbase/agentkit · https://github.com/base/base-mcp-legacy ·
  https://docs.base.org/ai-agents · https://docs.base.org/base-chain/quickstart/connecting-to-base ·
  https://docs.base.org/base-account/improve-ux/spend-permissions
- https://developers.circle.com/stablecoins/usdc-contract-addresses ·
  https://blog.cloudflare.com/x402/
