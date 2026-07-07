// FILE: bootstrap-niov-operator.test.ts (unit)
// PURPOSE: Cover scripts/bootstrap-niov-operator.ts — the founder-
//          authorized rail that mints the dedicated NIOV platform
//          operator accounts (TAR can_admin_niov). Pure pieces
//          (environment gate, precondition matrix, password resolve)
//          are tested without the DB; the write path (applyBootstrap)
//          runs against the real containerized Postgres per ADR-0011
//          with TEST_PREFIX identities (the allowlist is enforced in
//          the orchestrator ABOVE applyBootstrap, so prefixed emails
//          keep the shared test DB free of real operator residue).
//          Orchestrator tests inject censusLoader — the documented
//          test seam — because sibling suites mint can_admin_niov
//          fixtures in parallel and a real global census would race.
// CONNECTS TO: scripts/bootstrap-niov-operator.ts (substrate under
//          test); docs/operations/admin-bootstrap-runbook.md §5A;
//          packages/database createEntity / computeTARHash.

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { computeTARHash, prisma } from "@niov/database";
import {
  applyBootstrap,
  assertSafeEnvironment,
  bootstrapNiovOperator,
  CONFIRM_PHRASE,
  evaluateBootstrapPreconditions,
  OPERATOR_ALLOWLIST,
  resolveOperatorPassword,
  type CensusRow,
} from "../../scripts/bootstrap-niov-operator.js";
import { cleanupTestData, ensureAuditTriggers, TEST_PREFIX } from "../helpers.js";

function fakeCensus(n: number): CensusRow[] {
  return Array.from({ length: n }, (_, i) => ({
    entity_id: `00000000-0000-4000-8000-00000000000${i}`,
    email: `niov-operator-${i + 1}@niovlabs.com`,
    display_name: `NIOV Operator ${i + 1}`,
    entity_status: "ACTIVE",
    tar_status: "ACTIVE",
  }));
}

const SAFE_LOCAL_ENV = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5433/foundation_test",
  ALLOW_FOUNDER_BOOTSTRAP: undefined,
};

beforeEach(async () => {
  await ensureAuditTriggers();
  await cleanupTestData();
});

afterAll(async () => {
  await cleanupTestData();
  await prisma.$disconnect();
});

describe("assertSafeEnvironment — the production gate", () => {
  it("refuses NODE_ENV=production without ALLOW_FOUNDER_BOOTSTRAP", () => {
    expect(() =>
      assertSafeEnvironment({
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://x@db.example.com/prod",
        ALLOW_FOUNDER_BOOTSTRAP: undefined,
      }),
    ).toThrow(/NODE_ENV=production/);
  });

  it("refuses a non-localhost DATABASE_URL without ALLOW_FOUNDER_BOOTSTRAP", () => {
    expect(() =>
      assertSafeEnvironment({
        NODE_ENV: "test",
        DATABASE_URL: "postgresql://x@pooler.supabase.com/postgres",
        ALLOW_FOUNDER_BOOTSTRAP: undefined,
      }),
    ).toThrow(/not localhost/);
  });

  it("refuses an empty DATABASE_URL even with the flag set", () => {
    expect(() =>
      assertSafeEnvironment({
        NODE_ENV: "test",
        DATABASE_URL: undefined,
        ALLOW_FOUNDER_BOOTSTRAP: "true",
      }),
    ).toThrow(/DATABASE_URL not set/);
  });

  it("permits production ONLY with ALLOW_FOUNDER_BOOTSTRAP=true (the founder switch)", () => {
    expect(() =>
      assertSafeEnvironment({
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://x@pooler.supabase.com/postgres",
        ALLOW_FOUNDER_BOOTSTRAP: "true",
      }),
    ).not.toThrow();
  });

  it("permits localhost without any flag", () => {
    expect(() => assertSafeEnvironment(SAFE_LOCAL_ENV)).not.toThrow();
  });
});

