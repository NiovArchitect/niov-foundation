# SEND_INTERNAL_NOTIFICATION substrate — research arc (Wave 9)

> RULE 21 pre-authorization research arc for the third + final real
> `ActionType` handler. Research-only docs slice. **No code; no
> schema; no ADR.** The substantive implementation wave that
> consumes this arc requires explicit Founder QLOCK + Founder
> direction on the product-clarity question landed in §6.

**Date:** 2026-05-29
**Author:** AI assistant (autonomous protocol)
**Triggered by:** Wave 8 wave-close NEXT_ACTION queue-item #1
recommendation; the "2 of 3 real handlers" gap has appeared on
every Section 2 status surface since PR #41 (2026-05-29).
**Status:** Research arc; no Founder authorization required to
land (research is not modification per RULE 20). Subsequent
implementation wave requires QLOCK + product-clarity direction.

---

## ⭐ FOUNDER DIRECTION (received 2026-05-29; RESOLVES §6)

**§6 product-clarity question is RESOLVED — option (1) at
sub-phase 1.**

- SEND_INTERNAL_NOTIFICATION must be **INTERNAL-ONLY** for the
  first implementation.
- Creates a **governed internal Otzar notification only** —
  in-app / Otzar-native notification record.
- **NO email delivery.** NO SMS delivery. NO Slack delivery.
  NO push notification delivery. NO external app delivery. NO
  external side effects.
- External apps connected to Otzar may become **optional future
  delivery adapters / integrations**, but they are NOT part of
  the first implementation.

**Product framing locked:**

- Internal notification substrate first.
- Provider-pluggable external adapters later (per the
  EmbeddingProvider precedent at ADR-0043 G3.4).
- In-app / Otzar-native notification record is the first
  canonical substrate.
- The notification must remain scoped, audited, permissioned,
  no-leak, and enterprise-safe.
- Do NOT claim external delivery is live.

**Implementation direction for the Wave 11 implementation wave:**

- Build the minimal internal notification substrate needed for
  the `SEND_INTERNAL_NOTIFICATION` ActionType handler.
- Prefer an internal database-backed notification model + service
  (no existing model exists per §2 grep).
- Handler creates an internal notification record scoped to the
  correct recipient entity / org.
- Emit safe audit events (ride existing `ACTION_*` literals; new
  literals like `NOTIFICATION_DISPATCHED` remain forward-substrate
  per RULE 20).
- Return safe `result_metadata` only — `notification_id`,
  `recipient_entity_id`, `notification_class`, `status`. Do NOT
  include notification body / content in long-lived ActionResult
  metadata if that content could be sensitive.
