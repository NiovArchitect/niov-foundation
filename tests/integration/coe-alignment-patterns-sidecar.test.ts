// FILE: coe-alignment-patterns-sidecar.test.ts (integration)
// PURPOSE: Section 1 Wave 6B — accepted-pattern priming hook into
//          assembleContext contract coverage per ADR-0067. Verifies
//          the symbiotic alignment-pattern sidecar on
//          AssembleContextSuccess via the production-wired
//          POST /api/v1/coe/context route: sidecar present when
//          caller has ACCEPTED rows; PROPOSED/REJECTED/ARCHIVED
//          excluded via the Wave 6A reader; cross-owner isolation;
//          explicit include_alignment_patterns=false opt-out;
//          empty/absent shape; SAFE projection no-leak; ZERO new
//          audit literal; ZERO OtzarProposedPattern / MemoryCapsule
//          / Action / OtzarConversation mutation; capsule pipeline
//          counters unchanged when sidecar is suppressed via opt-out.
// CONNECTS TO:
//   - apps/api/src/routes/coe.routes.ts (POST /api/v1/coe/context;
//     accepts include_alignment_patterns body flag per Wave 6B)
//   - apps/api/src/services/coe/coe.service.ts (COEService;
//     assembleContext STEP 6.5 sidecar)
//   - apps/api/src/services/otzar/proposed-pattern.service.ts
//     (OtzarProposedPatternService.listAcceptedPatternsForOwner)
//   - ADR-0067 §1-§14 (sidecar-field design lock)

import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ContentEncryption } from "@niov/auth";
import { createEntity, prisma } from "@niov/database";
import {
  cleanupTestData,
  ensureAuditTriggers,
  makeEntityInput,
  TEST_PREFIX,
  withCleanRateLimits,
} from "../helpers.js";
import {
  buildApp,
  MemoryContentStore,
  MemoryNonceStore,
  MemoryRateLimitStore,
} from "@niov/api";
import type { FastifyInstance } from "fastify";

const TEST_JWT_SECRET = "coe-alignment-sidecar-test-secret";
const TEST_KEY = randomBytes(32);
const TEST_ENCRYPTION = new ContentEncryption(TEST_KEY);

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
    contentEncryption: TEST_ENCRYPTION,
    rateLimitStore: store,
  });
});

afterAll(async () => {
  await app.close();
  await cleanupTestData();
  await prisma.$disconnect();
});

withCleanRateLimits(store);

interface TestCaller {
  entityId: string;
  walletId: string;
  token: string;
  ip: string;
}

