// FILE: otzar-work-project.routes.ts
// PURPOSE: Phase 1 PR 2 — HTTP surface for the WorkProject
//          substrate landed at PR #280. Self-scoped employee
//          routes (no admin gate) for the project lifecycle.
//
//          - POST /api/v1/otzar/work-projects
//          - GET  /api/v1/otzar/work-projects
//          - POST /api/v1/otzar/work-projects/:project_id/archive
//          - POST /api/v1/otzar/work-projects/:project_id/members
//          - GET  /api/v1/otzar/work-projects/:project_id/members
//
// PRIVACY INVARIANT:
//   - Response always projects through projectWorkProjectSafeView
//     / projectWorkProjectMemberSafeView (no archived_at /
//     created_by_entity_id / org_entity_id surface).
//   - Cross-tenant + membership guards at the service tier.
//
// CONNECTS TO:
//   - apps/api/src/services/otzar/work-project.service.ts
//   - apps/api/src/services/auth.service.ts
//   - apps/api/src/services/governance/org.ts (getOrgEntityId)

import type { FastifyInstance } from "fastify";
import type { AuthService } from "../services/auth.service.js";
import { getOrgEntityId } from "../services/governance/org.js";
import {
  addWorkProjectMemberForCaller,
  archiveWorkProjectForCaller,
  createWorkProjectForCaller,
  listWorkProjectMembersForCaller,
  listWorkProjectsForCaller,
  listProjectColleaguesForCaller,
  listManagerStructureGaps,
  type WorkProjectMemberRole,
  type WorkProjectState,
} from "../services/otzar/work-project.service.js";
import { createProjectGoogleDocument } from "../services/otzar/project-document.service.js";
import type { ProjectDocumentSections } from "../services/otzar/project-document-body.js";
import { runProjectKickoffLoop } from "../services/otzar/project-execution-loop.service.js";
import { resolveProjectFromText } from "../services/otzar/project-context-resolve.js";
import { extractProjectSectionsFromTranscript } from "../services/otzar/project-transcript-extract.js";
import { openTwinWorkFromExtract } from "../services/otzar/twin-work-claim.service.js";

function bearerFrom(value: string | string[] | undefined): string | null {
  if (typeof value !== "string" || !value.startsWith("Bearer ")) return null;
  const token = value.slice("Bearer ".length).trim();
  return token.length === 0 ? null : token;
}

const VALID_STATES: ReadonlyArray<WorkProjectState> = ["ACTIVE", "ARCHIVED"];
const VALID_ROLES: ReadonlyArray<WorkProjectMemberRole> = [
  "OWNER",
  "MEMBER",
  "REVIEWER",
];

function httpCodeForFailure(code: string): number {
  if (code.startsWith("MEETING_")) return 409;
  switch (code) {
    case "PROJECT_NOT_FOUND":
      return 404;
    case "NOT_PROJECT_OWNER":
    case "NOT_PROJECT_MEMBER":
    case "CROSS_ORG_DENIED":
    case "CROSS_ORG":
    case "POLICY_BLOCKED":
      return 403;
    case "PROJECT_ARCHIVED":
    case "ALREADY_ARCHIVED":
    case "ALREADY_MEMBER":
    case "BODY_NOT_USEFUL":
    case "BODY_REQUIRED":
    case "BODY_INSERT_FAILED":
    case "NEEDS_CALLER_CONFIRMATION":
    case "DOC_WRITE_SCOPE_MISSING":
    case "GOOGLE_RECONNECT_REQUIRED":
      return 409;
    case "PROVIDER_ERROR":
      return 502;
    default:
      return 400;
  }
}

function parseSections(raw: unknown): ProjectDocumentSections {
  if (raw === null || typeof raw !== "object") return {};
  return raw as ProjectDocumentSections;
}

