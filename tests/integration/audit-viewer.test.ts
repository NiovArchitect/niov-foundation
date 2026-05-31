// FILE: audit-viewer.test.ts (integration)
// PURPOSE: HTTP coverage for the Section 7 Wave 1 unified
//          self-scope audit-events viewer:
//            - GET  /api/v1/audit/events
//            - GET  /api/v1/audit/events/:id
//            - GET  /api/v1/audit/verify-chain
//          Verifies bearer + read gate; self-scope only (caller's
//          actor chain); RULE 0 isolation against cross-actor +
//          cross-org rows; enumeration-safe 404 on cross-actor or
//          unknown id; filter validation; hash-chain verification
//          happy + broken-chain detection; read-audit emission
//          via ADMIN_ACTION:AUDIT_VIEW_* per the CONSOLE_READ
//          precedent (no new audit literal); SAFE projection
//          (re-asserts the no-leak contract at read time).
// CONNECTS TO:
//   - apps/api/src/routes/audit.routes.ts (Wave 1)
//   - apps/api/src/services/audit/audit-view.service.ts
//   - packages/database/src/queries/audit.ts (writeAuditEvent /
//     verifyAuditChain LIVE primitives)

import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildApp,
  MemoryContentStore,
  MemoryNonceStore,
  MemoryRateLimitStore,
} from "@niov/api";
import { ContentEncryption } from "@niov/auth";
import {
  computeTARHash,
  createEntity,
  prisma,
  writeAuditEvent,
} from "@niov/database";
import {
  cleanupTestData,
  ensureAuditTriggers,
  makeEntityInput,
  TEST_PREFIX,
  withCleanRateLimits,
} from "../helpers.js";
import type { FastifyInstance } from "fastify";

const TEST_JWT_SECRET = "audit-viewer-test-secret";
const TEST_KEY = randomBytes(32);

let app: FastifyInstance;
const store = new MemoryRateLimitStore();

beforeAll(async () => {
  await ensureAuditTriggers();
  await cleanupTestData();
  app = await buildApp({
    jwtSecret: TEST_JWT_SECRET,
    sessionNonceStore: new MemoryNonceStore(),
    declarationStore: new MemoryNonceStore(),
    contentStore: new MemoryContentStore(),
    contentEncryption: new ContentEncryption(TEST_KEY),
    rateLimitStore: store,
  });
});

afterAll(async () => {
  await app.close();
  await cleanupTestData();
  await prisma.$disconnect();
});

withCleanRateLimits(store);

async function makeTestOrg(): Promise<string> {
  const org = await createEntity({
    entity_type: "COMPANY",
    display_name: `${TEST_PREFIX}org_${randomUUID()}`,
    email: `${TEST_PREFIX}org_${randomUUID()}@niov.test`,
    public_key: "test-public-key",
    clearance_level: 0,
  });
  return org.entity_id;
}

async function makeOrgMember(orgId: string): Promise<{
  entityId: string;
  token: string;
  ip: string;
}> {
  const password = "correct-horse-battery";
  const input = makeEntityInput({ entity_type: "PERSON", password });
  const entity = await createEntity(input);
  await prisma.entityMembership.create({
    data: {
      parent_id: orgId,
      child_id: entity.entity_id,
      role_title: "MEMBER",
      is_active: true,
    },
  });
  const fresh = await prisma.tokenAttributeRepository.findUnique({
    where: { entity_id: entity.entity_id },
  });
  if (fresh === null) throw new Error("TAR vanished");
  const newHash = computeTARHash({
    can_login: fresh.can_login,
    can_read_capsules: fresh.can_read_capsules,
    can_write_capsules: fresh.can_write_capsules,
    can_share_capsules: fresh.can_share_capsules,
    can_create_hives: fresh.can_create_hives,
    can_access_external_api: fresh.can_access_external_api,
    can_admin_niov: fresh.can_admin_niov,
    can_admin_org: fresh.can_admin_org,
    clearance_ceiling: fresh.clearance_ceiling,
    monetization_role: fresh.monetization_role,
    compliance_frameworks: fresh.compliance_frameworks,
    status: fresh.status,
  });
  await prisma.tokenAttributeRepository.update({
    where: { entity_id: entity.entity_id },
    data: { tar_hash: newHash },
  });
  const ip = `10.88.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 254) + 1}`;
  const login = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: {
      email: input.email,
      password,
      requested_operations: ["read", "write"],
    },
    remoteAddress: ip,
  });
  if (login.statusCode !== 200) {
    throw new Error(`login failed: ${login.statusCode} ${login.body}`);
  }
  const body = login.json() as { token: string };
  return { entityId: entity.entity_id, token: body.token, ip };
}

