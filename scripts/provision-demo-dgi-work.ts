// FILE: scripts/provision-demo-dgi-work.ts
// PURPOSE: [DGI-COHERENCE WAVE-2] Idempotent demo obligations + one open
//          org-truth conflict so the collaborative coherence surface is
//          legible after greenfield DB restore. Safe titles only; no
//          secrets; origin_key-stable for re-runs.
//
// USAGE:
//   DATABASE_URL=… NIOV_APPROVE_DEMO_DGI='APPROVE DEMO DGI WORK — allowlist only' \
//     npx tsx scripts/provision-demo-dgi-work.ts
//
// SECRECY: never prints secrets. Allowlist emails only.

import { prisma, createOrGetObligation } from "@niov/database";

const APPROVAL = "APPROVE DEMO DGI WORK — allowlist only";

const DEMO_TAG = "[DEMO-DGI] ";

const WORK_BY_EMAIL: ReadonlyArray<{
  email: string;
  obligations: ReadonlyArray<{
    origin_suffix: string;
    title: string;
    obligation_type:
      | "ACTION_CONFIRMATION"
      | "FOLLOW_UP"
      | "QUESTION_RESPONSE"
      | "CLARIFICATION";
    priority: "ROUTINE" | "ELEVATED" | "URGENT" | "CRITICAL";
  }>;
}> = [
  {
    email: "sadeil@niovlabs.com",
    obligations: [
      {
        origin_suffix: "founder-ship-dgi-coherence",
        title: `${DEMO_TAG}Ship collaborative DGI coherence to production`,
        obligation_type: "ACTION_CONFIRMATION",
        priority: "URGENT",
      },
      {
        origin_suffix: "founder-review-org-truth",
        title: `${DEMO_TAG}Review open organizational-truth conflicts`,
        obligation_type: "CLARIFICATION",
        priority: "ELEVATED",
      },
    ],
  },
  {
    email: "david@niovlabs.com",
    obligations: [
      {
        origin_suffix: "david-runtime-readiness",
        title: `${DEMO_TAG}Confirm Foundation runtime readiness for live team test`,
        obligation_type: "ACTION_CONFIRMATION",
        priority: "ELEVATED",
      },
    ],
  },
  {
    email: "vishesh@niovlabs.com",
    obligations: [
      {
        origin_suffix: "vishesh-ambient-ux",
        title: `${DEMO_TAG}Polish ambient Today surface for glanceable coherence`,
        obligation_type: "FOLLOW_UP",
        priority: "ELEVATED",
      },
    ],
  },
  {
    email: "samiksha@niovlabs.com",
    obligations: [
      {
        origin_suffix: "samiksha-transcript-actions",
        title: `${DEMO_TAG}Propose next three Twin collaboration actions from transcripts`,
        obligation_type: "QUESTION_RESPONSE",
        priority: "ROUTINE",
      },
    ],
  },
  {
    email: "william@niovlabs.com",
    obligations: [
      {
        origin_suffix: "william-gtm-messaging",
        title: `${DEMO_TAG}Coordinate GTM messaging with product for live test`,
        obligation_type: "ACTION_CONFIRMATION",
        priority: "ELEVATED",
      },
    ],
  },
];

async function findOrgAndTwin(personId: string): Promise<{
  orgId: string | null;
  twinId: string | null;
}> {
  // Prefer membership parent that is an ORGANIZATION.
  const memberships = await prisma.entityMembership.findMany({
    where: { child_id: personId, is_active: true },
    select: { parent_id: true },
  });
  let orgId: string | null = null;
  for (const m of memberships) {
    const parent = await prisma.entity.findUnique({
      where: { entity_id: m.parent_id },
      select: { entity_id: true, entity_type: true },
    });
    if (parent?.entity_type === "ORGANIZATION") {
      orgId = parent.entity_id;
      break;
    }
  }
  // Also check person-as-parent for org (some seeds invert membership)
  if (orgId === null) {
    const asParent = await prisma.entityMembership.findMany({
      where: { parent_id: personId, is_active: true },
      select: { child_id: true },
    });
    // not org — skip
    void asParent;
  }

  // Twin: active AI_AGENT child of person
  const twinLinks = await prisma.entityMembership.findMany({
    where: { parent_id: personId, is_active: true },
    select: { child_id: true },
  });
  const twins = await prisma.entity.findMany({
    where: {
      entity_id: { in: twinLinks.map((t) => t.child_id) },
      entity_type: "AI_AGENT",
      deleted_at: null,
    },
    orderBy: [{ created_at: "asc" }, { entity_id: "asc" }],
  });
  const twinId = twins[0]?.entity_id ?? null;

  // Fallback org resolution via get-style: entity with bootstrap-org email
  if (orgId === null) {
    const bootstrapOrg = await prisma.entity.findFirst({
      where: {
        entity_type: "ORGANIZATION",
        deleted_at: null,
        OR: [
          { email: "bootstrap-org@niovlabs.com" },
          { display_name: { contains: "NIOV", mode: "insensitive" } },
        ],
      },
      orderBy: { created_at: "asc" },
    });
    orgId = bootstrapOrg?.entity_id ?? null;
  }

  return { orgId, twinId };
}

