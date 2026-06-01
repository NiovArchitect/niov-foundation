#!/usr/bin/env node
// FILE: validate-dandelion-recommendation.mjs
// PURPOSE: D3 Dandelion Recommendation Substrate validator. Pure
//          Node ESM, no deps. Mirrors validate-dandelion-assessment.mjs
//          pattern. Verifies wrapper shape + required fields +
//          recommendation_state=PROPOSED_NOT_APPROVED + ADR-0082
//          source ref + consumes_assessment_id cross-reference into
//          docs/dandelion-assessment/* + 9 map types covered +
//          forbidden-phrase scan + canonical phrase in README.
// CONNECTS TO: docs/dandelion-recommendation/*.json,
//              docs/dandelion-assessment/*.json (cross-ref check),
//              ADR-0082.
// USAGE: node scripts/validate-dandelion-recommendation.mjs

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIR = resolve(__dirname, "..", "docs", "dandelion-recommendation");
const ASSESSMENT_DIR = resolve(__dirname, "..", "docs", "dandelion-assessment");

const REQUIRED_FILES = [
  "README.md",
  "recommendation.schema.json",
  "company-map-recommendation.json",
  "org-relationship-map-recommendation.json",
  "role-map-recommendation.json",
  "tool-map-recommendation.json",
  "workflow-map-recommendation.json",
  "authority-map-recommendation.json",
  "memory-dmw-map-recommendation.json",
  "risk-map-recommendation.json",
  "aha-moment-map-recommendation.json",
];

const CATALOG_FILES = REQUIRED_FILES.filter(
  (f) => f !== "README.md" && f !== "recommendation.schema.json",
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
  "consumes_assessment_id",
  "ranked_regions",
  "rationale",
  "cross_map_dependencies",
  "approval_gate_required",
  "confidence_label",
  "DMW_scope_implications",
  "governance_review_points",
  "safe_defaults",
  "forbidden_defaults",
  "allowed_consumers",
  "forbidden_consumers",
  "audit_expectations",
  "recommendation_state",
];

const ALLOWED_CONFIDENCE_LABELS = new Set([
  "HIGH_CONFIDENCE",
  "MEDIUM_CONFIDENCE",
  "LOW_CONFIDENCE",
  "REQUIRES_ADMIN_REVIEW",
  "REQUIRES_USER_CONFIRMATION",
  "BLOCKED_BY_POLICY",
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
const ASSESSMENT_ID_PATTERN = /^assessment\.[a-z][a-zA-Z0-9_-]*(\.[a-zA-Z0-9][a-zA-Z0-9_-]*)*\.v[0-9]+$/;

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

// Collect D2 assessment IDs for cross-reference check
const D2_ASSESSMENT_IDS = new Set();
if (existsSync(ASSESSMENT_DIR)) {
  for (const f of readdirSync(ASSESSMENT_DIR)) {
    if (!f.endsWith(".json") || f === "assessment.schema.json") continue;
    const doc = loadJson(f, ASSESSMENT_DIR);
    if (doc && Array.isArray(doc.items)) {
      for (const item of doc.items) {
        if (typeof item.id === "string") D2_ASSESSMENT_IDS.add(item.id);
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
  if (item.recommendation_state !== "PROPOSED_NOT_APPROVED") {
    err(`${filename}@recommendation_state: must be exactly "PROPOSED_NOT_APPROVED" (got "${item.recommendation_state}")`);
  }
  if (typeof item.consumes_assessment_id === "string") {
    if (!ASSESSMENT_ID_PATTERN.test(item.consumes_assessment_id)) {
      err(`${filename}@consumes_assessment_id: "${item.consumes_assessment_id}" does not match assessment pattern`);
    }
    if (D2_ASSESSMENT_IDS.size > 0 && !D2_ASSESSMENT_IDS.has(item.consumes_assessment_id)) {
      err(`${filename}@consumes_assessment_id: "${item.consumes_assessment_id}" not found in docs/dandelion-assessment/* — cross-reference failed`);
    }
  }
  if (typeof item.confidence_label === "string" && !ALLOWED_CONFIDENCE_LABELS.has(item.confidence_label)) {
    err(`${filename}@confidence_label: "${item.confidence_label}" not in allowed enum`);
  }
  if (Array.isArray(item.ranked_regions)) {
    if (item.ranked_regions.length < 1) {
      err(`${filename}@ranked_regions: must have at least one region`);
    }
    item.ranked_regions.forEach((region, ix) => {
      if (region.confidence_label && !ALLOWED_CONFIDENCE_LABELS.has(region.confidence_label)) {
        err(`${filename}@ranked_regions.${ix}.confidence_label: "${region.confidence_label}" not in allowed enum`);
      }
    });
  }
  for (const minOneField of ["DMW_scope_implications", "governance_review_points", "audit_expectations"]) {
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
const schema = loadJson("recommendation.schema.json");
if (schema && !schema.title.includes("Recommendation Substrate")) {
  warn(`recommendation.schema.json: title may be off`);
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
console.log(`D3 Dandelion Recommendation Substrate Validator`);
console.log(`-------------------------------------------`);
console.log(`Files checked: ${stats.files}/${REQUIRED_FILES.length}`);
console.log(`Items checked: ${stats.items}`);
console.log(`Map types covered: ${seenMapTypes.size}/${REQUIRED_MAP_TYPES.length}`);
console.log(`D2 assessment IDs cross-referenced: ${D2_ASSESSMENT_IDS.size} known`);
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
