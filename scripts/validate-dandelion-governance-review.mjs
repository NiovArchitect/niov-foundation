#!/usr/bin/env node
// FILE: validate-dandelion-governance-review.mjs
// PURPOSE: D4 Dandelion Governance Review Substrate validator. Pure
//          Node ESM, no deps. Mirrors validate-dandelion-recommendation.mjs
//          sentence-level negation + subtree skip. Verifies wrapper
//          shape + required fields + review_state + consumes_recommendation_id
//          cross-reference into docs/dandelion-recommendation/ + 9 map
//          types covered + review_outcome_options enum + forbidden-phrase
//          scan + canonical phrase in README.
// CONNECTS TO: docs/dandelion-governance-review/*.json,
//              docs/dandelion-recommendation/*.json (cross-ref), ADR-0082.
// USAGE: node scripts/validate-dandelion-governance-review.mjs

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIR = resolve(__dirname, "..", "docs", "dandelion-governance-review");
const RECOMMENDATION_DIR = resolve(__dirname, "..", "docs", "dandelion-recommendation");

const REQUIRED_FILES = [
  "README.md",
  "governance-review.schema.json",
  "company-map-governance-review.json",
  "org-relationship-map-governance-review.json",
  "role-map-governance-review.json",
  "tool-map-governance-review.json",
  "workflow-map-governance-review.json",
  "authority-map-governance-review.json",
  "memory-dmw-map-governance-review.json",
  "risk-map-governance-review.json",
  "aha-moment-map-governance-review.json",
];

const CATALOG_FILES = REQUIRED_FILES.filter(
  (f) => f !== "README.md" && f !== "governance-review.schema.json",
);

const UNIVERSAL_REQUIRED_FIELDS = [
  "id",
  "version",
  "status",
  "object_type",
  "map_type",
  "name",
  "description",
  "human_readable_summary",
  "model_usage_notes",
  "source_adr_refs",
  "consumes_recommendation_id",
  "region_reviews",
  "approval_chain",
  "dual_control_required",
  "escalation_path",
  "DMW_scope_implications",
  "governance_review_points",
  "safe_defaults",
  "forbidden_defaults",
  "allowed_consumers",
  "forbidden_consumers",
  "audit_expectations",
  "review_state",
];

const ALLOWED_REVIEW_OUTCOMES = new Set([
  "APPROVE",
  "APPROVE_WITH_CONDITIONS",
  "DEFER_FOR_MORE_INFO",
  "REJECT",
  "ESCALATE_TO_FOUNDER",
]);

const REQUIRED_MAP_TYPES = [
  "CompanyMap",
  "OrgRelationshipMap",
  "RoleMap",
  "ToolMap",
  "WorkflowMap",
  "AuthorityMap",
  "MemoryDmwMap",
  "RiskMap",
  "AhaMomentMap",
];

const FORBIDDEN_PHRASES = [
  "employee score",
  "manager surveillance",
  "psychological profile",
  "guaranteed compliant",
  "regulator approved",
  "no fine risk",
  "unrestricted write access",
  "auto-approved",
  "connector activated",
  "permission granted",
  "autonomous execution enabled",
];

const CANONICAL_PHRASE =
  "Dandelion maps the territory. Admins approve the map. Foundation governs what can happen inside the map. DMWs scope what can be remembered. Digital Twins operate within the approved terrain.";

