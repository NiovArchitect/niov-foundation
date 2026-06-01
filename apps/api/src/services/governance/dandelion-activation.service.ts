// FILE: dandelion-activation.service.ts
// PURPOSE: D6 Dandelion Stage F activation runtime — first slice.
//          Loads the starter-pilot ActivationPlan catalog from disk
//          at runtime, walks its 6 ordered steps, and emits one
//          ADMIN_ACTION audit event per step (BEFORE-mutation per
//          RULE 4) using details.action discriminators that mirror
//          the catalog's audit_literal strings without extending
//          AUDIT_EVENT_TYPE_VALUES.
//
//          What this slice DOES at runtime:
//          - Read docs/dandelion-activation/starter-pilot-activation.json
//          - Verify caller capabilities (can_admin_org) + envelope
//            ownership boundary (caller's org_entity_id) via the
//            service-owned auth gate pattern per ADR-0004
//          - Walk the 6 catalog steps; emit one ADMIN_ACTION audit
//            per step
//          - Return the discriminated-union ActivationResult with
//            the audit_event_id list (the activation lineage)
//
//          What this slice DOES NOT do (forward-substrate):
//          - Create real DMW grants / role assignments / workflow
//            template registrations / aha moment registrations
//            (those underlying tables are forward-substrate at
//            later slices)
//          - Persist an "envelope state" row (no new Prisma table
//            at this slice; "ACTIVATED" is provable by walking the
//            audit chain)
//          - Extend AUDIT_EVENT_TYPE_VALUES (RULE 4 is satisfied by
//            details.action discriminators per the existing
//            audit-view.service.ts pattern)
//          - Activate team / business / enterprise archetypes (those
//            archetypes carry connector binding + delegated authority
//            + dual-control steps; smallest blast radius starts here)
//
// CONNECTS TO:
//   - docs/dandelion-activation/starter-pilot-activation.json (catalog)
//   - packages/database/src/queries/audit.ts (writeAuditEvent)
//   - apps/api/src/services/auth.service.ts (caller TAR lookup)
//   - apps/api/src/routes/governance.routes.ts (HTTP entry; later
//     slice; this slice is service-only)

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeAuditEvent, prisma } from "@niov/database";

// ESM-safe equivalent of CJS __dirname (target ES2022 + moduleResolution
// Bundler per tsconfig.base.json).
const __dirname = dirname(fileURLToPath(import.meta.url));

// ────────────────────────────────────────────────────────────────
// Catalog shape (mirror of activation.schema.json starter-pilot
// subset; we keep the type local to this service so the catalog
// is a single source of truth on disk + the service is decoupled
// from any JSON Schema validator dependency).
// ────────────────────────────────────────────────────────────────
interface CatalogActivationStep {
  step_order: number;
  step_id: string;
  step_name: string;
  step_purpose: string;
  consumes_map_type: string;
  produces_runtime_object: string;
  human_authorization_required: boolean;
  audit_literal: string;
  preconditions: ReadonlyArray<string>;
  postconditions: ReadonlyArray<string>;
  failure_mode: string;
  rollback_path: string;
}

interface CatalogActivationPlan {
  id: string;
  plan_archetype_id: string;
  activation_steps: ReadonlyArray<CatalogActivationStep>;
  activation_state: string;
}

interface CatalogWrapper {
  kind: string;
  activation_plan: CatalogActivationPlan;
}

// ────────────────────────────────────────────────────────────────
// Result shapes — closed-vocab failure codes mirror the existing
// service-tier error class discipline (auth.service.ts +
// connector-binding.service.ts).
// ────────────────────────────────────────────────────────────────
export type ActivationFailureCode =
  | "NOT_ADMIN"
  | "CALLER_ENTITY_NOT_FOUND"
  | "CALLER_NOT_IN_ORG"
  | "ARCHETYPE_UNKNOWN"
  | "CATALOG_NOT_FOUND"
  | "CATALOG_MALFORMED"
  | "AUDIT_WRITE_FAILED";

export interface ActivationStepResult {
  step_order: number;
  step_id: string;
  audit_literal: string;
  audit_event_id: string;
}

export interface ActivationSuccess {
  ok: true;
  archetype: string;
  plan_id: string;
  steps: ReadonlyArray<ActivationStepResult>;
  /** The audit_event_id of the final STARTER_ENVELOPE_ACTIVATED row. */
  activation_audit_event_id: string;
}

export interface ActivationFailure {
  ok: false;
  code: ActivationFailureCode;
  message: string;
}

export type ActivationResult = ActivationSuccess | ActivationFailure;

