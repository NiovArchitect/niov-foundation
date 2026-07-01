// FILE: slack-write-provider.test.ts (unit)
// PURPOSE: Work-OS Slice F — SlackWriteProvider contract. Verifies the
//          fixture-first gate (no real post without the SLACK_USE_REAL +
//          config.use_real + secret_ref triple), payload validation
//          (channel + text required), unfurl defaults (false), the full
//          error_class mapping via a mocked fetch, the missing_scope
//          surfacing, and the privacy invariant: the bot token NEVER
//          appears in any ConnectorResult (success metadata or error).
// CONNECTS TO:
//   - apps/api/src/services/connector/slack-write.provider.ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { SlackWriteProvider } from "../../apps/api/src/services/connector/slack-write.provider.js";
import type { ConnectorInvocation } from "../../apps/api/src/services/connector/connector.service.js";

const TOKEN = "xoxb-secret-token-value-should-never-surface";

function inv(overrides: Partial<ConnectorInvocation> = {}): ConnectorInvocation {
  return {
    binding_id: "00000000-0000-4000-8000-000000000001",
    type: "SLACK_WRITE",
    config: { default_channel: "C_TEST", use_real: true },
    secret_ref: "SLACK_TEST_BOT_TOKEN",
    payload: { operation: "chat.postMessage", channel: "C_TEST", text: "hello governed world" },
    ...overrides,
  };
}

// Assert a result never carries the token anywhere.
function assertNoToken(result: unknown): void {
  expect(JSON.stringify(result)).not.toContain(TOKEN);
  expect(JSON.stringify(result)).not.toContain("xoxb-");
}

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.SLACK_USE_REAL;
  delete process.env.SLACK_TEST_BOT_TOKEN;
});

describe("SlackWriteProvider — fixture-first gate + validation", () => {
  it("returns a deterministic fixture success when SLACK_USE_REAL is unset (no real post)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const r = await new SlackWriteProvider().invoke(inv());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.delivery_metadata["mode"]).toBe("fixture");
    // The real Slack API was never called.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects a missing channel with VALIDATION", async () => {
    const r = await new SlackWriteProvider().invoke(
      inv({ payload: { operation: "chat.postMessage", text: "no channel" } }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error_class).toBe("VALIDATION");
  });

  it("rejects a missing text with VALIDATION", async () => {
    const r = await new SlackWriteProvider().invoke(
      inv({ payload: { operation: "chat.postMessage", channel: "C_TEST" } }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error_class).toBe("VALIDATION");
  });

  it("rejects a non-chat.postMessage operation with VALIDATION", async () => {
    const r = await new SlackWriteProvider().invoke(
      inv({ payload: { operation: "chat.delete", channel: "C_TEST", text: "x" } }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error_class).toBe("VALIDATION");
  });

  it("maps all 8 fixture-failure keys to their error_class", async () => {
    const cases: Array<[string, string]> = [
      ["force-auth-failure", "AUTH"],
      ["force-network-failure", "NETWORK"],
      ["force-timeout", "TIMEOUT"],
      ["force-rate-limit", "RATE_LIMIT"],
      ["force-provider-error", "PROVIDER_ERROR"],
      ["force-validation-failure", "VALIDATION"],
      ["force-not-configured", "NOT_CONFIGURED"],
      ["force-disabled", "DISABLED"],
    ];
    for (const [key, cls] of cases) {
      const r = await new SlackWriteProvider().invoke(inv({ payload: { fixture_key: key } }));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error_class).toBe(cls);
    }
  });
});

describe("SlackWriteProvider — real path (mocked fetch) never leaks the token", () => {
  function enableReal(): void {
    process.env.SLACK_USE_REAL = "1";
    process.env.SLACK_TEST_BOT_TOKEN = TOKEN;
  }

  it("posts and returns a real receipt (channel + ts) with unfurl defaults false; token never surfaces", async () => {
    enableReal();
    const bodies: string[] = [];
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      bodies.push(String((init as RequestInit | undefined)?.body ?? ""));
      // First call = chat.postMessage; second = chat.getPermalink.
      const isPostMessage = String(_url).includes("chat.postMessage");
      const payload = isPostMessage
        ? { ok: true, channel: "C_TEST", ts: "1700000000.000100" }
        : { ok: true, permalink: "https://slack.example/archives/C_TEST/p1700000000000100" };
      return new Response(JSON.stringify(payload), { status: 200 });
    });
    const r = await new SlackWriteProvider().invoke(inv());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.delivery_metadata["mode"]).toBe("real");
      expect(r.delivery_metadata["ts"]).toBe("1700000000.000100");
      expect(r.delivery_metadata["channel"]).toBe("C_TEST");
      expect(r.delivery_metadata["permalink"]).toContain("slack.example");
    }
    // The Authorization header carried the token, but the RESULT never does.
    assertNoToken(r);
    // The request body carried unfurl_links=false + unfurl_media=false.
    expect(bodies[0]).toContain("\"unfurl_links\":false");
    expect(bodies[0]).toContain("\"unfurl_media\":false");
    fetchSpy.mockRestore();
  });

  it("maps a Slack ok:false invalid_auth to AUTH without leaking the token", async () => {
    enableReal();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: false, error: "invalid_auth" }), { status: 200 }),
    );
    const r = await new SlackWriteProvider().invoke(inv());
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error_class).toBe("AUTH");
      expect(r.message).toContain("invalid_auth");
    }
    assertNoToken(r);
  });

  it("surfaces the needed scope on missing_scope (operator triage)", async () => {
    enableReal();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: false, error: "missing_scope", needed: "chat:write" }), { status: 200 }),
    );
    const r = await new SlackWriteProvider().invoke(inv());
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error_class).toBe("AUTH");
      expect(r.message).toContain("missing_scope:chat:write");
    }
    assertNoToken(r);
  });

  it("maps channel_not_found to VALIDATION", async () => {
    enableReal();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: false, error: "channel_not_found" }), { status: 200 }),
    );
    const r = await new SlackWriteProvider().invoke(inv());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error_class).toBe("VALIDATION");
  });

  it("does not reach the real API when config.use_real is false", async () => {
    process.env.SLACK_USE_REAL = "1";
    process.env.SLACK_TEST_BOT_TOKEN = TOKEN;
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const r = await new SlackWriteProvider().invoke(inv({ config: { default_channel: "C_TEST", use_real: false } }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.delivery_metadata["mode"]).toBe("fixture");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
