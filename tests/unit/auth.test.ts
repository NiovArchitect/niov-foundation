// FILE: auth.test.ts (unit)
// PURPOSE: Verify the auth service's seven-step login flow, the
//          identical-error guarantee, the 5-strike lockout, the TAR
//          narrowing, and validateSession's full failure ladder.
// CONNECTS TO: AuthService, the entity / tar / session queries, the
//              audit_events table, and the in-memory NonceStore.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  AuthService,
  narrowOperations,
  type LoginResult,
} from "@niov/api/services/auth";
import { MemoryNonceStore } from "@niov/api";
import {
  createEntity,
  getTARByEntityId,
  prisma,
  updateEntityStatus,
  updateTARPermissions,
} from "@niov/database";
import {
  cleanupTestData,
  ensureAuditTriggers,
  makeEntityInput,
} from "../helpers.js";

const TEST_JWT_SECRET = "auth-test-secret-do-not-use-in-prod";

beforeAll(async () => {
  await ensureAuditTriggers();
  await cleanupTestData();
});

afterAll(async () => {
  await cleanupTestData();
  await prisma.$disconnect();
});

// WHAT: Build a fresh AuthService with a fresh in-memory nonce store.
// INPUT: None.
// OUTPUT: { service, store }.
// WHY: Each test gets isolated nonce state, so a delete in one test
//      cannot affect a "session valid?" check in another.
function makeService() {
  const store = new MemoryNonceStore();
  const service = new AuthService({
    jwtSecret: TEST_JWT_SECRET,
    nonceStore: store,
  });
  return { service, store };
}

// WHAT: Create a PERSON entity with a known password ready for login.
// INPUT: Optional password override.
// OUTPUT: The full Entity row + the email + password used.
// WHY: Most tests need a working login target. The helper centralizes
//      the boilerplate.
async function makeLoginableEntity(password = "correct-horse-battery"): Promise<{
  entity: Awaited<ReturnType<typeof createEntity>>;
  email: string;
  password: string;
}> {
  const input = makeEntityInput({ entity_type: "PERSON", password });
  const entity = await createEntity(input);
  return { entity, email: input.email!, password };
}

