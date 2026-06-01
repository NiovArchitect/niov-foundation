# CEO / Founder

> **DEEP role** — Founder's directly-detailed example. The CEO/Founder Twin is a strategic co-pilot for vision, capital, board/investor relationships, executive alignment, and company narrative — under explicit governance.

## 1. Role summary

The CEO / Founder owns vision, strategy, capital allocation, company narrative, culture, executive alignment, board / investor relationships, and major customer relationships. In small companies, the role doubles as Chief Product, Chief Sales, Chief Recruiter — the Twin must adapt to the founder's actual operating shape. The CEO Twin is *not* an autonomous decision-maker — it produces briefs, drafts, follow-ups, and surfaces signals that the CEO reviews. The Twin never sends executive email without delegation, never commits the company without sign-off, never bypasses governance.

## 2. Common titles

CEO · Founder · Co-Founder + CEO · Managing Director · President (where President is the operating role).

## 3. Likely reports to

Board Chair (board governance accountability).

## 4. Possible reports to

Investors / Board Committee (operational reporting cadence) · Founding partners (in partnership-structured companies).

## 5. Likely direct reports

COO · CFO · CTO · CHRO · General Counsel · CMO · CRO · CPO · Chief Customer Officer · Chief of Staff.

## 6. Possible direct reports

VP-tier leaders (when there is no C-suite peer) · Co-founder peer (in flat structures).

## 7. Dotted-line relationships

Board members (committee oversight) · key investors · strategic partners · key customer executives.

## 8. Cross-functional partners

The entire executive team + the EA + Chief of Staff. Outbound: investors, customers, partners, regulators (under General Counsel), media (under PR / CMO).

## 9. External collaborators

Board · investors · major customers · strategic partners · media (under PR / CMO) · regulators (only via General Counsel + LawfulBasis) · industry analysts · advisory board.

## 10. Core responsibilities

- Strategy, vision, capital allocation.
- Board + investor engagement.
- Executive team leadership + executive alignment.
- External representation (customers, partners, media — under coordination with PR / CMO / GC).
- Hiring at the executive tier.
- Setting company narrative + culture.

## 11. Common decisions

- Strategic priorities, OKRs, resource allocation.
- Leadership team changes.
- Board engagement.
- Material customer commitments (with Sales / Product input).
- Material spend / acquisition decisions (with CFO).
- Crisis response leadership.

## 12. Common meetings

Weekly leadership · monthly business review · quarterly board · investor updates · ad-hoc customer / strategic meetings.

## 13. Common documents / artifacts

Strategic plans · board materials · executive briefs · investor updates · customer commitment summaries · all-hands narratives.

## 14. Common metrics / KPIs

Strategic OKRs · company-wide KPIs (revenue / burn / runway) · executive team health (qualitative; **never** scoring or surveillance) · board KPIs.

## 15. Common tools

Google Calendar / Outlook Calendar · Gmail / Outlook · Slack / Microsoft Teams · Google Drive / Microsoft 365 · DocuSign · board portal · BI dashboards (Tableau / Looker / Power BI / Mode) · CRM (Salesforce / HubSpot) · finance dashboards (NetSuite / QuickBooks summaries) · project dashboards (Jira / Linear summaries) · investor docs.

## 16. Common workflows

- Board Update Brief
- Company Blocker Map
- Top Cross-Functional Risks
- Executive Commitment Tracker
- Strategic Decision Brief
- Investor Update Draft
- Weekly Executive Review
- Strategic Day Brief
- Tomorrow's Executive Brief

## 17. Approval authority

Broad strategic authority within board-authorized scope. Material commitments (large spend / hires / acquisitions / strategic partnerships) often require board input.

## 18. Approval dependencies

- Spend above board-authorized ceiling → Board.
- Acquisitions / divestitures → Board + General Counsel.
- Customer-facing material commitments → CRO / Sales + GC.
- Regulator-facing disclosure → General Counsel + LawfulBasis (ADR-0036).
- Compensation changes for executive team → Compensation Committee.

## 19. Delegated authority

- Calendar delegated to EA (FULL).
- Email-draft delegated to EA (per-recipient-class delegation marker for send).
- Travel + expense logistics delegated to EA.

## 20. Never-default permissions

- Legal / regulatory disclosure without GC + LawfulBasis.
- Employee private data access (compensation outside scope; HR records outside policy).
- Customer confidential data outside role.
- Unapproved spend commitments.
- Audit log suppression.
- Cross-tenant data access.

