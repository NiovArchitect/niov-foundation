// FILE: regulator-cosmp-enforcement.test.ts (integration)
// PURPOSE: HTTP-level coverage for REGULATOR-actor lawful-basis
//          enforcement in COSMP NEGOTIATE / readContent / SHARE /
//          REVOKE flows per CAR Sub-box 3 sub-phase 6
//          [SUB-BOX-3-COSMP-ENFORCEMENT] + ADR-0036 Sub-decision 5
//          + 6. Exercises the full substrate end-to-end against
//          real Postgres: enforcement at NEGOTIATE start-check,
//          TOCTOU re-check at readContent entry, SHARE + REVOKE
//          start-check, audit-event extension with
//          lawful_basis_id + lawful_basis_chain_hash, and the full
//          error taxonomy (REGULATOR_LAWFUL_BASIS_REQUIRED +
//          LAWFUL_BASIS_*  + REGULATOR_*).
//
// Whole-COSMP scalability discipline canonical at substantive
// register substantively (per Sub-phase 6 §18 alignment): all
// enforcement queries are 3 indexed point-lookups; no scans; no
// global lock; no capsule content read for authorization. Tests
// exercise this property at the parallel-access happy path.
//
// CONNECTS TO:
//   - apps/api/src/services/cosmp/regulator-enforcement.ts
//     (the shared enforcement helper)
//   - apps/api/src/services/cosmp/negotiate.service.ts
//   - apps/api/src/services/cosmp/read.service.ts
//   - apps/api/src/services/cosmp/share.service.ts
//   - apps/api/src/routes/cosmp.routes.ts
//   - packages/database/src/queries/lawful-basis.ts
//     (getActiveLawfulBasisForRegulator -- 9-condition active-grant
//     query helper)
//   - apps/api/src/routes/regulator.routes.ts (sub-phase 5 grant
//     route used to land the LawfulBasis fixtures naturally)
//   - tests/integration/regulator-routes.test.ts (sibling pattern
//     this file mirrors; reuses makeRegulatorWithTAR / grantApproval
//     / cleanupTestEscalations conventions)

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
import {
  computeTARHash,
  createCapsule,
  createEntity,
  getWalletByEntityId,
  prisma,
} from "@niov/database";
import {
  cleanupTestData,
  ensureAuditTriggers,
  makeCapsuleInput,
  makeEntityInput,
  makeRegulatorEntityInput,
  TEST_PREFIX,
  withCleanRateLimits,
} from "../helpers.js";
import type { FastifyInstance } from "fastify";

const TEST_JWT_SECRET = "regulator-cosmp-enforcement-secret-do-not-use";
const TEST_KEY = randomBytes(32);
const GRANT_ROUTE = "/api/v1/regulator/access-grants";
const NEGOTIATE_ROUTE = "/api/v1/cosmp/negotiate";
const SHARE_ROUTE = "/api/v1/cosmp/share";
const GRANT_ACTION_TYPE = "REGULATOR_ACCESS_GRANT" as const;

let app: FastifyInstance;
const store = new MemoryRateLimitStore();
const createdBasisIds: string[] = [];
const createdBridgeIds: string[] = [];

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

async function makePersonAndLogin(opts: {
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

  const ip = `10.98.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 254) + 1}`;
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
    throw new Error(`person login failed: ${login.statusCode} ${login.body}`);
  }
  const body = login.json() as { token: string };
  return {
    entityId: entity.entity_id,
    token: body.token,
    ip,
  };
}

// WHAT: Build a REGULATOR entity with populated TAR + a session
//        token so the entity can act as a COSMP requester.
async function makeRegulatorAndLogin(opts: {
  jurisdictions?: string[];
  scopes?: string[];
  credentialed_by?: string | null;
  status?: "ACTIVE" | "SUSPENDED";
}): Promise<{ entityId: string; token: string; ip: string }> {
  const password = "regulator-correct-horse";
  const input = makeRegulatorEntityInput({ password });
  const entity = await createEntity(input);

  const credentialedBy =
    "credentialed_by" in opts ? opts.credentialed_by ?? null : "DOJ";
  await prisma.tokenAttributeRepository.update({
    where: { entity_id: entity.entity_id },
    data: {
      regulator_jurisdiction: opts.jurisdictions ?? ["US-FEDERAL"],
      regulator_authority_scope: opts.scopes ?? ["SECURITIES_EXAMINATION"],
      regulator_credentialed_by: credentialedBy,
      // REGULATOR default ceiling is 0 per sub-phase 2 substrate; capsule
      // fixtures here use clearance_required = 0 so the regulator can
      // pass the clearance check at NEGOTIATE Step 3.
    },
  });

  if (opts.status === "SUSPENDED") {
    await prisma.entity.update({
      where: { entity_id: entity.entity_id },
      data: { status: "SUSPENDED" },
    });
  }

  // To NEGOTIATE the regulator needs a session; login flow uses
  // requested_operations including "read" + "share" so the session
  // covers all sub-phase 6 enforcement entry points.
  const ip = `10.99.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 254) + 1}`;
  const login = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: {
      email: input.email,
      password,
      requested_operations: ["read", "share"],
    },
    remoteAddress: ip,
  });
  if (login.statusCode !== 200) {
    throw new Error(
      `regulator login failed: ${login.statusCode} ${login.body}`,
    );
  }
  const body = login.json() as { token: string };
  return { entityId: entity.entity_id, token: body.token, ip };
}

