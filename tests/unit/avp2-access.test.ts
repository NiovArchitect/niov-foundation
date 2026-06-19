// FILE: tests/unit/avp2-access.test.ts (unit)
// PURPOSE: F-1332 — lock the AVP² access pure-path guards: an invalid session
//          short-circuits before any DB work, and a missing access_token is
//          rejected before any ledger lookup.
// CONNECTS TO: apps/api/src/services/foundation/avp2-access.service.ts

import { describe, expect, it } from "vitest";
import { Avp2AccessService } from "../../apps/api/src/services/foundation/avp2-access.service.js";
import type { AuthService } from "../../apps/api/src/services/auth.service.js";

function svcWith(valid: boolean): Avp2AccessService {
  const fakeAuth = {
    validateSession: async () =>
      valid
        ? { valid: true as const, entity_id: "e1", session_id: "s1", clearance_ceiling: 0, allowed_operations: ["write"] }
        : { valid: false as const, code: "SESSION_INVALID" as const },
  } as unknown as AuthService;
  return new Avp2AccessService(fakeAuth);
}

describe("F-1332 AVP² access — pure guards before any DB work", () => {
  it("an invalid session returns the auth code", async () => {
    const result = await svcWith(false).recordAccessForCaller("bad", { access_token: "avp2_x" });
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.code).toBe("SESSION_INVALID");
  });

  it("a missing access_token is rejected (ACCESS_TOKEN_REQUIRED) before any lookup", async () => {
    const result = await svcWith(true).recordAccessForCaller("good", {});
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.code).toBe("ACCESS_TOKEN_REQUIRED");
  });
});
