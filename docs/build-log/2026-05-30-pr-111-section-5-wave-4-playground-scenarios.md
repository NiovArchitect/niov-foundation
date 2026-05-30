# PR #111 — Section 5 Wave 4 — Agent Playground persistent named scenarios

**Date:** 2026-05-30
**Merge commit:** `a2988ee`
**Branch:** `section-5-wave-4-playground-scenarios`
**ADR:** [ADR-0065 §7 Wave 4](../architecture/decisions/0065-agent-playground-long-term-product-vision.md)
**Section file:** [`05-agent-playground.md`](../current-build-state/05-agent-playground.md)
**Authorization:** Founder Wave 4 authorization 2026-05-30.

## Important framing (READ FIRST)

Wave 4 is the **SAFE persistence layer** for the future
Agent Playground scenario-simulation substrate. It is **NOT**
the candidate generator, NOT the outcome comparator, NOT the
best-path recommender, NOT the multi-agent orchestration
engine, NOT the governed-transition surface to the Action
runtime — all of those are forward-substrate per ADR-0065 §7
Waves 5-10 with separate Founder authorization at each slice.

Wave 4 implements **NO** execution, **NO** LLM generation,
**NO** multi-agent orchestration, **NO** external provider
calls, **NO** Action creation, **NO** ActionAttempt creation,
**NO** connector invocation, **NO** MemoryCapsule creation,
**NO** OtzarConversation creation, **NO** live side effects.

## Why this entry exists

Wave 4 is the first **schema-bearing** Section 5 substrate
landing (the Wave 2 inspectors did zero schema migration).
Tier-4 build-log entry per `NEXT_ACTION.md` discipline:
"For a **major** architectural landing (new substrate
cluster, security/governance landing, **schema change**,
cross-section integration, complex runtime behavior, RULE 21
paste), also write a tier-4 build-log entry."

Wave 4 qualifies under the schema-change category — NEW
`PlaygroundScenario` Prisma model + 2 indexes pushed via
`npm run db:push:test` per ADR-0025.

## What landed

### Schema (`packages/database/prisma/schema.prisma`)

NEW `PlaygroundScenario` model:

```
model PlaygroundScenario {
  scenario_id          String    @id @default(uuid()) @db.Uuid
  owner_entity_id      String    @db.Uuid
  org_entity_id        String?   @db.Uuid
  title                String
  description          String?
  goal_summary         String?
  status               String    @default("DRAFT")
  scenario_type        String    @default("MANUAL")
  input_refs           Json      @default("{}")
  constraints          Json      @default("{}")
  expected_outputs     Json      @default("{}")
  governance_findings  Json      @default("{}")
  created_at           DateTime  @default(now())
  updated_at           DateTime  @updatedAt
  archived_at          DateTime?

  @@index([org_entity_id, owner_entity_id, status])
  @@index([owner_entity_id, archived_at, created_at])
  @@map("playground_scenarios")
}
```

`status` ∈ `DRAFT | READY | ARCHIVED` (closed-vocab via
service-tier validation, not Prisma enum). `scenario_type`
∈ `MANUAL | FIXTURE | FUTURE_GENERATED` (closed-vocab;
`FUTURE_GENERATED` reserved for Wave 5 candidate generation).
String columns chosen over Prisma enum per ADR-0065 §7
Wave 4 + Hive / MemoryCapsule String + service-validation
precedent — closed-vocab evolution requires no schema
migration.

`packages/database/src/index.ts` extended to re-export the
generated `PlaygroundScenario` type.

### Service (NEW `apps/api/src/services/playground/playground-scenario.service.ts`)

`PlaygroundScenarioService` class with 5 owner-first
methods:

- `createScenario(token, body, ctx)` — bearer + "read";
  caller's session.entity_id binds `owner_entity_id`;
  `getOrgEntityId()` resolves `org_entity_id` (NOT_IN_ANY_ORG
  tolerated as null); 4 Json columns validated as object-only
  (arrays / strings / numbers / booleans / null rejected with
  INVALID_REQUEST); status / scenario_type defaulted to
  DRAFT / MANUAL when absent.
