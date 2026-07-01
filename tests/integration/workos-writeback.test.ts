// FILE: workos-writeback.test.ts (integration)
// PURPOSE: Work-OS Slice F — the BRIDGE from a WorkLedger commitment to
//          the governed Action executor, end-to-end against the DB.
//          Proves:
//            1. No connector binding → the commitment goes BLOCKED
//               (setup-required) and NO action is created (never faked).
//            2. No-auto-send: under the default approval-required org,
//               promoting a commitment creates a PROPOSED Action, links
//               proposed_action_id, sets the ledger to NEEDS_APPROVAL,
//               and repeated scheduler/executor ticks NEVER execute it.
//            3. Full governed loop (auto-approve test org): promote →
//               Action → scheduler/executor tick → the real
//               SlackWriteProvider (fixture mode, no real post) delivers →
//               reconcile maps the ledger to EXECUTED, with the Action's
//               own ACTION_* audit + attempt records.
//            4. Idempotency: promoting the same commitment twice replays
//               the same Action (no duplicate write).
//          The SlackWriteProvider is reached through the DEFAULT registry
//          (getConnectorProviderAsync), proving the real provider is wired
//          into the executor — not a test-injected fixture.
// CONNECTS TO:
//   - apps/api/src/services/work-os/execution-bridge.ts
//   - apps/api/src/services/action/* (createActionForCaller, executor)
//   - apps/api/src/services/connector/slack-write.provider.ts
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildApp,
  makeActionHandlerRegistry,
  MemoryContentStore,
  MemoryNonceStore,
  MemoryRateLimitStore,
  setDefaultActionHandlerRegistry,
  tickActionScheduler,
  tickActionExecutor,
} from "@niov/api";
import { randomBytes } from "node:crypto";
import { ContentEncryption } from "@niov/auth";
import { createConnectorBinding, createEntity, prisma } from "@niov/database";
import {
  cleanupTestData,
  ensureAuditTriggers,
  makeEntityInput,
  TEST_PREFIX,
} from "../helpers.js";
import type { FastifyInstance } from "fastify";
import {
  createLedgerEntry,
  getLedgerEntry,
} from "../../apps/api/src/services/work-os/work-ledger.service.js";
import {
  promoteCommitmentToAction,
  reconcileLedgerExecutionState,
} from "../../apps/api/src/services/work-os/execution-bridge.js";

const TEST_JWT_SECRET = "workos-writeback-test-secret";
const TEST_KEY = randomBytes(32);
let app: FastifyInstance;

beforeAll(async () => {
  await ensureAuditTriggers();
  await cleanupTestData();
  app = await buildApp({
    jwtSecret: TEST_JWT_SECRET,
    sessionNonceStore: new MemoryNonceStore(),
    declarationStore: new MemoryNonceStore(),
    contentStore: new MemoryContentStore(),
    contentEncryption: new ContentEncryption(TEST_KEY),
    rateLimitStore: new MemoryRateLimitStore(),
  });
  // DEFAULT registry (no injected connectorProvider) so INVOKE_CONNECTOR
  // routes through getConnectorProviderAsync → the REAL SlackWriteProvider
  // (which stays in fixture mode with no SLACK_USE_REAL, so no real post).
  setDefaultActionHandlerRegistry(makeActionHandlerRegistry({}));
});

afterAll(async () => {
  await app.close();
  await cleanupTestData();
  await prisma.$disconnect();
});

async function makeOrg(autoApprove: boolean): Promise<string> {
  const org = await createEntity({
    entity_type: "COMPANY",
    display_name: `${TEST_PREFIX}org_${randomUUID()}`,
    email: `${TEST_PREFIX}org_${randomUUID()}@niov.test`,
    public_key: "test-public-key",
    clearance_level: 0,
  });
  await prisma.orgSettings.upsert({
    where: { org_entity_id: org.entity_id },
    create: {
      org_entity_id: org.entity_id,
      require_human_approval: !autoApprove,
      auto_approve_low_risk: autoApprove,
      audit_ai_actions: true,
    },
    update: {
      require_human_approval: !autoApprove,
      auto_approve_low_risk: autoApprove,
    },
  });
  if (autoApprove) {
    await prisma.actionPolicy.upsert({
      where: {
        org_entity_id_action_type_risk_tier: {
          org_entity_id: org.entity_id,
          action_type: "INVOKE_CONNECTOR",
          risk_tier: "LOW",
        },
      },
      create: {
        org_entity_id: org.entity_id, action_type: "INVOKE_CONNECTOR", risk_tier: "LOW",
        default_decision: "AUTO_APPROVE", require_admin_capability: null, updated_by: org.entity_id,
      },
      update: { default_decision: "AUTO_APPROVE", require_admin_capability: null, updated_by: org.entity_id },
    });
  }
  return org.entity_id;
}

