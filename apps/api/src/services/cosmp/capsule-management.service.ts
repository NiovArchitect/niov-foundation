// FILE: capsule-management.service.ts
// PURPOSE: Phase 1229 — COSMP capsule management additions on top
//          of the existing COSMP substrate (read.service /
//          write.service / share.service / negotiate.service).
//          Adds: list (paginated) / revoke (soft-delete via
//          deleted_at) / audit summary (wallet-scoped) / DMW
//          revocation check.
//
//          The existing /api/v1/cosmp/* routes (negotiate /
//          create / share / read metadata + content / similarity)
//          remain UNCHANGED per RULE 1. This service adds new
//          *ForCaller exports + new routes at
//          /api/v1/cosmp/capsules/*.
//
// PRIVACY (RULE 0):
//   - Capsule list scoped to caller's wallet only.
//   - Revoked capsules disappear from list (soft-delete).
//   - Audit summary returns counts + event_type frequencies, never
//     raw row contents.
//
// CONNECTS TO:
//   - apps/api/src/services/dmw/dmw-registry.service.ts
//     (isDMWActive — revocation check)
//   - packages/database (prisma.memoryCapsule + prisma.auditEvent)

import { writeAuditEvent } from "@niov/database";
import { prisma } from "@niov/database";
import type { CapsuleType } from "@prisma/client";
import { isDMWActive } from "../dmw/dmw-registry.service.js";

const LIST_TAKE_CAP = 50;

// ─── safe views ──────────────────────────────────────────────

export interface CapsuleSafeView {
  capsule_id: string;
  wallet_id: string;
  entity_id: string;
  capsule_type: CapsuleType;
  topic_tags: string[];
  payload_summary: string;
  relevance_score: number;
  clearance_required: number;
  access_count: number;
  // Lifecycle flags — derived from deleted_at / expires_at.
  status: "ACTIVE" | "EXPIRED" | "REVOKED" | "ARCHIVED";
  created_at: string;
  last_updated_at: string;
  last_accessed_at: string | null;
  expires_at: string | null;
}

function projectCapsule(row: {
  capsule_id: string;
  wallet_id: string;
  entity_id: string;
  capsule_type: CapsuleType;
  topic_tags: string[];
  payload_summary: string;
  relevance_score: number;
  clearance_required: number;
  access_count: number;
  created_at: Date;
  last_updated_at: Date;
  last_accessed_at: Date | null;
  expires_at: Date | null;
  deleted_at: Date | null;
}): CapsuleSafeView {
  let status: "ACTIVE" | "EXPIRED" | "REVOKED" | "ARCHIVED" = "ACTIVE";
  if (row.deleted_at !== null) status = "REVOKED";
  else if (row.expires_at !== null && row.expires_at.getTime() < Date.now())
    status = "EXPIRED";
  return {
    capsule_id: row.capsule_id,
    wallet_id: row.wallet_id,
    entity_id: row.entity_id,
    capsule_type: row.capsule_type,
    topic_tags: row.topic_tags,
    payload_summary: row.payload_summary,
    relevance_score: row.relevance_score,
    clearance_required: row.clearance_required,
    access_count: row.access_count,
    status,
    created_at: row.created_at.toISOString(),
    last_updated_at: row.last_updated_at.toISOString(),
    last_accessed_at: row.last_accessed_at?.toISOString() ?? null,
    expires_at: row.expires_at?.toISOString() ?? null,
  };
}

// ─── service: list capsules ──────────────────────────────────

export interface ListCapsulesInput {
  callerEntityId: string;
  capsuleType?: CapsuleType;
  includeRevoked?: boolean;
  take?: number;
  skip?: number;
}

export async function listCapsulesForCaller(
  input: ListCapsulesInput,
): Promise<{
  ok: true;
  capsules: CapsuleSafeView[];
  total: number;
} | { ok: false; code: string }> {
  // RULE 0: caller must be an active DMW to list capsules.
  if (!(await isDMWActive(input.callerEntityId))) {
    return { ok: false, code: "DMW_REVOKED" };
  }
  const wallet = await prisma.wallet.findUnique({
    where: { entity_id: input.callerEntityId },
    select: { wallet_id: true },
  });
  if (wallet === null) {
    return { ok: false, code: "NO_WALLET_FOR_CALLER" };
  }
  const take = Math.min(input.take ?? 20, LIST_TAKE_CAP);
  const skip = Math.max(input.skip ?? 0, 0);
  const where: {
    wallet_id: string;
    capsule_type?: CapsuleType;
    deleted_at?: null;
  } = { wallet_id: wallet.wallet_id };
  if (input.capsuleType !== undefined) where.capsule_type = input.capsuleType;
  if (input.includeRevoked !== true) where.deleted_at = null;
  const [rows, total] = await Promise.all([
    prisma.memoryCapsule.findMany({
      where,
      orderBy: { last_updated_at: "desc" },
      take,
      skip,
    }),
    prisma.memoryCapsule.count({ where }),
  ]);
  return {
    ok: true,
    capsules: rows.map((r) => projectCapsule(r)),
    total,
  };
}

// ─── service: revoke a capsule (soft-delete) ────────────────

