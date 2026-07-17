// FILE: twin-work-projection.test.ts
// PURPOSE: [C.3] Safe twin_work projection for Today / My Work — no entity
//          UUIDs, only state + accuracy + optional https doc link.
// CONNECTS TO: work-ledger.service twinWorkFromDetails.

import { describe, expect, it } from "vitest";
import { twinWorkFromDetails } from "../../apps/api/src/services/work-os/work-ledger.service.js";

describe("twinWorkFromDetails", () => {
  it("returns undefined when twin_work is absent", () => {
    expect(twinWorkFromDetails(null)).toBeUndefined();
    expect(twinWorkFromDetails({})).toBeUndefined();
    expect(twinWorkFromDetails({ twin_work: "nope" })).toBeUndefined();
  });

  it("projects CLAIMED_WORKING with accuracy class and https link only", () => {
    const p = twinWorkFromDetails({
      twin_work: {
        twin_entity_id: "00000000-0000-0000-0000-000000000099",
        human_entity_id: "00000000-0000-0000-0000-000000000002",
        state: "CLAIMED_WORKING",
        work_kind: "DOCUMENT",
        accuracy_class: "INSURANCE",
        requires_verification: true,
        claimed_at: "2026-07-16T12:00:00.000Z",
        web_view_link: "https://docs.google.com/document/d/abc/edit",
        document_id: "secret-doc-id",
      },
    });
    expect(p).toEqual({
      state: "CLAIMED_WORKING",
      work_kind: "DOCUMENT",
      accuracy_class: "INSURANCE",
      requires_verification: true,
      claimed_at: "2026-07-16T12:00:00.000Z",
      web_view_link: "https://docs.google.com/document/d/abc/edit",
      clarity_question: null,
    });
    // Entity ids and raw document_id stay off the wire projection.
    expect(JSON.stringify(p)).not.toContain("00000000");
    expect(JSON.stringify(p)).not.toContain("secret-doc-id");
  });

  it("rejects non-https web_view_link", () => {
    const p = twinWorkFromDetails({
      twin_work: {
        state: "CLAIMED_WORKING",
        web_view_link: "http://evil.example/doc",
      },
    });
    expect(p?.web_view_link).toBeNull();
  });

  it("surfaces clarity question for NEEDS_CLARITY", () => {
    const p = twinWorkFromDetails({
      twin_work: {
        state: "NEEDS_CLARITY",
        work_kind: "DOCUMENT",
        clarity_question: "Which coverage year should we use?",
      },
    });
    expect(p?.state).toBe("NEEDS_CLARITY");
    expect(p?.clarity_question).toBe("Which coverage year should we use?");
  });
});
