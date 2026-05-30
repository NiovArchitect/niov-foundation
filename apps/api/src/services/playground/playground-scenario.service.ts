// FILE: playground-scenario.service.ts
// PURPOSE: Section 5 Wave 4 — Agent Playground persistent named
//          scenarios per ADR-0065 §7 Wave 4. SAFE persistence layer
//          for the future candidate-generation (Wave 5), outcome-
//          comparison (Wave 6), best-path-recommender (Wave 7), and
//          governed-transition-to-Action (Wave 8) substrate.
//
//          Wave 4 itself implements NO execution, NO LLM generation,
//          NO multi-agent orchestration, NO external provider calls,
//          NO Action creation, NO ActionAttempt creation, NO
//          connector invocation, NO MemoryCapsule creation, NO
//          OtzarConversation creation. Owner-first self-scope at
//          every gate per ADR-0065 §12 RULE 0 universal; org match
//          enforced same-org when the stored `org_entity_id` is
//          non-null.
//
//          status + scenario_type are closed-vocab String (not
//          Prisma enums) per ADR-0065 §7 Wave 4 + the Hive /
//          MemoryCapsule String + service-validation precedent.
//          Soft-archive only (RULE 10): DELETE flips status to
//          ARCHIVED + sets archived_at; the row is never deleted.
//          Audit emission via ADMIN_ACTION + details.action
//          discriminator pattern (ADR-0065 §10; no new audit
//          literal). Safe details only — no title / description /
//          goal_summary text / raw Json payloads enter the audit row.
// CONNECTS TO:
//   - apps/api/src/services/auth.service.ts (validateSession with
//     "read" scope per ADR-0060 §3 / Wave 2 precedent)
//   - apps/api/src/services/governance/org.ts (getOrgEntityId at
//     create-time; NOT_IN_ANY_ORG tolerated as null)
//   - packages/database/src/queries/audit.ts (writeAuditEvent —
//     ADMIN_ACTION + details.action discriminator)
//   - packages/database/prisma/schema.prisma (PlaygroundScenario
//     model)
//   - ADR-0065 §7 Wave 4 contract + §10 audit posture + §12 RULE 0
//     universal
//   - ADR-0025 (Schema-Push-Target Discipline; the schema lives
//     behind the npm run db:push:test wrapper)

import {
  prisma,
  writeAuditEvent,
  type PlaygroundScenario,
} from "@niov/database";
import type { AuthService } from "../auth.service.js";
import { getOrgEntityId } from "../governance/org.js";

// WHAT: The closed-vocabulary status set for PlaygroundScenario.status.
// INPUT: Used as a constant + a type guard predicate source.
// OUTPUT: A readonly tuple of the three valid status labels.
// WHY: Founder Wave 4 spec locks DRAFT / READY / ARCHIVED. Stored as
//      String at the column tier per ADR-0065 §7 Wave 4 (no Prisma
//      enum); service-tier validation is the canonical enforcement
//      site. Mirrors the Hive.governance_terms + MemoryCapsule
//      capsule_type String + closed-vocab service precedent.
export const PLAYGROUND_SCENARIO_STATUS_VALUES = [
  "DRAFT",
  "READY",
  "ARCHIVED",
] as const;
export type PlaygroundScenarioStatus =
  (typeof PLAYGROUND_SCENARIO_STATUS_VALUES)[number];

// WHAT: The closed-vocabulary scenario_type set.
// INPUT: Used as a constant + a type guard predicate source.
// OUTPUT: A readonly tuple of the three valid scenario_type labels.
// WHY: Founder Wave 4 spec locks MANUAL / FIXTURE / FUTURE_GENERATED.
//      FUTURE_GENERATED is reserved for Wave 5 candidate generation;
//      no Wave 4 route produces it but the value is allowed in the
//      column for forward compatibility per Founder direction.
export const PLAYGROUND_SCENARIO_TYPE_VALUES = [
  "MANUAL",
  "FIXTURE",
  "FUTURE_GENERATED",
] as const;
export type PlaygroundScenarioType =
  (typeof PLAYGROUND_SCENARIO_TYPE_VALUES)[number];

