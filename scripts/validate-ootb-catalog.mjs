#!/usr/bin/env node
// FILE: validate-ootb-catalog.mjs
// PURPOSE: ADR-0080 Wave 2 — static catalog validator. Pure Node ESM (no deps).
//          Verifies parse + uniqueness + cross-references + ADR-0080 ref +
//          forbidden-phrase scan + EA Concur/travel-expense presence +
//          Dandelion flow presence. Not added to package.json scripts
//          (per Founder authorization on CI-churn risk).
// CONNECTS TO: docs/ootb-catalog/*.json + docs/architecture/decisions/0080-*.md
// USAGE: node scripts/validate-ootb-catalog.mjs

import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CATALOG_DIR = resolve(__dirname, "..", "docs", "ootb-catalog");

const REQUIRED_FILES = [
  "catalog.schema.json",
  "roles.json",
  "departments.json",
  "company-variants.json",
  "tools.json",
  "workflows.json",
  "connector-presets.json",
  "dandelion-flow-templates.json",
  "README.md",
];

const UNIVERSAL_REQUIRED_FIELDS = [
  "id",
  "version",
  "status",
  "name",
  "description",
  "governance_notes",
  "safe_defaults",
  "forbidden_defaults",
  "source_adr_refs",
];

// Per Founder addendum [FOUNDER-ADR-0080-WAVE-2-ADDENDUM-GOVERNED-CONTEXT-TRANSACTION-ENVELOPE]:
// envelope metadata is required at envelope_defaults (file level) OR per-item.
// File-level defaults satisfy the requirement per the addendum's "include these fields
// at the top-level object" allowance.
const ENVELOPE_FIELDS = [
  "object_type",
  "human_readable_summary",
  "model_usage_notes",
  "scope_defaults",
  "permission_defaults",
  "provenance",
  "audit_expectations",
  "policy_purpose",
  "allowed_consumers",
  "forbidden_consumers",
  "sensitivity_level",
  "adaptation_rules",
  "override_rules",
];

const FORBIDDEN_PHRASES = [
  "employee score",
  "manager surveillance",
  "psychological profile",
  "guaranteed compliant",
  "regulator approved",
  "no fine risk",
  "auto-approved",
  "full inbox access by default",
  "unrestricted write access",
];

// IDs are kebab-dotted-v<n>. First segment must start with a letter; subsequent
// segments may start with a digit (e.g., tool.1password.v1).
const ID_PATTERN = /^[a-z][a-zA-Z0-9_-]*(\.[a-zA-Z0-9][a-zA-Z0-9_-]*)+\.v[0-9]+$/;
const ADR_REF_PATTERN = /^(ADR-[0-9]{4}|RULE [0-9]+|US [0-9,]+)$/;

let errors = [];
let warnings = [];
let stats = { files: 0, items: 0 };

function err(msg) {
  errors.push(msg);
}
function warn(msg) {
  warnings.push(msg);
}

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

function validateEnvelope(filename, doc) {
  if (!doc || typeof doc !== "object") {
    err(`${filename}: top-level must be an object`);
    return false;
  }
  if (typeof doc.kind !== "string") {
    err(`${filename}: missing or invalid "kind"`);
    return false;
  }
  if (typeof doc.catalog_version !== "string" || !/^[0-9]+\.[0-9]+\.[0-9]+$/.test(doc.catalog_version)) {
    err(`${filename}: missing or invalid "catalog_version" (expected semver)`);
  }
  if (!Array.isArray(doc.items) || doc.items.length === 0) {
    err(`${filename}: "items" must be a non-empty array`);
    return false;
  }
  if (!doc.envelope_defaults || typeof doc.envelope_defaults !== "object") {
    err(`${filename}: missing required "envelope_defaults" block (Founder addendum: governed context envelope metadata)`);
  }
  return true;
}

function validateEnvelopeFields(filename, doc) {
  if (!doc || !doc.envelope_defaults) return; // already errored
  const ed = doc.envelope_defaults;
  for (const field of ENVELOPE_FIELDS) {
    if (!(field in ed) || ed[field] === null || ed[field] === undefined) {
      err(`${filename}: envelope_defaults missing required field "${field}"`);
      continue;
    }
    if (typeof ed[field] === "string" && ed[field].length === 0) {
      err(`${filename}: envelope_defaults."${field}" must be non-empty string`);
    }
    if (Array.isArray(ed[field]) && ed[field].length === 0) {
      err(`${filename}: envelope_defaults."${field}" must be non-empty array`);
    }
  }
}

