// FILE: otzar.routes.ts
// PURPOSE: HTTP surface for Otzar conductSession (POST /message) and
//          closeConversation (POST /close). Bearer-validated; no
//          admin capability gate (these are user-facing employee
//          routes). Maps OtzarService result codes to HTTP status.
// CONNECTS TO: OtzarService, AuthService (validation handled inside
//              the service via the bearer token).

import type { FastifyInstance } from "fastify";
import type { OtzarService, IngestSourceEventInput } from "../services/otzar/otzar.service.js";
import type { AuthService } from "../services/auth.service.js";
import { requireAdminCapability } from "../middleware/admin.middleware.js";
import { tickTruthEvidenceRecheck, parseTruthEvidenceTargets, TRUTH_EVIDENCE_RECHECK_TARGETS_ENV } from "../services/otzar/truth-evidence-recheck.service.js";
import {
  isDemoModeAllowed,
  DEMO_MODE_NOT_ALLOWED,
} from "../services/otzar/demo-mode.js";
// [HARDENING D] Canonical runtime allowlists — reject unknown enum-like inputs with 422.
import {
  isObligationType,
  isObligationState,
  isObligationPriority,
  isRequiredResponseClass,
  isSourceChannel,
  isProvenanceClass,
  HANDOFF_STATES,
  HANDOFF_DISPOSITIONS,
} from "@niov/database";

const HANDOFF_STATE_SET: ReadonlySet<string> = new Set(HANDOFF_STATES);
const HANDOFF_DISPOSITION_SET: ReadonlySet<string> = new Set(HANDOFF_DISPOSITIONS);
const isHandoffStateStr = (v: unknown): v is string => typeof v === "string" && HANDOFF_STATE_SET.has(v);

// WHAT: Hard ceiling on caller-supplied token_budget. Above this,
//        reject with BUDGET_TOO_LARGE 422 -- protects the LLM
//        provider from accidental denial-of-service via massive
//        prompts.
const MAX_BUDGET = 50_000;
const DEFAULT_BUDGET = 8_000;

// WHAT: Pagination defaults for GET /otzar/conversations. Mirrors the
//        org.routes convention (DEFAULT_TAKE 50, MAX_TAKE 200) so the
//        client contract is consistent across the API surface.
const DEFAULT_TAKE = 50;
const MAX_TAKE = 200;

// WHAT: Pull the bearer token out of an Authorization header.
function bearerFrom(value: string | string[] | undefined): string | null {
  if (typeof value !== "string" || !value.startsWith("Bearer ")) return null;
  const token = value.slice("Bearer ".length).trim();
  return token.length === 0 ? null : token;
}

// WHAT: Parse skip/take from the conversations querystring with safe
//        bounds. Invalid / missing values fall back to defaults; take
//        is clamped to [1, MAX_TAKE]. Mirrors org.routes' parsePagination.
function parseConvPagination(query: { skip?: string; take?: string }): {
  skip: number;
  take: number;
} {
  const skipNum = Number.parseInt(query.skip ?? "0", 10);
  const takeNum = Number.parseInt(query.take ?? String(DEFAULT_TAKE), 10);
  const skip = Number.isFinite(skipNum) && skipNum >= 0 ? skipNum : 0;
  const take = Math.max(
    1,
    Math.min(MAX_TAKE, Number.isFinite(takeNum) ? takeNum : DEFAULT_TAKE),
  );
  return { skip, take };
}

// WHAT: Map an OtzarService failure code to HTTP status.
function statusForCode(code: string): number {
  switch (code) {
    case "SESSION_INVALID":
    case "SESSION_EXPIRED":
    case "SESSION_REVOKED":
    case "SESSION_INVALIDATED":
      return 401;
    case "OPERATION_NOT_PERMITTED":
    case "NOT_CONVERSATION_OWNER":
    case "OTZAR_THREAD_FORBIDDEN":
      return 403;
    case "TWIN_NOT_FOUND":
    case "CONVERSATION_NOT_FOUND":
      return 404;
    case "TWIN_AMBIGUOUS":
      return 409;
    case "INVALID_HISTORY":
    case "INVALID_REQUEST_ID":
      return 422;
    case "OTZAR_OBLIGATION_NOT_FOUND":
    case "OTZAR_HANDOFF_NOT_FOUND":
      return 404;
    case "OTZAR_OBLIGATION_EVIDENCE_REQUIRED":
    case "OTZAR_OBLIGATION_NOT_ACKNOWLEDGEABLE":
    case "OTZAR_OBLIGATION_INVALID_INPUT":
    case "OTZAR_OBLIGATION_INVALID_REFERENCE":
    case "OTZAR_HANDOFF_INVALID_INPUT":
    case "OTZAR_HANDOFF_INVALID_REFERENCE":
    case "OTZAR_HANDOFF_PRECONDITION":
      return 422;
    case "OTZAR_HANDOFF_NOT_AUTHORIZED":
      return 403;
    case "OTZAR_OBLIGATION_AUDIT_UNCOMMITTED":
    case "OTZAR_HANDOFF_AUDIT_UNCOMMITTED":
    case "OTZAR_ORG_TRUTH_AUDIT_UNCOMMITTED":
      return 503;
    case "OTZAR_ORG_TRUTH_UNAUTHORIZED":
    case "OTZAR_ORG_TRUTH_RECOMMEND_ONLY":
      return 403;
    case "OTZAR_ORG_TRUTH_NOT_FOUND":
    case "OTZAR_ORG_TRUTH_CONFLICT_NOT_FOUND":
    case "OTZAR_ORG_TRUTH_NO_ORG":
      return 404;
    case "OTZAR_ORG_TRUTH_INELIGIBLE_SOURCE":
    case "OTZAR_ORG_TRUTH_INVALID_INPUT":
      return 422;
    case "OTZAR_ORG_TRUTH_STATE_CHANGED":
      return 409;
    case "OTZAR_HANDOFF_STATE_CHANGED":
    case "OTZAR_HANDOFF_ILLEGAL_TRANSITION":
      return 409;
    case "ALREADY_INGESTED":
    case "OTZAR_REQUEST_ID_CONFLICT":
    case "OTZAR_THREAD_CLOSED":
    case "OTZAR_REQUEST_IN_PROGRESS":
    case "OTZAR_CONTINUITY_STATE_CHANGED":
    case "OTZAR_OBLIGATION_STATE_CHANGED":
    case "OTZAR_OBLIGATION_ILLEGAL_TRANSITION":
      return 409;
    case "TOKEN_BUDGET_EXCEEDED":
      return 413;
    case "LLM_UNAVAILABLE":
    case "OTZAR_TURN_PERSIST_FAILED":
    case "OTZAR_ASSISTANT_TURN_PERSIST_FAILED":
      return 503;
    default:
      return 400;
  }
}

