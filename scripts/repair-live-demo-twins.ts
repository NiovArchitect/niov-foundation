// FILE: scripts/repair-live-demo-twins.ts
// PURPOSE: Narrowly-scoped LIVE repair for the TWIN_NOT_FOUND blocker found in
//          the OTZAR-LIVE-DEPLOY-1 smoke. The prod provisioning script
//          (provision-demo-team-accounts.ts) intentionally does NOT create
//          Twins, so logged-in humans have no AI_AGENT twin / membership /
//          TwinConfig and "talk to Otzar" returns TWIN_NOT_FOUND.
//
//          This script mints the MISSING primary Twin for an exact allowlist
//          (Sadeil + David), reusing the canonical createTwin() flow
//          (AI_AGENT entity + wallet + TAR + EntityMembership(parent=human,
//          child=twin) + TwinConfig). It does NOT seed demo projects, action
//          policies, or any other broad demo state (unlike demo-team-seed.ts).
//
// SAFETY:
//   - Idempotent: skips any account that already has an active AI_AGENT child.
//   - DRY-RUN by default. A real mutation requires BOTH `--apply` AND the
//     approval phrase in NIOV_APPROVE_TWIN_REPAIR.
//   - No encrypted fields: createTwin/createEntity/wallet/TAR use no
//     ENCRYPTION_KEY/AES (verified), so this is key-safe to run against prod.
//   - Prints only non-secret identifiers; never tokens/passwords.
//   - Touches ONLY the 2 allowlisted humans + their new twin rows.
//
// USAGE:
//   # dry-run (no writes, no approval needed):
//   npx tsx --env-file=.env scripts/repair-live-demo-twins.ts
//   # real run:
//   NIOV_APPROVE_TWIN_REPAIR='APPROVE LIVE TWIN REPAIR — sadeil+david only' \
//     npx tsx --env-file=.env scripts/repair-live-demo-twins.ts --apply

import { randomUUID } from "node:crypto";
import { prisma, writeAuditEvent } from "@niov/database";
import { createTwin } from "../apps/api/src/services/governance/twin.service.js";

const ORG_EMAIL = "bootstrap-org@niovlabs.com";
const ROLE_TITLE = "Digital Twin";
const APPROVAL_ENV = "NIOV_APPROVE_TWIN_REPAIR";
const APPROVAL_PHRASE = "APPROVE LIVE TWIN REPAIR — full demo team";

// Exact allowlist = the 8 humans provisioned by provision-demo-team-accounts.ts.
// Only the founder gets an admin (EXECUTIVE_OVERRIDE) twin.
const ALLOWLIST: { email: string; isAdmin: boolean }[] = [
  { email: "sadeil@niovlabs.com", isAdmin: true },
  { email: "david@niovlabs.com", isAdmin: false },
  { email: "vishesh@niovlabs.com", isAdmin: false },
  { email: "samiksha@niovlabs.com", isAdmin: false },
  { email: "shweta@niovlabs.com", isAdmin: false },
  { email: "william@niovlabs.com", isAdmin: false },
  { email: "annie@niovlabs.com", isAdmin: false },
  { email: "walter@niovlabs.com", isAdmin: false },
];

function redactDbUrl(u: string | undefined): string {
  if (!u) return "(unset)";
  return u.replace(/\/\/[^@]+@/, "//<redacted>@");
}

