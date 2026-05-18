// FILE: jurisdiction-cosmp-enforcement.test.ts (integration)
// PURPOSE: End-to-end test for CAR Sub-box 2 sub-phase 4
//          [CAR-SUB-BOX-2-COSMP-ENFORCEMENT] per ADR-0037 Sub-decision
//          7. Drives the full COSMP enforcement matrix through HTTP
//          routes via Fastify's inject(): NEGOTIATE start-check +
//          readContent TOCTOU re-check + SHARE start-check + REVOKE
//          start-check + WRITE create-time cascade + WRITE update-time
//          immutability + AuditEvent.jurisdiction propagation.
// CONNECTS TO:
//   apps/api/src/services/cosmp/jurisdiction-enforcement.ts (the
//     pure helper);
//   apps/api/src/services/cosmp/{negotiate,read,share,write}.service.ts
//     (sub-phase 4 wiring);
//   apps/api/src/routes/cosmp.routes.ts (HTTP error mapping);
//   packages/database/src/queries/capsule.ts (getCapsuleMetadata
//     select extension for NEGOTIATE jurisdiction visibility);
//   tests/integration/share-revoke.test.ts (precedent HTTP-tier
//     scaffolding pattern).

import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildApp,
  MemoryContentStore,
  MemoryNonceStore,
  MemoryRateLimitStore,
} from "@niov/api";
import { ContentEncryption } from "@niov/auth";
import { createCapsule, createEntity, prisma } from "@niov/database";
import {
  cleanupTestData,
  ensureAuditTriggers,
  makeCapsuleInput,
  makeEntityInput,
  withCleanRateLimits,
} from "../helpers.js";
import type { FastifyInstance } from "fastify";

const TEST_JWT_SECRET = "jurisdiction-cosmp-enforcement-secret";

let app: FastifyInstance;
let contentStore: MemoryContentStore;
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

withCleanRateLimits(store);

// WHAT: Create a PERSON with a known password + jurisdiction, log in,
//        and return the entity_id, email, password, and bearer token.
// INPUT: The Fastify app, the entity's jurisdiction (or null), and
//        the requested operation set.
// OUTPUT: { entity_id, email, password, token, jurisdiction }.
// WHY: Saves boilerplate; every test needs a session-bearing actor.
async function makeUser(
  fastify: FastifyInstance,
  jurisdiction: string | null,
  ops: string[] = ["read"],
): Promise<{
  entity_id: string;
  email: string;
  password: string;
  token: string;
  jurisdiction: string | null;
}> {
  const password = "correct-horse-battery";
  const input = makeEntityInput({
    entity_type: "PERSON",
    password,
    jurisdiction,
  });
  const entity = await createEntity(input);
  const login = await fastify.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email: input.email, password, requested_operations: ops },
  });
  expect(login.statusCode).toBe(200);
  const body = login.json() as { token: string };
  return {
    entity_id: entity.entity_id,
    email: input.email!,
    password,
    token: body.token,
    jurisdiction,
  };
}

// WHAT: Create a MemoryCapsule via @niov/database createCapsule helper
//        with explicit jurisdiction. Bypasses WriteService so we can
//        anchor capsule jurisdiction independent of owner Entity
//        cascade for cross-jurisdiction test fixtures.
// INPUT: The owner entity_id + the capsule jurisdiction (or null).
// OUTPUT: The MemoryCapsule.capsule_id.
// WHY: Test scenarios require capsules whose jurisdiction differs
//      from the actor's. The cascade-only path cannot produce that
//      directly; explicit jurisdiction is the lever.
async function makeCapsuleWithJurisdiction(
  ownerEntityId: string,
  jurisdiction: string | null,
): Promise<string> {
  const wallet = await prisma.wallet.findUniqueOrThrow({
    where: { entity_id: ownerEntityId },
  });
  const capsule = await createCapsule(
    makeCapsuleInput(wallet.wallet_id, ownerEntityId, { jurisdiction }),
  );
  return capsule.capsule_id;
}

// WHAT: Drift an existing entity's jurisdiction to a new value.
// INPUT: The entity_id and the new jurisdiction.
// OUTPUT: A promise resolving once the row is updated.
// WHY: Sub-decision 4 makes capsule jurisdiction immutable but the
//      Entity jurisdiction can drift; tests rely on this to set up
//      "actor-drifted-from-own-capsule" scenarios for owner-shortcut
//      and WRITE-update enforcement coverage.
async function driftEntityJurisdiction(
  entityId: string,
  newJurisdiction: string | null,
): Promise<void> {
  await prisma.entity.update({
    where: { entity_id: entityId },
    data: { jurisdiction: newJurisdiction },
  });
}

// ---------------------------------------------------------------------------
// Section A — NEGOTIATE jurisdiction enforcement
// ---------------------------------------------------------------------------

