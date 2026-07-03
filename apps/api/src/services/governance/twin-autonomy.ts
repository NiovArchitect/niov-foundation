// FILE: twin-autonomy.ts
// PURPOSE: [GAP-G SLICE-1] The ONE canonical autonomy ranking + ceiling cap
//          for template-recommended twin autonomy at provisioning.
//          Role templates RECOMMEND; org policy CAPS; admin edits stay
//          explicit; runtime enforcement (policy-evaluator) wins; the UI
//          tells the truth. Fail-closed everywhere: any unknown/invalid
//          value normalizes DOWN to APPROVAL_REQUIRED — an invalid ceiling
//          or template default can never overgrant.
// CONNECTS TO: twin.service.ts STEP 4 (provisioning wire),
//          OrgSettings.twin_autonomy_ceiling, AgentTemplate.autonomy_default,
//          tests/unit/twin-autonomy.test.ts.

export const TWIN_AUTONOMY_LEVELS = [
  "OBSERVE_ONLY",
  "APPROVAL_REQUIRED",
  "EXECUTIVE_OVERRIDE",
] as const;

export type TwinAutonomyLevel = (typeof TWIN_AUTONOMY_LEVELS)[number];

const RANK: Record<TwinAutonomyLevel, number> = {
  OBSERVE_ONLY: 0,
  APPROVAL_REQUIRED: 1,
  EXECUTIVE_OVERRIDE: 2,
};

// WHAT: Normalize an untrusted value to a valid autonomy level.
// WHY: autonomy_level / autonomy_default / twin_autonomy_ceiling are String
//      columns — a typo'd or legacy value must land on the SAFE default,
//      never silently grant more.
export function normalizeTwinAutonomy(
  value: unknown,
  fallback: TwinAutonomyLevel = "APPROVAL_REQUIRED",
): TwinAutonomyLevel {
  return typeof value === "string" &&
    (TWIN_AUTONOMY_LEVELS as readonly string[]).includes(value)
    ? (value as TwinAutonomyLevel)
    : fallback;
}

export interface AppliedTwinAutonomy {
  /** What the twin actually gets: min(recommended, ceiling). */
  applied: TwinAutonomyLevel;
  /** What the role template recommended (normalized), or null when the twin
   *  has no template — a missing recommendation is an honest state. */
  recommended: TwinAutonomyLevel | null;
  /** The org ceiling used (normalized; invalid/missing → APPROVAL_REQUIRED). */
  ceiling: TwinAutonomyLevel;
  /** True when the ceiling reduced the recommendation. */
  capped: boolean;
}

// WHAT: min(templateDefault, orgCeiling) on the ordered autonomy scale.
// INPUT: raw (untrusted) template default + raw org ceiling.
// OUTPUT: the applied level + full provenance.
// WHY: templates may recommend EXECUTIVE_OVERRIDE (3 of 13 seeds do);
//      the org ceiling — default APPROVAL_REQUIRED — decides what is
//      actually allowed. No template can silently mint authority.
export function applyTwinAutonomyCeiling(
  templateDefault: unknown,
  orgCeiling: unknown,
): AppliedTwinAutonomy {
  const ceiling = normalizeTwinAutonomy(orgCeiling, "APPROVAL_REQUIRED");
  const hasRecommendation =
    typeof templateDefault === "string" &&
    (TWIN_AUTONOMY_LEVELS as readonly string[]).includes(templateDefault);
  const recommended = hasRecommendation
    ? (templateDefault as TwinAutonomyLevel)
    : null;
  const effective = recommended ?? "APPROVAL_REQUIRED";
  const applied = RANK[effective] <= RANK[ceiling] ? effective : ceiling;
  return {
    applied,
    recommended,
    ceiling,
    capped: recommended !== null && RANK[recommended] > RANK[applied],
  };
}
