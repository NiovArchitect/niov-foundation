// FILE: github-read.provider.ts
// PURPOSE: Section 4 C-GitHub — fifth real vendor connector.
//          GitHub read-only adapter implementing the canonical
//          ConnectorProvider interface (connector.service.ts).
//          Supports three read operations at the C-GitHub register:
//            - user          (current authenticated GitHub user;
//                             smoke probe for the binding's auth)
//            - repos.list    (repos accessible to the token;
//                             metadata-only — counts +
//                             has_next_page only; never repo
//                             names, owner logins, or branch
//                             names)
//            - issues.search (issues assigned to the authenticated
//                             caller via GET /search/issues; state
//                             aggregates only grouped by GitHub
//                             state + state_reason fields into 3
//                             buckets: open / closed_completed /
//                             closed_not_planned — never issue
//                             titles, bodies, assignee email,
//                             reporter login, or comments)
//          Uses OAuth-2.0 access tokens or Personal Access Tokens
//          (PAT / "fine-grained" tokens) carried in the
//          Authorization: Bearer header. GitHub accepts the
//          single Bearer auth shape for both PATs and OAuth
//          tokens at the REST API surface. The access token is
//          resolved via the binding.secret_ref env-var-NAME
//          pattern (ADR-0019 + ADR-0024) — the resolved VALUE
//          never leaves this provider.
//          Fixture-first: by default the provider runs in
//          deterministic fixture mode (no outbound HTTP). The
//          real GitHub API is reached only when GITHUB_USE_REAL=1
//          is set in env AND the binding's config.use_real flag
//          is true AND secret_ref resolves to a non-empty env-var
//          VALUE. Tests + CI run in fixture mode unconditionally.
//
// What this slice does NOT do:
//   - No writes (issues.create / repos.create / pulls.create /
//     etc.) — C-GitHub is strictly read-first. Write capabilities
//     forward-substrate to ≥C6 per ADR-0084.
//   - No GitHub App JWT exchange flow. C-GitHub accepts a static
//     admin-supplied access token via secret_ref (OAuth token or
//     PAT). Installation-token rotation forward-substrate to a
//     later C-slice.
//   - No webhook ingestion at the provider tier. GitHub webhook
//     signature verification rides the existing verifyInboundHmac
//     substrate (Hardening Wave B) at the receive-side; that
//     wiring is forward-substrate.
//   - No PR / commit / branch / file-content reads at C-GitHub.
//     The surface is kept to the three operations above so the
//     5000-request/hour rate budget (OAuth User) / 15000-request
//     /hour rate budget (GitHub App) stays trivially bounded.
//   - No GraphQL surface. GitHub also exposes a GraphQL v4 API;
//     C-GitHub uses REST v3 exclusively for consistency with
//     C2/C3/C4-A which are all REST. GraphQL forward-substrate.
//
// PRIVACY INVARIANT (mirrors Slack + Google + Jira + Linear providers):
//   - delivery_metadata carries counts + status code + retry
//     count + state aggregates. NEVER raw issue title /
//     body / comments / repo names / owner logins / branch
//     names / assignee email / reporter login / the access
//     token.
//   - On error, message is a short scrubbed summary; never
//     includes the resolved access token, raw response body, or
//     third-party stack traces.
// RULE 21 RESEARCH ARC (recorded in commit body + tests/unit/c-github-read-provider.test.ts):
//   - GitHub REST API v3 stable base path api.github.com
//   - OAuth 2.0 + Personal Access Token both authenticate via
//     Authorization: Bearer <token>
//   - GitHub App preferred for org-installations (per
//     docs/connector-readiness/github.json) — 15000 req/hr; OAuth
//     User token — 5000 req/hr; 403 collapses to AUTH at the
//     route boundary (token-missing scope), distinguished from
//     401 (token invalid) by message text but both surface as
//     AUTH error_class
//   - Search/issues response shape: { items: [...], incomplete_results, total_count }
//   - Issue state: "open" | "closed"; closed issues carry
//     state_reason: "completed" | "not_planned" | "reopened" |
//     null
// CONNECTS TO:
//   - connector.service.ts (ConnectorProvider interface +
//     ConnectorInvocation + ConnectorResult)
//   - apps/api/src/services/govsec/agent-abuse-guard.ts (forward
//     substrate; consumed at the Action handler tier rather than
//     inside this provider)
//   - apps/api/src/services/govsec/tenant-isolation-guard.ts
//     (forward substrate; consumed at the Action handler tier)
//   - docs/connector-readiness/github.json (catalog readiness
//     item — first_slice_recommendation: C-GitHub read-first
//     connector runtime; this provider implements that
//     recommendation)

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
const GITHUB_READ_OPERATIONS = [
  "user",
  "repos.list",
  "issues.search",
] as const;
type GitHubReadOperation = (typeof GITHUB_READ_OPERATIONS)[number];

