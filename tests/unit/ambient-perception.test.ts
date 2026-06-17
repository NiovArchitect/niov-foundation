// FILE: ambient-perception.test.ts (unit)
// PURPOSE: Phase 1285-V — lock the ambient perception pipeline. Deterministic
//          capture is primary + non-blocking (a durable MEETING ledger entry
//          with a PENDING meeting-intelligence envelope); async meeting
//          intelligence is best-effort, Foundation-validated, stored separately,
//          never mutates governed truth, never duplicates, never blocks. prisma
//          + the Python perception client are mocked.
// CONNECTS TO: apps/api/src/services/perception/ambient-perception.service.ts

import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    workLedgerEntry: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    executionAttempt: { create: vi.fn() },
  },
}));
const { extractMock } = vi.hoisted(() => ({ extractMock: vi.fn() }));

vi.mock("@niov/database", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, prisma: prismaMock };
});
vi.mock(
  "../../apps/api/src/services/intelligence/python-perception.service.js",
  async (importOriginal) => {
    const actual = (await importOriginal()) as Record<string, unknown>;
    return { ...actual, extractMeetingIntelligence: extractMock };
  },
);

import {
  capturePerception,
  captureDevicePerception,
  enrichMeetingIntelligenceAsync,
} from "../../apps/api/src/services/perception/ambient-perception.service.js";

const ORG = "org-1";
const CALLER = "ent-caller";

