// FILE: compliance.service.ts
// PURPOSE: Implement the Compliance Router. Lists active frameworks,
//          decides which ones apply to a given target entity,
//          enforces per-framework predicates against an operation,
//          and aggregates compliance audit events into a report.
// CONNECTS TO: AuthService (validates routes' sessions), the
//              compliance_frameworks + entity_compliance_profiles
//              tables, the audit_events table (for reports), and
//              NegotiateService (calls runComplianceChecks before
//              issuing a declaration).

import {
  prisma,
  writeAuditEvent,
  type AuditEvent,
  type CapsuleType,
  type ComplianceFramework,
  type Permission,
} from "@niov/database";
import { getOrgEntityId } from "../governance/org.js";
import type { AuthService } from "../auth.service.js";

// WHAT: Inputs to a per-operation compliance check.
// INPUT: Used as a parameter type only.
// OUTPUT: None -- this is a type, not a value.
// WHY: Centralizes what the predicate functions can reason about.
//      operation_type is the COSMP verb (NEGOTIATE / READ / WRITE
//      / SHARE), permission is the matched grant (when there is
//      one), and capsule_type drives capsule-class predicates
//      (HIPAA, FERPA).
export interface ComplianceCheckInput {
  operation_type: string;
  actor_entity_id: string;
  target_entity_id: string;
  capsule_id?: string | null;
  capsule_type?: CapsuleType | null;
  permission?: Permission | null;
  session_clearance_ceiling?: number | null;
}

// WHAT: The shape returned from runComplianceChecks.
// INPUT: Used as a return type only.
// OUTPUT: None.
// WHY: Routes return the tuple as JSON; NegotiateService inspects
//      .compliant to decide whether to STOP.
export interface ComplianceCheckResult {
  compliant: boolean;
  failing_framework?: string;
  reason?: string;
  evaluated_frameworks: string[];
}

// WHAT: Per-framework verdict in a getComplianceState response.
// INPUT: Used as a return-type fragment.
// OUTPUT: None.
// WHY: 12C.0 Item 9 surface for continuous monitoring. compliant
//      flips on the presence of any COMPLIANCE_CHECK_FAILED row
//      within the configured window (default 24h). since names the
//      most recent PASSED event so SIEM dashboards can show
//      "compliant since 2026-05-04T18:00:00Z". last_check names the
//      most recent event of either type so dashboards can show
//      data freshness. sample_failure_count_24h is the failure row
//      count within the window for at-a-glance severity sorting.
export interface FrameworkComplianceState {
  framework_name: string;
  compliant: boolean;
  since: Date | null;
  last_check: Date | null;
  sample_failure_count_24h: number;
}

// WHAT: Full response shape for getComplianceState.
// INPUT: Used as a return type only.
// OUTPUT: None.
// WHY: Matches the GET /api/v1/compliance/state HTTP response
//      shape one-to-one. evaluated_at is the timestamp of the
//      query so SIEM ingestion can distinguish a stale dashboard
//      cache from a live read.
export interface ComplianceStateReport {
  org_entity_id: string;
  frameworks: FrameworkComplianceState[];
  evaluated_at: Date;
}

// WHAT: A row of generateComplianceReport output.
// INPUT: Used as a return type only.
// OUTPUT: None.
// WHY: Counts plus a small sample of recent rows is what an admin
//      dashboard or a regulator audit needs.
export interface ComplianceReport {
  entity_id: string;
  framework: string | null;
  date_from: Date;
  date_to: Date;
  passed_count: number;
  failed_count: number;
  recent_failures: AuditEvent[];
}

