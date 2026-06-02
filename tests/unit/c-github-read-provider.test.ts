// FILE: c-github-read-provider.test.ts
// PURPOSE: Section 4 C-GitHub — unit tests for GitHubReadProvider.
//          Verifies the registry extension + fixture-mode success
//          + fixture-mode forced-failure paths + payload validation
//          + the GITHUB_USE_REAL environment gate + privacy invariant.
//          No outbound HTTP is ever made by these tests (the env
//          gate stays unset).
// RULE 21 RESEARCH ARC LINEAGE:
//   - GitHub REST API v3 stable base path api.github.com
//   - OAuth 2.0 + Personal Access Token (PAT) both authenticate
//     via Authorization: Bearer <token>
//   - Search/issues response: { items[], incomplete_results,
//     total_count }
//   - Issue state model: "open" | "closed"; state_reason on
//     closed issues: "completed" | "not_planned" | "reopened" |
//     null (state_reason introduced 2022; pre-2022 closed
//     issues carry null and were closed-as-completed
//     semantically)
//   - X-GitHub-Api-Version 2022-11-28 pinned at the request
//     header per docs.github.com api-versions
//   - 401 + 403 both surface as AUTH at this provider boundary
//     (401 = token invalid; 403 = scope-missing OR
//     rate-limit-exceeded-without-Retry-After)
//   - docs/connector-readiness/github.json catalog item
//     first_slice_recommendation: C-GitHub read-first connector
//     runtime
// CONNECTS TO:
//   - apps/api/src/services/connector/github-read.provider.ts
//   - apps/api/src/services/connector/connector.service.ts

import { describe, expect, it } from "vitest";
import { GitHubReadProvider } from "../../apps/api/src/services/connector/github-read.provider";
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
    binding_id: "00000000-0000-0000-0000-000000000006",
    type: "GITHUB_READ",
    config: Object.freeze(config),
    secret_ref: "GITHUB_ACCESS_TOKEN_TEST",
    payload: Object.freeze(payload),
  };
}

describe("C-GitHub — GITHUB_READ registry extension", () => {
  it("registers GITHUB_READ in CONNECTOR_REGISTRY", () => {
    expect(CONNECTOR_REGISTRY.GITHUB_READ).toBeDefined();
    expect(CONNECTOR_REGISTRY.GITHUB_READ.type).toBe("GITHUB_READ");
    expect(CONNECTOR_REGISTRY.GITHUB_READ.secret_ref_required).toBe(true);
    expect(CONNECTOR_REGISTRY.GITHUB_READ.transport).toBe(
      "https-get-bearer-token",
    );
    expect(CONNECTOR_REGISTRY.GITHUB_READ.default_config_keys).toContain(
      "use_real",
    );
  });

  it("resolves GITHUB_READ via getConnectorTypeDefinition", () => {
    const def = getConnectorTypeDefinition("GITHUB_READ");
    expect(def).not.toBeNull();
    expect(def?.display_name).toContain("GitHub");
  });

  it("returns null for unknown candidate strings", () => {
    expect(getConnectorTypeDefinition("GITHUB_WRITE")).toBeNull();
    expect(getConnectorTypeDefinition("GITHUB")).toBeNull();
    expect(getConnectorTypeDefinition("GITHUB_GRAPHQL")).toBeNull();
  });

  it("getConnectorProviderAsync(GITHUB_READ) returns a GitHubReadProvider", async () => {
    const provider = await getConnectorProviderAsync("GITHUB_READ");
    expect(provider).toBeInstanceOf(GitHubReadProvider);
  });
});

