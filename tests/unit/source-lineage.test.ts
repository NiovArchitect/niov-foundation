// FILE: source-lineage.test.ts (unit)
// PURPOSE: [GAP-J] lock the SAFE source-lineage projection. The block that
//          answers "where did this come from?" must carry closed-vocab
//          scalars only — never raw source ids, dedupe keys, URLs, connector
//          identities, or token material — and must never invent an origin
//          for rows whose source was not recorded.
// CONNECTS TO: apps/api/src/services/work-os/work-ledger.service.ts
//              (sourceLineageFromDetails, projectLedger).

import { describe, expect, it } from "vitest";
import { sourceLineageFromDetails } from "../../apps/api/src/services/work-os/work-ledger.service.js";

// The exact shape comms-ingest writes for a Slack-ingested row (the one
// builder: sourceEvidenceDetails).
const SLACK_DETAILS = {
  source: "slack_ingest",
  source_type: "CONNECTOR",
  source_system: "SLACK",
  source_id: "1699900000.123456",
  dedupe_key: "SLACK:T777:C1:1699900000.123456",
  connector_identity: "C1",
  source_actor: "Sadeil Lewis",
  source_timestamp: "2026-07-03T12:00:00.000Z",
};

describe("[GAP-J] sourceLineageFromDetails — safe scalars only", () => {
  it("a Slack-ingested row projects SLACK lineage with provable-but-hidden id", () => {
    const l = sourceLineageFromDetails(SLACK_DETAILS, [{ quote: "ship it Friday" }]);
    expect(l).toEqual({
      source_system: "SLACK",
      source_id_present: true,
      has_source_excerpt: true,
      source_actor: "Sadeil Lewis",
      source_timestamp: "2026-07-03T12:00:00.000Z",
    });
  });

  it("a Zoom-ingested row projects ZOOM lineage", () => {
    const l = sourceLineageFromDetails(
      { source: "zoom_ingest", source_system: "ZOOM", source_id: "zm-1", source_actor: "Zoom recording import" },
      [],
    );
    expect(l?.source_system).toBe("ZOOM");
    expect(l?.source_id_present).toBe(true);
    expect(l?.has_source_excerpt).toBe(false);
  });

  it("a transcript-era row (no provenance block) derives TRANSCRIPT from the recorded ingest tag", () => {
    const l = sourceLineageFromDetails({ source: "transcript_ingest" }, [{ excerpt: "…" }]);
    expect(l?.source_system).toBe("TRANSCRIPT");
    expect(l?.source_id_present).toBe(false);
    expect(l?.has_source_excerpt).toBe(true);
  });

  it("a row with no recorded source projects undefined — lineage is never invented", () => {
    expect(sourceLineageFromDetails({}, [])).toBeUndefined();
    expect(sourceLineageFromDetails(null, [])).toBeUndefined();
    expect(sourceLineageFromDetails({ execution_plan: {} }, null)).toBeUndefined();
    // A non-ingest source tag is not lineage.
    expect(sourceLineageFromDetails({ source: "manual-entry" }, [])).toBeUndefined();
  });

  it("junk / token-shaped source_system never becomes customer copy (shape guard)", () => {
    expect(sourceLineageFromDetails({ source_system: "xoxb-12345-token!!" }, [])).toBeUndefined();
    expect(sourceLineageFromDetails({ source_system: "" }, [])).toBeUndefined();
    expect(sourceLineageFromDetails({ source_system: "https://evil" }, [])).toBeUndefined();
  });

  it("the projection NEVER carries raw ids, dedupe keys, URLs, or connector identity", () => {
    const l = sourceLineageFromDetails(
      { ...SLACK_DETAILS, source_url: "https://slack.com/archives/C1/p1699900000123456" },
      [{ quote: "q" }],
    );
    const raw = JSON.stringify(l);
    expect(raw).not.toContain("1699900000.123456"); // the raw source id
    expect(raw).not.toContain("dedupe");
    expect(raw).not.toContain("slack.com"); // the URL
    expect(raw).not.toContain("C1"); // connector identity
    expect(Object.keys(l!)).toEqual([
      "source_system",
      "source_id_present",
      "has_source_excerpt",
      "source_actor",
      "source_timestamp",
    ]);
  });

  it("excerpt flag honors evidence quotes, evidence excerpts, and details.source_excerpt", () => {
    expect(sourceLineageFromDetails(SLACK_DETAILS, [{ quote: "q" }])?.has_source_excerpt).toBe(true);
    expect(sourceLineageFromDetails(SLACK_DETAILS, [{ excerpt: "e" }])?.has_source_excerpt).toBe(true);
    expect(
      sourceLineageFromDetails({ ...SLACK_DETAILS, source_excerpt: "s" }, [])?.has_source_excerpt,
    ).toBe(true);
    expect(sourceLineageFromDetails(SLACK_DETAILS, [])?.has_source_excerpt).toBe(false);
    expect(sourceLineageFromDetails(SLACK_DETAILS, ["not-an-object"])?.has_source_excerpt).toBe(false);
  });
});
