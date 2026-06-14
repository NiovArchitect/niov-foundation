// FILE: execution-verification.test.ts (unit)
// PURPOSE: Phase 1282 — lock the closed-vocab validation of the Execution
//          Verification service. Enum drift is rejected BEFORE any DB write,
//          so these run at the unit tier without a database. Happy-path
//          persistence + tenant-scoped listing are exercised live against
//          the demo DB in the phase verification.
// CONNECTS TO: apps/api/src/services/work-os/execution-verification.service.ts

import { describe, expect, it } from "vitest";
import {
  createExecutionAttempt,
  recordExecutionAttempt,
  ATTEMPT_TYPES,
  ATTEMPT_RUNTIMES,
  ATTEMPT_EVIDENCE_TYPES,
  ATTEMPT_STATUSES,
} from "../../apps/api/src/services/work-os/execution-verification.service.js";

const BASE = {
  ledger_entry_id: "00000000-0000-0000-0000-000000000001",
  org_entity_id: "00000000-0000-0000-0000-000000000002",
  attempt_type: "WORK_LEDGER_CREATE",
  runtime: "TYPESCRIPT",
  evidence_type: "INTERNAL_RECORD",
  status: "VERIFIED",
};

describe("createExecutionAttempt closed-vocab validation", () => {
  it("rejects an unknown attempt_type before any DB write", async () => {
    const r = await createExecutionAttempt({ ...BASE, attempt_type: "ROGUE" });
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.message).toContain("attempt_type");
  });

  it("rejects an unknown runtime", async () => {
    const r = await createExecutionAttempt({ ...BASE, runtime: "RUST" });
    expect(r.ok).toBe(false);
  });

  it("rejects an unknown evidence_type", async () => {
    const r = await createExecutionAttempt({ ...BASE, evidence_type: "GUESS" });
    expect(r.ok).toBe(false);
  });

  it("rejects an unknown status", async () => {
    const r = await createExecutionAttempt({ ...BASE, status: "DONE" });
    expect(r.ok).toBe(false);
  });

  it("recordExecutionAttempt returns null for an invalid attempt (never throws)", async () => {
    const r = await recordExecutionAttempt({ ...BASE, status: "DONE" });
    expect(r).toBeNull();
  });
});

describe("closed-vocab constants are stable", () => {
  it("expose the expected vocabularies", () => {
    expect(ATTEMPT_TYPES).toContain("BEAM_FANOUT");
    expect(ATTEMPT_TYPES).toContain("PYTHON_ENRICHMENT");
    expect(ATTEMPT_RUNTIMES).toContain("PYTHON");
    expect(ATTEMPT_EVIDENCE_TYPES).toContain("PROVIDER_RESPONSE");
    expect(ATTEMPT_STATUSES).toContain("VERIFIED");
  });
});
