# Sales Manager / Account Executive

## 1. Role summary

Sales: pipeline · accounts · opportunities · follow-ups · forecasts · pricing/discount requests · deal blockers. Twin produces pipeline-risk briefs · account briefs · forecast reviews · deal blocker escalations · discount approval requests · follow-up drafts. **Never auto-sends customer email. Never makes legal/security promises. Never auto-discounts.**

## 2. Common titles

Account Executive · Senior AE · Strategic AE · Enterprise AE · Sales Manager · VP Sales · CRO · SDR · BDR.

## 3. Likely reports to

Sales Manager → VP Sales → CRO → CEO.

## 4. Possible reports to

CMO (in marketing-led orgs) · COO (in operations-led orgs).

## 5. Likely direct reports

Sales Manager has AEs / SDRs / BDRs reporting in.

## 6. Possible direct reports

AE Mentor · Player-Coach.

## 7. Dotted-line relationships

CSM (for top accounts) · Sales Engineering (for technical demos) · Deal Desk.

## 8. Cross-functional partners

CSM · Marketing · Product · Finance (Deal Desk) · GC (non-standard terms).

## 9. External collaborators

Customers · partners · prospects · industry events.

## 10. Core responsibilities

Pipeline management · customer meetings · deal close · forecast accuracy · account planning.

## 11. Common decisions

Deal qualification · meeting cadence · negotiation framing (within authority).

## 12. Common meetings

Weekly pipeline review · monthly forecast · QBR · customer meetings · daily prospecting.

## 13. Common documents / artifacts

Account plan · MSA · SOW · opportunity notes · forecast reports.

## 14. Common metrics / KPIs

Pipeline value · win rate · quota · ramp · ASP. **Sales Manager: team aggregate; never individual scoring beyond standard sales metrics.**

## 15. Common tools

Salesforce · HubSpot · Outreach · Salesloft · Gong · Clari · Slack · email · calendar · docs.

## 16. Common workflows

- Pipeline Risk Brief
- Account Brief
- Forecast Review
- Deal Blocker Escalation
- Discount Approval Request
- CRM Follow-Up Draft

## 17. Approval authority

Discount within standard authority. Activity logging.

## 18. Approval dependencies

Non-standard discounts → Sales Manager / Finance / Deal Desk. Non-standard terms → GC. Custom SLA → CSM / GC.

## 19. Delegated authority

AE owns AE pipeline; Sales Manager coordinates across AEs.

## 20. Never-default permissions

Bulk-export contacts · expose customer PII · approve own discounts · make legal/security promises · change contract terms · send unapproved pricing commitments · customer logo without permission.

## 21. Digital Twin day-one capabilities

Pipeline risk brief · account brief · forecast review · deal blocker escalation · discount approval request · CRM follow-up draft.

## 22. First-week aha moments

1. **Pre-Meeting Account Brief** — account context + recent activity + open items.
2. **CRM Follow-Up Draft** — post-meeting draft.
3. **Pipeline Risk Brief** — AE-scoped at-risk deals.
4. **Forecast Review** — weekly forecast prep.
5. **Discount Approval Request** — pre-formatted request with rationale.

## 23. Safe fallback without connectors

Account brief template · follow-up template · forecast template.

## 24. Connector implications

CRM (Salesforce / HubSpot) — Wave 6 rank 7 (9.75) · Slack · Gmail / Outlook · Calendar · Gong (TIER_3).

## 25. DMW / Memory Wallet scope notes

Self-scoped AE pipeline · account-scoped (per account NDA) · deal-scoped. **Forbidden**: cross-account leakage · employee scoring across reps · customer PII exposure outside CRM.

## 26. Governed context envelope notes

- `object_type`: SALES_OPERATING_MODEL
- `policy_purpose`: GOVERNED_SALES_SUPPORT
- `permission_defaults`: READ_FIRST_CALLER_ACCOUNTS, DRAFT_FOR_CUSTOMER_COMMS, DISCOUNT_GATED
- `sensitivity_level`: HIGH
- `forbidden_consumers`: CROSS_REP_SCORING · CUSTOMER_PII_LEAKAGE · AUTO_DISCOUNT

## 27. Collaboration map

**Upward**: Sales Manager → VP Sales → CRO. **Downward**: SDRs / BDRs (Sales Manager). **Peer**: other AEs · CSM · SE · Deal Desk. **Cross-functional**: CSM · Marketing · Product · Finance · Legal. **External**: customers · prospects · partners. **Approval path**: discount → Sales Manager / Finance; non-standard terms → GC. **Escalation**: deal crisis → VP Sales + CRO + GC.

## 28. Risks and guardrails

Auto-discount · customer PII exposure · cross-rep scoring · contract term changes · MNPI in customer comms.

## 29. Industry / company-size variants

- **Startup**: Founder is the AE.
- **SMB / Mid-market**: AEs by segment.
- **Enterprise**: AEs + SEs + Deal Desk + multi-tier ladder.
- **Regulated**: contract terms tightly governed.
