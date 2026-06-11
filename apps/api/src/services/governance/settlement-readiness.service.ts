// FILE: settlement-readiness.service.ts
// PURPOSE: Phase 1248 — settlement rail readiness + the MOCK rail.
//          Implements the provider-adapter seam ADR-0094 (GATS)
//          reserves: rails are pluggable; Foundation proves the
//          transaction was allowed and NEVER moves funds itself.
//
//          THIS SLICE IS PREP ONLY (explicitly Founder-authorized):
//          - NO real funds. NO private keys. NO chain transactions.
//          - The only executable rail is MOCK_RAIL: a deterministic
//            dev/demo rail that "settles" nothing and returns a
//            fabricated-but-clearly-labeled receipt for pipeline
//            development. Real rails (Circle / Base) surface honest
//            BLOCKED_BY_CREDENTIALS status via the connector
//            registry and activate only after explicit Founder
//            authorization wires them.
//
// CONNECTS TO:
//   - docs/architecture/decisions/
//     0094-governed-agent-transaction-standard-research-doctrine.md
//     (PaymentIntent / SettlementReceipt / FoundationTransactionReceipt
//     model this seam implements the adapter half of)
//   - apps/api/src/services/connectors/connector-adapter-registry.ts
//     (CIRCLE_GATEWAY + COINBASE_BASE credential readiness)
//   - apps/api/src/routes/otzar-settlement.routes.ts
//   - tests/unit/settlement-readiness.test.ts

import { listConnectorAdapters } from "../connectors/connector-adapter-registry.js";

export type SettlementRailName = "MOCK_RAIL" | "CIRCLE_GATEWAY" | "COINBASE_BASE";

export type SettlementRailStatus =
  | "DEV_ONLY"
  | "BLOCKED_BY_CREDENTIALS"
  | "NOT_AUTHORIZED";

export interface SettlementRailRow {
  rail: SettlementRailName;
  display_name: string;
  status: SettlementRailStatus;
  /** Calm, honest one-liner. */
  note: string;
}

/** The shape every rail adapter returns. MOCK_RAIL is the only
 *  implementation in this slice; real rails implement the same
 *  contract when the Founder authorizes wiring. */
export interface MockSettlementReceipt {
  rail: "MOCK_RAIL";
  /** Always true — this receipt is a development artifact. */
  is_mock: true;
  reference: string;
  amount_usd: number;
  note: string;
}

// WHAT: Honest rail readiness for diagnostics + the readiness page.
// WHY: Admins must see exactly why settlement is not live: the dev
//      rail exists for pipeline work; real rails need credentials
//      AND explicit Founder authorization.
export function listSettlementRails(): SettlementRailRow[] {
  const adapters = listConnectorAdapters();
  const circle = adapters.find((a) => a.provider_name === "CIRCLE_GATEWAY");
  const base = adapters.find((a) => a.provider_name === "COINBASE_BASE");
  return [
    {
      rail: "MOCK_RAIL",
      display_name: "Development rail (mock)",
      status: "DEV_ONLY",
      note: "Settles nothing — produces clearly-labeled mock receipts so the governed pipeline can be developed and demoed safely.",
    },
    {
      rail: "CIRCLE_GATEWAY",
      display_name: "Circle (USDC)",
      status:
        circle !== undefined && circle.missing_envs.length === 0
          ? "NOT_AUTHORIZED"
          : "BLOCKED_BY_CREDENTIALS",
      note:
        circle !== undefined && circle.missing_envs.length === 0
          ? "Credentials present, but settlement wiring requires explicit Founder authorization."
          : "Needs the organization's Circle API key — and settlement wiring requires explicit Founder authorization.",
    },
    {
      rail: "COINBASE_BASE",
      display_name: "Coinbase Base (on-chain)",
      status:
        base !== undefined && base.missing_envs.length === 0
          ? "NOT_AUTHORIZED"
          : "BLOCKED_BY_CREDENTIALS",
      note:
        base !== undefined && base.missing_envs.length === 0
          ? "Credentials present, but settlement wiring requires explicit Founder authorization."
          : "Needs the organization's Coinbase Developer Platform keys — and settlement wiring requires explicit Founder authorization.",
    },
  ];
}

// WHAT: The MOCK rail's "settle" — a deterministic dev artifact.
// INPUT: A reference string + amount. NO entity ids, NO real data.
// OUTPUT: A clearly-labeled mock receipt.
// WHY: Lets the future governed pipeline (PaymentIntent → approval →
//      rail call → FoundationTransactionReceipt) be built and tested
//      end-to-end before any real rail exists. The is_mock flag and
//      the note make it impossible to mistake for real settlement.
export function mockSettle(input: {
  reference: string;
  amount_usd: number;
}): MockSettlementReceipt {
  return {
    rail: "MOCK_RAIL",
    is_mock: true,
    reference: input.reference,
    amount_usd: input.amount_usd,
    note: "MOCK SETTLEMENT — no funds moved. Development artifact per ADR-0094 preparation.",
  };
}
