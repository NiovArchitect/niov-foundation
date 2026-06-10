// FILE: identity-context.ts
// PURPOSE: Build a safe, structured identity-context block the LLM
//          sees BEFORE every layer in ConductSession's system prompt
//          so Otzar never answers as a generic public chatbot when
//          the viewer is authenticated. Closes the "I don't have
//          specific information about Sadeil loaded" bug per
//          [FOUNDER-AUTH — FIX AI TWIN IDENTITY CONTEXT].
//
//          Also used by GET /api/v1/otzar/my-twin/context-health to
//          surface the same context as a closed-vocab JSON status
//          for the Voice page badge.
//
// PRIVACY INVARIANT:
//   - No raw secrets ever appear here. No password hashes. No tokens.
//   - No raw private memory text — we summarize counts only.
//   - No raw transcript text — only the [TRANSCRIPT-FATHOM] count.
//   - No cross-user private data. Every query is scoped to the
//     viewer's org membership chain.
//   - Authority grant identifiers / scope ids / etc. are surfaced as
//     COUNTS only, not their fields.

import { prisma } from "@niov/database";

export interface IdentityContext {
  viewer: {
    user_id: string;
    email: string | null;
    display_name: string;
    title: string;
    org_role: string;
    is_founder_admin: boolean;
  };
  org: {
    org_id: string | null;
    name: string | null;
    domain: string | null;
  };
  twin: {
    twin_id: string | null;
    display_name: string | null;
    active: boolean;
  };
  projects: ReadonlyArray<{
    project_id: string;
    name: string;
    role: string;
  }>;
  authority: {
    can_admin_org: boolean;
    can_read_capsules: boolean;
    can_write_capsules: boolean;
    can_share_capsules: boolean;
    can_access_external_api: boolean;
    external_write_policy: string;
  };
  context_signals: {
    memory_capsules_count: number;
    transcript_summaries_count: number;
    collaboration_inbound_count: number;
    collaboration_outbound_count: number;
  };
  safety: {
    no_external_write_without_approval: true;
    no_private_data_to_unauthorized_users: true;
    no_raw_audio_storage: true;
    no_raw_transcript_default: true;
  };
}

/**
 * Build the identity context for an authenticated viewer entity.
 * Tolerant: any missing relation returns nulls / zero counts rather
 * than throwing, so a partially-seeded org never blocks Otzar
 * conversation.
 */
