// FILE: session-idle-tracking.test.ts (integration)
// PURPOSE: GOVSEC.3C-A / GAP-A1 -- prove the idle-session ACTIVITY TRACKING
//          substrate (no enforcement): createSession seeds last_activity_at; a
//          successful validateSession touches it (throttled: only when null or
//          older than the threshold); a validate within the throttle window does
//          NOT write; a successful validate still returns valid (no rejection
//          change); a failed validate never touches it; and NO idle audit event
//          is emitted (idle enforcement + SESSION_EXPIRED idle_timeout is 3C-B).
// CONNECTS TO: AuthService.validateSession -> touchSessionActivity (session.ts),
//              the Session.last_activity_at column, @niov/database (prisma).

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AuthService, MemoryNonceStore, type LoginResult } from "@niov/api";
import { createEntity, prisma } from "@niov/database";
import { cleanupTestData, ensureAuditTriggers, makeEntityInput } from "../helpers.js";

const TEST_JWT_SECRET = "govsec3ca-idle-tracking-secret-not-for-prod";
const PASSWORD = "govsec3ca-correct-horse-battery";

function makeAuth(): AuthService {
  return new AuthService({ jwtSecret: TEST_JWT_SECRET, nonceStore: new MemoryNonceStore() });
}

interface Sess {
  entity_id: string;
  session_id: string;
  token: string;
}

async function login(auth: AuthService): Promise<Sess> {
  const input = makeEntityInput({ entity_type: "PERSON", password: PASSWORD });
  const entity = await createEntity(input);
  const res = (await auth.login(input.email!, PASSWORD, ["read", "write"], {
    ip_address: null,
  })) as LoginResult;
  if (!res.ok) throw new Error(`login failed: ${JSON.stringify(res)}`);
  return { entity_id: entity.entity_id, session_id: res.session_id, token: res.token };
}

async function lastActivity(sessionId: string): Promise<Date | null> {
  const row = await prisma.session.findUnique({ where: { session_id: sessionId } });
  return row?.last_activity_at ?? null;
}
async function setLastActivity(sessionId: string, when: Date): Promise<void> {
  await prisma.session.update({ where: { session_id: sessionId }, data: { last_activity_at: when } });
}

beforeAll(async () => {
  await ensureAuditTriggers();
  await cleanupTestData();
}, 300_000);

afterAll(async () => {
  await cleanupTestData();
  await prisma.$disconnect();
});

describe("GOVSEC.3C-A idle-session activity tracking (GAP-A1; no enforcement)", () => {
  it("createSession/login seeds last_activity_at", async () => {
    const auth = makeAuth();
    const s = await login(auth);
    const la = await lastActivity(s.session_id);
    expect(la).not.toBeNull();
    // seeded at/near issuance (within a generous bound)
    expect(Date.now() - la!.getTime()).toBeLessThan(60_000);
  });

  it("a successful validateSession touches last_activity_at when it is stale", async () => {
    const auth = makeAuth();
    const s = await login(auth);
    // age last_activity_at past the 60s throttle window
    await setLastActivity(s.session_id, new Date(Date.now() - 5 * 60_000));
    const before = await lastActivity(s.session_id);
    const check = await auth.validateSession(s.token, "read");
    expect(check.valid).toBe(true);
    const after = await lastActivity(s.session_id);
    expect(after!.getTime()).toBeGreaterThan(before!.getTime());
    expect(Date.now() - after!.getTime()).toBeLessThan(60_000);
  });

  it("a successful validateSession does NOT write within the throttle window", async () => {
    const auth = makeAuth();
    const s = await login(auth);
    await setLastActivity(s.session_id, new Date(Date.now() - 5 * 60_000));
    // first validate updates to ~now
    await auth.validateSession(s.token, "read");
    const t1 = await lastActivity(s.session_id);
    // second validate immediately after is within the throttle window -> no write
    await auth.validateSession(s.token, "read");
    const t2 = await lastActivity(s.session_id);
    expect(t2!.getTime()).toBe(t1!.getTime());
  });

  it("a successful validateSession still returns valid (no rejection-behavior change)", async () => {
    const auth = makeAuth();
    const s = await login(auth);
    const check = await auth.validateSession(s.token, "read");
    expect(check.valid).toBe(true);
    if (check.valid) {
      expect(check.entity_id).toBe(s.entity_id);
      expect(check.session_id).toBe(s.session_id);
    }
  });

  it("a FAILED validateSession does not touch last_activity_at", async () => {
    const auth = makeAuth();
    const s = await login(auth);
    await auth.logout(s.session_id, s.entity_id); // session -> TERMINATED
    await setLastActivity(s.session_id, new Date(Date.now() - 5 * 60_000));
    const before = await lastActivity(s.session_id);
    const check = await auth.validateSession(s.token, "read");
    expect(check.valid).toBe(false); // SESSION_REVOKED (terminated)
    const after = await lastActivity(s.session_id);
    expect(after!.getTime()).toBe(before!.getTime()); // unchanged
  });

  it("no SESSION_EXPIRED idle_timeout audit event is emitted in 3C-A (no enforcement)", async () => {
    const auth = makeAuth();
    const s = await login(auth);
    await setLastActivity(s.session_id, new Date(Date.now() - 60 * 60_000)); // 1h idle
    const check = await auth.validateSession(s.token, "read");
    // 3C-A does NOT enforce idle: a 1h-idle session still validates.
    expect(check.valid).toBe(true);
    const rows = await prisma.auditEvent.findMany({
      where: { actor_entity_id: s.entity_id, event_type: "SESSION_EXPIRED" },
    });
    const idle = rows.filter((r) => {
      const d = (r.details ?? {}) as Record<string, unknown>;
      return d.reason === "idle_timeout";
    });
    expect(idle.length).toBe(0);
  });

  it("activity tracking does not break the session nonce (validate still succeeds after touch)", async () => {
    const auth = makeAuth();
    const s = await login(auth);
    await setLastActivity(s.session_id, new Date(Date.now() - 5 * 60_000));
    await auth.validateSession(s.token, "read"); // touches activity
    // nonce was not refreshed/deleted by tracking -> session remains valid
    const again = await auth.validateSession(s.token, "read");
    expect(again.valid).toBe(true);
  });
});
