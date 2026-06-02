// FILE: jira-cloud-read.provider.ts
// PURPOSE: Section 4 C4-A — third real vendor connector. Jira Cloud
//          read-only adapter implementing the canonical
//          ConnectorProvider interface (connector.service.ts).
//          Supports three read operations at the C4-A register:
//            - myself (current authenticated Jira Cloud user; smoke
//              probe for the binding's auth + cloud_id)
//            - project.search (projects the authenticated user can
//              see; metadata-only — id + key + projectTypeKey)
//            - issue.search (JQL-bounded issue search; counts +
//              status-category aggregates only — no summaries, no
//              descriptions, no assignee identity)
//          Uses OAuth 2.0 3LO access tokens carried in the
//          Authorization: Bearer header. The access token is
//          resolved via the binding.secret_ref env-var-NAME pattern
//          (ADR-0019 + ADR-0024) — the resolved VALUE never leaves
//          this provider. Fixture-first: by default the provider
//          runs in deterministic fixture mode (no outbound HTTP).
//          The real Jira Cloud API is reached only when
//          JIRA_USE_REAL=1 is set in env AND the binding's
//          config.use_real flag is true AND secret_ref resolves to
//          a non-empty env-var VALUE. Tests + CI run in fixture
//          mode unconditionally.
//
// What this slice does NOT do:
//   - No writes (issue.create / issue.update / comment.add /
//     transitions / etc.) — C4-A is strictly read-first. Write
//     capabilities forward-substrate to ≥C6 per ADR-0084 9-slice
//     ladder. Risky workflow / transition / bulk writes per
//     docs/connector-readiness/jira-linear.json dual_control list
//     stay locked out at C4-A.
//   - No OAuth refresh-token flow. C4-A accepts a static admin-
//     supplied access token via secret_ref. Refresh-token
//     rotation forward-substrate to a later C-slice (composes
//     against GOVSEC.5 break-glass + ADR-0019 cryptographic
//     posture).
//   - No webhook ingestion at the provider tier. Jira webhook
//     signature verification rides the existing verifyInboundHmac
//     substrate (Hardening Wave B) at the receive-side; that
//     wiring is forward-substrate to a later C-slice.
//   - No agile-board / sprint / worklog / changelog reads. C4-A
//     keeps the surface to the three operations above so the
//     points-based rate budget (Jira Cloud points enforcement
//     active from March 2026 per Atlassian Developer docs) stays
//     trivially bounded.
//   - No issue.get for arbitrary issue keys. The catalog's
//     no-leak rule "issue content / description / comments never
//     traverse responses outside the wallet's scope" is honored
//     by structurally not implementing that operation here.
//
// PRIVACY INVARIANT (mirrors SlackReadProvider + GoogleWorkspaceReadProvider
// + OutboundWebhookProvider):
//   - delivery_metadata carries counts + status code + retry
//     count + status-category aggregates. NEVER raw issue
//     summary / description / comments / assignee identity /
//     reporter identity / project keys (only counts) / project
//     names / issue keys / user emails / the access token.
//   - On error, message is a short scrubbed summary; never
//     includes the resolved access token, raw response body, or
//     third-party stack traces.
// RULE 21 RESEARCH ARC (recorded in commit body + tests/unit/c4-a-jira-cloud-read-provider.test.ts):
//   - Jira Cloud REST API v3 stable base path `/rest/api/3/`
//   - OAuth 2.0 3LO classic scopes (read:jira-work + read:jira-user)
//   - Cloud-id resolution via api.atlassian.com/oauth/token/
//     accessible-resources (forward-substrate; not invoked at the
//     fixture-first C4-A boundary)
//   - Points-based rate-limit enforcement active from 2026-03-02;
//     429 collapses to RATE_LIMIT error_class with no points
//     surfacing in fixture-mode delivery_metadata to avoid
//     speculative-cost leakage
// CONNECTS TO:
//   - connector.service.ts (ConnectorProvider interface +
//     ConnectorInvocation + ConnectorResult)
//   - apps/api/src/services/govsec/agent-abuse-guard.ts (forward
//     substrate; consumed at the Action handler tier rather than
//     inside this provider)
//   - apps/api/src/services/govsec/tenant-isolation-guard.ts
//     (forward substrate; consumed at the Action handler tier)
//   - docs/connector-readiness/jira-linear.json (catalog
//     readiness item — first_slice_recommendation: C4-A Jira
//     Cloud read-first connector runtime; this provider
//     implements that recommendation)

