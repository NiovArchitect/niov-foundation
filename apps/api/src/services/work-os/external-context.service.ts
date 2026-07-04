// FILE: external-context.service.ts
// PURPOSE: [T-1] READ-ONLY external-party context on work rows — context,
//          not CRM. A row gains external_context ONLY when a deterministic,
//          org-scoped link proves it:
//            1. details.external_context — the forward write target (T-2
//             wires ingestion); validated shape read-through.
//            2. conversation link — the row's conversation_id matches an
//             org ExternalCommitment.source_conversation_id (joined to its
//             governed ExternalCollaborator for person/company/relationship
//             + waiting direction).
//            3. governed-name link — source_lineage.source_actor fails
//             INTERNAL roster resolution but exactly + uniquely matches ONE
//             governed ExternalCollaborator display_name in this org
//             (roster-first: an internal match always wins; this keys to a
//             record a human deliberately tracked — never name-pattern
//             inference).
//          Silence otherwise — no invented parties. Projection carries safe
//          scalars + server-composed calm labels only (routing-reason
//          precedent): never emails, domains, external ids, source
//          excerpts, or backend enums. No mutation, no memory writes.
// CONNECTS TO: work-ledger.service.ts (enrichment call sites),
//          external-collaborator substrate (schema:3621/3684),
//          recipient-governance.ts (strict roster resolution),
//          tests/integration/external-context.test.ts.

import { prisma } from "@niov/database";
import { loadOrgMembers } from "../otzar/identity-reconciliation.service.js";
import { resolveTokenToEntities } from "../otzar/recipient-governance.js";
import type { WorkLedgerView } from "./work-ledger.service.js";

export type ExternalPartyType =
  | "client"
  | "prospect"
  | "vendor"
  | "partner"
  | "contractor"
  | "regulator"
  | "customer"
  | "unknown";

export interface ExternalContextProjection {
  external_party_type: ExternalPartyType;
  external_org_label?: string;
  external_person_label?: string;
  relationship_label?: string;
  /** Calm, server-composed card copy: "For Acme" / "Client follow-up" /
   *  "Waiting on Acme". */
  safe_context_label: string;
  waiting_direction?: "we_owe_them" | "they_owe_us" | "unknown";
  source: "external_collaborator" | "external_commitment" | "source_lineage" | "none";
}

// ExternalRelationshipType (schema:3580) → party type + human label.
// Unmapped relationship kinds keep their human label but type "unknown".
const RELATIONSHIP_MAP: Record<string, { party: ExternalPartyType; label: string }> = {
  CLIENT: { party: "client", label: "Client" },
  PROSPECT: { party: "prospect", label: "Prospect" },
  VENDOR: { party: "vendor", label: "Vendor" },
  PARTNER: { party: "partner", label: "Partner" },
  CONTRACTOR: { party: "contractor", label: "Contractor" },
  REGULATOR: { party: "regulator", label: "Regulator" },
  AGENCY: { party: "partner", label: "Agency" },
  INVESTOR: { party: "unknown", label: "Investor" },
  ADVISOR: { party: "unknown", label: "Advisor" },
  CANDIDATE: { party: "unknown", label: "Candidate" },
  OTHER: { party: "unknown", label: "External" },
};

const PARTY_TYPES = new Set<string>([
  "client", "prospect", "vendor", "partner", "contractor", "regulator", "customer", "unknown",
]);

function cap(v: unknown, max: number): string | undefined {
  return typeof v === "string" && v.trim().length > 0 ? v.trim().slice(0, max) : undefined;
}

// Calm label composition — the founder's copy families, nothing louder.
function composeLabel(args: {
  relationshipLabel?: string;
  orgLabel?: string;
  personLabel?: string;
  direction?: "we_owe_them" | "they_owe_us" | "unknown";
}): string {
  const who = args.orgLabel ?? args.personLabel;
  if (args.direction === "they_owe_us" && who !== undefined) return `Waiting on ${who}`;
  if (args.direction === "we_owe_them") {
    return `${args.relationshipLabel ?? "External"} follow-up`;
  }
  if (who !== undefined) return `For ${who}`;
  return `${args.relationshipLabel ?? "External"} work`;
}

/** Validated read-through of a details.external_context sub-object (the T-2
 *  write target). Malformed or unsafe shapes are ignored — never rendered. */
function fromDetails(details: unknown): ExternalContextProjection | undefined {
  if (typeof details !== "object" || details === null) return undefined;
  const ec = (details as Record<string, unknown>).external_context;
  if (typeof ec !== "object" || ec === null) return undefined;
  const o = ec as Record<string, unknown>;
  const party = typeof o.external_party_type === "string" && PARTY_TYPES.has(o.external_party_type)
    ? (o.external_party_type as ExternalPartyType)
    : "unknown";
  const orgLabel = cap(o.external_org_label, 80);
  const personLabel = cap(o.external_person_label, 80);
  const relationshipLabel = cap(o.relationship_label, 40);
  if (orgLabel === undefined && personLabel === undefined && relationshipLabel === undefined) {
    return undefined; // nothing safe to say — silence, not an empty chip
  }
  const direction =
    o.waiting_direction === "we_owe_them" || o.waiting_direction === "they_owe_us"
      ? o.waiting_direction
      : undefined;
  return {
    external_party_type: party,
    ...(orgLabel !== undefined ? { external_org_label: orgLabel } : {}),
    ...(personLabel !== undefined ? { external_person_label: personLabel } : {}),
    ...(relationshipLabel !== undefined ? { relationship_label: relationshipLabel } : {}),
    safe_context_label:
      cap(o.safe_context_label, 60) ??
      composeLabel({ relationshipLabel, orgLabel, personLabel, direction }),
    ...(direction !== undefined ? { waiting_direction: direction } : {}),
    source: "external_collaborator",
  };
}

