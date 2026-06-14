// FILE: execution-proof-summary.test.ts (unit)
// PURPOSE: Phase 1283 — lock the pure proof-status taxonomy used by both the
//          backend route and the Control Tower View/Why proof section, so
//          the two never drift. No DB (pure function).
// CONNECTS TO: apps/api/src/services/work-os/execution-verification.service.ts

import { describe, expect, it } from "vitest";
import {
  summarizeExecutionProof,
  type ExecutionAttemptView,
} from "../../apps/api/src/services/work-os/execution-verification.service.js";

function att(over: Partial<ExecutionAttemptView>): ExecutionAttemptView {
  return {
    attempt_id: "a",
    ledger_entry_id: "led-1",
    attempt_type: "WORK_LEDGER_CREATE",
    runtime: "TYPESCRIPT",
    evidence_type: "INTERNAL_RECORD",
    status: "VERIFIED",
    detail: {},
    error_code: null,
    created_at: "2026-06-13T00:00:00.000Z",
    verified_at: "2026-06-13T00:00:00.000Z",
    ...over,
  };
}

describe("summarizeExecutionProof", () => {
  it("MISSING when there are no attempts", () => {
    const s = summarizeExecutionProof("led-1", []);
    expect(s.proof_status).toBe("MISSING");
    expect(s.has_verified_ledger_create).toBe(false);
  });

  it("VERIFIED when all three core attempts are verified", () => {
    const s = summarizeExecutionProof("led-1", [
      att({ attempt_type: "WORK_LEDGER_CREATE" }),
      att({ attempt_type: "PYTHON_ENRICHMENT", runtime: "PYTHON", evidence_type: "PROVIDER_RESPONSE" }),
      att({ attempt_type: "BEAM_FANOUT", runtime: "BEAM", evidence_type: "PROVIDER_RESPONSE" }),
    ]);
    expect(s.proof_status).toBe("VERIFIED");
    expect(s.has_verified_python_enrichment).toBe(true);
    expect(s.has_verified_beam_fanout).toBe(true);
    expect(s.failed_attempts_count).toBe(0);
  });

  it("PARTIAL when the core write is verified but a downstream attempt failed", () => {
    const s = summarizeExecutionProof("led-1", [
      att({ attempt_type: "WORK_LEDGER_CREATE" }),
      att({ attempt_type: "BEAM_FANOUT", status: "FAILED", error_code: "http_500", runtime: "BEAM", verified_at: null }),
    ]);
    expect(s.proof_status).toBe("PARTIAL");
    expect(s.failed_attempts_count).toBe(1);
    expect(s.latest_failure_code).toBe("http_500");
  });

  it("FAILED when the core write itself failed", () => {
    const s = summarizeExecutionProof("led-1", [
      att({ attempt_type: "WORK_LEDGER_CREATE", status: "FAILED", error_code: "db_down", verified_at: null }),
    ]);
    expect(s.proof_status).toBe("FAILED");
    expect(s.has_verified_ledger_create).toBe(false);
  });

  it("PARTIAL when only a pending attempt exists", () => {
    const s = summarizeExecutionProof("led-1", [
      att({ attempt_type: "WORK_LEDGER_CREATE", status: "PENDING", verified_at: null }),
    ]);
    expect(s.proof_status).toBe("PARTIAL");
  });
});