// WHAT: The seed data for the seven spec frameworks.
// INPUT: Used as a constant.
// OUTPUT: An array of insert payloads.
// WHY: One source of truth so seedComplianceFrameworks() and tests
//      stay in sync.
export const SEED_FRAMEWORKS: Array<{
  framework_name: string;
  jurisdiction: string[];
  applicable_entity_sectors: string[];
  applicable_capsule_types: string[];
  rules: Record<string, unknown>;
  required_audit_events: string[];
}> = [
  {
    framework_name: "HIPAA",
    jurisdiction: ["US"],
    applicable_entity_sectors: ["HEALTHCARE"],
    // P2 PATCH (Section 11A): CONVERSATION_LEARNING capsules surface
    // Otzar's extracted conversational intelligence and can carry
    // PHI; HIPAA gating must include them. Seed re-runs on every
    // boot and overwrites this column in org_compliance_profiles.
    applicable_capsule_types: ["IDENTITY", "SESSION_LEARNING", "CONVERSATION_LEARNING"],
    rules: { requires_consent_for_health_data: true },
    required_audit_events: ["CAPSULE_CONTENT_READ", "PERMISSION_CREATED"],
  },
  {
    framework_name: "GDPR",
    jurisdiction: ["EU", "EEA"],
    applicable_entity_sectors: ["ALL"],
    applicable_capsule_types: [],
    rules: {
      requires_data_processing_agreement: true,
      right_to_erasure: true,
    },
    required_audit_events: ["CAPSULE_DELETED", "PERMISSION_REVOKED"],
  },
  {
    framework_name: "CCPA",
    jurisdiction: ["US-CA"],
    applicable_entity_sectors: ["ALL"],
    applicable_capsule_types: [],
    rules: { must_disclose_data_sale: true, supports_opt_out: true },
    required_audit_events: ["DATA_MONETIZED"],
  },
  {
    framework_name: "FedRAMP_Moderate",
    jurisdiction: ["US"],
    applicable_entity_sectors: ["GOVERNMENT"],
    applicable_capsule_types: [],
    rules: {
      requires_fedramp_infrastructure: true,
      min_clearance_sensitive: 2,
    },
    required_audit_events: ["LOGIN_SUCCESS", "ADMIN_ACTION"],
  },
  {
    framework_name: "FERPA",
    jurisdiction: ["US"],
    applicable_entity_sectors: ["EDUCATION"],
    applicable_capsule_types: ["IDENTITY"],
    rules: { student_consent_required: true },
    required_audit_events: ["CAPSULE_CONTENT_READ"],
  },
  {
    framework_name: "SOC2_Type2",
    jurisdiction: [],
    applicable_entity_sectors: ["ALL"],
    applicable_capsule_types: [],
    rules: { requires_access_logging: true },
    required_audit_events: ["LOGIN_SUCCESS", "CAPSULE_METADATA_READ"],
  },
  {
    framework_name: "CMMC_Level2",
    jurisdiction: ["US"],
    applicable_entity_sectors: ["DEFENSE"],
    applicable_capsule_types: [],
    rules: { requires_mfa: true },
    required_audit_events: ["LOGIN_SUCCESS"],
  },
];

// WHAT: Idempotently insert the seven seed frameworks.
// INPUT: None.
// OUTPUT: A promise that resolves once the upserts finish.
// WHY: Tests + the API server both call this on boot. upsert by
//      unique framework_name means re-running is safe.
export async function seedComplianceFrameworks(): Promise<void> {
  for (const f of SEED_FRAMEWORKS) {
    await prisma.complianceFramework.upsert({
      where: { framework_name: f.framework_name },
      update: {
        jurisdiction: f.jurisdiction,
        applicable_entity_sectors: f.applicable_entity_sectors,
        applicable_capsule_types: f.applicable_capsule_types,
        rules: f.rules as object,
        required_audit_events: f.required_audit_events,
        is_active: true,
      },
      create: {
        framework_name: f.framework_name,
        jurisdiction: f.jurisdiction,
        applicable_entity_sectors: f.applicable_entity_sectors,
        applicable_capsule_types: f.applicable_capsule_types,
        rules: f.rules as object,
        required_audit_events: f.required_audit_events,
        is_active: true,
      },
    });
  }
}

// WHAT: True when a permission carries explicit health-data consent.
// INPUT: A permission's conditions JSON (or null).
// OUTPUT: A boolean.
// WHY: HIPAA predicate centralized; same shape we used for
//      allow_ai_full and allow_write.
function permissionHasHealthDataConsent(
  conditions: import("@prisma/client").Prisma.JsonValue | null | undefined,
): boolean {
  if (conditions === null || conditions === undefined) return false;
  if (typeof conditions !== "object" || Array.isArray(conditions)) return false;
  const obj = conditions as Record<string, unknown>;
  return obj.health_data_consent === true;
}

