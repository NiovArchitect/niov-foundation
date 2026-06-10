// FILE: demo-team-seed.ts
// PURPOSE: Local/staging seed of the NIOV team + their Twins + the
//          three demo projects + cross-team project membership +
//          a default Autonomous-Internal-Flow collaboration policy.
//          Runs in addition to scripts/founder-bootstrap.ts (which
//          provisions Sadeil himself + the NIOV Labs org); this
//          script depends on the org + Sadeil already existing.
//
// USAGE:
//   set -a; . ./.env.demo.local; set +a; \
//     FOUNDER_BOOTSTRAP_PASSWORD=LocalTest-SafePassword-123! \
//     npx tsx scripts/founder-bootstrap.ts
//   set -a; . ./.env.demo.local; set +a; \
//     DEMO_TEAM_PASSWORD=LocalTest-SafePassword-123! \
//     npx tsx scripts/demo-team-seed.ts
//
// SAFETY:
//   - Refuses to run unless ALLOW_DEMO_SEED=true OR NODE_ENV !=
//     production OR DATABASE_URL points at localhost.
//   - Each teammate's password defaults to LocalTest-SafePassword-123!
//     when DEMO_TEAM_PASSWORD is unset; ALL teammates share one
//     local-only password so the Founder can switch users with one
//     paste. Production deployments would never run this script.
//   - Idempotent: re-running updates display_name + tar + memberships;
//     never duplicates entities, twins, projects, or memberships.

import { prisma, createEntity, computeTARHash } from "@niov/database";
import { hashPassword } from "@niov/auth";

const ORG_EMAIL = "bootstrap-org@niovlabs.com";
const ORG_NAME = "NIOV Labs";

const DEFAULT_PASSWORD =
  process.env.DEMO_TEAM_PASSWORD ?? "LocalTest-SafePassword-123!";

interface Teammate {
  email: string;
  displayName: string;
  title: string;
  twinEmail: string;
  twinDisplayName: string;
  twinDescription: string;
  // Tag the projects this person joins as OWNER / MEMBER.
  ownerOfProjects: string[];
  memberOfProjects: string[];
}

const TEAMMATES: ReadonlyArray<Teammate> = [
  {
    email: "david@niovlabs.com",
    displayName: "David Odie",
    title: "Tech Lead",
    twinEmail: "twin-david@niovlabs.com",
    twinDisplayName: "David's Twin",
    twinDescription: "Tech-lead Twin focused on runtime + infra readiness.",
    ownerOfProjects: ["Foundation Runtime Deployment"],
    memberOfProjects: ["Otzar Live Test", "Enterprise Demo Readiness"],
  },
  {
    email: "vishesh@niovlabs.com",
    displayName: "Vishesh Sharma",
    title: "AI UI Engineer",
    twinEmail: "twin-vishesh@niovlabs.com",
    twinDisplayName: "Vishesh's Twin",
    twinDescription: "Frontend / employee-experience Twin.",
    ownerOfProjects: [],
    memberOfProjects: ["Otzar Live Test", "Enterprise Demo Readiness"],
  },
  {
    email: "samiksha@niovlabs.com",
    displayName: "Samiksha Sharma",
    title: "AI/NLP Engineer",
    twinEmail: "twin-samiksha@niovlabs.com",
    twinDisplayName: "Samiksha's Twin",
    twinDescription: "NLP + memory / transcript Twin.",
    ownerOfProjects: [],
    memberOfProjects: ["Otzar Live Test", "Foundation Runtime Deployment"],
  },
  {
    email: "shweta@niovlabs.com",
    displayName: "Shweta",
    title: "Go-to-Market Lead",
    twinEmail: "twin-shweta@niovlabs.com",
    twinDisplayName: "Shweta's Twin",
    twinDescription: "GTM / launch-readiness Twin.",
    ownerOfProjects: [],
    memberOfProjects: ["Enterprise Demo Readiness"],
  },
  {
    email: "william@niovlabs.com",
    displayName: "William",
    title: "Product Lead",
    twinEmail: "twin-william@niovlabs.com",
    twinDisplayName: "William's Twin",
    twinDescription: "Product / scope-and-priority Twin.",
    ownerOfProjects: ["Enterprise Demo Readiness"],
    memberOfProjects: ["Otzar Live Test"],
  },
  {
    email: "annie@niovlabs.com",
    displayName: "Annie",
    title: "Risk & Compliance Lead",
    twinEmail: "twin-annie@niovlabs.com",
    twinDisplayName: "Annie's Twin",
    twinDescription: "Risk / approval / compliance review Twin.",
    ownerOfProjects: [],
    memberOfProjects: ["Enterprise Demo Readiness"],
  },
  {
    email: "walter@niovlabs.com",
    displayName: "Walter",
    title: "Media Lead",
    twinEmail: "twin-walter@niovlabs.com",
    twinDisplayName: "Walter's Twin",
    twinDescription: "Media / external messaging Twin.",
    ownerOfProjects: [],
    memberOfProjects: ["Enterprise Demo Readiness"],
  },
];

