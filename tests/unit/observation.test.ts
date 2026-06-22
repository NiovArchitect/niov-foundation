// FILE: observation.test.ts (unit)
// PURPOSE: Cover the observation pipeline's load-bearing pieces:
//          - Dedup hit/miss within 24h
//          - Extraction JSON parse failure → EXTRACTION_FAILED
//          - External entity detection (vocab match, new, gated by
//            track_external_entities)
//          - Vocabulary growth threshold (3+ trigger, 2 no-trigger)
//          - PORTABILITY ROUTING (decisions → ORG wallet, insights →
//            EMPLOYEE wallet) -- patent-defense architectural anchor
//          - processCorrection writes CORRECTION to employee wallet
//          - Tokens column regression (tokens > 0, tokens_tokenizer
//            "anthropic")
//          - commitment_date wire-up via priming.getCommitmentsDueSoon
// CONNECTS TO: services/otzar/observation.service.ts, priming.ts.

import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  AuthService,
  getPriming,
  MemoryKVCache,
  MemoryNonceStore,
  MockLLMProvider,
  ObservationService,
  type LLMResult,
  type LoginResult,
} from "@niov/api";
import { ContentEncryption } from "@niov/auth";
import { createEntity, prisma } from "@niov/database";
import {
  cleanupTestData,
  ensureAuditTriggers,
  makeEntityInput,
} from "../helpers.js";

const TEST_JWT_SECRET = "observation-test-secret-do-not-use-in-prod";
const TEST_KEY = randomBytes(32);

beforeAll(async () => {
  await ensureAuditTriggers();
  await cleanupTestData();
});

afterAll(async () => {
  await cleanupTestData();
  await prisma.$disconnect();
});

void TEST_KEY;
void ContentEncryption;

// WHAT: Build a fresh ObservationService stack for each test.
// INPUT: Optional scripted MockLLMProvider responses.
// OUTPUT: { auth, llm, observation }.
function makeServices(opts: { mockResponses?: LLMResult[] } = {}) {
  const sessionStore = new MemoryNonceStore();
  const auth = new AuthService({
    jwtSecret: TEST_JWT_SECRET,
    nonceStore: sessionStore,
  });
  const llm = new MockLLMProvider(
    opts.mockResponses ?? [
      {
        ok: true,
        text: JSON.stringify({
          decisions: [],
          commitments: [],
          key_topics: [],
          external_entities_mentioned: [],
        }),
        provider: "mock",
        model: "mock-1",
      },
    ],
  );
  const observation = new ObservationService(auth, llm);
  return { auth, llm, observation };
}

async function loginAs(
  auth: AuthService,
  ops: string[] = ["read", "write", "share"],
) {
  const password = "correct-horse-battery";
  const input = makeEntityInput({ entity_type: "PERSON", password });
  const entity = await createEntity(input);
  const login = (await auth.login(input.email!, password, ops, {
    ip_address: null,
  })) as LoginResult;
  if (!login.ok) throw new Error("login failed");
  return { entity, token: login.token };
}

// Sets up an org with the caller as a member + OrgSettings row so
// observe() can resolve the org and its settings.
async function attachOrg(
  callerEntityId: string,
  opts: {
    industry?: string;
    track_external_entities?: boolean;
  } = {},
): Promise<string> {
  const company = await createEntity(
    makeEntityInput({ entity_type: "COMPANY" }),
  );
  await prisma.entityMembership.create({
    data: {
      parent_id: company.entity_id,
      child_id: callerEntityId,
      is_active: true,
    },
  });
  await prisma.orgSettings.create({
    data: {
      org_entity_id: company.entity_id,
      industry: opts.industry ?? "TECH",
      track_external_entities: opts.track_external_entities ?? true,
    },
  });
  return company.entity_id;
}

// ──────────────────────────────────────────────────────────────────
// DEDUP
// ──────────────────────────────────────────────────────────────────

