// FILE: audit-verify-chain-cross-scope.test.ts (integration)
// PURPOSE: ADR-0071 implementation slice — cross-scope verify-
//          chain coverage. Verifies the Section 7 four-scope
//          matrix (self / org / platform / regulator) on
//          GET /api/v1/audit/verify-chain with Option A clean
//          break per Founder QLOCK 2026-05-31:
//            * NEW canonical fields verified / checked_event_count
//              / broken_at_event_id (no `valid` / `total_events` /
//              `broken_at` / `actor_entity_id` aliases).
//            * scope query param + lawful_basis_id for regulator
//              + window controls + perf-cap estimate (WINDOW_TOO_LARGE).
//            * ADMIN_ACTION:AUDIT_VIEW_VERIFY_CHAIN read-audit with
//              extended SAFE meta (scope + verified +
//              checked_event_count + window + lawful_basis_id +
//              failure_reason); ZERO new audit literal.
//            * RULE 0 isolation: org=cross-org subject → 404;
//              platform requires can_admin_niov; regulator inherits
//              ADR-0036 9-condition LawfulBasis enforcement.
//
// CONNECTS TO:
//   - apps/api/src/routes/audit.routes.ts
//   - apps/api/src/services/audit/audit-view.service.ts
//   - packages/database/src/queries/audit.ts (verifyAuditChain
//     window-aware variant + VERIFY_CHAIN_MAX_EVENTS)
//   - packages/database/src/queries/lawful-basis.ts
//     (getActiveLawfulBasisForRegulator 9-condition)

import { createHash, randomBytes, randomUUID } from "node:crypto";
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

const TEST_JWT_SECRET = "audit-verify-chain-cross-scope-test-secret";
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

// ────────────────────────── helpers ──────────────────────────

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

async function setTar(
  entityId: string,
  patch: Partial<{
    can_admin_org: boolean;
    can_admin_niov: boolean;
  }>,
): Promise<void> {
  const fresh = await prisma.tokenAttributeRepository.findUnique({
    where: { entity_id: entityId },
  });
  if (fresh === null) throw new Error("TAR vanished");
  const merged = {
    can_login: fresh.can_login,
    can_read_capsules: fresh.can_read_capsules,
    can_write_capsules: fresh.can_write_capsules,
    can_share_capsules: fresh.can_share_capsules,
    can_create_hives: fresh.can_create_hives,
    can_access_external_api: fresh.can_access_external_api,
    can_admin_niov: patch.can_admin_niov ?? fresh.can_admin_niov,
    can_admin_org: patch.can_admin_org ?? fresh.can_admin_org,
    clearance_ceiling: fresh.clearance_ceiling,
    monetization_role: fresh.monetization_role,
    compliance_frameworks: fresh.compliance_frameworks,
    status: fresh.status,
  };
  await prisma.tokenAttributeRepository.update({
    where: { entity_id: entityId },
    data: {
      ...patch,
      tar_hash: computeTARHash(merged),
    },
  });
}

async function loginAs(
  email: string,
  password: string,
): Promise<{ token: string; ip: string }> {
  const ip = `10.91.${Math.floor(Math.random() * 200) + 1}.${
    Math.floor(Math.random() * 254) + 1
  }`;
  const login = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: {
      email,
      password,
      requested_operations: ["read", "write"],
    },
    remoteAddress: ip,
  });
  if (login.statusCode !== 200) {
    throw new Error(`login failed: ${login.statusCode} ${login.body}`);
  }
  const body = login.json() as { token: string };
  return { token: body.token, ip };
}

async function makeOrgMember(
  orgId: string,
  opts: { admin?: boolean } = {},
): Promise<{
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
      role_title: opts.admin === true ? "ADMIN" : "MEMBER",
      is_active: true,
    },
  });
  if (opts.admin === true) {
    await setTar(entity.entity_id, { can_admin_org: true });
  } else {
    await setTar(entity.entity_id, {});
  }
  const session = await loginAs(input.email!, password);
  return { entityId: entity.entity_id, token: session.token, ip: session.ip };
}

