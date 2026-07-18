// FILE: industry-accuracy-packs.ts
// PURPOSE: Phase D.1 — role-templated AI Teammate + industry accuracy packs.
//          Maps OrgSettings.industry + role template → default accuracy_class,
//          dual-control posture, and suggested form packs (care plan, KYC,
//          insurance claim form, etc.). Pure catalog + resolver; no DB.
//          NEVER invents clinical/financial facts — packs are structural
//          shells (section labels) only. Communication context still chooses
//          the live artifact; packs are priors + defaults.
// CONNECTS TO: artifact-from-communication (optional industry/role bias),
//              getMyTwin accuracy_pack_posture sidecar, twin-work accuracy_class,
//              OrgSettings.industry, TwinConfig.role_template.

import type { TwinWorkAccuracyClass } from "./twin-work-claim.service.js";
import type { CommunicationArtifactKind } from "./artifact-from-communication.js";

/** Canonical industry keys (uppercase; match OrgSettings.industry seeds). */
export type IndustryKey =
  | "HEALTHCARE"
  | "FINANCE"
  | "INSURANCE"
  | "TECH"
  | "MANUFACTURING"
  | "SERVICES"
  | "UNKNOWN";

export interface AccuracyPackDefinition {
  pack_id: string;
  label: string;
  description: string;
  accuracy_class: TwinWorkAccuracyClass;
  artifact_kind: CommunicationArtifactKind;
  dual_control_required: boolean;
  /** Structural section labels only — never clinical/financial facts. */
  suggested_sections: readonly string[];
  /** Industries where this pack is primary. Empty = available everywhere. */
  industries: readonly IndustryKey[];
  /** Role-template slugs that elevate this pack for the twin. */
  role_templates: readonly string[];
}

export interface AccuracyPackSuggestion {
  pack_id: string;
  label: string;
  description: string;
  accuracy_class: TwinWorkAccuracyClass;
  artifact_kind: CommunicationArtifactKind;
  dual_control_required: boolean;
  suggested_sections: string[];
  relevance: "primary" | "secondary" | "available";
}

/** Safe posture for My Twin / kickoff priors. */
export interface AccuracyPackPosture {
  industry: string | null;
  industry_key: IndustryKey;
  industry_label: string;
  role_template: string | null;
  role_template_label: string | null;
  default_accuracy_class: TwinWorkAccuracyClass;
  dual_control_default: boolean;
  packs: AccuracyPackSuggestion[];
  /** Calm one-line for employee UI. */
  posture_summary: string;
  /** Product rule surface — always true. */
  never_invent_facts: true;
}

const PACKS: readonly AccuracyPackDefinition[] = Object.freeze([
  {
    pack_id: "care_plan",
    label: "Care plan",
    description:
      "Structured clinical care plan shell. Twin prepares sections; humans verify facts.",
    accuracy_class: "REGULATED_HEALTH" as const,
    artifact_kind: "CARE_PLAN" as const,
    dual_control_required: true,
    suggested_sections: [
      "Patient context (verified)",
      "Goals of care",
      "Interventions",
      "Medications (verified)",
      "Follow-up",
      "Source communications",
    ],
    industries: ["HEALTHCARE"],
    role_templates: [
      "operations-manager",
      "customer-success-manager",
      "hr-manager",
    ],
  },
  {
    pack_id: "insurance_claim_form",
    label: "Insurance claim / prior-auth form",
    description:
      "Insurance documentation shell for claims and prior authorization.",
    accuracy_class: "INSURANCE" as const,
    artifact_kind: "INSURANCE_FORM" as const,
    dual_control_required: true,
    suggested_sections: [
      "Member / patient identifiers (verified)",
      "Service details",
      "Diagnosis codes (verified)",
      "Prior authorization notes",
      "Attachments checklist",
      "Source communications",
    ],
    industries: ["HEALTHCARE", "INSURANCE"],
    role_templates: [
      "operations-manager",
      "finance-analyst",
      "customer-success-manager",
    ],
  },
  {
    pack_id: "kyc_financial_pack",
    label: "KYC / financial documentation pack",
    description:
      "Regulated finance onboarding and documentation pack. Evidence required.",
    accuracy_class: "REGULATED_FINANCE" as const,
    artifact_kind: "FINANCIAL_PACK" as const,
    dual_control_required: true,
    suggested_sections: [
      "Identity verification checklist",
      "Source of funds (verified)",
      "Risk rating",
      "Supporting evidence index",
      "Approver sign-off",
      "Source communications",
    ],
    industries: ["FINANCE"],
    role_templates: ["finance-analyst", "operations-manager", "hr-manager"],
  },
  {
    pack_id: "compliance_audit_pack",
    label: "Compliance / audit pack",
    description:
      "Evidence pack for audit and compliance reviews in regulated industries.",
    accuracy_class: "REGULATED_FINANCE" as const,
    artifact_kind: "FINANCIAL_PACK" as const,
    dual_control_required: true,
    suggested_sections: [
      "Control under review",
      "Evidence inventory",
      "Gaps / exceptions",
      "Owner and due date",
      "Source communications",
    ],
    industries: ["FINANCE", "HEALTHCARE", "INSURANCE"],
    role_templates: ["finance-analyst", "operations-manager", "chief-operating-officer"],
  },
  {
    pack_id: "generic_regulated_form",
    label: "Regulated form",
    description:
      "Generic high-accuracy form when industry requires dual-control completion.",
    accuracy_class: "STANDARD" as const,
    artifact_kind: "FORM" as const,
    dual_control_required: false,
    suggested_sections: [
      "Form purpose",
      "Fields to complete",
      "Verification checklist",
      "Source communications",
    ],
    industries: ["HEALTHCARE", "FINANCE", "INSURANCE"],
    role_templates: [],
  },
]);

