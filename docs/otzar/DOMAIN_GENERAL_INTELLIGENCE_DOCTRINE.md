# Otzar Domain General Intelligence Doctrine

> Canonical companion to **ADR-0052** (Otzar Domain General
> Intelligence and Governed Synchronicity). This document is the
> long-form doctrine record; ADR-0052 is its canonical decision.
> Read both before building or describing any Otzar surface.
>
> **Purpose:** prevent architectural and product drift. Future
> Claude Code sessions and human builders must not collapse Otzar
> into a generic chatbot, admin console, workflow-automation app,
> AI harness, or surveillance tool. Otzar is a **governed Domain
> General Intelligence layer for the enterprise**.

This doctrine is written in Register 2 (concrete, business-grade
topology) per ADR-0020 / RULE 19: entities, wallets, capsules,
COSMP, scopes, permissions, audit. No metaphors enter the doctrine
body.

---

## 1. Otzar identity

**Otzar is NOT:**

- a generic chatbot
- a generic admin console
- a generic workflow automation layer
- a generic AI harness
- a simple frontend for Foundation

**Otzar IS:**

- the governed enterprise intelligence layer on top of Foundation
- the operating layer for the Autonomous Enterprise
- a Domain General Intelligence system inside governed enterprise domains
- a collaborative intelligence environment where humans, AI Twins,
  AI Employees, teams, projects, tenants, and the enterprise
  knowledge substrate coordinate under scope

**Canonical statement:**

> Otzar creates Domain General Intelligence for the enterprise by
> giving every employee a scoped AI Twin that observes permissioned
> work context, prevents drift, coordinates with other AI Twins,
> learns best practices, and executes with permission — while
> Control Tower turns organizational complexity into governed
> clarity for admins and leaders.

> Otzar turns the enterprise itself into a governed collaborative
> intelligence layer. Every employee's AI Twin works from the
> employee's scope, but that scope is grounded in the
> organization's living knowledge base — its decisions, workflows,
> policies, projects, hierarchy, and best practices.

Foundation is the substrate. Otzar is the governed enterprise
intelligence layer. Control Tower is the governance / executive
clarity layer. These three roles never collapse into one another.

## 2. The enterprise is an active collaborator

The enterprise is **not** a passive container and **not** merely
data storage. The enterprise/domain is an **active knowledge
collaborator and shared governed context field**.

The enterprise contributes: policies; decisions; workflows; project
history; customer context; team norms; approval paths; best
practices; operational signals; hierarchy; role definitions; risk
rules; prior commitments; organizational memory; tenant boundaries;
department/project context; governed reporting structures.

**The loop:**

```
Enterprise knowledge
  → scoped AI Twin
  → human work
  → team coordination
  → permissioned updates
  → enterprise memory improves
  → future work becomes more aligned
```

This is how Otzar prevents drift at scale.

## 3. Human employee model

Each human employee has: role; responsibilities; projects;
permissions; relationships; work patterns; decision authority;
context boundaries; scope; escalation limits; approval rights;
tenant/department/project memberships; dynamic group memberships.

**The human remains sovereign.**

**RULE 0 (explicit):** Humans/entities are always sovereign. No AI
accesses human/entity/enterprise data without explicit, revocable,
governed permission. Permission is enforced cryptographically /
governed. The system must not expose raw unpermitted data. AI
entities carry lower default permission ceilings than humans; only
a human entity grants LONG_TERM or PERMANENT access; AI entities
cannot grant access to other AI entities.

## 4. AI Twin model

Each employee has an **AI Twin**. The AI Twin shares the **same
governed scope** as the human:

- same RBAC/ABAC boundary
- same project visibility
- same tenant boundaries
- same enterprise context permissions
- same escalation limits
- same constraints
- same allowed actions
- same role-aware and project-aware context

The AI Twin is **not above** the human. It is **not a spy**, **not
a manager**, **not an uncontrolled autonomous actor**. It is the
employee's **scoped extension and direct assistant**.

