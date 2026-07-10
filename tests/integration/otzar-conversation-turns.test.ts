// FILE: otzar-conversation-turns.test.ts (integration)
// PURPOSE: [OTZAR-CONTINUITY P5A] Real-DB proof of the durable conversation-turn
//          transcript: idempotent append (request_id dedupe), monotonic
//          per-thread sequence that is race-safe under concurrency, ordered
//          listing, org isolation, content cap, and latest-turn lookup.
// CONNECTS TO: packages/database/src/queries/otzar-conversation-turns.ts

import { afterAll, describe, expect, it } from "vitest";
import {
  prisma,
  appendConversationTurn,
  listConversationTurns,
  latestConversationTurn,
  MAX_TURN_CONTENT_CHARS,
} from "@niov/database";
import { randomUUID } from "node:crypto";
import { cleanupTestData } from "../helpers.js";

const threads: string[] = [];
function newThread(): string { const id = randomUUID(); threads.push(id); return id; }
const ACTOR = randomUUID();
const ORG = randomUUID();

afterAll(async () => {
  if (threads.length > 0) {
    await prisma.otzarConversationTurn.deleteMany({ where: { conversation_id: { in: threads } } });
  }
  await cleanupTestData();
});

describe("OtzarConversationTurn durable transcript (P5A)", () => {
  it("appends user+assistant turns with a monotonic 1..N sequence and preserves content", async () => {
    const conv = newThread();
    const u = await appendConversationTurn({ conversation_id: conv, org_entity_id: ORG, actor_entity_id: ACTOR, role: "USER", content: "put Olivia's event at 1pm" });
    const a = await appendConversationTurn({ conversation_id: conv, org_entity_id: ORG, actor_entity_id: ACTOR, role: "ASSISTANT", content: "I'll add \"Olivia's Event\" — confirm?" });
    expect(u.sequence).toBe(1);
    expect(a.sequence).toBe(2);
    expect(u.deduped).toBe(false);
    const turns = await listConversationTurns(conv);
    expect(turns.map((t) => t.role)).toEqual(["USER", "ASSISTANT"]);
    expect(turns[0]!.content).toMatch(/Olivia/);
  });

  it("is idempotent on request_id — a retried request returns the SAME turn, no duplicate", async () => {
    const conv = newThread();
    const rid = randomUUID();
    const first = await appendConversationTurn({ conversation_id: conv, actor_entity_id: ACTOR, role: "USER", content: "yes", request_id: rid });
    const retry = await appendConversationTurn({ conversation_id: conv, actor_entity_id: ACTOR, role: "USER", content: "yes", request_id: rid });
    expect(retry.deduped).toBe(true);
    expect(retry.turn_id).toBe(first.turn_id);
    expect(retry.sequence).toBe(first.sequence);
    const turns = await listConversationTurns(conv);
    expect(turns).toHaveLength(1); // exactly one stored despite two calls
  });

  it("keeps the sequence race-safe: 10 concurrent appends yield unique sequences 1..10 (no collisions, no gaps)", async () => {
    const conv = newThread();
    const N = 10;
    const results = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        appendConversationTurn({ conversation_id: conv, actor_entity_id: ACTOR, role: "USER", content: `turn ${i}` }),
      ),
    );
    const seqs = results.map((r) => r.sequence).sort((a, b) => a - b);
    expect(seqs).toEqual(Array.from({ length: N }, (_, i) => i + 1));
    const stored = await listConversationTurns(conv);
    expect(stored).toHaveLength(N);
    expect(new Set(stored.map((t) => t.sequence)).size).toBe(N);
  });

  it("isolates by org — a cross-org read returns nothing; same-org returns the turns", async () => {
    const conv = newThread();
    await appendConversationTurn({ conversation_id: conv, org_entity_id: ORG, actor_entity_id: ACTOR, role: "USER", content: "org-scoped" });
    const sameOrg = await listConversationTurns(conv, { org_entity_id: ORG });
    const otherOrg = await listConversationTurns(conv, { org_entity_id: randomUUID() });
    expect(sameOrg).toHaveLength(1);
    expect(otherOrg).toHaveLength(0);
  });

  it("caps stored content length as a warehouse backstop", async () => {
    const conv = newThread();
    const huge = "x".repeat(MAX_TURN_CONTENT_CHARS + 5000);
    const r = await appendConversationTurn({ conversation_id: conv, actor_entity_id: ACTOR, role: "USER", content: huge });
    const row = await prisma.otzarConversationTurn.findUnique({ where: { turn_id: r.turn_id } });
    expect(row!.content.length).toBe(MAX_TURN_CONTENT_CHARS);
  });

  it("returns the most recent turn via latestConversationTurn and the recent window via limit", async () => {
    const conv = newThread();
    for (let i = 1; i <= 5; i++) {
      await appendConversationTurn({ conversation_id: conv, actor_entity_id: ACTOR, role: "USER", content: `m${i}` });
    }
    const latest = await latestConversationTurn(conv);
    expect(latest!.content).toBe("m5");
    const recent = await listConversationTurns(conv, { limit: 2 });
    expect(recent.map((t) => t.content)).toEqual(["m4", "m5"]); // ascending, last 2
  });
});
