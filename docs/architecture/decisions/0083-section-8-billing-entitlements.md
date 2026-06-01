# ADR-0083 — Section 8 Billing / Entitlements (Design-Only)

**Status:** Accepted 2026-06-01 · **Amendment 1** Accepted 2026-06-01 (billing expansion + Professional Twin tier + 8 connector pack families + 4 plan archetypes + Billing Admin role + 8 conceptual entitlement objects + DMW-included reinforcement + revised B1-B8 ladder; see §9)
**Nature:** Design-only. No code. No schema. No migration. No routes. No services. No runtime activation. No Control Tower billing UI. No payment provider integration. No payment data persistence. No LLM / Python / BEAM. No new audit literal. **No financial integration assumptions beyond what this ADR explicitly locks**; provider selection (Stripe / Chargebee / Paddle / etc.) is deferred to its own bounded slice under separate Founder authorization.
**Founder authorization:** `[FOUNDER-DOMAIN-GENERAL-OTZAR-ACTIVATION-EXPANSION-AUTH]` step 4 ("Section 8 Billing / Entitlements ADR using $250 base + add-ons") + `[FOUNDER-SECTION-8-BILLING-ENTITLEMENTS-ADR-AUTH]` (Amendment 1 substantive expansion) + `[FOUNDER-RESUME-AUTONOMOUS-BUILD-FROM-SAFE-HOLD-AUTH]` (resume + reconfirm).
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

---

## 9. Amendment 1 — Billing Expansion + Professional Twin Tier + Connector Pack Families + Plan Archetypes + Billing Admin Role + Conceptual Entitlement Objects + DMW-Included Reinforcement (2026-06-01)

**Authority:** `[FOUNDER-SECTION-8-BILLING-ENTITLEMENTS-ADR-AUTH]` + `[FOUNDER-RESUME-AUTONOMOUS-BUILD-FROM-SAFE-HOLD-AUTH]`.

### 9.0 Substrate-state drift acknowledgment (RULE 13)

The Founder authorization for this amendment references HEAD `f5902fa` (Wave 2.1 closeout) and asks for an ADR-0081 number. Between that drafting moment and this amendment landing, ADR-0081 (Workflows Doctrine), ADR-0082 (Dandelion Activation Architecture), and ADR-0083 (Section 8 Billing/Entitlements base) all merged on `main`. ADR-0081 / ADR-0082 numbers are taken; ADR-0083 is the Section 8 Billing ADR. The new content lands here as **Amendment 1 to ADR-0083** (RULE 13 surface drifts inline + ADR numbering stability discipline preserved). All new Founder substance is absorbed verbatim below.

### 9.1 DMW pricing doctrine reinforcement (canonical lines preserved verbatim)

Per `[FOUNDER-SECTION-8-BILLING-ENTITLEMENTS-ADR-AUTH]`:

- *"Billing is not just payment. Billing is the entitlement layer that controls how Otzar's governed intelligence capabilities scale across an enterprise."*
- *"The DMW is not a luxury add-on. The Memory Wallet is foundational trust infrastructure."*
- *"Customers should not pay extra just to have memory be safe."*
- *"Base Otzar must include enough DMW capability for every Digital Twin to remember safely."*
- *"Advanced memory governance can be premium; basic memory safety cannot."*
- *"Billing says what the organization has purchased. Governance says what the system may safely do."*
- *"Billing may entitle a connector pack; governance still authorizes connector activation."*
- *"Downgrades may disable new premium actions, but they must never delete audit history, violate retention, or break evidence integrity."*

These 8 canonical lines are preserved verbatim across §9 of this ADR and the new `docs/current-build-state/08-billing-entitlements.md` build-state document.

### 9.2 Baseline DMW capability locked at base tier

The $250/month base tier **includes** the following DMW capabilities (no separate fee; no crypto setup burden):

