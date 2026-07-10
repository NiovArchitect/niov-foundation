// FILE: source-recheck.test.ts (integration, real Postgres)
// PURPOSE: [INBOUND-RECHECK · Slice 1] Lock the scheduled per-org source recheck
//          tick: fail-closed allowlist, governed ACTIVE actor + actor→org guard,
//          bounded, and QUIET — auditMode/notifyMode "on_transition" so:
//            - no targets            -> no-op (nothing touched)
//            - unchanged source      -> AVAILABLE, NO notification, NO SOURCE_VERIFIED audit
//            - changed upstream       -> CHANGED_UPSTREAM, ONE notification + audit (transition)
//            - still-changed re-run   -> NO new notification, NO new audit (same state)
//            - escalation CHANGED->DELETED -> notifies (a transition)
//            - transient fetch        -> no demotion, no notification (network blip)
//            - actor→org mismatch     -> skipped (a typo can't touch the wrong org)
//            - suspended actor        -> skipped
//            - per-run org cap        -> respected
//          The injected upstream fetch DISPATCHES on file_id so one tick drives
//          every branch WITHOUT any real network. No demo-org concept exists in
//          the test DB; safety is structural (fail-closed allowlist).
// CONNECTS TO: source-recheck.service.ts, source-health.service.ts,
//          document-context.service.ts, notification.service.ts.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { computeTARHash, prisma } from "@niov/database";
import {
  tickSourceRecheck,
  parseRecheckTargets,
  maxOrgsPerRun,
} from "../../apps/api/src/services/otzar/source-recheck.service.js";
import { SOURCE_HEALTH_NOTIFICATION_CLASS } from "../../apps/api/src/services/otzar/source-health.service.js";
import {
  importGoogleDocForCaller,
  type FetchDocText,
} from "../../apps/api/src/services/otzar/document-context.service.js";
import { createEntity } from "../../packages/database/src/queries/entity.js";
import { cleanupTestData, ensureAuditTriggers, TEST_PREFIX } from "../helpers.js";

function fakePublicKey(seed: string): string {
  return `-----BEGIN PUBLIC KEY-----\n${seed}\n-----END PUBLIC KEY-----`;
}
async function makeEntity(name: string, type: "PERSON" | "COMPANY"): Promise<string> {
  const e = await createEntity({
    email: `${TEST_PREFIX}${name.toLowerCase().replace(/[^a-z0-9]/g, ".")}.${randomUUID().slice(0, 6)}@niov-test.com`,
    public_key: fakePublicKey(name + randomUUID()),
    display_name: `${TEST_PREFIX} ${name}`,
    entity_type: type,
    clearance_level: 3,
    status: "ACTIVE",
  });
  return e.entity_id;
}
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
function fetchByFileId(map: Record<string, Awaited<ReturnType<FetchDocText>>>): FetchDocText {
  return async (args) => {
    const hit = map[args.file_id];
    if (hit === undefined) throw new Error(`unexpected file_id: ${args.file_id}`);
    return hit;
  };
}
function okExport(fileId: string, sha: string): Awaited<ReturnType<FetchDocText>> {
  return {
    ok: true,
    provider: "google",
    file_id: fileId,
    name: "upstream",
    modified_time: "2026-07-05T00:00:00Z",
    web_view_link: null,
    content_sha256: sha,
    text: "upstream text",
  };
}
const NOT_FOUND: Awaited<ReturnType<FetchDocText>> = { ok: false, code: "NOT_FOUND" };
const TRANSIENT: Awaited<ReturnType<FetchDocText>> = { ok: false, code: "PROVIDER_ERROR" };

