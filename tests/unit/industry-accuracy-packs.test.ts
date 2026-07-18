import { describe, expect, it } from "vitest";
import {
  defaultAccuracyClassForContext,
  humanizeRoleTemplate,
  industryRoleArtifactBoost,
  listAccuracyPackCatalog,
  normalizeIndustryKey,
  resolveAccuracyPackPosture,
} from "../../apps/api/src/services/otzar/industry-accuracy-packs.js";
import { chooseArtifactFromCommunication } from "../../apps/api/src/services/otzar/artifact-from-communication.js";

describe("industry-accuracy-packs — Phase D.1", () => {
  it("normalizes industry keys and aliases", () => {
    expect(normalizeIndustryKey("HEALTHCARE")).toBe("HEALTHCARE");
    expect(normalizeIndustryKey("healthcare")).toBe("HEALTHCARE");
    expect(normalizeIndustryKey("REGULATED_FINANCE")).toBe("FINANCE");
    expect(normalizeIndustryKey("life sciences clinic")).toBe("HEALTHCARE");
    expect(normalizeIndustryKey(null)).toBe("UNKNOWN");
    expect(normalizeIndustryKey("")).toBe("UNKNOWN");
  });

  it("humanizes role template slugs", () => {
    expect(humanizeRoleTemplate("finance-analyst")).toBe("Finance Analyst");
    expect(humanizeRoleTemplate(null)).toBeNull();
  });

  it("surfaces care plan + insurance packs for healthcare ops", () => {
    const p = resolveAccuracyPackPosture({
      industry: "HEALTHCARE",
      role_template: "operations-manager",
    });
    expect(p.industry_key).toBe("HEALTHCARE");
    expect(p.default_accuracy_class).toBe("REGULATED_HEALTH");
    expect(p.dual_control_default).toBe(true);
    expect(p.never_invent_facts).toBe(true);
    const ids = p.packs.map((x) => x.pack_id);
    expect(ids).toContain("care_plan");
    expect(ids).toContain("insurance_claim_form");
    expect(p.packs.some((x) => x.relevance === "primary")).toBe(true);
    expect(p.posture_summary.toLowerCase()).toMatch(/healthcare|verif/);
  });

  it("surfaces KYC pack for finance + finance-analyst", () => {
    const p = resolveAccuracyPackPosture({
      industry: "FINANCE",
      role_template: "finance-analyst",
    });
    expect(p.default_accuracy_class).toBe("REGULATED_FINANCE");
    expect(p.packs.some((x) => x.pack_id === "kyc_financial_pack")).toBe(true);
    expect(
      p.packs.find((x) => x.pack_id === "kyc_financial_pack")?.relevance,
    ).toBe("primary");
  });

  it("does not invent clinical facts — sections are shells only", () => {
    const p = resolveAccuracyPackPosture({ industry: "HEALTHCARE" });
    const care = p.packs.find((x) => x.pack_id === "care_plan");
    expect(care).toBeDefined();
    expect(care!.suggested_sections.some((s) => /verified/i.test(s))).toBe(
      true,
    );
    // No fabricated patient names / dosages in the catalog.
    expect(JSON.stringify(care)).not.toMatch(/\b(mg|patient john|mr\.)\b/i);
  });

  it("unknown industry keeps standard default", () => {
    const p = resolveAccuracyPackPosture({ industry: null });
    expect(p.default_accuracy_class).toBe("STANDARD");
    expect(p.dual_control_default).toBe(false);
    expect(p.industry_label).toBe("Not set");
  });

  it("catalog is non-empty and dual-control for regulated packs", () => {
    const catalog = listAccuracyPackCatalog();
    expect(catalog.length).toBeGreaterThanOrEqual(4);
    expect(
      catalog
        .filter((c) => c.accuracy_class !== "STANDARD")
        .every((c) => c.dual_control_required),
    ).toBe(true);
  });

  it("boosts financial pack for finance industry", () => {
    const boost = industryRoleArtifactBoost({
      kind: "FINANCIAL_PACK",
      industry: "FINANCE",
      role_template: "finance-analyst",
    });
    expect(boost).toBeGreaterThan(0);
    expect(
      industryRoleArtifactBoost({
        kind: "SLIDES",
        industry: "FINANCE",
      }),
    ).toBe(0);
  });

  it("defaultAccuracyClassForContext mirrors industry", () => {
    expect(defaultAccuracyClassForContext({ industry: "INSURANCE" })).toBe(
      "INSURANCE",
    );
    expect(defaultAccuracyClassForContext({ industry: "TECH" })).toBe(
      "STANDARD",
    );
  });
});

describe("chooseArtifactFromCommunication + industry packs", () => {
  it("still chooses insurance from strong text (text wins)", () => {
    const a = chooseArtifactFromCommunication({
      text: "Caretaker needs to complete the insurance prior-auth form for the patient.",
      industry: "TECH",
    });
    expect(a.kind).toBe("INSURANCE_FORM");
    expect(a.accuracy_class).toBe("INSURANCE");
  });

  it("soft-biases care plan language under healthcare industry", () => {
    const a = chooseArtifactFromCommunication({
      text: "Please update the care plan after today's nursing handoff.",
      industry: "HEALTHCARE",
      role_template: "operations-manager",
    });
    expect(a.kind).toBe("CARE_PLAN");
    expect(a.accuracy_class).toBe("REGULATED_HEALTH");
    expect(a.accuracy_pack_id).toBe("care_plan");
  });

  it("does not force regulated pack on empty-ish tech project brief", () => {
    const a = chooseArtifactFromCommunication({
      text: "We need a brief for the enterprise pilot launch.",
      project_name: "Launch the enterprise customer pilot",
      industry: "HEALTHCARE",
    });
    expect(a.kind).toBe("PROJECT_BRIEF");
    // Project brief is not a regulated pack kind — accuracy stays STANDARD
    // unless text set clinical/finance keywords.
    expect(a.accuracy_class).toBe("STANDARD");
  });
});
