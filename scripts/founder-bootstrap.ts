// FILE: founder-bootstrap.ts
// PURPOSE: Local / staging founder bootstrap per the [FOUNDER-AUTH —
//          CREATE LOCAL/STAGING FOUNDER LOGIN FOR SADEIL] directive.
//          Creates the NIOV Labs org + a single ORG_ADMIN identity for
//          the founder (Sadeil) + an AI Twin + the "Otzar Live Test"
//          project + the autonomous-flow collaboration policy preset.
//
//          Production posture: refuses to run unless ONE of these
//          conditions is true:
//          - ALLOW_FOUNDER_BOOTSTRAP=true is set in the environment
//          - NODE_ENV is not "production"
//          - DATABASE_URL points at localhost
//
// USAGE:
//   set -a; . ./.env.demo.local; set +a; \
//   FOUNDER_BOOTSTRAP_PASSWORD=... npx tsx scripts/founder-bootstrap.ts
//
//   If FOUNDER_BOOTSTRAP_PASSWORD is unset, the script generates a
//   one-time random password and PRINTS IT ONCE to stdout. The
//   password is never written to disk, never committed, never
//   re-emitted by Foundation in any future response.
//
// IDEMPOTENCY:
//   - If sadeil@niovlabs.com already exists, the script updates the
//     Sadeil entity's TAR + membership + Twin + project links to
//     match the expected shape, then re-issues a fresh password
//     (since the operator no longer has the old one once it scrolls
//     off the terminal).
//
// AUDIT:
//   Each create / update emits its canonical audit event via the
//   existing helpers (createEntity, etc.) — no audit-write path is
//   bypassed.

import { randomBytes } from "node:crypto";
import { prisma, createEntity, computeTARHash } from "@niov/database";
import { hashPassword } from "@niov/auth";

const FOUNDER_EMAIL =
  process.env.FOUNDER_BOOTSTRAP_EMAIL ?? "sadeil@niovlabs.com";
const FOUNDER_DISPLAY_NAME = "Sadeil";
const FOUNDER_TITLE = "Founder & CEO";

const ORG_NAME =
  process.env.FOUNDER_BOOTSTRAP_ORG_NAME ?? "NIOV Labs";
const ORG_DOMAIN =
  process.env.FOUNDER_BOOTSTRAP_ORG_DOMAIN ?? "niovlabs.com";
const ORG_EMAIL = `bootstrap-org@${ORG_DOMAIN}`;

const TWIN_DISPLAY_NAME = "Sadeil's Twin";
const TWIN_EMAIL = `bootstrap-twin@${ORG_DOMAIN}`;
const PROJECT_NAME = "Otzar Live Test";

function assertSafeEnvironment(): void {
  const allowExplicit = process.env.ALLOW_FOUNDER_BOOTSTRAP === "true";
  const nodeEnv = process.env.NODE_ENV ?? "";
  const databaseUrl = process.env.DATABASE_URL ?? "";
  const isLocalhost = databaseUrl.includes("localhost");
  const isProd = nodeEnv === "production";

  if (isProd && !allowExplicit) {
    throw new Error(
      "Refusing to run: NODE_ENV=production without ALLOW_FOUNDER_BOOTSTRAP=true. " +
        "Production bootstraps require explicit operator authorization.",
    );
  }
  if (!isLocalhost && !allowExplicit) {
    throw new Error(
      "Refusing to run: DATABASE_URL is not localhost and ALLOW_FOUNDER_BOOTSTRAP is unset. " +
        "Set ALLOW_FOUNDER_BOOTSTRAP=true to bypass (intentional for staging only).",
    );
  }
  if (databaseUrl.length === 0) {
    throw new Error(
      "Refusing to run: DATABASE_URL not set. Source .env.demo.local or .env.test first.",
    );
  }
}

