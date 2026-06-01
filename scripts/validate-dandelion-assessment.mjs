#!/usr/bin/env node
// FILE: validate-dandelion-assessment.mjs
// PURPOSE: D2 Dandelion Assessment Substrate validator. Pure Node
//          ESM, no deps. Mirrors validate-entitlement-catalog.mjs
//          pattern with sentence-level negation + negation-item
//          subtree skip. Verifies wrapper shape + required fields
//          + activation_state=NOT_ACTIVATED + ADR-0082 source ref +
//          9 map types covered + forbidden-phrase scan + canonical
//          phrase in README.
// CONNECTS TO: docs/dandelion-assessment/*.json + ADR-0082 +
//              Amendment 1.
// USAGE: node scripts/validate-dandelion-assessment.mjs

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIR = resolve(__dirname, "..", "docs", "dandelion-assessment");

const REQUIRED_FILES = [
  "README.md",
  "assessment.schema.json",
  "company-map-assessment.json",
  "org-relationship-map-assessment.json",
  "role-map-assessment.json",
  "tool-map-assessment.json",
  "workflow-map-assessment.json",
  "authority-map-assessment.json",
  "memory-dmw-map-assessment.json",
  "risk-map-assessment.json",
  "aha-moment-map-assessment.json",
];

const CATALOG_FILES = REQUIRED_FILES.filter(
  (f) => f !== "README.md" && f !== "assessment.schema.json",
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
  "required_questions",
  "optional_questions",
  "admin_questions",
  "user_questions",
  "evidence_sources",
  "confidence_labels",
  "output_candidates",
  "governance_review_points",
  "safe_defaults",
  "forbidden_defaults",
  "allowed_consumers",
  "forbidden_consumers",
  "DMW_scope_implications",
  "audit_expectations",
  "activation_state",
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
  "rule-0",
  "rule-20",
  "by construction",
];

const ID_PATTERN = /^[a-z][a-zA-Z0-9_-]*(\.[a-zA-Z0-9][a-zA-Z0-9_-]*)+\.v[0-9]+$/;
const ADR_REF_PATTERN = /^(ADR-[0-9]{4}|RULE [0-9]+|US [0-9,]+)$/;

let errors = [];
let warnings = [];
let stats = { files: 0, items: 0 };
function err(msg) { errors.push(msg); }
function warn(msg) { warnings.push(msg); }

function loadJson(filename) {
  const path = join(DIR, filename);
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

function isNegationItem(node) {
  // Assessment items themselves canonically enumerate prohibitions
  // via forbidden_defaults; the subtree skip handles those, but if
  // future items have negation-discipline ids, they'd be filtered
  // here. For D2 we keep the function but no items currently match.
  return false;
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
    if (isNegationItem(node)) return;
    for (const [key, value] of Object.entries(node)) {
      if (FORBIDDEN_SCAN_SKIP_KEYS.has(key)) continue;
      walkAndScanForbidden(filename, value, [...path, key]);
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
    err(`${filename}@${path.join(".") || "item"}: id "${item.id}" does not match pattern`);
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
  if (item.activation_state !== "NOT_ACTIVATED") {
    err(`${filename}@activation_state: must be exactly "NOT_ACTIVATED" (got "${item.activation_state}")`);
  }
  if (Array.isArray(item.confidence_labels)) {
    if (item.confidence_labels.length < 1) {
      err(`${filename}@confidence_labels: must have at least one label`);
    }
    for (const label of item.confidence_labels) {
      if (!ALLOWED_CONFIDENCE_LABELS.has(label)) {
        err(`${filename}@confidence_labels: "${label}" is not allowed`);
      }
    }
  }
  if (Array.isArray(item.DMW_scope_implications) && item.DMW_scope_implications.length < 1) {
    err(`${filename}@DMW_scope_implications: must have at least one entry`);
  }
  if (Array.isArray(item.governance_review_points) && item.governance_review_points.length < 1) {
    err(`${filename}@governance_review_points: must have at least one entry`);
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
const schema = loadJson("assessment.schema.json");
if (schema && schema.title !== "NIOV Foundation Dandelion Stage B Assessment Substrate Schema") {
  warn(`assessment.schema.json: title may be off — got "${schema.title}"`);
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

// 5. Canonical phrase in README (whitespace-normalized — Markdown
// auto-wraps the phrase across lines).
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
console.log(`D2 Dandelion Assessment Substrate Validator`);
console.log(`-------------------------------------------`);
console.log(`Files checked: ${stats.files}/${REQUIRED_FILES.length}`);
console.log(`Items checked: ${stats.items}`);
console.log(`Map types covered: ${seenMapTypes.size}/${REQUIRED_MAP_TYPES.length}`);
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
