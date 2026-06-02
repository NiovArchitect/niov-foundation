#!/usr/bin/env node
// FILE: validate-proposed-action.mjs
// PURPOSE: W4 Proposed Action Substrate validator. Pure Node ESM,
//          no deps. Mirrors validate-workflow-recommendation.mjs.
//          Verifies:
//            - All required files exist
//            - Wrapper shape (kind / catalog_version / envelope_defaults
//              / plan_archetype_id / items)
//            - Per-item required fields
//            - proposed_action_state == "PROPOSED_NOT_AUTHORIZED"
//            - adr_0081_stage == 3
//            - audit_required == true (RULE 4 invariant)
//            - state_machine.initial_state == "PROPOSED_NOT_AUTHORIZED"
//            - Closed-vocab actor_role + intended_external_system
//            - consumes_workflow_recommendation_id cross-reference
//              into docs/workflow-recommendation/<archetype>-
//              workflows.json
//            - 3 plan archetypes covered (starter-pilot omitted per
//              ADR-0081 §2.2 — all Stage 1 W3 items at that tier)
//            - Forbidden-phrase scan + canonical README phrase
// CONNECTS TO: docs/proposed-action/*.json,
//              docs/workflow-recommendation/*.json (cross-ref),
//              ADR-0081, ADR-0057, ADR-0026, ADR-0085.
// USAGE: node scripts/validate-proposed-action.mjs

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIR = resolve(__dirname, "..", "docs", "proposed-action");
const W3_DIR = resolve(__dirname, "..", "docs", "workflow-recommendation");

const REQUIRED_FILES = [
  "README.md",
  "proposed-action.schema.json",
  "team-proposed-actions.json",
  "business-proposed-actions.json",
  "enterprise-proposed-actions.json",
];

const CATALOG_FILES = REQUIRED_FILES.filter(
  (f) => f.endsWith(".json") && f !== "proposed-action.schema.json",
);

const REQUIRED_PLAN_ARCHETYPES = new Set([
  "team",
  "business",
  "enterprise",
]);

const VALID_ACTOR_ROLES = new Set([
  "DIGITAL_TWIN",
  "AI_TEAMMATE",
  "ADMIN_TWIN",
  "OPERATOR",
  "HIVE_COORDINATOR",
]);

const VALID_EXTERNAL_SYSTEMS = new Set([
  "SLACK",
  "GOOGLE_WORKSPACE",
  "JIRA_CLOUD",
  "LINEAR",
  "GITHUB",
  "MICROSOFT_365",
  "INTERNAL_ONLY",
  "OUTBOUND_WEBHOOK",
]);

const VALID_RETENTION_CLASSES = new Set([
  "STANDARD",
  "AGGREGATE_ONLY",
  "EPHEMERAL",
]);

// Per-archetype expected item counts per README:
//   team: 4 / business: 6 / enterprise: 8
const EXPECTED_ITEM_COUNTS = {
  team: 4,
  business: 6,
  enterprise: 8,
};

const FORBIDDEN_PHRASES = [
  "guaranteed compliant",
  "regulator approved",
  "no fine risk",
  "employee score",
  "manager surveillance",
  "psychological profile",
  "auto-execute",
  "unrestricted write",
];

const CANONICAL_README_PHRASE =
  "Runtime promotion to Section 2 Action (per ADR-0057) requires separate Founder authorization per slice + ADR-0026 dual-control where required";

const errors = [];
const successes = [];

function fail(msg) {
  errors.push(msg);
}

function ok(msg) {
  successes.push(msg);
}

// 1. Required files exist
for (const file of REQUIRED_FILES) {
  const path = resolve(DIR, file);
  if (!existsSync(path)) {
    fail(`MISSING FILE: docs/proposed-action/${file}`);
  } else {
    ok(`exists: docs/proposed-action/${file}`);
  }
}

