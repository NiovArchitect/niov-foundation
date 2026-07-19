// FILE: work-style-learning.service.ts
// PURPOSE: End-to-end work-style learning — org policy, user consent,
//          visible sessions, candidate extraction (safe patterns only),
//          review → TwinCorrectionMemory (approved store), never raw
//          content. Reuses TwinCorrectionMemory (no duplicate store).
// CONNECTS TO: twin-correction-memory.service, conductSession L3,
//              MyMemory UI, wallet portability classification.

import { randomUUID } from "node:crypto";
import { prisma, writeAuditEvent } from "@niov/database";
import type { TwinCorrectionType } from "@prisma/client";
import {
  createTwinCorrectionMemoryForCaller,
  listTwinCorrectionsForCaller,
  projectTwinCorrectionSafeView,
  revokeTwinCorrectionForCaller,
  type TwinCorrectionSafeView,
} from "./twin-correction-memory.service.js";

const POLICY_PREFIX = "WORK_STYLE_ORG_POLICY:";
const SESSION_PREFIX = "WORK_STYLE_SESSION:";
const SIGNAL_PREFIX = "WORK_STYLE_SIGNAL:";
const CANDIDATE_PREFIX = "WORK_STYLE_CANDIDATE:";
const APPROVED_PORTABLE_PREFIX = "[portable] ";
const APPROVED_ORG_BOUND_PREFIX = "[org-bound] ";

export type PortabilityClass = "portable" | "org_bound" | "org_owned" | "non_learnable";

export interface WorkStyleStatus {
  org_policy_enabled: boolean;
  user_consent_active: boolean;
  active_session: null | {
    session_id: string;
    task_label: string;
    app_context: string;
    started_at: string;
    signal_count: number;
  };
  pending_candidates_count: number;
  approved_preferences_count: number;
  rejected_count: number;
}

export interface WorkStyleCandidateView {
  candidate_id: string;
  category: string;
  plain_language: string;
  evidence_count: number;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  ownership_proposal: "user" | "organization";
  portability_proposal: PortabilityClass;
  correction_type: TwinCorrectionType;
  created_at: string;
}

// ── pure helpers ──────────────────────────────────────────────────

export function encodeSessionSummary(args: {
  sessionId: string;
  taskLabel: string;
  appContext: string;
}): string {
  return `${SESSION_PREFIX}active:${args.sessionId}|task:${args.taskLabel.slice(0, 80)}|app:${args.appContext.slice(0, 40)}|consent:true`;
}

export function parseSessionId(summary: string): string | null {
  if (!summary.startsWith(SESSION_PREFIX)) return null;
  const m = /active:([0-9a-f-]{36})/i.exec(summary);
  return m?.[1] ?? null;
}

export function encodeSignalSummary(args: {
  sessionId: string;
  signalType: string;
  safeLabel: string;
}): string {
  return `${SIGNAL_PREFIX}${args.sessionId}|${args.signalType.slice(0, 40)}|${args.safeLabel.slice(0, 200)}`;
}

export function encodeCandidateSummary(args: {
  sessionId: string;
  category: string;
  plain: string;
  portability: PortabilityClass;
  evidence: number;
}): string {
  return `${CANDIDATE_PREFIX}${args.sessionId}|${args.portability}|${args.category}|e=${args.evidence}|${args.plain.slice(0, 350)}`;
}

export function parseCandidateSummary(summary: string): null | {
  sessionId: string;
  portability: PortabilityClass;
  category: string;
  evidence: number;
  plain: string;
} {
  if (!summary.startsWith(CANDIDATE_PREFIX)) return null;
  const rest = summary.slice(CANDIDATE_PREFIX.length);
  const parts = rest.split("|");
  if (parts.length < 5) return null;
  const [sessionId, portability, category, ePart, ...plainParts] = parts;
  const evidence = Number((ePart ?? "e=1").replace(/^e=/, "")) || 1;
  const port = (portability ?? "org_bound") as PortabilityClass;
  return {
    sessionId: sessionId ?? "",
    portability: ["portable", "org_bound", "org_owned", "non_learnable"].includes(
      port,
    )
      ? port
      : "org_bound",
    category: category ?? "preference",
    evidence,
    plain: plainParts.join("|"),
  };
}