describe("C-GitHub — GitHubReadProvider fixture-mode success", () => {
  it("returns success metadata for user", async () => {
    const provider = new GitHubReadProvider();
    const result = await provider.invoke(
      makeInvocation({ operation: "user" }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.delivery_metadata["operation"]).toBe("user");
      expect(result.delivery_metadata["mode"]).toBe("fixture");
      expect(result.delivery_metadata["authenticated"]).toBe(true);
      expect(result.delivery_metadata["active"]).toBe(true);
    }
  });

  it("returns success metadata for repos.list", async () => {
    const provider = new GitHubReadProvider();
    const result = await provider.invoke(
      makeInvocation({ operation: "repos.list" }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.delivery_metadata["operation"]).toBe("repos.list");
      expect(result.delivery_metadata["repos_count"]).toBe(7);
      expect(result.delivery_metadata["has_next_page"]).toBe(false);
    }
  });

  it("returns success metadata for issues.search with 3 state aggregate buckets", async () => {
    const provider = new GitHubReadProvider();
    const result = await provider.invoke(
      makeInvocation({ operation: "issues.search" }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.delivery_metadata["operation"]).toBe("issues.search");
      expect(result.delivery_metadata["issues_count"]).toBe(11);
      expect(result.delivery_metadata["open_count"]).toBe(5);
      // GitHub closes issues with state_reason; we surface both
      // completed and not_planned distinctly because the
      // semantic distinction matters at the audit register.
      expect(result.delivery_metadata["closed_completed_count"]).toBe(4);
      expect(result.delivery_metadata["closed_not_planned_count"]).toBe(2);
    }
  });
});

describe("C-GitHub — GitHubReadProvider validation", () => {
  it("rejects an unknown operation as VALIDATION", async () => {
    const provider = new GitHubReadProvider();
    const result = await provider.invoke(
      makeInvocation({ operation: "issues.create" }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error_class).toBe("VALIDATION");
    }
  });

  it("rejects an empty payload as VALIDATION", async () => {
    const provider = new GitHubReadProvider();
    const result = await provider.invoke(makeInvocation({}));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error_class).toBe("VALIDATION");
    }
  });

  it("rejects a write-style operation (repos.create) as VALIDATION", async () => {
    const provider = new GitHubReadProvider();
    const result = await provider.invoke(
      makeInvocation({ operation: "repos.create" }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error_class).toBe("VALIDATION");
    }
  });

  it("rejects a PR-create operation (pulls.create) as VALIDATION", async () => {
    const provider = new GitHubReadProvider();
    const result = await provider.invoke(
      makeInvocation({ operation: "pulls.create" }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error_class).toBe("VALIDATION");
    }
  });

  it("rejects a GraphQL surface attempt as VALIDATION", async () => {
    const provider = new GitHubReadProvider();
    const result = await provider.invoke(
      makeInvocation({ operation: "graphql" }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error_class).toBe("VALIDATION");
    }
  });
});

describe("C-GitHub — GitHubReadProvider fixture-mode forced failures", () => {
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
      const provider = new GitHubReadProvider();
      const result = await provider.invoke(
        makeInvocation({
          fixture_key: fixtureKey,
          operation: "user",
        }),
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error_class).toBe(expectedClass);
      }
    },
  );
});

describe("C-GitHub — GitHubReadProvider environment gate", () => {
  it("does NOT activate real GitHub API when GITHUB_USE_REAL is unset", async () => {
    expect(process.env["GITHUB_USE_REAL"]).toBeUndefined();
    const provider = new GitHubReadProvider();
    const result = await provider.invoke(
      makeInvocation(
        { operation: "user" },
        { use_real: true },
      ),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.delivery_metadata["mode"]).toBe("fixture");
    }
  });

  it("does NOT activate real GitHub API when config.use_real is false", async () => {
    const provider = new GitHubReadProvider();
    const originalEnv = process.env["GITHUB_USE_REAL"];
    try {
      process.env["GITHUB_USE_REAL"] = "1";
      const result = await provider.invoke(
        makeInvocation(
          { operation: "repos.list" },
          { use_real: false },
        ),
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.delivery_metadata["mode"]).toBe("fixture");
      }
    } finally {
      if (originalEnv === undefined) {
        delete process.env["GITHUB_USE_REAL"];
      } else {
        process.env["GITHUB_USE_REAL"] = originalEnv;
      }
    }
  });

  it("does NOT activate real GitHub API when secret_ref env var is missing", async () => {
    const provider = new GitHubReadProvider();
    const originalUseReal = process.env["GITHUB_USE_REAL"];
    try {
      process.env["GITHUB_USE_REAL"] = "1";
      const invocation: ConnectorInvocation = {
        binding_id: "00000000-0000-0000-0000-000000000006",
        type: "GITHUB_READ",
        config: Object.freeze({ use_real: true }),
        secret_ref: "GITHUB_ACCESS_TOKEN_MISSING_DO_NOT_SET",
        payload: Object.freeze({ operation: "issues.search" }),
      };
      const result = await provider.invoke(invocation);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.delivery_metadata["mode"]).toBe("fixture");
      }
    } finally {
      if (originalUseReal === undefined) {
        delete process.env["GITHUB_USE_REAL"];
      } else {
        process.env["GITHUB_USE_REAL"] = originalUseReal;
      }
    }
  });
});

