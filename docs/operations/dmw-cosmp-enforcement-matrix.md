# DMW / COSMP Enforcement Matrix — Otzar First-Party Flows

**Phase 1238 deliverable.** Verified 2026-06-11 from code + tests, not
from phase labels. Every Otzar first-party flow must run through
Foundation: identity → DMW authority → COSMP memory policy → action
policy → audit. This matrix records the enforcement evidence per flow
and names the canonical auth pattern each uses.

**Canonical auth patterns (all three are Foundation-approved):**
- **A. Route-inline gate** — `bearerFrom()` + `authService.validateSession(token, scope)` in the route handler.
- **B. `requireAuth` preHandler** — middleware sets `request.auth`; routes read `request.auth.entity_id`.
- **C. Service-owned gate (ADR-0004)** — route passes the bearer token; the service calls `validateSession` itself (`…ForCaller(token, …)` / `conductSession({token})`).

**Route-gate census (2026-06-11):** all 23 first-party route files are
gated; the five files with zero route-level `validateSession` calls
(`otzar.routes.ts`, `otzar-observation`, `otzar-proposed-pattern`,
`otzar-voice-ready`, `notification`, `actions`) all use pattern B or C
(verified: `notification.routes.ts:38` `requireAuth`,
`observation.service.ts:238/437/534` + `otzar.service.ts:790+` +
`proposed-pattern.service.ts:458` service-tier `validateSession`;
`otzar-voice-ready` routes through `otzarService.conductSession`).