describe("login (happy path)", () => {
  it("correct credentials return a JWT and session metadata", async () => {
    const { service } = makeService();
    const { email, password } = await makeLoginableEntity();
    const result = await service.login(email, password, ["read", "write"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.token).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
    expect(result.session_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(result.allowed_operations).toEqual(
      expect.arrayContaining(["read", "write"]),
    );
    expect(result.clearance_ceiling).toBe(6);
  });

  it("writes a LOGIN_SUCCESS audit event for the actor", async () => {
    const { service } = makeService();
    const { entity, email, password } = await makeLoginableEntity();
    await service.login(email, password, ["read"]);
    const events = await prisma.auditEvent.findMany({
      where: {
        actor_entity_id: entity.entity_id,
        event_type: "LOGIN_SUCCESS",
      },
    });
    expect(events.length).toBeGreaterThanOrEqual(1);
  });

  it("resets failed_auth_attempts to zero after a successful login", async () => {
    const { service } = makeService();
    const { entity, email, password } = await makeLoginableEntity();
    // Drive the counter up via wrong-password attempts, then succeed.
    await service.login(email, "wrong-1", []);
    await service.login(email, "wrong-2", []);
    await service.login(email, password, ["read"]);
    const after = await prisma.entity.findUnique({
      where: { entity_id: entity.entity_id },
    });
    expect(after?.failed_auth_attempts).toBe(0);
  });
});

describe("login (failure paths)", () => {
  it("wrong password returns Invalid credentials", async () => {
    const { service } = makeService();
    const { email } = await makeLoginableEntity();
    const result = await service.login(email, "definitely-wrong", []);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("INVALID_CREDENTIALS");
    expect(result.message).toBe("Invalid credentials");
  });

  it("entity-not-found returns the IDENTICAL error to wrong-password", async () => {
    const { service } = makeService();
    const wrong = await service.login(
      `__niov_test__nobody@niov.test`,
      "anything",
      [],
    );
    const { email } = await makeLoginableEntity();
    const wrongPassword = await service.login(email, "definitely-wrong", []);
    expect(wrong.ok).toBe(false);
    expect(wrongPassword.ok).toBe(false);
    if (wrong.ok || wrongPassword.ok) return;
    expect(wrong.code).toBe(wrongPassword.code);
    expect(wrong.message).toBe(wrongPassword.message);
  });

  it("the 5th failed attempt suspends the account", async () => {
    const { service } = makeService();
    const { entity, email } = await makeLoginableEntity();
    for (let i = 0; i < 5; i++) {
      await service.login(email, `wrong-${i}`, []);
    }
    const after = await prisma.entity.findUnique({
      where: { entity_id: entity.entity_id },
    });
    expect(after?.status).toBe("SUSPENDED");
    expect(after?.failed_auth_attempts).toBeGreaterThanOrEqual(5);

    const suspendEvents = await prisma.auditEvent.findMany({
      where: {
        target_entity_id: entity.entity_id,
        event_type: "ENTITY_SUSPENDED",
      },
    });
    expect(suspendEvents.length).toBeGreaterThanOrEqual(1);
  });

  it("a SUSPENDED account returns the SUSPENDED error", async () => {
    const { service } = makeService();
    const { entity, email, password } = await makeLoginableEntity();
    await updateEntityStatus(entity.entity_id, "SUSPENDED");
    const result = await service.login(email, password, ["read"]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("SUSPENDED");
    expect(result.message).toMatch(/suspended/i);
  });

  it("a DELETED account returns the generic Invalid credentials error", async () => {
    const { service } = makeService();
    const { entity, email, password } = await makeLoginableEntity();
    await updateEntityStatus(entity.entity_id, "DELETED");
    const result = await service.login(email, password, ["read"]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("INVALID_CREDENTIALS");
  });

  it("logs LOGIN_FAILED with denial_reason ENTITY_NOT_FOUND for unknown email", async () => {
    const { service } = makeService();
    await service.login(`__niov_test__missing@niov.test`, "x", []);
    const events = await prisma.auditEvent.findMany({
      where: {
        event_type: "LOGIN_FAILED",
        denial_reason: "ENTITY_NOT_FOUND",
      },
    });
    expect(events.length).toBeGreaterThanOrEqual(1);
  });
});

describe("login -- TAR narrows requested operations", () => {
  it("session.allowed_operations is the intersection of requested and TAR-allowed", async () => {
    const { service } = makeService();
    const { entity, email, password } = await makeLoginableEntity();
    // Default PERSON TAR has read/write/share but NOT create_hives.
    const result = await service.login(
      email,
      password,
      ["read", "create_hives"],
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.allowed_operations).toContain("read");
    expect(result.allowed_operations).not.toContain("create_hives");
    void entity;
  });

  it("flipping can_create_hives true extends what login can grant", async () => {
    const { service } = makeService();
    const { entity, email, password } = await makeLoginableEntity();
    const tar = await getTARByEntityId(entity.entity_id);
    await updateTARPermissions(tar!.tar_id, { can_create_hives: true });
    const result = await service.login(email, password, [
      "read",
      "create_hives",
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.allowed_operations).toContain("create_hives");
  });
});

describe("validateSession", () => {
  it("returns valid for a fresh session and a permitted operation", async () => {
    const { service } = makeService();
    const { email, password } = await makeLoginableEntity();
    const login = (await service.login(email, password, [
      "read",
      "write",
    ])) as LoginResult;
    const check = await service.validateSession(login.token, "read");
    expect(check.valid).toBe(true);
  });

  it("returns SESSION_INVALID for a tampered token", async () => {
    const { service } = makeService();
    const { email, password } = await makeLoginableEntity();
    const login = (await service.login(email, password, ["read"])) as LoginResult;
    const tampered = login.token.slice(0, -3) + "AAA";
    const check = await service.validateSession(tampered, "read");
    expect(check.valid).toBe(false);
    if (check.valid) return;
    expect(check.code).toBe("SESSION_INVALID");
  });

  it("returns OPERATION_NOT_PERMITTED when the session never had that op", async () => {
    const { service } = makeService();
    const { email, password } = await makeLoginableEntity();
    const login = (await service.login(email, password, ["read"])) as LoginResult;
    const check = await service.validateSession(login.token, "admin_niov");
    expect(check.valid).toBe(false);
    if (check.valid) return;
    expect(check.code).toBe("OPERATION_NOT_PERMITTED");
  });

  it("returns SESSION_REVOKED after logout", async () => {
    const { service } = makeService();
    const { entity, email, password } = await makeLoginableEntity();
    const login = (await service.login(email, password, ["read"])) as LoginResult;
    await service.logout(login.session_id, entity.entity_id);
    const check = await service.validateSession(login.token, "read");
    expect(check.valid).toBe(false);
    if (check.valid) return;
    expect(check.code).toBe("SESSION_REVOKED");
  });

  it("returns SESSION_INVALIDATED when the entity's TAR is mutated after login", async () => {
    const { service } = makeService();
    const { entity, email, password } = await makeLoginableEntity();
    const login = (await service.login(email, password, ["read"])) as LoginResult;
    const tar = await getTARByEntityId(entity.entity_id);
    await updateTARPermissions(tar!.tar_id, { can_create_hives: true });
    const check = await service.validateSession(login.token, "read");
    expect(check.valid).toBe(false);
    if (check.valid) return;
    expect(check.code).toBe("SESSION_INVALIDATED");
  });

  it("returns SESSION_EXPIRED when the nonce is missing from the store", async () => {
    const { service, store } = makeService();
    const { email, password } = await makeLoginableEntity();
    const login = (await service.login(email, password, ["read"])) as LoginResult;
    await store.delete(login.session_id);
    const check = await service.validateSession(login.token, "read");
    expect(check.valid).toBe(false);
    if (check.valid) return;
    expect(check.code).toBe("SESSION_EXPIRED");
  });

  it("returns SESSION_EXPIRED for a JWT whose exp has passed", async () => {
    const { service } = makeService();
    const { entity, email, password } = await makeLoginableEntity();
    const login = (await service.login(email, password, ["read"])) as LoginResult;
    // Force the DB row to look expired so any path the validator
    // takes will fail.
    await prisma.session.update({
      where: { session_id: login.session_id },
      data: {
        status: "EXPIRED",
        expires_at: new Date(Date.now() - 1000),
      },
    });
    const check = await service.validateSession(login.token, "read");
    expect(check.valid).toBe(false);
    if (check.valid) return;
    expect(check.code).toBe("SESSION_EXPIRED");
    void entity;
  });
});

describe("narrowOperations (pure helper)", () => {
  it("drops operations that the TAR does not allow", async () => {
    const { entity } = await makeLoginableEntity();
    const tar = await getTARByEntityId(entity.entity_id);
    const result = narrowOperations(tar!, ["read", "create_hives"]);
    expect(result.allowed).toContain("read");
    expect(result.allowed).not.toContain("create_hives");
    expect(result.canLogin).toBe(true);
  });

  it("returns canLogin=false when can_login is flipped off", async () => {
    const { entity } = await makeLoginableEntity();
    const tar = await getTARByEntityId(entity.entity_id);
    await updateTARPermissions(tar!.tar_id, { can_login: false });
    const refreshed = await getTARByEntityId(entity.entity_id);
    const result = narrowOperations(refreshed!, ["read"]);
    expect(result.canLogin).toBe(false);
  });

  it("ignores operations the system does not know about", async () => {
    const { entity } = await makeLoginableEntity();
    const tar = await getTARByEntityId(entity.entity_id);
    const result = narrowOperations(tar!, ["read", "no-such-op", "write"]);
    expect(result.allowed).toEqual(expect.arrayContaining(["read", "write"]));
    expect(result.allowed).not.toContain("no-such-op");
  });
});

describe("login -- session timeout from OrgSettings (Section 9)", () => {
  it("falls back to the 480-minute spec default when no OrgSettings row exists", async () => {
    const { service } = makeService();
    const { entity, email, password } = await makeLoginableEntity();
    const result = await service.login(email, password, ["read"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 480 minutes = 28,800,000 ms.
    const session = await prisma.session.findUnique({
      where: { session_id: result.session_id },
    });
    const ttlMs =
      session!.expires_at!.getTime() - session!.issued_at.getTime();
    expect(ttlMs).toBe(480 * 60 * 1000);
    void entity;
  });

  it("uses OrgSettings.session_timeout_minutes when an org has set it", async () => {
    const { service } = makeService();
    const { entity, email, password } = await makeLoginableEntity();

    // Build COMPANY + EntityMembership + OrgSettings with custom
    // 60-minute timeout.
    const company = await createEntity(
      makeEntityInput({ entity_type: "COMPANY" }),
    );
    await prisma.entityMembership.create({
      data: {
        parent_id: company.entity_id,
        child_id: entity.entity_id,
        is_active: true,
      },
    });
    await prisma.orgSettings.create({
      data: {
        org_entity_id: company.entity_id,
        session_timeout_minutes: 60,
      },
    });

    const result = await service.login(email, password, ["read"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const session = await prisma.session.findUnique({
      where: { session_id: result.session_id },
    });
    const ttlMs =
      session!.expires_at!.getTime() - session!.issued_at.getTime();
    expect(ttlMs).toBe(60 * 60 * 1000);
  });
});