/** Redact confidential markers from free text; never store raw content. */
export function sanitizeLearningLabel(raw: string): string {
  let s = raw.trim().slice(0, 200);
  s = s.replace(
    /\b(password|secret|ssn|api[_-]?key|token|patient|ssn|account\s*#)\b[:\s]*\S+/gi,
    "[redacted]",
  );
  s = s.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]");
  s = s.replace(/\b\d{3}[-.]?\d{2}[-.]?\d{4}\b/g, "[id]");
  return s;
}

/**
 * Pure candidate extraction from bounded session signals.
 * Never copies raw documents — only structural/professional patterns.
 */
export function extractWorkStyleCandidates(args: {
  sessionId: string;
  taskLabel: string;
  signals: Array<{ signalType: string; safeLabel: string }>;
}): Array<{
  category: string;
  plain: string;
  portability: PortabilityClass;
  correctionType: TwinCorrectionType;
  evidence: number;
  confidence: "LOW" | "MEDIUM" | "HIGH";
}> {
  const out: Array<{
    category: string;
    plain: string;
    portability: PortabilityClass;
    correctionType: TwinCorrectionType;
    evidence: number;
    confidence: "LOW" | "MEDIUM" | "HIGH";
  }> = [];
  const labels = args.signals.map((s) => s.safeLabel.toLowerCase());
  const types = args.signals.map((s) => s.signalType.toLowerCase());
  const n = args.signals.length;

  const has = (re: RegExp) => labels.some((l) => re.test(l)) || types.some((t) => re.test(t));

  if (has(/decision|executive|impact/) || /brief|executive/i.test(args.taskLabel)) {
    out.push({
      category: "document_structure",
      plain:
        "For executive briefs, prefer decision and business impact first, then risks, then timeline, with concise paragraphs.",
      portability: "portable",
      correctionType: "TONE_PREFERENCE",
      evidence: Math.max(1, n),
      confidence: n >= 3 ? "HIGH" : "MEDIUM",
    });
  }
  if (has(/calendar|follow-?up|schedule/)) {
    out.push({
      category: "tool_choice",
      plain:
        "Prefer calendar follow-ups that reference the source document rather than free-floating reminders.",
      portability: "org_bound",
      correctionType: "PREFERENCE",
      evidence: Math.max(1, labels.filter((l) => /calendar|follow/.test(l)).length),
      confidence: "MEDIUM",
    });
  }
  if (has(/review|before send|external|draft/)) {
    out.push({
      category: "review_checkpoint",
      plain:
        "Review external messages before sending; draft first, then send after a human checkpoint.",
      portability: "portable",
      correctionType: "APPROVAL_PREFERENCE",
      evidence: Math.max(1, labels.filter((l) => /review|send|draft|external/.test(l)).length),
      confidence: "HIGH",
    });
  }
  if (has(/google docs|docs|pdf/)) {
    out.push({
      category: "tool_choice",
      plain:
        "Use Google Docs for collaborative planning and PDF for final delivery when sharing externally.",
      portability: "org_bound",
      correctionType: "PREFERENCE",
      evidence: 1,
      confidence: "MEDIUM",
    });
  }
  if (has(/citation|source|evidence|link/)) {
    out.push({
      category: "writing_style",
      plain:
        "Include source links or citations in brief sections that make claims or recommendations.",
      portability: "portable",
      correctionType: "TONE_PREFERENCE",
      evidence: 1,
      confidence: "MEDIUM",
    });
  }

  // Always offer a sensitivity boundary candidate when any session runs.
  out.push({
    category: "sensitivity_boundary",
    plain:
      "Do not learn or store employer confidential records, raw messages, or credentials from work-style sessions.",
    portability: "portable",
    correctionType: "SENSITIVITY_BOUNDARY",
    evidence: n,
    confidence: "HIGH",
  });

  // Dedup by plain text
  const seen = new Set<string>();
  return out.filter((c) => {
    if (seen.has(c.plain)) return false;
    seen.add(c.plain);
    return true;
  });
}

// ── service operations ────────────────────────────────────────────

export async function getOrgWorkStylePolicyEnabled(
  orgEntityId: string,
): Promise<boolean> {
  const row = await prisma.twinCorrectionMemory.findFirst({
    where: {
      org_entity_id: orgEntityId,
      scope_type: "ORG",
      correction_type: "APPROVAL_PREFERENCE",
      state: "ACTIVE",
      safe_summary: { startsWith: `${POLICY_PREFIX}enabled` },
    },
    select: { correction_id: true },
  });
  return row !== null;
}

