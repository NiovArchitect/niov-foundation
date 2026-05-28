# Otzar Docs

Product/architecture doctrine for **Otzar** — the governed enterprise
intelligence layer on top of the `niov-foundation` substrate. Otzar
is **not** a generic chatbot, admin console, workflow-automation app,
AI harness, or thin Foundation frontend. It is a governed **Domain
General Intelligence** layer for the enterprise and the operating
layer for the Autonomous Enterprise.

## Contents

- [`DOMAIN_GENERAL_INTELLIGENCE_DOCTRINE.md`](DOMAIN_GENERAL_INTELLIGENCE_DOCTRINE.md)
  — the canonical 20-section doctrine record (identity; enterprise as
  active collaborator; RULE 0 sovereignty; human↔AI-Twin scope parity;
  watching-is-not-surveillance; drift prevention; governed
  best-practice learning; scoped Twin-to-Twin coordination;
  proactivity vs. autonomy; Control Tower as governance/clarity layer;
  hierarchy-routed reporting; multi-tenant/dynamic grouping; bounded
  DGI; the Governed Synchronicity Loop; canonical build order; Wave 1
  framing; non-goals; acceptance criteria). Companion to **ADR-0052**.

## Canonical decision records

- **ADR-0055** — Otzar Correction Signals and Drift-Prevention
  Continuity
  (`docs/architecture/decisions/0055-otzar-correction-signals-and-drift-prevention-continuity.md`)
  — the Wave 2C contract (design-only): closes ADR-0054's
  explicitly-deferred `conversation→correction linkage` non-goal via
  one additive nullable `MemoryCapsule.conversation_id` column +
  extending `POST /otzar/correction` with optional `conversation_id`
  + a new self-scoped sub-resource
  `GET /otzar/conversations/:id/corrections` returning safe counts +
  last-seen freshness. Locks the submitted-vs-learned/applied
  distinction; no IntelligencePattern auto-write; no drift score; no
  manager visibility; no org-wide aggregation. Full drift detection
  remains Wave 3 per ADR-0053 §5. Not yet implemented.
- **ADR-0054** — Otzar Conversation Look-back and Safe Continuity
  Surfacing
  (`docs/architecture/decisions/0054-otzar-conversation-lookback-and-safe-continuity-surfacing.md`)
  — the Wave 2B contract (design-only): a self-scoped
  `GET /otzar/conversations/:id` detail surfacing metadata + close
  summary + topics via an additive `summary_capsule_id` link
  (build-order step 4). No transcripts; per-conversation transparency
  and corrections are honestly deferred (`transparency_available`
  false). Not yet implemented.
- **ADR-0053** — Otzar Employee AI Twin Role-Scope Profile and
  Drift-Prevention Foundations
  (`docs/architecture/decisions/0053-otzar-employee-ai-twin-role-scope-profile.md`)
  — the Wave 2 contract (design-only): additively deepen the employee
  AI Twin into a safe, self-scoped role-scope profile (build-order
  step 3); conversation look-back and drift-prevention foundations
  are bounded follow-ons, not yet implemented.
- **ADR-0052** — Otzar Domain General Intelligence and Governed
  Synchronicity (`docs/architecture/decisions/0052-otzar-domain-general-intelligence-and-governed-synchronicity.md`)
  — the canonical decision the doctrine record companions.
- **ADR-0051** — Otzar Chat Transparency and COE-Governed Retrieval
  Surfacing — the Wave 1 transparency surface ("the first governed
  transparency surface in the larger Domain General Intelligence
  path").
- **ADR-0048** — Foundation/COSMP Personalization-Orchestration
  Substrate — Foundation constructs the governed working set before
  the LLM sees context; the LLM never decides what memory it sees.

Read the doctrine before building or describing any Otzar surface.
Contradiction with the doctrine is drift — surface it (RULE 13) and
stop before building.
