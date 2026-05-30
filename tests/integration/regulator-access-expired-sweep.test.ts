// FILE: regulator-access-expired-sweep.test.ts (integration)
// PURPOSE: Hardening Wave D — tickRegulatorAccessExpirySweep
//          contract coverage. Verifies: past-due basis with no
//          terminal audit gets a REGULATOR_ACCESS_EXPIRED row
//          emitted with SCHEDULER attribution + chain_hash
//          carried; second sweep is idempotent (no duplicate
//          emission); not-yet-expired basis is skipped; revoked
//          basis is supersession-skipped; bounded batch limits
//          per-tick work; audit row carries the regulator's
//          entity_id as target_entity_id.
// CONNECTS TO:
//   - apps/api/src/services/cosmp/regulator-expiry.service.ts
//   - packages/database/src/queries/lawful-basis.ts

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { tickRegulatorAccessExpirySweep } from "@niov/api";
import {
  computeLawfulBasisChainHash,
  createEntity,
  createLawfulBasis,
  prisma,
  writeAuditEvent,
} from "@niov/database";
import {
  cleanupTestData,
  ensureAuditTriggers,
  makeRegulatorEntityInput,
  TEST_PREFIX,
} from "../helpers.js";

beforeAll(async () => {
  await ensureAuditTriggers();
  await cleanupTestData();
});

afterAll(async () => {
  await cleanupTestData();
  await prisma.$disconnect();
});

async function makeRegulator(): Promise<string> {
  const input = makeRegulatorEntityInput({ password: "test-pw-12345" });
  const e = await createEntity(input);
  return e.entity_id;
}

async function landBasis(opts: {
  regulatorEntityId: string;
  validFrom?: Date;
  validUntil?: Date;
}): Promise<{ basis_id: string; chain_hash: string; audit_id: string }> {
  const valid_from = opts.validFrom ?? new Date(Date.now() - 24 * 60 * 60 * 1000);
  const valid_until =
    opts.validUntil ?? new Date(Date.now() - 60 * 60 * 1000);
  const input = {
    basis_type: "SUBPOENA" as const,
    basis_reference: `${TEST_PREFIX}case-${randomUUID()}`,
    jurisdiction_invoked: "US-FEDERAL",
    valid_from,
    valid_until,
  };
  const basis = await createLawfulBasis(input);
  const chain_hash = computeLawfulBasisChainHash(input);
  // Emit the GRANT audit + link it (mirrors the canonical CAR
  // Sub-box 3 sub-phase 5 grant flow).
  const grant = await writeAuditEvent({
    event_type: "REGULATOR_ACCESS_GRANTED",
    outcome: "SUCCESS",
    actor_entity_id: opts.regulatorEntityId,
    target_entity_id: opts.regulatorEntityId,
    lawful_basis_id: basis.basis_id,
    lawful_basis_chain_hash: chain_hash,
    details: { action: "GRANT_FIXTURE" },
  });
  await prisma.lawfulBasis.update({
    where: { basis_id: basis.basis_id },
    data: { audit_id: grant.audit_id },
  });
  return { basis_id: basis.basis_id, chain_hash, audit_id: grant.audit_id };
}

async function emitRevocation(opts: {
  regulatorEntityId: string;
  basis_id: string;
  chain_hash: string;
}): Promise<void> {
  await writeAuditEvent({
    event_type: "REGULATOR_ACCESS_REVOKED",
    outcome: "SUCCESS",
    actor_entity_id: opts.regulatorEntityId,
    target_entity_id: opts.regulatorEntityId,
    lawful_basis_id: opts.basis_id,
    lawful_basis_chain_hash: opts.chain_hash,
    details: { action: "REVOKE_FIXTURE" },
  });
}

describe("tickRegulatorAccessExpirySweep — happy path", () => {
  it("emits REGULATOR_ACCESS_EXPIRED with SCHEDULER attribution + chain_hash carried", async () => {
    const regId = await makeRegulator();
    const grant = await landBasis({ regulatorEntityId: regId });

    const r = await tickRegulatorAccessExpirySweep();
    expect(r.expired).toBeGreaterThanOrEqual(1);

    const expiredAudit = await prisma.auditEvent.findFirst({
      where: {
        event_type: "REGULATOR_ACCESS_EXPIRED",
        lawful_basis_id: grant.basis_id,
      },
    });
    expect(expiredAudit).not.toBeNull();
    // SCHEDULER attribution: actor null + system_principal set.
    expect(expiredAudit!.actor_entity_id).toBeNull();
    // chain_hash carried.
    expect(expiredAudit!.lawful_basis_chain_hash).toBe(grant.chain_hash);
    // target_entity_id surfaces the regulator (resolved from the
    // grant audit's target_entity_id).
    expect(expiredAudit!.target_entity_id).toBe(regId);
    // Details include canonical action + basis_id + valid_until.
    const d = expiredAudit!.details as Record<string, unknown>;
    expect(d.action).toBe("REGULATOR_ACCESS_EXPIRED");
    expect(d.basis_id).toBe(grant.basis_id);
    expect(typeof d.valid_until).toBe("string");
  });
});

