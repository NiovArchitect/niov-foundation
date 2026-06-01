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
import { registerConnectorBindingForOrg } from "../connector/connector-binding.service.js";

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
  | "AUDIT_WRITE_FAILED"
  // D6 team archetype additions — only fire from the team activation
  // path. The starter-pilot path never emits these.
  | "INVALID_SLACK_BINDING_INPUT"
  | "CONNECTOR_BINDING_FAILED"
  // D6 business archetype additions — fire from the business
  // activation path when the Google Workspace binding input is
  // missing. CONNECTOR_BINDING_FAILED covers downstream failures
  // for either connector step (the failure message text identifies
  // which connector failed).
  | "INVALID_GOOGLE_BINDING_INPUT";

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
const SUPPORTED_ARCHETYPES = new Set(["starter-pilot", "team", "business"]);
const KNOWN_ARCHETYPES = new Set([
  "starter-pilot",
  "team",
  "business",
  "enterprise",
]);

const CATALOG_FILENAMES: Readonly<Record<string, string>> = Object.freeze({
  "starter-pilot": "starter-pilot-activation.json",
  team: "team-activation.json",
  business: "business-activation.json",
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

// ────────────────────────────────────────────────────────────────
// Team-archetype activation input shape.
//
// The team archetype's catalog step 5 is
// step.connector.slack-binding-register — it requires the admin to
// supply a SLACK_READ binding display_name + secret_ref env-var-NAME
// so the activation engine can register the binding via the existing
// connector-binding.service.ts (C2 OPERATING substrate). Per the
// Foundation privacy invariant:
// - The admin paste-in field is the env-var NAME on the deployment
//   host (e.g. "SLACK_BOT_TOKEN_PROD"); the resolved env-var VALUE
//   never crosses the API boundary (admin must NEVER paste a raw
//   token here).
// - The connector binding is registered with use_real: false at
//   activation tier. Founder authorization is required separately
//   at the deployment register for the GOOGLE_USE_REAL=1 /
//   SLACK_USE_REAL=1 real-mode flip.
// ────────────────────────────────────────────────────────────────
export interface TeamActivationInput {
  /** display_name for the SLACK_READ binding (e.g. "niov-prod-slack"). */
  slack_display_name: string;
  /** Env-var NAME for the SLACK_READ binding secret_ref. */
  slack_secret_ref: string;
  /** Optional workspace_id config; defaults to slack_display_name. */
  slack_workspace_id?: string;
}

// ────────────────────────────────────────────────────────────────
// executeTeamActivationForCaller — second archetype entry point.
// Walks the 8 team-archetype catalog steps; step 5 is the only one
// that performs a real downstream side effect (SLACK_READ binding
// registration via connector-binding.service.ts). All other steps
// emit audit only — matching the starter-pilot doctrine of
// reversibility-by-construction at the audit-chain register.
//
// AUDIT INVARIANT (RULE 4): every step's audit is written BEFORE
// the underlying side effect. The slack-binding step's downstream
// registerConnectorBindingForOrg call writes its own ADMIN_ACTION
// audit row (CONNECTOR_REGISTERED) on success; the activation
// step's CONNECTOR_BINDING_REGISTERED audit fires BEFORE that
// downstream call. The connector-binding service is the single
// source of truth for the binding row + its CONNECTOR_REGISTERED
// audit; this service's CONNECTOR_BINDING_REGISTERED is the
// activation-plan-tier provenance entry (links the audit chain
// back to the activation lineage).
// ────────────────────────────────────────────────────────────────
export async function executeTeamActivationForCaller(
  callerEntityId: string,
  input: TeamActivationInput,
): Promise<ActivationResult> {
  const archetype = "team";

  // 0. Validate team-specific input BEFORE the auth gate — closed-
  //    vocab failure code is more informative than a generic 422.
  const displayName = input.slack_display_name?.trim?.() ?? "";
  const secretRef = input.slack_secret_ref?.trim?.() ?? "";
  if (displayName.length === 0 || secretRef.length === 0) {
    return {
      ok: false,
      code: "INVALID_SLACK_BINDING_INPUT",
      message:
        "team archetype requires slack_display_name + slack_secret_ref",
    };
  }

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

  // 3. Walk steps in order. Step 5 (step.connector.slack-binding-
  //    register) is the only side-effecting step at this slice; all
  //    others emit audit only.
  const stepResults: ActivationStepResult[] = [];
  for (const step of plan.activation_steps) {
    const detailsAction = extractDetailsAction(step.audit_literal);
    let auditDetails: Record<string, unknown> = {
      action: detailsAction,
      archetype,
      plan_id: plan.id,
      step_order: step.step_order,
      step_id: step.step_id,
      consumes_map_type: step.consumes_map_type,
      human_authorization_required: step.human_authorization_required,
    };
    // For the slack binding step, augment the audit details with the
    // binding shape we're about to register (env-var NAME ONLY; the
    // resolved VALUE never crosses this boundary).
    if (step.step_id === "step.connector.slack-binding-register") {
      auditDetails = {
        ...auditDetails,
        connector_type: "SLACK_READ",
        binding_display_name: displayName,
        // We deliberately do NOT include secret_ref VALUE; only the
        // NAME (which is acceptable per the existing audit-view
        // service's CONNECTOR_REGISTERED emission pattern). The
        // downstream registerConnectorBindingForOrg also persists
        // env-var NAME only.
        binding_secret_ref_name: secretRef,
      };
    }
    let auditRowId: string;
    try {
      const auditRow = await writeAuditEvent({
        event_type: "ADMIN_ACTION",
        outcome: "SUCCESS",
        actor_entity_id: callerEntityId,
        target_entity_id: callerOrgId,
        details: auditDetails,
      });
      auditRowId = auditRow.audit_id;
    } catch (err) {
      const msg = err instanceof Error ? err.message.slice(0, 120) : "unknown";
      return {
        ok: false,
        code: "AUDIT_WRITE_FAILED",
        message: `audit emission failed at step ${step.step_order} (${step.step_id}): ${msg}`,
      };
    }
    // After the audit row is written (RULE 4 audit-before-mutation
    // satisfied), perform the side effect for the slack-binding
    // step. Any other step is audit-only.
    if (step.step_id === "step.connector.slack-binding-register") {
      const workspaceId =
        input.slack_workspace_id !== undefined &&
        input.slack_workspace_id.trim().length > 0
          ? input.slack_workspace_id.trim()
          : displayName;
      const registration = await registerConnectorBindingForOrg({
        org_entity_id: callerOrgId,
        actor_entity_id: callerEntityId,
        body: {
          type: "SLACK_READ",
          display_name: displayName,
          config: { use_real: false, workspace_id: workspaceId },
          secret_ref: secretRef,
        },
      });
      if (!registration.ok) {
        return {
          ok: false,
          code: "CONNECTOR_BINDING_FAILED",
          message: `slack binding registration failed: ${registration.code}${registration.message ? " — " + registration.message : ""}`,
        };
      }
    }
    stepResults.push({
      step_order: step.step_order,
      step_id: step.step_id,
      audit_literal: step.audit_literal,
      audit_event_id: auditRowId,
    });
  }

  // 4. Final step invariant (defense-in-depth against catalog drift)
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

// ────────────────────────────────────────────────────────────────
// Business-archetype activation input shape.
//
// The business archetype's 11-step catalog requires two real
// ConnectorBinding registrations:
// - Step 6 step.connector.slack-binding-register → SLACK_READ
//   (consumes C2 OPERATING per Foundation PR #185)
// - Step 7 step.connector.google-workspace-binding-register →
//   GOOGLE_WORKSPACE_READ (consumes C3 RUNTIME_READY per Foundation
//   PR #193)
//
// Both bindings persist with secret_ref env-var-NAME ONLY. The
// resolved env-var VALUE never crosses the API boundary. Both
// bindings are registered with use_real: false at activation tier
// (Founder authorizes SLACK_USE_REAL=1 / GOOGLE_USE_REAL=1
// real-mode flips separately at the deployment register).
//
// Step 5 step.authority.delegated-profile-register + step 9
// step.audit.advanced-tier-enable both emit audit-only at this
// slice (the underlying tables — DelegatedAuthorityProfile +
// OrgSettings.advanced_audit_tier — are forward-substrate at
// later slices). The audit chain records the intent at the
// authoritative tier; later slices fill in the substrate.
// ────────────────────────────────────────────────────────────────
export interface BusinessActivationInput {
  /** display_name for the SLACK_READ binding (step 6). */
  slack_display_name: string;
  /** Env-var NAME for the SLACK_READ binding secret_ref (step 6). */
  slack_secret_ref: string;
  /** Optional Slack workspace_id config; defaults to slack_display_name. */
  slack_workspace_id?: string;
  /** display_name for the GOOGLE_WORKSPACE_READ binding (step 7). */
  google_display_name: string;
  /** Env-var NAME for the GOOGLE_WORKSPACE_READ binding secret_ref (step 7). */
  google_secret_ref: string;
  /** Optional Google workspace_domain config; defaults to google_display_name. */
  google_workspace_domain?: string;
}

// ────────────────────────────────────────────────────────────────
// executeBusinessActivationForCaller — third archetype entry point.
// Walks the 11 business-archetype catalog steps. Steps 6 + 7
// perform real downstream side effects (Slack + Google connector
// binding registrations); all other steps emit audit only.
//
// PARTIAL FAILURE SEMANTICS: If step 6 (Slack) succeeds but step 7
// (Google) fails, the Slack binding row remains LIVE. The failure
// response names which connector failed in the message. A future
// slice may add automatic rollback via soft-delete; at this slice
// the partial state is honest at the audit chain register and the
// operator can soft-delete the orphaned binding via the existing
// admin /api/v1/org/connectors/:id route.
// ────────────────────────────────────────────────────────────────
export async function executeBusinessActivationForCaller(
  callerEntityId: string,
  input: BusinessActivationInput,
): Promise<ActivationResult> {
  const archetype = "business";

  const slackDisplayName = input.slack_display_name?.trim?.() ?? "";
  const slackSecretRef = input.slack_secret_ref?.trim?.() ?? "";
  if (slackDisplayName.length === 0 || slackSecretRef.length === 0) {
    return {
      ok: false,
      code: "INVALID_SLACK_BINDING_INPUT",
      message: "business archetype requires slack_display_name + slack_secret_ref",
    };
  }
  const googleDisplayName = input.google_display_name?.trim?.() ?? "";
  const googleSecretRef = input.google_secret_ref?.trim?.() ?? "";
  if (googleDisplayName.length === 0 || googleSecretRef.length === 0) {
    return {
      ok: false,
      code: "INVALID_GOOGLE_BINDING_INPUT",
      message: "business archetype requires google_display_name + google_secret_ref",
    };
  }

  const callerOrgId = await getCallerOrgId(callerEntityId);
  if (callerOrgId === null) {
    return { ok: false, code: "CALLER_ENTITY_NOT_FOUND", message: "caller entity not found" };
  }
  const isAdmin = await callerHasAdminCapability(callerEntityId);
  if (!isAdmin) {
    return { ok: false, code: "NOT_ADMIN", message: "caller lacks can_admin_org capability" };
  }

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

  const stepResults: ActivationStepResult[] = [];
  for (const step of plan.activation_steps) {
    const detailsAction = extractDetailsAction(step.audit_literal);
    let auditDetails: Record<string, unknown> = {
      action: detailsAction,
      archetype,
      plan_id: plan.id,
      step_order: step.step_order,
      step_id: step.step_id,
      consumes_map_type: step.consumes_map_type,
      human_authorization_required: step.human_authorization_required,
    };
    if (step.step_id === "step.connector.slack-binding-register") {
      auditDetails = {
        ...auditDetails,
        connector_type: "SLACK_READ",
        binding_display_name: slackDisplayName,
        binding_secret_ref_name: slackSecretRef,
      };
    }
    if (step.step_id === "step.connector.google-workspace-binding-register") {
      auditDetails = {
        ...auditDetails,
        connector_type: "GOOGLE_WORKSPACE_READ",
        binding_display_name: googleDisplayName,
        binding_secret_ref_name: googleSecretRef,
      };
    }
    let auditRowId: string;
    try {
      const auditRow = await writeAuditEvent({
        event_type: "ADMIN_ACTION",
        outcome: "SUCCESS",
        actor_entity_id: callerEntityId,
        target_entity_id: callerOrgId,
        details: auditDetails,
      });
      auditRowId = auditRow.audit_id;
    } catch (err) {
      const msg = err instanceof Error ? err.message.slice(0, 120) : "unknown";
      return {
        ok: false,
        code: "AUDIT_WRITE_FAILED",
        message: `audit emission failed at step ${step.step_order} (${step.step_id}): ${msg}`,
      };
    }
    if (step.step_id === "step.connector.slack-binding-register") {
      const workspaceId =
        input.slack_workspace_id !== undefined &&
        input.slack_workspace_id.trim().length > 0
          ? input.slack_workspace_id.trim()
          : slackDisplayName;
      const registration = await registerConnectorBindingForOrg({
        org_entity_id: callerOrgId,
        actor_entity_id: callerEntityId,
        body: {
          type: "SLACK_READ",
          display_name: slackDisplayName,
          config: { use_real: false, workspace_id: workspaceId },
          secret_ref: slackSecretRef,
        },
      });
      if (!registration.ok) {
        return {
          ok: false,
          code: "CONNECTOR_BINDING_FAILED",
          message: `slack binding registration failed: ${registration.code}${registration.message ? " — " + registration.message : ""}`,
        };
      }
    }
    if (step.step_id === "step.connector.google-workspace-binding-register") {
      const workspaceDomain =
        input.google_workspace_domain !== undefined &&
        input.google_workspace_domain.trim().length > 0
          ? input.google_workspace_domain.trim()
          : googleDisplayName;
      const registration = await registerConnectorBindingForOrg({
        org_entity_id: callerOrgId,
        actor_entity_id: callerEntityId,
        body: {
          type: "GOOGLE_WORKSPACE_READ",
          display_name: googleDisplayName,
          config: { use_real: false, workspace_domain: workspaceDomain },
          secret_ref: googleSecretRef,
        },
      });
      if (!registration.ok) {
        return {
          ok: false,
          code: "CONNECTOR_BINDING_FAILED",
          message: `google workspace binding registration failed: ${registration.code}${registration.message ? " — " + registration.message : ""}`,
        };
      }
    }
    stepResults.push({
      step_order: step.step_order,
      step_id: step.step_id,
      audit_literal: step.audit_literal,
      audit_event_id: auditRowId,
    });
  }

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
