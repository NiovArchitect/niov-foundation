// FILE: observe-intake.test.ts
// PURPOSE: Phase 1227 — integration test for the governed Observe
//          pipeline: DEMO_FIXTURE + PLAIN_TEXT extraction end-to-end,
//          structured decisions/commitments, no auto-executed
//          actions, org isolation, workspace attach with ledger
//          import, audit emission, and the no-leak boundary.

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@niov/database";
import { ensureAuditTriggers, cleanupTestData } from "../helpers.js";
import { createEntity } from "../../packages/database/src/queries/entity.js";
import {
  attachObserveCaptureToWorkspaceForCaller,
  extractObserveCaptureForCaller,
  listObserveCapturesForCaller,
  listObserveProvidersForCaller,
} from "../../apps/api/src/services/otzar/observe-intake.service.js";

const TEST_PREFIX = "__niov_test__phase1227__";

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

describe("Phase 1227 — observe intake", () => {
  let orgId = "";
  let employeeId = "";
  let otherOrgId = "";
  let outsiderId = "";

  beforeEach(async () => {
    await ensureAuditTriggers();
    await cleanupTestData();
    orgId = await makeEntity("Observe Org", "COMPANY", 5);
    employeeId = await makeEntity("Observe Employee", "PERSON", 3);
    await prisma.entityMembership.create({
      data: { parent_id: orgId, child_id: employeeId, is_active: true },
    });
    otherOrgId = await makeEntity("Observe Other Org", "COMPANY", 5);
    outsiderId = await makeEntity("Observe Outsider", "PERSON", 3);
    await prisma.entityMembership.create({
      data: { parent_id: otherOrgId, child_id: outsiderId, is_active: true },
    });
  });

  afterAll(async () => {
    await cleanupTestData();
    await prisma.$disconnect();
  });

  it("provider status list is honest and audited", async () => {
    const r = await listObserveProvidersForCaller(employeeId);
    expect(r.ok).toBe(true);
    if (r.ok === false) throw new Error("expected ok");
    const byName = Object.fromEntries(
      r.providers.map((p) => [p.provider, p.status]),
    );
    expect(byName.DEMO_FIXTURE).toBe("DEMO_ONLY");
    expect(byName.PLAIN_TEXT).toBe("READY");
    expect(byName.TESSERACT_LOCAL).toBe("NEEDS_PROVIDER_INSTALL");
    const audit = await prisma.auditEvent.findFirst({
      where: {
        event_type: "OBSERVE_PROVIDER_STATUS_CHECKED",
        actor_entity_id: employeeId,
      },
    });
    expect(audit).not.toBeNull();
  });

  it("DEMO_FIXTURE extraction runs the full pipeline without creating actions", async () => {
    const actionsBefore = await prisma.action.count();
    const r = await extractObserveCaptureForCaller(
      {
        callerEntityId: employeeId,
        provider: "DEMO_FIXTURE",
        sourceType: "DEMO",
        title: `${TEST_PREFIX} whiteboard photo`,
      },
      null,
    );
    expect(r.ok).toBe(true);
    if (r.ok === false) throw new Error("expected ok");
    expect(r.capture.status).toBe("EXTRACTED");
    expect(r.capture.provider).toBe("DEMO_FIXTURE");
    expect(r.capture.extracted_text_summary).toBeTruthy();
    expect(r.capture.extraction).not.toBeNull();
    // The canonical fixture auto-detects DEMO_SCRIPTED and yields the
    // roster-aware structured extraction.
    expect(r.capture.extraction?.extraction_mode).toBe("DEMO_SCRIPTED");
    expect(r.capture.extraction?.decisions.length).toBeGreaterThan(0);
    expect(r.capture.extraction?.commitments.length).toBeGreaterThan(0);
    expect(r.capture.extraction?.suggested_actions.length).toBeGreaterThan(0);

    // Suggested follow-ups are NOT auto-executed.
    const actionsAfter = await prisma.action.count();
    expect(actionsAfter).toBe(actionsBefore);

    // Lifecycle audit emitted.
    for (const t of [
      "OBSERVE_CAPTURE_RECEIVED",
      "OBSERVE_CAPTURE_EXTRACTED",
    ]) {
      const audit = await prisma.auditEvent.findFirst({
        where: { event_type: t, actor_entity_id: employeeId },
      });
      expect(audit, t).not.toBeNull();
    }
  });

  it("PLAIN_TEXT extraction works with LOCAL_FALLBACK and stays honest", async () => {
    const r = await extractObserveCaptureForCaller(
      {
        callerEntityId: employeeId,
        provider: "PLAIN_TEXT",
        sourceType: "PLAIN_TEXT_SOURCE",
        title: `${TEST_PREFIX} pasted notes`,
        plainText:
          "Notes: we decided to renew the vendor contract. Alex will send the renewal terms.",
        forceMode: "LOCAL_FALLBACK",
      },
      null,
    );
    expect(r.ok).toBe(true);
    if (r.ok === false) throw new Error("expected ok");
    expect(r.capture.status).toBe("EXTRACTED");
    expect(r.capture.extraction?.extraction_mode).toBe("LOCAL_FALLBACK");
  });

  it("blocked providers fail closed with an audited failure and no row", async () => {
    const before = await prisma.observeCapture.count();
    const r = await extractObserveCaptureForCaller(
      {
        callerEntityId: employeeId,
        provider: "AWS_TEXTRACT",
        sourceType: "DOCUMENT",
      },
      null,
    );
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.code).toBe("PROVIDER_BLOCKED_BY_KEY");
    expect(await prisma.observeCapture.count()).toBe(before);
    const audit = await prisma.auditEvent.findFirst({
      where: {
        event_type: "OBSERVE_CAPTURE_FAILED",
        actor_entity_id: employeeId,
      },
    });
    expect(audit).not.toBeNull();
  });

  it("captures are caller-scoped — another org's member sees nothing", async () => {
    const created = await extractObserveCaptureForCaller(
      {
        callerEntityId: employeeId,
        provider: "DEMO_FIXTURE",
        sourceType: "DEMO",
      },
      null,
    );
    expect(created.ok).toBe(true);
    const mine = await listObserveCapturesForCaller(employeeId);
    if (mine.ok === false) throw new Error("expected ok");
    expect(mine.captures.length).toBe(1);
    const theirs = await listObserveCapturesForCaller(outsiderId);
    if (theirs.ok === false) throw new Error("expected ok");
    expect(theirs.captures.length).toBe(0);
  });

  it("workspace attach imports decisions + commitments into the ledger", async () => {
    const created = await extractObserveCaptureForCaller(
      {
        callerEntityId: employeeId,
        provider: "DEMO_FIXTURE",
        sourceType: "DEMO",
        title: `${TEST_PREFIX} launch notes`,
      },
      null,
    );
    if (created.ok === false) throw new Error("expected ok");
    const workspace = await prisma.collaborationWorkspace.create({
      data: {
        org_entity_id: orgId,
        title: `${TEST_PREFIX} Launch Workspace`,
        created_by_entity_id: employeeId,
      },
    });
    const attached = await attachObserveCaptureToWorkspaceForCaller({
      callerEntityId: employeeId,
      observeCaptureId: created.capture.observe_capture_id,
      workspaceId: workspace.workspace_id,
    });
    expect(attached.ok).toBe(true);
    if (attached.ok === false) throw new Error("expected ok");
    expect(attached.capture.status).toBe("ATTACHED");
    expect(attached.capture.workspace_id).toBe(workspace.workspace_id);
    expect(attached.imported_decisions).toBeGreaterThan(0);
    expect(attached.imported_commitments).toBeGreaterThan(0);

    const decisions = await prisma.collaborationDecision.count({
      where: { workspace_id: workspace.workspace_id },
    });
    expect(decisions).toBe(attached.imported_decisions);
    // Imported commitments land UNRESOLVED — owners are confirmed by
    // a human through the existing workspace flow, never silently.
    const commitments = await prisma.collaborationCommitment.findMany({
      where: { workspace_id: workspace.workspace_id },
    });
    expect(commitments.length).toBe(attached.imported_commitments);
    for (const c of commitments) {
      expect(c.resolution_status).toBe("UNRESOLVED");
      expect(c.status).toBe("PROPOSED");
    }
    const audit = await prisma.auditEvent.findFirst({
      where: {
        event_type: "OBSERVE_CAPTURE_ATTACHED",
        actor_entity_id: employeeId,
      },
    });
    expect(audit).not.toBeNull();
  });

  it("cross-org attach probes get OBSERVE_CAPTURE_NOT_FOUND (no existence oracle)", async () => {
    const created = await extractObserveCaptureForCaller(
      {
        callerEntityId: employeeId,
        provider: "DEMO_FIXTURE",
        sourceType: "DEMO",
      },
      null,
    );
    if (created.ok === false) throw new Error("expected ok");
    const foreignWorkspace = await prisma.collaborationWorkspace.create({
      data: {
        org_entity_id: otherOrgId,
        title: `${TEST_PREFIX} Foreign Workspace`,
        created_by_entity_id: outsiderId,
      },
    });
    // Outsider cannot attach the employee's capture.
    const probe = await attachObserveCaptureToWorkspaceForCaller({
      callerEntityId: outsiderId,
      observeCaptureId: created.capture.observe_capture_id,
      workspaceId: foreignWorkspace.workspace_id,
    });
    expect(probe).toEqual({ ok: false, code: "OBSERVE_CAPTURE_NOT_FOUND" });
    // Employee cannot attach to another org's workspace.
    const crossWs = await attachObserveCaptureToWorkspaceForCaller({
      callerEntityId: employeeId,
      observeCaptureId: created.capture.observe_capture_id,
      workspaceId: foreignWorkspace.workspace_id,
    });
    expect(crossWs).toEqual({ ok: false, code: "WORKSPACE_NOT_FOUND" });
  });

  it("response carries no raw payloads or developer leakage", async () => {
    const r = await extractObserveCaptureForCaller(
      {
        callerEntityId: employeeId,
        provider: "DEMO_FIXTURE",
        sourceType: "DEMO",
      },
      null,
    );
    if (r.ok === false) throw new Error("expected ok");
    const serialized = JSON.stringify(r.capture);
    for (const banned of [
      "chain_hash",
      "wallet_id",
      "capsule_id",
      "storage_ref",
      "bearer",
    ]) {
      expect(serialized).not.toContain(banned);
    }
  });
});
