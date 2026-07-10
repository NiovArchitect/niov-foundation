// FILE: inbound-signal.test.ts (integration, real Postgres)
// PURPOSE: [INBOUND-SIGNAL · Slice 2] Lock the internal HMAC-signed event rail:
//          HMAC-only auth, single-use nonce (replay), per-resource debounce
//          (dedupe), fail-closed org/actor allowlist (org from binding NOT
//          payload), quota bound, source_* → revalidation sink (re-fetch, don't
//          trust), calendar_* → quarantine-deferred, unknown → quarantine, and
//          the route-scoped raw-body parser that does NOT break global JSON.
// CONNECTS TO: services/otzar/inbound-signal.service.ts, routes/inbound-signal
//          .routes.ts, redis.ts (MemoryNonceStore), document-context.service.ts.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID, createHmac } from "node:crypto";
import { buildApp, MemoryNonceStore } from "@niov/api";
import { computeTARHash, prisma } from "@niov/database";
import { processInboundSignal } from "../../apps/api/src/services/otzar/inbound-signal.service.js";
import {
  importGoogleDocForCaller,
  type FetchDocText,
} from "../../apps/api/src/services/otzar/document-context.service.js";
import { createEntity } from "../../packages/database/src/queries/entity.js";
import { cleanupTestData, ensureAuditTriggers, TEST_PREFIX } from "../helpers.js";
import type { FastifyInstance } from "fastify";

const SECRET = "inbound-test-secret-do-not-use-in-prod";
const CT = "application/otzar-signal";

function fakePublicKey(seed: string): string {
  return `-----BEGIN PUBLIC KEY-----\n${seed}\n-----END PUBLIC KEY-----`;
}
async function makeEntity(name: string, type: "PERSON" | "COMPANY"): Promise<string> {
  const e = await createEntity({
    email: `${TEST_PREFIX}${name.toLowerCase().replace(/[^a-z0-9]/g, ".")}.${randomUUID().slice(0, 6)}@niov-test.com`,
    public_key: fakePublicKey(name + randomUUID()),
    display_name: `${TEST_PREFIX} ${name}`,
    entity_type: type,
    clearance_level: 3,
    status: "ACTIVE",
  });
  return e.entity_id;
}
async function grantOrgAdmin(entityId: string): Promise<void> {
  await prisma.tokenAttributeRepository.update({ where: { entity_id: entityId }, data: { can_admin_org: true } });
  const fresh = await prisma.tokenAttributeRepository.findUnique({ where: { entity_id: entityId } });
  await prisma.tokenAttributeRepository.update({
    where: { entity_id: entityId },
    data: {
      tar_hash: computeTARHash({
        can_login: fresh!.can_login, can_read_capsules: fresh!.can_read_capsules,
        can_write_capsules: fresh!.can_write_capsules, can_share_capsules: fresh!.can_share_capsules,
        can_create_hives: fresh!.can_create_hives, can_access_external_api: fresh!.can_access_external_api,
        can_admin_niov: fresh!.can_admin_niov, can_admin_org: fresh!.can_admin_org,
        clearance_ceiling: fresh!.clearance_ceiling, monetization_role: fresh!.monetization_role,
        compliance_frameworks: fresh!.compliance_frameworks, status: fresh!.status,
      }),
    },
  });
}
function okExport(fileId: string, sha: string): Awaited<ReturnType<FetchDocText>> {
  return { ok: true, provider: "google", file_id: fileId, name: "u", modified_time: "2026-07-05T00:00:00Z", web_view_link: null, content_sha256: sha, text: "t" };
}
const TRANSIENT: Awaited<ReturnType<FetchDocText>> = { ok: false, code: "PROVIDER_ERROR" };
function fetchByFileId(map: Record<string, Awaited<ReturnType<FetchDocText>>>): FetchDocText {
  return async (a) => { const h = map[a.file_id]; if (h === undefined) throw new Error("unexpected " + a.file_id); return h; };
}
function sign(payload: Record<string, unknown>, secret: string, timestamp: number) {
  const rawBody = Buffer.from(JSON.stringify(payload));
  const sig = "sha256=" + createHmac("sha256", secret).update(`${timestamp}.${rawBody.toString("utf8")}`).digest("hex");
  return { rawBody, sig, timestamp: String(timestamp) };
}

