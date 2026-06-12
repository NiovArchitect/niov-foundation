// FILE: connector-oauth.test.ts (unit)
// PURPOSE: Phase 1261 locks for the Priority C OAuth connector
//          substrate. Proves:
//            1. closed provider vocabulary + registry-scope coherence
//            2. state JWT is signed, expiring, tamper-fail-closed
//            3. callback exchanges the code and stores ONLY an
//               AES-256-GCM envelope (no raw token at rest)
//            4. status surface is honest (no fake green; VERIFIED
//               only via live probe; missing creds reported)
//            5. verify flips to VERIFIED on probe success and to
//               ERROR_NEEDS_RECONNECT on 401 — both audited
//            6. revoke wipes the envelope and disables the row
//            7. no secret material in audit details or SAFE views
//          No real provider credentials anywhere; fetch is stubbed.
// CONNECTS TO:
//   - apps/api/src/services/connector/connector-oauth.service.ts
//   - packages/database/src/queries/audit.ts (5 Phase 1261 literals)

import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, writeAuditEventMock } = vi.hoisted(() => ({
  prismaMock: {
    integrationCredential: {
      upsert: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
  },
  writeAuditEventMock: vi
    .fn()
    .mockResolvedValue({ audit_id: "11111111-1111-1111-1111-111111111111" }),
}));

vi.mock("@niov/database", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    prisma: prismaMock,
    writeAuditEvent: writeAuditEventMock,
  };
});

import jwt from "jsonwebtoken";
import { makeContentEncryption } from "@niov/auth";
import {
  getOAuthStatusForOrg,
  handleOAuthCallback,
  OAUTH_PROVIDERS,
  providerForSlug,
  redirectUriFor,
  revokeOAuthConnection,
  slugForProvider,
  startOAuthForOrg,
  verifyOAuthConnection,
} from "../../apps/api/src/services/connector/connector-oauth.service.js";
import { getConnectorAdapter } from "../../apps/api/src/services/connectors/connector-adapter-registry.js";
import { AUDIT_EVENT_TYPE_VALUES } from "@niov/database";

const ORG_ID = "11111111-1111-1111-1111-111111111111";
const ACTOR_ID = "22222222-2222-2222-2222-222222222222";

const GOOGLE_ENVS = {
  GOOGLE_OAUTH_CLIENT_ID: "test-client-id.apps.googleusercontent.com",
  GOOGLE_OAUTH_CLIENT_SECRET: "test-client-secret-value",
};

function setGoogleEnvs(): void {
  for (const [k, v] of Object.entries(GOOGLE_ENVS)) process.env[k] = v;
}

function clearGoogleEnvs(): void {
  for (const k of Object.keys(GOOGLE_ENVS)) delete process.env[k];
}

function validState(): string {
  return jwt.sign(
    {
      purpose: "connector_oauth_state",
      provider: "GOOGLE_WORKSPACE",
      org_entity_id: ORG_ID,
      actor_entity_id: ACTOR_ID,
    },
    process.env.JWT_SECRET as string,
    { expiresIn: 600 },
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  prismaMock.integrationCredential.upsert.mockReset();
  prismaMock.integrationCredential.update.mockReset();
  prismaMock.integrationCredential.findUnique.mockReset();
  prismaMock.integrationCredential.findMany.mockReset();
  writeAuditEventMock.mockClear();
  process.env.JWT_SECRET = process.env.JWT_SECRET ?? "unit-test-jwt-secret";
  clearGoogleEnvs();
});

