// FILE: heliogrid-demo-reset-seed.ts
// PURPOSE: Slice 6 — deterministic, reversible HelioGrid fictional demo
//          reset + seed for LOCAL databases only. Creates personas, project,
//          transcript-backed work with server work-contract titles, and one
//          auto-clarify case. Idempotent by DEMO prefix. Never production.
//
// USAGE:
//   set -a; . ./.env.demo.local; set +a
//   npx tsx scripts/heliogrid-demo-reset-seed.ts --reset
//   npx tsx scripts/heliogrid-demo-reset-seed.ts --reset   # run 2: no dups
//
// SAFETY: Refuses unless DATABASE_URL includes localhost (or 127.0.0.1).

import { prisma, createEntity, computeTARHash } from "@niov/database";
import { createLedgerEntry } from "../apps/api/src/services/work-os/work-ledger.service.js";
import { autoClarifyRoutineAmbiguity } from "../apps/api/src/services/work-os/auto-clarify.js";
import { enforceWorkContract } from "../apps/api/src/services/work-os/work-contract.js";

const PREFIX = "HELIOgrid-DEMO-2026-07-";
const PASSWORD = "heliogrid-demo-local-only";

const PERSONAS = [
  { key: "morgan", name: "Morgan Hale", role: "Organization lead", admin: true },
  { key: "ava", name: "Ava Chen", role: "Application review lead", admin: true },
  { key: "jordan", name: "Jordan Reyes", role: "Technical diligence lead", admin: false },
  { key: "casey", name: "Casey Brooks", role: "Security lead", admin: false },
  { key: "riley", name: "Riley Okonkwo", role: "Market lead", admin: false },
  { key: "sam", name: "Sam Patel", role: "Reviewer", admin: false },
  { key: "quinn", name: "Quinn Marsh", role: "Contractor researcher", admin: false },
  { key: "nova", name: "NovaGuard Contact", role: "Vendor", admin: false },
  { key: "north", name: "Northline Ops", role: "Customer design partner", admin: false },
] as const;

function assertLocalDb(): void {
  const url = process.env.DATABASE_URL ?? "";
  if (!url.includes("localhost") && !url.includes("127.0.0.1")) {
    throw new Error(
      "Refusing HelioGrid seed: DATABASE_URL must be localhost (got " +
        (url ? url.slice(0, 40) + "…" : "<unset>") +
        "). Source .env.demo.local first.",
    );
  }
}

async function grantAdmin(entityId: string): Promise<void> {
  await prisma.tokenAttributeRepository.update({
    where: { entity_id: entityId },
    data: {
      can_admin_org: true,
      can_login: true,
      can_read_capsules: true,
      can_write_capsules: true,
      can_share_capsules: true,
    },
  });
  const tar = await prisma.tokenAttributeRepository.findUnique({
    where: { entity_id: entityId },
  });
  if (!tar) return;
  await prisma.tokenAttributeRepository.update({
    where: { entity_id: entityId },
    data: {
      tar_hash: computeTARHash({
        can_login: tar.can_login,
        can_read_capsules: tar.can_read_capsules,
        can_write_capsules: tar.can_write_capsules,
        can_share_capsules: tar.can_share_capsules,
        can_create_hives: tar.can_create_hives,
        can_access_external_api: tar.can_access_external_api,
        can_admin_niov: tar.can_admin_niov,
        can_admin_org: tar.can_admin_org,
        clearance_ceiling: tar.clearance_ceiling,
        monetization_role: tar.monetization_role,
        compliance_frameworks: tar.compliance_frameworks,
        status: tar.status,
      }),
    },
  });
}

