// FILE: role-template-resolver.test.ts (unit, no DB)
// PURPOSE: The role-title -> template-slug resolver maps the roles a real org
//          uses to the 13 seeded AgentTemplate slugs, picks the agreed sales
//          tie-break, and returns null for unknown/generic titles so the runtime
//          generalist fallback applies. No person is ever hardcoded.
// CONNECTS TO: services/governance/role-template-resolver.ts.

import { describe, expect, it } from "vitest";
import { resolveRoleTemplateSlug } from "@niov/api";

describe("resolveRoleTemplateSlug", () => {
  it("maps a product role to the product template", () => {
    expect(resolveRoleTemplateSlug("Product Manager")).toBe("product-manager");
    expect(resolveRoleTemplateSlug("Senior PM")).toBe("product-manager");
    expect(resolveRoleTemplateSlug("Product Owner")).toBe("product-manager");
  });

  it("maps an engineering role to the engineering template", () => {
    expect(resolveRoleTemplateSlug("Software Engineer")).toBe("software-engineer");
    expect(resolveRoleTemplateSlug("Senior Backend Developer")).toBe("software-engineer");
    expect(resolveRoleTemplateSlug("SWE II")).toBe("software-engineer");
  });

  it("maps sales leadership and AE to their specific templates", () => {
    expect(resolveRoleTemplateSlug("Sales Manager")).toBe("sales-manager");
    expect(resolveRoleTemplateSlug("VP of Sales")).toBe("sales-manager");
    expect(resolveRoleTemplateSlug("Account Executive")).toBe("account-executive");
  });

  it("uses sales-representative as the generic Sales tie-break", () => {
    expect(resolveRoleTemplateSlug("Sales")).toBe("sales-representative");
    expect(resolveRoleTemplateSlug("Salesperson")).toBe("sales-representative");
    expect(resolveRoleTemplateSlug("SDR")).toBe("sales-representative");
  });

  it("maps C-suite titles without colliding with operations/engineering", () => {
    expect(resolveRoleTemplateSlug("CEO")).toBe("chief-executive-officer");
    expect(resolveRoleTemplateSlug("Founder & CEO")).toBe("chief-executive-officer");
    expect(resolveRoleTemplateSlug("COO")).toBe("chief-operating-officer");
    expect(resolveRoleTemplateSlug("CTO")).toBe("chief-technology-officer");
  });

  it("maps tech lead / AI engineer / GTM / risk titles used in live orgs", () => {
    expect(resolveRoleTemplateSlug("Tech Lead")).toBe("software-engineer");
    expect(resolveRoleTemplateSlug("AI UI Engineer")).toBe("software-engineer");
    expect(resolveRoleTemplateSlug("AI/NLP Engineer")).toBe("software-engineer");
    expect(resolveRoleTemplateSlug("Go-to-Market Lead")).toBe("marketing-manager");
    expect(resolveRoleTemplateSlug("Media Lead")).toBe("marketing-manager");
    expect(resolveRoleTemplateSlug("Risk & Compliance Lead")).toBe(
      "finance-analyst",
    );
    expect(resolveRoleTemplateSlug("Product Lead")).toBe("product-manager");
  });

  it("maps marketing, finance, HR, operations, customer success", () => {
    expect(resolveRoleTemplateSlug("Marketing Manager")).toBe("marketing-manager");
    expect(resolveRoleTemplateSlug("Finance Analyst")).toBe("finance-analyst");
    expect(resolveRoleTemplateSlug("HR Business Partner")).toBe("hr-manager");
    expect(resolveRoleTemplateSlug("Operations Manager")).toBe("operations-manager");
    expect(resolveRoleTemplateSlug("Customer Success Manager")).toBe(
      "customer-success-manager",
    );
  });

  it("accepts a title that is already a known slug", () => {
    expect(resolveRoleTemplateSlug("software-engineer")).toBe("software-engineer");
  });

  it("returns null for an unknown / generic role (generalist fallback)", () => {
    expect(resolveRoleTemplateSlug("Digital Twin")).toBeNull();
    expect(resolveRoleTemplateSlug("Intern")).toBeNull();
    expect(resolveRoleTemplateSlug("")).toBeNull();
    expect(resolveRoleTemplateSlug(null)).toBeNull();
    expect(resolveRoleTemplateSlug(undefined)).toBeNull();
  });
});
