// FILE: otzar.routes.ts
// PURPOSE: HTTP surface for Otzar conductSession (POST /message) and
//          closeConversation (POST /close). Bearer-validated; no
//          admin capability gate (these are user-facing employee
//          routes). Maps OtzarService result codes to HTTP status.
// CONNECTS TO: OtzarService, AuthService (validation handled inside
//              the service via the bearer token).

import type { FastifyInstance } from "fastify";
import type { OtzarService, IngestSourceEventInput } from "../services/otzar/otzar.service.js";
import {
  isDemoModeAllowed,
  DEMO_MODE_NOT_ALLOWED,
} from "../services/otzar/demo-mode.js";

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
      return 403;
    case "TWIN_NOT_FOUND":
    case "CONVERSATION_NOT_FOUND":
      return 404;
    case "INVALID_HISTORY":
      return 422;
    case "ALREADY_INGESTED":
      return 409;
    case "TOKEN_BUDGET_EXCEEDED":
      return 413;
    case "LLM_UNAVAILABLE":
      return 503;
    default:
      return 400;
  }
}

// WHAT: Register the Otzar routes.
export async function registerOtzarRoutes(
  app: FastifyInstance,
  otzarService: OtzarService,
): Promise<void> {
  app.post<{
    Body: {
      message?: unknown;
      conversation_id?: unknown;
      conversation_history?: unknown;
      token_budget?: unknown;
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
}
