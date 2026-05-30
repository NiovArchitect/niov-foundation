// FILE: notification-fanout-action-routed.test.ts (integration)
// PURPOSE: Section 4 Wave 7 — Action-routed fan-out variant coverage.
//          Verifies: bindingFanOutMode pure matcher; per-binding
//          opt-in via config.fan_out_mode = "action"; action-routed
//          mode creates a real INVOKE_CONNECTOR Action via
//          createActionForCaller; idempotency_key collapses
//          re-fires; cross-org fan-out NEVER fires; Wave 5 direct
//          mode preserved as the default when fan_out_mode is
//          absent or unrecognized; per-attempt summary reports the
//          chosen mode + action_id when action-routed.
// CONNECTS TO:
//   - apps/api/src/services/connector/notification-fanout.service.ts
//     (Wave 7: bindingFanOutMode + dispatchActionRouted)
//   - apps/api/src/services/action/action.service.ts
//     (createActionForCaller — the substrate seam Wave 7 uses)

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  bindingFanOutMode,
  dispatchNotificationFanOut,
  FixtureBasedConnectorProvider,
} from "@niov/api";
import {
  createConnectorBinding,
  createEntity,
  prisma,
} from "@niov/database";
import {
  cleanupTestData,
  ensureAuditTriggers,
  makeEntityInput,
  TEST_PREFIX,
} from "../helpers.js";
import type { Prisma } from "@prisma/client";

beforeAll(async () => {
  await ensureAuditTriggers();
  await cleanupTestData();
});

afterAll(async () => {
  await cleanupTestData();
  await prisma.$disconnect();
});

async function makeOrgWithMember(): Promise<{
  orgId: string;
  memberId: string;
}> {
  const org = await createEntity({
    entity_type: "COMPANY",
    display_name: `${TEST_PREFIX}org_${randomUUID()}`,
    email: `${TEST_PREFIX}org_${randomUUID()}@niov.test`,
    public_key: "test-public-key",
    clearance_level: 0,
  });
  // Standard test-org policy posture (mirrors Wave 3 fixture):
  // require_human_approval=false + auto_approve_low_risk=true + an
  // AUTO_APPROVE ActionPolicy for (INVOKE_CONNECTOR, LOW) so the
  // action-routed fan-out flows through AUTO_APPROVE rather than
  // dual-control.
  await prisma.orgSettings.upsert({
    where: { org_entity_id: org.entity_id },
    create: {
      org_entity_id: org.entity_id,
      require_human_approval: false,
      auto_approve_low_risk: true,
      audit_ai_actions: true,
    },
    update: {
      require_human_approval: false,
      auto_approve_low_risk: true,
    },
  });
  await prisma.actionPolicy.upsert({
    where: {
      org_entity_id_action_type_risk_tier: {
        org_entity_id: org.entity_id,
        action_type: "INVOKE_CONNECTOR",
        risk_tier: "LOW",
      },
    },
    create: {
      org_entity_id: org.entity_id,
      action_type: "INVOKE_CONNECTOR",
      risk_tier: "LOW",
      default_decision: "AUTO_APPROVE",
      require_admin_capability: null,
      updated_by: org.entity_id,
    },
    update: {
      default_decision: "AUTO_APPROVE",
      require_admin_capability: null,
      updated_by: org.entity_id,
    },
  });

  const member = await createEntity(
    makeEntityInput({ entity_type: "PERSON" }),
  );
  await prisma.entityMembership.create({
    data: {
      parent_id: org.entity_id,
      child_id: member.entity_id,
      role_title: "MEMBER",
      is_active: true,
    },
  });
  // EXECUTIVE_OVERRIDE so the AUTO_APPROVE policy actually fires
  // (per Wave 3 substrate research — APPROVAL_REQUIRED default
  // would push every action to dual-control regardless of policy).
  await prisma.twinConfig.upsert({
    where: { twin_id: member.entity_id },
    create: {
      twin_id: member.entity_id,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    },
    update: { autonomy_level: "EXECUTIVE_OVERRIDE" },
  });
  return { orgId: org.entity_id, memberId: member.entity_id };
}

async function makeBinding(opts: {
  orgId: string;
  createdBy: string;
  notification_classes?: string[];
  fan_out_mode?: "direct" | "action";
}): Promise<string> {
  const config: Record<string, unknown> = {
    url: "https://example.test/hook",
  };
  if (opts.notification_classes !== undefined) {
    config.notification_classes = opts.notification_classes;
  }
  if (opts.fan_out_mode !== undefined) {
    config.fan_out_mode = opts.fan_out_mode;
  }
  const row = await createConnectorBinding({
    org_entity_id: opts.orgId,
    type: "OUTBOUND_WEBHOOK",
    display_name: `Bind ${randomUUID()}`,
    config: config as Prisma.InputJsonValue,
    secret_ref: "TEST_HMAC_SECRET",
    created_by_entity_id: opts.createdBy,
  });
  return row.binding_id;
}

