# ADR-0070: Regulator-Ready Foundation Doctrine — Examination-Ready Evidence Flows (doctrine-only)

## Status

Accepted 2026-05-31

Decider: Founder. Authorized at
`[FOUNDER-ADR-0070-REGULATOR-READY-FOUNDATION-DOCTRINE-AUTH]`
(2026-05-31).

This is a **doctrine ADR**: it canonicalizes Foundation's
regulator-readiness architectural lens so every future
regulator-touching ADR/implementation inherits one canonical
reference. Long-form companion: project memory
`project_regulator_ready_foundation_substrate.md` (loaded at
session start).

**No code, no schema migration, no new routes, no new audit
literal, no CI change, no service-method signature change,
no UI / Control Tower implementation, no regulator portal
implementation, no external delivery provider, no OAuth, no
billing, no GATS / blockchain / payment implementation, no
legal-advice engine, no automatic disclosure engine, no raw
regulator backdoor, no CLAUDE.md bulk catalog edit in this
commit.**

## Context

Foundation is becoming a governed substrate for enterprises,
humans, AI Twins, DMWs, Hives, Actions, communications,
approvals, evidence, and regulator-facing transparency. In
regulated industries — finance, wealth management,
investment advisory, broker-dealer, healthcare, insurance,
government contracting, energy, telecom, AI governance, and
other high-compliance sectors — companies must often prove:

- what was communicated.
- when work began.
- who knew what.
- who approved what.
- why a decision was made.
- whether client / customer / private information was
  shared properly.
- whether communications happened in approved channels.
- whether records were retained.
- whether supervision happened.
- whether regulators were updated when necessary.
- whether disclosures were timely and complete.
- whether exceptions were remediated.
- whether legal holds were applied.
- whether third-party / vendor risk was governed.
- whether AI / automation decisions were controlled.
- whether regulator access was scoped, auditable, and
  purpose-bound.

Regulatory risk often comes from **gaps in proof**:
uncontrolled communications, missing retention, unclear
project timelines, unapproved channels, incomplete
disclosure workflows, weak supervisory evidence, and
unmanaged regulator access.

The product insight: the regulatory problem is **not only
"send regulators updates"** — it is the **full evidence
lifecycle**. Foundation should make proof continuous.

### Substrate-honest Phase 0 state on `main` (HEAD `7fc1483`)

The following regulator/compliance substrate is already
LIVE and informs ADR-0070's canonical lens:

- **ADR-0036 (REGULATOR Principal + Lawful-Basis
  Attestation Pattern)** — `EntityType.REGULATOR` distinct
  from GOVERNMENT; 3 regulator-specific TAR fields
  (`regulator_jurisdiction` + `regulator_authority_scope` +
  `regulator_credentialed_by`); `LawfulBasis` Prisma model
  + `LawfulBasisType` enum (6 values: SUBPOENA +
  REGULATORY_AUTHORITY + COURT_ORDER + DPA_REQUEST +
  MLAT_REQUEST + CONSENT_OF_DATA_SUBJECT); 3 audit literals
  (REGULATOR_ACCESS_GRANTED + REVOKED + EXPIRED); dual-
  control binding for regulator-grant routes; COSMP 9-
  condition enforcement at NEGOTIATE / readContent (TOCTOU
  re-check) / SHARE / REVOKE entry points; canonical_record/1
  12 → 14 fields with positions 13 + 14 =
  lawful_basis_id + lawful_basis_chain_hash byte-equivalent
  at TS + Elixir registers (12 fixture pairs).
- **ADR-0037 (jurisdiction tagging)** — Entity +
  MemoryCapsule + AuditEvent + OrgSettings jurisdiction
  columns; supports regulator scope discrimination.
- **ADR-0002 (append-only audit chain) + BEFORE DELETE
  trigger** — books-and-records primitive; chain-of-custody
  preservation; cryptographic integrity per ADR-0019.
- **ADR-0049 (GOVSEC umbrella)** — Government-grade
  hardening program; gap-closure register; control matrix
  mapping standards to repo surfaces.
- **ADR-0050 (GOVSEC.5 break-glass)** — Time-boxed
  emergency grants with mandatory `valid_until`; dual-
  control + post-hoc audit; sets the canonical
  "scoped + expiring + audited" pattern.
- **Section 7 Wave 5** — `GET /api/v1/audit/events/regulator-view?lawful_basis_id=…`
  LIVE; regulator-tier read via 9-condition enforcement;
  cross-basis isolation; enumeration-safe failure codes.