export async function setOrgWorkStylePolicy(args: {
  orgEntityId: string;
  adminEntityId: string;
  enabled: boolean;
}): Promise<{ ok: true; enabled: boolean }> {
  // Revoke prior policy rows
  await prisma.twinCorrectionMemory.updateMany({
    where: {
      org_entity_id: args.orgEntityId,
      scope_type: "ORG",
      correction_type: "APPROVAL_PREFERENCE",
      state: "ACTIVE",
      safe_summary: { startsWith: POLICY_PREFIX },
    },
    data: { state: "REVOKED", revoked_at: new Date() },
  });
  if (args.enabled) {
    await prisma.twinCorrectionMemory.create({
      data: {
        org_entity_id: args.orgEntityId,
        owner_entity_id: args.adminEntityId,
        created_by_entity_id: args.adminEntityId,
        scope_type: "ORG",
        correction_type: "APPROVAL_PREFERENCE",
        state: "ACTIVE",
        sensitivity_class: "MODERATE",
        retention_class: "LONG_RETENTION",
        safe_summary: `${POLICY_PREFIX}enabled — professional work-style learning permitted with user consent and review.`,
      },
    });
  }
  await writeAuditEvent({
    event_type: "ADMIN_ACTION",
    outcome: "SUCCESS",
    actor_entity_id: args.adminEntityId,
    target_entity_id: args.orgEntityId,
    details: {
      action: "WORK_STYLE_ORG_POLICY_SET",
      enabled: args.enabled,
    },
  });
  return { ok: true, enabled: args.enabled };
}

export async function getWorkStyleStatus(args: {
  orgEntityId: string;
  callerEntityId: string;
}): Promise<WorkStyleStatus> {
  const org_policy_enabled = await getOrgWorkStylePolicyEnabled(args.orgEntityId);
  const sessions = await prisma.twinCorrectionMemory.findMany({
    where: {
      owner_entity_id: args.callerEntityId,
      org_entity_id: args.orgEntityId,
      state: "ACTIVE",
      retention_class: "EPHEMERAL",
      safe_summary: { startsWith: SESSION_PREFIX },
    },
    orderBy: { created_at: "desc" },
    take: 1,
  });
  const sessionRow = sessions[0] ?? null;
  const sessionId = sessionRow ? parseSessionId(sessionRow.safe_summary) : null;
  let signal_count = 0;
  if (sessionId) {
    signal_count = await prisma.twinCorrectionMemory.count({
      where: {
        owner_entity_id: args.callerEntityId,
        state: "ACTIVE",
        safe_summary: { startsWith: `${SIGNAL_PREFIX}${sessionId}` },
      },
    });
  }
  const pending = await prisma.twinCorrectionMemory.count({
    where: {
      owner_entity_id: args.callerEntityId,
      org_entity_id: args.orgEntityId,
      state: "ACTIVE",
      retention_class: "EPHEMERAL",
      safe_summary: { startsWith: CANDIDATE_PREFIX },
    },
  });
  const approved = await prisma.twinCorrectionMemory.count({
    where: {
      owner_entity_id: args.callerEntityId,
      org_entity_id: args.orgEntityId,
      state: "ACTIVE",
      retention_class: { in: ["STANDARD", "LONG_RETENTION", "PERMANENT_UNTIL_REVOKED"] },
      correction_type: {
        in: [
          "PREFERENCE",
          "TONE_PREFERENCE",
          "PROJECT_PREFERENCE",
          "APPROVAL_PREFERENCE",
          "SENSITIVITY_BOUNDARY",
          "ASK_BEFORE_ACTING",
        ],
      },
      NOT: { safe_summary: { startsWith: POLICY_PREFIX } },
      AND: [
        { NOT: { safe_summary: { startsWith: SESSION_PREFIX } } },
        { NOT: { safe_summary: { startsWith: SIGNAL_PREFIX } } },
        { NOT: { safe_summary: { startsWith: CANDIDATE_PREFIX } } },
      ],
    },
  });
  const rejected = await prisma.twinCorrectionMemory.count({
    where: {
      owner_entity_id: args.callerEntityId,
      state: "REVOKED",
      safe_summary: { startsWith: CANDIDATE_PREFIX },
    },
  });

  let active_session: WorkStyleStatus["active_session"] = null;
  if (sessionRow && sessionId) {
    const task =
      /\|task:([^|]+)/.exec(sessionRow.safe_summary)?.[1]?.trim() ?? "task";
    const app =
      /\|app:([^|]+)/.exec(sessionRow.safe_summary)?.[1]?.trim() ?? "work";
    active_session = {
      session_id: sessionId,
      task_label: task,
      app_context: app,
      started_at: sessionRow.created_at.toISOString(),
      signal_count,
    };
  }

  return {
    org_policy_enabled,
    user_consent_active: active_session !== null,
    active_session,
    pending_candidates_count: pending,
    approved_preferences_count: approved,
    rejected_count: rejected,
  };
}

