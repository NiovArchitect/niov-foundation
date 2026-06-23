// FILE: otzar-comms-extract.test.ts (unit)
// PURPOSE: Phase 1213 [OTZAR-AMBIENT-COMMS] -- pure-function tests
//          for the Comms extraction service. The integration probe
//          (which exercises the full route + auth + DB roster) is
//          driven live; this file pins the extractor logic +
//          recipient-resolution + privacy invariants.
// CONNECTS TO: apps/api/src/services/otzar/comms-extract.service.ts.

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { LLMProvider, LLMResult } from "@niov/api";

// Mock the buildIdentityContext that the extract service depends on
// so this test runs purely in-process (no DB).
const mockedIdentity = vi.hoisted(() => ({
  buildIdentityContext: vi.fn(),
}));
vi.mock(
  "../../apps/api/src/services/otzar/identity-context.js",
  () => mockedIdentity,
);

import { extractFromCapturedText } from "../../apps/api/src/services/otzar/comms-extract.service.js";

interface RosterPeer {
  entity_id: string;
  display_name: string;
  email: string | null;
}

function setRoster(roster: RosterPeer[]): void {
  mockedIdentity.buildIdentityContext.mockResolvedValue({
    viewer: {
      user_id: "u",
      email: null,
      display_name: "Tester",
      title: "MEMBER",
      org_role: "MEMBER",
      is_founder_admin: false,
    },
    org: { org_id: "o", name: "NIOV Labs", domain: null },
    twin: { twin_id: null, display_name: null, active: false },
    projects: [],
    authority: {
      can_admin_org: false,
      can_read_capsules: true,
      can_write_capsules: true,
      can_share_capsules: false,
      can_access_external_api: false,
      external_write_policy: "APPROVAL_REQUIRED",
    },
    context_signals: {
      memory_capsules_count: 0,
      transcript_summaries_count: 0,
      collaboration_inbound_count: 0,
      collaboration_outbound_count: 0,
    },
    org_roster: roster,
    safety: {
      no_external_write_without_approval: true,
      no_private_data_to_unauthorized_users: true,
      no_raw_audio_storage: true,
      no_raw_transcript_default: true,
    },
  });
}

const NIOV_ROSTER: RosterPeer[] = [
  {
    entity_id: "id-david",
    display_name: "David Odie",
    email: "david@niovlabs.com",
  },
  {
    entity_id: "id-samiksha",
    display_name: "Samiksha Sharma",
    email: "samiksha@niovlabs.com",
  },
  { entity_id: "id-annie", display_name: "Annie", email: "annie@niovlabs.com" },
  {
    entity_id: "id-vishesh",
    display_name: "Vishesh Sharma",
    email: "vishesh@niovlabs.com",
  },
];

// Canonical Founder-provided demo fixture.
const DEMO_FIXTURE =
  `Title: Launch Follow-Up Meeting\n\n` +
  `Sadeil, David, Samiksha, and Annie met to discuss the Otzar launch flow.\n` +
  `Sadeil asked David to review the UI flow by Friday.\n` +
  `Samiksha agreed to review the AI/NLP trial notes and summarize any concerns.\n` +
  `Annie said she can complete a compliance review this week if the summary is ready.\n` +
  `Decision: Keep internal note workflows inside Otzar notifications only for now.\n` +
  `Decision: Do not enable Slack or email sending until explicit connector approval is finished.\n` +
  `Sadeil said Otzar should create follow-up notes for David, Samiksha, and Annie.`;

beforeEach(() => {
  vi.clearAllMocks();
  setRoster(NIOV_ROSTER);
});

