#!/usr/bin/env node
// FILE: compute-connector-priority.mjs
// PURPOSE: ADR-0080 Wave 6 — pure Node derivation of a connector-priority
//          score per ConnectorPreset from the Wave 2 static catalog
//          (`docs/ootb-catalog/{tools,connector-presets,roles}.json`).
//          Output:
//            - docs/ootb-catalog/connector-priority-matrix.json (machine)
//            - docs/ootb-catalog/connector-priority-matrix.md   (human)
//
//          SUGGEST-ONLY output. No connector code, no OAuth, no secrets,
//          no schema, no runtime activation. The matrix encodes a
//          derivable subset of ADR-0080 §10 inputs; customer-signal +
//          Dandelion-collected-demand inputs are forward-substrate.
//
//          Determinism: same catalog → same matrix. Re-run after Wave 2.1
//          catalog deepening to refresh.
// CONNECTS TO: docs/ootb-catalog/tools.json + connector-presets.json +
//              roles.json + scripts/validate-ootb-catalog.mjs.
// USAGE: node scripts/compute-connector-priority.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CATALOG_DIR = resolve(__dirname, "..", "docs", "ootb-catalog");

function loadJson(name) {
  return JSON.parse(readFileSync(join(CATALOG_DIR, name), "utf8"));
}

const tools = loadJson("tools.json");
const presets = loadJson("connector-presets.json");
const roles = loadJson("roles.json");

const toolById = new Map(tools.items.map((t) => [t.id, t]));

// Cross-tab: how many roles list each tool as a default.
const roleCountByTool = new Map();
for (const role of roles.items) {
  for (const toolId of role.default_tool_profile_ids ?? []) {
    roleCountByTool.set(toolId, (roleCountByTool.get(toolId) ?? 0) + 1);
  }
}

// Score component dictionaries — deterministic + derivable from catalog only.
const TIER_SCORE = {
  TIER_1_CRITICAL: 4,
  TIER_2_HIGH: 3,
  TIER_3_MEDIUM: 2,
  TIER_4_LOWER: 1,
};
const API_MATURITY_SCORE = { STABLE: 2, PARTIAL: 1, BETA: 0 };
const ADOPTION_SCORE = {
  VERY_HIGH: 3,
  HIGH: 2,
  MEDIUM: 1,
  LOW: 0,
};
const SENSITIVITY_PENALTY = {
  CRITICAL: 2.0,
  HIGH: 1.5,
  MEDIUM: 0.5,
  LOW: 0.0,
};
const COMPLEXITY_PENALTY = {
  VERY_LARGE: 3.0,
  LARGE: 2.0,
  MEDIUM_LARGE: 1.5,
  MEDIUM: 1.0,
  SMALL_MEDIUM: 0.5,
  SMALL: 0.0,
};
const AUTH_READINESS_SCORE = {
  API_TOKEN: 2.0,
  API_TOKEN_ADMIN_ONLY: 1.5,
  OAUTH2_BOT_TOKEN: 2.0,
  AWS_IAM_ROLE: 1.5,
  OAUTH2_USER: 1.0,
  OAUTH2_ADMIN_CONSENT: 0.5,
};

function componentScoresForTool(tool) {
  return {
    tier_score: TIER_SCORE[tool.connector_priority_tier] ?? 0,
    api_maturity_score: API_MATURITY_SCORE[tool.api_maturity] ?? 0,
    adoption_signal_score: ADOPTION_SCORE[tool.enterprise_adoption_signal] ?? 0,
    sensitivity_penalty: SENSITIVITY_PENALTY[tool.data_sensitivity] ?? 0,
    complexity_penalty: COMPLEXITY_PENALTY[tool.integration_complexity] ?? 0,
    auth_readiness_score: AUTH_READINESS_SCORE[tool.auth_model] ?? 0,
    role_count: roleCountByTool.get(tool.id) ?? 0,
  };
}

