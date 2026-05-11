# Section 12 Progress Tracker

This file tracks the multi-batch effort to land Section 12 of
the Foundation build. Section 12 is the production-readiness +
compliance hardening + frontend dashboard work that brings
Foundation from "MVP-functional" to "FedRAMP-eligible enterprise
platform."

This is **committed substrate** — the tracker is updated in
each commit that closes a sub-section, so the live state is
always greppable from the current HEAD. Cross-reference
`docs/reference/architectural-anchors.md` for the anchors that
each sub-section locks, and `docs/architecture/decisions/` for
the ADRs that document the decisions.

**Recalibrated timeline:** 5-8 weeks comfortable at demonstrated
pace; 3 weeks ambitious; 2 weeks tight. Original 5-7 month
estimate (anchored on industry cadence with idle time + slow
verification) abandoned. All future estimates calibrate against
demonstrated pace, not industry standard.

## Status Table

| Sub-section | Status | Commit | Description |
|---|---|---|---|
| 12B (Otzar Control Tower foundation) | CLOSED | `otzar-control-tower @ 0a28f90` | Foundation for admin console; 12 architectural anchors |
| 12.5 (Compliance Architecture Review) | CLOSED | `9671776` | 24 dimensions assessed; 9 patent-relevant findings; 6 claim families; 9 sub-boxes dependency-ordered |
| 12C.0 Commit 1 (endpoint extensions) | CLOSED | `2aa1a88` | DELETE skill + PATCH entities audit_event_id + audit filters + bridge_id filter; +16 tests; 2 anchor properties (DRIFT 9 audit + permissions) |
| 12C.0 Commit 2 (compliance hardening) | CLOSED | `f3359fb` | crypto-config + retention posture + system principals + structured logging + /compliance/state; +22 tests; 4 anchor properties (DRIFT 2 Option C, DRIFT 12, frozen CRYPTO_CONFIG, frozen SYSTEM_PRINCIPALS) |
| 12C.0.5 (operating manual + docs) | CLOSED | `23e263d` | CLAUDE.md + AGENTS.md + 10 ADRs + contributing guides + reference catalog |
| Track A (test infrastructure isolation) | SUBSTANTIVELY COMPLETE | `d728cd4` → `5be42e5` | 18 gates closed + REVISED Gate 2 (Colima canonicalization per RULE 13 substrate-state drift correction); containerized Postgres + mocked LLM tier-stratification per ADR-0011; full chain at CURRENT_BUILD_STATE.md §5 |
| 12.5 Sub-box 1 (EscalationRequest + dual-control) | **UNBLOCKED** | — | Track A delivered; Phase 2 primary engineering scope candidate; D-2D-D10 closure per RAA 12.8 §5.2 + §5.9 item 1 (4-framing-register unified engineering territory; see Dependency Notes below) |
| 12.5 Sub-box 2-9 | QUEUED | — | Dependency-ordered post Sub-box 1 |
| 12C.1 (frontend Playground + Intelligence) | QUEUED | — | 6 cleanup items including 3 sentinel sites in otzar-control-tower (`MemberDetailDrawer.tsx:284`, `Users.tsx:175`, `Users.tsx:195`) |
| 12D (Security & Audit screen) | QUEUED | — | Frontend |
| 12E (Policies / Sharing rules) | QUEUED | — | Frontend |
| 12F (System Health, Settings, Onboarding, accessibility) | QUEUED | — | Frontend polish; consumes Sub-box 1's EscalationRequest in Pending Approvals UI |

## Dependency Notes

**Track A DELIVERED; Sub-box 1 unblocked.** The 90-110 minute
Foundation full-suite test cycle (per ADR-0010) made Sub-box 1's
dual-control middleware iteration prohibitively slow. Track A
test infrastructure isolation (18 gates + REVISED Gate 2 closed
on origin/main per `CURRENT_BUILD_STATE.md` §5) delivered
containerized Postgres + mocked LLM tier-stratification per
ADR-0011: unit subset <60s; integration tier 5-15 min; real-LLM
reserved for nightly / pre-release. Sub-box 1 is now unblocked
as Phase 2 primary engineering scope candidate per substrate
truth canonical at session-anchor canonical reference register
(`docs/CURRENT_BUILD_STATE.md` refreshed at `ecfdf7f` Phase 1a).

**Sub-box 1 = D-2D-D10 unified engineering territory (4-framing-
register cross-reference per RAA 12.8 §9.6 Step 2D-completion
handoff discipline):** Sub-box 1 (EscalationRequest + dual-control
middleware; Foundation primitive blocking Bucket B) coincides
with D-2D-D10-PRIMING-SHAPE-AHEAD-OF-MODEL closure per RAA 12.8
substrate-architecture canonicalization. The single engineering
work substantiates 4 framing registers concurrently:

- **RAA 12.8 §5.2** (EscalationRequest Prisma model + validation
  gate flags + approval workflow + correction propagation chain;
  D-2D-D10 closure detail)
- **Section 12.5 Sub-box 1** (Foundation primitive blocking Bucket
  B; dual-control middleware framing)
- **RAA 12.8 §5.9 item 1** (Step 2E engineering surface
  enumeration; canonical engineering surface for Surface 3)
- **Section 14 admin-tooling box** (existing TODO comment framing
  at `apps/api/src/services/otzar/priming.ts:131-134`:
  "EscalationRequest table doesn't exist yet. The Section 14
  admin-tooling box introduces it.")

Substrate-state observation per RULE 13: priming.ts substrate-
actual path is `apps/api/src/services/otzar/priming.ts` (otzar
service register, NOT coe service register as RAA 12.8 §5.9
ambiguously referenced). Implementation path canonical at otzar
service register; engineering scope unified per Phase 2
substrate-honest discipline.

**Sub-boxes 2-9 depend on Sub-box 1:** Sub-box 1 introduces the
`EscalationRequest` primitive + dual-control middleware that
several downstream sub-boxes consume:

- Sub-box 2 (privileged action audit chain) extends dual-control
  to specific endpoint families
- Sub-box 5 (GDPR Article 17 pseudonymization-with-attestation,
  Family 4) requires escalation for any deletion-equivalent
  action
- Sub-box 7 (verifiable-credentials + compliance attestation
  reports, Family 5) requires escalation for credential issuance

**12C.1 frontend depends on no Foundation work** but waits for
design alignment. Specifically: the 3 sentinel sites in
otzar-control-tower (`MemberDetailDrawer.tsx:284`,
`Users.tsx:175`, `Users.tsx:195`) currently emit
`"pending-foundation-extension"` as a placeholder
`audit_event_id`; they consume Foundation Commit 1's
`PATCH /org/entities` audit_event_id surfacing (closed at
`2aa1a88`). Cleanup is purely a frontend swap from placeholder
to real audit event ID.

**Sub-section gates are explicit:** Each sub-section CLOSED
status requires (a) a clean push to main, (b) verification report
approved, (c) architectural anchor catalog updated if new
anchors landed, (d) glossary updated if new terms landed.

## How To Update This Tracker

When a sub-section closes:

1. Update the row's Status from `IN PROGRESS` or `QUEUED` to
   `CLOSED`.
2. Update the row's Commit cell with the closing commit's short
   hash.
3. Update the row's Description with the actual delivered scope
   (test count, anchor count, etc.) — not the planned scope.
4. Add a new row below for the next IN PROGRESS sub-section.
5. The update lands in the same commit that closes the sub-
   section, so the tracker's HEAD always reflects reality.

When an architectural anchor lands:

1. Note the anchor count change in the relevant row's Description.
2. Cross-reference the anchor's full entry in
   `docs/reference/architectural-anchors.md`.
3. If the anchor introduces a new architectural pattern, the
   ADR for that pattern lands in the same commit.

## See Also

- `docs/CURRENT_BUILD_STATE.md` — session-anchor canonical
  reference for build state; §3 cross-cutting substrate-
  architecture canonicalization work; §4 Section 12.5 sub-box
  framing table (refreshed at `ecfdf7f` Phase 1a; 2026-05-11)
- `docs/architecture/raa-12-8-substrate-dynamics.md` — RAA 12.8
  substrate-architecture canonicalization (14-commit chain
  canonical at `e31f948`; 2026-05-11); §5.2 D-2D-D10 closure
  detail + §5.9 Step 2E engineering surface enumeration + §9.6
  Step 2D-completion handoff discipline
- `docs/reference/architectural-anchors.md` — runtime invariants
  catalog (6 anchors as of `f3359fb`)
- `docs/architecture/decisions/` — Architecture Decision Records
  (22 ADRs canonical at 2026-05-11)
- `docs/reference/glossary.md` — term definitions (32 canonical-
  grade entries at `74b2765` [GLOSSARY-G-3]; Step 2F refresh
  queued per RAA 12.8 §9.3)
- `CLAUDE.md` — operating manual (Section 2 mirrors this tracker
  in summary form)
- `docs/COMPLIANCE_ARCHITECTURE_REVIEW.md` — Section 12.5
  committed substrate; sub-box 1-9 dependency ordering originates
  here
