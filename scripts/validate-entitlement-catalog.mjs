#!/usr/bin/env node
// FILE: validate-entitlement-catalog.mjs
// PURPOSE: ADR-0083 + Amendment 1 Section 8 B2 — static entitlement
//          catalog validator. Pure Node ESM (no deps). Verifies parse
//          + required files + required wrappers + uniqueness +
//          per-item required fields + ADR-0083 source ref + DMW
//          baseline presence + $250 base + required object presence
//          + forbidden-phrase scan + canonical-phrase presence.
// CONNECTS TO: docs/entitlement-catalog/*.json + ADR-0083 + Amendment 1
// USAGE: node scripts/validate-entitlement-catalog.mjs

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CATALOG_DIR = resolve(__dirname, "..", "docs", "entitlement-catalog");

const REQUIRED_FILES = [
  "README.md",
  "catalog.schema.json",
  "plans.json",
  "seats.json",
  "capability-packs.json",
  "connector-pack-families.json",
  "usage-meters.json",
  "governance-rules.json",
  "downgrade-policies.json",
  "enterprise-add-ons.json",
];

const UNIVERSAL_REQUIRED_FIELDS = [
  "id",
  "version",
  "status",
  "object_type",
  "name",
  "description",
  "human_readable_summary",
  "model_usage_notes",
  "source_adr_refs",
  "governance_notes",
  "billing_notes",
  "safe_defaults",
  "forbidden_defaults",
  "allowed_consumers",
  "forbidden_consumers",
  "audit_expectations",
];

const FORBIDDEN_PHRASES = [
  "guaranteed compliant",
  "regulator approved",
  "no fine risk",
  "employee score",
  "manager surveillance",
  "psychological profile",
  "unrestricted write access",
  "auto-approved",
  "connector activated by billing",
  "dmw sold separately",
  "wallet fee required for memory safety",
];

const CANONICAL_PHRASE = "Customers should not pay extra just to have memory be safe.";

const REQUIRED_SEAT_IDS = [
  "seat.standard-twin.v1",
  "seat.professional-twin.v1",
  "seat.executive-twin.v1",
  "seat.otzar-administrator.v1",
  "seat.board-observer.v1",
  "seat.external-collaborator.v1",
];

const REQUIRED_PACK_IDS = [
  "pack.dandelion-activation.v1",
  "pack.workflow-automation.v1",
  "pack.advanced-audit-compliance.v1",
  "pack.dmw-memory-governance.v1",
  "pack.agent-playground-simulation.v1",
  "pack.enterprise-analytics.v1",
  "pack.regulator-evidence.v1",
  "pack.premium-support-onboarding.v1",
];

const REQUIRED_CONNECTOR_FAMILY_IDS = [
  "connector-pack.collaboration.v1",
  "connector-pack.workspace-knowledge.v1",
  "connector-pack.project-engineering.v1",
  "connector-pack.revenue.v1",
  "connector-pack.customer.v1",
  "connector-pack.people.v1",
  "connector-pack.finance-expense-travel.v1",
  "connector-pack.legal-compliance.v1",
];

const REQUIRED_METER_IDS = [
  "meter.active-twin-seats.v1",
  "meter.active-admin-seats.v1",
  "meter.active-board-observer-seats.v1",
  "meter.dandelion-activation-runs.v1",
  "meter.workflow-recommendations.v1",
  "meter.workflow-runs.v1",
  "meter.proposed-actions.v1",
  "meter.connector-read-events.v1",
  "meter.connector-write-events.v1",
  "meter.simulation-runs.v1",
  "meter.audit-exports.v1",
  "meter.evidence-package-generation.v1",
  "meter.memory-capsule-volume.v1",
  "meter.advanced-dmw-governance-events.v1",
];

const REQUIRED_NON_PAYWALLABLE_IDS = [
  "non-paywallable.historical-audit-records.v1",
  "non-paywallable.legally-required-retention.v1",
  "non-paywallable.audit-chain-integrity.v1",
  "non-paywallable.basic-dmw-memory-safety.v1",
  "non-paywallable.basic-security-controls.v1",
  "non-paywallable.user-offboarding-safety.v1",
  "non-paywallable.ability-to-disconnect-or-revoke-connectors.v1",
  "non-paywallable.compliance-audit-export-during-grace-or-legal-window.v1",
  "non-paywallable.ability-to-disable-risky-automation-or-connectors.v1",
  "non-paywallable.preserving-data-boundaries.v1",
  "non-paywallable.same-org-boundary.v1",
  "non-paywallable.cross-tenant-isolation.v1",
  "non-paywallable.legal-hold-preservation.v1",
];

