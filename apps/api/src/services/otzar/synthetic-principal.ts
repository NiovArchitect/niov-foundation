// FILE: synthetic-principal.ts
// PURPOSE: Detect RC2 / pressure / S250 / load-test principals so
//          org_roster, team-work, and LLM identity projections never
//          treat them as real coworkers. Pure filter — does NOT delete
//          rows (RULE 10). Frontend CT has a parallel display filter.
// CONNECTS TO: identity-context.ts, team-work-summary.service.ts,
//          scripts/soft-isolate-synthetic-memberships.ts,
//          tests/unit/synthetic-principal.test.ts.

/** Classification confidence for soft-isolation decisions. */
export type SyntheticConfidence = "HIGH" | "REVIEW_REQUIRED" | "NOT_SYNTHETIC";

export interface SyntheticClassification {
  confidence: SyntheticConfidence;
  /** Machine-stable reason code (safe to log; no PII). */
  reason: string;
}

/**
 * Demo-team emails that MUST never be classified synthetic for isolation.
 * WHAT: Hard allowlist of legitimate NIOV Labs people principals.
 * WHY: Soft-isolation must not touch real founders/employees.
 */
export const DEMO_TEAM_EMAIL_ALLOWLIST: ReadonlySet<string> = new Set([
  "sadeil@niovlabs.com",
  "david@niovlabs.com",
  "annie@niovlabs.com",
  "william@niovlabs.com",
  "shweta@niovlabs.com",
  "walter@niovlabs.com",
  "vishesh@niovlabs.com",
  "samiksha@niovlabs.com",
]);

/**
 * WHAT: Classify a principal for projection filter + soft-isolation.
 * INPUT: optional email + display_name
 * OUTPUT: confidence + reason (HIGH only auto-isolate-safe)
 * WHY: Founder requires HIGH vs REVIEW_REQUIRED split; never auto-apply
 *      ambiguous human-looking accounts.
 */
export function classifySyntheticPrincipal(input: {
  email?: string | null;
  display_name?: string | null;
}): SyntheticClassification {
  const email = (input.email ?? "").trim().toLowerCase();
  const name = (input.display_name ?? "").trim().toLowerCase();
  const local = email.includes("@") ? (email.split("@")[0] ?? "") : email;
  const hay = `${email} ${name} ${local}`;

  if (email.length === 0 && name.length === 0) {
    return { confidence: "NOT_SYNTHETIC", reason: "empty_identity" };
  }

  if (email && DEMO_TEAM_EMAIL_ALLOWLIST.has(email)) {
    return { confidence: "NOT_SYNTHETIC", reason: "demo_team_allowlist" };
  }

  // HIGH — exact / explicit synthetic patterns only
  if (/\brc2[-_]?admin\b/.test(hay)) {
    return { confidence: "HIGH", reason: "exact_rc2_admin_prefix" };
  }
  if (/\brc2[-_]/.test(local) || local.startsWith("rc2")) {
    return { confidence: "HIGH", reason: "exact_rc2_local_prefix" };
  }
  if (/\+rc2[-_]/.test(email) || /\+s250/.test(email)) {
    return { confidence: "HIGH", reason: "explicit_rc2_or_s250_plus_tag" };
  }
  if (
    /^(s25|s250|s2500|synthetic|load[-_]?test|pressure[-_]|harness[-_]|r03-s250)/i.test(
      local,
    )
  ) {
    return { confidence: "HIGH", reason: "exact_pressure_load_fixture_local" };
  }
  if (/\b(synthetic|load-?test|pressure harness)\b/.test(name)) {
    return { confidence: "HIGH", reason: "explicit_synthetic_display_name" };
  }
  if (/@(example\.com|test\.local|localhost)$/.test(email)) {
    return { confidence: "HIGH", reason: "explicit_harness_email_domain" };
  }

  // REVIEW_REQUIRED — ambiguous cues only (never auto-apply)
  if (/\b(test user|fixture|dummy user|bot harness)\b/.test(name)) {
    return { confidence: "REVIEW_REQUIRED", reason: "ambiguous_test_display_name" };
  }
  if (/\+test@|\+fixture@/i.test(email)) {
    return { confidence: "REVIEW_REQUIRED", reason: "ambiguous_plus_tag" };
  }

  return { confidence: "NOT_SYNTHETIC", reason: "no_synthetic_signal" };
}

/**
 * WHAT: True when email/display looks like a synthetic RC2 / pressure /
 *       load principal rather than a human coworker.
 * INPUT: optional email + display_name
 * OUTPUT: boolean (HIGH confidence only — safe for projection filters)
 * WHY: Founder live People/Talk surfaces showed rc2-admin-* as teammates.
 *      Projection filters use HIGH only so real people are never hidden.
 */
export function isSyntheticPrincipal(input: {
  email?: string | null;
  display_name?: string | null;
}): boolean {
  return classifySyntheticPrincipal(input).confidence === "HIGH";
}

/**
 * WHAT: Filter coworker-facing arrays.
 * INPUT: list of objects with optional email/display_name
 * OUTPUT: filtered array (same type)
 * WHY: Shared by identity roster + team-work capacity views.
 */
export function filterCoworkerPeople<
  T extends { email?: string | null; display_name?: string | null },
>(people: readonly T[]): T[] {
  return people.filter((p) => !isSyntheticPrincipal(p));
}
