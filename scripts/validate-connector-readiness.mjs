#!/usr/bin/env node
// FILE: validate-connector-readiness.mjs
// PURPOSE: Connector Implementation-Readiness Catalog validator.
//          Pure Node ESM, no deps. Mirrors validate-entitlement-
//          catalog.mjs sentence-level negation + subtree skip.
//          Verifies wrapper + required fields + not_implemented_yet
//          + default_mode READ_FIRST + ADR-0084 source ref +
//          required connectors + matrix presence + forbidden-phrase
//          scan.
// CONNECTS TO: docs/connector-readiness/*.json + ADR-0084 + RULE 21.
// USAGE: node scripts/validate-connector-readiness.mjs

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIR = resolve(__dirname, "..", "docs", "connector-readiness");

const REQUIRED_FILES = [
  "README.md",
  "readiness.schema.json",
  "slack.json",
  "google-workspace.json",
  "jira-linear.json",
  "microsoft-365.json",
  "github.json",
  "connector-readiness-matrix.json",
  "connector-readiness-matrix.md",
];

const CATALOG_FILES = [
  "slack.json",
  "google-workspace.json",
  "jira-linear.json",
  "microsoft-365.json",
  "github.json",
  "connector-readiness-matrix.json",
];

const UNIVERSAL_REQUIRED_FIELDS = [
  "id",
  "version",
  "status",
  "object_type",
  "connector_name",
  "connector_family",
  "source_adr_refs",
  "official_docs_refs",
  "MCP_posture",
  "OAuth_model",
  "app_installation_model",
  "admin_consent_model",
  "read_capabilities",
  "default_mode",
  "required_approval_gates",
  "DMW_scope_implications",
  "billing_pack_mapping",
  "Dandelion_map_dependencies",
  "audit_expectations",
  "secret_handling_requirements",
  "no_leak_rules",
  "tenant_isolation_requirements",
  "not_implemented_yet",
];

const REQUIRED_CONNECTOR_IDS = [
  "readiness.slack.v1",
  "readiness.google-workspace.v1",
  "readiness.jira-cloud.v1",
  "readiness.linear.v1",
  "readiness.microsoft-365.v1",
  "readiness.github.v1",
  "matrix.connector-readiness.v1",
];

const FORBIDDEN_PHRASES = [
  "connector activated",
  "permission granted",
  "unrestricted write access",
  "auto-approved",
  "guaranteed compliant",
  "regulator approved",
  "no fine risk",
  "employee score",
  "manager surveillance",
  "psychological profile",
];

const FORBIDDEN_SCAN_SKIP_KEYS = new Set([
  "forbidden_consumers",
  "forbidden_defaults",
  "must_not",
  "no_leak_rules",
  "audit_expectations",
  "governance_notes",
  "risky_write_actions",
  "implementation_risks",
  "required_approval_gates",
  "dual_control_recommendations",
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
  "disabled by default",
  "deferred",
  "remains founder-gated",
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
    if (!item.source_adr_refs.includes("ADR-0084")) {
      err(`${filename}@source_adr_refs: must include "ADR-0084"`);
    }
    for (const ref of item.source_adr_refs) {
      if (!ADR_REF_PATTERN.test(ref)) {
        err(`${filename}@source_adr_refs: ref "${ref}" does not match pattern`);
      }
    }
  }
  if (item.not_implemented_yet !== true) {
    err(`${filename}@not_implemented_yet: must be exactly true (got ${JSON.stringify(item.not_implemented_yet)})`);
  }
  if (item.default_mode !== "READ_FIRST") {
    err(`${filename}@default_mode: must be exactly "READ_FIRST" (got "${item.default_mode}")`);
  }
  for (const minOneField of ["DMW_scope_implications", "no_leak_rules", "audit_expectations", "Dandelion_map_dependencies", "official_docs_refs", "read_capabilities", "required_approval_gates", "secret_handling_requirements", "tenant_isolation_requirements"]) {
    if (Array.isArray(item[minOneField]) && item[minOneField].length < 1) {
      err(`${filename}@${minOneField}: must have at least one entry`);
    }
  }
  if (typeof item.billing_pack_mapping !== "string" || item.billing_pack_mapping.length < 1) {
    err(`${filename}@billing_pack_mapping: must be a non-empty string`);
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
const schema = loadJson("readiness.schema.json");
if (schema && !schema.title.includes("Connector Implementation-Readiness")) {
  warn(`readiness.schema.json: title may be off`);
}

// 3. Per-file validation
const seenIds = new Set();
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
  });
  walkAndScanForbidden(f, doc);
}

// 4. Required connectors present
for (const id of REQUIRED_CONNECTOR_IDS) {
  if (!seenIds.has(id)) err(`MISSING required connector id: ${id}`);
}

// 5. Matrix rankings present
const matrixDoc = loadJson("connector-readiness-matrix.json");
if (matrixDoc && Array.isArray(matrixDoc.items) && matrixDoc.items.length > 0) {
  const matrix = matrixDoc.items[0];
  if (!Array.isArray(matrix.matrix_rankings) || matrix.matrix_rankings.length < 6) {
    err(`connector-readiness-matrix.json: matrix_rankings must include all 6 connector rankings`);
  }
  if (typeof matrix.composite_formula !== "string" || !matrix.composite_formula.includes("first_week_aha_value")) {
    err(`connector-readiness-matrix.json: composite_formula missing or malformed`);
  }
  if (typeof matrix.suggest_only_disclaimer !== "string" || !matrix.suggest_only_disclaimer.toLowerCase().includes("suggest-only")) {
    err(`connector-readiness-matrix.json: suggest_only_disclaimer missing`);
  }
}

// 6. Output
console.log(`Connector Implementation-Readiness Validator`);
console.log(`-------------------------------------------`);
console.log(`Files checked: ${stats.files}/${REQUIRED_FILES.length}`);
console.log(`Items checked: ${stats.items}`);
console.log(`Required connector IDs present: ${REQUIRED_CONNECTOR_IDS.filter((id) => seenIds.has(id)).length}/${REQUIRED_CONNECTOR_IDS.length}`);
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
