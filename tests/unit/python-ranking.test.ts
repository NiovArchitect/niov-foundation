// FILE: python-ranking.test.ts (unit)
// PURPOSE: Phase 5 — unit tests for the Python intelligence runtime
//          client wrapper. Verifies the fixture-first deterministic
//          ranker + the Python-response validator + the fallback
//          discipline.
// CONNECTS TO: apps/api/src/services/intelligence/python-ranking.service.ts

import { describe, expect, it } from "vitest";
import {
  rankEmployeeTwinNextActions,
  rankNextActionsFixture,
  validatePythonRankingResponse,
  type NextActionRankingInput,
} from "../../apps/api/src/services/intelligence/python-ranking.service.js";

function baseInput(
  overrides: Partial<NextActionRankingInput> = {},
): NextActionRankingInput {
  return {
    pending_approvals_count: 0,
    recent_action_count: 0,
    active_authority_grants_count: 0,
    expiring_soon_grants_count: 0,
    sensitive_case_by_case_grants_count: 0,
    active_preferences_count: 0,
    active_sensitivity_boundaries_count: 0,
    collaboration_inbox_pending_count: 0,
    collaboration_needs_approval_count: 0,
    collaboration_blocked_count: 0,
    active_project_count: 0,
    most_recent_action_at: null,
    most_recent_collaboration_at: null,
    ...overrides,
  };
}

describe("rankNextActionsFixture", () => {
  it("returns INSUFFICIENT_CONTEXT when literally no heuristic fires", () => {
    // Set both preferences AND boundaries > 0 so the teach-your-twin
    // nudge doesn't fire, leaving no candidates.
    const r = rankNextActionsFixture(
      baseInput({
        active_preferences_count: 1,
        active_sensitivity_boundaries_count: 1,
      }),
    );
    expect(r.suggestions).toHaveLength(1);
    expect(r.suggestions[0]?.confidence).toBe("INSUFFICIENT_CONTEXT");
    expect(r.provider_mode).toBe("FIXTURE");
  });

  it("base zero-state nudges the employee to teach their Twin (LOW confidence)", () => {
    const r = rankNextActionsFixture(baseInput());
    expect(r.suggestions[0]?.reason).toBe("TEACH_YOUR_TWIN_PREFERENCES");
    expect(r.suggestions[0]?.confidence).toBe("LOW");
  });

  it("PENDING_APPROVALS gets the highest score", () => {
    const r = rankNextActionsFixture(
      baseInput({
        pending_approvals_count: 3,
        collaboration_needs_approval_count: 1,
        expiring_soon_grants_count: 2,
      }),
    );
    expect(r.suggestions[0]?.reason).toBe("PENDING_APPROVALS_AWAITING_YOU");
    expect(r.suggestions[0]?.risk).toBe("APPROVAL_REQUIRED");
  });

  it("never returns more than 6 suggestions", () => {
    const r = rankNextActionsFixture(
      baseInput({
        pending_approvals_count: 1,
        collaboration_needs_approval_count: 1,
        collaboration_blocked_count: 1,
        expiring_soon_grants_count: 1,
        sensitive_case_by_case_grants_count: 1,
        collaboration_inbox_pending_count: 1,
        conduct_session_approval_required: true,
        conduct_session_next_step: "NEEDS_CLARIFICATION",
        conduct_session_collaboration_suggested: true,
        active_project_count: 1,
        recent_action_count: 0,
        active_preferences_count: 0,
        active_sensitivity_boundaries_count: 0,
      }),
    );
    expect(r.suggestions.length).toBeLessThanOrEqual(6);
  });

  it("rank is sequential 1..N", () => {
    const r = rankNextActionsFixture(
      baseInput({
        pending_approvals_count: 2,
        expiring_soon_grants_count: 1,
        recent_action_count: 6,
      }),
    );
    for (let i = 0; i < r.suggestions.length; i++) {
      expect(r.suggestions[i]?.rank).toBe(i + 1);
    }
  });

  it("teach-your-twin nudge fires only when preferences AND boundaries are empty", () => {
    const r = rankNextActionsFixture(
      baseInput({
        active_preferences_count: 0,
        active_sensitivity_boundaries_count: 0,
      }),
    );
    expect(
      r.suggestions.some((s) => s.reason === "TEACH_YOUR_TWIN_PREFERENCES"),
    ).toBe(true);
  });
});

