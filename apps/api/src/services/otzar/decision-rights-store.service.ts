// FILE: decision-rights-store.service.ts
// PURPOSE: [BLOCK-3A] Structured per-(org, person) DOMAIN decision rights —
//          the runtime store that lets computeDecisionRights stop guessing
//          authority from transcript heuristics and start resolving it from
//          real org rights (owns / can_approve / recommend_only by
//          DecisionDomain), exactly the shape the Redwood Atlas harness
//          proved against fixtures.
//
//          PLANE DISCIPLINE (binding): this is plane 3 (domain ownership /
//          decision rights) and ONLY plane 3. Reporting hierarchy stays on
//          EntityMembership; approval authority stays on the dual-control /
//          policy / TAR rails. Nothing here grants tools, TAR capabilities,
//          role templates, or admin authority — rights inform decision /
//          truth / routing logic only. Rights are keyed to the HUMAN
//          entity_id; an AI Twin resolves THROUGH its human and never
//          carries a rights row (loadStructuredRightsForRoster only ever
//          sees the PERSON roster). Absence of a row = no structured
//          rights — the transcript heuristics continue unchanged.
// CONNECTS TO: decision-rights.ts (computeDecisionRights consumes the
//          adjusted DecisionInput), decision-rights-extraction.ts (the
//          heuristic fallback this overlays), comms-extract.service.ts
//          (governExtraction call site), org.routes.ts (the three routes),
//          tests/integration/decision-rights.test.ts.

import { prisma } from "@niov/database";
import type { DecisionDomain, DecisionInput, DecisionSignal } from "./decision-rights.js";

/** Domains an admin can assign. "unknown" is a classifier bucket for
 *  unclassifiable transcripts, never an assignable right. */
export const SETTABLE_DECISION_DOMAINS: readonly DecisionDomain[] = [
  "strategic",
  "technical",
  "product",
  "design",
  "security",
  "legal",
  "finance",
  "people",
  "customer",
  "execution",
  "architecture",
  "deadline",
] as const;

export interface DomainRights {
  owns: DecisionDomain[];
  can_approve: DecisionDomain[];
  recommend_only: DecisionDomain[];
}

/** A roster party's structured rights, ready for the pure overlay. */
export interface PartyDomainRights extends DomainRights {
  entity_id: string;
  /** Display name as it appears on the roster (transcript signals use names). */
  party: string;
}

export type RightsValidation =
  | { ok: true; rights: DomainRights }
  | { ok: false; code: "INVALID_DECISION_DOMAIN" | "CONFLICTING_RIGHTS"; message: string };

/** Validate + normalize a PATCH body: every value must be a settable
 *  DecisionDomain; a domain may appear in at most ONE of the three lists
 *  (a person cannot both own and merely recommend the same domain). */
export function validateDomainRights(body: {
  owns?: unknown;
  can_approve?: unknown;
  recommend_only?: unknown;
}): RightsValidation {
  const lists: Array<[keyof DomainRights, unknown]> = [
    ["owns", body.owns ?? []],
    ["can_approve", body.can_approve ?? []],
    ["recommend_only", body.recommend_only ?? []],
  ];
  const out: DomainRights = { owns: [], can_approve: [], recommend_only: [] };
  for (const [key, raw] of lists) {
    if (!Array.isArray(raw)) {
      return {
        ok: false,
        code: "INVALID_DECISION_DOMAIN",
        message: `${key} must be an array of decision domains.`,
      };
    }
    for (const value of raw) {
      if (typeof value !== "string" || !SETTABLE_DECISION_DOMAINS.includes(value as DecisionDomain)) {
        return {
          ok: false,
          code: "INVALID_DECISION_DOMAIN",
          message: `"${String(value)}" is not a decision domain. Valid domains: ${SETTABLE_DECISION_DOMAINS.join(", ")}.`,
        };
      }
      const domain = value as DecisionDomain;
      if (!out[key].includes(domain)) out[key].push(domain);
    }
  }
  const seen = new Map<DecisionDomain, keyof DomainRights>();
  for (const key of ["owns", "can_approve", "recommend_only"] as const) {
    for (const domain of out[key]) {
      const prior = seen.get(domain);
      if (prior !== undefined) {
        return {
          ok: false,
          code: "CONFLICTING_RIGHTS",
          message: `"${domain}" appears in both ${prior} and ${key} — a domain can hold one posture per person.`,
        };
      }
      seen.set(domain, key);
    }
  }
  return { ok: true, rights: out };
}

