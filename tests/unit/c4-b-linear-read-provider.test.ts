// FILE: c4-b-linear-read-provider.test.ts
// PURPOSE: Section 4 C4-B — unit tests for LinearReadProvider.
//          Verifies the registry extension + fixture-mode success
//          + fixture-mode forced-failure paths + payload validation
//          + the LINEAR_USE_REAL environment gate + privacy invariant.
//          No outbound HTTP is ever made by these tests (the env
//          gate stays unset). Mirrors c4-a-jira-cloud-read-
//          provider.test.ts verbatim where the abstraction matches.
// RULE 21 RESEARCH ARC LINEAGE:
//   - Linear Developer docs (developers.linear.app/docs): GraphQL
//     API stable endpoint https://api.linear.app/graphql; OAuth
//     2.0 authorization code flow with `read` scope sufficient
//     for the C4-B surface; `Authorization: Bearer <access_token>`
//     header for OAuth tokens (personal API keys use a different
//     header shape and are intentionally NOT supported at C4-B
//     for workspace-tier auditability).
//   - Linear WorkflowState.type enum: triage / backlog /
//     unstarted / started / completed / canceled — these are the
//     canonical state-category labels Linear surfaces, mapped at
//     C4-B to 4 aggregate buckets (to_do / in_progress / done /
//     canceled).
//   - GraphQL complexity-based rate limit (~1500 complexity per
//     minute per OAuth client per Linear docs); 429 collapses to
//     RATE_LIMIT; HTTP 200 with errors[] non-empty collapses to
//     PROVIDER_ERROR per GraphQL convention.
//   - docs/connector-readiness/jira-linear.json (Linear catalog
//     item; first_slice_recommendation matches this provider's
//     surface verbatim).
//   - Verified ground-truth in repo before drafting per RULE 12:
//     ConnectorType union shape (connector.service.ts L45-51)
//     + getConnectorTypeDefinition discriminator pattern
//     + getConnectorProviderAsync dynamic-import pattern
//     + 8 closed-vocab failure codes mirrored from C4-A
//     jira-cloud-read.provider.ts.
// CONNECTS TO:
//   - apps/api/src/services/connector/linear-read.provider.ts
//   - apps/api/src/services/connector/connector.service.ts

import { describe, expect, it } from "vitest";
import { LinearReadProvider } from "../../apps/api/src/services/connector/linear-read.provider";
import {
  CONNECTOR_REGISTRY,
  getConnectorProviderAsync,
  getConnectorTypeDefinition,
  type ConnectorInvocation,
} from "../../apps/api/src/services/connector/connector.service";

function makeInvocation(
  payload: Record<string, unknown>,
  config: Record<string, unknown> = {},
): ConnectorInvocation {
  return {
    binding_id: "00000000-0000-0000-0000-000000000005",
    type: "LINEAR_READ",
    config: Object.freeze(config),
    secret_ref: "LINEAR_ACCESS_TOKEN_TEST",
    payload: Object.freeze(payload),
  };
}

describe("C4-B — LINEAR_READ registry extension", () => {
  it("registers LINEAR_READ in CONNECTOR_REGISTRY", () => {
    expect(CONNECTOR_REGISTRY.LINEAR_READ).toBeDefined();
    expect(CONNECTOR_REGISTRY.LINEAR_READ.type).toBe("LINEAR_READ");
    expect(CONNECTOR_REGISTRY.LINEAR_READ.secret_ref_required).toBe(true);
    expect(CONNECTOR_REGISTRY.LINEAR_READ.transport).toBe(
      "https-post-graphql-bearer-token",
    );
    expect(CONNECTOR_REGISTRY.LINEAR_READ.default_config_keys).toContain(
      "use_real",
    );
  });

  it("resolves LINEAR_READ via getConnectorTypeDefinition", () => {
    const def = getConnectorTypeDefinition("LINEAR_READ");
    expect(def).not.toBeNull();
    expect(def?.display_name).toContain("Linear");
  });

  it("returns null for unknown candidate strings", () => {
    expect(getConnectorTypeDefinition("LINEAR_WRITE")).toBeNull();
    expect(getConnectorTypeDefinition("LINEAR")).toBeNull();
    expect(getConnectorTypeDefinition("LINEAR_GRAPHQL")).toBeNull();
  });

  it("getConnectorProviderAsync(LINEAR_READ) returns a LinearReadProvider", async () => {
    const provider = await getConnectorProviderAsync("LINEAR_READ");
    expect(provider).toBeInstanceOf(LinearReadProvider);
  });
});

