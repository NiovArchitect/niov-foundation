// FILE: connector-oauth.service.ts
// PURPOSE: Phase 1261 — Priority C OAuth connector activation
//          substrate. Provider-agnostic authorization-code flow for
//          GOOGLE_WORKSPACE / SLACK / MICROSOFT_365 / ZOOM:
//            start    → signed state JWT + provider authorize URL
//            callback → code→token exchange + AES-256-GCM-encrypted
//                       token envelope stored in IntegrationCredential
//                       (org-scoped; tool = OAUTH_<provider>)
//            status   → honest closed-vocab per-provider readiness
//            verify   → live identity probe with the stored token
//            revoke   → best-effort provider revoke + envelope wipe
//          Every transition audits BEFORE the response (RULE 4).
//          SAFE surfaces NEVER carry tokens, codes, client secrets,
//          state JWTs, or the encrypted envelope. Authorize/token/
//          probe endpoints follow the official provider docs cited
//          in docs/operations/oauth-priority-c-setup-runbook.md +
//          docs/operations/official-docs-ingest-map.md (RULE 21).
//          Statuses are honest: a connection is VERIFIED only after
//          a live probe succeeds — credentials alone never read as
//          connected (no fake green).
// CONNECTS TO:
//   - apps/api/src/routes/connector-oauth.routes.ts
//   - apps/api/src/services/connectors/connector-adapter-registry.ts
//     (env names + oauth_scopes ground truth)
//   - packages/auth/src/crypto.ts (ContentEncryption AES-256-GCM)
//   - packages/database IntegrationCredential (org, tool unique)
//   - tests/unit/connector-oauth.test.ts

import jwt from "jsonwebtoken";
import { makeContentEncryption } from "@niov/auth";
import { prisma, writeAuditEvent } from "@niov/database";
import { verifyGoogleIdToken } from "./google-identity.js";

// [SLICE3-PREREQ] Prisma is re-exported as a type-only symbol, so we detect a
// unique-constraint violation (P2002) structurally rather than via instanceof.
function isUniqueConstraintViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "P2002"
  );
}

// WHAT: Closed vocabulary of OAuth-capable Priority C providers.
// INPUT: Used as a string-literal union.
// OUTPUT: None — type only.
// WHY: Mirrors the connector-adapter-registry provider_name values;
//      nothing outside this set can enter the OAuth flow.
export type OAuthProviderKey =
  | "GOOGLE_WORKSPACE"
  | "SLACK"
  | "MICROSOFT_365"
  | "ZOOM";

// WHAT: URL-safe slugs used in route paths + provider console
//        redirect URIs (runbook canonical pattern).
// INPUT: slug string from the route param.
// OUTPUT: OAuthProviderKey | null.
// WHY: The redirect URI registered in each provider console is
//      /api/v1/connectors/oauth/callback/<slug>; the slug is the
//      only caller-controlled provider input and is closed-vocab.
const SLUG_TO_PROVIDER: Readonly<Record<string, OAuthProviderKey>> = {
  google: "GOOGLE_WORKSPACE",
  slack: "SLACK",
  microsoft: "MICROSOFT_365",
  zoom: "ZOOM",
};

export function providerForSlug(slug: string): OAuthProviderKey | null {
  return SLUG_TO_PROVIDER[slug] ?? null;
}

export function slugForProvider(provider: OAuthProviderKey): string {
  switch (provider) {
    case "GOOGLE_WORKSPACE":
      return "google";
    case "SLACK":
      return "slack";
    case "MICROSOFT_365":
      return "microsoft";
    case "ZOOM":
      return "zoom";
  }
}

// WHAT: Per-provider OAuth wire configuration.
// INPUT: Used as a record type.
// OUTPUT: None — type only.
// WHY: token_auth discriminates the two transport conventions:
//      "body" sends client_id/client_secret form fields (Google /
//      Slack / Microsoft); "basic" sends an Authorization: Basic
//      header (Zoom). probe_* defines the verify-time identity call
//      that exercises a granted scope.
interface OAuthProviderConfig {
  provider: OAuthProviderKey;
  display_name: string;
  authorize_url: string;
  token_url: string;
  token_auth: "body" | "basic";
  /** Scopes requested at consent (superset of the registry's
   *  oauth_scopes — full URIs + provider-required extras like
   *  offline_access). Empty array = scopes fixed in the console. */
  scopes: ReadonlyArray<string>;
  client_id_env: string;
  client_secret_env: string;
  /** Extra authorize-URL params (e.g., Google offline access). */
  extra_authorize_params: Readonly<Record<string, string>>;
  probe_url: string;
  probe_method: "GET" | "POST";
}

// WHAT: Resolve the Microsoft Entra tenant for the v2 endpoints.
// INPUT: None (env).
// OUTPUT: Tenant id string or "organizations" fallback.
// WHY: Single-tenant apps use the directory id from the registry's
//      MICROSOFT_GRAPH_TENANT_ID; "organizations" keeps the URL
//      well-formed (and the flow honestly failing) until it is set.
function microsoftTenant(): string {
  const t = process.env.MICROSOFT_GRAPH_TENANT_ID;
  return typeof t === "string" && t.length > 0 ? t : "organizations";
}

