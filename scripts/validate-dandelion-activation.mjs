#!/usr/bin/env node
// FILE: validate-dandelion-activation.mjs
// PURPOSE: D6 Dandelion Activation Substrate validator. Pure Node
//          ESM, no deps. Mirrors validate-dandelion-starter-envelope
//          sentence-level negation + subtree skip. Verifies wrapper
//          shape + required fields + activation_state +
//          consumes_starter_envelope_id cross-reference into
//          docs/dandelion-starter-envelope/ + 4 plan archetypes
//          covered + activation step ordering integrity + last step
//          STARTER_ENVELOPE_ACTIVATED + forbidden-phrase scan +
//          canonical phrase in README.
// CONNECTS TO: docs/dandelion-activation/*.json,
//              docs/dandelion-starter-envelope/*.json (cross-ref),
//              ADR-0082 + ADR-0080 Amendment 1 + ADR-0083.
// USAGE: node scripts/validate-dandelion-activation.mjs

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIR = resolve(__dirname, "..", "docs", "dandelion-activation");
const STARTER_ENVELOPE_DIR = resolve(
  __dirname,
  "..",
  "docs",
  "dandelion-starter-envelope",
);

const REQUIRED_FILES = [
  "README.md",
  "activation.schema.json",
  "starter-pilot-activation.json",
  "team-activation.json",
  "business-activation.json",
  "enterprise-activation.json",
];

const PLAN_FILES = REQUIRED_FILES.filter(
  (f) => f.endsWith(".json") && f !== "activation.schema.json",
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
  "plan_archetype_id",
  "name",
  "description",
  "human_readable_summary",
  "model_usage_notes",
  "source_adr_refs",
  "consumes_starter_envelope_id",
  "activation_steps",
  "audit_expectations",
  "rollback_strategy",
  "human_authorization_points",
  "safe_defaults",
  "forbidden_defaults",
  "allowed_consumers",
  "forbidden_consumers",
  "activation_state",
];

const STEP_REQUIRED_FIELDS = [
  "step_order",
  "step_id",
  "step_name",
  "step_purpose",
  "consumes_map_type",
  "produces_runtime_object",
  "human_authorization_required",
  "audit_literal",
  "preconditions",
  "postconditions",
  "failure_mode",
  "rollback_path",
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
  "autonomous execution enabled",
];

const CANONICAL_PHRASE =
  "Dandelion maps the territory. Admins approve the map. Foundation governs what can happen inside the map. DMWs scope what can be remembered. Stage F Activation walks an approved envelope into the live operating state — every step is human-authorized, audit-emitted, and reversible by construction.";