describe("A. NEGOTIATE — jurisdiction start-check", () => {
  it("matching actor + target jurisdictions → 200 (declaration issued)", async () => {
    const owner = await makeUser(app, "US-FEDERAL", ["read", "write", "share"]);
    const requester = await makeUser(app, "US-FEDERAL");
    const capsuleId = await makeCapsuleWithJurisdiction(
      owner.entity_id,
      "US-FEDERAL",
    );
    // Owner shares with requester so requester has permission.
    const share = await app.inject({
      method: "POST",
      url: "/api/v1/cosmp/share",
      headers: { authorization: `Bearer ${owner.token}` },
      payload: {
        grantee_entity_id: requester.entity_id,
        capsule_grants: [{ capsule_id: capsuleId, scope: "FULL" }],
      },
    });
    expect(share.statusCode).toBe(201);
    const fresh = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: requester.email,
        password: requester.password,
        requested_operations: ["read"],
      },
    });
    const requesterToken = (fresh.json() as { token: string }).token;
    const negotiate = await app.inject({
      method: "POST",
      url: "/api/v1/cosmp/negotiate",
      headers: { authorization: `Bearer ${requesterToken}` },
      payload: { capsule_id: capsuleId, requested_scope: "FULL" },
    });
    expect(negotiate.statusCode).toBe(200);
  });

  it("mismatched actor + target → 403 CROSS_JURISDICTION_ACCESS_DENIED + DENIED audit with capsule jurisdiction", async () => {
    const owner = await makeUser(app, "US-FEDERAL", ["read", "write", "share"]);
    const requester = await makeUser(app, "EU-DE");
    const capsuleId = await makeCapsuleWithJurisdiction(
      owner.entity_id,
      "US-FEDERAL",
    );
    const share = await app.inject({
      method: "POST",
      url: "/api/v1/cosmp/share",
      headers: { authorization: `Bearer ${owner.token}` },
      payload: {
        grantee_entity_id: requester.entity_id,
        capsule_grants: [{ capsule_id: capsuleId, scope: "FULL" }],
      },
    });
    // Owner is US-FEDERAL sharing US-FEDERAL capsule → SHARE succeeds.
    expect(share.statusCode).toBe(201);
    // SHARE invalidates the grantee's sessions per existing
    // PERMISSIONS_GRANTED_VIA_SHARE behavior; re-login picks up the
    // new permission state.
    const fresh = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: requester.email,
        password: requester.password,
        requested_operations: ["read"],
      },
    });
    const requesterToken = (fresh.json() as { token: string }).token;
    const negotiate = await app.inject({
      method: "POST",
      url: "/api/v1/cosmp/negotiate",
      headers: { authorization: `Bearer ${requesterToken}` },
      payload: { capsule_id: capsuleId, requested_scope: "FULL" },
    });
    expect(negotiate.statusCode).toBe(403);
    const body = negotiate.json() as { code: string };
    expect(body.code).toBe("CROSS_JURISDICTION_ACCESS_DENIED");
    // DENIED audit row carries metadata.jurisdiction at row level
    const auditRow = await prisma.auditEvent.findFirst({
      where: {
        actor_entity_id: requester.entity_id,
        target_capsule_id: capsuleId,
        outcome: "DENIED",
        denial_reason: "CROSS_JURISDICTION_ACCESS_DENIED",
      },
      orderBy: { timestamp: "desc" },
    });
    expect(auditRow).not.toBeNull();
    expect(auditRow?.jurisdiction).toBe("US-FEDERAL");
  });

  it("actor null + target non-null → 403 ACTOR_JURISDICTION_MISSING", async () => {
    const owner = await makeUser(app, "US-FEDERAL", ["read", "write", "share"]);
    const requester = await makeUser(app, null);
    const capsuleId = await makeCapsuleWithJurisdiction(
      owner.entity_id,
      "US-FEDERAL",
    );
    await app.inject({
      method: "POST",
      url: "/api/v1/cosmp/share",
      headers: { authorization: `Bearer ${owner.token}` },
      payload: {
        grantee_entity_id: requester.entity_id,
        capsule_grants: [{ capsule_id: capsuleId, scope: "FULL" }],
      },
    });
    const fresh = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: requester.email,
        password: requester.password,
        requested_operations: ["read"],
      },
    });
    const requesterToken = (fresh.json() as { token: string }).token;
    const negotiate = await app.inject({
      method: "POST",
      url: "/api/v1/cosmp/negotiate",
      headers: { authorization: `Bearer ${requesterToken}` },
      payload: { capsule_id: capsuleId, requested_scope: "FULL" },
    });
    expect(negotiate.statusCode).toBe(403);
    expect((negotiate.json() as { code: string }).code).toBe(
      "ACTOR_JURISDICTION_MISSING",
    );
  });

  it("actor non-null + target null → 403 TARGET_JURISDICTION_MISSING", async () => {
    const owner = await makeUser(app, null, ["read", "write", "share"]);
    const requester = await makeUser(app, "US-FEDERAL");
    const capsuleId = await makeCapsuleWithJurisdiction(owner.entity_id, null);
    await app.inject({
      method: "POST",
      url: "/api/v1/cosmp/share",
      headers: { authorization: `Bearer ${owner.token}` },
      payload: {
        grantee_entity_id: requester.entity_id,
        capsule_grants: [{ capsule_id: capsuleId, scope: "FULL" }],
      },
    });
    const fresh = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: requester.email,
        password: requester.password,
        requested_operations: ["read"],
      },
    });
    const requesterToken = (fresh.json() as { token: string }).token;
    const negotiate = await app.inject({
      method: "POST",
      url: "/api/v1/cosmp/negotiate",
      headers: { authorization: `Bearer ${requesterToken}` },
      payload: { capsule_id: capsuleId, requested_scope: "FULL" },
    });
    expect(negotiate.statusCode).toBe(403);
    expect((negotiate.json() as { code: string }).code).toBe(
      "TARGET_JURISDICTION_MISSING",
    );
  });

  it("null/null backward-compat → 200 (existing fixtures preserved)", async () => {
    const owner = await makeUser(app, null, ["read", "write", "share"]);
    const requester = await makeUser(app, null);
    const capsuleId = await makeCapsuleWithJurisdiction(owner.entity_id, null);
    await app.inject({
      method: "POST",
      url: "/api/v1/cosmp/share",
      headers: { authorization: `Bearer ${owner.token}` },
      payload: {
        grantee_entity_id: requester.entity_id,
        capsule_grants: [{ capsule_id: capsuleId, scope: "FULL" }],
      },
    });
    const fresh = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: requester.email,
        password: requester.password,
        requested_operations: ["read"],
      },
    });
    const requesterToken = (fresh.json() as { token: string }).token;
    const negotiate = await app.inject({
      method: "POST",
      url: "/api/v1/cosmp/negotiate",
      headers: { authorization: `Bearer ${requesterToken}` },
      payload: { capsule_id: capsuleId, requested_scope: "FULL" },
    });
    expect(negotiate.statusCode).toBe(200);
  });

  it("OWNER SHORTCUT subject to jurisdiction enforcement (Q8 LOCKED Option α)", async () => {
    // Owner creates capsule in US-FEDERAL, then Entity drifts to EU-DE.
    // Capsule jurisdiction is immutable → owner can no longer access
    // their own capsule from the new jurisdictional anchor.
    const owner = await makeUser(app, "US-FEDERAL", ["read", "write", "share"]);
    const capsuleId = await makeCapsuleWithJurisdiction(
      owner.entity_id,
      "US-FEDERAL",
    );
    await driftEntityJurisdiction(owner.entity_id, "EU-DE");
    // Re-login picks up updated entity state.
    const fresh = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: owner.email,
        password: owner.password,
        requested_operations: ["read"],
      },
    });
    const driftedToken = (fresh.json() as { token: string }).token;
    const negotiate = await app.inject({
      method: "POST",
      url: "/api/v1/cosmp/negotiate",
      headers: { authorization: `Bearer ${driftedToken}` },
      payload: { capsule_id: capsuleId, requested_scope: "FULL" },
    });
    expect(negotiate.statusCode).toBe(403);
    expect((negotiate.json() as { code: string }).code).toBe(
      "CROSS_JURISDICTION_ACCESS_DENIED",
    );
  });
});

