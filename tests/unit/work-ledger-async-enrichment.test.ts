// FILE: work-ledger-async-enrichment.test.ts (unit)
// PURPOSE: Phase 1285-U — lock the ASYNC, best-effort Python enrichment.
//          Deterministic extraction stays primary and the ledger write NEVER
//          blocks on Python: the row is created immediately with a PENDING
//          enrichment marker, and a fire-and-forget task attaches the real
//          outcome (or an honest failure status) without duplicating artifacts
//          or overriding deterministic truth. prisma + the Python service are
//          mocked.
// CONNECTS TO: apps/api/src/services/work-os/work-ledger.service.ts

import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    workLedgerEntry: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    executionAttempt: { create: vi.fn() },
  },
}));

const { extractMock } = vi.hoisted(() => ({ extractMock: vi.fn() }));

vi.mock("@niov/database", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, prisma: prismaMock };
});

vi.mock(
  "../../apps/api/src/services/intelligence/python-enrichment.service.js",
  () => ({ extractWorkSignals: extractMock }),
);

import {
  createLedgerEntry,
  enrichLedgerEntryAsync,
} from "../../apps/api/src/services/work-os/work-ledger.service.js";

const ORG = "org-1";

function dbRow(over: Record<string, unknown> = {}) {
  return {
    ledger_entry_id: "led-1",
    org_entity_id: ORG,
    ledger_type: "TASK",
    source_type: "CHAT",
    source_command: null,
    conversation_id: null,
    work_plan_id: null,
    project_id: null,
    requester_entity_id: null,
    owner_entity_id: null,
    target_entity_id: null,
    title: "Ask David to review",
    summary: null,
    priority: "ROUTINE",
    status: "DRAFT",
    authority_decision: null,
    policy_reason_code: null,
    extraction_source: "TYPESCRIPT_DETERMINISTIC",
    confidence_score: null,
    evidence: [],
    details: {},
    next_action: null,
    due_at: null,
    expires_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    verified_at: null,
    ...over,
  };
}

function result(over: Record<string, unknown> = {}) {
  return {
    status: "PYTHON_ENRICHED",
    signals: [{ signal_type: "TASK", confidence: "HIGH", evidence_phrase: "review the flow" }],
    primary_signal: "TASK",
    multi_intent: false,
    ...over,
  };
}

beforeEach(() => {
  prismaMock.workLedgerEntry.create.mockReset();
  prismaMock.workLedgerEntry.findFirst.mockReset();
  prismaMock.workLedgerEntry.update.mockReset();
  prismaMock.executionAttempt.create.mockReset();
  prismaMock.executionAttempt.create.mockResolvedValue({});
  extractMock.mockReset();
});

describe("createLedgerEntry — Python is NON-BLOCKING (Phase 1285-U)", () => {
  it("creates the row with a PENDING advisory envelope and does NOT await Python", async () => {
    // Python hangs forever — the create must still resolve immediately.
    let resolved = false;
    extractMock.mockImplementation(
      () => new Promise(() => { /* never resolves */ resolved = true; }),
    );
    prismaMock.workLedgerEntry.create.mockImplementation(async (a: { data: Record<string, unknown> }) =>
      dbRow({ details: a.data.details }),
    );

    const r = await createLedgerEntry({
      org_entity_id: ORG,
      ledger_type: "TASK",
      title: "Ask David to review",
      enable_python_enrichment: true,
      enrichment_text: "David, can you review the UI flow by Friday?",
    });
    expect(r.ok).toBe(true);
    // The deterministic write happened with a PENDING advisory envelope;
    // extraction stays deterministic (NOT upgraded synchronously).
    const created = prismaMock.workLedgerEntry.create.mock.calls[0]![0].data;
    const env = (created.details as Record<string, any>).python_enrichment;
    expect(env.status).toBe("PENDING");
    expect(env.source).toBe("PYTHON_ADVISORY");
    expect(env.capability).toBe("WORK_SIGNAL_EXTRACTION");
    expect(env.authority).toBe(null);
    expect(created.extraction_source).toBe("TYPESCRIPT_DETERMINISTIC");
    void resolved;
  });

  it("succeeds with NO enrichment block when enrichment is not requested", async () => {
    prismaMock.workLedgerEntry.create.mockImplementation(async (a: { data: Record<string, unknown> }) =>
      dbRow({ details: a.data.details }),
    );
    const r = await createLedgerEntry({ org_entity_id: ORG, ledger_type: "TASK", title: "Plain task" });
    expect(r.ok).toBe(true);
    const created = prismaMock.workLedgerEntry.create.mock.calls[0]![0].data;
    expect((created.details as Record<string, unknown>).python_enrichment).toBeUndefined();
    // Python is never called when enrichment is not requested.
    expect(extractMock).not.toHaveBeenCalled();
  });
});

