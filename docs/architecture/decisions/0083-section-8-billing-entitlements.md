# ADR-0083 — Section 8 Billing / Entitlements (Design-Only)

**Status:** Accepted 2026-06-01
**Nature:** Design-only. No code. No schema. No migration. No routes. No services. No runtime activation. No Control Tower billing UI. No payment provider integration. No payment data persistence. No LLM / Python / BEAM. No new audit literal. **No financial integration assumptions beyond what this ADR explicitly locks**; provider selection (Stripe / Chargebee / Paddle / etc.) is deferred to its own bounded slice under separate Founder authorization.
**Founder authorization:** `[FOUNDER-DOMAIN-GENERAL-OTZAR-ACTIVATION-EXPANSION-AUTH]` step 4 ("Section 8 Billing / Entitlements ADR using $250 base + add-ons") + companion direction from the Founder's billing-governance language in the same authorization ("entitlements gate features; billing should not destroy audit/evidence; non-payment should disable new premium actions, not delete retained records; compliance retention must remain intact; downgrades must preserve historical audit; security/governance features should not be unsafe paywalled").
**Parent doctrine:** ADR-0080 (OOTB ontology + Amendment 5 Domain General Otzar product framing) · ADR-0081 (Workflows Doctrine) · ADR-0082 (Dandelion Activation Architecture) · ADR-0027 (governance + RULE 20) · ADR-0026 (dual-control) · ADR-0070 (regulator-ready Foundation).

---

## 1. Context