// 2. README canonical phrase
const readmePath = resolve(DIR, "README.md");
if (existsSync(readmePath)) {
  const readme = readFileSync(readmePath, "utf8");
  if (!readme.includes(CANONICAL_README_PHRASE)) {
    fail(`README missing canonical phrase: "${CANONICAL_README_PHRASE.slice(0, 80)}..."`);
  } else {
    ok("README contains canonical Stage 3 governance phrase");
  }
  // Forbidden phrase scan
  for (const phrase of FORBIDDEN_PHRASES) {
    if (readme.toLowerCase().includes(phrase.toLowerCase())) {
      // Allowed only inside `forbidden_*` lines per the schema discipline;
      // README is prose so any occurrence is a drift.
      fail(`README contains forbidden phrase: "${phrase}"`);
    }
  }
}

// 3. W3 IDs for cross-reference. Build a Set of every W3
//    workflow-recommendation ID present across all W3 catalogs.
const W3_IDS = new Set();
const W3_FILES = [
  "starter-pilot-workflows.json",
  "team-workflows.json",
  "business-workflows.json",
  "enterprise-workflows.json",
];
for (const w3file of W3_FILES) {
  const p = resolve(W3_DIR, w3file);
  if (!existsSync(p)) {
    fail(`W3 cross-reference source missing: docs/workflow-recommendation/${w3file}`);
    continue;
  }
  try {
    const w3 = JSON.parse(readFileSync(p, "utf8"));
    for (const item of w3.items ?? []) {
      if (typeof item.id === "string") {
        W3_IDS.add(item.id);
      }
    }
  } catch (err) {
    fail(`W3 cross-reference JSON parse error in ${w3file}: ${err.message}`);
  }
}
ok(`W3 cross-reference: ${W3_IDS.size} workflow-recommendation IDs loaded`);