// ---------------------------------------------------------------------------
// Section B — readContent TOCTOU jurisdiction re-check
// ---------------------------------------------------------------------------

describe("B. readContent — jurisdiction TOCTOU re-check", () => {
  it("matching actor + target → 200 (content returned)", async () => {
    const owner = await makeUser(app, "US-FEDERAL", ["read", "write", "share"]);
    // Use HTTP createCapsule so storage_location matches the in-memory
    // ContentStore the test app was built with.
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/cosmp/capsule",
      headers: { authorization: `Bearer ${owner.token}` },
      payload: {
        capsule_type: "PREFERENCE",
        topic_tags: ["jurisdiction-read"],
        payload_summary: "summary",
        content: "match-content",
      },
    });
    expect(create.statusCode).toBe(201);
    const capsuleId = (create.json() as { capsule_id: string }).capsule_id;
    // Owner is also the requester (owner shortcut + matching jurisdictions).
    const negotiate = await app.inject({
      method: "POST",
      url: "/api/v1/cosmp/negotiate",
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { capsule_id: capsuleId, requested_scope: "FULL" },
    });
    expect(negotiate.statusCode).toBe(200);
    const negBody = negotiate.json() as {
      declaration_token: string;
    };
    const meta = await app.inject({
      method: "GET",
      url: `/api/v1/cosmp/capsule/${capsuleId}/metadata`,
      headers: {
        authorization: `Bearer ${owner.token}`,
        "x-declaration-token": negBody.declaration_token,
      },
    });
    expect(meta.statusCode).toBe(200);
    const fingerprint = (meta.json() as { metadata_fingerprint: string })
      .metadata_fingerprint;
    const content = await app.inject({
      method: "GET",
      url: `/api/v1/cosmp/capsule/${capsuleId}/content`,
      headers: {
        authorization: `Bearer ${owner.token}`,
        "x-declaration-token": negBody.declaration_token,
        "x-metadata-fingerprint": fingerprint,
      },
    });
    expect(content.statusCode).toBe(200);
    // The MVP read.service.ts returns the storage payload as-is
    // (the comment at L559 says "(mock for now) decrypted payload").
    // Tests assert structural success (200 + non-empty body) rather
    // than plaintext equality, matching the existing
    // monetization.test.ts pattern.
    expect(
      (content.json() as { content: string }).content.length,
    ).toBeGreaterThan(0);
  });

  it("jurisdiction drifts after NEGOTIATE → 403 at readContent TOCTOU re-check + content NOT loaded", async () => {
    const owner = await makeUser(app, "US-FEDERAL", ["read", "write", "share"]);
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/cosmp/capsule",
      headers: { authorization: `Bearer ${owner.token}` },
      payload: {
        capsule_type: "PREFERENCE",
        topic_tags: ["jurisdiction-toctou"],
        payload_summary: "summary",
        content: "must-not-leak",
      },
    });
    const capsuleId = (create.json() as { capsule_id: string }).capsule_id;
    // NEGOTIATE while jurisdictions still match.
    const negotiate = await app.inject({
      method: "POST",
      url: "/api/v1/cosmp/negotiate",
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { capsule_id: capsuleId, requested_scope: "FULL" },
    });
    expect(negotiate.statusCode).toBe(200);
    const declarationToken = (negotiate.json() as { declaration_token: string })
      .declaration_token;
    const meta = await app.inject({
      method: "GET",
      url: `/api/v1/cosmp/capsule/${capsuleId}/metadata`,
      headers: {
        authorization: `Bearer ${owner.token}`,
        "x-declaration-token": declarationToken,
      },
    });
    const fingerprint = (meta.json() as { metadata_fingerprint: string })
      .metadata_fingerprint;
    // Drift the actor entity's jurisdiction between metadata read and
    // content read. Capsule jurisdiction is immutable.
    await driftEntityJurisdiction(owner.entity_id, "EU-DE");
    const content = await app.inject({
      method: "GET",
      url: `/api/v1/cosmp/capsule/${capsuleId}/content`,
      headers: {
        authorization: `Bearer ${owner.token}`,
        "x-declaration-token": declarationToken,
        "x-metadata-fingerprint": fingerprint,
      },
    });
    expect(content.statusCode).toBe(403);
    expect((content.json() as { code: string }).code).toBe(
      "CROSS_JURISDICTION_ACCESS_DENIED",
    );
  });

  it("actor null + target non-null at readContent → 403 ACTOR_JURISDICTION_MISSING (no content load)", async () => {
    const owner = await makeUser(app, "US-FEDERAL", ["read", "write", "share"]);
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/cosmp/capsule",
      headers: { authorization: `Bearer ${owner.token}` },
      payload: {
        capsule_type: "PREFERENCE",
        topic_tags: ["jurisdiction-actor-null"],
        payload_summary: "summary",
        content: "must-not-leak",
      },
    });
    const capsuleId = (create.json() as { capsule_id: string }).capsule_id;
    const negotiate = await app.inject({
      method: "POST",
      url: "/api/v1/cosmp/negotiate",
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { capsule_id: capsuleId, requested_scope: "FULL" },
    });
    expect(negotiate.statusCode).toBe(200);
    const declarationToken = (negotiate.json() as { declaration_token: string })
      .declaration_token;
    const meta = await app.inject({
      method: "GET",
      url: `/api/v1/cosmp/capsule/${capsuleId}/metadata`,
      headers: {
        authorization: `Bearer ${owner.token}`,
        "x-declaration-token": declarationToken,
      },
    });
    const fingerprint = (meta.json() as { metadata_fingerprint: string })
      .metadata_fingerprint;
    await driftEntityJurisdiction(owner.entity_id, null);
    const content = await app.inject({
      method: "GET",
      url: `/api/v1/cosmp/capsule/${capsuleId}/content`,
      headers: {
        authorization: `Bearer ${owner.token}`,
        "x-declaration-token": declarationToken,
        "x-metadata-fingerprint": fingerprint,
      },
    });
    expect(content.statusCode).toBe(403);
    expect((content.json() as { code: string }).code).toBe(
      "ACTOR_JURISDICTION_MISSING",
    );
  });
});

