// FILE: work-profile.test.ts (integration, real Postgres, HTTP inject)
// PURPOSE: [ORG-SUBSTRATE] lock the time half of the org substrate:
//          - org operating profile: admin sets the ORG timezone (zero
//            schema — it lives on the org entity's EntityProfile);
//            members read it with the working-policy defaults and the
//            honest proposal-only scheduling note; employees cannot set
//            it; invalid timezones refuse
//          - self work profile: a person sets their OWN timezone
//            without admin help (audited WORK_PROFILE_UPDATED), reads
//            it back with org context
//          - the scheduling-policy engine (pure): the Redwood Atlas
//            matrix — 8AM Pacific rejects for the Pacific attendee but
//            renders 11AM EDT for the Eastern one; lunch blocks reject
//            per-person in LOCAL time; conforming proposals pass; every
//            local time is timezone-labeled; an alternative that fits
//            everyone is suggested; the proposal note never claims
//            event creation.
// CONNECTS TO: scheduling-policy.service.ts, org.routes.ts operating/
//          work-profile routes, EntityProfile.timezone, the Redwood
//          Atlas simulation harness (Phase C).

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { computeTARHash, prisma } from "@niov/database";
import { buildApp, MemoryNonceStore } from "@niov/api";
import {
  DEFAULT_WORKING_POLICY,
  evaluateMeetingProposal,
} from "../../apps/api/src/services/work-os/scheduling-policy.service.js";
import { createEntity } from "../../packages/database/src/queries/entity.js";
import { cleanupTestData, ensureAuditTriggers, TEST_PREFIX } from "../helpers.js";
import type { FastifyInstance } from "fastify";

function fakePublicKey(seed: string): string {
  return `-----BEGIN PUBLIC KEY-----\n${seed}\n-----END PUBLIC KEY-----`;
}
async function makeEntity(displayName: string, entityType: "PERSON" | "COMPANY"): Promise<string> {
  const e = await createEntity({
    email: `${TEST_PREFIX}${displayName.toLowerCase().replace(/[^a-z0-9]/g, ".")}@niov-test.com`,
    public_key: fakePublicKey(displayName + randomUUID()),
    display_name: `${TEST_PREFIX} ${displayName}`,
    entity_type: entityType,
    clearance_level: 3,
    status: "ACTIVE",
  });
  return e.entity_id;
}

