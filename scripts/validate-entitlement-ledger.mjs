#!/usr/bin/env node
// FILE: validate-entitlement-ledger.mjs
// PURPOSE: B4 Entitlement Ledger Design Substrate validator. Pure
//          Node ESM, no deps. Mirrors validate-entitlement-catalog.mjs
//          sentence-level negation + subtree skip. Verifies wrapper
//          shape + invariants + cross-references into B2 catalog at
//          docs/entitlement-catalog/* + 4 plan archetypes covered +
//          canonical-phrase presence + forbidden-phrase scan.
// CONNECTS TO: docs/entitlement-ledger/*.json, docs/entitlement-catalog/*.json
// USAGE: node scripts/validate-entitlement-ledger.mjs

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIR = resolve(__dirname, "..", "docs", "entitlement-ledger");
const CATALOG_DIR = resolve(__dirname, "..", "docs", "entitlement-catalog");

const REQUIRED_FILES = [
  "README.md",
  "ledger.schema.json",
  "starter-pilot-ledger.json",
  "team-ledger.json",
  "business-ledger.json",
  "enterprise-ledger.json",
];

const LEDGER_FILES = REQUIRED_FILES.filter(
  (f) => f.endsWith(".json") && f !== "ledger.schema.json",
);

const REQUIRED_PLAN_ARCHETYPES = new Set([
  "starter-pilot",
  "team",
  "business",
  "enterprise",
]);

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

const CANONICAL_PHRASE =
  "Customers should not pay extra just to have memory be safe.";

const FORBIDDEN_SCAN_SKIP_KEYS = new Set([
  "forbidden_consumers",
  "forbidden_defaults",
  "must_not",
  "governance_notes",
  "audit_expectations",
  "governance_review_points",
  "entitlement_check_examples",
]);

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
  "rule 0",
  "rule 20",
  "by construction",
];

let errors = [];
let warnings = [];
let stats = { files: 0, ledgers: 0 };
function err(msg) { errors.push(msg); }
function warn(msg) { warnings.push(msg); }

function loadJson(filename, dir = DIR) {
  const path = join(dir, filename);
  const text = readFileSync(path, "utf8");
  try { return JSON.parse(text); } catch (e) {
    err(`${filename}: JSON parse failed — ${e.message}`);
    return null;
  }
}

function loadText(filename) {
  const path = join(DIR, filename);
  return readFileSync(path, "utf8");
}

function sentenceProhibitsPhrase(sentenceLower, phraseLower) {
  if (!sentenceLower.includes(phraseLower)) return false;
  return NEGATION_MARKERS.some((m) => sentenceLower.includes(m));
}

