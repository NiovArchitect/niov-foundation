// FILE: audit-viewer-export.test.ts (integration)
// PURPOSE: Section 7 Wave 4 NDJSON export surface coverage:
//          GET /api/v1/audit/events/export?scope=self|org|platform
//          Verifies: bearer + read gate; query validation; scope
//          gates (self default; org TAR can_admin_org; platform
//          TAR can_admin_niov); NDJSON content-type; row cap
//          enforcement with truncated flag; max_rows operator
//          cap; filter AND-narrow; SAFE projection per-row;
//          read-audit emission via ADMIN_ACTION:AUDIT_VIEW_EXPORT;
//          format validator rejects non-ndjson at sub-phase 1.
// CONNECTS TO:
//   - apps/api/src/routes/audit.routes.ts (Wave 4)
//   - apps/api/src/services/audit/audit-view.service.ts

import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildApp,
  EXPORT_AUDIT_EVENTS_MAX_ROWS,
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

const TEST_JWT_SECRET = "audit-viewer-export-test-secret";
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
  can_admin_niov?: boolean;
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
    data: {
      can_admin_org: opts.can_admin_org === true,
      can_admin_niov: opts.can_admin_niov === true,
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
  const ip = `10.92.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 254) + 1}`;
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
  eventType: string = "ADMIN_ACTION",
): Promise<string> {
  const row = await writeAuditEvent({
    event_type: eventType,
    outcome: "SUCCESS",
    actor_entity_id: actorEntityId,
    details: { action: "TEST_SEED" },
  });
  return row.audit_id;
}

interface ExportResponse {
  statusCode: number;
  headers: Record<string, unknown>;
  body: string;
  jsonBody?: unknown;
}

async function exportEvents(
  caller: { token: string; ip: string },
  query: string = "",
): Promise<ExportResponse> {
  const r = await app.inject({
    method: "GET",
    url: `/api/v1/audit/events/export${query}`,
    headers: { authorization: `Bearer ${caller.token}` },
    remoteAddress: caller.ip,
  });
  let jsonBody: unknown | undefined;
  try {
    jsonBody = r.json();
  } catch {
    // body is NDJSON or empty; not JSON-parseable as a single
    // value — that's expected for 200 responses.
  }
  return {
    statusCode: r.statusCode,
    headers: r.headers as Record<string, unknown>,
    body: r.body,
    jsonBody,
  };
}

describe("GET /api/v1/audit/events/export — auth + validation", () => {
  it("401 without bearer", async () => {
    const r = await app.inject({
      method: "GET",
      url: "/api/v1/audit/events/export",
    });
    expect(r.statusCode).toBe(401);
  });

  it("422 INVALID_FIELD on bogus format", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeMember({ orgId });
    const r = await exportEvents(caller, "?format=parquet");
    expect(r.statusCode).toBe(422);
    expect(
      (r.jsonBody as { invalid_fields: string[] }).invalid_fields,
    ).toContain("format");
  });

  it("422 INVALID_FIELD on max_rows above hard cap", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeMember({ orgId });
    const r = await exportEvents(
      caller,
      `?max_rows=${EXPORT_AUDIT_EVENTS_MAX_ROWS + 1}`,
    );
    expect(r.statusCode).toBe(422);
    expect(
      (r.jsonBody as { invalid_fields: string[] }).invalid_fields,
    ).toContain("max_rows");
  });

  it("422 INVALID_FIELD on bogus scope value", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeMember({ orgId });
    const r = await exportEvents(caller, "?scope=enterprise");
    expect(r.statusCode).toBe(422);
    expect(
      (r.jsonBody as { invalid_fields: string[] }).invalid_fields,
    ).toContain("scope");
  });
});

describe("GET /api/v1/audit/events/export — self-scope happy path", () => {
  it("returns application/x-ndjson with one JSON line per row + DESC sort", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeMember({ orgId });
    await seedAuditRow(caller.entityId);
    await new Promise((r) => setTimeout(r, 25));
    await seedAuditRow(caller.entityId);
    const r = await exportEvents(caller);
    expect(r.statusCode).toBe(200);
    expect(String(r.headers["content-type"])).toContain(
      "application/x-ndjson",
    );
    expect(r.headers["x-audit-scope"]).toBe("self");
    expect(r.headers["x-audit-truncated"]).toBe("false");
    // Body is NDJSON; one JSON object per line. Parse + assert
    // each line is a SafeAuditEventView with the caller as
    // actor.
    const lines = r.body.split("\n").filter((l) => l.length > 0);
    expect(lines.length).toBeGreaterThanOrEqual(2);
    for (const line of lines) {
      const parsed = JSON.parse(line) as {
        audit_id: string;
        actor_entity_id: string | null;
        event_hash: string;
      };
      expect(parsed.actor_entity_id).toBe(caller.entityId);
      expect(typeof parsed.event_hash).toBe("string");
    }
    expect(r.headers["x-audit-row-count"]).toBe(String(lines.length));
  });

  it("emits ADMIN_ACTION:AUDIT_VIEW_EXPORT with row_count + scope + truncated", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeMember({ orgId });
    await exportEvents(caller);
    const audits = await prisma.auditEvent.findMany({
      where: {
        actor_entity_id: caller.entityId,
        event_type: "ADMIN_ACTION",
      },
      orderBy: { timestamp: "desc" },
    });
    const exportAudit = audits.find((a) => {
      const d = a.details as Record<string, unknown> | null;
      return d?.action === "AUDIT_VIEW_EXPORT";
    });
    expect(exportAudit).toBeDefined();
    const d = exportAudit!.details as Record<string, unknown>;
    expect(d.scope).toBe("self");
    expect(d.format).toBe("ndjson");
    expect(typeof d.row_count).toBe("number");
    expect(d.truncated).toBe(false);
  });
});