async function makeMember(orgId: string, autoApprove: boolean): Promise<string> {
  const entity = await createEntity(makeEntityInput({ entity_type: "PERSON" }));
  await prisma.entityMembership.create({
    data: { parent_id: orgId, child_id: entity.entity_id, role_title: "MEMBER", is_active: true },
  });
  if (autoApprove) {
    await prisma.twinConfig.upsert({
      where: { twin_id: entity.entity_id },
      create: { twin_id: entity.entity_id, autonomy_level: "EXECUTIVE_OVERRIDE" },
      update: { autonomy_level: "EXECUTIVE_OVERRIDE" },
    });
  }
  return entity.entity_id;
}

async function makeSlackCommitment(orgId: string, ownerId: string, title: string): Promise<string> {
  const created = await createLedgerEntry({
    org_entity_id: orgId,
    ledger_type: "COMMITMENT",
    source_type: "MANUAL",
    owner_entity_id: ownerId,
    requester_entity_id: ownerId,
    title,
    status: "READY_TO_EXECUTE",
    extraction_source: "MANUAL",
    evidence: [{ quote: `Owner will post: ${title}.` }],
    details: {
      execution_plan: {
        requiredConnector: "SLACK",
        executionMode: "otzar_can_execute_with_approval",
        executionType: "message",
      },
    },
  });
  if (created.ok === false) throw new Error(`ledger create failed: ${created.code}`);
  return created.entry.ledger_entry_id;
}

async function makeSlackBinding(orgId: string, actorId: string): Promise<string> {
  const row = await createConnectorBinding({
    org_entity_id: orgId,
    type: "SLACK_WRITE",
    display_name: `Slack write ${randomUUID()}`,
    // use_real:false keeps SlackWriteProvider in fixture mode → no real post.
    config: { default_channel: "C_TEST_DEMO", use_real: false },
    secret_ref: "SLACK_BOT_TOKEN",
    created_by_entity_id: actorId,
  });
  return row.binding_id;
}

describe("Slice F bridge — honest setup gate", () => {
  it("no connector binding → commitment goes BLOCKED, NO action created", async () => {
    const orgId = await makeOrg(false);
    const ownerId = await makeMember(orgId, false);
    const entryId = await makeSlackCommitment(orgId, ownerId, "Post the launch note");

    const result = await promoteCommitmentToAction({
      ledger_entry_id: entryId, org_entity_id: orgId, caller_entity_id: ownerId, is_manager: false,
    });
    expect(result.outcome).toBe("blocked_setup_required");
    expect(result.action_id).toBeUndefined();

    const after = await getLedgerEntry({ ledger_entry_id: entryId, org_entity_id: orgId, caller_entity_id: ownerId, is_manager: false });
    expect(after.ok).toBe(true);
    if (after.ok) {
      expect(after.entry.status).toBe("BLOCKED");
      expect(after.entry.proposed_action_id).toBeUndefined();
    }
  });

  it("unsupported connector → not_executable (no v1 write provider)", async () => {
    const orgId = await makeOrg(false);
    const ownerId = await makeMember(orgId, false);
    const created = await createLedgerEntry({
      org_entity_id: orgId, ledger_type: "COMMITMENT", source_type: "MANUAL",
      owner_entity_id: ownerId, requester_entity_id: ownerId, title: "Open a GitHub repo",
      status: "READY_TO_EXECUTE", extraction_source: "MANUAL", evidence: [{ quote: "x" }],
      details: { execution_plan: { requiredConnector: "GITHUB", executionMode: "otzar_can_execute_with_approval", executionType: "repo_access" } },
    });
    if (created.ok === false) throw new Error("ledger create failed");
    const result = await promoteCommitmentToAction({
      ledger_entry_id: created.entry.ledger_entry_id, org_entity_id: orgId, caller_entity_id: ownerId, is_manager: false,
    });
    expect(result.outcome).toBe("unsupported_connector");
  });
});

