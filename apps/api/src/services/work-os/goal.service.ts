// FILE: goal.service.ts
// PURPOSE: Slice D — the GOAL LAYER. Turns the dangling `goal_id` forward-
//          reference into a real objective users and the org can steer by. A goal
//          is a WorkLedgerEntry with ledger_type "GOAL" (same rail as everything
//          else — NO new table, NO second system, like ORG_SEEDING seeds). Work
//          links to a goal via the existing `goal_id` column, and progress is a
//          DETERMINISTIC rollup of the linked work's status — "how much of the
//          work under this objective is done", not a fabricated metric.
// GOVERNANCE: org-scoped (no cross-tenant); personal goals belong to their owner;
//          org goals (owner null) are managed by managers. GOAL rows are their own
//          surface — excluded from My Work / Team Work / the org-query work scopes.
// CONNECTS TO: work-ledger.service.ts (createLedgerEntry, the rail),
//          identity/resolve-entities.ts, work-os-ledger.routes.ts.

import { prisma } from "@niov/database";
import { createLedgerEntry } from "./work-ledger.service.js";
import { resolveEntityNames, nameFrom } from "../identity/resolve-entities.js";

const DONE_STATUSES = new Set(["EXECUTED", "VERIFIED"]);
const BLOCKED_STATUSES = new Set(["BLOCKED", "NEEDS_OWNER", "NEEDS_APPROVAL", "RUNTIME_MISSING"]);
const asObj = (v: unknown): Record<string, unknown> => (typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {});
const asStr = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);

