// FILE: connector-capability.test.ts (unit, no DB)
// PURPOSE: Phase 5 — the connector capability resolver collapses the connector
//          facts (provider support + binding + grant + policy + context) into the
//          seven governed states. Pure decision logic; the DB resolver feeds it.
// CONNECTS TO: services/otzar/connector-capability.ts.

import { describe, expect, it } from "vitest";
import { computeCapabilityState, needsSetup, isReachable, requiredConnectorToProviderType } from "@niov/api";
import type { CapabilityFacts } from "@niov/api";

const ALL_GOOD: CapabilityFacts = {
  providerKnown: true,
  supportsOperation: true,
  bindingExists: true,
  actorAuthorized: true,
  adminAuthRequired: false,
  policyAllows: true,
  hasContext: true,
};

describe("Phase 5 — connector capability state resolution", () => {
  it("all facts good -> available_and_authorized", () => {
    expect(computeCapabilityState(ALL_GOOD)).toBe("available_and_authorized");
  });

  it("unknown provider -> connector_missing", () => {
    expect(computeCapabilityState({ ...ALL_GOOD, providerKnown: false })).toBe("connector_missing");
  });

  it("provider can't do the operation -> connector_missing", () => {
    expect(computeCapabilityState({ ...ALL_GOOD, supportsOperation: false })).toBe("connector_missing");
  });

  it("no enabled binding -> not_connected", () => {
    expect(computeCapabilityState({ ...ALL_GOOD, bindingExists: false })).toBe("not_connected");
  });

  it("actor not authorized (user-level) -> available_needs_user_auth", () => {
    expect(computeCapabilityState({ ...ALL_GOOD, actorAuthorized: false, adminAuthRequired: false })).toBe("available_needs_user_auth");
  });

  it("actor not authorized (admin-level) -> available_needs_admin_auth", () => {
    expect(computeCapabilityState({ ...ALL_GOOD, actorAuthorized: false, adminAuthRequired: true })).toBe("available_needs_admin_auth");
  });

  it("policy blocks the op -> policy_blocked", () => {
    expect(computeCapabilityState({ ...ALL_GOOD, policyAllows: false })).toBe("policy_blocked");
  });

  it("missing context -> insufficient_context", () => {
    expect(computeCapabilityState({ ...ALL_GOOD, hasContext: false })).toBe("insufficient_context");
  });

  it("setup-required states are classified for blocker creation; only authorized is reachable", () => {
    expect(isReachable("available_and_authorized")).toBe(true);
    expect(isReachable("not_connected")).toBe(false);
    for (const s of ["not_connected", "connector_missing", "available_needs_user_auth", "available_needs_admin_auth"] as const) {
      expect(needsSetup(s)).toBe(true);
    }
    expect(needsSetup("available_and_authorized")).toBe(false);
    expect(needsSetup("policy_blocked")).toBe(false);
  });

  it("calendar maps to the Google Workspace provider; internal/none have no provider", () => {
    expect(requiredConnectorToProviderType("CALENDAR")).toBe("GOOGLE_WORKSPACE");
    expect(requiredConnectorToProviderType("GITHUB")).toBe("GITHUB");
    expect(requiredConnectorToProviderType("NONE")).toBeNull();
    expect(requiredConnectorToProviderType("INTERNAL")).toBeNull();
  });
});
