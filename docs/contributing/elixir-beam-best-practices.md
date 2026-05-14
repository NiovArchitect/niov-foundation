# Elixir/BEAM Best Practices for NIOV Foundation Contributors

**Status**: Substrate-binding canonical at sub-phase 6c
`[BEAM-WIDER-KNOWLEDGE-CHECK-DISCIPLINE]` (2026-05-14). Required
reading when contributor work touches Elixir/BEAM substrate per
RULE 11.

This document is the curated reference for new team members and
their AI tools when working with the COSMP coordination layer
(`apps/cosmp_router/`) or future DBGI supervisor substrate
(sub-phases 7-10). The discipline it canonicalizes — D-WIDER-
KNOWLEDGE-CHECK — emerged from the substrate-build observation
that local Sandbox iteration on substrate-state observations
suggesting architectural-register coupling is substrate-build
discipline failure: the right register for the fix is the
architecture, not the Sandbox API.

## 1. The Discipline (RULE 11 + D-WIDER-KNOWLEDGE-CHECK)

When working with Elixir/BEAM substrate, substrate-state
observations sometimes look like API-level problems
(non-deterministic test failures, ownership errors, ETS
contention) when the actual register is architectural
(supervised-singleton across tests, ETS table name collision,
GenServer state shared between processes).

Local iteration at the Sandbox / ETS / GenServer API register
on observations that point at architectural-register coupling
burns tokens without converging on substrate-coherence. The
discipline: **research broader Elixir/BEAM community canonical
patterns BEFORE authorizing fixes** when observations suggest
architectural coupling.

### When the discipline applies

- Non-deterministic test failures across iteration attempts
  (different failure counts on different runs)
- Supervised GenServer behavior across test boundaries
  (owner exited, ownership mismatch)
- ETS / Sandbox / DBConnection ownership questions
- Cross-test-cycle state contamination patterns
- Any substrate-state observation where local iteration isn't
  converging on substrate-coherence

### When the discipline does NOT apply

- Pure unit-tier bugs (e.g., a `case` statement missing a
  clause; a pattern-match error in a single function)
- Postgres / Ecto query bugs (wrong column name; missing index)
- Protobuf / gRPC wire-format bugs
- Patent-canonical substrate concerns (RULE 0, ADR-0009,
  ADR-0020 — these have NIOV-internal canonical answers)

### How to invoke it at pre-flight

1. Surface substrate-state observation precisely. Name the
   failure mode. Note whether it's deterministic.
2. Check the 6 canonical sources (§3 below). Spend 5-15 minutes
   reading patterns relevant to the observation.
3. If a canonical pattern surfaces, cite it explicitly to the
   operator with the source URL and the pattern's applicability
   to the observation.
4. If no canonical pattern surfaces, surface the research
   negative-result to the operator and propose the next
   investigation step.
5. NEVER iterate locally on substrate-state observations
   suggesting architectural coupling without broader community
   pattern check.

## 2. The 6 Canonical Elixir/BEAM Sources

### Ecto.Adapters.SQL.Sandbox

**URL:** https://hexdocs.pm/ecto_sql/Ecto.Adapters.SQL.Sandbox.html

**Covers:** Sandbox connection ownership, `start_owner!`/
`stop_owner` API, shared-mode semantics, patterns for testing
GenServers/Tasks/web servers that need DB access, supervised
GenServer + Repo patterns.

**When to consult:** Any test failure mode involving
`DBConnection.Holder.checkout`, `DBConnection.OwnershipError`,
"owner exited", Sandbox.mode questions, or supervised processes
accessing the Repo across test boundaries.

**Canonical excerpt:** "`start_owner!/2` should be used in place
of `checkout/2`. `start_owner!/2` solves the problem of unlinked
processes started in a test outliving the test process and
causing ownership errors."

### Sean Lewis "Elixir Concurrent Testing Architecture"

**URL:** https://sensaisean.medium.com/elixir-concurrent-testing-architecture-13c5e37374dc

