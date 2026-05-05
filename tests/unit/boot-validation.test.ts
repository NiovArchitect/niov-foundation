// FILE: boot-validation.test.ts (unit)
// PURPOSE: Cover validateBootEnvironment's three baseline behaviors
//          (throws on missing required vars, warns on missing
//          optional, succeeds silently when all good) PLUS the
//          12C.0 Item 5 production-mode cryptographic gates and
//          CRYPTO_CONFIG anchor tests.
// CONNECTS TO: services/boot-validation.ts, packages/auth/src/crypto-config.ts.

import { describe, expect, it, vi } from "vitest";
import { logger, validateBootEnvironment } from "@niov/api";
import { CRYPTO_CONFIG } from "@niov/auth";

describe("validateBootEnvironment", () => {
  it("throws when JWT_SECRET is missing", () => {
    expect(() =>
      validateBootEnvironment({
        DATABASE_URL: "postgres://x",
        REDIS_URL: "https://x",
      }),
    ).toThrow(/JWT_SECRET/);
  });

  it("throws and lists every missing required var when all three absent", () => {
    expect(() => validateBootEnvironment({})).toThrow(
      /JWT_SECRET.*DATABASE_URL.*REDIS_URL|DATABASE_URL.*JWT_SECRET/,
    );
  });

  it("warns (does not throw) when OTZAR_ENTITY_ID is missing but required vars are present", () => {
    // 12C.0 Item 8: emission migrated from console.warn to
    // logger.warn (the shared pino instance from
    // apps/api/src/logger.ts). The spy now intercepts the logger's
    // .warn method directly. The DRIFT 2 Option C invariant test
    // (tests/unit/no-console-in-api-src.test.ts) prevents
    // regression to console.* in apps/api/src.
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});
    expect(() =>
      validateBootEnvironment({
        JWT_SECRET: "x",
        DATABASE_URL: "postgres://x",
        REDIS_URL: "https://x",
      }),
    ).not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringMatching(/OTZAR_ENTITY_ID/),
    );
    warnSpy.mockRestore();
  });
});

// 12C.0 Item 5 anchor tests. CRYPTO_CONFIG is the canonical
// algorithm contract for Foundation; tamper resistance via
// Object.freeze is enforced here. Production-mode crypto gates
// follow the FIPS deployment posture documented in
// docs/FIPS_DEPLOYMENT_POSTURE.md.
describe("CRYPTO_CONFIG -- 12C.0 Item 5 anchor", () => {
  it("⭐ FROZEN-CONFIG ANCHOR: Object.isFrozen(CRYPTO_CONFIG) is true", () => {
    // Tamper resistance for the most security-critical config in
    // Foundation. Future engineers (or LLMs) cannot mutate the
    // config at runtime without breaking this red test.
    expect(Object.isFrozen(CRYPTO_CONFIG)).toBe(true);
  });

  it("JWT_ALGORITHM is HS256 (FIPS-acceptable per NIST SP 800-131A)", () => {
    expect(CRYPTO_CONFIG.JWT_ALGORITHM).toBe("HS256");
  });
});

// 12C.0 Item 5 production-mode cryptographic gates. Test mode
// (NODE_ENV != "production") skips these; the gates exist to fail
// fast in production deployments with insufficient secret entropy
// or missing keys.
describe("validateBootEnvironment -- 12C.0 Item 5 production crypto gates", () => {
  // Construct a baseline production env that passes all gates so
  // each negative test can flip exactly one variable.
  function passingProductionEnv(): NodeJS.ProcessEnv {
    return {
      NODE_ENV: "production",
      // 32-byte (64 hex chars) key meets ENCRYPTION_KEY_REQUIRED_BYTES.
      ENCRYPTION_KEY:
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      // 32+ byte JWT_SECRET meets JWT_SECRET_MIN_BYTES.
      JWT_SECRET: "x".repeat(CRYPTO_CONFIG.JWT_SECRET_MIN_BYTES),
      DATABASE_URL: "postgres://x",
      REDIS_URL: "https://x",
      OTZAR_ENTITY_ID: "00000000-0000-0000-0000-000000000000",
    };
  }

  it("throws when NODE_ENV=production and ENCRYPTION_KEY is unset", () => {
    const env = passingProductionEnv();
    delete env.ENCRYPTION_KEY;
    expect(() => validateBootEnvironment(env)).toThrow(/ENCRYPTION_KEY/);
  });

  it("throws when NODE_ENV=production and ENCRYPTION_KEY is too short", () => {
    const env = passingProductionEnv();
    // 16 bytes (32 hex chars) -- AES-128 length, below 256-bit
    // FIPS 140-3 requirement.
    env.ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef";
    expect(() => validateBootEnvironment(env)).toThrow(
      /ENCRYPTION_KEY must be at least/,
    );
  });

  it("throws when NODE_ENV=production and JWT_SECRET is too short", () => {
    const env = passingProductionEnv();
    // Below CRYPTO_CONFIG.JWT_SECRET_MIN_BYTES.
    env.JWT_SECRET = "x".repeat(CRYPTO_CONFIG.JWT_SECRET_MIN_BYTES - 1);
    expect(() => validateBootEnvironment(env)).toThrow(
      /JWT_SECRET must be at least/,
    );
  });

  it("throws when NODE_ENV=production and BCRYPT_ROUNDS is below the production minimum", () => {
    const env = passingProductionEnv();
    env.BCRYPT_ROUNDS = String(
      CRYPTO_CONFIG.BCRYPT_ROUNDS_MIN_PRODUCTION - 1,
    );
    expect(() => validateBootEnvironment(env)).toThrow(/BCRYPT_ROUNDS/);
  });

  it("passes silently when NODE_ENV=production and all crypto vars meet minima", () => {
    const env = passingProductionEnv();
    expect(() => validateBootEnvironment(env)).not.toThrow();
  });
});
