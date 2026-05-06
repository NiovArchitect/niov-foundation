# niov-foundation

Protocol layer of the NIOV Labs platform — the cryptographic
governance layer that keeps humans permanently in control of
what AI can know. Implements the **COSMP** (Contextual
Orchestration and Scoped Memory Protocol, US 12,517,919)
and the **DMW** (Decentralized Memory Wallet) substrate
referenced in patents US 12,164,537 and US 12,399,904.

## What This Is

AI is projected to surpass human intelligence as early as
2026. Without a governance layer, AI consolidates all human
knowledge without consent, audit, or compensation. NIOV's
position is that this is not acceptable, and that the
solution must be cryptographic — not policy.

The Foundation enforces human sovereignty over data through
five protocol primitives: **Memory Capsules** (the unit of
intelligence ownership), **Decentralized Memory Wallets**
(per-entity storage with cryptographic access control), the
**COSMP Protocol** (the seven-operation surface mediating
every capsule access), the **Contextual Orchestration Engine
(COE)** (which assembles relevant capsules at the right
time), and an **append-only audit chain** (every access
attributed and verifiable). Decentralized in DMW means
sovereignty, not infrastructure — there is no blockchain,
no distributed ledger, no token. The protocol enforces
sovereignty in code, on standard centralized cloud services.

This repo is the Foundation backend: Node.js + TypeScript +
Fastify (API), Supabase PostgreSQL with Prisma ORM
(database), Upstash Redis (cache), Supabase Storage
(storage), Vitest (tests). It is **not** the Otzar product
(the conversational intelligence application that runs on
top of the Foundation), the Glonari deployment, or the
[otzar-control-tower](../otzar-control-tower) frontend
(Vite + React, separate repo).

## Repository Structure

```
apps/api/              Fastify backend
packages/auth/         Crypto helpers
packages/database/     Prisma schema and queries
tests/                 Vitest unit and integration tests
docs/                  ADRs, glossary, contributing guides
CLAUDE.md              Operational rules for Claude Code
AGENTS.md              Multi-LLM router
```

## Getting Started

1. Clone the repo.
2. Run `npm install` at the repo root. The workspace covers
   `apps/*` and `packages/*`.
3. Configure environment variables in a `.env` file at the
   repo root. **There is no `.env.example` template today** —
   the required variables (`DATABASE_URL` for Supabase,
   Upstash Redis credentials, JWT signing secret, LLM
   provider keys) must be obtained from the maintainer.
4. Run `npm test` to execute the full Vitest suite. **The
   suite takes 90-110 minutes** because it makes real
   Supabase calls; this is intentional. See ADR-0010 and
   `docs/contributing/testing.md`.
5. Read `CLAUDE.md` and `docs/contributing/README.md` for
   operational context before making changes.

## Documentation Map

In priority order for a new contributor:

- **`CLAUDE.md`** — operational rules (16 RULES governing
  every contribution)
- **`AGENTS.md`** — multi-LLM router for selecting the
  right agent (Claude Code, Codex, Cursor, ChatGPT)
- **`docs/contributing/`** — code style, testing,
  parallel sessions, per-agent bootstrap files
- **`docs/architecture/`** — Architecture Decision Records
  (ADR-0001 through ADR-0010 as of Section 12C.0)
- **`docs/reference/`** — glossary, architectural anchors
  catalog, Section 12 build-cycle progress tracker

## Patents and Intellectual Property

The architecture implemented in this repository is covered
by:

- US 12,164,537
- US 12,399,904
- US 12,517,919

The implementation is the canonical reference; the patents
are filed to protect the architecture as it runs. Patent
US 12,517,919 specifically locks the COSMP seven-operation
enumeration (see ADR-0009).

## License

**No `LICENSE` file is published in this repository today.**
License terms have not been formalized. Contact the
maintainer for usage rights before redistributing or
deriving from this code. This section will be amended when
the license is published.

## Contributing

See `docs/contributing/README.md` for the contributing
guide and recommended reading order. Key prerequisites:
read `CLAUDE.md` first, then `docs/contributing/code-style.md`,
then the testing and parallel-sessions guides before opening
any work.

## Maintainer

NIOV Labs Corporation. Founder / CEO: Sadeil Lewis.
