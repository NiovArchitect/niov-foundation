#!/usr/bin/env node
// FILE: validate-voice-first.mjs
// PURPOSE: Voice-first substrate validator per ADR-0085. Pure Node
//          ESM, no deps. Verifies:
//            - all 8 required files exist in docs/voice-first/
//            - the 4 canonical doctrine lines appear verbatim in
//              docs/voice-first/doctrine.md
//            - the 13-surface interaction map enumerates all 13
//              canonical surface_id values from ADR-0085 §7
//            - the 10-gate Sesame readiness assessment enumerates
//              all 10 gates from ADR-0085 §6
//            - the 4 VoiceProviderAdapter slots (TEXT_ONLY +
//              LOCAL_MOCK + SESAME + FUTURE) appear in
//              voice-provider-adapter.md per ADR-0085 §4
//            - the 7 implementation-sequence gates (VF.1 through
//              VF.7) appear in implementation-sequence.md per
//              ADR-0085 §8
//            - the JSON schema voice-first.schema.json parses and
//              declares the required substrate shape
// CONNECTS TO: docs/voice-first/*,
//              docs/architecture/decisions/0085-voice-first-product-doctrine.md.
// USAGE: node scripts/validate-voice-first.mjs

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIR = resolve(__dirname, "..", "docs", "voice-first");
const ADR_PATH = resolve(
  __dirname,
  "..",
  "docs",
  "architecture",
  "decisions",
  "0085-voice-first-product-doctrine.md",
);

const REQUIRED_FILES = [
  "README.md",
  "doctrine.md",
  "interaction-map.md",
  "sesame-readiness-assessment.md",
  "voice-provider-adapter.md",
  "voice-intent-envelope.md",
  "risk-tiered-action-model.md",
  "implementation-sequence.md",
  "voice-first.schema.json",
];

const CANONICAL_DOCTRINE_LINES = [
  "Otzar is voice-first because work should move through natural communication, not endless clicking.",
  "Users should be able to talk to their AI Twin the way they would talk to a trusted teammate.",
  "Voice reduces friction, increases adoption, and makes governed intelligence feel alive.",
  "Voice is an interface layer over Foundation governance, not a bypass around it.",
];

const CANONICAL_SURFACE_IDS = [
  "ONBOARDING",
  "ADMIN_TWIN",
  "AI_TWIN",
  "AI_TEAMMATE",
  "WORKFLOW_RECOMMENDATION",
  "PROPOSED_ACTION",
  "APPROVAL_REQUEST",
  "CONNECTOR_QUESTION",
  "MEETING_FOLLOWUP",
  "HIVE",
  "AGENT_PLAYGROUND",
  "AUDIT_EXPLANATION",
  "EXECUTIVE_BRIEFING",
];

const CANONICAL_PROVIDER_SLOTS = ["TEXT_ONLY", "LOCAL_MOCK", "SESAME", "FUTURE"];

const CANONICAL_VF_GATES = ["VF.1", "VF.2", "VF.3", "VF.4", "VF.5", "VF.6", "VF.7"];

const errors = [];
const successes = [];

function fail(msg) {
  errors.push(msg);
}

function ok(msg) {
  successes.push(msg);
}

// ────────────────────────────────────────────────────────────────
// 1. All required files exist.
// ────────────────────────────────────────────────────────────────
for (const file of REQUIRED_FILES) {
  const path = resolve(DIR, file);
  if (!existsSync(path)) {
    fail(`MISSING FILE: docs/voice-first/${file}`);
  } else {
    ok(`exists: docs/voice-first/${file}`);
  }
}
if (!existsSync(ADR_PATH)) {
  fail("MISSING FILE: docs/architecture/decisions/0085-voice-first-product-doctrine.md");
} else {
  ok("exists: docs/architecture/decisions/0085-voice-first-product-doctrine.md");
}

// ────────────────────────────────────────────────────────────────
// 2. JSON Schema parses + declares required substrate shape.
// ────────────────────────────────────────────────────────────────
const schemaPath = resolve(DIR, "voice-first.schema.json");
if (existsSync(schemaPath)) {
  try {
    const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
    if (schema.kind !== undefined) {
      fail("voice-first.schema.json: top-level 'kind' should be a JSON Schema property, not a value");
    }
    const expectedRequired = [
      "kind",
      "version",
      "doctrine_lines_canonical",
      "interaction_map_surfaces",
      "risk_tiers",
      "sesame_readiness_gates",
      "voice_provider_adapter_slots",
      "implementation_sequence_gates",
    ];
    const actualRequired = Array.isArray(schema.required) ? schema.required : [];
    const missing = expectedRequired.filter((r) => !actualRequired.includes(r));
    if (missing.length > 0) {
      fail(
        `voice-first.schema.json: required[] missing ${missing.join(", ")}`,
      );
    } else {
      ok("voice-first.schema.json: required[] complete");
    }
  } catch (err) {
    fail(`voice-first.schema.json: JSON parse error: ${err.message}`);
  }
}

// ────────────────────────────────────────────────────────────────
// 3. Doctrine lines appear verbatim in doctrine.md.
// ────────────────────────────────────────────────────────────────
const doctrinePath = resolve(DIR, "doctrine.md");
if (existsSync(doctrinePath)) {
  const doctrine = readFileSync(doctrinePath, "utf8");
  for (const line of CANONICAL_DOCTRINE_LINES) {
    if (!doctrine.includes(line)) {
      fail(`doctrine.md missing canonical line: "${line.slice(0, 80)}..."`);
    } else {
      ok(`doctrine.md contains canonical line: "${line.slice(0, 40)}..."`);
    }
  }
}

