// FILE: llm.service.ts
// PURPOSE: LLM provider abstraction with circuit-breaker fault
//          isolation. Section 11B's conductSession routes through
//          this layer; one CLOSED→OPEN→HALF_OPEN cycle prevents a
//          downstream Anthropic / OpenAI / xAI outage from cascading.
//
// CONCRETE provider classes (AnthropicProvider, OpenAIProvider,
// XAIProvider) are exported for production use. CI tests use
// MockLLMProvider only -- real API calls are deliberately excluded
// from CI to keep tests fast, deterministic, and free of API key
// requirements. To smoke-test real providers, run scripts/smoke-llm.ts
// manually with API keys set.
//
// CONNECTS TO: @anthropic-ai/sdk and openai (production calls;
//              XAIProvider reuses the OpenAI SDK against api.x.ai),
//              tests/unit/llm.test.ts (circuit-breaker + failover
//              matrix against MockLLMProvider).

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { CRYPTO_CONFIG } from "@niov/auth";

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
  generateResponse(
    args: { system: string; user: string; context?: string },
    opts?: { fixtureKey?: string },
  ): Promise<LLMResult>;
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
    async generateResponse(args, opts) {
      if (!breaker.shouldAttempt()) {
        return {
          ok: false,
          code: "PROVIDER_UNAVAILABLE",
          fallback_message:
            "LLM provider temporarily unavailable; please retry shortly.",
          provider: provider.name,
        };
      }
      const result = await provider.generateResponse(args, opts);
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
    // Model selection precedence (mirrors OpenAIProvider):
    //   1. explicit args.model
    //   2. ANTHROPIC_MODEL env var
    //   3. MODEL_ROUTER_DEFAULT_MODEL env var
    //   4. "claude-sonnet-4-6" hard-coded default
    this.model =
      args.model ??
      process.env.ANTHROPIC_MODEL ??
      process.env.MODEL_ROUTER_DEFAULT_MODEL ??
      "claude-sonnet-4-6";
  }

  async generateResponse(
    args: { system: string; user: string; context?: string },
    _opts?: { fixtureKey?: string },
  ): Promise<LLMResult> {
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
    // Model selection precedence:
    //   1. explicit args.model (used by tests / explicit DI)
    //   2. OPENAI_MODEL env var (operator override for a specific deploy)
    //   3. MODEL_ROUTER_DEFAULT_MODEL env var (Founder-facing alias documented
    //      in .env.example for symmetry with multi-provider env naming)
    //   4. "gpt-4o" hard-coded default (the production-safe fallback)
    this.model =
      args.model ??
      process.env.OPENAI_MODEL ??
      process.env.MODEL_ROUTER_DEFAULT_MODEL ??
      "gpt-4o";
  }

  async generateResponse(
    args: { system: string; user: string; context?: string },
    _opts?: { fixtureKey?: string },
  ): Promise<LLMResult> {
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

// WHAT: Official xAI Grok API provider. OpenAI-compatible Chat
//        Completions against https://api.x.ai/v1. NEVER uses consumer
//        OAuth, ~/.grok/auth.json, or grok.com browser sessions.
// INPUT: XAI_API_KEY + optional model / base URL / timeout / retries.
// OUTPUT: An LLMProvider that calls the xAI API.
// WHY: Production multi-user Talk requires an API key path. Same
//      system/user/context contract as Anthropic and OpenAI so COE
//      grounding and governance stay unchanged.
export class XAIProvider implements LLMProvider {
  readonly name = "xai";
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(
    args: {
      apiKey?: string;
      model?: string;
      baseURL?: string;
      timeoutMs?: number;
      maxRetries?: number;
    } = {},
  ) {
    const apiKey = args.apiKey ?? process.env.XAI_API_KEY;
    if (typeof apiKey !== "string" || apiKey.length === 0) {
      throw new Error("XAIProvider: XAI_API_KEY env var is required");
    }
    const baseURL =
      args.baseURL ??
      process.env.XAI_BASE_URL ??
      "https://api.x.ai/v1";
    const timeoutRaw =
      args.timeoutMs ?? Number(process.env.XAI_TIMEOUT_MS ?? "60000");
    const retriesRaw =
      args.maxRetries ?? Number(process.env.XAI_MAX_RETRIES ?? "1");
    this.client = new OpenAI({
      apiKey,
      baseURL,
      timeout: Number.isFinite(timeoutRaw) ? timeoutRaw : 60_000,
      maxRetries: Number.isFinite(retriesRaw) ? retriesRaw : 1,
    });
    // Model selection precedence:
    //   1. explicit args.model
    //   2. XAI_MODEL env var
    //   3. MODEL_ROUTER_DEFAULT_MODEL env var
    //   4. "grok-4.5" hard-coded default (official docs candidate;
    //      override via env after live model discovery)
    this.model =
      args.model ??
      process.env.XAI_MODEL ??
      process.env.MODEL_ROUTER_DEFAULT_MODEL ??
      "grok-4.5";
  }

  async generateResponse(
    args: { system: string; user: string; context?: string },
    _opts?: { fixtureKey?: string },
  ): Promise<LLMResult> {
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
      const classified = classifyXaiProviderError(err);
      return {
        ok: false,
        code: classified.code,
        // Internal detail only — otzar.service + withProviderChain
        // never surface this string to employees.
        fallback_message: `xAI provider failed: ${classified.message}`,
        provider: this.name,
      };
    }
  }
}