## 21. Digital Twin day-one capabilities

Strategic day brief · board update draft · investor update draft · executive commitment tracker · cross-functional blocker map · strategic decision brief · follow-up drafts.

## 22. First-week aha moments

1. **Strategic Day Brief** — calendar + priorities + open commitments + signals (no surveillance framing).
2. **Board Update Brief** — synthesized from finance + product + ops signals.
3. **Company Blocker Map** — cross-functional blockers + recommended escalation.
4. **Executive Commitment Tracker** — what the CEO promised; follow-up drafts.
5. **Strategic Decision Brief** — context + options + tradeoffs for upcoming decisions.

## 23. Safe fallback without connectors

- No connectors: strategic brief template + executive commitment template + board update outline.
- With calendar read-only: day-brief draft.
- With email + Slack read-only: communication summary (no surveillance framing).

## 24. Connector implications

Tier 1 by Wave 6 matrix: Slack / Google Workspace / Microsoft 365 / CRM / finance dashboards / BI. Board portal is high-sensitivity; typically read-only at most. Travel + Expense delegated through EA.

## 25. DMW / Memory Wallet scope notes

- Self-scoped: executive commitments + strategic context.
- Board-scoped: board materials + committee context (audit posture maximum).
- Investor-scoped: investor update context + financial summaries.
- Strategy / project-scoped: strategic initiatives + cross-functional priorities.
- Forbidden: private / family / personal matters must NEVER become enterprise intelligence; employee private data; protected-attribute inference.

## 26. Governed context envelope notes

- `object_type`: EXECUTIVE_OPERATING_MODEL
- `policy_purpose`: STRATEGIC_GOVERNED_EXECUTIVE_SUPPORT
- `scope_defaults`: TENANT_SCOPED, ENTITY_SCOPED, BOARD_SCOPED, INVESTOR_SCOPED
- `permission_defaults`: BROAD_READ_WITHIN_SCOPE, DRAFT_FOR_OUTBOUND, WRITE_RISKY_PERMISSIONS_DUAL_CONTROL
- `audit_expectations`: every executive action audited; material commitments retain evidence
- `sensitivity_level`: CRITICAL
- `forbidden_consumers`: AGENT_TWIN_CROSS_TENANT · MANAGER_SURVEILLANCE_TOOL · MEDIA_BEFORE_PR_REVIEW · REGULATOR_WITHOUT_LAWFUL_BASIS
- `adaptation_rules`: adapts to governance signals (board cadence, investor cadence, strategic OKRs) — never via private profiling

## 27. Collaboration map

**Upward**: Board Chair + Board committees + key investors. Quarterly cadence; ad-hoc for material signals.
**Downward**: Executive team (COO, CFO, CTO, CHRO, GC, CMO, CRO, Chief of Staff, EA). Weekly leadership cadence.
**Peer**: Co-founders (where applicable) · founding partners.
**Cross-functional**: All — the CEO connects every executive surface.
**External**: Customers (major), partners (strategic), media (via PR/CMO), regulators (via GC + LawfulBasis), advisory board.
**Approval path**: Material spend → Board / CFO; material customer commitment → CRO + GC; regulator disclosure → GC + LawfulBasis.
**Escalation path**: Crisis → CEO leads; chain integrity / cross-tenant signal → CEO + Founder authorization.

## 28. Risks and guardrails

- Surveillance creep from "company-wide visibility" — Twin produces synthesized signals from approved sources only; never surfaces employee private behavior.
- Legal / regulatory disclosure without GC review — absolute forbidden.
- Compensation visibility outside scope — forbidden by default.
- Strategic data leakage to investors / press / partners outside scope — forbidden.
- Auto-replying to investors / press / customers — forbidden; draft-only.
- Overclaiming AI capability externally — Twin produces drafts; CEO chooses framing.

## 29. Industry / company-size variants

- **Startup (1-50)**: Founder operates many functions; Twin's value is breadth + EA support; smaller approval chains.
- **SMB (51-250)**: CEO + 3-5 executives; Board emerging; investor cadence formalizing.
- **Mid-market (251-1500)**: Full executive team; Board active; quarterly investor cadence.
- **Enterprise (1501-10000)**: Multi-layer reporting; Board + committee structure mature.
- **Large enterprise (10000+)**: Highly mature governance; multi-board / multi-jurisdiction.
- **Regulated**: Board fiduciary + audit committee oversight maximized; regulator-facing disclosure tightly governed per ADR-0070.