import type {
  ConnectorInvocation,
  ConnectorProvider,
  ConnectorResult,
} from "./connector.service.js";

// ────────────────────────────────────────────────────────────────
// Closed-vocab operation labels. The Action runtime payload
// validator + the invocation_payload schema carry one of these.
// Anything else returns VALIDATION at the provider boundary.
// ────────────────────────────────────────────────────────────────
const JIRA_READ_OPERATIONS = [
  "myself",
  "project.search",
  "issue.search",
] as const;
type JiraReadOperation = (typeof JIRA_READ_OPERATIONS)[number];

function isJiraReadOperation(value: unknown): value is JiraReadOperation {
  return (
    typeof value === "string" &&
    (JIRA_READ_OPERATIONS as ReadonlyArray<string>).includes(value)
  );
}

// ────────────────────────────────────────────────────────────────
// Fixture mode keys. Tests pass an explicit fixture_key in
// invocation.payload to assert handler behavior across the full
// ConnectorResult discriminated union without ever reaching the
// real Jira Cloud APIs. Mirrors SlackReadProvider +
// GoogleWorkspaceReadProvider + ADR-0014 key-based dispatch.
// ────────────────────────────────────────────────────────────────
const FIXTURE_KEYS = [
  "force-auth-failure",
  "force-network-failure",
  "force-timeout",
  "force-rate-limit",
  "force-provider-error",
  "force-validation-failure",
  "force-not-configured",
  "force-disabled",
] as const;
type FixtureKey = (typeof FIXTURE_KEYS)[number];

function isFixtureKey(value: unknown): value is FixtureKey {
  return (
    typeof value === "string" &&
    (FIXTURE_KEYS as ReadonlyArray<string>).includes(value)
  );
}

// ────────────────────────────────────────────────────────────────
// Environment gate. The real Jira Cloud API path activates only
// when ALL of the following hold:
//   1. process.env.JIRA_USE_REAL === "1"
//   2. binding.config.use_real === true
//   3. binding.secret_ref resolves to a non-empty env-var VALUE
// CI + unit + integration tests leave JIRA_USE_REAL unset, so
// every invocation deterministically runs in fixture mode.
// ────────────────────────────────────────────────────────────────
function shouldUseRealJiraApi(invocation: ConnectorInvocation): boolean {
  if (process.env["JIRA_USE_REAL"] !== "1") return false;
  const useReal = invocation.config["use_real"];
  if (useReal !== true) return false;
  if (invocation.secret_ref === null) return false;
  const resolved = process.env[invocation.secret_ref];
  if (typeof resolved !== "string" || resolved.length === 0) return false;
  return true;
}

// ────────────────────────────────────────────────────────────────
// Deterministic fixture-mode delivery_metadata per operation.
// Each operation returns counts + a non-empty marker the caller
// can assert against in tests. Counts are illustrative and stable
// across runs — they reflect the fixture shape, not real Jira
// Cloud tenant state.
// ────────────────────────────────────────────────────────────────
function fixtureSuccessMetadata(
  operation: JiraReadOperation,
  invocation: ConnectorInvocation,
): Readonly<Record<string, unknown>> {
  switch (operation) {
    case "myself":
      return Object.freeze({
        provider: "JiraCloudReadProvider",
        mode: "fixture",
        operation,
        binding_id: invocation.binding_id,
        // Boolean only — never the accountId / email / display name.
        // The fixture shape proves the auth + cloud-id smoke path
        // resolves without surfacing tenant identity.
        authenticated: true,
        active: true,
      });
    case "project.search":
      return Object.freeze({
        provider: "JiraCloudReadProvider",
        mode: "fixture",
        operation,
        binding_id: invocation.binding_id,
        // Counts only — never project keys or names.
        projects_count: 5,
        is_last_page: true,
      });
    case "issue.search":
      return Object.freeze({
        provider: "JiraCloudReadProvider",
        mode: "fixture",
        operation,
        binding_id: invocation.binding_id,
        // Counts + status-category aggregates only — never issue
        // keys, summaries, descriptions, assignee identity, or
        // comments.
        issues_count: 9,
        to_do_count: 3,
        in_progress_count: 4,
        done_count: 2,
      });
  }
}

