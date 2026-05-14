# ADR-0033: BEAM Persistence + Idempotency + Audit-Chain Cryptographic Substrate Architecture

## Status

Accepted at sub-phase 5b-ii `[BEAM-COSMP-INTEROP-PERSISTENCE]` of Block
B Phase 2. Decision substrate for the persistence + idempotency +
audit-chain port of the Foundation TypeScript register's primitives to
the Elixir/BEAM register.

## Context

Sub-phase 5b-i `[BEAM-COSMP-INTEROP-GRPC]` (`bb5f3a3`) closed the gRPC
interop substrate per ADR-0032: the Fastify TypeScript API and the
Elixir COSMP router cross the language boundary via canonical `:grpc` +
`:protobuf` libraries with patent-canonical Capsule field-number
ordering. The router's 7 `handle_call` bodies fill with real routing
logic; ETS hot-tier storage acts as the substrate's working set.

What the 5b-i substrate **does not** address:

- **Durable persistence** — capsules + audit events live only in ETS
  (process memory); a router restart loses everything. Production-grade
  COSMP requires Postgres source-of-truth.
- **Cryptographic audit-chain** — the Foundation TypeScript register
  per ADR-0002 enforces tamper-evident audit logs via SHA-256 hash
  chain (`previous_event_hash` linkage) + Postgres `BEFORE DELETE`
  trigger. The Elixir register currently has no audit-chain primitive;
  audit emissions from Elixir-side COSMP ops are not yet captured.
- **Idempotency cache** — ADR-0026 §5 BEAM Pattern 4 (idempotent
  verification keys) requires a substrate-level cache so replays of
  the same operation return the same outcome without re-executing
  side-effects. ADR-0031 Q-D explicitly forward-queued the
  idempotency strategy to sub-phase 5b-ii / 6.

These three concerns are **architecturally paired**: durable
persistence is what makes the audit chain useful (chain integrity
across restarts); the audit chain is what makes idempotency-key
uniqueness verifiable (replay attempts hit the same hash). A single
ADR captures the substrate decisions for all three.

The Q-AUDIT-1 Option A scope expansion at sub-phase 5b-ii pre-flight
adds the audit-chain cryptographic substrate to ADR-0033's scope
explicitly (originally framed at ADR-0028 forward-queue as
"BEAM Persistence + Idempotency Architecture"; expanded to include
"Audit-Chain Cryptographic Substrate" per operator decision).

The Foundation TypeScript register has full implementation
substrate at `packages/database/src/queries/audit.ts` (the `writeAuditEvent`
+ `verifyAuditChain` discipline) + `packages/database/prisma/schema.prisma`
(the `MemoryCapsule` + `AuditEvent` models + 36 sibling models). The
Elixir register at sub-phase 5b-ii **ports these primitives**, not
re-invents them. Cross-language byte-equivalence at the canonical
hashing layer is the load-bearing invariant: a `writeAuditEvent` from
either language register must produce a row whose `event_hash` is
verifiable by `verifyAuditChain` running in either language.

## Decision

Sub-phase 5b-ii instantiates a layered substrate with seven coordinated
decision sub-registers. Each is documented below with the locked
choice + rationale + alternatives considered inline.

### 1. Hex deps: `:ecto_sql` + `:postgrex` (Q-PERSISTENCE-DEPS)

Add `{:ecto_sql, "~> 3.13"}` + `{:postgrex, "~> 0.20"}` to
`apps/cosmp_router/mix.exs` deps. Both are canonical Elixir Hex
libraries with stable APIs and broad Foundation-stack maturity (Phoenix
+ LiveView ecosystem dependencies).

`:ecto_sql` provides the Repo + Multi + Migration substrate; `:postgrex`
is the Postgres driver Ecto wraps. No alternatives considered seriously
— Ecto + Postgrex is the canonical Elixir Postgres stack per BEAM
ecosystem maturity (akin to how `:grpc` + `:protobuf` is canonical for
gRPC per ADR-0032 §Decision Q-M).

### 2. Postgres test register: local containerized + `foundation_test` shared (Q-PG-TEST)

Local containerized Postgres at `localhost:5433/foundation_test` (the
`niov-foundation-test-db` container per ADR-0013 + ADR-0015 §Decision
E `postgres:16.4-alpine` pin) is the test register for Elixir's Ecto
Repo. The container is shared with the Foundation TypeScript unit tier
— same database, same Prisma-pushed schema. Three substrate-state
implications:

1. **Schema availability**: All Prisma tables (`memory_capsules`,
   `audit_events`, `permissions`, etc.) are pre-pushed to
   `foundation_test`. Elixir Ecto schemas mirror Prisma's column
   shape; no Ecto migrations against shared tables.
2. **RULE 15 single-cycle test discipline applies**: concurrent
   `vitest` + `mix test` runs against the shared container would
   produce fixture collision. Contributor + CI discipline must
   serialize: TS tier test pass completes before Elixir tier begins,
   or vice versa.
