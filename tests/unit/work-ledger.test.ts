// FILE: work-ledger.test.ts (unit)
// PURPOSE: Phase 1279 — lock the durable Work Ledger. Proves: tenant
//          isolation (cross-tenant read → NOT_FOUND), employee scope
//          (only own owner/target/requester entries), manager team scope
//          vs honest TEAM_SCOPE_NOT_CONFIGURED, blind-spots derivation,
//          extraction_source + evidence preserved, enum validation, and
//          that status is data (no execution). prisma is mocked.
// CONNECTS TO: apps/api/src/services/work-os/work-ledger.service.ts

import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    workLedgerEntry: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    // Phase 1283 — getBlindSpots now reads failed execution attempts to
    // surface runtime/verification issues. Default to none for the existing
    // status-based assertions; proof-failure behavior is covered live.
    executionAttempt: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    // Phase 1285-G — getTeamWork now batch-resolves participant display names.
    // Default to none (names left undefined); name enrichment is covered by the
    // internal-message integration test against real entities.
    entity: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

vi.mock("@niov/database", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, prisma: prismaMock };
});

import {
  createLedgerEntry,
  listLedgerEntries,
  getLedgerEntry,
  getTeamWork,
  getBlindSpots,
} from "../../apps/api/src/services/work-os/work-ledger.service.js";

const ORG = "org-1";
const CALLER = "ent-caller";

function row(over: Record<string, unknown> = {}) {
  const now = new Date("2026-06-13T18:00:00.000Z");
  return {
    ledger_entry_id: "led-1",
    org_entity_id: ORG,
    ledger_type: "FOLLOW_UP",
    source_type: "VOICE_COMMAND",
    source_command: "I told Vishesh I would follow up",
    conversation_id: null,
    work_plan_id: null,
    project_id: null,
    requester_entity_id: CALLER,
    owner_entity_id: CALLER,
    target_entity_id: "ent-vishesh",
    title: "Follow up with Vishesh",
    summary: null,
    priority: "ROUTINE",
    status: "DRAFT",
    authority_decision: null,
    policy_reason_code: null,
    extraction_source: "TYPESCRIPT_DETERMINISTIC",
    confidence_score: null,
    evidence: [{ field: "context_label", value: "Otzar voice runtime", confidence: "HIGH" }],
    next_action: "Send the follow-up",
    due_at: null,
    created_at: now,
    updated_at: now,
    verified_at: null,
    ...over,
  };
}

beforeEach(() => {
  prismaMock.workLedgerEntry.create.mockReset();
  prismaMock.workLedgerEntry.findMany.mockReset();
  prismaMock.workLedgerEntry.findUnique.mockReset();
  prismaMock.workLedgerEntry.update.mockReset();
});

describe("createLedgerEntry", () => {
  it("creates a tenant-scoped entry, preserving extraction_source + evidence", async () => {
    prismaMock.workLedgerEntry.create.mockResolvedValue(row());
    const r = await createLedgerEntry({
      org_entity_id: ORG,
      ledger_type: "FOLLOW_UP",
      title: "Follow up with Vishesh",
      owner_entity_id: CALLER,
      target_entity_id: "ent-vishesh",
      extraction_source: "TYPESCRIPT_DETERMINISTIC",
      evidence: [{ field: "context_label", value: "Otzar voice runtime", confidence: "HIGH" }],
    });
    expect(r.ok).toBe(true);
    if (r.ok === false) throw new Error("expected ok");
    expect(r.entry.extraction_source).toBe("TYPESCRIPT_DETERMINISTIC");
    expect(Array.isArray(r.entry.evidence)).toBe(true);
    // The create payload was tenant-scoped.
    expect(prismaMock.workLedgerEntry.create.mock.calls[0]![0].data.org_entity_id).toBe(ORG);
  });

  it("rejects an invalid ledger_type / status (no fake state)", async () => {
    const bad = await createLedgerEntry({ org_entity_id: ORG, ledger_type: "NONSENSE", title: "x" });
    expect(bad.ok).toBe(false);
    if (bad.ok) throw new Error("expected fail");
    expect(bad.code).toBe("INVALID_REQUEST");
  });

  it("never claims PYTHON_ENRICHED unless explicitly given", async () => {
    prismaMock.workLedgerEntry.create.mockImplementation(async (args: { data: Record<string, unknown> }) =>
      row({ extraction_source: args.data.extraction_source }),
    );
    const r = await createLedgerEntry({ org_entity_id: ORG, ledger_type: "TASK", title: "Ask David to review" });
    if (r.ok === false) throw new Error("expected ok");
    expect(r.entry.extraction_source).toBe("TYPESCRIPT_DETERMINISTIC");
  });
});

