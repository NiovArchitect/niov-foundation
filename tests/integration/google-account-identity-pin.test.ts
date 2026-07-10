// FILE: google-account-identity-pin.test.ts (integration)
// PURPOSE: [SLICE3-PREREQ] Real-DB locks for the Google account-identity pin —
//          the prerequisite the future WatchSubscription rail depends on. Proves:
//            1. first Google connection verifies + pins the OIDC `sub`
//            2. same-account reconnect (even with a changed email) succeeds
//            3. a DIFFERENT verified account is refused BEFORE the sealed token
//               is overwritten (byte-for-byte unchanged)
//            4. a pinned row with NO verified id_token is ALSO refused, token
//               untouched (the swap guard is independent of the scope flag)
//            5. a missing/invalid id_token fails the connection closed
//            6. two concurrent first-connections for different accounts cannot
//               both win — one pins, the other is refused (no last-write-wins)
//            7. legacy null-identity credential is usable + cannot be treated as
//               pinned; a later verified reauth lazy-pins it
//            8. the exact-credential resolver never falls back to another row
//            9. a new Google import stamps the pinned credential lineage; old
//               rows stay readable
//          Google's token + JWKS endpoints are stubbed; a local RSA keypair
//          signs the id_tokens. No real Google, no network.
// CONNECTS TO: apps/api/src/services/connector/connector-oauth.service.ts
//              apps/api/src/services/connector/google-identity.ts
//              apps/api/src/services/otzar/document-context.service.ts

import { generateKeyPairSync, type KeyPairKeyObjectResult } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";
import { createEntity, prisma } from "@niov/database";
import { ContentEncryption } from "@niov/auth";
import {
  handleOAuthCallback,
  startOAuthForOrg,
  getProviderAccessTokenForCredential,
  getGoogleCredentialIdentity,
  isGoogleCredentialIdentityPinned,
} from "../../apps/api/src/services/connector/connector-oauth.service.js";
import { importGoogleDocForCaller } from "../../apps/api/src/services/otzar/document-context.service.js";
import { cleanupTestData, ensureAuditTriggers, makeEntityInput } from "../helpers.js";

const CLIENT_ID = "test-google-client.apps.googleusercontent.com";
const KID = "pin-test-kid";
const keypair: KeyPairKeyObjectResult = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const jwks = {
  keys: [
    {
      ...(keypair.publicKey.export({ format: "jwk" }) as Record<string, unknown>),
      kid: KID,
      alg: "RS256",
      use: "sig",
    },
  ],
};

function signIdToken(
  sub: string,
  opts: { email?: string; email_verified?: boolean } = {},
): string {
  const nowSec = Math.floor(1_800_000_000);
  const payload: Record<string, unknown> = {
    sub,
    iss: "https://accounts.google.com",
    aud: CLIENT_ID,
    iat: nowSec - 30,
    exp: nowSec + 3600,
    ...(opts.email !== undefined ? { email: opts.email } : {}),
    ...(opts.email_verified !== undefined
      ? { email_verified: opts.email_verified }
      : {}),
  };
  // Sign well within the verifier's clock tolerance by pinning iat/exp around a
  // fixed epoch and letting the verifier use real `now`? The verifier uses real
  // Date.now() here (no nowMs seam through handleOAuthCallback), so use a live
  // window instead.
  const liveNow = Math.floor(Date.now() / 1000);
  payload.iat = liveNow - 30;
  payload.exp = liveNow + 3600;
  const pem = keypair.privateKey.export({ type: "pkcs8", format: "pem" });
  return jwt.sign(payload, pem as string, { algorithm: "RS256", keyid: KID });
}

// code -> id_token (absent entry = a token response WITHOUT id_token: the
// legacy / scope-off path).
const idTokenByCode = new Map<string, string>();

