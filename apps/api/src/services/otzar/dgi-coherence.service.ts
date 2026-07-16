// FILE: dgi-coherence.service.ts
// PURPOSE: [DGI-COHERENCE WAVE-1] Collaborative Domain General Intelligence
//          coherence for Otzar. Closes the gap between doctrine (ADR-0052) and
//          runtime: Twin selection must never silently blend multiple
//          human–Twin relationships; the Twin system prompt must receive a
//          SAFE, bounded organizational-intelligence strip (open obligations +
//          open truth conflicts + active personal corrections + active
//          authority grants) without raw private content or cross-user data.
//
//          This is NOT a second autonomy system and NOT auto-execution.
//          It is governed context assembly so the Twin reasons from:
//            private personal memory (existing L1–L8) +
//            structured organizational work state (this strip) +
//            explicit rights (authority grant counts).
//
// PRIVACY:
//   - Capacity + safe titles only; no transcripts, no raw claims, no secrets.
//   - Org-scoped conflict counts only (review surface already org-scoped).
//   - Personal obligations / corrections scoped to (org, subject, twin).
//
// CONNECTS TO: twin-resolution.ts, otzar-obligations, otzar-org-truth,
//   twin-correction-memory, twin-authority-grant, otzar.service conductSession.

import { prisma } from "@niov/database";
import {
  listConflictSetsForOrg,
  listObligations,
  type ObligationScope,
  type SafeObligation,
} from "@niov/database";
import type { ResolvedTwin } from "./twin-resolution.js";

/** Failure when more than one eligible personal Twin exists. */
export const TWIN_AMBIGUOUS_CODE = "TWIN_AMBIGUOUS" as const;

export interface TwinSelectionOk {
  ok: true;
  twin: ResolvedTwin["twin"];
  eligible_count: 1;
}

export interface TwinSelectionFail {
  ok: false;
  code: "TWIN_NOT_FOUND" | typeof TWIN_AMBIGUOUS_CODE;
  message: string;
  eligible_count: number;
}

/**
 * Fail-closed Twin selection for product surfaces.
 * - 0 eligible → TWIN_NOT_FOUND
 * - 1 eligible → proceed
 * - >1 eligible → TWIN_AMBIGUOUS (never silently pick oldest for DGI coherence)
 */
export function selectPrimaryTwinStrict(
  resolved: ResolvedTwin | null,
): TwinSelectionOk | TwinSelectionFail {
  if (resolved === null) {
    return {
      ok: false,
      code: "TWIN_NOT_FOUND",
      message: "Caller has no digital twin",
      eligible_count: 0,
    };
  }
  if (resolved.eligible_count > 1) {
    return {
      ok: false,
      code: TWIN_AMBIGUOUS_CODE,
      message:
        "Multiple eligible AI Teammates are linked to this account. Resolve to a single active Twin before continuing — Otzar will not blend Twin relationships.",
      eligible_count: resolved.eligible_count,
    };
  }
  return {
    ok: true,
    twin: resolved.twin,
    eligible_count: 1,
  };
}

export interface DgiCoherenceSnapshot {
  open_obligations_count: number;
  open_obligation_titles: string[];
  open_org_truth_conflicts_count: number;
  active_personal_corrections_count: number;
  active_twin_authority_grants_count: number;
  /** Bounded system-prompt block; empty when nothing material. */
  system_block: string;
}

const TITLE_CAP = 5;
const TITLE_LEN = 120;

function safeTitle(raw: string | null | undefined): string {
  if (typeof raw !== "string" || raw.trim().length === 0) return "Untitled work";
  const t = raw.replace(/\s+/g, " ").trim();
  return t.length > TITLE_LEN ? `${t.slice(0, TITLE_LEN - 1)}…` : t;
}

/**
 * Build a leak-safe DGI coherence snapshot for the caller's Twin context.
 * Failures degrade to empty counts (never throw into conductSession).
 */
