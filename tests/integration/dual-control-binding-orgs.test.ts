// FILE: dual-control-binding-orgs.test.ts (integration)
// PURPOSE: HTTP-level coverage for the dual-control binding on
//          POST /api/v1/platform/orgs (Operation B; org creation --
//          Dandelion Phase 0; sub-phase G [SEC-DUAL-CONTROL-BINDING-ORGS]).
//          Exercises the full substrate end-to-end against real Postgres:
//          the requireDualControl preHandler (after requireAdminCapability),
//          the Zone U1 audit-event sequence, the EscalationRequest
//          get-or-create + approve lifecycle, executePhase0's own
//          DANDELION_PHASE_0_COMPLETE audit event on the approved path,
//          and the 422 body-validation path. The re-homed can_admin_niov-
//          gate case and the end-to-end-create case (previously in
//          admin-routes.test.ts) live here now -- the route carries the
//          dual-control gate, so a caller without an APPROVED dual-control
//          EscalationRequest gets 403 before executePhase0 runs.
// CONNECTS TO: buildApp (full Fastify wiring), prisma (test seeding +
//              audit/escalation/entity reads), apps/api/src/routes/platform.routes.ts
//              (the route under test), apps/api/src/middleware/dual-control.middleware.ts
//              (the requireDualControl preHandler), escalation.service.ts
//              (createEscalationForCaller / approveEscalationForCaller for
//              the APPROVED-fixture), apps/api/src/security/privileged-endpoints.ts
//              (dualControlDescription -- the description carrier),
//              apps/api/src/services/governance/dandelion.service.ts
//              (executePhase0 -- the handler's org-creation service +
//              DANDELION_PHASE_0_COMPLETE audit event),
//              docs/architecture/dual-control-operations-canonical-record.md
//              §3 + §4 (verification flow + Zone U1 audit-event sequence;
//              Operation B), tests/integration/dual-control-binding-config.test.ts
//              (the sibling Operation A test this file mirrors).
//
// cleanupTestEscalations RATIONALE: same as the sibling config test +
// tests/unit/escalation.test.ts -- EscalationRequest entity relations
// have no onDelete: Cascade, so this file owns its escalation_requests
// cleanup, running BEFORE cleanupTestData() (which hard-deletes the
// test-prefixed Organization / admin Entity / admin twin / default Hive
// rows executePhase0 creates). audit_events are NOT cleaned (the ADR-0002
// BEFORE DELETE trigger forbids it); test isolation comes from fresh-per-
// test admin entities + actor_entity_id filtering + per-test random
// company_name / admin_email (POST /platform/orgs unique-constrains the
// company name).

import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
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
  TEST_PREFIX,
  withCleanRateLimits,
} from "../helpers.js";
import type { FastifyInstance } from "fastify";

const TEST_JWT_SECRET = "dual-control-binding-orgs-test-secret-do-not-use";
const TEST_KEY = randomBytes(32);
const ORG_ACTION_TYPE = "PLATFORM_ORG_CREATION" as const;
const ROUTE_URL = "/api/v1/platform/orgs";

let app: FastifyInstance;
const store = new MemoryRateLimitStore();

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
//        its TAR (mirrors dual-control-binding-config.test.ts).
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

  const ip = `10.96.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 254) + 1}`;
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

// WHAT: Create + approve a dual-control EscalationRequest for the caller on the
//        org-creation action. GOVSEC.5 GAP-C1: the source/initiator may NOT
//        self-approve, so a DISTINCT second human is the target/approver. The
//        caller remains the source, so findApprovedDualControlForCaller(caller, …)
//        — scoped by source_entity_id — still discovers the row. A genuine
//        two-person approval.
async function grantApproval(
  callerEntityId: string,
  expiresAt: Date | null = null,
): Promise<string> {
  const distinctApprover = await createEntity(
    makeEntityInput({ entity_type: "PERSON" }),
  );
  const created = await createEscalationForCaller(callerEntityId, {
    target_entity_id: distinctApprover.entity_id,
    escalation_type: "DUAL_CONTROL_REQUIRED",
    severity: "HIGH",
    description: dualControlDescription(ORG_ACTION_TYPE),
    expires_at: expiresAt,
  });
  await approveEscalationForCaller(
    distinctApprover.entity_id,
    created.escalation_id,
  );
  return created.escalation_id;
}

