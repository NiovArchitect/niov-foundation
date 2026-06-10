// FILE: demo-collaboration-seed.ts
// PURPOSE: Seeds proof collaboration sessions between the Twins
//          provisioned by scripts/demo-team-seed.ts. Each session
//          carries a safe_summary that the Founder can see from
//          BOTH sides — Sadeil's outbound view AND the target
//          person's inbound view — by switching the login picker.
//
//          The sessions deliberately span the full state matrix
//          (REQUESTED / ACCEPTED / IN_PROGRESS / NEEDS_APPROVAL /
//          COMPLETED / BLOCKED) so the timeline UI has something
//          rich to render.
//
// USAGE:
//   set -a; . ./.env.demo.local; set +a; \
//     npx tsx scripts/demo-collaboration-seed.ts
//
// SAFETY: same ALLOW_DEMO_SEED / NODE_ENV / localhost guard as the
//   sibling seeds. Idempotent — re-runs delete demo collaboration
//   rows tagged `[DEMO]` in their safe_summary, then recreate.

import { prisma } from "@niov/database";
import type {
  TwinAuthoritySensitivityClass,
  TwinCollaborationRequestType,
  TwinCollaborationState,
  TwinCollaborationTargetType,
} from "@prisma/client";

const DEMO_TAG = "[DEMO] ";
const ORG_EMAIL = "bootstrap-org@niovlabs.com";

interface SeedSession {
  requester_email: string;
  target_email: string;
  request_type: TwinCollaborationRequestType;
  target_type: TwinCollaborationTargetType;
  state: TwinCollaborationState;
  sensitivity_class: TwinAuthoritySensitivityClass;
  safe_summary: string;
  project_name?: string;
  requires_approval?: boolean;
}

const SESSIONS: ReadonlyArray<SeedSession> = [
  // 1. Sadeil → David — runtime readiness review (IN_PROGRESS so the
  //    timeline view has both a "Twin notified" and a "Twin
  //    responded" beat).
  {
    requester_email: "sadeil@niovlabs.com",
    target_email: "david@niovlabs.com",
    request_type: "STATUS_REQUEST",
    target_type: "EMPLOYEE_TWIN",
    state: "IN_PROGRESS",
    sensitivity_class: "MODERATE",
    safe_summary:
      `${DEMO_TAG}Sadeil's Twin → David's Twin: ` +
      "Confirm the BEAM collaboration supervisor and Python intelligence service are ready for the company live test. David's Twin: yes — /health returns OK on both; integration tier green; proposed action drafted to add a /api/v1/admin/collaboration-snapshot read-only summary.",
    project_name: "Foundation Runtime Deployment",
  },
  // 2. Sadeil → Vishesh — UI improvement (COMPLETED so the founder
  //    sees a closed loop).
  {
    requester_email: "sadeil@niovlabs.com",
    target_email: "vishesh@niovlabs.com",
    request_type: "PROJECT_COORDINATION",
    target_type: "EMPLOYEE_TWIN",
    state: "COMPLETED",
    sensitivity_class: "LOW",
    safe_summary:
      `${DEMO_TAG}Sadeil's Twin → Vishesh's Twin: ` +
      "Make the employee voice UI impossible to miss — the ambient chip needs to become an obvious 'Talk to Otzar' pill. Vishesh's Twin: shipped on CT PR #46 — primary-color pill, mic icon, z-[60], mounted in BOTH admin and employee layouts.",
    project_name: "Otzar Live Test",
  },
  // 3. Sadeil → Samiksha — transcript-derived next actions
  //    (REQUESTED — the inbound side shows the work that needs to
  //    happen next).
  {
    requester_email: "sadeil@niovlabs.com",
    target_email: "samiksha@niovlabs.com",
    request_type: "CONTEXT_REQUEST",
    target_type: "EMPLOYEE_TWIN",
    state: "REQUESTED",
    sensitivity_class: "MODERATE",
    safe_summary:
      `${DEMO_TAG}Sadeil's Twin → Samiksha's Twin: ` +
      "Review Fathom transcript summaries from the past two weeks and propose the next three AI-Twin collaboration actions. DMW scope: project-only. No raw transcript exposure; summary-only.",
    project_name: "Otzar Live Test",
  },
  // 4. William → Shweta — GTM coordination (ACCEPTED so the founder
  //    sees auto-route in action via the autonomous-flow policy).
  {
    requester_email: "william@niovlabs.com",
    target_email: "shweta@niovlabs.com",
    request_type: "CROSS_TEAM_COORDINATION",
    target_type: "EMPLOYEE_TWIN",
    state: "ACCEPTED",
    sensitivity_class: "MODERATE",
    safe_summary:
      `${DEMO_TAG}William's Twin → Shweta's Twin: ` +
      "Coordinate product messaging for the company live test launch. Auto-routed under same-project policy; Shweta's Twin to draft internal launch notes (no external send).",
    project_name: "Enterprise Demo Readiness",
  },
  // 5. Annie → Sadeil — approval gate for any external connector
  //    write (NEEDS_APPROVAL — the founder sees the dual-control
  //    posture directly).
  {
    requester_email: "annie@niovlabs.com",
    target_email: "sadeil@niovlabs.com",
    request_type: "APPROVAL_REQUEST",
    target_type: "EMPLOYEE",
    state: "NEEDS_APPROVAL",
    sensitivity_class: "LEGAL",
    safe_summary:
      `${DEMO_TAG}Annie's Twin → Sadeil: ` +
      "Approval requested before any external connector write executes during the company live test. Recommended posture: DUAL_CONTROL_REQUIRED on Slack / Microsoft 365 / Google Workspace writes for the duration of the demo.",
    project_name: "Enterprise Demo Readiness",
    requires_approval: true,
  },
  // 6. Sadeil → David — handoff that's blocked to show the
  //    blocked-reason rendering path.
  {
    requester_email: "sadeil@niovlabs.com",
    target_email: "walter@niovlabs.com",
    request_type: "HANDOFF",
    target_type: "EMPLOYEE_TWIN",
    state: "BLOCKED",
    sensitivity_class: "CUSTOMER_SENSITIVE",
    safe_summary:
      `${DEMO_TAG}Sadeil's Twin → Walter's Twin: ` +
      "Handoff blocked: target Twin is not a member of the destination project context (Enterprise Demo Readiness GTM sub-scope). Resolution path: add membership OR re-route to Shweta's Twin.",
    project_name: "Enterprise Demo Readiness",
  },
];