describe("C4-B — LinearReadProvider fixture-mode success", () => {
  it("returns success metadata for viewer", async () => {
    const provider = new LinearReadProvider();
    const result = await provider.invoke(
      makeInvocation({ operation: "viewer" }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.delivery_metadata["operation"]).toBe("viewer");
      expect(result.delivery_metadata["mode"]).toBe("fixture");
      expect(result.delivery_metadata["authenticated"]).toBe(true);
      expect(result.delivery_metadata["active"]).toBe(true);
    }
  });

  it("returns success metadata for teams.list", async () => {
    const provider = new LinearReadProvider();
    const result = await provider.invoke(
      makeInvocation({ operation: "teams.list" }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.delivery_metadata["operation"]).toBe("teams.list");
      expect(result.delivery_metadata["teams_count"]).toBe(4);
      expect(result.delivery_metadata["has_next_page"]).toBe(false);
    }
  });

  it("returns success metadata for issues.list with 4 state-type aggregate buckets", async () => {
    const provider = new LinearReadProvider();
    const result = await provider.invoke(
      makeInvocation({ operation: "issues.list" }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.delivery_metadata["operation"]).toBe("issues.list");
      expect(result.delivery_metadata["issues_count"]).toBe(12);
      expect(result.delivery_metadata["to_do_count"]).toBe(5);
      expect(result.delivery_metadata["in_progress_count"]).toBe(4);
      expect(result.delivery_metadata["done_count"]).toBe(2);
      // Linear surfaces canceled distinctly from completed (unlike
      // Jira which folds canceled under "done"); the canceled
      // bucket must be present and an integer.
      expect(result.delivery_metadata["canceled_count"]).toBe(1);
    }
  });
});

describe("C4-B — LinearReadProvider validation", () => {
  it("rejects an unknown operation as VALIDATION", async () => {
    const provider = new LinearReadProvider();
    const result = await provider.invoke(
      makeInvocation({ operation: "issueCreate" }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error_class).toBe("VALIDATION");
    }
  });

  it("rejects an empty payload as VALIDATION", async () => {
    const provider = new LinearReadProvider();
    const result = await provider.invoke(makeInvocation({}));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error_class).toBe("VALIDATION");
    }
  });

  it("rejects a write-style operation (commentCreate) as VALIDATION", async () => {
    const provider = new LinearReadProvider();
    const result = await provider.invoke(
      makeInvocation({ operation: "commentCreate" }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error_class).toBe("VALIDATION");
    }
  });

  it("rejects a state-transition operation (issueUpdate) as VALIDATION", async () => {
    const provider = new LinearReadProvider();
    const result = await provider.invoke(
      makeInvocation({ operation: "issueUpdate" }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error_class).toBe("VALIDATION");
    }
  });

  it("rejects a cycle-management operation as VALIDATION", async () => {
    const provider = new LinearReadProvider();
    const result = await provider.invoke(
      makeInvocation({ operation: "cycleUpdate" }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error_class).toBe("VALIDATION");
    }
  });
});

describe("C4-B — LinearReadProvider fixture-mode forced failures", () => {
  const forced: Array<[string, string]> = [
    ["force-auth-failure", "AUTH"],
    ["force-network-failure", "NETWORK"],
    ["force-timeout", "TIMEOUT"],
    ["force-rate-limit", "RATE_LIMIT"],
    ["force-provider-error", "PROVIDER_ERROR"],
    ["force-validation-failure", "VALIDATION"],
    ["force-not-configured", "NOT_CONFIGURED"],
    ["force-disabled", "DISABLED"],
  ];

  it.each(forced)(
    "fixture_key %s maps to error_class %s",
    async (fixtureKey, expectedClass) => {
      const provider = new LinearReadProvider();
      const result = await provider.invoke(
        makeInvocation({
          fixture_key: fixtureKey,
          operation: "viewer",
        }),
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error_class).toBe(expectedClass);
      }
    },
  );
});

