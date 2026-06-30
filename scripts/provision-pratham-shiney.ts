// FILE: scripts/provision-pratham-shiney.ts
// PURPOSE: Narrow, approval-gated, idempotent provisioning of the two demo-team
//          members the live Work-OS transcript names but that the original
//          Phase 1304-C allowlist never created: Pratham and Shiney. Adding them
//          lets recipient-governance match them on the org roster and lets their
//          transcript commitments land as owned Action Center / Work Ledger items.
//
//          This is a SEPARATE, minimal-blast-radius script (NOT an edit to the
//          full-team provisioner) so it touches ONLY these two emails and never
//          re-hashes or mutates the existing 8 accounts. It provisions BOTH the
//          human PERSON account (login + wallet + TAR + org membership) AND the
//          AI Twin (AI_AGENT entity + wallet + TAR + EntityMembership(parent=
//          human, child=twin) + TwinConfig, joined to the default-enterprise
//          Hive) — the same canonical createEntity / createTwin paths the
//          established scripts use.
//
// GATES (a real run requires ALL):
//   1. DEMO_SHARED_PASSWORD            — shared demo password (never echoed)
//   2. NIOV_APPROVE_PRATHAM_SHINEY     — the exact approval phrase
//   --dry-run requires neither and mutates nothing.
//
// SAFETY:
//   - Idempotent: REPAIR if the account/twin already exists, CREATE if not.
//   - Hard allowlist of exactly two emails; refuses any other email.
//   - No DDL / schema mutation. No deletes. Never touches __niov_test__ or the
//     other 8 demo accounts.
//   - Never prints the password or any hash; redacts the DB URL.
//
// USAGE:
//   set -a; . ./.env; set +a; npx tsx scripts/provision-pratham-shiney.ts --dry-run
//   set -a; . ./.env; set +a; \
//     DEMO_SHARED_PASSWORD='********' \
//     NIOV_APPROVE_PRATHAM_SHINEY='APPROVE PRATHAM+SHINEY PROVISIONING — exact two only' \
//     npx tsx scripts/provision-pratham-shiney.ts
//
// CONNECTS TO: @niov/database (prisma, createEntity, computeTARHash, writeAuditEvent),
//              @niov/auth (hashPassword), scripts/provision-demo-team-accounts.ts
//              (human-account convention parent), scripts/repair-live-demo-twins.ts
//              (twin + default-Hive convention parent).

import { randomUUID } from "node:crypto";
import { prisma, createEntity, computeTARHash, writeAuditEvent } from "@niov/database";
import { hashPassword } from "@niov/auth";
import { createTwin } from "../apps/api/src/services/governance/twin.service.js";

const APPROVAL_ENV = "NIOV_APPROVE_PRATHAM_SHINEY";
const APPROVAL_PHRASE = "APPROVE PRATHAM+SHINEY PROVISIONING — exact two only";
const PASSWORD_ENV = "DEMO_SHARED_PASSWORD";

const ORG_NAME = "NIOV Labs";
const ORG_EMAIL = "bootstrap-org@niovlabs.com";
const ROLE_TITLE_TWIN = "Digital Twin";

interface DemoAccount {
  email: string;
  displayName: string;
  title: string;
}

// The exact (and only) two emails this script may ever touch.
const ALLOWLIST: ReadonlyArray<DemoAccount> = [
  { email: "pratham@niovlabs.com", displayName: "Pratham", title: "Software Engineer" },
  { email: "shiney@niovlabs.com", displayName: "Shiney", title: "Integration Engineer" },
];
const ALLOWLIST_EMAILS: ReadonlySet<string> = new Set(ALLOWLIST.map((a) => a.email));

function redactDbUrl(raw: string | undefined): string {
  if (!raw || raw.length === 0) return "<unset>";
  try {
    const u = new URL(raw);
    return `${u.protocol}//<redacted>@${u.hostname}:${u.port || "5432"}/${u.pathname.replace(/^\//, "")}`;
  } catch {
    return "<unparseable; redacted>";
  }
}

function fail(msg: string): never {
  console.error(`\n[provision] REFUSING: ${msg}\n`);
  process.exit(1);
}

interface AccountPlan {
  email: string;
  displayName: string;
  title: string;
  accountAction: "CREATE" | "REPAIR";
  entity_id: string | null;
  twinAction: "CREATE" | "SKIP-exists";
  twin_id: string | null;
}

