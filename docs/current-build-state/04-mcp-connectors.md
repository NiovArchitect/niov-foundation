# Section 4 — MCP / Connectors

> Detailed canonical record for production Section 4. Master index:
> [`../CURRENT_BUILD_STATE.md`](../CURRENT_BUILD_STATE.md).

## Purpose

The substrate that lets the governed Foundation reach external
systems through ConnectorBindings + ConnectorProviders. Section 4
gives Otzar a real path to fan out internal Notifications + run
INVOKE_CONNECTOR Actions against per-org-registered external
adapters, every call audited + every secret kept as an env-var
reference (never raw-at-rest).

## C2 Slack Read-First Connector Runtime LANDED 2026-06-01

Section 4 graduates **Slack: `RECOMMENDATION_READY` → `RUNTIME_READY`** (Foundation backend register). First real vendor connector now LIVE.

NEW `apps/api/src/services/connector/slack-read.provider.ts` — `SlackReadProvider` implementing `ConnectorProvider`. Three read operations: `channels.list` (via Slack `conversations.list` API) + `users.list` + `conversations.history`. Bot-token (xoxb-*) via `binding.secret_ref` env-var-NAME per ADR-0019 + ADR-0024. Fixture-first: real Slack API only when `SLACK_USE_REAL=1` + `config.use_real=true` + `secret_ref` resolves; triple defensive gate.

MOD `connector.service.ts` — `ConnectorType` extended (`OUTBOUND_WEBHOOK | FIXTURE_ECHO | SLACK_READ`); `CONNECTOR_REGISTRY.SLACK_READ` frozen entry; dispatch wired via `getConnectorProviderAsync`. NO new audit literal. NO schema migration (column is plain `String`).

