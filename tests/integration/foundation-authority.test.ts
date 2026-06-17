// FILE: foundation-authority.test.ts (integration)
// PURPOSE: Phase 1288-B — HTTP coverage for the Foundation Entity & Authority
//          Envelope. Proves: auth required; GET /foundation/authority/me
//          returns the caller's envelope with the five dimensions; an org
//          admin can read a same-org member's envelope; a NON-admin caller
//          cannot read another entity (403 NOT_AUTHORIZED); a cross-tenant
//          target is fail-closed (403 CROSS_TENANT_FORBIDDEN); and the wire
//          response never leaks password_hash / tar_hash / raw TAR internals.
//          End-to-end via buildApp.
// CONNECTS TO:
//   - apps/api/src/routes/foundation.routes.ts
//   - apps/api/src/services/foundation/authority.service.ts

import { randomUUID, randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildApp,
  MemoryContentStore,
  MemoryNonceStore,
  MemoryRateLimitStore,
} from "@niov/api";
import { ContentEncryption } from "@niov/auth";
import { createEntity, prisma } from "@niov/database";
import {
  cleanupTestData,
  ensureAuditTriggers,
  makeEntityInput,
  TEST_PREFIX,
} from "../helpers.js";
import type { FastifyInstance } from "fastify";

const TEST_JWT_SECRET = "foundation-authority-test-secret";
const TEST_KEY = randomBytes(32);
let app: FastifyInstance;

let ORG_A: string;
let ORG_B: string;
let ADMIN_A_TOKEN: string;
let MEMBER_A_ID: string;
let MEMBER_A_TOKEN: string;
let MEMBER_B_ID: string;

async function loginAs(email: string, password: string): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email, password, requested_operations: ["read", "write"] },
    remoteAddress: "10.98.1.1",
  });
  return (res.json() as { token: string }).token;
}

beforeAll(async () => {
  await ensureAuditTriggers();
  await cleanupTestData();
  app = await buildApp({
    jwtSecret: TEST_JWT_SECRET,
    sessionNonceStore: new MemoryNonceStore(),
    declarationStore: new MemoryNonceStore(),
    contentStore: new MemoryContentStore(),
    contentEncryption: new ContentEncryption(TEST_KEY),
    rateLimitStore: new MemoryRateLimitStore(),
  });

  const orgA = await createEntity({
    entity_type: "COMPANY",
    display_name: `${TEST_PREFIX}orgA_${randomUUID()}`,
    email: `${TEST_PREFIX}orgA_${randomUUID()}@niov.test`,
    public_key: "test-public-key",
    clearance_level: 0,
  });
  ORG_A = orgA.entity_id;
  const orgB = await createEntity({
    entity_type: "COMPANY",
    display_name: `${TEST_PREFIX}orgB_${randomUUID()}`,
    email: `${TEST_PREFIX}orgB_${randomUUID()}@niov.test`,
    public_key: "test-public-key",
    clearance_level: 0,
  });
  ORG_B = orgB.entity_id;

  // Org A admin (can_admin_org).
  const adminPw = "correct-horse-battery-admin";
  const adminInput = makeEntityInput({ entity_type: "PERSON", password: adminPw });
  const admin = await createEntity(adminInput);
  await prisma.tokenAttributeRepository.update({
    where: { entity_id: admin.entity_id },
    data: { can_admin_org: true },
  });
  await prisma.entityMembership.create({
    data: { parent_id: ORG_A, child_id: admin.entity_id, role_title: "ADMIN", is_active: true },
  });

  // Org A ordinary member.
  const memberPw = "correct-horse-battery-member";
  const memberInput = makeEntityInput({ entity_type: "PERSON", password: memberPw });
  const member = await createEntity(memberInput);
  MEMBER_A_ID = member.entity_id;
  await prisma.entityMembership.create({
    data: { parent_id: ORG_A, child_id: member.entity_id, role_title: "MEMBER", is_active: true },
  });

  // Org B member (the cross-tenant target).
  const otherInput = makeEntityInput({ entity_type: "PERSON", password: "x-correct-horse-other" });
  const other = await createEntity(otherInput);
  MEMBER_B_ID = other.entity_id;
  await prisma.entityMembership.create({
    data: { parent_id: ORG_B, child_id: other.entity_id, role_title: "MEMBER", is_active: true },
  });

  ADMIN_A_TOKEN = await loginAs(adminInput.email!, adminPw);
  MEMBER_A_TOKEN = await loginAs(memberInput.email!, memberPw);
});

