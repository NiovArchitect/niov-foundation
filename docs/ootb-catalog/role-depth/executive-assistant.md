# Executive Assistant

> **DEEP role** — Wave 2's deepest worked example, ported into the role-depth Markdown format.

## 1. Role summary

The Executive Assistant (EA) is the trusted operating partner to one or more executives. The EA owns the executive's calendar, triages email, books travel + expense, coordinates board meetings, prepares the executive brief, and protects focus time. The EA Twin is an EA's force multiplier — drafting communications, preparing briefs, surfacing follow-ups, coordinating logistics — under explicit delegated authority. The EA Twin is *not* an autonomous agent; it produces drafts and suggestions for the EA to review.

## 2. Common titles

Executive Assistant · Senior Executive Assistant · Executive Business Partner · Chief of Staff Assistant · Office of the CEO

## 3. Likely reports to

CEO · Founder · COO · CFO · CTO · CHRO · General Counsel · Board Chair · Executive team member

## 4. Possible reports to

Chief of Staff · Office of CEO · Department head · Board office

## 5. Likely direct reports

None.

## 6. Possible direct reports

Administrative Assistant · Office Coordinator · Travel Coordinator · Receptionist · Event Coordinator

## 7. Dotted-line relationships

Other EAs (cross-executive coordination) · Office Manager · Travel & Procurement · Vendor management

## 8. Cross-functional partners

CFO / Finance team (expense + spend), IT Admin (executive devices + access), General Counsel (board materials logistics), CHRO (executive onboarding logistics).

## 9. External collaborators

Vendors · Visitors · External counterparties (under explicit delegation only) · Hotels / travel partners · Board portal vendor

## 10. Core responsibilities

- Own executive calendar end-to-end (under delegated authority).
- Triage executive email; draft responses; send only under delegation.
- Coordinate travel + expense for executive.
- Coordinate board meeting logistics + materials.
- Prepare tomorrow's executive brief.
- Track executive commitments + draft follow-ups.
- Coordinate visitors + vendors.
- Protect executive focus time.
- Coordinate confidential document logistics under scope.

## 11. Common decisions

- Accept / decline / reschedule meetings (under delegated authority).
- Book travel within policy.
- Submit expense reports within policy threshold.
- Choose draft email tone consistent with executive style.

## 12. Common meetings

Weekly executive 1:1 · leadership staff · board meetings (logistics) · vendor coordination · executive coordination across EAs.

## 13. Common documents / artifacts

Executive calendar · executive brief · travel itinerary · expense reports · board logistics packet · agenda templates · follow-up drafts.

## 14. Common metrics / KPIs

Executive calendar utilization · focus-time honored · meeting reschedule rate · expense submission cadence. **Never employee scoring.**

## 15. Common tools

Google Calendar · Outlook Calendar · Gmail · Outlook · Slack · Microsoft Teams · Zoom · Google Meet · Microsoft Teams Meetings · Google Drive · Google Docs / Sheets / Slides · Microsoft 365 · OneDrive · SharePoint · DocuSign · SAP Concur · Expensify · Ramp · Brex · Navan / TripActions · TravelPerk · Calendly · Notion · Asana · Monday · Airtable · 1Password · CRM light access where scoped · board portal tools where applicable.

## 16. Common workflows

Tomorrow's Executive Brief · Travel Booking + Expense Shell · Executive Commitment Follow-Up Draft · Board Meeting Prep Packet · Focus Time Protection · Calendar Conflict Resolution · Receipt Capture + Categorization · Vendor / Visitor Coordination.

## 17. Approval authority

- Within explicit delegation: schedule on executive's behalf, draft email, prepare expense shell, upload receipts, coordinate vendors.

## 18. Approval dependencies

- Spend above threshold → executive + Finance.
- Travel outside policy → executive + Finance.
- Executive email send above sensitivity threshold → executive.
- Board content access → CEO + General Counsel.

## 19. Delegated authority

- FULL calendar delegation (default ENABLED).
- DRAFT-only email by default; SEND requires per-recipient-class delegation.
- DRAFT-only expense; SUBMIT within policy if Expense Assistant bundle DISABLED_UNTIL_APPROVED is activated.

## 20. Never-default permissions

Send executive email without delegation · Approve sensitive spend · Access board / legal / HR / compensation / M&A docs unless scoped · Expose executive private / family matters · Full inbox access by default · Unrestricted write access.

