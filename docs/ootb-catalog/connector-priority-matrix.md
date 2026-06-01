# Connector Priority Matrix

> Derived from `docs/ootb-catalog/{tools,connector-presets,roles}.json` by `scripts/compute-connector-priority.mjs`. **Suggest-only.** Per ADR-0080 §10 + Wave 6.

Generated: `2026-06-01T09:31:16.269Z` · Matrix version: `wave-6-v1.0.0`

## Doctrine

- **Suggest-only.** This matrix does not activate any connector.
- **Connector presets are not live connectors.**
- The first real Section 4 connector requires Founder authorization + a RULE 21 research arc.
- The score is deterministic: same catalog → same ranking. Re-run after Wave 2.1 catalog deepening.

## Weights

| Component | Weight | Direction |
|-----------|--------|-----------|
| tier_score (ConnectorPriorityTier per tool) | 1.5 | + |
| api_maturity_score | 1.0 | + |
| adoption_signal_score | 1.0 | + |
| auth_readiness_score (API_TOKEN > OAuth user > OAuth admin consent) | 1.0 | + |
| role_count_max (most-roles-using underlying tool) | 0.5 | + |
| sensitivity_penalty (CRITICAL data sensitivity) | 0.5 | − |
| complexity_penalty (VERY_LARGE integration complexity) | 0.5 | − |

## Forward-substrate inputs (not yet derivable)

Per Wave 3 substrate-honest assessment, the following ADR-0080 §10 inputs are forward-substrate — they require Dandelion runtime / customer signals / Founder decisions that do not yet exist:

- Dandelion_collected_demand (no Dandelion runtime yet)
- customer_demand (no customers yet)
- launch_necessity (Founder decision)
- demo_impact (Founder/sales decision)

## Ranked output

| Rank | Connector preset | Total score | Tier (avg) | API maturity (avg) | Adoption (avg) | Auth readiness (avg) | Most-roles | Sensitivity penalty | Complexity penalty | Underlying tools |
|------|------------------|-------------|------------|---------------------|----------------|-----------------------|------------|---------------------|--------------------|------------------|
| 1 | Slack (Read-First) | **16** | 4 | 2 | 3 | 2 | 8 | 1.5 | 0.5 | 1 |
| 2 | Google Workspace (Read-First) | **13.33** | 3.33 | 2 | 2.83 | 1 | 7 | 1.58 | 0.42 | 6 |
| 3 | Project Tracker (Read-First) | **12.75** | 3.5 | 2 | 2.5 | 1 | 5 | 0.5 | 0.5 | 2 |
| 4 | Microsoft 365 (Read-First) | **11.05** | 3.4 | 2 | 2.6 | 0.6 | 4 | 1.6 | 0.9 | 5 |
| 5 | Microsoft Teams (Read-First) | **11** | 4 | 2 | 3 | 0.5 | 2 | 1.5 | 1.5 | 1 |
| 6 | GitHub (Read-First) | **10** | 3 | 2 | 3 | 1 | 2 | 2 | 1 | 1 |
| 7 | CRM (Read-First) | **9.75** | 3.5 | 2 | 2.5 | 1 | 2 | 1.75 | 2.25 | 2 |
| 8 | Travel + Expense (Read-First) | **8.75** | 2.83 | 2 | 2 | 0.75 | 2 | 1.5 | 1 | 6 |
| 9 | Support Platform (Read-First) | **6.63** | 2 | 1.75 | 1.75 | 1 | 1 | 1.5 | 1.25 | 4 |
| 10 | Legal / Contracts (Read-First) | **6.63** | 1.75 | 1.25 | 1.75 | 1 | 3 | 2 | 1 | 4 |
| 11 | Compliance Platform (Read-First) | **6.31** | 2.5 | 1 | 1.5 | 1 | 1 | 1.63 | 1.25 | 4 |
| 12 | HRIS (Read-First) | **6.3** | 1.8 | 2 | 2.2 | 0.8 | 1 | 2 | 1.8 | 5 |
| 13 | Finance ERP (Read-First) | **6** | 1.67 | 2 | 2 | 0.83 | 1 | 2 | 1.67 | 3 |
| 14 | ATS (Read-First) | **5.75** | 1.5 | 2 | 1.5 | 1 | 1 | 2 | 1 | 2 |

## Reading the matrix

**Higher score = higher derivable priority for first-connector implementation, given current catalog data.** A high score does not mean a connector should be activated — it means the catalog evidence (tier hint, API maturity, adoption signal, auth readiness, role demand, sensitivity, complexity) collectively favors this preset as a candidate.

**Section 4 first-real-connector decision** remains Founder-decision-gated. This matrix is one input to that decision; Dandelion-collected demand + customer launch profile + demo impact are the other inputs and are forward-substrate.

## Citations

- ADR-0080 §10 (connector prioritization model)
- ADR-0080 §13 (implementation ladder; Wave 6 = matrix output)
- ADR-0024 (pre-commit hook posture — `secret_ref` env-var-NAME pattern preserved)
- ADR-0026 (dual-control middleware — applies once connector writes activate)
- ADR-0070 (regulator-ready Foundation doctrine — neutral compliance vocabulary preserved)
