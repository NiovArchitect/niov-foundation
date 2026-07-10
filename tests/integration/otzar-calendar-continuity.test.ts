// FILE: otzar-calendar-continuity.test.ts (integration)
// PURPOSE: [OTZAR-CONTINUITY P0/P1/P2/P3] Real-DB proof that the reported failure
//          is fixed: "put Olivia's event on my calendar at one o'clock" → propose
//          (server-resolved date, NOT January 2025) → "yes" (fresh turn, no
//          history, no LLM) → the caller's single pending proposal is resolved
//          deterministically and executed through the gated, idempotency-claimed
//          calendar write. Covers: temporal correctness, persistence, deterministic
//          LLM-free confirmation, honest provider state, CREATED via injected
//          provider, idempotency (no duplicate), cross-user isolation, reject.
// CONNECTS TO: apps/api/src/services/otzar/calendar-continuity.service.ts

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createEntity, prisma } from "@niov/database";
import { makeContentEncryption } from "@niov/auth";
import {
  handleCalendarContinuity,
  resolveTemporalContext,
  detectCalendarProposal,
  type TemporalContext,
} from "../../apps/api/src/services/otzar/calendar-continuity.service.js";
import { cleanupTestData, ensureAuditTriggers, makeEntityInput } from "../helpers.js";

// 2026-07-10 15:00:00 UTC = 11:00 EDT (America/New_York). "at one o'clock" → 1 PM
// EDT today (in the future), so the proposal resolves to TODAY 13:00 EDT.
const FIXED_NOW = Date.UTC(2026, 6, 10, 15, 0, 0);
const TZ = "America/New_York";
const createdOrgIds: string[] = [];

async function makeOrgAndUser(): Promise<{ orgId: string; userId: string }> {
  const org = await createEntity(makeEntityInput({ entity_type: "COMPANY" }));
  const user = await createEntity(makeEntityInput({ entity_type: "PERSON" }));
  await prisma.entityMembership.create({
    data: { parent_id: org.entity_id, child_id: user.entity_id, is_active: true },
  });
  createdOrgIds.push(org.entity_id);
  return { orgId: org.entity_id, userId: user.entity_id };
}

async function temporalFor(userId: string): Promise<TemporalContext> {
  return resolveTemporalContext({ actor_entity_id: userId, client_timezone: TZ, now_ms: FIXED_NOW });
}

// Seed a WRITE-capable Google connection so createCalendarEvent reaches the
// provider insert (which we stub) — the "injected calendar provider".
async function connectGoogleWithWrite(orgId: string): Promise<void> {
  const enc = makeContentEncryption();
  // Token freshness uses the REAL clock (Date.now()) inside the service — seal a
  // real-future expiry so no refresh fetch is triggered; only the proposal DATE
  // uses FIXED_NOW (via the injected temporal context).
  const sealed = enc.encrypt(JSON.stringify({ access_token: "test-access-token", expires_at: Date.now() + 24 * 3600_000 }));
  await prisma.integrationCredential.upsert({
    where: { org_entity_id_tool: { org_entity_id: orgId, tool: "OAUTH_GOOGLE_WORKSPACE" } },
    create: {
      org_entity_id: orgId,
      tool: "OAUTH_GOOGLE_WORKSPACE",
      webhook_secret: sealed,
      enabled: true,
      config: {
        oauth_provider: "GOOGLE_WORKSPACE",
        status: "VERIFIED",
        scopes: ["https://www.googleapis.com/auth/calendar.events"],
        account_label: null,
        connected_at: new Date(FIXED_NOW).toISOString(),
        last_verified_at: new Date(FIXED_NOW).toISOString(),
      },
    },
    update: {},
  });
}

const OLIVIA = "Put on my calendar that at one o'clock I'll be at Olivia's event.";

beforeAll(async () => {
  await ensureAuditTriggers();
});
afterEach(() => {
  vi.unstubAllGlobals();
});
afterAll(async () => {
  if (createdOrgIds.length > 0) {
    await prisma.workLedgerEntry.deleteMany({ where: { org_entity_id: { in: createdOrgIds } } });
    await prisma.integrationCredential.deleteMany({ where: { org_entity_id: { in: createdOrgIds } } });
  }
  await cleanupTestData();
});

