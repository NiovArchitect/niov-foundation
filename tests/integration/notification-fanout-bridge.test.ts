// FILE: notification-fanout-bridge.test.ts (integration)
// PURPOSE: Section 4 Wave 5 — NotificationService ↔ ConnectorProvider
//          seam coverage. Verifies the dispatchNotificationFanOut
//          function + the wired makeNotificationService({
//          connectorFanOut }) path:
//            - internal-only baseline preserved when no bindings exist
//              (Wave 11 contract);
//            - fan-out fires when a matching binding (config.notification_classes
//              includes the notification_class) is present;
//            - wildcard "*" notification_classes matches every class;
//            - disabled binding is NOT fanned out to;
//            - cross-org binding is NEVER fanned out to;
//            - per-attempt ADMIN_ACTION audit row with details.action ∈
//              { NOTIFICATION_FAN_OUT_DISPATCHED,
//                NOTIFICATION_FAN_OUT_FAILED } (NO new audit literal);
//            - SAFE invariant: fan-out payload + audit details carry
//              notification_id + notification_class ONLY; never
//              body_summary / body_redacted.
// CONNECTS TO:
//   - apps/api/src/services/connector/notification-fanout.service.ts
//   - apps/api/src/services/notification/notification.service.ts

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  bindingMatchesNotificationClass,
  dispatchNotificationFanOut,
  FixtureBasedConnectorProvider,
  makeNotificationService,
} from "@niov/api";
import {
  createConnectorBinding,
  createEntity,
  prisma,
} from "@niov/database";
import type { Prisma } from "@prisma/client";
import {
  cleanupTestData,
  ensureAuditTriggers,
  makeEntityInput,
  TEST_PREFIX,
} from "../helpers.js";

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
  return { orgId: org.entity_id, memberId: member.entity_id };
}

async function makeBinding(opts: {
  orgId: string;
  createdBy: string;
  notification_classes?: string[] | undefined;
  enabled?: boolean;
}): Promise<string> {
  const config: Record<string, unknown> = {
    url: "https://example.test/hook",
  };
  if (opts.notification_classes !== undefined) {
    config.notification_classes = opts.notification_classes;
  }
  const row = await createConnectorBinding({
    org_entity_id: opts.orgId,
    type: "OUTBOUND_WEBHOOK",
    display_name: `Bind ${randomUUID()}`,
    config: config as Prisma.InputJsonValue,
    secret_ref: "TEST_HMAC_SECRET",
    created_by_entity_id: opts.createdBy,
  });
  if (opts.enabled === false) {
    await prisma.connectorBinding.update({
      where: { binding_id: row.binding_id },
      data: { enabled: false },
    });
  }
  return row.binding_id;
}

describe("bindingMatchesNotificationClass — pure matcher", () => {
  it("matches when config.notification_classes contains the class verbatim", () => {
    const b = {
      config: { notification_classes: ["ESCALATION", "DAILY_DIGEST"] },
    } as never;
    expect(bindingMatchesNotificationClass(b, "ESCALATION")).toBe(true);
    expect(bindingMatchesNotificationClass(b, "OTHER")).toBe(false);
  });

  it("matches wildcard '*'", () => {
    const b = { config: { notification_classes: ["*"] } } as never;
    expect(bindingMatchesNotificationClass(b, "ANYTHING")).toBe(true);
  });

  it("returns false when notification_classes is missing / not an array / empty", () => {
    expect(
      bindingMatchesNotificationClass({ config: {} } as never, "X"),
    ).toBe(false);
    expect(
      bindingMatchesNotificationClass(
        { config: { notification_classes: "ESCALATION" } } as never,
        "ESCALATION",
      ),
    ).toBe(false);
    expect(
      bindingMatchesNotificationClass(
        { config: { notification_classes: [] } } as never,
        "ESCALATION",
      ),
    ).toBe(false);
  });

  it("returns false when config is null / not an object", () => {
    expect(
      bindingMatchesNotificationClass({ config: null } as never, "X"),
    ).toBe(false);
  });
});

