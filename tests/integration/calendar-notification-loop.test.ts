// FILE: calendar-notification-loop.test.ts (integration)
// PURPOSE: [ORG-AUTONOMY-SPINE] Lock the calendar → permission-scoped fan-out
//          loop end to end against the real DB. A real Google create/delete
//          (provider fetch + connector-oauth are mocked; the DB is real) must:
//            1. fan a CALENDAR_EVENT_CREATED notification to the CLOSED,
//               proposal-DERIVED recipient set (actor + attendee entity_ids +
//               owner) and NOBODY else — a non-party gets zero.
//            2. write a terminal MEETING WorkLedger row (EXECUTED) that reads
//               as completed, not needs-action.
//            3. write NO notification + NO ledger row when a gate blocks the
//               create (honest gate code preserved).
//            4. notify only the derived set when participants lack entity_id.
//            5. on delete: patch the MEETING row CANCELLED + fan a
//               CALENDAR_EVENT_CANCELLED notification to the same set.
//          Self-scope: recipient A's row never surfaces when reading as B.
//          body_summary carries no token/secret; recipients are same-org
//          active only (enforced by createInternalNotification).
// CONNECTS TO:
//   - apps/api/src/services/connector/calendar-event.service.ts (the spine)
//   - apps/api/src/services/notification/notification.service.ts
//   - apps/api/src/services/work-os/work-ledger.service.ts
//   - apps/api/src/routes/notification.routes.ts (self-scope read)

import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { grantedScopesMock, tokenMock } = vi.hoisted(() => ({
  grantedScopesMock: vi.fn(),
  tokenMock: vi.fn(),
}));

vi.mock(
  "../../apps/api/src/services/connector/connector-oauth.service.js",
  () => ({
    getProviderGrantedScopes: grantedScopesMock,
    getProviderAccessTokenForOrg: tokenMock,
  }),
);

import {
  buildApp,
  MemoryContentStore,
  MemoryNonceStore,
  MemoryRateLimitStore,
} from "@niov/api";
import { ContentEncryption } from "@niov/auth";
import { computeTARHash, createEntity, prisma } from "@niov/database";
import {
  cleanupTestData,
  ensureAuditTriggers,
  makeEntityInput,
  TEST_PREFIX,
  withCleanRateLimits,
} from "../helpers.js";
import {
  createCalendarEvent,
  deleteCalendarEvent,
  type CalendarEventProposalInput,
} from "../../apps/api/src/services/connector/calendar-event.service.js";
import type { FastifyInstance } from "fastify";

const TEST_JWT_SECRET = "calendar-loop-test-secret";
const TEST_KEY = randomBytes(32);
const EVENT_WRITE_SCOPE = "https://www.googleapis.com/auth/calendar.events";

let app: FastifyInstance;
const store = new MemoryRateLimitStore();

async function cleanupLoopData(): Promise<void> {
  const testEntities = await prisma.entity.findMany({
    where: { display_name: { startsWith: TEST_PREFIX } },
    select: { entity_id: true },
  });
  const ids = testEntities.map((e) => e.entity_id);
  if (ids.length === 0) return;
  await prisma.notification.deleteMany({
    where: {
      OR: [
        { recipient_entity_id: { in: ids } },
        { source_entity_id: { in: ids } },
        { org_entity_id: { in: ids } },
      ],
    },
  });
  await prisma.workLedgerEntry.deleteMany({ where: { org_entity_id: { in: ids } } });
}

beforeAll(async () => {
  await ensureAuditTriggers();
  await cleanupLoopData();
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
  await cleanupLoopData();
  await cleanupTestData();
  await prisma.$disconnect();
});

withCleanRateLimits(store);

async function makeTestOrg(): Promise<string> {
  const org = await createEntity({
    entity_type: "COMPANY",
    display_name: `${TEST_PREFIX}org_${randomUUID()}`,
    email: `${TEST_PREFIX}org_${randomUUID()}@niov.test`,
    public_key: "test-public-key",
    clearance_level: 0,
  });
  return org.entity_id;
}