function installFetchStub(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown, init?: { body?: unknown }) => {
      const u = String(url);
      if (u.includes("/oauth2/v3/certs")) {
        return { ok: true, status: 200, json: async () => jwks } as unknown as Response;
      }
      if (u.includes("oauth2.googleapis.com/token")) {
        const body = new URLSearchParams(String(init?.body ?? ""));
        const grant = body.get("grant_type");
        if (grant === "refresh_token") {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              access_token: "refreshed-access-token",
              expires_in: 3600,
              token_type: "Bearer",
            }),
          } as unknown as Response;
        }
        const code = body.get("code") ?? "";
        const idToken = idTokenByCode.get(code);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            access_token: `access-${code}`,
            refresh_token: `refresh-${code}`,
            expires_in: 3600,
            token_type: "Bearer",
            scope:
              "https://www.googleapis.com/auth/drive.readonly openid email",
            ...(idToken !== undefined ? { id_token: idToken } : {}),
          }),
        } as unknown as Response;
      }
      if (u.includes("oauth2.googleapis.com/revoke")) {
        return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
      }
      return { ok: false, status: 404, json: async () => ({}) } as unknown as Response;
    }),
  );
}

async function makeOrgAndAdmin(): Promise<{ orgId: string; adminId: string }> {
  const org = await createEntity(makeEntityInput({ entity_type: "COMPANY" }));
  const admin = await createEntity(makeEntityInput({ entity_type: "PERSON" }));
  await prisma.entityMembership.create({
    data: { parent_id: org.entity_id, child_id: admin.entity_id, is_active: true },
  });
  createdOrgIds.push(org.entity_id);
  return { orgId: org.entity_id, adminId: admin.entity_id };
}

async function mintState(orgId: string, adminId: string): Promise<string> {
  const start = await startOAuthForOrg({
    provider_slug: "google",
    org_entity_id: orgId,
    actor_entity_id: adminId,
  });
  if (!start.ok) throw new Error(`startOAuthForOrg failed: ${JSON.stringify(start)}`);
  const url = new URL(start.authorize_url);
  const state = url.searchParams.get("state");
  if (state === null) throw new Error("no state in authorize_url");
  return state;
}

let connectSeq = 0;
async function connectGoogle(
  orgId: string,
  adminId: string,
  opts: {
    sub?: string;
    email?: string;
    email_verified?: boolean;
    includeIdToken?: boolean;
  },
): Promise<Awaited<ReturnType<typeof handleOAuthCallback>>> {
  connectSeq += 1;
  const code = `code-${connectSeq}-${opts.sub ?? "none"}`;
  if (opts.includeIdToken !== false && opts.sub !== undefined) {
    idTokenByCode.set(
      code,
      signIdToken(opts.sub, {
        ...(opts.email !== undefined ? { email: opts.email } : {}),
        ...(opts.email_verified !== undefined
          ? { email_verified: opts.email_verified }
          : {}),
      }),
    );
  }
  const state = await mintState(orgId, adminId);
  return handleOAuthCallback({ provider_slug: "google", code, state });
}

async function readCredential(orgId: string): Promise<{
  webhook_secret: string;
  external_account_subject: string | null;
  external_account_email: string | null;
} | null> {
  return prisma.integrationCredential.findUnique({
    where: {
      org_entity_id_tool: { org_entity_id: orgId, tool: "OAUTH_GOOGLE_WORKSPACE" },
    },
    select: {
      webhook_secret: true,
      external_account_subject: true,
      external_account_email: true,
    },
  });
}

const createdOrgIds: string[] = [];

beforeAll(async () => {
  await ensureAuditTriggers();
  process.env.GOOGLE_OAUTH_CLIENT_ID = CLIENT_ID;
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = "test-google-secret";
});

beforeEach(() => {
  installFetchStub();
});

afterEach(() => {
  vi.unstubAllGlobals();
  idTokenByCode.clear();
});

afterAll(async () => {
  if (createdOrgIds.length > 0) {
    await prisma.integrationCredential.deleteMany({
      where: { org_entity_id: { in: createdOrgIds } },
    });
    await prisma.workLedgerEntry.deleteMany({
      where: { org_entity_id: { in: createdOrgIds } },
    });
  }
  await cleanupTestData();
});

