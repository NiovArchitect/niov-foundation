// FILE: regulator.test.ts
// PURPOSE: Verify the REGULATOR principal validation helpers per
//          ADR-0036 sub-phase 3 [SUB-BOX-3-SERVICES]:
//          validateRegulatorAccess (5 rejection reasons + happy path)
//          and getRegulatorEntityById (REGULATOR-only fetch).
// CONNECTS TO: packages/database/src/queries/regulator.ts; Entity +
//              TokenAttributeRepository tables. Tests use
//              makeRegulatorEntityInput helper from tests/helpers.ts
//              per Q8 LOCKED.
//
// REGULATOR ≠ GOVERNMENT enforced: explicit test that GOVERNMENT
// entity is rejected as NOT_REGULATOR (correctness-hazard guard per
// ADR-0036 Sub-decision 1 + CAR §2.1 verbatim).

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createEntity,
  getRegulatorEntityById,
  prisma,
  validateRegulatorAccess,
} from "@niov/database";
import type { EntityWithTar } from "@niov/database";
import {
  cleanupTestData,
  makeEntityInput,
  makeRegulatorEntityInput,
} from "../helpers.js";

beforeAll(async () => {
  await cleanupTestData();
});

afterAll(async () => {
  await cleanupTestData();
  await prisma.$disconnect();
});

// Populate regulator-specific TAR fields on a freshly created
// REGULATOR entity. The TAR is auto-created by createEntity per
// existing repo discipline; this updates it with credentialing data.
async function populateRegulatorTar(
  entity_id: string,
  fields: {
    regulator_jurisdiction: string[];
    regulator_authority_scope: string[];
    regulator_credentialed_by: string | null;
  },
): Promise<void> {
  await prisma.tokenAttributeRepository.update({
    where: { entity_id },
    data: fields,
  });
}