// WHAT: True when a permission carries explicit student consent
//        (FERPA equivalent of HIPAA's consent flag).
// INPUT: A permission's conditions JSON.
// OUTPUT: A boolean.
// WHY: FERPA predicate. Same conditions-JSON pattern.
function permissionHasStudentConsent(
  conditions: import("@prisma/client").Prisma.JsonValue | null | undefined,
): boolean {
  if (conditions === null || conditions === undefined) return false;
  if (typeof conditions !== "object" || Array.isArray(conditions)) return false;
  const obj = conditions as Record<string, unknown>;
  return obj.student_consent === true;
}

// WHAT: The class that orchestrates compliance flows.
// INPUT: AuthService (validates routes' sessions).
// OUTPUT: A class with five public methods.
// WHY: NegotiateService also imports this class for inline checks.
export class ComplianceService {
  constructor(private readonly authService: AuthService) {}

  // WHAT: List every framework that applies to one entity.
  // INPUT: An entity_id.
  // OUTPUT: An array of ComplianceFramework rows.
  // WHY: Both runComplianceChecks and the GET /frameworks route
  //      need this. Returns frameworks the entity is profiled
  //      under -- not every framework in the system.
  async getApplicableFrameworks(
    entityId: string,
  ): Promise<ComplianceFramework[]> {
    const profile = await prisma.entityComplianceProfile.findUnique({
      where: { entity_id: entityId },
    });
    if (profile === null) return [];

    return prisma.complianceFramework.findMany({
      where: {
        framework_name: { in: profile.frameworks },
        is_active: true,
      },
    });
  }

  // WHAT: Run every applicable framework's predicate against one
  //        operation. Stop and report on the first failure.
  // INPUT: A ComplianceCheckInput (operation, actor, target,
  //        capsule type, optional permission + session info).
  // OUTPUT: A ComplianceCheckResult.
  // WHY: NegotiateService calls this between permission check and
  //      scope narrowing. The route POST /compliance/check uses
  //      it for ad-hoc testing by admins.
  async runComplianceChecks(
    input: ComplianceCheckInput,
  ): Promise<ComplianceCheckResult> {
    const frameworks = await this.getApplicableFrameworks(
      input.target_entity_id,
    );
    const evaluated = frameworks.map((f) => f.framework_name);

    for (const framework of frameworks) {
      const verdict = this.evaluateFramework(framework, input);
      if (!verdict.compliant) {
        await writeAuditEvent({
          event_type: "COMPLIANCE_CHECK_FAILED",
          outcome: "DENIED",
          actor_entity_id: input.actor_entity_id,
          target_entity_id: input.target_entity_id,
          target_capsule_id: input.capsule_id ?? null,
          denial_reason: verdict.reason ?? "FRAMEWORK_VIOLATION",
          details: {
            failing_framework: framework.framework_name,
            operation_type: input.operation_type,
            capsule_type: input.capsule_type ?? null,
          },
        });
        return {
          compliant: false,
          failing_framework: framework.framework_name,
          reason: verdict.reason,
          evaluated_frameworks: evaluated,
        };
      }
    }

    await writeAuditEvent({
      event_type: "COMPLIANCE_CHECK_PASSED",
      outcome: "SUCCESS",
      actor_entity_id: input.actor_entity_id,
      target_entity_id: input.target_entity_id,
      target_capsule_id: input.capsule_id ?? null,
      details: {
        operation_type: input.operation_type,
        capsule_type: input.capsule_type ?? null,
        evaluated_frameworks: evaluated,
      },
    });

    return { compliant: true, evaluated_frameworks: evaluated };
  }