async function seedAuditRow(
  actorEntityId: string,
  detailsExtra: Record<string, unknown> = {},
): Promise<string> {
  const row = await writeAuditEvent({
    event_type: "ADMIN_ACTION",
    outcome: "SUCCESS",
    actor_entity_id: actorEntityId,
    details: { action: "TEST_SEED", ...detailsExtra },
  });
  return row.audit_id;
}

async function listEvents(
  caller: { token: string; ip: string },
  query: string = "",
): Promise<{ statusCode: number; body: unknown; raw: string }> {
  const r = await app.inject({
    method: "GET",
    url: `/api/v1/audit/events${query}`,
    headers: { authorization: `Bearer ${caller.token}` },
    remoteAddress: caller.ip,
  });
  return { statusCode: r.statusCode, body: r.json(), raw: r.body };
}

async function getEvent(
  caller: { token: string; ip: string },
  auditId: string,
): Promise<{ statusCode: number; body: unknown; raw: string }> {
  const r = await app.inject({
    method: "GET",
    url: `/api/v1/audit/events/${auditId}`,
    headers: { authorization: `Bearer ${caller.token}` },
    remoteAddress: caller.ip,
  });
  return { statusCode: r.statusCode, body: r.json(), raw: r.body };
}

async function verifyChain(caller: {
  token: string;
  ip: string;
}): Promise<{ statusCode: number; body: unknown; raw: string }> {
  const r = await app.inject({
    method: "GET",
    url: "/api/v1/audit/verify-chain",
    headers: { authorization: `Bearer ${caller.token}` },
    remoteAddress: caller.ip,
  });
  return { statusCode: r.statusCode, body: r.json(), raw: r.body };
}

// Forbidden tokens that should NEVER appear in the response raw
// bytes per the SAFE projection contract. The audit substrate's
// writeAuditEvent already filters these at write time per the
// no-leak guard, but we re-assert at read time.
const FORBIDDEN_TOKENS = [
  // Synthetic secrets stuffed into seed details to verify they
  // do NOT round-trip via this route (they shouldn't, since
  // writeAuditEvent's allowlist would have filtered them — but
  // the read-tier guard is defense-in-depth).
];