describe("bindingFanOutMode — pure matcher", () => {
  it("returns 'direct' when fan_out_mode is absent (Wave 5 baseline preserved)", () => {
    expect(
      bindingFanOutMode({
        config: { notification_classes: ["*"] },
      } as never),
    ).toBe("direct");
  });

  it("returns 'action' when fan_out_mode = 'action'", () => {
    expect(
      bindingFanOutMode({
        config: { fan_out_mode: "action" },
      } as never),
    ).toBe("action");
  });

  it("returns 'direct' when fan_out_mode is an unrecognized string (defensive default)", () => {
    expect(
      bindingFanOutMode({
        config: { fan_out_mode: "bogus" },
      } as never),
    ).toBe("direct");
  });

  it("returns 'direct' when config is null / non-object", () => {
    expect(bindingFanOutMode({ config: null } as never)).toBe("direct");
  });
});

describe("dispatchNotificationFanOut — action-routed mode", () => {
  it("creates an INVOKE_CONNECTOR Action via createActionForCaller and emits NOTIFICATION_FAN_OUT_ENQUEUED", async () => {
    const { orgId, memberId } = await makeOrgWithMember();
    const bindingId = await makeBinding({
      orgId,
      createdBy: memberId,
      notification_classes: ["ESCALATION"],
      fan_out_mode: "action",
    });
    const notificationId = randomUUID();
    const result = await dispatchNotificationFanOut({
      notification_id: notificationId,
      notification_class: "ESCALATION",
      org_entity_id: orgId,
      source_entity_id: memberId,
    });
    expect(result.attempts).toHaveLength(1);
    const a = result.attempts[0]!;
    expect(a.mode).toBe("action");
    expect(a.ok).toBe(true);
    expect(a.action_id).toBeDefined();

    // The INVOKE_CONNECTOR Action exists with the deterministic
    // idempotency_key + payload pointing at the binding.
    const action = await prisma.action.findUnique({
      where: { action_id: a.action_id! },
    });
    expect(action).not.toBeNull();
    expect(action!.action_type).toBe("INVOKE_CONNECTOR");
    expect(action!.source_entity_id).toBe(memberId);
    expect(action!.org_entity_id).toBe(orgId);
    expect(action!.idempotency_key).toBe(
      `fanout:${notificationId}:${bindingId}`,
    );
    const payload = action!.payload_redacted as Record<string, unknown>;
    expect(payload.binding_id).toBe(bindingId);

    // NOTIFICATION_FAN_OUT_ENQUEUED audit emitted with mode="action"
    // + action_id reference.
    const audits = await prisma.auditEvent.findMany({
      where: {
        actor_entity_id: memberId,
        event_type: "ADMIN_ACTION",
      },
    });
    const enqueuedAudit = audits.find((x) => {
      const d = x.details as Record<string, unknown> | null;
      return (
        d?.action === "NOTIFICATION_FAN_OUT_ENQUEUED" &&
        d?.notification_id === notificationId
      );
    });
    expect(enqueuedAudit).toBeDefined();
    const ed = enqueuedAudit!.details as Record<string, unknown>;
    expect(ed.mode).toBe("action");
    expect(ed.action_id).toBe(a.action_id);
    expect(ed.binding_id).toBe(bindingId);
  });

  it("idempotency: re-firing the same (notification_id, binding_id) collapses to the prior Action", async () => {
    const { orgId, memberId } = await makeOrgWithMember();
    const bindingId = await makeBinding({
      orgId,
      createdBy: memberId,
      notification_classes: ["*"],
      fan_out_mode: "action",
    });
    const notificationId = randomUUID();
    const r1 = await dispatchNotificationFanOut({
      notification_id: notificationId,
      notification_class: "ANY",
      org_entity_id: orgId,
      source_entity_id: memberId,
    });
    const r2 = await dispatchNotificationFanOut({
      notification_id: notificationId,
      notification_class: "ANY",
      org_entity_id: orgId,
      source_entity_id: memberId,
    });
    expect(r1.attempts[0]!.action_id).toBe(r2.attempts[0]!.action_id);
    // Exactly one Action row by that idempotency_key.
    const actions = await prisma.action.findMany({
      where: { idempotency_key: `fanout:${notificationId}:${bindingId}` },
    });
    expect(actions).toHaveLength(1);
  });

  it("cross-org bindings NEVER receive a fan-out (Wave 5 isolation preserved under action mode)", async () => {
    const a = await makeOrgWithMember();
    const b = await makeOrgWithMember();
    await makeBinding({
      orgId: b.orgId,
      createdBy: b.memberId,
      notification_classes: ["ESCALATION"],
      fan_out_mode: "action",
    });
    const result = await dispatchNotificationFanOut({
      notification_id: randomUUID(),
      notification_class: "ESCALATION",
      org_entity_id: a.orgId,
      source_entity_id: a.memberId,
    });
    expect(result.bindings_matched).toBe(0);
    expect(result.attempts).toHaveLength(0);
    // No INVOKE_CONNECTOR Action was created by org A for org B's
    // binding.
    const crossOrgAction = await prisma.action.findFirst({
      where: {
        source_entity_id: a.memberId,
        action_type: "INVOKE_CONNECTOR",
      },
    });
    expect(crossOrgAction).toBeNull();
  });
});