function validateItem(filename, item, ix) {
  const label = `${filename}[items[${ix}] id=${item?.id ?? "?"}]`;
  for (const field of UNIVERSAL_REQUIRED_FIELDS) {
    if (!(field in item)) {
      err(`${label}: missing required field "${field}"`);
    }
  }
  if (typeof item.id !== "string" || !ID_PATTERN.test(item.id)) {
    err(`${label}: invalid id (expected kebab.dotted.v<n> form)`);
  }
  if (item.status && !["ACCEPTED", "PROPOSED", "DEPRECATED"].includes(item.status)) {
    err(`${label}: status must be ACCEPTED | PROPOSED | DEPRECATED`);
  }
  if (Array.isArray(item.source_adr_refs)) {
    if (item.source_adr_refs.length === 0) {
      err(`${label}: source_adr_refs must be non-empty`);
    }
    if (!item.source_adr_refs.includes("ADR-0080")) {
      err(`${label}: source_adr_refs must include ADR-0080`);
    }
    for (const ref of item.source_adr_refs) {
      if (typeof ref !== "string" || !ADR_REF_PATTERN.test(ref)) {
        err(`${label}: source_adr_refs entry "${ref}" must match ADR-NNNN / RULE N / US NNN,NNN`);
      }
    }
  } else {
    err(`${label}: source_adr_refs must be an array`);
  }
}

// Catalog entries legitimately name forbidden behaviors (forbidden_defaults,
// forbidden_inferences, no_leak_rules, etc.). Skip subtrees rooted at any of
// these guard fields; scan only strings that appear in outward-facing fields.
const GUARD_KEY_PATTERNS = [
  /^forbidden/i,
  /^no_leak/i,
  /^governance_notes$/i,
  /^model_usage_notes$/i,
  /^adaptation_rules?$/i,
  /^override_rules?$/i,
  /^audit_/i,
  /^common_risks$/i,
  /^common_confidential_relationships$/i,
  /^default_disabled/i,
  /^risky_/i,
  /^safe_defaults$/i,
  /^permission_defaults$/i,
  /^scope_defaults$/i,
  /^allowed_consumers$/i,
  /^forbidden_consumers$/i,
  /^emergency_override_/i,
  /^safe_fallback_logic$/i,
  /^connector_recommendation_logic$/i,
  /^governance_review_points$/i,
  /^fallback_prompts$/i,
  /^role_specific_usage_notes$/i,
  /^compliance_overrides$/i,
];

function pathHasGuard(path) {
  for (const segment of path) {
    if (typeof segment !== "string") continue;
    for (const re of GUARD_KEY_PATTERNS) {
      if (re.test(segment)) return true;
    }
  }
  return false;
}

function walkAndScanForbidden(filename, node, path = []) {
  if (node === null || node === undefined) return;
  if (typeof node === "string") {
    if (pathHasGuard(path)) return;
    const lower = node.toLowerCase();
    for (const phrase of FORBIDDEN_PHRASES) {
      if (lower.includes(phrase.toLowerCase())) {
        err(`${filename}@${path.join(".")}: contains forbidden phrase "${phrase}"`);
      }
    }
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((child, ix) => walkAndScanForbidden(filename, child, [...path, String(ix)]));
    return;
  }
  if (typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      walkAndScanForbidden(filename, value, [...path, key]);
    }
  }
}

function scanForbiddenPhrasesInDoc(filename, doc) {
  walkAndScanForbidden(filename, doc, []);
}