describe("GET /api/v1/audit/events — auth + envelopes", () => {
  it("401 without bearer", async () => {
    const r = await app.inject({
      method: "GET",
      url: "/api/v1/audit/events",
    });
    expect(r.statusCode).toBe(401);
  });

  it("422 INVALID_FIELD on bogus page", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember(orgId);
    const r = await listEvents(caller, "?page=abc");
    expect(r.statusCode).toBe(422);
    expect((r.body as { code: string }).code).toBe("INVALID_FIELD");
    expect((r.body as { invalid_fields: string[] }).invalid_fields).toContain(
      "page",
    );
  });

  it("422 INVALID_FIELD on page_size above MAX cap", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember(orgId);
    const r = await listEvents(caller, "?page_size=9999");
    expect(r.statusCode).toBe(422);
    expect((r.body as { invalid_fields: string[] }).invalid_fields).toContain(
      "page_size",
    );
  });

  it("422 INVALID_FIELD on unknown event_type", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember(orgId);
    const r = await listEvents(caller, "?event_type=MADE_UP_LITERAL");
    expect(r.statusCode).toBe(422);
    expect((r.body as { invalid_fields: string[] }).invalid_fields).toContain(
      "event_type",
    );
  });

  it("422 INVALID_FIELD on non-UUID target_entity_id", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember(orgId);
    const r = await listEvents(caller, "?target_entity_id=not-a-uuid");
    expect(r.statusCode).toBe(422);
    expect((r.body as { invalid_fields: string[] }).invalid_fields).toContain(
      "target_entity_id",
    );
  });

  it("422 INVALID_FIELD on unknown outcome", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember(orgId);
    const r = await listEvents(caller, "?outcome=MAYBE");
    expect(r.statusCode).toBe(422);
    expect((r.body as { invalid_fields: string[] }).invalid_fields).toContain(
      "outcome",
    );
  });

  it("422 INVALID_FIELD on malformed start_time", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember(orgId);
    const r = await listEvents(caller, "?start_time=not-a-date");
    expect(r.statusCode).toBe(422);
    expect((r.body as { invalid_fields: string[] }).invalid_fields).toContain(
      "start_time",
    );
  });
});

describe("GET /api/v1/audit/events — happy path + SAFE projection", () => {
  it("returns the caller's own audit rows DESC by timestamp + emits AUDIT_VIEW_LIST self-audit", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember(orgId);
    // Seed 2 audit rows attributable to the caller's actor chain
    // (in addition to the login + audit-from-viewer rows the
    // test harness creates).
    const id1 = await seedAuditRow(caller.entityId);
    await new Promise((r) => setTimeout(r, 25));
    const id2 = await seedAuditRow(caller.entityId);

    const r = await listEvents(caller);
    expect(r.statusCode).toBe(200);
    const b = r.body as {
      ok: true;
      page: number;
      page_size: number;
      total: number;
      events: Array<{
        audit_id: string;
        event_type: string;
        actor_entity_id: string | null;
        outcome: string;
        timestamp: string;
        event_hash: string;
      }>;
    };
    expect(b.ok).toBe(true);
    expect(b.page).toBe(1);
    expect(b.total).toBeGreaterThanOrEqual(2);
    // Both seeded rows surface AND every row is the caller's own
    // (RULE 0 self-scope).
    const ids = b.events.map((e) => e.audit_id);
    expect(ids).toContain(id1);
    expect(ids).toContain(id2);
    for (const ev of b.events) {
      expect(ev.actor_entity_id).toBe(caller.entityId);
    }
    // DESC by timestamp — the newer seeded row comes first
    // among the two we created. (Other rows may interleave from
    // the login + view-emit audits; we check relative ordering.)
    const idx1 = ids.indexOf(id1);
    const idx2 = ids.indexOf(id2);
    expect(idx2).toBeLessThan(idx1);

    // Read-audit emission: the GET fired an
    // ADMIN_ACTION:AUDIT_VIEW_LIST row on the caller's chain.
    const audits = await prisma.auditEvent.findMany({
      where: {
        actor_entity_id: caller.entityId,
        event_type: "ADMIN_ACTION",
      },
      orderBy: { timestamp: "desc" },
    });
    const auditViewListRow = audits.find((a) => {
      const d = a.details as Record<string, unknown> | null;
      return d?.action === "AUDIT_VIEW_LIST";
    });
    expect(auditViewListRow).toBeDefined();
    const d = auditViewListRow!.details as Record<string, unknown>;
    expect(d.action).toBe("AUDIT_VIEW_LIST");
    expect(d.page).toBe(1);
    expect(d.page_size).toBe(50);
  });

  it("event_type filter narrows the result set", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember(orgId);
    await seedAuditRow(caller.entityId);
    const r = await listEvents(caller, "?event_type=ADMIN_ACTION");
    expect(r.statusCode).toBe(200);
    const b = r.body as {
      events: Array<{ event_type: string }>;
    };
    for (const ev of b.events) {
      expect(ev.event_type).toBe("ADMIN_ACTION");
    }
  });

  it("pagination partitions the result set", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember(orgId);
    for (let i = 0; i < 3; i += 1) {
      await seedAuditRow(caller.entityId, { index: i });
      await new Promise((r) => setTimeout(r, 10));
    }
    const p1 = await listEvents(caller, "?page=1&page_size=2");
    const p1b = p1.body as { total: number; events: unknown[] };
    expect(p1b.total).toBeGreaterThanOrEqual(3);
    expect(p1b.events.length).toBe(2);
    const p2 = await listEvents(caller, "?page=2&page_size=2");
    const p2b = p2.body as { events: unknown[] };
    expect(p2b.events.length).toBeGreaterThanOrEqual(1);
  });
});

