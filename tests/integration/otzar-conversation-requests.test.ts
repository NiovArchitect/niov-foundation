// FILE: otzar-conversation-requests.test.ts (integration)
// PURPOSE: [OTZAR-CONTINUITY P5 Stage 1 §2/§7] Real-DB proof of the durable request-
//          processing record: idempotent create (1:1 with the user turn + on
//          client_request_id), atomic RECEIVED→PROCESSING claim with EXACTLY ONE winner
//          under concurrency, lease-owner-gated complete/fail, and stale-lease reclaim.
// CONNECTS TO: packages/database/src/queries/otzar-conversation-requests.ts

import { afterAll, describe, expect, it } from "vitest";
import {
  prisma,
  createOrGetRequest,
  claimRequestProcessing,
  completeRequest,
  completeRequestWithCanonicalResponse,
  failRequest,
  getRequestByUserTurn,
} from "@niov/database";
import { randomUUID } from "node:crypto";
import { cleanupTestData } from "../helpers.js";

const convIds: string[] = [];
const ORG = randomUUID();
const SUBJECT = randomUUID();
const TWIN = randomUUID();

function baseInput(over: Partial<Parameters<typeof createOrGetRequest>[0]> = {}) {
  const conv = randomUUID();
  convIds.push(conv);
  return {
    conversation_id: conv, user_turn_id: randomUUID(), org_entity_id: ORG,
    subject_entity_id: SUBJECT, twin_entity_id: TWIN, content_hash: "h", ...over,
  };
}

afterAll(async () => {
  if (convIds.length > 0) {
    await prisma.otzarConversationRequest.deleteMany({ where: { conversation_id: { in: convIds } } });
  }
  await cleanupTestData();
});

describe("OtzarConversationRequest (P5 Stage 1)", () => {
  it("createOrGetRequest is idempotent on user_turn_id (one record)", async () => {
    const input = baseInput();
    const a = await createOrGetRequest(input);
    const b = await createOrGetRequest(input);
    expect(a.created).toBe(true);
    expect(b.created).toBe(false);
    expect(b.request.request_record_id).toBe(a.request.request_record_id);
  });

  it("createOrGetRequest dedups on (conversation_id, client_request_id) too", async () => {
    const conv = randomUUID(); convIds.push(conv);
    const a = await createOrGetRequest({ conversation_id: conv, user_turn_id: randomUUID(), org_entity_id: ORG, subject_entity_id: SUBJECT, twin_entity_id: TWIN, content_hash: "h", client_request_id: "cli-1" });
    const b = await createOrGetRequest({ conversation_id: conv, user_turn_id: randomUUID(), org_entity_id: ORG, subject_entity_id: SUBJECT, twin_entity_id: TWIN, content_hash: "h", client_request_id: "cli-1" });
    expect(a.created).toBe(true);
    expect(b.created).toBe(false);
    expect(b.request.request_record_id).toBe(a.request.request_record_id);
  });

  it("atomic claim has EXACTLY ONE winner under 12 concurrent claims", async () => {
    const { request } = await createOrGetRequest(baseInput());
    const now = Date.now();
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) => claimRequestProcessing(request.request_record_id, `lease-${i}`, now)),
    );
    const winners = results.filter((r) => r.claimed);
    expect(winners).toHaveLength(1); // exactly one PROCESSING owner
    const row = await getRequestByUserTurn(request.user_turn_id);
    expect(row!.state).toBe("PROCESSING");
    expect(row!.attempt_count).toBe(1); // only the winner incremented
  });

  it("complete/fail are lease-owner gated; complete links the canonical assistant turn", async () => {
    const { request } = await createOrGetRequest(baseInput());
    const claim = await claimRequestProcessing(request.request_record_id, "owner-lease", Date.now());
    expect(claim.claimed).toBe(true);
    // Wrong lease cannot complete.
    expect(await completeRequest({ request_record_id: request.request_record_id, leaseToken: "wrong", canonical_assistant_turn_id: randomUUID(), response_class: "ANSWERED" })).toBe(false);
    // Owner completes + links canonical result.
    const canon = randomUUID();
    expect(await completeRequest({ request_record_id: request.request_record_id, leaseToken: "owner-lease", canonical_assistant_turn_id: canon, response_class: "ACTION_PROPOSED" })).toBe(true);
    const row = await getRequestByUserTurn(request.user_turn_id);
    expect(row!.state).toBe("COMPLETED");
    expect(row!.canonical_assistant_turn_id).toBe(canon);
    expect(row!.response_class).toBe("ACTION_PROPOSED");
  });

  it("C3 completeRequestWithCanonicalResponse guards fail CLOSED (scope / lease / version) without completing", async () => {
    const input = baseInput();
    const { request } = await createOrGetRequest(input);
    const token = "c3-lease";
    await claimRequestProcessing(request.request_record_id, token, Date.now());
    const common = {
      request_record_id: request.request_record_id,
      user_turn_id: input.user_turn_id,
      org_entity_id: ORG, subject_entity_id: SUBJECT, twin_entity_id: TWIN,
      conversation_id: input.conversation_id, content: "reply", response_class: "ANSWERED" as const,
    };
    // Wrong org → scope mismatch (fails closed, before touching turns).
    expect((await completeRequestWithCanonicalResponse({ ...common, leaseToken: token, org_entity_id: randomUUID() })).outcome).toBe("scope_mismatch");
    // Wrong lease token → lease lost.
    expect((await completeRequestWithCanonicalResponse({ ...common, leaseToken: "not-the-owner" })).outcome).toBe("lease_lost");
    // Wrong expected processing version → state conflict.
    expect((await completeRequestWithCanonicalResponse({ ...common, leaseToken: token, expected_version: 999 })).outcome).toBe("state_conflict");
    // None of the refusals completed the request or linked a canonical turn.
    const row = await getRequestByUserTurn(input.user_turn_id);
    expect(row!.state).toBe("PROCESSING");
    expect(row!.canonical_assistant_turn_id).toBeNull();
  });

  it("a stale (expired) lease can be reclaimed with a bumped version; a live lease cannot", async () => {
    const { request } = await createOrGetRequest(baseInput());
    const past = Date.now() - 10 * 60 * 1000; // acquire a lease that is already expired
    const first = await claimRequestProcessing(request.request_record_id, "old", past, 1000);
    expect(first.claimed).toBe(true);
    // A fresh claim now: the old lease expired long ago → reclaimable.
    const reclaim = await claimRequestProcessing(request.request_record_id, "new", Date.now());
    expect(reclaim.claimed).toBe(true);
    const row = await getRequestByUserTurn(request.user_turn_id);
    expect(row!.lease_token).toBe("new");
    expect(row!.processing_version).toBe(2); // bumped twice
    // A live lease (just acquired) cannot be reclaimed.
    const blocked = await claimRequestProcessing(request.request_record_id, "third", Date.now());
    expect(blocked.claimed).toBe(false);
  });

  it("failRequest (retryable) allows a later reclaim", async () => {
    const { request } = await createOrGetRequest(baseInput());
    await claimRequestProcessing(request.request_record_id, "l1", Date.now());
    expect(await failRequest({ request_record_id: request.request_record_id, leaseToken: "l1", final: false, failure_code: "X" })).toBe(true);
    // FAILED_RETRYABLE with an expired lease → reclaimable.
    const reclaim = await claimRequestProcessing(request.request_record_id, "l2", Date.now() + 2 * 60 * 1000);
    expect(reclaim.claimed).toBe(true);
  });
});