// ────────────────────────────────────────────────────────────────
// 4. Doctrine lines also appear verbatim in ADR-0085.
// ────────────────────────────────────────────────────────────────
if (existsSync(ADR_PATH)) {
  const adr = readFileSync(ADR_PATH, "utf8");
  for (const line of CANONICAL_DOCTRINE_LINES) {
    if (!adr.includes(line)) {
      fail(`ADR-0085 missing canonical doctrine line: "${line.slice(0, 80)}..."`);
    } else {
      ok(`ADR-0085 contains canonical doctrine line: "${line.slice(0, 40)}..."`);
    }
  }
}

// ────────────────────────────────────────────────────────────────
// 5. 13-surface interaction map enumerates all canonical surfaces.
// ────────────────────────────────────────────────────────────────
const interactionMapPath = resolve(DIR, "interaction-map.md");
if (existsSync(interactionMapPath)) {
  const map = readFileSync(interactionMapPath, "utf8");
  // Each surface appears as a numbered H3 (### N. Display Name).
  // Validate each canonical surface display label appears at least
  // once in the doc — we don't enforce the enum-id markup here,
  // because the doc is human-readable prose; the per-id enforcement
  // lives in the schema + the future VF.2 service code.
  const surfaceDisplayLabels = [
    "Onboarding",
    "Admin Twin",
    "AI Twin",
    "AI Teammate",
    "Workflow recommendations",
    "Proposed Actions",
    "Approval requests",
    "Connector questions",
    "Meeting follow-ups",
    "Hives",
    "Agent Playground",
    "Audit explanations",
    "Executive briefings",
  ];
  for (const label of surfaceDisplayLabels) {
    if (!map.includes(label)) {
      fail(`interaction-map.md missing surface label: "${label}"`);
    } else {
      ok(`interaction-map.md contains surface label: "${label}"`);
    }
  }
}

// ────────────────────────────────────────────────────────────────
// 6. 10-gate Sesame readiness assessment enumerates all 10 gates.
// ────────────────────────────────────────────────────────────────
const sesamePath = resolve(DIR, "sesame-readiness-assessment.md");
if (existsSync(sesamePath)) {
  const sesame = readFileSync(sesamePath, "utf8");
  // Each gate is recorded as a row "| N | ... | PENDING | ..." or
  // similar; we count gate-number markers "| 1 |" through "| 10 |".
  for (let i = 1; i <= 10; i++) {
    if (!sesame.match(new RegExp(`\\|\\s*${i}\\s*\\|`))) {
      fail(`sesame-readiness-assessment.md missing gate ${i} row`);
    } else {
      ok(`sesame-readiness-assessment.md contains gate ${i}`);
    }
  }
  // Verify all 10 gates are currently PENDING (the canonical state
  // at this PR's authoring time per ADR-0085 §6).
  const pendingCount = (sesame.match(/PENDING/g) || []).length;
  if (pendingCount < 10) {
    fail(`sesame-readiness-assessment.md should mark all 10 gates PENDING; found ${pendingCount} PENDING markers`);
  } else {
    ok(`sesame-readiness-assessment.md PENDING markers present (${pendingCount})`);
  }
}

// ────────────────────────────────────────────────────────────────
// 7. VoiceProviderAdapter slots enumerate all 4 canonical adapters.
// ────────────────────────────────────────────────────────────────
const adapterPath = resolve(DIR, "voice-provider-adapter.md");
if (existsSync(adapterPath)) {
  const adapter = readFileSync(adapterPath, "utf8");
  for (const slot of CANONICAL_PROVIDER_SLOTS) {
    if (!adapter.includes(slot)) {
      fail(`voice-provider-adapter.md missing adapter slot enum: ${slot}`);
    } else {
      ok(`voice-provider-adapter.md contains adapter slot: ${slot}`);
    }
  }
}

// ────────────────────────────────────────────────────────────────
// 8. Implementation sequence enumerates all 7 VF gates VF.1-VF.7.
// ────────────────────────────────────────────────────────────────
const sequencePath = resolve(DIR, "implementation-sequence.md");
if (existsSync(sequencePath)) {
  const sequence = readFileSync(sequencePath, "utf8");
  for (const gate of CANONICAL_VF_GATES) {
    if (!sequence.includes(gate)) {
      fail(`implementation-sequence.md missing gate: ${gate}`);
    } else {
      ok(`implementation-sequence.md contains gate: ${gate}`);
    }
  }
}

// ────────────────────────────────────────────────────────────────
// 9. ADR-0085 cites RULE 0 + RULE 4 + RULE 13 + RULE 20.
// ────────────────────────────────────────────────────────────────
if (existsSync(ADR_PATH)) {
  const adr = readFileSync(ADR_PATH, "utf8");
  const requiredRules = ["RULE 0", "RULE 4", "RULE 13", "RULE 20"];
  for (const rule of requiredRules) {
    if (!adr.includes(rule)) {
      fail(`ADR-0085 missing RULE citation: ${rule}`);
    } else {
      ok(`ADR-0085 cites ${rule}`);
    }
  }
}

// ────────────────────────────────────────────────────────────────
// Report
// ────────────────────────────────────────────────────────────────
console.log(`✓ ${successes.length} checks passed`);
if (errors.length === 0) {
  console.log("✓ voice-first substrate validator: 0 errors");
  process.exit(0);
} else {
  console.error(`✗ voice-first substrate validator: ${errors.length} errors`);
  for (const err of errors) {
    console.error(`  - ${err}`);
  }
  process.exit(1);
}