function aggregateForPreset(preset) {
  const presetTools = (preset.tool_profile_ids ?? [])
    .map((id) => toolById.get(id))
    .filter(Boolean);

  if (presetTools.length === 0) {
    return {
      preset_id: preset.id,
      preset_name: preset.name,
      tool_count: 0,
      total_score: 0,
      components_avg: null,
    };
  }

  const components = presetTools.map(componentScoresForTool);
  const sumOver = (key) =>
    components.reduce((acc, c) => acc + c[key], 0);
  const avgOver = (key) => sumOver(key) / components.length;

  const role_count_max = Math.max(...components.map((c) => c.role_count));
  const components_avg = {
    tier_score: avgOver("tier_score"),
    api_maturity_score: avgOver("api_maturity_score"),
    adoption_signal_score: avgOver("adoption_signal_score"),
    sensitivity_penalty: avgOver("sensitivity_penalty"),
    complexity_penalty: avgOver("complexity_penalty"),
    auth_readiness_score: avgOver("auth_readiness_score"),
    role_count_max,
  };

  // Founder-direction weights — encoded for transparency.
  // Reflects ADR-0080 §10 — adds positive inputs, subtracts security_risk
  // and implementation_complexity.
  const total_score =
    1.5 * components_avg.tier_score +
    1.0 * components_avg.api_maturity_score +
    1.0 * components_avg.adoption_signal_score +
    1.0 * components_avg.auth_readiness_score +
    0.5 * role_count_max -
    0.5 * components_avg.sensitivity_penalty -
    0.5 * components_avg.complexity_penalty;

  return {
    preset_id: preset.id,
    preset_name: preset.name,
    tool_count: presetTools.length,
    total_score: Number(total_score.toFixed(2)),
    components_avg: {
      tier_score: Number(components_avg.tier_score.toFixed(2)),
      api_maturity_score: Number(components_avg.api_maturity_score.toFixed(2)),
      adoption_signal_score: Number(
        components_avg.adoption_signal_score.toFixed(2),
      ),
      auth_readiness_score: Number(
        components_avg.auth_readiness_score.toFixed(2),
      ),
      sensitivity_penalty: Number(
        components_avg.sensitivity_penalty.toFixed(2),
      ),
      complexity_penalty: Number(components_avg.complexity_penalty.toFixed(2)),
      role_count_max,
    },
  };
}

const rows = presets.items.map(aggregateForPreset);
rows.sort((a, b) => b.total_score - a.total_score);
rows.forEach((row, ix) => {
  row.rank = ix + 1;
});

const generatedAt = new Date().toISOString();

const matrixJson = {
  catalog_version: "1.0.0",
  matrix_version: "wave-6-v1.0.0",
  generated_at: generatedAt,
  source_files: [
    "docs/ootb-catalog/tools.json",
    "docs/ootb-catalog/connector-presets.json",
    "docs/ootb-catalog/roles.json",
  ],
  derivation_kind: "PURE_FROM_STATIC_CATALOG",
  forward_substrate_inputs_not_yet_available: [
    "Dandelion_collected_demand (no Dandelion runtime yet)",
    "customer_demand (no customers yet)",
    "launch_necessity (Founder decision)",
    "demo_impact (Founder/sales decision)",
  ],
  weights: {
    tier_score: 1.5,
    api_maturity_score: 1.0,
    adoption_signal_score: 1.0,
    auth_readiness_score: 1.0,
    role_count_max: 0.5,
    sensitivity_penalty: -0.5,
    complexity_penalty: -0.5,
  },
  notice:
    "SUGGEST-ONLY. This matrix derives a connector-priority score from the static catalog. It is not an authorization to implement any connector. The first real Section 4 connector requires Founder authorization + a RULE 21 research arc.",
  source_adr_refs: ["ADR-0080", "ADR-0024", "ADR-0026", "ADR-0070"],
  rows,
};

writeFileSync(
  join(CATALOG_DIR, "connector-priority-matrix.json"),
  JSON.stringify(matrixJson, null, 2) + "\n",
);

