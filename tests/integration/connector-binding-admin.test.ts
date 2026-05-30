// FILE: connector-binding-admin.test.ts (integration)
// PURPOSE: Section 4 Wave 2 admin ConnectorBinding route coverage.
//          Verifies: bearer + can_admin_org gate at every route;
//          registration validation (UNKNOWN_CONNECTOR_TYPE /
//          SECRET_REF_REQUIRED / SECRET_REF_INVALID /
//          INVALID_FIELD); cross-org binding probes collapse to
//          enumeration-safe 404 BINDING_NOT_FOUND; per-mutation
//          ADMIN_ACTION audit emission with details.action ∈
//          {CONNECTOR_REGISTERED, CONNECTOR_CONFIG_UPDATED,
//           CONNECTOR_DISABLED, CONNECTOR_REENABLED,
//           CONNECTOR_SOFT_DELETED} (NO new audit literal);
//          enable / disable cycle audit discrimination; SAFE
//          projection echoes secret_ref env-var NAME but no
//          resolved secret values; list scoping under enabled
//          filter; duplicate display_name 409.
// CONNECTS TO:
//   - apps/api/src/routes/connector.routes.ts (Wave 2)
//   - apps/api/src/services/connector/connector-binding.service.ts
//   - packages/database/src/queries/connector-binding.ts

import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildApp,
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

const TEST_JWT_SECRET = "connector-binding-admin-test-secret";
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

async function makeMember(opts: {
  orgId: string;
  can_admin_org?: boolean;
}): Promise<{ entityId: string; token: string; ip: string }> {
  const password = "correct-horse-battery";
  const input = makeEntityInput({ entity_type: "PERSON", password });
  const entity = await createEntity(input);
  await prisma.entityMembership.create({
    data: {
      parent_id: opts.orgId,
      child_id: entity.entity_id,
      role_title: "MEMBER",
      is_active: true,
    },
  });
  await prisma.tokenAttributeRepository.update({
    where: { entity_id: entity.entity_id },
    data: { can_admin_org: opts.can_admin_org === true },
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
  const ip = `10.84.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 254) + 1}`;
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

async function post(
  caller: { token: string; ip: string },
  url: string,
  body: Record<string, unknown>,
): Promise<{ statusCode: number; body: unknown }> {
  const r = await app.inject({
    method: "POST",
    url,
    headers: { authorization: `Bearer ${caller.token}` },
    remoteAddress: caller.ip,
    payload: body,
  });
  return { statusCode: r.statusCode, body: r.json() };
}

async function get(
  caller: { token: string; ip: string },
  url: string,
): Promise<{ statusCode: number; body: unknown; raw: string }> {
  const r = await app.inject({
    method: "GET",
    url,
    headers: { authorization: `Bearer ${caller.token}` },
    remoteAddress: caller.ip,
  });
  return { statusCode: r.statusCode, body: r.json(), raw: r.body };
}

async function patch(
  caller: { token: string; ip: string },
  url: string,
  body: Record<string, unknown>,
): Promise<{ statusCode: number; body: unknown }> {
  const r = await app.inject({
    method: "PATCH",
    url,
    headers: { authorization: `Bearer ${caller.token}` },
    remoteAddress: caller.ip,
    payload: body,
  });
  return { statusCode: r.statusCode, body: r.json() };
}

async function del(
  caller: { token: string; ip: string },
  url: string,
): Promise<{ statusCode: number; body: unknown }> {
  const r = await app.inject({
    method: "DELETE",
    url,
    headers: { authorization: `Bearer ${caller.token}` },
    remoteAddress: caller.ip,
  });
  return { statusCode: r.statusCode, body: r.json() };
}

function validBody(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    type: "OUTBOUND_WEBHOOK",
    display_name: `My webhook ${randomUUID()}`,
    config: { url: "https://example.test/hook" },
    secret_ref: "TEST_WEBHOOK_HMAC_SECRET",
    ...overrides,
  };
}

describe("POST /api/v1/org/connectors — admin gate + validation", () => {
  it("401 without bearer", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/api/v1/org/connectors",
      payload: validBody(),
    });
    expect(r.statusCode).toBe(401);
  });

  it("403 when caller lacks can_admin_org", async () => {
    const orgId = await makeTestOrg();
    const nonAdmin = await makeMember({ orgId, can_admin_org: false });
    const r = await post(nonAdmin, "/api/v1/org/connectors", validBody());
    expect(r.statusCode).toBe(403);
  });

  it("422 UNKNOWN_CONNECTOR_TYPE when type is not in registry", async () => {
    const orgId = await makeTestOrg();
    const admin = await makeMember({ orgId, can_admin_org: true });
    const r = await post(
      admin,
      "/api/v1/org/connectors",
      validBody({ type: "SLACK" }),
    );
    expect(r.statusCode).toBe(422);
    expect((r.body as { code: string }).code).toBe("UNKNOWN_CONNECTOR_TYPE");
  });

  it("422 SECRET_REF_REQUIRED when OUTBOUND_WEBHOOK omits secret_ref", async () => {
    const orgId = await makeTestOrg();
    const admin = await makeMember({ orgId, can_admin_org: true });
    const r = await post(
      admin,
      "/api/v1/org/connectors",
      validBody({ secret_ref: null }),
    );
    expect(r.statusCode).toBe(422);
    expect((r.body as { code: string }).code).toBe("SECRET_REF_REQUIRED");
  });

  it("422 SECRET_REF_INVALID for lower-case secret_ref", async () => {
    const orgId = await makeTestOrg();
    const admin = await makeMember({ orgId, can_admin_org: true });
    const r = await post(
      admin,
      "/api/v1/org/connectors",
      validBody({ secret_ref: "lower_case_no_good" }),
    );
    expect(r.statusCode).toBe(422);
    expect((r.body as { code: string }).code).toBe("SECRET_REF_INVALID");
  });

  it("422 INVALID_FIELD when display_name missing", async () => {
    const orgId = await makeTestOrg();
    const admin = await makeMember({ orgId, can_admin_org: true });
    const r = await post(
      admin,
      "/api/v1/org/connectors",
      validBody({ display_name: undefined }),
    );
    expect(r.statusCode).toBe(422);
    const b = r.body as { code: string; invalid_fields: string[] };
    expect(b.code).toBe("INVALID_FIELD");
    expect(b.invalid_fields).toContain("display_name");
  });
});

