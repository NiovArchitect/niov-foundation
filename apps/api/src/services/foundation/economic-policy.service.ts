// FILE: economic-policy.service.ts
// PURPOSE: Phase 1290-A — Foundation ECONOMIC SUBSTRATE CONTRACTS (mock-only).
//          The governed economic-intent layer for FUTURE agent-to-agent,
//          device-to-device, app-to-agent, service/tool/compute, memory-access,
//          and marketplace microtransactions — built as a SPEND-POLICY
//          evaluator + an HTTP 402-style quote / payment-required handshake.
//
//          This phase deliberately does NOT move real funds, choose a payment
//          provider, require secrets, or settle on-chain. It COMPOSES the
//          existing GATS governed-transaction substrate (ADR-0094): GATS owns
//          the mock-intent lifecycle (propose/approve/revoke/settle, event-
//          sourced on the audit chain, USDC_MOCK / MOCK_RAIL); this layer adds
//          the two things GATS lacks — a per-entity SPEND POLICY (spend limit +
//          per-transaction cap + purpose) and a 402-style QUOTE contract — and
//          the economic-intent purpose vocabulary (incl. memory-access +
//          marketplace). A quote points the caller at the GATS surface to
//          actually record a mock intent; nothing here is real settlement.
//
//          Settlement modes are HONEST LABELS only: MOCK_ONLY is the only
//          executable mode at this phase; PROVIDER_DEFERRED and FUTURE_ONCHAIN
//          are reserved and a quote in those modes is DENIED with a clear
//          "Founder decision required" reason. real_provider_enabled is
//          hardcoded false. Choosing/activating a real provider (Base / USDC /
//          CDP / Stripe / Circle) is a separate Founder decision (RULE 20 +
//          ADR-0094 five inviolable bans).
//
// CONNECTS TO:
//   - apps/api/src/services/governance/governed-transaction.service.ts
//     (GATS constants MICROTRANSACTION_MAX_USD / DUAL_CONTROL_MIN_USD /
//     TRANSACTION_AMOUNT_MAX_USD + asset USDC_MOCK; the mock-intent lifecycle).
//   - apps/api/src/services/foundation/authority.service.ts (SettlementMode).
//   - apps/api/src/services/billing/usage-meter.service.ts (metering hook).
//   - apps/api/src/services/auth.service.ts (validateSession) — the gate.
//   - packages/database writeAuditEvent (ECONOMIC_INTENT_QUOTED proof).
//   - apps/api/src/routes/foundation.routes.ts — the HTTP 402 surface.
//
// SAFETY: never real funds / provider / secrets / chain. Audit + responses
// carry SAFE economic metadata only (amount_usd, asset USDC_MOCK, settlement
// mode, purpose, actor class, decision, reason code, approval count) — never
// keys, env, provider responses, chain addresses, or counterparty PII.

import { randomUUID } from "node:crypto";
import {
  prisma,
  writeAuditEvent,
} from "@niov/database";
import type { EntityType } from "@niov/database";
import type { AuthService } from "../auth.service.js";
import { getOrgEntityId } from "../governance/org.js";
import { recordUsageForOrg } from "../billing/usage-meter.service.js";
import type { SettlementMode } from "./authority.service.js";
import {
  MICROTRANSACTION_MAX_USD,
  DUAL_CONTROL_MIN_USD,
  TRANSACTION_AMOUNT_MAX_USD,
  TRANSACTION_ASSET,
} from "../governance/governed-transaction.service.js";

// The closed economic-intent purpose vocabulary. Covers the Foundation-scale
// microtransaction surfaces the substrate must support (agents/devices/apps/
// memory/marketplace) WITHOUT implying any are wired to real settlement.
export const ECONOMIC_PURPOSES = [
  "AGENT_TO_AGENT",
  "DEVICE_TO_DEVICE",
  "APP_TO_AGENT",
  "SERVICE_USAGE",
  "TOOL_USAGE",
  "COMPUTE_USAGE",
  "MEMORY_CAPSULE_READ",
  "MEMORY_CAPSULE_WRITE",
  "MEMORY_CAPSULE_SHARE",
  "MEMORY_RETRIEVAL_QUERY",
  "MARKETPLACE_PURCHASE",
  "SUBSCRIPTION",
  "METERED_ACCESS",
] as const;
export type EconomicPurpose = (typeof ECONOMIC_PURPOSES)[number];

