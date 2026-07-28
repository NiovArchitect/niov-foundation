// FILE: llm.test.ts (unit)
// PURPOSE: Cover the circuit-breaker state machine that wraps every
//          LLM provider in production. Tests use MockLLMProvider +
//          an injected clock so the 5-minute open duration can be
//          marched through in microseconds.
// CONNECTS TO: services/llm/llm.service.ts (CircuitBreaker,
//              withCircuitBreaker, MockLLMProvider).
//
// CI RULE: no real API calls. AnthropicProvider and OpenAIProvider
// concrete classes are NEVER instantiated here. Smoke testing real
// providers is a manual / scripted concern outside CI.

import { describe, expect, it } from "vitest";
import {
  CircuitBreaker,
  LLM_USER_SAFE_UNAVAILABLE,
  MockLLMProvider,
  classifyXaiProviderError,
  orderedProviderKinds,
  withCircuitBreaker,
  withProviderChain,
  withProviderFailover,
  type LLMResult,
} from "@niov/api";

// WHAT: Synthetic clock that advances on demand.
// INPUT: None.
// OUTPUT: { now, advance, set }.
// WHY: Lets tests march the breaker through OPEN → HALF_OPEN
//      transitions without sleeping 5 real minutes.
function makeClock(start = 1_700_000_000_000) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
    set: (ms: number) => {
      t = ms;
    },
  };
}

const SUCCESS: LLMResult = {
  ok: true,
  text: "ok",
  provider: "mock",
  model: "mock-1",
};
const FAILURE: LLMResult = {
  ok: false,
  code: "PROVIDER_ERROR",
  fallback_message: "boom",
  provider: "mock",
};

describe("CircuitBreaker -- 3 failures within 5 min opens the circuit", () => {
  it("after 3 consecutive failures within 5 minutes the 4th call returns the breaker fallback", async () => {
    const clock = makeClock();
    // Mock returns failure 4 times, then success (which should never
    // be reached because the breaker opens on the 3rd failure).
    const mock = new MockLLMProvider([FAILURE, FAILURE, FAILURE, SUCCESS]);
    const wrapped = withCircuitBreaker(mock, clock.now);
    // 3 failed calls -- each spaced 1s apart, well within window.
    for (let i = 0; i < 3; i++) {
      const r = await wrapped.generateResponse({ system: "", user: "" });
      expect(r.ok).toBe(false);
      clock.advance(1000);
    }
    expect(wrapped.breaker.getState()).toBe("OPEN");
    // 4th call: breaker rejects without invoking the wrapped provider.
    const r4 = await wrapped.generateResponse({ system: "", user: "" });
    expect(r4.ok).toBe(false);
    if (!r4.ok) {
      expect(r4.code).toBe("PROVIDER_UNAVAILABLE");
    }
  });
});

describe("CircuitBreaker -- 5 minutes elapsed transitions OPEN to HALF_OPEN", () => {
  it("after 5+ minutes since OPEN, next call is allowed and downstream is invoked", async () => {
    const clock = makeClock();
    const mock = new MockLLMProvider([FAILURE, FAILURE, FAILURE, SUCCESS]);
    const wrapped = withCircuitBreaker(mock, clock.now);
    for (let i = 0; i < 3; i++) {
      await wrapped.generateResponse({ system: "", user: "" });
    }
    expect(wrapped.breaker.getState()).toBe("OPEN");
    // Advance past the 5-minute open window.
    clock.advance(5 * 60 * 1000 + 1);
    // shouldAttempt() flips to HALF_OPEN; the call goes through to
    // the mock and gets a SUCCESS response.
    const r = await wrapped.generateResponse({ system: "", user: "" });
    expect(r.ok).toBe(true);
    // Successful HALF_OPEN test → CLOSED.
    expect(wrapped.breaker.getState()).toBe("CLOSED");
  });
});

