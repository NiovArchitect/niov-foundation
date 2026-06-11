// FILE: my-day-intelligence.test.ts
// PURPOSE: Phase 1234 — integration test for the My Day intelligence
//          service: caller-scoped signal gathering from real
//          substrate, org isolation, revoked-authority exclusion,
//          external-commitment "waiting on external" framing, honest
//          fixture fallback, and the no-leak response boundary.

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@niov/database";
import { ensureAuditTriggers, cleanupTestData } from "../helpers.js";
import { createEntity } from "../../packages/database/src/queries/entity.js";
import { getMyDayIntelligenceForCaller } from "../../apps/api/src/services/otzar/my-day-intelligence.service.js";

const TEST_PREFIX = "__niov_test__phase1234__";

function fakePublicKey(seed: string): string {
  return `-----BEGIN PUBLIC KEY-----\n${seed}\n-----END PUBLIC KEY-----`;
}

async function makeEntity(
  displayName: string,
  entityType: "PERSON" | "COMPANY",
  clearance = 3,
): Promise<string> {
  const e = await createEntity({
    email: `${TEST_PREFIX}${displayName.toLowerCase().replace(/\s/g, ".")}@niov-test.com`,
    public_key: fakePublicKey(displayName),
    display_name: `${TEST_PREFIX} ${displayName}`,
    entity_type: entityType,
    clearance_level: clearance,
    status: "ACTIVE",
  });
  return e.entity_id;
}

async function joinOrg(orgId: string, childId: string): Promise<void> {
  await prisma.entityMembership.create({
    data: { parent_id: orgId, child_id: childId, is_active: true },
  });
}

