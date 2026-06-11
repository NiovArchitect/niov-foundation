// FILE: compliance-sharing.service.ts
// PURPOSE: Phase 1233 — company-controlled compliance sharing.
//          A ComplianceSharePackage is the purpose-bound, time-boxed,
//          revocable grant through which a REGULATOR entity reads
//          REDACTED compliance evidence for one org. The company (org
//          admin) creates / lists / revokes packages; the regulator
//          reads evidence ONLY through an ACTIVE, unexpired package
//          addressed to it, and ONLY for the scopes the package names.
//
//          Evidence is projected at read time from existing substrate
//          (AuditEvent / Action / MemoryCapsule / ConnectorBinding /
//          OrgOnboardingState) through the pure redaction helpers
//          below — nothing is copied into the package row, so revoke /
//          expiry cuts access immediately.
//
// SAFETY POSTURE (RULE 0):
//   - Evidence is metadata-only: event types, outcomes, statuses,
//     counts, timestamps. NEVER capsule payloads, audit `details`
//     JSON, connector config/secret material, or member PII.
//   - Regulator access is purpose-bound: the caller must BE the
//     package's regulator_entity_id; scope must be named on the
//     package; the package must be ACTIVE and inside its validity
//     window. Lapsed packages flip to EXPIRED on first touch.
//   - Every lifecycle transition and every evidence read is audited
//     BEFORE the response is sent (RULE 4).
//
// CONNECTS TO:
//   - packages/database/prisma/schema.prisma (ComplianceSharePackage
//     + SharePackageStatus/Scope/RedactionProfile enums)
//   - packages/database/src/queries/audit.ts (4 Phase 1233 literals)
//   - apps/api/src/services/governance/org.ts (getOrgEntityId)
//   - apps/api/src/routes/compliance-sharing.routes.ts (HTTP surface)
//   - tests/unit/compliance-sharing-redaction.test.ts (pure helpers)
//   - tests/integration/compliance-sharing.test.ts (service-level)

import { writeAuditEvent } from "@niov/database";
import { prisma } from "@niov/database";
import type {
  ComplianceSharePackage,
  SharePackageRedactionProfile,
  SharePackageScope,
} from "@prisma/client";
import { getOrgEntityId } from "../governance/org.js";

// ─── closed vocab ────────────────────────────────────────────

export const SHARE_PACKAGE_SCOPES: readonly SharePackageScope[] = [
  "AUDIT_SUMMARY",
  "ACTION_COMPLIANCE",
  "MEMORY_LINEAGE",
  "CONNECTOR_ACCESS",
  "ONBOARDING_READINESS",
] as const;

export const REDACTION_PROFILES: readonly SharePackageRedactionProfile[] = [
  "METADATA_ONLY",
  "REDACTED_SUMMARY",
] as const;

/** Max validity window for any package: one year. */
export const MAX_VALIDITY_DAYS = 365;

// ─── pure helpers (unit-tested; no DB) ───────────────────────

// WHAT: Validate a requested scopes list against the closed vocab.
// INPUT: unknown (route-supplied value).
// OUTPUT: validated non-empty SharePackageScope[] or null.
// WHY: Routes pass raw JSON; the service must reject unknown scope
//      strings instead of persisting them.
export function parseScopes(value: unknown): SharePackageScope[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const out: SharePackageScope[] = [];
  for (const v of value) {
    const known = SHARE_PACKAGE_SCOPES.find((s) => s === v);
    if (known === undefined) return null;
    if (!out.includes(known)) out.push(known);
  }
  return out;
}

// WHAT: Validate a valid_until timestamp.
// INPUT: unknown (route-supplied value) + "now" for testability.
// OUTPUT: a Date strictly after now and within MAX_VALIDITY_DAYS,
//         or null.
// WHY: Mandatory time-box (LawfulBasis / BreakGlassGrant pattern) —
//      no perpetual regulator access.
export function parseValidUntil(value: unknown, now: Date): Date | null {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  if (parsed.getTime() <= now.getTime()) return null;
  const max = now.getTime() + MAX_VALIDITY_DAYS * 24 * 60 * 60 * 1000;
  if (parsed.getTime() > max) return null;
  return parsed;
}

export interface RedactedAuditEntry {
  event_type: string;
  outcome: string;
  occurred_at: string;
}

