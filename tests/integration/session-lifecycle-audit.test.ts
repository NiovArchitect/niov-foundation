// FILE: session-lifecycle-audit.test.ts (integration)
// PURPOSE: GOVSEC.2A / GAP-G1 -- prove that validateSession failure branches
//          emit the modern hash-chained session-lifecycle audit literals
//          (SESSION_EXPIRED / SESSION_REVOKED) on the actor's own chain through
//          the real HTTP auth path (GET /api/v1/auth/validate behind
//          requireAuth), that the success path and malformed-token path emit
//          nothing, that emitted details carry only safe class metadata, and
//          that the append-only hash chain remains verifiable (verifyAuditChain).
// CONNECTS TO: buildApp + requireAuth -> AuthService.validateSession,
//              @niov/database (createEntity / verifyAuditChain / prisma), helpers.
//
// GOVSEC.2A targets the modern audit_events chain ONLY. The legacy audit_logs
// path in packages/database/src/queries/session.ts (writeAudit action) is left
// untouched. SESSION_INVALIDATED branches map to SESSION_REVOKED (no new literal).

import jwt from "jsonwebtoken";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildApp,
  AuthService,
  MemoryNonceStore,
  type LoginResult,
} from "@niov/api";
import {
  createEntity,
  getTARByEntityId,
  verifyAuditChain,
  prisma,
} from "@niov/database";
import { cleanupTestData, ensureAuditTriggers, makeEntityInput } from "../helpers.js";
import type { FastifyInstance } from "fastify";

const TEST_JWT_SECRET = "govsec2a-session-audit-secret-not-for-prod";
const PASSWORD = "govsec2a-correct-horse-battery";
const VALIDATE = "/api/v1/auth/validate";

let app: FastifyInstance;
let seedAuth: AuthService;
let sessionNonceStore: MemoryNonceStore;

interface Seeded {
  entity_id: string;
  session_id: string;
  token: string;
}

async function login(): Promise<Seeded> {
  const input = makeEntityInput({ entity_type: "PERSON", password: PASSWORD });
  const entity = await createEntity(input);
  const result = (await seedAuth.login(input.email!, PASSWORD, ["read", "write"], {
    ip_address: null,
  })) as LoginResult;
  if (!result.ok) throw new Error(`seed login failed: ${JSON.stringify(result)}`);
  return { entity_id: entity.entity_id, session_id: result.session_id, token: result.token };
}

async function getValidate(token: string | null) {
  return app.inject({
    method: "GET",
    url: VALIDATE,
    headers: token === null ? {} : { authorization: `Bearer ${token}` },
  });
}