// WHAT: Land a LawfulBasis fixture by calling the sub-phase 5 grant
//        route end-to-end (with dual-control approval). Returns the
//        basis_id + grant audit_id captured from the route response.
async function landGrant(
  admin: { entityId: string; token: string; ip: string },
  regulatorEntityId: string,
  overrides: {
    jurisdiction_invoked?: string;
    authority_scope?: string;
    valid_from?: Date;
    valid_until?: Date;
  } = {},
): Promise<{ basis_id: string; audit_id: string }> {
  // Approve dual-control for the grant action so the route lets
  // executePhase0-equivalent through.
  const approval = await createEscalationForCaller(admin.entityId, {
    target_entity_id: admin.entityId,
    escalation_type: "DUAL_CONTROL_REQUIRED",
    severity: "HIGH",
    description: dualControlDescription(GRANT_ACTION_TYPE),
    expires_at: null,
  });
  await approveEscalationForCaller(admin.entityId, approval.escalation_id);

  const validFrom = overrides.valid_from ?? new Date(Date.now() - 60 * 1000);
  const validUntil =
    overrides.valid_until ?? new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
  const res = await app.inject({
    method: "POST",
    url: GRANT_ROUTE,
    headers: { authorization: `Bearer ${admin.token}` },
    payload: {
      regulator_entity_id: regulatorEntityId,
      basis_type: "SUBPOENA",
      basis_reference: `${TEST_PREFIX}case-${randomUUID()}`,
      jurisdiction_invoked: overrides.jurisdiction_invoked ?? "US-FEDERAL",
      authority_scope: overrides.authority_scope ?? "SECURITIES_EXAMINATION",
      valid_from: validFrom.toISOString(),
      valid_until: validUntil.toISOString(),
    },
    remoteAddress: admin.ip,
  });
  if (res.statusCode !== 201) {
    throw new Error(`grant failed: ${res.statusCode} ${res.body}`);
  }
  const body = res.json() as { basis_id: string; audit_id: string };
  createdBasisIds.push(body.basis_id);
  return body;
}

// WHAT: Build a capsule owned by the given entity with
//        clearance_required = 0 so a REGULATOR (clearance ceiling 0)
//        can read it via the NEGOTIATE OWNER_SHORTCUT branch.
//        Direct DB fixture path; bypasses WRITE route.
async function makeRegulatorOwnedCapsule(
  regulatorEntityId: string,
): Promise<{ wallet_id: string; capsule_id: string }> {
  // Each entity has exactly one wallet auto-created at createEntity time;
  // unique-constraint on entity_id forbids inserting a second one.
  const wallet = await getWalletByEntityId(regulatorEntityId);
  if (wallet === null) {
    throw new Error(`wallet missing for regulator ${regulatorEntityId}`);
  }
  const capsule = await createCapsule(
    makeCapsuleInput(wallet.wallet_id, regulatorEntityId, {
      clearance_required: 0,
    }),
  );
  return { wallet_id: wallet.wallet_id, capsule_id: capsule.capsule_id };
}

// WHAT: Insert a payload into the in-memory ContentStore by going
//        through the WRITE route is NOT allowed for REGULATOR per Q1
//        LOCKED. Skip by directly writing via prisma's storage_location
//        contract -- since ContentStore is in-memory and bound to the
//        app instance, we can shortcut by using the existing test
//        Memory ContentStore through a write hook. The simplest
//        approach: use a fake content_hash + storage_location and
//        accept that getCapsuleWithContent returns the capsule; the
//        contentStore.read() returns null + READ surfaces
//        CONTENT_NOT_FOUND. For tests focused on the enforcement gate
//        (not the actual content payload), this is sufficient.
//        The happy-path readContent test that needs actual content
//        uses a special path; tests that check the enforcement
//        REJECTION never reach the content fetch.

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
  if (createdBridgeIds.length > 0) {
    await prisma.permission.deleteMany({
      where: { bridge_id: { in: createdBridgeIds } },
    });
    createdBridgeIds.length = 0;
  }
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
  if (createdBridgeIds.length > 0) {
    await prisma.permission.deleteMany({
      where: { bridge_id: { in: createdBridgeIds } },
    });
    createdBridgeIds.length = 0;
  }
  if (createdBasisIds.length > 0) {
    await prisma.lawfulBasis.deleteMany({
      where: { basis_id: { in: createdBasisIds } },
    });
    createdBasisIds.length = 0;
  }
});

withCleanRateLimits(store);

// ---------------------------------------------------------------------------
// A. Non-REGULATOR baseline -- existing COSMP behavior unchanged
// ---------------------------------------------------------------------------

