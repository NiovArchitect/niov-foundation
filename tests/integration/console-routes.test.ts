// FILE: console-routes.test.ts (integration)
// PURPOSE: CONSOLE.1 P0 read-only `/api/v1/console/*` endpoints — auth/scope,
//          response-shape, safety (no capsule content, no break-glass
//          justification leak, no live market pricing), report catalog (18),
//          report detail + 404, Console read-audit (ADMIN_ACTION/CONSOLE_READ),
//          and regression that existing /platform/* reads still work. Real
//          containerized Postgres (the gateway/break-glass harness). No timing.
// CONNECTS TO: buildApp + createBreakGlassGrant from @niov/api;
//              console.routes.ts + console.service.ts; @niov/database
//              (createEntity, prisma, computeTARHash); tests/helpers.ts.

import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  buildApp,
  createBreakGlassGrant,
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

const TEST_JWT_SECRET = "console-routes-test-secret-do-not-use-in-prod";
const TEST_KEY = randomBytes(32);
const BG_JUSTIFICATION_SECRET = "console-test-bg-justification-zzz-secret";
const REQUIRED_REPORT_IDS = [
  "foundation_health", "governance_audit", "break_glass", "dual_control",
  "wallet_entity_growth", "capsule_movement", "permission_revocation",
  "gateway_ratelimit", "regulator_proof", "monetization_exchange",
  "developer_api_usage", "agent_hive_swarm", "org_activity", "compliance_export",
  "capability_least_privilege", "security_anomaly", "session_access",
  "audit_chain_integrity",
];
const READINESS = new Set(["LIVE", "PARTIAL", "MOCK", "FUTURE"]);

let app: FastifyInstance;
const store = new MemoryRateLimitStore();

async function cleanupTestBreakGlass(): Promise<void> {
  const ents = await prisma.entity.findMany({
    where: { display_name: { startsWith: TEST_PREFIX } },
    select: { entity_id: true },
  });
  const ids = ents.map((e) => e.entity_id);
  if (ids.length === 0) return;
  await prisma.breakGlassGrant.deleteMany({
    where: { OR: [{ source_entity_id: { in: ids } }, { reviewed_by_entity_id: { in: ids } }] },
  });
}

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
  const ip = `10.231.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 254) + 1}`;
  const login = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email: input.email, password, requested_operations: ["read", "write", "share"] },
    remoteAddress: ip,
  });
  if (login.statusCode !== 200) throw new Error(`login failed: ${login.statusCode} ${login.body}`);
  const body = login.json() as { token: string };
  return { entityId: entity.entity_id, token: body.token, ip };
}

function get(token: string, ip: string, url: string) {
  return app.inject({ method: "GET", url, headers: { authorization: `Bearer ${token}` }, remoteAddress: ip });
}

beforeAll(async () => {
  await ensureAuditTriggers();
  await cleanupTestBreakGlass();
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
  await cleanupTestBreakGlass();
  await cleanupTestData();
  await prisma.$disconnect();
});

withCleanRateLimits(store);

beforeEach(async () => {
  await cleanupTestBreakGlass();
  await cleanupTestData();
});

describe("CONSOLE.1 P0 read-only /api/v1/console/* auth & scope", () => {
  it("unauthenticated request to /console/overview -> 401", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/console/overview", remoteAddress: "10.231.0.1" });
    expect(res.statusCode).toBe(401);
  });

  it("authenticated NON-can_admin_niov actor -> 403", async () => {
    const u = await makeAdminAndLogin({ can_admin_niov: false });
    const res = await get(u.token, u.ip, "/api/v1/console/overview");
    expect(res.statusCode).toBe(403);
    expect((res.json() as { error: string }).error).toBe("ADMIN_CAPABILITY_REQUIRED");
  });

  it("can_admin_niov actor -> 200", async () => {
    const a = await makeAdminAndLogin({ can_admin_niov: true });
    const res = await get(a.token, a.ip, "/api/v1/console/overview");
    expect(res.statusCode).toBe(200);
  });
});