function isGitHubReadOperation(value: unknown): value is GitHubReadOperation {
  return (
    typeof value === "string" &&
    (GITHUB_READ_OPERATIONS as ReadonlyArray<string>).includes(value)
  );
}

// ────────────────────────────────────────────────────────────────
// Fixture mode keys. Tests pass an explicit fixture_key in
// invocation.payload to assert handler behavior across the full
// ConnectorResult discriminated union without ever reaching the
// real GitHub APIs. Mirrors C2/C3/C4-A/C4-B providers + ADR-0014
// key-based dispatch.
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
// Environment gate. The real GitHub API path activates only
// when ALL of the following hold:
//   1. process.env.GITHUB_USE_REAL === "1"
//   2. binding.config.use_real === true
//   3. binding.secret_ref resolves to a non-empty env-var VALUE
// CI + unit + integration tests leave GITHUB_USE_REAL unset, so
// every invocation deterministically runs in fixture mode.
// ────────────────────────────────────────────────────────────────
function shouldUseRealGitHubApi(invocation: ConnectorInvocation): boolean {
  if (process.env["GITHUB_USE_REAL"] !== "1") return false;
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
// across runs — they reflect the fixture shape, not real GitHub
// account state.
// ────────────────────────────────────────────────────────────────
function fixtureSuccessMetadata(
  operation: GitHubReadOperation,
  invocation: ConnectorInvocation,
): Readonly<Record<string, unknown>> {
  switch (operation) {
    case "user":
      return Object.freeze({
        provider: "GitHubReadProvider",
        mode: "fixture",
        operation,
        binding_id: invocation.binding_id,
        // Boolean only — never the user id / login / email /
        // display name. The fixture shape proves the auth path
        // resolves without surfacing identity.
        authenticated: true,
        active: true,
      });
    case "repos.list":
      return Object.freeze({
        provider: "GitHubReadProvider",
        mode: "fixture",
        operation,
        binding_id: invocation.binding_id,
        // Counts only — never repo names, owner logins, or
        // branch names.
        repos_count: 7,
        has_next_page: false,
      });
    case "issues.search":
      return Object.freeze({
        provider: "GitHubReadProvider",
        mode: "fixture",
        operation,
        binding_id: invocation.binding_id,
        // State aggregates only — never issue identifiers,
        // titles, bodies, assignee email, reporter login, or
        // comments. GitHub's issue state model is binary
        // (open|closed) + state_reason (completed|not_planned|
        // reopened|null) so we surface 3 buckets:
        //   open_count                  → state="open"
        //   closed_completed_count      → state="closed" +
        //                                 state_reason="completed"
        //   closed_not_planned_count    → state="closed" +
        //                                 state_reason="not_planned"
        issues_count: 11,
        open_count: 5,
        closed_completed_count: 4,
        closed_not_planned_count: 2,
      });
  }
}

// ────────────────────────────────────────────────────────────────
// GitHubReadProvider — production class.
// ────────────────────────────────────────────────────────────────
export class GitHubReadProvider implements ConnectorProvider {
  async invoke(invocation: ConnectorInvocation): Promise<ConnectorResult> {
    // Fixture mode short-circuits BEFORE any real outbound HTTP.
    // Tests rely on this path; the only way to reach the real API
    // is the GITHUB_USE_REAL + config.use_real + secret_ref triple.
    const fixtureKey = invocation.payload["fixture_key"];
    if (isFixtureKey(fixtureKey)) {
      return this.fixtureFailureResponse(fixtureKey);
    }

    const operation = invocation.payload["operation"];
    if (!isGitHubReadOperation(operation)) {
      return {
        ok: false,
        error_class: "VALIDATION",
        message:
          "github_read: operation must be one of user / repos.list / issues.search",
      };
    }

    if (shouldUseRealGitHubApi(invocation)) {
      return this.invokeRealGitHubApi(operation, invocation);
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

  // Real GitHub APIs path. Kept deliberately small at C-GitHub:
  // exactly the three read operations, each via a single GET
  // with a Bearer token header. Response bodies are parsed only
  // for counts + state aggregates — never echoed in
  // delivery_metadata. Network errors collapse to NETWORK.
  // GitHub 401 + 403 both collapse to AUTH (401 = token invalid;
  // 403 = token-missing-scope or rate-limit-exceeded with no
  // Retry-After). 429 collapses to RATE_LIMIT. Other non-2xx
  // collapse to PROVIDER_ERROR with the status code surfaced
  // (status codes are not secret material).
  private async invokeRealGitHubApi(
    operation: GitHubReadOperation,
    invocation: ConnectorInvocation,
  ): Promise<ConnectorResult> {
    if (invocation.secret_ref === null) {
      return { ok: false, error_class: "NOT_CONFIGURED", message: "github_read: secret_ref required" };
    }
    const accessToken = process.env[invocation.secret_ref];
    if (typeof accessToken !== "string" || accessToken.length === 0) {
      return { ok: false, error_class: "NOT_CONFIGURED", message: "github_read: secret_ref env var not set" };
    }

    const url = this.buildOperationUrl(operation);
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github+json",
          // GitHub recommends pinning the API version per
          // docs.github.com/en/rest/overview/api-versions; the
          // 2022-11-28 version is the stable production version
          // at the time of this slice.
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });
      if (response.status === 401 || response.status === 403) {
        return { ok: false, error_class: "AUTH", message: `github_read: ${response.status} unauthorized` };
      }
      if (response.status === 429) {
        return { ok: false, error_class: "RATE_LIMIT", message: "github_read: 429 rate-limited" };
      }
      if (!response.ok) {
        return {
          ok: false,
          error_class: "PROVIDER_ERROR",
          message: `github_read: http ${response.status}`,
        };
      }
      const body = (await response.json()) as Record<string, unknown>;
      return {
        ok: true,
        delivery_metadata: this.realSuccessMetadata(operation, invocation, body),
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message.slice(0, 120) : "unknown error";
      // GitHub network failures + DNS + connection refused all
      // collapse here. The scrubbed message text is bounded to
      // 120 chars and never includes the access token (Node fetch
      // errors do not include the Authorization header).
      return { ok: false, error_class: "NETWORK", message: `github_read: ${msg}` };
    }
  }

  private buildOperationUrl(operation: GitHubReadOperation): string {
    switch (operation) {
      case "user":
        return "https://api.github.com/user";
      case "repos.list":
        // Authenticated user's accessible repos; sort by recent
        // activity to give operators a stable signal of which
        // repos are currently live. Per-page max 50 keeps the
        // request bounded under the 100-item REST pagination cap.
        return "https://api.github.com/user/repos?per_page=50&sort=updated";
      case "issues.search":
        // Issues assigned to the authenticated caller across all
        // accessible repos. The GitHub search API URL encodes
        // qualifiers as space-separated key:value pairs.
        // `is:issue` excludes PRs; `assignee:@me` filters by the
        // authenticated user; per_page=50 bounds the response
        // body parsing cost.
        return "https://api.github.com/search/issues?q=is%3Aissue+assignee%3A%40me&per_page=50";
    }
  }

  private realSuccessMetadata(
    operation: GitHubReadOperation,
    invocation: ConnectorInvocation,
    body: Record<string, unknown>,
  ): Readonly<Record<string, unknown>> {
    switch (operation) {
      case "user": {
        // GitHub /user response carries `id` + `login` + `name`
        // + `email` + many more fields. We extract only the
        // active-account hint (the API would return 401 if the
        // token were invalid, so a 2xx implies authenticated;
        // the `suspended_at` field is undefined for active users
        // — we surface the negation as `active`).
        const suspendedAt = body["suspended_at"];
        const active = suspendedAt === null || suspendedAt === undefined;
        return Object.freeze({
          provider: "GitHubReadProvider",
          mode: "real",
          operation,
          binding_id: invocation.binding_id,
          authenticated: true,
          active,
        });
      }
      case "repos.list": {
        const repos = Array.isArray(body) ? body : [];
        return Object.freeze({
          provider: "GitHubReadProvider",
          mode: "real",
          operation,
          binding_id: invocation.binding_id,
          repos_count: repos.length,
          // The REST `/user/repos` endpoint paginates via the
          // Link header (which fetch surfaces on
          // response.headers). At C-GitHub we omit the
          // has_next_page hint when running real-mode (a future
          // C-slice can add Link-header parsing); fixture mode
          // returns the deterministic shape above.
          has_next_page: false,
        });
      }
      case "issues.search": {
        const items = Array.isArray(body["items"]) ? body["items"] : [];
        let openCount = 0;
        let closedCompletedCount = 0;
        let closedNotPlannedCount = 0;
        for (const issue of items) {
          if (typeof issue !== "object" || issue === null) continue;
          const state = (issue as Record<string, unknown>)["state"];
          if (state === "open") {
            openCount += 1;
          } else if (state === "closed") {
            const stateReason = (issue as Record<string, unknown>)[
              "state_reason"
            ];
            if (stateReason === "completed" || stateReason === null) {
              // Pre-2022 closed issues + completed-state issues
              // both fold into closed_completed. GitHub
              // introduced state_reason in 2022; older issues
              // may carry null and were closed-as-completed
              // semantically.
              closedCompletedCount += 1;
            } else if (stateReason === "not_planned") {
              closedNotPlannedCount += 1;
            } else {
              // "reopened" maps to open at the aggregate
              // register; defensive fallback.
              openCount += 1;
            }
          }
        }
        return Object.freeze({
          provider: "GitHubReadProvider",
          mode: "real",
          operation,
          binding_id: invocation.binding_id,
          issues_count: items.length,
          open_count: openCount,
          closed_completed_count: closedCompletedCount,
          closed_not_planned_count: closedNotPlannedCount,
        });
      }
    }
  }
}
