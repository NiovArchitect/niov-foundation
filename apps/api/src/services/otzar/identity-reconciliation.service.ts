// FILE: identity-reconciliation.service.ts
// PURPOSE: Slice C — CROSS-SOURCE IDENTITY RECONCILIATION. The same person shows
//          up differently per source: a display name in a transcript, an email in
//          Gmail, a handle/username in Slack. This resolves any of those to ONE
//          canonical org entity, so their work aggregates under a single identity
//          in the one WorkLedger instead of fragmenting into separate mentions.
// GOVERNANCE: org-scoped (only matches members of THIS org — no cross-tenant
//          identity match), DETERMINISTIC (exact email / exact username / strict
//          display-name rules — never fuzzy, never a guess), and HONEST: an
//          ambiguous token is held (never auto-picked) and an unknown identifier
//          resolves to nothing (the caller holds it NEEDS_OWNER, not a wrong match).
// CONNECTS TO: recipient-governance.ts (resolveTokenToEntities), comms-ingest
//          (source-event ingest wiring), @niov/database.

import { prisma } from "@niov/database";
import { resolveTokenToEntities, type RosterEntry } from "./recipient-governance.js";

export interface IdentityHint {
  name?: string | null;
  email?: string | null;
  handle?: string | null;
}

export type ReconcileMethod = "email" | "username" | "name" | "ambiguous" | "none";

export interface ReconciledIdentity {
  entity_id: string | null;
  method: ReconcileMethod;
  /** Display names of the candidates when ambiguous (for review), else []. */
  candidates: string[];
}

interface OrgMember {
  entity_id: string;
  display_name: string;
  email: string | null;
  username: string | null;
}

/** The org roster with the identifiers reconciliation matches on. One query set,
 *  reused across a batch. Only ACTIVE members of THIS org — the tenant boundary. */
export async function loadOrgMembers(orgEntityId: string): Promise<OrgMember[]> {
  const memberships = await prisma.entityMembership.findMany({
    where: { parent_id: orgEntityId, is_active: true },
    select: { child_id: true },
  });
  const ids = memberships.map((m) => m.child_id);
  if (ids.length === 0) return [];
  const [ents, profs] = await Promise.all([
    prisma.entity.findMany({ where: { entity_id: { in: ids } }, select: { entity_id: true, display_name: true, email: true } }),
    prisma.entityProfile.findMany({ where: { entity_id: { in: ids } }, select: { entity_id: true, username: true } }),
  ]);
  const uname = new Map(profs.map((p) => [p.entity_id, p.username]));
  return ents.map((e) => ({ entity_id: e.entity_id, display_name: e.display_name, email: e.email, username: uname.get(e.entity_id) ?? null }));
}

/** Reconcile one identity hint against a preloaded org member set. Deterministic
 *  precedence: email (exact) → username/handle (exact) → display-name (strict).
 *  No match precedence collapses to a wrong entity. */
export function reconcileAgainst(members: OrgMember[], hint: IdentityHint): ReconciledIdentity {
  // 1) Email — the strongest cross-source key (Entity.email is unique).
  const email = (hint.email ?? "").trim().toLowerCase();
  if (email.length > 0) {
    const m = members.find((x) => (x.email ?? "").toLowerCase() === email);
    if (m) return { entity_id: m.entity_id, method: "email", candidates: [] };
  }
  // 2) Handle/username — exact (EntityProfile.username is unique). Tolerates a
  //    leading "@" from chat handles.
  const handle = (hint.handle ?? "").trim().replace(/^@/, "").toLowerCase();
  if (handle.length > 0) {
    const m = members.find((x) => (x.username ?? "").toLowerCase() === handle);
    if (m) return { entity_id: m.entity_id, method: "username", candidates: [] };
  }
  // 3) Display name — STRICT rules (exact / first-name / whole token), reused
  //    from recipient-governance so behaviour matches the transcript path.
  const name = (hint.name ?? "").trim();
  if (name.length > 0) {
    const roster: RosterEntry[] = members.map((x) => ({ entity_id: x.entity_id, display_name: x.display_name, email: x.email }));
    const ids = resolveTokenToEntities(name, roster);
    if (ids.length === 1) return { entity_id: ids[0]!, method: "name", candidates: [] };
    if (ids.length > 1) {
      const byId = new Map(members.map((x) => [x.entity_id, x.display_name]));
      return { entity_id: null, method: "ambiguous", candidates: ids.map((id) => byId.get(id) ?? id) };
    }
  }
  return { entity_id: null, method: "none", candidates: [] };
}

/** Reconcile a single identity hint to a canonical org entity. */
export async function reconcileIdentity(orgEntityId: string, hint: IdentityHint): Promise<ReconciledIdentity> {
  const members = await loadOrgMembers(orgEntityId);
  return reconcileAgainst(members, hint);
}

/** Reconcile a batch of hints (one member-set fetch). Returns each hint with its
 *  resolution — callers use the resolved entity, hold ambiguous for review, and
 *  keep unresolved as NEEDS_OWNER. */
export async function reconcileParticipants(
  orgEntityId: string,
  hints: IdentityHint[],
): Promise<Array<{ hint: IdentityHint; resolved: ReconciledIdentity }>> {
  const members = await loadOrgMembers(orgEntityId);
  return hints.map((hint) => ({ hint, resolved: reconcileAgainst(members, hint) }));
}