3. **CI Elixir-tier Postgres service block**: `.github/workflows/ci.yml`
   adds a `postgres:16.4-alpine` service to the Elixir tier job
   (matching ADR-0015's pin); CI runs each tier in its own job,
   so concurrent-run risk does not apply at CI register.

Production + dev use Supabase pooler `DATABASE_URL`
(`postgresql://****@aws-1-us-east-2.pooler.supabase.com:6543/postgres?pgbouncer=true`);
test uses the local container. `config/runtime.exs` reads
`System.get_env("DATABASE_URL")` per D-5BII-EXEC-7 Option α; local
contributor dev shell-sources `.env` (no Hex `:dotenvy` dep).

**Alternatives considered:**
- *(Shared Supabase pooler at test time)* Rejected — collides with TS
  test schema lifecycle; test isolation harder; network hop adds
  latency to every test run.
- *(Dedicated Elixir-only container at port 5434)* Rejected — adds
  infrastructure surface; sharing one container with schema-equivalent
  contents is simpler.
- *(Supabase test branch / schema)* Rejected — operator-provisioning
  complexity; contributor onboarding friction.

### 3. Two-tier Elixir naming (Q-CAPSULE-NAME; Fork β Refined)

`CosmpRouter.Capsule` (current placeholder per ADR-0031 §Decision
Capsule placeholder) **stays as-is**: the patent-canonical 7-layer
runtime struct (payload / metadata / rules / relations / time /
permissions / audit). The struct is the in-memory surface the Router
+ gRPC translator + ETS storage already work with.

`CosmpRouter.MemoryCapsule` (NEW at sub-phase 5b-ii) is the **Ecto
persistence schema** mapping to the Prisma `memory_capsules` table.
Field shape mirrors Prisma exactly (~30 fields + 4 relations + 7
indexes; documented at §3a below).

The two are connected by **`CosmpRouter.Capsule.Translator`** (NEW;
documented at §3b below): a pure module with `pack/1` (`%CosmpRouter.Capsule{} → %CosmpRouter.MemoryCapsule{}` for write) and `unpack/1`
(`%CosmpRouter.MemoryCapsule{} → %CosmpRouter.Capsule{}` for read).

**Naming rationale:**
- `MemoryCapsule` matches Prisma's exported model name verbatim →
  Foundation-wide symbol-discoverability across both languages
- `Capsule` (bare) preserves patent-canonical semantic at the runtime
  surface → ADR-0031 + ADR-0032 cite stability
- Translation boundary is internal to Elixir register; external
  observers (gRPC clients, future audit tooling) see the canonical
  `MemoryCapsule` row shape via Ecto

**Alternatives considered:**
- *(Rename `CosmpRouter.Capsule` → `CosmpRouter.MemoryCapsule`)*
  Rejected (Fork α at pre-flight) — disrupts 14+ ADR-0031/0032 cite
  sites + the sub-phase 5b-i cascade rotations
- *(Single name with discriminator field)* Rejected — runtime + persistence
  shapes are different (30 fields vs 7 layers); single-type abstraction
  would add complexity without clarifying the boundary
- *(Rename Prisma `MemoryCapsule` → `Capsule`)* Rejected — 82 TypeScript
  call-sites + type-references would cascade; ADR-0025 schema-push-target
  discipline requires schema name stability

#### 3a. Ecto `MemoryCapsule` schema field map (30 fields + 4 relations)

The Ecto schema mirrors Prisma's column shape exactly. Field
breakdown by patent-canonical Capsule layer (per Q-CAPSULE-LAYER-MAP):

| Patent layer | Prisma → Ecto fields |
|---|---|
| **Payload** | `storage_location` (Supabase Storage URI) + `payload_summary` + `payload_size_tokens` + `tokens` + `tokens_tokenizer` + `commitment_date` + `content_hash` |
| **Metadata** | `capsule_type` (CapsuleType enum) + `topic_tags` (string array; GIN-indexed) + `version` |
| **Rules** | `clearance_required` + `ai_access_blocked` + `requires_validation` + `decay_type` + `decay_rate` |
| **Relations** | `connected_capsule_ids` (string array) + `connected_entity_ids` (string array) + `permissions` association + `escalations` association |
| **Time** | `created_at` + `last_accessed_at` + `last_updated_at` + `expires_at` + `deleted_at` (soft-delete per RULE 10) |
| **Permissions** | `wallet_id` (FK) + `entity_id` (FK) + `Permission[]` association |
| **Audit** | `audit_events` joined via `target_capsule_id` (no direct field on `MemoryCapsule`; the join is bidirectional through `AuditEvent.target_capsule_id`) |

**Plus monetization + scoring + attribution sibling fields** (not
patent-canonical layers but required for Foundation-wide schema parity):

- Scoring: `relevance_score`, `feedback_loop_score`
- Monetization: `monetization_enabled`, `monetization_category`
- Attribution: `created_by`, `created_session_id`, `write_reason`,
  `updated_by`, `updated_session_id`, `previous_version`
- Operations: `access_count`, `storage_tier`

**Cascade behavior:** `Wallet` + `Entity` `ON DELETE CASCADE` (Prisma
canonical); Ecto schema mirrors via `belongs_to`/`has_many`.

#### 3b. `CosmpRouter.Capsule.Translator` pack/unpack discipline

```
Translator.pack/1 :: %CosmpRouter.Capsule{} → %CosmpRouter.MemoryCapsule{}
  • Pure projection — no I/O, no side effects
  • Defaults applied for fields the runtime struct doesn't carry
    (storage_tier defaults :warm, version defaults 1, etc.)
  • Time fields: created_at + last_updated_at populated from
    runtime time map; deleted_at always nil at pack-time
  • Audit field at runtime maps to AuditEvent rows via writeAuditEvent
    composed-mode call (NOT serialized into MemoryCapsule row directly)

Translator.unpack/1 :: %CosmpRouter.MemoryCapsule{} → %CosmpRouter.Capsule{}
  • Pure projection — no I/O, no side effects
  • Time map reconstructed from created_at + last_updated_at + expires_at
  • Audit array reconstructed by querying audit_events WHERE
    target_capsule_id = capsule.capsule_id (deferred to caller; not
    inline in unpack/1 to keep the pure transformation pattern)
```

The Translator is a **pure transformation** per ADR-0026 §5 BEAM
Pattern 6; it composes safely with the Router's `handle_call` bodies +
the Storage facade's read/write boundary.

### 4. Audit primitive: byte-equivalent canonical_record + chain_key + dual-mode (Q-AUDIT-PRIMITIVE)

`CosmpRouter.Audit` (NEW; Elixir module) ports the Foundation TypeScript
audit primitive at `packages/database/src/queries/audit.ts` byte-for-byte.

#### 4a. `canonical_record/1` byte-equivalence

The TypeScript implementation:

```typescript
function canonicalRecord(parts): string {
  return [
    parts.audit_id,
    parts.event_type,
    parts.actor_entity_id ?? "",
    parts.target_entity_id ?? "",
    parts.target_capsule_id ?? "",
    parts.session_id ?? "",
    parts.outcome,
    parts.denial_reason ?? "",
    canonicalJson(parts.details),
    parts.ip_address ?? "",
    parts.timestamp.toISOString(),
    parts.previous_event_hash ?? "",
  ].join("|");
}
```

The Elixir port:

```elixir
def canonical_record(parts) do
  [
    parts.audit_id,
    parts.event_type,
    parts.actor_entity_id || "",
    parts.target_entity_id || "",
    parts.target_capsule_id || "",
    parts.session_id || "",
    parts.outcome,
    parts.denial_reason || "",
    canonical_json(parts.details),
    parts.ip_address || "",
    DateTime.truncate(parts.timestamp, :millisecond) |> DateTime.to_iso8601(),
    parts.previous_event_hash || ""
  ]
  |> Enum.join("|")
end
```

**`DateTime.truncate(:millisecond)` is load-bearing** per D-5BII-EXEC-2.
TypeScript `Date.toISOString()` always emits millisecond precision
(e.g., `"2026-05-13T22:28:40.000Z"`); Elixir `DateTime.to_iso8601/1`
defaults to **microsecond precision** (e.g.,
`"2026-05-13T22:28:40.000000Z"`). Without truncation, identical
logical timestamps produce different canonical strings → divergent
hashes → cross-language verifyAuditChain breaks.

#### 4b. `canonical_json/1` byte-equivalence

The TypeScript implementation (audit.ts:252-268) recursively
sorted-key-serializes any value:

- Primitives: `JSON.stringify(value)` (handles strings with proper
  escape, numbers, booleans, null)
- Arrays: `"[" + comma-joined recursive + "]"` (no whitespace)
- Objects: keys alphabetically sorted, then `"{" + comma-joined
  "key:value" + "}"` (no whitespace)

The Elixir port mirrors the structure. Implementation registers in
`CosmpRouter.Audit.CanonicalRecord` (or co-located in
`CosmpRouter.Audit`; Translator pattern same as TypeScript audit.ts:
canonical_record + canonical_json colocated). Elixir uses `Jason` for
primitive serialization (handles strings/numbers/booleans/null with
JSON-canonical escaping that matches Node's `JSON.stringify` output).

**Byte-equivalence test discipline (D-5BII-EXEC-4 Option α):**
A TypeScript fixture-generation script
(`scripts/generate-canonical-fixtures.ts`) emits `{canonical_input,
expected_hash}` pairs across 8-12 representative AuditEvent shapes
covering nullable fields, edge cases (unicode, escape sequences),
timestamp precision boundary, deeply-nested details JSON. Fixtures
commit to `apps/cosmp_router/test/fixtures/canonical_record/fixtures.json`.
Elixir test reads fixtures + asserts `canonical_record/1` +
`sha256_hex/1` produce identical output for every fixture row.

#### 4c. `chain_key` priority resolution

Mirrors TypeScript `audit.ts:370-371` exactly:

```elixir
def chain_key(input) do
  input.actor_entity_id ||
  input.system_principal ||
  @system_chain_key
end
```

Where `@system_chain_key = "__niov_system_chain__"` matches
`SYSTEM_CHAIN_KEY` at `audit.ts:219` (legacy DRIFT 12 backwards-compat
sentinel).

#### 4d. `SYSTEM_PRINCIPALS` registry — `:cosmp_router` 5th principal

Per D-5BII-EXEC-3, the Foundation TypeScript `SYSTEM_PRINCIPALS` frozen
registry at `packages/database/src/queries/audit.ts:235-240` extends
with a 5th principal:

```typescript
SYSTEM_PRINCIPALS = Object.freeze({
  SCHEDULER:           "__niov_system_scheduler__",
  BOOT_VALIDATOR:      "__niov_system_boot_validator__",
  COMPLIANCE_SEEDER:   "__niov_system_compliance_seeder__",
  FEEDBACK_LOOP:       "__niov_system_feedback_loop__",
  COSMP_ROUTER:        "__niov_system_cosmp_router__",  // NEW
});
```

The matching Elixir constant lives in `CosmpRouter.Audit`:

```elixir
@system_principals %{
  scheduler: "__niov_system_scheduler__",
  boot_validator: "__niov_system_boot_validator__",
  compliance_seeder: "__niov_system_compliance_seeder__",
  feedback_loop: "__niov_system_feedback_loop__",
  cosmp_router: "__niov_system_cosmp_router__"
}
```

The anchor test `tests/unit/audit-system-principals.test.ts` updates
to assert the 5-key registry (was 4); test enforces `Object.freeze` +
sentinel-string convention (`__niov_system_<subsystem>__`).

#### 4e. Dual-mode `write_audit_event` (standalone + composed via Ecto.Multi)

Mirrors TypeScript `writeAuditEvent` dual-mode at `audit.ts:452-460`:

```elixir
# Standalone mode: opens own Repo transaction
def write_audit_event(input) do
  Repo.transaction(fn -> write_audit_event_in_tx(input) end)
end

# Composed mode: participates in caller's Ecto.Multi
def write_audit_event(input, %Ecto.Multi{} = multi, multi_key) do
  Multi.run(multi, multi_key, fn _repo, _changes ->
    write_audit_event_in_tx(input)
  end)
end

defp write_audit_event_in_tx(input) do
  chain_key = chain_key(input)

  # Per-chain advisory lock (xact-scoped); mirrors TS audit.ts:374-377
  Ecto.Adapters.SQL.query!(Repo,
    "SELECT pg_advisory_xact_lock(hashtext($1))",
    [chain_key])

  previous = Repo.one(
    from a in AuditEvent,
    where: a.actor_entity_id == ^input.actor_entity_id,
    order_by: [desc: a.timestamp],
    limit: 1,
    select: a.event_hash
  )

  audit_id = Ecto.UUID.generate()
  timestamp = DateTime.utc_now() |> DateTime.truncate(:millisecond)
  details = merge_system_principal_into_details(input)
  previous_event_hash = previous

  event_hash = sha256_hex(canonical_record(%{
    audit_id: audit_id,
    event_type: input.event_type,
    actor_entity_id: input.actor_entity_id,
    target_entity_id: input.target_entity_id,
    target_capsule_id: input.target_capsule_id,
    session_id: input.session_id,
    outcome: input.outcome,
    denial_reason: input.denial_reason,
    details: details,
    ip_address: input.ip_address,
    timestamp: timestamp,
    previous_event_hash: previous_event_hash
  }))

  AuditEvent.changeset(%AuditEvent{}, %{
    audit_id: audit_id,
    event_type: input.event_type,
    actor_entity_id: input.actor_entity_id,
    target_entity_id: input.target_entity_id,
    target_capsule_id: input.target_capsule_id,
    session_id: input.session_id,
    outcome: input.outcome,
    denial_reason: input.denial_reason,
    details: details,
    ip_address: input.ip_address,
    timestamp: timestamp,
    previous_event_hash: previous_event_hash,
    event_hash: event_hash
  })
  |> Repo.insert()
end
```

**Composed-mode default for COSMP `WRITE` / `SHARE` / `REVOKE`** per
RULE 4 (audit trail is sacred — audit failure rolls back the
operation) + ADR-0026 §5 Pattern 4 (event-sourced audit semantics).
`READ` / `AUDIT` ops use standalone mode (no business-mutation to
roll back; audit IS the event).

#### 4f. `verify_audit_chain/1` — chain integrity check

Mirrors TypeScript `verifyAuditChain` at `audit.ts:514+`. Walks the
audit-events sequence ordered by `timestamp` for a given chain_key,
recomputes every `event_hash` from `canonical_record/1`, asserts each
matches stored hash AND each `previous_event_hash` matches the prior
row's stored hash. Returns `{:ok, count}` or
`{:error, %{broken_at_audit_id: id, expected_hash: h1, computed_hash: h2}}`.

### 5. Storage facade: ETS hot-tier + Postgres source-of-truth (Q-STORAGE-LAYER)

`CosmpRouter.Storage` (NEW; facade module) presents a single unified
storage interface. Behind the facade:

- `CosmpRouter.Storage.ETS` (existing per sub-phase 5b-i; preserved
  unchanged at the storage register but reframed as **hot-tier**) —
  named-table singleton; sub-second reads; volatile across restarts
- `CosmpRouter.Storage.Postgres` (NEW) — Ecto-backed durable
  source-of-truth; mirrors Prisma `memory_capsules` table via
  `CosmpRouter.MemoryCapsule` Ecto schema

**Read path:** ETS-first lookup; on miss, Postgres query → populate
ETS entry → return. ETS is never the canonical answer; on
discrepancy, Postgres wins (Postgres is source-of-truth).

**Write path:** Postgres write (composed-mode with audit per §4e) →
on success, update ETS entry. ETS write happens AFTER Postgres commit;
ETS may temporarily hold stale data on the very edge case of
read-during-write but this is acceptable for a hot-tier cache.

**Why facade not direct Postgres?** The 5b-i ETS substrate is
load-bearing for the gRPC server's sub-millisecond read latency
target; ripping out ETS would regress that. The facade preserves the
hot-tier behavior + adds durable source-of-truth.

### 6. Idempotency layer (Q-IDEMPOTENCY)

`CosmpRouter.Idempotency` (NEW) instantiates ADR-0026 §5 BEAM
Pattern 4 (event-sourced audit semantics) + Pattern 5 (idempotent
verification keys) compound.

**Storage substrate:** Ecto-backed `idempotency_keys` table (NEW
Elixir-owned table per D-5BII-EXEC-5 Option β; Ecto migration
canonical). NOT shared with Foundation TypeScript register (no
TypeScript consumer of this table).

**Schema:**
```
idempotency_keys
  idempotency_key  String  PK     -- caller-provided key (e.g., "write:capsule:c-1:v2")
  request_hash     String         -- SHA-256 of the canonical request body
  response_hash    String         -- SHA-256 of the canonical response body
  outcome          String         -- :success | :failure | :error
  inserted_at      DateTime
  expires_at       DateTime       -- TTL (24h default; configurable)
```

**API:**
```elixir
Idempotency.lookup(key)
  # → {:hit, %{request_hash, response_hash, outcome}} OR :miss

Idempotency.store(key, request_hash, response_hash, outcome, ttl_hours \\ 24)
  # → :ok
```

**Router integration:** `WRITE` / `SHARE` / `REVOKE` handlers check
idempotency cache BEFORE executing the operation. On hit + matching
request_hash, return the cached response without re-executing
side-effects (true idempotency). On hit + mismatching request_hash,
return `IDEMPOTENCY_CONFLICT` error envelope (per `cosmp.proto`
`CosmpError.Kind.IDEMPOTENCY_CONFLICT`).

**Hot-tier ETS cache:** Optional in-memory layer in front of the
Postgres `idempotency_keys` table for sub-millisecond lookup. Not
required at sub-phase 5b-ii landing; can be added at sub-phase 6 if
benchmark shows Postgres lookup latency is bottleneck.

### 7. Migration ownership (Q-MIGRATION-OWNERSHIP; D-5BII-EXEC-5 hybrid)

**Shared tables (Prisma owns):** `memory_capsules`, `audit_events`,
`permissions`, and all 38 Prisma-pushed tables in `foundation_test` /
production. Ecto schemas at `apps/cosmp_router/lib/cosmp_router/schemas/`
mirror Prisma's column shape but **never** call `mix ecto.migrate`
against these tables. Schema drift detection: deferred per D-5BII-EXEC-3
to a future commit's NEW `scripts/check-schema-parity.exs` (forward-
substrate; documented at §Consequences below).

**Elixir-only tables (Ecto owns):** `idempotency_keys` (introduced at
this sub-phase). Migration files at
`apps/cosmp_router/priv/repo/migrations/`. Migration discipline:

- New Elixir-only table → Ecto migration committed alongside the
  schema definition
- `mix ecto.migrate` invoked manually OR via `CosmpRouter.Repo.migrate/0`
  helper at boot
- Production: migration runs as part of release deploy step (out of
  scope at sub-phase 5b-ii; deferred to sub-phase 11 or later)

**Boundary rule:** If a future Elixir-only requirement needs a column
on a Prisma-shared table (e.g., adding an `elixir_internal_metadata`
JSONB column to `memory_capsules`), the change goes through Prisma
schema → `prisma db push` → Ecto schema mirror update. Never an Ecto
migration on a shared table.

### 8. BEFORE DELETE trigger ownership (D-5BII-EXEC-6)

Per ADR-0002, the `BEFORE DELETE` trigger on `audit_events` is
installed by `applyAuditEventTriggers` at
`packages/database/src/queries/audit.ts:322`. The trigger lifecycle is
owned by the **TypeScript register** (single owner per substrate-
honesty). Elixir audit writes participate downstream — they insert
rows that the trigger protects from deletion, but Elixir code never
attempts to install or modify the trigger.

Test setup discipline: `scripts/test-db-up.sh` invokes
`apply-audit-triggers.ts` after Prisma schema push; the trigger
exists in `foundation_test` before any test (TS or Elixir) runs.

### 9. DATABASE_URL loading (D-5BII-EXEC-7)

`config/runtime.exs` reads `System.get_env("DATABASE_URL")` for
production + dev. For test, `config/test.exs` hardcodes the local
container URL:
`postgresql://postgres:postgres@localhost:5433/foundation_test`.

Local contributor dev shell-sources `.env` before invoking
`mix run` / `iex -S mix` (standard Elixir pattern; mirrors how Foundation
Node tier loads `.env` via `dotenv` at process start).

CI workflow injects `DATABASE_URL` via the postgres service block (CI
runs `mix test` with `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/foundation_test`).

No `:dotenvy` Hex dep added; minimal dep footprint preserved.

## Consequences

### Easier

- **Cross-language audit-chain verification works** — `verifyAuditChain`
  running in either TypeScript or Elixir produces identical hashes for
  identical canonical inputs; chain integrity is portable across
  language boundaries
- **Postgres source-of-truth survives router restarts** — capsules
  persist across BEAM node restarts; ETS hot-tier rebuilds from
  Postgres on cold start
- **Idempotency-key cache prevents replay side-effects** — duplicate
  `WRITE` / `SHARE` / `REVOKE` requests return cached response without
  re-executing; gRPC clients can safely retry on transient failures
- **Patent-canonical audit semantics extend to Elixir register** — the
  6 BEAM-compatibility patterns (ADR-0026 §5) instantiate Pattern 4
  (event-sourced audit) at substrate-state register; Patterns 3 + 5
  (named workers + idempotent verification keys compound) instantiate
  partially via the Idempotency layer
- **Composed-mode audit + RULE 4 atomic compound** — WRITE/SHARE/REVOKE
  ops fail atomically if audit insert fails, preserving the patent-
  canonical "audit trail is sacred" discipline at Elixir register
- **Translator pattern keeps runtime + persistence concerns separate**
  — Capsule struct stays patent-canonical 7-layer; MemoryCapsule schema
  matches Prisma's 30-field row shape; cleanly separable

### Harder

- **Schema parity discipline** — Prisma + Ecto schemas must match
  field-for-field; manual maintenance until automated parity check
  lands (forward-substrate per §Consequences). Drift risk: Prisma
  adds a column → Ecto schema goes stale → runtime errors at insert
  time. Mitigation: contributor onboarding documents the sync
  discipline; CI integration test surfaces drift via failing schema
  query.
- **Test serialization (RULE 15)** — Elixir + TypeScript tier tests
  share `foundation_test` container; concurrent runs collide. CI
  separates by job; local discipline requires contributor awareness.
  Trade-off accepted: single container is simpler than per-tier
  containers + the cost is bounded.
- **DateTime.truncate(:millisecond) discipline** — every Elixir
  `canonical_record` call must truncate timestamps to milliseconds
  before serialization; missing the truncation produces silent
  hash-divergence. Mitigation: byte-equivalence fixture test
  (`canonical_record_test.exs`) catches drift on every CI run.
- **Two-tier naming cognitive overhead** — `Capsule` (runtime) vs
  `MemoryCapsule` (persistence) requires Elixir contributors to
  internalize the distinction. Mitigation: ADR-0033 §3 + module
  docs make the boundary explicit; Translator module name signals
  the conversion.
- **Migration ownership boundary discipline** — contributors must know
  which tables are Prisma-owned vs Ecto-owned. Single rule:
  "if the table appears in `prisma/schema.prisma`, Prisma owns it."
  Documented at §7 + contributor onboarding.
- **CI Elixir-tier Postgres service adds runtime + cost** — each CI
  run spins up a postgres container for the Elixir tier (mirrors
  TypeScript tier). Trade-off: integration test fidelity vs cycle
  time. Accepted per ADR-0011 + ADR-0013 precedent.
- **Schema parity verification mechanism is forward-substrate** (per
  D-5BII-EXEC-3 Option β). Manual discipline at sub-phase 5b-ii
  landing; mechanical parity check deferred to a future commit. Risk
  acknowledged; mitigation deferred. The aspirational mechanism:
  NEW `scripts/check-schema-parity.exs` reads
  `packages/database/prisma/schema.prisma` (text parse), introspects
  Ecto schemas via `__schema__/1`, asserts column-set + type
  equality. Lands at sub-phase 5b-iii (if needed) or sub-phase 11.

## Alternatives Considered

### Audit-chain reimplementation (vs. byte-equivalent port)

Rejected. A reimplementation could chose different canonicalization
discipline (e.g., a different field-join character, JSON encoding
library that sorts keys differently, timestamp format with timezone
suffix). Each divergence produces hash-divergence at the chain
boundary → cross-language `verifyAuditChain` breaks → audit-of-record
loses tamper-evidence guarantee at the language boundary. Byte-
equivalence is the only acceptable discipline for a multi-language
audit-chain.

### Single-mode audit (composed only, no standalone)

Rejected. The TypeScript register's standalone mode is canonical for
event-sourced patterns where each event is independently meaningful
(e.g., the dual-control middleware's 6-event sequence). Forcing every
audit emission to be composed-mode would either require a no-op
business transaction wrapper (wasteful) OR omit audit writes for
event-sourced patterns (substrate-honesty erosion). Dual-mode preserves
the canonical patterns from both registers.

### Pure-Postgres storage (no ETS hot-tier)

Rejected. The 5b-i ETS substrate provides sub-millisecond read latency
for hot-path COSMP ops. Pure-Postgres would regress that latency by
1-3 orders of magnitude (network round-trip + index lookup + row
fetch). The facade preserves both substrates.

### Pure-ETS storage (no Postgres source-of-truth)

Rejected. Production-grade COSMP requires durable persistence; ETS
loses everything on router restart. The facade gives both: hot-tier
reads + durable writes.

### Idempotency cache in ETS only

Rejected (at this sub-phase). Idempotency-key uniqueness must survive
router restart (otherwise replay-on-restart breaks the discipline).
Postgres-backed `idempotency_keys` table is the canonical answer.
Future ETS hot-tier cache in front of Postgres is permitted (deferred
to sub-phase 6 if benchmarked needed).

### Schema parity via runtime introspection at every test

Rejected. Verifying Prisma → Ecto schema match on every test run
would slow the suite + couple test infrastructure to schema state.
Better: a separate `scripts/check-schema-parity.exs` that runs once
per CI job (or pre-commit) + manual discipline at PR review time.
Deferred to forward-substrate per D-5BII-EXEC-3.

### Ecto-owned shared-table migrations

Rejected. Per ADR-0025 (Schema-Push-Target Discipline), Prisma is the
canonical schema owner for the Foundation `memory_capsules` /
`audit_events` / etc. tables. Ecto migrations against these would
fork the schema-of-record and produce drift between TypeScript +
Elixir code's view of the schema. Strict ownership rule: if Prisma
owns it, Prisma migrates it.

### Hex `:dotenvy` dep for `.env` loading

Rejected. The Foundation Elixir register operates in three modes:

- Local dev: contributor shell-sources `.env` before `mix run` /
  `iex -S mix` (standard Elixir pattern; matches Phoenix dev ergonomics)
- CI: env vars injected by GitHub Actions postgres service block
- Production: env vars injected by deploy substrate (Render, Fly.io,
  k8s, etc.; out of sub-phase scope)

Adding a Hex dep for `.env` loading would expand dep surface for a
problem already solved by shell + CI conventions. Skipped.

## References

### TypeScript register substrate (audit-chain canonical)
- `packages/database/src/queries/audit.ts` — full audit primitive
- `packages/database/prisma/schema.prisma:86-167` — `MemoryCapsule` model
- `packages/database/prisma/schema.prisma:261-283` — `AuditEvent` model
- `packages/auth/src/crypto.ts:94-96` — `sha256Hex` canonical
- `packages/auth/src/crypto-config.ts:77` — `CRYPTO_CONFIG.HASH_ALGORITHM = "sha256"`

### Prior ADRs in lineage
- **ADR-0002** (Append-only audit chain with BEFORE DELETE trigger;
  foundational) — **load-bearing**: this ADR ports the audit-chain
  primitive ADR-0002 canonicalizes
- **ADR-0011** (Three-tier test stratification) — containerized
  Postgres unit-tier discipline
- **ADR-0013** (Containerized Postgres for unit and integration tiers;
  `postgres:16.4-alpine` pin) — **load-bearing**: Elixir tier reuses
  the existing `niov-foundation-test-db` container
- **ADR-0015** (CI Workflow Architecture) — Decision E `postgres:16.4-alpine`
  pin extends to Elixir tier service block
- **ADR-0025** (Schema-Push-Target Discipline) — **load-bearing**:
  Prisma owns shared-table DDL; Ecto reads only for shared tables
- **ADR-0026** (Dual-Control Middleware Pattern + Privileged Endpoint
  Registry + Per-Route Binding Discipline) — **load-bearing**: §5
  BEAM Pattern 4 (event-sourced audit) + Pattern 5 (idempotent
  verification keys) instantiate at this sub-phase
- **ADR-0028** (Forward-Substrate: Elixir/BEAM Coordination Layer for
  Capsule Supervision + OtzarComm + DBGI Integration) — **load-bearing**:
  this ADR is the Phase 2 implementation register fulfilling
  ADR-0028's commitment-to-ship for the persistence + audit-chain
  substrate
- **ADR-0030** (Phase 2 Elixir/BEAM Implementation) — **load-bearing**:
  the 16-sub-phase Block B mini-arc ports ADR-0030 §Decision; this ADR
  lands at sub-phase 5b-ii of that arc per Q-R split
- **ADR-0031** (BEAM Routing Substrate Architecture) — **load-bearing**:
  Q-D explicitly forward-queued the idempotency strategy to sub-phase
  5b-ii / 6; this ADR resolves Q-D
- **ADR-0032** (BEAM gRPC Interop Architecture) — **load-bearing**: the
  5a register decision substrate this ADR's 5b-ii instantiation extends

### Operational substrate
- `niov-foundation-test-db` Docker container (running via Colima per
  ADR-0013) — host port 5433, container port 5432, database
  `foundation_test`, all 38 Prisma tables present
- `scripts/test-db-up.sh` / `scripts/prisma-db-push-test.sh` /
  `scripts/test-db-push-wrapper.sh` — TS-tier test DB lifecycle scripts
  (Elixir tier reuses)
- `scripts/apply-audit-triggers.ts` — installs the `audit_events`
  BEFORE DELETE trigger (TypeScript register owns per ADR-0002 +
  D-5BII-EXEC-6)

### Patent substrate
- US 12,517,919 (COSMP Protocol) — patent-canonical 7-layer Capsule
  structure preserved at runtime via `CosmpRouter.Capsule` struct;
  Translator pattern keeps the patent-canonical surface intact at
  the persistence boundary
- US 12,164,537 + US 12,399,904 (DMW + Foundation primitives) —
  audit-chain cryptographic substrate canonical at this register

## Bidirectional citations (cited from)

- ADR-0002 (Append-only audit chain) — Decision §SHA-256 hash chain
  forward-cites this ADR for the Elixir-register port + cross-language
  byte-equivalence discipline
- ADR-0011 + ADR-0013 (Three-tier test stratification + Containerized
  Postgres) — extension to Elixir tier; this ADR documents the
  shared-container substrate
- ADR-0025 (Schema-Push-Target Discipline) — extension to Elixir
  Ecto register; this ADR documents the migration ownership boundary
- ADR-0026 (Dual-Control Middleware Pattern) — §5 Pattern 4 + Pattern 5
  forward-cite this ADR as the Pattern 4 instantiation register at
  sub-phase 5b-ii
- ADR-0028 (Forward-Substrate: Elixir/BEAM Coordination Layer) —
  Forward Queue line for "BEAM Persistence + Idempotency Architecture"
  resolves to this ADR
- ADR-0030 (Phase 2 Elixir/BEAM Implementation) — §Forward path
  sub-phase 5b-ii row forward-cites this ADR as the decision substrate
- ADR-0031 (BEAM Routing Substrate Architecture) — Q-D forward-queue
  resolves to this ADR; idempotency strategy + audit-chain integration
  documented here
- ADR-0032 (BEAM gRPC Interop Architecture) — sub-phase 5b row split
  per Q-R places persistence at 5b-ii; this ADR is the 5b-ii decision
  substrate

## Forward path

| Sub-phase | Subject | This ADR's instantiation |
|-----------|---------|---------------------------|
| 5b-ii | `[BEAM-COSMP-INTEROP-PERSISTENCE]` (this commit) | Repo + schemas + Translator + Audit primitive + Storage facade + Idempotency layer + ADR-0033 land |
| 6 | `[BEAM-COSMP-INTEGRATION-TESTS]` | End-to-end COSMP op flow tests against live Postgres + audit-chain verification across language boundary; ADR-0026 §5 Patterns 3 + 5 fully instantiated |
| 7-10 | DBGI sub-phases | Sibling DBGI substrate; this ADR's audit primitive likely reused for DBGI audit emissions |
| 11 | `[BEAM-OBSERVABILITY]` | `:telemetry_metrics` for Repo query latency + audit-chain verification metrics |
| 12 | `[BEAM-CANONICAL-RECORD]` | `beam-coordination-canonical-record.md` documents this ADR's Translator pattern + dual-mode audit operationally |
| 13 | `[BEAM-ARC-CLOSURE]` | Onboarding cascade + section-12-progress.md row 35 + ADR-0028 forward → landed; ADR-0033 substrate-honest discipline lessons fold into engineer onboarding doc |

**Forward-substrate items deferred from this ADR:**

- **Schema parity verification mechanism** (D-5BII-EXEC-3 Option β) —
  forward-queued. NEW `scripts/check-schema-parity.exs` lands at sub-phase
  5b-iii (if Q-A surfaces) OR sub-phase 11.
- **Idempotency hot-tier ETS cache in front of Postgres `idempotency_keys`** —
  forward-queued to sub-phase 6 (if benchmark surfaces Postgres lookup
  latency as bottleneck).
- **Production-deploy migration discipline** for Elixir-owned tables —
  forward-queued to sub-phase 11+ (release substrate).
- **Audit-chain verification CLI tool** (Elixir-side `mix audit.verify
  --chain-key=...`) — forward-queued; MVP at this sub-phase is the
  test-tier `verify_audit_chain/1` function only.
