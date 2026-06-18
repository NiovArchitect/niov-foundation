// FILE: scripts/provision-demo-team-accounts.ts
// PURPOSE: Phase 1304-C — narrow, approval-gated, idempotent provisioning of
//          the NIOV Labs demo organization + the Founder + the demo team
//          accounts in the (prod-connected) demo database so Control Tower
//          login and the org-scoped demo surfaces work.
//
//          This is intentionally NOT localhost-guarded: the established
//          founder-bootstrap.ts / demo-team-seed.ts refuse non-localhost,
//          which is why none of this shape exists in the prod-connected DB.
//          The mutation here is gated instead by TWO explicit env signals:
//            1. DEMO_SHARED_PASSWORD  — the shared demo password (never echoed)
//            2. NIOV_APPROVE_DEMO_TEAM_ACCOUNTS — the exact approval phrase
//          Both are required for a real run. --dry-run requires neither and
//          mutates nothing.
//
// ALLOWED MUTATION (per Founder Phase 1304-C authorization, full team demo):
//   - Create/repair the NIOV Labs org/company entity if absent.
//   - Create/repair the exact allowlisted PERSON accounts (+ wallet + TAR via
//     the canonical createEntity path; password hashed with the same
//     @niov/auth helper login verifies against).
//   - Create/repair org memberships (org -> person).
//   - Set Founder/admin authority for Sadeil ONLY.
//   - Set base login/capsule TAR for teammates (no admin).
//   - Clear lockout state (status / failed_auth_attempts / suspended_at) for
//     allowlisted accounts only.
//   NOT in scope here: twins, projects, action/collaboration policies,
//   capsules, marketplace data, schema/DDL. Those stay with the localhost
//   seed scripts or a separate follow-up.
//
// SECRECY: never prints the password or any password hash; redacts the DB URL.
//
// USAGE:
//   npx tsx scripts/provision-demo-team-accounts.ts --help
//   # dry-run (no creds required, mutates nothing):
//   set -a; . ./.env; set +a; npx tsx scripts/provision-demo-team-accounts.ts --dry-run
//   # real run (both env signals required):
//   set -a; . ./.env; set +a; \
//     DEMO_SHARED_PASSWORD='********' \
//     NIOV_APPROVE_DEMO_TEAM_ACCOUNTS='APPROVE FULL DEMO TEAM ACCOUNTS — exact allowlist only' \
//     npx tsx scripts/provision-demo-team-accounts.ts
//
// CONNECTS TO: @niov/database (prisma, createEntity, computeTARHash),
//              @niov/auth (hashPassword — the same helper auth.service.login
//              verifies against), scripts/founder-bootstrap.ts +
//              scripts/demo-team-seed.ts (shape/convention parents).

import { prisma, createEntity, computeTARHash } from "@niov/database";
import { hashPassword } from "@niov/auth";

const APPROVAL_ENV = "NIOV_APPROVE_DEMO_TEAM_ACCOUNTS";
const APPROVAL_PHRASE = "APPROVE FULL DEMO TEAM ACCOUNTS — exact allowlist only";
const PASSWORD_ENV = "DEMO_SHARED_PASSWORD";

const ORG_NAME = "NIOV Labs";
const ORG_DOMAIN = "niovlabs.com";
const ORG_EMAIL = `bootstrap-org@${ORG_DOMAIN}`;

// WHAT: One allowlisted demo account.
// WHY: The allowlist is the only set of emails this script may ever touch.
interface DemoAccount {
  email: string;
  displayName: string;
  // Human-readable role title; also used as the org-membership role_title
  // (upper-cased for teammates, "FOUNDER" for Sadeil — mirrors the existing
  // demo-team-seed.ts / founder-bootstrap.ts conventions).
  title: string;
  isFounder: boolean;
}

const ALLOWLIST: ReadonlyArray<DemoAccount> = [
  {
    email: "sadeil@niovlabs.com",
    displayName: "Sadeil Lewis",
    title: "Founder & CEO",
    isFounder: true,
  },
  { email: "david@niovlabs.com", displayName: "David Odie", title: "Tech Lead", isFounder: false },
  {
    email: "vishesh@niovlabs.com",
    displayName: "Vishesh Sharma",
    title: "AI UI Engineer",
    isFounder: false,
  },
  {
    email: "samiksha@niovlabs.com",
    displayName: "Samiksha Sharma",
    title: "AI/NLP Engineer",
    isFounder: false,
  },
  { email: "shweta@niovlabs.com", displayName: "Shweta", title: "Go-to-Market Lead", isFounder: false },
  { email: "william@niovlabs.com", displayName: "William", title: "Product Lead", isFounder: false },
  { email: "annie@niovlabs.com", displayName: "Annie", title: "Risk & Compliance Lead", isFounder: false },
  { email: "walter@niovlabs.com", displayName: "Walter", title: "Media Lead", isFounder: false },
];