function providerConfig(provider: OAuthProviderKey): OAuthProviderConfig {
  switch (provider) {
    case "GOOGLE_WORKSPACE":
      return {
        provider,
        display_name: "Google Workspace",
        authorize_url: "https://accounts.google.com/o/oauth2/v2/auth",
        token_url: "https://oauth2.googleapis.com/token",
        token_auth: "body",
        scopes: [
          "https://www.googleapis.com/auth/calendar.readonly",
          // Phase 1271 — least-privilege scheduling-read scopes for
          // free/busy + meeting-proposal intelligence. Additive: a
          // re-consent issues a token that carries these; the existing
          // calendar.readonly already covers the freeBusy query, so
          // these narrow the future ask, they do not unblock new power.
          // NO event-write, NO full calendar, NO Gmail-send, NO Drive
          // scopes are added here (Phase 1271 §Scope Strategy Group 1).
          "https://www.googleapis.com/auth/calendar.freebusy",
          "https://www.googleapis.com/auth/calendar.events.freebusy",
          "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
          "https://www.googleapis.com/auth/calendar.settings.readonly",
          "https://www.googleapis.com/auth/gmail.readonly",
          "https://www.googleapis.com/auth/drive.metadata.readonly",
          // [GOOGLE-DOCS + GOOGLE-MEET] Read-only content scopes for the
          // selected-doc import rail (drive.readonly — export ONE
          // admin-chosen doc, never an auto-sync) and post-meeting Meet
          // transcript import (meetings.space.readonly). Still ZERO
          // write scopes: no event-write, no Gmail-send, no Drive write.
          "https://www.googleapis.com/auth/drive.readonly",
          "https://www.googleapis.com/auth/meetings.space.readonly",
          // [CALENDAR-WRITE] The ONLY write scope Otzar requests —
          // create/update/delete events on the connected calendar,
          // reached exclusively through the approval-gated create rail.
          // No calendar-share, no delete-all, no Gmail-send, no Drive
          // write. A re-consent is required to grant it; until then the
          // create rail answers EVENT_WRITE_SCOPE_MISSING honestly.
          "https://www.googleapis.com/auth/calendar.events",
        ],
        client_id_env: "GOOGLE_OAUTH_CLIENT_ID",
        client_secret_env: "GOOGLE_OAUTH_CLIENT_SECRET",
        // offline access + forced consent so a refresh_token is
        // issued on every connect (Google omits it otherwise).
        extra_authorize_params: {
          access_type: "offline",
          prompt: "consent",
        },
        probe_url:
          "https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=1",
        probe_method: "GET",
      };
    case "SLACK":
      return {
        provider,
        display_name: "Slack",
        authorize_url: "https://slack.com/oauth/v2/authorize",
        token_url: "https://slack.com/api/oauth.v2.access",
        token_auth: "body",
        scopes: [
          "channels:read",
          "channels:history",
          "users:read",
          "chat:write",
        ],
        client_id_env: "SLACK_CLIENT_ID",
        client_secret_env: "SLACK_CLIENT_SECRET",
        extra_authorize_params: {},
        probe_url: "https://slack.com/api/auth.test",
        probe_method: "POST",
      };
    case "MICROSOFT_365":
      return {
        provider,
        display_name: "Microsoft 365",
        authorize_url: `https://login.microsoftonline.com/${microsoftTenant()}/oauth2/v2.0/authorize`,
        token_url: `https://login.microsoftonline.com/${microsoftTenant()}/oauth2/v2.0/token`,
        token_auth: "body",
        scopes: [
          "offline_access",
          "https://graph.microsoft.com/Mail.Read",
          "https://graph.microsoft.com/Calendars.Read",
          "https://graph.microsoft.com/Files.Read.All",
          "https://graph.microsoft.com/User.Read",
        ],
        client_id_env: "MICROSOFT_GRAPH_CLIENT_ID",
        client_secret_env: "MICROSOFT_GRAPH_CLIENT_SECRET",
        extra_authorize_params: { response_mode: "query" },
        probe_url: "https://graph.microsoft.com/v1.0/me",
        probe_method: "GET",
      };
    case "ZOOM":
      return {
        provider,
        display_name: "Zoom",
        authorize_url: "https://zoom.us/oauth/authorize",
        token_url: "https://zoom.us/oauth/token",
        token_auth: "basic",
        // Zoom scopes are fixed on the app in the marketplace
        // console (recording:read per the registry row); the
        // authorize URL carries no scope param.
        scopes: [],
        client_id_env: "ZOOM_OAUTH_CLIENT_ID",
        client_secret_env: "ZOOM_OAUTH_CLIENT_SECRET",
        extra_authorize_params: {},
        // The verify probe MUST exercise a granted scope. The Zoom
        // app holds only recording:read (registry row), so probing
        // /users/me (needs user:read) returns 400 even with a valid
        // token. List-recordings IS covered by recording:read and
        // returns 200 (empty list on accounts with no recordings).
        probe_url: "https://api.zoom.us/v2/users/me/recordings?page_size=1",
        probe_method: "GET",
      };
  }
}

export const OAUTH_PROVIDERS: ReadonlyArray<OAuthProviderKey> = [
  "GOOGLE_WORKSPACE",
  "SLACK",
  "MICROSOFT_365",
  "ZOOM",
];

/** IntegrationCredential.tool value for a provider's OAuth row. */
function toolFor(provider: OAuthProviderKey): string {
  return `OAUTH_${provider}`;
}

