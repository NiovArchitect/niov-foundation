# Product Owner / Product Manager

> **DEEP role** — roadmap + requirements + prioritization + customer feedback + release readiness + cross-functional alignment.

## 1. Role summary

The PM / PO turns customer + market + business signals into a prioritized roadmap and well-scoped requirements. They coordinate engineering, design, sales, customer success, support, marketing, legal, and leadership. The PM Twin synthesizes feedback, drafts decision briefs, and surfaces sprint risks — under explicit collaboration norms. The Twin never commits the roadmap externally, never makes legal / compliance claims, never customer-promises without review.

## 2. Common titles

PM · Senior PM · Product Owner · Group PM · Director of Product · Head of Product (when there is no CPO).

## 3. Likely reports to

Head of Product / CPO · Director of Product · VP Product.

## 4. Possible reports to

COO (smaller orgs) · CEO (small startups).

## 5. Likely direct reports

None at IC level. Associate PM at senior PM tier.

## 6. Possible direct reports

Product Operations Specialist · Junior PM · Internal-tool PM.

## 7. Dotted-line relationships

Engineering Manager (joint delivery accountability) · Design Lead · Customer Success Manager · Account Executive (for top accounts).

## 8. Cross-functional partners

Engineering, Design, Sales, Customer Success, Support, Marketing, Legal, leadership.

## 9. External collaborators

Customers (interviews, feedback, beta) · partners (integrations) · advisory board · industry analysts.

## 10. Core responsibilities

- Roadmap definition + reprioritization.
- PRD / requirements drafting.
- Release coordination + go-to-market alignment.
- Customer-feedback synthesis.
- Sprint risk + dependency management.
- Stakeholder communication.

## 11. Common decisions

- Scope tradeoffs.
- Release-go decisions (with eng + design + customer + legal).
- Backlog prioritization.

## 12. Common meetings

Sprint planning · product review · customer interviews · backlog grooming · roadmap reviews · launch checkpoints.

## 13. Common documents / artifacts

PRD · roadmap · release notes · customer feedback synthesis · risk briefs · go-to-market plan.

## 14. Common metrics / KPIs

Roadmap delivery rate · feature adoption · time-to-feedback-loop closure · NPS impact (qualitative). Never employee scoring.

## 15. Common tools

Jira / Linear / Asana / Monday · Figma / FigJam · Notion / Confluence · Slack / Teams · analytics (Mode / Metabase / Looker) · CRM / support feedback (Salesforce / HubSpot / Zendesk / Intercom).

## 16. Common workflows

- Roadmap Decision Brief
- Sprint Risk Summary
- Customer Feedback Synthesis
- Requirements-to-Ticket Draft
- Launch Readiness Checklist

## 17. Approval authority

- Scope choices within roadmap.
- Backlog ordering.
- Beta / feature-flag approval (per policy).

## 18. Approval dependencies

- Roadmap commitments → Head of Product / CPO.
- Customer commitments → Sales / CSM / Legal.
- Pricing changes → Sales / Finance.
- Security / compliance impact → Security + GC.

## 19. Delegated authority

- Sprint-level scope decisions within roadmap.
- Stakeholder communication within product surface.

## 20. Never-default permissions

- Changing committed roadmap without approval.
- Making legal / compliance claims to customers.
- Sending customer commitments without review.
- Bypassing security review for new features.

## 21. Digital Twin day-one capabilities

Roadmap brief · sprint risk summary · customer feedback synthesis · requirements-to-ticket draft · launch readiness checklist.

## 22. First-week aha moments

1. **Roadmap Decision Brief** — context + tradeoffs + customer signals.
2. **Sprint Risk Summary** — dependency + capacity + scope risks (team-level, never engineer-level).
3. **Customer Feedback Synthesis** — themes + decisions; never PII exposure.
4. **Requirements-to-Ticket Draft** — PRD → tickets (PM reviews before commit).
5. **Launch Readiness Checklist** — eng / design / GTM / docs / legal sign-offs.

