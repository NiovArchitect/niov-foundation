# Onboarding

New contributor introduction to the NIOV Foundation repository.
This file is the entry point: read it first, then follow the
session opening ritual at §3 every time you sit down to work.

## 1. What is NIOV Foundation?

NIOV Foundation is the **AI Memory Governance Substrate** — the
patented infrastructure layer between language models and
enterprise institutional memory. The Contextual Orchestration
and Scoped Memory Protocol (COSMP) governs seven primitive
operations on AI memory; the Decentralized Memory Wallet (DMW)
holds that memory as cryptographically-governed capsules owned
by the enterprise. Foundation is deployment-target agnostic
(per ADR-0018), post-quantum-ready by primitive selection (per
ADR-0019), and runs underneath Otzar (the first canonical
application) and any future enterprise or government
applications. Three issued US patents protect the architecture:
**12,164,537** / **12,399,904** / **12,517,919**. See
`docs/CURRENT_BUILD_STATE.md` §1 for the canonical
one-paragraph summary.

## 2. Read these first

In this order, before any code or doc work:

1. **`CLAUDE.md`** (repo root) — the operational rulebook. The
   19 RULES (0-10 + 12-19; RULE 11 vacant) define what every
   session in this repo internalizes.
2. **`docs/CURRENT_BUILD_STATE.md`** — the persistent canonical
   reference for what's built, what's in flight, what's queued,
   and what's been captured for forward architectural work.
   Updated as build progresses; load it at session start.
3. **`docs/reference/glossary.md`** — every Foundation-specific
   term (Memory Capsule, COSMP, COE, DMW,
   EntityComplianceProfile, `writeAuditEvent`,
   `SYSTEM_PRINCIPALS`, etc.) with definitions, schema
   citations, and capitalization conventions.
4. **`docs/reference/architectural-anchors.md`** — the 6
   runtime-enforced architectural properties (DRIFT 9 audit +
   permissions filter narrowing, DRIFT 2 Option C no-console,
   DRIFT 12 chainKey priority, frozen `CRYPTO_CONFIG`, frozen
   `SYSTEM_PRINCIPALS`).

After this entry sequence, individual ADRs and contributing
guides become readable in any order driven by the current task.

## 3. The session opening ritual

Concrete steps every Claude Code session and every operator
terminal session:

1. **Read `CLAUDE.md`.** Confirm the 19 RULES are loaded into
   context. RULE 12 (pre-flight grep) and RULE 13 (surface
   drifts) govern every drafting action; RULE 14 (bidirectional
   citation) governs every ADR or reference doc that cites
   another. RULE 17 governs architectural framing load-on-open;
   RULE 18 governs operation-type verification; RULE 19 governs
   two-register IP discipline.
2. **View `docs/CURRENT_BUILD_STATE.md`.** This is the
   forward-living source of truth. Its Section 3 tells you
   which Build Guide sections are closed; its Section 4 tells
   you the current Section 12 sub-section status; its Section
   6 surfaces PROTECTED-PRIORITY queued work.
3. **Check `git status` + `git log --oneline -3`.** Confirm
   working tree state and HEAD position before any new work.
4. **Verify identity.**
   ```bash
   git config user.name   # expect: niovarchitect
   git config user.email  # expect: sadeil@niovlabs.com
   ```
   If either is wrong, fix it before any commit. See §7
   below.
5. **Load architectural framing.** View
   `docs/architecture/dynamic-flow-architecture.md` §1
   (Foundation as Embodied Substrate for AI Cognition) at
   minimum. As additional canonical RAAs land in
   `docs/architecture/`, read those too. The framing —
   qi-and-blood lens, bilateral-vs-unilateral zones,
   embodied-substrate distinction — informs all subsequent
   work; sessions that skip this step operate without the
   architectural lens that distinguishes substrate-honest
   work from idealized-model work. See CLAUDE.md RULE 17.

The ritual is short by design — it's not a setup checklist; it's
a context-loading checklist. Each step exists because skipping
it has produced concrete drift.

## 4. Substrate-discipline operating principles

Foundation operates by a quartet of canonical reference ADRs
that codify the discipline patterns that emerged during
substrate work. Read each at least once when the relevant axis
applies to the work in front of you.