export interface RevokeCapsuleInput {
  callerEntityId: string;
  capsuleId: string;
  reason?: string;
}

export type RevokeCapsuleResult =
  | { ok: true; capsule_id: string; revoked_at: string }
  | { ok: false; code: string; message?: string };

export async function revokeCapsuleForCaller(
  input: RevokeCapsuleInput,
): Promise<RevokeCapsuleResult> {
  if (!(await isDMWActive(input.callerEntityId))) {
    return { ok: false, code: "DMW_REVOKED" };
  }
  const row = await prisma.memoryCapsule.findUnique({
    where: { capsule_id: input.capsuleId },
  });
  if (row === null) {
    return { ok: false, code: "CAPSULE_NOT_FOUND" };
  }
  if (row.entity_id !== input.callerEntityId) {
    return { ok: false, code: "NOT_OWNER" };
  }
  if (row.deleted_at !== null) {
    return { ok: false, code: "ALREADY_REVOKED" };
  }
  const now = new Date();
  await prisma.memoryCapsule.update({
    where: { capsule_id: row.capsule_id },
    data: { deleted_at: now },
  });
  // Reuse existing CAPSULE_DELETED audit literal — same lifecycle
  // event semantically per RULE 10 (deletion = setting deleted_at;
  // record stays).
  await writeAuditEvent({
    event_type: "CAPSULE_DELETED",
    outcome: "SUCCESS",
    actor_entity_id: input.callerEntityId,
    target_entity_id: input.callerEntityId,
    details: {
      capsule_id: row.capsule_id,
      wallet_id: row.wallet_id,
      capsule_type: row.capsule_type,
      revoke_reason: input.reason ?? null,
    },
  });
  return { ok: true, capsule_id: row.capsule_id, revoked_at: now.toISOString() };
}

// ─── service: COSMP audit summary for caller's wallet ────────

export interface COSMPAuditSummary {
  total_events: number;
  by_event_type: Record<string, number>;
  recent_events: Array<{
    audit_id: string;
    event_type: string;
    outcome: string;
    timestamp: string;
    capsule_id: string | null;
  }>;
}

export async function getCOSMPAuditForCaller(input: {
  callerEntityId: string;
  take?: number;
}): Promise<
  | { ok: true; summary: COSMPAuditSummary }
  | { ok: false; code: string }
> {
  if (!(await isDMWActive(input.callerEntityId))) {
    return { ok: false, code: "DMW_REVOKED" };
  }
  const take = Math.min(input.take ?? 50, 200);
  // Capsule-class events the caller is the actor or target for.
  const rows = await prisma.auditEvent.findMany({
    where: {
      OR: [
        { actor_entity_id: input.callerEntityId },
        { target_entity_id: input.callerEntityId },
      ],
      event_type: {
        in: [
          "CAPSULE_CREATED",
          "CAPSULE_METADATA_READ",
          "CAPSULE_CONTENT_READ",
          "CAPSULE_UPDATED",
          "CAPSULE_DELETED",
          "CAPSULE_MUTATION_ADD",
          "CAPSULE_MUTATION_UPDATE",
          "CAPSULE_MUTATION_MERGE",
          "CAPSULE_MUTATION_NOOP",
          "CAPSULE_SIMILARITY_SEARCH",
          "NEGOTIATE",
          "CORRECTION_PROPAGATED",
        ],
      },
    },
    orderBy: { timestamp: "desc" },
    take,
    select: {
      audit_id: true,
      event_type: true,
      outcome: true,
      timestamp: true,
      details: true,
    },
  });
  const byType: Record<string, number> = {};
  for (const r of rows) byType[r.event_type] = (byType[r.event_type] ?? 0) + 1;
  const recent = rows.slice(0, 20).map((r) => {
    let capsuleId: string | null = null;
    if (
      typeof r.details === "object" &&
      r.details !== null &&
      !Array.isArray(r.details)
    ) {
      const v = (r.details as Record<string, unknown>).capsule_id;
      if (typeof v === "string") capsuleId = v;
    }
    return {
      audit_id: r.audit_id,
      event_type: r.event_type,
      outcome: r.outcome,
      timestamp: r.timestamp.toISOString(),
      capsule_id: capsuleId,
    };
  });
  return {
    ok: true,
    summary: {
      total_events: rows.length,
      by_event_type: byType,
      recent_events: recent,
    },
  };
}

// ─── helper: assert capsule is usable (active DMW + not revoked) ─

/**
 * Soft check used by AI Twin prompt assembly + Memory Capsule
 * sharing flows: if the capsule is REVOKED (deleted_at set) or
 * the owning DMW is revoked, the caller may NOT use this capsule.
 */
export async function isCapsuleUsable(capsuleId: string): Promise<boolean> {
  const row = await prisma.memoryCapsule.findUnique({
    where: { capsule_id: capsuleId },
    select: { entity_id: true, deleted_at: true, expires_at: true },
  });
  if (row === null) return false;
  if (row.deleted_at !== null) return false;
  if (row.expires_at !== null && row.expires_at.getTime() < Date.now())
    return false;
  if (!(await isDMWActive(row.entity_id))) return false;
  return true;
}