function scanForbiddenPhrasesInMarkdown(filename, text) {
  // README/Markdown: scan raw text but skip lines that are clearly listing
  // forbidden behaviors (catalogs of phrases inside quotes or backticks).
  const lines = text.split("\n");
  // Pattern matching ≥2 quoted phrases in the same line — clear enumeration.
  const QUOTED_LIST = /(["'`])[^"'`]{1,60}\1\s*(\/|,)\s*(["'`])[^"'`]{1,60}\3/;
  lines.forEach((line, ix) => {
    const lower = line.toLowerCase();
    // Skip lines that name forbidden things as catalog members.
    if (lower.includes("forbidden phrase") || lower.includes("forbidden_") || lower.includes("forbidden behaviors") || lower.includes("no manager surveillance") || lower.includes("no employee scoring") || lower.includes("no \"") || lower.includes("/ \"") || lower.includes("/ regulator")) return;
    if (QUOTED_LIST.test(line)) return;
    // Skip lines that are inside a code block delimiter context (heuristic: starts with "  " or backtick).
    if (line.trimStart().startsWith("`")) return;
    for (const phrase of FORBIDDEN_PHRASES) {
      if (lower.includes(phrase.toLowerCase())) {
        err(`${filename}:line ${ix + 1}: contains forbidden phrase "${phrase}"`);
      }
    }
  });
}

function main() {
  // 1) verify required files exist
  const present = new Set(readdirSync(CATALOG_DIR));
  for (const required of REQUIRED_FILES) {
    if (!present.has(required)) {
      err(`docs/ootb-catalog/${required}: MISSING`);
    }
  }
  if (errors.length > 0) {
    finish();
    return;
  }

  // 2) load all catalog files
  const docs = {};
  const idIndex = new Map();
  for (const file of REQUIRED_FILES) {
    if (file === "catalog.schema.json") continue;
    if (!file.endsWith(".json")) continue;
    const doc = loadJson(file);
    if (!doc) continue;
    docs[file] = doc;
    scanForbiddenPhrasesInDoc(`docs/ootb-catalog/${file}`, doc);
    if (!validateEnvelope(`docs/ootb-catalog/${file}`, doc)) continue;
    validateEnvelopeFields(`docs/ootb-catalog/${file}`, doc);
    stats.files++;
    for (let i = 0; i < doc.items.length; i++) {
      const item = doc.items[i];
      stats.items++;
      validateItem(`docs/ootb-catalog/${file}`, item, i);
      if (item && typeof item.id === "string") {
        if (idIndex.has(item.id)) {
          err(`docs/ootb-catalog/${file}: duplicate id "${item.id}" (also in ${idIndex.get(item.id)})`);
        } else {
          idIndex.set(item.id, file);
        }
      }
    }
  }

  // 3) cross-reference checks (RoleTemplate → ToolProfile / WorkflowTemplate / ConnectorPreset)
  if (docs["roles.json"]) {
    for (const role of docs["roles.json"].items) {
      const label = `docs/ootb-catalog/roles.json[${role.id}]`;
      for (const ref of role.default_tool_profile_ids ?? []) {
        if (!idIndex.has(ref)) {
          err(`${label}: default_tool_profile_ids contains unknown id "${ref}"`);
        } else if (!ref.startsWith("tool.")) {
          err(`${label}: default_tool_profile_ids "${ref}" is not a tool.*`);
        }
      }
      for (const ref of role.default_workflow_template_ids ?? []) {
        if (!idIndex.has(ref)) {
          err(`${label}: default_workflow_template_ids contains unknown id "${ref}"`);
        } else if (!ref.startsWith("workflow.")) {
          err(`${label}: default_workflow_template_ids "${ref}" is not a workflow.*`);
        }
      }
      for (const ref of role.default_connector_preset_ids ?? []) {
        if (!idIndex.has(ref)) {
          err(`${label}: default_connector_preset_ids contains unknown id "${ref}"`);
        } else if (!ref.startsWith("preset.")) {
          err(`${label}: default_connector_preset_ids "${ref}" is not a preset.*`);
        }
      }
    }
  }

  // 4) WorkflowTemplate cross-refs (tools + triggering/participating roles)
  if (docs["workflows.json"]) {
    for (const wf of docs["workflows.json"].items) {
      const label = `docs/ootb-catalog/workflows.json[${wf.id}]`;
      for (const ref of wf.required_tool_profile_ids ?? []) {
        if (!idIndex.has(ref)) err(`${label}: required_tool_profile_ids unknown "${ref}"`);
      }
      for (const ref of wf.triggering_roles ?? []) {
        if (!idIndex.has(ref)) err(`${label}: triggering_roles unknown "${ref}"`);
      }
      for (const ref of wf.participating_roles ?? []) {
        if (!idIndex.has(ref)) err(`${label}: participating_roles unknown "${ref}"`);
      }
    }
  }

  // 5) ConnectorPreset cross-refs (tools + role templates)
  if (docs["connector-presets.json"]) {
    for (const preset of docs["connector-presets.json"].items) {
      const label = `docs/ootb-catalog/connector-presets.json[${preset.id}]`;
      for (const ref of preset.tool_profile_ids ?? []) {
        if (!idIndex.has(ref)) err(`${label}: tool_profile_ids unknown "${ref}"`);
      }
      for (const ref of preset.role_templates_enabled_by_default ?? []) {
        if (!idIndex.has(ref)) err(`${label}: role_templates_enabled_by_default unknown "${ref}"`);
      }
    }
  }

  // 6) DepartmentTemplate cross-refs (roles + tools + workflows)
  if (docs["departments.json"]) {
    for (const dept of docs["departments.json"].items) {
      const label = `docs/ootb-catalog/departments.json[${dept.id}]`;
      for (const ref of dept.common_roles ?? []) {
        if (!idIndex.has(ref)) err(`${label}: common_roles unknown "${ref}"`);
      }
      for (const ref of dept.shared_tools ?? []) {
        if (!idIndex.has(ref)) err(`${label}: shared_tools unknown "${ref}"`);
      }
      for (const ref of dept.shared_workflows ?? []) {
        if (!idIndex.has(ref)) err(`${label}: shared_workflows unknown "${ref}"`);
      }
    }
  }

  // 7) EA template Concur + Travel Booking + Expense Shell presence (Founder-doctrine)
  const ea = docs["roles.json"]?.items?.find((r) => r.id === "role.executive-assistant.v1");
  if (!ea) {
    err("roles.json: role.executive-assistant.v1 MISSING (Founder doctrine: deepest worked example)");
  } else {
    const toolIds = ea.default_tool_profile_ids ?? [];
    if (!toolIds.includes("tool.sap-concur.v1")) {
      err("role.executive-assistant.v1: missing tool.sap-concur.v1 in default_tool_profile_ids");
    }
    const wfIds = ea.default_workflow_template_ids ?? [];
    if (!wfIds.includes("workflow.travel-booking-expense-shell.v1")) {
      err("role.executive-assistant.v1: missing workflow.travel-booking-expense-shell.v1");
    }
    const ahas = ea.aha_moment_pack?.aha_moments ?? [];
    const hasTravelAha = ahas.some(
      (a) => typeof a?.name === "string" && a.name === "Travel Booking + Expense Shell",
    );
    if (!hasTravelAha) {
      err("role.executive-assistant.v1: aha_moment_pack must include 'Travel Booking + Expense Shell'");
    }
  }

  // 8) DandelionFlowTemplate presence
  const flows = docs["dandelion-flow-templates.json"]?.items ?? [];
  if (!flows.find((f) => f.id === "dandelionFlow.company-department-user-activation.v1")) {
    err("dandelion-flow-templates.json: dandelionFlow.company-department-user-activation.v1 MISSING");
  }

  // 9) canonical README phrase + Markdown forbidden-phrase scan
  const readmePath = join(CATALOG_DIR, "README.md");
  const readmeText = readFileSync(readmePath, "utf8");
  if (!readmeText.includes("Dandelion suggests the starter shape; Foundation governance authorizes what may actually run.")) {
    err("docs/ootb-catalog/README.md: missing canonical line 'Dandelion suggests the starter shape; Foundation governance authorizes what may actually run.'");
  }
  scanForbiddenPhrasesInMarkdown("docs/ootb-catalog/README.md", readmeText);

  finish();
}

function finish() {
  const ok = errors.length === 0;
  console.log("");
  console.log(`OOTB catalog validation — ${stats.files} files / ${stats.items} items scanned`);
  if (warnings.length) {
    console.log(`Warnings: ${warnings.length}`);
    for (const w of warnings) console.log(`  ⚠ ${w}`);
  }
  if (!ok) {
    console.log(`Errors: ${errors.length}`);
    for (const e of errors) console.log(`  ✗ ${e}`);
    process.exit(1);
  }
  console.log("✓ all checks passed");
  process.exit(0);
}

main();