describe("A. Non-REGULATOR baseline", () => {
  it("PERSON NEGOTIATE without X-Lawful-Basis-Id is unaffected by sub-phase 6", async () => {
    const person = await makePersonAndLogin({ can_admin_niov: false });
    // Make person own a capsule for the OWNER_SHORTCUT path
    const wallet = await getWalletByEntityId(person.entityId);
    if (wallet === null) throw new Error("person wallet missing");
    const capsule = await createCapsule(
      makeCapsuleInput(wallet.wallet_id, person.entityId, {
        clearance_required: 0,
      }),
    );
    const res = await app.inject({
      method: "POST",
      url: NEGOTIATE_ROUTE,
      headers: { authorization: `Bearer ${person.token}` },
      payload: {
        capsule_id: capsule.capsule_id,
        requested_scope: "METADATA_ONLY",
      },
      remoteAddress: person.ip,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { ok: boolean };
    expect(body.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// B. REGULATOR header missing -> REGULATOR_LAWFUL_BASIS_REQUIRED
// ---------------------------------------------------------------------------

describe("B. REGULATOR X-Lawful-Basis-Id header missing", () => {
  it("REGULATOR NEGOTIATE without X-Lawful-Basis-Id denied 403 REGULATOR_LAWFUL_BASIS_REQUIRED", async () => {
    const reg = await makeRegulatorAndLogin({});
    const ownedCapsule = await makeRegulatorOwnedCapsule(reg.entityId);
    const res = await app.inject({
      method: "POST",
      url: NEGOTIATE_ROUTE,
      headers: { authorization: `Bearer ${reg.token}` },
      payload: {
        capsule_id: ownedCapsule.capsule_id,
        requested_scope: "METADATA_ONLY",
      },
      remoteAddress: reg.ip,
    });
    expect(res.statusCode).toBe(403);
    expect((res.json() as { code: string }).code).toBe(
      "REGULATOR_LAWFUL_BASIS_REQUIRED",
    );
  });

  it("REGULATOR readContent without X-Lawful-Basis-Id denied 403", async () => {
    const reg = await makeRegulatorAndLogin({});
    const ownedCapsule = await makeRegulatorOwnedCapsule(reg.entityId);
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/cosmp/capsule/${ownedCapsule.capsule_id}/content`,
      headers: {
        authorization: `Bearer ${reg.token}`,
        "x-declaration-token": "fake.jwt.token",
        "x-metadata-fingerprint": "fakefingerprint",
      },
      remoteAddress: reg.ip,
    });
    expect(res.statusCode).toBe(403);
    expect((res.json() as { code: string }).code).toBe(
      "REGULATOR_LAWFUL_BASIS_REQUIRED",
    );
  });

  it("REGULATOR SHARE without X-Lawful-Basis-Id denied 403", async () => {
    const reg = await makeRegulatorAndLogin({});
    const grantee = await createEntity(makeEntityInput());
    const res = await app.inject({
      method: "POST",
      url: SHARE_ROUTE,
      headers: { authorization: `Bearer ${reg.token}` },
      payload: {
        grantee_entity_id: grantee.entity_id,
        capsule_grants: [
          {
            capsule_id: randomUUID(),
            scope: "METADATA_ONLY",
          },
        ],
      },
      remoteAddress: reg.ip,
    });
    expect(res.statusCode).toBe(403);
    expect((res.json() as { code: string }).code).toBe(
      "REGULATOR_LAWFUL_BASIS_REQUIRED",
    );
  });

  it("REGULATOR REVOKE share without X-Lawful-Basis-Id denied 403", async () => {
    const reg = await makeRegulatorAndLogin({});
    const res = await app.inject({
      method: "DELETE",
      url: `/api/v1/cosmp/share/${randomUUID()}`,
      headers: { authorization: `Bearer ${reg.token}` },
      remoteAddress: reg.ip,
    });
    expect(res.statusCode).toBe(403);
    expect((res.json() as { code: string }).code).toBe(
      "REGULATOR_LAWFUL_BASIS_REQUIRED",
    );
  });
});

// ---------------------------------------------------------------------------
// C. LawfulBasis lifecycle errors (NEGOTIATE entry surface)
// ---------------------------------------------------------------------------

describe("C. LawfulBasis lifecycle (NEGOTIATE)", () => {
  it("LawfulBasis not found -> 404 LAWFUL_BASIS_NOT_FOUND", async () => {
    const reg = await makeRegulatorAndLogin({});
    const ownedCapsule = await makeRegulatorOwnedCapsule(reg.entityId);
    const res = await app.inject({
      method: "POST",
      url: NEGOTIATE_ROUTE,
      headers: {
        authorization: `Bearer ${reg.token}`,
        "x-lawful-basis-id": "00000000-0000-0000-0000-000000000777",
      },
      payload: {
        capsule_id: ownedCapsule.capsule_id,
        requested_scope: "METADATA_ONLY",
      },
      remoteAddress: reg.ip,
    });
    expect(res.statusCode).toBe(404);
    expect((res.json() as { code: string }).code).toBe("LAWFUL_BASIS_NOT_FOUND");
  });

  it("LawfulBasis.audit_id null -> 422 LAWFUL_BASIS_NOT_LINKED_TO_AUDIT", async () => {
    const reg = await makeRegulatorAndLogin({});
    const ownedCapsule = await makeRegulatorOwnedCapsule(reg.entityId);
    // Direct prisma insert with audit_id null (defensive case;
    // post-Sub-phase-5 atomic transaction prevents this in normal
    // flows but the enforcement helper guards defensively).
    const orphan = await prisma.lawfulBasis.create({
      data: {
        basis_type: "SUBPOENA",
        basis_reference: `${TEST_PREFIX}orphan-${randomUUID()}`,
        jurisdiction_invoked: "US-FEDERAL",
        valid_from: new Date(Date.now() - 60_000),
        valid_until: new Date(Date.now() + 86400_000),
        chain_hash:
          "feedfacefeedfacefeedfacefeedfacefeedfacefeedfacefeedfacefeedface",
      },
    });
    createdBasisIds.push(orphan.basis_id);
    const res = await app.inject({
      method: "POST",
      url: NEGOTIATE_ROUTE,
      headers: {
        authorization: `Bearer ${reg.token}`,
        "x-lawful-basis-id": orphan.basis_id,
      },
      payload: {
        capsule_id: ownedCapsule.capsule_id,
        requested_scope: "METADATA_ONLY",
      },
      remoteAddress: reg.ip,
    });
    expect(res.statusCode).toBe(422);
    expect((res.json() as { code: string }).code).toBe(
      "LAWFUL_BASIS_NOT_LINKED_TO_AUDIT",
    );
  });

  it("LawfulBasis expired -> 422 LAWFUL_BASIS_EXPIRED", async () => {
    const admin = await makePersonAndLogin({ can_admin_niov: true });
    const reg = await makeRegulatorAndLogin({});
    const past = new Date(Date.now() - 60_000);
    const veryPast = new Date(past.getTime() - 60_000);
    // Land grant with future window first so route accepts; then mutate row to past.
    const granted = await landGrant(admin, reg.entityId);
    await prisma.lawfulBasis.update({
      where: { basis_id: granted.basis_id },
      data: { valid_from: veryPast, valid_until: past },
    });
    const ownedCapsule = await makeRegulatorOwnedCapsule(reg.entityId);
    const res = await app.inject({
      method: "POST",
      url: NEGOTIATE_ROUTE,
      headers: {
        authorization: `Bearer ${reg.token}`,
        "x-lawful-basis-id": granted.basis_id,
      },
      payload: {
        capsule_id: ownedCapsule.capsule_id,
        requested_scope: "METADATA_ONLY",
      },
      remoteAddress: reg.ip,
    });
    expect(res.statusCode).toBe(422);
    // Mutating valid_from + valid_until invalidates chain_hash since
    // chain_hash was computed from the original. The enforcement
    // surface that fires first depends on order: hash check happens
    // AFTER lifecycle check in the helper, so EXPIRED reaches the
    // caller first when valid_until is in the past.
    expect((res.json() as { code: string }).code).toBe("LAWFUL_BASIS_EXPIRED");
  });

  it("LawfulBasis not yet valid -> 422 LAWFUL_BASIS_NOT_YET_VALID", async () => {
    const admin = await makePersonAndLogin({ can_admin_niov: true });
    const reg = await makeRegulatorAndLogin({});
    const future = new Date(Date.now() + 60_000);
    const farFuture = new Date(future.getTime() + 60_000);
    const granted = await landGrant(admin, reg.entityId);
    await prisma.lawfulBasis.update({
      where: { basis_id: granted.basis_id },
      data: { valid_from: future, valid_until: farFuture },
    });
    const ownedCapsule = await makeRegulatorOwnedCapsule(reg.entityId);
    const res = await app.inject({
      method: "POST",
      url: NEGOTIATE_ROUTE,
      headers: {
        authorization: `Bearer ${reg.token}`,
        "x-lawful-basis-id": granted.basis_id,
      },
      payload: {
        capsule_id: ownedCapsule.capsule_id,
        requested_scope: "METADATA_ONLY",
      },
      remoteAddress: reg.ip,
    });
    expect(res.statusCode).toBe(422);
    expect((res.json() as { code: string }).code).toBe(
      "LAWFUL_BASIS_NOT_YET_VALID",
    );
  });

  it("LawfulBasis revoked -> 422 LAWFUL_BASIS_REVOKED", async () => {
    const admin = await makePersonAndLogin({ can_admin_niov: true });
    const reg = await makeRegulatorAndLogin({});
    const granted = await landGrant(admin, reg.entityId);
    // Land a REVOKED audit row directly via the sub-phase 5 revoke
    // route. This avoids manual audit-row writes that could break
    // the chain. Approve dual-control for revoke.
    const REVOKE_ACTION = "REGULATOR_ACCESS_REVOKE" as const;
    const approval = await createEscalationForCaller(admin.entityId, {
      target_entity_id: admin.entityId,
      escalation_type: "DUAL_CONTROL_REQUIRED",
      severity: "HIGH",
      description: dualControlDescription(REVOKE_ACTION),
      expires_at: null,
    });
    await approveEscalationForCaller(admin.entityId, approval.escalation_id);
    const revRes = await app.inject({
      method: "POST",
      url: "/api/v1/regulator/access-revocations",
      headers: { authorization: `Bearer ${admin.token}` },
      payload: { lawful_basis_id: granted.basis_id },
      remoteAddress: admin.ip,
    });
    expect(revRes.statusCode).toBe(201);
    const ownedCapsule = await makeRegulatorOwnedCapsule(reg.entityId);
    const res = await app.inject({
      method: "POST",
      url: NEGOTIATE_ROUTE,
      headers: {
        authorization: `Bearer ${reg.token}`,
        "x-lawful-basis-id": granted.basis_id,
      },
      payload: {
        capsule_id: ownedCapsule.capsule_id,
        requested_scope: "METADATA_ONLY",
      },
      remoteAddress: reg.ip,
    });
    expect(res.statusCode).toBe(422);
    expect((res.json() as { code: string }).code).toBe("LAWFUL_BASIS_REVOKED");
  });

  it("LawfulBasis chain_hash mismatch -> 403 LAWFUL_BASIS_HASH_MISMATCH", async () => {
    const admin = await makePersonAndLogin({ can_admin_niov: true });
    const reg = await makeRegulatorAndLogin({});
    const granted = await landGrant(admin, reg.entityId);
    // Tamper the chain_hash on the LawfulBasis row directly.
    await prisma.lawfulBasis.update({
      where: { basis_id: granted.basis_id },
      data: {
        chain_hash:
          "0000000000000000000000000000000000000000000000000000000000000000",
      },
    });
    const ownedCapsule = await makeRegulatorOwnedCapsule(reg.entityId);
    const res = await app.inject({
      method: "POST",
      url: NEGOTIATE_ROUTE,
      headers: {
        authorization: `Bearer ${reg.token}`,
        "x-lawful-basis-id": granted.basis_id,
      },
      payload: {
        capsule_id: ownedCapsule.capsule_id,
        requested_scope: "METADATA_ONLY",
      },
      remoteAddress: reg.ip,
    });
    expect(res.statusCode).toBe(403);
    expect((res.json() as { code: string }).code).toBe(
      "LAWFUL_BASIS_HASH_MISMATCH",
    );
  });
});

// ---------------------------------------------------------------------------
// D. TAR jurisdiction / scope mismatches
// ---------------------------------------------------------------------------

describe("D. TAR jurisdiction / scope mismatches", () => {
  it("Jurisdiction mismatch -> 403 REGULATOR_JURISDICTION_NOT_AUTHORIZED", async () => {
    const admin = await makePersonAndLogin({ can_admin_niov: true });
    // Regulator authorized in US-FEDERAL only; grant invokes EU-DE.
    // The grant route validates jurisdiction at grant time too, but
    // we test enforcement at NEGOTIATE by mutating the basis after
    // the grant.
    const reg = await makeRegulatorAndLogin({ jurisdictions: ["EU-DE"] });
    const granted = await landGrant(admin, reg.entityId, {
      jurisdiction_invoked: "EU-DE",
    });
    // Now narrow the regulator's TAR to remove EU-DE
    await prisma.tokenAttributeRepository.update({
      where: { entity_id: reg.entityId },
      data: { regulator_jurisdiction: ["US-FEDERAL"] },
    });
    const ownedCapsule = await makeRegulatorOwnedCapsule(reg.entityId);
    const res = await app.inject({
      method: "POST",
      url: NEGOTIATE_ROUTE,
      headers: {
        authorization: `Bearer ${reg.token}`,
        "x-lawful-basis-id": granted.basis_id,
      },
      payload: {
        capsule_id: ownedCapsule.capsule_id,
        requested_scope: "METADATA_ONLY",
      },
      remoteAddress: reg.ip,
    });
    expect(res.statusCode).toBe(403);
    expect((res.json() as { code: string }).code).toBe(
      "REGULATOR_JURISDICTION_NOT_AUTHORIZED",
    );
  });

  it("Empty regulator_authority_scope -> 403 REGULATOR_SCOPE_NOT_AUTHORIZED", async () => {
    const admin = await makePersonAndLogin({ can_admin_niov: true });
    const reg = await makeRegulatorAndLogin({});
    const granted = await landGrant(admin, reg.entityId);
    // Empty out the scope after grant
    await prisma.tokenAttributeRepository.update({
      where: { entity_id: reg.entityId },
      data: { regulator_authority_scope: [] },
    });
    const ownedCapsule = await makeRegulatorOwnedCapsule(reg.entityId);
    const res = await app.inject({
      method: "POST",
      url: NEGOTIATE_ROUTE,
      headers: {
        authorization: `Bearer ${reg.token}`,
        "x-lawful-basis-id": granted.basis_id,
      },
      payload: {
        capsule_id: ownedCapsule.capsule_id,
        requested_scope: "METADATA_ONLY",
      },
      remoteAddress: reg.ip,
    });
    expect(res.statusCode).toBe(403);
    expect((res.json() as { code: string }).code).toBe(
      "REGULATOR_SCOPE_NOT_AUTHORIZED",
    );
  });
});

// ---------------------------------------------------------------------------
// E. Happy paths (NEGOTIATE + audit emission with lawful-basis fields)
// ---------------------------------------------------------------------------

describe("E. Happy paths", () => {
  it("NEGOTIATE happy path -> 200; audit event includes lawful_basis_id + lawful_basis_chain_hash", async () => {
    const admin = await makePersonAndLogin({ can_admin_niov: true });
    const reg = await makeRegulatorAndLogin({});
    const granted = await landGrant(admin, reg.entityId);
    const ownedCapsule = await makeRegulatorOwnedCapsule(reg.entityId);
    const res = await app.inject({
      method: "POST",
      url: NEGOTIATE_ROUTE,
      headers: {
        authorization: `Bearer ${reg.token}`,
        "x-lawful-basis-id": granted.basis_id,
      },
      payload: {
        capsule_id: ownedCapsule.capsule_id,
        requested_scope: "METADATA_ONLY",
      },
      remoteAddress: reg.ip,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { ok: boolean; declaration_token: string };
    expect(body.ok).toBe(true);
    expect(typeof body.declaration_token).toBe("string");

    // Read the NEGOTIATE/SUCCESS audit row; verify lawful-basis fields
    // are set at the canonical_record/1 column register.
    const negotiateRow = await prisma.auditEvent.findFirst({
      where: {
        event_type: "NEGOTIATE",
        outcome: "SUCCESS",
        actor_entity_id: reg.entityId,
        target_capsule_id: ownedCapsule.capsule_id,
      },
      orderBy: { timestamp: "desc" },
    });
    expect(negotiateRow).not.toBeNull();
    expect(negotiateRow?.lawful_basis_id).toBe(granted.basis_id);
    const basis = await prisma.lawfulBasis.findUnique({
      where: { basis_id: granted.basis_id },
    });
    expect(negotiateRow?.lawful_basis_chain_hash).toBe(basis?.chain_hash);
  });
});

// ---------------------------------------------------------------------------
// F. TOCTOU defense at readContent
// ---------------------------------------------------------------------------

describe("F. TOCTOU defense (readContent re-check)", () => {
  it("readContent fails closed when basis revoked between NEGOTIATE and readContent", async () => {
    const admin = await makePersonAndLogin({ can_admin_niov: true });
    const reg = await makeRegulatorAndLogin({});
    const granted = await landGrant(admin, reg.entityId);
    const ownedCapsule = await makeRegulatorOwnedCapsule(reg.entityId);

    // Step 1: NEGOTIATE successfully (gets declaration_token)
    const negRes = await app.inject({
      method: "POST",
      url: NEGOTIATE_ROUTE,
      headers: {
        authorization: `Bearer ${reg.token}`,
        "x-lawful-basis-id": granted.basis_id,
      },
      payload: { capsule_id: ownedCapsule.capsule_id, requested_scope: "FULL" },
      remoteAddress: reg.ip,
    });
    expect(negRes.statusCode).toBe(200);
    const negBody = negRes.json() as { declaration_token: string };

    // Step 2: revoke the basis via the sub-phase 5 revoke route
    const REVOKE_ACTION = "REGULATOR_ACCESS_REVOKE" as const;
    const approval = await createEscalationForCaller(admin.entityId, {
      target_entity_id: admin.entityId,
      escalation_type: "DUAL_CONTROL_REQUIRED",
      severity: "HIGH",
      description: dualControlDescription(REVOKE_ACTION),
      expires_at: null,
    });
    await approveEscalationForCaller(admin.entityId, approval.escalation_id);
    const revRes = await app.inject({
      method: "POST",
      url: "/api/v1/regulator/access-revocations",
      headers: { authorization: `Bearer ${admin.token}` },
      payload: { lawful_basis_id: granted.basis_id },
      remoteAddress: admin.ip,
    });
    expect(revRes.statusCode).toBe(201);

    // Step 3: readContent must fail closed at the TOCTOU re-check.
    const readRes = await app.inject({
      method: "GET",
      url: `/api/v1/cosmp/capsule/${ownedCapsule.capsule_id}/content`,
      headers: {
        authorization: `Bearer ${reg.token}`,
        "x-declaration-token": negBody.declaration_token,
        "x-metadata-fingerprint": "anything",
        "x-lawful-basis-id": granted.basis_id,
      },
      remoteAddress: reg.ip,
    });
    expect(readRes.statusCode).toBe(422);
    expect((readRes.json() as { code: string }).code).toBe(
      "LAWFUL_BASIS_REVOKED",
    );
  });

  it("readContent fails closed when basis expires between NEGOTIATE and readContent", async () => {
    const admin = await makePersonAndLogin({ can_admin_niov: true });
    const reg = await makeRegulatorAndLogin({});
    const granted = await landGrant(admin, reg.entityId);
    const ownedCapsule = await makeRegulatorOwnedCapsule(reg.entityId);

    const negRes = await app.inject({
      method: "POST",
      url: NEGOTIATE_ROUTE,
      headers: {
        authorization: `Bearer ${reg.token}`,
        "x-lawful-basis-id": granted.basis_id,
      },
      payload: { capsule_id: ownedCapsule.capsule_id, requested_scope: "FULL" },
      remoteAddress: reg.ip,
    });
    expect(negRes.statusCode).toBe(200);
    const negBody = negRes.json() as { declaration_token: string };

    // Mutate basis to past
    const past = new Date(Date.now() - 60_000);
    await prisma.lawfulBasis.update({
      where: { basis_id: granted.basis_id },
      data: { valid_from: new Date(past.getTime() - 60_000), valid_until: past },
    });

    const readRes = await app.inject({
      method: "GET",
      url: `/api/v1/cosmp/capsule/${ownedCapsule.capsule_id}/content`,
      headers: {
        authorization: `Bearer ${reg.token}`,
        "x-declaration-token": negBody.declaration_token,
        "x-metadata-fingerprint": "anything",
        "x-lawful-basis-id": granted.basis_id,
      },
      remoteAddress: reg.ip,
    });
    expect(readRes.statusCode).toBe(422);
    expect((readRes.json() as { code: string }).code).toBe(
      "LAWFUL_BASIS_EXPIRED",
    );
  });
});

// ---------------------------------------------------------------------------
// G. Parallel checks against the same lawful_basis_id
// ---------------------------------------------------------------------------

describe("G. Parallel access (no shared mutable state leakage)", () => {
  it("multiple parallel REGULATOR NEGOTIATE calls against same active basis succeed", async () => {
    const admin = await makePersonAndLogin({ can_admin_niov: true });
    const reg = await makeRegulatorAndLogin({});
    const granted = await landGrant(admin, reg.entityId);

    // Create multiple distinct capsules so each NEGOTIATE has its
    // own target.
    const wallet = await getWalletByEntityId(reg.entityId);
    if (wallet === null) throw new Error("regulator wallet missing");
    const N = 10;
    const capsules = await Promise.all(
      Array.from({ length: N }).map(() =>
        createCapsule(
          makeCapsuleInput(wallet.wallet_id, reg.entityId, {
            clearance_required: 0,
          }),
        ),
      ),
    );

    const results = await Promise.all(
      capsules.map((c) =>
        app.inject({
          method: "POST",
          url: NEGOTIATE_ROUTE,
          headers: {
            authorization: `Bearer ${reg.token}`,
            "x-lawful-basis-id": granted.basis_id,
          },
          payload: { capsule_id: c.capsule_id, requested_scope: "METADATA_ONLY" },
          remoteAddress: reg.ip,
        }),
      ),
    );
    for (const res of results) {
      expect(res.statusCode).toBe(200);
    }
  });
});

// ---------------------------------------------------------------------------
// H. Substrate-honest negative tests
// ---------------------------------------------------------------------------

describe("H. Substrate-honest negative tests", () => {
  it("DENIED audit row carries lawful_basis_id when supplied; details do not include capsule contents", async () => {
    const reg = await makeRegulatorAndLogin({});
    const ownedCapsule = await makeRegulatorOwnedCapsule(reg.entityId);
    // Use a non-existent basis to trigger LAWFUL_BASIS_NOT_FOUND; the
    // header value should still be carried into the audit row's
    // top-level lawful_basis_id column.
    const probedBasis = "00000000-0000-0000-0000-000000000999";
    await app.inject({
      method: "POST",
      url: NEGOTIATE_ROUTE,
      headers: {
        authorization: `Bearer ${reg.token}`,
        "x-lawful-basis-id": probedBasis,
      },
      payload: {
        capsule_id: ownedCapsule.capsule_id,
        requested_scope: "METADATA_ONLY",
      },
      remoteAddress: reg.ip,
    });
    const denied = await prisma.auditEvent.findFirst({
      where: {
        event_type: "NEGOTIATE",
        outcome: "DENIED",
        actor_entity_id: reg.entityId,
        target_capsule_id: ownedCapsule.capsule_id,
      },
      orderBy: { timestamp: "desc" },
    });
    expect(denied).not.toBeNull();
    expect(denied?.lawful_basis_id).toBe(probedBasis);
    expect(denied?.denial_reason).toBe("LAWFUL_BASIS_NOT_FOUND");
    // details should NOT include capsule content / payload / sensitive
    // fields. Only entity_type metadata.
    const details = (denied?.details ?? {}) as Record<string, unknown>;
    for (const forbidden of [
      "content",
      "payload",
      "capsule_payload",
      "raw_content",
      "credential",
      "secret",
      "token",
    ]) {
      expect(details[forbidden]).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// I. CAR Sub-box 2 sub-phase 5 — LawfulBasis ↔ Capsule jurisdiction match
// ---------------------------------------------------------------------------
//
// PURPOSE: Sub-phase 5 [CAR-SUB-BOX-2-REGULATOR-INTEGRATION] per ADR-0037
// Sub-decision 8 + Q1 LOCKED Option α (basis-authoritative). For REGULATOR
// actors with a validated lawful basis, actor.jurisdiction at the
// jurisdiction-enforcement helper is substituted with
// validatedRegulatorBasis.jurisdiction_invoked. REGULATOR Entity.jurisdiction
// is NOT required to match capsule.jurisdiction. Sub-phase 5 augments the
// Sub-box 3 sub-phase 6 substrate WITHOUT changing the active-basis +
// TAR-jurisdiction model.

describe("I. CAR Sub-box 2 Sub-phase 5 — LawfulBasis ↔ Capsule jurisdiction match", () => {
  it("REGULATOR NEGOTIATE allowed when basis.jurisdiction_invoked === capsule.jurisdiction (basis-authoritative match)", async () => {
    const admin = await makePersonAndLogin({ can_admin_niov: true });
    const reg = await makeRegulatorAndLogin({});
    const granted = await landGrant(admin, reg.entityId, {
      jurisdiction_invoked: "US-FEDERAL",
    });
    // Capsule explicitly tagged US-FEDERAL (matches basis).
    const wallet = await getWalletByEntityId(reg.entityId);
    if (wallet === null) throw new Error("regulator wallet missing");
    const capsule = await createCapsule(
      makeCapsuleInput(wallet.wallet_id, reg.entityId, {
        clearance_required: 0,
        jurisdiction: "US-FEDERAL",
      }),
    );
    const res = await app.inject({
      method: "POST",
      url: NEGOTIATE_ROUTE,
      headers: {
        authorization: `Bearer ${reg.token}`,
        "x-lawful-basis-id": granted.basis_id,
      },
      payload: {
        capsule_id: capsule.capsule_id,
        requested_scope: "METADATA_ONLY",
      },
      remoteAddress: reg.ip,
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { ok: boolean }).ok).toBe(true);
  });

  it("REGULATOR NEGOTIATE denied 403 CROSS_JURISDICTION_ACCESS_DENIED when basis.jurisdiction_invoked !== capsule.jurisdiction", async () => {
    const admin = await makePersonAndLogin({ can_admin_niov: true });
    const reg = await makeRegulatorAndLogin({});
    const granted = await landGrant(admin, reg.entityId, {
      jurisdiction_invoked: "US-FEDERAL",
    });
    // Capsule tagged EU-DE (mismatch with basis).
    const wallet = await getWalletByEntityId(reg.entityId);
    if (wallet === null) throw new Error("regulator wallet missing");
    const capsule = await createCapsule(
      makeCapsuleInput(wallet.wallet_id, reg.entityId, {
        clearance_required: 0,
        jurisdiction: "EU-DE",
      }),
    );
    const res = await app.inject({
      method: "POST",
      url: NEGOTIATE_ROUTE,
      headers: {
        authorization: `Bearer ${reg.token}`,
        "x-lawful-basis-id": granted.basis_id,
      },
      payload: {
        capsule_id: capsule.capsule_id,
        requested_scope: "METADATA_ONLY",
      },
      remoteAddress: reg.ip,
    });
    expect(res.statusCode).toBe(403);
    expect((res.json() as { code: string }).code).toBe(
      "CROSS_JURISDICTION_ACCESS_DENIED",
    );
  });

  it("REGULATOR readContent happy path: matching basis + capsule jurisdiction passes the TOCTOU re-check (sub-phase 5 substitution does not false-positive)", async () => {
    const admin = await makePersonAndLogin({ can_admin_niov: true });
    const reg = await makeRegulatorAndLogin({});
    const granted = await landGrant(admin, reg.entityId, {
      jurisdiction_invoked: "US-FEDERAL",
    });
    const wallet = await getWalletByEntityId(reg.entityId);
    if (wallet === null) throw new Error("regulator wallet missing");
    const capsule = await createCapsule(
      makeCapsuleInput(wallet.wallet_id, reg.entityId, {
        clearance_required: 0,
        jurisdiction: "US-FEDERAL",
      }),
    );
    // STEP 1: NEGOTIATE successfully
    const negRes = await app.inject({
      method: "POST",
      url: NEGOTIATE_ROUTE,
      headers: {
        authorization: `Bearer ${reg.token}`,
        "x-lawful-basis-id": granted.basis_id,
      },
      payload: { capsule_id: capsule.capsule_id, requested_scope: "FULL" },
      remoteAddress: reg.ip,
    });
    expect(negRes.statusCode).toBe(200);
    const negBody = negRes.json() as { declaration_token: string };
    // STEP 2: readMetadata to obtain fingerprint
    const metaRes = await app.inject({
      method: "GET",
      url: `/api/v1/cosmp/capsule/${capsule.capsule_id}/metadata`,
      headers: {
        authorization: `Bearer ${reg.token}`,
        "x-declaration-token": negBody.declaration_token,
        "x-lawful-basis-id": granted.basis_id,
      },
      remoteAddress: reg.ip,
    });
    expect(metaRes.statusCode).toBe(200);
    const fp = (metaRes.json() as { metadata_fingerprint: string })
      .metadata_fingerprint;
    // STEP 3: readContent — jurisdiction TOCTOU re-check must NOT
    // false-positive when basis matches capsule. May fail at
    // contentStore lookup (CONTENT_NOT_FOUND) since the test fixture
    // doesn't seed contentStore, but the jurisdiction check itself
    // must pass — confirmed by absence of CROSS_JURISDICTION_ACCESS_DENIED.
    const contentRes = await app.inject({
      method: "GET",
      url: `/api/v1/cosmp/capsule/${capsule.capsule_id}/content`,
      headers: {
        authorization: `Bearer ${reg.token}`,
        "x-declaration-token": negBody.declaration_token,
        "x-metadata-fingerprint": fp,
        "x-lawful-basis-id": granted.basis_id,
      },
      remoteAddress: reg.ip,
    });
    const body = contentRes.json() as { code?: string };
    // The substantive assertion: jurisdiction did NOT reject readContent.
    // CONTENT_NOT_FOUND (404) is acceptable; CROSS_JURISDICTION_ACCESS_DENIED
    // would mean the substitution false-positived.
    expect(body.code).not.toBe("CROSS_JURISDICTION_ACCESS_DENIED");
  });

  it("REGULATOR SHARE denied 403 when one capsule jurisdiction mismatches basis.jurisdiction_invoked (failed_capsules detail)", async () => {
    const admin = await makePersonAndLogin({ can_admin_niov: true });
    const reg = await makeRegulatorAndLogin({});
    const granted = await landGrant(admin, reg.entityId, {
      jurisdiction_invoked: "US-FEDERAL",
    });
    const wallet = await getWalletByEntityId(reg.entityId);
    if (wallet === null) throw new Error("regulator wallet missing");
    const okCapsule = await createCapsule(
      makeCapsuleInput(wallet.wallet_id, reg.entityId, {
        clearance_required: 0,
        jurisdiction: "US-FEDERAL",
      }),
    );
    const badCapsule = await createCapsule(
      makeCapsuleInput(wallet.wallet_id, reg.entityId, {
        clearance_required: 0,
        jurisdiction: "EU-DE",
      }),
    );
    const grantee = await createEntity(makeEntityInput());
    const res = await app.inject({
      method: "POST",
      url: SHARE_ROUTE,
      headers: {
        authorization: `Bearer ${reg.token}`,
        "x-lawful-basis-id": granted.basis_id,
      },
      payload: {
        grantee_entity_id: grantee.entity_id,
        capsule_grants: [
          { capsule_id: okCapsule.capsule_id, scope: "METADATA_ONLY" },
          { capsule_id: badCapsule.capsule_id, scope: "METADATA_ONLY" },
        ],
      },
      remoteAddress: reg.ip,
    });
    expect(res.statusCode).toBe(403);
    const body = res.json() as {
      code: string;
      details?: { failed_capsules?: string[] };
    };
    expect(body.code).toBe("CROSS_JURISDICTION_ACCESS_DENIED");
    expect(body.details?.failed_capsules).toContain(badCapsule.capsule_id);
  });

  it("REGULATOR REVOKE denied 403 when revoke-time basis jurisdiction mismatches bridge capsule jurisdiction", async () => {
    // SHARE with basis A (US-FEDERAL, capsule US-FEDERAL) — bridge created.
    // REVOKE with basis B (EU-DE) for same regulator — basis-authoritative
    // actor jurisdiction at REVOKE is EU-DE, capsule is US-FEDERAL → denied.
    const admin = await makePersonAndLogin({ can_admin_niov: true });
    const reg = await makeRegulatorAndLogin({
      jurisdictions: ["US-FEDERAL", "EU-DE"],
    });
    const basisA = await landGrant(admin, reg.entityId, {
      jurisdiction_invoked: "US-FEDERAL",
    });
    const basisB = await landGrant(admin, reg.entityId, {
      jurisdiction_invoked: "EU-DE",
    });
    const wallet = await getWalletByEntityId(reg.entityId);
    if (wallet === null) throw new Error("regulator wallet missing");
    const capsule = await createCapsule(
      makeCapsuleInput(wallet.wallet_id, reg.entityId, {
        clearance_required: 0,
        jurisdiction: "US-FEDERAL",
      }),
    );
    const grantee = await createEntity(makeEntityInput());
    // SHARE with basis A → success; bridge has capsule (US-FEDERAL).
    const shareRes = await app.inject({
      method: "POST",
      url: SHARE_ROUTE,
      headers: {
        authorization: `Bearer ${reg.token}`,
        "x-lawful-basis-id": basisA.basis_id,
      },
      payload: {
        grantee_entity_id: grantee.entity_id,
        capsule_grants: [
          { capsule_id: capsule.capsule_id, scope: "METADATA_ONLY" },
        ],
      },
      remoteAddress: reg.ip,
    });
    expect(shareRes.statusCode).toBe(201);
    const bridgeId = (shareRes.json() as { bridge_id: string }).bridge_id;
    createdBridgeIds.push(bridgeId);
    // Re-login because SHARE invalidates session.
    const freshLogin = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: (
          await prisma.entity.findUnique({ where: { entity_id: reg.entityId } })
        )?.email,
        password: "regulator-correct-horse",
        requested_operations: ["read", "share"],
      },
      remoteAddress: reg.ip,
    });
    const freshToken = (freshLogin.json() as { token: string }).token;
    // REVOKE with basis B (EU-DE) → denied because substituted actor =
    // EU-DE, capsule = US-FEDERAL.
    const revRes = await app.inject({
      method: "DELETE",
      url: `/api/v1/cosmp/share/${bridgeId}`,
      headers: {
        authorization: `Bearer ${freshToken}`,
        "x-lawful-basis-id": basisB.basis_id,
      },
      remoteAddress: reg.ip,
    });
    expect(revRes.statusCode).toBe(403);
    expect((revRes.json() as { code: string }).code).toBe(
      "CROSS_JURISDICTION_ACCESS_DENIED",
    );
  });

  it("REGULATOR Entity.jurisdiction null does NOT block access when basis.jurisdiction_invoked === capsule.jurisdiction (Q1 basis-authoritative)", async () => {
    // makeRegulatorAndLogin does NOT set Entity.jurisdiction by default,
    // so it stays null. The basis-authoritative substitution at the
    // helper call site means the substituted actor.jurisdiction is the
    // basis.jurisdiction_invoked, not the (null) Entity.jurisdiction.
    const admin = await makePersonAndLogin({ can_admin_niov: true });
    const reg = await makeRegulatorAndLogin({});
    // Substrate-honest assertion: REGULATOR Entity.jurisdiction is null.
    const regEntity = await prisma.entity.findUnique({
      where: { entity_id: reg.entityId },
    });
    expect(regEntity?.jurisdiction).toBeNull();
    const granted = await landGrant(admin, reg.entityId, {
      jurisdiction_invoked: "US-FEDERAL",
    });
    const wallet = await getWalletByEntityId(reg.entityId);
    if (wallet === null) throw new Error("regulator wallet missing");
    const capsule = await createCapsule(
      makeCapsuleInput(wallet.wallet_id, reg.entityId, {
        clearance_required: 0,
        jurisdiction: "US-FEDERAL",
      }),
    );
    const res = await app.inject({
      method: "POST",
      url: NEGOTIATE_ROUTE,
      headers: {
        authorization: `Bearer ${reg.token}`,
        "x-lawful-basis-id": granted.basis_id,
      },
      payload: {
        capsule_id: capsule.capsule_id,
        requested_scope: "METADATA_ONLY",
      },
      remoteAddress: reg.ip,
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { ok: boolean }).ok).toBe(true);
  });

  it("REGULATOR denial audit row carries lawful_basis_id + lawful_basis_chain_hash + capsule jurisdiction + details.lawful_basis_jurisdiction (Q3 audit enrichment)", async () => {
    const admin = await makePersonAndLogin({ can_admin_niov: true });
    const reg = await makeRegulatorAndLogin({});
    const granted = await landGrant(admin, reg.entityId, {
      jurisdiction_invoked: "US-FEDERAL",
    });
    const wallet = await getWalletByEntityId(reg.entityId);
    if (wallet === null) throw new Error("regulator wallet missing");
    const capsule = await createCapsule(
      makeCapsuleInput(wallet.wallet_id, reg.entityId, {
        clearance_required: 0,
        jurisdiction: "EU-DE",
      }),
    );
    const res = await app.inject({
      method: "POST",
      url: NEGOTIATE_ROUTE,
      headers: {
        authorization: `Bearer ${reg.token}`,
        "x-lawful-basis-id": granted.basis_id,
      },
      payload: {
        capsule_id: capsule.capsule_id,
        requested_scope: "METADATA_ONLY",
      },
      remoteAddress: reg.ip,
    });
    expect(res.statusCode).toBe(403);
    // Look up the denial audit row and verify the enriched fields.
    const deniedRow = await prisma.auditEvent.findFirst({
      where: {
        event_type: "NEGOTIATE",
        outcome: "DENIED",
        actor_entity_id: reg.entityId,
        target_capsule_id: capsule.capsule_id,
        denial_reason: "CROSS_JURISDICTION_ACCESS_DENIED",
      },
      orderBy: { timestamp: "desc" },
    });
    expect(deniedRow).not.toBeNull();
    expect(deniedRow?.lawful_basis_id).toBe(granted.basis_id);
    const basisRow = await prisma.lawfulBasis.findUnique({
      where: { basis_id: granted.basis_id },
    });
    expect(deniedRow?.lawful_basis_chain_hash).toBe(basisRow?.chain_hash);
    // Row-level jurisdiction = capsule jurisdiction (per Sub-phase 4 +
    // Sub-phase 5 audit propagation).
    expect(deniedRow?.jurisdiction).toBe("EU-DE");
    // details should include lawful_basis_jurisdiction = basis jurisdiction.
    const details = (deniedRow?.details ?? {}) as Record<string, unknown>;
    expect(details.lawful_basis_jurisdiction).toBe("US-FEDERAL");
    expect(details.actor_jurisdiction).toBe("US-FEDERAL");
    expect(details.target_jurisdiction).toBe("EU-DE");
  });
});