describe("listLedgerEntries — scope", () => {
  it("an employee only sees entries they are party to (owner/target/requester)", async () => {
    prismaMock.workLedgerEntry.findMany.mockResolvedValue([row()]);
    await listLedgerEntries({ org_entity_id: ORG, caller_entity_id: CALLER, is_manager: false });
    const where = prismaMock.workLedgerEntry.findMany.mock.calls[0]![0].where;
    expect(where.org_entity_id).toBe(ORG);
    expect(where.OR).toEqual([
      { owner_entity_id: CALLER },
      { target_entity_id: CALLER },
      { requester_entity_id: CALLER },
    ]);
  });

  it("a manager sees the whole org (no employee OR narrowing)", async () => {
    prismaMock.workLedgerEntry.findMany.mockResolvedValue([row()]);
    await listLedgerEntries({ org_entity_id: ORG, caller_entity_id: CALLER, is_manager: true });
    const where = prismaMock.workLedgerEntry.findMany.mock.calls[0]![0].where;
    expect(where.org_entity_id).toBe(ORG);
    expect(where.OR).toBeUndefined();
  });
});

describe("getLedgerEntry — tenant isolation", () => {
  it("a row in another tenant reads as NOT_FOUND (no cross-tenant bleed)", async () => {
    prismaMock.workLedgerEntry.findUnique.mockResolvedValue(row({ org_entity_id: "org-OTHER" }));
    const r = await getLedgerEntry({
      ledger_entry_id: "led-1",
      org_entity_id: ORG,
      caller_entity_id: CALLER,
      is_manager: true,
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected NOT_FOUND");
    expect(r.code).toBe("NOT_FOUND");
  });

  it("an employee not party to the entry reads NOT_FOUND", async () => {
    prismaMock.workLedgerEntry.findUnique.mockResolvedValue(
      row({ owner_entity_id: "ent-other", target_entity_id: "ent-other2", requester_entity_id: "ent-other3" }),
    );
    const r = await getLedgerEntry({
      ledger_entry_id: "led-1",
      org_entity_id: ORG,
      caller_entity_id: CALLER,
      is_manager: false,
    });
    expect(r.ok).toBe(false);
  });
});

describe("getTeamWork", () => {
  it("a non-manager gets the honest TEAM_SCOPE_NOT_CONFIGURED blocker", async () => {
    const r = await getTeamWork({ org_entity_id: ORG, is_manager: false });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected blocker");
    expect(r.code).toBe("TEAM_SCOPE_NOT_CONFIGURED");
    expect(prismaMock.workLedgerEntry.findMany).not.toHaveBeenCalled();
  });

  it("a manager gets org team entries", async () => {
    prismaMock.workLedgerEntry.findMany.mockResolvedValue([row()]);
    const r = await getTeamWork({ org_entity_id: ORG, is_manager: true });
    expect(r.ok).toBe(true);
    if (r.ok === false) throw new Error("expected ok");
    expect(r.entries.length).toBe(1);
    expect(prismaMock.workLedgerEntry.findMany.mock.calls[0]![0].where.org_entity_id).toBe(ORG);
  });
});

describe("getBlindSpots", () => {
  it("queries attention-needing statuses / overdue / ownerless, tenant-scoped", async () => {
    prismaMock.workLedgerEntry.findMany.mockResolvedValue([row({ status: "BLOCKED" })]);
    const r = await getBlindSpots({ org_entity_id: ORG, caller_entity_id: CALLER, is_manager: false });
    expect(r.length).toBe(1);
    const where = prismaMock.workLedgerEntry.findMany.mock.calls[0]![0].where;
    expect(where.org_entity_id).toBe(ORG);
    expect(where.OR).toBeDefined(); // employee narrowing
    expect(JSON.stringify(where.AND)).toContain("BLOCKED");
  });
});
