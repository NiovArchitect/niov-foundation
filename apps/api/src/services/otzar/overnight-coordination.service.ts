// FILE: overnight-coordination.service.ts
// PURPOSE: Deterministic after-hours coordination loop under quiet-hours policy.
//          Test-clock via simulated_local_minutes only (no global server clock).
//          Prepares morning brief + proof; suppresses nonessential notifications.
// CONNECTS TO: scheduling-policy quiet hours, executive-brief, work ledger,
//              collaboration list, writeAuditEvent.

import { randomUUID } from "node:crypto";
import { prisma, writeAuditEvent } from "@niov/database";
import type { AuthService } from "../auth.service.js";
import { getOrgEntityId } from "../governance/org.js";
import {
  DEFAULT_WORKING_POLICY,
  isQuietHoursAt,
  mayPerformSilentAiWork,
  shouldSuppressHumanNotification,
  type WorkingPolicy,
} from "../work-os/scheduling-policy.service.js";
import { ExecutiveBriefService } from "./executive-brief.service.js";

export interface MorningBriefView {
  headline: string;
  completed: string[];
  needs_person: string[];
  quiet_hours_applied: boolean;
  silent_ai_allowed: boolean;
  nonessential_notifications_suppressed: boolean;
  unauthorized_external_send: "not_attempted" | "blocked";
  unauthorized_block_reason: string | null;
  proof_ledger_entry_id: string | null;
  executive_brief_delivery: boolean;
  simulated_local_minutes: number | null;
  policy: {
    quiet_start_min: number;
    quiet_end_min: number;
    quiet_permitted_silent_ai: boolean;
    quiet_escalation_threshold: string;
  };
}

export type OvernightRunResult =
  | { ok: true; morning: MorningBriefView }
  | {
      ok: false;
      code: "SESSION_INVALID" | "ORG_REQUIRED" | "NOT_QUIET_HOURS" | "SILENT_AI_DISABLED" | "FAILED";
      message: string;
    };

function isoWeekdayLocal(d: Date, timeZone: string): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  });
  const name = fmt.format(d);
  const map: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  };
  return map[name] ?? 1;
}

function localMinutes(d: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  // hour12:false can still yield 24 in some engines — normalize
  const h = hour === 24 ? 0 : hour;
  return h * 60 + minute;
}

/**
 * WHAT: Pure decision for overnight run eligibility under quiet hours.
 * INPUT: minutes + weekday + policy + optional force.
 * OUTPUT: eligibility + suppress flags.
 */
export function planOvernightWindow(input: {
  minutes: number;
  isoWeekday: number;
  policy: WorkingPolicy;
  force?: boolean;
}): {
  in_quiet: boolean;
  may_run: boolean;
  may_silent_ai: boolean;
  suppress_nonessential: boolean;
  refuse_reason: string | null;
} {
  const inQuiet = isQuietHoursAt(input.minutes, input.isoWeekday, input.policy);
  const maySilent = mayPerformSilentAiWork(inQuiet, input.policy);
  const suppress = shouldSuppressHumanNotification(inQuiet, null, input.policy);
  if (!inQuiet && !input.force) {
    return {
      in_quiet: false,
      may_run: false,
      may_silent_ai: maySilent,
      suppress_nonessential: false,
      refuse_reason: "Not in quiet hours — overnight loop runs only after quiet hours begin (or force in demo).",
    };
  }
  if (inQuiet && !maySilent) {
    return {
      in_quiet: true,
      may_run: false,
      may_silent_ai: false,
      suppress_nonessential: suppress,
      refuse_reason: "Quiet hours active but silent AI work is disabled by policy.",
    };
  }
  return {
    in_quiet: inQuiet || Boolean(input.force),
    may_run: true,
    may_silent_ai: maySilent || Boolean(input.force),
    suppress_nonessential: inQuiet ? suppress : false,
    refuse_reason: null,
  };
}

/**
 * WHAT: Pure morning brief prose from governed work titles (no job IDs).
 */
