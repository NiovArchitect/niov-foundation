// FILE: p2-conversation-learning.test.ts (integration)
// PURPOSE: TEST 10 from spec — verify the P2 HIPAA patch end-to-end
//          at the HTTP layer. CONVERSATION_LEARNING capsule + HIPAA-
//          bound owner + grantee permission WITHOUT health_data_consent
//          → POST /cosmp/negotiate returns 451 with body code
//          COMPLIANCE_CHECK_FAILED.
//
//          Status code 451 (Unavailable for Legal Reasons) matches
//          the existing compliance failure path in
//          apps/api/src/routes/cosmp.routes.ts. Spec says 451; the
//          actual implementation may use a different code in the
//          future — this test verifies the deployed behavior.
// CONNECTS TO: buildApp, AuthService, write/permission services,
//              compliance + negotiate paths.

import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildApp,
  MemoryContentStore,
  MemoryKVCache,
  MemoryNonceStore,
  MemoryRateLimitStore,
  MockLLMProvider,
} from "@niov/api";
import { ContentEncryption } from "@niov/auth";
import { createEntity, createPermission, prisma } from "@niov/database";
import {
  cleanupTestData,
  ensureAuditTriggers,
  makeEntityInput,
} from "../helpers.js";
import type { FastifyInstance } from "fastify";

const TEST_JWT_SECRET = "p2-conv-test-secret-do-not-use-in-prod";
const TEST_KEY = randomBytes(32);

let app: FastifyInstance;
let encryption: ContentEncryption;

beforeAll(async () => {
  await ensureAuditTriggers();
  await cleanupTestData();
  encryption = new ContentEncryption(TEST_KEY);
  app = await buildApp({
    jwtSecret: TEST_JWT_SECRET,
    sessionNonceStore: new MemoryNonceStore(),
    declarationStore: new MemoryNonceStore(),
    contentStore: new MemoryContentStore(),
    contentEncryption: encryption,
    rateLimitStore: new MemoryRateLimitStore(),
    otzarCache: new MemoryKVCache(),
    otzarLLM: new MockLLMProvider([
      {
        ok: true,
        text: "stub",
        provider: "mock",
        model: "mock-1",
      },
    ]),
  });
});

afterAll(async () => {
  await app.close();
  await cleanupTestData();
  await prisma.$disconnect();
});

// WHAT: Inline replicate of setComplianceProfile from
//        compliance.test.ts. Cross-file test helper imports are
//        brittle when tests run in isolation; replicating keeps this
//        suite self-contained. Keep synchronized if that helper
//        changes shape.
async function setComplianceProfile(
  entityId: string,
  frameworks: string[],
  sector: string,
  jurisdiction: string[] = [],
): Promise<void> {
  await prisma.entityComplianceProfile.upsert({
    where: { entity_id: entityId },
    update: { frameworks, sector, jurisdiction },
    create: { entity_id: entityId, frameworks, sector, jurisdiction },
  });
}

async function loginAs(): Promise<{ ownerId: string; token: string; ip: string; email: string }> {
  const password = "correct-horse-battery";
  const input = makeEntityInput({ entity_type: "PERSON", password });
  const entity = await createEntity(input);
  const ip = `10.99.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 254) + 1}`;
  const login = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: {
      email: input.email,
      password,
      requested_operations: ["read", "write", "share"],
    },
    remoteAddress: ip,
  });
  if (login.statusCode !== 200) {
    throw new Error(`login failed: ${login.statusCode}`);
  }
  const body = login.json() as { token: string };
  return { ownerId: entity.entity_id, token: body.token, ip, email: input.email! };
}

describe("P2 HIPAA patch -- HTTP-level NEGOTIATE on CONVERSATION_LEARNING", () => {
  it("CONVERSATION_LEARNING + HIPAA + no health_data_consent → 451 COMPLIANCE_CHECK_FAILED", async () => {
    const owner = await loginAs();
    const grantee = await loginAs();

    // Owner is HIPAA-bound HEALTHCARE.
    await setComplianceProfile(
      owner.ownerId,
      ["HIPAA"],
      "HEALTHCARE",
      ["US"],
    );

    // Owner creates a CONVERSATION_LEARNING capsule directly via
    // POST /cosmp/capsule (write route).
    const createResp = await app.inject({
      method: "POST",
      url: "/api/v1/cosmp/capsule",
      headers: { authorization: `Bearer ${owner.token}` },
      payload: {
        capsule_type: "CONVERSATION_LEARNING",
        topic_tags: ["p2-test"],
        payload_summary: "patient discussed back pain",
        content: "Patient mentioned chronic lower back pain",
      },
      remoteAddress: owner.ip,
    });
    expect(createResp.statusCode).toBe(201);
    const capsuleId = (createResp.json() as { capsule_id: string }).capsule_id;

    // Owner grants SUMMARY permission to grantee WITHOUT
    // health_data_consent in the conditions.
    await createPermission({
      capsule_id: capsuleId,
      grantor_entity_id: owner.ownerId,
      grantee_entity_id: grantee.ownerId,
      access_scope: "SUMMARY",
      duration_type: "TEMPORARY",
    });

    // Grantee attempts NEGOTIATE.
    const negotiateResp = await app.inject({
      method: "POST",
      url: "/api/v1/cosmp/negotiate",
      headers: { authorization: `Bearer ${grantee.token}` },
      payload: {
        capsule_id: capsuleId,
        requested_scope: "SUMMARY",
      },
      remoteAddress: grantee.ip,
    });

    // P2 PATCH end-to-end: HIPAA predicate now triggers on
    // CONVERSATION_LEARNING, so this NEGOTIATE must be blocked at
    // the compliance layer. Status 451 (Unavailable for Legal
    // Reasons) per cosmp.routes.ts statusForCode mapping.
    expect(negotiateResp.statusCode).toBe(451);
    const body = negotiateResp.json() as { code: string };
    expect(body.code).toBe("COMPLIANCE_CHECK_FAILED");

    void randomUUID;
  });
});
