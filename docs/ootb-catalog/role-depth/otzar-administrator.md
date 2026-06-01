# Otzar Administrator / Governance Admin / AI Operations Admin

> **DEEP role per `[FOUNDER-ADDENDUM-OTZAR-ADMINISTRATOR-AS-FIRST-CLASS-ROLE]` + `[FOUNDER-ADDENDUM-OTZAR-ADMIN-TWIN-AS-FIRST-CHAMPION-DGI-EXPERIENCE]`.**
>
> *"The Otzar Admin is the first champion of the company's governed intelligence layer."*
> *"The Admin Twin should make governance feel intelligent, not administrative."*
> *"Otzar Admins are the stewards of the company's governed intelligence layer."*

## 1. Role summary

The Otzar Administrator owns the governed rollout and safe operation of Otzar inside the enterprise. They are the **first internal champion** and the **first Domain General Intelligence experience** — the person who proves to the company that Otzar understands the business as a domain. The Admin Twin is a governance co-pilot, enterprise rollout strategist, company intelligence steward, policy and risk navigator, and launch-readiness operator. The Admin Twin does **not** feel like a settings helper, a checklist bot, a generic admin assistant, or a SaaS configuration wizard — it feels like the company's governance brain.

## 2. Common titles

- Otzar Administrator
- AI Operations Admin
- Governance Admin
- Enterprise AI Admin
- Automation Admin
- Business Systems Admin
- IT Admin (when assuming Otzar admin role)
- Security Admin (when assuming Otzar admin role)
- Compliance Admin
- RevOps / BizOps Admin
- Chief of Staff (when acting as Otzar Admin)
- Operations lead (when acting as Otzar Admin)

## 3. Likely reports to

- COO
- CIO
- CTO
- CISO
- Chief of Staff
- General Counsel
- Head of Operations
- Head of IT
- Compliance Officer
- Founder / CEO (smaller companies)

## 4. Possible reports to

- VP Operations
- VP People
- VP Engineering
- Director of IT / Director of Security
- Board / Audit Committee (in regulated enterprises)

## 5. Likely direct reports

- None at launch
- Assistant Otzar Admin (larger orgs)
- Departmental Otzar liaison (mature deployments)

## 6. Possible direct reports

- Connector governance lead
- Policy administration lead
- Audit / evidence administrator
- DMW / Memory governance reviewer
- Implementation partner (external; coordination only)

## 7. Dotted-line relationships

- Security team
- Compliance team
- Privacy / Legal
- HR / People (for user lifecycle)
- Finance (for billing / entitlements)
- Department heads (for rollout coordination)
- Internal champions across teams

## 8. Cross-functional partners

- IT (provisioning, SSO/SAML, secrets, OAuth)
- Security (incident response, audit, secret rotation)
- Legal (contracts, NDAs, data handling)
- Compliance (frameworks, audits, evidence)
- HR / People (onboarding, offboarding, role mapping)
- Finance (billing, entitlements)
- Department heads (rollout planning)
- Executive Assistants (executive Twin enablement)
- Managers (departmental Twin enablement)
- Board / Audit committee (governance reporting)

## 9. External collaborators

- NIOV / Otzar support team
- Implementation partner (if applicable)
- Identity provider vendor (Okta / Entra / Google Workspace Identity)
- Compliance auditor
- External regulator (only via lawful basis per ADR-0036)
- Vendor admin teams (Slack / Google / Microsoft / Jira / Salesforce / Workday / etc.)

## 10. Core responsibilities

> **Admin + Dandelion co-seeding model** per `[FOUNDER-DANDELION-AS-ORG-SEEDING-ACTIVATION-INTELLIGENCE-ADDENDUM]`: *"Admins govern the setup. Dandelion guides and accelerates the setup. Foundation authorizes activation. DMWs scope memory."* The Otzar Admin and Dandelion work together — Dandelion guides, asks, maps, recommends, detects gaps, and assembles proposed starter shapes; the Admin governs and approves; Foundation authorizes activation; DMW scopes memory; Digital Twins operate inside those boundaries.