// Create an active org member. When `login` is true, returns a bearer token +
// ip so the caller can read their own notification inbox over HTTP.
async function makeOrgMember(
  orgId: string,
  login = false,
): Promise<{ entityId: string; token?: string; ip?: string }> {
  const password = "correct-horse-battery";
  const input = makeEntityInput({ entity_type: "PERSON", password });
  const entity = await createEntity(input);
  await prisma.entityMembership.create({
    data: {
      parent_id: orgId,
      child_id: entity.entity_id,
      role_title: "MEMBER",
      is_active: true,
    },
  });
  const fresh = await prisma.tokenAttributeRepository.findUnique({
    where: { entity_id: entity.entity_id },
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
    where: { entity_id: entity.entity_id },
    data: { tar_hash: newHash },
  });
  if (!login) return { entityId: entity.entity_id };
  const ip = `10.91.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 254) + 1}`;
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email: input.email, password, requested_operations: ["read", "write"] },
    remoteAddress: ip,
  });
  if (res.statusCode !== 200) throw new Error(`login failed: ${res.statusCode} ${res.body}`);
  return { entityId: entity.entity_id, token: (res.json() as { token: string }).token, ip };
}

// A fetch stub: POST (events.insert) → a real-shaped created event with the
// given id; DELETE → 204. Provider is genuinely "called" (never fabricated).
function stubProviderFetch(eventId: string): void {
  const start = "2026-08-01T15:00:00Z";
  const end = "2026-08-01T15:30:00Z";
  const fetchMock = vi.fn(async (_url: string, init?: { method?: string }) => {
    if (init?.method === "DELETE") {
      return { ok: true, status: 204, json: async () => ({}) } as unknown as Response;
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        id: eventId,
        htmlLink: `https://calendar.google.com/e/${eventId}`,
        start: { dateTime: start },
        end: { dateTime: end },
      }),
    } as unknown as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
}

function readyProposal(
  over: Partial<CalendarEventProposalInput> = {},
): CalendarEventProposalInput {
  return {
    title: "Quarterly sync",
    participants: [{ label: "Attendee", resolved: true }],
    selected_time: { start: "2026-08-01T15:00:00Z", end: "2026-08-01T15:30:00Z" },
    participant_confirmations_satisfied: true,
    requires_approval: false,
    approved: false,
    caller_confirmed: true,
    ...over,
  };
}

async function notificationsFor(
  recipient: string,
  klass: string,
): Promise<number> {
  return prisma.notification.count({
    where: { recipient_entity_id: recipient, notification_class: klass },
  });
}

beforeEach(() => {
  // Default: connected + event-write scope + a live token. Individual tests
  // override grantedScopesMock (mockResolvedValueOnce) for the honest-block case.
  grantedScopesMock.mockReset();
  tokenMock.mockReset();
  grantedScopesMock.mockResolvedValue([EVENT_WRITE_SCOPE]);
  tokenMock.mockResolvedValue({ ok: true, access_token: "tok-int" });
});

