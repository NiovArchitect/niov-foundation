// FILE: comms-artifacts.test.ts (unit)
// PURPOSE: Phase 1285-T — lock the Comms recent-artifacts projection. Proves:
//          self/tenant scope, recency ordering, limit, ledger_type ->
//          artifact_type mapping, canonical participant labels (never a raw
//          UUID), source proof present, a real navigable destination, and an
//          honest empty result. prisma is mocked.
// CONNECTS TO: apps/api/src/services/work-os/comms-artifacts.service.ts

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

import {
  getRecentCommsArtifacts,
  getPendingFollowUps,
} from "../../apps/api/src/services/work-os/comms-artifacts.service.js";

const ORG = "org-1";
const CALLER = "ent-caller";

function row(over: Record<string, unknown> = {}) {
  const now = new Date("2026-06-17T12:00:00.000Z");
  return {
    ledger_entry_id: "led-1",
    org_entity_id: ORG,
    ledger_type: "FOLLOW_UP",
    source_type: "CHAT",
    source_command: null,
    conversation_id: null,
    work_plan_id: null,
    project_id: null,
    requester_entity_id: CALLER,
    owner_entity_id: "ent-other",
    target_entity_id: "ent-other",
    title: "Follow up with David",
    summary: "Send the proof notes",
    priority: "ROUTINE",
    status: "PROPOSED",
    authority_decision: null,
    policy_reason_code: null,
    extraction_source: "TYPESCRIPT_DETERMINISTIC",
    confidence_score: null,
    evidence: [],
    details: { source_message_id: "msg-7" },
    next_action: null,
    due_at: null,
    expires_at: null,
    created_at: now,
    updated_at: now,
    verified_at: null,
    ...over,
  };
}

beforeEach(() => {
  prismaMock.workLedgerEntry.findMany.mockReset();
  prismaMock.entity.findMany.mockReset();
  prismaMock.entity.findMany.mockResolvedValue([]);
});

describe("getRecentCommsArtifacts (Phase 1285-T)", () => {
  it("scopes to the caller (owner/target/requester) and the org (tenant isolation)", async () => {
    prismaMock.workLedgerEntry.findMany.mockResolvedValue([]);
    await getRecentCommsArtifacts({ org_entity_id: ORG, caller_entity_id: CALLER });
    const where = prismaMock.workLedgerEntry.findMany.mock.calls[0]![0].where;
    expect(where.org_entity_id).toBe(ORG);
    expect(JSON.stringify(where.OR)).toContain(CALLER);
    // Excludes dead statuses.
    expect(JSON.stringify(where.NOT)).toContain("CANCELLED");
  });

  it("orders by most-recent activity and caps the limit", async () => {
    prismaMock.workLedgerEntry.findMany.mockResolvedValue([]);
    await getRecentCommsArtifacts({ org_entity_id: ORG, caller_entity_id: CALLER, limit: 500 });
    const arg = prismaMock.workLedgerEntry.findMany.mock.calls[0]![0];
    expect(arg.orderBy).toEqual({ updated_at: "desc" });
    expect(arg.take).toBe(50); // clamped to MAX_LIMIT
  });

  it("maps ledger_type to artifact_type and carries canonical names + source proof", async () => {
    prismaMock.entity.findMany.mockResolvedValue([
      { entity_id: "ent-other", display_name: "David Odie" },
    ]);
    prismaMock.workLedgerEntry.findMany.mockResolvedValue([
      row({ ledger_entry_id: "fu", ledger_type: "FOLLOW_UP" }),
      row({ ledger_entry_id: "dec", ledger_type: "DECISION", title: "Decided on vendor" }),
      row({ ledger_entry_id: "bl", ledger_type: "BLOCKER", title: "Blocked on API key" }),
      row({ ledger_entry_id: "task", ledger_type: "TASK", title: "Review notes" }),
      row({ ledger_entry_id: "note", ledger_type: "NOTIFICATION", title: "Heads up" }),
    ]);
    const arts = await getRecentCommsArtifacts({ org_entity_id: ORG, caller_entity_id: CALLER });
    const byId = (id: string) => arts.find((a) => a.artifact_id === id)!;
    expect(byId("fu").artifact_type).toBe("FOLLOW_UP");
    expect(byId("dec").artifact_type).toBe("DECISION");
    expect(byId("bl").artifact_type).toBe("BLOCKER");
    expect(byId("task").artifact_type).toBe("WORK_CAPTURE");
    expect(byId("note").artifact_type).toBe("NOTIFICATION");
    // canonical participant label, never a raw UUID
    expect(byId("fu").related_person?.display_name).toBe("David Odie");
    expect(byId("fu").related_person?.display_name).not.toContain("ent-other");
    // source proof + real destination
    expect(byId("fu").source.source_message_id).toBe("msg-7");
    expect(byId("fu").source.ledger_entry_id).toBe("fu");
    expect(byId("fu").destination).toEqual({ kind: "work", route: "/app/my-work" });
    expect(byId("fu").scope).toBe("personal");
  });

  it("uses 'Unknown entity' for an unresolved counterpart, never a raw UUID label", async () => {
    prismaMock.entity.findMany.mockResolvedValue([]); // nothing resolves
    prismaMock.workLedgerEntry.findMany.mockResolvedValue([
      row({ ledger_entry_id: "x", owner_entity_id: "ent-ghost", target_entity_id: "ent-ghost" }),
    ]);
    const arts = await getRecentCommsArtifacts({ org_entity_id: ORG, caller_entity_id: CALLER });
    expect(arts[0]!.related_person?.display_name).toBe("Unknown entity");
    expect(arts[0]!.related_person?.unresolved).toBe(true);
    expect(arts[0]!.related_person?.display_name).not.toContain("ent-ghost");
  });

  it("returns an honest empty array when there are no artifacts", async () => {
    prismaMock.workLedgerEntry.findMany.mockResolvedValue([]);
    const arts = await getRecentCommsArtifacts({ org_entity_id: ORG, caller_entity_id: CALLER });
    expect(arts).toEqual([]);
  });

  it("projects meeting_intelligence ONLY when the row carries it (Phase 1286-C)", async () => {
    prismaMock.workLedgerEntry.findMany.mockResolvedValue([
      row({
        ledger_entry_id: "mtg",
        ledger_type: "TASK",
        title: "Launch sync",
        details: {
          source_message_id: "msg-9",
          meeting_intelligence: {
            status: "PYTHON_ENRICHED",
            authority: "FOUNDATION_VALIDATED",
            capability: "MEETING_INTELLIGENCE",
            summary: "Launch follow-up meeting.",
            candidates: [
              { candidate_type: "DECISION", text: "Go with the new copy.", confidence: "HIGH" },
              { candidate_type: "BLOCKER", text: "Waiting on compliance.", confidence: "MEDIUM" },
            ],
          },
        },
      }),
      row({ ledger_entry_id: "plain", ledger_type: "FOLLOW_UP" }), // no meeting_intelligence
    ]);
    const arts = await getRecentCommsArtifacts({ org_entity_id: ORG, caller_entity_id: CALLER });
    const mtg = arts.find((a) => a.artifact_id === "mtg")!;
    const plain = arts.find((a) => a.artifact_id === "plain")!;
    expect(mtg.meeting_intelligence).toBeDefined();
    expect(mtg.meeting_intelligence!.summary).toBe("Launch follow-up meeting.");
    expect(mtg.meeting_intelligence!.candidates.map((c) => c.candidate_type)).toEqual(["DECISION", "BLOCKER"]);
    // Absent on rows that do not carry it — never faked.
    expect(plain.meeting_intelligence).toBeUndefined();
  });
});

