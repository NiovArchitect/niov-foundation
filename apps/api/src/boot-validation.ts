// FILE: boot-validation.ts
// PURPOSE: Fail-fast environment-variable check that runs at the
//          very top of buildApp. Throws on missing required vars
//          (JWT_SECRET, DATABASE_URL, REDIS_URL); warns (does not
//          throw) on missing OTZAR_ENTITY_ID because Otzar can be
//          deployed without it -- conductSession in 11B will surface
//          the missing-Otzar case at request time with a clearer
//          error than a startup crash would.
// CONNECTS TO: buildApp (called first), tests/unit/boot-validation.test.ts.

// WHAT: Validate that the required environment variables are
//        present.
// INPUT: An optional override of process.env (for tests).
// OUTPUT: Throws on missing required vars; logs a warn on missing
//         OTZAR_ENTITY_ID; returns silently when all good.
// WHY: Production wants the server to fail loudly at boot rather
//      than silently start with a half-configured environment that
//      surfaces as confusing 500s later.
export function validateBootEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): void {
  const missing: string[] = [];
  if (typeof env.JWT_SECRET !== "string" || env.JWT_SECRET.length === 0) {
    missing.push("JWT_SECRET");
  }
  if (typeof env.DATABASE_URL !== "string" || env.DATABASE_URL.length === 0) {
    missing.push("DATABASE_URL");
  }
  if (typeof env.REDIS_URL !== "string" || env.REDIS_URL.length === 0) {
    missing.push("REDIS_URL");
  }
  if (missing.length > 0) {
    throw new Error(
      `Boot validation failed: missing required env vars: ${missing.join(", ")}`,
    );
  }
  if (
    typeof env.OTZAR_ENTITY_ID !== "string" ||
    env.OTZAR_ENTITY_ID.length === 0
  ) {
    // eslint-disable-next-line no-console
    console.warn(
      "[boot-validation] OTZAR_ENTITY_ID not set -- seedOtzarEntity will create a new APPLICATION entity on next boot. Add the printed entity_id to .env.",
    );
  }
}