const INDUSTRY_ALIASES: ReadonlyArray<{ key: IndustryKey; patterns: RegExp[] }> =
  [
    {
      key: "HEALTHCARE",
      patterns: [
        /\bhealth/,
        /\bmedical/,
        /\bclinic/,
        /\bhospital/,
        /\bpharma/,
        /\blife.?sciences/,
      ],
    },
    {
      key: "FINANCE",
      patterns: [
        /\bfinance/,
        /\bbank/,
        /\bfinserv/,
        /\bfintech/,
        /\bcapital/,
        /\binvest/,
        /\bbroker/,
      ],
    },
    {
      key: "INSURANCE",
      patterns: [/\binsurance/, /\bpayer/, /\bunderwrit/],
    },
    {
      key: "TECH",
      patterns: [/\btech/, /\bsaas/, /\bsoftware/, /\bit\b/],
    },
    {
      key: "MANUFACTURING",
      patterns: [/\bmanufactur/, /\bindustrial/, /\bfactory/],
    },
    {
      key: "SERVICES",
      patterns: [/\bservices/, /\bconsulting/, /\bprofessional/],
    },
  ];

const INDUSTRY_LABELS: Readonly<Record<IndustryKey, string>> = {
  HEALTHCARE: "Healthcare",
  FINANCE: "Finance",
  INSURANCE: "Insurance",
  TECH: "Technology",
  MANUFACTURING: "Manufacturing",
  SERVICES: "Services",
  UNKNOWN: "Not set",
};

const ROLE_LABELS: Readonly<Record<string, string>> = {
  "account-executive": "Account Executive",
  "chief-executive-officer": "Chief Executive Officer",
  "chief-operating-officer": "Chief Operating Officer",
  "chief-technology-officer": "Chief Technology Officer",
  "customer-success-manager": "Customer Success Manager",
  "finance-analyst": "Finance Analyst",
  "hr-manager": "HR Manager",
  "marketing-manager": "Marketing Manager",
  "operations-manager": "Operations Manager",
  "product-manager": "Product Manager",
  "sales-manager": "Sales Manager",
  "sales-representative": "Sales Representative",
  "software-engineer": "Software Engineer",
};

// WHAT: Normalize free-form OrgSettings.industry to a catalog key.
// WHY: Seeds use TECH/HEALTHCARE/FINANCE; operators may type variants.
export function normalizeIndustryKey(
  industry: string | null | undefined,
): IndustryKey {
  if (typeof industry !== "string") return "UNKNOWN";
  const t = industry.trim();
  if (t.length === 0) return "UNKNOWN";
  const upper = t.toUpperCase();
  if (
    upper === "HEALTHCARE" ||
    upper === "FINANCE" ||
    upper === "INSURANCE" ||
    upper === "TECH" ||
    upper === "MANUFACTURING" ||
    upper === "SERVICES"
  ) {
    return upper;
  }
  // Regulated finance / health variants from OOTB company-variants.
  if (upper === "REGULATED_FINANCE" || upper.includes("REGULATED_FINANCE")) {
    return "FINANCE";
  }
  if (upper === "REGULATED_HEALTH" || upper.includes("REGULATED_HEALTH")) {
    return "HEALTHCARE";
  }
  const lower = t.toLowerCase();
  for (const { key, patterns } of INDUSTRY_ALIASES) {
    if (patterns.some((re) => re.test(lower))) return key;
  }
  return "UNKNOWN";
}

