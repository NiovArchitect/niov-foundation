# Onboarding for Engineers

This document onboards new **human engineers** to the `niov-foundation`
codebase. For **AI-tool session** onboarding (Claude Code, Codex, Cursor,
ChatGPT) see [`onboarding.md`](./onboarding.md) — that doc is the ritual an
AI assistant runs on session open; this one is the orientation a human
contributor reads before their first pull request.

`niov-foundation` is the protocol layer of the NIOV Labs platform — the
cryptographic governance layer that keeps humans permanently in control of
what AI can know (RULE 0, the Foundation Rule). It implements the COSMP
(Contextual Orchestration and Scoped Memory Protocol, patent US 12,517,919)
and the DMW (Decentralized Memory Wallet) substrate. Every architectural
decision serves that mission; the project's discipline reflects that the
codebase is also a patent-implementation record (ADR-0020 — see §5).

---

## 1. The Substrate-Honest Pre-Flight Discipline (RULE 12 / 13 / 18)

Before you write or modify substrate — code, ADRs, reference docs, anything
that cites or extends other parts of the repo — you **verify the actual
state** of what you are about to touch. You do not edit against an idealized
mental model of the repo; you `grep`, you `cat`, you confirm the cited config
values, the cited paths, the cited function signatures, the existing test
surface, before you draft.

- **RULE 12 — Pre-Flight Grep Before Drafting.** Read the cited files. Run the
  cited greps. Confirm the cited config values. If your change references
  `foo.service.ts:142`, open it and check line 142 actually says what you
  think.
- **RULE 13 — Surface Drifts Inline Over Silent Fix.** When pre-flight finds a
  mismatch between the plan and the substrate (a non-existent field, a stale
  audit-marker name, a wrong path, an under-counted cascade), you **surface it**
  — in the PR description, in the review thread, in the commit body — and
  request resolution. You do not quietly patch the gap in an unrelated diff.
- **RULE 18 — Verify Operation Type Against Actual File State.** The verb
  matters: "move" assumes the source exists; "update" assumes the field is
  present; "extend" assumes the structure is open. Verify the verb against the
  real current file before drafting. (The extension — verify *all* existing
  files that reference the substrate you're modifying, not just the substrate
  itself — caught a 61-test blast radius in Sub-box 2 Phase 1; see §4.)

The Sub-box 2 Phase 1 dual-control arc (sub-phases A→I, ten commits) is the
canonical worked example: 21 substrate-state catches surfaced at pre-flight /
pre-edit, every one caught before any edit chained. New contributors learn the
discipline by reading that arc's commit bodies (`git log --grep '\[SEC-DUAL-CONTROL'`
and `[SEC-CONTRIBUTOR-GOVERNANCE]`) and `docs/architecture/decisions/0026-…`
+ `0027-…`'s "Substrate-State Catches Resolved" sections.

---

## 2. The 20 RULES + 27 ADRs as Canonical Reference

The authorization-tier substrate of the codebase lives in two places:

- **`CLAUDE.md` §3 — the 20 RULES** (RULES 0-10 + 12-20; RULE 11 vacant). These
  are the operational rules every session (human or AI) internalizes. Read all
  of `CLAUDE.md` before your first contribution — it is the operational
  rulebook, not optional context. The RULES you will reach for most often:
  RULE 1 (build forward only — add, don't restructure working code), RULE 3
  (every function/endpoint gets a test), RULE 4 (audit before response), RULE 6
  (FILE/PURPOSE/CONNECTS-TO headers + WHAT/INPUT/OUTPUT/WHY JSDoc), RULE 9
  (services connect through APIs — no cross-service DB reads), RULE 14
  (bidirectional citation discipline), RULE 16 (no `console.*` in
  `apps/api/src`), RULE 20 (Rule-Modification Authority — see §3).
- **`docs/architecture/decisions/` — the 27 ADRs** (`0001-…` through `0027-…`,
  plus `0000-template.md`). Michael Nygard format with niov-foundation
  extensions (Easier/Harder consequence split, bidirectional-citation block,
  ISO-dated Status). `docs/architecture/README.md` is the navigable catalog;
  start there. Cite ADRs by number (`ADR-0006`) — the number is stable, the
  title may be amended.

When a term, anchor, or decision is non-obvious in code or docs, **cite the
reference**, do not redefine. Vocabulary lives in `docs/reference/glossary.md`;
the runtime invariants in `docs/reference/architectural-anchors.md`.

---

## 3. RULE 20 in Practice — Rule-Modification Authority

RULE 20 draws a hard line: **only the patent-holder Founder may modify, add, or
remove RULES (`CLAUDE.md`) or ADRs (`docs/architecture/decisions/*.md`)**. This
applies to human contributors and to AI assistants (Claude, Claude Code, Codex,
Cursor, any other AI coding tool) — even when you are authorized to modify other
files in the repo.

What this means for you as a contributor:

- **You may edit code, tests, reference docs, contributing guides.** Ordinary
  review territory.
- **You may NOT edit a RULE in `CLAUDE.md` §3 or an ADR in
  `docs/architecture/decisions/`** in your PR. If your work *needs* such a
  change, you:
  1. Open a PR that **does not** make the change but **proposes** it — describe
     the proposed RULE/ADR modification in the PR description and **explicitly
     cite RULE 20**.
  2. Surface the proposal for **explicit Founder authorization** before merge.
  3. If you're an AI assistant: you **surface** the proposal as a substrate-state
     observation (per RULE 13) and **cite RULE 20** when declining to make the
     edit yourself. You **may draft** a proposed amendment for the Founder's
     review — drafting is not modifying; the Founder's authorization is the act
     that lands it.
- **Founder-authorization of a RULE/ADR change is a substrate-state action**,
  not a routine merge. The Founder reads the proposal as a change to the
  project's governing substrate.

The mechanics elsewhere: a *new* RULE requires an ADR (per `CLAUDE.md` §11 —
the ADR drafts the change; the same commit lands the ADR + the `CLAUDE.md`
amendment with a RULE 14 back-cite). RULE 20 governs *who* may make that change
(the Founder). The ADR for RULE 20 itself is `docs/architecture/decisions/0027-contributor-governance.md`.

---

## 4. The Substrate-State Observation Discipline

A "substrate-state observation" is the unit of the discipline: a precise,
verified statement about what the repo *actually* says — as opposed to what a
plan, a mental model, or a confident assertion *assumes* it says. The pattern:

- **"I'd authorize this"** vs. **"the substrate actually says this."** The first
  is a judgment; the second is a fact you've verified. The discipline asks for
  the second before you act on the first.
- When you find a mismatch, you **surface it with the evidence** — the file,
  the line, the actual text vs. the assumed text — and **request resolution**
  before drafting. You do not infer intent and silently patch.

Worked examples from the Sub-box 2 Phase 1 arc (the 21 catches; see ADR-0026 +
ADR-0027 "Substrate-State Catches Resolved"):

- The plan assumed `EscalationRequest` had a `details` JSON column to carry an
  action descriptor; the schema actually has `description: String` and
  `resolution_metadata: Json?`, no `details` — so the carrier became the
  `description` column (`DUAL_CONTROL:${actionType}` exact-match). *(Catch #6.)*
- The plan named the org-creation audit marker `ORG_CREATION`; the actual
  `executePhase0` summary event is `DANDELION_PHASE_0_COMPLETE` — the test
  asserts on the real name. *(Catch #13.)*
- The plan estimated a 3-file scope for binding `requireDualControl` to
  `POST /platform/orgs`; the actual blast radius was ~61 tests across 3
  integration files (the `createOrgAndAdmin` setup helper) — resolved by
  rewiring the helpers to bypass the route via `executePhase0` directly.
  *(Catch #13.)*
- The plan said `section-12-progress.md` was at `docs/architecture/`; it is at
  `docs/reference/`. *(Catch #14.)*

The lesson: the discipline is not bureaucracy — every one of those was a real
edit against an idealized file that would have broken something or drifted the
substrate. Verify, surface, resolve, *then* edit.

---

## 5. The Patent-Implementation-Evidence Framing (ADR-0020)

The codebase is also a record. Per ADR-0020 (Two-Register IP Discipline),
Foundation operates in two registers: Register 1 (AI-authorship lens — private
architectural scaffolding: metaphors, conceptual handles) and Register 2
(concrete form — the business-grade canonical topology: entities, wallets,
capsules, COSMP, hardened substrate documentation). Everything that enters the
repo — code, ADRs, RAAs, business surfaces — is **Register 2**: contemporaneous,
disciplined, sequentially-numbered evidence of the patent-protected COSMP/DMW
architecture's implementation.

Two things follow for a contributor:

- **Identity-level naming never enters the repo** (RULE 19). Named individuals
  — adversarial actors, current/former team members in operational context,
  legal/vendor/financial/investor counterparts, hiring candidates, internal
  codenames, pre-announcement product/partnership names — are Register 1. They
  never appear in commits, ADRs, RAAs, business surfaces, or any repo-visible
  text. Frame against the abstract situation, not the named actor.
- **The substrate-state coherence is the asset.** A disciplined record — every
  governing change ADR-drafted, every drift surfaced, every commit on
  `origin/main` dated and authorized — is what makes the patent-implementation
  record robust. RULE 20 (§3) protects the *governing* layer of that record;
  the substrate-honest pre-flight discipline (§1) protects the *operational*
  layer. Your contribution is part of that record.

---

## 6. Recommended Reading Order

1. **`CLAUDE.md`** — the operational rulebook (the 20 RULES; read all of it).
2. **`docs/architecture/README.md`** — the ADR catalog (27 ADRs) + the ADR
   Lifecycle discipline.
3. **`docs/architecture/decisions/0001-…` onward** — at minimum ADR-0001
   (three-wallet architecture), ADR-0002 (append-only audit chain), ADR-0004
   (service-owned auth gate), ADR-0009 (COSMP 7-operation enumeration), ADR-0011
   (three-tier test stratification), ADR-0020 (two-register IP discipline).
4. **`docs/architecture/dual-control-operations-canonical-record.md`** — the
   canonical-record-doc pattern (the operational companion to an ADR), worked.
5. **`docs/architecture/decisions/0026-dual-control-middleware-pattern.md`** —
   the substantive-bundle ADR pattern, worked; read its "Substrate-State Catches
   Resolved" section.
6. **`docs/architecture/decisions/0027-contributor-governance.md`** — this
   onboarding doc's decision lineage (RULE 20; the AI-alignment + contributor-
   governance disciplines).
7. **`docs/contributing/README.md`** + `code-style.md` + `testing.md` +
   `parallel-sessions.md` — the day-to-day mechanics.
8. **`docs/contributing/onboarding.md`** — the AI-tool-session ritual (useful
   context even if you're a human; it's what Claude Code / Codex / Cursor run on
   session open).

When in doubt: read the cited reference; cite ADRs by number; surface
substrate-state observations rather than guessing; and a RULE/ADR change is the
Founder's, not yours (RULE 20).