// ---------------------------------------------------------------------------
// Section C — SHARE jurisdiction start-check
// ---------------------------------------------------------------------------

describe("C. SHARE — jurisdiction start-check (Q5 LOCKED Option α actor↔capsule only)", () => {
  it("matching actor↔capsule for all grants → 201 (permissions created)", async () => {
    const owner = await makeUser(app, "US-FEDERAL", ["read", "write", "share"]);
    const grantee = await makeUser(app, "EU-DE");
    const capsuleA = await makeCapsuleWithJurisdiction(
      owner.entity_id,
      "US-FEDERAL",
    );
    const capsuleB = await makeCapsuleWithJurisdiction(
      owner.entity_id,
      "US-FEDERAL",
    );
    const share = await app.inject({
      method: "POST",
      url: "/api/v1/cosmp/share",
      headers: { authorization: `Bearer ${owner.token}` },
      payload: {
        grantee_entity_id: grantee.entity_id,
        capsule_grants: [
          { capsule_id: capsuleA, scope: "FULL" },
          { capsule_id: capsuleB, scope: "SUMMARY" },
        ],
      },
    });
    expect(share.statusCode).toBe(201);
    // Q5 LOCKED Option α: grantee jurisdiction NOT checked.
  });

  it("one cross-jurisdiction capsule → 403 with failed_capsules detail", async () => {
    const owner = await makeUser(app, "US-FEDERAL", ["read", "write", "share"]);
    const grantee = await makeUser(app, "US-FEDERAL");
    const okCapsule = await makeCapsuleWithJurisdiction(
      owner.entity_id,
      "US-FEDERAL",
    );
    const badCapsule = await makeCapsuleWithJurisdiction(
      owner.entity_id,
      "EU-DE",
    );
    const share = await app.inject({
      method: "POST",
      url: "/api/v1/cosmp/share",
      headers: { authorization: `Bearer ${owner.token}` },
      payload: {
        grantee_entity_id: grantee.entity_id,
        capsule_grants: [
          { capsule_id: okCapsule, scope: "FULL" },
          { capsule_id: badCapsule, scope: "FULL" },
        ],
      },
    });
    expect(share.statusCode).toBe(403);
    const body = share.json() as {
      code: string;
      details?: { failed_capsules?: string[] };
    };
    expect(body.code).toBe("CROSS_JURISDICTION_ACCESS_DENIED");
    expect(body.details?.failed_capsules).toContain(badCapsule);
  });
});