async function cleanup(): Promise<void> {
  const ents = await prisma.entity.findMany({ where: { display_name: { startsWith: TEST_PREFIX } }, select: { entity_id: true } });
  const ids = ents.map((e) => e.entity_id);
  if (ids.length === 0) return;
  await prisma.notification.deleteMany({ where: { OR: [{ recipient_entity_id: { in: ids } }, { source_entity_id: { in: ids } }, { org_entity_id: { in: ids } }] } });
  await prisma.workLedgerEntry.deleteMany({ where: { org_entity_id: { in: ids } } });
}

describe("[INBOUND-SIGNAL] internal HMAC-signed event rail (DB)", () => {
  let orgId = "";
  let adminId = "";
  let store: MemoryNonceStore;
  const priorSecret = process.env.INBOUND_SIGNAL_SECRET;
  const priorTargets = process.env.SOURCE_RECHECK_TARGETS;

  async function importDoc(fileId: string, sha: string): Promise<string> {
    const r = await importGoogleDocForCaller(adminId, { file_id: fileId, name: fileId, text: "seed", modified_time: "2026-06-01T00:00:00Z", web_view_link: null, content_sha256: sha, source_kind: "SOP", currentness: "historical" });
    if (r.ok === false) throw new Error("import failed");
    return r.ledger_entry_id;
  }
  function base(overrides: Record<string, unknown>): Record<string, unknown> {
    return { org_entity_id: orgId, actor_entity_id: adminId, event_type: "source_changed", resource_id: "f-x", event_id: randomUUID(), nonce: randomUUID(), ...overrides };
  }
  async function run(payload: Record<string, unknown>, opts?: { secret?: string; ts?: number; fetch?: FetchDocText }) {
    const s = sign(payload, opts?.secret ?? SECRET, opts?.ts ?? Date.now());
    return processInboundSignal({ rawBody: s.rawBody, signatureHeader: s.sig, timestampHeader: s.timestamp, secret: SECRET, nonceStore: store, ...(opts?.fetch ? { fetchDocText: opts.fetch } : {}) });
  }
  async function stateOf(id: string): Promise<string | undefined> {
    const row = await prisma.workLedgerEntry.findUnique({ where: { ledger_entry_id: id } });
    return ((((row!.details ?? {}) as Record<string, unknown>).source_integrity ?? {}) as Record<string, unknown>).state as string | undefined;
  }

  beforeAll(async () => { await ensureAuditTriggers(); });
  beforeEach(async () => {
    await cleanup(); await cleanupTestData();
    orgId = await makeEntity("Sig Org", "COMPANY");
    adminId = await makeEntity("Sig Admin", "PERSON");
    await grantOrgAdmin(adminId);
    await prisma.entityMembership.create({ data: { parent_id: orgId, child_id: adminId, is_active: true, is_admin: true } });
    store = new MemoryNonceStore();
    process.env.INBOUND_SIGNAL_SECRET = SECRET;
    process.env.SOURCE_RECHECK_TARGETS = `${orgId}:${adminId}`; // fail-closed allowlist
  });
  afterAll(async () => {
    if (priorSecret === undefined) delete process.env.INBOUND_SIGNAL_SECRET; else process.env.INBOUND_SIGNAL_SECRET = priorSecret;
    if (priorTargets === undefined) delete process.env.SOURCE_RECHECK_TARGETS; else process.env.SOURCE_RECHECK_TARGETS = priorTargets;
    await cleanup(); await cleanupTestData(); await prisma.$disconnect();
  });

  it("1+8. valid source_changed authenticates + triggers revalidation of the matching source only", async () => {
    const doc = await importDoc("f-chg", "sha-old");
    const other = await importDoc("f-other", "sha-o");
    const r = await run(base({ resource_id: "f-chg" }), { fetch: fetchByFileId({ "f-chg": okExport("f-chg", "sha-new") }) });
    expect(r).toMatchObject({ httpStatus: 200, status: "processed" });
    expect(await stateOf(doc)).toBe("CHANGED_UPSTREAM");
    expect(await stateOf(other)).toBe("AVAILABLE"); // untouched — only the signaled source
  });

  it("2. invalid signature rejected (401, no processing)", async () => {
    const r = await run(base({}), { secret: "wrong-secret" });
    expect(r).toMatchObject({ httpStatus: 401, status: "unauthenticated" });
  });

  it("3. stale timestamp rejected (401)", async () => {
    const r = await run(base({}), { ts: Date.now() - 10 * 60 * 1000 }); // 10 min ago > 5 min window
    expect(r.httpStatus).toBe(401);
  });

  it("4. replayed nonce rejected (409)", async () => {
    await importDoc("f-r", "sha");
    const payload = base({ resource_id: "f-r", nonce: "fixed-nonce-1" });
    const fetch = fetchByFileId({ "f-r": okExport("f-r", "sha") });
    const first = await run(payload, { fetch });
    expect(first.httpStatus).toBe(200);
    const replay = await run(payload, { fetch }); // identical signed blob (same nonce)
    expect(replay).toMatchObject({ httpStatus: 409, status: "replay_rejected" });
  });

  it("5. duplicate event for the same resource is DEDUPED via debounce (no second fetch)", async () => {
    await importDoc("f-d", "sha");
    const fetch = fetchByFileId({ "f-d": okExport("f-d", "sha") });
    const a = await run(base({ resource_id: "f-d" }), { fetch });
    expect(a.httpStatus).toBe(200);
    const b = await run(base({ resource_id: "f-d" }), { fetch }); // new nonce, same resource
    expect(b).toMatchObject({ httpStatus: 200, status: "deduped" });
  });

  it("6+14. org NOT in the allowlist is quarantined (demo/unlisted org untargetable)", async () => {
    const unlisted = await makeEntity("Unlisted Org", "COMPANY");
    const r = await run(base({ org_entity_id: unlisted, actor_entity_id: adminId }));
    expect(r).toMatchObject({ httpStatus: 403, status: "quarantined", reason: "org_actor_not_allowlisted" });
  });

  it("7. actor→org mismatch (allowlisted but actor not in that org) is quarantined", async () => {
    // Allowlist claims org=orgId actor=adminId, but point the actor at a different org.
    const otherOrg = await makeEntity("Other Org", "COMPANY");
    process.env.SOURCE_RECHECK_TARGETS = `${otherOrg}:${adminId}`; // adminId's real org is orgId, not otherOrg
    const r = await run(base({ org_entity_id: otherOrg, actor_entity_id: adminId }));
    expect(r).toMatchObject({ httpStatus: 403, status: "quarantined", reason: "actor_guard_failed" });
  });

  it("9. unknown event type is quarantined", async () => {
    const r = await run(base({ event_type: "totally_unknown" }));
    expect(r).toMatchObject({ status: "quarantined", reason: "unknown_event_type" });
  });

  it("calendar_* is accepted, authenticated, and quarantined (sink deferred)", async () => {
    const r = await run(base({ event_type: "calendar_changed", resource_id: "evt-1" }));
    expect(r).toMatchObject({ httpStatus: 202, status: "quarantined", reason: "calendar_sink_not_wired" });
  });

  it("no matching imported source is quarantined (never imports from a signal)", async () => {
    const r = await run(base({ resource_id: "f-does-not-exist" }), { fetch: fetchByFileId({}) });
    expect(r).toMatchObject({ status: "quarantined", reason: "no_matching_imported_source" });
  });

  it("transient sink → FAILED (503) AND releases the debounce so a retry re-attempts", async () => {
    const doc = await importDoc("f-t", "sha");
    const t = await run(base({ resource_id: "f-t" }), { fetch: fetchByFileId({ "f-t": TRANSIENT }) });
    expect(t).toMatchObject({ httpStatus: 503, status: "transient" });
    expect(await stateOf(doc)).toBe("AVAILABLE"); // snapshot preserved
    // Debounce released → a retry (new nonce) is NOT deduped and re-attempts.
    const retry = await run(base({ resource_id: "f-t" }), { fetch: fetchByFileId({ "f-t": okExport("f-t", "sha") }) });
    expect(retry).toMatchObject({ httpStatus: 200, status: "processed" });
  });

  it("15. per-org quota bound → over-cap signals are quarantined (429)", async () => {
    const nowMs = 1_800_000_000_000; // fixed bucket
    const bucket = Math.floor(nowMs / 60_000);
    for (let i = 0; i < 60; i++) await store.incr(`inbound_quota:${orgId}:${bucket}`, 90);
    await importDoc("f-q", "sha");
    const s = sign(base({ resource_id: "f-q" }), SECRET, nowMs);
    const r = await processInboundSignal({ rawBody: s.rawBody, signatureHeader: s.sig, timestampHeader: s.timestamp, secret: SECRET, nonceStore: store, nowMs, fetchDocText: fetchByFileId({ "f-q": okExport("f-q", "sha") }) });
    expect(r).toMatchObject({ httpStatus: 429, status: "quarantined", reason: "org_quota_exceeded" });
  });

  it("13. leak-safe: responses never carry the secret/signature/token/raw payload", async () => {
    const r = await run(base({ event_type: "calendar_changed", resource_id: "evt-x" }));
    const blob = JSON.stringify(r);
    expect(blob).not.toContain(SECRET);
    expect(blob).not.toMatch(/sha256=/);
    expect(blob).not.toMatch(/token|bearer|password/i);
  });
});