// WHAT: Canonical redirect URI for a provider (runbook pattern).
// INPUT: provider.
// OUTPUT: Absolute callback URL.
// WHY: One derivation everywhere; OAUTH_REDIRECT_BASE_URL switches
//      dev (http://localhost:3000) to the production API domain.
export function redirectUriFor(provider: OAuthProviderKey): string {
  const base =
    process.env.OAUTH_REDIRECT_BASE_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/api/v1/connectors/oauth/callback/${slugForProvider(provider)}`;
}

// WHAT: Closed-vocab connection status for the honest admin surface.
// INPUT: Used as a string-literal union.
// OUTPUT: None — type only.
// WHY: VERIFIED requires a successful live probe; token presence
//      alone is CONNECTED_UNVERIFIED. No fake green by construction.
export type OAuthConnectionStatus =
  | "APP_CREDENTIALS_MISSING"
  | "READY_FOR_CONSENT"
  | "CONNECTED_UNVERIFIED"
  | "VERIFIED"
  | "ERROR_NEEDS_RECONNECT"
  | "REVOKED";

export interface OAuthStatusRow {
  provider: OAuthProviderKey;
  display_name: string;
  slug: string;
  app_credentials_present: boolean;
  status: OAuthConnectionStatus;
  scopes: ReadonlyArray<string>;
  account_label: string | null;
  connected_at: string | null;
  last_verified_at: string | null;
  redirect_uri: string;
}

export interface ConnectorOAuthFailure {
  ok: false;
  code:
    | "UNKNOWN_PROVIDER"
    | "APP_CREDENTIALS_MISSING"
    | "STATE_INVALID"
    | "EXCHANGE_FAILED"
    | "NOT_CONNECTED"
    | "VERIFY_FAILED"
    | "REVOKE_FAILED"
    // [SLICE3-PREREQ] Google account-identity pin outcomes.
    | "IDENTITY_VERIFY_FAILED"
    | "GOOGLE_ACCOUNT_MISMATCH"
    | "GOOGLE_IDENTITY_REQUIRED"
    | "INTERNAL_ERROR";
  message?: string;
}

const STATE_PURPOSE = "connector_oauth_state";
const STATE_TTL_SECONDS = 600;
const HTTP_TIMEOUT_MS = 15_000;

interface StatePayload {
  purpose: typeof STATE_PURPOSE;
  provider: OAuthProviderKey;
  org_entity_id: string;
  actor_entity_id: string;
}

function jwtSecret(): string {
  const s = process.env.JWT_SECRET;
  if (typeof s !== "string" || s.length === 0) {
    throw new Error("JWT_SECRET must be set for OAuth state signing");
  }
  return s;
}

// WHAT: Sign the CSRF state for one start→callback round trip.
// INPUT: provider + org + actor.
// OUTPUT: Compact JWT (10-minute expiry).
// WHY: Stateless CSRF binding: the callback recovers WHICH org and
//      WHICH admin initiated consent without any server-side session,
//      and a forged/expired state fails closed at verification.
function signState(payload: StatePayload): string {
  return jwt.sign(payload, jwtSecret(), {
    expiresIn: STATE_TTL_SECONDS,
  });
}

function verifyState(state: string): StatePayload | null {
  try {
    const decoded = jwt.verify(state, jwtSecret());
    if (
      typeof decoded === "object" &&
      decoded !== null &&
      (decoded as Record<string, unknown>).purpose === STATE_PURPOSE
    ) {
      const d = decoded as Record<string, unknown>;
      if (
        typeof d.provider === "string" &&
        typeof d.org_entity_id === "string" &&
        typeof d.actor_entity_id === "string" &&
        OAUTH_PROVIDERS.includes(d.provider as OAuthProviderKey)
      ) {
        return {
          purpose: STATE_PURPOSE,
          provider: d.provider as OAuthProviderKey,
          org_entity_id: d.org_entity_id,
          actor_entity_id: d.actor_entity_id,
        };
      }
    }
    return null;
  } catch {
    return null;
  }
}

function appCredentialsPresent(cfg: OAuthProviderConfig): boolean {
  const id = process.env[cfg.client_id_env];
  const secret = process.env[cfg.client_secret_env];
  return (
    typeof id === "string" &&
    id.length > 0 &&
    typeof secret === "string" &&
    secret.length > 0
  );
}

// WHAT: The decrypted token envelope shape (NEVER leaves the server).
// INPUT: Used internally only.
// OUTPUT: None — type only.
// WHY: One JSON document, AES-256-GCM-encrypted at rest in
//      IntegrationCredential.webhook_secret via ContentEncryption.
interface TokenEnvelope {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  /** Epoch ms when access_token expires (absent = non-expiring). */
  expires_at?: number;
}

interface SafeOAuthMetadata {
  oauth_provider: OAuthProviderKey;
  status: OAuthConnectionStatus;
  scopes: string[];
  account_label: string | null;
  connected_at: string;
  last_verified_at: string | null;
}

// [SLICE3-PREREQ] The OIDC identity scopes (openid + email) are appended to the
// Google authorize request ONLY when GOOGLE_OIDC_IDENTITY=on. Default off keeps
// the production consent screen unchanged. Capture + verify + pin of any returned
// id_token is ALWAYS ON regardless of this flag — so enabling identity needs no
// code change, only the env flip. Adding these non-sensitive scopes changes what
// users consent to and forces existing users to re-consent, so the flip is a
// founder/consent decision (documented as the Slice-3 external hard stop).
const GOOGLE_OIDC_IDENTITY_SCOPES = ["openid", "email"] as const;
function googleOidcIdentityScopeEnabled(): boolean {
  return process.env.GOOGLE_OIDC_IDENTITY === "on";
}
function effectiveAuthorizeScopes(
  provider: OAuthProviderKey,
  cfg: OAuthProviderConfig,
): string[] {
  const base = [...cfg.scopes];
  if (provider === "GOOGLE_WORKSPACE" && googleOidcIdentityScopeEnabled()) {
    for (const s of GOOGLE_OIDC_IDENTITY_SCOPES) {
      if (!base.includes(s)) base.push(s);
    }
  }
  return base;
}

// WHAT: Start the OAuth consent flow for one provider.
// INPUT: provider slug + org + actor (admin, route-gated).
// OUTPUT: { ok: true; authorize_url } | ConnectorOAuthFailure.
// WHY: Builds the provider authorize URL with the signed state;
//      audits CONNECTOR_OAUTH_STARTED before returning (RULE 4).
export async function startOAuthForOrg(args: {
  provider_slug: string;
  org_entity_id: string;
  actor_entity_id: string;
}): Promise<{ ok: true; authorize_url: string } | ConnectorOAuthFailure> {
  const provider = providerForSlug(args.provider_slug);
  if (provider === null) {
    return { ok: false, code: "UNKNOWN_PROVIDER" };
  }
  const cfg = providerConfig(provider);
  if (!appCredentialsPresent(cfg)) {
    return {
      ok: false,
      code: "APP_CREDENTIALS_MISSING",
      message: `${cfg.display_name} OAuth app credentials (${cfg.client_id_env}, ${cfg.client_secret_env}) are not configured`,
    };
  }
  const state = signState({
    purpose: STATE_PURPOSE,
    provider,
    org_entity_id: args.org_entity_id,
    actor_entity_id: args.actor_entity_id,
  });
  const url = new URL(cfg.authorize_url);
  url.searchParams.set("client_id", process.env[cfg.client_id_env] ?? "");
  url.searchParams.set("redirect_uri", redirectUriFor(provider));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  const authorizeScopes = effectiveAuthorizeScopes(provider, cfg);
  if (authorizeScopes.length > 0) {
    // Slack uses `scope` for bot scopes; Google/Microsoft use the
    // space-joined `scope` param as well.
    url.searchParams.set(
      "scope",
      authorizeScopes.join(provider === "SLACK" ? "," : " "),
    );
  }
  for (const [k, v] of Object.entries(cfg.extra_authorize_params)) {
    url.searchParams.set(k, v);
  }
  await writeAuditEvent({
    event_type: "CONNECTOR_OAUTH_STARTED",
    outcome: "SUCCESS",
    actor_entity_id: args.actor_entity_id,
    target_entity_id: args.org_entity_id,
    details: { provider, scopes: authorizeScopes },
  });
  return { ok: true, authorize_url: url.toString() };
}

function scrub(message: string): string {
  // Defensive: never let token-bearing fragments ride an error
  // message into audit details or HTTP responses.
  return message
    .replace(/access_token[^\s,&"']*/gi, "access_token=[scrubbed]")
    .replace(/refresh_token[^\s,&"']*/gi, "refresh_token=[scrubbed]")
    .replace(/code=[^\s,&"']*/gi, "code=[scrubbed]")
    .slice(0, 300);
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
): Promise<Response> {
  return fetch(url, {
    ...init,
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  });
}

// WHAT: Exchange an authorization code for tokens at the provider.
// INPUT: provider config + code.
// OUTPUT: TokenEnvelope + safe metadata, or a scrubbed failure.
// WHY: The only place the code and raw token response exist; both
//      die in this scope — only the encrypted envelope survives.
async function exchangeCode(
  cfg: OAuthProviderConfig,
  code: string,
): Promise<
  | {
      ok: true;
      envelope: TokenEnvelope;
      scopes: string[];
      account_label: string | null;
      /**
       * [SLICE3-PREREQ] The raw OIDC id_token, present ONLY when `openid` was in
       * the granted scopes. Captured here (the sole scope where the raw token
       * response exists) and consumed immediately by the caller for identity
       * verification; it is NEVER persisted or logged.
       */
      id_token?: string;
    }
  | { ok: false; reason: string }
> {
  const clientId = process.env[cfg.client_id_env] ?? "";
  const clientSecret = process.env[cfg.client_secret_env] ?? "";
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUriFor(cfg.provider),
  });
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (cfg.token_auth === "basic") {
    headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
  } else {
    body.set("client_id", clientId);
    body.set("client_secret", clientSecret);
  }
  let res: Response;
  try {
    res = await fetchWithTimeout(cfg.token_url, {
      method: "POST",
      headers,
      body: body.toString(),
    });
  } catch (err) {
    const m = err instanceof Error ? err.message : "network error";
    return { ok: false, reason: scrub(m) };
  }
  let json: Record<string, unknown>;
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    return { ok: false, reason: `token endpoint returned ${res.status}` };
  }
  // Slack reports failure with ok:false at HTTP 200.
  if (!res.ok || json.ok === false || typeof json.access_token !== "string") {
    const errCode =
      typeof json.error === "string" ? json.error : `http_${res.status}`;
    return { ok: false, reason: scrub(errCode) };
  }
  const envelope: TokenEnvelope = { access_token: json.access_token };
  if (typeof json.refresh_token === "string") {
    envelope.refresh_token = json.refresh_token;
  }
  if (typeof json.token_type === "string") {
    envelope.token_type = json.token_type;
  }
  if (typeof json.expires_in === "number") {
    envelope.expires_at = Date.now() + json.expires_in * 1000;
  }
  const scopeRaw = typeof json.scope === "string" ? json.scope : "";
  const scopes =
    scopeRaw.length > 0
      ? scopeRaw.split(/[\s,]+/).filter((s) => s.length > 0)
      : [...cfg.scopes];
  // Provider-shaped harmless account label (team/org name only).
  let account_label: string | null = null;
  const team = json.team;
  if (
    typeof team === "object" &&
    team !== null &&
    typeof (team as Record<string, unknown>).name === "string"
  ) {
    account_label = (team as Record<string, unknown>).name as string;
  }
  const result: {
    ok: true;
    envelope: TokenEnvelope;
    scopes: string[];
    account_label: string | null;
    id_token?: string;
  } = { ok: true, envelope, scopes, account_label };
  if (typeof json.id_token === "string" && json.id_token.length > 0) {
    result.id_token = json.id_token;
  }
  return result;
}

// WHAT: Handle the provider redirect: validate state, exchange the
//        code, store the encrypted envelope, audit the outcome.
// INPUT: provider slug + code + state from the callback query.
// OUTPUT: { ok: true; provider; display_name } | failure.
// WHY: The browser hits this route unauthenticated; the signed state
//      is the proof of an admin-initiated flow (org + actor ride in
//      it). The raw code/tokens never persist or leave this scope.
export async function handleOAuthCallback(args: {
  provider_slug: string;
  code: string;
  state: string;
}): Promise<
  | { ok: true; provider: OAuthProviderKey; display_name: string }
  | ConnectorOAuthFailure
> {
  const provider = providerForSlug(args.provider_slug);
  if (provider === null) {
    return { ok: false, code: "UNKNOWN_PROVIDER" };
  }
  const cfg = providerConfig(provider);
  const state = verifyState(args.state);
  if (state === null || state.provider !== provider) {
    return {
      ok: false,
      code: "STATE_INVALID",
      message: "OAuth state is missing, expired, or not for this provider",
    };
  }
  const exchange = await exchangeCode(cfg, args.code);
  if (exchange.ok === false) {
    await writeAuditEvent({
      event_type: "CONNECTOR_OAUTH_FAILED",
      outcome: "DENIED",
      actor_entity_id: state.actor_entity_id,
      target_entity_id: state.org_entity_id,
      details: { provider, stage: "token_exchange", reason: exchange.reason },
    });
    return { ok: false, code: "EXCHANGE_FAILED", message: exchange.reason };
  }
  // [SLICE3-PREREQ] Verify the Google account identity when an id_token is
  // present (openid scope granted). An id_token that FAILS verification fails
  // the whole connection closed — we never persist an unverified identity.
  let verified: GoogleVerifiedIdentity | null = null;
  if (provider === "GOOGLE_WORKSPACE" && exchange.id_token !== undefined) {
    const idv = await verifyGoogleIdToken(exchange.id_token, {
      clientId: process.env[cfg.client_id_env] ?? "",
    });
    if (!idv.ok) {
      await writeAuditEvent({
        event_type: "CONNECTOR_OAUTH_FAILED",
        outcome: "DENIED",
        actor_entity_id: state.actor_entity_id,
        target_entity_id: state.org_entity_id,
        details: { provider, stage: "identity_verify", reason: idv.reason },
      });
      return {
        ok: false,
        code: "IDENTITY_VERIFY_FAILED",
        message: `Google account identity could not be verified (${idv.reason})`,
      };
    }
    verified = {
      subject: idv.subject,
      issuer: idv.issuer,
      ...(idv.email !== undefined ? { email: idv.email } : {}),
      ...(idv.email_verified !== undefined
        ? { email_verified: idv.email_verified }
        : {}),
    };
  }

  const enc = makeContentEncryption();
  const sealed = enc.encrypt(JSON.stringify(exchange.envelope));
  const metadata: SafeOAuthMetadata = {
    oauth_provider: provider,
    status: "CONNECTED_UNVERIFIED",
    scopes: exchange.scopes,
    account_label: exchange.account_label,
    connected_at: new Date().toISOString(),
    last_verified_at: null,
  };

  if (provider === "GOOGLE_WORKSPACE") {
    // Concurrency-safe, swap-guarded persistence (compare-and-set at the DB).
    const outcome = await persistGoogleCredentialWithIdentity({
      org_entity_id: state.org_entity_id,
      sealed,
      metadata,
      verified,
    });
    if (outcome === "ACCOUNT_MISMATCH" || outcome === "IDENTITY_REQUIRED") {
      await writeAuditEvent({
        event_type: "CONNECTOR_GOOGLE_ACCOUNT_MISMATCH_BLOCKED",
        outcome: "DENIED",
        actor_entity_id: state.actor_entity_id,
        target_entity_id: state.org_entity_id,
        // Leak-safe: NO subject, NO email, NO token — only the reason class.
        details: {
          provider,
          reason:
            outcome === "ACCOUNT_MISMATCH"
              ? "different_google_account"
              : "identity_verification_required",
        },
      });
      return outcome === "ACCOUNT_MISMATCH"
        ? {
            ok: false,
            code: "GOOGLE_ACCOUNT_MISMATCH",
            message:
              "This organization is already connected to a different Google account. Reconnecting a different account requires a governed account-replacement workflow.",
          }
        : {
            ok: false,
            code: "GOOGLE_IDENTITY_REQUIRED",
            message:
              "This organization's Google connection is identity-pinned; reconnecting requires verified Google identity (OIDC) to be enabled.",
          };
    }
    if (outcome === "ERROR") {
      return {
        ok: false,
        code: "INTERNAL_ERROR",
        message: "credential persistence failed",
      };
    }
    if (outcome === "PINNED") {
      await writeAuditEvent({
        event_type: "CONNECTOR_GOOGLE_ACCOUNT_PINNED",
        outcome: "SUCCESS",
        actor_entity_id: state.actor_entity_id,
        target_entity_id: state.org_entity_id,
        // Leak-safe: identity presence + verified flag only; NO subject/email.
        details: {
          provider,
          identity_pinned: true,
          email_verified: verified?.email_verified ?? null,
        },
      });
    }
  } else {
    try {
      await prisma.integrationCredential.upsert({
        where: {
          org_entity_id_tool: {
            org_entity_id: state.org_entity_id,
            tool: toolFor(provider),
          },
        },
        create: {
          org_entity_id: state.org_entity_id,
          tool: toolFor(provider),
          webhook_secret: sealed,
          config: metadata as object,
          enabled: true,
        },
        update: {
          webhook_secret: sealed,
          config: metadata as object,
          enabled: true,
        },
      });
    } catch (err) {
      const m = err instanceof Error ? err.message : "unknown";
      return { ok: false, code: "INTERNAL_ERROR", message: scrub(m) };
    }
  }

  await writeAuditEvent({
    event_type: "CONNECTOR_OAUTH_CONNECTED",
    outcome: "SUCCESS",
    actor_entity_id: state.actor_entity_id,
    target_entity_id: state.org_entity_id,
    details: {
      provider,
      scopes: exchange.scopes,
      account_label: exchange.account_label,
      identity_pinned: verified !== null,
    },
  });
  return { ok: true, provider, display_name: cfg.display_name };
}

// [SLICE3-PREREQ] A cryptographically verified Google account identity — the
// immutable OIDC `sub` is the authority; email is display/audit only.
interface GoogleVerifiedIdentity {
  subject: string;
  issuer: string;
  email?: string;
  email_verified?: boolean;
}

type GooglePersistOutcome =
  | "PINNED" // token stored AND identity verified+pinned (first pin or same-account)
  | "CONNECTED" // token stored, no identity (legacy/flag-off; row was unpinned)
  | "ACCOUNT_MISMATCH" // a DIFFERENT verified account — refused, token untouched
  | "IDENTITY_REQUIRED" // pinned row, no verified id_token this exchange — refused
  | "ERROR";

// WHAT: Persist a Google credential with swap-guarded identity pinning.
// INPUT: org + sealed envelope + safe metadata + optional verified identity.
// OUTPUT: a discriminated outcome (never throws for the mismatch cases).
// WHY: The sealed token (`webhook_secret`) may be overwritten for an already-
//      PINNED row ONLY by a reconnect whose verified `sub` matches. Enforced by
//      an atomic compare-and-set UPDATE (no read-then-write race), so two
//      concurrent first-connections for different accounts cannot both win —
//      one pins, the other is refused. Independent of the scope flag: a pinned
//      row with no matching verified `sub` (flag off, or no id_token) is refused
//      WITHOUT touching the token.
async function persistGoogleCredentialWithIdentity(args: {
  org_entity_id: string;
  sealed: string;
  metadata: SafeOAuthMetadata;
  verified: GoogleVerifiedIdentity | null;
}): Promise<GooglePersistOutcome> {
  const tool = toolFor("GOOGLE_WORKSPACE");
  const configJson = JSON.stringify(args.metadata);
  const v = args.verified;

  // The atomic compare-and-set guard. With a verified identity: overwrite the
  // token ONLY when the row is unpinned (subject IS NULL) or its pinned subject
  // equals the verified one (COALESCE preserves the original pinned_at across a
  // same-account reconnect). Without a verified identity: a plain refresh is
  // allowed ONLY on an unpinned row — a pinned row is left untouched. Either way
  // 0 rows affected means "no matching row to safely write".
  const casUpdate = async (): Promise<number> => {
    if (v !== null) {
      return prisma.$executeRaw`
        UPDATE integration_credentials
           SET webhook_secret = ${args.sealed},
               config = ${configJson}::jsonb,
               enabled = true,
               external_account_subject = ${v.subject},
               external_account_email = ${v.email ?? null},
               external_account_email_verified = ${v.email_verified ?? null},
               external_account_issuer = ${v.issuer},
               external_account_pinned_at = COALESCE(external_account_pinned_at, now()),
               external_account_last_verified_at = now()
         WHERE org_entity_id = ${args.org_entity_id}::uuid
           AND tool = ${tool}
           AND (external_account_subject IS NULL
                OR external_account_subject = ${v.subject})`;
    }
    return prisma.$executeRaw`
      UPDATE integration_credentials
         SET webhook_secret = ${args.sealed},
             config = ${configJson}::jsonb,
             enabled = true
       WHERE org_entity_id = ${args.org_entity_id}::uuid
         AND tool = ${tool}
         AND external_account_subject IS NULL`;
  };

  try {
    // 1) Guarded UPDATE first — covers every reconnect with no exception noise.
    const updated = await casUpdate();
    if (updated > 0) return v !== null ? "PINNED" : "CONNECTED";

    // 2) 0 rows: either the row does not exist yet, or the guard blocked it.
    //    Distinguish by attempting a create. The @@unique([org,tool]) constraint
    //    serializes two concurrent first-connections — exactly one create wins.
    try {
      await prisma.integrationCredential.create({
        data: {
          org_entity_id: args.org_entity_id,
          tool,
          webhook_secret: args.sealed,
          config: args.metadata as object,
          enabled: true,
          ...(v !== null
            ? {
                external_account_subject: v.subject,
                external_account_email: v.email ?? null,
                external_account_email_verified: v.email_verified ?? null,
                external_account_issuer: v.issuer,
                external_account_pinned_at: new Date(),
                external_account_last_verified_at: new Date(),
              }
            : {}),
        },
      });
      return v !== null ? "PINNED" : "CONNECTED";
    } catch (err) {
      if (!isUniqueConstraintViolation(err)) return "ERROR";
      // 3) A row now exists (it was there and the guard blocked it, or a
      //    concurrent first-connection just created it). Re-run the guard: a
      //    match means same-account (idempotent success); 0 rows means a
      //    different account / an identity-required refusal — token untouched.
      const retry = await casUpdate();
      if (retry > 0) return v !== null ? "PINNED" : "CONNECTED";
      return v !== null ? "ACCOUNT_MISMATCH" : "IDENTITY_REQUIRED";
    }
  } catch {
    return "ERROR";
  }
}

function metadataFrom(config: unknown): SafeOAuthMetadata | null {
  if (
    typeof config === "object" &&
    config !== null &&
    !Array.isArray(config) &&
    typeof (config as Record<string, unknown>).oauth_provider === "string"
  ) {
    return config as unknown as SafeOAuthMetadata;
  }
  return null;
}

// WHAT: The honest per-provider status surface.
// INPUT: org_entity_id.
// OUTPUT: One OAuthStatusRow per Priority C provider.
// WHY: Composes env-presence (app credentials) with the stored
//      connection metadata; VERIFIED appears only when a live probe
//      succeeded. The encrypted envelope is never read here.
export async function getOAuthStatusForOrg(
  org_entity_id: string,
): Promise<{ ok: true; providers: OAuthStatusRow[] }> {
  const rows = await prisma.integrationCredential.findMany({
    where: {
      org_entity_id,
      tool: { in: OAUTH_PROVIDERS.map(toolFor) },
    },
  });
  const byTool = new Map(rows.map((r) => [r.tool, r]));
  const providers = OAUTH_PROVIDERS.map((provider): OAuthStatusRow => {
    const cfg = providerConfig(provider);
    const credsPresent = appCredentialsPresent(cfg);
    const row = byTool.get(toolFor(provider));
    const meta = row !== undefined ? metadataFrom(row.config) : null;
    let status: OAuthConnectionStatus;
    if (meta !== null && row !== undefined) {
      status = row.enabled ? meta.status : "REVOKED";
    } else {
      status = credsPresent ? "READY_FOR_CONSENT" : "APP_CREDENTIALS_MISSING";
    }
    return {
      provider,
      display_name: cfg.display_name,
      slug: slugForProvider(provider),
      app_credentials_present: credsPresent,
      status,
      scopes: meta?.scopes ?? [...cfg.scopes],
      account_label: meta?.account_label ?? null,
      connected_at: meta?.connected_at ?? null,
      last_verified_at: meta?.last_verified_at ?? null,
      redirect_uri: redirectUriFor(provider),
    };
  });
  return { ok: true, providers };
}

async function loadEnvelope(args: {
  org_entity_id: string;
  provider: OAuthProviderKey;
}): Promise<
  | { ok: true; envelope: TokenEnvelope; meta: SafeOAuthMetadata }
  | { ok: false }
> {
  const row = await prisma.integrationCredential.findUnique({
    where: {
      org_entity_id_tool: {
        org_entity_id: args.org_entity_id,
        tool: toolFor(args.provider),
      },
    },
  });
  if (row === null || row.enabled === false || row.webhook_secret.length === 0) {
    return { ok: false };
  }
  const meta = metadataFrom(row.config);
  if (meta === null) return { ok: false };
  try {
    const enc = makeContentEncryption();
    const envelope = JSON.parse(
      enc.decrypt(row.webhook_secret),
    ) as TokenEnvelope;
    return { ok: true, envelope, meta };
  } catch {
    return { ok: false };
  }
}

async function persistMetadata(args: {
  org_entity_id: string;
  provider: OAuthProviderKey;
  meta: SafeOAuthMetadata;
  sealed?: string;
  enabled?: boolean;
}): Promise<void> {
  await prisma.integrationCredential.update({
    where: {
      org_entity_id_tool: {
        org_entity_id: args.org_entity_id,
        tool: toolFor(args.provider),
      },
    },
    data: {
      config: args.meta as object,
      ...(args.sealed !== undefined ? { webhook_secret: args.sealed } : {}),
      ...(args.enabled !== undefined ? { enabled: args.enabled } : {}),
    },
  });
}

// WHAT: Refresh the access token when expired (Google / Microsoft /
//        Zoom refresh-token grant; Slack bot tokens do not expire).
// INPUT: cfg + envelope.
// OUTPUT: A fresh envelope, or the original when no refresh applies.
// WHY: Verification stays truthful after the first hour without
//      forcing a full re-consent for refreshable providers.
async function refreshIfExpired(
  cfg: OAuthProviderConfig,
  envelope: TokenEnvelope,
): Promise<TokenEnvelope | null> {
  const expired =
    typeof envelope.expires_at === "number" &&
    envelope.expires_at <= Date.now() + 30_000;
  if (!expired) return envelope;
  if (typeof envelope.refresh_token !== "string") return null;
  const clientId = process.env[cfg.client_id_env] ?? "";
  const clientSecret = process.env[cfg.client_secret_env] ?? "";
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: envelope.refresh_token,
  });
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (cfg.token_auth === "basic") {
    headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
  } else {
    body.set("client_id", clientId);
    body.set("client_secret", clientSecret);
  }
  try {
    const res = await fetchWithTimeout(cfg.token_url, {
      method: "POST",
      headers,
      body: body.toString(),
    });
    const json = (await res.json()) as Record<string, unknown>;
    if (!res.ok || typeof json.access_token !== "string") return null;
    const fresh: TokenEnvelope = {
      access_token: json.access_token,
      refresh_token:
        typeof json.refresh_token === "string"
          ? json.refresh_token
          : envelope.refresh_token,
    };
    if (typeof json.token_type === "string") fresh.token_type = json.token_type;
    if (typeof json.expires_in === "number") {
      fresh.expires_at = Date.now() + json.expires_in * 1000;
    }
    return fresh;
  } catch {
    return null;
  }
}

// WHAT: Live verification probe — the ONLY path to VERIFIED.
// INPUT: provider slug + org + actor.
// OUTPUT: { ok: true; status } | failure.
// WHY: An identity/scope call with the stored token proves the
//      connection actually works; 401/expired flips the status to
//      ERROR_NEEDS_RECONNECT honestly. Audits both outcomes.
export async function verifyOAuthConnection(args: {
  provider_slug: string;
  org_entity_id: string;
  actor_entity_id: string;
}): Promise<
  { ok: true; status: OAuthConnectionStatus } | ConnectorOAuthFailure
> {
  const provider = providerForSlug(args.provider_slug);
  if (provider === null) return { ok: false, code: "UNKNOWN_PROVIDER" };
  const cfg = providerConfig(provider);
  const loaded = await loadEnvelope({
    org_entity_id: args.org_entity_id,
    provider,
  });
  if (loaded.ok === false) {
    return { ok: false, code: "NOT_CONNECTED" };
  }
  const refreshed = await refreshIfExpired(cfg, loaded.envelope);
  const fail = async (reason: string): Promise<ConnectorOAuthFailure> => {
    const meta: SafeOAuthMetadata = {
      ...loaded.meta,
      status: "ERROR_NEEDS_RECONNECT",
    };
    await persistMetadata({
      org_entity_id: args.org_entity_id,
      provider,
      meta,
    });
    await writeAuditEvent({
      event_type: "CONNECTOR_OAUTH_FAILED",
      outcome: "DENIED",
      actor_entity_id: args.actor_entity_id,
      target_entity_id: args.org_entity_id,
      details: { provider, stage: "verify", reason: scrub(reason) },
    });
    return { ok: false, code: "VERIFY_FAILED", message: scrub(reason) };
  };
  if (refreshed === null) {
    return fail("access token expired and refresh failed");
  }
  let res: Response;
  try {
    res = await fetchWithTimeout(cfg.probe_url, {
      method: cfg.probe_method,
      headers: { Authorization: `Bearer ${refreshed.access_token}` },
    });
  } catch (err) {
    return fail(err instanceof Error ? err.message : "network error");
  }
  // Slack returns ok:false at HTTP 200 for dead tokens.
  if (res.ok && provider === "SLACK") {
    try {
      const json = (await res.json()) as Record<string, unknown>;
      if (json.ok === false) {
        return fail(
          typeof json.error === "string" ? json.error : "auth.test failed",
        );
      }
    } catch {
      return fail("auth.test returned a non-JSON response");
    }
  }
  if (!res.ok) {
    return fail(`probe returned ${res.status}`);
  }
  const enc = makeContentEncryption();
  const meta: SafeOAuthMetadata = {
    ...loaded.meta,
    status: "VERIFIED",
    last_verified_at: new Date().toISOString(),
  };
  await persistMetadata({
    org_entity_id: args.org_entity_id,
    provider,
    meta,
    sealed: enc.encrypt(JSON.stringify(refreshed)),
  });
  await writeAuditEvent({
    event_type: "CONNECTOR_OAUTH_VERIFIED",
    outcome: "SUCCESS",
    actor_entity_id: args.actor_entity_id,
    target_entity_id: args.org_entity_id,
    details: { provider },
  });
  return { ok: true, status: "VERIFIED" };
}

// WHAT: Revoke a connection: best-effort provider-side revoke, then
//        wipe the envelope and disable the row (RULE 10: the row
//        stays; the secret material does not).
// INPUT: provider slug + org + actor.
// OUTPUT: { ok: true } | failure.
// WHY: Revocation must always succeed locally even when the provider
//      revoke endpoint is unreachable — the envelope wipe is the
//      guarantee; the provider call is courtesy hygiene.
export async function revokeOAuthConnection(args: {
  provider_slug: string;
  org_entity_id: string;
  actor_entity_id: string;
}): Promise<{ ok: true } | ConnectorOAuthFailure> {
  const provider = providerForSlug(args.provider_slug);
  if (provider === null) return { ok: false, code: "UNKNOWN_PROVIDER" };
  const loaded = await loadEnvelope({
    org_entity_id: args.org_entity_id,
    provider,
  });
  if (loaded.ok === false) {
    return { ok: false, code: "NOT_CONNECTED" };
  }
  // Best-effort provider-side revocation (Google + Zoom expose
  // revoke endpoints; Slack auth.revoke; Microsoft has no public
  // token-revocation endpoint — local wipe is the operative act).
  try {
    if (provider === "GOOGLE_WORKSPACE") {
      await fetchWithTimeout("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          token: loaded.envelope.access_token,
        }).toString(),
      });
    } else if (provider === "SLACK") {
      await fetchWithTimeout("https://slack.com/api/auth.revoke", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${loaded.envelope.access_token}`,
        },
      });
    } else if (provider === "ZOOM") {
      const id = process.env.ZOOM_OAUTH_CLIENT_ID ?? "";
      const secret = process.env.ZOOM_OAUTH_CLIENT_SECRET ?? "";
      await fetchWithTimeout("https://zoom.us/oauth/revoke", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
        },
        body: new URLSearchParams({
          token: loaded.envelope.access_token,
        }).toString(),
      });
    }
  } catch {
    // Provider-side revoke is best-effort; the local wipe below is
    // the operative revocation.
  }
  const meta: SafeOAuthMetadata = {
    ...loaded.meta,
    status: "REVOKED",
    account_label: null,
  };
  await persistMetadata({
    org_entity_id: args.org_entity_id,
    provider,
    meta,
    sealed: "",
    enabled: false,
  });
  await writeAuditEvent({
    event_type: "CONNECTOR_OAUTH_REVOKED",
    outcome: "SUCCESS",
    actor_entity_id: args.actor_entity_id,
    target_entity_id: args.org_entity_id,
    details: { provider },
  });
  return { ok: true };
}