// ────────────────────────────────────────────────────────────────
// Supported archetypes for this slice. Catalog has 4 plan
// archetypes; runtime only supports starter-pilot at this slice.
// Other archetypes are recognized for clearer error reporting but
// return ARCHETYPE_UNKNOWN until their respective implementation
// slices land.
// ────────────────────────────────────────────────────────────────
const SUPPORTED_ARCHETYPES = new Set(["starter-pilot"]);
const KNOWN_ARCHETYPES = new Set([
  "starter-pilot",
  "team",
  "business",
  "enterprise",
]);

const CATALOG_FILENAMES: Readonly<Record<string, string>> = Object.freeze({
  "starter-pilot": "starter-pilot-activation.json",
});

// ────────────────────────────────────────────────────────────────
// Catalog loader — resolves the catalog path relative to the repo
// root. The path is computed from this file's location
// (apps/api/src/services/governance/) so it resolves identically
// in unit tests + production builds.
// ────────────────────────────────────────────────────────────────
function loadActivationPlanFromDisk(
  archetype: string,
): CatalogActivationPlan | { error: ActivationFailureCode; message: string } {
  const filename = CATALOG_FILENAMES[archetype];
  if (filename === undefined) {
    return {
      error: "ARCHETYPE_UNKNOWN",
      message: `archetype "${archetype}" is not supported at this slice`,
    };
  }
  // apps/api/src/services/governance/ → up 4 → repo root
  const repoRoot = resolve(__dirname, "..", "..", "..", "..", "..");
  const catalogPath = resolve(
    repoRoot,
    "docs",
    "dandelion-activation",
    filename,
  );
  let raw: string;
  try {
    raw = readFileSync(catalogPath, "utf8");
  } catch (err) {
    const msg = err instanceof Error ? err.message.slice(0, 120) : "unknown";
    return {
      error: "CATALOG_NOT_FOUND",
      message: `failed to read catalog at ${catalogPath}: ${msg}`,
    };
  }
  let parsed: CatalogWrapper;
  try {
    parsed = JSON.parse(raw) as CatalogWrapper;
  } catch (err) {
    const msg = err instanceof Error ? err.message.slice(0, 120) : "unknown";
    return { error: "CATALOG_MALFORMED", message: `catalog JSON parse failed: ${msg}` };
  }
  if (parsed.kind !== "ActivationPlan" || !parsed.activation_plan) {
    return {
      error: "CATALOG_MALFORMED",
      message: "catalog wrapper missing activation_plan",
    };
  }
  const plan = parsed.activation_plan;
  if (!Array.isArray(plan.activation_steps) || plan.activation_steps.length === 0) {
    return {
      error: "CATALOG_MALFORMED",
      message: "catalog activation_plan has no activation_steps",
    };
  }
  if (plan.plan_archetype_id !== archetype) {
    return {
      error: "CATALOG_MALFORMED",
      message: `catalog plan_archetype_id "${plan.plan_archetype_id}" does not match requested archetype "${archetype}"`,
    };
  }
  // Verify step ordering integrity at runtime as a defense-in-depth
  // check against catalog drift between substrate-update commits.
  for (let i = 0; i < plan.activation_steps.length; i++) {
    if (plan.activation_steps[i].step_order !== i + 1) {
      return {
        error: "CATALOG_MALFORMED",
        message: `step ${i} step_order mismatch (expected ${i + 1}, got ${plan.activation_steps[i].step_order})`,
      };
    }
  }
  return plan;
}

// ────────────────────────────────────────────────────────────────
// Extract the details.action discriminator from the catalog's
// audit_literal. Catalog audit_literal format is
// "ADMIN_ACTION:<DETAILS_ACTION>"; the colon-prefixed sub-string
// becomes the details.action value, consistent with the existing
// audit-view.service.ts pattern (event_type ADMIN_ACTION + a
// details.action discriminator).
// ────────────────────────────────────────────────────────────────
function extractDetailsAction(auditLiteral: string): string {
  const ix = auditLiteral.indexOf(":");
  if (ix < 0) return auditLiteral;
  return auditLiteral.slice(ix + 1);
}

// ────────────────────────────────────────────────────────────────
// Service-owned auth gate per ADR-0004. The route layer hands the
// callerEntityId resolved from a verified bearer token; the service
// re-checks the TAR via Prisma (the route's token claims are stale
// from the moment they were issued; the TAR is authoritative).
// ────────────────────────────────────────────────────────────────
async function callerHasAdminCapability(
  callerEntityId: string,
): Promise<boolean> {
  const tar = await prisma.tokenAttributeRepository.findUnique({
    where: { entity_id: callerEntityId },
    select: { can_admin_org: true },
  });
  return tar?.can_admin_org === true;
}

