// FILE: regulator-routes.test.ts (integration)
// PURPOSE: HTTP-level coverage for the REGULATOR access grant + revoke
//          routes per CAR Sub-box 3 sub-phase 5 [SUB-BOX-3-ROUTES].
//          Exercises the full substrate end-to-end against real Postgres:
//          requireAdminCapability(can_admin_niov) + requireDualControl
//          preHandlers, the 5-guard validateRegulatorAccess substrate
//          (REGULATOR ≠ GOVERNMENT correctness-hazard guard per CAR
//          §2.1), the atomic grant transaction (createLawfulBasisInTx +
//          writeAuditEvent + linkLawfulBasisToAuditEventInTx), the
//          audit-event-only revocation model per Q-D + Q1 LOCKED
//          Option α, and the full error taxonomy.
// CONNECTS TO: buildApp (full Fastify wiring), prisma (test seeding +
//              audit/escalation/lawful_basis reads),
//              apps/api/src/routes/regulator.routes.ts (the routes
//              under test), apps/api/src/middleware/dual-control.middleware.ts
//              (the requireDualControl preHandler),
//              apps/api/src/security/privileged-endpoints.ts
//              (REGULATOR_ACCESS_GRANT + REGULATOR_ACCESS_REVOKE
//              descriptors at sub-phase 5),
//              packages/database/src/queries/regulator.ts +
//              lawful-basis.ts (sub-phase 3 substrate),
//              packages/database/src/queries/audit.ts (sub-phase 4 +5
//              substrate including new event_type literals),
//              tests/helpers.ts (makeEntityInput +
//              makeRegulatorEntityInput from sub-phase 3),
//              tests/integration/dual-control-binding-orgs.test.ts (the
//              sibling pattern this file mirrors).
//
// Cleanup discipline: EscalationRequest entity relations have no
// onDelete: Cascade, so this file owns its escalation_requests +
// lawful_bases cleanup, running BEFORE cleanupTestData() (which
// hard-deletes the test-prefixed Entity rows). audit_events are NOT
// cleaned manually here -- cleanupTestData()'s ALTER TRIGGER + DELETE
// path handles them per the existing append-only-trigger workaround.
// LawfulBasis rows are tracked in createdBasisIds + deleted in afterEach
// when present (mirrors the sub-phase 3 lawful-basis.test.ts cleanup
// pattern).

import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  approveEscalationForCaller,
  buildApp,
  createEscalationForCaller,
  dualControlDescription,
  MemoryContentStore,
  MemoryNonceStore,
  MemoryRateLimitStore,
} from "@niov/api";
import { ContentEncryption } from "@niov/auth";
import { computeTARHash, createEntity, prisma } from "@niov/database";
import {
  cleanupTestData,
  ensureAuditTriggers,
  makeEntityInput,
  makeRegulatorEntityInput,
  TEST_PREFIX,
  withCleanRateLimits,
} from "../helpers.js";
import type { FastifyInstance } from "fastify";

const TEST_JWT_SECRET = "regulator-routes-test-secret-do-not-use";
const TEST_KEY = randomBytes(32);
const GRANT_ROUTE = "/api/v1/regulator/access-grants";
const REVOKE_ROUTE = "/api/v1/regulator/access-revocations";
const GRANT_ACTION_TYPE = "REGULATOR_ACCESS_GRANT" as const;
const REVOKE_ACTION_TYPE = "REGULATOR_ACCESS_REVOKE" as const;

let app: FastifyInstance;
const store = new MemoryRateLimitStore();
const createdBasisIds: string[] = [];

// ---------------------------------------------------------------------------
// Cleanup helpers
// ---------------------------------------------------------------------------

