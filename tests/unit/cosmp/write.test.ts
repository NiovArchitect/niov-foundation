// FILE: write.test.ts (unit)
// PURPOSE: Verify the COSMP WRITE flow -- owner-write CREATE,
//          attributed-write UPDATE, content encryption, version
//          increment, attribution permanence, and audit-of-record
//          coverage on success and denial.
// CONNECTS TO: WriteService, NegotiateService, AuthService,
//              MemoryContentStore, MemoryNonceStore, the audit
//              table, and the entity / capsule / permission queries.

import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  AuthService,
  FixtureBasedEmbeddingProvider,
  MemoryContentStore,
  MemoryNonceStore,
  NegotiateService,
  WriteService,
  type EmbeddingProvider,
  type EmbeddingResult,
  type LoginResult,
  type NegotiateSuccess,
} from "@niov/api";
import { ContentEncryption } from "@niov/auth";
import {
  createPermission,
  prisma,
} from "@niov/database";
import { createEntity } from "@niov/database";
import {
  cleanupTestData,
  ensureAuditTriggers,
  makeEntityInput,
} from "../../helpers.js";

const TEST_JWT_SECRET = "write-test-secret-do-not-use-in-prod";
// Fixed test key so tests are deterministic.
const TEST_KEY = randomBytes(32);

beforeAll(async () => {
  await ensureAuditTriggers();
  await cleanupTestData();
});

afterAll(async () => {
  await cleanupTestData();
  await prisma.$disconnect();
});

// WHAT: Build a fresh AuthService + NegotiateService + WriteService
//        with isolated stores and a known encryption key.
// INPUT: None.
// OUTPUT: All services + the underlying stores.
// WHY: Each test gets a clean slate so state from one cannot leak
//      into another.
function makeServices(embeddingProviderOverride?: EmbeddingProvider) {
  const sessionStore = new MemoryNonceStore();
  const declarationStore = new MemoryNonceStore();
  const contentStore = new MemoryContentStore();
  const encryption = new ContentEncryption(TEST_KEY);
  const auth = new AuthService({
    jwtSecret: TEST_JWT_SECRET,
    nonceStore: sessionStore,
  });
  const negotiate = new NegotiateService(
    auth,
    declarationStore,
    TEST_JWT_SECRET,
  );
  // G3.5 per ADR-0043 + Q-G3.5-ε LOCK: tests inject the embedding
  // provider. Default is FixtureBasedEmbeddingProvider so the
  // pre-G3.5 26 baseline tests run unchanged; G3.5 E1-E9 tests
  // pass a spy / mock override to control success vs degrade
  // behavior per the mutation_type matrix (Q-G3-ι).
  const embeddingProvider: EmbeddingProvider =
    embeddingProviderOverride ?? new FixtureBasedEmbeddingProvider();
  const write = new WriteService(
    auth,
    declarationStore,
    contentStore,
    encryption,
    TEST_JWT_SECRET,
    embeddingProvider,
  );
  return {
    auth,
    negotiate,
    write,
    contentStore,
    declarationStore,
    encryption,
    embeddingProvider,
  };
}

// WHAT: Create a PERSON entity with a known password and log them in.
// INPUT: AuthService and the operations to request.
// OUTPUT: { entity, token, login }.
// WHY: WRITE tests need a session that includes "write" in its
//      allowed_operations.
async function loginAs(
  auth: AuthService,
  requestedOps: string[] = ["read", "write"],
) {
  const password = "correct-horse-battery";
  const input = makeEntityInput({ entity_type: "PERSON", password });
  const entity = await createEntity(input);
  const login = await auth.login(input.email!, password, requestedOps, {
    ip_address: null,
  });
  if (!login.ok) throw new Error(`login failed in test setup: ${login.code}`);
  return { entity, token: login.token, login };
}