/** Upsert the (org, person) rights row. The caller has already verified
 *  org membership + admin capability; this touches ONLY
 *  entity_decision_rights (no TAR, no TwinConfig, no role template). */
export async function upsertDecisionRights(
  orgEntityId: string,
  entityId: string,
  updatedBy: string,
  rights: DomainRights,
): Promise<{ owns: string[]; can_approve: string[]; recommend_only: string[]; updated_at: Date }> {
  const row = await prisma.entityDecisionRights.upsert({
    where: { org_entity_id_entity_id: { org_entity_id: orgEntityId, entity_id: entityId } },
    create: {
      org_entity_id: orgEntityId,
      entity_id: entityId,
      owns: rights.owns,
      can_approve: rights.can_approve,
      recommend_only: rights.recommend_only,
      updated_by: updatedBy,
    },
    update: {
      owns: rights.owns,
      can_approve: rights.can_approve,
      recommend_only: rights.recommend_only,
      updated_by: updatedBy,
    },
  });
  return {
    owns: row.owns,
    can_approve: row.can_approve,
    recommend_only: row.recommend_only,
    updated_at: row.updated_at,
  };
}

/** The caller's own posture; null when no structured rights are set. */
export async function getDecisionRights(
  orgEntityId: string,
  entityId: string,
): Promise<DomainRights & { updated_at: Date } | null> {
  const row = await prisma.entityDecisionRights.findUnique({
    where: { org_entity_id_entity_id: { org_entity_id: orgEntityId, entity_id: entityId } },
  });
  if (row === null) return null;
  return {
    owns: row.owns as DecisionDomain[],
    can_approve: row.can_approve as DecisionDomain[],
    recommend_only: row.recommend_only as DecisionDomain[],
    updated_at: row.updated_at,
  };
}

/** Safe org summary: names + domains only — no emails, no TAR data, no
 *  hierarchy internals. Member-readable so Otzar (and people) can route
 *  decisions to the right owner. */
export async function listOrgDecisionRights(
  orgEntityId: string,
): Promise<Array<{ entity_id: string; display_name: string } & DomainRights>> {
  const rows = await prisma.entityDecisionRights.findMany({
    where: { org_entity_id: orgEntityId },
    orderBy: { updated_at: "desc" },
  });
  if (rows.length === 0) return [];
  const entities = await prisma.entity.findMany({
    where: { entity_id: { in: rows.map((r) => r.entity_id) } },
    select: { entity_id: true, display_name: true, entity_type: true },
  });
  const nameById = new Map(
    entities.filter((e) => e.entity_type === "PERSON").map((e) => [e.entity_id, e.display_name]),
  );
  return rows
    .filter((r) => nameById.has(r.entity_id))
    .map((r) => ({
      entity_id: r.entity_id,
      display_name: nameById.get(r.entity_id)!,
      owns: r.owns as DecisionDomain[],
      can_approve: r.can_approve as DecisionDomain[],
      recommend_only: r.recommend_only as DecisionDomain[],
    }));
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Load structured rights for the extraction roster (HUMAN roster members
 *  only — a Twin never appears here, so a Twin can never carry rights of
 *  its own). Returns [] when the org is unknown, ids are not real entity
 *  UUIDs (unit fixtures), no rows exist, OR the lookup fails (e.g. the
 *  table is not yet activated in this environment) — every one of those
 *  keeps the transcript-heuristic path byte-identical, per the doctrine
 *  that absent structured rights NEVER block extraction. */
export async function loadStructuredRightsForRoster(
  orgEntityId: string | null,
  roster: ReadonlyArray<{ entity_id: string; display_name: string }>,
): Promise<PartyDomainRights[]> {
  if (orgEntityId === null || !UUID_RE.test(orgEntityId)) return [];
  const real = roster.filter((r) => UUID_RE.test(r.entity_id));
  if (real.length === 0) return [];
  try {
    const rows = await prisma.entityDecisionRights.findMany({
      where: { org_entity_id: orgEntityId, entity_id: { in: real.map((r) => r.entity_id) } },
    });
    if (rows.length === 0) return [];
    const nameById = new Map(real.map((r) => [r.entity_id, r.display_name]));
    return rows.map((row) => ({
      entity_id: row.entity_id,
      party: nameById.get(row.entity_id) ?? row.entity_id,
      owns: row.owns as DecisionDomain[],
      can_approve: row.can_approve as DecisionDomain[],
      recommend_only: row.recommend_only as DecisionDomain[],
    }));
  } catch {
    return [];
  }
}

function matchesParty(signalParty: string, rights: PartyDomainRights): boolean {
  // Transcript signals carry name fragments ("Elena will lead", "Torres
  // owns this") — match when every signal token appears in the party's
  // name tokens. Callers treat non-unique situations conservatively.
  const sig = signalParty
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2);
  if (sig.length === 0) return false;
  const party = rights.party
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2);
  return sig.every((t) => party.includes(t));
}