describe("[ORG-AUTONOMY-SPINE] calendar create → permission-scoped fan-out", () => {
  it("notifies the CLOSED derived set (actor + attendee + owner), nobody else, + writes a terminal MEETING row", async () => {
    const orgId = await makeTestOrg();
    const actor = await makeOrgMember(orgId);
    const attendee = await makeOrgMember(orgId);
    const owner = await makeOrgMember(orgId);
    const nonParty = await makeOrgMember(orgId);
    const eventId = `evt-${randomUUID()}`;
    stubProviderFetch(eventId);

    const r = await createCalendarEvent({
      actor_entity_id: actor.entityId,
      org_entity_id: orgId,
      input: readyProposal({
        title: "Board review",
        participants: [{ label: "Attendee", resolved: true, entity_id: attendee.entityId }],
        owner_entity_id: owner.entityId,
      }),
    });
    vi.unstubAllGlobals();

    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("expected created");
    expect(r.event_id).toBe(eventId);

    // Each derived recipient got exactly one CREATED notification.
    expect(await notificationsFor(actor.entityId, "CALENDAR_EVENT_CREATED")).toBe(1);
    expect(await notificationsFor(attendee.entityId, "CALENDAR_EVENT_CREATED")).toBe(1);
    expect(await notificationsFor(owner.entityId, "CALENDAR_EVENT_CREATED")).toBe(1);
    // A same-org non-party gets ZERO.
    expect(await notificationsFor(nonParty.entityId, "CALENDAR_EVENT_CREATED")).toBe(0);

    // Terminal MEETING ledger row, owned by the owner, EXECUTED (reads as done).
    const row = await prisma.workLedgerEntry.findFirst({
      where: {
        org_entity_id: orgId,
        ledger_type: "MEETING",
        details: { path: ["event_id"], equals: eventId },
      },
    });
    expect(row).not.toBeNull();
    expect(row?.status).toBe("EXECUTED");
    expect(row?.owner_entity_id).toBe(owner.entityId);

    // body_summary carries no token/secret.
    const created = await prisma.notification.findFirst({
      where: { recipient_entity_id: actor.entityId, notification_class: "CALENDAR_EVENT_CREATED" },
    });
    expect(created?.body_summary).not.toContain("tok-int");
    expect(created?.body_summary).not.toContain(EVENT_WRITE_SCOPE);
    expect(created?.source_entity_id).toBe(actor.entityId);
  });

  it("a gate-blocked create writes NO notification + NO ledger row + returns the honest code", async () => {
    const orgId = await makeTestOrg();
    const actor = await makeOrgMember(orgId);
    const attendee = await makeOrgMember(orgId);
    stubProviderFetch(`evt-${randomUUID()}`);

    const r = await createCalendarEvent({
      actor_entity_id: actor.entityId,
      org_entity_id: orgId,
      input: readyProposal({
        caller_confirmed: false, // human gate unmet → blocks before any provider call
        participants: [{ label: "Attendee", resolved: true, entity_id: attendee.entityId }],
      }),
    });
    vi.unstubAllGlobals();

    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected blocked");
    expect(r.code).toBe("NEEDS_CALLER_CONFIRMATION");
    expect(await notificationsFor(actor.entityId, "CALENDAR_EVENT_CREATED")).toBe(0);
    expect(await notificationsFor(attendee.entityId, "CALENDAR_EVENT_CREATED")).toBe(0);
    const rowCount = await prisma.workLedgerEntry.count({
      where: { org_entity_id: orgId, ledger_type: "MEETING" },
    });
    expect(rowCount).toBe(0);
  });

  it("a scope-less token blocks honestly (EVENT_WRITE_SCOPE_MISSING) with NO notification", async () => {
    const orgId = await makeTestOrg();
    const actor = await makeOrgMember(orgId);
    grantedScopesMock.mockResolvedValueOnce([
      "https://www.googleapis.com/auth/calendar.readonly",
    ]);

    const r = await createCalendarEvent({
      actor_entity_id: actor.entityId,
      org_entity_id: orgId,
      input: readyProposal(),
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected blocked");
    expect(r.code).toBe("EVENT_WRITE_SCOPE_MISSING");
    expect(await notificationsFor(actor.entityId, "CALENDAR_EVENT_CREATED")).toBe(0);
  });

  it("participants without entity_id → only the derived set (actor + owner) is notified", async () => {
    const orgId = await makeTestOrg();
    const actor = await makeOrgMember(orgId);
    const owner = await makeOrgMember(orgId);
    const eventId = `evt-${randomUUID()}`;
    stubProviderFetch(eventId);

    const r = await createCalendarEvent({
      actor_entity_id: actor.entityId,
      org_entity_id: orgId,
      input: readyProposal({
        participants: [
          { label: "Unresolved person", resolved: true }, // no entity_id → not notified
        ],
        owner_entity_id: owner.entityId,
      }),
    });
    vi.unstubAllGlobals();
    expect(r.ok).toBe(true);

    expect(await notificationsFor(actor.entityId, "CALENDAR_EVENT_CREATED")).toBe(1);
    expect(await notificationsFor(owner.entityId, "CALENDAR_EVENT_CREATED")).toBe(1);
    // The persisted set is exactly [actor, owner].
    const row = await prisma.workLedgerEntry.findFirst({
      where: { org_entity_id: orgId, ledger_type: "MEETING", details: { path: ["event_id"], equals: eventId } },
    });
    const stored = (row?.details as { recipient_entity_ids?: string[] }).recipient_entity_ids ?? [];
    expect(stored.sort()).toEqual([actor.entityId, owner.entityId].sort());
  });
});

describe("[ORG-AUTONOMY-SPINE] calendar delete → CANCELLED fan-out + ledger patch", () => {
  it("patches the MEETING row CANCELLED + notifies the create-time set", async () => {
    const orgId = await makeTestOrg();
    const actor = await makeOrgMember(orgId); // also the owner (owner defaults to actor)
    const attendee = await makeOrgMember(orgId);
    const eventId = `evt-${randomUUID()}`;
    stubProviderFetch(eventId);

    const created = await createCalendarEvent({
      actor_entity_id: actor.entityId,
      org_entity_id: orgId,
      input: readyProposal({
        participants: [{ label: "Attendee", resolved: true, entity_id: attendee.entityId }],
      }),
    });
    expect(created.ok).toBe(true);

    const del = await deleteCalendarEvent({
      actor_entity_id: actor.entityId,
      org_entity_id: orgId,
      event_id: eventId,
    });
    vi.unstubAllGlobals();
    expect(del.ok).toBe(true);

    // Ledger row flipped to CANCELLED (actor is the owner → patch authorized).
    const row = await prisma.workLedgerEntry.findFirst({
      where: { org_entity_id: orgId, ledger_type: "MEETING", details: { path: ["event_id"], equals: eventId } },
    });
    expect(row?.status).toBe("CANCELLED");

    // Cancellation notifications fanned to the same closed set.
    expect(await notificationsFor(actor.entityId, "CALENDAR_EVENT_CANCELLED")).toBe(1);
    expect(await notificationsFor(attendee.entityId, "CALENDAR_EVENT_CANCELLED")).toBe(1);
  });
});

describe("[ORG-AUTONOMY-SPINE] notification read is self-scoped", () => {
  it("recipient A's calendar notification is not returned when reading as B", async () => {
    const orgId = await makeTestOrg();
    const actor = await makeOrgMember(orgId, true); // recipient A (also caller/source)
    const other = await makeOrgMember(orgId, true); // recipient B, a different party
    stubProviderFetch(`evt-${randomUUID()}`);

    await createCalendarEvent({
      actor_entity_id: actor.entityId,
      org_entity_id: orgId,
      input: readyProposal({
        participants: [{ label: "Other", resolved: true, entity_id: other.entityId }],
      }),
    });
    vi.unstubAllGlobals();

    const readInbox = async (caller: { token?: string; ip?: string }): Promise<Set<string>> => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/notifications?notification_class=CALENDAR_EVENT_CREATED",
        headers: { authorization: `Bearer ${caller.token}` },
        remoteAddress: caller.ip,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { notifications: Array<{ notification_id: string }> };
      return new Set(body.notifications.map((n) => n.notification_id));
    };

    const aRows = await readInbox(actor);
    const bRows = await readInbox(other);
    // Both are legitimate recipients, so each has their OWN row — but the sets
    // are disjoint: A never sees B's notification_id and vice versa.
    expect(aRows.size).toBe(1);
    expect(bRows.size).toBe(1);
    const intersection = [...aRows].filter((id) => bRows.has(id));
    expect(intersection).toEqual([]);
  });
});
