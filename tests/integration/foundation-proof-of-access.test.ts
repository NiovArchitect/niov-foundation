// FILE: foundation-proof-of-access.test.ts (integration)
// PURPOSE: Phase 1289-A.1 — HTTP coverage for the Memory Capsule
//          proof-of-access endpoint. Proves: auth required; an owner gets a
//          proof (is_owner + can_read_now + honest notes); a caller with no
//          ownership and no permission gets enumeration-safe CAPSULE_NOT_FOUND;
//          a grantee's proof reflects ACTIVE then REVOKED permission state
//          (can_read_now flips to false on revoke); and the wire response
//          never leaks storage_location / content_hash / embedding / raw
//          payload. End-to-end via buildApp.
// CONNECTS TO:
//   - apps/api/src/routes/foundation.routes.ts
//   - apps/api/src/services/foundation/proof-of-access.service.ts

import { randomBytes, randomUUID } from "node:crypto";
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

const TEST_JWT_SECRET = "foundation-proof-of-access-secret";
let app: FastifyInstance;
const store = new MemoryRateLimitStore();

beforeAll(async () => {
  await ensureAuditTriggers();
  await cleanupTestData();
  app = await buildApp({
    jwtSecret: TEST_JWT_SECRET,
    sessionNonceStore: new MemoryNonceStore(),
    declarationStore: new MemoryNonceStore(),
    contentStore: new MemoryContentStore(),
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

async function makeUser(
  ops: string[] = ["read"],
): Promise<{ entity_id: string; token: string }> {
  const password = "correct-horse-battery";
  const input = makeEntityInput({ entity_type: "PERSON", password });
  const entity = await createEntity(input);
  const login = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email: input.email, password, requested_operations: ops },
  });
  return {
    entity_id: entity.entity_id,
    token: (login.json() as { token: string }).token,
  };
}

async function makeOwnedCapsule(ownerEntityId: string): Promise<string> {
  const wallet = await prisma.wallet.findUniqueOrThrow({
    where: { entity_id: ownerEntityId },
  });
  const capsule = await createCapsule(
    makeCapsuleInput(wallet.wallet_id, ownerEntityId),
  );
  return capsule.capsule_id;
}

function getProof(capsuleId: string, token: string | null) {
  return app.inject({
    method: "GET",
    url: `/api/v1/foundation/capsules/${capsuleId}/access-proof`,
    headers: token !== null ? { authorization: `Bearer ${token}` } : {},
  });
}

describe("Foundation Memory Capsule proof-of-access", () => {
  it("401s without auth", async () => {
    const owner = await makeUser(["read", "write"]);
    const capsuleId = await makeOwnedCapsule(owner.entity_id);
    const res = await getProof(capsuleId, null);
    expect(res.statusCode).toBe(401);
  });

  it("gives the owner a proof with is_owner + can_read_now + honest notes", async () => {
    const owner = await makeUser(["read", "write"]);
    const capsuleId = await makeOwnedCapsule(owner.entity_id);
    const res = await getProof(capsuleId, owner.token);
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      ok: boolean;
      proof: {
        subject_entity_id: string;
        capsule_id: string;
        access: { is_owner: boolean; can_read_now: boolean };
        notes: {
          transitive_sharing_supported: boolean;
          cascade_revocation_supported: boolean;
          memory_portability_supported: boolean;
        };
        proof_required: boolean;
        provenance: { decided_by: string };
        evidence: { chain_algorithm: string };
      };
    };
    expect(body.ok).toBe(true);
    expect(body.proof.subject_entity_id).toBe(owner.entity_id);
    expect(body.proof.capsule_id).toBe(capsuleId);
    expect(body.proof.access.is_owner).toBe(true);
    expect(body.proof.access.can_read_now).toBe(true);
    expect(body.proof.proof_required).toBe(true);
    expect(body.proof.provenance.decided_by).toBe("FOUNDATION");
    expect(body.proof.evidence.chain_algorithm).toBe("SHA-256");
    // Honest substrate boundaries — never imply unsupported capabilities.
    expect(body.proof.notes.transitive_sharing_supported).toBe(false);
    expect(body.proof.notes.cascade_revocation_supported).toBe(false);
    expect(body.proof.notes.memory_portability_supported).toBe(false);
  });

  it("is enumeration-safe: a caller with no basis gets CAPSULE_NOT_FOUND", async () => {
    const owner = await makeUser(["read", "write"]);
    const outsider = await makeUser(["read"]);
    const capsuleId = await makeOwnedCapsule(owner.entity_id);
    const res = await getProof(capsuleId, outsider.token);
    expect(res.statusCode).toBe(404);
    expect((res.json() as { code: string }).code).toBe("CAPSULE_NOT_FOUND");
  });

  it("reflects ACTIVE then REVOKED permission state for a grantee", async () => {
    const owner = await makeUser(["read", "write", "share"]);
    const grantee = await makeUser(["read"]);
    const capsuleId = await makeOwnedCapsule(owner.entity_id);

    const bridgeId = randomUUID();
    const perm = await prisma.permission.create({
      data: {
        bridge_id: bridgeId,
        capsule_id: capsuleId,
        grantor_entity_id: owner.entity_id,
        grantee_entity_id: grantee.entity_id,
        access_scope: "SUMMARY",
        duration_type: "SHORT_TERM",
        valid_from: new Date(),
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        status: "ACTIVE",
      },
    });

    const active = await getProof(capsuleId, grantee.token);
    expect(active.statusCode).toBe(200);
    const a = (active.json() as { proof: { access: Record<string, unknown> } })
      .proof.access;
    expect(a.is_owner).toBe(false);
    expect(a.permission_status).toBe("ACTIVE");
    expect(a.access_scope).toBe("SUMMARY");
    expect(a.can_read_now).toBe(true);

    // Revoke and re-check — proof must surface the revoked state honestly.
    await prisma.permission.update({
      where: { permission_id: perm.permission_id },
      data: {
        status: "REVOKED",
        revoked_at: new Date(),
        revoked_by_entity_id: owner.entity_id,
      },
    });
    const revoked = await getProof(capsuleId, grantee.token);
    expect(revoked.statusCode).toBe(200);
    const r = (revoked.json() as { proof: { access: Record<string, unknown> } })
      .proof.access;
    expect(r.permission_status).toBe("REVOKED");
    expect(r.can_read_now).toBe(false);
    expect(r.revoked_at).not.toBeNull();
  });

  it("never leaks storage_location / content_hash / embedding / raw payload on the wire", async () => {
    const owner = await makeUser(["read", "write"]);
    const capsuleId = await makeOwnedCapsule(owner.entity_id);
    const res = await getProof(capsuleId, owner.token);
    expect(res.payload).not.toContain("storage_location");
    expect(res.payload).not.toContain("content_hash");
    expect(res.payload).not.toContain("embedding");
    expect(res.payload).not.toContain("payload_content");
    expect(res.payload).not.toContain("payload_summary");
  });
});