export function humanizeRoleTemplate(
  slug: string | null | undefined,
): string | null {
  if (typeof slug !== "string" || slug.trim().length === 0) return null;
  const s = slug.trim().toLowerCase();
  if (ROLE_LABELS[s]) return ROLE_LABELS[s]!;
  return s
    .split(/[-_]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

function defaultAccuracyForIndustry(key: IndustryKey): TwinWorkAccuracyClass {
  switch (key) {
    case "HEALTHCARE":
      return "REGULATED_HEALTH";
    case "FINANCE":
      return "REGULATED_FINANCE";
    case "INSURANCE":
      return "INSURANCE";
    default:
      return "STANDARD";
  }
}

function dualControlDefault(key: IndustryKey): boolean {
  return (
    key === "HEALTHCARE" || key === "FINANCE" || key === "INSURANCE"
  );
}

function scorePack(
  pack: AccuracyPackDefinition,
  industryKey: IndustryKey,
  roleTemplate: string | null,
): { score: number; relevance: AccuracyPackSuggestion["relevance"] } {
  let score = 0;
  const industryHit =
    pack.industries.length === 0 || pack.industries.includes(industryKey);
  if (pack.industries.includes(industryKey)) score += 3;
  else if (pack.industries.length === 0) score += 1;

  const role = roleTemplate?.toLowerCase() ?? null;
  if (role !== null && pack.role_templates.includes(role)) score += 2;

  // Non-matching industry packs stay available at low weight (catalog discoverability).
  if (!industryHit && industryKey !== "UNKNOWN") {
    score = Math.max(score - 2, 0);
  }

  let relevance: AccuracyPackSuggestion["relevance"] = "available";
  if (score >= 4) relevance = "primary";
  else if (score >= 2) relevance = "secondary";
  return { score, relevance };
}

// WHAT: Resolve industry + role → accuracy pack posture for a twin/org.
// WHY: Role-templated AI Teammate needs industry-aware accuracy defaults
//      without inventing regulated facts or changing dual-control gates.
export function resolveAccuracyPackPosture(args: {
  industry?: string | null;
  role_template?: string | null;
  role_title?: string | null;
}): AccuracyPackPosture {
  const industryKey = normalizeIndustryKey(args.industry ?? null);
  const roleTemplate =
    typeof args.role_template === "string" && args.role_template.trim().length > 0
      ? args.role_template.trim().toLowerCase()
      : null;

  const scored = PACKS.map((pack) => {
    const { score, relevance } = scorePack(pack, industryKey, roleTemplate);
    return { pack, score, relevance };
  })
    .filter((x) => x.score > 0 || industryKey === "UNKNOWN")
    .sort((a, b) => b.score - a.score || a.pack.pack_id.localeCompare(b.pack.pack_id));

  // When industry unknown, surface packs as available (education), not primary.
  const packs: AccuracyPackSuggestion[] = scored.map(({ pack, relevance, score }) => ({
    pack_id: pack.pack_id,
    label: pack.label,
    description: pack.description,
    accuracy_class: pack.accuracy_class,
    artifact_kind: pack.artifact_kind,
    dual_control_required: pack.dual_control_required,
    suggested_sections: [...pack.suggested_sections],
    relevance:
      industryKey === "UNKNOWN" && score < 2 ? "available" : relevance,
  }));

  // Limit UI surface — primary/secondary first, then available, max 5.
  const ordered = [
    ...packs.filter((p) => p.relevance === "primary"),
    ...packs.filter((p) => p.relevance === "secondary"),
    ...packs.filter((p) => p.relevance === "available"),
  ].slice(0, 5);

  const defaultAccuracy = defaultAccuracyForIndustry(industryKey);
  const dual = dualControlDefault(industryKey);
  const roleLabel = humanizeRoleTemplate(roleTemplate);
  const industryLabel = INDUSTRY_LABELS[industryKey];

  let posture_summary: string;
  if (industryKey === "UNKNOWN") {
    posture_summary =
      "Industry not set — standard accuracy. Set org industry for care plan, KYC, and insurance packs.";
  } else if (dual) {
    posture_summary = `${industryLabel} accuracy packs active${roleLabel ? ` for ${roleLabel}` : ""}. High-sensitivity work requires human verification before complete.`;
  } else {
    posture_summary = `${industryLabel} defaults apply${roleLabel ? ` for ${roleLabel}` : ""}. Standard documentation accuracy unless communication selects a regulated pack.`;
  }

  return {
    industry:
      typeof args.industry === "string" && args.industry.trim().length > 0
        ? args.industry.trim()
        : null,
    industry_key: industryKey,
    industry_label: industryLabel,
    role_template: roleTemplate,
    role_template_label: roleLabel,
    default_accuracy_class: defaultAccuracy,
    dual_control_default: dual,
    packs: ordered,
    posture_summary,
    never_invent_facts: true,
  };
}

// WHAT: Industry/role soft bias for artifact scoring (points only).
// WHY: Communication still wins on strong keywords; industry raises
//      pack-related kinds when language is weak or mixed.
export function industryRoleArtifactBoost(args: {
  kind: CommunicationArtifactKind;
  industry?: string | null;
  role_template?: string | null;
}): number {
  const posture = resolveAccuracyPackPosture({
    industry: args.industry,
    role_template: args.role_template,
  });
  let boost = 0;
  for (const pack of posture.packs) {
    if (pack.artifact_kind !== args.kind) continue;
    if (pack.relevance === "primary") boost += 1.5;
    else if (pack.relevance === "secondary") boost += 0.75;
  }
  return boost;
}

// WHAT: Default accuracy_class when text did not set a regulated class.
// WHY: Kickoff/claim can inherit industry prior without inventing facts.
export function defaultAccuracyClassForContext(args: {
  industry?: string | null;
  role_template?: string | null;
}): TwinWorkAccuracyClass {
  return resolveAccuracyPackPosture(args).default_accuracy_class;
}

/** Test/export helper — full pack catalog size. */
export function listAccuracyPackCatalog(): readonly AccuracyPackDefinition[] {
  return PACKS;
}
