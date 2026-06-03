// FILE: entitlement-check.service.ts
// PURPOSE: Section 8 Billing Completion B5-α per ADR-0093 §5
//          Candidate A. The single entitlement-check service-tier
//          helper that future capability consumers (Section 4
//          connector activation, Dandelion D2-D8, Workflow Stage
//          3+, etc.) invoke at their authorization boundary.
//
//          Composes against the RULE 5 precedence chain:
//          auth → clearance → ENTITLEMENT → permission → policy
//          The entitlement check is the BILLING gate; downstream
//          permission + policy checks are the GOVERNANCE gates.
//          Both must pass for execution per ADR-0083 §1 line 6:
//          "Billing entitles availability; governance authorizes
//          safe use."
//
//          NEVER denies the §10 always-allow base-tier features
//          per ADR-0093: audit chain read + verify-chain at
//          self-scope + DMW auto-provisioning + LawfulBasis
//          attestation + soft-delete + Permission revocation +
//          voice-intent envelope construction at VF.4 LIVE.
//
// CONNECTS TO:
//   - packages/database (prisma.entitlement.findUnique +
//     writeAuditEvent for ENTITLEMENT_CHECK_DENIED)
//   - apps/api/src/services/governance/org.ts (getOrgEntityId)
//   - ADR-0093 §5 Candidate A + §6 §10
//   - ADR-0042 §Q-γ.1 clean-transition (audit literal extension)

import { prisma, writeAuditEvent } from "@niov/database";
import { getOrgEntityId } from "../governance/org.js";

// WHAT: The closed-vocab list of base-tier features that
//        Entitlement checks MUST NEVER deny, regardless of the
//        caller's plan or capability packs.
// INPUT: Used as a value namespace.
// OUTPUT: None.
// WHY: ADR-0093 §10 inviolable list per Founder direction
//      "Customers should not pay extra just to have memory be
//      safe." The 7 always-allow features map to the LIVE
//      Foundation base-tier substrate and are never gated by
//      billing — even an org without an Entitlement row gets
//      these.
export const ALWAYS_ALLOW_BASE_TIER_FEATURES: ReadonlySet<string> = new Set([
  "audit_baseline",
  "audit_chain_read",
  "audit_verify_chain_self_scope",
  "DMW_baseline_safety",
  "DMW_auto_provisioning",
  "Foundation_safety_baseline",
  "lawful_basis_attestation",
  "soft_delete",
  "permission_revocation",
  "voice_intent_envelope_vf4",
]);

export type EntitlementCheckResult =
  | {
      ok: true;
      entitled: true;
      reason:
        | "ALWAYS_ALLOW_BASE_TIER"
        | "FEATURE_ENTITLED"
        | "CAPABILITY_PACK_OWNED"
        | "NO_ENTITLEMENT_ROW_BACKWARD_COMPAT";
    }
  | {
      ok: false;
      code: "ENTITLEMENT_INSUFFICIENT";
      httpStatus: 403;
      reason_code:
        | "NO_ENTITLEMENT_ROW"
        | "FEATURE_NOT_ENTITLED"
        | "CAPABILITY_PACK_NOT_OWNED";
      feature_id: string;
      org_entity_id: string;
    };

// WHAT: Parse a feature_id of the shape `prefix:capability_pack_id`
//        into its components.
// INPUT: A feature_id string from the B2 catalog vocabulary.
// OUTPUT: { prefix, pack_id } if the feature_id includes a
//         `:capability_pack_id` suffix; null otherwise.
// WHY: The B2 catalog uses `connector_activation:SLACK_READ`-style
//      feature ids that bind a capability pack family to a
//      specific provider. The first colon segment names the
//      capability category; the second names the pack/provider.
function parseCapabilityScopedFeatureId(
  feature_id: string,
): { prefix: string; pack_id: string } | null {
  const idx = feature_id.indexOf(":");
  if (idx <= 0 || idx === feature_id.length - 1) return null;
  return {
    prefix: feature_id.slice(0, idx),
    pack_id: feature_id.slice(idx + 1),
  };
}

