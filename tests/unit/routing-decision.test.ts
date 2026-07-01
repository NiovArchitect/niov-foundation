// FILE: routing-decision.test.ts (unit, no DB)
// PURPOSE: [PROD-UX-P0R] Prove the routing/autonomy decision PROJECTION is a
//          pure, deterministic, jargon-free read over persisted Work Ledger
//          decider outputs: the full lane matrix (a-j) with first-match-wins
//          precedence (blocked beats ask_approval; identity_review beats
//          setup_required; escalate beats ask_approval), plain-language reasons
//          (no enum literals / underscores / "envelope" / "binding" / "MCP"),
//          and null-safety (a sparse row with no details/plan never crashes).
// CONNECTS TO: services/work-os/routing-decision.ts,
//              services/work-os/work-ledger.service.ts (getMyWork attaches routing),
//              services/otzar/execution-planner.ts (persisted plan vocabulary).

import { describe, expect, it } from "vitest";
import { projectRoutingDecision } from "@niov/api";
import type { RoutingDecisionView, RoutingProjectionInput } from "@niov/api";

// A minimal, honest ledger-entry shape (WorkLedgerView-compatible subset).
function entry(overrides: Partial<RoutingProjectionInput> = {}): RoutingProjectionInput {
  return {
    status: "PROPOSED",
    owner_entity_id: null,
    conversation_id: null,
    authority_decision: null,
    policy_reason_code: null,
    confidence_score: null,
    evidence: [],
    next_action: null,
    ...overrides,
  };
}

// A persisted execution plan (details.execution_plan camelCase shape).
function plan(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    executionType: "message",
    executionMode: "otzar_can_draft",
    requiredConnector: "NONE",
    requiredCapability: null,
    capabilityState: null,
    policyStatus: "allowed",
    approvalRequired: false,
    blockerReason: null,
    nextBestAction: "draft",
    confidence: "medium",
    ...overrides,
  };
}