describe("C-GitHub — GitHubReadProvider privacy invariant", () => {
  it("delivery_metadata never carries access token, repo names, issue titles/bodies, or user login", async () => {
    const provider = new GitHubReadProvider();
    const result = await provider.invoke(
      makeInvocation({ operation: "issues.search" }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      const serialized = JSON.stringify(result.delivery_metadata);
      // Authorization header value never echoed
      expect(serialized).not.toMatch(/bearer/i);
      // GitHub Personal Access Token formats per
      // docs.github.com/en/authentication/keeping-your-account-and-data-secure:
      //   - Classic PAT: ghp_<40 chars>
      //   - Fine-grained PAT: github_pat_<...>
      //   - OAuth Access Token: gho_<...>
      //   - User-to-server installation token: ghs_<...>
      // None of these tokens must ever appear in serialized
      // metadata.
      expect(serialized).not.toMatch(/ghp_/);
      expect(serialized).not.toMatch(/github_pat_/);
      expect(serialized).not.toMatch(/gho_/);
      expect(serialized).not.toMatch(/ghs_/);
      // Common GitHub content markers absent
      expect(serialized).not.toMatch(/title/i);
      expect(serialized).not.toMatch(/body/i);
      expect(serialized).not.toMatch(/assignee/i);
      expect(serialized).not.toMatch(/login/i);
      expect(serialized).not.toMatch(/repo_name/i);
      expect(serialized).not.toMatch(/@/);
    }
  });

  it("error message scrubs access token and authorization header even when fixture forces failure", async () => {
    const provider = new GitHubReadProvider();
    const result = await provider.invoke(
      makeInvocation(
        {
          fixture_key: "force-auth-failure",
          operation: "user",
        },
        { use_real: true },
      ),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).not.toMatch(/bearer/i);
      expect(result.message).not.toMatch(/ghp_/);
      expect(result.message).not.toMatch(/github_pat_/);
      expect(result.message).not.toMatch(/gho_/);
      expect(result.message).not.toMatch(/ghs_/);
    }
  });

  it("success result for user whitelist-asserts the exact metadata keys (never id / login / email / name)", async () => {
    const provider = new GitHubReadProvider();
    const result = await provider.invoke(
      makeInvocation({ operation: "user" }),
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

  it("success result for repos.list whitelist-asserts the exact metadata keys (never repo names / owner logins / branch names)", async () => {
    const provider = new GitHubReadProvider();
    const result = await provider.invoke(
      makeInvocation({ operation: "repos.list" }),
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
        "repos_count",
      ]);
    }
  });

  it("success result for issues.search whitelist-asserts the exact metadata keys including 3 state aggregate buckets (never issue identifiers / titles / bodies / assignee identity)", async () => {
    const provider = new GitHubReadProvider();
    const result = await provider.invoke(
      makeInvocation({ operation: "issues.search" }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      const keys = Object.keys(result.delivery_metadata);
      expect(keys.sort()).toEqual([
        "binding_id",
        "closed_completed_count",
        "closed_not_planned_count",
        "issues_count",
        "mode",
        "open_count",
        "operation",
        "provider",
      ]);
    }
  });
});
