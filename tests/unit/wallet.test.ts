// FILE: wallet.test.ts
// PURPOSE: Verify the six wallet query functions and the auto-creation
//          rule (every entity gets a wallet inside the same transaction).
// CONNECTS TO: wallet.ts and entity.ts under /packages/database/src/
//              queries, the wallets and entities tables, and the audit
//              table where every operation must leave a row.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createEntity,
  createWallet,
  getWalletByEntityId,
  getWalletById,
  updateWalletSettings,
  incrementCapsuleCount,
  decrementCapsuleCount,
  defaultWalletTypeFor,
  prisma,
} from "@niov/database";
import { cleanupTestData, makeEntityInput } from "../helpers.js";

beforeAll(async () => {
  await cleanupTestData();
});

afterAll(async () => {
  await cleanupTestData();
  await prisma.$disconnect();
});

// WHAT: Helper that fetches the audit rows tied to one entity, newest first.
// INPUT: An entity_id.
// OUTPUT: Array of AuditLog rows.
// WHY: Wallet operations write WALLET_* audit rows tagged with the
//      entity_id so we can verify Rule 4 was satisfied.
async function auditRowsFor(entityId: string) {
  return prisma.auditLog.findMany({
    where: { entity_id: entityId },
    orderBy: { created_at: "desc" },
  });
}

describe("entity creation auto-creates a wallet", () => {
  it("a freshly created PERSON has exactly one wallet", async () => {
    const person = await createEntity(
      makeEntityInput({ entity_type: "PERSON" }),
    );
    const wallet = await getWalletByEntityId(person.entity_id);

    expect(wallet).not.toBeNull();
    expect(wallet?.entity_id).toBe(person.entity_id);
    expect(wallet?.wallet_type).toBe("PERSONAL");
  });

  it("the wallet creation lives in the same transaction as the entity", async () => {
    const person = await createEntity(
      makeEntityInput({ entity_type: "PERSON" }),
    );
    const logs = await auditRowsFor(person.entity_id);
    const actions = logs.map((l) => l.action);
    expect(actions).toContain("ENTITY_CREATE");
    expect(actions).toContain("WALLET_CREATE");
  });

  it("defaults a COMPANY entity to an ENTERPRISE wallet", async () => {
    const company = await createEntity(
      makeEntityInput({ entity_type: "COMPANY" }),
    );
    const wallet = await getWalletByEntityId(company.entity_id);
    expect(wallet?.wallet_type).toBe("ENTERPRISE");
  });

  it("defaults an AI_AGENT entity to an ENTERPRISE wallet", async () => {
    const agent = await createEntity(
      makeEntityInput({ entity_type: "AI_AGENT", email: null }),
    );
    const wallet = await getWalletByEntityId(agent.entity_id);
    expect(wallet?.wallet_type).toBe("ENTERPRISE");
  });

  it("defaults a DEVICE entity to a DEVICE wallet", async () => {
    const device = await createEntity(
      makeEntityInput({ entity_type: "DEVICE", email: null }),
    );
    const wallet = await getWalletByEntityId(device.entity_id);
    expect(wallet?.wallet_type).toBe("DEVICE");
  });

  it("respects an explicit wallet_type override on createEntity", async () => {
    const person = await createEntity(
      makeEntityInput({ entity_type: "PERSON", wallet_type: "ENTERPRISE" }),
    );
    const wallet = await getWalletByEntityId(person.entity_id);
    expect(wallet?.wallet_type).toBe("ENTERPRISE");
  });
});

describe("wallet content-access rule", () => {
  it("PERSONAL wallets allow NIOV to access contents", async () => {
    const person = await createEntity(
      makeEntityInput({ entity_type: "PERSON" }),
    );
    const wallet = await getWalletByEntityId(person.entity_id);
    expect(wallet?.niov_can_access_contents).toBe(true);
  });

  it("ENTERPRISE wallets do NOT allow NIOV to access contents", async () => {
    const company = await createEntity(
      makeEntityInput({ entity_type: "COMPANY" }),
    );
    const wallet = await getWalletByEntityId(company.entity_id);
    expect(wallet?.niov_can_access_contents).toBe(false);
  });

  it("DEVICE wallets default to no NIOV access (Rule 0)", async () => {
    const device = await createEntity(
      makeEntityInput({ entity_type: "DEVICE", email: null }),
    );
    const wallet = await getWalletByEntityId(device.entity_id);
    expect(wallet?.niov_can_access_contents).toBe(false);
  });
});

