// FILE: dgi-coherence.service.ts
// PURPOSE: [DGI-COHERENCE WAVE-1 + WAVE-2] Collaborative Domain General
//          Intelligence coherence for Otzar — the Work OS substrate that
//          keeps private personal memory private while assembling a SAFE,
//          bounded organizational-intelligence strip for the Twin and a
//          product-facing coherence snapshot for Control Tower.
//
//          WAVE-1: Twin fail-closed selection + system-prompt strip
//          (obligations, org-truth conflicts, corrections, authority grants).
//
//          WAVE-2: Collaborative coherence surface:
//            - open incoming handoffs (multi-party work transfer)
//            - twin pairing status (OK | NOT_FOUND | AMBIGUOUS)
//            - closed-vocab coherence_status for glanceable UX
//            - single GET /otzar/dgi-coherence product projection
//
//          This is NOT a second autonomy system and NOT auto-execution.
//          It is governed context assembly so the Twin + human surface share:
//            private personal memory (existing L1–L8) +
//            structured organizational work state (this strip) +
//            explicit rights (authority grant counts) +
//            multi-party handoff pressure (incoming open transfers).
//
// PRIVACY:
//   - Capacity + safe titles only; no transcripts, no raw claims, no secrets.
//   - Org-scoped conflict counts only (review surface already org-scoped).
//   - Personal obligations / corrections scoped to (org, subject, twin).
//   - Handoffs multi-party scoped to caller as a party.
//
// CONNECTS TO: twin-resolution.ts, otzar-obligations, otzar-org-truth,
//   otzar-handoffs, twin-correction-memory, twin-authority-grant,
//   otzar.service conductSession + getDgiCoherence, CT AmbientWorkSurface.

import { prisma } from "@niov/database";
import {
  listConflictSetsForOrg,
  listObligations,
  listHandoffs,
  OPEN_HANDOFF_STATES,
  type ObligationScope,
  type SafeObligation,
  type SafeHandoff,
  type HandoffState,
} from "@niov/database";
import type { ResolvedTwin } from "./twin-resolution.js";

/** Failure when more than one eligible personal Twin exists. */
export const TWIN_AMBIGUOUS_CODE = "TWIN_AMBIGUOUS" as const;

export type TwinPairingStatus = "OK" | "TWIN_NOT_FOUND" | "TWIN_AMBIGUOUS";

/**
 * Closed-vocab coherence posture for product surfaces.
 * - HEALTHY: paired Twin, no material open work pressure
 * - NEEDS_ATTENTION: open work / conflicts / handoffs / corrections present
 * - BLOCKED: multiple eligible Twins (fail-closed — will not blend)
 * - UNPAIRED: no eligible Twin
 */
export type DgiCoherenceStatus =
  | "HEALTHY"
  | "NEEDS_ATTENTION"
  | "BLOCKED"
  | "UNPAIRED";

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
  /** Open multi-party handoffs where the caller is the incoming party. */
  open_incoming_handoffs_count: number;
  open_incoming_handoff_titles: string[];
  twin_pairing_status: TwinPairingStatus;
  twin_entity_id: string | null;
  eligible_twin_count: number;
  coherence_status: DgiCoherenceStatus;
  /**
   * Count of material attention items (obligations + conflicts + incoming
   * handoffs). Corrections are preference memory — counted separately, not
   * as "needs you now" pressure unless the product elevates them.
   */
  attention_count: number;
  /** Bounded system-prompt block; empty when nothing material AND unpaired. */
  system_block: string;
}

const TITLE_CAP = 5;
const TITLE_LEN = 120;

function safeTitle(raw: string | null | undefined): string {
  if (typeof raw !== "string" || raw.trim().length === 0) return "Untitled work";
  const t = raw.replace(/\s+/g, " ").trim();
  return t.length > TITLE_LEN ? `${t.slice(0, TITLE_LEN - 1)}…` : t;
}

/** Pure: map twin selection into pairing status. */
export function twinPairingFromSelection(
  pick: TwinSelectionOk | TwinSelectionFail,
): {
  twin_pairing_status: TwinPairingStatus;
  twin_entity_id: string | null;
  eligible_twin_count: number;
} {
  if (pick.ok) {
    return {
      twin_pairing_status: "OK",
      twin_entity_id: pick.twin.entity_id,
      eligible_twin_count: 1,
    };
  }
  if (pick.code === TWIN_AMBIGUOUS_CODE) {
    return {
      twin_pairing_status: "TWIN_AMBIGUOUS",
      twin_entity_id: null,
      eligible_twin_count: pick.eligible_count,
    };
  }
  return {
    twin_pairing_status: "TWIN_NOT_FOUND",
    twin_entity_id: null,
    eligible_twin_count: 0,
  };
}

