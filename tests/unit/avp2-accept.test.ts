// FILE: tests/unit/avp2-accept.test.ts (unit)
// PURPOSE: F-1331 — lock the AVP² acceptance pure logic: the access-token hash is
//          deterministic SHA-256 (the ledger stores the hash, never the raw
//          token), and an invalid session short-circuits before any DB work.
// CONNECTS TO: apps/api/src/services/foundation/avp2-accept.service.ts

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  Avp2AcceptService,
  hashAccessToken,
} from "../../apps/api/src/services/foundation/avp2-accept.service.js";
import type { AuthService } from "../../apps/api/src/services/auth.service.js";

describe("F-1331 AVP² acceptance — access-token hashing", () => {
  it("hashAccessToken is SHA-256 hex of the raw token (deterministic)", () => {
    const raw = "avp2_deadbeef";
    const expected = createHash("sha256").update(raw).digest("hex");
    expect(hashAccessToken(raw)).toBe(expected);
    expect(hashAccessToken(raw)).toBe(hashAccessToken(raw));
  });

  it("the hash is not the raw token (one-way; ledger never holds raw)", () => {
    const raw = "avp2_secrettoken";
    expect(hashAccessToken(raw)).not.toBe(raw);
    expect(hashAccessToken(raw).length).toBe(64); // sha256 hex
  });
});

describe("F-1331 AVP² acceptance — auth gate short-circuits before any DB work", () => {
  it("an invalid session returns the auth code and never reads the ledger", async () => {
    const fakeAuth = {
      validateSession: async () => ({ valid: false as const, code: "SESSION_REVOKED" as const }),
    } as unknown as AuthService;
    const svc = new Avp2AcceptService(fakeAuth);
    const result = await svc.acceptQuoteForCaller("bad-token", "quote_x");
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.code).toBe("SESSION_REVOKED");
  });
});