const FORBIDDEN_SCAN_SKIP_KEYS = new Set([
  "forbidden_defaults",
  "forbidden_consumers",
  "must_not",
  "no_leak_rules",
  "governance_notes",
  "audit_expectations",
  "governance_review_points",
  "region_reviews",
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
  "absolute",
  "remains absolute",
];

const ID_PATTERN = /^[a-z][a-zA-Z0-9_-]*(\.[a-zA-Z0-9][a-zA-Z0-9_-]*)+\.v[0-9]+$/;
const ADR_REF_PATTERN = /^(ADR-[0-9]{4}|RULE [0-9]+|US [0-9,]+)$/;
const RECOMMENDATION_ID_PATTERN = /^recommendation\.[a-z][a-zA-Z0-9_-]*(\.[a-zA-Z0-9][a-zA-Z0-9_-]*)*\.v[0-9]+$/;

let errors = [];
let warnings = [];
let stats = { files: 0, items: 0 };
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

// Collect D3 recommendation IDs for cross-reference check
const D3_RECOMMENDATION_IDS = new Set();
if (existsSync(RECOMMENDATION_DIR)) {
  for (const f of readdirSync(RECOMMENDATION_DIR)) {
    if (!f.endsWith(".json") || f === "recommendation.schema.json") continue;
    const doc = loadJson(f, RECOMMENDATION_DIR);
    if (doc && Array.isArray(doc.items)) {
      for (const item of doc.items) {
        if (typeof item.id === "string") D3_RECOMMENDATION_IDS.add(item.id);
      }
    }
  }
}

function validateItem(filename, item, path = []) {
  for (const field of UNIVERSAL_REQUIRED_FIELDS) {
    if (item[field] === undefined || item[field] === null) {
      err(`${filename}@${path.concat(field).join(".")}: missing required field "${field}"`);
    }
  }
  if (item.id && !ID_PATTERN.test(item.id)) {
    err(`${filename}: id "${item.id}" does not match pattern`);
  }
  if (Array.isArray(item.source_adr_refs)) {
    if (!item.source_adr_refs.includes("ADR-0082")) {
      err(`${filename}@source_adr_refs: must include "ADR-0082"`);
    }
    for (const ref of item.source_adr_refs) {
      if (!ADR_REF_PATTERN.test(ref)) {
        err(`${filename}@source_adr_refs: ref "${ref}" does not match pattern`);
      }
    }
  }
  if (item.review_state !== "PROPOSED_NOT_REVIEWED") {
    err(`${filename}@review_state: must be exactly "PROPOSED_NOT_REVIEWED" (got "${item.review_state}")`);
  }
  if (typeof item.consumes_recommendation_id === "string") {
    if (!RECOMMENDATION_ID_PATTERN.test(item.consumes_recommendation_id)) {
      err(`${filename}@consumes_recommendation_id: "${item.consumes_recommendation_id}" does not match pattern`);
    }
    if (D3_RECOMMENDATION_IDS.size > 0 && !D3_RECOMMENDATION_IDS.has(item.consumes_recommendation_id)) {
      err(`${filename}@consumes_recommendation_id: "${item.consumes_recommendation_id}" not found in docs/dandelion-recommendation/* — cross-reference failed`);
    }
  }
  if (Array.isArray(item.region_reviews)) {
    if (item.region_reviews.length < 1) {
      err(`${filename}@region_reviews: must have at least one region review`);
    }
    item.region_reviews.forEach((region, ix) => {
      if (Array.isArray(region.review_outcome_options)) {
        if (region.review_outcome_options.length < 1) {
          err(`${filename}@region_reviews.${ix}.review_outcome_options: must have at least one outcome`);
        }
        for (const outcome of region.review_outcome_options) {
          if (!ALLOWED_REVIEW_OUTCOMES.has(outcome)) {
            err(`${filename}@region_reviews.${ix}.review_outcome_options: "${outcome}" not in allowed enum`);
          }
        }
      }
    });
  }
  for (const minOneField of ["DMW_scope_implications", "governance_review_points", "audit_expectations", "approval_chain", "escalation_path"]) {
    if (Array.isArray(item[minOneField]) && item[minOneField].length < 1) {
      err(`${filename}@${minOneField}: must have at least one entry`);
    }
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
const schema = loadJson("governance-review.schema.json");
if (schema && !schema.title.includes("Governance Review Substrate")) {
  warn(`governance-review.schema.json: title may be off`);
}

// 3. Per-file validation
const seenIds = new Set();
const seenMapTypes = new Set();
for (const f of CATALOG_FILES) {
  if (!existsSync(join(DIR, f))) continue;
  const doc = loadJson(f);
  if (!doc) continue;
  for (const required of ["kind", "catalog_version", "envelope_defaults", "items"]) {
    if (doc[required] === undefined) {
      err(`${f}: missing required top-level field "${required}"`);
    }
  }
  if (!Array.isArray(doc.items)) continue;
  doc.items.forEach((item, ix) => {
    stats.items++;
    validateItem(f, item, ["items", String(ix)]);
    if (item.id) {
      if (seenIds.has(item.id)) {
        err(`${f}: duplicate id "${item.id}"`);
      }
      seenIds.add(item.id);
    }
    if (item.map_type) seenMapTypes.add(item.map_type);
  });
  walkAndScanForbidden(f, doc);
}

// 4. All 9 map types covered
for (const mt of REQUIRED_MAP_TYPES) {
  if (!seenMapTypes.has(mt)) err(`MISSING required map_type: ${mt}`);
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
console.log(`D4 Dandelion Governance Review Substrate Validator`);
console.log(`-------------------------------------------`);
console.log(`Files checked: ${stats.files}/${REQUIRED_FILES.length}`);
console.log(`Items checked: ${stats.items}`);
console.log(`Map types covered: ${seenMapTypes.size}/${REQUIRED_MAP_TYPES.length}`);
console.log(`D3 recommendation IDs cross-referenced: ${D3_RECOMMENDATION_IDS.size} known`);
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