describe("routing lanes — the full matrix, first match wins", () => {
  // ── a. identity_review ──
  it("a NEEDS_OWNER row routes to identity_review with owner needs_review", () => {
    const r = projectRoutingDecision(entry({ status: "NEEDS_OWNER" }));
    expect(r.lane).toBe("identity_review");
    expect(r.owner_status).toBe("needs_review");
    expect(r.risk).toBe("medium");
  });

  it("a pronoun owner display name routes to identity_review even outside NEEDS_OWNER (P0D)", () => {
    const r = projectRoutingDecision(
      entry({ status: "PROPOSED", owner_entity_id: "e-x", owner_display_name: "his" }),
    );
    expect(r.lane).toBe("identity_review");
    expect(r.owner_status).toBe("needs_review");
  });

  it("PRECEDENCE: identity_review beats setup_required", () => {
    const r = projectRoutingDecision(
      entry({
        status: "NEEDS_OWNER",
        execution_plan: plan({ executionMode: "connector_required", requiredConnector: "SLACK" }),
      }),
    );
    expect(r.lane).toBe("identity_review");
  });

  // ── b. blocked ──
  it("executionMode blocked routes to blocked (reason from blockerReason)", () => {
    const r = projectRoutingDecision(
      entry({
        execution_plan: plan({
          executionMode: "blocked",
          policyStatus: "unknown",
          blockerReason: "Otzar needs one more detail (who / which resource) before acting.",
        }),
      }),
    );
    expect(r.lane).toBe("blocked");
    expect(r.reason).toContain("one more detail");
    expect(r.risk).toBe("medium");
  });

  it("policyStatus blocked routes to blocked with HIGH risk", () => {
    const r = projectRoutingDecision(
      entry({
        execution_plan: plan({ executionMode: "blocked", policyStatus: "blocked", requiredConnector: "SLACK" }),
      }),
    );
    expect(r.lane).toBe("blocked");
    expect(r.risk).toBe("high");
  });

  it("a BLOCKED ledger status routes to blocked even without a plan", () => {
    const r = projectRoutingDecision(entry({ status: "BLOCKED" }));
    expect(r.lane).toBe("blocked");
  });

  it("PRECEDENCE: blocked beats ask_approval", () => {
    const r = projectRoutingDecision(
      entry({
        execution_plan: plan({
          executionMode: "blocked",
          policyStatus: "blocked",
          approvalRequired: true,
        }),
      }),
    );
    expect(r.lane).toBe("blocked");
  });

  // ── c. setup_required ──
  it("connector_required routes to setup_required with the raw required_tool", () => {
    const r = projectRoutingDecision(
      entry({
        execution_plan: plan({
          executionMode: "connector_required",
          requiredConnector: "SLACK",
          capabilityState: "not_connected",
          blockerReason: "Slack isn't connected yet — set it up to proceed.",
        }),
      }),
    );
    expect(r.lane).toBe("setup_required");
    expect(r.required_tool).toBe("SLACK");
    expect(r.risk).toBe("medium");
  });

  it("permission_required routes to setup_required", () => {
    const r = projectRoutingDecision(
      entry({
        execution_plan: plan({
          executionMode: "permission_required",
          requiredConnector: "JIRA",
          capabilityState: "available_needs_user_auth",
        }),
      }),
    );
    expect(r.lane).toBe("setup_required");
  });

  it("a setup-class capabilityState routes to setup_required even when the mode says draft", () => {
    const r = projectRoutingDecision(
      entry({
        execution_plan: plan({
          executionMode: "otzar_can_draft",
          requiredConnector: "GITHUB",
          capabilityState: "connector_missing",
        }),
      }),
    );
    expect(r.lane).toBe("setup_required");
  });

  // ── d. escalate ──
  it("NEEDS_APPROVAL with a linked governed Action routes to escalate (dual-control pairing)", () => {
    const r = projectRoutingDecision(
      entry({
        status: "NEEDS_APPROVAL",
        proposed_action_id: "6f9619ff-8b86-d011-b42d-00c04fc964ff",
        execution_plan: plan({
          executionMode: "otzar_can_execute_with_approval",
          approvalRequired: true,
          requiredConnector: "SLACK",
          capabilityState: "available_and_authorized",
          policyStatus: "requires_approval",
        }),
      }),
    );
    expect(r.lane).toBe("escalate");
    expect(r.risk).toBe("high"); // external write pending a second approver
  });

  it("PRECEDENCE: escalate beats ask_approval (the Action link decides)", () => {
    const withAction = projectRoutingDecision(
      entry({
        status: "NEEDS_APPROVAL",
        proposed_action_id: "6f9619ff-8b86-d011-b42d-00c04fc964ff",
        execution_plan: plan({ approvalRequired: true }),
      }),
    );
    const withoutAction = projectRoutingDecision(
      entry({ status: "NEEDS_APPROVAL", execution_plan: plan({ approvalRequired: true }) }),
    );
    expect(withAction.lane).toBe("escalate");
    expect(withoutAction.lane).toBe("ask_approval");
  });

  // ── e. ask_approval ──
  it("otzar_can_execute_with_approval on a pending row routes to ask_approval", () => {
    const r = projectRoutingDecision(
      entry({
        status: "PROPOSED",
        execution_plan: plan({
          executionMode: "otzar_can_execute_with_approval",
          approvalRequired: true,
          requiredConnector: "SLACK",
          capabilityState: "available_and_authorized",
          policyStatus: "requires_approval",
          nextBestAction: "request_approval",
        }),
      }),
    );
    expect(r.lane).toBe("ask_approval");
    expect(r.risk).toBe("high"); // external tool write
    expect(r.next_best_action).toBe("request_approval");
  });

  it("internal approval work (no external tool) is ask_approval at MEDIUM risk", () => {
    const r = projectRoutingDecision(
      entry({
        status: "DRAFT",
        execution_plan: plan({
          executionType: "approval_request",
          executionMode: "otzar_can_draft",
          requiredConnector: "INTERNAL",
          policyStatus: "requires_approval",
          approvalRequired: true,
        }),
      }),
    );
    expect(r.lane).toBe("ask_approval");
    expect(r.risk).toBe("medium");
  });

  // ── f. execute_when_allowed ──
  it("otzar_can_execute_when_policy_allows + allowed routes to execute_when_allowed", () => {
    const r = projectRoutingDecision(
      entry({
        execution_plan: plan({
          executionType: "work_ledger_update",
          executionMode: "otzar_can_execute_when_policy_allows",
          requiredConnector: "INTERNAL",
          policyStatus: "allowed",
          nextBestAction: "execute",
        }),
      }),
    );
    expect(r.lane).toBe("execute_when_allowed");
    expect(r.risk).toBe("low");
  });

  // ── g. draft_ready ──
  it("otzar_can_draft routes to draft_ready", () => {
    const r = projectRoutingDecision(
      entry({ execution_plan: plan({ executionMode: "otzar_can_draft" }) }),
    );
    expect(r.lane).toBe("draft_ready");
    expect(r.risk).toBe("low");
  });

  // ── h. notify_owner ──
  it("non-approval NEEDS_* review states route to notify_owner", () => {
    for (const status of [
      "NEEDS_TARGET_RESOLUTION",
      "NEEDS_PARTICIPANT_CONFIRMATION",
      "NEEDS_SELECTED_TIME",
      "NEEDS_AUTHORITY",
      "NEEDS_CALLER_CONFIRMATION",
      "RUNTIME_MISSING",
    ]) {
      const r = projectRoutingDecision(entry({ status, owner_entity_id: "e-a" }));
      expect(r.lane).toBe("notify_owner");
      expect(r.risk).toBe("low");
    }
  });

  // ── i. silent_routing ──
  it("owned open human work (human_must_do) routes to silent_routing", () => {
    const r = projectRoutingDecision(
      entry({
        status: "PROPOSED",
        owner_entity_id: "e-david",
        execution_plan: plan({ executionMode: "human_must_do", nextBestAction: "route" }),
      }),
    );
    expect(r.lane).toBe("silent_routing");
    expect(r.owner_status).toBe("resolved");
    expect(r.risk).toBe("low");
  });

  it("owned open work with NO plan at all defaults to silent_routing (human by default)", () => {
    const r = projectRoutingDecision(entry({ status: "DETECTED", owner_entity_id: "e-annie" }));
    expect(r.lane).toBe("silent_routing");
  });

  // ── j. silent_capture ──
  it("a completed row routes to silent_capture", () => {
    const r = projectRoutingDecision(
      entry({ status: "EXECUTED", owner_entity_id: "e-david", execution_plan: plan() }),
    );
    // Draft mode + a done status: the draft moment has passed. Wait — mode
    // otzar_can_draft matches lane g regardless of status; use a human plan.
    const done = projectRoutingDecision(
      entry({
        status: "VERIFIED",
        owner_entity_id: "e-david",
        execution_plan: plan({ executionMode: "human_must_do" }),
      }),
    );
    expect(done.lane).toBe("silent_capture");
    expect(done.risk).toBe("low");
    expect(r.lane).toBe("draft_ready"); // documented: mode-driven lanes are status-independent
  });

  it("an ownerless informational row routes to silent_capture as unowned", () => {
    const r = projectRoutingDecision(entry({ status: "DETECTED" }));
    expect(r.lane).toBe("silent_capture");
    expect(r.owner_status).toBe("unowned");
  });
});

