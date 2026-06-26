// FILE: role-template-resolver.ts
// PURPOSE: Map a free-form role title ("VP of Sales", "Senior Software
//          Engineer", "PM") to the slug of one of the seeded AgentTemplate
//          rows (role_name), so Twin provisioning can preload the matching role
//          template instead of leaving role_template null. An unknown / generic
//          title resolves to null — the caller keeps role_template null and the
//          runtime LLM layer applies its generalist fallback. We NEVER invent a
//          template and NEVER hardcode a person.
//
//          The alias table mirrors the front-end role-archetypes intent
//          (otzar-control-tower/src/lib/role-archetypes.ts) but targets the 13
//          shipped template slugs under apps/api/templates/roles/.
// CONNECTS TO: services/governance/twin.service.ts (STEP 4 provisioning),
//              services/governance/seeds.ts (the 13 seeded slugs),
//              tests/unit/role-template-resolver.test.ts.

// The 13 shipped template slugs (must stay in sync with the markdown files in
// apps/api/templates/roles/). An exact title already equal to a slug wins.
const KNOWN_SLUGS: ReadonlySet<string> = new Set([
  "account-executive",
  "chief-executive-officer",
  "chief-operating-officer",
  "chief-technology-officer",
  "customer-success-manager",
  "finance-analyst",
  "hr-manager",
  "marketing-manager",
  "operations-manager",
  "product-manager",
  "sales-manager",
  "sales-representative",
  "software-engineer",
]);

// Ordered alias table — the FIRST entry whose pattern matches wins, so more
// specific roles are listed before the generic catch-alls. The generic "sales"
// pattern is intentionally placed on sales-representative AFTER sales-manager
// and account-executive so a bare "Sales" / "Salesperson" resolves to the
// individual-contributor template (the agreed tie-break), while "Sales Manager"
// and "Account Executive" keep their specific templates.
const ALIASES: ReadonlyArray<{ slug: string; patterns: RegExp[] }> = [
  // C-suite first (a title like "COO" must not match operations-manager).
  { slug: "chief-executive-officer", patterns: [/\bceo\b/, /chief executive/] },
  { slug: "chief-operating-officer", patterns: [/\bcoo\b/, /chief operating/] },
  {
    slug: "chief-technology-officer",
    patterns: [/\bcto\b/, /chief technology/, /chief technical/],
  },
  // Engineering.
  {
    slug: "software-engineer",
    patterns: [/engineer/, /developer/, /\bdev\b/, /\bswe\b/, /programmer/, /coding/],
  },
  // Product.
  {
    slug: "product-manager",
    patterns: [/product manager/, /product owner/, /product lead/, /\bpm\b/],
  },
  // Marketing.
  {
    slug: "marketing-manager",
    patterns: [/marketing/, /\bcmo\b/, /\bgrowth\b/, /\bbrand\b/, /\bpr\b/, /communications/],
  },
  // Sales — specific leadership / AE BEFORE the generic IC catch-all.
  {
    slug: "sales-manager",
    patterns: [/sales manager/, /head of sales/, /sales lead/, /sales director/, /vp.*sales/, /sales.*lead/],
  },
  {
    slug: "account-executive",
    patterns: [/account executive/, /\bae\b/, /account manager/, /closer/],
  },
  {
    slug: "sales-representative",
    patterns: [/sales rep/, /salesperson/, /\bsdr\b/, /\bbdr\b/, /business development/, /\bsales\b/],
  },
  // Customer success / support.
  {
    slug: "customer-success-manager",
    patterns: [/customer success/, /\bcsm\b/, /support lead/, /customer support/, /account success/],
  },
  // Finance.
  {
    slug: "finance-analyst",
    patterns: [/finance/, /financial/, /accountant/, /accounting/, /\bcfo\b/, /controller/],
  },
  // HR / people.
  {
    slug: "hr-manager",
    patterns: [/human resources/, /\bhr\b/, /people ops/, /people operations/, /recruit/, /\btalent\b/],
  },
  // Operations (after COO so "COO" doesn't fall here).
  {
    slug: "operations-manager",
    patterns: [/operations/, /\bops\b/, /operating manager/],
  },
];

// Resolve a free-form role title to a seeded template slug, or null when no
// confident match exists (unknown / generalist → runtime fallback).
export function resolveRoleTemplateSlug(
  roleTitle: string | null | undefined,
): string | null {
  if (typeof roleTitle !== "string") return null;
  const t = roleTitle.trim().toLowerCase();
  if (t.length === 0) return null;
  // Already a known slug (or a title that exactly equals one).
  if (KNOWN_SLUGS.has(t)) return t;
  for (const { slug, patterns } of ALIASES) {
    if (patterns.some((re) => re.test(t))) return slug;
  }
  return null;
}