// WHAT: The minimal Entitlement row shape this service consumes.
// INPUT: Mirrors Prisma's auto-generated type but typed
//        defensively against the Json field.
// OUTPUT: Used as a parameter type.
// WHY: The service operates on this shape; tests can fake-inject
//      via the DI hook below without depending on the full
//      Prisma client.
export interface EntitlementRowShape {
  org_entity_id: string;
  plan_archetype_id: string;
  feature_entitlements: Record<string, unknown>;
  capability_packs: string[];
}

// WHAT: DI hook for unit-tier tests. When set, the service uses
//        this loader instead of hitting Prisma. setEntitlementLoaderForTests
//        is the canonical way to override the loader for unit tests
//        (mirrors the FixtureBasedLLMProvider pattern per ADR-0014).
// INPUT: A function (org_entity_id) -> Promise<row | null>, or null
//        to revert to disk-backed Prisma.
// OUTPUT: None.
// WHY: The entitlement check is pure decision logic once the
//      Entitlement row is loaded. Unit tests benefit from injecting
//      a fake row without standing up Prisma.
let CACHED_LOADER:
  | ((org_entity_id: string) => Promise<EntitlementRowShape | null>)
  | null = null;

export function setEntitlementLoaderForTests(
  loader:
    | ((org_entity_id: string) => Promise<EntitlementRowShape | null>)
    | null,
): void {
  CACHED_LOADER = loader;
}

async function loadEntitlement(
  org_entity_id: string,
): Promise<EntitlementRowShape | null> {
  if (CACHED_LOADER !== null) return CACHED_LOADER(org_entity_id);
  const row = await prisma.entitlement.findUnique({
    where: { org_entity_id },
  });
  if (row === null) return null;
  return {
    org_entity_id: row.org_entity_id,
    plan_archetype_id: row.plan_archetype_id,
    feature_entitlements: row.feature_entitlements as Record<string, unknown>,
    capability_packs: row.capability_packs,
  };
}

// WHAT: Pure decision function — evaluate whether a feature_id is
//        entitled given an Entitlement row.
// INPUT: feature_id + entitlement row (or null if no row exists).
// OUTPUT: An EntitlementCheckResult.
// WHY: Composable, side-effect-free decision logic separated from
//      the IO (Prisma load + audit write) so unit tests can lock
//      the threshold logic without DB or audit-write infra.
export function evaluateEntitlement(
  feature_id: string,
  row: EntitlementRowShape | null,
  org_entity_id: string,
): EntitlementCheckResult {
  if (ALWAYS_ALLOW_BASE_TIER_FEATURES.has(feature_id)) {
    return { ok: true, entitled: true, reason: "ALWAYS_ALLOW_BASE_TIER" };
  }
  if (row === null) {
    return {
      ok: false,
      code: "ENTITLEMENT_INSUFFICIENT",
      httpStatus: 403,
      reason_code: "NO_ENTITLEMENT_ROW",
      feature_id,
      org_entity_id,
    };
  }
  const feature_value = row.feature_entitlements[feature_id];
  if (feature_value === true) {
    return { ok: true, entitled: true, reason: "FEATURE_ENTITLED" };
  }
  if (feature_value === false) {
    return {
      ok: false,
      code: "ENTITLEMENT_INSUFFICIENT",
      httpStatus: 403,
      reason_code: "FEATURE_NOT_ENTITLED",
      feature_id,
      org_entity_id,
    };
  }
  // Feature isn't explicitly listed — fall back to capability-pack
  // scoping when the feature_id is of the `prefix:pack_id` shape.
  const scoped = parseCapabilityScopedFeatureId(feature_id);
  if (scoped !== null && row.capability_packs.includes(scoped.pack_id)) {
    return { ok: true, entitled: true, reason: "CAPABILITY_PACK_OWNED" };
  }
  return {
    ok: false,
    code: "ENTITLEMENT_INSUFFICIENT",
    httpStatus: 403,
    reason_code:
      scoped !== null ? "CAPABILITY_PACK_NOT_OWNED" : "FEATURE_NOT_ENTITLED",
    feature_id,
    org_entity_id,
  };
}

