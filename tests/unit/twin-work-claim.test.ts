import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveTwinMock,
  createLedgerMock,
  getLedgerMock,
  notifyMock,
  writeAuditMock,
  updateMock,
  findFirstMock,
} = vi.hoisted(() => ({
  resolveTwinMock: vi.fn(),
  createLedgerMock: vi.fn(),
  getLedgerMock: vi.fn(),
  notifyMock: vi.fn().mockResolvedValue({ ok: true }),
  writeAuditMock: vi.fn().mockResolvedValue({ audit_id: "a1" }),
  updateMock: vi.fn().mockResolvedValue({}),
  findFirstMock: vi.fn(),
}));

vi.mock("@niov/database", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    writeAuditEvent: writeAuditMock,
    prisma: {
      workLedgerEntry: { update: updateMock, findFirst: findFirstMock },
    },
  };
});

vi.mock("../../apps/api/src/services/otzar/twin-resolution.js", () => ({
  resolvePrimaryTwin: resolveTwinMock,
}));

vi.mock("../../apps/api/src/services/work-os/work-ledger.service.js", () => ({
  createLedgerEntry: createLedgerMock,
  getLedgerEntry: getLedgerMock,
}));

vi.mock("../../apps/api/src/services/notification/notification.service.js", () => ({
  makeNotificationService: () => ({
    createInternalNotification: notifyMock,
  }),
}));

import {
  claimWorkForTwin,
  twinMarkWorkComplete,
  twinRequestClarity,
  humanVerifyTwinWork,
  TWIN_WORK_CLASS,
} from "../../apps/api/src/services/otzar/twin-work-claim.service.js";

beforeEach(() => {
  resolveTwinMock.mockReset();
  createLedgerMock.mockReset();
  getLedgerMock.mockReset();
  notifyMock.mockClear();
  writeAuditMock.mockClear();
  updateMock.mockClear();
  findFirstMock.mockReset();
  findFirstMock.mockResolvedValue({
    details: {
      twin_work: {
        twin_entity_id: "00000000-0000-0000-0000-000000000099",
      },
    },
  });
});