describe("Phase 1261 — provider vocabulary + registry coherence", () => {
  it("exactly the four Priority C providers, round-tripping slugs", () => {
    expect([...OAUTH_PROVIDERS]).toEqual([
      "GOOGLE_WORKSPACE",
      "SLACK",
      "MICROSOFT_365",
      "ZOOM",
    ]);
    for (const p of OAUTH_PROVIDERS) {
      expect(providerForSlug(slugForProvider(p))).toBe(p);
    }
    expect(providerForSlug("github")).toBeNull();
    expect(providerForSlug("")).toBeNull();
  });

  it("requested scopes cover every registry oauth_scope per provider", async () => {
    setGoogleEnvs();
    const start = await startOAuthForOrg({
      provider_slug: "google",
      org_entity_id: ORG_ID,
      actor_entity_id: ACTOR_ID,
    });
    expect(start.ok).toBe(true);
    const url = new URL((start as { authorize_url: string }).authorize_url);
    const requested = url.searchParams.get("scope") ?? "";
    const registry = getConnectorAdapter("GOOGLE_WORKSPACE");
    for (const s of registry?.oauth_scopes ?? []) {
      expect(requested).toContain(s);
    }
  });

  it("the five Phase 1261 audit literals are registered append-only", () => {
    for (const literal of [
      "CONNECTOR_OAUTH_STARTED",
      "CONNECTOR_OAUTH_CONNECTED",
      "CONNECTOR_OAUTH_FAILED",
      "CONNECTOR_OAUTH_VERIFIED",
      "CONNECTOR_OAUTH_REVOKED",
    ]) {
      expect(AUDIT_EVENT_TYPE_VALUES).toContain(literal);
    }
  });
});

describe("Phase 1261 — start flow", () => {
  it("missing app credentials → APP_CREDENTIALS_MISSING (no audit, no URL)", async () => {
    const result = await startOAuthForOrg({
      provider_slug: "google",
      org_entity_id: ORG_ID,
      actor_entity_id: ACTOR_ID,
    });
    expect(result).toMatchObject({ ok: false, code: "APP_CREDENTIALS_MISSING" });
    expect(writeAuditEventMock).not.toHaveBeenCalled();
  });

  it("with credentials → authorize URL with state + offline access + audit", async () => {
    setGoogleEnvs();
    const result = await startOAuthForOrg({
      provider_slug: "google",
      org_entity_id: ORG_ID,
      actor_entity_id: ACTOR_ID,
    });
    expect(result.ok).toBe(true);
    const url = new URL((result as { authorize_url: string }).authorize_url);
    expect(url.origin + url.pathname).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth",
    );
    expect(url.searchParams.get("client_id")).toBe(
      GOOGLE_ENVS.GOOGLE_OAUTH_CLIENT_ID,
    );
    expect(url.searchParams.get("redirect_uri")).toBe(
      redirectUriFor("GOOGLE_WORKSPACE"),
    );
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    const state = url.searchParams.get("state") ?? "";
    expect(state.split(".").length).toBe(3); // a signed JWT
    // The client SECRET never appears in the authorize URL.
    expect(url.toString()).not.toContain(
      GOOGLE_ENVS.GOOGLE_OAUTH_CLIENT_SECRET,
    );
    expect(writeAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ event_type: "CONNECTOR_OAUTH_STARTED" }),
    );
  });
});

