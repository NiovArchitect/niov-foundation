// FILE: tests/unit/source-event.test.ts
// PURPOSE: Slice A — deterministic unit coverage for the normalized Work Signal /
//          Evidence Event abstraction (source-agnostic intake). Proves dedupe
//          keys are stable + idempotent, source evidence is preserved for any
//          source, and the generic content normaliser quarantines noise so
//          low-quality source content cannot mint high-confidence work.
import { describe, expect, it } from "vitest";
import {
  sourceDedupeKey,
  sourceEvidenceDetails,
  normalizeSourceContent,
  slackMessageToSourceEvent,
  type WorkSourceEvent,
} from "../../apps/api/src/services/otzar/source-event.js";

function ev(over: Partial<WorkSourceEvent> = {}): WorkSourceEvent {
  return {
    sourceType: "SLACK",
    sourceSystem: "SLACK",
    sourceId: "1699900000.123456",
    sourceUrl: "https://slack.com/archives/C1/p1699900000123456",
    actor: { name: "David", handle: "@david" },
    participants: [{ name: "David" }, { name: "Pratham" }],
    timestamp: "2026-06-30T12:00:00Z",
    callerEntityId: "caller-1",
    content: "David owns the repo access work and will grant Pratham write access.",
    ...over,
  };
}

describe("source-event — dedupe / idempotency", () => {
  it("derives a stable key from (system, id) when none is explicit", () => {
    expect(sourceDedupeKey(ev())).toBe("SLACK:1699900000.123456");
    // Same event → same key (idempotent).
    expect(sourceDedupeKey(ev())).toBe(sourceDedupeKey(ev()));
  });

  it("honors an explicit dedupe key over the derived one", () => {
    expect(sourceDedupeKey(ev({ dedupeKey: "thread-abc" }))).toBe("thread-abc");
  });

  it("distinguishes different source ids and systems", () => {
    expect(sourceDedupeKey(ev({ sourceId: "A" }))).not.toBe(sourceDedupeKey(ev({ sourceId: "B" })));
    expect(sourceDedupeKey(ev({ sourceSystem: "GMAIL" }))).not.toBe(sourceDedupeKey(ev({ sourceSystem: "SLACK" })));
  });
});

describe("source-event — source evidence preservation (any source)", () => {
  it("attaches full provenance so the ledger row can prove where work came from", () => {
    const d = sourceEvidenceDetails(ev());
    expect(d.source).toBe("slack_ingest");
    expect(d.source_type).toBe("SLACK");
    expect(d.source_system).toBe("SLACK");
    expect(d.source_id).toBe("1699900000.123456");
    expect(d.source_url).toBe("https://slack.com/archives/C1/p1699900000123456");
    expect(d.dedupe_key).toBe("SLACK:1699900000.123456");
    expect(d.source_actor).toBe("David");
    expect(d.source_timestamp).toBe("2026-06-30T12:00:00Z");
  });

  it("carries ingestion run id, connector identity, and sensitivity when present", () => {
    const d = sourceEvidenceDetails(ev({ ingestionRunId: "run-9", connectorIdentity: "binding-7", sensitivity: "confidential" }));
    expect(d.ingestion_run_id).toBe("run-9");
    expect(d.connector_identity).toBe("binding-7");
    expect(d.sensitivity).toBe("confidential");
  });

  it("omits optional provenance fields cleanly when absent", () => {
    const d = sourceEvidenceDetails(ev({ sourceUrl: null, ingestionRunId: null, connectorIdentity: null }));
    expect(d.source_url).toBeUndefined();
    expect(d.ingestion_run_id).toBeUndefined();
    expect(d.connector_identity).toBeUndefined();
  });
});

describe("source-event — generic content normalisation (noise cannot mint work)", () => {
  it("keeps trusted lines and quarantines noisy ones (parity with transcript quarantine)", () => {
    const q = normalizeSourceContent(
      [
        "David owns the repo access work and will grant Pratham write access.",
        "Pratham owns connecting Google sign-in to the WebA app.",
        "you you you you",
        "......",
        "ok ok ok",
      ].join("\n"),
    );
    expect(q.stats.total).toBe(5);
    expect(q.stats.trusted).toBe(2);
    expect(q.stats.quarantined).toBe(3);
    expect(q.trustedText).toMatch(/repo access/);
    expect(q.trustedText).not.toMatch(/you you|ok ok/);
  });

  it("pure-noise content yields no trusted text (cannot become high-confidence work)", () => {
    const q = normalizeSourceContent("....\nyou you you\nok\n???");
    expect(q.stats.trusted).toBe(0);
    expect(q.trustedText).toBe("");
  });

  it("empty content is handled without producing work", () => {
    const q = normalizeSourceContent("");
    expect(q.stats.total).toBe(0);
    expect(q.stats.trusted).toBe(0);
  });
});

describe("source-event — Slack adapter (wire a real source)", () => {
  it("maps a Slack message into a normalized source event", () => {
    const e = slackMessageToSourceEvent(
      {
        ts: "1699900000.123456",
        text: "David owns the repo access work.",
        user: "U0123",
        channel_id: "C1",
        channel_name: "launch",
        permalink: "https://slack.com/archives/C1/p1699900000123456",
        participants: ["David"],
      },
      "caller-1",
    );
    expect(e.sourceSystem).toBe("SLACK");
    expect(e.sourceType).toBe("CONNECTOR");
    expect(e.sourceId).toBe("1699900000.123456");
    expect(e.content).toMatch(/repo access/);
    expect(e.participants).toEqual([{ name: "David" }]);
    expect(e.callerEntityId).toBe("caller-1");
    // Channel-scoped dedupe key so the SAME message never double-ingests.
    expect(e.dedupeKey).toBe("SLACK:C1:1699900000.123456");
    expect(sourceDedupeKey(e)).toBe("SLACK:C1:1699900000.123456");
  });
});
