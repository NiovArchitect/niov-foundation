// FILE: refresh-rotation.test.ts (integration)
// PURPOSE: GOVSEC.3A / GAP-A4 -- prove POST /api/v1/auth/refresh always rotates:
//          it issues a new usable session/token AND revokes the prior session
//          (terminates the old row, deletes the old nonce, records a modern
//          hash-chained SESSION_REVOKED with reason "rotated" / outcome SUCCESS).
//          The old token can no longer be used; replay is denied; a double-
//          refresh chain leaves only the latest token valid; the audit chain
//          stays verifiable and append-only.
// CONNECTS TO: apps/api/src/routes/auth-admin.routes.ts (refresh) + requireAuth ->
//              validateSession; @niov/database (createEntity / verifyAuditChain /
//              prisma); shared jwtSecret + nonce store with a seed AuthService.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildApp,
  AuthService,
  MemoryNonceStore,
  type LoginResult,
} from "@niov/api";
import { createEntity, verifyAuditChain, prisma } from "@niov/database";
import { cleanupTestData, ensureAuditTriggers, makeEntityInput } from "../helpers.js";
import type { FastifyInstance } from "fastify";

const TEST_JWT_SECRET = "govsec3a-refresh-rotation-secret-not-for-prod";
const PASSWORD = "govsec3a-correct-horse-battery";
const REFRESH = "/api/v1/auth/refresh";
const VALIDATE = "/api/v1/auth/validate";

let app: FastifyInstance;
let seedAuth: AuthService;
let sessionNonceStore: MemoryNonceStore;

interface Sess {
  entity_id: string;
  session_id: string;
  token: string;
}

async function login(): Promise<Sess> {
  const input = makeEntityInput({ entity_type: "PERSON", password: PASSWORD });
  const entity = await createEntity(input);
  const res = (await seedAuth.login(input.email!, PASSWORD, ["read", "write"], {
    ip_address: null,
  })) as LoginResult;
  if (!res.ok) throw new Error(`login failed: ${JSON.stringify(res)}`);
  return { entity_id: entity.entity_id, session_id: res.session_id, token: res.token };
}

async function refresh(token: string): Promise<{ status: number; token?: string; session_id?: string }> {
  const res = await app.inject({
    method: "POST",
    url: REFRESH,
    headers: { authorization: `Bearer ${token}` },
  });
  const body = res.json() as { ok: boolean; token?: string; session_id?: string };
  return { status: res.statusCode, token: body.token, session_id: body.session_id };
}

async function validateHttp(token: string): Promise<number> {
  const res = await app.inject({
    method: "GET",
    url: VALIDATE,
    headers: { authorization: `Bearer ${token}` },
  });
  return res.statusCode;
}

async function revokedRows(entityId: string) {
  return prisma.auditEvent.findMany({
    where: { actor_entity_id: entityId, event_type: "SESSION_REVOKED" },
    orderBy: { timestamp: "asc" },
  });
}

beforeAll(async () => {
  await ensureAuditTriggers();
  await cleanupTestData();
  sessionNonceStore = new MemoryNonceStore();
  app = await buildApp({ jwtSecret: TEST_JWT_SECRET, sessionNonceStore });
  seedAuth = new AuthService({ jwtSecret: TEST_JWT_SECRET, nonceStore: sessionNonceStore });
}, 300_000);

afterAll(async () => {
  await app.close();
  await cleanupTestData();
  await prisma.$disconnect();
});

describe("GOVSEC.3A refresh rotation / old-session revocation (GAP-A4)", () => {
  it("refresh returns a new usable token and revokes the prior session", async () => {
    const s = await login();
    const r = await refresh(s.token);
    expect(r.status).toBe(200);
    expect(typeof r.token).toBe("string");
    expect(r.session_id).not.toBe(s.session_id);
    // new token works
    expect(await validateHttp(r.token!)).toBe(200);
    // old token rejected
    expect(await validateHttp(s.token)).toBe(401);
    // old session row TERMINATED
    const oldRow = await prisma.session.findUnique({ where: { session_id: s.session_id } });
    expect(oldRow!.status).toBe("TERMINATED");
  });

  it("emits SESSION_REVOKED (outcome SUCCESS, reason rotated) for the old session, with safe metadata", async () => {
    const s = await login();
    await refresh(s.token);
    const rows = await revokedRows(s.entity_id);
    const row = rows.find((r) => r.session_id === s.session_id);
    expect(row).toBeDefined();
    expect(row!.outcome).toBe("SUCCESS");
    const details = (row!.details ?? {}) as Record<string, unknown>;
    expect(details.reason).toBe("rotated");
    const serialized = JSON.stringify(details);
    for (const forbidden of [s.token, "eyJ", "nonce", "password", "tar_hash", "secret", "Bearer"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("the new session still records SESSION_CREATED", async () => {
    const s = await login();
    const r = await refresh(s.token);
    const created = await prisma.auditEvent.findMany({
      where: { actor_entity_id: s.entity_id, event_type: "SESSION_CREATED", session_id: r.session_id! },
    });
    expect(created.length).toBeGreaterThan(0);
  });

  it("replaying the old token twice still fails (no resurrection)", async () => {
    const s = await login();
    await refresh(s.token);
    expect(await validateHttp(s.token)).toBe(401);
    expect(await validateHttp(s.token)).toBe(401);
    // and the old token cannot itself be refreshed again
    const again = await refresh(s.token);
    expect(again.status).toBe(401);
  });

  it("double-refresh chain: only the latest token works; rotation rows exist for each prior session", async () => {
    const s1 = await login();
    const r2 = await refresh(s1.token);
    expect(r2.status).toBe(200);
    const r3 = await refresh(r2.token!);
    expect(r3.status).toBe(200);
    // token1 + token2 dead; token3 alive
    expect(await validateHttp(s1.token)).toBe(401);
    expect(await validateHttp(r2.token!)).toBe(401);
    expect(await validateHttp(r3.token!)).toBe(200);
    // rotation audit rows exist for session1 and session2
    const rows = await revokedRows(s1.entity_id);
    const ids = rows.map((r) => r.session_id);
    expect(ids).toContain(s1.session_id);
    expect(ids).toContain(r2.session_id);
  });

  it("verifyAuditChain remains valid after rotation, and rotation rows are append-only", async () => {
    const s = await login();
    await refresh(s.token);
    const chain = await verifyAuditChain(s.entity_id);
    expect(chain.valid).toBe(true);
    const rows = await revokedRows(s.entity_id);
    const row = rows.find((r) => r.session_id === s.session_id)!;
    await expect(
      prisma.auditEvent.update({
        where: { audit_id: row.audit_id },
        data: { outcome: "DENIED" },
      }),
    ).rejects.toThrow();
  });
});
