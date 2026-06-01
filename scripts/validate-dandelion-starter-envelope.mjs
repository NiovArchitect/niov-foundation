#!/usr/bin/env node
// FILE: validate-dandelion-starter-envelope.mjs
// PURPOSE: D5 Dandelion Starter Envelope Assembly Substrate validator.
//          Pure Node ESM, no deps. Mirrors validate-dandelion-
//          governance-review.mjs sentence-level negation + subtree
//          skip. Verifies wrapper shape + required fields +
//          envelope_state + consumes_governance_review_ids cross-
//          reference into docs/dandelion-governance-review/ + 4 plan
//          archetypes covered + forbidden-phrase scan + canonical
//          phrase in README.
// CONNECTS TO: docs/dandelion-starter-envelope/*.json,
//              docs/dandelion-governance-review/*.json (cross-ref),
//              ADR-0082 + ADR-0080 Amendment 1 + ADR-0083.
// USAGE: node scripts/validate-dandelion-starter-envelope.mjs

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIR = resolve(__dirname, "..", "docs", "dandelion-starter-envelope");
const GOVERNANCE_REVIEW_DIR = resolve(
  __dirname,
  "..",
  "docs",
  "dandelion-governance-review",
);

const REQUIRED_FILES = [
  "README.md",
  "starter-envelope.schema.json",
  "starter-pilot-envelope.json",
  "team-envelope.json",
  "business-envelope.json",
  "enterprise-envelope.json",
];

const ENVELOPE_FILES = REQUIRED_FILES.filter(
  (f) => f.endsWith(".json") && f !== "starter-envelope.schema.json",
);

const REQUIRED_MAP_TYPES = new Set([
  "CompanyMap",
  "OrgRelationshipMap",
  "RoleMap",
  "ToolMap",
  "WorkflowMap",
  "AuthorityMap",
  "MemoryDmwMap",
  "RiskMap",
  "AhaMomentMap",
]);

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
  "plan_archetype_id",
  "name",
  "description",
  "human_readable_summary",
  "model_usage_notes",
  "source_adr_refs",
  "consumes_governance_review_ids",
  "scope_summary_by_map_type",
  "approved_regions_bundle",
  "permission_defaults",
  "scope_defaults",
  "cross_map_dependency_resolution",
  "DMW_scope_ceiling",
  "audit_expectations",
  "governance_review_points",
  "safe_defaults",
  "forbidden_defaults",
  "allowed_consumers",
  "forbidden_consumers",
  "envelope_state",
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
  "approved_regions_bundle",
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
  "deferred",
];

const ID_PATTERN = /^[a-z][a-zA-Z0-9_-]*(\.[a-zA-Z0-9][a-zA-Z0-9_-]*)+\.v[0-9]+$/;
const ADR_REF_PATTERN = /^(ADR-[0-9]{4}|RULE [0-9]+|US [0-9,]+)$/;
const REVIEW_ID_PATTERN = /^review\.[a-z][a-zA-Z0-9_-]*(\.[a-zA-Z0-9][a-zA-Z0-9_-]*)*\.v[0-9]+$/;

let errors = [];
let warnings = [];
let stats = { files: 0, envelopes: 0 };
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

// Collect D4 review IDs for cross-reference check
const D4_REVIEW_IDS = new Set();
if (existsSync(GOVERNANCE_REVIEW_DIR)) {
  for (const f of readdirSync(GOVERNANCE_REVIEW_DIR)) {
    if (!f.endsWith(".json") || f === "governance-review.schema.json") continue;
    const doc = loadJson(f, GOVERNANCE_REVIEW_DIR);
    if (doc && Array.isArray(doc.items)) {
      for (const item of doc.items) {
        if (typeof item.id === "string") D4_REVIEW_IDS.add(item.id);
      }
    }
  }
}