**ADR-0016 — Pin-and-Optimize Framework (what-to-pin).**
Five-question template for deciding *what to pin and why* when
adding any external dependency (runtime version, container
image, package version, schema version, third-party SDK). Each
pin gets a dominant-concern axis (parity-with-local,
LTS-compliance, audit-stability, security-patch-cadence, etc.),
and the axis is documented per ADR. Canonical worked examples:
`postgres:16.4-alpine` (Decision E, parity-with-local) and
Node `22.11.0` (Decision H, LTS-compliance) — both per
ADR-0015.

**ADR-0017 — Production Discipline (how-to-investigate).**
Nine-step investigation template applied to every substrate
drift. Frames observation vs inference; demands empirical
verification before fix design; encodes prevention via
substrate tests or pre-flight checks. The G5b-I Resolution
(`fbc7942`) is the canonical worked example. See §5 below for
the operational walkthrough.

**ADR-0018 — Deployment-Target Agnosticism Posture
(where-to-deploy).** Foundation runs unchanged across managed
cloud, sovereign cloud, on-premise, and air-gapped deployments.
Five-step decision template applies when a customer
deployment-target requirement surfaces (sovereign cloud,
on-premise, air-gapped, blockchain substrate). AWS GovCloud
RDS for PostgreSQL is the queued canonical worked example for
the sovereign-cloud category.

**ADR-0019 — Cryptographic-Suite Posture
(cryptographic-suite resilience).** Six-step decision template
applies when a new cryptographic operation is needed
(signature, hash, encryption, KDF, random, HMAC, key
exchange). Foundation's current symmetric-only stack
(HS256, SHA-256, AES-256-GCM, bcrypt) is the canonical worked
example — post-quantum ready by primitive selection with zero
Shor's-vulnerable crypto in production. PQC migration triggers
are documented (FIPS 203/204/205 hybrid signatures, etc.).

The four ADRs operate as a coherent quartet: ADR-0016 says
*what to pin*; ADR-0017 says *how to investigate when a pin
breaks*; ADR-0018 says *where to deploy what's been pinned*;
ADR-0019 says *what cryptographic primitives the deployment
must offer*. CLAUDE.md §6 narrates the historical
"framing growth-drift acknowledgment" — earlier ADRs in the
quartet were drafted as a "pair" or "trio" because they
landed before later quartet members; the framing language is
preserved as substrate-honest contemporaneous accuracy.

## 5. The investigation discipline (ADR-0017 nine-step template)

When you hit a drift — a test fails after substrate work, a
type error appears that wasn't there yesterday, a fixture
that was valid stops being valid — apply the nine-step
template before designing any fix.

The full template lives in **ADR-0017**. The operational
summary:

1. **Frame the drift.** What was expected, what was observed,
   what changed. Write it down. Frame the drift as a sentence
   before any code reading.
2. **Distinguish observation from inference.** Separate "the
   test failed" (observation) from "the schema must be wrong"
   (inference). Inferences are hypotheses to verify, not
   conclusions to act on.
3. **Verify inferred premises empirically before fix design.**
   Don't design a fix until the inference is confirmed against
   the substrate. Run the failing call standalone; check the
   actual schema; reproduce the failure deterministically.
4. **Reframe based on evidence.** Let the empirical
   verification rewrite the framing. Sometimes the original
   framing was wrong; the rewrite is the diagnostic
   breakthrough.
5. **Identify root causes end-to-end.** Trace the drift to
   substrate, not just the test surface. A failing test is a
   symptom; the root cause is upstream.
6. **Design defense-in-depth fix scope.** Fix the root cause
   AND any propagation paths. A drift caught in one place was
   probably propagating in others; surface the surface-area
   before designing the fix.
7. **Apply with three-approvals discipline.** File inventory,
   commit body, subject — operator green-lights each
   independently before commit. See §8 below.
8. **Encode prevention.** Substrate test, pre-flight check, or
   anchor that catches the same drift class next time. The
   discipline is "this drift cannot recur silently"; the test
   or check is the encoding.
9. **Document the lineage.** The drift, the investigation, the
   fix, and the prevention encoded in the commit body. Future
   reviewers reading the commit understand not just what
   changed but why and how it was found.

**Canonical worked example: G5b-I Resolution (`fbc7942`).** A
test failure during Gate 5b initially looked like a
recording-script bug. Pre-flight verification (Step 3) ran
the production parser standalone and confirmed it worked
correctly on the same input — the recording script was *not*
the bug. The reframe (Step 4): the drift was actually a test
coverage gap. Prevention (Step 8): close the coverage gap
rather than patch the recording layer. The commit body
documents the lineage end-to-end (Step 9).

