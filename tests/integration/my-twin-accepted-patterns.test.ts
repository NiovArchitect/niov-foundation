// FILE: my-twin-accepted-patterns.test.ts (integration)
// PURPOSE: Section 1 Wave 6A — symbiotic advisory surface contract
//          coverage. Verifies the caller's OWN ACCEPTED
//          OtzarProposedPattern rows surface on the existing
//          GET /api/v1/otzar/my-twin response as
//          `accepted_patterns[]` per Founder Wave 6A clarification
//          (the owner sees the same symbiotic alignment context
//          their Twin sees). Verifies: empty when none; PROPOSED /
//          REJECTED / ARCHIVED excluded; cross-owner not visible;
//          bounded limit + reviewed_at DESC sort; SAFE projection
//          (closed-vocab fields + symbiotic advisory template only;
//          NEVER raw correction text, source IDs, conversation IDs,
//          occurrence counts, signal timestamps, owner_entity_id);
//          NO assembleContext touch; NO IntelligencePattern
//          mutation; NO audit emission added (getMyTwin remains
//          no-audit per Wave 2A design).
// CONNECTS TO:
//   - apps/api/src/routes/otzar.routes.ts (GET /api/v1/otzar/my-twin)
//   - apps/api/src/services/otzar/otzar.service.ts (getMyTwin)
//   - apps/api/src/services/otzar/proposed-pattern.service.ts
//     (listAcceptedPatternsForOwner; SYMBIOTIC_ADVISORY_NOTES)

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