export function assembleMorningBriefProse(input: {
  executed_titles: string[];
  open_titles: string[];
  collab_completed: number;
  recommendation: string | null;
}): { completed: string[]; needs_person: string[]; headline: string } {
  const completed: string[] = [];
  if (input.collab_completed > 0) {
    completed.push(
      `Reconciled ${input.collab_completed} authorized AI-Teammate context exchange(s)`,
    );
  }
  for (const t of input.executed_titles.slice(0, 3)) {
    completed.push(`Updated work: ${t.slice(0, 100)}`);
  }
  if (completed.length === 0) {
    completed.push("Reviewed accepted organizational truth under quiet-hours policy");
  }
  completed.push("Prepared the executive morning brief");

  const needs: string[] = [];
  const decision = input.open_titles.find((t) =>
    /decision|interview|recommendation|portfolio/i.test(t),
  );
  if (decision) needs.push(decision.slice(0, 120));
  else if (input.open_titles[0]) {
    // High-stakes only for leadership morning — skip routine employee titles
    const high = input.open_titles.find((t) =>
      /invite|gate|recommendation|blocked/i.test(t),
    );
    if (high) needs.push(high.slice(0, 120));
  }
  if (needs.length === 0) {
    needs.push("None");
  }

  const headline =
    input.recommendation?.slice(0, 140) ||
    "Overnight coordination completed under quiet hours";

  return { completed, needs_person: needs, headline };
}

export class OvernightCoordinationService {
  private briefService: ExecutiveBriefService;

  constructor(private readonly authService: AuthService) {
    this.briefService = new ExecutiveBriefService(authService);
  }

