# Section 8 B2 — Static Entitlement Catalog

> Static catalog of plan templates, seat tiers, capability packs,
> connector pack families, usage meter templates, governance
> rules, non-paywallable safety rules, downgrade policies, and
> enterprise add-ons for ADR-0083 Section 8 Billing /
> Entitlements + Amendment 1.

> **Static only.** No runtime billing. No payment provider
> integration. No feature gating. No Prisma schema. No
> migrations. No entitlement enforcement code. This catalog
> exists so future Billing Admin work, entitlement checks, plan
> previews, and Control Tower billing surfaces do not guess —
> they consume this versioned static catalog as their reference.

## Purpose

Section 8 B2 turns ADR-0083 + Amendment 1 doctrine into a
versioned static catalog. Every catalog object carries:

- `id` / `version` / `status` / `object_type` / `name`
- `description` / `human_readable_summary` / `model_usage_notes`
- `source_adr_refs` (at minimum ADR-0083)
- `governance_notes` / `billing_notes`
- `safe_defaults` / `forbidden_defaults`
- `allowed_consumers` / `forbidden_consumers`
- `audit_expectations`

These objects are templates. Runtime entitlement enforcement is
forward-substrate to B3+ slices.

## Canonical doctrine preserved verbatim

- **"Billing is not just payment. Billing is the entitlement
  layer that controls how Otzar's governed intelligence
  capabilities scale across an enterprise."**
- **"The DMW is not a luxury add-on. The Memory Wallet is
  foundational trust infrastructure."**
- **"Customers should not pay extra just to have memory be
  safe."**
- **"Base Otzar must include enough DMW capability for every
  Digital Twin to remember safely."**
- **"Advanced memory governance can be premium; basic memory
  safety cannot."**
- **"Billing says what the organization has purchased.
  Governance says what the system may safely do."**
- **"Billing may entitle a connector pack; governance still
  authorizes connector activation."**
- **"Downgrades may disable new premium actions but must never
  delete audit history, violate retention, or break evidence
  integrity."**

## DMW-included doctrine

Per ADR-0083 + RULE 0 sovereignty: the **DMW baseline is
included in every plan**. Memory safety is not a paywallable
luxury — it is foundational trust infrastructure that ships with
Starter / Pilot at the $250 base just as it ships with
Enterprise. Advanced DMW governance (custom retention extensions,
regulated deletion variants, lawful-basis composition) is a
premium pack; **basic memory safety is not in that pack — it is
in every plan**.

## Billing / governance separation

Every catalog object enforces the entitlement-vs-authority
separation:

- Billing entitles **availability** (the org has purchased
  access to the capability).
- Foundation governance authorizes **activation** (admin
  approval + map-region approval + per-call governance).

No plan tier or commercial structure relaxes Foundation
governance, audit chain integrity, DMW baseline safety,
cross-tenant isolation, or RULE-20-protected forbidden
inferences (no employee scoring, no manager surveillance, no
psychological profiling, no sensitive-attribute inference).

## How future B3 / B4 / B5 / B6 / B7 / B8 slices consume this

- **B3 — Plan + entitlement read API.** Read-only API surface
  consuming `plans.json` + `seats.json` + `capability-packs.json`
  + `connector-pack-families.json`. No runtime billing change.
- **B4 — Seat ledger.** Runtime tracking of `meter.active-twin-seats`
  + `meter.active-admin-seats` + `meter.active-board-observer-seats`.
- **B5 — Connector pack entitlement runtime.** Runtime tracking
  of pack entitlement; activation still governance-gated.
- **B6 — Usage meters runtime.** Implements counting per
  `usage-meters.json`.
- **B7 — Billing Admin route surface.** Bearer-gated routes
  consuming `governance-rules.json.billing_admin_permission_profile`.
- **B8 — Governed downgrade / upgrade.** Implements transitions
  per `downgrade-policies.json`.

## Files

| File | Purpose | Object Type |
|---|---|---|
| `catalog.schema.json` | JSON Schema for validator | n/a |
| `plans.json` | 4 plan templates (Starter / Team / Business / Enterprise) | `PlanTemplate` |
| `seats.json` | 6 seat tiers (Standard / Professional / Executive / Admin / Board / External) | `SeatTier` |
| `capability-packs.json` | 9 capability packs | `CapabilityPack` |
| `connector-pack-families.json` | 8 connector pack families (Collaboration / Workspace / Project / Revenue / Customer / People / Finance / Legal) | `ConnectorPackFamily` |
| `usage-meters.json` | 16 usage meter templates | `UsageMeterTemplate` |
| `governance-rules.json` | 18 governance rules + embedded non-paywallable safety rules + Billing Admin permission profile | `GovernanceRule` / `NonPaywallableSafetyRule` / `BillingAdminPermissionProfile` |
| `downgrade-policies.json` | 5 downgrade / cancellation / contract-end policies | `DowngradePolicyTemplate` |
| `enterprise-add-ons.json` | 13 enterprise add-ons | `EnterpriseAddOn` |

## Validation

```sh
node scripts/validate-entitlement-catalog.mjs
```

The validator enforces:

- JSON parses
- Required files exist
- Required top-level wrappers exist
- IDs unique across each file
- Every object includes `source_adr_refs` with ADR-0083
- Every object includes `governance_notes` + `billing_notes`
- DMW baseline appears in plans + seats
- $250 base appears in plans
- Required seat tiers exist
- Required capability packs exist
- Required connector pack families exist
- Required usage meters exist
- Required non-paywallable rules exist
- Forbidden phrases do not appear: `guaranteed compliant`,
  `regulator approved`, `no fine risk`, `employee score`,
  `manager surveillance`, `psychological profile`,
  `unrestricted write access`, `auto-approved`,
  `connector activated by billing`, `DMW sold separately`,
  `wallet fee required for memory safety`
- Canonical phrase present:
  *"Customers should not pay extra just to have memory be safe."*

Forbidden-phrase scanning skips `forbidden_*` subtrees + similar
guard fields (catalog necessarily describes what is forbidden).

## ADR lineage

- **ADR-0083 Section 8 Billing / Entitlements** + **Amendment 1**
- ADR-0084 Section 4 MCP / Connector Strategy
- ADR-0082 Dandelion Activation Architecture + Amendment 1
- ADR-0081 Section 9 Workflows Doctrine
- ADR-0080 OOTB Role/Tool/Workflow/Connector/Dandelion Ontology
- ADR-0070 Regulator-Ready Foundation Doctrine
- ADR-0027 Contributor Governance + AI Alignment + RULE 20
- ADR-0026 Dual-Control Middleware Pattern
- ADR-0049 GOVSEC government-grade hardening umbrella
- ADR-0050 GOVSEC.5 Break-Glass / Time-Boxed Audit
- ADR-0036 REGULATOR Principal + LawfulBasis
- ADR-0071 Section 7 cross-scope verify-chain
- ADR-0001 Three-wallet architecture
- ADR-0002 Append-only audit chain
- ADR-0018 Deployment-Target Agnosticism
- ADR-0019 Cryptographic-Suite Posture
- ADR-0024 Pre-commit hook posture
- ADR-0025 Schema-push-target discipline

## Status

ACCEPTED 2026-06-01 per `[FOUNDER-SECTION-8-B2-STATIC-ENTITLEMENT-CATALOG-AUTH]`. Static catalog only. No runtime.
