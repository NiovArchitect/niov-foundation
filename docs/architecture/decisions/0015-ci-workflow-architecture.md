# ADR-0015: CI Workflow Architecture

Status: Active
Date: 2026-05-07
Trigger: Track A Gate 7

## Context

Track A Gates 1-6 produced a three-tier verification system
with empirically-verified deterministic behavior (per
ADR-0011 amendment). The reproducibility evidence supporting
that claim came from manual verification cycles (G5.5, G5.7,
Gate 6); manual cycles don't scale and don't catch drift
between operator sessions.

Foundation depends on Anthropic's API for production
inference. Behavior drift in that dependency could break
Foundation silently and not surface until customer reports.
Enterprise/government compliance posture (SOC 2, FedRAMP,
ISO 27001) requires evidence of automated continuous
verification, not just episodic manual checks.

Gate 6's amendment explicitly forward-pointed to Gate 7 for
empirical refinement of variance bounds at scale: a single
operator running n=3-4 cycles cannot statistically resolve
the cold-start variance observation (Drift G6-A); larger n
accumulated by automated CI can.

Foundation is a single-founder + AI-tools build; CI
infrastructure must produce maximum diagnostic value with
minimum operator overhead. Substrate modification remains a
deliberate human decision (with AI assistance), but
automated CI provides the trigger — fast surfacing of
regressions, full diagnostic context preloaded for human
investigation.

Gate 7-pre (e8a559e) preceded this gate to resolve a
package-lock-vs-package.json drift that would have failed
`npm ci` on Gate 7's first workflow run. Gate 7-pre also
surfaced a second operational requirement (Drift G7-PRE-B):
`npm run db:generate` must follow `npm ci` because `npm ci`
wipes `node_modules/.prisma/client`. This requirement is
folded into both workflow YAMLs.

## Decision

Two GitHub Actions workflows:

- `.github/workflows/ci.yml`: PR-blocking checks (typecheck +
  unit tier + integration tier) on every pull request and
  every push to main. Three parallel jobs.
- `.github/workflows/nightly-real-llm.yml`: scheduled real-LLM
  tier (09:00 UTC nightly per Decision A) plus on-demand
  workflow_dispatch. Single job. Includes failure-issue
  automation that creates a GitHub issue with a pre-populated
  investigation checklist on every failure.

Diagnostic-richness pattern: every failure mode (typecheck,
unit, integration, real-LLM) captures full context as a
workflow artifact. Investigation starts with full preloaded
context; AI-assisted investigation (Claude, Codex) is
maximally effective when context is preloaded.

Substrate modification remains a human decision: CI reports,
humans investigate (with AI assistance), humans commit fixes.
No auto-fix agents in Gate 7; agents may propose fixes via
PR in future Gate 9+ work, but the human-in-the-loop
constraint holds for now.

Branch protection on main is configured via the GitHub UI
post-merge (manual GitHub-side action; not embeddable in
workflow YAML). Required status checks: typecheck +
unit-tests + integration-tests.

### Locked architectural decisions

**Decision A**: Real-LLM nightly schedule = 09:00 UTC daily
(`0 9 * * *` cron). Rationale: results visible at start of
operator's Pacific-morning workday; operator can investigate
fresh failures without competing with end-of-day fatigue.

**Decision B**: TypeScript baseline enforcement = strict
12-error threshold. CI fails if `tsc --noEmit` produces more
than 12 errors. Rationale: 12 errors is the documented
baseline preserved across Track A Gates 4-6; any new error
is a regression. Future systematic reductions update the
threshold by deliberate decision (a future ADR amendment),
not auto-tracking.

**Decision C**: PR check coverage = unit + integration +
typecheck only on PRs and pushes to main. Real-LLM tier is
nightly + manual workflow_dispatch only. Rationale: per-PR
real-LLM cost would scale with PR volume without proportional
benefit; nightly cadence is sufficient for catching
third-party drift; workflow_dispatch covers the rare PR that
specifically needs real-LLM validation.

**Decision D**: Workflow file split = `ci.yml` (PR-blocking) +
`nightly-real-llm.yml` (scheduled). Rationale: PR-blocking
checks and nightly checks have different cadences, different
cost profiles, and different failure modes. Separating them
produces cleaner operational visibility (one workflow's run
history per concern) and per-workflow secret/permission
scoping.