// WHAT: Register the Otzar routes.
export async function registerOtzarRoutes(
  app: FastifyInstance,
  otzarService: OtzarService,
  authService?: AuthService,
): Promise<void> {
  app.post<{
    Body: {
      message?: unknown;
      conversation_id?: unknown;
      conversation_history?: unknown;
      token_budget?: unknown;
      client_timezone?: unknown;
      request_id?: unknown;
    };
  }>("/api/v1/otzar/conversation/message", async (request, reply) => {
    const token = bearerFrom(request.headers.authorization);
    if (token === null) {
      return reply.code(401).send({
        ok: false,
        code: "SESSION_INVALID",
        message: "Missing bearer token",
      });
    }
    const body = request.body ?? {};
    if (typeof body.message !== "string" || body.message.length === 0) {
      return reply.code(422).send({
        ok: false,
        code: "INVALID_REQUEST",
        message: "message is required (non-empty string)",
      });
    }
    let tokenBudget = DEFAULT_BUDGET;
    if (typeof body.token_budget === "number") {
      if (
        !Number.isFinite(body.token_budget) ||
        body.token_budget <= 0 ||
        body.token_budget > MAX_BUDGET
      ) {
        return reply.code(422).send({
          ok: false,
          code: "BUDGET_TOO_LARGE",
          message: `token_budget must be in (0, ${MAX_BUDGET}]`,
        });
      }
      tokenBudget = body.token_budget;
    }
    const conversationId =
      typeof body.conversation_id === "string" &&
      body.conversation_id.length > 0
        ? body.conversation_id
        : undefined;
    const history = Array.isArray(body.conversation_history)
      ? (body.conversation_history.filter(
          (h): h is string => typeof h === "string",
        ))
      : [];

    // Phase 1253: an unexpected throw (e.g. transient DB-pool
    // pressure) must never reach the employee as a raw 500 — it
    // becomes a calm, retryable closed-vocab envelope. Details stay
    // in the structured logs.
    let result: Awaited<ReturnType<typeof otzarService.conductSession>>;
    try {
      result = await otzarService.conductSession({
        token,
        message: body.message,
        conversation_id: conversationId,
        conversation_history: history,
        token_budget: tokenBudget,
        // [OTZAR-CONTINUITY P1] live device timezone (travel-correct), when sent.
        ...(typeof body.client_timezone === "string" && body.client_timezone.length > 0
          ? { client_timezone: body.client_timezone }
          : {}),
        // [OTZAR-CONTINUITY P5 Stage 1] client idempotency key (validated server-side).
        ...(typeof body.request_id === "string" && body.request_id.length > 0
          ? { request_id: body.request_id }
          : {}),
      });
    } catch (err) {
      request.log.error({ err }, "conductSession threw");
      return reply
        .code(503)
        .send({ ok: false, code: "OTZAR_BUSY_TRY_AGAIN" });
    }
    if (!result.ok) {
      return reply.code(statusForCode(result.code)).send(result);
    }
    return reply.code(200).send(result);
  });

  app.post<{
    Body: {
      conversation_id?: unknown;
      capsule_ids_used?: unknown;
      conversation_history?: unknown;
    };
  }>("/api/v1/otzar/conversation/close", async (request, reply) => {
    const token = bearerFrom(request.headers.authorization);
    if (token === null) {
      return reply.code(401).send({
        ok: false,
        code: "SESSION_INVALID",
        message: "Missing bearer token",
      });
    }
    const body = request.body ?? {};
    if (
      typeof body.conversation_id !== "string" ||
      body.conversation_id.length === 0
    ) {
      return reply.code(422).send({
        ok: false,
        code: "INVALID_REQUEST",
        message: "conversation_id is required",
      });
    }
    const capsuleIdsUsed = Array.isArray(body.capsule_ids_used)
      ? body.capsule_ids_used.filter((c): c is string => typeof c === "string")
      : [];
    const history = Array.isArray(body.conversation_history)
      ? body.conversation_history.filter(
          (h): h is string => typeof h === "string",
        )
      : undefined;

    const result = await otzarService.closeConversation({
      token,
      conversation_id: body.conversation_id,
      capsule_ids_used: capsuleIdsUsed,
      conversation_history: history,
    });
    if (!result.ok) {
      return reply.code(statusForCode(result.code)).send(result);
    }
    return reply.code(200).send(result);
  });

  // GET /api/v1/otzar/my-twin -- the caller's OWN aligned-twin identity.
  // Self-read: bearer + "read" capability only. No admin middleware, no
  // can_admin_org / can_admin_niov requirement. Returns the SAME primary
  // twin conductSession talks to. Identity + alignment fields only --
  // never the role-template body, capability flags, permission bridge
  // IDs, or any memory/capsule/vector data (the service enforces the
  // projection).
  //
  // Wave 3 (ADR-0068) — optional ?include_proactive_cards=true|false
  // query param maps to the GetMyTwinInput.include_proactive_cards
  // option. Default true (the symbiotic default). Strings other than
  // "true" or "false" are silently treated as the default (no 400 — a
  // query-param typo MUST NOT break the read).
  app.get<{
    Querystring: { include_proactive_cards?: string };
  }>("/api/v1/otzar/my-twin", async (request, reply) => {
    const token = bearerFrom(request.headers.authorization);
    if (token === null) {
      return reply.code(401).send({
        ok: false,
        code: "SESSION_INVALID",
        message: "Missing bearer token",
      });
    }
    const raw = request.query.include_proactive_cards;
    const include_proactive_cards =
      raw === "false" ? false : raw === "true" ? true : undefined;
    const result = await otzarService.getMyTwin({
      token,
      ...(include_proactive_cards !== undefined
        ? { include_proactive_cards }
        : {}),
    });
    if (!result.ok) {
      return reply.code(statusForCode(result.code)).send(result);
    }
    return reply.code(200).send(result);
  });

  // GET /api/v1/otzar/my-twin/context-health -- closed-vocab projection
  // of the L0_IDENTITY block conductSession prepends to the LLM system
  // prompt. Self-read: bearer + "read" capability only. Used by the
  // Voice page to render an "AI Twin context" badge so the operator
  // sees at-a-glance whether Otzar will recognize them. Phase 1205
  // per [FOUNDER-AUTH -- FIX AI TWIN IDENTITY CONTEXT].
  //
  // Returns IdentityContext + a discrete READY|PARTIAL|UNCONFIGURED
  // status. NEVER includes secrets, raw memory text, raw transcripts,
  // cross-user data, or fields beyond the IdentityContext projection.
  app.get("/api/v1/otzar/my-twin/context-health", async (request, reply) => {
    const token = bearerFrom(request.headers.authorization);
    if (token === null) {
      return reply.code(401).send({
        ok: false,
        code: "SESSION_INVALID",
        message: "Missing bearer token",
      });
    }
    const result = await otzarService.getContextHealth({ token });
    if (!result.ok) {
      return reply.code(statusForCode(result.code)).send(result);
    }
    return reply.code(200).send(result);
  });

  // GET /api/v1/otzar/dgi-coherence -- [DGI-COHERENCE WAVE-2]
  // Product projection of collaborative Domain General Intelligence
  // state. Self-read: bearer + "read" only. Returns the SAME leak-safe
  // strip the Twin receives (counts + safe titles + closed-vocab
  // coherence_status + twin pairing). Multi-Twin / unpaired states are
  // honest fields (BLOCKED / UNPAIRED), not silent oldest picks and not
  // 4xx — so Control Tower can always render recovery UX.
  // NEVER includes transcripts, raw claims, secrets, or cross-user data.
  app.get("/api/v1/otzar/dgi-coherence", async (request, reply) => {
    const token = bearerFrom(request.headers.authorization);
    if (token === null) {
      return reply.code(401).send({
        ok: false,
        code: "SESSION_INVALID",
        message: "Missing bearer token",
      });
    }
    const result = await otzarService.getDgiCoherence({ token });
    if (!result.ok) {
      return reply.code(statusForCode(result.code)).send(result);
    }
    return reply.code(200).send(result);
  });

  // POST /api/v1/otzar/comms/extract -- Phase 1213
  // [OTZAR-AMBIENT-COMMS]. Given the assembled captured text of a
  // conversation (from CT's demo-capture timer, manual paste, or
  // future live STT), return a structured summary + decisions +
  // commitments + suggested governed-Action follow-ups. NEVER
  // creates Action rows -- those land only when the operator
  // explicitly clicks Send on a CT approval card (Phase 1208 path).
  app.post<{
    Body: { captured_text?: unknown; force_mode?: unknown };
  }>("/api/v1/otzar/comms/extract", async (request, reply) => {
    const token = bearerFrom(request.headers.authorization);
    if (token === null) {
      return reply.code(401).send({
        ok: false,
        code: "SESSION_INVALID",
        message: "Missing bearer token",
      });
    }
    const body = request.body ?? {};
    if (
      typeof body.captured_text !== "string" ||
      body.captured_text.length === 0
    ) {
      return reply.code(422).send({
        ok: false,
        code: "INVALID_REQUEST",
        message: "captured_text is required (non-empty string)",
      });
    }
    const force_mode =
      body.force_mode === "DEMO_SCRIPTED" ||
      body.force_mode === "LLM" ||
      body.force_mode === "LOCAL_FALLBACK"
        ? body.force_mode
        : undefined;
    // [OTZAR-V1-LIVE-1A-FOUNDATION] Refuse an explicit demo-intake request in a
    // non-demo environment so scripted output never masks the real LLM path.
    if (force_mode === "DEMO_SCRIPTED" && !isDemoModeAllowed()) {
      return reply.code(422).send({
        ok: false,
        code: DEMO_MODE_NOT_ALLOWED,
        message:
          "Demo intake mode is disabled in this environment. Set ALLOW_DEMO_MODE=true to enable it.",
      });
    }
    const result = await otzarService.extractFromComms({
      token,
      captured_text: body.captured_text,
      ...(force_mode !== undefined ? { force_mode } : {}),
    });
    if (!result.ok) {
      return reply.code(statusForCode(result.code)).send(result);
    }
    return reply.code(200).send(result);
  });

  // ── [DOC-EXTRACT] POST /otzar/context/extract-preview — review-first
  // extraction preview over ONE seeded document (ADMIN gated in-service).
  // READ-ONLY: candidates are never persisted; approval flows through the
  // existing work-creation rail with a human in the loop.
  app.post<{ Body: Record<string, unknown> }>(
    "/api/v1/otzar/context/extract-preview",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null) {
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID", message: "Missing bearer token" });
      }
      const b = request.body ?? {};
      const result = await otzarService.extractDocumentWorkPreview({
        token,
        ledger_entry_id: typeof b.ledger_entry_id === "string" ? b.ledger_entry_id : "",
      });
      if (result.ok === false) {
        const status =
          result.code === "OPERATION_NOT_PERMITTED" || result.code === "SESSION_INVALID"
            ? statusForCode(result.code)
            : result.code === "NOT_FOUND"
              ? 404
              : 422;
        return reply.code(status).send(result);
      }
      return reply.code(200).send(result);
    },
  );

  // ── [CS-5] POST /otzar/context/seed-document — org corpus seeding (ADMIN
  // gated in-service): one document becomes org-owned reference context —
  // durable capture + ONE VERIFIED DOCUMENT_CONTEXT row, extraction OFF.
  app.post<{ Body: Record<string, unknown> }>(
    "/api/v1/otzar/context/seed-document",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null) {
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID", message: "Missing bearer token" });
      }
      const result = await otzarService.seedDocumentContext({
        token,
        raw: request.body ?? {},
      });
      if (result.ok === false) {
        const status =
          result.code === "OPERATION_NOT_PERMITTED" || result.code === "SESSION_INVALID"
            ? statusForCode(result.code)
            : result.code === "INVALID_REQUEST"
              ? 422
              : result.code === "NO_ORG_FOR_CALLER"
                ? 404
                : 500;
        return reply.code(status).send(result);
      }
      return reply.code(201).send(result);
    },
  );

  // POST /api/v1/otzar/comms/ingest -- the governed transcript → owned-work
  // pass. Unlike /comms/extract (ephemeral, read-only), this PERSISTS the
  // captured conversation as a durable source-of-truth record and creates
  // per-owner Work Ledger rows under proof: the noisy post-meeting tail is
  // quarantined (never seeds work) and an unproven owner becomes NEEDS_OWNER
  // for review (never auto-assigned). Gated on the authenticated-employee tier
  // ("read", like correction-memory); the write governance is enforced in-service.
  app.post<{
    Body: {
      captured_text?: unknown;
      title?: unknown;
      force_mode?: unknown;
      seeded_context?: unknown;
    };
  }>("/api/v1/otzar/comms/ingest", async (request, reply) => {
    const token = bearerFrom(request.headers.authorization);
    if (token === null) {
      return reply.code(401).send({
        ok: false,
        code: "SESSION_INVALID",
        message: "Missing bearer token",
      });
    }
    const body = request.body ?? {};
    if (typeof body.captured_text !== "string" || body.captured_text.length === 0) {
      return reply.code(422).send({
        ok: false,
        code: "INVALID_REQUEST",
        message: "captured_text is required (non-empty string)",
      });
    }
    const force_mode =
      body.force_mode === "DEMO_SCRIPTED" ||
      body.force_mode === "LLM" ||
      body.force_mode === "LOCAL_FALLBACK"
        ? body.force_mode
        : undefined;
    if (force_mode === "DEMO_SCRIPTED" && !isDemoModeAllowed()) {
      return reply.code(422).send({
        ok: false,
        code: DEMO_MODE_NOT_ALLOWED,
        message:
          "Demo intake mode is disabled in this environment. Set ALLOW_DEMO_MODE=true to enable it.",
      });
    }
    const title = typeof body.title === "string" ? body.title : undefined;
    // [CS-2] org-history seeding: privileged — the SERVICE validates the
    // session with admin_org when seeding (provided_by = session caller).
    let seeded: { covering_period?: string | null } | undefined;
    if (body.seeded_context !== undefined && body.seeded_context !== null) {
      const sc = body.seeded_context as Record<string, unknown>;
      seeded = {
        ...(typeof sc.covering_period === "string" && sc.covering_period.trim().length > 0
          ? { covering_period: sc.covering_period.trim().slice(0, 80) }
          : {}),
      };
    }
    const result = await otzarService.ingestComms({
      token,
      captured_text: body.captured_text,
      ...(title !== undefined ? { title } : {}),
      ...(force_mode !== undefined ? { force_mode } : {}),
      ...(seeded !== undefined ? { seeded } : {}),
    });
    if (!result.ok) {
      return reply.code(statusForCode(result.code)).send(result);
    }
    return reply.code(200).send(result);
  });

  // POST /api/v1/otzar/ingest/source-event -- Slice A. Source-agnostic intake:
  // any NON-transcript source (Slack message, email thread, webhook, MCP event,
  // manual capture) is normalized to a source event and flows through the SAME
  // governed chain into the SAME WorkLedger as transcripts — no second ledger,
  // no per-app silo. Re-posting the same source event is idempotent (dedupe on
  // the stable external id → 409 ALREADY_INGESTED). Same "read"-tier gate as
  // /comms/ingest; write governance enforced in-service.
  app.post<{ Body: { source?: Record<string, unknown>; force_mode?: unknown } }>(
    "/api/v1/otzar/ingest/source-event",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null) {
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID", message: "Missing bearer token" });
      }
      const body = request.body ?? {};
      const src = body.source;
      if (typeof src !== "object" || src === null) {
        return reply.code(422).send({ ok: false, code: "INVALID_REQUEST", message: "source object is required" });
      }
      const force_mode =
        body.force_mode === "LLM" || body.force_mode === "LOCAL_FALLBACK" || body.force_mode === "DEMO_SCRIPTED"
          ? body.force_mode
          : undefined;
      if (force_mode === "DEMO_SCRIPTED" && !isDemoModeAllowed()) {
        return reply.code(422).send({
          ok: false,
          code: DEMO_MODE_NOT_ALLOWED,
          message: "Demo intake mode is disabled in this environment. Set ALLOW_DEMO_MODE=true to enable it.",
        });
      }
      const result = await otzarService.ingestSourceEvent({
        token,
        source: src as unknown as IngestSourceEventInput["source"],
        ...(force_mode !== undefined ? { force_mode } : {}),
      });
      if (!result.ok) {
        return reply.code(statusForCode(result.code)).send(result);
      }
      return reply.code(200).send(result);
    },
  );

  // GET /api/v1/otzar/conversations -- metadata-only continuity feed for
  // the caller's OWN conversations. Self-scoped: bearer + "read"
  // capability only (no admin gate). ?skip= & ?take= pagination (take
  // clamped to MAX_TAKE); optional ?status=ACTIVE|CLOSED filter (invalid
  // value -> 400 INVALID_STATUS). No transcript / message bodies / capsule
  // references in the response.
  app.get<{
    Querystring: { skip?: string; take?: string; status?: string };
  }>("/api/v1/otzar/conversations", async (request, reply) => {
    const token = bearerFrom(request.headers.authorization);
    if (token === null) {
      return reply.code(401).send({
        ok: false,
        code: "SESSION_INVALID",
        message: "Missing bearer token",
      });
    }
    const rawStatus = request.query.status;
    let status: "ACTIVE" | "CLOSED" | undefined;
    if (typeof rawStatus === "string" && rawStatus.length > 0) {
      if (rawStatus !== "ACTIVE" && rawStatus !== "CLOSED") {
        return reply.code(400).send({
          ok: false,
          code: "INVALID_STATUS",
          message: "status must be ACTIVE or CLOSED",
        });
      }
      status = rawStatus;
    }
    const { skip, take } = parseConvPagination(request.query);
    const result = await otzarService.listConversations({
      token,
      skip,
      take,
      status,
    });
    if (!result.ok) {
      return reply.code(statusForCode(result.code)).send(result);
    }
    return reply.code(200).send(result);
  });

  // GET /api/v1/otzar/conversations/:id -- safe, self-scoped conversation
  // look-back detail (ADR-0054 Wave 2B). Bearer + "read" only (no admin
  // gate). Returns metadata + close summary + topics; NO transcript /
  // message bodies / raw context / capsule internals. CONVERSATION_NOT_FOUND
  // (404) for unknown id; NOT_CONVERSATION_OWNER (403) for a cross-caller.
  // (Static `/conversations` and param `/conversations/:id` are distinct
  // Fastify routes -- no conflict.)
  app.get<{ Params: { id: string } }>(
    "/api/v1/otzar/conversations/:id",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null) {
        return reply.code(401).send({
          ok: false,
          code: "SESSION_INVALID",
          message: "Missing bearer token",
        });
      }
      const result = await otzarService.getConversationDetail({
        token,
        conversation_id: request.params.id,
      });
      if (!result.ok) {
        return reply.code(statusForCode(result.code)).send(result);
      }
      return reply.code(200).send(result);
    },
  );

  // [OTZAR-CONTINUITY C6] Server thread restoration (durable-model). Bearer + "read".
  // GET /api/v1/otzar/threads/restore -- the caller's most-recent ACTIVE thread (or null,
  // never invented) + a bounded recent list. CT restores from THIS on login/refresh.
  app.get<{ Querystring: { limit?: string; include_archived?: string } }>(
    "/api/v1/otzar/threads/restore",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null) return reply.code(401).send({ ok: false, code: "SESSION_INVALID", message: "Missing bearer token" });
      const rawLimit = Number(request.query.limit);
      const result = await otzarService.restoreThreads({
        token,
        ...(Number.isFinite(rawLimit) && rawLimit > 0 ? { limit: Math.floor(rawLimit) } : {}),
        includeArchived: request.query.include_archived === "true",
      });
      if (!result.ok) return reply.code(statusForCode(result.code)).send(result);
      return reply.code(200).send(result);
    },
  );

  // GET /api/v1/otzar/threads/:id -- a specific thread + bounded recent turns + unresolved
  // summary (scope-gated). OTZAR_THREAD_FORBIDDEN (403) for foreign/deleted (no disclosure).
  app.get<{ Params: { id: string }; Querystring: { turn_limit?: string } }>(
    "/api/v1/otzar/threads/:id",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null) return reply.code(401).send({ ok: false, code: "SESSION_INVALID", message: "Missing bearer token" });
      const rawTurnLimit = Number(request.query.turn_limit);
      const result = await otzarService.getThreadDetail({
        token,
        conversation_id: request.params.id,
        ...(Number.isFinite(rawTurnLimit) && rawTurnLimit > 0 ? { turn_limit: Math.floor(rawTurnLimit) } : {}),
      });
      if (!result.ok) return reply.code(statusForCode(result.code)).send(result);
      return reply.code(200).send(result);
    },
  );

  // GET /api/v1/otzar/requests/:id/status -- safe status of the caller's OWN request (for
  // CT reconcile of a locally-pending submission). OTZAR_THREAD_FORBIDDEN (403) if foreign.
  // Never returns lease/provider tokens or raw action internals.
  app.get<{ Params: { id: string } }>(
    "/api/v1/otzar/requests/:id/status",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null) return reply.code(401).send({ ok: false, code: "SESSION_INVALID", message: "Missing bearer token" });
      const result = await otzarService.getRequestStatus({ token, request_record_id: request.params.id });
      if (!result.ok) return reply.code(statusForCode(result.code)).send(result);
      return reply.code(200).send(result);
    },
  );

  // [OTZAR-CONTINUITY cross-tab] The caller's unresolved requests (in-flight / awaiting
  // confirmation), optionally scoped to one conversation via ?conversation_id=. How a second
  // tab/device discovers the first's obligations from SERVER authority. Bearer + read.
  app.get<{ Querystring: { conversation_id?: string; limit?: string; recent_completed_ms?: string } }>(
    "/api/v1/otzar/requests/unresolved",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null) return reply.code(401).send({ ok: false, code: "SESSION_INVALID", message: "Missing bearer token" });
      const rawLimit = Number(request.query.limit);
      const rawWindow = Number(request.query.recent_completed_ms);
      const result = await otzarService.listUnresolved({
        token,
        ...(typeof request.query.conversation_id === "string" && request.query.conversation_id.length > 0
          ? { conversation_id: request.query.conversation_id }
          : {}),
        ...(Number.isFinite(rawLimit) && rawLimit > 0 ? { limit: Math.floor(rawLimit) } : {}),
        ...(Number.isFinite(rawWindow) && rawWindow > 0 ? { recent_completed_ms: Math.floor(rawWindow) } : {}),
      });
      if (!result.ok) return reply.code(statusForCode(result.code)).send(result);
      return reply.code(200).send(result);
    },
  );

  // [OTZAR-CONTINUITY C6/E] Response-loss reconciliation by the CLIENT-known identity (the
  // stable request_id CT owns, which it may keep even when the server request-record id was
  // never received). Scoped by conversation + client_request_id + (org/subject/twin).
  // NEVER a global client_request_id lookup. OTZAR_THREAD_FORBIDDEN (403) for foreign.
  app.get<{ Params: { conversation_id: string; client_request_id: string } }>(
    "/api/v1/otzar/threads/:conversation_id/requests/by-client/:client_request_id",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null) return reply.code(401).send({ ok: false, code: "SESSION_INVALID", message: "Missing bearer token" });
      const result = await otzarService.getRequestStatusByClient({
        token,
        conversation_id: request.params.conversation_id,
        client_request_id: request.params.client_request_id,
      });
      if (!result.ok) return reply.code(statusForCode(result.code)).send(result);
      return reply.code(200).send(result);
    },
  );

  // GET /api/v1/otzar/conversations/:id/corrections -- safe, self-scoped
  // per-conversation correction-signal projection (ADR-0055 Wave 2C).
  // Bearer + "read" only (no admin gate). Returns counts + last-seen +
  // honest notes; NEVER raw correction payloads, target_capsule_id,
  // capsule IDs, vectors, storage_location, content_hash, permission
  // internals, drift/employee score, or manager-visibility fields.
  // CONVERSATION_NOT_FOUND (404) for unknown id; NOT_CONVERSATION_OWNER
  // (403) for a cross-caller. ConversationDetailView (`/conversations/:id`)
  // is unchanged.
  app.get<{ Params: { id: string } }>(
    "/api/v1/otzar/conversations/:id/corrections",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null) {
        return reply.code(401).send({
          ok: false,
          code: "SESSION_INVALID",
          message: "Missing bearer token",
        });
      }
      const result = await otzarService.getConversationCorrections({
        token,
        conversation_id: request.params.id,
      });
      if (!result.ok) {
        return reply.code(statusForCode(result.code)).send(result);
      }
      return reply.code(200).send(result);
    },
  );

  // Section 1 Wave 3B — Otzar drift detection coaching/alignment
  // trust loop per ADR-0058. GET /api/v1/otzar/conversations/:id/
  // drift-signals — self-scoped per-conversation drift coaching
  // projection. Bearer + "read" only (no admin gate; never a
  // manager surface). Returns closed-vocabulary signal labels +
  // safe counts + honest coaching/boundary notes; NEVER raw
  // correction payloads, capsule IDs, topic tag values, transcripts,
  // numeric scores, or per-employee comparison fields. Mirrors
  // Wave 2C /corrections self-scope semantics verbatim:
  // CONVERSATION_NOT_FOUND (404); NOT_CONVERSATION_OWNER (403).
  app.get<{ Params: { id: string } }>(
    "/api/v1/otzar/conversations/:id/drift-signals",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null) {
        return reply.code(401).send({
          ok: false,
          code: "SESSION_INVALID",
          message: "Missing bearer token",
        });
      }
      const result = await otzarService.analyzeConversationDrift({
        token,
        conversation_id: request.params.id,
      });
      if (!result.ok) {
        return reply.code(statusForCode(result.code)).send(result);
      }
      return reply.code(200).send(result);
    },
  );

  // Section 1 Wave 4A — Otzar stale-context drift signal per
  // ADR-0058 §9 + ADR-0045 G5.1 + Founder Wave 4A direction.
  // GET /api/v1/otzar/stale-context-signal — self-scoped
  // wallet-level signal indicating whether the caller's persisted
  // capsule context embeddings are current (embedding_content_hash
  // == content_hash) or lagging. Bearer + "read" only (no admin
  // gate; never a manager surface). Returns closed-vocabulary
  // signal label + safe counts + locked coaching/boundary notes;
  // NEVER raw capsule content, capsule IDs, content_hash values,
  // embedding_content_hash values, storage_location, or per-
  // capsule attribution. Audit emission reuses existing
  // ADMIN_ACTION + DRIFT_SIGNAL_READ literal with
  // source_signal: "STALE_CONTEXT_WALLET" discriminator (no new
  // audit literal).
  app.get(
    "/api/v1/otzar/stale-context-signal",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null) {
        return reply.code(401).send({
          ok: false,
          code: "SESSION_INVALID",
          message: "Missing bearer token",
        });
      }
      const result = await otzarService.analyzeStaleContextForCaller({
        token,
      });
      if (!result.ok) {
        return reply.code(statusForCode(result.code)).send(result);
      }
      return reply.code(200).send(result);
    },
  );

  // Section 1 Wave 4C — Otzar cross-conversation drift rollup per
  // ADR-0058 §9 + Founder Wave 4C direction. GET /api/v1/otzar/
  // drift-rollup — self-scoped per-caller posture across the
  // caller's conversations + the wallet-level stale-context
  // signal. Bearer + "read" only (no admin gate; never a
  // manager surface). Closed-vocab posture label (AT_RISK /
  // NORMAL / INSUFFICIENT_DATA) + aggregate counts + locked
  // coaching/boundary notes. NEVER conversation IDs / capsule
  // IDs / per-conversation attribution / transcripts / raw
  // corrections. Audit reuses ADMIN_ACTION + DRIFT_SIGNAL_READ
  // with source_signal: "CROSS_CONVERSATION_ROLLUP".
  app.get(
    "/api/v1/otzar/drift-rollup",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null) {
        return reply.code(401).send({
          ok: false,
          code: "SESSION_INVALID",
          message: "Missing bearer token",
        });
      }
      const result = await otzarService.analyzeDriftRollupForCaller({
        token,
      });
      if (!result.ok) {
        return reply.code(statusForCode(result.code)).send(result);
      }
      return reply.code(200).send(result);
    },
  );

  // ──────────────────────────────────────────────────────────────
  // [OTZAR STAGE-2 §5] Durable organizational obligations. Bearer-gated; every read/transition
  // is (org, subject, twin) scope-gated at the service tier; completion requires validated
  // durable evidence; terminal states are append-only. Responses are safe projections only.

  // POST /obligations — create (or idempotently return) an obligation.
  app.post<{ Body: Record<string, unknown> }>(
    "/api/v1/otzar/obligations",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null) return reply.code(401).send({ ok: false, code: "SESSION_INVALID", message: "Missing bearer token" });
      const body = request.body ?? {};
      if (!isObligationType(body.obligation_type) || typeof body.title !== "string" || body.title.trim().length === 0) {
        return reply.code(422).send({ ok: false, code: "INVALID_REQUEST", message: "a valid obligation_type and a non-empty title are required" });
      }
      // [HARDENING D] every supplied enum-like field must be a known value (else 422).
      if (body.initial_state !== undefined && !isObligationState(body.initial_state)) return reply.code(422).send({ ok: false, code: "INVALID_REQUEST", message: "unknown initial_state" });
      if (body.priority !== undefined && !isObligationPriority(body.priority)) return reply.code(422).send({ ok: false, code: "INVALID_REQUEST", message: "unknown priority" });
      if (body.required_response_class !== undefined && !isRequiredResponseClass(body.required_response_class)) return reply.code(422).send({ ok: false, code: "INVALID_REQUEST", message: "unknown required_response_class" });
      if (body.source_channel !== undefined && !isSourceChannel(body.source_channel)) return reply.code(422).send({ ok: false, code: "INVALID_REQUEST", message: "unknown source_channel" });
      if (body.provenance_class !== undefined && !isProvenanceClass(body.provenance_class)) return reply.code(422).send({ ok: false, code: "INVALID_REQUEST", message: "unknown provenance_class" });
      const result = await otzarService.createObligation({
        token,
        obligation_type: body.obligation_type,
        title: body.title,
        ...(typeof body.responsible_entity_id === "string" ? { responsible_entity_id: body.responsible_entity_id } : {}),
        ...(typeof body.origin_key === "string" ? { origin_key: body.origin_key } : {}),
        ...(isObligationState(body.initial_state) ? { initial_state: body.initial_state } : {}),
        ...(typeof body.priority === "string" ? { priority: body.priority } : {}),
        ...(typeof body.required_response_class === "string" ? { required_response_class: body.required_response_class } : {}),
        ...(typeof body.source_channel === "string" ? { source_channel: body.source_channel } : {}),
        ...(typeof body.provenance_class === "string" ? { provenance_class: body.provenance_class } : {}),
        ...(typeof body.details === "object" && body.details !== null ? { details: body.details as Record<string, unknown> } : {}),
        ...(typeof body.conversation_id === "string" ? { conversation_id: body.conversation_id } : {}),
        ...(typeof body.source_turn_id === "string" ? { source_turn_id: body.source_turn_id } : {}),
        ...(typeof body.request_record_id === "string" ? { request_record_id: body.request_record_id } : {}),
        ...(typeof body.action_ref === "string" ? { action_ref: body.action_ref } : {}),
      });
      if (!result.ok) return reply.code(statusForCode(result.code)).send(result);
      return reply.code(200).send(result);
    },
  );

  // GET /obligations — the caller's obligations (restoration read; survives thread close).
  app.get<{ Querystring: { state?: string; obligation_type?: string; conversation_id?: string; open_only?: string; limit?: string; with_basis?: string } }>(
    "/api/v1/otzar/obligations",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null) return reply.code(401).send({ ok: false, code: "SESSION_INVALID", message: "Missing bearer token" });
      const rawLimit = Number(request.query.limit);
      // [HARDENING D] filter enums must be known values (else 422).
      const rawStates = typeof request.query.state === "string" && request.query.state.length > 0
        ? request.query.state.split(",").filter((s) => s.length > 0)
        : undefined;
      if (rawStates !== undefined && !rawStates.every(isObligationState)) return reply.code(422).send({ ok: false, code: "INVALID_REQUEST", message: "unknown state filter" });
      if (request.query.obligation_type !== undefined && request.query.obligation_type.length > 0 && !isObligationType(request.query.obligation_type)) {
        return reply.code(422).send({ ok: false, code: "INVALID_REQUEST", message: "unknown obligation_type filter" });
      }
      const result = await otzarService.listObligations({
        token,
        ...(rawStates !== undefined && rawStates.every(isObligationState) ? { states: rawStates } : {}),
        ...(isObligationType(request.query.obligation_type) ? { obligation_type: request.query.obligation_type } : {}),
        ...(typeof request.query.conversation_id === "string" && request.query.conversation_id.length > 0 ? { conversation_id: request.query.conversation_id } : {}),
        ...(request.query.open_only === "true" ? { open_only: true } : {}),
        ...(Number.isFinite(rawLimit) && rawLimit > 0 ? { limit: Math.floor(rawLimit) } : {}),
        ...(request.query.with_basis === "true" ? { with_basis: true } : {}),
      });
      if (!result.ok) return reply.code(statusForCode(result.code)).send(result);
      return reply.code(200).send(result);
    },
  );

  // GET /obligations/:obligation_id — a single obligation (scope-gated).
  app.get<{ Params: { obligation_id: string } }>(
    "/api/v1/otzar/obligations/:obligation_id",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null) return reply.code(401).send({ ok: false, code: "SESSION_INVALID", message: "Missing bearer token" });
      const result = await otzarService.getObligation({ token, obligation_id: request.params.obligation_id });
      if (!result.ok) return reply.code(statusForCode(result.code)).send(result);
      return reply.code(200).send(result);
    },
  );

  // Shared body validation for a versioned transition (optimistic-concurrency).
  function requireVersion(body: Record<string, unknown>): number | null {
    const v = Number(body.expected_version);
    return Number.isInteger(v) && v >= 0 ? v : null;
  }

  // POST /obligations/:obligation_id/acknowledge — responsible actor + USER turn only.
  app.post<{ Params: { obligation_id: string }; Body: Record<string, unknown> }>(
    "/api/v1/otzar/obligations/:obligation_id/acknowledge",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null) return reply.code(401).send({ ok: false, code: "SESSION_INVALID", message: "Missing bearer token" });
      const body = request.body ?? {};
      const version = requireVersion(body);
      if (version === null || typeof body.acknowledged_turn_id !== "string") {
        return reply.code(422).send({ ok: false, code: "INVALID_REQUEST", message: "expected_version and acknowledged_turn_id are required" });
      }
      const result = await otzarService.acknowledgeObligation({ token, obligation_id: request.params.obligation_id, expected_version: version, acknowledged_turn_id: body.acknowledged_turn_id });
      if (!result.ok) return reply.code(statusForCode(result.code)).send(result);
      return reply.code(200).send(result);
    },
  );

  // POST /obligations/:obligation_id/complete — requires validated durable evidence.
  app.post<{ Params: { obligation_id: string }; Body: Record<string, unknown> }>(
    "/api/v1/otzar/obligations/:obligation_id/complete",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null) return reply.code(401).send({ ok: false, code: "SESSION_INVALID", message: "Missing bearer token" });
      const body = request.body ?? {};
      const version = requireVersion(body);
      if (version === null) return reply.code(422).send({ ok: false, code: "INVALID_REQUEST", message: "expected_version is required" });
      const result = await otzarService.completeObligation({
        token, obligation_id: request.params.obligation_id, expected_version: version,
        ...(typeof body.completion_turn_id === "string" ? { completion_turn_id: body.completion_turn_id } : {}),
        ...(typeof body.completion_action_ref === "string" ? { completion_action_ref: body.completion_action_ref } : {}),
        ...(typeof body.completion_evidence === "object" && body.completion_evidence !== null ? { completion_evidence: body.completion_evidence as Record<string, unknown> } : {}),
      });
      if (!result.ok) return reply.code(statusForCode(result.code)).send(result);
      return reply.code(200).send(result);
    },
  );

  // POST /obligations/:obligation_id/transition — cancel | block | start | escalate | expire.
  app.post<{ Params: { obligation_id: string }; Body: Record<string, unknown> }>(
    "/api/v1/otzar/obligations/:obligation_id/transition",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null) return reply.code(401).send({ ok: false, code: "SESSION_INVALID", message: "Missing bearer token" });
      const body = request.body ?? {};
      const version = requireVersion(body);
      const transition = body.transition;
      const ALLOWED = ["cancel", "block", "start", "escalate", "expire"];
      if (version === null || typeof transition !== "string" || !ALLOWED.includes(transition)) {
        return reply.code(422).send({ ok: false, code: "INVALID_REQUEST", message: "expected_version and a valid transition are required" });
      }
      const result = await otzarService.transitionObligation({
        token, obligation_id: request.params.obligation_id, expected_version: version,
        transition: transition as "cancel" | "block" | "start" | "escalate" | "expire",
        ...(typeof body.escalation_id === "string" ? { escalation_id: body.escalation_id } : {}),
      });
      if (!result.ok) return reply.code(statusForCode(result.code)).send(result);
      return reply.code(200).send(result);
    },
  );

  // POST /obligations/:obligation_id/reassign — new responsible party (resets ack; audit lineage).
  app.post<{ Params: { obligation_id: string }; Body: Record<string, unknown> }>(
    "/api/v1/otzar/obligations/:obligation_id/reassign",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null) return reply.code(401).send({ ok: false, code: "SESSION_INVALID", message: "Missing bearer token" });
      const body = request.body ?? {};
      const version = requireVersion(body);
      if (version === null || typeof body.new_responsible_entity_id !== "string" || typeof body.reason !== "string" || body.reason.trim().length === 0) {
        return reply.code(422).send({ ok: false, code: "INVALID_REQUEST", message: "expected_version, new_responsible_entity_id and reason are required" });
      }
      const result = await otzarService.reassignObligation({ token, obligation_id: request.params.obligation_id, expected_version: version, new_responsible_entity_id: body.new_responsible_entity_id, reason: body.reason });
      if (!result.ok) return reply.code(statusForCode(result.code)).send(result);
      return reply.code(200).send(result);
    },
  );

  // POST /obligations/:obligation_id/supersede — linked replacement; original SUPERSEDED.
  app.post<{ Params: { obligation_id: string }; Body: Record<string, unknown> }>(
    "/api/v1/otzar/obligations/:obligation_id/supersede",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null) return reply.code(401).send({ ok: false, code: "SESSION_INVALID", message: "Missing bearer token" });
      const body = request.body ?? {};
      const version = requireVersion(body);
      const replacement = body.replacement;
      if (version === null || typeof replacement !== "object" || replacement === null) {
        return reply.code(422).send({ ok: false, code: "INVALID_REQUEST", message: "expected_version and replacement are required" });
      }
      const r = replacement as Record<string, unknown>;
      if (!isObligationType(r.obligation_type) || typeof r.title !== "string" || r.title.trim().length === 0) {
        return reply.code(422).send({ ok: false, code: "INVALID_REQUEST", message: "a valid replacement.obligation_type and a non-empty replacement.title are required" });
      }
      if (r.initial_state !== undefined && !isObligationState(r.initial_state)) return reply.code(422).send({ ok: false, code: "INVALID_REQUEST", message: "unknown replacement.initial_state" });
      if (r.priority !== undefined && !isObligationPriority(r.priority)) return reply.code(422).send({ ok: false, code: "INVALID_REQUEST", message: "unknown replacement.priority" });
      const result = await otzarService.supersedeObligation({
        token, obligation_id: request.params.obligation_id, expected_version: version,
        replacement: {
          obligation_type: r.obligation_type,
          title: r.title,
          ...(typeof r.responsible_entity_id === "string" ? { responsible_entity_id: r.responsible_entity_id } : {}),
          ...(typeof r.priority === "string" ? { priority: r.priority } : {}),
          ...(typeof r.required_response_class === "string" ? { required_response_class: r.required_response_class } : {}),
          ...(typeof r.details === "object" && r.details !== null ? { details: r.details as Record<string, unknown> } : {}),
          ...(typeof r.conversation_id === "string" ? { conversation_id: r.conversation_id } : {}),
          ...(typeof r.source_turn_id === "string" ? { source_turn_id: r.source_turn_id } : {}),
          ...(typeof r.action_ref === "string" ? { action_ref: r.action_ref } : {}),
          ...(isObligationState(r.initial_state) ? { initial_state: r.initial_state } : {}),
        },
      });
      if (!result.ok) return reply.code(statusForCode(result.code)).send(result);
      return reply.code(200).send(result);
    },
  );

  // POST /obligations/project/awaiting-confirmation — derive (idempotently) an obligation from
  // an existing NEEDS_CALLER_CONFIRMATION action the caller owns.
  app.post<{ Body: Record<string, unknown> }>(
    "/api/v1/otzar/obligations/project/awaiting-confirmation",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null) return reply.code(401).send({ ok: false, code: "SESSION_INVALID", message: "Missing bearer token" });
      const body = request.body ?? {};
      if (typeof body.ledger_entry_id !== "string" || body.ledger_entry_id.length === 0) {
        return reply.code(422).send({ ok: false, code: "INVALID_REQUEST", message: "ledger_entry_id is required" });
      }
      const result = await otzarService.projectAwaitingConfirmationObligation({ token, ledger_entry_id: body.ledger_entry_id });
      if (!result.ok) return reply.code(statusForCode(result.code)).send(result);
      return reply.code(200).send(result);
    },
  );

  // POST /obligations/project/question — derive (idempotently) an obligation from an unresolved
  // assistant question (a COMPLETED CLARIFICATION request the caller owns).
  app.post<{ Body: Record<string, unknown> }>(
    "/api/v1/otzar/obligations/project/question",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null) return reply.code(401).send({ ok: false, code: "SESSION_INVALID", message: "Missing bearer token" });
      const body = request.body ?? {};
      if (typeof body.request_record_id !== "string" || body.request_record_id.length === 0) {
        return reply.code(422).send({ ok: false, code: "INVALID_REQUEST", message: "request_record_id is required" });
      }
      const result = await otzarService.projectUnresolvedQuestionObligation({ token, request_record_id: body.request_record_id });
      if (!result.ok) return reply.code(statusForCode(result.code)).send(result);
      return reply.code(200).send(result);
    },
  );

  // ──────────────────────────────────────────────────────────────
  // [OTZAR STAGE-2 §L] Handoff routes. Bearer-gated; every read/transition is MULTI-PARTY
  // scope-gated (org + caller-is-a-party) at the service tier; mutations party-authorized.

  app.post<{ Body: Record<string, unknown> }>(
    "/api/v1/otzar/handoffs",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null) return reply.code(401).send({ ok: false, code: "SESSION_INVALID", message: "Missing bearer token" });
      const body = request.body ?? {};
      if (typeof body.title !== "string" || body.title.trim().length === 0) return reply.code(422).send({ ok: false, code: "INVALID_REQUEST", message: "title is required" });
      if (body.priority !== undefined && !isObligationPriority(body.priority)) return reply.code(422).send({ ok: false, code: "INVALID_REQUEST", message: "unknown priority" });
      const result = await otzarService.createHandoff({
        token, title: body.title,
        ...(typeof body.incoming_responsible_entity_id === "string" ? { incoming_responsible_entity_id: body.incoming_responsible_entity_id } : {}),
        ...(typeof body.workspace_id === "string" ? { workspace_id: body.workspace_id } : {}),
        ...(typeof body.conversation_id === "string" ? { conversation_id: body.conversation_id } : {}),
        ...(typeof body.summary === "string" ? { summary: body.summary } : {}),
        ...(typeof body.details === "object" && body.details !== null ? { details: body.details as Record<string, unknown> } : {}),
        ...(typeof body.priority === "string" ? { priority: body.priority } : {}),
        ...(typeof body.origin_key === "string" ? { origin_key: body.origin_key } : {}),
      });
      if (!result.ok) return reply.code(statusForCode(result.code)).send(result);
      return reply.code(200).send(result);
    },
  );

  app.get<{ Querystring: { role?: string; state?: string; limit?: string } }>(
    "/api/v1/otzar/handoffs",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null) return reply.code(401).send({ ok: false, code: "SESSION_INVALID", message: "Missing bearer token" });
      const rawLimit = Number(request.query.limit);
      if (request.query.role !== undefined && request.query.role !== "outgoing" && request.query.role !== "incoming") return reply.code(422).send({ ok: false, code: "INVALID_REQUEST", message: "role must be outgoing|incoming" });
      const states = typeof request.query.state === "string" && request.query.state.length > 0 ? request.query.state.split(",").filter((s) => s.length > 0) : undefined;
      if (states !== undefined && !states.every(isHandoffStateStr)) return reply.code(422).send({ ok: false, code: "INVALID_REQUEST", message: "unknown state filter" });
      const result = await otzarService.listHandoffs({
        token,
        ...(states !== undefined ? { states: states as never } : {}),
        ...(request.query.role === "outgoing" || request.query.role === "incoming" ? { role: request.query.role } : {}),
        ...(Number.isFinite(rawLimit) && rawLimit > 0 ? { limit: Math.floor(rawLimit) } : {}),
      });
      if (!result.ok) return reply.code(statusForCode(result.code)).send(result);
      return reply.code(200).send(result);
    },
  );

  app.get<{ Params: { handoff_id: string } }>(
    "/api/v1/otzar/handoffs/:handoff_id",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null) return reply.code(401).send({ ok: false, code: "SESSION_INVALID", message: "Missing bearer token" });
      const result = await otzarService.getHandoff({ token, handoff_id: request.params.handoff_id });
      if (!result.ok) return reply.code(statusForCode(result.code)).send(result);
      return reply.code(200).send(result);
    },
  );

  app.post<{ Params: { handoff_id: string }; Body: Record<string, unknown> }>(
    "/api/v1/otzar/handoffs/:handoff_id/link-obligation",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null) return reply.code(401).send({ ok: false, code: "SESSION_INVALID", message: "Missing bearer token" });
      const body = request.body ?? {};
      if (typeof body.obligation_id !== "string") return reply.code(422).send({ ok: false, code: "INVALID_REQUEST", message: "obligation_id is required" });
      const result = await otzarService.linkHandoffObligation({ token, handoff_id: request.params.handoff_id, obligation_id: body.obligation_id });
      if (!result.ok) return reply.code(statusForCode(result.code)).send(result);
      return reply.code(200).send(result);
    },
  );

  app.post<{ Params: { handoff_id: string }; Body: Record<string, unknown> }>(
    "/api/v1/otzar/handoffs/:handoff_id/dispose-obligation",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null) return reply.code(401).send({ ok: false, code: "SESSION_INVALID", message: "Missing bearer token" });
      const body = request.body ?? {};
      if (typeof body.obligation_id !== "string" || typeof body.disposition !== "string" || body.disposition === "PENDING" || !HANDOFF_DISPOSITION_SET.has(body.disposition)) {
        return reply.code(422).send({ ok: false, code: "INVALID_REQUEST", message: "obligation_id and a disposition of ACCEPTED|REASSIGNED|SUPERSEDED|RETAINED are required" });
      }
      if (body.disposition === "REASSIGNED" && typeof body.new_responsible_entity_id !== "string") {
        return reply.code(422).send({ ok: false, code: "INVALID_REQUEST", message: "REASSIGNED requires new_responsible_entity_id" });
      }
      const result = await otzarService.disposeHandoffObligation({
        token, handoff_id: request.params.handoff_id, obligation_id: body.obligation_id, disposition: body.disposition as never,
        ...(typeof body.new_responsible_entity_id === "string" ? { new_responsible_entity_id: body.new_responsible_entity_id } : {}),
      });
      if (!result.ok) return reply.code(statusForCode(result.code)).send(result);
      return reply.code(200).send(result);
    },
  );

  app.post<{ Params: { handoff_id: string }; Body: Record<string, unknown> }>(
    "/api/v1/otzar/handoffs/:handoff_id/transition",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null) return reply.code(401).send({ ok: false, code: "SESSION_INVALID", message: "Missing bearer token" });
      const body = request.body ?? {};
      const v = Number(body.expected_version);
      const ALLOWED = ["ready", "send", "receive", "acknowledge", "request_clarification", "escalate", "complete"];
      if (!Number.isInteger(v) || v < 0 || typeof body.transition !== "string" || !ALLOWED.includes(body.transition)) {
        return reply.code(422).send({ ok: false, code: "INVALID_REQUEST", message: "expected_version and a valid transition are required" });
      }
      const result = await otzarService.transitionHandoff({
        token, handoff_id: request.params.handoff_id, expected_version: v, transition: body.transition as never,
        ...(typeof body.incoming_responsible_entity_id === "string" ? { incoming_responsible_entity_id: body.incoming_responsible_entity_id } : {}),
        ...(typeof body.acknowledged_turn_id === "string" ? { acknowledged_turn_id: body.acknowledged_turn_id } : {}),
        ...(typeof body.escalation_id === "string" ? { escalation_id: body.escalation_id } : {}),
      });
      if (!result.ok) return reply.code(statusForCode(result.code)).send(result);
      return reply.code(200).send(result);
    },
  );

  app.post<{ Params: { handoff_id: string }; Body: Record<string, unknown> }>(
    "/api/v1/otzar/handoffs/:handoff_id/supersede",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null) return reply.code(401).send({ ok: false, code: "SESSION_INVALID", message: "Missing bearer token" });
      const body = request.body ?? {};
      const v = Number(body.expected_version);
      const replacement = body.replacement;
      if (!Number.isInteger(v) || v < 0 || typeof replacement !== "object" || replacement === null) return reply.code(422).send({ ok: false, code: "INVALID_REQUEST", message: "expected_version and replacement are required" });
      const r = replacement as Record<string, unknown>;
      if (typeof r.title !== "string" || r.title.trim().length === 0) return reply.code(422).send({ ok: false, code: "INVALID_REQUEST", message: "replacement.title is required" });
      const result = await otzarService.supersedeHandoff({
        token, handoff_id: request.params.handoff_id, expected_version: v,
        replacement: {
          title: r.title,
          ...(typeof r.incoming_responsible_entity_id === "string" ? { incoming_responsible_entity_id: r.incoming_responsible_entity_id } : {}),
          ...(typeof r.workspace_id === "string" ? { workspace_id: r.workspace_id } : {}),
          ...(typeof r.conversation_id === "string" ? { conversation_id: r.conversation_id } : {}),
          ...(typeof r.summary === "string" ? { summary: r.summary } : {}),
          ...(typeof r.details === "object" && r.details !== null ? { details: r.details as Record<string, unknown> } : {}),
          ...(typeof r.priority === "string" ? { priority: r.priority } : {}),
        },
      });
      if (!result.ok) return reply.code(statusForCode(result.code)).send(result);
      return reply.code(200).send(result);
    },
  );

  // [OTZAR STAGE-2 TRUTH-EVIDENCE] Read the evidence snapshots (safe projection + current source
  // status) a governed record's decisions relied upon. Access gated through the parent record.
  app.get<{ Params: { obligation_id: string } }>(
    "/api/v1/otzar/obligations/:obligation_id/evidence",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null) return reply.code(401).send({ ok: false, code: "SESSION_INVALID", message: "Missing bearer token" });
      const result = await otzarService.getObligationEvidence({ token, obligation_id: request.params.obligation_id });
      if (!result.ok) return reply.code(statusForCode(result.code)).send(result);
      return reply.code(200).send(result);
    },
  );

  app.get<{ Params: { handoff_id: string } }>(
    "/api/v1/otzar/handoffs/:handoff_id/evidence",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null) return reply.code(401).send({ ok: false, code: "SESSION_INVALID", message: "Missing bearer token" });
      const result = await otzarService.getHandoffEvidence({ token, handoff_id: request.params.handoff_id });
      if (!result.ok) return reply.code(statusForCode(result.code)).send(result);
      return reply.code(200).send(result);
    },
  );

  // [OTZAR STAGE-2 TRUTH-EVIDENCE §7] Recheck an obligation's captured evidence vs the current
  // source; a stale basis raises an idempotent SAFETY_CONCERN remediation. The captured basis is
  // never mutated. Idempotent per (obligation, stale-set) — safe to call repeatedly / poll.
  app.post<{ Params: { obligation_id: string } }>(
    "/api/v1/otzar/obligations/:obligation_id/evidence/recheck",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null) return reply.code(401).send({ ok: false, code: "SESSION_INVALID", message: "Missing bearer token" });
      const result = await otzarService.recheckObligationEvidence({ token, obligation_id: request.params.obligation_id });
      if (!result.ok) return reply.code(statusForCode(result.code)).send(result);
      return reply.code(200).send(result);
    },
  );

  // Recheck a handoff's FINAL-decision evidence; a stale basis raises an idempotent SAFETY_CONCERN
  // remediation in the caller's own scope. HANDOFF_SEND (point-in-time) never triggers.
  app.post<{ Params: { handoff_id: string } }>(
    "/api/v1/otzar/handoffs/:handoff_id/evidence/recheck",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null) return reply.code(401).send({ ok: false, code: "SESSION_INVALID", message: "Missing bearer token" });
      const result = await otzarService.recheckHandoffEvidence({ token, handoff_id: request.params.handoff_id });
      if (!result.ok) return reply.code(statusForCode(result.code)).send(result);
      return reply.code(200).send(result);
    },
  );

  // [OTZAR STAGE-2 TRUTH-EVIDENCE §7 — SWEEP · §L] Admin-triggered auto-remediation sweep over the
  // FAIL-CLOSED env allowlist (double-gated: can_admin_org WHO + OTZAR_TRUTH_EVIDENCE_RECHECK_TARGETS
  // WHICH). `dry_run: true` (the default) previews stale counts and creates nothing — the required
  // pre-activation check. `dry_run: false` performs the governed idempotent remediation. Registered
  // only when an AuthService is available (production).
  if (authService !== undefined) {
    app.post<{ Body: { dry_run?: unknown } }>(
      "/api/v1/otzar/evidence/recheck-sweep",
      { preHandler: requireAdminCapability(authService, "can_admin_org") },
      async (request, reply) => {
        // Default to dry-run: a governed run requires an explicit dry_run:false.
        const dryRun = (request.body?.dry_run) !== false;
        const result = await tickTruthEvidenceRecheck(
          parseTruthEvidenceTargets(process.env[TRUTH_EVIDENCE_RECHECK_TARGETS_ENV]),
          { dry_run: dryRun },
        );
        return reply.code(200).send({ ok: true, result });
      },
    );
  }

  // [SECTION-10 ORG-TRUTH] Governed promotion + conflict APIs. Bearer + decision-rights gated (the
  // authority check is in the service/query layer). No broad org browsing.
  app.post<{ Body: Record<string, unknown> }>(
    "/api/v1/otzar/org-truth/promote",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null) return reply.code(401).send({ ok: false, code: "SESSION_INVALID", message: "Missing bearer token" });
      const b = request.body ?? {};
      const result = await otzarService.promoteOrgTruth(b as unknown as Parameters<typeof otzarService.promoteOrgTruth>[0] & { token: string });
      if (!("ok" in result) || result.ok === false) return reply.code(statusForCode((result as { code: string }).code)).send(result);
      return reply.code(200).send(result);
    },
  );
  app.post<{ Params: { conflict_id: string }; Body: Record<string, unknown> }>(
    "/api/v1/otzar/org-truth/conflicts/:conflict_id/resolve",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null) return reply.code(401).send({ ok: false, code: "SESSION_INVALID", message: "Missing bearer token" });
      const result = await otzarService.resolveOrgTruthConflict({ ...(request.body ?? {}), token, conflict_set_id: request.params.conflict_id } as unknown as Parameters<typeof otzarService.resolveOrgTruthConflict>[0]);
      if (result.ok === false) return reply.code(statusForCode(result.code)).send(result);
      return reply.code(200).send(result);
    },
  );
  app.post<{ Params: { truth_record_id: string }; Body: { reason?: string; expected_version?: number } }>(
    "/api/v1/otzar/org-truth/:truth_record_id/retract",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null) return reply.code(401).send({ ok: false, code: "SESSION_INVALID", message: "Missing bearer token" });
      const result = await otzarService.retractOrgTruth({ token, truth_record_id: request.params.truth_record_id, reason: String(request.body?.reason ?? ""), expected_version: Number(request.body?.expected_version) });
      if (result.ok === false) return reply.code(statusForCode(result.code)).send(result);
      return reply.code(200).send(result);
    },
  );
  app.get<{ Querystring: { decision_domain?: string; topic?: string; subject_ref?: string; subject_ref_class?: string; workspace_id?: string } }>(
    "/api/v1/otzar/org-truth/current",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null) return reply.code(401).send({ ok: false, code: "SESSION_INVALID", message: "Missing bearer token" });
      const q = request.query;
      const result = await otzarService.getCurrentOrgTruth({ token, scope: { decision_domain: String(q.decision_domain ?? ""), topic: String(q.topic ?? ""), subject_ref: q.subject_ref ?? null, subject_ref_class: q.subject_ref_class ?? null, workspace_id: q.workspace_id ?? null } });
      if (result.ok === false) return reply.code(statusForCode(result.code)).send(result);
      return reply.code(200).send(result);
    },
  );
  app.get<{ Params: { truth_record_id: string } }>(
    "/api/v1/otzar/org-truth/:truth_record_id",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null) return reply.code(401).send({ ok: false, code: "SESSION_INVALID", message: "Missing bearer token" });
      const result = await otzarService.getOrgTruthRecord({ token, truth_record_id: request.params.truth_record_id });
      if (result.ok === false) return reply.code(statusForCode(result.code)).send(result);
      return reply.code(200).send(result);
    },
  );
  app.get(
    "/api/v1/otzar/org-truth/conflicts",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null) return reply.code(401).send({ ok: false, code: "SESSION_INVALID", message: "Missing bearer token" });
      const result = await otzarService.listOrgTruthConflicts({ token });
      if (result.ok === false) return reply.code(statusForCode(result.code)).send(result);
      return reply.code(200).send(result);
    },
  );
  app.get<{ Params: { conflict_id: string } }>(
    "/api/v1/otzar/org-truth/conflicts/:conflict_id",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null) return reply.code(401).send({ ok: false, code: "SESSION_INVALID", message: "Missing bearer token" });
      const result = await otzarService.getOrgTruthConflict({ token, conflict_set_id: request.params.conflict_id });
      if (result.ok === false) return reply.code(statusForCode(result.code)).send(result);
      return reply.code(200).send(result);
    },
  );
}
