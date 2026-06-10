// FILE: otzar-proposed-action-extractor.test.ts (unit)
// PURPOSE: Pure-function coverage for the Phase 1208 chat -> proposed
//          action extractor. Locks the canonical Phase 1207 draft
//          shape detection, the roster resolution strategy, the
//          tolerant null-return path for non-draft responses, and the
//          privacy invariant that no new private data is synthesized.
// CONNECTS TO: apps/api/src/services/otzar/proposed-action-extractor.ts.

import { describe, expect, it } from "vitest";
import { extractProposedAction, type OrgRosterPeer } from "@niov/api";

const NIOV_ROSTER: ReadonlyArray<OrgRosterPeer> = [
  { entity_id: "id-david", display_name: "David Odie", email: "david@niovlabs.com" },
  { entity_id: "id-vishesh", display_name: "Vishesh Sharma", email: "vishesh@niovlabs.com" },
  { entity_id: "id-samiksha", display_name: "Samiksha Sharma", email: "samiksha@niovlabs.com" },
  { entity_id: "id-annie", display_name: "Annie", email: "annie@niovlabs.com" },
  { entity_id: "id-walter", display_name: "Walter Carter", email: "walter@niovlabs.com" },
];

// The exact response shape the live Phase 1207 LLM is producing
// (captured from the verified live probe 2026-06-10).
const CANONICAL_LIVE_RESPONSE =
  `I found **David Odie** (Tech Lead, david@niovlabs.com) — your most-collaborated team member with 3 shared projects. I drafted a direct internal note. I will not send it until you approve.\n\n**Draft:**\n"Hey David — heads up, time to get back to it. Let me know if you need anything to unblock you."\n\nSend this to David Odie?`;

describe("extractProposedAction -- canonical Phase 1207 live shape", () => {
  it("returns a structured envelope matching the exact live LLM output", () => {
    const out = extractProposedAction(CANONICAL_LIVE_RESPONSE, NIOV_ROSTER);
    expect(out).not.toBeNull();
    expect(out?.action_type).toBe("SEND_INTERNAL_NOTIFICATION");
    expect(out?.target.display_name).toBe("David Odie");
    expect(out?.target.email).toBe("david@niovlabs.com");
    expect(out?.target.entity_id).toBe("id-david");
    expect(out?.draft_text).toContain("Hey David");
    expect(out?.draft_text).toContain("get back to it");
    expect(out?.reason).toContain("Otzar drafted");
  });

  it("resolves a first-name reference to the full roster entry", () => {
    const resp =
      `I found Annie (Risk & Compliance Lead) in your org. I drafted a direct internal note. I will not send it until you approve.\n\nDraft:\n"Hey Annie, do you have any bandwidth this week for a compliance review?"\n\nSend this to Annie?`;
    const out = extractProposedAction(resp, NIOV_ROSTER);
    expect(out?.target.display_name).toBe("Annie");
    expect(out?.target.email).toBe("annie@niovlabs.com");
    expect(out?.target.entity_id).toBe("id-annie");
  });

  it("handles straight single-quoted drafts (alternate quoting)", () => {
    const resp =
      `I found Vishesh Sharma. I drafted a direct internal note.\n\nDraft: 'Hey Vishesh, ping when free.'\n\nSend this to Vishesh Sharma?`;
    const out = extractProposedAction(resp, NIOV_ROSTER);
    expect(out?.target.display_name).toBe("Vishesh Sharma");
    expect(out?.draft_text).toBe("Hey Vishesh, ping when free.");
  });

  it("handles curly-quoted drafts (alternate quoting)", () => {
    const resp =
      `I found Walter Carter. I drafted a direct internal note.\n\nDraft: “Hey Walter, follow up please.”\n\nSend this to Walter Carter?`;
    const out = extractProposedAction(resp, NIOV_ROSTER);
    expect(out?.draft_text).toBe("Hey Walter, follow up please.");
  });
});