// WHAT: The public entitlement check. Resolves the caller's org,
//        loads the Entitlement row, evaluates the decision, and
//        emits ENTITLEMENT_CHECK_DENIED on failure.
// INPUT: caller entity_id + feature_id from the B2 catalog.
// OUTPUT: EntitlementCheckResult. The caller MUST handle both
//         branches; on `ok: false` the caller surfaces 403
//         ENTITLEMENT_INSUFFICIENT to the user.
// WHY: ADR-0093 §5 Candidate A canonical helper. Returns 403
//      `ENTITLEMENT_INSUFFICIENT` distinct from generic FORBIDDEN
//      so the consumer surface can render "your plan does not
//      include this capability" copy rather than "you don't have
//      permission" (which is the permission-check failure mode).
export async function assertEntitledForCaller(
  callerEntityId: string,
  feature_id: string,
): Promise<EntitlementCheckResult> {
  const org_entity_id = await getOrgEntityId(callerEntityId);
  const row = await loadEntitlement(org_entity_id);
  const result = evaluateEntitlement(feature_id, row, org_entity_id);
  if (result.ok === false) {
    await writeAuditEvent({
      event_type: "ENTITLEMENT_CHECK_DENIED",
      outcome: "DENIED",
      actor_entity_id: callerEntityId,
      target_entity_id: org_entity_id,
      details: {
        org_entity_id,
        feature_id: result.feature_id,
        plan_archetype_id: row?.plan_archetype_id ?? null,
        reason_code: result.reason_code,
      },
    });
  }
  return result;
}

// WHAT: Soft-gate entitlement check for consumer surfaces wiring
//        the Entitlement system into pre-existing flows where some
//        orgs may pre-date Entitlement row creation.
// INPUT: Pre-resolved org_entity_id (caller's route already
//        resolved it) + actor_entity_id (audit attribution) +
//        feature_id (B2 catalog vocab).
// OUTPUT: EntitlementCheckResult — with NEW reason
//         "NO_ENTITLEMENT_ROW_BACKWARD_COMPAT" for the no-row case
//         instead of the hard deny.
// WHY: A hard rollout of EntitlementCheck at every consumer would
//      deny every pre-billing org. Soft-gate lets the substrate be
//      wired without breaking existing flows: no row → allow with
//      explicit backward-compat reason; row exists → normal
//      evaluation. When a denial occurs, ENTITLEMENT_CHECK_DENIED
//      audit fires (RULE 4); backward-compat allows do NOT emit
//      audit because no deny event occurred.
//      The reason_code on the ok branch is observable downstream
//      so consumers can record / report backward-compat invocations
//      separately from genuinely entitled ones.
export async function assertEntitledForOrgSoftGate(args: {
  org_entity_id: string;
  actor_entity_id: string;
  feature_id: string;
}): Promise<EntitlementCheckResult> {
  const { org_entity_id, actor_entity_id, feature_id } = args;
  const row = await loadEntitlement(org_entity_id);
  if (row === null && !ALWAYS_ALLOW_BASE_TIER_FEATURES.has(feature_id)) {
    return {
      ok: true,
      entitled: true,
      reason: "NO_ENTITLEMENT_ROW_BACKWARD_COMPAT",
    };
  }
  const result = evaluateEntitlement(feature_id, row, org_entity_id);
  if (result.ok === false) {
    await writeAuditEvent({
      event_type: "ENTITLEMENT_CHECK_DENIED",
      outcome: "DENIED",
      actor_entity_id,
      target_entity_id: org_entity_id,
      details: {
        org_entity_id,
        feature_id: result.feature_id,
        plan_archetype_id: row?.plan_archetype_id ?? null,
        reason_code: result.reason_code,
      },
    });
  }
  return result;
}