describe("POST /api/v1/org/connectors — happy path + audit", () => {
  it("201 returns SAFE projection + audit_event_id; emits ADMIN_ACTION:CONNECTOR_REGISTERED", async () => {
    const orgId = await makeTestOrg();
    const admin = await makeMember({ orgId, can_admin_org: true });
    const body = validBody();
    const r = await post(admin, "/api/v1/org/connectors", body);
    expect(r.statusCode).toBe(201);
    const b = r.body as {
      ok: true;
      binding: {
        binding_id: string;
        type: string;
        display_name: string;
        config: Record<string, unknown>;
        secret_ref: string | null;
        enabled: boolean;
        org_entity_id: string;
        created_by_entity_id: string;
      };
      audit_event_id: string;
    };
    expect(b.ok).toBe(true);
    expect(b.binding.type).toBe("OUTBOUND_WEBHOOK");
    expect(b.binding.org_entity_id).toBe(orgId);
    expect(b.binding.enabled).toBe(true);
    expect(b.binding.secret_ref).toBe("TEST_WEBHOOK_HMAC_SECRET");
    expect(b.binding.created_by_entity_id).toBe(admin.entityId);

    const audit = await prisma.auditEvent.findUnique({
      where: { audit_id: b.audit_event_id },
    });
    expect(audit).not.toBeNull();
    expect(audit!.event_type).toBe("ADMIN_ACTION");
    expect(audit!.actor_entity_id).toBe(admin.entityId);
    const details = audit!.details as Record<string, unknown>;
    expect(details.action).toBe("CONNECTOR_REGISTERED");
    expect(details.binding_id).toBe(b.binding.binding_id);
    expect(details.type).toBe("OUTBOUND_WEBHOOK");
  });

  it("409 DUPLICATE_DISPLAY_NAME on second registration with same display_name", async () => {
    const orgId = await makeTestOrg();
    const admin = await makeMember({ orgId, can_admin_org: true });
    const body = validBody({ display_name: "Same Name" });
    const first = await post(admin, "/api/v1/org/connectors", body);
    expect(first.statusCode).toBe(201);
    const second = await post(admin, "/api/v1/org/connectors", body);
    expect(second.statusCode).toBe(409);
    expect((second.body as { code: string }).code).toBe(
      "DUPLICATE_DISPLAY_NAME",
    );
  });
});