export async function buildIdentityContext(
  viewerEntityId: string,
): Promise<IdentityContext> {
  const viewer = await prisma.entity.findUnique({
    where: { entity_id: viewerEntityId },
  });
  const displayName = viewer?.display_name ?? "Unknown viewer";
  const email = viewer?.email ?? null;

  // Org membership — the role_title on EntityMembership(parent=org,
  // child=viewer) is the canonical title (FOUNDER / TECH LEAD / etc.).
  const orgMembership = await prisma.entityMembership.findFirst({
    where: {
      child_id: viewerEntityId,
      is_active: true,
      parent: { entity_type: "COMPANY", deleted_at: null },
    },
    include: { parent: true },
  });
  const orgId = orgMembership?.parent_id ?? null;
  const orgName = orgMembership?.parent?.display_name ?? null;
  const orgEmail = orgMembership?.parent?.email ?? null;
  const orgDomain =
    orgEmail !== null && orgEmail.includes("@")
      ? (orgEmail.split("@")[1] ?? null)
      : null;
  const title = orgMembership?.role_title ?? "MEMBER";
  const isFounderAdmin =
    title === "FOUNDER" || title.toUpperCase().includes("FOUNDER");

  // TAR — surface the capability booleans (NOT the hash, NOT the
  // monetization role, NOT the clearance ceiling).
  const tar = await prisma.tokenAttributeRepository.findUnique({
    where: { entity_id: viewerEntityId },
  });

  // Twin lookup — same deterministic primary-twin selection rule the
  // conductSession uses (oldest active AI_AGENT child by created_at).
  const twinMemberships = await prisma.entityMembership.findMany({
    where: { parent_id: viewerEntityId, is_active: true },
    select: { child_id: true },
  });
  const twinIds = twinMemberships.map((m) => m.child_id);
  const twin =
    twinIds.length > 0
      ? await prisma.entity.findFirst({
          where: {
            entity_id: { in: twinIds },
            entity_type: "AI_AGENT",
            deleted_at: null,
          },
          orderBy: [{ created_at: "asc" }, { entity_id: "asc" }],
        })
      : null;

  // Project memberships (org-scoped) — render up to 8 ACTIVE
  // projects with the viewer's role. WorkProjectMember does not
  // declare a Prisma relation to WorkProject, so we hand-join.
  const projectMemberships =
    orgId === null
      ? []
      : await prisma.workProjectMember.findMany({
          where: {
            entity_id: viewerEntityId,
            org_entity_id: orgId,
          },
          take: 8,
        });
  const projectIds = projectMemberships.map((m) => m.project_id);
  const projectRows =
    projectIds.length === 0
      ? []
      : await prisma.workProject.findMany({
          where: {
            project_id: { in: projectIds },
            state: "ACTIVE",
          },
          select: { project_id: true, name: true },
        });
  const projectsById = new Map(
    projectRows.map((p) => [p.project_id, p.name]),
  );
  const projects = projectMemberships
    .filter((m) => projectsById.has(m.project_id))
    .map((m) => ({
      project_id: m.project_id,
      name: projectsById.get(m.project_id) ?? "",
      role: m.role,
    }));

  // Context-signal counts — used by the LLM to know HOW MUCH context
  // is available without ever loading the content itself.
  const wallet = await prisma.wallet.findUnique({
    where: { entity_id: viewerEntityId },
    select: { wallet_id: true },
  });
  const memoryCapsulesCount =
    wallet === null
      ? 0
      : await prisma.memoryCapsule.count({
          where: {
            wallet_id: wallet.wallet_id,
            deleted_at: null,
            payload_summary: { not: { startsWith: "[TRANSCRIPT-FATHOM]" } },
          },
        });
  const transcriptSummariesCount =
    wallet === null
      ? 0
      : await prisma.memoryCapsule.count({
          where: {
            wallet_id: wallet.wallet_id,
            deleted_at: null,
            payload_summary: { startsWith: "[TRANSCRIPT-FATHOM]" },
          },
        });

  // Collaboration counts — inbound vs outbound from this viewer.
  const collaborationInbound = await prisma.twinCollaborationRequest.count({
    where: { target_entity_id: viewerEntityId },
  });
  const collaborationOutbound = await prisma.twinCollaborationRequest.count({
    where: { requester_entity_id: viewerEntityId },
  });

  return {
    viewer: {
      user_id: viewerEntityId,
      email,
      display_name: displayName,
      title,
      org_role: title,
      is_founder_admin: isFounderAdmin,
    },
    org: {
      org_id: orgId,
      name: orgName,
      domain: orgDomain,
    },
    twin: {
      twin_id: twin?.entity_id ?? null,
      display_name: twin?.display_name ?? null,
      active: twin !== null,
    },
    projects,
    authority: {
      can_admin_org: tar?.can_admin_org === true,
      can_read_capsules: tar?.can_read_capsules === true,
      can_write_capsules: tar?.can_write_capsules === true,
      can_share_capsules: tar?.can_share_capsules === true,
      can_access_external_api: tar?.can_access_external_api === true,
      // Closed-vocab: in the local/staging demo, ALL external writes
      // require approval. Production deployments can override at
      // policy tier.
      external_write_policy: "APPROVAL_REQUIRED",
    },
    context_signals: {
      memory_capsules_count: memoryCapsulesCount,
      transcript_summaries_count: transcriptSummariesCount,
      collaboration_inbound_count: collaborationInbound,
      collaboration_outbound_count: collaborationOutbound,
    },
    safety: {
      no_external_write_without_approval: true,
      no_private_data_to_unauthorized_users: true,
      no_raw_audio_storage: true,
      no_raw_transcript_default: true,
    },
  };
}

/**
 * Failure-case preamble emitted when buildIdentityContext returns
 * an unresolved viewer (no Entity row, no email, generic display_name).
 * Per [FOUNDER-CLARIFICATION -- OTZAR MUST BE USER-SCOPED, NOT
 * SADEIL-HARDCODED]: the LLM must explicitly surface the wiring gap
 * rather than fabricate a default identity or fall back to public-
 * chatbot framing.
 */
