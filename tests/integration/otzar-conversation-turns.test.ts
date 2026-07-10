// FILE: otzar-conversation-turns.test.ts (integration)
// PURPOSE: [OTZAR-CONTINUITY P5 Stage 1] Real-DB proof of the corrected durable
//          transcript + thread lifecycle: identity separation (subject vs author),
//          ownership-gated append/read (cross-org/cross-subject/deleted), atomic
//          collision-free sequence, request_id idempotency incl. different-content
//          conflict, content cap, and lifecycle transitions (archive/reopen/close/
//          delete-redaction).
// CONNECTS TO: packages/database/src/queries/otzar-threads.ts,
//              packages/database/src/queries/otzar-conversation-turns.ts

import { afterAll, describe, expect, it } from "vitest";
import {
  prisma,
  createThread,
  archiveThread,
  reopenThread,
  closeThread,
  markThreadDeleted,
  appendConversationTurn,
  listConversationTurns,
  latestConversationTurn,
  ThreadScopeError,
  IdempotencyConflictError,
  MAX_TURN_CONTENT_CHARS,
} from "@niov/database";
import { randomUUID } from "node:crypto";
import { cleanupTestData } from "../helpers.js";

const threadIds: string[] = [];
const ORG = randomUUID();
const SUBJECT = randomUUID();
const TWIN = randomUUID();

async function freshThread(over: Partial<{ org: string; subject: string; twin: string }> = {}): Promise<string> {
  const t = await createThread({
    org_entity_id: over.org ?? ORG,
    subject_entity_id: over.subject ?? SUBJECT,
    twin_entity_id: over.twin ?? TWIN,
    timezone: "America/New_York",
  });
  threadIds.push(t.conversation_id);
  return t.conversation_id;
}
const scope = { org_entity_id: ORG, subject_entity_id: SUBJECT, twin_entity_id: TWIN };

afterAll(async () => {
  if (threadIds.length > 0) {
    await prisma.otzarConversationTurn.deleteMany({ where: { conversation_id: { in: threadIds } } });
    await prisma.otzarConversation.deleteMany({ where: { conversation_id: { in: threadIds } } });
  }
  await cleanupTestData();
});