## 21. Digital Twin day-one capabilities

Calendar awareness · email-draft assistance · executive brief generation · travel + expense shell · board logistics coordination · commitment tracking · focus-time defense.

## 22. First-week aha moments

1. Tomorrow's Executive Brief
2. Travel Booking + Expense Shell (Founder doctrine)
3. Executive Commitment Follow-Up Draft
4. Board Meeting Prep Packet
5. Focus Time Protection

## 23. Safe fallback without connectors

- No connectors: draft checklist, itinerary shell, meeting prep outline, receipt checklist, brief template.
- Read-only connectors: schedule brief + reschedule suggestions; with Concur read-only, policy + draft expense shell.
- Delegated write: act within explicit delegated authority + policy thresholds; approval-gated for spend and executive email send.

## 24. Connector implications

Top connectors for EA value: Google Calendar / Outlook Calendar (TIER_1) → Gmail / Outlook (TIER_1) → Slack / Teams (TIER_1) → Google Drive / Microsoft 365 (TIER_1) → SAP Concur / Navan / Expensify / Ramp / Brex (TIER_1-2 for travel/expense). Per Wave 6 matrix: Slack 16.00 → Google Workspace 13.33 → Travel + Expense 8.75 are the EA-relevant tier-1 candidates.

## 25. DMW / Memory Wallet scope notes

- Self-scoped: EA's own work commitments and operating cadence.
- Executive-context-scoped (delegated): executive calendar / email metadata / travel itinerary / commitment list.
- Project-scoped: board meeting prep packets per cycle.
- Forbidden: executive private / family matters; protected-attribute inference about anyone; psychological inference about executive.

## 26. Governed context envelope notes

- `object_type`: EA_OPERATING_MODEL
- `policy_purpose`: SCOPED_EXECUTIVE_SUPPORT
- `scope_defaults`: TENANT_SCOPED, ENTITY_SCOPED, DELEGATED_EXECUTIVE_SCOPE
- `permission_defaults`: READ_FIRST, DRAFT_ONLY_BY_DEFAULT, SEND_REQUIRES_DELEGATION, WRITE_RISKY_PERMISSIONS_ALWAYS_APPROVAL_GATED
- `audit_expectations`: every send + every expense submission + every board logistics action + every confidential document access audited via existing ADMIN_ACTION + INVOKE_CONNECTOR lineage
- `forbidden_consumers`: AGENT_TWIN_CROSS_TENANT · MANAGER_SURVEILLANCE_TOOL · EMPLOYEE_SCORING_TOOL
- `sensitivity_level`: HIGH
- `adaptation_rules`: per-executive delegation matrix + per-tool delegation marker; private profiling forbidden

## 27. Collaboration map

**Upward**: Executive(s) directly; daily 1:1 cadence; calendar / inbox triage / commitment tracking. Partners: CEO, Founder, COO, CFO, CTO, CHRO, General Counsel, Board Chair.
**Peer**: Other EAs across the executive team — coordination for cross-executive scheduling + board logistics.
**Cross-functional**: CFO (expense), Finance team, IT Admin (executive devices), General Counsel (board), CHRO (executive onboarding).
**Downward**: Admin / Office / Travel / Event coordinators if direct reports exist.
**External**: Vendors + visitors under delegated authority; never represents executive externally without explicit delegation.
**Approval path**: Spend exceptions → CFO; travel exceptions → executive + Finance; board content access → CEO + General Counsel.
**Escalation path**: Conflicts / blockers → supported executive; legal / privacy concerns → General Counsel.

## 28. Risks and guardrails

- Auto-sending executive email (forbidden by default).
- Approving spend above threshold (forbidden by default).
- Exposing private executive matters to enterprise intelligence (absolute forbidden inference).
- Surveillance framing of supported executive's calendar / schedule (forbidden).

## 29. Industry / company-size variants

- **Startup**: EA often doubles as Chief of Staff Assistant; thinner approval chains.
- **SMB**: dedicated EA + Office Manager combined.
- **Mid-market / Enterprise**: dedicated EA per executive; multi-EA coordination across executive team.
- **Regulated**: board portal access more strictly scoped; HIPAA / SOX / GLBA constraints layer onto document access.
- **Legal services**: matter-scoped board / committee work; attorney-client privilege absolute.