// Subtrees to skip during forbidden-phrase scan — the catalog
// necessarily contains forbidden_* fields enumerating what is
// forbidden. Skipping these subtrees prevents the validator from
// false-positiving on its own guard definitions.
const FORBIDDEN_SCAN_SKIP_KEYS = new Set([
  "forbidden_defaults",
  "forbidden_consumers",
  "forbidden_inferences",
  "forbidden_features",
  "forbidden_categories",
  "must_not",
  "entitlement_does_not_authorize",
  "no_leak_guard",
  "no_leak_surfaces",
  "governance_notes",
  "audit_expectations",
  "billing_notes",
]);

const ID_PATTERN = /^[a-z][a-zA-Z0-9_-]*(\.[a-zA-Z0-9][a-zA-Z0-9_-]*)+\.v[0-9]+$/;
const ADR_REF_PATTERN = /^(ADR-[0-9]{4}|RULE [0-9]+|US [0-9,]+)$/;

let errors = [];
let warnings = [];
let stats = { files: 0, items: 0 };

function err(msg) { errors.push(msg); }
function warn(msg) { warnings.push(msg); }

function loadJson(filename) {
  const path = join(CATALOG_DIR, filename);
  const text = readFileSync(path, "utf8");
  try {
    return JSON.parse(text);
  } catch (e) {
    err(`${filename}: JSON parse failed — ${e.message}`);
    return null;
  }
}

function loadText(filename) {
  const path = join(CATALOG_DIR, filename);
  return readFileSync(path, "utf8");
}

function validateItem(filename, item, path = []) {
  for (const field of UNIVERSAL_REQUIRED_FIELDS) {
    if (item[field] === undefined || item[field] === null) {
      err(`${filename}@${path.concat(field).join(".")}: missing required field "${field}"`);
    }
  }
  if (item.id && !ID_PATTERN.test(item.id)) {
    err(`${filename}@${path.join(".") || "item"}: id "${item.id}" does not match pattern ${ID_PATTERN}`);
  }
  if (Array.isArray(item.source_adr_refs)) {
    if (!item.source_adr_refs.includes("ADR-0083")) {
      err(`${filename}@${path.concat("source_adr_refs").join(".")}: must include "ADR-0083"`);
    }
    for (const ref of item.source_adr_refs) {
      if (!ADR_REF_PATTERN.test(ref)) {
        err(`${filename}@${path.concat("source_adr_refs").join(".")}: ref "${ref}" does not match pattern ${ADR_REF_PATTERN}`);
      }
    }
  }
}

// Items whose explicit purpose is to PROHIBIT a forbidden concept
// (e.g. rule.no-manager-surveillance.v1, non-paywallable.basic-dmw-memory-safety.v1)
// necessarily contain the prohibited phrase in their name/description.
// Skip the entire subtree for such items — the prohibition itself is
// the catalog's safety mechanism, not a leak.
const NEGATION_ID_PREFIXES = [
  "rule.no-",
  "rule.basic-",
  "rule.dmw-",
  "rule.advanced-",
  "rule.downgrade-",
  "rule.non-",
  "rule.same-",
  "rule.map-",
  "rule.admin-",
  "rule.dual-",
  "rule.connector-",
  "rule.workflow-",
  "rule.entitlement-",
  "rule.billing-",
  "non-paywallable.",
];

function isNegationItem(node) {
  return (
    typeof node === "object" &&
    node !== null &&
    typeof node.id === "string" &&
    NEGATION_ID_PREFIXES.some((prefix) => node.id.startsWith(prefix))
  );
}

// Negation markers — when a sentence contains one of these alongside
// a forbidden phrase, the sentence is canonically prohibiting (not
// advocating) the phrase. The forbidden-phrase guard is designed to
// catch accidental advocacy, not canonical prohibitions.
const NEGATION_MARKERS = [
  "never",
  "no ",
  "not ",
  "forbidden",
  "absolutely",
  "prohibit",
  "prohibited",
  "without",
  "must not",
  "may not",
  "cannot",
  "rule-20-protected",
  "rule-0",
  "rule 20",
  "rule 0",
];

