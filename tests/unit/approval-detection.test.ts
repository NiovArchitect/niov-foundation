// FILE: approval-detection.test.ts (unit)
// PURPOSE: Phase EDX-4 PR 4 — unit coverage for the conservative
//          approval-detection helper that ConductSession uses to
//          flip approval_required + supply closed-vocab reason +
//          duration_options.
// CONNECTS TO:
//   - apps/api/src/services/otzar/approval-detection.ts

import { describe, expect, it } from "vitest";
import { detectApprovalRequirement } from "../../apps/api/src/services/otzar/approval-detection.js";

describe("detectApprovalRequirement — neutral / informational queries", () => {
  it("does not flag an empty message", () => {
    expect(detectApprovalRequirement("")).toEqual({ approval_required: false });
  });

  it("does not flag a plain question", () => {
    expect(detectApprovalRequirement("what should I do today?")).toEqual({
      approval_required: false,
    });
  });

  it("does not flag a status request", () => {
    expect(detectApprovalRequirement("what's on my calendar?")).toEqual({
      approval_required: false,
    });
  });
});

describe("detectApprovalRequirement — EXTERNAL_WRITE", () => {
  it("flags 'send a message' as EXTERNAL_WRITE", () => {
    const r = detectApprovalRequirement("send a follow-up to Sarah");
    expect(r.approval_required).toBe(true);
    if (!r.approval_required) return;
    expect(r.approval_reason).toBe("EXTERNAL_WRITE");
    expect(r.approval_duration_options).toEqual([
      "ONE_TIME",
      "SESSION",
      "SHORT_TERM",
    ]);
  });

  it("flags 'post an update'", () => {
    const r = detectApprovalRequirement("post an update about the launch");
    expect(r.approval_required).toBe(true);
    if (!r.approval_required) return;
    expect(r.approval_reason).toBe("EXTERNAL_WRITE");
  });

  it("flags 'schedule a meeting'", () => {
    const r = detectApprovalRequirement("schedule a meeting for tomorrow");
    expect(r.approval_required).toBe(true);
    if (!r.approval_required) return;
    expect(r.approval_reason).toBe("EXTERNAL_WRITE");
  });

  it("flags 'create ticket' multi-word phrase", () => {
    const r = detectApprovalRequirement("create ticket for the bug");
    expect(r.approval_required).toBe(true);
    if (!r.approval_required) return;
    expect(r.approval_reason).toBe("EXTERNAL_WRITE");
  });
});

describe("detectApprovalRequirement — SENSITIVE_CONTEXT", () => {
  it("flags 'delete the customer record' as SENSITIVE_CONTEXT", () => {
    const r = detectApprovalRequirement("delete the customer record");
    expect(r.approval_required).toBe(true);
    if (!r.approval_required) return;
    expect(r.approval_reason).toBe("SENSITIVE_CONTEXT");
    expect(r.approval_duration_options).toEqual([
      "SENSITIVE_CASE_BY_CASE",
      "ONE_TIME",
    ]);
  });

  it("flags 'cancel the subscription'", () => {
    const r = detectApprovalRequirement("cancel the subscription");
    expect(r.approval_required).toBe(true);
    if (!r.approval_required) return;
    expect(r.approval_reason).toBe("SENSITIVE_CONTEXT");
  });

  it("flags 'approve the request' as SENSITIVE_CONTEXT", () => {
    const r = detectApprovalRequirement("approve the request");
    expect(r.approval_required).toBe(true);
    if (!r.approval_required) return;
    expect(r.approval_reason).toBe("SENSITIVE_CONTEXT");
  });

  it("flags 'revoke access' as SENSITIVE_CONTEXT", () => {
    const r = detectApprovalRequirement("revoke access for the contractor");
    expect(r.approval_required).toBe(true);
    if (!r.approval_required) return;
    expect(r.approval_reason).toBe("SENSITIVE_CONTEXT");
  });
});

describe("detectApprovalRequirement — CONNECTOR_ACCESS", () => {
  it("flags Slack mention", () => {
    const r = detectApprovalRequirement("ping the team on slack");
    expect(r.approval_required).toBe(true);
    if (!r.approval_required) return;
    expect(r.approval_reason).toBe("CONNECTOR_ACCESS");
    expect(r.approval_duration_options).toContain("ONE_TIME");
    expect(r.approval_duration_options).toContain("SENSITIVE_CASE_BY_CASE");
  });

  it("flags Gmail mention", () => {
    const r = detectApprovalRequirement("draft something in gmail");
    expect(r.approval_required).toBe(true);
    if (!r.approval_required) return;
    expect(r.approval_reason).toBe("CONNECTOR_ACCESS");
  });

  it("CONNECTOR_ACCESS wins over EXTERNAL_WRITE (tool name has priority)", () => {
    const r = detectApprovalRequirement("send a slack message to ops");
    expect(r.approval_required).toBe(true);
    if (!r.approval_required) return;
    expect(r.approval_reason).toBe("CONNECTOR_ACCESS");
  });
});

describe("detectApprovalRequirement — CROSS_TEAM_REQUEST", () => {
  it("flags 'loop in legal'", () => {
    const r = detectApprovalRequirement("loop in legal on this contract");
    expect(r.approval_required).toBe(true);
    if (!r.approval_required) return;
    expect(r.approval_reason).toBe("CROSS_TEAM_REQUEST");
    expect(r.approval_duration_options).toContain("PROJECT_SCOPED");
  });

  it("flags 'handoff to engineering'", () => {
    const r = detectApprovalRequirement("handoff to engineering for the rollout");
    expect(r.approval_required).toBe(true);
    if (!r.approval_required) return;
    expect(r.approval_reason).toBe("CROSS_TEAM_REQUEST");
  });
});

describe("detectApprovalRequirement — CROSS_PROJECT_REQUEST", () => {
  it("flags 'another project'", () => {
    const r = detectApprovalRequirement(
      "pull context from another project for me",
    );
    expect(r.approval_required).toBe(true);
    if (!r.approval_required) return;
    expect(r.approval_reason).toBe("CROSS_PROJECT_REQUEST");
    expect(r.approval_duration_options).toContain("PROJECT_SCOPED");
  });
});

describe("detectApprovalRequirement — false-positive safety", () => {
  it("does not match verb fragments inside unrelated words", () => {
    // "share" is a verb but "shareholders" should not match — the word-
    // boundary guard protects single-word verbs.
    const r = detectApprovalRequirement(
      "summarize the shareholders meeting notes",
    );
    expect(r.approval_required).toBe(false);
  });

  it("does not match 'forwardly' (no verb match)", () => {
    const r = detectApprovalRequirement("move forwardly with the plan");
    expect(r.approval_required).toBe(false);
  });
});