- Automatic DMW / Memory Wallet auto-provisioned per user / entity (when DMW runtime lands).
- Basic self-scoped memory.
- Basic team / project / action-scoped memory support where authorized.
- Basic forgetting / disconnect posture.
- Basic audit / provenance metadata.
- Basic safe memory education.
- Basic DMW governance metadata visibility for admins (NOT private user memory content).
- No separate "wallet fee" that blocks adoption.

**Premium DMW** (via DMW / Memory Governance Pack) layers on:

- Advanced retention policies.
- Legal / compliance memory scopes.
- Regulator / evidence memory controls.
- High-volume memory capsule storage.
- Long-term archival memory.
- Advanced memory analytics.
- Cross-workflow memory governance.
- Custom memory retention windows.
- Dedicated memory governance reports.
- Advanced selective forgetting workflows.
- Advanced depersonalized telemetry governance.

The base ADR §2.2 rule "DMW auto-provisioning + base scope discipline" is reinforced here as **non-negotiable**: any future ADR weakening DMW base-tier inclusion requires Founder authorization per RULE 20.

### 9.3 Seat tier expansion — NEW Professional Twin tier (6 tiers total)

The base ADR §2.1 listed 5 seat add-ons. Amendment 1 inserts the **Professional Digital Twin Seat** between Standard and Executive per Founder direction, yielding **6 seat tiers**.

Suggested **internal** USD ranges (architectural recommendations; NOT public pricing; final per-seat USD requires Founder pricing decision at B2):

| Tier | Internal range | Intended for | Includes (selected) |
|------|---------------|--------------|---------------------|
| **Standard Digital Twin** | `$25 – $49 / user / month` | General employees · ICs · basic team members | Role-aware Twin starter profile (when runtime lands) · self-scoped memory · basic workflows · basic Dandelion role mapping · read-only context where authorized · meeting/work summary assistance · personal workday brief · open commitments · basic project blocker support |
| **Professional Digital Twin** (NEW) | `$75 – $125 / user / month` | Managers · PMs · Sales/CS/HR/Finance/Ops roles · role owners with cross-functional workflows | Team / project context · advanced role templates · workflow recommendations · approval-aware actions · cross-functional coordination · richer DMW scopes · more connector read surfaces · proposed action support where authorized |
| **Executive / High-Authority Twin** | `$150 – $300 / user / month` | CEO · Founder · COO · CFO · CTO · CMO · CHRO · GC · senior executives | Executive briefs · board / investor packet support · high-sensitivity governance · delegated authority controls · cross-company insight · stronger DMW memory boundaries · executive commitment tracking · risk / decision brief support · stronger audit requirements |
| **Otzar Administrator** | `$99 – $199 / admin / month` | Otzar Admin · Governance Admin · AI Operations Admin · Enterprise AI Admin | Admin Twin · Dandelion rollout planning · Company Intelligence Readiness Brief · connector risk review · role / template review queue · policy gap finder · approval-chain builder · memory-scope safety brief · audit health brief · onboarding progress · first 7-day launch plan · governance launch guidance |
| **Board / Observer** | `$49 – $149 / user / month` | Board members · investor observers · committee members · external governance observers | Read-only board packet summaries · KPI / risk briefs · committee evidence packs · NO operational write access · purpose-bound DMW / audit scopes · strict access controls |
| **External Collaborator / Limited** | (custom per engagement) | Auditor · vendor · counterparty under NDA + scope envelope | Read-only by default · per-collaborator audit · scoped envelope per engagement contract |

Canonical line preserved per Founder direction:
> *"The Otzar Admin seat is not a settings seat. It is the first Domain General Intelligence champion seat."*

### 9.4 Connector packs subdivided by tool family (8 packs replace single Connector Pack)

The base ADR §2.1 listed a single "Connector Pack." Amendment 1 subdivides it into **8 tool-family packs** per Founder direction. Customers can adopt packs as value becomes visible — no forced bundle.

