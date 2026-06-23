// FILE: demo-mode.ts
// PURPOSE: [OTZAR-V1-LIVE-1A-FOUNDATION] One canonical gate deciding whether
//   scripted / fixture demo intake modes may run. Demo intake — the
//   DEMO_SCRIPTED force_mode, the canonical-fixture auto-detection in
//   comms-extract, and the DEMO_FIXTURE OCR provider — returns CANNED output
//   instead of real LLM extraction. In staging / production that would silently
//   mask whether the real intelligence path actually works, so it is refused
//   there. Demo intake is permitted only in test / local-dev, or when an operator
//   explicitly opts in via ALLOW_DEMO_MODE=true (e.g. a sales demo on a staging
//   box).
// CONNECTS TO: comms-extract.service.ts (auto-detect gate + never-fake guard),
//   routes/otzar.routes.ts + routes/otzar-observe.routes.ts (explicit-request
//   422), tests/unit/demo-mode.test.ts.

/** Stable response code returned when a caller explicitly asks for a demo intake
 *  mode (force_mode=DEMO_SCRIPTED / provider=DEMO_FIXTURE) in an environment
 *  where demo mode is disabled. */
export const DEMO_MODE_NOT_ALLOWED = "DEMO_MODE_NOT_ALLOWED";

// WHAT: Whether scripted / fixture demo intake modes may run in this environment.
// INPUT: process.env (overridable for tests).
// OUTPUT: true when demo intake is permitted; false in staging / production
//         unless ALLOW_DEMO_MODE=true.
// WHY: Production / staging deployments run with NODE_ENV set to something other
//      than "test"/"development" (typically "production"); demo intake is refused
//      there so real intake is never silently replaced by a scripted fixture.
//      An operator can still run a controlled demo on any box by setting
//      ALLOW_DEMO_MODE=true. test + local dev (development / unset) stay
//      demo-safe so the fixture-driven test suite and local demos are unaffected.
//      Mirrors the NODE_ENV convention used by boot-validation.ts.
export function isDemoModeAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.ALLOW_DEMO_MODE === "true") return true;
  const nodeEnv = env.NODE_ENV ?? "";
  return nodeEnv === "test" || nodeEnv === "development" || nodeEnv === "";
}