// Human-readable markdown.
const md = [];
md.push("# Connector Priority Matrix");
md.push("");
md.push("> Derived from `docs/ootb-catalog/{tools,connector-presets,roles}.json` by `scripts/compute-connector-priority.mjs`. **Suggest-only.** Per ADR-0080 §10 + Wave 6.");
md.push("");
md.push(`Generated: \`${generatedAt}\` · Matrix version: \`${matrixJson.matrix_version}\``);
md.push("");
md.push("## Doctrine");
md.push("");
md.push("- **Suggest-only.** This matrix does not activate any connector.");
md.push("- **Connector presets are not live connectors.**");
md.push("- The first real Section 4 connector requires Founder authorization + a RULE 21 research arc.");
md.push("- The score is deterministic: same catalog → same ranking. Re-run after Wave 2.1 catalog deepening.");
md.push("");
md.push("## Weights");
md.push("");
md.push("| Component | Weight | Direction |");
md.push("|-----------|--------|-----------|");
md.push("| tier_score (ConnectorPriorityTier per tool) | 1.5 | + |");
md.push("| api_maturity_score | 1.0 | + |");
md.push("| adoption_signal_score | 1.0 | + |");
md.push("| auth_readiness_score (API_TOKEN > OAuth user > OAuth admin consent) | 1.0 | + |");
md.push("| role_count_max (most-roles-using underlying tool) | 0.5 | + |");
md.push("| sensitivity_penalty (CRITICAL data sensitivity) | 0.5 | − |");
md.push("| complexity_penalty (VERY_LARGE integration complexity) | 0.5 | − |");
md.push("");
md.push("## Forward-substrate inputs (not yet derivable)");
md.push("");
md.push("Per Wave 3 substrate-honest assessment, the following ADR-0080 §10 inputs are forward-substrate — they require Dandelion runtime / customer signals / Founder decisions that do not yet exist:");
md.push("");
for (const item of matrixJson.forward_substrate_inputs_not_yet_available) {
  md.push(`- ${item}`);
}
md.push("");
md.push("## Ranked output");
md.push("");
md.push("| Rank | Connector preset | Total score | Tier (avg) | API maturity (avg) | Adoption (avg) | Auth readiness (avg) | Most-roles | Sensitivity penalty | Complexity penalty | Underlying tools |");
md.push("|------|------------------|-------------|------------|---------------------|----------------|-----------------------|------------|---------------------|--------------------|------------------|");
for (const row of rows) {
  const ca = row.components_avg;
  if (ca === null) {
    md.push(`| ${row.rank} | ${row.preset_name} | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | (no underlying tools) |`);
    continue;
  }
  md.push(`| ${row.rank} | ${row.preset_name} | **${row.total_score}** | ${ca.tier_score} | ${ca.api_maturity_score} | ${ca.adoption_signal_score} | ${ca.auth_readiness_score} | ${ca.role_count_max} | ${ca.sensitivity_penalty} | ${ca.complexity_penalty} | ${row.tool_count} |`);
}
md.push("");
md.push("## Reading the matrix");
md.push("");
md.push("**Higher score = higher derivable priority for first-connector implementation, given current catalog data.** A high score does not mean a connector should be activated — it means the catalog evidence (tier hint, API maturity, adoption signal, auth readiness, role demand, sensitivity, complexity) collectively favors this preset as a candidate.");
md.push("");
md.push("**Section 4 first-real-connector decision** remains Founder-decision-gated. This matrix is one input to that decision; Dandelion-collected demand + customer launch profile + demo impact are the other inputs and are forward-substrate.");
md.push("");
md.push("## Citations");
md.push("");
md.push("- ADR-0080 §10 (connector prioritization model)");
md.push("- ADR-0080 §13 (implementation ladder; Wave 6 = matrix output)");
md.push("- ADR-0024 (pre-commit hook posture — `secret_ref` env-var-NAME pattern preserved)");
md.push("- ADR-0026 (dual-control middleware — applies once connector writes activate)");
md.push("- ADR-0070 (regulator-ready Foundation doctrine — neutral compliance vocabulary preserved)");

writeFileSync(
  join(CATALOG_DIR, "connector-priority-matrix.md"),
  md.join("\n") + "\n",
);

console.log(
  `Wave 6 connector-priority matrix computed: ${rows.length} presets ranked`,
);
console.log(
  `Top 3: ${rows.slice(0, 3).map((r) => `${r.rank}. ${r.preset_name} (${r.total_score})`).join(" · ")}`,
);
