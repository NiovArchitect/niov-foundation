# Architecture Directory

Architecture-level documentation for niov-foundation. This
directory holds Architecture Decision Records (ADRs) — the
captured rationale behind every load-bearing architectural
choice in the codebase. ADRs explain *why* a decision was made,
not *what* was made (the codebase is the source of truth for
the *what*; ADRs prevent re-litigation of the *why*).

This directory is distinct from:

- `docs/reference/` — substrate documentation (glossary,
  architectural-anchors catalog, section-progress trackers)
- `docs/contributing/` — contributor guides (code style,
  testing, multi-LLM operation)

## Directory Structure

```
docs/architecture/
├── README.md                           (this file — index)
└── decisions/
    ├── 0000-template.md                (ADR template + how-to)
    ├── 0001-three-wallet-architecture.md
    ├── 0002-append-only-audit-chain.md
    ├── 0003-frozen-config-tamper-anchors.md
    ├── 0004-service-owned-auth-gate.md
    ├── 0005-no-console-in-apps-api-src.md
    ├── 0006-cross-org-leak-prevention.md
    ├── 0007-manual-bearer-auth-compliance-endpoints.md
    ├── 0008-entity-compliance-profile-org-level.md
    ├── 0009-cosmp-seven-operation-enumeration.md
    └── 0010-foundation-tests-legitimately-slow.md
```

## Architectural Decision Records (ADRs)

ADRs use the Michael Nygard format with niov-foundation
extensions (Easier/Harder consequence split, bidirectional
citation block, ISO-dated Status). The template at
`decisions/0000-template.md` includes both the structure and
the "How To Use This Template" guidance for new ADRs.

ADR catalog as of [SEC-DUAL-CONTROL-ADR] (2026-05-12;
26 ADRs):