| Pack | Tools included | Notes |
|------|---------------|-------|
| **Collaboration Pack** | Slack · Microsoft Teams · Gmail · Outlook · Google Calendar · Outlook Calendar · basic Drive / Docs / M365 read surfaces | Highest adoption value per Wave 6 matrix (Slack 16.00; Google Workspace 13.33). |
| **Workspace / Knowledge Pack** | Google Drive · Google Docs / Sheets / Slides · Microsoft 365 · SharePoint · OneDrive · Notion · Confluence | Document substrate for EA + executive workflows. |
| **Project / Engineering Pack** | Jira · Linear · Asana · Monday · GitHub · GitLab | Engineering + PM core (Wave 6 matrix Project Tracker 12.75; GitHub 10.00). |
| **Revenue Pack** | Salesforce · HubSpot · Gong · Outreach · Salesloft | Sales + CRM (Wave 6 CRM 9.75). |
| **Customer Pack** | Zendesk · Intercom · Gainsight · ChurnZero · Freshdesk | Customer success + support (Wave 6 Support 6.63). |
| **People Pack** | Workday · BambooHR · Rippling · Greenhouse · Lever · Lattice · Culture Amp · ADP · Gusto | HRIS + ATS (Wave 6 HRIS 6.30, ATS 5.75). |
| **Finance / Expense / Travel Pack** | SAP Concur · Ramp · Brex · Expensify · Navan / TripActions · TravelPerk · NetSuite · QuickBooks · Bill.com · Coupa · Airbase | EA + Finance canonical (Wave 6 Travel+Expense 8.75; Finance ERP 6.00). |
| **Legal / Compliance Pack** | DocuSign · Ironclad · LinkSquares · Evisort · Vanta · Drata · OneTrust · Secureframe | Legal contracts + compliance evidence (Wave 6 Legal 6.63; Compliance 6.31). |

Universal connector pack principles (preserved + reinforced):

- Read-first by default.
- Write actions disabled by default.
- Write actions require approval (per ADR-0026 / per ADR-0081 Stage 3).
- Risky writes may require dual-control.
- All connector activity audited (existing `ADMIN_ACTION` + `INVOKE_CONNECTOR` lineage; no new audit literal).
- No connector payload leaks.
- No secrets exposed (`secret_ref` env-var-NAME pattern per ADR-0024).
- **Billing entitlement ≠ connector activation.** Entitlement allows availability; governance authorizes actual use.

Canonical line preserved verbatim:
> *"Billing may entitle a connector pack; governance still authorizes connector activation."*

### 9.5 Plan archetypes (4 archetypes; NEW)

Internal plan archetypes for sales / packaging discussion. **NOT public final pricing**:

| Archetype | Base | Includes | Purpose |
|-----------|------|----------|---------|
| **Starter / Pilot** | $250 base | Limited seats · Dandelion preview / basic activation · limited audit · NO advanced connector writes · limited workflow recommendations · baseline DMW included | Low-friction adoption + champion creation. |
| **Team** | $250 base + seats | Standard / Professional Twin seats · Collaboration Connector Pack · basic workflow recommendations · basic DMW · basic audit | Small department deployment. |
| **Business** | (negotiated) | More seats · Admin Twin · Dandelion Activation Pack · multiple Connector Packs · Agent Playground · advanced audit · workflow recommendations + proposed actions · DMW governance baseline + some premium controls | Mid-sized enterprise. |
| **Enterprise** | Custom annual | Executive seats · Board seats · advanced DMW governance · Regulator / Evidence Pack · custom connectors · SSO / SAML / SCIM · custom retention · premium support · SLA | Large enterprise + regulated. |

These archetypes compose against the seat tiers (§9.3) + capability packs (§9.4 + base ADR §2.1) + usage add-ons (base ADR §2.1) — they are not new SKUs, they are pre-bundled compositions.

### 9.6 Billing Admin role (NEW)

The Billing Admin is a distinct Otzar Admin role with bounded permissions. Per Founder direction:

**Billing Admin CAN**:

