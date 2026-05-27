// FILE: otzar-conversation-detail.test.ts (unit)
// PURPOSE: Pure-function coverage for the ADR-0054 Wave 2B conversation
//          look-back projection (projectConversationDetail). No DB, no LLM,
//          no network -- exercises detail_availability mapping, summary/
//          topics derivation, the always-false transparency_available, the
//          honest continuity_note, and the invariant that no transcript /
//          storage_location / content_hash / raw internals appear in output.
// CONNECTS TO: apps/api/src/services/otzar/conversation-detail.ts.

import { describe, expect, it } from "vitest";
import { projectConversationDetail } from "@niov/api";

function baseConversation(status: string) {
  return {
    conversation_id: "conv-1",
    twin_id: "twin-1",
    source_type: "CHAT",
    status,
    started_at: new Date("2026-01-01T00:00:00.000Z"),
    closed_at: status === "CLOSED" ? new Date("2026-01-02T00:00:00.000Z") : null,
    message_count: 7,
    summary_capsule_id: null as string | null,
  };
}

describe("projectConversationDetail -- detail_availability mapping", () => {
  it("ACTIVE_NOT_CLOSED when status is not CLOSED (summary null, topics [])", () => {
    const v = projectConversationDetail({
      conversation: baseConversation("ACTIVE"),
      summaryCapsule: null,
    });
    expect(v.detail_availability).toBe("ACTIVE_NOT_CLOSED");
    expect(v.summary).toBeNull();
    expect(v.topics).toEqual([]);
    expect(v.summary_available).toBe(false);
  });

  it("NO_SUMMARY_YET when closed but no linked summary capsule", () => {
    const v = projectConversationDetail({
      conversation: { ...baseConversation("CLOSED"), summary_capsule_id: null },
      summaryCapsule: null,
    });
    expect(v.detail_availability).toBe("NO_SUMMARY_YET");
    expect(v.summary).toBeNull();
    expect(v.topics).toEqual([]);
    expect(v.summary_available).toBe(false);
  });

  it("SUMMARY_AVAILABLE when closed + linked summary capsule resolved", () => {
    const v = projectConversationDetail({
      conversation: { ...baseConversation("CLOSED"), summary_capsule_id: "cap-9" },
      summaryCapsule: {
        payload_summary: "Conversation closed; topics: pricing, launch",
        topic_tags: ["pricing", "launch"],
      },
    });
    expect(v.detail_availability).toBe("SUMMARY_AVAILABLE");
    expect(v.summary).toBe("Conversation closed; topics: pricing, launch");
    expect(v.topics).toEqual(["pricing", "launch"]);
    expect(v.summary_available).toBe(true);
    expect(v.summary_capsule_id).toBe("cap-9");
  });
});

describe("projectConversationDetail -- fixed safe fields", () => {
  it("transparency_available is always false; continuity_note is the honest note", () => {
    const v = projectConversationDetail({
      conversation: { ...baseConversation("CLOSED"), summary_capsule_id: "cap-9" },
      summaryCapsule: { payload_summary: "s", topic_tags: ["t"] },
    });
    expect(v.transparency_available).toBe(false);
    expect(v.continuity_note).toMatch(/not retained in Wave 2B/i);
    expect(v.continuity_note).toMatch(/not a transcript/i);
  });

  it("preserves metadata; output exposes ONLY the safe field set (no internals)", () => {
    const v = projectConversationDetail({
      conversation: { ...baseConversation("CLOSED"), summary_capsule_id: "cap-9" },
      summaryCapsule: { payload_summary: "s", topic_tags: ["t"] },
    });
    expect(v.conversation_id).toBe("conv-1");
    expect(v.twin_id).toBe("twin-1");
    expect(v.message_count).toBe(7);
    expect(Object.keys(v).sort()).toEqual([
      "closed_at",
      "continuity_note",
      "conversation_id",
      "detail_availability",
      "message_count",
      "source_type",
      "started_at",
      "status",
      "summary",
      "summary_available",
      "summary_capsule_id",
      "topics",
      "transparency_available",
      "twin_id",
    ]);
    const json = JSON.stringify(v);
    expect(json).not.toContain("storage_location");
    expect(json).not.toContain("content_hash");
    expect(json).not.toContain("context_provenance");
    expect(json).not.toContain("bridge_id");
    expect(json).not.toContain("capability_flags");
    expect(json).not.toContain("embedding");
    expect(json).not.toContain("corrections_count");
    expect(json).not.toContain("access_limited");
    // NOTE: the word "transcript" intentionally appears in continuity_note
    // ("...not a transcript"); the keys-shape assertion above already proves
    // no transcript/message FIELD exists, so we don't blanket-ban the word.
  });
});
