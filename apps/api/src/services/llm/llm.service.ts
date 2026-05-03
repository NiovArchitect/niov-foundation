// FILE: llm.service.ts
// PURPOSE: LLM provider abstraction with circuit-breaker fault
//          isolation. Section 11B's conductSession routes through
//          this layer; one CLOSED→OPEN→HALF_OPEN cycle prevents a
//          downstream Anthropic / OpenAI outage from cascading.
//
// CONCRETE provider classes (AnthropicProvider, OpenAIProvider) are
// exported for production use. CI tests use MockLLMProvider only --
// real API calls are deliberately excluded from CI to keep tests
// fast, deterministic, and free of API key requirements. To smoke-
// test real providers, run scripts/smoke-llm.ts manually with API
// keys set.
//
// CONNECTS TO: @anthropic-ai/sdk and openai (production calls),
//              tests/unit/llm.test.ts (circuit-breaker matrix
//              against MockLLMProvider).

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

// WHAT: The unified result shape every LLMProvider must return.
// INPUT: Used as a return type only.
// OUTPUT: None.
// WHY: Discriminated union (ok: true | false) so callers map both
//      paths without a try/catch. The circuit-breaker fallback path
//      uses the ok=false shape so consumers handle it identically.
export type LLMResult =
  | { ok: true; text: string; provider: string; model: string }
  | { ok: false; code: string; fallback_message: string; provider: string };

// WHAT: The provider contract.
// INPUT: Used as a parameter type only.
// OUTPUT: None.
// WHY: One method, one shape. Production providers wrap their
//      respective SDK; tests inject MockLLMProvider that returns
//      scripted responses.
export interface LLMProvider {
  readonly name: string;
  generateResponse(args: {
    system: string;
    user: string;
    context?: string;
  }): Promise<LLMResult>;
}

// WHAT: How long the circuit stays OPEN before allowing a HALF_OPEN
//        probe.
const CIRCUIT_OPEN_DURATION_MS = 5 * 60 * 1000;

// WHAT: Failure-count window. Three failures within this window
//        opens the circuit.
const CIRCUIT_FAILURE_WINDOW_MS = 5 * 60 * 1000;

// WHAT: Number of failures within the window required to open.
const CIRCUIT_FAILURE_THRESHOLD = 3;

// WHAT: Circuit-breaker states. CLOSED = normal pass-through.
//        OPEN = all calls return fallback. HALF_OPEN = one probe
//        allowed; success → CLOSED, failure → OPEN.
export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

// WHAT: A circuit breaker around one provider.
// INPUT: Optional clock injection for test determinism.
// OUTPUT: Methods to record success / failure and check whether a
//         call should be attempted.
// WHY: Encapsulates the state machine so tests can inject a clock
//      and march through state transitions in microseconds rather
//      than waiting 5 real minutes per test.
export class CircuitBreaker {
  private state: CircuitState = "CLOSED";
  private failureTimestamps: number[] = [];
  private openedAt = 0;
  private readonly clock: () => number;

  constructor(clock: () => number = () => Date.now()) {
    this.clock = clock;
  }

  // WHAT: Decide whether the next call may proceed.
  // INPUT: None.
  // OUTPUT: true if call should be attempted, false if circuit is OPEN.
  // WHY: When OPEN we check whether the open duration has elapsed;
  //      if it has, we transition to HALF_OPEN and allow one probe.
  shouldAttempt(): boolean {
    const now = this.clock();
    if (this.state === "OPEN") {
      if (now - this.openedAt >= CIRCUIT_OPEN_DURATION_MS) {
        this.state = "HALF_OPEN";
        return true;
      }
      return false;
    }
    return true;
  }

  // WHAT: Mark a successful call. CLOSES the circuit if HALF_OPEN.
  // INPUT: None.
  // OUTPUT: None.
  // WHY: A successful HALF_OPEN probe means the downstream is back;
  //      reset failure timestamps so the window starts fresh.
  recordSuccess(): void {
    if (this.state === "HALF_OPEN" || this.state === "CLOSED") {
      this.state = "CLOSED";
      this.failureTimestamps = [];
    }
  }

  // WHAT: Mark a failed call. Opens the circuit if threshold tripped
  //        OR re-opens if HALF_OPEN.
  // INPUT: None.
  // OUTPUT: None.
  // WHY: HALF_OPEN failure = downstream still broken, slam shut for
  //      another full duration. CLOSED failure = append timestamp,
  //      check if 3+ failures fall within the rolling window.
  recordFailure(): void {
    const now = this.clock();
    if (this.state === "HALF_OPEN") {
      this.state = "OPEN";
      this.openedAt = now;
      return;
    }
    this.failureTimestamps.push(now);
    // Drop entries outside the window.
    this.failureTimestamps = this.failureTimestamps.filter(
      (ts) => now - ts <= CIRCUIT_FAILURE_WINDOW_MS,
    );
    if (this.failureTimestamps.length >= CIRCUIT_FAILURE_THRESHOLD) {
      this.state = "OPEN";
      this.openedAt = now;
    }
  }

  // WHAT: Read-only snapshot of the current state.
  // INPUT: None.
  // OUTPUT: The current CircuitState.
  // WHY: Tests assert state transitions; production code may log it.
  getState(): CircuitState {
    return this.state;
  }
}

