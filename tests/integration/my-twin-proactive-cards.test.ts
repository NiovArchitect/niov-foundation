// FILE: my-twin-proactive-cards.test.ts (integration)
// PURPOSE: Section 1 Wave 3 ADR-0068 — scoped Twin proactivity
//          contract coverage. Verifies the caller's OWN
//          self-scoped substrate (Wave 5 PROPOSED / ACCEPTED
//          readers + Wave 4A wallet-stale signal + Wave 4C
//          cross-conversation rollup + ACCEPTED reviewed_at
//          periodic check-in) surfaces on the existing
//          GET /api/v1/otzar/my-twin response as
//          `proactive_cards[]`. Verifies: absent when no cards
//          apply; each card_type derivation; cross-owner
//          isolation; opt-out; deterministic card_key;
//          cap honored; ordering; NO new audit literal; NO
//          schema mutation; NO Notification/Action/MemoryCapsule/
//          OtzarConversation/OtzarProposedPattern/Intelligence
//          Pattern mutation; closed-vocab SAFE projection only.
// CONNECTS TO:
//   - apps/api/src/routes/otzar.routes.ts (GET /api/v1/otzar/my-twin)
//   - apps/api/src/services/otzar/otzar.service.ts (getMyTwin)
//   - apps/api/src/services/otzar/proactivity.service.ts
//   - apps/api/src/services/otzar/proposed-pattern.service.ts
//   - apps/api/src/services/otzar/stale-context-signal.service.ts
//   - apps/api/src/services/otzar/drift-rollup.service.ts

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
  withCleanRateLimits,
} from "../helpers.js";
import type { FastifyInstance } from "fastify";

const TEST_JWT_SECRET = "my-twin-proactive-cards-test-secret";
const TEST_KEY = randomBytes(32);

let app: FastifyInstance;
const store = new MemoryRateLimitStore();

beforeAll(async () => {
  await ensureAuditTriggers();
  await cleanupTestData();
  app = await buildApp({
    jwtSecret: TEST_JWT_SECRET,
    sessionNonceStore: new MemoryNonceStore(),
    declarationStore: new MemoryNonceStore(),
    contentStore: new MemoryContentStore(),
    contentEncryption: new ContentEncryption(TEST_KEY),
    rateLimitStore: store,
  });
});

afterAll(async () => {
  await app.close();
  await cleanupTestData();
  await prisma.$disconnect();
});

withCleanRateLimits(store);

async function loginPerson(): Promise<{
  entityId: string;
  twinId: string;
  walletId: string;
  token: string;
  ip: string;
}> {
  const password = "correct-horse-battery";
  const input = makeEntityInput({ entity_type: "PERSON", password });
  const entity = await createEntity(input);
  // Attach an AI_AGENT twin so getMyTwin doesn't return TWIN_NOT_FOUND.
  const twin = await createEntity({
    entity_type: "AI_AGENT",
    display_name: `${TEST_PREFIX}twin_${randomUUID()}`,
    email: `${TEST_PREFIX}twin_${randomUUID()}@niov.test`,
    public_key: "test-twin-public-key",
    clearance_level: 0,
  });
  await prisma.entityMembership.create({
    data: {
      parent_id: entity.entity_id,
      child_id: twin.entity_id,
      role_title: "Digital Twin",
      is_active: true,
    },
  });
  const wallet = await prisma.wallet.findUnique({
    where: { entity_id: entity.entity_id },
    select: { wallet_id: true },
  });
  if (wallet === null) {
    throw new Error("wallet missing after createEntity");
  }
  const ip = `10.109.${Math.floor(Math.random() * 200) + 1}.${
    Math.floor(Math.random() * 254) + 1
  }`;
  const login = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: {
      email: input.email,
      password,
      requested_operations: ["read", "write"],
    },
    remoteAddress: ip,
  });
  if (login.statusCode !== 200) {
    throw new Error(`login failed: ${login.statusCode} ${login.body}`);
  }
  const body = login.json() as { token: string };
  return {
    entityId: entity.entity_id,
    twinId: twin.entity_id,
    walletId: wallet.wallet_id,
    token: body.token,
    ip,
  };
}