// WHAT: The unified failure code surface for all 5 scenario routes.
// INPUT: Used as a return discriminator only.
// OUTPUT: None.
// WHY: Mirrors the existing PlaygroundFailureCode pattern from Wave 2
//      + adds SCENARIO_NOT_FOUND for the enumeration-safe 404 used by
//      detail/update/archive. Auth failures inherit from
//      AuthService.validateSession; INVALID_REQUEST covers body-shape
//      violations; INTERNAL_ERROR is the catch-all. The cross-owner
//      404 case folds into SCENARIO_NOT_FOUND so callers can't
//      distinguish "not yours" from "doesn't exist".
export type PlaygroundScenarioFailureCode =
  | "SESSION_INVALID"
  | "SESSION_EXPIRED"
  | "SESSION_REVOKED"
  | "SESSION_INVALIDATED"
  | "OPERATION_NOT_PERMITTED"
  | "SCENARIO_NOT_FOUND"
  | "INVALID_REQUEST"
  | "INTERNAL_ERROR";

export interface PlaygroundScenarioFailure {
  ok: false;
  code: PlaygroundScenarioFailureCode;
  message: string;
  invalid_fields?: readonly string[];
}

// WHAT: The SAFE projection of one PlaygroundScenario row for any
//        list/detail/create/update response.
// INPUT: Used as a return type only.
// OUTPUT: None.
// WHY: Mirrors the Wave 2 working-set inspector SAFE projection
//      discipline and the Hive admin detail projection: every wire
//      field is enumerated here; raw payloads never leak. The 4 Json
//      fields (input_refs / constraints / expected_outputs /
//      governance_findings) are passed through verbatim because
//      Wave 4 callers are scenario AUTHORS reading their own
//      payloads back — the no-leak boundary applies to the AUDIT
//      surface (where the Json payloads are forbidden) and to any
//      future cross-owner / org-admin browsing surface (forbidden
//      at Wave 4 by construction since list/detail are owner-first).
export interface PlaygroundScenarioView {
  scenario_id: string;
  owner_entity_id: string;
  org_entity_id: string | null;
  title: string;
  description: string | null;
  goal_summary: string | null;
  status: PlaygroundScenarioStatus;
  scenario_type: PlaygroundScenarioType;
  input_refs: Record<string, unknown>;
  constraints: Record<string, unknown>;
  expected_outputs: Record<string, unknown>;
  governance_findings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface CreateScenarioSuccess {
  ok: true;
  scenario: PlaygroundScenarioView;
  audit_event_id: string;
}

export interface ListScenariosSuccess {
  ok: true;
  scenarios: readonly PlaygroundScenarioView[];
}

export interface GetScenarioSuccess {
  ok: true;
  scenario: PlaygroundScenarioView;
}

export interface UpdateScenarioSuccess {
  ok: true;
  scenario: PlaygroundScenarioView;
  audit_event_id: string;
}

export interface ArchiveScenarioSuccess {
  ok: true;
  scenario: PlaygroundScenarioView;
  already_archived: boolean;
  audit_event_id: string | null;
}

// WHAT: Body shape for POST /api/v1/playground/scenarios.
// INPUT: Used as a parameter type.
// OUTPUT: None.
// WHY: All fields are unknown at the route boundary; the service
//      tier validates shape + closed-vocab membership. owner_entity_id
//      + org_entity_id MUST NOT be supplied by the caller — both are
//      derived from the session.
export interface CreateScenarioInput {
  title?: unknown;
  description?: unknown;
  goal_summary?: unknown;
  status?: unknown;
  scenario_type?: unknown;
  input_refs?: unknown;
  constraints?: unknown;
  expected_outputs?: unknown;
  governance_findings?: unknown;
}

// WHAT: Body shape for PUT /api/v1/playground/scenarios/:id.
// INPUT: Used as a parameter type.
// OUTPUT: None.
// WHY: Same fields as create EXCEPT title is optional on update.
//      Forbidden fields (owner_entity_id / org_entity_id /
//      scenario_id / created_at / updated_at / archived_at) are
//      rejected at the service tier with INVALID_REQUEST.
export interface UpdateScenarioInput {
  title?: unknown;
  description?: unknown;
  goal_summary?: unknown;
  status?: unknown;
  scenario_type?: unknown;
  input_refs?: unknown;
  constraints?: unknown;
  expected_outputs?: unknown;
  governance_findings?: unknown;
  // Forbidden — included only so the service can detect + reject:
  owner_entity_id?: unknown;
  org_entity_id?: unknown;
  scenario_id?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
  archived_at?: unknown;
}

const TITLE_MAX_LENGTH = 200;
const DESCRIPTION_MAX_LENGTH = 4000;
const GOAL_SUMMARY_MAX_LENGTH = 2000;
const MAX_LIST_LIMIT = 100;
const DEFAULT_LIST_LIMIT = 50;

// WHAT: Type guard for the closed-vocab status set.
function isStatus(value: unknown): value is PlaygroundScenarioStatus {
  return (
    typeof value === "string" &&
    (PLAYGROUND_SCENARIO_STATUS_VALUES as readonly string[]).includes(value)
  );
}

// WHAT: Type guard for the closed-vocab scenario_type set.
function isScenarioType(value: unknown): value is PlaygroundScenarioType {
  return (
    typeof value === "string" &&
    (PLAYGROUND_SCENARIO_TYPE_VALUES as readonly string[]).includes(value)
  );
}

// WHAT: Validate a payload is a plain JSON object (Record<string,
//        unknown>) — accepted shape for the 4 Json columns.
// INPUT: An unknown value.
// OUTPUT: true if value is a non-null, non-array object.
// WHY: Prisma Json columns accept any JSON value, but we restrict
//      Wave 4 inputs to OBJECTS for predictable downstream parsing
//      by Wave 5+. Arrays / strings / numbers / booleans / null are
//      rejected at the service tier with INVALID_REQUEST. This
//      matches the Hive.governance_terms object-only precedent.
function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// WHAT: Project a Prisma row to the SAFE wire shape.
// INPUT: A PlaygroundScenario row.
// OUTPUT: PlaygroundScenarioView with ISO timestamps.
// WHY: Single projection site so all 5 routes return the same
//      shape; insulates the route tier from Prisma's Date /
//      JsonValue types.
function project(row: PlaygroundScenario): PlaygroundScenarioView {
  return {
    scenario_id: row.scenario_id,
    owner_entity_id: row.owner_entity_id,
    org_entity_id: row.org_entity_id,
    title: row.title,
    description: row.description,
    goal_summary: row.goal_summary,
    status: row.status as PlaygroundScenarioStatus,
    scenario_type: row.scenario_type as PlaygroundScenarioType,
    input_refs: (row.input_refs ?? {}) as Record<string, unknown>,
    constraints: (row.constraints ?? {}) as Record<string, unknown>,
    expected_outputs: (row.expected_outputs ?? {}) as Record<string, unknown>,
    governance_findings: (row.governance_findings ?? {}) as Record<
      string,
      unknown
    >,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    archived_at: row.archived_at === null ? null : row.archived_at.toISOString(),
  };
}

// WHAT: Resolve the caller's current org_entity_id, tolerating
//        NOT_IN_ANY_ORG / ORG_HIERARCHY_TOO_DEEP as null.
// INPUT: A caller entity_id.
// OUTPUT: The org entity_id, or null when caller is orgless.
// WHY: Wave 4 supports orgless callers (a PERSON not in any company)
//      per Founder direction — org_entity_id is nullable in the
//      schema. Mirrors the getOrgSettingsOrDefaults tolerant pattern
//      at org.ts:142.
async function resolveCallerOrg(entityId: string): Promise<string | null> {
  try {
    return await getOrgEntityId(entityId);
  } catch (err) {
    if (
      err instanceof Error &&
      (err.message === "NOT_IN_ANY_ORG" ||
        err.message === "ORG_HIERARCHY_TOO_DEEP")
    ) {
      return null;
    }
    throw err;
  }
}

// WHAT: The Agent Playground scenario persistence service — 5
//        owner-first CRUD methods.
// INPUT: AuthService (for bearer + "read" session validation).
// OUTPUT: An instance with 5 async methods (create / list / get /
//         update / archive).
// WHY: Single class so future Wave 5+ candidate-generation /
//      outcome-comparison services can compose against a stable
//      service interface. All methods enforce: (1) bearer + "read"
//      session, (2) owner_entity_id == session.entity_id, (3) when
//      stored org_entity_id is non-null, caller's current org must
//      match. Cross-owner / cross-org / unknown id all surface as
//      SCENARIO_NOT_FOUND (enumeration-safe).
export class PlaygroundScenarioService {
  constructor(private readonly authService: AuthService) {}

