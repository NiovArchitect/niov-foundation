# ADR-0088 — Enterprise Communication Intelligence Layer Doctrine (Design-Only)

**Status:** Accepted 2026-06-02

**Authorization:** `[FOUNDER-AUTH — W5 + LIVING ENTERPRISE INTELLIGENCE AUTONOMOUS BUILD]` per RULE 20.

## Context

The Founder-direction Living Enterprise Intelligence (LEI) sequence names **Enterprise Communication Intelligence Layer** as the LEI sequence step after Hive Intelligence Runtime (ADR-0087 LIVE PR #223 `26ec1dc`). The doctrine:

> "Communication is the enterprise nervous system. Otzar must eventually understand: Slack, Google Workspace / Google Meet, Microsoft 365 / Teams, Zoom, Email, Calendar, Docs, Voice sessions, Future Office Glass."

The LEI direction also names strict bans:

- no transcript vault
- no surveillance
- no raw transcript by default
- no employee scoring
- no manager surveillance

And mandatory requirements:

- work-relevance filtering
- non-work / private suppression
- tenant isolation
- DMW scoping
- audit
- retention controls

Per RULE 21 the Founder direction is explicit:

> "If unsure about Zoom, Teams, Meet, Graph, or transcript APIs, research official docs before implementation. Start with architecture/readiness if runtime would require vendor scopes, recordings, transcripts, or consent decisions."

This ADR is the architecture/readiness ADR — **design-only; no code, no schema, no routes, no runtime activation, no vendor scopes requested, no recordings ingested, no transcripts retained**. Every implementation slice E1-E10 named in §7 below requires separate per-slice Founder authorization.

Substrate that this ADR composes against (all LIVE):

- **Section 4 connector matrix** (ADR-0084 + CT PR #32) — 6/6 OPERATING parity: Slack / Google Workspace / Jira Cloud / Linear / GitHub / Microsoft 365. Read-first per ADR-0084; per-connector writes are ≥C6 forward-substrate.
- **Section 3 Hive substrate** (ADR-0059/0062/0063/0064) — team/org-scoped coordination data tier.
- **Section 6 Enterprise Analytics SAFE projection** (ADR-0061) — k=5 minimum-population + closed-vocab + same-org + no per-actor attribution. Now 7 LIVE aggregates including HIVE_PARTICIPATION + APPROVAL_BACKLOG.
- **Hive Intelligence Runtime V1** (ADR-0087 LIVE PR #223) — the team/org-tier coordination-intelligence substrate register.
- **W4 Proposed Action substrate** (ADR-0081 §2.2 Stage 3 LIVE PR #220) — closed-vocab Stage 3 proposed-action catalog including `HIVE_COORDINATOR` actor role.
- **W5 Action Promotion Runtime** (ADR-0086 LIVE PR #222) — the governed bridge from W4 → Section 2 Action runtime.
- **Section 1 Drift Signals** (ADR-0058 LIVE) — work-relevance filtering + non-work suppression precedent for CORRECTION capsules.
- **ADR-0049 GOVSEC** + **ADR-0050 Break-Glass** + **ADR-0036 LawfulBasis** — regulator-readiness substrate.
- **ADR-0079 Retention Class** — STANDARD / AGGREGATE_ONLY / EPHEMERAL retention vocabulary.

## Decision

### 1. The doctrine — communication is the enterprise nervous system, bounded by RULE 0

Enterprise Communication Intelligence Layer (ECIL) is the substrate register that lets Otzar derive **governed coordination intelligence** from enterprise communication surfaces — without becoming a transcript vault, an employee scoring tool, a manager surveillance dashboard, or a psychological inference engine.

Canonical doctrine lines (must not be paraphrased into watered-down framing in any subsequent ADR, RAA, product surface, or customer document):

- **"Communication is the enterprise nervous system."**
- **"Otzar reads coordination signals from communication, not surveillance data about people."**
- **"Raw transcripts are never the default surface — derived governed signals are."**
- **"Every communication-derived signal obeys the same RULE 0 sovereignty, DMW scope, consent, audit, and retention discipline as every other Foundation surface."**
- **"Communication intelligence is bounded by what the human entity has consented to share for coordination purposes — never extracted, scraped, or inferred without explicit revocable permission."**

ECIL is **NOT** an enterprise surveillance product. It is **NOT** a productivity scorer. It is **NOT** a transcript indexer for legal discovery. It is **NOT** an HR investigation tool. It is a coordination-intelligence substrate.

### 2. Five canonical communication surfaces in v1 scope

V1 (this ADR) names five canonical surfaces. Zoom + Office Glass are forward-substrate to future Founder-authorized ADR amendments.

| Surface | Section 4 connector | V1 disposition |
|---|---|---|
| **Slack** | OPERATING (admin self-serve + CT PR #32 operator-invokable; SLACK_READ) | Read-first metadata-derivation only; no message-content ingestion at V1 |
| **Google Workspace** (Calendar + Drive + Gmail + Meet + Docs) | OPERATING (GOOGLE_WORKSPACE_READ) | Read-first metadata-derivation only; calendar `freebusy` + event metadata preferred; Meet transcript ingestion is forward-substrate E5+ |
| **Microsoft 365** (Calendar + Mail + Teams + Drive) | OPERATING (MICROSOFT_365_READ) | Read-first metadata-derivation only; calendar + presence metadata preferred; Teams transcript ingestion is forward-substrate E5+ |
| **Voice sessions** | Voice-First arc per ADR-0085 (VF.1-VF.4 LIVE; VF.5+ Founder-gated) | Voice intent envelope per ADR-0085 §5; no production microphone capture in V1 |
| **Email / Calendar / Docs (cross-cutting)** | Aliased to Google Workspace + Microsoft 365 above | Metadata only at V1 |

**Forward-substrate (NOT authorized by this ADR):**

- Zoom — pending separate ADR + Founder authorization + vendor research arc per RULE 21
- Office Glass — pending product surface materialization
- Discord / WhatsApp / Signal / SMS / IRC / etc. — pending per-vendor Founder authorization

### 3. Four-tier signal pyramid — metadata-first, never raw-content-first

Every ECIL signal MUST land on one of four tiers. The lower the tier, the lower the surveillance risk + the higher the governance safety. Higher tiers require explicit Founder authorization per surface + per signal.

**Tier 1 — Metadata-derived signals (V1 ALLOWED; preferred by default).**

Derived from already-LIVE Section 4 connector read-first capabilities + Section 1/3/6/Hive Intelligence Runtime aggregates. No message-body or transcript ingestion. Examples:

- Meeting count per org per window (Calendar metadata)
- Calendar free/busy density (Google Calendar `freebusy` + Microsoft Graph `Calendars.Read` `freeBusy`)
- Channel-membership distribution per Slack workspace (`conversations.members` only)
- Connector-activity frequency (LIVE per ADR-0061 CONNECTOR_ACTIVITY)
- Approval-backlog signal (LIVE per ADR-0087 APPROVAL_BACKLOG)
- Hive-participation signal (LIVE per ADR-0061 HIVE_PARTICIPATION)

**Tier 2 — Consent-bound content-summary signals (FORWARD-SUBSTRATE; Founder-gated).**

Per-human-entity explicit consent required (per ADR-0001 RULE 0 + ADR-0080 PermissionBundle + ADR-0048 4-tier permission envelope when authorized). Per-purpose, per-conversation, per-window revocable. Examples requiring future Founder authorization:

- AI Twin-authored summary of a meeting **the human entity is a participant in** (never one they aren't)
- Action-item extraction from a Slack thread where the entity has explicitly opted the AI Twin in
- Decision-record extraction from email where the entity has explicitly opted the AI Twin in

These signals are NEVER ingested without (a) entity consent, (b) per-purpose scope, (c) revocability, (d) DMW scope binding, (e) RULE 4 audit, (f) RULE 10 soft-delete, (g) retention class per ADR-0079, (h) provenance binding per ADR-0048 working-set discipline.

**Tier 3 — Cross-source coordination intelligence (FORWARD-SUBSTRATE; Founder-gated).**

Compose Tier 2 signals across multiple surfaces (e.g., commitment made in a meeting → tracked across Slack follow-ups → resolved or stalled in Jira). Composition is consent-bound at every link. Requires:

- Section 4 connector matrix at OPERATING parity (LIVE)
- Tier 2 ingestion authorized per surface (forward-substrate)
- Working-set provenance per ADR-0048 (forward-substrate)
- W5 promotion path for proposed-action follow-ups (LIVE per ADR-0086)

**Tier 4 — Predictive / preventive coordination intelligence (FORWARD-SUBSTRATE; Founder-gated; bounded by sovereignty law).**

Identifies coordination risks before they manifest (launch risks, dependency bottlenecks, commitment cascades). Strictly bounded by: never predicts individual behavior; never produces individual risk scores; never proposes actions without human-in-the-loop approval; composes against Hive Intelligence Runtime forward-queue signals.

### 4. The five inviolable bans (assertion-locked at runtime when V1 ships per future Founder-authorized slices)

(1) **No transcript vault.** Raw transcripts are NEVER persisted to Foundation storage by default at any tier. Tier 2 content summaries are derived projections; the raw transcript stays at the vendor surface (subject to the vendor's retention discipline) and is fetched on-demand for derivation with per-fetch audit + per-fetch consent verification.

(2) **No surveillance.** ECIL signals are aggregated at the org / team / coordination tier — never per-employee, never per-manager-of-employee, never per-team-lead-of-team. Section 6 SAFE projection pattern (ADR-0061 §1.a) applies: k=5 minimum-population gate + closed-vocab labels + no per-actor attribution.

(3) **No employee scoring.** Per ADR-0052 §8 + ADR-0058 + ADR-0061 §1.a + ADR-0080 §11 + ADR-0082 Amendment 1 + ADR-0083 + ADR-0084 + ADR-0085 + ADR-0086 + ADR-0087: the universal ban on employee scoring extends to ECIL verbatim. No "communication-style score." No "responsiveness ranking." No "follow-through index."

(4) **No psychological / health / political / relationship inference.** ECIL signals are coordination-friction signals — not personal-state inference. The forbidden inference categories from ADR-0079 + ADR-0083 §1 apply absolute.

(5) **No autonomous external execution at this tier.** Acting on an ECIL signal (e.g., sending a follow-up draft, posting a Slack reminder) flows through W5 Action Promotion Runtime per ADR-0086. ECIL never bypasses W5, never bypasses Section 2, never invokes a connector write directly. Connector writes remain ≥C6 forward-substrate per ADR-0084.

### 5. Vendor research findings (RULE 21 research arc embedded)

Research conducted 2026-06-02 against canonical authoritative sources:

#### 5.1 Slack

- **Transcript / message-content access** — `conversations.history` Web API method + per-channel membership gate. `*:history` OAuth scopes required. Source: https://docs.slack.dev/reference/methods/conversations.history/
- **Audit Logs API** is **Enterprise Grid only** and **does NOT log message contents** — only access/admin/install/login events. `auditlogs:read` scope; org-tier OAuth token. Source: https://docs.slack.dev/admins/audit-logs-api/
- **Retention** — workspace-wide configurable; per-channel/per-conversation retention overrides are paid-plan only (Business+/Enterprise Grid). Free workspaces capped at 90 days. Source: https://slack.com/help/articles/203457187-Customize-data-retention-in-Slack
- **Safer signal-derivation surfaces** (Tier 1 ECIL preferred): `conversations.members` (channel membership), `conversations.info` (channel metadata), `users.getPresence` (presence) — all metadata-only, all match the Tier 1 doctrine.
- **What Slack does NOT provide (Foundation must enforce externally):** per-user revocable consent for content reads, content-level audit trail, native scoped derivation surface, cross-workspace tenant isolation outside Grid.

#### 5.2 Google Workspace

- **Meet transcript / recording** — tier-gated to Business Standard+ / Enterprise; saved to organizer's Drive post-meeting; fetched via Meet REST API. Source: https://www.spinach.ai/blog/get-full-transcript-google-meet
- **Google's own boundary statement (quoted verbatim):** *"The Meet REST API isn't intended for performance tracking or user evaluation within your domain. Meet data shouldn't be collected for this purpose."* Source: https://developers.google.com/workspace/meet/api/guides/overview
- **OAuth scopes** — fine-grained read/write separation. Least-privilege for availability signals: `calendar.freebusy` + `calendar.events.freebusy`. Read-only event metadata: `calendar.events.readonly`. Source: https://developers.google.com/workspace/calendar/api/auth
- **Meet artifact access** requires both sensitive AND restricted OAuth scopes → forces Google verification + third-party security assessment + 4-7 week approval window. Source: https://www.spinach.ai/blog/get-full-transcript-google-meet
- **Reports API audit retention is 180 days maximum** — much shorter than NIOV's append-only chain (RULE 10 + ADR-0002). Source: https://workspaceupdates.googleblog.com/2026/04/workspace-audit-logs-new-functionality-and-expanded-event-fields-in-the-admin-console.html
- **Reports API surface is metadata-only** (event-level who/what/when) — never message bodies or file contents. Source: https://developers.google.com/workspace/admin/reports/v1/overview
- **What Google does NOT provide:** cross-app governed working-set construction; content-level scoped redaction; per-purpose revocable consent envelope; 180-day audit horizon insufficient for patent-implementation evidence; no protocol-layer surveillance boundary (Google's statement is policy, not cryptographic enforcement).

#### 5.3 Microsoft 365 / Teams / Graph

- **Teams transcripts / recordings** — accessible via Graph only when transcription/recording explicitly enabled on the meeting; fetched post-meeting as `.vtt` / `.mp4`. Source: https://learn.microsoft.com/en-us/microsoftteams/platform/graph-api/meeting-transcripts/overview-transcripts
- **Metering** — 600-minute/month free evaluation per app; AI Insights API requires Microsoft 365 Copilot license per end user. Source: https://learn.microsoft.com/en-us/graph/teams-licenses
- **Permission types** — Delegated (cannot exceed signed-in user's access; user/admin consent) vs Application (tenant-wide; admin consent only). RSC (Resource-Specific Consent) narrows app-only Teams permissions to a single chat/meeting where the app is installed. Source: https://learn.microsoft.com/en-us/graph/permissions-overview
- **Purview Unified Audit Log captures activity METADATA only, not message bodies / email content / file content.** Default retention: 180 days (Audit Standard); 1 year (Exchange/SharePoint/OneDrive/Entra for E5); up to 10 years with add-on + E5. Source: https://learn.microsoft.com/en-us/purview/audit-log-retention-policies
- **Application Access Policy** lets admins scope app-only Exchange access to specific mailboxes. Source: https://learn.microsoft.com/en-us/graph/permissions-reference
- **What Microsoft does NOT provide:** cryptographically-chained tamper-evident audit (Purview is queryable log store, deletion administratively possible); per-capsule revocable consent boundary; attribution of derived intelligence (audits the read event, not downstream AI inference); content-vs-metadata discrimination at audit tier; cross-tenant sovereignty enforcement beyond app-permission scope.

#### 5.4 Cross-vendor synthesis — Foundation governance gaps that must be enforced externally

All three vendors share the same architectural gaps for an enterprise-governance layer:

1. **No cryptographically-chained tamper-evident audit** — Foundation's `AuditEvent` chain (ADR-0002 + RULE 4 + BEFORE DELETE trigger) is the canonical substrate that fills this gap.
2. **No per-purpose, per-capsule, per-conversation revocable consent** — Foundation's `Permission` model + ADR-0048 4-tier permission envelope + ADR-0080 PermissionBundle fill this gap.
3. **No cross-app governed working-set construction** — Foundation's `COE.assembleContext` per ADR-0048 fills this gap.
4. **No anti-surveillance enforcement at protocol layer** — Foundation's RULE 0 + same-org boundary + k=5 minimum-population gate + closed-vocab labels enforce this cryptographically/architecturally.
5. **No long-horizon evidence trail** — Foundation's append-only audit chain (RULE 10) extends past any vendor's retention horizon.
6. **No drift-prevention / correction-signal primitive** — Foundation's `CORRECTION` capsule + ADR-0055 + Section 1 Wave 6 fill this gap.
7. **No working-set provenance binding** — Foundation's working-set provenance per ADR-0048 fills this gap.
8. **No connector-write governance gate** — Foundation's W5 promotion path + ADR-0026 dual-control + Section 2 Action runtime fill this gap.

### 6. Composition contract with existing Foundation substrate

V1 ECIL signals compose against:

- **Section 4 connector matrix** for vendor-API access (read-first only per ADR-0084)
- **Section 6 AnalyticsService** SAFE projection pattern for aggregate signal computation (ADR-0061)
- **Hive Intelligence Runtime** signal classes per ADR-0087 §2
- **Section 1 work-relevance filtering** posture per ADR-0058 (CORRECTION capsule precedent for what is signal vs noise)
- **W4 Proposed Action catalog** for any ECIL signal that proposes a follow-up action
- **W5 Action Promotion Runtime** per ADR-0086 for governed promotion of a proposed action
- **ADR-0079 Retention Class** for per-signal retention (default: AGGREGATE_ONLY at V1)
- **ADR-0048 Personalization-Orchestration Doctrine** as the framing for how derived signals feed working-set construction (forward-substrate)

### 7. Implementation ladder — 10 forward-substrate slices

V1 ECIL is **doctrine-only at this ADR**. Each implementation slice E1-E10 below requires a separate Founder authorization with its own per-slice ADR + RULE 21 research arc as applicable.

- **E1 — Metadata-derived calendar-density aggregate** (Tier 1; Google Workspace + Microsoft 365). Same-org calendar free/busy density signal. NEW AnalyticsService method; no new audit literal; no schema migration. Smallest viable next slice if Founder authorizes.
- **E2 — Metadata-derived Slack channel-distribution aggregate** (Tier 1). Same-org `conversations.members` distribution signal. NEW AnalyticsService method.
- **E3 — Communication source registry + DMW scope binding** (Tier 1+ enabler). NEW catalog of which vendor surfaces an org has authorized which DMW scopes for which purposes; consumed by E4+ slices.
- **E4 — Consent-bound content-summary substrate (general)** (Tier 2 enabler). NEW capsule type `COMMUNICATION_SUMMARY`; per-entity opt-in; per-purpose scope; per-window revocable; provenance binding; ADR-0079 retention.
- **E5 — Google Meet transcript-summary slice (consent-bound)** (Tier 2). Requires E4 + Google OAuth verification (4-7 week vendor process) + per-entity opt-in. Composes against Meet REST API; raw transcript fetched + summarized + raw discarded; summary stored as `COMMUNICATION_SUMMARY` capsule with provenance to organizer + attendees who opted in.
- **E6 — Microsoft Teams transcript-summary slice (consent-bound)** (Tier 2). Requires E4 + Microsoft 365 Copilot license verification + RSC consent per meeting + per-entity opt-in. Same architecture as E5.
- **E7 — Slack thread-summary slice (consent-bound)** (Tier 2). Requires E4 + per-entity opt-in + per-channel + per-window. `conversations.history` fetch + summarize + raw discarded.
- **E8 — Cross-source decision/commitment tracking** (Tier 3). Requires E5/E6/E7 LIVE + W5 promotion bridge wired for `HIVE_COORDINATOR` proposed-actions sourced from communication summaries.
- **E9 — Zoom transcript-summary slice (consent-bound)** (Tier 2). Requires Zoom connector ADR (currently not in Section 4) + RULE 21 research arc.
- **E10 — Predictive coordination intelligence** (Tier 4). Requires E8 LIVE + multi-source provenance + bounded-risk framing per RULE 0.

### 8. No new audit literal at this ADR

This is a design-only ADR. No code lands. No `AUDIT_EVENT_TYPE_VALUES` extension. The future E4 capsule type extension would extend `CapsuleType` per ADR-0021 deliberate-blocker pattern; that extension lands with the E4 slice, not here.

### 9. No CT consumer surface at this ADR

Per ADR-0077 §8.4 Foundation-first cadence. CT extensions for ECIL signals (when V1 ships) are forward-substrate to separate Founder-authorized CT slices.

### 10. RULE 0 sovereignty preserved

Every ECIL signal at every tier inherits same-org boundary (ADR-0049 GOVSEC.7), entity-bound scoping (RULE 0), no AI clearance raise (RULE 0), no AI-to-AI LONG_TERM/PERMANENT grant (RULE 0), no cross-tenant fusion (ADR-0049). The architecture/readiness doctrine MUST NOT be paraphrased into a "smart AI watches your team" framing in any product surface, customer document, or marketing material.

### 11. Patent-implementation evidence

Per ADR-0020 two-register IP discipline. ECIL composes against the 8 Foundation governance primitives that all three major vendors lack at the protocol layer (per §5.4) — the patent-implementation evidence trail for US 12,517,919 (COSMP) + US 12,164,537 (DMW) + US 12,399,904 explicitly covers this gap.

## Consequences

**Positive.**

- The Enterprise Communication Intelligence Layer register is named, bounded, and locked at the doctrine tier. The five inviolable bans are canonical. The four-tier signal pyramid forces every future implementation slice through a metadata-first triage.
- The RULE 21 research arc against the 3 most mature vendor surfaces is embedded. Future implementation slices inherit the research context.
- The 10-slice forward-substrate ladder is enumerated. Each slice has a defined per-vendor or per-tier scope; no implementation lands without explicit Founder authorization.
- Composition contracts with all 8 LIVE Foundation substrate registers (Section 1/3/4/6/W4/W5/Hive Intelligence Runtime/Section 2) are explicit.
- Foundation's 8 unique governance primitives (cryptographically-chained audit, per-capsule revocable consent, working-set provenance, anti-surveillance protocol enforcement, long-horizon evidence trail, drift-prevention primitive, cross-app working-set construction, connector-write governance gate) are documented at the patent-implementation evidence register vs. the three major vendors' gaps.

**Negative.**

- The forward-substrate ladder is long (10 slices). Each slice requires per-slice Founder authorization. Throughput depends on Founder cadence.
- Tier 2 content-summary slices (E4-E7) require vendor OAuth verification (Google: 4-7 weeks; Microsoft: M365 Copilot license; Slack: app review for `*:history` scopes). This is not a Foundation engineering blocker — but it is a vendor-process latency.
- The doctrine intentionally constrains the product surface. Some product-team requests (e.g., "real-time meeting transcription scoring") are explicitly out of scope by §4 ban (1) + (3); this ADR's existence enables Foundation to refuse such requests with a canonical citation rather than ad-hoc explanation.

**Forward-substrate (NOT authorized by this ADR).**

- Implementation slices E1 through E10 above.
- Zoom + Office Glass per-vendor ADRs.
- Real-time communication-stream ingestion (vs. on-demand fetch).
- Cross-tenant ECIL aggregation.
- CT consumer surface for any ECIL signal.
- BEAM coordination layer for live ECIL events (composes against ADR-0028 forward queue).
- Voice-stream summarization via Sesame CSM-1B (composes against ADR-0085 VF.5+; Founder-gated).
- Python intelligence runtime for content-summary generation (composes against future Python intelligence runtime ADR).
- DMW-tier per-capsule consent enforcement integration (composes against future DMW Runtime ADR).

## Alternatives

**Alternative A: Skip the doctrine ADR; land E1 metadata-derived calendar-density aggregate directly.** Rejected because the LEI sequence direction explicitly requires architecture/readiness ADR-first when runtime would require vendor scopes / recordings / transcripts / consent decisions. E1 itself is metadata-only and wouldn't need a doctrine ADR — but the doctrine ADR locks the bans + the 4-tier pyramid + the cross-vendor governance-gap canonicalization so that E2-E10 don't drift into surveillance territory.

**Alternative B: Build a transcript vault with admin-tier read access.** Rejected — directly conflicts with §4 ban (1) + Founder direction + RULE 0. Transcripts are NOT persisted; only consent-bound summaries (when authorized at E4+).

**Alternative C: Ingest raw email content for AI-derived inbox triage as V1 surface.** Rejected — Gmail mail body content is Tier 2 per §3; requires E4 enabler + per-entity opt-in + per-purpose scope. V1 stays at Tier 1 metadata.

**Alternative D: Bundle Zoom + Office Glass into V1 doctrine without research arc.** Rejected — RULE 21 requires research arc against canonical authoritative source BEFORE drafting paste body. Zoom + Office Glass research was not conducted at this slice; they are forward-substrate.

## Cross-references

ADR-0001 (three-wallet; DMW scope binding) ·
ADR-0002 (append-only audit chain) ·
ADR-0020 (two-register IP discipline) ·
ADR-0021 (CapsuleType extension protocol; E4 will use) ·
ADR-0026 (dual-control; preserved through W5 path) ·
ADR-0036 (LawfulBasis; regulator-readiness) ·
ADR-0048 (Personalization-Orchestration Doctrine; ECIL signals feed working-set construction at forward-substrate) ·
ADR-0049 (GOVSEC.7 tenant isolation) ·
ADR-0050 (Break-Glass; ECIL never bypasses) ·
ADR-0052 §8 (Otzar DGI scoped Twin-to-Twin; ECIL respects same bounds) ·
ADR-0055 (Correction signals; drift-prevention primitive precedent) ·
ADR-0057 (Section 2 Action runtime; preserved as execution authority) ·
ADR-0058 (no manager surveillance; reinforced) ·
ADR-0059 (Section 3 Hives v1; same-org boundary precedent) ·
ADR-0061 (Section 6 SAFE projection pattern; ECIL signals reuse) ·
ADR-0070 (Regulator-Ready doctrine; preserved) ·
ADR-0077 §8.4 (Foundation-first cadence) ·
ADR-0079 (Retention Class; ECIL signals use) ·
ADR-0080 (PermissionBundle; consent envelope) ·
ADR-0081 §2.2 (W4 Proposed Action substrate; ECIL signals compose via HIVE_COORDINATOR proposed actions) ·
ADR-0083 §1 (forbidden categories; ECIL inherits) ·
ADR-0084 (Section 4 connector strategy; ECIL composes against; per-connector writes remain ≥C6 forward-substrate) ·
ADR-0085 (Voice-First Product Doctrine; voice composition; VF.5+ Founder-gated) ·
ADR-0086 (W5 Action Promotion Runtime; the governed bridge ECIL acts through) ·
ADR-0087 (Hive Intelligence Runtime V1; sibling substrate-layer doctrine).

## RULE references

RULE 0 (humans always sovereign) + RULE 4 (audit chain integrity) + RULE 10 (soft-delete; no row deletion) + RULE 11 (Elixir/BEAM canonical patterns; relevant at E8+ BEAM coordination forward-substrate) + RULE 13 (substrate-honest pre-flight; embedded above as the vendor research + Foundation-substrate-compose-against survey) + RULE 14 (bidirectional citation discipline; this ADR cites and is cited by ADR-0086 + ADR-0087 catalog entries) + RULE 16 (no console.* in apps/api/src; preserved — no code in this slice) + RULE 20 (Founder-only RULE/ADR modification; this ADR lands per `[FOUNDER-AUTH — W5 + LIVING ENTERPRISE INTELLIGENCE AUTONOMOUS BUILD]`) + RULE 21 (substrate-architectural research arc against canonical authoritative source BEFORE drafting paste body; embedded above as §5 vendor research findings with URL citations).