async function insertProposedPattern(opts: {
  ownerEntityId: string;
  source_signal_type:
    | "PER_CONVERSATION_DRIFT"
    | "WALLET_STALE_CONTEXT"
    | "CROSS_CONVERSATION_ROLLUP";
  pattern_label:
    | "RECURRING_CORRECTION_RECOMMENDATION_REVIEW"
    | "STALE_CONTEXT_REFRESH_RECOMMENDED"
    | "CROSS_CONVERSATION_ALIGNMENT_RECOMMENDED";
  status: "PROPOSED" | "ACCEPTED" | "REJECTED" | "ARCHIVED";
  reviewedAt?: Date;
  proposedAt?: Date;
}): Promise<string> {
  const now = new Date();
  const row = await prisma.otzarProposedPattern.create({
    data: {
      owner_entity_id: opts.ownerEntityId,
      source_signal_type: opts.source_signal_type,
      pattern_label: opts.pattern_label,
      safe_summary: "proactive-card test fixture safe summary",
      confidence_label: "MEDIUM",
      status: opts.status,
      occurrence_count: 3,
      first_signal_at: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000),
      last_signal_at: now,
      ...(opts.proposedAt !== undefined ? { proposed_at: opts.proposedAt } : {}),
      reviewed_at: opts.reviewedAt ?? null,
      archived_at: null,
    },
  });
  return row.pattern_id;
}

// WHAT: Insert a MemoryCapsule with deliberately divergent
//        content_hash vs embedding_content_hash to produce a
//        STALE_CONTEXT_RISK signal from the Wave 4A pure helper.
// INPUT: walletId + entity_id of owner.
// OUTPUT: capsule_id.
// WHY: Wave 4A pure helper counts capsules where
//      embedding_content_hash != content_hash; one such capsule
//      flips the label to STALE_CONTEXT_RISK.
async function insertStaleCapsule(opts: {
  ownerEntityId: string;
  walletId: string;
}): Promise<string> {
  const row = await prisma.memoryCapsule.create({
    data: {
      capsule_id: randomUUID(),
      entity_id: opts.ownerEntityId,
      wallet_id: opts.walletId,
      capsule_type: "PREFERENCE",
      version: 1,
      content_hash: `stale-${randomUUID()}-content`,
      embedding_content_hash: `stale-${randomUUID()}-embedding`,
      embedding_generated_at: new Date(),
      storage_location: `${TEST_PREFIX}loc-${randomUUID()}`,
      payload_summary: `${TEST_PREFIX}stale-capsule-fixture`,
      payload_size_tokens: 10,
      relevance_score: 1.0,
      decay_type: "PERMANENT",
      topic_tags: [],
      clearance_required: 0,
      ai_access_blocked: false,
      requires_validation: false,
    },
  });
  return row.capsule_id;
}

async function getMyTwin(
  caller: { token: string; ip: string } | null,
  includeProactiveCards?: boolean | "invalid",
): Promise<{ statusCode: number; body: any; raw: string }> {
  let url = "/api/v1/otzar/my-twin";
  if (includeProactiveCards === false) url += "?include_proactive_cards=false";
  else if (includeProactiveCards === true) url += "?include_proactive_cards=true";
  else if (includeProactiveCards === "invalid")
    url += "?include_proactive_cards=banana";
  const r = await app.inject({
    method: "GET",
    url,
    headers:
      caller === null ? {} : { authorization: `Bearer ${caller.token}` },
    ...(caller === null ? {} : { remoteAddress: caller.ip }),
  });
  return { statusCode: r.statusCode, body: r.json() as any, raw: r.body };
}