/**
 * Pure: derive closed-vocab coherence_status + attention_count.
 * BLOCKED / UNPAIRED dominate over work pressure so the UI never pretends
 * collaborative intelligence is available without a single Twin.
 */
export function deriveCoherenceStatus(args: {
  twin_pairing_status: TwinPairingStatus;
  open_obligations_count: number;
  open_org_truth_conflicts_count: number;
  open_incoming_handoffs_count: number;
}): { coherence_status: DgiCoherenceStatus; attention_count: number } {
  const attention_count =
    args.open_obligations_count +
    args.open_org_truth_conflicts_count +
    args.open_incoming_handoffs_count;

  if (args.twin_pairing_status === "TWIN_AMBIGUOUS") {
    return { coherence_status: "BLOCKED", attention_count };
  }
  if (args.twin_pairing_status === "TWIN_NOT_FOUND") {
    return { coherence_status: "UNPAIRED", attention_count };
  }
  if (attention_count > 0) {
    return { coherence_status: "NEEDS_ATTENTION", attention_count };
  }
  return { coherence_status: "HEALTHY", attention_count: 0 };
}

function emptySnapshot(
  pairing: ReturnType<typeof twinPairingFromSelection>,
): DgiCoherenceSnapshot {
  const derived = deriveCoherenceStatus({
    twin_pairing_status: pairing.twin_pairing_status,
    open_obligations_count: 0,
    open_org_truth_conflicts_count: 0,
    open_incoming_handoffs_count: 0,
  });
  const snap: DgiCoherenceSnapshot = {
    open_obligations_count: 0,
    open_obligation_titles: [],
    open_org_truth_conflicts_count: 0,
    active_personal_corrections_count: 0,
    active_twin_authority_grants_count: 0,
    open_incoming_handoffs_count: 0,
    open_incoming_handoff_titles: [],
    twin_pairing_status: pairing.twin_pairing_status,
    twin_entity_id: pairing.twin_entity_id,
    eligible_twin_count: pairing.eligible_twin_count,
    coherence_status: derived.coherence_status,
    attention_count: derived.attention_count,
    system_block: "",
  };
  snap.system_block = renderDgiSystemBlock(snap);
  return snap;
}

/**
 * Build a leak-safe DGI coherence snapshot for the caller's Twin context.
 * Failures degrade to empty counts (never throw into conductSession).
 *
 * When twinEntityId is null (unpaired / ambiguous), obligation + grant
 * scopes that require a twin degrade safely; org conflicts still load
 * when org is known so the human can still review organizational truth.
 */
