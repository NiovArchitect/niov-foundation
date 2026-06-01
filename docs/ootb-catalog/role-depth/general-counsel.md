# General Counsel / Legal / Compliance

## 1. Role summary

Legal: contracts, regulatory, board secretary, risk, privacy, disputes, evidence packs. GC Twin synthesizes contract review queue + audit-evidence gap reviews + regulator-evidence prep. Never produces legal certainty claims · never auto-signs · never bypasses privilege.

## 2. Common titles

General Counsel · Chief Legal Officer · VP Legal · Head of Legal · Deputy General Counsel.

## 3. Likely reports to

CEO.

## 4. Possible reports to

Board (audit / governance committee for some reporting).

## 5. Likely direct reports

Compliance Officer · Privacy Officer · Contract Manager · Legal Ops · Risk Manager.

## 6. Possible direct reports

Litigation counsel (in-house) · Regulatory counsel.

## 7. Dotted-line relationships

CFO (financial / SOX) · CISO (security incidents) · CHRO (employment law) · COO (vendor contracts).

## 8. Cross-functional partners

CEO, CFO, CISO, CHRO, Compliance, Board secretary.

## 9. External collaborators

Outside counsel · regulators (with LawfulBasis per ADR-0036) · auditors · litigation counterparties.

## 10. Core responsibilities

Contract review · regulatory engagement · board secretary · risk management · policy oversight · privacy posture · litigation oversight.

## 11. Common decisions

Contract approval · policy approval · regulator-engagement strategy · litigation strategy (with external counsel).

## 12. Common meetings

Weekly legal review · board committees · litigation status reviews · privacy / compliance reviews.

## 13. Common documents / artifacts

Contracts · policies · board minutes · regulator filings · litigation strategy memos.

## 14. Common metrics / KPIs

Contract throughput · regulatory exposure · litigation status · audit posture (qualitative).

## 15. Common tools

DocuSign · Ironclad · LinkSquares · Evisort · Vanta · Drata · OneTrust · SharePoint / Google Drive · legal docs DB.

## 16. Common workflows

- Contract Review Queue
- Audit Evidence Gap Review
- Regulator Evidence Prep
- Privacy Review Prep
- Policy Exception Review

## 17. Approval authority

Contracts within authority. Policy approval.

## 18. Approval dependencies

Contract signature above threshold → CFO / CEO. Litigation settlement → CEO + Board. Regulator disclosure → LawfulBasis required.

## 19. Delegated authority

Legal ops + contracts within scope.

## 20. Never-default permissions

Legal advice as AI certainty · regulator disclosure without lawful basis · privilege waiver · unapproved evidence export · auto-sign · claim "guaranteed compliant" / "regulator approved" / "no fine risk".

## 21. Digital Twin day-one capabilities

Contract review queue · evidence gap brief · regulator prep checklist · privacy review prep · policy exception draft.

## 22. First-week aha moments

1. **Contract Review Queue** — daily queue + priority.
2. **Audit Evidence Gap Brief** — ahead of audit cycle.
3. **Regulator Evidence Prep** — only with LawfulBasis.
4. **Privacy Review Brief** — DSAR + DSR queue.
5. **Policy Exception Review** — weekly queue.

## 23. Safe fallback without connectors

Queue templates · evidence checklist · review templates.

## 24. Connector implications

Legal / Contracts (DocuSign / Ironclad / LinkSquares / Evisort) · Compliance Platform (Vanta / Drata / OneTrust). Wave 6: 6.63 + 6.31.

## 25. DMW / Memory Wallet scope notes

Self-scoped · matter-scoped (attorney-client privilege absolute) · regulator-scoped (LawfulBasis required) · compliance-scoped · board-scoped. **Forbidden**: cross-matter leakage; privilege waiver by AI.

## 26. Governed context envelope notes

- `object_type`: LEGAL_EXECUTIVE_OPERATING_MODEL
- `policy_purpose`: GOVERNED_LEGAL_STEWARDSHIP_NEUTRAL_COMPLIANCE_VOCAB
- `permission_defaults`: READ_FIRST_LEGAL, DRAFT_NEVER_CERTAINTY, REGULATOR_LAWFUL_BASIS_GATED
- `sensitivity_level`: CRITICAL
- `forbidden_consumers`: PUBLIC_LEGAL_CERTAINTY_CLAIMS · CROSS_MATTER_LEAKAGE · REGULATOR_WITHOUT_LAWFUL_BASIS

## 27. Collaboration map

**Upward**: CEO + Board (governance / audit committee). **Downward**: Compliance, Privacy, Contract Manager, Legal Ops. **Peer**: CFO, CISO, CHRO. **Cross-functional**: all departments for contracts + policy. **External**: Outside counsel, regulators (LawfulBasis), auditors. **Approval path**: contract signature above threshold → CFO / CEO; regulator disclosure → LawfulBasis. **Escalation**: litigation crisis → CEO + Board.

## 28. Risks and guardrails

AI legal certainty claims · privilege waiver · regulator-approval claims (forbidden per ADR-0070) · MNPI leakage · cross-matter leakage · ungoverned evidence export.

## 29. Industry / company-size variants

- **Startup**: outside counsel only; founder reviews.
- **SMB / Mid-market**: GC + Compliance.
- **Enterprise**: full legal org + privacy + regulatory.
- **Public / Regulated**: maximum SEC / regulatory compliance.