  // WHAT: Validate session + return the caller's entity_id on
  //        success.
  // INPUT: Session token.
  // OUTPUT: { ok: true; entity_id } | failure.
  // WHY: Single auth gate shared by all 5 methods.
  private async authenticate(
    sessionToken: string,
  ): Promise<
    | { ok: true; entity_id: string }
    | PlaygroundScenarioFailure
  > {
    const session = await this.authService.validateSession(
      sessionToken,
      "read",
    );
    if (!session.valid) {
      return {
        ok: false,
        code: session.code,
        message: "Playground scenario access denied",
      };
    }
    return { ok: true, entity_id: session.entity_id };
  }

  // WHAT: Create a new named scenario for the authenticated caller.
  // INPUT: Session token + body.
  // OUTPUT: CreateScenarioSuccess | PlaygroundScenarioFailure.
  // WHY: owner_entity_id = session.entity_id (RULE 0 self-scope);
  //      org_entity_id resolved via getOrgEntityId (orgless → null
  //      per Founder direction); status defaults to "DRAFT";
  //      scenario_type defaults to "MANUAL"; the 4 Json fields
  //      default to empty objects. Emits ADMIN_ACTION +
  //      details.action="PLAYGROUND_SCENARIO_CREATED" per ADR-0065
  //      §10 (no new audit literal). Safe audit details only — no
  //      title / description / goal_summary text in the audit row.
  async createScenario(
    sessionToken: string,
    body: CreateScenarioInput,
    context: { ip_address?: string | null } = {},
  ): Promise<CreateScenarioSuccess | PlaygroundScenarioFailure> {
    const auth = await this.authenticate(sessionToken);
    if (auth.ok === false) return auth;

    const invalidFields: string[] = [];

    if (typeof body.title !== "string" || body.title.trim().length === 0) {
      invalidFields.push("title");
    } else if (body.title.length > TITLE_MAX_LENGTH) {
      invalidFields.push("title");
    }

    if (
      body.description !== undefined &&
      body.description !== null &&
      (typeof body.description !== "string" ||
        body.description.length > DESCRIPTION_MAX_LENGTH)
    ) {
      invalidFields.push("description");
    }

    if (
      body.goal_summary !== undefined &&
      body.goal_summary !== null &&
      (typeof body.goal_summary !== "string" ||
        body.goal_summary.length > GOAL_SUMMARY_MAX_LENGTH)
    ) {
      invalidFields.push("goal_summary");
    }

    const status: PlaygroundScenarioStatus =
      body.status === undefined ? "DRAFT" : isStatus(body.status) ? body.status : (invalidFields.push("status"), "DRAFT");

    const scenarioType: PlaygroundScenarioType =
      body.scenario_type === undefined
        ? "MANUAL"
        : isScenarioType(body.scenario_type)
          ? body.scenario_type
          : (invalidFields.push("scenario_type"), "MANUAL");

    const jsonFields = [
      ["input_refs", body.input_refs],
      ["constraints", body.constraints],
      ["expected_outputs", body.expected_outputs],
      ["governance_findings", body.governance_findings],
    ] as const;
    const jsonValues: Record<string, Record<string, unknown>> = {};
    for (const [name, raw] of jsonFields) {
      if (raw === undefined) {
        jsonValues[name] = {};
      } else if (!isJsonObject(raw)) {
        invalidFields.push(name);
        jsonValues[name] = {};
      } else {
        jsonValues[name] = raw;
      }
    }

    if (invalidFields.length > 0) {
      return {
        ok: false,
        code: "INVALID_REQUEST",
        message: "One or more body fields are invalid",
        invalid_fields: invalidFields,
      };
    }

    const orgEntityId = await resolveCallerOrg(auth.entity_id);

    const row = await prisma.playgroundScenario.create({
      data: {
        owner_entity_id: auth.entity_id,
        org_entity_id: orgEntityId,
        title: (body.title as string).trim(),
        description:
          typeof body.description === "string" ? body.description : null,
        goal_summary:
          typeof body.goal_summary === "string" ? body.goal_summary : null,
        status,
        scenario_type: scenarioType,
        input_refs: (jsonValues["input_refs"] ?? {}) as object,
        constraints: (jsonValues["constraints"] ?? {}) as object,
        expected_outputs: (jsonValues["expected_outputs"] ?? {}) as object,
        governance_findings: (jsonValues["governance_findings"] ?? {}) as object,
      },
    });

    const audit = await writeAuditEvent({
      event_type: "ADMIN_ACTION",
      outcome: "SUCCESS",
      actor_entity_id: auth.entity_id,
      target_entity_id: auth.entity_id,
      ip_address: context.ip_address ?? null,
      details: {
        action: "PLAYGROUND_SCENARIO_CREATED",
        scenario_id: row.scenario_id,
        owner_entity_id: row.owner_entity_id,
        org_entity_id: row.org_entity_id,
        status: row.status,
        scenario_type: row.scenario_type,
      },
    });

    return {
      ok: true,
      scenario: project(row),
      audit_event_id: audit.audit_id,
    };
  }