async function cleanup(): Promise<void> {
  const ents = await prisma.entity.findMany({
    where: { display_name: { startsWith: TEST_PREFIX } },
    select: { entity_id: true },
  });
  const ids = ents.map((e) => e.entity_id);
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

describe("[INBOUND-RECHECK] scheduled per-org source recheck tick (DB)", () => {
  let orgId = "";
  let adminId = "";

  async function importDoc(fileId: string, name: string, sha: string): Promise<string> {
    const r = await importGoogleDocForCaller(adminId, {
      file_id: fileId,
      name,
      text: "seed text",
      modified_time: "2026-06-01T00:00:00Z",
      web_view_link: null,
      content_sha256: sha,
      source_kind: "SOP",
      currentness: "historical",
    });
    if (r.ok === false) throw new Error(`import failed: ${JSON.stringify(r)}`);
    return r.ledger_entry_id;
  }
  async function stateOf(id: string): Promise<string | undefined> {
    const row = await prisma.workLedgerEntry.findUnique({ where: { ledger_entry_id: id } });
    const d = (row!.details ?? {}) as Record<string, unknown>;
    return ((d.source_integrity ?? {}) as Record<string, unknown>).state as string | undefined;
  }
  async function notifications(): Promise<number> {
    return prisma.notification.count({
      where: { recipient_entity_id: adminId, notification_class: SOURCE_HEALTH_NOTIFICATION_CLASS },
    });
  }
  async function auditCount(eventType: string): Promise<number> {
    return prisma.auditEvent.count({
      where: { actor_entity_id: adminId, event_type: eventType, target_entity_id: orgId },
    });
  }

  beforeAll(async () => {
    await ensureAuditTriggers();
  });
  beforeEach(async () => {
    await cleanup();
    await cleanupTestData();
    orgId = await makeEntity("Recheck Org", "COMPANY");
    adminId = await makeEntity("Recheck Admin", "PERSON");
    await grantOrgAdmin(adminId);
    await prisma.entityMembership.create({
      data: { parent_id: orgId, child_id: adminId, is_active: true, is_admin: true },
    });
  });
  afterAll(async () => {
    await cleanup();
    await cleanupTestData();
    await prisma.$disconnect();
  });

  it("parses fail-closed targets; empty ⇒ no-op, nothing touched", async () => {
    expect(parseRecheckTargets(undefined)).toEqual([]);
    expect(parseRecheckTargets("  ")).toEqual([]);
    expect(parseRecheckTargets("orgA:actorA,orgB:actorB")).toEqual([
      { orgEntityId: "orgA", actorEntityId: "actorA" },
      { orgEntityId: "orgB", actorEntityId: "actorB" },
    ]);
    const doc = await importDoc("f-noop", "Noop", "sha-x");
    const r = await tickSourceRecheck([]);
    expect(r.orgs_processed).toBe(0);
    expect(await stateOf(doc)).toBe("AVAILABLE"); // untouched
    expect(await notifications()).toBe(0);
  });

  it("unchanged source: verified, NO notification, NO SOURCE_VERIFIED audit (quiet)", async () => {
    const doc = await importDoc("f-same", "Same", "sha-same");
    const r = await tickSourceRecheck(
      [{ orgEntityId: orgId, actorEntityId: adminId }],
      { fetchDocText: fetchByFileId({ "f-same": okExport("f-same", "sha-same") }) },
    );
    expect(r.orgs_processed).toBe(1);
    expect(r.totals.verified).toBe(1);
    expect(r.totals.notified).toBe(0);
    expect(await stateOf(doc)).toBe("AVAILABLE");
    expect(await notifications()).toBe(0);
    expect(await auditCount("SOURCE_VERIFIED")).toBe(0); // suppressed on scheduled recheck
  });

  it("changed upstream: demotes, ONE notification + audit (a transition)", async () => {
    const doc = await importDoc("f-chg", "Changed", "sha-old");
    const r = await tickSourceRecheck(
      [{ orgEntityId: orgId, actorEntityId: adminId }],
      { fetchDocText: fetchByFileId({ "f-chg": okExport("f-chg", "sha-new") }) },
    );
    expect(r.totals.changed_upstream).toBe(1);
    expect(await stateOf(doc)).toBe("CHANGED_UPSTREAM");
    expect(await notifications()).toBe(1);
    expect(await auditCount("SOURCE_CHANGED_UPSTREAM")).toBe(1);
  });

  it("still-changed on the next run: NO new notification, NO new audit (no transition)", async () => {
    await importDoc("f-chg2", "Changed2", "sha-old");
    const targets = [{ orgEntityId: orgId, actorEntityId: adminId }];
    const fetch = { fetchDocText: fetchByFileId({ "f-chg2": okExport("f-chg2", "sha-new") }) };
    await tickSourceRecheck(targets, fetch); // 1st: transition → notify+audit
    await tickSourceRecheck(targets, fetch); // 2nd: same state → quiet
    expect(await notifications()).toBe(1);
    expect(await auditCount("SOURCE_CHANGED_UPSTREAM")).toBe(1);
  });

  it("escalation CHANGED_UPSTREAM → SOURCE_DELETED notifies (a transition)", async () => {
    const doc = await importDoc("f-esc", "Esc", "sha-old");
    const targets = [{ orgEntityId: orgId, actorEntityId: adminId }];
    await tickSourceRecheck(targets, { fetchDocText: fetchByFileId({ "f-esc": okExport("f-esc", "sha-new") }) });
    await tickSourceRecheck(targets, { fetchDocText: fetchByFileId({ "f-esc": NOT_FOUND }) });
    expect(await stateOf(doc)).toBe("SOURCE_DELETED");
    expect(await notifications()).toBe(2); // changed, then deleted — both transitions
  });

  it("transient fetch: no demotion, no notification, no state change", async () => {
    const doc = await importDoc("f-tr", "Transient", "sha-keep");
    const r = await tickSourceRecheck(
      [{ orgEntityId: orgId, actorEntityId: adminId }],
      { fetchDocText: fetchByFileId({ "f-tr": TRANSIENT }) },
    );
    expect(r.totals.unavailable).toBe(1);
    expect(await stateOf(doc)).toBe("AVAILABLE"); // snapshot preserved
    expect(await notifications()).toBe(0);
  });

  it("actor→org mismatch is SKIPPED (a typo can't touch the wrong org)", async () => {
    const doc = await importDoc("f-mm", "Mismatch", "sha-old");
    const otherOrg = await makeEntity("Other Org", "COMPANY");
    const r = await tickSourceRecheck(
      [{ orgEntityId: otherOrg, actorEntityId: adminId }], // admin belongs to orgId, not otherOrg
      { fetchDocText: fetchByFileId({ "f-mm": okExport("f-mm", "sha-new") }) },
    );
    expect(r.orgs_processed).toBe(0);
    expect(r.orgs_skipped).toBe(1);
    expect(await stateOf(doc)).toBe("AVAILABLE"); // untouched
  });

  it("suspended actor is SKIPPED", async () => {
    await importDoc("f-susp", "Suspended", "sha-old");
    await prisma.entity.update({ where: { entity_id: adminId }, data: { status: "SUSPENDED" } });
    const r = await tickSourceRecheck(
      [{ orgEntityId: orgId, actorEntityId: adminId }],
      { fetchDocText: fetchByFileId({ "f-susp": okExport("f-susp", "sha-new") }) },
    );
    expect(r.orgs_processed).toBe(0);
    expect(r.orgs_skipped).toBe(1);
  });

  it("respects the per-run org cap", async () => {
    const prior = process.env.SOURCE_RECHECK_MAX_ORGS_PER_RUN;
    try {
      process.env.SOURCE_RECHECK_MAX_ORGS_PER_RUN = "1";
      expect(maxOrgsPerRun()).toBe(1);
      // Two valid same-org targets; the cap trims to 1 processed, 1 skipped.
      await importDoc("f-cap", "Cap", "sha-same");
      const t = { orgEntityId: orgId, actorEntityId: adminId };
      const r = await tickSourceRecheck([t, t], { fetchDocText: fetchByFileId({ "f-cap": okExport("f-cap", "sha-same") }) });
      expect(r.orgs_processed).toBe(1);
      expect(r.orgs_skipped).toBe(1);
    } finally {
      if (prior === undefined) delete process.env.SOURCE_RECHECK_MAX_ORGS_PER_RUN;
      else process.env.SOURCE_RECHECK_MAX_ORGS_PER_RUN = prior;
    }
  });
});