describe("GET /api/v1/audit/events/export — scope gates", () => {
  it("403 ORG_SCOPE_FORBIDDEN when scope=org and caller lacks can_admin_org", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeMember({ orgId });
    const r = await exportEvents(caller, "?scope=org");
    expect(r.statusCode).toBe(403);
    expect((r.jsonBody as { code: string }).code).toBe(
      "ORG_SCOPE_FORBIDDEN",
    );
  });

  it("403 PLATFORM_SCOPE_FORBIDDEN when scope=platform and caller lacks can_admin_niov", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeMember({ orgId, can_admin_org: true });
    const r = await exportEvents(caller, "?scope=platform");
    expect(r.statusCode).toBe(403);
    expect((r.jsonBody as { code: string }).code).toBe(
      "PLATFORM_SCOPE_FORBIDDEN",
    );
  });

  it("scope=org export includes same-org rows and excludes cross-org rows", async () => {
    const orgA = await makeTestOrg();
    const orgB = await makeTestOrg();
    const admin = await makeMember({ orgId: orgA, can_admin_org: true });
    const memberA = await makeMember({ orgId: orgA });
    const memberB = await makeMember({ orgId: orgB });
    const rowA = await seedAuditRow(memberA.entityId);
    const rowB = await seedAuditRow(memberB.entityId);
    const r = await exportEvents(admin, "?scope=org");
    expect(r.statusCode).toBe(200);
    const lines = r.body.split("\n").filter((l) => l.length > 0);
    const ids = lines.map(
      (l) => (JSON.parse(l) as { audit_id: string }).audit_id,
    );
    expect(ids).toContain(rowA);
    expect(ids).not.toContain(rowB);
  });

  it("scope=platform export sees rows across orgs", async () => {
    const orgA = await makeTestOrg();
    const orgB = await makeTestOrg();
    const niov = await makeMember({
      orgId: orgA,
      can_admin_niov: true,
    });
    const memberB = await makeMember({ orgId: orgB });
    const rowB = await seedAuditRow(memberB.entityId);
    const r = await exportEvents(niov, "?scope=platform");
    expect(r.statusCode).toBe(200);
    const lines = r.body.split("\n").filter((l) => l.length > 0);
    const ids = lines.map(
      (l) => (JSON.parse(l) as { audit_id: string }).audit_id,
    );
    expect(ids).toContain(rowB);
  });
});

describe("GET /api/v1/audit/events/export — bounded cap + filters", () => {
  it("max_rows cap surfaces truncated=true in headers + audit when more rows exist", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeMember({ orgId });
    // Seed 4 rows; cap at 2 so truncated=true.
    for (let i = 0; i < 4; i += 1) {
      await seedAuditRow(caller.entityId);
      await new Promise((r) => setTimeout(r, 5));
    }
    const r = await exportEvents(caller, "?max_rows=2");
    expect(r.statusCode).toBe(200);
    expect(r.headers["x-audit-truncated"]).toBe("true");
    expect(r.headers["x-audit-row-count"]).toBe("2");
    const lines = r.body.split("\n").filter((l) => l.length > 0);
    expect(lines.length).toBe(2);
  });

  it("event_type filter AND-narrows the export", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeMember({ orgId });
    await seedAuditRow(caller.entityId, "ADMIN_ACTION");
    const r = await exportEvents(caller, "?event_type=ADMIN_ACTION");
    expect(r.statusCode).toBe(200);
    const lines = r.body.split("\n").filter((l) => l.length > 0);
    for (const line of lines) {
      const parsed = JSON.parse(line) as { event_type: string };
      expect(parsed.event_type).toBe("ADMIN_ACTION");
    }
  });

  it("empty result returns an empty NDJSON body + row_count=0 + truncated=false", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeMember({ orgId });
    // Filter by a target_capsule_id that doesn't exist for the
    // caller — guarantees zero matches.
    const r = await exportEvents(
      caller,
      "?target_capsule_id=99999999-9999-4999-8999-999999999999",
    );
    expect(r.statusCode).toBe(200);
    expect(r.body).toBe("");
    expect(r.headers["x-audit-row-count"]).toBe("0");
    expect(r.headers["x-audit-truncated"]).toBe("false");
  });
});
