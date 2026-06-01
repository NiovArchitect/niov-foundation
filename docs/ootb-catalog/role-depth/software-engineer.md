# Software Engineer / Developer

> **DEEP role** — builds, reviews, tests, debugs, documents, collaborates with PM / design / QA / security.

## 1. Role summary

The Software Engineer builds, reviews, tests, debugs, and documents software. They collaborate with PM, design, QA, security, and operations. The SWE Twin produces PR / issue summaries, sprint blocker briefs, code review prep, incident context briefs, and ticket-to-implementation plans — under explicit team norms. The Twin never deploys, never merges PRs, never accesses production secrets, never makes destructive repo changes.

## 2. Common titles

Software Engineer · Senior Engineer · Staff Engineer · Principal Engineer · Developer · Backend / Frontend / Full-Stack Engineer · Mobile Engineer · DevOps Engineer · SRE.

## 3. Likely reports to

Engineering Manager.

## 4. Possible reports to

Tech Lead · Principal Engineer (in flatter structures) · CTO directly (smaller teams).

## 5. Likely direct reports

None at IC level.

## 6. Possible direct reports

Junior engineers in mentorship pairings (no formal reporting line).

## 7. Dotted-line relationships

Product Manager (joint delivery accountability) · QA · Security · Design (for frontend / mobile work) · Customer Success / Support (for production triage).

## 8. Cross-functional partners

PM, Design, QA, Security, Customer Success, Support, SRE / Platform.

## 9. External collaborators

Open-source maintainers · vendor support (cloud / SaaS providers) · industry peers · technical community (under company comms policy).

## 10. Core responsibilities

- Build features.
- Review PRs (code review).
- Test + debug.
- Document RFCs + runbooks.
- Respond to incidents per on-call rotation.

## 11. Common decisions

- Implementation choices within team patterns.
- Test coverage / scope.
- Refactor vs. defer.
- Reviewer selection.

## 12. Common meetings

Daily standup · sprint planning · design review · code review · retros · on-call handoff.

## 13. Common documents / artifacts

PRs · issues · RFCs · runbooks · post-mortems · ADRs (team-level).

## 14. Common metrics / KPIs

Team-level: deployment frequency · incident MTTR · cycle time · PR throughput. **Never engineer-level scoring.**

## 15. Common tools

GitHub / GitLab / Bitbucket · Jira / Linear · Slack · CI/CD · Sentry / Datadog / PagerDuty · Confluence / Notion · IDE.

## 16. Common workflows

- PR / Issue Status Summary
- Sprint Blocker Brief
- Code Review Prep
- Incident Context Brief
- Ticket-to-Implementation Plan

## 17. Approval authority

- Code review approval (within CODEOWNERS).
- Merge approval (when reviewer-approved + CI green; per branch protection).

## 18. Approval dependencies

- Production deploy → change-management process.
- Merging to main → review + CI green.
- Database migrations → DBA / Platform review (per company process).
- Customer data access for debugging → Security + Customer Success approval.

## 19. Delegated authority

- Code review delegated by team rotation.
- On-call response within scope.

## 20. Never-default permissions

- Deployment.
- Production secret access.
- Code merge without review.
- Destructive repo changes (force-push to main, branch delete, repo delete).
- Customer data access without approval.
- Audit suppression.

## 21. Digital Twin day-one capabilities

PR / issue summary · sprint blocker brief · code review prep · incident context brief · ticket-to-implementation plan.

## 22. First-week aha moments

1. **PR Status Snapshot** — open PRs + review status + blockers.
2. **Sprint Blocker Brief** — what's stuck and why.
3. **Code Review Prep** — context + key files + suggested reviewers.
4. **Incident Context Brief** — recent on-call signals + relevant runbooks.
5. **Ticket-to-Implementation Plan** — ticket → file paths + tests + risks.

## 23. Safe fallback without connectors

- PR / issue templates · sprint-blocker template · code review checklist · incident-runbook checklist.

## 24. Connector implications

Top by Wave 6 matrix: Slack · GitHub · Project Tracker (Jira / Linear). Tier-2: Sentry · Datadog · PagerDuty.

## 25. DMW / Memory Wallet scope notes

- Self-scoped: SWE working context + open PRs + assigned tickets.
- Team-scoped: sprint context + shared runbooks.
- Project-scoped: feature flag context + epic context.
- Forbidden: secrets · customer data without scope · cross-team performance signals about individuals.

## 26. Governed context envelope notes

- `object_type`: ENGINEER_OPERATING_MODEL
- `policy_purpose`: SCOPED_ENGINEERING_SUPPORT
- `scope_defaults`: TENANT_SCOPED, ENGINEER_SCOPED, TEAM_SCOPED
- `permission_defaults`: READ_FIRST_REPO_TRACKER_OBSERVABILITY, DRAFT_PR_COMMENT, MERGE_GATED_BY_REVIEW_AND_CI
- `sensitivity_level`: HIGH (because secrets risk)
- `forbidden_consumers`: ENGINEER_SCORING_TOOL · MANAGER_SURVEILLANCE_TOOL · CUSTOMER_DATA_EXFILTRATION · SECRET_PAYLOAD_LEAKAGE

## 27. Collaboration map

**Upward**: Engineering Manager; weekly 1:1.
**Downward**: None (mentorship occasional).
**Peer**: Team members · paired engineers · code reviewers.
**Cross-functional**: PM, Design, QA, Security, Support (production triage).
**External**: Open-source community, vendor support, technical community.
**Approval path**: Merge → reviewers + CI; deploy → change-management; DB migration → Platform / DBA.
**Escalation path**: Incident → Engineering Manager + CTO; security risk → Security; customer-data triage → CS + Security.

## 28. Risks and guardrails

- Secret exposure in stack traces, logs, summaries — absolute forbidden.
- Customer data leakage in error reports — redact at ingest.
- Engineer-level scoring — absolute forbidden.
- Auto-merge without review — forbidden.
- Production deploy from a brief / summary — forbidden.

## 29. Industry / company-size variants

- **Startup**: SWE often handles ops + design + product input.
- **SMB / Mid-market**: Specialized roles (backend / frontend / SRE).
- **Enterprise**: Layered team structure with strict change management.
- **Regulated**: Code review + deploy heavily audited; SOC 2 / ISO 27001 alignment.
