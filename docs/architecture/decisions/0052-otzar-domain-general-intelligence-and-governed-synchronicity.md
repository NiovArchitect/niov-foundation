# ADR-0052: Otzar Domain General Intelligence and Governed Synchronicity

## Status

Accepted 2026-05-27

Decider: Founder. Authorized at
`[OTZAR-DGI-DOCTRINE-FOUNDATION-DOCS-EXECUTE-VERIFY-AUTH]`.

This is a **doctrine ADR**: it canonicalizes Otzar's product and
architecture truth so future build sessions do not drift. It adds no
runtime behavior, no endpoints, no schema, and no code. Its
long-form companion is
`docs/otzar/DOMAIN_GENERAL_INTELLIGENCE_DOCTRINE.md` (the full
20-section doctrine record); this ADR is the canonical decision.

## Context

Otzar is being built incrementally toward the Autonomous Enterprise.
Across many build sessions there is a recurring drift pressure to
collapse Otzar into something it is not — a generic chatbot, a
generic admin console, a workflow-automation app, an AI harness, a
"thin frontend for Foundation," or (worst) an employee-surveillance
tool. The same pressure pushes builders to sequence the work badly:
desktop before web coherence, MCP/connectors before context policy,
raw transcripts before retention/scope policy, hives/Agent Playground
before single-Twin coherence, dashboards before real backend events,
and product surfaces that claim tools/verification/memory/autonomy
are live before backend contracts support them.

Foundation already encodes the non-negotiables this doctrine depends
on: governed retrieval where the Foundation (not the LLM) decides
what context is in scope (ADR-0048), the append-only audit chain
(ADR-0002), and the first visible trust surface for governed context
(ADR-0051, Wave 1). What is missing is a single canonical record
that fixes Otzar's identity, the human/AI-Twin scope-parity model,
the watching-is-not-surveillance boundary, the Control Tower
governance role, hierarchy-routed reporting, multi-tenant/dynamic
grouping, the bounded definition of Domain General Intelligence, the
build methodology, and the build order — so no future session can
reasonably infer the wrong thing.

## Decision

Foundation adopts the **Otzar Domain General Intelligence Doctrine**
(`docs/otzar/DOMAIN_GENERAL_INTELLIGENCE_DOCTRINE.md`) as canonical.
Every Otzar plan, ADR, commit, and product surface is measured
against it; contradiction is doctrine drift to be surfaced (RULE 13)
before building. The load-bearing locks:

1. **Identity.** Otzar is the governed enterprise intelligence layer
   on top of Foundation — the operating layer for the Autonomous
   Enterprise — a **Domain General Intelligence** system inside
   governed enterprise domains. It is not a generic chatbot, admin
   console, workflow-automation layer, AI harness, or thin Foundation
   frontend. Canonical: *"Otzar turns the enterprise itself into a
   governed collaborative intelligence layer."*
2. **Enterprise as active collaborator.** The enterprise/domain is an
   active knowledge collaborator and shared governed context field,
   not passive storage. Enterprise knowledge → scoped AI Twin → human
   work → team coordination → permissioned updates → enterprise memory
   improves → future work aligns. This is how Otzar prevents drift at
   scale.
3. **RULE 0 sovereignty.** Humans/entities are always sovereign. No
   AI accesses human/entity/enterprise data without explicit,
   revocable, governed permission. Raw unpermitted data is never
   exposed.
4. **Human↔AI Twin scope parity.** Each employee's AI Twin shares the
   human's exact governed scope — same RBAC/ABAC boundary, project
   visibility, tenant boundaries, escalation limits, allowed actions.
   The Twin is a scoped extension, never above the human, never a spy,
   never an uncontrolled actor.
5. **Watching is not surveillance.** *"Otzar does not watch employees
   to judge them. Otzar observes permissioned work context to help
   employees stay aligned, reduce drift, and execute better."* No
   monitoring / policing / judgment framing.
6. **Drift prevention is first-class.** The Twin catches stale
   context, missed changes, duplicated work, unmet approvals, wrong
   process, and policy/best-practice inconsistency.
7. **Governed best-practice learning.** Permissioned, scoped,
   auditable, revocable, role-/tenant-aware — never raw-data leakage,
   never hidden employee evaluation.
8. **Scoped Twin-to-Twin coordination.** *"AI Twins communicate
   through scoped, policy-governed channels. They exchange only the
   minimum relevant information needed to help their human
   collaborators."*
9. **Proactivity vs. autonomy.** *"Otzar can proactively prepare,
   coordinate, and recommend inside scope. It executes sensitive
   actions only under permission, policy, or approval."* No
   boundary-crossing, no cross-tenant leakage, no hidden autonomy.
10. **Control Tower = governance/executive clarity layer**, not a
    classic admin dashboard. It turns organizational complexity into
    governed clarity with AI-generated summaries (what happened, why
    it matters, what changed, what needs approval, who is affected,
    risk, recommended action, what is drifting/improving).