Its job is to help the employee do their best work by: watching
permissioned work context; learning workflows; detecting drift;
surfacing relevant context; coordinating with other scoped AI
Twins; asking permission when an action crosses a threshold;
executing after permission/policy/approval; improving best
practices; keeping the human aligned with the organization;
protecting focus; reducing rework; reducing context loss; reducing
stale assumptions.

## 5. Watching is not surveillance

> Otzar does not watch employees to judge them. Otzar observes
> permissioned work context to help employees stay aligned, reduce
> drift, and execute better.

Forbidden framing: surveillance; employee monitoring; productivity
policing; behavior judgment.

Required framing: governed workflow intelligence; permissioned work
observation; scoped assistance; drift prevention; context
alignment; best-practice improvement.

## 6. Employee drift prevention (first-class capability)

Employee **drift** includes: working from outdated context; making
decisions from stale assumptions; missing a project change;
duplicating work; ignoring a dependency; forgetting a commitment;
misunderstanding ownership; using the wrong process; falling out of
alignment with leadership direction; missing relevant data from
another scoped team/project; acting before an approval requirement
is satisfied; using stale customer/account/project information;
producing work inconsistent with current enterprise policy or best
practice.

AI Twin drift-catch examples:

- "You are drafting this based on last week's pricing structure.
  Finance updated the pricing rule yesterday. Do you want me to
  adjust the proposal?"
- "This task appears to overlap with Maya's current workstream. I
  can check with her AI Twin before you continue."
- "This customer escalation now requires Director approval based on
  the new policy."
- "The project owner changed yesterday. I can route this to the
  correct person before you send it."
- "This plan conflicts with the current launch dependency. I can
  show the relevant change."

## 7. Best-practice learning (governed)

Otzar learns from permissioned work patterns and outcomes: how the
user makes decisions; how the organization ships work; what good
output looks like; what causes rework; which workflows produce the
best outcomes; which people need to be involved; which approval
paths are fastest; which patterns create drift; what execution
quality looks like by role/team/project; what practices the
organization wants to preserve; how leadership preferences and
enterprise policies shape work.

**Canonical framing:**

> Otzar learns best practices from permissioned work patterns, then
> helps employees execute closer to the organization's best-known
> way of working.

This must be governed: permissioned; scoped; auditable; revocable;
role-aware; tenant-aware; not raw-data leakage; not hidden employee
evaluation.

## 8. AI Twin-to-AI Twin coordination

AI Twins can communicate with each other **when scope allows**,
through scoped, policy-governed channels.

**Canonical framing:**

> AI Twins communicate through scoped, policy-governed channels.
> They exchange only the minimum relevant information needed to
> help their human collaborators.

Example: a Sales employee's Twin preparing a proposal may ask the
Legal Twin (did contract risk change?), the Product Twin (is the
feature commitment still accurate?), the Customer Success Twin (any
unresolved customer issues?), the Finance Twin (is pricing still
correct?), and the Manager/approval Twin (is approval required?).
The Sales Twin summarizes **only what the human is allowed to
know**. The human does not need to prompt every step. The process
remains scoped, permissioned, auditable, governed, role-aware,
project-aware, and hierarchy-aware.

## 9. Proactivity vs. uncontrolled autonomy

> Otzar can proactively prepare, coordinate, and recommend inside
> scope. It executes sensitive actions only under permission,
> policy, or approval.

Otzar **may**: proactively identify relevant context; prepare
drafts; suggest corrections; detect drift; coordinate with scoped
AI Twins; recommend next steps; prepare reports; request approvals;
queue actions; notify the human/admin.

Otzar **must not**: execute sensitive actions without
permission/policy/approval; cross RBAC/ABAC boundaries; leak data
between tenants/projects; expose raw unpermitted data; silently
mutate memory beyond policy; bypass governance; create hidden
unmanaged autonomy.

## 10. Control Tower model

Control Tower is **not** merely a classic admin dashboard. It is
the governance and executive clarity layer; the admin command
surface; the permission/risk/approval visibility layer; the
hierarchy-aware reporting surface; an AI-assisted governance
console; an operational clarity layer.