// WHAT: A fresh, unique POST /platform/orgs body (company_name is
//        unique-constrained, so every test needs a distinct one).
function orgPayload(): {
  company_name: string;
  admin_email: string;
  admin_password: string;
  industry: string;
} {
  return {
    company_name: `${TEST_PREFIX}orgsbindco_${randomUUID()}`,
    admin_email: `${TEST_PREFIX}orgsbindadmin_${randomUUID()}@niov.test`,
    admin_password: "correct-horse-battery",
    industry: "TECH",
  };
}

// ---------------------------------------------------------------------------
// Audit-read helpers
// ---------------------------------------------------------------------------

async function adminAuditEventsFor(entityId: string): Promise<
  Array<{
    event_type: string;
    actor_entity_id: string | null;
    denial_reason: string | null;
    details: Record<string, unknown>;
  }>
> {
  const rows = await prisma.auditEvent.findMany({
    where: { event_type: "ADMIN_ACTION", actor_entity_id: entityId },
    orderBy: { timestamp: "asc" },
  });
  return rows.map((r) => ({
    event_type: r.event_type,
    actor_entity_id: r.actor_entity_id,
    denial_reason: r.denial_reason,
    details: r.details as Record<string, unknown>,
  }));
}

async function dualControlActionsFor(entityId: string): Promise<string[]> {
  const events = await adminAuditEventsFor(entityId);
  return events
    .map((e) => String(e.details.action ?? ""))
    .filter((a) => a.startsWith("DUAL_CONTROL_"));
}

// ---------------------------------------------------------------------------
// Setup / teardown
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
  await cleanupTestEscalations();
  await cleanupTestData();
  await prisma.$disconnect();
});

withCleanRateLimits(store);

