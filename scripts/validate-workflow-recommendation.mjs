#!/usr/bin/env node
// FILE: validate-workflow-recommendation.mjs
// PURPOSE: W3 Workflow Recommendation Substrate validator. Pure
//          Node ESM, no deps. Mirrors validate-dandelion-starter-
//          envelope.mjs sentence-level negation + subtree skip.
//          Verifies wrapper shape + required fields + workflow_state
//          + adr_0081_stage ∈ {1,2} + consumes_workflow_template_id
//          cross-reference into docs/ootb-catalog/workflows.json + 4
//          plan archetypes covered + forbidden-phrase scan + canonical
//          phrase in README.
// CONNECTS TO: docs/workflow-recommendation/*.json,
//              docs/ootb-catalog/workflows.json (cross-ref), ADR-0081.
// USAGE: node scripts/validate-workflow-recommendation.mjs

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIR = resolve(__dirname, "..", "docs", "workflow-recommendation");
const OOTB_DIR = resolve(__dirname, "..", "docs", "ootb-catalog");

const REQUIRED_FILES = [
  "README.md",
  "recommendation.schema.json",
  "starter-pilot-workflows.json",
  "team-workflows.json",
  "business-workflows.json",
  "enterprise-workflows.json",
];

const CATALOG_FILES = REQUIRED_FILES.filter(
  (f) => f.endsWith(".json") && f !== "recommendation.schema.json",
);

const REQUIRED_PLAN_ARCHETYPES = new Set([
  "starter-pilot",
  "team",
  "business",
  "enterprise",
]);

const UNIVERSAL_REQUIRED_FIELDS = [
  "id",
  "version",
  "status",
  "object_type",
  "name",
  "human_readable_summary",
  "model_usage_notes",
  "source_adr_refs",
  "consumes_workflow_template_id",
  "adr_0081_stage",
  "recommendation_purpose",
  "role_audience",
  "tool_dependencies",
  "safe_fallback",
  "dual_control_required_at_stage_3",
  "DMW_scope_implications",
  "governance_review_points",
  "audit_expectations",
  "safe_defaults",
  "forbidden_defaults",
  "allowed_consumers",
  "forbidden_consumers",
  "workflow_state",
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
  "A workflow in Otzar is a governed, role-aware process that turns context into coordinated action through people, Digital Twins, tools, approvals, audit, and memory — without bypassing human authority.";

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
];

const ID_PATTERN = /^[a-z][a-zA-Z0-9_-]*(\.[a-zA-Z0-9][a-zA-Z0-9_-]*)+\.v[0-9]+$/;
const ADR_REF_PATTERN = /^(ADR-[0-9]{4}|RULE [0-9]+|US [0-9,]+)$/;
const WORKFLOW_TEMPLATE_ID_PATTERN = /^workflow\.[a-z][a-zA-Z0-9_-]*(\.[a-zA-Z0-9][a-zA-Z0-9_-]*)*\.v[0-9]+$/;

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

// Collect OOTB workflow IDs for cross-reference check
const OOTB_WORKFLOW_IDS = new Set();
const workflowsDoc = loadJson("workflows.json", OOTB_DIR);
if (workflowsDoc && Array.isArray(workflowsDoc.items)) {
  for (const item of workflowsDoc.items) {
    if (typeof item.id === "string") OOTB_WORKFLOW_IDS.add(item.id);
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
    if (!item.source_adr_refs.includes("ADR-0081")) {
      err(`${filename}@source_adr_refs: must include "ADR-0081"`);
    }
    for (const ref of item.source_adr_refs) {
      if (!ADR_REF_PATTERN.test(ref)) {
        err(`${filename}@source_adr_refs: ref "${ref}" does not match pattern`);
      }
    }
  }
  if (item.workflow_state !== "RECOMMENDATION_ONLY") {
    err(`${filename}@workflow_state: must equal "RECOMMENDATION_ONLY" (got "${item.workflow_state}")`);
  }
  if (item.adr_0081_stage !== 1 && item.adr_0081_stage !== 2) {
    err(`${filename}@adr_0081_stage: must be 1 or 2 (got ${item.adr_0081_stage})`);
  }
  if (typeof item.consumes_workflow_template_id === "string") {
    if (!WORKFLOW_TEMPLATE_ID_PATTERN.test(item.consumes_workflow_template_id)) {
      err(`${filename}@consumes_workflow_template_id: "${item.consumes_workflow_template_id}" does not match pattern`);
    }
    if (
      OOTB_WORKFLOW_IDS.size > 0 &&
      !OOTB_WORKFLOW_IDS.has(item.consumes_workflow_template_id)
    ) {
      err(`${filename}@consumes_workflow_template_id: "${item.consumes_workflow_template_id}" not found in docs/ootb-catalog/workflows.json — cross-reference failed`);
    }
  }
  for (const minOneField of ["role_audience", "DMW_scope_implications", "governance_review_points", "audit_expectations"]) {
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
if (schema && !schema.title.includes("Workflow Recommendation")) {
  warn(`recommendation.schema.json: title may be off`);
}

// 3. Per-file validation
const seenIds = new Set();
const seenArchetypes = new Set();
for (const f of CATALOG_FILES) {
  if (!existsSync(join(DIR, f))) continue;
  const doc = loadJson(f);
  if (!doc) continue;
  for (const required of ["kind", "catalog_version", "envelope_defaults", "plan_archetype_id", "items"]) {
    if (doc[required] === undefined) {
      err(`${f}: missing required top-level field "${required}"`);
    }
  }
  if (doc.plan_archetype_id) {
    if (seenArchetypes.has(doc.plan_archetype_id)) {
      err(`${f}: duplicate plan_archetype_id "${doc.plan_archetype_id}"`);
    }
    seenArchetypes.add(doc.plan_archetype_id);
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

// 4. All 4 plan archetypes covered
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
console.log(`W3 Workflow Recommendation Substrate Validator`);
console.log(`-------------------------------------------`);
console.log(`Files checked: ${stats.files}/${REQUIRED_FILES.length}`);
console.log(`Items checked: ${stats.items}`);
console.log(`Plan archetypes covered: ${seenArchetypes.size}/${REQUIRED_PLAN_ARCHETYPES.size}`);
console.log(`OOTB workflow template IDs cross-referenced: ${OOTB_WORKFLOW_IDS.size} known`);
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
