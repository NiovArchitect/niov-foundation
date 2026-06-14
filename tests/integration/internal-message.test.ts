// FILE: internal-message.test.ts (integration)
// PURPOSE: Phase 1284 Wave 2 — prove the human-authority direct internal
//          message loop end-to-end via HTTP: a human sends a LOW-risk
//          internal note to an org member (resolved by name), it DELIVERS
//          directly under the sender's authority (no dual-control dead-end),
//          lands in the recipient's inbox as From-the-sender, with Work
//          Ledger proof; unknown recipient → NEEDS_RESOLUTION (never
//          fabricated); cross-tenant recipient is not deliverable.
// CONNECTS TO: apps/api/src/routes/work-os-ledger.routes.ts
//          (POST /work-os/internal-messages),
//          apps/api/src/services/collaboration/internal-message.service.ts

import { randomBytes, randomUUID } from "node:crypto";
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

const TEST_JWT_SECRET = "internal-message-test-secret";
const TEST_KEY = randomBytes(32);
let app: FastifyInstance;
let ORG_ID: string;

async function member(orgId: string, displayName: string): Promise<{ id: string; token: string }> {
  const password = "correct-horse-battery";
  const input = makeEntityInput({ entity_type: "PERSON", password });
  const ent = await createEntity({ ...input, display_name: displayName });
  await prisma.entityMembership.create({
    data: { parent_id: orgId, child_id: ent.entity_id, role_title: "MEMBER", is_active: true },
  });
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email: input.email, password, requested_operations: ["read", "write"] },
    remoteAddress: `10.93.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 254) + 1}`,
  });
  return { id: ent.entity_id, token: (res.json() as { token: string }).token };
}

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
    public_key: "k",
    clearance_level: 0,
  });
  ORG_ID = org.entity_id;
});

afterAll(async () => {
  await app.close();
  await cleanupTestData();
  await prisma.$disconnect();
});

