// FILE: linear-read.provider.ts
// PURPOSE: Section 4 C4-B — fourth real vendor connector. Linear
//          read-only adapter implementing the canonical
//          ConnectorProvider interface (connector.service.ts).
//          Closes the Project / Engineering family at 2/2
//          connectors alongside C4-A Jira Cloud.
//          Supports three read operations at the C4-B register:
//            - viewer        (current authenticated Linear user;
//                             smoke probe for the binding's auth)
//            - teams.list    (workspace teams metadata; counts +
//                             hasNextPage only — never team keys
//                             or names)
//            - issues.list   (issues metadata aggregates; counts
//                             grouped by WorkflowState.type into
//                             4 buckets: to_do / in_progress /
//                             done / canceled — never issue
//                             titles, descriptions, assignee
//                             identity, reporter identity, or
//                             comments)
//          Uses OAuth 2.0 access tokens carried in the
//          Authorization: Bearer header. Linear's GraphQL endpoint
//          is a single POST against https://api.linear.app/graphql
//          (unlike Jira Cloud's per-operation REST URLs). The
//          access token is resolved via the binding.secret_ref
//          env-var-NAME pattern (ADR-0019 + ADR-0024) — the
//          resolved VALUE never leaves this provider.
//          Fixture-first: by default the provider runs in
//          deterministic fixture mode (no outbound HTTP). The
//          real Linear API is reached only when LINEAR_USE_REAL=1
//          is set in env AND the binding's config.use_real flag
//          is true AND secret_ref resolves to a non-empty env-var
//          VALUE. Tests + CI run in fixture mode unconditionally.
//
// What this slice does NOT do:
//   - No writes (issueCreate / commentCreate / issueUpdate /
//     state transitions / etc.) — C4-B is strictly read-first.
//     Write capabilities forward-substrate to ≥C6 per ADR-0084
//     9-slice ladder. Linear's risky_write_actions list (issue
//     state transitions + project/cycle management + bulk
//     writes) stays locked out at C4-B.
//   - No OAuth refresh-token flow. C4-B accepts a static admin-
//     supplied access token via secret_ref. Refresh-token
//     rotation forward-substrate to a later C-slice.
//   - No personal-API-key fallback path. Personal API keys are
//     a lower-trust per-user automation pattern per Linear docs;
//     C4-B prefers OAuth 2.0 to keep the binding auditable at
//     the workspace tier rather than the per-user tier.
//   - No webhook ingestion at the provider tier. Linear webhook
//     signature verification rides the existing verifyInboundHmac
//     substrate (Hardening Wave B) at the receive-side; that
//     wiring is forward-substrate to a later C-slice.
//   - No cycle / roadmap / label / project reads at C4-B. The
//     surface is kept to the three operations above so the
//     GraphQL complexity budget (~1500 complexity points per
//     minute per OAuth client per Linear docs) stays trivially
//     bounded.
//   - No issue.get for arbitrary issue keys. The catalog's
//     no-leak rule "issue content / comments never traverse
//     responses outside the wallet's scope" is honored by
//     structurally not implementing that operation here.
//   - No Linear MCP server adoption at C4-B. The catalog notes
//     Linear has an official MCP server; substrate-honest
//     evaluation deferred — direct GraphQL keeps the same
//     pattern as Jira/Slack/Google and lets us reuse the
//     fixture-first defensive triple gate without introducing
//     a second dispatch path.
//
// PRIVACY INVARIANT (mirrors Slack + Google + Jira providers):
//   - delivery_metadata carries counts + status code + retry
//     count + state-type aggregates. NEVER raw issue
//     title / description / comments / assignee identity /
//     reporter identity / team keys / team names / user
//     emails / the access token.
//   - On error, message is a short scrubbed summary; never
//     includes the resolved access token, raw response body, or
//     third-party stack traces.
// RULE 21 RESEARCH ARC (recorded in commit body + tests/unit/c4-b-linear-read-provider.test.ts):
//   - Linear GraphQL API stable endpoint https://api.linear.app/graphql
//   - OAuth 2.0 authorization code flow with `read` scope
//     sufficient for the C4-B surface
//   - Authorization: Bearer <access_token> for OAuth tokens
//     (personal API keys use a different header shape and are
//     intentionally NOT supported at C4-B)
//   - GraphQL complexity-based rate limit (~1500 complexity per
//     minute per OAuth client); 429 collapses to RATE_LIMIT
//   - GraphQL response shape: { data: {...}, errors?: [...] };
//     presence of errors[] forces PROVIDER_ERROR even when
//     HTTP 200 succeeds (per GraphQL convention)
//   - WorkflowState.type enum: triage / backlog / unstarted /
//     started / completed / canceled — these are the canonical
//     state-category labels Linear surfaces, mapped at C4-B to
//     4 aggregate buckets (to_do = triage+backlog+unstarted;
//     in_progress = started; done = completed; canceled =
//     canceled)
// CONNECTS TO:
//   - connector.service.ts (ConnectorProvider interface +
//     ConnectorInvocation + ConnectorResult)
//   - apps/api/src/services/govsec/agent-abuse-guard.ts (forward
//     substrate; consumed at the Action handler tier rather than
//     inside this provider)
//   - apps/api/src/services/govsec/tenant-isolation-guard.ts
//     (forward substrate; consumed at the Action handler tier)
//   - docs/connector-readiness/jira-linear.json (catalog
//     readiness item — first_slice_recommendation: C4-B Linear
//     read-first connector runtime; this provider implements
//     that recommendation; closes Project/Engineering at 2/2)

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
const LINEAR_READ_OPERATIONS = [
  "viewer",
  "teams.list",
  "issues.list",
] as const;
type LinearReadOperation = (typeof LINEAR_READ_OPERATIONS)[number];