const FORBIDDEN_SCAN_SKIP_KEYS = new Set([
  "forbidden_defaults",
  "forbidden_consumers",
  "must_not",
  "no_leak_rules",
  "governance_notes",
  "audit_expectations",
  "rollback_strategy",
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
const ENVELOPE_ID_PATTERN = /^envelope\.[a-z][a-zA-Z0-9_-]*\.v[0-9]+$/;
const FINAL_STEP_AUDIT_LITERAL = "ADMIN_ACTION:STARTER_ENVELOPE_ACTIVATED";

let errors = [];
let warnings = [];
let stats = { files: 0, plans: 0, steps: 0 };
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

// Collect D5 starter envelope IDs for cross-reference check
const STARTER_ENVELOPE_IDS = new Set();
if (existsSync(STARTER_ENVELOPE_DIR)) {
  const files = readdirSync(STARTER_ENVELOPE_DIR).filter(
    (f) => f.endsWith(".json") && f !== "starter-envelope.schema.json",
  );
  for (const f of files) {
    const doc = loadJson(f, STARTER_ENVELOPE_DIR);
    if (doc && doc.starter_envelope && typeof doc.starter_envelope.id === "string") {
      STARTER_ENVELOPE_IDS.add(doc.starter_envelope.id);
    }
  }
}

function validateStep(filename, step, ix) {
  for (const field of STEP_REQUIRED_FIELDS) {
    if (step[field] === undefined || step[field] === null) {
      err(`${filename}@activation_steps[${ix}]: missing required field "${field}"`);
    }
  }
  if (typeof step.audit_literal === "string" && !step.audit_literal.startsWith("ADMIN_ACTION:")) {
    err(`${filename}@activation_steps[${ix}].audit_literal: must start with "ADMIN_ACTION:" (got "${step.audit_literal}")`);
  }
  for (const minOneField of ["preconditions", "postconditions"]) {
    if (Array.isArray(step[minOneField]) && step[minOneField].length < 1) {
      err(`${filename}@activation_steps[${ix}].${minOneField}: must have at least one entry`);
    }
  }
}

function validatePlan(filename, plan) {
  for (const field of UNIVERSAL_REQUIRED_FIELDS) {
    if (plan[field] === undefined || plan[field] === null) {
      err(`${filename}@activation_plan.${field}: missing required field`);
    }
  }
  if (plan.id && !ID_PATTERN.test(plan.id)) {
    err(`${filename}: id "${plan.id}" does not match pattern`);
  }
  if (Array.isArray(plan.source_adr_refs)) {
    for (const ref of ["ADR-0082", "ADR-0080"]) {
      if (!plan.source_adr_refs.includes(ref)) {
        err(`${filename}@source_adr_refs: must include "${ref}"`);
      }
    }
    for (const ref of plan.source_adr_refs) {
      if (!ADR_REF_PATTERN.test(ref)) {
        err(`${filename}@source_adr_refs: ref "${ref}" does not match pattern`);
      }
    }
  }
  if (plan.activation_state !== "DESIGN_NOT_EXECUTED") {
    err(`${filename}@activation_state: must equal "DESIGN_NOT_EXECUTED" (got "${plan.activation_state}")`);
  }
  if (typeof plan.consumes_starter_envelope_id === "string") {
    if (!ENVELOPE_ID_PATTERN.test(plan.consumes_starter_envelope_id)) {
      err(`${filename}@consumes_starter_envelope_id: "${plan.consumes_starter_envelope_id}" does not match pattern`);
    }
    if (STARTER_ENVELOPE_IDS.size > 0 && !STARTER_ENVELOPE_IDS.has(plan.consumes_starter_envelope_id)) {
      err(`${filename}@consumes_starter_envelope_id: "${plan.consumes_starter_envelope_id}" not found in docs/dandelion-starter-envelope/ — cross-reference failed`);
    }
  }
  if (Array.isArray(plan.activation_steps)) {
    plan.activation_steps.forEach((step, ix) => {
      stats.steps++;
      validateStep(filename, step, ix);
    });
    // Step ordering: monotonic from 1
    const orders = plan.activation_steps
      .map((s) => s.step_order)
      .filter((o) => typeof o === "number");
    for (let i = 0; i < orders.length; i++) {
      if (orders[i] !== i + 1) {
        err(`${filename}@activation_steps[${i}].step_order: must be ${i + 1} (got ${orders[i]})`);
        break;
      }
    }
    // Last step must mark envelope as ACTIVATED
    const lastStep = plan.activation_steps[plan.activation_steps.length - 1];
    if (lastStep && lastStep.audit_literal !== FINAL_STEP_AUDIT_LITERAL) {
      err(`${filename}: last activation step audit_literal must be "${FINAL_STEP_AUDIT_LITERAL}" (got "${lastStep.audit_literal}")`);
    }
  }
  if (
    plan.rollback_strategy &&
    plan.rollback_strategy.soft_delete_only !== true
  ) {
    err(`${filename}@rollback_strategy.soft_delete_only: must be true (RULE 10)`);
  }
  for (const minOneField of ["audit_expectations", "human_authorization_points", "allowed_consumers", "forbidden_consumers"]) {
    if (Array.isArray(plan[minOneField]) && plan[minOneField].length < 1) {
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
const schema = loadJson("activation.schema.json");
if (schema && !schema.title.includes("Activation")) {
  warn(`activation.schema.json: title may be off`);
}

// 3. Per-file validation
const seenIds = new Set();
const seenArchetypes = new Set();
for (const f of PLAN_FILES) {
  if (!existsSync(join(DIR, f))) continue;
  const doc = loadJson(f);
  if (!doc) continue;
  for (const required of ["kind", "catalog_version", "activation_defaults", "activation_plan"]) {
    if (doc[required] === undefined) {
      err(`${f}: missing required top-level field "${required}"`);
    }
  }
  if (doc.kind !== "ActivationPlan") {
    err(`${f}: kind must be "ActivationPlan" (got "${doc.kind}")`);
  }
  const plan = doc.activation_plan;
  if (!plan) continue;
  if (plan.plan_archetype_id) {
    if (seenArchetypes.has(plan.plan_archetype_id)) {
      err(`${f}: duplicate plan_archetype_id "${plan.plan_archetype_id}"`);
    }
    seenArchetypes.add(plan.plan_archetype_id);
  }
  stats.plans++;
  validatePlan(f, plan);
  if (plan.id) {
    if (seenIds.has(plan.id)) {
      err(`${f}: duplicate id "${plan.id}"`);
    }
    seenIds.add(plan.id);
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
console.log(`D6 Dandelion Activation Substrate Validator`);
console.log(`-------------------------------------------`);
console.log(`Files checked: ${stats.files}/${REQUIRED_FILES.length}`);
console.log(`Activation plans checked: ${stats.plans}`);
console.log(`Activation steps checked: ${stats.steps}`);
console.log(`Plan archetypes covered: ${seenArchetypes.size}/${REQUIRED_PLAN_ARCHETYPES.size}`);
console.log(`D5 envelope IDs cross-referenced: ${STARTER_ENVELOPE_IDS.size} known`);
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