export interface GoalView {
  goal_id: string;
  title: string;
  description: string | null;
  owner_entity_id: string | null;
  owner_name: string | null;
  scope: "personal" | "org";
  status: string;
  target: string | null;
  due_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface GoalProgress {
  goal: GoalView;
  linked_count: number;
  done_count: number;
  blocked_count: number;
  progress_pct: number;
  by_status: Record<string, number>;
}

export type GoalFailure = { ok: false; code: "GOAL_NOT_FOUND" | "NOT_PERMITTED" | "WORK_NOT_FOUND" | "INVALID_REQUEST"; message: string };

function toGoalView(row: {
  ledger_entry_id: string; title: string; summary: string | null; owner_entity_id: string | null;
  status: string; details: unknown; created_at: Date; updated_at: Date;
}, ownerName: string | null): GoalView {
  const d = asObj(row.details);
  return {
    goal_id: row.ledger_entry_id,
    title: row.title,
    description: row.summary,
    owner_entity_id: row.owner_entity_id,
    owner_name: ownerName,
    scope: row.owner_entity_id ? "personal" : "org",
    status: row.status,
    target: asStr(d.target),
    due_at: asStr(d.due_at),
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

/** Create a user or org objective. Personal goal → owned by the caller (or a
 *  named owner); org goal (scope:"org") → org-level, manager-created. */
export async function createGoal(args: {
  org_entity_id: string;
  caller_entity_id: string;
  is_manager: boolean;
  title: string;
  description?: string;
  owner_entity_id?: string;
  scope?: "personal" | "org";
  target?: string;
  due_at?: string;
}): Promise<{ ok: true; goal: GoalView } | GoalFailure> {
  if (typeof args.title !== "string" || args.title.trim().length === 0) {
    return { ok: false, code: "INVALID_REQUEST", message: "title is required" };
  }
  const scope: "personal" | "org" = args.scope === "org" ? "org" : "personal";
  if (scope === "org" && !args.is_manager) {
    return { ok: false, code: "NOT_PERMITTED", message: "Org goals require manager authority." };
  }
  const owner = scope === "org" ? undefined : (args.owner_entity_id ?? args.caller_entity_id);
  const created = await createLedgerEntry({
    org_entity_id: args.org_entity_id,
    ledger_type: "GOAL",
    source_type: "MANUAL",
    ...(owner !== undefined ? { owner_entity_id: owner } : {}),
    requester_entity_id: args.caller_entity_id,
    title: args.title.trim(),
    ...(args.description ? { summary: args.description } : {}),
    status: "GOAL_ACTIVE",
    extraction_source: "MANUAL",
    details: { goal: true, scope, ...(args.target ? { target: args.target } : {}), ...(args.due_at ? { due_at: args.due_at } : {}) },
  });
  if (!created.ok) return { ok: false, code: "INVALID_REQUEST", message: created.message };
  const row = await loadGoalRow(args.org_entity_id, created.entry.ledger_entry_id);
  if (!row) return { ok: false, code: "INVALID_REQUEST", message: "Goal could not be created." };
  const names = await resolveEntityNames([row.owner_entity_id]);
  return { ok: true, goal: toGoalView(row, row.owner_entity_id ? nameFrom(names, row.owner_entity_id) : null) };
}

async function loadGoalRow(orgEntityId: string, goalId: string): Promise<Awaited<ReturnType<typeof prisma.workLedgerEntry.findFirst>> | null> {
  return prisma.workLedgerEntry.findFirst({ where: { ledger_entry_id: goalId, org_entity_id: orgEntityId, ledger_type: "GOAL" } });
}

/** Can this caller see/steer this goal? Owner or requester of a personal goal, or
 *  a manager (for org goals and org-wide oversight). */
function canAccessGoal(row: { owner_entity_id: string | null; requester_entity_id: string | null }, callerId: string, isManager: boolean): boolean {
  if (isManager) return true;
  return row.owner_entity_id === callerId || row.requester_entity_id === callerId;
}

/** Link a work item to a goal (sets goal_id). Both must be in the caller's org;
 *  the caller must own/request the work (or be a manager). No cross-tenant. */
export async function linkWorkToGoal(args: {
  org_entity_id: string; caller_entity_id: string; is_manager: boolean; ledger_entry_id: string; goal_id: string;
}): Promise<{ ok: true; linked: boolean } | GoalFailure> {
  const goal = await loadGoalRow(args.org_entity_id, args.goal_id);
  if (!goal) return { ok: false, code: "GOAL_NOT_FOUND", message: "Goal not found in this organization." };
  if (!canAccessGoal(goal, args.caller_entity_id, args.is_manager)) {
    return { ok: false, code: "NOT_PERMITTED", message: "Not permitted to link work to this goal." };
  }
  const work = await prisma.workLedgerEntry.findFirst({ where: { ledger_entry_id: args.ledger_entry_id, org_entity_id: args.org_entity_id } });
  if (!work || work.ledger_type === "GOAL") return { ok: false, code: "WORK_NOT_FOUND", message: "Work item not found." };
  const owns = work.owner_entity_id === args.caller_entity_id || work.requester_entity_id === args.caller_entity_id;
  if (!owns && !args.is_manager) return { ok: false, code: "NOT_PERMITTED", message: "Not permitted to link this work item." };
  await prisma.workLedgerEntry.update({ where: { ledger_entry_id: args.ledger_entry_id }, data: { goal_id: args.goal_id } });
  return { ok: true, linked: true };
}

/** Unlink a work item from its goal (goal_id → null). */
export async function unlinkWorkFromGoal(args: {
  org_entity_id: string; caller_entity_id: string; is_manager: boolean; ledger_entry_id: string;
}): Promise<{ ok: true; linked: boolean } | GoalFailure> {
  const work = await prisma.workLedgerEntry.findFirst({ where: { ledger_entry_id: args.ledger_entry_id, org_entity_id: args.org_entity_id } });
  if (!work) return { ok: false, code: "WORK_NOT_FOUND", message: "Work item not found." };
  const owns = work.owner_entity_id === args.caller_entity_id || work.requester_entity_id === args.caller_entity_id;
  if (!owns && !args.is_manager) return { ok: false, code: "NOT_PERMITTED", message: "Not permitted." };
  await prisma.workLedgerEntry.update({ where: { ledger_entry_id: args.ledger_entry_id }, data: { goal_id: null } });
  return { ok: true, linked: false };
}

/** Deterministic progress: of the work linked to this goal, how much is done. */
export async function getGoalProgress(args: {
  org_entity_id: string; caller_entity_id: string; is_manager: boolean; goal_id: string;
}): Promise<{ ok: true } & GoalProgress | GoalFailure> {
  const goal = await loadGoalRow(args.org_entity_id, args.goal_id);
  if (!goal) return { ok: false, code: "GOAL_NOT_FOUND", message: "Goal not found in this organization." };
  if (!canAccessGoal(goal, args.caller_entity_id, args.is_manager)) {
    return { ok: false, code: "NOT_PERMITTED", message: "Not permitted to view this goal." };
  }
  const linked = await prisma.workLedgerEntry.findMany({
    where: { org_entity_id: args.org_entity_id, goal_id: args.goal_id, ledger_type: { not: "GOAL" } },
    select: { status: true },
  });
  const by_status: Record<string, number> = {};
  let done = 0, blocked = 0;
  for (const w of linked) {
    by_status[w.status] = (by_status[w.status] ?? 0) + 1;
    if (DONE_STATUSES.has(w.status)) done += 1;
    if (BLOCKED_STATUSES.has(w.status)) blocked += 1;
  }
  const total = linked.length;
  const names = await resolveEntityNames([goal.owner_entity_id]);
  return {
    ok: true,
    goal: toGoalView(goal, goal.owner_entity_id ? nameFrom(names, goal.owner_entity_id) : null),
    linked_count: total,
    done_count: done,
    blocked_count: blocked,
    progress_pct: total > 0 ? Math.round((done / total) * 100) : 0,
    by_status,
  };
}

/** List goals in scope. self → the caller's own goals; org → all org goals
 *  (managers only). */
export async function listGoals(args: {
  org_entity_id: string; caller_entity_id: string; is_manager: boolean; scope?: "self" | "org";
}): Promise<{ ok: true; goals: GoalView[] } | GoalFailure> {
  const scope = args.scope === "org" ? "org" : "self";
  if (scope === "org" && !args.is_manager) return { ok: false, code: "NOT_PERMITTED", message: "Org scope requires manager authority." };
  const rows = await prisma.workLedgerEntry.findMany({
    where: {
      org_entity_id: args.org_entity_id,
      ledger_type: "GOAL",
      ...(scope === "self"
        ? { OR: [{ owner_entity_id: args.caller_entity_id }, { requester_entity_id: args.caller_entity_id }] }
        : {}),
    },
    orderBy: { created_at: "desc" },
    take: 100,
  });
  const names = await resolveEntityNames(rows.map((r) => r.owner_entity_id));
  return { ok: true, goals: rows.map((r) => toGoalView(r, r.owner_entity_id ? nameFrom(names, r.owner_entity_id) : null)) };
}