describe("evaluateBootstrapPreconditions — the census/allowlist matrix", () => {
  it("refuses a non-allowlisted email (including the daily org-admin login)", () => {
    for (const email of ["sadeil@niovlabs.com", "attacker@evil.com", ""]) {
      const decision = evaluateBootstrapPreconditions(email, [], false);
      expect(decision.ok).toBe(false);
      if (!decision.ok) expect(decision.reason).toMatch(/EMAIL_NOT_ALLOWLISTED/);
    }
  });

  it("operator-1 allowed at census 0", () => {
    const decision = evaluateBootstrapPreconditions(
      "niov-operator-1@niovlabs.com",
      [],
      false,
    );
    expect(decision).toEqual({ ok: true, displayName: "NIOV Operator 1" });
  });

  it("operator-1 refused at census 1+ (no double-first)", () => {
    const decision = evaluateBootstrapPreconditions(
      "niov-operator-1@niovlabs.com",
      fakeCensus(1),
      false,
    );
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.reason).toMatch(/CENSUS_NOT_ZERO/);
  });

  it("operator-2 allowed ONLY at census exactly 1", () => {
    const atOne = evaluateBootstrapPreconditions(
      "niov-operator-2@niovlabs.com",
      fakeCensus(1),
      false,
    );
    expect(atOne).toEqual({ ok: true, displayName: "NIOV Operator 2" });
    const atZero = evaluateBootstrapPreconditions(
      "niov-operator-2@niovlabs.com",
      [],
      false,
    );
    expect(atZero.ok).toBe(false);
    if (!atZero.ok) expect(atZero.reason).toMatch(/CENSUS_NOT_ONE/);
  });

  it("any bootstrap refused at census 2+ (dual control already possible)", () => {
    for (const email of Object.keys(OPERATOR_ALLOWLIST)) {
      const decision = evaluateBootstrapPreconditions(email, fakeCensus(2), false);
      expect(decision.ok).toBe(false);
      if (!decision.ok) expect(decision.reason).toMatch(/CENSUS_SATISFIED/);
    }
  });

  it("refuses when the target email is already in use (no silent upgrade)", () => {
    const decision = evaluateBootstrapPreconditions(
      "niov-operator-1@niovlabs.com",
      [],
      true,
    );
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.reason).toMatch(/EMAIL_IN_USE/);
  });
});

describe("resolveOperatorPassword", () => {
  it("uses a supplied password of sufficient length; generates otherwise", () => {
    expect(resolveOperatorPassword("a".repeat(16))).toEqual({
      password: "a".repeat(16),
      generated: false,
    });
    const generated = resolveOperatorPassword(undefined);
    expect(generated.generated).toBe(true);
    expect(generated.password.length).toBeGreaterThanOrEqual(20);
    const short = resolveOperatorPassword("tooshort");
    expect(short.generated).toBe(true);
  });
});

describe("bootstrapNiovOperator orchestrator — gates before writes", () => {
  it("dry-run performs NO writes", async () => {
    const email = "niov-operator-1@niovlabs.com";
    const result = await bootstrapNiovOperator({
      email,
      apply: false,
      confirm: undefined,
      suppliedPassword: undefined,
      env: SAFE_LOCAL_ENV,
      censusLoader: async () => [],
    });
    expect(result).toEqual({
      mode: "dry-run",
      email,
      displayName: "NIOV Operator 1",
      census: 0,
    });
    expect(
      await prisma.entity.findFirst({ where: { email } }),
    ).toBeNull();
  });

  it("--apply without the exact confirmation phrase refuses, writing nothing", async () => {
    const email = "niov-operator-1@niovlabs.com";
    await expect(
      bootstrapNiovOperator({
        email,
        apply: true,
        confirm: "yes please",
        suppliedPassword: undefined,
        env: SAFE_LOCAL_ENV,
        censusLoader: async () => [],
      }),
    ).rejects.toThrow(/CONFIRMATION_REQUIRED/);
    expect(
      await prisma.entity.findFirst({ where: { email } }),
    ).toBeNull();
  });

  it("non-allowlisted email refuses before any write", async () => {
    await expect(
      bootstrapNiovOperator({
        email: `${TEST_PREFIX}not-an-operator@niovlabs.com`,
        apply: true,
        confirm: CONFIRM_PHRASE,
        suppliedPassword: undefined,
        env: SAFE_LOCAL_ENV,
        censusLoader: async () => [],
      }),
    ).rejects.toThrow(/EMAIL_NOT_ALLOWLISTED/);
  });

  it("unsafe environment refuses before the census is even read", async () => {
    let censusRead = false;
    await expect(
      bootstrapNiovOperator({
        email: "niov-operator-1@niovlabs.com",
        apply: true,
        confirm: CONFIRM_PHRASE,
        suppliedPassword: undefined,
        env: {
          NODE_ENV: "production",
          DATABASE_URL: "postgresql://x@pooler.supabase.com/postgres",
          ALLOW_FOUNDER_BOOTSTRAP: undefined,
        },
        censusLoader: async () => {
          censusRead = true;
          return [];
        },
      }),
    ).rejects.toThrow(/NODE_ENV=production/);
    expect(censusRead).toBe(false);
  });
});