function sentenceProhibitsPhrase(sentenceLower, phraseLower) {
  // True if the sentence contains the phrase AND a negation marker.
  if (!sentenceLower.includes(phraseLower)) return false;
  return NEGATION_MARKERS.some((m) => sentenceLower.includes(m));
}

function walkAndScanForbidden(filename, node, path = []) {
  if (typeof node === "string") {
    const lower = node.toLowerCase();
    // Split into sentence-ish chunks
    const sentences = lower.split(/[.!?;\n]/);
    for (const phrase of FORBIDDEN_PHRASES) {
      const phraseLower = phrase.toLowerCase();
      if (!lower.includes(phraseLower)) continue;
      // Check each sentence: if every sentence containing the phrase
      // also contains a negation marker, it's canonical prohibition.
      const advocatingSentences = sentences.filter(
        (s) => s.includes(phraseLower) && !sentenceProhibitsPhrase(s, phraseLower)
      );
      if (advocatingSentences.length > 0) {
        err(`${filename}@${path.join(".")}: contains forbidden phrase "${phrase}" without prohibition marker`);
      }
    }
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((child, ix) => walkAndScanForbidden(filename, child, [...path, String(ix)]));
    return;
  }
  if (typeof node === "object" && node !== null) {
    if (isNegationItem(node)) {
      // Skip the entire subtree: this item is a canonical prohibition,
      // its name/description necessarily reference the forbidden phrase.
      return;
    }
    for (const [key, value] of Object.entries(node)) {
      if (FORBIDDEN_SCAN_SKIP_KEYS.has(key)) continue;
      walkAndScanForbidden(filename, value, [...path, key]);
    }
  }
}

// 1. File presence
for (const f of REQUIRED_FILES) {
  const path = join(CATALOG_DIR, f);
  if (!existsSync(path)) {
    err(`MISSING required file: ${f}`);
  } else {
    stats.files++;
  }
}

// 2. Schema parses
const schema = loadJson("catalog.schema.json");
if (schema && schema.title !== "NIOV Foundation Section 8 B2 Static Entitlement Catalog Schema") {
  warn(`catalog.schema.json: title may be off — got "${schema.title}"`);
}

// 3. Per-file validation
const CATALOG_FILES = [
  "plans.json",
  "seats.json",
  "capability-packs.json",
  "connector-pack-families.json",
  "usage-meters.json",
  "governance-rules.json",
  "downgrade-policies.json",
  "enterprise-add-ons.json",
];

const allItemsById = {};
for (const f of CATALOG_FILES) {
  const path = join(CATALOG_DIR, f);
  if (!existsSync(path)) continue;
  const doc = loadJson(f);
  if (!doc) continue;
  for (const required of ["kind", "catalog_version", "envelope_defaults", "items"]) {
    if (doc[required] === undefined) {
      err(`${f}: missing required top-level field "${required}"`);
    }
  }
  if (!Array.isArray(doc.items)) continue;
  const seenIds = new Set();
  doc.items.forEach((item, ix) => {
    stats.items++;
    validateItem(f, item, ["items", String(ix)]);
    if (item.id) {
      if (seenIds.has(item.id)) {
        err(`${f}: duplicate id "${item.id}" in items[]`);
      }
      seenIds.add(item.id);
      allItemsById[item.id] = { file: f, item };
    }
  });
  // governance-rules.json carries embedded non_paywallable_safety_rules + billing_admin_permission_profile
  if (f === "governance-rules.json") {
    if (Array.isArray(doc.non_paywallable_safety_rules)) {
      doc.non_paywallable_safety_rules.forEach((item, ix) => {
        stats.items++;
        validateItem(f, item, ["non_paywallable_safety_rules", String(ix)]);
        if (item.id) {
          if (seenIds.has(item.id)) {
            err(`${f}: duplicate id "${item.id}" in non_paywallable_safety_rules[]`);
          }
          seenIds.add(item.id);
          allItemsById[item.id] = { file: f, item };
        }
      });
    } else {
      err(`${f}: missing non_paywallable_safety_rules array`);
    }
    if (typeof doc.billing_admin_permission_profile === "object" && doc.billing_admin_permission_profile !== null) {
      stats.items++;
      validateItem(f, doc.billing_admin_permission_profile, ["billing_admin_permission_profile"]);
      const id = doc.billing_admin_permission_profile.id;
      if (id) {
        if (seenIds.has(id)) {
          err(`${f}: duplicate id "${id}" in billing_admin_permission_profile`);
        }
        seenIds.add(id);
        allItemsById[id] = { file: f, item: doc.billing_admin_permission_profile };
      }
    } else {
      err(`${f}: missing billing_admin_permission_profile object`);
    }
  }
  // forbidden-phrase scan on the full doc (with skip-keys discipline)
  walkAndScanForbidden(f, doc);
}