Section 10 production-readiness audit (PR #164) flagged Section 8 Billing as a **hard launch blocker** if Otzar ships as commercial SaaS:

- No `Subscription` / `Plan` / `Seat` / `Entitlement` Prisma model.
- No entitlement enforcement at any service surface.
- No usage counters beyond `MemoryCapsule.access_count` proxy.
- No `/billing/*` routes.
- No payment provider integration.

Under `[FOUNDER-DOMAIN-GENERAL-OTZAR-ACTIVATION-EXPANSION-AUTH]` step 4, the Founder set the baseline:

> **"Base price starts at $250."**

This ADR locks the billing model design (base + seat add-ons + capability packs + usage add-ons + enterprise tier) + billing governance posture (entitlements gate features; billing never destroys audit / evidence; non-payment disables new premium actions but preserves retained records; compliance retention intact; downgrades preserve historical audit; security / governance features are never unsafe-paywalled).

This is the fourth bounded ADR landing under the Domain General Otzar expansion (Wave 2.1 → ADR-0081 → ADR-0082 → ADR-0083).

---

## 2. Decision

Foundation adopts the following billing / entitlements model.

### 2.1 Base + add-on pricing structure

Per Founder direction.

#### Base — `$250 / month`

The base subscription includes:

- One workspace / platform tenant.
- Foundation governance + audit substrate (per RULE 4 / ADR-0002 / ADR-0071).
- Section 7 audit viewer + verify-chain (per ADR-0071).
- Section 9 Approvals + Policies (LIVE).
- Section 10 operational substrate access (runbooks).
- Otzar Administrator seat (1; Admin Twin enabled at recommendation-only tier per ADR-0081 Stage 2 once D7 lands).
- Read-only `/onboarding` Dandelion Preview (ADR-0082 Stage A LIVE).
- Read-only OOTB catalog + Wave 6 connector-priority matrix browse.
- Foundation-native Memory Wallet (DMW) auto-provisioned per entity.
- **Includes Foundation security and governance baseline** — never paywalled separately. Per Founder direction: *"security/governance features should not be unsafe paywalled."*

#### Seat add-ons (`per seat / month`)

| Seat type | Description | Tier |
|-----------|-------------|------|
| **Standard Digital Twin** | A standard role-shaped Twin per ADR-0080 RoleTemplate. Operates within governed envelope; ADR-0081 Stage 2 Recommendation-only by default. | Per seat |
| **Executive / High-Authority Twin** | EA / CEO / CFO / CTO / etc. tier Twin with broader scope envelope, sensitive document handling, and approval-gated executive workflows. | Per seat |
| **Admin / Governance Twin** | Otzar Administrator + secondary admin seats. Per ADR-0080 Amendment 5 first-class. | Per seat |
| **Board / Read-Only Governance Seat** | Board member / Investor Observer scoped to board materials per `docs/ootb-catalog/role-depth/board-member.md`. Read-only at all stages. | Per seat |
| **External Collaborator / Limited Seat** | Auditor / vendor / counterparty under explicit NDA and scope envelope. Read-only by default. Per-collaborator audit. | Per seat |

#### Capability packs (`per pack / month`)

Capability packs unlock cross-cutting capability surfaces.

| Pack | Unlocks | Notes |
|------|---------|-------|
| **Dandelion Activation Pack** | ADR-0082 Stages B–F (Assessment → Recommendation → Governance Review → Starter Envelope Assembly → Activation). Without this pack: Stage A preview only. | Required for Dandelion runtime. |
| **Connector Pack** | Section 4 Connector adapter activations beyond the OutboundWebhook substrate (Slack / Google Workspace / Project Tracker / Salesforce / etc.; per Wave 6 matrix top-ranked). | Each connector adapter is its own Founder-authorized slice; this pack unlocks the capability surface. |
| **Advanced Audit / Compliance Pack** | Cross-scope verify-chain for org / platform scopes (Wave 7 of Section 7 LIVE). Audit export NDJSON / CSV at higher volumes. Regulator evidence pack assembly under ADR-0036 LawfulBasis. | Compliance retention always intact regardless of pack state (per Founder direction). |
| **Agent Playground / Simulation Pack** | Section 5 Agent Playground enterprise decision cockpit at higher concurrency (Section 5 v1 LIVE). Multi-agent simulation per ADR-0076. ADR-0078 transcript substrate Stage 1+ when LIVE. | Stage 1 / 3 / 4 require their own Founder authorization. |
| **Enterprise Analytics Pack** | Section 6 aggregate-only analytics at higher cadence. Per-action runtime health + compliance posture aggregates. | Section 6 v1 LIVE; pack unlocks higher refresh tiers. |
| **Workflow Automation Pack** | ADR-0081 Stage 3 (Proposed Action) and Stage 4 (Governed Execution) for workflows. Without this pack: Stage 2 Recommendation-only. | Workflows never bypass humans regardless of pack state. |
| **DMW / Memory Governance Pack** | Advanced DMW scope management surfaces. Memory-policy audit. Memory retention class controls. | DMW auto-provisioning + base scopes always included in base; pack unlocks advanced governance. |
| **Regulator / Evidence Pack** | ADR-0036 REGULATOR principal + LawfulBasis Attestation surfaces. Regulator-facing evidence package export under dual-control. | Regulator evidence assembly always requires lawful basis regardless of pack state. |
| **Premium Support / Onboarding Pack** | Dedicated implementation partner / champion enablement consulting. Priority support. | Out-of-product; sold alongside billing. |

#### Usage add-ons (metered)

| Meter | Unit | Notes |
|-------|------|-------|
| **Connector action volume** | Per `INVOKE_CONNECTOR` Action per ADR-0057 | Read-first; write-gated. |
| **Workflow runs** | Per ADR-0081 Stage 3+ workflow run | Stage 2 Recommendation-only does not count. |
| **Audit exports** | Per audit export operation | Foundation-native viewer browsing not metered. |
| **Memory capsule storage** | Per stored GB / per stored capsule count | DMW auto-provisioned; storage metered. |
| **Simulation runs** | Per ADR-0076 Wave 9 multi-agent simulation | Section 5 Playground inspection unmetered. |
| **Evidence package generation** | Per regulator evidence package per ADR-0036 | Each package retains audit lineage. |

#### Enterprise tier

Custom pricing. Includes:

- SSO / SAML / SCIM.
- Custom retention policies.
- Custom connectors (under separate engineering contract).
- Dedicated support + onboarding partner.
- Regulated deployment per ADR-0018 (sovereign cloud / on-premise / air-gapped).
- Private cloud / VPC deployment where required.
- Volume discounts on seat + capability + usage.

### 2.2 Billing governance posture (universal, non-negotiable)

Per Founder direction.

#### 2.2.1 Entitlements gate features (NOT audit / evidence)

Entitlements may gate **features**:

- A capability pack may gate Dandelion Stages B–F (without the Dandelion Activation Pack, the tenant only has the Stage A preview).
- A pack may gate Connector adapter use (without the Connector Pack, only OutboundWebhook).
- A pack may gate Workflow Stage 3+ runtime (without the Workflow Automation Pack, only Stage 2 Recommendation-only).
- A pack may gate Agent Playground multi-agent simulation higher concurrency.

Entitlements **never** gate:

- **Audit chain integrity** — every action audited per RULE 4 regardless of pack state.
- **Verify-chain operations** — `GET /api/v1/audit/verify-chain` available for self-scope at every tier.
- **Compliance retention** — retention class enforced per company policy regardless of pack state.
- **Foundation security baseline** — dual-control / break-glass / rate-limit / no-leak guards / no-console invariant / CORS / Helmet / boot validation always on.
- **DMW auto-provisioning** — Memory Wallet auto-created per entity at base tier.
- **Same-org boundary** — never weakened by entitlement state.
- **Cross-tenant isolation** — never weakened by entitlement state.
- **Regulator-ready posture** — neutral compliance vocabulary preserved regardless of pack state.

#### 2.2.2 Billing never destroys audit or evidence

- Audit chain is append-only per ADR-0002 + BEFORE DELETE trigger. Billing state changes (downgrade / non-payment / cancellation) never delete audit rows.
- Evidence packages assembled under ADR-0036 LawfulBasis remain retained per the LawfulBasis retention class regardless of billing state.
- Compliance frameworks state per ADR-0008 remains queryable regardless of billing state.

#### 2.2.3 Non-payment posture

When a tenant's payment lapses:

| Scope | Behavior |
|-------|----------|
| **New premium actions** | Disabled. Twin can no longer propose connector writes / new workflow runs / new evidence package generation. |
| **Existing approved actions in flight** | Allowed to complete per existing approval (no mid-flight destruction). |
| **Read access to existing audit / evidence / retained records** | Preserved. The tenant remains able to query their existing audit chain and retained evidence. |
| **DMW memory capsules** | Preserved per RULE 10 (`deleted_at` is soft-delete; audit chain preserves capsule lineage). |
| **Foundation governance surfaces** (Approvals / Policies / Security Audit Viewer) | Preserved at read tier. |
| **Re-activation** | Resuming payment re-enables new premium actions. State preserved across payment lapse. |

This is the canonical "graceful degradation, never destructive" posture. The Founder direction is explicit: *"non-payment should disable new premium actions, not delete retained records; compliance retention must remain intact."*

#### 2.2.4 Downgrade posture

When a tenant downgrades (e.g., drops the Workflow Automation Pack):

- Existing workflow templates remain visible at Stage 1 (Template-only) + Stage 2 (Recommendation-only).
- Existing Stage 3+ workflow runs in flight allowed to complete per existing approval.
- New Stage 3+ workflow runs disabled.
- Historical audit of past workflow runs preserved.
- DMW capsules from past runs preserved.
- The downgrade is **reversible**: re-upgrading restores the same capability immediately; envelope state preserved.

#### 2.2.5 Security / governance features never unsafe-paywalled

Per Founder direction explicit: *"security/governance features should not be unsafe paywalled."*

The following are **always** included at the base tier and may not be moved to a paid pack:

- Audit chain integrity verification.
- Same-org boundary enforcement.
- Cross-tenant isolation.
- Dual-control middleware substrate (per ADR-0026).
- Break-glass time-boxed audit (per ADR-0050).
- Rate limiting.
- No-leak / no-console guards.
- Boot validation.
- Foundation governance posture (Approvals + Policies + Security Audit Viewer).
- DMW auto-provisioning + base scope discipline.
- Regulator-ready neutral compliance vocabulary (per ADR-0070).

### 2.3 Future `Entitlement` runtime model shape (forward-substrate; not implemented at this ADR)

When Section 8 implementation lands, the runtime model will include:

| Field | Purpose |
|-------|---------|
| `subscription_id` | tenant subscription |
| `org_entity_id` | tenant boundary |
| `base_tier` | always present at $250/month (or volume-discounted enterprise) |
| `seats[]` | array of `{ seat_type, entity_id, granted_at, expires_at }` |
| `capability_packs[]` | array of `{ pack_id, granted_at, expires_at, runtime_active }` |
| `usage_meters[]` | array of `{ meter_id, period_start, period_end, current_units, limit_units }` |
| `payment_state` | ACTIVE / GRACE / SUSPENDED / CANCELLED |
| `payment_state_changed_at` | timestamp |
| `non_payment_grace_period_end` | per company policy |
| `retention_overrides` | per regulated industry (HIPAA / SOX / FINRA / GDPR) |
| `enterprise_terms_ref` | reference to enterprise contract artifact (where applicable) |
| `audit_event_pattern` | `ADMIN_ACTION` + `details.action` discriminator; **no new audit literal** |

`Entitlement` runtime is NOT implemented at this ADR. No payment provider selected. No `/billing/*` routes added.

### 2.4 Entitlement enforcement points (forward-substrate)

When Section 8 implementation lands, entitlement enforcement happens at:

| Surface | Check |
|---------|-------|
| Twin creation | seat availability |
| Dandelion Stage B-F invocation | Dandelion Activation Pack present |
| Connector adapter invocation | Connector Pack + per-adapter seat |
| Workflow Stage 3+ execution | Workflow Automation Pack present |
| Multi-agent simulation | Agent Playground Pack present + concurrency tier |
| Audit export above limit | Advanced Audit Pack present + volume limit check |
| Regulator evidence package | Regulator Pack present + LawfulBasis valid (ADR-0036) |
| Memory capsule write | Storage limit check |

Enforcement happens **before** the substantive action executes. Failure returns a closed-vocab `EntitlementFailure` enum per `EntitlementService.assertEntitled()` (forward-substrate; not implemented here).

### 2.5 Payment provider selection (deferred)

Per Founder direction the base price is $250 but the payment provider is not selected here. Candidates the future ADR will evaluate:

- Stripe — mature; broad adoption; multi-region.
- Chargebee — subscription-focused; rich seat/pack/usage model.
- Paddle — merchant-of-record; handles VAT / tax compliance.
- Other custom / regional providers.

Provider selection is its own bounded ADR + RULE 21 research arc. **Do not select a provider in this ADR.** The runtime `Entitlement` model and `EntitlementService` design at §2.3 / §2.4 are provider-agnostic.

### 2.6 Free / trial / pilot posture (forward-substrate)

Founder may authorize:

- **Free internal NIOV tenant** for Founder + operator + dogfood use.
- **Pilot / trial** at reduced base + limited duration for first customers.
- **Design partner discount** at custom terms for select early customers.

All free / trial / pilot tenants preserve the universal billing governance posture at §2.2 — security + audit + compliance never weakened. Free tier does NOT mean weak governance.

---

## 3. Non-goals

This ADR does **not**:

- Choose a payment provider.
- Implement the `Entitlement` Prisma model.
- Implement `EntitlementService.assertEntitled()`.
- Add `/billing/*` routes.
- Add a Control Tower billing UI.
- Integrate Stripe / Chargebee / Paddle.
- Define per-seat USD pricing (only structure + base price; per-seat / per-pack USD locked in a subsequent ADR + Founder pricing decision).
- Define metering implementation.
- Add tax / VAT handling.
- Add invoice generation.
- Add proration / refund logic.
- Add discount / coupon logic.
- Modify any existing Foundation service.
- Add new audit literals.
- Add LLM / Python / BEAM.

---

## 4. Implementation ladder

| Slice | Scope | Gating |
|-------|-------|--------|
| **B1** (this ADR) | Base + add-on structure + billing governance posture + future runtime model shape + enforcement points + non-goals | This Founder authorization |
| **B2** | Pricing decision (per-seat USD / per-pack USD / per-usage USD) | Founder pricing decision required (NOT autonomous) |
| **B3** | Payment provider selection ADR | Founder + RULE 21 research arc |
| **B4** | `Entitlement` Prisma model + migration per ADR-0025 | Separate Founder authorization |
| **B5** | `EntitlementService.assertEntitled()` substrate; enforcement points wired at §2.4 surfaces | Separate Founder authorization |
| **B6** | Payment provider integration; webhook handling; subscription state machine | Separate Founder authorization + RULE 21 research arc on provider |
| **B7** | CT billing UI (subscription summary + seat management + pack management + usage dashboard) | Separate Founder authorization |
| **B8** | Enterprise contracting workflow + custom retention overrides + regulated deployment per ADR-0018 | Separate Founder authorization |

Each slice is bounded + separately authorized. **Do not implement B2+ automatically.**

---

## 5. Governance posture (universal across all billing states)

Restated from §2.2 for completeness:

1. **Entitlements gate features, NOT audit / evidence.**
2. **Billing never destroys audit or evidence.**
3. **Non-payment disables new premium actions, never deletes retained records.**
4. **Downgrades preserve historical audit.**
5. **Security / governance features never unsafe-paywalled** — Foundation security baseline is at the base tier.
6. **Compliance retention always intact** regardless of billing state.
7. **DMW auto-provisioning + base scope discipline** always at base tier.
8. **Same-org boundary + cross-tenant isolation** never weakened.
9. **Regulator-ready posture** preserved at every tier (per ADR-0070).
10. **Audit chain integrity verification** available at base tier.

These are non-negotiable. Any future ADR that proposes weakening them requires Founder authorization per RULE 20.

---

## 6. CT `/billing` page disposition

The Control Tower currently has no `/billing` page. Disposition:

- **At B1 (this ADR)**: no CT changes.
- **At B5 (entitlement substrate LIVE)**: CT `/billing` Placeholder OR direct-to-Settings link.
- **At B7 (CT billing UI)**: CT `/billing` becomes the subscription dashboard:
  - Subscription state (ACTIVE / GRACE / SUSPENDED).
  - Seat usage + available seats.
  - Capability pack state + activation toggles (admin-gated).
  - Usage meter state + period.
  - Payment method (provider-integrated).
  - Invoice history.
  - Downgrade / upgrade actions (admin-gated; dual-control where required).

The CT page is a **visibility + governance** surface. It does not bypass approval chains, dual-control, or audit.

---

## 7. Citations

- **RULE 0** (humans always sovereign)
- **RULE 1** (build forward only)
- **RULE 4** (audit before response — audit chain integrity never paywalled)
- **RULE 10** (nothing is ever deleted — billing-driven downgrade preserves rows via soft-delete + audit chain)
- **RULE 13** (surface drifts inline — security / governance never unsafe-paywalled flagged inline)
- **RULE 20** (rule-modification authority — billing governance posture (§2.2 / §5) is RULE 20-protected)
- **RULE 21** (pre-authorization research arc — B3 provider selection + B6 integration require research)
- **ADR-0001** (three-wallet architecture)
- **ADR-0002** (append-only audit chain — billing never destroys)
- **ADR-0008** (EntityComplianceProfile is org-level — entitlements are org-tier; never aggregated across orgs)
- **ADR-0024** (pre-commit hook posture — payment provider `secret_ref` env-var-NAME pattern preserved at B6)
- **ADR-0025** (Schema-Push-Target Discipline — B4 migration goes through deploy pipeline)
- **ADR-0026** (dual-control middleware — high-risk billing actions (downgrade past compliance retention threshold; enterprise contract amendments) require dual-control)
- **ADR-0027** (governance + RULE 20)
- **ADR-0033** (cross-language data ownership — TypeScript-Prisma canonical store; payment provider data scoped per ADR-0019 secret discipline)
- **ADR-0036** (REGULATOR principal + LawfulBasis — Regulator Pack composes against this)
- **ADR-0050** (break-glass time-boxed audit — never standing for billing)
- **ADR-0052** (Otzar DGI — billing tiers map to Domain General Intelligence capability surfaces)
- **ADR-0057** (autonomous execution core — usage meter for INVOKE_CONNECTOR per ActionType)
- **ADR-0070** (regulator-ready Foundation doctrine — neutral compliance vocabulary at every billing tier)
- **ADR-0071** (cross-scope verify-chain — Advanced Audit / Compliance Pack composes against this)
- **ADR-0076** (multi-agent simulation orchestration — Agent Playground Pack composes against this)
- **ADR-0078** + **ADR-0079** (conversation context / transcript policy)
- **ADR-0080** + **Amendment 5** (OOTB ontology + Domain General Otzar product framing + Otzar Administrator first-class + Admin Twin as first DGI champion)
- **ADR-0081** (Workflows Doctrine — Workflow Automation Pack composes against Stage 3+)
- **ADR-0082** (Dandelion Activation Architecture — Dandelion Activation Pack composes against Stages B-F)
- Patent **US 12,517,919** (COSMP) · **US 12,164,537** + **US 12,399,904** (DMW + Foundation primitives)

---

## 8. Founder authorization

This ADR is authorized under `[FOUNDER-DOMAIN-GENERAL-OTZAR-ACTIVATION-EXPANSION-AUTH]` step 4 (Section 8 Billing / Entitlements ADR using $250 base + add-ons).

Subsequent slices (B2-B8) require their own Founder authorization at slice. **Do not implement B2+ automatically.** Per-seat / per-pack USD pricing requires explicit Founder pricing decision.

After this ADR lands, the recommended next autonomous slice is **ADR-0084 Section 4 MCP / Connector Strategy ADR** (design-only; broader plan covering Slack + Google Workspace + Project Tracker + Gmail / Outlook + GitHub + Salesforce / HubSpot + Travel / Expense per Wave 6 matrix; first connector candidate arc; per-connector RULE 21 research arc gating).