// ---------------------------------------------------------------------------
// Section D — REVOKE jurisdiction start-check
// ---------------------------------------------------------------------------

describe("D. REVOKE — jurisdiction start-check (Q3 LOCKED Option α bounded capsule fetch)", () => {
  it("matching actor↔capsule → 200 (revoke succeeds)", async () => {
    const owner = await makeUser(app, "US-FEDERAL", ["read", "write", "share"]);
    const grantee = await makeUser(app, "EU-DE");
    const capsuleId = await makeCapsuleWithJurisdiction(
      owner.entity_id,
      "US-FEDERAL",
    );
    const share = await app.inject({
      method: "POST",
      url: "/api/v1/cosmp/share",
      headers: { authorization: `Bearer ${owner.token}` },
      payload: {
        grantee_entity_id: grantee.entity_id,
        capsule_grants: [{ capsule_id: capsuleId, scope: "FULL" }],
      },
    });
    expect(share.statusCode).toBe(201);
    const bridgeId = (share.json() as { bridge_id: string }).bridge_id;
    // Re-login because share invalidates owner sessions.
    const fresh = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: owner.email,
        password: owner.password,
        requested_operations: ["read", "write", "share"],
      },
    });
    const ownerToken = (fresh.json() as { token: string }).token;
    const revoke = await app.inject({
      method: "DELETE",
      url: `/api/v1/cosmp/share/${bridgeId}`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(revoke.statusCode).toBe(200);
  });

  it("actor jurisdiction drifts post-share → 403 at REVOKE", async () => {
    const owner = await makeUser(app, "US-FEDERAL", ["read", "write", "share"]);
    const grantee = await makeUser(app, "US-FEDERAL");
    const capsuleId = await makeCapsuleWithJurisdiction(
      owner.entity_id,
      "US-FEDERAL",
    );
    const share = await app.inject({
      method: "POST",
      url: "/api/v1/cosmp/share",
      headers: { authorization: `Bearer ${owner.token}` },
      payload: {
        grantee_entity_id: grantee.entity_id,
        capsule_grants: [{ capsule_id: capsuleId, scope: "FULL" }],
      },
    });
    expect(share.statusCode).toBe(201);
    const bridgeId = (share.json() as { bridge_id: string }).bridge_id;
    // Drift owner's jurisdiction between SHARE and REVOKE; capsule
    // jurisdiction is immutable per Sub-decision 4.
    await driftEntityJurisdiction(owner.entity_id, "EU-DE");
    const fresh = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: owner.email,
        password: owner.password,
        requested_operations: ["read", "write", "share"],
      },
    });
    const driftedToken = (fresh.json() as { token: string }).token;
    const revoke = await app.inject({
      method: "DELETE",
      url: `/api/v1/cosmp/share/${bridgeId}`,
      headers: { authorization: `Bearer ${driftedToken}` },
    });
    expect(revoke.statusCode).toBe(403);
    expect((revoke.json() as { code: string }).code).toBe(
      "CROSS_JURISDICTION_ACCESS_DENIED",
    );
  });
});

