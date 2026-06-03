// FILE: connector-binding.service.ts
// PURPOSE: Section 4 Wave 2 ConnectorBinding service — validates +
//          dispatches to the query helpers + emits per-mutation
//          audit rows via ADMIN_ACTION + details.action discriminator
//          per Section 7 precedent (no new audit literal).
// CONNECTS TO:
//   - packages/database/src/queries/connector-binding.ts
//   - apps/api/src/services/connector/connector.service.ts (registry
//     validation; secret_ref_required check)
//   - apps/api/src/routes/connector.routes.ts (Wave 2 admin routes)
//
// PRIVACY INVARIANT:
//   - The SAFE projection (ConnectorBindingView) NEVER carries
//     resolved secret VALUES; secret_ref env-var NAMES are echoed
//     because they are operator-chosen + non-sensitive.
//   - The view shape is closed and validated at the route layer so
//     a future field addition cannot accidentally leak.
//   - Audit details carry the operator action (CONNECTOR_REGISTERED
//     / CONNECTOR_CONFIG_UPDATED / CONNECTOR_DISABLED /
//     CONNECTOR_REENABLED / CONNECTOR_SOFT_DELETED) + binding_id +
//     type + display_name; they MUST NOT carry config bodies (they
//     might contain operator-supplied URLs that look benign but
//     could become tracking surfaces) or secret_ref strings.

import type { ConnectorBinding, Prisma } from "@prisma/client";
import {
  createConnectorBinding,
  getConnectorBindingForOrg,
  listConnectorBindingsForOrg,
  softDeleteConnectorBindingForOrg,
  updateConnectorBindingForOrg,
  writeAuditEvent,
} from "@niov/database";
import { getConnectorTypeDefinition } from "./connector.service.js";
import type { ConnectorType } from "./connector.service.js";
import { assertEntitledForOrgSoftGate } from "../billing/entitlement-check.service.js";

const DISPLAY_NAME_MAX = 80;
const SECRET_REF_MAX = 120;
const SECRET_REF_RE = /^[A-Z][A-Z0-9_]{1,118}[A-Z0-9]$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// WHAT: SAFE projection of a ConnectorBinding row for HTTP responses
//        + admin tooling. NEVER includes resolved secret values.
// INPUT: Used as a return type only.
// OUTPUT: None — type only.
// WHY: Closed shape; future Prisma column additions do NOT
//      automatically appear in the response (the projector
//      explicitly maps each field), so a future column carrying
//      sensitive data cannot accidentally leak.
export interface ConnectorBindingView {
  binding_id: string;
  org_entity_id: string;
  type: ConnectorType;
  display_name: string;
  config: Record<string, unknown>;
  secret_ref: string | null;
  enabled: boolean;
  created_by_entity_id: string;
  created_at: string;
  updated_at: string;
}