Traditional admin tools force people to overtrain themselves (read
every report, configure every setting, interpret every alert,
manually connect context, dig through logs, understand every
workflow). Otzar Control Tower reduces that burden with
AI-generated responses, notifications, and report summaries that
state: here is what happened; here is why it matters; here is what
changed; here is what needs approval; here is who is affected; here
is the risk; here is the recommended action; here is what is
drifting; here is what improved; here is what requires leadership
review.

> Control Tower turns organizational complexity into governed
> clarity.

## 11. Reports and hierarchy

Reports are **not** raw data access.

> Reports are generated from permissioned operational signals and
> routed according to hierarchy, scope, and relevance.

Control Tower routes permissioned operational intelligence up the
organizational hierarchy according to: role; authority; tenant;
department; project; scope; sensitivity; need-to-know; approval
rights; reporting line; governance policy; relevance to current
decisions.

**Reporting chain:**

```
employee-level signals
  → project-level summaries
  → team-level reports
  → department-level reports
  → executive-level reports
```

Examples: a COO may see execution drift across departments; a
manager may see blockers across their team; an employee may see
only their own workstream and relevant collaborators; a tenant
admin may see only their tenant; an executive may receive
summarized cross-org risk and alignment reports, **without raw
unpermitted employee data**.

## 12. Multi-tenant and dynamic grouping

Otzar must support: one enterprise with multiple tenants; multiple
organizations/domains; many departments; hundreds to thousands of
employees; many projects; overlapping teams; temporary work groups;
external collaborators; different data boundaries; different
permission rules; different admin hierarchies; dynamic
role/project/group memberships; teams working on different things;
teams working on the same thing; random but governed groupings
based on actual work.

Dynamic groups include: project group; deal team; customer account
team; incident response group; launch team; executive council;
temporary task force; external vendor collaboration; department
swarm; cross-functional blocker group; approval chain group;
audit/reporting group.

Each grouping has **scoped intelligence**.

## 13. Domain General Intelligence definition

Otzar does **not** attempt to create one global AGI. Otzar creates
**Domain General Intelligence inside governed enterprise domains**.
The intelligence is powerful **because it is bounded**.

Within scope it knows: this company; this tenant; this department;
this project; this workflow; this role; this person's permissions;
this hierarchy; this decision history; this operating rhythm; this
customer/account context; this policy set; this approval path; this
work pattern; this best-practice memory.

The system feels AGI-like because it is deeply contextual inside the
domain. It does not need infinite global memory. It needs governed
scoped intelligence.

## 14. Employee experience requirement

The employee should feel: I am not alone; my AI Twin knows what is
happening around me; it catches what I miss; it protects my focus;
it helps me produce better work; it quietly coordinates when needed;
it asks me before taking sensitive action; it keeps me aligned with
the organization; the organization is quietly aligning around me
while I work.

The employee should **not** feel: watched; judged; audited
constantly; interrupted constantly; forced into admin surfaces;
forced to prompt every action; exposed to irrelevant enterprise
noise.

## 15. Enterprise experience requirement

The enterprise should feel: work is becoming more coherent; context
loss is decreasing; rework is decreasing; employees are drifting
less; approvals are clearer; reports are more accurate; leadership
sees what matters faster; best practices are preserved; teams
coordinate more naturally; the organization continues moving even
when humans step away.

## 16. The Governed Synchronicity Loop

The canonical build/runtime methodology is **The Governed
Synchronicity Loop** (technical alias: the **Scoped Execution
Intelligence Loop**).

```
Observe → Understand → Align → Assist → Coordinate
        → Approve → Execute → Report → Learn → Improve
```

Expanded:

1. **Scope first**
2. Observe permissioned work
3. Assemble governed context
4. Detect drift
5. Assist the human
6. Coordinate with other scoped AI Twins
7. Ask permission when action crosses a threshold
8. Execute after permission/policy/approval
9. Report upward by hierarchy and relevance
10. Learn best practices from outcomes
11. Improve future execution

