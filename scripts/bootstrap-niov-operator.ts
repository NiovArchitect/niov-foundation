// FILE: bootstrap-niov-operator.ts
// PURPOSE: Founder-authorized bootstrap of the dedicated NIOV platform
//          operator accounts (TAR can_admin_niov) — the ONE grant that
//          deliberately has no HTTP path (admin-bootstrap runbook §3
//          boundary 1: Foundation refuses to grant can_admin_niov to
//          itself). Replaces the runbook's stale §5.4 manual SQL with
//          the canonical helpers: createEntity (entity + wallet + TAR +
//          audits in one transaction), computeTARHash, writeAudit /
//          writeAuditEvent. Supports exactly two operator identities:
//            niov-operator-1@niovlabs.com  (allowed when census = 0)
//            niov-operator-2@niovlabs.com  (allowed when census = 1)
//          The census is the count of ACTIVE entities holding an ACTIVE
//          TAR with can_admin_niov = true. 2+ → bootstrap refused
//          (verify mode only). The daily Otzar org-admin login
//          (sadeil@) is NEVER a valid target — operator accounts are
//          founder-tier platform credentials, nothing else (runbook §3
//          boundary 5).
//
// SAFETY GATES (all enforced in code, none optional):
//   - environment: refuses NODE_ENV=production or a non-localhost
//     DATABASE_URL unless ALLOW_FOUNDER_BOOTSTRAP=true (set it INLINE
//     for the single command, never persisted — founder-bootstrap.ts
//     precedent);
//   - allowlist: exactly the two operator emails above; anything else
//     refuses before any DB read;
//   - census rule: operator-1 requires census 0, operator-2 requires
//     census 1; 2+ always refuses;
//   - duplicate: an existing entity on the target email refuses (no
//     silent upgrade — recovery goes through the runbook §6 rail);
//   - dry-run by default: writes happen ONLY with --apply AND the
//     exact confirmation phrase in FOUNDER_BOOTSTRAP_CONFIRM;
//   - secrets: the one-time password is printed ONCE to the terminal
//     when generated (or taken from NIOV_OPERATOR_PASSWORD); it is
//     never written to disk, never placed in audit details, and the
//     bcrypt hash never leaves the entities row.
//
// USAGE (see admin-bootstrap runbook §5A for the operational script):
//   verify (read-only census):
//     npx tsx scripts/bootstrap-niov-operator.ts --verify
//   dry-run:
//     npx tsx scripts/bootstrap-niov-operator.ts --email niov-operator-1@niovlabs.com
//   apply:
//     ALLOW_FOUNDER_BOOTSTRAP=true \
//     FOUNDER_BOOTSTRAP_CONFIRM="I AUTHORIZE NIOV OPERATOR BOOTSTRAP" \
//     npx tsx scripts/bootstrap-niov-operator.ts --email niov-operator-1@niovlabs.com --apply
//
// CONNECTS TO: docs/operations/admin-bootstrap-runbook.md (§5A replaces
//          the stale §5.4 SQL); scripts/founder-bootstrap.ts (the
//          environment-gate + one-time-password precedent — that script
//          grants can_admin_org for the org tier and deliberately NOT
//          can_admin_niov); packages/database createEntity /
//          computeTARHash / writeAudit / writeAuditEvent;
//          dual-control.middleware.ts (the consumer of the resulting
//          two-operator dual-control capability).

import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import {
  prisma,
  createEntity,
  computeTARHash,
  writeAudit,
  writeAuditEvent,
} from "@niov/database";

export const CONFIRM_PHRASE = "I AUTHORIZE NIOV OPERATOR BOOTSTRAP";

export const OPERATOR_ALLOWLIST: Readonly<Record<string, string>> = {
  "niov-operator-1@niovlabs.com": "NIOV Operator 1",
  "niov-operator-2@niovlabs.com": "NIOV Operator 2",
};

// WHAT: The minimal environment view the safety gate needs.
// INPUT: Used as a parameter type (tests pass fabricated values).
// OUTPUT: None — a type.
// WHY: Keeps assertSafeEnvironment pure over its inputs so the refusal
//      matrix is unit-testable without touching process.env.
export interface BootstrapEnvironment {
  NODE_ENV?: string | undefined;
  DATABASE_URL?: string | undefined;
  ALLOW_FOUNDER_BOOTSTRAP?: string | undefined;
}