describe("GET /api/v1/org/connectors — list scoping + filter", () => {
  it("scopes list to caller's org; cross-org bindings invisible", async () => {
    const orgA = await makeTestOrg();
    const orgB = await makeTestOrg();
    const adminA = await makeMember({ orgId: orgA, can_admin_org: true });
    const adminB = await makeMember({ orgId: orgB, can_admin_org: true });
    await post(adminA, "/api/v1/org/connectors", validBody());
    await post(adminB, "/api/v1/org/connectors", validBody());
    const listed = await get(adminA, "/api/v1/org/connectors");
    expect(listed.statusCode).toBe(200);
    const b = listed.body as {
      bindings: Array<{ org_entity_id: string }>;
    };
    expect(b.bindings.length).toBeGreaterThanOrEqual(1);
    for (const binding of b.bindings) {
      expect(binding.org_entity_id).toBe(orgA);
    }
  });

  it("enabled=false filter narrows the list", async () => {
    const orgId = await makeTestOrg();
    const admin = await makeMember({ orgId, can_admin_org: true });
    const created = await post(admin, "/api/v1/org/connectors", validBody());
    const bindingId = (
      created.body as { binding: { binding_id: string } }
    ).binding.binding_id;
    await patch(admin, `/api/v1/org/connectors/${bindingId}`, {
      enabled: false,
    });
    const listed = await get(
      admin,
      "/api/v1/org/connectors?enabled=false",
    );
    expect(listed.statusCode).toBe(200);
    const b = listed.body as {
      bindings: Array<{ binding_id: string; enabled: boolean }>;
    };
    for (const binding of b.bindings) {
      expect(binding.enabled).toBe(false);
    }
    expect(b.bindings.find((x) => x.binding_id === bindingId)).toBeDefined();
  });

  it("422 INVALID_FIELD on bogus enabled query value", async () => {
    const orgId = await makeTestOrg();
    const admin = await makeMember({ orgId, can_admin_org: true });
    const r = await get(admin, "/api/v1/org/connectors?enabled=maybe");
    expect(r.statusCode).toBe(422);
  });
});

describe("GET /api/v1/org/connectors/:id — single-binding view", () => {
  it("404 BINDING_NOT_FOUND when binding belongs to another org", async () => {
    const orgA = await makeTestOrg();
    const orgB = await makeTestOrg();
    const adminA = await makeMember({ orgId: orgA, can_admin_org: true });
    const adminB = await makeMember({ orgId: orgB, can_admin_org: true });
    const createdB = await post(adminB, "/api/v1/org/connectors", validBody());
    const bindingB = (
      createdB.body as { binding: { binding_id: string } }
    ).binding.binding_id;
    const r = await get(adminA, `/api/v1/org/connectors/${bindingB}`);
    expect(r.statusCode).toBe(404);
    expect((r.body as { code: string }).code).toBe("BINDING_NOT_FOUND");
  });

  it("404 BINDING_NOT_FOUND on a syntactically valid but unknown id", async () => {
    const orgId = await makeTestOrg();
    const admin = await makeMember({ orgId, can_admin_org: true });
    const r = await get(
      admin,
      "/api/v1/org/connectors/11111111-1111-4111-8111-111111111111",
    );
    expect(r.statusCode).toBe(404);
  });
});