// WHAT: Project a ConnectorBinding row into the SAFE view shape.
// INPUT: The Prisma row.
// OUTPUT: ConnectorBindingView.
// WHY: Centralizes the projection so every read path goes through
//      the same allowlist of fields.
export function projectConnectorBinding(
  row: ConnectorBinding,
): ConnectorBindingView {
  const config =
    row.config !== null && typeof row.config === "object" && !Array.isArray(row.config)
      ? (row.config as Record<string, unknown>)
      : {};
  return {
    binding_id: row.binding_id,
    org_entity_id: row.org_entity_id,
    type: row.type as ConnectorType,
    display_name: row.display_name,
    config,
    secret_ref: row.secret_ref,
    enabled: row.enabled,
    created_by_entity_id: row.created_by_entity_id,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

// WHAT: Discriminated failure shape for service-tier calls.
// INPUT: Used as a return-union arm.
// OUTPUT: None — type only.
// WHY: Route layer maps `code` to an HTTP status; never throws raw
//      errors at the HTTP boundary.
export type ConnectorBindingFailure = {
  ok: false;
  code:
    | "INVALID_FIELD"
    | "UNKNOWN_CONNECTOR_TYPE"
    | "SECRET_REF_REQUIRED"
    | "SECRET_REF_INVALID"
    | "BINDING_NOT_FOUND"
    | "DUPLICATE_DISPLAY_NAME"
    | "ENTITLEMENT_INSUFFICIENT"
    | "INTERNAL_ERROR";
  message?: string;
  invalid_fields?: string[];
  reason_code?:
    | "NO_ENTITLEMENT_ROW"
    | "FEATURE_NOT_ENTITLED"
    | "CAPABILITY_PACK_NOT_OWNED";
  feature_id?: string;
};

// WHAT: Input for registering a new ConnectorBinding via the admin
//        route.
// INPUT: Used as a parameter type only.
// OUTPUT: None — type only.
// WHY: Validation happens at the service tier; the route layer
//      passes the raw body through after a minimal type-only shape
//      check.
export interface RegisterConnectorBindingInput {
  type?: unknown;
  display_name?: unknown;
  config?: unknown;
  secret_ref?: unknown;
}

// WHAT: Validate + persist a new ConnectorBinding.
// INPUT: org_entity_id (resolved by the route from the caller's TAR
//        + getOrgEntityId) + actor_entity_id (caller) + body.
// OUTPUT: { ok: true; view } | ConnectorBindingFailure.
// WHY: All governance lives here; the route is a thin pass-through.
//      Audit emission uses ADMIN_ACTION + details.action =
//      "CONNECTOR_REGISTERED" per Section 7 precedent.
export async function registerConnectorBindingForOrg(args: {
  org_entity_id: string;
  actor_entity_id: string;
  body: RegisterConnectorBindingInput;
}): Promise<
  | { ok: true; view: ConnectorBindingView; audit_event_id: string }
  | ConnectorBindingFailure
> {
  const invalid: string[] = [];
  const typeRaw = args.body.type;
  if (typeof typeRaw !== "string" || typeRaw.length === 0) {
    invalid.push("type");
  }
  const displayName = args.body.display_name;
  if (
    typeof displayName !== "string" ||
    displayName.trim().length === 0 ||
    displayName.length > DISPLAY_NAME_MAX
  ) {
    invalid.push("display_name");
  }
  const configRaw = args.body.config;
  let config: Record<string, unknown> = {};
  if (configRaw !== undefined) {
    if (
      configRaw === null ||
      typeof configRaw !== "object" ||
      Array.isArray(configRaw)
    ) {
      invalid.push("config");
    } else {
      config = configRaw as Record<string, unknown>;
    }
  }
  const secretRefRaw = args.body.secret_ref;
  let secret_ref: string | null = null;
  if (secretRefRaw !== undefined && secretRefRaw !== null) {
    if (typeof secretRefRaw !== "string") {
      invalid.push("secret_ref");
    } else {
      secret_ref = secretRefRaw;
    }
  }
  if (invalid.length > 0) {
    return { ok: false, code: "INVALID_FIELD", invalid_fields: invalid };
  }

  const def = getConnectorTypeDefinition(typeRaw as string);
  if (def === null) {
    return {
      ok: false,
      code: "UNKNOWN_CONNECTOR_TYPE",
      message: "type is not a registered connector type",
    };
  }
  if (def.secret_ref_required && secret_ref === null) {
    return {
      ok: false,
      code: "SECRET_REF_REQUIRED",
      message: `connector type ${def.type} requires a secret_ref env-var name`,
    };
  }
  if (secret_ref !== null && !SECRET_REF_RE.test(secret_ref)) {
    return {
      ok: false,
      code: "SECRET_REF_INVALID",
      message:
        "secret_ref must be an UPPER_SNAKE_CASE env-var name (e.g., SLACK_HMAC_SECRET); 3..120 chars",
    };
  }
  if (secret_ref !== null && secret_ref.length > SECRET_REF_MAX) {
    return {
      ok: false,
      code: "SECRET_REF_INVALID",
      message: "secret_ref exceeds 120 chars",
    };
  }

  // Section 8 B5-α Entitlement gate per ADR-0093 §5 Candidate A.
  // Soft-gate so orgs that pre-date the Entitlement system still
  // succeed; orgs with an Entitlement row must own the capability
  // pack `connector_activation:<TYPE>` (or have the feature
  // entitled as true) to register a binding for that connector type.
  const entitlement = await assertEntitledForOrgSoftGate({
    org_entity_id: args.org_entity_id,
    actor_entity_id: args.actor_entity_id,
    feature_id: `connector_activation:${def.type}`,
  });
  if (entitlement.ok === false) {
    return {
      ok: false,
      code: "ENTITLEMENT_INSUFFICIENT",
      reason_code: entitlement.reason_code,
      feature_id: entitlement.feature_id,
      message: `org is not entitled to activate the ${def.type} connector`,
    };
  }

  try {
    const row = await createConnectorBinding({
      org_entity_id: args.org_entity_id,
      type: def.type,
      display_name: (displayName as string).trim(),
      config: config as Prisma.InputJsonValue,
      secret_ref,
      created_by_entity_id: args.actor_entity_id,
    });
    const audit = await writeAuditEvent({
      event_type: "ADMIN_ACTION",
      outcome: "SUCCESS",
      actor_entity_id: args.actor_entity_id,
      target_entity_id: args.org_entity_id,
      details: {
        action: "CONNECTOR_REGISTERED",
        binding_id: row.binding_id,
        type: row.type,
        display_name: row.display_name,
      },
    });
    return {
      ok: true,
      view: projectConnectorBinding(row),
      audit_event_id: audit.audit_id,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    if (
      message.includes("Unique constraint") ||
      message.includes("P2002")
    ) {
      return {
        ok: false,
        code: "DUPLICATE_DISPLAY_NAME",
        message:
          "a binding with this (type, display_name) already exists for this org",
      };
    }
    return { ok: false, code: "INTERNAL_ERROR", message };
  }
}

// WHAT: List ConnectorBindings for the caller's org (SAFE projection).
// INPUT: org_entity_id + optional enabled filter.
// OUTPUT: { ok: true; bindings: ConnectorBindingView[] }.
// WHY: Org-scoped list; the route handler resolves org_entity_id
//      via the standard getOrgEntityId path before calling.
export async function listConnectorBindingsForOrgService(args: {
  org_entity_id: string;
  enabled?: boolean;
}): Promise<{ ok: true; bindings: ConnectorBindingView[] }> {
  const rows = await listConnectorBindingsForOrg(args.org_entity_id, {
    enabled: args.enabled,
  });
  return { ok: true, bindings: rows.map(projectConnectorBinding) };
}

// WHAT: Body for PATCH /org/connectors/:id.
// INPUT: Used as a parameter type only.
// OUTPUT: None — type only.
// WHY: All fields optional; the service only mutates the ones the
//      caller sends. Sending `enabled: false` is the canonical
//      disable path; sending `enabled: true` is re-enable; sending
//      `config` replaces (does not merge) the config JSON.
export interface UpdateConnectorBindingInput {
  display_name?: unknown;
  config?: unknown;
  secret_ref?: unknown;
  enabled?: unknown;
}

// WHAT: Validate + patch an existing ConnectorBinding.
// INPUT: binding_id + org_entity_id + actor_entity_id + body.
// OUTPUT: { ok: true; view; audit_event_id } | ConnectorBindingFailure.
// WHY: All governance + audit emission live here. The service
//      compares the pre-patch row's enabled flag to the post-patch
//      row to decide whether to emit CONNECTOR_DISABLED vs
//      CONNECTOR_REENABLED vs CONNECTOR_CONFIG_UPDATED.
export async function updateConnectorBindingForOrgService(args: {
  binding_id: string;
  org_entity_id: string;
  actor_entity_id: string;
  body: UpdateConnectorBindingInput;
}): Promise<
  | { ok: true; view: ConnectorBindingView; audit_event_id: string }
  | ConnectorBindingFailure
> {
  if (typeof args.binding_id !== "string" || !UUID_RE.test(args.binding_id)) {
    return {
      ok: false,
      code: "INVALID_FIELD",
      invalid_fields: ["binding_id"],
    };
  }
  const invalid: string[] = [];
  const patch: {
    display_name?: string;
    config?: Record<string, unknown>;
    secret_ref?: string | null;
    enabled?: boolean;
  } = {};
  if (args.body.display_name !== undefined) {
    const v = args.body.display_name;
    if (
      typeof v !== "string" ||
      v.trim().length === 0 ||
      v.length > DISPLAY_NAME_MAX
    ) {
      invalid.push("display_name");
    } else {
      patch.display_name = v.trim();
    }
  }
  if (args.body.config !== undefined) {
    const v = args.body.config;
    if (v === null || typeof v !== "object" || Array.isArray(v)) {
      invalid.push("config");
    } else {
      patch.config = v as Record<string, unknown>;
    }
  }
  if (args.body.secret_ref !== undefined) {
    const v = args.body.secret_ref;
    if (v === null) {
      patch.secret_ref = null;
    } else if (typeof v !== "string" || !SECRET_REF_RE.test(v)) {
      invalid.push("secret_ref");
    } else {
      patch.secret_ref = v;
    }
  }
  if (args.body.enabled !== undefined) {
    const v = args.body.enabled;
    if (typeof v !== "boolean") {
      invalid.push("enabled");
    } else {
      patch.enabled = v;
    }
  }
  if (invalid.length > 0) {
    return { ok: false, code: "INVALID_FIELD", invalid_fields: invalid };
  }

  const pre = await getConnectorBindingForOrg(
    args.binding_id,
    args.org_entity_id,
  );
  if (pre === null) {
    return {
      ok: false,
      code: "BINDING_NOT_FOUND",
      message: "no binding with that id under this org",
    };
  }

  const updated = await updateConnectorBindingForOrg(
    args.binding_id,
    args.org_entity_id,
    {
      ...(patch.display_name !== undefined
        ? { display_name: patch.display_name }
        : {}),
      ...(patch.config !== undefined
        ? { config: patch.config as Prisma.InputJsonValue }
        : {}),
      ...(patch.secret_ref !== undefined
        ? { secret_ref: patch.secret_ref }
        : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
    },
  );
  if (updated === null) {
    return {
      ok: false,
      code: "BINDING_NOT_FOUND",
      message: "binding was soft-deleted concurrently",
    };
  }

  let action: string = "CONNECTOR_CONFIG_UPDATED";
  if (patch.enabled === true && pre.enabled === false) {
    action = "CONNECTOR_REENABLED";
  } else if (patch.enabled === false && pre.enabled === true) {
    action = "CONNECTOR_DISABLED";
  }
  const audit = await writeAuditEvent({
    event_type: "ADMIN_ACTION",
    outcome: "SUCCESS",
    actor_entity_id: args.actor_entity_id,
    target_entity_id: args.org_entity_id,
    details: {
      action,
      binding_id: updated.binding_id,
      type: updated.type,
      display_name: updated.display_name,
      // Whitelist of which patch keys were applied (booleans only
      // — never the values themselves — so audit cannot leak the
      // operator's new config payload).
      fields_changed: Object.keys(patch),
    },
  });
  return {
    ok: true,
    view: projectConnectorBinding(updated),
    audit_event_id: audit.audit_id,
  };
}

// WHAT: Soft-delete a ConnectorBinding via the admin route (DELETE).
// INPUT: binding_id + org_entity_id + actor_entity_id.
// OUTPUT: { ok: true; audit_event_id } | ConnectorBindingFailure.
// WHY: RULE 10 — row stays, deleted_at gets the timestamp. The
//      uniqueness constraint still binds the row's
//      (org_entity_id, type, display_name) slot until a separate
//      hard-delete process runs (intentionally not supported at
//      Wave 2).
export async function softDeleteConnectorBindingForOrgService(args: {
  binding_id: string;
  org_entity_id: string;
  actor_entity_id: string;
}): Promise<
  | { ok: true; audit_event_id: string }
  | ConnectorBindingFailure
> {
  if (!UUID_RE.test(args.binding_id)) {
    return {
      ok: false,
      code: "INVALID_FIELD",
      invalid_fields: ["binding_id"],
    };
  }
  const pre = await getConnectorBindingForOrg(
    args.binding_id,
    args.org_entity_id,
  );
  if (pre === null) {
    return {
      ok: false,
      code: "BINDING_NOT_FOUND",
      message: "no binding with that id under this org",
    };
  }
  const ok = await softDeleteConnectorBindingForOrg(
    args.binding_id,
    args.org_entity_id,
  );
  if (!ok) {
    return {
      ok: false,
      code: "BINDING_NOT_FOUND",
      message: "binding was soft-deleted concurrently",
    };
  }
  const audit = await writeAuditEvent({
    event_type: "ADMIN_ACTION",
    outcome: "SUCCESS",
    actor_entity_id: args.actor_entity_id,
    target_entity_id: args.org_entity_id,
    details: {
      action: "CONNECTOR_SOFT_DELETED",
      binding_id: pre.binding_id,
      type: pre.type,
      display_name: pre.display_name,
    },
  });
  return { ok: true, audit_event_id: audit.audit_id };
}

// WHAT: Fetch a single ConnectorBinding by id, scoped to the
//        caller's org.
// INPUT: binding_id + org_entity_id.
// OUTPUT: { ok: true; view } | ConnectorBindingFailure (404).
// WHY: Used by the GET single route + by future Wave 3 INVOKE_CONNECTOR
//      handler to resolve invocation context. Cross-org lookups
//      collapse to enumeration-safe 404 BINDING_NOT_FOUND.
export async function getConnectorBindingForOrgService(args: {
  binding_id: string;
  org_entity_id: string;
}): Promise<
  | { ok: true; view: ConnectorBindingView }
  | ConnectorBindingFailure
> {
  if (!UUID_RE.test(args.binding_id)) {
    return {
      ok: false,
      code: "INVALID_FIELD",
      invalid_fields: ["binding_id"],
    };
  }
  const row = await getConnectorBindingForOrg(
    args.binding_id,
    args.org_entity_id,
  );
  if (row === null) {
    return { ok: false, code: "BINDING_NOT_FOUND" };
  }
  return { ok: true, view: projectConnectorBinding(row) };
}