  // WHAT: List the caller's scenarios with optional status filter.
  // INPUT: Session token + optional { status, limit, include_archived }.
  // OUTPUT: ListScenariosSuccess | PlaygroundScenarioFailure.
  // WHY: Owner-first self-scope (where owner_entity_id =
  //      session.entity_id). Default excludes ARCHIVED rows
  //      (archived_at IS NULL) so callers see active scenarios by
  //      default; opt in to archived via include_archived=true OR
  //      status=ARCHIVED. Ordered by created_at DESC (most recent
  //      first) to match the Hive admin list pattern. limit defaults
  //      to 50, cap 100.
  async listScenarios(
    sessionToken: string,
    options: {
      status?: PlaygroundScenarioStatus;
      limit?: number;
      include_archived?: boolean;
    } = {},
  ): Promise<ListScenariosSuccess | PlaygroundScenarioFailure> {
    const auth = await this.authenticate(sessionToken);
    if (auth.ok === false) return auth;

    const limit = Math.min(
      Math.max(1, Math.floor(options.limit ?? DEFAULT_LIST_LIMIT)),
      MAX_LIST_LIMIT,
    );

    const where: {
      owner_entity_id: string;
      status?: PlaygroundScenarioStatus;
      archived_at?: null;
    } = {
      owner_entity_id: auth.entity_id,
    };
    if (options.status !== undefined) {
      where.status = options.status;
    } else if (options.include_archived !== true) {
      where.archived_at = null;
    }

    const rows = await prisma.playgroundScenario.findMany({
      where,
      orderBy: { created_at: "desc" },
      take: limit,
    });

    return {
      ok: true,
      scenarios: rows.map(project),
    };
  }