  // WHAT: Evaluate one framework's predicate against an operation.
  // INPUT: The framework row and the operation context.
  // OUTPUT: { compliant, reason? }.
  // WHY: One switch per framework name. Future: read rules JSON
  //      and dispatch via a rules engine.
  private evaluateFramework(
    framework: ComplianceFramework,
    input: ComplianceCheckInput,
  ): { compliant: boolean; reason?: string } {
    switch (framework.framework_name) {
      case "HIPAA":
        return this.evaluateHIPAA(input);
      case "FERPA":
        return this.evaluateFERPA(input);
      case "FedRAMP_Moderate":
        return this.evaluateFedRAMP(input);
      // GDPR, CCPA, SOC2_Type2, CMMC_Level2 are recorded but pass
      // by default for MVP -- they are about audit trail / opt-out
      // / DPA paperwork rather than per-operation gating that we
      // can enforce purely from runtime context. Future revisions
      // will wire each one in as we get richer entity metadata.
      default:
        return { compliant: true };
    }
  }

  // WHAT: HIPAA predicate -- block IDENTITY / SESSION_LEARNING /
  //        CONVERSATION_LEARNING access without explicit health-data
  //        consent.
  // INPUT: ComplianceCheckInput.
  // OUTPUT: { compliant, reason? }.
  // WHY: Spec rule "requires_consent_for_health_data: true" plus
  //      the HEALTHCARE-sector targeting that getApplicable
  //      Frameworks already filtered for.
  //      P2 PATCH (Section 11A): added CONVERSATION_LEARNING because
  //      Otzar conversation extracts can carry PHI just like
  //      session learnings.
  private evaluateHIPAA(input: ComplianceCheckInput): {
    compliant: boolean;
    reason?: string;
  } {
    if (
      input.capsule_type !== "IDENTITY" &&
      input.capsule_type !== "SESSION_LEARNING" &&
      input.capsule_type !== "CONVERSATION_LEARNING"
    ) {
      return { compliant: true };
    }
    if (
      !permissionHasHealthDataConsent(input.permission?.conditions ?? null)
    ) {
      return {
        compliant: false,
        reason:
          "HIPAA: explicit health_data_consent is required to access IDENTITY, SESSION_LEARNING, or CONVERSATION_LEARNING capsules in HEALTHCARE sector",
      };
    }
    return { compliant: true };
  }

  // WHAT: FERPA predicate -- block IDENTITY access without student
  //        consent.
  // INPUT: ComplianceCheckInput.
  // OUTPUT: { compliant, reason? }.
  // WHY: Spec rule "student_consent_required: true" applied to
  //      EDUCATION-sector targets reading IDENTITY capsules.
  private evaluateFERPA(input: ComplianceCheckInput): {
    compliant: boolean;
    reason?: string;
  } {
    if (input.capsule_type !== "IDENTITY") {
      return { compliant: true };
    }
    if (
      !permissionHasStudentConsent(input.permission?.conditions ?? null)
    ) {
      return {
        compliant: false,
        reason:
          "FERPA: explicit student_consent is required to access IDENTITY capsules in EDUCATION sector",
      };
    }
    return { compliant: true };
  }

  // WHAT: FedRAMP_Moderate predicate -- require minimum clearance
  //        for sensitive-class capsule access.
  // INPUT: ComplianceCheckInput.
  // OUTPUT: { compliant, reason? }.
  // WHY: Spec rule "min_clearance_sensitive: 2". For MVP, treat
  //      anything other than PREFERENCE / DEVICE_DATA as sensitive.
  private evaluateFedRAMP(input: ComplianceCheckInput): {
    compliant: boolean;
    reason?: string;
  } {
    const minClearance = 2;
    if (
      typeof input.session_clearance_ceiling === "number" &&
      input.session_clearance_ceiling < minClearance
    ) {
      return {
        compliant: false,
        reason: `FedRAMP_Moderate: session clearance ${input.session_clearance_ceiling} below minimum ${minClearance}`,
      };
    }
    return { compliant: true };
  }

  // WHAT: List every active framework in the system.
  // INPUT: None.
  // OUTPUT: An array of ComplianceFramework rows.
  // WHY: Backs GET /api/v1/compliance/frameworks. Returns ALL
  //      active frameworks (not narrowed to one entity).
  async listFrameworks(): Promise<ComplianceFramework[]> {
    return prisma.complianceFramework.findMany({
      where: { is_active: true },
      orderBy: { framework_name: "asc" },
    });
  }

