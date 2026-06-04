// FILE: monetization.service.ts
// PURPOSE: Implement the Monetization Engine. Trigger pay-events
//          AFTER the user response has gone out (so user latency
//          is never charged for monetization), retry failed events
//          via a background sweep, and expose balances + history
//          to wallet holders.
// CONNECTS TO: AuthService, the monetization_events table, the
//              wallet_balances table, the memory_capsules table
//              (read monetization_enabled + capsule_type), and the
//              audit-of-record table.

import {
  prisma,
  writeAuditEvent,
  type CapsuleType,
  type MonetizationEvent,
  type Prisma,
  type WalletBalance,
} from "@niov/database";
import type { AuthService } from "../auth.service.js";

// WHAT: Base USD value paid for one access of each capsule type.
// INPUT: Used as a lookup table.
// OUTPUT: A USD amount.
// WHY: Spec lists exactly these values. FOUNDATIONAL is 0 because
//      identity capsules are NEVER monetized -- the entity does
//      not sell their own identity. Future revisions can move
//      these into a config table; for MVP a constant map keeps
//      the logic readable.
//
//      The shape is `Partial<Record<CapsuleType, number>>` because
//      Foundation has added new CapsuleType enum values (Phase 3
//      Sub-Arc 2: CONVERSATION_LEARNING, TASK_LEARNING, WORK_PATTERN,
//      COMMUNICATION_PREF, etc.) that have NOT been priced yet —
//      pricing decisions are Founder-authorized policy and require
//      explicit values, not implicit defaults. Consumers MUST use
//      `PRICING_TABLE[type] ?? 0` so unpriced capsule types collapse
//      to "no payout" rather than NaN / undefined arithmetic.
export const PRICING_TABLE: Partial<Record<CapsuleType, number>> = {
  FOUNDATIONAL: 0,
  PREFERENCE: 0.001,
  RELATIONSHIP: 0.0025,
  DOMAIN_KNOWLEDGE: 0.002,
  BEHAVIORAL_PATTERN: 0.0012,
  IDENTITY: 0.005,
  DEVICE_DATA: 0.0018,
  SESSION_LEARNING: 0.001,
  COMPLIANCE_RECORD: 0.003,
};

// WHAT: The protocol's revenue split between the wallet holder
//        (the entity whose data is being accessed) and NIOV.
// INPUT: Used as constants.
// OUTPUT: Numbers in 0..1.
// WHY: Spec says 70/30 default with floor / ceiling guard rails.
//      Future config table will store live values; the floors and
//      ceilings will then be enforced at write time.
export const HOLDER_SHARE = 0.7;
export const NIOV_FEE_SHARE = 0.3;
export const HOLDER_SHARE_FLOOR = 0.5;
export const HOLDER_SHARE_CEILING = 0.9;
export const NIOV_FEE_FLOOR = 0.1;
export const NIOV_FEE_CEILING = 0.5;

// WHAT: Maximum retries before a FAILED event becomes
//        PERMANENTLY_FAILED.
// INPUT: Used as a constant.
// OUTPUT: A number.
// WHY: Spec: "After 10 failures: status = PERMANENTLY_FAILED".
export const MAX_RETRIES = 10;

// WHAT: Maximum page size for the wallet history endpoint.
// INPUT: Used as a constant.
// OUTPUT: A number.
// WHY: Same convention as the audit-events history (Section 1E).
export const MAX_HISTORY_PAGE_SIZE = 100;

// WHAT: Round a USD amount to 6 decimal places.
// INPUT: A number.
// OUTPUT: A number rounded to 6 decimals.
// WHY: We use Float for currency (MVP). Rounding at the storage
//      boundary keeps small drifts from compounding over many
//      events.
function roundUsd(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}

// WHAT: The shape of a single trigger result.
// INPUT: Used as a return type only.
// OUTPUT: None.
// WHY: Tests want to confirm WHY a trigger was skipped vs
//      processed (event row written) vs failed.
export interface TriggerResult {
  ok: boolean;
  reason?: "MONETIZATION_DISABLED" | "CAPSULE_NOT_FOUND" | "ZERO_VALUE";
  event_id?: string;
  gross_value_usd?: number;
  niov_fee_usd?: number;
  holder_share_usd?: number;
}

