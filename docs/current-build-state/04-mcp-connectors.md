# Section 4 — MCP / Connectors

> Detailed canonical record for production Section 4. Master index:
> [`../CURRENT_BUILD_STATE.md`](../CURRENT_BUILD_STATE.md).

## Purpose

The substrate that lets the governed Action runtime reach
external systems through Model Context Protocol (MCP) servers
and connector adapters — Slack, Google Drive, Gmail, Salesforce,
Postgres, file systems, native apps, browser automation — every
external call gated through Action policy, dual-control, audit,
and per-`ActionType` handlers.

Canonical posture: deferred per ADR-0057 §17 + ADR-0058.

## Current status

**Substrate not started.** Section 4 is the first cross-process /
cross-network boundary the Foundation will expose. It requires
its own ADR (ADR-0058 reserved) + RULE 21 research arc.

## What is live

Nothing connector-side. The COSMP boundary
(`apps/api/src/services/cosmp/*`) is the only external-data
contact surface and it is sovereign-internal (per-entity DMW),
not external-system contact.

## What is not live

- MCP server registry.
- Connector registration / authorization model.
- Connector-class `ActionType` enum extensions (e.g.
  `SLACK_SEND_MESSAGE`, `GOOGLE_DRIVE_READ_FILE`).
- Connector handler dispatch via the executor.
- Connector-bound audit literals.
- Browser automation.
- Native-app automation.

## RULE 13 disclosures specific to Section 4

- Every connector call MUST land through the governed Action
  runtime per ADR-0057. No connector handler may bypass policy
  evaluator, dual-control, or audit emission.
- Connector secrets / OAuth tokens MUST be stored encrypted at
  rest per ADR-0019 (cryptographic posture). Never raw in
  `Action.payload_redacted`.
- Connector failures MUST translate to `ACTION_FAILED` with safe
  `error_class` / `error_summary` — never echo raw connector
  errors (HTTP responses, stack traces, third-party error
  bodies).

## Next slices (priority order)

1. ADR-0058 connector substrate decision document
   (Founder-authorized; depends on Section 2's per-`ActionType`
   handlers research arc landing first because connectors are
   `ActionType` extensions).
2. MCP server registry + authorization model.
3. First reference connector (likely Slack DM, lowest blast
   radius).

## Risks / forward-substrate

- Connectors are the single largest blast-radius surface in the
  product. Every slice MUST land with comprehensive audit
  coverage + dual-control gating + revocability.
- Browser automation + native-app automation MUST NOT land
  until governed Action runtime + connector substrate + audit
  + dual-control are battle-tested on simpler connector classes.

---

Back to master: [`../CURRENT_BUILD_STATE.md`](../CURRENT_BUILD_STATE.md)