describe("Otzar calendar continuity (P0)", () => {
  it("P1 temporal: resolves the date SERVER-SIDE from the real clock — current year, 1 PM local, never Jan 2025", async () => {
    const { userId } = await makeOrgAndUser();
    const t = await temporalFor(userId);
    const d = detectCalendarProposal(OLIVIA, t);
    expect(d?.kind).toBe("proposal");
    if (d?.kind !== "proposal") throw new Error("expected proposal");
    const p = d.proposal;
    const start = new Date(p.start_iso);
    expect(start.getUTCFullYear()).toBe(2026); // NOT 2025
    // 1 PM EDT == 17:00 UTC on 2026-07-10
    expect(p.start_iso).toBe("2026-07-10T17:00:00.000Z");
    expect(p.timezone).toBe(TZ);
    expect(p.title).toMatch(/Olivia/i);
  });

  it("exact flow: propose persists a pending proposal (honest AWAITING, not 'added'); a bare 'yes' resolves it deterministically", async () => {
    const { orgId, userId } = await makeOrgAndUser();
    const t = await temporalFor(userId);

    const proposed = await handleCalendarContinuity({
      actor_entity_id: userId, org_entity_id: orgId, message: OLIVIA, temporal: t,
    });
    expect(proposed?.state).toBe("AWAITING_CONFIRMATION");
    expect(proposed?.response).toMatch(/Jul 10, 2026/);
    expect(proposed?.response).not.toMatch(/added|done/i); // honest — not executed yet

    // Persisted server-side as a pending proposal (survives the next request).
    const pending = await prisma.workLedgerEntry.findMany({
      where: { owner_entity_id: userId, status: "NEEDS_CALLER_CONFIRMATION", ledger_type: "MEETING" },
    });
    expect(pending).toHaveLength(1);

    // A NEW turn — only "yes", no history, no LLM — resolves the pending proposal.
    // No Google connected → honest PROVIDER_BLOCKED (intent preserved, not lost).
    const confirmed = await handleCalendarContinuity({
      actor_entity_id: userId, org_entity_id: orgId, message: "yes", temporal: await temporalFor(userId),
    });
    expect(confirmed?.state).toBe("PROVIDER_BLOCKED");
    expect(confirmed?.response).toMatch(/connect/i);
    // Intent preserved for retry (not silently dropped, not falsely "added").
    const stillPending = await prisma.workLedgerEntry.findFirst({
      where: { owner_entity_id: userId, ledger_type: "MEETING" },
      orderBy: { created_at: "desc" },
    });
    expect(stillPending?.status).toBe("NEEDS_CALLER_CONFIRMATION");
  });

  it("CREATED: with an injected write-capable provider, 'yes' executes the gated calendar write and marks the proposal EXECUTED", async () => {
    const { orgId, userId } = await makeOrgAndUser();
    await connectGoogleWithWrite(orgId);
    const postCalls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: unknown, init?: { method?: string }) => {
      const u = String(url);
      if (u.includes("/calendar/v3/calendars/") && init?.method === "POST") {
        postCalls.push(u);
        return { ok: true, status: 200, json: async () => ({ id: "evt_test_1", htmlLink: "https://cal/evt_test_1", start: { dateTime: "2026-07-10T17:00:00.000Z" }, end: { dateTime: "2026-07-10T18:00:00.000Z" } }) } as unknown as Response;
      }
      return { ok: false, status: 404, json: async () => ({}) } as unknown as Response;
    }));

    await handleCalendarContinuity({ actor_entity_id: userId, org_entity_id: orgId, message: OLIVIA, temporal: await temporalFor(userId) });
    const done = await handleCalendarContinuity({ actor_entity_id: userId, org_entity_id: orgId, message: "yes", temporal: await temporalFor(userId) });
    expect(done?.state).toBe("CREATED");
    expect(done?.event_id).toBe("evt_test_1");
    expect(done?.response).toMatch(/added/i);
    expect(postCalls).toHaveLength(1);
    const row = await prisma.workLedgerEntry.findUnique({ where: { ledger_entry_id: done!.ledger_entry_id! }, select: { status: true } });
    expect(row?.status).toBe("EXECUTED");
  });

  it("idempotency: a second 'yes'/retry does NOT create a duplicate event", async () => {
    const { orgId, userId } = await makeOrgAndUser();
    await connectGoogleWithWrite(orgId);
    let posts = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: unknown, init?: { method?: string }) => {
      const u = String(url);
      if (u.includes("/calendar/v3/calendars/") && init?.method === "POST") {
        posts += 1;
        return { ok: true, status: 200, json: async () => ({ id: "evt_idem", htmlLink: "x", start: {}, end: {} }) } as unknown as Response;
      }
      return { ok: false, status: 404, json: async () => ({}) } as unknown as Response;
    }));
    await handleCalendarContinuity({ actor_entity_id: userId, org_entity_id: orgId, message: OLIVIA, temporal: await temporalFor(userId) });
    const first = await handleCalendarContinuity({ actor_entity_id: userId, org_entity_id: orgId, message: "yes", temporal: await temporalFor(userId) });
    const second = await handleCalendarContinuity({ actor_entity_id: userId, org_entity_id: orgId, message: "yes", temporal: await temporalFor(userId) });
    expect(first?.state).toBe("CREATED");
    // Second "yes": the proposal is already EXECUTED → no pending row to resolve →
    // returns null (falls through to normal handling), and NO second POST fired.
    expect(second === null || second.state !== "CREATED").toBe(true);
    expect(posts).toBe(1);
  });

  it("isolation: another user's 'yes' cannot resolve user A's pending proposal", async () => {
    const { orgId, userId: userA } = await makeOrgAndUser();
    const userBObj = await createEntity(makeEntityInput({ entity_type: "PERSON" }));
    await prisma.entityMembership.create({ data: { parent_id: orgId, child_id: userBObj.entity_id, is_active: true } });

    await handleCalendarContinuity({ actor_entity_id: userA, org_entity_id: orgId, message: OLIVIA, temporal: await temporalFor(userA) });
    // User B says "yes" — has no pending proposal of their own → no side effect.
    const bYes = await handleCalendarContinuity({ actor_entity_id: userBObj.entity_id, org_entity_id: orgId, message: "yes", temporal: await temporalFor(userBObj.entity_id) });
    expect(bYes).toBeNull(); // falls through; does NOT touch A's proposal
    // A's proposal is still pending.
    const aPending = await prisma.workLedgerEntry.findFirst({ where: { owner_entity_id: userA, status: "NEEDS_CALLER_CONFIRMATION" } });
    expect(aPending).not.toBeNull();
  });

  it("reject: 'no' cancels the pending proposal, never leaving it silently active", async () => {
    const { orgId, userId } = await makeOrgAndUser();
    await handleCalendarContinuity({ actor_entity_id: userId, org_entity_id: orgId, message: OLIVIA, temporal: await temporalFor(userId) });
    const rejected = await handleCalendarContinuity({ actor_entity_id: userId, org_entity_id: orgId, message: "no", temporal: await temporalFor(userId) });
    expect(rejected?.state).toBe("CANCELLED");
    const row = await prisma.workLedgerEntry.findFirst({ where: { owner_entity_id: userId, ledger_type: "MEETING" }, orderBy: { created_at: "desc" } });
    expect(row?.status).toBe("CANCELLED");
  });

  it("no-pending 'yes' is inert: falls through to normal handling (no false interception)", async () => {
    const { orgId, userId } = await makeOrgAndUser();
    const r = await handleCalendarContinuity({ actor_entity_id: userId, org_entity_id: orgId, message: "yes", temporal: await temporalFor(userId) });
    expect(r).toBeNull(); // nothing pending → resolver must NOT side-effect
  });

  // ── Correction #1: exact server-authoritative thread binding ───────────────
  const THREAD_X = "11111111-1111-4111-8111-111111111111";
  const THREAD_Y = "22222222-2222-4222-8222-222222222222";

  it("Correction #1 — a 'yes' from a DIFFERENT thread cannot silently approve another thread's proposal", async () => {
    const { orgId, userId } = await makeOrgAndUser();
    // Propose in thread X (client supplied the thread id).
    const proposed = await handleCalendarContinuity({
      actor_entity_id: userId, org_entity_id: orgId, conversation_id: THREAD_X, message: OLIVIA, temporal: await temporalFor(userId),
    });
    expect(proposed?.state).toBe("AWAITING_CONFIRMATION");
    expect(proposed?.conversation_id).toBe(THREAD_X); // bound to the exact thread
    const bound = await prisma.workLedgerEntry.findFirst({
      where: { owner_entity_id: userId, status: "NEEDS_CALLER_CONFIRMATION", ledger_type: "MEETING" },
      select: { conversation_id: true },
    });
    expect(bound?.conversation_id).toBe(THREAD_X);

    // "yes" arriving inside thread Y must NOT resolve thread X's proposal.
    const wrongThread = await handleCalendarContinuity({
      actor_entity_id: userId, org_entity_id: orgId, conversation_id: THREAD_Y, message: "yes", temporal: await temporalFor(userId),
    });
    expect(wrongThread).toBeNull(); // falls through — no silent cross-thread approval
    const still = await prisma.workLedgerEntry.findFirst({
      where: { owner_entity_id: userId, ledger_type: "MEETING" }, orderBy: { created_at: "desc" }, select: { status: true },
    });
    expect(still?.status).toBe("NEEDS_CALLER_CONFIRMATION"); // untouched

    // "yes" inside the correct thread X resolves it.
    const rightThread = await handleCalendarContinuity({
      actor_entity_id: userId, org_entity_id: orgId, conversation_id: THREAD_X, message: "yes", temporal: await temporalFor(userId),
    });
    expect(rightThread?.state).toBe("PROVIDER_BLOCKED"); // no Google → honest, but it DID resolve
    expect(rightThread?.conversation_id).toBe(THREAD_X);
  });

  it("Correction #1 — ambient 'yes' (no conversation_id) STILL resolves and restores the proposal's bound thread (P0 live invariant)", async () => {
    const { orgId, userId } = await makeOrgAndUser();
    const proposed = await handleCalendarContinuity({
      actor_entity_id: userId, org_entity_id: orgId, conversation_id: THREAD_X, message: OLIVIA, temporal: await temporalFor(userId),
    });
    expect(proposed?.conversation_id).toBe(THREAD_X);
    // The live CT sends NO conversation_id on the confirm turn — must still resolve,
    // and hand back the restored thread so the client re-anchors.
    const ambient = await handleCalendarContinuity({
      actor_entity_id: userId, org_entity_id: orgId, message: "yes", temporal: await temporalFor(userId),
    });
    expect(ambient?.state).toBe("PROVIDER_BLOCKED"); // resolved (no Google connected)
    expect(ambient?.conversation_id).toBe(THREAD_X); // restored bound thread
  });

  it("Correction #2 — past-today time asks a truthful clarification and persists NOTHING (never silently tomorrow)", async () => {
    const { orgId, userId } = await makeOrgAndUser();
    // 2026-07-10 20:00Z = 16:00 EDT → "at one o'clock" (1 PM) already passed.
    const pastNow = Date.UTC(2026, 6, 10, 20, 0, 0);
    const tPast = await resolveTemporalContext({ actor_entity_id: userId, client_timezone: TZ, now_ms: pastNow });

    const clarify = await handleCalendarContinuity({
      actor_entity_id: userId, org_entity_id: orgId, message: OLIVIA, temporal: tPast,
    });
    expect(clarify?.state).toBe("NEEDS_TIME_CLARIFICATION");
    expect(clarify?.response).toMatch(/already passed/i);
    expect(clarify?.response).toMatch(/tomorrow|another time today/i);
    expect(clarify?.ledger_entry_id).toBeUndefined();
    // Crucially: NOTHING confirmable was persisted — a stray "yes" must be inert.
    const persisted = await prisma.workLedgerEntry.findMany({
      where: { owner_entity_id: userId, status: "NEEDS_CALLER_CONFIRMATION", ledger_type: "MEETING" },
    });
    expect(persisted).toHaveLength(0);

    // The user resolves it explicitly — "tomorrow at 1pm" → a real proposal.
    const proposed = await handleCalendarContinuity({
      actor_entity_id: userId, org_entity_id: orgId, message: "put Olivia's event on my calendar tomorrow at 1pm", temporal: tPast,
    });
    expect(proposed?.state).toBe("AWAITING_CONFIRMATION");
    expect(proposed?.response).toMatch(/Jul 11, 2026/); // tomorrow, now explicit
  });
});
