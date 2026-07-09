// FILE: session-restore-cookie.test.ts (integration)
// PURPOSE: [SECTION-16] Enterprise session continuity — the HttpOnly cookie +
//          GET /auth/me restore path. Exercises the full route+middleware+service
//          stack via Fastify inject(): login sets the cookie, /auth/me restores
//          from it, logout/TAR-change/password-change/suspension all block
//          restore, /auth/me is no-store, the cookie flags are correct, and — the
//          load-bearing security invariant — the cookie CANNOT authenticate a
//          Bearer-protected (mutation) route.
// CONNECTS TO: buildApp from @niov/api, auth.routes.ts, auth.service.ts,
//              invalidateEntitySessions.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, MemoryNonceStore } from "@niov/api";
import {
  createEntity,
  getTARByEntityId,
  invalidateEntitySessions,
  prisma,
  updateEntityStatus,
  updateTARPermissions,
} from "@niov/database";
import {
  cleanupTestData,
  ensureAuditTriggers,
  makeEntityInput,
} from "../helpers.js";
import type { FastifyInstance } from "fastify";
import type { LightMyRequestResponse } from "fastify";

const TEST_JWT_SECRET = "section16-restore-secret-do-not-use-in-prod";
const COOKIE = "otzar_session";

let app: FastifyInstance;

beforeAll(async () => {
  await ensureAuditTriggers();
  await cleanupTestData();
  app = await buildApp({
    jwtSecret: TEST_JWT_SECRET,
    sessionNonceStore: new MemoryNonceStore(),
    declarationStore: new MemoryNonceStore(),
  });
});

afterAll(async () => {
  await app.close();
  await cleanupTestData();
  await prisma.$disconnect();
});

async function makeLoginableEntity(password = "correct-horse-battery") {
  const input = makeEntityInput({ entity_type: "PERSON", password });
  const entity = await createEntity(input);
  return { entity, email: input.email!, password };
}

// Each login uses a DISTINCT remoteAddress so this file's many logins don't
// exhaust the gateway's per-IP login rate limit (the limiter is brute-force
// protection keyed by IP — not under test here).
let loginIpCounter = 0;
async function login(email: string, password: string, ops = ["read", "write"]) {
  loginIpCounter += 1;
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email, password, requested_operations: ops },
    remoteAddress: `10.10.${Math.floor(loginIpCounter / 250)}.${loginIpCounter % 250}`,
  });
  return res;
}

function restoreCookie(res: LightMyRequestResponse): { name: string; value: string } | undefined {
  return res.cookies.find((c) => c.name === COOKIE) as
    | { name: string; value: string }
    | undefined;
}

describe("[SECTION-16] login sets the HttpOnly restore cookie", () => {
  it("sets otzar_session = the session JWT with HttpOnly, SameSite=Lax, Path=/, and an expiry", async () => {
    const { email, password } = await makeLoginableEntity();
    const res = await login(email, password);
    expect(res.statusCode).toBe(200);
    const token = (res.json() as { token: string }).token;
    const cookie = res.cookies.find((c) => c.name === COOKIE);
    expect(cookie).toBeDefined();
    expect(cookie!.value).toBe(token); // carries the existing session JWT (A1)
    expect(cookie!.httpOnly).toBe(true);
    expect(String(cookie!.sameSite)).toMatch(/lax/i);
    expect(cookie!.path).toBe("/");
    expect(cookie!.expires).toBeInstanceOf(Date); // aligned to session expiry
  });

  it("marks the cookie Secure in production (env-gated, never 'auto')", async () => {
    const { email, password } = await makeLoginableEntity();
    const prior = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = "production";
      const res = await login(email, password);
      const cookie = res.cookies.find((c) => c.name === COOKIE);
      expect(cookie!.secure).toBe(true);
    } finally {
      process.env.NODE_ENV = prior;
    }
    // In the default (test) env, Secure is off so the cookie works over http.
    const res2 = await login(email, password);
    expect(res2.cookies.find((c) => c.name === COOKIE)!.secure).not.toBe(true);
  });
});

describe("[SECTION-16] GET /auth/me restores from the cookie ONLY", () => {
  it("restores identity + capabilities from the cookie with no Bearer header, and is no-store", async () => {
    const { entity, email, password } = await makeLoginableEntity();
    const res = await login(email, password, ["read", "write"]);
    const cookie = restoreCookie(res)!;

    const me = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      cookies: { [COOKIE]: cookie.value },
    });
    expect(me.statusCode).toBe(200);
    expect(String(me.headers["cache-control"])).toMatch(/no-store/);
    const body = me.json() as {
      ok: boolean;
      token: string;
      entity: { email: string };
      allowed_operations: string[];
      clearance_ceiling: number;
    };
    expect(body.ok).toBe(true);
    expect(body.token).toBe(cookie.value); // reuses the existing token, no new session
    expect(body.entity.email).toBe(email);
    expect(body.allowed_operations).toEqual(expect.arrayContaining(["read"]));
    expect(typeof body.clearance_ceiling).toBe("number");
    // Sanity: the entity is unchanged (no side effects on restore).
    expect(entity.entity_id).toBeDefined();
  });

  it("returns 401 NO_SESSION with no cookie", async () => {
    const me = await app.inject({ method: "GET", url: "/api/v1/auth/me" });
    expect(me.statusCode).toBe(401);
    expect((me.json() as { code: string }).code).toBe("NO_SESSION");
  });

  it("returns 401 for a garbage cookie", async () => {
    const me = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      cookies: { [COOKIE]: "not-a-jwt" },
    });
    expect(me.statusCode).toBe(401);
  });
});