describe("ObservationService.observe -- dedup", () => {
  it("duplicate content within 24h returns { skipped: true, reason: DUPLICATE_CONTENT }", async () => {
    // Use a mock that actually produces capsules so the first call
    // writes content_hash rows that the second call's dedup query
    // can find.
    const { auth, observation } = makeServices({
      mockResponses: [
        {
          ok: true,
          text: JSON.stringify({
            decisions: [{ topic: "x", outcome: "y" }],
            commitments: [],
            key_topics: [],
            external_entities_mentioned: [],
          }),
          provider: "mock",
          model: "mock-1",
        },
      ],
    });
    const owner = await loginAs(auth);
    await attachOrg(owner.entity.entity_id);
    const content = `unique-content-${randomUUID()}`;
    const r1 = await observation.observe({
      token: owner.token,
      content,
      event_type: "MEETING",
    });
    expect(r1.ok).toBe(true);
    if (r1.ok) expect(r1.skipped).toBeFalsy();
    const r2 = await observation.observe({
      token: owner.token,
      content,
      event_type: "MEETING",
    });
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(r2.skipped).toBe(true);
    if (r2.skipped) {
      expect(r2.reason).toBe("DUPLICATE_CONTENT");
    }
  });

  it("same content > 24h ago is processed normally (not deduplicated)", async () => {
    const { auth, observation } = makeServices();
    const owner = await loginAs(auth);
    await attachOrg(owner.entity.entity_id);
    const content = `older-content-${randomUUID()}`;
    // Manually plant a synthetic duplicate-source row dated 25h ago
    // so the dedup window misses it.
    const ownerWallet = await prisma.wallet.findUnique({
      where: { entity_id: owner.entity.entity_id },
    });
    const oldHash =
      "sha256:" +
      (
        await import("node:crypto")
      ).createHash("sha256").update(content.slice(0, 500)).digest("hex");
    const oldId = randomUUID();
    await prisma.memoryCapsule.create({
      data: {
        capsule_id: oldId,
        wallet_id: ownerWallet!.wallet_id,
        entity_id: owner.entity.entity_id,
        version: 1,
        capsule_type: "PREFERENCE",
        topic_tags: [],
        decay_type: "TIME_BASED",
        payload_summary: "old",
        payload_size_tokens: 1,
        storage_location: `niov://test/${oldId}`,
        content_hash: oldHash,
        created_at: new Date(Date.now() - 25 * 60 * 60 * 1000),
      },
    });
    // Now observe the same content -- dedup window misses the old
    // row, observe should proceed normally (not skipped).
    const result = await observation.observe({
      token: owner.token,
      content,
      event_type: "MEETING",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.skipped).toBeFalsy();
    }
  });
});

// ──────────────────────────────────────────────────────────────────
// EXTRACTION FAILURE
// ──────────────────────────────────────────────────────────────────

