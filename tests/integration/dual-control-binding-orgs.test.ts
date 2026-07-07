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
  canonicalDualControlPayload,
  consumeApprovedDualControlInTx,
  createEscalationForCaller,
  dualControlDescription,
  MemoryContentStore,
  MemoryNonceStore,
  MemoryRateLimitStore,
} from "@niov/api";
import { ContentEncryption } from "@niov/auth";
import { computeTARHash, createEntity, prisma } from "@niov/database";
import type { Prisma } from "@niov/database";
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

// WHAT: Seed a distinct PERSON entity with can_admin_niov on its TAR so the
//        ADR-0026 Amendment 1 Phase E resolver can select a structurally
//        independent platform-admin approver for the org-creation action.
// INPUT: None.
// OUTPUT: The new platform-admin's entity_id.
// WHY: Mirrors dual-control-binding-config.test.ts:seedDistinctPlatformAdmin.
//      Tests that exercise the "no APPROVED -> 403 ESCALATION_PENDING + PENDING
//      row created" path must seed a second platform-admin so the resolver
//      class C path succeeds; otherwise the single-admin deployment fails
//      closed at 503 with the DUAL_CONTROL_NO_APPROVER_AVAILABLE marker.
async function seedDistinctPlatformAdmin(): Promise<string> {
  const entity = await createEntity(
    makeEntityInput({ entity_type: "PERSON" }),
  );
  await prisma.tokenAttributeRepository.update({
    where: { entity_id: entity.entity_id },
    data: { can_admin_niov: true },
  });
  const fresh = await prisma.tokenAttributeRepository.findUnique({
    where: { entity_id: entity.entity_id },
  });
  if (fresh === null) throw new Error("TAR vanished mid-seed");
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
  return entity.entity_id;
}