// WHAT: Refuse unsafe environments (founder-bootstrap.ts precedent).
// INPUT: The environment view.
// OUTPUT: Throws on refusal; returns void when safe to proceed.
// WHY: Production runs must be an explicit, inline, founder-authorized
//      choice — never a default.
export function assertSafeEnvironment(env: BootstrapEnvironment): void {
  const allowExplicit = env.ALLOW_FOUNDER_BOOTSTRAP === "true";
  const databaseUrl = env.DATABASE_URL ?? "";
  if (databaseUrl.length === 0) {
    throw new Error(
      "Refusing to run: DATABASE_URL not set. Source the intended env file first.",
    );
  }
  if (env.NODE_ENV === "production" && !allowExplicit) {
    throw new Error(
      "Refusing to run: NODE_ENV=production without ALLOW_FOUNDER_BOOTSTRAP=true. " +
        "Production bootstraps require explicit founder authorization.",
    );
  }
  if (!databaseUrl.includes("localhost") && !allowExplicit) {
    throw new Error(
      "Refusing to run: DATABASE_URL is not localhost and ALLOW_FOUNDER_BOOTSTRAP " +
        "is unset. Set ALLOW_FOUNDER_BOOTSTRAP=true inline for the one command.",
    );
  }
}

// WHAT: One row of the read-only platform-operator census.
// INPUT: Used as a return type.
// OUTPUT: None — a type. Identifiers and statuses ONLY (no hashes, no
//         tokens, no secrets).
export interface CensusRow {
  entity_id: string;
  email: string | null;
  display_name: string;
  entity_status: string;
  tar_status: string;
}

// WHAT: Read-only census of ACTIVE can_admin_niov holders.
// INPUT: None.
// OUTPUT: CensusRow[] — ACTIVE entity + ACTIVE TAR + can_admin_niov,
//         soft-deleted rows excluded.
// WHY: The precondition input for the bootstrap decision, and the
//      --verify mode output. SELECT only.
export async function censusActiveNiovOperators(): Promise<CensusRow[]> {
  const rows = await prisma.entity.findMany({
    where: {
      status: "ACTIVE",
      deleted_at: null,
      tar: { can_admin_niov: true, status: "ACTIVE" },
    },
    select: {
      entity_id: true,
      email: true,
      display_name: true,
      status: true,
      tar: { select: { status: true } },
    },
    orderBy: { entity_id: "asc" },
  });
  return rows.map((r) => ({
    entity_id: r.entity_id,
    email: r.email,
    display_name: r.display_name,
    entity_status: r.status,
    tar_status: r.tar?.status ?? "MISSING",
  }));
}

// WHAT: The pure bootstrap-precondition decision.
// INPUT: The target email + the census rows + whether an entity already
//        occupies the target email.
// OUTPUT: { ok: true, displayName } or { ok: false, reason }.
// WHY: Every refusal rule in one side-effect-free transform so the
//      matrix (allowlist / census 0/1/2+ / duplicate) is exhaustively
//      unit-testable without a database.
export function evaluateBootstrapPreconditions(
  email: string,
  census: readonly CensusRow[],
  targetEmailInUse: boolean,
):
  | { ok: true; displayName: string }
  | { ok: false; reason: string } {
  const displayName = OPERATOR_ALLOWLIST[email];
  if (displayName === undefined) {
    return {
      ok: false,
      reason:
        `EMAIL_NOT_ALLOWLISTED: ${email} — only ` +
        Object.keys(OPERATOR_ALLOWLIST).join(", ") +
        " may be bootstrapped.",
    };
  }
  if (targetEmailInUse) {
    return {
      ok: false,
      reason:
        `EMAIL_IN_USE: an entity already exists on ${email}. No silent ` +
        "upgrade — lost-credential recovery goes through the runbook §6 rail.",
    };
  }
  if (census.length >= 2) {
    return {
      ok: false,
      reason:
        `CENSUS_SATISFIED: ${census.length} ACTIVE can_admin_niov operators ` +
        "already exist — dual control is possible; bootstrap refuses. Use --verify.",
    };
  }
  if (email === "niov-operator-1@niovlabs.com" && census.length !== 0) {
    return {
      ok: false,
      reason:
        `CENSUS_NOT_ZERO: operator-1 bootstraps only into an empty platform ` +
        `(census = ${census.length}).`,
    };
  }
  if (email === "niov-operator-2@niovlabs.com" && census.length !== 1) {
    return {
      ok: false,
      reason:
        `CENSUS_NOT_ONE: operator-2 bootstraps only when exactly one operator ` +
        `exists (census = ${census.length}).`,
    };
  }
  return { ok: true, displayName };
}

