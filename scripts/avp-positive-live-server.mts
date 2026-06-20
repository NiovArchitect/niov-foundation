// FILE: scripts/avp-positive-live-server.mts
// PURPOSE: F-1363 — committed, repeatable local live Foundation server for the
//          AVP² positive-smoke live PASS (replaces the F-1362 temp launcher).
//          Boots the REAL Fastify app against the LOCAL test Postgres with
//          in-memory nonce/rate stores (the integration-test pattern), enables the
//          dev-gated seed endpoint, mints a LOCAL session token through the real
//          Foundation auth path, and writes safe runtime metadata to /tmp only.
//
//          SAFETY: loads `.env.test` with OVERRIDE and dynamic-imports the
//          workspace packages AFTER, so the Prisma client is built against the
//          LOCAL test DB even though the repo's root `.env` points at production
//          (a static import would otherwise load production at import time). Then
//          it still refuses NODE_ENV=production and refuses a non-local
//          DATABASE_URL unless AVP_LIVE_ALLOW_NONLOCAL_DB=true. NEVER prints the
//          token (only base URLs + a [REDACTED] marker); writes /tmp/avp-live.json
//          (chmod 600) which the orchestrator deletes on cleanup. Not for production.
// CONNECTS TO: @niov/api (buildApp), @niov/auth (ContentEncryption),
//          @niov/database (createEntity), the niov-avp live-local orchestrator.

import { chmodSync, writeFileSync } from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import { config as loadDotenv } from "dotenv";

// OVERRIDE so the committed local test env wins over any ambient/root `.env`
// (the root `.env` points at production — never let this harness touch it).
loadDotenv({ path: ".env.test", override: true });

if (process.env.NODE_ENV === "production") {
  // eslint-disable-next-line no-console
  console.error("AVP live server refuses NODE_ENV=production.");
  process.exit(2);
}
process.env.NODE_ENV = process.env.NODE_ENV ?? "development";

const dbUrl = process.env.DATABASE_URL ?? "";
const isLocalDb = /@(localhost|127\.0\.0\.1)(:|\/|$)/.test(dbUrl);
if (!isLocalDb && process.env.AVP_LIVE_ALLOW_NONLOCAL_DB !== "true") {
  // eslint-disable-next-line no-console
  console.error("AVP live server refuses a non-local DATABASE_URL (set AVP_LIVE_ALLOW_NONLOCAL_DB=true to override).");
  process.exit(2);
}

process.env.FOUNDATION_ENABLE_LOCAL_AVP_SEED = "true";

// Dynamic imports AFTER dotenv override — the Prisma client + app construct
// against the LOCAL test DB, not the root-`.env` production target.
const api: any = await import("@niov/api");
const authPkg: any = await import("@niov/auth");
const db: any = await import("@niov/database");
const apiNs: any = api.default ?? api;
const authNs: any = authPkg.default ?? authPkg;
const dbNs: any = db.default ?? db;
const { buildApp, MemoryContentStore, MemoryNonceStore, MemoryRateLimitStore } = apiNs;
const { ContentEncryption } = authNs;
const { createEntity, prisma } = dbNs;

const port = Number.parseInt(process.env.AVP_LIVE_PORT ?? "3939", 10);
const PREFIX = "avp_live_local_";
const entityInput = (overrides: Record<string, unknown> = {}): any => {
  const id = randomUUID();
  return { entity_type: "PERSON", display_name: `${PREFIX}name_${id}`, public_key: `pk_${id}`, email: `${PREFIX}${id}@niov.test`, ...overrides };
};

const app = await buildApp({
  jwtSecret: process.env.JWT_SECRET ?? "f1363-live-local-secret",
  sessionNonceStore: new MemoryNonceStore(),
  declarationStore: new MemoryNonceStore(),
  contentStore: new MemoryContentStore(),
  contentEncryption: new ContentEncryption(randomBytes(32)),
  rateLimitStore: new MemoryRateLimitStore(),
});

await app.listen({ port, host: "127.0.0.1" });
const addr = app.server.address();
const actualPort = typeof addr === "object" && addr !== null ? addr.port : port;
const baseUrl = `http://127.0.0.1:${actualPort}`;
const apiBaseUrl = `${baseUrl}/api/v1`;
process.env.FOUNDATION_PUBLIC_BASE_URL = apiBaseUrl;

const org = await createEntity({ entity_type: "COMPANY", display_name: `${PREFIX}org_${randomUUID()}`, email: `${PREFIX}org_${randomUUID()}@niov.test`, public_key: "k", clearance_level: 0 });
const password = "correct-horse-battery-live-local";
const input = entityInput({ password });
const member = await createEntity(input);
await prisma.entityMembership.create({ data: { parent_id: org.entity_id, child_id: member.entity_id, is_active: true } });
const login = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: input.email, password, requested_operations: ["read", "write"] } });
if (login.statusCode !== 200) {
  // eslint-disable-next-line no-console
  console.error(`AVP live server: login failed (status ${login.statusCode}).`);
  await app.close();
  process.exit(1);
}
const token = (login.json() as { token: string }).token;

const meta = {
  base_url: baseUrl,
  api_base_url: apiBaseUrl,
  seed_endpoint: "/api/v1/foundation/avp2/admin/positive-smoke/seed",
  resource_id: "avp-positive-smoke.content-fragment",
  selector: "paragraph_range:12-15",
  token, // local-only; orchestrator reads then deletes this file. NEVER committed.
  token_file_created: true,
};
const metaPath = "/tmp/avp-live.json";
writeFileSync(metaPath, JSON.stringify(meta, null, 2), { mode: 0o600 });
chmodSync(metaPath, 0o600);

const shutdown = async (): Promise<void> => {
  try { await app.close(); } catch { /* non-fatal */ }
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// READY line carries base URLs only — NEVER the token.
// eslint-disable-next-line no-console
console.error(`AVP_LIVE_READY base_url=${baseUrl} api_base_url=${apiBaseUrl} token=[REDACTED] meta=${metaPath}`);