export type SpendPolicyDecision = "ALLOW_MOCK" | "NEEDS_APPROVAL" | "DENIED";

// The metering hook fired on every quote (best-effort; never blocks).
const ECONOMIC_QUOTE_METER = "meter.economic-intent-quotes.v1";

// Quote validity window (advisory; quotes are stateless contracts).
const QUOTE_TTL_MS = 5 * 60 * 1000;

export interface SpendPolicyInput {
  entity_type: EntityType;
  amount_usd: number;
  purpose: EconomicPurpose;
  settlement_mode: SettlementMode;
  // Optional per-call ceilings (persistent SpendPolicy model is forward-
  // substrate; until then these are caller/config-supplied).
  per_transaction_cap?: number | null;
  spend_limit?: number | null;
  spent_so_far?: number | null;
}

export interface SpendPolicyResult {
  decision: SpendPolicyDecision;
  reason_code: string;
  settlement_mode: SettlementMode;
  required_approvals: number;
  // Hardcoded false — no real provider is ever enabled at this phase.
  real_provider_enabled: false;
  mock_notice: string;
}

const MOCK_NOTICE =
  "MOCK ONLY — no funds move, no provider is called, nothing settles on-chain.";

// WHAT: AI_AGENT / DEVICE / APPLICATION — the restricted (non-human) class.
// WHY: Mirrors negotiate.service.ts:isRestrictedAiClass. RULE 0 + ADR-0094 §8:
//      a non-human actor NEVER auto-originates a payment — it always needs
//      explicit human approval.
function isRestrictedAiClass(t: EntityType): boolean {
  return t === "AI_AGENT" || t === "DEVICE" || t === "APPLICATION";
}

// WHAT: Evaluate a spend policy for a proposed economic intent. Pure +
//        deterministic. Mock-only by construction.
// INPUT: entity type + amount + purpose + settlement mode (+ optional caps).
// OUTPUT: a SpendPolicyResult (ALLOW_MOCK | NEEDS_APPROVAL | DENIED).
// WHY: The genuinely-missing gate GATS lacks — per-entity spend limits +
//      per-transaction caps + settlement-mode gating, layered on the GATS
//      amount tiers (micro auto / dual-control ≥ $1k). Only MOCK_ONLY is
//      executable; reserved modes are DENIED with an honest reason.
export function evaluateSpendPolicy(input: SpendPolicyInput): SpendPolicyResult {
  const base = {
    settlement_mode: input.settlement_mode,
    real_provider_enabled: false as const,
    mock_notice: MOCK_NOTICE,
  };
  const deny = (reason_code: string): SpendPolicyResult => ({
    ...base,
    decision: "DENIED",
    reason_code,
    required_approvals: 0,
  });

  // 1. Amount sanity.
  if (
    !Number.isFinite(input.amount_usd) ||
    input.amount_usd <= 0 ||
    input.amount_usd > TRANSACTION_AMOUNT_MAX_USD
  ) {
    return deny("amount-out-of-bounds");
  }

  // 2. Settlement mode — only MOCK_ONLY is executable at this phase. Reserved
  //    modes are honestly denied; choosing a real provider is a Founder call.
  if (input.settlement_mode === "DISABLED") {
    return deny("economic-substrate-disabled");
  }
  if (input.settlement_mode === "PROVIDER_DEFERRED") {
    return deny("provider-not-selected-founder-decision-required");
  }
  if (input.settlement_mode === "FUTURE_ONCHAIN") {
    return deny("onchain-settlement-not-authorized-founder-decision-required");
  }
  // settlement_mode === "MOCK_ONLY" from here on.

  // 3. Per-transaction cap (if supplied).
  if (
    input.per_transaction_cap != null &&
    input.amount_usd > input.per_transaction_cap
  ) {
    return deny("per-transaction-cap-exceeded");
  }

  // 4. Spend limit (if supplied) — cumulative.
  if (input.spend_limit != null) {
    const spent = input.spent_so_far ?? 0;
    if (spent + input.amount_usd > input.spend_limit) {
      return deny("spend-limit-exceeded");
    }
  }

  // 5. Non-human actors NEVER auto-originate (RULE 0 + ADR-0094 §8).
  if (isRestrictedAiClass(input.entity_type)) {
    return {
      ...base,
      decision: "NEEDS_APPROVAL",
      reason_code: "non-human-actor-requires-human-approval",
      // Dual-control still applies for high value even under approval.
      required_approvals: input.amount_usd >= DUAL_CONTROL_MIN_USD ? 2 : 1,
    };
  }

  // 6. High-value human transaction → dual-control.
  if (input.amount_usd >= DUAL_CONTROL_MIN_USD) {
    return {
      ...base,
      decision: "NEEDS_APPROVAL",
      reason_code: "high-value-requires-dual-control",
      required_approvals: 2,
    };
  }

  // 7. Microtransaction by a human → mock auto-allow.
  if (input.amount_usd <= MICROTRANSACTION_MAX_USD) {
    return {
      ...base,
      decision: "ALLOW_MOCK",
      reason_code: "human-microtransaction-mock-allowed",
      required_approvals: 0,
    };
  }

  // 8. Default — human, mid-value → single human approval.
  return {
    ...base,
    decision: "NEEDS_APPROVAL",
    reason_code: "human-transaction-requires-approval",
    required_approvals: 1,
  };
}