// WHAT: Read the GRANTED scopes stored for one org + provider.
// INPUT: provider key + org_entity_id.
// OUTPUT: the granted scope strings (from the consent that issued the
//         stored token), or null when there is no usable connection.
// WHY: Capability gating (e.g. "may this token create a calendar
//      event?") must reason about what was ACTUALLY granted at consent
//      time — never the currently-requested cfg.scopes (that would fake
//      readiness before a re-consent). exchangeCode persists the
//      token-response `scope` list into metadata; this returns that.
//      Scope STRINGS only — no token material ever leaves here.
export async function getProviderGrantedScopes(args: {
  provider: OAuthProviderKey;
  org_entity_id: string;
}): Promise<string[] | null> {
  const loaded = await loadEnvelope({
    org_entity_id: args.org_entity_id,
    provider: args.provider,
  });
  if (loaded.ok === false) return null;
  return [...loaded.meta.scopes];
}

// WHAT: Resolve a live, non-expired access token for one org +
//        provider, refreshing + re-sealing it when needed.
// INPUT: provider key + org_entity_id.
// OUTPUT: { ok: true; access_token } | { ok: false; code } where
//         code is NOT_CONNECTED (no usable envelope) or
//         TOKEN_REFRESH_FAILED (expired + refresh rejected).
// WHY: Phase 1270 read-only data bridges (Zoom recordings, Calendar
//      free/busy) need a valid Bearer token without re-implementing
//      the load → refresh → re-seal dance verifyOAuthConnection
//      already owns. The raw token NEVER leaves the server boundary;
//      callers use it only as an outbound Authorization header and
//      MUST NOT log, persist, or return it. When a refresh produces
//      a new envelope we re-seal it so the next read does not refresh
//      again (mirrors the verify path's persistence intent).
export async function getProviderAccessTokenForOrg(args: {
  provider: OAuthProviderKey;
  org_entity_id: string;
}): Promise<
  | { ok: true; access_token: string }
  | { ok: false; code: "NOT_CONNECTED" | "TOKEN_REFRESH_FAILED" }