// WHAT: The shape of a getBalance success response.
// INPUT: Used as a return type only.
// OUTPUT: None.
// WHY: Routes return both the row and a derived total for UI
//      convenience.
export interface BalanceResult {
  ok: true;
  available_balance_usd: number;
  pending_balance_usd: number;
  lifetime_earned_usd: number;
  total_holdings_usd: number;
}

// WHAT: The shape of a getHistory page.
// INPUT: Used as a return type only.
// OUTPUT: None.
// WHY: Standard pager shape (events + page + page_size + total).
export interface HistoryResult {
  ok: true;
  events: MonetizationEvent[];
  page: number;
  page_size: number;
  total: number;
}

// WHAT: The shape of a toggleMonetization success.
// INPUT: Used as a return type only.
// OUTPUT: None.
// WHY: Caller wants to know what the field is now.
export interface ToggleResult {
  ok: true;
  capsule_id: string;
  monetization_enabled: boolean;
}

// WHAT: Failure shape for wallet routes (auth-class + ownership).
// INPUT: Used as a return type only.
// OUTPUT: None.
// WHY: Routes need to map specific codes to HTTP status.
export interface WalletFailure {
  ok: false;
  code:
    | "SESSION_INVALID"
    | "SESSION_EXPIRED"
    | "SESSION_REVOKED"
    | "SESSION_INVALIDATED"
    | "OPERATION_NOT_PERMITTED"
    | "CAPSULE_NOT_FOUND"
    | "NOT_CAPSULE_OWNER"
    | "INVALID_REQUEST";
  message: string;
}

// WHAT: The class that orchestrates monetization flows.
// INPUT: AuthService (validates wallet-route sessions).
// OUTPUT: A class with five methods.
// WHY: Constructor injection keeps tests cleanly composable.
export class MonetizationService {
  constructor(private readonly authService: AuthService) {}

  // WHAT: Record one access-pay event and credit the wallet
  //        holder's pending_balance.
  // INPUT: capsule_id, accessor_entity_id.
  // OUTPUT: TriggerResult.
  // WHY: Called from the readContent route's setImmediate so it
  //      executes AFTER the response is sent. Returns immediately
  //      when monetization is disabled or the capsule is missing.
  //      All DB writes happen in one transaction so balance and
  //      event row stay consistent.
  async triggerMonetizationEvent(
    capsuleId: string,
    accessorEntityId: string,
  ): Promise<TriggerResult> {
    const capsule = await prisma.memoryCapsule.findUnique({
      where: { capsule_id: capsuleId },
      select: {
        capsule_id: true,
        capsule_type: true,
        entity_id: true,
        monetization_enabled: true,
      },
    });
    if (capsule === null) {
      return { ok: false, reason: "CAPSULE_NOT_FOUND" };
    }
    if (!capsule.monetization_enabled) {
      return { ok: false, reason: "MONETIZATION_DISABLED" };
    }

    // PRICING_TABLE is `Partial<Record<CapsuleType, number>>` — unpriced
    // capsule types collapse to 0 ("no payout") rather than NaN. Same
    // collapse path as ZERO_VALUE: we do not write an event row.
    const gross = PRICING_TABLE[capsule.capsule_type] ?? 0;
    if (gross <= 0) {
      // FOUNDATIONAL, any unpriced new CapsuleType, or any future
      // zero-priced type. We do not even write an event row for these.
      return { ok: false, reason: "ZERO_VALUE" };
    }
    const niovFee = roundUsd(gross * NIOV_FEE_SHARE);
    const holderShare = roundUsd(gross - niovFee);

    try {
      const event = await prisma.$transaction(async (tx) => {
        const created = await tx.monetizationEvent.create({
          data: {
            capsule_id: capsule.capsule_id,
            accessor_entity_id: accessorEntityId,
            wallet_holder_entity_id: capsule.entity_id,
            capsule_type: capsule.capsule_type,
            gross_value_usd: gross,
            niov_fee_usd: niovFee,
            holder_share_usd: holderShare,
            status: "PROCESSED",
            processed_at: new Date(),
          },
        });

        // upsert WalletBalance for the holder. pending and
        // lifetime_earned both bump by holder_share.
        await tx.walletBalance.upsert({
          where: { entity_id: capsule.entity_id },
          update: {
            pending_balance_usd: { increment: holderShare },
            lifetime_earned_usd: { increment: holderShare },
          },
          create: {
            entity_id: capsule.entity_id,
            available_balance_usd: 0,
            pending_balance_usd: holderShare,
            lifetime_earned_usd: holderShare,
          },
        });

        return created;
      });

      await writeAuditEvent({
        event_type: "DATA_MONETIZED",
        outcome: "SUCCESS",
        actor_entity_id: accessorEntityId,
        target_entity_id: capsule.entity_id,
        target_capsule_id: capsule.capsule_id,
        details: {
          event_id: event.event_id,
          capsule_type: capsule.capsule_type,
          gross_value_usd: gross,
          niov_fee_usd: niovFee,
          holder_share_usd: holderShare,
        },
      });

      return {
        ok: true,
        event_id: event.event_id,
        gross_value_usd: gross,
        niov_fee_usd: niovFee,
        holder_share_usd: holderShare,
      };
    } catch (err) {
      // Transaction failed -- write a FAILED event for the retry
      // sweep to pick up. We still try to record SOMETHING so the
      // operator can see what got dropped.
      const reason = err instanceof Error ? err.message : "unknown";
      await prisma.monetizationEvent
        .create({
          data: {
            capsule_id: capsule.capsule_id,
            accessor_entity_id: accessorEntityId,
            wallet_holder_entity_id: capsule.entity_id,
            capsule_type: capsule.capsule_type,
            gross_value_usd: gross,
            niov_fee_usd: niovFee,
            holder_share_usd: holderShare,
            status: "FAILED",
            failure_reason: reason,
          },
        })
        .catch(() => {
          // Even the failure log failed -- swallow so the
          // post-response hook doesn't crash the next request.
        });

      await writeAuditEvent({
        event_type: "DATA_MONETIZED",
        outcome: "ERROR",
        actor_entity_id: accessorEntityId,
        target_entity_id: capsule.entity_id,
        target_capsule_id: capsule.capsule_id,
        denial_reason: "MONETIZATION_TX_FAILED",
        details: { reason },
      });
      return { ok: false };
    }
  }

