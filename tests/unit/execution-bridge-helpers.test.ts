// FILE: execution-bridge-helpers.test.ts (unit)
// PURPOSE: Work-OS Slice F — the pure helpers of the execution bridge:
//          the Action→ledger status mapping, the governed Slack text
//          builder (carries the [Otzar · governed] marker), the
//          per-connector invocation_payload builder (Slack + MCP, and
//          null for unsupported/misconfigured), and the execution-plan
//          reader. DB-free; the DB-backed promote/reconcile flow is in
//          tests/integration/workos-writeback.test.ts.
// CONNECTS TO:
//   - apps/api/src/services/work-os/execution-bridge.ts
import { describe, expect, it } from "vitest";
import {
  mapActionStatusToLedgerStatus,
  buildGovernedSlackText,
  buildInvocationPayload,
  readExecutionPlan,
} from "../../apps/api/src/services/work-os/execution-bridge.js";
import type { WorkLedgerView } from "../../apps/api/src/services/work-os/work-ledger.service.js";

function entry(overrides: Partial<WorkLedgerView> = {}): WorkLedgerView {
  return {
    ledger_entry_id: "00000000-0000-4000-8000-0000000000aa",
    org_entity_id: "org", ledger_type: "COMMITMENT", source_type: "MANUAL",
    source_command: null, conversation_id: null, work_plan_id: null, project_id: null,
    requester_entity_id: "u1", owner_entity_id: "u1", target_entity_id: null,
    title: "Post the launch update", summary: "let the team know we shipped",
    priority: "NORMAL", status: "READY_TO_EXECUTE", authority_decision: null,
    policy_reason_code: null, extraction_source: "MANUAL", confidence_score: null,
    evidence: null, next_action: null, due_at: null, created_at: "", updated_at: "",
    verified_at: null,
    ...overrides,
  };
}

describe("mapActionStatusToLedgerStatus", () => {
  it("maps the lifecycle onto ledger execution states", () => {
    expect(mapActionStatusToLedgerStatus("PROPOSED")).toBe("NEEDS_APPROVAL");
    expect(mapActionStatusToLedgerStatus("APPROVED")).toBe("EXECUTING");
    expect(mapActionStatusToLedgerStatus("SCHEDULED")).toBe("EXECUTING");
    expect(mapActionStatusToLedgerStatus("RUNNING")).toBe("EXECUTING");
    expect(mapActionStatusToLedgerStatus("SUCCEEDED")).toBe("EXECUTED");
    expect(mapActionStatusToLedgerStatus("FAILED")).toBe("BLOCKED");
    expect(mapActionStatusToLedgerStatus("TIMED_OUT")).toBe("BLOCKED");
    expect(mapActionStatusToLedgerStatus("EXPIRED")).toBe("BLOCKED");
    expect(mapActionStatusToLedgerStatus("REJECTED")).toBe("CANCELLED");
    expect(mapActionStatusToLedgerStatus("CANCELLED")).toBe("CANCELLED");
  });
});

describe("buildGovernedSlackText", () => {
  it("prefixes the governed marker and includes title + summary", () => {
    const t = buildGovernedSlackText(entry());
    expect(t).toContain("[Otzar · governed write-back]");
    expect(t).toContain("Post the launch update");
    expect(t).toContain("let the team know we shipped");
  });
  it("omits the summary dash when there is no summary", () => {
    const t = buildGovernedSlackText(entry({ summary: null }));
    expect(t).toContain("[Otzar · governed write-back] Post the launch update");
    expect(t).not.toContain(" — ");
  });
});

describe("buildInvocationPayload", () => {
  it("builds a chat.postMessage payload for SLACK_WRITE with unfurl defaults false", () => {
    const p = buildInvocationPayload("SLACK_WRITE", entry(), { default_channel: "C123" });
    expect(p).not.toBeNull();
    expect(p?.operation).toBe("chat.postMessage");
    expect(p?.channel).toBe("C123");
    expect(p?.unfurl_links).toBe(false);
    expect(p?.unfurl_media).toBe(false);
    expect(String(p?.text)).toContain("[Otzar · governed write-back]");
  });
  it("returns null for SLACK_WRITE when default_channel is missing (setup incomplete)", () => {
    expect(buildInvocationPayload("SLACK_WRITE", entry(), {})).toBeNull();
  });
  it("builds an arguments payload for MCP_INVOKE", () => {
    const p = buildInvocationPayload("MCP_INVOKE", entry(), { server_url: "https://x", tool_name: "t" });
    expect(p).not.toBeNull();
    const args = p?.arguments as Record<string, unknown>;
    expect(args["work_title"]).toBe("Post the launch update");
  });
  it("returns null for an unsupported connector type", () => {
    expect(buildInvocationPayload("GITHUB_WRITE", entry(), {})).toBeNull();
  });
});

describe("readExecutionPlan", () => {
  it("reads the camelCase plan off the projected execution_plan", () => {
    const plan = readExecutionPlan(entry({
      execution_plan: { requiredConnector: "SLACK", executionMode: "otzar_can_execute_with_approval", executionType: "message" },
    }));
    expect(plan).not.toBeNull();
    expect(plan?.requiredConnector).toBe("SLACK");
    expect(plan?.executionMode).toBe("otzar_can_execute_with_approval");
  });
  it("returns null when there is no execution plan", () => {
    expect(readExecutionPlan(entry())).toBeNull();
  });
});
