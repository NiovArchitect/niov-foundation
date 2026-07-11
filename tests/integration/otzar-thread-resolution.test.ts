// FILE: otzar-thread-resolution.test.ts (integration)
// PURPOSE: [OTZAR-CONTINUITY P5 Stage 1 wiring] Lock the authoritative thread
//          resolver — especially the no-id restoration rules that preserve the
//          shipped ambient behavior (bare "yes" finds / disambiguates its pending
//          proposals) while replacing raw actor+org recency.
// CONNECTS TO: apps/api/src/services/otzar/thread-resolution.service.ts

import { afterAll, describe, expect, it } from "vitest";
import { prisma, createThread } from "@niov/database";
import { randomUUID } from "node:crypto";
import { resolveAuthoritativeThread } from "../../apps/api/src/services/otzar/thread-resolution.service.js";
import { cleanupTestData } from "../helpers.js";

// Use the real clock so the resolver's active-window aligns with createThread's
// real last_active_at (in production now_ms is likewise the real clock).
const NOW = Date.now();
const created: string[] = [];
const orgIds: string[] = [];

function args(over: Partial<Parameters<typeof resolveAuthoritativeThread>[0]> = {}) {
  const org = over.org_entity_id ?? randomUUID();
  const subject = over.subject_entity_id ?? randomUUID();
  return {
    org_entity_id: org, subject_entity_id: subject, twin_entity_id: randomUUID(),
    timezone: "America/New_York", now_ms: NOW, ...over,
  };
}

async function seedProposal(org: string, subject: string, conversationId: string): Promise<void> {
  const row = await prisma.workLedgerEntry.create({
    data: {
      org_entity_id: org, owner_entity_id: subject, requester_entity_id: subject,
      ledger_type: "MEETING", source_type: "VOICE_COMMAND", conversation_id: conversationId,
      title: "P", summary: "P", status: "NEEDS_CALLER_CONFIRMATION", priority: "ROUTINE",
      details: { source: "otzar_calendar_proposal" },
    },
    select: { ledger_entry_id: true },
  });
  void row;
}

afterAll(async () => {
  if (created.length > 0) {
    await prisma.workLedgerEntry.deleteMany({ where: { conversation_id: { in: created } } });
    await prisma.otzarConversation.deleteMany({ where: { conversation_id: { in: created } } });
  }
  if (orgIds.length > 0) {
    await prisma.workLedgerEntry.deleteMany({ where: { org_entity_id: { in: orgIds } } });
    await prisma.otzarConversation.deleteMany({ where: { org_entity_id: { in: orgIds } } });
  }
  await cleanupTestData();
});

describe("resolveAuthoritativeThread (P5 Stage 1)", () => {
  it("supplied id that exists + matches scope → used as-is", async () => {
    const a = args();
    orgIds.push(a.org_entity_id);
    const t = await createThread({
      conversation_id: randomUUID(), org_entity_id: a.org_entity_id,
      subject_entity_id: a.subject_entity_id, twin_entity_id: a.twin_entity_id,
    });
    created.push(t.conversation_id);
    const r = await resolveAuthoritativeThread({ ...a, conversation_id: t.conversation_id });
    expect(r).toEqual({ conversation_id: t.conversation_id, origin: "supplied" });
  });

  it("supplied id owned by ANOTHER subject → never attached; a fresh own thread is minted", async () => {
    const a = args();
    orgIds.push(a.org_entity_id);
    const foreign = await createThread({
      conversation_id: randomUUID(), org_entity_id: a.org_entity_id,
      subject_entity_id: randomUUID(), twin_entity_id: randomUUID(),
    });
    created.push(foreign.conversation_id);
    const r = await resolveAuthoritativeThread({ ...a, conversation_id: foreign.conversation_id });
    expect(r.origin).toBe("created");
    expect(r.conversation_id).not.toBe(foreign.conversation_id);
    created.push(r.conversation_id);
  });

  it("supplied id that does not exist yet → created under the caller's scope", async () => {
    const a = args();
    orgIds.push(a.org_entity_id);
    const id = randomUUID();
    const r = await resolveAuthoritativeThread({ ...a, conversation_id: id });
    expect(r).toEqual({ conversation_id: id, origin: "supplied" });
    created.push(id);
  });

  it("no id + all pending obligations in ONE thread → restores that thread (even with 2 proposals)", async () => {
    const a = args();
    orgIds.push(a.org_entity_id);
    const t = await createThread({
      conversation_id: randomUUID(), org_entity_id: a.org_entity_id,
      subject_entity_id: a.subject_entity_id, twin_entity_id: a.twin_entity_id,
    });
    created.push(t.conversation_id);
    await seedProposal(a.org_entity_id, a.subject_entity_id, t.conversation_id);
    await seedProposal(a.org_entity_id, a.subject_entity_id, t.conversation_id); // 2 in same thread
    const r = await resolveAuthoritativeThread({ ...a, conversation_id: undefined });
    expect(r).toEqual({ conversation_id: t.conversation_id, origin: "restored_obligation" });
  });

  it("no id + obligations SPLIT across threads → does not guess; mints a new thread", async () => {
    const a = args();
    orgIds.push(a.org_entity_id);
    const t1 = randomUUID(), t2 = randomUUID();
    for (const id of [t1, t2]) {
      const t = await createThread({ conversation_id: id, org_entity_id: a.org_entity_id, subject_entity_id: a.subject_entity_id, twin_entity_id: a.twin_entity_id });
      created.push(t.conversation_id);
      await seedProposal(a.org_entity_id, a.subject_entity_id, id);
    }
    const r = await resolveAuthoritativeThread({ ...a, conversation_id: undefined });
    expect(r.origin).toBe("created");
    created.push(r.conversation_id);
  });

  it("no id + no obligation + exactly one recent ACTIVE thread → restores it", async () => {
    const a = args();
    orgIds.push(a.org_entity_id);
    const t = await createThread({ conversation_id: randomUUID(), org_entity_id: a.org_entity_id, subject_entity_id: a.subject_entity_id, twin_entity_id: a.twin_entity_id });
    created.push(t.conversation_id);
    const r = await resolveAuthoritativeThread({ ...a, conversation_id: undefined });
    expect(r).toEqual({ conversation_id: t.conversation_id, origin: "restored_active" });
  });

  it("no id + nothing to restore → creates a new thread", async () => {
    const a = args();
    orgIds.push(a.org_entity_id);
    const r = await resolveAuthoritativeThread({ ...a, conversation_id: undefined });
    expect(r.origin).toBe("created");
    created.push(r.conversation_id);
  });
});
