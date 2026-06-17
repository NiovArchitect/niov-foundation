// FILE: watcher-beam-feed.test.ts (integration)
// PURPOSE: Phase 1287-B — HTTP coverage for the BEAM-enriched watcher feed.
//          The default /watchers/feed is unchanged (deterministic, no `beam`
//          field). With ?include_beam=true and BEAM NOT configured in the test
//          env, Foundation returns the SAME deterministic findings plus an
//          honest beam.status=NOT_CONFIGURED and zero annotations — the feed
//          never blocks/fails on BEAM. No cross-tenant leakage.
// CONNECTS TO:
//   - apps/api/src/routes/work-os-ledger.routes.ts
//   - apps/api/src/services/work-os/watcher.service.ts

import { randomUUID, randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildApp,
  MemoryContentStore,
  MemoryNonceStore,
  MemoryRateLimitStore,
} from "@niov/api";
import { ContentEncryption } from "@niov/auth";
import { createEntity, prisma } from "@niov/database";
import {
  cleanupTestData,
  ensureAuditTriggers,
  makeEntityInput,
  TEST_PREFIX,
} from "../helpers.js";
import type { FastifyInstance } from "fastify";

const TEST_JWT_SECRET = "watcher-beam-feed-test-secret";
const TEST_KEY = randomBytes(32);
let app: FastifyInstance;
let ORG_ID: string;

beforeAll(async () => {
  await ensureAuditTriggers();
  await cleanupTestData();
  app = await buildApp({
    jwtSecret: TEST_JWT_SECRET,
    sessionNonceStore: new MemoryNonceStore(),
    declarationStore: new MemoryNonceStore(),
    contentStore: new MemoryContentStore(),
    contentEncryption: new ContentEncryption(TEST_KEY),
    rateLimitStore: new MemoryRateLimitStore(),
  });
  const org = await createEntity({
    entity_type: "COMPANY",
    display_name: `${TEST_PREFIX}org_${randomUUID()}`,
    email: `${TEST_PREFIX}org_${randomUUID()}@niov.test`,
    public_key: "test-public-key",
    clearance_level: 0,
  });
  ORG_ID = org.entity_id;
});

afterAll(async () => {
  await app.close();
  await cleanupTestData();
  await prisma.$disconnect();
});

async function login(orgId: string): Promise<string> {
  const password = "correct-horse-battery";
  const input = makeEntityInput({ entity_type: "PERSON", password });
  const ent = await createEntity(input);
  await prisma.entityMembership.create({
    data: { parent_id: orgId, child_id: ent.entity_id, role_title: "MEMBER", is_active: true },
  });
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email: input.email, password, requested_operations: ["read", "write"] },
    remoteAddress: `10.98.${Math.floor(Math.random() * 200) + 1}.1`,
  });
  return (res.json() as { token: string }).token;
}

async function createLedger(token: string, body: Record<string, unknown>): Promise<void> {
  const res = await app.inject({ method: "POST", url: "/api/v1/work-os/ledger", headers: { authorization: `Bearer ${token}` }, payload: body });
  expect(res.statusCode).toBe(201);
}

interface FeedBody {
  ok: boolean;
  findings: Array<{ finding_id: string; watcher_type: string; title: string; beam_advisory?: unknown }>;
  beam?: { status: string; correlation_id: string; confirmed_count: number; dropped_count: number };
}

async function feed(token: string, includeBeam: boolean): Promise<FeedBody> {
  const res = await app.inject({
    method: "GET",
    url: `/api/v1/work-os/watchers/feed${includeBeam ? "?include_beam=true" : ""}`,
    headers: { authorization: `Bearer ${token}` },
  });
  expect(res.statusCode).toBe(200);
  return res.json() as FeedBody;
}

describe("watcher feed — BEAM advisory bridge", () => {
  it("default feed is unchanged (deterministic, no beam field)", async () => {
    const token = await login(ORG_ID);
    await createLedger(token, { ledger_type: "BLOCKER", title: "Compliance blocker" });
    const body = await feed(token, false);
    expect(body.ok).toBe(true);
    expect(body.beam).toBeUndefined();
    expect(body.findings.some((f) => f.watcher_type === "UNRESOLVED_BLOCKER")).toBe(true);
  });

  it("?include_beam returns deterministic findings + honest NOT_CONFIGURED when BEAM is off; no annotations", async () => {
    const token = await login(ORG_ID);
    await createLedger(token, { ledger_type: "BLOCKER", title: "Another blocker" });
    const body = await feed(token, true);
    expect(body.ok).toBe(true);
    // Deterministic findings still present — the feed never blocks/fails on BEAM.
    expect(body.findings.some((f) => f.watcher_type === "UNRESOLVED_BLOCKER")).toBe(true);
    // BEAM not configured in the test env → honest status, zero annotations.
    expect(body.beam?.status).toBe("NOT_CONFIGURED");
    expect(body.beam?.confirmed_count).toBe(0);
    expect(body.findings.every((f) => f.beam_advisory === undefined)).toBe(true);
    // The finding's primary label is its title, never a raw UUID.
    const f = body.findings[0]!;
    expect(f.title).not.toBe(f.finding_id);
  });

  it("never surfaces another tenant's findings", async () => {
    const aToken = await login(ORG_ID);
    const marker = `wbeamquux-${randomUUID().slice(0, 8)}`;
    await createLedger(aToken, { ledger_type: "BLOCKER", title: `Secret ${marker} blocker` });
    const otherOrg = await createEntity({ entity_type: "COMPANY", display_name: `${TEST_PREFIX}org2_${randomUUID()}`, email: `${TEST_PREFIX}org2_${randomUUID()}@niov.test`, public_key: "k", clearance_level: 0 });
    const bToken = await login(otherOrg.entity_id);
    const body = await feed(bToken, true);
    expect(body.findings.every((f) => !f.title.includes(marker))).toBe(true);
  });
});