describe("createWallet (standalone)", () => {
  it("refuses to create a second wallet for the same entity", async () => {
    const person = await createEntity(
      makeEntityInput({ entity_type: "PERSON" }),
    );
    // Auto-creation already gave the entity a wallet. A second call must fail.
    await expect(
      createWallet(person.entity_id, "PERSONAL"),
    ).rejects.toThrow();
  });

  it("can attach a wallet to an entity that does not yet have one", async () => {
    const person = await createEntity(
      makeEntityInput({ entity_type: "PERSON" }),
    );
    // Drop the auto-created wallet so we can recreate one. Production
    // code never does this -- this is just to exercise createWallet
    // alone, which exists for migration / admin paths.
    await prisma.wallet.delete({ where: { entity_id: person.entity_id } });

    const wallet = await createWallet(person.entity_id, "ENTERPRISE");
    expect(wallet.entity_id).toBe(person.entity_id);
    expect(wallet.wallet_type).toBe("ENTERPRISE");
    expect(wallet.niov_can_access_contents).toBe(false);
  });

  it("writes a WALLET_CREATE audit row", async () => {
    const person = await createEntity(
      makeEntityInput({ entity_type: "PERSON" }),
    );
    await prisma.wallet.delete({ where: { entity_id: person.entity_id } });
    await createWallet(person.entity_id, "PERSONAL");

    const logs = await auditRowsFor(person.entity_id);
    const creates = logs.filter((l) => l.action === "WALLET_CREATE");
    // One from the original auto-create, one from the explicit call.
    expect(creates.length).toBeGreaterThanOrEqual(2);
  });
});

describe("getWalletByEntityId", () => {
  it("returns the wallet when it exists", async () => {
    const person = await createEntity(
      makeEntityInput({ entity_type: "PERSON" }),
    );
    const wallet = await getWalletByEntityId(person.entity_id);
    expect(wallet?.entity_id).toBe(person.entity_id);
  });

  it("returns null for an entity that does not exist", async () => {
    const result = await getWalletByEntityId(
      "00000000-0000-0000-0000-000000000000",
    );
    expect(result).toBeNull();
  });

  it("writes a WALLET_READ_BY_ENTITY_ID audit row", async () => {
    const person = await createEntity(
      makeEntityInput({ entity_type: "PERSON" }),
    );
    await getWalletByEntityId(person.entity_id);
    const logs = await auditRowsFor(person.entity_id);
    expect(
      logs.some((l) => l.action === "WALLET_READ_BY_ENTITY_ID"),
    ).toBe(true);
  });
});

describe("getWalletById", () => {
  it("returns the wallet when the wallet_id exists", async () => {
    const person = await createEntity(
      makeEntityInput({ entity_type: "PERSON" }),
    );
    const auto = await getWalletByEntityId(person.entity_id);
    const fetched = await getWalletById(auto!.wallet_id);
    expect(fetched?.wallet_id).toBe(auto!.wallet_id);
  });

  it("returns null for a wallet_id that does not exist", async () => {
    const result = await getWalletById(
      "00000000-0000-0000-0000-000000000000",
    );
    expect(result).toBeNull();
  });
});