// WHAT: Project audit rows down to the regulator-safe shape.
// INPUT: rows carrying event_type / outcome / timestamp (whatever
//        else they carry is dropped by construction).
// OUTPUT: RedactedAuditEntry[] — event type, outcome, timestamp only.
// WHY: The redaction boundary. `details` JSON, actor/target entity
//      ids, chain hashes and ip/user-agent fields never reach the
//      regulator view; tests assert these keys are absent.
export function redactAuditEvents(
  rows: ReadonlyArray<{
    event_type: string;
    outcome: string;
    timestamp: Date;
  }>,
): RedactedAuditEntry[] {
  return rows.map((r) => ({
    event_type: r.event_type,
    outcome: r.outcome,
    occurred_at: r.timestamp.toISOString(),
  }));
}

// WHAT: Fold {key -> count} pairs out of Prisma groupBy results.
// INPUT: groupBy rows + the grouped field name.
// OUTPUT: plain Record<string, number> sorted by key for stable output.
// WHY: Counts are the only aggregate shape the evidence view ships.
export function toCountRecord(
  rows: ReadonlyArray<Record<string, unknown> & { _count: number }>,
  field: string,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) {
    const key = row[field];
    if (typeof key === "string") out[key] = row._count;
  }
  return Object.fromEntries(
    Object.entries(out).sort(([a], [b]) => a.localeCompare(b)),
  );
}

// ─── view shapes ─────────────────────────────────────────────

