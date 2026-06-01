# CHRO / Head of People

## 1. Role summary

People: hiring, onboarding, offboarding, benefits, employee relations, performance cycles, compliance. CHRO Twin synthesizes hiring-pipeline / onboarding / performance-cycle briefs. **No employee scoring.** **No manager surveillance.** No protected-class inference. Compensation strictly scoped. Per ADR-0058 governance posture.

## 2. Common titles

CHRO · Chief People Officer · VP People · Head of People · HRBP Lead.

## 3. Likely reports to

CEO.

## 4. Possible reports to

COO (in some orgs).

## 5. Likely direct reports

HRBP · Recruiting Lead · People Ops Manager · Benefits Manager · Payroll Manager · L&D Manager.

## 6. Possible direct reports

DE&I Lead · Employee Relations Manager.

## 7. Dotted-line relationships

GC (employment law) · Finance (payroll / comp) · COO.

## 8. Cross-functional partners

GC, CFO, COO, all department heads.

## 9. External collaborators

Benefits providers · payroll vendors · ATS vendors · recruiting agencies · employment counsel.

## 10. Core responsibilities

Hiring · onboarding · offboarding · performance cycles · compensation governance · employee relations · compliance.

## 11. Common decisions

Headcount planning · compensation bands · review cycle calibration · benefits policy.

## 12. Common meetings

Weekly people-ops · quarterly review cycle · monthly comp review · annual planning.

## 13. Common documents / artifacts

Org chart · policies · review templates · headcount plans · benefits docs.

## 14. Common metrics / KPIs

Headcount · attrition · engagement (aggregated only) · time-to-hire. **Never individual scoring.**

## 15. Common tools

Workday · BambooHR · Rippling · Gusto · ADP · Greenhouse · Lever · Lattice · Culture Amp.

## 16. Common workflows

- Hiring Pipeline Risk Review
- Onboarding Checklist
- Offboarding Checklist
- Performance Review Cycle Tracker
- Employee Relations Review Prep

## 17. Approval authority

Hiring within budget. Comp band changes within executive scope.

## 18. Approval dependencies

Compensation changes → CEO + CFO. Offboarding access revocation → IT + Security (dual-control per ADR-0026). Sensitive HR action → GC.

## 19. Delegated authority

Calendar / email delegated to EA.

## 20. Never-default permissions

Protected-class inference · employee scoring · manager surveillance · compensation visibility outside scope · disciplinary decisions without human authority · psychological profiling · health data without HIPAA basis.

## 21. Digital Twin day-one capabilities

Hiring pipeline brief · onboarding checklist · offboarding checklist · review cycle tracker · employee-relations review prep.

## 22. First-week aha moments

1. **Pipeline Risk Snapshot** — open roles + pipeline health (counts; never candidate scoring).
2. **Onboarding Coordination Brief** — new-hire equipment / access / schedule.
3. **Offboarding Coordination Brief** — access revocation + equipment return (dual-control).
4. **Review Cycle Progress** — completion rates (aggregate).
5. **People-Ops Health Brief** — qualitative trends; aggregate only.

## 23. Safe fallback without connectors

Pipeline template · onboarding checklist · offboarding checklist · cycle tracker template.

## 24. Connector implications

HRIS (Workday / BambooHR / Rippling) · ATS (Greenhouse / Lever) · Lattice / Culture Amp. Wave 6: HRIS 6.30, ATS 5.75.

## 25. DMW / Memory Wallet scope notes

Self-scoped CHRO context · HR-scope at aggregate · sensitive employee-relations cases on case-scope. **Forbidden**: individual performance signals beyond cycle data; protected-attribute inference; health data without HIPAA scope; private personal data.

## 26. Governed context envelope notes

- `object_type`: PEOPLE_EXECUTIVE_OPERATING_MODEL
- `policy_purpose`: GOVERNED_PEOPLE_STEWARDSHIP_NO_SURVEILLANCE
- `permission_defaults`: AGGREGATE_FIRST, INDIVIDUAL_GATED, COMPENSATION_SCOPE_GATED
- `sensitivity_level`: CRITICAL
- `forbidden_consumers`: EMPLOYEE_SCORING_TOOL · MANAGER_SURVEILLANCE_TOOL · PROTECTED_ATTRIBUTE_INFERENCE · PSYCHOLOGICAL_PROFILE

## 27. Collaboration map

**Upward**: CEO. **Downward**: HR org. **Peer**: GC, CFO, COO. **Cross-functional**: department heads (hiring + people). **External**: benefits / payroll / ATS / employment counsel. **Approval path**: comp changes → CEO + CFO; offboarding → IT + Security dual-control. **Escalation**: ER incident → GC + CEO.

## 28. Risks and guardrails

Surveillance creep · scoring · protected-class inference · HIPAA / GDPR HR-data violations · disciplinary actions without human authority.

## 29. Industry / company-size variants

- **Startup**: Founder + Ops covers HR.
- **SMB / Mid-market**: dedicated HR Lead.
- **Enterprise**: full org with regional HR.
- **Regulated**: stricter compliance + retention.

## 30. Dandelion Map Implications

Per ADR-0082 Amendment 1 (Dandelion-as-organizational-cartographer doctrine), the CHRO is **an Org / Relationship Map co-owner + a Memory / DMW Map regulator**:

- **Org / Relationship Map co-owner** — CHRO + HR own the canonical org chart (managers / direct reports / dotted-line / employment status). Dandelion's Layer 2 Department seed + Layer 3 Role seed consume HRIS signals where authorized; CHRO validates the resulting Org / Relationship Map.
- **Memory / DMW Map regulator** — CHRO **ensures** the Memory / DMW Map's "must never become enterprise intelligence" region is properly bounded: protected-attribute data, compensation outside scope, employee relations cases, sensitive medical / family / disability / union-activity data. ADR-0058 absolute forbidden inferences are enforced at the CHRO's map-region approval.
- **Risk Map participant** — Hiring pipeline risk + employee-relations risk regions of the Risk Map are CHRO domain (aggregate signals only; never individual employee scoring).
- **Authority Map participant** — Onboarding / offboarding approval chains route through CHRO + IT + Security (dual-control per ADR-0026).

The CHRO Twin produces aggregate hiring / cycle / engagement briefs — **never** individual employee scoring; **never** manager surveillance; **never** protected-attribute inference. The forbidden surveillance language list (per ADR-0082 Amendment 1 §9.5) is enforced absolute at the CHRO surface.
