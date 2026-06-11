// FILE: calendar-context.test.ts
// PURPOSE: Phase 1236 — integration test for calendar-aware quiet
//          mode: IN_MEETING from real MeetingCapture schedule
//          windows, NONE outside them, external-participant +
//          consent derivation, fixture-driven FOCUS_TIME, caller
//          scoping, and the no-leak boundary.

import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@niov/database";
import { ensureAuditTriggers, cleanupTestData } from "../helpers.js";
import { createEntity } from "../../packages/database/src/queries/entity.js";
import { getCalendarContextForCaller } from "../../apps/api/src/services/otzar/calendar-context.service.js";

const TEST_PREFIX = "__niov_test__phase1236__";

function fakePublicKey(seed: string): string {
  return `-----BEGIN PUBLIC KEY-----\n${seed}\n-----END PUBLIC KEY-----`;
}

async function makeEntity(
  displayName: string,
  entityType: "PERSON" | "COMPANY",
): Promise<string> {
  const e = await createEntity({
    email: `${TEST_PREFIX}${displayName.toLowerCase().replace(/\s/g, ".")}@niov-test.com`,
    public_key: fakePublicKey(displayName),
    display_name: `${TEST_PREFIX} ${displayName}`,
    entity_type: entityType,
    clearance_level: 3,
    status: "ACTIVE",
  });
  return e.entity_id;
}

describe("Phase 1236 — calendar context", () => {
  let orgId = "";
  let employeeId = "";
  let teammateId = "";
  const savedFixture = process.env.MOCK_CALENDAR_FIXTURE;

  beforeEach(async () => {
    delete process.env.MOCK_CALENDAR_FIXTURE;
    await ensureAuditTriggers();
    await cleanupTestData();
    orgId = await makeEntity("Calendar Org", "COMPANY");
    employeeId = await makeEntity("Calendar Employee", "PERSON");
    teammateId = await makeEntity("Calendar Teammate", "PERSON");
    for (const id of [employeeId, teammateId]) {
      await prisma.entityMembership.create({
        data: { parent_id: orgId, child_id: id, is_active: true },
      });
    }
  });

  afterEach(() => {
    if (savedFixture === undefined) delete process.env.MOCK_CALENDAR_FIXTURE;
    else process.env.MOCK_CALENDAR_FIXTURE = savedFixture;
  });

  afterAll(async () => {
    await cleanupTestData();
    await prisma.$disconnect();
  });

  async function makeMeeting(input: {
    capturedBy: string;
    title: string;
    startsInMs: number;
    endsInMs: number;
  }): Promise<string> {
    const now = Date.now();
    const m = await prisma.meetingCapture.create({
      data: {
        org_entity_id: orgId,
        provider: "GOOGLE_MEET",
        title: input.title,
        scheduled_start: new Date(now + input.startsInMs),
        scheduled_end: new Date(now + input.endsInMs),
        captured_by_entity_id: input.capturedBy,
      },
    });
    return m.meeting_capture_id;
  }

  it("an in-window meeting yields quiet_recommended IN_MEETING with safe event fields", async () => {
    const meetingId = await makeMeeting({
      capturedBy: employeeId,
      title: `${TEST_PREFIX} Launch sync with MICE`,
      startsInMs: -10 * 60 * 1000,
      endsInMs: 30 * 60 * 1000,
    });
    const external = await prisma.externalCollaborator.create({
      data: {
        org_entity_id: orgId,
        display_name: `${TEST_PREFIX} Maria External`,
        created_by_entity_id: employeeId,
      },
    });
    await prisma.meetingParticipantConsent.create({
      data: {
        meeting_capture_id: meetingId,
        org_entity_id: orgId,
        external_collaborator_id: external.external_collaborator_id,
        display_name: `${TEST_PREFIX} Maria External`,
        email: "maria@mice-global.example",
        consent_state: "PENDING",
      },
    });

    const r = await getCalendarContextForCaller(employeeId);
    expect(r.ok).toBe(true);
    if (r.ok === false) throw new Error("expected ok");
    expect(r.context.quiet_recommended).toBe(true);
    expect(r.context.quiet_reason).toBe("IN_MEETING");
    expect(r.context.provider_mode).toBe("MOCK_CALENDAR");
    expect(r.context.current_event?.meeting_provider).toBe("GOOGLE_MEET");
    expect(r.context.current_event?.has_external_participants).toBe(true);
    expect(r.context.current_event?.capture_allowed_status).toBe(
      "NEEDS_CONSENT",
    );
    // No-leak boundary: no attendee emails or participant lists.
    const serialized = JSON.stringify(r.context);
    expect(serialized).not.toContain("maria@mice-global.example");
    expect(serialized).not.toContain("Maria External");
    expect(serialized).not.toContain('"participants":');
  });

  it("no current meeting yields quiet_reason NONE; upcoming meeting fills next_event", async () => {
    await makeMeeting({
      capturedBy: employeeId,
      title: `${TEST_PREFIX} Board prep`,
      startsInMs: 60 * 60 * 1000,
      endsInMs: 2 * 60 * 60 * 1000,
    });
    const r = await getCalendarContextForCaller(employeeId);
    if (r.ok === false) throw new Error("expected ok");
    expect(r.context.quiet_recommended).toBe(false);
    expect(r.context.quiet_reason).toBe("NONE");
    expect(r.context.current_event).toBeUndefined();
    expect(r.context.next_event?.title_summary).toContain("Board prep");
    expect(r.context.next_event?.prep_recommended).toBe(true);
  });

  it("the FOCUS_TIME fixture recommends quiet without a meeting", async () => {
    process.env.MOCK_CALENDAR_FIXTURE = "FOCUS_TIME";
    const r = await getCalendarContextForCaller(employeeId);
    if (r.ok === false) throw new Error("expected ok");
    expect(r.context.quiet_recommended).toBe(true);
    expect(r.context.quiet_reason).toBe("FOCUS_TIME");
  });

  it("a teammate's meeting never drives the caller's quiet state", async () => {
    await makeMeeting({
      capturedBy: teammateId,
      title: `${TEST_PREFIX} Teammate 1:1`,
      startsInMs: -5 * 60 * 1000,
      endsInMs: 25 * 60 * 1000,
    });
    const r = await getCalendarContextForCaller(employeeId);
    if (r.ok === false) throw new Error("expected ok");
    expect(r.context.quiet_recommended).toBe(false);
    expect(r.context.quiet_reason).toBe("NONE");
  });

  it("caller with no org gets NO_ORG_FOR_CALLER", async () => {
    const orphan = await makeEntity("Calendar Orphan", "PERSON");
    const r = await getCalendarContextForCaller(orphan);
    expect(r).toEqual({ ok: false, code: "NO_ORG_FOR_CALLER" });
  });
});
