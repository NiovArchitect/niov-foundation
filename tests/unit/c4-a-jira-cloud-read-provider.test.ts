// FILE: c4-a-jira-cloud-read-provider.test.ts
// PURPOSE: Section 4 C4-A — unit tests for JiraCloudReadProvider.
//          Verifies the registry extension + fixture-mode success
//          + fixture-mode forced-failure paths + payload validation
//          + the JIRA_USE_REAL environment gate + privacy invariant.
//          No outbound HTTP is ever made by these tests (the env
//          gate stays unset). Mirrors c3-google-workspace-read-
//          provider.test.ts verbatim where the abstraction matches.
// RULE 21 RESEARCH ARC LINEAGE:
//   - Atlassian Developer docs (developer.atlassian.com/cloud/jira/
//     platform): REST API v3 base path /rest/api/3/; OAuth 2.0
//     3LO classic scopes (read:jira-work + read:jira-user);
//     OAuth-Bearer-compatible URL pattern api.atlassian.com/ex/
//     jira/{cloudid}/...; modern JQL search POST /search/jql with
//     cursor-based pagination; points-based rate limit enforced
//     from 2026-03-02 (429 → RATE_LIMIT collapse).
//   - docs/connector-readiness/jira-linear.json (Jira Cloud
//     readiness catalog item; first_slice_recommendation matches
//     this provider's surface verbatim).
//   - Verified ground-truth in repo before drafting per RULE 12:
//     ConnectorType union shape (connector.service.ts L45-50)
//     + getConnectorTypeDefinition discriminator pattern (L128-140)
//     + getConnectorProviderAsync dynamic-import pattern (L332-353)
//     + 8 closed-vocab failure codes from
//     google-workspace-read.provider.ts.
// CONNECTS TO:
//   - apps/api/src/services/connector/jira-cloud-read.provider.ts
//   - apps/api/src/services/connector/connector.service.ts

import { describe, expect, it } from "vitest";
import { JiraCloudReadProvider } from "../../apps/api/src/services/connector/jira-cloud-read.provider";
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
    binding_id: "00000000-0000-0000-0000-000000000004",
    type: "JIRA_CLOUD_READ",
    config: Object.freeze(config),
    secret_ref: "JIRA_ACCESS_TOKEN_TEST",
    payload: Object.freeze(payload),
  };
}

describe("C4-A — JIRA_CLOUD_READ registry extension", () => {
  it("registers JIRA_CLOUD_READ in CONNECTOR_REGISTRY", () => {
    expect(CONNECTOR_REGISTRY.JIRA_CLOUD_READ).toBeDefined();
    expect(CONNECTOR_REGISTRY.JIRA_CLOUD_READ.type).toBe("JIRA_CLOUD_READ");
    expect(CONNECTOR_REGISTRY.JIRA_CLOUD_READ.secret_ref_required).toBe(true);
    expect(CONNECTOR_REGISTRY.JIRA_CLOUD_READ.transport).toBe(
      "https-bearer-token",
    );
    expect(CONNECTOR_REGISTRY.JIRA_CLOUD_READ.default_config_keys).toContain(
      "cloud_id",
    );
    expect(CONNECTOR_REGISTRY.JIRA_CLOUD_READ.default_config_keys).toContain(
      "use_real",
    );
  });

  it("resolves JIRA_CLOUD_READ via getConnectorTypeDefinition", () => {
    const def = getConnectorTypeDefinition("JIRA_CLOUD_READ");
    expect(def).not.toBeNull();
    expect(def?.display_name).toContain("Jira");
  });

  it("returns null for unknown candidate strings", () => {
    expect(getConnectorTypeDefinition("JIRA_CLOUD_WRITE")).toBeNull();
    expect(getConnectorTypeDefinition("JIRA")).toBeNull();
    expect(getConnectorTypeDefinition("JIRA_SERVER_READ")).toBeNull();
  });

  it("getConnectorProviderAsync(JIRA_CLOUD_READ) returns a JiraCloudReadProvider", async () => {
    const provider = await getConnectorProviderAsync("JIRA_CLOUD_READ");
    expect(provider).toBeInstanceOf(JiraCloudReadProvider);
  });
});