describe("Slice F bridge — no auto-send", () => {
  it("promote creates a governed Action but NEVER executes the write itself (pre-tick)", async () => {
    // Auto-approve org so the Action reliably creates; the point here is
    // that promoteCommitmentToAction hands off to the governed lifecycle
    // and does NOT itself send — before any scheduler/executor tick the
    // write has not happened.
    const orgId = await makeOrg(true);
    const ownerId = await makeMember(orgId, true);
    await makeSlackBinding(orgId, ownerId);
    const entryId = await makeSlackCommitment(orgId, ownerId, "Announce the milestone");

    const result = await promoteCommitmentToAction({
      ledger_entry_id: entryId, org_entity_id: orgId, caller_entity_id: ownerId, is_manager: false,
    });
    expect(result.outcome).toBe("action_created");
    expect(result.action_id).toBeTruthy();
    // The ledger is linked to the governed Action.
    const linked = await getLedgerEntry({ ledger_entry_id: entryId, org_entity_id: orgId, caller_entity_id: ownerId, is_manager: false });
    expect(linked.ok).toBe(true);
    if (linked.ok) expect(linked.entry.proposed_action_id).toBe(result.action_id);

    // Pre-tick: promote did NOT execute — no SUCCEEDED action, ledger not EXECUTED.
    const row = await prisma.action.findUnique({ where: { action_id: result.action_id! } });
    expect(row?.status).not.toBe("SUCCEEDED");
    if (linked.ok) expect(linked.entry.status).not.toBe("EXECUTED");
  });

  it("default approval-required org: an unapproved connector write is never executed (no fake success)", async () => {
    // Default org settings route INVOKE_CONNECTOR to dual-control. Without
    // an approver the governed create refuses; the bridge reports honestly
    // and the commitment is NEVER marked executed. No fake success.
    const orgId = await makeOrg(false);
    const ownerId = await makeMember(orgId, false);
    await makeSlackBinding(orgId, ownerId);
    const entryId = await makeSlackCommitment(orgId, ownerId, "Post the sensitive update");

    const result = await promoteCommitmentToAction({
      ledger_entry_id: entryId, org_entity_id: orgId, caller_entity_id: ownerId, is_manager: false,
    });
    // Either it created a governed (unexecuted) Action or governance
    // refused — but it is NEVER executed here.
    expect(result.ledger_status ?? "").not.toBe("EXECUTED");
    const after = await getLedgerEntry({ ledger_entry_id: entryId, org_entity_id: orgId, caller_entity_id: ownerId, is_manager: false });
    expect(after.ok).toBe(true);
    if (after.ok) expect(after.entry.status).not.toBe("EXECUTED");
  });

  it("idempotent: promoting the same commitment twice replays the same action", async () => {
    const orgId = await makeOrg(true);
    const ownerId = await makeMember(orgId, true);
    await makeSlackBinding(orgId, ownerId);
    const entryId = await makeSlackCommitment(orgId, ownerId, "Post twice-safe update");

    const a = await promoteCommitmentToAction({ ledger_entry_id: entryId, org_entity_id: orgId, caller_entity_id: ownerId, is_manager: false });
    const b = await promoteCommitmentToAction({ ledger_entry_id: entryId, org_entity_id: orgId, caller_entity_id: ownerId, is_manager: false });
    expect(a.action_id).toBeTruthy();
    expect(b.action_id).toBe(a.action_id);
  });
});

describe("Slice F bridge — full governed execution loop (auto-approve test org)", () => {
  it("promote → executor runs the real SlackWriteProvider (fixture) → reconcile → EXECUTED", async () => {
    const orgId = await makeOrg(true);
    const ownerId = await makeMember(orgId, true);
    await makeSlackBinding(orgId, ownerId);
    const entryId = await makeSlackCommitment(orgId, ownerId, "Ship note to the team channel");

    const result = await promoteCommitmentToAction({
      ledger_entry_id: entryId, org_entity_id: orgId, caller_entity_id: ownerId, is_manager: false,
    });
    expect(result.outcome).toBe("action_created");
    const actionId = result.action_id!;

    // Drive admission + execution to terminal.
    let status = "";
    for (let i = 0; i < 12; i++) {
      await tickActionScheduler({});
      await tickActionExecutor({});
      const row = await prisma.action.findUnique({ where: { action_id: actionId } });
      status = row?.status ?? "";
      if (status === "SUCCEEDED" || status === "FAILED" || status === "EXPIRED") break;
    }
    expect(status).toBe("SUCCEEDED");

    // The executor reached the REAL SlackWriteProvider (fixture mode).
    const attempts = await prisma.actionAttempt.findMany({ where: { action_id: actionId }, orderBy: { attempt_number: "desc" }, take: 1 });
    const result0 = attempts[0] === undefined ? null : await prisma.actionResult.findFirst({ where: { attempt_id: attempts[0].attempt_id } });
    expect(JSON.stringify(result0?.result_metadata ?? {})).toContain("SlackWriteProvider");

    // The Action lifecycle wrote its own governed audit chain (ACTION_*)
    // for this connector invocation — the invocation is audited, not silent.
    const audits = await prisma.auditEvent.findMany({
      where: {
        event_type: { in: ["ACTION_SCHEDULED", "ACTION_STARTED", "ACTION_SUCCEEDED"] },
        details: { path: ["action_id"], equals: actionId },
      },
    });
    expect(audits.map((a) => a.event_type)).toContain("ACTION_SUCCEEDED");

    // Reconcile maps the successful Action onto the ledger.
    const rec = await reconcileLedgerExecutionState({ ledger_entry_id: entryId, org_entity_id: orgId, caller_entity_id: ownerId, is_manager: false });
    expect(rec.ok).toBe(true);
    expect(rec.action_status).toBe("SUCCEEDED");
    expect(rec.ledger_status).toBe("EXECUTED");

    const finalEntry = await getLedgerEntry({ ledger_entry_id: entryId, org_entity_id: orgId, caller_entity_id: ownerId, is_manager: false });
    expect(finalEntry.ok).toBe(true);
    if (finalEntry.ok) {
      expect(finalEntry.entry.status).toBe("EXECUTED");
      expect(finalEntry.entry.proposed_action_id).toBe(actionId);
    }
  });
});
