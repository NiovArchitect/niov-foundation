// FILE: soft-isolate-synthetics.job.mjs
// PURPOSE: Production one-off job for Render otzar-api.
//          HIGH-confidence synthetic membership soft-isolation (NIOV Labs only).
//          CommonJS-compatible body so base64 + node -e eval works on the job rail.
// SAFETY: No deletes. Org-scoped. REVIEW_REQUIRED never auto-applied.
// MODE: SOFT_ISOLATE_MODE=dry-run|apply|reactivate

const { PrismaClient } = require("@prisma/client");

const APPROVAL_ENV = "NIOV_APPROVE_SOFT_ISOLATE_SYNTHETICS";
const APPROVAL_PHRASE = "APPROVE SOFT ISOLATE SYNTHETICS";
const ORG_EMAIL = "bootstrap-org@niovlabs.com";
const ORG_NAME = "NIOV Labs";

const DEMO_ALLOWLIST = new Set([
  "sadeil@niovlabs.com",
  "david@niovlabs.com",
  "annie@niovlabs.com",
  "william@niovlabs.com",
  "shweta@niovlabs.com",
  "walter@niovlabs.com",
  "vishesh@niovlabs.com",
  "samiksha@niovlabs.com",
]);

function classify(email, name) {
  const e = (email ?? "").trim().toLowerCase();
  const n = (name ?? "").trim().toLowerCase();
  const local = e.includes("@") ? e.split("@")[0] ?? "" : e;
  const hay = `${e} ${n} ${local}`;
  if (!e && !n) return { confidence: "NOT_SYNTHETIC", reason: "empty" };
  if (e && DEMO_ALLOWLIST.has(e))
    return { confidence: "NOT_SYNTHETIC", reason: "allowlist" };
  if (/\brc2[-_]?admin\b/.test(hay))
    return { confidence: "HIGH", reason: "exact_rc2_admin_prefix" };
  if (/\brc2[-_]/.test(local) || local.startsWith("rc2"))
    return { confidence: "HIGH", reason: "exact_rc2_local_prefix" };
  if (/\+rc2[-_]/.test(e) || /\+s250/.test(e))
    return { confidence: "HIGH", reason: "explicit_rc2_or_s250_plus_tag" };
  if (
    /^(s25|s250|s2500|synthetic|load[-_]?test|pressure[-_]|harness[-_]|r03-s250)/i.test(
      local,
    )
  )
    return { confidence: "HIGH", reason: "exact_pressure_load_fixture_local" };
  if (/\b(synthetic|load-?test|pressure harness)\b/.test(n))
    return { confidence: "HIGH", reason: "explicit_synthetic_display_name" };
  if (/@(example\.com|test\.local|localhost)$/.test(e))
    return { confidence: "HIGH", reason: "explicit_harness_email_domain" };
  if (/\b(test user|fixture|dummy user|bot harness)\b/.test(n))
    return { confidence: "REVIEW_REQUIRED", reason: "ambiguous_test_display_name" };
  if (/\+test@|\+fixture@/i.test(e))
    return { confidence: "REVIEW_REQUIRED", reason: "ambiguous_plus_tag" };
  return { confidence: "NOT_SYNTHETIC", reason: "none" };
}

function redactEmail(email) {
  if (!email) return "(no-email)";
  const local = email.split("@")[0] ?? "";
  return local.length <= 4
    ? `${local.slice(0, 1)}…@…`
    : `${local.slice(0, 6)}…@…`;
}

const mode = (process.env.SOFT_ISOLATE_MODE || "dry-run").toLowerCase();
const prisma = new PrismaClient();

