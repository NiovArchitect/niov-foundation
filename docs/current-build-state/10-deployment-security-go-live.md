# Section 10 — Deployment / Security / Go-Live Operations

> Detailed canonical record for production Section 10. Master index:
> [`../CURRENT_BUILD_STATE.md`](../CURRENT_BUILD_STATE.md).

## Purpose

The operator-facing surface that turns the Foundation substrate
into a production-running, government-grade-hardened, customer-
ready service: deployment-target portability per ADR-0018 (managed
cloud / sovereign cloud / on-premise / air-gapped), cryptographic
resilience per ADR-0019 (PQC-aware crypto suite), CI / SBOM /
provenance per ADR-0015 + GOVSEC.8, schema-push discipline per
ADR-0025, pre-commit hardening per ADR-0024, deployment runbook
per ADR-0047.

## Current status

**Substrate landed; production-readiness hardening ongoing.**
The Foundation has Track A (containerized Postgres) closed,
ADR-0011 / 0013 / 0015 / 0016 / 0017 / 0018 / 0019 / 0024 / 0025
/ 0047 substrate landed. GOVSEC umbrella (ADR-0049) is in flight
with GOVSEC.5 break-glass substrate (ADR-0050) Accepted.

## What is live

- Track A containerized Postgres for unit + integration tests
  per ADR-0011 / 0013 (`pgvector/pgvector:0.8.2-pg16-trixie`
  pin per ADR-0043 §Sub-decision 1 Q-G3-α LOCK).
- CI workflow architecture per ADR-0015 (8 locked decisions A–H;
  4 CI jobs: Typecheck + Unit + Integration + Elixir).
- TypeScript strict-mode baseline at exactly 4 canonical
  residual errors per ADR-0015 Decision B Amendment 1.
- CI no-leak guard per PR #16 (372-line vitest filesystem
  scanner asserting zero forbidden tokens in runtime
  response/audit-safe surfaces).
- Pre-commit chain per ADR-0024: db-push guard (ADR-0025) →
  typecheck baseline → RULE 16 no-console anchor → no-leak
  guard.
- Schema-push discipline per ADR-0025 (`db:push:test` only;
  `--no-verify` override preserved; production-schema-push
  guard).
- Deployment-target agnosticism posture per ADR-0018
  (substrate is Postgres-compatible; current operator
  deployment Supabase-hosted).
- Cryptographic suite posture per ADR-0019 (HS256 / SHA-256 /
  AES-256-GCM / bcrypt; PQC-aware re-evaluation triggers
  canonical).
- Post-Gap-3 production-readiness hardening per ADR-0047
  (`vitest.config.ts` fail-closed + `scripts/local-test-db-refresh.sh`
  + `scripts/verify-production-parity.ts` + `docs/operations/deployment-runbook.md`).
- GOVSEC.5 break-glass / time-boxed audit substrate per
  ADR-0050 (`BREAK_GLASS_INVOKED` / `_USED` / `_EXPIRED` /
  `_REVIEWED` audit literals; `BreakGlassGrant` table-ready
  pattern landed).

## What is not live

- Multi-region deployment hardening.
- Sovereign cloud deployment worked example (AWS GovCloud
  forward-substrate per ADR-0018).
- On-premise / air-gapped deployment runbook.
- FIPS-mode deployment (FIPS 203 / 204 / 205 PQC primitives
  forward-substrate per ADR-0019 re-evaluation triggers).
- SLSA L3 supply-chain hardening forward-substrate per
  GOVSEC.8 (currently SLSA L2-ish).
- GOVSEC.2 audit/evidence + GOVSEC.3 auth/session + GOVSEC.4
  gateway/bot-swarm + GOVSEC.6 AI/agent abuse + GOVSEC.7
  tenant isolation + GOVSEC.9 crypto agility + GOVSEC.10
  incident response (all GOVSEC umbrella sub-phases beyond
  GOVSEC.5).

## RULE 13 disclosures specific to Section 10

- The Foundation is deployment-target-agnostic per ADR-0018,
  not Supabase-bound. Operator current deployment is Supabase
  but the substrate runs on any Postgres-compatible target.
- Cryptographic suite is currently symmetric-only stack (HS256,
  SHA-256, AES-256-GCM, bcrypt) — post-quantum ready by
  primitive selection. Public-key ops require ADR-0019 §6
  re-evaluation when added.
- ALL governance-grade hardening (GOVSEC) gaps are tracked at
  the `docs/reference/govsec-control-matrix.md` register; do
  not under-claim or over-claim FedRAMP / SOC 2 / FIPS
  compliance status.

## Next slices (priority order)

1. GOVSEC.5 follow-on: broader admin-tier route throttle on
   `requireAdminCapability` (carry from ADR-0050 acceptance
   notes).
2. GOVSEC.2 audit / evidence sub-phase (per ADR-0049 §10-phase
   decomposition).
3. GOVSEC.3 auth / session per NIST 800-63-4 AAL2 / AAL3.

## Risks / forward-substrate

- ALL GOVSEC sub-phases require their own Founder-authorized
  QLOCK; do not start without explicit authorization.
- The deployment runbook at
  `docs/operations/deployment-runbook.md` is the canonical
  go-live reference; keep it in sync with substrate changes.

---

Back to master: [`../CURRENT_BUILD_STATE.md`](../CURRENT_BUILD_STATE.md)
