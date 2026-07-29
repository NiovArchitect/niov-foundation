// FILE: executive-brief.service.ts
// PURPOSE: Daily executive brief — schedule create, run-now generation
//          from live demo sources, in-Otzar delivery, duplicate guard,
//          failure/retry, and audit. No email/Slack claims.
// CONNECTS TO: NotificationService, dgi-coherence, work ledger,
//              twin collaboration, writeAuditEvent, AuthService.

import { randomUUID } from "node:crypto";
import { prisma, writeAuditEvent } from "@niov/database";
import type { AuthService } from "../auth.service.js";
import { getOrgEntityId } from "../governance/org.js";
import {
  makeNotificationService,
  type NotificationService,
} from "../notification/notification.service.js";
import {
  buildDgiCoherenceSnapshot,
  selectPrimaryTwinStrict,
  twinPairingFromSelection,
} from "./dgi-coherence.service.js";
import { resolvePrimaryTwin } from "./twin-resolution.js";
export const REPORT_TYPE_DAILY_EXEC_BRIEF = "daily_executive_brief" as const;
export const NOTIF_CLASS_SCHEDULE = "REPORT_SCHEDULE" as const;
export const NOTIF_CLASS_DELIVERY = "EXECUTIVE_BRIEF" as const;
export const NOTIF_CLASS_FAILURE = "EXECUTIVE_BRIEF_FAILURE" as const;

export interface ExecutiveBriefBody {
  report_type: typeof REPORT_TYPE_DAILY_EXEC_BRIEF;
  generated_at: string;
  schedule_id: string;
  delivery_window: string;
  recipient_entity_id: string;
  current_outcome: string;
  what_changed: string;
  material_risk: string;
  human_decision: string;
  work_otzar_handled: string;
  relevant_proof: string[];
  sources: string[];
}

export interface ReportScheduleView {
  schedule_id: string;
  report_type: typeof REPORT_TYPE_DAILY_EXEC_BRIEF;
  cadence: "daily";
  recipient_entity_id: string;
  audience: "organization_lead";
  delivery: "inside_otzar";
  created_at: string;
  last_run_at: string | null;
  last_delivery_id: string | null;
  active: boolean;
}

type FailureCode =
  | "SESSION_INVALID"
  | "ORG_REQUIRED"
  | "SCHEDULE_NOT_FOUND"
  | "NOT_SCHEDULE_OWNER"
  | "DUPLICATE_DELIVERY"
  | "DELIVERY_FAILED"
  | "GENERATION_FAILED";

export type ExecutiveBriefResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: FailureCode; message: string };

