// FILE: share-revoke.test.ts (integration)
// PURPOSE: End-to-end test for the COSMP SHARE and REVOKE flow.
//          Drives the full cycle through HTTP routes via Fastify's
//          inject(): create capsule, share with grantee, grantee
//          logs in, grantee negotiates, grantee reads metadata,
//          grantor revokes, grantee's next negotiate fails.
// CONNECTS TO: buildApp from @niov/api (which wires every service),
//              the NEGOTIATE / READ / WRITE / SHARE routes, and the
//              session / TAR / permission tables.

import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildApp,
  MemoryContentStore,
  MemoryNonceStore,
  MemoryRateLimitStore,
} from "@niov/api";
import { ContentEncryption } from "@niov/auth";
import { createEntity, prisma } from "@niov/database";
import {
  cleanupTestData,
  ensureAuditTriggers,
  makeEntityInput,
  withCleanRateLimits,
} from "../helpers.js";
import type { FastifyInstance } from "fastify";

const TEST_JWT_SECRET = "share-revoke-integration-secret";

let app: FastifyInstance;
let contentStore: MemoryContentStore;
// Per Track A Gate 5 Decision 3 D-1 + Decision 8 (Drift G5b-J):
// explicit MemoryRateLimitStore construction at module top level
// composes cleanly with withCleanRateLimits' value-capture
// semantics. Pre-G5.5 this file relied on makeDefaultRateLimitStore
// (the buildApp default), which produced a fresh store per app
// instance but offered no per-test reset hook. Per Drift G4-G:
// containerized Postgres runs ~37x faster than real Supabase, so
// rapid-fire test logins now collide with the auth rate limiter.
const store = new MemoryRateLimitStore();

beforeAll(async () => {
  await ensureAuditTriggers();
  await cleanupTestData();
  contentStore = new MemoryContentStore();
  app = await buildApp({
    jwtSecret: TEST_JWT_SECRET,
    sessionNonceStore: new MemoryNonceStore(),
    declarationStore: new MemoryNonceStore(),
    contentStore,
    contentEncryption: new ContentEncryption(randomBytes(32)),
    rateLimitStore: store,
  });
});

afterAll(async () => {
  await app.close();
  await cleanupTestData();
  await prisma.$disconnect();
});

// Reset the rate-limit store before every test in this file.
// Module-top placement covers all 6 tests (across all describe
// blocks) via vitest's beforeEach scoping.
withCleanRateLimits(store);

// WHAT: Create a PERSON entity with a known password, log them in,
//        and return everything the test needs to drive HTTP calls.
// INPUT: The Fastify app and the operations the session should
//        request.
// OUTPUT: { entity_id, email, password, token }.
// WHY: Saves boilerplate -- every test in this file starts with
//      "set up an entity that can drive HTTP".
async function makeUser(
  fastify: FastifyInstance,
  ops: string[] = ["read"],
): Promise<{ entity_id: string; email: string; password: string; token: string }> {
  const password = "correct-horse-battery";
  const input = makeEntityInput({ entity_type: "PERSON", password });
  const entity = await createEntity(input);
  const login = await fastify.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: {
      email: input.email,
      password,
      requested_operations: ops,
    },
  });
  expect(login.statusCode).toBe(200);
  const body = login.json() as { token: string };
  return {
    entity_id: entity.entity_id,
    email: input.email!,
    password,
    token: body.token,
  };
}

// WHAT: Re-login an existing entity to get a fresh token.
// INPUT: The Fastify app, the email + password, and the ops.
// OUTPUT: A new bearer token.
// WHY: Sessions get invalidated by share / revoke; tests need to
//      pick up a fresh token after either.
async function reLogin(
  fastify: FastifyInstance,
  email: string,
  password: string,
  ops: string[] = ["read"],
): Promise<string> {
  const login = await fastify.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email, password, requested_operations: ops },
  });
  expect(login.statusCode).toBe(200);
  return (login.json() as { token: string }).token;
}