const PROJECTS: ReadonlyArray<string> = [
  "Otzar Live Test",
  "Foundation Runtime Deployment",
  "Enterprise Demo Readiness",
];

function assertSafeEnvironment(): void {
  const allowExplicit = process.env.ALLOW_DEMO_SEED === "true";
  const nodeEnv = process.env.NODE_ENV ?? "";
  const databaseUrl = process.env.DATABASE_URL ?? "";
  const isLocalhost = databaseUrl.includes("localhost");
  const isProd = nodeEnv === "production";
  if (isProd && !allowExplicit) {
    throw new Error(
      "Refusing to run: NODE_ENV=production without ALLOW_DEMO_SEED=true.",
    );
  }
  if (!isLocalhost && !allowExplicit) {
    throw new Error(
      "Refusing to run: DATABASE_URL is not localhost and ALLOW_DEMO_SEED is unset.",
    );
  }
}

async function findOrgIdOrThrow(): Promise<string> {
  const org = await prisma.entity.findFirst({ where: { email: ORG_EMAIL } });
  if (org === null) {
    throw new Error(
      `${ORG_NAME} org not found (email=${ORG_EMAIL}). Run scripts/founder-bootstrap.ts first.`,
    );
  }
  return org.entity_id;
}

async function findFounderOrThrow(): Promise<string> {
  const founder = await prisma.entity.findFirst({
    where: { email: "sadeil@niovlabs.com" },
  });
  if (founder === null) {
    throw new Error(
      "Founder Sadeil not found. Run scripts/founder-bootstrap.ts first.",
    );
  }
  return founder.entity_id;
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

async function rebuildTar(entityId: string): Promise<void> {
  const fresh = await prisma.tokenAttributeRepository.findUnique({
    where: { entity_id: entityId },
  });
  if (fresh === null) throw new Error(`TAR missing for ${entityId}`);
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

async function ensurePersonEntity(
  email: string,
  displayName: string,
  password: string,
): Promise<{ entity_id: string; created: boolean }> {
  const existing = await prisma.entity.findFirst({ where: { email } });
  const passwordHash = await hashPassword(password);
  if (existing !== null) {
    await prisma.entity.update({
      where: { entity_id: existing.entity_id },
      data: {
        display_name: displayName,
        password_hash: passwordHash,
        status: "ACTIVE",
      },
    });
    return { entity_id: existing.entity_id, created: false };
  }
  const created = await createEntity({
    entity_type: "PERSON",
    display_name: displayName,
    email,
    password,
    public_key: `demo-team-${email}-pubkey`,
  });
  return { entity_id: created.entity_id, created: true };
}

async function ensureTwinEntity(
  email: string,
  displayName: string,
): Promise<string> {
  const existing = await prisma.entity.findFirst({ where: { email } });
  if (existing !== null) return existing.entity_id;
  const twin = await createEntity({
    entity_type: "AI_AGENT",
    display_name: displayName,
    email,
    public_key: `demo-team-${email}-pubkey`,
  });
  return twin.entity_id;
}

async function ensureGrantBaseTar(entityId: string): Promise<void> {
  // Employees get the standard read/write capsule capabilities; no
  // admin flags (the org-admin / founder gate stays only on Sadeil).
  await prisma.tokenAttributeRepository.update({
    where: { entity_id: entityId },
    data: {
      can_login: true,
      can_read_capsules: true,
      can_write_capsules: true,
      can_share_capsules: true,
    },
  });
  await rebuildTar(entityId);
}

async function ensureProject(
  orgId: string,
  founderId: string,
  name: string,
): Promise<string> {
  const existing = await prisma.workProject.findFirst({
    where: { org_entity_id: orgId, name },
  });
  if (existing !== null) return existing.project_id;
  const project = await prisma.workProject.create({
    data: {
      org_entity_id: orgId,
      created_by_entity_id: founderId,
      name,
      state: "ACTIVE",
    },
  });
  // Sadeil is the universal owner across the demo projects so he
  // always sees them in his /app/work-projects view.
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

async function ensureProjectMembership(
  projectId: string,
  orgId: string,
  entityId: string,
  role: "OWNER" | "MEMBER",
): Promise<void> {
  const existing = await prisma.workProjectMember.findFirst({
    where: { project_id: projectId, entity_id: entityId },
  });
  if (existing === null) {
    await prisma.workProjectMember.create({
      data: {
        project_id: projectId,
        org_entity_id: orgId,
        entity_id: entityId,
        role,
      },
    });
  } else if (existing.role !== role) {
    await prisma.workProjectMember.update({
      where: { project_member_id: existing.project_member_id },
      data: { role },
    });
  }
}

async function main() {
  assertSafeEnvironment();

  const orgId = await findOrgIdOrThrow();
  const founderId = await findFounderOrThrow();

  // Ensure all three demo projects exist (Sadeil is OWNER on each).
  const projectIds: Record<string, string> = {};
  for (const name of PROJECTS) {
    projectIds[name] = await ensureProject(orgId, founderId, name);
  }

  const seeded: Array<{
    role: string;
    email: string;
    entity_id: string;
    twin_id: string;
    created: boolean;
  }> = [];

  for (const t of TEAMMATES) {
    const person = await ensurePersonEntity(
      t.email,
      t.displayName,
      DEFAULT_PASSWORD,
    );
    await ensureMembership(orgId, person.entity_id, t.title.toUpperCase());
    await ensureGrantBaseTar(person.entity_id);
    const twinId = await ensureTwinEntity(t.twinEmail, t.twinDisplayName);
    await ensureMembership(person.entity_id, twinId, "Digital Twin");
    for (const name of t.ownerOfProjects) {
      const projectId = projectIds[name];
      if (projectId === undefined) continue;
      await ensureProjectMembership(projectId, orgId, person.entity_id, "OWNER");
    }
    for (const name of t.memberOfProjects) {
      const projectId = projectIds[name];
      if (projectId === undefined) continue;
      await ensureProjectMembership(projectId, orgId, person.entity_id, "MEMBER");
    }
    seeded.push({
      role: t.title,
      email: t.email,
      entity_id: person.entity_id,
      twin_id: twinId,
      created: person.created,
    });
  }

  // ─────────────────────────────────────────────────────────────────
  // Phase 1209 -- roster-aware internal note auto-approval policy.
  // Inserts ONE ActionPolicy row for the NIOV demo org:
  //   (action_type=SEND_INTERNAL_NOTIFICATION, risk_tier=LOW,
  //    default_decision=AUTO_APPROVE).
  // This is the smallest governed change that takes the chat-drafted
  // internal note flow from REJECTED (no eligible approver for
  // dual-control) to AUTO_APPROVED + executor fires + recipient
  // Notification row created + David/Annie/Vishesh/Samiksha can
  // see it in /api/v1/notifications.
  //
  // PAIRED CHANGE: OrgSettings.require_human_approval must be FALSE
  // for the NIOV demo org because policy-evaluator.ts Rung 1 (§4.1)
  // short-circuits to REQUIRE_DUAL_CONTROL whenever
  // require_human_approval=true, BEFORE the per-(action_type,risk_tier)
  // ActionPolicy row is consulted. With require_human_approval=false,
  // governance is NOT weakened -- every action_type WITHOUT an
  // explicit ActionPolicy.AUTO_APPROVE row still defaults to
  // REQUIRE_DUAL_CONTROL via Rung 4 (§4.4)
  // APPROVAL_REQUIRED_DEFAULT_DUAL_CONTROL. The ActionPolicy table
  // becomes the explicit safe-list.
  //
  // SCOPE:
  //   - Affects ONLY SEND_INTERNAL_NOTIFICATION + LOW for this org.
  //   - Other action_types + risk_tiers retain Foundation safe
  //     defaults (REQUIRE_DUAL_CONTROL).
  //   - No external connectors enabled; INVOKE_CONNECTOR remains
  //     gated. PROPOSE_PERMISSION_GRANT remains gated. RECORD_CAPSULE
  //     remains gated.
  //   - Idempotent: upsert on the unique
  //     (org, action_type, risk_tier) key.
  //   - updated_by = Sadeil (founder identity).
  await prisma.orgSettings.upsert({
    where: { org_entity_id: orgId },
    create: {
      org_entity_id: orgId,
      require_human_approval: false,
      auto_approve_low_risk: true,
      audit_ai_actions: true,
    },
    update: {
      require_human_approval: false,
      auto_approve_low_risk: true,
      // audit_ai_actions left at its prior value -- we never weaken audit.
    },
  });
  await prisma.actionPolicy.upsert({
    where: {
      org_entity_id_action_type_risk_tier: {
        org_entity_id: orgId,
        action_type: "SEND_INTERNAL_NOTIFICATION",
        risk_tier: "LOW",
      },
    },
    create: {
      org_entity_id: orgId,
      action_type: "SEND_INTERNAL_NOTIFICATION",
      risk_tier: "LOW",
      default_decision: "AUTO_APPROVE",
      require_admin_capability: null,
      updated_by: founderId,
    },
    update: {
      default_decision: "AUTO_APPROVE",
      require_admin_capability: null,
      updated_by: founderId,
    },
  });

  console.log("\n=== NIOV TEAM DEMO SEED ===");
  console.log(`Org:                ${ORG_NAME}`);
  console.log(`Founder:            sadeil@niovlabs.com (must already exist)`);
  console.log(`Demo password:      ${DEFAULT_PASSWORD}`);
  console.log(`Action policies seeded:`);
  console.log(`  - SEND_INTERNAL_NOTIFICATION + LOW → AUTO_APPROVE`);
  console.log(`Projects (${PROJECTS.length}):`);
  for (const name of PROJECTS) {
    console.log(`  - ${name}    ${projectIds[name]}`);
  }
  console.log(`Teammates (${seeded.length}):`);
  for (const t of seeded) {
    console.log(
      `  - ${t.email.padEnd(28)} ${t.role.padEnd(24)} ${
        t.created ? "created" : "updated"
      }   entity=${t.entity_id} twin=${t.twin_id}`,
    );
  }
  console.log("============================\n");
  console.log(
    "All teammates share the same local-only password so you can switch users",
  );
  console.log("via the Login page picker without re-running the seed.\n");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error("[team-seed] FAILED:", err);
    await prisma.$disconnect();
    process.exit(1);
  });