function assertSafeEnvironment(): void {
  const allowExplicit = process.env.ALLOW_DEMO_SEED === "true";
  const nodeEnv = process.env.NODE_ENV ?? "";
  const databaseUrl = process.env.DATABASE_URL ?? "";
  const isLocalhost = databaseUrl.includes("localhost");
  if (nodeEnv === "production" && !allowExplicit) {
    throw new Error("Refusing to run in NODE_ENV=production without ALLOW_DEMO_SEED.");
  }
  if (!isLocalhost && !allowExplicit) {
    throw new Error("Refusing to run: DATABASE_URL not localhost.");
  }
}

async function findOrgId(): Promise<string> {
  const org = await prisma.entity.findFirst({ where: { email: ORG_EMAIL } });
  if (org === null) {
    throw new Error("NIOV Labs org not found. Run founder-bootstrap.ts first.");
  }
  return org.entity_id;
}

async function findPersonByEmail(email: string): Promise<string> {
  const entity = await prisma.entity.findFirst({ where: { email } });
  if (entity === null) {
    throw new Error(
      `${email} not found. Run demo-team-seed.ts (and founder-bootstrap.ts for sadeil@) first.`,
    );
  }
  return entity.entity_id;
}

async function findTwinFor(personEntityId: string): Promise<string | null> {
  // The Twin is the AI_AGENT child whose membership role is "Digital Twin".
  const membership = await prisma.entityMembership.findFirst({
    where: { parent_id: personEntityId, role_title: "Digital Twin", is_active: true },
  });
  if (membership === null) return null;
  return membership.child_id;
}

async function findProjectByName(
  orgId: string,
  name: string,
): Promise<string | null> {
  const project = await prisma.workProject.findFirst({
    where: { org_entity_id: orgId, name },
  });
  return project?.project_id ?? null;
}

async function main() {
  assertSafeEnvironment();
  const orgId = await findOrgId();

  // Wipe prior demo collaboration rows so re-running is clean.
  const wiped = await prisma.twinCollaborationRequest.deleteMany({
    where: {
      org_entity_id: orgId,
      safe_summary: { startsWith: DEMO_TAG },
    },
  });
  console.log(`[collab-seed] wiped ${wiped.count} prior demo rows`);

  let created = 0;
  for (const s of SESSIONS) {
    const requesterId = await findPersonByEmail(s.requester_email);
    const targetId = await findPersonByEmail(s.target_email);
    const requesterTwinId = await findTwinFor(requesterId);
    const targetTwinId = await findTwinFor(targetId);
    let targetProjectId: string | null = null;
    if (s.project_name !== undefined) {
      targetProjectId = await findProjectByName(orgId, s.project_name);
    }
    const now = new Date();
    const completedAt = s.state === "COMPLETED" ? now : null;
    const blockedReason = s.state === "BLOCKED" ? "MISSING_PROJECT_MEMBERSHIP" : null;
    await prisma.twinCollaborationRequest.create({
      data: {
        org_entity_id: orgId,
        requester_entity_id: requesterId,
        requester_twin_entity_id: requesterTwinId,
        target_entity_id: targetId,
        target_twin_entity_id: targetTwinId,
        target_project_id: targetProjectId,
        request_type: s.request_type,
        target_type: s.target_type,
        state: s.state,
        sensitivity_class: s.sensitivity_class,
        safe_summary: s.safe_summary,
        requested_by_ai: true,
        requires_approval: s.requires_approval ?? false,
        blocked_reason: blockedReason,
        completed_at: completedAt,
      },
    });
    created += 1;
  }

  console.log(`[collab-seed] created ${created} demo collaboration sessions\n`);
  console.log("Switch users via the Login picker to see inbound vs outbound:");
  console.log("  sadeil@niovlabs.com   → outbound 3 + inbound 1 (approval)");
  console.log("  david@niovlabs.com    → inbound 1 (runtime readiness)");
  console.log("  vishesh@niovlabs.com  → inbound 1 (UI improvement, completed)");
  console.log("  samiksha@niovlabs.com → inbound 1 (transcript review, requested)");
  console.log("  william@niovlabs.com  → outbound 1 (GTM coordination, accepted)");
  console.log("  shweta@niovlabs.com   → inbound 1 (GTM coordination, accepted)");
  console.log("  annie@niovlabs.com    → outbound 1 (approval, needs approval)");
  console.log("  walter@niovlabs.com   → inbound 1 (handoff, BLOCKED)\n");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error("[collab-seed] FAILED:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
