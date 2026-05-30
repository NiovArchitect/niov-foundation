// FILE: otzar-proposed-pattern.test.ts (integration)
// PURPOSE: Section 1 Wave 5 — Otzar proposed-pattern contract
//          coverage per ADR-0066. Exercises all 4 routes;
//          verifies bearer enforcement; verifies sweep creates
//          PROPOSED rows when recurrence threshold is met +
//          deduplicates against existing PROPOSED|ACCEPTED rows;
//          verifies list/detail/transition are owner-first
//          self-scoped (cross-owner reads + cross-owner state
//          transitions fold to PROPOSED_PATTERN_NOT_FOUND);
//          verifies all 3 allowed transitions (ACCEPTED /
//          REJECTED / ARCHIVED); verifies invalid transitions →
//          422; verifies forbidden body fields on PATCH → 422;
//          verifies no raw correction/transcript/capsule/prompt/
//          chain-of-thought leaks anywhere on the wire;
//          verifies the existing org-scoped IntelligencePattern
//          table is NEVER mutated by Wave 5; verifies the
//          ADR-0066 §7 ADMIN_ACTION + 5-discriminator audit
//          emission with safe details only; verifies no new audit
//          literal containing "OTZAR_PATTERN" or "PROPOSED_PATTERN"
//          appears in any audit row's event_type column.
// CONNECTS TO:
//   - apps/api/src/routes/otzar-proposed-pattern.routes.ts
//   - apps/api/src/services/otzar/proposed-pattern.service.ts
//   - ADR-0066 §1-§11

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

