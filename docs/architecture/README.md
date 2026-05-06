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

ADR catalog as of Section 12C.0:

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
- `docs/reference/architectural-anchors.md` — the 6
  runtime-enforced architectural properties (DRIFT 9 audit,
  DRIFT 9 permissions, DRIFT 2 Option C, DRIFT 12, frozen
  CRYPTO_CONFIG, frozen SYSTEM_PRINCIPALS) as of Section 12C.0
- `docs/reference/section-12-progress.md` — Section 12
  build-cycle live tracker
- `docs/contributing/` — contributor guides (coming in Phase 2
  of Section 12C.0.5)