function dbRow(over: Record<string, unknown> = {}) {
  return {
    ledger_entry_id: "led-cap",
    org_entity_id: ORG,
    ledger_type: "MEETING",
    source_type: "TRANSCRIPT",
    source_command: null,
    conversation_id: null,
    work_plan_id: null,
    project_id: null,
    requester_entity_id: CALLER,
    owner_entity_id: CALLER,
    target_entity_id: null,
    title: "Launch follow-up meeting.",
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

function meeting(over: Record<string, unknown> = {}) {
  return {
    status: "PYTHON_ENRICHED",
    summary: "Launch follow-up meeting.",
    candidates: [
      { candidate_type: "DECISION", text: "We decided to go with the new copy.", confidence: "HIGH", evidence_phrase: "we decided" },
    ],
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
  // createLedgerEntry records a WORK_LEDGER_CREATE attempt too.
  prismaMock.workLedgerEntry.create.mockImplementation(async (a: { data: Record<string, unknown> }) =>
    dbRow({ details: a.data.details, source_type: a.data.source_type, title: a.data.title }),
  );
});

describe("capturePerception — deterministic capture is primary + non-blocking", () => {
  it("creates a durable MEETING entry with a PENDING meeting-intelligence envelope; does NOT await Python", async () => {
    extractMock.mockImplementation(() => new Promise(() => {})); // hangs forever
    const r = await capturePerception({
      org_entity_id: ORG,
      caller_entity_id: CALLER,
      source_type: "MEETING_TRANSCRIPT",
      text: "Launch follow-up meeting.\nDavid: I'll review by Friday.",
    });
    expect(r.ok).toBe(true);
    const created = prismaMock.workLedgerEntry.create.mock.calls[0]![0].data;
    expect(created.ledger_type).toBe("MEETING");
    expect(created.source_type).toBe("TRANSCRIPT");
    expect(created.owner_entity_id).toBe(CALLER);
    const env = (created.details as Record<string, any>).meeting_intelligence;
    expect(env.status).toBe("PENDING");
    expect(env.capability).toBe("MEETING_INTELLIGENCE");
    expect(env.source).toBe("PYTHON_ADVISORY");
    expect((created.details as Record<string, unknown>).ambient_source_type).toBe("MEETING_TRANSCRIPT");
    // extraction stays deterministic (advisory never upgrades it for captures).
    expect(created.extraction_source).toBe("TYPESCRIPT_DETERMINISTIC");
  });

  it("rejects empty text and reserved future ambient sources (honest, not faked)", async () => {
    const empty = await capturePerception({ org_entity_id: ORG, caller_entity_id: CALLER, source_type: "MEETING_TRANSCRIPT", text: "  " });
    expect(empty.ok).toBe(false);
    const glasses = await capturePerception({ org_entity_id: ORG, caller_entity_id: CALLER, source_type: "GLASSES_VISUAL_FRAME", text: "a slide says launch is Friday" });
    expect(glasses.ok).toBe(false);
    if (!glasses.ok) expect(glasses.message).toMatch(/reserved for a future ambient input/);
    // No capture row created for invalid input.
    expect(prismaMock.workLedgerEntry.create).not.toHaveBeenCalled();
  });
});

describe("captureDevicePerception — glasses/lens adapter (Phase 1287-A)", () => {
  const goodConsent = { user_initiated: true, capture_visible_to_user: true, bystander_sensitive: false };

  it("accepts a valid user-initiated glasses note: durable MEETING entry + safe consent/device/visibility metadata", async () => {
    extractMock.mockImplementation(() => new Promise(() => {})); // hang — capture must not await
    const r = await captureDevicePerception({
      org_entity_id: ORG,
      caller_entity_id: CALLER,
      source_type: "GLASSES_NOTE",
      text: "Note to self: ship the launch checklist by Friday.",
      consent: goodConsent,
      device_context: { device_type: "glasses", device_id: "hw-secret-123", capture_mode: "user_tapped" },
      visibility: { scope: "private" },
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.disposition).toBe("STORED");
    const data = prismaMock.workLedgerEntry.create.mock.calls[0]![0].data as Record<string, any>;
    expect(data.ledger_type).toBe("MEETING");
    expect(data.source_type).toBe("AMBIENT_DEVICE");
    expect(data.owner_entity_id).toBe(CALLER); // session is the only authority
    expect(data.details.ambient_source_type).toBe("GLASSES_NOTE");
    expect(data.details.device_context).toEqual({ device_type: "glasses", capture_mode: "user_tapped" });
    expect(data.details.consent.user_initiated).toBe(true);
    expect(data.details.visibility.scope).toBe("private");
    expect(data.details.meeting_intelligence.status).toBe("PENDING");
    // device_id (untrusted hardware id) is NEVER stored.
    expect(JSON.stringify(data.details)).not.toContain("hw-secret-123");
  });

  it("rejects empty text and a reserved visual source (no row created)", async () => {
    expect((await captureDevicePerception({ org_entity_id: ORG, caller_entity_id: CALLER, source_type: "GLASSES_NOTE", text: "  ", consent: goodConsent })).ok).toBe(false);
    const visual = await captureDevicePerception({ org_entity_id: ORG, caller_entity_id: CALLER, source_type: "GLASSES_VISUAL_FRAME", text: "a face", consent: goodConsent });
    expect(visual.ok).toBe(false);
    if (!visual.ok) expect(visual.code).toBe("SOURCE_NOT_SUPPORTED");
    expect(prismaMock.workLedgerEntry.create).not.toHaveBeenCalled();
  });

  it("rejects a raw camera frame / image payload (RAW_FRAME_REJECTED, no row, no recognition)", async () => {
    const r = await captureDevicePerception({
      org_entity_id: ORG, caller_entity_id: CALLER, source_type: "GLASSES_NOTE", text: "x",
      consent: goodConsent, raw_media_keys: ["image"],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("RAW_FRAME_REJECTED");
    expect(prismaMock.workLedgerEntry.create).not.toHaveBeenCalled();
  });

  it("rejects non-user-initiated / invisible capture (CONSENT_REQUIRED, no row)", async () => {
    const notInitiated = await captureDevicePerception({ org_entity_id: ORG, caller_entity_id: CALLER, source_type: "GLASSES_NOTE", text: "x", consent: { user_initiated: false, capture_visible_to_user: true, bystander_sensitive: false } });
    expect(notInitiated.ok).toBe(false);
    if (!notInitiated.ok) expect(notInitiated.code).toBe("CONSENT_REQUIRED");
    const invisible = await captureDevicePerception({ org_entity_id: ORG, caller_entity_id: CALLER, source_type: "GLASSES_NOTE", text: "x", consent: { user_initiated: true, capture_visible_to_user: false, bystander_sensitive: false } });
    expect(invisible.ok).toBe(false);
    expect(prismaMock.workLedgerEntry.create).not.toHaveBeenCalled();
  });

  it("blocks bystander-sensitive capture unless private; private downgrades + strips the person hint", async () => {
    const blocked = await captureDevicePerception({ org_entity_id: ORG, caller_entity_id: CALLER, source_type: "LENS_CONTEXT", text: "overheard a plan", consent: { user_initiated: true, capture_visible_to_user: true, bystander_sensitive: true }, visibility: { scope: "org" } });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.code).toBe("BYSTANDER_BLOCKED");
    expect(prismaMock.workLedgerEntry.create).not.toHaveBeenCalled();

    extractMock.mockImplementation(() => new Promise(() => {}));
    const priv = await captureDevicePerception({
      org_entity_id: ORG, caller_entity_id: CALLER, source_type: "LENS_CONTEXT", text: "overheard a plan",
      consent: { user_initiated: true, capture_visible_to_user: true, bystander_sensitive: true },
      visibility: { scope: "private" }, context_hint: { related_person_name: "A Bystander", related_project: "Launch" },
    });
    expect(priv.ok).toBe(true);
    if (priv.ok) expect(priv.disposition).toBe("STORED_PRIVATE_DOWNGRADED");
    const data = prismaMock.workLedgerEntry.create.mock.calls[0]![0].data as Record<string, any>;
    // The named bystander is dropped; the non-identifying project hint stays.
    expect(data.details.context_hint?.related_person_name).toBeUndefined();
    expect(data.details.context_hint?.related_project).toBe("Launch");
    expect(JSON.stringify(data.details)).not.toContain("A Bystander");
  });

  it("captures deterministically even when Python is unavailable (no fake enrichment)", async () => {
    extractMock.mockResolvedValue({ status: "PYTHON_NOT_CONFIGURED", summary: null, candidates: [] });
    const r = await captureDevicePerception({ org_entity_id: ORG, caller_entity_id: CALLER, source_type: "AMBIENT_DEVICE_PACKET", text: "ship it Friday", consent: goodConsent });
    expect(r.ok).toBe(true); // deterministic capture is primary; Python state does not block it
    const data = prismaMock.workLedgerEntry.create.mock.calls[0]![0].data as Record<string, any>;
    expect(data.details.meeting_intelligence.status).toBe("PENDING"); // honest pending at create time
    expect(data.extraction_source).toBe("TYPESCRIPT_DETERMINISTIC");
  });
});

describe("enrichMeetingIntelligenceAsync — validated, separate, non-destructive", () => {
  it("stores a FOUNDATION_VALIDATED meeting envelope; preserves base details; no duplicate; no extraction change", async () => {
    extractMock.mockResolvedValue(meeting());
    prismaMock.workLedgerEntry.findFirst.mockResolvedValue({
      details: { ambient_source_type: "MEETING_TRANSCRIPT", meeting_intelligence: { status: "PENDING" } },
    });
    await enrichMeetingIntelligenceAsync({ ledger_entry_id: "led-cap", org_entity_id: ORG, transcript: "...", source_type: "MEETING_TRANSCRIPT" });
    const upd = prismaMock.workLedgerEntry.update.mock.calls[0]![0];
    expect(upd.data.details.meeting_intelligence.status).toBe("PYTHON_ENRICHED");
    expect(upd.data.details.meeting_intelligence.authority).toBe("FOUNDATION_VALIDATED");
    expect(upd.data.details.meeting_intelligence.capability).toBe("MEETING_INTELLIGENCE");
    // base details preserved; deterministic truth untouched (no extraction_source in update)
    expect(upd.data.details.ambient_source_type).toBe("MEETING_TRANSCRIPT");
    expect(upd.data.extraction_source).toBeUndefined();
    expect(prismaMock.workLedgerEntry.create).not.toHaveBeenCalled(); // no duplicate artifact
  });

  it("downgrades to needs-review when all candidates are low-confidence", async () => {
    extractMock.mockResolvedValue(meeting({ candidates: [{ candidate_type: "FOLLOW_UP", text: "maybe circle back", confidence: "LOW", evidence_phrase: "circle back" }] }));
    prismaMock.workLedgerEntry.findFirst.mockResolvedValue({ details: {} });
    await enrichMeetingIntelligenceAsync({ ledger_entry_id: "led-cap", org_entity_id: ORG, transcript: "..." });
    expect(prismaMock.workLedgerEntry.update.mock.calls[0]![0].data.details.meeting_intelligence.status).toBe("FOUNDATION_DOWNGRADED");
  });

  it("honest status when Python is unavailable (NOT_CONFIGURED) — no fake intelligence", async () => {
    extractMock.mockResolvedValue({ status: "PYTHON_NOT_CONFIGURED", summary: null, candidates: [] });
    prismaMock.workLedgerEntry.findFirst.mockResolvedValue({ details: {} });
    await enrichMeetingIntelligenceAsync({ ledger_entry_id: "led-cap", org_entity_id: ORG, transcript: "..." });
    const env = prismaMock.workLedgerEntry.update.mock.calls[0]![0].data.details.meeting_intelligence;
    expect(env.status).toBe("NOT_CONFIGURED");
    expect(env.authority).toBe(null);
    expect(env.candidates).toEqual([]);
  });

  it("marks ERROR and never throws when the Python call throws", async () => {
    extractMock.mockRejectedValue(new Error("boom"));
    prismaMock.workLedgerEntry.findFirst.mockResolvedValue({ details: {} });
    await expect(
      enrichMeetingIntelligenceAsync({ ledger_entry_id: "led-cap", org_entity_id: ORG, transcript: "..." }),
    ).resolves.toBeUndefined();
    expect(prismaMock.workLedgerEntry.update.mock.calls[0]![0].data.details.meeting_intelligence.status).toBe("ERROR");
  });

  it("no-ops safely when the capture row is gone (deleted/cross-tenant)", async () => {
    extractMock.mockResolvedValue(meeting());
    prismaMock.workLedgerEntry.findFirst.mockResolvedValue(null);
    await enrichMeetingIntelligenceAsync({ ledger_entry_id: "gone", org_entity_id: ORG, transcript: "..." });
    expect(prismaMock.workLedgerEntry.update).not.toHaveBeenCalled();
  });
});
