# apps/ — Foundation Application Workspace

Hybrid workspace housing both **TypeScript** and **Elixir** applications
that together implement the Foundation per ADR-0030 (Phase 2 Elixir/BEAM
Implementation). The `apps/` directory is the Foundation's canonical
multi-language application root.

## Current Applications

- **`apps/api/`** — Fastify + TypeScript HTTP API. Existing canonical
  Foundation API; pre-Phase-2 substrate. **NOT a mix application** —
  has no `mix.exs`; invisible to Elixir mix tooling (see Mix Tooling
  Boundary below).
- **`apps/cosmp_router/`** — Elixir/BEAM COSMP coordination layer.
  Phase 2 substrate; lands at Block B sub-phase 3
  `[BEAM-COSMP-APP-SKELETON]`.
- **`apps/dbgi_supervisor/`** — Elixir/BEAM DBGI supervisor +
  process-group registry. Phase 2 substrate; lands at Block B sub-phase
  7 `[BEAM-DBGI-APP-SKELETON]`.

## Why TypeScript + Elixir Coexist Here

Per ADR-0030 §Implementation Detail (mix umbrella workspace structure),
Foundation canonicalizes a **three-language stack**:

- **TypeScript** (Fastify API) — request lifecycle, schema, audit-chain;
  the existing pre-Phase-2 substrate at `apps/api/`.
- **Elixir** (COSMP coordination + DBGI supervision) — message routing,
  distributed supervision, idempotency primitives; the Phase 2
  substrate at `apps/cosmp_router/` + `apps/dbgi_supervisor/`.
- **Postgres** — shared storage (schema authority preserved at
  TypeScript Prisma per ADR-0025; Elixir Ecto repos read-only against
  the TypeScript-managed schema initially).

Python ML pipelines arrive in a future arc (Phase 3 / Version 3) as a
fourth runtime; the `apps/` directory is the natural home for that
future app too.

## Mix Tooling Boundary (Q-COEXISTENCE Option X)

The umbrella `mix.exs` at the repo root explicitly enumerates Elixir
apps via `apps_paths/0` (currently `%{}` at sub-phase 2; populated by
sub-phases 3 + 7). **Non-Elixir directories under `apps/` — namely
`apps/api/` — are invisible to mix tooling.** Mix will not attempt to
treat `apps/api/` as a mix application; mix-tier commands
(`mix compile`, `mix test`, `mix format`) only operate on the Elixir
apps explicitly listed in `apps_paths/0`.

This is the **Q-COEXISTENCE Option X discipline** from Block B
sub-phase 2 `[BEAM-MIX-WORKSPACE]` pre-flight: preserve the canonical
`apps/` layout ADR-0030 names while avoiding mix tooling errors against
the TypeScript substrate.

## Versions

Elixir + Erlang/OTP versions are pinned at `/.tool-versions` per
ADR-0016 Pin-and-Optimize Framework. The `.tool-versions` file is the
**single source of truth** for the pin decision; ADR-0030 stays
version-agnostic and references `.tool-versions` for the canonical
values.

## References

- ADR-0030 (Phase 2 Elixir/BEAM Implementation) §Implementation Detail
- ADR-0028 (Forward-Substrate: Elixir/BEAM Coordination Layer)
- ADR-0016 (Pin-and-Optimize Framework) — the version-pinning authority
- ADR-0025 (Schema-Push-Target Discipline) — Postgres schema authority
  preserved at TypeScript Prisma during Phase 2
- The 19-sub-phase Block B mini-arc — substrate-build commits from
  sub-phase 2 `[BEAM-MIX-WORKSPACE]` through sub-phase 13
  `[BEAM-ARC-CLOSURE]` (expanded 13 → 14 at sub-phase 4a per Q-G
  split — see ADR-0031; 14 → 15 at sub-phase 5a per Q-P split — see
  ADR-0032; 15 → 16 at sub-phase 5b-i per Q-R split — see ADR-0033;
  16 → 17 at sub-phase 5b-iii per Q-NEW-SPLIT split — see ADR-0033
  §Forward path; 17 → 18 at sub-phase 6a per Q-NEW-SPLIT-2 split —
  see ADR-0034; 18 → 19 at sub-phase 6c per Q-NEW-SPLIT-3 split —
  see ADR-0035). Cumulative-lineage cascade closure for this missed
  site at sub-phase 7 commit per D-SUBSTRATE-LANDING-PREEMPT
  canonical + D-CASCADE-SCOPE-PRECISION substrate-build observation
  recursively applied at substrate-state ground truth register.
