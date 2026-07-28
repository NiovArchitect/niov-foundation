/**
 * Unit tests for the admin LLM status classifier.
 * Pure-function tests — no DB, no HTTP, no LLM provider instantiation.
 *
 * These tests cover the closed-vocab status decisions for every
 * combination of (NODE_ENV, LLM_PROVIDER, key-present, model-override)
 * the route may encounter — without ever calling the real provider
 * SDK.
 */
import { describe, expect, it } from "vitest";
import { classifyAdminLlmStatus } from "../../apps/api/src/routes/admin-llm-status.routes.js";

describe("admin LLM status — closed-vocab classifier", () => {
  it("NODE_ENV=test forces MOCK_MODE regardless of keys", () => {
    const out = classifyAdminLlmStatus({
      NODE_ENV: "test",
      LLM_PROVIDER: "openai",
      OPENAI_API_KEY: "sk-real-key",
    });
    expect(out).toEqual({
      provider: "mock",
      status: "MOCK_MODE",
      model: null,
      failover_configured: [],
    });
  });

  it("OPENAI + real key + dev mode → CONFIGURED gpt-4o default", () => {
    const out = classifyAdminLlmStatus({
      NODE_ENV: "development",
      LLM_PROVIDER: "openai",
      OPENAI_API_KEY: "sk-real-key",
    });
    expect(out.status).toBe("CONFIGURED");
    expect(out.provider).toBe("openai");
    expect(out.model).toBe("gpt-4o");
  });

  it("ANTHROPIC + real key + dev mode → CONFIGURED claude-sonnet-4-6 default", () => {
    const out = classifyAdminLlmStatus({
      NODE_ENV: "development",
      LLM_PROVIDER: "anthropic",
      ANTHROPIC_API_KEY: "sk-ant-real",
    });
    expect(out.status).toBe("CONFIGURED");
    expect(out.provider).toBe("anthropic");
    expect(out.model).toBe("claude-sonnet-4-6");
  });

  it("XAI + real key → CONFIGURED grok-4.5 default", () => {
    const out = classifyAdminLlmStatus({
      NODE_ENV: "development",
      LLM_PROVIDER: "xai",
      XAI_API_KEY: "xai-real-key",
    });
    expect(out.status).toBe("CONFIGURED");
    expect(out.provider).toBe("xai");
    expect(out.model).toBe("grok-4.5");
  });

  it("XAI_ENABLED=false → DISABLED even when key present", () => {
    const out = classifyAdminLlmStatus({
      NODE_ENV: "development",
      LLM_PROVIDER: "xai",
      XAI_API_KEY: "xai-real-key",
      XAI_ENABLED: "false",
    });
    expect(out.status).toBe("DISABLED");
    expect(out.provider).toBe("xai");
    expect(out.model).toBeNull();
  });

  it("OPENAI_MODEL env overrides hardcoded default", () => {
    const out = classifyAdminLlmStatus({
      NODE_ENV: "development",
      LLM_PROVIDER: "openai",
      OPENAI_API_KEY: "sk-real-key",
      OPENAI_MODEL: "gpt-4o-mini",
    });
    expect(out.model).toBe("gpt-4o-mini");
  });

  it("MODEL_ROUTER_DEFAULT_MODEL is consulted when provider-specific override absent", () => {
    const out = classifyAdminLlmStatus({
      NODE_ENV: "development",
      LLM_PROVIDER: "openai",
      OPENAI_API_KEY: "sk-real-key",
      MODEL_ROUTER_DEFAULT_MODEL: "gpt-4o-2024-08-06",
    });
    expect(out.model).toBe("gpt-4o-2024-08-06");
  });

  it("OPENAI_MODEL takes precedence over MODEL_ROUTER_DEFAULT_MODEL", () => {
    const out = classifyAdminLlmStatus({
      NODE_ENV: "development",
      LLM_PROVIDER: "openai",
      OPENAI_API_KEY: "sk-real-key",
      OPENAI_MODEL: "specific-model",
      MODEL_ROUTER_DEFAULT_MODEL: "fallback-model",
    });
    expect(out.model).toBe("specific-model");
  });

  it("test-stub key → MISSING_KEY", () => {
    const out = classifyAdminLlmStatus({
      NODE_ENV: "development",
      LLM_PROVIDER: "openai",
      OPENAI_API_KEY: "test-stub-not-real",
    });
    expect(out.status).toBe("MISSING_KEY");
    expect(out.provider).toBe("openai");
    expect(out.model).toBeNull();
  });

  it("empty key → MISSING_KEY", () => {
    const out = classifyAdminLlmStatus({
      NODE_ENV: "development",
      LLM_PROVIDER: "anthropic",
      ANTHROPIC_API_KEY: "",
    });
    expect(out.status).toBe("MISSING_KEY");
  });

  it("missing provider env → MISSING_PROVIDER", () => {
    const out = classifyAdminLlmStatus({
      NODE_ENV: "development",
      LLM_PROVIDER: "azure-openai",
      OPENAI_API_KEY: "sk-real",
    });
    expect(out.status).toBe("MISSING_PROVIDER");
    expect(out.provider).toBe("mock");
  });

  it("LLM_PROVIDER takes precedence over PREFERRED_LLM", () => {
    const out = classifyAdminLlmStatus({
      NODE_ENV: "development",
      LLM_PROVIDER: "openai",
      PREFERRED_LLM: "anthropic",
      OPENAI_API_KEY: "sk-real",
    });
    expect(out.provider).toBe("openai");
  });

  it("default provider is anthropic when neither env var set and no XAI key", () => {
    const out = classifyAdminLlmStatus({
      NODE_ENV: "development",
      ANTHROPIC_API_KEY: "sk-ant-real",
    });
    expect(out.provider).toBe("anthropic");
    expect(out.status).toBe("CONFIGURED");
  });

  it("default provider prefers xai when XAI_API_KEY present and LLM_PROVIDER unset", () => {
    const out = classifyAdminLlmStatus({
      NODE_ENV: "development",
      XAI_API_KEY: "xai-real",
      ANTHROPIC_API_KEY: "sk-ant-real",
    });
    expect(out.provider).toBe("xai");
    expect(out.status).toBe("CONFIGURED");
    expect(out.failover_configured).toContain("anthropic");
  });

  it("never echoes the key value anywhere in the response shape", () => {
    const keyValue = "sk-this-is-a-fake-key-value-that-should-never-appear";
    const out = classifyAdminLlmStatus({
      NODE_ENV: "development",
      LLM_PROVIDER: "openai",
      OPENAI_API_KEY: keyValue,
    });
    expect(JSON.stringify(out)).not.toContain(keyValue);
  });
});
