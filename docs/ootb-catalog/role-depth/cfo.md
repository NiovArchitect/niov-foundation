# CFO

## 1. Role summary

Finance: budget, forecast, audit, treasury, board finance. CFO Twin synthesizes spend-approval reviews + expense-exception briefs + board-finance-packet drafts + vendor-renewal briefs. SOX controls authoritative. Dual-control for high-value actions. Never auto-posts journal entries or auto-approves spend.

## 2. Common titles

CFO · VP Finance · Controller (acting CFO in small orgs).

## 3. Likely reports to

CEO.

## 4. Possible reports to

Board (audit committee for some reports).

## 5. Likely direct reports

Controller · FP&A Lead · Accounts Payable / Receivable Manager · Procurement Manager · Revenue Operations / Deal Desk · Expense Manager.

## 6. Possible direct reports

Tax Lead · Treasury Lead · Investor Relations Lead.

## 7. Dotted-line relationships

CEO (board finance) · COO (operational spend) · GC (contracts).

## 8. Cross-functional partners

Compliance Officer · GC · COO · auditors.

## 9. External collaborators

External auditors · banks · investors · tax advisors · regulators (via GC + LawfulBasis).

## 10. Core responsibilities

Financial planning · audit · treasury · board finance · investor reporting · spend governance · vendor renewals · payroll oversight.

## 11. Common decisions

Budget allocation · spend exceptions · investment authorization · vendor approvals within ceiling.

## 12. Common meetings

Monthly close · weekly finance review · board finance committee · quarterly investor update.

## 13. Common documents / artifacts

Financial statements · budget · board finance packet · audit evidence · spend reports.

## 14. Common metrics / KPIs

Revenue · burn · runway · AR/AP aging · gross margin · operating expense.

## 15. Common tools

NetSuite · QuickBooks · Xero · Ramp · Brex · SAP Concur · Expensify · Bill.com · Coupa · Google Sheets / Excel.

## 16. Common workflows

- Spend Approval Review
- Expense Exception Review
- Board Finance Packet Prep
- Vendor Renewal Review
- Procurement Request Review

## 17. Approval authority

Spend within board-authorized ceiling. Budget reallocation.

## 18. Approval dependencies

Wire transfers → dual-control. Spend above critical threshold → CEO + Board. Contract terms → GC.

## 19. Delegated authority

Calendar / email / expense logistics delegated to EA.

## 20. Never-default permissions

Auto-post journal entries · auto-approve spend above threshold · auto-pay vendors · audit suppression · payroll changes without dual-control · regulator disclosure without LawfulBasis.

## 21. Digital Twin day-one capabilities

Spend exception brief · vendor renewal brief · board finance packet draft · expense policy exception review.

## 22. First-week aha moments

1. **Spend Exception Snapshot** — daily exceptions awaiting review.
2. **Vendor Renewal Brief** — upcoming renewals + spend + risk.
3. **Board Finance Packet Draft** — P&L + runway + key metrics.
4. **Expense Policy Exception Review** — weekly.
5. **AR/AP Aging Brief** — collection + payment risk.

## 23. Safe fallback without connectors

Finance brief template · vendor renewal template · expense exception template.

## 24. Connector implications

Finance ERP (NetSuite / QuickBooks / Xero) · Travel + Expense (Concur / Ramp / Brex / Expensify). Wave 6: Travel + Expense 8.75, Finance ERP 6.00.

## 25. DMW / Memory Wallet scope notes

Self-scoped operating context · finance-scoped budget + forecasts + audit evidence · board-finance-scoped · regulator-scoped (via GC). Forbidden: compensation outside scope; personal expense detail unless reviewing.

## 26. Governed context envelope notes

- `object_type`: FINANCE_EXECUTIVE_OPERATING_MODEL
- `policy_purpose`: GOVERNED_FINANCE_STEWARDSHIP
- `permission_defaults`: READ_FIRST_FINANCE, DRAFT_FOR_APPROVAL, WRITE_DUAL_CONTROL_HIGH_VALUE
- `sensitivity_level`: CRITICAL
- `forbidden_consumers`: AUTO_POST_JOURNAL · AUTO_PAY · COMPENSATION_OUTSIDE_SCOPE_LEAKAGE

## 27. Collaboration map

**Upward**: CEO, Board (audit + finance committees). **Downward**: Controller, FP&A, AP/AR, Procurement. **Peer**: COO, GC, CHRO. **Cross-functional**: Compliance, COO, GC, all departments for spend. **External**: Auditors, banks, investors, tax advisors. **Approval path**: Wire transfer → dual-control; spend above threshold → CEO + Board. **Escalation**: audit finding → CEO + Board + GC.

## 28. Risks and guardrails

Auto-payment · audit suppression · SOX violations · compensation exposure · investor MNPI leakage.

## 29. Industry / company-size variants

- **Startup**: Controller doubles as CFO.
- **SMB / Mid-market**: full Finance org under CFO.
- **Enterprise**: multi-region + tax + treasury.
- **Regulated / Public**: SOX + SEC compliance maximum.