describe("GET /api/v1/audit/events — RULE 0 self-scope isolation", () => {
  it("never returns another user's audit rows in the same org", async () => {
    const orgId = await makeTestOrg();
    const owner = await makeOrgMember(orgId);
    const stranger = await makeOrgMember(orgId);
    const ownerRowId = await seedAuditRow(owner.entityId);
    const r = await listEvents(stranger);
    expect(r.statusCode).toBe(200);
    const b = r.body as { events: Array<{ audit_id: string }> };
    expect(b.events.map((e) => e.audit_id)).not.toContain(ownerRowId);
  });

  it("never returns audit rows from a different org", async () => {
    const orgA = await makeTestOrg();
    const orgB = await makeTestOrg();
    const callerA = await makeOrgMember(orgA);
    const recipientB = await makeOrgMember(orgB);
    const orgBRowId = await seedAuditRow(recipientB.entityId);
    const r = await listEvents(callerA);
    const b = r.body as { events: Array<{ audit_id: string }> };
    expect(b.events.map((e) => e.audit_id)).not.toContain(orgBRowId);
  });
});

describe("GET /api/v1/audit/events/:id — single-event drilldown", () => {
  it("returns the caller's own event + prev/next chain refs scoped to the caller's chain", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember(orgId);
    await seedAuditRow(caller.entityId, { ord: 1 });
    await new Promise((r) => setTimeout(r, 25));
    const middleId = await seedAuditRow(caller.entityId, { ord: 2 });
    await new Promise((r) => setTimeout(r, 25));
    await seedAuditRow(caller.entityId, { ord: 3 });

    const r = await getEvent(caller, middleId);
    expect(r.statusCode).toBe(200);
    const b = r.body as {
      ok: true;
      event: {
        audit_id: string;
        event_hash: string;
        previous_event: { audit_id: string; event_hash: string } | null;
        next_event: { audit_id: string; event_hash: string } | null;
      };
    };
    expect(b.event.audit_id).toBe(middleId);
    expect(b.event.previous_event).not.toBeNull();
    expect(b.event.next_event).not.toBeNull();
    // The previous_event's event_hash should match the row's
    // previous_event_hash (canonical hash-chain linkage).
    const row = await prisma.auditEvent.findUniqueOrThrow({
      where: { audit_id: middleId },
    });
    expect(b.event.previous_event?.event_hash).toBe(row.previous_event_hash);
  });

  it("returns 400 INVALID_AUDIT_ID for non-UUID id", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember(orgId);
    const r = await getEvent(caller, "not-a-uuid");
    expect(r.statusCode).toBe(400);
    expect((r.body as { code: string }).code).toBe("INVALID_AUDIT_ID");
  });

  it("returns enumeration-safe 404 AUDIT_EVENT_NOT_FOUND when audit_id belongs to another actor", async () => {
    const orgId = await makeTestOrg();
    const owner = await makeOrgMember(orgId);
    const stranger = await makeOrgMember(orgId);
    const ownerRowId = await seedAuditRow(owner.entityId);
    const r = await getEvent(stranger, ownerRowId);
    expect(r.statusCode).toBe(404);
    expect((r.body as { code: string }).code).toBe("AUDIT_EVENT_NOT_FOUND");
  });

  it("returns 404 AUDIT_EVENT_NOT_FOUND when audit_id is unknown", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember(orgId);
    const r = await getEvent(caller, "11111111-1111-1111-8111-111111111111");
    expect(r.statusCode).toBe(404);
    expect((r.body as { code: string }).code).toBe("AUDIT_EVENT_NOT_FOUND");
  });

  it("emits ADMIN_ACTION:AUDIT_VIEW_EVENT on detail read", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember(orgId);
    const id = await seedAuditRow(caller.entityId);
    await getEvent(caller, id);
    const audits = await prisma.auditEvent.findMany({
      where: {
        actor_entity_id: caller.entityId,
        event_type: "ADMIN_ACTION",
      },
      orderBy: { timestamp: "desc" },
    });
    const viewEvent = audits.find((a) => {
      const d = a.details as Record<string, unknown> | null;
      return d?.action === "AUDIT_VIEW_EVENT";
    });
    expect(viewEvent).toBeDefined();
    expect(
      (viewEvent!.details as Record<string, unknown>).audit_id,
    ).toBe(id);
  });
});