> {
  const cfg = providerConfig(args.provider);
  const loaded = await loadEnvelope({
    org_entity_id: args.org_entity_id,
    provider: args.provider,
  });
  if (loaded.ok === false) return { ok: false, code: "NOT_CONNECTED" };
  const refreshed = await refreshIfExpired(cfg, loaded.envelope);
  if (refreshed === null) return { ok: false, code: "TOKEN_REFRESH_FAILED" };
  // Re-seal only when refresh actually rotated the token, so steady
  // state is a single decrypt with no write.
  if (refreshed.access_token !== loaded.envelope.access_token) {
    try {
      const enc = makeContentEncryption();
      await persistMetadata({
        org_entity_id: args.org_entity_id,
        provider: args.provider,
        meta: loaded.meta,
        sealed: enc.encrypt(JSON.stringify(refreshed)),
      });
    } catch {
      // A re-seal failure is non-fatal: the in-memory refreshed token
      // is still valid for this request; the next request refreshes
      // again. Never surface or log the token material.
    }
  }
  return { ok: true, access_token: refreshed.access_token };
}

// WHAT: [SLICE3-PREREQ] Resolve a live access token for ONE EXACT credential row
//        by credential_id — never by (provider, org) fallback.
// INPUT: credential_id + the expected org + expected provider (both asserted) +
//        optional require_identity_pinned.
// OUTPUT: { ok:true, access_token, external_account_subject } | { ok:false, code }.
// WHY: The future WatchSubscription rail binds to a specific IntegrationCredential
//      and must pull with THAT sealed credential — never "any Google token in the
//      org". This fetches the exact row, verifies it belongs to the expected org
//      and provider and is active, refreshes+reseals that same row, preserves the
//      pinned identity, and fails closed if identity is required but absent. It
//      NEVER selects another credential.
export async function getProviderAccessTokenForCredential(args: {
  credential_id: string;
  expected_org_entity_id: string;
  expected_provider: OAuthProviderKey;
  require_identity_pinned?: boolean;
}): Promise<
  | { ok: true; access_token: string; external_account_subject: string | null }
  | {
      ok: false;
      code:
        | "CREDENTIAL_NOT_FOUND"
        | "ORG_MISMATCH"
        | "PROVIDER_MISMATCH"
        | "REVOKED"
        | "TOKEN_REFRESH_FAILED"
        | "IDENTITY_NOT_PINNED";
    }
