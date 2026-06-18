// FILE: foundation-ambient-packet.test.ts (integration)
// PURPOSE: Phase 1291-A — HTTP coverage for the ambient device packet endpoint.
//          Proves: auth required; a confirmed private packet → MEMORY_CAPSULE_
//          PRIVATE; a raw-media packet → BLOCKED; a no-view command → REQUIRES_
//          CONFIRMATION; a bystander-sensitive org packet never becomes org
//          memory; malformed → 422; and the wire response never echoes the
//          packet text or device_id. End-to-end via buildApp.
// CONNECTS TO:
//   - apps/api/src/routes/foundation.routes.ts
//   - apps/api/src/services/foundation/ambient-device.service.ts

import { randomBytes } from "node:crypto";
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
  withCleanRateLimits,
} from "../helpers.js";
import type { FastifyInstance } from "fastify";

const TEST_JWT_SECRET = "foundation-ambient-packet-secret";
let app: FastifyInstance;
let TOKEN: string;
const store = new MemoryRateLimitStore();

beforeAll(async () => {
  await ensureAuditTriggers();
  await cleanupTestData();
  app = await buildApp({
    jwtSecret: TEST_JWT_SECRET,
    sessionNonceStore: new MemoryNonceStore(),
    declarationStore: new MemoryNonceStore(),
    contentStore: new MemoryContentStore(),
    contentEncryption: new ContentEncryption(randomBytes(32)),
    rateLimitStore: store,
  });
  const password = "correct-horse-battery";
  const input = makeEntityInput({ entity_type: "PERSON", password });
  await createEntity(input);
  const login = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email: input.email, password, requested_operations: ["read", "write"] },
  });
  TOKEN = (login.json() as { token: string }).token;
});

afterAll(async () => {
  await app.close();
  await cleanupTestData();
  await prisma.$disconnect();
});

withCleanRateLimits(store);

const GOOD_CONSENT = { user_initiated: true, capture_visible_to_user: true, bystander_sensitive: false };

function send(body: Record<string, unknown>, token: string | null = TOKEN) {
  return app.inject({
    method: "POST",
    url: "/api/v1/foundation/devices/ambient-packets",
    headers: token !== null ? { authorization: `Bearer ${token}` } : {},
    payload: body,
  });
}

describe("Foundation ambient device packet (governed disposition)", () => {
  it("401s without auth", async () => {
    const res = await send({ source_type: "GLASSES_NOTE", mode: "manual_capture", text: "x", consent: GOOD_CONSENT }, null);
    expect(res.statusCode).toBe(401);
  });

  it("422s on a malformed request", async () => {
    const res = await send({ source_type: "GLASSES_NOTE", mode: "manual_capture" });
    expect(res.statusCode).toBe(422);
  });

  it("a confirmed private packet → MEMORY_CAPSULE_PRIVATE", async () => {
    const res = await send({
      source_type: "GLASSES_NOTE",
      mode: "manual_capture",
      text: "remember to follow up with the design team",
      consent: GOOD_CONSENT,
      visibility: { scope: "private" },
      confirmation: { user_confirmed: true, confirmation_mode: "TAP" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { ok: boolean; packet: { decision: { disposition: string } } };
    expect(body.ok).toBe(true);
    expect(body.packet.decision.disposition).toBe("MEMORY_CAPSULE_PRIVATE");
  });

  it("a raw-media packet → BLOCKED", async () => {
    const res = await send({
      source_type: "GLASSES_NOTE",
      mode: "visual_note",
      text: "note",
      consent: GOOD_CONSENT,
      raw_media_keys: ["frame-1.jpg"],
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { packet: { decision: { disposition: string; reason_code: string } } }).packet.decision.disposition).toBe("BLOCKED");
  });

  it("a no-view command without confirmation → REQUIRES_CONFIRMATION", async () => {
    const res = await send({
      source_type: "AMBIENT_DEVICE_PACKET",
      mode: "no_view_command",
      text: "schedule a sync",
      consent: GOOD_CONSENT,
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { packet: { decision: { disposition: string } } }).packet.decision.disposition).toBe("REQUIRES_CONFIRMATION");
  });

  it("a bystander-sensitive org packet never becomes org memory", async () => {
    const res = await send({
      source_type: "LENS_CONTEXT",
      mode: "manual_capture",
      text: "overheard in the hallway",
      consent: { user_initiated: true, capture_visible_to_user: true, bystander_sensitive: true },
      visibility: { scope: "org" },
      confirmation: { user_confirmed: true, confirmation_mode: "TAP" },
    });
    expect(res.statusCode).toBe(200);
    const d = (res.json() as { packet: { decision: { disposition: string; allowed_into_org_memory: boolean } } }).packet.decision;
    expect(d.disposition).toBe("MEMORY_CAPSULE_PRIVATE");
    expect(d.allowed_into_org_memory).toBe(false);
  });

  it("never echoes the packet text or device_id on the wire", async () => {
    const res = await send({
      source_type: "GLASSES_NOTE",
      mode: "manual_capture",
      text: "SECRET-MARKER-TEXT-SHOULD-NOT-LEAK",
      consent: GOOD_CONSENT,
      device_id: "DEVICE-ID-SHOULD-NOT-LEAK",
      visibility: { scope: "private" },
    });
    expect(res.payload).not.toContain("SECRET-MARKER-TEXT-SHOULD-NOT-LEAK");
    expect(res.payload).not.toContain("DEVICE-ID-SHOULD-NOT-LEAK");
    expect(res.payload).toContain('"device_identity_trusted":false');
  });
});