describe("validatePythonRankingResponse", () => {
  it("rejects non-object inputs", () => {
    expect(validatePythonRankingResponse(null)).toBeNull();
    expect(validatePythonRankingResponse(42)).toBeNull();
    expect(validatePythonRankingResponse("bad")).toBeNull();
  });

  it("rejects missing suggestions array", () => {
    expect(validatePythonRankingResponse({})).toBeNull();
  });

  it("rejects unknown reason / confidence / risk literals", () => {
    expect(
      validatePythonRankingResponse({
        suggestions: [
          {
            rank: 1,
            reason: "EXFILTRATE_DATA",
            safe_title: "x",
            confidence: "HIGH",
            risk: "NONE",
            score: 1,
          },
        ],
      }),
    ).toBeNull();
  });

  it("rejects safe_title longer than 200 chars (chain-of-thought sneak guard)", () => {
    expect(
      validatePythonRankingResponse({
        suggestions: [
          {
            rank: 1,
            reason: "PENDING_APPROVALS_AWAITING_YOU",
            safe_title: "x".repeat(201),
            confidence: "HIGH",
            risk: "NONE",
            score: 1,
          },
        ],
      }),
    ).toBeNull();
  });

  it("accepts a well-formed response and tags provider_mode=PYTHON", () => {
    const r = validatePythonRankingResponse({
      suggestions: [
        {
          rank: 1,
          reason: "PENDING_APPROVALS_AWAITING_YOU",
          safe_title: "2 approvals awaiting you",
          confidence: "HIGH",
          risk: "APPROVAL_REQUIRED",
          score: 100,
        },
      ],
    });
    expect(r).not.toBeNull();
    expect(r?.provider_mode).toBe("PYTHON");
  });
});

describe("rankEmployeeTwinNextActions — fallback discipline", () => {
  it("falls back to fixture + PROVIDER_DISABLED when fixtureMode=true", async () => {
    const r = await rankEmployeeTwinNextActions(baseInput(), {
      fixtureMode: true,
    });
    expect(r.provider_mode).toBe("FIXTURE");
    expect(r.fallback_reason).toBe("PROVIDER_DISABLED");
  });

  it("falls back to fixture + PROVIDER_URL_NOT_SET when no URL given", async () => {
    const r = await rankEmployeeTwinNextActions(baseInput(), {
      pythonUrl: null,
      fixtureMode: false,
    });
    expect(r.provider_mode).toBe("FIXTURE");
    expect(r.fallback_reason).toBe("PROVIDER_URL_NOT_SET");
  });

  it("falls back to fixture + PROVIDER_TIMEOUT when fetch aborts", async () => {
    const abortingFetch: typeof fetch = (() => {
      return Promise.reject(
        Object.assign(new Error("Aborted"), { name: "AbortError" }),
      );
    }) as typeof fetch;
    const r = await rankEmployeeTwinNextActions(baseInput(), {
      pythonUrl: "http://localhost:9999",
      fixtureMode: false,
      timeoutMs: 5,
      fetchImpl: abortingFetch,
    });
    expect(r.provider_mode).toBe("FIXTURE");
    expect(r.fallback_reason).toBe("PROVIDER_TIMEOUT");
  });

  it("falls back to fixture + PROVIDER_INVALID_RESPONSE when Python returns bad shape", async () => {
    const badFetch: typeof fetch = (() => {
      return Promise.resolve(
        new Response(JSON.stringify({ junk: true }), { status: 200 }),
      );
    }) as typeof fetch;
    const r = await rankEmployeeTwinNextActions(baseInput(), {
      pythonUrl: "http://python:8000",
      fixtureMode: false,
      fetchImpl: badFetch,
    });
    expect(r.provider_mode).toBe("FIXTURE");
    expect(r.fallback_reason).toBe("PROVIDER_INVALID_RESPONSE");
  });

  it("returns PYTHON when fetch returns a valid response", async () => {
    const okFetch: typeof fetch = (() => {
      const body = {
        suggestions: [
          {
            rank: 1,
            reason: "PENDING_APPROVALS_AWAITING_YOU",
            safe_title: "1 approval awaiting you",
            confidence: "HIGH",
            risk: "APPROVAL_REQUIRED",
            score: 100,
          },
        ],
      };
      return Promise.resolve(
        new Response(JSON.stringify(body), { status: 200 }),
      );
    }) as typeof fetch;
    const r = await rankEmployeeTwinNextActions(baseInput(), {
      pythonUrl: "http://python:8000",
      fixtureMode: false,
      fetchImpl: okFetch,
    });
    expect(r.provider_mode).toBe("PYTHON");
    expect(r.suggestions[0]?.reason).toBe("PENDING_APPROVALS_AWAITING_YOU");
  });
});
