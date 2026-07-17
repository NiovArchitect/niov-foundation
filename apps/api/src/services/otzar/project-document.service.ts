// FILE: project-document.service.ts
// PURPOSE: Project-centered Google Doc creation — WorkProject membership
//          gate + structured non-empty body + provider create + ledger link.
//          Does not invent conversation facts; caller supplies sections.
// CONNECTS TO: work-project.service, project-document-body, google-doc.service

import { prisma } from "@niov/database";
import { createGoogleDoc } from "../connector/google-doc.service.js";
import {
  buildProjectDocumentBody,
  isUsefulDocumentBody,
  minUsefulBodyChars,
  type ProjectDocumentSections,
} from "./project-document-body.js";

export async function createProjectGoogleDocument(args: {
  actor_entity_id: string;
  org_entity_id: string;
  project_id: string;
  caller_confirmed: boolean;
  sections: ProjectDocumentSections;
  title?: string;
  artifact_type?: string;
  conversation_id?: string;
  organization_label?: string;
}): Promise<
  | {
      ok: true;
      document_id: string;
      title: string;
      web_view_link: string | null;
      body_inserted: boolean;
      body_char_count: number;
      section_count: number;
      project_id: string;
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

  const built = buildProjectDocumentBody({
    project_name: project.name,
    organization_label: args.organization_label,
    artifact_type: args.artifact_type ?? "Project brief",
    sections: args.sections,
  });
  if (
    !isUsefulDocumentBody(built.body) ||
    built.char_count < minUsefulBodyChars()
  ) {
    return { ok: false, code: "BODY_NOT_USEFUL" };
  }

  const title =
    typeof args.title === "string" && args.title.trim().length > 0
      ? args.title.trim()
      : `${args.artifact_type ?? "Project brief"} — ${project.name}`;

  const result = await createGoogleDoc({
    actor_entity_id: args.actor_entity_id,
    org_entity_id: args.org_entity_id,
    input: {
      title,
      body_text: built.body,
      require_body: true,
      caller_confirmed: true,
      project_id: project.project_id,
      ...(typeof args.conversation_id === "string"
        ? { conversation_id: args.conversation_id }
        : {}),
      artifact_type: args.artifact_type ?? "project_brief",
      source_command: "project_document_create",
      owner_entity_id: args.actor_entity_id,
    },
  });
  if (result.ok === false) return { ok: false, code: result.code };

  return {
    ok: true,
    document_id: result.document_id,
    title: result.title,
    web_view_link: result.web_view_link,
    body_inserted: result.body_inserted,
    body_char_count: result.body_char_count,
    section_count: built.section_count,
    project_id: project.project_id,
  };
}