describe("applyBootstrap — the audited write path (real DB, prefixed identity)", () => {
  it("creates the operator with can_admin_niov, recomputed tar_hash, bumped tar_version, and clean audit details", async () => {
    const email = `${TEST_PREFIX}op-bootstrap_${randomUUID()}@niov.test`;
    const password = `one-time-${randomUUID()}`;
    const { entity_id } = await applyBootstrap(
      email,
      `${TEST_PREFIX}NIOV Operator T`,
      password,
    );

    const entity = await prisma.entity.findUnique({
      where: { entity_id },
    });
    expect(entity!.status).toBe("ACTIVE");
    expect(entity!.email).toBe(email);
    expect(entity!.password_hash).not.toBeNull();
    expect(entity!.password_hash).not.toContain(password);

    const tar = await prisma.tokenAttributeRepository.findUnique({
      where: { entity_id },
    });
    expect(tar!.can_admin_niov).toBe(true);
    // Minimal platform-operator scope: login/read/write from PERSON
    // defaults; NO org/hive/external powers granted.
    expect(tar!.can_login).toBe(true);
    expect(tar!.can_read_capsules).toBe(true);
    expect(tar!.can_write_capsules).toBe(true);
    expect(tar!.can_admin_org).toBe(false);
    expect(tar!.can_create_hives).toBe(false);
    expect(tar!.can_access_external_api).toBe(false);
    // tar_version bumped past the create-time 1; tar_hash matches a
    // fresh recompute over the live policy (executePhase0 discipline).
    expect(tar!.tar_version).toBe(2);
    expect(tar!.tar_hash).toBe(
      computeTARHash({
        can_login: tar!.can_login,
        can_read_capsules: tar!.can_read_capsules,
        can_write_capsules: tar!.can_write_capsules,
        can_share_capsules: tar!.can_share_capsules,
        can_create_hives: tar!.can_create_hives,
        can_access_external_api: tar!.can_access_external_api,
        can_admin_niov: tar!.can_admin_niov,
        can_admin_org: tar!.can_admin_org,
        clearance_ceiling: tar!.clearance_ceiling,
        monetization_role: tar!.monetization_role,
        compliance_frameworks: tar!.compliance_frameworks,
        status: tar!.status,
      }),
    );

    // Audit lineage: TAR_PERMISSIONS_UPDATE + BOOTSTRAP_NIOV_OPERATOR
    // present; NO password material or secrets anywhere in details.
    const events = await prisma.auditEvent.findMany({
      where: {
        OR: [{ actor_entity_id: entity_id }, { target_entity_id: entity_id }],
      },
    });
    const actions = events.map((e) =>
      String((e.details as Record<string, unknown>)?.action ?? e.event_type),
    );
    expect(actions).toContain("BOOTSTRAP_NIOV_OPERATOR");
    const bootstrapEvent = events.find(
      (e) =>
        (e.details as Record<string, unknown>)?.action ===
        "BOOTSTRAP_NIOV_OPERATOR",
    )!;
    const details = bootstrapEvent.details as Record<string, unknown>;
    expect(details.target_entity_id).toBe(entity_id);
    expect(details.target_email).toBe(email);
    expect(details.granted).toEqual(["can_admin_niov"]);
    expect(details.founder_authorized).toBe(true);
    expect(typeof details.bootstrap_reason).toBe("string");
    const allEventsJson = JSON.stringify(events);
    expect(allEventsJson).not.toContain(password);
    expect(allEventsJson).not.toContain(entity!.password_hash as string);
    expect(allEventsJson).not.toContain("DATABASE_URL");

    // writeAudit targets the audit_logs table (executePhase0 STEP-10
    // discipline): action TAR_PERMISSIONS_UPDATE with the changed field
    // recorded — and no password material in meta either.
    const tarUpdateLogs = await prisma.auditLog.findMany({
      where: { entity_id, action: "TAR_PERMISSIONS_UPDATE" },
    });
    expect(tarUpdateLogs).toHaveLength(1);
    const meta = tarUpdateLogs[0]!.meta as Record<string, unknown>;
    expect(meta.changed_fields).toEqual(["can_admin_niov"]);
    expect(meta.via).toBe("bootstrap_niov_operator");
    expect(JSON.stringify(tarUpdateLogs)).not.toContain(password);
  });
});
