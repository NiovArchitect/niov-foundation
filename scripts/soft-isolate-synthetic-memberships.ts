// FILE: soft-isolate-synthetic-memberships.ts
// PURPOSE: Reversible soft-isolation of HIGH-confidence synthetic PERSON
//          memberships (is_active=false) inside one organization only.
//          Does NOT delete entities (RULE 10). Requires dual env approval
//          for real mutation. Defaults to dry-run.
// USAGE:
//   set -a; . ./.env; set +a
//   npx tsx scripts/soft-isolate-synthetic-memberships.ts --dry-run
//   npx tsx scripts/soft-isolate-synthetic-memberships.ts --dry-run \
//     --org-name "NIOV Labs"
//   NIOV_APPROVE_SOFT_ISOLATE_SYNTHETICS='APPROVE SOFT ISOLATE SYNTHETICS' \
//     npx tsx scripts/soft-isolate-synthetic-memberships.ts --apply \
//     --org-name "NIOV Labs"
//   # Rollback (reactivate previously soft-isolated HIGH synthetics):
//   NIOV_APPROVE_SOFT_ISOLATE_SYNTHETICS='APPROVE SOFT ISOLATE SYNTHETICS' \
//     npx tsx scripts/soft-isolate-synthetic-memberships.ts --reactivate \
//     --org-name "NIOV Labs"
// CONNECTS TO: synthetic-principal.ts, EntityMembership.is_active,
//          docs/reviews/OTZAR_IDENTITY_AND_FIXTURE_HYGIENE_AUDIT.md

import { prisma } from "@niov/database";
import {
  classifySyntheticPrincipal,
  DEMO_TEAM_EMAIL_ALLOWLIST,
  type SyntheticConfidence,
} from "../apps/api/src/services/otzar/synthetic-principal.js";

const APPROVAL_ENV = "NIOV_APPROVE_SOFT_ISOLATE_SYNTHETICS";
const APPROVAL_PHRASE = "APPROVE SOFT ISOLATE SYNTHETICS";

const DEFAULT_ORG_NAME = "NIOV Labs";
const DEFAULT_ORG_EMAIL = "bootstrap-org@niovlabs.com";

interface CliArgs {
  mode: "dry-run" | "apply" | "reactivate";
  orgName: string;
  orgId: string | null;
  verbose: boolean;
  json: boolean;
}

interface RedactedCandidate {
  entity_id_prefix: string;
  email_local_redacted: string;
  display_name_redacted: string;
  confidence: SyntheticConfidence;
  reason: string;
  membership_id_prefix: string;
  parent_id_prefix: string;
  role_title: string | null;
  is_active: boolean;
  safe_to_isolate: boolean;
  requires_review: boolean;
  dep_counts: {
    child_memberships: number;
    // Reserved for future dependency expansion (obligations etc.)
  };
}

function parseArgs(argv: string[]): CliArgs {
  const apply = argv.includes("--apply");
  const reactivate = argv.includes("--reactivate");
  const dryFlag = argv.includes("--dry-run");
  let mode: CliArgs["mode"] = "dry-run";
  if (reactivate) mode = "reactivate";
  else if (apply && !dryFlag) mode = "apply";
  else mode = "dry-run";

  let orgName = DEFAULT_ORG_NAME;
  let orgId: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--org-name" && argv[i + 1]) orgName = argv[++i]!;
    if (argv[i] === "--org-id" && argv[i + 1]) orgId = argv[++i]!;
  }
  return {
    mode,
    orgName,
    orgId,
    verbose: argv.includes("--verbose"),
    json: argv.includes("--json"),
  };
}

function redactDb(raw: string | undefined): string {
  if (!raw) return "<unset>";
  try {
    const u = new URL(raw);
    return `${u.protocol}//<redacted>@${u.hostname}:${u.port || "5432"}${u.pathname}`;
  } catch {
    return "<redacted>";
  }
}

/** Redact email to local-prefix only (no domain dump in ordinary reports). */
function redactEmail(email: string | null | undefined): string {
  if (!email) return "(no-email)";
  const local = email.split("@")[0] ?? "";
  if (local.length <= 4) return `${local.slice(0, 1)}…@…`;
  return `${local.slice(0, 6)}…@…`;
}

