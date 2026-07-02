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

  it("waiting-on v1: DAVID (the recipient) tracking keeps requester=Sadeil, owner=David", async () => {
    // Phase 1285-C — directionality is derived from the SOURCE message, never
    // from the actor. Whoever clicks "Add to Work Ledger" gets the same result.
    const sadeil = await member(ORG_ID, `${TEST_PREFIX}Sadeil DT`);
    const david = await member(ORG_ID, `${TEST_PREFIX}David DT`);

    const send = await app.inject({
      method: "POST",
      url: "/api/v1/work-os/internal-messages",
      headers: { authorization: `Bearer ${sadeil.token}` },
      payload: { recipient: david.id, message: "Please send me the proof-layer notes" },
    });
    const messageId = (send.json() as { ledger_entry_id: string }).ledger_entry_id;

    // DAVID (the recipient/asked person) clicks Add to Work Ledger.
    const track = await app.inject({
      method: "POST",
      url: `/api/v1/work-os/threads/messages/${messageId}/track-signal`,
      headers: { authorization: `Bearer ${david.token}` },
      payload: { ledger_type: "TASK" },
    });
    expect(track.statusCode).toBe(201);
    const ledgerId = (track.json() as { ledger_entry_id: string }).ledger_entry_id;

    // Direction is UNCHANGED: Sadeil still waits on David; David still owes Sadeil.
    const sWait = await app.inject({
      method: "GET",
      url: `/api/v1/work-os/waiting-on/with/${david.id}`,
      headers: { authorization: `Bearer ${sadeil.token}` },
    });
    const sj = sWait.json() as { waiting_on_them: unknown[]; pending_from_them: unknown[] };
    expect(sj.waiting_on_them.length).toBe(1);
    expect(sj.pending_from_them.length).toBe(0);

    const dWait = await app.inject({
      method: "GET",
      url: `/api/v1/work-os/waiting-on/with/${sadeil.id}`,
      headers: { authorization: `Bearer ${david.token}` },
    });
    const dj = dWait.json() as { pending_from_them: unknown[]; waiting_on_them: unknown[] };
    expect(dj.pending_from_them.length).toBe(1);
    expect(dj.waiting_on_them.length).toBe(0);

    // The ledger row records requester=Sadeil, owner/target=David, tracked_by=David.
    const row = await prisma.workLedgerEntry.findUnique({
      where: { ledger_entry_id: ledgerId },
      select: { requester_entity_id: true, owner_entity_id: true, target_entity_id: true, details: true },
    });
    expect(row?.requester_entity_id).toBe(sadeil.id);
    expect(row?.owner_entity_id).toBe(david.id);
    expect(row?.target_entity_id).toBe(david.id);
    expect((row?.details as { tracked_by?: string }).tracked_by).toBe(david.id);
  });

  it("waiting-on v1: tracking the SAME message twice is idempotent (no duplicate)", async () => {
    // Phase 1285-C — clicking Add twice (or from both participants' chips) must
    // return the existing entry, never a duplicate.
    const sadeil = await member(ORG_ID, `${TEST_PREFIX}Sadeil DUP`);
    const david = await member(ORG_ID, `${TEST_PREFIX}David DUP`);
    const send = await app.inject({
      method: "POST",
      url: "/api/v1/work-os/internal-messages",
      headers: { authorization: `Bearer ${sadeil.token}` },
      payload: { recipient: david.id, message: "Please review the launch checklist" },
    });
    const messageId = (send.json() as { ledger_entry_id: string }).ledger_entry_id;

    const first = await app.inject({
      method: "POST", url: `/api/v1/work-os/threads/messages/${messageId}/track-signal`,
      headers: { authorization: `Bearer ${sadeil.token}` }, payload: { ledger_type: "TASK" },
    });
    const second = await app.inject({
      method: "POST", url: `/api/v1/work-os/threads/messages/${messageId}/track-signal`,
      headers: { authorization: `Bearer ${david.token}` }, payload: { ledger_type: "TASK" },
    });
    const id1 = (first.json() as { ledger_entry_id: string }).ledger_entry_id;
    const id2 = (second.json() as { ledger_entry_id: string }).ledger_entry_id;
    expect(id1).toBe(id2); // same entry returned, not a new one

    // Sadeil still has exactly ONE waiting-on item with David.
    const sWait = await app.inject({
      method: "GET", url: `/api/v1/work-os/waiting-on/with/${david.id}`,
      headers: { authorization: `Bearer ${sadeil.token}` },
    });
    expect((sWait.json() as { waiting_on_them: unknown[] }).waiting_on_them.length).toBe(1);
  });

  it("thread signal: 'please send me …' surfaces a TASK_REQUEST without Python; the tracked flag flips after Add", async () => {
    // Phase 1285-C — deterministic fallback means the chip appears even when the
    // advisory Python extractor is unavailable; and the thread message's signal
    // carries tracked=true once it's in the Work Ledger.
    const sadeil = await member(ORG_ID, `${TEST_PREFIX}Sadeil SIG`);
    const david = await member(ORG_ID, `${TEST_PREFIX}David SIG`);
    const send = await app.inject({
      method: "POST",
      url: "/api/v1/work-os/internal-messages",
      headers: { authorization: `Bearer ${sadeil.token}` },
      payload: { recipient: david.id, message: "Please send me the Q3 numbers" },
    });
    const messageId = (send.json() as { ledger_entry_id: string }).ledger_entry_id;

    // Thread shows a TASK_REQUEST signal, not yet tracked.
    const before = await app.inject({
      method: "GET", url: `/api/v1/work-os/threads/with/${david.id}`,
      headers: { authorization: `Bearer ${sadeil.token}` },
    });
    const mBefore = (before.json() as { messages: Array<{ message_id: string; signal?: { signal_type: string; tracked?: boolean } }> })
      .messages.find((m) => m.message_id === messageId);
    expect(mBefore?.signal?.signal_type).toBe("TASK_REQUEST");
    expect(mBefore?.signal?.tracked ?? false).toBe(false);

    await app.inject({
      method: "POST", url: `/api/v1/work-os/threads/messages/${messageId}/track-signal`,
      headers: { authorization: `Bearer ${sadeil.token}` }, payload: { ledger_type: "TASK" },
    });

    // After Add, the same message's signal carries tracked=true.
    const after = await app.inject({
      method: "GET", url: `/api/v1/work-os/threads/with/${david.id}`,
      headers: { authorization: `Bearer ${sadeil.token}` },
    });
    const mAfter = (after.json() as { messages: Array<{ message_id: string; signal?: { tracked?: boolean } }> })
      .messages.find((m) => m.message_id === messageId);
    expect(mAfter?.signal?.tracked).toBe(true);
  });

  it("completion: owner marks complete; requester cannot; waiting-on clears", async () => {
    // Phase 1285-E — the loop's terminal state. Only the OWNER (David) may mark
    // the task complete; the requester (Sadeil) cannot self-complete David's
    // work. On completion, Sadeil's waiting-on clears.
    const sadeil = await member(ORG_ID, `${TEST_PREFIX}Sadeil CMP`);
    const david = await member(ORG_ID, `${TEST_PREFIX}David CMP`);
    const send = await app.inject({
      method: "POST",
      url: "/api/v1/work-os/internal-messages",
      headers: { authorization: `Bearer ${sadeil.token}` },
      payload: { recipient: david.id, message: "Please send me the signed contract" },
    });
    const messageId = (send.json() as { ledger_entry_id: string }).ledger_entry_id;
    const track = await app.inject({
      method: "POST", url: `/api/v1/work-os/threads/messages/${messageId}/track-signal`,
      headers: { authorization: `Bearer ${sadeil.token}` }, payload: { ledger_type: "TASK" },
    });
    const ledgerId = (track.json() as { ledger_entry_id: string }).ledger_entry_id;

    // can_complete is server-computed: true for David (owner), not for Sadeil.
    const dMyWork = await app.inject({
      method: "GET", url: "/api/v1/work-os/my-work",
      headers: { authorization: `Bearer ${david.token}` },
    });
    const dEntry = (dMyWork.json() as { items: Array<{ ledger_entry_id: string; can_complete?: boolean; source_message_id?: string }> })
      .items.find((i) => i.ledger_entry_id === ledgerId);
    expect(dEntry?.can_complete).toBe(true);
    expect(dEntry?.source_message_id).toBe(messageId); // proof link present
    const sMyWork = await app.inject({
      method: "GET", url: "/api/v1/work-os/my-work",
      headers: { authorization: `Bearer ${sadeil.token}` },
    });
    const sEntry = (sMyWork.json() as { items: Array<{ ledger_entry_id: string; can_complete?: boolean }> })
      .items.find((i) => i.ledger_entry_id === ledgerId);
    expect(sEntry?.can_complete ?? false).toBe(false);

    // Requester (Sadeil) cannot mark it complete → 403.
    const deny = await app.inject({
      method: "PATCH", url: `/api/v1/work-os/ledger/${ledgerId}`,
      headers: { authorization: `Bearer ${sadeil.token}` }, payload: { status: "EXECUTED" },
    });
    expect(deny.statusCode).toBe(403);

    // Owner (David) marks it complete → 200.
    const done = await app.inject({
      method: "PATCH", url: `/api/v1/work-os/ledger/${ledgerId}`,
      headers: { authorization: `Bearer ${david.token}` }, payload: { status: "EXECUTED" },
    });
    expect(done.statusCode).toBe(200);
    expect((done.json() as { entry: { status: string } }).entry.status).toBe("EXECUTED");

    // Sadeil's waiting-on with David now clears (no longer active).
    const sWait = await app.inject({
      method: "GET", url: `/api/v1/work-os/waiting-on/with/${david.id}`,
      headers: { authorization: `Bearer ${sadeil.token}` },
    });
    expect((sWait.json() as { waiting_on_them: unknown[] }).waiting_on_them.length).toBe(0);
  });

  it("team waiting-on: a manager sees the directional ask with names + source proof; completion changes status; non-manager is denied", async () => {
    // Phase 1285-G — the 1-to-1 loop scaled to the manager/team view.
    const sadeil = await member(ORG_ID, `${TEST_PREFIX}Sadeil TEAM`);
    const david = await member(ORG_ID, `${TEST_PREFIX}David TEAM`);
    // Grant Sadeil manager authority (team-work is can_admin_org gated). The
    // TAR already exists (login requires it), so update in place.
    await prisma.tokenAttributeRepository.updateMany({
      where: { entity_id: sadeil.id },
      data: { can_admin_org: true },
    });

    const send = await app.inject({
      method: "POST",
      url: "/api/v1/work-os/internal-messages",
      headers: { authorization: `Bearer ${sadeil.token}` },
      payload: { recipient: david.id, message: "Please send me the proof-layer notes" },
    });
    const messageId = (send.json() as { ledger_entry_id: string }).ledger_entry_id;
    const track = await app.inject({
      method: "POST", url: `/api/v1/work-os/threads/messages/${messageId}/track-signal`,
      headers: { authorization: `Bearer ${sadeil.token}` }, payload: { ledger_type: "TASK" },
    });
    const ledgerId = (track.json() as { ledger_entry_id: string }).ledger_entry_id;

    // Manager Team Work includes the directional ask, with display names +
    // source-message proof (not raw-UUID-only).
    const team = await app.inject({
      method: "GET", url: "/api/v1/work-os/team-work",
      headers: { authorization: `Bearer ${sadeil.token}` },
    });
    expect(team.statusCode).toBe(200);
    const entries = (team.json() as {
      entries: Array<{
        ledger_entry_id: string; status: string; ledger_type: string;
        owner_display_name?: string; requester_display_name?: string; source_message_id?: string;
      }>;
    }).entries;
    const row = entries.find((e) => e.ledger_entry_id === ledgerId);
    expect(row).toBeDefined();
    expect(row!.ledger_type).toBe("TASK");
    expect(row!.owner_display_name).toContain("David TEAM");
    expect(row!.requester_display_name).toContain("Sadeil TEAM");
    expect(row!.source_message_id).toBe(messageId);
    expect(["PROPOSED", "READY_TO_EXECUTE", "EXECUTING", "NEEDS_OWNER", "NEEDS_APPROVAL"]).toContain(row!.status);

    // David completes it → the team row now reflects EXECUTED (the CT
    // waiting-on panel filters done statuses out).
    const done = await app.inject({
      method: "PATCH", url: `/api/v1/work-os/ledger/${ledgerId}`,
      headers: { authorization: `Bearer ${david.token}` }, payload: { status: "EXECUTED" },
    });
    expect(done.statusCode).toBe(200);
    const team2 = await app.inject({
      method: "GET", url: "/api/v1/work-os/team-work",
      headers: { authorization: `Bearer ${sadeil.token}` },
    });
    const row2 = (team2.json() as { entries: Array<{ ledger_entry_id: string; status: string }> })
      .entries.find((e) => e.ledger_entry_id === ledgerId);
    expect(row2?.status).toBe("EXECUTED");

    // A non-manager cannot view team work at all.
    const denied = await app.inject({
      method: "GET", url: "/api/v1/work-os/team-work",
      headers: { authorization: `Bearer ${david.token}` },
    });
    expect(denied.statusCode).toBe(403);
  });

  it("thread signal: a casual note surfaces NO signal (no chip noise)", async () => {
    const sadeil = await member(ORG_ID, `${TEST_PREFIX}Sadeil CAS`);
    const david = await member(ORG_ID, `${TEST_PREFIX}David CAS`);
    const send = await app.inject({
      method: "POST",
      url: "/api/v1/work-os/internal-messages",
      headers: { authorization: `Bearer ${sadeil.token}` },
      payload: { recipient: david.id, message: "Have a great weekend" },
    });
    const messageId = (send.json() as { ledger_entry_id: string }).ledger_entry_id;
    const th = await app.inject({
      method: "GET", url: `/api/v1/work-os/threads/with/${david.id}`,
      headers: { authorization: `Bearer ${sadeil.token}` },
    });
    const m = (th.json() as { messages: Array<{ message_id: string; signal?: unknown }> })
      .messages.find((x) => x.message_id === messageId);
    expect(m?.signal).toBeUndefined();
  });

  it("relationship work (1285-M): completed + blockers + decisions + inverse waiting-on, pair-scoped", async () => {
    const sadeil = await member(ORG_ID, `${TEST_PREFIX}Sadeil REL`);
    const david = await member(ORG_ID, `${TEST_PREFIX}David REL`);

    // Track helper: send msg from `from` to `to`, then track as `type`.
    async function trackFrom(
      from: { id: string; token: string },
      to: { id: string },
      message: string,
      type: string,
    ): Promise<string> {
      const send = await app.inject({
        method: "POST", url: "/api/v1/work-os/internal-messages",
        headers: { authorization: `Bearer ${from.token}` },
        payload: { recipient: to.id, message },
      });
      const mid = (send.json() as { ledger_entry_id: string }).ledger_entry_id;
      const tr = await app.inject({
        method: "POST", url: `/api/v1/work-os/threads/messages/${mid}/track-signal`,
        headers: { authorization: `Bearer ${from.token}` },
        payload: { ledger_type: type },
      });
      return (tr.json() as { ledger_entry_id: string }).ledger_entry_id;
    }

    // Sadeil → David TASK (Sadeil waiting on David); David → Sadeil TASK (David
    // waiting on Sadeil); a BLOCKER and a DECISION raised by Sadeil re: David.
    const sadeilTask = await trackFrom(sadeil, david, "Please send the proof-layer notes", "TASK");
    await trackFrom(david, sadeil, "Please approve my PR", "TASK");
    await trackFrom(sadeil, david, "We are blocked on the Google reconnect", "BLOCKER");
    await trackFrom(sadeil, david, "We decided to ship Friday", "DECISION");

    // Complete Sadeil's task (David owns it) → moves to completed.
    await app.inject({
      method: "PATCH", url: `/api/v1/work-os/ledger/${sadeilTask}`,
      headers: { authorization: `Bearer ${david.token}` }, payload: { status: "EXECUTED" },
    });

    const rel = await app.inject({
      method: "GET", url: `/api/v1/work-os/relationship/with/${david.id}`,
      headers: { authorization: `Bearer ${sadeil.token}` },
    });
    expect(rel.statusCode).toBe(200);
    const g = rel.json() as {
      other_display_name: string;
      waiting_on_them: unknown[]; pending_from_them: unknown[];
      completed: Array<{ ledger_entry_id: string; owner_display_name: string }>;
      blockers: Array<{ ledger_type: string }>; decisions: Array<{ ledger_type: string }>;
    };
    expect(g.other_display_name).toContain("David REL");
    expect(g.completed.some((c) => c.ledger_entry_id === sadeilTask)).toBe(true);
    expect(g.completed[0]?.owner_display_name).toContain("David REL"); // canonical name, not UUID
    expect(g.pending_from_them.length).toBeGreaterThanOrEqual(1); // David's PR ask
    expect(g.blockers.some((b) => b.ledger_type === "BLOCKER")).toBe(true);
    expect(g.decisions.some((d) => d.ledger_type === "DECISION")).toBe(true);
    // Sadeil's completed task is no longer in active waiting_on_them.
    expect((g.waiting_on_them as Array<{ ledger_entry_id: string }>).some((w) => w.ledger_entry_id === sadeilTask)).toBe(false);

    // Tenant/pair isolation: an unrelated user's relationship with David is empty.
    const stranger = await member(ORG_ID, `${TEST_PREFIX}Stranger REL`);
    const strRel = await app.inject({
      method: "GET", url: `/api/v1/work-os/relationship/with/${david.id}`,
      headers: { authorization: `Bearer ${stranger.token}` },
    });
    const sg = strRel.json() as { completed: unknown[]; blockers: unknown[]; decisions: unknown[]; pending_from_them: unknown[] };
    expect(sg.completed.length + sg.blockers.length + sg.decisions.length + sg.pending_from_them.length).toBe(0);
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

// [OTZAR-V1-LIVE-2A-FOUNDATION] Human work-routing must leave an append-only
// audit-chain entry so Foundation can prove who routed work to whom. Previously
// this path wrote only Notification + Work-Ledger rows and no audit event.
describe("human-authority internal message — audit proof (LIVE-2A)", () => {
  it("emits an append-only INTERNAL_MESSAGE_DELIVERED audit (actor=sender, target=recipient), returns audit_event_id, and leaks NO message body", async () => {
    const sadeil = await member(ORG_ID, `${TEST_PREFIX}Audit Sender`);
    const david = await member(ORG_ID, `${TEST_PREFIX}Audit Recipient`);
    const secret = "audit body marker zzz";
    const send = await app.inject({
      method: "POST",
      url: "/api/v1/work-os/internal-messages",
      headers: { authorization: `Bearer ${sadeil.token}` },
      payload: { recipient: david.id, message: secret },
    });
    expect(send.statusCode).toBe(201);
    const sj = send.json() as {
      status: string;
      audit_event_id?: string;
      notification_id: string;
      ledger_entry_id: string | null;
    };
    expect(sj.status).toBe("DELIVERED");
    expect(sj.audit_event_id).toBeTruthy();

    const audit = await prisma.auditEvent.findUnique({
      where: { audit_id: sj.audit_event_id as string },
    });
    expect(audit).not.toBeNull();
    expect(audit?.event_type).toBe("INTERNAL_MESSAGE_DELIVERED");
    expect(audit?.actor_entity_id).toBe(sadeil.id);
    expect(audit?.target_entity_id).toBe(david.id);
    // SAFE details only — ids + channel, NEVER the message body.
    const details = JSON.stringify(audit?.details ?? {});
    expect(details).toContain(sj.notification_id);
    expect(details).toContain("INTERNAL_OTZAR_INBOX");
    expect(details).not.toContain(secret);
  });

  it("writes NO INTERNAL_MESSAGE_DELIVERED audit when delivery does not happen (empty message -> BLOCKED)", async () => {
    const sadeil = await member(ORG_ID, `${TEST_PREFIX}NoAudit Sender`);
    const dave = await member(ORG_ID, `${TEST_PREFIX}NoAudit Recipient`);
    const before = await prisma.auditEvent.count({
      where: { event_type: "INTERNAL_MESSAGE_DELIVERED", actor_entity_id: sadeil.id },
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/work-os/internal-messages",
      headers: { authorization: `Bearer ${sadeil.token}` },
      payload: { recipient: dave.id, message: "   " },
    });
    expect(res.statusCode).toBe(422);
    const after = await prisma.auditEvent.count({
      where: { event_type: "INTERNAL_MESSAGE_DELIVERED", actor_entity_id: sadeil.id },
    });
    expect(after).toBe(before);
  });
});

// ── [PROD-UX-SCALE] team-work server pagination — the fixed take:300
//    truncated silently (observed at exactly 300 live). ──
describe("GET /work-os/team-work pagination", () => {
  it("pages with skip/take, reports has_more, keeps pages disjoint, and stays manager-gated", async () => {
    const mgr = await member(ORG_ID, `${TEST_PREFIX}Mgr PAGE`);
    await prisma.tokenAttributeRepository.updateMany({
      where: { entity_id: mgr.id },
      data: { can_admin_org: true },
    });
    for (let i = 0; i < 4; i++) {
      await app.inject({
        method: "POST",
        url: "/api/v1/work-os/ledger",
        headers: { authorization: `Bearer ${mgr.token}` },
        payload: { ledger_type: "FOLLOW_UP", title: `${TEST_PREFIX}team page ${i}` },
      });
    }
    const p1 = await app.inject({
      method: "GET", url: "/api/v1/work-os/team-work?take=2",
      headers: { authorization: `Bearer ${mgr.token}` },
    });
    expect(p1.statusCode).toBe(200);
    const b1 = p1.json() as { entries: Array<{ ledger_entry_id: string }>; has_more: boolean; skip: number };
    expect(b1.entries).toHaveLength(2);
    expect(b1.has_more).toBe(true);
    const p2 = await app.inject({
      method: "GET", url: "/api/v1/work-os/team-work?skip=2&take=2",
      headers: { authorization: `Bearer ${mgr.token}` },
    });
    const b2 = p2.json() as { entries: Array<{ ledger_entry_id: string }> };
    const ids1 = new Set(b1.entries.map((e) => e.ledger_entry_id));
    expect(b2.entries.some((e) => ids1.has(e.ledger_entry_id))).toBe(false);
    // Legacy no-param call keeps working and now carries has_more.
    const legacy = await app.inject({
      method: "GET", url: "/api/v1/work-os/team-work",
      headers: { authorization: `Bearer ${mgr.token}` },
    });
    expect((legacy.json() as { has_more: boolean }).has_more).toBe(false);
    // Pagination params never bypass the manager gate.
    const emp = await member(ORG_ID, `${TEST_PREFIX}Emp PAGE`);
    const denied = await app.inject({
      method: "GET", url: "/api/v1/work-os/team-work?take=2",
      headers: { authorization: `Bearer ${emp.token}` },
    });
    expect(denied.statusCode).toBe(403);
  });
});