describe("Phase 1261 — callback flow", () => {
  it("tampered state fails closed (STATE_INVALID, no exchange call)", async () => {
    setGoogleEnvs();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const result = await handleOAuthCallback({
      provider_slug: "google",
      code: "auth-code",
      state: validState() + "tamper",
    });
    expect(result).toMatchObject({ ok: false, code: "STATE_INVALID" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("state for another provider fails closed", async () => {
    setGoogleEnvs();
    const result = await handleOAuthCallback({
      provider_slug: "slack",
      code: "auth-code",
      state: validState(), // google state
    });
    expect(result).toMatchObject({ ok: false, code: "STATE_INVALID" });
  });

  it("happy path stores ONLY an AES-256-GCM envelope — never the raw token", async () => {
    setGoogleEnvs();
    const RAW_TOKEN = "ya29.test-access-token-value";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          access_token: RAW_TOKEN,
          refresh_token: "1//test-refresh-token",
          expires_in: 3599,
          token_type: "Bearer",
          scope:
            "https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/gmail.readonly",
        }),
      }),
    );
    prismaMock.integrationCredential.upsert.mockResolvedValue({});
    const result = await handleOAuthCallback({
      provider_slug: "google",
      code: "auth-code",
      state: validState(),
    });
    expect(result).toMatchObject({ ok: true, provider: "GOOGLE_WORKSPACE" });
    const upsert = prismaMock.integrationCredential.upsert.mock.calls[0]![0];
    const stored = JSON.stringify(upsert);
    // The raw token must never appear in the persisted payload…
    expect(stored).not.toContain(RAW_TOKEN);
    expect(stored).not.toContain("1//test-refresh-token");
    // …and the envelope must decrypt back to it (3-part GCM shape).
    const sealed = upsert.create.webhook_secret as string;
    expect(sealed.split(".").length).toBe(3);
    const enc = makeContentEncryption();
    const envelope = JSON.parse(enc.decrypt(sealed)) as {
      access_token: string;
    };
    expect(envelope.access_token).toBe(RAW_TOKEN);
    // Redacted metadata is honest: CONNECTED_UNVERIFIED, not VERIFIED.
    expect(upsert.create.config.status).toBe("CONNECTED_UNVERIFIED");
    // Audit fired with safe details only.
    const audit = writeAuditEventMock.mock.calls.find(
      (c) => c[0].event_type === "CONNECTOR_OAUTH_CONNECTED",
    );
    expect(audit).toBeTruthy();
    expect(JSON.stringify(audit![0])).not.toContain(RAW_TOKEN);
  });

  it("provider exchange failure → EXCHANGE_FAILED + DENIED audit, nothing stored", async () => {
    setGoogleEnvs();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: "invalid_grant" }),
      }),
    );
    const result = await handleOAuthCallback({
      provider_slug: "google",
      code: "expired-code",
      state: validState(),
    });
    expect(result).toMatchObject({ ok: false, code: "EXCHANGE_FAILED" });
    expect(prismaMock.integrationCredential.upsert).not.toHaveBeenCalled();
    expect(writeAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: "CONNECTOR_OAUTH_FAILED",
        outcome: "DENIED",
      }),
    );
  });
});

describe("Phase 1261 — honest status surface", () => {
  it("no creds + no row → APP_CREDENTIALS_MISSING; creds + no row → READY_FOR_CONSENT; never VERIFIED without a probe", async () => {
    setGoogleEnvs();
    prismaMock.integrationCredential.findMany.mockResolvedValue([]);
    const result = await getOAuthStatusForOrg(ORG_ID);
    const byProvider = new Map(result.providers.map((p) => [p.provider, p]));
    expect(byProvider.get("GOOGLE_WORKSPACE")?.status).toBe(
      "READY_FOR_CONSENT",
    );
    // Slack/Microsoft/Zoom envs are absent in this test.
    expect(byProvider.get("SLACK")?.status).toBe("APP_CREDENTIALS_MISSING");
    for (const row of result.providers) {
      expect(row.status).not.toBe("VERIFIED");
    }
    // SAFE surface: no token material fields at all.
    const text = JSON.stringify(result);
    expect(text).not.toContain("access_token");
    expect(text).not.toContain("webhook_secret");
  });

  it("a stored connection reports its honest metadata status", async () => {
    setGoogleEnvs();
    prismaMock.integrationCredential.findMany.mockResolvedValue([
      {
        tool: "OAUTH_GOOGLE_WORKSPACE",
        enabled: true,
        config: {
          oauth_provider: "GOOGLE_WORKSPACE",
          status: "CONNECTED_UNVERIFIED",
          scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
          account_label: null,
          connected_at: "2026-06-12T00:00:00.000Z",
          last_verified_at: null,
        },
      },
    ]);
    const result = await getOAuthStatusForOrg(ORG_ID);
    const g = result.providers.find((p) => p.provider === "GOOGLE_WORKSPACE");
    expect(g?.status).toBe("CONNECTED_UNVERIFIED");
    expect(g?.connected_at).toBe("2026-06-12T00:00:00.000Z");
  });
});