// WHAT: Create + approve a dual-control EscalationRequest for the caller on the
//        org-creation action. GOVSEC.5 GAP-C1: the source/initiator may NOT
//        self-approve, so a DISTINCT second human is the target/approver. The
//        caller remains the source, so findApprovedDualControlForCaller(caller, …)
//        — scoped by source_entity_id — still discovers the row. A genuine
//        two-person approval.
//        [G1-DUAL-CONTROL] Org creation is payload-bound: the approval is
//        stamped with the canonical hash of the EXACT body it authorizes
//        (admin_password redacted), mirroring what the middleware stamps on
//        the auto-created PENDING row.
async function grantApproval(
  callerEntityId: string,
  payload: Record<string, unknown>,
  expiresAt: Date | null = null,
): Promise<string> {
  const distinctApprover = await createEntity(
    makeEntityInput({ entity_type: "PERSON" }),
  );
  const bound = canonicalDualControlPayload(payload, ["admin_password"]);
  const created = await createEscalationForCaller(callerEntityId, {
    target_entity_id: distinctApprover.entity_id,
    escalation_type: "DUAL_CONTROL_REQUIRED",
    severity: "HIGH",
    description: dualControlDescription(ORG_ACTION_TYPE),
    expires_at: expiresAt,
    resolution_metadata: {
      dual_control: {
        algo: "sha256-canonical-json-v1",
        payload_hash: bound.payload_hash,
        redacted_fields: bound.redacted_fields,
      },
    } as Prisma.InputJsonValue,
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
    const distinctApprover = await seedDistinctPlatformAdmin();
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
    // ADR-0026 Amendment 1 Phase E (Test 7 of §9): auto-created target is a
    // structurally independent approver, never the caller. With two admins
    // and Class C deterministic lowest-entity_id selection, the only non-
    // caller candidate is distinctApprover.
    expect(escRows[0]!.target_entity_id).not.toBe(admin.entityId);
    expect(escRows[0]!.target_entity_id).toBe(distinctApprover);
    expect(escRows[0]!.source_entity_id).toBe(admin.entityId);
    expect(escRows[0]!.resolved_by_entity_id).toBeNull();

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
    const payload = orgPayload();
    await grantApproval(admin.entityId, payload);

    const res = await app.inject({
      method: "POST",
      url: ROUTE_URL,
      headers: { authorization: `Bearer ${admin.token}` },
      payload,
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

    // [G1-DUAL-CONTROL] the success path ends with the approval being
    // spent inside executePhase0's transaction.
    expect(await dualControlActionsFor(admin.entityId)).toEqual([
      "DUAL_CONTROL_VERIFICATION_PRE",
      "DUAL_CONTROL_ESCALATION_LOOKUP",
      "DUAL_CONTROL_APPROVAL_VERIFIED",
      "DUAL_CONTROL_HANDLER_DELEGATED",
      "DUAL_CONTROL_APPROVAL_CONSUMED",
    ]);
    const events = await adminAuditEventsFor(admin.entityId);
    const phase0 = events.find((e) => e.details.action === "DANDELION_PHASE_0_COMPLETE");
    expect(phase0).toBeDefined();
    expect(phase0!.details.org_entity_id).toBe(body.org_entity_id);
    expect(phase0!.details.admin_entity_id).toBe(body.admin_entity_id);
  });

  it("a PENDING escalation already exists -> 403, references the existing one, does NOT create a duplicate", async () => {
    const admin = await makeAdminAndLogin({ can_admin_niov: true });
    const preSeededApprover = await seedDistinctPlatformAdmin();
    // Pre-seed a PENDING dual-control row with a real distinct approver
    // (Phase E target shape -- target_entity_id !== source_entity_id is the
    // structural Invariant 2). [G1-DUAL-CONTROL] org creation is
    // payload-bound, so the dedup keys on (source, escalation_type, status,
    // description, payload_hash) -- the pre-seeded row carries the hash of
    // the exact body the POST will send; the auto-create path finds and
    // returns this row without writing a duplicate.
    const payload = orgPayload();
    const bound = canonicalDualControlPayload(payload, ["admin_password"]);
    const original = await createEscalationForCaller(admin.entityId, {
      target_entity_id: preSeededApprover,
      escalation_type: "DUAL_CONTROL_REQUIRED",
      severity: "HIGH",
      description: dualControlDescription(ORG_ACTION_TYPE),
      resolution_metadata: {
        dual_control: {
          algo: "sha256-canonical-json-v1",
          payload_hash: bound.payload_hash,
          redacted_fields: bound.redacted_fields,
        },
      },
    });

    const res = await app.inject({
      method: "POST",
      url: ROUTE_URL,
      headers: { authorization: `Bearer ${admin.token}` },
      payload,
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
    const payload = orgPayload();
    const escId = await grantApproval(
      admin.entityId,
      payload,
      new Date(Date.now() - 60_000),
    );

    const res = await app.inject({
      method: "POST",
      url: ROUTE_URL,
      headers: { authorization: `Bearer ${admin.token}` },
      payload,
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

  it("[G1-DUAL-CONTROL] single-use: after a successful 201 the approval is CONSUMED (APPROVED -> EXPIRED + consumed_at + CONSUMED audit); replaying the identical payload -> 403 with a NEW pending escalation, exactly one org row", async () => {
    const admin = await makeAdminAndLogin({ can_admin_niov: true });
    // A second platform admin must exist so the replay's denied path can
    // resolve a Class C approver for the fresh PENDING escalation.
    await seedDistinctPlatformAdmin();
    const payload = orgPayload();
    const escId = await grantApproval(admin.entityId, payload);

    const res1 = await app.inject({
      method: "POST",
      url: ROUTE_URL,
      headers: { authorization: `Bearer ${admin.token}` },
      payload,
      remoteAddress: admin.ip,
    });
    expect(res1.statusCode).toBe(201);

    // The approval is spent: APPROVED -> EXPIRED, consumed_at stamped,
    // DUAL_CONTROL_APPROVAL_CONSUMED written in the same transaction.
    const spent = await prisma.escalationRequest.findUnique({
      where: { escalation_id: escId },
    });
    expect(spent!.status).toBe("EXPIRED");
    const spentMeta = spent!.resolution_metadata as {
      dual_control: { consumed_at?: string; consumed_by_entity_id?: string };
    };
    expect(spentMeta.dual_control.consumed_at).toBeDefined();
    expect(spentMeta.dual_control.consumed_by_entity_id).toBe(admin.entityId);

    const res2 = await app.inject({
      method: "POST",
      url: ROUTE_URL,
      headers: { authorization: `Bearer ${admin.token}` },
      payload,
      remoteAddress: admin.ip,
    });
    expect(res2.statusCode).toBe(403);
    const denied = res2.json() as { error: string; escalation_id: string };
    expect(denied.error).toBe("ESCALATION_PENDING");
    expect(denied.escalation_id).not.toBe(escId);

    // Exactly ONE org landed; the replay created nothing.
    const org1 = (res1.json() as { org_entity_id: string }).org_entity_id;
    const orgRows = await prisma.entity.findMany({
      where: { entity_type: "COMPANY", display_name: payload.company_name },
    });
    expect(orgRows).toHaveLength(1);
    expect(orgRows[0]!.entity_id).toBe(org1);

    const events = await adminAuditEventsFor(admin.entityId);
    const consumed = events.filter(
      (e) => e.details.action === "DUAL_CONTROL_APPROVAL_CONSUMED",
    );
    expect(consumed).toHaveLength(1);
    expect(consumed[0]!.details.escalation_id).toBe(escId);
    const delegated = events.filter(
      (e) => e.details.action === "DUAL_CONTROL_HANDLER_DELEGATED",
    );
    expect(delegated).toHaveLength(1);
  });

  it("[G1-DUAL-CONTROL] payload-bound: an approval for payload A does NOT authorize payload B -> 403 + a new PENDING carrying B's hash; A's approval stays unspent; no org rows", async () => {
    const admin = await makeAdminAndLogin({ can_admin_niov: true });
    await seedDistinctPlatformAdmin();
    const payloadA = orgPayload();
    const payloadB = orgPayload();
    const escId = await grantApproval(admin.entityId, payloadA);

    const res = await app.inject({
      method: "POST",
      url: ROUTE_URL,
      headers: { authorization: `Bearer ${admin.token}` },
      payload: payloadB,
      remoteAddress: admin.ip,
    });

    expect(res.statusCode).toBe(403);
    const body = res.json() as { error: string; escalation_id: string };
    expect(body.error).toBe("ESCALATION_PENDING");
    expect(body.escalation_id).not.toBe(escId);

    // The new PENDING escalation is stamped with B's hash, so the approver
    // decides that exact payload.
    const pending = await prisma.escalationRequest.findUnique({
      where: { escalation_id: body.escalation_id },
    });
    expect(pending!.status).toBe("PENDING");
    const boundB = canonicalDualControlPayload(payloadB, ["admin_password"]);
    const pendingMeta = pending!.resolution_metadata as {
      dual_control: { payload_hash: string };
    };
    expect(pendingMeta.dual_control.payload_hash).toBe(boundB.payload_hash);

    // A's approval was neither matched nor spent.
    const approvalA = await prisma.escalationRequest.findUnique({
      where: { escalation_id: escId },
    });
    expect(approvalA!.status).toBe("APPROVED");

    // No org was created for either payload.
    expect(
      await prisma.entity.findMany({
        where: {
          entity_type: "COMPANY",
          display_name: { in: [payloadA.company_name, payloadB.company_name] },
        },
      }),
    ).toHaveLength(0);
  });

  it("[G1-DUAL-CONTROL] admin_password is redacted from the binding: the same payload with a DIFFERENT password still matches the approval -> 201; no plaintext password in escalation metadata or dual-control audit details", async () => {
    const admin = await makeAdminAndLogin({ can_admin_niov: true });
    const approvedPassword = "approved-password-9-horse";
    const sentPassword = "different-password-7-staple";
    const payload = { ...orgPayload(), admin_password: approvedPassword };
    const escId = await grantApproval(admin.entityId, payload);

    const res = await app.inject({
      method: "POST",
      url: ROUTE_URL,
      headers: { authorization: `Bearer ${admin.token}` },
      payload: { ...payload, admin_password: sentPassword },
      remoteAddress: admin.ip,
    });
    // Password differences never change the hash -- the approval binds the
    // org/admin identity fields, never the secret.
    expect(res.statusCode).toBe(201);

    // Neither password appears in the escalation row or any dual-control
    // audit detail.
    const escRow = await prisma.escalationRequest.findUnique({
      where: { escalation_id: escId },
    });
    const escJson = JSON.stringify(escRow);
    expect(escJson).not.toContain(approvedPassword);
    expect(escJson).not.toContain(sentPassword);
    const events = await adminAuditEventsFor(admin.entityId);
    const eventsJson = JSON.stringify(events);
    expect(eventsJson).not.toContain(approvedPassword);
    expect(eventsJson).not.toContain(sentPassword);
  });

  it("[G1-DUAL-CONTROL] atomic consume: a second consumeApprovedDualControlInTx on the same approval throws DUAL_CONTROL_ALREADY_CONSUMED (the concurrent-replay compare-and-swap guard)", async () => {
    const admin = await makeAdminAndLogin({ can_admin_niov: true });
    const payload = orgPayload();
    const escId = await grantApproval(admin.entityId, payload);

    await prisma.$transaction(async (tx) => {
      await consumeApprovedDualControlInTx(tx, escId, admin.entityId);
    });
    await expect(
      prisma.$transaction(async (tx) => {
        await consumeApprovedDualControlInTx(tx, escId, admin.entityId);
      }),
    ).rejects.toThrow("DUAL_CONTROL_ALREADY_CONSUMED");

    const row = await prisma.escalationRequest.findUnique({
      where: { escalation_id: escId },
    });
    expect(row!.status).toBe("EXPIRED");
  });

  it("re-homed end-to-end create: APPROVED escalation -> 201 and the created org admin can log in afterward", async () => {
    const admin = await makeAdminAndLogin({ can_admin_niov: true });
    const orgAdminEmail = `${TEST_PREFIX}orgsbinde2eadmin_${randomUUID()}@niov.test`;
    const orgAdminPassword = "correct-horse-battery";
    const payload = {
      company_name: `${TEST_PREFIX}orgsbinde2eco_${randomUUID()}`,
      admin_email: orgAdminEmail,
      admin_password: orgAdminPassword,
      industry: "TECH",
      admin_first_name: "Org",
      admin_last_name: "Admin",
    };
    await grantApproval(admin.entityId, payload);

    const res = await app.inject({
      method: "POST",
      url: ROUTE_URL,
      headers: { authorization: `Bearer ${admin.token}` },
      payload,
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

  it("re-homed body-validation: missing company_name + APPROVED escalation -> 422 INVALID_REQUEST; dual-control still passes (4 events) but executePhase0 never runs (no DANDELION_PHASE_0_COMPLETE); the approval is NOT consumed", async () => {
    const admin = await makeAdminAndLogin({ can_admin_niov: true });
    const payload = {
      admin_email: `${TEST_PREFIX}orgsbind422_${randomUUID()}@niov.test`,
      admin_password: "x",
      industry: "TECH",
    };
    const escId = await grantApproval(admin.entityId, payload);

    const res = await app.inject({
      method: "POST",
      url: ROUTE_URL,
      headers: { authorization: `Bearer ${admin.token}` },
      payload,
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
    // [G1-DUAL-CONTROL] consume happens only when the guarded operation
    // succeeds -- a 422 leaves the approval spendable.
    const row = await prisma.escalationRequest.findUnique({
      where: { escalation_id: escId },
    });
    expect(row!.status).toBe("APPROVED");
  });
});