// WHAT: Generate the one-time operator password when none is supplied.
// INPUT: env-supplied password (NIOV_OPERATOR_PASSWORD) or undefined.
// OUTPUT: { password, generated } — 24-char base64url, 144-bit entropy
//         when generated.
// WHY: founder-bootstrap.ts precedent; the caller prints it ONCE.
export function resolveOperatorPassword(supplied: string | undefined): {
  password: string;
  generated: boolean;
} {
  if (typeof supplied === "string" && supplied.length >= 16) {
    return { password: supplied, generated: false };
  }
  const generated = randomBytes(18)
    .toString("base64url")
    .replace(/[^a-zA-Z0-9_-]/g, "");
  return { password: generated, generated: true };
}

// WHAT: The write path — create the operator entity and grant
//       can_admin_niov, fully audited.
// INPUT: email + displayName (already validated by the orchestrator) +
//        the plaintext password (hashed by createEntity; never stored).
// OUTPUT: The new entity_id.
// WHY: createEntity gives entity + wallet + TAR + audits in ONE
//      transaction; the TAR grant then follows the executePhase0
//      STEP-10 discipline exactly — flip the boolean, recompute
//      tar_hash over the full policy, increment tar_version, write the
//      TAR_PERMISSIONS_UPDATE audit — plus the runbook's bootstrap
//      summary ADMIN_ACTION. Audit details carry identifiers and
//      capability names ONLY (no password, no hash, no secrets, no
//      DATABASE_URL).
export async function applyBootstrap(
  email: string,
  displayName: string,
  password: string,
): Promise<{ entity_id: string }> {
  const entity = await createEntity({
    entity_type: "PERSON",
    display_name: displayName,
    email,
    password,
    public_key: `niov-operator-bootstrap-${email}`,
    clearance_level: 0,
  });

  const tar = await prisma.tokenAttributeRepository.findUnique({
    where: { entity_id: entity.entity_id },
  });
  if (tar === null) {
    throw new Error("BOOTSTRAP_TAR_MISSING: createEntity did not mint a TAR");
  }

  // PERSON TAR defaults (initialPolicyFor) already grant
  // login/read/write/share; the ONLY flip is can_admin_niov. No org,
  // hive, or external-API powers — a platform operator, nothing else.
  const updatedPolicy = {
    can_login: tar.can_login,
    can_read_capsules: tar.can_read_capsules,
    can_write_capsules: tar.can_write_capsules,
    can_share_capsules: tar.can_share_capsules,
    can_create_hives: tar.can_create_hives,
    can_access_external_api: tar.can_access_external_api,
    can_admin_niov: true,
    can_admin_org: tar.can_admin_org,
    clearance_ceiling: tar.clearance_ceiling,
    monetization_role: tar.monetization_role,
    compliance_frameworks: tar.compliance_frameworks,
    status: tar.status,
  };
  const newHash = computeTARHash(updatedPolicy);

  await prisma.$transaction(async (tx) => {
    await tx.tokenAttributeRepository.update({
      where: { tar_id: tar.tar_id },
      data: {
        can_admin_niov: true,
        tar_hash: newHash,
        tar_version: { increment: 1 },
      },
    });
    await writeAudit(tx, {
      action: "TAR_PERMISSIONS_UPDATE",
      entity_id: entity.entity_id,
      actor_id: null,
      meta: {
        tar_id: tar.tar_id,
        new_hash: newHash,
        changed_fields: ["can_admin_niov"],
        via: "bootstrap_niov_operator",
      },
    });
    await writeAuditEvent(
      {
        event_type: "ADMIN_ACTION",
        outcome: "SUCCESS",
        actor_entity_id: entity.entity_id,
        target_entity_id: entity.entity_id,
        details: {
          action: "BOOTSTRAP_NIOV_OPERATOR",
          target_entity_id: entity.entity_id,
          target_email: email,
          granted: ["can_admin_niov"],
          founder_authorized: true,
          bootstrap_reason:
            "First/second dedicated NIOV platform operator per " +
            "admin-bootstrap runbook §5A — no HTTP path may grant " +
            "can_admin_niov; census gate enforced at run time.",
        },
      },
      tx,
    );
  });

  return { entity_id: entity.entity_id };
}

