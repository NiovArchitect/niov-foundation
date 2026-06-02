// FILE: proposed-action-catalog.ts
// PURPOSE: W5 Action Promotion Runtime per ADR-0086 §1. The static
//          on-disk W4 Proposed Action catalog is loaded at startup,
//          validated for the minimum field set the promotion service
//          requires, and exposed as a frozen, immutable in-memory
//          registry indexed by catalog `id` string.
//
//          Pure module; no DB; no I/O at access time (only at load
//          time). The registry is read-only.
// CONNECTS TO:
//   - docs/proposed-action/{team,business,enterprise}-proposed-actions.json
//     (canonical W4 substrate)
//   - apps/api/src/services/proposed-action/proposed-action-promotion.service.ts
//     (the only consumer)
//   - ADR-0086 §1 catalog-id identification + frozen registry pattern
//
// PRINCIPLE: the W4 catalog is the canonical substrate. W5 does NOT
//            mutate it, does NOT cache stale snapshots, and does NOT
//            permit catalog modification at runtime. A catalog update
//            requires a redeploy (per ADR-0086 §Consequences).

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const PLAN_ARCHETYPE_VALUES = [
  "starter-pilot",
  "team",
  "business",
  "enterprise",
] as const;
export type PlanArchetype = (typeof PLAN_ARCHETYPE_VALUES)[number];

export const ACTOR_ROLE_VALUES = [
  "DIGITAL_TWIN",
  "AI_TEAMMATE",
  "ADMIN_TWIN",
  "OPERATOR",
  "HIVE_COORDINATOR",
] as const;
export type ActorRole = (typeof ACTOR_ROLE_VALUES)[number];

export const INTENDED_EXTERNAL_SYSTEM_VALUES = [
  "SLACK",
  "GOOGLE_WORKSPACE",
  "JIRA_CLOUD",
  "LINEAR",
  "GITHUB",
  "MICROSOFT_365",
  "INTERNAL_ONLY",
  "OUTBOUND_WEBHOOK",
] as const;
export type IntendedExternalSystem =
  (typeof INTENDED_EXTERNAL_SYSTEM_VALUES)[number];

export const RETENTION_CLASS_VALUES = [
  "STANDARD",
  "AGGREGATE_ONLY",
  "EPHEMERAL",
] as const;
export type RetentionClass = (typeof RETENTION_CLASS_VALUES)[number];

export interface ProposedActionGovernanceGates {
  policy_decision_required: boolean;
  approval_chain_required: boolean;
  dual_control_required: boolean;
  audit_required: true;
  approval_role_requirements?: ReadonlyArray<string>;
}

export interface ProposedActionEntry {
  id: string;
  plan_archetype_id: PlanArchetype;
  actor_role: ActorRole;
  intended_external_system: IntendedExternalSystem;
  operation: string;
  governance_gates: ProposedActionGovernanceGates;
  retention_class: RetentionClass;
  name: string;
  proposed_action_state: "PROPOSED_NOT_AUTHORIZED";
}

const CATALOG_FILES = [
  "team-proposed-actions.json",
  "business-proposed-actions.json",
  "enterprise-proposed-actions.json",
] as const;

// WHAT: Resolve the directory holding the canonical W4 substrate.
// INPUT: None at runtime; relies on the source-tree layout.
// OUTPUT: Absolute path to docs/proposed-action/.
// WHY: The compiled module lives at apps/api/dist/... at runtime; the
//      docs/ tree is shipped alongside it (verified by the build
//      pipeline). The relative path is computed from this module's
//      location. In tests the path resolves to the repo root.
function resolveCatalogDir(): string {
  // From apps/api/src/services/proposed-action/ up to repo root,
  // then into docs/proposed-action.
  return resolve(__dirname, "../../../../../docs/proposed-action");
}

interface RawProposedAction {
  id?: unknown;
  plan_archetype_id?: unknown;
  actor_role?: unknown;
  intended_external_system?: unknown;
  proposed_payload_shape?: { operation?: unknown };
  governance_gates?: {
    policy_decision_required?: unknown;
    approval_chain_required?: unknown;
    dual_control_required?: unknown;
    audit_required?: unknown;
    approval_role_requirements?: unknown;
  };
  retention_class?: unknown;
  name?: unknown;
  proposed_action_state?: unknown;
}

interface RawCatalogFile {
  kind?: unknown;
  catalog_version?: unknown;
  plan_archetype_id?: unknown;
  items?: unknown;
}

