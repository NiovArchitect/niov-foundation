// FILE: lawful-basis.test.ts
// PURPOSE: Verify the LawfulBasis query helpers per ADR-0036 sub-phase
//          3 [SUB-BOX-3-SERVICES]: canonical content determinism, SHA-
//          256 chain hash computation, row creation with chain_hash +
//          null audit_id, idempotent audit_id backfill, validity check.
// CONNECTS TO: packages/database/src/queries/lawful-basis.ts;
//              lawful_bases table per sub-phase 2 [SUB-BOX-3-SCHEMA]
//              db6e0d7. Tests clean their own LawfulBasis rows by
//              captured basis_id per Q6 LOCKED.

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  canonicalLawfulBasisContent,
  computeLawfulBasisChainHash,
  createLawfulBasis,
  createLawfulBasisInTx,
  getLawfulBasisById,
  isLawfulBasisActive,
  linkLawfulBasisToAuditEventInTx,
  prisma,
} from "@niov/database";
import type { LawfulBasisHashableFields } from "@niov/database";
import { cleanupTestData } from "../helpers.js";

// Per Q6 LOCKED Option α: tests track basis_ids they create and
// clean them up; cleanupTestData is NOT extended to wipe all
// LawfulBasis rows globally.
const createdBasisIds: string[] = [];

beforeAll(async () => {
  await cleanupTestData();
});

afterEach(async () => {
  if (createdBasisIds.length > 0) {
    await prisma.lawfulBasis.deleteMany({
      where: { basis_id: { in: createdBasisIds } },
    });
    createdBasisIds.length = 0;
  }
});

afterAll(async () => {
  await cleanupTestData();
  await prisma.$disconnect();
});

const sampleHashable = (
  overrides: Partial<LawfulBasisHashableFields> = {},
): LawfulBasisHashableFields => ({
  basis_type: "SUBPOENA",
  basis_reference: "24-cv-1234",
  jurisdiction_invoked: "US-FEDERAL",
  valid_from: new Date("2026-05-15T00:00:00.000Z"),
  valid_until: new Date("2026-08-15T00:00:00.000Z"),
  ...overrides,
});

describe("canonicalLawfulBasisContent", () => {
  it("emits 5-field pipe-joined canonical string", () => {
    const canonical = canonicalLawfulBasisContent(sampleHashable());
    expect(canonical).toBe(
      "SUBPOENA|24-cv-1234|US-FEDERAL|2026-05-15T00:00:00.000Z|2026-08-15T00:00:00.000Z",
    );
  });

  it("uses Date.toISOString millisecond UTC precision", () => {
    const canonical = canonicalLawfulBasisContent(
      sampleHashable({
        valid_from: new Date("2026-05-15T12:34:56.789Z"),
      }),
    );
    expect(canonical).toContain("2026-05-15T12:34:56.789Z");
  });

  it("identical input produces identical canonical string", () => {
    const a = canonicalLawfulBasisContent(sampleHashable());
    const b = canonicalLawfulBasisContent(sampleHashable());
    expect(a).toBe(b);
  });
});