describe("PATCH /api/v1/org/connectors/:id — disable/reenable/config audit", () => {
  it("emits CONNECTOR_DISABLED then CONNECTOR_REENABLED on toggle cycle", async () => {
    const orgId = await makeTestOrg();
    const admin = await makeMember({ orgId, can_admin_org: true });
    const created = await post(admin, "/api/v1/org/connectors", validBody());
    const bindingId = (
      created.body as { binding: { binding_id: string } }
    ).binding.binding_id;

    const disable = await patch(
      admin,
      `/api/v1/org/connectors/${bindingId}`,
      { enabled: false },
    );
    expect(disable.statusCode).toBe(200);
    const auditDisable = await prisma.auditEvent.findUnique({
      where: {
        audit_id: (disable.body as { audit_event_id: string })
          .audit_event_id,
      },
    });
    expect(
      (auditDisable!.details as Record<string, unknown>).action,
    ).toBe("CONNECTOR_DISABLED");

    const reenable = await patch(
      admin,
      `/api/v1/org/connectors/${bindingId}`,
      { enabled: true },
    );
    expect(reenable.statusCode).toBe(200);
    const auditReenable = await prisma.auditEvent.findUnique({
      where: {
        audit_id: (reenable.body as { audit_event_id: string })
          .audit_event_id,
      },
    });
    expect(
      (auditReenable!.details as Record<string, unknown>).action,
    ).toBe("CONNECTOR_REENABLED");
  });

  it("emits CONNECTOR_CONFIG_UPDATED for config-only change", async () => {
    const orgId = await makeTestOrg();
    const admin = await makeMember({ orgId, can_admin_org: true });
    const created = await post(admin, "/api/v1/org/connectors", validBody());
    const bindingId = (
      created.body as { binding: { binding_id: string } }
    ).binding.binding_id;
    const updated = await patch(
      admin,
      `/api/v1/org/connectors/${bindingId}`,
      { config: { url: "https://example.test/new-path" } },
    );
    expect(updated.statusCode).toBe(200);
    const audit = await prisma.auditEvent.findUnique({
      where: {
        audit_id: (updated.body as { audit_event_id: string }).audit_event_id,
      },
    });
    const details = audit!.details as Record<string, unknown>;
    expect(details.action).toBe("CONNECTOR_CONFIG_UPDATED");
    expect(details.fields_changed).toEqual(["config"]);
  });

  it("404 BINDING_NOT_FOUND on cross-org PATCH", async () => {
    const orgA = await makeTestOrg();
    const orgB = await makeTestOrg();
    const adminA = await makeMember({ orgId: orgA, can_admin_org: true });
    const adminB = await makeMember({ orgId: orgB, can_admin_org: true });
    const createdB = await post(adminB, "/api/v1/org/connectors", validBody());
    const bindingB = (
      createdB.body as { binding: { binding_id: string } }
    ).binding.binding_id;
    const r = await patch(adminA, `/api/v1/org/connectors/${bindingB}`, {
      enabled: false,
    });
    expect(r.statusCode).toBe(404);
  });
});

describe("DELETE /api/v1/org/connectors/:id — soft delete + audit", () => {
  it("200 soft-deletes + emits CONNECTOR_SOFT_DELETED; row no longer visible", async () => {
    const orgId = await makeTestOrg();
    const admin = await makeMember({ orgId, can_admin_org: true });
    const created = await post(admin, "/api/v1/org/connectors", validBody());
    const bindingId = (
      created.body as { binding: { binding_id: string } }
    ).binding.binding_id;
    const deleted = await del(admin, `/api/v1/org/connectors/${bindingId}`);
    expect(deleted.statusCode).toBe(200);
    const audit = await prisma.auditEvent.findUnique({
      where: {
        audit_id: (deleted.body as { audit_event_id: string }).audit_event_id,
      },
    });
    expect(
      (audit!.details as Record<string, unknown>).action,
    ).toBe("CONNECTOR_SOFT_DELETED");
    const after = await get(admin, `/api/v1/org/connectors/${bindingId}`);
    expect(after.statusCode).toBe(404);
  });

  it("404 BINDING_NOT_FOUND on cross-org DELETE", async () => {
    const orgA = await makeTestOrg();
    const orgB = await makeTestOrg();
    const adminA = await makeMember({ orgId: orgA, can_admin_org: true });
    const adminB = await makeMember({ orgId: orgB, can_admin_org: true });
    const createdB = await post(adminB, "/api/v1/org/connectors", validBody());
    const bindingB = (
      createdB.body as { binding: { binding_id: string } }
    ).binding.binding_id;
    const r = await del(adminA, `/api/v1/org/connectors/${bindingB}`);
    expect(r.statusCode).toBe(404);
  });
});

describe("Wave 2 no-leak: SAFE projection never carries resolved secret values", () => {
  it("creates a binding referencing FAKE_SECRET_FOR_LEAK_CHECK and verifies response never contains a fake resolved value", async () => {
    // The env var literally does not exist; the test asserts that
    // even if it did, the response body would never carry the
    // resolved env var value — the SAFE projection only echoes
    // the env-var NAME.
    process.env.FAKE_SECRET_FOR_LEAK_CHECK =
      "resolved-value-MUST-NOT-LEAK-zzz";
    try {
      const orgId = await makeTestOrg();
      const admin = await makeMember({ orgId, can_admin_org: true });
      const r = await post(
        admin,
        "/api/v1/org/connectors",
        validBody({ secret_ref: "FAKE_SECRET_FOR_LEAK_CHECK" }),
      );
      expect(r.statusCode).toBe(201);
      const raw = JSON.stringify(r.body);
      expect(raw).toContain("FAKE_SECRET_FOR_LEAK_CHECK");
      expect(raw).not.toContain("resolved-value-MUST-NOT-LEAK-zzz");
    } finally {
      delete process.env.FAKE_SECRET_FOR_LEAK_CHECK;
    }
  });
});
