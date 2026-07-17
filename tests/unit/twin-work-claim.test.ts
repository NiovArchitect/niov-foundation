import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveTwinMock,
  createLedgerMock,
  getLedgerMock,
  notifyMock,
  writeAuditMock,
  updateMock,
} = vi.hoisted(() => ({
  resolveTwinMock: vi.fn(),
  createLedgerMock: vi.fn(),
  getLedgerMock: vi.fn(),
  notifyMock: vi.fn().mockResolvedValue({ ok: true }),
  writeAuditMock: vi.fn().mockResolvedValue({ audit_id: "a1" }),
  updateMock: vi.fn().mockResolvedValue({}),
}));

vi.mock("@niov/database", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    writeAuditEvent: writeAuditMock,
    prisma: {
      ...(actual.prisma as object),
      workLedgerEntry: { update: updateMock },
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
  TWIN_WORK_CLASS,
} from "../../apps/api/src/services/otzar/twin-work-claim.service.js";

beforeEach(() => {
  resolveTwinMock.mockReset();
  createLedgerMock.mockReset();
  getLedgerMock.mockReset();
  notifyMock.mockClear();
  writeAuditMock.mockClear();
  updateMock.mockClear();
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
});