async function rows(entityId: string, eventType: "SESSION_EXPIRED" | "SESSION_REVOKED") {
  return prisma.auditEvent.findMany({
    where: { actor_entity_id: entityId, event_type: eventType },
    orderBy: { timestamp: "asc" },
  });
}
function lastDetails(r: { details: unknown }[]): Record<string, unknown> {
  return (r[r.length - 1]!.details ?? {}) as Record<string, unknown>;
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

describe("GOVSEC.2A session-lifecycle audit emission (GAP-G1)", () => {
  it("expired token -> 401 and a SESSION_EXPIRED row on the actor chain", async () => {
    const s = await login();
    const tar = await getTARByEntityId(s.entity_id);
    const expiredToken = jwt.sign(
      {
        session_id: s.session_id,
        entity_id: s.entity_id,
        allowed_operations: ["read", "write"],
        clearance_ceiling: 6,
        tar_hash: tar!.tar_hash,
        expires_at: Date.now() - 1000,
        issued_at: Date.now() - 2000,
      },
      TEST_JWT_SECRET,
    );
    const res = await getValidate(expiredToken);
    expect(res.statusCode).toBe(401);
    const r = await rows(s.entity_id, "SESSION_EXPIRED");
    expect(r.length).toBeGreaterThan(0);
    expect(lastDetails(r).reason).toBe("jwt_expired");
    expect(r[r.length - 1]!.outcome).toBe("DENIED");
  });

  it("logged-out / terminated session -> 401 and a SESSION_REVOKED row (reason terminated)", async () => {
    const s = await login();
    await seedAuth.logout(s.session_id, s.entity_id);
    const res = await getValidate(s.token);
    expect(res.statusCode).toBe(401);
    const r = await rows(s.entity_id, "SESSION_REVOKED");
    expect(r.length).toBeGreaterThan(0);
    expect(lastDetails(r).reason).toBe("terminated");
  });

  it("stale TAR-hash token (active session) -> 401 and SESSION_REVOKED with safe subreason tar_hash_mismatch", async () => {
    const s = await login();
    // ACTIVE session + a token whose tar_hash no longer matches the current TAR
    // exercises the TAR-mismatch branch through the real middleware.
    const staleTarToken = jwt.sign(
      {
        session_id: s.session_id,
        entity_id: s.entity_id,
        allowed_operations: ["read", "write"],
        clearance_ceiling: 6,
        tar_hash: "stale-tar-hash-that-does-not-match",
        expires_at: Date.now() + 60_000,
        issued_at: Date.now(),
      },
      TEST_JWT_SECRET,
    );
    const res = await getValidate(staleTarToken);
    expect(res.statusCode).toBe(401);
    const r = await rows(s.entity_id, "SESSION_REVOKED");
    expect(r.length).toBeGreaterThan(0);
    expect(lastDetails(r).reason).toBe("tar_hash_mismatch");
    expect(lastDetails(r).subreason).toBe("tar_hash_mismatch");
  });

  it("malformed token -> 401 and NO session-lifecycle row attributable", async () => {
    const s = await login();
    const beforeExpired = (await rows(s.entity_id, "SESSION_EXPIRED")).length;
    const beforeRevoked = (await rows(s.entity_id, "SESSION_REVOKED")).length;
    const res = await getValidate(`${s.token}tamper`);
    expect(res.statusCode).toBe(401);
    expect((await rows(s.entity_id, "SESSION_EXPIRED")).length).toBe(beforeExpired);
    expect((await rows(s.entity_id, "SESSION_REVOKED")).length).toBe(beforeRevoked);
  });

  it("successful validate -> 200 and NO session-lifecycle row", async () => {
    const s = await login();
    const res = await getValidate(s.token);
    expect(res.statusCode).toBe(200);
    expect((await rows(s.entity_id, "SESSION_EXPIRED")).length).toBe(0);
    expect((await rows(s.entity_id, "SESSION_REVOKED")).length).toBe(0);
  });

  it("emitted details carry only safe class metadata (no token / nonce / tar hash / secret / raw content)", async () => {
    const s = await login();
    await seedAuth.logout(s.session_id, s.entity_id);
    await getValidate(s.token);
    const r = await rows(s.entity_id, "SESSION_REVOKED");
    const details = lastDetails(r);
    expect(Object.keys(details).every((k) => k === "reason" || k === "subreason")).toBe(true);
    const serialized = JSON.stringify(details);
    for (const forbidden of [s.token, "eyJ", "password", "nonce", "tar_hash", "secret", "Bearer"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("verifyAuditChain returns valid:true after session-lifecycle emissions", async () => {
    const s = await login();
    await seedAuth.logout(s.session_id, s.entity_id);
    await getValidate(s.token);
    const result = await verifyAuditChain(s.entity_id);
    expect(result.valid).toBe(true);
    expect(result.totalEvents).toBeGreaterThan(0);
  });

  it("append-only protection holds: a session-lifecycle audit row cannot be UPDATEd", async () => {
    const s = await login();
    await seedAuth.logout(s.session_id, s.entity_id);
    await getValidate(s.token);
    const r = await rows(s.entity_id, "SESSION_REVOKED");
    await expect(
      prisma.auditEvent.update({
        where: { audit_id: r[r.length - 1]!.audit_id },
        data: { outcome: "SUCCESS" },
      }),
    ).rejects.toThrow();
  });
});