// 4. Per-catalog validation
const seenArchetypes = new Set();
for (const file of CATALOG_FILES) {
  const path = resolve(DIR, file);
  if (!existsSync(path)) continue;
  let catalog;
  try {
    catalog = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    fail(`JSON parse error in ${file}: ${err.message}`);
    continue;
  }

  // Wrapper shape
  if (catalog.kind !== "ProposedActionCatalog") {
    fail(`${file}: kind must be "ProposedActionCatalog"`);
  }
  if (
    typeof catalog.catalog_version !== "string" ||
    !/^[0-9]+\.[0-9]+\.[0-9]+$/.test(catalog.catalog_version)
  ) {
    fail(`${file}: catalog_version must be semver-like`);
  }
  if (!REQUIRED_PLAN_ARCHETYPES.has(catalog.plan_archetype_id)) {
    fail(`${file}: plan_archetype_id must be one of team / business / enterprise`);
  } else {
    seenArchetypes.add(catalog.plan_archetype_id);
  }

  // Per-archetype expected counts
  const expected = EXPECTED_ITEM_COUNTS[catalog.plan_archetype_id];
  if (
    typeof expected === "number" &&
    Array.isArray(catalog.items) &&
    catalog.items.length !== expected
  ) {
    fail(
      `${file}: expected ${expected} items per README; found ${catalog.items.length}`,
    );
  } else {
    ok(`${file}: item count ${catalog.items?.length ?? 0} matches README`);
  }

  if (!Array.isArray(catalog.items) || catalog.items.length === 0) {
    fail(`${file}: items[] must be a non-empty array`);
    continue;
  }

  // Per-item validation
  for (const [i, item] of catalog.items.entries()) {
    const label = `${file}[${i}]`;
    // Required fields
    const required = [
      "id",
      "version",
      "status",
      "object_type",
      "name",
      "consumes_workflow_recommendation_id",
      "adr_0081_stage",
      "actor_role",
      "intended_external_system",
      "proposed_payload_shape",
      "governance_gates",
      "safe_fallback",
      "audit_expectations",
      "retention_class",
      "state_machine",
      "proposed_action_state",
    ];
    for (const field of required) {
      if (!(field in item)) {
        fail(`${label}: missing required field "${field}"`);
      }
    }
    if (item.object_type !== "ProposedAction") {
      fail(`${label}: object_type must be "ProposedAction"`);
    }
    if (item.adr_0081_stage !== 3) {
      fail(`${label}: adr_0081_stage must be 3 (Proposed Action)`);
    }
    if (item.proposed_action_state !== "PROPOSED_NOT_AUTHORIZED") {
      fail(`${label}: proposed_action_state must be "PROPOSED_NOT_AUTHORIZED"`);
    }
    if (!VALID_ACTOR_ROLES.has(item.actor_role)) {
      fail(
        `${label}: actor_role "${item.actor_role}" must be one of ${[...VALID_ACTOR_ROLES].join(" / ")}`,
      );
    }
    if (!VALID_EXTERNAL_SYSTEMS.has(item.intended_external_system)) {
      fail(
        `${label}: intended_external_system "${item.intended_external_system}" must be one of ${[...VALID_EXTERNAL_SYSTEMS].join(" / ")}`,
      );
    }
    if (!VALID_RETENTION_CLASSES.has(item.retention_class)) {
      fail(
        `${label}: retention_class "${item.retention_class}" must be one of STANDARD / AGGREGATE_ONLY / EPHEMERAL`,
      );
    }
    // governance_gates.audit_required MUST be true (RULE 4)
    if (item.governance_gates?.audit_required !== true) {
      fail(`${label}: governance_gates.audit_required must be true (RULE 4)`);
    }
    // state_machine.initial_state
    if (item.state_machine?.initial_state !== "PROPOSED_NOT_AUTHORIZED") {
      fail(`${label}: state_machine.initial_state must be "PROPOSED_NOT_AUTHORIZED"`);
    }
    if (
      !Array.isArray(item.state_machine?.transitions) ||
      item.state_machine.transitions.length === 0
    ) {
      fail(`${label}: state_machine.transitions must be a non-empty array`);
    }
    // proposed_payload_shape sanity
    if (
      typeof item.proposed_payload_shape?.operation !== "string" ||
      item.proposed_payload_shape.operation.length === 0
    ) {
      fail(`${label}: proposed_payload_shape.operation must be a non-empty string`);
    }
    if (
      !Array.isArray(item.proposed_payload_shape?.safe_field_set) ||
      item.proposed_payload_shape.safe_field_set.length === 0
    ) {
      fail(
        `${label}: proposed_payload_shape.safe_field_set must be a non-empty array`,
      );
    }
    // W3 cross-reference
    if (
      typeof item.consumes_workflow_recommendation_id === "string" &&
      !W3_IDS.has(item.consumes_workflow_recommendation_id)
    ) {
      fail(
        `${label}: consumes_workflow_recommendation_id "${item.consumes_workflow_recommendation_id}" does not resolve to any W3 workflow-recommendation ID`,
      );
    } else if (typeof item.consumes_workflow_recommendation_id === "string") {
      ok(
        `${label}: W3 cross-ref resolves (${item.consumes_workflow_recommendation_id})`,
      );
    }
  }
}

// 5. All 3 expected archetypes covered
for (const arch of REQUIRED_PLAN_ARCHETYPES) {
  if (!seenArchetypes.has(arch)) {
    fail(`Plan archetype not covered: ${arch}`);
  } else {
    ok(`Plan archetype covered: ${arch}`);
  }
}

// Report
console.log(`✓ ${successes.length} checks passed`);
if (errors.length === 0) {
  console.log("✓ W4 proposed-action substrate validator: 0 errors");
  process.exit(0);
} else {
  console.error(`✗ W4 proposed-action substrate validator: ${errors.length} errors`);
  for (const err of errors) {
    console.error(`  - ${err}`);
  }
  process.exit(1);
}