11. **Reports are hierarchy-routed, not raw access.** *"Reports are
    generated from permissioned operational signals and routed
    according to hierarchy, scope, and relevance."* Executives get
    summaries without raw unpermitted employee data.
12. **Multi-tenant + dynamic grouping** at enterprise scale
    (tenants, departments, projects, overlapping/temporary governed
    groups), each with scoped intelligence.
13. **DGI is bounded.** Otzar does not build one global AGI; it
    builds **Domain General Intelligence inside governed enterprise
    domains** — powerful because bounded, governed, and scoped.
14. **The Governed Synchronicity Loop** (alias: Scoped Execution
    Intelligence Loop) is the canonical methodology: Observe →
    Understand → Align → Assist → Coordinate → Approve → Execute →
    Report → Learn → Improve (scope first; permission before
    sensitive action; report by hierarchy/relevance; learn/improve
    from outcomes).
15. **Canonical build order** (doctrine §17) governs sequencing, with
    explicit guards: governance before autonomy; web coherence before
    desktop; context policy before MCP/connectors; transcript
    ownership/retention/scope policy before raw transcripts; single
    Twin + scope + approvals before hives; real backend events before
    dashboards; never fake autonomy.
16. **Wave 1 framing.** ADR-0051's transparency surface is *"the
    first governed transparency surface in the larger Domain General
    Intelligence path"* — not full DGI, not listener/transcript/MCP/
    autonomy.

## Consequences

### Easier

- A single grep-able canonical record fixes Otzar's identity and
  guards every future plan/ADR/commit against drift.
- Build order and sequencing guards are explicit, so future sessions
  know what must precede what (governance before autonomy).
- The doctrine reinforces, and never contradicts, the substrate
  already shipped (ADR-0048 governed retrieval, ADR-0002 audit,
  ADR-0051 transparency); no code or contract changes.

### Harder

- Doctrine ADRs are durable: this is a deliberate constraint on
  future framing/sequencing freedom — that is the point. Changing it
  requires a Founder-authorized superseding ADR (RULE 20).
- Builders must consult the doctrine before describing or sequencing
  Otzar work, which adds a pre-flight step (RULE 12/13).
- The doctrine asserts capabilities (drift detection, Twin-to-Twin
  coordination, hierarchy reporting, dynamic groups) that are mostly
  forward-substrate; builders must not read the doctrine as a claim
  that those surfaces are live (they are sequenced, not shipped).

## Alternatives Considered

### Leave the doctrine implicit across prior ADRs

Rejected: the product truth was spread across ADR-0048/0051 and
prose; nothing prevented a future session from collapsing Otzar into
a generic chatbot/admin console or sequencing autonomy before
governance. A single canonical record is the anti-drift mechanism.

### Put the doctrine only in CLAUDE.md or a reference doc, no ADR

Rejected: CLAUDE.md is the operating manual (rules), and
`docs/reference/` is terminology/anchors. An architectural-doctrine
decision of this weight is an ADR by the repo's own lifecycle
(`docs/architecture/README.md` §ADR Lifecycle) so it carries Status,
citation stability, and supersession discipline.

### Fold the doctrine into ADR-0051

Rejected: ADR-0051 is a Wave 1 contract ADR (a specific additive
response-contract decision). Doctrine and contract are different
registers; conflating them would dilute both and break citation
clarity.

## References

- Doctrine: `docs/otzar/DOMAIN_GENERAL_INTELLIGENCE_DOCTRINE.md`
  (full 20-section companion record)
- ADRs: ADR-0051 (Wave 1 transparency surface this doctrine frames),
  ADR-0048 (Foundation constructs the governed working set; the LLM
  never decides what memory it sees — the DGI substrate anchor),
  ADR-0002 (append-only audit chain; governance/proof backbone)
- Rules: RULE 0 (sovereignty), RULE 1 (build forward only), RULE 4
  (audit before response), RULE 9 (modular connections), RULE 13
  (surface drifts inline), RULE 20 (rule/ADR authority)
- Authorization: `[OTZAR-DGI-DOCTRINE-FOUNDATION-DOCS-EXECUTE-VERIFY-AUTH]`
  (Founder, 2026-05-27)

Bidirectional citations (cited from):

- `docs/architecture/README.md` §Architectural Decision Records
- `CLAUDE.md` §5 (ADR quick-reference jump table)
- `docs/otzar/DOMAIN_GENERAL_INTELLIGENCE_DOCTRINE.md` (companion
  doctrine; cites this ADR as its canonical decision)
- `docs/otzar/README.md` (Otzar docs index)
- ADR-0053 (Otzar Employee AI Twin Role-Scope Profile and
  Drift-Prevention Foundations) — the Wave 2 contract ADR governed by
  this doctrine's build order (step 3) and DGI principles
  (self-scoped, no surveillance, governance before autonomy).
- ADR-0054 (Otzar Conversation Look-back and Safe Continuity
  Surfacing) — the Wave 2B contract ADR for build-order step 4
  (Conversations/look-back), honoring the same DGI principles
  (self-scoped, no transcripts, no fabricated signals).