  // WHAT: Sweep through FAILED events under the retry cap and
  //        attempt to mark them PROCESSED. Move events past the
  //        cap to PERMANENTLY_FAILED.
  // INPUT: None.
  // OUTPUT: { processed, permanently_failed }.
  // WHY: Spec step: background job every 5 minutes. Wired into a
  //      cron in a future infra section; for now exposed so tests
  //      can call it directly.
  async processFailedEvents(): Promise<{
    processed: number;
    permanently_failed: number;
  }> {
    const candidates = await prisma.monetizationEvent.findMany({
      where: { status: "FAILED" },
    });

    let processed = 0;
    let permanentlyFailed = 0;

    for (const c of candidates) {
      if (c.retry_count >= MAX_RETRIES) {
        await prisma.monetizationEvent.update({
          where: { event_id: c.event_id },
          data: { status: "PERMANENTLY_FAILED" },
        });
        permanentlyFailed++;
        continue;
      }
      try {
        await prisma.$transaction(async (tx) => {
          await tx.walletBalance.upsert({
            where: { entity_id: c.wallet_holder_entity_id },
            update: {
              pending_balance_usd: { increment: c.holder_share_usd },
              lifetime_earned_usd: { increment: c.holder_share_usd },
            },
            create: {
              entity_id: c.wallet_holder_entity_id,
              available_balance_usd: 0,
              pending_balance_usd: c.holder_share_usd,
              lifetime_earned_usd: c.holder_share_usd,
            },
          });
          await tx.monetizationEvent.update({
            where: { event_id: c.event_id },
            data: {
              status: "PROCESSED",
              processed_at: new Date(),
              retry_count: { increment: 1 },
            },
          });
        });
        processed++;
      } catch (err) {
        const reason = err instanceof Error ? err.message : "unknown";
        await prisma.monetizationEvent.update({
          where: { event_id: c.event_id },
          data: {
            retry_count: { increment: 1 },
            failure_reason: reason,
          },
        });
      }
    }

    await writeAuditEvent({
      event_type: "DATA_MONETIZED",
      outcome: "SUCCESS",
      details: {
        action: "PROCESS_FAILED_SWEEP",
        candidates: candidates.length,
        processed,
        permanently_failed: permanentlyFailed,
      },
    });

    return { processed, permanently_failed: permanentlyFailed };
  }