describe("OtzarConversationTurn — corrected model (P5 Stage 1)", () => {
  it("separates subject (owner) from author; appends monotonic 1..N", async () => {
    const conv = await freshThread();
    const u = await appendConversationTurn({
      conversation_id: conv, org_entity_id: ORG, subject_entity_id: SUBJECT,
      author_entity_id: SUBJECT, twin_entity_id: TWIN, role: "USER", content: "put Olivia's event at 1pm",
    });
    const a = await appendConversationTurn({
      conversation_id: conv, org_entity_id: ORG, subject_entity_id: SUBJECT,
      author_entity_id: TWIN, twin_entity_id: TWIN, role: "ASSISTANT", content: "I'll add it — confirm?",
      reply_to_turn_id: u.turn_id,
    });
    expect(u.sequence).toBe(1);
    expect(a.sequence).toBe(2);
    const turns = await listConversationTurns(conv, scope);
    expect(turns.map((t) => t.role)).toEqual(["USER", "ASSISTANT"]);
    expect(turns[0]!.author_entity_id).toBe(SUBJECT); // user authored
    expect(turns[1]!.author_entity_id).toBe(TWIN); // twin authored
    expect(turns[0]!.org_entity_id).toBe(ORG);
  });

  it("is idempotent on request_id — same content dedupes; DIFFERENT content conflicts", async () => {
    const conv = await freshThread();
    const rid = randomUUID();
    const first = await appendConversationTurn({
      conversation_id: conv, org_entity_id: ORG, subject_entity_id: SUBJECT, author_entity_id: SUBJECT,
      role: "USER", content: "yes", request_id: rid,
    });
    const retry = await appendConversationTurn({
      conversation_id: conv, org_entity_id: ORG, subject_entity_id: SUBJECT, author_entity_id: SUBJECT,
      role: "USER", content: "yes", request_id: rid,
    });
    expect(retry.deduped).toBe(true);
    expect(retry.turn_id).toBe(first.turn_id);
    await expect(
      appendConversationTurn({
        conversation_id: conv, org_entity_id: ORG, subject_entity_id: SUBJECT, author_entity_id: SUBJECT,
        role: "USER", content: "NO — different content", request_id: rid,
      }),
    ).rejects.toBeInstanceOf(IdempotencyConflictError);
    expect(await listConversationTurns(conv, scope)).toHaveLength(1);
  });

  it("atomic sequence is collision-free under 10 concurrent appends (unique 1..10, no gaps)", async () => {
    const conv = await freshThread();
    const N = 10;
    const results = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        appendConversationTurn({
          conversation_id: conv, org_entity_id: ORG, subject_entity_id: SUBJECT, author_entity_id: SUBJECT,
          role: "USER", content: `turn ${i}`,
        }),
      ),
    );
    const seqs = results.map((r) => r.sequence).sort((a, b) => a - b);
    expect(seqs).toEqual(Array.from({ length: N }, (_, i) => i + 1));
    expect(await listConversationTurns(conv, scope)).toHaveLength(N);
  });

  it("ENFORCES ownership: append/list reject cross-org, cross-subject, deleted, and unknown threads", async () => {
    const conv = await freshThread();
    // cross-org
    await expect(
      appendConversationTurn({
        conversation_id: conv, org_entity_id: randomUUID(), subject_entity_id: SUBJECT, author_entity_id: SUBJECT,
        role: "USER", content: "x",
      }),
    ).rejects.toBeInstanceOf(ThreadScopeError);
    // cross-subject
    await expect(
      appendConversationTurn({
        conversation_id: conv, org_entity_id: ORG, subject_entity_id: randomUUID(), author_entity_id: SUBJECT,
        role: "USER", content: "x",
      }),
    ).rejects.toBeInstanceOf(ThreadScopeError);
    // unknown thread (no row → not appendable by arbitrary UUID)
    await expect(
      appendConversationTurn({
        conversation_id: randomUUID(), org_entity_id: ORG, subject_entity_id: SUBJECT, author_entity_id: SUBJECT,
        role: "USER", content: "x",
      }),
    ).rejects.toBeInstanceOf(ThreadScopeError);
    // cross-org read
    await expect(
      listConversationTurns(conv, { org_entity_id: randomUUID(), subject_entity_id: SUBJECT }),
    ).rejects.toBeInstanceOf(ThreadScopeError);
  });

  it("lifecycle: archive → reopen → close; delete redacts turn content and blocks append", async () => {
    const conv = await freshThread();
    await appendConversationTurn({
      conversation_id: conv, org_entity_id: ORG, subject_entity_id: SUBJECT, author_entity_id: SUBJECT,
      role: "USER", content: "secret content", twin_entity_id: TWIN,
    });
    await archiveThread(conv, scope);
    expect((await prisma.otzarConversation.findUnique({ where: { conversation_id: conv } }))!.status).toBe("ARCHIVED");
    await reopenThread(conv, scope);
    await closeThread(conv, scope);
    expect((await prisma.otzarConversation.findUnique({ where: { conversation_id: conv } }))!.status).toBe("CLOSED");

    await markThreadDeleted(conv, scope);
    const t = await prisma.otzarConversation.findUnique({ where: { conversation_id: conv } });
    expect(t!.status).toBe("DELETED");
    expect(t!.deleted_at).not.toBeNull();
    // Turn content redacted (tombstone), row kept for lineage.
    const turn = await prisma.otzarConversationTurn.findFirst({ where: { conversation_id: conv } });
    expect(turn!.content).toBe("");
    // A deleted thread rejects further appends.
    await expect(
      appendConversationTurn({
        conversation_id: conv, org_entity_id: ORG, subject_entity_id: SUBJECT, author_entity_id: SUBJECT,
        role: "USER", content: "after delete",
      }),
    ).rejects.toBeInstanceOf(ThreadScopeError);
  });

  it("caps stored content; returns latest", async () => {
    const conv = await freshThread();
    const r = await appendConversationTurn({
      conversation_id: conv, org_entity_id: ORG, subject_entity_id: SUBJECT, author_entity_id: SUBJECT,
      role: "USER", content: "x".repeat(MAX_TURN_CONTENT_CHARS + 3000),
    });
    const row = await prisma.otzarConversationTurn.findUnique({ where: { turn_id: r.turn_id } });
    expect(row!.content.length).toBe(MAX_TURN_CONTENT_CHARS);
    await appendConversationTurn({
      conversation_id: conv, org_entity_id: ORG, subject_entity_id: SUBJECT, author_entity_id: TWIN,
      twin_entity_id: TWIN, role: "ASSISTANT", content: "latest one",
    });
    const latest = await latestConversationTurn(conv, scope);
    expect(latest!.content).toBe("latest one");
  });
});
