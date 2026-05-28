// FILE: negotiate.test.ts (unit)
// PURPOSE: Verify the COSMP NEGOTIATE flow -- validation order,
//          security-equivalent denials, scope narrowing, AI cap,
//          and audit-of-record coverage.
// CONNECTS TO: NegotiateService, AuthService, the entity / wallet /
//              capsule / permission queries, MemoryNonceStore, and
//              the audit_events table.

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  AuthService,
  MemoryNonceStore,
  NegotiateService,
  scopeMin,
  type LoginResult,
} from "@niov/api";
import {
  createCapsule,
  createEntity,
  createPermission,
  getTARByEntityId,
  getWalletByEntityId,
  prisma,
  updateTARPermissions,
  type AccessScope,
} from "@niov/database";
import {
  cleanupTestData,
  ensureAuditTriggers,
  makeCapsuleInput,
  makeEntityInput,
  TEST_PREFIX,
} from "../../helpers.js";

const TEST_JWT_SECRET = "negotiate-test-secret-do-not-use-in-prod";

// WHAT: Delete every escalation_requests row that references a test
//        entity (source / target / resolver). Query-based (parameterless)
//        so it also clears stale rows from a previous run.
// INPUT: None.
// OUTPUT: A promise that resolves once the rows are gone.
// WHY: As of D-2D-D10-5, a restricted-class NEGOTIATE denial against a
//      requires_validation capsule creates a COMPLIANCE_GATE escalation
//      row referencing the requester + the owner. Those rows FK-block
//      cleanupTestData()'s hard-delete of test entities, so this runs
//      BEFORE cleanupTestData(). RULE 17 cross-reference: this mirrors
//      tests/unit/escalation.test.ts ([D-2D-D10-3] DRIFT 2 Option A
//      resolution). RULE 10 no-FK-cascade preservation: test-local
//      cleanup, not a shared-helper extension -- do NOT extend
//      helpers.ts:cleanupTestData() (the blast-radius coupling problem
//      per [D-2D-D10-3] Option C rejection).
async function cleanupTestEscalations(): Promise<void> {
  const testEntities = await prisma.entity.findMany({
    where: { display_name: { startsWith: TEST_PREFIX } },
    select: { entity_id: true },
  });
  const ids = testEntities.map((e) => e.entity_id);
  if (ids.length === 0) return;
  await prisma.escalationRequest.deleteMany({
    where: {
      OR: [
        { source_entity_id: { in: ids } },
        { target_entity_id: { in: ids } },
        { resolved_by_entity_id: { in: ids } },
      ],
    },
  });
}

beforeAll(async () => {
  await ensureAuditTriggers();
  await cleanupTestEscalations();
  await cleanupTestData();
});

afterEach(async () => {
  await cleanupTestEscalations();
  await cleanupTestData();
});

afterAll(async () => {
  await cleanupTestEscalations();
  await cleanupTestData();
  await prisma.$disconnect();
});

// WHAT: Build a fresh AuthService + NegotiateService with isolated
//        nonce stores.
// INPUT: None.
// OUTPUT: { auth, negotiate, sessionStore, declarationStore }.
// WHY: Each test gets clean state so a delete in one cannot affect
//      the next.
function makeServices() {
  const sessionStore = new MemoryNonceStore();
  const declarationStore = new MemoryNonceStore();
  const auth = new AuthService({
    jwtSecret: TEST_JWT_SECRET,
    nonceStore: sessionStore,
  });
  const negotiate = new NegotiateService(
    auth,
    declarationStore,
    TEST_JWT_SECRET,
  );
  return { auth, negotiate, sessionStore, declarationStore };
}

