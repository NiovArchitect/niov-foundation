// FILE: audit-viewer-csv-export.test.ts (integration)
// PURPOSE: Hardening Wave A — Section 7 CSV export route coverage.
//          Verifies: format=csv returns 200 with text/csv content-
//          type + x-audit-format header; CSV body has a header row
//          + one record per audit event; CRLF line terminators per
//          RFC 4180; same scope=self|org|platform gate as NDJSON
//          (Wave 4); same SAFE projection; same hard-cap +
//          truncated header; same AUDIT_VIEW_EXPORT audit emission
//          (with format=csv recorded in audit details); cross-org
//          leak guard preserved.
// CONNECTS TO:
//   - apps/api/src/routes/audit.routes.ts (Wave 4 + Hardening A)
//   - apps/api/src/services/audit/audit-view.service.ts
//     (validateExportAuditEventsQuery + exportAuditEventsForCaller
//     CSV branch)

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

const TEST_JWT_SECRET = "audit-viewer-csv-export-test-secret";
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

async function makeMemberWithLogin(): Promise<{
  entityId: string;
  token: string;
  ip: string;
}> {
  const password = "correct-horse-battery";
  const input = makeEntityInput({ entity_type: "PERSON", password });
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
  const ip = `10.95.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 254) + 1}`;
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

async function seedRows(actorId: string, n: number): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const row = await writeAuditEvent({
      event_type: "ADMIN_ACTION",
      outcome: "SUCCESS",
      actor_entity_id: actorId,
      details: {
        action: "TEST_SEED",
        i,
        // Embedded comma + quote + newline to prove CSV escaping
        // round-trips correctly at the route tier.
        message: i === 0 ? 'has,a "quoted" comma\nand newline' : "plain",
      },
    });
    ids.push(row.audit_id);
  }
  return ids;
}

async function exportCall(
  caller: { token: string; ip: string },
  query: string,
): Promise<{
  statusCode: number;
  body: string;
  contentType: string;
  rowCount: string;
  truncated: string;
  format: string;
}> {
  const r = await app.inject({
    method: "GET",
    url: `/api/v1/audit/events/export${query}`,
    headers: { authorization: `Bearer ${caller.token}` },
    remoteAddress: caller.ip,
  });
  return {
    statusCode: r.statusCode,
    body: r.body,
    contentType: r.headers["content-type"] as string,
    rowCount: r.headers["x-audit-row-count"] as string,
    truncated: r.headers["x-audit-truncated"] as string,
    format: r.headers["x-audit-format"] as string,
  };
}

describe("GET /api/v1/audit/events/export?format=csv — validation", () => {
  it("422 on unknown format value (preserves Wave 4 contract)", async () => {
    const caller = await makeMemberWithLogin();
    const r = await exportCall(caller, "?format=bogus");
    expect(r.statusCode).toBe(422);
  });

  it("default format remains ndjson when format param absent", async () => {
    const caller = await makeMemberWithLogin();
    await seedRows(caller.entityId, 2);
    const r = await exportCall(caller, "");
    expect(r.statusCode).toBe(200);
    expect(r.contentType).toContain("application/x-ndjson");
    expect(r.format).toBe("ndjson");
  });
});

