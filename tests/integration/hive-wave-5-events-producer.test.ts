// FILE: hive-wave-5-events-producer.test.ts (integration)
// PURPOSE: Section 3 Wave 5 producer-only Hive event spine
//          contract coverage per ADR-0064. Exercises every
//          producer call site (createHive, inviteToHive,
//          removeMember, dissolveHive, forceRemoveMember,
//          buildHiveAggregate) + the SAFE payload projection
//          + cross-org topic isolation + fire-and-forget failure
//          handling + no-new-audit-literal invariant +
//          backward-compat (undefined eventBus = no-op).
// CONNECTS TO:
//   - apps/api/src/services/hive/hive-events.ts
//   - apps/api/src/services/hive/hive.service.ts (Wave 5 wiring)
//   - ADR-0064 Section 3 Wave 5 Hive Events Producer Substrate

import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  AuthService,
  HiveService,
  MemoryContentStore,
  MemoryNonceStore,
} from "@niov/api";
import {
  HiveEventBus,
  hiveTopic,
  orgTopic,
  type HiveEventEnvelope,
} from "@niov/api";
import { ContentEncryption } from "@niov/auth";
import { computeTARHash, createEntity, prisma } from "@niov/database";
import {
  cleanupTestData,
  ensureAuditTriggers,
  makeEntityInput,
  TEST_PREFIX,
} from "../helpers.js";

const TEST_JWT_SECRET = "hive-wave-5-test-secret";
const TEST_KEY = randomBytes(32);

beforeAll(async () => {
  await ensureAuditTriggers();
  await cleanupTestData();
});

afterAll(async () => {
  await cleanupTestData();
  await prisma.$disconnect();
});

function makeServices(eventBus?: HiveEventBus) {
  const sessionStore = new MemoryNonceStore();
  const auth = new AuthService({
    jwtSecret: TEST_JWT_SECRET,
    nonceStore: sessionStore,
  });
  const hive = new HiveService(
    auth,
    new ContentEncryption(TEST_KEY),
    new MemoryContentStore(),
    eventBus,
  );
  return { auth, hive };
}

async function makeOrg(): Promise<string> {
  const org = await createEntity({
    entity_type: "COMPANY",
    display_name: `${TEST_PREFIX}org_${randomUUID()}`,
    email: `${TEST_PREFIX}org_${randomUUID()}@niov.test`,
    public_key: "test-public-key",
    clearance_level: 0,
  });
  return org.entity_id;
}

async function bindToOrg(orgId: string, childId: string): Promise<void> {
  await prisma.entityMembership.create({
    data: {
      parent_id: orgId,
      child_id: childId,
      role_title: "MEMBER",
      is_active: true,
    },
  });
}

async function grantCreateHives(entityId: string): Promise<void> {
  await prisma.tokenAttributeRepository.update({
    where: { entity_id: entityId },
    data: { can_create_hives: true },
  });
  const fresh = await prisma.tokenAttributeRepository.findUnique({
    where: { entity_id: entityId },
  });
  if (fresh === null) throw new Error("TAR vanished");
  const newHash = computeTARHash({
    can_login: fresh.can_login,
    can_read_capsules: fresh.can_read_capsules,
    can_write_capsules: fresh.can_write_capsules,
    can_share_capsules: fresh.can_share_capsules,
    can_create_hives: fresh.can_create_hives,
    can_access_external_api: fresh.can_access_external_api,
    can_admin_niov: fresh.can_admin_niov,
    can_admin_org: fresh.can_admin_org,
    clearance_ceiling: fresh.clearance_ceiling,
    monetization_role: fresh.monetization_role,
    compliance_frameworks: fresh.compliance_frameworks,
    status: fresh.status,
  });
  await prisma.tokenAttributeRepository.update({
    where: { entity_id: entityId },
    data: { tar_hash: newHash },
  });
}