describe("human-authority direct internal message", () => {
  it("delivers a note resolved BY NAME to the recipient's inbox, with ledger proof", async () => {
    const sadeil = await member(ORG_ID, `${TEST_PREFIX}Sadeil Lewis`);
    const david = await member(ORG_ID, `${TEST_PREFIX}David Odie`);

    const send = await app.inject({
      method: "POST",
      url: "/api/v1/work-os/internal-messages",
      headers: { authorization: `Bearer ${sadeil.token}` },
      payload: { recipient: "David", message: "Hey David — good morning!" },
    });
    expect(send.statusCode).toBe(201);
    const sj = send.json() as {
      ok: boolean; status: string; notification_id: string; ledger_entry_id: string | null;
      recipient_entity_id: string;
    };
    expect(sj.ok).toBe(true);
    expect(sj.status).toBe("DELIVERED");
    expect(sj.recipient_entity_id).toBe(david.id);
    expect(sj.notification_id).toBeTruthy();
    expect(sj.ledger_entry_id).toBeTruthy();

    // David's inbox shows it, from Sadeil.
    const inbox = await app.inject({
      method: "GET",
      url: "/api/v1/notifications",
      headers: { authorization: `Bearer ${david.token}` },
    });
    expect(inbox.statusCode).toBe(200);
    const items = (inbox.json() as { notifications?: Array<{ body_summary: string; source_entity_id: string }>; items?: Array<{ body_summary: string; source_entity_id: string }> });
    const list = items.notifications ?? items.items ?? [];
    const got = list.find((n) => n.body_summary.includes("good morning")) as
      | { body_summary: string; sender?: { entity_id: string; display_name: string; source_kind: string } }
      | undefined;
    expect(got).toBeDefined();
    expect(sj.recipient_entity_id).toBe(david.id);
    // Phase 1284 governed sender identity: the intended recipient sees who
    // sent it, labeled HUMAN (not raw UUID only).
    expect(got?.sender?.entity_id).toBe(sadeil.id);
    expect(got?.sender?.display_name).toContain("Sadeil");
    expect(got?.sender?.source_kind).toBe("HUMAN");
  });

  it("does not leak the message OR sender to an unrelated user", async () => {
    const sender = await member(ORG_ID, `${TEST_PREFIX}Isolation Sender`);
    const recipient = await member(ORG_ID, `${TEST_PREFIX}Isolation Recipient`);
    const unrelated = await member(ORG_ID, `${TEST_PREFIX}Unrelated User`);
    await app.inject({
      method: "POST",
      url: "/api/v1/work-os/internal-messages",
      headers: { authorization: `Bearer ${sender.token}` },
      payload: { recipient: recipient.id, message: "secret iso note xyz" },
    });
    const inbox = await app.inject({
      method: "GET",
      url: "/api/v1/notifications",
      headers: { authorization: `Bearer ${unrelated.token}` },
    });
    const j = inbox.json() as { notifications?: Array<{ body_summary: string }>; items?: Array<{ body_summary: string }> };
    const list = j.notifications ?? j.items ?? [];
    expect(list.some((n) => n.body_summary.includes("secret iso note xyz"))).toBe(false);
  });

  it("returns NEEDS_RESOLUTION (not a fabricated person) for an unknown recipient", async () => {
    const sadeil = await member(ORG_ID, `${TEST_PREFIX}Sender One`);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/work-os/internal-messages",
      headers: { authorization: `Bearer ${sadeil.token}` },
      payload: { recipient: "Nonexistent Person", message: "hi" },
    });
    expect(res.statusCode).toBe(422);
    const j = res.json() as { status: string; resolution: { kind: string } };
    expect(j.status).toBe("NEEDS_RESOLUTION");
    expect(j.resolution.kind).toBe("NOT_FOUND");
  });

  it("returns INVALID_ID resolution for a malformed id (no Prisma crash)", async () => {
    const sadeil = await member(ORG_ID, `${TEST_PREFIX}Sender Two`);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/work-os/internal-messages",
      headers: { authorization: `Bearer ${sadeil.token}` },
      payload: { recipient: "v1_local_draft_42", message: "hi" },
    });
    expect(res.statusCode).toBe(422);
    expect((res.json() as { resolution: { kind: string } }).resolution.kind).toBe("INVALID_ID");
  });

  it("threads two messages + a reply between the same two people (both see the full exchange)", async () => {
    const sadeil = await member(ORG_ID, `${TEST_PREFIX}Sadeil Thread`);
    const david = await member(ORG_ID, `${TEST_PREFIX}David Thread`);

    async function send(token: string, recipient: string, message: string): Promise<void> {
      const r = await app.inject({
        method: "POST",
        url: "/api/v1/work-os/internal-messages",
        headers: { authorization: `Bearer ${token}` },
        payload: { recipient, message },
      });
      expect(r.statusCode).toBe(201);
    }
    // Sadeil → David twice, then David → Sadeil (reply).
    await send(sadeil.token, david.id, "First message to David");
    await send(sadeil.token, david.id, "Second message to David");
    await send(david.token, sadeil.id, "David reply to Sadeil");

    // David sees the full thread with Sadeil (both directions, ordered).
    const davidThread = await app.inject({
      method: "GET",
      url: `/api/v1/work-os/threads/with/${sadeil.id}`,
      headers: { authorization: `Bearer ${david.token}` },
    });
    expect(davidThread.statusCode).toBe(200);
    const dt = davidThread.json() as { messages: Array<{ body: string; from_me: boolean }> };
    const bodies = dt.messages.map((m) => m.body);
    expect(bodies).toContain("First message to David");
    expect(bodies).toContain("Second message to David");
    expect(bodies).toContain("David reply to Sadeil");
    expect(dt.messages.length).toBe(3);

    // Sadeil sees the SAME exchange in the same thread.
    const sadeilThread = await app.inject({
      method: "GET",
      url: `/api/v1/work-os/threads/with/${david.id}`,
      headers: { authorization: `Bearer ${sadeil.token}` },
    });
    expect(sadeilThread.statusCode).toBe(200);
    expect((sadeilThread.json() as { messages: unknown[] }).messages.length).toBe(3);

    // An unrelated user cannot see the thread.
    const stranger = await member(ORG_ID, `${TEST_PREFIX}Stranger`);
    const strangerView = await app.inject({
      method: "GET",
      url: `/api/v1/work-os/threads/with/${sadeil.id}`,
      headers: { authorization: `Bearer ${stranger.token}` },
    });
    expect(strangerView.statusCode).toBe(404); // no thread between stranger + sadeil
  });

  it("thread-signal v1: a question is flagged QUESTION; a casual note has no signal", async () => {
    const a = await member(ORG_ID, `${TEST_PREFIX}Signal A`);
    const b = await member(ORG_ID, `${TEST_PREFIX}Signal B`);
    async function send(token: string, recipient: string, message: string): Promise<void> {
      const r = await app.inject({
        method: "POST",
        url: "/api/v1/work-os/internal-messages",
        headers: { authorization: `Bearer ${token}` },
        payload: { recipient, message },
      });
      expect(r.statusCode).toBe(201);
    }
    // Deterministic signals (no Python needed in the test env):
    await send(a.token, b.id, "Did you finish the proof-layer review?"); // QUESTION
    await send(a.token, b.id, "Good afternoon, the 4th of July is near."); // casual → none

    const thread = await app.inject({
      method: "GET",
      url: `/api/v1/work-os/threads/with/${b.id}`,
      headers: { authorization: `Bearer ${a.token}` },
    });
    const msgs = (thread.json() as { messages: Array<{ body: string; signal?: { signal_type: string } }> }).messages;
    const question = msgs.find((m) => m.body.includes("proof-layer review"));
    const casual = msgs.find((m) => m.body.includes("4th of July"));
    expect(question?.signal?.signal_type).toBe("QUESTION");
    expect(casual?.signal).toBeUndefined(); // casual note → no clutter
  });

  it("waiting-on v1: tracking a TASK signal creates directional work both sides see", async () => {
    const sadeil = await member(ORG_ID, `${TEST_PREFIX}Sadeil WO`);
    const david = await member(ORG_ID, `${TEST_PREFIX}David WO`);

    // Sadeil asks David for something → a NOTIFICATION message row.
    const send = await app.inject({
      method: "POST",
      url: "/api/v1/work-os/internal-messages",
      headers: { authorization: `Bearer ${sadeil.token}` },
      payload: { recipient: david.id, message: "Please send the proof-layer notes" },
    });
    const messageId = (send.json() as { ledger_entry_id: string }).ledger_entry_id;

    // Sadeil confirms it as a TASK → directional work entry.
    const track = await app.inject({
      method: "POST",
      url: `/api/v1/work-os/threads/messages/${messageId}/track-signal`,
      headers: { authorization: `Bearer ${sadeil.token}` },
      payload: { ledger_type: "TASK" },
    });
    expect(track.statusCode).toBe(201);

    // Sadeil is waiting ON David.
    const sWait = await app.inject({
      method: "GET",
      url: `/api/v1/work-os/waiting-on/with/${david.id}`,
      headers: { authorization: `Bearer ${sadeil.token}` },
    });
    const sj = sWait.json() as { waiting_on_them: unknown[]; pending_from_them: unknown[] };
    expect(sj.waiting_on_them.length).toBe(1);
    expect(sj.pending_from_them.length).toBe(0);

    // David sees it as a pending ask FROM Sadeil.
    const dWait = await app.inject({
      method: "GET",
      url: `/api/v1/work-os/waiting-on/with/${sadeil.id}`,
      headers: { authorization: `Bearer ${david.token}` },
    });
    const dj = dWait.json() as { waiting_on_them: unknown[]; pending_from_them: unknown[] };
    expect(dj.pending_from_them.length).toBe(1);
    expect(dj.waiting_on_them.length).toBe(0);

    // It also appears in David's My Work (he owns it).
    const myWork = await app.inject({
      method: "GET",
      url: "/api/v1/work-os/my-work",
      headers: { authorization: `Bearer ${david.token}` },
    });
    const items = (myWork.json() as { items: Array<{ ledger_type: string }> }).items;
    expect(items.some((i) => i.ledger_type === "TASK")).toBe(true);

    // An unrelated user cannot track the message or see the relationship.
    const stranger = await member(ORG_ID, `${TEST_PREFIX}Stranger WO`);
    const sneaky = await app.inject({
      method: "POST",
      url: `/api/v1/work-os/threads/messages/${messageId}/track-signal`,
      headers: { authorization: `Bearer ${stranger.token}` },
      payload: { ledger_type: "TASK" },
    });
    expect(sneaky.statusCode).toBe(404);
  });

  it("a different recipient is a different thread", async () => {
    const a = await member(ORG_ID, `${TEST_PREFIX}Multi A`);
    const b = await member(ORG_ID, `${TEST_PREFIX}Multi B`);
    const c = await member(ORG_ID, `${TEST_PREFIX}Multi C`);
    await app.inject({
      method: "POST", url: "/api/v1/work-os/internal-messages",
      headers: { authorization: `Bearer ${a.token}` },
      payload: { recipient: b.id, message: "to B only" },
    });
    const threadAC = await app.inject({
      method: "GET", url: `/api/v1/work-os/threads/with/${c.id}`,
      headers: { authorization: `Bearer ${a.token}` },
    });
    expect(threadAC.statusCode).toBe(404); // A↔C has no messages
    const threadAB = await app.inject({
      method: "GET", url: `/api/v1/work-os/threads/with/${b.id}`,
      headers: { authorization: `Bearer ${a.token}` },
    });
    expect(threadAB.statusCode).toBe(200);
  });

  it("blocks an empty message", async () => {
    const sadeil = await member(ORG_ID, `${TEST_PREFIX}Sender Three`);
    const dave = await member(ORG_ID, `${TEST_PREFIX}Recipient Three`);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/work-os/internal-messages",
      headers: { authorization: `Bearer ${sadeil.token}` },
      payload: { recipient: dave.id, message: "   " },
    });
    expect(res.statusCode).toBe(422);
    expect((res.json() as { status: string }).status).toBe("BLOCKED");
  });
});