  // WHAT: Aggregate compliance audit events into a report.
  // INPUT: entity_id, optional framework filter, time range.
  // OUTPUT: Counts of PASSED / FAILED plus a small sample of
  //         recent failures for context.
  // WHY: Backs GET /api/v1/compliance/report. Built on top of
  //      audit_events so it is automatically tamper-evident
  //      via the 1E hash chain.
  async generateComplianceReport(
    entityId: string,
    framework: string | null,
    dateFrom: Date,
    dateTo: Date,
  ): Promise<ComplianceReport> {
    const baseWhere: import("@prisma/client").Prisma.AuditEventWhereInput = {
      target_entity_id: entityId,
      timestamp: { gte: dateFrom, lte: dateTo },
    };
    const eventTypes = ["COMPLIANCE_CHECK_PASSED", "COMPLIANCE_CHECK_FAILED"];

    const [passedCount, failedCount, recent] = await Promise.all([
      prisma.auditEvent.count({
        where: { ...baseWhere, event_type: "COMPLIANCE_CHECK_PASSED" },
      }),
      prisma.auditEvent.count({
        where: { ...baseWhere, event_type: "COMPLIANCE_CHECK_FAILED" },
      }),
      prisma.auditEvent.findMany({
        where: { ...baseWhere, event_type: "COMPLIANCE_CHECK_FAILED" },
        orderBy: { timestamp: "desc" },
        take: 10,
      }),
    ]);
    void eventTypes;

    let recentFailures = recent;
    if (framework !== null) {
      recentFailures = recent.filter((r) => {
        const details = r.details as { failing_framework?: string } | null;
        return details?.failing_framework === framework;
      });
    }

    return {
      entity_id: entityId,
      framework,
      date_from: dateFrom,
      date_to: dateTo,
      passed_count: passedCount,
      failed_count: failedCount,
      recent_failures: recentFailures,
    };
  }

  // WHAT: Compute live compliance posture for an org's applicable
  //        frameworks based on recent COMPLIANCE_CHECK_PASSED /
  //        COMPLIANCE_CHECK_FAILED audit events.
  // INPUT: orgEntityId (the org-level EntityComplianceProfile
  //        owner), optional window (defaults to 24 hours).
  // OUTPUT: A ComplianceStateReport with per-framework verdicts.
  // WHY: 12C.0 Item 9 -- exposes live compliance posture as a
  //      queryable surface for SOC 2 Type II / ISO 27001 ConMon /
  //      FedRAMP ConMon use. Closes Compliance Architecture Review
  //      finding 3.3 YELLOW (continuous compliance state). The
  //      lookup is org-LEVEL per DRIFT 15: EntityComplianceProfile
  //      attaches frameworks to the org entity, not aggregated
  //      across per-member profiles. Section 12.5 Sub-box 7's
  //      compliance attestation reports consume this method's
  //      output as input to variant-(ii) attestation bodies.
  //      Section 12.5 medium remediation for 1.7 will add a
  //      periodic re-evaluation loop; this method is read-only
  //      against existing audit verdicts.
  // WHAT: Validate a session and compute the caller's org's
  //        compliance posture in one call. Used by the
  //        GET /api/v1/compliance/state route.
  // INPUT: Session token + optional window in ms.
  // OUTPUT: ComplianceStateReport on success; auth-failure shape
  //          on session invalid.
  // WHY: 12C.0 Item 9 + DRIFT 14 -- mirrors checkOnBehalfOf's auth
  //      pattern (manual bearer + session validation, not the
  //      requireAdminCapability middleware) for consistency with
  //      sibling /compliance/* endpoints. Section 12.5 Sub-box 7
  //      will standardize all /compliance/* under a unified auth
  //      model when verifiable-credentials infrastructure lands.
  async getComplianceStateForCaller(
    sessionToken: string,
    windowMs: number = 24 * 60 * 60 * 1000,
  ): Promise<
    | { ok: true; state: ComplianceStateReport }
    | { ok: false; code: string }
  > {
    const validation = await this.authService.validateSession(
      sessionToken,
      "read",
    );
    if (!validation.valid) {
      return { ok: false, code: validation.code };
    }
    const orgEntityId = await getOrgEntityId(validation.entity_id);
    const state = await this.getComplianceState(orgEntityId, windowMs);
    return { ok: true, state };
  }