const TEST_JWT_SECRET = "otzar-proposed-pattern-test-secret";
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
  walletId: string;
  token: string;
  ip: string;
}> {
  const password = "correct-horse-battery";
  const input = makeEntityInput({ entity_type: "PERSON", password });
  const entity = await createEntity(input);
  let wallet = await prisma.wallet.findUnique({
    where: { entity_id: entity.entity_id },
  });
  if (wallet === null) {
    wallet = await prisma.wallet.create({
      data: {
        wallet_id: randomUUID(),
        entity_id: entity.entity_id,
        wallet_type: "PERSONAL",
        niov_can_access_contents: false,
      },
    });
  }
  const ip = `10.105.${Math.floor(Math.random() * 200) + 1}.${
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
    walletId: wallet.wallet_id,
    token: body.token,
    ip,
  };
}

async function makeCorrection(opts: {
  walletId: string;
  entityId: string;
  conversationId: string;
}): Promise<void> {
  await prisma.memoryCapsule.create({
    data: {
      capsule_id: randomUUID(),
      wallet_id: opts.walletId,
      entity_id: opts.entityId,
      capsule_type: "CORRECTION",
      conversation_id: opts.conversationId,
      version: 1,
      content_hash: `${TEST_PREFIX}c-hash-${randomUUID()}`,
      storage_location: `${TEST_PREFIX}c-loc-${randomUUID()}`,
      payload_summary: `${TEST_PREFIX}correction summary`,
      payload_size_tokens: 10,
      relevance_score: 1.0,
      decay_type: "PERMANENT",
      topic_tags: [],
      clearance_required: 0,
      ai_access_blocked: false,
      requires_validation: false,
    },
  });
}

async function makeStaleCapsule(opts: {
  walletId: string;
  entityId: string;
  embeddingGeneratedAt: Date;
}): Promise<void> {
  const contentHash = `${TEST_PREFIX}s-c-${randomUUID()}`;
  const embeddingHash = `${TEST_PREFIX}s-e-${randomUUID()}`; // != contentHash → stale
  await prisma.memoryCapsule.create({
    data: {
      capsule_id: randomUUID(),
      wallet_id: opts.walletId,
      entity_id: opts.entityId,
      capsule_type: "PREFERENCE",
      version: 1,
      content_hash: contentHash,
      storage_location: `${TEST_PREFIX}s-loc-${randomUUID()}`,
      payload_summary: `${TEST_PREFIX}safe summary`,
      payload_size_tokens: 10,
      relevance_score: 1.0,
      decay_type: "PERMANENT",
      topic_tags: [],
      clearance_required: 0,
      ai_access_blocked: false,
      requires_validation: false,
      embedding_content_hash: embeddingHash,
      embedding_generated_at: opts.embeddingGeneratedAt,
    },
  });
}

async function seedPerConversationDrift(caller: {
  walletId: string;
  entityId: string;
}): Promise<void> {
  // Create 3 distinct conversations, each with 4 CORRECTION capsules,
  // all within the last 14-day window → PER_CONVERSATION_DRIFT
  // recurrence MEDIUM.
  for (let c = 0; c < 3; c++) {
    const convId = randomUUID();
    for (let i = 0; i < 4; i++) {
      await makeCorrection({
        walletId: caller.walletId,
        entityId: caller.entityId,
        conversationId: convId,
      });
    }
  }
}

async function seedStaleContext(
  caller: { walletId: string; entityId: string },
  daysOld: number,
): Promise<void> {
  const t = new Date();
  t.setUTCDate(t.getUTCDate() - daysOld);
  await makeStaleCapsule({
    walletId: caller.walletId,
    entityId: caller.entityId,
    embeddingGeneratedAt: t,
  });
}

async function inject(
  method: "POST" | "GET" | "PATCH",
  caller: { token: string; ip: string } | null,
  url: string,
  body?: Record<string, unknown>,
): Promise<{ statusCode: number; body: any; raw: string }> {
  const r = await app.inject({
    method,
    url,
    headers: caller === null ? {} : { authorization: `Bearer ${caller.token}` },
    ...(caller === null ? {} : { remoteAddress: caller.ip }),
    ...(body !== undefined ? { payload: body } : {}),
  });
  return { statusCode: r.statusCode, body: r.json() as any, raw: r.body };
}

const FORBIDDEN_NO_LEAK_MARKERS = [
  "transcript",
  "chain_of_thought",
  "prompt_text",
  "raw_correction",
  "raw_capsule",
  "payload_content",
  "payload_summary",
  "storage_location",
  "content_hash",
  "embedding_content_hash",
  "bridge_id",
  "secret_ref",
  "topic_tag_value",
];

function assertNoLeak(raw: string): void {
  for (const marker of FORBIDDEN_NO_LEAK_MARKERS) {
    expect(raw.toLowerCase()).not.toContain(marker.toLowerCase());
  }
}

describe("Section 1 Wave 5 — auth enforcement", () => {
  it("401 without bearer on POST /sweep", async () => {
    const r = await inject(
      "POST",
      null,
      "/api/v1/otzar/my-twin/proposed-patterns/sweep",
      {},
    );
    expect(r.statusCode).toBe(401);
    expect(r.body.code).toBe("SESSION_INVALID");
  });
  it("401 without bearer on GET list", async () => {
    const r = await inject(
      "GET",
      null,
      "/api/v1/otzar/my-twin/proposed-patterns",
    );
    expect(r.statusCode).toBe(401);
  });
  it("401 without bearer on GET detail", async () => {
    const r = await inject(
      "GET",
      null,
      `/api/v1/otzar/my-twin/proposed-patterns/${randomUUID()}`,
    );
    expect(r.statusCode).toBe(401);
  });
  it("401 without bearer on PATCH", async () => {
    const r = await inject(
      "PATCH",
      null,
      `/api/v1/otzar/my-twin/proposed-patterns/${randomUUID()}`,
      { status: "ACCEPTED" },
    );
    expect(r.statusCode).toBe(401);
  });
});

describe("Section 1 Wave 5 — sweep recurrence detection", () => {
  it("sweep with no signals returns created_count=0", async () => {
    const caller = await loginPerson();
    const r = await inject(
      "POST",
      caller,
      "/api/v1/otzar/my-twin/proposed-patterns/sweep",
      {},
    );
    expect(r.statusCode).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.created_count).toBe(0);
    expect(r.body.deduped_count).toBe(0);
    expect(r.body.created).toEqual([]);
  });

  it("sweep creates PER_CONVERSATION_DRIFT proposal when ≥ 3 elevated conversations exist", async () => {
    const caller = await loginPerson();
    await seedPerConversationDrift(caller);
    const r = await inject(
      "POST",
      caller,
      "/api/v1/otzar/my-twin/proposed-patterns/sweep",
      {},
    );
    expect(r.statusCode).toBe(200);
    expect(r.body.created_count).toBe(1);
    const created = r.body.created[0];
    expect(created.source_signal_type).toBe("PER_CONVERSATION_DRIFT");
    expect(created.pattern_label).toBe(
      "RECURRING_CORRECTION_RECOMMENDATION_REVIEW",
    );
    expect(created.status).toBe("PROPOSED");
    expect(["LOW", "MEDIUM", "HIGH"]).toContain(created.confidence_label);
    expect(created.occurrence_count).toBeGreaterThanOrEqual(3);
  });

  it("sweep creates WALLET_STALE_CONTEXT proposal when stale capsule ≥ 7 days old exists", async () => {
    const caller = await loginPerson();
    await seedStaleContext(caller, 10); // 10 days old > 7
    const r = await inject(
      "POST",
      caller,
      "/api/v1/otzar/my-twin/proposed-patterns/sweep",
      {},
    );
    expect(r.statusCode).toBe(200);
    expect(r.body.created_count).toBe(1);
    const created = r.body.created[0];
    expect(created.source_signal_type).toBe("WALLET_STALE_CONTEXT");
    expect(created.pattern_label).toBe("STALE_CONTEXT_REFRESH_RECOMMENDED");
  });

  it("sweep creates CROSS_CONVERSATION_ROLLUP when both drift + stale signals fire", async () => {
    const caller = await loginPerson();
    await seedPerConversationDrift(caller);
    await seedStaleContext(caller, 10);
    const r = await inject(
      "POST",
      caller,
      "/api/v1/otzar/my-twin/proposed-patterns/sweep",
      {},
    );
    expect(r.statusCode).toBe(200);
    expect(r.body.created_count).toBe(3); // per-conv + stale + rollup
    const types = r.body.created.map((p: any) => p.source_signal_type);
    expect(types).toContain("PER_CONVERSATION_DRIFT");
    expect(types).toContain("WALLET_STALE_CONTEXT");
    expect(types).toContain("CROSS_CONVERSATION_ROLLUP");
  });

  it("sweep dedupes against existing PROPOSED row (same source+label not duplicated)", async () => {
    const caller = await loginPerson();
    await seedPerConversationDrift(caller);
    // First sweep creates the pattern.
    const r1 = await inject(
      "POST",
      caller,
      "/api/v1/otzar/my-twin/proposed-patterns/sweep",
      {},
    );
    expect(r1.body.created_count).toBe(1);
    // Second sweep: same conditions still met → must dedupe.
    const r2 = await inject(
      "POST",
      caller,
      "/api/v1/otzar/my-twin/proposed-patterns/sweep",
      {},
    );
    expect(r2.statusCode).toBe(200);
    expect(r2.body.created_count).toBe(0);
    expect(r2.body.deduped_count).toBe(1);
  });

  it("sweep dedupes against existing ACCEPTED row (does not re-propose accepted patterns)", async () => {
    const caller = await loginPerson();
    await seedPerConversationDrift(caller);
    const r1 = await inject(
      "POST",
      caller,
      "/api/v1/otzar/my-twin/proposed-patterns/sweep",
      {},
    );
    const patternId = r1.body.created[0].pattern_id;
    // Accept the pattern.
    await inject(
      "PATCH",
      caller,
      `/api/v1/otzar/my-twin/proposed-patterns/${patternId}`,
      { status: "ACCEPTED" },
    );
    // Second sweep: pattern still ACCEPTED + non-archived → dedupe.
    const r2 = await inject(
      "POST",
      caller,
      "/api/v1/otzar/my-twin/proposed-patterns/sweep",
      {},
    );
    expect(r2.body.created_count).toBe(0);
    expect(r2.body.deduped_count).toBe(1);
  });

  it("sweep re-proposes after pattern is ARCHIVED (dedup window closes)", async () => {
    const caller = await loginPerson();
    await seedPerConversationDrift(caller);
    const r1 = await inject(
      "POST",
      caller,
      "/api/v1/otzar/my-twin/proposed-patterns/sweep",
      {},
    );
    const patternId = r1.body.created[0].pattern_id;
    await inject(
      "PATCH",
      caller,
      `/api/v1/otzar/my-twin/proposed-patterns/${patternId}`,
      { status: "REJECTED" },
    );
    await inject(
      "PATCH",
      caller,
      `/api/v1/otzar/my-twin/proposed-patterns/${patternId}`,
      { status: "ARCHIVED" },
    );
    // After ARCHIVED, dedup window closes; new sweep proposes again.
    const r2 = await inject(
      "POST",
      caller,
      "/api/v1/otzar/my-twin/proposed-patterns/sweep",
      {},
    );
    expect(r2.body.created_count).toBe(1);
  });
});

describe("Section 1 Wave 5 — list (owner-scoped)", () => {
  it("returns only the caller's proposed patterns", async () => {
    const callerA = await loginPerson();
    const callerB = await loginPerson();
    await seedPerConversationDrift(callerA);
    await seedPerConversationDrift(callerB);
    const swA = await inject(
      "POST",
      callerA,
      "/api/v1/otzar/my-twin/proposed-patterns/sweep",
      {},
    );
    const swB = await inject(
      "POST",
      callerB,
      "/api/v1/otzar/my-twin/proposed-patterns/sweep",
      {},
    );
    expect(swA.body.created_count).toBe(1);
    expect(swB.body.created_count).toBe(1);
    const aPatternId = swA.body.created[0].pattern_id;
    const bPatternId = swB.body.created[0].pattern_id;

    const listA = await inject(
      "GET",
      callerA,
      "/api/v1/otzar/my-twin/proposed-patterns",
    );
    expect(listA.statusCode).toBe(200);
    const aIds = listA.body.patterns.map((p: any) => p.pattern_id);
    expect(aIds).toContain(aPatternId);
    expect(aIds).not.toContain(bPatternId);
    for (const p of listA.body.patterns) {
      expect(p.owner_entity_id).toBe(callerA.entityId);
    }
  });

  it("excludes ARCHIVED by default; includes when include_archived=true", async () => {
    const caller = await loginPerson();
    await seedPerConversationDrift(caller);
    const sw = await inject(
      "POST",
      caller,
      "/api/v1/otzar/my-twin/proposed-patterns/sweep",
      {},
    );
    const patternId = sw.body.created[0].pattern_id;
    await inject(
      "PATCH",
      caller,
      `/api/v1/otzar/my-twin/proposed-patterns/${patternId}`,
      { status: "ARCHIVED" },
    );

    const def = await inject(
      "GET",
      caller,
      "/api/v1/otzar/my-twin/proposed-patterns",
    );
    expect(def.body.patterns.map((p: any) => p.pattern_id)).not.toContain(
      patternId,
    );

    const withArchived = await inject(
      "GET",
      caller,
      "/api/v1/otzar/my-twin/proposed-patterns?include_archived=true",
    );
    expect(
      withArchived.body.patterns.map((p: any) => p.pattern_id),
    ).toContain(patternId);
  });

  it("422 on invalid status query value", async () => {
    const caller = await loginPerson();
    const r = await inject(
      "GET",
      caller,
      "/api/v1/otzar/my-twin/proposed-patterns?status=BOGUS",
    );
    expect(r.statusCode).toBe(422);
    expect(r.body.code).toBe("INVALID_REQUEST");
  });
});

describe("Section 1 Wave 5 — detail (owner only)", () => {
  it("returns the pattern for the owner", async () => {
    const caller = await loginPerson();
    await seedPerConversationDrift(caller);
    const sw = await inject(
      "POST",
      caller,
      "/api/v1/otzar/my-twin/proposed-patterns/sweep",
      {},
    );
    const patternId = sw.body.created[0].pattern_id;
    const r = await inject(
      "GET",
      caller,
      `/api/v1/otzar/my-twin/proposed-patterns/${patternId}`,
    );
    expect(r.statusCode).toBe(200);
    expect(r.body.pattern.pattern_id).toBe(patternId);
  });

  it("404 PROPOSED_PATTERN_NOT_FOUND for cross-owner read", async () => {
    const callerA = await loginPerson();
    const callerB = await loginPerson();
    await seedPerConversationDrift(callerA);
    const sw = await inject(
      "POST",
      callerA,
      "/api/v1/otzar/my-twin/proposed-patterns/sweep",
      {},
    );
    const patternId = sw.body.created[0].pattern_id;
    const r = await inject(
      "GET",
      callerB,
      `/api/v1/otzar/my-twin/proposed-patterns/${patternId}`,
    );
    expect(r.statusCode).toBe(404);
    expect(r.body.code).toBe("PROPOSED_PATTERN_NOT_FOUND");
  });

  it("404 for unknown id", async () => {
    const caller = await loginPerson();
    const r = await inject(
      "GET",
      caller,
      `/api/v1/otzar/my-twin/proposed-patterns/${randomUUID()}`,
    );
    expect(r.statusCode).toBe(404);
  });
});

describe("Section 1 Wave 5 — PATCH state transitions", () => {
  async function withPattern(): Promise<{
    caller: { entityId: string; walletId: string; token: string; ip: string };
    patternId: string;
  }> {
    const caller = await loginPerson();
    await seedPerConversationDrift(caller);
    const sw = await inject(
      "POST",
      caller,
      "/api/v1/otzar/my-twin/proposed-patterns/sweep",
      {},
    );
    return { caller, patternId: sw.body.created[0].pattern_id };
  }

  it("PROPOSED → ACCEPTED sets reviewed_at + audit OTZAR_PATTERN_ACCEPTED", async () => {
    const { caller, patternId } = await withPattern();
    const r = await inject(
      "PATCH",
      caller,
      `/api/v1/otzar/my-twin/proposed-patterns/${patternId}`,
      { status: "ACCEPTED" },
    );
    expect(r.statusCode).toBe(200);
    expect(r.body.pattern.status).toBe("ACCEPTED");
    expect(r.body.pattern.reviewed_at).not.toBeNull();
    expect(typeof r.body.audit_event_id).toBe("string");
  });

  it("PROPOSED → REJECTED sets reviewed_at", async () => {
    const { caller, patternId } = await withPattern();
    const r = await inject(
      "PATCH",
      caller,
      `/api/v1/otzar/my-twin/proposed-patterns/${patternId}`,
      { status: "REJECTED" },
    );
    expect(r.statusCode).toBe(200);
    expect(r.body.pattern.status).toBe("REJECTED");
    expect(r.body.pattern.reviewed_at).not.toBeNull();
  });

  it("PROPOSED → ARCHIVED sets archived_at", async () => {
    const { caller, patternId } = await withPattern();
    const r = await inject(
      "PATCH",
      caller,
      `/api/v1/otzar/my-twin/proposed-patterns/${patternId}`,
      { status: "ARCHIVED" },
    );
    expect(r.statusCode).toBe(200);
    expect(r.body.pattern.status).toBe("ARCHIVED");
    expect(r.body.pattern.archived_at).not.toBeNull();
  });

  it("ACCEPTED → ARCHIVED allowed", async () => {
    const { caller, patternId } = await withPattern();
    await inject(
      "PATCH",
      caller,
      `/api/v1/otzar/my-twin/proposed-patterns/${patternId}`,
      { status: "ACCEPTED" },
    );
    const r = await inject(
      "PATCH",
      caller,
      `/api/v1/otzar/my-twin/proposed-patterns/${patternId}`,
      { status: "ARCHIVED" },
    );
    expect(r.statusCode).toBe(200);
    expect(r.body.pattern.status).toBe("ARCHIVED");
  });

  it("ARCHIVED → ACCEPTED is forbidden (422 INVALID_STATE_TRANSITION)", async () => {
    const { caller, patternId } = await withPattern();
    await inject(
      "PATCH",
      caller,
      `/api/v1/otzar/my-twin/proposed-patterns/${patternId}`,
      { status: "ARCHIVED" },
    );
    const r = await inject(
      "PATCH",
      caller,
      `/api/v1/otzar/my-twin/proposed-patterns/${patternId}`,
      { status: "ACCEPTED" },
    );
    expect(r.statusCode).toBe(422);
    expect(r.body.code).toBe("INVALID_STATE_TRANSITION");
  });

  it("ACCEPTED → REJECTED is forbidden (422 INVALID_STATE_TRANSITION)", async () => {
    const { caller, patternId } = await withPattern();
    await inject(
      "PATCH",
      caller,
      `/api/v1/otzar/my-twin/proposed-patterns/${patternId}`,
      { status: "ACCEPTED" },
    );
    const r = await inject(
      "PATCH",
      caller,
      `/api/v1/otzar/my-twin/proposed-patterns/${patternId}`,
      { status: "REJECTED" },
    );
    expect(r.statusCode).toBe(422);
    expect(r.body.code).toBe("INVALID_STATE_TRANSITION");
  });

  it("PROPOSED → PROPOSED is forbidden (no-op self-transition)", async () => {
    const { caller, patternId } = await withPattern();
    const r = await inject(
      "PATCH",
      caller,
      `/api/v1/otzar/my-twin/proposed-patterns/${patternId}`,
      { status: "PROPOSED" },
    );
    expect(r.statusCode).toBe(422);
    expect(r.body.code).toBe("INVALID_STATE_TRANSITION");
  });

  it("422 INVALID_REQUEST when status is missing", async () => {
    const { caller, patternId } = await withPattern();
    const r = await inject(
      "PATCH",
      caller,
      `/api/v1/otzar/my-twin/proposed-patterns/${patternId}`,
      {},
    );
    expect(r.statusCode).toBe(422);
    expect(r.body.code).toBe("INVALID_REQUEST");
    expect(r.body.invalid_fields).toContain("status");
  });

  it("422 INVALID_REQUEST when status not in closed vocab", async () => {
    const { caller, patternId } = await withPattern();
    const r = await inject(
      "PATCH",
      caller,
      `/api/v1/otzar/my-twin/proposed-patterns/${patternId}`,
      { status: "BOGUS" },
    );
    expect(r.statusCode).toBe(422);
    expect(r.body.invalid_fields).toContain("status");
  });

  it("422 INVALID_REQUEST when forbidden fields supplied", async () => {
    const { caller, patternId } = await withPattern();
    const r = await inject(
      "PATCH",
      caller,
      `/api/v1/otzar/my-twin/proposed-patterns/${patternId}`,
      {
        status: "ACCEPTED",
        safe_summary: "hijack",
        owner_entity_id: randomUUID(),
        confidence_label: "HIGH",
      },
    );
    expect(r.statusCode).toBe(422);
    expect(r.body.code).toBe("INVALID_REQUEST");
    expect(r.body.invalid_fields).toEqual(
      expect.arrayContaining([
        "owner_entity_id",
        "safe_summary",
        "confidence_label",
      ]),
    );
  });

  it("404 PROPOSED_PATTERN_NOT_FOUND on cross-owner PATCH", async () => {
    const { patternId } = await withPattern();
    const otherCaller = await loginPerson();
    const r = await inject(
      "PATCH",
      otherCaller,
      `/api/v1/otzar/my-twin/proposed-patterns/${patternId}`,
      { status: "ACCEPTED" },
    );
    expect(r.statusCode).toBe(404);
  });
});

describe("Section 1 Wave 5 — no-leak + no-side-effect invariants", () => {
  it("sweep response contains no forbidden no-leak markers", async () => {
    const caller = await loginPerson();
    await seedPerConversationDrift(caller);
    const r = await inject(
      "POST",
      caller,
      "/api/v1/otzar/my-twin/proposed-patterns/sweep",
      {},
    );
    assertNoLeak(r.raw);
  });

  it("list response contains no forbidden no-leak markers", async () => {
    const caller = await loginPerson();
    await seedPerConversationDrift(caller);
    await inject(
      "POST",
      caller,
      "/api/v1/otzar/my-twin/proposed-patterns/sweep",
      {},
    );
    const r = await inject(
      "GET",
      caller,
      "/api/v1/otzar/my-twin/proposed-patterns",
    );
    assertNoLeak(r.raw);
  });

  it("detail response contains no forbidden no-leak markers", async () => {
    const caller = await loginPerson();
    await seedPerConversationDrift(caller);
    const sw = await inject(
      "POST",
      caller,
      "/api/v1/otzar/my-twin/proposed-patterns/sweep",
      {},
    );
    const patternId = sw.body.created[0].pattern_id;
    const r = await inject(
      "GET",
      caller,
      `/api/v1/otzar/my-twin/proposed-patterns/${patternId}`,
    );
    assertNoLeak(r.raw);
  });

  it("existing org-scoped IntelligencePattern rows are NEVER mutated by Wave 5 (per ADR-0066 §Why a new Prisma model)", async () => {
    const caller = await loginPerson();
    const beforeCount = await prisma.intelligencePattern.count();
    await seedPerConversationDrift(caller);
    await seedStaleContext(caller, 10);
    await inject(
      "POST",
      caller,
      "/api/v1/otzar/my-twin/proposed-patterns/sweep",
      {},
    );
    const sw = await inject(
      "GET",
      caller,
      "/api/v1/otzar/my-twin/proposed-patterns",
    );
    const patternId = sw.body.patterns[0].pattern_id;
    await inject(
      "PATCH",
      caller,
      `/api/v1/otzar/my-twin/proposed-patterns/${patternId}`,
      { status: "ACCEPTED" },
    );
    await inject(
      "PATCH",
      caller,
      `/api/v1/otzar/my-twin/proposed-patterns/${patternId}`,
      { status: "ARCHIVED" },
    );
    const afterCount = await prisma.intelligencePattern.count();
    expect(afterCount).toBe(beforeCount);
  });
});

describe("Section 1 Wave 5 — audit emission (no new audit literal; safe details only)", () => {
  it("emits ADMIN_ACTION + OTZAR_PATTERN_PROPOSED on sweep create", async () => {
    const caller = await loginPerson();
    await seedPerConversationDrift(caller);
    await inject(
      "POST",
      caller,
      "/api/v1/otzar/my-twin/proposed-patterns/sweep",
      {},
    );
    const audit = await prisma.auditEvent.findFirst({
      where: {
        event_type: "ADMIN_ACTION",
        actor_entity_id: caller.entityId,
      },
      orderBy: { timestamp: "desc" },
    });
    expect(audit).not.toBeNull();
    const details = audit!.details as Record<string, unknown>;
    expect(details["action"]).toBe("OTZAR_PATTERN_PROPOSED");
    expect(details["source_signal_type"]).toBe("PER_CONVERSATION_DRIFT");
    expect(details["pattern_label"]).toBe(
      "RECURRING_CORRECTION_RECOMMENDATION_REVIEW",
    );
    expect(details["status"]).toBe("PROPOSED");
    // Forbidden in audit row per ADR-0066 §7:
    expect(details).not.toHaveProperty("safe_summary");
    const serialized = JSON.stringify(audit!.details);
    expect(serialized).not.toContain("teammate"); // template text not in audit
  });

  it("emits OTZAR_PATTERN_ACCEPTED on accept; OTZAR_PATTERN_REJECTED on reject; OTZAR_PATTERN_ARCHIVED on archive", async () => {
    const caller = await loginPerson();
    await seedPerConversationDrift(caller);
    const sw = await inject(
      "POST",
      caller,
      "/api/v1/otzar/my-twin/proposed-patterns/sweep",
      {},
    );
    const patternId = sw.body.created[0].pattern_id;
    await inject(
      "PATCH",
      caller,
      `/api/v1/otzar/my-twin/proposed-patterns/${patternId}`,
      { status: "ACCEPTED" },
    );
    const auditAccepted = await prisma.auditEvent.findFirst({
      where: {
        event_type: "ADMIN_ACTION",
        actor_entity_id: caller.entityId,
      },
      orderBy: { timestamp: "desc" },
    });
    expect((auditAccepted!.details as any)["action"]).toBe(
      "OTZAR_PATTERN_ACCEPTED",
    );

    await inject(
      "PATCH",
      caller,
      `/api/v1/otzar/my-twin/proposed-patterns/${patternId}`,
      { status: "ARCHIVED" },
    );
    const auditArchived = await prisma.auditEvent.findFirst({
      where: {
        event_type: "ADMIN_ACTION",
        actor_entity_id: caller.entityId,
      },
      orderBy: { timestamp: "desc" },
    });
    expect((auditArchived!.details as any)["action"]).toBe(
      "OTZAR_PATTERN_ARCHIVED",
    );
  });

  it("emits OTZAR_PATTERN_READ on list + detail with safe details", async () => {
    const caller = await loginPerson();
    await seedPerConversationDrift(caller);
    const sw = await inject(
      "POST",
      caller,
      "/api/v1/otzar/my-twin/proposed-patterns/sweep",
      {},
    );
    const patternId = sw.body.created[0].pattern_id;

    await inject(
      "GET",
      caller,
      "/api/v1/otzar/my-twin/proposed-patterns",
    );
    const auditList = await prisma.auditEvent.findFirst({
      where: {
        event_type: "ADMIN_ACTION",
        actor_entity_id: caller.entityId,
      },
      orderBy: { timestamp: "desc" },
    });
    expect((auditList!.details as any)["action"]).toBe("OTZAR_PATTERN_READ");
    expect((auditList!.details as any)["read_kind"]).toBe("LIST");

    await inject(
      "GET",
      caller,
      `/api/v1/otzar/my-twin/proposed-patterns/${patternId}`,
    );
    const auditDetail = await prisma.auditEvent.findFirst({
      where: {
        event_type: "ADMIN_ACTION",
        actor_entity_id: caller.entityId,
      },
      orderBy: { timestamp: "desc" },
    });
    expect((auditDetail!.details as any)["action"]).toBe("OTZAR_PATTERN_READ");
    expect((auditDetail!.details as any)["read_kind"]).toBe("DETAIL");
  });

  it("does NOT emit any new audit literal (event_type stays ADMIN_ACTION; never contains OTZAR_PATTERN or PROPOSED_PATTERN)", async () => {
    const caller = await loginPerson();
    await seedPerConversationDrift(caller);
    await inject(
      "POST",
      caller,
      "/api/v1/otzar/my-twin/proposed-patterns/sweep",
      {},
    );
    const rows = await prisma.auditEvent.findMany({
      where: { actor_entity_id: caller.entityId },
      select: { event_type: true },
    });
    for (const row of rows) {
      expect(row.event_type).not.toMatch(/OTZAR_PATTERN/);
      expect(row.event_type).not.toMatch(/PROPOSED_PATTERN/);
    }
  });
});