**Covers:** Per-test GenServer instances via name-configurability,
`start_supervised!` patterns, manager-layer pattern for instance
resolution, `Application.compile_env` for default-preservation,
async test scaffolding.

**When to consult:** GenServer testability questions; need to
spawn per-test instances; questions about Registry vs explicit
naming; async test discipline.

**Canonical excerpt:** "Every test file should be configured as
`async: true`, and `start_supervised` should be used to start
unique GenServers or other required async processes in the setup
block."

### DockYard "Understanding Test Concurrency in Elixir"

**URL:** https://dockyard.com/blog/2019/02/13/understanding-test-concurrency-in-elixir

**Covers:** Architectural framing for shared mutable state in
tests; ExUnit test ordering; `:shared` mode + `async: false`
trade-offs; per-test instance discipline.

**When to consult:** Need architectural framing on why a
testability problem is architectural rather than API-level;
questions about concurrent vs sequential test runs.

**Canonical excerpt:** "Each test spins up its own instance of
the GenServer to work with… mixing concurrent tests with a
shared mutable state of any kind will cause problems."

### KV.Registry Mix-OTP canonical (Elixir official tutorial)

**URL:** https://elixir-lang.org/getting-started/mix-otp/ets.html
(redirects to https://hexdocs.pm/elixir/erlang-term-storage.html;
also see https://elixir-lang.readthedocs.io/en/latest/mix_otp/6.html
for the historical KV.Registry implementation)

**Covers:** Canonical `:name` required option
(`Keyword.fetch!(opts, :name)`), ETS-named-by-server-name,
public functions taking server name as first arg,
`start_supervised!` test pattern. Process registry and ETS table
registry are distinct namespaces — same atom usable for both
without collision.

**When to consult:** Refactoring a singleton GenServer for
testability; need a name-configurability pattern; ETS table
naming when GenServer instances multiply.

### Thoughtbot "How to start processes with dynamic names in Elixir"

**URL:** https://thoughtbot.com/blog/how-to-start-processes-with-dynamic-names-in-elixir

**Covers:** Atom-limit caveat (Erlang VM has hard upper limit on
unique atoms); Registry alternative for non-atom registration
when names derive from user input or unbounded sources.

**When to consult:** Per-test unique atoms are safe at test
scale (~hundreds of tests; VM limit ~1M); but production
patterns deriving names from user input (e.g., tenant ID,
user ID) MUST use `Registry`, not dynamic atom creation.

### Elixir Forum

**URL:** https://elixirforum.com/

**Covers:** Community knowledge register; supervised GenServer
testing threads; DynamicSupervisor patterns; Sandbox cross-
process gap; case studies and worked examples beyond the
official docs.

**When to consult:** When the official docs leave gaps; when
need worked examples for an unusual pattern; cross-cutting
questions where multiple canonical sources don't quite fit.

## 3. Pattern Catalog (canonical Elixir patterns NIOV uses)