- View plan + subscription state.
- View invoices + payment history.
- Manage seats (assign / revoke within seat entitlement).
- Manage capability pack add-ons (request / cancel).
- See usage meter state.
- Manage billing + invoice contacts.
- Request upgrades / downgrades (subject to dual-control for high-risk downgrades).
- Review entitlement warnings + grace-period alerts.

**Billing Admin CANNOT (by default)**:

- Read private user memory.
- See sensitive workflow payloads.
- Access connector secrets (`secret_ref` env-var-NAME visible; payload absolute forbidden).
- Bypass policies (per ADR-0008 / Section 9 Policies).
- Approve high-risk workflows (per ADR-0081 Stage 3+ approval chains).
- Export audit logs unless separately authorized via Advanced Audit / Compliance Pack + dual-control.

The Billing Admin maps to an Otzar Administrator seat (per §9.3) with a Billing-scoped PermissionBundle (per ADR-0080). The Admin Twin (per ADR-0080 Amendment 5 §21.3) does **not** automatically gain Billing Admin authority — Billing Admin is a distinct sub-role assigned per company policy.

### 9.7 Conceptual entitlement objects (8 NEW objects)

The base ADR §2.3 listed a single `Entitlement` runtime model shape. Amendment 1 expands this into **8 conceptual entitlement objects** per Founder direction. These are design-only shapes; NOT implemented at this ADR.

#### 9.7.1 `BillingAccount`

| Field | Purpose |
|-------|---------|
| `billing_account_id` | Stable identifier |
| `org_id` | Tenant boundary |
| `billing_status` | ACTIVE / GRACE / SUSPENDED / CANCELLED |
| `plan_id` | Reference to Plan |
| `payment_provider` | Provider identifier (deferred per base ADR §2.5) |
| `billing_contact` | Per-org contact entity |
| `invoice_contact` | Per-org invoice entity |
| `tax_region` | Jurisdiction for tax / VAT |
| `contract_type` | MONTHLY / ANNUAL / ENTERPRISE_CUSTOM |
| `renewal_date` | Per contract |
| `grace_period_status` | NONE / IN_GRACE / GRACE_EXPIRED |

#### 9.7.2 `Plan`

| Field | Purpose |
|-------|---------|
| `plan_id` | Stable identifier |
| `name` | Plan archetype (Starter / Team / Business / Enterprise) per §9.5 |
| `base_price` | $250 default (or volume-discounted enterprise) |
| `included_seats` | Per archetype |
| `included_packs` | Per archetype |
| `included_usage` | Per archetype usage allowances |
| `support_level` | Standard / Premium / Dedicated |
| `deployment_model` | Shared / Sovereign / On-premise / Air-gapped per ADR-0018 |

#### 9.7.3 `SeatEntitlement`

| Field | Purpose |
|-------|---------|
| `seat_entitlement_id` | Stable identifier |
| `org_id` | Tenant boundary |
| `entity_id` | The entity holding the seat |
| `seat_type` | One of the 6 tiers per §9.3 |
| `status` | ACTIVE / SUSPENDED / GRACE / REVOKED |
| `starts_at` | Seat start timestamp |
| `ends_at` | Seat end (per contract) |
| `assigned_by` | Billing Admin or Otzar Admin entity_id |
| `billing_state` | PAID / GRACE / UNPAID |
| `governance_state` | Governance-eligibility independent of billing |

#### 9.7.4 `CapabilityPackEntitlement`

| Field | Purpose |
|-------|---------|
| `pack_entitlement_id` | Stable identifier |
| `org_id` | Tenant boundary |
| `pack_type` | One of the 9 packs (Dandelion Activation / Workflow Automation / etc.) or one of the 8 connector pack families per §9.4 |
| `status` | ACTIVE / SUSPENDED / GRACE / CANCELLED |
| `included_features` | Feature key set unlocked |
| `usage_limits` | Per pack usage allowance |
| `activation_requirements` | Governance gates required before pack features become usable |
| `governance_requirements` | Foundation governance compose gates |