> {
  const row = await prisma.integrationCredential.findUnique({
    where: { credential_id: args.credential_id },
  });
  if (row === null) return { ok: false, code: "CREDENTIAL_NOT_FOUND" };
  // Exactness assertions — a mismatched org or provider NEVER falls back.
  if (row.org_entity_id !== args.expected_org_entity_id) {
    return { ok: false, code: "ORG_MISMATCH" };
  }
  if (row.tool !== toolFor(args.expected_provider)) {
    return { ok: false, code: "PROVIDER_MISMATCH" };
  }
  if (row.enabled === false || row.webhook_secret.length === 0) {
    return { ok: false, code: "REVOKED" };
  }
  const meta = metadataFrom(row.config);
  if (meta !== null && meta.status === "REVOKED") {
    return { ok: false, code: "REVOKED" };
  }
  const subject = row.external_account_subject;
  if (
    args.require_identity_pinned === true &&
    (subject === null || subject.length === 0)
  ) {
    return { ok: false, code: "IDENTITY_NOT_PINNED" };
  }
  let envelope: TokenEnvelope;
  try {
    const enc = makeContentEncryption();
    envelope = JSON.parse(enc.decrypt(row.webhook_secret)) as TokenEnvelope;
  } catch {
    return { ok: false, code: "REVOKED" };
  }
  const cfg = providerConfig(args.expected_provider);
  const refreshed = await refreshIfExpired(cfg, envelope);
  if (refreshed === null) return { ok: false, code: "TOKEN_REFRESH_FAILED" };
  if (refreshed.access_token !== envelope.access_token) {
    try {
      const enc = makeContentEncryption();
      // Re-seal THIS EXACT row by credential_id — never another.
      await prisma.integrationCredential.update({
        where: { credential_id: args.credential_id },
        data: { webhook_secret: enc.encrypt(JSON.stringify(refreshed)) },
      });
    } catch {
      // Non-fatal: the in-memory token is valid for this request.
    }
  }
  return {
    ok: true,
    access_token: refreshed.access_token,
    external_account_subject: subject,
  };
}