// WHAT: Create an entity, log them in, and return both their identity
//        and the JWT they should send back as Bearer.
// INPUT: Entity-creation overrides plus the operations the session
//        should request.
// OUTPUT: { entity, token, login } -- everything a NEGOTIATE call
//        needs.
// WHY: Most tests need a working session for a known entity.
async function loginAs(
  auth: AuthService,
  overrides: { entity_type?: "PERSON" | "AI_AGENT" | "DEVICE" } = {},
  requestedOps: string[] = ["read"],
) {
  const password = "correct-horse-battery";
  // We always let makeEntityInput generate a default unique test email,
  // even for AI_AGENT / DEVICE. Real production AI agents may have null
  // emails, but 2A's login flow looks entities up by email, so test
  // entities need a unique one or login matches the wrong entity.
  const input = makeEntityInput({
    entity_type: overrides.entity_type ?? "PERSON",
    password,
  });
  const entity = await createEntity(input);
  const login = await auth.login(input.email!, password, requestedOps, {
    ip_address: null,
  });
  if (!login.ok) throw new Error(`login failed in test setup: ${login.code}`);
  return { entity, token: login.token, login };
}

// WHAT: Create a capsule owned by a given entity.
// INPUT: The owner's entity, optional capsule overrides.
// OUTPUT: The created capsule row.
// WHY: Most tests need a target capsule -- this helper centralizes
//      the wallet lookup + create.
async function makeCapsuleFor(
  ownerId: string,
  overrides: Parameters<typeof makeCapsuleInput>[2] = {},
) {
  const wallet = await getWalletByEntityId(ownerId);
  return createCapsule(makeCapsuleInput(wallet!.wallet_id, ownerId, overrides));
}

describe("scopeMin (pure helper)", () => {
  it("returns the more restrictive scope", () => {
    expect(scopeMin("FULL", "SUMMARY")).toBe("SUMMARY");
    expect(scopeMin("SUMMARY", "FULL")).toBe("SUMMARY");
    expect(scopeMin("METADATA_ONLY", "SUMMARY")).toBe("METADATA_ONLY");
    expect(scopeMin("FULL", "FULL")).toBe("FULL");
  });
});

describe("negotiate -- success path", () => {
  it("returns a signed access declaration when all checks pass", async () => {
    const { auth, negotiate, declarationStore } = makeServices();
    const owner = await loginAs(auth);
    const capsule = await makeCapsuleFor(owner.entity.entity_id);

    const grantee = await loginAs(auth);
    await createPermission({
      capsule_id: capsule.capsule_id,
      grantor_entity_id: owner.entity.entity_id,
      grantee_entity_id: grantee.entity.entity_id,
      access_scope: "FULL",
      duration_type: "TEMPORARY",
    });

    const result = await negotiate.negotiate(
      grantee.token,
      capsule.capsule_id,
      "FULL",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.granted_scope).toBe("FULL");
    expect(result.capsule_id).toBe(capsule.capsule_id);
    expect(result.declaration_token).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
    expect(result.valid_until.getTime()).toBeGreaterThan(Date.now());
    expect(await declarationStore.has(result.declaration_id)).toBe(true);
  });

  it("writes a NEGOTIATE SUCCESS audit event tied to the actor and capsule", async () => {
    const { auth, negotiate } = makeServices();
    const owner = await loginAs(auth);
    const capsule = await makeCapsuleFor(owner.entity.entity_id);
    const grantee = await loginAs(auth);
    await createPermission({
      capsule_id: capsule.capsule_id,
      grantor_entity_id: owner.entity.entity_id,
      grantee_entity_id: grantee.entity.entity_id,
      access_scope: "SUMMARY",
      duration_type: "TEMPORARY",
    });
    await negotiate.negotiate(grantee.token, capsule.capsule_id, "SUMMARY");

    const events = await prisma.auditEvent.findMany({
      where: {
        actor_entity_id: grantee.entity.entity_id,
        target_capsule_id: capsule.capsule_id,
        event_type: "NEGOTIATE",
        outcome: "SUCCESS",
      },
    });
    expect(events.length).toBeGreaterThanOrEqual(1);
  });
});