describe("C4-A — JiraCloudReadProvider fixture-mode success", () => {
  it("returns success metadata for myself", async () => {
    const provider = new JiraCloudReadProvider();
    const result = await provider.invoke(
      makeInvocation({ operation: "myself" }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.delivery_metadata["operation"]).toBe("myself");
      expect(result.delivery_metadata["mode"]).toBe("fixture");
      expect(result.delivery_metadata["authenticated"]).toBe(true);
      expect(result.delivery_metadata["active"]).toBe(true);
    }
  });

  it("returns success metadata for project.search", async () => {
    const provider = new JiraCloudReadProvider();
    const result = await provider.invoke(
      makeInvocation({ operation: "project.search" }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.delivery_metadata["operation"]).toBe("project.search");
      expect(result.delivery_metadata["projects_count"]).toBe(5);
      expect(result.delivery_metadata["is_last_page"]).toBe(true);
    }
  });

  it("returns success metadata for issue.search with status-category aggregates only", async () => {
    const provider = new JiraCloudReadProvider();
    const result = await provider.invoke(
      makeInvocation({ operation: "issue.search" }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.delivery_metadata["operation"]).toBe("issue.search");
      expect(result.delivery_metadata["issues_count"]).toBe(9);
      expect(result.delivery_metadata["to_do_count"]).toBe(3);
      expect(result.delivery_metadata["in_progress_count"]).toBe(4);
      expect(result.delivery_metadata["done_count"]).toBe(2);
    }
  });
});

describe("C4-A — JiraCloudReadProvider validation", () => {
  it("rejects an unknown operation as VALIDATION", async () => {
    const provider = new JiraCloudReadProvider();
    const result = await provider.invoke(
      makeInvocation({ operation: "issue.create" }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error_class).toBe("VALIDATION");
    }
  });

  it("rejects an empty payload as VALIDATION", async () => {
    const provider = new JiraCloudReadProvider();
    const result = await provider.invoke(makeInvocation({}));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error_class).toBe("VALIDATION");
    }
  });

  it("rejects a write-style operation as VALIDATION", async () => {
    const provider = new JiraCloudReadProvider();
    const result = await provider.invoke(
      makeInvocation({ operation: "issue.update" }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error_class).toBe("VALIDATION");
    }
  });

  it("rejects a workflow-transition operation as VALIDATION", async () => {
    const provider = new JiraCloudReadProvider();
    const result = await provider.invoke(
      makeInvocation({ operation: "issue.transition" }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error_class).toBe("VALIDATION");
    }
  });
});

describe("C4-A — JiraCloudReadProvider fixture-mode forced failures", () => {
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
      const provider = new JiraCloudReadProvider();
      const result = await provider.invoke(
        makeInvocation({
          fixture_key: fixtureKey,
          operation: "myself",
        }),
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error_class).toBe(expectedClass);
      }
    },
  );
});

