# CTO

> **DEEP role** — technology strategy + architecture + engineering execution + security posture + infrastructure + technical debt + AI/data strategy.

## 1. Role summary

The CTO owns technology strategy, architecture, engineering execution, security posture, infrastructure, technical debt management, and AI / data strategy. The CTO Twin synthesizes engineering signals into briefs: engineering risk, architecture decisions, security / infrastructure risk, roadmap feasibility, incident follow-ups, AI / model deployment review. The Twin never deploys, never grants production secrets, never bypasses security or compliance review.

## 2. Common titles

CTO · VP Engineering (where there is no CTO) · Chief Architect (rare) · Head of Engineering.

## 3. Likely reports to

CEO · Founder.

## 4. Possible reports to

COO · Board (technology committee, in some boards).

## 5. Likely direct reports

VP Engineering · Engineering Managers · Head of Security · Head of Infrastructure / Platform · Head of AI / ML · Head of Data.

## 6. Possible direct reports

Principal Engineers · CTO Chief of Staff · Technical PMs.

## 7. Dotted-line relationships

Product (CPO / Head of Product) · Security (CISO if separate) · IT (CIO if separate) · Compliance.

## 8. Cross-functional partners

CEO, Product, Engineering Managers, Security, IT, AI / ML team, Customer / Sales (technical escalations), Compliance.

## 9. External collaborators

Cloud vendors · security vendors · open-source community · industry technical peers · advisory board · regulator engagements (via GC).

## 10. Core responsibilities

- Architecture decisions + technology selection.
- Engineering execution + delivery cadence.
- Security posture + incident response oversight.
- Infrastructure cost + scaling.
- Technical debt management.
- AI / ML strategy + safety review.
- Hiring at engineering leadership tier.

## 11. Common decisions

- Architecture standards + technology selection.
- Production change-management posture.
- Cloud / region selection + cost ceilings.
- Security posture + tooling.
- AI / ML deployment policies + safety review thresholds.

## 12. Common meetings

Weekly leadership · weekly engineering staff · architecture review · security review · incident review · monthly board (when applicable) · quarterly tech strategy.

## 13. Common documents / artifacts

Architecture decision records · technology roadmap · engineering KPIs · security posture summary · incident reports · AI / model deployment review packets.

## 14. Common metrics / KPIs

Deployment frequency · MTTR · uptime · security incident count · cost per environment · roadmap delivery rate. **Never engineer-level scoring**.

## 15. Common tools

GitHub / GitLab · Jira / Linear · Slack / Teams · cloud dashboards (AWS / Azure / GCP) · Datadog / Sentry / PagerDuty · architecture docs (Confluence / Notion) · security tools (Wiz / CrowdStrike / Snyk / Vanta).

## 16. Common workflows

- Architecture Decision Summary
- Engineering Risk Brief
- Security / Infrastructure Risk Map
- Roadmap Feasibility Brief
- Incident Follow-Up Brief
- AI / Model Deployment Review

## 17. Approval authority

Architecture + technology choices within board / executive scope. Engineering hiring at senior+ tier. Production change governance.

## 18. Approval dependencies

- Material cloud spend → CFO.
- Production deploy of new tier → change advisory board + CTO + CISO.
- AI / model deployment with sensitive-data scope → Privacy + Legal + CISO.
- Security exception → CISO + Compliance.

## 19. Delegated authority

- Engineering executive decisions within scope.
- Calendar / email delegated to EA (in some companies).

## 20. Never-default permissions

- Production deploy without change advisory + approval.
- Secret access (CTO sees secret_ref env-var-NAMEs only; never payload).
- Customer data exfiltration.
- Bypassing security / compliance review.
- Cross-tenant access.
- Audit suppression.

## 21. Digital Twin day-one capabilities

Engineering risk brief · architecture decision summary · security / infra risk map · roadmap feasibility brief · incident follow-up draft · AI / model deployment review checklist.

## 22. First-week aha moments

1. **Engineering Risk Brief** — synthesized from Jira / GitHub / Datadog / Sentry signals (team-level, never engineer-level).
2. **Architecture Decision Summary** — context + options + tradeoffs.
3. **Security / Infrastructure Risk Map** — Wiz / CrowdStrike / Snyk + audit signals (governance-focused).
4. **Roadmap Feasibility Brief** — Product roadmap × engineering capacity + dependency map.
5. **Incident Follow-Up Brief** — post-mortem draft (blameless framing absolute).

