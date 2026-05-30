// FILE: queries/connector-binding.ts
// PURPOSE: Section 4 Wave 2 ConnectorBinding query helpers — create,
//          read, list, update-config, set-enabled, soft-delete. Per
//          RULE 10 deletion = setting deleted_at; per Founder
//          direction this model NEVER stores raw secret material —
//          only a `secret_ref` env-var NAME the provider resolves
//          at invocation time.
// CONNECTS TO:
//   - schema.prisma `model ConnectorBinding` (Wave 2 substrate)
//   - apps/api/src/services/connector/* (registry validation +
//     provider invocation; Wave 3 wires INVOKE_CONNECTOR handler).

import type { ConnectorBinding, Prisma } from "@prisma/client";
import { prisma } from "../client.js";

// WHAT: Input shape for createConnectorBinding.
// INPUT: Used as a parameter type only.
// OUTPUT: None — type only.
// WHY: Service-tier validation happens BEFORE this helper (type
//      against CONNECTOR_REGISTRY, secret_ref_required, admin gate,
//      etc.); the query helper is intentionally thin so the
//      service tier owns all governance.
export interface CreateConnectorBindingInput {
  org_entity_id: string;
  type: string;
  display_name: string;
  config: Prisma.InputJsonValue;
  secret_ref: string | null;
  created_by_entity_id: string;
}

// WHAT: Persist a new ConnectorBinding row.
// INPUT: CreateConnectorBindingInput.
// OUTPUT: Promise<ConnectorBinding>.
// WHY: Wraps the Prisma create call. The @@unique on
//      (org_entity_id, type, display_name) raises a Prisma
//      P2002 error if the caller attempts to register a duplicate
//      under the same display_name; the service tier catches and
//      surfaces a typed code.
export async function createConnectorBinding(
  input: CreateConnectorBindingInput,
): Promise<ConnectorBinding> {
  return prisma.connectorBinding.create({
    data: {
      org_entity_id: input.org_entity_id,
      type: input.type,
      display_name: input.display_name,
      config: input.config,
      secret_ref: input.secret_ref,
      created_by_entity_id: input.created_by_entity_id,
    },
  });
}

// WHAT: Fetch a single ConnectorBinding by binding_id scoped to an
//        org. Excludes soft-deleted rows.
// INPUT: binding_id + org_entity_id.
// OUTPUT: Promise<ConnectorBinding | null>.
// WHY: Org-scoped lookup so cross-org probes for binding_ids
//      naturally collapse to null (the service tier then maps to
//      an enumeration-safe 404). Soft-deleted rows are excluded
//      so an operator who soft-deleted a binding cannot resurrect
//      it via PATCH; re-registration is the supported path.
export async function getConnectorBindingForOrg(
  binding_id: string,
  org_entity_id: string,
): Promise<ConnectorBinding | null> {
  return prisma.connectorBinding.findFirst({
    where: {
      binding_id,
      org_entity_id,
      deleted_at: null,
    },
  });
}

// WHAT: List ConnectorBindings for an org.
// INPUT: org_entity_id + optional filters.
// OUTPUT: Promise<ConnectorBinding[]>.
// WHY: Default lists active (deleted_at == null) bindings ordered
//      by created_at DESC. Optional enabled filter narrows further;
//      a future wave may add pagination if the list grows large.
export async function listConnectorBindingsForOrg(
  org_entity_id: string,
  opts: { enabled?: boolean } = {},
): Promise<ConnectorBinding[]> {
  return prisma.connectorBinding.findMany({
    where: {
      org_entity_id,
      deleted_at: null,
      ...(opts.enabled === undefined ? {} : { enabled: opts.enabled }),
    },
    orderBy: { created_at: "desc" },
  });
}

// WHAT: Update mutable fields on a binding scoped to an org.
// INPUT: binding_id + org_entity_id + patch.
// OUTPUT: Promise<ConnectorBinding | null> (null when no row).
// WHY: Org-scoped updateMany returns a count, not the row —
//      we re-fetch after the update so the service tier can echo
//      the post-update view back to the caller. config + secret_ref
//      + enabled + display_name are the only patchable fields;
//      type is immutable after creation (re-register if you need a
//      different type).
export async function updateConnectorBindingForOrg(
  binding_id: string,
  org_entity_id: string,
  patch: {
    display_name?: string;
    config?: Prisma.InputJsonValue;
    secret_ref?: string | null;
    enabled?: boolean;
  },
): Promise<ConnectorBinding | null> {
  const data: Prisma.ConnectorBindingUpdateManyMutationInput = {};
  if (patch.display_name !== undefined) data.display_name = patch.display_name;
  if (patch.config !== undefined) data.config = patch.config;
  if (patch.secret_ref !== undefined) data.secret_ref = patch.secret_ref;
  if (patch.enabled !== undefined) data.enabled = patch.enabled;
  const result = await prisma.connectorBinding.updateMany({
    where: { binding_id, org_entity_id, deleted_at: null },
    data,
  });
  if (result.count === 0) return null;
  return getConnectorBindingForOrg(binding_id, org_entity_id);
}

// WHAT: Soft-delete a binding scoped to an org (RULE 10).
// INPUT: binding_id + org_entity_id.
// OUTPUT: Promise<boolean> — true if a row was soft-deleted.
// WHY: Soft-delete via deleted_at timestamp; the row stays for
//      audit forensics + uniqueness constraint enforcement (a new
//      binding with the same display_name + type cannot re-use the
//      slot until either the unique key is changed or the existing
//      row is hard-deleted, which is intentionally not supported).
export async function softDeleteConnectorBindingForOrg(
  binding_id: string,
  org_entity_id: string,
): Promise<boolean> {
  const result = await prisma.connectorBinding.updateMany({
    where: { binding_id, org_entity_id, deleted_at: null },
    data: { deleted_at: new Date() },
  });
  return result.count > 0;
}
