// FILE: feedback.test.ts (unit)
// PURPOSE: Cover the seven feedback loops in isolation -- direct
//          method calls (no scheduler, no HTTP), with assertions on
//          the side effects each loop is supposed to produce.
// CONNECTS TO: services/feedback/feedback.service.ts, the
//              hive_service for Loop 4, prisma for setup +
//              assertions, MemoryRateLimitStore for Loop 5.

import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  AuthService,
  FeedbackService,
  HiveService,
  MemoryContentStore,
  MemoryNonceStore,
  MemoryRateLimitStore,
  startScheduler,
  WriteService,
  type LoginResult,
} from "@niov/api";
import { ContentEncryption } from "@niov/auth";
import { createEntity, prisma, writeAuditEvent } from "@niov/database";
import {
  cleanupTestData,
  ensureAuditTriggers,
  makeEntityInput,
} from "../helpers.js";

const TEST_JWT_SECRET = "feedback-test-secret-do-not-use-in-prod";
const TEST_KEY = randomBytes(32);

beforeAll(async () => {
  await ensureAuditTriggers();
  await cleanupTestData();
});

afterAll(async () => {
  await cleanupTestData();
  await prisma.$disconnect();
});

// WHAT: Build a fresh stack of services for the tests.
// INPUT: None.
// OUTPUT: { auth, write, hive, rate, feedback }.
// WHY: Each test gets a clean dependency graph.
function makeServices() {
  const sessionStore = new MemoryNonceStore();
  const declarationStore = new MemoryNonceStore();
  const contentStore = new MemoryContentStore();
  const encryption = new ContentEncryption(TEST_KEY);
  const auth = new AuthService({
    jwtSecret: TEST_JWT_SECRET,
    nonceStore: sessionStore,
  });
  const write = new WriteService(
    auth,
    declarationStore,
    contentStore,
    encryption,
    TEST_JWT_SECRET,
  );
  const hive = new HiveService(auth, encryption, contentStore);
  const rate = new MemoryRateLimitStore();
  const feedback = new FeedbackService(hive, rate);
  return { auth, write, hive, rate, feedback };
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

describe("Loop 1 -- Capsule Relevance", () => {
  it("bumps used capsule relevance by +0.05 and decays unused candidates by -0.02", async () => {
    const { auth, write, feedback } = makeServices();
    const owner = await loginAs(auth);
    // Three capsules with known starting relevance.
    const a = await write.createCapsule(owner.token, {
      capsule_type: "PREFERENCE",
      topic_tags: ["loop1-a"],
      payload_summary: "a",
      content: "a",
    });
    const b = await write.createCapsule(owner.token, {
      capsule_type: "PREFERENCE",
      topic_tags: ["loop1-b"],
      payload_summary: "b",
      content: "b",
    });
    const c = await write.createCapsule(owner.token, {
      capsule_type: "PREFERENCE",
      topic_tags: ["loop1-c"],
      payload_summary: "c",
      content: "c",
    });
    if (!a.ok || !b.ok || !c.ok) throw new Error("create failed");

    // Force known starting relevance values.
    await prisma.memoryCapsule.update({
      where: { capsule_id: a.capsule_id },
      data: { relevance_score: 0.5 },
    });
    await prisma.memoryCapsule.update({
      where: { capsule_id: b.capsule_id },
      data: { relevance_score: 0.5 },
    });
    await prisma.memoryCapsule.update({
      where: { capsule_id: c.capsule_id },
      data: { relevance_score: 0.5 },
    });

    await feedback.runLoop1Once({
      outcome_id: randomUUID(),
      candidate_capsule_ids: [a.capsule_id, b.capsule_id, c.capsule_id],
      used_capsule_ids: [a.capsule_id, b.capsule_id], // c was retrieved but unused
    });

    const aRow = await prisma.memoryCapsule.findUnique({
      where: { capsule_id: a.capsule_id },
    });
    const bRow = await prisma.memoryCapsule.findUnique({
      where: { capsule_id: b.capsule_id },
    });
    const cRow = await prisma.memoryCapsule.findUnique({
      where: { capsule_id: c.capsule_id },
    });
    expect(aRow?.relevance_score).toBeCloseTo(0.55, 5);
    expect(bRow?.relevance_score).toBeCloseTo(0.55, 5);
    expect(cRow?.relevance_score).toBeCloseTo(0.48, 5);
  });

  it("clamps at 1.0 (used) and 0.0 (unused)", async () => {
    const { auth, write, feedback } = makeServices();
    const owner = await loginAs(auth);
    const high = await write.createCapsule(owner.token, {
      capsule_type: "PREFERENCE",
      topic_tags: ["loop1-clamp-high"],
      payload_summary: "high",
      content: "h",
    });
    const low = await write.createCapsule(owner.token, {
      capsule_type: "PREFERENCE",
      topic_tags: ["loop1-clamp-low"],
      payload_summary: "low",
      content: "l",
    });
    if (!high.ok || !low.ok) throw new Error("create failed");
    await prisma.memoryCapsule.update({
      where: { capsule_id: high.capsule_id },
      data: { relevance_score: 0.99 }, // +0.05 would go past 1.0
    });
    await prisma.memoryCapsule.update({
      where: { capsule_id: low.capsule_id },
      data: { relevance_score: 0.01 }, // -0.02 would go past 0.0
    });

    await feedback.runLoop1Once({
      outcome_id: randomUUID(),
      candidate_capsule_ids: [high.capsule_id, low.capsule_id],
      used_capsule_ids: [high.capsule_id],
    });

    const highRow = await prisma.memoryCapsule.findUnique({
      where: { capsule_id: high.capsule_id },
    });
    const lowRow = await prisma.memoryCapsule.findUnique({
      where: { capsule_id: low.capsule_id },
    });
    expect(highRow?.relevance_score).toBeCloseTo(1.0, 5);
    expect(lowRow?.relevance_score).toBeCloseTo(0.0, 5);
  });
});

describe("Loop 2 -- Token Efficiency", () => {
  it("bumps relevance_floor +0.05 when TER < 0.5 with 100+ outcomes", async () => {
    const { feedback } = makeServices();
    // Seed FeedbackConfig with a known floor.
    await prisma.feedbackConfig.deleteMany();
    await prisma.feedbackConfig.create({ data: { relevance_floor: 0.3 } });

    // Insert 100 COEOutcome rows with low TER (used << loaded).
    const sessionId = randomUUID();
    const capsuleId = randomUUID();
    await prisma.cOEOutcome.createMany({
      data: Array.from({ length: 100 }, () => ({
        session_id: sessionId,
        capsule_id: capsuleId,
        success: true,
        tokens_loaded: 1000,
        tokens_used: 200, // TER = 0.2 < 0.5
      })),
    });

    const result = await feedback.runLoop2Once();
    expect(result.outcomes_considered).toBe(100);
    expect(result.ter).toBeCloseTo(0.2, 2);
    expect(result.changed).toBe(true);
    expect(result.new_floor).toBeCloseTo(0.35, 5);
    const config = await prisma.feedbackConfig.findFirst();
    expect(config?.relevance_floor).toBeCloseTo(0.35, 5);
  });

  it("skips adjustment when fewer than 100 outcomes available", async () => {
    const { feedback } = makeServices();
    await prisma.feedbackConfig.deleteMany();
    await prisma.feedbackConfig.create({ data: { relevance_floor: 0.4 } });
    await prisma.cOEOutcome.deleteMany({});
    // Only 5 outcomes -- system is too young.
    await prisma.cOEOutcome.createMany({
      data: Array.from({ length: 5 }, () => ({
        session_id: randomUUID(),
        capsule_id: randomUUID(),
        success: true,
        tokens_loaded: 1000,
        tokens_used: 100,
      })),
    });
    const result = await feedback.runLoop2Once();
    expect(result.changed).toBe(false);
    expect(result.outcomes_considered).toBe(5);
    expect(result.ter).toBeNull();
  });
});

describe("Loop 3 -- Permission Patterns", () => {
  it("creates a PermissionSuggestion when 3+ distinct bridges exist for the same triple", async () => {
    const { auth, write, feedback } = makeServices();
    const grantor = await loginAs(auth);
    const grantee = await loginAs(auth);

    const cap = await write.createCapsule(grantor.token, {
      capsule_type: "DOMAIN_KNOWLEDGE",
      topic_tags: ["loop3"],
      payload_summary: "loop3",
      content: "x",
    });
    if (!cap.ok) throw new Error("create failed");

    // Insert 3 distinct bridges (each one a separate Permission row
    // to keep the test minimal; bridge_id distinguishes them).
    for (let i = 0; i < 3; i++) {
      await prisma.permission.create({
        data: {
          bridge_id: randomUUID(),
          capsule_id: cap.capsule_id,
          grantor_entity_id: grantor.entity.entity_id,
          grantee_entity_id: grantee.entity.entity_id,
          access_scope: "FULL",
          duration_type: "TEMPORARY",
          status: "ACTIVE",
        },
      });
    }

    const result = await feedback.runLoop3Once();
    expect(result.patterns_detected).toBeGreaterThanOrEqual(1);
    const suggestions = await prisma.permissionSuggestion.findMany({
      where: {
        grantor_id: grantor.entity.entity_id,
        grantee_id: grantee.entity.entity_id,
        capsule_type: "DOMAIN_KNOWLEDGE",
      },
    });
    expect(suggestions.length).toBe(1);

    // Idempotent: second run with the same data does not create a
    // duplicate (updates the existing unacknowledged row).
    await feedback.runLoop3Once();
    const after = await prisma.permissionSuggestion.findMany({
      where: {
        grantor_id: grantor.entity.entity_id,
        grantee_id: grantee.entity.entity_id,
        capsule_type: "DOMAIN_KNOWLEDGE",
        acknowledged_at: null,
      },
    });
    expect(after.length).toBe(1);
  });
});

describe("Loop 4 -- Hive Aggregate Refresh", () => {
  it("refreshes ACTIVE Hives with member_count >= 3, including default ENTERPRISE", async () => {
    const { auth, hive, feedback } = makeServices();
    const creator = await loginAs(auth);

    const created = await hive.createHive(
      creator.token,
      "loop4-test",
      "ENTERPRISE",
    );
    if (!created.ok) throw new Error("create failed");
    // Seed member_count to 3 (Loop 4's gate).
    await prisma.hive.update({
      where: { hive_id: created.hive_id },
      data: { member_count: 3 },
    });

    const result = await feedback.runLoop4Once();
    expect(result.hives_refreshed).toBeGreaterThanOrEqual(1);
  });

  it("PORTABILITY: default ENTERPRISE Hive aggregate is owned by the org wallet, not the admin's personal wallet", async () => {
    const { auth, hive } = makeServices();
    const admin = await loginAs(auth);
    const company = await createEntity(
      makeEntityInput({ entity_type: "COMPANY" }),
    );

    // Create a default-enterprise Hive directly so we control
    // is_default_enterprise + org_entity_id.
    const hiveRow = await prisma.hive.create({
      data: {
        hive_name: "loop4-default-portability",
        created_by: admin.entity.entity_id,
        hive_type: "ENTERPRISE",
        org_entity_id: company.entity_id,
        is_default_enterprise: true,
        member_count: 3,
        status: "ACTIVE",
      },
    });
    // Add three memberships so buildHiveAggregate has something to
    // process (the same admin counts as one ACTIVE member -- we
    // just need the row count).
    for (let i = 0; i < 3; i++) {
      const member = await createEntity(
        makeEntityInput({ entity_type: "PERSON" }),
      );
      await prisma.hiveMembership.create({
        data: {
          hive_id: hiveRow.hive_id,
          entity_id: member.entity_id,
          capsule_types_contributed: [],
          contribution_scope: "SUMMARY",
          capsule_types_accessible: [],
          access_scope: "SUMMARY",
        },
      });
    }

    const built = await hive.buildHiveAggregate(hiveRow.hive_id);
    expect(built.ok).toBe(true);
    if (!built.ok) return;

    const aggregate = await prisma.memoryCapsule.findUnique({
      where: { capsule_id: built.aggregate_capsule_id },
    });
    // Aggregate's entity_id MUST be the COMPANY (org), not the admin.
    expect(aggregate?.entity_id).toBe(company.entity_id);
    expect(aggregate?.entity_id).not.toBe(admin.entity.entity_id);

    // And the wallet that owns it is the COMPANY's wallet.
    const companyWallet = await prisma.wallet.findUnique({
      where: { entity_id: company.entity_id },
    });
    expect(aggregate?.wallet_id).toBe(companyWallet?.wallet_id);
  });

  it("REGRESSION: non-default ENTERPRISE Hive aggregate is owned by hive.created_by's wallet", async () => {
    const { auth, hive } = makeServices();
    const creator = await loginAs(auth);
    const created = await hive.createHive(
      creator.token,
      "loop4-non-default",
      "ENTERPRISE",
    );
    if (!created.ok) throw new Error("create failed");
    // Add 3 members.
    for (let i = 0; i < 2; i++) {
      const m = await createEntity(makeEntityInput({ entity_type: "PERSON" }));
      await prisma.hiveMembership.create({
        data: {
          hive_id: created.hive_id,
          entity_id: m.entity_id,
          capsule_types_contributed: [],
          contribution_scope: "SUMMARY",
          capsule_types_accessible: [],
          access_scope: "SUMMARY",
        },
      });
    }
    await prisma.hive.update({
      where: { hive_id: created.hive_id },
      data: { member_count: 3 },
    });

    const built = await hive.buildHiveAggregate(created.hive_id);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const aggregate = await prisma.memoryCapsule.findUnique({
      where: { capsule_id: built.aggregate_capsule_id },
    });
    // For non-default Hives the aggregate stays under hive.created_by.
    expect(aggregate?.entity_id).toBe(creator.entity.entity_id);
  });
});

describe("Loop 5 -- Anomaly Detection", () => {
  it("fires ANOMALY_DETECTED + setMultiplier(0.5, 3600) on a 10x spike vs 7-day avg", async () => {
    const { feedback, rate } = makeServices();
    const actor = await createEntity(
      makeEntityInput({ entity_type: "PERSON" }),
    );
    const owner = await createEntity(
      makeEntityInput({ entity_type: "PERSON" }),
    );
    const fakeCapsuleId = randomUUID();
    // Loop 5 reads audit_events.timestamp; writeAuditEvent always
    // stamps `new Date()` and ignores caller-supplied timestamps,
    // so we cannot use it to seed historical baseline rows. Bypass
    // it via direct prisma insert with a synthetic event_hash --
    // hash-chain integrity is not under test here. The append-only
    // trigger only blocks UPDATE/DELETE, so direct INSERT works.
    //
    // Place baseline rows safely INSIDE the [-7d, -1h) baseline
    // window with both ends offset (>=2h from now, <=167h from
    // now). Loop 5 recomputes its window at invocation time T1
    // which is slightly after the test's T0 -- without offset
    // safety margins the boundary rows can drift outside the
    // window and tank baselineAvg below 1, triggering the
    // bootstrap-skip and falsifying the assertion.
    const now = Date.now();
    const baselineRows = Array.from({ length: 250 }, (_, i) => ({
      event_type: "CAPSULE_CONTENT_READ" as const,
      actor_entity_id: actor.entity_id,
      target_capsule_id: fakeCapsuleId,
      target_entity_id: owner.entity_id,
      outcome: "SUCCESS" as const,
      // Spread 250 rows across hours [-2h .. -2h - (250 * ~37min)]
      // = [-2h .. ~-156h]. All rows comfortably inside [-7d, -1h).
      timestamp: new Date(
        now - 2 * 60 * 60 * 1000 - i * 37 * 60 * 1000,
      ),
      event_hash: `synthetic-${randomUUID()}`,
      previous_event_hash: null,
      details: { synthetic_baseline: true },
    }));
    await prisma.auditEvent.createMany({ data: baselineRows });

    // Spike: 30 audit rows in the last 60 min (= 30x baseline of ~1/hr).
    const spikeRows = Array.from({ length: 30 }, () => ({
      event_type: "CAPSULE_CONTENT_READ" as const,
      actor_entity_id: actor.entity_id,
      target_capsule_id: fakeCapsuleId,
      target_entity_id: owner.entity_id,
      outcome: "SUCCESS" as const,
      timestamp: new Date(),
      event_hash: `synthetic-${randomUUID()}`,
      previous_event_hash: null,
      details: { synthetic_spike: true },
    }));
    await prisma.auditEvent.createMany({ data: spikeRows });

    const result = await feedback.runLoop5Once({
      actor_entity_id: actor.entity_id,
      capsule_id: fakeCapsuleId,
    });
    expect(result.anomaly_detected).toBe(true);
    expect(result.ratio).not.toBeNull();
    expect((result.ratio ?? 0)).toBeGreaterThanOrEqual(10);
    // Multiplier was set on the actor's read_content bucket.
    const mult = await rate.getMultiplier(
      `read_content:entity:${actor.entity_id}`,
    );
    expect(mult).toBe(0.5);
  });

  it("does NOT fire when baseline avg < 1 (bootstrap skip)", async () => {
    const { feedback, rate } = makeServices();
    const actor = await createEntity(
      makeEntityInput({ entity_type: "PERSON" }),
    );
    const fakeCapsuleId = randomUUID();
    // Single recent read, no baseline at all.
    await writeAuditEvent({
      event_type: "CAPSULE_CONTENT_READ",
      outcome: "SUCCESS",
      actor_entity_id: actor.entity_id,
      target_capsule_id: fakeCapsuleId,
      details: {},
    });
    const result = await feedback.runLoop5Once({
      actor_entity_id: actor.entity_id,
      capsule_id: fakeCapsuleId,
    });
    expect(result.anomaly_detected).toBe(false);
    const mult = await rate.getMultiplier(
      `read_content:entity:${actor.entity_id}`,
    );
    expect(mult).toBe(1.0);
  });
});

describe("Loop 6 -- Monetization Demand (PRIVACY)", () => {
  it("PRIVACY INVARIANT: output contains NO accessor entity_ids anywhere", async () => {
    const { feedback } = makeServices();
    const holder = await createEntity(
      makeEntityInput({ entity_type: "PERSON" }),
    );
    // Five distinct accessors.
    const accessors: string[] = [];
    for (let i = 0; i < 5; i++) {
      const a = await createEntity(
        makeEntityInput({ entity_type: "PERSON" }),
      );
      accessors.push(a.entity_id);
    }
    // Six MonetizationEvent rows (HIGH demand) for one capsule_type
    // from the 5 accessors. Need a real capsule_id for the FK
    // implication (capsule_id is plain UUID, no FK, but using a
    // real one keeps things tidy).
    const fakeCapsuleId = randomUUID();
    for (let i = 0; i < 6; i++) {
      await prisma.monetizationEvent.create({
        data: {
          event_id: randomUUID(),
          capsule_id: fakeCapsuleId,
          accessor_entity_id: accessors[i % 5]!,
          wallet_holder_entity_id: holder.entity_id,
          capsule_type: "DOMAIN_KNOWLEDGE",
          gross_value_usd: 0.01,
          niov_fee_usd: 0.003,
          holder_share_usd: 0.007,
          status: "PROCESSED",
        },
      });
    }

    const result = await feedback.runLoop6Once();
    expect(result.suggestions_created).toBeGreaterThanOrEqual(1);

    const suggestions = await prisma.monetizationSuggestion.findMany({
      where: { entity_id: holder.entity_id },
    });
    expect(suggestions.length).toBeGreaterThanOrEqual(1);

    // No accessor entity_id appears in ANY field of ANY suggestion.
    const allText = JSON.stringify(suggestions);
    for (const accessorId of accessors) {
      expect(allText).not.toContain(accessorId);
    }
    // entity_id field on suggestions IS the holder.
    expect(suggestions[0]?.entity_id).toBe(holder.entity_id);
  });
});

describe("Loop 7 -- Meta Health Check", () => {
  it("flags loops whose last_run is older than 2x expected interval", async () => {
    const { feedback } = makeServices();
    // Force loop_2 to look stale: last_run = 5 hours ago (expected 60min, threshold 120min).
    await prisma.feedbackLoopHealth.upsert({
      where: { loop_id: "loop_2" },
      create: {
        loop_id: "loop_2",
        loop_name: "Token Efficiency",
        last_run: new Date(Date.now() - 5 * 60 * 60 * 1000),
        last_status: "OK",
      },
      update: {
        last_run: new Date(Date.now() - 5 * 60 * 60 * 1000),
      },
    });
    // Make loop_4 look fresh (should NOT flag).
    await prisma.feedbackLoopHealth.upsert({
      where: { loop_id: "loop_4" },
      create: {
        loop_id: "loop_4",
        loop_name: "Hive Aggregate Refresh",
        last_run: new Date(),
        last_status: "OK",
      },
      update: { last_run: new Date() },
    });

    const result = await feedback.runLoop7Once();
    expect(result.stale_loops).toContain("loop_2");
    expect(result.stale_loops).not.toContain("loop_4");
    expect(result.stale_loops).not.toContain("loop_7");
  });
});

describe("Scheduler -- test-mode no-op", () => {
  it("startScheduler in NODE_ENV=test returns isRunning=false and a no-op stop", () => {
    const { feedback } = makeServices();
    const handle = startScheduler(feedback);
    expect(handle.isRunning()).toBe(false);
    // stop() must be safely callable.
    expect(() => handle.stop()).not.toThrow();
  });
});