const TEST_JWT_SECRET = "my-twin-accepted-patterns-test-secret";
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
  const ip = `10.108.${Math.floor(Math.random() * 200) + 1}.${
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
  archivedAt?: Date;
}): Promise<string> {
  const now = new Date();
  const safeSummaryByLabel: Record<string, string> = {
    RECURRING_CORRECTION_RECOMMENDATION_REVIEW:
      "Symbiotic test summary for recurring-correction recommendation.",
    STALE_CONTEXT_REFRESH_RECOMMENDED:
      "Symbiotic test summary for stale-context refresh recommendation.",
    CROSS_CONVERSATION_ALIGNMENT_RECOMMENDED:
      "Symbiotic test summary for cross-conversation alignment.",
  };
  const row = await prisma.otzarProposedPattern.create({
    data: {
      owner_entity_id: opts.ownerEntityId,
      source_signal_type: opts.source_signal_type,
      pattern_label: opts.pattern_label,
      safe_summary: safeSummaryByLabel[opts.pattern_label] ?? "test summary",
      confidence_label: "MEDIUM",
      status: opts.status,
      occurrence_count: 3,
      first_signal_at: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000),
      last_signal_at: now,
      reviewed_at: opts.reviewedAt ?? null,
      archived_at: opts.archivedAt ?? null,
    },
  });
  return row.pattern_id;
}

async function getMyTwin(
  caller: { token: string; ip: string } | null,
): Promise<{ statusCode: number; body: any; raw: string }> {
  const r = await app.inject({
    method: "GET",
    url: "/api/v1/otzar/my-twin",
    headers:
      caller === null ? {} : { authorization: `Bearer ${caller.token}` },
    ...(caller === null ? {} : { remoteAddress: caller.ip }),
  });
  return { statusCode: r.statusCode, body: r.json() as any, raw: r.body };
}

const FORBIDDEN_NO_LEAK_MARKERS = [
  "owner_entity_id",
  "occurrence_count",
  "first_signal_at",
  "last_signal_at",
  "proposed_at",
  "archived_at",
  "created_at",
  "updated_at",
  "raw_correction",
  "raw_transcript",
  "payload_summary",
  "payload_content",
  "storage_location",
  "content_hash",
  "secret_ref",
  "bridge_id",
];

function assertNoLeakInAcceptedPatterns(body: any): void {
  if (!body.twin || !body.twin.accepted_patterns) return;
  const accepted = JSON.stringify(body.twin.accepted_patterns);
  for (const marker of FORBIDDEN_NO_LEAK_MARKERS) {
    expect(accepted.toLowerCase()).not.toContain(marker.toLowerCase());
  }
}

describe("Section 1 Wave 6A — auth + backward-compat", () => {
  it("401 without bearer (existing route behavior preserved)", async () => {
    const r = await getMyTwin(null);
    expect(r.statusCode).toBe(401);
  });

  it("accepted_patterns is an empty array when caller has no ACCEPTED patterns", async () => {
    const caller = await loginPerson();
    const r = await getMyTwin(caller);
    expect(r.statusCode).toBe(200);
    expect(r.body.twin).toBeDefined();
    expect(Array.isArray(r.body.twin.accepted_patterns)).toBe(true);
    expect(r.body.twin.accepted_patterns).toEqual([]);
  });
});

describe("Section 1 Wave 6A — ACCEPTED patterns appear", () => {
  it("happy path: one ACCEPTED pattern shows with safe advisory projection + symbiotic note", async () => {
    const caller = await loginPerson();
    const reviewedAt = new Date(Date.now() - 60 * 1000);
    const patternId = await insertProposedPattern({
      ownerEntityId: caller.entityId,
      source_signal_type: "PER_CONVERSATION_DRIFT",
      pattern_label: "RECURRING_CORRECTION_RECOMMENDATION_REVIEW",
      status: "ACCEPTED",
      reviewedAt,
    });
    const r = await getMyTwin(caller);
    expect(r.statusCode).toBe(200);
    expect(r.body.twin.accepted_patterns).toHaveLength(1);
    const ap = r.body.twin.accepted_patterns[0];
    expect(ap.pattern_id).toBe(patternId);
    expect(ap.source_signal_type).toBe("PER_CONVERSATION_DRIFT");
    expect(ap.pattern_label).toBe("RECURRING_CORRECTION_RECOMMENDATION_REVIEW");
    expect(ap.confidence_label).toBe("MEDIUM");
    expect(typeof ap.safe_summary).toBe("string");
    expect(typeof ap.accepted_at).toBe("string");
    // Symbiotic advisory_note text must include the alignment
    // language Founder Wave 6A specified.
    expect(typeof ap.advisory_note).toBe("string");
    expect(ap.advisory_note).toMatch(/Twin/i);
    expect(ap.advisory_note).toMatch(/alignment/i);
    // Forbidden language (Founder Wave 6A clarification) MUST NOT
    // appear in the advisory copy.
    expect(ap.advisory_note.toLowerCase()).not.toContain("score");
    expect(ap.advisory_note.toLowerCase()).not.toContain("surveillance");
    expect(ap.advisory_note.toLowerCase()).not.toContain("manager");
    expect(ap.advisory_note.toLowerCase()).not.toContain("compliance");
    expect(ap.advisory_note.toLowerCase()).not.toContain("discipline");
  });

  it("each pattern_label maps to its symbiotic template", async () => {
    const caller = await loginPerson();
    const ts = Date.now();
    await insertProposedPattern({
      ownerEntityId: caller.entityId,
      source_signal_type: "PER_CONVERSATION_DRIFT",
      pattern_label: "RECURRING_CORRECTION_RECOMMENDATION_REVIEW",
      status: "ACCEPTED",
      reviewedAt: new Date(ts - 3000),
    });
    await insertProposedPattern({
      ownerEntityId: caller.entityId,
      source_signal_type: "WALLET_STALE_CONTEXT",
      pattern_label: "STALE_CONTEXT_REFRESH_RECOMMENDED",
      status: "ACCEPTED",
      reviewedAt: new Date(ts - 2000),
    });
    await insertProposedPattern({
      ownerEntityId: caller.entityId,
      source_signal_type: "CROSS_CONVERSATION_ROLLUP",
      pattern_label: "CROSS_CONVERSATION_ALIGNMENT_RECOMMENDED",
      status: "ACCEPTED",
      reviewedAt: new Date(ts - 1000),
    });
    const r = await getMyTwin(caller);
    expect(r.statusCode).toBe(200);
    expect(r.body.twin.accepted_patterns).toHaveLength(3);
    const notesByLabel = new Map<string, string>();
    for (const ap of r.body.twin.accepted_patterns) {
      notesByLabel.set(ap.pattern_label, ap.advisory_note);
    }
    // Each label has a distinct symbiotic copy (no template collision).
    expect(
      notesByLabel.get("RECURRING_CORRECTION_RECOMMENDATION_REVIEW"),
    ).not.toBe(notesByLabel.get("STALE_CONTEXT_REFRESH_RECOMMENDED"));
    expect(
      notesByLabel.get("STALE_CONTEXT_REFRESH_RECOMMENDED"),
    ).not.toBe(notesByLabel.get("CROSS_CONVERSATION_ALIGNMENT_RECOMMENDED"));
    // Stale-context copy explicitly mentions memory; rollup copy
    // mentions conversations.
    expect(
      notesByLabel
        .get("STALE_CONTEXT_REFRESH_RECOMMENDED")!
        .toLowerCase(),
    ).toContain("memory");
    expect(
      notesByLabel
        .get("CROSS_CONVERSATION_ALIGNMENT_RECOMMENDED")!
        .toLowerCase(),
    ).toContain("conversations");
  });
});

describe("Section 1 Wave 6A — lifecycle status filtering", () => {
  it("PROPOSED patterns are NOT shown", async () => {
    const caller = await loginPerson();
    await insertProposedPattern({
      ownerEntityId: caller.entityId,
      source_signal_type: "PER_CONVERSATION_DRIFT",
      pattern_label: "RECURRING_CORRECTION_RECOMMENDATION_REVIEW",
      status: "PROPOSED",
    });
    const r = await getMyTwin(caller);
    expect(r.body.twin.accepted_patterns).toEqual([]);
  });

  it("REJECTED patterns are NOT shown", async () => {
    const caller = await loginPerson();
    await insertProposedPattern({
      ownerEntityId: caller.entityId,
      source_signal_type: "PER_CONVERSATION_DRIFT",
      pattern_label: "RECURRING_CORRECTION_RECOMMENDATION_REVIEW",
      status: "REJECTED",
      reviewedAt: new Date(),
    });
    const r = await getMyTwin(caller);
    expect(r.body.twin.accepted_patterns).toEqual([]);
  });

  it("ARCHIVED patterns are NOT shown", async () => {
    const caller = await loginPerson();
    await insertProposedPattern({
      ownerEntityId: caller.entityId,
      source_signal_type: "PER_CONVERSATION_DRIFT",
      pattern_label: "RECURRING_CORRECTION_RECOMMENDATION_REVIEW",
      status: "ARCHIVED",
      reviewedAt: new Date(),
      archivedAt: new Date(),
    });
    const r = await getMyTwin(caller);
    expect(r.body.twin.accepted_patterns).toEqual([]);
  });
});

describe("Section 1 Wave 6A — cross-owner isolation (RULE 0)", () => {
  it("Caller A cannot see Caller B's ACCEPTED patterns on their own My Twin", async () => {
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
    expect(rA.body.twin.accepted_patterns).toEqual([]);
    // And the raw payload must not contain B's pattern_id even as
    // an incidental substring.
    expect(rA.raw).not.toContain(bPatternId);
  });
});

describe("Section 1 Wave 6A — bounded + deterministic", () => {
  it("returns at most 5 patterns (the v1 default), sorted by reviewed_at DESC", async () => {
    const caller = await loginPerson();
    const ts = Date.now();
    const expectedNewestFirst: string[] = [];
    for (let i = 0; i < 7; i++) {
      const pid = await insertProposedPattern({
        ownerEntityId: caller.entityId,
        source_signal_type: "PER_CONVERSATION_DRIFT",
        pattern_label: "RECURRING_CORRECTION_RECOMMENDATION_REVIEW",
        status: "ACCEPTED",
        reviewedAt: new Date(ts - (7 - i) * 60_000),
      });
      // ts - (7 - i) * 60_000 → newest is the last loop iteration.
      expectedNewestFirst.unshift(pid);
    }
    const r = await getMyTwin(caller);
    expect(r.statusCode).toBe(200);
    expect(r.body.twin.accepted_patterns).toHaveLength(5);
    const returnedIds = r.body.twin.accepted_patterns.map(
      (ap: any) => ap.pattern_id,
    );
    // The 5 newest reviewed_at rows should appear in DESC order.
    expect(returnedIds).toEqual(expectedNewestFirst.slice(0, 5));
  });
});

describe("Section 1 Wave 6A — no-leak invariants", () => {
  it("response does NOT include owner_entity_id, occurrence_count, signal timestamps, or lifecycle internals", async () => {
    const caller = await loginPerson();
    await insertProposedPattern({
      ownerEntityId: caller.entityId,
      source_signal_type: "PER_CONVERSATION_DRIFT",
      pattern_label: "RECURRING_CORRECTION_RECOMMENDATION_REVIEW",
      status: "ACCEPTED",
      reviewedAt: new Date(),
    });
    const r = await getMyTwin(caller);
    assertNoLeakInAcceptedPatterns(r.body);
  });

  it("MyTwin response shape stays backward-compatible (Wave 2A fields all present)", async () => {
    const caller = await loginPerson();
    const r = await getMyTwin(caller);
    expect(r.statusCode).toBe(200);
    // Wave 2A baseline fields must still appear:
    expect(r.body.twin).toHaveProperty("twin_id");
    expect(r.body.twin).toHaveProperty("autonomy_mode");
    expect(r.body.twin).toHaveProperty("skills");
    expect(r.body.twin).toHaveProperty("role_scope_profile");
    expect(r.body).toHaveProperty("has_multiple_twins");
    expect(r.body).toHaveProperty("twin_count");
  });
});

describe("Section 1 Wave 6A — no side effects", () => {
  it("getMyTwin call does NOT mutate OtzarProposedPattern rows", async () => {
    const caller = await loginPerson();
    const patternId = await insertProposedPattern({
      ownerEntityId: caller.entityId,
      source_signal_type: "PER_CONVERSATION_DRIFT",
      pattern_label: "RECURRING_CORRECTION_RECOMMENDATION_REVIEW",
      status: "ACCEPTED",
      reviewedAt: new Date(),
    });
    const before = await prisma.otzarProposedPattern.findUnique({
      where: { pattern_id: patternId },
    });
    await getMyTwin(caller);
    await getMyTwin(caller);
    await getMyTwin(caller);
    const after = await prisma.otzarProposedPattern.findUnique({
      where: { pattern_id: patternId },
    });
    expect(after).not.toBeNull();
    expect(after!.status).toBe(before!.status);
    expect(after!.reviewed_at?.toISOString()).toBe(
      before!.reviewed_at?.toISOString(),
    );
    expect(after!.archived_at).toBeNull();
  });

  it("getMyTwin call does NOT mutate the existing org-scoped IntelligencePattern table", async () => {
    const caller = await loginPerson();
    await insertProposedPattern({
      ownerEntityId: caller.entityId,
      source_signal_type: "PER_CONVERSATION_DRIFT",
      pattern_label: "RECURRING_CORRECTION_RECOMMENDATION_REVIEW",
      status: "ACCEPTED",
      reviewedAt: new Date(),
    });
    const before = await prisma.intelligencePattern.count();
    await getMyTwin(caller);
    const after = await prisma.intelligencePattern.count();
    expect(after).toBe(before);
  });

  it("getMyTwin call does NOT create MemoryCapsule / Action / OtzarConversation rows", async () => {
    const caller = await loginPerson();
    await insertProposedPattern({
      ownerEntityId: caller.entityId,
      source_signal_type: "WALLET_STALE_CONTEXT",
      pattern_label: "STALE_CONTEXT_REFRESH_RECOMMENDED",
      status: "ACCEPTED",
      reviewedAt: new Date(),
    });
    const before = {
      capsules: await prisma.memoryCapsule.count(),
      actions: await prisma.action.count(),
      convos: await prisma.otzarConversation.count(),
      attempts: await prisma.actionAttempt.count(),
    };
    await getMyTwin(caller);
    const after = {
      capsules: await prisma.memoryCapsule.count(),
      actions: await prisma.action.count(),
      convos: await prisma.otzarConversation.count(),
      attempts: await prisma.actionAttempt.count(),
    };
    expect(after).toEqual(before);
  });
});

describe("Section 1 Wave 6A — audit posture preserved", () => {
  it("getMyTwin does NOT emit a new audit literal mentioning the advisory surface", async () => {
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
      expect(row.event_type).not.toMatch(/ACCEPTED_PATTERN/);
      expect(row.event_type).not.toMatch(/ADVISORY/);
      expect(row.event_type).not.toMatch(/MY_TWIN_/);
      const detailsStr = JSON.stringify(row.details);
      expect(detailsStr).not.toContain("ACCEPTED_PATTERN_VIEWED");
      expect(detailsStr).not.toContain("MY_TWIN_ADVISORY");
    }
  });
});