// ────────────────────────────────────────────────────────────────
// JiraCloudReadProvider — production class.
// ────────────────────────────────────────────────────────────────
export class JiraCloudReadProvider implements ConnectorProvider {
  async invoke(invocation: ConnectorInvocation): Promise<ConnectorResult> {
    // Fixture mode short-circuits BEFORE any real outbound HTTP.
    // Tests rely on this path; the only way to reach the real API
    // is the JIRA_USE_REAL + config.use_real + secret_ref triple.
    const fixtureKey = invocation.payload["fixture_key"];
    if (isFixtureKey(fixtureKey)) {
      return this.fixtureFailureResponse(fixtureKey);
    }

    const operation = invocation.payload["operation"];
    if (!isJiraReadOperation(operation)) {
      return {
        ok: false,
        error_class: "VALIDATION",
        message:
          "jira_cloud_read: operation must be one of myself / project.search / issue.search",
      };
    }

    if (shouldUseRealJiraApi(invocation)) {
      return this.invokeRealJiraApi(operation, invocation);
    }

    return {
      ok: true,
      delivery_metadata: fixtureSuccessMetadata(operation, invocation),
    };
  }

  private fixtureFailureResponse(fixtureKey: FixtureKey): ConnectorResult {
    switch (fixtureKey) {
      case "force-auth-failure":
        return { ok: false, error_class: "AUTH", message: "fixture: forced AUTH failure" };
      case "force-network-failure":
        return { ok: false, error_class: "NETWORK", message: "fixture: forced NETWORK failure" };
      case "force-timeout":
        return { ok: false, error_class: "TIMEOUT", message: "fixture: forced TIMEOUT failure" };
      case "force-rate-limit":
        return { ok: false, error_class: "RATE_LIMIT", message: "fixture: forced RATE_LIMIT failure" };
      case "force-provider-error":
        return { ok: false, error_class: "PROVIDER_ERROR", message: "fixture: forced PROVIDER_ERROR failure" };
      case "force-validation-failure":
        return { ok: false, error_class: "VALIDATION", message: "fixture: forced VALIDATION failure" };
      case "force-not-configured":
        return { ok: false, error_class: "NOT_CONFIGURED", message: "fixture: forced NOT_CONFIGURED failure" };
      case "force-disabled":
        return { ok: false, error_class: "DISABLED", message: "fixture: forced DISABLED failure" };
    }
  }

  // Real Jira Cloud APIs path. Kept deliberately small at C4-A:
  // exactly the three read operations, each via a single HTTP
  // call with a Bearer token header. Response bodies are parsed
  // only for counts + status-category aggregates — never echoed
  // in delivery_metadata. Network errors collapse to NETWORK.
  // Jira 401 collapses to AUTH; 429 collapses to RATE_LIMIT
  // (Jira Cloud points-based enforcement active from 2026-03-02);
  // other non-2xx collapse to PROVIDER_ERROR with the status
  // code surfaced (status codes are not secret material).
  //
  // Cloud-id resolution: the binding's config.cloud_id (UUID
  // string from api.atlassian.com/oauth/token/accessible-resources
  // at OAuth install time) selects the tenant. The provider does
  // NOT itself call accessible-resources; that call is forward-
  // substrate at the OAuth-install path.
  private async invokeRealJiraApi(
    operation: JiraReadOperation,
    invocation: ConnectorInvocation,
  ): Promise<ConnectorResult> {
    if (invocation.secret_ref === null) {
      return { ok: false, error_class: "NOT_CONFIGURED", message: "jira_cloud_read: secret_ref required" };
    }
    const accessToken = process.env[invocation.secret_ref];
    if (typeof accessToken !== "string" || accessToken.length === 0) {
      return { ok: false, error_class: "NOT_CONFIGURED", message: "jira_cloud_read: secret_ref env var not set" };
    }
    const cloudId = invocation.config["cloud_id"];
    if (typeof cloudId !== "string" || cloudId.length === 0) {
      return {
        ok: false,
        error_class: "NOT_CONFIGURED",
        message: "jira_cloud_read: config.cloud_id required",
      };
    }

    const url = this.buildOperationUrl(operation, cloudId, invocation);
    const method = operation === "issue.search" ? "POST" : "GET";
    try {
      const init: RequestInit = {
        method,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
          ...(method === "POST"
            ? { "Content-Type": "application/json" }
            : {}),
        },
      };
      if (method === "POST") {
        init.body = JSON.stringify(this.buildIssueSearchBody(invocation));
      }
      const response = await fetch(url, init);
      if (response.status === 401) {
        return { ok: false, error_class: "AUTH", message: "jira_cloud_read: 401 unauthorized" };
      }
      if (response.status === 429) {
        return { ok: false, error_class: "RATE_LIMIT", message: "jira_cloud_read: 429 rate-limited" };
      }
      if (!response.ok) {
        return {
          ok: false,
          error_class: "PROVIDER_ERROR",
          message: `jira_cloud_read: http ${response.status}`,
        };
      }
      const body = (await response.json()) as Record<string, unknown>;
      return {
        ok: true,
        delivery_metadata: this.realSuccessMetadata(operation, invocation, body),
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message.slice(0, 120) : "unknown error";
      // Jira network failures + DNS + connection refused all
      // collapse here. The scrubbed message text is bounded to
      // 120 chars and never includes the access token (Node fetch
      // errors do not include the Authorization header).
      return { ok: false, error_class: "NETWORK", message: `jira_cloud_read: ${msg}` };
    }
  }