describe("C4-A — JiraCloudReadProvider environment gate", () => {
  it("does NOT activate real Jira Cloud API when JIRA_USE_REAL is unset", async () => {
    expect(process.env["JIRA_USE_REAL"]).toBeUndefined();
    const provider = new JiraCloudReadProvider();
    const result = await provider.invoke(
      makeInvocation(
        { operation: "myself" },
        { use_real: true, cloud_id: "fake-cloud-id" },
      ),
    );
    // Even with config.use_real=true + cloud_id, the env gate
    // prevents real API access; fixture-mode metadata is returned.
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.delivery_metadata["mode"]).toBe("fixture");
    }
  });

  it("does NOT activate real Jira Cloud API when config.use_real is false", async () => {
    const provider = new JiraCloudReadProvider();
    const originalEnv = process.env["JIRA_USE_REAL"];
    try {
      process.env["JIRA_USE_REAL"] = "1";
      const result = await provider.invoke(
        makeInvocation(
          { operation: "project.search" },
          { use_real: false, cloud_id: "fake-cloud-id" },
        ),
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.delivery_metadata["mode"]).toBe("fixture");
      }
    } finally {
      if (originalEnv === undefined) {
        delete process.env["JIRA_USE_REAL"];
      } else {
        process.env["JIRA_USE_REAL"] = originalEnv;
      }
    }
  });

  it("does NOT activate real Jira Cloud API when secret_ref env var is missing", async () => {
    const provider = new JiraCloudReadProvider();
    const originalUseReal = process.env["JIRA_USE_REAL"];
    try {
      process.env["JIRA_USE_REAL"] = "1";
      // JIRA_ACCESS_TOKEN_MISSING is not set in env, so the
      // triple gate fails and fixture mode runs.
      const invocation: ConnectorInvocation = {
        binding_id: "00000000-0000-0000-0000-000000000004",
        type: "JIRA_CLOUD_READ",
        config: Object.freeze({ use_real: true, cloud_id: "fake-cloud-id" }),
        secret_ref: "JIRA_ACCESS_TOKEN_MISSING_DO_NOT_SET",
        payload: Object.freeze({ operation: "issue.search" }),
      };
      const result = await provider.invoke(invocation);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.delivery_metadata["mode"]).toBe("fixture");
      }
    } finally {
      if (originalUseReal === undefined) {
        delete process.env["JIRA_USE_REAL"];
      } else {
        process.env["JIRA_USE_REAL"] = originalUseReal;
      }
    }
  });
});

describe("C4-A — JiraCloudReadProvider privacy invariant", () => {
  it("delivery_metadata never carries access token, raw issue content, project keys, summaries, or assignee identity", async () => {
    const provider = new JiraCloudReadProvider();
    const result = await provider.invoke(
      makeInvocation({ operation: "issue.search" }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      const serialized = JSON.stringify(result.delivery_metadata);
      // Authorization header value never echoed
      expect(serialized).not.toMatch(/bearer/i);
      // Atlassian PAT format never echoed
      expect(serialized).not.toMatch(/ATATT3xFfGF0/);
      // Common Jira content markers absent
      expect(serialized).not.toMatch(/summary/i);
      expect(serialized).not.toMatch(/description/i);
      expect(serialized).not.toMatch(/assignee/i);
      expect(serialized).not.toMatch(/reporter/i);
      expect(serialized).not.toMatch(/comment/i);
      expect(serialized).not.toMatch(/accountId/i);
      expect(serialized).not.toMatch(/@/);
      // Issue keys (TEAM-NNN format) absent
      expect(serialized).not.toMatch(/[A-Z]{2,10}-\d+/);
    }
  });

  it("error message scrubs access token and authorization header even when fixture forces failure", async () => {
    const provider = new JiraCloudReadProvider();
    const result = await provider.invoke(
      makeInvocation(
        {
          fixture_key: "force-auth-failure",
          operation: "myself",
        },
        { use_real: true, cloud_id: "fake-cloud-id" },
      ),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).not.toMatch(/bearer/i);
      expect(result.message).not.toMatch(/ATATT3xFfGF0/);
    }
  });

  it("success result for myself whitelist-asserts the exact metadata keys (never accountId / email / display name)", async () => {
    const provider = new JiraCloudReadProvider();
    const result = await provider.invoke(
      makeInvocation({ operation: "myself" }),
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

  it("success result for project.search whitelist-asserts the exact metadata keys (never project keys / names)", async () => {
    const provider = new JiraCloudReadProvider();
    const result = await provider.invoke(
      makeInvocation({ operation: "project.search" }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      const keys = Object.keys(result.delivery_metadata);
      expect(keys.sort()).toEqual([
        "binding_id",
        "is_last_page",
        "mode",
        "operation",
        "projects_count",
        "provider",
      ]);
    }
  });

  it("success result for issue.search whitelist-asserts the exact metadata keys (never issue keys / summaries / descriptions / assignee identity)", async () => {
    const provider = new JiraCloudReadProvider();
    const result = await provider.invoke(
      makeInvocation({ operation: "issue.search" }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      const keys = Object.keys(result.delivery_metadata);
      expect(keys.sort()).toEqual([
        "binding_id",
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