function isLinearReadOperation(value: unknown): value is LinearReadOperation {
  return (
    typeof value === "string" &&
    (LINEAR_READ_OPERATIONS as ReadonlyArray<string>).includes(value)
  );
}

// ────────────────────────────────────────────────────────────────
// Fixture mode keys. Tests pass an explicit fixture_key in
// invocation.payload to assert handler behavior across the full
// ConnectorResult discriminated union without ever reaching the
// real Linear APIs. Mirrors Slack + Google + Jira providers +
// ADR-0014 key-based dispatch.
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
// Environment gate. The real Linear API path activates only
// when ALL of the following hold:
//   1. process.env.LINEAR_USE_REAL === "1"
//   2. binding.config.use_real === true
//   3. binding.secret_ref resolves to a non-empty env-var VALUE
// CI + unit + integration tests leave LINEAR_USE_REAL unset, so
// every invocation deterministically runs in fixture mode.
// ────────────────────────────────────────────────────────────────
function shouldUseRealLinearApi(invocation: ConnectorInvocation): boolean {
  if (process.env["LINEAR_USE_REAL"] !== "1") return false;
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
// across runs — they reflect the fixture shape, not real Linear
// workspace state.
// ────────────────────────────────────────────────────────────────
function fixtureSuccessMetadata(
  operation: LinearReadOperation,
  invocation: ConnectorInvocation,
): Readonly<Record<string, unknown>> {
  switch (operation) {
    case "viewer":
      return Object.freeze({
        provider: "LinearReadProvider",
        mode: "fixture",
        operation,
        binding_id: invocation.binding_id,
        // Boolean only — never the Linear user id / name /
        // email / display name. The fixture shape proves the
        // OAuth smoke path resolves without surfacing identity.
        authenticated: true,
        active: true,
      });
    case "teams.list":
      return Object.freeze({
        provider: "LinearReadProvider",
        mode: "fixture",
        operation,
        binding_id: invocation.binding_id,
        // Counts only — never team keys (TEAM-prefix) or names.
        teams_count: 4,
        has_next_page: false,
      });
    case "issues.list":
      return Object.freeze({
        provider: "LinearReadProvider",
        mode: "fixture",
        operation,
        binding_id: invocation.binding_id,
        // State-type aggregates only — never issue identifiers
        // (TEAM-NNN), titles, descriptions, assignee identity,
        // reporter identity, or comments.
        issues_count: 12,
        to_do_count: 5,
        in_progress_count: 4,
        done_count: 2,
        canceled_count: 1,
      });
  }
}

// ────────────────────────────────────────────────────────────────
// GraphQL query strings. Pinned at module load (no template
// interpolation against user input). The fields list is the
// audit boundary — only state.type is requested for issues, only
// id is requested for teams. Adding fields here would widen the
// privacy surface and is gated by ADR review.
// ────────────────────────────────────────────────────────────────
const VIEWER_QUERY = `query Viewer { viewer { id active } }`;
const TEAMS_QUERY = `query Teams { teams(first: 50) { nodes { id } pageInfo { hasNextPage } } }`;
const ISSUES_QUERY = `query Issues { issues(first: 50) { nodes { id state { type } } } }`;

// ────────────────────────────────────────────────────────────────
// LinearReadProvider — production class.
// ────────────────────────────────────────────────────────────────
export class LinearReadProvider implements ConnectorProvider {
  async invoke(invocation: ConnectorInvocation): Promise<ConnectorResult> {
    // Fixture mode short-circuits BEFORE any real outbound HTTP.
    // Tests rely on this path; the only way to reach the real API
    // is the LINEAR_USE_REAL + config.use_real + secret_ref triple.
    const fixtureKey = invocation.payload["fixture_key"];
    if (isFixtureKey(fixtureKey)) {
      return this.fixtureFailureResponse(fixtureKey);
    }

    const operation = invocation.payload["operation"];
    if (!isLinearReadOperation(operation)) {
      return {
        ok: false,
        error_class: "VALIDATION",
        message:
          "linear_read: operation must be one of viewer / teams.list / issues.list",
      };
    }

    if (shouldUseRealLinearApi(invocation)) {
      return this.invokeRealLinearApi(operation, invocation);
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

  // Real Linear GraphQL API path. Kept deliberately small at
  // C4-B: exactly the three read operations, each via a single
  // POST to /graphql with a Bearer token header + GraphQL query
  // body. Response bodies are parsed only for counts + state-
  // type aggregates — never echoed in delivery_metadata.
  //
  // GraphQL convention: HTTP 200 may still indicate failure via
  // a non-empty `errors` array in the response body. The provider
  // collapses that case to PROVIDER_ERROR before parsing data.
  // HTTP 401 collapses to AUTH; HTTP 429 collapses to RATE_LIMIT.
  // Other non-2xx collapse to PROVIDER_ERROR with the status
  // code surfaced (status codes are not secret material).
  private async invokeRealLinearApi(
    operation: LinearReadOperation,
    invocation: ConnectorInvocation,
  ): Promise<ConnectorResult> {
    if (invocation.secret_ref === null) {
      return { ok: false, error_class: "NOT_CONFIGURED", message: "linear_read: secret_ref required" };
    }
    const accessToken = process.env[invocation.secret_ref];
    if (typeof accessToken !== "string" || accessToken.length === 0) {
      return { ok: false, error_class: "NOT_CONFIGURED", message: "linear_read: secret_ref env var not set" };
    }

    const url = "https://api.linear.app/graphql";
    const query = this.queryForOperation(operation);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ query }),
      });
      if (response.status === 401) {
        return { ok: false, error_class: "AUTH", message: "linear_read: 401 unauthorized" };
      }
      if (response.status === 429) {
        return { ok: false, error_class: "RATE_LIMIT", message: "linear_read: 429 rate-limited" };
      }
      if (!response.ok) {
        return {
          ok: false,
          error_class: "PROVIDER_ERROR",
          message: `linear_read: http ${response.status}`,
        };
      }
      const body = (await response.json()) as Record<string, unknown>;
      // GraphQL: a 200 OK with errors[] is still a failure.
      if (Array.isArray(body["errors"]) && body["errors"].length > 0) {
        return {
          ok: false,
          error_class: "PROVIDER_ERROR",
          message: "linear_read: graphql errors",
        };
      }
      const data =
        typeof body["data"] === "object" && body["data"] !== null
          ? (body["data"] as Record<string, unknown>)
          : {};
      return {
        ok: true,
        delivery_metadata: this.realSuccessMetadata(operation, invocation, data),
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message.slice(0, 120) : "unknown error";
      // Linear network failures + DNS + connection refused all
      // collapse here. The scrubbed message text is bounded to
      // 120 chars and never includes the access token (Node fetch
      // errors do not include the Authorization header).
      return { ok: false, error_class: "NETWORK", message: `linear_read: ${msg}` };
    }
  }

  private queryForOperation(operation: LinearReadOperation): string {
    switch (operation) {
      case "viewer":
        return VIEWER_QUERY;
      case "teams.list":
        return TEAMS_QUERY;
      case "issues.list":
        return ISSUES_QUERY;
    }
  }

  private realSuccessMetadata(
    operation: LinearReadOperation,
    invocation: ConnectorInvocation,
    data: Record<string, unknown>,
  ): Readonly<Record<string, unknown>> {
    switch (operation) {
      case "viewer": {
        const viewer =
          typeof data["viewer"] === "object" && data["viewer"] !== null
            ? (data["viewer"] as Record<string, unknown>)
            : {};
        const active = typeof viewer["active"] === "boolean" ? viewer["active"] : false;
        return Object.freeze({
          provider: "LinearReadProvider",
          mode: "real",
          operation,
          binding_id: invocation.binding_id,
          authenticated: true,
          active,
        });
      }
      case "teams.list": {
        const teams =
          typeof data["teams"] === "object" && data["teams"] !== null
            ? (data["teams"] as Record<string, unknown>)
            : {};
        const nodes = Array.isArray(teams["nodes"]) ? teams["nodes"] : [];
        const pageInfo =
          typeof teams["pageInfo"] === "object" && teams["pageInfo"] !== null
            ? (teams["pageInfo"] as Record<string, unknown>)
            : {};
        const hasNextPage =
          typeof pageInfo["hasNextPage"] === "boolean"
            ? pageInfo["hasNextPage"]
            : false;
        return Object.freeze({
          provider: "LinearReadProvider",
          mode: "real",
          operation,
          binding_id: invocation.binding_id,
          teams_count: nodes.length,
          has_next_page: hasNextPage,
        });
      }
      case "issues.list": {
        const issuesRoot =
          typeof data["issues"] === "object" && data["issues"] !== null
            ? (data["issues"] as Record<string, unknown>)
            : {};
        const nodes = Array.isArray(issuesRoot["nodes"]) ? issuesRoot["nodes"] : [];
        let toDoCount = 0;
        let inProgressCount = 0;
        let doneCount = 0;
        let canceledCount = 0;
        for (const issue of nodes) {
          if (typeof issue !== "object" || issue === null) continue;
          const state = (issue as Record<string, unknown>)["state"];
          if (typeof state !== "object" || state === null) continue;
          const type = (state as Record<string, unknown>)["type"];
          // Linear WorkflowState.type enum per Linear GraphQL
          // schema: triage / backlog / unstarted / started /
          // completed / canceled. Mapping to 4 aggregate buckets
          // mirrors the Jira status-category split (to_do /
          // in_progress / done) plus a separate canceled bucket
          // because Linear surfaces canceled distinctly from
          // completed (Jira folds canceled under "done").
          if (type === "triage" || type === "backlog" || type === "unstarted") {
            toDoCount += 1;
          } else if (type === "started") {
            inProgressCount += 1;
          } else if (type === "completed") {
            doneCount += 1;
          } else if (type === "canceled") {
            canceledCount += 1;
          }
        }
        return Object.freeze({
          provider: "LinearReadProvider",
          mode: "real",
          operation,
          binding_id: invocation.binding_id,
          issues_count: nodes.length,
          to_do_count: toDoCount,
          in_progress_count: inProgressCount,
          done_count: doneCount,
          canceled_count: canceledCount,
        });
      }
    }
  }
}
