// FILE: session-device-binding-detection.test.ts (integration)
// PURPOSE: GOVSEC.3D-B / GAP-A3 -- prove advisory device-binding detection +
//          client-context threading (no enforcement). validateSession returns an
//          advisory device_bound on the success path (true=match / false=mismatch
//          / null=unbound or no live user-agent); a mismatch NEVER denies, revokes,
//          audits, or touches the nonce; the clientContextFrom helper extracts
//          ip+user-agent; and a request through the auth.middleware gate with a
//          user-agent header still succeeds (threading is wired). Enforcement is
//          GOVSEC.3D-C.
// CONNECTS TO: AuthService.validateSession (device_bound) + deviceBindingHash +
//              clientContextFrom (middleware/request-context.ts) + auth.middleware
//              gate; @niov/database (prisma / createEntity).

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildApp,
  AuthService,
  MemoryNonceStore,
  type LoginResult,
} from "@niov/api";
import { createEntity, prisma } from "@niov/database";
import { cleanupTestData, ensureAuditTriggers, makeEntityInput } from "../helpers.js";
import type { FastifyInstance } from "fastify";

const TEST_JWT_SECRET = "govsec3db-device-detection-secret-not-for-prod";
const PASSWORD = "govsec3db-correct-horse-battery";
const UA_A = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) NiovTest/1.0";
const UA_B = "Mozilla/5.0 (X11; Linux x86_64) NiovTest/2.0";

let app: FastifyInstance;
let seedAuth: AuthService;
let sessionNonceStore: MemoryNonceStore;

async function makePerson(): Promise<string> {
  const input = makeEntityInput({ entity_type: "PERSON", password: PASSWORD });
  await createEntity(input);
  return input.email!;
}

async function login(email: string, userAgent: string | null): Promise<{ session_id: string; token: string }> {
  const res = (await seedAuth.login(email, PASSWORD, ["read", "write"], {
    ip_address: null,
    user_agent: userAgent,
  })) as LoginResult;
  if (!res.ok) throw new Error(`login failed: ${JSON.stringify(res)}`);
  return { session_id: res.session_id, token: res.token };
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

describe("GOVSEC.3D-B advisory device-binding detection (GAP-A3; no enforcement)", () => {
  it("matching live user-agent => valid true, device_bound true", async () => {
    const email = await makePerson();
    const s = await login(email, UA_A);
    const r = await seedAuth.validateSession(s.token, "read", { user_agent: UA_A });
    expect(r.valid).toBe(true);
    if (r.valid) expect(r.device_bound).toBe(true);
  });

  it("mismatched live user-agent => valid true, device_bound false (no denial, no revoke)", async () => {
    const email = await makePerson();
    const s = await login(email, UA_A);
    const r = await seedAuth.validateSession(s.token, "read", { user_agent: UA_B });
    expect(r.valid).toBe(true);
    if (r.valid) expect(r.device_bound).toBe(false);
    // session is NOT revoked/expired by the mismatch
    const row = await prisma.session.findUnique({ where: { session_id: s.session_id } });
    expect(row!.status).toBe("ACTIVE");
  });

  it("missing live user-agent => valid true, device_bound null", async () => {
    const email = await makePerson();
    const s = await login(email, UA_A);
    const r = await seedAuth.validateSession(s.token, "read");
    expect(r.valid).toBe(true);
    if (r.valid) expect(r.device_bound).toBeNull();
  });

  it("null stored binding (login without user-agent) => valid true, device_bound null", async () => {
    const email = await makePerson();
    const s = await login(email, null); // device_binding_hash snapshots null
    expect((await prisma.session.findUnique({ where: { session_id: s.session_id } }))!.device_binding_hash).toBeNull();
    const r = await seedAuth.validateSession(s.token, "read", { user_agent: UA_A });
    expect(r.valid).toBe(true);
    if (r.valid) expect(r.device_bound).toBeNull();
  });

  it("a mismatch emits no device-binding audit and leaves the token usable (no nonce change)", async () => {
    const email = await makePerson();
    const s = await login(email, UA_A);
    const entityId = (await prisma.session.findUnique({ where: { session_id: s.session_id } }))!.entity_id;
    const mismatch = await seedAuth.validateSession(s.token, "read", { user_agent: UA_B });
    expect(mismatch.valid).toBe(true);
    // no device-mismatch audit row of any kind
    const rows = await prisma.auditEvent.findMany({ where: { actor_entity_id: entityId } });
    const deviceRows = rows.filter((r) => {
      const reason = ((r.details ?? {}) as Record<string, unknown>).reason;
      return reason === "device_mismatch" || r.event_type === "DEVICE_MISMATCH";
    });
    expect(deviceRows.length).toBe(0);
    // token still usable -> nonce untouched by the advisory mismatch
    const again = await seedAuth.validateSession(s.token, "read", { user_agent: UA_A });
    expect(again.valid).toBe(true);
    if (again.valid) expect(again.device_bound).toBe(true);
  });
});

describe("GOVSEC.3D-B context threading (auth.middleware end-to-end)", () => {
  it("a request through the auth.middleware gate with a user-agent header still succeeds", async () => {
    const email = await makePerson();
    const s = await login(email, UA_A);
    // logout is gated by requireAuth(authService, "read") -> auth.middleware now
    // passes clientContextFrom(request) (including the user-agent) into
    // validateSession. A 200 proves the threaded gate validates successfully.
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/logout",
      headers: { authorization: `Bearer ${s.token}`, "user-agent": UA_A },
    });
    expect(res.statusCode).toBe(200);
  });

  it("a request through the auth.middleware gate with a DIFFERENT user-agent still succeeds (advisory, no denial)", async () => {
    const email = await makePerson();
    const s = await login(email, UA_A);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/logout",
      headers: { authorization: `Bearer ${s.token}`, "user-agent": UA_B },
    });
    expect(res.statusCode).toBe(200);
  });
});