export async function startWorkStyleSession(args: {
  orgEntityId: string;
  callerEntityId: string;
  consent: boolean;
  taskLabel: string;
  appContext: string;
}): Promise<
  | { ok: true; session_id: string }
  | {
      ok: false;
      code:
        | "ORG_POLICY_DISABLED"
        | "CONSENT_REQUIRED"
        | "SESSION_ALREADY_ACTIVE";
    }
> {
  if (!args.consent) return { ok: false, code: "CONSENT_REQUIRED" };
  const enabled = await getOrgWorkStylePolicyEnabled(args.orgEntityId);
  if (!enabled) return { ok: false, code: "ORG_POLICY_DISABLED" };
  const status = await getWorkStyleStatus({
    orgEntityId: args.orgEntityId,
    callerEntityId: args.callerEntityId,
  });
  if (status.active_session) return { ok: false, code: "SESSION_ALREADY_ACTIVE" };

  const sessionId = randomUUID();
  const summary = encodeSessionSummary({
    sessionId,
    taskLabel: sanitizeLearningLabel(args.taskLabel || "Work task"),
    appContext: sanitizeLearningLabel(args.appContext || "Otzar"),
  });
  await prisma.twinCorrectionMemory.create({
    data: {
      org_entity_id: args.orgEntityId,
      owner_entity_id: args.callerEntityId,
      created_by_entity_id: args.callerEntityId,
      scope_type: "PERSONAL",
      correction_type: "PREFERENCE",
      state: "ACTIVE",
      sensitivity_class: "MODERATE",
      retention_class: "EPHEMERAL",
      safe_summary: summary.slice(0, 500),
    },
  });
  await writeAuditEvent({
    event_type: "ADMIN_ACTION",
    outcome: "SUCCESS",
    actor_entity_id: args.callerEntityId,
    target_entity_id: args.callerEntityId,
    details: {
      action: "WORK_STYLE_SESSION_STARTED",
      session_id: sessionId,
      task_label: sanitizeLearningLabel(args.taskLabel).slice(0, 80),
    },
  });
  return { ok: true, session_id: sessionId };
}

export async function recordWorkStyleSignal(args: {
  orgEntityId: string;
  callerEntityId: string;
  sessionId: string;
  signalType: string;
  safeLabel: string;
}): Promise<{ ok: true } | { ok: false; code: "NO_ACTIVE_SESSION" | "INVALID_SIGNAL" }> {
  const status = await getWorkStyleStatus({
    orgEntityId: args.orgEntityId,
    callerEntityId: args.callerEntityId,
  });
  if (
    !status.active_session ||
    status.active_session.session_id !== args.sessionId
  ) {
    return { ok: false, code: "NO_ACTIVE_SESSION" };
  }
  const label = sanitizeLearningLabel(args.safeLabel);
  const st = sanitizeLearningLabel(args.signalType || "step");
  if (label.length < 2) return { ok: false, code: "INVALID_SIGNAL" };
  await prisma.twinCorrectionMemory.create({
    data: {
      org_entity_id: args.orgEntityId,
      owner_entity_id: args.callerEntityId,
      created_by_entity_id: args.callerEntityId,
      scope_type: "PERSONAL",
      correction_type: "SUCCESSFUL_PATTERN",
      state: "ACTIVE",
      sensitivity_class: "LOW",
      retention_class: "EPHEMERAL",
      safe_summary: encodeSignalSummary({
        sessionId: args.sessionId,
        signalType: st,
        safeLabel: label,
      }).slice(0, 500),
    },
  });
  return { ok: true };
}

export async function stopWorkStyleSession(args: {
  orgEntityId: string;
  callerEntityId: string;
  sessionId: string;
}): Promise<
  | { ok: true; candidates: WorkStyleCandidateView[] }
  | { ok: false; code: "NO_ACTIVE_SESSION" }