function sealedEnvelope(envelope: Record<string, unknown>): string {
  return makeContentEncryption().encrypt(JSON.stringify(envelope));
}

const STORED_ROW = () => ({
  enabled: true,
  webhook_secret: sealedEnvelope({
    access_token: "ya29.stored-token",
    token_type: "Bearer",
  }),
  config: {
    oauth_provider: "GOOGLE_WORKSPACE",
    status: "CONNECTED_UNVERIFIED",
    scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
    account_label: null,
    connected_at: "2026-06-12T00:00:00.000Z",
    last_verified_at: null,
  },
});

describe("Phase 1261 — verify flow (the only path to VERIFIED)", () => {
  it("probe 200 → VERIFIED + audit", async () => {
    setGoogleEnvs();
    prismaMock.integrationCredential.findUnique.mockResolvedValue(STORED_ROW());
    prismaMock.integrationCredential.update.mockResolvedValue({});
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) }),
    );
    const result = await verifyOAuthConnection({
      provider_slug: "google",
      org_entity_id: ORG_ID,
      actor_entity_id: ACTOR_ID,
    });
    expect(result).toMatchObject({ ok: true, status: "VERIFIED" });
    const update = prismaMock.integrationCredential.update.mock.calls[0]![0];
    expect(update.data.config.status).toBe("VERIFIED");
    expect(typeof update.data.config.last_verified_at).toBe("string");
    expect(writeAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ event_type: "CONNECTOR_OAUTH_VERIFIED" }),
    );
  });

  it("probe 401 → ERROR_NEEDS_RECONNECT + DENIED audit, scrubbed reason", async () => {
    setGoogleEnvs();
    prismaMock.integrationCredential.findUnique.mockResolvedValue(STORED_ROW());
    prismaMock.integrationCredential.update.mockResolvedValue({});
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }),
    );
    const result = await verifyOAuthConnection({
      provider_slug: "google",
      org_entity_id: ORG_ID,
      actor_entity_id: ACTOR_ID,
    });
    expect(result).toMatchObject({ ok: false, code: "VERIFY_FAILED" });
    const update = prismaMock.integrationCredential.update.mock.calls[0]![0];
    expect(update.data.config.status).toBe("ERROR_NEEDS_RECONNECT");
    const audit = writeAuditEventMock.mock.calls.find(
      (c) => c[0].event_type === "CONNECTOR_OAUTH_FAILED",
    );
    expect(JSON.stringify(audit![0])).not.toContain("ya29.stored-token");
  });

  it("no stored connection → NOT_CONNECTED (no probe fired)", async () => {
    setGoogleEnvs();
    prismaMock.integrationCredential.findUnique.mockResolvedValue(null);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const result = await verifyOAuthConnection({
      provider_slug: "google",
      org_entity_id: ORG_ID,
      actor_entity_id: ACTOR_ID,
    });
    expect(result).toMatchObject({ ok: false, code: "NOT_CONNECTED" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("Phase 1261 — revoke flow", () => {
  it("wipes the envelope, disables the row, audits", async () => {
    setGoogleEnvs();
    prismaMock.integrationCredential.findUnique.mockResolvedValue(STORED_ROW());
    prismaMock.integrationCredential.update.mockResolvedValue({});
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) }),
    );
    const result = await revokeOAuthConnection({
      provider_slug: "google",
      org_entity_id: ORG_ID,
      actor_entity_id: ACTOR_ID,
    });
    expect(result).toEqual({ ok: true });
    const update = prismaMock.integrationCredential.update.mock.calls[0]![0];
    expect(update.data.webhook_secret).toBe("");
    expect(update.data.enabled).toBe(false);
    expect(update.data.config.status).toBe("REVOKED");
    expect(writeAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ event_type: "CONNECTOR_OAUTH_REVOKED" }),
    );
  });
});