The discipline applies to every drift, not just test failures.
Schema drift, env-loading drift, dependency drift, fixture
drift — all benefit from the nine-step framing.

## 6. Pre-flight grep, drift surfacing, bidirectional citation

Three operational disciplines from `CLAUDE.md` worth knowing
by heart:

**RULE 12 — Pre-flight grep before drafting.** Before writing
or modifying substrate (ADRs, reference docs, contributing
guides, or any documentation that cites code): verify the
cited substrate against the actual repo. Read the cited
files, run the cited greps, confirm the cited config values.
Skipping this discipline produces silent drift between spec
and substrate.

**RULE 13 — Surface drifts inline over silent fix.** When
pre-flight grep finds a mismatch between spec and substrate
(or between two pieces of substrate), surface the drift in
the verification report and request resolution. Do not
silently patch the gap in an unrelated commit. The Phase 1E
COSMP expansion correction (Capsule Owned Sovereign vs.
patent-canonical Contextual Orchestration and Scoped Memory)
is the canonical example.

**RULE 14 — Bidirectional citation discipline.** Any new ADR
or reference doc that cites another ADR or reference doc
must be matched by a back-citation in the cited file in the
same commit. The discipline ensures the citation graph is
closed and a future reader grepping any file in the graph can
navigate to every related file. See `docs/architecture/README.md`
§Bidirectional Citation Discipline for the full rationale.

## 7. Commit attribution discipline

Foundation commits are sole-authored corporate-identity
records. The discipline:

- **Author:** `niovarchitect <sadeil@niovlabs.com>`. This is
  the patent-holder identity; commits are part of the
  patent-holder implementation record. Verify
  `git config user.email` matches before any commit.
- **No `Co-Authored-By:` trailers.** Foundation work is
  sole-authored. AI assistance is integral to the workflow
  but does not appear in the commit attribution graph.
- **No "Generated with Claude Code" attribution.** Same
  reasoning — the commit record is the patent-holder's
  implementation log, not a tooling acknowledgment.
- **No `noreply@anthropic.com` address.** Same reasoning.

The discipline produces a clean patent-holder implementation
record that withstands future due-diligence review without
requiring trailer cleanup or attribution disambiguation.

## 8. Three-approvals + commit + push gate

The standard commit flow for any non-trivial work:

1. **Pre-commit checks** (surface inline):
   - `git status` clean except for the new files being
     committed
   - `git config user.name` + `user.email` match discipline
   - `npx tsc --noEmit 2>&1 | grep -c "error TS"` = 12
     (the strict baseline per ADR-0015 Decision B)
   - `git check-ignore -v <each-new-file>` returns no
     matches (files are trackable)
2. **Stage exactly the intended files.** Use specific paths,
   not `git add .`. The `.claude/` directory and similar
   operational dirs are excluded by discipline.
3. **Approval 1 — file inventory.** Surface each file with
   line count and status (NEW or MODIFIED). Operator
   green-lights before proceeding.
4. **Approval 2 — commit body.** Surface the full body
   inline. Operator confirms imperative mood, all required
   SHA references, no Co-Authored-By, no AI tooling
   attribution, sole authorship preserved.
5. **Approval 3 — subject.** Surface the subject line for
   final operator sign-off. Subject length context: yesterday's
   substantial commits ran 85-100 chars; multi-document
   commits may run longer (see commit `95ad861` at 163 chars
   for the precedent).
6. **Commit.** Write commit body to `/tmp/commit-<gate>.txt`;
   `git commit -F /tmp/commit-<gate>.txt`.
7. **Verification** (4 checks):
   - HEAD SHA is new (different from prior HEAD)
   - Subject matches Approval 3 verbatim
   - Files match Approval 1
   - Author = `niovarchitect <sadeil@niovlabs.com>`
   - Trailers EMPTY (`git log HEAD -1 --format="%(trailers)"`
     prints zero lines)
8. **Push gate (separate authorization).** Operator
   green-lights push independently of commit approval. After
   push, verify CI green via `gh run list -R
   NiovArchitect/niov-foundation -L 1` and
   `gh run watch <run-id> --exit-status`.

The flow is deliberately gate-heavy. Each gate exists because
skipping it has produced concrete failure modes: silent
inclusion of operational files in `git add .`, attribution
trailers requiring force-pushes to remove, premature push
before CI revealed substrate regression.