async function cleanupTestEscalations(): Promise<void> {
  const testEntities = await prisma.entity.findMany({
    where: { display_name: { startsWith: TEST_PREFIX } },
    select: { entity_id: true },
  });
  const ids = testEntities.map((e) => e.entity_id);
  if (ids.length === 0) return;
  await prisma.escalationRequest.deleteMany({
    where: {
      OR: [
        { source_entity_id: { in: ids } },
        { target_entity_id: { in: ids } },
        { resolved_by_entity_id: { in: ids } },
      ],
    },
  });
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// WHAT: Create + login a PERSON entity with optional can_admin_niov on
//        its TAR. Mirrors dual-control-binding-orgs.test.ts:99 helper.
async function makeAdminAndLogin(opts: {
  can_admin_niov?: boolean;
}): Promise<{ entityId: string; token: string; ip: string }> {
  const password = "correct-horse-battery";
  const input = makeEntityInput({ entity_type: "PERSON", password });
  const entity = await createEntity(input);

  if (opts.can_admin_niov === true) {
    await prisma.tokenAttributeRepository.update({
      where: { entity_id: entity.entity_id },
      data: { can_admin_niov: true },
    });
    const fresh = await prisma.tokenAttributeRepository.findUnique({
      where: { entity_id: entity.entity_id },
    });
    if (fresh === null) throw new Error("TAR vanished mid-test");
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
  }

  const ip = `10.97.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 254) + 1}`;
  const login = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: {
      email: input.email,
      password,
      requested_operations: ["read", "write", "share"],
    },
    remoteAddress: ip,
  });
  if (login.statusCode !== 200) {
    throw new Error(`login failed: ${login.statusCode} ${login.body}`);
  }
  const body = login.json() as { token: string };
  return { entityId: entity.entity_id, token: body.token, ip };
}

// WHAT: Create + approve a dual-control EscalationRequest for the caller
//        on the named action type. caller === target === source so the
//        sub-phase E placeholder skeleton gate permits self-approve.
async function grantApproval(
  callerEntityId: string,
  actionType: typeof GRANT_ACTION_TYPE | typeof REVOKE_ACTION_TYPE,
  expiresAt: Date | null = null,
): Promise<string> {
  const created = await createEscalationForCaller(callerEntityId, {
    target_entity_id: callerEntityId,
    escalation_type: "DUAL_CONTROL_REQUIRED",
    severity: "HIGH",
    description: dualControlDescription(actionType),
    expires_at: expiresAt,
  });
  await approveEscalationForCaller(callerEntityId, created.escalation_id);
  return created.escalation_id;
}

// WHAT: Create a REGULATOR entity with populated TAR credentialing
//        fields (jurisdiction + scope + credentialed_by). Returns the
//        entity_id ready for grant requests.
async function makeRegulatorWithTAR(opts: {
  jurisdictions?: string[];
  scopes?: string[];
  credentialed_by?: string | null;
  status?: "ACTIVE" | "SUSPENDED";
}): Promise<string> {
  const reg = await createEntity(makeRegulatorEntityInput());
  // Use explicit-key check for credentialed_by so a caller can pass
  // `credentialed_by: null` to drive the MISSING_CREDENTIALING test
  // (nullish coalescing would treat null and undefined identically and
  // fall back to the "DOJ" default).
  const credentialedBy =
    "credentialed_by" in opts ? opts.credentialed_by ?? null : "DOJ";
  await prisma.tokenAttributeRepository.update({
    where: { entity_id: reg.entity_id },
    data: {
      regulator_jurisdiction: opts.jurisdictions ?? ["US-FEDERAL"],
      regulator_authority_scope: opts.scopes ?? ["SECURITIES_EXAMINATION"],
      regulator_credentialed_by: credentialedBy,
    },
  });
  if (opts.status === "SUSPENDED") {
    await prisma.entity.update({
      where: { entity_id: reg.entity_id },
      data: { status: "SUSPENDED" },
    });
  }
  return reg.entity_id;
}