The existing `INVOKE_CONNECTOR` ActionType handler dispatches SLACK_READ through the same governance pipeline (org-scoped `ConnectorBinding` lookup → cross-tenant denial structural → registry check → provider invoke → ACTION_* audit chain). GOVSEC.6 helpers from `agent-abuse-guard.ts` (PR #183) are now structurally exercised: cross-tenant denial enforced via `getConnectorBindingForOrg(binding_id, org_entity_id)`.

NEW `tests/unit/c2-slack-read-provider.test.ts` — 22 tests across registry extension + factory + fixture-mode success per operation + payload validation + 8 forced-failure fixture keys + environment gate + privacy invariant (no xoxb- / no Bearer / no message content / no user PII in delivery_metadata).

MOD `tests/unit/connector-provider.test.ts` — frozen-anchor contract test updated for 3-type registry.

Unit suite **1183 tests pass** (was 1161; +22). Typecheck baseline preserved at 4. Privacy invariant + no-leak guard preserved.

**Out of scope at C2** (forward-substrate): writes (≥C6), OAuth flow (≥C5), Events API webhook (≥C7), private-message + search.messages (later C-slice), Control Tower binding-creation UI (separate CT slice — Section 4 Wave 2 admin routes already accept `type: "SLACK_READ"` without modification).

**Section 4 graduation across all 6 ranked connectors:**

| Connector | Status |
|---|---|
| Slack | **RUNTIME_READY** (this PR) |
| Linear | RECOMMENDATION_READY |
| Jira Cloud | RECOMMENDATION_READY |
| Google Workspace | RECOMMENDATION_READY |
| GitHub | RECOMMENDATION_READY |
| Microsoft 365 | RECOMMENDATION_READY |

**Next slice candidates:**

1. **C2 Operating** — first real customer-bound Slack workspace activation; flips Slack `RUNTIME_READY` → `OPERATING`. Requires admin to create a `ConnectorBinding` with `type: "SLACK_READ"` + `secret_ref` pointing to a real xoxb- token + `config.use_real: true` + setting `SLACK_USE_REAL=1` in the deployment env.
2. **D3 Dandelion Recommendation substrate** — natural next step after D2 Assessment substrate (LIVE PR #181).
3. **B4 Internal entitlement / seat ledger** — dependency for connector pack entitlement gating at runtime.

## Connector Implementation-Readiness Catalog LANDED 2026-06-01

Per `[FOUNDER-POST-B3-AUTONOMOUS-D2-AND-CONNECTOR-READINESS-CONTINUATION-AUTH]`. NEW `docs/connector-readiness/` (9 files, 7 catalog items) + NEW `scripts/validate-connector-readiness.mjs` validator (pure Node ESM; mirrors `validate-entitlement-catalog.mjs` sentence-level negation + subtree skip). Validator green: 9/9 files, 7 items, 7/7 required IDs, 0 errors.

Five connector readiness items + matrix:

| Rank | Connector | Composite | First slice | Family |
|---|---|---|---|---|
| 1 | **Slack** | **8.65** | **C2** | Collaboration |
| 2 | Linear | 7.65 | C4-B | Project / Engineering |
| 3 | Jira Cloud | 7.55 | C4-A | Project / Engineering |
| 4 | Google Workspace | 7.50 | C3 | Workspace / Knowledge |
| 5 | GitHub | 7.40 | C-GitHub | Project / Engineering |
| 6 | Microsoft 365 | 7.10 | C5 | Workspace / Knowledge + Collaboration |

Composite formula: `first_week_aha_value*0.18 + API_maturity*0.14 + read_value*0.14 + workflow_binding_value*0.13 + event_webhook_value*0.09 + auditability*0.09 + MCP_fit*0.06 + (10-OAuth_complexity)*0.05 + (10-write_risk)*0.04 + (10-enterprise_admin_complexity)*0.03 + (10-data_sensitivity)*0.02 + (10-implementation_complexity)*0.02 + (10-DMW_scope_complexity)*0.01`. 13-dimension scoring per connector.

Every connector readiness item carries: official vendor docs cited verbatim (Slack docs.slack.dev / Google developers.google.com / Atlassian developer.atlassian.com / Linear developers.linear.app / Microsoft Graph learn.microsoft.com / GitHub docs.github.com) · MCP posture · OAuth model · admin consent model · read capabilities · write capabilities (disabled by default) · webhook / event capabilities · risky write actions · `default_mode: READ_FIRST` · required approval gates · dual-control recommendations · DMW scope implications per ADR-0046 dual-context · workflow purpose bindings per ADR-0081 5-stage maturity · billing pack mapping per ADR-0083 Amendment 1 §9.4 · Dandelion map dependencies (Tool / Workflow / Authority / Memory / Risk) per ADR-0082 Amendment 1 · audit expectations (existing literals; no new audit literal) · secret handling per ADR-0024 + ADR-0019 · no-leak rules · tenant isolation · rate limit notes · testing strategy · implementation risks · first slice recommendation · `not_implemented_yet: true`.

**Graduation:** Connectors `PREVIEW_ONLY` → **`RECOMMENDATION_READY`**. Per-connector next step: `RUNTIME_READY` at C-slice PR landing; `OPERATING` after first real customer-bound activation.

**Recommended next slices:** GOVSEC.6 (agent abuse / confused-deputy hardening) before/alongside C2 → C2 Slack read-first runtime → D3 Dandelion Recommendation substrate.

## Current status (PRODUCTION-GRADE COMPLETE for Foundation backend scope — Waves 1+2+3+4+5+7 LIVE + Hardening B LIVE)

**Provider abstraction + ConnectorBinding model + admin routes +
INVOKE_CONNECTOR ActionType + first real OutboundWebhookProvider
+ NotificationService fan-out bridge LIVE per PRs #70 + #71 + #72
+ #73 + #74.** Section 4 Foundation backend is production-grade
complete for the canonical generic-adapter shape: any external
system reachable via HTTPS POST + HMAC-SHA-256 signing can be
registered as a binding + invoked via the Action runtime or via
the internal-notification fan-out bridge, with full audit chain
+ no-leak posture.

SDK-bound connectors (Slack OAuth / Gmail / Salesforce / Linear
/ Jira / Microsoft Graph) remain forward-substrate behind their
own future QLOCKs + RULE 21 research arcs — each adds its own
auth-flow substrate that is intentionally out of Wave 5 scope.

## What is live

### Wave 7 (PR #80) — Action-routed fan-out variant (opt-in)

- NEW `bindingFanOutMode` pure matcher reads
  `config.fan_out_mode ∈ {"direct", "action"}`; defaults to
  `"direct"` when absent / unrecognized / non-object config.
- `dispatchNotificationFanOut` refactored into a mode-branching
  shape:
  - `direct` (Wave 5 baseline; default) — extracted as
    `dispatchDirect`; semantics verbatim; adds `mode: "direct"`
    to audit details.
  - `action` (Wave 7 opt-in) — `dispatchActionRouted` calls
    `createActionForCaller(source_entity_id, INVOKE_CONNECTOR)`
    with deterministic `idempotency_key =
    fanout:${notification_id}:${binding_id}`. Action runtime
    owns lifecycle (policy evaluator + admission + executor +
    full ACTION_* audit chain). NEW `details.action =
    NOTIFICATION_FAN_OUT_ENQUEUED` audit row bookmarks the
    fan-out → Action handoff. No new audit literal (rides
    existing `ADMIN_ACTION`).
- `NotificationFanOutResult.attempts[]` extended with `mode` +
  optional `action_id` for forensic / test inspection.
- **Safety**: `source_entity_id` is a real entity UUID (the
  original notification source), not the SCHEDULER sentinel —
  preserves Action model `@db.Uuid` contract + audit
  attribution to the entity that caused the fan-out.
- **Idempotency**: deterministic key collapses re-fires of the
  same `(notification_id, binding_id)` to one Action.
- **Privacy invariant**: `payload_redacted` carries
  `binding_id + invocation_payload (notification_id +
  notification_class only)`; never `body_summary` /
  `body_redacted` / `recipient_entity_id`.

### Wave 5 (PR #74) — NotificationService external fan-out bridge

- NEW `apps/api/src/services/connector/notification-fanout.service.ts`:
  - `bindingMatchesNotificationClass` pure matcher — a binding
    opts into fan-out by adding `notification_classes: string[]`
    to its `config` JSON; wildcard `"*"` matches every class.
  - `dispatchNotificationFanOut` loads enabled bindings for the
    org, filters by notification_class match, invokes matching
    providers in parallel via `Promise.all`, emits one
    `ADMIN_ACTION` audit row per attempt with
    `details.action ∈ { NOTIFICATION_FAN_OUT_DISPATCHED,
    NOTIFICATION_FAN_OUT_FAILED }`. **No new audit literal.**
    Outcome `SUCCESS` (dispatched) or `ERROR` (provider failure;
    `AuditOutcome` enum is `{ SUCCESS, DENIED, ERROR }`).
  - `makeConnectorFanOutHook` builder wraps dispatch in
    try/catch so the production hook swallows downstream
    exceptions — a fan-out failure can never undo a committed
    Notification row.
- `makeNotificationService` accepts an optional `connectorFanOut`
  hook + a new `MakeNotificationServiceOptions` bag. Absent →
  Wave 11 internal-only behavior preserved verbatim. Present →
  hook fires AFTER successful persistence (commit-then-hook
  order). The hook payload is locked to `notification_id +
  notification_class + org_entity_id + source_entity_id` — body
  content can never traverse this seam by construction.
- `apps/api/src/server.ts` wires `makeConnectorFanOutHook()` at
  boot; production fan-out routes through
  `getConnectorProviderAsync` (real `OutboundWebhookProvider`
  for `OUTBOUND_WEBHOOK`).

### Wave 4 (PR #73) — OutboundWebhookProvider (first real connector)

- NEW `apps/api/src/services/connector/outbound-webhook.provider.ts`
  — full real provider. HTTPS POST + HMAC-SHA-256 signing using
  `secret_ref`-resolved env var. Zero provider-SDK dependency
  (pure `node:https` + `node:crypto`).
- Validates per-binding `config`: required `url` (https only;
  http:// allowed only when `ALLOW_HTTP_FOR_LOCAL_TEST_INSECURE=true`
  — explicit opt-in for tests + local dev); optional `method`
  (POST | PUT only); optional `headers` (string→string only).
- HMAC signing over `${timestamp}.${rawBody}` to defeat replay.
  `X-NIOV-Signature: sha256=<hex>` + `X-NIOV-Timestamp: <ms epoch>`
  headers. Operator-supplied headers cannot override these.
- HTTP status → `error_class` mapping:
  - 2xx → `ok=true` with SAFE delivery_metadata (provider + type
    + binding_id + http_status + elapsed_ms ONLY).
  - 401 / 403 → `AUTH`
  - 429 → `RATE_LIMIT`
  - other non-2xx → `PROVIDER_ERROR`
  - network failure → `NETWORK`
  - timeout (10_000ms) → `TIMEOUT`
- SAFE delivery_metadata never carries response body / headers,
  never secret material, never request body.
- Factory swap: sync `getConnectorProvider("OUTBOUND_WEBHOOK")`
  now throws (defense in depth); NEW async
  `getConnectorProviderAsync` resolves the real provider via
  dynamic import. `INVOKE_CONNECTOR` handler switched to await.

### Wave 3 (PR #72) — INVOKE_CONNECTOR ActionType + handler

- `ActionType` enum extended with `INVOKE_CONNECTOR` (4 total
  values). Risk tier LOW (the dual-control gate lives at
  binding REGISTRATION via Wave 2 `can_admin_org` +
  `ADMIN_ACTION` audit). Retry budget 3 (matches
  `SEND_INTERNAL_NOTIFICATION` precedent).
- NEW `validateInvokeConnectorPayload`: required UUID
  `binding_id` + optional `invocation_payload` object. NO
  secret material in payload.
- NEW `makeInvokeConnectorHandler`: resolves binding scoped to
  action's `org_entity_id`, dispatches through provider, maps
  8 provider error_class branches to discriminated
  `CONNECTOR_<class>` handler error_class. Optional injectable
  `ConnectorProvider` via `ActionHandlerRegistryDeps` for
  deterministic CI.
- SAFE result_metadata: handler + action_type + binding_id +
  connector_type + delivery_metadata. Never raw
  invocation_payload, never resolved secret, never raw response
  bodies.
- NO new audit literal — ADR-0057's 10 `ACTION_*` literals
  authoritatively cover the invocation lifecycle.

### Wave 2 (PR #71) — ConnectorBinding model + admin routes + audit

- NEW `ConnectorBinding` Prisma model: per-org enablement +
  scoped config + `secret_ref` env-var NAME (never raw secret
  material at rest) + `enabled` flag + `deleted_at` soft-delete
  (RULE 10). `@@unique([org_entity_id, type, display_name])` +
  `@@index([org_entity_id, enabled, deleted_at])`.
- 5 admin routes — `POST/GET/GET-:id/PATCH/DELETE /api/v1/org/connectors[/:id]`
  — all `can_admin_org`-gated + scoped to caller's org via
  `getOrgEntityId`. Cross-org probes collapse to enumeration-safe
  404 `BINDING_NOT_FOUND`.
- 5 admin actions emit `ADMIN_ACTION` + `details.action ∈
  { CONNECTOR_REGISTERED, CONNECTOR_CONFIG_UPDATED,
    CONNECTOR_DISABLED, CONNECTOR_REENABLED,
    CONNECTOR_SOFT_DELETED }`. **No new audit literal.**
- SAFE `ConnectorBindingView` projection echoes `secret_ref`
  env-var NAME but never resolved values.

### Wave 1 (PR #70) — ConnectorProvider abstraction + registry

- NEW `apps/api/src/services/connector/connector.service.ts`
  with the canonical provider shape (mirrors
  `EmbeddingProvider` + `LLMProvider`):
  - `ConnectorType` string-literal union (`OUTBOUND_WEBHOOK` +
    `FIXTURE_ECHO`).
  - `CONNECTOR_REGISTRY` frozen-anchor catalog.
  - `ConnectorInvocation` + `ConnectorResult` discriminated union
    (8 closed `error_class` literals).
  - `ConnectorProvider` interface (single `invoke` method).
  - `FixtureBasedConnectorProvider` with 8 forced-failure
    fixture keys + a default-success path.
  - `getConnectorProvider` factory + `getConnectorTypeDefinition`
    lookup helper.

## RULE 13 disclosures specific to Section 4

- Every external call MUST land through a ConnectorBinding +
  ConnectorProvider. Direct outbound HTTP from anywhere outside
  `apps/api/src/services/connector/` is forbidden by convention;
  Wave 4's `outbound-webhook.provider.ts` is the canonical home
  for `node:https` / `fetch` use.
- Resolved secret VALUES (`process.env[secret_ref]`) live inside
  the provider boundary ONLY. They are NEVER logged, NEVER
  echoed into `delivery_metadata`, NEVER attached to result
  bodies, NEVER carried by audit details.
- `ConnectorBindingView` SAFE projection echoes the `secret_ref`
  env-var NAME (operator-chosen + non-sensitive) but never the
  resolved value.
- Wave 5 fan-out is a metadata ping ONLY — `body_summary` +
  `body_redacted` of the source Notification never traverse the
  hook surface. External adapter consumers who need content
  fetch via the authenticated inbox surface.
- The HMAC signature pattern matches Stripe / Slack / GitHub
  webhook convention so downstream consumers can verify without
  ever sharing the secret with this provider.
- Tests NEVER make live external calls. Wave 4 spins up a local
  Node http server on port 0 + opts into
  `ALLOW_HTTP_FOR_LOCAL_TEST_INSECURE=true`; Wave 3 + Wave 5
  inject `FixtureBasedConnectorProvider` for deterministic CI.

## Production-grade-complete recommendation (Section 4 closeout)

Section 4 Foundation backend is **production-grade complete**
for the canonical generic-adapter shape:

1. **All Section 4 Foundation backend routes / services / models
   LIVE**:
   - `ConnectorBinding` Prisma model (Wave 2)
   - 5 admin routes on `/api/v1/org/connectors[/:id]` (Wave 2)
   - `INVOKE_CONNECTOR` ActionType + handler (Wave 3)
   - `OutboundWebhookProvider` real adapter (Wave 4)
   - `dispatchNotificationFanOut` + `makeConnectorFanOutHook` +
     `connectorFanOut` hook into `NotificationService` (Wave 5)

2. **Provider abstractions live**:
   - `ConnectorProvider` interface + `ConnectorResult` 8-class
     discriminated union (Wave 1)
   - `FixtureBasedConnectorProvider` deterministic CI provider
     (Wave 1)
   - `OutboundWebhookProvider` real provider (Wave 4)
   - `getConnectorProvider` sync factory + `getConnectorProviderAsync`
     async factory (Wave 4)

3. **Providers: real vs mocked vs future**:
   - **Real**: `OutboundWebhookProvider` (Wave 4) — production-grade
     HTTPS POST + HMAC-SHA-256 signing.
   - **Mocked**: `FixtureBasedConnectorProvider` (Wave 1) — used
     for CI; also registered as the `FIXTURE_ECHO` registry
     entry for end-to-end test bindings.
   - **Future** (each behind its own QLOCK + RULE 21 research
     arc): Slack OAuth / Gmail / Microsoft Graph / Salesforce /
     Linear / Jira / SMS / Push. Each needs its own OAuth-flow
     substrate that is intentionally out of Wave 5 scope.

4. **Credential / secret safety posture**:
   - `ConnectorBinding.secret_ref` stores the env-var NAME only.
   - Resolved values live inside provider boundary only.
   - SAFE projection + audit details never carry secret values.
   - No encrypted-at-rest secret column (intentionally
     forward-substrate; would need a separate Founder-authorized
     schema amendment per ADR-0019 cryptographic-suite posture).

5. **Action runtime integration posture**:
   - `INVOKE_CONNECTOR` ActionType rides the Action runtime
     full lifecycle (`ACTION_*` audit literals, retry budget,
     dual-control gate at registration tier).
   - Tests inject `FixtureBasedConnectorProvider` via
     `ActionHandlerRegistryDeps` constructor seam.

6. **Notification external-adapter posture**:
   - Wave 5 `connectorFanOut` hook fires AFTER successful
     Notification persistence; metadata-only ping; per-attempt
     `ADMIN_ACTION` audit row.
   - Internal-only Wave 11 behavior preserved verbatim when hook
     is absent.
   - Fan-out is opt-in per binding via `config.notification_classes`
     (wildcard `"*"` supported).

7. **Audit / no-leak posture**:
   - Wave 2 admin mutations: 5 `details.action` discriminators
     on existing `ADMIN_ACTION` literal.
   - Wave 3 invocations: existing 10 `ACTION_*` literals cover
     the invocation lifecycle authoritatively.
   - Wave 5 fan-out: 2 `details.action` discriminators
     (`NOTIFICATION_FAN_OUT_DISPATCHED` / `_FAILED`).
   - **Zero new audit literals across Waves 1–5.**
   - SAFE projection + provider-result invariants prevent
     secret + body content leakage at every layer.

8. **Remaining future-substrate items (none gate
   production-grade-complete)**:
   - SDK-bound connectors (Slack / Gmail / etc.) — each behind
     own QLOCK.
   - Encrypted-at-rest secret column for per-tenant credentials —
     separate Founder-authorized schema amendment.
   - Action-runtime-integrated fan-out variant — current
     fire-and-forget fan-out is correct for best-effort signals;
     a future Action-routed variant can land if operator
     feedback warrants the additional substrate.
   - HMAC signature verification helper for receiving webhooks
     (Foundation currently SENDS signed webhooks; receiving +
     verifying inbound signatures is a separate wave).

9. **Section 4 Foundation backend IS production-grade complete**.
   Operators can register an `OUTBOUND_WEBHOOK` binding pointing
   at any HTTPS endpoint they sign-verify with HMAC-SHA-256
   (Slack incoming webhooks, Discord, generic dispatch, internal
   services) and either fire it via `INVOKE_CONNECTOR` Actions
   or wire it into `NotificationService` fan-out — all with full
   audit chain + zero raw-secret-at-rest.

10. **Recommended next production section: Section 1 Wave 3 —
    Otzar drift detection ADR** (RULE 20-gated). Of the remaining
    sections, drift detection delivers the next-highest customer-
    visible value per dev-hour because (a) it leverages the
    Otzar Wave 2A/B/C correction substrate already LIVE on main
    (3bb773d / 1ffa01d / c56bd57), (b) it's the natural pairing
    with Section 4 — once external adapters are firing, drift
    detection becomes the operator-trust loop that says "this
    Twin is staying aligned even as external context changes",
    and (c) it does not require any new schema or external
    integration (pure Foundation + Otzar work).

    Alternative next slices (each RULE 20-gated):
    - **Section 4 Slack OAuth follow-on** — first SDK-bound
      connector. Highest demand-side enterprise value but
      largest substrate surface (OAuth token storage requires
      schema + key-management).
    - **GOVSEC.5 follow-on `requireAdminCapability` throttle** —
      hardens dual-control; security-relevant.
    - **Section 9 backend contracts** — keeps Control Tower
      consumption parity caught up with the new Section 4
      surface (CT will want a connectors-admin page eventually).

## Forward-substrate (RULE 20-gated; sequencing only)

1. **SDK-bound connectors** (Slack OAuth / Gmail / Microsoft
   Graph / Salesforce / Linear / Jira / SMS / Push) — each its
   own QLOCK + RULE 21 research arc. Each adds OAuth token
   storage substrate that the current `secret_ref` env-var
   pattern does not cover.
2. **Encrypted-at-rest secret column** — per-tenant credentials
   stored encrypted via ContentEncryption (already exists at
   `packages/auth/src/crypto.ts`). Wave 2 left
   `IntegrationCredential` model untouched as latent
   forward-substrate; a new `ConnectorBinding.encrypted_credential`
   column + key-derivation pattern would be the substrate.
3. **Action-runtime-integrated fan-out variant** — current
   Wave 5 fan-out is fire-and-forget; an Action-routed variant
   would give retry + cancellation guarantees at the cost of
   Section 2 ↔ Action runtime coupling.
4. **HMAC signature verification helper** for receiving inbound
   webhooks — Foundation currently SENDS signed webhooks; the
   reverse direction is a separate wave.
5. **Control Tower connector admin UX** — frontend lives in
   `otzar-control-tower`; out of Foundation scope.

## Landed PRs

| PR | Commit | Description |
|---|---|---|
| [#70](https://github.com/NiovArchitect/niov-foundation/pull/70) | `4142735` | **Section 4 Wave 1 ConnectorProvider abstraction + registry** — `ConnectorProvider` interface, `CONNECTOR_REGISTRY` frozen-anchor (2 entries), `ConnectorInvocation` + `ConnectorResult` 8-class discriminated union, `FixtureBasedConnectorProvider` with 8 forced-failure fixture keys, `getConnectorProvider` factory + `getConnectorTypeDefinition` lookup helper. 23 NEW unit tests. No schema; no audit literals. |
| [#71](https://github.com/NiovArchitect/niov-foundation/pull/71) | `40b5e2e` | **Section 4 Wave 2 ConnectorBinding model + admin routes + audit** — NEW `ConnectorBinding` Prisma model (secret_ref env-var NAME only; never raw secret); 5 admin routes on `/api/v1/org/connectors[/:id]` all `can_admin_org`-gated; 5 admin `details.action` discriminators on existing `ADMIN_ACTION` literal. 19 NEW integration tests + no-leak SAFE projection proof. |
| [#72](https://github.com/NiovArchitect/niov-foundation/pull/72) | `4009b25` | **Section 4 Wave 3 INVOKE_CONNECTOR ActionType + handler** — `ActionType` enum extended; LOW risk_tier; `validateInvokeConnectorPayload`; `makeInvokeConnectorHandler` with 8 provider error_class → handler error_class mapping; SAFE result_metadata. Rides existing 10 `ACTION_*` audit literals (no new audit literal). 15 NEW integration tests. |
| [#73](https://github.com/NiovArchitect/niov-foundation/pull/73) | `c24dcc1` | **Section 4 Wave 4 OutboundWebhookProvider — first real connector** — HTTPS POST + HMAC-SHA-256 signing (defeats replay via `${timestamp}.${rawBody}`). Pure `node:https` + `node:crypto`; zero SDK dependency. Bounded timeout (10_000ms); HTTP status → error_class mapping; SAFE delivery_metadata. Factory swap: sync throws → async resolves real provider. 14 NEW integration tests via local Node http server fixture; no live external calls. |
| [#74](https://github.com/NiovArchitect/niov-foundation/pull/74) | `6258f17` | **Section 4 Wave 5 NotificationService external fan-out bridge** — `bindingMatchesNotificationClass` matcher; `dispatchNotificationFanOut` parallel per-binding invoke + per-attempt audit; `makeConnectorFanOutHook` swallows downstream errors; `NotificationService` gains optional `connectorFanOut` hook (commit-then-hook order; payload locked to metadata ping). Wave 11 internal-only baseline preserved verbatim when hook absent. 2 `details.action` discriminators on `ADMIN_ACTION`. 13 NEW integration tests. |
| [#77](https://github.com/NiovArchitect/niov-foundation/pull/77) | `3cda556` | **Hardening Wave B — Section 4 inbound HMAC verification helper** — `verifyInboundHmac` pairs with Wave 4 sender; 8-reason closed enum; timing-safe hex compare; default 5-min replay window. Pure substrate; no route consumer yet. 19 NEW unit tests. |
| [#80](https://github.com/NiovArchitect/niov-foundation/pull/80) | `f26c88e` | **Section 4 Wave 7 Action-routed fan-out variant (opt-in)** — closes the Wave 5 closeout forward-substrate note. NEW `bindingFanOutMode` + `dispatchActionRouted` create real `INVOKE_CONNECTOR` Action via `createActionForCaller(source_entity_id, ...)`; deterministic idempotency key; Action runtime owns retry + cancellation + ACTION_* audit chain. NEW `NOTIFICATION_FAN_OUT_ENQUEUED` discriminator on `ADMIN_ACTION` (no new literal). Wave 5 direct-mode preserved as default. 10 NEW integration tests; Wave 5 regression 13/13 preserved. |

## Risks / forward-substrate

- The `secret_ref` env-var pattern requires operators to set
  env vars in the deployment environment. For larger
  multi-tenant deployments, encrypted-at-rest per-tenant
  secrets (forward-substrate item 2 above) is the natural next
  step.
- Wave 5 fan-out is fire-and-forget — a transient provider
  failure does NOT retry. The per-attempt audit row is the
  observability surface; operators monitoring those rows can
  manually re-trigger via INVOKE_CONNECTOR Actions if needed.
- The HMAC-SHA-256 signing pattern is the canonical webhook
  convention but each downstream consumer must implement
  signature verification on their side. Foundation does not
  warn if a downstream returns 401 (the AUTH error_class would
  surface this).
- Slack / Gmail / Salesforce / Linear / Jira and similar
  SDK-bound connectors are NOT live — each requires its own
  QLOCK. Do not claim they work yet.

---

Back to master: [`../CURRENT_BUILD_STATE.md`](../CURRENT_BUILD_STATE.md)