async function existingActiveTwinId(humanId: string): Promise<string | null> {
  const memberships = await prisma.entityMembership.findMany({
    where: { parent_id: humanId, is_active: true },
    select: { child_id: true },
  });
  const childIds = memberships.map((m) => m.child_id);
  if (childIds.length === 0) return null;
  const twin = await prisma.entity.findFirst({
    where: { entity_id: { in: childIds }, entity_type: "AI_AGENT", deleted_at: null },
    orderBy: [{ created_at: "asc" }, { entity_id: "asc" }],
    select: { entity_id: true },
  });
  return twin?.entity_id ?? null;
}

async function buildPlan(): Promise<AccountPlan[]> {
  const plans: AccountPlan[] = [];
  for (const a of ALLOWLIST) {
    const row = await prisma.entity.findFirst({ where: { email: a.email }, select: { entity_id: true } });
    const twinId = row ? await existingActiveTwinId(row.entity_id) : null;
    plans.push({
      email: a.email,
      displayName: a.displayName,
      title: a.title,
      accountAction: row === null ? "CREATE" : "REPAIR",
      entity_id: row?.entity_id ?? null,
      twinAction: twinId ? "SKIP-exists" : "CREATE",
      twin_id: twinId,
    });
  }
  return plans;
}

// Mirrors dandelion Phase 0 STEP 11 — the canonical default-enterprise Hive that
// standard (non-admin) twins join in createTwin STEP 5. No-op if it already
// exists (the live repair already created it).
async function ensureDefaultHive(orgId: string, orgName: string, adminId: string): Promise<string> {
  const existing = await prisma.hive.findFirst({
    where: { org_entity_id: orgId, is_default_enterprise: true, status: "ACTIVE" },
    select: { hive_id: true },
  });
  if (existing) return existing.hive_id;
  const hiveId = randomUUID();
  await prisma.$transaction(async (tx) => {
    await tx.hive.create({
      data: {
        hive_id: hiveId,
        hive_name: `${orgName} -- Default Knowledge`,
        created_by: adminId,
        hive_type: "ENTERPRISE",
        governance_terms: {},
        member_count: 0,
        status: "ACTIVE",
        org_entity_id: orgId,
        is_default_enterprise: true,
      },
    });
    await writeAuditEvent(
      {
        event_type: "HIVE_CREATED",
        outcome: "SUCCESS",
        actor_entity_id: adminId,
        target_entity_id: adminId,
        details: { hive_id: hiveId, hive_type: "ENTERPRISE", is_default_enterprise: true, org_entity_id: orgId, via: "provision-pratham-shiney" },
      },
      tx,
    );
  });
  return hiveId;
}

// Create or repair one allowlisted PERSON account; return entity_id.
async function ensureAccount(p: AccountPlan, password: string): Promise<string> {
  if (!ALLOWLIST_EMAILS.has(p.email)) throw new Error("refusing to touch non-allowlisted email");
  if (p.entity_id !== null) {
    const passwordHash = await hashPassword(password);
    await prisma.entity.update({
      where: { entity_id: p.entity_id },
      data: { display_name: p.displayName, password_hash: passwordHash, status: "ACTIVE", failed_auth_attempts: 0, suspended_at: null },
    });
    return p.entity_id;
  }
  const created = await createEntity({
    entity_type: "PERSON",
    display_name: p.displayName,
    email: p.email,
    password,
    public_key: `demo-provision-${p.email}-pubkey`,
  });
  return created.entity_id;
}

