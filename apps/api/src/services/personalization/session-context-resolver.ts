// FILE: session-context-resolver.ts
// PURPOSE: Production SessionContextResolver for the Foundation/COSMP
//          personalization-orchestration substrate (ADR-0048 Phase 3
//          Sub-Arc 3; PERS.5a per Q-PERS.5-δ δ-1). The WorkingSetService
//          (PERS.3) consumes an injected SessionContextResolver to
//          authoritatively derive {entity_id, wallet_id, wallet_type,
//          entity_type, timezone} from a session token — so the Foundation
//          (not the app) owns the personal/enterprise domain determination.
//          This module supplies the production implementation: a session
//          validator (the live AuthService satisfies it structurally) plus
//          an injected WalletContextLookup. The prisma-backed lookup factory
//          is the seam to real storage; the resolver itself is pure
//          coordination over its two injected dependencies, so it is fully
//          unit-testable without a database.
//
//          Q-PERS.5a locks:
//            - δ-1: this is the production resolver; NO route, NO server.ts
//              wiring lands at PERS.5a (route is forward-substrate).
//            - the prisma-backed `prismaWalletContextLookup` factory is
//              integration-exercised at PERS.5b (real login → session →
//              wallet lookup), not unit-tested here.
//
// CONNECTS TO:
//   - apps/api/src/services/personalization/working-set.service.ts
//     (SessionContextResolver / SessionContextSuccess / SessionContextFailure
//     contract this implements)
//   - apps/api/src/services/auth.service.ts (validateSession; AuthService
//     satisfies the SessionValidator seam)
//   - @niov/database (prisma — wallet / entity / entityProfile lookups in
//     the production factory)
//   - docs/architecture/decisions/0048-personalization-orchestration-substrate.md
//     (§Hybrid API Strategy; Q-PERS.5-δ)
//
// The resolver does NO direct I/O — all storage access flows through the
// injected WalletContextLookup. NO audit literal; NO route.

import { prisma } from "@niov/database";
import type { EntityType, WalletType } from "@niov/database";
import type { ValidateFailure, ValidateSuccess } from "../auth.service.js";
import type {
  SessionContextFailure,
  SessionContextResolver,
  SessionContextSuccess,
} from "./working-set.service.js";

// WHAT: The minimal session-validation seam the resolver needs. The live
//        AuthService satisfies this structurally; tests inject a fake.
// INPUT: Used as a type only.
// OUTPUT: None — a type.
// WHY: Depending on a narrow interface (not the AuthService class) keeps
//      the resolver unit-testable without constructing a real AuthService.
export interface SessionValidator {
  validateSession(
    token: string,
    requiredOp: string,
  ): Promise<ValidateSuccess | ValidateFailure>;
}

// WHAT: The storage seam the resolver reads through. Production wires the
//        prisma-backed implementation; tests inject a fake.
// INPUT: Used as a type only.
// OUTPUT: None — a type.
// WHY: Isolating storage behind this interface makes the resolver pure
//      coordination (no DB at unit-test time per Q-PERS.5a) while the real
//      factory is integration-exercised at PERS.5b.
export interface WalletContextLookup {
  walletByEntityId(
    entityId: string,
  ): Promise<{ wallet_id: string; wallet_type: WalletType } | null>;
  entityTypeOf(entityId: string): Promise<EntityType | null>;
  timezoneOf(entityId: string): Promise<string | null>;
}

// WHAT: Build a production SessionContextResolver from a session validator
//        and a wallet-context lookup.
// INPUT: A SessionValidator (e.g. the live AuthService) + a
//        WalletContextLookup (e.g. prismaWalletContextLookup(prisma)).
// OUTPUT: A SessionContextResolver whose resolve() returns the authoritative
//         session context or a fail-closed failure.
// WHY: Q-PERS.5-δ — the Foundation authoritatively resolves the session's
//      established wallet so an app cannot assert its own domain. Fail-closed
//      on an invalid/expired session or a missing wallet (no context leaks).
export function createSessionContextResolver(
  authService: SessionValidator,
  lookup: WalletContextLookup,
): SessionContextResolver {
  return {
    async resolve(
      sessionToken: string,
    ): Promise<SessionContextSuccess | SessionContextFailure> {
      // STEP 1-2 — validate the session; fail closed with the session's own
      // code (a subset of the WorkingSetFailure code space).
      const session = await authService.validateSession(sessionToken, "read");
      if (!session.valid) {
        return { ok: false, code: session.code, message: "Context denied" };
      }

      // STEP 3-4 — resolve the established wallet; a missing wallet is a
      // fail-closed INVALID_REQUEST (mirrors COE.assembleContext).
      const wallet = await lookup.walletByEntityId(session.entity_id);
      if (wallet === null) {
        return {
          ok: false,
          code: "INVALID_REQUEST",
          message: "Entity has no wallet",
        };
      }

      // STEP 5 — entity type (feeds the permission envelope). A missing
      // entity is fail-closed (the wallet implies an entity, but stay strict).
      const entityType = await lookup.entityTypeOf(session.entity_id);
      if (entityType === null) {
        return {
          ok: false,
          code: "INVALID_REQUEST",
          message: "Entity not found",
        };
      }

      // STEP 6 — profile timezone (nullable; the moment resolver falls back
      // to its safe default when absent).
      const timezone = await lookup.timezoneOf(session.entity_id);

      // STEP 7 — authoritative session context.
      return {
        ok: true,
        entity_id: session.entity_id,
        wallet_id: wallet.wallet_id,
        wallet_type: wallet.wallet_type,
        entity_type: entityType,
        timezone,
      };
    },
  };
}

// WHAT: The prisma-backed WalletContextLookup (production storage seam).
// INPUT: A prisma client (defaults to the shared singleton).
// OUTPUT: A WalletContextLookup reading wallet / entity / entityProfile rows.
// WHY: Q-PERS.5-δ — the real storage implementation. Integration-exercised
//      at PERS.5b (real login → session → wallet lookup); not unit-tested at
//      PERS.5a (the resolver's unit tests inject a fake lookup).
export function prismaWalletContextLookup(
  client: typeof prisma = prisma,
): WalletContextLookup {
  return {
    async walletByEntityId(entityId: string) {
      const row = await client.wallet.findUnique({
        where: { entity_id: entityId },
        select: { wallet_id: true, wallet_type: true },
      });
      return row === null
        ? null
        : { wallet_id: row.wallet_id, wallet_type: row.wallet_type };
    },
    async entityTypeOf(entityId: string) {
      const row = await client.entity.findUnique({
        where: { entity_id: entityId },
        select: { entity_type: true },
      });
      return row?.entity_type ?? null;
    },
    async timezoneOf(entityId: string) {
      const row = await client.entityProfile.findUnique({
        where: { entity_id: entityId },
        select: { timezone: true },
      });
      return row?.timezone ?? null;
    },
  };
}