async function ensureOrgTruthConflict(orgId: string, actorId: string): Promise<"created" | "exists" | "skipped"> {
  // Use raw prisma for a minimal OPEN conflict set so the review UI has something
  // material without going through full promote rights for every candidate.
  const originKey = "demo-dgi:org-truth-conflict:live-test-window";
  const existing = await prisma.orgTruthConflictSet.findUnique({
    where: {
      org_entity_id_origin_key: {
        org_entity_id: orgId,
        origin_key: originKey,
      },
    },
  }).catch(() => null);

  if (existing !== null) {
    return existing.state === "OPEN" || existing.state === "UNDER_REVIEW"
      ? "exists"
      : "exists";
  }

  try {
    const truthKey = "ops.live_test.window_v1";
    await prisma.orgTruthConflictSet.create({
      data: {
        org_entity_id: orgId,
        truth_key: truthKey,
        decision_domain: "OPERATIONS",
        subject_ref: null,
        state: "OPEN",
        version: 1,
        candidate_set_fingerprint: "demo-dgi-fp-v1",
        origin_key: originKey,
      },
    });
    // Two safe candidate claims (no secrets) — best-effort; schema may vary.
    // Conflict set alone is enough for open-conflict counts on the DGI strip.
    // Full candidate provenance requires durable source records — left to product promote paths.
    void actorId;
    return "created";
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[provision-dgi] org-truth conflict skipped: ${msg.slice(0, 160)}`);
    return "skipped";
  }
}

async function main(): Promise<void> {
  if (process.env.NIOV_APPROVE_DEMO_DGI !== APPROVAL) {
    console.error(
      `[provision-dgi] REFUSING: set NIOV_APPROVE_DEMO_DGI='${APPROVAL}'`,
    );
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error("[provision-dgi] REFUSING: DATABASE_URL required");
    process.exit(1);
  }

  let created = 0;
  let existed = 0;
  let skipped = 0;
  let conflictStatus: string = "n/a";

  for (const person of WORK_BY_EMAIL) {
    const entity = await prisma.entity.findFirst({
      where: { email: person.email, deleted_at: null },
    });
    if (entity === null) {
      console.log(`[provision-dgi] skip missing person ${person.email}`);
      skipped += person.obligations.length;
      continue;
    }
    const { orgId, twinId } = await findOrgAndTwin(entity.entity_id);
    if (orgId === null || twinId === null) {
      console.log(
        `[provision-dgi] skip ${person.email}: org=${orgId !== null} twin=${twinId !== null}`,
      );
      skipped += person.obligations.length;
      continue;
    }

    if (person.email === "sadeil@niovlabs.com") {
      conflictStatus = await ensureOrgTruthConflict(orgId, entity.entity_id);
    }

    for (const obl of person.obligations) {
      const result = await createOrGetObligation(
        {
          org_entity_id: orgId,
          subject_entity_id: entity.entity_id,
          twin_entity_id: twinId,
        },
        {
          obligation_type: obl.obligation_type,
          title: obl.title,
          creator_entity_id: entity.entity_id,
          responsible_entity_id: entity.entity_id,
          origin_key: `demo-dgi:${person.email}:${obl.origin_suffix}`,
          priority: obl.priority,
          source_channel: "SYSTEM",
          provenance_class: "SYSTEM",
          details: { demo: true, tag: "DEMO-DGI" },
        },
      );
      if (result.kind === "ok") {
        if (result.created) created += 1;
        else existed += 1;
      } else {
        console.warn(
          `[provision-dgi] obligation fail ${person.email} ${obl.origin_suffix}: ${result.kind}`,
        );
        skipped += 1;
      }
    }
  }

  console.log(
    JSON.stringify({
      ok: true,
      obligations_created: created,
      obligations_existed: existed,
      obligations_skipped: skipped,
      org_truth_conflict: conflictStatus,
    }),
  );
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("[provision-dgi] fatal", e);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