- `listScenarios(token, opts)` — owner-first
  (`where.owner_entity_id = session.entity_id`); default
  excludes ARCHIVED (`archived_at IS NULL`); `?status` filter
  overrides default; `?include_archived=true` opt-in; `?limit`
  default 50 / cap 100; ordered by `created_at DESC`.
- `getScenario(token, id)` — owner-first lookup; cross-owner
  + unknown id fold to `SCENARIO_NOT_FOUND` (enumeration-safe);
  when stored `org_entity_id` non-null, also enforces caller's
  current org equals stored org.
- `updateScenario(token, id, body, ctx)` — owner-first; 6
  forbidden fields (`owner_entity_id` / `org_entity_id` /
  `scenario_id` / `created_at` / `updated_at` / `archived_at`)
  → 422 INVALID_REQUEST with `invalid_fields`; status / vocab
  validation; Json metadata pass-through; status flip to
  ARCHIVED via PUT is allowed but does NOT set `archived_at`
  (that's reserved for the explicit DELETE route per Founder
  spec).
- `archiveScenario(token, id, ctx)` — owner-first;
  soft-archive (status="ARCHIVED" + archived_at=now);
  idempotent on already-archived (returns
  `already_archived=true`, no new audit row — mirrors the
  `dissolveHive` idempotent precedent).

### Routes (`apps/api/src/routes/playground.routes.ts`)

`registerPlaygroundRoutes` signature extended to accept the
second `PlaygroundScenarioService` instance. 5 NEW routes:

- `POST /api/v1/playground/scenarios` (201 Created)
- `GET /api/v1/playground/scenarios?status=&limit=&include_archived=`
- `GET /api/v1/playground/scenarios/:id`
- `PUT /api/v1/playground/scenarios/:id`
- `DELETE /api/v1/playground/scenarios/:id`

`scenarioStatusFor` helper maps the 8-variant
`PlaygroundScenarioFailureCode` to HTTP (401 auth / 403
OPERATION_NOT_PERMITTED / 404 SCENARIO_NOT_FOUND / 422
INVALID_REQUEST / 500 INTERNAL_ERROR).

### Server wiring (`apps/api/src/server.ts`)

New service instantiated adjacent to `PlaygroundService`:

```ts
const playgroundScenarioService = new PlaygroundScenarioService(authService);
```

Route registration updated to pass the new service:

```ts
await registerPlaygroundRoutes(
  app,
  playgroundService,
  playgroundScenarioService,
);
```

### Audit posture (ADR-0065 §10)

`ADMIN_ACTION` + `details.action` discriminator pattern:

- `PLAYGROUND_SCENARIO_CREATED`
- `PLAYGROUND_SCENARIO_UPDATED`
- `PLAYGROUND_SCENARIO_ARCHIVED`

**ZERO new audit literal.** Safe details ONLY:

- `action`
- `scenario_id`
- `owner_entity_id`
- `org_entity_id`
- `status`
- `scenario_type`

**FORBIDDEN in audit row**: `title`, `description`,
`goal_summary`, `input_refs`, `constraints`,
`expected_outputs`, `governance_findings`. Idempotent
archive emits no audit row.

ADR-0060 §2 audit non-goal preserved for the 3 Wave 2
inspector routes (policy-evaluator / connector-dry-run /
working-set). Wave 4 emits on the **persistence boundary**
as ADR-0065 §10 explicitly approves.

### Schema migration discipline

`npm run db:push:test` per ADR-0025 (the
`scripts/prisma-db-push-test.sh` wrapper with localhost
fail-closed validation). Local refresh used
`bash scripts/local-test-db-refresh.sh` per ADR-0047
Sub-decision 4 to reconcile the Ecto-owned
`schema_migrations` + `idempotency_keys` tables (cross-
language data ownership boundary per ADR-0033 §Decision 7).
No production schema change; the deploy pipeline owns
production migrations.

### Tests (`tests/integration/playground-scenarios.test.ts`)

38 NEW integration tests across 7 describe blocks:

1. **auth enforcement (5 tests)** — 401 SESSION_INVALID
   on POST / GET list / GET detail / PUT / DELETE without
   bearer.
2. **create (7 tests)** — happy path with defaults;
   title-required; status closed-vocab; scenario_type
   closed-vocab; Json object-only validation; FIXTURE +
   FUTURE_GENERATED acceptance; title trim.