## 9. Where to find things

| Type | Location |
|---|---|
| Architectural decisions | `docs/architecture/decisions/0001-*.md` through `0019-*.md` |
| Operator-facing rulebook | `CLAUDE.md` (repo root) |
| Persistent build state | `docs/CURRENT_BUILD_STATE.md` |
| Compliance posture | `docs/FIPS_DEPLOYMENT_POSTURE.md` |
| Compliance Architecture Review | `docs/COMPLIANCE_ARCHITECTURE_REVIEW.md` |
| Audit retention posture | `docs/AUDIT_RETENTION_POSTURE.md` |
| Structured logging schema | `docs/STRUCTURED_LOGGING_SCHEMA.md` |
| Glossary | `docs/reference/glossary.md` |
| Architectural anchors (6) | `docs/reference/architectural-anchors.md` |
| Section 12 progress tracker | `docs/reference/section-12-progress.md` |
| Reconciliation evidence | `docs/reconciliation/2026-05-08-build-reconciliation.md` |
| Code style conventions | `docs/contributing/code-style.md` |
| Testing conventions | `docs/contributing/testing.md` |
| Parallel-session discipline | `docs/contributing/parallel-sessions.md` |
| Codex collaboration patterns | `docs/contributing/codex-vs-claude-code.md` |
| Cursor bootstrap | `docs/contributing/cursor-bootstrap.md` |
| ChatGPT bootstrap | `docs/contributing/chatgpt-bootstrap.md` |
| Patched Build Guide PDF | `docs/NIOV_Master_Build_Guide_S9_S17_Patched.pdf` (gitignored, working reference) |
| Strategic positioning docs | `~/Desktop/NIOV Labs/Otzar Dev/` (working references, not in repo) |

## 10. First contribution checklist

For your first non-trivial contribution to Foundation:

- [ ] Read §1-8 of this file (skip §10 / §11 — those are
      reference).
- [ ] Read `CLAUDE.md` end-to-end at least once.
- [ ] Read `docs/CURRENT_BUILD_STATE.md` Sections 1-7.
- [ ] Skim the ADR titles in `docs/architecture/decisions/`
      to know what's been decided. Read the ADR(s) relevant to
      your task in full.
- [ ] Run the session opening ritual (§3) at the start of
      your work session.
- [ ] Apply pre-flight grep (RULE 12) before drafting any
      doc or substrate change.
- [ ] If you hit a drift during the work, apply the ADR-0017
      nine-step template (§5) before designing a fix.
- [ ] Run the local test tier appropriate to your change
      (`npm run test:unit` for service-class work; `npm run
      test:integration` for HTTP-touching work; the real-LLM
      tier runs in CI nightly so you don't need to invoke it
      locally unless your change touches real-LLM behavior).
- [ ] Follow the three-approvals + commit + push gate flow
      (§8). Don't skip approvals.
- [ ] Verify CI green before marking the task complete.

## 11. See Also

- `CLAUDE.md` — the operational rulebook (19 RULES; read
  before every action).
- `docs/CURRENT_BUILD_STATE.md` — the persistent canonical
  reference (load at session start).
- **ADR-0017** — Production Discipline (the nine-step
  template that anchors §5 above).
- **ADR-0016** — Pin-and-Optimize Framework
  (substrate-discipline canonical reference quartet —
  what-to-pin).
- **ADR-0018** — Deployment-Target Agnosticism Posture
  (substrate-discipline canonical reference quartet —
  where-to-deploy).
- **ADR-0019** — Cryptographic-Suite Posture
  (substrate-discipline canonical reference quartet —
  cryptographic-suite resilience).
- `docs/contributing/testing.md` — testing conventions
  including the ADR-0011 classification rule and the §When
  Tests Reveal Substrate Drift cross-reference to ADR-0017.
- `docs/contributing/code-style.md` — code conventions
  (FILE/PURPOSE/CONNECTS TO header, WHAT/INPUT/OUTPUT/WHY
  blocks, structured logger usage).
- `docs/contributing/parallel-sessions.md` — multi-agent
  coordination discipline (relevant when working alongside
  Codex / Cursor / ChatGPT).
- `docs/architecture/README.md` — ADR catalog and
  bidirectional citation discipline (RULE 14).
- `docs/reference/glossary.md` — every Foundation-specific
  term defined.
- `docs/reference/architectural-anchors.md` — the 6
  runtime-enforced architectural properties.