describe("negotiate -- scope narrowing", () => {
  it("caps requestedScope FULL to the permission's SUMMARY", async () => {
    const { auth, negotiate } = makeServices();
    const owner = await loginAs(auth);
    const capsule = await makeCapsuleFor(owner.entity.entity_id);
    const grantee = await loginAs(auth);
    await createPermission({
      capsule_id: capsule.capsule_id,
      grantor_entity_id: owner.entity.entity_id,
      grantee_entity_id: grantee.entity.entity_id,
      access_scope: "SUMMARY",
      duration_type: "TEMPORARY",
    });
    const result = await negotiate.negotiate(
      grantee.token,
      capsule.capsule_id,
      "FULL",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.granted_scope).toBe("SUMMARY");
  });

  it("caps requestedScope FULL to the permission's METADATA_ONLY", async () => {
    const { auth, negotiate } = makeServices();
    const owner = await loginAs(auth);
    const capsule = await makeCapsuleFor(owner.entity.entity_id);
    const grantee = await loginAs(auth);
    await createPermission({
      capsule_id: capsule.capsule_id,
      grantor_entity_id: owner.entity.entity_id,
      grantee_entity_id: grantee.entity.entity_id,
      access_scope: "METADATA_ONLY",
      duration_type: "TEMPORARY",
    });
    const result = await negotiate.negotiate(
      grantee.token,
      capsule.capsule_id,
      "FULL",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.granted_scope).toBe("METADATA_ONLY");
  });

  it("does NOT widen the scope when the request is more restrictive than the grant", async () => {
    const { auth, negotiate } = makeServices();
    const owner = await loginAs(auth);
    const capsule = await makeCapsuleFor(owner.entity.entity_id);
    const grantee = await loginAs(auth);
    await createPermission({
      capsule_id: capsule.capsule_id,
      grantor_entity_id: owner.entity.entity_id,
      grantee_entity_id: grantee.entity.entity_id,
      access_scope: "FULL",
      duration_type: "TEMPORARY",
    });
    const result = await negotiate.negotiate(
      grantee.token,
      capsule.capsule_id,
      "METADATA_ONLY",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.granted_scope).toBe("METADATA_ONLY");
  });
});