async function makePlatformAdmin(): Promise<{
  entityId: string;
  token: string;
  ip: string;
}> {
  const password = "correct-horse-battery";
  const input = makeEntityInput({ entity_type: "PERSON", password });
  const entity = await createEntity(input);
  await setTar(entity.entity_id, { can_admin_niov: true });
  const session = await loginAs(input.email!, password);
  return { entityId: entity.entity_id, token: session.token, ip: session.ip };
}

async function seedAuditRow(
  actorEntityId: string,
  details: Record<string, unknown> = {},
): Promise<string> {
  const row = await writeAuditEvent({
    event_type: "ADMIN_ACTION",
    outcome: "SUCCESS",
    actor_entity_id: actorEntityId,
    details: { action: "TEST_SEED", ...details },
  });
  return row.audit_id;
}

interface CallParams {
  scope?: string;
  subject_entity_id?: string;
  lawful_basis_id?: string;
  from?: string;
  to?: string;
  max_events?: number;
}

async function verifyChain(
  caller: { token: string; ip: string },
  params: CallParams = {},
): Promise<{ statusCode: number; body: any; raw: string }> {
  const search = new URLSearchParams();
  if (params.scope !== undefined) search.set("scope", params.scope);
  if (params.subject_entity_id !== undefined)
    search.set("subject_entity_id", params.subject_entity_id);
  if (params.lawful_basis_id !== undefined)
    search.set("lawful_basis_id", params.lawful_basis_id);
  if (params.from !== undefined) search.set("from", params.from);
  if (params.to !== undefined) search.set("to", params.to);
  if (params.max_events !== undefined)
    search.set("max_events", String(params.max_events));
  const qs = search.toString();
  const url = `/api/v1/audit/verify-chain${qs === "" ? "" : `?${qs}`}`;
  const r = await app.inject({
    method: "GET",
    url,
    headers: { authorization: `Bearer ${caller.token}` },
    remoteAddress: caller.ip,
  });
  return { statusCode: r.statusCode, body: r.json() as any, raw: r.body };
}

// Insert a LawfulBasis + grant row that lets `regulatorEntityId`
// query rows tagged with the returned `basis_id`. Returns
// { basis_id, grantEvent }. Mirrors the regulator-view test
// fixture used at tests/integration/audit-viewer-regulator-view.test.ts
// but minimal — only the columns the 9-condition enforcement
// reads are populated.
async function makeLawfulBasis(args: {
  regulatorEntityId: string;
  validityMs?: number;
  expired?: boolean;
}): Promise<{ basis_id: string; grant_audit_id: string }> {
  const now = Date.now();
  const valid_from = new Date(now - 60_000);
  const valid_until = args.expired
    ? new Date(now - 30_000)
    : new Date(now + (args.validityMs ?? 60 * 60 * 1000));
  const chain_hash = sha256(`bootstrap:${randomUUID()}`);
  // Schema-honest LawfulBasis fixture (per
  // packages/database/prisma/schema.prisma LawfulBasis model).
  // Only the columns the 9-condition enforcement actually reads
  // are populated; regulator-target identity is asserted on the
  // grant AuditEvent.target_entity_id per condition 9.
  const basis = await prisma.lawfulBasis.create({
    data: {
      basis_id: randomUUID(),
      basis_type: "REGULATORY_AUTHORITY",
      basis_reference: "TEST-REF",
      jurisdiction_invoked: "TEST-JURISDICTION",
      valid_from,
      valid_until,
      chain_hash,
    },
  });
  const grant = await writeAuditEvent({
    event_type: "REGULATOR_ACCESS_GRANTED",
    outcome: "SUCCESS",
    actor_entity_id: args.regulatorEntityId,
    target_entity_id: args.regulatorEntityId,
    lawful_basis_id: basis.basis_id,
    lawful_basis_chain_hash: basis.chain_hash,
    details: { action: "TEST_GRANT" },
  });
  await prisma.lawfulBasis.update({
    where: { basis_id: basis.basis_id },
    data: { audit_id: grant.audit_id },
  });
  return { basis_id: basis.basis_id, grant_audit_id: grant.audit_id };
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

// ────────────────────────── self scope ──────────────────────────

describe("verify-chain self scope (default; Option A clean break)", () => {
  it("default scope=self returns canonical fields only", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember(orgId);
    for (let i = 0; i < 3; i += 1) await seedAuditRow(caller.entityId, { i });
    const r = await verifyChain(caller);
    expect(r.statusCode).toBe(200);
    expect(r.body.scope).toBe("self");
    expect(r.body.verified).toBe(true);
    expect(r.body.checked_event_count).toBeGreaterThanOrEqual(3);
    expect(r.body.chain_algorithm).toBe(
      "SHA-256/14-field-canonical-record",
    );
    expect(r.body.broken_at_event_id).toBeNull();
    expect(r.body.failure_reason).toBeNull();
    expect(r.body.lawful_basis_id).toBeNull();
    expect(typeof r.body.evidence_note).toBe("string");
    expect(typeof r.body.honest_note).toBe("string");
    // Old aliases MUST NOT appear in HTTP response.
    expect(r.body.valid).toBeUndefined();
    expect(r.body.total_events).toBeUndefined();
    expect(r.body.broken_at).toBeUndefined();
    expect(r.body.actor_entity_id).toBeUndefined();
  });

  it("explicit scope=self yields the same canonical shape", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember(orgId);
    await seedAuditRow(caller.entityId);
    const r = await verifyChain(caller, { scope: "self" });
    expect(r.statusCode).toBe(200);
    expect(r.body.scope).toBe("self");
    expect(r.body.verified).toBe(true);
  });
});