**Decision E**: Postgres service version = `postgres:16.4-alpine`
(pinned).

Track A Gate 7's primer drafted Decision E as
`postgres:16-alpine` based on a recollection of ADR-0013's
local runtime. Pre-flight verification surfaced Drift G7-A:
`docker-compose.test.yml` actually pins `postgres:16.4-alpine`.
The pinned version is the correct choice for three reasons:
(1) true parity with the empirically-verified local runtime
that produced ADR-0011's reproducibility evidence;
(2) deterministic — no within-major-version drift between
CI runs; (3) consistency with the rejection of
`postgres:latest` in Alternatives Considered (the same
non-determinism reasoning applies to moving tags at any
cadence). The corrected pin is what's used in the workflow
files.

### Decision E amendment at G3.2 (2026-05-17)

G3.2 `[CAPSULE-EMBEDDING-INFRA]` updates the CI service-container
Postgres image from `postgres:16.4-alpine` to
`pgvector/pgvector:0.8.2-pg16-trixie` across all 3 CI tiers in
`ci.yml` (Unit / Integration / Elixir) + the nightly-real-llm
tier — per ADR-0043 §Sub-decision 1 (Q-G3-α LOCK) + Q-G3.2-α LOCK
at `[CAPSULE-EMBEDDING-INFRA-G3.2-QLOCK]`.

Cross-workflow parity: all 4 CI tiers + the nightly tier preserve
Postgres service parity (port-map 5433:5432 + health-check
`pg_isready` + env-block + DATABASE_URL / DIRECT_URL unchanged).
Typecheck, Unit, Integration, and Elixir tiers remain authoritative
post-G3.2 — the image switch is drop-in compatible (pgvector binary
is preinstalled in the image but `vector` extension remains inert
until `CREATE EXTENSION vector` runs at G3.3 per ADR-0043 §Sub-decision
2 Q-G3-β LOCK).

CI label staleness (Unit tier `(371 tests)` / Integration tier
`(111 tests + 1 skipped)`) is NOT refreshed in G3.2 per Q-G3.2-ζ
KEEP DEFERRED — preserved forward-substrate from G1.6.

Decision E body above is preserved verbatim; this H3 amendment
captures the G3.2 substrate transition at canonical-prose register
substantively per ADR-0011 §Amendment convention.

**Decision F**: Concurrency control for nightly = allow
concurrent runs (no `concurrency:` block). Rationale:
real-LLM tests are stateless (each test uses
`cleanupTestData()` in beforeAll/afterAll); concurrent runs
don't corrupt each other. Cost is bounded (each run is
~$0.013). Manual workflow_dispatch during a scheduled run
should not be blocked.

**Decision G**: npm caching = enabled via
`actions/setup-node@v6`'s `cache: 'npm'` option. Rationale:
npm dependency resolution + download dominates CI runtime
when uncached; caching saves ~30-60s per job. Cache key
defaults to `package-lock.json` hash, so cache invalidates
correctly when dependencies change.

**Decision H**: Node version = `.nvmrc` containing `22.11.0`
(Node 22 LTS), referenced by both workflows via
`actions/setup-node@v6`'s `node-version-file: '.nvmrc'`
parameter.

Track A Gate 7's primer drafted both workflow YAMLs with
`node-version: '22'` (LTS major; moving tag). Pre-flight
verification surfaced Drift G7-C: operator's local Node was
v24.13.1 (current release line), not 22 (LTS), and neither
`.nvmrc` nor `.node-version` existed in the repo. The drift
was the same class as Drift G7-A's Postgres-pinning issue,
but more substantial — a major-version mismatch (24 vs 22),
not just within-major moving.

Decision 11 considered three resolution paths:
- Path A: pin in YAML directly (e.g., `node-version: '24.13.1'`)
- Path C: pin to operator's local Node 24.13.1 via `.nvmrc`
  (true parity with local)
- Path 2: migrate operator's local Node to 22.11.0 LTS and
  pin via `.nvmrc` (LTS posture)

The operator chose **Path 2** for compliance posture
reasoning that goes beyond mere parity:

- Enterprise/government compliance reviewers (SOC 2,
  FedRAMP, ISO 27001) prefer or require runtime versions
  with documented LTS guarantees. Production runtimes on
  current/non-LTS lines invite due-diligence pushback.