// WHAT: Internal-field markers that MUST NOT appear in the
//        SAFE proactive_cards projection. Distinct from text-
//        framing words like "manager" or "surveillance" — those
//        appear in canonical anti-framing copy (e.g., the honest
//        notes that say "not visible to managers") and are
//        intentional symbiotic disclaimers per ADR-0068 §5.
const FORBIDDEN_NO_LEAK_MARKERS = [
  "owner_entity_id",
  "occurrence_count",
  "first_signal_at",
  "last_signal_at",
  "proposed_at",
  "reviewed_at",
  "archived_at",
  "created_at",
  "updated_at",
  "raw_correction",
  "raw_transcript",
  "payload_summary",
  "payload_content",
  "storage_location",
  "content_hash",
  "embedding_content_hash",
  "secret_ref",
  "bridge_id",
  "drift_score",
  "employee_score",
  "compliance_score",
  "risk_profile",
  "wallet_id",
  "conversation_id",
  "session_id",
];

function assertNoLeakInProactiveCards(body: any): void {
  if (!body?.twin?.proactive_cards) return;
  const cards = JSON.stringify(body.twin.proactive_cards);
  for (const marker of FORBIDDEN_NO_LEAK_MARKERS) {
    expect(cards.toLowerCase()).not.toContain(marker.toLowerCase());
  }
}

describe("Section 1 Wave 3 — backward-compat + opt-out", () => {
  it("401 without bearer (existing route behavior preserved)", async () => {
    const r = await getMyTwin(null);
    expect(r.statusCode).toBe(401);
  });

  it("proactive_cards absent when caller has no proactive substrate", async () => {
    const caller = await loginPerson();
    const r = await getMyTwin(caller);
    expect(r.statusCode).toBe(200);
    expect(r.body.twin).toBeDefined();
    expect(r.body.twin.proactive_cards).toBeUndefined();
    // Wave 6A still surfaces accepted_patterns (Wave 6A regression).
    expect(Array.isArray(r.body.twin.accepted_patterns)).toBe(true);
  });

  it("include_proactive_cards=false omits the sidecar even when substrate exists", async () => {
    const caller = await loginPerson();
    await insertProposedPattern({
      ownerEntityId: caller.entityId,
      source_signal_type: "PER_CONVERSATION_DRIFT",
      pattern_label: "RECURRING_CORRECTION_RECOMMENDATION_REVIEW",
      status: "PROPOSED",
    });
    const r = await getMyTwin(caller, false);
    expect(r.statusCode).toBe(200);
    expect(r.body.twin.proactive_cards).toBeUndefined();
  });

  it("include_proactive_cards=banana (typo) falls back to default (cards present)", async () => {
    const caller = await loginPerson();
    await insertProposedPattern({
      ownerEntityId: caller.entityId,
      source_signal_type: "PER_CONVERSATION_DRIFT",
      pattern_label: "RECURRING_CORRECTION_RECOMMENDATION_REVIEW",
      status: "PROPOSED",
    });
    const r = await getMyTwin(caller, "invalid");
    expect(r.statusCode).toBe(200);
    expect(Array.isArray(r.body.twin.proactive_cards)).toBe(true);
    expect(r.body.twin.proactive_cards.length).toBeGreaterThan(0);
  });
});