> {
  const status = await getWorkStyleStatus({
    orgEntityId: args.orgEntityId,
    callerEntityId: args.callerEntityId,
  });
  if (
    !status.active_session ||
    status.active_session.session_id !== args.sessionId
  ) {
    return { ok: false, code: "NO_ACTIVE_SESSION" };
  }

  const signalRows = await prisma.twinCorrectionMemory.findMany({
    where: {
      owner_entity_id: args.callerEntityId,
      state: "ACTIVE",
      safe_summary: { startsWith: `${SIGNAL_PREFIX}${args.sessionId}` },
    },
    take: 50,
  });
  const signals = signalRows.map((r) => {
    const rest = r.safe_summary.slice(SIGNAL_PREFIX.length);
    const parts = rest.split("|");
    return {
      signalType: parts[1] ?? "step",
      safeLabel: parts.slice(2).join("|") || "step",
    };
  });
  const task = status.active_session.task_label;
  const extracted = extractWorkStyleCandidates({
    sessionId: args.sessionId,
    taskLabel: task,
    signals,
  });

  const candidates: WorkStyleCandidateView[] = [];
  for (const c of extracted.slice(0, 6)) {
    const summary = encodeCandidateSummary({
      sessionId: args.sessionId,
      category: c.category,
      plain: c.plain,
      portability: c.portability,
      evidence: c.evidence,
    });
    const row = await prisma.twinCorrectionMemory.create({
      data: {
        org_entity_id: args.orgEntityId,
        owner_entity_id: args.callerEntityId,
        created_by_entity_id: args.callerEntityId,
        scope_type: "PERSONAL",
        correction_type: c.correctionType,
        state: "ACTIVE",
        sensitivity_class: "MODERATE",
        retention_class: "EPHEMERAL",
        safe_summary: summary.slice(0, 500),
      },
    });
    candidates.push({
      candidate_id: row.correction_id,
      category: c.category,
      plain_language: c.plain,
      evidence_count: c.evidence,
      confidence: c.confidence,
      ownership_proposal:
        c.portability === "org_owned" ? "organization" : "user",
      portability_proposal: c.portability,
      correction_type: c.correctionType,
      created_at: row.created_at.toISOString(),
    });
  }

  // Close session row
  await prisma.twinCorrectionMemory.updateMany({
    where: {
      owner_entity_id: args.callerEntityId,
      state: "ACTIVE",
      safe_summary: { startsWith: `${SESSION_PREFIX}active:${args.sessionId}` },
    },
    data: { state: "REVOKED", revoked_at: new Date() },
  });
  // Drop raw signals (never keep as durable memory)
  await prisma.twinCorrectionMemory.updateMany({
    where: {
      owner_entity_id: args.callerEntityId,
      safe_summary: { startsWith: `${SIGNAL_PREFIX}${args.sessionId}` },
      state: "ACTIVE",
    },
    data: { state: "REVOKED", revoked_at: new Date() },
  });

  await writeAuditEvent({
    event_type: "ADMIN_ACTION",
    outcome: "SUCCESS",
    actor_entity_id: args.callerEntityId,
    target_entity_id: args.callerEntityId,
    details: {
      action: "WORK_STYLE_SESSION_STOPPED",
      session_id: args.sessionId,
      candidate_count: candidates.length,
      signal_count: signals.length,
    },
  });

  return { ok: true, candidates };
}

export async function listWorkStyleCandidates(args: {
  callerEntityId: string;
  orgEntityId: string;
}): Promise<WorkStyleCandidateView[]> {
  const rows = await prisma.twinCorrectionMemory.findMany({
    where: {
      owner_entity_id: args.callerEntityId,
      org_entity_id: args.orgEntityId,
      state: "ACTIVE",
      retention_class: "EPHEMERAL",
      safe_summary: { startsWith: CANDIDATE_PREFIX },
    },
    orderBy: { created_at: "desc" },
    take: 30,
  });
  return rows.map((r) => {
    const p = parseCandidateSummary(r.safe_summary);
    return {
      candidate_id: r.correction_id,
      category: p?.category ?? "preference",
      plain_language: p?.plain ?? r.safe_summary,
      evidence_count: p?.evidence ?? 1,
      confidence: (p?.evidence ?? 1) >= 3 ? "HIGH" : "MEDIUM",
      ownership_proposal:
        p?.portability === "org_owned" ? "organization" : "user",
      portability_proposal: p?.portability ?? "org_bound",
      correction_type: r.correction_type,
      created_at: r.created_at.toISOString(),
    };
  });
}