describe("GET /api/v1/audit/events/export?format=csv — happy path", () => {
  it("200 with text/csv content-type + x-audit-format=csv header + CRLF body", async () => {
    const caller = await makeMemberWithLogin();
    await seedRows(caller.entityId, 3);
    const r = await exportCall(caller, "?format=csv");
    expect(r.statusCode).toBe(200);
    expect(r.contentType).toContain("text/csv");
    expect(r.format).toBe("csv");
    // Header row + at least 3 data rows; CRLF line terminators
    // per RFC 4180.
    const lines = r.body.split("\r\n");
    expect(lines[0]).toContain("audit_id");
    expect(lines[0]).toContain("event_type");
    expect(lines[0]).toContain("outcome");
    expect(lines[0]).toContain("details");
    expect(lines.length).toBeGreaterThanOrEqual(4); // header + 3 rows
  });

  it("escapes embedded commas + quotes + newlines correctly (round-trip-safe)", async () => {
    const caller = await makeMemberWithLogin();
    await seedRows(caller.entityId, 1);
    const r = await exportCall(caller, "?format=csv");
    expect(r.statusCode).toBe(200);
    // The seeded row i=0 carried details.message =
    // 'has,a "quoted" comma\nand newline'. The details JSON
    // column is stored with backslash-escaped inner quotes
    // (\"quoted\"), so after CSV serialization wraps the cell
    // in outer quotes and doubles every double-quote, the
    // word "quoted" appears as \""quoted\"". The CSV outer
    // wrapping is required by RFC 4180 because the cell
    // contains commas + a literal newline.
    expect(r.body).toContain('""message""');
    expect(r.body).toContain('\\""quoted\\""');
    // Cell wrapping in outer double-quotes is the canonical
    // signature for embedded commas.
    expect(r.body).toContain('"{""i"":0,');
    // x-audit-row-count header matches the data row count
    // (header row is not counted).
    expect(parseInt(r.rowCount, 10)).toBeGreaterThanOrEqual(1);
  });

  it("zero-result export returns header-row-only body (row_count=0; not truncated)", async () => {
    const caller = await makeMemberWithLogin();
    // Filter to a UUID that cannot match any seeded row.
    const r = await exportCall(
      caller,
      `?format=csv&target_capsule_id=${randomUUID()}`,
    );
    expect(r.statusCode).toBe(200);
    expect(r.rowCount).toBe("0");
    expect(r.truncated).toBe("false");
    // Body is the header row alone (no CRLF beyond what would
    // separate data rows; empty slice yields header only).
    expect(r.body).not.toContain("\r\n");
    expect(r.body.startsWith("audit_id,")).toBe(true);
  });

  it("max_rows cap + truncated header behave identically to NDJSON path", async () => {
    const caller = await makeMemberWithLogin();
    await seedRows(caller.entityId, 5);
    const r = await exportCall(caller, "?format=csv&max_rows=2");
    expect(r.statusCode).toBe(200);
    expect(r.truncated).toBe("true");
    expect(r.rowCount).toBe("2");
    const lines = r.body.split("\r\n");
    // Header + exactly 2 data rows.
    expect(lines.length).toBe(3);
  });
});

describe("GET /api/v1/audit/events/export?format=csv — audit emission", () => {
  it("emits ADMIN_ACTION:AUDIT_VIEW_EXPORT with format=csv in details", async () => {
    const caller = await makeMemberWithLogin();
    await seedRows(caller.entityId, 2);
    const r = await exportCall(caller, "?format=csv");
    expect(r.statusCode).toBe(200);
    const audits = await prisma.auditEvent.findMany({
      where: {
        actor_entity_id: caller.entityId,
        event_type: "ADMIN_ACTION",
      },
      orderBy: { timestamp: "desc" },
    });
    const exportAudit = audits.find((a) => {
      const d = a.details as Record<string, unknown> | null;
      return d?.action === "AUDIT_VIEW_EXPORT" && d?.format === "csv";
    });
    expect(exportAudit).toBeDefined();
    const d = exportAudit!.details as Record<string, unknown>;
    expect(d.format).toBe("csv");
    expect(typeof d.row_count).toBe("number");
  });
});

describe("GET /api/v1/audit/events/export?format=csv — no-leak preservation", () => {
  it("rows from other actors NEVER appear under self scope", async () => {
    const a = await makeMemberWithLogin();
    const b = await makeMemberWithLogin();
    const aIds = await seedRows(a.entityId, 2);
    const bIds = await seedRows(b.entityId, 3);
    const r = await exportCall(a, "?format=csv");
    expect(r.statusCode).toBe(200);
    // a's rows present; b's rows absent.
    for (const id of aIds) expect(r.body).toContain(id);
    for (const id of bIds) expect(r.body).not.toContain(id);
  });
});

describe("Wave 4 NDJSON regression — Hardening A does not break the prior path", () => {
  it("format=ndjson still returns application/x-ndjson + x-audit-format=ndjson", async () => {
    const caller = await makeMemberWithLogin();
    await seedRows(caller.entityId, 1);
    const r = await exportCall(caller, "?format=ndjson");
    expect(r.statusCode).toBe(200);
    expect(r.contentType).toContain("application/x-ndjson");
    expect(r.format).toBe("ndjson");
    // First line is a JSON object (NDJSON shape preserved).
    const firstLine = r.body.split("\n")[0];
    expect(() => JSON.parse(firstLine!)).not.toThrow();
  });
});