  // WHAT: Fetch one scenario by id for the authenticated owner.
  // INPUT: Session token + scenario_id.
  // OUTPUT: GetScenarioSuccess | PlaygroundScenarioFailure.
  // WHY: Owner-first lookup. Cross-owner / unknown id both fold to
  //      SCENARIO_NOT_FOUND so callers cannot enumerate other
  //      owners' scenario IDs. When the stored org_entity_id is
  //      non-null, also enforces caller's current org equals stored
  //      org (so a former employee revoked from their old org can't
  //      read a scenario they created at that org).
  async getScenario(
    sessionToken: string,
    scenarioId: string,
  ): Promise<GetScenarioSuccess | PlaygroundScenarioFailure> {
    const auth = await this.authenticate(sessionToken);
    if (auth.ok === false) return auth;

    if (typeof scenarioId !== "string" || scenarioId.length === 0) {
      return {
        ok: false,
        code: "SCENARIO_NOT_FOUND",
        message: "Scenario not found",
      };
    }

    const row = await prisma.playgroundScenario.findFirst({
      where: { scenario_id: scenarioId, owner_entity_id: auth.entity_id },
    });
    if (row === null) {
      return {
        ok: false,
        code: "SCENARIO_NOT_FOUND",
        message: "Scenario not found",
      };
    }

    if (row.org_entity_id !== null) {
      const callerOrg = await resolveCallerOrg(auth.entity_id);
      if (callerOrg !== row.org_entity_id) {
        return {
          ok: false,
          code: "SCENARIO_NOT_FOUND",
          message: "Scenario not found",
        };
      }
    }

    return {
      ok: true,
      scenario: project(row),
    };
  }

