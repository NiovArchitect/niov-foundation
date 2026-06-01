# Board Member / Board Chair / Investor Observer

## 1. Role summary

Board members provide governance oversight, fiduciary duty, risk review, executive accountability, and strategic guidance. Board Chairs lead board cadence + agenda; Investor Observers participate without fiduciary duty. **Read-only by default. No operational write access.** Highest sensitivity; heavily scoped; purpose-bound; audited.

## 2. Common titles

Board Chair · Independent Director · Investor Director · Investor Observer · Audit Committee Member · Compensation Committee Member · Nominating / Governance Committee Member.

## 3. Likely reports to

Shareholders / fellow board members (no operational reporting line).

## 4. Possible reports to

Limited partners (in investor-observer roles via investment fund).

## 5. Likely direct reports

None.

## 6. Possible direct reports

Board secretary / governance counsel (administrative support).

## 7. Dotted-line relationships

CEO (board-CEO governance relationship) · CFO (audit committee) · CHRO (compensation committee) · General Counsel (board secretary).

## 8. Cross-functional partners

CEO + executive team for board materials cadence. Other board members for committee work.

## 9. External collaborators

Auditors · external counsel · regulators (via GC + LawfulBasis) · investor LPs.

## 10. Core responsibilities

- Oversight + governance.
- Strategy review.
- Executive evaluation at board tier.
- Committee work (audit, compensation, nominating / governance).
- Material risk review.
- Fiduciary duty (shareholders).

## 11. Common decisions

Board-level votes · committee recommendations · executive evaluation.

## 12. Common meetings

Quarterly board · committee meetings · annual strategy retreat.

## 13. Common documents / artifacts

Board materials · committee charters · minutes · audit reports · risk summaries · executive evaluation forms.

## 14. Common metrics / KPIs

Strategic OKRs · audit findings · risk register · compliance posture. Never employee scoring.

## 15. Common tools

Board portal · Google Drive / Microsoft 365 (board folders, scoped) · DocuSign · BI / KPI dashboards (read-only) · audit / security reports.

## 16. Common workflows

- Board Packet Summary
- KPI / Risk Brief
- Open Decisions Tracker
- Committee Evidence Pack
- Executive Update Comparison

## 17. Approval authority

Board-level votes per committee charter + corporate bylaws.

## 18. Approval dependencies

Board chair sign-off for agenda. Quorum for votes.

## 19. Delegated authority

None operationally. Committee delegation per charter.

## 20. Never-default permissions

- Operational action.
- Employee-level surveillance.
- Unrestricted company data access.
- Non-board materials.
- Cross-company observation.
- Audit suppression.

## 21. Digital Twin day-one capabilities

Board packet summary · KPI / risk brief · open decisions tracker · committee evidence pack · executive update comparison.

## 22. First-week aha moments

1. **Board Packet Summary** — pre-meeting digest.
2. **KPI / Risk Brief** — quarterly trends.
3. **Open Decisions Tracker** — what the board has voted on; outstanding follow-ups.
4. **Committee Evidence Pack** — audit / compensation / governance evidence.
5. **Executive Update Comparison** — quarter-over-quarter narrative.

## 23. Safe fallback without connectors

Board pack checklist · KPI template · decisions tracker template. Twin synthesizes from board-portal-only signals when available.

## 24. Connector implications

Board portal · Google Drive / Microsoft 365 (board folders). Most read-only. No connector writes.

## 25. DMW / Memory Wallet scope notes

- Board-scoped only (strict).
- Committee scope per charter.
- Audit / finance / risk pack scope.
- Strong retention + audit.
- Forbidden: operational employee data; cross-company signals; private personal data.

## 26. Governed context envelope notes

- `object_type`: BOARD_OPERATING_MODEL
- `policy_purpose`: BOARD_GOVERNANCE_OVERSIGHT
- `scope_defaults`: BOARD_SCOPED, COMMITTEE_SCOPED, READ_ONLY_DEFAULT
- `permission_defaults`: READ_ONLY_BOARD_MATERIALS, NEVER_OPERATIONAL_WRITE
- `sensitivity_level`: CRITICAL
- `forbidden_consumers`: AGENT_TWIN_CROSS_TENANT · EMPLOYEE_SURVEILLANCE_TOOL · OPERATIONAL_WRITE
- `adaptation_rules`: adapts to board cadence + committee charter; never to individual employee signals
- `audit_expectations`: maximum audit retention per ADR-0002

## 27. Collaboration map

**Upward**: Shareholders (annual). LP investors (via fund).
**Downward**: None operationally.
**Peer**: Other board members; committee members.
**Cross-functional**: CEO + executive team for materials cadence. CFO (audit), CHRO (compensation), GC (secretary).
**External**: Auditors, external counsel, regulators (via GC + LawfulBasis).
**Approval path**: Board votes per quorum + bylaws.
**Escalation path**: Material risk → audit committee + CEO + GC.

## 28. Risks and guardrails

- Operational write access — absolute forbidden.
- Employee-level surveillance — absolute forbidden.
- Cross-tenant observation — absolute forbidden.
- Board content leakage outside board scope — absolute forbidden.
- Material non-public information leakage — absolute forbidden (federal securities law if public company).

## 29. Industry / company-size variants

- **Startup**: small advisory board emerging; founder-friendly governance.
- **Growth / Mid-market**: full board with audit + compensation committees.
- **Enterprise / Regulated**: full committee structure; audit committee maximum oversight.
- **Public company**: SEC compliance + MNPI handling maximum.