describe("claimWorkForTwin", () => {
  it("fails closed without twin", async () => {
    resolveTwinMock.mockResolvedValue(null);
    const r = await claimWorkForTwin({
      org_entity_id: "00000000-0000-0000-0000-000000000001",
      human_entity_id: "00000000-0000-0000-0000-000000000002",
      title: "Draft pilot brief",
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("x");
    expect(r.code).toBe("TWIN_REQUIRED");
  });

  it("claims EXECUTING work and notifies human TWIN_WORKING_ON_WORK", async () => {
    resolveTwinMock.mockResolvedValue({
      twin: { entity_id: "00000000-0000-0000-0000-000000000099" },
      eligible_count: 1,
    });
    createLedgerMock.mockResolvedValue({
      ok: true,
      entry: {
        ledger_entry_id: "00000000-0000-0000-0000-000000000010",
        status: "EXECUTING",
        title: "Draft pilot brief",
        details: {},
      },
    });
    const r = await claimWorkForTwin({
      org_entity_id: "00000000-0000-0000-0000-000000000001",
      human_entity_id: "00000000-0000-0000-0000-000000000002",
      title: "Draft pilot brief",
      work_kind: "DOCUMENT",
      document_id: "doc-1",
    });
    expect(r.ok).toBe(true);
    expect(notifyMock).toHaveBeenCalled();
    const n = notifyMock.mock.calls[0]![0] as {
      notification_class: string;
      body_summary: string;
    };
    expect(n.notification_class).toBe(TWIN_WORK_CLASS.WORKING);
    expect(n.body_summary.toLowerCase()).toContain("working on");
    expect(createLedgerMock.mock.calls[0]![0].status).toBe("EXECUTING");
  });

  it("regulated health accuracy elevates priority and verification posture", async () => {
    resolveTwinMock.mockResolvedValue({
      twin: { entity_id: "00000000-0000-0000-0000-000000000099" },
      eligible_count: 1,
    });
    createLedgerMock.mockResolvedValue({
      ok: true,
      entry: {
        ledger_entry_id: "00000000-0000-0000-0000-000000000011",
        status: "EXECUTING",
        title: "Insurance prior-auth form",
        details: {},
      },
    });
    const r = await claimWorkForTwin({
      org_entity_id: "00000000-0000-0000-0000-000000000001",
      human_entity_id: "00000000-0000-0000-0000-000000000002",
      title: "Insurance prior-auth form",
      work_kind: "DOCUMENT",
      accuracy_class: "REGULATED_HEALTH",
    });
    expect(r.ok).toBe(true);
    const input = createLedgerMock.mock.calls[0]![0] as {
      priority: string;
      details: { twin_work: { accuracy_class: string; requires_verification: boolean } };
    };
    expect(input.priority).toBe("PROJECT_CRITICAL");
    expect(input.details.twin_work.accuracy_class).toBe("REGULATED_HEALTH");
    expect(input.details.twin_work.requires_verification).toBe(true);
    const n = notifyMock.mock.calls[0]![0] as { body_summary: string };
    expect(n.body_summary.toLowerCase()).toContain("accuracy-critical");
  });
});

describe("twinRequestClarity / complete", () => {
  it("clarity notifies without over-burdening copy", async () => {
    resolveTwinMock.mockResolvedValue({
      twin: { entity_id: "00000000-0000-0000-0000-000000000099" },
      eligible_count: 1,
    });
    getLedgerMock.mockResolvedValue({
      ok: true,
      entry: {
        ledger_entry_id: "00000000-0000-0000-0000-000000000010",
        title: "SSO config",
        status: "EXECUTING",
        details: {
          twin_work: {
            twin_entity_id: "00000000-0000-0000-0000-000000000099",
          },
        },
      },
    });
    const r = await twinRequestClarity({
      org_entity_id: "00000000-0000-0000-0000-000000000001",
      human_entity_id: "00000000-0000-0000-0000-000000000002",
      ledger_entry_id: "00000000-0000-0000-0000-000000000010",
      question: "Is Okta or Google IdP the source of truth?",
    });
    expect(r.ok).toBe(true);
    const n = notifyMock.mock.calls.at(-1)?.[0] as { notification_class: string };
    expect(n.notification_class).toBe(TWIN_WORK_CLASS.CLARITY);
  });

  it("complete notifies human", async () => {
    getLedgerMock.mockResolvedValue({
      ok: true,
      entry: {
        ledger_entry_id: "00000000-0000-0000-0000-000000000010",
        title: "Circulate brief",
        status: "EXECUTING",
        details: {
          twin_work: {
            twin_entity_id: "00000000-0000-0000-0000-000000000099",
          },
        },
      },
    });
    const r = await twinMarkWorkComplete({
      org_entity_id: "00000000-0000-0000-0000-000000000001",
      human_entity_id: "00000000-0000-0000-0000-000000000002",
      ledger_entry_id: "00000000-0000-0000-0000-000000000010",
      completion_note: "Brief shared with eng + compliance",
    });
    expect(r.ok).toBe(true);
    const n = notifyMock.mock.calls.at(-1)?.[0] as { notification_class: string };
    expect(n.notification_class).toBe(TWIN_WORK_CLASS.COMPLETE);
    expect(updateMock).toHaveBeenCalled();
  });

  it("regulated complete parks for human verification", async () => {
    getLedgerMock.mockResolvedValue({
      ok: true,
      entry: {
        ledger_entry_id: "00000000-0000-0000-0000-000000000010",
        title: "Insurance form",
        status: "EXECUTING",
        owner_entity_id: "00000000-0000-0000-0000-000000000002",
        details: {
          twin_work: {
            twin_entity_id: "00000000-0000-0000-0000-000000000099",
            accuracy_class: "INSURANCE",
            requires_verification: true,
            verification_state: "PENDING",
          },
        },
      },
    });
    findFirstMock.mockResolvedValue({
      details: {
        twin_work: {
          twin_entity_id: "00000000-0000-0000-0000-000000000099",
          accuracy_class: "INSURANCE",
          requires_verification: true,
          verification_state: "PENDING",
        },
      },
    });
    const r = await twinMarkWorkComplete({
      org_entity_id: "00000000-0000-0000-0000-000000000001",
      human_entity_id: "00000000-0000-0000-0000-000000000002",
      ledger_entry_id: "00000000-0000-0000-0000-000000000010",
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("x");
    expect(r.code).toBe("VERIFICATION_REQUIRED");
    const n = notifyMock.mock.calls.at(-1)?.[0] as { notification_class: string };
    expect(n.notification_class).toBe(TWIN_WORK_CLASS.AWAITING_VERIFY);
  });

  it("human verify then complete after awaiting", async () => {
    getLedgerMock.mockResolvedValue({
      ok: true,
      entry: {
        ledger_entry_id: "00000000-0000-0000-0000-000000000010",
        title: "Insurance form",
        status: "NEEDS_CALLER_CONFIRMATION",
        owner_entity_id: "00000000-0000-0000-0000-000000000002",
        details: {},
      },
    });
    findFirstMock.mockResolvedValue({
      details: {
        twin_work: {
          twin_entity_id: "00000000-0000-0000-0000-000000000099",
          accuracy_class: "INSURANCE",
          requires_verification: true,
          verification_state: "AWAITING_HUMAN",
          completion_pending_note: "form ready",
        },
      },
    });
    // second findFirst for complete path after verify
    findFirstMock
      .mockResolvedValueOnce({
        details: {
          twin_work: {
            twin_entity_id: "00000000-0000-0000-0000-000000000099",
            accuracy_class: "INSURANCE",
            requires_verification: true,
            verification_state: "AWAITING_HUMAN",
            completion_pending_note: "form ready",
          },
        },
      })
      .mockResolvedValue({
        details: {
          twin_work: {
            twin_entity_id: "00000000-0000-0000-0000-000000000099",
            accuracy_class: "INSURANCE",
            requires_verification: true,
            verification_state: "VERIFIED",
            completion_pending_note: "form ready",
          },
        },
      });

    const r = await humanVerifyTwinWork({
      org_entity_id: "00000000-0000-0000-0000-000000000001",
      human_entity_id: "00000000-0000-0000-0000-000000000002",
      ledger_entry_id: "00000000-0000-0000-0000-000000000010",
      note: "Checked against source comms",
    });
    expect(r.ok).toBe(true);
    const n = notifyMock.mock.calls.map(
      (c) => (c[0] as { notification_class: string }).notification_class,
    );
    expect(n).toContain(TWIN_WORK_CLASS.VERIFIED);
    expect(n).toContain(TWIN_WORK_CLASS.COMPLETE);
  });
});