function walkAndScanForbidden(filename, node, path = []) {
  if (typeof node === "string") {
    const lower = node.toLowerCase();
    const sentences = lower.split(/[.!?;\n]/);
    for (const phrase of FORBIDDEN_PHRASES) {
      const phraseLower = phrase.toLowerCase();
      if (!lower.includes(phraseLower)) continue;
      const advocating = sentences.filter(
        (s) => s.includes(phraseLower) && !sentenceProhibitsPhrase(s, phraseLower),
      );
      if (advocating.length > 0) {
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
    for (const [key, value] of Object.entries(node)) {
      if (FORBIDDEN_SCAN_SKIP_KEYS.has(key)) continue;
      walkAndScanForbidden(filename, value, [...path, key]);
    }
  }
}

// Collect B2 catalog IDs for cross-reference checks
function collectIdsFromCatalogFile(filename) {
  if (!existsSync(join(CATALOG_DIR, filename))) return new Set();
  const doc = loadJson(filename, CATALOG_DIR);
  if (!doc || !Array.isArray(doc.items)) return new Set();
  const ids = new Set();
  for (const item of doc.items) {
    if (typeof item.id === "string") ids.add(item.id);
  }
  return ids;
}

const B2_PLAN_IDS = collectIdsFromCatalogFile("plans.json");
const B2_SEAT_IDS = collectIdsFromCatalogFile("seats.json");
const B2_PACK_IDS = collectIdsFromCatalogFile("capability-packs.json");
const B2_METER_IDS = collectIdsFromCatalogFile("usage-meters.json");

function validateLedgerInner(filename, ledger) {
  if (typeof ledger !== "object" || ledger === null) {
    err(`${filename}@ledger: must be an object`);
    return;
  }
  // Plan-archetype invariants
  if (
    ledger.DMW_baseline_included !== true ||
    ledger.safety_baseline_included !== true ||
    ledger.audit_baseline_included !== true
  ) {
    err(`${filename}@ledger: DMW_baseline_included + safety_baseline_included + audit_baseline_included must all be true`);
  }
  if (ledger.runtime_state !== "DESIGN_SUBSTRATE_ONLY") {
    err(`${filename}@ledger.runtime_state: must equal "DESIGN_SUBSTRATE_ONLY" (got "${ledger.runtime_state}")`);
  }
  if (Array.isArray(ledger.source_adr_refs)) {
    if (!ledger.source_adr_refs.includes("ADR-0083")) {
      err(`${filename}@ledger.source_adr_refs: must include "ADR-0083"`);
    }
  } else {
    err(`${filename}@ledger.source_adr_refs: must be a non-empty array`);
  }
  // Cross-reference plan
  if (
    typeof ledger.consumes_plan_id === "string" &&
    B2_PLAN_IDS.size > 0 &&
    !B2_PLAN_IDS.has(ledger.consumes_plan_id)
  ) {
    err(`${filename}@ledger.consumes_plan_id: "${ledger.consumes_plan_id}" not found in docs/entitlement-catalog/plans.json`);
  }
  // Cross-reference seat tiers
  if (Array.isArray(ledger.seat_entitlements)) {
    for (const seat of ledger.seat_entitlements) {
      if (
        typeof seat.seat_tier_id === "string" &&
        B2_SEAT_IDS.size > 0 &&
        !B2_SEAT_IDS.has(seat.seat_tier_id)
      ) {
        err(`${filename}@ledger.seat_entitlements: "${seat.seat_tier_id}" not found in docs/entitlement-catalog/seats.json`);
      }
    }
  }
  // Cross-reference capability packs + verify activation_state invariant
  if (Array.isArray(ledger.capability_pack_entitlements)) {
    for (const pack of ledger.capability_pack_entitlements) {
      if (
        typeof pack.pack_id === "string" &&
        B2_PACK_IDS.size > 0 &&
        !B2_PACK_IDS.has(pack.pack_id)
      ) {
        err(`${filename}@ledger.capability_pack_entitlements: "${pack.pack_id}" not found in docs/entitlement-catalog/capability-packs.json`);
      }
      if (pack.activation_state !== "ENTITLED_NOT_ACTIVATED") {
        err(`${filename}@ledger.capability_pack_entitlements: ${pack.pack_id} activation_state must be "ENTITLED_NOT_ACTIVATED"`);
      }
    }
  }
  // Cross-reference usage meters + verify enforcement_mode invariant
  if (Array.isArray(ledger.usage_meters)) {
    for (const meter of ledger.usage_meters) {
      if (
        typeof meter.meter_id === "string" &&
        B2_METER_IDS.size > 0 &&
        !B2_METER_IDS.has(meter.meter_id)
      ) {
        err(`${filename}@ledger.usage_meters: "${meter.meter_id}" not found in docs/entitlement-catalog/usage-meters.json`);
      }
      if (meter.enforcement_mode !== "DEFERRED_TO_RUNTIME") {
        err(`${filename}@ledger.usage_meters: ${meter.meter_id} enforcement_mode must be "DEFERRED_TO_RUNTIME"`);
      }
    }
  }
  if (
    !Array.isArray(ledger.entitlement_check_examples) ||
    ledger.entitlement_check_examples.length < 1
  ) {
    err(`${filename}@ledger.entitlement_check_examples: must include at least one worked example`);
  }
  if (
    !Array.isArray(ledger.governance_review_points) ||
    ledger.governance_review_points.length < 1
  ) {
    err(`${filename}@ledger.governance_review_points: must include at least one entry`);
  }
}

// 1. File presence
for (const f of REQUIRED_FILES) {
  if (!existsSync(join(DIR, f))) {
    err(`MISSING required file: ${f}`);
  } else {
    stats.files++;
  }
}

// 2. Schema parses
const schema = loadJson("ledger.schema.json");
if (schema && !schema.title.includes("Entitlement Ledger")) {
  warn(`ledger.schema.json: title may be off`);
}

// 3. Per-file validation
const seenArchetypes = new Set();
for (const f of LEDGER_FILES) {
  if (!existsSync(join(DIR, f))) continue;
  const doc = loadJson(f);
  if (!doc) continue;
  for (const required of ["kind", "catalog_version", "envelope_defaults", "ledger"]) {
    if (doc[required] === undefined) {
      err(`${f}: missing required top-level field "${required}"`);
    }
  }
  if (doc.ledger) {
    stats.ledgers++;
    validateLedgerInner(f, doc.ledger);
    if (doc.ledger.plan_archetype_id) seenArchetypes.add(doc.ledger.plan_archetype_id);
  }
  walkAndScanForbidden(f, doc);
}

// 4. All 4 plan archetypes covered exactly once
for (const arch of REQUIRED_PLAN_ARCHETYPES) {
  if (!seenArchetypes.has(arch)) err(`MISSING required plan archetype: ${arch}`);
}

// 5. Canonical phrase in README (whitespace-normalized)
try {
  const readmeText = loadText("README.md");
  const normalized = readmeText.replace(/\s+/g, " ");
  if (!normalized.includes(CANONICAL_PHRASE)) {
    err(`README.md: missing canonical phrase`);
  }
} catch (e) {
  err(`README.md: failed to read — ${e.message}`);
}

// 6. Output
console.log(`B4 Entitlement Ledger Design Substrate Validator`);
console.log(`-------------------------------------------`);
console.log(`Files checked: ${stats.files}/${REQUIRED_FILES.length}`);
console.log(`Ledgers checked: ${stats.ledgers}`);
console.log(`Plan archetypes covered: ${seenArchetypes.size}/${REQUIRED_PLAN_ARCHETYPES.size}`);
console.log(`B2 cross-references — plans: ${B2_PLAN_IDS.size} · seats: ${B2_SEAT_IDS.size} · packs: ${B2_PACK_IDS.size} · meters: ${B2_METER_IDS.size}`);
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