function validateEntry(
  raw: RawProposedAction,
  fileArchetype: PlanArchetype,
  fileName: string,
  index: number,
): ProposedActionEntry {
  const where = `${fileName}#items[${index}]`;
  const id = raw.id;
  if (typeof id !== "string" || id.length === 0) {
    throw new Error(`W4 catalog ${where}: id must be a non-empty string`);
  }
  const archetype = raw.plan_archetype_id ?? fileArchetype;
  if (
    typeof archetype !== "string" ||
    !(PLAN_ARCHETYPE_VALUES as readonly string[]).includes(archetype)
  ) {
    throw new Error(
      `W4 catalog ${where} id=${id}: plan_archetype_id invalid`,
    );
  }
  const actor_role = raw.actor_role;
  if (
    typeof actor_role !== "string" ||
    !(ACTOR_ROLE_VALUES as readonly string[]).includes(actor_role)
  ) {
    throw new Error(`W4 catalog ${where} id=${id}: actor_role invalid`);
  }
  const intended_external_system = raw.intended_external_system;
  if (
    typeof intended_external_system !== "string" ||
    !(INTENDED_EXTERNAL_SYSTEM_VALUES as readonly string[]).includes(
      intended_external_system,
    )
  ) {
    throw new Error(
      `W4 catalog ${where} id=${id}: intended_external_system invalid`,
    );
  }
  const operation = raw.proposed_payload_shape?.operation;
  if (typeof operation !== "string" || operation.length === 0) {
    throw new Error(
      `W4 catalog ${where} id=${id}: proposed_payload_shape.operation must be a non-empty string`,
    );
  }
  const gg = raw.governance_gates;
  if (gg === null || typeof gg !== "object") {
    throw new Error(`W4 catalog ${where} id=${id}: governance_gates missing`);
  }
  if (gg.audit_required !== true) {
    throw new Error(
      `W4 catalog ${where} id=${id}: governance_gates.audit_required must be true (RULE 4)`,
    );
  }
  const flags: ProposedActionGovernanceGates = {
    policy_decision_required: gg.policy_decision_required === true,
    approval_chain_required: gg.approval_chain_required === true,
    dual_control_required: gg.dual_control_required === true,
    audit_required: true,
  };
  if (Array.isArray(gg.approval_role_requirements)) {
    flags.approval_role_requirements = Object.freeze(
      (gg.approval_role_requirements as unknown[]).filter(
        (s): s is string => typeof s === "string",
      ),
    );
  }
  const retention_class = raw.retention_class;
  if (
    typeof retention_class !== "string" ||
    !(RETENTION_CLASS_VALUES as readonly string[]).includes(retention_class)
  ) {
    throw new Error(`W4 catalog ${where} id=${id}: retention_class invalid`);
  }
  const name = raw.name;
  if (typeof name !== "string" || name.length === 0) {
    throw new Error(`W4 catalog ${where} id=${id}: name missing`);
  }
  if (raw.proposed_action_state !== "PROPOSED_NOT_AUTHORIZED") {
    throw new Error(
      `W4 catalog ${where} id=${id}: proposed_action_state must be PROPOSED_NOT_AUTHORIZED`,
    );
  }
  return Object.freeze({
    id,
    plan_archetype_id: archetype as PlanArchetype,
    actor_role: actor_role as ActorRole,
    intended_external_system:
      intended_external_system as IntendedExternalSystem,
    operation,
    governance_gates: Object.freeze(flags),
    retention_class: retention_class as RetentionClass,
    name,
    proposed_action_state: "PROPOSED_NOT_AUTHORIZED",
  }) as ProposedActionEntry;
}

function loadFromDir(dir: string): Map<string, ProposedActionEntry> {
  const registry = new Map<string, ProposedActionEntry>();
  for (const fileName of CATALOG_FILES) {
    const filePath = resolve(dir, fileName);
    const raw = readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as RawCatalogFile;
    if (parsed.kind !== "ProposedActionCatalog") {
      throw new Error(`W4 catalog ${fileName}: kind must be ProposedActionCatalog`);
    }
    const fileArchetype = parsed.plan_archetype_id;
    if (
      typeof fileArchetype !== "string" ||
      !(PLAN_ARCHETYPE_VALUES as readonly string[]).includes(fileArchetype)
    ) {
      throw new Error(
        `W4 catalog ${fileName}: plan_archetype_id must be one of ${PLAN_ARCHETYPE_VALUES.join(", ")}`,
      );
    }
    const items = parsed.items;
    if (!Array.isArray(items)) {
      throw new Error(`W4 catalog ${fileName}: items must be an array`);
    }
    items.forEach((raw, i) => {
      const entry = validateEntry(
        raw as RawProposedAction,
        fileArchetype as PlanArchetype,
        fileName,
        i,
      );
      if (registry.has(entry.id)) {
        throw new Error(
          `W4 catalog ${fileName}#items[${i}]: duplicate catalog id ${entry.id}`,
        );
      }
      registry.set(entry.id, entry);
    });
  }
  return registry;
}

let CACHED_REGISTRY: ReadonlyMap<string, ProposedActionEntry> | null = null;

// WHAT: Return the frozen in-memory registry of all W4 proposed
//        actions, loading from disk on first access.
// INPUT: None.
// OUTPUT: A readonly Map keyed by catalog id.
// WHY: Lazy load + cache so unit tests can override before first
//      access via setProposedActionRegistryForTests().
export function getProposedActionRegistry(): ReadonlyMap<
  string,
  ProposedActionEntry
> {
  if (CACHED_REGISTRY === null) {
    CACHED_REGISTRY = loadFromDir(resolveCatalogDir());
  }
  return CACHED_REGISTRY;
}

// WHAT: Resolve a single proposed action by its catalog id.
// INPUT: Catalog id string (the W4 `id` field; e.g.,
//        "proposed-action.sprint-risk-summary.business.v1").
// OUTPUT: The frozen entry or null if not found.
// WHY: Single resolution point for the promotion service.
export function getProposedActionById(id: string): ProposedActionEntry | null {
  return getProposedActionRegistry().get(id) ?? null;
}

// WHAT: List every entry in the registry.
// INPUT: None.
// OUTPUT: A frozen array of every entry.
// WHY: Used by future GET routes and by catalog-size tests.
export function listProposedActions(): ReadonlyArray<ProposedActionEntry> {
  return Object.freeze(Array.from(getProposedActionRegistry().values()));
}

// WHAT: Test-only registry override.
// INPUT: A Map of id → entry. Pass null to revert to disk-backed load.
// OUTPUT: None.
// WHY: Unit + integration tests fix the registry to a known small set
//      so they don't depend on the on-disk catalog evolving over time.
//      Mirrors the FixtureBasedLLMProvider DI pattern (ADR-0014).
export function setProposedActionRegistryForTests(
  registry: ReadonlyMap<string, ProposedActionEntry> | null,
): void {
  CACHED_REGISTRY = registry;
}
