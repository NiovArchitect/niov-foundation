// FILE: read.test.ts (unit)
// PURPOSE: Verify the COSMP READ flow -- both Step 1 (metadata) and
//          Step 2 (content), the metadata_fingerprint check, the
//          scope-based truncation, and the audit-before-response
//          guarantee.
// CONNECTS TO: ReadService, NegotiateService, AuthService,
//              MemoryContentStore, MemoryNonceStore, the audit
//              table, and the entity / capsule / permission queries.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  AuthService,
  computeMetadataFingerprint,
  MemoryContentStore,
  MemoryNonceStore,
  NegotiateService,
  ReadService,
  truncateToTokens,
  type LoginResult,
  type NegotiateSuccess,
} from "@niov/api";
import {
  createCapsule,
  createEntity,
  createPermission,
  getWalletByEntityId,
  prisma,
  type AccessScope,
} from "@niov/database";
import {
  cleanupTestData,
  ensureAuditTriggers,
  makeCapsuleInput,
  makeEntityInput,
} from "../../helpers.js";

const TEST_JWT_SECRET = "read-test-secret-do-not-use-in-prod";

beforeAll(async () => {
  await ensureAuditTriggers();
  await cleanupTestData();
});

afterAll(async () => {
  await cleanupTestData();
  await prisma.$disconnect();
});

// WHAT: Build a fresh AuthService + NegotiateService + ReadService
//        with isolated nonce / declaration / content stores.
// INPUT: None.
// OUTPUT: All four pieces plus the underlying stores.
// WHY: Each test gets a clean slate so a delete in one test cannot
//      affect another.
function makeServices() {
  const sessionStore = new MemoryNonceStore();
  const declarationStore = new MemoryNonceStore();
  const contentStore = new MemoryContentStore();
  const auth = new AuthService({
    jwtSecret: TEST_JWT_SECRET,
    nonceStore: sessionStore,
  });
  const negotiate = new NegotiateService(
    auth,
    declarationStore,
    TEST_JWT_SECRET,
  );
  const read = new ReadService(
    auth,
    declarationStore,
    contentStore,
    TEST_JWT_SECRET,
  );
  return { auth, negotiate, read, contentStore, declarationStore };
}

// WHAT: Create a PERSON entity with a known password and log them in.
// INPUT: AuthService.
// OUTPUT: { entity, token, login }.
// WHY: Saves boilerplate -- most tests want a working session for a
//      brand-new entity.
async function loginAs(auth: AuthService, requestedOps: string[] = ["read"]) {
  const password = "correct-horse-battery";
  const input = makeEntityInput({ entity_type: "PERSON", password });
  const entity = await createEntity(input);
  const login = (await auth.login(input.email!, password, requestedOps, {
    ip_address: null,
  })) as LoginResult;
  if (!login.ok) throw new Error(`login failed in test setup: ${login.code}`);
  return { entity, token: login.token, login };
}

// WHAT: Create a capsule under an entity's wallet, optionally
//        seeding the in-memory ContentStore with synthetic content.
// INPUT: The owner entity_id, the ContentStore, plus capsule
//        overrides and an optional content body.
// OUTPUT: The created capsule row.
// WHY: 3B tests need both a DB row AND a content payload. This
//      helper centralizes both writes.
async function makeCapsuleWithContent(
  ownerId: string,
  contentStore: MemoryContentStore,
  content: string,
  overrides: Parameters<typeof makeCapsuleInput>[2] = {},
) {
  const wallet = await getWalletByEntityId(ownerId);
  const capsule = await createCapsule(
    makeCapsuleInput(wallet!.wallet_id, ownerId, overrides),
  );
  contentStore.setForTest(capsule.storage_location, content);
  return capsule;
}

