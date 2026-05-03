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
  MockLLMProvider,
  withCircuitBreaker,
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
