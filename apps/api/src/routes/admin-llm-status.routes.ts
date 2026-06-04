// FILE: admin-llm-status.routes.ts
// PURPOSE: can_admin_org-gated read-only LLM provider status for the
//          Foundation admin / Otzar UI. Closed-vocab response shape;
//          NEVER echoes raw API keys / endpoints / chain-of-thought.
//
//          GET /api/v1/admin/llm-status
//
//          Used by the Otzar "AI Twin brain: configured" badge so
//          the operator can see honestly whether the real LLM is
//          wired vs the mock fallback — without exposing any
//          provider credential.
//
// PRIVACY INVARIANT (locked at the response-projection tier):
//   - NO API key value (raw or partial)
//   - NO API endpoint URL
//   - NO model parameters (temperature, max tokens, etc.)
//   - NO scripted/canned response content
//   - NO test-call output text (only ok/timeout/error class)
//   - Closed-vocab `status` literal only
//
// CONNECTS TO:
//   - apps/api/src/services/llm/llm.service.ts (getLLMProvider,
//     MockLLMProvider)
//   - apps/api/src/services/otzar/otzar.service.ts (ConductSession
//     consumes the same provider)
//   - apps/api/src/middleware/admin.middleware.ts
//     (requireAdminCapability("can_admin_org"))

import type { FastifyInstance } from "fastify";
import { requireAdminCapability } from "../middleware/admin.middleware.js";
import type { AuthService } from "../services/auth.service.js";

export type LlmStatusCode =
  | "CONFIGURED"
  | "CONFIGURED_TEST_MODE"
  | "MISSING_KEY"
  | "MISSING_PROVIDER"
  | "MOCK_MODE";

export type LlmProviderType = "anthropic" | "openai" | "mock";

export interface LlmStatusResponse {
  ok: true;
  provider: LlmProviderType;
  status: LlmStatusCode;
  model: string | null;
  /**
   * Always FALSE in this route. A safe live test call requires
   * explicit operator authorization + a dedicated `?probe=true`
   * route variant that's forward-substrate. Reporting FALSE here
   * keeps the privacy invariant tight: we never spend tokens on
   * behalf of a passive UI poll.
   */
  test_call_executed: false;
}

function classify(): LlmStatusResponse {
  // NODE_ENV=test pins MockLLMProvider regardless of any other
  // env. The server.ts buildApp short-circuits to MockLLMProvider
  // before getLLMProvider is even called. Surface that honestly.
  if (process.env.NODE_ENV === "test") {
    return {
      ok: true,
      provider: "mock",
      status: "MOCK_MODE",
      model: null,
      test_call_executed: false,
    };
  }

  const preferred = (
    process.env.LLM_PROVIDER ?? process.env.PREFERRED_LLM ?? "anthropic"
  ).toLowerCase();

  if (preferred !== "anthropic" && preferred !== "openai") {
    return {
      ok: true,
      provider: "mock",
      status: "MISSING_PROVIDER",
      model: null,
      test_call_executed: false,
    };
  }

  const keyEnv =
    preferred === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY";
  const keyValue = process.env[keyEnv];
  const keyConfigured =
    typeof keyValue === "string" &&
    keyValue.length > 0 &&
    !keyValue.startsWith("test-stub");

  if (!keyConfigured) {
    return {
      ok: true,
      provider: preferred,
      status: "MISSING_KEY",
      model: null,
      test_call_executed: false,
    };
  }

  // Model selection precedence mirrors llm.service.ts:
  //   AnthropicProvider / OpenAIProvider constructor:
  //     1. (explicit args)
  //     2. ANTHROPIC_MODEL / OPENAI_MODEL env var
  //     3. MODEL_ROUTER_DEFAULT_MODEL env var
  //     4. hardcoded default (claude-sonnet-4-6 / gpt-4o)
  const overrideEnv =
    preferred === "anthropic" ? "ANTHROPIC_MODEL" : "OPENAI_MODEL";
  const override = process.env[overrideEnv];
  const sharedDefault = process.env.MODEL_ROUTER_DEFAULT_MODEL;
  const hardcoded = preferred === "anthropic" ? "claude-sonnet-4-6" : "gpt-4o";
  const model =
    typeof override === "string" && override.length > 0
      ? override
      : typeof sharedDefault === "string" && sharedDefault.length > 0
        ? sharedDefault
        : hardcoded;
  return {
    ok: true,
    provider: preferred as LlmProviderType,
    status: "CONFIGURED",
    model,
    test_call_executed: false,
  };
}

export async function registerAdminLlmStatusRoutes(
  app: FastifyInstance,
  authService: AuthService,
): Promise<void> {
  app.get(
    "/api/v1/admin/llm-status",
    {
      preHandler: requireAdminCapability(authService, "can_admin_org"),
    },
    async (_request, reply) => {
      const status = classify();
      return reply.code(200).send(status);
    },
  );
}