#### 9.7.5 `FeatureEntitlement`

| Field | Purpose |
|-------|---------|
| `feature_key` | Closed-vocab feature identifier (e.g., `DANDELION_STAGE_B`, `CONNECTOR_SLACK`, `WORKFLOW_STAGE_3`) |
| `org_id` | Tenant boundary |
| `enabled` | Billing tier currently permits |
| `source_plan` | Plan / Pack that enables this feature |
| `required_governance_state` | Foundation governance state required (admin approval / dual-control / lawful basis) |
| `required_policy_state` | Per ADR-0008 policy state required |
| `required_admin_capability` | Specific admin capability gate |

#### 9.7.6 `UsageMeter`

| Field | Purpose |
|-------|---------|
| `meter_id` | Stable identifier |
| `org_id` | Tenant boundary |
| `meter_type` | Closed-vocab meter (per §9.8) |
| `period_start` | Billing period start |
| `period_end` | Billing period end |
| `included_quantity` | Plan-included allowance |
| `consumed_quantity` | Actual usage in period |
| `overage_quantity` | Above-allowance usage |
| `enforcement_mode` | SOFT_WARN / HARD_BLOCK / OVERAGE_BILLED |

#### 9.7.7 `EntitlementCheck`

| Field | Purpose |
|-------|---------|
| `org_id` | Tenant boundary |
| `entity_id` | Subject of the check |
| `feature_key` | What's being checked |
| `requested_action` | Action triggering the check |
| `billing_allowed` | Billing tier permits |
| `governance_allowed` | Foundation governance permits |
| `policy_allowed` | Policy state permits |
| `final_decision` | ALLOWED / DENIED_BILLING / DENIED_GOVERNANCE / DENIED_POLICY |
| `reason` | Closed-vocab denial reason for audit lineage |

The `EntitlementCheck` is the canonical fan-in object where Billing × Governance × Policy intersect. The base ADR §2.4 enforcement points all consume this shape.

#### 9.7.8 `DowngradePolicy`

| Field | Purpose |
|-------|---------|
| `plan_from` | Current plan |
| `plan_to` | Target plan |
| `disabled_new_capabilities` | Capability set that becomes unavailable for NEW actions |
| `preserved_records` | Record types preserved (audit / evidence / capsules) |
| `retained_audit` | Audit chain retention (always intact per base ADR §2.2) |
| `retained_memory_policy` | DMW retention preserved per existing scope |
| `export_window` | Grace window for the customer to export retained data |
| `grace_period` | Per company policy |

The `DowngradePolicy` enforces the canonical "downgrades never destroy" posture from base ADR §2.2.4.

### 9.8 Usage meter expansion (12 meters)

Expanding base ADR §2.1's 6 usage add-ons to **12 canonical meters** per Founder direction:

1. Active Digital Twin seats (counter).
2. Active Admin seats (counter).
3. Active Board / Observer seats (counter).
4. Dandelion activation runs (per ADR-0082 Stage B–F invocation).
5. Workflow recommendations (per ADR-0081 Stage 2).
6. Workflow runs (per ADR-0081 Stage 3+).
7. Proposed Actions (per ADR-0057).
8. Approved connector actions (per `INVOKE_CONNECTOR`).
9. Connector read events (per pack-level read activity).
10. Connector write events (per approval-gated write).
11. Simulation runs (per ADR-0076 Wave 9).
12. Audit exports + evidence package generation + memory capsule volume + advanced DMW governance events (composite meter group; period-bounded; overage billed).

Pricing principle preserved: predictable base + included allowances + transparent overages + enterprise caps where needed.

### 9.9 Connector entitlement stages (1–7)

Per Founder direction. Connector adoption flows through 7 stages; billing entitles availability at Stage 2; governance composes through Stages 3–7.