// WHAT: Map xAI/OpenAI-SDK errors to closed-vocab failure codes.
// INPUT: Unknown thrown value from the SDK / network.
// OUTPUT: { code, message } for audit-safe logging + breaker.
// WHY: Failover must distinguish billing/rate-limit from auth denials
//      without leaking raw vendor bodies to product UI.
export function classifyXaiProviderError(err: unknown): {
  code: string;
  message: string;
} {
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();
  // Prefer structured status when present (OpenAI SDK APIError).
  const status =
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    typeof (err as { status?: unknown }).status === "number"
      ? (err as { status: number }).status
      : null;
  if (status === 401 || /invalid.?api.?key|incorrect.?api.?key|unauthorized/.test(lower)) {
    return { code: "INVALID_KEY", message };
  }
  if (
    status === 402 ||
    /insufficient.?credit|credit.?balance|billing|payment.?required|quota/.test(
      lower,
    )
  ) {
    return { code: "INSUFFICIENT_CREDITS", message };
  }
  if (status === 403 || /forbidden|permission|not.?allowed/.test(lower)) {
    return { code: "FORBIDDEN", message };
  }
  if (status === 404 || /model.?not.?found|does not exist|unknown model/.test(lower)) {
    return { code: "MODEL_UNAVAILABLE", message };
  }
  if (status === 429 || /rate.?limit|too many requests/.test(lower)) {
    return { code: "RATE_LIMIT", message };
  }
  if (
    (status !== null && status >= 500) ||
    /internal server error|bad gateway|service unavailable|502|503|504/.test(
      lower,
    )
  ) {
    return { code: "PROVIDER_5XX", message };
  }
  if (/timeout|etimedout|aborted|deadline/.test(lower)) {
    return { code: "TIMEOUT", message };
  }
  if (/context.?length|too large|maximum context|token limit/.test(lower)) {
    return { code: "CONTEXT_TOO_LARGE", message };
  }
  return { code: "PROVIDER_ERROR", message };
}

// WHAT: User-safe failure copy. NEVER surface vendor names, credit
//        balances, model ids, or raw SDK bodies to employees.
// INPUT: None.
// OUTPUT: A stable string safe for Talk / voice UI.
// WHY: Provider outages must be honest without becoming technical theater.
export const LLM_USER_SAFE_UNAVAILABLE =
  "Otzar could not finish that answer right now. Please try again in a moment.";

// WHAT: Canonical provider kind identifiers for factory routing.
export type LLMProviderKind = "anthropic" | "openai" | "xai";

// WHAT: Compose an ordered chain of providers. Tries each in order
//        with identical system/user/context args until one succeeds.
// INPUT: Non-empty array of LLMProviders (already circuit-breaker
//        wrapped when built by getLLMProvider).
// OUTPUT: A single LLMProvider facade.
// WHY: Talk must tolerate primary outages when any approved fallback
//      is configured. Governance/grounding stay caller-side.
export function withProviderChain(providers: LLMProvider[]): LLMProvider {
  if (providers.length === 0) {
    throw new Error("withProviderChain: at least one provider is required");
  }
  if (providers.length === 1) {
    return providers[0]!;
  }
  return {
    name: providers.map((p) => p.name).join("+"),
    async generateResponse(args, opts) {
      let lastProvider = providers[0]!.name;
      for (const provider of providers) {
        lastProvider = provider.name;
        const result = await provider.generateResponse(args, opts);
        if (result.ok) {
          return {
            ok: true,
            text: result.text,
            provider: result.provider,
            model: result.model,
          };
        }
      }
      return {
        ok: false,
        code: "PROVIDER_ERROR",
        fallback_message: LLM_USER_SAFE_UNAVAILABLE,
        provider: lastProvider,
      };
    },
  };
}