describe("createCapsule -- owner write", () => {
  it("creates a capsule without an access declaration", async () => {
    const { auth, write } = makeServices();
    const owner = await loginAs(auth);
    const result = await write.createCapsule(owner.token, {
      capsule_type: "PREFERENCE",
      topic_tags: ["alpha"],
      payload_summary: "Test capsule summary",
      content: "secret_test_payload",
      write_reason: "initial seed",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.capsule_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(result.version).toBe(1);
    expect(result.write_type).toBe("OWNER");
    expect(result.content_hash).toMatch(/^[0-9a-f]{64}$/);

    const row = await prisma.memoryCapsule.findUnique({
      where: { capsule_id: result.capsule_id },
    });
    expect(row).not.toBeNull();
    expect(row?.entity_id).toBe(owner.entity.entity_id);
    expect(row?.created_by).toBe(owner.entity.entity_id);
    expect(row?.created_session_id).not.toBeNull();
    expect(row?.write_reason).toBe("initial seed");
  });

  it("encrypts content -- raw plaintext is not visible in storage", async () => {
    const { auth, write, contentStore, encryption } = makeServices();
    const owner = await loginAs(auth);
    const SECRET = "this_is_the_secret_plaintext_marker_xyz789";
    const result = await write.createCapsule(owner.token, {
      capsule_type: "PREFERENCE",
      topic_tags: ["secrets"],
      payload_summary: "summary",
      content: SECRET,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const stored = await contentStore.read(result.storage_location);
    expect(stored).not.toBeNull();
    expect(stored).not.toContain(SECRET);
    expect(stored).not.toBe(SECRET);
    // Round-trip the encrypted blob through decrypt to confirm it
    // really is the encryption of SECRET (not random garbage).
    expect(encryption.decrypt(stored!)).toBe(SECRET);
  });

  it("rejects when required fields are missing", async () => {
    const { auth, write } = makeServices();
    const owner = await loginAs(auth);
    const result = await write.createCapsule(owner.token, {
      capsule_type: "PREFERENCE",
      topic_tags: [],
      payload_summary: "",
      content: "",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("CAPSULE_DATA_INVALID");
    expect(result.errors?.length).toBeGreaterThanOrEqual(2);
  });

  it("rejects when the session is invalid", async () => {
    const { write } = makeServices();
    const result = await write.createCapsule(
      "definitely.not.a.valid.token",
      {
        capsule_type: "PREFERENCE",
        topic_tags: ["x"],
        payload_summary: "s",
        content: "c",
      },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("SESSION_INVALID");
  });

  it("writes a CAPSULE_MUTATION_ADD SUCCESS audit event tied to the actor", async () => {
    const { auth, write } = makeServices();
    const owner = await loginAs(auth);
    const result = await write.createCapsule(owner.token, {
      capsule_type: "PREFERENCE",
      topic_tags: ["audit-check"],
      payload_summary: "summary",
      content: "content",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const events = await prisma.auditEvent.findMany({
      where: {
        actor_entity_id: owner.entity.entity_id,
        target_capsule_id: result.capsule_id,
        event_type: "CAPSULE_MUTATION_ADD",
        outcome: "SUCCESS",
      },
    });
    expect(events.length).toBe(1);
  });

  it("computes payload_size_tokens as ceil(content.length / 4)", async () => {
    const { auth, write } = makeServices();
    const owner = await loginAs(auth);
    // 13 chars -> ceil(13/4) = 4
    const result = await write.createCapsule(owner.token, {
      capsule_type: "PREFERENCE",
      topic_tags: ["sizing"],
      payload_summary: "summary",
      content: "thirteenchars",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const row = await prisma.memoryCapsule.findUnique({
      where: { capsule_id: result.capsule_id },
    });
    expect(row?.payload_size_tokens).toBe(4);
  });

  it("persists requires_validation when set at create time (D-2D-D10-4); defaults to false otherwise", async () => {
    const { auth, write } = makeServices();
    const owner = await loginAs(auth);
    const gated = await write.createCapsule(owner.token, {
      capsule_type: "PREFERENCE",
      topic_tags: ["gated"],
      payload_summary: "summary",
      content: "content",
      requires_validation: true,
    });
    expect(gated.ok).toBe(true);
    if (!gated.ok) return;
    const gatedRow = await prisma.memoryCapsule.findUnique({
      where: { capsule_id: gated.capsule_id },
    });
    expect(gatedRow?.requires_validation).toBe(true);

    const plain = await write.createCapsule(owner.token, {
      capsule_type: "PREFERENCE",
      topic_tags: ["plain"],
      payload_summary: "summary",
      content: "content",
    });
    expect(plain.ok).toBe(true);
    if (!plain.ok) return;
    const plainRow = await prisma.memoryCapsule.findUnique({
      where: { capsule_id: plain.capsule_id },
    });
    expect(plainRow?.requires_validation).toBe(false);
  });
});

describe("updateCapsule -- owner update", () => {
  it("increments version and updates content_hash on content change", async () => {
    const { auth, write } = makeServices();
    const owner = await loginAs(auth);
    const created = await write.createCapsule(owner.token, {
      capsule_type: "PREFERENCE",
      topic_tags: ["v"],
      payload_summary: "summary",
      content: "initial",
    });
    if (!created.ok) throw new Error("create failed");

    const updated = await write.updateCapsule(
      owner.token,
      created.capsule_id,
      { content: "new content body" },
      null,
    );
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    expect(updated.version).toBe(2);
    expect(updated.content_hash).not.toBe(created.content_hash);
  });

  it("stamps previous_version, updated_by, and updated_session_id", async () => {
    const { auth, write } = makeServices();
    const owner = await loginAs(auth);
    const created = await write.createCapsule(owner.token, {
      capsule_type: "PREFERENCE",
      topic_tags: ["attr"],
      payload_summary: "summary",
      content: "first",
    });
    if (!created.ok) throw new Error("create failed");

    await write.updateCapsule(
      owner.token,
      created.capsule_id,
      { content: "second" },
      null,
    );
    const row = await prisma.memoryCapsule.findUnique({
      where: { capsule_id: created.capsule_id },
    });
    expect(row?.previous_version).toBe(1);
    expect(row?.updated_by).toBe(owner.entity.entity_id);
    expect(row?.updated_session_id).not.toBeNull();
  });

  it("rejects update on a non-existent capsule", async () => {
    const { auth, write } = makeServices();
    const owner = await loginAs(auth);
    const result = await write.updateCapsule(
      owner.token,
      "00000000-0000-0000-0000-000000000000",
      { content: "x" },
      null,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("CAPSULE_NOT_FOUND");
  });

  it("flips requires_validation via updateCapsule (D-2D-D10-4 validation gate flag)", async () => {
    const { auth, write } = makeServices();
    const owner = await loginAs(auth);
    const created = await write.createCapsule(owner.token, {
      capsule_type: "PREFERENCE",
      topic_tags: ["gate-toggle"],
      payload_summary: "summary",
      content: "content",
    });
    if (!created.ok) throw new Error("create failed");
    const before = await prisma.memoryCapsule.findUnique({
      where: { capsule_id: created.capsule_id },
    });
    expect(before?.requires_validation).toBe(false);

    const updated = await write.updateCapsule(
      owner.token,
      created.capsule_id,
      { requires_validation: true },
      null,
    );
    expect(updated.ok).toBe(true);
    const after = await prisma.memoryCapsule.findUnique({
      where: { capsule_id: created.capsule_id },
    });
    expect(after?.requires_validation).toBe(true);
  });
});

describe("Attribution is permanent across updates", () => {
  it("created_by stays set to the original creator after an attributed update", async () => {
    const { auth, negotiate, write, declarationStore } = makeServices();
    const owner = await loginAs(auth);
    const editor = await loginAs(auth);

    // Owner creates the capsule.
    const created = await write.createCapsule(owner.token, {
      capsule_type: "PREFERENCE",
      topic_tags: ["attribution"],
      payload_summary: "summary",
      content: "first",
    });
    if (!created.ok) throw new Error("create failed");

    // Owner grants editor a permission with allow_write=true.
    await createPermission({
      capsule_id: created.capsule_id,
      grantor_entity_id: owner.entity.entity_id,
      grantee_entity_id: editor.entity.entity_id,
      access_scope: "FULL",
      duration_type: "TEMPORARY",
      conditions: { allow_write: true },
    });

    // Editor negotiates a declaration.
    const decl = (await negotiate.negotiate(
      editor.token,
      created.capsule_id,
      "FULL",
    )) as NegotiateSuccess;
    expect(await declarationStore.has(decl.declaration_id)).toBe(true);

    // Editor performs an attributed update.
    const updated = await write.updateCapsule(
      editor.token,
      created.capsule_id,
      { content: "edited by editor" },
      decl.declaration_token,
    );
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    expect(updated.write_type).toBe("ATTRIBUTED");

    const row = await prisma.memoryCapsule.findUnique({
      where: { capsule_id: created.capsule_id },
    });
    // created_by must still be the ORIGINAL creator (owner).
    expect(row?.created_by).toBe(owner.entity.entity_id);
    // updated_by reflects the editor.
    expect(row?.updated_by).toBe(editor.entity.entity_id);
    // entity_id (the wallet owner) is never moved by an update.
    expect(row?.entity_id).toBe(owner.entity.entity_id);
  });
});

describe("Attributed write requires a valid declaration + write permission", () => {
  it("rejects an attributed update with no declaration", async () => {
    const { auth, write } = makeServices();
    const owner = await loginAs(auth);
    const editor = await loginAs(auth);
    const created = await write.createCapsule(owner.token, {
      capsule_type: "PREFERENCE",
      topic_tags: ["x"],
      payload_summary: "s",
      content: "first",
    });
    if (!created.ok) throw new Error("create failed");

    const result = await write.updateCapsule(
      editor.token,
      created.capsule_id,
      { content: "no decl" },
      null, // no declaration
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("ACCESS_DECLARATION_INVALID");
  });

  it("rejects an attributed update when the permission lacks allow_write", async () => {
    const { auth, negotiate, write } = makeServices();
    const owner = await loginAs(auth);
    const editor = await loginAs(auth);
    const created = await write.createCapsule(owner.token, {
      capsule_type: "PREFERENCE",
      topic_tags: ["nowrite"],
      payload_summary: "summary",
      content: "first",
    });
    if (!created.ok) throw new Error("create failed");

    // Permission WITHOUT allow_write.
    await createPermission({
      capsule_id: created.capsule_id,
      grantor_entity_id: owner.entity.entity_id,
      grantee_entity_id: editor.entity.entity_id,
      access_scope: "FULL",
      duration_type: "TEMPORARY",
    });
    const decl = (await negotiate.negotiate(
      editor.token,
      created.capsule_id,
      "FULL",
    )) as NegotiateSuccess;

    const result = await write.updateCapsule(
      editor.token,
      created.capsule_id,
      { content: "should fail" },
      decl.declaration_token,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("WRITE_NOT_PERMITTED");
  });

  it("rejects when the declaration is for a different capsule", async () => {
    const { auth, negotiate, write } = makeServices();
    const owner = await loginAs(auth);
    const editor = await loginAs(auth);
    const a = await write.createCapsule(owner.token, {
      capsule_type: "PREFERENCE",
      topic_tags: ["a"],
      payload_summary: "a",
      content: "a",
    });
    const b = await write.createCapsule(owner.token, {
      capsule_type: "PREFERENCE",
      topic_tags: ["b"],
      payload_summary: "b",
      content: "b",
    });
    if (!a.ok || !b.ok) throw new Error("create failed");

    await createPermission({
      capsule_id: a.capsule_id,
      grantor_entity_id: owner.entity.entity_id,
      grantee_entity_id: editor.entity.entity_id,
      access_scope: "FULL",
      duration_type: "TEMPORARY",
      conditions: { allow_write: true },
    });
    const declForA = (await negotiate.negotiate(
      editor.token,
      a.capsule_id,
      "FULL",
    )) as NegotiateSuccess;

    // Try to use A's declaration to update B.
    const result = await write.updateCapsule(
      editor.token,
      b.capsule_id,
      { content: "wrong target" },
      declForA.declaration_token,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("ACCESS_DECLARATION_MISMATCH");
  });
});

// ===========================================================================
// G1.5 — mutation discrimination test coverage per Founder Q-locks Q-G1.5-α
// through Q-G1.5-η at [CAPSULE-MUTATION-TESTS-G1.5-QLOCK]. Tests prove
// production-observable behavior of ADR-0042 mutation discrimination through
// public createCapsule / updateCapsule API only; private helpers
// (discriminateMutation / canonicalCapsuleMutationRecord / plaintextHash /
// VersionConflictError) are NOT exported per Q-G1.5-α LOCK.
// ===========================================================================

describe("G1.5 — mutation discrimination (Q-G1.5-α through Q-G1.5-η)", () => {
  // U1 — createCapsule persists mutation_type = "ADD" on the row.
  // Asserts row-state observability of G1.3 Phase 4 createCapsule mutation
  // discrimination through prisma.memoryCapsule.findUnique row read.
  it("U1: createCapsule persists mutation_type = 'ADD' on the MemoryCapsule row", async () => {
    const { auth, write } = makeServices();
    const owner = await loginAs(auth);
    const result = await write.createCapsule(owner.token, {
      capsule_type: "PREFERENCE",
      topic_tags: ["g1.5-u1"],
      payload_summary: "summary",
      content: "u1-content",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const row = await prisma.memoryCapsule.findUnique({
      where: { capsule_id: result.capsule_id },
      select: {
        mutation_type: true,
        version: true,
        previous_version: true,
      },
    });
    expect(row?.mutation_type).toBe("ADD");
    expect(row?.version).toBe(1);
    expect(row?.previous_version).toBeNull();
  });

  // U2 — updateCapsule with content change → CAPSULE_MUTATION_UPDATE +
  // mutation_type "UPDATE" + version+1 + previous_version + storage write.
  // Verifies G1.3 Phase 6 UPDATE branch full pipeline via row state +
  // audit event + contentStore.write spy.
  it("U2: updateCapsule with content change emits CAPSULE_MUTATION_UPDATE + persists mutation_type UPDATE + version increments + storage write occurs", async () => {
    const { auth, write, contentStore } = makeServices();
    const owner = await loginAs(auth);
    const create = await write.createCapsule(owner.token, {
      capsule_type: "PREFERENCE",
      topic_tags: ["g1.5-u2"],
      payload_summary: "summary",
      content: "u2-original-content",
    });
    expect(create.ok).toBe(true);
    if (!create.ok) return;

    const writeSpy = vi.spyOn(contentStore, "write");

    const update = await write.updateCapsule(
      owner.token,
      create.capsule_id,
      { content: "u2-new-content-different" },
      null,
    );
    expect(update.ok).toBe(true);
    if (!update.ok) return;

    const row = await prisma.memoryCapsule.findUnique({
      where: { capsule_id: create.capsule_id },
      select: {
        mutation_type: true,
        version: true,
        previous_version: true,
        content_hash: true,
      },
    });
    expect(row?.mutation_type).toBe("UPDATE");
    expect(row?.version).toBe(2);
    expect(row?.previous_version).toBe(1);
    expect(row?.content_hash).not.toBe(create.content_hash);

    const audit = await prisma.auditEvent.findFirst({
      where: {
        target_capsule_id: create.capsule_id,
        event_type: "CAPSULE_MUTATION_UPDATE",
        outcome: "SUCCESS",
      },
    });
    expect(audit).not.toBeNull();

    // UPDATE branch must call contentStore.write exactly once (the
    // re-encrypted ciphertext write).
    expect(writeSpy).toHaveBeenCalledTimes(1);
    writeSpy.mockRestore();
  });

  // U3 — updateCapsule with metadata-only change → CAPSULE_MUTATION_MERGE +
  // mutation_type "MERGE" + version+1 + content_hash UNCHANGED + storage
  // write SKIPPED. Verifies G1.3 Phase 6 MERGE branch substrate.
  it("U3: updateCapsule with metadata-only change emits CAPSULE_MUTATION_MERGE + persists mutation_type MERGE + version increments + storage write skipped", async () => {
    const { auth, write, contentStore } = makeServices();
    const owner = await loginAs(auth);
    const create = await write.createCapsule(owner.token, {
      capsule_type: "PREFERENCE",
      topic_tags: ["g1.5-u3-original"],
      payload_summary: "summary",
      content: "u3-content",
    });
    expect(create.ok).toBe(true);
    if (!create.ok) return;

    const writeSpy = vi.spyOn(contentStore, "write");

    // Change a non-content mutation-relevant field (decay_rate). Content
    // is UNCHANGED → MERGE branch should fire.
    const update = await write.updateCapsule(
      owner.token,
      create.capsule_id,
      { decay_rate: 0.5 },
      null,
    );
    expect(update.ok).toBe(true);
    if (!update.ok) return;

    const row = await prisma.memoryCapsule.findUnique({
      where: { capsule_id: create.capsule_id },
      select: {
        mutation_type: true,
        version: true,
        previous_version: true,
        content_hash: true,
        decay_rate: true,
      },
    });
    expect(row?.mutation_type).toBe("MERGE");
    expect(row?.version).toBe(2);
    expect(row?.previous_version).toBe(1);
    expect(row?.content_hash).toBe(create.content_hash);
    expect(row?.decay_rate).toBe(0.5);

    const audit = await prisma.auditEvent.findFirst({
      where: {
        target_capsule_id: create.capsule_id,
        event_type: "CAPSULE_MUTATION_MERGE",
        outcome: "SUCCESS",
      },
    });
    expect(audit).not.toBeNull();

    // MERGE branch must NOT call contentStore.write (no re-encryption).
    expect(writeSpy).not.toHaveBeenCalled();
    writeSpy.mockRestore();
  });

  // U4 — updateCapsule with no delta → CAPSULE_MUTATION_NOOP +
  // zero DB update + zero version increment + zero storage write +
  // mutation_type UNCHANGED on row. Verifies G1.3 Phase 6 NOOP branch
  // substrate per ADR-0042 §Sub-decision Q-δ LOCK.
  it("U4: updateCapsule with no delta emits CAPSULE_MUTATION_NOOP + zero DB update + zero version increment + zero storage write", async () => {
    const { auth, write, contentStore } = makeServices();
    const owner = await loginAs(auth);
    const create = await write.createCapsule(owner.token, {
      capsule_type: "PREFERENCE",
      topic_tags: ["g1.5-u4"],
      payload_summary: "u4-summary-noop",
      content: "u4-noop-content",
    });
    expect(create.ok).toBe(true);
    if (!create.ok) return;

    const writeSpy = vi.spyOn(contentStore, "write");

    // Same content + same payload_summary = NOOP (content unchanged +
    // canonical record unchanged).
    const update = await write.updateCapsule(
      owner.token,
      create.capsule_id,
      { content: "u4-noop-content", payload_summary: "u4-summary-noop" },
      null,
    );
    expect(update.ok).toBe(true);
    if (!update.ok) return;

    const row = await prisma.memoryCapsule.findUnique({
      where: { capsule_id: create.capsule_id },
      select: {
        mutation_type: true,
        version: true,
        previous_version: true,
        content_hash: true,
      },
    });
    // NOOP preserves existing mutation_type ("ADD" from creation) per
    // Q-G1.3-ζ LOCK: zero DB write.
    expect(row?.mutation_type).toBe("ADD");
    expect(row?.version).toBe(1);
    expect(row?.previous_version).toBeNull();
    expect(row?.content_hash).toBe(create.content_hash);

    const audit = await prisma.auditEvent.findFirst({
      where: {
        target_capsule_id: create.capsule_id,
        event_type: "CAPSULE_MUTATION_NOOP",
        outcome: "SUCCESS",
      },
    });
    expect(audit).not.toBeNull();

    // NOOP branch must NOT call contentStore.write.
    expect(writeSpy).not.toHaveBeenCalled();
    writeSpy.mockRestore();
  });

  // U5 — updateCapsule with matching expected_version succeeds. Verifies
  // opt-in OCC happy path per ADR-0042 §Sub-decision Q-η + Q-G1.3-η LOCK.
  it("U5: updateCapsule with matching expected_version succeeds", async () => {
    const { auth, write } = makeServices();
    const owner = await loginAs(auth);
    const create = await write.createCapsule(owner.token, {
      capsule_type: "PREFERENCE",
      topic_tags: ["g1.5-u5"],
      payload_summary: "summary",
      content: "u5-content",
    });
    expect(create.ok).toBe(true);
    if (!create.ok) return;

    const update = await write.updateCapsule(
      owner.token,
      create.capsule_id,
      { content: "u5-new-content", expected_version: 1 },
      null,
    );
    expect(update.ok).toBe(true);
    if (!update.ok) return;
    expect(update.version).toBe(2);
  });

  // U6 — updateCapsule with stale expected_version → CAPSULE_VERSION_CONFLICT
  // failure + emits CAPSULE_MUTATION_UPDATE DENIED audit with
  // expected_version + actual_version in details. Verifies G1.3 Phase 6
  // expected_version pre-check fast-fail + V5 Patch 1 DENIED audit
  // emission path.
  it("U6: updateCapsule with stale expected_version returns CAPSULE_VERSION_CONFLICT + emits DENIED audit", async () => {
    const { auth, write } = makeServices();
    const owner = await loginAs(auth);
    const create = await write.createCapsule(owner.token, {
      capsule_type: "PREFERENCE",
      topic_tags: ["g1.5-u6"],
      payload_summary: "summary",
      content: "u6-content",
    });
    expect(create.ok).toBe(true);
    if (!create.ok) return;

    const update = await write.updateCapsule(
      owner.token,
      create.capsule_id,
      { content: "u6-new-content", expected_version: 999 },
      null,
    );
    expect(update.ok).toBe(false);
    if (update.ok) return;
    expect(update.code).toBe("CAPSULE_VERSION_CONFLICT");

    const audit = await prisma.auditEvent.findFirst({
      where: {
        target_capsule_id: create.capsule_id,
        event_type: "CAPSULE_MUTATION_UPDATE",
        outcome: "DENIED",
        denial_reason: "CAPSULE_VERSION_CONFLICT",
      },
    });
    expect(audit).not.toBeNull();
    const details = audit?.details as Record<string, unknown>;
    expect(details?.expected_version).toBe(999);
    expect(details?.actual_version).toBe(1);
  });

  // U7 — σ-A existing-content-unreadable forces UPDATE with audit
  // reason "existing_content_unreadable". Mocks contentStore.read to
  // return null (simulates storage object missing) → ADR-0042 §G1.4
  // Correction 8 Q-G1.3-σ σ-A conservative-changed LOCK should force
  // UPDATE branch with observability reason in audit details.
  it("U7: σ-A existing-content-unreadable forces UPDATE path with reason 'existing_content_unreadable'", async () => {
    const { auth, write, contentStore } = makeServices();
    const owner = await loginAs(auth);
    const create = await write.createCapsule(owner.token, {
      capsule_type: "PREFERENCE",
      topic_tags: ["g1.5-u7"],
      payload_summary: "summary",
      content: "u7-content",
    });
    expect(create.ok).toBe(true);
    if (!create.ok) return;

    // Mock contentStore.read to return null for the NEXT call only
    // (which will be the discrimination read in updateCapsule).
    const readSpy = vi.spyOn(contentStore, "read").mockResolvedValueOnce(null);

    const update = await write.updateCapsule(
      owner.token,
      create.capsule_id,
      { content: "u7-new-content" },
      null,
    );
    expect(update.ok).toBe(true);
    if (!update.ok) return;

    const audit = await prisma.auditEvent.findFirst({
      where: {
        target_capsule_id: create.capsule_id,
        event_type: "CAPSULE_MUTATION_UPDATE",
        outcome: "SUCCESS",
      },
    });
    expect(audit).not.toBeNull();
    const details = audit?.details as Record<string, unknown>;
    expect(details?.reason).toBe("existing_content_unreadable");

    expect(readSpy).toHaveBeenCalledTimes(1);
    readSpy.mockRestore();
  });

  // U8 — createCapsule audit details NEVER contain plaintext sentinel.
  // Verifies RULE 0 plaintext-confidentiality boundary discipline at the
  // audit-details register per ADR-0042 G1.3 Correction 3 + Q-G1.3-ο
  // minimalism LOCK.
  it("U8: createCapsule audit details NEVER contain plaintext sentinel", async () => {
    const { auth, write } = makeServices();
    const owner = await loginAs(auth);
    const SENTINEL = `NIOV_TEST_SENTINEL_${randomBytes(16).toString("hex")}`;
    const create = await write.createCapsule(owner.token, {
      capsule_type: "PREFERENCE",
      topic_tags: ["g1.5-u8"],
      payload_summary: "summary",
      content: SENTINEL,
    });
    expect(create.ok).toBe(true);
    if (!create.ok) return;

    const auditRows = await prisma.auditEvent.findMany({
      where: { target_capsule_id: create.capsule_id },
    });
    const serialized = JSON.stringify(auditRows.map((r) => r.details));
    expect(serialized.indexOf(SENTINEL)).toBe(-1);
  });

  // U9 — NOOP audit details NEVER contain plaintext sentinel. Verifies
  // plaintext-confidentiality boundary on the NOOP path (which derives
  // plaintext from existing ciphertext via decrypt + hash, NEVER persists
  // the plaintext value itself).
  it("U9: NOOP audit details NEVER contain plaintext sentinel", async () => {
    const { auth, write } = makeServices();
    const owner = await loginAs(auth);
    const SENTINEL = `NIOV_TEST_SENTINEL_${randomBytes(16).toString("hex")}`;
    const create = await write.createCapsule(owner.token, {
      capsule_type: "PREFERENCE",
      topic_tags: ["g1.5-u9"],
      payload_summary: "summary",
      content: SENTINEL,
    });
    expect(create.ok).toBe(true);
    if (!create.ok) return;

    const update = await write.updateCapsule(
      owner.token,
      create.capsule_id,
      { content: SENTINEL, payload_summary: "summary" },
      null,
    );
    expect(update.ok).toBe(true);
    if (!update.ok) return;

    const noopRow = await prisma.auditEvent.findFirst({
      where: {
        target_capsule_id: create.capsule_id,
        event_type: "CAPSULE_MUTATION_NOOP",
      },
    });
    expect(noopRow).not.toBeNull();
    expect(JSON.stringify(noopRow?.details).indexOf(SENTINEL)).toBe(-1);
  });

  // U10 — NOOP audit details include plaintext probe hashes as 64-char hex
  // values (NOT raw plaintext). Verifies ADR-0042 G1.3 Correction 3e
  // hash-name-suffix discipline: distinguishes plaintext_probe_hash vs
  // ciphertext_content_hash. For NOOP, the two probe hashes must EQUAL
  // each other (plaintext equivalence is the NOOP discriminator).
  it("U10: NOOP audit details include plaintext probe hashes as 64-char hex values, not raw plaintext", async () => {
    const { auth, write } = makeServices();
    const owner = await loginAs(auth);
    const create = await write.createCapsule(owner.token, {
      capsule_type: "PREFERENCE",
      topic_tags: ["g1.5-u10"],
      payload_summary: "summary",
      content: "u10-content",
    });
    expect(create.ok).toBe(true);
    if (!create.ok) return;

    const update = await write.updateCapsule(
      owner.token,
      create.capsule_id,
      { content: "u10-content", payload_summary: "summary" },
      null,
    );
    expect(update.ok).toBe(true);
    if (!update.ok) return;

    const noopRow = await prisma.auditEvent.findFirst({
      where: {
        target_capsule_id: create.capsule_id,
        event_type: "CAPSULE_MUTATION_NOOP",
      },
    });
    expect(noopRow).not.toBeNull();
    const details = noopRow?.details as Record<string, unknown>;
    expect(details?.existing_plaintext_probe_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(details?.proposed_plaintext_probe_hash).toMatch(/^[0-9a-f]{64}$/);
    // NOOP fires only when plaintext probe hashes EQUAL (per
    // discriminateMutation contract).
    expect(details?.existing_plaintext_probe_hash).toBe(
      details?.proposed_plaintext_probe_hash,
    );
  });

  // U11 — encryption non-determinism: identical plaintext produces
  // different ciphertext content_hash across calls. Verifies ADR-0042 G1.3
  // Correction 3a per packages/auth/src/crypto.ts:35 randomBytes(12) per-IV
  // AES-256-GCM safety requirement (and proves why plaintext-to-plaintext
  // NOOP comparison is necessary).
  it("U11: encryption non-determinism — identical plaintext produces different ciphertext content_hash across calls", async () => {
    const { auth, write } = makeServices();
    const owner1 = await loginAs(auth);
    const owner2 = await loginAs(auth);
    const identicalContent = "u11-identical-plaintext";

    const create1 = await write.createCapsule(owner1.token, {
      capsule_type: "PREFERENCE",
      topic_tags: ["g1.5-u11-a"],
      payload_summary: "summary",
      content: identicalContent,
    });
    const create2 = await write.createCapsule(owner2.token, {
      capsule_type: "PREFERENCE",
      topic_tags: ["g1.5-u11-b"],
      payload_summary: "summary",
      content: identicalContent,
    });
    expect(create1.ok).toBe(true);
    expect(create2.ok).toBe(true);
    if (!create1.ok || !create2.ok) return;
    // Different IVs per encrypt() call → different ciphertext →
    // different sha256(ciphertext) → different content_hash.
    expect(create1.content_hash).not.toBe(create2.content_hash);
  });
});

// ===========================================================================
// G3.5 — embedding write integration via mutation_type matrix per ADR-0043
// §Sub-decision 11 (Q-G3-κ) + 12 Q-G3.5-α through Q-G3.5-λ LOCKS at
// [CAPSULE-EMBEDDING-WRITE-G3.5-QLOCK]. E7 + E8 test titles are verbatim-
// stable for Gate 24 Part B isolation (V3 verifier locates each block by
// exact name and verifies the 4 degrade-proof conditions inside).
// ===========================================================================

// WHAT: Build a 1536-dim numeric vector for the spy provider success path.
// INPUT: A seed string (used to vary the vector across invocations).
// OUTPUT: number[] of length 1536 in the range (-1, 1).
// WHY: E1-E6 + E9 need a deterministic non-null vector to assert the
//      raw-SQL persistence + audit-metadata wiring without depending on
//      FixtureBasedEmbeddingProvider's strict fixtureKey enforcement.
function buildStubVector(seed: string): number[] {
  const v: number[] = [];
  for (let i = 0; i < 1536; i++) {
    // Math.sin/cos hash blend keeps values in (-1, 1); seed varies the
    // signature so duplicate-call detection works in E1.
    v.push(Math.sin(i * 0.001 + seed.length * 0.01));
  }
  return v;
}

describe("G3.5 — embedding write integration (Q-G3.5 mutation_type matrix)", () => {
  it("E1 createCapsule calls embeddingProvider.generateEmbedding once", async () => {
    const generateEmbedding = vi.fn(
      async (): Promise<EmbeddingResult> => ({
        ok: true,
        vector: buildStubVector("e1"),
        model: "text-embedding-3-small",
        dimensions: 1536 as const,
        tokens_used: 7,
      }),
    );
    const provider: EmbeddingProvider = { generateEmbedding };
    const { auth, write } = makeServices(provider);
    const owner = await loginAs(auth);

    const result = await write.createCapsule(owner.token, {
      capsule_type: "PREFERENCE",
      topic_tags: ["g3.5-e1"],
      payload_summary: "summary",
      content: "e1-content",
    });
    expect(result.ok).toBe(true);
    expect(generateEmbedding).toHaveBeenCalledTimes(1);
  });

  it("E2 createCapsule audit metadata includes embedding_generated + model + dimensions + tokens_used on success", async () => {
    const provider: EmbeddingProvider = {
      generateEmbedding: async (): Promise<EmbeddingResult> => ({
        ok: true,
        vector: buildStubVector("e2"),
        model: "text-embedding-3-small",
        dimensions: 1536 as const,
        tokens_used: 9,
      }),
    };
    const { auth, write } = makeServices(provider);
    const owner = await loginAs(auth);

    const result = await write.createCapsule(owner.token, {
      capsule_type: "PREFERENCE",
      topic_tags: ["g3.5-e2"],
      payload_summary: "summary",
      content: "e2-content",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const audit = await prisma.auditEvent.findFirst({
      where: {
        target_capsule_id: result.capsule_id,
        event_type: "CAPSULE_MUTATION_ADD",
        outcome: "SUCCESS",
      },
    });
    const details = audit?.details as Record<string, unknown>;
    expect(details.embedding_generated).toBe(true);
    expect(details.embedding_model).toBe("text-embedding-3-small");
    expect(details.embedding_dimensions).toBe(1536);
    expect(details.embedding_tokens_used).toBe(9);
  });

  it("E3 createCapsule audit details never contain raw vector or vector_hash", async () => {
    const provider: EmbeddingProvider = {
      generateEmbedding: async (): Promise<EmbeddingResult> => ({
        ok: true,
        vector: buildStubVector("e3"),
        model: "text-embedding-3-small",
        dimensions: 1536 as const,
        tokens_used: 5,
      }),
    };
    const { auth, write } = makeServices(provider);
    const owner = await loginAs(auth);

    const result = await write.createCapsule(owner.token, {
      capsule_type: "PREFERENCE",
      topic_tags: ["g3.5-e3"],
      payload_summary: "summary",
      content: "e3-content-secret",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const auditRows = await prisma.auditEvent.findMany({
      where: { target_capsule_id: result.capsule_id },
    });
    const serialized = JSON.stringify(auditRows.map((r) => r.details));
    expect(serialized).not.toContain("vector_hash");
    expect(serialized).not.toContain("embedding_sample");
    expect(serialized).not.toContain("embedding_first_");
    expect(serialized).not.toContain("vector_dim_");
    // The vector itself (large number array) MUST NOT appear in
    // serialized audit details.
    expect(serialized).not.toMatch(/\[(-?\d+\.\d+,){10,}/);
  });

  it("E4 updateCapsule UPDATE calls embeddingProvider.generateEmbedding once", async () => {
    const generateEmbedding = vi.fn(
      async (): Promise<EmbeddingResult> => ({
        ok: true,
        vector: buildStubVector("e4"),
        model: "text-embedding-3-small",
        dimensions: 1536 as const,
        tokens_used: 3,
      }),
    );
    const provider: EmbeddingProvider = { generateEmbedding };
    const { auth, write } = makeServices(provider);
    const owner = await loginAs(auth);
    const create = await write.createCapsule(owner.token, {
      capsule_type: "PREFERENCE",
      topic_tags: ["g3.5-e4"],
      payload_summary: "summary",
      content: "e4-original",
    });
    if (!create.ok) throw new Error("create failed");
    generateEmbedding.mockClear();

    const update = await write.updateCapsule(
      owner.token,
      create.capsule_id,
      { content: "e4-new-content" },
      null,
    );
    expect(update.ok).toBe(true);
    // Exactly one call: the UPDATE branch.
    expect(generateEmbedding).toHaveBeenCalledTimes(1);
  });

  it("E5 updateCapsule MERGE skips embeddingProvider and audits embedding_skip_reason", async () => {
    const generateEmbedding = vi.fn(
      async (): Promise<EmbeddingResult> => ({
        ok: true,
        vector: buildStubVector("e5"),
        model: "text-embedding-3-small",
        dimensions: 1536 as const,
        tokens_used: 2,
      }),
    );
    const provider: EmbeddingProvider = { generateEmbedding };
    const { auth, write } = makeServices(provider);
    const owner = await loginAs(auth);
    const create = await write.createCapsule(owner.token, {
      capsule_type: "PREFERENCE",
      topic_tags: ["g3.5-e5"],
      payload_summary: "summary",
      content: "e5-content",
    });
    if (!create.ok) throw new Error("create failed");
    generateEmbedding.mockClear();

    // MERGE: change a non-content field (decay_rate); content unchanged.
    const update = await write.updateCapsule(
      owner.token,
      create.capsule_id,
      { decay_rate: 0.42 },
      null,
    );
    expect(update.ok).toBe(true);
    // MERGE branch must NOT call the provider.
    expect(generateEmbedding).not.toHaveBeenCalled();

    const audit = await prisma.auditEvent.findFirst({
      where: {
        target_capsule_id: create.capsule_id,
        event_type: "CAPSULE_MUTATION_MERGE",
        outcome: "SUCCESS",
      },
    });
    const details = audit?.details as Record<string, unknown>;
    expect(details.embedding_generated).toBe(false);
    expect(details.embedding_skip_reason).toBe(
      "merge_metadata_only_content_unchanged",
    );
  });

  it("E6 updateCapsule NOOP skips embeddingProvider entirely", async () => {
    const generateEmbedding = vi.fn(
      async (): Promise<EmbeddingResult> => ({
        ok: true,
        vector: buildStubVector("e6"),
        model: "text-embedding-3-small",
        dimensions: 1536 as const,
        tokens_used: 4,
      }),
    );
    const provider: EmbeddingProvider = { generateEmbedding };
    const { auth, write } = makeServices(provider);
    const owner = await loginAs(auth);
    const create = await write.createCapsule(owner.token, {
      capsule_type: "PREFERENCE",
      topic_tags: ["g3.5-e6"],
      payload_summary: "e6-summary",
      content: "e6-noop-content",
    });
    if (!create.ok) throw new Error("create failed");
    generateEmbedding.mockClear();

    // NOOP: same content + same payload_summary; content_hash unchanged;
    // canonical_record unchanged.
    const update = await write.updateCapsule(
      owner.token,
      create.capsule_id,
      { content: "e6-noop-content", payload_summary: "e6-summary" },
      null,
    );
    expect(update.ok).toBe(true);
    expect(generateEmbedding).not.toHaveBeenCalled();
  });

  it("E7 createCapsule continues when embedding generation fails", async () => {
    const provider: EmbeddingProvider = {
      generateEmbedding: async (): Promise<EmbeddingResult> => ({
        ok: false,
        error_class: "PROVIDER_ERROR",
        message: "simulated upstream provider outage (E7)",
      }),
    };
    const { auth, write } = makeServices(provider);
    const owner = await loginAs(auth);

    const result = await write.createCapsule(owner.token, {
      capsule_type: "PREFERENCE",
      topic_tags: ["g3.5-e7"],
      payload_summary: "summary",
      content: "e7-content",
    });
    // Degrade-on-failure per Q-G3.5-α: capsule write SUCCEEDS even
    // though the embedding provider returned ok: false.
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.capsule_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );

    const audit = await prisma.auditEvent.findFirst({
      where: {
        target_capsule_id: result.capsule_id,
        event_type: "CAPSULE_MUTATION_ADD",
        outcome: "SUCCESS",
      },
    });
    const details = audit?.details as Record<string, unknown>;
    expect(details.embedding_generated).toBe(false);
    expect(details.embedding_failure_class).toBe("PROVIDER_ERROR");
    expect(details.embedding_failure_message).toBe(
      "simulated upstream provider outage (E7)",
    );
  });

  it("E8 updateCapsule UPDATE continues when embedding generation fails", async () => {
    const calls: Array<{ phase: string }> = [];
    let phase: "create" | "update" = "create";
    const provider: EmbeddingProvider = {
      generateEmbedding: async (): Promise<EmbeddingResult> => {
        calls.push({ phase });
        if (phase === "create") {
          return {
            ok: true,
            vector: buildStubVector("e8-create"),
            model: "text-embedding-3-small",
            dimensions: 1536 as const,
            tokens_used: 6,
          };
        }
        return {
          ok: false,
          error_class: "RATE_LIMIT",
          message: "simulated rate limit on UPDATE (E8)",
        };
      },
    };
    const { auth, write } = makeServices(provider);
    const owner = await loginAs(auth);
    const create = await write.createCapsule(owner.token, {
      capsule_type: "PREFERENCE",
      topic_tags: ["g3.5-e8"],
      payload_summary: "summary",
      content: "e8-original",
    });
    if (!create.ok) throw new Error("create failed");

    phase = "update";
    const result = await write.updateCapsule(
      owner.token,
      create.capsule_id,
      { content: "e8-new-content" },
      null,
    );
    // Degrade-on-failure per Q-G3.5-α: capsule UPDATE SUCCEEDS even
    // though the embedding provider returned ok: false.
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const audit = await prisma.auditEvent.findFirst({
      where: {
        target_capsule_id: create.capsule_id,
        event_type: "CAPSULE_MUTATION_UPDATE",
        outcome: "SUCCESS",
      },
    });
    const details = audit?.details as Record<string, unknown>;
    expect(details.embedding_generated).toBe(false);
    expect(details.embedding_failure_class).toBe("RATE_LIMIT");
    expect(details.embedding_failure_message).toBe(
      "simulated rate limit on UPDATE (E8)",
    );
  });

  it("E9 WriteSuccess response shape never contains vector or embedding fields", async () => {
    const provider: EmbeddingProvider = {
      generateEmbedding: async (): Promise<EmbeddingResult> => ({
        ok: true,
        vector: buildStubVector("e9"),
        model: "text-embedding-3-small",
        dimensions: 1536 as const,
        tokens_used: 1,
      }),
    };
    const { auth, write } = makeServices(provider);
    const owner = await loginAs(auth);
    const create = await write.createCapsule(owner.token, {
      capsule_type: "PREFERENCE",
      topic_tags: ["g3.5-e9"],
      payload_summary: "summary",
      content: "e9-content",
    });
    expect(create.ok).toBe(true);
    if (!create.ok) return;
    const responseKeys = Object.keys(create);
    // No vector / embedding field at HTTP response shape boundary
    // per Q-G3-ζ + Q-G3.5-η + RULE 0.
    expect(responseKeys).not.toContain("vector");
    expect(responseKeys).not.toContain("embedding");
    expect(responseKeys).not.toContain("embedding_vector");

    const update = await write.updateCapsule(
      owner.token,
      create.capsule_id,
      { content: "e9-updated" },
      null,
    );
    expect(update.ok).toBe(true);
    if (!update.ok) return;
    const updateKeys = Object.keys(update);
    expect(updateKeys).not.toContain("vector");
    expect(updateKeys).not.toContain("embedding");
    expect(updateKeys).not.toContain("embedding_vector");
  });
});

// G5.3 -- embedding lag metadata at write-tier per ADR-0045 §G5.3
// Q-G5.3-α α-1 + γ-1 + δ-3 + ε-1 + ζ-1 + η-1 + θ-1 LOCKs.
// Detection-only metadata. No filtering / ranking / lifecycle /
// audit literal expansion. RULE 0 preserved (Q-G5-η canonical).
describe("G5.3 -- embedding lag metadata (Q-G5.3 LOCKs)", () => {
  function buildLagVector(seed: string): number[] {
    const arr = new Array<number>(1536);
    let h = 0;
    for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    for (let i = 0; i < 1536; i++) {
      arr[i] = ((h ^ (i * 2654435761)) >>> 0) / 0xffffffff;
    }
    return arr;
  }

  it("L1: createCapsule success populates embedding_content_hash = content_hash + embedding_generated_at NOT NULL", async () => {
    const provider: EmbeddingProvider = {
      generateEmbedding: async (): Promise<EmbeddingResult> => ({
        ok: true,
        vector: buildLagVector("l1"),
        model: "text-embedding-3-small",
        dimensions: 1536 as const,
        tokens_used: 1,
      }),
    };
    const { auth, write } = makeServices(provider);
    const owner = await loginAs(auth);
    const create = await write.createCapsule(owner.token, {
      capsule_type: "PREFERENCE",
      topic_tags: ["g5.3-l1"],
      payload_summary: "summary",
      content: "l1-content",
    });
    expect(create.ok).toBe(true);
    if (!create.ok) return;
    const row = await prisma.memoryCapsule.findUnique({
      where: { capsule_id: create.capsule_id },
      select: {
        content_hash: true,
        embedding_content_hash: true,
        embedding_generated_at: true,
      },
    });
    expect(row?.embedding_content_hash).toBe(row?.content_hash);
    expect(row?.embedding_generated_at).toBeInstanceOf(Date);
  });

  it("L2: createCapsule provider failure leaves embedding_content_hash NULL + embedding_generated_at NULL", async () => {
    const provider: EmbeddingProvider = {
      generateEmbedding: async (): Promise<EmbeddingResult> => ({
        ok: false,
        error_class: "PROVIDER_ERROR",
        message: "simulated provider failure L2",
      }),
    };
    const { auth, write } = makeServices(provider);
    const owner = await loginAs(auth);
    const create = await write.createCapsule(owner.token, {
      capsule_type: "PREFERENCE",
      topic_tags: ["g5.3-l2"],
      payload_summary: "summary",
      content: "l2-content",
    });
    expect(create.ok).toBe(true);
    if (!create.ok) return;
    const row = await prisma.memoryCapsule.findUnique({
      where: { capsule_id: create.capsule_id },
      select: {
        embedding_content_hash: true,
        embedding_generated_at: true,
      },
    });
    expect(row?.embedding_content_hash).toBeNull();
    expect(row?.embedding_generated_at).toBeNull();
  });

  it("L3: updateCapsule UPDATE success regenerates embedding_content_hash + embedding_generated_at", async () => {
    const provider: EmbeddingProvider = {
      generateEmbedding: async (): Promise<EmbeddingResult> => ({
        ok: true,
        vector: buildLagVector("l3"),
        model: "text-embedding-3-small",
        dimensions: 1536 as const,
        tokens_used: 1,
      }),
    };
    const { auth, write } = makeServices(provider);
    const owner = await loginAs(auth);
    const create = await write.createCapsule(owner.token, {
      capsule_type: "PREFERENCE",
      topic_tags: ["g5.3-l3"],
      payload_summary: "summary",
      content: "l3-content-original",
    });
    expect(create.ok).toBe(true);
    if (!create.ok) return;
    const createRow = await prisma.memoryCapsule.findUnique({
      where: { capsule_id: create.capsule_id },
      select: {
        content_hash: true,
        embedding_content_hash: true,
        embedding_generated_at: true,
      },
    });
    const oldGeneratedAt = createRow?.embedding_generated_at as Date;
    await new Promise((resolve) => setTimeout(resolve, 5));
    const update = await write.updateCapsule(
      owner.token,
      create.capsule_id,
      { content: "l3-content-updated" },
      null,
    );
    expect(update.ok).toBe(true);
    if (!update.ok) return;
    const updateRow = await prisma.memoryCapsule.findUnique({
      where: { capsule_id: create.capsule_id },
      select: {
        content_hash: true,
        embedding_content_hash: true,
        embedding_generated_at: true,
      },
    });
    expect(updateRow?.content_hash).not.toBe(createRow?.content_hash);
    expect(updateRow?.embedding_content_hash).toBe(
      updateRow?.content_hash,
    );
    expect(
      (updateRow?.embedding_generated_at as Date).getTime(),
    ).toBeGreaterThan(oldGeneratedAt.getTime());
  });

  it("L4: updateCapsule UPDATE failure preserves OLD embedding lag fields; stale-detectable via embedding_content_hash != content_hash", async () => {
    let callCount = 0;
    const provider: EmbeddingProvider = {
      generateEmbedding: async (): Promise<EmbeddingResult> => {
        callCount++;
        if (callCount === 1) {
          return {
            ok: true,
            vector: buildLagVector("l4-first"),
            model: "text-embedding-3-small",
            dimensions: 1536 as const,
            tokens_used: 1,
          };
        }
        return {
          ok: false,
          error_class: "RATE_LIMIT",
          message: "simulated rate limit on L4 UPDATE",
        };
      },
    };
    const { auth, write } = makeServices(provider);
    const owner = await loginAs(auth);
    const create = await write.createCapsule(owner.token, {
      capsule_type: "PREFERENCE",
      topic_tags: ["g5.3-l4"],
      payload_summary: "summary",
      content: "l4-content-original",
    });
    expect(create.ok).toBe(true);
    if (!create.ok) return;
    const createRow = await prisma.memoryCapsule.findUnique({
      where: { capsule_id: create.capsule_id },
      select: {
        content_hash: true,
        embedding_content_hash: true,
        embedding_generated_at: true,
      },
    });
    const oldContentHash = createRow?.content_hash as string;
    const oldEmbeddingContentHash = createRow?.embedding_content_hash as string;
    const update = await write.updateCapsule(
      owner.token,
      create.capsule_id,
      { content: "l4-content-updated" },
      null,
    );
    expect(update.ok).toBe(true);
    if (!update.ok) return;
    const updateRow = await prisma.memoryCapsule.findUnique({
      where: { capsule_id: create.capsule_id },
      select: {
        content_hash: true,
        embedding_content_hash: true,
        embedding_generated_at: true,
      },
    });
    expect(updateRow?.content_hash).not.toBe(oldContentHash);
    expect(updateRow?.embedding_content_hash).toBe(oldEmbeddingContentHash);
    expect(updateRow?.embedding_content_hash).not.toBe(
      updateRow?.content_hash,
    );
  });

  it("L5: updateCapsule NOOP preserves embedding_content_hash + embedding_generated_at", async () => {
    const provider: EmbeddingProvider = {
      generateEmbedding: async (): Promise<EmbeddingResult> => ({
        ok: true,
        vector: buildLagVector("l5"),
        model: "text-embedding-3-small",
        dimensions: 1536 as const,
        tokens_used: 1,
      }),
    };
    const { auth, write } = makeServices(provider);
    const owner = await loginAs(auth);
    const create = await write.createCapsule(owner.token, {
      capsule_type: "PREFERENCE",
      topic_tags: ["g5.3-l5"],
      payload_summary: "summary",
      content: "l5-content",
    });
    expect(create.ok).toBe(true);
    if (!create.ok) return;
    const createRow = await prisma.memoryCapsule.findUnique({
      where: { capsule_id: create.capsule_id },
      select: {
        embedding_content_hash: true,
        embedding_generated_at: true,
      },
    });
    // NOOP: same content + same non-content fields → discriminator
    // returns NOOP; updateCapsule emits NOOP audit + zero DB writes;
    // embedding lag metadata preserved exactly.
    const update = await write.updateCapsule(
      owner.token,
      create.capsule_id,
      { content: "l5-content" },
      null,
    );
    expect(update.ok).toBe(true);
    if (!update.ok) return;
    const updateRow = await prisma.memoryCapsule.findUnique({
      where: { capsule_id: create.capsule_id },
      select: {
        embedding_content_hash: true,
        embedding_generated_at: true,
      },
    });
    expect(updateRow?.embedding_content_hash).toBe(
      createRow?.embedding_content_hash,
    );
    expect((updateRow?.embedding_generated_at as Date).getTime()).toBe(
      (createRow?.embedding_generated_at as Date).getTime(),
    );
  });
});