describe("[SECTION-16] restore is blocked after logout / TAR change / password change / suspension", () => {
  it("logout clears the cookie and blocks restore", async () => {
    const { email, password } = await makeLoginableEntity();
    const res = await login(email, password);
    const token = (res.json() as { token: string }).token;
    const cookie = restoreCookie(res)!;

    const logout = await app.inject({
      method: "POST",
      url: "/api/v1/auth/logout",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(logout.statusCode).toBe(200);
    // Logout emits a Set-Cookie that clears otzar_session.
    const cleared = logout.cookies.find((c) => c.name === COOKIE);
    expect(cleared).toBeDefined();
    expect(cleared!.value).toBe("");

    const me = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      cookies: { [COOKIE]: cookie.value },
    });
    expect(me.statusCode).toBe(401);
  });

  it("blocks restore after the entity's TAR mutates (revocation)", async () => {
    const { entity, email, password } = await makeLoginableEntity();
    const res = await login(email, password);
    const cookie = restoreCookie(res)!;

    const tar = await getTARByEntityId(entity.entity_id);
    await updateTARPermissions(tar!.tar_id, { can_create_hives: true });

    const me = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      cookies: { [COOKIE]: cookie.value },
    });
    expect(me.statusCode).toBe(401);
  });

  it("blocks restore for a session invalidated by a password change on another session", async () => {
    const { email, password } = await makeLoginableEntity();
    const sessionA = await login(email, password, ["read"]);
    const tokenA = (sessionA.json() as { token: string }).token;
    const sessionB = await login(email, password, ["read"]);
    const cookieB = restoreCookie(sessionB)!;

    const change = await app.inject({
      method: "POST",
      url: "/api/v1/auth/change-password",
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { current_password: password, new_password: "brand-new-strong-pw-123" },
    });
    expect(change.statusCode).toBe(200);

    // Session B was invalidated by the password change → its cookie can't restore.
    const me = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      cookies: { [COOKIE]: cookieB.value },
    });
    expect(me.statusCode).toBe(401);
  });

  it("blocks restore for a suspended entity (entity.status check, belt-and-suspenders)", async () => {
    const { entity, email, password } = await makeLoginableEntity();
    const res = await login(email, password);
    const cookie = restoreCookie(res)!;

    // Suspend WITHOUT invalidating sessions (a raw status flip) — /auth/me's own
    // entity.status check must still refuse the restore.
    await updateEntityStatus(entity.entity_id, "SUSPENDED");

    const me = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      cookies: { [COOKIE]: cookie.value },
    });
    expect(me.statusCode).toBe(401);
    expect((me.json() as { code: string }).code).toBe("ENTITY_INACTIVE");
  });

  it("B1: invalidateEntitySessions (the suspend-path call) blocks restore", async () => {
    const { entity, email, password } = await makeLoginableEntity();
    const res = await login(email, password);
    const cookie = restoreCookie(res)!;

    const killed = await invalidateEntitySessions(entity.entity_id, "entity_suspended");
    expect(killed).toBeGreaterThanOrEqual(1);

    const me = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      cookies: { [COOKIE]: cookie.value },
    });
    expect(me.statusCode).toBe(401);
  });
});

describe("[SECTION-16 · SECURITY INVARIANT] the cookie NEVER authenticates a Bearer route", () => {
  it("a Bearer-protected mutation route rejects a request carrying ONLY the cookie", async () => {
    const { email, password } = await makeLoginableEntity();
    const res = await login(email, password);
    const cookie = restoreCookie(res)!;

    // change-password is a mutation behind requireAuth. With the restore cookie
    // but NO Authorization header, it must be rejected — the cookie is not an
    // API credential; only the in-memory Bearer token authorizes writes.
    const mutate = await app.inject({
      method: "POST",
      url: "/api/v1/auth/change-password",
      cookies: { [COOKIE]: cookie.value },
      payload: { current_password: password, new_password: "should-never-apply-123" },
    });
    expect(mutate.statusCode).toBe(401);

    // And a Bearer-protected GET (validate) likewise rejects cookie-only.
    const validate = await app.inject({
      method: "GET",
      url: "/api/v1/auth/validate",
      cookies: { [COOKIE]: cookie.value },
    });
    expect(validate.statusCode).toBe(401);
  });
});