describe("extractFromCapturedText — DEMO_SCRIPTED canonical fixture", () => {
  it("returns the Founder-provided expected output for the demo fixture", async () => {
    const out = await extractFromCapturedText(
      { viewerEntityId: "v", captured_text: DEMO_FIXTURE },
      null,
    );
    expect(out.extraction_mode).toBe("DEMO_SCRIPTED");
    expect(out.summary).toMatch(/Otzar launch follow-up/i);
    expect(out.decisions).toHaveLength(2);
    expect(out.decisions[0]).toMatch(/Otzar notifications only/i);
    expect(out.decisions[1]).toMatch(/connector approval/i);
    expect(out.commitments).toHaveLength(3);
    expect(out.commitments[0]).toMatch(/David.*UI flow.*Friday/i);
    expect(out.commitments[1]).toMatch(/Samiksha.*AI\/NLP/i);
    expect(out.commitments[2]).toMatch(/Annie.*compliance/i);
    expect(out.suggested_actions).toHaveLength(3);
  });

  it("resolves David / Samiksha / Annie against the roster (NOT David-only)", async () => {
    const out = await extractFromCapturedText(
      { viewerEntityId: "v", captured_text: DEMO_FIXTURE },
      null,
    );
    const byName = new Map(out.suggested_actions.map((s) => [s.target.display_name, s]));
    expect(byName.get("David Odie")?.target.entity_id).toBe("id-david");
    expect(byName.get("Samiksha Sharma")?.target.entity_id).toBe("id-samiksha");
    expect(byName.get("Annie")?.target.entity_id).toBe("id-annie");
    for (const s of out.suggested_actions) {
      expect(s.resolution_status).toBe("RESOLVED");
      expect(s.confidence).toBe("HIGH");
      expect(s.action_type).toBe("SEND_INTERNAL_NOTIFICATION");
    }
  });

  it("marks recipients UNRESOLVED when the roster is empty (no hallucination)", async () => {
    setRoster([]);
    const out = await extractFromCapturedText(
      { viewerEntityId: "v", captured_text: DEMO_FIXTURE },
      null,
    );
    expect(out.suggested_actions).toHaveLength(3);
    for (const s of out.suggested_actions) {
      expect(s.target.entity_id).toBeNull();
      expect(s.target.email).toBeNull();
      expect(s.resolution_status).toBe("UNRESOLVED");
    }
  });
});

describe("extractFromCapturedText — LOCAL_FALLBACK + force_mode", () => {
  it("falls back to LOCAL_FALLBACK when neither demo fixture nor LLM matches", async () => {
    const out = await extractFromCapturedText(
      {
        viewerEntityId: "v",
        captured_text: "Sadeil and Vishesh chatted about the weather.",
      },
      null,
    );
    expect(out.extraction_mode).toBe("LOCAL_FALLBACK");
    expect(out.suggested_actions).toHaveLength(0);
    expect(out.summary).toMatch(/Otzar captured this conversation/i);
  });

  it("force_mode LOCAL_FALLBACK overrides even the demo fixture", async () => {
    const out = await extractFromCapturedText(
      {
        viewerEntityId: "v",
        captured_text: DEMO_FIXTURE,
        force_mode: "LOCAL_FALLBACK",
      },
      null,
    );
    expect(out.extraction_mode).toBe("LOCAL_FALLBACK");
    expect(out.suggested_actions).toHaveLength(0);
  });

  it("force_mode DEMO_SCRIPTED works on arbitrary input", async () => {
    const out = await extractFromCapturedText(
      {
        viewerEntityId: "v",
        captured_text: "anything",
        force_mode: "DEMO_SCRIPTED",
      },
      null,
    );
    expect(out.extraction_mode).toBe("DEMO_SCRIPTED");
    expect(out.suggested_actions).toHaveLength(3);
  });
});

