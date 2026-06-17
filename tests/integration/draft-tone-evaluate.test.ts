// FILE: draft-tone-evaluate.test.ts (integration)
// PURPOSE: Phase 1285-Y — HTTP-level coverage for the draft-tone evaluate route:
//          with Python NOT configured in the test env it proves the deterministic
//          fallback (assessment returned, honest envelope, no authority), the
//          original draft is preserved verbatim, approval_required is raised for
//          an external email channel, em-dash drafts are flagged, and an empty
//          draft is 422. Nothing is sent or persisted. End-to-end via buildApp.
// CONNECTS TO:
//   - apps/api/src/routes/work-os-ledger.routes.ts
//   - apps/api/src/services/work-os/draft-tone.service.ts

import { randomUUID, randomBytes } from "node:crypto";
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
  TEST_PREFIX,
} from "../helpers.js";
import type { FastifyInstance } from "fastify";

const TEST_JWT_SECRET = "draft-tone-test-secret";
const TEST_KEY = randomBytes(32);
let app: FastifyInstance;
let ORG_ID: string;
let TOKEN: string;

beforeAll(async () => {
  await ensureAuditTriggers();
  await cleanupTestData();
  app = await buildApp({
    jwtSecret: TEST_JWT_SECRET,
    sessionNonceStore: new MemoryNonceStore(),
    declarationStore: new MemoryNonceStore(),
    contentStore: new MemoryContentStore(),
    contentEncryption: new ContentEncryption(TEST_KEY),
    rateLimitStore: new MemoryRateLimitStore(),
  });
  const org = await createEntity({
    entity_type: "COMPANY",
    display_name: `${TEST_PREFIX}org_${randomUUID()}`,
    email: `${TEST_PREFIX}org_${randomUUID()}@niov.test`,
    public_key: "test-public-key",
    clearance_level: 0,
  });
  ORG_ID = org.entity_id;
  const password = "correct-horse-battery";
  const input = makeEntityInput({ entity_type: "PERSON", password });
  const ent = await createEntity(input);
  await prisma.entityMembership.create({
    data: { parent_id: ORG_ID, child_id: ent.entity_id, role_title: "MEMBER", is_active: true },
  });
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email: input.email, password, requested_operations: ["read", "write"] },
    remoteAddress: "10.95.1.1",
  });
  TOKEN = (res.json() as { token: string }).token;
});

afterAll(async () => {
  await app.close();
  await cleanupTestData();
  await prisma.$disconnect();
});

interface EvalBody {
  ok: boolean;
  assessment: {
    original_draft: string;
    quality_score: number;
    tone_label: string;
    risk_flags: string[];
    suggested_revision: string | null;
    approval_required: boolean;
    preserves_intent: boolean;
    provenance: string;
  };
  envelope: { capability: string; status: string; authority: string | null };
}

async function evaluate(payload: Record<string, unknown>) {
  return app.inject({
    method: "POST",
    url: "/api/v1/work-os/draft-tone/evaluate",
    headers: { authorization: `Bearer ${TOKEN}` },
    payload,
  });
}

describe("draft-tone evaluate route", () => {
  it("returns a deterministic assessment with the original preserved when Python is not configured", async () => {
    const draft = "Hi Sam, can you review the launch checklist? Thanks.";
    const res = await evaluate({ draft_text: draft, channel: "internal_message", recipient_context: { display_name: "Sam", internal: true } });
    expect(res.statusCode).toBe(200);
    const b = res.json() as EvalBody;
    expect(b.ok).toBe(true);
    expect(b.envelope.capability).toBe("DRAFT_TONE");
    expect(b.envelope.status).toBe("NOT_CONFIGURED"); // honest — Python not wired in test env
    expect(b.envelope.authority).toBe(null);
    expect(b.assessment.original_draft).toBe(draft); // preserved verbatim
    expect(b.assessment.provenance).toBe("foundation:deterministic-tone");
    expect(b.assessment.preserves_intent).toBe(true);
  });

  it("flags an em dash and the deterministic revision removes it", async () => {
    const res = await evaluate({ draft_text: "We shipped — finally — and it works.", channel: "internal_message", recipient_context: { internal: true } });
    const b = res.json() as EvalBody;
    expect(b.assessment.risk_flags).toContain("EM_DASH");
    expect(b.assessment.suggested_revision === null || !/[—–]/.test(b.assessment.suggested_revision)).toBe(true);
  });

  it("raises approval_required for an external email channel", async () => {
    const res = await evaluate({ draft_text: "Please find the report attached.", channel: "email", recipient_context: { display_name: "Client", internal: false } });
    const b = res.json() as EvalBody;
    expect(b.assessment.approval_required).toBe(true);
    expect(b.assessment.risk_flags).toContain("EXTERNAL_SEND_REQUIRES_APPROVAL");
  });

  it("422s an empty draft", async () => {
    const res = await evaluate({ draft_text: "   ", channel: "internal_message" });
    expect(res.statusCode).toBe(422);
  });
});