1. **Discover / recommend connector** (Dandelion L4 + Wave 6 priority matrix; no billing required).
2. **Entitlement check** (Connector Pack must be entitled per `CapabilityPackEntitlement`).
3. **Admin policy approval** (Otzar Admin reviews per Section 9 Policies).
4. **OAuth / security setup** (per ADR-0024 `secret_ref` env-var-NAME pattern; per-tenant secret rotation).
5. **Read-first activation** (connector preset's `read_capabilities` enabled; writes still disabled).
6. **Workflow-specific use** (per ADR-0081 Stage 2+ workflows compose against the connector).
7. **Write actions only with approval gates** (per ADR-0081 Stage 3+; dual-control per ADR-0026 where required).

### 9.10 Workflow billing maturity mapping

Per ADR-0081's 5 workflow maturity stages. Amendment 1 maps each stage to billing posture:

| Workflow stage | Billing posture | Notes |
|----------------|-----------------|-------|
| Stage 1 Template-only | Base tier; no add-on | Wave 2 + Wave 2.1 LIVE; catalog browse only |
| Stage 2 Recommendation-only | Base tier OR Dandelion Activation Pack | Suggest-only; no automation |
| Stage 3 Proposed Action | Workflow Automation Pack required | ADR-0057 Action runtime composition |
| Stage 4 Governed Execution | Workflow Automation Pack + connector pack(s) + per-connector RULE 21 research arc | Connector writes gated per §9.9 stages 6-7 |
| Stage 5 Continuous Optimization | Workflow Automation Pack + advanced governance | ADR-0048 personalization substrate |

Canonical line preserved verbatim:
> *"Do not make full automation default."*

Workflow Automation Pack unlocks **higher workflow run volume + advanced governed action orchestration** — never unapproved autonomy.

### 9.11 Revised B1-B8 implementation ladder (per Founder direction)

The base ADR §4 implementation ladder is **superseded** by this revised ladder per Founder direction, which front-loads static catalogs + CT read-only preview before runtime + payment provider:

| Slice | Scope | Gating |
|-------|-------|--------|
| **B1 — this ADR + Amendment 1** | Doctrine + 6 seat tiers + 9 capability packs (8 connector pack families) + 4 plan archetypes + Billing Admin role + 8 conceptual entitlement objects + 12 usage meters + 10 non-negotiable billing governance posture rules | This Founder authorization |
| **B2 — Static entitlement catalog** | JSON / Markdown plan + pack + seat-tier catalog at `docs/billing/catalog/` mirroring the OOTB catalog structure; no runtime enforcement | Separate Founder authorization at slice |
| **B3 — CT billing preview** | Read-only `/billing` (or `/onboarding` extension) showing plan + pack + seat-tier catalog; no payment provider; no live mutation | Separate Founder authorization at slice |
| **B4 — Internal entitlement model** | `Entitlement` Prisma model per §9.7 + migration per ADR-0025; feature gates in read-only safe mode | Separate Founder authorization at slice + Founder pricing decision |
| **B5 — Billing admin surface** | Billing Admin role + permissions per §9.6; CT subscription dashboard with seat / pack management; manual billing status | Separate Founder authorization at slice |
| **B6 — Usage meter foundation** | Usage counters per §9.8; no external overage billing yet | Separate Founder authorization at slice |
| **B7 — Payment provider integration** | Stripe / Chargebee / Paddle / manual invoice decision + integration | Separate Founder authorization at slice + RULE 21 research arc on provider |
| **B8 — Enterprise billing operations** | Annual contracts · custom retention overrides · SLAs · audit / export guarantees · regulated deployment per ADR-0018 | Separate Founder authorization at slice |

Each slice is bounded + separately authorized. **Do not implement B2+ automatically.**

### 9.12 Strengthened "what cannot be unsafely paywalled" (13 items; expands base ADR §2.2)

Base ADR §2.2 listed 10 non-negotiable rules. Amendment 1 expands the list of features that **must remain available regardless of plan / payment state** per Founder direction (13 items):

1. Access to historical audit records required for compliance.
2. Retention of legally required records.
3. Audit chain integrity verification (`verify-chain`).
4. Basic DMW memory-safety behavior (per §9.2).
5. Basic security controls (dual-control / break-glass / rate-limit / no-leak / no-console / boot validation).
6. User offboarding safety.
7. Ability to disconnect / revoke connectors (admin can disable risky automation regardless of billing state).
8. Ability to export required compliance / audit data during grace / legal window.
9. Ability to disable risky automations / connectors.
10. Ability to preserve data boundaries (same-org / cross-tenant absolute).
11. Regulator-ready posture (per ADR-0070 neutral compliance vocabulary).
12. DMW auto-provisioning + base scope discipline.
13. Foundation governance posture (Approvals + Policies + Security Audit Viewer at read tier).

The base ADR §2.2 10-rule list is preserved; this 13-item list is the customer-facing operationalization.

### 9.13 Upgrade / downgrade / cancellation safety (canonical behaviors)

Per Founder direction.

**Upgrade**:
- Unlocks availability.
- Still requires governance.
- May increase usage allowances.
- May allow more connector packs.
- May enable additional workflow stages.
- Existing scopes preserved.

**Downgrade**:
- Preserve audit (RULE 4 + ADR-0002 absolute).
- Preserve required retention (per company policy + regulated industry baseline).
- Preserve DMW safety (memory scopes preserved per existing envelope).
- Preserve historical evidence (per ADR-0036 retained packages).
- Disable new premium actions (new ADR-0081 Stage 3+ workflow runs / new connector writes / new high-volume simulations).
- Disable future high-volume activity (overage prospective only).
- Keep admin able to export / resolve obligations (export window per `DowngradePolicy`).
- Do not orphan active governance records.
- Do not delete memory capsules unexpectedly (RULE 10 absolute).

**Cancellation**:
- Retain records per policy / legal obligations.
- Allow export window.
- Disable new actions.
- Disconnect connectors safely (existing approved actions in flight complete; new write actions disabled).
- Preserve audit chain where required.
- Apply deletion / retention policy after lawful window per `DowngradePolicy` + ADR-0002 + ADR-0079 §14.

### 9.14 Section mapping (Billing × 10 sections)

Per Founder direction. Maps Billing to all 10 Otzar sections:

| § | Section | Billing interaction |
|---|---------|---------------------|
| 1 | Employee Intelligence Core | Seat tier controls Twin availability + memory scope level |
| 2 | Autonomous Execution Core | Entitlements gate ADR-0081 Stage 3+ proposed / governed execution volume |
| 3 | Hives / Team Intelligence | Department / team scale may map to packs |
| 4 | MCP / Connectors | Connector packs entitle availability; governance authorizes activation (per §9.4 + §9.9) |
| 5 | Agent Playground | Simulation pack + usage allowance |
| 6 | Enterprise Analytics | Analytics pack + aggregate insight tier |
| 7 | Full Audit Viewer | Baseline audit included; advanced compliance / evidence premium |
| 8 | **Billing / Entitlements** | **This ADR (base + Amendment 1) defines** |
| 9 | Admin / Governance Control Tower | Billing Admin role per §9.6; entitlement views; plan / usage / add-on management |
| 10 | Deployment / Security / Go-Live | Enterprise contracts · SSO · support · retention · deployment model per ADR-0018 |

### 9.15 Adoption + monetization principles

Per Founder direction:

- Free / included DMW drives trust + usage.
- Advanced DMW creates enterprise monetization.
- DMW is priced into platform / seats / packs — **never** sold as confusing wallet fee.
- Dandelion should help customer see value map; billing unlocks deeper activation, not blocks understanding.
- Billing should help adoption, not create fear that safe governance costs extra.
- Dandelion drives activation; billing helps companies expand activation as value becomes visible.

Canonical:
> *"Entitlements should gate premium capability, not destroy trust."*

> *"Customers should not pay extra just to have memory be safe."*

> *"Billing should help adoption, not create fear that safe governance costs extra."*

### 9.16 Amendment 1 does NOT change

The following remain locked from base ADR-0083:

- §2.2 the 10 non-negotiable billing governance posture rules (Amendment 1 §9.12 expands to 13 customer-facing operationalizations; the 10 rules are preserved verbatim).
- §3 non-goals (NO code / NO schema / NO payment provider integration / etc.).
- §5 universal governance posture across all billing states.
- §6 CT `/billing` page disposition (Placeholder until B5 entitlement substrate LIVE).
- §7 citations.
- §8 Founder authorization (extended; not replaced).

### 9.17 Forward substrate (queued)

After Amendment 1 lands:

1. **B2 — Static entitlement catalog** (queued; bounded; eligible for autonomous build if Founder confirms).
2. **B3 — CT billing preview** (queued; bounded; eligible for autonomous build after B2).
3. **B4 — Internal entitlement model** (Founder pricing decision required — per-seat / per-pack USD).
4. **B7 — Payment provider integration** (RULE 21 research arc + Founder provider decision).

Per the Founder resume directive, the recommended **next autonomous slice** after Amendment 1 lands is **ADR-0084 Section 4 MCP / Connector Strategy** (design-only; covers Slack + Google Workspace + Project Tracker + Gmail / Outlook + GitHub + Salesforce / HubSpot + Travel / Expense per Wave 6 matrix; first-connector candidate arc; per-connector RULE 21 research arc gating).

### 9.18 B2 Static Entitlement Catalog LANDED 2026-06-01

Per `[FOUNDER-SECTION-8-B2-STATIC-ENTITLEMENT-CATALOG-AUTH]`. NEW `docs/entitlement-catalog/` directory containing 10 files / 93 catalog items: 4 plan templates (Starter/Pilot + Team + Business + Enterprise; every plan `DMW_baseline_included=true`; $250 base anchored in Starter/Pilot + Team) + 6 seat tiers (Standard + Professional + Executive + Otzar Administrator + Board/Observer + External Collaborator with suggested internal USD ranges) + 9 capability packs (Dandelion Activation + Workflow Automation + Advanced Audit/Compliance + DMW/Memory Governance + Agent Playground/Simulation + Enterprise Analytics + Regulator/Evidence + Premium Support/Onboarding + Collaboration Pack candidate) + 8 connector pack families (Collaboration + Workspace/Knowledge + Project/Engineering + Revenue + Customer + People + Finance/Expense/Travel + Legal/Compliance — exact ADR-0083 Amendment 1 §9.4 mapping) + 16 usage meter templates (deferred runtime to B3+) + 18 governance rules + 13 non-paywallable safety rules + 1 Billing Admin permission profile + 5 downgrade policy templates + 13 enterprise add-ons. NEW `scripts/validate-entitlement-catalog.mjs` validator (pure Node ESM; no deps; mirrors `validate-ootb-catalog.mjs` pattern with sentence-level negation detection + negation-item subtree skip): JSON parse + 10 required files + required wrappers + universal field presence + ID uniqueness + ADR-0083 source ref on every item + DMW_baseline_included on every plan + every seat + $250 base presence + required seat/pack/family/meter/non-paywallable IDs + 11 forbidden phrases + canonical phrase ("Customers should not pay extra just to have memory be safe.") in README. Validator green: 10/10 files, 93 items, 0 errors. NO Prisma schema, NO migration, NO runtime billing, NO payment provider integration, NO entitlement enforcement, NO feature gating, NO Control Tower UI, NO connector code, NO Dandelion runtime, NO workflow runtime, NO DMW runtime, NO BEAM/Python/Elixir, NO new audit literal, NO mutation to existing `apps/api/src/services/monetization/monetization.service.ts` (preserved per ADR-0021 additive discipline). B2 closes ADR-0083 + Amendment 1 doctrine-to-catalog stage at the **canonical-knowledge register**; runtime substrate B3-B8 remains Founder-decision-gated.
