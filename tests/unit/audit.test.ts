// FILE: audit.test.ts
// PURPOSE: Verify the four AuditEvent functions plus the four required
//          behaviors: chain valid after N writes, tamper detection,
//          UPDATE blocked, DELETE blocked.
// CONNECTS TO: queries/audit.ts, the audit_events table, and the
//              Postgres trigger applyAuditEventTriggers installs.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createEntity,
  getLatestEventHash,
  prisma,
  queryAuditEvents,
  verifyAuditChain,
  writeAuditEvent,
} from "@niov/database";
import {
  cleanupTestData,
  ensureAuditTriggers,
  makeEntityInput,
} from "../helpers.js";

beforeAll(async () => {
  await ensureAuditTriggers();
  await cleanupTestData();
});

afterAll(async () => {
  await cleanupTestData();
  await prisma.$disconnect();
});

// WHAT: Create a fresh test entity to use as the actor for a chain.
// INPUT: None.
// OUTPUT: The new entity's id.
// WHY: Each test wants its own chain so they cannot interfere even
//      when run in any order.
async function makeActor(): Promise<string> {
  const entity = await createEntity(makeEntityInput({ entity_type: "PERSON" }));
  return entity.entity_id;
}

describe("writeAuditEvent", () => {
  it("creates an audit_events row with computed hashes", async () => {
    const actorId = await makeActor();
    const event = await writeAuditEvent({
      event_type: "LOGIN_SUCCESS",
      outcome: "SUCCESS",
      actor_entity_id: actorId,
    });
    expect(event.audit_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(event.event_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(event.previous_event_hash).toBeNull();
  });

  it("links each event to the prior event_hash in the same chain", async () => {
    const actorId = await makeActor();
    const e1 = await writeAuditEvent({
      event_type: "LOGIN_SUCCESS",
      outcome: "SUCCESS",
      actor_entity_id: actorId,
    });
    const e2 = await writeAuditEvent({
      event_type: "SESSION_CREATED",
      outcome: "SUCCESS",
      actor_entity_id: actorId,
    });
    expect(e2.previous_event_hash).toBe(e1.event_hash);
  });

  it("keeps separate chains for different actors", async () => {
    const a = await makeActor();
    const b = await makeActor();
    const ea = await writeAuditEvent({
      event_type: "LOGIN_SUCCESS",
      outcome: "SUCCESS",
      actor_entity_id: a,
    });
    const eb = await writeAuditEvent({
      event_type: "LOGIN_SUCCESS",
      outcome: "SUCCESS",
      actor_entity_id: b,
    });
    expect(ea.previous_event_hash).toBeNull();
    expect(eb.previous_event_hash).toBeNull();
  });
});

describe("verifyAuditChain", () => {
  it("write 5 events, verify chain is valid", async () => {
    const actorId = await makeActor();
    for (let i = 0; i < 5; i++) {
      await writeAuditEvent({
        event_type: "ADMIN_ACTION",
        outcome: "SUCCESS",
        actor_entity_id: actorId,
        details: { iteration: i },
      });
    }
    const result = await verifyAuditChain(actorId);
    expect(result.valid).toBe(true);
    expect(result.totalEvents).toBe(5);
    expect(result.brokenAt).toBeNull();
  });

  it("reports valid for an entity with no events at all", async () => {
    const actorId = await makeActor();
    const result = await verifyAuditChain(actorId);
    expect(result.valid).toBe(true);
    expect(result.totalEvents).toBe(0);
    expect(result.brokenAt).toBeNull();
  });

  it("manually corrupt a record, verify chain detected as broken", async () => {
    const actorId = await makeActor();
    const e1 = await writeAuditEvent({
      event_type: "LOGIN_SUCCESS",
      outcome: "SUCCESS",
      actor_entity_id: actorId,
    });
    await writeAuditEvent({
      event_type: "SESSION_CREATED",
      outcome: "SUCCESS",
      actor_entity_id: actorId,
    });

    // Tampering requires DDL access -- briefly disable the trigger,
    // mutate the first event's denial_reason without recomputing its
    // event_hash, then re-enable. The chain should be detected broken.
    try {
      await prisma.$executeRawUnsafe(
        "ALTER TABLE audit_events DISABLE TRIGGER USER",
      );
      await prisma.auditEvent.update({
        where: { audit_id: e1.audit_id },
        data: { denial_reason: "TAMPERED" },
      });
    } finally {
      await prisma.$executeRawUnsafe(
        "ALTER TABLE audit_events ENABLE TRIGGER USER",
      );
    }

    const result = await verifyAuditChain(actorId);
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(e1.audit_id);
  });

  it("detects a broken chain when an event is reordered", async () => {
    const actorId = await makeActor();
    const e1 = await writeAuditEvent({
      event_type: "LOGIN_SUCCESS",
      outcome: "SUCCESS",
      actor_entity_id: actorId,
    });
    const e2 = await writeAuditEvent({
      event_type: "SESSION_CREATED",
      outcome: "SUCCESS",
      actor_entity_id: actorId,
    });

    // Swap timestamps so e2 looks older than e1. Now e1 (which carries
    // previous_event_hash = null) appears AFTER e2, breaking the chain.
    try {
      await prisma.$executeRawUnsafe(
        "ALTER TABLE audit_events DISABLE TRIGGER USER",
      );
      const e1Time = e1.timestamp;
      const e2Time = e2.timestamp;
      await prisma.auditEvent.update({
        where: { audit_id: e1.audit_id },
        data: { timestamp: new Date(e2Time.getTime() + 1) },
      });
      await prisma.auditEvent.update({
        where: { audit_id: e2.audit_id },
        data: { timestamp: e1Time },
      });
    } finally {
      await prisma.$executeRawUnsafe(
        "ALTER TABLE audit_events ENABLE TRIGGER USER",
      );
    }

    const result = await verifyAuditChain(actorId);
    expect(result.valid).toBe(false);
  });
});

describe("attempts to UPDATE or DELETE on audit_events throw errors", () => {
  it("attempting UPDATE on audit_events throws", async () => {
    const actorId = await makeActor();
    const event = await writeAuditEvent({
      event_type: "LOGIN_SUCCESS",
      outcome: "SUCCESS",
      actor_entity_id: actorId,
    });
    await expect(
      prisma.auditEvent.update({
        where: { audit_id: event.audit_id },
        data: { denial_reason: "should fail" },
      }),
    ).rejects.toThrow(/append-only/i);
  });

  it("attempting DELETE on audit_events throws", async () => {
    const actorId = await makeActor();
    const event = await writeAuditEvent({
      event_type: "LOGIN_SUCCESS",
      outcome: "SUCCESS",
      actor_entity_id: actorId,
    });
    await expect(
      prisma.auditEvent.delete({
        where: { audit_id: event.audit_id },
      }),
    ).rejects.toThrow(/append-only/i);
  });

  it("attempting raw UPDATE via Prisma also throws", async () => {
    const actorId = await makeActor();
    const event = await writeAuditEvent({
      event_type: "LOGIN_SUCCESS",
      outcome: "SUCCESS",
      actor_entity_id: actorId,
    });
    await expect(
      prisma.$executeRawUnsafe(
        `UPDATE audit_events SET denial_reason = 'x' WHERE audit_id = '${event.audit_id}'::uuid`,
      ),
    ).rejects.toThrow(/append-only/i);
  });
});

describe("queryAuditEvents", () => {
  it("returns events filtered by actor_entity_id", async () => {
    const actorId = await makeActor();
    await writeAuditEvent({
      event_type: "ADMIN_ACTION",
      outcome: "SUCCESS",
      actor_entity_id: actorId,
    });
    const result = await queryAuditEvents({ actor_entity_id: actorId });
    expect(result.events.length).toBeGreaterThan(0);
    expect(
      result.events.every((e) => e.actor_entity_id === actorId),
    ).toBe(true);
  });

  it("respects page and page_size", async () => {
    const actorId = await makeActor();
    for (let i = 0; i < 5; i++) {
      await writeAuditEvent({
        event_type: "ADMIN_ACTION",
        outcome: "SUCCESS",
        actor_entity_id: actorId,
        details: { idx: i },
      });
    }
    const page1 = await queryAuditEvents({
      actor_entity_id: actorId,
      page: 1,
      page_size: 2,
    });
    const page2 = await queryAuditEvents({
      actor_entity_id: actorId,
      page: 2,
      page_size: 2,
    });
    expect(page1.events.length).toBe(2);
    expect(page2.events.length).toBe(2);
    expect(page1.total).toBe(5);
    expect(page2.total).toBe(5);
    const ids1 = new Set(page1.events.map((e) => e.audit_id));
    const ids2 = new Set(page2.events.map((e) => e.audit_id));
    for (const id of ids2) expect(ids1.has(id)).toBe(false);
  });

  it("caps page_size at 100 even if a larger value is requested", async () => {
    const result = await queryAuditEvents({ page_size: 1000 });
    expect(result.page_size).toBe(100);
  });

  it("filters by outcome", async () => {
    const actorId = await makeActor();
    await writeAuditEvent({
      event_type: "LOGIN_FAILED",
      outcome: "DENIED",
      actor_entity_id: actorId,
    });
    await writeAuditEvent({
      event_type: "LOGIN_SUCCESS",
      outcome: "SUCCESS",
      actor_entity_id: actorId,
    });
    const denied = await queryAuditEvents({
      actor_entity_id: actorId,
      outcome: "DENIED",
    });
    expect(
      denied.events.every((e) => e.outcome === "DENIED"),
    ).toBe(true);
  });

  it("filters by event_type", async () => {
    const actorId = await makeActor();
    await writeAuditEvent({
      event_type: "LOGIN_SUCCESS",
      outcome: "SUCCESS",
      actor_entity_id: actorId,
    });
    await writeAuditEvent({
      event_type: "LOGOUT",
      outcome: "SUCCESS",
      actor_entity_id: actorId,
    });
    const logins = await queryAuditEvents({
      actor_entity_id: actorId,
      event_type: "LOGIN_SUCCESS",
    });
    expect(
      logins.events.every((e) => e.event_type === "LOGIN_SUCCESS"),
    ).toBe(true);
  });
});

describe("getLatestEventHash", () => {
  it("returns null when the entity has no events yet", async () => {
    const actorId = await makeActor();
    const head = await getLatestEventHash(actorId);
    expect(head).toBeNull();
  });

  it("returns the most recent event_hash after writes", async () => {
    const actorId = await makeActor();
    await writeAuditEvent({
      event_type: "LOGIN_SUCCESS",
      outcome: "SUCCESS",
      actor_entity_id: actorId,
    });
    const e2 = await writeAuditEvent({
      event_type: "ADMIN_ACTION",
      outcome: "SUCCESS",
      actor_entity_id: actorId,
    });
    const head = await getLatestEventHash(actorId);
    expect(head).toBe(e2.event_hash);
  });
});