export async function registerOtzarWorkProjectRoutes(
  app: FastifyInstance,
  authService: AuthService,
): Promise<void> {
  // POST create
  app.post<{ Body: { name?: unknown } }>(
    "/api/v1/otzar/work-projects",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null) {
        return reply.code(401).send({
          ok: false,
          code: "SESSION_INVALID",
          message: "Missing bearer token",
        });
      }
      const session = await authService.validateSession(token, "read");
      if (!session.valid) {
        return reply
          .code(401)
          .send({ ok: false, code: session.code, message: "denied" });
      }
      const body = request.body ?? {};
      if (typeof body.name !== "string" || body.name.length === 0) {
        return reply.code(422).send({
          ok: false,
          code: "INVALID_REQUEST",
          message: "name is required (non-empty string)",
        });
      }
      const { getOrgEntityId } = await import(
        "../services/governance/org.js"
      );
      let orgEntityId: string | null;
      try {
        orgEntityId = await getOrgEntityId(session.entity_id);
      } catch {
        orgEntityId = null;
      }
      if (orgEntityId === null) {
        return reply.code(403).send({
          ok: false,
          code: "ORG_NOT_RESOLVED",
          message: "Caller has no resolvable org context",
        });
      }
      const view = await createWorkProjectForCaller({
        callerEntityId: session.entity_id,
        orgEntityId,
        name: body.name,
      });
      return reply.code(201).send({ ok: true, project: view });
    },
  );

  // GET list
  app.get<{ Querystring: { state?: string; take?: string } }>(
    "/api/v1/otzar/work-projects",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null) {
        return reply.code(401).send({
          ok: false,
          code: "SESSION_INVALID",
          message: "Missing bearer token",
        });
      }
      const session = await authService.validateSession(token, "read");
      if (!session.valid) {
        return reply
          .code(401)
          .send({ ok: false, code: session.code, message: "denied" });
      }
      let stateFilter: WorkProjectState | undefined;
      if (typeof request.query.state === "string") {
        if (
          !(VALID_STATES as ReadonlyArray<string>).includes(
            request.query.state,
          )
        ) {
          return reply.code(422).send({
            ok: false,
            code: "INVALID_REQUEST",
            message: "state must be a closed-vocab value when provided",
          });
        }
        stateFilter = request.query.state as WorkProjectState;
      }
      let takeNum: number | undefined;
      if (typeof request.query.take === "string") {
        const parsed = Number.parseInt(request.query.take, 10);
        if (Number.isFinite(parsed) && parsed > 0) takeNum = parsed;
      }
      const projects = await listWorkProjectsForCaller({
        callerEntityId: session.entity_id,
        state: stateFilter,
        take: takeNum,
      });
      return reply.code(200).send({ ok: true, projects });
    },
  );

  // GET manager view: direct reports without a project + projects I lead.
  app.get(
    "/api/v1/otzar/work-projects/manager-structure-gaps",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null) {
        return reply.code(401).send({
          ok: false,
          code: "SESSION_INVALID",
          message: "Missing bearer token",
        });
      }
      const session = await authService.validateSession(token, "read");
      if (!session.valid) {
        return reply
          .code(401)
          .send({ ok: false, code: session.code, message: "denied" });
      }
      const result = await listManagerStructureGaps({
        callerEntityId: session.entity_id,
      });
      if (result.ok === false) {
        return reply
          .code(404)
          .send({ ok: false, code: result.code, message: "no org" });
      }
      return reply.code(200).send({
        ok: true,
        reports: result.reports,
        my_led_projects: result.my_led_projects,
      });
    },
  );

  // GET org colleagues for project invite picker (names only — no raw UUIDs in UI).
  app.get(
    "/api/v1/otzar/work-projects/colleagues",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null) {
        return reply.code(401).send({
          ok: false,
          code: "SESSION_INVALID",
          message: "Missing bearer token",
        });
      }
      const session = await authService.validateSession(token, "read");
      if (!session.valid) {
        return reply
          .code(401)
          .send({ ok: false, code: session.code, message: "denied" });
      }
      const result = await listProjectColleaguesForCaller({
        callerEntityId: session.entity_id,
      });
      if (result.ok === false) {
        return reply
          .code(404)
          .send({ ok: false, code: result.code, message: "no org" });
      }
      return reply
        .code(200)
        .send({ ok: true, colleagues: result.colleagues });
    },
  );

  // POST archive
  app.post<{ Params: { project_id: string } }>(
    "/api/v1/otzar/work-projects/:project_id/archive",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null) {
        return reply.code(401).send({
          ok: false,
          code: "SESSION_INVALID",
          message: "Missing bearer token",
        });
      }
      const session = await authService.validateSession(token, "read");
      if (!session.valid) {
        return reply
          .code(401)
          .send({ ok: false, code: session.code, message: "denied" });
      }
      const result = await archiveWorkProjectForCaller({
        callerEntityId: session.entity_id,
        projectId: request.params.project_id,
      });
      if (!result.ok) {
        return reply.code(httpCodeForFailure(result.code)).send(result);
      }
      return reply.code(200).send(result);
    },
  );

  // POST addMember
  app.post<{
    Params: { project_id: string };
    Body: { entity_id?: unknown; role?: unknown };
  }>(
    "/api/v1/otzar/work-projects/:project_id/members",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null) {
        return reply.code(401).send({
          ok: false,
          code: "SESSION_INVALID",
          message: "Missing bearer token",
        });
      }
      const session = await authService.validateSession(token, "read");
      if (!session.valid) {
        return reply
          .code(401)
          .send({ ok: false, code: session.code, message: "denied" });
      }
      const body = request.body ?? {};
      if (typeof body.entity_id !== "string" || body.entity_id.length === 0) {
        return reply.code(422).send({
          ok: false,
          code: "INVALID_REQUEST",
          message: "entity_id is required (non-empty string)",
        });
      }
      if (
        body.role !== undefined &&
        (typeof body.role !== "string" ||
          !(VALID_ROLES as ReadonlyArray<string>).includes(body.role))
      ) {
        return reply.code(422).send({
          ok: false,
          code: "INVALID_REQUEST",
          message: "role must be a closed-vocab value when provided",
        });
      }
      const result = await addWorkProjectMemberForCaller({
        callerEntityId: session.entity_id,
        projectId: request.params.project_id,
        entityId: body.entity_id,
        role:
          typeof body.role === "string"
            ? (body.role as WorkProjectMemberRole)
            : undefined,
      });
      if (!result.ok) {
        return reply.code(httpCodeForFailure(result.code)).send(result);
      }
      return reply.code(201).send(result);
    },
  );

  // GET members
  app.get<{ Params: { project_id: string } }>(
    "/api/v1/otzar/work-projects/:project_id/members",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null) {
        return reply.code(401).send({
          ok: false,
          code: "SESSION_INVALID",
          message: "Missing bearer token",
        });
      }
      const session = await authService.validateSession(token, "read");
      if (!session.valid) {
        return reply
          .code(401)
          .send({ ok: false, code: session.code, message: "denied" });
      }
      const result = await listWorkProjectMembersForCaller({
        callerEntityId: session.entity_id,
        projectId: request.params.project_id,
      });
      if (!result.ok) {
        return reply.code(httpCodeForFailure(result.code)).send(result);
      }
      return reply.code(200).send(result);
    },
  );

  // POST project-linked non-empty Google Doc (structured body required)
  app.post<{
    Params: { project_id: string };
    Body: Record<string, unknown>;
  }>(
    "/api/v1/otzar/work-projects/:project_id/documents/google",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null) {
        return reply.code(401).send({
          ok: false,
          code: "SESSION_INVALID",
          message: "Missing bearer token",
        });
      }
      const session = await authService.validateSession(token, "write");
      if (!session.valid) {
        return reply
          .code(401)
          .send({ ok: false, code: session.code, message: "denied" });
      }
      let orgEntityId: string;
      try {
        orgEntityId = await getOrgEntityId(session.entity_id);
      } catch {
        return reply.code(404).send({ ok: false, code: "NO_ORG_FOR_CALLER" });
      }
      const body = request.body ?? {};
      const result = await createProjectGoogleDocument({
        actor_entity_id: session.entity_id,
        org_entity_id: orgEntityId,
        project_id: request.params.project_id,
        caller_confirmed: body.caller_confirmed === true,
        sections: parseSections(body.sections),
        ...(typeof body.title === "string" ? { title: body.title } : {}),
        ...(typeof body.artifact_type === "string"
          ? { artifact_type: body.artifact_type }
          : {}),
        ...(typeof body.conversation_id === "string"
          ? { conversation_id: body.conversation_id }
          : {}),
        ...(typeof body.organization_label === "string"
          ? { organization_label: body.organization_label }
          : {}),
      });
      if (!result.ok) {
        return reply.code(httpCodeForFailure(result.code)).send(result);
      }
      return reply.code(200).send({
        ok: true,
        source_kind: "google_docs",
        document_id: result.document_id,
        title: result.title,
        web_view_link: result.web_view_link,
        body_inserted: result.body_inserted,
        body_char_count: result.body_char_count,
        section_count: result.section_count,
        project_id: result.project_id,
      });
    },
  );

  // POST extract structured sections from transcript (deterministic; no LLM invent)
  app.post<{ Body: Record<string, unknown> }>(
    "/api/v1/otzar/work-projects/extract-from-transcript",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null) {
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      }
      const session = await authService.validateSession(token, "read");
      if (!session.valid) {
        return reply.code(401).send({ ok: false, code: session.code });
      }
      const body = request.body ?? {};
      const transcript =
        typeof body.transcript === "string" ? body.transcript : "";
      if (transcript.trim().length < 20) {
        return reply
          .code(422)
          .send({ ok: false, code: "INVALID_INPUT", message: "transcript required" });
      }
      const extracted = extractProjectSectionsFromTranscript({
        transcript,
        ...(typeof body.project_name === "string"
          ? { project_name: body.project_name }
          : {}),
      });
      return reply.code(200).send({
        ok: true,
        extraction: {
          speakers: extracted.speakers,
          meeting_required: extracted.meeting_required,
          body_useful: extracted.body_useful,
          body_preview_chars: extracted.body_preview_chars,
          decisions_confirmed: extracted.decisions_confirmed,
          requirements_proposed: extracted.requirements_proposed,
          sections: extracted.sections,
          // Communication is the OS: Otzar chooses the work product.
          artifact: extracted.artifact,
        },
      });
    },
  );

  // POST resolve text → project (honest classification; no silent attach)
  app.post<{ Body: Record<string, unknown> }>(
    "/api/v1/otzar/work-projects/resolve-context",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null) {
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      }
      const session = await authService.validateSession(token, "read");
      if (!session.valid) {
        return reply.code(401).send({ ok: false, code: session.code });
      }
      const projects = await listWorkProjectsForCaller({
        callerEntityId: session.entity_id,
        state: "ACTIVE",
        take: 100,
      });
      const text =
        typeof request.body?.text === "string" ? request.body.text : "";
      const resolved = resolveProjectFromText({
        text,
        projects: projects.map((p) => ({
          project_id: p.project_id,
          name: p.name,
        })),
      });
      return reply.code(200).send({ ok: true, resolution: resolved });
    },
  );

  // POST kickoff loop: non-empty doc + optional calendar, same project_id
  app.post<{
    Params: { project_id: string };
    Body: Record<string, unknown>;
  }>(
    "/api/v1/otzar/work-projects/:project_id/kickoff",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null) {
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      }
      const session = await authService.validateSession(token, "write");
      if (!session.valid) {
        return reply.code(401).send({ ok: false, code: session.code });
      }
      let orgEntityId: string;
      try {
        orgEntityId = await getOrgEntityId(session.entity_id);
      } catch {
        return reply.code(404).send({ ok: false, code: "NO_ORG_FOR_CALLER" });
      }
      const body = request.body ?? {};
      const meetingRaw = body.meeting;
      let meeting:
        | {
            title: string;
            start: string;
            end: string;
            participants?: Array<{
              label: string;
              resolved?: boolean;
              entity_id?: string;
            }>;
          }
        | undefined;
      if (meetingRaw !== null && typeof meetingRaw === "object") {
        const m = meetingRaw as Record<string, unknown>;
        if (
          typeof m.title === "string" &&
          typeof m.start === "string" &&
          typeof m.end === "string"
        ) {
          meeting = {
            title: m.title,
            start: m.start,
            end: m.end,
            ...(Array.isArray(m.participants)
              ? {
                  participants: (m.participants as unknown[]).map((p) => {
                    const o = (p ?? {}) as Record<string, unknown>;
                    return {
                      label: typeof o.label === "string" ? o.label : "",
                      ...(typeof o.resolved === "boolean"
                        ? { resolved: o.resolved }
                        : {}),
                      ...(typeof o.entity_id === "string"
                        ? { entity_id: o.entity_id }
                        : {}),
                    };
                  }),
                }
              : {}),
          };
        }
      }

      // Prefer explicit sections; else extract from transcript when supplied.
      let sections = parseSections(body.sections);
      let extractionMeta: Record<string, unknown> | undefined;
      let artifactFromComms:
        | import("../services/otzar/artifact-from-communication.js").ArtifactChoice
        | undefined;
      if (
        Object.keys(sections).length === 0 &&
        typeof body.transcript === "string" &&
        body.transcript.trim().length >= 20
      ) {
        // Load project name for extract context
        const projects = await listWorkProjectsForCaller({
          callerEntityId: session.entity_id,
          take: 100,
        });
        const mine = projects.find(
          (p) => p.project_id === request.params.project_id,
        );
        const extracted = extractProjectSectionsFromTranscript({
          transcript: body.transcript,
          project_name: mine?.name,
        });
        sections = extracted.sections;
        artifactFromComms = extracted.artifact;
        extractionMeta = {
          speakers: extracted.speakers,
          meeting_required: extracted.meeting_required,
          body_useful: extracted.body_useful,
          source: "transcript_deterministic",
          artifact: extracted.artifact,
        };
        // Auto-suggest meeting block from extract if caller omitted meeting
        // but set meeting_start/end on body.
        if (
          !meeting &&
          extracted.meeting_required &&
          typeof body.meeting_start === "string" &&
          typeof body.meeting_end === "string"
        ) {
          meeting = {
            title:
              typeof body.meeting_title === "string"
                ? body.meeting_title
                : `Kickoff — ${mine?.name ?? "project"}`,
            start: body.meeting_start,
            end: body.meeting_end,
          };
        }
      }

      const result = await runProjectKickoffLoop({
        actor_entity_id: session.entity_id,
        org_entity_id: orgEntityId,
        project_id: request.params.project_id,
        caller_confirmed: body.caller_confirmed === true,
        sections,
        ...(artifactFromComms ? { artifact: artifactFromComms } : {}),
        ...(typeof body.document_title === "string"
          ? { document_title: body.document_title }
          : artifactFromComms
            ? {
                document_title: `${artifactFromComms.title_label} — project work`,
              }
            : {}),
        ...(meeting ? { meeting } : {}),
        ...(typeof body.conversation_id === "string"
          ? { conversation_id: body.conversation_id }
          : {}),
        ...(typeof body.organization_label === "string"
          ? { organization_label: body.organization_label }
          : {}),
      });
      if (!result.ok) {
        return reply.code(httpCodeForFailure(result.code)).send(result);
      }

      // AI Teammate claims the communication-chosen artifact + next actions.
      let twin_claims: unknown[] | undefined;
      if (body.claim_twin_work !== false) {
        const nextActions =
          (sections.next_actions as
            | Array<{ text: string; status: string; owner_label?: string }>
            | undefined) ?? [];
        const accuracy =
          body.accuracy_class === "REGULATED_HEALTH" ||
          body.accuracy_class === "REGULATED_FINANCE" ||
          body.accuracy_class === "INSURANCE" ||
          body.accuracy_class === "STANDARD"
            ? body.accuracy_class
            : (artifactFromComms?.accuracy_class ?? "STANDARD");
        const docTitle =
          result.document?.title ??
          (artifactFromComms
            ? `${artifactFromComms.title_label} (Twin preparing — provider pending)`
            : "Project work");
        const opened = await openTwinWorkFromExtract({
          org_entity_id: orgEntityId,
          human_entity_id: session.entity_id,
          project_id: result.project_id,
          ...(result.document
            ? {
                document_id: result.document.document_id,
                web_view_link: result.document.web_view_link,
              }
            : {}),
          document_title: docTitle,
          accuracy_class: accuracy,
          next_actions: nextActions.map((a) => ({
            text: a.text,
            status:
              a.status === "confirmed" ||
              a.status === "proposed" ||
              a.status === "rejected" ||
              a.status === "unresolved" ||
              a.status === "corrected"
                ? a.status
                : "proposed",
            ...(a.owner_label ? { owner_label: a.owner_label } : {}),
          })),
        });
        if (opened.ok) {
          twin_claims = opened.claims.map((c) =>
            c.ok
              ? {
                  ok: true,
                  ledger_entry_id: c.entry.ledger_entry_id,
                  status: c.entry.status,
                  title: c.entry.title,
                }
              : { ok: false, code: c.code },
          );
        }
      }

      return reply.code(200).send({
        ok: true,
        project_id: result.project_id,
        artifact: result.artifact,
        document: result.document,
        meeting: result.meeting,
        ...(extractionMeta ? { extraction: extractionMeta } : {}),
        ...(twin_claims ? { twin_claims } : {}),
      });
    },
  );
}