describe("negotiate -- security-equivalent denials", () => {
  it("returns ACCESS_DENIED with identical body for not-found and clearance-insufficient", async () => {
    const { auth, negotiate } = makeServices();
    // Build a session with a low clearance ceiling so even a default
    // capsule (clearance_required = 0) would pass; we need a high
    // clearance_required to trigger CLEARANCE_INSUFFICIENT.
    const owner = await loginAs(auth);
    const capsule = await makeCapsuleFor(owner.entity.entity_id, {
      clearance_required: 5,
    });
    // Lower the grantee's TAR ceiling to 1, then log them in.
    const granteePassword = "correct-horse-battery";
    const granteeInput = makeEntityInput({
      entity_type: "PERSON",
      password: granteePassword,
    });
    const granteeEntity = await createEntity(granteeInput);
    const granteeTar = await getTARByEntityId(granteeEntity.entity_id);
    await updateTARPermissions(granteeTar!.tar_id, { clearance_ceiling: 1 });
    const granteeLogin = (await auth.login(
      granteeInput.email!,
      granteePassword,
      ["read"],
      {},
    )) as LoginResult;
    expect(granteeLogin.ok).toBe(true);

    // Even though the grantee has a permission, clearance fails.
    await createPermission({
      capsule_id: capsule.capsule_id,
      grantor_entity_id: owner.entity.entity_id,
      grantee_entity_id: granteeEntity.entity_id,
      access_scope: "FULL",
      duration_type: "TEMPORARY",
    });

    const clearanceFail = await negotiate.negotiate(
      granteeLogin.token,
      capsule.capsule_id,
      "FULL",
    );
    const notFound = await negotiate.negotiate(
      granteeLogin.token,
      "00000000-0000-0000-0000-000000000000",
      "FULL",
    );

    expect(clearanceFail.ok).toBe(false);
    expect(notFound.ok).toBe(false);
    if (clearanceFail.ok || notFound.ok) return;
    expect(clearanceFail.code).toBe("ACCESS_DENIED");
    expect(notFound.code).toBe("ACCESS_DENIED");
    expect(clearanceFail.message).toBe(notFound.message);
  });

  it("returns NO_PERMISSION (specific message) when clearance passes but no permission exists", async () => {
    const { auth, negotiate } = makeServices();
    const owner = await loginAs(auth);
    const capsule = await makeCapsuleFor(owner.entity.entity_id);
    const stranger = await loginAs(auth);
    // No permission row created.

    const result = await negotiate.negotiate(
      stranger.token,
      capsule.capsule_id,
      "SUMMARY",
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("NO_PERMISSION");
    expect(result.message).toMatch(/permission/i);
  });

  it("writes NEGOTIATE DENIED audit event with denial_reason CLEARANCE_INSUFFICIENT", async () => {
    const { auth, negotiate } = makeServices();
    const owner = await loginAs(auth);
    const capsule = await makeCapsuleFor(owner.entity.entity_id, {
      clearance_required: 5,
    });
    const granteePassword = "correct-horse-battery";
    const granteeInput = makeEntityInput({
      entity_type: "PERSON",
      password: granteePassword,
    });
    const granteeEntity = await createEntity(granteeInput);
    const granteeTar = await getTARByEntityId(granteeEntity.entity_id);
    await updateTARPermissions(granteeTar!.tar_id, { clearance_ceiling: 1 });
    const granteeLogin = (await auth.login(
      granteeInput.email!,
      granteePassword,
      ["read"],
      {},
    )) as LoginResult;
    await createPermission({
      capsule_id: capsule.capsule_id,
      grantor_entity_id: owner.entity.entity_id,
      grantee_entity_id: granteeEntity.entity_id,
      access_scope: "FULL",
      duration_type: "TEMPORARY",
    });
    await negotiate.negotiate(
      granteeLogin.token,
      capsule.capsule_id,
      "FULL",
    );
    const events = await prisma.auditEvent.findMany({
      where: {
        actor_entity_id: granteeEntity.entity_id,
        event_type: "NEGOTIATE",
        outcome: "DENIED",
        denial_reason: "CLEARANCE_INSUFFICIENT",
      },
    });
    expect(events.length).toBeGreaterThanOrEqual(1);
  });

  it("writes NEGOTIATE DENIED audit event with denial_reason NO_PERMISSION", async () => {
    const { auth, negotiate } = makeServices();
    const owner = await loginAs(auth);
    const capsule = await makeCapsuleFor(owner.entity.entity_id);
    const stranger = await loginAs(auth);
    await negotiate.negotiate(
      stranger.token,
      capsule.capsule_id,
      "SUMMARY",
    );
    const events = await prisma.auditEvent.findMany({
      where: {
        actor_entity_id: stranger.entity.entity_id,
        event_type: "NEGOTIATE",
        outcome: "DENIED",
        denial_reason: "NO_PERMISSION",
      },
    });
    expect(events.length).toBeGreaterThanOrEqual(1);
  });
});

describe("negotiate -- session class failures", () => {
  it("returns SESSION_INVALID for a tampered token", async () => {
    const { auth, negotiate } = makeServices();
    const owner = await loginAs(auth);
    const capsule = await makeCapsuleFor(owner.entity.entity_id);
    const grantee = await loginAs(auth);
    await createPermission({
      capsule_id: capsule.capsule_id,
      grantor_entity_id: owner.entity.entity_id,
      grantee_entity_id: grantee.entity.entity_id,
      access_scope: "FULL",
      duration_type: "TEMPORARY",
    });
    const result = await negotiate.negotiate(
      grantee.token.slice(0, -3) + "AAA",
      capsule.capsule_id,
      "FULL",
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("SESSION_INVALID");
  });

  it("returns OPERATION_NOT_PERMITTED when the session lacks the read op", async () => {
    const { auth, negotiate } = makeServices();
    const owner = await loginAs(auth);
    const capsule = await makeCapsuleFor(owner.entity.entity_id);
    // Log the grantee in WITHOUT requesting "read"
    const grantee = await loginAs(auth, {}, ["write"]);
    await createPermission({
      capsule_id: capsule.capsule_id,
      grantor_entity_id: owner.entity.entity_id,
      grantee_entity_id: grantee.entity.entity_id,
      access_scope: "FULL",
      duration_type: "TEMPORARY",
    });
    const result = await negotiate.negotiate(
      grantee.token,
      capsule.capsule_id,
      "FULL",
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("OPERATION_NOT_PERMITTED");
  });
});

describe("negotiate -- AI sovereignty", () => {
  it("ai_access_blocked rejects an AI_AGENT request", async () => {
    const { auth, negotiate } = makeServices();
    const owner = await loginAs(auth);
    const capsule = await makeCapsuleFor(owner.entity.entity_id, {
      ai_access_blocked: true,
    });
    const ai = await loginAs(auth, { entity_type: "AI_AGENT" });
    await createPermission({
      capsule_id: capsule.capsule_id,
      grantor_entity_id: owner.entity.entity_id,
      grantee_entity_id: ai.entity.entity_id,
      access_scope: "SUMMARY",
      duration_type: "TEMPORARY",
    });
    const result = await negotiate.negotiate(
      ai.token,
      capsule.capsule_id,
      "SUMMARY",
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("ACCESS_DENIED");
  });

  it("ai_access_blocked still lets a PERSON through", async () => {
    const { auth, negotiate } = makeServices();
    const owner = await loginAs(auth);
    const capsule = await makeCapsuleFor(owner.entity.entity_id, {
      ai_access_blocked: true,
    });
    const human = await loginAs(auth);
    await createPermission({
      capsule_id: capsule.capsule_id,
      grantor_entity_id: owner.entity.entity_id,
      grantee_entity_id: human.entity.entity_id,
      access_scope: "FULL",
      duration_type: "TEMPORARY",
    });
    const result = await negotiate.negotiate(
      human.token,
      capsule.capsule_id,
      "FULL",
    );
    expect(result.ok).toBe(true);
  });

  it("requires_validation rejects an AI_AGENT request (D-2D-D10-4 validation gate flag)", async () => {
    const { auth, negotiate } = makeServices();
    const owner = await loginAs(auth);
    const capsule = await makeCapsuleFor(owner.entity.entity_id, {
      requires_validation: true,
    });
    const ai = await loginAs(auth, { entity_type: "AI_AGENT" });
    await createPermission({
      capsule_id: capsule.capsule_id,
      grantor_entity_id: owner.entity.entity_id,
      grantee_entity_id: ai.entity.entity_id,
      access_scope: "SUMMARY",
      duration_type: "TEMPORARY",
    });
    const result = await negotiate.negotiate(
      ai.token,
      capsule.capsule_id,
      "SUMMARY",
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("ACCESS_DENIED");
  });

  it("requires_validation still lets a PERSON through", async () => {
    const { auth, negotiate } = makeServices();
    const owner = await loginAs(auth);
    const capsule = await makeCapsuleFor(owner.entity.entity_id, {
      requires_validation: true,
    });
    const human = await loginAs(auth);
    await createPermission({
      capsule_id: capsule.capsule_id,
      grantor_entity_id: owner.entity.entity_id,
      grantee_entity_id: human.entity.entity_id,
      access_scope: "FULL",
      duration_type: "TEMPORARY",
    });
    const result = await negotiate.negotiate(
      human.token,
      capsule.capsule_id,
      "FULL",
    );
    expect(result.ok).toBe(true);
  });

  it("requires_validation defaults to false -- an AI_AGENT request is not gated", async () => {
    const { auth, negotiate } = makeServices();
    const owner = await loginAs(auth);
    const capsule = await makeCapsuleFor(owner.entity.entity_id);
    const ai = await loginAs(auth, { entity_type: "AI_AGENT" });
    await createPermission({
      capsule_id: capsule.capsule_id,
      grantor_entity_id: owner.entity.entity_id,
      grantee_entity_id: ai.entity.entity_id,
      access_scope: "SUMMARY",
      duration_type: "TEMPORARY",
    });
    const result = await negotiate.negotiate(
      ai.token,
      capsule.capsule_id,
      "SUMMARY",
    );
    expect(result.ok).toBe(true);
  });

  it("a requires_validation gate-fail creates a COMPLIANCE_GATE escalation targeting the capsule owner (D-2D-D10-5 coupling)", async () => {
    const { auth, negotiate } = makeServices();
    const owner = await loginAs(auth);
    const capsule = await makeCapsuleFor(owner.entity.entity_id, {
      requires_validation: true,
    });
    const ai = await loginAs(auth, { entity_type: "AI_AGENT" });
    await createPermission({
      capsule_id: capsule.capsule_id,
      grantor_entity_id: owner.entity.entity_id,
      grantee_entity_id: ai.entity.entity_id,
      access_scope: "SUMMARY",
      duration_type: "TEMPORARY",
    });
    const result = await negotiate.negotiate(
      ai.token,
      capsule.capsule_id,
      "SUMMARY",
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("ACCESS_DENIED");
    const escalations = await prisma.escalationRequest.findMany({
      where: { capsule_id: capsule.capsule_id },
    });
    expect(escalations).toHaveLength(1);
    expect(escalations[0]!.source_entity_id).toBe(ai.entity.entity_id);
    expect(escalations[0]!.target_entity_id).toBe(owner.entity.entity_id);
    expect(escalations[0]!.escalation_type).toBe("COMPLIANCE_GATE");
    expect(escalations[0]!.status).toBe("PENDING");
  });

  it("a repeat requires_validation gate-fail by the same AI_AGENT on the same capsule does not create a duplicate escalation", async () => {
    const { auth, negotiate } = makeServices();
    const owner = await loginAs(auth);
    const capsule = await makeCapsuleFor(owner.entity.entity_id, {
      requires_validation: true,
    });
    const ai = await loginAs(auth, { entity_type: "AI_AGENT" });
    await createPermission({
      capsule_id: capsule.capsule_id,
      grantor_entity_id: owner.entity.entity_id,
      grantee_entity_id: ai.entity.entity_id,
      access_scope: "SUMMARY",
      duration_type: "TEMPORARY",
    });
    const first = await negotiate.negotiate(ai.token, capsule.capsule_id, "SUMMARY");
    const second = await negotiate.negotiate(ai.token, capsule.capsule_id, "SUMMARY");
    expect(first.ok).toBe(false);
    expect(second.ok).toBe(false);
    const escalations = await prisma.escalationRequest.findMany({
      where: { capsule_id: capsule.capsule_id },
    });
    expect(escalations).toHaveLength(1);
  });

  it("AI_AGENT requesting FULL is silently capped to SUMMARY by default", async () => {
    const { auth, negotiate } = makeServices();
    const owner = await loginAs(auth);
    const capsule = await makeCapsuleFor(owner.entity.entity_id);
    const ai = await loginAs(auth, { entity_type: "AI_AGENT" });
    await createPermission({
      capsule_id: capsule.capsule_id,
      grantor_entity_id: owner.entity.entity_id,
      grantee_entity_id: ai.entity.entity_id,
      access_scope: "FULL",
      duration_type: "TEMPORARY",
    });
    const result = await negotiate.negotiate(
      ai.token,
      capsule.capsule_id,
      "FULL",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.granted_scope).toBe("SUMMARY");
  });

  it("explicit human override allow_ai_full=true keeps AI_AGENT FULL scope", async () => {
    const { auth, negotiate } = makeServices();
    const owner = await loginAs(auth);
    const capsule = await makeCapsuleFor(owner.entity.entity_id);
    const ai = await loginAs(auth, { entity_type: "AI_AGENT" });
    await createPermission({
      capsule_id: capsule.capsule_id,
      grantor_entity_id: owner.entity.entity_id,
      grantee_entity_id: ai.entity.entity_id,
      access_scope: "FULL",
      duration_type: "TEMPORARY",
      conditions: { allow_ai_full: true },
    });
    const result = await negotiate.negotiate(
      ai.token,
      capsule.capsule_id,
      "FULL",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.granted_scope).toBe("FULL");
  });
});