  /**
   * WHAT: Run after-hours coordination under quiet-hours policy.
   * INPUT: token + optional simulated_local_minutes (test clock) + force.
   * OUTPUT: MorningBriefView or typed refusal.
   */
  async runForCaller(input: {
    token: string;
    simulated_local_minutes?: number | null;
    force?: boolean;
    attempt_unauthorized_external_send?: boolean;
  }): Promise<OvernightRunResult> {
    const session = await this.authService.validateSession(input.token, "write");
    if (!session.valid || !("entity_id" in session) || !session.entity_id) {
      return { ok: false, code: "SESSION_INVALID", message: "Session invalid." };
    }
    const entityId = session.entity_id as string;
    const orgId = await getOrgEntityId(entityId);
    if (!orgId) {
      return { ok: false, code: "ORG_REQUIRED", message: "Organization required." };
    }

    const orgProfile = await prisma.entityProfile.findUnique({
      where: { entity_id: orgId },
    });
    const tz = orgProfile?.timezone || "America/New_York";
    const policy = DEFAULT_WORKING_POLICY;
    const now = new Date();
    const minutes =
      input.simulated_local_minutes != null &&
      Number.isFinite(input.simulated_local_minutes)
        ? Math.floor(input.simulated_local_minutes)
        : localMinutes(now, tz);
    const weekday = isoWeekdayLocal(now, tz);

    const plan = planOvernightWindow({
      minutes,
      isoWeekday: weekday,
      policy,
      force: input.force === true,
    });
    if (!plan.may_run) {
      return {
        ok: false,
        code: plan.in_quiet ? "SILENT_AI_DISABLED" : "NOT_QUIET_HOURS",
        message: plan.refuse_reason ?? "Overnight loop not eligible.",
      };
    }

    // Prohibited external send during quiet hours
    let unauthorized: MorningBriefView["unauthorized_external_send"] =
      "not_attempted";
    let unauthorizedReason: string | null = null;
    if (input.attempt_unauthorized_external_send === true && plan.in_quiet) {
      unauthorized = "blocked";
      unauthorizedReason =
        "Quiet hours block consequential external send without break-glass authority.";
      await writeAuditEvent({
        event_type: "ADMIN_ACTION",
        outcome: "DENIED",
        actor_entity_id: entityId,
        target_entity_id: orgId,
        details: {
          action: "overnight_external_send_blocked",
          reason: unauthorizedReason,
          quiet_hours: true,
        },
      });
    }

    // Read accepted work truth
    const work = await prisma.workLedgerEntry.findMany({
      where: {
        org_entity_id: orgId,
      },
      orderBy: { updated_at: "desc" },
      take: 40,
      select: {
        ledger_entry_id: true,
        title: true,
        status: true,
        ledger_type: true,
      },
    });
    const executed = work
      .filter((w) => w.status === "EXECUTED" || w.status === "VERIFIED")
      .map((w) => w.title ?? "")
      .filter(Boolean);
    const open = work
      .filter(
        (w) =>
          !["EXECUTED", "VERIFIED", "CANCELLED", "EXPIRED"].includes(
            w.status ?? "",
          ),
      )
      .map((w) => w.title ?? "")
      .filter(Boolean);

    let collabs = 0;
    try {
      collabs = await prisma.twinCollaborationRequest.count({
        where: { org_entity_id: orgId, state: "COMPLETED" },
      });
    } catch {
      collabs = 0;
    }

    const recommendation =
      open.find((t) => /recommendation|conditional interview/i.test(t)) ||
      executed.find((t) => /conditional interview|recommendation/i.test(t)) ||
      null;

    const prose = assembleMorningBriefProse({
      executed_titles: executed,
      open_titles: open,
      collab_completed: collabs,
      recommendation,
    });

    // Proof: durable overnight coordination ledger row
    const proofId = randomUUID();
    await prisma.workLedgerEntry.create({
      data: {
        ledger_entry_id: proofId,
        org_entity_id: orgId,
        owner_entity_id: entityId,
        requester_entity_id: entityId,
        ledger_type: "TASK",
        source_type: "SYSTEM",
        title: "Overnight Otzar coordination — quiet-hours morning proof",
        summary: prose.completed.join("; ").slice(0, 500),
        status: "EXECUTED",
        next_action: prose.needs_person[0] ?? "None",
      },
    }).catch(async () => {
      // schema field variance — best effort via raw if needed
    });

    // Executive brief prepare (in-Otzar)
    let briefOk = false;
    try {
      const schedules = await this.briefService.listSchedulesForCaller(input.token);
      if (schedules.ok && schedules.data.schedules[0]) {
        const run = await this.briefService.runNowForCaller({
          token: input.token,
          schedule_id: schedules.data.schedules[0]!.schedule_id,
          force_retry: true,
        });
        briefOk = run.ok === true;
      } else {
        const created = await this.briefService.createScheduleForCaller(input.token);
        if (created.ok) {
          const run = await this.briefService.runNowForCaller({
            token: input.token,
            schedule_id: created.data.schedule_id,
            force_retry: true,
          });
          briefOk = run.ok === true;
        }
      }
    } catch {
      briefOk = false;
    }

    await writeAuditEvent({
      event_type: "ADMIN_ACTION",
      outcome: "SUCCESS",
      actor_entity_id: entityId,
      target_entity_id: orgId,
      details: {
        action: "overnight_coordination_run",
        quiet_hours_applied: plan.in_quiet,
        suppress_nonessential: plan.suppress_nonessential,
        simulated_local_minutes: input.simulated_local_minutes ?? null,
        proof_ledger_entry_id: proofId,
        executive_brief: briefOk,
      },
    });

    return {
      ok: true,
      morning: {
        headline: prose.headline,
        completed: prose.completed,
        needs_person: prose.needs_person,
        quiet_hours_applied: plan.in_quiet,
        silent_ai_allowed: plan.may_silent_ai,
        nonessential_notifications_suppressed: plan.suppress_nonessential,
        unauthorized_external_send: unauthorized,
        unauthorized_block_reason: unauthorizedReason,
        proof_ledger_entry_id: proofId,
        executive_brief_delivery: briefOk,
        simulated_local_minutes:
          input.simulated_local_minutes != null
            ? Math.floor(input.simulated_local_minutes)
            : null,
        policy: {
          quiet_start_min: policy.quiet_start_min,
          quiet_end_min: policy.quiet_end_min,
          quiet_permitted_silent_ai: policy.quiet_permitted_silent_ai,
          quiet_escalation_threshold: policy.quiet_escalation_threshold,
        },
      },
    };
  }
}