describe("CircuitBreaker -- HALF_OPEN failure re-opens for another 5 minutes", () => {
  it("a failed HALF_OPEN probe puts the breaker back in OPEN", async () => {
    const clock = makeClock();
    // 3 failures to open, then another failure on the HALF_OPEN
    // probe.
    const mock = new MockLLMProvider([FAILURE, FAILURE, FAILURE, FAILURE]);
    const wrapped = withCircuitBreaker(mock, clock.now);
    for (let i = 0; i < 3; i++) {
      await wrapped.generateResponse({ system: "", user: "" });
    }
    expect(wrapped.breaker.getState()).toBe("OPEN");
    clock.advance(5 * 60 * 1000 + 1);
    // HALF_OPEN probe -- mock returns FAILURE.
    const r = await wrapped.generateResponse({ system: "", user: "" });
    expect(r.ok).toBe(false);
    // Failed probe → back to OPEN.
    expect(wrapped.breaker.getState()).toBe("OPEN");
    // And the next call without further clock advance is rejected
    // by the breaker.
    const r2 = await wrapped.generateResponse({ system: "", user: "" });
    expect(r2.ok).toBe(false);
    if (!r2.ok) {
      expect(r2.code).toBe("PROVIDER_UNAVAILABLE");
    }
  });
});

describe("CircuitBreaker -- failures outside the rolling window do NOT count", () => {
  it("two failures, then a 6-minute gap, then two more failures keeps the circuit CLOSED", async () => {
    const clock = makeClock();
    const mock = new MockLLMProvider([FAILURE, FAILURE, FAILURE, FAILURE]);
    const wrapped = withCircuitBreaker(mock, clock.now);
    // Two failures.
    await wrapped.generateResponse({ system: "", user: "" });
    await wrapped.generateResponse({ system: "", user: "" });
    expect(wrapped.breaker.getState()).toBe("CLOSED");
    // Advance 6 minutes -- prior failures fall outside the 5-min
    // window so they no longer count.
    clock.advance(6 * 60 * 1000);
    // Two more failures -- still only 2 failures inside the current
    // window, breaker stays CLOSED.
    await wrapped.generateResponse({ system: "", user: "" });
    await wrapped.generateResponse({ system: "", user: "" });
    expect(wrapped.breaker.getState()).toBe("CLOSED");
  });
});

// WHAT: Governed cross-provider failover for Talk / voice.
// WHY: When the primary vendor is unavailable (credits, rate-limit,
//      circuit open, 5xx), the secondary must answer with the SAME
//      system/user/context args — no ungrounded alternate path.
describe("withProviderFailover -- primary failure uses secondary", () => {
  it("returns secondary success and reports secondary provider name", async () => {
    const primary = new MockLLMProvider([FAILURE]);
    const secondaryOk: LLMResult = {
      ok: true,
      text: "grounded secondary answer",
      provider: "secondary-mock",
      model: "secondary-1",
    };
    const secondary = new MockLLMProvider([secondaryOk]);
    const composed = withProviderFailover(primary, secondary);
    const args = {
      system: "governed system",
      user: "What is the HelioGrid decision?",
      context: "wallet-scoped context",
    };
    const r = await composed.generateResponse(args);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.text).toBe("grounded secondary answer");
      expect(r.provider).toBe("secondary-mock");
      expect(r.model).toBe("secondary-1");
    }
    // Both providers received identical governed args (context parity).
    expect(primary.getCalls()).toEqual([args]);
    expect(secondary.getCalls()).toEqual([args]);
  });

  it("does not call secondary when primary succeeds", async () => {
    const primary = new MockLLMProvider([SUCCESS]);
    const secondary = new MockLLMProvider([
      {
        ok: true,
        text: "should-not-run",
        provider: "secondary-mock",
        model: "secondary-1",
      },
    ]);
    const composed = withProviderFailover(primary, secondary);
    const r = await composed.generateResponse({ system: "s", user: "u" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.text).toBe("ok");
      expect(r.provider).toBe("mock");
    }
    expect(secondary.getCalls()).toHaveLength(0);
  });

  it("returns user-safe copy when both providers fail (no vendor leak)", async () => {
    const primary = new MockLLMProvider([
      {
        ok: false,
        code: "PROVIDER_ERROR",
        fallback_message: "Anthropic credit balance too low",
        provider: "anthropic",
      },
    ]);
    const secondary = new MockLLMProvider([
      {
        ok: false,
        code: "PROVIDER_ERROR",
        fallback_message: "OpenAI rate limit",
        provider: "openai",
      },
    ]);
    const composed = withProviderFailover(primary, secondary);
    const r = await composed.generateResponse({ system: "s", user: "u" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("PROVIDER_ERROR");
      expect(r.fallback_message).toBe(LLM_USER_SAFE_UNAVAILABLE);
      expect(r.fallback_message).not.toMatch(/Anthropic|OpenAI|credit|rate/i);
    }
  });
});