function fromCollaborator(collab: {
  display_name: string;
  company_name: string | null;
  relationship_type: string;
  /** [T-3] the governed external-organization link — its display name wins
   *  over the denormalized company_name fallback when present. */
  external_organization?: { display_name: string } | null;
}, direction?: "we_owe_them" | "they_owe_us", source: ExternalContextProjection["source"] = "external_commitment"): ExternalContextProjection {
  const rel = RELATIONSHIP_MAP[collab.relationship_type] ?? RELATIONSHIP_MAP.OTHER!;
  const orgLabel =
    cap(collab.external_organization?.display_name, 80) ?? cap(collab.company_name, 80);
  const personLabel = cap(collab.display_name, 80);
  return {
    external_party_type: rel.party,
    ...(orgLabel !== undefined ? { external_org_label: orgLabel } : {}),
    ...(personLabel !== undefined ? { external_person_label: personLabel } : {}),
    relationship_label: rel.label,
    safe_context_label: composeLabel({
      relationshipLabel: rel.label,
      ...(orgLabel !== undefined ? { orgLabel } : {}),
      ...(personLabel !== undefined ? { personLabel } : {}),
      ...(direction !== undefined ? { direction } : {}),
    }),
    ...(direction !== undefined ? { waiting_direction: direction } : {}),
    source,
  };
}

// WHAT: batch-enrich projected ledger views with external_context.
// INPUT: parallel arrays of DB rows + their views (enrichParticipantNames
//        idiom) — all rows belong to ONE org by construction of the callers.
// OUTPUT: mutates views in place (additive optional field). Read-only:
//         two bounded queries per call, no writes of any kind.
export async function enrichExternalContext(
  rows: ReadonlyArray<{ conversation_id: string | null; details?: unknown }>,
  views: WorkLedgerView[],
  orgEntityId: string,
): Promise<void> {
  if (rows.length === 0) return;

  // 1. Validated details read-through (T-2's write target).
  for (let i = 0; i < rows.length; i++) {
    const fromRow = fromDetails(rows[i]!.details);
    if (fromRow !== undefined) views[i]!.external_context = fromRow;
  }

  // 2. Conversation link → governed ExternalCommitment (+ collaborator).
  const convIds = [
    ...new Set(
      rows
        .map((r, i) => (views[i]!.external_context === undefined ? r.conversation_id : null))
        .filter((v): v is string => v !== null),
    ),
  ];
  if (convIds.length > 0) {
    const commitments = await prisma.externalCommitment.findMany({
      where: {
        org_entity_id: orgEntityId,
        source_conversation_id: { in: convIds },
        deleted_at: null,
      },
      select: {
        source_conversation_id: true,
        direction: true,
        external_collaborator: {
          select: {
            display_name: true,
            company_name: true,
            relationship_type: true,
            external_organization: { select: { display_name: true } },
          },
        },
      },
    });
    const byConv = new Map<string, (typeof commitments)[number]>();
    for (const c of commitments) {
      if (c.source_conversation_id !== null && !byConv.has(c.source_conversation_id)) {
        byConv.set(c.source_conversation_id, c);
      }
    }
    for (let i = 0; i < rows.length; i++) {
      if (views[i]!.external_context !== undefined) continue;
      const conv = rows[i]!.conversation_id;
      if (conv === null) continue;
      const match = byConv.get(conv);
      if (match === undefined) continue;
      views[i]!.external_context = fromCollaborator(
        match.external_collaborator,
        match.direction === "EXTERNAL_OWES_INTERNAL" ? "they_owe_us" : "we_owe_them",
      );
    }
  }

  // 3. Governed-name link from source lineage (roster-first, unique-only).
  const pending = views
    .map((v, i) => ({ v, i }))
    .filter(
      ({ v }) =>
        v.external_context === undefined &&
        v.source_lineage !== undefined &&
        v.source_lineage.source_actor !== null,
    );
  if (pending.length > 0) {
    const [members, collaborators] = await Promise.all([
      loadOrgMembers(orgEntityId),
      prisma.externalCollaborator.findMany({
        where: { org_entity_id: orgEntityId, deleted_at: null },
        select: {
          display_name: true,
          company_name: true,
          relationship_type: true,
          external_organization: { select: { display_name: true } },
        },
      }),
    ]);
    const roster = members.map((m) => ({
      entity_id: m.entity_id,
      display_name: m.display_name,
      email: m.email,
    }));
    for (const { v } of pending) {
      const actor = v.source_lineage!.source_actor!;
      // Internal roster match wins — an employee is never an external party.
      if (resolveTokenToEntities(actor, roster).length > 0) continue;
      const exact = collaborators.filter(
        (c) => c.display_name.toLowerCase() === actor.toLowerCase(),
      );
      if (exact.length !== 1) continue; // ambiguous or absent → silence
      v.external_context = fromCollaborator(exact[0]!, undefined, "source_lineage");
    }
  }
}
