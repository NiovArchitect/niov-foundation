# AI Engineer / ML Engineer

## 1. Role summary

Model pipelines, evaluation, deployment prep, dataset handling, safety / privacy review, experiment tracking. Twin produces experiment briefs · model evaluation summaries · dataset lineage checklists · safety / privacy review prep · research-to-product translation. **Never deploys models. Never bypasses safety / privacy review.**

## 2. Common titles

AI Engineer · ML Engineer · MLOps Engineer · Senior ML Engineer · Staff AI Engineer · Applied Scientist.

## 3. Likely reports to

Engineering Manager (ML) · Head of AI · CTO.

## 4. Possible reports to

Director of Engineering · Chief Data Officer.

## 5. Likely direct reports

None at IC level.

## 6. Possible direct reports

Junior ML engineers (in mentorship).

## 7. Dotted-line relationships

Data Engineer · Data Scientist · Researcher · Security · Privacy.

## 8. Cross-functional partners

CTO · Product · Data Engineering · ML Platform · Security · Legal / Privacy · Compliance · Customer-facing teams (model feedback).

## 9. External collaborators

Research peers · open-source ML community · cloud / GPU vendors · model providers (OpenAI / Anthropic / etc.).

## 10. Core responsibilities

Model pipelines · evaluation harnesses · deployment preparation · dataset lineage · safety / privacy review prep · experiment tracking · infrastructure cost.

## 11. Common decisions

Architecture choices for pipelines · evaluation thresholds · dataset selection within governance.

## 12. Common meetings

ML standup · model review · safety review · deployment review · paper reading.

## 13. Common documents / artifacts

Experiment logs · model cards · dataset lineage docs · safety / privacy review packets · deployment checklists.

## 14. Common metrics / KPIs

Model accuracy / safety metrics · evaluation coverage · deployment cadence · cost per inference. **Never engineer scoring.**

## 15. Common tools

Python · notebooks (Jupyter / Colab) · MLflow / W&B · GitHub · data warehouses (Snowflake / BigQuery / Databricks) · vector DBs · cloud (AWS / Azure / GCP).

## 16. Common workflows

- Experiment Brief
- Model Evaluation Summary
- Dataset Lineage Checklist
- Research-to-Product Translation Brief
- Safety / Privacy Review Prep

## 17. Approval authority

Pipeline implementation within scope.

## 18. Approval dependencies

Model deployment → Safety + Privacy + CISO. Sensitive data use → Legal + Privacy + Compliance. Dataset export → Privacy + Legal.

## 19. Delegated authority

Experiment execution within scope.

## 20. Never-default permissions

Model deployment · sensitive data use without policy · dataset export without approval · unreviewed model changes · bypassing safety / privacy review · production secret access · customer data use without scope.

## 21. Digital Twin day-one capabilities

Experiment brief · evaluation summary · dataset lineage check · safety / privacy review prep · research translation brief.

## 22. First-week aha moments

1. **Experiment Brief** — context + setup + results.
2. **Model Evaluation Summary** — safety + performance.
3. **Dataset Lineage Check** — provenance + privacy posture.
4. **Safety / Privacy Review Prep** — pre-deployment checklist.
5. **Research-to-Product Brief** — research findings → product implications.

## 23. Safe fallback without connectors

Experiment template · evaluation template · lineage checklist.

## 24. Connector implications

GitHub · Project Tracker · Slack · cloud (AWS / GCP / Azure). Vector DB + warehouse access tightly scoped.

## 25. DMW / Memory Wallet scope notes

Self-scoped experimentation · dataset-scoped (with privacy posture) · model-scoped · research-scoped. **Forbidden**: sensitive data use without scope; PII without LawfulBasis; cross-tenant model context leakage.

## 26. Governed context envelope notes

- `object_type`: AI_ENGINEER_OPERATING_MODEL
- `policy_purpose`: GOVERNED_AI_DEVELOPMENT
- `permission_defaults`: READ_FIRST_DATA_WITH_PRIVACY_GATING, MODEL_DEPLOYMENT_REQUIRES_SAFETY_REVIEW
- `sensitivity_level`: CRITICAL
- `forbidden_consumers`: UNREVIEWED_DEPLOYMENT · DATASET_EXFILTRATION · CUSTOMER_PII_LEAKAGE · CROSS_TENANT_MODEL_LEAKAGE

## 27. Collaboration map

**Upward**: EM ML · Head of AI · CTO. **Downward**: junior MLEs (mentorship). **Peer**: Data Engineer · Data Scientist · Researcher · ML Platform. **Cross-functional**: Product · Security · Privacy · Legal · Compliance · customer-facing teams. **External**: research peers · cloud vendors · model providers. **Approval path**: model deployment → Safety + Privacy + CISO; sensitive data → Legal + Privacy. **Escalation**: model safety incident → CISO + GC + CTO.

## 28. Risks and guardrails

Unsafe deployment · dataset exfiltration · PII inference · cross-tenant model leakage · auto-deployment.

## 29. Industry / company-size variants

- **Startup**: AI Engineer is the model / data / deployment.
- **Mid-market / Enterprise**: separation between AI Engineer, MLOps, Platform, Data.
- **Regulated**: model deployment governance maximum (HIPAA / SOX / GDPR / FedRAMP).
