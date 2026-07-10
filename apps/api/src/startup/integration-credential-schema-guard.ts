// FILE: apps/api/src/startup/integration-credential-schema-guard.ts
// PURPOSE: [SLICE3-PREREQ] Boot-time production schema-compatibility guard for the
//          six Google account-identity columns introduced by FND `371542f`. The
//          deployed code's default Prisma reads SELECT these columns, so running
//          the code against a database that lacks them breaks EVERY
//          IntegrationCredential read at request time. This guard converts that
//          potentially partial runtime failure into an immediate, explicit
//          startup failure BEFORE the server accepts traffic.
// CONNECTS TO:
//   - apps/api/src/server.ts (startApiServer runs this before build + listen).
//   - CT OTZAR_PILOT_OPS_RUNBOOK.md (the deploy-ordering landmine + remediation).
// WHY: It is NOT a migration mechanism and NOT a bypass — it never writes, never
//      creates columns, never runs `db push`. It only makes an incompatible
//      deployment fail fast and loudly instead of degrading silently.

// The exact additive identity columns the current code requires on
// `integration_credentials` (FND 371542f). Column names are NOT secrets.
export const REQUIRED_IDENTITY_COLUMNS = [
  "external_account_subject",
  "external_account_email",
  "external_account_email_verified",
  "external_account_issuer",
  "external_account_pinned_at",
  "external_account_last_verified_at",
] as const;

export const INTEGRATION_CREDENTIAL_SCHEMA_INCOMPATIBLE =
  "INTEGRATION_CREDENTIAL_SCHEMA_INCOMPATIBLE";

const REMEDIATION =
  "Apply the approved additive IntegrationCredential identity schema before deploying this Foundation SHA.";

// A minimal read-only probe seam so tests can inject a fake without a real DB.
// `prisma` satisfies this shape.
export interface SchemaProbe {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
}

export type SchemaCheckResult =
  | { status: "compatible" }
  | { status: "table_missing" }
  | { status: "columns_missing"; missing: string[] };

// Raised ONLY for a definitively incompatible schema (table or columns missing).
// A DB-unreachable / query failure is NOT this error — see assert…() below.
export class IntegrationCredentialSchemaIncompatibleError extends Error {
  readonly code = INTEGRATION_CREDENTIAL_SCHEMA_INCOMPATIBLE;
  readonly missingColumns: readonly string[];
  readonly tableMissing: boolean;
  constructor(missingColumns: readonly string[], tableMissing: boolean) {
    super(
      `[startup] ${INTEGRATION_CREDENTIAL_SCHEMA_INCOMPATIBLE}: ` +
        `integration_credentials is missing required identity column(s) ` +
        `[${missingColumns.join(", ")}]` +
        (tableMissing ? " (table not found)" : "") +
        `. ${REMEDIATION}`,
    );
    this.name = "IntegrationCredentialSchemaIncompatibleError";
    this.missingColumns = missingColumns;
    this.tableMissing = tableMissing;
  }
}

// Raised when the compatibility probe itself could not run (DB unreachable /
// query failure). Deliberately DISTINCT from the incompatible-schema error so a
// database outage is never misreported as "columns missing". Carries no
// connection string, credentials, or raw driver error text.
export class IntegrationCredentialSchemaProbeUnavailableError extends Error {
  readonly code = "INTEGRATION_CREDENTIAL_SCHEMA_PROBE_UNAVAILABLE";
  constructor() {
    super(
      "[startup] could not verify IntegrationCredential identity schema " +
        "compatibility — the database was unreachable or the catalog query failed.",
    );
    this.name = "IntegrationCredentialSchemaProbeUnavailableError";
  }
}

// WHAT: Read-only classify the live table against the required identity columns.
// INPUT: a SchemaProbe (defaults to the shared prisma client at the call site).
// OUTPUT: compatible | table_missing | columns_missing{missing[]}.
// WHY: A single `information_schema.columns` read distinguishes every case:
//      empty → the table does not exist; non-empty but short → columns missing;
//      all present → compatible. It never touches row data and never writes.
export async function checkIntegrationCredentialIdentitySchema(
  db: SchemaProbe,
): Promise<SchemaCheckResult> {
  // Static, read-only catalog query — no parameters, no row/user data.
  // Scoped to `current_schema()` — the schema the app's OWN unqualified Prisma
  // reads resolve to on this same connection — so a same-named table in a
  // different schema can never produce a false "compatible" result.
  const rows = await db.$queryRawUnsafe<Array<{ column_name: string }>>(
    "SELECT column_name FROM information_schema.columns " +
      "WHERE table_schema = current_schema() " +
      "AND table_name = 'integration_credentials'",
  );
  if (!Array.isArray(rows) || rows.length === 0) {
    // A table always has columns, so an empty catalog result = table absent.
    return { status: "table_missing" };
  }
  const present = new Set(rows.map((r) => r.column_name));
  const missing = REQUIRED_IDENTITY_COLUMNS.filter((c) => !present.has(c));
  if (missing.length > 0) {
    // Deterministic order (matches REQUIRED_IDENTITY_COLUMNS).
    return { status: "columns_missing", missing };
  }
  return { status: "compatible" };
}

// WHAT: Fail-fast assertion for the production startup path.
// INPUT: a SchemaProbe (defaults to `prisma` via the caller).
// OUTPUT: resolves if compatible; throws otherwise.
// WHY: An incompatible schema throws IntegrationCredentialSchemaIncompatibleError
//      (fail closed — no warn-only, no bypass). A probe that cannot run throws
//      IntegrationCredentialSchemaProbeUnavailableError so a DB outage keeps the
//      existing startup/db-readiness semantics rather than being misclassified.
export async function assertIntegrationCredentialIdentitySchemaCompatible(
  db: SchemaProbe,
): Promise<void> {
  let result: SchemaCheckResult;
  try {
    result = await checkIntegrationCredentialIdentitySchema(db);
  } catch {
    // Never surface the raw driver error (it can carry a connection string).
    throw new IntegrationCredentialSchemaProbeUnavailableError();
  }
  if (result.status === "compatible") return;
  const missing =
    result.status === "table_missing"
      ? [...REQUIRED_IDENTITY_COLUMNS]
      : result.missing;
  throw new IntegrationCredentialSchemaIncompatibleError(
    missing,
    result.status === "table_missing",
  );
}