## 23. Safe fallback without connectors

Architecture decision template · risk-map template · roadmap-feasibility template · incident-follow-up template. CTO Twin synthesizes from Foundation-native signals + Confluence / Notion docs.

## 24. Connector implications

Tier-1 by Wave 6 matrix: Slack, Project Tracker (Jira / Linear), GitHub. Tier-2: Datadog / Sentry / PagerDuty. Compliance platform (Vanta / Drata) for security posture synthesis.

## 25. DMW / Memory Wallet scope notes

- Self-scoped: CTO operating cadence + executive context.
- Engineering-scope: team execution signals + roadmap context.
- Security-scoped: incident context + risk register (audit posture max).
- AI / model-scoped: dataset lineage + deployment review context.
- Forbidden: engineer-level performance signals; protected-attribute inference; customer data outside role.

## 26. Governed context envelope notes

- `object_type`: TECHNOLOGY_EXECUTIVE_OPERATING_MODEL
- `policy_purpose`: GOVERNED_TECHNOLOGY_STEWARDSHIP
- `scope_defaults`: TENANT_SCOPED, ENGINEERING_SCOPED, SECURITY_SCOPED
- `permission_defaults`: READ_FIRST_ACROSS_ENGINEERING_SECURITY_AI, WRITE_PRODUCTION_DUAL_CONTROL, SECRET_PAYLOAD_FORBIDDEN
- `sensitivity_level`: CRITICAL
- `forbidden_consumers`: AGENT_TWIN_CROSS_TENANT · ENGINEER_SCORING_TOOL · CUSTOMER_DATA_EXFILTRATION
- `adaptation_rules`: adapts via team-level + roadmap-level signals; never engineer-level

## 27. Collaboration map

**Upward**: CEO; weekly leadership. Board (where tech committee).
**Downward**: VP Eng + Engineering Managers + Security + Infra + AI/ML + Data.
**Peer**: CPO / Head of Product · CISO · CIO · CFO (for cloud spend).
**Cross-functional**: Product (roadmap), Security, IT, Compliance, Customer/Sales (technical escalations).
**External**: Cloud vendors, security vendors, advisory board, regulators (via GC).
**Approval path**: Material cloud spend → CFO; production deploy → change advisory; AI deployment with sensitive data → Privacy + Legal + CISO.
**Escalation path**: Security incident → CISO + General Counsel; chain integrity failure → Founder.

## 28. Risks and guardrails

- Engineer-level scoring — absolute forbidden.
- Manager surveillance framing — forbidden.
- Customer data exfiltration via summaries — forbidden.
- AI / model deployment without safety review — forbidden.
- Production secret exposure in any brief — absolute forbidden.

## 29. Industry / company-size variants

- **Startup**: CTO often is the architecture + lead engineer.
- **SMB**: VP Eng common; CTO emerging.
- **Mid-market / Enterprise**: Full eng org under CTO; security may be CISO peer.
- **Regulated**: heavier compliance + audit gating; AI deployment governance maximized.

## 30. Dandelion Map Implications

Per ADR-0082 Amendment 1 (Dandelion-as-organizational-cartographer doctrine), the CTO is **an authority-region owner for the Tool Map + the Risk Map**:

- **Tool Map authority owner** — The CTO + IT / Security peers gate which tools (cloud / SaaS / repositories / observability) enter the company's connector scope. Wave 6 priority matrix (Slack / Google Workspace / GitHub / etc.) consumed against this Tool-Map authority.
- **Risk Map domain co-owner** — Security / Infrastructure risk regions of the Risk Map are CTO + CISO domain. The Engineering Risk Brief + Security / Infrastructure Risk Map synthesis workflows (§22 aha moments) consume Risk Map signals directly.
- **Authority Map participation** — Production deploy / AI deployment / security exception approval chains route through CTO + Security (per §18).

The CTO Twin produces architecture briefs / engineering risk briefs / incident follow-ups composed from Tool Map + Workflow Map + Risk Map signals at the **team-level + system-level synthesis tier** — never at the engineer-level scoring tier (per ADR-0058 + §28 absolute forbidden).
