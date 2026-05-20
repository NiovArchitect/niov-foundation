// FILE: session-context-resolver.test.ts (unit)
// PURPOSE: Cover the production SessionContextResolver at PERS.5a per
//          ADR-0048 Q-PERS.5-δ. Pure coordination over two injected
//          dependencies (a session validator + a wallet-context lookup);
//          no DB. Proves fail-closed on invalid/expired session, fail-closed
//          on missing wallet, and authoritative pass-through of
//          {entity_id, wallet_id, wallet_type, entity_type, timezone} across
//          PERSONAL / ENTERPRISE / DEVICE wallet types. The prisma-backed
//          lookup factory is integration-exercised at PERS.5b, not here.
// CONNECTS TO: apps/api/src/services/personalization/session-context-resolver.ts
//              + working-set.service.ts (SessionContext* contract) via @niov/api.

import { describe, expect, it } from "vitest";
import {
  createSessionContextResolver,
  type SessionValidator,
  type WalletContextLookup,
} from "@niov/api";
import type { WalletType, EntityType } from "@niov/database";

const ENTITY = "33333333-3333-3333-3333-333333333333";
const WALLET = "11111111-1111-1111-1111-111111111111";

function validatorOk(): SessionValidator {
  return {
    async validateSession() {
      return {
        valid: true,
        entity_id: ENTITY,
        session_id: "sess-1",
        clearance_ceiling: 5,
        allowed_operations: ["read"],
      };
    },
  };
}

function validatorFail(
  code:
    | "SESSION_INVALID"
    | "SESSION_EXPIRED"
    | "SESSION_REVOKED"
    | "SESSION_INVALIDATED"
    | "OPERATION_NOT_PERMITTED" = "SESSION_INVALID",
): SessionValidator {
  return {
    async validateSession() {
      return { valid: false, code };
    },
  };
}

function lookupOk(
  walletType: WalletType = "PERSONAL",
  entityType: EntityType = "PERSON",
  timezone: string | null = "America/New_York",
): WalletContextLookup {
  return {
    async walletByEntityId() {
      return { wallet_id: WALLET, wallet_type: walletType };
    },
    async entityTypeOf() {
      return entityType;
    },
    async timezoneOf() {
      return timezone;
    },
  };
}

function lookupNoWallet(): WalletContextLookup {
  return {
    async walletByEntityId() {
      return null;
    },
    async entityTypeOf() {
      return "PERSON";
    },
    async timezoneOf() {
      return null;
    },
  };
}

describe("createSessionContextResolver — fail-closed", () => {
  it("an invalid session fails closed with the session code and no context fields", async () => {
    const r = createSessionContextResolver(validatorFail("SESSION_INVALID"), lookupOk());
    const out = await r.resolve("tok");
    expect(out.ok).toBe(false);
    if (out.ok) throw new Error("unreachable");
    expect(out.code).toBe("SESSION_INVALID");
    expect("entity_id" in out).toBe(false);
    expect("wallet_id" in out).toBe(false);
  });

  it("an expired session passes the session code through", async () => {
    const r = createSessionContextResolver(validatorFail("SESSION_EXPIRED"), lookupOk());
    const out = await r.resolve("tok");
    expect(out.ok).toBe(false);
    if (out.ok) throw new Error("unreachable");
    expect(out.code).toBe("SESSION_EXPIRED");
  });

  it("a missing wallet fails closed with INVALID_REQUEST", async () => {
    const r = createSessionContextResolver(validatorOk(), lookupNoWallet());
    const out = await r.resolve("tok");
    expect(out.ok).toBe(false);
    if (out.ok) throw new Error("unreachable");
    expect(out.code).toBe("INVALID_REQUEST");
  });
});

describe("createSessionContextResolver — authoritative context", () => {
  it("happy path returns the established context from the injected lookup", async () => {
    const r = createSessionContextResolver(validatorOk(), lookupOk("PERSONAL", "PERSON", "Asia/Tokyo"));
    const out = await r.resolve("tok");
    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error("unreachable");
    expect(out.entity_id).toBe(ENTITY);
    expect(out.wallet_id).toBe(WALLET);
    expect(out.wallet_type).toBe("PERSONAL");
    expect(out.entity_type).toBe("PERSON");
    expect(out.timezone).toBe("Asia/Tokyo");
  });

  it("ENTERPRISE wallet_type passes through", async () => {
    const r = createSessionContextResolver(validatorOk(), lookupOk("ENTERPRISE", "COMPANY"));
    const out = await r.resolve("tok");
    if (!out.ok) throw new Error("unreachable");
    expect(out.wallet_type).toBe("ENTERPRISE");
    expect(out.entity_type).toBe("COMPANY");
  });

  it("PERSONAL wallet_type passes through", async () => {
    const r = createSessionContextResolver(validatorOk(), lookupOk("PERSONAL", "PERSON"));
    const out = await r.resolve("tok");
    if (!out.ok) throw new Error("unreachable");
    expect(out.wallet_type).toBe("PERSONAL");
  });

  it("DEVICE wallet_type passes through", async () => {
    const r = createSessionContextResolver(validatorOk(), lookupOk("DEVICE", "DEVICE"));
    const out = await r.resolve("tok");
    if (!out.ok) throw new Error("unreachable");
    expect(out.wallet_type).toBe("DEVICE");
    expect(out.entity_type).toBe("DEVICE");
  });

  it("a null timezone passes through (moment resolver falls back safely)", async () => {
    const r = createSessionContextResolver(validatorOk(), lookupOk("PERSONAL", "PERSON", null));
    const out = await r.resolve("tok");
    if (!out.ok) throw new Error("unreachable");
    expect(out.timezone).toBeNull();
  });
});