// [SLICE3-PREREQ] Read-model of an org's pinned Google account identity.
// Internal (server-side gating) — the raw subject is never returned to a route.
export interface GoogleCredentialIdentity {
  credential_id: string;
  pinned: boolean;
  external_account_subject: string | null;
  external_account_email: string | null;
  pinned_at: string | null;
  last_verified_at: string | null;
}

// WHAT: The org's Google credential identity read-model (null if not connected).
// WHY: The future WatchSubscription registration gate reads this to require a
//      pinned identity before a real Google watch may be created.
export async function getGoogleCredentialIdentity(args: {
  org_entity_id: string;
}): Promise<GoogleCredentialIdentity | null> {
  const row = await prisma.integrationCredential.findUnique({
    where: {
      org_entity_id_tool: {
        org_entity_id: args.org_entity_id,
        tool: toolFor("GOOGLE_WORKSPACE"),
      },
    },
  });
  if (row === null) return null;
  const subject = row.external_account_subject;
  return {
    credential_id: row.credential_id,
    pinned: typeof subject === "string" && subject.length > 0,
    external_account_subject: subject,
    external_account_email: row.external_account_email,
    pinned_at: row.external_account_pinned_at?.toISOString() ?? null,
    last_verified_at: row.external_account_last_verified_at?.toISOString() ?? null,
  };
}

// WHAT: Predicate — is the org's Google connection identity-pinned?
// WHY: A future WatchSubscription registration MUST require: credential exists,
//      Google identity subject non-null (verified + pinned), and not revoked.
export async function isGoogleCredentialIdentityPinned(args: {
  org_entity_id: string;
}): Promise<boolean> {
  const identity = await getGoogleCredentialIdentity(args);
  return identity !== null && identity.pinned;
}