This loop is canonical methodology and must be preserved.

## 17. Canonical build order

This doctrine constrains build order:

1. Foundation governance/contracts
2. Employee Chat + optional transparency
3. My Twin role/scope profile
4. Conversations/look-back
5. Observe/listener summaries
6. Drift detection
7. Best-practice learning
8. AI Twin-to-AI Twin scoped communication
9. Approval-backed execution
10. Control Tower AI notifications/reports
11. Multi-tenant hierarchy reporting
12. Hives/dynamic work groups
13. Agent Playground
14. Desktop ambient shell
15. Autonomous Enterprise

**Sequencing guards:**

- Do not jump to desktop before web experience coherence.
- Do not jump to MCP/connectors before governance and context policy.
- Do not jump to raw transcripts before transcript
  ownership/retention/scope policy.
- Do not jump to hives before single Twin + scope + approvals are
  coherent.
- Do not jump to Agent Playground before enough governed context
  exists.
- Do not build dashboards without real backend events.
- Do not fake autonomy.
- Do not create product surfaces that claim tools/verification/
  memory/autonomy are live before backend contracts support them.

## 18. Relationship to current Wave 1

Current Wave 1 (ADR-0051):

- Foundation backend added optional `transparency` /
  `context_provenance` fields to `conductSession` /
  `ConductSessionSuccess`.
- Control Tower frontend adds a quiet, optional "Why this answer?"
  transparency surface.
- This is the **first visible trust surface**.
- It is **not** full DGI; **not** listener/transcript/MCP/autonomy.
- It is the first user-facing proof that Otzar answers from governed
  scoped context.

Wave 1 is **"the first governed transparency surface in the larger
Domain General Intelligence path."**

## 19. Non-goals / anti-drift rules

Future builders must **not** describe or build Otzar as: a generic
chatbot; a generic AI assistant; a generic workflow automation app;
a generic admin console; a generic AI harness; a productivity
surveillance tool; an employee monitoring tool; a raw transcript
viewer; an ungoverned agent swarm; a global memory fusion system;
an all-knowing AGI with no domain boundary.

Future builders **must preserve**: Foundation as substrate; Otzar as
governed enterprise intelligence layer; Control Tower as
governance/executive clarity layer; AI Twins as scoped employee
extensions; the enterprise as an active knowledge collaborator;
RBAC/ABAC/scope parity between human and Twin; explicit permission
for sensitive action; permissioned observation, not surveillance;
reports routed by hierarchy/scope/relevance; multi-tenant/dynamic
grouping scalability; best-practice learning under governance; drift
prevention as a first-class capability; DGI as bounded, governed,
scoped intelligence.

## 20. Acceptance criteria

This doctrine (and ADR-0052) make it **impossible** for a future
builder to reasonably infer that:

- Otzar is just chat
- Control Tower is just admin settings
- AI Twins are optional assistants with unrelated scopes
- enterprise data is passive storage
- AI can act without permission
- reports are raw data access
- watching equals surveillance
- autonomy can be built before governance
- hives/Agent Playground/desktop should come before core coherence

If any future plan, ADR, commit, or product surface contradicts a
clause above, that is doctrine drift — surface it (RULE 13) and stop
before building.

## References

- **ADR-0052** — Otzar Domain General Intelligence and Governed
  Synchronicity (canonical decision; this is its companion doctrine)
- **ADR-0051** — Otzar Chat Transparency and COE-Governed Retrieval
  Surfacing (the Wave 1 transparency surface)
- **ADR-0048** — Foundation/COSMP Personalization-Orchestration
  Substrate (Foundation constructs the governed working set before
  the LLM sees context; the LLM never decides what memory it sees)
- **ADR-0002** — Append-only audit chain (governance / proof /
  RULE 4 backbone)
- **CLAUDE.md** — RULE 0 (sovereignty), RULE 1 (build forward only),
  RULE 4 (audit before response), RULE 9 (modular connections),
  RULE 13 (surface drifts inline), RULE 20 (rule/ADR authority)
