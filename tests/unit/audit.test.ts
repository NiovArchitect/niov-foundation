// FILE: audit.test.ts
// PURPOSE: Verify the four AuditEvent functions plus the four required
//          behaviors: chain valid after N writes, tamper detection,
//          UPDATE blocked, DELETE blocked.
// CONNECTS TO: queries/audit.ts, the audit_events table, and the
//              Postgres trigger applyAuditEventTriggers installs.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  AUDIT_EVENT_TYPE_VALUES,
  createEntity,
  getLatestEventHash,
  isKnownAuditEventType,
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

// AUDIT.1 [PERSONALIZATION-AUDIT-LITERAL-CLEAN-TRANSITION] per ADR-0048
// §Audit-Literal Proposals (Q-PERS-θ θ-2): the 5 personalization literals are
// DEFINED as append-only forward-substrate. No emitter exists in AUDIT.1
// (emission is AUDIT.2 / working-set API exposure + future flows); these tests
// only assert the literal vocabulary is present + recognized.
describe("AUDIT.1 — personalization audit literals defined (no emission)", () => {
  const PERSONALIZATION_LITERALS = [
    "WORKING_SET_BUILT",
    "CONTEXT_USED_MANIFEST_RECORDED",
    "PERSONALIZATION_DEGRADED",
    "CROSS_ENTITY_CONTEXT_REQUESTED",
    "PERSONALIZATION_SIGNAL_RECORDED",
  ] as const;

  it("all 5 literals are present in AUDIT_EVENT_TYPE_VALUES", () => {
    for (const lit of PERSONALIZATION_LITERALS) {
      expect(AUDIT_EVENT_TYPE_VALUES).toContain(lit);
    }
  });

  it("isKnownAuditEventType recognizes all 5 literals", () => {
    for (const lit of PERSONALIZATION_LITERALS) {
      expect(isKnownAuditEventType(lit)).toBe(true);
    }
  });

  it("the literal set has no duplicates after the append", () => {
    expect(new Set(AUDIT_EVENT_TYPE_VALUES).size).toBe(AUDIT_EVENT_TYPE_VALUES.length);
  });
});

// ADR-0057 §10 Autonomous Execution Core (Section 2): the 10 ACTION_*
// literals are DEFINED as append-only forward-substrate. No emitter exists
// in this slice (emission is forward-substrate per ADR-0057 §16 step 4-7);
// these tests only assert the literal vocabulary is present + recognized +
// non-duplicated. Mirrors the AUDIT.1 personalization-literals precedent
// exactly.
describe("ADR-0057 §10 — Action audit literals defined (no emission)", () => {
  const ACTION_LITERALS = [
    "ACTION_PROPOSED",
    "ACTION_APPROVED",
    "ACTION_REJECTED",
    "ACTION_SCHEDULED",
    "ACTION_STARTED",
    "ACTION_SUCCEEDED",
    "ACTION_FAILED",
    "ACTION_CANCELLED",
    "ACTION_EXPIRED",
    "ACTION_POLICY_UPDATE",
  ] as const;

  it("all 10 literals are present in AUDIT_EVENT_TYPE_VALUES", () => {
    for (const lit of ACTION_LITERALS) {
      expect(AUDIT_EVENT_TYPE_VALUES).toContain(lit);
    }
  });

  it("isKnownAuditEventType recognizes all 10 literals", () => {
    for (const lit of ACTION_LITERALS) {
      expect(isKnownAuditEventType(lit)).toBe(true);
    }
  });

  it("the literal set has no duplicates after the append", () => {
    expect(new Set(AUDIT_EVENT_TYPE_VALUES).size).toBe(AUDIT_EVENT_TYPE_VALUES.length);
  });
});

// Phase 1288-B — the Foundation Entity & Authority Envelope literal is DEFINED
// as an append-only addition and IS emitted by the authority evaluator (proof
// of every envelope evaluation). These tests assert the literal vocabulary is
// present + recognized + non-duplicated. Mirrors the AUDIT.1 precedent.
describe("1288-B — Foundation authority audit literal defined", () => {
  it("AUTHORITY_ENVELOPE_EVALUATED is present + recognized", () => {
    expect(AUDIT_EVENT_TYPE_VALUES).toContain("AUTHORITY_ENVELOPE_EVALUATED");
    expect(isKnownAuditEventType("AUTHORITY_ENVELOPE_EVALUATED")).toBe(true);
  });

  it("the literal set has no duplicates after the 1288-B append", () => {
    expect(new Set(AUDIT_EVENT_TYPE_VALUES).size).toBe(AUDIT_EVENT_TYPE_VALUES.length);
  });
});

