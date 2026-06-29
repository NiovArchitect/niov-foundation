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
  // Phase 1207 [FOUNDER-AUTH -- REDUCE OTZAR QUESTION FRICTION].
  // Other PERSON members of the viewer's org with the rough collab
  // signal the LLM needs to resolve a first-name reference ("send
  // David a note") without launching a clarification cascade. Closed-
  // vocab: display_name / email / title / shared_project_count /
  // recent_collab_count. Sensitive PII (TAR, capsules, vectors) is
  // never surfaced here -- this is a "who exists in this org" facts
  // dump for inference only.
  org_roster: ReadonlyArray<{
    entity_id: string;
    display_name: string;
    email: string | null;
    title: string;
    shared_project_count: number;
    recent_collab_count: number;
  }>;
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

  // Org roster — other PERSON members of the viewer's org. Lets the
  // LLM resolve a first-name reference ("send David a note") without
  // launching a clarification cascade. Excludes the viewer; excludes
  // AI_AGENT / COMPANY entities; bounded to 50 rows by query.
  let orgRoster: IdentityContext["org_roster"] = [];
  if (orgId !== null) {
    const peerMemberships = await prisma.entityMembership.findMany({
      where: {
        parent_id: orgId,
        is_active: true,
        child_id: { not: viewerEntityId },
        child: { entity_type: "PERSON", deleted_at: null },
      },
      include: { child: true },
      take: 50,
    });
    const peerIds = peerMemberships.map((m) => m.child_id);

    // Recent collaboration counts per peer (inbound + outbound with
    // the viewer). One grouped query each is enough at this scale.
    const collabOutPerPeer =
      peerIds.length === 0
        ? []
        : await prisma.twinCollaborationRequest.groupBy({
            by: ["target_entity_id"],
            where: {
              requester_entity_id: viewerEntityId,
              target_entity_id: { in: peerIds },
            },
            _count: { _all: true },
          });
    const collabInPerPeer =
      peerIds.length === 0
        ? []
        : await prisma.twinCollaborationRequest.groupBy({
            by: ["requester_entity_id"],
            where: {
              target_entity_id: viewerEntityId,
              requester_entity_id: { in: peerIds },
            },
            _count: { _all: true },
          });
    const collabCountByPeer = new Map<string, number>();
    for (const row of collabOutPerPeer) {
      if (row.target_entity_id === null) continue;
      collabCountByPeer.set(
        row.target_entity_id,
        (collabCountByPeer.get(row.target_entity_id) ?? 0) + row._count._all,
      );
    }
    for (const row of collabInPerPeer) {
      if (row.requester_entity_id === null) continue;
      collabCountByPeer.set(
        row.requester_entity_id,
        (collabCountByPeer.get(row.requester_entity_id) ?? 0) +
          row._count._all,
      );
    }

    // Shared-project counts per peer (peers that sit on the same
    // ACTIVE project as the viewer).
    const viewerProjectIds = projects.map((p) => p.project_id);
    const peerProjectMemberships =
      peerIds.length === 0 || viewerProjectIds.length === 0
        ? []
        : await prisma.workProjectMember.findMany({
            where: {
              entity_id: { in: peerIds },
              project_id: { in: viewerProjectIds },
            },
            select: { entity_id: true, project_id: true },
          });
    const sharedProjectCountByPeer = new Map<string, number>();
    for (const m of peerProjectMemberships) {
      sharedProjectCountByPeer.set(
        m.entity_id,
        (sharedProjectCountByPeer.get(m.entity_id) ?? 0) + 1,
      );
    }

    orgRoster = peerMemberships.map((m) => ({
      entity_id: m.child_id,
      display_name: m.child.display_name,
      email: m.child.email,
      title: m.role_title ?? "MEMBER",
      shared_project_count: sharedProjectCountByPeer.get(m.child_id) ?? 0,
      recent_collab_count: collabCountByPeer.get(m.child_id) ?? 0,
    }));
  }

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
    org_roster: orgRoster,
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

  // Org roster -- give the LLM the facts it needs to resolve a first-
  // name reference like "send David a note" without launching a
  // clarification cascade. Sorted by (shared_project_count DESC,
  // recent_collab_count DESC, display_name ASC) so the most-relevant
  // peers land at the top.
  if (ctx.org_roster.length > 0) {
    const sorted = [...ctx.org_roster].sort((a, b) => {
      if (b.shared_project_count !== a.shared_project_count) {
        return b.shared_project_count - a.shared_project_count;
      }
      if (b.recent_collab_count !== a.recent_collab_count) {
        return b.recent_collab_count - a.recent_collab_count;
      }
      return a.display_name.localeCompare(b.display_name);
    });
    const lines = sorted.map((p) => {
      const sig: string[] = [];
      if (p.shared_project_count > 0) {
        sig.push(`${p.shared_project_count} shared project${p.shared_project_count === 1 ? "" : "s"}`);
      }
      if (p.recent_collab_count > 0) {
        sig.push(`${p.recent_collab_count} recent collaboration${p.recent_collab_count === 1 ? "" : "s"}`);
      }
      const sigStr = sig.length > 0 ? ` -- ${sig.join(", ")}` : "";
      const emailStr = p.email !== null ? ` <${p.email}>` : "";
      return `  - ${p.display_name}${emailStr}, ${humanizeTitle(p.title)}${sigStr}`;
    });
    parts.push("[ORG ROSTER]", lines.join("\n"));
  }

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
    "[ACTION DRAFTING DISCIPLINE]",
    "When the viewer asks you to send/message/tell/ask/remind/nudge/follow-up-with another person, INFER FIRST, DRAFT FIRST, ASK ONLY ON REAL AMBIGUITY. " +
      "Step 1 (resolve target): use [ORG ROSTER] above. A name reference resolves ONLY to a roster entry whose display_name EXACTLY equals the name or whose first name equals it. " +
      "NEVER phonetically guess or substitute a similar-sounding but DIFFERENT roster name for a name that is not clearly present; a name that does not clearly match a roster entry is UNRESOLVED -- ask one focused question, never silently pick the nearest-sounding member. " +
      "If MORE THAN ONE roster entry matches the name, you MUST ask one focused 'Did you mean <A> or <B>?' question -- do NOT auto-pick by shared_project_count or recent_collab_count. Those counts may ORDER the candidates you present, but they NEVER authorize a silent choice between distinct people. " +
      "Step 2 (resolve channel): default to an internal Otzar proposed-action / internal note. Do not ask which channel first. " +
      "Step 3 (resolve tone): default to direct but professional. Do not ask which tone first. " +
      "Step 4 (DRAFT the message immediately) and present it in this exact shape: " +
      "'I found <Display Name>... I drafted a direct internal note. I will not send it until you approve.\\n\\nDraft:\\n\"<draft text>\"\\n\\nSend this to <Display Name>?' " +
      "Step 5 (approval): never send / never create an external write without explicit approval. Internal proposed actions can be created immediately. " +
      "FORBIDDEN: asking multiple clarification questions in one turn (which person / which channel / what tone) for a low-risk internal message when the roster contains a clear top candidate. " +
      "Even when ambiguity is real, ask ONE focused question only -- never a questionnaire.",
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