- Preserve RULE 0 sovereignty (cross-org default DENY; recipient
  must be member of the source's org); scoped auth; dual-control
  preserved at the existing ActionPolicy seam; no-leak projection;
  audit discipline.
- Tests: happy path; unauthorized / cross-org prevention; missing
  recipient; recipient TAR not ACTIVE; malformed payload; no-leak;
  audit.

**Founder authorization captured:** the schema-design decision
"NEW `Notification` Prisma model" is explicitly authorized at
the substantive Wave 11 implementation wave. Any NEW audit
literals (`NOTIFICATION_DISPATCHED` / `NOTIFICATION_DELIVERY_FAILED`
/ `NOTIFICATION_OPT_OUT_RESPECTED` per §4 item 5) remain
forward-substrate requiring their own RULE 20 QLOCK.

**Stop conditions reaffirmed:** if implementation cannot be done
safely WITHOUT external providers; if MCP/connectors/Control
Tower UX/billing/analytics/voice/ambient/lens scope creep
surfaces; if schema design beyond the authorized
single-model + single-service-extension warrants ADR or QLOCK;
if no-leak / auth boundary is uncertain.

---

## 1. Why this arc exists

ADR-0057 Section 2 (Autonomous Execution Core) defines three
canonical `ActionType` values: `RECORD_CAPSULE`,
`PROPOSE_PERMISSION_GRANT`, `SEND_INTERNAL_NOTIFICATION`.
PR #35 made `RECORD_CAPSULE` a real handler; PR #41 made
`PROPOSE_PERMISSION_GRANT` real. `SEND_INTERNAL_NOTIFICATION`
remains stub. Every wave-close status surface since PR #41 has
carried the literal "2 of 3 real handlers" — a known gap that
the next implementation wave should close.

The stub-handler discipline (`makeStubHandler` at
`apps/api/src/services/action/handlers.ts:445` returning
`{ handler: "stub", action_type, status: "completed_stub" }`)
ensures the runtime is correct and forensically clean today
even with the stub; this arc plans how to replace the stub with
substance, not how to ship interim partial work.

RULE 21 requires a pre-authorization research arc for
substrate-architectural pastes touching new substrate patterns
+ external integrations + cross-language boundaries +
wire-format changes. The
`SEND_INTERNAL_NOTIFICATION` implementation wave triggers
multiple of those (new substrate primitives + external delivery
backends + receive-side opt-out + cross-tenant boundary). This
arc surfaces canonical findings to operator-tier BEFORE
authorization fires at canonical-execution register.

## 2. Substrate-state ground truth (per RULE 12 / RULE 13)

Grep results across the repo as of main HEAD
`f214e871860eac6f662b9975a26e8dd80a7d81c0` (Wave 8 close):

**Notification primitives that exist:**

| Substrate | Location | Status | What it does |
|---|---|---|---|
| `DeviceToken` model | `packages/database/prisma/schema.prisma:967` | LIVE schema | Persists `{ entity_id, platform, push_token, device_name, active }` rows; comment claims "one push-notification target for one entity". |
| `IntegrationCredential` model | `packages/database/prisma/schema.prisma:983` | LIVE schema | Persists webhook secrets per `(org_entity_id, tool)`; the model is generic over any third-party tool (the schema comment names GitHub + Slack as examples). |
| Stub validator | `apps/api/src/services/action/action-payload-validators.ts:471` | LIVE | Routes `SEND_INTERNAL_NOTIFICATION` through `validateStubPayload` (always-ok; empty normalized record). |
| Stub handler | `apps/api/src/services/action/handlers.ts:445` | LIVE | `makeStubHandler("SEND_INTERNAL_NOTIFICATION")` returns `{ handler: "stub", action_type, status: "completed_stub" }`. |
| Retry budget | `apps/api/src/services/action/lifecycle.service.ts:76` | LIVE | `RETRY_BUDGET.SEND_INTERNAL_NOTIFICATION = 3` (operator-tunable per PR #47 + #49). |
| Risk tier | `apps/api/src/services/action/action.service.ts:104` | LIVE | Constant-derived to `LOW`. |

**Notification primitives that DO NOT exist:**

- **No `notification.service.ts` anywhere in `apps/api/src/`** —
  zero matches for `notification\.service` / `sendNotification` /
  `NotificationService`. The notification-delivery substrate is
  entirely greenfield.
- **No consumer of `DeviceToken`** — zero references in
  `apps/api/src/` to `DeviceToken` / `deviceToken.` / `push_token`
  beyond the schema declaration + a re-export at
  `packages/database/src/index.ts:177`. The table is declared but
  never read or written by application code.
- **No consumer of `IntegrationCredential`** for notification
  delivery — zero references that load + use the webhook_secret.
  The table is declared but never read or written by application
  code.
- **No email backend** (no SES / SendGrid / Postmark / Mailgun
  / Resend SDK; no SMTP client).
- **No push-notification backend** (no FCM / APNS / OneSignal SDK).
- **No SMS backend** (no Twilio / Vonage / Plivo SDK).
- **No Slack / Teams / Discord webhook delivery code**.
- **No in-app notification feed table** (no `Notification` model;
  no `InboxItem`; no `Inbox`; no `Alert` model).

**Audit literals available:**

The canonical 10-literal ADR-0057 §10 `ACTION_*` vocabulary is
closed; SEND_INTERNAL_NOTIFICATION rides
`ACTION_PROPOSED → ACTION_APPROVED → ACTION_STARTED →
ACTION_SUCCEEDED | ACTION_FAILED` like every other ActionType.
A real handler MAY want a NEW per-delivery audit literal (e.g.,
`NOTIFICATION_DISPATCHED` / `NOTIFICATION_DELIVERY_FAILED` /
`NOTIFICATION_OPT_OUT_RESPECTED`); that would be a separate
audit-literal extension per the ADR-0042 §Q-γ.1
clean-transition discipline (Founder-authorized; new literals
are append-only to `AUDIT_EVENT_TYPE_VALUES`).

## 3. Product-design space (catalog, not decision)

The notification surface has at least 5 distinct delivery
backends + 4 distinct routing axes + 3 distinct receive-side
opt-out granularities. Each combination is a different
substrate-architectural commitment.

### 3.1 Delivery backends (5 candidates)

| Backend | Pros | Cons | Substrate cost |
|---|---|---|---|
| **In-app notification feed** (NEW `Notification` model + GET inbox route) | Self-contained; no external vendor; RULE 0 sovereignty trivial (delivered inside the wallet boundary); no external secret management. | Requires user to open the app to see it; not real-time push. | NEW Prisma model + 1 service + 2-3 routes + per-entity scope + soft-delete + read receipts (optional). |
| **Email** (SES / SendGrid / Postmark / Resend) | Universal; works for org admins not actively in Otzar; familiar UX. | External vendor lock-in surface; deliverability complexity (SPF / DKIM / DMARC); user-opt-out per CAN-SPAM / GDPR Art. 21 / CASL; rate limits; spam-classification risk; per-message cost. | NEW provider abstraction (`EmailProvider` interface; mirrors `EmbeddingProvider` pattern from ADR-0043 G3.4) + 1 service + secret management via `IntegrationCredential` extension or NEW env-tier secret. Operator deployment-target agnostic per ADR-0018 (Supabase has no SES bundling). |
| **Push** (FCM / APNS via OneSignal / Expo) | Real-time; consumes existing `DeviceToken` schema; engagement-friendly. | Vendor lock-in surface; mobile-platform-specific cert + key management; FCM/APNS notification-content size limits; operator deployment-target agnostic concerns; certificate rotation. | NEW provider abstraction + 1 service + Apple/Google credential management + DeviceToken row consumer logic + token-rotation handling + per-platform payload shape mapping. |
| **Slack / Teams / Discord** (webhook + bot SDK) | Already where enterprise admins work; consumes existing `IntegrationCredential` schema; permission-tier mapping to Slack workspace identity. | Vendor lock-in surface; webhook secret rotation; tenant-mapping question (which Otzar org maps to which Slack workspace?); permission model crosswalk (Slack channel ACL vs Otzar TAR). | NEW provider abstraction + 1 service + webhook signing + tenant-mapping logic + IntegrationCredential row consumer + bot installation flow (or webhook-only without bot install). |
| **SMS** (Twilio / Vonage / Plivo) | Universal; high-urgency channel; works without device app. | High per-message cost; strict regulatory compliance (TCPA + GDPR + country-specific opt-in laws); 160-char limit; deliverability variance by country; vendor lock-in surface. | NEW provider abstraction + 1 service + phone-number opt-in tracking + per-country regulatory compliance + cost monitoring. |

### 3.2 Routing axes (4 distinct decisions, orthogonal to backend)

- **Routing target:** who receives? (the source entity? the org
  admin set? a configured `notify_targets` payload field? a
  dynamically-resolved set based on Action context?)
- **Routing scope:** within-org-only vs cross-org? RULE 0
  sovereignty says cross-org requires the receiver's explicit
  revocable consent — by default the substrate must reject any
  notification from org A to a non-A-member entity.
- **Routing trigger:** synchronous-on-Action-creation vs
  scheduled vs response-to-other-event (e.g., dual-control
  pairing complete → notify both parties)?
- **Routing aggregation:** one notification per Action vs batched
  hourly/daily vs deduplicated (when N similar Actions land in
  short window)?

### 3.3 Receive-side opt-out granularity (3 candidates)

- **Global opt-out** (per receiver-entity flag on `EntityProfile`
  or `TAR`): simple; coarse.
- **Per-`ActionType` opt-out** (one row per receiver × ActionType
  in a NEW `NotificationPreference` model): medium granularity;
  matches operator mental model.
- **Per-(`ActionType`, `risk_tier`, `delivery_backend`) opt-out**:
  most granular; mirrors the ActionPolicy axis structure;
  highest substrate complexity.

Whichever granularity ships, RULE 0 requires:

- The receiver — not the sender / org admin / AI agent — owns
  the opt-out switch.
- The opt-out must be revocable by the receiver alone.
- An attempted delivery that the receiver has opted out of MUST
  audit-emit (so the sender / org has visibility that the
  delivery did not happen + WHY) WITHOUT exposing the
  notification content downstream.

## 4. Substrate-decision matrix (recommended canonical analyses)

The implementation wave (post-Founder QLOCK) should land at
least these canonical analyses BEFORE writing code:

1. **Backend pick** (1 OR multi). Probably "in-app first;
   provider-abstraction makes email/push/Slack pluggable later"
   to keep substrate small and RULE 0-clean. Multi-backend
   ships as a separate wave.
2. **Routing target rule** — likely the `notify_targets` payload
   array (operator declares per-Action), validated against
   `EntityMembership` for the source org per RULE 0.
3. **Cross-org default DENY** — substrate MUST reject any
   notification target that is not a member of the source
   entity's org. Exception requires a Permission row at COSMP
   (which gives the receiver explicit revocable consent).
4. **Receive-side opt-out model** — recommend per-`ActionType`
   granularity at sub-phase 1 (matches ActionPolicy + simple
   operator mental model); per-(`ActionType`, `risk_tier`) is
   forward-substrate.
5. **Audit literal extension** — recommend NEW
   `NOTIFICATION_DISPATCHED` +
   `NOTIFICATION_DELIVERY_FAILED` (append-only per the
   ADR-0042 §Q-γ.1 clean-transition pattern) +
   `NOTIFICATION_OPT_OUT_RESPECTED`. Each new literal needs
   Founder QLOCK at the substantive wave per RULE 20.
6. **Result_metadata shape** — must be SAFE per the no-leak
   guard. Recommend:
   `{ handler: "send_internal_notification", action_type,
   delivery_backend, target_entity_id, delivery_status,
   notification_id }`. NEVER: notification body content;
   target email / phone / push_token; opt-out reason details;
   receiver TAR fields.
7. **Idempotency** — re-runs of an Action (under retry_budget)
   must not deliver the notification twice. Either dedupe at
   handler tier (idempotency key on `(action_id, attempt_*)`
   compound) OR mark the notification entity row + suppress
   re-delivery.
8. **Cross-language ownership boundary** — per ADR-0033, if any
   future Elixir/BEAM consumer (forward-substrate per ADR-0028
   §Forward Queue) needs to read the notification primitives,
   the boundary is the same as ActionAttempt today: TypeScript
   owns the shared substrate; no Elixir mirror until a real
   BEAM consumer surfaces.

## 5. Cost projections (substrate footprint estimate)

Approximate substrate cost for a minimal "in-app feed + RULE 0
opt-out + ADR-0057 §10 audit extension + provider-pluggable"
implementation. Order-of-magnitude estimates; the actual
implementation wave should re-estimate against substrate-state
at that time.

- **Schema:** 2 NEW Prisma models (`Notification` + per-
  `ActionType` `NotificationPreference`); 0-1 audit literals
  added depending on Founder QLOCK; nullable
  `notification_target_entity_id` extension on the
  `SEND_INTERNAL_NOTIFICATION` payload shape (not a schema
  column).
- **Services:** NEW `notification.service.ts` (validate target;
  resolve opt-out; persist Notification row; emit audit) + NEW
  `notification-provider.ts` (interface; in-app default
  implementation; provider registry pattern mirroring
  `EmbeddingProvider` from ADR-0043 G3.4).
- **Validator:** Extend `validateSendInternalNotificationPayload`
  (replaces `validateStubPayload` for this type); enforce
  `notification_target_entity_id` is a UUID + `notification_body_summary`
  is a bounded string + optional `notification_class` enum.
- **Routes:** NEW `GET /api/v1/notifications` (self-scope inbox)
  + NEW `PUT /api/v1/notifications/:id/read` (mark read) + NEW
  `PUT /api/v1/notifications/preferences` (opt-out toggles;
  per-receiver self-scope).
- **Tests:** Per ADR-0011 three-tier discipline — unit tests for
  the provider abstraction + integration tests for the
  end-to-end Action → notification → audit flow + integration
  tests for RULE 0 opt-out + integration tests for cross-org
  DENY.
- **Estimated PR count for sub-phase 1:** 4-6 PRs (1 schema +
  audit-literal slice, 1 provider + service slice, 1 validator
  + handler slice, 1 routes slice, 1 docs refresh, optional 1
  build-log).
- **Estimated implementation timeline:** comparable to PR #35
  (RECORD_CAPSULE real handler; 1 substrate-architectural PR +
  follow-ons) but slightly larger because of the opt-out
  routes + receive-side schema.

## 6. Product-clarity question for Founder direction

**The implementation wave CANNOT autonomously decide this. RULE
20 applies — but more importantly, this is a product question
that the substrate cannot answer.**

> When an AI Twin / human / dual-control flow produces a
> "notify"-class Action, what is the canonical receive surface
> at Foundation sub-phase 1?
>
> 1. **In-app only.** A `Notification` row + `GET /notifications`
>    feed + read-receipt. The receiver must be in Otzar to see
>    it. Lowest external dependency; cleanest RULE 0.
> 2. **Email only.** Best for org admins not actively in Otzar.
>    Requires vendor selection (SES vs SendGrid vs Resend vs
>    Postmark) + deliverability infrastructure.
> 3. **In-app + email both.** Highest reach. Doubles cost. Each
>    backend tested separately.
> 4. **Push + email + in-app.** Mobile-first; broadest reach;
>    highest substrate footprint; multiple vendor commitments.
> 5. **Slack / Teams.** "Where the work happens" framing per
>    ADR-0052 doctrine; lowest receive-friction for active
>    enterprise users; requires integration installation
>    workflow per (org, workspace).
>
> Subordinate questions (answer at the implementation wave):
> - Real-time vs batched vs digest?
> - Cross-org notification: explicit-deny default + Permission-
>   row-required override per RULE 0? (recommended yes per §4
>   item 3 above)
> - Opt-out granularity: global vs per-ActionType vs per-(type,
>   risk_tier)? (recommended per-ActionType at sub-phase 1)
> - New audit literals: `NOTIFICATION_DISPATCHED` +
>   `NOTIFICATION_DELIVERY_FAILED` +
>   `NOTIFICATION_OPT_OUT_RESPECTED`? (RULE 20-gated; recommend
>   yes)

The substrate cost ladder is roughly:
**(1)** small (~6 PRs) → **(2)** medium (~8 PRs + vendor) →
**(3)** medium-large (~10 PRs + vendor) →
**(4)** large (~14 PRs + 2-3 vendors) →
**(5)** medium (~9 PRs + integration flow).

Recommendation: **option (1) at sub-phase 1**, with provider
abstraction landing in shape such that options (2)-(5) can
plug in at future sub-phases without re-architecture. This is
the substrate-build precedent from `EmbeddingProvider`
(ADR-0043 G3.4) — the in-app default provider lands first;
external vendor providers plug in as separate waves with their
own RULE 21 research arcs.

## 7. RULE 0 sovereignty disclosures specific to notifications

A notification is **inbound** for the receiver — and inbound
information about the receiver's behavior is exactly the kind
of surface where RULE 0 is most easily violated. The
implementation wave MUST honor:

- **Receiver-owned opt-out switch.** The sender, org admin, AI
  agent, and even the Foundation runtime cannot override an
  opt-out. Opt-out is reversible only by the receiver.
- **Cross-tenant default DENY.** Org A cannot notify a non-A
  member without that member's explicit revocable Permission
  row in COSMP.
- **No surveillance framing.** Per ADR-0052 the notification
  substrate is for governed work coordination, not employee
  monitoring. Manager-to-employee notification flows are
  permissioned coordination; not productivity-policing.
- **Audit attribution.** Every dispatched + failed-delivery +
  opt-out-respected event audits — same RULE 4 audit-before-
  response discipline as every other Foundation surface.
- **No raw notification body leakage in audit details.** The
  `result_metadata` no-leak contract (per ADR-0057 §10) extends
  here: audit captures `notification_class` + `delivery_status`
  + `target_entity_id` only; never the body content of the
  notification itself.
- **Self-notification edge case.** When the source entity and
  the target entity are the same (e.g., an AI Twin notifies
  its owning human), the opt-out check still runs. Self
  is not a free pass.

## 8. Forward-substrate items queued by this arc

When the substantive implementation wave fires (post-Founder
QLOCK), these items are pre-queued from this research:

- [ ] **Founder direction on §6 product-clarity question.**
  Required before any implementation slice authorizes.
- [ ] **NEW ADR drafted by AI assistant** (per RULE 20 drafting
  is permitted; landing requires Founder authorization):
  `SEND_INTERNAL_NOTIFICATION substrate canonical`. Cites
  ADR-0057 (parent) + ADR-0033 (cross-language ownership) +
  ADR-0042 §Q-γ.1 (audit-literal clean-transition) + ADR-0043
  G3.4 (provider-abstraction precedent) + RULE 0 + RULE 4 +
  RULE 13. Documents the §6 backend pick + §4 substrate
  decisions.
- [ ] **Sub-phase 1 PR set** (4-6 PRs per §5 estimate). Each PR
  is its own wave per the canonical wave-based discipline +
  pattern lock from `NEXT_ACTION.md`.
- [ ] **GOVSEC.5 follow-on review** — notification dispatch is
  a potentially high-blast-radius surface (mass-notify could be
  exploited); the implementation wave should cite GOVSEC.5
  / ADR-0050 to consider whether mass-notify variants need
  dual-control or break-glass-gating.

## 9. RULE 21 lineage + Why this arc qualifies

RULE 21 trigger conditions matched by the future
implementation:

- ✅ "External library version semantics" — vendor SDKs
  (email/push/Slack/SMS providers).
- ✅ "Wire-format conventions across language boundaries" —
  webhook payloads + protobuf future for any Elixir/BEAM
  consumer.
- ✅ "Cross-application umbrella dependencies" — IntegrationCredential
  + DeviceToken consumer extension is the first time these
  tables get a TS-side consumer.
- ✅ "Substrate-state ground truth verification (column
  ownership; enum values; actual canonical paths vs assumed
  paths)" — the canonical RULE 12/13 pre-flight discipline
  applies; this arc executed the §2 grep.

Per RULE 21 substrate-honest cost-benefit: research arc adds
approximately 5-15 minutes per substrate-architectural paste at
incremental cost; prevents fix-forward cascade. This arc is
~30 minutes of authoring time + ~5 minutes of grep time, and
prevents a multi-PR cascade where the implementation wave
discovers mid-build that the chosen backend was wrong or that
RULE 0 was bypassed by the routing model.

## 10. Sources + canonical references

This arc is research-only; no external web research was
conducted (no RULE 21 web-fetch / web-search required, because
the substrate-state ground truth surface is the repo itself —
the question "what notification infrastructure exists?" is
answered by `grep` not by external research). External vendor
selection (which email provider, which push provider, etc.) is
forward-substrate for the implementation wave and SHOULD
include a RULE 21 web-research pass at that time per the
ADR-0048 §RS-G6-* precedent format.

Cited canonical substrate:

- **ADR-0057** §2 + §11 — Action Runtime substrate; risk_tier +
  retry_budget + audit discipline this handler must honor.
- **ADR-0033** §Decision 7 + Q-5BII-EXEC-5 — cross-language
  ownership boundary; future BEAM consumer guidance.
- **ADR-0042** §Q-γ.1 — clean-transition discipline for new
  audit literals.
- **ADR-0043** G3.4 — EmbeddingProvider abstraction; canonical
  precedent for the NEW NotificationProvider abstraction.
- **ADR-0048** — Personalization-orchestration substrate;
  notification scoping must honor the same governed-working-set
  discipline.
- **ADR-0052** — Otzar DGI doctrine; notifications are governed
  coordination, NOT surveillance.
- **ADR-0050** + **GOVSEC.5** — break-glass / time-boxed audit;
  mass-notify variants may need dual-control gating.
- **RULE 0** — receiver-owned opt-out + cross-tenant default
  DENY.
- **RULE 4** — audit before response (including delivery
  failures + opt-out-respected events).
- **RULE 13** — substrate-honest disclosures preserved through
  this arc.
- **RULE 20** — RULE/ADR modification is Founder-only; AI
  drafts proposals, Founder authorizes landings.
- **RULE 21** — pre-authorization research arc discipline;
  this document is the canonical record.

---

End of Wave 9 SEND_INTERNAL_NOTIFICATION substrate research
arc. Forward to: Founder-directed implementation wave per §6
question.
