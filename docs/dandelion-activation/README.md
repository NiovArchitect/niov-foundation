# D6 Dandelion Activation Substrate

Stage F of the ADR-0080 Amendment 1 Dandelion 6-stage maturity model — the final stage where the approved map becomes a live operating envelope. Every step is human-authorized, audit-emitted, and reversible by construction.

## Canonical phrase

Dandelion maps the territory. Admins approve the map. Foundation governs what can happen inside the map. DMWs scope what can be remembered. Stage F Activation walks an approved envelope into the live operating state — every step is human-authorized, audit-emitted, and reversible by construction.

## What this substrate canonicalizes

- 4 ActivationPlan catalogs — one per ADR-0083 plan archetype (starter-pilot / team / business / enterprise)
- Each plan canonicalizes the ordered sequence of steps that take a D5 Starter Envelope (DRAFT_NOT_ACTIVATED) and walk it into the live operating state at the Foundation runtime tier
- Per-step audit literal + preconditions + postconditions + failure mode + rollback path
- Per-plan human authorization points (ORG_ADMIN single-control or TWO_ORG_ADMINS_DUAL_CONTROL for financial-effect steps)
- Per-plan rollback strategy (soft-delete-only per RULE 10; full reversibility by construction)

## What this substrate does NOT do

- NO runtime activation. The substrate is DESIGN_NOT_EXECUTED.
- NO actual binding registration, permission grant, DMW scope open, or workflow template registration.
- NO new audit literal added to the Foundation audit literals enum at the D6 design tier. Audit literals proposed in this catalog are forward-substrate; their substantive landing requires a separate implementation slice.
- NO mutation to Foundation services.
- NO connector authorization beyond what already exists at C2 (Slack OPERATING) + C3 (Google Workspace RUNTIME_READY).

## Activation step ordering doctrine

Every plan starts with a precheck step (read-only) and ends with the `step.envelope.mark-activated` state-flip. Between those, steps progress in dependency order:

1. **Precheck** — verify envelope state + caller capabilities + org match
2. **DMW grants** — baseline first; scope extensions next
3. **Role assignments** — template + scope-specific roles
4. **Authority profiles** — delegated authority with ceiling-never-exceeds-human enforcement (business + enterprise)
5. **Governance surfaces** — break-glass registry + LawfulBasis attestation (enterprise)
6. **Connector bindings** — read-first only; env-var-NAME secret_ref; `use_real: false` at activation tier
7. **Workflow templates** — Stage 1 + Stage 2 templates only (TEMPLATE_ONLY register); financial-effect templates trigger DUAL-CONTROL at the enterprise tier
8. **Advanced/regulator-grade audit** — composes against ADR-0002 baseline; never weakens
9. **Board observer scope** — aggregate-only projection (enterprise)
10. **Aha moments** — first-week activation hints
11. **State-flip** — mark envelope ACTIVATED with full step-by-step lineage in audit details

## Per-archetype activation step counts

| Plan archetype | Steps | Distinctive steps |
|---|---:|---|
| Starter / Pilot | 6 | Baseline DMW + template roles + Stage 1 templates + safe-fallback aha + state-flip (no connectors) |
| Team | 8 | + team DMW scope + Slack connector + Stage 2 templates |
| Business | 11 | + project/customer DMW + delegated authority + Google connector + advanced audit |
| Enterprise | 14 | + break-glass registry + LawfulBasis attestation + DUAL-CONTROL templates + DUAL-CONTROL regulator-grade audit + board observer |

## Audit literal forward-queue

These audit literals are canonical at the design tier but NOT yet in `apps/api/src/services/audit/literals.ts`. The implementation slice that consumes this catalog must land them under a separate Founder authorization per ADR-0042 §Q-γ.1 clean-transition discipline:

- ADMIN_ACTION:ENVELOPE_ACTIVATION_PRECHECK
- ADMIN_ACTION:DMW_BASELINE_GRANTED / REVOKED
- ADMIN_ACTION:DMW_TEAM_SCOPE_GRANTED / REVOKED
- ADMIN_ACTION:DMW_PROJECT_CUSTOMER_SCOPE_GRANTED / REVOKED
- ADMIN_ACTION:DMW_ENTERPRISE_SCOPE_GRANTED / REVOKED
- ADMIN_ACTION:ROLE_TEMPLATE_ASSIGNED / UNASSIGNED
- ADMIN_ACTION:DELEGATED_AUTHORITY_REGISTERED / REVOKED
- ADMIN_ACTION:BREAK_GLASS_REGISTRY_ENABLED / DISABLED
- ADMIN_ACTION:LAWFUL_BASIS_ATTESTATION_ENABLED / DISABLED
- ADMIN_ACTION:CONNECTOR_BINDING_REGISTERED / REVOKED (already exists in spirit via Section 4)
- ADMIN_ACTION:WORKFLOW_TEMPLATE_REGISTERED / UNREGISTERED
- ADMIN_ACTION:WORKFLOW_TEMPLATE_REGISTERED_DUAL_CONTROL
- ADMIN_ACTION:ADVANCED_AUDIT_TIER_ENABLED / DISABLED
- ADMIN_ACTION:REGULATOR_GRADE_AUDIT_ENABLED_DUAL_CONTROL / DISABLED
- ADMIN_ACTION:BOARD_OBSERVER_SCOPE_REGISTERED / REVOKED
- ADMIN_ACTION:AHA_MOMENT_REGISTERED / UNREGISTERED
- ADMIN_ACTION:STARTER_ENVELOPE_ACTIVATED / STARTER_ENVELOPE_ACTIVATION_ROLLED_BACK
- Per authorization point audit literals (PRE_ACTIVATION_AUTHORIZED / DMW_BASELINE_AUTHORIZED / etc.)

## Validator

`scripts/validate-dandelion-activation.mjs` (pure Node ESM; no deps) verifies:

- 6/6 required files present (README + schema + 4 plan archetype activation plans)
- Wrapper shape (kind + catalog_version + activation_defaults + activation_plan)
- Universal required fields on every activation_plan
- `activation_state == "DESIGN_NOT_EXECUTED"` (enforced)
- `consumes_starter_envelope_id` cross-references into `docs/dandelion-starter-envelope/` (every plan must consume a real D5 envelope)
- 4/4 plan archetypes covered (starter-pilot / team / business / enterprise)
- ADR-0082 + ADR-0080 in source_adr_refs (every plan)
- Activation step ordering integrity (step_order monotonic from 1; every step has audit_literal + preconditions + postconditions + failure_mode + rollback_path)
- Last activation step audit_literal is exactly `ADMIN_ACTION:STARTER_ENVELOPE_ACTIVATED`
- Forbidden-phrase scan (sentence-level negation + subtree skip)
- Canonical phrase machine-checked present in README

## Usage

```
node scripts/validate-dandelion-activation.mjs
```

Exits 0 on green; exits 1 with per-error detail otherwise.

## What landed at D6

| Slice | Status | Substrate |
|---|---|---|
| D6 design substrate | LANDED | this catalog + validator |
| D6 implementation slice | forward-substrate | requires separate Founder authorization; audit literals land first per RULE 4 + ADR-0042 §Q-γ.1 |
| D6 CT UI consumer | forward-substrate | CT page that walks an org admin through the canonical activation plan |

## Dandelion graduation

Stage A (Preview LIVE) + Stage B (ASSESSMENT_READY) + Stage C (RECOMMENDATION_READY) + Stage D (GOVERNANCE_REVIEW_READY) + Stage E (ENVELOPE_READY) + **Stage F ACTIVATION_DESIGN_READY**. Stage F runtime execution forward-substrate at the implementation slice.
