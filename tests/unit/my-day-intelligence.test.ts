// FILE: my-day-intelligence.test.ts
// PURPOSE: Phase 1234 — pure-function tests for the My Day
//          intelligence helpers: signal-pack → ranker-input mapping,
//          provider-status collapse, and calm-copy discipline. No DB.

import { describe, expect, it } from "vitest";
import {
  buildRankingInput,
  headlineFor,
  providerStatusFrom,
  type MyDaySignals,
} from "../../apps/api/src/services/otzar/my-day-intelligence.service.js";

function signals(overrides: Partial<MyDaySignals> = {}): MyDaySignals {
  return {
    proposed_actions_count: 0,
    recent_action_count: 0,
    unread_notifications_count: 0,
    collaboration_inbox_pending_count: 0,
    collaboration_needs_approval_count: 0,
    collaboration_blocked_count: 0,
    active_authority_grants_count: 0,
    expiring_soon_grants_count: 0,
    sensitive_case_by_case_grants_count: 0,
    active_project_count: 0,
    open_commitments_owned_count: 0,
    waiting_on_external_count: 0,
    owed_to_external_count: 0,
    most_recent_action_at: null,
    most_recent_collaboration_at: null,
    ...overrides,
  };
}

describe("Phase 1234 — buildRankingInput", () => {
  it("maps every signal onto the ranker contract", () => {
    const input = buildRankingInput(
      signals({
        proposed_actions_count: 3,
        recent_action_count: 5,
        active_authority_grants_count: 2,
        expiring_soon_grants_count: 1,
        sensitive_case_by_case_grants_count: 1,
        collaboration_inbox_pending_count: 4,
        collaboration_needs_approval_count: 2,
        collaboration_blocked_count: 1,
        active_project_count: 2,
        most_recent_action_at: "2026-06-10T00:00:00.000Z",
        most_recent_collaboration_at: "2026-06-09T00:00:00.000Z",
      }),
    );
    expect(input.pending_approvals_count).toBe(3);
    expect(input.recent_action_count).toBe(5);
    expect(input.active_authority_grants_count).toBe(2);
    expect(input.expiring_soon_grants_count).toBe(1);
    expect(input.sensitive_case_by_case_grants_count).toBe(1);
    expect(input.collaboration_inbox_pending_count).toBe(4);
    expect(input.collaboration_needs_approval_count).toBe(2);
    expect(input.collaboration_blocked_count).toBe(1);
    expect(input.active_project_count).toBe(2);
    expect(input.most_recent_action_at).toBe("2026-06-10T00:00:00.000Z");
    expect(input.most_recent_collaboration_at).toBe(
      "2026-06-09T00:00:00.000Z",
    );
    // Fields without a cheap caller-scoped source are zero-filled.
    expect(input.active_preferences_count).toBe(0);
    expect(input.active_sensitivity_boundaries_count).toBe(0);
  });
});

describe("Phase 1234 — providerStatusFrom", () => {
  it("collapses provider_mode + fallback_reason into one honest label", () => {
    expect(providerStatusFrom({ provider_mode: "PYTHON" })).toBe(
      "PYTHON_CONFIGURED",
    );
    expect(
      providerStatusFrom({
        provider_mode: "FIXTURE",
        fallback_reason: "PROVIDER_URL_NOT_SET",
      }),
    ).toBe("FIXTURE_PROVIDER_URL_NOT_SET");
    expect(
      providerStatusFrom({
        provider_mode: "FIXTURE",
        fallback_reason: "PROVIDER_DISABLED",
      }),
    ).toBe("FIXTURE_PROVIDER_DISABLED");
    expect(
      providerStatusFrom({
        provider_mode: "FIXTURE",
        fallback_reason: "PROVIDER_TIMEOUT",
      }),
    ).toBe("FIXTURE_PROVIDER_TIMEOUT");
    expect(
      providerStatusFrom({
        provider_mode: "FIXTURE",
        fallback_reason: "PROVIDER_ERROR",
      }),
    ).toBe("FIXTURE_PROVIDER_ERROR");
    expect(
      providerStatusFrom({
        provider_mode: "FIXTURE",
        fallback_reason: "PROVIDER_INVALID_RESPONSE",
      }),
    ).toBe("FIXTURE_PROVIDER_INVALID_RESPONSE");
  });
});

describe("Phase 1234 — headlineFor calm-copy discipline", () => {
  it("quiet day reads calm, not empty-state developer text", () => {
    expect(headlineFor(0, 0)).toBe(
      "Nothing needs your attention right now. Otzar is keeping watch.",
    );
  });

  it("waiting-only day names the external wait without alarm", () => {
    expect(headlineFor(0, 1)).toContain("waiting on 1 item");
    expect(headlineFor(0, 3)).toContain("waiting on 3 items");
  });

  it("active day counts findings in plain language", () => {
    expect(headlineFor(1, 0)).toBe(
      "Otzar found 1 thing that may need your attention.",
    );
    expect(headlineFor(4, 2)).toBe(
      "Otzar found 4 things that may need your attention.",
    );
  });

  it("never uses developer vocabulary", () => {
    const samples = [headlineFor(0, 0), headlineFor(0, 2), headlineFor(5, 1)];
    for (const copy of samples) {
      for (const banned of [
        "payload",
        "schema",
        "adapter",
        "binding",
        "capsule",
        "wallet_id",
        "JSON",
        "DMW",
        "COSMP",
      ]) {
        expect(copy).not.toContain(banned);
      }
    }
  });
});