// WHAT: Compose primary + secondary providers (2-way failover).
// INPUT: primary and secondary LLMProviders.
// OUTPUT: An LLMProvider that tries primary then secondary.
// WHY: Back-compat wrapper over withProviderChain for existing tests
//      and call sites that pass exactly two providers.
export function withProviderFailover(
  primary: LLMProvider,
  secondary: LLMProvider,
): LLMProvider {
  return withProviderChain([primary, secondary]);
}

// WHAT: Whether xAI is allowed in the production provider chain.
// INPUT: Reads XAI_ENABLED env (default true when unset).
// OUTPUT: boolean.
// WHY: Deploy the adapter safely with XAI_ENABLED=false until key
//      + billing are ready; key absence alone also skips xAI.
export function isXaiEnabled(): boolean {
  const flag = (process.env.XAI_ENABLED ?? "true").toLowerCase();
  return flag !== "false" && flag !== "0" && flag !== "no" && flag !== "off";
}

function tryBuildProvider(kind: LLMProviderKind): LLMProvider | null {
  try {
    if (kind === "xai") {
      if (!isXaiEnabled()) return null;
      if (!process.env.XAI_API_KEY) return null;
      return withCircuitBreaker(new XAIProvider());
    }
    if (kind === "openai") {
      if (!process.env.OPENAI_API_KEY) return null;
      return withCircuitBreaker(new OpenAIProvider());
    }
    if (!process.env.ANTHROPIC_API_KEY) return null;
    return withCircuitBreaker(new AnthropicProvider());
  } catch {
    return null;
  }
}

// WHAT: Resolve preferred primary provider kind from env.
// INPUT: process.env LLM_PROVIDER / PREFERRED_LLM / XAI key presence.
// OUTPUT: LLMProviderKind.
// WHY: Explicit LLM_PROVIDER wins. When unset and xAI is configured,
//      prefer xAI so recovery does not depend on unfunded Anthropic
//      / OpenAI. Otherwise default anthropic (historical default).
export function resolvePreferredProviderKind(): LLMProviderKind {
  const raw = (
    process.env.LLM_PROVIDER ?? process.env.PREFERRED_LLM ?? ""
  ).toLowerCase();
  if (raw === "openai" || raw === "anthropic" || raw === "xai") {
    return raw;
  }
  if (raw.length > 0) {
    throw new Error(
      `getLLMProvider: unknown LLM_PROVIDER "${raw}" (expected "anthropic", "openai", or "xai")`,
    );
  }
  if (isXaiEnabled() && typeof process.env.XAI_API_KEY === "string" && process.env.XAI_API_KEY.length > 0) {
    return "xai";
  }
  return "anthropic";
}

// WHAT: Stable fallback order with preferred kind first.
// INPUT: preferred primary kind.
// OUTPUT: Ordered kinds: preferred, then xai → anthropic → openai
//         excluding the preferred entry.
// WHY: xAI listed first among secondaries so recovery prefers a funded
//      Grok key when Anthropic/OpenAI are exhausted.
export function orderedProviderKinds(
  preferred: LLMProviderKind,
): LLMProviderKind[] {
  const base: LLMProviderKind[] = ["xai", "anthropic", "openai"];
  return [preferred, ...base.filter((k) => k !== preferred)];
}

