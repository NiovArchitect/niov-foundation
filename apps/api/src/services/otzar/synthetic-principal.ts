// FILE: synthetic-principal.ts
// PURPOSE: Detect RC2 / pressure / S250 / load-test principals so
//          org_roster, team-work, and LLM identity projections never
//          treat them as real coworkers. Pure filter — does NOT delete
//          rows (RULE 10). Frontend CT has a parallel display filter.
// CONNECTS TO: identity-context.ts, team-work-summary.service.ts,
//          tests/unit/synthetic-principal.test.ts.

/**
 * WHAT: True when email/display looks like a synthetic RC2 / pressure /
 *       load principal rather than a human coworker.
 * INPUT: optional email + display_name
 * OUTPUT: boolean
 * WHY: Founder live People/Talk surfaces showed rc2-admin-* as teammates.
 */
export function isSyntheticPrincipal(input: {
  email?: string | null;
  display_name?: string | null;
}): boolean {
  const email = (input.email ?? "").trim().toLowerCase();
  const name = (input.display_name ?? "").trim().toLowerCase();
  const local = email.includes("@") ? (email.split("@")[0] ?? "") : email;
  const hay = `${email} ${name} ${local}`;

  if (email.length === 0 && name.length === 0) return false;

  if (/\brc2[-_]?admin\b/.test(hay)) return true;
  if (/\brc2[-_]/.test(local) || local.startsWith("rc2")) return true;
  if (/\+rc2[-_]/.test(email) || /\+s250/.test(email)) return true;
  if (
    /^(s25|s250|s2500|synthetic|load[-_]?test|pressure[-_]|harness[-_]|r03-s250)/i.test(
      local,
    )
  ) {
    return true;
  }
  if (/\b(synthetic|load-?test|pressure harness)\b/.test(name)) return true;
  if (/@(example\.com|test\.local|localhost)$/.test(email)) return true;

  return false;
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
