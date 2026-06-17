// FILE: perception-device-capture.test.ts (integration)
// PURPOSE: Phase 1287-A — HTTP coverage for the glasses/lens device-capture
//          adapter: auth required; a valid user-initiated text packet captures
//          (deterministic, Python not configured in test env); raw camera frames
//          are rejected; consent is required; bystander-sensitive is blocked
//          unless private; device-provided identity is ignored (the captured row
//          belongs to the authed caller, not any device-claimed entity). No task
//          / send / approval side effect. End-to-end via buildApp.
// CONNECTS TO:
//   - apps/api/src/routes/work-os-ledger.routes.ts
//   - apps/api/src/services/perception/ambient-perception.service.ts

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

const TEST_JWT_SECRET = "perception-device-capture-test-secret";
const TEST_KEY = randomBytes(32);
let app: FastifyInstance;
let ORG_ID: string;
let TOKEN: string;
let ENTITY_ID: string;

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
  const password = "correct-horse-battery";
  const input = makeEntityInput({ entity_type: "PERSON", password });
  const ent = await createEntity(input);
  ENTITY_ID = ent.entity_id;
  await prisma.entityMembership.create({
    data: { parent_id: ORG_ID, child_id: ent.entity_id, role_title: "MEMBER", is_active: true },
  });
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email: input.email, password, requested_operations: ["read", "write"] },
    remoteAddress: "10.97.1.1",
  });
  TOKEN = (res.json() as { token: string }).token;
});

afterAll(async () => {
  await app.close();
  await cleanupTestData();
  await prisma.$disconnect();
});

const GOOD_CONSENT = { user_initiated: true, capture_visible_to_user: true, bystander_sensitive: false };

async function deviceCapture(payload: Record<string, unknown>, token: string | null = TOKEN) {
  return app.inject({
    method: "POST",
    url: "/api/v1/work-os/perception/device-capture",
    headers: token !== null ? { authorization: `Bearer ${token}` } : {},
    payload,
  });
}

describe("perception device-capture route", () => {
  it("401s without auth", async () => {
    const res = await deviceCapture({ source_type: "GLASSES_NOTE", text: "x", consent: GOOD_CONSENT }, null);
    expect(res.statusCode).toBe(401);
  });

  it("captures a valid user-initiated glasses note (deterministic; Python not configured)", async () => {
    const res = await deviceCapture({
      source_type: "GLASSES_NOTE",
      text: "Note to self: ship the launch checklist by Friday.",
      consent: GOOD_CONSENT,
      device_context: { device_type: "glasses", device_id: "hw-secret-xyz", capture_mode: "user_tapped" },
      visibility: { scope: "private" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { ok: boolean; entry: { ledger_entry_id: string; ledger_type: string; owner_entity_id: string | null }; disposition: string };
    expect(body.ok).toBe(true);
    expect(body.entry.ledger_type).toBe("MEETING");
    // Device-provided identity is ignored — the row belongs to the authed caller.
    expect(body.entry.owner_entity_id).toBe(ENTITY_ID);
    expect(body.disposition).toBe("STORED");
    // The untrusted device_id is never persisted on the row.
    const row = await prisma.workLedgerEntry.findUnique({ where: { ledger_entry_id: body.entry.ledger_entry_id }, select: { details: true } });
    expect(JSON.stringify(row?.details ?? {})).not.toContain("hw-secret-xyz");
  });

  it("rejects a raw camera frame payload", async () => {
    const res = await deviceCapture({ source_type: "GLASSES_NOTE", text: "x", consent: GOOD_CONSENT, image: "data:image/png;base64,AAAA" });
    expect(res.statusCode).toBe(422);
    expect((res.json() as { code: string }).code).toBe("RAW_FRAME_REJECTED");
  });

  it("requires consent (user-initiated + visible)", async () => {
    const res = await deviceCapture({ source_type: "GLASSES_NOTE", text: "x", consent: { user_initiated: false, capture_visible_to_user: true, bystander_sensitive: false } });
    expect(res.statusCode).toBe(422);
    expect((res.json() as { code: string }).code).toBe("CONSENT_REQUIRED");
  });

  it("rejects a reserved visual source type", async () => {
    const res = await deviceCapture({ source_type: "GLASSES_VISUAL_FRAME", text: "a face", consent: GOOD_CONSENT });
    expect(res.statusCode).toBe(422);
    expect((res.json() as { code: string }).code).toBe("SOURCE_NOT_SUPPORTED");
  });

  it("blocks bystander-sensitive capture unless private", async () => {
    const blocked = await deviceCapture({ source_type: "LENS_CONTEXT", text: "overheard", consent: { user_initiated: true, capture_visible_to_user: true, bystander_sensitive: true }, visibility: { scope: "org" } });
    expect(blocked.statusCode).toBe(422);
    expect((blocked.json() as { code: string }).code).toBe("BYSTANDER_BLOCKED");
    const priv = await deviceCapture({ source_type: "LENS_CONTEXT", text: "overheard", consent: { user_initiated: true, capture_visible_to_user: true, bystander_sensitive: true }, visibility: { scope: "private" } });
    expect(priv.statusCode).toBe(200);
    expect((priv.json() as { disposition: string }).disposition).toBe("STORED_PRIVATE_DOWNGRADED");
  });
});