- Node 22 LTS provides security support through April 2027.
  Node 24 LTS doesn't begin until October 2026. Foundation
  is positioned for SOC 2 / FedRAMP / ISO 27001 review
  during the 2026 window where Node 22 is the only LTS
  option that covers it.
- The operator migrated local Node from v24.13.1 to
  v22.11.0 (via nvm) as part of Decision 11's resolution.
  The corrected `.nvmrc` content is `22.11.0` (no v prefix
  per nvm convention; `actions/setup-node@v6` handles both
  with and without prefix).
- Single source of truth for both local development (where
  `nvm use` automatically picks up the version) and CI
  (where `actions/setup-node@v6` reads it). Future Node
  version updates touch one file; both local and CI
  auto-track.
- The `@types/node: ^22.10.0` constraint in `package.json`
  aligns with this Node 22 LTS pin. Type-time and runtime
  versions converge.
- Future migration to Node 24 LTS is planned for Q1-Q2 2027
  when Node 22 enters maintenance (April 2027); the
  migration is a deliberate one-line `.nvmrc` edit + ADR
  amendment at that time, not an ad-hoc shell-history
  change.

The deliberate divergence from Path C (parity-with-local)
is itself substrate-honest architectural evidence: Decision
E's parity reasoning applies to Postgres image pinning where
local-and-CI parity is the dominant concern; Decision H's
LTS reasoning applies to Node version where compliance
posture is the dominant concern. The framework can hold
both: pin both runtimes, but optimize different
dominant-concern axes per runtime.

### Verification notes (Drift G7-B)

Drift G7-B (informational, no decision required):
`vitest.real-llm.config.ts` loads `.env.test` first (no
override) then `.env.test.local` with `override: true`. In
CI, `.env.test.local` doesn't exist; without explicit step
env, the stub `ANTHROPIC_API_KEY=test-stub-not-real` from
`.env.test` would win and trip the stub guard at
`vitest.real-llm.config.ts:75-88`. Resolution baked into the
nightly workflow: step-level
`env: ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}`
sets the secret BEFORE vitest runs; dotenv's no-override
default preserves the secret value through the entire load
chain; stub guard passes; tests run with real key.

### Operational requirement note (Drift G7-PRE-B)

Drift G7-PRE-B (Gate 7-pre): `npm ci` wipes `node_modules`
including `node_modules/.prisma/client`. Without
`npm run db:generate` between `npm ci` and the test step,
Foundation's tests fail at module load with
"@prisma/client did not initialize yet" and the TS error
count regresses from 12 to 254. Both workflow files include
the explicit `npm run db:generate` step after `npm ci` to
satisfy this requirement. Future workflow modifications
adding new jobs must preserve this pattern.

## Consequences

### Easier

- Anthropic model behavior drift surfaces within 24 hours
  (vs. customer report timeframes); critical for substrate
  that depends on third-party AI inference.
- Every PR validated against the empirically-verified
  three-tier behavior; regression prevention automated.
- ADR-0011's variance bounds get statistically refined as
  CI accumulates n=hundreds over weeks/months. Gate 6's
  amendment becomes empirically-grounded over time; Drift
  G6-A's cold-start observation gets statistical resolution.
- Compliance posture for SOC 2 / FedRAMP / ISO 27001
  strengthened with automated test evidence; reviewers see
  concrete artifacts not just claims. Decision H's Node 22
  LTS pin reinforces this — runtime version carries
  documented security support window aligning with audit
  cycles.
- Investor due diligence questions about CI/CD answered
  with deployable infrastructure, not slideware.
- Diagnostic-richness pattern means human investigation
  starts with full context; AI-assisted investigation
  (Claude, Codex) is maximally effective when context is
  preloaded.
- Failure-issue automation creates a queryable history of
  drift events over time; useful for both operator review
  and future Foundation scaling.
- Patent-holder implementation record gains evidence that
  every commit was deliberately ratified by automated
  verification, not just human inspection.
- Single source of truth for Node version (`.nvmrc`) means
  local-CI parity is enforced by tooling, not by operator
  vigilance.

### Harder

- Workflow YAML becomes substrate that itself requires
  maintenance. Any future change to test scripts, Postgres
  version, Node version, or test infrastructure requires
  parallel updates to workflow YAML; if updates drift, CI
  passes locally but fails remotely (or vice versa). The
  workflows are committed substrate now and must be kept
  current with `package.json` scripts, vitest configs,
  ADR-0013's docker-compose, and ADR-0014's fixture
  infrastructure as those evolve.