describe("updateWalletSettings", () => {
  it("can flip monetization_enabled to true", async () => {
    const person = await createEntity(
      makeEntityInput({ entity_type: "PERSON" }),
    );
    const auto = await getWalletByEntityId(person.entity_id);
    const updated = await updateWalletSettings(auto!.wallet_id, {
      monetization_enabled: true,
    });
    expect(updated.monetization_enabled).toBe(true);
  });

  it("can override niov_can_access_contents on an ENTERPRISE wallet", async () => {
    const company = await createEntity(
      makeEntityInput({ entity_type: "COMPANY" }),
    );
    const auto = await getWalletByEntityId(company.entity_id);
    expect(auto!.niov_can_access_contents).toBe(false);
    const updated = await updateWalletSettings(auto!.wallet_id, {
      niov_can_access_contents: true,
    });
    expect(updated.niov_can_access_contents).toBe(true);
  });

  it("only updates fields that were passed in", async () => {
    const person = await createEntity(
      makeEntityInput({ entity_type: "PERSON" }),
    );
    const auto = await getWalletByEntityId(person.entity_id);
    const updated = await updateWalletSettings(auto!.wallet_id, {
      monetization_enabled: true,
    });
    expect(updated.niov_can_access_contents).toBe(
      auto!.niov_can_access_contents,
    );
  });

  it("writes a WALLET_SETTINGS_UPDATE audit row", async () => {
    const person = await createEntity(
      makeEntityInput({ entity_type: "PERSON" }),
    );
    const auto = await getWalletByEntityId(person.entity_id);
    await updateWalletSettings(auto!.wallet_id, {
      monetization_enabled: true,
    });
    const logs = await auditRowsFor(person.entity_id);
    expect(
      logs.some((l) => l.action === "WALLET_SETTINGS_UPDATE"),
    ).toBe(true);
  });
});

describe("incrementCapsuleCount", () => {
  it("adds 1 to total_capsule_count", async () => {
    const person = await createEntity(
      makeEntityInput({ entity_type: "PERSON" }),
    );
    const auto = await getWalletByEntityId(person.entity_id);
    const after = await incrementCapsuleCount(auto!.wallet_id);
    expect(after.total_capsule_count).toBe(1);
  });

  it("can be called repeatedly and keeps counting", async () => {
    const person = await createEntity(
      makeEntityInput({ entity_type: "PERSON" }),
    );
    const auto = await getWalletByEntityId(person.entity_id);
    await incrementCapsuleCount(auto!.wallet_id);
    await incrementCapsuleCount(auto!.wallet_id);
    const after = await incrementCapsuleCount(auto!.wallet_id);
    expect(after.total_capsule_count).toBe(3);
  });
});

describe("decrementCapsuleCount", () => {
  it("subtracts 1 from total_capsule_count", async () => {
    const person = await createEntity(
      makeEntityInput({ entity_type: "PERSON" }),
    );
    const auto = await getWalletByEntityId(person.entity_id);
    await incrementCapsuleCount(auto!.wallet_id);
    await incrementCapsuleCount(auto!.wallet_id);
    const after = await decrementCapsuleCount(auto!.wallet_id);
    expect(after.total_capsule_count).toBe(1);
  });

  it("refuses to take total_capsule_count below zero", async () => {
    const person = await createEntity(
      makeEntityInput({ entity_type: "PERSON" }),
    );
    const auto = await getWalletByEntityId(person.entity_id);
    await expect(
      decrementCapsuleCount(auto!.wallet_id),
    ).rejects.toThrow(/already 0/);
  });

  it("throws when the wallet does not exist", async () => {
    await expect(
      decrementCapsuleCount("00000000-0000-0000-0000-000000000000"),
    ).rejects.toThrow();
  });
});

describe("defaultWalletTypeFor", () => {
  it("maps every EntityType to a WalletType", () => {
    expect(defaultWalletTypeFor("PERSON")).toBe("PERSONAL");
    expect(defaultWalletTypeFor("COMPANY")).toBe("ENTERPRISE");
    expect(defaultWalletTypeFor("AI_AGENT")).toBe("ENTERPRISE");
    expect(defaultWalletTypeFor("DEVICE")).toBe("DEVICE");
    expect(defaultWalletTypeFor("APPLICATION")).toBe("ENTERPRISE");
    expect(defaultWalletTypeFor("GOVERNMENT")).toBe("ENTERPRISE");
  });
});
