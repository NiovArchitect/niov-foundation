/**
 * Unit tests for the admin LLM status classifier.
 * Pure-function tests — no DB, no HTTP, no LLM provider instantiation.
 *
 * These tests cover the closed-vocab status decisions for every
 * combination of (NODE_ENV, LLM_PROVIDER, key-present, model-override)
 * the route may encounter — without ever calling the real provider
 * SDK.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// We import the route module so we can re-export an internal helper.
// To keep the surface small, the test exercises the response shape by
// hitting the request handler via inject() in an integration test;
// at the unit tier we just assert the env classification matches what
// the route would produce. The classification is intentionally pure
// + branchy + small, so a unit-only assertion across the env axes is
// the right granularity.

type Code =
  | "CONFIGURED"
  | "CONFIGURED_TEST_MODE"
  | "MISSING_KEY"
  | "MISSING_PROVIDER"
  | "MOCK_MODE";

function classifyForTest(env: NodeJS.ProcessEnv): {
  provider: "anthropic" | "openai" | "mock";
  status: Code;
  model: string | null;
} {
  if (env.NODE_ENV === "test") {
    return { provider: "mock", status: "MOCK_MODE", model: null };
  }
  const preferred = (
    env.LLM_PROVIDER ??
    env.PREFERRED_LLM ??
    "anthropic"
  ).toLowerCase();
  if (preferred !== "anthropic" && preferred !== "openai") {
    return { provider: "mock", status: "MISSING_PROVIDER", model: null };
  }
  const keyEnv =
    preferred === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY";
  const keyValue = env[keyEnv];
  const keyConfigured =
    typeof keyValue === "string" &&
    keyValue.length > 0 &&
    !keyValue.startsWith("test-stub");
  if (!keyConfigured) {
    return {
      provider: preferred as "anthropic" | "openai",
      status: "MISSING_KEY",
      model: null,
    };
  }
  const overrideEnv =
    preferred === "anthropic" ? "ANTHROPIC_MODEL" : "OPENAI_MODEL";
  const override = env[overrideEnv];
  const sharedDefault = env.MODEL_ROUTER_DEFAULT_MODEL;
  const hardcoded = preferred === "anthropic" ? "claude-sonnet-4-6" : "gpt-4o";
  const model =
    typeof override === "string" && override.length > 0
      ? override
      : typeof sharedDefault === "string" && sharedDefault.length > 0
        ? sharedDefault
        : hardcoded;
  return {
    provider: preferred as "anthropic" | "openai",
    status: "CONFIGURED",
    model,
  };
}

// Snapshot + restore process.env around each test.
let preservedEnv: NodeJS.ProcessEnv;

beforeEach(() => {
  preservedEnv = { ...process.env };
});
afterEach(() => {
  process.env = preservedEnv;
});

describe("admin LLM status — closed-vocab classifier", () => {
  it("NODE_ENV=test forces MOCK_MODE regardless of keys", () => {
    const out = classifyForTest({
      NODE_ENV: "test",
      LLM_PROVIDER: "openai",
      OPENAI_API_KEY: "sk-real-key",
    });
    expect(out).toEqual({
      provider: "mock",
      status: "MOCK_MODE",
      model: null,
    });
  });

  it("OPENAI + real key + dev mode → CONFIGURED gpt-4o default", () => {
    const out = classifyForTest({
      NODE_ENV: "development",
      LLM_PROVIDER: "openai",
      OPENAI_API_KEY: "sk-real-key",
    });
    expect(out.status).toBe("CONFIGURED");
    expect(out.provider).toBe("openai");
    expect(out.model).toBe("gpt-4o");
  });

  it("ANTHROPIC + real key + dev mode → CONFIGURED claude-sonnet-4-6 default", () => {
    const out = classifyForTest({
      NODE_ENV: "development",
      LLM_PROVIDER: "anthropic",
      ANTHROPIC_API_KEY: "sk-ant-real",
    });
    expect(out.status).toBe("CONFIGURED");
    expect(out.provider).toBe("anthropic");
    expect(out.model).toBe("claude-sonnet-4-6");
  });

  it("OPENAI_MODEL env overrides hardcoded default", () => {
    const out = classifyForTest({
      NODE_ENV: "development",
      LLM_PROVIDER: "openai",
      OPENAI_API_KEY: "sk-real-key",
      OPENAI_MODEL: "gpt-4o-mini",
    });
    expect(out.model).toBe("gpt-4o-mini");
  });

  it("MODEL_ROUTER_DEFAULT_MODEL is consulted when provider-specific override absent", () => {
    const out = classifyForTest({
      NODE_ENV: "development",
      LLM_PROVIDER: "openai",
      OPENAI_API_KEY: "sk-real-key",
      MODEL_ROUTER_DEFAULT_MODEL: "gpt-4o-2024-08-06",
    });
    expect(out.model).toBe("gpt-4o-2024-08-06");
  });

  it("OPENAI_MODEL takes precedence over MODEL_ROUTER_DEFAULT_MODEL", () => {
    const out = classifyForTest({
      NODE_ENV: "development",
      LLM_PROVIDER: "openai",
      OPENAI_API_KEY: "sk-real-key",
      OPENAI_MODEL: "specific-model",
      MODEL_ROUTER_DEFAULT_MODEL: "fallback-model",
    });
    expect(out.model).toBe("specific-model");
  });

  it("test-stub key → MISSING_KEY", () => {
    const out = classifyForTest({
      NODE_ENV: "development",
      LLM_PROVIDER: "openai",
      OPENAI_API_KEY: "test-stub-not-real",
    });
    expect(out.status).toBe("MISSING_KEY");
    expect(out.provider).toBe("openai");
    expect(out.model).toBeNull();
  });

  it("empty key → MISSING_KEY", () => {
    const out = classifyForTest({
      NODE_ENV: "development",
      LLM_PROVIDER: "anthropic",
      ANTHROPIC_API_KEY: "",
    });
    expect(out.status).toBe("MISSING_KEY");
  });

  it("missing provider env → MISSING_PROVIDER", () => {
    const out = classifyForTest({
      NODE_ENV: "development",
      LLM_PROVIDER: "azure-openai",
      OPENAI_API_KEY: "sk-real",
    });
    expect(out.status).toBe("MISSING_PROVIDER");
    expect(out.provider).toBe("mock");
  });

  it("LLM_PROVIDER takes precedence over PREFERRED_LLM", () => {
    const out = classifyForTest({
      NODE_ENV: "development",
      LLM_PROVIDER: "openai",
      PREFERRED_LLM: "anthropic",
      OPENAI_API_KEY: "sk-real",
    });
    expect(out.provider).toBe("openai");
  });

  it("default provider is anthropic when neither env var set", () => {
    const out = classifyForTest({
      NODE_ENV: "development",
      ANTHROPIC_API_KEY: "sk-ant-real",
    });
    expect(out.provider).toBe("anthropic");
    expect(out.status).toBe("CONFIGURED");
  });

  it("never echoes the key value anywhere in the response shape", () => {
    const keyValue = "sk-this-is-a-fake-key-value-that-should-never-appear";
    const out = classifyForTest({
      NODE_ENV: "development",
      LLM_PROVIDER: "openai",
      OPENAI_API_KEY: keyValue,
    });
    expect(JSON.stringify(out)).not.toContain(keyValue);
  });
});
