// FILE: twin-personal-preferences.ts
// PURPOSE: Phase EDX-5 PR 3 — MyTwinView personal_preferences_summary
//          sidecar per the [FOUNDER-CLARITY — DO NOT TREAT THE
//          REMAINING GAPS AS OPTIONAL] directive. Self-scoped
//          pure-function helper that projects the caller's
//          TwinCorrectionMemory inventory (PR #273 substrate;
//          PR #274 routes) as a capacity-only summary so the
//          everyday employee can see "I've taught my Twin 5
//          preferences, 2 tone rules, 1 sensitivity boundary,
//          most recent yesterday" without leaving MyTwinView.
//
// PRIVACY INVARIANT:
//   - Returns capacity-only signals (counts + a single ISO
//     timestamp).
//   - NEVER returns correction_id / safe_summary / scope_id /
//     source_message_id / source_conversation_id / per-row
//     substance.
//   - Self-scoped to owner_entity_id; never aggregates across
//     entities.
//
// CONNECTS TO:
//   - packages/database (prisma.twinCorrectionMemory.count +
//     prisma.twinCorrectionMemory.findFirst)
//   - apps/api/src/services/otzar/otzar.service.ts (consumed by
//     getMyTwin as an optional sidecar field)

import { prisma } from "@niov/database";

// WHAT: SAFE projection of the caller's TwinCorrectionMemory
//        inventory. Used as a MyTwinView sidecar.
// INPUT: Used as a return type only.
// OUTPUT: None.
// WHY: The 5 counts mirror the directive's MyTwinView spec for the
//      EDX-5 summary block:
//        - active_personal_preferences_count
//        - active_tone_preferences_count
//        - active_project_preferences_count
//        - active_sensitivity_boundaries_count
//        - active_approval_preferences_count
//      `last_correction_at` is the most-recent created_at across
//      ALL active corrections (any type) so the UI can render
//      "your most-recent teaching moment was …" without scanning
//      five separate timelines.
export interface TwinPersonalPreferencesSummary {
  active_personal_preferences_count: number;
  active_tone_preferences_count: number;
  active_project_preferences_count: number;
  active_sensitivity_boundaries_count: number;
  active_approval_preferences_count: number;
  active_terminology_definitions_count: number;
  active_ask_before_acting_count: number;
  last_correction_at: string | null;
}

// WHAT: Compute the caller's personal preferences summary.
// INPUT: callerEntityId — the human owner entity id (NOT the twin
//        AI_AGENT id). TwinCorrectionMemory rows from work-style
//        learning and correction-memory routes are owned by the
//        human session entity; counting against the twin id yields
//        a permanent zero surface and erodes trust.
// OUTPUT: TwinPersonalPreferencesSummary.
// WHY: Six bounded Prisma counts (one per surfaced correction_type
//      filter) + one findFirst for the most recent ACTIVE row. All
//      counts pin owner_entity_id and state=ACTIVE. Failures bubble
//      to the caller (getMyTwin) where the ADR-0068 §6 swallow
//      pattern keeps the sidecar absence non-fatal.
export async function computePersonalPreferencesSummaryForCaller(
  callerEntityId: string,
): Promise<TwinPersonalPreferencesSummary> {
  const baseWhere = {
    owner_entity_id: callerEntityId,
    state: "ACTIVE" as const,
  };
  const [
    active_personal_preferences_count,
    active_tone_preferences_count,
    active_project_preferences_count,
    active_sensitivity_boundaries_count,
    active_approval_preferences_count,
    active_terminology_definitions_count,
    active_ask_before_acting_count,
    mostRecent,
  ] = await Promise.all([
    prisma.twinCorrectionMemory.count({
      where: { ...baseWhere, correction_type: "PREFERENCE" },
    }),
    prisma.twinCorrectionMemory.count({
      where: { ...baseWhere, correction_type: "TONE_PREFERENCE" },
    }),
    prisma.twinCorrectionMemory.count({
      where: { ...baseWhere, correction_type: "PROJECT_PREFERENCE" },
    }),
    prisma.twinCorrectionMemory.count({
      where: { ...baseWhere, correction_type: "SENSITIVITY_BOUNDARY" },
    }),
    prisma.twinCorrectionMemory.count({
      where: { ...baseWhere, correction_type: "APPROVAL_PREFERENCE" },
    }),
    prisma.twinCorrectionMemory.count({
      where: { ...baseWhere, correction_type: "TERMINOLOGY_DEFINITION" },
    }),
    prisma.twinCorrectionMemory.count({
      where: { ...baseWhere, correction_type: "ASK_BEFORE_ACTING" },
    }),
    prisma.twinCorrectionMemory.findFirst({
      where: baseWhere,
      orderBy: { created_at: "desc" },
      select: { created_at: true },
    }),
  ]);

  return {
    active_personal_preferences_count,
    active_tone_preferences_count,
    active_project_preferences_count,
    active_sensitivity_boundaries_count,
    active_approval_preferences_count,
    active_terminology_definitions_count,
    active_ask_before_acting_count,
    last_correction_at:
      mostRecent !== null ? mostRecent.created_at.toISOString() : null,
  };
}