async function loginPerson(): Promise<TestCaller> {
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
  const ip = `10.111.${Math.floor(Math.random() * 200) + 1}.${
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

async function insertAcceptedPattern(opts: {
  ownerEntityId: string;
  pattern_label?:
    | "RECURRING_CORRECTION_RECOMMENDATION_REVIEW"
    | "STALE_CONTEXT_REFRESH_RECOMMENDED"
    | "CROSS_CONVERSATION_ALIGNMENT_RECOMMENDED";
  source_signal_type?:
    | "PER_CONVERSATION_DRIFT"
    | "WALLET_STALE_CONTEXT"
    | "CROSS_CONVERSATION_ROLLUP";
  status?: "PROPOSED" | "ACCEPTED" | "REJECTED" | "ARCHIVED";
  reviewedAt?: Date;
  archivedAt?: Date;
}): Promise<string> {
  const label =
    opts.pattern_label ?? "RECURRING_CORRECTION_RECOMMENDATION_REVIEW";
  const source = opts.source_signal_type ?? "PER_CONVERSATION_DRIFT";
  const status = opts.status ?? "ACCEPTED";
  const now = new Date();
  const row = await prisma.otzarProposedPattern.create({
    data: {
      owner_entity_id: opts.ownerEntityId,
      source_signal_type: source,
      pattern_label: label,
      safe_summary: "Symbiotic test summary for alignment sidecar.",
      confidence_label: "MEDIUM",
      status,
      occurrence_count: 3,
      first_signal_at: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000),
      last_signal_at: now,
      reviewed_at:
        opts.reviewedAt ??
        (status === "ACCEPTED" || status === "REJECTED" ? now : null),
      archived_at: opts.archivedAt ?? null,
    },
  });
  return row.pattern_id;
}

async function postAssembleContext(
  caller: TestCaller,
  body: {
    request_text: string;
    token_budget: number;
    include_alignment_patterns?: boolean;
  },
): Promise<{ statusCode: number; body: any; raw: string }> {
  const r = await app.inject({
    method: "POST",
    url: "/api/v1/coe/context",
    headers: { authorization: `Bearer ${caller.token}` },
    remoteAddress: caller.ip,
    payload: body,
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
  "raw_correction",
  "raw_transcript",
  "payload_summary",
  "payload_content",
  "storage_location",
  "content_hash",
  "secret_ref",
  "bridge_id",
];

function assertNoLeakInAlignmentPatterns(body: any): void {
  if (body.alignment_patterns === undefined) return;
  const serialized = JSON.stringify(body.alignment_patterns);
  for (const marker of FORBIDDEN_NO_LEAK_MARKERS) {
    expect(serialized.toLowerCase()).not.toContain(marker.toLowerCase());
  }
}

describe("Section 1 Wave 6B — sidecar present when caller has ACCEPTED rows", () => {
  it("alignment_patterns contains the caller's ACCEPTED pattern with SAFE + symbiotic projection", async () => {
    const caller = await loginPerson();
    const patternId = await insertAcceptedPattern({
      ownerEntityId: caller.entityId,
      pattern_label: "RECURRING_CORRECTION_RECOMMENDATION_REVIEW",
      reviewedAt: new Date(),
    });
    const r = await postAssembleContext(caller, {
      request_text: "hello twin",
      token_budget: 1000,
    });
    expect(r.statusCode).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.alignment_patterns).toBeDefined();
    expect(r.body.alignment_patterns).toHaveLength(1);
    const ap = r.body.alignment_patterns[0];
    expect(ap.pattern_id).toBe(patternId);
    expect(ap.source_signal_type).toBe("PER_CONVERSATION_DRIFT");
    expect(ap.pattern_label).toBe(
      "RECURRING_CORRECTION_RECOMMENDATION_REVIEW",
    );
    expect(ap.confidence_label).toBe("MEDIUM");
    expect(typeof ap.safe_summary).toBe("string");
    expect(typeof ap.accepted_at).toBe("string");
    expect(typeof ap.advisory_note).toBe("string");
    // Symbiotic language verification.
    expect(ap.advisory_note.toLowerCase()).toContain("twin");
    expect(ap.advisory_note.toLowerCase()).toContain("alignment");
    // Forbidden language MUST NOT appear.
    expect(ap.advisory_note.toLowerCase()).not.toContain("score");
    expect(ap.advisory_note.toLowerCase()).not.toContain("surveillance");
    expect(ap.advisory_note.toLowerCase()).not.toContain("manager");
    expect(ap.advisory_note.toLowerCase()).not.toContain("compliance");
    expect(ap.advisory_note.toLowerCase()).not.toContain("discipline");
  });
});

describe("Section 1 Wave 6B — explicit owner opt-out via include_alignment_patterns=false", () => {
  it("suppresses the sidecar even when caller has ACCEPTED rows", async () => {
    const caller = await loginPerson();
    await insertAcceptedPattern({
      ownerEntityId: caller.entityId,
      reviewedAt: new Date(),
    });
    const r = await postAssembleContext(caller, {
      request_text: "hello twin",
      token_budget: 1000,
      include_alignment_patterns: false,
    });
    expect(r.statusCode).toBe(200);
    expect(r.body.alignment_patterns).toBeUndefined();
  });

  it("include_alignment_patterns=true (explicit default) surfaces the sidecar", async () => {
    const caller = await loginPerson();
    await insertAcceptedPattern({
      ownerEntityId: caller.entityId,
      reviewedAt: new Date(),
    });
    const r = await postAssembleContext(caller, {
      request_text: "hello twin",
      token_budget: 1000,
      include_alignment_patterns: true,
    });
    expect(r.statusCode).toBe(200);
    expect(r.body.alignment_patterns).toBeDefined();
    expect(r.body.alignment_patterns).toHaveLength(1);
  });
});

describe("Section 1 Wave 6B — lifecycle status filtering (Wave 6A reader contract)", () => {
  async function expectOnlyAcceptedSurfaced(
    statusToInsert: "PROPOSED" | "REJECTED" | "ARCHIVED",
  ): Promise<void> {
    const caller = await loginPerson();
    await insertAcceptedPattern({
      ownerEntityId: caller.entityId,
      status: statusToInsert,
      reviewedAt: statusToInsert === "PROPOSED" ? undefined : new Date(),
      archivedAt: statusToInsert === "ARCHIVED" ? new Date() : undefined,
    });
    const r = await postAssembleContext(caller, {
      request_text: "hello twin",
      token_budget: 1000,
    });
    expect(r.statusCode).toBe(200);
    expect(r.body.alignment_patterns).toBeUndefined();
  }

  it("PROPOSED rows do NOT surface", async () => {
    await expectOnlyAcceptedSurfaced("PROPOSED");
  });
  it("REJECTED rows do NOT surface", async () => {
    await expectOnlyAcceptedSurfaced("REJECTED");
  });
  it("ARCHIVED rows do NOT surface", async () => {
    await expectOnlyAcceptedSurfaced("ARCHIVED");
  });
});

describe("Section 1 Wave 6B — cross-owner isolation (RULE 0)", () => {
  it("Caller A's assembleContext does NOT include Caller B's ACCEPTED patterns", async () => {
    const callerA = await loginPerson();
    const callerB = await loginPerson();
    const bPatternId = await insertAcceptedPattern({
      ownerEntityId: callerB.entityId,
      reviewedAt: new Date(),
    });
    const rA = await postAssembleContext(callerA, {
      request_text: "hello twin",
      token_budget: 1000,
    });
    expect(rA.statusCode).toBe(200);
    expect(rA.body.alignment_patterns).toBeUndefined();
    // Defensive: serialized payload does not contain B's id either.
    expect(rA.raw).not.toContain(bPatternId);
  });
});

describe("Section 1 Wave 6B — empty + capsule pipeline preserved", () => {
  it("alignment_patterns is ABSENT when caller has no ACCEPTED rows", async () => {
    const caller = await loginPerson();
    const r = await postAssembleContext(caller, {
      request_text: "hello twin",
      token_budget: 1000,
    });
    expect(r.statusCode).toBe(200);
    expect(r.body.alignment_patterns).toBeUndefined();
  });

  it("capsule pipeline counters are identical with or without the sidecar (opt-out comparison)", async () => {
    const caller = await loginPerson();
    await insertAcceptedPattern({
      ownerEntityId: caller.entityId,
      reviewedAt: new Date(),
    });
    const without = await postAssembleContext(caller, {
      request_text: "hello twin",
      token_budget: 1000,
      include_alignment_patterns: false,
    });
    const withSidecar = await postAssembleContext(caller, {
      request_text: "hello twin",
      token_budget: 1000,
    });
    expect(without.statusCode).toBe(200);
    expect(withSidecar.statusCode).toBe(200);
    expect(withSidecar.body.capsules_loaded).toBe(
      without.body.capsules_loaded,
    );
    expect(withSidecar.body.tokens_consumed).toBe(
      without.body.tokens_consumed,
    );
    expect(withSidecar.body.capsules_skipped_low_relevance).toBe(
      without.body.capsules_skipped_low_relevance,
    );
    expect(withSidecar.body.capsules_skipped_budget).toBe(
      without.body.capsules_skipped_budget,
    );
    expect(withSidecar.body.capsules_denied_permission).toBe(
      without.body.capsules_denied_permission,
    );
    expect(withSidecar.body.context.length).toBe(
      without.body.context.length,
    );
  });
});

describe("Section 1 Wave 6B — audit posture (no new audit literal)", () => {
  it("Wave 6B sidecar does NOT add new audit literals or alignment-pattern-specific details", async () => {
    const caller = await loginPerson();
    await insertAcceptedPattern({
      ownerEntityId: caller.entityId,
      reviewedAt: new Date(),
    });
    await postAssembleContext(caller, {
      request_text: "hello twin",
      token_budget: 1000,
    });
    const rows = await prisma.auditEvent.findMany({
      where: { actor_entity_id: caller.entityId },
      select: { event_type: true, details: true },
    });
    for (const row of rows) {
      expect(row.event_type).not.toMatch(/ALIGNMENT_PATTERN/);
      expect(row.event_type).not.toMatch(/PRIMING_HOOK/);
      const detailsStr = JSON.stringify(row.details);
      expect(detailsStr).not.toContain("ALIGNMENT_PATTERN");
      expect(detailsStr).not.toContain("alignment_patterns");
      expect(detailsStr).not.toContain("PRIMING_HOOK");
    }
  });
});

describe("Section 1 Wave 6B — no side effects", () => {
  it("assembleContext does NOT mutate OtzarProposedPattern rows", async () => {
    const caller = await loginPerson();
    const patternId = await insertAcceptedPattern({
      ownerEntityId: caller.entityId,
      reviewedAt: new Date(),
    });
    const before = await prisma.otzarProposedPattern.findUnique({
      where: { pattern_id: patternId },
    });
    await postAssembleContext(caller, {
      request_text: "hello twin",
      token_budget: 1000,
    });
    await postAssembleContext(caller, {
      request_text: "hello again",
      token_budget: 1000,
    });
    const after = await prisma.otzarProposedPattern.findUnique({
      where: { pattern_id: patternId },
    });
    expect(after).not.toBeNull();
    expect(after!.status).toBe(before!.status);
    expect(after!.reviewed_at?.toISOString()).toBe(
      before!.reviewed_at?.toISOString(),
    );
  });

  it("assembleContext does NOT mutate the existing org-scoped IntelligencePattern table", async () => {
    const caller = await loginPerson();
    await insertAcceptedPattern({
      ownerEntityId: caller.entityId,
      reviewedAt: new Date(),
    });
    const before = await prisma.intelligencePattern.count();
    await postAssembleContext(caller, {
      request_text: "hello twin",
      token_budget: 1000,
    });
    const after = await prisma.intelligencePattern.count();
    expect(after).toBe(before);
  });

  it("assembleContext does NOT create MemoryCapsule / Action / OtzarConversation rows", async () => {
    const caller = await loginPerson();
    await insertAcceptedPattern({
      ownerEntityId: caller.entityId,
      reviewedAt: new Date(),
    });
    const before = {
      capsules: await prisma.memoryCapsule.count(),
      actions: await prisma.action.count(),
      convos: await prisma.otzarConversation.count(),
    };
    await postAssembleContext(caller, {
      request_text: "hello twin",
      token_budget: 1000,
    });
    const after = {
      capsules: await prisma.memoryCapsule.count(),
      actions: await prisma.action.count(),
      convos: await prisma.otzarConversation.count(),
    };
    expect(after).toEqual(before);
  });
});

describe("Section 1 Wave 6B — no-leak invariants", () => {
  it("alignment_patterns SAFE projection — no forbidden markers in serialized sidecar", async () => {
    const caller = await loginPerson();
    // Use a distinctive owner-only marker we know IS persisted but
    // is NOT in the AcceptedPatternAdvisoryView projection (the
    // owner_entity_id column). Verifying the serialized sidecar
    // does not contain the owner's own UUID is a strong leak
    // assertion since that UUID is the row's owner_entity_id.
    await insertAcceptedPattern({
      ownerEntityId: caller.entityId,
      reviewedAt: new Date(),
    });
    const r = await postAssembleContext(caller, {
      request_text: "hello twin",
      token_budget: 1000,
    });
    expect(r.statusCode).toBe(200);
    expect(r.body.alignment_patterns).toBeDefined();
    assertNoLeakInAlignmentPatterns(r.body);
    // Owner_entity_id must NEVER appear in the alignment_patterns
    // serialization (it's a forbidden field per
    // AcceptedPatternAdvisoryView).
    const serialized = JSON.stringify(r.body.alignment_patterns);
    expect(serialized).not.toContain(caller.entityId);
  });
});
