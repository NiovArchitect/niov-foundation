# PR #114 — Section 1 Wave 5 — Otzar proposed-pattern from recurring drift

**Date:** 2026-05-30
**Merge commit:** `7661ba9`
**Branch:** `section-1-wave-5-otzar-proposed-pattern-impl`
**ADR:** [ADR-0066](../architecture/decisions/0066-section-1-wave-5-otzar-proposed-pattern-from-recurring-drift.md)
**Section file:** [`01-employee-intelligence-core.md`](../current-build-state/01-employee-intelligence-core.md)
**Authorization:** Founder Wave 5 implementation authorization 2026-05-30 (second of two slice authorizations per ADR-0066 §11; ADR-0066 itself landed at PR #113).

## Important framing (READ FIRST)

Wave 5 is the **review-gated proposed-pattern substrate** — auto-write means **AUTO-PROPOSE, NOT auto-commit**. The system observes the caller's OWN closed-vocab drift signals and creates `OtzarProposedPattern` rows (`status="PROPOSED"`) for the owner to review.

Wave 5 is **NOT**:
- Employee surveillance.
- Manager scoring.
- Psychological profiling.
- Hidden compliance scoring.
- Autonomous memory mutation.
- LLM-generated proposal text (closed-vocab templates only).
- Active pattern consumption — Wave 6+ owns how an ACCEPTED pattern informs the AI teammate's behavior. Wave 5 only provides the persistence + review surface.

## Why this entry exists

Wave 5 is a **schema-bearing landing** (NEW `OtzarProposedPattern` Prisma model + 2 indexes). Tier-4 build-log entry per `NEXT_ACTION.md` discipline: schema-change qualifies.

## What landed

### Schema (`packages/database/prisma/schema.prisma`)

NEW `OtzarProposedPattern` model verbatim per ADR-0066 §3:

```
model OtzarProposedPattern {
  pattern_id          String    @id @default(uuid()) @db.Uuid
  owner_entity_id     String    @db.Uuid
  source_signal_type  String    // closed-vocab per ADR-0066 §4
  pattern_label       String    // closed-vocab per ADR-0066 §4
  safe_summary        String    // canonical template only; never raw text
  confidence_label    String    @default("MEDIUM") // closed-vocab LOW|MEDIUM|HIGH
  status              String    @default("PROPOSED") // closed-vocab PROPOSED|ACCEPTED|REJECTED|ARCHIVED
  occurrence_count    Int       @default(1)
  first_signal_at     DateTime
  last_signal_at      DateTime
  proposed_at         DateTime  @default(now())
  reviewed_at         DateTime?
  archived_at         DateTime?
  created_at          DateTime  @default(now())
  updated_at          DateTime  @updatedAt

  @@index([owner_entity_id, status, proposed_at])
  @@index([owner_entity_id, archived_at])
  @@map("otzar_proposed_patterns")
}
```

Closed-vocab String columns per Hive / MemoryCapsule / PlaygroundScenario precedent. **NO `description` column + NO `evidence Json` + NO `org_entity_id` column** (all deliberate per ADR-0066 §3).

**Existing org-scoped `IntelligencePattern` at `schema.prisma:1100-1114` preserved UNCHANGED per RULE 1 + ADR-0066 §"Why a new Prisma model"**. Verified untouched across the full test cycle (the no-leak test category explicitly counts `intelligencePattern` rows before/after a full sweep + transition cycle and asserts equality).

`packages/database/src/index.ts` extended to re-export the generated `OtzarProposedPattern` type.

### Service (NEW `apps/api/src/services/otzar/proposed-pattern.service.ts`)

`OtzarProposedPatternService` class with 4 owner-first methods:

- `sweep(token, ctx)` — runs recurrence-detection function; creates new PROPOSED rows; deduplicates against existing PROPOSED|ACCEPTED non-archived rows. Audit: `OTZAR_PATTERN_PROPOSED` per created row.
- `list(token, opts, ctx)` — caller-scoped (`where.owner_entity_id = session.entity_id`); default excludes ARCHIVED; `?status` filter; `?include_archived=true` opt-in; `?limit` default 50 / cap 100; ordered by `proposed_at DESC`. Audit: `OTZAR_PATTERN_READ` with `read_kind=LIST`.
- `get(token, id, ctx)` — owner-first lookup; cross-owner / unknown id fold to `PROPOSED_PATTERN_NOT_FOUND` (enumeration-safe). Audit: `OTZAR_PATTERN_READ` with `read_kind=DETAIL`.
- `transition(token, id, body, ctx)` — owner state-transition; forbidden body fields (14 fields; only `status` updatable) → `INVALID_REQUEST`; invalid transitions → `INVALID_STATE_TRANSITION`; cross-owner → `PROPOSED_PATTERN_NOT_FOUND`. Sets `reviewed_at` on ACCEPTED|REJECTED; sets `archived_at` on ARCHIVED. Audit: `OTZAR_PATTERN_ACCEPTED` | `OTZAR_PATTERN_REJECTED` | `OTZAR_PATTERN_ARCHIVED` per terminal status.

**Recurrence-detection function** (private; reads ONLY caller's own drift substrate):

- **PER_CONVERSATION_DRIFT**: queries CORRECTION capsules in caller's wallet from last 14 days; groups by `conversation_id`; counts conversations with ≥ 4 corrections (mirrors Wave 3B `CORRECTION_VELOCITY_ELEVATED > 3` threshold); ≥ 3 elevated conversations → MEDIUM; ≥ 6 → HIGH.
- **WALLET_STALE_CONTEXT**: pulls caller's wallet capsules' two hash columns + `embedding_generated_at` (no raw content); counts rows where `embedding_content_hash != content_hash` and the embedding has been stale based on `embedding_generated_at`. Cutoffs: ≤ 7 days ago → MEDIUM; ≤ 14 days ago → HIGH.
- **CROSS_CONVERSATION_ROLLUP**: fires when both above signals fire concurrently; mirrors Wave 4C `AT_RISK` rollup semantics.

**Dedup policy**: no new PROPOSED row for a `(owner, source_signal_type, pattern_label)` tuple while an existing PROPOSED|ACCEPTED row is non-archived. Re-proposing happens only after ARCHIVED transition closes the dedup window. Verified by 3 dedup-specific integration tests.

**Canonical `safe_summary` templates** keyed on `pattern_label` per ADR-0066 §3. Templates are owner-coaching language; explicit "never shared with managers or other employees" + "does not change how your teammate behaves yet" clauses.

### Routes (NEW `apps/api/src/routes/otzar-proposed-pattern.routes.ts`)

4 routes on `/api/v1/otzar/my-twin/proposed-patterns` per ADR-0066 §6:

| Route | Method | Purpose |
|---|---|---|
| `/sweep` | POST | Run recurrence-detection sweep (200 OK; includes `created_count` + `deduped_count` + `created[]`) |
| `` (root) | GET | List caller's patterns (200; `patterns[]`) |
| `/:id` | GET | Owner-only detail (200; `pattern`) |
| `/:id` | PATCH | Owner state-transition (200; `pattern` + `audit_event_id`) |

`statusFor` helper maps 9-variant `OtzarProposedPatternFailureCode` to HTTP: 401 (4 auth variants) / 403 OPERATION_NOT_PERMITTED / 404 PROPOSED_PATTERN_NOT_FOUND / 422 INVALID_STATE_TRANSITION + INVALID_REQUEST / 500 INTERNAL_ERROR.

### Server wiring (`apps/api/src/server.ts`)

NEW `OtzarProposedPatternService` instantiated adjacent to `OtzarService`:

```ts
const otzarProposedPatternService = new OtzarProposedPatternService(
  authService,
);
```

`registerOtzarProposedPatternRoutes(app, otzarProposedPatternService)` wired adjacent to `registerOtzarRoutes`.

### Audit posture (ADR-0066 §7)

`ADMIN_ACTION + details.action` discriminator pattern:

- `OTZAR_PATTERN_PROPOSED` (sweep creates a row)
- `OTZAR_PATTERN_READ` (list or detail; with `read_kind` ∈ LIST | DETAIL)
- `OTZAR_PATTERN_ACCEPTED` (PROPOSED → ACCEPTED)
- `OTZAR_PATTERN_REJECTED` (PROPOSED → REJECTED)
- `OTZAR_PATTERN_ARCHIVED` (any → ARCHIVED)

**ZERO new audit literal.** Verified by integration test that scans all `auditEvent.event_type` values for the caller and asserts none contain "OTZAR_PATTERN" or "PROPOSED_PATTERN".

**Safe audit details ONLY**: `action` + `pattern_id` + `owner_entity_id` + `source_signal_type` + `pattern_label` + `status` + `confidence_label`. (Read events also include `read_kind` and may include `returned_count` for LIST.)

**FORBIDDEN in audit row**: `safe_summary` template text; raw correction / transcript / capsule content; conversation IDs; topic tag values; embeddings / vectors / storage locations / content hashes; bridge IDs / secret refs; cross-owner / cross-org data; chain-of-thought / prompts / LLM-generated text; numeric drift / quality / productivity / employee scores.

### Schema migration discipline

`npm run db:push:test` per ADR-0025 (`scripts/prisma-db-push-test.sh` wrapper with localhost fail-closed validation). Local refresh via `bash scripts/local-test-db-refresh.sh` per ADR-0047 Sub-decision 4 to reconcile the Ecto-owned `schema_migrations` + `idempotency_keys` tables (cross-language data ownership boundary per ADR-0033 §Decision 7).

### Tests (`tests/integration/otzar-proposed-pattern.test.ts`)

36 NEW integration tests across 7 describe blocks (all pass):

1. **auth enforcement (4 tests)** — 401 SESSION_INVALID on POST /sweep / GET list / GET detail / PATCH without bearer.
2. **sweep recurrence detection (7 tests)** — no-signals zero-state; PER_CONVERSATION_DRIFT happy path; WALLET_STALE_CONTEXT happy path; both signals concurrently → CROSS_CONVERSATION_ROLLUP; dedup against PROPOSED; dedup against ACCEPTED; re-propose after ARCHIVED.
3. **list owner-scoped (3 tests)** — cross-owner exclusion; ARCHIVED default-excluded + include_archived opt-in; invalid status query.
4. **detail owner-only (3 tests)** — owner read; cross-owner 404 (enumeration-safe); unknown id 404.
5. **PATCH state transitions (11 tests)** — ACCEPTED + REJECTED + ARCHIVED transitions; ACCEPTED → ARCHIVED allowed; invalid forward transitions (ARCHIVED → ACCEPTED; ACCEPTED → REJECTED; PROPOSED → PROPOSED self-transition); missing status; invalid status vocab; forbidden body fields; cross-owner 404.
6. **no-leak + no-side-effect (4 tests)** — 13-marker no-leak on sweep / list / detail wire responses; existing org-scoped `IntelligencePattern` table count UNCHANGED across full CRUD + sweep cycle.
7. **audit emission (4 tests)** — `OTZAR_PATTERN_PROPOSED` on sweep create; ACCEPTED + ARCHIVED discriminators on transitions; `OTZAR_PATTERN_READ` with LIST + DETAIL read_kind; no new audit literal (event_type never contains OTZAR_PATTERN or PROPOSED_PATTERN).

### Baseline gates

- TypeScript baseline preserved at exactly 4 canonical residual errors (ADR-0015 Decision B Amendment 1).
- RULE 16 no-console anchor: green.
- no-leak guard: green.
- test-env-config-safety: green.
- Wave 4A stale-context (13 tests) + Wave 4C rollup (12 tests) regression: green.

## Substrate-honest catches

- **`MemoryCapsule` has no `updated_at` column** — caught at TypeScript baseline check after the first service draft. Resolved by switching the stale-context recurrence proxy to `embedding_generated_at` (the canonical "embedding was last fresh" timestamp per ADR-0045 G5.3), which is the substrate-correct signal for embedding-content-hash skew. The fix is documented inline in the service header substrate-honest disclosure block.
- **"≥ N consecutive days" criterion is a single-snapshot proxy at v1** — true consecutive-day tracking would require persistent daily snapshots, which is forward-substrate per ADR-0066 §9 "background scheduler". The v1 proxy uses `embedding_generated_at` (when the embedding was last fresh) as the staleness anchor; the proxy slightly under-proposes when content edits happen near now, which is the safer direction.
- **`schema_migrations` cross-language boundary** triggered the same local-test-db-refresh cycle as Wave 4. The canonical `scripts/local-test-db-refresh.sh` per ADR-0047 PR.3 handled it first-try.

## Forward queue (per ADR-0066 §9; each requires separate Founder authorization)

- **Wave 6 — active-pattern-consumption** — how an ACCEPTED `OtzarProposedPattern` informs the AI teammate's behavior. Likely paths: (a) priming hook into `assembleContext` per ADR-0048; (b) explicit advisory surface in `getMyTwin` response. Founder product decision needed before drafting Wave 6 ADR.
- **Manager/org-admin review surface** — forbidden at v1 per RULE 0 + ADR-0066 §9.
- **LLM-generated proposal text** — forbidden at v1.
- **Operator-tunable recurrence thresholds** — per-org `OrgSettings` override.
- **Connector fan-out of accepted patterns** — opt-in via Section 4 ConnectorBinding; never manager push.
- **Background scheduler / sweep automation** — current v1 trigger is on-demand sweep route invocation.
- **True consecutive-day tracking** — would require persistent daily snapshots.
- **Control Tower UX consumer** — frontend; lives in `otzar-control-tower`; out of Foundation scope.

## References

- ADR-0066 (parent — implements §3-§7 verbatim)
- ADR-0058 (Wave 3B per-conversation drift signal source; §"Forward queue" item 1 closed at impl register here)
- ADR-0044 + ADR-0045 (Wave 4A stale-context substrate the recurrence-detection function consumes)
- ADR-0045 G5.3 (`embedding_generated_at` column; canonical "embedding was last fresh" timestamp)
- ADR-0025 (schema-push-target discipline)
- ADR-0047 (local-test-db-refresh canonical procedure)
- ADR-0033 §Decision 7 (cross-language data ownership boundary)
- RULE 0 (sovereignty; owner-first self-scope)
- RULE 1 (build forward; existing org-scoped `IntelligencePattern` preserved unchanged)
- RULE 4 (audit before response; 5 ADMIN_ACTION discriminators)
- RULE 10 (soft-delete; ARCHIVED terminal status)
- RULE 13 (substrate-honest single-snapshot proxy disclosure)
- RULE 16 (no `console.*` in `apps/api/src`)