// WHAT: Wrap any LLMProvider with circuit-breaker semantics.
// INPUT: The provider + an optional clock.
// OUTPUT: A new LLMProvider whose generateResponse honors the
//         breaker; while OPEN it returns a structured fallback
//         without invoking the wrapped provider.
// WHY: Composition pattern keeps the breaker logic out of every
//      provider class.
export function withCircuitBreaker(
  provider: LLMProvider,
  clock: () => number = () => Date.now(),
): LLMProvider & { breaker: CircuitBreaker } {
  const breaker = new CircuitBreaker(clock);
  const wrapped: LLMProvider & { breaker: CircuitBreaker } = {
    name: provider.name,
    breaker,
    async generateResponse(args) {
      if (!breaker.shouldAttempt()) {
        return {
          ok: false,
          code: "PROVIDER_UNAVAILABLE",
          fallback_message:
            "LLM provider temporarily unavailable; please retry shortly.",
          provider: provider.name,
        };
      }
      const result = await provider.generateResponse(args);
      if (result.ok) {
        breaker.recordSuccess();
      } else {
        breaker.recordFailure();
      }
      return result;
    },
  };
  return wrapped;
}

// WHAT: AnthropicProvider concrete class. claude-sonnet-4-6 default.
// INPUT: API key + optional model override.
// OUTPUT: An LLMProvider that calls the Anthropic Messages API.
// WHY: Production class; CI never instantiates this (no API key in
//      CI environment).
export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(args: { apiKey?: string; model?: string } = {}) {
    const apiKey = args.apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (typeof apiKey !== "string" || apiKey.length === 0) {
      throw new Error(
        "AnthropicProvider: ANTHROPIC_API_KEY env var is required",
      );
    }
    this.client = new Anthropic({ apiKey });
    this.model = args.model ?? "claude-sonnet-4-6";
  }

  async generateResponse(args: {
    system: string;
    user: string;
    context?: string;
  }): Promise<LLMResult> {
    try {
      const userContent =
        args.context !== undefined && args.context.length > 0
          ? `${args.context}\n\n---\n\n${args.user}`
          : args.user;
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 4096,
        system: args.system,
        messages: [{ role: "user", content: userContent }],
      });
      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("");
      return { ok: true, text, provider: this.name, model: this.model };
    } catch (err) {
      // Anthropic SDK throws APIError with .status. Treat 429 + 5xx
      // as failures; 4xx other than 429 (e.g. 400 model not found)
      // is OUR bug -- still return ok:false but the wrapped breaker
      // will count this as a failure either way (wrapper doesn't
      // distinguish; in practice 4xx-other-than-429 from our code
      // is rare enough that the simpler treatment is fine for now).
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        code: "PROVIDER_ERROR",
        fallback_message: `Anthropic provider failed: ${message}`,
        provider: this.name,
      };
    }
  }
}

// WHAT: OpenAIProvider concrete class. gpt-4o default.
// INPUT: API key + optional model override.
// OUTPUT: An LLMProvider that calls the OpenAI Chat Completions API.
// WHY: Production class; CI never instantiates this.
export class OpenAIProvider implements LLMProvider {
  readonly name = "openai";
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(args: { apiKey?: string; model?: string } = {}) {
    const apiKey = args.apiKey ?? process.env.OPENAI_API_KEY;
    if (typeof apiKey !== "string" || apiKey.length === 0) {
      throw new Error(
        "OpenAIProvider: OPENAI_API_KEY env var is required",
      );
    }
    this.client = new OpenAI({ apiKey });
    this.model = args.model ?? "gpt-4o";
  }

  async generateResponse(args: {
    system: string;
    user: string;
    context?: string;
  }): Promise<LLMResult> {
    try {
      const userContent =
        args.context !== undefined && args.context.length > 0
          ? `${args.context}\n\n---\n\n${args.user}`
          : args.user;
      const response = await this.client.chat.completions.create({
        model: this.model,
        max_tokens: 4096,
        messages: [
          { role: "system", content: args.system },
          { role: "user", content: userContent },
        ],
      });
      const text = response.choices[0]?.message.content ?? "";
      return { ok: true, text, provider: this.name, model: this.model };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        code: "PROVIDER_ERROR",
        fallback_message: `OpenAI provider failed: ${message}`,
        provider: this.name,
      };
    }
  }
}

// WHAT: Pick the production LLM provider per env config.
// INPUT: None (reads PREFERRED_LLM env, defaults to "anthropic").
// OUTPUT: A circuit-breaker-wrapped LLMProvider.
// WHY: Single factory used by buildApp's production path. Tests
//      construct providers + breakers directly with injected clocks.
export function getLLMProvider(): LLMProvider {
  const preferred = (process.env.PREFERRED_LLM ?? "anthropic").toLowerCase();
  if (preferred === "openai") {
    return withCircuitBreaker(new OpenAIProvider());
  }
  if (preferred === "anthropic") {
    return withCircuitBreaker(new AnthropicProvider());
  }
  throw new Error(
    `getLLMProvider: unknown PREFERRED_LLM "${preferred}" (expected "anthropic" or "openai")`,
  );
}

// WHAT: Test fixture -- a fully-scripted LLMProvider whose responses
//        come from a queue.
// INPUT: An array of pre-built LLMResults to dispense in order.
// OUTPUT: A LLMProvider.
// WHY: CI uses this to script the success / failure sequences that
//      drive circuit-breaker tests. When the queue is exhausted the
//      provider returns the last entry repeatedly so tests don't
//      have to size the queue exactly.
export class MockLLMProvider implements LLMProvider {
  readonly name = "mock";
  private cursor = 0;

  constructor(private readonly responses: LLMResult[]) {}

  async generateResponse(): Promise<LLMResult> {
    if (this.responses.length === 0) {
      return {
        ok: false,
        code: "MOCK_EMPTY",
        fallback_message: "MockLLMProvider has no scripted responses",
        provider: this.name,
      };
    }
    const idx = Math.min(this.cursor, this.responses.length - 1);
    this.cursor++;
    return this.responses[idx]!;
  }
}