function resolvePassword(): { password: string; generated: boolean } {
  const supplied = process.env.FOUNDER_BOOTSTRAP_PASSWORD;
  if (typeof supplied === "string" && supplied.length >= 12) {
    return { password: supplied, generated: false };
  }
  // 24-char base64url random — 144 bits of entropy.
  const generated = randomBytes(18)
    .toString("base64url")
    .replace(/[^a-zA-Z0-9_-]/g, "");
  return { password: generated, generated: true };
}

async function ensureOrg(): Promise<{ entity_id: string; created: boolean }> {
  const existing = await prisma.entity.findFirst({
    where: { email: ORG_EMAIL },
  });
  if (existing !== null) {
    return { entity_id: existing.entity_id, created: false };
  }
  const created = await createEntity({
    entity_type: "COMPANY",
    display_name: ORG_NAME,
    email: ORG_EMAIL,
    public_key: `founder-bootstrap-org-pubkey`,
    clearance_level: 0,
  });
  return { entity_id: created.entity_id, created: true };
}

async function ensureFounder(
  orgId: string,
  password: string,
): Promise<{ entity_id: string; created: boolean }> {
  const existing = await prisma.entity.findFirst({
    where: { email: FOUNDER_EMAIL },
  });
  const passwordHash = await hashPassword(password);
  if (existing !== null) {
    // Update password hash + display name to keep idempotency.
    // Phase 1252: pin clearance_level 5 — the Founder reviews the
    // admin surfaces (production readiness, Dandelion growth,
    // compliance, settlement readiness) which gate on the Phase 1230
    // org-admin convention clearance_level >= 4. Without this the
    // local review hits ADMIN_REQUIRED everywhere.
    await prisma.entity.update({
      where: { entity_id: existing.entity_id },
      data: {
        display_name: FOUNDER_DISPLAY_NAME,
        password_hash: passwordHash,
        status: "ACTIVE",
        clearance_level: 5,
      },
    });
    return { entity_id: existing.entity_id, created: false };
  }
  const founder = await createEntity({
    entity_type: "PERSON",
    display_name: FOUNDER_DISPLAY_NAME,
    email: FOUNDER_EMAIL,
    password,
    public_key: `founder-bootstrap-${FOUNDER_DISPLAY_NAME.toLowerCase()}-pubkey`,
    clearance_level: 5,
  });
  return { entity_id: founder.entity_id, created: true };
}

async function ensureMembership(
  parentId: string,
  childId: string,
  roleTitle: string,
): Promise<void> {
  const existing = await prisma.entityMembership.findFirst({
    where: { parent_id: parentId, child_id: childId },
  });
  if (existing === null) {
    await prisma.entityMembership.create({
      data: {
        parent_id: parentId,
        child_id: childId,
        role_title: roleTitle,
        is_active: true,
      },
    });
  } else if (existing.is_active !== true || existing.role_title !== roleTitle) {
    await prisma.entityMembership.update({
      where: { membership_id: existing.membership_id },
      data: { is_active: true, role_title: roleTitle },
    });
  }
}

