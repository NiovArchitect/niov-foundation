# IT Admin / Security Admin / GRC / Compliance Officer

## 1. Role summary

IT / Security / GRC: identity + access · endpoint · incident response · compliance evidence · audit posture · policy management · risk register. Twin produces security exception reviews · access drift briefs · audit evidence gap briefs · policy exception reviews. **Never auto-grants access. Never auto-quarantines. Never suppresses audit.** ADR-0070 neutral compliance vocabulary preserved.

## 2. Common titles

IT Admin · Sys Admin · Security Admin · DevSecOps Engineer · CISO · Security Analyst · GRC Manager · Compliance Officer · Privacy Officer · SOC Analyst.

## 3. Likely reports to

CISO / CIO / CTO / General Counsel (Compliance Officer).

## 4. Possible reports to

COO · CFO.

## 5. Likely direct reports

(CISO) Security Analyst · SOC Analyst · GRC Manager · Privacy Officer.

## 6. Possible direct reports

IT Specialists · IT Helpdesk.

## 7. Dotted-line relationships

GC (legal compliance) · CHRO (onboarding/offboarding) · CTO (architecture).

## 8. Cross-functional partners

GC · Compliance · CHRO · CTO · CFO · Engineering.

## 9. External collaborators

Auditors · vendors · regulators (via GC + LawfulBasis) · IDP vendor · security vendors.

## 10. Core responsibilities

Identity + access management · endpoint posture · incident response · compliance evidence · risk register · policy management · audit health.

## 11. Common decisions

Access grant routing (with approval) · policy enforcement · incident triage priority.

## 12. Common meetings

Weekly security ops · quarterly access review · audit committee (where scoped) · weekly compliance review.

## 13. Common documents / artifacts

Incident reports · access reviews · audit evidence · risk register · policies.

## 14. Common metrics / KPIs

MTTD · MTTR · access-review completion · evidence completeness · vulnerability count (aggregate).

## 15. Common tools

Okta · Microsoft Entra ID · Google Workspace Identity · Vanta · Drata · OneTrust · Wiz · CrowdStrike · Snyk · ServiceNow · 1Password · Bitwarden.

## 16. Common workflows

- Security Exception Review
- Access Drift Brief
- Audit Evidence Gap Review
- Policy Exception Review
- Incident Triage Brief
- Onboarding / Offboarding Coordination

## 17. Approval authority

Within policy: low-risk access grants, evidence collection, routine policy enforcement.

## 18. Approval dependencies

Elevated access → dual-control (CISO + IT). Policy change loosening → dual-control + GC. Regulator disclosure → GC + LawfulBasis. Offboarding access revocation → dual-control.

## 19. Delegated authority

Per scope (IT Admin: identity ops; Security: incident triage; GRC: evidence collection).

## 20. Never-default permissions

Auto-grant access · auto-quarantine endpoint · suppress audit · regulator disclosure without lawful basis · grant `can_admin_niov` without bootstrap or dual-control · expose secret payload · claim "guaranteed compliant" / "regulator approved" / "no fine risk".

## 21. Digital Twin day-one capabilities

Security exception brief · access drift snapshot · evidence gap brief · policy exception draft · incident triage brief.

## 22. First-week aha moments

1. **Access Drift Snapshot** — weekly review.
2. **Audit Evidence Gap Brief** — pre-audit checklist.
3. **Security Exception Review** — weekly queue.
4. **Incident Triage Brief** — daily ops.
5. **Policy Gap Brief** — Foundation-native + connector posture.

## 23. Safe fallback without connectors

Access review template · evidence checklist · policy review template · incident runbook (per `rollback-runbook.md` + `monitoring-and-healthcheck.md`).

## 24. Connector implications

Identity (Okta / Entra / GWS Identity) · Compliance Platform (Vanta / Drata / OneTrust) · Security (Wiz / CrowdStrike / Snyk) · ITSM (ServiceNow). Wave 6: Compliance Platform 6.31.

## 25. DMW / Memory Wallet scope notes

Self-scoped · security-scoped · compliance-scoped · incident-scoped · audit-scoped. **Forbidden**: secret payload exposure · cross-tenant signals · employee surveillance framing.

## 26. Governed context envelope notes

- `object_type`: SECURITY_GRC_OPERATING_MODEL
- `policy_purpose`: GOVERNED_SECURITY_COMPLIANCE_STEWARDSHIP
- `permission_defaults`: READ_FIRST_SECURITY_COMPLIANCE, WRITE_DUAL_CONTROL, SECRET_PAYLOAD_FORBIDDEN
- `sensitivity_level`: CRITICAL
- `forbidden_consumers`: AUTO_GRANT · AUTO_QUARANTINE · AUDIT_SUPPRESSION · REGULATOR_WITHOUT_LAWFUL_BASIS · SECRET_PAYLOAD_LEAKAGE · COMPLIANCE_CERTAINTY_CLAIMS

## 27. Collaboration map

**Upward**: CISO / CIO / CTO / GC. **Downward**: Security analysts / SOC / IT specialists. **Peer**: Compliance Officer · Privacy Officer · Engineering Manager · CHRO. **Cross-functional**: HR (onboarding) · Engineering (vuln) · Legal (regulator). **External**: auditors · vendors · regulators (LawfulBasis) · IDP vendor. **Approval path**: elevated access → dual-control; regulator → GC + LawfulBasis; policy loosening → GC + dual-control. **Escalation**: incident → CISO + CEO + GC.

## 28. Risks and guardrails

Auto-quarantine · audit suppression · secret payload exposure · compliance certainty claims · employee surveillance framing.

## 29. Industry / company-size variants

- **Startup**: IT + Security combined; outsourced compliance.
- **SMB / Mid-market**: dedicated IT + GRC.
- **Enterprise**: full security org + CISO + Compliance + Privacy.
- **Regulated**: maximum compliance posture (SOX / HIPAA / FedRAMP / GDPR).