describe("extractProposedAction -- returns null on non-draft responses", () => {
  it("returns null when the LLM answered a question (no Send-this-to anchor)", () => {
    const out = extractProposedAction(
      "You are Sadeil, Founder & CEO of NIOV Labs.",
      NIOV_ROSTER,
    );
    expect(out).toBeNull();
  });

  it("returns null when the LLM asked a clarification question", () => {
    const out = extractProposedAction(
      "I found two Davids in your org. Did you mean David Odie or David Smith?",
      NIOV_ROSTER,
    );
    expect(out).toBeNull();
  });

  it("returns null when the response has no Draft: header even with Send-this-to", () => {
    const out = extractProposedAction(
      "I found David Odie. Send this to David Odie?",
      NIOV_ROSTER,
    );
    expect(out).toBeNull();
  });

  it("returns null when Draft: header exists but no quoted body", () => {
    const out = extractProposedAction(
      `I found David Odie.\n\nDraft: heads up.\n\nSend this to David Odie?`,
      NIOV_ROSTER,
    );
    expect(out).toBeNull();
  });

  it("returns null on empty response", () => {
    expect(extractProposedAction("", NIOV_ROSTER)).toBeNull();
  });
});

describe("extractProposedAction -- recipient resolution strategy", () => {
  it("resolves an exact case-insensitive display_name match", () => {
    const resp = `I found david odie. Draft: "x".\n\nSend this to david odie?`;
    const out = extractProposedAction(resp, NIOV_ROSTER);
    expect(out?.target.entity_id).toBe("id-david");
  });

  it("resolves an email-local extraction inside the I-found line", () => {
    const resp =
      `I found vishesh@niovlabs.com. Draft: "x".\n\nSend this to vishesh@niovlabs.com?`;
    const out = extractProposedAction(resp, NIOV_ROSTER);
    expect(out?.target.entity_id).toBe("id-vishesh");
  });

  it("returns the raw quoted name + null entity_id when no roster match exists", () => {
    const resp = `I found Bob Stranger. Draft: "x".\n\nSend this to Bob Stranger?`;
    const out = extractProposedAction(resp, NIOV_ROSTER);
    expect(out).not.toBeNull();
    expect(out?.target.display_name).toBe("Bob Stranger");
    expect(out?.target.entity_id).toBeNull();
    expect(out?.target.email).toBeNull();
  });

  it("resolves on first-name even when the LLM omitted the surname", () => {
    const resp = `I found David. Draft: "x".\n\nSend this to David?`;
    const out = extractProposedAction(resp, NIOV_ROSTER);
    expect(out?.target.entity_id).toBe("id-david");
    expect(out?.target.display_name).toBe("David Odie");
  });
});

describe("extractProposedAction -- privacy invariants (RULE 0)", () => {
  it("never invents recipient data not in the roster (returns nulls instead)", () => {
    const resp =
      `I found Unknown Person <unknown@external.com>. Draft: "x".\n\nSend this to Unknown Person?`;
    const out = extractProposedAction(resp, NIOV_ROSTER);
    expect(out?.target.entity_id).toBeNull();
    expect(out?.target.email).toBeNull();
  });

  it("never re-emits TAR / wallet / clearance language even when the LLM does", () => {
    // Even if the LLM hallucinated sensitive language, the extractor
    // returns only the closed-vocab envelope fields. The chat text
    // is rendered separately by the UI.
    const resp =
      `I found David Odie (clearance_ceiling=5, tar_hash=abc123). Draft: "x".\n\nSend this to David Odie?`;
    const out = extractProposedAction(resp, NIOV_ROSTER);
    expect(out).not.toBeNull();
    expect(JSON.stringify(out)).not.toMatch(/tar_hash/i);
    expect(JSON.stringify(out)).not.toMatch(/clearance_ceiling/i);
  });

  it("preserves the approval gate -- action_type is the closed-vocab SEND_INTERNAL_NOTIFICATION", () => {
    const out = extractProposedAction(CANONICAL_LIVE_RESPONSE, NIOV_ROSTER);
    // No external-write action types are surfaced by the chat-tier
    // extractor; that boundary is held at this enum.
    expect(out?.action_type).toBe("SEND_INTERNAL_NOTIFICATION");
  });
});

describe("extractProposedAction -- multi-recipient regression guard", () => {
  it("uses the Send-this-to anchor as authoritative when I-found names differ", () => {
    // Adversarial: LLM says "I found David Odie" but ends with
    // "Send this to Vishesh Sharma?" -- the SEND target wins.
    const resp =
      `I found David Odie. Draft: "x".\n\nSend this to Vishesh Sharma?`;
    const out = extractProposedAction(resp, NIOV_ROSTER);
    expect(out?.target.entity_id).toBe("id-vishesh");
  });
});