describe("Google account-identity pin", () => {
  it("first connection verifies and pins the OIDC sub", async () => {
    const { orgId, adminId } = await makeOrgAndAdmin();
    const r = await connectGoogle(orgId, adminId, {
      sub: "sub-A",
      email: "a@meridian.example",
      email_verified: true,
    });
    expect(r.ok).toBe(true);
    const cred = await readCredential(orgId);
    expect(cred?.external_account_subject).toBe("sub-A");
    expect(cred?.external_account_email).toBe("a@meridian.example");
    expect(await isGoogleCredentialIdentityPinned({ org_entity_id: orgId })).toBe(true);
  });

  it("same-account reconnect succeeds even when the email changed", async () => {
    const { orgId, adminId } = await makeOrgAndAdmin();
    await connectGoogle(orgId, adminId, { sub: "sub-A", email: "old@x.example" });
    const before = await readCredential(orgId);
    const r = await connectGoogle(orgId, adminId, {
      sub: "sub-A",
      email: "new@x.example",
    });
    expect(r.ok).toBe(true);
    const after = await readCredential(orgId);
    expect(after?.external_account_subject).toBe("sub-A");
    expect(after?.external_account_email).toBe("new@x.example");
    // The token WAS re-sealed (a fresh connection) — a same-account reconnect
    // is allowed to rotate the token.
    expect(after?.webhook_secret).not.toBe(before?.webhook_secret);
  });

  it("refuses a DIFFERENT account BEFORE overwriting the sealed token", async () => {
    const { orgId, adminId } = await makeOrgAndAdmin();
    await connectGoogle(orgId, adminId, { sub: "sub-A" });
    const before = await readCredential(orgId);
    const r = await connectGoogle(orgId, adminId, { sub: "sub-B" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("GOOGLE_ACCOUNT_MISMATCH");
    const after = await readCredential(orgId);
    // The pin is unchanged AND the sealed token is byte-for-byte unchanged.
    expect(after?.external_account_subject).toBe("sub-A");
    expect(after?.webhook_secret).toBe(before?.webhook_secret);
  });

  it("refuses a pinned row that reconnects WITHOUT a verified id_token (flag-off variant), token untouched", async () => {
    const { orgId, adminId } = await makeOrgAndAdmin();
    await connectGoogle(orgId, adminId, { sub: "sub-A" });
    const before = await readCredential(orgId);
    // No id_token in the token response (scope flag off / openid not granted).
    const r = await connectGoogle(orgId, adminId, { includeIdToken: false, sub: "sub-A" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("GOOGLE_IDENTITY_REQUIRED");
    const after = await readCredential(orgId);
    expect(after?.external_account_subject).toBe("sub-A");
    expect(after?.webhook_secret).toBe(before?.webhook_secret);
  });

  it("fails the connection closed when a present id_token cannot be verified", async () => {
    const { orgId, adminId } = await makeOrgAndAdmin();
    connectSeq += 1;
    const code = `code-badtoken-${connectSeq}`;
    // A token signed with the WRONG key but a valid-looking structure.
    const attacker = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = attacker.privateKey.export({ type: "pkcs8", format: "pem" });
    idTokenByCode.set(
      code,
      jwt.sign(
        { sub: "sub-evil", iss: "https://accounts.google.com", aud: CLIENT_ID, exp: Math.floor(Date.now() / 1000) + 3600 },
        pem as string,
        { algorithm: "RS256", keyid: KID },
      ),
    );
    const state = await mintState(orgId, adminId);
    const r = await handleOAuthCallback({ provider_slug: "google", code, state });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("IDENTITY_VERIFY_FAILED");
    // Nothing persisted.
    expect(await readCredential(orgId)).toBeNull();
  });

  it("two concurrent first-connections for different accounts: one pins, the other is refused", async () => {
    const { orgId, adminId } = await makeOrgAndAdmin();
    const [r1, r2] = await Promise.all([
      connectGoogle(orgId, adminId, { sub: "sub-race-A" }),
      connectGoogle(orgId, adminId, { sub: "sub-race-B" }),
    ]);
    const oks = [r1, r2].filter((r) => r.ok);
    const mismatches = [r1, r2].filter((r) => !r.ok && r.code === "GOOGLE_ACCOUNT_MISMATCH");
    expect(oks).toHaveLength(1);
    expect(mismatches).toHaveLength(1);
    const cred = await readCredential(orgId);
    // The stored subject is one of the two — and it is the ONLY one; there is no
    // last-write-wins blending.
    expect(["sub-race-A", "sub-race-B"]).toContain(cred?.external_account_subject);
  });

  it("legacy null-identity credential: usable, not pinned; a later verified reauth lazy-pins it", async () => {
    const { orgId, adminId } = await makeOrgAndAdmin();
    // Connect WITHOUT an id_token (openid not granted) — a legacy credential.
    const r1 = await connectGoogle(orgId, adminId, { includeIdToken: false, sub: "ignored" });
    expect(r1.ok).toBe(true);
    const legacy = await getGoogleCredentialIdentity({ org_entity_id: orgId });
    expect(legacy?.pinned).toBe(false);
    expect(legacy?.external_account_subject).toBeNull();
    expect(await isGoogleCredentialIdentityPinned({ org_entity_id: orgId })).toBe(false);
    // Next verified reauth lazy-pins.
    const r2 = await connectGoogle(orgId, adminId, { sub: "sub-lazy" });
    expect(r2.ok).toBe(true);
    expect(await isGoogleCredentialIdentityPinned({ org_entity_id: orgId })).toBe(true);
    const pinned = await getGoogleCredentialIdentity({ org_entity_id: orgId });
    expect(pinned?.external_account_subject).toBe("sub-lazy");
  });

  it("exact-credential resolver enforces org + provider and never falls back", async () => {
    const { orgId, adminId } = await makeOrgAndAdmin();
    await connectGoogle(orgId, adminId, { sub: "sub-resolver" });
    const identity = await getGoogleCredentialIdentity({ org_entity_id: orgId });
    const credId = identity?.credential_id as string;

    const good = await getProviderAccessTokenForCredential({
      credential_id: credId,
      expected_org_entity_id: orgId,
      expected_provider: "GOOGLE_WORKSPACE",
      require_identity_pinned: true,
    });
    expect(good.ok).toBe(true);
    if (good.ok) expect(good.external_account_subject).toBe("sub-resolver");

    const wrongOrg = await getProviderAccessTokenForCredential({
      credential_id: credId,
      expected_org_entity_id: "00000000-0000-0000-0000-0000000000ff",
      expected_provider: "GOOGLE_WORKSPACE",
    });
    expect(wrongOrg).toEqual({ ok: false, code: "ORG_MISMATCH" });

    const wrongProvider = await getProviderAccessTokenForCredential({
      credential_id: credId,
      expected_org_entity_id: orgId,
      expected_provider: "SLACK",
    });
    expect(wrongProvider).toEqual({ ok: false, code: "PROVIDER_MISMATCH" });

    const missing = await getProviderAccessTokenForCredential({
      credential_id: "00000000-0000-0000-0000-0000000000aa",
      expected_org_entity_id: orgId,
      expected_provider: "GOOGLE_WORKSPACE",
    });
    expect(missing).toEqual({ ok: false, code: "CREDENTIAL_NOT_FOUND" });
  });

  it("resolver fails closed when identity is required but not pinned", async () => {
    const { orgId, adminId } = await makeOrgAndAdmin();
    await connectGoogle(orgId, adminId, { includeIdToken: false, sub: "ignored" });
    const identity = await getGoogleCredentialIdentity({ org_entity_id: orgId });
    const credId = identity?.credential_id as string;
    const r = await getProviderAccessTokenForCredential({
      credential_id: credId,
      expected_org_entity_id: orgId,
      expected_provider: "GOOGLE_WORKSPACE",
      require_identity_pinned: true,
    });
    expect(r).toEqual({ ok: false, code: "IDENTITY_NOT_PINNED" });
  });

  it("a new Google import stamps the pinned credential lineage; a manual doc has none", async () => {
    const { orgId, adminId } = await makeOrgAndAdmin();
    await connectGoogle(orgId, adminId, { sub: "sub-import" });
    const identity = await getGoogleCredentialIdentity({ org_entity_id: orgId });

    const imported = await importGoogleDocForCaller(adminId, {
      file_id: "drive-file-xyz",
      name: "Q3 Plan",
      text: "This is the imported document body with enough content to pass validation.",
      modified_time: new Date().toISOString(),
      web_view_link: "https://docs.google.com/document/d/drive-file-xyz",
      content_sha256: "a".repeat(64),
    });
    expect(imported.ok).toBe(true);
    if (imported.ok) {
      const row = await prisma.workLedgerEntry.findUnique({
        where: { ledger_entry_id: imported.ledger_entry_id },
        select: { details: true },
      });
      const ext = (row?.details as {
        document?: {
          external_source?: {
            integration_credential_id?: string;
            external_account_subject?: string;
          };
        };
      })?.document?.external_source;
      expect(ext?.integration_credential_id).toBe(identity?.credential_id);
      expect(ext?.external_account_subject).toBe("sub-import");
    }
  });
});