export interface SharePackageView {
  package_id: string;
  org_entity_id: string;
  regulator_entity_id: string;
  lawful_basis_id: string | null;
  purpose: string;
  scopes: SharePackageScope[];
  redaction_profile: SharePackageRedactionProfile;
  status: string;
  valid_from: string;
  valid_until: string;
  access_count: number;
  last_accessed_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

function toView(p: ComplianceSharePackage): SharePackageView {
  return {
    package_id: p.package_id,
    org_entity_id: p.org_entity_id,
    regulator_entity_id: p.regulator_entity_id,
    lawful_basis_id: p.lawful_basis_id,
    purpose: p.purpose,
    scopes: p.scopes,
    redaction_profile: p.redaction_profile,
    status: p.status,
    valid_from: p.valid_from.toISOString(),
    valid_until: p.valid_until.toISOString(),
    access_count: p.access_count,
    last_accessed_at: p.last_accessed_at?.toISOString() ?? null,
    revoked_at: p.revoked_at?.toISOString() ?? null,
    created_at: p.created_at.toISOString(),
  };
}

type Failure = { ok: false; code: string; message?: string };

// ─── shared gates ────────────────────────────────────────────

// Admin gate matches the Phase 1230 onboarding convention:
// clearance_level >= 4 inside the caller's org.
async function requireOrgAdmin(
  callerEntityId: string,
): Promise<{ ok: true; orgEntityId: string } | Failure> {
  let orgEntityId: string;
  try {
    orgEntityId = await getOrgEntityId(callerEntityId);
  } catch {
    return { ok: false, code: "NO_ORG_FOR_CALLER" };
  }
  const caller = await prisma.entity.findUnique({
    where: { entity_id: callerEntityId },
    select: { clearance_level: true },
  });
  if (caller === null || caller.clearance_level < 4) {
    return { ok: false, code: "ADMIN_REQUIRED" };
  }
  return { ok: true, orgEntityId };
}

// All entity ids inside the org boundary (the org + active members).
async function orgMemberEntityIds(orgEntityId: string): Promise<string[]> {
  const memberships = await prisma.entityMembership.findMany({
    where: { parent_id: orgEntityId, is_active: true },
    select: { child_id: true },
  });
  return [orgEntityId, ...memberships.map((m) => m.child_id)];
}

// ─── service: create ─────────────────────────────────────────

export async function createSharePackageForCaller(input: {
  callerEntityId: string;
  regulatorEntityId: string;
  purpose: string;
  scopes: unknown;
  validUntil: unknown;
  redactionProfile?: unknown;
  lawfulBasisId?: string;
}): Promise<{ ok: true; package: SharePackageView } | Failure> {
  const gate = await requireOrgAdmin(input.callerEntityId);
  if (gate.ok === false) return gate;

  const purpose = input.purpose.trim();
  if (purpose.length === 0) {
    return { ok: false, code: "PURPOSE_REQUIRED" };
  }
  const scopes = parseScopes(input.scopes);
  if (scopes === null) {
    return {
      ok: false,
      code: "INVALID_SCOPES",
      message: `scopes must be a non-empty subset of ${SHARE_PACKAGE_SCOPES.join(", ")}`,
    };
  }
  const validUntil = parseValidUntil(input.validUntil, new Date());
  if (validUntil === null) {
    return {
      ok: false,
      code: "INVALID_VALID_UNTIL",
      message: `valid_until must be an ISO timestamp in the future, at most ${MAX_VALIDITY_DAYS} days out`,
    };
  }
  const redactionProfile =
    REDACTION_PROFILES.find((p) => p === input.redactionProfile) ??
    "METADATA_ONLY";

  // The target must be a real REGULATOR entity (CAR §2.1 — REGULATOR
  // is distinct from GOVERNMENT; never grant a compliance view to a
  // non-regulator principal).
  const regulator = await prisma.entity.findUnique({
    where: { entity_id: input.regulatorEntityId },
    select: { entity_type: true, status: true },
  });
  if (regulator === null || regulator.entity_type !== "REGULATOR") {
    return { ok: false, code: "REGULATOR_REQUIRED" };
  }
  if (regulator.status !== "ACTIVE") {
    return { ok: false, code: "REGULATOR_NOT_ACTIVE" };
  }

  if (input.lawfulBasisId !== undefined) {
    const basis = await prisma.lawfulBasis.findUnique({
      where: { basis_id: input.lawfulBasisId },
      select: { basis_id: true },
    });
    if (basis === null) {
      return { ok: false, code: "LAWFUL_BASIS_NOT_FOUND" };
    }
  }

  const created = await prisma.complianceSharePackage.create({
    data: {
      org_entity_id: gate.orgEntityId,
      regulator_entity_id: input.regulatorEntityId,
      lawful_basis_id: input.lawfulBasisId ?? null,
      purpose,
      scopes,
      redaction_profile: redactionProfile,
      valid_until: validUntil,
      created_by_entity_id: input.callerEntityId,
    },
  });

  await writeAuditEvent({
    event_type: "COMPLIANCE_SHARE_PACKAGE_CREATED",
    outcome: "SUCCESS",
    actor_entity_id: input.callerEntityId,
    target_entity_id: input.regulatorEntityId,
    details: {
      package_id: created.package_id,
      org_entity_id: gate.orgEntityId,
      purpose,
      scopes,
      redaction_profile: redactionProfile,
      valid_until: validUntil.toISOString(),
      ...(input.lawfulBasisId !== undefined
        ? { lawful_basis_id: input.lawfulBasisId }
        : {}),
    },
  });

  return { ok: true, package: toView(created) };
}

// ─── service: list (company side) ────────────────────────────

export async function listSharePackagesForCaller(
  callerEntityId: string,
): Promise<{ ok: true; packages: SharePackageView[] } | Failure> {
  const gate = await requireOrgAdmin(callerEntityId);
  if (gate.ok === false) return gate;
  const rows = await prisma.complianceSharePackage.findMany({
    where: { org_entity_id: gate.orgEntityId },
    orderBy: { created_at: "desc" },
  });
  return { ok: true, packages: rows.map(toView) };
}

// ─── service: revoke (company side) ──────────────────────────

export async function revokeSharePackageForCaller(input: {
  callerEntityId: string;
  packageId: string;
  reason?: string;
}): Promise<
  | { ok: true; package_id: string; revoked_at: string }
  | Failure
> {
  const gate = await requireOrgAdmin(input.callerEntityId);
  if (gate.ok === false) return gate;
  const pkg = await prisma.complianceSharePackage.findUnique({
    where: { package_id: input.packageId },
  });
  if (pkg === null || pkg.org_entity_id !== gate.orgEntityId) {
    // Cross-org probes get the same 404 as unknown ids (no existence
    // oracle across the tenant boundary).
    return { ok: false, code: "PACKAGE_NOT_FOUND" };
  }
  if (pkg.status === "REVOKED") {
    return { ok: false, code: "ALREADY_REVOKED" };
  }
  const revokedAt = new Date();
  await prisma.complianceSharePackage.update({
    where: { package_id: pkg.package_id },
    data: {
      status: "REVOKED",
      revoked_at: revokedAt,
      revoked_by_entity_id: input.callerEntityId,
    },
  });
  await writeAuditEvent({
    event_type: "COMPLIANCE_SHARE_PACKAGE_REVOKED",
    outcome: "SUCCESS",
    actor_entity_id: input.callerEntityId,
    target_entity_id: pkg.regulator_entity_id,
    details: {
      package_id: pkg.package_id,
      org_entity_id: pkg.org_entity_id,
      ...(input.reason !== undefined ? { reason: input.reason } : {}),
    },
  });
  return {
    ok: true,
    package_id: pkg.package_id,
    revoked_at: revokedAt.toISOString(),
  };
}

// ─── service: regulator evidence read ────────────────────────

export interface EvidenceView {
  package_id: string;
  org_entity_id: string;
  purpose: string;
  redaction_profile: SharePackageRedactionProfile;
  generated_at: string;
  scopes: SharePackageScope[];
  audit_summary?: {
    counts_by_event_type: Record<string, number>;
    counts_by_outcome: Record<string, number>;
    recent_events: RedactedAuditEntry[];
  };
  action_compliance?: {
    counts_by_status: Record<string, number>;
    counts_by_action_type: Record<string, number>;
  };
  memory_lineage?: {
    counts_by_capsule_type: Record<string, number>;
    revoked_capsule_count: number;
  };
  connector_access?: {
    counts_by_connector_type: Record<string, number>;
    enabled_count: number;
    disabled_count: number;
  };
  onboarding_readiness?: {
    mode: string;
    completed_steps: string[];
  };
}

const RECENT_EVENTS_LIMIT = 50;

export async function getEvidenceForRegulator(input: {
  callerEntityId: string;
  packageId: string;
}): Promise<{ ok: true; evidence: EvidenceView } | Failure> {
  const pkg = await prisma.complianceSharePackage.findUnique({
    where: { package_id: input.packageId },
  });
  // Unknown package and someone-else's package are indistinguishable
  // (no existence oracle for non-addressees).
  if (pkg === null || pkg.regulator_entity_id !== input.callerEntityId) {
    return { ok: false, code: "PACKAGE_NOT_FOUND" };
  }
  if (pkg.status === "REVOKED") {
    return { ok: false, code: "PACKAGE_REVOKED" };
  }
  const now = new Date();
  if (pkg.status === "EXPIRED" || pkg.valid_until.getTime() <= now.getTime()) {
    if (pkg.status !== "EXPIRED") {
      await prisma.complianceSharePackage.update({
        where: { package_id: pkg.package_id },
        data: { status: "EXPIRED" },
      });
      await writeAuditEvent({
        event_type: "COMPLIANCE_SHARE_PACKAGE_EXPIRED",
        outcome: "SUCCESS",
        actor_entity_id: input.callerEntityId,
        target_entity_id: pkg.org_entity_id,
        details: {
          package_id: pkg.package_id,
          org_entity_id: pkg.org_entity_id,
          valid_until: pkg.valid_until.toISOString(),
        },
      });
    }
    return { ok: false, code: "PACKAGE_EXPIRED" };
  }

  const memberIds = await orgMemberEntityIds(pkg.org_entity_id);

  const evidence: EvidenceView = {
    package_id: pkg.package_id,
    org_entity_id: pkg.org_entity_id,
    purpose: pkg.purpose,
    redaction_profile: pkg.redaction_profile,
    generated_at: now.toISOString(),
    scopes: pkg.scopes,
  };

  if (pkg.scopes.includes("AUDIT_SUMMARY")) {
    const where = { actor_entity_id: { in: memberIds } };
    const [byType, byOutcome, recent] = await Promise.all([
      prisma.auditEvent.groupBy({
        by: ["event_type"],
        where,
        _count: true,
      }),
      prisma.auditEvent.groupBy({
        by: ["outcome"],
        where,
        _count: true,
      }),
      prisma.auditEvent.findMany({
        where,
        orderBy: { timestamp: "desc" },
        take: RECENT_EVENTS_LIMIT,
        select: { event_type: true, outcome: true, timestamp: true },
      }),
    ]);
    evidence.audit_summary = {
      counts_by_event_type: toCountRecord(byType, "event_type"),
      counts_by_outcome: toCountRecord(byOutcome, "outcome"),
      recent_events: redactAuditEvents(recent),
    };
  }

  if (pkg.scopes.includes("ACTION_COMPLIANCE")) {
    const where = { org_entity_id: pkg.org_entity_id };
    const [byStatus, byType] = await Promise.all([
      prisma.action.groupBy({ by: ["status"], where, _count: true }),
      prisma.action.groupBy({ by: ["action_type"], where, _count: true }),
    ]);
    evidence.action_compliance = {
      counts_by_status: toCountRecord(byStatus, "status"),
      counts_by_action_type: toCountRecord(byType, "action_type"),
    };
  }

  if (pkg.scopes.includes("MEMORY_LINEAGE")) {
    const wallets = await prisma.wallet.findMany({
      where: { entity_id: { in: memberIds } },
      select: { wallet_id: true },
    });
    const walletIds = wallets.map((w) => w.wallet_id);
    const [byCapsuleType, revokedCount] = await Promise.all([
      prisma.memoryCapsule.groupBy({
        by: ["capsule_type"],
        where: { wallet_id: { in: walletIds }, deleted_at: null },
        _count: true,
      }),
      prisma.memoryCapsule.count({
        where: { wallet_id: { in: walletIds }, deleted_at: { not: null } },
      }),
    ]);
    evidence.memory_lineage = {
      counts_by_capsule_type: toCountRecord(byCapsuleType, "capsule_type"),
      revoked_capsule_count: revokedCount,
    };
  }

  if (pkg.scopes.includes("CONNECTOR_ACCESS")) {
    const rows = await prisma.connectorBinding.findMany({
      where: { org_entity_id: pkg.org_entity_id, deleted_at: null },
      select: { type: true, enabled: true },
    });
    const byType: Record<string, number> = {};
    let enabled = 0;
    for (const row of rows) {
      byType[row.type] = (byType[row.type] ?? 0) + 1;
      if (row.enabled) enabled += 1;
    }
    evidence.connector_access = {
      counts_by_connector_type: Object.fromEntries(
        Object.entries(byType).sort(([a], [b]) => a.localeCompare(b)),
      ),
      enabled_count: enabled,
      disabled_count: rows.length - enabled,
    };
  }

  if (pkg.scopes.includes("ONBOARDING_READINESS")) {
    const state = await prisma.orgOnboardingState.findUnique({
      where: { org_entity_id: pkg.org_entity_id },
    });
    const completed: string[] = [];
    if (state !== null) {
      const stepColumns: ReadonlyArray<[string, Date | null]> = [
        ["ORG_CREATED", state.org_created_at],
        ["ADMINS_INVITED", state.admins_invited_at],
        ["ROLES_ASSIGNED", state.roles_assigned_at],
        ["ROLE_ARCHETYPES_ASSIGNED", state.role_archetypes_assigned_at],
        ["ACTION_POLICY_CONFIGURED", state.action_policy_configured_at],
        ["CONNECTOR_STATUS_REVIEWED", state.connector_status_reviewed_at],
        ["DMW_DEFAULTS_CONFIGURED", state.dmw_defaults_configured_at],
        ["COSMP_DEFAULTS_CONFIGURED", state.cosmp_defaults_configured_at],
        ["DEMO_SEED_LOADED", state.demo_seed_loaded_at],
        [
          "PROD_SCHEMA_MIGRATION_ACKNOWLEDGED",
          state.prod_schema_migration_acknowledged_at,
        ],
        ["READY_FOR_PRODUCTION", state.ready_for_production_at],
      ];
      for (const [step, at] of stepColumns) {
        if (at !== null) completed.push(step);
      }
    }
    evidence.onboarding_readiness = {
      mode: state?.mode ?? "DEMO",
      completed_steps: completed,
    };
  }

  await prisma.complianceSharePackage.update({
    where: { package_id: pkg.package_id },
    data: {
      access_count: { increment: 1 },
      last_accessed_at: now,
    },
  });
  await writeAuditEvent({
    event_type: "COMPLIANCE_SHARE_PACKAGE_ACCESSED",
    outcome: "SUCCESS",
    actor_entity_id: input.callerEntityId,
    target_entity_id: pkg.org_entity_id,
    details: {
      package_id: pkg.package_id,
      org_entity_id: pkg.org_entity_id,
      scopes: pkg.scopes,
      redaction_profile: pkg.redaction_profile,
    },
  });

  return { ok: true, evidence };
}
