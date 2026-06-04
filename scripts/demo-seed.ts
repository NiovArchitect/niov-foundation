// FILE: demo-seed.ts
// PURPOSE: One-shot demo seeder for the local visual desktop run.
//          Creates a COMPANY + an admin PERSON + an employee PERSON
//          + an AI_AGENT Twin attached to the employee + a project +
//          a no-op org collaboration policy row. Outputs the admin +
//          employee login credentials so the Founder can log in via
//          the Control Tower.
//
// USAGE:
//   set -a; . ./.env.demo.local; set +a; npx tsx scripts/demo-seed.ts
//
// Idempotent: re-running drops existing entities tagged with the
// "DEMO-2026-06-04" prefix before recreating.
//
// Per RULE 0: this script is local-dev-only — production env target
// is refused fail-closed.

import { prisma, createEntity, computeTARHash } from "@niov/database";

const PREFIX = "DEMO-2026-06-04-";
const ADMIN_EMAIL = `${PREFIX}admin@niov.demo`;
const EMPLOYEE_EMAIL = `${PREFIX}employee@niov.demo`;
const PASSWORD = "demo-password-123";

async function main() {
  if (
    !process.env.DATABASE_URL ||
    !process.env.DATABASE_URL.includes("localhost")
  ) {
    throw new Error(
      "Refusing to run: DATABASE_URL must point at localhost (got: " +
        (process.env.DATABASE_URL?.slice(0, 30) ?? "<unset>") +
        "). Source .env.demo.local before running.",
    );
  }

  // Idempotency: nuke prior demo rows.
  const oldEntities = await prisma.entity.findMany({
    where: { email: { startsWith: PREFIX } },
    select: { entity_id: true },
  });
  if (oldEntities.length > 0) {
    const ids = oldEntities.map((e) => e.entity_id);
    await prisma.entityMembership.deleteMany({
      where: {
        OR: [{ parent_id: { in: ids } }, { child_id: { in: ids } }],
      },
    });
    await prisma.tokenAttributeRepository.deleteMany({
      where: { entity_id: { in: ids } },
    });
    await prisma.wallet.deleteMany({ where: { entity_id: { in: ids } } });
    await prisma.workProject.deleteMany({
      where: { org_entity_id: { in: ids } },
    });
    await prisma.entity.deleteMany({ where: { entity_id: { in: ids } } });
    console.log(`[seed] dropped ${oldEntities.length} prior demo entities`);
  }

  // 1. COMPANY
  const org = await createEntity({
    entity_type: "COMPANY",
    display_name: `${PREFIX}Acme Otzar Demo Co.`,
    email: `${PREFIX}org@niov.demo`,
    public_key: `demo-org-pubkey`,
    clearance_level: 0,
  });
  console.log(`[seed] org           ${org.entity_id}`);

  // 2. Admin PERSON
  const admin = await createEntity({
    entity_type: "PERSON",
    display_name: `${PREFIX}Admin Olivia`,
    email: ADMIN_EMAIL,
    password: PASSWORD,
    public_key: `demo-admin-pubkey`,
  });
  await prisma.entityMembership.create({
    data: {
      parent_id: org.entity_id,
      child_id: admin.entity_id,
      role_title: "ORG_ADMIN",
      is_active: true,
    },
  });
  // Grant admin capabilities.
  await prisma.tokenAttributeRepository.update({
    where: { entity_id: admin.entity_id },
    data: {
      can_admin_org: true,
      can_login: true,
      can_read_capsules: true,
      can_write_capsules: true,
      can_share_capsules: true,
    },
  });
  const adminTar = await prisma.tokenAttributeRepository.findUnique({
    where: { entity_id: admin.entity_id },
  });
  if (!adminTar) throw new Error("admin TAR vanished");
  await prisma.tokenAttributeRepository.update({
    where: { entity_id: admin.entity_id },
    data: {
      tar_hash: computeTARHash({
        can_login: adminTar.can_login,
        can_read_capsules: adminTar.can_read_capsules,
        can_write_capsules: adminTar.can_write_capsules,
        can_share_capsules: adminTar.can_share_capsules,
        can_create_hives: adminTar.can_create_hives,
        can_access_external_api: adminTar.can_access_external_api,
        can_admin_niov: adminTar.can_admin_niov,
        can_admin_org: adminTar.can_admin_org,
        clearance_ceiling: adminTar.clearance_ceiling,
        monetization_role: adminTar.monetization_role,
        compliance_frameworks: adminTar.compliance_frameworks,
        status: adminTar.status,
      }),
    },
  });
  console.log(`[seed] admin         ${admin.entity_id}   ${ADMIN_EMAIL}`);

  // 3. Employee PERSON
  const employee = await createEntity({
    entity_type: "PERSON",
    display_name: `${PREFIX}Employee Eli`,
    email: EMPLOYEE_EMAIL,
    password: PASSWORD,
    public_key: `demo-employee-pubkey`,
  });
  await prisma.entityMembership.create({
    data: {
      parent_id: org.entity_id,
      child_id: employee.entity_id,
      role_title: "MEMBER",
      is_active: true,
    },
  });
  const employeeTar = await prisma.tokenAttributeRepository.findUnique({
    where: { entity_id: employee.entity_id },
  });
  if (!employeeTar) throw new Error("employee TAR vanished");
  await prisma.tokenAttributeRepository.update({
    where: { entity_id: employee.entity_id },
    data: {
      tar_hash: computeTARHash({
        can_login: employeeTar.can_login,
        can_read_capsules: employeeTar.can_read_capsules,
        can_write_capsules: employeeTar.can_write_capsules,
        can_share_capsules: employeeTar.can_share_capsules,
        can_create_hives: employeeTar.can_create_hives,
        can_access_external_api: employeeTar.can_access_external_api,
        can_admin_niov: employeeTar.can_admin_niov,
        can_admin_org: employeeTar.can_admin_org,
        clearance_ceiling: employeeTar.clearance_ceiling,
        monetization_role: employeeTar.monetization_role,
        compliance_frameworks: employeeTar.compliance_frameworks,
        status: employeeTar.status,
      }),
    },
  });
  console.log(
    `[seed] employee      ${employee.entity_id}   ${EMPLOYEE_EMAIL}`,
  );

  // 4. AI_AGENT Twin attached to the employee
  const twin = await createEntity({
    entity_type: "AI_AGENT",
    display_name: `${PREFIX}Eli's Twin`,
    email: `${PREFIX}twin@niov.demo`,
    public_key: `demo-twin-pubkey`,
  });
  await prisma.entityMembership.create({
    data: {
      parent_id: employee.entity_id,
      child_id: twin.entity_id,
      role_title: "Digital Twin",
      is_active: true,
    },
  });
  console.log(`[seed] employee twin ${twin.entity_id}`);

  // 5. Work project (employee is the owner)
  const project = await prisma.workProject.create({
    data: {
      org_entity_id: org.entity_id,
      created_by_entity_id: employee.entity_id,
      name: `${PREFIX}Phoenix launch`,
      state: "ACTIVE",
    },
  });
  await prisma.workProjectMember.create({
    data: {
      project_id: project.project_id,
      org_entity_id: org.entity_id,
      entity_id: employee.entity_id,
      role: "OWNER",
    },
  });
  console.log(`[seed] project       ${project.project_id}`);

  // 6. Org collaboration policy — "Autonomous internal flow" preset
  // (SAME_TEAM / SAME_PROJECT default to ALLOW for low-risk collaborations).
  // We just create — prior demo-seed rows were already dropped above.
  await prisma.orgCollaborationPolicy.create({
    data: {
      org_entity_id: org.entity_id,
      collaboration_scope: "SAME_TEAM",
      outcome: "ALLOW",
    },
  });
  await prisma.orgCollaborationPolicy.create({
    data: {
      org_entity_id: org.entity_id,
      collaboration_scope: "SAME_PROJECT",
      outcome: "ALLOW",
    },
  });

  console.log("\n=== DEMO LOGIN CREDENTIALS ===");
  console.log(`Admin    email:    ${ADMIN_EMAIL}`);
  console.log(`Admin    password: ${PASSWORD}`);
  console.log(`Employee email:    ${EMPLOYEE_EMAIL}`);
  console.log(`Employee password: ${PASSWORD}`);
  console.log("===============================\n");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error("[seed] FAILED:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