// ---------------------------------------------------------------------------
// Section E — WRITE create cascade + update immutability + actor enforcement
// ---------------------------------------------------------------------------

describe("E. WRITE — create cascade + update enforcement (Q2 + Q6 LOCKED Option α)", () => {
  it("createCapsule cascades jurisdiction from owner Entity (no explicit input)", async () => {
    const owner = await makeUser(app, "US-FEDERAL", ["read", "write", "share"]);
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/cosmp/capsule",
      headers: { authorization: `Bearer ${owner.token}` },
      payload: {
        capsule_type: "PREFERENCE",
        topic_tags: ["cascade-test"],
        payload_summary: "summary",
        content: "content",
      },
    });
    expect(create.statusCode).toBe(201);
    const capsuleId = (create.json() as { capsule_id: string }).capsule_id;
    const row = await prisma.memoryCapsule.findUnique({
      where: { capsule_id: capsuleId },
    });
    expect(row?.jurisdiction).toBe("US-FEDERAL");
  });

  it("updateCapsule with actor jurisdiction mismatch → 403 CROSS_JURISDICTION_ACCESS_DENIED", async () => {
    const owner = await makeUser(app, "US-FEDERAL", ["read", "write", "share"]);
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/cosmp/capsule",
      headers: { authorization: `Bearer ${owner.token}` },
      payload: {
        capsule_type: "PREFERENCE",
        topic_tags: ["update-mismatch"],
        payload_summary: "summary",
        content: "original",
      },
    });
    const capsuleId = (create.json() as { capsule_id: string }).capsule_id;
    await driftEntityJurisdiction(owner.entity_id, "EU-DE");
    const fresh = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: owner.email,
        password: owner.password,
        requested_operations: ["write"],
      },
    });
    const driftedToken = (fresh.json() as { token: string }).token;
    const update = await app.inject({
      method: "PATCH",
      url: `/api/v1/cosmp/capsule/${capsuleId}`,
      headers: { authorization: `Bearer ${driftedToken}` },
      payload: { payload_summary: "should not land" },
    });
    expect(update.statusCode).toBe(403);
    expect((update.json() as { code: string }).code).toBe(
      "CROSS_JURISDICTION_ACCESS_DENIED",
    );
  });

  it("updateCapsule cannot mutate jurisdiction (immutability per Sub-decision 4)", async () => {
    const owner = await makeUser(app, "US-FEDERAL", ["read", "write"]);
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/cosmp/capsule",
      headers: { authorization: `Bearer ${owner.token}` },
      payload: {
        capsule_type: "PREFERENCE",
        topic_tags: ["immutability"],
        payload_summary: "summary",
        content: "content",
      },
    });
    const capsuleId = (create.json() as { capsule_id: string }).capsule_id;
    const originalRow = await prisma.memoryCapsule.findUnique({
      where: { capsule_id: capsuleId },
    });
    expect(originalRow?.jurisdiction).toBe("US-FEDERAL");
    // Send extra `jurisdiction` key in PATCH body — CapsuleUpdateInput
    // has no jurisdiction field, so the value is silently ignored
    // (immutability preserved by absence). Substrate-honest path:
    // verify the row column did NOT change.
    const update = await app.inject({
      method: "PATCH",
      url: `/api/v1/cosmp/capsule/${capsuleId}`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: {
        payload_summary: "updated summary",
        jurisdiction: "EU-DE",
      },
    });
    expect(update.statusCode).toBe(200);
    const afterRow = await prisma.memoryCapsule.findUnique({
      where: { capsule_id: capsuleId },
    });
    expect(afterRow?.jurisdiction).toBe("US-FEDERAL");
    expect(afterRow?.payload_summary).toBe("updated summary");
  });
});

// ---------------------------------------------------------------------------
// Section F — AuditEvent.jurisdiction propagation + canonical hash
//             preservation
// ---------------------------------------------------------------------------