- **Section 7 Hardening Wave D (PR #79)** — Proactive
  `REGULATOR_ACCESS_EXPIRED` emitter via
  `tickRegulatorAccessExpirySweep` on the Action scheduler
  cron host (60s; idempotent; supersession-aware);
  REGULATOR_ACCESS_EXPIRED literal reserved at CAR Sub-box
  3 sub-phase 5.
- **Section 6 Wave 7 (PR #119)** — Org-level metadata-only
  compliance-posture aggregate (HEALTHY / WATCH /
  DEGRADED / NOT_CONFIGURED / INSUFFICIENT_POPULATION);
  reads `EntityComplianceProfile` + `ComplianceFramework`
  + recent COMPLIANCE_CHECK_PASSED/FAILED audit rows; same
  k=5 HIPAA Safe Harbor floor + `can_admin_org` gate +
  `ADMIN_ACTION:ANALYTICS_READ` audit.
- **ADR-0026 (dual-control middleware pattern) + Privileged
  Endpoint Registry** — pattern for sensitive regulator-
  facing routes (used by ADR-0036 grant + ADR-0050 break-
  glass).

What is **missing** until this commit: a single canonical
doctrine ADR tying the above substrate into one regulator-
readiness lens, naming the full evidence lifecycle, the
neutral compliance vocabulary, the 20 less-obvious blind
spots, the 10 proposed future substrate sections, the
section-by-section interactions, and the explicit legal-
advice + security/privilege boundaries.

ADR-0070 fills that gap. It is to regulator-readiness what
ADR-0048 is to personalization-orchestration, what ADR-0052
is to Otzar DGI, and what ADR-0069 is to BEAM substrate-
coherence — a canonical lens.

## Decision

Foundation adopts the **regulator-ready doctrine** governing
all current and future regulator-facing substrate
decisions.

### 1. Canonical sentence

> **"Foundation should make regulated companies
> examination-ready by default by turning communications,
> projects, disclosures, approvals, and regulator access
> into scoped, auditable, regulator-ready evidence flows."**

This is **compliance infrastructure, not legal advice**
(see §11 legal-advice boundary).

### 2. Neutral compliance vocabulary (mandatory)

All regulator-touching repo artifacts (ADRs, code
comments, UI copy, commit bodies, product language, error
messages, doc files, schema descriptions, audit details)
MUST use neutral compliance vocabulary:

- regulatory exposure
- examination readiness
- enforcement risk
- supervisory evidence
- books-and-records compliance
- proactive disclosure
- regulator-ready transparency
- compliance evidence lifecycle
- approved-channel communication
- project provenance
- disclosure readiness
- scoped regulator access
- evidence package
- examination room
- legal hold
- chain of custody
- purpose-bound disclosure
- minimal necessary disclosure
- lawful-basis-bound access

Charged language is forbidden across every Register-2
artifact (RULE 19): no "extortion" / "shakedown" /
"regulator trap" / "gotcha regulators" / "weaponized fines"
/ "hostile regulator language" / "adversarial regulator
copy" / anything implying the system is designed to hide
wrongdoing. If charged language surfaces in drafts, reject
it inline per RULE 13 and replace with neutral vocabulary.

### 3. Twelve core principles

#### 3.1 Examination-ready by default

Foundation should help a company continuously assemble the
evidence needed to prove good-faith compliance — not
scramble after a subpoena, exam, inquiry, enforcement
request, regulator meeting, or internal investigation.

#### 3.2 Approved-channel communication

Companies need governed communication pathways where
employees can discuss client / customer / project matters
without using off-channel tools or leaking private data.
Future substrate may support: approved internal
communications; client-data handling controls; scoped
sharing; retention; supervisory review; immutable
communication metadata; safe export; off-channel risk
detection.

#### 3.3 Books-and-records retention

Foundation must preserve compatibility with records that
need to be retained by policy, law, regulation, internal
governance, contract, legal hold, or examination
requirement. Future records may include: communications;
approvals; project decisions; disclosures; client /
customer data handling events; regulator updates;
supervisory review outcomes; evidence packages; AI / agent
action records; exception / remediation records.

#### 3.4 Project provenance

Foundation should eventually prove: project start date;
material milestones; involved entities; decision owners;
approvals; project status changes; regulator update
history; what the company knew and when; what evidence
supports each milestone; which communications and records
support the timeline. This prevents ambiguity around
whether a project was hidden, delayed, disclosed late, or
inadequately supervised.

#### 3.5 Disclosure trigger detection

Foundation should eventually help identify when a project,
product, activity, communication, client / customer
matter, AI workflow, investment process, data event, or
exception may require: internal compliance review; legal
review; supervisory review; regulator update; client /
customer notification; board / executive escalation;
remediation workflow; legal hold.

**Important**: detection is NOT disclosure. A trigger
should create a governed review or proposed-disclosure
workflow, NOT autonomously disclose unless policy
explicitly permits it.

#### 3.6 Regulator-ready evidence packages

Future evidence packages MUST be: scoped by matter; scoped
by regulator; scoped by legal basis; scoped by date range;
scoped by data class; minimal necessary; approved before
release; auditable; exportable; expiration-aware;
chain-of-custody preserved. Contents may include:
timeline; approvals; communications metadata or safe
communication excerpts if authorized; policies applied;
exceptions; remediation; responsible parties; attestations;
supporting records; access history; disclosure history.

#### 3.7 Examination room workflow

Future regulator-facing examination room MUST support:
scoped regulator access; matter-specific access; date-
range access; legal-basis-bound access; expiration /
revocation; access logs; minimal data exposure; **no raw
backdoors**; evidence-package downloads where authorized;
compliance / legal review before publication where
required.

#### 3.8 Supervisory review

Future supervisory queues may cover: communications
review; disclosure review; regulator update review;
project timeline gaps; client-data handling exceptions;
AI / agent action exceptions; off-channel risk; stale
evidence packages; legal hold triggers; remediation
attestations; unresolved exceptions.

#### 3.9 Legal hold / subpoena readiness

Future legal-hold substrate may support: retention freeze;
deletion prevention; chain of custody; matter-based record
collection; safe export; access logging; preservation of
communications, project timelines, approvals, and audit
records; proof that relevant records were retained after
hold trigger.

#### 3.10 Scoped regulator access

Regulators MUST NEVER receive raw, unrestricted access.
Regulator access MUST be: scoped; lawful-basis-bound;
matter-bound; date-range-bound; data-class-bound; purpose-
bound; minimal; auditable; expiring where appropriate;
revocable where appropriate; approved or policy-governed;
legally / compliance reviewed where required.

ADR-0036 LawfulBasis is the canonical existing primitive
implementing this principle at the audit-viewer tier
(`regulator-view` route + 9-condition enforcement +
canonical_record positions 13 + 14 cryptographic binding +
REGULATOR_ACCESS_EXPIRED auto-emitter).

#### 3.11 Proactive regulator update workflows

Future regulator-update substrate may support: optional
company-initiated updates; scheduled regulator updates;
event-triggered update proposals; compliance-approved
updates; policy-required updates; regulator-specific
templates; evidence-backed updates; receipt / proof of
delivery; retention; post-update audit trail.

**Important**: proactive regulator update does NOT mean
ungoverned disclosure. Every update MUST pass: scope,
policy, approvals, minimality, lawful basis, and audit.

#### 3.12 Compliance evidence vault

Future evidence-vault substrate may maintain regulator-
ready artifacts: audit-backed reports; communications
evidence; project provenance; disclosure history;
approvals; attestations; remediation evidence; lawful-
basis records; regulator access history; retention / legal-
hold state; export manifests.

### 4. Twenty blind spots (the less-obvious failure modes)

ADR-0070 names the blind spots that many compliance
systems miss. Future regulator-touching ADRs MUST address
the applicable subset inline.

1. **Project timeline defensibility** — regulators may ask
   when work actually began and whether the company
   delayed disclosure or failed to supervise.
2. **Communication-channel provenance** — it is not enough
   to preserve messages; the company must prove
   communications happened in approved channels under
   appropriate controls.
3. **Client / customer data handling context** — employees
   may need to communicate about clients / customers, but
   Foundation must distinguish permitted, scoped, need-to-
   know communication from improper sharing.
4. **Supervisory evidence** — a company must prove not
   only that a policy existed, but that review,
   escalation, exception handling, and remediation
   actually happened.
5. **Disclosure timing** — the system should track why a
   disclosure was or was not required at a specific time,
   not only whether a disclosure was eventually made.
6. **Regulator meeting preparation** — companies need
   pre-meeting evidence bundles: what changed since last
   update, active projects, material decisions, open
   risks, pending disclosures, remediation status,
   evidence supporting statements made to regulators.
7. **Regulator meeting aftermath** — after regulator
   meetings, Foundation should eventually track: what was
   represented, commitments made, follow-up requests,
   deadlines, responsible owners, required evidence,
   completion status.
8. **Legal hold trigger timing** — the system must prove
   when a hold was triggered and what records became
   frozen.
9. **Third-party / vendor evidence** — regulated companies
   depend on vendors; Foundation must eventually capture
   third-party risk, outsourcing oversight, vendor
   access, incidents, and evidence of controls.
10. **AI / automation governance** — as companies use AI /
    agents, regulators will need proof of: policy
    boundaries; human approvals; model / tool access;
    action logs; exceptions; override history;
    remediation; no unapproved autonomous decisions.
11. **Data minimization and over-disclosure risk** —
    regulator-ready does NOT mean "share everything."
    Over-disclosure creates privacy, legal, privilege,
    business, and cross-client risk.
12. **Privilege / confidentiality boundaries** — legally
    privileged material, confidential business strategy,
    client data, employee data, and unrelated records must
    not be exposed merely because regulator access
    exists.
13. **Matter isolation** — evidence for one inquiry / exam
    / matter must not bleed into another.
14. **Attestation lifecycle** — executives, compliance
    officers, supervisors, and responsible owners may
    need to attest that evidence packages are accurate,
    complete, and approved.
15. **Versioned evidence packages** — a regulator-facing
    package may change over time; Foundation should
    eventually preserve versions, diffs, approval
    history, and delivery history.
16. **Regulator-specific obligations** — different
    regulators, jurisdictions, industries, and product
    lines require different evidence and retention
    policies.
17. **Obligation change management** — regulations
    change. Foundation should eventually support
    obligation mapping and periodic updates, without
    pretending to provide legal advice.
18. **Exception and remediation loop** — if something is
    wrong, Foundation should help prove: detection,
    escalation, remediation plan, owner, deadline,
    completion, post-remediation evidence.
19. **Non-retaliatory / non-surveillance posture** —
    compliance infrastructure must NOT become employee
    surveillance or manager spy tooling. It should focus
    on governance, evidence, supervision, and safe
    communication. (Inherits ADR-0052 §5 / ADR-0053 §5 /
    ADR-0058 §1 / ADR-0068 §13.)
20. **Regulator access revocation / expiration** —
    access MUST expire, be revocable where appropriate,
    and be audited. (Already partially canonical at
    ADR-0036 + ADR-0050 + the
    `tickRegulatorAccessExpirySweep` emitter.)

### 5. Ten proposed future substrate sections

Each future section is forward-substrate; ADR-0070 does
NOT authorize any of these. They are enumerated so future
authorization slices have a canonical reference point.

#### A. Regulated Communications Layer

Future capabilities: approved-channel communication;
scoped client / customer / project messaging; retention by
policy; safe search / export; supervisory review; off-
channel risk detection; client-data handling controls; no
raw leakage outside authorized scope.

#### B. Project Provenance Ledger

Future capabilities: project start date; material
milestones; knowledge timeline; approvals; communications
linkage; regulator update status; evidence supporting each
milestone; timeline export.

#### C. Disclosure Trigger Engine

Future capabilities: event-to-obligation mapping; project
/ product / client / activity triggers; AI / automation
triggers; third-party incident triggers; disclosure
proposal creation; compliance / legal review; **no
autonomous disclosure unless explicitly authorized**.

#### D. Regulator Update Workflow

Future capabilities: draft update; evidence-backed
statements; review chain; approval chain; delivery record;
receipt / proof; follow-up tracking; retention.

#### E. Examination Room / Evidence Package

Future capabilities: scoped evidence room; matter-bound
package; minimal necessary records; access expiration;
access audit; export manifest; evidence-package
versioning; regulator-specific views.

#### F. Legal Hold / Subpoena Readiness

Future capabilities: hold trigger capture; record freeze;
deletion prevention; chain of custody; matter collection;
safe export; preservation logs.

#### G. Supervisory Review Console

Future capabilities: review queues; exceptions;
escalations; attestations; stale items; remediation
status; communication review; disclosure review.

#### H. Regulator Access Governance

Future capabilities: regulator identity; authority /
lawful basis; matter; date range; data classes; purpose
binding; expiration; revocation; access logs; approval
chain.

ADR-0036 LawfulBasis is the canonical foundational
substrate; section H is the broader product surface
around it.

#### I. Regulatory Obligation Mapping

Future capabilities: industry / jurisdiction / regulator /
entity type / product type mapping; update cadence;
obligation metadata; workflow scaffolding; **no legal-
advice claims**; legal / compliance review required.

#### J. Compliance Evidence Vault

Future capabilities: regulator-ready artifacts; immutable
proof of controls; audit-backed reports; communications
evidence; project provenance; disclosure history;
approvals; attestations; legal hold state; regulator
access history.

### 6. Interaction with existing Foundation sections

#### 6.1 Section 1 — Employee Intelligence Core / Otzar Twin

MUST preserve non-surveillance language. The Otzar Twin
may eventually help users stay compliant by surfacing
reminders, but MUST NOT become employee scoring, manager
spying, psychological profiling, or compliance-risk
ranking. (Inherits ADR-0052 §5 + ADR-0053 §5 + ADR-0058 §1
+ ADR-0068 §13 anti-surveillance posture.)

#### 6.2 Section 2 — Autonomous Execution Core

Any regulator update, disclosure, legal-hold action,
evidence-package publication, or retention freeze MUST
eventually pass through governed Action runtime where
appropriate: policy, approvals, scoped permissions, audit,
dual-control if required, **no unapproved autonomous
disclosure**.

#### 6.3 Section 3 — Hives / Team Intelligence

Team communication and Hives may eventually support
approved-channel collaborative work, but no same-org
coordination should leak client / private / regulator-
sensitive data outside scope. (Inherits ADR-0059 v1 same-
org boundary.)

#### 6.4 Section 4 — MCP / Connectors

External regulator delivery, email, Slack, DMS, archive
tools, GRC systems, vendor systems, and regulator portals
are connector adapters — NOT core disclosure logic. Each
adapter needs its own QLOCK / RULE 21 / credential /
OAuth / delivery-proof posture. (Inherits the Section 4
governed-adapter pattern.)

#### 6.5 Section 5 — Agent Playground

Simulation may eventually help test disclosure
strategies, remediation plans, and project-risk
alternatives, but it MUST NOT provide legal advice or
fabricate compliance certainty. (Inherits ADR-0060 §1
sandbox-only + ADR-0065 §5 no-leak doctrine.)

#### 6.6 Section 6 — Enterprise Analytics

Compliance-posture aggregates MUST remain metadata-only,
thresholded (k=5 HIPAA Safe Harbor minimum per ADR-0061
§1.c), non-legal-advice, and non-employee-scoring. Future
analytics may support examination-readiness indicators,
evidence completeness, stale disclosures, and unresolved
exceptions — each as its own slice per ADR-0061 §5
Founder authorization checkpoints.

#### 6.7 Section 7 — Full Audit Viewer

Section 7 is **central** to regulator-ready evidence.
Future work may include: cross-scope `verify-chain`
expansion (org-admin / niov-admin / regulator);
evidence-package export; matter-bound audit bundles;
regulator access audit; legal-hold verification; chain-of-
custody proof; examination-room audit views. Existing
substrate (`regulator-view` route + LawfulBasis 9-condition
enforcement + REGULATOR_ACCESS_EXPIRED emitter) is the
foundation; future slices extend per ADR-0070's lens.

#### 6.8 Section 8 — Billing / Entitlements

Regulator-ready features may become premium enterprise /
compliance capabilities, but **billing MUST NOT affect
required retention or lawful obligations once activated**.
A compliance feature gated by billing that gets disabled
mid-matter cannot drop already-frozen records or already-
granted regulator access; deactivation must be
contractually + technically separated from data integrity.

#### 6.9 Section 9 — Admin / Governance Control Tower

Control Tower may eventually support: compliance officer
workflows; supervisory review; regulator access approvals;
evidence-package assembly; disclosure review; legal hold
management; attestations; exception remediation. (Inherits
the existing backend contracts substantially complete per
Hardening Wave C.)

#### 6.10 Section 10 — Deployment / Security / Go-Live

Regulator-ready substrate requires: retention policies;
backup / restore; immutable logs; access controls;
encryption; incident response; vendor risk posture; export
controls; operational resilience. (Inherits the GOVSEC
umbrella per ADR-0049.)

### 7. Interaction with ADR-0069 (BEAM substrate-coherence law)

Most ADR-0070 doctrine is NOT automatically BEAM work — the
TypeScript + Prisma + Postgres + Action-runtime + audit-
chain primitives already deliver the bulk of regulator-
ready surface at appropriate scale.

However, future long-running regulator-ready workflows MAY
be BEAM-fit when they involve:

- Evidence-room sessions (long-running per matter).
- Disclosure workflows (long-running per disclosure).
- Supervisory queues (high-throughput).
- Regulator access monitoring (continuous).
- Legal-hold processing (long-running per hold).
- Audit / event ingestion (append-heavy).
- Background retention jobs.
- High-throughput communication capture.
- Event streams.
- Backpressure.
- Cross-system coordination.

Every future regulator-ready implementation touching those
domains MUST apply ADR-0069 §6's mandatory 8-question
architecture check inline. (See ADR-0069 §3 domains 4 + 5
+ 7 for the BEAM strong-fit anchors most relevant to
regulator-ready substrate.)

ADR-0069 §10 already cross-references this ADR's future
sections (books-and-records retention at scale; approved-
channel communications capture; regulator-update workflow;
examination-room access governance; supervisory review
queues).

### 8. Security / privacy / privilege boundaries

Regulator-ready Foundation MUST NEVER create raw regulator
backdoors. Across every regulator-touching surface, the
following are **forbidden by-construction**:

- Unrestricted regulator access.
- Raw Memory Wallet exposure.
- Raw capsules outside scope.
- Raw transcripts outside scope.
- Prompt / chain-of-thought exposure.
- Embeddings / vectors exposure.
- Storage locations.
- Content hashes.
- Bridge IDs.
- Secret refs.
- Permission internals.
- Unrelated cross-org data.
- Unrelated cross-client data.
- Unrelated employee data.
- Privileged legal material without explicit authorization.
- Confidential business strategy outside matter scope.
- Manager spy surfaces.
- Employee scoring.
- Hidden surveillance.

(Inherits the existing repo-wide no-leak discipline +
ADR-0036 SAFE projection at `regulator-view` + ADR-0052 /
0053 / 0058 / 0068 anti-surveillance doctrine.)

### 9. Legal-advice boundary

Foundation MAY provide: workflow scaffolding; evidence
organization; obligation metadata; compliance posture;
disclosure-workflow controls; evidence-package assembly;
regulator-access governance; books-and-records retention;
supervisory-review queues.

Foundation MUST NOT claim to provide: legal advice; legal
conclusions; guaranteed compliance; regulator approval;
attorney-client privileged analysis; jurisdictional
interpretation; fitness-for-particular-regulator
certification.

Allowed copy at regulator-facing surfaces includes
phrases like:

- "may require review"
- "potential disclosure trigger"
- "compliance review recommended"
- "evidence package"
- "not a legal determination"
- "requires legal / compliance approval where applicable"

Forbidden copy across every Register-2 artifact:

- "compliant"
- "guaranteed compliant"
- "regulator-approved"
- "legally sufficient"
- "no fine risk"
- "automatic legal advice"
- "regulator-cleared"
- "this satisfies [obligation]"

### 10. Substrate-honest substrate-coherence binding statement

Across the entire Foundation codebase, the canonical
sentence at §1 + the neutral vocabulary at §2 + the 12
core principles at §3 + the 20 blind spots at §4 + the
security / privilege boundaries at §8 + the legal-advice
boundary at §9 are **regulator-ready substrate-coherence
law**.

Future ADRs / implementations that violate any of the
above (e.g., adding a raw regulator backdoor; claiming
legal-advice certainty; building employee surveillance
under a compliance label; bypassing dual-control on
regulator-grant routes; exposing privileged material
without authorization; ignoring matter isolation; failing
to address the blind-spot subset relevant to the slice)
MUST surface the violation per RULE 13 + cite ADR-0070 +
obtain explicit Founder authorization to override.

### 11. Explicit non-goals at this commit

- No code.
- No schema migration.
- No new routes.
- No new service-method signatures.
- No new audit literal.
- No external delivery provider.
- No regulator portal.
- No legal-advice engine.
- No automatic disclosure engine.
- No data-retention implementation.
- No legal-hold implementation.
- No communications-product implementation.
- No Control Tower frontend.
- No BEAM implementation.
- No Python implementation.
- No GATS / blockchain / payment work.
- No OAuth.
- No billing.
- No raw regulator backdoor.
- No CLAUDE.md bulk catalog edit (catalog stops at
  ADR-0055; bulk refresh is its own RULE 20-authorized
  slice).
- No bulk rewrite of older ADRs (back-citations are
  minimal per §Bidirectional citations below).
- No Section 7 cross-chain `verify-chain` work.
- No current active slice derailment.

## Consequences

### Easier after this ADR

- Every future regulator-facing ADR / implementation cites
  one canonical doctrine.
- Section 7 cross-chain `verify-chain` expansion can be
  scoped through the regulator-ready lens.
- Compliance-posture analytics extensions remain honest
  and non-legal-advice by default.
- Approved-communications design has a clear non-
  surveillance boundary.
- Evidence-room / disclosure-workflow / legal-hold /
  supervisory-review features get clear scope boundaries.
- Regulator access remains scoped + auditable +
  expiring + revocable by-construction across every future
  surface.
- Proactive disclosure can be designed without raw
  backdoors.
- The doctrine-ADR triad (ADR-0048 personalization /
  ADR-0052 Otzar DGI / ADR-0069 BEAM substrate-coherence /
  ADR-0070 regulator-ready) covers Foundation's
  architectural-lens register for the four most cross-
  cutting concerns.

### Harder after this ADR

- Every regulator-facing slice MUST address the
  applicable evidence-lifecycle dimensions inline.
- More explicit approvals + legal / compliance review
  surfaces required at future implementation slices.
- More attention to privilege + minimization at every
  surface.
- More careful separation between compliance
  infrastructure and legal advice in copy.
- More design work before external delivery or regulator
  portals.
- The 20 blind spots become a mandatory subset check at
  every regulator-touching ADR.

### Substrate-state catches resolved

- ADR-0036 LawfulBasis substrate now has a doctrine-tier
  parent that names the broader product surface it
  belongs to.
- The Section 7 `verify-chain` cross-scope forward queue
  has a canonical lens to design against.
- The Section 6 compliance-posture aggregate future
  extensions have a canonical lens.
- The 10 future substrate sections from the project-
  memory directive are now canonical at the ADR register
  (each remains forward-substrate behind its own slice
  authorization).
- The non-surveillance doctrine (Otzar Twin / drift /
  proactive cards) is reinforced at the regulator-ready
  register so future compliance-flavored work cannot
  accidentally regress into employee scoring.

## Forward queue

Each item is forward-substrate; ADR-0070 does NOT
authorize any of these. They are listed so future
authorization slices have a canonical reference point.

1. **Section 7 cross-chain `verify-chain` scope expansion**
   (org-admin / niov-admin / regulator scopes; matter-
   bound and role-bound where applicable; performance /
   leakage review; separate QLOCK).
2. **Regulator access scope model expansion** (regulator
   identity; matter; legal basis; expiration; revocation;
   access logs — extends ADR-0036 LawfulBasis at the
   product-surface register).
3. **Examination Room / Evidence Package ADR** (scoped
   evidence room; package versioning; export manifest;
   minimal necessary disclosure).
4. **Project Provenance Ledger ADR** (project timeline;
   milestones; communications linkage; disclosure status;
   approval chain).
5. **Regulated Communications Layer ADR** (approved-
   channel messaging; retention; supervisory review;
   client-data handling controls).
6. **Disclosure Trigger Engine ADR** (trigger detection;
   proposed disclosures; review chain; no unapproved
   auto-disclosure).
7. **Legal Hold / Subpoena Readiness ADR** (preservation
   triggers; chain of custody; deletion prevention; safe
   export).
8. **Supervisory Review Console ADR** (review queues;
   exceptions; attestations; remediation loop).
9. **Regulatory Obligation Mapping ADR** (jurisdiction /
   regulator / product / entity-type mapping; update
   cadence; no legal-advice claims).
10. **Compliance Evidence Vault ADR** (immutable
    artifacts; proof of controls; regulator-ready reports;
    approvals and attestations).
11. **Connector delivery adapters for regulator updates**
    (Section 4 governed adapters; credential scope;
    delivery proof; no raw over-disclosure).
12. **BEAM-backed regulator workflow processing** (only
    if ADR-0069 §6 architecture check selects BEAM;
    evidence-room sessions / disclosure workflows / long-
    running supervisory queues / audit-event ingestion at
    scale).

## Bidirectional citations

- Cites RULE 0 (sovereignty — every regulator-touching
  surface inherits scope by construction).
- Cites RULE 4 (audit before response — books-and-
  records primitive).
- Cites RULE 13 (substrate-honest inline surfacing of
  blind-spot coverage + legal-advice / privilege
  violations).
- Cites RULE 19 (two-register IP discipline — neutral
  vocabulary is Register-2 canonical; charged framing is
  Register-1 internal-only and never enters Register-2
  repo artifacts).
- Cites RULE 20 (this ADR's creation explicitly Founder-
  authorized).
- Cites RULE 21 (substrate-architectural research arc —
  every regulator-ready slice touching cross-jurisdiction
  / external regulators / cross-language boundaries MUST
  run RULE 21).
- Cites ADR-0001 (RULE 0 source).
- Cites ADR-0002 (append-only audit chain — books-and-
  records primitive).
- Cites ADR-0019 (cryptographic-suite posture — audit-
  chain integrity).
- Cites ADR-0026 (dual-control middleware pattern —
  sensitive regulator-grant routes).
- Cites ADR-0036 (REGULATOR Principal + Lawful-Basis
  Attestation Pattern — load-bearing existing substrate;
  the canonical primitive ADR-0070 canonicalizes the
  doctrine around; bidirectional back-citation landed in
  this commit).
- Cites ADR-0037 (jurisdiction tagging — supports
  regulator scope discrimination).
- Cites ADR-0049 (GOVSEC umbrella — government-grade
  hardening program; bidirectional back-citation landed
  in this commit).
- Cites ADR-0050 (GOVSEC.5 break-glass — scoped +
  expiring + audited canonical pattern).
- Cites ADR-0051 (Otzar chat transparency — non-
  surveillance discipline inheritance).
- Cites ADR-0052 (Otzar DGI doctrine — §5 watching-is-not-
  surveillance; §6 drift prevention bounded; §9
  proactivity vs autonomy).
- Cites ADR-0053 (Otzar employee Twin role-scope profile
  — §5 boundary; non-surveillance posture).
- Cites ADR-0057 (Action runtime — governed disclosure /
  update delivery; future regulator workflows route here).
- Cites ADR-0058 (drift-detection coaching/alignment —
  non-surveillance boundary).
- Cites ADR-0061 (Section 6 enterprise analytics SAFE
  projection — compliance-posture aggregate; metadata-
  only thresholded honest framing; bidirectional back-
  citation landed in this commit).
- Cites ADR-0068 (Otzar Wave 3 scoped Twin proactivity —
  non-surveillance + symbiotic posture).
- Cites ADR-0069 (Elixir/BEAM Substrate-Coherence Law —
  future regulator-ready BEAM slices run §6 architecture
  check; bidirectional back-citation landed in this
  commit; ADR-0069 §10 already cross-references this
  ADR).
- Project memory companions (loaded at session start):
  `project_regulator_ready_foundation_substrate.md`
  (long-form companion) +
  `project_elixir_beam_canonical_division_of_labor.md`
  (ADR-0069 long-form companion; cross-referenced at §7).
- Cited from ADR-0071 (Section 7 Cross-Scope Audit
  Verify-Chain Design; design-only ADR landed 2026-05-31).
  ADR-0071 operationalizes this ADR's §Forward queue item
  1 ("Section 7 cross-chain `verify-chain` scope
  expansion") at the design contract register; closes that
  forward-queue reservation at the design tier. ADR-0071
  §10 explicitly preserves ADR-0070's §3.7 examination-
  room boundary + §3.10 scoped regulator access never
  raw + §8 security/privilege boundaries + §9 legal-
  advice boundary; verify-chain is a chain-integrity
  primitive that future Examination Room / Evidence
  Package / Legal Hold ADRs may compose against, but is
  not itself the examination room, evidence package, or
  legal-hold surface.
- Cited from ADR-0072 §10 (Section 5 Wave 5 Candidate-
  Generation Contract; design-only ADR landed 2026-05-31).
  ADR-0072 §10 inherits this ADR's §9 legal-advice boundary
  verbatim — allowed copy ("compliance review recommended",
  "policy review required", "not a legal determination") /
  forbidden copy ("legally sufficient", "guaranteed
  compliant", "regulator approved") apply to every Wave 5
  candidate field. ADR-0072 §9 + §14 + §16 inherit this
  ADR's §8 security/privilege boundaries verbatim. ADR-0072
  does NOT authorize Wave 5 implementation; that remains a
  separate Founder slice.

## Founder authorization

Per RULE 20: this ADR + the architecture/README.md
catalog entry + minimal bidirectional back-citation
snippets in ADR-0036 / ADR-0049 / ADR-0061 / ADR-0069 +
the NEXT_ACTION.md refresh land under explicit Founder
authorization at
`[FOUNDER-ADR-0070-REGULATOR-READY-FOUNDATION-DOCTRINE-AUTH]`
2026-05-31.

The authorization is **doctrine-ADR-only** — every future
regulator-ready implementation slice in the §Forward
queue requires its own separate Founder authorization at
the implementation slice.