async function getCallerOrgId(
  callerEntityId: string,
): Promise<string | null> {
  // Walk EntityMembership: caller is the child; the parent is the
  // org. Foundation onboarding establishes exactly one COMPANY-tier
  // parent membership per admin entity at Dandelion Phase 0.
  const membership = await prisma.entityMembership.findFirst({
    where: { child_id: callerEntityId, is_active: true, is_admin: true },
    select: { parent_id: true },
  });
  return membership?.parent_id ?? null;
}

// ────────────────────────────────────────────────────────────────
// executeStarterPilotActivationForCaller — the service entry point.
// Loads the catalog, verifies caller, walks the 6 steps emitting
// one ADMIN_ACTION audit per step. Returns the ActivationResult
// discriminated union.
//
// AUDIT INVARIANT (RULE 4): every step's audit is written BEFORE
// any downstream side effect at that step. This slice emits audit
// only (no runtime side effects beyond audit events); the
// invariant is satisfied trivially. Later slices that add real
// DMW / role / template / connector side effects MUST keep audit-
// before-mutation.
//
// REVERSIBILITY (RULE 10): no rows are mutated except the
// append-only audit_events. The catalog's rollback_path strings
// are forward-substrate guidance for later slices.
// ────────────────────────────────────────────────────────────────
export async function executeStarterPilotActivationForCaller(
  callerEntityId: string,
): Promise<ActivationResult> {
  const archetype = "starter-pilot";

  // 1. Auth gate per ADR-0004
  const callerOrgId = await getCallerOrgId(callerEntityId);
  if (callerOrgId === null) {
    return {
      ok: false,
      code: "CALLER_ENTITY_NOT_FOUND",
      message: "caller entity not found",
    };
  }
  const isAdmin = await callerHasAdminCapability(callerEntityId);
  if (!isAdmin) {
    return {
      ok: false,
      code: "NOT_ADMIN",
      message: "caller lacks can_admin_org capability",
    };
  }

  // 2. Catalog load
  if (!SUPPORTED_ARCHETYPES.has(archetype) || !KNOWN_ARCHETYPES.has(archetype)) {
    return {
      ok: false,
      code: "ARCHETYPE_UNKNOWN",
      message: `archetype "${archetype}" is not supported at this slice`,
    };
  }
  const planOrErr = loadActivationPlanFromDisk(archetype);
  if ("error" in planOrErr) {
    return { ok: false, code: planOrErr.error, message: planOrErr.message };
  }
  const plan = planOrErr;

  // 3. Walk the catalog steps. Each step emits ADMIN_ACTION with
  //    details.action set to the colon-suffix of the catalog's
  //    audit_literal + the step metadata + plan metadata. The
  //    actor_entity_id is the caller; target_entity_id is the
  //    caller's org. The audit row's id is recorded in the result
  //    step list for caller-side activation_lineage assembly.
  const stepResults: ActivationStepResult[] = [];
  for (const step of plan.activation_steps) {
    const detailsAction = extractDetailsAction(step.audit_literal);
    try {
      const auditRow = await writeAuditEvent({
        event_type: "ADMIN_ACTION",
        outcome: "SUCCESS",
        actor_entity_id: callerEntityId,
        target_entity_id: callerOrgId,
        details: {
          action: detailsAction,
          archetype,
          plan_id: plan.id,
          step_order: step.step_order,
          step_id: step.step_id,
          consumes_map_type: step.consumes_map_type,
          human_authorization_required: step.human_authorization_required,
        },
      });
      stepResults.push({
        step_order: step.step_order,
        step_id: step.step_id,
        audit_literal: step.audit_literal,
        audit_event_id: auditRow.audit_id,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message.slice(0, 120) : "unknown";
      return {
        ok: false,
        code: "AUDIT_WRITE_FAILED",
        message: `audit emission failed at step ${step.step_order} (${step.step_id}): ${msg}`,
      };
    }
  }

  // 4. Confirm the final step is STARTER_ENVELOPE_ACTIVATED (matches
  //    validator's final-step invariant). The catalog's last
  //    audit_literal is asserted at validation time; we re-check at
  //    runtime as defense-in-depth.
  const finalStep = stepResults[stepResults.length - 1];
  if (
    finalStep === undefined ||
    finalStep.audit_literal !== "ADMIN_ACTION:STARTER_ENVELOPE_ACTIVATED"
  ) {
    return {
      ok: false,
      code: "CATALOG_MALFORMED",
      message: "final step audit_literal is not STARTER_ENVELOPE_ACTIVATED",
    };
  }

  return {
    ok: true,
    archetype,
    plan_id: plan.id,
    steps: stepResults,
    activation_audit_event_id: finalStep.audit_event_id,
  };
}