describe("[INBOUND-SIGNAL · ROUTE] HMAC-only auth + route-scoped raw body", () => {
  let app: FastifyInstance;
  const priorSecret = process.env.INBOUND_SIGNAL_SECRET;
  beforeAll(async () => {
    await ensureAuditTriggers();
    process.env.INBOUND_SIGNAL_SECRET = SECRET;
    app = await buildApp({ jwtSecret: "route-test-secret", sessionNonceStore: new MemoryNonceStore(), declarationStore: new MemoryNonceStore(), inboundNonceStore: new MemoryNonceStore() });
  });
  afterAll(async () => {
    if (priorSecret === undefined) delete process.env.INBOUND_SIGNAL_SECRET; else process.env.INBOUND_SIGNAL_SECRET = priorSecret;
    await app.close(); await prisma.$disconnect();
  });

  it("10. the custom-content-type raw parser does NOT break normal application/json routes", async () => {
    const res = await app.inject({ method: "POST", url: "/api/v1/auth/login", headers: { "content-type": "application/json" }, payload: { email: "x@y.z", password: "nope" } });
    // Normal JSON parsing still works: we get an auth decision (401/403), NOT a
    // content-type-parser error (415/500).
    expect([400, 401, 403]).toContain(res.statusCode);
  });

  it("11. cookie-only (no valid HMAC) does NOT authenticate → 401", async () => {
    const res = await app.inject({ method: "POST", url: "/api/v1/otzar/inbound/signal", headers: { "content-type": CT, cookie: "otzar_session=abc" }, payload: Buffer.from(JSON.stringify({ x: 1 })) });
    expect(res.statusCode).toBe(401);
  });

  it("12. Bearer alone (no HMAC) does NOT authenticate → 401", async () => {
    const res = await app.inject({ method: "POST", url: "/api/v1/otzar/inbound/signal", headers: { "content-type": CT, authorization: "Bearer whatever" }, payload: Buffer.from(JSON.stringify({ x: 1 })) });
    expect(res.statusCode).toBe(401);
  });

  it("wrong content-type → 415", async () => {
    const res = await app.inject({ method: "POST", url: "/api/v1/otzar/inbound/signal", headers: { "content-type": "application/json" }, payload: { x: 1 } });
    expect(res.statusCode).toBe(415);
  });

  it("a VALID signed request flows through the route (calendar → 202 quarantined) with a minimal body", async () => {
    const org = await makeEntity("Route Org", "COMPANY");
    const admin = await makeEntity("Route Admin", "PERSON");
    await grantOrgAdmin(admin);
    await prisma.entityMembership.create({ data: { parent_id: org, child_id: admin, is_active: true, is_admin: true } });
    process.env.SOURCE_RECHECK_TARGETS = `${org}:${admin}`;
    const ts = Date.now();
    const payload = { org_entity_id: org, actor_entity_id: admin, event_type: "calendar_changed", resource_id: "evt-1", event_id: randomUUID(), nonce: randomUUID() };
    const s = sign(payload, SECRET, ts);
    const res = await app.inject({ method: "POST", url: "/api/v1/otzar/inbound/signal", headers: { "content-type": CT, "x-otzar-signature": s.sig, "x-otzar-timestamp": s.timestamp }, payload: s.rawBody });
    expect(res.statusCode).toBe(202);
    const body = res.json() as Record<string, unknown>;
    expect(body.status).toBe("quarantined");
    expect(JSON.stringify(body)).not.toContain(SECRET);
  });
});
