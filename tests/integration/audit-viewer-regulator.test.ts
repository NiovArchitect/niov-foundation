// FILE: audit-viewer-regulator.test.ts (integration)
// PURPOSE: Section 7 Wave 5 regulator-tier audit access coverage:
//          GET /api/v1/audit/events/regulator-view?lawful_basis_id=...
//          Verifies: bearer + read gate; query validation
//          (lawful_basis_id required UUID); the 9-condition
//          LawfulBasis enforcement chain via the LIVE
//          getActiveLawfulBasisForRegulator primitive (404
//          NOT_FOUND; 403 EXPIRED / NOT_YET_VALID / REVOKED /
//          TARGET_MISMATCH); happy path returns audit rows
//          bound by lawful_basis_id; cross-basis isolation
//          (regulator with basis A cannot see basis B rows);
//          filters AND-narrow; read-audit emission via
//          ADMIN_ACTION:AUDIT_VIEW_REGULATOR (no new audit
//          literal).
// CONNECTS TO:
//   - apps/api/src/routes/audit.routes.ts (Wave 5)
//   - apps/api/src/services/audit/audit-view.service.ts
//   - packages/database/src/queries/lawful-basis.ts (LIVE
//     getActiveLawfulBasisForRegulator)
//   - tests/integration/regulator-cosmp-enforcement.test.ts
//     (LawfulBasis fixture pattern precedent)

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
  computeLawfulBasisChainHash,
  computeTARHash,
  createEntity,
  createLawfulBasis,
  prisma,
  writeAuditEvent,
} from "@niov/database";
import {
  cleanupTestData,
  ensureAuditTriggers,
  makeEntityInput,
  makeRegulatorEntityInput,
  TEST_PREFIX,
  withCleanRateLimits,
} from "../helpers.js";
import type { FastifyInstance } from "fastify";

const TEST_JWT_SECRET = "audit-viewer-regulator-test-secret";
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