describe("dispatchNotificationFanOut — substrate behavior", () => {
  it("returns 0 matched + emits no fan-out audit when no bindings exist", async () => {
    const { orgId, memberId } = await makeOrgWithMember();
    const result = await dispatchNotificationFanOut(
      {
        notification_id: randomUUID(),
        notification_class: "ESCALATION",
        org_entity_id: orgId,
        source_entity_id: memberId,
      },
      { providerOverride: new FixtureBasedConnectorProvider() },
    );
    expect(result.bindings_considered).toBe(0);
    expect(result.bindings_matched).toBe(0);
    expect(result.attempts).toEqual([]);
  });

  it("fires the matching binding + emits NOTIFICATION_FAN_OUT_DISPATCHED audit", async () => {
    const { orgId, memberId } = await makeOrgWithMember();
    const bindingId = await makeBinding({
      orgId,
      createdBy: memberId,
      notification_classes: ["ESCALATION"],
    });
    const notificationId = randomUUID();
    const result = await dispatchNotificationFanOut(
      {
        notification_id: notificationId,
        notification_class: "ESCALATION",
        org_entity_id: orgId,
        source_entity_id: memberId,
      },
      { providerOverride: new FixtureBasedConnectorProvider() },
    );
    expect(result.bindings_matched).toBe(1);
    expect(result.attempts).toHaveLength(1);
    expect(result.attempts[0]!.binding_id).toBe(bindingId);
    expect(result.attempts[0]!.ok).toBe(true);

    const audits = await prisma.auditEvent.findMany({
      where: {
        actor_entity_id: memberId,
        event_type: "ADMIN_ACTION",
      },
      orderBy: { timestamp: "desc" },
    });
    const fanOutAudit = audits.find((a) => {
      const d = a.details as Record<string, unknown> | null;
      return d?.action === "NOTIFICATION_FAN_OUT_DISPATCHED";
    });
    expect(fanOutAudit).toBeDefined();
    const d = fanOutAudit!.details as Record<string, unknown>;
    expect(d.binding_id).toBe(bindingId);
    expect(d.connector_type).toBe("OUTBOUND_WEBHOOK");
    expect(d.notification_id).toBe(notificationId);
    expect(d.notification_class).toBe("ESCALATION");
    expect(fanOutAudit!.outcome).toBe("SUCCESS");
  });

  it("emits NOTIFICATION_FAN_OUT_FAILED audit with outcome=ERROR + error_class on provider failure", async () => {
    const { orgId, memberId } = await makeOrgWithMember();
    const bindingId = await makeBinding({
      orgId,
      createdBy: memberId,
      notification_classes: ["ESCALATION"],
    });
    // Fixture provider with the forced-failure path is exercised
    // by the fan-out using a payload that the provider doesn't
    // know about (payload.fixture_key is what FixtureBased reads;
    // since dispatchNotificationFanOut sends a fixed-shape payload
    // {notification_id, notification_class}, force the failure by
    // pointing at the always-fail fixture provider variant.
    const failingProvider = {
      invoke: async () => ({
        ok: false as const,
        error_class: "PROVIDER_ERROR" as const,
        message: "fixture forced failure",
      }),
    };
    const result = await dispatchNotificationFanOut(
      {
        notification_id: randomUUID(),
        notification_class: "ESCALATION",
        org_entity_id: orgId,
        source_entity_id: memberId,
      },
      { providerOverride: failingProvider },
    );
    expect(result.attempts[0]!.ok).toBe(false);
    expect(result.attempts[0]!.error_class).toBe("PROVIDER_ERROR");

    const audits = await prisma.auditEvent.findMany({
      where: {
        actor_entity_id: memberId,
        event_type: "ADMIN_ACTION",
      },
      orderBy: { timestamp: "desc" },
    });
    const fanOutAudit = audits.find((a) => {
      const d = a.details as Record<string, unknown> | null;
      return (
        d?.action === "NOTIFICATION_FAN_OUT_FAILED" &&
        d?.binding_id === bindingId
      );
    });
    expect(fanOutAudit).toBeDefined();
    expect(fanOutAudit!.outcome).toBe("ERROR");
    const d = fanOutAudit!.details as Record<string, unknown>;
    expect(d.error_class).toBe("PROVIDER_ERROR");
  });

  it("does NOT fan out to disabled bindings", async () => {
    const { orgId, memberId } = await makeOrgWithMember();
    await makeBinding({
      orgId,
      createdBy: memberId,
      notification_classes: ["ESCALATION"],
      enabled: false,
    });
    const result = await dispatchNotificationFanOut(
      {
        notification_id: randomUUID(),
        notification_class: "ESCALATION",
        org_entity_id: orgId,
        source_entity_id: memberId,
      },
      { providerOverride: new FixtureBasedConnectorProvider() },
    );
    expect(result.bindings_considered).toBe(0);
    expect(result.bindings_matched).toBe(0);
  });

  it("does NOT fan out to bindings that don't opt into the notification_class", async () => {
    const { orgId, memberId } = await makeOrgWithMember();
    await makeBinding({
      orgId,
      createdBy: memberId,
      notification_classes: ["DAILY_DIGEST"],
    });
    const result = await dispatchNotificationFanOut(
      {
        notification_id: randomUUID(),
        notification_class: "ESCALATION",
        org_entity_id: orgId,
        source_entity_id: memberId,
      },
      { providerOverride: new FixtureBasedConnectorProvider() },
    );
    expect(result.bindings_considered).toBe(1);
    expect(result.bindings_matched).toBe(0);
  });

  it("does NOT fan out to cross-org bindings", async () => {
    const a = await makeOrgWithMember();
    const b = await makeOrgWithMember();
    await makeBinding({
      orgId: b.orgId,
      createdBy: b.memberId,
      notification_classes: ["ESCALATION"],
    });
    // a's notification fans out scoped to a's org only.
    const result = await dispatchNotificationFanOut(
      {
        notification_id: randomUUID(),
        notification_class: "ESCALATION",
        org_entity_id: a.orgId,
        source_entity_id: a.memberId,
      },
      { providerOverride: new FixtureBasedConnectorProvider() },
    );
    expect(result.bindings_considered).toBe(0);
    expect(result.bindings_matched).toBe(0);
  });
});