describe("ObservationService.observe -- extraction failure", () => {
  it("LLM response that's not valid JSON returns EXTRACTION_FAILED with details", async () => {
    const { auth, observation } = makeServices({
      mockResponses: [
        {
          ok: true,
          text: "this is not JSON, it's prose",
          provider: "mock",
          model: "mock-1",
        },
      ],
    });
    const owner = await loginAs(auth);
    await attachOrg(owner.entity.entity_id);
    const result = await observation.observe({
      token: owner.token,
      content: `garbage-${randomUUID()}`,
      event_type: "MEETING",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("EXTRACTION_FAILED");
    expect(result.details).toMatchObject({
      parse_error: expect.any(String),
      llm_response: expect.stringContaining("not JSON"),
    });
  });
});

// ──────────────────────────────────────────────────────────────────
// EXTERNAL ENTITY DETECTION
// ──────────────────────────────────────────────────────────────────

describe("ObservationService.observe -- external entity detection", () => {
  it("known vocab CLIENT term → ExternalEntity upserted, mention_count incremented", async () => {
    const { auth, observation } = makeServices({
      mockResponses: [
        {
          ok: true,
          text: JSON.stringify({
            decisions: [],
            commitments: [],
            key_topics: [],
            external_entities_mentioned: ["AcmeCorp"],
          }),
          provider: "mock",
          model: "mock-1",
        },
      ],
    });
    const owner = await loginAs(auth);
    const orgId = await attachOrg(owner.entity.entity_id);
    // Pre-seed vocab marking AcmeCorp as a CLIENT.
    await prisma.domainVocabulary.create({
      data: {
        org_entity_id: orgId,
        term: "AcmeCorp",
        term_type: "CLIENT",
      },
    });
    // First observe -- creates the ExternalEntity row with type
    // "CLIENT" from vocab seed.
    const r1 = await observation.observe({
      token: owner.token,
      content: `acme-mention-${randomUUID()}`,
      event_type: "MEETING",
    });
    expect(r1.ok).toBe(true);
    const ext = await prisma.externalEntity.findFirst({
      where: { org_entity_id: orgId, name: "AcmeCorp" },
    });
    expect(ext?.entity_type).toBe("CLIENT");
    expect(ext?.mention_count).toBe(1);
    // Second observe (different content to bypass dedup) -- should
    // increment mention_count, not create a duplicate.
    const r2 = await observation.observe({
      token: owner.token,
      content: `acme-mention-${randomUUID()}`,
      event_type: "MEETING",
    });
    expect(r2.ok).toBe(true);
    const ext2 = await prisma.externalEntity.findFirst({
      where: { org_entity_id: orgId, name: "AcmeCorp" },
    });
    expect(ext2?.mention_count).toBe(2);
  });

  it("unknown name → new ExternalEntity created with type CLIENT (default)", async () => {
    const newName = `Unknown-${randomUUID().slice(0, 8)}`;
    const { auth, observation } = makeServices({
      mockResponses: [
        {
          ok: true,
          text: JSON.stringify({
            decisions: [],
            commitments: [],
            key_topics: [],
            external_entities_mentioned: [newName],
          }),
          provider: "mock",
          model: "mock-1",
        },
      ],
    });
    const owner = await loginAs(auth);
    const orgId = await attachOrg(owner.entity.entity_id);
    await observation.observe({
      token: owner.token,
      content: `unknown-mention-${randomUUID()}`,
      event_type: "MEETING",
    });
    const ext = await prisma.externalEntity.findFirst({
      where: { org_entity_id: orgId, name: newName },
    });
    expect(ext).not.toBeNull();
    expect(ext?.entity_type).toBe("CLIENT");
  });

  it("OrgSettings.track_external_entities=false → no ExternalEntity rows created", async () => {
    const skippedName = `Skipped-${randomUUID().slice(0, 8)}`;
    const { auth, observation } = makeServices({
      mockResponses: [
        {
          ok: true,
          text: JSON.stringify({
            decisions: [],
            commitments: [],
            key_topics: [],
            external_entities_mentioned: [skippedName],
          }),
          provider: "mock",
          model: "mock-1",
        },
      ],
    });
    const owner = await loginAs(auth);
    const orgId = await attachOrg(owner.entity.entity_id, {
      track_external_entities: false,
    });
    await observation.observe({
      token: owner.token,
      content: `tracking-off-${randomUUID()}`,
      event_type: "MEETING",
    });
    const ext = await prisma.externalEntity.findFirst({
      where: { org_entity_id: orgId, name: skippedName },
    });
    expect(ext).toBeNull();
  });
});

// ──────────────────────────────────────────────────────────────────
// VOCABULARY GROWTH
// ──────────────────────────────────────────────────────────────────

describe("ObservationService.observe -- vocabulary growth", () => {
  it("term appearing in 3+ recent capsules → auto-added as ACRONYM", async () => {
    const term = `WIDGET-${randomUUID().slice(0, 6)}`;
    const { auth, observation } = makeServices({
      mockResponses: [
        {
          ok: true,
          text: JSON.stringify({
            decisions: [],
            commitments: [],
            key_topics: [term],
            external_entities_mentioned: [],
          }),
          provider: "mock",
          model: "mock-1",
        },
      ],
    });
    const owner = await loginAs(auth);
    const orgId = await attachOrg(owner.entity.entity_id);
    // Pre-seed 3 capsules with the term in payload_summary so the
    // count threshold trips.
    const ownerWallet = await prisma.wallet.findUnique({
      where: { entity_id: owner.entity.entity_id },
    });
    for (let i = 0; i < 3; i++) {
      const id = randomUUID();
      await prisma.memoryCapsule.create({
        data: {
          capsule_id: id,
          wallet_id: ownerWallet!.wallet_id,
          entity_id: owner.entity.entity_id,
          version: 1,
          capsule_type: "PREFERENCE",
          topic_tags: [],
          decay_type: "TIME_BASED",
          payload_summary: `seed mentioning ${term}`,
          payload_size_tokens: 1,
          storage_location: `niov://test/${id}`,
          content_hash: `sha256:seed-${id}`,
        },
      });
    }
    await observation.observe({
      token: owner.token,
      content: `vocab-trigger-${randomUUID()}`,
      event_type: "MEETING",
    });
    const vocab = await prisma.domainVocabulary.findFirst({
      where: { org_entity_id: orgId, term },
    });
    expect(vocab).not.toBeNull();
    expect(vocab?.term_type).toBe("ACRONYM");
  });

  it("term appearing in only 2 recent capsules → NOT added", async () => {
    const term = `BELOW-${randomUUID().slice(0, 6)}`;
    const { auth, observation } = makeServices({
      mockResponses: [
        {
          ok: true,
          text: JSON.stringify({
            decisions: [],
            commitments: [],
            key_topics: [term],
            external_entities_mentioned: [],
          }),
          provider: "mock",
          model: "mock-1",
        },
      ],
    });
    const owner = await loginAs(auth);
    const orgId = await attachOrg(owner.entity.entity_id);
    const ownerWallet = await prisma.wallet.findUnique({
      where: { entity_id: owner.entity.entity_id },
    });
    // Seed 1 capsule. After observe() the new WORK_PATTERN capsule
    // also mentions the term in topic_tags, bringing total to 2 --
    // still below the threshold of 3.
    const id = randomUUID();
    await prisma.memoryCapsule.create({
      data: {
        capsule_id: id,
        wallet_id: ownerWallet!.wallet_id,
        entity_id: owner.entity.entity_id,
        version: 1,
        capsule_type: "PREFERENCE",
        topic_tags: [],
        decay_type: "TIME_BASED",
        payload_summary: `seed mentioning ${term}`,
        payload_size_tokens: 1,
        storage_location: `niov://test/${id}`,
        content_hash: `sha256:seed-${id}`,
      },
    });
    await observation.observe({
      token: owner.token,
      content: `below-threshold-${randomUUID()}`,
      event_type: "MEETING",
    });
    const vocab = await prisma.domainVocabulary.findFirst({
      where: { org_entity_id: orgId, term },
    });
    expect(vocab).toBeNull();
  });
});

// ──────────────────────────────────────────────────────────────────
// PORTABILITY ROUTING -- ARCHITECTURAL ANCHOR
// ──────────────────────────────────────────────────────────────────

describe("ObservationService.observe -- PORTABILITY ROUTING (architectural anchor)", () => {
  it("decisions → ORG wallet (entity_id + wallet_id checked); insights → EMPLOYEE wallet (both checks). Patent-defense.", async () => {
    const { auth, observation } = makeServices({
      mockResponses: [
        {
          ok: true,
          text: JSON.stringify({
            decisions: [
              { topic: "pricing", outcome: "raise to $99/mo" },
            ],
            commitments: [],
            key_topics: ["pricing"],
            external_entities_mentioned: [],
          }),
          provider: "mock",
          model: "mock-1",
        },
      ],
    });
    const owner = await loginAs(auth);
    const orgId = await attachOrg(owner.entity.entity_id);
    const result = await observation.observe({
      token: owner.token,
      content: `routing-${randomUUID()}`,
      event_type: "MEETING",
    });
    expect(result.ok).toBe(true);
    if (!result.ok || result.skipped) throw new Error("expected non-skipped success");
    expect(result.capsule_ids.length).toBeGreaterThanOrEqual(2);

    // Look up the resulting capsules by id.
    const capsules = await prisma.memoryCapsule.findMany({
      where: { capsule_id: { in: result.capsule_ids } },
    });

    const decisionCap = capsules.find((c) => c.capsule_type === "DECISION");
    const workPatternCap = capsules.find((c) => c.capsule_type === "WORK_PATTERN");
    expect(decisionCap).toBeDefined();
    expect(workPatternCap).toBeDefined();

    // PORTABILITY: DECISION owned by ORG.
    const orgWallet = await prisma.wallet.findUnique({
      where: { entity_id: orgId },
    });
    const ownerWallet = await prisma.wallet.findUnique({
      where: { entity_id: owner.entity.entity_id },
    });
    expect(decisionCap?.entity_id).toBe(orgId);
    expect(decisionCap?.wallet_id).toBe(orgWallet?.wallet_id);
    expect(decisionCap?.wallet_id).not.toBe(ownerWallet?.wallet_id);

    // PORTABILITY: WORK_PATTERN owned by EMPLOYEE.
    expect(workPatternCap?.entity_id).toBe(owner.entity.entity_id);
    expect(workPatternCap?.wallet_id).toBe(ownerWallet?.wallet_id);
    expect(workPatternCap?.wallet_id).not.toBe(orgWallet?.wallet_id);
  });

  it("REGRESSION: written capsules have tokens > 0 and tokens_tokenizer 'anthropic' (Section 1C correctness)", async () => {
    const { auth, observation } = makeServices({
      mockResponses: [
        {
          ok: true,
          text: JSON.stringify({
            decisions: [{ topic: "tokens", outcome: "verify" }],
            commitments: [],
            key_topics: [],
            external_entities_mentioned: [],
          }),
          provider: "mock",
          model: "mock-1",
        },
      ],
    });
    const owner = await loginAs(auth);
    await attachOrg(owner.entity.entity_id);
    const result = await observation.observe({
      token: owner.token,
      content: `tokens-regression-${randomUUID()}`,
      event_type: "MEETING",
    });
    if (!result.ok || result.skipped) throw new Error("expected success");
    const capsule = await prisma.memoryCapsule.findUnique({
      where: { capsule_id: result.capsule_ids[0]! },
    });
    expect(capsule?.tokens).toBeGreaterThan(0);
    expect(capsule?.tokens_tokenizer).toBe("anthropic");
  });
});

// ──────────────────────────────────────────────────────────────────
// PROCESS CORRECTION
// ──────────────────────────────────────────────────────────────────

describe("ObservationService.processCorrection", () => {
  it("writes CORRECTION capsule to EMPLOYEE wallet (deleted_at IS NULL means ACTIVE)", async () => {
    const { auth, observation } = makeServices();
    const owner = await loginAs(auth);
    const result = await observation.processCorrection({
      token: owner.token,
      incorrect_description: "you used a casual tone in the demo",
      correct_behavior: "use a formal tone for enterprise demos",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const capsule = await prisma.memoryCapsule.findUnique({
      where: { capsule_id: result.correction_capsule_id },
    });
    expect(capsule?.capsule_type).toBe("CORRECTION");
    expect(capsule?.deleted_at).toBeNull();
    expect(capsule?.entity_id).toBe(owner.entity.entity_id);
  });

  it("triggers the correction propagation chain (D-2D-D10-6): the CORRECTION capsule lands at MAX relevance + a CORRECTION_PROPAGATED audit event exists", async () => {
    const { auth, observation } = makeServices();
    const owner = await loginAs(auth);
    const result = await observation.processCorrection({
      token: owner.token,
      incorrect_description: "you summarized too aggressively",
      correct_behavior: "preserve nuance in summaries",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const capsule = await prisma.memoryCapsule.findUnique({
      where: { capsule_id: result.correction_capsule_id },
    });
    expect(capsule?.relevance_score).toBeCloseTo(1.0, 5);
    const audit = await prisma.auditEvent.findFirst({
      where: {
        event_type: "CORRECTION_PROPAGATED",
        target_capsule_id: result.correction_capsule_id,
      },
    });
    expect(audit).not.toBeNull();
    expect(audit?.actor_entity_id).toBe(owner.entity.entity_id);
    const details = audit?.details as Record<string, unknown>;
    expect(details.correction_capsule_id).toBe(result.correction_capsule_id);
    expect(details.target_capsule_id).toBeNull();
  });

  it("with target_capsule_id, propagation snaps both the correction and the target capsule to MAX relevance", async () => {
    const { auth, observation } = makeServices();
    const owner = await loginAs(auth);
    const wallet = await prisma.wallet.findUnique({
      where: { entity_id: owner.entity.entity_id },
    });
    const target = await prisma.memoryCapsule.create({
      data: {
        capsule_id: randomUUID(),
        wallet_id: wallet!.wallet_id,
        entity_id: owner.entity.entity_id,
        version: 1,
        capsule_type: "PREFERENCE",
        topic_tags: ["correction-target"],
        decay_type: "TIME_BASED",
        payload_summary: "the wrong behavior",
        payload_size_tokens: 4,
        storage_location: `test://${randomUUID()}`,
        content_hash: `sha256:${randomUUID().replace(/-/g, "")}`,
        relevance_score: 0.5,
      },
    });
    const result = await observation.processCorrection({
      token: owner.token,
      incorrect_description: "the wrong behavior",
      correct_behavior: "the right behavior",
      target_capsule_id: target.capsule_id,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const correctionRow = await prisma.memoryCapsule.findUnique({
      where: { capsule_id: result.correction_capsule_id },
    });
    const targetRow = await prisma.memoryCapsule.findUnique({
      where: { capsule_id: target.capsule_id },
    });
    expect(correctionRow?.relevance_score).toBeCloseTo(1.0, 5);
    expect(targetRow?.relevance_score).toBeCloseTo(1.0, 5);
    const audit = await prisma.auditEvent.findFirst({
      where: {
        event_type: "CORRECTION_PROPAGATED",
        target_capsule_id: result.correction_capsule_id,
      },
    });
    expect(audit).not.toBeNull();
    const details = audit?.details as Record<string, unknown>;
    expect(details.target_capsule_id).toBe(target.capsule_id);
  });
});

// ──────────────────────────────────────────────────────────────────
// ADR-0055 Wave 2C: processCorrection accepts optional conversation_id
// ──────────────────────────────────────────────────────────────────

describe("ObservationService.processCorrection -- conversation_id linkage (ADR-0055)", () => {
  // Helper: create a real OtzarConversation row owned by the given
  // entity. No LLM -- deterministic.
  async function makeOwnedConversation(ownerEntityId: string): Promise<string> {
    const conversationId = randomUUID();
    await prisma.otzarConversation.create({
      data: {
        conversation_id: conversationId,
        entity_id: ownerEntityId,
        twin_id: ownerEntityId,
        source_type: "CHAT",
        participants: [ownerEntityId],
        message_count: 1,
        status: "ACTIVE",
      },
    });
    return conversationId;
  }

  it("persists conversation_id on the CORRECTION capsule when valid", async () => {
    const { auth, observation } = makeServices();
    const owner = await loginAs(auth);
    const conversationId = await makeOwnedConversation(owner.entity.entity_id);
    const result = await observation.processCorrection({
      token: owner.token,
      incorrect_description: "wrong tone",
      correct_behavior: "formal tone",
      conversation_id: conversationId,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const capsule = await prisma.memoryCapsule.findUnique({
      where: { capsule_id: result.correction_capsule_id },
    });
    expect(capsule?.conversation_id).toBe(conversationId);
    expect(capsule?.capsule_type).toBe("CORRECTION");
  });

  it("backward-compatible: omitted conversation_id persists null", async () => {
    const { auth, observation } = makeServices();
    const owner = await loginAs(auth);
    const result = await observation.processCorrection({
      token: owner.token,
      incorrect_description: "wrong A",
      correct_behavior: "right A",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const capsule = await prisma.memoryCapsule.findUnique({
      where: { capsule_id: result.correction_capsule_id },
    });
    expect(capsule?.conversation_id).toBeNull();
  });

  it("returns CONVERSATION_NOT_FOUND for an unknown conversation_id", async () => {
    const { auth, observation } = makeServices();
    const owner = await loginAs(auth);
    const result = await observation.processCorrection({
      token: owner.token,
      incorrect_description: "wrong B",
      correct_behavior: "right B",
      conversation_id: randomUUID(),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("CONVERSATION_NOT_FOUND");
  });

  it("returns NOT_CONVERSATION_OWNER for a cross-caller conversation_id", async () => {
    const { auth, observation } = makeServices();
    const a = await loginAs(auth);
    const b = await loginAs(auth);
    const bConvId = await makeOwnedConversation(b.entity.entity_id);
    const result = await observation.processCorrection({
      token: a.token,
      incorrect_description: "wrong C",
      correct_behavior: "right C",
      conversation_id: bConvId,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("NOT_CONVERSATION_OWNER");
    // No CORRECTION capsule should have been written for A linked to B's
    // conversation (cross-tenant linkage guard).
    const leakCheck = await prisma.memoryCapsule.findFirst({
      where: {
        capsule_type: "CORRECTION",
        conversation_id: bConvId,
        entity_id: a.entity.entity_id,
      },
    });
    expect(leakCheck).toBeNull();
  });
});

// ──────────────────────────────────────────────────────────────────
// COMMITMENT_DATE WIRE-UP -- closes the loop on 11B priming stub
// ──────────────────────────────────────────────────────────────────

describe("commitment_date wire-up (11B priming stub → real)", () => {
  it("COMMITMENT capsule with commitment_date in next 48h surfaces via getCommitmentsDueSoon", async () => {
    const { auth, observation } = makeServices({
      mockResponses: [
        {
          ok: true,
          text: JSON.stringify({
            decisions: [],
            commitments: [
              {
                description: "follow up with vendor by Tuesday",
                due: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
              },
            ],
            key_topics: [],
            external_entities_mentioned: [],
          }),
          provider: "mock",
          model: "mock-1",
        },
      ],
    });
    const owner = await loginAs(auth);
    const orgId = await attachOrg(owner.entity.entity_id);
    const result = await observation.observe({
      token: owner.token,
      content: `commitment-${randomUUID()}`,
      event_type: "MEETING",
    });
    expect(result.ok).toBe(true);
    if (!result.ok || result.skipped) throw new Error("expected success");
    // The COMMITMENT capsule should be in the employee's wallet
    // with commitment_date populated in the [now, now+48h] window.
    const cache = new MemoryKVCache();
    const priming = await getPriming({
      ownerEntityId: owner.entity.entity_id,
      orgEntityId: orgId,
      callerRole: "employee",
      message: "what's coming up?",
      cache,
    });
    expect(priming.text).toContain("follow up with vendor");
  });
});

// ──────────────────────────────────────────────────────────────────
// [OTZAR-RETURN-10-FOUNDATION] forward-only voice-note grouping id
// ──────────────────────────────────────────────────────────────────

describe("ObservationService.observe -- voice_note_id grouping", () => {
  const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // A mock that mints capsules across BOTH wallets: a DECISION (org wallet) +
  // a COMMITMENT and a WORK_PATTERN (caller wallet) — exactly the cross-wallet
  // fan-out the grouping id must span.
  function fanOutServices() {
    return makeServices({
      mockResponses: [
        {
          ok: true,
          text: JSON.stringify({
            decisions: [{ topic: "renewal", outcome: "decided" }],
            commitments: [{ description: "send the contract" }],
            key_topics: ["pricing"],
            external_entities_mentioned: [],
          }),
          provider: "mock",
          model: "mock-1",
        },
      ],
    });
  }

  it("a non-voice observe returns NO voice_note_id and persists null (backward compatible)", async () => {
    const { auth, observation } = fanOutServices();
    const owner = await loginAs(auth);
    await attachOrg(owner.entity.entity_id);
    const r = await observation.observe({
      token: owner.token,
      content: `non-voice-${randomUUID()}`,
      event_type: "MEETING",
    });
    expect(r.ok).toBe(true);
    if (!r.ok || r.skipped) return;
    expect(r.voice_note_id).toBeUndefined();
    expect(r.capsule_ids.length).toBeGreaterThan(0);
    const rows = await prisma.memoryCapsule.findMany({
      where: { capsule_id: { in: r.capsule_ids } },
      select: { voice_note_id: true },
    });
    for (const row of rows) expect(row.voice_note_id).toBeNull();
  });

  it("a voice-note observe (source) GENERATES a voice_note_id shared by every minted capsule", async () => {
    const { auth, observation } = fanOutServices();
    const owner = await loginAs(auth);
    await attachOrg(owner.entity.entity_id);
    const r = await observation.observe({
      token: owner.token,
      content: `voice-${randomUUID()}`,
      event_type: "NOTE",
      source: "voice_note_capture",
    });
    expect(r.ok).toBe(true);
    if (!r.ok || r.skipped) return;
    expect(typeof r.voice_note_id).toBe("string");
    expect(UUID_RE.test(r.voice_note_id ?? "")).toBe(true);
    expect(r.capsule_ids.length).toBeGreaterThanOrEqual(2); // fan-out across wallets
    const rows = await prisma.memoryCapsule.findMany({
      where: { capsule_id: { in: r.capsule_ids } },
      select: { voice_note_id: true },
    });
    expect(rows.length).toBe(r.capsule_ids.length);
    for (const row of rows) expect(row.voice_note_id).toBe(r.voice_note_id);
  });

  it("a SUPPLIED voice_note_id is honored and persisted on every capsule", async () => {
    const { auth, observation } = fanOutServices();
    const owner = await loginAs(auth);
    await attachOrg(owner.entity.entity_id);
    const supplied = randomUUID();
    const r = await observation.observe({
      token: owner.token,
      content: `voice-supplied-${randomUUID()}`,
      event_type: "NOTE",
      source: "voice_note_capture",
      voice_note_id: supplied,
    });
    expect(r.ok).toBe(true);
    if (!r.ok || r.skipped) return;
    expect(r.voice_note_id).toBe(supplied);
    const rows = await prisma.memoryCapsule.findMany({
      where: { capsule_id: { in: r.capsule_ids } },
      select: { voice_note_id: true },
    });
    for (const row of rows) expect(row.voice_note_id).toBe(supplied);
  });

  it("the capsule_ids shape is unchanged and capsules are active (no revoke/delete)", async () => {
    const { auth, observation } = fanOutServices();
    const owner = await loginAs(auth);
    await attachOrg(owner.entity.entity_id);
    const r = await observation.observe({
      token: owner.token,
      content: `voice-shape-${randomUUID()}`,
      event_type: "NOTE",
      source: "voice_note_capture",
    });
    expect(r.ok).toBe(true);
    if (!r.ok || r.skipped) return;
    expect(Array.isArray(r.capsule_ids)).toBe(true);
    const rows = await prisma.memoryCapsule.findMany({
      where: { capsule_id: { in: r.capsule_ids } },
      select: { deleted_at: true },
    });
    // Grouping only — nothing is tombstoned.
    for (const row of rows) expect(row.deleted_at).toBeNull();
  });
});
