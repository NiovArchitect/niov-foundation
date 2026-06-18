// FILE: cosmp-application-gating.test.ts (integration)
// PURPOSE: Phase 1289-A.2 — proves APPLICATION entities now respect the
//          capsule-access gates (ai_access_blocked + requires_validation) on
//          NON-OWNED capsules, exactly like AI_AGENT/DEVICE, while PERSON
//          (a human, not the restricted class) is UNCHANGED. This is the
//          additive memory-scope hardening: an application must not read
//          capsules a human walled off from non-human access. End-to-end via
//          buildApp through POST /api/v1/cosmp/negotiate.
// CONNECTS TO:
//   - apps/api/src/services/cosmp/negotiate.service.ts (isRestrictedAiClass)
//   - apps/api/src/routes/cosmp.routes.ts

import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildApp,
  MemoryContentStore,
  MemoryNonceStore,
  MemoryRateLimitStore,
} from "@niov/api";
import { ContentEncryption } from "@niov/auth";
import {
  createCapsule,
  createEntity,
  prisma,
  type EntityType,
} from "@niov/database";
import {
  cleanupTestData,
  ensureAuditTriggers,
  makeCapsuleInput,
  makeEntityInput,
  withCleanRateLimits,
} from "../helpers.js";
import type { FastifyInstance } from "fastify";

const TEST_JWT_SECRET = "cosmp-application-gating-secret";
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

async function makeEntity(
  type: EntityType,
): Promise<{ entity_id: string; email: string; password: string }> {
  const password = "correct-horse-battery";
  const input = makeEntityInput({ entity_type: type, password });
  const entity = await createEntity(input);
  return { entity_id: entity.entity_id, email: input.email!, password };
}

async function login(
  email: string,
  password: string,
  ops: string[] = ["read"],
): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email, password, requested_operations: ops },
  });
  return (res.json() as { token: string }).token;
}

async function makeFlaggedCapsule(
  ownerEntityId: string,
  flag: "ai_access_blocked" | "requires_validation",
): Promise<string> {
  const wallet = await prisma.wallet.findUniqueOrThrow({
    where: { entity_id: ownerEntityId },
  });
  const capsule = await createCapsule(
    makeCapsuleInput(wallet.wallet_id, ownerEntityId),
  );
  await prisma.memoryCapsule.update({
    where: { capsule_id: capsule.capsule_id },
    data: { [flag]: true },
  });
  return capsule.capsule_id;
}

async function shareTo(
  ownerToken: string,
  granteeEntityId: string,
  capsuleId: string,
): Promise<void> {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/cosmp/share",
    headers: { authorization: `Bearer ${ownerToken}` },
    payload: {
      grantee_entity_id: granteeEntityId,
      capsule_grants: [{ capsule_id: capsuleId, scope: "SUMMARY" }],
    },
  });
  expect(res.statusCode).toBe(201);
}

function negotiate(capsuleId: string, token: string) {
  return app.inject({
    method: "POST",
    url: "/api/v1/cosmp/negotiate",
    headers: { authorization: `Bearer ${token}` },
    payload: { capsule_id: capsuleId, requested_scope: "SUMMARY" },
  });
}

describe("COSMP — APPLICATION capsule-access gating (1289-A.2)", () => {
  it("APPLICATION is DENIED on a non-owned ai_access_blocked capsule; PERSON is not", async () => {
    const owner = await makeEntity("PERSON");
    const ownerToken = await login(owner.email, owner.password, ["read", "share"]);
    const app1 = await makeEntity("APPLICATION");
    const person = await makeEntity("PERSON");
    const capsuleId = await makeFlaggedCapsule(owner.entity_id, "ai_access_blocked");
    await shareTo(ownerToken, app1.entity_id, capsuleId);
    await shareTo(ownerToken, person.entity_id, capsuleId);

    const appToken = await login(app1.email, app1.password);
    const personToken = await login(person.email, person.password);

    const appRes = await negotiate(capsuleId, appToken);
    expect(appRes.statusCode).toBe(403);
    expect((appRes.json() as { code: string }).code).toBe("ACCESS_DENIED");

    // Baseline preserved: a human (non-restricted) still negotiates fine.
    const personRes = await negotiate(capsuleId, personToken);
    expect(personRes.statusCode).toBe(200);
  });

  it("APPLICATION is DENIED on a non-owned requires_validation capsule; PERSON is not", async () => {
    const owner = await makeEntity("PERSON");
    const ownerToken = await login(owner.email, owner.password, ["read", "share"]);
    const app1 = await makeEntity("APPLICATION");
    const person = await makeEntity("PERSON");
    const capsuleId = await makeFlaggedCapsule(owner.entity_id, "requires_validation");
    await shareTo(ownerToken, app1.entity_id, capsuleId);
    await shareTo(ownerToken, person.entity_id, capsuleId);

    const appToken = await login(app1.email, app1.password);
    const personToken = await login(person.email, person.password);

    const appRes = await negotiate(capsuleId, appToken);
    expect(appRes.statusCode).toBe(403);
    expect((appRes.json() as { code: string }).code).toBe("ACCESS_DENIED");

    const personRes = await negotiate(capsuleId, personToken);
    expect(personRes.statusCode).toBe(200);
  });
});