// WHAT: The orchestrator — gates, census, decision, dry-run or apply.
// INPUT: options bag (tests drive it directly; main() parses argv/env).
// OUTPUT: A structured result the caller prints; throws on refusal.
// WHY: One entry point so every path shares the same gates in the same
//      order: environment → allowlist/census/duplicate → confirmation.
export async function bootstrapNiovOperator(options: {
  email: string;
  apply: boolean;
  confirm: string | undefined;
  suppliedPassword: string | undefined;
  env: BootstrapEnvironment;
  /** Test seam ONLY — the unit tier injects fabricated census rows so
   *  the rule matrix is deterministic against a shared test DB whose
   *  other suites mint can_admin_niov fixtures in parallel. main()
   *  NEVER passes this; the CLI always reads the real census. */
  censusLoader?: () => Promise<CensusRow[]>;
}): Promise<
  | { mode: "dry-run"; email: string; displayName: string; census: number }
  | {
      mode: "applied";
      email: string;
      entity_id: string;
      generatedPassword: string | null;
    }
> {
  assertSafeEnvironment(options.env);

  const census = await (options.censusLoader ?? censusActiveNiovOperators)();
  const existing = await prisma.entity.findFirst({
    where: { email: options.email, deleted_at: null },
    select: { entity_id: true },
  });
  const decision = evaluateBootstrapPreconditions(
    options.email,
    census,
    existing !== null,
  );
  if (!decision.ok) {
    throw new Error(decision.reason);
  }

  if (!options.apply) {
    return {
      mode: "dry-run",
      email: options.email,
      displayName: decision.displayName,
      census: census.length,
    };
  }

  if (options.confirm !== CONFIRM_PHRASE) {
    throw new Error(
      "CONFIRMATION_REQUIRED: --apply needs FOUNDER_BOOTSTRAP_CONFIRM set to " +
        `the exact phrase "${CONFIRM_PHRASE}".`,
    );
  }

  const { password, generated } = resolveOperatorPassword(
    options.suppliedPassword,
  );
  const { entity_id } = await applyBootstrap(
    options.email,
    decision.displayName,
    password,
  );
  return {
    mode: "applied",
    email: options.email,
    entity_id,
    generatedPassword: generated ? password : null,
  };
}

// WHAT: CLI entry — argv/env parsing + human-facing output.
// INPUT: process.argv / process.env.
// OUTPUT: Exit 0 on success, 1 on refusal. The generated password is
//         printed exactly once, never anywhere else.
// WHY: Kept thin so everything above stays importable by the unit tier.
async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const verify = argv.includes("--verify");
  const apply = argv.includes("--apply");
  const emailFlag = argv.indexOf("--email");
  const email = emailFlag >= 0 ? argv[emailFlag + 1] : undefined;

  if (verify) {
    const census = await censusActiveNiovOperators();
    console.log(`ACTIVE can_admin_niov operators: ${census.length}`);
    for (const row of census) {
      console.log(
        `  ${row.entity_id} | ${row.email ?? "(no email)"} | ${row.display_name} | entity:${row.entity_status} tar:${row.tar_status}`,
      );
    }
    console.log(`dual control possible: ${census.length >= 2}`);
    return;
  }

  if (email === undefined) {
    console.error(
      "Usage: bootstrap-niov-operator.ts --verify | --email <operator-email> [--apply]",
    );
    process.exitCode = 1;
    return;
  }

  const result = await bootstrapNiovOperator({
    email,
    apply,
    confirm: process.env.FOUNDER_BOOTSTRAP_CONFIRM,
    suppliedPassword: process.env.NIOV_OPERATOR_PASSWORD,
    env: {
      NODE_ENV: process.env.NODE_ENV,
      DATABASE_URL: process.env.DATABASE_URL,
      ALLOW_FOUNDER_BOOTSTRAP: process.env.ALLOW_FOUNDER_BOOTSTRAP,
    },
  });

  if (result.mode === "dry-run") {
    console.log(
      `DRY-RUN (no writes): would bootstrap "${result.displayName}" <${result.email}> ` +
        `— census is ${result.census}. Re-run with --apply and ` +
        `FOUNDER_BOOTSTRAP_CONFIRM to execute.`,
    );
    return;
  }

  console.log(`BOOTSTRAPPED: ${result.email} entity_id=${result.entity_id}`);
  if (result.generatedPassword !== null) {
    console.log(
      "ONE-TIME PASSWORD (shown once, never stored — rotate within 24h):",
    );
    console.log(result.generatedPassword);
  } else {
    console.log("Password: as supplied via NIOV_OPERATOR_PASSWORD (rotate within 24h).");
  }
  console.log("Next: verify with --verify, then first-login probe per runbook §5A.");
}

const isDirectRun =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  main()
    .catch((err) => {
      console.error(err instanceof Error ? err.message : err);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