describe("validateRegulatorAccess — REGULATOR ≠ GOVERNMENT (correctness-hazard guard)", () => {
  it("GOVERNMENT entity is rejected as NOT_REGULATOR", async () => {
    const gov = await createEntity(
      makeEntityInput({ entity_type: "GOVERNMENT" }),
    );
    const fetched = await prisma.entity.findUnique({
      where: { entity_id: gov.entity_id },
      include: { tar: true },
    });
    const result = validateRegulatorAccess(fetched as EntityWithTar, {
      jurisdiction_invoked: "US-FEDERAL",
      authority_scope: "HEALTHCARE_HIPAA_AUDIT",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("NOT_REGULATOR");
    }
  });

  it("PERSON entity is rejected as NOT_REGULATOR", async () => {
    const person = await createEntity(makeEntityInput());
    const fetched = await prisma.entity.findUnique({
      where: { entity_id: person.entity_id },
      include: { tar: true },
    });
    const result = validateRegulatorAccess(fetched as EntityWithTar, {
      jurisdiction_invoked: "US-FEDERAL",
      authority_scope: "HEALTHCARE_HIPAA_AUDIT",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("NOT_REGULATOR");
    }
  });
});

describe("validateRegulatorAccess — REGULATOR validation reasons", () => {
  it("REGULATOR with no credentialing rejected as MISSING_CREDENTIALING", async () => {
    const reg = await createEntity(makeRegulatorEntityInput());
    // No populateRegulatorTar — regulator_credentialed_by remains null.
    const fetched = await prisma.entity.findUnique({
      where: { entity_id: reg.entity_id },
      include: { tar: true },
    });
    const result = validateRegulatorAccess(fetched as EntityWithTar, {
      jurisdiction_invoked: "US-FEDERAL",
      authority_scope: "SECURITIES_EXAMINATION",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("MISSING_CREDENTIALING");
    }
  });

  it("inactive REGULATOR rejected as ENTITY_NOT_ACTIVE", async () => {
    const reg = await createEntity(makeRegulatorEntityInput());
    await populateRegulatorTar(reg.entity_id, {
      regulator_jurisdiction: ["US-FEDERAL"],
      regulator_authority_scope: ["SECURITIES_EXAMINATION"],
      regulator_credentialed_by: "DOJ",
    });
    await prisma.entity.update({
      where: { entity_id: reg.entity_id },
      data: { status: "SUSPENDED" },
    });
    const fetched = await prisma.entity.findUnique({
      where: { entity_id: reg.entity_id },
      include: { tar: true },
    });
    const result = validateRegulatorAccess(fetched as EntityWithTar, {
      jurisdiction_invoked: "US-FEDERAL",
      authority_scope: "SECURITIES_EXAMINATION",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("ENTITY_NOT_ACTIVE");
    }
  });

  it("jurisdiction mismatch rejected as JURISDICTION_NOT_AUTHORIZED", async () => {
    const reg = await createEntity(makeRegulatorEntityInput());
    await populateRegulatorTar(reg.entity_id, {
      regulator_jurisdiction: ["US-FEDERAL"],
      regulator_authority_scope: ["SECURITIES_EXAMINATION"],
      regulator_credentialed_by: "DOJ",
    });
    const fetched = await prisma.entity.findUnique({
      where: { entity_id: reg.entity_id },
      include: { tar: true },
    });
    const result = validateRegulatorAccess(fetched as EntityWithTar, {
      jurisdiction_invoked: "EU-DE", // not in regulator_jurisdiction
      authority_scope: "SECURITIES_EXAMINATION",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("JURISDICTION_NOT_AUTHORIZED");
    }
  });

  it("authority scope mismatch rejected as SCOPE_NOT_AUTHORIZED", async () => {
    const reg = await createEntity(makeRegulatorEntityInput());
    await populateRegulatorTar(reg.entity_id, {
      regulator_jurisdiction: ["US-FEDERAL"],
      regulator_authority_scope: ["SECURITIES_EXAMINATION"],
      regulator_credentialed_by: "DOJ",
    });
    const fetched = await prisma.entity.findUnique({
      where: { entity_id: reg.entity_id },
      include: { tar: true },
    });
    const result = validateRegulatorAccess(fetched as EntityWithTar, {
      jurisdiction_invoked: "US-FEDERAL",
      authority_scope: "HEALTHCARE_HIPAA_AUDIT", // not in regulator_authority_scope
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("SCOPE_NOT_AUTHORIZED");
    }
  });

  it("happy path: ACTIVE REGULATOR with matching jurisdiction + scope + credentialing → ok", async () => {
    const reg = await createEntity(makeRegulatorEntityInput());
    await populateRegulatorTar(reg.entity_id, {
      regulator_jurisdiction: ["US-FEDERAL", "US-NY"],
      regulator_authority_scope: [
        "SECURITIES_EXAMINATION",
        "HEALTHCARE_HIPAA_AUDIT",
      ],
      regulator_credentialed_by: "DOJ",
    });
    const fetched = await prisma.entity.findUnique({
      where: { entity_id: reg.entity_id },
      include: { tar: true },
    });
    const result = validateRegulatorAccess(fetched as EntityWithTar, {
      jurisdiction_invoked: "US-FEDERAL",
      authority_scope: "SECURITIES_EXAMINATION",
    });

    expect(result.ok).toBe(true);
  });
});

describe("getRegulatorEntityById", () => {
  it("returns Entity + TAR for a REGULATOR entity", async () => {
    const reg = await createEntity(makeRegulatorEntityInput());
    await populateRegulatorTar(reg.entity_id, {
      regulator_jurisdiction: ["EU-DE"],
      regulator_authority_scope: ["DPA_EXAMINATION"],
      regulator_credentialed_by: "EU_DPA",
    });

    const fetched = await getRegulatorEntityById(reg.entity_id);
    expect(fetched).not.toBeNull();
    expect(fetched?.entity_type).toBe("REGULATOR");
    expect(fetched?.tar?.regulator_credentialed_by).toBe("EU_DPA");
    expect(fetched?.tar?.regulator_jurisdiction).toEqual(["EU-DE"]);
  });

  it("returns null for a non-REGULATOR entity (GOVERNMENT)", async () => {
    const gov = await createEntity(
      makeEntityInput({ entity_type: "GOVERNMENT" }),
    );
    const fetched = await getRegulatorEntityById(gov.entity_id);
    expect(fetched).toBeNull();
  });

  it("returns null for a non-existent entity_id", async () => {
    const missing = "00000000-0000-0000-0000-000000000077";
    const fetched = await getRegulatorEntityById(missing);
    expect(fetched).toBeNull();
  });
});
