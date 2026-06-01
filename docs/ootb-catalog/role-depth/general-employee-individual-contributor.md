# General Employee / Individual Contributor

> **Wave 2.1 priority per Founder addendum** — every IC role needs a self-scoped Twin that helps with daily work without surveillance, scoring, or peer monitoring.

## 1. Role summary

The General Employee / IC owns self-scoped work, commitments, meetings, blockers, requests, and team collaboration. The IC Twin helps the IC personally with their workday — never the manager surveilling them, never peer monitoring, never performance scoring. The Twin operates from the IC's own work context (their calendar, their email, their tasks) and produces self-scoped briefs.

## 2. Common titles

Individual Contributor · IC · Specialist · Senior Specialist · Coordinator · Analyst · Associate · Manager (when functioning as IC).

## 3. Likely reports to

Department manager · Team lead · Engineering Manager / Product Manager / Sales Manager / etc. depending on function.

## 4. Possible reports to

Skip-level executive (in flat orgs) · cross-functional lead (matrix orgs).

## 5. Likely direct reports

None at IC level.

## 6. Possible direct reports

Junior team member (mentorship; no formal reporting line).

## 7. Dotted-line relationships

Cross-functional partners on their projects · project manager · subject-matter experts they work with.

## 8. Cross-functional partners

Manager · direct team · project manager · cross-functional owners.

## 9. External collaborators

Customers / vendors / partners / clients within their explicit role scope only. Never representing the company externally without delegation.

## 10. Core responsibilities

- Execute their assigned work.
- Track their own commitments.
- Coordinate with their team.
- Request access / tools / approvals as needed.
- Communicate proactively about blockers.
- Self-manage time and focus.

## 11. Common decisions

- Daily work prioritization within manager guidance.
- Implementation choices within team patterns.
- Meeting acceptance / decline within calendar discipline.

## 12. Common meetings

Standup / team sync · 1:1 with manager · project meetings · skip-level meetings (occasional) · all-hands.

## 13. Common documents / artifacts

Personal task list · meeting notes · team docs · project artifacts · status updates · OKR tracking (self-reported).

## 14. Common metrics / KPIs

Self-set goals + manager-aligned OKRs. **Never peer-monitoring · never surveillance · never performance scoring beyond standard cycle data.**

## 15. Common tools

Calendar · email · chat (Slack / Teams) · docs (Notion / Google Workspace / M365) · project tools (Jira / Linear / Asana / Monday) · department-specific tools.

## 16. Common workflows

- My Workday Brief
- My Open Commitments
- My Project Blockers
- Meeting Follow-Up Draft
- Tool Access / IT Request Prep

## 17. Approval authority

- Self-scoped decisions within role.
- Standard work execution.

## 18. Approval dependencies

- Travel / spend → manager.
- Tool / access request → manager + IT.
- Customer commitment → manager + Sales / CSM.
- Cross-team scope change → manager + project lead.

## 19. Delegated authority

None by default. May receive delegated authority from manager for specific tasks (e.g., representing team in a meeting).

## 20. Never-default permissions