function redactName(name: string | null | undefined): string {
  if (!name) return "(no-name)";
  if (name.length <= 3) return `${name[0]}…`;
  return `${name.slice(0, 3)}…`;
}

function requireApproval(): void {
  if (process.env[APPROVAL_ENV] !== APPROVAL_PHRASE) {
    console.error(
      `[soft-isolate] REFUSING: set ${APPROVAL_ENV}='${APPROVAL_PHRASE}' for mutating modes`,
    );
    process.exit(1);
  }
}

async function resolveOrg(args: CliArgs): Promise<{
  entity_id: string;
  display_name: string | null;
  email: string | null;
}> {
  if (args.orgId) {
    const byId = await prisma.entity.findFirst({
      where: {
        entity_id: args.orgId,
        deleted_at: null,
        entity_type: "COMPANY",
      },
      select: { entity_id: true, display_name: true, email: true },
    });
    if (!byId) {
      console.error(`[soft-isolate] REFUSING: org-id not found or not COMPANY`);
      process.exit(1);
    }
    return byId;
  }

  const byEmail = await prisma.entity.findFirst({
    where: {
      email: DEFAULT_ORG_EMAIL,
      deleted_at: null,
      entity_type: "COMPANY",
    },
    select: { entity_id: true, display_name: true, email: true },
  });
  if (byEmail) return byEmail;

  const byName = await prisma.entity.findFirst({
    where: {
      display_name: args.orgName,
      deleted_at: null,
      entity_type: "COMPANY",
    },
    select: { entity_id: true, display_name: true, email: true },
  });
  if (!byName) {
    console.error(
      `[soft-isolate] REFUSING: organization "${args.orgName}" not found (tenant scope required)`,
    );
    process.exit(1);
  }
  return byName;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  console.log("[soft-isolate] db=", redactDb(process.env.DATABASE_URL));
  console.log("[soft-isolate] mode=", args.mode.toUpperCase());
  console.log("[soft-isolate] org_scope=", args.orgId ?? args.orgName);

  if (args.mode !== "dry-run") requireApproval();

  const org = await resolveOrg(args);
  console.log(
    "[soft-isolate] resolved_org=",
    org.display_name ?? "(unnamed)",
    "id_prefix=",
    org.entity_id.slice(0, 8) + "…",
  );

  // Tenant boundary: only memberships whose parent is this org.
  const memberships = await prisma.entityMembership.findMany({
    where: { parent_id: org.entity_id },
    select: {
      membership_id: true,
      parent_id: true,
      child_id: true,
      role_title: true,
      is_active: true,
      is_admin: true,
    },
  });
  console.log("[soft-isolate] memberships_inspected=", memberships.length);

  const childIds = [...new Set(memberships.map((m) => m.child_id))];
  const people =
    childIds.length === 0
      ? []
      : await prisma.entity.findMany({
          where: {
            entity_id: { in: childIds },
            entity_type: "PERSON",
            deleted_at: null,
          },
          select: {
            entity_id: true,
            email: true,
            display_name: true,
            status: true,
          },
        });
  const peopleById = new Map(people.map((p) => [p.entity_id, p]));

  const high: RedactedCandidate[] = [];
  const review: RedactedCandidate[] = [];
  let skippedAllowlist = 0;
  let nonSynthetic = 0;

  for (const m of memberships) {
    const person = peopleById.get(m.child_id);
    if (!person) continue;

    const emailLc = (person.email ?? "").trim().toLowerCase();
    if (emailLc && DEMO_TEAM_EMAIL_ALLOWLIST.has(emailLc)) {
      skippedAllowlist += 1;
      continue;
    }

    const cls = classifySyntheticPrincipal({
      email: person.email,
      display_name: person.display_name,
    });
    if (cls.confidence === "NOT_SYNTHETIC") {
      nonSynthetic += 1;
      continue;
    }

    const childMemCount = await prisma.entityMembership.count({
      where: { parent_id: person.entity_id },
    });

    const row: RedactedCandidate = {
      entity_id_prefix: person.entity_id.slice(0, 8) + "…",
      email_local_redacted: redactEmail(person.email),
      display_name_redacted: redactName(person.display_name),
      confidence: cls.confidence,
      reason: cls.reason,
      membership_id_prefix: m.membership_id.slice(0, 8) + "…",
      parent_id_prefix: m.parent_id.slice(0, 8) + "…",
      role_title: m.role_title,
      is_active: m.is_active,
      safe_to_isolate: cls.confidence === "HIGH" && m.is_active,
      requires_review: cls.confidence === "REVIEW_REQUIRED",
      dep_counts: { child_memberships: childMemCount },
    };

    if (cls.confidence === "HIGH") high.push(row);
    else review.push(row);
  }

  const highActive = high.filter((h) => h.is_active);
  const highInactive = high.filter((h) => !h.is_active);

  console.log("[soft-isolate] summary=");
  console.log("  non_synthetic_memberships=", nonSynthetic);
  console.log("  demo_allowlist_skipped=", skippedAllowlist);
  console.log("  high_confidence_total=", high.length);
  console.log("  high_confidence_active=", highActive.length);
  console.log("  high_confidence_already_inactive=", highInactive.length);
  console.log("  review_required=", review.length);
  console.log("  deletes=", 0);

  if (args.verbose || args.mode === "dry-run") {
    console.log("[soft-isolate] HIGH candidates (redacted, max 40):");
    for (const h of high.slice(0, 40)) {
      console.log(
        `  - ${h.email_local_redacted} | ${h.display_name_redacted} | ${h.reason} | active=${h.is_active} | safe=${h.safe_to_isolate}`,
      );
    }
    if (high.length > 40) console.log(`  … +${high.length - 40} more HIGH`);
    if (review.length > 0) {
      console.log("[soft-isolate] REVIEW_REQUIRED (not auto-applied):");
      for (const r of review.slice(0, 20)) {
        console.log(
          `  - ${r.email_local_redacted} | ${r.reason} | active=${r.is_active}`,
        );
      }
    }
  }

  if (args.json) {
    console.log(
      JSON.stringify(
        {
          mode: args.mode,
          org_id_prefix: org.entity_id.slice(0, 8),
          memberships_inspected: memberships.length,
          high_total: high.length,
          high_active: highActive.length,
          review_required: review.length,
          high,
          review,
        },
        null,
        2,
      ),
    );
  }

  if (args.mode === "dry-run") {
    console.log("[soft-isolate] DRY-RUN complete — no writes");
    await prisma.$disconnect();
    return;
  }

  // Only HIGH confidence memberships under this org; never REVIEW_REQUIRED.
  const highPeople = people.filter(
    (p) =>
      classifySyntheticPrincipal({
        email: p.email,
        display_name: p.display_name,
      }).confidence === "HIGH",
  );
  const highIds = highPeople.map((p) => p.entity_id);

  if (highIds.length === 0) {
    console.log("[soft-isolate] nothing to mutate under HIGH scope");
    await prisma.$disconnect();
    return;
  }

  if (args.mode === "apply") {
    const result = await prisma.entityMembership.updateMany({
      where: {
        parent_id: org.entity_id,
        child_id: { in: highIds },
        is_active: true,
      },
      data: { is_active: false },
    });
    console.log("[soft-isolate] memberships_deactivated=", result.count);
    console.log(
      "[soft-isolate] reverse: re-run with --reactivate and the same approval phrase",
    );
  } else if (args.mode === "reactivate") {
    const result = await prisma.entityMembership.updateMany({
      where: {
        parent_id: org.entity_id,
        child_id: { in: highIds },
        is_active: false,
      },
      data: { is_active: true },
    });
    console.log("[soft-isolate] memberships_reactivated=", result.count);
  }

  // Post-check (idempotent verification)
  const remainingActive = await prisma.entityMembership.count({
    where: {
      parent_id: org.entity_id,
      child_id: { in: highIds },
      is_active: true,
    },
  });
  console.log(
    "[soft-isolate] post_check_high_active_memberships=",
    remainingActive,
  );

  // Legitimate allowlist still active check
  const allowPeople = await prisma.entity.findMany({
    where: {
      email: { in: [...DEMO_TEAM_EMAIL_ALLOWLIST] },
      deleted_at: null,
    },
    select: { entity_id: true, email: true },
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
      "[soft-isolate] post_check_demo_team_active_memberships=",
      allowActive,
      "of",
      allowPeople.length,
    );
  }

  console.log("[soft-isolate] deleted_records=", 0);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("[soft-isolate] FAILED", e instanceof Error ? e.message : e);
  await prisma.$disconnect();
  process.exit(1);
});