describe("SHARE + REVOKE full cycle through HTTP", () => {
  it("create capsule -> share -> grantee logs in -> negotiates -> reads -> grantor revokes -> grantee's next negotiate fails", async () => {
    // STEP 1 -- owner sets up an account that can read+write+share.
    const owner = await makeUser(app, ["read", "write", "share"]);

    // STEP 2 -- owner creates a capsule via POST.
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/cosmp/capsule",
      headers: { authorization: `Bearer ${owner.token}` },
      payload: {
        capsule_type: "PREFERENCE",
        topic_tags: ["share-cycle"],
        payload_summary: "shareable test summary",
        content: "shareable test payload",
      },
    });
    expect(create.statusCode).toBe(201);
    const capsuleId = (create.json() as { capsule_id: string }).capsule_id;

    // STEP 3 -- grantee account exists (so we can target them).
    const grantee = await makeUser(app, ["read"]);

    // STEP 4 -- owner shares the capsule with the grantee.
    const share = await app.inject({
      method: "POST",
      url: "/api/v1/cosmp/share",
      headers: { authorization: `Bearer ${owner.token}` },
      payload: {
        grantee_entity_id: grantee.entity_id,
        capsule_grants: [
          {
            capsule_id: capsuleId,
            scope: "SUMMARY",
            duration_type: "TEMPORARY",
          },
        ],
      },
    });
    expect(share.statusCode).toBe(201);
    const shareBody = share.json() as {
      bridge_id: string;
      permissions_created: string[];
    };
    expect(shareBody.bridge_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(shareBody.permissions_created).toHaveLength(1);

    // STEP 5 -- grantee re-logs in (their pre-share session was just
    // invalidated by the share's invalidateEntitySessions step).
    const granteeToken = await reLogin(
      app,
      grantee.email,
      grantee.password,
      ["read"],
    );

    // STEP 6 -- grantee negotiates for the capsule.
    const negotiate = await app.inject({
      method: "POST",
      url: "/api/v1/cosmp/negotiate",
      headers: { authorization: `Bearer ${granteeToken}` },
      payload: { capsule_id: capsuleId, requested_scope: "SUMMARY" },
    });
    expect(negotiate.statusCode).toBe(200);
    const negotiateBody = negotiate.json() as {
      declaration_token: string;
    };

    // STEP 7 -- grantee reads metadata.
    const readMeta = await app.inject({
      method: "GET",
      url: `/api/v1/cosmp/capsule/${capsuleId}/metadata`,
      headers: {
        authorization: `Bearer ${granteeToken}`,
        "x-declaration-token": negotiateBody.declaration_token,
      },
    });
    expect(readMeta.statusCode).toBe(200);
    const metaBody = readMeta.json() as {
      metadata: { capsule_id: string };
    };
    expect(metaBody.metadata.capsule_id).toBe(capsuleId);

    // STEP 8 -- grantor revokes the share.
    const revoke = await app.inject({
      method: "DELETE",
      url: `/api/v1/cosmp/share/${shareBody.bridge_id}`,
      headers: { authorization: `Bearer ${owner.token}` },
    });
    expect(revoke.statusCode).toBe(200);
    const revokeBody = revoke.json() as { revoked_count: number };
    expect(revokeBody.revoked_count).toBe(1);

    // STEP 9 -- grantee's next action fails. The session they used
    // for STEP 6/7 was killed by the revoke; using it now must
    // fail with SESSION_INVALIDATED.
    const negotiateAfter = await app.inject({
      method: "POST",
      url: "/api/v1/cosmp/negotiate",
      headers: { authorization: `Bearer ${granteeToken}` },
      payload: { capsule_id: capsuleId, requested_scope: "SUMMARY" },
    });
    expect(negotiateAfter.statusCode).toBe(401);
    const failBody = negotiateAfter.json() as { code: string };
    expect(failBody.code).toBe("SESSION_INVALIDATED");

    // BONUS -- even if the grantee re-logs in, their new session
    // cannot negotiate this capsule because the permission is
    // REVOKED in the DB.
    const granteeFresh = await reLogin(
      app,
      grantee.email,
      grantee.password,
      ["read"],
    );
    const negotiateFresh = await app.inject({
      method: "POST",
      url: "/api/v1/cosmp/negotiate",
      headers: { authorization: `Bearer ${granteeFresh}` },
      payload: { capsule_id: capsuleId, requested_scope: "SUMMARY" },
    });
    expect(negotiateFresh.statusCode).toBe(403);
    const noPerm = negotiateFresh.json() as { code: string };
    expect(noPerm.code).toBe("NO_PERMISSION");
  });
});