| Pattern | Canonical reference | NIOV usage | ADR |
|---------|---------------------|------------|-----|
| KV.Registry name-configurability | Elixir Mix-OTP tutorial | `Storage.ETS.start_link/1` `:name` opt; `Router.start_link/1` `:name` + `:storage_ets` opts; per-test instances via `start_supervised!` | ADR-0034 |
| `start_supervised!` per-test instance | DockYard + Sean Lewis | `CosmpRouter.RouterTestHelpers.start_router!/1` | ADR-0034 |
| `start_owner!`/`stop_owner` Sandbox | Ecto.Adapters.SQL.Sandbox | `CosmpRouter.RouterTestHelpers.start_sandbox_owner!/0` | ADR-0034 |
| Composed-mode `Ecto.Multi` | Ecto docs | Router WRITE/SHARE/REVOKE composed-mode with `Audit.write_audit_event/3` participating in caller's Multi | ADR-0033 §4e |
| Storage facade: ETS-first + Postgres fallthrough | Architectural | `CosmpRouter.Storage` facade: hot-tier ETS read; Postgres source-of-truth on miss + ETS warm | ADR-0033 §5 |
| Idempotency Pattern 4 + Pattern 5 compound | ADR-0026 §5 | `CosmpRouter.Idempotency.check/2` + `record/3` wrapping WRITE/SHARE/REVOKE; Pattern 4 atomic compound + Pattern 5 idempotent verification keys | ADR-0033 §6 |
| Byte-equivalent canonical_record + sha256_hex audit primitive | TS canonical port | `CosmpRouter.Audit.canonical_record/1` + `canonical_json/1` + `sha256_hex/1`; TS↔Elixir SHA-256 chain interchange verified by 10 fixture pairs at every CI run | ADR-0033 §4 |
| Supervisor `:one_for_one` strategy for COSMP coordination | OTP design principles | `CosmpRouter.Application` supervision tree; single worker crash MUST NOT cascade | ADR-0031 |

## 4. When You Hit an Elixir/BEAM Problem — Checklist

1. **Surface substrate-state observation precisely.** What's the
   actual failure mode? Deterministic or non-deterministic?
   Cross-test or single-test? Which processes? Which APIs?
2. **Check the 6 canonical sources for similar patterns.** Spend
   5-15 minutes reading. Note matching patterns + their
   canonical resolutions.
3. **If a pattern surfaces:** surface the canonical solution to
   operator-tier with the source citation. Include the pattern's
   applicability to the observation. Do NOT execute until
   authorized.
4. **If no pattern surfaces:** surface the research negative-
   result to operator-tier. Propose the next investigation step.
   Wait for direction.
5. **Authorize execution.** With operator-tier authorization,
   execute the canonical pattern. Document in commit body
   per ADR-0035 substrate-build discipline canonical.
6. **Never** iterate locally on substrate-state observations
   suggesting architectural coupling without broader community
   pattern check.

## 5. References

- ADR-0034 — BEAM COSMP Testability Refactor Pattern (sub-phase
  6a; canonical Elixir testability pattern + D-WIDER-KNOWLEDGE-
  CHECK observation lineage)
- ADR-0035 — Substrate-Build Discipline Canonical (sub-phase 6c;
  9 substrate-build observations canonical at ADR register;
  D-CASCADE-SCOPE-PRECISION + D-WIDER-KNOWLEDGE-CHECK +
  D-AUDIT-OUTCOME-ENUM + 6 more)
- ADR-0031 — BEAM Routing Substrate Architecture (Router
  GenServer state shape + 7-op `handle_call` dispatch)
- ADR-0033 — BEAM Persistence + Idempotency + Audit-Chain
  Cryptographic Substrate Architecture
- ADR-0026 §5 — 6 BEAM-compatibility patterns
- RULE 11 (CLAUDE.md) — Wider Knowledge Check for Elixir/BEAM
  Substrate (operating-manual substrate-binding)
- `docs/contributing/onboarding-for-engineers.md` §1 + §2 + §6
  — required-reading integration

## 6. Bidirectional Citations

### Cites

- ADR-0034 (canonical Elixir testability pattern; the trigger
  for this doc's creation at sub-phase 6c)
- ADR-0035 (Substrate-Build Discipline Canonical; the canonical
  ADR for the 9 substrate-build observations including
  D-WIDER-KNOWLEDGE-CHECK)
- ADR-0031 / ADR-0033 / ADR-0026 (substrate references for the
  pattern catalog)
- RULE 11 (CLAUDE.md operating-manual substrate-binding)

### Cited from

- RULE 11 (CLAUDE.md) — required reading pointer
- ADR-0035 §References — substrate-build discipline canonical
- `docs/contributing/onboarding-for-engineers.md` §1 (pre-flight
  discipline integration) + §6 (recommended reading)
- Future Elixir/BEAM ADRs (sub-phases 7-13 DBGI substrate)