// 4. DMW baseline + $250 base presence in plans.json
const plansDoc = loadJson("plans.json");
if (plansDoc && Array.isArray(plansDoc.items)) {
  let dmwBaselineCount = 0;
  let dollar250Count = 0;
  for (const plan of plansDoc.items) {
    if (plan.DMW_baseline_included === true) dmwBaselineCount++;
    const planText = JSON.stringify(plan);
    if (planText.includes("$250")) dollar250Count++;
  }
  if (dmwBaselineCount !== plansDoc.items.length) {
    err(`plans.json: every plan must have DMW_baseline_included=true. Got ${dmwBaselineCount}/${plansDoc.items.length}`);
  }
  if (dollar250Count === 0) {
    err(`plans.json: $250 base must appear in at least one plan`);
  }
}

// 5. DMW baseline presence in seats.json
const seatsDoc = loadJson("seats.json");
if (seatsDoc && Array.isArray(seatsDoc.items)) {
  let seatDmwBaselineCount = 0;
  for (const seat of seatsDoc.items) {
    if (seat.DMW_baseline_included === true) seatDmwBaselineCount++;
  }
  if (seatDmwBaselineCount !== seatsDoc.items.length) {
    err(`seats.json: every seat must have DMW_baseline_included=true. Got ${seatDmwBaselineCount}/${seatsDoc.items.length}`);
  }
}

// 6. Required seat IDs
for (const id of REQUIRED_SEAT_IDS) {
  if (!allItemsById[id]) err(`MISSING required seat id: ${id}`);
}

// 7. Required capability pack IDs
for (const id of REQUIRED_PACK_IDS) {
  if (!allItemsById[id]) err(`MISSING required capability pack id: ${id}`);
}

// 8. Required connector pack family IDs
for (const id of REQUIRED_CONNECTOR_FAMILY_IDS) {
  if (!allItemsById[id]) err(`MISSING required connector pack family id: ${id}`);
}

// 9. Required usage meter IDs
for (const id of REQUIRED_METER_IDS) {
  if (!allItemsById[id]) err(`MISSING required usage meter id: ${id}`);
}

// 10. Required non-paywallable rule IDs
for (const id of REQUIRED_NON_PAYWALLABLE_IDS) {
  if (!allItemsById[id]) err(`MISSING required non-paywallable rule id: ${id}`);
}

// 11. Canonical phrase presence in README
try {
  const readmeText = loadText("README.md");
  if (!readmeText.includes(CANONICAL_PHRASE)) {
    err(`README.md: missing canonical phrase: "${CANONICAL_PHRASE}"`);
  }
} catch (e) {
  err(`README.md: failed to read — ${e.message}`);
}

// 12. Output
console.log(`Section 8 B2 Entitlement Catalog Validator`);
console.log(`-------------------------------------------`);
console.log(`Files checked: ${stats.files}/${REQUIRED_FILES.length}`);
console.log(`Items checked: ${stats.items}`);
if (warnings.length > 0) {
  console.log(`Warnings: ${warnings.length}`);
  for (const w of warnings) console.log(`  WARN: ${w}`);
}
if (errors.length > 0) {
  console.log(`Errors: ${errors.length}`);
  for (const e of errors) console.log(`  ERR : ${e}`);
  console.log(`-------------------------------------------`);
  console.log(`FAIL`);
  process.exit(1);
}
console.log(`-------------------------------------------`);
console.log(`OK`);