- `npm run db:generate` is now a load-bearing step in every
  Node-touching CI job. Drift G7-PRE-B documents this
  requirement, but new contributors adding workflow jobs
  must remember it. If a future job omits the step, tests
  fail in a confusing way (module-load errors that look
  like dependency issues but are actually missing client
  generation). The maintenance burden is small but present.
- `ANTHROPIC_API_KEY` now exists as a GitHub repo secret.
  This is a new credential surface that must be rotated if
  compromised; access to GitHub repo settings gains
  operational sensitivity it didn't have before. Future
  operator changes (additional NIOV team members, contractor
  access, etc.) must consider secret-access scoping.
- Nightly real-LLM workflow incurs ~$0.013 × 365 = ~$4.75 in
  annual Anthropic charges. Small but non-zero ongoing
  operational cost. Future increases in real-LLM tier size
  scale this cost linearly; doubling the tier (+2 tests)
  doubles annual cost.
- Failure-issue automation creates noise in the GitHub issue
  tracker for transient failures (network blips, Anthropic
  rate limit hits, GitHub Actions infrastructure flakes).
  Operator must triage these or refine the workflow to
  handle transients gracefully (retry-on-network-error,
  skip-on-anthropic-rate-limit, etc.). Triage discipline
  required.
- Branch protection on main means commits to main now
  require either passing CI or admin override. The smooth
  push-to-main pattern that produced Track A's 9-commit
  build cycle is superseded by the PR-merge pattern. This
  slows future iteration but is the correct posture for
  production substrate; Track A's ad-hoc gate cadence does
  not survive Gate 8.
- CI runtime adds 2-5 minutes to every PR (Postgres spin-up
  + tests). Not insignificant for fast iteration. Mitigated
  by parallel job execution but remains a real cost.
- ADR-0011's variance bounds may need re-amendment as CI
  data accumulates. The 4.1% (formal) and 7.6% (extended)
  bounds today are based on n=3-4 from a single operator
  machine. GitHub Actions runners have different performance
  characteristics (different CPU model, different I/O
  profile, different network) and may produce different
  variance distributions. The amendment cycle continues; CI
  data refining the bounds is itself a load-bearing
  empirical evidence stream.
- Failure-issue label dependency: the `ci-failure`,
  `real-llm`, `nightly` labels must exist in the repo
  beforehand. The first nightly failure WITHOUT these
  labels pre-created will partially fail (issue created but
  label assignment errors). Manual GitHub-side step required
  (see manual actions list at gate close).
- Decision H's Node 22 LTS pin commits Foundation to a
  specific LTS schedule. When Node 22 enters maintenance
  (April 2027), Foundation must migrate to Node 24 LTS
  (or later) within that LTS window. Migration is a
  one-line `.nvmrc` edit plus an ADR amendment, but it's
  scheduled work that the team must remember to do; missing
  the LTS transition window leaves Foundation on an
  unsupported runtime.

## Alternatives Considered

- **Single workflow file (Decision D alternative)**: rejected
  because PR-blocking checks and nightly checks have
  different cadences, different cost profiles, and different
  failure modes. Separating them produces cleaner
  operational visibility (each workflow's run history is
  scoped to one concern) and per-workflow secret/permission
  scoping.

- **Real-LLM on every PR (Decision C alternative)**: rejected
  because nightly cadence is sufficient for catching
  third-party drift. Per-PR cost would scale with PR volume
  without proportional benefit. Manual workflow_dispatch
  covers the rare PR that specifically needs real-LLM
  validation (e.g., a PR that touches the LLM provider
  abstraction).

- **Strict baseline drift detection vs. fixed threshold
  (Decision B alternative)**: rejected for now because the
  12-error baseline is documented and stable. If/when errors
  are systematically reduced, the threshold gets updated by
  deliberate decision (a future ADR amendment) rather than
  auto-tracked. Auto-tracked thresholds let regressions slip
  in if the auto-track granularity is coarse.

- **Auto-fix agent for failures**: rejected because substrate
  modification by anything other than deliberate human
  decision creates dependency capture risk, confused deputy
  risk, and patent-holder implementation record contamination.
  Agents may propose fixes via PR in future Gate 9+ work, but
  Gate 7 keeps humans in the loop. The diagnostic-richness
  pattern is the right balance: AI-assisted investigation is
  empowered, AI-driven commit decisions are not.