describe("Section 1 Wave 3 — per-card_type derivation", () => {
  it("ACCEPTED pattern → ACCEPTED_PATTERN_REMINDER card", async () => {
    const caller = await loginPerson();
    await insertProposedPattern({
      ownerEntityId: caller.entityId,
      source_signal_type: "PER_CONVERSATION_DRIFT",
      pattern_label: "RECURRING_CORRECTION_RECOMMENDATION_REVIEW",
      status: "ACCEPTED",
      reviewedAt: new Date(),
    });
    const r = await getMyTwin(caller);
    expect(r.statusCode).toBe(200);
    const cards = r.body.twin.proactive_cards as Array<any>;
    expect(Array.isArray(cards)).toBe(true);
    const reminder = cards.find(
      (c) => c.card_type === "ACCEPTED_PATTERN_REMINDER",
    );
    expect(reminder).toBeDefined();
    expect(reminder.source_signal_type).toBe("ACCEPTED_PATTERN");
    expect(reminder.priority_label).toBe("LOW");
    expect(reminder.action_hint).toBe("CONTINUE_CONVERSATION");
    expect(typeof reminder.card_key).toBe("string");
    expect(reminder.card_key.length).toBe(16);
    expect(typeof reminder.title).toBe("string");
    expect(typeof reminder.body).toBe("string");
    expect(typeof reminder.honest_note).toBe("string");
    // Forbidden-framing guard on title + body only — the
    // honest_note canonically contains "not visible to managers"
    // anti-framing per ADR-0068 §5, so manager/surveillance
    // disclaimers there are intentional symbiotic copy.
    const titleBody = (reminder.title + " " + reminder.body).toLowerCase();
    expect(titleBody).not.toContain("manager");
    expect(titleBody).not.toContain("surveillance");
    expect(titleBody).not.toContain("score");
    expect(titleBody).not.toContain("compliance");
    expect(titleBody).not.toContain("discipline");
  });

  it("PROPOSED pattern → PROPOSED_PATTERN_REVIEW_AVAILABLE card", async () => {
    const caller = await loginPerson();
    await insertProposedPattern({
      ownerEntityId: caller.entityId,
      source_signal_type: "PER_CONVERSATION_DRIFT",
      pattern_label: "RECURRING_CORRECTION_RECOMMENDATION_REVIEW",
      status: "PROPOSED",
    });
    const r = await getMyTwin(caller);
    const cards = r.body.twin.proactive_cards as Array<any>;
    const review = cards.find(
      (c) => c.card_type === "PROPOSED_PATTERN_REVIEW_AVAILABLE",
    );
    expect(review).toBeDefined();
    expect(review.source_signal_type).toBe("PROPOSED_PATTERN");
    expect(review.priority_label).toBe("NORMAL");
    expect(review.action_hint).toBe("REVIEW_PATTERN");
    expect(review.pattern_label).toBe(
      "RECURRING_CORRECTION_RECOMMENDATION_REVIEW",
    );
  });

  it("STALE_CONTEXT_RISK substrate → STALE_CONTEXT_REFRESH_SUGGESTED card", async () => {
    const caller = await loginPerson();
    await insertStaleCapsule({
      ownerEntityId: caller.entityId,
      walletId: caller.walletId,
    });
    const r = await getMyTwin(caller);
    const cards = (r.body.twin.proactive_cards ?? []) as Array<any>;
    const stale = cards.find(
      (c) => c.card_type === "STALE_CONTEXT_REFRESH_SUGGESTED",
    );
    expect(stale).toBeDefined();
    expect(stale.source_signal_type).toBe("WALLET_STALE_CONTEXT");
    expect(stale.priority_label).toBe("LOW");
    expect(stale.action_hint).toBe("REFRESH_CONTEXT");
  });

  it("ALIGNMENT_CHECK_IN fires when ACCEPTED is older than 14 days AND no PROPOSED waiting", async () => {
    const caller = await loginPerson();
    const oldReviewed = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);
    await insertProposedPattern({
      ownerEntityId: caller.entityId,
      source_signal_type: "PER_CONVERSATION_DRIFT",
      pattern_label: "RECURRING_CORRECTION_RECOMMENDATION_REVIEW",
      status: "ACCEPTED",
      reviewedAt: oldReviewed,
    });
    const r = await getMyTwin(caller);
    const cards = (r.body.twin.proactive_cards ?? []) as Array<any>;
    const checkin = cards.find((c) => c.card_type === "ALIGNMENT_CHECK_IN");
    expect(checkin).toBeDefined();
    expect(checkin.source_signal_type).toBe("ALIGNMENT_PERIODIC");
    expect(checkin.priority_label).toBe("LOW");
    expect(checkin.action_hint).toBe("NO_ACTION");
  });

  it("ALIGNMENT_CHECK_IN suppressed when PROPOSED row exists (even if ACCEPTED is older)", async () => {
    const caller = await loginPerson();
    const oldReviewed = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);
    await insertProposedPattern({
      ownerEntityId: caller.entityId,
      source_signal_type: "PER_CONVERSATION_DRIFT",
      pattern_label: "RECURRING_CORRECTION_RECOMMENDATION_REVIEW",
      status: "ACCEPTED",
      reviewedAt: oldReviewed,
    });
    await insertProposedPattern({
      ownerEntityId: caller.entityId,
      source_signal_type: "WALLET_STALE_CONTEXT",
      pattern_label: "STALE_CONTEXT_REFRESH_RECOMMENDED",
      status: "PROPOSED",
    });
    const r = await getMyTwin(caller);
    const cards = (r.body.twin.proactive_cards ?? []) as Array<any>;
    const checkin = cards.find((c) => c.card_type === "ALIGNMENT_CHECK_IN");
    expect(checkin).toBeUndefined();
    // PROPOSED_PATTERN_REVIEW_AVAILABLE present instead.
    expect(
      cards.find((c) => c.card_type === "PROPOSED_PATTERN_REVIEW_AVAILABLE"),
    ).toBeDefined();
  });

  it("ALIGNMENT_CHECK_IN does NOT fire when ACCEPTED is recent (< 14 days)", async () => {
    const caller = await loginPerson();
    await insertProposedPattern({
      ownerEntityId: caller.entityId,
      source_signal_type: "PER_CONVERSATION_DRIFT",
      pattern_label: "RECURRING_CORRECTION_RECOMMENDATION_REVIEW",
      status: "ACCEPTED",
      reviewedAt: new Date(), // now
    });
    const r = await getMyTwin(caller);
    const cards = (r.body.twin.proactive_cards ?? []) as Array<any>;
    const checkin = cards.find((c) => c.card_type === "ALIGNMENT_CHECK_IN");
    expect(checkin).toBeUndefined();
    // ACCEPTED_PATTERN_REMINDER present.
    expect(
      cards.find((c) => c.card_type === "ACCEPTED_PATTERN_REMINDER"),
    ).toBeDefined();
  });
});