## 23. Safe fallback without connectors

- Roadmap brief template · sprint-risk template · feedback synthesis template · PRD template.

## 24. Connector implications

Top by Wave 6 matrix: Slack · Project Tracker (Jira / Linear) · Google Workspace / Microsoft 365 · CRM (Salesforce / HubSpot) · Figma. Analytics tools (Mode / Metabase) for product metrics.

## 25. DMW / Memory Wallet scope notes

- Self-scoped: PM operating context.
- Product-scoped: roadmap + PRD + decisions.
- Customer-scoped: interview synthesis (PII redacted; customer-by-customer scope binding).
- Team-scoped: sprint cadence + dependencies.
- Forbidden: PII without scope; protected-attribute inference; competitor data outside license.

## 26. Governed context envelope notes

- `object_type`: PRODUCT_OPERATING_MODEL
- `policy_purpose`: GOVERNED_PRODUCT_DECISIONING
- `scope_defaults`: TENANT_SCOPED, PRODUCT_SCOPED, CUSTOMER_INTERVIEW_SCOPED
- `permission_defaults`: READ_FIRST_TRACKER_DESIGN_FEEDBACK, DRAFT_FOR_ROADMAP_CHANGES, EXTERNAL_COMMITMENTS_GATED
- `sensitivity_level`: HIGH
- `forbidden_consumers`: MANAGER_SURVEILLANCE_TOOL · ENGINEER_SCORING_TOOL · CUSTOMER_PII_LEAKAGE

## 27. Collaboration map

**Upward**: CPO / Head of Product · COO / CEO.
**Downward**: Associate PM (when present).
**Peer**: Engineering Manager · Design Lead · Customer Success Manager · Account Executive · Marketing.
**Cross-functional**: Engineering, Design, Sales, CS, Support, Marketing, Legal.
**External**: Customers (interviews), partners (integrations), advisory board.
**Approval path**: Roadmap commitments → CPO; pricing → Sales + Finance; security / compliance feature → Security + GC.
**Escalation path**: Cross-functional blocker → COO / Engineering Manager; customer commitment crisis → CRO / Sales.

## 28. Risks and guardrails

- Roadmap commitments leaking externally before approval.
- Customer PII exposure in synthesis.
- Overclaiming AI / model behavior to customers.
- Bypassing security / compliance review for new features.

## 29. Industry / company-size variants

- **Startup**: PM often is the founder; Twin's value is feedback synthesis + roadmap shaping.
- **SMB / Mid-market**: Dedicated PM per area.
- **Enterprise**: PM org with PM Ops + Group PM.
- **Regulated**: feature launches gated by compliance review (HIPAA / SOX / etc.).

## 30. Dandelion Map Implications

Per ADR-0082 Amendment 1 (Dandelion-as-organizational-cartographer doctrine), the Product Manager is **a Workflow Map + Aha Moment Map co-author**:

- **Workflow Map co-author** — PM signals which recurring product processes (roadmap reviews / sprint risk reviews / launch readiness / customer feedback synthesis) belong on the Workflow Map per team. Workflow Map regions PM owns activate at ADR-0081 Stage 2 Recommendation-only first.
- **Aha Moment Map participant** — Product-led aha moments (Roadmap Decision Brief / Sprint Risk Summary / Customer Feedback Synthesis / Launch Readiness Checklist) populate the Aha Moment Map for product organizations. PM Twin coordinates with Engineering Manager (Tool Map authority for engineering connectors) + CSM (Customer Map authority for customer feedback regions).
- **Tool Map informer** — PM contributes signals to the Tool Map about which product tools (Jira / Linear / Figma / analytics) the team uses + which connector packs unlock value first.

The PM Twin operates inside the **PM-scoped map region**: own roadmap + own sprint + own customer interview synthesis. Cross-PM signals belong to the Head of Product (forward-substrate; not yet in Wave 2.1).
