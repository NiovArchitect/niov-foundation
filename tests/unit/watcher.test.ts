// FILE: watcher.test.ts (unit)
// PURPOSE: Phase 1285-P — lock the governed watcher feed (getWatcherFeed).
//          Proves: deterministic detection over durable state (OVERDUE_WORK /
//          STALE_WAITING_ON / UNRESOLVED_BLOCKER / NO_NEXT_ACTION), done work
//          excluded by query, employee vs manager scope, tenant isolation,
//          canonical entity labels (never raw UUID), proof fields present, and
//          that the feed is BEAM-independent (deterministic Foundation
//          fallback — no BEAM client is called). prisma is mocked.
// CONNECTS TO: apps/api/src/services/work-os/watcher.service.ts

import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    workLedgerEntry: { findMany: vi.fn() },
    entity: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

vi.mock("@niov/database", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, prisma: prismaMock };
});

import { getWatcherFeed } from "../../apps/api/src/services/work-os/watcher.service.js";

const ORG = "org-1";
const CALLER = "ent-caller";

const NOW = Date.parse("2026-06-16T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const past = (ms: number) => new Date(NOW - ms);

function row(over: Record<string, unknown> = {}) {
  return {
    ledger_entry_id: "led-1",
    org_entity_id: ORG,
    ledger_type: "TASK",
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
    status: "PROPOSED",
    authority_decision: null,
    policy_reason_code: null,
    extraction_source: "TYPESCRIPT_DETERMINISTIC",
    confidence_score: null,
    evidence: [],
    details: {},
    next_action: "Send the follow-up",
    due_at: null,
    expires_at: null,
    created_at: past(1 * DAY),
    updated_at: past(1 * DAY),
    verified_at: null,
    ...over,
  };
}

beforeEach(() => {
  prismaMock.workLedgerEntry.findMany.mockReset();
  prismaMock.entity.findMany.mockReset();
  prismaMock.entity.findMany.mockResolvedValue([]);
});

describe("getWatcherFeed (Phase 1285-P) — deterministic detection", () => {
  it("emits OVERDUE_WORK for an overdue active item (HIGH when >7d)", async () => {
    prismaMock.entity.findMany.mockResolvedValue([
      { entity_id: CALLER, display_name: "Sadeil" },
    ]);
    prismaMock.workLedgerEntry.findMany.mockResolvedValue([
      row({ ledger_entry_id: "ov", due_at: past(10 * DAY), updated_at: past(1 * DAY) }),
    ]);
    const feed = await getWatcherFeed({ org_entity_id: ORG, caller_entity_id: CALLER, is_manager: false, now: NOW });
    const f = feed.find((x) => x.watcher_type === "OVERDUE_WORK");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("HIGH");
    expect(f!.detection.rule_id).toBe("OVERDUE_WORK_V1");
    expect(f!.recommendation.action_kind).toBe("nudge_owner");
  });

  it("emits STALE_WAITING_ON for a stale directional ask with canonical names", async () => {
    prismaMock.entity.findMany.mockResolvedValue([
      { entity_id: CALLER, display_name: "Sadeil" },
      { entity_id: "ent-david", display_name: "David Odie" },
    ]);
    prismaMock.workLedgerEntry.findMany.mockResolvedValue([
      row({
        ledger_entry_id: "st", requester_entity_id: CALLER, owner_entity_id: "ent-david",
        target_entity_id: "ent-david", due_at: null, updated_at: past(3 * DAY),
      }),
    ]);
    const feed = await getWatcherFeed({ org_entity_id: ORG, caller_entity_id: CALLER, is_manager: false, now: NOW });
    const f = feed.find((x) => x.watcher_type === "STALE_WAITING_ON")!;
    expect(f).toBeDefined();
    expect(f.owner!.display_name).toBe("David Odie"); // canonical, never a UUID
    expect(f.requester!.display_name).toBe("Sadeil");
    expect(f.detection.threshold_hours).toBe(48);
    expect(f.recommendation.next_action.toLowerCase()).toContain("nudge");
  });

  it("does NOT emit STALE_WAITING_ON for a fresh waiting-on item", async () => {
    prismaMock.entity.findMany.mockResolvedValue([
      { entity_id: "ent-david", display_name: "David Odie" },
    ]);
    prismaMock.workLedgerEntry.findMany.mockResolvedValue([
      row({
        ledger_entry_id: "fresh", requester_entity_id: CALLER, owner_entity_id: "ent-david",
        target_entity_id: "ent-david", due_at: null, updated_at: past(2 * 60 * 60 * 1000), // 2h
        next_action: "Waiting on David",
      }),
    ]);
    const feed = await getWatcherFeed({ org_entity_id: ORG, caller_entity_id: CALLER, is_manager: false, now: NOW });
    expect(feed.some((x) => x.watcher_type === "STALE_WAITING_ON")).toBe(false);
  });

  it("emits UNRESOLVED_BLOCKER for an active blocker (HIGH)", async () => {
    prismaMock.entity.findMany.mockResolvedValue([{ entity_id: CALLER, display_name: "Sadeil" }]);
    prismaMock.workLedgerEntry.findMany.mockResolvedValue([
      row({ ledger_entry_id: "bl", ledger_type: "BLOCKER", due_at: null }),
    ]);
    const feed = await getWatcherFeed({ org_entity_id: ORG, caller_entity_id: CALLER, is_manager: false, now: NOW });
    const f = feed.find((x) => x.watcher_type === "UNRESOLVED_BLOCKER")!;
    expect(f).toBeDefined();
    expect(f.severity).toBe("HIGH");
    expect(f.recommendation.action_kind).toBe("review_blocker");
  });

  it("excludes done work via the query filter (CANCELLED/EXPIRED/VERIFIED/EXECUTED)", async () => {
    prismaMock.workLedgerEntry.findMany.mockResolvedValue([]);
    await getWatcherFeed({ org_entity_id: ORG, caller_entity_id: CALLER, is_manager: false, now: NOW });
    const where = prismaMock.workLedgerEntry.findMany.mock.calls[0]![0].where;
    expect(JSON.stringify(where.NOT)).toContain("EXECUTED");
    expect(JSON.stringify(where.NOT)).toContain("VERIFIED");
    expect(JSON.stringify(where.NOT)).toContain("CANCELLED");
    expect(JSON.stringify(where.NOT)).toContain("EXPIRED");
  });

  it("scopes to the caller (own/owned/requested) for employees; org-wide for managers", async () => {
    prismaMock.workLedgerEntry.findMany.mockResolvedValue([]);
    await getWatcherFeed({ org_entity_id: ORG, caller_entity_id: CALLER, is_manager: false, now: NOW });
    const empWhere = prismaMock.workLedgerEntry.findMany.mock.calls[0]![0].where;
    expect(empWhere.org_entity_id).toBe(ORG); // tenant isolation
    expect(empWhere.OR).toBeDefined();
    expect(JSON.stringify(empWhere.OR)).toContain(CALLER); // only the caller's work

    prismaMock.workLedgerEntry.findMany.mockClear();
    await getWatcherFeed({ org_entity_id: ORG, caller_entity_id: CALLER, is_manager: true, now: NOW });
    const mgrWhere = prismaMock.workLedgerEntry.findMany.mock.calls[0]![0].where;
    expect(mgrWhere.org_entity_id).toBe(ORG);
    expect(mgrWhere.OR).toBeUndefined();
  });

  it("an unrelated employee's scope only matches their own id (cannot see others' findings)", async () => {
    prismaMock.workLedgerEntry.findMany.mockResolvedValue([]);
    await getWatcherFeed({ org_entity_id: ORG, caller_entity_id: "ent-unrelated", is_manager: false, now: NOW });
    const where = prismaMock.workLedgerEntry.findMany.mock.calls[0]![0].where;
    expect(JSON.stringify(where.OR)).toContain("ent-unrelated");
    expect(JSON.stringify(where.OR)).not.toContain(CALLER);
  });

  it("uses 'Unknown entity' + unresolved for missing entities, never a raw UUID", async () => {
    prismaMock.entity.findMany.mockResolvedValue([]); // nothing resolves
    prismaMock.workLedgerEntry.findMany.mockResolvedValue([
      row({
        ledger_entry_id: "miss", requester_entity_id: CALLER, owner_entity_id: "ent-ghost",
        target_entity_id: "ent-ghost", due_at: null, updated_at: past(3 * DAY),
      }),
    ]);
    const feed = await getWatcherFeed({ org_entity_id: ORG, caller_entity_id: CALLER, is_manager: false, now: NOW });
    const f = feed.find((x) => x.watcher_type === "STALE_WAITING_ON")!;
    expect(f.owner!.display_name).toBe("Unknown entity");
    expect(f.owner!.unresolved).toBe(true);
    // The UUID may ride as secondary proof, but never as the display label.
    expect(f.owner!.display_name).not.toContain("ent-ghost");
  });

  it("findings carry proof: deterministic id + source + detection + recommendation", async () => {
    prismaMock.entity.findMany.mockResolvedValue([{ entity_id: CALLER, display_name: "Sadeil" }]);
    prismaMock.workLedgerEntry.findMany.mockResolvedValue([
      row({ ledger_entry_id: "pf", ledger_type: "BLOCKER", due_at: null, details: { source_message_id: "msg-7" } }),
    ]);
    const feed = await getWatcherFeed({ org_entity_id: ORG, caller_entity_id: CALLER, is_manager: false, now: NOW });
    const f = feed[0]!;
    expect(f.finding_id).toContain("pf");
    expect(f.source.ledger_entry_id).toBe("pf");
    expect(f.source.source_message_id).toBe("msg-7");
    expect(f.detection.rule_id.length).toBeGreaterThan(0);
    expect(f.detection.reason.length).toBeGreaterThan(0);
    expect(f.recommendation.next_action.length).toBeGreaterThan(0);
    expect(f.org_id).toBe(ORG);
  });

  it("emits exactly one finding per entry (highest-priority), never double-counted", async () => {
    prismaMock.entity.findMany.mockResolvedValue([
      { entity_id: "ent-david", display_name: "David Odie" },
    ]);
    // Trips BOTH stale-waiting-on AND no-next-action → must appear once as STALE.
    prismaMock.workLedgerEntry.findMany.mockResolvedValue([
      row({
        ledger_entry_id: "multi", requester_entity_id: CALLER, owner_entity_id: "ent-david",
        target_entity_id: "ent-david", next_action: null, due_at: null, updated_at: past(3 * DAY),
      }),
    ]);
    const feed = await getWatcherFeed({ org_entity_id: ORG, caller_entity_id: CALLER, is_manager: false, now: NOW });
    expect(feed.length).toBe(1);
    expect(feed[0]!.watcher_type).toBe("STALE_WAITING_ON");
  });

  it("is BEAM-independent — produces findings with only durable state (no BEAM client called)", async () => {
    // No BEAM mock exists; if getWatcherFeed reached for BEAM it would fail.
    prismaMock.entity.findMany.mockResolvedValue([{ entity_id: CALLER, display_name: "Sadeil" }]);
    prismaMock.workLedgerEntry.findMany.mockResolvedValue([
      row({ ledger_entry_id: "ov2", due_at: past(2 * DAY), updated_at: past(1 * DAY) }),
    ]);
    const feed = await getWatcherFeed({ org_entity_id: ORG, caller_entity_id: CALLER, is_manager: false, now: NOW });
    expect(feed.length).toBeGreaterThan(0);
  });
});