describe("Section 1 Wave 3 — ordering + cap", () => {
  it("cards are ordered PROPOSED → STALE_CONTEXT → DRIFT_REVIEW → ACCEPTED → ALIGNMENT_CHECK_IN; cap at 4", async () => {
    const caller = await loginPerson();
    const oldReviewed = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    // ACCEPTED + PROPOSED + stale capsule (=> STALE_CONTEXT_RISK +
    // potentially AT_RISK rollup). With PROPOSED present, ALIGNMENT_
    // CHECK_IN is suppressed, so we expect at most 4 cards naturally.
    await insertProposedPattern({
      ownerEntityId: caller.entityId,
      source_signal_type: "PER_CONVERSATION_DRIFT",
      pattern_label: "RECURRING_CORRECTION_RECOMMENDATION_REVIEW",
      status: "ACCEPTED",
      reviewedAt: oldReviewed,
    });
    await insertProposedPattern({
      ownerEntityId: caller.entityId,
      source_signal_type: "WALLET_STALE_CONTEXT",
      pattern_label: "STALE_CONTEXT_REFRESH_RECOMMENDED",
      status: "PROPOSED",
    });
    await insertStaleCapsule({
      ownerEntityId: caller.entityId,
      walletId: caller.walletId,
    });
    const r = await getMyTwin(caller);
    const cards = (r.body.twin.proactive_cards ?? []) as Array<any>;
    expect(cards.length).toBeLessThanOrEqual(4);
    // Verify ordering for whichever cards are present.
    const ORDER: Record<string, number> = {
      PROPOSED_PATTERN_REVIEW_AVAILABLE: 0,
      STALE_CONTEXT_REFRESH_SUGGESTED: 1,
      DRIFT_REVIEW_SUGGESTED: 2,
      ACCEPTED_PATTERN_REMINDER: 3,
      ALIGNMENT_CHECK_IN: 4,
    };
    for (let i = 1; i < cards.length; i++) {
      const prev = ORDER[cards[i - 1]!.card_type as string]!;
      const cur = ORDER[cards[i]!.card_type as string]!;
      expect(cur).toBeGreaterThan(prev);
    }
    // PROPOSED card must be first.
    expect(cards[0].card_type).toBe("PROPOSED_PATTERN_REVIEW_AVAILABLE");
  });

  it("only one ACCEPTED_PATTERN_REMINDER card even when multiple ACCEPTED rows exist", async () => {
    const caller = await loginPerson();
    const ts = Date.now();
    for (let i = 0; i < 4; i++) {
      await insertProposedPattern({
        ownerEntityId: caller.entityId,
        source_signal_type: "PER_CONVERSATION_DRIFT",
        pattern_label: "RECURRING_CORRECTION_RECOMMENDATION_REVIEW",
        status: "ACCEPTED",
        reviewedAt: new Date(ts - (4 - i) * 60_000),
      });
    }
    const r = await getMyTwin(caller);
    const cards = (r.body.twin.proactive_cards ?? []) as Array<any>;
    const reminderCards = cards.filter(
      (c) => c.card_type === "ACCEPTED_PATTERN_REMINDER",
    );
    expect(reminderCards.length).toBe(1);
  });
});