function validateEnvelope(filename, env, path = []) {
  for (const field of UNIVERSAL_REQUIRED_FIELDS) {
    if (env[field] === undefined || env[field] === null) {
      err(`${filename}@${path.concat(field).join(".")}: missing required field "${field}"`);
    }
  }
  if (env.id && !ID_PATTERN.test(env.id)) {
    err(`${filename}: id "${env.id}" does not match pattern`);
  }
  if (Array.isArray(env.source_adr_refs)) {
    if (!env.source_adr_refs.includes("ADR-0082")) {
      err(`${filename}@source_adr_refs: must include "ADR-0082"`);
    }
    if (!env.source_adr_refs.includes("ADR-0083")) {
      err(`${filename}@source_adr_refs: must include "ADR-0083"`);
    }
    for (const ref of env.source_adr_refs) {
      if (!ADR_REF_PATTERN.test(ref)) {
        err(`${filename}@source_adr_refs: ref "${ref}" does not match pattern`);
      }
    }
  }
  if (env.envelope_state !== "DRAFT_NOT_ACTIVATED") {
    err(`${filename}@envelope_state: must be exactly "DRAFT_NOT_ACTIVATED" (got "${env.envelope_state}")`);
  }
  if (Array.isArray(env.consumes_governance_review_ids)) {
    if (env.consumes_governance_review_ids.length !== 9) {
      err(`${filename}@consumes_governance_review_ids: must have exactly 9 entries (one per Map type); got ${env.consumes_governance_review_ids.length}`);
    }
    for (const reviewId of env.consumes_governance_review_ids) {
      if (!REVIEW_ID_PATTERN.test(reviewId)) {
        err(`${filename}@consumes_governance_review_ids: "${reviewId}" does not match pattern`);
      }
      if (D4_REVIEW_IDS.size > 0 && !D4_REVIEW_IDS.has(reviewId)) {
        err(`${filename}@consumes_governance_review_ids: "${reviewId}" not found in docs/dandelion-governance-review/* — cross-reference failed`);
      }
    }
  }
  if (typeof env.scope_summary_by_map_type === "object" && env.scope_summary_by_map_type !== null) {
    for (const mt of REQUIRED_MAP_TYPES) {
      if (!(mt in env.scope_summary_by_map_type)) {
        err(`${filename}@scope_summary_by_map_type: missing required map type "${mt}"`);
      }
    }
  }
  if (typeof env.DMW_scope_ceiling === "object" && env.DMW_scope_ceiling !== null) {
    if (
      !Array.isArray(env.DMW_scope_ceiling.baseline_categories) ||
      env.DMW_scope_ceiling.baseline_categories.length < 1
    ) {
      err(`${filename}@DMW_scope_ceiling.baseline_categories: must have at least one entry`);
    }
    if (
      !Array.isArray(env.DMW_scope_ceiling.forbidden_categories) ||
      env.DMW_scope_ceiling.forbidden_categories.length < 1
    ) {
      err(`${filename}@DMW_scope_ceiling.forbidden_categories: must have at least one entry`);
    }
    if (typeof env.DMW_scope_ceiling.derivation_note !== "string" || env.DMW_scope_ceiling.derivation_note.length < 1) {
      err(`${filename}@DMW_scope_ceiling.derivation_note: must be a non-empty string`);
    }
  }
  if (Array.isArray(env.approved_regions_bundle)) {
    if (env.approved_regions_bundle.length < 1) {
      err(`${filename}@approved_regions_bundle: must have at least one approved region`);
    }
  }
  for (const minOneField of ["audit_expectations", "governance_review_points", "permission_defaults", "scope_defaults", "cross_map_dependency_resolution"]) {
    if (Array.isArray(env[minOneField]) && env[minOneField].length < 1) {
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
const schema = loadJson("starter-envelope.schema.json");
if (schema && !schema.title.includes("Starter Envelope")) {
  warn(`starter-envelope.schema.json: title may be off`);
}

// 3. Per-file validation
const seenIds = new Set();
const seenArchetypes = new Set();
for (const f of ENVELOPE_FILES) {
  if (!existsSync(join(DIR, f))) continue;
  const doc = loadJson(f);
  if (!doc) continue;
  for (const required of ["kind", "catalog_version", "envelope_defaults", "starter_envelope"]) {
    if (doc[required] === undefined) {
      err(`${f}: missing required top-level field "${required}"`);
    }
  }
  if (doc.starter_envelope) {
    stats.envelopes++;
    validateEnvelope(f, doc.starter_envelope, ["starter_envelope"]);
    if (doc.starter_envelope.id) {
      if (seenIds.has(doc.starter_envelope.id)) {
        err(`${f}: duplicate id "${doc.starter_envelope.id}"`);
      }
      seenIds.add(doc.starter_envelope.id);
    }
    if (doc.starter_envelope.plan_archetype_id) {
      seenArchetypes.add(doc.starter_envelope.plan_archetype_id);
    }
  }
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
console.log(`D5 Dandelion Starter Envelope Assembly Substrate Validator`);
console.log(`-------------------------------------------`);
console.log(`Files checked: ${stats.files}/${REQUIRED_FILES.length}`);
console.log(`Envelopes checked: ${stats.envelopes}`);
console.log(`Plan archetypes covered: ${seenArchetypes.size}/${REQUIRED_PLAN_ARCHETYPES.size}`);
console.log(`D4 review IDs cross-referenced: ${D4_REVIEW_IDS.size} known`);
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