function utcDeliveryWindow(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function safeTitle(raw: string | null | undefined): string {
  const t = (raw ?? "").replace(/\s+/g, " ").trim();
  if (t.length === 0) return "(untitled)";
  return t.length > 120 ? `${t.slice(0, 117)}…` : t;
}

/**
 * WHAT: Pure brief assembly from already-fetched governed facts.
 * INPUT: Snapshot fields + collab + work titles.
 * OUTPUT: ExecutiveBriefBody without ids (caller fills).
 * WHY: Unit-testable generation; no static hard-coded HelioGrid claims.
 */
export function assembleExecutiveBriefContent(input: {
  open_active_work_titles: string[];
  open_obligation_titles: string[];
  open_incoming_handoff_titles: string[];
  collab_outbound_count: number;
  collab_completed_titles: string[];
  recommendation_hint: string | null;
}): Omit<
  ExecutiveBriefBody,
  | "generated_at"
  | "schedule_id"
  | "delivery_window"
  | "recipient_entity_id"
  | "report_type"
> {
  const work = input.open_active_work_titles.map(safeTitle);
  const topWork = work[0] ?? "No open assigned work in governed ledger";
  const risk =
    work.find((t) => /security|gate|risk|blocker/i.test(t)) ??
    input.open_obligation_titles[0] ??
    "No material risk title in current open work";
  const human =
    work.find((t) => /interview|approve|decision|judgment|invite/i.test(t)) ??
    "No human decision item surfaced in open work";
  const handled =
    input.collab_completed_titles[0] ??
    (input.collab_outbound_count > 0
      ? `${input.collab_outbound_count} AI Teammate collaboration request(s) on record`
      : "No completed automatic collaboration receipt in this window");
  const changed =
    work.length > 0
      ? `${work.length} open work item(s); top: ${topWork}`
      : "No material work change in governed feed";
  const outcome =
    input.recommendation_hint?.trim() ||
    (work.length > 0
      ? `Current focus: ${topWork}`
      : "No current recommendation signal in open work");

  const proof: string[] = [];
  for (const t of work.slice(0, 3)) proof.push(`work:${t}`);
  for (const t of input.collab_completed_titles.slice(0, 2)) {
    proof.push(`collab:${t}`);
  }
  if (proof.length === 0) proof.push("proof:dgi_coherence_snapshot");

  return {
    current_outcome: outcome,
    what_changed: changed,
    material_risk: safeTitle(risk),
    human_decision: safeTitle(human),
    work_otzar_handled: safeTitle(handled),
    relevant_proof: proof,
    sources: [
      "work_ledger_active",
      "dgi_coherence",
      "collaboration_requests_outbound",
    ],
  };
}

function parseScheduleBody(
  raw: unknown,
): {
  schedule_id: string;
  report_type: string;
  recipient_entity_id: string;
  cadence: string;
  last_run_at: string | null;
  last_delivery_id: string | null;
  active: boolean;
} | null {
  if (raw === null || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.schedule_id !== "string") return null;
  if (typeof o.recipient_entity_id !== "string") return null;
  return {
    schedule_id: o.schedule_id,
    report_type:
      typeof o.report_type === "string"
        ? o.report_type
        : REPORT_TYPE_DAILY_EXEC_BRIEF,
    recipient_entity_id: o.recipient_entity_id,
    cadence: typeof o.cadence === "string" ? o.cadence : "daily",
    last_run_at: typeof o.last_run_at === "string" ? o.last_run_at : null,
    last_delivery_id:
      typeof o.last_delivery_id === "string" ? o.last_delivery_id : null,
    active: o.active !== false,
  };
}

export class ExecutiveBriefService {
  private readonly notifications: NotificationService;

  constructor(
    private readonly authService: AuthService,
    notifications?: NotificationService,
  ) {
    this.notifications = notifications ?? makeNotificationService();
  }

  /**
   * WHAT: Create a daily executive brief schedule for the org lead (caller).
   * INPUT: bearer token.
   * OUTPUT: ReportScheduleView.
   * WHY: Acceptance gate — schedule creation inside Otzar.
   */
  async createScheduleForCaller(
    token: string,
  ): Promise<ExecutiveBriefResult<ReportScheduleView>> {
    const session = await this.authService.validateSession(token, "write");
    if (!session.valid) {
      return {
        ok: false,
        code: "SESSION_INVALID",
        message: "Schedule create denied",
      };
    }
    const callerId = session.entity_id;
    let orgEntityId: string;
    try {
      orgEntityId = await getOrgEntityId(callerId);
    } catch {
      return { ok: false, code: "ORG_REQUIRED", message: "Caller has no org" };
    }

    // Reuse existing active schedule if present (idempotent create).
    const existing = await prisma.notification.findFirst({
      where: {
        org_entity_id: orgEntityId,
        recipient_entity_id: callerId,
        notification_class: NOTIF_CLASS_SCHEDULE,
        deleted_at: null,
      },
      orderBy: { created_at: "desc" },
    });
    if (existing !== null) {
      const parsed = parseScheduleBody(existing.body_redacted);
      if (parsed !== null && parsed.active) {
        return {
          ok: true,
          data: {
            schedule_id: parsed.schedule_id,
            report_type: REPORT_TYPE_DAILY_EXEC_BRIEF,
            cadence: "daily",
            recipient_entity_id: parsed.recipient_entity_id,
            audience: "organization_lead",
            delivery: "inside_otzar",
            created_at: existing.created_at.toISOString(),
            last_run_at: parsed.last_run_at,
            last_delivery_id: parsed.last_delivery_id,
            active: true,
          },
        };
      }
    }

    const schedule_id = randomUUID();
    const body = {
      schedule_id,
      report_type: REPORT_TYPE_DAILY_EXEC_BRIEF,
      cadence: "daily",
      recipient_entity_id: callerId,
      audience: "organization_lead",
      delivery: "inside_otzar",
      last_run_at: null as string | null,
      last_delivery_id: null as string | null,
      active: true,
    };
    const created = await this.notifications.createInternalNotification({
      org_entity_id: orgEntityId,
      recipient_entity_id: callerId,
      source_entity_id: callerId,
      notification_class: NOTIF_CLASS_SCHEDULE,
      body_summary: "Daily executive brief scheduled (inside Otzar)",
      body_redacted: body,
    });
    if (!created.ok) {
      return {
        ok: false,
        code: "DELIVERY_FAILED",
        message: `Schedule persist failed: ${created.code}`,
      };
    }

    await writeAuditEvent({
      event_type: "ADMIN_ACTION",
      outcome: "SUCCESS",
      actor_entity_id: callerId,
      target_entity_id: callerId,
      details: {
        action: "CREATE_DAILY_EXECUTIVE_BRIEF_SCHEDULE",
        schedule_id,
        org_entity_id: orgEntityId,
        report_type: REPORT_TYPE_DAILY_EXEC_BRIEF,
        delivery: "inside_otzar",
        notification_id: created.notification.notification_id,
      },
    }).catch(() => undefined);

    return {
      ok: true,
      data: {
        schedule_id,
        report_type: REPORT_TYPE_DAILY_EXEC_BRIEF,
        cadence: "daily",
        recipient_entity_id: callerId,
        audience: "organization_lead",
        delivery: "inside_otzar",
        created_at: created.notification.created_at.toISOString(),
        last_run_at: null,
        last_delivery_id: null,
        active: true,
      },
    };
  }

  /**
   * WHAT: List schedules for the caller (self-scoped).
   */
  async listSchedulesForCaller(
    token: string,
  ): Promise<ExecutiveBriefResult<{ schedules: ReportScheduleView[] }>> {
    const session = await this.authService.validateSession(token, "read");
    if (!session.valid) {
      return {
        ok: false,
        code: "SESSION_INVALID",
        message: "List schedules denied",
      };
    }
    const callerId = session.entity_id;
    let orgEntityId: string;
    try {
      orgEntityId = await getOrgEntityId(callerId);
    } catch {
      return { ok: false, code: "ORG_REQUIRED", message: "Caller has no org" };
    }
    const rows = await prisma.notification.findMany({
      where: {
        org_entity_id: orgEntityId,
        recipient_entity_id: callerId,
        notification_class: NOTIF_CLASS_SCHEDULE,
        deleted_at: null,
      },
      orderBy: { created_at: "desc" },
      take: 20,
    });
    const schedules: ReportScheduleView[] = [];
    for (const row of rows) {
      const p = parseScheduleBody(row.body_redacted);
      if (p === null || !p.active) continue;
      schedules.push({
        schedule_id: p.schedule_id,
        report_type: REPORT_TYPE_DAILY_EXEC_BRIEF,
        cadence: "daily",
        recipient_entity_id: p.recipient_entity_id,
        audience: "organization_lead",
        delivery: "inside_otzar",
        created_at: row.created_at.toISOString(),
        last_run_at: p.last_run_at,
        last_delivery_id: p.last_delivery_id,
        active: true,
      });
    }
    return { ok: true, data: { schedules } };
  }

  /**
   * WHAT: Run-now (or accelerated) generation + in-Otzar delivery.
   * INPUT: token, schedule_id, force_retry (bypass same-window duplicate).
   * OUTPUT: brief + delivery receipt.
   * WHY: Acceptance — real sources, correct recipient, no email/Slack.
   */
  async runNowForCaller(input: {
    token: string;
    schedule_id: string;
    force_retry?: boolean;
  }): Promise<
    ExecutiveBriefResult<{
      brief: ExecutiveBriefBody;
      delivery: {
        notification_id: string;
        recipient_entity_id: string;
        delivery_window: string;
        duplicate: boolean;
      };
    }>
  > {
    const session = await this.authService.validateSession(
      input.token,
      "write",
    );
    if (!session.valid) {
      return {
        ok: false,
        code: "SESSION_INVALID",
        message: "Run-now denied",
      };
    }
    const callerId = session.entity_id;
    let orgEntityId: string;
    try {
      orgEntityId = await getOrgEntityId(callerId);
    } catch {
      return { ok: false, code: "ORG_REQUIRED", message: "Caller has no org" };
    }

    const scheduleRow = await prisma.notification.findFirst({
      where: {
        org_entity_id: orgEntityId,
        recipient_entity_id: callerId,
        notification_class: NOTIF_CLASS_SCHEDULE,
        deleted_at: null,
      },
      orderBy: { created_at: "desc" },
    });
    if (scheduleRow === null) {
      return {
        ok: false,
        code: "SCHEDULE_NOT_FOUND",
        message: "No schedule for caller",
      };
    }
    const schedule = parseScheduleBody(scheduleRow.body_redacted);
    if (schedule === null || schedule.schedule_id !== input.schedule_id) {
      // Accept if any active schedule matches id under org+caller
      const match = await prisma.notification.findFirst({
        where: {
          org_entity_id: orgEntityId,
          recipient_entity_id: callerId,
          notification_class: NOTIF_CLASS_SCHEDULE,
          deleted_at: null,
        },
        orderBy: { created_at: "desc" },
      });
      const m = match ? parseScheduleBody(match.body_redacted) : null;
      if (m === null || m.schedule_id !== input.schedule_id) {
        return {
          ok: false,
          code: "SCHEDULE_NOT_FOUND",
          message: "Schedule id not found for caller",
        };
      }
    }
    const recipientId = schedule?.recipient_entity_id ?? callerId;
    if (recipientId !== callerId) {
      return {
        ok: false,
        code: "NOT_SCHEDULE_OWNER",
        message: "Schedule belongs to another recipient",
      };
    }

    const window = utcDeliveryWindow();
    if (input.force_retry !== true) {
      const prior = await prisma.notification.findFirst({
        where: {
          org_entity_id: orgEntityId,
          recipient_entity_id: recipientId,
          notification_class: NOTIF_CLASS_DELIVERY,
          deleted_at: null,
          created_at: {
            gte: new Date(`${window}T00:00:00.000Z`),
            lt: new Date(
              new Date(`${window}T00:00:00.000Z`).getTime() +
                24 * 60 * 60 * 1000,
            ),
          },
        },
        orderBy: { created_at: "desc" },
      });
      if (prior !== null) {
        const priorBody = prior.body_redacted as Record<string, unknown> | null;
        const priorSchedule =
          priorBody && typeof priorBody.schedule_id === "string"
            ? priorBody.schedule_id
            : null;
        if (priorSchedule === input.schedule_id) {
          await writeAuditEvent({
            event_type: "ADMIN_ACTION",
            outcome: "DENIED",
            actor_entity_id: callerId,
            target_entity_id: callerId,
            details: {
              action: "RUN_DAILY_EXECUTIVE_BRIEF_DUPLICATE",
              schedule_id: input.schedule_id,
              delivery_window: window,
              existing_notification_id: prior.notification_id,
            },
          }).catch(() => undefined);
          return {
            ok: false,
            code: "DUPLICATE_DELIVERY",
            message: "Brief already delivered for this UTC day",
          };
        }
      }
    }

    let brief: ExecutiveBriefBody;
    try {
      brief = await this.generateBrief({
        orgEntityId,
        subjectEntityId: callerId,
        schedule_id: input.schedule_id,
        recipient_entity_id: recipientId,
        delivery_window: window,
      });
    } catch (err) {
      await this.recordFailure({
        orgEntityId,
        callerId,
        schedule_id: input.schedule_id,
        reason: err instanceof Error ? err.message : "generation_failed",
      });
      return {
        ok: false,
        code: "GENERATION_FAILED",
        message: "Brief generation failed",
      };
    }

    const delivered = await this.notifications.createInternalNotification({
      org_entity_id: orgEntityId,
      recipient_entity_id: recipientId,
      source_entity_id: callerId,
      notification_class: NOTIF_CLASS_DELIVERY,
      body_summary: `Daily executive brief · ${brief.current_outcome.slice(0, 80)}`,
      body_redacted: brief as unknown as Record<string, unknown>,
    });
    if (!delivered.ok) {
      await this.recordFailure({
        orgEntityId,
        callerId,
        schedule_id: input.schedule_id,
        reason: delivered.code,
      });
      return {
        ok: false,
        code: "DELIVERY_FAILED",
        message: `Delivery failed: ${delivered.code}`,
      };
    }

    // Update schedule last_run metadata (best-effort in-place).
    const nextBody = {
      ...(parseScheduleBody(scheduleRow.body_redacted) ?? {}),
      schedule_id: input.schedule_id,
      report_type: REPORT_TYPE_DAILY_EXEC_BRIEF,
      recipient_entity_id: recipientId,
      cadence: "daily",
      active: true,
      last_run_at: brief.generated_at,
      last_delivery_id: delivered.notification.notification_id,
    };
    await prisma.notification
      .update({
        where: { notification_id: scheduleRow.notification_id },
        data: { body_redacted: nextBody },
      })
      .catch(() => undefined);

    await writeAuditEvent({
      event_type: "ADMIN_ACTION",
      outcome: "SUCCESS",
      actor_entity_id: callerId,
      target_entity_id: callerId,
      details: {
        action: "RUN_DAILY_EXECUTIVE_BRIEF",
        schedule_id: input.schedule_id,
        org_entity_id: orgEntityId,
        delivery_notification_id: delivered.notification.notification_id,
        delivery_window: window,
        sources: brief.sources,
        force_retry: input.force_retry === true,
      },
    }).catch(() => undefined);

    return {
      ok: true,
      data: {
        brief,
        delivery: {
          notification_id: delivered.notification.notification_id,
          recipient_entity_id: recipientId,
          delivery_window: window,
          duplicate: false,
        },
      },
    };
  }

  /**
   * WHAT: List delivered briefs for the caller (inside Otzar inbox projection).
   */
  async listDeliveriesForCaller(
    token: string,
  ): Promise<
    ExecutiveBriefResult<{
      deliveries: Array<{
        notification_id: string;
        created_at: string;
        body_summary: string;
        brief: ExecutiveBriefBody | null;
      }>;
    }>
  > {
    const session = await this.authService.validateSession(token, "read");
    if (!session.valid) {
      return {
        ok: false,
        code: "SESSION_INVALID",
        message: "List deliveries denied",
      };
    }
    const callerId = session.entity_id;
    let orgEntityId: string;
    try {
      orgEntityId = await getOrgEntityId(callerId);
    } catch {
      return { ok: false, code: "ORG_REQUIRED", message: "Caller has no org" };
    }
    const rows = await prisma.notification.findMany({
      where: {
        org_entity_id: orgEntityId,
        recipient_entity_id: callerId,
        notification_class: NOTIF_CLASS_DELIVERY,
        deleted_at: null,
      },
      orderBy: { created_at: "desc" },
      take: 20,
    });
    return {
      ok: true,
      data: {
        deliveries: rows.map((r) => {
          const body = r.body_redacted as ExecutiveBriefBody | null;
          return {
            notification_id: r.notification_id,
            created_at: r.created_at.toISOString(),
            body_summary: r.body_summary,
            brief:
              body && body.report_type === REPORT_TYPE_DAILY_EXEC_BRIEF
                ? body
                : null,
          };
        }),
      },
    };
  }

  private async generateBrief(args: {
    orgEntityId: string;
    subjectEntityId: string;
    schedule_id: string;
    recipient_entity_id: string;
    delivery_window: string;
  }): Promise<ExecutiveBriefBody> {
    const resolvedTwin = await resolvePrimaryTwin(args.subjectEntityId);
    const twinPick = selectPrimaryTwinStrict(resolvedTwin);
    const pairing = twinPairingFromSelection(twinPick);
    const coherence = await buildDgiCoherenceSnapshot({
      orgEntityId: args.orgEntityId,
      subjectEntityId: args.subjectEntityId,
      twinEntityId: pairing.twin_entity_id,
      twin_pairing_status: pairing.twin_pairing_status,
      eligible_twin_count: pairing.eligible_twin_count,
    });

    let collab_outbound_count = 0;
    const collab_completed_titles: string[] = [];
    try {
      // Service expects token-less list via direct prisma would be better;
      // use collaboration list if token unavailable — query prisma.
      const collabs = await prisma.twinCollaborationRequest.findMany({
        where: {
          org_entity_id: args.orgEntityId,
          requester_entity_id: args.subjectEntityId,
        },
        orderBy: { created_at: "desc" },
        take: 20,
        select: {
          state: true,
          safe_summary: true,
        },
      });
      collab_outbound_count = collabs.length;
      for (const c of collabs) {
        if (c.state === "COMPLETED") {
          collab_completed_titles.push(
            safeTitle(c.safe_summary ?? "AI collaboration completed"),
          );
        }
      }
    } catch {
      collab_outbound_count = 0;
    }

    const content = assembleExecutiveBriefContent({
      open_active_work_titles: coherence.open_active_work_titles ?? [],
      open_obligation_titles: coherence.open_obligation_titles ?? [],
      open_incoming_handoff_titles:
        coherence.open_incoming_handoff_titles ?? [],
      collab_outbound_count,
      collab_completed_titles,
      recommendation_hint:
        (coherence.open_active_work_titles ?? []).find((t) =>
          /conditional|recommend|interview/i.test(t),
        ) ?? null,
    });

    return {
      report_type: REPORT_TYPE_DAILY_EXEC_BRIEF,
      generated_at: new Date().toISOString(),
      schedule_id: args.schedule_id,
      delivery_window: args.delivery_window,
      recipient_entity_id: args.recipient_entity_id,
      ...content,
    };
  }

  private async recordFailure(args: {
    orgEntityId: string;
    callerId: string;
    schedule_id: string;
    reason: string;
  }): Promise<void> {
    await this.notifications
      .createInternalNotification({
        org_entity_id: args.orgEntityId,
        recipient_entity_id: args.callerId,
        source_entity_id: args.callerId,
        notification_class: NOTIF_CLASS_FAILURE,
        body_summary: `Executive brief failed: ${args.reason.slice(0, 80)}`,
        body_redacted: {
          schedule_id: args.schedule_id,
          reason: args.reason.slice(0, 200),
          retryable: true,
        },
      })
      .catch(() => undefined);
    await writeAuditEvent({
      event_type: "ADMIN_ACTION",
      outcome: "ERROR",
      actor_entity_id: args.callerId,
      target_entity_id: args.callerId,
      details: {
        action: "RUN_DAILY_EXECUTIVE_BRIEF",
        schedule_id: args.schedule_id,
        reason: args.reason.slice(0, 200),
        retryable: true,
      },
    }).catch(() => undefined);
  }
}