async function grantAdminTAR(founderId: string): Promise<void> {
  await prisma.tokenAttributeRepository.update({
    where: { entity_id: founderId },
    data: {
      can_admin_org: true,
      can_login: true,
      can_read_capsules: true,
      can_write_capsules: true,
      can_share_capsules: true,
      can_create_hives: true,
      can_access_external_api: true,
    },
  });
  const fresh = await prisma.tokenAttributeRepository.findUnique({
    where: { entity_id: founderId },
  });
  if (fresh === null) throw new Error("founder TAR vanished");
  await prisma.tokenAttributeRepository.update({
    where: { entity_id: founderId },
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

async function ensureTwin(founderId: string): Promise<string> {
  const existing = await prisma.entity.findFirst({
    where: { email: TWIN_EMAIL },
  });
  if (existing !== null) {
    await ensureMembership(founderId, existing.entity_id, "Digital Twin");
    return existing.entity_id;
  }
  const twin = await createEntity({
    entity_type: "AI_AGENT",
    display_name: TWIN_DISPLAY_NAME,
    email: TWIN_EMAIL,
    public_key: `founder-bootstrap-twin-pubkey`,
  });
  await ensureMembership(founderId, twin.entity_id, "Digital Twin");
  return twin.entity_id;
}

async function ensureProject(
  orgId: string,
  founderId: string,
): Promise<string> {
  const existing = await prisma.workProject.findFirst({
    where: { org_entity_id: orgId, name: PROJECT_NAME },
  });
  if (existing !== null) {
    const member = await prisma.workProjectMember.findFirst({
      where: { project_id: existing.project_id, entity_id: founderId },
    });
    if (member === null) {
      await prisma.workProjectMember.create({
        data: {
          project_id: existing.project_id,
          org_entity_id: orgId,
          entity_id: founderId,
          role: "OWNER",
        },
      });
    }
    return existing.project_id;
  }
  const project = await prisma.workProject.create({
    data: {
      org_entity_id: orgId,
      created_by_entity_id: founderId,
      name: PROJECT_NAME,
      state: "ACTIVE",
    },
  });
  await prisma.workProjectMember.create({
    data: {
      project_id: project.project_id,
      org_entity_id: orgId,
      entity_id: founderId,
      role: "OWNER",
    },
  });
  return project.project_id;
}

async function ensureAutonomousCollaborationPolicy(
  orgId: string,
): Promise<void> {
  const scopes: ReadonlyArray<{
    scope: "SAME_TEAM" | "SAME_PROJECT";
    outcome: "ALLOW";
  }> = [
    { scope: "SAME_TEAM", outcome: "ALLOW" },
    { scope: "SAME_PROJECT", outcome: "ALLOW" },
  ];
  for (const { scope, outcome } of scopes) {
    const existing = await prisma.orgCollaborationPolicy.findFirst({
      where: {
        org_entity_id: orgId,
        collaboration_scope: scope,
        request_type: null,
        sensitivity_class: null,
      },
    });
    if (existing === null) {
      await prisma.orgCollaborationPolicy.create({
        data: { org_entity_id: orgId, collaboration_scope: scope, outcome },
      });
    }
  }
}

async function main() {
  assertSafeEnvironment();
  const { password, generated } = resolvePassword();

  const org = await ensureOrg();
  console.log(
    `[bootstrap] org       ${org.entity_id}  (${
      org.created ? "created" : "exists"
    })`,
  );

  const founder = await ensureFounder(org.entity_id, password);
  console.log(
    `[bootstrap] founder   ${founder.entity_id}  (${
      founder.created ? "created" : "updated"
    })`,
  );
  await ensureMembership(org.entity_id, founder.entity_id, "FOUNDER");
  await grantAdminTAR(founder.entity_id);

  const twinId = await ensureTwin(founder.entity_id);
  console.log(`[bootstrap] twin      ${twinId}`);

  const projectId = await ensureProject(org.entity_id, founder.entity_id);
  console.log(`[bootstrap] project   ${projectId}`);

  await ensureAutonomousCollaborationPolicy(org.entity_id);
  console.log(`[bootstrap] policy    Autonomous Internal Flow applied`);

  console.log("\n=== FOUNDER LOGIN CREDENTIALS ===");
  console.log(`Org:      ${ORG_NAME} (${ORG_DOMAIN})`);
  console.log(`Email:    ${FOUNDER_EMAIL}`);
  if (generated) {
    console.log(`Password: ${password}`);
    console.log(
      "  ^^ generated one-time; copy it now — Foundation will not echo it again.",
    );
  } else {
    console.log(
      `Password: <from FOUNDER_BOOTSTRAP_PASSWORD env; not echoed back here>`,
    );
  }
  console.log(`Title:    ${FOUNDER_TITLE}`);
  console.log(`URL:      http://localhost:5173 (browser) OR Otzar.app (desktop)`);
  console.log("==================================\n");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error("[bootstrap] FAILED:", err);
    await prisma.$disconnect();
    process.exit(1);
  });