// A stored FOLLOW_UP send-card (a CommsSuggestedAction persisted verbatim at
// ingest under details.follow_up).
function followUpAction(over: Record<string, unknown> = {}) {
  return {
    local_id: "fu-david-1",
    action_type: "SEND_INTERNAL_NOTIFICATION",
    target: { entity_id: "ent-other", display_name: "David Odie", email: null },
    draft_text: "David — please confirm the launch timeline with each channel owner.",
    reason: "Owner of the launch coordination.",
    source_excerpt: "we agreed David owns the launch timeline",
    confidence: "HIGH",
    resolution_status: "RESOLVED",
    recipient_governance: { recipientSafety: "confirmed", sensitivity: "internal" },
    autonomy: { bucket: "READY" },
    ...over,
  };
}

describe("getPendingFollowUps (PROD-UX-BUGB — durable Comms send-cards)", () => {
  it("scopes to the caller as owner, the org, FOLLOW_UP type, and excludes done statuses", async () => {
    prismaMock.workLedgerEntry.findMany.mockResolvedValue([]);
    await getPendingFollowUps({ org_entity_id: ORG, caller_entity_id: CALLER });
    const where = prismaMock.workLedgerEntry.findMany.mock.calls[0]![0].where;
    expect(where.org_entity_id).toBe(ORG);
    expect(where.ledger_type).toBe("FOLLOW_UP");
    expect(where.owner_entity_id).toBe(CALLER);
    const doneJson = JSON.stringify(where.NOT);
    expect(doneJson).toContain("EXECUTED");
    expect(doneJson).toContain("CANCELLED");
  });

  it("returns the stored send-card verbatim so the CT re-renders the SAME card", async () => {
    prismaMock.workLedgerEntry.findMany.mockResolvedValue([
      row({
        ledger_entry_id: "led-fu",
        ledger_type: "FOLLOW_UP",
        owner_entity_id: CALLER,
        conversation_id: "cap-1",
        title: "Follow-up to David Odie",
        status: "DRAFT",
        details: { source: "conversation", meeting_capture_id: "cap-1", follow_up: followUpAction() },
      }),
    ]);
    const out = await getPendingFollowUps({ org_entity_id: ORG, caller_entity_id: CALLER });
    expect(out).toHaveLength(1);
    const fu = out[0]!;
    expect(fu.ledger_entry_id).toBe("led-fu");
    expect(fu.meeting_capture_id).toBe("cap-1");
    expect(fu.status).toBe("DRAFT");
    // The full pre-governed card is preserved — draft, recipient, governance.
    expect(fu.action.draft_text).toContain("confirm the launch timeline");
    expect(fu.action.local_id).toBe("fu-david-1");
    expect(fu.action.recipient_governance.recipientSafety).toBe("confirmed");
  });

  it("skips a FOLLOW_UP row missing its details.follow_up payload — never fabricates a card", async () => {
    prismaMock.workLedgerEntry.findMany.mockResolvedValue([
      row({ ledger_entry_id: "no-payload", ledger_type: "FOLLOW_UP", owner_entity_id: CALLER, details: { source: "conversation" } }),
      row({ ledger_entry_id: "ok", ledger_type: "FOLLOW_UP", owner_entity_id: CALLER, details: { follow_up: followUpAction({ local_id: "ok-1" }) } }),
    ]);
    const out = await getPendingFollowUps({ org_entity_id: ORG, caller_entity_id: CALLER });
    expect(out.map((f) => f.ledger_entry_id)).toEqual(["ok"]);
  });

  it("returns an honest empty array when the caller has no pending follow-ups", async () => {
    prismaMock.workLedgerEntry.findMany.mockResolvedValue([]);
    const out = await getPendingFollowUps({ org_entity_id: ORG, caller_entity_id: CALLER });
    expect(out).toEqual([]);
  });
});