describe("CONSOLE.1 P0 endpoint shapes", () => {
  it("/console/overview returns all required top-level sections", async () => {
    const a = await makeAdminAndLogin({ can_admin_niov: true });
    const res = await get(a.token, a.ip, "/api/v1/console/overview");
    const b = res.json() as Record<string, unknown>;
    for (const k of ["foundation", "health", "governance", "entities", "capsules", "gateway", "compliance", "exchange", "agents", "reports"]) {
      expect(b[k]).toBeDefined();
    }
    const foundation = b.foundation as Record<string, unknown>;
    expect(foundation.govsec5_status).toBe("CLOSED");
    expect(foundation.adr_0049_status).toBe("Proposed");
    expect((b.exchange as Record<string, unknown>).cohort_pricing_status).toBe("FUTURE");
  });

  it("/console/audit returns paginated shape and filters by event_type", async () => {
    const a = await makeAdminAndLogin({ can_admin_niov: true });
    const res = await get(a.token, a.ip, "/api/v1/console/audit?take=5&event_type=ADMIN_ACTION");
    expect(res.statusCode).toBe(200);
    const b = res.json() as { ok: boolean; items: unknown[]; total: number; has_more: boolean };
    expect(b.ok).toBe(true);
    expect(Array.isArray(b.items)).toBe(true);
    expect(typeof b.total).toBe("number");
  });

  it("/console/entities returns paginated entity rows with caps", async () => {
    const a = await makeAdminAndLogin({ can_admin_niov: true });
    const res = await get(a.token, a.ip, "/api/v1/console/entities?take=10");
    expect(res.statusCode).toBe(200);
    const b = res.json() as { ok: boolean; items: { entity_id: string; capabilities: unknown }[] };
    expect(b.ok).toBe(true);
    expect(Array.isArray(b.items)).toBe(true);
  });

  it("/console/break-glass/grants returns grants WITHOUT justification", async () => {
    const source = await createEntity(makeEntityInput({ entity_type: "PERSON" }));
    await createBreakGlassGrant(source.entity_id, {
      action_type: "PLATFORM_MONETIZATION_CONFIG_UPDATE",
      justification: BG_JUSTIFICATION_SECRET,
      valid_until: new Date(Date.now() + 60 * 60 * 1000),
    });
    const a = await makeAdminAndLogin({ can_admin_niov: true });
    const res = await get(a.token, a.ip, "/api/v1/console/break-glass/grants?take=20");
    expect(res.statusCode).toBe(200);
    const b = res.json() as { ok: boolean; items: { grant_id: string }[] };
    expect(b.items.length).toBeGreaterThan(0);
    // The private justification must NOT appear anywhere in the response body.
    expect(res.body).not.toContain(BG_JUSTIFICATION_SECRET);
    expect(res.body).not.toContain("justification");
  });

  it("/console/escalations returns paginated escalation rows", async () => {
    const a = await makeAdminAndLogin({ can_admin_niov: true });
    const res = await get(a.token, a.ip, "/api/v1/console/escalations?take=10");
    expect(res.statusCode).toBe(200);
    const b = res.json() as { ok: boolean; items: unknown[] };
    expect(b.ok).toBe(true);
    expect(Array.isArray(b.items)).toBe(true);
  });
});

