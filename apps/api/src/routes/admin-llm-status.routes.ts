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
//     MockLLMProvider, XAIProvider)
//   - apps/api/src/services/otzar/otzar.service.ts (ConductSession
//     consumes the same provider)
//   - apps/api/src/middleware/admin.middleware.ts
//     (requireAdminCapability("can_admin_org"))

import type { FastifyInstance } from "fastify";
import { requireAdminCapability } from "../middleware/admin.middleware.js";
import type { AuthService } from "../services/auth.service.js";
import type { LLMProviderKind } from "../services/llm/llm.service.js";

export type LlmStatusCode =
  | "CONFIGURED"
  | "CONFIGURED_TEST_MODE"
  | "MISSING_KEY"
  | "MISSING_PROVIDER"
  | "MOCK_MODE"
  | "DISABLED";

export type LlmProviderType = "anthropic" | "openai" | "xai" | "mock";

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
  /**
   * Closed-vocab names of other providers that also have keys
   * configured (failover candidates). Never includes key material.
   */
  failover_configured: LlmProviderType[];
}

function keyConfigured(env: NodeJS.ProcessEnv, keyName: string): boolean {
  const keyValue = env[keyName];
  return (
    typeof keyValue === "string" &&
    keyValue.length > 0 &&
    !keyValue.startsWith("test-stub")
  );
}

function modelForKind(
  env: NodeJS.ProcessEnv,
  kind: LLMProviderKind,
): string {
  if (kind === "xai") {
    return (
      (typeof env.XAI_MODEL === "string" && env.XAI_MODEL.length > 0
        ? env.XAI_MODEL
        : undefined) ??
      (typeof env.MODEL_ROUTER_DEFAULT_MODEL === "string" &&
      env.MODEL_ROUTER_DEFAULT_MODEL.length > 0
        ? env.MODEL_ROUTER_DEFAULT_MODEL
        : undefined) ??
      "grok-4.5"
    );
  }
  if (kind === "openai") {
    return (
      (typeof env.OPENAI_MODEL === "string" && env.OPENAI_MODEL.length > 0
        ? env.OPENAI_MODEL
        : undefined) ??
      (typeof env.MODEL_ROUTER_DEFAULT_MODEL === "string" &&
      env.MODEL_ROUTER_DEFAULT_MODEL.length > 0
        ? env.MODEL_ROUTER_DEFAULT_MODEL
        : undefined) ??
      "gpt-4o"
    );
  }
  return (
    (typeof env.ANTHROPIC_MODEL === "string" && env.ANTHROPIC_MODEL.length > 0
      ? env.ANTHROPIC_MODEL
      : undefined) ??
    (typeof env.MODEL_ROUTER_DEFAULT_MODEL === "string" &&
    env.MODEL_ROUTER_DEFAULT_MODEL.length > 0
      ? env.MODEL_ROUTER_DEFAULT_MODEL
      : undefined) ??
    "claude-sonnet-4-6"
  );
}

function keyEnvForKind(kind: LLMProviderKind): string {
  if (kind === "xai") return "XAI_API_KEY";
  if (kind === "openai") return "OPENAI_API_KEY";
  return "ANTHROPIC_API_KEY";
}

// WHAT: Pure admin LLM status classifier (injectable env for unit tests).
// INPUT: process.env-like object.
// OUTPUT: Closed-vocab LlmStatusResponse without ok/test_call fields filled by route.
// WHY: Unit tests and the HTTP handler share one implementation (no drift).
export function classifyAdminLlmStatus(
  env: NodeJS.ProcessEnv = process.env,
): Omit<LlmStatusResponse, "ok" | "test_call_executed"> {
  if (env.NODE_ENV === "test") {
    return {
      provider: "mock",
      status: "MOCK_MODE",
      model: null,
      failover_configured: [],
    };
  }

  let preferred: LLMProviderKind;
  try {
    // Temporarily bind resolvePreferredProviderKind to the injected env
    // by reading the same keys the factory uses. Duplicate the small
    // precedence here so unit tests can inject env without mutating
    // process.env when they choose to pass an object.
    const raw = (
      env.LLM_PROVIDER ?? env.PREFERRED_LLM ?? ""
    ).toLowerCase();
    if (raw === "openai" || raw === "anthropic" || raw === "xai") {
      preferred = raw;
    } else if (raw.length > 0) {
      return {
        provider: "mock",
        status: "MISSING_PROVIDER",
        model: null,
        failover_configured: [],
      };
    } else {
      const xaiFlag = (env.XAI_ENABLED ?? "true").toLowerCase();
      const xaiOn =
        xaiFlag !== "false" &&
        xaiFlag !== "0" &&
        xaiFlag !== "no" &&
        xaiFlag !== "off";
      preferred =
        xaiOn && keyConfigured(env, "XAI_API_KEY") ? "xai" : "anthropic";
    }
  } catch {
    return {
      provider: "mock",
      status: "MISSING_PROVIDER",
      model: null,
      failover_configured: [],
    };
  }

  const failover: LlmProviderType[] = [];
  for (const kind of ["xai", "anthropic", "openai"] as const) {
    if (kind === preferred) continue;
    if (kind === "xai") {
      const flag = (env.XAI_ENABLED ?? "true").toLowerCase();
      const on =
        flag !== "false" && flag !== "0" && flag !== "no" && flag !== "off";
      if (on && keyConfigured(env, "XAI_API_KEY")) failover.push("xai");
      continue;
    }
    if (keyConfigured(env, keyEnvForKind(kind))) failover.push(kind);
  }

  if (preferred === "xai") {
    const flag = (env.XAI_ENABLED ?? "true").toLowerCase();
    const on =
      flag !== "false" && flag !== "0" && flag !== "no" && flag !== "off";
    if (!on) {
      return {
        provider: "xai",
        status: "DISABLED",
        model: null,
        failover_configured: failover,
      };
    }
  }

  if (!keyConfigured(env, keyEnvForKind(preferred))) {
    return {
      provider: preferred,
      status: "MISSING_KEY",
      model: null,
      failover_configured: failover,
    };
  }

  return {
    provider: preferred,
    status: "CONFIGURED",
    model: modelForKind(env, preferred),
    failover_configured: failover,
  };
}

function classify(): LlmStatusResponse {
  const body = classifyAdminLlmStatus(process.env);
  return {
    ok: true,
    ...body,
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