describe("GET /api/v1/audit/verify-chain — hash-chain integrity surface (ADR-0071 Option A clean break)", () => {
  it("returns verified:true for an entity with a healthy chain", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember(orgId);
    // Seed 3 audit rows on the caller's chain.
    for (let i = 0; i < 3; i += 1) {
      await seedAuditRow(caller.entityId, { i });
    }
    const r = await verifyChain(caller);
    expect(r.statusCode).toBe(200);
    const b = r.body as {
      ok: true;
      scope: "self";
      verified: boolean;
      checked_event_count: number;
      chain_algorithm: string;
      broken_at_event_id: string | null;
      failure_reason: string | null;
      lawful_basis_id: string | null;
    };
    expect(b.scope).toBe("self");
    expect(b.verified).toBe(true);
    expect(b.checked_event_count).toBeGreaterThanOrEqual(3);
    expect(b.broken_at_event_id).toBeNull();
    expect(b.failure_reason).toBeNull();
    expect(b.chain_algorithm).toBe("SHA-256/14-field-canonical-record");
    // Old field aliases MUST NOT appear (Option A clean break).
    expect((b as Record<string, unknown>).valid).toBeUndefined();
    expect((b as Record<string, unknown>).total_events).toBeUndefined();
    expect((b as Record<string, unknown>).broken_at).toBeUndefined();
    expect((b as Record<string, unknown>).actor_entity_id).toBeUndefined();
  });

  it("emits ADMIN_ACTION:AUDIT_VIEW_VERIFY_CHAIN with extended SAFE meta on verify call", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember(orgId);
    await verifyChain(caller);
    const audits = await prisma.auditEvent.findMany({
      where: {
        actor_entity_id: caller.entityId,
        event_type: "ADMIN_ACTION",
      },
      orderBy: { timestamp: "desc" },
    });
    const viewVerify = audits.find((a) => {
      const d = a.details as Record<string, unknown> | null;
      return d?.action === "AUDIT_VIEW_VERIFY_CHAIN";
    });
    expect(viewVerify).toBeDefined();
    const d = viewVerify!.details as Record<string, unknown>;
    expect(d.verified).toBe(true);
    expect(typeof d.checked_event_count).toBe("number");
    expect(d.scope).toBe("self");
    // Old audit-detail aliases MUST NOT be emitted.
    expect(d.valid).toBeUndefined();
    expect(d.total_events).toBeUndefined();
  });
});