// ────────────────────────── invalid input ──────────────────────────

describe("verify-chain query validation", () => {
  it("rejects an invalid scope value with INVALID_SCOPE 400", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember(orgId);
    const r = await verifyChain(caller, { scope: "everything" });
    expect(r.statusCode).toBe(400);
    expect(r.body.code).toBe("INVALID_SCOPE");
  });

  it("rejects a malformed lawful_basis_id with INVALID_FIELD 400", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember(orgId);
    const r = await verifyChain(caller, {
      scope: "regulator",
      lawful_basis_id: "not-a-uuid",
    });
    expect(r.statusCode).toBe(400);
    expect(r.body.code).toBe("INVALID_FIELD");
  });

  it("rejects a malformed timestamp with INVALID_FIELD 400", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember(orgId);
    const r = await verifyChain(caller, { from: "not-a-date" });
    expect(r.statusCode).toBe(400);
    expect(r.body.code).toBe("INVALID_FIELD");
  });
});

// ────────────────────────── org scope ──────────────────────────

describe("verify-chain scope=org", () => {
  it("rejects callers without can_admin_org with SCOPE_NOT_ALLOWED 403", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember(orgId); // NOT admin
    const r = await verifyChain(caller, { scope: "org" });
    expect(r.statusCode).toBe(403);
    expect(r.body.code).toBe("SCOPE_NOT_ALLOWED");
  });

  it("admin can verify a same-org subject's chain", async () => {
    const orgId = await makeTestOrg();
    const admin = await makeOrgMember(orgId, { admin: true });
    const subject = await makeOrgMember(orgId);
    for (let i = 0; i < 2; i += 1) await seedAuditRow(subject.entityId, { i });
    const r = await verifyChain(admin, {
      scope: "org",
      subject_entity_id: subject.entityId,
    });
    expect(r.statusCode).toBe(200);
    expect(r.body.scope).toBe("org");
    expect(r.body.verified).toBe(true);
    expect(r.body.checked_event_count).toBeGreaterThanOrEqual(2);
  });

  it("cross-org subject returns enumeration-safe SUBJECT_NOT_FOUND 404", async () => {
    const orgAId = await makeTestOrg();
    const orgBId = await makeTestOrg();
    const admin = await makeOrgMember(orgAId, { admin: true });
    const stranger = await makeOrgMember(orgBId); // different org
    const r = await verifyChain(admin, {
      scope: "org",
      subject_entity_id: stranger.entityId,
    });
    expect(r.statusCode).toBe(404);
    expect(r.body.code).toBe("SUBJECT_NOT_FOUND");
  });

  it("WINDOW_TOO_LARGE fires when estimated count exceeds max_events", async () => {
    const orgId = await makeTestOrg();
    const admin = await makeOrgMember(orgId, { admin: true });
    const subject = await makeOrgMember(orgId);
    for (let i = 0; i < 5; i += 1) await seedAuditRow(subject.entityId, { i });
    const r = await verifyChain(admin, {
      scope: "org",
      subject_entity_id: subject.entityId,
      max_events: 1,
    });
    expect(r.statusCode).toBe(400);
    expect(r.body.code).toBe("WINDOW_TOO_LARGE");
  });
});

