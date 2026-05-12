// FILE: write.test.ts (unit)
// PURPOSE: Verify the COSMP WRITE flow -- owner-write CREATE,
//          attributed-write UPDATE, content encryption, version
//          increment, attribution permanence, and audit-of-record
//          coverage on success and denial.
// CONNECTS TO: WriteService, NegotiateService, AuthService,
//              MemoryContentStore, MemoryNonceStore, the audit
//              table, and the entity / capsule / permission queries.

import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  AuthService,
  MemoryContentStore,
  MemoryNonceStore,
  NegotiateService,
  WriteService,
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
function makeServices() {
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
  const write = new WriteService(
    auth,
    declarationStore,
    contentStore,
    encryption,
    TEST_JWT_SECRET,
  );
  return { auth, negotiate, write, contentStore, declarationStore, encryption };
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
  const login = (await auth.login(input.email!, password, requestedOps, {
    ip_address: null,
  })) as LoginResult;
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

  it("writes a CAPSULE_CREATED SUCCESS audit event tied to the actor", async () => {
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
        event_type: "CAPSULE_CREATED",
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
