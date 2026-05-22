// FILE: console.service.ts
// PURPOSE: CONSOLE.1 P0 read-only aggregation for the Foundation Console
//          control plane. Builds the Foundation Command Center overview, the
//          filterable audit read, the wallet/entity explorer list, the
//          break-glass + escalation reads, and the static report catalog +
//          report-envelope detail, ALL read-only over existing Prisma models.
//          No mutations, no schema, no raw capsule content, no break-glass
//          justification in lists, no fabricated live market pricing. Every
//          consumer route (console.routes.ts) is can_admin_niov-gated and
//          emits an ADMIN_ACTION/CONSOLE_READ audit at the route tier.
// CONNECTS TO: @niov/database (prisma read queries over Entity / Wallet /
//              Session / TokenAttributeRepository / MemoryCapsule / AuditEvent /
//              EscalationRequest / BreakGlassGrant / MonetizationEvent /
//              FeedbackLoopHealth / LawfulBasis); apps/api/src/middleware/
//              gateway.middleware.ts (DEFAULT_LIMITS keys, read-only import for
//              the gateway operation-class list). Route layer: console.routes.ts.
//
// READINESS DISCIPLINE: fields not truly backed by live repo data are marked
// PARTIAL / FUTURE (never fabricated as live). Redis/COSMP/DBGI telemetry,
// market pricing, and metric trends are FUTURE and reported as such.

import { prisma } from "@niov/database";
import type { Prisma } from "@niov/database";
import { DEFAULT_LIMITS } from "../middleware/gateway.middleware.js";

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export type ConsoleReadinessBadge = "LIVE" | "PARTIAL" | "MOCK" | "FUTURE";
export type ConsolePriority = "P0" | "P1" | "P2";
export type ConsoleSecurityClass =
  | "NIOV_ONLY"
  | "ORG_SCOPED"
  | "REGULATOR_PROOF"
  | "DEVELOPER_SCOPED";

export interface ConsoleDataSource {
  kind: "route" | "service" | "model" | "event" | "static" | "proposed";
  ref: string;
  existing: boolean;
}

export interface ConsolePaginatedResponse<T> {
  ok: true;
  items: T[];
  total: number;
  skip: number;
  take: number;
  has_more: boolean;
  generated_at: string;
}

// WHAT: Clamp/normalise skip+take from raw query strings.
// INPUT: raw skip + take strings, a max take.
// OUTPUT: { skip, take }.
// WHY: One place so every Console list endpoint paginates identically and a
//      hostile ?take= cannot demand an unbounded scan.
function pageArgs(
  rawSkip: string | undefined,
  rawTake: string | undefined,
  maxTake = 200,
): { skip: number; take: number } {
  const s = Number.parseInt(rawSkip ?? "0", 10);
  const t = Number.parseInt(rawTake ?? "50", 10);
  const skip = Number.isFinite(s) && s >= 0 ? s : 0;
  const take = Math.max(1, Math.min(maxTake, Number.isFinite(t) ? t : 50));
  return { skip, take };
}

// ---------------------------------------------------------------------------
// A. Overview (Foundation Command Center)
// ---------------------------------------------------------------------------

export interface ConsoleOverviewResponse {
  ok: true;
  foundation: {
    environment: string;
    commit: string | null;
    ci_status: "success" | "failed" | "unknown";
    govsec5_status: "CLOSED";
    adr_0049_status: "Proposed";
    gap_o7_status: "OPEN";
    govsec7_status: "NOT_STARTED";
    console1_status: "P0_BACKEND";
    open_critical_gaps: number;
    readiness: "PARTIAL";
  };
  health: {
    api: "ok" | "degraded" | "unknown";
    database: "ok" | "unknown";
    redis: "ok" | "unknown";
    cosmp: "ok" | "unknown";
    dbgi: "ok" | "unknown";
    readiness: "PARTIAL";
  };
  governance: {
    open_escalations: number;
    pending_dual_control: number;
    break_glass_active: number;
    break_glass_used: number;
    break_glass_reviewed: number;
    recent_audit_events: number;
    recent_rate_limited_events: number;
    readiness: "PARTIAL";
  };
  entities: {
    total_entities: number;
    by_type: Record<string, number>;
    total_orgs: number;
    active_twins: number;
    active_sessions: number | null;
    readiness: "PARTIAL";
  };
  capsules: {
    total_capsules: number;
    recent_capsule_events: number;
    readiness: "PARTIAL";
  };
  gateway: {
    operation_classes: string[];
    live_counters_available: false;
    recent_anomalies: number;
    readiness: "PARTIAL";
  };
  compliance: {
    lawful_basis_events_recent: number;
    regulator_access_events_recent: number;
    compliance_checks_recent: number;
    readiness: "PARTIAL";
  };
  exchange: {
    monetization_events_recent: number;
    market_surface_status: "PARTIAL";
    cohort_pricing_status: "FUTURE";
    readiness: "PARTIAL";
  };
  agents: {
    feedback_loops: number;
    hive_surface_status: "PARTIAL";
    cosmp_dbgi_telemetry_status: "FUTURE";
    readiness: "PARTIAL";
  };
  reports: {
    total_reports: number;
    live_ready: number;
    partial: number;
    mock_only: number;
    future: number;
  };
  generated_at: string;
}