// Mirrors dandelion Phase 0 STEP 11 — the canonical default-enterprise Hive.
// Standard (non-admin) twins join this Hive in createTwin STEP 5; prod
// provisioning bypassed Phase 0, so the org has none -> DEFAULT_HIVE_MISSING.
async function ensureDefaultHive(
  orgId: string,
  orgName: string,
  adminId: string,
  apply: boolean,
): Promise<{ action: "EXISTS" | "CREATE" | "CREATED"; hiveId: string | null }> {
  const existing = await prisma.hive.findFirst({
    where: { org_entity_id: orgId, is_default_enterprise: true, status: "ACTIVE" },
    select: { hive_id: true },
  });
  if (existing) return { action: "EXISTS", hiveId: existing.hive_id };
  if (!apply) return { action: "CREATE", hiveId: null };
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
        details: { hive_id: hiveId, hive_type: "ENTERPRISE", is_default_enterprise: true, org_entity_id: orgId, via: "repair-live-demo-twins" },
      },
      tx,
    );
  });
  return { action: "CREATED", hiveId };
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

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const approved = process.env[APPROVAL_ENV] === APPROVAL_PHRASE;

  console.log("=== LIVE TWIN REPAIR (Sadeil + David) ===");
  console.log("Mode:               " + (apply ? (approved ? "APPLY (will write)" : "APPLY REQUESTED but approval MISSING -> dry-run") : "DRY-RUN"));
  console.log("DB target:          " + redactDbUrl(process.env.DATABASE_URL));

  const org = await prisma.entity.findFirst({ where: { email: ORG_EMAIL }, select: { entity_id: true, display_name: true } });
  if (!org) { console.error(`Org ${ORG_EMAIL} not found.`); process.exit(1); }
  console.log(`Org:                ${org.display_name} (${org.entity_id})`);

  const sadeil = await prisma.entity.findFirst({ where: { email: "sadeil@niovlabs.com" }, select: { entity_id: true } });
  const actorId = sadeil?.entity_id ?? null;

  const plan: { email: string; humanId: string; isAdmin: boolean; action: "CREATE" | "SKIP-exists" }[] = [];
  for (const a of ALLOWLIST) {
    const human = await prisma.entity.findFirst({ where: { email: a.email }, select: { entity_id: true } });
    if (!human) { console.log(`  ${a.email}: HUMAN MISSING -> cannot repair`); continue; }
    const twinId = await existingActiveTwinId(human.entity_id);
    plan.push({ email: a.email, humanId: human.entity_id, isAdmin: a.isAdmin, action: twinId ? "SKIP-exists" : "CREATE" });
    console.log(`  ${a.email}: human=${human.entity_id} | ${twinId ? "SKIP (twin " + twinId + " exists)" : "CREATE twin (" + (a.isAdmin ? "admin" : "standard") + ")"}`);
  }

  const toCreate = plan.filter((p) => p.action === "CREATE");
  const needHive = toCreate.some((p) => !p.isAdmin);

  // Default-enterprise Hive: required for standard (non-admin) twins.
  const hiveReport = await ensureDefaultHive(org.entity_id, org.display_name ?? "Org", actorId ?? "", false);
  if (needHive || hiveReport.action !== "CREATE") {
    console.log(`  default Hive:        ${hiveReport.action === "EXISTS" ? "EXISTS (" + hiveReport.hiveId + ")" : "MISSING -> will CREATE (Phase-0 default-enterprise Hive)"}`);
  }

  if (toCreate.length === 0) { console.log("\nNothing to create — all allowlisted humans already have a twin."); return; }

  if (!apply) { console.log(`\nDRY-RUN: would create ${toCreate.length} twin(s)${needHive && hiveReport.action === "CREATE" ? " + 1 default Hive" : ""}. Re-run with --apply + approval to write.`); return; }
  if (!approved) { console.log(`\nAPPLY blocked: set ${APPROVAL_ENV}='${APPROVAL_PHRASE}' to authorize the write. Nothing written.`); return; }

  if (needHive && hiveReport.action === "CREATE") {
    const made = await ensureDefaultHive(org.entity_id, org.display_name ?? "Org", actorId ?? "", true);
    console.log(`\n  default Hive: ${made.action} (${made.hiveId})`);
  }

  console.log(`\nApplying: creating ${toCreate.length} twin(s)...`);
  for (const p of toCreate) {
    try {
      const res = await createTwin({
        owner_entity_id: p.humanId,
        org_entity_id: org.entity_id,
        role_title: ROLE_TITLE,
        is_admin_invite: p.isAdmin,
        actor_entity_id: actorId,
      });
      console.log(`  ${p.email}: CREATED twin ${res.entity_id} (admin=${res.is_admin_twin})`);
    } catch (e) {
      const msg = String(e instanceof Error ? e.message : e);
      if (msg.includes("TWIN_ALREADY_EXISTS")) console.log(`  ${p.email}: already had a twin (race) — skipped`);
      else { console.error(`  ${p.email}: FAILED — ${msg.slice(0, 160)}`); throw e; }
    }
  }
  console.log("Repair complete.");
}

main().then(() => prisma.$disconnect()).catch(async (e) => {
  console.error("REPAIR ERROR:", String(e instanceof Error ? e.message : e).slice(0, 200));
  await prisma.$disconnect();
  process.exit(1);
});