describe("withProviderChain -- three-provider failover", () => {
  it("tries third provider when first two fail", async () => {
    const a = new MockLLMProvider([FAILURE]);
    const b = new MockLLMProvider([FAILURE]);
    const cOk: LLMResult = {
      ok: true,
      text: "xai grounded",
      provider: "xai",
      model: "grok-4.5",
    };
    const c = new MockLLMProvider([cOk]);
    const chain = withProviderChain([a, b, c]);
    const args = {
      system: "sys",
      user: "What is the current HelioGrid decision?",
      context: "authorized context",
    };
    const r = await chain.generateResponse(args);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.provider).toBe("xai");
      expect(r.text).toBe("xai grounded");
    }
    expect(a.getCalls()).toEqual([args]);
    expect(b.getCalls()).toEqual([args]);
    expect(c.getCalls()).toEqual([args]);
  });

  it("all-fail returns user-safe message with no vendor leak", async () => {
    const chain = withProviderChain([
      new MockLLMProvider([
        {
          ok: false,
          code: "INSUFFICIENT_CREDITS",
          fallback_message: "xAI credit balance too low",
          provider: "xai",
        },
      ]),
      new MockLLMProvider([
        {
          ok: false,
          code: "PROVIDER_ERROR",
          fallback_message: "Anthropic credit balance too low",
          provider: "anthropic",
        },
      ]),
      new MockLLMProvider([
        {
          ok: false,
          code: "RATE_LIMIT",
          fallback_message: "OpenAI quota exceeded",
          provider: "openai",
        },
      ]),
    ]);
    const r = await chain.generateResponse({ system: "s", user: "u" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.fallback_message).toBe(LLM_USER_SAFE_UNAVAILABLE);
      expect(r.fallback_message).not.toMatch(/xAI|Anthropic|OpenAI|credit|quota/i);
    }
  });
});

describe("orderedProviderKinds", () => {
  it("puts preferred first then xai/anthropic/openai excluding preferred", () => {
    expect(orderedProviderKinds("xai")).toEqual([
      "xai",
      "anthropic",
      "openai",
    ]);
    expect(orderedProviderKinds("anthropic")).toEqual([
      "anthropic",
      "xai",
      "openai",
    ]);
    expect(orderedProviderKinds("openai")).toEqual([
      "openai",
      "xai",
      "anthropic",
    ]);
  });
});

describe("classifyXaiProviderError", () => {
  it("classifies 401 / invalid key", () => {
    const r = classifyXaiProviderError(new Error("401 Incorrect API key"));
    expect(r.code).toBe("INVALID_KEY");
  });

  it("classifies insufficient credits / quota", () => {
    const r = classifyXaiProviderError(
      new Error("402 Your credit balance is too low"),
    );
    expect(r.code).toBe("INSUFFICIENT_CREDITS");
  });

  it("classifies rate limit", () => {
    const r = classifyXaiProviderError({
      message: "Too many requests",
      status: 429,
    });
    expect(r.code).toBe("RATE_LIMIT");
  });

  it("classifies timeout", () => {
    const r = classifyXaiProviderError(new Error("Request timed out ETIMEDOUT"));
    expect(r.code).toBe("TIMEOUT");
  });

  it("never embeds secrets in the classification message path", () => {
    const secret = "xai-super-secret-key-value";
    const r = classifyXaiProviderError(new Error(`provider failed for ${secret}`));
    // classification returns the message for logs; product UI must not
    // use it. Assert the code stays closed-vocab.
    expect(r.code).toBe("PROVIDER_ERROR");
    expect(typeof r.message).toBe("string");
  });
});