// [OTZAR-V1-LIVE-1A-FOUNDATION] Demo intake must never silently mask the real
// LLM path in staging/production. These cases drive the env gate at the
// extraction chokepoint by temporarily simulating a non-demo deployment
// (NODE_ENV="staging" avoids the production-only boot/crypto branches). The
// surrounding suite runs under NODE_ENV=test, where demo stays allowed, so the
// existing fixture tests above are unaffected.
describe("extractFromCapturedText — demo-mode environment gate (LIVE-1A)", () => {
  const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
  const ORIGINAL_ALLOW = process.env.ALLOW_DEMO_MODE;
  afterEach(() => {
    if (ORIGINAL_NODE_ENV === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = ORIGINAL_NODE_ENV;
    if (ORIGINAL_ALLOW === undefined) delete process.env.ALLOW_DEMO_MODE;
    else process.env.ALLOW_DEMO_MODE = ORIGINAL_ALLOW;
  });

  it("does NOT auto-run scripted demo in a non-demo env (canonical fixture -> LOCAL_FALLBACK, not DEMO_SCRIPTED)", async () => {
    process.env.NODE_ENV = "staging";
    delete process.env.ALLOW_DEMO_MODE;
    const out = await extractFromCapturedText(
      { viewerEntityId: "v", captured_text: DEMO_FIXTURE },
      null,
    );
    expect(out.extraction_mode).not.toBe("DEMO_SCRIPTED");
    expect(out.extraction_mode).toBe("LOCAL_FALLBACK");
  });

  it("does NOT run an explicit force_mode DEMO_SCRIPTED in a non-demo env", async () => {
    process.env.NODE_ENV = "staging";
    delete process.env.ALLOW_DEMO_MODE;
    const out = await extractFromCapturedText(
      { viewerEntityId: "v", captured_text: "anything", force_mode: "DEMO_SCRIPTED" },
      null,
    );
    expect(out.extraction_mode).not.toBe("DEMO_SCRIPTED");
  });

  it("ALLOW_DEMO_MODE=true re-enables demo even under a non-demo NODE_ENV", async () => {
    process.env.NODE_ENV = "staging";
    process.env.ALLOW_DEMO_MODE = "true";
    const out = await extractFromCapturedText(
      { viewerEntityId: "v", captured_text: DEMO_FIXTURE },
      null,
    );
    expect(out.extraction_mode).toBe("DEMO_SCRIPTED");
  });
});

describe("extractFromCapturedText — LLM mode", () => {
  function makeLLM(text: string): LLMProvider {
    return {
      generateResponse: vi.fn().mockResolvedValue({ ok: true, text } as LLMResult),
    } as unknown as LLMProvider;
  }

  it("parses a well-formed LLM JSON response + resolves recipients via roster", async () => {
    const llmJson = JSON.stringify({
      summary: "Quick sync.",
      decisions: ["Decision A"],
      commitments: ["David to ping ops"],
      risks_or_blockers: [],
      suggested_actions: [
        {
          target_display_name: "David Odie",
          target_email: "david@niovlabs.com",
          draft_text: "Hey David — ping ops please.",
          source_excerpt: "David to ping ops",
          confidence: "HIGH",
        },
      ],
    });
    const out = await extractFromCapturedText(
      {
        viewerEntityId: "v",
        captured_text: "Sadeil and David did a quick sync.",
      },
      makeLLM(llmJson),
    );
    expect(out.extraction_mode).toBe("LLM");
    expect(out.suggested_actions).toHaveLength(1);
    expect(out.suggested_actions[0]?.target.entity_id).toBe("id-david");
    expect(out.suggested_actions[0]?.resolution_status).toBe("RESOLVED");
  });

  it("strips fenced ```json wrappers from LLM output", async () => {
    const llmJson =
      "```json\n" +
      JSON.stringify({
        summary: "x",
        decisions: [],
        commitments: [],
        risks_or_blockers: [],
        suggested_actions: [],
      }) +
      "\n```";
    const out = await extractFromCapturedText(
      {
        viewerEntityId: "v",
        captured_text: "Sadeil and Vishesh talked briefly.",
      },
      makeLLM(llmJson),
    );
    expect(out.extraction_mode).toBe("LLM");
  });

  it("falls back to LOCAL_FALLBACK when LLM emits malformed JSON", async () => {
    const out = await extractFromCapturedText(
      {
        viewerEntityId: "v",
        captured_text: "Sadeil and Vishesh chatted about something.",
      },
      makeLLM("not json"),
    );
    expect(out.extraction_mode).toBe("LOCAL_FALLBACK");
  });

  it("does NOT invent recipients not in the roster", async () => {
    const llmJson = JSON.stringify({
      summary: "Quick sync.",
      decisions: [],
      commitments: [],
      risks_or_blockers: [],
      suggested_actions: [
        {
          target_display_name: "Stranger Person",
          target_email: "stranger@external.com",
          draft_text: "Hey Stranger — follow up?",
          source_excerpt: null,
          confidence: "MEDIUM",
        },
      ],
    });
    const out = await extractFromCapturedText(
      { viewerEntityId: "v", captured_text: "Sadeil mentioned a stranger." },
      makeLLM(llmJson),
    );
    expect(out.suggested_actions[0]?.target.entity_id).toBeNull();
    expect(out.suggested_actions[0]?.resolution_status).toBe("UNRESOLVED");
  });
});

describe("extractFromCapturedText — privacy invariants (RULE 0)", () => {
  it("never carries TAR / wallet / clearance in the serialized output", async () => {
    const out = await extractFromCapturedText(
      { viewerEntityId: "v", captured_text: DEMO_FIXTURE },
      null,
    );
    const json = JSON.stringify(out);
    expect(json).not.toMatch(/tar_hash/i);
    expect(json).not.toMatch(/wallet_id/i);
    expect(json).not.toMatch(/clearance/i);
    expect(json).not.toMatch(/permission_id/i);
    expect(json).not.toMatch(/embedding/i);
  });

  it("suggested_actions never surface anything outside the closed-vocab fields", async () => {
    const out = await extractFromCapturedText(
      { viewerEntityId: "v", captured_text: DEMO_FIXTURE },
      null,
    );
    for (const s of out.suggested_actions) {
      expect(Object.keys(s).sort()).toEqual(
        [
          "local_id",
          "action_type",
          "target",
          "draft_text",
          "reason",
          "source_excerpt",
          "confidence",
          "resolution_status",
        ].sort(),
      );
      expect(Object.keys(s.target).sort()).toEqual(
        ["display_name", "email", "entity_id"].sort(),
      );
    }
  });
});