// WHAT: Build a fresh, well-formed grant payload for a known REGULATOR.
//        Defaults to a 90-day forward window per Sub-decision 3
//        time-boundedness.
function grantPayload(opts: {
  regulator_entity_id: string;
  basis_type?: string;
  basis_reference?: string;
  jurisdiction_invoked?: string;
  authority_scope?: string;
  valid_from?: Date;
  valid_until?: Date;
}): Record<string, string> {
  const validFrom = opts.valid_from ?? new Date();
  const validUntil =
    opts.valid_until ?? new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
  return {
    regulator_entity_id: opts.regulator_entity_id,
    basis_type: opts.basis_type ?? "SUBPOENA",
    basis_reference: opts.basis_reference ?? `${TEST_PREFIX}case-${randomUUID()}`,
    jurisdiction_invoked: opts.jurisdiction_invoked ?? "US-FEDERAL",
    authority_scope: opts.authority_scope ?? "SECURITIES_EXAMINATION",
    valid_from: validFrom.toISOString(),
    valid_until: validUntil.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

beforeAll(async () => {
  await ensureAuditTriggers();
  await cleanupTestEscalations();
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
  if (createdBasisIds.length > 0) {
    await prisma.lawfulBasis.deleteMany({
      where: { basis_id: { in: createdBasisIds } },
    });
    createdBasisIds.length = 0;
  }
  await cleanupTestEscalations();
  await cleanupTestData();
  await prisma.$disconnect();
});

afterEach(async () => {
  if (createdBasisIds.length > 0) {
    await prisma.lawfulBasis.deleteMany({
      where: { basis_id: { in: createdBasisIds } },
    });
    createdBasisIds.length = 0;
  }
});

withCleanRateLimits(store);

// ---------------------------------------------------------------------------
// Grant route -- happy path + dual-control matrix
// ---------------------------------------------------------------------------

describe("POST /api/v1/regulator/access-grants -- happy path", () => {
  it("creates LawfulBasis + REGULATOR_ACCESS_GRANTED audit event with lawful_basis_id + lawful_basis_chain_hash; backfills audit_id; chain verifies", async () => {
    const admin = await makeAdminAndLogin({ can_admin_niov: true });
    await grantApproval(admin.entityId, GRANT_ACTION_TYPE);
    const regulatorId = await makeRegulatorWithTAR({});

    const res = await app.inject({
      method: "POST",
      url: GRANT_ROUTE,
      headers: { authorization: `Bearer ${admin.token}` },
      payload: grantPayload({ regulator_entity_id: regulatorId }),
      remoteAddress: admin.ip,
    });

    expect(res.statusCode).toBe(201);
    const body = res.json() as {
      ok: boolean;
      basis_id: string;
      audit_id: string;
      event_hash: string;
      valid_until: string;
      status: string;
    };
    expect(body.ok).toBe(true);
    expect(body.status).toBe("GRANTED");
    expect(body.basis_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(body.audit_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(body.event_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(typeof body.valid_until).toBe("string");
    createdBasisIds.push(body.basis_id);

    // LawfulBasis row exists with chain_hash + audit_id backfilled.
    const basis = await prisma.lawfulBasis.findUnique({
      where: { basis_id: body.basis_id },
    });
    expect(basis).not.toBeNull();
    expect(basis?.chain_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(basis?.audit_id).toBe(body.audit_id);

    // AuditEvent row carries lawful_basis_id + lawful_basis_chain_hash
    // at top-level (canonical_record/1 positions 13 + 14 per sub-phase 4).
    const auditRow = await prisma.auditEvent.findUnique({
      where: { audit_id: body.audit_id },
    });
    expect(auditRow).not.toBeNull();
    expect(auditRow?.event_type).toBe("REGULATOR_ACCESS_GRANTED");
    expect(auditRow?.outcome).toBe("SUCCESS");
    expect(auditRow?.actor_entity_id).toBe(admin.entityId);
    expect(auditRow?.target_entity_id).toBe(regulatorId);
    expect(auditRow?.lawful_basis_id).toBe(body.basis_id);
    expect(auditRow?.lawful_basis_chain_hash).toBe(basis?.chain_hash);
    expect(auditRow?.event_hash).toBe(body.event_hash);
  });

  it("returns ONLY safe fields (no raw credentials, capsule content, tenant data, or PII beyond modeled IDs)", async () => {
    const admin = await makeAdminAndLogin({ can_admin_niov: true });
    await grantApproval(admin.entityId, GRANT_ACTION_TYPE);
    const regulatorId = await makeRegulatorWithTAR({});

    const res = await app.inject({
      method: "POST",
      url: GRANT_ROUTE,
      headers: { authorization: `Bearer ${admin.token}` },
      payload: grantPayload({ regulator_entity_id: regulatorId }),
      remoteAddress: admin.ip,
    });

    expect(res.statusCode).toBe(201);
    const body = res.json() as Record<string, unknown>;
    createdBasisIds.push(body.basis_id as string);

    const allowedKeys = new Set([
      "ok",
      "basis_id",
      "audit_id",
      "event_hash",
      "valid_until",
      "status",
    ]);
    for (const key of Object.keys(body)) {
      expect(allowedKeys.has(key)).toBe(true);
    }
    // Defensive negative assertions on key names that would indicate a
    // PII / tenant-data leak.
    for (const forbidden of [
      "password",
      "tar",
      "credentials",
      "capsule",
      "capsules",
      "memory",
      "entity",
      "email",
      "secret",
      "token",
      "details",
    ]) {
      expect(body).not.toHaveProperty(forbidden);
    }
  });
});

describe("POST /api/v1/regulator/access-grants -- dual-control gate", () => {
  it("returns 403 ESCALATION_PENDING when no APPROVED dual-control EscalationRequest exists; auto-creates a PENDING one", async () => {
    const admin = await makeAdminAndLogin({ can_admin_niov: true });
    const regulatorId = await makeRegulatorWithTAR({});

    const res = await app.inject({
      method: "POST",
      url: GRANT_ROUTE,
      headers: { authorization: `Bearer ${admin.token}` },
      payload: grantPayload({ regulator_entity_id: regulatorId }),
      remoteAddress: admin.ip,
    });

    expect(res.statusCode).toBe(403);
    const body = res.json() as { ok: boolean; error: string; escalation_id: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("ESCALATION_PENDING");
    expect(body.escalation_id).toBeTruthy();
  });

  it("returns 403 ADMIN_CAPABILITY_REQUIRED when caller lacks can_admin_niov", async () => {
    const admin = await makeAdminAndLogin({ can_admin_niov: false });
    const regulatorId = await makeRegulatorWithTAR({});

    const res = await app.inject({
      method: "POST",
      url: GRANT_ROUTE,
      headers: { authorization: `Bearer ${admin.token}` },
      payload: grantPayload({ regulator_entity_id: regulatorId }),
      remoteAddress: admin.ip,
    });

    expect(res.statusCode).toBe(403);
    const body = res.json() as { ok: boolean; error?: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("ADMIN_CAPABILITY_REQUIRED");
  });

  it("returns 401 when bearer token is missing", async () => {
    const res = await app.inject({
      method: "POST",
      url: GRANT_ROUTE,
      payload: grantPayload({ regulator_entity_id: randomUUID() }),
    });
    expect(res.statusCode).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Grant route -- REGULATOR validation matrix (5 rejection reasons + 404)
// ---------------------------------------------------------------------------

describe("POST /api/v1/regulator/access-grants -- REGULATOR validation", () => {
  it("rejects GOVERNMENT entity as NOT_REGULATOR (CAR §2.1 correctness-hazard guard)", async () => {
    const admin = await makeAdminAndLogin({ can_admin_niov: true });
    await grantApproval(admin.entityId, GRANT_ACTION_TYPE);
    // Create a GOVERNMENT entity (NOT a REGULATOR).
    const gov = await createEntity(makeEntityInput({ entity_type: "GOVERNMENT" }));

    const res = await app.inject({
      method: "POST",
      url: GRANT_ROUTE,
      headers: { authorization: `Bearer ${admin.token}` },
      payload: grantPayload({ regulator_entity_id: gov.entity_id }),
      remoteAddress: admin.ip,
    });

    // getRegulatorEntityById short-circuits non-REGULATOR entities to
    // null per sub-phase 3 substrate; surfaces as 404 REGULATOR_NOT_FOUND.
    expect(res.statusCode).toBe(404);
    const body = res.json() as { ok: boolean; code: string };
    expect(body.code).toBe("REGULATOR_NOT_FOUND");
  });

  it("rejects PERSON entity as REGULATOR_NOT_FOUND (REGULATOR-only fetch short-circuit)", async () => {
    const admin = await makeAdminAndLogin({ can_admin_niov: true });
    await grantApproval(admin.entityId, GRANT_ACTION_TYPE);
    const person = await createEntity(makeEntityInput({ entity_type: "PERSON" }));

    const res = await app.inject({
      method: "POST",
      url: GRANT_ROUTE,
      headers: { authorization: `Bearer ${admin.token}` },
      payload: grantPayload({ regulator_entity_id: person.entity_id }),
      remoteAddress: admin.ip,
    });

    expect(res.statusCode).toBe(404);
    const body = res.json() as { ok: boolean; code: string };
    expect(body.code).toBe("REGULATOR_NOT_FOUND");
  });

  it("returns 404 REGULATOR_NOT_FOUND for a non-existent regulator_entity_id", async () => {
    const admin = await makeAdminAndLogin({ can_admin_niov: true });
    await grantApproval(admin.entityId, GRANT_ACTION_TYPE);

    const res = await app.inject({
      method: "POST",
      url: GRANT_ROUTE,
      headers: { authorization: `Bearer ${admin.token}` },
      payload: grantPayload({
        regulator_entity_id: "00000000-0000-0000-0000-000000000777",
      }),
      remoteAddress: admin.ip,
    });

    expect(res.statusCode).toBe(404);
    const body = res.json() as { code: string };
    expect(body.code).toBe("REGULATOR_NOT_FOUND");
  });

  it("rejects inactive REGULATOR with 422 ENTITY_NOT_ACTIVE", async () => {
    const admin = await makeAdminAndLogin({ can_admin_niov: true });
    await grantApproval(admin.entityId, GRANT_ACTION_TYPE);
    const regulatorId = await makeRegulatorWithTAR({ status: "SUSPENDED" });

    const res = await app.inject({
      method: "POST",
      url: GRANT_ROUTE,
      headers: { authorization: `Bearer ${admin.token}` },
      payload: grantPayload({ regulator_entity_id: regulatorId }),
      remoteAddress: admin.ip,
    });

    expect(res.statusCode).toBe(422);
    expect((res.json() as { code: string }).code).toBe("ENTITY_NOT_ACTIVE");
  });

  it("rejects REGULATOR with no credentialing as MISSING_CREDENTIALING", async () => {
    const admin = await makeAdminAndLogin({ can_admin_niov: true });
    await grantApproval(admin.entityId, GRANT_ACTION_TYPE);
    const regulatorId = await makeRegulatorWithTAR({ credentialed_by: null });

    const res = await app.inject({
      method: "POST",
      url: GRANT_ROUTE,
      headers: { authorization: `Bearer ${admin.token}` },
      payload: grantPayload({ regulator_entity_id: regulatorId }),
      remoteAddress: admin.ip,
    });

    expect(res.statusCode).toBe(422);
    expect((res.json() as { code: string }).code).toBe("MISSING_CREDENTIALING");
  });

  it("rejects jurisdiction mismatch with 422 JURISDICTION_NOT_AUTHORIZED", async () => {
    const admin = await makeAdminAndLogin({ can_admin_niov: true });
    await grantApproval(admin.entityId, GRANT_ACTION_TYPE);
    const regulatorId = await makeRegulatorWithTAR({
      jurisdictions: ["US-FEDERAL"],
    });

    const res = await app.inject({
      method: "POST",
      url: GRANT_ROUTE,
      headers: { authorization: `Bearer ${admin.token}` },
      payload: grantPayload({
        regulator_entity_id: regulatorId,
        jurisdiction_invoked: "EU-DE",
      }),
      remoteAddress: admin.ip,
    });

    expect(res.statusCode).toBe(422);
    expect((res.json() as { code: string }).code).toBe(
      "JURISDICTION_NOT_AUTHORIZED",
    );
  });

  it("rejects authority scope mismatch with 422 SCOPE_NOT_AUTHORIZED", async () => {
    const admin = await makeAdminAndLogin({ can_admin_niov: true });
    await grantApproval(admin.entityId, GRANT_ACTION_TYPE);
    const regulatorId = await makeRegulatorWithTAR({
      scopes: ["SECURITIES_EXAMINATION"],
    });

    const res = await app.inject({
      method: "POST",
      url: GRANT_ROUTE,
      headers: { authorization: `Bearer ${admin.token}` },
      payload: grantPayload({
        regulator_entity_id: regulatorId,
        authority_scope: "HEALTHCARE_HIPAA_AUDIT",
      }),
      remoteAddress: admin.ip,
    });

    expect(res.statusCode).toBe(422);
    expect((res.json() as { code: string }).code).toBe("SCOPE_NOT_AUTHORIZED");
  });
});

// ---------------------------------------------------------------------------
// Grant route -- body / time-window validation
// ---------------------------------------------------------------------------

describe("POST /api/v1/regulator/access-grants -- body validation", () => {
  it("returns 422 INVALID_REQUEST when required field is missing", async () => {
    const admin = await makeAdminAndLogin({ can_admin_niov: true });
    await grantApproval(admin.entityId, GRANT_ACTION_TYPE);

    const res = await app.inject({
      method: "POST",
      url: GRANT_ROUTE,
      headers: { authorization: `Bearer ${admin.token}` },
      payload: { regulator_entity_id: randomUUID() },
      remoteAddress: admin.ip,
    });
    expect(res.statusCode).toBe(422);
    expect((res.json() as { code: string }).code).toBe("INVALID_REQUEST");
  });

  it("returns 422 INVALID_BASIS_TYPE when basis_type is not in the LawfulBasisType enum", async () => {
    const admin = await makeAdminAndLogin({ can_admin_niov: true });
    await grantApproval(admin.entityId, GRANT_ACTION_TYPE);
    const regulatorId = await makeRegulatorWithTAR({});

    const res = await app.inject({
      method: "POST",
      url: GRANT_ROUTE,
      headers: { authorization: `Bearer ${admin.token}` },
      payload: grantPayload({
        regulator_entity_id: regulatorId,
        basis_type: "NOT_A_REAL_BASIS",
      }),
      remoteAddress: admin.ip,
    });

    expect(res.statusCode).toBe(422);
    expect((res.json() as { code: string }).code).toBe("INVALID_BASIS_TYPE");
  });

  it("returns 422 INVALID_TIME_WINDOW when valid_until <= valid_from", async () => {
    const admin = await makeAdminAndLogin({ can_admin_niov: true });
    await grantApproval(admin.entityId, GRANT_ACTION_TYPE);
    const regulatorId = await makeRegulatorWithTAR({});
    const now = new Date();

    const res = await app.inject({
      method: "POST",
      url: GRANT_ROUTE,
      headers: { authorization: `Bearer ${admin.token}` },
      payload: grantPayload({
        regulator_entity_id: regulatorId,
        valid_from: now,
        valid_until: now,
      }),
      remoteAddress: admin.ip,
    });

    expect(res.statusCode).toBe(422);
    expect((res.json() as { code: string }).code).toBe("INVALID_TIME_WINDOW");
  });

  it("returns 422 INVALID_TIME_WINDOW when valid_until is in the past", async () => {
    const admin = await makeAdminAndLogin({ can_admin_niov: true });
    await grantApproval(admin.entityId, GRANT_ACTION_TYPE);
    const regulatorId = await makeRegulatorWithTAR({});
    const past = new Date(Date.now() - 60 * 60 * 1000);
    const farPast = new Date(past.getTime() - 60 * 60 * 1000);

    const res = await app.inject({
      method: "POST",
      url: GRANT_ROUTE,
      headers: { authorization: `Bearer ${admin.token}` },
      payload: grantPayload({
        regulator_entity_id: regulatorId,
        valid_from: farPast,
        valid_until: past,
      }),
      remoteAddress: admin.ip,
    });

    expect(res.statusCode).toBe(422);
    expect((res.json() as { code: string }).code).toBe("INVALID_TIME_WINDOW");
  });
});

// ---------------------------------------------------------------------------
// Revoke route
// ---------------------------------------------------------------------------

// WHAT: Drive a successful grant + capture the basis_id + audit_id for
//        a subsequent revoke test.
async function performGrant(
  admin: { entityId: string; token: string; ip: string },
  regulatorId: string,
): Promise<{ basis_id: string; audit_id: string }> {
  await grantApproval(admin.entityId, GRANT_ACTION_TYPE);
  const res = await app.inject({
    method: "POST",
    url: GRANT_ROUTE,
    headers: { authorization: `Bearer ${admin.token}` },
    payload: grantPayload({ regulator_entity_id: regulatorId }),
    remoteAddress: admin.ip,
  });
  if (res.statusCode !== 201) {
    throw new Error(`grant failed: ${res.statusCode} ${res.body}`);
  }
  const body = res.json() as { basis_id: string; audit_id: string };
  createdBasisIds.push(body.basis_id);
  return body;
}

describe("POST /api/v1/regulator/access-revocations -- happy path", () => {
  it("emits REGULATOR_ACCESS_REVOKED with lawful_basis_id + lawful_basis_chain_hash; resolves target_entity_id from grant chain", async () => {
    const admin = await makeAdminAndLogin({ can_admin_niov: true });
    const regulatorId = await makeRegulatorWithTAR({});
    const granted = await performGrant(admin, regulatorId);

    // Now approve the revoke action separately (different action type).
    await grantApproval(admin.entityId, REVOKE_ACTION_TYPE);

    const res = await app.inject({
      method: "POST",
      url: REVOKE_ROUTE,
      headers: { authorization: `Bearer ${admin.token}` },
      payload: { lawful_basis_id: granted.basis_id, revocation_reason: "test revocation" },
      remoteAddress: admin.ip,
    });

    expect(res.statusCode).toBe(201);
    const body = res.json() as {
      ok: boolean;
      lawful_basis_id: string;
      audit_id: string;
      event_hash: string;
      revoked_at: string;
      status: string;
    };
    expect(body.ok).toBe(true);
    expect(body.status).toBe("REVOKED");
    expect(body.lawful_basis_id).toBe(granted.basis_id);
    expect(body.audit_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(body.event_hash).toMatch(/^[0-9a-f]{64}$/);

    // Verify the REGULATOR_ACCESS_REVOKED row carries the lawful-basis
    // fields + target resolved via grant chain (LawfulBasis.audit_id ->
    // grant AuditEvent.target_entity_id = regulatorId).
    const revokeRow = await prisma.auditEvent.findUnique({
      where: { audit_id: body.audit_id },
    });
    expect(revokeRow).not.toBeNull();
    expect(revokeRow?.event_type).toBe("REGULATOR_ACCESS_REVOKED");
    expect(revokeRow?.actor_entity_id).toBe(admin.entityId);
    expect(revokeRow?.target_entity_id).toBe(regulatorId);
    expect(revokeRow?.lawful_basis_id).toBe(granted.basis_id);

    // The chain_hash on the revoke event must equal the original
    // LawfulBasis chain_hash (binding to the original grant content).
    const basis = await prisma.lawfulBasis.findUnique({
      where: { basis_id: granted.basis_id },
    });
    expect(revokeRow?.lawful_basis_chain_hash).toBe(basis?.chain_hash);
  });
});

describe("POST /api/v1/regulator/access-revocations -- guards", () => {
  it("returns 403 ESCALATION_PENDING when revoke lacks dual-control approval", async () => {
    const admin = await makeAdminAndLogin({ can_admin_niov: true });
    const regulatorId = await makeRegulatorWithTAR({});
    const granted = await performGrant(admin, regulatorId);

    const res = await app.inject({
      method: "POST",
      url: REVOKE_ROUTE,
      headers: { authorization: `Bearer ${admin.token}` },
      payload: { lawful_basis_id: granted.basis_id },
      remoteAddress: admin.ip,
    });

    expect(res.statusCode).toBe(403);
    const body = res.json() as { error: string };
    expect(body.error).toBe("ESCALATION_PENDING");
  });

  it("returns 403 ADMIN_CAPABILITY_REQUIRED when caller lacks can_admin_niov", async () => {
    const noCap = await makeAdminAndLogin({ can_admin_niov: false });

    const res = await app.inject({
      method: "POST",
      url: REVOKE_ROUTE,
      headers: { authorization: `Bearer ${noCap.token}` },
      payload: { lawful_basis_id: randomUUID() },
      remoteAddress: noCap.ip,
    });

    expect(res.statusCode).toBe(403);
    expect((res.json() as { error: string }).error).toBe(
      "ADMIN_CAPABILITY_REQUIRED",
    );
  });

  it("returns 404 LAWFUL_BASIS_NOT_FOUND for a non-existent lawful_basis_id", async () => {
    const admin = await makeAdminAndLogin({ can_admin_niov: true });
    await grantApproval(admin.entityId, REVOKE_ACTION_TYPE);

    const res = await app.inject({
      method: "POST",
      url: REVOKE_ROUTE,
      headers: { authorization: `Bearer ${admin.token}` },
      payload: { lawful_basis_id: "00000000-0000-0000-0000-000000000888" },
      remoteAddress: admin.ip,
    });

    expect(res.statusCode).toBe(404);
    expect((res.json() as { code: string }).code).toBe("LAWFUL_BASIS_NOT_FOUND");
  });

  it("returns 422 ALREADY_REVOKED when a REGULATOR_ACCESS_REVOKED event already exists for the basis", async () => {
    const admin = await makeAdminAndLogin({ can_admin_niov: true });
    const regulatorId = await makeRegulatorWithTAR({});
    const granted = await performGrant(admin, regulatorId);

    // First revoke succeeds.
    await grantApproval(admin.entityId, REVOKE_ACTION_TYPE);
    const r1 = await app.inject({
      method: "POST",
      url: REVOKE_ROUTE,
      headers: { authorization: `Bearer ${admin.token}` },
      payload: { lawful_basis_id: granted.basis_id },
      remoteAddress: admin.ip,
    });
    expect(r1.statusCode).toBe(201);

    // Second revoke against the same basis is rejected with 422
    // ALREADY_REVOKED per Q1 LOCKED Option α.
    await grantApproval(admin.entityId, REVOKE_ACTION_TYPE);
    const r2 = await app.inject({
      method: "POST",
      url: REVOKE_ROUTE,
      headers: { authorization: `Bearer ${admin.token}` },
      payload: { lawful_basis_id: granted.basis_id },
      remoteAddress: admin.ip,
    });
    expect(r2.statusCode).toBe(422);
    expect((r2.json() as { code: string }).code).toBe("ALREADY_REVOKED");
  });

  it("returns 422 BASIS_EXPIRED when revoking an already-expired lawful basis", async () => {
    // Create the LawfulBasis directly with a past valid_until so it is
    // expired from inception. createLawfulBasis is a sub-phase 3 helper.
    const admin = await makeAdminAndLogin({ can_admin_niov: true });
    const past = new Date(Date.now() - 60 * 60 * 1000);
    const farPast = new Date(past.getTime() - 60 * 60 * 1000);

    const expired = await prisma.lawfulBasis.create({
      data: {
        basis_type: "SUBPOENA",
        basis_reference: `${TEST_PREFIX}expired-${randomUUID()}`,
        jurisdiction_invoked: "US-FEDERAL",
        valid_from: farPast,
        valid_until: past,
        chain_hash:
          "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
      },
    });
    createdBasisIds.push(expired.basis_id);

    await grantApproval(admin.entityId, REVOKE_ACTION_TYPE);

    const res = await app.inject({
      method: "POST",
      url: REVOKE_ROUTE,
      headers: { authorization: `Bearer ${admin.token}` },
      payload: { lawful_basis_id: expired.basis_id },
      remoteAddress: admin.ip,
    });

    expect(res.statusCode).toBe(422);
    expect((res.json() as { code: string }).code).toBe("BASIS_EXPIRED");
  });

  it("returns 422 INVALID_REQUEST when lawful_basis_id is missing", async () => {
    const admin = await makeAdminAndLogin({ can_admin_niov: true });
    await grantApproval(admin.entityId, REVOKE_ACTION_TYPE);

    const res = await app.inject({
      method: "POST",
      url: REVOKE_ROUTE,
      headers: { authorization: `Bearer ${admin.token}` },
      payload: {},
      remoteAddress: admin.ip,
    });

    expect(res.statusCode).toBe(422);
    expect((res.json() as { code: string }).code).toBe("INVALID_REQUEST");
  });
});