describe("C4-B — LinearReadProvider environment gate", () => {
  it("does NOT activate real Linear API when LINEAR_USE_REAL is unset", async () => {
    expect(process.env["LINEAR_USE_REAL"]).toBeUndefined();
    const provider = new LinearReadProvider();
    const result = await provider.invoke(
      makeInvocation(
        { operation: "viewer" },
        { use_real: true },
      ),
    );
    // Even with config.use_real=true, the env gate prevents real
    // API access; fixture-mode metadata is returned.
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.delivery_metadata["mode"]).toBe("fixture");
    }
  });

  it("does NOT activate real Linear API when config.use_real is false", async () => {
    const provider = new LinearReadProvider();
    const originalEnv = process.env["LINEAR_USE_REAL"];
    try {
      process.env["LINEAR_USE_REAL"] = "1";
      const result = await provider.invoke(
        makeInvocation(
          { operation: "teams.list" },
          { use_real: false },
        ),
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.delivery_metadata["mode"]).toBe("fixture");
      }
    } finally {
      if (originalEnv === undefined) {
        delete process.env["LINEAR_USE_REAL"];
      } else {
        process.env["LINEAR_USE_REAL"] = originalEnv;
      }
    }
  });

  it("does NOT activate real Linear API when secret_ref env var is missing", async () => {
    const provider = new LinearReadProvider();
    const originalUseReal = process.env["LINEAR_USE_REAL"];
    try {
      process.env["LINEAR_USE_REAL"] = "1";
      // LINEAR_ACCESS_TOKEN_MISSING is not set in env, so the
      // triple gate fails and fixture mode runs.
      const invocation: ConnectorInvocation = {
        binding_id: "00000000-0000-0000-0000-000000000005",
        type: "LINEAR_READ",
        config: Object.freeze({ use_real: true }),
        secret_ref: "LINEAR_ACCESS_TOKEN_MISSING_DO_NOT_SET",
        payload: Object.freeze({ operation: "issues.list" }),
      };
      const result = await provider.invoke(invocation);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.delivery_metadata["mode"]).toBe("fixture");
      }
    } finally {
      if (originalUseReal === undefined) {
        delete process.env["LINEAR_USE_REAL"];
      } else {
        process.env["LINEAR_USE_REAL"] = originalUseReal;
      }
    }
  });
});

describe("C4-B — LinearReadProvider privacy invariant", () => {
  it("delivery_metadata never carries access token, raw issue content, team keys, or user identity", async () => {
    const provider = new LinearReadProvider();
    const result = await provider.invoke(
      makeInvocation({ operation: "issues.list" }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      const serialized = JSON.stringify(result.delivery_metadata);
      // Authorization header value never echoed
      expect(serialized).not.toMatch(/bearer/i);
      // Linear access tokens follow lin_oauth_* / lin_api_*
      // patterns per Linear developer docs; both must never
      // appear in serialized metadata.
      expect(serialized).not.toMatch(/lin_oauth_/i);
      expect(serialized).not.toMatch(/lin_api_/i);
      // Common Linear content markers absent
      expect(serialized).not.toMatch(/title/i);
      expect(serialized).not.toMatch(/description/i);
      expect(serialized).not.toMatch(/assignee/i);
      expect(serialized).not.toMatch(/reporter/i);
      expect(serialized).not.toMatch(/comment/i);
      expect(serialized).not.toMatch(/@/);
    }
  });

  it("error message scrubs access token and authorization header even when fixture forces failure", async () => {
    const provider = new LinearReadProvider();
    const result = await provider.invoke(
      makeInvocation(
        {
          fixture_key: "force-auth-failure",
          operation: "viewer",
        },
        { use_real: true },
      ),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).not.toMatch(/bearer/i);
      expect(result.message).not.toMatch(/lin_oauth_/i);
      expect(result.message).not.toMatch(/lin_api_/i);
    }
  });

  it("success result for viewer whitelist-asserts the exact metadata keys (never user id / name / email)", async () => {
    const provider = new LinearReadProvider();
    const result = await provider.invoke(
      makeInvocation({ operation: "viewer" }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      const keys = Object.keys(result.delivery_metadata);
      expect(keys.sort()).toEqual([
        "active",
        "authenticated",
        "binding_id",
        "mode",
        "operation",
        "provider",
      ]);
    }
  });

  it("success result for teams.list whitelist-asserts the exact metadata keys (never team keys / names)", async () => {
    const provider = new LinearReadProvider();
    const result = await provider.invoke(
      makeInvocation({ operation: "teams.list" }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      const keys = Object.keys(result.delivery_metadata);
      expect(keys.sort()).toEqual([
        "binding_id",
        "has_next_page",
        "mode",
        "operation",
        "provider",
        "teams_count",
      ]);
    }
  });

  it("success result for issues.list whitelist-asserts the exact metadata keys including canceled_count (5 aggregate counts; never issue identifiers / titles / descriptions)", async () => {
    const provider = new LinearReadProvider();
    const result = await provider.invoke(
      makeInvocation({ operation: "issues.list" }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      const keys = Object.keys(result.delivery_metadata);
      expect(keys.sort()).toEqual([
        "binding_id",
        "canceled_count",
        "done_count",
        "in_progress_count",
        "issues_count",
        "mode",
        "operation",
        "provider",
        "to_do_count",
      ]);
    }
  });
});