// The 402-style quote envelope. status mirrors the HTTP disposition:
//   ALLOWED_MOCK   → 200 (a mock intent may be recorded via GATS)
//   PAYMENT_REQUIRED → 402 (approval/dual-control needed before any mock intent)
//   DENIED         → 403 (policy/mode refusal)
export type QuoteStatus = "ALLOWED_MOCK" | "PAYMENT_REQUIRED" | "DENIED";

export interface PaymentRequiredQuote {
  quote_id: string;
  amount_usd: number;
  asset: typeof TRANSACTION_ASSET;
  settlement_mode: SettlementMode;
  purpose: EconomicPurpose;
  actor_entity_type: EntityType;
  status: QuoteStatus;
  decision: SpendPolicyDecision;
  reason_code: string;
  required_approvals: number;
  real_provider_enabled: false;
  mock_notice: string;
  honest_note: string;
  // Where to actually record a mock intent (GATS); null when DENIED.
  next_step: string | null;
  evaluated_at: string;
  expires_at: string;
}

export type QuoteResult =
  | { ok: true; quote: PaymentRequiredQuote }
  | { ok: false; code: string };

function quoteStatusFor(decision: SpendPolicyDecision): QuoteStatus {
  if (decision === "ALLOW_MOCK") return "ALLOWED_MOCK";
  if (decision === "NEEDS_APPROVAL") return "PAYMENT_REQUIRED";
  return "DENIED";
}

export class FoundationEconomicService {
  constructor(private readonly authService: AuthService) {}