describe("SHARE -- sovereignty edge cases", () => {
  it("rejects sharing a capsule the session entity does not own", async () => {
    const ownerA = await makeUser(app, ["read", "write", "share"]);
    const ownerB = await makeUser(app, ["read", "write", "share"]);
    const grantee = await makeUser(app, ["read"]);

    // ownerA creates a capsule.
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/cosmp/capsule",
      headers: { authorization: `Bearer ${ownerA.token}` },
      payload: {
        capsule_type: "PREFERENCE",
        topic_tags: ["not-mine"],
        payload_summary: "summary",
        content: "content",
      },
    });
    expect(create.statusCode).toBe(201);
    const capsuleId = (create.json() as { capsule_id: string }).capsule_id;

    // ownerB tries to share ownerA's capsule -- must fail.
    const share = await app.inject({
      method: "POST",
      url: "/api/v1/cosmp/share",
      headers: { authorization: `Bearer ${ownerB.token}` },
      payload: {
        grantee_entity_id: grantee.entity_id,
        capsule_grants: [
          { capsule_id: capsuleId, scope: "SUMMARY", duration_type: "TEMPORARY" },
        ],
      },
    });
    expect(share.statusCode).toBe(403);
    const body = share.json() as { code: string };
    expect(body.code).toBe("CAPSULES_NOT_OWNED");
  });

  it("rejects sharing when the grantee's clearance ceiling is below a capsule's required clearance", async () => {
    const owner = await makeUser(app, ["read", "write", "share"]);

    // Owner creates a high-clearance capsule (clearance_required=5).
    // Tested via direct DB update because POST does not accept a
    // custom clearance_required field today.
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/cosmp/capsule",
      headers: { authorization: `Bearer ${owner.token}` },
      payload: {
        capsule_type: "PREFERENCE",
        topic_tags: ["high-clearance"],
        payload_summary: "summary",
        content: "content",
      },
    });
    expect(create.statusCode).toBe(201);
    const capsuleId = (create.json() as { capsule_id: string }).capsule_id;
    await prisma.memoryCapsule.update({
      where: { capsule_id: capsuleId },
      data: { clearance_required: 5 },
    });

    // Grantee with a LOWER ceiling than the capsule requires.
    const password = "correct-horse-battery";
    const input = makeEntityInput({ entity_type: "PERSON", password });
    const grantee = await createEntity(input);
    await prisma.tokenAttributeRepository.update({
      where: { entity_id: grantee.entity_id },
      data: { clearance_ceiling: 1 },
    });

    const share = await app.inject({
      method: "POST",
      url: "/api/v1/cosmp/share",
      headers: { authorization: `Bearer ${owner.token}` },
      payload: {
        grantee_entity_id: grantee.entity_id,
        capsule_grants: [
          { capsule_id: capsuleId, scope: "SUMMARY", duration_type: "TEMPORARY" },
        ],
      },
    });
    expect(share.statusCode).toBe(403);
    const body = share.json() as {
      code: string;
      details?: { failed_capsules?: string[] };
    };
    expect(body.code).toBe("CLEARANCE_INSUFFICIENT_FOR_CAPSULES");
    expect(body.details?.failed_capsules).toContain(capsuleId);
  });

  it("returns 404 when the grantee entity does not exist", async () => {
    const owner = await makeUser(app, ["read", "write", "share"]);
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/cosmp/capsule",
      headers: { authorization: `Bearer ${owner.token}` },
      payload: {
        capsule_type: "PREFERENCE",
        topic_tags: ["x"],
        payload_summary: "summary",
        content: "content",
      },
    });
    const capsuleId = (create.json() as { capsule_id: string }).capsule_id;
    const share = await app.inject({
      method: "POST",
      url: "/api/v1/cosmp/share",
      headers: { authorization: `Bearer ${owner.token}` },
      payload: {
        grantee_entity_id: "00000000-0000-0000-0000-000000000000",
        capsule_grants: [
          { capsule_id: capsuleId, scope: "SUMMARY", duration_type: "TEMPORARY" },
        ],
      },
    });
    expect(share.statusCode).toBe(404);
    expect((share.json() as { code: string }).code).toBe("GRANTEE_NOT_FOUND");
  });
});

describe("REVOKE -- sovereignty edge cases", () => {
  it("returns 404 for a bridge_id that does not exist", async () => {
    const owner = await makeUser(app, ["read", "write", "share"]);
    const revoke = await app.inject({
      method: "DELETE",
      url: `/api/v1/cosmp/share/00000000-0000-0000-0000-000000000000`,
      headers: { authorization: `Bearer ${owner.token}` },
    });
    expect(revoke.statusCode).toBe(404);
    expect((revoke.json() as { code: string }).code).toBe("BRIDGE_NOT_FOUND");
  });

  it("rejects revoke when the session entity is not the original grantor", async () => {
    const owner = await makeUser(app, ["read", "write", "share"]);
    const intruder = await makeUser(app, ["read", "write", "share"]);
    const grantee = await makeUser(app, ["read"]);

    const create = await app.inject({
      method: "POST",
      url: "/api/v1/cosmp/capsule",
      headers: { authorization: `Bearer ${owner.token}` },
      payload: {
        capsule_type: "PREFERENCE",
        topic_tags: ["x"],
        payload_summary: "summary",
        content: "content",
      },
    });
    const capsuleId = (create.json() as { capsule_id: string }).capsule_id;
    const share = await app.inject({
      method: "POST",
      url: "/api/v1/cosmp/share",
      headers: { authorization: `Bearer ${owner.token}` },
      payload: {
        grantee_entity_id: grantee.entity_id,
        capsule_grants: [
          { capsule_id: capsuleId, scope: "SUMMARY", duration_type: "TEMPORARY" },
        ],
      },
    });
    const bridgeId = (share.json() as { bridge_id: string }).bridge_id;

    const revoke = await app.inject({
      method: "DELETE",
      url: `/api/v1/cosmp/share/${bridgeId}`,
      headers: { authorization: `Bearer ${intruder.token}` },
    });
    expect(revoke.statusCode).toBe(403);
    expect((revoke.json() as { code: string }).code).toBe("NOT_GRANTOR");
  });
});