// WHAT: Pick the production LLM provider per env config.
// INPUT: None (reads LLM_PROVIDER / PREFERRED_LLM / provider keys /
//        XAI_ENABLED).
// OUTPUT: A circuit-breaker-wrapped LLMProvider, with cross-provider
//         failover chain when multiple keys are present.
// WHY: Single factory used by buildApp's production path. Tests
//      construct providers + breakers directly with injected clocks.
//
//      Env precedence for PRIMARY:
//        1. LLM_PROVIDER (Founder-facing canonical name; preferred)
//        2. PREFERRED_LLM (legacy; preserved for back-compat)
//        3. "xai" when XAI_API_KEY present and XAI_ENABLED
//        4. "anthropic" hard-coded default
//
//      When additional providers have keys, returns withProviderChain
//      in preferred-first order. Callers see one LLMProvider; Talk /
//      voice / extract paths do not change.
export function getLLMProvider(): LLMProvider {
  const preferred = resolvePreferredProviderKind();
  const kinds = orderedProviderKinds(preferred);
  const built: LLMProvider[] = [];
  for (const kind of kinds) {
    const provider = tryBuildProvider(kind);
    if (provider !== null) built.push(provider);
  }
  if (built.length === 0) {
    throw new Error(
      `getLLMProvider: no LLM API keys configured (need XAI_API_KEY and/or ANTHROPIC_API_KEY and/or OPENAI_API_KEY)`,
    );
  }
  return withProviderChain(built);
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
  private readonly calls: Array<{
    system: string;
    user: string;
    context?: string;
  }> = [];

  constructor(private readonly responses: LLMResult[]) {}

  async generateResponse(
    args: { system: string; user: string; context?: string },
    _opts?: { fixtureKey?: string },
  ): Promise<LLMResult> {
    this.calls.push(args);
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

  // WHAT: Test-only helper. Returns the array of args every prior
  //        generateResponse call received, in order.
  // INPUT: None.
  // OUTPUT: An array of { system, user, context? }.
  // WHY: Production code MUST NOT depend on this method's existence;
  //      the recorded calls array is an implementation detail
  //      surfaced solely for assertion-style tests like the
  //      CORRECTION-before-role-template ordering test in 11C.
  getCalls(): ReadonlyArray<{
    system: string;
    user: string;
    context?: string;
  }> {
    return this.calls;
  }
}

// WHAT: The on-disk shape of one recorded fixture file (per ADR-0014).
// INPUT: Used as a parameter type only.
// OUTPUT: None -- this is a type, not a value.
// WHY: FixtureBasedLLMProvider parses fixture JSON files into this
//      shape and verifies the parsed object matches before use.
//      Mirrors the JSON shape produced by scripts/record-llm-fixtures.ts.
export interface FixtureFile {
  fixtureKey: string;
  fullHash: string;
  input: { system: string; user: string; context: string | null };
  response: LLMResult;
  metadata: {
    recordedAt: string;
    recordingTemperature: number;
    sourceFile: string;
    promptId: string;
  };
}

// WHAT: Compute the canonical sha256 hex of an LLM input triple.
// INPUT: { system, user, context? } -- the same shape generateResponse
//        receives.
// OUTPUT: A 64-char lowercase hex string.
// WHY: Both FixtureBasedLLMProvider (sanity-check on load) and
//      scripts/record-llm-fixtures.ts (recording-time fullHash field)
//      hash inputs the same way; centralizing the function ensures
//      both sides agree on the canonical form.
export function computeLLMInputHash(args: {
  system: string;
  user: string;
  context?: string;
}): string {
  const joined = `${args.system}\n---\n${args.user}\n---\n${args.context ?? ""}`;
  return createHash(CRYPTO_CONFIG.HASH_ALGORITHM).update(joined).digest("hex");
}

// WHAT: Test-mode LLMProvider that dispatches by operator-chosen
//        fixture key (per ADR-0014). Loads recorded JSON fixtures from
//        tests/fixtures/llm/ and replays the response Claude returned
//        when the fixture was recorded.
// INPUT: Optional fixturesDir (defaults to <cwd>/tests/fixtures/llm).
// OUTPUT: An LLMProvider whose generateResponse requires
//          opts.fixtureKey and replays the corresponding fixture.
// WHY: ADR-0014 supersedes ADR-0012's hash-by-content dispatch.
//      Tests pass opts.fixtureKey to identify the recorded scenario;
//      the hash is preserved as a sanity check (mismatch logs a
//      warning but does not fail) so that prompt drift is surveilled
//      without breaking unrelated assertions. Strict missing-fixture
//      failure: if opts.fixtureKey is absent OR points at a missing
//      file, the provider throws -- silent fallback is forbidden.
export class FixtureBasedLLMProvider implements LLMProvider {
  readonly name = "fixture-based";
  private readonly fixturesDir: string;
  private readonly cache = new Map<string, FixtureFile>();

  constructor(fixturesDir?: string) {
    this.fixturesDir =
      fixturesDir ?? resolve(process.cwd(), "tests/fixtures/llm");
  }

  async generateResponse(
    args: { system: string; user: string; context?: string },
    opts?: { fixtureKey?: string },
  ): Promise<LLMResult> {
    const fixtureKey = opts?.fixtureKey;
    if (typeof fixtureKey !== "string" || fixtureKey.length === 0) {
      throw new Error(
        "FixtureBasedLLMProvider.generateResponse requires opts.fixtureKey " +
          "(per ADR-0014). Pass { fixtureKey: \"<key>\" } as the second " +
          "argument; do not invoke this provider without one.",
      );
    }
    const fixture = this.loadFixture(fixtureKey);
    this.verifyHashSanity(args, fixture, fixtureKey);
    return fixture.response;
  }

  private loadFixture(fixtureKey: string): FixtureFile {
    const cached = this.cache.get(fixtureKey);
    if (cached !== undefined) return cached;
    const filePath = resolve(this.fixturesDir, `${fixtureKey}.json`);
    if (!existsSync(filePath)) {
      throw new Error(
        `FixtureBasedLLMProvider: missing fixture for key ` +
          `"${fixtureKey}". Resolved path: ${filePath}. ` +
          `Run: npx tsx scripts/record-llm-fixtures.ts to record this ` +
          `fixture (per ADR-0014). Silent fallback is forbidden.`,
      );
    }
    const raw = readFileSync(filePath, "utf-8");
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(
        `FixtureBasedLLMProvider: fixture file ${filePath} is not valid ` +
          `JSON: ${message}`,
      );
    }
    const fixture = parsed as FixtureFile;
    if (
      typeof fixture.fixtureKey !== "string" ||
      typeof fixture.fullHash !== "string" ||
      fixture.input === undefined ||
      fixture.response === undefined
    ) {
      throw new Error(
        `FixtureBasedLLMProvider: fixture file ${filePath} is malformed ` +
          `(missing fixtureKey, fullHash, input, or response). ` +
          `Re-record via scripts/record-llm-fixtures.ts.`,
      );
    }
    if (fixture.fixtureKey !== fixtureKey) {
      throw new Error(
        `FixtureBasedLLMProvider: fixture file ${filePath} has fixtureKey ` +
          `"${fixture.fixtureKey}" but was loaded under key "${fixtureKey}". ` +
          `Filename and fixtureKey must match.`,
      );
    }
    this.cache.set(fixtureKey, fixture);
    return fixture;
  }

  // WHAT: Compute the live-input hash and compare against the recorded
  //        fixture's fullHash. Warn on mismatch; never throw.
  // INPUT: The live args, the loaded fixture, the fixtureKey.
  // OUTPUT: None.
  // WHY: Per ADR-0014, hash is a sanity check, not a dispatch
  //      mechanism. Mismatch indicates either fixture corruption
  //      (rare) or test-prompt drift (expected for tests with
  //      randomized inputs). The test asserts on the recorded
  //      response, not the input hash, so execution continues. A
  //      future Gate 7 may promote warnings to errors via
  //      HASH_DRIFT_FATAL=true.
  private verifyHashSanity(
    args: { system: string; user: string; context?: string },
    fixture: FixtureFile,
    fixtureKey: string,
  ): void {
    const liveHash = computeLLMInputHash(args);
    if (liveHash === fixture.fullHash) return;
    const liveShort = liveHash.slice(0, 16);
    const recordedShort = fixture.fullHash.slice(0, 16);
    const systemSnippet = args.system.slice(0, 200);
    const userSnippet = args.user.slice(0, 200);
    process.stderr.write(
      `[FixtureBasedLLMProvider] hash drift on fixtureKey=${fixtureKey}: ` +
        `live=${liveShort}... recorded=${recordedShort}... ` +
        `(this is benign per ADR-0014 if test inputs are non-deterministic; ` +
        `re-record fixture if the prompt shape changed intentionally). ` +
        `system[0:200]=${JSON.stringify(systemSnippet)} ` +
        `user[0:200]=${JSON.stringify(userSnippet)}\n`,
    );
  }
}