export async function buildDgiCoherenceSnapshot(args: {
  orgEntityId: string | null;
  subjectEntityId: string;
  twinEntityId: string;
}): Promise<DgiCoherenceSnapshot> {
  const empty: DgiCoherenceSnapshot = {
    open_obligations_count: 0,
    open_obligation_titles: [],
    open_org_truth_conflicts_count: 0,
    active_personal_corrections_count: 0,
    active_twin_authority_grants_count: 0,
    system_block: "",
  };

  try {
    const org = args.orgEntityId;
    const now = new Date();

    const [obligations, conflicts, corrections, grants] = await Promise.all([
      org === null
        ? Promise.resolve([] as SafeObligation[])
        : listObligations(
            {
              org_entity_id: org,
              subject_entity_id: args.subjectEntityId,
              twin_entity_id: args.twinEntityId,
            } satisfies ObligationScope,
            {
              open_only: true,
              limit: 20,
            },
          ).catch(() => [] as SafeObligation[]),
      org === null
        ? Promise.resolve([] as Array<{ conflict_set_id: string }>)
        : listConflictSetsForOrg(org, ["OPEN", "UNDER_REVIEW"]).catch(() => []),
      prisma.twinCorrectionMemory
        .count({
          where: {
            owner_entity_id: args.subjectEntityId,
            state: "ACTIVE",
            ...(org !== null ? { org_entity_id: org } : {}),
          },
        })
        .catch(() => 0),
      prisma.twinAuthorityGrant
        .count({
          where: {
            grantee_entity_id: args.twinEntityId,
            grantor_entity_id: args.subjectEntityId,
            state: "ACTIVE",
            OR: [{ expires_at: null }, { expires_at: { gt: now } }],
            ...(org !== null ? { org_entity_id: org } : {}),
          },
        })
        .catch(() => 0),
    ]);

    const open_obligation_titles = obligations
      .slice(0, TITLE_CAP)
      .map((o) => safeTitle(o.title));

    const snap: DgiCoherenceSnapshot = {
      open_obligations_count: obligations.length,
      open_obligation_titles,
      open_org_truth_conflicts_count: conflicts.length,
      active_personal_corrections_count: corrections,
      active_twin_authority_grants_count: grants,
      system_block: "",
    };
    snap.system_block = renderDgiSystemBlock(snap);
    return snap;
  } catch {
    return empty;
  }
}

/** Pure renderer for the system-prompt strip (unit-testable). */
export function renderDgiSystemBlock(s: DgiCoherenceSnapshot): string {
  const lines: string[] = [
    "[DGI COHERENCE — GOVERNED ORGANIZATIONAL INTELLIGENCE]",
    "You are this person's AI Teammate. You may only act within their authority and organization policy.",
    "Private personal memory stays private. Organizational truth is only what has been promoted through governed review — never invent org-wide facts from chat alone.",
  ];

  if (s.open_obligations_count > 0) {
    lines.push(
      `Open obligations for this human–Twin relationship: ${s.open_obligations_count}.`,
    );
    if (s.open_obligation_titles.length > 0) {
      lines.push(
        `Recent open work: ${s.open_obligation_titles.map((t) => `"${t}"`).join("; ")}.`,
      );
    }
  } else {
    lines.push("Open obligations for this relationship: none recorded.");
  }

  if (s.open_org_truth_conflicts_count > 0) {
    lines.push(
      `Organizational truth conflicts awaiting authorized review: ${s.open_org_truth_conflicts_count}. Do not invent a winner; surface the need for review when relevant.`,
    );
  } else {
    lines.push("Organizational truth conflicts open for review: none.");
  }

  lines.push(
    `Active personal work-style corrections (owner-scoped): ${s.active_personal_corrections_count}.`,
  );
  lines.push(
    `Active Twin authority grants from this principal: ${s.active_twin_authority_grants_count}. Material actions still require the Action approval rails unless a grant and policy explicitly allow them.`,
  );
  lines.push(
    "Prefer structured obligations, corrections, and promoted organizational answers over free-form recollection when they exist.",
  );
  lines.push("[END DGI COHERENCE]");
  return lines.join("\n");
}
