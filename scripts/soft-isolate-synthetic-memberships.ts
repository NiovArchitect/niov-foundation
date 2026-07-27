// FILE: soft-isolate-synthetic-memberships.ts
// PURPOSE: Reversible soft-isolation of synthetic RC2/pressure PERSON
//          memberships (is_active=false). Does NOT delete entities
//          (RULE 10). Requires dual env approval for real mutation.
// USAGE:
//   set -a; . ./.env; set +a
//   npx tsx scripts/soft-isolate-synthetic-memberships.ts --dry-run
//   NIOV_APPROVE_SOFT_ISOLATE_SYNTHETICS='APPROVE SOFT ISOLATE SYNTHETICS' \
//     npx tsx scripts/soft-isolate-synthetic-memberships.ts --apply
// CONNECTS TO: synthetic-principal.ts, EntityMembership.is_active

import { prisma } from "@niov/database";
import { isSyntheticPrincipal } from "../apps/api/src/services/otzar/synthetic-principal.js";

const APPROVAL_ENV = "NIOV_APPROVE_SOFT_ISOLATE_SYNTHETICS";
const APPROVAL_PHRASE = "APPROVE SOFT ISOLATE SYNTHETICS";

function redactDb(raw: string | undefined): string {
  if (!raw) return "<unset>";
  try {
    const u = new URL(raw);
    return `${u.protocol}//<redacted>@${u.hostname}:${u.port || "5432"}${u.pathname}`;
  } catch {
    return "<redacted>";
  }
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const dry = !apply || process.argv.includes("--dry-run");
  console.log("[soft-isolate] db=", redactDb(process.env.DATABASE_URL));
  console.log("[soft-isolate] mode=", dry ? "DRY-RUN" : "APPLY");

  if (!dry) {
    if (process.env[APPROVAL_ENV] !== APPROVAL_PHRASE) {
      console.error(
        `[soft-isolate] REFUSING: set ${APPROVAL_ENV}='${APPROVAL_PHRASE}' for --apply`,
      );
      process.exit(1);
    }
  }

  const people = await prisma.entity.findMany({
    where: { entity_type: "PERSON", deleted_at: null },
    select: {
      entity_id: true,
      email: true,
      display_name: true,
      status: true,
    },
    take: 2000,
  });

  const synthetic = people.filter((p) =>
    isSyntheticPrincipal({ email: p.email, display_name: p.display_name }),
  );
  console.log("[soft-isolate] person entities scanned=", people.length);
  console.log("[soft-isolate] synthetic principals matched=", synthetic.length);

  for (const p of synthetic.slice(0, 50)) {
    console.log(
      `  - ${p.email ?? "(no email)"} | ${p.display_name ?? ""} | ${p.entity_id.slice(0, 8)}… | status=${p.status}`,
    );
  }
  if (synthetic.length > 50) console.log(`  … +${synthetic.length - 50} more`);

  const ids = synthetic.map((p) => p.entity_id);
  if (ids.length === 0) {
    console.log("[soft-isolate] nothing to isolate");
    await prisma.$disconnect();
    return;
  }

  const activeMemberships = await prisma.entityMembership.findMany({
    where: { child_id: { in: ids }, is_active: true },
    select: {
      membership_id: true,
      parent_id: true,
      child_id: true,
      role_title: true,
    },
  });
  console.log(
    "[soft-isolate] active memberships to deactivate=",
    activeMemberships.length,
  );

  if (dry) {
    console.log("[soft-isolate] DRY-RUN complete — no writes");
    await prisma.$disconnect();
    return;
  }

  const result = await prisma.entityMembership.updateMany({
    where: { child_id: { in: ids }, is_active: true },
    data: { is_active: false },
  });
  console.log("[soft-isolate] memberships deactivated=", result.count);
  console.log(
    "[soft-isolate] reverse: set is_active=true for these child_ids if needed",
  );
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("[soft-isolate] FAILED", e);
  await prisma.$disconnect();
  process.exit(1);
});