// Set the base login + capsule TAR (no admin) and recompute the integrity hash.
async function ensureTar(entityId: string): Promise<void> {
  const existing = await prisma.tokenAttributeRepository.findUnique({ where: { entity_id: entityId } });
  if (existing === null) throw new Error(`TAR missing for entity ${entityId} (createEntity should have made one)`);
  await prisma.tokenAttributeRepository.update({
    where: { entity_id: entityId },
    data: { can_login: true, can_read_capsules: true, can_write_capsules: true, can_share_capsules: true },
  });
  const fresh = await prisma.tokenAttributeRepository.findUnique({ where: { entity_id: entityId } });
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

async function ensureMembership(orgId: string, personId: string, roleTitle: string): Promise<void> {
  const existing = await prisma.entityMembership.findFirst({ where: { parent_id: orgId, child_id: personId } });
  if (existing === null) {
    await prisma.entityMembership.create({ data: { parent_id: orgId, child_id: personId, role_title: roleTitle, is_active: true } });
  } else if (existing.is_active !== true || existing.role_title !== roleTitle) {
    await prisma.entityMembership.update({ where: { membership_id: existing.membership_id }, data: { is_active: true, role_title: roleTitle } });
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");

  const databaseUrl = process.env.DATABASE_URL ?? "";
  if (databaseUrl.length === 0) fail("DATABASE_URL is not set. Source the target env first (`set -a; . ./.env; set +a`).");

  const password = process.env[PASSWORD_ENV] ?? "";
  const passwordPresent = password.length > 0;
  const approval = process.env[APPROVAL_ENV] ?? "";
  const approvalPresent = approval === APPROVAL_PHRASE;

  const org = await prisma.entity.findFirst({ where: { email: ORG_EMAIL }, select: { entity_id: true, display_name: true } });
  if (!org) fail(`Org ${ORG_EMAIL} not found in the target DB.`);
  const sadeil = await prisma.entity.findFirst({ where: { email: "sadeil@niovlabs.com" }, select: { entity_id: true } });
  const actorId = sadeil?.entity_id ?? org!.entity_id;

  const plan = await buildPlan();

  console.log(`\n=== PRATHAM + SHINEY PROVISIONING (${dryRun ? "DRY-RUN" : "EXECUTE"}) ===`);
  console.log(`DB target:          ${redactDbUrl(databaseUrl)}`);
  console.log(`Org:                ${org!.display_name} (${org!.entity_id})`);
  console.log(`${PASSWORD_ENV}:  ${passwordPresent ? "present (not printed)" : "MISSING"}`);
  console.log(`${APPROVAL_ENV}: ${approvalPresent ? "present + correct" : "missing/incorrect"}`);
  console.log(`Schema mutation:    NONE (no DDL)`);
  console.log(`Blast radius:       exactly ${plan.length} emails (allowlist); the other demo accounts are NOT touched`);
  console.log(`\nPlan:`);
  for (const p of plan) {
    console.log(`  account ${p.accountAction.padEnd(7)} ${p.email.padEnd(26)} ${p.title.padEnd(22)} | twin ${p.twinAction}`);
  }
  console.log(`==================================================\n`);

  if (dryRun) {
    console.log("[provision] DRY-RUN complete — nothing was written.\n");
    return;
  }

  if (!passwordPresent) fail(`${PASSWORD_ENV} is required for a real run (supply via env; it is never printed).`);
  if (password.length < 12) fail(`${PASSWORD_ENV} is too short (need >= 12 chars).`);
  if (!approvalPresent) fail(`${APPROVAL_ENV} must equal exactly the approval phrase. Re-run with the exact phrase to proceed.`);

  const hiveId = await ensureDefaultHive(org!.entity_id, org!.display_name ?? ORG_NAME, actorId);
  console.log(`[provision] default Hive ${hiveId} (ensured)`);

  for (const p of plan) {
    const entityId = await ensureAccount(p, password);
    await ensureTar(entityId);
    await ensureMembership(org!.entity_id, entityId, p.title.toUpperCase());
    console.log(`[provision] account   ${p.email.padEnd(26)} ${p.accountAction.toLowerCase().padEnd(7)} entity=${entityId}`);

    if (p.twinAction === "CREATE") {
      try {
        const res = await createTwin({
          owner_entity_id: entityId,
          org_entity_id: org!.entity_id,
          role_title: ROLE_TITLE_TWIN,
          is_admin_invite: false,
          actor_entity_id: actorId,
        });
        console.log(`[provision] twin      ${p.email.padEnd(26)} CREATED twin=${res.entity_id} (admin=${res.is_admin_twin})`);
      } catch (e) {
        const msg = String(e instanceof Error ? e.message : e);
        if (msg.includes("TWIN_ALREADY_EXISTS")) console.log(`[provision] twin      ${p.email}: already had a twin (race) — skipped`);
        else throw e;
      }
    } else {
      console.log(`[provision] twin      ${p.email.padEnd(26)} SKIP (twin ${p.twin_id} exists)`);
    }
  }

  console.log(`\n=== PROVISIONING COMPLETE ===`);
  console.log(`Org:       ${ORG_NAME}  (${org!.entity_id})`);
  console.log(`Accounts:  ${plan.length} provisioned (Pratham + Shiney only)`);
  console.log(`Password:  supplied via ${PASSWORD_ENV} env only — NOT printed`);
  console.log(`=============================\n`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error("[provision] FAILED:", err instanceof Error ? err.message : String(err));
    await prisma.$disconnect();
    process.exit(1);
  });