describe("dispatchNotificationFanOut — mixed-mode org (Wave 5 + Wave 7 coexist)", () => {
  it("two bindings, one direct + one action — both fire with their own mode", async () => {
    const { orgId, memberId } = await makeOrgWithMember();
    // Direct binding: matches DIGEST.
    const directId = await makeBinding({
      orgId,
      createdBy: memberId,
      notification_classes: ["DIGEST"],
      // fan_out_mode omitted → defaults to "direct"
    });
    // Action binding: matches DIGEST too.
    const actionId = await makeBinding({
      orgId,
      createdBy: memberId,
      notification_classes: ["DIGEST"],
      fan_out_mode: "action",
    });
    const result = await dispatchNotificationFanOut(
      {
        notification_id: randomUUID(),
        notification_class: "DIGEST",
        org_entity_id: orgId,
        source_entity_id: memberId,
      },
      { providerOverride: new FixtureBasedConnectorProvider() },
    );
    expect(result.bindings_matched).toBe(2);
    const byBinding = new Map(result.attempts.map((x) => [x.binding_id, x]));
    expect(byBinding.get(directId)!.mode).toBe("direct");
    expect(byBinding.get(actionId)!.mode).toBe("action");
    expect(byBinding.get(actionId)!.action_id).toBeDefined();
  });
});

describe("dispatchNotificationFanOut — Wave 5 direct-mode regression", () => {
  it("absent fan_out_mode still emits NOTIFICATION_FAN_OUT_DISPATCHED with mode='direct' detail", async () => {
    const { orgId, memberId } = await makeOrgWithMember();
    await makeBinding({
      orgId,
      createdBy: memberId,
      notification_classes: ["*"],
      // fan_out_mode omitted
    });
    const result = await dispatchNotificationFanOut(
      {
        notification_id: randomUUID(),
        notification_class: "ANY",
        org_entity_id: orgId,
        source_entity_id: memberId,
      },
      { providerOverride: new FixtureBasedConnectorProvider() },
    );
    expect(result.attempts[0]!.mode).toBe("direct");
    expect(result.attempts[0]!.ok).toBe(true);
    const audits = await prisma.auditEvent.findMany({
      where: {
        actor_entity_id: memberId,
        event_type: "ADMIN_ACTION",
      },
      orderBy: { timestamp: "desc" },
    });
    const directAudit = audits.find((x) => {
      const d = x.details as Record<string, unknown> | null;
      return (
        d?.action === "NOTIFICATION_FAN_OUT_DISPATCHED" &&
        d?.mode === "direct"
      );
    });
    expect(directAudit).toBeDefined();
  });
});

describe("dispatchNotificationFanOut — privacy invariant under action mode", () => {
  it("payload_redacted carries notification_id + notification_class ONLY (no body content seam)", async () => {
    const { orgId, memberId } = await makeOrgWithMember();
    const bindingId = await makeBinding({
      orgId,
      createdBy: memberId,
      notification_classes: ["*"],
      fan_out_mode: "action",
    });
    const notificationId = randomUUID();
    const result = await dispatchNotificationFanOut({
      notification_id: notificationId,
      notification_class: "PRIVACY_TEST",
      org_entity_id: orgId,
      source_entity_id: memberId,
    });
    const actionId = result.attempts[0]!.action_id!;
    const action = await prisma.action.findUnique({
      where: { action_id: actionId },
    });
    const payload = action!.payload_redacted as Record<string, unknown>;
    expect(payload.binding_id).toBe(bindingId);
    const innerPayload = payload.invocation_payload as Record<string, unknown>;
    expect(Object.keys(innerPayload).sort()).toEqual([
      "notification_class",
      "notification_id",
    ]);
    // payload_redacted does NOT carry body_summary, body_redacted,
    // recipient_entity_id, or any other content surface.
    expect(payload.body_summary).toBeUndefined();
    expect(payload.body_redacted).toBeUndefined();
    expect(payload.recipient_entity_id).toBeUndefined();
  });
});