describe("computeLawfulBasisChainHash", () => {
  it("produces 64-character lowercase hex string (SHA-256)", () => {
    const hash = computeLawfulBasisChainHash(sampleHashable());
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("identical input produces identical hash (determinism)", () => {
    const a = computeLawfulBasisChainHash(sampleHashable());
    const b = computeLawfulBasisChainHash(sampleHashable());
    expect(a).toBe(b);
  });

  it("changing basis_type changes hash", () => {
    const a = computeLawfulBasisChainHash(sampleHashable());
    const b = computeLawfulBasisChainHash(
      sampleHashable({ basis_type: "COURT_ORDER" }),
    );
    expect(a).not.toBe(b);
  });

  it("changing basis_reference changes hash", () => {
    const a = computeLawfulBasisChainHash(sampleHashable());
    const b = computeLawfulBasisChainHash(
      sampleHashable({ basis_reference: "24-cv-9999" }),
    );
    expect(a).not.toBe(b);
  });

  it("changing jurisdiction_invoked changes hash", () => {
    const a = computeLawfulBasisChainHash(sampleHashable());
    const b = computeLawfulBasisChainHash(
      sampleHashable({ jurisdiction_invoked: "EU-DE" }),
    );
    expect(a).not.toBe(b);
  });

  it("changing valid_from changes hash", () => {
    const a = computeLawfulBasisChainHash(sampleHashable());
    const b = computeLawfulBasisChainHash(
      sampleHashable({ valid_from: new Date("2026-06-01T00:00:00.000Z") }),
    );
    expect(a).not.toBe(b);
  });

  it("changing valid_until changes hash", () => {
    const a = computeLawfulBasisChainHash(sampleHashable());
    const b = computeLawfulBasisChainHash(
      sampleHashable({ valid_until: new Date("2026-09-01T00:00:00.000Z") }),
    );
    expect(a).not.toBe(b);
  });
});

describe("createLawfulBasis", () => {
  it("creates row with chain_hash NOT NULL and audit_id null", async () => {
    const input = sampleHashable();
    const row = await createLawfulBasis(input);
    createdBasisIds.push(row.basis_id);

    expect(row.basis_id).toBeDefined();
    expect(row.basis_type).toBe(input.basis_type);
    expect(row.basis_reference).toBe(input.basis_reference);
    expect(row.jurisdiction_invoked).toBe(input.jurisdiction_invoked);
    expect(row.chain_hash).toBe(computeLawfulBasisChainHash(input));
    expect(row.audit_id).toBeNull();
    expect(row.created_at).toBeInstanceOf(Date);
    expect(row.updated_at).toBeInstanceOf(Date);
  });

  it("identical input across calls produces identical chain_hash", async () => {
    const input = sampleHashable({ basis_reference: "24-cv-9001" });
    const a = await createLawfulBasis(input);
    const b = await createLawfulBasis(input);
    createdBasisIds.push(a.basis_id, b.basis_id);

    expect(a.chain_hash).toBe(b.chain_hash);
    // Distinct rows (different basis_id UUIDs) but identical content hash.
    expect(a.basis_id).not.toBe(b.basis_id);
  });
});

describe("createLawfulBasisInTx", () => {
  it("works inside a caller-supplied transaction client", async () => {
    const input = sampleHashable({ basis_reference: "tx-test-1" });
    const row = await prisma.$transaction(async (tx) =>
      createLawfulBasisInTx(tx, input),
    );
    createdBasisIds.push(row.basis_id);

    expect(row.audit_id).toBeNull();
    expect(row.chain_hash).toBe(computeLawfulBasisChainHash(input));
  });
});

describe("linkLawfulBasisToAuditEventInTx", () => {
  it("links audit_id when null", async () => {
    const row = await createLawfulBasis(sampleHashable());
    createdBasisIds.push(row.basis_id);

    const audit_id = "00000000-0000-0000-0000-000000000001";
    const linked = await prisma.$transaction(async (tx) =>
      linkLawfulBasisToAuditEventInTx(tx, row.basis_id, audit_id),
    );

    expect(linked.audit_id).toBe(audit_id);
  });

  it("is idempotent when same audit_id is re-linked", async () => {
    const row = await createLawfulBasis(sampleHashable());
    createdBasisIds.push(row.basis_id);

    const audit_id = "00000000-0000-0000-0000-000000000002";
    await prisma.$transaction(async (tx) =>
      linkLawfulBasisToAuditEventInTx(tx, row.basis_id, audit_id),
    );
    const second = await prisma.$transaction(async (tx) =>
      linkLawfulBasisToAuditEventInTx(tx, row.basis_id, audit_id),
    );

    expect(second.audit_id).toBe(audit_id);
  });

  it("throws on attempt to overwrite with a different audit_id", async () => {
    const row = await createLawfulBasis(sampleHashable());
    createdBasisIds.push(row.basis_id);

    const audit_id_1 = "00000000-0000-0000-0000-000000000003";
    const audit_id_2 = "00000000-0000-0000-0000-000000000004";

    await prisma.$transaction(async (tx) =>
      linkLawfulBasisToAuditEventInTx(tx, row.basis_id, audit_id_1),
    );

    await expect(
      prisma.$transaction(async (tx) =>
        linkLawfulBasisToAuditEventInTx(tx, row.basis_id, audit_id_2),
      ),
    ).rejects.toThrow(/already linked/);
  });

  it("throws if basis_id is not found", async () => {
    const missing = "00000000-0000-0000-0000-000000000099";
    await expect(
      prisma.$transaction(async (tx) =>
        linkLawfulBasisToAuditEventInTx(
          tx,
          missing,
          "00000000-0000-0000-0000-000000000005",
        ),
      ),
    ).rejects.toThrow(/not found/);
  });
});

describe("isLawfulBasisActive", () => {
  it("returns false when now is before valid_from", async () => {
    const row = await createLawfulBasis(
      sampleHashable({
        valid_from: new Date("2027-01-01T00:00:00.000Z"),
        valid_until: new Date("2027-12-31T00:00:00.000Z"),
      }),
    );
    createdBasisIds.push(row.basis_id);

    expect(
      isLawfulBasisActive(row, new Date("2026-12-31T00:00:00.000Z")),
    ).toBe(false);
  });

  it("returns true when now is within [valid_from, valid_until)", async () => {
    const row = await createLawfulBasis(
      sampleHashable({
        valid_from: new Date("2026-01-01T00:00:00.000Z"),
        valid_until: new Date("2026-12-31T00:00:00.000Z"),
      }),
    );
    createdBasisIds.push(row.basis_id);

    expect(
      isLawfulBasisActive(row, new Date("2026-06-15T00:00:00.000Z")),
    ).toBe(true);
  });

  it("returns false when now is at or after valid_until", async () => {
    const row = await createLawfulBasis(
      sampleHashable({
        valid_from: new Date("2026-01-01T00:00:00.000Z"),
        valid_until: new Date("2026-06-01T00:00:00.000Z"),
      }),
    );
    createdBasisIds.push(row.basis_id);

    expect(
      isLawfulBasisActive(row, new Date("2026-06-01T00:00:00.000Z")),
    ).toBe(false);
    expect(
      isLawfulBasisActive(row, new Date("2026-07-01T00:00:00.000Z")),
    ).toBe(false);
  });
});

describe("getLawfulBasisById", () => {
  it("returns the row when basis_id matches", async () => {
    const row = await createLawfulBasis(sampleHashable());
    createdBasisIds.push(row.basis_id);

    const fetched = await getLawfulBasisById(row.basis_id);
    expect(fetched?.basis_id).toBe(row.basis_id);
    expect(fetched?.chain_hash).toBe(row.chain_hash);
  });

  it("returns null when basis_id does not exist", async () => {
    const missing = "00000000-0000-0000-0000-000000000098";
    const fetched = await getLawfulBasisById(missing);
    expect(fetched).toBeNull();
  });
});