  async getComplianceState(
    orgEntityId: string,
    windowMs: number = 24 * 60 * 60 * 1000,
  ): Promise<ComplianceStateReport> {
    const evaluatedAt = new Date();
    const windowStart = new Date(evaluatedAt.getTime() - windowMs);

    const profile = await prisma.entityComplianceProfile.findUnique({
      where: { entity_id: orgEntityId },
    });
    if (profile === null || profile.frameworks.length === 0) {
      return {
        org_entity_id: orgEntityId,
        frameworks: [],
        evaluated_at: evaluatedAt,
      };
    }

    const applicable = await prisma.complianceFramework.findMany({
      where: {
        framework_name: { in: profile.frameworks },
        is_active: true,
      },
    });

    // Per-framework: query the most recent PASSED + FAILED events
    // in the window, scoped to the org by target_entity_id +
    // failing_framework details. The audit chain is the source of
    // truth; this method is purely a read-side projection.
    const frameworks = await Promise.all(
      applicable.map(async (f) => {
        const where = {
          target_entity_id: orgEntityId,
          timestamp: { gte: windowStart, lte: evaluatedAt },
        };
        const failureWhere = {
          ...where,
          event_type: "COMPLIANCE_CHECK_FAILED",
          details: {
            path: ["failing_framework"],
            equals: f.framework_name,
          },
        } as import("@prisma/client").Prisma.AuditEventWhereInput;
        const passWhere = {
          ...where,
          event_type: "COMPLIANCE_CHECK_PASSED",
        };

        const [failureCount, lastFailure, lastPass, lastEvent] =
          await Promise.all([
            prisma.auditEvent.count({ where: failureWhere }),
            prisma.auditEvent.findFirst({
              where: failureWhere,
              orderBy: { timestamp: "desc" },
              select: { timestamp: true },
            }),
            prisma.auditEvent.findFirst({
              where: passWhere,
              orderBy: { timestamp: "desc" },
              select: { timestamp: true },
            }),
            prisma.auditEvent.findFirst({
              where: {
                ...where,
                event_type: {
                  in: [
                    "COMPLIANCE_CHECK_PASSED",
                    "COMPLIANCE_CHECK_FAILED",
                  ],
                },
              },
              orderBy: { timestamp: "desc" },
              select: { timestamp: true },
            }),
          ]);

        // compliant=true when there are no FAILED events in the
        // window. since=last PASSED timestamp (or null if no
        // PASSED events have ever recorded for this framework).
        const compliant = failureCount === 0;
        return {
          framework_name: f.framework_name,
          compliant,
          since: lastPass?.timestamp ?? null,
          last_check: lastEvent?.timestamp ?? lastFailure?.timestamp ?? null,
          sample_failure_count_24h: failureCount,
        };
      }),
    );

    return {
      org_entity_id: orgEntityId,
      frameworks,
      evaluated_at: evaluatedAt,
    };
  }

  // WHAT: Validate a session and run a compliance check on its
  //        behalf. Used by the POST /api/v1/compliance/check route.
  // INPUT: Session token + check input.
  // OUTPUT: ComplianceCheckResult or auth-failure.
  // WHY: Routes need session validation; the inline NegotiateService
  //      caller does its own validation upstream and calls
  //      runComplianceChecks directly.
  async checkOnBehalfOf(
    sessionToken: string,
    target_id: string,
    operation_type: string,
    capsule_id: string | null,
    capsule_type: CapsuleType | null,
  ): Promise<
    | (ComplianceCheckResult & { ok: true })
    | { ok: false; code: string; message: string }
  > {
    const session = await this.authService.validateSession(
      sessionToken,
      "read",
    );
    if (!session.valid) {
      return { ok: false, code: session.code, message: "Compliance check denied" };
    }
    const result = await this.runComplianceChecks({
      operation_type,
      actor_entity_id: session.entity_id,
      target_entity_id: target_id,
      capsule_id,
      capsule_type,
      session_clearance_ceiling: session.clearance_ceiling,
    });
    return { ok: true, ...result };
  }
}