export const UNCONFIGURED_PREAMBLE: string =
  "[VIEWER IDENTITY]\n" +
  "Authenticated identity context was NOT provided by the backend.\n" +
  "[GOVERNANCE]\n" +
  "If the viewer asks who they are, answer exactly: " +
  '"I am connected to Otzar, but the backend did not provide ' +
  'authenticated identity context. This is a context-wiring issue." ' +
  "Do NOT guess. Do NOT assume the viewer is any specific person.";

/**
 * Render the identity context as a SHORT, deterministic preamble
 * that the LLM sees BEFORE every other layer. Plain prose — closed-
 * vocab nouns, no markdown that would confuse speech_ready_text.
 *
 * The renderer is parametric -- it reads EVERY identity field from
 * the IdentityContext argument and never hardcodes any user's name,
 * org, title, or twin. The "do not assume Sadeil" language in the
 * [GOVERNANCE] block is a session-agnostic LLM guard that fires for
 * EVERY viewer (sadeil@... / david@... / vishesh@... / etc.).
 */
export function renderIdentityPreamble(ctx: IdentityContext): string {
  // Unconfigured viewer -> wiring-issue preamble. Detected when
  // buildIdentityContext could not resolve the Entity row.
  if (ctx.viewer.display_name === "Unknown viewer") {
    return UNCONFIGURED_PREAMBLE;
  }

  const parts: string[] = [];
  parts.push("[VIEWER IDENTITY]");
  const titleHumanized = humanizeTitle(ctx.viewer.title);
  if (ctx.org.name !== null) {
    parts.push(
      `You are talking to ${ctx.viewer.display_name}, ${titleHumanized} of ${ctx.org.name}.`,
    );
  } else {
    parts.push(`You are talking to ${ctx.viewer.display_name}, ${titleHumanized}.`);
  }
  if (ctx.viewer.email !== null) {
    parts.push(`Email: ${ctx.viewer.email}.`);
  }
  if (ctx.twin.display_name !== null) {
    parts.push(
      `You are their AI Twin, named "${ctx.twin.display_name}". Always speak as their Twin.`,
    );
  }
  if (ctx.projects.length > 0) {
    parts.push(
      `Current project memberships: ${ctx.projects
        .map((p) => `${p.name} (${p.role})`)
        .join("; ")}.`,
    );
  }
  parts.push(
    `Context signals: ${ctx.context_signals.memory_capsules_count} memory summaries, ` +
      `${ctx.context_signals.transcript_summaries_count} transcript-derived summaries, ` +
      `${ctx.context_signals.collaboration_inbound_count} inbound collaborations, ` +
      `${ctx.context_signals.collaboration_outbound_count} outbound collaborations available.`,
  );
  parts.push(
    "[GOVERNANCE]",
    "You are Otzar, the governed AI Twin interface for the authenticated viewer. " +
      "The viewer is the logged-in user described in [VIEWER IDENTITY] above -- read it. " +
      "Do not assume the viewer is any specific person (do not assume Sadeil, do not assume David, do not assume anyone) unless [VIEWER IDENTITY] names that person. " +
      "Do not answer as a public chatbot. Use only the scoped context provided by the backend. " +
      "NEVER answer 'I have no information about this user' when identity context above is populated. " +
      "External writes (Slack / email / Jira / Linear / etc.) require approval and the operator must explicitly enable connector writes. " +
      "Sensitive memory remains scoped to its wallet and policy; do not expose one viewer's private data to another viewer. " +
      "If the viewer asks who they are, answer using the [VIEWER IDENTITY] block above.",
  );
  return parts.join("\n");
}

function humanizeTitle(title: string): string {
  switch (title.toUpperCase()) {
    case "FOUNDER":
      return "Founder & CEO";
    case "TECH LEAD":
      return "Tech Lead";
    case "AI UI ENGINEER":
      return "AI UI Engineer";
    case "AI/NLP ENGINEER":
      return "AI/NLP Engineer";
    case "GO-TO-MARKET LEAD":
      return "Go-to-Market Lead";
    case "PRODUCT LEAD":
      return "Product Lead";
    case "RISK & COMPLIANCE LEAD":
      return "Risk & Compliance Lead";
    case "MEDIA LEAD":
      return "Media Lead";
    case "MEMBER":
      return "team member";
    default:
      // Preserve casing for unrecognized titles — admins may have
      // set them deliberately.
      return title;
  }
}