  // WHAT: Quote a proposed economic intent (HTTP 402-style handshake).
  // INPUT: session token + { amount_usd, purpose, settlement_mode?, caps }.
  // OUTPUT: { ok:true, quote } or { ok:false, code }.
  // WHY: POST /api/v1/foundation/economic/quote — the pay-to-access handshake.
  //      Evaluates the spend policy for the caller, emits proof, fires a
  //      metering hook, and returns a clearly-labeled mock quote. Records NO
  //      mock intent itself (that is the GATS surface) and moves NO funds.
  async quoteEconomicIntentForCaller(
    sessionToken: string,
    input: {
      amount_usd: number;
      purpose: string;
      settlement_mode?: string;
      per_transaction_cap?: number | null;
      spend_limit?: number | null;
      spent_so_far?: number | null;
    },
  ): Promise<QuoteResult> {
    const validation = await this.authService.validateSession(
      sessionToken,
      "read",
    );
    if (!validation.valid) {
      return { ok: false, code: validation.code };
    }

    // Validate the purpose against the closed vocabulary.
    if (!(ECONOMIC_PURPOSES as readonly string[]).includes(input.purpose)) {
      return { ok: false, code: "INVALID_PURPOSE" };
    }
    const purpose = input.purpose as EconomicPurpose;

    // Settlement mode defaults to MOCK_ONLY (the only executable mode).
    const settlementMode = (input.settlement_mode ?? "MOCK_ONLY") as SettlementMode;
    const VALID_MODES: SettlementMode[] = [
      "DISABLED",
      "MOCK_ONLY",
      "PROVIDER_DEFERRED",
      "FUTURE_ONCHAIN",
    ];
    if (!VALID_MODES.includes(settlementMode)) {
      return { ok: false, code: "INVALID_SETTLEMENT_MODE" };
    }

    // Load the caller's entity type (drives the non-human approval rule).
    const entity = await prisma.entity.findFirst({
      where: { entity_id: validation.entity_id, deleted_at: null },
      select: { entity_type: true },
    });
    if (entity === null) {
      return { ok: false, code: "ENTITY_NOT_FOUND" };
    }

    const policy = evaluateSpendPolicy({
      entity_type: entity.entity_type,
      amount_usd: input.amount_usd,
      purpose,
      settlement_mode: settlementMode,
      per_transaction_cap: input.per_transaction_cap ?? null,
      spend_limit: input.spend_limit ?? null,
      spent_so_far: input.spent_so_far ?? null,
    });

    const status = quoteStatusFor(policy.decision);
    const now = new Date();
    const quote: PaymentRequiredQuote = {
      quote_id: randomUUID(),
      amount_usd: input.amount_usd,
      asset: TRANSACTION_ASSET,
      settlement_mode: settlementMode,
      purpose,
      actor_entity_type: entity.entity_type,
      status,
      decision: policy.decision,
      reason_code: policy.reason_code,
      required_approvals: policy.required_approvals,
      real_provider_enabled: false,
      mock_notice: MOCK_NOTICE,
      honest_note:
        status === "DENIED"
          ? "This economic intent is not permitted. No quote was issued, no funds move, and no real settlement exists."
          : "This is a MOCK quote only. To record a governed mock intent, propose it via the governed-transaction surface; nothing settles for real and no payment provider is selected.",
      next_step:
        status === "DENIED"
          ? null
          : "POST /api/v1/otzar/settlement/mock-intents (GATS mock intent; USDC_MOCK / MOCK_RAIL)",
      evaluated_at: now.toISOString(),
      expires_at: new Date(now.getTime() + QUOTE_TTL_MS).toISOString(),
    };

    // Proof of the quote (RULE 4). SAFE economic metadata only.
    await writeAuditEvent({
      event_type: "ECONOMIC_INTENT_QUOTED",
      outcome: status === "DENIED" ? "DENIED" : "SUCCESS",
      actor_entity_id: validation.entity_id,
      denial_reason: status === "DENIED" ? policy.reason_code : null,
      details: {
        action: "ECONOMIC_INTENT_QUOTED",
        amount_usd: input.amount_usd,
        asset: TRANSACTION_ASSET,
        settlement_mode: settlementMode,
        purpose,
        actor_entity_type: entity.entity_type,
        decision: policy.decision,
        reason_code: policy.reason_code,
        required_approvals: policy.required_approvals,
        real_provider_enabled: false,
      },
    });

    // Metering hook (best-effort; never blocks the quote).
    try {
      const orgEntityId = await getOrgEntityId(validation.entity_id);
      await recordUsageForOrg(orgEntityId, ECONOMIC_QUOTE_METER, 1);
    } catch {
      // Orgless caller or metering hiccup — the quote stands regardless.
    }

    return { ok: true, quote };
  }
}
