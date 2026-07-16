// FILE: scripts/provision-demo-twins.ts
// PURPOSE: [DGI-COHERENCE] Idempotent Twin pairing for the demo team already
//          provisioned by provision-demo-team-accounts.ts. Each PERSON gets
//          exactly one ACTIVE AI_AGENT Twin child + TwinConfig so conductSession
//          and My Twin work after a greenfield production DB restore.
//
// USAGE:
//   DATABASE_URL=… NIOV_APPROVE_DEMO_TWINS='APPROVE DEMO TWINS — allowlist only' \
//     npx tsx scripts/provision-demo-twins.ts
//
// SECRECY: never prints secrets. Allowlist emails only.

import { prisma, createEntity } from "@niov/database";

const APPROVAL = "APPROVE DEMO TWINS — allowlist only";

const EMAILS = [
  "sadeil@niovlabs.com",
  "david@niovlabs.com",
  "vishesh@niovlabs.com",
  "samiksha@niovlabs.com",
  "shweta@niovlabs.com",
  "william@niovlabs.com",
  "annie@niovlabs.com",
  "walter@niovlabs.com",
] as const;

async function ensureTwinForPerson(person: {
  entity_id: string;
  email: string | null;
  display_name: string | null;
}): Promise<"created" | "exists"> {
  const existing = await prisma.entityMembership.findMany({
    where: { parent_id: person.entity_id, is_active: true },
    select: { child_id: true },
  });
  const twins = await prisma.entity.findMany({
    where: {
      entity_id: { in: existing.map((m) => m.child_id) },
      entity_type: "AI_AGENT",
      deleted_at: null,
    },
  });
  if (twins.length >= 1) {
    // Ensure TwinConfig exists for primary
    const primary = twins.sort((a, b) =>
      a.created_at.getTime() - b.created_at.getTime() || a.entity_id.localeCompare(b.entity_id),
    )[0]!;
    const cfg = await prisma.twinConfig.findUnique({ where: { twin_id: primary.entity_id } });
    if (cfg === null) {
      await prisma.twinConfig.create({
        data: {
          twin_id: primary.entity_id,
          autonomy_level: "APPROVAL_REQUIRED",
          is_admin_twin: person.email === "sadeil@niovlabs.com",
          role_template: null,
        },
      });
    }
    return "exists";
  }

  const local = (person.email ?? "user").split("@")[0] ?? "user";
  const twin = await createEntity({
    entity_type: "AI_AGENT",
    display_name: `${person.display_name ?? local}'s Twin`,
    email: `twin-${local}@niovlabs.com`,
    public_key: `demo-twin-${person.entity_id}-pubkey`,
  });
  await prisma.entityMembership.create({
    data: {
      parent_id: person.entity_id,
      child_id: twin.entity_id,
      role_title: "Digital Twin",
      is_active: true,
    },
  });
  await prisma.twinConfig.create({
    data: {
      twin_id: twin.entity_id,
      autonomy_level: "APPROVAL_REQUIRED",
      is_admin_twin: person.email === "sadeil@niovlabs.com",
      role_template: null,
    },
  });
  return "created";
}

async function main(): Promise<void> {
  if (process.env.NIOV_APPROVE_DEMO_TWINS !== APPROVAL) {
    console.error(
      `[provision-twins] REFUSING: set NIOV_APPROVE_DEMO_TWINS='${APPROVAL}'`,
    );
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error("[provision-twins] REFUSING: DATABASE_URL required");
    process.exit(1);
  }

  console.log("[provision-twins] pairing Twins for allowlisted demo people…");
  for (const email of EMAILS) {
    const person = await prisma.entity.findFirst({
      where: { email, entity_type: "PERSON" },
      select: { entity_id: true, email: true, display_name: true },
    });
    if (person === null) {
      console.log(`  SKIP ${email} — person not found (run provision-demo-team-accounts first)`);
      continue;
    }
    const result = await ensureTwinForPerson(person);
    console.log(`  ${result.padEnd(7)} ${email}`);
  }
  console.log("[provision-twins] done");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
