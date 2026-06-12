// FILE: connector-oauth.routes.ts
// PURPOSE: Phase 1261 — Priority C OAuth connector routes.
//            POST /api/v1/connectors/oauth/:provider/start   (admin)
//            GET  /api/v1/connectors/oauth/callback/:provider (browser)
//            GET  /api/v1/connectors/oauth/status            (admin)
//            POST /api/v1/connectors/oauth/:provider/verify  (admin)
//            POST /api/v1/connectors/oauth/:provider/revoke  (admin)
//          Admin routes are can_admin_org-gated + org-scoped via the
//          canonical getOrgEntityId pattern. The callback route is
//          intentionally unauthenticated at the bearer tier — the
//          provider redirects the admin's browser here; the signed
//          state JWT (org + actor inside, 10-minute expiry) is the
//          authentication. Responses NEVER carry tokens, codes,
//          client secrets, state JWTs, or encrypted envelopes.
// CONNECTS TO:
//   - apps/api/src/services/connector/connector-oauth.service.ts
//   - apps/api/src/middleware/admin.middleware.ts
//   - apps/api/src/services/governance/org.js (getOrgEntityId)
//   - docs/operations/oauth-priority-c-setup-runbook.md

import type { FastifyInstance, FastifyReply } from "fastify";
import { requireAdminCapability } from "../middleware/admin.middleware.js";
import { getOrgEntityId } from "../services/governance/org.js";
import type { AuthService } from "../services/auth.service.js";
import {
  getOAuthStatusForOrg,
  handleOAuthCallback,
  revokeOAuthConnection,
  startOAuthForOrg,
  verifyOAuthConnection,
} from "../services/connector/connector-oauth.service.js";
import type { ConnectorOAuthFailure } from "../services/connector/connector-oauth.service.js";