describe("makeNotificationService — hook integration", () => {
  it("no connectorFanOut hook → Wave 11 internal-only baseline preserved", async () => {
    const { orgId, memberId } = await makeOrgWithMember();
    // Even with a matching binding present, omitting the hook
    // means zero fan-out audit rows are written.
    await makeBinding({
      orgId,
      createdBy: memberId,
      notification_classes: ["ESCALATION"],
    });
    const svc = makeNotificationService(); // NO hook
    const r = await svc.createInternalNotification({
      org_entity_id: orgId,
      recipient_entity_id: memberId,
      source_entity_id: memberId,
      notification_class: "ESCALATION",
      body_summary: "test body summary",
    });
    expect(r.ok).toBe(true);
    const audits = await prisma.auditEvent.findMany({
      where: {
        actor_entity_id: memberId,
        event_type: "ADMIN_ACTION",
      },
    });
    const fanOutCount = audits.filter((a) => {
      const d = a.details as Record<string, unknown> | null;
      return (
        typeof d?.action === "string" &&
        d.action.startsWith("NOTIFICATION_FAN_OUT")
      );
    }).length;
    expect(fanOutCount).toBe(0);
  });

  it("with connectorFanOut hook + matching binding → fan-out fires", async () => {
    const { orgId, memberId } = await makeOrgWithMember();
    const bindingId = await makeBinding({
      orgId,
      createdBy: memberId,
      notification_classes: ["*"],
    });
    const fixtureProvider = new FixtureBasedConnectorProvider();
    const svc = makeNotificationService({
      connectorFanOut: async (input) => {
        await dispatchNotificationFanOut(input, {
          providerOverride: fixtureProvider,
        });
      },
    });
    const notificationClass = `WAVE5_TEST_${randomUUID()}`;
    const r = await svc.createInternalNotification({
      org_entity_id: orgId,
      recipient_entity_id: memberId,
      source_entity_id: memberId,
      notification_class: notificationClass,
      body_summary: "this body MUST not leak into fan-out payload",
      body_redacted: { secret_field: "MUST_NOT_LEAK_INTO_FAN_OUT" },
    });
    expect(r.ok).toBe(true);
    const audits = await prisma.auditEvent.findMany({
      where: {
        actor_entity_id: memberId,
        event_type: "ADMIN_ACTION",
      },
    });
    const fanOutAudit = audits.find((a) => {
      const d = a.details as Record<string, unknown> | null;
      return (
        d?.action === "NOTIFICATION_FAN_OUT_DISPATCHED" &&
        d?.notification_class === notificationClass &&
        d?.binding_id === bindingId
      );
    });
    expect(fanOutAudit).toBeDefined();
    // SAFE: body content never appears in any fan-out audit detail.
    const serialized = JSON.stringify(fanOutAudit!.details);
    expect(serialized).not.toContain("MUST not leak");
    expect(serialized).not.toContain("MUST_NOT_LEAK_INTO_FAN_OUT");
  });

  it("production makeConnectorFanOutHook swallows downstream errors so caller is unaffected", async () => {
    const { orgId, memberId } = await makeOrgWithMember();
    // Use makeConnectorFanOutHook with a provider that throws
    // synchronously — the production hook builder catches every
    // inner exception so the Notification path stays clean.
    const throwingProvider = {
      invoke: async (): Promise<never> => {
        throw new Error("provider exploded MUST be swallowed");
      },
    };
    // Wire a binding so the throwing provider gets invoked.
    await makeBinding({
      orgId,
      createdBy: memberId,
      notification_classes: ["*"],
    });
    const { makeConnectorFanOutHook } = await import("@niov/api");
    const svc = makeNotificationService({
      connectorFanOut: makeConnectorFanOutHook({
        providerOverride: throwingProvider,
      }),
    });
    const r = await svc.createInternalNotification({
      org_entity_id: orgId,
      recipient_entity_id: memberId,
      source_entity_id: memberId,
      notification_class: "ANY",
      body_summary: "test",
    });
    expect(r.ok).toBe(true);
    const persisted = await prisma.notification.findFirst({
      where: { org_entity_id: orgId, recipient_entity_id: memberId },
      orderBy: { created_at: "desc" },
    });
    expect(persisted).not.toBeNull();
  });
});
