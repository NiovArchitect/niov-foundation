// FILE: yc-demo-personas.ts
// PURPOSE: Isolated Y Combinator Labs demo persona allowlist +
//          session launch for the public review window. Never NIOV
//          Labs org. No passwords leave the server.
// CONNECTS TO: demo-persona.routes, AuthService.issueInternalSession.

import { prisma } from "@niov/database";

/** Production Y Combinator Labs org (never_customer / YC_DEMO). */
export const YC_DEMO_ORG_ENTITY_ID_DEFAULT =
  "ac06749c-e7a1-46f8-943c-7a27b69d451d";

export interface DemoPersonaDef {
  key: string;
  display_name: string;
  role_title: string;
  card_blurb: string;
  /** Login email already provisioned on the demo tenant. */
  email: string;
  relationship: "employee" | "contractor" | "external";
  is_admin: boolean;
}

/**
 * WHAT: Canonical HelioGrid review personas for the YC Labs tenant.
 * WHY: Stable keys for launcher + Talk bank; emails match live provision.
 */
/**
 * Story order: Leadership → Review ownership → Specialist diligence →
 * Operations → Contributors. One connected HelioGrid review process.
 */
export const YC_DEMO_PERSONAS: readonly DemoPersonaDef[] = [
  {
    key: "organization_lead",
    display_name: "Y Combinator",
    role_title: "Organization lead",
    card_blurb:
      "See the current recommendation, material risk, what Otzar handled, and the one decision that may still need leadership.",
    email: "demo@otzar.ai",
    relationship: "employee",
    is_admin: true,
  },
  {
    key: "application_review_lead",
    display_name: "Ava Chen",
    role_title: "Application review lead",
    card_blurb:
      "Own the review journey: recommendation, dependencies, and interview readiness.",
    email: "ava.chen+meridian@niovlabs.com",
    relationship: "employee",
    is_admin: false,
  },
  {
    key: "technical_diligence_lead",
    display_name: "Jordan Hale",
    role_title: "Technical diligence lead",
    card_blurb: "See technical work, evidence gaps, and what blocks advance.",
    email: "jordan.hale+meridian@niovlabs.com",
    relationship: "employee",
    is_admin: false,
  },
  {
    key: "security_lead",
    display_name: "Casey Nguyen",
    role_title: "Security lead",
    card_blurb:
      "See the security gate, who is waiting, and the exact remaining controls.",
    email: "casey.nguyen+meridian@niovlabs.com",
    relationship: "employee",
    is_admin: false,
  },
  {
    key: "market_review_lead",
    display_name: "Riley Okonkwo",
    role_title: "Market review lead",
    card_blurb:
      "See customer evidence, market risk, and recommendation movement.",
    email: "riley.okonkwo+meridian@niovlabs.com",
    relationship: "employee",
    is_admin: false,
  },
  {
    key: "program_coordinator",
    display_name: "Sam Rivera",
    role_title: "Program coordinator",
    card_blurb:
      "Keep scheduling, handoffs, and report delivery moving without noise.",
    email: "sam.rivera+meridian@niovlabs.com",
    relationship: "employee",
    is_admin: false,
  },
  {
    key: "regular_reviewer",
    display_name: "Morgan Lee",
    role_title: "Regular reviewer",
    card_blurb:
      "Receive a focused assignment without organization-wide noise.",
    email: "morgan.lee+meridian@niovlabs.com",
    relationship: "employee",
    is_admin: false,
  },
  {
    key: "contractor",
    display_name: "Quinn Marsh",
    role_title: "Contractor researcher",
    card_blurb:
      "Contribute bounded expertise without broad internal access.",
    email: "quinn.marsh+meridian@niovlabs.com",
    relationship: "contractor",
    is_admin: false,
  },
] as const;

export function demoLauncherEnabled(): boolean {
  return process.env.DEMO_PERSONA_LAUNCHER_ENABLED === "true";
}

export function ycDemoOrgEntityId(): string {
  return (
    process.env.YC_DEMO_ORG_ENTITY_ID?.trim() || YC_DEMO_ORG_ENTITY_ID_DEFAULT
  );
}

export function findPersonaByKey(key: string): DemoPersonaDef | null {
  return YC_DEMO_PERSONAS.find((p) => p.key === key) ?? null;
}

/**
 * WHAT: Resolve persona entity_id only if active member of YC demo org.
 * INPUT: persona key.
 * OUTPUT: entity_id or null.
 */
export async function resolveDemoPersonaEntity(
  personaKey: string,
): Promise<{ persona: DemoPersonaDef; entity_id: string } | null> {
  const persona = findPersonaByKey(personaKey);
  if (!persona) return null;
  const orgId = ycDemoOrgEntityId();
  const entity = await prisma.entity.findFirst({
    where: {
      email: persona.email,
      deleted_at: null,
      status: "ACTIVE",
    },
    select: { entity_id: true },
  });
  if (!entity) return null;
  const mem = await prisma.entityMembership.findFirst({
    where: {
      parent_id: orgId,
      child_id: entity.entity_id,
      is_active: true,
    },
    select: { membership_id: true },
  });
  if (!mem) return null;
  return { persona, entity_id: entity.entity_id };
}

export function publicPersonaCards(): Array<{
  key: string;
  display_name: string;
  role_title: string;
  card_blurb: string;
  relationship: string;
}> {
  return YC_DEMO_PERSONAS.map((p) => ({
    key: p.key,
    display_name: p.display_name,
    role_title: p.role_title,
    card_blurb: p.card_blurb,
    relationship: p.relationship,
  }));
}
