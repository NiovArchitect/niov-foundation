// FILE: agent-templates.test.ts (unit)
// PURPOSE: Cover the seedAgentTemplates loader against the 13 role
//          stub markdown files: row counts + correct categories +
//          idempotent re-run + custom-org-template coexistence.
// CONNECTS TO: services/governance/seeds.ts (seedAgentTemplates +
//              parseTemplateFile).

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedAgentTemplates } from "@niov/api";
import { createEntity, prisma } from "@niov/database";
import {
  cleanupTestData,
  ensureAuditTriggers,
  makeEntityInput,
} from "../helpers.js";

beforeAll(async () => {
  await ensureAuditTriggers();
  await cleanupTestData();
  // Wipe any pre-existing global templates so test counts are
  // deterministic. Custom (org_entity_id !== null) templates we
  // seed during tests are deleted in afterAll explicitly.
  await prisma.agentTemplate.deleteMany({ where: { is_custom: false } });
});

afterAll(async () => {
  await prisma.agentTemplate.deleteMany({});
  await cleanupTestData();
  await prisma.$disconnect();
});

describe("seedAgentTemplates", () => {
  it("creates 13 rows with correct role_category and autonomy_default values", async () => {
    const count = await seedAgentTemplates();
    expect(count).toBe(13);
    const all = await prisma.agentTemplate.findMany({
      where: { is_custom: false },
    });
    expect(all.length).toBe(13);
    // Spot check a couple by role_name.
    const ceo = all.find((t) => t.role_name === "chief-executive-officer");
    expect(ceo?.role_category).toBe("EXECUTIVE");
    expect(ceo?.autonomy_default).toBe("EXECUTIVE_OVERRIDE");
    const eng = all.find((t) => t.role_name === "software-engineer");
    expect(eng?.role_category).toBe("ENGINEERING");
    expect(eng?.autonomy_default).toBe("APPROVAL_REQUIRED");
    expect(eng?.skill_packages).toContain("code_review");
  });

  it("is idempotent: running the seed twice produces 13 rows, not 26", async () => {
    await seedAgentTemplates();
    const second = await seedAgentTemplates();
    expect(second).toBe(13);
    const total = await prisma.agentTemplate.count({
      where: { is_custom: false },
    });
    expect(total).toBe(13);
  });

  it("custom org-specific template (is_custom=true, org_entity_id set) coexists with the 13 globals", async () => {
    await seedAgentTemplates();
    const company = await createEntity(
      makeEntityInput({ entity_type: "COMPANY" }),
    );
    await prisma.agentTemplate.create({
      data: {
        role_name: `custom-role-${randomUUID()}`,
        role_category: "CUSTOM",
        template_content: "Custom org-specific role",
        skill_packages: [],
        autonomy_default: "OBSERVE_ONLY",
        is_custom: true,
        org_entity_id: company.entity_id,
      },
    });
    const totalGlobals = await prisma.agentTemplate.count({
      where: { is_custom: false },
    });
    const totalCustoms = await prisma.agentTemplate.count({
      where: { is_custom: true },
    });
    expect(totalGlobals).toBe(13);
    expect(totalCustoms).toBeGreaterThanOrEqual(1);
    // Re-running the seed must NOT touch the custom row.
    await seedAgentTemplates();
    const totalCustomsAfter = await prisma.agentTemplate.count({
      where: { is_custom: true },
    });
    expect(totalCustomsAfter).toBe(totalCustoms);
  });
});