describe("tickRegulatorAccessExpirySweep — idempotency + supersession", () => {
  it("second sweep does NOT re-emit for the same basis", async () => {
    const regId = await makeRegulator();
    const grant = await landBasis({ regulatorEntityId: regId });

    await tickRegulatorAccessExpirySweep();
    await tickRegulatorAccessExpirySweep();

    const expiredAudits = await prisma.auditEvent.findMany({
      where: {
        event_type: "REGULATOR_ACCESS_EXPIRED",
        lawful_basis_id: grant.basis_id,
      },
    });
    expect(expiredAudits).toHaveLength(1);
  });

  it("skips a basis that was REVOKED before expiration (supersession)", async () => {
    const regId = await makeRegulator();
    const grant = await landBasis({ regulatorEntityId: regId });
    await emitRevocation({
      regulatorEntityId: regId,
      basis_id: grant.basis_id,
      chain_hash: grant.chain_hash,
    });

    await tickRegulatorAccessExpirySweep();

    const expiredAudit = await prisma.auditEvent.findFirst({
      where: {
        event_type: "REGULATOR_ACCESS_EXPIRED",
        lawful_basis_id: grant.basis_id,
      },
    });
    expect(expiredAudit).toBeNull();
  });
});

describe("tickRegulatorAccessExpirySweep — not-yet-expired filter", () => {
  it("skips a basis whose valid_until is still in the future", async () => {
    const regId = await makeRegulator();
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const grant = await landBasis({
      regulatorEntityId: regId,
      validFrom: new Date(Date.now() - 60 * 1000),
      validUntil: future,
    });

    await tickRegulatorAccessExpirySweep();

    const expiredAudit = await prisma.auditEvent.findFirst({
      where: {
        event_type: "REGULATOR_ACCESS_EXPIRED",
        lawful_basis_id: grant.basis_id,
      },
    });
    expect(expiredAudit).toBeNull();
  });

  it("respects a custom `now` clock override (deterministic-test seam)", async () => {
    const regId = await makeRegulator();
    // Basis valid_until = 2026-06-01; tick with now=2026-05-01
    // should NOT mark it expired.
    const grant = await landBasis({
      regulatorEntityId: regId,
      validFrom: new Date("2026-04-01"),
      validUntil: new Date("2026-06-01"),
    });

    await tickRegulatorAccessExpirySweep({ now: new Date("2026-05-01") });

    const expiredAudit = await prisma.auditEvent.findFirst({
      where: {
        event_type: "REGULATOR_ACCESS_EXPIRED",
        lawful_basis_id: grant.basis_id,
      },
    });
    expect(expiredAudit).toBeNull();
  });
});

describe("tickRegulatorAccessExpirySweep — bounded batch", () => {
  it("respects maxBatch parameter (per-tick work cap)", async () => {
    const regId = await makeRegulator();
    // Land 3 expired bases.
    await landBasis({ regulatorEntityId: regId });
    await landBasis({ regulatorEntityId: regId });
    await landBasis({ regulatorEntityId: regId });

    const r = await tickRegulatorAccessExpirySweep({ maxBatch: 2 });
    expect(r.candidates_considered).toBeLessThanOrEqual(2);
    expect(r.expired).toBeLessThanOrEqual(2);
  });
});

describe("tickRegulatorAccessExpirySweep — no-leak posture", () => {
  it("audit details NEVER carry basis_reference or jurisdiction_invoked", async () => {
    const regId = await makeRegulator();
    const grant = await landBasis({ regulatorEntityId: regId });

    await tickRegulatorAccessExpirySweep();

    const expiredAudit = await prisma.auditEvent.findFirst({
      where: {
        event_type: "REGULATOR_ACCESS_EXPIRED",
        lawful_basis_id: grant.basis_id,
      },
    });
    const details = expiredAudit!.details as Record<string, unknown>;
    // basis_reference (could be PII) + jurisdiction_invoked are
    // stored on the LawfulBasis row + projected via the authorized
    // regulator-tier read surface; they are intentionally NOT in
    // the expiration audit details. writeAuditEvent also injects
    // system_principal=SCHEDULER per the system-attribution
    // convention — that field is allowed (the principal name is
    // canonical SYSTEM_PRINCIPALS, not PII).
    expect(details.basis_reference).toBeUndefined();
    expect(details.jurisdiction_invoked).toBeUndefined();
    expect(details.action).toBe("REGULATOR_ACCESS_EXPIRED");
    expect(details.basis_id).toBe(grant.basis_id);
    expect(typeof details.valid_until).toBe("string");
  });
});