beforeEach(async () => {
  await cleanupTestEscalations();
  await cleanupTestData();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /platform/orgs + dual-control binding", () => {
  it("no APPROVED escalation -> 403, creates a PENDING one, writes PRE+LOOKUP+HANDLER_DENIED, executePhase0 never runs", async () => {
    const admin = await makeAdminAndLogin({ can_admin_niov: true });
    const res = await app.inject({
      method: "POST",
      url: ROUTE_URL,
      headers: { authorization: `Bearer ${admin.token}` },
      payload: orgPayload(),
      remoteAddress: admin.ip,
    });

    expect(res.statusCode).toBe(403);
    const body = res.json() as { ok: boolean; error: string; escalation_id: string | null };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("ESCALATION_PENDING");
    expect(body.escalation_id).toMatch(/^[0-9a-f-]{36}$/);

    const escRows = await prisma.escalationRequest.findMany({
      where: { source_entity_id: admin.entityId, escalation_type: "DUAL_CONTROL_REQUIRED" },
    });
    expect(escRows).toHaveLength(1);
    expect(escRows[0]!.status).toBe("PENDING");
    expect(escRows[0]!.description).toBe(dualControlDescription(ORG_ACTION_TYPE));
    expect(escRows[0]!.escalation_id).toBe(body.escalation_id);

    expect(await dualControlActionsFor(admin.entityId)).toEqual([
      "DUAL_CONTROL_VERIFICATION_PRE",
      "DUAL_CONTROL_ESCALATION_LOOKUP",
      "DUAL_CONTROL_HANDLER_DENIED",
    ]);
    const events = await adminAuditEventsFor(admin.entityId);
    expect(events.filter((e) => e.details.action === "ESCALATION_CREATED")).toHaveLength(1);
    // executePhase0 never ran -> no org-creation audit event.
    expect(events.filter((e) => e.details.action === "DANDELION_PHASE_0_COMPLETE")).toHaveLength(0);
  });

  it("APPROVED escalation -> 201, org + admin Entity rows created, writes PRE+LOOKUP+VERIFIED+DELEGATED + executePhase0's DANDELION_PHASE_0_COMPLETE", async () => {
    const admin = await makeAdminAndLogin({ can_admin_niov: true });
    await grantApproval(admin.entityId);

    const res = await app.inject({
      method: "POST",
      url: ROUTE_URL,
      headers: { authorization: `Bearer ${admin.token}` },
      payload: orgPayload(),
      remoteAddress: admin.ip,
    });

    expect(res.statusCode).toBe(201);
    const body = res.json() as {
      ok: boolean;
      org_entity_id: string;
      admin_entity_id: string;
      admin_twin_id: string;
      default_hive_id: string;
    };
    expect(body.ok).toBe(true);
    expect(body.org_entity_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.admin_entity_id).toMatch(/^[0-9a-f-]{36}$/);

    expect(
      await prisma.entity.findUnique({ where: { entity_id: body.org_entity_id } }),
    ).not.toBeNull();
    expect(
      await prisma.entity.findUnique({ where: { entity_id: body.admin_entity_id } }),
    ).not.toBeNull();

    expect(await dualControlActionsFor(admin.entityId)).toEqual([
      "DUAL_CONTROL_VERIFICATION_PRE",
      "DUAL_CONTROL_ESCALATION_LOOKUP",
      "DUAL_CONTROL_APPROVAL_VERIFIED",
      "DUAL_CONTROL_HANDLER_DELEGATED",
    ]);
    const events = await adminAuditEventsFor(admin.entityId);
    const phase0 = events.find((e) => e.details.action === "DANDELION_PHASE_0_COMPLETE");
    expect(phase0).toBeDefined();
    expect(phase0!.details.org_entity_id).toBe(body.org_entity_id);
    expect(phase0!.details.admin_entity_id).toBe(body.admin_entity_id);
  });

  it("a PENDING escalation already exists -> 403, references the existing one, does NOT create a duplicate", async () => {
    const admin = await makeAdminAndLogin({ can_admin_niov: true });
    const original = await createEscalationForCaller(admin.entityId, {
      target_entity_id: admin.entityId,
      escalation_type: "DUAL_CONTROL_REQUIRED",
      severity: "HIGH",
      description: dualControlDescription(ORG_ACTION_TYPE),
    });

    const res = await app.inject({
      method: "POST",
      url: ROUTE_URL,
      headers: { authorization: `Bearer ${admin.token}` },
      payload: orgPayload(),
      remoteAddress: admin.ip,
    });

    expect(res.statusCode).toBe(403);
    expect((res.json() as { escalation_id: string }).escalation_id).toBe(original.escalation_id);

    const escRows = await prisma.escalationRequest.findMany({
      where: {
        source_entity_id: admin.entityId,
        escalation_type: "DUAL_CONTROL_REQUIRED",
        status: "PENDING",
      },
    });
    expect(escRows).toHaveLength(1);
    const events = await adminAuditEventsFor(admin.entityId);
    expect(events.filter((e) => e.details.action === "ESCALATION_CREATED")).toHaveLength(1);
  });

  it("an APPROVED but past-expiry escalation -> 403 with denial_reason ESCALATION_EXPIRED", async () => {
    const admin = await makeAdminAndLogin({ can_admin_niov: true });
    const escId = await grantApproval(admin.entityId, new Date(Date.now() - 60_000));

    const res = await app.inject({
      method: "POST",
      url: ROUTE_URL,
      headers: { authorization: `Bearer ${admin.token}` },
      payload: orgPayload(),
      remoteAddress: admin.ip,
    });

    expect(res.statusCode).toBe(403);
    const body = res.json() as { error: string; escalation_id: string | null };
    expect(body.error).toBe("ESCALATION_EXPIRED");
    expect(body.escalation_id).toBe(escId);

    expect(await dualControlActionsFor(admin.entityId)).toEqual([
      "DUAL_CONTROL_VERIFICATION_PRE",
      "DUAL_CONTROL_ESCALATION_LOOKUP",
      "DUAL_CONTROL_HANDLER_DENIED",
    ]);
    const events = await adminAuditEventsFor(admin.entityId);
    const denied = events.find((e) => e.details.action === "DUAL_CONTROL_HANDLER_DENIED")!;
    expect(denied.denial_reason).toBe("ESCALATION_EXPIRED");
    expect(events.filter((e) => e.details.action === "DANDELION_PHASE_0_COMPLETE")).toHaveLength(0);
  });

  it("caller lacking can_admin_niov -> 403 ADMIN_CAPABILITY_REQUIRED from requireAdminCapability BEFORE requireDualControl runs (re-homed; zero dual-control audit events)", async () => {
    const nonAdmin = await makeAdminAndLogin({ can_admin_niov: false });
    const res = await app.inject({
      method: "POST",
      url: ROUTE_URL,
      headers: { authorization: `Bearer ${nonAdmin.token}` },
      payload: orgPayload(),
      remoteAddress: nonAdmin.ip,
    });

    expect(res.statusCode).toBe(403);
    const body = res.json() as { error: string; required: string };
    expect(body.error).toBe("ADMIN_CAPABILITY_REQUIRED");
    expect(body.required).toBe("can_admin_niov");
    expect(await dualControlActionsFor(nonAdmin.entityId)).toEqual([]);
    expect(
      await prisma.escalationRequest.findMany({
        where: { source_entity_id: nonAdmin.entityId, escalation_type: "DUAL_CONTROL_REQUIRED" },
      }),
    ).toHaveLength(0);
  });

  it("idempotent verification (Pattern 5): an APPROVED escalation replayed -> 201 both times, both DELEGATED events reference the same escalation_id, two distinct org rows", async () => {
    const admin = await makeAdminAndLogin({ can_admin_niov: true });
    const escId = await grantApproval(admin.entityId);

    const res1 = await app.inject({
      method: "POST",
      url: ROUTE_URL,
      headers: { authorization: `Bearer ${admin.token}` },
      payload: orgPayload(),
      remoteAddress: admin.ip,
    });
    expect(res1.statusCode).toBe(201);

    const res2 = await app.inject({
      method: "POST",
      url: ROUTE_URL,
      headers: { authorization: `Bearer ${admin.token}` },
      payload: orgPayload(),
      remoteAddress: admin.ip,
    });
    expect(res2.statusCode).toBe(201);

    const org1 = (res1.json() as { org_entity_id: string }).org_entity_id;
    const org2 = (res2.json() as { org_entity_id: string }).org_entity_id;
    expect(org1).not.toBe(org2);

    const events = await adminAuditEventsFor(admin.entityId);
    const delegated = events.filter((e) => e.details.action === "DUAL_CONTROL_HANDLER_DELEGATED");
    expect(delegated).toHaveLength(2);
    expect(delegated.every((e) => e.details.escalation_id === escId)).toBe(true);
  });

  it("re-homed end-to-end create: APPROVED escalation -> 201 and the created org admin can log in afterward", async () => {
    const admin = await makeAdminAndLogin({ can_admin_niov: true });
    await grantApproval(admin.entityId);
    const orgAdminEmail = `${TEST_PREFIX}orgsbinde2eadmin_${randomUUID()}@niov.test`;
    const orgAdminPassword = "correct-horse-battery";

    const res = await app.inject({
      method: "POST",
      url: ROUTE_URL,
      headers: { authorization: `Bearer ${admin.token}` },
      payload: {
        company_name: `${TEST_PREFIX}orgsbinde2eco_${randomUUID()}`,
        admin_email: orgAdminEmail,
        admin_password: orgAdminPassword,
        industry: "TECH",
        admin_first_name: "Org",
        admin_last_name: "Admin",
      },
      remoteAddress: admin.ip,
    });
    expect(res.statusCode).toBe(201);
    expect((res.json() as { ok: boolean }).ok).toBe(true);

    const adminLogin = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: orgAdminEmail,
        password: orgAdminPassword,
        requested_operations: ["read"],
      },
      remoteAddress: `10.95.${Math.floor(Math.random() * 254) + 1}.${Math.floor(Math.random() * 254) + 1}`,
    });
    expect(adminLogin.statusCode).toBe(200);
  });

  it("re-homed body-validation: missing company_name + APPROVED escalation -> 422 INVALID_REQUEST; dual-control still passes (4 events) but executePhase0 never runs (no DANDELION_PHASE_0_COMPLETE)", async () => {
    const admin = await makeAdminAndLogin({ can_admin_niov: true });
    await grantApproval(admin.entityId);

    const res = await app.inject({
      method: "POST",
      url: ROUTE_URL,
      headers: { authorization: `Bearer ${admin.token}` },
      payload: {
        admin_email: `${TEST_PREFIX}orgsbind422_${randomUUID()}@niov.test`,
        admin_password: "x",
        industry: "TECH",
      },
      remoteAddress: admin.ip,
    });

    expect(res.statusCode).toBe(422);
    expect((res.json() as { code: string }).code).toBe("INVALID_REQUEST");

    expect(await dualControlActionsFor(admin.entityId)).toEqual([
      "DUAL_CONTROL_VERIFICATION_PRE",
      "DUAL_CONTROL_ESCALATION_LOOKUP",
      "DUAL_CONTROL_APPROVAL_VERIFIED",
      "DUAL_CONTROL_HANDLER_DELEGATED",
    ]);
    const events = await adminAuditEventsFor(admin.entityId);
    expect(events.filter((e) => e.details.action === "DANDELION_PHASE_0_COMPLETE")).toHaveLength(0);
  });
});