describe("Section 1 Wave 3 — deterministic card_key", () => {
  it("same substrate state + same day yields the same card_key across reads", async () => {
    const caller = await loginPerson();
    await insertProposedPattern({
      ownerEntityId: caller.entityId,
      source_signal_type: "PER_CONVERSATION_DRIFT",
      pattern_label: "RECURRING_CORRECTION_RECOMMENDATION_REVIEW",
      status: "PROPOSED",
    });
    const r1 = await getMyTwin(caller);
    const r2 = await getMyTwin(caller);
    const card1 = (r1.body.twin.proactive_cards as Array<any>).find(
      (c) => c.card_type === "PROPOSED_PATTERN_REVIEW_AVAILABLE",
    );
    const card2 = (r2.body.twin.proactive_cards as Array<any>).find(
      (c) => c.card_type === "PROPOSED_PATTERN_REVIEW_AVAILABLE",
    );
    expect(card1.card_key).toBe(card2.card_key);
  });
});

describe("Section 1 Wave 3 — cross-owner isolation (RULE 0)", () => {
  it("Caller A's proactive_cards do NOT include any of Caller B's substrate", async () => {
    const callerA = await loginPerson();
    const callerB = await loginPerson();
    const bPatternId = await insertProposedPattern({
      ownerEntityId: callerB.entityId,
      source_signal_type: "PER_CONVERSATION_DRIFT",
      pattern_label: "RECURRING_CORRECTION_RECOMMENDATION_REVIEW",
      status: "ACCEPTED",
      reviewedAt: new Date(),
    });
    const rA = await getMyTwin(callerA);
    expect(rA.body.twin.proactive_cards).toBeUndefined();
    // And the raw payload must not contain B's pattern_id even as
    // an incidental substring.
    expect(rA.raw).not.toContain(bPatternId);
    expect(rA.raw).not.toContain(callerB.entityId);
  });
});