- Confirm the **CompanyDomainModel** that Dandelion proposes (company name, industry, size, compliance profile, regions, business model, customer type, operating cadence).
- Co-seed the org with Dandelion across 6 layers (company / department / role / tool-connector / workflow / DMW memory).
- Review Dandelion's proposed maps — these are **suggestions**, not authority. Dandelion produces proposed maps; Foundation turns approved maps into governed capability.
- Approve or adjust role templates.
- Map departments + org chart relationships.
- Review suggested Digital Twin starter profiles.
- Configure permission bundles.
- Configure delegated authority chains.
- Configure approval chains for connector writes / spend actions / HR-Legal actions / external communications.
- Manage connector presets.
- Approve connector read scopes.
- Review connector write-risk.
- Coordinate with IT / security for OAuth and secret management.
- Manage policies (memory, retention, audit, compliance).
- Monitor audit logs and chain integrity.
- Review unusual activity and denied actions.
- Manage user access; manage admin roles.
- Handle offboarding governance.
- Coordinate incident response.
- Run smoke tests after deployment (per `smoke-test-checklist.md`).
- Run rollback / admin bootstrap playbooks (per `rollback-runbook.md` + `admin-bootstrap-runbook.md`).
- Train internal champions.
- Explain Memory Wallet / DMW to users in simple language.
- Maintain trust in Otzar across the company.

## 11. Common decisions

- Which department to onboard first.
- Which role templates to approve at launch.
- Which connectors to enable read-first.
- Which approval chains to require for which actions.
- Which memory scopes to require review before activation.
- Which workflows to enable at recommendation-only vs. proposed-action tier.
- Which capabilities to flag for compliance review.
- Whether to escalate an unusual audit signal to security / legal.

## 12. Common meetings

- Weekly Otzar governance review
- Monthly rollout review with executive sponsor
- Quarterly board / audit committee evidence pack review (where scoped)
- Daily Admin Twin briefing (lightweight; surfaces denied actions + onboarding progress + policy gaps)
- Ad-hoc connector approval review
- Ad-hoc incident response coordination

## 13. Common documents / artifacts

- Otzar company readiness scorecard
- Department rollout plan
- Role template approval queue
- Connector approval queue
- Approval-chain configuration
- Memory-policy configuration
- Audit health brief
- Incident response runbook
- Admin daily / weekly briefs
- Champion enablement pack

## 14. Common metrics / KPIs

- Number of users onboarded via Dandelion (count, not score).
- Number of departments activated (count).
- Connector activation count (read-only / write-gated / disabled).
- Audit chain integrity (binary).
- Number of denied actions in the last week (counts only).
- Number of policy gaps surfaced + resolved (counts).
- Onboarding completion rate (%) — not employee scoring; rollout progress only.
- Incident count + mean-time-to-detect / mean-time-to-resolve.

## 15. Common tools

- Otzar Control Tower (`/onboarding`, `/security-audit`, `/approvals`, `/policies`, `/users`, `/ai-teammates`)
- Identity provider: Okta / Microsoft Entra ID / Google Workspace Identity
- Communication: Slack / Microsoft Teams
- Productivity: Google Workspace / Microsoft 365
- Project: Jira / Linear / Asana / Monday
- HRIS: Workday / BambooHR / Rippling
- Security / compliance: Vanta / Drata / OneTrust / Secureframe
- ITSM: ServiceNow / Jira Service Management
- Internal policy docs
- Audit export tools
- Billing / entitlement console (when Section 8 ships)
- Support / ticketing platform

## 16. Common workflows

The Otzar Admin owns the following workflow templates (forward-substrate; Wave 2.1 catalogs them, Wave 4+ activates them at recommendation tier):

- Otzar Company Setup Checklist
- Dandelion Department Rollout
- Dandelion User Activation Review
- Role Template Approval Review
- Digital Twin Starter Profile Review
- Connector Preset Approval Review
- Connector Read-Scope Approval
- Connector Write-Scope Approval
- Approval Chain Configuration
- Delegated Authority Review
- Memory Wallet / DMW Scope Review
- Audit Health Review
- Policy Gap Review
- User Access Review
- Admin Access Review
- Offboarding Governance Review
- Incident Response Coordination
- Rollback / Smoke-Test Execution
- Billing / Entitlement Review

Admin Twin synthesis workflows (DGI experience):

- Company Intelligence Readiness Brief
- Otzar Rollout Risk Map
- Dandelion Completion Brief
- Role Fit Review Queue
- Connector Value/Risk Review
- Approval Chain Gap Finder
- Memory Scope Safety Review
- Policy Gap Finder
- Audit Health Brief
- First 7-Day Launch Plan
- Department Readiness Ranking
- Champion Enablement Pack
- Admin Daily Governance Brief
- Admin Weekly Rollout Review
- Trust & Adoption Risk Review
- Capability Activation Review

## 17. Approval authority

- Configure company profile, departments, org chart.
- Approve role templates within policy.
- Approve read-only connector activation within policy.
- Approve permission bundles within policy.
- Configure approval chains.
- Authorize user invitations (within seat entitlement).
- Authorize routine offboarding.

## 18. Approval dependencies