- Manager surveillance framing of own data (the IC's own Twin should never feel like a manager-monitoring tool).
- Peer monitoring (IC Twin must never surface signals about other ICs).
- Performance scoring.
- Private / personal capture (personal email outside work context, private chats, family / health / financial outside work).
- Cross-team / cross-org visibility into peers.
- Customer PII outside their explicit role scope.
- Secrets · credentials.

## 21. Digital Twin day-one capabilities

- My Workday Brief — synthesizes calendar + open commitments + priority items.
- Meeting Follow-Up Draft — post-meeting commitment + follow-up.
- Tool Access / IT Request Prep — pre-formatted request.
- Project Blocker Request — draft escalation to manager.
- Personal Focus Time Protection — calendar discipline.

## 22. First-week aha moments

1. **My Workday Brief** — "Here's your day at a glance — calendar, commitments, priorities."
2. **My Open Commitments** — "Here's what you said you'd do."
3. **My Project Blockers** — "Here's what's stuck for you; here's a draft escalation."
4. **Meeting Follow-Up Draft** — "Here's the follow-up draft from your last meeting."
5. **Tool Access / IT Request Prep** — "Here's a pre-formatted request for the tool you need."

## 23. Safe fallback without connectors

Daily brief template · commitment tracker · meeting note template · IT request template. IC Twin works from Foundation-native state + the IC's own input.

## 24. Connector implications

Calendar · Email · Chat (Slack / Teams) · Docs (Google Workspace / M365) · Project tracker (Jira / Linear / Asana / Monday). The IC Twin's value scales with the IC's daily tool stack but degrades gracefully.

## 25. DMW / Memory Wallet scope notes

- **Self-scoped memory first.** The IC's own work commitments, calendar, meeting notes.
- Project / team scope only when scoped (project membership; team rotation; explicit shared scope).
- Client / customer scope only when role permits and consented.
- **Private / personal memory suppressed at ingest** (private chats, family, health, personal finance, personal political).
- Safe metadata retained only — never raw content of suppressed sources.
- Sharing memory with another Twin requires explicit governed authorization.

Canonical IC line: *"Your Memory Wallet is how Otzar remembers safely — it remembers your work, not your private life."*

## 26. Governed context envelope notes

- `object_type`: IC_OPERATING_MODEL
- `policy_purpose`: SELF_SCOPED_INDIVIDUAL_CONTRIBUTION_SUPPORT
- `scope_defaults`: SELF_SCOPED, TEAM_SCOPED_ONLY_WHEN_AUTHORIZED, PROJECT_SCOPED_ONLY_WHEN_MEMBER
- `permission_defaults`: READ_OWN_WORK_CONTEXT, DRAFT_OWN_COMMUNICATIONS, NEVER_PEER_MONITORING
- `audit_expectations`: every IC Twin action audited at standard cadence; never surfaces other ICs' behavior
- `sensitivity_level`: HIGH (because surveillance risk is the failure mode)
- `forbidden_consumers`: MANAGER_SURVEILLANCE_TOOL · PEER_MONITORING · EMPLOYEE_SCORING_TOOL · PRIVATE_PERSONAL_LIFE_INGEST
- `adaptation_rules`: adapts only to the IC's own corrections + manager-aligned OKRs; never to other ICs' signals

## 27. Collaboration map

**Upward**: Manager (weekly 1:1) + skip-level (occasional). The IC Twin produces summaries for the IC's own use; never produces manager-side surveillance content.
**Downward**: Junior team members in mentorship pairing (no formal reporting line).
**Peer**: Direct team + cross-functional partners on their projects. The IC Twin coordinates the IC's commitments with peers' commitments transparently.
**Cross-functional**: Project manager · cross-functional owners · HR (people workflows) · IT (access / tools) · Finance (expenses / procurement) · Support / Ops depending on role.
**External**: Customers / vendors / partners within explicit role scope. Never representing the company externally without manager + GC approval.
**Approval path**: Travel / spend → manager; tool access → manager + IT; customer commitment → manager + Sales / CSM; cross-team scope change → manager + project lead.
**Escalation path**: Blockers → manager (with draft escalation); risks → manager + project lead; people-issue → manager + HR; security issue → manager + Security.

## 28. Risks and guardrails

- **Surveillance creep is the central failure mode.** The IC Twin must always feel like *the IC's* Twin — not *the manager's* tool. Every UI surface and brief must preserve self-scope.
- Peer monitoring — absolute forbidden.
- Performance scoring beyond standard cycle — forbidden.
- Private / personal capture — forbidden by default; suppress at ingest.
- Manager-side aggregation of IC's behavioral signals — forbidden (CHRO / People role owns aggregate cycle data; IC Twin does not feed it).
- Cross-IC peer comparison — absolute forbidden.
- Family / health / personal political content — absolute forbidden.

## 29. Industry / company-size variants

- **Startup**: IC often wears many hats; Twin's value is breadth of context.
- **SMB / Mid-market**: dedicated role with clearer scope.
- **Enterprise**: highly specialized roles; Twin operates within department scope.
- **Regulated**: compliance + privacy constraints layer onto every IC's tool stack (HIPAA / SOX / GDPR / FedRAMP).
- **Union / Labor-organizing context**: respect for union activity; never surveille union organizing per ADR-0079 forbidden categories.
