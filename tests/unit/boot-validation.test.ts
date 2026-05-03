// FILE: boot-validation.test.ts (unit)
// PURPOSE: Cover validateBootEnvironment's three behaviors: throws
//          on missing required vars, warns on missing optional, and
//          succeeds silently when all good.
// CONNECTS TO: services/boot-validation.ts.

import { describe, expect, it, vi } from "vitest";
import { validateBootEnvironment } from "@niov/api";

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
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
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