async function resetPrior(): Promise<number> {
  const old = await prisma.entity.findMany({
    where: {
      OR: [
        { email: { startsWith: PREFIX.toLowerCase() } },
        { email: { startsWith: PREFIX } },
        { display_name: { startsWith: PREFIX } },
      ],
    },
    select: { entity_id: true },
  });
  if (old.length === 0) return 0;
  const ids = old.map((e) => e.entity_id);
  await prisma.workLedgerEntry.deleteMany({
    where: { org_entity_id: { in: ids } },
  });
  await prisma.workProject.deleteMany({
    where: { org_entity_id: { in: ids } },
  });
  await prisma.entityMembership.deleteMany({
    where: {
      OR: [{ parent_id: { in: ids } }, { child_id: { in: ids } }],
    },
  });
  await prisma.tokenAttributeRepository.deleteMany({
    where: { entity_id: { in: ids } },
  });
  await prisma.wallet.deleteMany({ where: { entity_id: { in: ids } } });
  await prisma.entity.deleteMany({ where: { entity_id: { in: ids } } });
  return old.length;
}

async function main(): Promise<void> {
  assertLocalDb();
  const doReset = process.argv.includes("--reset");
  if (doReset) {
    const n = await resetPrior();
    console.log(`[heliogrid] reset dropped ${n} prior entities`);
  }

  // Contract self-check (no DB): vague demotes; auto-clarify security case.
  const vague = enforceWorkContract({
    title: "Follow up with Casey",
    status: "DETECTED",
    ledger_type: "TASK",
  });
  if (!vague.ok || !vague.demoted) {
    throw new Error("work contract self-check failed: vague should demote");
  }
  const clarified = autoClarifyRoutineAmbiguity({
    raw_phrase: "We should circle back with Casey before moving.",
    known_people: ["Casey"],
    project_subject: "HelioGrid application review (fictional)",
    dependency: "security checklist encryption",
  });
  if (!clarified.clarified || clarified.needs_human) {
    throw new Error("auto-clarify self-check failed");
  }
  console.log("[heliogrid] contract+clarify self-check PASS");

  const org = await createEntity({
    entity_type: "COMPANY",
    display_name: `${PREFIX}HelioGrid Review Org (fictional)`,
    email: `${PREFIX}org@niov.demo`,
    public_key: `${PREFIX}org-pubkey`,
    clearance_level: 0,
  });
  console.log(`[heliogrid] org ${org.entity_id}`);

  const byKey: Record<string, string> = {};
  for (const p of PERSONAS) {
    const email = `${PREFIX}${p.key}@niov.demo`;
    const person = await createEntity({
      entity_type: "PERSON",
      display_name: `${PREFIX}${p.name}`,
      email,
      password: PASSWORD,
      public_key: `${PREFIX}${p.key}-pubkey`,
    });
    byKey[p.key] = person.entity_id;
    await prisma.entityMembership.create({
      data: {
        parent_id: org.entity_id,
        child_id: person.entity_id,
        role_title: p.role,
        is_active: true,
        is_admin: p.admin,
      },
    });
    if (p.admin) await grantAdmin(person.entity_id);
    console.log(`[heliogrid] person ${p.name} ${email}`);
  }

  const project = await prisma.workProject.create({
    data: {
      org_entity_id: org.entity_id,
      name: "HelioGrid application review (fictional)",
      state: "ACTIVE",
      created_by_entity_id: byKey.ava!,
    },
  });
  // Core members on the project for multi-persona scope.
  for (const key of ["morgan", "ava", "jordan", "casey", "riley", "sam"] as const) {
    await prisma.workProjectMember.create({
      data: {
        project_id: project.project_id,
        org_entity_id: org.entity_id,
        entity_id: byKey[key]!,
        role: key === "ava" || key === "morgan" ? "OWNER" : "MEMBER",
      },
    });
  }
  console.log(`[heliogrid] project ${project.project_id}`);

  // Seed work with complete contracts (specific titles — not vague).
  const workSpecs: Array<{
    title: string;
    summary: string;
    owner: string;
    requester: string;
    status?: string;
    next_action?: string;
  }> = [
    {
      title: "Casey: complete remaining security controls before interview invite",
      summary:
        "Security readiness is incomplete. Interview invite depends on encryption review and data-rights approval.",
      owner: "casey",
      requester: "ava",
      status: "DETECTED",
      next_action: "Confirm encryption + data-rights items on the checklist",
    },
    {
      title: "Jordan: attach architecture evidence pack for HelioGrid review",
      summary: "Technical diligence needs the architecture evidence package.",
      owner: "jordan",
      requester: "ava",
      status: "DETECTED",
      next_action: "Upload architecture evidence to the project",
    },
    {
      title: "Riley: verify Northline Ops customer evidence reference",
      summary: "Market evidence needs verification after a correction in the diligence call.",
      owner: "riley",
      requester: "morgan",
      status: "DETECTED",
      next_action: "Confirm urgency claim with Northline Ops",
    },
    {
      title: "Ava: send interview invitation only after security gate is green",
      summary: "One consequential human decision: interview after Casey confirms controls.",
      owner: "ava",
      requester: "morgan",
      status: "BLOCKED",
      next_action: "Wait for Casey security confirmation",
    },
    {
      title: "Quinn: research dependency risk from NovaGuard vendor controls",
      summary: "Contractor research on vendor security dependency.",
      owner: "quinn",
      requester: "casey",
      status: "DETECTED",
      next_action: "Summarize NovaGuard control gaps",
    },
  ];

  let created = 0;
  for (const w of workSpecs) {
    const r = await createLedgerEntry({
      org_entity_id: org.entity_id,
      ledger_type: "TASK",
      source_type: "MEETING",
      title: w.title,
      summary: w.summary,
      status: w.status ?? "DETECTED",
      owner_entity_id: byKey[w.owner],
      requester_entity_id: byKey[w.requester],
      project_id: project.project_id,
      next_action: w.next_action,
      details: {
        demo_seed: "heliogrid_slice6",
        project_subject: "HelioGrid application review (fictional)",
        source_context: "transcript_seed",
        fictional: true,
      },
      evidence: [
        {
          quote: w.summary,
          source: "heliogrid_demo_transcript",
        },
      ],
    });
    if (r.ok === false) throw new Error(`work create failed: ${r.message}`);
    created += 1;
  }

  // Ambiguous phrase → should auto-clarify (vague title path) then store specific title.
  const amb = await createLedgerEntry({
    org_entity_id: org.entity_id,
    ledger_type: "TASK",
    source_type: "MEETING",
    title: "Circle back with Casey",
    summary: undefined,
    status: "DETECTED",
    owner_entity_id: byKey.casey,
    requester_entity_id: byKey.ava,
    project_id: project.project_id,
    details: {
      demo_seed: "heliogrid_slice6",
      project_subject: "HelioGrid application review (fictional)",
      dependency: "security checklist encryption data-rights",
      fictional: true,
    },
  });
  if (amb.ok === false) throw new Error(`ambiguous create failed: ${amb.message}`);
  created += 1;
  console.log(`[heliogrid] ambiguous→clarify title: ${amb.entry.title}`);

  // Duplicate-active check for run 2
  const active = await prisma.workLedgerEntry.findMany({
    where: {
      org_entity_id: org.entity_id,
      status: { notIn: ["CANCELLED", "COMPLETED", "VERIFIED"] },
    },
    select: { title: true },
  });
  const titleCounts = new Map<string, number>();
  for (const row of active) {
    titleCounts.set(row.title, (titleCounts.get(row.title) ?? 0) + 1);
  }
  const dups = [...titleCounts.entries()].filter(([, c]) => c > 1);
  if (dups.length > 0) {
    throw new Error(`DUPLICATE ACTIVE RECORDS: ${JSON.stringify(dups)}`);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        org_entity_id: org.entity_id,
        project_id: project.project_id,
        personas: PERSONAS.length,
        work_created: created,
        duplicate_active: 0,
        password: PASSWORD,
        note: "Fictional HelioGrid — not a real YC applicant. Local DB only.",
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error("[heliogrid] FAIL", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