3. **list owner-scoped (4 tests)** — owner-only filtering;
   ARCHIVED default-excluded + include_archived=true opt-in;
   status=ARCHIVED filter; invalid status query → 422.
4. **detail owner-only (3 tests)** — owner read; cross-owner
   404 (enumeration-safe); unknown id 404.
5. **update owner-only (6 tests)** — owner update;
   cross-owner 404; owner_entity_id forbidden; org_entity_id
   forbidden; scenario_id/created_at/archived_at forbidden;
   status closed-vocab; Json metadata verbatim.
6. **archive soft-delete (4 tests)** — DELETE sets status +
   archived_at; row persists (RULE 10 proof); idempotent on
   already-archived; cross-owner 404.
7. **no-leak + no-side-effect (4 tests)** — 15 forbidden
   markers absent from create / list / detail wire
   responses; ZERO Action / ActionAttempt / Notification /
   OtzarConversation / MemoryCapsule / ConnectorBinding rows
   created across the full CRUD cycle.
8. **audit emission (4 tests)** — 3 discriminators present;
   safe details only (no `title`/`description`/`goal_summary`
   text); no new audit literal (no `event_type` containing
   "PLAYGROUND" or "SCENARIO").

All 38 pass.

### Baseline gates

- TypeScript: exactly 4 canonical residual errors preserved
  (ADR-0015 Decision B Amendment 1).
- RULE 16 no-console anchor: green.
- no-leak guard: green.
- test-env-config-safety: green.
- Wave 2 inspector regression (17 tests): green.

## Substrate-honest catches

- **Prisma `Json` column input typing** — the generated
  `PrismaJson*Input` type rejects plain
  `Record<string, unknown>`. Resolved with `as object` cast
  at the Prisma boundary (5 sites), mirroring the
  `HiveService.createHive` `governance_terms: terms as object`
  precedent at hive.service.ts:399. Cast is type-safe at the
  runtime tier because `isJsonObject` validates upstream.
- **Local test DB needed `local-test-db-refresh.sh`** to
  reconcile pre-existing Ecto-owned `schema_migrations`
  before `db:push:test` could land the new model without a
  `--accept-data-loss` flag. The canonical 8-step refresh
  script (NEW PR.3 substrate per ADR-0047) handled this
  exactly as designed; Founder-authored canonical procedure
  worked first-try.
- **`description: undefined` handling in Prisma**
  conditional spread — `data` builder uses conditional
  assignment (`if (body.description !== undefined) { ... }`)
  so undefined fields stay absent from the Prisma `data`
  object rather than overwriting existing values with null.

## Forward queue (per ADR-0065 §7; each separate Founder authorization)

- **Wave 5 — scenario candidate generation contract**.
  Likely fixture / deterministic first; NO LLM autonomy
  unless separately Founder-authorized. Candidate storage
  decision needed (extend PlaygroundScenario vs new
  PlaygroundScenarioCandidate model).
- **Wave 6 — outcome comparison + scoring rubric**.
  Closed-vocabulary tradeoff/risk/dependency rubric; NO
  employee scoring; NO probabilistic-claim fabrication.
- **Wave 7 — best-path recommender** with evidence + policy
  findings.
- **Wave 8 — governed transition** to Section 2 Action
  runtime (humans always in the loop).
- **Wave 9 — multi-agent simulation orchestration**
  (consumes ADR-0028 BEAM coordination layer).
- **Wave 10 — Control Tower frontend consumer**
  (`otzar-control-tower` repo; out of Foundation scope).

## References

- ADR-0065 §7 Wave 4 (parent contract).
- ADR-0060 (Wave 2 inspector foundation; preserved unchanged).
- ADR-0025 (schema-push-target discipline).
- ADR-0047 (local-test-db-refresh canonical procedure).
- ADR-0033 §Decision 7 (cross-language data ownership boundary).
- RULE 0 (humans always sovereign — owner-first self-scope).
- RULE 4 (audit before response).
- RULE 10 (soft-delete only).
- RULE 13 (substrate-honest pre-flight before drafting).
- RULE 16 (no console.* in apps/api/src).