- **ADR-0001** — Three-wallet architecture (foundational)
- **ADR-0002** — Append-only audit chain with BEFORE DELETE trigger (foundational)
- **ADR-0003** — Frozen-config tamper anchors (Section 12C.0)
- **ADR-0004** — Service-owned auth gate pattern (Section 12C.0)
- **ADR-0005** — No `console.*` in `apps/api/src` (Section 12C.0; DRIFT 2 Option C)
- **ADR-0006** — Cross-org leak prevention via filter narrowing (Section 12C.0)
- **ADR-0007** — Manual bearer auth for `/compliance/*` endpoints (Section 12C.0; will be superseded by Sub-box 7)
- **ADR-0008** — `EntityComplianceProfile` is org-level, not aggregated (Section 12C.0; DRIFT 15)
- **ADR-0009** — COSMP 7-operation enumeration (locked by patent US 12,517,919)
- **ADR-0010** — Foundation tests are legitimately slow (90-110 min) (Section 12C.0 emergent lesson)
- **ADR-0011** — Three-tier test stratification (Track A Gate 1; Gate 6 reproducibility-verification amendment in-place)
- **ADR-0012** — Test-mode LLM provider hardening (Track A Gate 1; hash-dispatch decision superseded in part by ADR-0014)
- **ADR-0013** — Containerized Postgres for unit and integration tiers (Track A Gate 1; `postgres:16.4-alpine` pin)
- **ADR-0014** — FixtureBasedLLMProvider key-based dispatch (Track A Gate 3; supersedes ADR-0012's hash-by-content dispatch)
- **ADR-0015** — CI Workflow Architecture (Track A Gate 7; 8 locked decisions A-H including postgres + Node pins)
- **ADR-0016** — Pin-and-Optimize Framework (substrate-pinning canonical reference; companion to ADR-0017/0018/0019; five-question template)
- **ADR-0017** — Production Discipline (substrate-investigation canonical reference; companion to ADR-0016/0018/0019; nine-step template)
- **ADR-0018** — Deployment-Target Agnosticism Posture (substrate-portability canonical reference; companion to ADR-0016/0017/0019; five-step decision template)
- **ADR-0019** — Cryptographic-Suite Posture (substrate-cryptographic-resilience canonical reference; companion to ADR-0016/0017/0018; six-step decision template)
- **ADR-0020** — Two-Register IP Discipline (IP-discipline register; the protected-name boundary + RULE 19 at canonical-record register)
- **ADR-0021** — Capsule Type Extension Protocol (extension-protocol register; CapsuleType enum extension pattern + the PRICING_TABLE deliberate-blocker worked example)
- **ADR-0022** — combined_score Formula Canonicalization (scoring-formula register; the 0.45/0.35/0.20 coefficients + recency thresholds; amended for the INT-6 frozen-anchors-family informativeness-coefficient join)
- **ADR-0023** — Security Headers Posture (security-headers register; the `@fastify/helmet` posture)
- **ADR-0024** — Pre-Commit Hook Posture (git-hook-tier enforcement register; husky pre-commit running the typecheck baseline + the RULE 16 no-console anchor + the ADR-0025 db-push guard)
- **ADR-0025** — Schema-Push-Target Discipline (schema-push-target register; the `prisma db push` explicit-env-target rule + the wrapper + the pre-commit db-push guard; the [D-2D-D10-4] production-schema-push trap)
- **ADR-0026** — Dual-Control Middleware Pattern + Privileged Endpoint Registry + Per-Route Binding Discipline (dual-control register; the Sub-box 2 Phase 1 architectural bundle — the `requireDualControl` Fastify preHandler + the `PRIVILEGED_ENDPOINTS` runtime registry + the `preHandler` binding contract + the 6 BEAM-compatibility patterns; the operational companion is `docs/architecture/dual-control-operations-canonical-record.md`)

ADRs are sequentially numbered. Gaps are not closed when ADRs
are superseded or deprecated — a retired ADR keeps its number
with Status updated to "Superseded by ADR-NNNN" or "Deprecated."
This preserves citation stability across the ADR catalog over
time.

## ADR Lifecycle

Status flows: **Proposed** → **Accepted YYYY-MM-DD** → optionally
**Superseded by ADR-NNNN** or **Deprecated**.

Add a new ADR when an architectural decision is one that future
contributors will need to understand the rationale for. If a
decision is purely tactical and won't be referenced in six
months, it doesn't need an ADR.

Amend an existing ADR (in-place edit, same commit, no Status
change) for clarifications or to add new bidirectional
citations. Supersede an existing ADR (new ADR with explicit
"Supersedes ADR-NNNN" line, prior ADR's Status updated) when
a new architectural decision replaces an earlier one.

## Bidirectional Citation Discipline

Every ADR's References section ends with a "Bidirectional
citations (cited from)" block listing every other file that
cites it — glossary entries, architectural-anchors catalog
entries, other ADRs, code JSDoc comments. When adding a new
ADR that cites an existing ADR, the existing ADR's References
must be amended in the same commit to include the
back-citation.

The discipline ensures future readers grepping any file in the
citation graph can navigate to every related file. Broken
cross-references surface as missing back-citations during
review.

The two primary citation sources outside of ADRs themselves are
`docs/reference/glossary.md` (terminology + capitalization
conventions) and `docs/reference/architectural-anchors.md` (the
runtime-enforced architectural properties locked by tests).

## Cross-References

- `docs/reference/glossary.md` — term definitions and
  capitalization conventions
- `docs/reference/architectural-anchors.md` — the 8
  runtime-enforced architectural properties (DRIFT 9 audit,
  DRIFT 9 permissions, DRIFT 2 Option C, DRIFT 12, frozen
  CRYPTO_CONFIG, frozen SYSTEM_PRINCIPALS, `combined_score`
  coefficient invariants per ADR-0022, `RELEVANCE_FORGET_FLOOR`
  behavioral lock per ADR-0022) as of [DOCS-CATALOG-REFRESH-ANCHORS]
- `docs/reference/section-12-progress.md` — Section 12
  build-cycle live tracker
- `docs/contributing/` — contributor guides (coming in Phase 2
  of Section 12C.0.5)