describe("Phase 1234 — My Day intelligence", () => {
  let orgId = "";
  let employeeId = "";
  let teammateId = "";
  let otherOrgId = "";
  let outsiderId = "";

  beforeEach(async () => {
    await ensureAuditTriggers();
    await cleanupTestData();
    orgId = await makeEntity("MyDay Org", "COMPANY", 5);
    employeeId = await makeEntity("MyDay Employee", "PERSON", 3);
    teammateId = await makeEntity("MyDay Teammate", "PERSON", 3);
    await joinOrg(orgId, employeeId);
    await joinOrg(orgId, teammateId);
    otherOrgId = await makeEntity("Other Org", "COMPANY", 5);
    outsiderId = await makeEntity("Outsider Person", "PERSON", 3);
    await joinOrg(otherOrgId, outsiderId);
  });

  afterAll(async () => {
    await cleanupTestData();
    await prisma.$disconnect();
  });

  it("gathers caller-scoped signals from real substrate and ranks them", async () => {
    // One unread notification addressed to the employee.
    await prisma.notification.create({
      data: {
        org_entity_id: orgId,
        recipient_entity_id: employeeId,
        source_entity_id: teammateId,
        notification_class: "INTERNAL_NOTE",
        body_summary: `${TEST_PREFIX} a safe note summary`,
      },
    });
    // One collaboration request awaiting the employee.
    await prisma.twinCollaborationRequest.create({
      data: {
        org_entity_id: orgId,
        requester_entity_id: teammateId,
        target_entity_id: employeeId,
        request_type: "CONTEXT_REQUEST",
        target_type: "EMPLOYEE",
        state: "REQUESTED",
        safe_summary: `${TEST_PREFIX} request`,
      },
    });
    // One PROPOSED action the employee created.
    await prisma.action.create({
      data: {
        source_entity_id: employeeId,
        org_entity_id: orgId,
        action_type: "SEND_INTERNAL_NOTIFICATION",
        risk_tier: "LOW",
        policy_envelope: {},
        payload_summary: `${TEST_PREFIX} draft note`,
        payload_redacted: {},
        idempotency_key: `${TEST_PREFIX}-action-1`,
        status: "PROPOSED",
      },
    });

    const r = await getMyDayIntelligenceForCaller(employeeId, {
      fixtureMode: true,
    });
    expect(r.ok).toBe(true);
    if (r.ok === false) throw new Error("expected ok");
    const view = r.intelligence;

    expect(view.signals.unread_notifications_count).toBe(1);
    expect(view.signals.collaboration_inbox_pending_count).toBe(1);
    expect(view.signals.proposed_actions_count).toBe(1);
    expect(view.signals.recent_action_count).toBe(1);
    expect(view.suggestions.length).toBeGreaterThan(0);
    expect(view.provider_status).toBe("FIXTURE_PROVIDER_DISABLED");
    expect(view.headline).toContain("Otzar found");
  });

  it("does not leak another org's signals into the caller's view", async () => {
    // Outsider org generates signals of every cheap kind.
    await prisma.notification.create({
      data: {
        org_entity_id: otherOrgId,
        recipient_entity_id: outsiderId,
        source_entity_id: otherOrgId,
        notification_class: "INTERNAL_NOTE",
        body_summary: `${TEST_PREFIX} other org note summary`,
      },
    });
    await prisma.action.create({
      data: {
        source_entity_id: outsiderId,
        org_entity_id: otherOrgId,
        action_type: "SEND_INTERNAL_NOTIFICATION",
        risk_tier: "LOW",
        policy_envelope: {},
        payload_summary: `${TEST_PREFIX} other-org action`,
        payload_redacted: {},
        idempotency_key: `${TEST_PREFIX}-action-other`,
        status: "PROPOSED",
      },
    });

    const r = await getMyDayIntelligenceForCaller(employeeId, {
      fixtureMode: true,
    });
    if (r.ok === false) throw new Error("expected ok");
    expect(r.intelligence.signals.unread_notifications_count).toBe(0);
    expect(r.intelligence.signals.proposed_actions_count).toBe(0);
    expect(r.intelligence.signals.recent_action_count).toBe(0);
  });

  it("excludes revoked authority grants from every grant signal", async () => {
    await prisma.twinAuthorityGrant.create({
      data: {
        org_entity_id: orgId,
        grantor_entity_id: employeeId,
        grantee_entity_id: teammateId,
        scope_type: "PROJECT",
        duration_class: "SENSITIVE_CASE_BY_CASE",
        sensitivity_class: "HIGH",
        state: "REVOKED",
        purpose_summary: `${TEST_PREFIX} revoked grant`,
      },
    });
    await prisma.twinAuthorityGrant.create({
      data: {
        org_entity_id: orgId,
        grantor_entity_id: employeeId,
        grantee_entity_id: teammateId,
        scope_type: "PROJECT",
        duration_class: "SHORT_TERM",
        sensitivity_class: "LOW",
        state: "ACTIVE",
        expires_at: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        purpose_summary: `${TEST_PREFIX} active grant`,
      },
    });

    const r = await getMyDayIntelligenceForCaller(employeeId, {
      fixtureMode: true,
    });
    if (r.ok === false) throw new Error("expected ok");
    expect(r.intelligence.signals.active_authority_grants_count).toBe(1);
    expect(r.intelligence.signals.expiring_soon_grants_count).toBe(1);
    // The revoked SENSITIVE_CASE_BY_CASE grant must NOT count.
    expect(r.intelligence.signals.sensitive_case_by_case_grants_count).toBe(0);
  });

  it("frames external commitments as waiting-on-external with internal-owner context only", async () => {
    const workspace = await prisma.collaborationWorkspace.create({
      data: {
        org_entity_id: orgId,
        title: `${TEST_PREFIX} MICE Expansion`,
        created_by_entity_id: employeeId,
        visibility: "EXTERNAL_ALLOWED",
      },
    });
    const external = await prisma.externalCollaborator.create({
      data: {
        org_entity_id: orgId,
        display_name: `${TEST_PREFIX} Maria External`,
        company_name: "MICE Global",
        created_by_entity_id: employeeId,
        internal_owner_entity_id: employeeId,
      },
    });
    await prisma.externalCommitment.create({
      data: {
        workspace_id: workspace.workspace_id,
        org_entity_id: orgId,
        external_collaborator_id: external.external_collaborator_id,
        direction: "EXTERNAL_OWES_INTERNAL",
        text: `${TEST_PREFIX} stage equipment list`,
        internal_owner_entity_id: employeeId,
        added_by_entity_id: employeeId,
      },
    });
    await prisma.externalCommitment.create({
      data: {
        workspace_id: workspace.workspace_id,
        org_entity_id: orgId,
        external_collaborator_id: external.external_collaborator_id,
        direction: "INTERNAL_OWES_EXTERNAL",
        text: `${TEST_PREFIX} venue contract draft`,
        internal_owner_entity_id: employeeId,
        added_by_entity_id: employeeId,
      },
    });

    const r = await getMyDayIntelligenceForCaller(employeeId, {
      fixtureMode: true,
    });
    if (r.ok === false) throw new Error("expected ok");
    expect(r.intelligence.waiting_on_external.they_owe_us_count).toBe(1);
    expect(r.intelligence.waiting_on_external.we_owe_them_count).toBe(1);
    // No external-collaborator private details leak into the view.
    const serialized = JSON.stringify(r.intelligence);
    expect(serialized).not.toContain("Maria External");
    expect(serialized).not.toContain("MICE Global");
    expect(serialized).not.toContain("stage equipment list");
  });

  it("response carries no raw payloads, audit details, or developer vocabulary", async () => {
    const r = await getMyDayIntelligenceForCaller(employeeId, {
      fixtureMode: true,
    });
    if (r.ok === false) throw new Error("expected ok");
    const serialized = JSON.stringify(r.intelligence);
    for (const banned of [
      "payload_redacted",
      "policy_envelope",
      "idempotency_key",
      '"details"',
      "chain_hash",
      "capsule_id",
      "wallet_id",
    ]) {
      expect(serialized).not.toContain(banned);
    }
  });

  it("caller with no org gets NO_ORG_FOR_CALLER", async () => {
    const orphan = await makeEntity("Orphan Person", "PERSON", 3);
    const r = await getMyDayIntelligenceForCaller(orphan, {
      fixtureMode: true,
    });
    expect(r).toEqual({ ok: false, code: "NO_ORG_FOR_CALLER" });
  });
});
