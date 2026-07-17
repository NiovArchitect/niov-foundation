// FILE: project-execution-loop.service.ts
// PURPOSE: [PROJECT-COHERENCE C.2] Single project kickoff loop:
//          membership gate → structured project brief (non-empty Google Doc)
//          → optional calendar event, both stamped with project_id.
//          Does not invent conversation facts; sections supplied by caller.
// CONNECTS TO: work-project, project-document, calendar-event

import { prisma } from "@niov/database";
import { createProjectGoogleDocument } from "./project-document.service.js";
import type { ProjectDocumentSections } from "./project-document-body.js";
import { createCalendarEvent } from "../connector/calendar-event.service.js";
import type { ArtifactChoice } from "./artifact-from-communication.js";

export async function runProjectKickoffLoop(args: {
  actor_entity_id: string;
  org_entity_id: string;
  project_id: string;
  caller_confirmed: boolean;
  sections: ProjectDocumentSections;
  document_title?: string;
  /** Otzar OS artifact choice from communication context. */
  artifact?: ArtifactChoice;
  meeting?: {
    title: string;
    start: string;
    end: string;
    participants?: Array<{ label: string; resolved?: boolean; entity_id?: string }>;
  };
  conversation_id?: string;
  organization_label?: string;
}): Promise<
  | {
      ok: true;
      project_id: string;
      artifact: ArtifactChoice | null;
      document: {
        document_id: string;
        web_view_link: string | null;
        body_inserted: boolean;
        body_char_count: number;
        title: string;
      } | null;
      meeting: {
        event_id: string;
        html_link: string | null;
        start: string;
        end: string;
      } | null;
    }
  | { ok: false; code: string }
> {
  if (args.caller_confirmed !== true) {
    return { ok: false, code: "NEEDS_CALLER_CONFIRMATION" };
  }

  const project = await prisma.workProject.findUnique({
    where: { project_id: args.project_id },
  });
  if (project === null) return { ok: false, code: "PROJECT_NOT_FOUND" };
  if (project.org_entity_id !== args.org_entity_id) {
    return { ok: false, code: "CROSS_ORG" };
  }
  if (project.state === "ARCHIVED") return { ok: false, code: "PROJECT_ARCHIVED" };

  const membership = await prisma.workProjectMember.findUnique({
    where: {
      project_id_entity_id: {
        project_id: args.project_id,
        entity_id: args.actor_entity_id,
      },
    },
  });
  if (membership === null) return { ok: false, code: "NOT_PROJECT_MEMBER" };

  const artifact = args.artifact ?? null;
  // Materialize only when communication chose a rail we can create now
  // (e.g. Google Docs). Slides/other: Twin still claims work (caller path).
  const shouldMaterialize =
    artifact === null || artifact.materialize_now === true;

  let document: {
    document_id: string;
    web_view_link: string | null;
    body_inserted: boolean;
    body_char_count: number;
    title: string;
  } | null = null;

  if (shouldMaterialize) {
    const doc = await createProjectGoogleDocument({
      actor_entity_id: args.actor_entity_id,
      org_entity_id: args.org_entity_id,
      project_id: args.project_id,
      caller_confirmed: true,
      sections: args.sections,
      artifact_type: artifact?.title_label ?? "Project brief",
      ...(typeof args.document_title === "string"
        ? { title: args.document_title }
        : artifact
          ? { title: `${artifact.title_label} — ${project.name}` }
          : {}),
      ...(typeof args.conversation_id === "string"
        ? { conversation_id: args.conversation_id }
        : {}),
      ...(typeof args.organization_label === "string"
        ? { organization_label: args.organization_label }
        : {}),
    });
    if (!doc.ok) return { ok: false, code: doc.code };
    document = {
      document_id: doc.document_id,
      web_view_link: doc.web_view_link,
      body_inserted: doc.body_inserted,
      body_char_count: doc.body_char_count,
      title: doc.title,
    };
  }

  let meeting: {
    event_id: string;
    html_link: string | null;
    start: string;
    end: string;
  } | null = null;

  if (args.meeting) {
    const participants = (args.meeting.participants ?? []).map((p) => ({
      label: p.label,
      resolved: p.resolved === true || typeof p.entity_id === "string",
      ...(typeof p.entity_id === "string" ? { entity_id: p.entity_id } : {}),
    }));
    // If no participants supplied, self-resolved so gates pass.
    const party =
      participants.length > 0
        ? participants
        : [{ label: "Organizer", resolved: true, entity_id: args.actor_entity_id }];

    const cal = await createCalendarEvent({
      actor_entity_id: args.actor_entity_id,
      org_entity_id: args.org_entity_id,
      input: {
        title: args.meeting.title,
        participants: party,
        selected_time: {
          start: args.meeting.start,
          end: args.meeting.end,
        },
        participant_confirmations_satisfied: true,
        caller_confirmed: true,
        requires_approval: false,
        project_id: args.project_id,
        ...(typeof args.conversation_id === "string"
          ? { conversation_id: args.conversation_id }
          : {}),
      },
    });
    if (cal.ok === false) {
      // Document already exists — return partial with meeting code.
      return {
        ok: false,
        code: `MEETING_${cal.code}`,
      };
    }
    meeting = {
      event_id: cal.event_id,
      html_link: cal.html_link,
      start: cal.start,
      end: cal.end,
    };
  }

  return {
    ok: true,
    project_id: args.project_id,
    artifact,
    document,
    meeting,
  };
}