const ALLOWLIST_EMAILS: ReadonlySet<string> = new Set(
  ALLOWLIST.map((a) => a.email),
);

// WHAT: Mask a DB connection string so a redacted host:port/db is all that
//       ever reaches stdout.
// INPUT: raw DATABASE_URL (or undefined).
// OUTPUT: a safe, secret-free descriptor.
// WHY: directive — "redact secrets and DB URLs".
function redactDbUrl(raw: string | undefined): string {
  if (!raw || raw.length === 0) return "<unset>";
  try {
    const u = new URL(raw);
    const db = u.pathname.replace(/^\//, "");
    return `${u.protocol}//<redacted>@${u.hostname}:${u.port || "5432"}/${db}`;
  } catch {
    return "<unparseable; redacted>";
  }
}

// WHAT: Refuse to run with a clear message.
function fail(msg: string): never {
  console.error(`\n[provision] REFUSING: ${msg}\n`);
  process.exit(1);
}

function printHelp(): void {
  console.log(`
provision-demo-team-accounts.ts — Phase 1304-C full demo team provisioning

Creates/repairs the ${ORG_NAME} org + the Founder + the demo team accounts
(exact allowlist only), idempotently, against the configured DATABASE_URL.

FLAGS
  --dry-run    Show the exact plan; mutate nothing; no creds required.
  --help       This message.

REQUIRED ENV FOR A REAL RUN
  DATABASE_URL                      target DB (redacted in all output)
  ${PASSWORD_ENV}               shared demo password (never printed)
  ${APPROVAL_ENV}   must equal exactly:
      "${APPROVAL_PHRASE}"

ALLOWLIST (${ALLOWLIST.length} accounts; nothing else is ever touched)
${ALLOWLIST.map((a) => `  - ${a.email.padEnd(26)} ${a.isFounder ? "Founder/admin" : "team"}  (${a.title})`).join("\n")}

This script never prints the password or any password hash, never touches
__niov_test__ fixtures or unrelated accounts, never deletes, never mutates
schema, never runs DDL.
`);
}

interface AccountPlan {
  email: string;
  displayName: string;
  title: string;
  isFounder: boolean;
  action: "CREATE" | "REPAIR";
  entity_id: string | null;
}

// WHAT: Read-only plan — for the org + each allowlisted account, decide
//       CREATE vs REPAIR by existence.
// WHY: dry-run prints this; the real run reuses the same existence decision.
async function buildPlan(): Promise<{ org: AccountPlan; people: AccountPlan[] }> {
  const orgRow = await prisma.entity.findFirst({ where: { email: ORG_EMAIL } });
  const org: AccountPlan = {
    email: ORG_EMAIL,
    displayName: ORG_NAME,
    title: "Organization (COMPANY)",
    isFounder: false,
    action: orgRow === null ? "CREATE" : "REPAIR",
    entity_id: orgRow?.entity_id ?? null,
  };
  const people: AccountPlan[] = [];
  for (const a of ALLOWLIST) {
    const row = await prisma.entity.findFirst({ where: { email: a.email } });
    people.push({
      email: a.email,
      displayName: a.displayName,
      title: a.title,
      isFounder: a.isFounder,
      action: row === null ? "CREATE" : "REPAIR",
      entity_id: row?.entity_id ?? null,
    });
  }
  return { org, people };
}

function printPlan(
  plan: { org: AccountPlan; people: AccountPlan[] },
  passwordPresent: boolean,
  approvalPresent: boolean,
  dryRun: boolean,
): void {
  console.log(`\n=== PHASE 1304-C PROVISIONING PLAN (${dryRun ? "DRY-RUN" : "EXECUTE"}) ===`);
  console.log(`DB target:          ${redactDbUrl(process.env.DATABASE_URL)}`);
  console.log(`${PASSWORD_ENV}:  ${passwordPresent ? "present (not printed)" : "MISSING"}`);
  console.log(`${APPROVAL_ENV}: ${approvalPresent ? "present + correct" : "missing/incorrect"}`);
  console.log(`Schema mutation:    NONE (no DDL, no db push)`);
  console.log(`Test fixtures:      __niov_test__ accounts NOT touched`);
  console.log(`Unrelated accounts: NOT touched (allowlist of ${plan.people.length} only)`);
  console.log(`\nOrg:`);
  console.log(`  ${plan.org.action.padEnd(7)} ${plan.org.email.padEnd(28)} ${plan.org.displayName}`);
  console.log(`\nAccounts:`);
  for (const p of plan.people) {
    console.log(
      `  ${p.action.padEnd(7)} ${p.email.padEnd(26)} ${(p.isFounder ? "FOUNDER/ADMIN" : "team").padEnd(13)} ${p.title}`,
    );
  }
  console.log(`\nMembership plan:    org "${ORG_NAME}" -> each account (Sadeil=FOUNDER, others=title)`);
  console.log(`Admin authority:    Sadeil ONLY (can_admin_org, clearance 5)`);
  console.log(`Lockout clear:      status=ACTIVE, failed_auth_attempts=0, suspended_at=null (allowlist only)`);
  console.log(`================================================\n`);
}

// WHAT: Ensure the org entity exists; return its id.
async function ensureOrg(plan: AccountPlan): Promise<string> {
  if (plan.entity_id !== null) {
    // Repair: keep display_name + ACTIVE; never weaken anything else.
    await prisma.entity.update({
      where: { entity_id: plan.entity_id },
      data: { display_name: ORG_NAME, status: "ACTIVE" },
    });
    return plan.entity_id;
  }
  const created = await createEntity({
    entity_type: "COMPANY",
    display_name: ORG_NAME,
    email: ORG_EMAIL,
    public_key: "demo-provision-org-pubkey",
    clearance_level: 0,
  });
  return created.entity_id;
}

// WHAT: Create or repair one allowlisted PERSON account; return its id.
// INPUT: the account plan + the (already-validated, never-logged) password.
// OUTPUT: entity_id.
// WHY: idempotent — repair restores the canonical login shape (password,
//      ACTIVE status, cleared lockout); create uses the canonical
//      createEntity path so the wallet + TAR + audit event all land.
async function ensureAccount(p: AccountPlan, password: string): Promise<string> {
  // Hard allowlist guard — defense in depth; this function must never run
  // against an off-list email.
  if (!ALLOWLIST_EMAILS.has(p.email)) {
    throw new Error(`refusing to touch non-allowlisted email`);
  }
  if (p.entity_id !== null) {
    const passwordHash = await hashPassword(password);
    await prisma.entity.update({
      where: { entity_id: p.entity_id },
      data: {
        display_name: p.displayName,
        password_hash: passwordHash,
        status: "ACTIVE",
        failed_auth_attempts: 0,
        suspended_at: null,
        ...(p.isFounder ? { clearance_level: 5 } : {}),
      },
    });
    return p.entity_id;
  }
  const created = await createEntity({
    entity_type: "PERSON",
    display_name: p.displayName,
    email: p.email,
    password,
    public_key: `demo-provision-${p.email}-pubkey`,
    ...(p.isFounder ? { clearance_level: 5 } : {}),
  });
  return created.entity_id;
}

// WHAT: Set the TAR to the expected shape (login + capsule caps; admin only
//       for the Founder) and recompute the integrity hash.
// WHY: createEntity seeds a base TAR; this makes the shape explicit + idempotent
//      for the repair path, mirroring founder-bootstrap.grantAdminTAR /
//      demo-team-seed.ensureGrantBaseTar.
async function ensureTar(entityId: string, isFounder: boolean): Promise<void> {
  const existing = await prisma.tokenAttributeRepository.findUnique({
    where: { entity_id: entityId },
  });
  if (existing === null) {
    throw new Error(`TAR missing for entity ${entityId} (createEntity should have made one)`);
  }
  await prisma.tokenAttributeRepository.update({
    where: { entity_id: entityId },
    data: {
      can_login: true,
      can_read_capsules: true,
      can_write_capsules: true,
      can_share_capsules: true,
      ...(isFounder
        ? {
            can_admin_org: true,
            can_create_hives: true,
            can_access_external_api: true,
          }
        : {}),
    },
  });
  const fresh = await prisma.tokenAttributeRepository.findUnique({
    where: { entity_id: entityId },
  });
  if (fresh === null) throw new Error(`TAR vanished for entity ${entityId}`);
  await prisma.tokenAttributeRepository.update({
    where: { entity_id: entityId },
    data: {
      tar_hash: computeTARHash({
        can_login: fresh.can_login,
        can_read_capsules: fresh.can_read_capsules,
        can_write_capsules: fresh.can_write_capsules,
        can_share_capsules: fresh.can_share_capsules,
        can_create_hives: fresh.can_create_hives,
        can_access_external_api: fresh.can_access_external_api,
        can_admin_niov: fresh.can_admin_niov,
        can_admin_org: fresh.can_admin_org,
        clearance_ceiling: fresh.clearance_ceiling,
        monetization_role: fresh.monetization_role,
        compliance_frameworks: fresh.compliance_frameworks,
        status: fresh.status,
      }),
    },
  });
}

// WHAT: Ensure an org->person membership with the given role title.
async function ensureMembership(
  orgId: string,
  personId: string,
  roleTitle: string,
): Promise<void> {
  const existing = await prisma.entityMembership.findFirst({
    where: { parent_id: orgId, child_id: personId },
  });
  if (existing === null) {
    await prisma.entityMembership.create({
      data: { parent_id: orgId, child_id: personId, role_title: roleTitle, is_active: true },
    });
  } else if (existing.is_active !== true || existing.role_title !== roleTitle) {
    await prisma.entityMembership.update({
      where: { membership_id: existing.membership_id },
      data: { is_active: true, role_title: roleTitle },
    });
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    printHelp();
    return;
  }
  const dryRun = argv.includes("--dry-run");

  const databaseUrl = process.env.DATABASE_URL ?? "";
  if (databaseUrl.length === 0) {
    fail("DATABASE_URL is not set. Source the target env first (e.g. `set -a; . ./.env; set +a`).");
  }

  const password = process.env[PASSWORD_ENV] ?? "";
  const passwordPresent = password.length > 0;
  const approval = process.env[APPROVAL_ENV] ?? "";
  const approvalPresent = approval === APPROVAL_PHRASE;

  const plan = await buildPlan();
  printPlan(plan, passwordPresent, approvalPresent, dryRun);

  if (dryRun) {
    console.log("[provision] DRY-RUN complete — nothing was written.\n");
    return;
  }

  // Real run: both gates mandatory.
  if (!passwordPresent) {
    fail(`${PASSWORD_ENV} is required for a real run (supply via env; it is never printed).`);
  }
  if (password.length < 12) {
    fail(`${PASSWORD_ENV} is too short (need >= 12 chars).`);
  }
  if (!approvalPresent) {
    fail(
      `${APPROVAL_ENV} must equal exactly the approval phrase. Re-run with the exact phrase to proceed.`,
    );
  }

  const orgId = await ensureOrg(plan.org);
  console.log(`[provision] org       ${orgId}  (${plan.org.action.toLowerCase()})`);

  const results: Array<{ email: string; action: string; entity_id: string; founder: boolean }> = [];
  for (const p of plan.people) {
    const entityId = await ensureAccount(p, password);
    await ensureTar(entityId, p.isFounder);
    await ensureMembership(orgId, entityId, p.isFounder ? "FOUNDER" : p.title.toUpperCase());
    results.push({ email: p.email, action: p.action, entity_id: entityId, founder: p.isFounder });
    console.log(
      `[provision] account   ${p.email.padEnd(26)} ${p.action.toLowerCase().padEnd(7)} ${p.isFounder ? "FOUNDER/ADMIN" : "team"}  entity=${entityId}`,
    );
  }

  console.log(`\n=== PROVISIONING COMPLETE ===`);
  console.log(`Org:       ${ORG_NAME}  (${orgId})`);
  console.log(`Accounts:  ${results.length} provisioned (allowlist only)`);
  console.log(`Password:  supplied via ${PASSWORD_ENV} env only — NOT printed, NOT stored anywhere but the bcrypt hash`);
  console.log(`Founder:   sadeil@niovlabs.com has can_admin_org + clearance 5`);
  console.log(`=============================\n`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    // Never let an error path leak the password — log only the message.
    console.error("[provision] FAILED:", err instanceof Error ? err.message : String(err));
    await prisma.$disconnect();
    process.exit(1);
  });