describe("reasons are plain human language — never backend jargon", () => {
  // Representative entries across every lane a-j.
  const MATRIX: RoutingProjectionInput[] = [
    entry({ status: "NEEDS_OWNER" }),
    entry({ execution_plan: plan({ executionMode: "blocked", policyStatus: "blocked" }) }),
    entry({
      execution_plan: plan({
        executionMode: "connector_required",
        requiredConnector: "GOOGLE_WORKSPACE",
        capabilityState: "not_connected",
        // A persisted blockerReason carrying a raw enum token MUST be humanized.
        blockerReason: "Connect GOOGLE_WORKSPACE before Otzar can act here.",
      }),
    }),
    entry({
      execution_plan: plan({
        executionMode: "permission_required",
        requiredConnector: "MCP_SERVER",
        capabilityState: "available_needs_admin_auth",
        blockerReason: null,
      }),
    }),
    entry({
      status: "NEEDS_APPROVAL",
      proposed_action_id: "6f9619ff-8b86-d011-b42d-00c04fc964ff",
      execution_plan: plan({ approvalRequired: true, requiredConnector: "SLACK" }),
    }),
    entry({
      status: "PROPOSED",
      execution_plan: plan({
        executionMode: "otzar_can_execute_with_approval",
        approvalRequired: true,
        requiredConnector: "SLACK",
      }),
    }),
    entry({
      execution_plan: plan({
        executionMode: "otzar_can_execute_when_policy_allows",
        policyStatus: "allowed",
      }),
    }),
    entry({ execution_plan: plan({ executionMode: "otzar_can_draft" }) }),
    entry({ status: "NEEDS_PARTICIPANT_CONFIRMATION" }),
    entry({ status: "PROPOSED", owner_entity_id: "e-a", execution_plan: plan({ executionMode: "human_must_do" }) }),
    entry({ status: "EXECUTED" }),
    entry({ status: "BLOCKED" }),
  ];

  it("no reason contains envelope/binding/MCP/underscores or executionMode enum literals", () => {
    // Every underscore-bearing executionMode literal is caught by the "_" ban;
    // "blocked" alone is legitimate English and stays allowed as a word.
    const FORBIDDEN = [
      "envelope",
      "binding",
      "MCP",
      "_",
      "human_must_do",
      "otzar_can_draft",
      "otzar_can_execute_with_approval",
      "otzar_can_execute_when_policy_allows",
      "connector_required",
      "permission_required",
    ];
    for (const e of MATRIX) {
      const r = projectRoutingDecision(e);
      for (const bad of FORBIDDEN) {
        expect(r.reason, `lane=${r.lane} reason="${r.reason}"`).not.toContain(bad);
      }
      // A human sentence: starts with a letter, has spaces, ends with punctuation.
      expect(r.reason).toMatch(/^[A-Z].* .*[.!]$/);
    }
  });

  it("raw connector tokens in persisted blockerReasons are humanized", () => {
    const r = projectRoutingDecision(
      entry({
        execution_plan: plan({
          executionMode: "connector_required",
          requiredConnector: "GOOGLE_WORKSPACE",
          blockerReason: "Connect GOOGLE_WORKSPACE before Otzar can act here.",
        }),
      }),
    );
    expect(r.reason).toContain("Google Workspace");
    expect(r.reason).not.toContain("_");
  });
});