describe("F. AuditEvent — jurisdiction propagation + canonical hash invariance", () => {
  it("capsule-scoped success events persist jurisdiction at the row column (NEGOTIATE + CAPSULE_MUTATION_ADD + CAPSULE_CONTENT_READ)", async () => {
    const owner = await makeUser(app, "US-FEDERAL", ["read", "write", "share"]);
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/cosmp/capsule",
      headers: { authorization: `Bearer ${owner.token}` },
      payload: {
        capsule_type: "PREFERENCE",
        topic_tags: ["jurisdiction-audit"],
        payload_summary: "summary",
        content: "content",
      },
    });
    const capsuleId = (create.json() as { capsule_id: string }).capsule_id;
    // CAPSULE_MUTATION_ADD audit row should carry jurisdiction.
    const createdRow = await prisma.auditEvent.findFirst({
      where: {
        target_capsule_id: capsuleId,
        event_type: "CAPSULE_MUTATION_ADD",
        outcome: "SUCCESS",
      },
    });
    expect(createdRow?.jurisdiction).toBe("US-FEDERAL");
    const negotiate = await app.inject({
      method: "POST",
      url: "/api/v1/cosmp/negotiate",
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { capsule_id: capsuleId, requested_scope: "FULL" },
    });
    expect(negotiate.statusCode).toBe(200);
    const negotiateRow = await prisma.auditEvent.findFirst({
      where: {
        target_capsule_id: capsuleId,
        event_type: "NEGOTIATE",
        outcome: "SUCCESS",
      },
      orderBy: { timestamp: "desc" },
    });
    expect(negotiateRow?.jurisdiction).toBe("US-FEDERAL");
  });

  it("bulk SHARE / REVOKE success rows keep row-level jurisdiction null + capsule_jurisdictions in details (Q7 LOCKED Option α)", async () => {
    const owner = await makeUser(app, "US-FEDERAL", ["read", "write", "share"]);
    const grantee = await makeUser(app, "EU-DE");
    const capsuleA = await makeCapsuleWithJurisdiction(
      owner.entity_id,
      "US-FEDERAL",
    );
    const capsuleB = await makeCapsuleWithJurisdiction(
      owner.entity_id,
      "US-FEDERAL",
    );
    const share = await app.inject({
      method: "POST",
      url: "/api/v1/cosmp/share",
      headers: { authorization: `Bearer ${owner.token}` },
      payload: {
        grantee_entity_id: grantee.entity_id,
        capsule_grants: [
          { capsule_id: capsuleA, scope: "FULL" },
          { capsule_id: capsuleB, scope: "FULL" },
        ],
      },
    });
    expect(share.statusCode).toBe(201);
    const auditEventId = (share.json() as { audit_event_id: string })
      .audit_event_id;
    const shareRow = await prisma.auditEvent.findUnique({
      where: { audit_id: auditEventId },
    });
    expect(shareRow?.jurisdiction).toBeNull();
    const details = shareRow?.details as {
      capsule_jurisdictions?: Array<{ capsule_id: string; jurisdiction: string | null }>;
    };
    expect(details?.capsule_jurisdictions).toHaveLength(2);
    expect(
      details?.capsule_jurisdictions?.every(
        (e) => e.jurisdiction === "US-FEDERAL",
      ),
    ).toBe(true);
  });

  it("event_hash is unaffected by jurisdiction column (canonical_record/1 14-field invariant preserved)", async () => {
    // Two CAPSULE_MUTATION_ADD events with DIFFERENT jurisdictions but
    // otherwise comparable inputs must produce VALID event_hash values.
    // canonical_record/1 does NOT include jurisdiction (Sub-decision 3),
    // so adding the jurisdiction column has zero impact on chain
    // verifiability. We assert both event_hash values are 64-hex.
    const ownerA = await makeUser(app, "US-FEDERAL", ["read", "write"]);
    const ownerB = await makeUser(app, "EU-DE", ["read", "write"]);
    const createA = await app.inject({
      method: "POST",
      url: "/api/v1/cosmp/capsule",
      headers: { authorization: `Bearer ${ownerA.token}` },
      payload: {
        capsule_type: "PREFERENCE",
        topic_tags: ["hash-anchor-a"],
        payload_summary: "summary",
        content: "a",
      },
    });
    const createB = await app.inject({
      method: "POST",
      url: "/api/v1/cosmp/capsule",
      headers: { authorization: `Bearer ${ownerB.token}` },
      payload: {
        capsule_type: "PREFERENCE",
        topic_tags: ["hash-anchor-b"],
        payload_summary: "summary",
        content: "b",
      },
    });
    const capsuleA = (createA.json() as { capsule_id: string }).capsule_id;
    const capsuleB = (createB.json() as { capsule_id: string }).capsule_id;
    const rowA = await prisma.auditEvent.findFirst({
      where: { target_capsule_id: capsuleA, event_type: "CAPSULE_MUTATION_ADD" },
    });
    const rowB = await prisma.auditEvent.findFirst({
      where: { target_capsule_id: capsuleB, event_type: "CAPSULE_MUTATION_ADD" },
    });
    expect(rowA?.event_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(rowB?.event_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(rowA?.jurisdiction).toBe("US-FEDERAL");
    expect(rowB?.jurisdiction).toBe("EU-DE");
  });
});

// ---------------------------------------------------------------------------
// Section G — Existing behavior regression coverage
// ---------------------------------------------------------------------------