export async function approveWorkStyleCandidate(args: {
  callerEntityId: string;
  orgEntityId: string;
  candidateId: string;
  editedPlain?: string;
}): Promise<
  | { ok: true; preference: TwinCorrectionSafeView }
  | { ok: false; code: "NOT_FOUND" | "NOT_CANDIDATE" | "PROJECT_NOT_MEMBER" }
> {
  const row = await prisma.twinCorrectionMemory.findFirst({
    where: {
      correction_id: args.candidateId,
      owner_entity_id: args.callerEntityId,
      org_entity_id: args.orgEntityId,
      state: "ACTIVE",
    },
  });
  if (!row) return { ok: false, code: "NOT_FOUND" };
  const parsed = parseCandidateSummary(row.safe_summary);
  if (!parsed) return { ok: false, code: "NOT_CANDIDATE" };

  const plain = sanitizeLearningLabel(
    args.editedPlain?.trim() || parsed.plain,
  ).slice(0, 400);
  const prefix =
    parsed.portability === "portable"
      ? APPROVED_PORTABLE_PREFIX
      : APPROVED_ORG_BOUND_PREFIX;
  const created = await createTwinCorrectionMemoryForCaller({
    callerEntityId: args.callerEntityId,
    orgEntityId: args.orgEntityId,
    scopeType: parsed.portability === "org_owned" ? "ORG" : "PERSONAL",
    correctionType: row.correction_type,
    safeSummary: `${prefix}${plain}`,
    retentionClass: "STANDARD",
    sensitivityClass: "MODERATE",
  });
  if (!created.ok) return { ok: false, code: created.code };

  await prisma.twinCorrectionMemory.update({
    where: { correction_id: row.correction_id },
    data: { state: "REVOKED", revoked_at: new Date() },
  });

  await writeAuditEvent({
    event_type: "ADMIN_ACTION",
    outcome: "SUCCESS",
    actor_entity_id: args.callerEntityId,
    target_entity_id: args.callerEntityId,
    details: {
      action: "WORK_STYLE_CANDIDATE_APPROVED",
      candidate_id: args.candidateId,
      preference_id: created.correction.correction_id,
      portability: parsed.portability,
    },
  });

  return { ok: true, preference: created.correction };
}

export async function rejectWorkStyleCandidate(args: {
  callerEntityId: string;
  candidateId: string;
}): Promise<{ ok: true } | { ok: false; code: string }> {
  const r = await revokeTwinCorrectionForCaller({
    callerEntityId: args.callerEntityId,
    correctionId: args.candidateId,
  });
  if (!r.ok) return { ok: false, code: r.code };
  await writeAuditEvent({
    event_type: "ADMIN_ACTION",
    outcome: "SUCCESS",
    actor_entity_id: args.callerEntityId,
    target_entity_id: args.callerEntityId,
    details: {
      action: "WORK_STYLE_CANDIDATE_REJECTED",
      candidate_id: args.candidateId,
    },
  });
  return { ok: true };
}

export async function listApprovedWorkStylePreferences(args: {
  callerEntityId: string;
}): Promise<TwinCorrectionSafeView[]> {
  const all = await listTwinCorrectionsForCaller({
    callerEntityId: args.callerEntityId,
    state: "ACTIVE",
    take: 50,
  });
  return all.filter(
    (c) =>
      !c.safe_summary.startsWith(POLICY_PREFIX) &&
      !c.safe_summary.startsWith(SESSION_PREFIX) &&
      !c.safe_summary.startsWith(SIGNAL_PREFIX) &&
      !c.safe_summary.startsWith(CANDIDATE_PREFIX) &&
      [
        "PREFERENCE",
        "TONE_PREFERENCE",
        "PROJECT_PREFERENCE",
        "APPROVAL_PREFERENCE",
        "SENSITIVITY_BOUNDARY",
        "ASK_BEFORE_ACTING",
      ].includes(c.correction_type),
  );
}

/** Safe preference lines for conductSession L3 (never raw content). */
export async function loadWorkStylePreferenceLinesForPriming(
  ownerEntityId: string,
): Promise<string[]> {
  const prefs = await listApprovedWorkStylePreferences({
    callerEntityId: ownerEntityId,
  });
  return prefs.map((p) => {
    const text = p.safe_summary
      .replace(APPROVED_PORTABLE_PREFIX, "")
      .replace(APPROVED_ORG_BOUND_PREFIX, "")
      .trim();
    return `- (${p.correction_type}) ${text}`;
  });
}