describe("enrichLedgerEntryAsync — best-effort patch, no overrides", () => {
  it("attaches PYTHON_ENRICHED + upgrades extraction_source on real signals (caller not pinned)", async () => {
    extractMock.mockResolvedValue(result());
    prismaMock.workLedgerEntry.findFirst.mockResolvedValue({
      details: { source_message_id: "msg-1" },
      extraction_source: "TYPESCRIPT_DETERMINISTIC",
    });
    await enrichLedgerEntryAsync({
      ledger_entry_id: "led-1",
      org_entity_id: ORG,
      text: "review the flow",
      caller_pinned_extraction: false,
    });
    const upd = prismaMock.workLedgerEntry.update.mock.calls[0]![0];
    expect(upd.data.details.python_enrichment.status).toBe("PYTHON_ENRICHED");
    // preserves existing details (no clobber of source_message_id)
    expect(upd.data.details.source_message_id).toBe("msg-1");
    expect(upd.data.extraction_source).toBe("PYTHON_ENRICHED");
    // No duplicate artifact created.
    expect(prismaMock.workLedgerEntry.create).not.toHaveBeenCalled();
  });

  it("does NOT upgrade extraction_source when the caller pinned it", async () => {
    extractMock.mockResolvedValue(result());
    prismaMock.workLedgerEntry.findFirst.mockResolvedValue({
      details: {},
      extraction_source: "MANUAL",
    });
    await enrichLedgerEntryAsync({
      ledger_entry_id: "led-1",
      org_entity_id: ORG,
      text: "review the flow",
      caller_pinned_extraction: true,
    });
    const upd = prismaMock.workLedgerEntry.update.mock.calls[0]![0];
    expect(upd.data.details.python_enrichment.status).toBe("PYTHON_ENRICHED");
    expect(upd.data.extraction_source).toBeUndefined(); // not upgraded
  });

  it("records NO_SIGNAL / NOT_CONFIGURED without upgrading extraction (no fake enrichment)", async () => {
    for (const [svc, expected] of [
      ["PYTHON_NOT_CONFIGURED", "NOT_CONFIGURED"],
      ["PYTHON_ENRICHED", "NO_SIGNAL"], // 200 but empty signals
    ] as const) {
      prismaMock.workLedgerEntry.update.mockReset();
      extractMock.mockResolvedValue(result({ status: svc, signals: [] }));
      prismaMock.workLedgerEntry.findFirst.mockResolvedValue({ details: {}, extraction_source: "TYPESCRIPT_DETERMINISTIC" });
      await enrichLedgerEntryAsync({ ledger_entry_id: "led-1", org_entity_id: ORG, text: "x", caller_pinned_extraction: false });
      const upd = prismaMock.workLedgerEntry.update.mock.calls[0]![0];
      expect(upd.data.details.python_enrichment.status).toBe(expected);
      expect(upd.data.extraction_source).toBeUndefined();
    }
  });

  it("marks ERROR and never throws when the Python call throws (deterministic row intact)", async () => {
    extractMock.mockRejectedValue(new Error("boom"));
    prismaMock.workLedgerEntry.findFirst.mockResolvedValue({ details: {}, extraction_source: "TYPESCRIPT_DETERMINISTIC" });
    await expect(
      enrichLedgerEntryAsync({ ledger_entry_id: "led-1", org_entity_id: ORG, text: "x", caller_pinned_extraction: false }),
    ).resolves.toBeUndefined();
    const upd = prismaMock.workLedgerEntry.update.mock.calls[0]![0];
    expect(upd.data.details.python_enrichment.status).toBe("ERROR");
    expect(upd.data.extraction_source).toBeUndefined();
  });

  it("no-ops safely when the row is gone (deleted/cross-tenant)", async () => {
    extractMock.mockResolvedValue(result());
    prismaMock.workLedgerEntry.findFirst.mockResolvedValue(null);
    await enrichLedgerEntryAsync({ ledger_entry_id: "gone", org_entity_id: ORG, text: "x", caller_pinned_extraction: false });
    expect(prismaMock.workLedgerEntry.update).not.toHaveBeenCalled();
  });
});