export async function buildDgiCoherenceSnapshot(args: {
  orgEntityId: string | null;
  subjectEntityId: string;
  twinEntityId: string | null;
  twin_pairing_status?: TwinPairingStatus;
  eligible_twin_count?: number;
}): Promise<DgiCoherenceSnapshot> {
  const pairing = {
    twin_pairing_status: args.twin_pairing_status ??
      (args.twinEntityId !== null ? "OK" as const : "TWIN_NOT_FOUND" as const),
    twin_entity_id: args.twinEntityId,
    eligible_twin_count:
      args.eligible_twin_count ?? (args.twinEntityId !== null ? 1 : 0),
  };

  try {
    const org = args.orgEntityId;
    const now = new Date();
    const twinId = args.twinEntityId;

    const openHandoffStates = [...OPEN_HANDOFF_STATES] as HandoffState[];

    const [obligations, conflicts, corrections, grants, handoffs] =
      await Promise.all([
        org === null || twinId === null
          ? Promise.resolve([] as SafeObligation[])
          : listObligations(
              {
                org_entity_id: org,
                subject_entity_id: args.subjectEntityId,
                twin_entity_id: twinId,
              } satisfies ObligationScope,
              {
                open_only: true,
                limit: 20,
              },
            ).catch(() => [] as SafeObligation[]),
        org === null
          ? Promise.resolve([] as Array<{ conflict_set_id: string }>)
          : listConflictSetsForOrg(org, ["OPEN", "UNDER_REVIEW"]).catch(
              () => [],
            ),
        prisma.twinCorrectionMemory
          .count({
            where: {
              owner_entity_id: args.subjectEntityId,
              state: "ACTIVE",
              ...(org !== null ? { org_entity_id: org } : {}),
            },
          })
          .catch(() => 0),
        twinId === null
          ? Promise.resolve(0)
          : prisma.twinAuthorityGrant
              .count({
                where: {
                  grantee_entity_id: twinId,
                  grantor_entity_id: args.subjectEntityId,
                  state: "ACTIVE",
                  OR: [{ expires_at: null }, { expires_at: { gt: now } }],
                  ...(org !== null ? { org_entity_id: org } : {}),
                },
              })
              .catch(() => 0),
        org === null
          ? Promise.resolve([] as SafeHandoff[])
          : listHandoffs(
              {
                org_entity_id: org,
                caller_entity_id: args.subjectEntityId,
              },
              {
                role: "incoming",
                states: openHandoffStates,
                limit: 20,
              },
            ).catch(() => [] as SafeHandoff[]),
      ]);

    const open_obligation_titles = obligations
      .slice(0, TITLE_CAP)
      .map((o) => safeTitle(o.title));
    const open_incoming_handoff_titles = handoffs
      .slice(0, TITLE_CAP)
      .map((h) => safeTitle(h.title));

    const derived = deriveCoherenceStatus({
      twin_pairing_status: pairing.twin_pairing_status,
      open_obligations_count: obligations.length,
      open_org_truth_conflicts_count: conflicts.length,
      open_incoming_handoffs_count: handoffs.length,
    });

    const snap: DgiCoherenceSnapshot = {
      open_obligations_count: obligations.length,
      open_obligation_titles,
      open_org_truth_conflicts_count: conflicts.length,
      active_personal_corrections_count: corrections,
      active_twin_authority_grants_count: grants,
      open_incoming_handoffs_count: handoffs.length,
      open_incoming_handoff_titles,
      twin_pairing_status: pairing.twin_pairing_status,
      twin_entity_id: pairing.twin_entity_id,
      eligible_twin_count: pairing.eligible_twin_count,
      coherence_status: derived.coherence_status,
      attention_count: derived.attention_count,
      system_block: "",
    };
    snap.system_block = renderDgiSystemBlock(snap);
    return snap;
  } catch {
    return emptySnapshot(pairing);
  }
}

/** Pure renderer for the system-prompt strip (unit-testable). */
export function renderDgiSystemBlock(s: DgiCoherenceSnapshot): string {
  const lines: string[] = [
    "[DGI COHERENCE — GOVERNED ORGANIZATIONAL INTELLIGENCE]",
    "You are this person's AI Teammate. You may only act within their authority and organization policy.",
    "Private personal memory stays private. Organizational truth is only what has been promoted through governed review — never invent org-wide facts from chat alone.",
  ];

  if (s.twin_pairing_status === "TWIN_AMBIGUOUS") {
    lines.push(
      `Twin pairing BLOCKED: ${s.eligible_twin_count} eligible AI Teammates are linked. Do not proceed with blended context — ask the human to resolve to a single active Twin.`,
    );
  } else if (s.twin_pairing_status === "TWIN_NOT_FOUND") {
    lines.push(
      "Twin pairing UNPAIRED: no eligible AI Teammate is linked. Surface setup before claiming organizational intelligence.",
    );
  } else {
    lines.push("Twin pairing: single active AI Teammate (OK).");
  }

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

  if (s.open_incoming_handoffs_count > 0) {
    lines.push(
      `Open incoming responsibility handoffs: ${s.open_incoming_handoffs_count}. These are multi-party transfers — acknowledge and dispose linked obligations before treating the handoff as complete.`,
    );
    if (s.open_incoming_handoff_titles.length > 0) {
      lines.push(
        `Incoming handoffs: ${s.open_incoming_handoff_titles.map((t) => `"${t}"`).join("; ")}.`,
      );
    }
  } else {
    lines.push("Open incoming handoffs: none.");
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
    `Coherence status: ${s.coherence_status} (attention items: ${s.attention_count}).`,
  );
  lines.push(
    "Prefer structured obligations, handoffs, corrections, and promoted organizational answers over free-form recollection when they exist.",
  );
  lines.push("[END DGI COHERENCE]");
  return lines.join("\n");
}