async function main() {
  console.log("[soft-isolate-job] mode=", mode);
  if (mode === "apply" || mode === "reactivate") {
    if (process.env[APPROVAL_ENV] !== APPROVAL_PHRASE) {
      console.error("[soft-isolate-job] REFUSING: approval phrase missing");
      process.exit(1);
    }
  }

  let org = await prisma.entity.findFirst({
    where: { email: ORG_EMAIL, entity_type: "COMPANY", deleted_at: null },
    select: { entity_id: true, display_name: true },
  });
  if (!org) {
    org = await prisma.entity.findFirst({
      where: {
        display_name: ORG_NAME,
        entity_type: "COMPANY",
        deleted_at: null,
      },
      select: { entity_id: true, display_name: true },
    });
  }
  if (!org) {
    console.error("[soft-isolate-job] REFUSING: NIOV Labs org not found");
    process.exit(1);
  }
  console.log(
    "[soft-isolate-job] org=",
    org.display_name,
    "id_prefix=",
    org.entity_id.slice(0, 8),
  );

  const memberships = await prisma.entityMembership.findMany({
    where: { parent_id: org.entity_id },
    select: {
      membership_id: true,
      child_id: true,
      is_active: true,
      role_title: true,
    },
  });
  console.log(
    "[soft-isolate-job] memberships_inspected=",
    memberships.length,
  );

  const children = await prisma.entity.findMany({
    where: {
      entity_id: { in: memberships.map((m) => m.child_id) },
      entity_type: "PERSON",
      deleted_at: null,
    },
    select: { entity_id: true, email: true, display_name: true },
  });
  const byId = new Map(children.map((c) => [c.entity_id, c]));

  let highActive = 0;
  let highInactive = 0;
  let review = 0;
  let allowlist = 0;
  const highIds = [];

  for (const m of memberships) {
    const person = byId.get(m.child_id);
    if (!person) continue;
    const email = (person.email ?? "").toLowerCase();
    if (DEMO_ALLOWLIST.has(email)) {
      allowlist += 1;
      continue;
    }
    const cls = classify(person.email, person.display_name);
    if (cls.confidence === "HIGH") {
      highIds.push(person.entity_id);
      if (m.is_active) {
        highActive += 1;
        console.log(
          "  HIGH active",
          redactEmail(person.email),
          cls.reason,
        );
      } else {
        highInactive += 1;
      }
    } else if (cls.confidence === "REVIEW_REQUIRED") {
      review += 1;
      console.log("  REVIEW", redactEmail(person.email), cls.reason);
    }
  }

  console.log("[soft-isolate-job] high_active=", highActive);
  console.log("[soft-isolate-job] high_inactive=", highInactive);
  console.log("[soft-isolate-job] review_required=", review);
  console.log("[soft-isolate-job] allowlist_skipped=", allowlist);
  console.log("[soft-isolate-job] deletes=", 0);

  if (mode === "dry-run") {
    console.log("[soft-isolate-job] DRY-RUN complete");
    await prisma.$disconnect();
    return;
  }

  if (highIds.length === 0) {
    console.log("[soft-isolate-job] nothing to mutate");
    await prisma.$disconnect();
    return;
  }

  if (mode === "apply") {
    const result = await prisma.entityMembership.updateMany({
      where: {
        parent_id: org.entity_id,
        child_id: { in: highIds },
        is_active: true,
      },
      data: { is_active: false },
    });
    console.log(
      "[soft-isolate-job] memberships_deactivated=",
      result.count,
    );
  } else if (mode === "reactivate") {
    const result = await prisma.entityMembership.updateMany({
      where: {
        parent_id: org.entity_id,
        child_id: { in: highIds },
        is_active: false,
      },
      data: { is_active: true },
    });
    console.log(
      "[soft-isolate-job] memberships_reactivated=",
      result.count,
    );
  }

  const remaining = await prisma.entityMembership.count({
    where: {
      parent_id: org.entity_id,
      child_id: { in: highIds },
      is_active: true,
    },
  });
  console.log("[soft-isolate-job] post_check_high_active=", remaining);

  // Allowlist still active
  const allowPeople = await prisma.entity.findMany({
    where: {
      email: { in: [...DEMO_ALLOWLIST] },
      deleted_at: null,
    },
    select: { entity_id: true },
  });
  if (allowPeople.length > 0) {
    const allowActive = await prisma.entityMembership.count({
      where: {
        parent_id: org.entity_id,
        child_id: { in: allowPeople.map((p) => p.entity_id) },
        is_active: true,
      },
    });
    console.log(
      "[soft-isolate-job] post_check_demo_team_active=",
      allowActive,
      "of",
      allowPeople.length,
    );
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("[soft-isolate-job] FAILED", e && e.message ? e.message : e);
  try {
    await prisma.$disconnect();
  } catch (_) {}
  process.exit(1);
});