afterAll(async () => {
  await app.close();
  await cleanupTestData();
  await prisma.$disconnect();
});

function getAuthority(url: string, token: string | null) {
  return app.inject({
    method: "GET",
    url,
    headers: token !== null ? { authorization: `Bearer ${token}` } : {},
  });
}

describe("GET /api/v1/foundation/authority/me", () => {
  it("401s without auth", async () => {
    const res = await getAuthority("/api/v1/foundation/authority/me", null);
    expect(res.statusCode).toBe(401);
  });

  it("returns the caller's envelope with all five authority dimensions", async () => {
    const res = await getAuthority("/api/v1/foundation/authority/me", MEMBER_A_TOKEN);
    expect(res.statusCode).toBe(200);
    const body = res.json() as { ok: boolean; authority: Record<string, unknown> };
    expect(body.ok).toBe(true);
    const a = body.authority;
    expect(a.entity_id).toBe(MEMBER_A_ID);
    expect(a.entity_class).toBe("HUMAN");
    expect(a.is_sovereign).toBe(true);
    expect(a.can_know).toBeDefined();
    expect(a.can_do).toBeDefined();
    expect(a.can_request).toBeDefined();
    expect(a.can_pay).toBeDefined();
    expect(a.requires_approval).toBeDefined();
    expect(a.memory_scope).toBeDefined();
    expect((a.can_pay as { settlement_mode: string }).settlement_mode).toBe("DISABLED");
  });

  it("never leaks password_hash or raw TAR internals on the wire", async () => {
    const res = await getAuthority("/api/v1/foundation/authority/me", MEMBER_A_TOKEN);
    expect(res.payload).not.toContain("password_hash");
    expect(res.payload).not.toContain("tar_hash");
    expect(res.payload).not.toContain("tar_id");
  });
});

describe("GET /api/v1/foundation/entities/:id/authority", () => {
  it("lets an org admin read a same-org member's envelope", async () => {
    const res = await getAuthority(
      `/api/v1/foundation/entities/${MEMBER_A_ID}/authority`,
      ADMIN_A_TOKEN,
    );
    expect(res.statusCode).toBe(200);
    const body = res.json() as { ok: boolean; authority: { entity_id: string } };
    expect(body.ok).toBe(true);
    expect(body.authority.entity_id).toBe(MEMBER_A_ID);
  });

  it("lets any caller read their OWN envelope via the target route", async () => {
    const res = await getAuthority(
      `/api/v1/foundation/entities/${MEMBER_A_ID}/authority`,
      MEMBER_A_TOKEN,
    );
    expect(res.statusCode).toBe(200);
  });

  it("403s when a non-admin tries to read another entity's envelope", async () => {
    const res = await getAuthority(
      `/api/v1/foundation/entities/${MEMBER_B_ID}/authority`,
      MEMBER_A_TOKEN,
    );
    expect(res.statusCode).toBe(403);
    expect((res.json() as { code: string }).code).toBe("NOT_AUTHORIZED");
  });

  it("fail-closes cross-tenant: an admin cannot read an out-of-org entity", async () => {
    const res = await getAuthority(
      `/api/v1/foundation/entities/${MEMBER_B_ID}/authority`,
      ADMIN_A_TOKEN,
    );
    expect(res.statusCode).toBe(403);
    expect((res.json() as { code: string }).code).toBe("CROSS_TENANT_FORBIDDEN");
  });
});
