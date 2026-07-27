// FILE: reconcile-demo-titles.job.mjs
// PURPOSE: Production one-off — set Annie + William membership role_title
//          strings only. NO authority / TAR / hierarchy / is_admin changes.
// FOUNDER AUTHORIZATION: titles only (2026-07-27).
//   Annie  → Senior Engineer and Researcher
//   William → CPO
// USAGE via submit-render-job.mjs with TITLE_RECONCILE_MODE=apply and
//   NIOV_APPROVE_TITLE_RECONCILE='APPROVE DEMO TITLE RECONCILE — titles only'

import { PrismaClient } from "@prisma/client";

const APPROVAL_ENV = "NIOV_APPROVE_TITLE_RECONCILE";
const APPROVAL_PHRASE = "APPROVE DEMO TITLE RECONCILE — titles only";
const ORG_EMAIL = "bootstrap-org@niovlabs.com";

const UPDATES = [
  {
    email: "annie@niovlabs.com",
    role_title: "Senior Engineer and Researcher",
  },
  {
    email: "william@niovlabs.com",
    role_title: "CPO",
  },
];

const mode = (process.env.TITLE_RECONCILE_MODE || "dry-run").toLowerCase();
const prisma = new PrismaClient();

async function main() {
  console.log("[title-reconcile] mode=", mode);
  if (mode === "apply") {
    if (process.env[APPROVAL_ENV] !== APPROVAL_PHRASE) {
      console.error("[title-reconcile] REFUSING: approval missing");
      process.exit(1);
    }
  }

  const org = await prisma.entity.findFirst({
    where: { email: ORG_EMAIL, entity_type: "COMPANY", deleted_at: null },
    select: { entity_id: true, display_name: true },
  });
  if (!org) {
    console.error("[title-reconcile] org not found");
    process.exit(1);
  }
  console.log("[title-reconcile] org=", org.display_name);

  for (const u of UPDATES) {
    const person = await prisma.entity.findFirst({
      where: { email: u.email, entity_type: "PERSON", deleted_at: null },
      select: { entity_id: true, display_name: true, email: true },
    });
    if (!person) {
      console.log("[title-reconcile] MISSING person", u.email);
      continue;
    }
    const mem = await prisma.entityMembership.findFirst({
      where: { parent_id: org.entity_id, child_id: person.entity_id },
      select: {
        membership_id: true,
        role_title: true,
        is_active: true,
        is_admin: true,
      },
    });
    if (!mem) {
      console.log("[title-reconcile] MISSING membership", u.email);
      continue;
    }
    console.log(
      "[title-reconcile]",
      u.email.split("@")[0] + "@…",
      "current=",
      mem.role_title,
      "proposed=",
      u.role_title,
      "is_admin=",
      mem.is_admin,
      "is_active=",
      mem.is_active,
    );
    if (mode === "apply" && mem.role_title !== u.role_title) {
      await prisma.entityMembership.update({
        where: { membership_id: mem.membership_id },
        data: { role_title: u.role_title },
      });
      console.log("[title-reconcile] UPDATED role_title only for", u.email.split("@")[0]);
    }
  }
  console.log("[title-reconcile] authority_changes=0");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("[title-reconcile] FAILED", e?.message || e);
  await prisma.$disconnect();
  process.exit(1);
});