describe("governance pointers, confidence, and evidence refs", () => {
  it("confidence maps plan high/medium/low → 0.9/0.6/0.3, else confidence_score, else null", () => {
    expect(projectRoutingDecision(entry({ execution_plan: plan({ confidence: "high" }) })).confidence).toBe(0.9);
    expect(projectRoutingDecision(entry({ execution_plan: plan({ confidence: "medium" }) })).confidence).toBe(0.6);
    expect(projectRoutingDecision(entry({ execution_plan: plan({ confidence: "low" }) })).confidence).toBe(0.3);
    expect(projectRoutingDecision(entry({ confidence_score: 0.42 })).confidence).toBe(0.42);
    expect(projectRoutingDecision(entry()).confidence).toBeNull();
  });

  it("policy_basis prefers policy_reason_code, falls back to authority_decision, else null", () => {
    expect(
      projectRoutingDecision(entry({ policy_reason_code: "CONNECTOR_WRITE_GATED", authority_decision: "ESCALATE" }))
        .policy_basis,
    ).toBe("CONNECTOR_WRITE_GATED");
    expect(projectRoutingDecision(entry({ authority_decision: "ESCALATE" })).policy_basis).toBe("ESCALATE");
    expect(projectRoutingDecision(entry()).policy_basis).toBeNull();
  });

  it("audit_pointer surfaces audit_event_id (null when absent)", () => {
    expect(
      projectRoutingDecision(entry({ audit_event_id: "0b1c2d3e-4f50-6172-8394-a5b6c7d8e9f0" })).audit_pointer,
    ).toBe("0b1c2d3e-4f50-6172-8394-a5b6c7d8e9f0");
    expect(projectRoutingDecision(entry()).audit_pointer).toBeNull();
  });

  it("evidence_refs collects conversation_id + source_message_id + ref-shaped evidence fields, deduped", () => {
    const r = projectRoutingDecision(
      entry({
        conversation_id: "c-1",
        source_message_id: "m-9",
        evidence: [
          { quote: "David: I'll send the links", speaker: "David", source_message_id: "m-9" },
          { quote: "second", ref: "thread-77" },
          "a bare string is ignored",
        ],
      }),
    );
    expect(r.evidence_refs).toEqual(["c-1", "m-9", "thread-77"]);
    // Payload text (quotes/speakers) never leaks into refs.
    expect(r.evidence_refs.join(" ")).not.toContain("links");
  });

  it("next_best_action prefers the plan's nextBestAction, then next_action", () => {
    expect(
      projectRoutingDecision(entry({ next_action: "Ping the owner", execution_plan: plan({ nextBestAction: "draft" }) }))
        .next_best_action,
    ).toBe("draft");
    expect(projectRoutingDecision(entry({ next_action: "Ping the owner" })).next_best_action).toBe("Ping the owner");
    expect(projectRoutingDecision(entry()).next_best_action).toBeNull();
  });
});

describe("null-safety — sparse and malformed rows never crash", () => {
  it("a row with nothing but a status projects (ownerless → silent_capture)", () => {
    const r: RoutingDecisionView = projectRoutingDecision({ status: "DETECTED" });
    expect(r.lane).toBe("silent_capture");
    expect(r.confidence).toBeNull();
    expect(r.audit_pointer).toBeNull();
    expect(r.evidence_refs).toEqual([]);
    expect(r.required_tool).toBeNull();
  });

  it("a bare owned open row projects to silent_routing (no details/plan → not a crash)", () => {
    const r = projectRoutingDecision({ status: "PROPOSED", owner_entity_id: "e-a" });
    expect(r.lane).toBe("silent_routing");
  });

  it("malformed execution_plan / evidence shapes are tolerated", () => {
    expect(() =>
      projectRoutingDecision(
        entry({
          execution_plan: { executionMode: 42, policyStatus: {}, approvalRequired: "yes" } as Record<string, unknown>,
          evidence: { not: "an array" },
        }),
      ),
    ).not.toThrow();
    const r = projectRoutingDecision(
      entry({ execution_plan: {} as Record<string, unknown>, evidence: null }),
    );
    expect(r.lane).toBe("silent_capture");
  });
});