describe("Section 1 Wave 3 — no-leak + safe projection", () => {
  it("response payload contains no forbidden internals when cards fire", async () => {
    const caller = await loginPerson();
    await insertProposedPattern({
      ownerEntityId: caller.entityId,
      source_signal_type: "PER_CONVERSATION_DRIFT",
      pattern_label: "RECURRING_CORRECTION_RECOMMENDATION_REVIEW",
      status: "PROPOSED",
    });
    await insertProposedPattern({
      ownerEntityId: caller.entityId,
      source_signal_type: "PER_CONVERSATION_DRIFT",
      pattern_label: "RECURRING_CORRECTION_RECOMMENDATION_REVIEW",
      status: "ACCEPTED",
      reviewedAt: new Date(),
    });
    const r = await getMyTwin(caller);
    expect(r.statusCode).toBe(200);
    assertNoLeakInProactiveCards(r.body);
  });
});

describe("Section 1 Wave 3 — audit + mutation posture", () => {
  it("getMyTwin call emits ZERO new audit literal mentioning proactive cards", async () => {
    const caller = await loginPerson();
    await insertProposedPattern({
      ownerEntityId: caller.entityId,
      source_signal_type: "PER_CONVERSATION_DRIFT",
      pattern_label: "RECURRING_CORRECTION_RECOMMENDATION_REVIEW",
      status: "ACCEPTED",
      reviewedAt: new Date(),
    });
    await getMyTwin(caller);
    const rows = await prisma.auditEvent.findMany({
      where: { actor_entity_id: caller.entityId },
      select: { event_type: true, details: true },
    });
    for (const row of rows) {
      expect(row.event_type).not.toMatch(/PROACTIVE/);
      expect(row.event_type).not.toMatch(/PROACTIVE_CARD/);
      const detailsStr = JSON.stringify(row.details);
      expect(detailsStr).not.toContain("PROACTIVE_CARD_VIEWED");
      expect(detailsStr).not.toContain("PROACTIVE_CARDS_READ");
      // The Wave 4A / Wave 4C signal services audit a DRIFT_SIGNAL_READ
      // event when their analyze* functions run on their own routes.
      // The proactive-card derivation MUST use the pure helpers that
      // do NOT audit — so no new DRIFT_SIGNAL_READ row should appear
      // from this getMyTwin call. Verify the absence:
      if (row.event_type === "ADMIN_ACTION") {
        expect(detailsStr).not.toContain("DRIFT_SIGNAL_READ");
      }
    }
  });

  it("getMyTwin does not mutate any OtzarProposedPattern row", async () => {
    const caller = await loginPerson();
    const pid = await insertProposedPattern({
      ownerEntityId: caller.entityId,
      source_signal_type: "PER_CONVERSATION_DRIFT",
      pattern_label: "RECURRING_CORRECTION_RECOMMENDATION_REVIEW",
      status: "PROPOSED",
    });
    const before = await prisma.otzarProposedPattern.findUnique({
      where: { pattern_id: pid },
    });
    await getMyTwin(caller);
    const after = await prisma.otzarProposedPattern.findUnique({
      where: { pattern_id: pid },
    });
    // All mutable lifecycle columns unchanged.
    expect(after?.status).toBe(before?.status);
    expect(after?.reviewed_at).toEqual(before?.reviewed_at);
    expect(after?.archived_at).toEqual(before?.archived_at);
    expect(after?.updated_at.getTime()).toBe(before?.updated_at.getTime());
  });

  it("getMyTwin does not create any Notification / Action rows", async () => {
    const caller = await loginPerson();
    await insertProposedPattern({
      ownerEntityId: caller.entityId,
      source_signal_type: "PER_CONVERSATION_DRIFT",
      pattern_label: "RECURRING_CORRECTION_RECOMMENDATION_REVIEW",
      status: "PROPOSED",
    });
    await getMyTwin(caller);
    const notifs = await prisma.notification.count({
      where: { recipient_entity_id: caller.entityId },
    });
    expect(notifs).toBe(0);
    const actions = await prisma.action.count({
      where: { source_entity_id: caller.entityId },
    });
    expect(actions).toBe(0);
  });
});
