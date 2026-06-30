// FILE: execution-planner.test.ts (unit, no DB)
// PURPOSE: Phase 4 — every commitment becomes a TYPED executable plan, not an
//          internal note. Classification is deterministic; the strongest live mode
//          is otzar_can_execute_with_approval (no auto-send); a missing/unauthorized
//          tool surfaces as connector_required/permission_required, never dropped.
// CONNECTS TO: services/otzar/execution-planner.ts, connector-capability.ts.

import { describe, expect, it } from "vitest";
import { classifyExecutionType, connectorForExecutionType, planExecution } from "@niov/api";
import type { ExecutionType, ExecutionMode } from "@niov/api";

describe("Phase 4 — commitment → typed execution plan", () => {
  const cases: Array<[string, ExecutionType]> = [
    ["David will grant Pratham write access to the Otsar WebA repo", "repo_access"],
    ["Update Annie's ticket with the escalation matrix and notification visualization", "ticket_update"],
    ["Write a detailed design document for the auth flow", "document_generation"],
    ["Schedule a meeting with the design team for Friday", "calendar_event"],
    ["Send Annie the Slack links to the tickets", "message"],
    ["Research the ETL accuracy and validate the data quality", "research_or_data_validation"],
    ["Implement proactive agent tool access for the demo", "human_task"],
    ["Annie will build the agent communication layer and multi-turn conversations", "human_task"],
  ];
  for (const [text, expected] of cases) {
    it(`classifies "${text.slice(0, 38)}…" -> ${expected}`, () => {
      expect(classifyExecutionType(text)).toBe(expected);
    });
  }

  it("repo access maps to the GitHub connector + write op", () => {
    const { connector, operation } = connectorForExecutionType("repo_access");
    expect(connector).toBe("GITHUB");
    expect(operation).toBe("write_request");
  });

  it("Slack message work needs the Slack connector", () => {
    const p = planExecution({ title: "Send Annie the Slack links", capabilityState: "not_connected" });
    expect(p.executionType).toBe("message");
    expect(p.requiredConnector).toBe("SLACK");
    expect(p.executionMode).toBe("connector_required");
    expect(p.blockerReason).toMatch(/connect/i);
  });

  it("an authorized connector still only executes WITH approval (no auto-send)", () => {
    const p = planExecution({ title: "Update the Jira ticket status", capabilityState: "available_and_authorized" });
    expect(p.executionMode).toBe("otzar_can_execute_with_approval");
    expect(p.approvalRequired).toBe(true);
    expect(p.nextBestAction).toBe("request_approval");
  });

  it("missing/unauthorized tools surface as setup-required, never dropped", () => {
    expect(planExecution({ title: "grant repo access", capabilityState: "connector_missing" }).executionMode).toBe("connector_required");
    expect(planExecution({ title: "grant repo access", capabilityState: "available_needs_user_auth" }).executionMode).toBe("permission_required");
    expect(planExecution({ title: "grant repo access", capabilityState: "available_needs_admin_auth" }).executionMode).toBe("permission_required");
    expect(planExecution({ title: "update the ticket", capabilityState: "policy_blocked" }).executionMode).toBe("blocked");
  });

  it("research is memory-first (no connector) and Otzar drafts findings", () => {
    const p = planExecution({ title: "Validate the ETL accuracy" });
    expect(p.requiredConnector).toBe("NONE");
    expect(p.executionMode).toBe("otzar_can_draft");
    expect(p.nextBestAction).toBe("research");
  });

  it("a generic engineering task is human_must_do (not flattened to a note)", () => {
    const p = planExecution({ title: "Implement proactive agent tool access" });
    expect(p.executionType).toBe("human_task");
    expect(p.executionMode).toBe("human_must_do");
  });

  it("NO execution mode is a bare auto-execute for external work", () => {
    const externalTypes: ExecutionType[] = ["message", "calendar_event", "ticket_update", "document_generation", "repo_access", "admin_permission_change"];
    for (const t of externalTypes) {
      const p = planExecution({ title: "x", forceType: t, capabilityState: "available_and_authorized" });
      const forbidden: ExecutionMode[] = ["otzar_can_execute_when_policy_allows"];
      expect(forbidden).not.toContain(p.executionMode); // external never auto-executes w/o approval
      expect(p.approvalRequired).toBe(true);
    }
  });
});