- High-risk connector write actions require dual-control (per ADR-0026).
- Cross-tenant access changes require Founder / NIOV operator approval.
- Regulator-facing evidence export requires LawfulBasis per ADR-0036.
- Policy changes that loosen governance require dual-control.
- Sensitive department onboarding (Legal / HR / Finance) may require General Counsel + CHRO + CFO sign-off.

## 19. Delegated authority

- May act on behalf of the COO / CIO / CISO for Otzar-specific governance within explicit delegation matrices.
- May delegate read-only audit viewer access to security analysts and compliance reviewers under policy.
- May NOT delegate the highest-privilege capability (`can_admin_niov`) without an explicit secondary admin grant.

## 20. Never-default permissions

The Admin Twin **never** does, and the Otzar Admin **never** assumes by default:

- Reading private user memory or private/personal content.
- Browsing other people's DMW capsules in raw form.
- Bypassing approval chains.
- Suppressing audit logs or deleting audit evidence.
- Approving high-risk connector writes alone.
- Broad employee surveillance.
- Employee scoring.
- Psychological profiling.
- Cross-tenant access.
- Regulator disclosure without lawful basis.
- Legal / compliance certainty claims ("guaranteed compliant" / "regulator approved" / "no fine risk").
- Secret access (admin sees `secret_ref` env-var-NAMEs only, never payload).
- Unrestricted connector payload access.

## 21. Digital Twin day-one capabilities

The Admin Twin from day one helps the admin with:

- Reading the company readiness state (what Otzar understands so far + what's missing).
- Surfacing rollout risks per department / role / tool / connector.
- Synthesizing Dandelion onboarding progress.
- Flagging role-template fit and mismatches.
- Surfacing connector value-vs-risk briefs.
- Finding approval-chain gaps and policy gaps.
- Reviewing memory-scope safety (broad / missing / unsafe scopes).
- Producing audit health briefs (governance events, denied actions, unusual requests, chain integrity).
- Drafting champion-enablement copy (explanation + training bullets + trust language for users).
- Producing first-week / first-month launch plans.

## 22. First-week aha moments

Per the Founder Admin Twin addendum:

1. **Company Intelligence Readiness Brief** — "What does Otzar understand about our company so far, and what is missing?"
2. **Rollout Risk Map** — "Which departments, roles, tools, or permissions are risky to activate first?"
3. **Dandelion Completion Brief** — "Which users/departments completed onboarding, and which answers are blocking safe activation?"
4. **Role Fit Review** — "Which users have role-template mismatches or need admin review?"
5. **Connector Value/Risk Brief** — "Which connectors produce the most value, and which ones require the most governance?"
6. **Approval Chain Gap Finder** — "Where do workflows or connector writes lack a clear approval path?"
7. **Memory Scope Safety Brief** — "Which Memory Wallet / DMW scopes are safe, missing, or too broad?"
8. **Policy Gap Finder** — "What policies must be configured before these capabilities can activate?"
9. **Audit Health Brief** — "What governance events, denied actions, unusual requests, or audit-chain issues need attention?"
10. **First 7-Day Launch Plan** — "What should I do this week to roll Otzar out safely and create visible value?"
11. **Department Readiness Ranking** — "Which department should go first, second, and third based on tool readiness, workflow clarity, and risk?"
12. **Champion Enablement Pack** — "Give me the explanation, training bullets, and trust language I should send to users."

## 23. Safe fallback without connectors

The Admin Twin remains useful before any external connector is connected:

- Reads Foundation-native state (Audit Viewer / Approvals / Policies / users / role templates / connector presets / Wave 6 priority matrix / Dandelion onboarding answers).
- Produces readiness / risk / policy-gap briefs from internal state only.
- Drafts champion-enablement copy without sending it.
- Walks the admin through the canonical runbooks (smoke / rollback / admin-bootstrap / monitoring).

## 24. Connector implications

- The Admin Twin's value scales with connector availability — once Identity (Okta / Entra / Google Workspace Identity) is connected read-only, the Admin Twin can synthesize org-chart readiness.
- Once Communication (Slack / Teams) is connected read-only, the Admin Twin can surface department rollout signals.
- Once HRIS (Workday / BambooHR / Rippling) is connected read-only, the Admin Twin can surface accurate role mapping.
- Once Compliance (Vanta / Drata / OneTrust) is connected read-only, the Admin Twin can produce audit health briefs against the framework state.

But the Admin Twin **must not assume** these are connected — it always degrades gracefully per §23.

## 25. DMW / Memory Wallet scope notes

- Admin Twin **never** browses private user memory.
- Admin Twin operates on **governance metadata** about memory scopes — not memory content.
- Admin Twin can review:
  - Whether memory scopes are too broad.
  - Whether project / team / client scopes are configured.
  - Whether legal / compliance memory requires special handling.
  - Whether temporary delegated memory should expire.
  - Whether personal / non-work memory should be suppressed at ingest.
  - Whether safe metadata is retained appropriately.
  - Whether forgetting / disconnect behavior is configured.

Canonical admin-facing line: *"Admins govern how memory is scoped; they do not get blanket access to private memory."*

## 26. Governed context envelope notes

- `object_type`: ADMIN_OPERATING_MODEL
- `policy_purpose`: ENTERPRISE_GOVERNED_INTELLIGENCE_STEWARDSHIP
- `scope_defaults`: TENANT_SCOPED, ORG_ADMIN_ROLE, NEVER_CROSS_TENANT, NEVER_PRIVATE_USER_MEMORY_RAW
- `permission_defaults`: READ_FIRST, WRITE_GATED_BY_DUAL_CONTROL_WHERE_HIGH_RISK, CAN_ADMIN_NIOV_ONLY_BY_BOOTSTRAP_OR_DUAL_CONTROL
- `audit_expectations`: EVERY admin action audited via existing `ADMIN_ACTION` + `details.action` discriminator; audit chain integrity polled hourly per `monitoring-and-healthcheck.md`
- `allowed_consumers`: ADMIN_TWIN (self), CONTROL_TOWER_ADMIN_REVIEW, FOUNDATION_GOVERNANCE_TIER, SECURITY_TEAM, COMPLIANCE_TEAM (scoped)
- `forbidden_consumers`: AGENT_TWIN_CROSS_TENANT, MANAGER_SURVEILLANCE_TOOL, EMPLOYEE_SCORING_TOOL, REGULATOR_WITHOUT_LAWFUL_BASIS
- `sensitivity_level`: CRITICAL
- `adaptation_rules`: adapts only via governed signals (denied-action counts, policy-gap counts, onboarding-progress counts) — never via private profiling
- `override_rules`: any tightening of admin scope is auto-applied; any loosening requires dual-control + Founder authorization per RULE 20

## 27. Collaboration map

**Upward**: COO / CIO / CTO / CISO / Chief of Staff / General Counsel; weekly governance review + monthly rollout review. Surfaces readiness state + risk map + policy gaps. Never escalates with employee scoring framing.

**Downward**: Assistant Otzar Admin (if any) + departmental liaisons + internal champions. Hands off enablement copy + role-template-approval handles + connector-readiness handles. Trains champions to coach end users without surveillance framing.

**Peer**: Other Otzar Admins (in larger orgs) + IT Admin + Security Admin + Compliance Officer. Shares connector readiness, audit health, policy gaps. Coordinates approval-chain configuration.

**Cross-functional**: HR / People (onboarding ↔ Dandelion), Finance (billing / entitlements), Legal (policy / NDA), Department heads (rollout coordination). Surfaces readiness without exposing private memory content.

**External**: NIOV / Otzar support team, implementation partner (if applicable), identity provider vendor, compliance auditor, vendor admin teams (Slack / Google / Microsoft / etc.). Only via authorized channels; never share raw audit content without lawful basis.

**Approval path**:
- Routine governance (read-only connector enable, role template approval within policy) → Otzar Admin acts.
- Risky / write-enabled connector → Otzar Admin proposes; COO / CIO / CISO approves; dual-control where required.
- Cross-tenant change → NIOV operator approves under explicit Founder authorization.
- Regulator disclosure → LawfulBasis (ADR-0036) required; General Counsel + Compliance approve.

**Escalation path**:
- Audit chain integrity failure → Founder + security team immediately.
- Cross-tenant data leak suspicion → Founder + CISO + General Counsel immediately (per `rollback-runbook.md` §4.6 emergency lockdown).
- Connector write disclosed unauthorized payload → Founder + security + legal.
- Governance event flooding (potential attack signal) → security team + CISO.

## 28. Risks and guardrails

- **Surveillance creep**: Admin Twin must produce governance briefs, not employee surveillance. Forbidden framing enforced at template + envelope + UI tiers.
- **Permission creep**: Admin Twin must default to the most-restrictive interpretation when scope is ambiguous; Founder authorization required to loosen.
- **Connector write creep**: Admin Twin can surface value/risk briefs but cannot approve write activation alone for high-risk connectors.
- **Audit suppression risk**: Admin Twin must never recommend audit log deletion or suppression. BEFORE DELETE trigger (ADR-0002) is the runtime backstop, but template-tier forbidden_defaults reinforce.
- **Policy bypass**: Admin Twin must not recommend policy bypass; instead, it must recommend a policy update with appropriate approval gating.
- **Cross-tenant signal leakage**: Admin Twin must never reference signals from other companies' deployments. Same-org boundary absolute.
- **Sensitive HR / Legal / Finance overreach**: Admin Twin defers to scope-appropriate role owners when a recommendation would touch HR / Legal / Finance scope without explicit delegation.

## 29. Industry / company-size variants

| Variant | Differences |
|---------|-------------|
| **Startup (1-50)** | Often the Founder / CEO or Chief of Staff doubles as Otzar Admin. Lighter approval chains. Single department-style rollout. Lighter compliance posture. |
| **SMB (51-250)** | Dedicated Otzar Admin emerging (often IT lead or Ops lead). Per-department approval chains begin to formalize. SOC 2 typical. |
| **Mid-market (251-1500)** | Dedicated Otzar Admin standard. Dedicated Compliance Officer collaborates. Formal approval workflows. Multi-department phased rollout. |
| **Enterprise (1501-10000)** | Multiple Otzar Admins by role (governance / connector / policy / DMW). Multi-tier approval workflows + dual-control standard. Department-by-department phased rollout. |
| **Large enterprise (10000+)** | Otzar Admin function spans IT + Security + Compliance + Operations + Privacy. Multi-quarter phased rollout. Highly mature approval gating. Possible regulated deployment per ADR-0018 (sovereign cloud / on-premise / air-gapped). |
| **Financial Services / Regulated Finance** | Higher compliance bar (SEC Rule 17a-4 / FINRA recordkeeping). Compliance Officer promoted to TIER_1 collaboration. Records retention strict. |
| **Healthcare / Regulated Health** | HIPAA + HITECH posture. PHI redaction at ingest. Memory scopes for clinical context strictly governed. |
| **Legal Services** | Attorney-client privilege absolute. Matter-scoped memory. Cross-matter leakage forbidden. |
| **Government** | FedRAMP / FISMA / sovereign jurisdictional boundary. Possibly air-gapped deployment per ADR-0018. |
| **Education** | FERPA / COPPA where applicable. Student PII protected. |

## 30. Dandelion Map Implications

Per ADR-0082 Amendment 1 (Dandelion-as-organizational-cartographer doctrine) the Otzar Administrator is the **primary map validator + activation route selector** for every map type Dandelion drafts.

| Map | Admin's role |
|-----|--------------|
| Company Map | Confirms / corrects company profile; locks the CompanyDomainModel. |
| Org / Relationship Map | Approves the org-chart mapping (managers / direct reports / dotted-line / executive support / board / external). |
| Role Map | Reviews + approves RoleTemplate assignments per user; flags role-template mismatches via the "Role Fit Review" first-week aha moment. |
| Tool Map | Approves which tools enter scope at read-first; gates risky write surfaces; coordinates OAuth / secret setup with IT / Security. |
| Workflow Map | Reviews proposed workflow recommendations; approves Stage 2 Recommendation-only activations; gates Stage 3+ runs. |
| Authority Map | **Owns** approval-chain configuration; reviews delegated-authority defaults; enforces dual-control where required. |
| Memory / DMW Map | Reviews memory-scope safety; flags overbroad scopes; ensures forbidden categories absolute; never browses private memory raw. |
| Risk Map | Reviews blocked / uncertain regions before any activation; coordinates risk remediation with Security / Compliance / Legal. |
| Aha Moment Map | Selects first-week wins per department + role + connector; sequences the rollout route. |

Canonical line (verbatim from ADR-0082 Amendment 1):
> *"The Admin is not manually drawing everything from zero. Dandelion drafts the map. The Admin validates, corrects, approves, or blocks the map."*

The Admin Twin's 12 first-week aha moments (§22) and 16 synthesis workflows (§16) are the operational instruments for this map validation work. Specifically:

- **Company Intelligence Readiness Brief** → reports Company Map + Org / Relationship Map completeness.
- **Rollout Risk Map (synthesis workflow)** → consumes the Risk Map directly.
- **Role Fit Review** → consumes the Role Map.
- **Connector Value/Risk Brief** → consumes the Tool Map × Wave 6 priority matrix.
- **Approval Chain Gap Finder** → consumes the Authority Map.
- **Memory Scope Safety Brief** → consumes the Memory / DMW Map.
- **Policy Gap Finder** → consumes the Authority Map × Risk Map.
- **First 7-Day Launch Plan** → consumes the Aha Moment Map sequenced against approved regions.
- **Department Readiness Ranking** → composes Company + Role + Tool + Workflow + Authority Maps per department.