  // WHAT: Read a wallet's current balance, validating session.
  // INPUT: Session token.
  // OUTPUT: BalanceResult on success.
  // WHY: Backs GET /api/v1/wallet/balance. Returns zeros if no
  //      WalletBalance row exists yet.
  async getBalance(
    sessionToken: string,
  ): Promise<BalanceResult | WalletFailure> {
    const session = await this.authService.validateSession(
      sessionToken,
      "read",
    );
    if (!session.valid) {
      return { ok: false, code: session.code, message: "Balance read denied" };
    }
    const row = await prisma.walletBalance.findUnique({
      where: { entity_id: session.entity_id },
    });
    if (row === null) {
      return {
        ok: true,
        available_balance_usd: 0,
        pending_balance_usd: 0,
        lifetime_earned_usd: 0,
        total_holdings_usd: 0,
      };
    }
    return {
      ok: true,
      available_balance_usd: row.available_balance_usd,
      pending_balance_usd: row.pending_balance_usd,
      lifetime_earned_usd: row.lifetime_earned_usd,
      total_holdings_usd: roundUsd(
        row.available_balance_usd + row.pending_balance_usd,
      ),
    };
  }

  // WHAT: Page through the caller's monetization history.
  // INPUT: Session token, optional page / page_size.
  // OUTPUT: HistoryResult on success.
  // WHY: Backs GET /api/v1/wallet/history. page_size hard-capped
  //      at 100 like the AuditEvent history.
  async getHistory(
    sessionToken: string,
    page = 1,
    pageSize = 50,
  ): Promise<HistoryResult | WalletFailure> {
    const session = await this.authService.validateSession(
      sessionToken,
      "read",
    );
    if (!session.valid) {
      return { ok: false, code: session.code, message: "History read denied" };
    }
    const safeSize = Math.max(1, Math.min(MAX_HISTORY_PAGE_SIZE, pageSize));
    const safePage = Math.max(1, page);
    const where: Prisma.MonetizationEventWhereInput = {
      wallet_holder_entity_id: session.entity_id,
    };
    const [events, total] = await Promise.all([
      prisma.monetizationEvent.findMany({
        where,
        orderBy: { created_at: "desc" },
        skip: (safePage - 1) * safeSize,
        take: safeSize,
      }),
      prisma.monetizationEvent.count({ where }),
    ]);
    return {
      ok: true,
      events,
      page: safePage,
      page_size: safeSize,
      total,
    };
  }

  // WHAT: Flip the monetization_enabled flag on one capsule.
  // INPUT: Session token, capsule_id, the new boolean.
  // OUTPUT: ToggleResult on success.
  // WHY: Capsule owners decide whether each capsule is in the
  //      monetization pool. Permission check: caller MUST own the
  //      capsule (entity_id match).
  async toggleMonetization(
    sessionToken: string,
    capsuleId: string,
    enabled: boolean,
  ): Promise<ToggleResult | WalletFailure> {
    const session = await this.authService.validateSession(
      sessionToken,
      "share",
    );
    if (!session.valid) {
      return { ok: false, code: session.code, message: "Toggle denied" };
    }
    const capsule = await prisma.memoryCapsule.findUnique({
      where: { capsule_id: capsuleId },
      select: { entity_id: true },
    });
    if (capsule === null) {
      return {
        ok: false,
        code: "CAPSULE_NOT_FOUND",
        message: "Capsule not found",
      };
    }
    if (capsule.entity_id !== session.entity_id) {
      return {
        ok: false,
        code: "NOT_CAPSULE_OWNER",
        message: "Only the capsule owner can toggle monetization",
      };
    }
    const updated = await prisma.memoryCapsule.update({
      where: { capsule_id: capsuleId },
      data: { monetization_enabled: enabled },
      select: { capsule_id: true, monetization_enabled: true },
    });

    await writeAuditEvent({
      event_type: "DATA_MONETIZED",
      outcome: "SUCCESS",
      actor_entity_id: session.entity_id,
      target_capsule_id: capsuleId,
      session_id: session.session_id,
      details: {
        action: "TOGGLE",
        monetization_enabled: enabled,
      },
    });

    return {
      ok: true,
      capsule_id: updated.capsule_id,
      monetization_enabled: updated.monetization_enabled,
    };
  }
}

// Re-exported so route handlers can import the type without a
// deeper path.
export type { MonetizationEvent, WalletBalance };