// Phase 1290-A — the Foundation economic-substrate quote literal is DEFINED as
// an append-only addition and IS emitted by the economic-policy evaluator (proof
// of every 402-style quote). Mirrors the AUDIT.1 precedent.
describe("1290-A — Foundation economic-intent audit literal defined", () => {
  it("ECONOMIC_INTENT_QUOTED is present + recognized", () => {
    expect(AUDIT_EVENT_TYPE_VALUES).toContain("ECONOMIC_INTENT_QUOTED");
    expect(isKnownAuditEventType("ECONOMIC_INTENT_QUOTED")).toBe(true);
  });

  it("the literal set has no duplicates after the 1290-A append", () => {
    expect(new Set(AUDIT_EVENT_TYPE_VALUES).size).toBe(AUDIT_EVENT_TYPE_VALUES.length);
  });
});

// Phase 1291-A — the Foundation ambient-device protocol literal is DEFINED as an
// append-only addition and IS emitted by the ambient-device evaluator (proof of
// every governed disposition). Mirrors the AUDIT.1 precedent.
describe("1291-A — Foundation ambient-packet audit literal defined", () => {
  it("AMBIENT_PACKET_EVALUATED is present + recognized", () => {
    expect(AUDIT_EVENT_TYPE_VALUES).toContain("AMBIENT_PACKET_EVALUATED");
    expect(isKnownAuditEventType("AMBIENT_PACKET_EVALUATED")).toBe(true);
  });

  it("the literal set has no duplicates after the 1291-A append", () => {
    expect(new Set(AUDIT_EVENT_TYPE_VALUES).size).toBe(AUDIT_EVENT_TYPE_VALUES.length);
  });
});

// Phase 1292-A — Foundation marketplace substrate literals (append-only).
describe("1292-A — Foundation marketplace audit literals defined", () => {
  it("MARKETPLACE_LISTING_CREATED + MARKETPLACE_ACCESS_EVALUATED present + recognized", () => {
    for (const lit of ["MARKETPLACE_LISTING_CREATED", "MARKETPLACE_ACCESS_EVALUATED"] as const) {
      expect(AUDIT_EVENT_TYPE_VALUES).toContain(lit);
      expect(isKnownAuditEventType(lit)).toBe(true);
    }
  });
  it("the literal set has no duplicates after the 1292-A append", () => {
    expect(new Set(AUDIT_EVENT_TYPE_VALUES).size).toBe(AUDIT_EVENT_TYPE_VALUES.length);
  });
});

// Phase 1293-A — Foundation observability / metering-enforcement literal.
describe("1293-A — Foundation observability audit literal defined", () => {
  it("USAGE_METER_THRESHOLD_REACHED present + recognized", () => {
    expect(AUDIT_EVENT_TYPE_VALUES).toContain("USAGE_METER_THRESHOLD_REACHED");
    expect(isKnownAuditEventType("USAGE_METER_THRESHOLD_REACHED")).toBe(true);
  });
  it("the literal set has no duplicates after the 1293-A append", () => {
    expect(new Set(AUDIT_EVENT_TYPE_VALUES).size).toBe(AUDIT_EVENT_TYPE_VALUES.length);
  });
});

// Phase 1294-A — data marketplace grant / consent ledger literals.
describe("1294-A — Foundation data-grant audit literals defined", () => {
  it("all four grant/consent literals present + recognized", () => {
    for (const lit of ["MARKETPLACE_DATA_CONSENT_RECORDED", "MARKETPLACE_DATA_GRANT_EVALUATED", "MARKETPLACE_DATA_GRANT_CREATED", "MARKETPLACE_DATA_GRANT_REVOKED"] as const) {
      expect(AUDIT_EVENT_TYPE_VALUES).toContain(lit);
      expect(isKnownAuditEventType(lit)).toBe(true);
    }
  });
  it("the literal set has no duplicates after the 1294-A append", () => {
    expect(new Set(AUDIT_EVENT_TYPE_VALUES).size).toBe(AUDIT_EVENT_TYPE_VALUES.length);
  });
});