const CAPSULE_EVENT_TYPES = [
  "CAPSULE_CREATED",
  "CAPSULE_METADATA_READ",
  "CAPSULE_CONTENT_READ",
  "CAPSULE_UPDATED",
  "CAPSULE_DELETED",
  "CAPSULE_MUTATION_ADD",
  "CAPSULE_MUTATION_UPDATE",
  "CAPSULE_MUTATION_MERGE",
  "CAPSULE_MUTATION_NOOP",
];
const REGULATOR_EVENT_TYPES = [
  "REGULATOR_ACCESS_GRANTED",
  "REGULATOR_ACCESS_REVOKED",
  "REGULATOR_ACCESS_EXPIRED",
];
const COMPLIANCE_EVENT_TYPES = [
  "COMPLIANCE_CHECK_PASSED",
  "COMPLIANCE_CHECK_FAILED",
];

// WHAT: Build the Foundation Command Center overview from live repo data.
// INPUT: none.
// OUTPUT: a ConsoleOverviewResponse.
// WHY: CONSOLE.1 Home screen aggregate ("Is the Foundation healthy, governed,
//      active, and safe?"). Uses real counts where available; marks
//      telemetry/market/trend fields PARTIAL/FUTURE rather than fabricating.
export async function buildConsoleOverview(): Promise<ConsoleOverviewResponse> {
  const [
    entityByType,
    totalOrgs,
    activeTwins,
    totalCapsules,
    activeSessions,
    openEscalations,
    pendingDualControl,
    bgActive,
    bgUsed,
    bgReviewed,
    recentAudit,
    rateLimited,
    recentCapsuleEvents,
    recentAnomalies,
    regulatorEvents,
    complianceChecks,
    lawfulBasisCount,
    monetizationEvents,
    feedbackLoops,
  ] = await Promise.all([
    prisma.entity.groupBy({
      by: ["entity_type"],
      where: { deleted_at: null },
      _count: { entity_id: true },
    }),
    prisma.entity.count({ where: { entity_type: "COMPANY", deleted_at: null } }),
    prisma.entity.count({ where: { entity_type: "AI_AGENT", deleted_at: null } }),
    prisma.memoryCapsule.count({ where: { deleted_at: null } }),
    prisma.session.count({ where: { status: "ACTIVE" } }),
    prisma.escalationRequest.count({ where: { status: "PENDING" } }),
    prisma.escalationRequest.count({
      where: { status: "PENDING", escalation_type: "DUAL_CONTROL_REQUIRED" },
    }),
    prisma.breakGlassGrant.count({ where: { status: "ACTIVE" } }),
    prisma.breakGlassGrant.count({ where: { status: "USED" } }),
    prisma.breakGlassGrant.count({ where: { status: "REVIEWED" } }),
    prisma.auditEvent.count(),
    prisma.auditEvent.count({ where: { event_type: "RATE_LIMITED" } }),
    prisma.auditEvent.count({ where: { event_type: { in: CAPSULE_EVENT_TYPES } } }),
    prisma.auditEvent.count({ where: { event_type: "ANOMALY_DETECTED" } }),
    prisma.auditEvent.count({ where: { event_type: { in: REGULATOR_EVENT_TYPES } } }),
    prisma.auditEvent.count({ where: { event_type: { in: COMPLIANCE_EVENT_TYPES } } }),
    prisma.lawfulBasis.count(),
    prisma.monetizationEvent.count(),
    prisma.feedbackLoopHealth.count(),
  ]);

  const by_type: Record<string, number> = {};
  for (const row of entityByType) by_type[row.entity_type] = row._count.entity_id;
  const total_entities = Object.values(by_type).reduce((a, b) => a + b, 0);

  const catalog = getConsoleReportCatalog();
  const reportTally = { live_ready: 0, partial: 0, mock_only: 0, future: 0 };
  for (const r of catalog) {
    if (r.readiness === "LIVE") reportTally.live_ready += 1;
    else if (r.readiness === "PARTIAL") reportTally.partial += 1;
    else if (r.readiness === "MOCK") reportTally.mock_only += 1;
    else reportTally.future += 1;
  }

  return {
    ok: true,
    foundation: {
      environment: process.env.NODE_ENV ?? "unknown",
      commit: process.env.GIT_COMMIT ?? null,
      ci_status: "unknown",
      govsec5_status: "CLOSED",
      adr_0049_status: "Proposed",
      gap_o7_status: "OPEN",
      govsec7_status: "NOT_STARTED",
      console1_status: "P0_BACKEND",
      open_critical_gaps: 0,
      readiness: "PARTIAL",
    },
    health: {
      api: "ok",
      database: "ok",
      redis: "unknown",
      cosmp: "unknown",
      dbgi: "unknown",
      readiness: "PARTIAL",
    },
    governance: {
      open_escalations: openEscalations,
      pending_dual_control: pendingDualControl,
      break_glass_active: bgActive,
      break_glass_used: bgUsed,
      break_glass_reviewed: bgReviewed,
      recent_audit_events: recentAudit,
      recent_rate_limited_events: rateLimited,
      readiness: "PARTIAL",
    },
    entities: {
      total_entities,
      by_type,
      total_orgs: totalOrgs,
      active_twins: activeTwins,
      active_sessions: activeSessions,
      readiness: "PARTIAL",
    },
    capsules: {
      total_capsules: totalCapsules,
      recent_capsule_events: recentCapsuleEvents,
      readiness: "PARTIAL",
    },
    gateway: {
      operation_classes: Object.keys(DEFAULT_LIMITS),
      live_counters_available: false,
      recent_anomalies: recentAnomalies,
      readiness: "PARTIAL",
    },
    compliance: {
      lawful_basis_events_recent: lawfulBasisCount,
      regulator_access_events_recent: regulatorEvents,
      compliance_checks_recent: complianceChecks,
      readiness: "PARTIAL",
    },
    exchange: {
      monetization_events_recent: monetizationEvents,
      market_surface_status: "PARTIAL",
      cohort_pricing_status: "FUTURE",
      readiness: "PARTIAL",
    },
    agents: {
      feedback_loops: feedbackLoops,
      hive_surface_status: "PARTIAL",
      cosmp_dbgi_telemetry_status: "FUTURE",
      readiness: "PARTIAL",
    },
    reports: {
      total_reports: catalog.length,
      live_ready: reportTally.live_ready,
      partial: reportTally.partial,
      mock_only: reportTally.mock_only,
      future: reportTally.future,
    },
    generated_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// B. Audit read (filterable)
// ---------------------------------------------------------------------------

export interface ConsoleAuditEvent {
  audit_id: string;
  event_type: string;
  actor_entity_id: string | null;
  target_entity_id: string | null;
  outcome: string;
  route: string | null;
  details: Record<string, unknown> | null;
  chain_hash: string;
  created_at: string;
}

export interface ConsoleAuditQuery {
  skip?: string;
  take?: string;
  event_type?: string;
  actor_entity_id?: string;
  target_entity_id?: string;
  outcome?: string;
  from?: string;
  to?: string;
}

// WHAT: Filterable read over the append-only AuditEvent chain.
// INPUT: ConsoleAuditQuery.
// OUTPUT: paginated ConsoleAuditEvent rows (newest first).
// WHY: Governance & Audit Center. Extends /platform/audit with filters; maps
//      schema columns (event_hash -> chain_hash, timestamp -> created_at,
//      details.route -> route). Filters only on schema-proven fields.
export async function listConsoleAudit(
  q: ConsoleAuditQuery,
): Promise<ConsolePaginatedResponse<ConsoleAuditEvent>> {
  const { skip, take } = pageArgs(q.skip, q.take);
  const where: Prisma.AuditEventWhereInput = {};
  if (q.event_type) where.event_type = q.event_type;
  if (q.actor_entity_id) where.actor_entity_id = q.actor_entity_id;
  if (q.target_entity_id) where.target_entity_id = q.target_entity_id;
  if (q.outcome) where.outcome = q.outcome as Prisma.EnumAuditOutcomeFilter;
  const fromDate = q.from ? new Date(q.from) : null;
  const toDate = q.to ? new Date(q.to) : null;
  if (
    (fromDate && !Number.isNaN(fromDate.getTime())) ||
    (toDate && !Number.isNaN(toDate.getTime()))
  ) {
    where.timestamp = {};
    if (fromDate && !Number.isNaN(fromDate.getTime())) where.timestamp.gte = fromDate;
    if (toDate && !Number.isNaN(toDate.getTime())) where.timestamp.lte = toDate;
  }

  const [rows, total] = await Promise.all([
    prisma.auditEvent.findMany({
      where,
      skip,
      take,
      orderBy: { timestamp: "desc" },
    }),
    prisma.auditEvent.count({ where }),
  ]);

  const items: ConsoleAuditEvent[] = rows.map((r) => {
    const details = r.details as Record<string, unknown> | null;
    const route =
      details && typeof details.route === "string" ? details.route : null;
    return {
      audit_id: r.audit_id,
      event_type: r.event_type,
      actor_entity_id: r.actor_entity_id,
      target_entity_id: r.target_entity_id,
      outcome: String(r.outcome),
      route,
      details,
      chain_hash: r.event_hash,
      created_at: r.timestamp.toISOString(),
    };
  });

  return {
    ok: true,
    items,
    total,
    skip,
    take,
    has_more: skip + take < total,
    generated_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// C. Entity explorer
// ---------------------------------------------------------------------------

export interface ConsoleEntityRow {
  entity_id: string;
  entity_type: string;
  status: string;
  display_name: string | null;
  wallet_id: string | null;
  wallet_type: string | null;
  active_sessions: number;
  capabilities: {
    can_login?: boolean;
    can_read_capsules?: boolean;
    can_write_capsules?: boolean;
    can_share_capsules?: boolean;
    can_create_hives?: boolean;
    can_access_external_api?: boolean;
    can_admin_niov?: boolean;
    can_admin_org?: boolean;
  } | null;
  clearance_ceiling: string | null;
  created_at: string;
}

export interface ConsoleEntityQuery {
  skip?: string;
  take?: string;
  entity_type?: string;
  status?: string;
  q?: string;
}

// WHAT: Wallet & Entity Explorer list (Entity + Wallet + TAR caps + active
//       session count). Read-only; NO raw capsule content.
// INPUT: ConsoleEntityQuery.
// OUTPUT: paginated ConsoleEntityRow.
export async function listConsoleEntities(
  q: ConsoleEntityQuery,
): Promise<ConsolePaginatedResponse<ConsoleEntityRow>> {
  const { skip, take } = pageArgs(q.skip, q.take, 100);
  const where: Prisma.EntityWhereInput = { deleted_at: null };
  if (q.entity_type) where.entity_type = q.entity_type as Prisma.EnumEntityTypeFilter;
  if (q.status) where.status = q.status as Prisma.EnumEntityStatusFilter;
  if (q.q) where.display_name = { contains: q.q, mode: "insensitive" };

  const [rows, total] = await Promise.all([
    prisma.entity.findMany({
      where,
      skip,
      take,
      orderBy: { created_at: "desc" },
      include: {
        wallet: { select: { wallet_id: true, wallet_type: true } },
        tar: {
          select: {
            can_login: true,
            can_read_capsules: true,
            can_write_capsules: true,
            can_share_capsules: true,
            can_create_hives: true,
            can_access_external_api: true,
            can_admin_niov: true,
            can_admin_org: true,
            clearance_ceiling: true,
          },
        },
      },
    }),
    prisma.entity.count({ where }),
  ]);

  const ids = rows.map((r) => r.entity_id);
  const sessionCounts =
    ids.length === 0
      ? []
      : await prisma.session.groupBy({
          by: ["entity_id"],
          where: { entity_id: { in: ids }, status: "ACTIVE" },
          _count: { session_id: true },
        });
  const activeByEntity = new Map<string, number>();
  for (const s of sessionCounts) activeByEntity.set(s.entity_id, s._count.session_id);

  const items: ConsoleEntityRow[] = rows.map((r) => ({
    entity_id: r.entity_id,
    entity_type: String(r.entity_type),
    status: String(r.status),
    display_name: r.display_name,
    wallet_id: r.wallet?.wallet_id ?? null,
    wallet_type: r.wallet ? String(r.wallet.wallet_type) : null,
    active_sessions: activeByEntity.get(r.entity_id) ?? 0,
    capabilities: r.tar
      ? {
          can_login: r.tar.can_login,
          can_read_capsules: r.tar.can_read_capsules,
          can_write_capsules: r.tar.can_write_capsules,
          can_share_capsules: r.tar.can_share_capsules,
          can_create_hives: r.tar.can_create_hives,
          can_access_external_api: r.tar.can_access_external_api,
          can_admin_niov: r.tar.can_admin_niov,
          can_admin_org: r.tar.can_admin_org,
        }
      : null,
    clearance_ceiling: r.tar ? String(r.tar.clearance_ceiling) : null,
    created_at: r.created_at.toISOString(),
  }));

  return {
    ok: true,
    items,
    total,
    skip,
    take,
    has_more: skip + take < total,
    generated_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// D. Break-glass grants (NO justification in list)
// ---------------------------------------------------------------------------

export interface ConsoleBreakGlassGrantRow {
  grant_id: string;
  source_entity_id: string;
  action_type: string;
  status: string;
  valid_from: string;
  valid_until: string;
  used_at: string | null;
  reviewed_at: string | null;
  reviewed_by_entity_id: string | null;
  invoke_audit_id: string | null;
  use_audit_id: string | null;
  review_audit_id: string | null;
  created_at: string;
}

export interface ConsoleBreakGlassQuery {
  skip?: string;
  take?: string;
  status?: string;
  action_type?: string;
  source_entity_id?: string;
}

// WHAT: Break-Glass Review Center list. DELIBERATELY excludes `justification`
//       (private) from the list response.
export async function listConsoleBreakGlassGrants(
  q: ConsoleBreakGlassQuery,
): Promise<ConsolePaginatedResponse<ConsoleBreakGlassGrantRow>> {
  const { skip, take } = pageArgs(q.skip, q.take);
  const where: Prisma.BreakGlassGrantWhereInput = {};
  if (q.status) where.status = q.status as Prisma.EnumBreakGlassStatusFilter;
  if (q.action_type) where.action_type = q.action_type;
  if (q.source_entity_id) where.source_entity_id = q.source_entity_id;

  const [rows, total] = await Promise.all([
    prisma.breakGlassGrant.findMany({
      where,
      skip,
      take,
      orderBy: { created_at: "desc" },
      // Explicit field selection — `justification` is intentionally NOT selected.
      select: {
        grant_id: true,
        source_entity_id: true,
        action_type: true,
        status: true,
        valid_from: true,
        valid_until: true,
        used_at: true,
        reviewed_at: true,
        reviewed_by_entity_id: true,
        invocation_audit_id: true,
        used_audit_id: true,
        reviewed_audit_id: true,
        created_at: true,
      },
    }),
    prisma.breakGlassGrant.count({ where }),
  ]);

  const items: ConsoleBreakGlassGrantRow[] = rows.map((r) => ({
    grant_id: r.grant_id,
    source_entity_id: r.source_entity_id,
    action_type: r.action_type,
    status: String(r.status),
    valid_from: r.valid_from.toISOString(),
    valid_until: r.valid_until.toISOString(),
    used_at: r.used_at ? r.used_at.toISOString() : null,
    reviewed_at: r.reviewed_at ? r.reviewed_at.toISOString() : null,
    reviewed_by_entity_id: r.reviewed_by_entity_id,
    invoke_audit_id: r.invocation_audit_id,
    use_audit_id: r.used_audit_id,
    review_audit_id: r.reviewed_audit_id,
    created_at: r.created_at.toISOString(),
  }));

  return {
    ok: true,
    items,
    total,
    skip,
    take,
    has_more: skip + take < total,
    generated_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// E. Escalations (NIOV-wide read)
// ---------------------------------------------------------------------------

export interface ConsoleEscalationRow {
  escalation_id: string;
  source_entity_id: string;
  target_entity_id: string | null;
  action_type: string;
  status: string;
  reason: string | null;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
  approved_by_entity_id: string | null;
  rejected_by_entity_id: string | null;
}

export interface ConsoleEscalationQuery {
  skip?: string;
  take?: string;
  status?: string;
  source_entity_id?: string;
  action_type?: string;
}

const DUAL_CONTROL_DESCRIPTION_PREFIX = "DUAL_CONTROL:";

// WHAT: NIOV-wide Dual-Control / Escalation Center read (existing
//       /escalations/pending is session-scoped; this is can_admin_niov-wide).
export async function listConsoleEscalations(
  q: ConsoleEscalationQuery,
): Promise<ConsolePaginatedResponse<ConsoleEscalationRow>> {
  const { skip, take } = pageArgs(q.skip, q.take);
  const where: Prisma.EscalationRequestWhereInput = {};
  if (q.status) where.status = q.status as Prisma.EnumEscalationStatusFilter;
  if (q.source_entity_id) where.source_entity_id = q.source_entity_id;
  if (q.action_type) {
    where.description = { startsWith: `${DUAL_CONTROL_DESCRIPTION_PREFIX}${q.action_type}` };
  }

  const [rows, total] = await Promise.all([
    prisma.escalationRequest.findMany({
      where,
      skip,
      take,
      orderBy: { created_at: "desc" },
    }),
    prisma.escalationRequest.count({ where }),
  ]);

  const items: ConsoleEscalationRow[] = rows.map((r) => {
    const action_type = r.description.startsWith(DUAL_CONTROL_DESCRIPTION_PREFIX)
      ? r.description.slice(DUAL_CONTROL_DESCRIPTION_PREFIX.length)
      : String(r.escalation_type);
    return {
      escalation_id: r.escalation_id,
      source_entity_id: r.source_entity_id,
      target_entity_id: r.target_entity_id,
      action_type,
      status: String(r.status),
      reason: r.description,
      created_at: r.created_at.toISOString(),
      updated_at: (r.resolved_at ?? r.created_at).toISOString(),
      expires_at: r.expires_at ? r.expires_at.toISOString() : null,
      approved_by_entity_id:
        r.status === "APPROVED" ? r.resolved_by_entity_id : null,
      rejected_by_entity_id:
        r.status === "REJECTED" ? r.resolved_by_entity_id : null,
    };
  });

  return {
    ok: true,
    items,
    total,
    skip,
    take,
    has_more: skip + take < total,
    generated_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// F + G. Report catalog + report detail (static P0)
// ---------------------------------------------------------------------------

export interface ConsoleReportSummary {
  report_id: string;
  display_name: string;
  route_slug: string;
  primary_audience: ConsoleSecurityClass;
  purpose: string;
  readiness: ConsoleReadinessBadge;
  priority: ConsolePriority;
  sources: ConsoleDataSource[];
  export_options: { format: "csv" | "json" | "pdf"; enabled: boolean }[];
  mock_mode: boolean;
}

export interface ConsoleMetricCard {
  id: string;
  label: string;
  value: number | string | null;
  unit?: string;
  trend?: "up" | "down" | "flat";
  readiness: ConsoleReadinessBadge;
  source: ConsoleDataSource;
  warning?: string;
}
export interface ConsoleTable {
  id: string;
  columns: { id: string; label: string; sensitive?: boolean }[];
  rows: Record<string, unknown>[];
  paginated: boolean;
  total?: number;
  readiness: ConsoleReadinessBadge;
  source: ConsoleDataSource;
}
export interface ConsoleChart {
  id: string;
  kind: "line" | "bar" | "pie" | "area";
  series: { label: string; points: { t: string; v: number }[] }[];
  readiness: ConsoleReadinessBadge;
  source: ConsoleDataSource;
}
export interface ConsoleTimeline {
  id: string;
  events: { ts: string; label: string; severity?: "info" | "warn" | "critical"; ref?: string }[];
  readiness: ConsoleReadinessBadge;
  source: ConsoleDataSource;
}
export interface ConsoleExportOption {
  format: "csv" | "json" | "pdf";
  enabled: boolean;
  security: ConsoleSecurityClass;
}
export interface ConsoleReportFilter {
  id: string;
  label: string;
  type: "select" | "date-range" | "text" | "enum";
  options?: string[];
}
export interface ConsoleReportSection {
  id: string;
  title: string;
  cards?: ConsoleMetricCard[];
  tables?: ConsoleTable[];
  charts?: ConsoleChart[];
  timelines?: ConsoleTimeline[];
  empty_state?: string;
  warning_state?: string;
  drilldown?: { label: string; href: string }[];
}
export interface ConsoleReport {
  report_id: string;
  display_name: string;
  route_slug: string;
  audience: ConsoleSecurityClass;
  purpose: string;
  readiness: ConsoleReadinessBadge;
  priority: ConsolePriority;
  security: ConsoleSecurityClass;
  sections: ConsoleReportSection[];
  filters: ConsoleReportFilter[];
  exports: ConsoleExportOption[];
  sources: ConsoleDataSource[];
  last_refreshed: string | null;
  data_freshness_seconds?: number;
  auditable: boolean;
  mock_mode: boolean;
}

const src = (
  kind: ConsoleDataSource["kind"],
  ref: string,
  existing: boolean,
): ConsoleDataSource => ({ kind, ref, existing });

// WHAT: The static P0 report catalog — all 18 reports with readiness badges.
// INPUT: none.
// OUTPUT: ConsoleReportSummary[].
// WHY: Home Reports panel + Reports pages. Exports are returned as DISABLED
//      metadata (no export substrate exists in P0). Readiness is honest per
//      the CONSOLE.1 backend-readiness review (LIVE/PARTIAL/MOCK/FUTURE).
export function getConsoleReportCatalog(): ConsoleReportSummary[] {
  const disabled = (
    formats: ("csv" | "json" | "pdf")[],
  ): { format: "csv" | "json" | "pdf"; enabled: false }[] =>
    formats.map((format) => ({ format, enabled: false }));

  return [
    { report_id: "foundation_health", display_name: "Foundation Health", route_slug: "/reports/health", primary_audience: "NIOV_ONLY", purpose: "Overall Foundation status, substrate health, posture.", readiness: "PARTIAL", priority: "P0", sources: [src("route", "GET /api/v1/console/overview", true), src("route", "GET /health", true)], export_options: disabled(["csv", "json"]), mock_mode: false },
    { report_id: "governance_audit", display_name: "Governance & Audit", route_slug: "/reports/audit", primary_audience: "NIOV_ONLY", purpose: "Append-only audit chain feed + governance actions.", readiness: "LIVE", priority: "P0", sources: [src("route", "GET /api/v1/console/audit", true), src("model", "AuditEvent", true)], export_options: disabled(["csv", "json"]), mock_mode: false },
    { report_id: "break_glass", display_name: "Break-Glass Activity", route_slug: "/reports/break-glass", primary_audience: "NIOV_ONLY", purpose: "Time-boxed emergency grants + post-hoc review.", readiness: "PARTIAL", priority: "P0", sources: [src("route", "GET /api/v1/console/break-glass/grants", true), src("model", "BreakGlassGrant", true)], export_options: disabled(["csv", "json"]), mock_mode: false },
    { report_id: "dual_control", display_name: "Dual-Control / Escalation", route_slug: "/reports/escalations", primary_audience: "NIOV_ONLY", purpose: "Two-person verification escalations.", readiness: "PARTIAL", priority: "P0", sources: [src("route", "GET /api/v1/console/escalations", true), src("model", "EscalationRequest", true)], export_options: disabled(["csv", "json"]), mock_mode: false },
    { report_id: "wallet_entity_growth", display_name: "Wallet & Entity Growth", route_slug: "/reports/entities", primary_audience: "NIOV_ONLY", purpose: "Entities, wallets, type distribution, sessions.", readiness: "PARTIAL", priority: "P0", sources: [src("route", "GET /api/v1/console/entities", true), src("model", "Entity", true)], export_options: disabled(["csv"]), mock_mode: false },
    { report_id: "capsule_movement", display_name: "Memory Capsule Movement", route_slug: "/reports/capsules", primary_audience: "NIOV_ONLY", purpose: "Capsule lifecycle + mutation/read activity (metadata only).", readiness: "PARTIAL", priority: "P1", sources: [src("model", "MemoryCapsule", true), src("event", "CAPSULE_*", true)], export_options: disabled(["csv"]), mock_mode: false },
    { report_id: "permission_revocation", display_name: "Permission / Revocation", route_slug: "/reports/permissions", primary_audience: "NIOV_ONLY", purpose: "Permission grants + revocations.", readiness: "PARTIAL", priority: "P1", sources: [src("model", "Permission", true), src("event", "PERMISSION_*", true)], export_options: disabled(["csv"]), mock_mode: false },
    { report_id: "gateway_ratelimit", display_name: "Gateway / Rate-Limit", route_slug: "/reports/gateway", primary_audience: "NIOV_ONLY", purpose: "Rate-limit + anomaly activity; op classes.", readiness: "PARTIAL", priority: "P1", sources: [src("event", "RATE_LIMITED", true), src("route", "GET /api/v1/platform/anomalies", true)], export_options: disabled(["csv"]), mock_mode: false },
    { report_id: "regulator_proof", display_name: "Regulator Proof Surface", route_slug: "/reports/proof", primary_audience: "REGULATOR_PROOF", purpose: "Scoped lawful-basis proof (regulator proof portal, not full Console).", readiness: "FUTURE", priority: "P2", sources: [src("model", "LawfulBasis", true), src("event", "REGULATOR_ACCESS_*", true)], export_options: disabled(["pdf", "json"]), mock_mode: true },
    { report_id: "monetization_exchange", display_name: "Monetization / Intelligence Exchange", route_slug: "/reports/market", primary_audience: "NIOV_ONLY", purpose: "Monetization events; market surface (no live pricing).", readiness: "MOCK", priority: "P2", sources: [src("model", "MonetizationEvent", true), src("proposed", "market/cohort/pricing models", false)], export_options: disabled(["csv"]), mock_mode: true },
    { report_id: "developer_api_usage", display_name: "Developer / API Usage", route_slug: "/reports/developers", primary_audience: "DEVELOPER_SCOPED", purpose: "API keys + integration credentials (developer portal scope).", readiness: "PARTIAL", priority: "P1", sources: [src("model", "ApiKey", true), src("model", "IntegrationCredential", true)], export_options: disabled(["csv"]), mock_mode: false },
    { report_id: "agent_hive_swarm", display_name: "Agent / Hive / Swarm Operations", route_slug: "/reports/agents", primary_audience: "NIOV_ONLY", purpose: "Hives, agent templates, feedback loops; COSMP/DBGI telemetry future.", readiness: "PARTIAL", priority: "P1", sources: [src("model", "Hive", true), src("route", "GET /api/v1/platform/loops", true), src("proposed", "Elixir COSMP/DBGI telemetry bridge", false)], export_options: disabled(["csv"]), mock_mode: false },
    { report_id: "org_activity", display_name: "Enterprise / Organization Activity", route_slug: "/reports/orgs", primary_audience: "ORG_SCOPED", purpose: "Org-tenant admin activity (scoped org console).", readiness: "PARTIAL", priority: "P1", sources: [src("route", "/api/v1/org/*", true), src("model", "OrgSettings", true)], export_options: disabled(["csv"]), mock_mode: false },
    { report_id: "compliance_export", display_name: "Compliance Export", route_slug: "/reports/compliance", primary_audience: "NIOV_ONLY", purpose: "Compliance posture + evidence export readiness.", readiness: "PARTIAL", priority: "P1", sources: [src("model", "EntityComplianceProfile", true), src("route", "/api/v1/compliance/*", true)], export_options: disabled(["pdf", "json"]), mock_mode: false },
    { report_id: "capability_least_privilege", display_name: "Capability / Least-Privilege", route_slug: "/reports/capabilities", primary_audience: "NIOV_ONLY", purpose: "TAR capability model + least-privilege review.", readiness: "PARTIAL", priority: "P1", sources: [src("model", "TokenAttributeRepository", true), src("static", "docs/reference/govsec-least-privilege-review.md", true)], export_options: disabled(["csv"]), mock_mode: false },
    { report_id: "security_anomaly", display_name: "Security / Anomaly", route_slug: "/reports/security", primary_audience: "NIOV_ONLY", purpose: "Anomalies, failed logins, rate-limit breaches.", readiness: "PARTIAL", priority: "P0", sources: [src("event", "ANOMALY_DETECTED", true), src("event", "LOGIN_FAILED", true)], export_options: disabled(["csv"]), mock_mode: false },
    { report_id: "session_access", display_name: "Session / Access", route_slug: "/reports/sessions", primary_audience: "NIOV_ONLY", purpose: "Session lifecycle + access events.", readiness: "PARTIAL", priority: "P1", sources: [src("model", "Session", true), src("event", "SESSION_*", true)], export_options: disabled(["csv"]), mock_mode: false },
    { report_id: "audit_chain_integrity", display_name: "Audit Chain Integrity", route_slug: "/reports/chain", primary_audience: "NIOV_ONLY", purpose: "Append-only chain integrity (SHA-256 event_hash chain, ADR-0002).", readiness: "PARTIAL", priority: "P1", sources: [src("model", "AuditEvent", true), src("static", "ADR-0002", true)], export_options: disabled(["json"]), mock_mode: false },
  ];
}

// WHAT: One report's full envelope (sections). P0 returns a minimal but honest
//       envelope — LIVE reports point at real sources; others carry
//       PARTIAL/MOCK/FUTURE sections. Returns null for an unknown report_id.
// INPUT: report_id.
// OUTPUT: ConsoleReport | null.
export function getConsoleReport(report_id: string): ConsoleReport | null {
  const summary = getConsoleReportCatalog().find((r) => r.report_id === report_id);
  if (summary === undefined) return null;

  const exports: ConsoleExportOption[] = summary.export_options.map((e) => ({
    format: e.format,
    enabled: false,
    security: summary.primary_audience,
  }));

  const baseSection: ConsoleReportSection = {
    id: `${report_id}_overview`,
    title: summary.display_name,
    cards: [
      {
        id: `${report_id}_readiness`,
        label: "Readiness",
        value: summary.readiness,
        readiness: summary.readiness,
        source: summary.sources[0] ?? src("static", "console.service.ts", true),
      },
    ],
    empty_state: "No data yet for this report.",
    warning_state:
      summary.readiness === "MOCK" || summary.readiness === "FUTURE"
        ? "This report is not yet backed by live Foundation data."
        : undefined,
    drilldown: [{ label: "Open", href: summary.route_slug }],
  };

  return {
    report_id: summary.report_id,
    display_name: summary.display_name,
    route_slug: summary.route_slug,
    audience: summary.primary_audience,
    purpose: summary.purpose,
    readiness: summary.readiness,
    priority: summary.priority,
    security: summary.primary_audience,
    sections: [baseSection],
    filters: [
      { id: "date_range", label: "Date range", type: "date-range" },
    ],
    exports,
    sources: summary.sources,
    last_refreshed: null,
    auditable: true,
    mock_mode: summary.mock_mode,
  };
}