/**
 * PURE overlay: reconcile the heuristic transcript DecisionInput with the
 * org's structured rights for this domain. Doctrine, mechanically:
 *   - a structured domain OWNER is the authority for that domain — a
 *     meeting lead / executive heuristic guess is demoted to an expertise
 *     signal (hierarchy or floor-holding alone confers zero decision
 *     rights; the executive does not always win);
 *   - with no owner present, a structured APPROVER for the domain is the
 *     authority (authorityType "approval");
 *   - a RECOMMEND-ONLY party can never sit in the authority seat for the
 *     domain — if the heuristics put them there, they are demoted and the
 *     seat goes to the structured owner/approver or falls empty (the
 *     engine then holds: decision_proposed, autonomy blocked);
 *   - no structured rights → the input is returned UNCHANGED (heuristic
 *     fallback). Policy continues to outrank everything downstream in
 *     computeDecisionRights (policyAllows is untouched here).
 */
export function applyStructuredRightsToDecisionInput<T extends DecisionInput>(
  input: T,
  rights: ReadonlyArray<PartyDomainRights>,
): T {
  if (rights.length === 0) return input;
  const domain = input.decisionDomain;
  const owner = rights.find((r) => r.owns.includes(domain));
  const approver = rights.find((r) => r.can_approve.includes(domain));
  const heuristic = input.authority;
  const heuristicRights =
    heuristic === null ? undefined : rights.find((r) => matchesParty(heuristic.party, r));
  const heuristicIsRecommendOnly =
    heuristicRights !== undefined && heuristicRights.recommend_only.includes(domain);

  const structuredSeat: DecisionSignal | null = owner
    ? {
        party: owner.party,
        authorityType: "role",
        strength: "strong",
        direction:
          heuristic !== null && matchesParty(heuristic.party, owner)
            ? heuristic.direction ?? null
            : null,
        evidence: `Structured decision rights: owns the ${domain} domain.`,
      }
    : approver
      ? {
          party: approver.party,
          authorityType: "approval",
          strength: "strong",
          direction:
            heuristic !== null && matchesParty(heuristic.party, approver)
              ? heuristic.direction ?? null
              : null,
          evidence: `Structured decision rights: can approve in the ${domain} domain.`,
        }
      : null;

  // No structured seat for this domain: only intervene if the heuristics
  // seated a recommend-only party — they can never finalize.
  if (structuredSeat === null) {
    if (!heuristicIsRecommendOnly || heuristic === null) return input;
    return {
      ...input,
      authority: null,
      expertise: [
        ...input.expertise,
        { ...heuristic, authorityType: "domain_expertise", strength: "moderate" },
      ],
      finalDecisionMade: false,
    };
  }

  const seatChanged = heuristic === null || !matchesParty(heuristic.party, owner ?? approver!);
  const demoted: DecisionSignal[] =
    seatChanged && heuristic !== null
      ? [{ ...heuristic, authorityType: "domain_expertise", strength: "moderate" }]
      : [];

  return {
    ...input,
    authority: structuredSeat,
    expertise: [...input.expertise, ...demoted],
    // A finalization spoken by someone who was demoted out of the seat is
    // not a finalized decision in this domain.
    finalDecisionMade: seatChanged && heuristicIsRecommendOnly ? false : input.finalDecisionMade,
  };
}