// Build a regulator entity + login session. Returns the
// regulator's entity_id + bearer token + IP.
async function makeRegulatorWithLogin(): Promise<{
  entityId: string;
  token: string;
  ip: string;
}> {
  const password = "correct-horse-battery";
  const input = makeRegulatorEntityInput({ password });
  const entity = await createEntity(input);
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
  const ip = `10.93.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 254) + 1}`;
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

// Build a non-regulator PERSON entity + login.
async function makePersonWithLogin(): Promise<{
  entityId: string;
  token: string;
  ip: string;
}> {
  const password = "correct-horse-battery";
  const input = makeEntityInput({ entity_type: "PERSON", password });
  const entity = await createEntity(input);
  const ip = `10.94.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 254) + 1}`;
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

// Land a LawfulBasis grant atomically — creates the LawfulBasis
// row + the REGULATOR_ACCESS_GRANTED audit event + links them.
// This is the direct-substrate analogue of the full
// landGrant() helper at tests/integration/regulator-cosmp-
// enforcement.test.ts, used here to avoid dual-control dance
// for every test fixture.
async function landBasisDirectly(opts: {
  regulatorEntityId: string;
  validFrom?: Date;
  validUntil?: Date;
}): Promise<{ basis_id: string; chain_hash: string }> {
  const valid_from = opts.validFrom ?? new Date(Date.now() - 60 * 1000);
  const valid_until =
    opts.validUntil ?? new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
  const input = {
    basis_type: "SUBPOENA" as const,
    basis_reference: `${TEST_PREFIX}case-${randomUUID()}`,
    jurisdiction_invoked: "US-FEDERAL",
    valid_from,
    valid_until,
  };
  const basis = await createLawfulBasis(input);
  const chain_hash = computeLawfulBasisChainHash(input);
  // Emit the REGULATOR_ACCESS_GRANTED audit event with the
  // basis linked + the chain_hash captured.
  const grantEvent = await writeAuditEvent({
    event_type: "REGULATOR_ACCESS_GRANTED",
    outcome: "SUCCESS",
    actor_entity_id: opts.regulatorEntityId, // self-link OK for fixture
    target_entity_id: opts.regulatorEntityId, // Q4 LOCKED Option α: target IS regulator
    lawful_basis_id: basis.basis_id,
    lawful_basis_chain_hash: chain_hash,
    details: { action: "GRANT_FIXTURE" },
  });
  // Link the LawfulBasis to the grant event for the 9-condition
  // check to find it.
  await prisma.lawfulBasis.update({
    where: { basis_id: basis.basis_id },
    data: { audit_id: grantEvent.audit_id },
  });
  return { basis_id: basis.basis_id, chain_hash };
}

// Seed a regulator-bound audit event row carrying the
// lawful_basis_id (the row would normally be created by a
// regulator-bound action; this fixture short-circuits that
// flow by emitting writeAuditEvent directly).
async function seedRegulatorBoundAuditRow(opts: {
  regulatorEntityId: string;
  lawful_basis_id: string;
  lawful_basis_chain_hash: string;
  eventType?: string;
}): Promise<string> {
  const row = await writeAuditEvent({
    event_type: opts.eventType ?? "ADMIN_ACTION",
    outcome: "SUCCESS",
    actor_entity_id: opts.regulatorEntityId,
    lawful_basis_id: opts.lawful_basis_id,
    lawful_basis_chain_hash: opts.lawful_basis_chain_hash,
    details: { action: "TEST_REGULATOR_BOUND" },
  });
  return row.audit_id;
}

async function regulatorView(
  caller: { token: string; ip: string },
  query: string = "",
): Promise<{ statusCode: number; body: unknown; raw: string }> {
  const r = await app.inject({
    method: "GET",
    url: `/api/v1/audit/events/regulator-view${query}`,
    headers: { authorization: `Bearer ${caller.token}` },
    remoteAddress: caller.ip,
  });
  return { statusCode: r.statusCode, body: r.json(), raw: r.body };
}

describe("GET /api/v1/audit/events/regulator-view — auth + validation", () => {
  it("401 without bearer", async () => {
    const r = await app.inject({
      method: "GET",
      url: "/api/v1/audit/events/regulator-view",
    });
    expect(r.statusCode).toBe(401);
  });

  it("422 INVALID_FIELD when lawful_basis_id is missing", async () => {
    const caller = await makeRegulatorWithLogin();
    const r = await regulatorView(caller);
    expect(r.statusCode).toBe(422);
    expect((r.body as { invalid_fields: string[] }).invalid_fields).toContain(
      "lawful_basis_id",
    );
  });

  it("422 INVALID_FIELD when lawful_basis_id is not a UUID", async () => {
    const caller = await makeRegulatorWithLogin();
    const r = await regulatorView(caller, "?lawful_basis_id=not-a-uuid");
    expect(r.statusCode).toBe(422);
    expect((r.body as { invalid_fields: string[] }).invalid_fields).toContain(
      "lawful_basis_id",
    );
  });
});

describe("GET /api/v1/audit/events/regulator-view — LawfulBasis enforcement gate", () => {
  it("404 LAWFUL_BASIS_NOT_FOUND when basis_id is unknown", async () => {
    const caller = await makeRegulatorWithLogin();
    const r = await regulatorView(
      caller,
      "?lawful_basis_id=11111111-1111-4111-8111-111111111111",
    );
    expect(r.statusCode).toBe(404);
    expect((r.body as { code: string }).code).toBe(
      "LAWFUL_BASIS_NOT_FOUND",
    );
  });

  it("403 LAWFUL_BASIS_EXPIRED when basis past valid_until", async () => {
    const caller = await makeRegulatorWithLogin();
    const past = new Date(Date.now() - 60 * 60 * 1000);
    const pastEnd = new Date(Date.now() - 30 * 60 * 1000);
    const grant = await landBasisDirectly({
      regulatorEntityId: caller.entityId,
      validFrom: past,
      validUntil: pastEnd,
    });
    const r = await regulatorView(
      caller,
      `?lawful_basis_id=${grant.basis_id}`,
    );
    expect(r.statusCode).toBe(403);
    expect((r.body as { code: string }).code).toBe("LAWFUL_BASIS_EXPIRED");
  });

  it("403 LAWFUL_BASIS_NOT_YET_VALID when basis valid_from in future", async () => {
    const caller = await makeRegulatorWithLogin();
    const future = new Date(Date.now() + 60 * 60 * 1000);
    const grant = await landBasisDirectly({
      regulatorEntityId: caller.entityId,
      validFrom: future,
      validUntil: new Date(future.getTime() + 60 * 60 * 1000),
    });
    const r = await regulatorView(
      caller,
      `?lawful_basis_id=${grant.basis_id}`,
    );
    expect(r.statusCode).toBe(403);
    expect((r.body as { code: string }).code).toBe(
      "LAWFUL_BASIS_NOT_YET_VALID",
    );
  });

  it("403 LAWFUL_BASIS_REVOKED when a REGULATOR_ACCESS_REVOKED audit row exists for the basis", async () => {
    const caller = await makeRegulatorWithLogin();
    const grant = await landBasisDirectly({
      regulatorEntityId: caller.entityId,
    });
    // Emit a revoke event tied to the basis.
    await writeAuditEvent({
      event_type: "REGULATOR_ACCESS_REVOKED",
      outcome: "SUCCESS",
      actor_entity_id: caller.entityId,
      target_entity_id: caller.entityId,
      lawful_basis_id: grant.basis_id,
      lawful_basis_chain_hash: grant.chain_hash,
      details: { action: "REVOKE_FIXTURE" },
    });
    const r = await regulatorView(
      caller,
      `?lawful_basis_id=${grant.basis_id}`,
    );
    expect(r.statusCode).toBe(403);
    expect((r.body as { code: string }).code).toBe("LAWFUL_BASIS_REVOKED");
  });

  it("403 REGULATOR_TARGET_MISMATCH when caller is not the regulator the basis was granted to", async () => {
    const regA = await makeRegulatorWithLogin();
    const regB = await makeRegulatorWithLogin();
    const grant = await landBasisDirectly({
      regulatorEntityId: regA.entityId,
    });
    // regB tries to use regA's basis.
    const r = await regulatorView(
      regB,
      `?lawful_basis_id=${grant.basis_id}`,
    );
    expect(r.statusCode).toBe(403);
    expect((r.body as { code: string }).code).toBe(
      "REGULATOR_TARGET_MISMATCH",
    );
  });

  it("403 REGULATOR_TARGET_MISMATCH when a non-regulator PERSON tries to use a basis", async () => {
    const reg = await makeRegulatorWithLogin();
    const person = await makePersonWithLogin();
    const grant = await landBasisDirectly({
      regulatorEntityId: reg.entityId,
    });
    const r = await regulatorView(
      person,
      `?lawful_basis_id=${grant.basis_id}`,
    );
    expect(r.statusCode).toBe(403);
    expect((r.body as { code: string }).code).toBe(
      "REGULATOR_TARGET_MISMATCH",
    );
  });
});

describe("GET /api/v1/audit/events/regulator-view — happy path + cross-basis isolation", () => {
  it("returns audit rows bound to the basis + DESC by timestamp + emits AUDIT_VIEW_REGULATOR", async () => {
    const caller = await makeRegulatorWithLogin();
    const grant = await landBasisDirectly({
      regulatorEntityId: caller.entityId,
    });
    // Seed 2 audit rows carrying the lawful_basis_id.
    const id1 = await seedRegulatorBoundAuditRow({
      regulatorEntityId: caller.entityId,
      lawful_basis_id: grant.basis_id,
      lawful_basis_chain_hash: grant.chain_hash,
    });
    await new Promise((r) => setTimeout(r, 25));
    const id2 = await seedRegulatorBoundAuditRow({
      regulatorEntityId: caller.entityId,
      lawful_basis_id: grant.basis_id,
      lawful_basis_chain_hash: grant.chain_hash,
    });
    const r = await regulatorView(
      caller,
      `?lawful_basis_id=${grant.basis_id}`,
    );
    expect(r.statusCode).toBe(200);
    const b = r.body as {
      ok: true;
      lawful_basis_id: string;
      page: number;
      page_size: number;
      total: number;
      events: Array<{
        audit_id: string;
        lawful_basis_id: string | null;
      }>;
    };
    expect(b.ok).toBe(true);
    expect(b.lawful_basis_id).toBe(grant.basis_id);
    expect(b.total).toBeGreaterThanOrEqual(2);
    const ids = b.events.map((e) => e.audit_id);
    expect(ids).toContain(id1);
    expect(ids).toContain(id2);
    for (const ev of b.events) {
      expect(ev.lawful_basis_id).toBe(grant.basis_id);
    }
    // DESC by timestamp.
    expect(ids.indexOf(id2)).toBeLessThan(ids.indexOf(id1));
    // Read-audit emission.
    const audits = await prisma.auditEvent.findMany({
      where: {
        actor_entity_id: caller.entityId,
        event_type: "ADMIN_ACTION",
      },
      orderBy: { timestamp: "desc" },
    });
    const viewAudit = audits.find((a) => {
      const d = a.details as Record<string, unknown> | null;
      return d?.action === "AUDIT_VIEW_REGULATOR";
    });
    expect(viewAudit).toBeDefined();
    const d = viewAudit!.details as Record<string, unknown>;
    expect(d.lawful_basis_id).toBe(grant.basis_id);
    expect(typeof d.result_count).toBe("number");
  });

  it("never returns rows bound to a different lawful_basis_id (cross-basis isolation)", async () => {
    const regA = await makeRegulatorWithLogin();
    const regB = await makeRegulatorWithLogin();
    const grantA = await landBasisDirectly({
      regulatorEntityId: regA.entityId,
    });
    const grantB = await landBasisDirectly({
      regulatorEntityId: regB.entityId,
    });
    const rowB = await seedRegulatorBoundAuditRow({
      regulatorEntityId: regB.entityId,
      lawful_basis_id: grantB.basis_id,
      lawful_basis_chain_hash: grantB.chain_hash,
    });
    // regA views their own basis; should not see basis B's row.
    const r = await regulatorView(
      regA,
      `?lawful_basis_id=${grantA.basis_id}`,
    );
    expect(r.statusCode).toBe(200);
    const b = r.body as { events: Array<{ audit_id: string }> };
    expect(b.events.map((e) => e.audit_id)).not.toContain(rowB);
  });

  it("event_type filter AND-narrows under regulator scope", async () => {
    const caller = await makeRegulatorWithLogin();
    const grant = await landBasisDirectly({
      regulatorEntityId: caller.entityId,
    });
    await seedRegulatorBoundAuditRow({
      regulatorEntityId: caller.entityId,
      lawful_basis_id: grant.basis_id,
      lawful_basis_chain_hash: grant.chain_hash,
      eventType: "ADMIN_ACTION",
    });
    const r = await regulatorView(
      caller,
      `?lawful_basis_id=${grant.basis_id}&event_type=ADMIN_ACTION`,
    );
    expect(r.statusCode).toBe(200);
    const b = r.body as { events: Array<{ event_type: string }> };
    for (const ev of b.events) {
      expect(ev.event_type).toBe("ADMIN_ACTION");
    }
  });
});