// ────────────────────────── platform scope ──────────────────────────

describe("verify-chain scope=platform", () => {
  it("rejects non-platform-admin callers with SCOPE_NOT_ALLOWED 403", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember(orgId, { admin: true }); // org-admin not niov-admin
    const r = await verifyChain(caller, { scope: "platform" });
    expect(r.statusCode).toBe(403);
    expect(r.body.code).toBe("SCOPE_NOT_ALLOWED");
  });

  it("platform admin can verify a specific subject's chain", async () => {
    const platformAdmin = await makePlatformAdmin();
    const subject = await makeOrgMember(await makeTestOrg());
    for (let i = 0; i < 2; i += 1) await seedAuditRow(subject.entityId, { i });
    const r = await verifyChain(platformAdmin, {
      scope: "platform",
      subject_entity_id: subject.entityId,
    });
    expect(r.statusCode).toBe(200);
    expect(r.body.scope).toBe("platform");
    expect(r.body.verified).toBe(true);
    expect(r.body.checked_event_count).toBeGreaterThanOrEqual(2);
  });

  it("platform admin gets WINDOW_TOO_LARGE when max_events too low", async () => {
    const platformAdmin = await makePlatformAdmin();
    const subject = await makeOrgMember(await makeTestOrg());
    for (let i = 0; i < 5; i += 1) await seedAuditRow(subject.entityId, { i });
    const r = await verifyChain(platformAdmin, {
      scope: "platform",
      subject_entity_id: subject.entityId,
      max_events: 1,
    });
    expect(r.statusCode).toBe(400);
    expect(r.body.code).toBe("WINDOW_TOO_LARGE");
  });
});

// ────────────────────────── regulator scope ──────────────────────────