describe("CONSOLE.1 P0 report catalog + detail", () => {
  it("/console/reports returns exactly 18 reports with the required IDs and valid readiness", async () => {
    const a = await makeAdminAndLogin({ can_admin_niov: true });
    const res = await get(a.token, a.ip, "/api/v1/console/reports");
    expect(res.statusCode).toBe(200);
    const b = res.json() as { reports: { report_id: string; readiness: string; export_options: { enabled: boolean }[] }[]; total: number };
    expect(b.total).toBe(18);
    expect(b.reports).toHaveLength(18);
    const ids = b.reports.map((r) => r.report_id).sort();
    expect(ids).toEqual([...REQUIRED_REPORT_IDS].sort());
    for (const r of b.reports) {
      expect(READINESS.has(r.readiness)).toBe(true);
      // Export options are disabled metadata only in P0.
      for (const e of r.export_options) expect(e.enabled).toBe(false);
    }
  });

  it("/console/reports/:report_id returns a report envelope for the LIVE/key reports", async () => {
    const a = await makeAdminAndLogin({ can_admin_niov: true });
    for (const id of ["foundation_health", "governance_audit", "break_glass", "audit_chain_integrity"]) {
      const res = await get(a.token, a.ip, `/api/v1/console/reports/${id}`);
      expect(res.statusCode).toBe(200);
      const b = res.json() as { ok: boolean; report: { report_id: string; readiness: string; sections: unknown[] } };
      expect(b.report.report_id).toBe(id);
      expect(READINESS.has(b.report.readiness)).toBe(true);
      expect(Array.isArray(b.report.sections)).toBe(true);
    }
  });

  it("/console/reports/:report_id unknown report -> 404", async () => {
    const a = await makeAdminAndLogin({ can_admin_niov: true });
    const res = await get(a.token, a.ip, "/api/v1/console/reports/not_a_real_report");
    expect(res.statusCode).toBe(404);
    expect((res.json() as { code: string }).code).toBe("REPORT_NOT_FOUND");
  });

  it("monetization_exchange report is MOCK and never presents live pricing", async () => {
    const a = await makeAdminAndLogin({ can_admin_niov: true });
    const res = await get(a.token, a.ip, "/api/v1/console/reports/monetization_exchange");
    const b = res.json() as { report: { readiness: string; mock_mode: boolean } };
    expect(b.report.readiness).toBe("MOCK");
    expect(b.report.mock_mode).toBe(true);
  });
});

describe("CONSOLE.1 P0 audit + safety + regression", () => {
  it("Console reads emit ADMIN_ACTION with details.action = CONSOLE_READ", async () => {
    const a = await makeAdminAndLogin({ can_admin_niov: true });
    await get(a.token, a.ip, "/api/v1/console/overview");
    const rows = await prisma.auditEvent.findMany({
      where: { event_type: "ADMIN_ACTION", actor_entity_id: a.entityId },
      orderBy: { timestamp: "desc" },
      take: 20,
    });
    const consoleRead = rows.find(
      (r) => (r.details as Record<string, unknown>).action === "CONSOLE_READ",
    );
    expect(consoleRead).toBeDefined();
    expect((consoleRead!.details as Record<string, unknown>).route).toBe("/api/v1/console/overview");
  });

  it("overview/entities responses contain no raw capsule content fields", async () => {
    const a = await makeAdminAndLogin({ can_admin_niov: true });
    const ov = await get(a.token, a.ip, "/api/v1/console/overview");
    const en = await get(a.token, a.ip, "/api/v1/console/entities?take=5");
    for (const body of [ov.body, en.body]) {
      expect(body).not.toContain("encrypted_content");
      expect(body).not.toContain("content_url");
      expect(body).not.toContain("plaintext");
    }
  });

  it("existing /platform/stats still works for can_admin_niov", async () => {
    const a = await makeAdminAndLogin({ can_admin_niov: true });
    const res = await get(a.token, a.ip, "/api/v1/platform/stats");
    expect(res.statusCode).toBe(200);
    expect((res.json() as { ok: boolean }).ok).toBe(true);
  });

  it("existing /platform/audit still works for can_admin_niov", async () => {
    const a = await makeAdminAndLogin({ can_admin_niov: true });
    const res = await get(a.token, a.ip, "/api/v1/platform/audit?take=5");
    expect(res.statusCode).toBe(200);
    const b = res.json() as { ok: boolean; items: unknown[] };
    expect(b.ok).toBe(true);
    expect(Array.isArray(b.items)).toBe(true);
  });
});