| Flow | Auth pattern | Caller/org scoping evidence | Audit evidence | External-write posture |
|---|---|---|---|---|
| My Day Intelligence (`/otzar/my-day/intelligence`) | A (read) | `gatherMyDaySignals` — every query caller+org scoped; org isolation + revoked-grant exclusion test-proven (`tests/integration/my-day-intelligence.test.ts`) | Passive read (read-noise policy; same as context-health) | None — read-only |
| Notification Bell + reply (`/notifications/*`) | B | `listNotificationsForCaller` recipient-scoped; reply mediator preserves SafeNotificationView privacy (Phase 1215, PR #313) | Notification rows come only from executed Actions (ACTION_* chain) | Reply creates internal Action only |
| Action Center (`/actions/*`) | B | `createActionForCaller` idempotency cross-caller conflict fail-closed (`action.service.ts:482+`); list/get caller-scoped | ADR-0057 ACTION_PROPOSED/_APPROVED/_REJECTED/_EXECUTED; dual-control no-eligible-target fail-closed (`action.service.ts:675+`) | INVOKE_CONNECTOR is the only external path; policy + approval gated |
| Otzar chat / conduct session (`/otzar/*`) | C | COE `assembleContext` — the LLM never decides what memory it sees (ADR-0048); L0 identity scoped per viewer (Phase 1205/1207) | CONVERSATION_STARTED + CAPSULE_CONTENT_READ via COE reads | Drafts only; send = explicit Action approval (Phase 1208) |
| Comms extract (`/otzar/comms/extract`) | C (`otzar.service.ts:1975+`) | Roster resolution against viewer identity context; suggested actions carry resolution_status, never auto-send | Action chain on confirm only | Zero external writes (Phase 1213 verified live) |
| Meeting Capture (`/otzar/meeting-capture/*`) | A | Org + captured_by scoping; participant consent states gate capture (BLOCKED_PARTICIPANT_CONSENT status) | 6 MEETING_CAPTURE_* literals | Manual/API ingest only; provider adapters credential-gated |
| Observe/OCR (`/otzar/observe/*`) | A + buildApp `otzarLLM` injection | Caller+org scoped; cross-org probes 404 (no existence oracle); suggested follow-ups create ZERO Action rows (test-proven, `tests/integration/observe-intake.test.ts`) | 5 OBSERVE_* literals; blocked providers audited FAILED with no partial row | None; cloud OCR providers BLOCKED_BY_CREDENTIALS |
| COE observation ingest (`POST /otzar/observe`, pre-1227) | C (`observation.service.ts:238`) | Three-wallet routing: org learnings → ENTERPRISE wallet, personal insights/commitments → EMPLOYEE wallet (patent portability claim, `observation.service.ts:220-222`) | CAPSULE_CREATED chain via COSMP write path | None |
| Voice Capture (`/otzar/voice/*`) | A | Org + caller scoping; transcript strings only — no raw audio crosses HTTP (Phase 1223) | 6 AUDIO_/STT_* literals | Whisper/Deepgram BLOCKED_BY_KEY |
| Collaboration Workspaces (`/otzar/collaboration/workspaces/*`) | A | Workspace org-scoped; commitments land UNRESOLVED until human confirm (Phase 1221 resolver) | 10 WORKSPACE_* literals | Internal only |
| External Stakeholders (`/otzar/external-collaborators/*`) | A | EXTERNAL_OWES_INTERNAL / INTERNAL_OWES_EXTERNAL direction model; internal-owner framing; external people never become assignable employees | 7 EXTERNAL_* literals | **No external sends — internal reminders only** (Phase 1221 invariant) |
| My Digital Work Wallet (`/dmw/*`) | A | DMW Registry read view; revocation gate `isCapsuleUsable` refuses revoked DMWs (Phase 1229) | DMW lifecycle literals via underlying substrate | None |
| My Twin Memory / COSMP mgmt (`/cosmp/capsules/*`) | A | Owner-scoped list/revoke; CAPSULE_NOT_FOUND for cross-owner probes | CAPSULE_* + COSMP 7-op chain | None |
| Connector Health (`/connector-adapter-status`) | A | Counts + missing-key flags only; never credential material (Phase 1230 invariant) | OBSERVE/STT status-check pattern | Registry only; `can_write` flags gate future sends |
| Production Readiness (`/onboarding/*`) | A | Admin gate clearance ≥ 4 for mutations; checklist read org-scoped | 3 ONBOARDING_* literals | None |
| Compliance share packages (`/compliance/share-packages/*`) | A | Org-admin create/revoke; regulator addressee-only evidence read with no existence oracle; redaction layer metadata-only (Phase 1233) | 4 COMPLIANCE_SHARE_PACKAGE_* literals; access counted | Purpose-bound regulator read only |
| Calendar context (`/otzar/calendar/context`) | A (read) | Caller's own MeetingCapture windows only; teammate meetings never leak (test-proven) | Passive read (read-noise policy) | None |
| Dandelion (`/otzar/dandelion/*`) | A | Admin gate for org-growth; employee-scoped onboarding; memory candidates via Action(PROPOSED, RECORD_CAPSULE) — **no capsule until user approval** (test-proven) | Action runtime chain covers consent path | None |
| ProposedActionCard confirm (CT → `POST /actions`) | B | Same as Action Center row | ACTION_PROPOSED on create | Approval-gated by construction |

## Verdicts

1. **No authentication bypass found** — 23/23 first-party route files
   gated by pattern A, B, or C.
2. **No DMW bypass found** — every action/tool/memory mutation runs
   through `createActionForCaller` (policy + dual-control + audit) or
   the COSMP write path; the Phase 1229 revocation gate covers capsule
   use.
3. **No COSMP bypass found** — memory enters only via the COSMP write
   path (COE observation, RECORD_CAPSULE handler) and is read only via
   COE `assembleContext` / governed read services.
4. **No ungoverned external write found** — `INVOKE_CONNECTOR` is the
   single external-write seat and sits inside the Action runtime;
   external-stakeholder flows are internal-reminder-only by invariant.
5. **UI honesty** — the global ambient-copy sweep (20 pages) plus
   per-flow "no auto-execute" tests keep the UI from implying powers
   the backend doesn't enforce.

**Residual watch-items (honest):**
- The Otzar chat → proposed-action extractor is regex-canonical; if the
  LLM drifts from the canonical draft shape the approval card simply
  doesn't render (fail-quiet, not fail-open). Structured-output schema
  validation is the queued improvement.
- BEAM gRPC COSMP path remains additive/parallel (ADR-0030 migration
  plan); the in-process TS path is the enforced production path today.
- Real connector sends (Slack/Gmail/etc.) are credential-blocked; when
  keys arrive, `INVOKE_CONNECTOR` policy coverage must be re-verified
  per provider before any live send.

Maintenance: update this matrix whenever a new first-party flow lands
or an auth pattern changes; cite file:line evidence, never phase labels.