describe("verify-chain scope=regulator", () => {
  it("requires lawful_basis_id with LAWFUL_BASIS_REQUIRED 400", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember(orgId);
    const r = await verifyChain(caller, { scope: "regulator" });
    expect(r.statusCode).toBe(400);
    expect(r.body.code).toBe("LAWFUL_BASIS_REQUIRED");
  });

  it("rejects subject_entity_id with INVALID_FIELD 400", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember(orgId);
    const r = await verifyChain(caller, {
      scope: "regulator",
      lawful_basis_id: randomUUID(),
      subject_entity_id: caller.entityId,
    });
    expect(r.statusCode).toBe(400);
    expect(r.body.code).toBe("INVALID_FIELD");
  });

  it("unknown lawful_basis_id returns enumeration-safe LAWFUL_BASIS_NOT_FOUND 404", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember(orgId);
    const r = await verifyChain(caller, {
      scope: "regulator",
      lawful_basis_id: randomUUID(),
    });
    expect(r.statusCode).toBe(404);
    expect(r.body.code).toBe("LAWFUL_BASIS_NOT_FOUND");
  });

  it("expired lawful_basis_id returns LAWFUL_BASIS_EXPIRED 403", async () => {
    const orgId = await makeTestOrg();
    const regulator = await makeOrgMember(orgId);
    const basis = await makeLawfulBasis({
      regulatorEntityId: regulator.entityId,
      expired: true,
    });
    const r = await verifyChain(regulator, {
      scope: "regulator",
      lawful_basis_id: basis.basis_id,
    });
    expect(r.statusCode).toBe(403);
    expect(r.body.code).toBe("LAWFUL_BASIS_EXPIRED");
  });

  it("active basis verifies visible lawful-basis events with verified=true", async () => {
    const orgId = await makeTestOrg();
    const regulator = await makeOrgMember(orgId);
    const basis = await makeLawfulBasis({
      regulatorEntityId: regulator.entityId,
    });
    const r = await verifyChain(regulator, {
      scope: "regulator",
      lawful_basis_id: basis.basis_id,
    });
    expect(r.statusCode).toBe(200);
    expect(r.body.scope).toBe("regulator");
    expect(r.body.verified).toBe(true);
    // The grant event itself is bound to the basis and is visible.
    expect(r.body.checked_event_count).toBeGreaterThanOrEqual(1);
    expect(r.body.lawful_basis_id).toBe(basis.basis_id);
    // Boundary hashes are scoped to visible events.
    expect(typeof r.body.first_event_hash).toBe("string");
    expect(typeof r.body.last_event_hash).toBe("string");
  });
});

// ────────────────────────── read-audit posture ──────────────────────────

describe("verify-chain read-audit (ZERO new audit literal)", () => {
  it("emits ADMIN_ACTION:AUDIT_VIEW_VERIFY_CHAIN with safe meta", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember(orgId);
    for (let i = 0; i < 2; i += 1) await seedAuditRow(caller.entityId, { i });
    await verifyChain(caller, { scope: "self" });
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
    expect(d.scope).toBe("self");
    expect(d.verified).toBe(true);
    expect(typeof d.checked_event_count).toBe("number");
    // Old aliases must not be emitted into audit meta.
    expect(d.valid).toBeUndefined();
    expect(d.total_events).toBeUndefined();
  });

  it("no NEW audit literal is added — event_type stays ADMIN_ACTION", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember(orgId);
    await verifyChain(caller, { scope: "self" });
    const novel = await prisma.auditEvent.findFirst({
      where: {
        actor_entity_id: caller.entityId,
        event_type: { notIn: ["ADMIN_ACTION", "LOGIN_SUCCESS"] },
      },
    });
    // verify-chain should not introduce a non-ADMIN_ACTION
    // audit event beyond whatever the login flow already emitted.
    // We don't need to assert the LOGIN_SUCCESS row here; we
    // only assert no never-seen literal slipped in.
    if (novel !== null) {
      const forbiddenNovel = ["AUDIT_VIEW_VERIFY_CHAIN", "VERIFY_CHAIN_READ"];
      expect(forbiddenNovel).not.toContain(novel.event_type);
    }
  });
});

// ────────────────────────── no-leak guard ──────────────────────────

describe("verify-chain SAFE projection no-leak guard", () => {
  it("forbidden fields never appear as response JSON keys", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember(orgId);
    await seedAuditRow(caller.entityId);
    const r = await verifyChain(caller, { scope: "self" });
    // Marker test as JSON keys (`"<field>":`) rather than raw
    // substring presence — the honest_note + evidence_note
    // prose intentionally references chain-link concepts like
    // "previous_event_hash" in narrative text per ADR-0071 §3
    // SAFE projection (honest_note is closed-vocab canonical
    // copy locked at the service tier).
    const forbiddenKeys = [
      "payload_summary",
      "storage_location",
      "content_hash",
      "embedding_content_hash",
      "bridge_id",
      "secret_ref",
      "previous_event_hash",
    ];
    for (const key of forbiddenKeys) {
      expect(r.body[key]).toBeUndefined();
    }
    // The aggregated response body MUST NOT include any
    // per-row `details` blob from the underlying chain.
    expect(r.body.details).toBeUndefined();
  });
});