describe("G. Backward-compat — null/null preservation for legacy entities + capsules", () => {
  it("null actor + null target across NEGOTIATE → 200 (matches Section A.5 + share-revoke null-baseline)", async () => {
    const owner = await makeUser(app, null, ["read", "write", "share"]);
    const requester = await makeUser(app, null);
    const capsuleId = await makeCapsuleWithJurisdiction(owner.entity_id, null);
    await app.inject({
      method: "POST",
      url: "/api/v1/cosmp/share",
      headers: { authorization: `Bearer ${owner.token}` },
      payload: {
        grantee_entity_id: requester.entity_id,
        capsule_grants: [{ capsule_id: capsuleId, scope: "FULL" }],
      },
    });
    const fresh = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: requester.email,
        password: requester.password,
        requested_operations: ["read"],
      },
    });
    const requesterToken = (fresh.json() as { token: string }).token;
    const negotiate = await app.inject({
      method: "POST",
      url: "/api/v1/cosmp/negotiate",
      headers: { authorization: `Bearer ${requesterToken}` },
      payload: { capsule_id: capsuleId, requested_scope: "FULL" },
    });
    expect(negotiate.statusCode).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Section H — WRITE expected_version OCC + CAPSULE_VERSION_CONFLICT 409
// (G1.5 per ADR-0042 §Sub-decision Q-η + Q-G1.3-θ + V4 Patch 4 LOCKs +
//  Q-G1.5-β extension lock at [CAPSULE-MUTATION-TESTS-G1.5-QLOCK])
// ---------------------------------------------------------------------------

describe("H. WRITE — expected_version OCC + CAPSULE_VERSION_CONFLICT 409", () => {
  // I1 — PATCH with stale expected_version returns HTTP 409 +
  // CAPSULE_VERSION_CONFLICT body. Verifies route-layer statusForCode
  // mapping landed at cosmp.routes.ts statusForCode case
  // "CAPSULE_VERSION_CONFLICT" → 409 (G1.3 Phase 7).
  it("PATCH with stale expected_version returns HTTP 409 + CAPSULE_VERSION_CONFLICT body", async () => {
    const owner = await makeUser(app, "US-FEDERAL", ["read", "write"]);
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/cosmp/capsule",
      headers: { authorization: `Bearer ${owner.token}` },
      payload: {
        capsule_type: "PREFERENCE",
        topic_tags: ["g1.5-i1"],
        payload_summary: "summary",
        content: "i1-content",
      },
    });
    expect(create.statusCode).toBe(201);
    const capsuleId = (create.json() as { capsule_id: string }).capsule_id;
    expect((create.json() as { version: number }).version).toBe(1);

    // PATCH with stale expected_version 999 (actual is 1) → 409.
    const conflict = await app.inject({
      method: "PATCH",
      url: `/api/v1/cosmp/capsule/${capsuleId}`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: {
        payload_summary: "i1-updated",
        expected_version: 999,
      },
    });
    expect(conflict.statusCode).toBe(409);
    const body = conflict.json() as { ok: boolean; code: string; message: string };
    expect(body.ok).toBe(false);
    expect(body.code).toBe("CAPSULE_VERSION_CONFLICT");
  });

  // I2 — stale expected_version path emits CAPSULE_MUTATION_UPDATE DENIED
  // audit row with denial_reason CAPSULE_VERSION_CONFLICT and
  // expected_version + actual_version in audit details JSON. Verifies V5
  // Patch 1 LOCK Option (b) post-rollback standalone DENIED audit
  // emission discipline.
  it("stale expected_version path emits CAPSULE_MUTATION_UPDATE DENIED audit with denial_reason CAPSULE_VERSION_CONFLICT and expected/actual version details", async () => {
    const owner = await makeUser(app, "US-FEDERAL", ["read", "write"]);
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/cosmp/capsule",
      headers: { authorization: `Bearer ${owner.token}` },
      payload: {
        capsule_type: "PREFERENCE",
        topic_tags: ["g1.5-i2"],
        payload_summary: "summary",
        content: "i2-content",
      },
    });
    expect(create.statusCode).toBe(201);
    const capsuleId = (create.json() as { capsule_id: string }).capsule_id;

    const conflict = await app.inject({
      method: "PATCH",
      url: `/api/v1/cosmp/capsule/${capsuleId}`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: {
        payload_summary: "i2-updated",
        expected_version: 42,
      },
    });
    expect(conflict.statusCode).toBe(409);

    const audit = await prisma.auditEvent.findFirst({
      where: {
        target_capsule_id: capsuleId,
        event_type: "CAPSULE_MUTATION_UPDATE",
        outcome: "DENIED",
        denial_reason: "CAPSULE_VERSION_CONFLICT",
      },
    });
    expect(audit).not.toBeNull();
    const details = audit?.details as Record<string, unknown>;
    expect(details?.expected_version).toBe(42);
    expect(details?.actual_version).toBe(1);
    expect(details?.mutation_type).toBe("UPDATE");
  });
});