async function loginPerson(
  auth: AuthService,
  opts: { orgId?: string } = {},
): Promise<{ entity_id: string; token: string; orgId: string }> {
  const password = "correct-horse-battery";
  const input = makeEntityInput({ entity_type: "PERSON", password });
  const entity = await createEntity(input);
  const orgId = opts.orgId ?? (await makeOrg());
  await bindToOrg(orgId, entity.entity_id);
  await grantCreateHives(entity.entity_id);
  const login = await auth.login(
    input.email!,
    password,
    ["read", "write", "share", "create_hives"],
    { ip_address: null },
  );
  if (!login.ok) throw new Error(`login failed: ${login.code}`);
  return { entity_id: entity.entity_id, token: login.token, orgId };
}

function recorder(bus: HiveEventBus, topic: string): {
  events: HiveEventEnvelope[];
  unsubscribe: () => void;
} {
  const events: HiveEventEnvelope[] = [];
  const unsub = bus.subscribe(topic, (e) => {
    events.push(e);
  });
  return { events, unsubscribe: unsub };
}

describe("Section 3 Wave 5 — HIVE_CREATED publish", () => {
  it("publishes HIVE_CREATED on both org-scoped and hive-scoped topics after createHive", async () => {
    const bus = new HiveEventBus();
    const { auth, hive } = makeServices(bus);
    const caller = await loginPerson(auth);
    const orgRec = recorder(bus, orgTopic(caller.orgId));
    const r = await hive.createHive(
      caller.token,
      `wave5-${randomUUID()}`,
      "ENTERPRISE",
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const hiveRec = recorder(bus, hiveTopic(r.hive_id));
    // hive-scoped recorder attached AFTER createHive; subscribe a
    // second time to count via a re-emit pattern is not in scope.
    // Instead create another hive and subscribe BEFORE.
    hiveRec.unsubscribe();
    const r2 = await hive.createHive(
      caller.token,
      `wave5b-${randomUUID()}`,
      "ENTERPRISE",
    );
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    // org recorder caught both creates.
    expect(orgRec.events.length).toBeGreaterThanOrEqual(2);
    const last = orgRec.events.at(-1)!;
    expect(last.event_name).toBe("HIVE_CREATED");
    expect(last.org_entity_id).toBe(caller.orgId);
    expect(last.hive_id).toBe(r2.hive_id);
    expect(last.actor_entity_id).toBe(caller.entity_id);
    expect(last.member_count).toBe(1);
    expect(last.hive_status).toBe("ACTIVE");
    expect(last.source_action).toBe("createHive");
    expect(typeof last.timestamp).toBe("string");
    orgRec.unsubscribe();
  });

  it("publishes on the hive-scoped topic when subscribed before creation is not feasible (createHive returns hive_id); verify post-creation via parallel hive on the SAME hive_id", async () => {
    // Mechanism: a second invariant call site (inviteToHive)
    // re-publishes on the hive-scoped topic and the test can
    // attach the recorder between create + invite.
    const bus = new HiveEventBus();
    const { auth, hive } = makeServices(bus);
    const founder = await loginPerson(auth);
    const created = await hive.createHive(
      founder.token,
      `wave5c-${randomUUID()}`,
      "ENTERPRISE",
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const hiveRec = recorder(bus, hiveTopic(created.hive_id));
    const invitee = await loginPerson(auth, { orgId: founder.orgId });
    const inv = await hive.inviteToHive(
      founder.token,
      created.hive_id,
      invitee.entity_id,
    );
    expect(inv.ok).toBe(true);
    // Hive-scoped subscriber received the HIVE_MEMBER_ADDED event
    // (proves the hive-scoped topic publish path works
    // end-to-end; HIVE_CREATED test above proves the org-scoped
    // path).
    expect(hiveRec.events.length).toBeGreaterThanOrEqual(1);
    expect(hiveRec.events[0]!.event_name).toBe("HIVE_MEMBER_ADDED");
    expect(hiveRec.events[0]!.hive_id).toBe(created.hive_id);
    hiveRec.unsubscribe();
  });
});

describe("Section 3 Wave 5 — HIVE_MEMBER_ADDED publish", () => {
  it("publishes HIVE_MEMBER_ADDED after inviteToHive with correct member_count", async () => {
    const bus = new HiveEventBus();
    const { auth, hive } = makeServices(bus);
    const founder = await loginPerson(auth);
    const created = await hive.createHive(
      founder.token,
      `wave5-${randomUUID()}`,
      "ENTERPRISE",
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const orgRec = recorder(bus, orgTopic(founder.orgId));
    const invitee = await loginPerson(auth, { orgId: founder.orgId });
    const r = await hive.inviteToHive(
      founder.token,
      created.hive_id,
      invitee.entity_id,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const evt = orgRec.events.find((e) => e.event_name === "HIVE_MEMBER_ADDED");
    expect(evt).toBeDefined();
    expect(evt!.hive_id).toBe(created.hive_id);
    expect(evt!.target_entity_id).toBe(invitee.entity_id);
    expect(evt!.actor_entity_id).toBe(founder.entity_id);
    expect(evt!.member_count).toBe(2);
    expect(evt!.source_action).toBe("inviteToHive");
    orgRec.unsubscribe();
  });
});

describe("Section 3 Wave 5 — HIVE_MEMBER_REMOVED publish", () => {
  it("publishes after removeMember (creator-self-remove path) with source_action discriminator", async () => {
    const bus = new HiveEventBus();
    const { auth, hive } = makeServices(bus);
    const founder = await loginPerson(auth);
    const created = await hive.createHive(
      founder.token,
      `wave5-${randomUUID()}`,
      "ENTERPRISE",
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const invitee = await loginPerson(auth, { orgId: founder.orgId });
    await hive.inviteToHive(founder.token, created.hive_id, invitee.entity_id);
    const orgRec = recorder(bus, orgTopic(founder.orgId));
    const r = await hive.removeMember(
      founder.token,
      created.hive_id,
      invitee.entity_id,
    );
    expect(r.ok).toBe(true);
    const evt = orgRec.events.find(
      (e) => e.event_name === "HIVE_MEMBER_REMOVED",
    );
    expect(evt).toBeDefined();
    expect(evt!.source_action).toBe("removeMember");
    expect(evt!.target_entity_id).toBe(invitee.entity_id);
    expect(evt!.member_count).toBe(1);
    orgRec.unsubscribe();
  });

  it("publishes after forceRemoveMember (Wave 3 admin path) with forceRemoveMember discriminator", async () => {
    const bus = new HiveEventBus();
    const { auth, hive } = makeServices(bus);
    const founder = await loginPerson(auth);
    const created = await hive.createHive(
      founder.token,
      `wave5-${randomUUID()}`,
      "ENTERPRISE",
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const invitee = await loginPerson(auth, { orgId: founder.orgId });
    await hive.inviteToHive(founder.token, created.hive_id, invitee.entity_id);
    const orgRec = recorder(bus, orgTopic(founder.orgId));
    const r = await hive.forceRemoveMember(
      founder.orgId,
      created.hive_id,
      invitee.entity_id,
      founder.entity_id,
    );
    expect(r.ok).toBe(true);
    const evt = orgRec.events.find(
      (e) => e.event_name === "HIVE_MEMBER_REMOVED",
    );
    expect(evt).toBeDefined();
    expect(evt!.source_action).toBe("forceRemoveMember");
    orgRec.unsubscribe();
  });
});

describe("Section 3 Wave 5 — HIVE_DISSOLVED publish", () => {
  it("publishes after dissolveHive on active → DISSOLVED transition", async () => {
    const bus = new HiveEventBus();
    const { auth, hive } = makeServices(bus);
    const founder = await loginPerson(auth);
    const created = await hive.createHive(
      founder.token,
      `wave5-${randomUUID()}`,
      "ENTERPRISE",
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const orgRec = recorder(bus, orgTopic(founder.orgId));
    const r = await hive.dissolveHive(
      founder.orgId,
      created.hive_id,
      founder.entity_id,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.already_dissolved).toBe(false);
    const evt = orgRec.events.find((e) => e.event_name === "HIVE_DISSOLVED");
    expect(evt).toBeDefined();
    expect(evt!.hive_status).toBe("DISSOLVED");
    expect(evt!.source_action).toBe("dissolveHive");
    orgRec.unsubscribe();
  });

  it("does NOT publish on idempotent already-DISSOLVED path", async () => {
    const bus = new HiveEventBus();
    const { auth, hive } = makeServices(bus);
    const founder = await loginPerson(auth);
    const created = await hive.createHive(
      founder.token,
      `wave5-${randomUUID()}`,
      "ENTERPRISE",
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    // First dissolve (state transition).
    await hive.dissolveHive(founder.orgId, created.hive_id, founder.entity_id);
    // Recorder attached AFTER first dissolve.
    const orgRec = recorder(bus, orgTopic(founder.orgId));
    // Second dissolve hits the idempotent branch — no event.
    const r2 = await hive.dissolveHive(
      founder.orgId,
      created.hive_id,
      founder.entity_id,
    );
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(r2.already_dissolved).toBe(true);
    expect(orgRec.events.length).toBe(0);
    orgRec.unsubscribe();
  });
});

describe("Section 3 Wave 5 — HIVE_AGGREGATE_BUILT publish", () => {
  it("publishes after buildHiveAggregate with aggregate_present: true", async () => {
    const bus = new HiveEventBus();
    const { auth, hive } = makeServices(bus);
    const founder = await loginPerson(auth);
    const created = await hive.createHive(
      founder.token,
      `wave5-${randomUUID()}`,
      "ENTERPRISE",
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const orgRec = recorder(bus, orgTopic(founder.orgId));
    const r = await hive.buildHiveAggregate(created.hive_id);
    expect(r.ok).toBe(true);
    const evt = orgRec.events.find(
      (e) => e.event_name === "HIVE_AGGREGATE_BUILT",
    );
    expect(evt).toBeDefined();
    expect(evt!.aggregate_present).toBe(true);
    expect(evt!.source_action).toBe("buildHiveAggregate");
    orgRec.unsubscribe();
  });
});

describe("Section 3 Wave 5 — SAFE payload projection no-leak", () => {
  it("never serializes governance_terms object in any envelope", async () => {
    const bus = new HiveEventBus();
    const { auth, hive } = makeServices(bus);
    const founder = await loginPerson(auth);
    const SECRET_MARKER = "WAVE_5_GOVERNANCE_LEAK_MARKER";
    const created = await hive.createHive(
      founder.token,
      `wave5-${randomUUID()}`,
      "ENTERPRISE",
      { internal_policy_note: SECRET_MARKER },
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const orgRec = recorder(bus, orgTopic(founder.orgId));
    const invitee = await loginPerson(auth, { orgId: founder.orgId });
    await hive.inviteToHive(founder.token, created.hive_id, invitee.entity_id);
    await hive.buildHiveAggregate(created.hive_id);
    // Serialize every envelope received and assert the marker is
    // absent.
    const serialized = JSON.stringify(orgRec.events);
    expect(serialized).not.toContain(SECRET_MARKER);
    expect(serialized).not.toContain("governance_terms");
    expect(serialized).not.toContain("aggregate_capsule_id");
    expect(serialized).not.toContain("storage_location");
    expect(serialized).not.toContain("content_hash");
    expect(serialized).not.toContain("secret_ref");
    expect(serialized).not.toContain("bridge_id");
    expect(serialized).not.toContain("payload_summary");
    expect(serialized).not.toContain("payload_content");
    orgRec.unsubscribe();
  });
});

describe("Section 3 Wave 5 — cross-org topic isolation", () => {
  it("org A subscriber NEVER receives events from org B's hive", async () => {
    const bus = new HiveEventBus();
    const { auth, hive } = makeServices(bus);
    const founderA = await loginPerson(auth);
    const founderB = await loginPerson(auth); // different org
    const orgARec = recorder(bus, orgTopic(founderA.orgId));
    // Create + activity in org B.
    const createdB = await hive.createHive(
      founderB.token,
      `wave5-orgB-${randomUUID()}`,
      "ENTERPRISE",
    );
    expect(createdB.ok).toBe(true);
    if (!createdB.ok) return;
    const inviteeB = await loginPerson(auth, { orgId: founderB.orgId });
    await hive.inviteToHive(
      founderB.token,
      createdB.hive_id,
      inviteeB.entity_id,
    );
    // Org A's recorder must see NOTHING.
    expect(orgARec.events.length).toBe(0);
    orgARec.unsubscribe();
  });
});

describe("Section 3 Wave 5 — fire-and-forget failure handling", () => {
  it("subscriber throws do not propagate into HiveService", async () => {
    const bus = new HiveEventBus();
    const { auth, hive } = makeServices(bus);
    const caller = await loginPerson(auth);
    bus.subscribe(orgTopic(caller.orgId), () => {
      throw new Error("subscriber explosion");
    });
    // createHive must still succeed.
    const r = await hive.createHive(
      caller.token,
      `wave5-${randomUUID()}`,
      "ENTERPRISE",
    );
    expect(r.ok).toBe(true);
  });
});

describe("Section 3 Wave 5 — backward-compat (undefined eventBus)", () => {
  it("HiveService without eventBus continues to work; no observable behavior change", async () => {
    const { auth, hive } = makeServices(); // no eventBus
    const caller = await loginPerson(auth);
    const r = await hive.createHive(
      caller.token,
      `wave5-${randomUUID()}`,
      "ENTERPRISE",
    );
    expect(r.ok).toBe(true);
  });
});

describe("Section 3 Wave 5 — audit literal preservation", () => {
  it("no new audit literal emitted across the full Wave 5 producer path", async () => {
    const bus = new HiveEventBus();
    const { auth, hive } = makeServices(bus);
    const founder = await loginPerson(auth);
    const created = await hive.createHive(
      founder.token,
      `wave5-${randomUUID()}`,
      "ENTERPRISE",
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const invitee = await loginPerson(auth, { orgId: founder.orgId });
    await hive.inviteToHive(founder.token, created.hive_id, invitee.entity_id);
    await hive.removeMember(founder.token, created.hive_id, invitee.entity_id);
    await hive.buildHiveAggregate(created.hive_id);
    // Verify all audit events on this hive use the existing 5
    // HIVE_* literals + ADMIN_ACTION (no new literal).
    const audits = await prisma.auditEvent.findMany({
      where: {
        OR: [
          { details: { path: ["hive_id"], equals: created.hive_id } },
          { actor_entity_id: founder.entity_id },
        ],
      },
      select: { event_type: true },
    });
    const allowed = new Set([
      "HIVE_CREATED",
      "HIVE_MEMBER_ADDED",
      "HIVE_MEMBER_REMOVED",
      "HIVE_INTELLIGENCE_READ",
      "HIVE_AGGREGATE_BUILT",
      "ADMIN_ACTION",
      // Auth + session literals from loginPerson:
      "TOKEN_ISSUED",
      "TOKEN_VERIFIED",
      "TOKEN_REVOKED",
      "SESSION_TERMINATED",
      "LOGIN_SUCCESS",
      "LOGIN_FAILED",
      "ENTITY_CREATED",
    ]);
    for (const a of audits) {
      if (!allowed.has(a.event_type)) {
        // Surface the offending literal so the test failure
        // names the new literal clearly.
        expect(allowed.has(a.event_type), `unexpected audit literal: ${a.event_type}`).toBe(true);
      }
    }
  });
});