// WHAT: Resolve the caller's org or 404 (connector.routes.ts mirror).
// INPUT: entityId + reply.
// OUTPUT: org_entity_id or null after replying.
// WHY: Cross-tenant fail-closed before any credential row is read.
async function resolveOrgOrFail(
  entityId: string,
  reply: FastifyReply,
): Promise<string | null> {
  try {
    return await getOrgEntityId(entityId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    if (message === "NOT_IN_ANY_ORG" || message === "ORG_HIERARCHY_TOO_DEEP") {
      await reply.code(404).send({
        ok: false,
        code: "NO_ORG_FOR_CALLER",
        message: "Caller is not in an organization",
      });
      return null;
    }
    throw err;
  }
}

// WHAT: Map ConnectorOAuthFailure codes to HTTP statuses.
// INPUT: failure.
// OUTPUT: HTTP status number.
// WHY: One route-tier mapping table (connector.routes.ts pattern).
function statusFor(failure: ConnectorOAuthFailure): number {
  switch (failure.code) {
    case "UNKNOWN_PROVIDER":
      return 404;
    case "APP_CREDENTIALS_MISSING":
    case "NOT_CONNECTED":
      return 409;
    case "STATE_INVALID":
      return 403;
    case "EXCHANGE_FAILED":
    case "VERIFY_FAILED":
    case "REVOKE_FAILED":
      return 502;
    case "INTERNAL_ERROR":
      return 500;
  }
}

// WHAT: Minimal HTML for the browser-facing callback outcome.
// INPUT: ok flag + display label (closed-vocab provider name only).
// OUTPUT: A short self-contained HTML page.
// WHY: The admin lands here from the provider consent screen; the
//      page says exactly one honest thing and sends them back to
//      Otzar. No script, no secrets, no user-controlled content.
function callbackHtml(ok: boolean, label: string): string {
  const title = ok ? `${label} connected` : `${label} connection failed`;
  const body = ok
    ? "The connection was authorized. You can close this tab and return to Otzar — use Verify in Integrations to confirm it works end-to-end."
    : "The connection was not completed. Close this tab, return to Otzar, and try Connect again from Integrations.";
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body style="font-family: system-ui, sans-serif; max-width: 40rem; margin: 4rem auto; line-height: 1.5;"><h1 style="font-size: 1.25rem;">${title}</h1><p>${body}</p></body></html>`;
}

// WHAT: Register the 5 Phase 1261 OAuth connector routes.
// INPUT: Fastify instance + AuthService.
// OUTPUT: Promise resolving once registration completes.
// WHY: Mirrors registerConnectorRoutes. The callback is the single
//      bearer-less route; everything else is can_admin_org.
export async function registerConnectorOAuthRoutes(
  app: FastifyInstance,
  authService: AuthService,
): Promise<void> {
  // POST /api/v1/connectors/oauth/:provider/start
  app.post<{ Params: { provider: string } }>(
    "/api/v1/connectors/oauth/:provider/start",
    { preHandler: requireAdminCapability(authService, "can_admin_org") },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const orgEntityId = await resolveOrgOrFail(callerId, reply);
      if (orgEntityId === null) return;
      const result = await startOAuthForOrg({
        provider_slug: request.params.provider,
        org_entity_id: orgEntityId,
        actor_entity_id: callerId,
      });
      if (result.ok === true) {
        return reply
          .code(200)
          .send({ ok: true, authorize_url: result.authorize_url });
      }
      return reply.code(statusFor(result)).send({
        ok: false,
        code: result.code,
        ...(result.message !== undefined ? { message: result.message } : {}),
      });
    },
  );

  // GET /api/v1/connectors/oauth/callback/:provider — browser lands
  // here from the provider consent screen. The signed state is the
  // auth; the response is human-readable HTML with zero secrets.
  app.get<{
    Params: { provider: string };
    Querystring: { code?: string; state?: string; error?: string };
  }>(
    "/api/v1/connectors/oauth/callback/:provider",
    async (request, reply) => {
      const { code, state, error } = request.query;
      const label = request.params.provider.replace(/[^a-z]/g, "");
      if (typeof error === "string" && error.length > 0) {
        // Consent denied / provider error: nothing exchanged.
        return reply
          .code(400)
          .type("text/html")
          .send(callbackHtml(false, label));
      }
      if (
        typeof code !== "string" ||
        code.length === 0 ||
        typeof state !== "string" ||
        state.length === 0
      ) {
        return reply
          .code(400)
          .type("text/html")
          .send(callbackHtml(false, label));
      }
      const result = await handleOAuthCallback({
        provider_slug: request.params.provider,
        code,
        state,
      });
      if (result.ok === true) {
        return reply
          .code(200)
          .type("text/html")
          .send(callbackHtml(true, result.display_name));
      }
      return reply
        .code(statusFor(result))
        .type("text/html")
        .send(callbackHtml(false, label));
    },
  );

  // GET /api/v1/connectors/oauth/status
  app.get(
    "/api/v1/connectors/oauth/status",
    { preHandler: requireAdminCapability(authService, "can_admin_org") },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const orgEntityId = await resolveOrgOrFail(callerId, reply);
      if (orgEntityId === null) return;
      const result = await getOAuthStatusForOrg(orgEntityId);
      return reply
        .code(200)
        .send({ ok: true, providers: result.providers });
    },
  );

  // POST /api/v1/connectors/oauth/:provider/verify
  app.post<{ Params: { provider: string } }>(
    "/api/v1/connectors/oauth/:provider/verify",
    { preHandler: requireAdminCapability(authService, "can_admin_org") },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const orgEntityId = await resolveOrgOrFail(callerId, reply);
      if (orgEntityId === null) return;
      const result = await verifyOAuthConnection({
        provider_slug: request.params.provider,
        org_entity_id: orgEntityId,
        actor_entity_id: callerId,
      });
      if (result.ok === true) {
        return reply.code(200).send({ ok: true, status: result.status });
      }
      return reply.code(statusFor(result)).send({
        ok: false,
        code: result.code,
        ...(result.message !== undefined ? { message: result.message } : {}),
      });
    },
  );

  // POST /api/v1/connectors/oauth/:provider/revoke
  app.post<{ Params: { provider: string } }>(
    "/api/v1/connectors/oauth/:provider/revoke",
    { preHandler: requireAdminCapability(authService, "can_admin_org") },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const orgEntityId = await resolveOrgOrFail(callerId, reply);
      if (orgEntityId === null) return;
      const result = await revokeOAuthConnection({
        provider_slug: request.params.provider,
        org_entity_id: orgEntityId,
        actor_entity_id: callerId,
      });
      if (result.ok === true) {
        return reply.code(200).send({ ok: true });
      }
      return reply.code(statusFor(result)).send({
        ok: false,
        code: result.code,
        ...(result.message !== undefined ? { message: result.message } : {}),
      });
    },
  );
}