- **Postgres :latest tag (Decision E alternative)**: rejected
  because non-deterministic image updates introduce
  uncontrolled CI variance. `postgres:16-alpine` (the
  primer's original choice before Drift G7-A) was the
  intermediate version of this rejection — a moving tag with
  smaller cadence. Drift G7-A's resolution applies the
  rejection consistently: pinned `postgres:16.4-alpine`
  matches local runtime exactly.

- **Concurrency block for nightly (Decision F alternative)**:
  rejected because real-LLM tests are stateless and cost is
  bounded per run. Blocking concurrent runs would prevent
  workflow_dispatch from running during a scheduled run,
  which is operator-hostile behavior for no benefit.

- **Self-hosted runners (instead of ubuntu-latest)**: rejected
  for now. Self-hosted runners give cost control + machine
  parity with operator's local environment, but introduce
  infrastructure-management overhead (machine setup,
  security patching, runner availability) that doesn't
  justify itself for current Foundation scale.
  GitHub-hosted ubuntu-latest is sufficient; self-hosted
  becomes a Gate 9+ consideration if CI cost scales beyond
  budget.

- **Pin Node to v24.13.1 parity-with-local (Decision H
  Path C alternative)**: rejected because while parity with
  the operator's then-current local Node 24.13.1 would have
  honored Decision E's parity reasoning, Foundation's
  compliance posture (SOC 2 / FedRAMP / ISO 27001) requires
  runtime versions with documented LTS guarantees. Node 24's
  LTS line doesn't begin until October 2026; running on the
  current/non-LTS line during the 2026 audit window invites
  due-diligence pushback. The operator instead migrated
  local Node to v22.11.0 LTS (Decision 11 Path 2) and pinned
  CI to match. Parity is preserved (local-and-CI both on
  22.11.0); LTS posture is the dominant concern axis.

## References

- ADR-0011 (three-tier test stratification + Gate 6
  reproducibility amendment) — this workflow enforces the
  empirical claim ADR-0011 makes; CI accumulation refines
  the amendment's variance bounds at scale.
- ADR-0013 (containerized Postgres for unit + integration
  tiers) — this workflow uses `postgres:16.4-alpine` for
  parity with `docker-compose.test.yml` per Drift G7-A
  resolution.
- ADR-0014 (FixtureBasedLLMProvider key-based dispatch) —
  fixtures are consumed by the integration-tests job; the
  real-llm-tests job bypasses fixtures and exercises the
  real Anthropic provider.
- `d728cd4` (Track A architectural lock) — established the
  gate sequence that culminates in Gate 7.
- `cae8cf4` (Track A Gate 6) — produced ADR-0011's
  reproducibility amendment; Gate 7 transitions
  reproducibility verification from manual to automated.
- `e8a559e` (Track A Gate 7-pre lock-file sync) — preceded
  this gate to ensure CI's `npm ci` has a valid lock file;
  documented Drifts G7-PRE-A (Codex Node sourcing pattern),
  G7-PRE-B (Prisma client regeneration step in workflows),
  and G7-PRE-C (admin-routes intermittent flake, queued for
  Gate 8 characterization).

Bidirectional citations (cited from):

- Track A Gate 8 will add ADR-0015 back-references to
  relevant developer documentation
  (`docs/contributing/testing.md`, `CLAUDE.md`).
- Future GitHub Actions workflow modifications, when they
  reflect deliberate architectural changes, should
  back-reference this ADR.
- **ADR-0016** (Pin-and-Optimize Framework) — Decisions E
  (postgres:16.4-alpine; parity-with-local axis) and H
  (Node 22.11.0; LTS-compliance axis) introduced the
  dominant-concern-per-axis pattern that ADR-0016 elevates
  to canonical framework. Decisions E + H are the
  pattern's first concrete instances; ADR-0016's Worked
  Examples cite them as canonical references.
- **ADR-0017** (Production Discipline) — diagnostic-
  richness pattern + substrate-modification-remains-
  human-decision principle codified in this ADR map to
  Principle 6 of Production Discipline. ADR-0017 elevates
  the principle from CI-workflow-specific to canonical
  operational rule across all substrate modification work.