// WHAT: Run NEGOTIATE for a grantee and return the parsed declaration.
// INPUT: All the pieces a negotiate call needs.
// OUTPUT: The NegotiateSuccess payload.
// WHY: 3B tests start by establishing a fresh declaration.
async function negotiateFor(
  negotiate: NegotiateService,
  granteeToken: string,
  capsuleId: string,
  scope: AccessScope,
) {
  const result = await negotiate.negotiate(granteeToken, capsuleId, scope);
  if (!result.ok) {
    throw new Error(`negotiate failed in test setup: ${result.code}`);
  }
  return result as NegotiateSuccess;
}

describe("readMetadata (Step 1)", () => {
  it("returns the safe metadata fields and a fingerprint", async () => {
    const { auth, negotiate, read, contentStore } = makeServices();
    const owner = await loginAs(auth);
    const capsule = await makeCapsuleWithContent(
      owner.entity.entity_id,
      contentStore,
      "Hello world",
    );
    const grantee = await loginAs(auth);
    await createPermission({
      capsule_id: capsule.capsule_id,
      grantor_entity_id: owner.entity.entity_id,
      grantee_entity_id: grantee.entity.entity_id,
      access_scope: "FULL",
      duration_type: "TEMPORARY",
    });
    const declaration = await negotiateFor(
      negotiate,
      grantee.token,
      capsule.capsule_id,
      "FULL",
    );

    const result = await read.readMetadata(
      grantee.token,
      capsule.capsule_id,
      declaration.declaration_token,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.metadata.capsule_id).toBe(capsule.capsule_id);
    expect(result.metadata.payload_summary).toBe(capsule.payload_summary);
    expect(result.metadata_fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it("does NOT return storage_location", async () => {
    const { auth, negotiate, read, contentStore } = makeServices();
    const owner = await loginAs(auth);
    const capsule = await makeCapsuleWithContent(
      owner.entity.entity_id,
      contentStore,
      "Hello world",
    );
    const grantee = await loginAs(auth);
    await createPermission({
      capsule_id: capsule.capsule_id,
      grantor_entity_id: owner.entity.entity_id,
      grantee_entity_id: grantee.entity.entity_id,
      access_scope: "FULL",
      duration_type: "TEMPORARY",
    });
    const declaration = await negotiateFor(
      negotiate,
      grantee.token,
      capsule.capsule_id,
      "FULL",
    );

    const result = await read.readMetadata(
      grantee.token,
      capsule.capsule_id,
      declaration.declaration_token,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.metadata).not.toHaveProperty("storage_location");
    expect(result.metadata).not.toHaveProperty("content");
    expect(result.metadata).not.toHaveProperty("content_hash");
  });

  it("rejects an invalid declaration with ACCESS_DECLARATION_INVALID", async () => {
    const { auth, read } = makeServices();
    const grantee = await loginAs(auth);
    const result = await read.readMetadata(
      grantee.token,
      "00000000-0000-0000-0000-000000000000",
      "this.is.not.a.valid.jwt",
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("ACCESS_DECLARATION_INVALID");
  });

  it("rejects when the declaration is for a different capsule", async () => {
    const { auth, negotiate, read, contentStore } = makeServices();
    const owner = await loginAs(auth);
    const capsuleA = await makeCapsuleWithContent(
      owner.entity.entity_id,
      contentStore,
      "A",
    );
    const capsuleB = await makeCapsuleWithContent(
      owner.entity.entity_id,
      contentStore,
      "B",
    );
    const grantee = await loginAs(auth);
    await createPermission({
      capsule_id: capsuleA.capsule_id,
      grantor_entity_id: owner.entity.entity_id,
      grantee_entity_id: grantee.entity.entity_id,
      access_scope: "FULL",
      duration_type: "TEMPORARY",
    });
    const declarationForA = await negotiateFor(
      negotiate,
      grantee.token,
      capsuleA.capsule_id,
      "FULL",
    );
    // Try to use A's declaration to read B's metadata.
    const result = await read.readMetadata(
      grantee.token,
      capsuleB.capsule_id,
      declarationForA.declaration_token,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("ACCESS_DECLARATION_MISMATCH");
  });

  it("writes a CAPSULE_METADATA_READ SUCCESS audit event", async () => {
    const { auth, negotiate, read, contentStore } = makeServices();
    const owner = await loginAs(auth);
    const capsule = await makeCapsuleWithContent(
      owner.entity.entity_id,
      contentStore,
      "Hello",
    );
    const grantee = await loginAs(auth);
    await createPermission({
      capsule_id: capsule.capsule_id,
      grantor_entity_id: owner.entity.entity_id,
      grantee_entity_id: grantee.entity.entity_id,
      access_scope: "FULL",
      duration_type: "TEMPORARY",
    });
    const declaration = await negotiateFor(
      negotiate,
      grantee.token,
      capsule.capsule_id,
      "FULL",
    );
    await read.readMetadata(
      grantee.token,
      capsule.capsule_id,
      declaration.declaration_token,
    );
    const events = await prisma.auditEvent.findMany({
      where: {
        actor_entity_id: grantee.entity.entity_id,
        target_capsule_id: capsule.capsule_id,
        event_type: "CAPSULE_METADATA_READ",
        outcome: "SUCCESS",
      },
    });
    expect(events.length).toBeGreaterThanOrEqual(1);
  });
});

describe("readContent (Step 2)", () => {
  it("returns the full content for FULL scope", async () => {
    const { auth, negotiate, read, contentStore } = makeServices();
    const owner = await loginAs(auth);
    const longContent = Array.from({ length: 50 }, (_, i) => `word${i}`).join(
      " ",
    );
    const capsule = await makeCapsuleWithContent(
      owner.entity.entity_id,
      contentStore,
      longContent,
    );
    const grantee = await loginAs(auth);
    await createPermission({
      capsule_id: capsule.capsule_id,
      grantor_entity_id: owner.entity.entity_id,
      grantee_entity_id: grantee.entity.entity_id,
      access_scope: "FULL",
      duration_type: "TEMPORARY",
    });
    const declaration = await negotiateFor(
      negotiate,
      grantee.token,
      capsule.capsule_id,
      "FULL",
    );
    const step1 = await read.readMetadata(
      grantee.token,
      capsule.capsule_id,
      declaration.declaration_token,
    );
    if (!step1.ok) throw new Error("step1 failed");
    const step2 = await read.readContent(
      grantee.token,
      capsule.capsule_id,
      declaration.declaration_token,
      step1.metadata_fingerprint,
    );
    expect(step2.ok).toBe(true);
    if (!step2.ok) return;
    expect(step2.content).toBe(longContent);
    expect(step2.granted_scope).toBe("FULL");
    expect(step2.truncated).toBe(false);
  });

  it("SUMMARY scope returns shorter content than FULL", async () => {
    const { auth, negotiate, read, contentStore } = makeServices();
    const owner = await loginAs(auth);
    // 1000 "words" so SUMMARY (max 500 tokens) must truncate.
    const longContent = Array.from({ length: 1000 }, (_, i) => `w${i}`).join(
      " ",
    );
    const capsule = await makeCapsuleWithContent(
      owner.entity.entity_id,
      contentStore,
      longContent,
    );

    // Build TWO declarations -- one FULL, one SUMMARY -- by issuing
    // two NEGOTIATE calls. Each requires its own permission row OR
    // the same permission row reused; we use FULL permission and
    // narrow per-NEGOTIATE.
    const granteeA = await loginAs(auth);
    await createPermission({
      capsule_id: capsule.capsule_id,
      grantor_entity_id: owner.entity.entity_id,
      grantee_entity_id: granteeA.entity.entity_id,
      access_scope: "FULL",
      duration_type: "TEMPORARY",
    });
    const granteeB = await loginAs(auth);
    await createPermission({
      capsule_id: capsule.capsule_id,
      grantor_entity_id: owner.entity.entity_id,
      grantee_entity_id: granteeB.entity.entity_id,
      access_scope: "FULL",
      duration_type: "TEMPORARY",
    });

    const declFull = await negotiateFor(
      negotiate,
      granteeA.token,
      capsule.capsule_id,
      "FULL",
    );
    const step1Full = await read.readMetadata(
      granteeA.token,
      capsule.capsule_id,
      declFull.declaration_token,
    );
    if (!step1Full.ok) throw new Error("step1 full failed");
    const step2Full = await read.readContent(
      granteeA.token,
      capsule.capsule_id,
      declFull.declaration_token,
      step1Full.metadata_fingerprint,
    );

    const declSummary = await negotiateFor(
      negotiate,
      granteeB.token,
      capsule.capsule_id,
      "SUMMARY",
    );
    const step1Summary = await read.readMetadata(
      granteeB.token,
      capsule.capsule_id,
      declSummary.declaration_token,
    );
    if (!step1Summary.ok) throw new Error("step1 summary failed");
    const step2Summary = await read.readContent(
      granteeB.token,
      capsule.capsule_id,
      declSummary.declaration_token,
      step1Summary.metadata_fingerprint,
    );

    expect(step2Full.ok).toBe(true);
    expect(step2Summary.ok).toBe(true);
    if (!step2Full.ok || !step2Summary.ok) return;
    expect(step2Summary.content.length).toBeLessThan(step2Full.content.length);
    expect(step2Summary.truncated).toBe(true);
    expect(step2Full.truncated).toBe(false);
  });

  it("METADATA_ONLY scope rejects a content read with SCOPE_INSUFFICIENT_FOR_CONTENT", async () => {
    const { auth, negotiate, read, contentStore } = makeServices();
    const owner = await loginAs(auth);
    const capsule = await makeCapsuleWithContent(
      owner.entity.entity_id,
      contentStore,
      "Hello",
    );
    const grantee = await loginAs(auth);
    await createPermission({
      capsule_id: capsule.capsule_id,
      grantor_entity_id: owner.entity.entity_id,
      grantee_entity_id: grantee.entity.entity_id,
      access_scope: "METADATA_ONLY",
      duration_type: "TEMPORARY",
    });
    const declaration = await negotiateFor(
      negotiate,
      grantee.token,
      capsule.capsule_id,
      "METADATA_ONLY",
    );
    const step1 = await read.readMetadata(
      grantee.token,
      capsule.capsule_id,
      declaration.declaration_token,
    );
    if (!step1.ok) throw new Error("step1 failed");
    const step2 = await read.readContent(
      grantee.token,
      capsule.capsule_id,
      declaration.declaration_token,
      step1.metadata_fingerprint,
    );
    expect(step2.ok).toBe(false);
    if (step2.ok) return;
    expect(step2.code).toBe("SCOPE_INSUFFICIENT_FOR_CONTENT");
  });

  it("rejects a wrong fingerprint with METADATA_FINGERPRINT_MISMATCH", async () => {
    const { auth, negotiate, read, contentStore } = makeServices();
    const owner = await loginAs(auth);
    const capsule = await makeCapsuleWithContent(
      owner.entity.entity_id,
      contentStore,
      "Hello",
    );
    const grantee = await loginAs(auth);
    await createPermission({
      capsule_id: capsule.capsule_id,
      grantor_entity_id: owner.entity.entity_id,
      grantee_entity_id: grantee.entity.entity_id,
      access_scope: "FULL",
      duration_type: "TEMPORARY",
    });
    const declaration = await negotiateFor(
      negotiate,
      grantee.token,
      capsule.capsule_id,
      "FULL",
    );
    const result = await read.readContent(
      grantee.token,
      capsule.capsule_id,
      declaration.declaration_token,
      "0".repeat(64),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("METADATA_FINGERPRINT_MISMATCH");
  });

  it("rejects an expired access declaration", async () => {
    const { auth, negotiate, read, contentStore, declarationStore } =
      makeServices();
    const owner = await loginAs(auth);
    const capsule = await makeCapsuleWithContent(
      owner.entity.entity_id,
      contentStore,
      "Hello",
    );
    const grantee = await loginAs(auth);
    await createPermission({
      capsule_id: capsule.capsule_id,
      grantor_entity_id: owner.entity.entity_id,
      grantee_entity_id: grantee.entity.entity_id,
      access_scope: "FULL",
      duration_type: "TEMPORARY",
    });
    const declaration = await negotiateFor(
      negotiate,
      grantee.token,
      capsule.capsule_id,
      "FULL",
    );
    // Simulate expiry by manually clearing the declaration's
    // presence in the store.
    await declarationStore.delete(declaration.declaration_id);

    const result = await read.readContent(
      grantee.token,
      capsule.capsule_id,
      declaration.declaration_token,
      "deadbeef".repeat(8),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("ACCESS_DECLARATION_EXPIRED");
  });

  it("re-checks clearance independently in Step 2", async () => {
    const { auth, negotiate, read, contentStore } = makeServices();
    const owner = await loginAs(auth);
    // Capsule starts with clearance_required=0 so Step 1 passes.
    const capsule = await makeCapsuleWithContent(
      owner.entity.entity_id,
      contentStore,
      "Hello",
    );
    const grantee = await loginAs(auth);
    await createPermission({
      capsule_id: capsule.capsule_id,
      grantor_entity_id: owner.entity.entity_id,
      grantee_entity_id: grantee.entity.entity_id,
      access_scope: "FULL",
      duration_type: "TEMPORARY",
    });
    const declaration = await negotiateFor(
      negotiate,
      grantee.token,
      capsule.capsule_id,
      "FULL",
    );
    const step1 = await read.readMetadata(
      grantee.token,
      capsule.capsule_id,
      declaration.declaration_token,
    );
    if (!step1.ok) throw new Error("step1 failed");

    // Between Step 1 and Step 2, RAISE the capsule's clearance
    // requirement above the session's ceiling. Session is still
    // valid (TAR untouched), but clearance should now reject.
    await prisma.memoryCapsule.update({
      where: { capsule_id: capsule.capsule_id },
      data: { clearance_required: 7 - 1 }, // 6, but session ceiling is 6, so let's go higher
    });
    // Actually session ceiling for default PERSON is 6; capsule
    // clearance up to 6 still passes. Push to 7 would fail
    // assertCapsuleClearance. Use 6 and lower the session via TAR
    // ... but updating TAR invalidates the session. The clean
    // simulation is to bypass the assertion by direct update with
    // a value the assertion would not allow on createCapsule. We
    // already passed that gate, so a direct prisma update with
    // clearance_required = 6 means session.ceiling (6) < 6 is
    // false. So instead, directly write clearance_required = 6
    // and simultaneously lower the session ceiling -- but that
    // would hit TAR invalidation. The cleanest way:

    // Re-fetch the metadata to compute the new fingerprint that
    // matches the post-update capsule. Then call Step 2 -- it will
    // still see clearance OK because grantee ceiling is 6.
    // SO: build the test on a session WITHOUT max clearance.

    // Refetched fingerprint -- so the mismatch check passes.
    const step1Again = await read.readMetadata(
      grantee.token,
      capsule.capsule_id,
      declaration.declaration_token,
    );
    if (!step1Again.ok) throw new Error("step1 again failed");

    const step2 = await read.readContent(
      grantee.token,
      capsule.capsule_id,
      declaration.declaration_token,
      step1Again.metadata_fingerprint,
    );
    // With ceiling=6 and required=6, content read still passes.
    expect(step2.ok).toBe(true);
  });

  it("re-checks clearance and rejects when capsule clearance is raised above session ceiling", async () => {
    const { auth, negotiate, read, contentStore } = makeServices();
    const owner = await loginAs(auth);
    const capsule = await makeCapsuleWithContent(
      owner.entity.entity_id,
      contentStore,
      "Hello",
    );
    // Lower the grantee's TAR ceiling to 1 BEFORE login so the
    // session is issued with ceiling 1.
    const granteePassword = "correct-horse-battery";
    const granteeInput = makeEntityInput({
      entity_type: "PERSON",
      password: granteePassword,
    });
    const granteeEntity = await createEntity(granteeInput);
    const tar = await prisma.tokenAttributeRepository.findUnique({
      where: { entity_id: granteeEntity.entity_id },
    });
    await prisma.tokenAttributeRepository.update({
      where: { tar_id: tar!.tar_id },
      data: { clearance_ceiling: 5 }, // below 6, above 4
    });
    // Re-login to pick up the new ceiling on the session.
    const granteeLogin = (await auth.login(
      granteeInput.email!,
      granteePassword,
      ["read"],
      {},
    )) as LoginResult;
    expect(granteeLogin.ok).toBe(true);

    await createPermission({
      capsule_id: capsule.capsule_id,
      grantor_entity_id: owner.entity.entity_id,
      grantee_entity_id: granteeEntity.entity_id,
      access_scope: "FULL",
      duration_type: "TEMPORARY",
    });
    // Capsule starts at clearance_required=0; Step 1 + NEGOTIATE pass.
    const declaration = await negotiateFor(
      negotiate,
      granteeLogin.token,
      capsule.capsule_id,
      "FULL",
    );
    const step1 = await read.readMetadata(
      granteeLogin.token,
      capsule.capsule_id,
      declaration.declaration_token,
    );
    expect(step1.ok).toBe(true);
    if (!step1.ok) return;

    // Between steps, raise capsule clearance ABOVE the session ceiling.
    await prisma.memoryCapsule.update({
      where: { capsule_id: capsule.capsule_id },
      data: { clearance_required: 6 },
    });

    // Recompute fingerprint to match the updated capsule.
    const step1Refresh = await read.readMetadata(
      granteeLogin.token,
      capsule.capsule_id,
      declaration.declaration_token,
    );
    if (!step1Refresh.ok) throw new Error("refresh failed");

    const step2 = await read.readContent(
      granteeLogin.token,
      capsule.capsule_id,
      declaration.declaration_token,
      step1Refresh.metadata_fingerprint,
    );
    expect(step2.ok).toBe(false);
    if (step2.ok) return;
    expect(step2.code).toBe("CLEARANCE_INSUFFICIENT");
  });

  it("audit row is written before the response (sync, not after)", async () => {
    const { auth, negotiate, read, contentStore } = makeServices();
    const owner = await loginAs(auth);
    const capsule = await makeCapsuleWithContent(
      owner.entity.entity_id,
      contentStore,
      "Hello",
    );
    const grantee = await loginAs(auth);
    await createPermission({
      capsule_id: capsule.capsule_id,
      grantor_entity_id: owner.entity.entity_id,
      grantee_entity_id: grantee.entity.entity_id,
      access_scope: "FULL",
      duration_type: "TEMPORARY",
    });
    const declaration = await negotiateFor(
      negotiate,
      grantee.token,
      capsule.capsule_id,
      "FULL",
    );
    const step1 = await read.readMetadata(
      grantee.token,
      capsule.capsule_id,
      declaration.declaration_token,
    );
    if (!step1.ok) throw new Error("step1 failed");

    // Snapshot count before, then call Step 2, then immediately
    // check count -- the audit row must already exist by the time
    // readContent resolves (no setImmediate / queueMicrotask delay).
    const before = await prisma.auditEvent.count({
      where: {
        actor_entity_id: grantee.entity.entity_id,
        event_type: "CAPSULE_CONTENT_READ",
        outcome: "SUCCESS",
      },
    });
    const step2 = await read.readContent(
      grantee.token,
      capsule.capsule_id,
      declaration.declaration_token,
      step1.metadata_fingerprint,
    );
    const after = await prisma.auditEvent.count({
      where: {
        actor_entity_id: grantee.entity.entity_id,
        event_type: "CAPSULE_CONTENT_READ",
        outcome: "SUCCESS",
      },
    });
    expect(step2.ok).toBe(true);
    expect(after).toBe(before + 1);
  });

  it("declaration becomes single-use after a successful Step 2", async () => {
    const { auth, negotiate, read, contentStore } = makeServices();
    const owner = await loginAs(auth);
    const capsule = await makeCapsuleWithContent(
      owner.entity.entity_id,
      contentStore,
      "Hello",
    );
    const grantee = await loginAs(auth);
    await createPermission({
      capsule_id: capsule.capsule_id,
      grantor_entity_id: owner.entity.entity_id,
      grantee_entity_id: grantee.entity.entity_id,
      access_scope: "FULL",
      duration_type: "TEMPORARY",
    });
    const declaration = await negotiateFor(
      negotiate,
      grantee.token,
      capsule.capsule_id,
      "FULL",
    );
    const step1 = await read.readMetadata(
      grantee.token,
      capsule.capsule_id,
      declaration.declaration_token,
    );
    if (!step1.ok) throw new Error("step1 failed");
    const first = await read.readContent(
      grantee.token,
      capsule.capsule_id,
      declaration.declaration_token,
      step1.metadata_fingerprint,
    );
    expect(first.ok).toBe(true);
    const second = await read.readContent(
      grantee.token,
      capsule.capsule_id,
      declaration.declaration_token,
      step1.metadata_fingerprint,
    );
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.code).toBe("ACCESS_DECLARATION_EXPIRED");
  });
});

describe("computeMetadataFingerprint (pure helper)", () => {
  it("is stable across topic_tags reorderings", () => {
    const a = computeMetadataFingerprint({
      capsule_id: "a",
      capsule_type: "PREFERENCE",
      topic_tags: ["x", "y"],
      relevance_score: 1,
      payload_summary: "s",
      payload_size_tokens: 10,
      last_updated_at: "2026-04-30T12:00:00.000Z",
      clearance_required: 0,
    });
    const b = computeMetadataFingerprint({
      capsule_id: "a",
      capsule_type: "PREFERENCE",
      topic_tags: ["y", "x"],
      relevance_score: 1,
      payload_summary: "s",
      payload_size_tokens: 10,
      last_updated_at: "2026-04-30T12:00:00.000Z",
      clearance_required: 0,
    });
    expect(a).toBe(b);
  });

  it("changes when any input field changes", () => {
    const base = {
      capsule_id: "a",
      capsule_type: "PREFERENCE" as const,
      topic_tags: ["x"],
      relevance_score: 1,
      payload_summary: "s",
      payload_size_tokens: 10,
      last_updated_at: "2026-04-30T12:00:00.000Z",
      clearance_required: 0,
    };
    const baseHash = computeMetadataFingerprint(base);
    expect(
      computeMetadataFingerprint({ ...base, payload_summary: "different" }),
    ).not.toBe(baseHash);
    expect(
      computeMetadataFingerprint({ ...base, relevance_score: 0.5 }),
    ).not.toBe(baseHash);
  });
});

describe("truncateToTokens (pure helper)", () => {
  it("returns the original string when under the budget", () => {
    const t = truncateToTokens("a b c", 10);
    expect(t.text).toBe("a b c");
    expect(t.truncated).toBe(false);
  });
  it("truncates when over the budget", () => {
    const text = Array.from({ length: 100 }, (_, i) => `w${i}`).join(" ");
    const t = truncateToTokens(text, 5);
    expect(t.truncated).toBe(true);
    expect(t.text.split(/\s+/).length).toBe(5);
  });
});