describe("[ORG-SUBSTRATE] work profiles + scheduling policy (DB + HTTP + pure)", () => {
  let app: FastifyInstance;
  let orgId = "";
  let adminId = "";

  async function grantOrgAdmin(entityId: string): Promise<void> {
    await prisma.tokenAttributeRepository.update({
      where: { entity_id: entityId },
      data: { can_admin_org: true },
    });
    const fresh = await prisma.tokenAttributeRepository.findUnique({ where: { entity_id: entityId } });
    await prisma.tokenAttributeRepository.update({
      where: { entity_id: entityId },
      data: {
        tar_hash: computeTARHash({
          can_login: fresh!.can_login,
          can_read_capsules: fresh!.can_read_capsules,
          can_write_capsules: fresh!.can_write_capsules,
          can_share_capsules: fresh!.can_share_capsules,
          can_create_hives: fresh!.can_create_hives,
          can_access_external_api: fresh!.can_access_external_api,
          can_admin_niov: fresh!.can_admin_niov,
          can_admin_org: fresh!.can_admin_org,
          clearance_ceiling: fresh!.clearance_ceiling,
          monetization_role: fresh!.monetization_role,
          compliance_frameworks: fresh!.compliance_frameworks,
          status: fresh!.status,
        }),
      },
    });
  }
  async function login(entityId: string, password: string, ip: string): Promise<string> {
    const { hashPassword } = await import("@niov/auth");
    await prisma.entity.update({
      where: { entity_id: entityId },
      data: { password_hash: await hashPassword(password) },
    });
    const email = (await prisma.entity.findUnique({ where: { entity_id: entityId }, select: { email: true } }))!.email!;
    const r = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email, password, requested_operations: ["read", "write", "admin_org"] },
      remoteAddress: ip,
    });
    return (r.json() as { token: string }).token;
  }

  beforeAll(async () => {
    await ensureAuditTriggers();
    app = await buildApp({
      jwtSecret: "work-profile-test-secret",
      sessionNonceStore: new MemoryNonceStore(),
      declarationStore: new MemoryNonceStore(),
    });
  });
  beforeEach(async () => {
    await cleanupTestData();
    orgId = await makeEntity("Time Org", "COMPANY");
    adminId = await makeEntity("Time Admin", "PERSON");
    await grantOrgAdmin(adminId);
    await prisma.entityMembership.create({
      data: { parent_id: orgId, child_id: adminId, is_active: true, is_admin: true },
    });
  });
  afterAll(async () => {
    await app.close();
    await cleanupTestData();
    await prisma.$disconnect();
  });

  it("HTTP: admin sets org timezone; members read it with policy defaults + proposal-only note; employees cannot set; invalid refuses", async () => {
    const password = "correct-horse-battery";
    const adminToken = await login(adminId, password, "10.105.1.9");

    const bad = await app.inject({
      method: "PATCH",
      url: "/api/v1/org/operating-profile",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { org_timezone: "Not/AZone" },
    });
    expect(bad.statusCode).toBe(422);

    const set = await app.inject({
      method: "PATCH",
      url: "/api/v1/org/operating-profile",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { org_timezone: "America/Los_Angeles" },
    });
    expect(set.statusCode).toBe(200);

    const employeeId = await makeEntity("Time Employee", "PERSON");
    await prisma.entityMembership.create({
      data: { parent_id: orgId, child_id: employeeId, is_active: true },
    });
    const empToken = await login(employeeId, password, "10.105.1.10");
    const read = await app.inject({
      method: "GET",
      url: "/api/v1/org/operating-profile",
      headers: { authorization: `Bearer ${empToken}` },
    });
    expect(read.statusCode).toBe(200);
    const body = read.json() as Record<string, unknown>;
    expect(body.org_timezone).toBe("America/Los_Angeles");
    expect((body.working_policy as Record<string, unknown>).work_start_min).toBe(540);
    expect(body.calendar_connected).toBe(false);
    expect(String(body.scheduling_note)).toContain("Proposed times only");
    // Employees cannot set org-level operating truth.
    const denied = await app.inject({
      method: "PATCH",
      url: "/api/v1/org/operating-profile",
      headers: { authorization: `Bearer ${empToken}` },
      payload: { org_timezone: "America/Denver" },
    });
    expect([401, 403]).toContain(denied.statusCode);
  });

  it("HTTP: a person sets their OWN timezone (audited); reads back with org context", async () => {
    const password = "correct-horse-battery";
    const employeeId = await makeEntity("Time Elena", "PERSON");
    await prisma.entityMembership.create({
      data: { parent_id: orgId, child_id: employeeId, is_active: true },
    });
    const empToken = await login(employeeId, password, "10.105.2.9");

    const set = await app.inject({
      method: "PATCH",
      url: "/api/v1/org/me/work-profile",
      headers: { authorization: `Bearer ${empToken}` },
      payload: { timezone: "America/Denver" },
    });
    expect(set.statusCode).toBe(200);
    const read = await app.inject({
      method: "GET",
      url: "/api/v1/org/me/work-profile",
      headers: { authorization: `Bearer ${empToken}` },
    });
    expect((read.json() as Record<string, unknown>).timezone).toBe("America/Denver");
    const audits = await prisma.auditEvent.findMany({
      where: { event_type: "WORK_PROFILE_UPDATED", target_entity_id: employeeId },
    });
    expect(audits.length).toBe(1);
  });

  it("PURE: the Redwood scheduling matrix — hours, lunch, timezones, labels, alternatives, proposal-only", () => {
    // 2026-07-08 is a Wednesday. 15:00Z = 8:00 AM PDT / 9:00 AM MDT / 11:00 AM EDT.
    const attendees = [
      { name: "Maya", timezone: "America/Los_Angeles" },
      { name: "Elena", timezone: "America/Denver" },
      { name: "Theo", timezone: "America/New_York" },
    ];
    const eightAmPacific = evaluateMeetingProposal({
      start_iso: "2026-07-08T15:00:00.000Z",
      duration_min: 30,
      attendees,
      org_timezone: "America/Los_Angeles",
    });
    // 8 AM Pacific is before Maya's 9:00 start → conflict names HER, in
    // HER local words, while Theo's 11:00 AM EDT is fine.
    expect(eightAmPacific.ok).toBe(false);
    expect(eightAmPacific.conflict_summary).toContain("Maya");
    expect(eightAmPacific.conflict_summary).toContain("outside working hours");
    const maya = eightAmPacific.attendees.find((a) => a.name === "Maya")!;
    expect(maya.local_time_label).toContain("8:00 AM");
    expect(maya.local_time_label).toContain("PDT");
    const theo = eightAmPacific.attendees.find((a) => a.name === "Theo")!;
    expect(theo.ok).toBe(true);
    expect(theo.local_time_label).toContain("11:00 AM");
    expect(theo.local_time_label).toContain("EDT");
    // An alternative that fits EVERYONE is proposed.
    expect(eightAmPacific.suggested_alternative_iso).not.toBeNull();
    const alt = evaluateMeetingProposal({
      start_iso: eightAmPacific.suggested_alternative_iso!,
      duration_min: 30,
      attendees,
      org_timezone: "America/Los_Angeles",
    });
    expect(alt.ok).toBe(true);
    expect(eightAmPacific.proposal_note).toContain("Proposed times only");
    expect(eightAmPacific.proposal_note).not.toMatch(/created|scheduled the event/i);

    // Lunch: 19:30Z = 12:30 PM PDT — Maya's lunch; Theo is 3:30 PM EDT (fine),
    // Elena is 1:30 PM MDT (fine, her lunch ended at 1:00).
    const lunch = evaluateMeetingProposal({
      start_iso: "2026-07-08T19:30:00.000Z",
      duration_min: 30,
      attendees,
      org_timezone: "America/Los_Angeles",
    });
    expect(lunch.ok).toBe(false);
    expect(lunch.conflict_summary).toContain("Maya");
    expect(lunch.conflict_summary).toContain("lunch");
    expect(lunch.attendees.find((a) => a.name === "Elena")!.ok).toBe(true);

    // A clean mid-afternoon slot: 21:00Z = 2:00 PM PDT / 3:00 MDT / 5:00 EDT
    // — 5:00 PM EDT + 30min ends 5:30 (Theo's edge, still within 17:30) → ok.
    const clean = evaluateMeetingProposal({
      start_iso: "2026-07-08T21:00:00.000Z",
      duration_min: 30,
      attendees,
      org_timezone: "America/Los_Angeles",
    });
    expect(clean.ok).toBe(true);
    expect(clean.conflict_summary).toBe("");

    // Weekend: Saturday 2026-07-11 → not a working day for everyone.
    const weekend = evaluateMeetingProposal({
      start_iso: "2026-07-11T21:00:00.000Z",
      duration_min: 30,
      attendees,
      org_timezone: "America/Los_Angeles",
    });
    expect(weekend.ok).toBe(false);
    expect(weekend.conflict_summary).toContain("not a working day");

    // Policy defaults are the documented Redwood defaults.
    expect(DEFAULT_WORKING_POLICY.lunch_start_min).toBe(720);
    expect(DEFAULT_WORKING_POLICY.work_end_min).toBe(1050);
  });
});
