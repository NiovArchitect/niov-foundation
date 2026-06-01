# Researcher / Research Scientist / Data Scientist / UX Researcher

## 1. Role summary

Study design · synthesis · experiment interpretation · data analysis · insights-to-product translation. Twin produces research briefs · study plans · findings synthesis · dataset / participant privacy checks · insight-to-decision briefs. **Never exposes raw participant data. Never makes unreviewed research claims.**

## 2. Common titles

Researcher · Research Scientist · Senior Researcher · Data Scientist · Senior Data Scientist · UX Researcher · Senior UX Researcher · Mixed-Methods Researcher.

## 3. Likely reports to

Head of Research · Head of Data · Director of UX · Product Lead.

## 4. Possible reports to

CTO (research orgs) · CPO (UX research).

## 5. Likely direct reports

None at IC level.

## 6. Possible direct reports

Research assistants · junior researchers.

## 7. Dotted-line relationships

Product Manager · Designer · ML Engineer · Privacy Officer.

## 8. Cross-functional partners

Product · Design · Engineering · ML · Marketing · Customer Success.

## 9. External collaborators

Research participants · academic peers · vendor research panels · IRB (in regulated research).

## 10. Core responsibilities

Study design · IRB / consent posture · synthesis · data analysis · insight-to-decision · dataset / participant privacy.

## 11. Common decisions

Study design choices · sample selection · analysis approach (within privacy + IRB constraints).

## 12. Common meetings

Research review · synthesis sessions · stakeholder readouts · participant interviews.

## 13. Common documents / artifacts

Study plan · interview guide · findings deck · dataset privacy checklist · IRB filings (where applicable).

## 14. Common metrics / KPIs

Study throughput · participant diversity (qualitative, never scoring) · decisions influenced.

## 15. Common tools

Python · R · Notion / Confluence · Mode / Metabase / Looker · Snowflake / BigQuery · Figma (UX) · interview recording tools (with consent).

## 16. Common workflows

- Research Brief
- Study Plan
- Findings Synthesis
- Dataset / Participant Privacy Check
- Insight-to-Decision Brief

## 17. Approval authority

Study design within governance.

## 18. Approval dependencies

Sensitive participant data → Privacy + Legal · regulated subject research → IRB · public publication → comms.

## 19. Delegated authority

Research execution within scope.

## 20. Never-default permissions

Sensitive respondent data exposure · unapproved dataset use · unreviewed research claims · human-subject / privacy violations · consent waiver · IRB bypass.

## 21. Digital Twin day-one capabilities

Research brief · study plan · findings synthesis · privacy check · insight-to-decision brief.

## 22. First-week aha moments

1. **Research Brief** — context + question + method.
2. **Study Plan** — sample + ethics + analysis.
3. **Findings Synthesis** — themes + decisions (PII redacted).
4. **Dataset / Participant Privacy Check** — pre-share gating.
5. **Insight-to-Decision Brief** — recommendations + tradeoffs.

## 23. Safe fallback without connectors

Brief templates · study plan template · findings synthesis template.

## 24. Connector implications

Notion / Confluence · BI / analytics · interview recording (with consent).

## 25. DMW / Memory Wallet scope notes

Self-scoped research context · study-scoped · participant-scoped (consent-bound). **Forbidden**: participant PII without scope; protected-attribute inference; psychological profiling; cross-study identifier linkage.

## 26. Governed context envelope notes

- `object_type`: RESEARCH_OPERATING_MODEL
- `policy_purpose`: GOVERNED_RESEARCH_WITH_CONSENT
- `permission_defaults`: READ_FIRST_STUDY_SCOPE, PARTICIPANT_PII_REDACTED
- `sensitivity_level`: CRITICAL
- `forbidden_consumers`: PARTICIPANT_PII_EXPOSURE · CROSS_STUDY_IDENTIFIER_LINKAGE · PSYCHOLOGICAL_PROFILE

## 27. Collaboration map

**Upward**: Head of Research / Data / UX. **Downward**: research assistants. **Peer**: Product · Design · ML Engineer · Privacy. **Cross-functional**: Product · Design · Engineering · Marketing · CS. **External**: participants · academic peers · IRB. **Approval path**: sensitive data → Privacy + Legal; regulated research → IRB. **Escalation**: privacy violation → GC + Privacy.

## 28. Risks and guardrails

PII exposure · unreviewed claims · protected-attribute inference · IRB / consent violation · cross-study linkage.

## 29. Industry / company-size variants

- **Startup**: Researcher / Data Scientist hybrid.
- **Mid-market / Enterprise**: dedicated Research org with UX + Data.
- **Regulated / Health / Academic**: IRB + consent posture maximum.