  // WHAT: Update title/description/goal_summary/status/scenario_type
  //        + the 4 Json metadata fields for an owner-owned scenario.
  // INPUT: Session token + scenario_id + body.
  // OUTPUT: UpdateScenarioSuccess | PlaygroundScenarioFailure.
  // WHY: Owner-first ownership check first (cross-owner →
  //      SCENARIO_NOT_FOUND). Forbidden-field rejection
  //      (owner_entity_id / org_entity_id / scenario_id /
  //      created_at / updated_at / archived_at) → INVALID_REQUEST
  //      with invalid_fields. status transition to ARCHIVED via PUT
  //      is allowed (it acts as a synonym for DELETE soft-archive
  //      at the column tier, but DOES NOT set archived_at — that's
  //      reserved for the explicit DELETE route per Founder spec).
  //      Emits ADMIN_ACTION + details.action=
  //      "PLAYGROUND_SCENARIO_UPDATED" with safe details.
  async updateScenario(
    sessionToken: string,
    scenarioId: string,
    body: UpdateScenarioInput,
    context: { ip_address?: string | null } = {},
  ): Promise<UpdateScenarioSuccess | PlaygroundScenarioFailure> {
    const auth = await this.authenticate(sessionToken);
    if (auth.ok === false) return auth;

    // Forbidden-field detection (RULE 0 + Founder spec) — these
    // server-owned columns may NOT be supplied by the caller.
    const forbidden: string[] = [];
    if ("owner_entity_id" in body && body.owner_entity_id !== undefined) {
      forbidden.push("owner_entity_id");
    }
    if ("org_entity_id" in body && body.org_entity_id !== undefined) {
      forbidden.push("org_entity_id");
    }
    if ("scenario_id" in body && body.scenario_id !== undefined) {
      forbidden.push("scenario_id");
    }
    if ("created_at" in body && body.created_at !== undefined) {
      forbidden.push("created_at");
    }
    if ("updated_at" in body && body.updated_at !== undefined) {
      forbidden.push("updated_at");
    }
    if ("archived_at" in body && body.archived_at !== undefined) {
      forbidden.push("archived_at");
    }
    if (forbidden.length > 0) {
      return {
        ok: false,
        code: "INVALID_REQUEST",
        message: "One or more body fields are not updatable",
        invalid_fields: forbidden,
      };
    }

    const existing = await prisma.playgroundScenario.findFirst({
      where: { scenario_id: scenarioId, owner_entity_id: auth.entity_id },
    });
    if (existing === null) {
      return {
        ok: false,
        code: "SCENARIO_NOT_FOUND",
        message: "Scenario not found",
      };
    }

    if (existing.org_entity_id !== null) {
      const callerOrg = await resolveCallerOrg(auth.entity_id);
      if (callerOrg !== existing.org_entity_id) {
        return {
          ok: false,
          code: "SCENARIO_NOT_FOUND",
          message: "Scenario not found",
        };
      }
    }

    const invalidFields: string[] = [];
    const data: {
      title?: string;
      description?: string | null;
      goal_summary?: string | null;
      status?: PlaygroundScenarioStatus;
      scenario_type?: PlaygroundScenarioType;
      input_refs?: Record<string, unknown>;
      constraints?: Record<string, unknown>;
      expected_outputs?: Record<string, unknown>;
      governance_findings?: Record<string, unknown>;
    } = {};

    if (body.title !== undefined) {
      if (
        typeof body.title !== "string" ||
        body.title.trim().length === 0 ||
        body.title.length > TITLE_MAX_LENGTH
      ) {
        invalidFields.push("title");
      } else {
        data.title = body.title.trim();
      }
    }

    if (body.description !== undefined) {
      if (body.description === null) {
        data.description = null;
      } else if (
        typeof body.description !== "string" ||
        body.description.length > DESCRIPTION_MAX_LENGTH
      ) {
        invalidFields.push("description");
      } else {
        data.description = body.description;
      }
    }

    if (body.goal_summary !== undefined) {
      if (body.goal_summary === null) {
        data.goal_summary = null;
      } else if (
        typeof body.goal_summary !== "string" ||
        body.goal_summary.length > GOAL_SUMMARY_MAX_LENGTH
      ) {
        invalidFields.push("goal_summary");
      } else {
        data.goal_summary = body.goal_summary;
      }
    }

    if (body.status !== undefined) {
      if (!isStatus(body.status)) {
        invalidFields.push("status");
      } else {
        data.status = body.status;
      }
    }

    if (body.scenario_type !== undefined) {
      if (!isScenarioType(body.scenario_type)) {
        invalidFields.push("scenario_type");
      } else {
        data.scenario_type = body.scenario_type;
      }
    }

    const jsonFields = [
      ["input_refs", body.input_refs],
      ["constraints", body.constraints],
      ["expected_outputs", body.expected_outputs],
      ["governance_findings", body.governance_findings],
    ] as const;
    for (const [name, raw] of jsonFields) {
      if (raw === undefined) continue;
      if (!isJsonObject(raw)) {
        invalidFields.push(name);
        continue;
      }
      (data as Record<string, unknown>)[name] = raw;
    }

    if (invalidFields.length > 0) {
      return {
        ok: false,
        code: "INVALID_REQUEST",
        message: "One or more body fields are invalid",
        invalid_fields: invalidFields,
      };
    }

    const updated = await prisma.playgroundScenario.update({
      where: { scenario_id: existing.scenario_id },
      // The 4 Json columns require the Prisma InputJsonValue family;
      // our local `data` type uses Record<string, unknown> for
      // service-tier ergonomics. The values were validated as plain
      // JSON objects by isJsonObject above, so the cast is safe at
      // the Prisma boundary (mirrors HiveService.createHive
      // `governance_terms: terms as object` precedent at line 399).
      data: data as object,
    });

    const audit = await writeAuditEvent({
      event_type: "ADMIN_ACTION",
      outcome: "SUCCESS",
      actor_entity_id: auth.entity_id,
      target_entity_id: auth.entity_id,
      ip_address: context.ip_address ?? null,
      details: {
        action: "PLAYGROUND_SCENARIO_UPDATED",
        scenario_id: updated.scenario_id,
        owner_entity_id: updated.owner_entity_id,
        org_entity_id: updated.org_entity_id,
        status: updated.status,
        scenario_type: updated.scenario_type,
      },
    });

    return {
      ok: true,
      scenario: project(updated),
      audit_event_id: audit.audit_id,
    };
  }