  private buildOperationUrl(
    operation: JiraReadOperation,
    cloudId: string,
    invocation: ConnectorInvocation,
  ): string {
    // OAuth 2.0 3LO classic apps reach Jira Cloud via
    // api.atlassian.com/ex/jira/{cloudid}/... per Atlassian
    // developer docs. Direct site-bound URLs (the customer's
    // own .atlassian.net subdomain) require Basic auth (email
    // + api token) rather than OAuth Bearer, so C4-A pins to
    // the OAuth-Bearer-compatible path exclusively.
    const base = `https://api.atlassian.com/ex/jira/${encodeURIComponent(cloudId)}/rest/api/3`;
    switch (operation) {
      case "myself":
        return `${base}/myself`;
      case "project.search":
        // Project paged search; metadata-only — the fields list
        // is what comes back by default + we discard names at
        // the realSuccessMetadata projection register.
        return `${base}/project/search?startAt=0&maxResults=50`;
      case "issue.search": {
        // Modern Jira Cloud uses POST /search/jql for cursor-
        // based JQL search. The JQL string is admin-supplied
        // via invocation.payload.jql (defaults to a safe
        // empty-projects clause if absent).
        void invocation;
        return `${base}/search/jql`;
      }
    }
  }

  private buildIssueSearchBody(
    invocation: ConnectorInvocation,
  ): Record<string, unknown> {
    // The JQL is admin-supplied per call; the provider does NOT
    // generate JQL. A safe default of "ORDER BY updated DESC"
    // restricts to recently-updated issues across whatever
    // projects the access token's scopes can see. The fields
    // list is restricted to status-category-only — NO summary,
    // NO description, NO assignee, NO reporter.
    const jql = invocation.payload["jql"];
    return {
      jql: typeof jql === "string" && jql.length > 0 ? jql : "ORDER BY updated DESC",
      fields: ["status"],
      maxResults: 50,
    };
  }

  private realSuccessMetadata(
    operation: JiraReadOperation,
    invocation: ConnectorInvocation,
    body: Record<string, unknown>,
  ): Readonly<Record<string, unknown>> {
    switch (operation) {
      case "myself": {
        const active = typeof body["active"] === "boolean" ? body["active"] : false;
        return Object.freeze({
          provider: "JiraCloudReadProvider",
          mode: "real",
          operation,
          binding_id: invocation.binding_id,
          authenticated: true,
          active,
        });
      }
      case "project.search": {
        const values = Array.isArray(body["values"]) ? body["values"] : [];
        const isLast = typeof body["isLast"] === "boolean" ? body["isLast"] : true;
        return Object.freeze({
          provider: "JiraCloudReadProvider",
          mode: "real",
          operation,
          binding_id: invocation.binding_id,
          projects_count: values.length,
          is_last_page: isLast,
        });
      }
      case "issue.search": {
        const issues = Array.isArray(body["issues"]) ? body["issues"] : [];
        let toDoCount = 0;
        let inProgressCount = 0;
        let doneCount = 0;
        for (const issue of issues) {
          if (typeof issue !== "object" || issue === null) continue;
          const fields = (issue as Record<string, unknown>)["fields"];
          if (typeof fields !== "object" || fields === null) continue;
          const status = (fields as Record<string, unknown>)["status"];
          if (typeof status !== "object" || status === null) continue;
          const category = (status as Record<string, unknown>)["statusCategory"];
          if (typeof category !== "object" || category === null) continue;
          const key = (category as Record<string, unknown>)["key"];
          if (key === "new") toDoCount += 1;
          else if (key === "indeterminate") inProgressCount += 1;
          else if (key === "done") doneCount += 1;
        }
        return Object.freeze({
          provider: "JiraCloudReadProvider",
          mode: "real",
          operation,
          binding_id: invocation.binding_id,
          issues_count: issues.length,
          to_do_count: toDoCount,
          in_progress_count: inProgressCount,
          done_count: doneCount,
        });
      }
    }
  }
}