  // WHAT: Soft-archive a scenario (sets status=ARCHIVED + archived_at).
  // INPUT: Session token + scenario_id.
  // OUTPUT: ArchiveScenarioSuccess | PlaygroundScenarioFailure.
  // WHY: RULE 10 — never DELETE. Sets status="ARCHIVED" + archived_at
  //      = now. Idempotent on already-archived (returns
  //      already_archived=true + audit_event_id=null; emits no new
  //      audit row, mirroring the dissolveHive idempotent precedent).
  //      Cross-owner / unknown id → SCENARIO_NOT_FOUND
  //      (enumeration-safe).
  async archiveScenario(
    sessionToken: string,
    scenarioId: string,
    context: { ip_address?: string | null } = {},
  ): Promise<ArchiveScenarioSuccess | PlaygroundScenarioFailure> {
    const auth = await this.authenticate(sessionToken);
    if (auth.ok === false) return auth;

    const existing = await prisma.playgroundScenario.findFirst({
      where: { scenario_id: scenarioId, owner_entity_id: auth.entity_id },
    });
    if (existing === null) {
      return {
        ok: false,
        code: "SCENARIO_NOT_FOUND",
        message: "Scenario not found",
      };
    }

    if (existing.org_entity_id !== null) {
      const callerOrg = await resolveCallerOrg(auth.entity_id);
      if (callerOrg !== existing.org_entity_id) {
        return {
          ok: false,
          code: "SCENARIO_NOT_FOUND",
          message: "Scenario not found",
        };
      }
    }

    if (existing.status === "ARCHIVED" && existing.archived_at !== null) {
      return {
        ok: true,
        scenario: project(existing),
        already_archived: true,
        audit_event_id: null,
      };
    }

    const updated = await prisma.playgroundScenario.update({
      where: { scenario_id: existing.scenario_id },
      data: {
        status: "ARCHIVED",
        archived_at: new Date(),
      },
    });

    const audit = await writeAuditEvent({
      event_type: "ADMIN_ACTION",
      outcome: "SUCCESS",
      actor_entity_id: auth.entity_id,
      target_entity_id: auth.entity_id,
      ip_address: context.ip_address ?? null,
      details: {
        action: "PLAYGROUND_SCENARIO_ARCHIVED",
        scenario_id: updated.scenario_id,
        owner_entity_id: updated.owner_entity_id,
        org_entity_id: updated.org_entity_id,
        status: updated.status,
        scenario_type: updated.scenario_type,
      },
    });

    return {
      ok: true,
      scenario: project(updated),
      already_archived: false,
      audit_event_id: audit.audit_id,
    };
  }
}
