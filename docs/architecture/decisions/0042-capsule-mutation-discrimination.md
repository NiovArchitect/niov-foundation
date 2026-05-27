# ADR-0042 — Capsule Mutation Discrimination (ADD / UPDATE / MERGE / NOOP)

## Status

Accepted 2026-05-17 at sub-arc 2 Gap 1 G1.6 `[BEAM-CAPSULE-MUTATION-DISCRIMINATION-CLOSURE]` (G1 mini-arc Commits 1-6 LANDED; Gap 1 CLOSED at canonical-state register substantively; Sub-arc 2 remains IN FLIGHT per ADR-0041 CL.1 scope patch substantively)

**G1.1 scope at canonical-prose register substantively:** this ADR LOCKS the Gap 1 mutation-discrimination architecture for the MemoryCapsule write path. G1.1 is the docs-only architectural-lock commit. G1.1 does NOT close Gap 1 at canonical-state register substantively. G1.1 does NOT close Sub-arc 2 at canonical-state register substantively. Gap 1 closure requires G1.2 `[CAPSULE-MUTATION-PRISMA-MIGRATION]` (substantive Prisma migration + audit-literal generation/migration discipline) + G1.3 `[CAPSULE-MUTATION-WRITE-SERVICE]` (substantive discriminateMutation helper + ADD/UPDATE/MERGE/NOOP write semantics + expected_version) + conditional G1.4 `[CAPSULE-MUTATION-ELIXIR-AUDIT]` (substantive Elixir audit/canonical/idempotency support if G1.4 pre-flight grep proves substantive Elixir change needed) + G1.5 `[CAPSULE-MUTATION-TESTS]` (substantive TypeScript unit/integration + cross-language canonical_record + audit/idempotency tests) + G1.6 `[BEAM-CAPSULE-MUTATION-DISCRIMINATION-CLOSURE]` (docs-only closure cascade) per §Sub-decision Q-μ. Sub-arc 2 closure requires all per-gap mini-arcs (G1 + G3 + G4 + G5 + optional G6) and a later Sub-arc 2 closure cascade per ADR-0041 CL.1 scope patch.

## Context

The MemoryCapsule write path at `apps/api/src/services/cosmp/write.service.ts` currently exposes two operations to callers — `createCapsule` at L257 and `updateCapsule` at L420 — with a shared content-encryption helper `processContentForStorage` at L200 invoked from `createCapsule` at L332. Current audit-event emission at the write path is undifferentiated at the mutation-class register substantively: `createCapsule` emits the literal `"CAPSULE_CREATED"` at L379-380 unconditionally, and `updateCapsule` emits the literal `"CAPSULE_UPDATED"` at L672-673 unconditionally, with a shared `writeAuditEventForCapsule` helper at L765 typed `eventType: "CAPSULE_CREATED" | "CAPSULE_UPDATED"`. The MemoryCapsule row carries `version Int @default(1)` at `schema.prisma:100`, `previous_version Int?` at L156, and `content_hash String` at L130 — these substrate-state anchors exist but the write path does not currently discriminate write-class beyond CREATE/UPDATE. Idempotent re-submissions, partial-field merges, and substantive content replacements are all collapsed into one of the two literals at the audit tier substantively.

The full existing `AUDIT_EVENT_TYPE_VALUES` set at `packages/database/src/queries/audit.ts:104` contains 36 literals substantively, of which 5 are capsule-class: `CAPSULE_CREATED`, `CAPSULE_METADATA_READ`, `CAPSULE_CONTENT_READ`, `CAPSULE_UPDATED`, `CAPSULE_DELETED`. The substrate does not currently include any generic write-class literal that would predate the discriminated set, nor any literal that discriminates ADD / UPDATE / MERGE / NOOP semantics. The Elixir audit substrate at `apps/cosmp_router/lib/cosmp_router/operations.ex:84/109/134/268` emits distinct COSMP-tier event_types (`COSMP_AUTHENTICATE`, `COSMP_NEGOTIATE`, `COSMP_READ`, `COSMP_AUDIT`) at the protocol register substantively but does not emit capsule-mutation-class literals at the storage register substantively; the existing capsule-mutation audit emission is exclusively at the TypeScript register substantively per the write.service.ts substrate-state ground truth.

Gap 1 of the ADR-0041 Capsule Layer Substrate Umbrella canonical at CL.1 register substantively identifies this undifferentiated-mutation substrate as a patent-implementation-core gap per US 12,517,919 (COSMP) + US 12,164,537 + US 12,399,904 (DMW): a capsule write that touches a human entity's revocable permission boundary needs explicit semantic discrimination so the audit trail per RULE 4 + the cryptographic hash chain per ADR-0002 + the human-sovereign governance trail per RULE 0 each carry the explicit class of mutation that occurred. Without that discrimination, downstream consumers cannot distinguish a legitimate UPDATE from a deduplicated re-submission, cannot detect optimistic-concurrency conflicts between concurrent writers, and cannot recognize when a partial-field MERGE preserved more of the prior capsule than an UPDATE would have. The undifferentiated state is also a forward-substrate blocker for ADR-0044 lazy-at-read decay (which needs to know whether a capsule's last write was substantive or NOOP) and ADR-0045 capsule-level staleness detection (which needs explicit mutation-class signal).

RULE 0 governance is explicit at this gap canonical at canonical-rule register substantively per CLAUDE.md L134: "No AI agent, robot, device, or application can access a human entity data without that human explicit revocable permission. This is enforced cryptographically — not by policy." The capsule layer is the substrate where human-entity intelligence lives. Mutation discrimination governs write semantics touching the revocable-permission boundary that RULE 0 protects cryptographically. A NOOP audit emission preserves traceability of every write attempt against a human-sovereign data boundary, even when the attempt produces zero substrate change — that traceability is itself part of the cryptographic enforcement RULE 0 mandates. AI-entity writers per RULE 0's "AI entities have lower default permission ceilings than humans" clause inherit this discrimination at the same audit-trail register; AI_AGENT EntityType-discriminated capsule routing (the question of whether AI-authored capsules require additional gating beyond ADD/UPDATE/MERGE/NOOP discrimination) is deferred to optional ADR-0046 per ADR-0041 §Sub-decision 6 and §Sub-decision Q-κ below.

G1.0 RULE 21 pre-authorization research arc was performed at the operator-tier register substantively before Founder Q-α through Q-ν Q-locks landed at `[BEAM-CAPSULE-MUTATION-QLOCK]`. The research arc covered five canonical-knowledge axes: (1) NIOV-domain mutation taxonomies vs. generic CRUD discrimination (ADD/UPDATE/MERGE/NOOP versus the generic INSERT/UPDATE/UPSERT/NOOP CRUD set — the NIOV-domain set carries human-sovereign semantic weight at the capsule-mutation register substantively that the generic UPSERT collapses); (2) Optimistic-concurrency-control idioms in distributed systems (Bernstein-Hadzilacos-Goodman *Concurrency Control and Recovery in Database Systems* §4.2; HTTP If-Match / ETag canonical at RFC 7232 §3.1; the expected_version + CAPSULE_VERSION_CONFLICT error-envelope pattern is the protocol-tier idiomatic equivalent); (3) Content-hash-as-discriminator patterns in event-sourcing literature (Fowler *Event Sourcing* + Greg Young CQRS canonical; content_hash alone is insufficient because two writes with identical content but different intent must be distinguishable at audit-trail register; hence the split-discriminator strategy at §Sub-decision Q-ε); (4) Cross-language data-ownership boundaries for shared schema (ADR-0033 cross-language data ownership canonical; Prisma owns the MemoryCapsule + AuditEvent + MutationType DDL at the TypeScript register substantively; Elixir reads via the existing `CosmpRouter.MemoryCapsule` Ecto schema mirror pattern); (5) Audit-event literal extension discipline per RULE 10 + ADR-0002 (the existing 36 literals at AUDIT_EVENT_TYPE_VALUES are preserved untouched; 4 NEW literals append-only at canonical-state register substantively per RULE 10 nothing-is-ever-deleted; the BEFORE DELETE trigger at the database tier per ADR-0002 enforces this for audit_events specifically).

## Decision

Adopt explicit mutation-class discrimination for the MemoryCapsule write path via a Prisma-owned `MutationType` enum (ADD / UPDATE / MERGE / NOOP) projected through the write.service.ts discrimination boundary, persisted on the MemoryCapsule row as a nullable `mutation_type MutationType?` column starting in G1.2, audited at the AuditEvent tier via 4 NEW append-only `CAPSULE_MUTATION_*` literals extending the existing 36-literal set, and governed by a split-discriminator strategy (content_hash + canonical_record + version/expected_version) at the TypeScript canonical register substantively with Elixir audit/canonical primitives operating in support/verification role per ADR-0033 cross-language data-ownership precedent.

### Sub-decision Q-α — MutationType enum location: Prisma-owned (TypeScript canonical register)

Per Founder Q-α LOCKED Option α: the `MutationType` enum is defined in `packages/database/prisma/schema.prisma` at the TypeScript canonical register substantively, owned by Prisma per the cross-language data-ownership boundary canonical at ADR-0033 §Schema Ownership. Elixir reads MutationType values via the existing `CosmpRouter.MemoryCapsule` Ecto schema mirror pattern canonical at ADR-0033; no Ecto-owned migration creates the enum at the Elixir register. Rationale: shared-schema DDL ownership rests with Prisma per ADR-0025 schema-push-target discipline; Ecto owns only Elixir-internal DDL (e.g., the `idempotency_keys` table per ADR-0033 §Sub-decision 5b-ii Option β hybrid). The MutationType enum is a shared-schema concept consumed by both registers; Prisma-canonical ownership prevents the dual-DDL-ownership anti-pattern that ADR-0033 codifies. The Elixir register substantively consumes MutationType values as strings at the canonical_record/1 byte-equivalence boundary per §Sub-decision Q-ζ below.

### Sub-decision Q-β — MutationType field: nullable `mutation_type MutationType?` on MemoryCapsule

Per Founder Q-β LOCKED Option α: the MemoryCapsule schema is extended with `mutation_type MutationType?` (nullable) starting in G1.2 substantive migration. G1.1 LOCKS the column shape at the architectural register substantively but does NOT fire the migration. Rationale: nullable column tolerates pre-G1.2 historical rows that lack mutation_type without backfill churn; backfill is mentioned as a possible implementation detail inside G1.2 or G1.3 only if later preflight proves it necessary per Sub-decision Q-μ (it is not a separately committed G1.x). The column is positioned in the MemoryCapsule schema adjacent to `version` + `previous_version` + `content_hash` (currently at schema.prisma L100/156/130) to colocate mutation-anchor substrate at canonical-prose register substantively. G1.2 substantive migration applies the column addition per ADR-0025 schema-push-target discipline; the addition is backward-compatible per Prisma migration semantics (NULL default for existing rows; ALTER TABLE ADD COLUMN with no default fires fast).

### Sub-decision Q-γ — Audit event literal disposition: 4 NEW append-only CAPSULE_MUTATION_* literals (Disposition Q-γ.1 clean-transition LOCKED)

Per Founder Q-γ LOCKED at `[BEAM-CAPSULE-MUTATION-QLOCK]` + Founder Q-γ.1 LOCKED at `[BEAM-CAPSULE-MUTATION-G1.1-QGAMMA-FINAL-AUTH]`: the `AUDIT_EVENT_TYPE_VALUES` set at `packages/database/src/queries/audit.ts:104` is extended with 4 NEW literals substantively in G1.2 (Prisma migration commit per Sub-decision Q-μ; the Prisma migration commit carries the audit-literal generation/migration discipline per Founder G1.2 scope): `CAPSULE_MUTATION_ADD`, `CAPSULE_MUTATION_UPDATE`, `CAPSULE_MUTATION_MERGE`, `CAPSULE_MUTATION_NOOP`. The existing 36 literals at AUDIT_EVENT_TYPE_VALUES substantively are preserved untouched per RULE 10 nothing-is-ever-deleted + ADR-0002 append-only audit chain + the BEFORE DELETE trigger physical enforcement at the database tier per ADR-0002. The capsule-class subset of the existing 36 literals (`CAPSULE_CREATED`, `CAPSULE_METADATA_READ`, `CAPSULE_CONTENT_READ`, `CAPSULE_UPDATED`, `CAPSULE_DELETED`) is fully preserved at the literal-set register substantively per substrate-state ground truth grep at G1.0 research-arc register substantively (no generic write-class literal predates the discriminated set in the substrate). The `isKnownAuditEventType` discriminator at audit.ts:147 is extended in G1.2 to recognize the 4 NEW literals at the canonical-state register substantively.

Disposition Q-γ.1 (clean-transition; LOCKED at `[BEAM-CAPSULE-MUTATION-G1.1-QGAMMA-FINAL-AUTH]`): G1.3 transitions write.service.ts emission. `createCapsule` at L257 transitions audit emission at L379-380 from `"CAPSULE_CREATED"` to `"CAPSULE_MUTATION_ADD"`. `updateCapsule` at L420 transitions audit emission at L672-673 from `"CAPSULE_UPDATED"` to one of `"CAPSULE_MUTATION_UPDATE"` / `"CAPSULE_MUTATION_MERGE"` / `"CAPSULE_MUTATION_NOOP"` per the discriminateMutation result per Sub-decision Q-ε. The `writeAuditEventForCapsule` helper at L765 is widened from `eventType: "CAPSULE_CREATED" | "CAPSULE_UPDATED"` to `eventType: "CAPSULE_MUTATION_ADD" | "CAPSULE_MUTATION_UPDATE" | "CAPSULE_MUTATION_MERGE" | "CAPSULE_MUTATION_NOOP"`. Existing CAPSULE_CREATED and CAPSULE_UPDATED literals remain recognized by isKnownAuditEventType for historical-row queryability per RULE 10; historical audit_events rows are not migrated. Rationale: cleanest mutation-class discrimination at the audit register substantively; lowest audit-volume cost at hive-scale register per ADR-0039; preserves substrate-coherent register substantively for write-class semantics. Dual-emission alternative was Founder-rejected at `[BEAM-CAPSULE-MUTATION-G1.1-QGAMMA-FINAL-AUTH]` because it doubles audit row volume at hive scale; if a later preflight proves backward-compat consumers require dual-emission, Founder re-authorization fires at that register substantively.

### Sub-decision Q-δ — NOOP audit emission: audit-only, zero MemoryCapsule write, zero version increment

Per Founder Q-δ LOCKED Option α: when the split-discriminator at Sub-decision Q-ε resolves MutationType = NOOP, the write.service.ts boundary substantively emits an `CAPSULE_MUTATION_NOOP` audit event canonical at AuditEvent register substantively and returns to the caller with a NOOP indicator in the response shape, but performs zero MemoryCapsule row update (no UPDATE statement fires) and zero version increment (the MemoryCapsule.version remains at its pre-call value substantively). Rationale: NOOP recognition is a substantive value-add at the human-sovereign boundary RULE 0 protects — every write attempt against a human-sovereign data boundary deserves audit traceability per RULE 4, but a NOOP that produces zero substrate change does not warrant version-monotonicity churn (which would force every read-after-NOOP into a cache miss at the COE retrieval substrate canonical at ADR-0022). The audit-only semantics preserve traceability without imposing the substrate-state cost of phantom writes. The NOOP indicator in the response shape allows clients to surface deduplication-occurred signal to their own users when appropriate (a deduplication-occurred signal is itself information the data subject may wish to see per RULE 0).

### Sub-decision Q-ε — Primary discriminator: content_hash + canonical_record + version/expected_version (split-discriminator)

Per Founder Q-ε LOCKED Option α: mutation discrimination at the write.service.ts boundary uses a three-input split-discriminator strategy substantively. (1) `content_hash` (currently SHA-256 over canonical content body per `schema.prisma:130`) detects byte-identical content. (2) `canonical_record` (the 14-field byte-equivalent projection per ADR-0033 §Sub-decision 5b-ii canonical_record/1 substantively extended at the TypeScript register substantively per Sub-decision Q-ζ below) detects byte-identical mutation-relevant field projection beyond content alone (e.g., a TAR field change that doesn't change content body is still a substantive mutation). (3) `version` + `expected_version` (the optimistic-concurrency pair per Sub-decision Q-η) detects concurrent-writer conflicts at the version-monotonicity register substantively. The three inputs combine substantively to produce the MutationType output: ADD when no prior capsule exists at this capsule_id; UPDATE when prior capsule exists and content_hash differs and canonical_record differs; MERGE when prior capsule exists and content_hash matches but canonical_record differs (signals partial-field write that preserved content body); NOOP when prior capsule exists and content_hash matches and canonical_record matches and version equals expected_version (signals idempotent re-submission). Rationale: content_hash alone is insufficient because two writes with identical content but different intent must be distinguishable; canonical_record alone is insufficient because the byte-equivalence projection is computationally heavier than a content_hash short-circuit; version/expected_version alone is insufficient because optimistic-concurrency tracks who-wrote-last but not what-was-written. The split-discriminator strategy is the substrate-coherent register substantively for full mutation-class resolution.

### Sub-decision Q-ζ — TS-side canonical record: TS-canonical port; Elixir audit/canonical_record in support/verification role

Per Founder Q-ζ LOCKED Option α: the TypeScript register substantively becomes the canonical-execution register for canonical_record/1 substantively in G1.3, ported from the existing Elixir audit.ex:146 canonical_record/1 substrate per ADR-0033 §Sub-decision 5b-ii byte-equivalence discipline. The TS port matches the Elixir 14-field projection byte-for-byte; the existing 10 fixture pairs per ADR-0033 are extended with mutation-class fixtures in G1.5 (dedicated tests commit) to verify cross-language byte-equivalence remains intact under the new MutationType discriminator field. The Elixir audit.ex substrate retains its existing canonical_record/1 + canonical_json/1 + sha256_hex/1 + write_audit_event/1 + write_audit_event/3 Ecto.Multi substantively at audit.ex:116/146/185/252/272 — its role at the canonical-execution register substantively transitions from primary-engine to verification-engine for the mutation-class register substantively. The `write_or_replay/6` idempotency wrapper at operations.ex:292 retains its existing role unchanged. Rationale: the TypeScript register substantively is where the write.service.ts discrimination boundary lives; co-locating the canonical_record/1 substantively at the same register preserves substrate-coherence per the ADR-0033 cross-language data-ownership precedent. The Elixir register retains verification authority — every write substantively produces a TS-side canonical_record that the Elixir audit substrate verifies for byte-equivalence at the cross-language CI gate canonical at ADR-0033. The support-role-only framing per Sub-decision Q-ι below prevents dual-engine drift where TS and Elixir compete for canonical-execution authority on the same substrate.

### Sub-decision Q-η — Optimistic concurrency: optional expected_version + CAPSULE_VERSION_CONFLICT envelope

Per Founder Q-η LOCKED Option α: callers MAY supply `expected_version: number | null` to createCapsule / updateCapsule at the write.service.ts boundary substantively per `apps/api/src/services/cosmp/write.service.ts:257` + L420 input-shape extension in G1.3. When expected_version is supplied and does not match the current MemoryCapsule.version at the substrate-state register substantively, the write fails with a `CAPSULE_VERSION_CONFLICT` error envelope (Fastify-tier response 409 Conflict at the route boundary; service-tier throws a typed error per the existing error-envelope discipline at write.service.ts substantively). When expected_version is null or omitted, the write proceeds with last-writer-wins semantics at version+1 monotonic increment (preserves the pre-G1.3 behavior for callers that don't opt into optimistic concurrency). Rationale: HTTP If-Match / ETag canonical at RFC 7232 §3.1 is the protocol-tier idiomatic equivalent of optimistic concurrency; opting-in preserves backward compatibility with callers that don't have a concurrency-control register substantively; the CAPSULE_VERSION_CONFLICT envelope name is the NIOV-domain canonical form (not a generic 409, not a generic OPTIMISTIC_CONCURRENCY_FAILURE — the envelope name carries the capsule-domain context the error consumer needs).

### Sub-decision Q-θ — Mutation discrimination location: write.service.ts boundary at discriminateMutation helper

Per Founder Q-θ LOCKED Option α: the mutation discrimination logic lands at the write.service.ts boundary substantively in G1.3, implemented as a `discriminateMutation` helper invoked from `createCapsule` at L257 and `updateCapsule` at L420. The `discriminateMutation` helper consumes (1) the proposed write input (content + TAR fields + capsule_id), (2) the current MemoryCapsule row state at the substrate-state register substantively (read inside the write.service.ts call via the existing Prisma client substantively), (3) the optional expected_version per Sub-decision Q-η, and produces (a) the MutationType output per the Sub-decision Q-ε split-discriminator strategy, (b) the resolved content_hash + canonical_record substantively, (c) the version + previous_version pair to apply (no-op when MutationType = NOOP). The existing `processContentForStorage` helper at L200 (the exact substrate-state name per RULE 13 ground-truth surface; NOT a generic content-processing name) is preserved untouched at G1.3 and remains the encryption-only helper invoked by `createCapsule` at L332. The new `discriminateMutation` helper is positioned at the write.service.ts module-level register substantively adjacent to `processContentForStorage` to colocate write-path helpers at canonical-prose register substantively. Rationale: the write.service.ts boundary is the existing single-source-of-truth for MemoryCapsule writes at the TypeScript register substantively; positioning the discrimination logic at this boundary preserves the substrate-coherent register substantively for write-path semantics and avoids cross-service drift between routes-tier callers and the canonical write substrate. The processContentForStorage name preservation per RULE 13 ground-truth surface is essential because the prior G1.0 research-arc paste contained a shortened conceptual name which does not match substrate; renaming the substrate to match a shortened conceptual name would invert the cost-benefit and violate RULE 1 build-forward-only.

### Sub-decision Q-ι — Elixir role: support/verification only; no primary mutation-engine authority

Per Founder Q-ι LOCKED Option α: the Elixir audit/canonical_record/idempotency substrate at `apps/cosmp_router/lib/cosmp_router/audit.ex` + `apps/cosmp_router/lib/cosmp_router/operations.ex` operates in support/verification role only at the capsule-mutation register substantively. The existing audit.ex primitives (sha256_hex/1 + canonical_record/1 + canonical_json/1 + write_audit_event/1 + write_audit_event/3 Ecto.Multi at L116/146/185/252/272) and operations.ex write_or_replay/6 idempotency wrapper at L292 retain their existing roles unchanged. G1.4 is CONDITIONAL: Elixir audit/canonical/idempotency support substrate substantively fires only if grep at G1.4 pre-flight proves the Elixir substrate requires substantive change to support the MutationType discriminator at the canonical_record/1 field-projection register substantively (e.g., the 14-field projection requires a 15th field for MutationType, or the Ecto.Multi composition requires a new clause for NOOP semantics). Default disposition: SKIP G1.4 — Elixir substrate consumes MutationType as a string at the canonical_record/1 byte-equivalence boundary substantively without substantive Elixir code change per the Q-ζ TS-canonical-port discipline. Rationale: TS-canonical canonical_record port per Sub-decision Q-ζ + cross-language data ownership per ADR-0033 imply Elixir support-role default substantively; substantive Elixir change is the exception, not the rule, and warrants explicit grep-grounded pre-flight justification at G1.4 substantively.

### Sub-decision Q-κ — AI_AGENT disposition: deferred to optional ADR-0046

Per Founder Q-κ LOCKED Option α: AI_AGENT EntityType-discriminated routing of capsule operations (the question of whether AI-authored capsules require additional gating beyond the ADD/UPDATE/MERGE/NOOP discrimination — e.g., AI-authored MERGE requires additional human-attestation per RULE 0 "AI entities have lower default permission ceilings than humans") is deferred to optional ADR-0046 per ADR-0041 §Sub-decision 6 forward-substrate. Gap 1 substantively applies the ADD/UPDATE/MERGE/NOOP discrimination uniformly across EntityType at G1.3 register substantively; AI_AGENT-specific gating is a forward-substrate enrichment that does not block Gap 1 closure. Rationale: AI_AGENT routing per ADR-0039 Amendment 1 + ADR-0033 cross-language data ownership canonical at canonical-coherence register substantively maintains AI_AGENT at PERSONAL wallet_type at storage/economic tier; the capsule-layer AI_AGENT discrimination question canonical at this register substantively is whether the *write semantics* differ from human-authored writes, not whether the *storage tier* differs. The optional ADR-0046 register substantively will resolve this question with its own Q-lock disposition framework substantively; deferring it from Gap 1 preserves the substrate-honest scoping discipline canonical at ADR-0029 + ADR-0035.

### Sub-decision Q-λ — RULE 0 governance: explicit at every mutation-discrimination decision

Per Founder Q-λ LOCKED Option α + Founder RULE 0 continuity patch substantively: RULE 0 (Humans Are Always Sovereign) is the governance register substantively that authorizes every mutation-discrimination decision at this ADR. The discriminated audit-event literals at Sub-decision Q-γ preserve traceability of every write attempt against a human-sovereign data boundary per RULE 0 cryptographic-enforcement clause + RULE 4 audit-trail-is-sacred clause. The NOOP audit emission at Sub-decision Q-δ preserves traceability even when the substrate state does not change — this is the substrate-coherent register substantively for human-sovereign accountability. The optimistic-concurrency CAPSULE_VERSION_CONFLICT envelope at Sub-decision Q-η protects human-sovereign writes against silent overwrites by concurrent AI-entity writers. The AI_AGENT discrimination question deferred at Sub-decision Q-κ is itself a RULE 0 governance question (AI entities have lower default permission ceilings; whether that ceiling manifests at the mutation-class register or only at the permission-grant register is the optional ADR-0046 question). RULE 0 governance is not a separate enforcement layer at this ADR — it is the substrate-state authorization framework substantively that every sub-decision at this ADR operationalizes substantively.

### Sub-decision Q-μ — G1 mini-arc decomposition: 6 commits with conditional G1.4

Per Founder Q-μ LOCKED at `[BEAM-CAPSULE-MUTATION-QLOCK]`: the Gap 1 mini-arc decomposes into 6 commits substantively at the substrate-build register substantively.

- **G1.1** `[BEAM-CAPSULE-MUTATION-DISCRIMINATION-ADR]` — docs-only ADR-0042 NEW + section-12-progress.md Sub-arc 2 row UPDATE with Gap 1 IN FLIGHT prose + CURRENT_BUILD_STATE.md NEW Gap 1 H3 subsection under Sub-arc 2 IN FLIGHT H2 + architecture/README.md ADR-0042 catalog entry + CLAUDE.md ADR-0042 catalog entry. G1.1 LOCKS architecture only at canonical-prose register substantively; G1.1 does NOT close Gap 1 at canonical-state register substantively; G1.1 does NOT close Sub-arc 2 at canonical-state register substantively.

- **G1.2** `[CAPSULE-MUTATION-PRISMA-MIGRATION]` — substantive Prisma migration adding `MutationType` enum (ADD/UPDATE/MERGE/NOOP) + `mutation_type MutationType?` nullable column on MemoryCapsule per Sub-decision Q-β + audit-literal generation/migration discipline substantively (the 4 NEW CAPSULE_MUTATION_* literals appended to AUDIT_EVENT_TYPE_VALUES at `packages/database/src/queries/audit.ts:104` + AuditEventType union extension at audit.ts:24 + isKnownAuditEventType extension at audit.ts:147). Includes NEW migration file at `packages/database/prisma/migrations/`. Backward-compatible per Prisma migration semantics (nullable column; NULL default for existing rows). Schema-push discipline per ADR-0025. If later preflight at G1.2 surfaces a substantive need for historical-row backfill, the backfill may be included as an implementation detail inside G1.2 substantively per Sub-decision Q-μ (backfill is not a separately committed G1.x).

- **G1.3** `[CAPSULE-MUTATION-WRITE-SERVICE]` — substantive `discriminateMutation` helper at write.service.ts adjacent to `processContentForStorage` at L200 + ADD/UPDATE/MERGE/NOOP write semantics integrated into createCapsule at L257 + updateCapsule at L420 + optional `expected_version: number | null` input + CAPSULE_VERSION_CONFLICT typed error envelope per Sub-decision Q-η + transition write.service.ts audit emission from `CAPSULE_CREATED`/`CAPSULE_UPDATED` to discriminated `CAPSULE_MUTATION_*` per Sub-decision Q-γ Disposition Q-γ.1 LOCKED + TS-canonical canonical_record port per Sub-decision Q-ζ + widen writeAuditEventForCapsule helper signature at L765. If later preflight at G1.3 surfaces a substantive need for historical-row backfill, the backfill may be included as an implementation detail inside G1.3 substantively per Sub-decision Q-μ.

- **G1.4** (CONDITIONAL) `[CAPSULE-MUTATION-ELIXIR-AUDIT]` — substantive Elixir audit/canonical/idempotency support substantively. CONDITION: only fires if grep at G1.4 pre-flight register substantively proves the Elixir substrate requires substantive change to support MutationType discriminator at canonical_record/1 field-projection register substantively per Sub-decision Q-ι default disposition (SKIP). If fires, includes substantive Elixir audit.ex + operations.ex extension at canonical_record/1 field register substantively + Ecto.Multi composition update if NOOP semantics require it.

- **G1.5** `[CAPSULE-MUTATION-TESTS]` — substantive TypeScript unit tests at `tests/unit/cosmp/write.test.ts` covering ADD/UPDATE/MERGE/NOOP discrimination + optimistic-concurrency CAPSULE_VERSION_CONFLICT + audit-literal emission verification + cross-language canonical_record byte-equivalence fixture extension at `apps/cosmp_router/test/cosmp_router/audit/canonical_record_test.exs` (extends the existing 10 fixture pairs per ADR-0033 to cover mutation-class byte-equivalence across the 4 MutationType values) + idempotency_test.exs extension at `apps/cosmp_router/test/cosmp_router/idempotency_test.exs` verifying NOOP idempotency preserved through write_or_replay/6 wrapper substantively + integration tests if substantive integration-tier verification is warranted.

- **G1.6** `[BEAM-CAPSULE-MUTATION-DISCRIMINATION-CLOSURE]` — docs-only closure cascade. ADR-0042 Status Proposed → Accepted + Post-Closure Implementation Lineage subsection + section-12-progress.md Sub-arc 2 row Gap 1 IN FLIGHT → CLOSED + CURRENT_BUILD_STATE.md Gap 1 H3 closure prose + ADR-0041 Sub-arc 2 status amendment if all per-gap mini-arcs CLOSED (otherwise UNCHANGED awaiting G3/G4/G5 + optional G6) + architecture/README.md + CLAUDE.md ADR-0042 catalog refresh Proposed → Accepted + ADR-0035 §9 NO promotion (unless substrate-build observations surface across G1.2-G1.5 that warrant cluster expansion).

### Sub-decision Q-ν — Tag prefix: mixed BEAM/CAPSULE

Per Founder Q-ν LOCKED Option α: mixed BEAM/CAPSULE prefixes substantively. BEAM prefix for ADR + closure commits (G1.1 + G1.6) per the Sub-arc 1 sub-phase d precedent canonical at ADR-0040 §Post-Closure Implementation Lineage. CAPSULE prefix for substantive code commits (G1.2 + G1.3 + conditional G1.4 + G1.5) per the substrate-domain-prefix discipline at canonical-prose register substantively. The mixed prefix discipline signals the substrate-domain at the commit-subject register substantively without forcing all commits into a single prefix.

## Consequences

### Easier

Cross-cutting downstream consumers of MemoryCapsule writes (COE retrieval scoring per ADR-0022; capsule-level staleness detection forward-substrate per ADR-0045; decay execution forward-substrate per ADR-0044) gain explicit MutationType discriminator substantively at the substrate-state register substantively without consumer-side inference logic. Audit-trail consumers (compliance review per `docs/COMPLIANCE_ARCHITECTURE_REVIEW.md`; the writeAuditEvent canonical at canonical-execution register substantively) gain discriminated mutation-class literals at the AuditEvent register substantively, enabling per-class audit queries (e.g., "all NOOP attempts against capsule_id X in the last 24 hours") that the legacy undifferentiated CAPSULE_CREATED + CAPSULE_UPDATED literals previously collapsed. Optimistic-concurrency callers gain CAPSULE_VERSION_CONFLICT detection at the write.service.ts boundary substantively, eliminating silent overwrites by concurrent writers. NOOP recognition gains substrate-coherent traceability per RULE 0 + RULE 4 without phantom version-monotonicity churn. Cross-language canonical_record byte-equivalence per ADR-0033 gains explicit MutationType field, preserving the CI-gate verification register substantively that the cross-language port discipline depends on.

### Harder

The write.service.ts surface gains the `discriminateMutation` helper substantively at G1.3 register substantively, increasing the module-level surface area by one helper (modest; positioned adjacent to existing `processContentForStorage` helper at L200 to preserve substrate-coherent colocation). Callers that previously relied on the undifferentiated CAPSULE_CREATED + CAPSULE_UPDATED audit literals must adapt their audit-query logic to recognize the 4 NEW CAPSULE_MUTATION_* literals (modest; the existing CAPSULE_CREATED + CAPSULE_UPDATED literals remain recognized at `isKnownAuditEventType` substantively for historical-row queryability per RULE 10). The TS-canonical canonical_record port per Sub-decision Q-ζ substantively requires byte-equivalence with the Elixir audit.ex:146 canonical_record/1 substantively — any drift between TS and Elixir port surfaces immediately at the CI gate per ADR-0033 cross-language verification discipline; the discipline cost is the substrate-coherence cost canonical at canonical-coherence register substantively. The 4 NEW audit-event literals at AUDIT_EVENT_TYPE_VALUES substantively require a substantive Prisma migration in G1.2 (the literal-set itself is TypeScript-defined; the MutationType enum is the new DDL substrate that requires schema-push per ADR-0025). The optional expected_version parameter at createCapsule + updateCapsule input shape per Sub-decision Q-η substantively requires input-validation update at the route boundary substantively; modest because the parameter is optional and default null.

## Alternatives Considered

**Alternative 1 — Generic CRUD enum (INSERT / UPDATE / UPSERT / NOOP).** Rejected at G1.0 RULE 21 research arc + Founder-locked ADD/UPDATE/MERGE/NOOP. The CRUD UPSERT collapses ADD and UPDATE into one literal, destroying audit-trail discrimination at the human-sovereign boundary RULE 0 protects. CRUD INSERT carries database-tier connotations that don't match the capsule-id-supplied semantics of the COSMP write path. The NIOV-domain set is the substrate-coherent register substantively for the capsule-mutation register substantively and serves patent-implementation evidence per ADR-0020 by distinguishing NIOV's substrate from generic CRUD substrate.

**Alternative 2 — Single content_hash discriminator only.** Rejected at Founder Q-ε LOCKED Option α per Sub-decision Q-ε. content_hash alone cannot distinguish a partial-field MERGE that preserves content body from a NOOP that exactly matches content + all fields. The Greg Young CQRS canonical content-hash-as-event-id pattern fails this discrimination at the capsule-mutation register substantively. The split-discriminator strategy (content_hash + canonical_record + version/expected_version) is the substrate-coherent register substantively.

**Alternative 3 — Eager backfill of mutation_type on G1.2 migration as a dedicated commit.** Rejected at Founder Q-β LOCKED Option α + Sub-decision Q-μ. Eager backfill on existing MemoryCapsule rows substantively requires either (a) an inferred MutationType assignment that may not match historical write intent, or (b) a multi-step migration with substantive risk of long-running ALTER TABLE substantively. Nullable column with possible-implementation-detail backfill inside G1.2 or G1.3 if later preflight proves necessary is the substrate-coherent register substantively; backfill is not a separately committed G1.x.

**Alternative 4 — Mandatory expected_version on all writes.** Rejected at Founder Q-η LOCKED Option α per Sub-decision Q-η. Mandatory expected_version breaks backward compatibility with pre-G1.3 callers substantively at the write.service.ts boundary substantively; would force a substantive route-boundary input-shape change and substantive consumer-side adaptation across all callers simultaneously. Optional expected_version with opt-in optimistic-concurrency semantics is the substrate-coherent register substantively per the HTTP If-Match / ETag canonical idiom at RFC 7232 §3.1.

**Alternative 5 — Elixir-canonical canonical_record at the mutation register substantively.** Rejected at Founder Q-ζ + Q-ι LOCKED Option α per Sub-decisions Q-ζ + Q-ι. The write.service.ts discrimination boundary lives at the TypeScript register substantively; co-locating canonical_record at the TypeScript register substantively preserves substrate-coherence per ADR-0033 cross-language data-ownership precedent. The Elixir register substantively retains verification authority via the CI-gate byte-equivalence discipline per ADR-0033; the support-role-only framing prevents dual-engine drift on the same substrate.

**Alternative 6 — AI_AGENT-specific discrimination at Gap 1 substantively.** Rejected at Founder Q-κ LOCKED Option α per Sub-decision Q-κ. AI_AGENT EntityType-discriminated capsule routing is a forward-substrate enrichment that warrants its own Q-lock disposition framework substantively at optional ADR-0046. Deferring it from Gap 1 preserves the substrate-honest scoping discipline canonical at ADR-0029 + ADR-0035 without sacrificing the RULE 0 governance register substantively (which already applies via Sub-decisions Q-λ + Q-δ + Q-η).

**Alternative 7 — Remove or rename existing CAPSULE_CREATED / CAPSULE_UPDATED literals at G1.3 substantively.** Rejected at Founder Q-γ LOCKED + RULE 10 + ADR-0002. The BEFORE DELETE trigger at the database tier per ADR-0002 physically enforces literal-set append-only discipline; existing CAPSULE_CREATED + CAPSULE_UPDATED + CAPSULE_METADATA_READ + CAPSULE_CONTENT_READ + CAPSULE_DELETED literals remain in the value-set per RULE 10. New writes substantively emit the discriminated CAPSULE_MUTATION_* literal per Disposition Q-γ.1 LOCKED; the legacy literals remain recognized for historical-row queryability.

**Alternative 8 — Disposition Q-γ.2 dual-emit (legacy literal + discriminated literal as paired audit emission).** Rejected at Founder Q-γ.1 LOCKED at `[BEAM-CAPSULE-MUTATION-G1.1-QGAMMA-FINAL-AUTH]` register substantively. Dual-emission doubles audit row volume for every capsule write at hive-scale register per ADR-0039; the audit-volume cost outweighs the backward-compat benefit at canonical-scale register substantively. If a later preflight proves backward-compat consumers require dual-emission, Founder re-authorization fires at that register substantively per the explicit reservation at Sub-decision Q-γ.

**Alternative 9 — Disposition Q-γ.3 partial-class (only add CAPSULE_MUTATION_MERGE + CAPSULE_MUTATION_NOOP; keep emitting CAPSULE_CREATED + CAPSULE_UPDATED).** Rejected at Founder Q-γ LOCKED lexical content "4 new audit literals later: CAPSULE_MUTATION_ADD/UPDATE/MERGE/NOOP" canonical at `[BEAM-CAPSULE-MUTATION-QLOCK]` + Founder Q-γ.1 LOCKED rejection at `[BEAM-CAPSULE-MUTATION-G1.1-QGAMMA-FINAL-AUTH]` register substantively. The locked literal count is 4; partial-class would add only 2 and produce asymmetric discrimination where ADD/UPDATE ride legacy literals and MERGE/NOOP ride discriminated literals at the audit register substantively. Rejected at substrate-coherence register substantively.

## References

- **RULE 0** (CLAUDE.md L134 "Humans Are Always Sovereign — The Foundation Rule") — governance register substantively authorizing every mutation-discrimination decision at this ADR; explicit at §Context paragraph 4 + Sub-decision Q-λ + Sub-decision Q-δ + Sub-decision Q-η
- **RULE 4** (CLAUDE.md L168 "Audit Trail is Sacred") — every action that touches data gets logged BEFORE the response is sent; foundational to the NOOP-audit-emission decision at Sub-decision Q-δ
- **RULE 10** (CLAUDE.md L196 "Nothing is Ever Deleted") — foundational to the audit-literal append-only discipline at Sub-decision Q-γ; BEFORE DELETE trigger physical enforcement at the database tier
- **RULE 11** (CLAUDE.md L210 "Wider Knowledge Check for Elixir/BEAM Substrate") — G1.0 research-arc precedent for the cross-language data-ownership disposition at Sub-decisions Q-α + Q-ζ + Q-ι
- **RULE 13** (CLAUDE.md L266 "Surface Drifts Inline Over Silent Fix") — operationalized at Sub-decision Q-θ processContentForStorage exact-name preservation surface + Sub-decision Q-γ substrate-state ground-truth grep surface (absence of any generic write-class literal from existing AUDIT_EVENT_TYPE_VALUES)
- **RULE 20** (CLAUDE.md L389 "Rule-Modification Authority") — Founder authorization explicit at this ADR's substantive landing at G1.1 register substantively per `[BEAM-CAPSULE-MUTATION-DISCRIMINATION-ADR]` commit substantively
- **RULE 21** (CLAUDE.md L434 "Pre-Authorization Research Arc for Substrate-Architectural Pastes") — G1.0 research-arc canonical at §Context paragraph 5 substantively
- **ADR-0002** (Append-Only Audit Chain with BEFORE DELETE Trigger) — foundational to the audit-literal append-only discipline at Sub-decision Q-γ; the BEFORE DELETE trigger at `packages/database/src/queries/audit.ts` physically enforces RULE 10 for audit_events
- **ADR-0011 §Amendment** (Three-Tier Test Stratification + Gate 6 reproducibility-verification amendment) — test-stratification register substantively for G1.5 dedicated tests commit
- **ADR-0020** (Two-Register IP Discipline) — patent-implementation evidence register substantively for the NIOV-domain mutation enum
- **ADR-0022** (combined_score Formula Canonicalization) — downstream COE retrieval scoring substrate that consumes MemoryCapsule.content_hash + version + (forward-substrate) mutation_type discriminator
- **ADR-0025** (Schema-Push-Target Discipline) — schema-push-target register substantively for the G1.2 substantive Prisma migration adding MutationType enum + mutation_type column + audit-literal extension
- **ADR-0026 §5** (Dual-Control Middleware Pattern + 6 BEAM-compatibility patterns) — Pattern 6 pure transformation substantively preserved by construction at Sub-decision Q-ε split-discriminator helper; Pattern 4 compound transaction substantively preserved at Sub-decision Q-δ audit-only NOOP semantics
- **ADR-0028 §3 + §Forward Queue** (Forward-Substrate: Elixir/BEAM Coordination Layer) — the per-capsule supervised Elixir process forward-substrate item at §Forward Queue substantively that the capsule-layer mutation discrimination contributes substrate-coherence to at the cross-language register substantively
- **ADR-0033** (BEAM Persistence + Idempotency + Audit-Chain Cryptographic Substrate Architecture) — cross-language data-ownership register substantively for the Prisma-owned MutationType enum at Sub-decision Q-α; canonical_record/1 14-field byte-equivalence discipline substantively extended at Sub-decision Q-ζ TS-port; the 10 fixture pairs extended in G1.5 substantively per the mutation-class byte-equivalence verification register substantively
- **ADR-0034** (BEAM COSMP Testability Refactor Pattern) — testability discipline canonical at canonical-pattern register substantively for G1.5 test substrate at apps/cosmp_router/test register substantively
- **ADR-0035** (Substrate-Build Discipline Canonical) — substrate-build register substantively for the discrimination-class observation cluster; potential cluster expansion at G1.6 closure cascade if substrate-build observations surface across G1.2-G1.5
- **ADR-0036** (REGULATOR Principal + Lawful-Basis Attestation Pattern) — per-request indexed point-lookup precedent canonical at cross-cutting register substantively for the discriminateMutation helper substrate-state-read at G1.3 register substantively
- **ADR-0037** (Jurisdiction Tagging Architecture) — MemoryCapsule.jurisdiction immutable-after-creation precedent canonical at canonical-coherence register substantively for the mutation_type column-shape disposition at Sub-decision Q-β
- **ADR-0038** (DMW Worker per-DMW Supervised Process) — DMWWorker substrate canonical at runtime register substantively that the capsule-layer mutation discrimination integrates with at the per-DMW write-path register substantively
- **ADR-0039 + Amendment 1** (Hive-Scale Per-DMW Dispatch Substrate + Promote-on-Activity) — hive-scale dispatch substrate canonical at canonical-execution register substantively that the capsule-layer mutation discrimination operates beneath at the cross-tier register substantively
- **ADR-0040** (DEVICE Cold-Shard Substrate) — DEVICE cold-shard substrate canonical at canonical-execution register substantively; the mutation discrimination at Sub-decision Q-ε applies uniformly across all wallet_type registers substantively per the tier-routed dispatch shim at grpc/server.ex substantively
- **ADR-0041** (Capsule Layer Substrate Umbrella) — parent umbrella ADR canonical at CL.1 register substantively; this ADR-0042 is the Gap 1 substantive forward-substrate per ADR-0041 §Sub-decision 2

External substrate citations:

- **Patent US 12,517,919** (COSMP claims and 7-layer Memory Capsule conceptual structure)
- **Patent US 12,164,537 + US 12,399,904** (DMW + Foundation primitives)
- **RFC 7232 §3.1** (HTTP If-Match Conditional Requests) — protocol-tier optimistic-concurrency canonical at Sub-decision Q-η
- **RFC 6902** (JSON Patch) + **RFC 7396** (JSON Merge Patch) — partial-field write semantics canonical at MERGE register substantively per Sub-decision Q-ε
- **Bernstein, Hadzilacos, Goodman** *Concurrency Control and Recovery in Database Systems* §4.2 (Optimistic Concurrency Control) — optimistic-concurrency canonical for the version + expected_version pair at Sub-decision Q-η
- **Greg Young** *CQRS Documents* (Event-Sourcing + Content-Hash-as-Event-Id) — content-hash-as-discriminator pattern canonical at Sub-decision Q-ε + Alternative 2 rejection rationale
- **Martin Fowler** *Event Sourcing* (martinfowler.com/eaaDev/EventSourcing.html) — event-sourcing canonical at Sub-decision Q-γ audit-literal append-only discipline
- **Eric Evans** *Domain-Driven Design* §Domain Events — domain-event vocabulary canonical at NIOV-domain mutation enum rationale
- **PostgreSQL JSONB merge semantics** (postgresql.org/docs/current/functions-json.html) — partial-field merge canonical at MERGE register substantively per Sub-decision Q-ε
- **Mem0** (mem0.ai memory state mutation documentation) — memory-mutation comparison register substantively
- **Anthropic Claude Memory** documentation — memory-mutation comparison register substantively

## Bidirectional Citation

This ADR cites ADR-0041 (parent umbrella) at Sub-decision Q-μ G1.6 closure substantively + §References register substantively. ADR-0041 §Sub-decision 2 already references ADR-0042 forward-substrate; no append-only back-citation amendment fires at G1.1 absent substrate-state evidence at the Step 1 register substantively. If substrate-state evidence surfaces at G1.6 closure cascade that warrants an ADR-0041 cross-citation amendment substantively, that amendment fires at G1.6 register substantively per the ADR-0035 §Amendment Pattern discipline canonical.

This ADR cites ADR-0033 substantively at Sub-decisions Q-α + Q-ζ + Q-ι + §References register substantively. ADR-0033 §Forward Queue substantively does not currently reference Gap 1 forward-substrate; no append-only back-citation amendment fires at G1.1 absent substrate-state evidence. If G1.4 conditional Elixir support-port substantively fires and surfaces substrate-state evidence at the canonical_record/1 register substantively that warrants an ADR-0033 cross-citation amendment substantively, that amendment fires at G1.4 register substantively per the ADR-0035 §Amendment Pattern discipline canonical.

This ADR is cited by ADR-0051 (Otzar Chat Transparency and COE-Governed Retrieval Surfacing) for the capsule mutation-discrimination semantics. ADR-0051 introduces no ingestion `source_type` taxonomy and no new mutation semantics in Wave 1 — any future `source_type` taxonomy is deferred to a later ADR aligned with ADR-0021/ADR-0042 register substantively — so no append-only back-citation amendment to this ADR's body fires beyond this bidirectional reference.

## G1.2 RULE 13 Substrate-State Correction

Status: Active
Date: 2026-05-17
Trigger: G1.2 substantive landing per `[CAPSULE-MUTATION-PRISMA-MIGRATION]`
commit. Section-class is RULE 13 substrate-state correction, NOT formal
"Amendment 1" — no Proposed-ADR amendment precedent exists in the repo
at G1.2 land time per RULE 13 pre-flight grep on
`docs/architecture/decisions/*.md` (only ADR-0039 carries an `## Amendment 1`
H2, and ADR-0039 was Accepted at sub-arc 1 sub-phase b closure before its
Amendment 1 landed at sub-arc 1 sub-phase c per ADR-0039 `## Amendment 1`
Status: Active / Date: 2026-05-17). The "G1.2 RULE 13 Substrate-State
Correction" wording preserves substrate-honest framing for a still-Proposed
ADR receiving its first substantive code companion commit per Founder
disposition at `[CAPSULE-MUTATION-G1.2-REDRAFT-REQUEST]`.

### Correction 1 — Sub-decision Q-α: substantive Prisma DDL paste shape

§Sub-decision Q-α architectural lock at G1.1 canonicalized MutationType
enum location (Prisma-owned at TypeScript canonical register per
ADR-0033 cross-language data ownership) but did not paste the literal
4-line Prisma DDL body. G1.2 lands the body at
`packages/database/prisma/schema.prisma` immediately after the
`LawfulBasisType` enum:

```prisma
enum MutationType {
  ADD
  UPDATE
  MERGE
  NOOP
}
```

Four enum values match the §Decision header literal set (ADD / UPDATE /
MERGE / NOOP) per Founder Q-α LOCKED Option α at
`[BEAM-CAPSULE-MUTATION-QLOCK]`. No additional enum values landed; no
value reordering; no comment header on the enum block (matches existing
enum convention at schema.prisma L391-548 — no existing enum carries a
comment header).

### Correction 2 — Sub-decision Q-β: substantive field placement

§Sub-decision Q-β architectural lock at G1.1 canonicalized nullable
`mutation_type MutationType?` column adjacent to `version` +
`previous_version` + `content_hash` mutation-anchor cluster. G1.2 lands
the field at `packages/database/prisma/schema.prisma` on a new line
immediately after `previous_version Int?` (current L156, post-edit L156
unchanged + L157 NEW). Placement preserves mutation-anchor-cluster
colocation per Sub-decision Q-β intent. Nullable per Sub-decision Q-β
ensures pre-G1.2 historical rows tolerate the new column with NULL
default; no backfill landed at G1.2.

### Correction 3 — Sub-decision Q-γ: substantive audit literal append count

§Sub-decision Q-γ architectural lock at G1.1 canonicalized 4 NEW
append-only `CAPSULE_MUTATION_*` literals extending the existing
36-literal `AUDIT_EVENT_TYPE_VALUES` set per RULE 10
nothing-is-ever-deleted. G1.2 lands the literals at
`packages/database/src/queries/audit.ts` at two locations: the
`AuditEventType` union (L24-L91 pre-edit, terminating semicolon
migrated from L91 to the new last literal post-edit) and the
`AUDIT_EVENT_TYPE_VALUES` array (L104-L145 pre-edit, last literal at
L144 pre-edit; new literals append before the closing `]` at L145
post-edit). Substrate-state ground truth verified at pre-flight per
RULE 13: 36 literals → 40 literals across both surfaces; the
`isKnownAuditEventType` type guard at L147 continues to derive
correctness from the union/values pair without separate change.

### Correction 4 — Schema sync via ADR-0025 schema-push-target discipline

§Sub-decision Q-θ + Q-μ context paragraph references "G1.2 substantive
Prisma migration." G1.2 executes schema sync via `npm run db:push:test`
per ADR-0025 schema-push-target discipline canonical at Foundation
substrate. **G1.2 does NOT use `prisma migrate dev` or `prisma migrate
deploy`.** `packages/database/prisma/migrations/` directory remains
absent at G1.2 close; no migration file is created. This is the
substrate-honest reading of "Prisma migration" in the original
architectural lock — Foundation has never used Prisma Migrate; the
schema-push-target discipline at ADR-0025 + pre-commit guard at
`.husky/pre-commit` (per ADR-0024) is the canonical sync pathway.
Phrasing in Sub-decision Q-θ + Q-μ continues to reference "G1.2
substantive Prisma migration" as the mini-arc anchor name per Founder
authorization at `[BEAM-CAPSULE-MUTATION-QLOCK]`; the implementation
uses `db:push:test` exclusively.

### Correction 5 — Conditional G1.4 disposition surfaced at G1.2 close

§Sub-decision Q-ι + Q-μ architectural lock at G1.1 designated G1.4
`[CAPSULE-MUTATION-ELIXIR-AUDIT]` as a CONDITIONAL mini-arc that fires
only if G1.4 pre-flight grep proves substantive Elixir change needed
at the `canonical_record/1` field-projection register per ADR-0033.
G1.2 verification includes Elixir baseline runs (`mix compile --force`
+ per-app `mix test`) that empirically verify whether the
`CosmpRouter.MemoryCapsule` Ecto schema mirror tolerates the new
`mutation_type MutationType?` column without substantive change.
**Disposition at G1.2 close:** if baselines hold (`cosmp_router`
218/0/1 skipped + `dbgi_supervisor` 67/0/19 excluded), G1.4 remains
forward-substrate as a deferred/optional mini-arc and the schema
additive is verified as backward-compatible at the Ecto register. If
either baseline drifts, G1.4 transitions from conditional to mandatory
per Sub-decision Q-ι disposition and the drift is surfaced inline per
RULE 13 with a separate Founder disposition required before commit
authorization.

### Correction 6 — Substrate-state delta at G1.2 close

| File | Pre-G1.2 LOC | Post-G1.2 LOC | Delta |
|---|---|---|---|
| `packages/database/prisma/schema.prisma` | 1252 | ~1259 (5-line enum + 1 field line + 1 blank) | +7 |
| `packages/database/src/queries/audit.ts` | 650 | ~661 (4 union literals + 7-line comment + 4 array literals + 2-line comment) | +11 |
| `docs/architecture/decisions/0042-capsule-mutation-discrimination.md` | 165 | ~290 (this correction section) | +~125 |

(Exact post-edit LOC verified by `wc -l` at G1.2 close per RULE 13.)

### G1.2 close authorization lineage

Founder authorization explicit at G1.2 substantive landing per RULE 20
at `[CAPSULE-MUTATION-G1.2-EXECUTION-AUTHORIZATION-PASTE-V2]`. Crash
recovery preceded execution per
`[CAPSULE-MUTATION-G1.2-CRASH-RECOVERY-PREFLIGHT]` Path A clean-tree
disposition (HEAD `2cb0028`). Pre-flight RULE 12 + RULE 13 + RULE 21
substrate-state ground truth verification preceded paste authoring per
`[CAPSULE-MUTATION-G1.2-REDRAFT-REQUEST]`. Verification-section patch
landed per `[CAPSULE-MUTATION-G1.2-EXECUTION-VERIFY-PATCH]` (canonical
typecheck command + Elixir baseline runs added; framing corrected —
G1.2 adds no new tests but existing verification baselines still run
before commit authorization). Code-fence + prose-duplicate patches
landed per `[CAPSULE-MUTATION-G1.2-EXECUTION-PASTE-FINAL-PATCH-V2]`
(nested markdown fence handling fixed via 4-backtick outer wrapper;
duplicated "register substantively" phrasing consolidated; markdown
fence balance verification gate added as Gate 20).

§Sub-decision Q-α + Q-β + Q-γ + Q-θ + Q-μ architectural locks at G1.1
remain unchanged; this correction section documents G1.2 implementation
choices that ground each architectural lock in actual repo substrate
per RULE 13. Gap 1 closure remains forward-substrate to G1.3
(write.service.ts discriminateMutation) + conditional G1.4 (Elixir
support per Correction 5 disposition) + G1.5 (tests) + G1.6 (closure
cascade) per §Status G1.1 scope paragraph.

## G1.3 RULE 13 Substrate-State Correction

Status: Active
Date: 2026-05-17
Trigger: G1.3 substantive landing per `[CAPSULE-MUTATION-WRITE-SERVICE]`
commit. Section-class is RULE 13 substrate-state correction per the
G1.2 H2 precedent; G1.3 documents 10 substrate-state observations
surfaced during the G1.3.0 wide preflight + G1.3.0b hawkseye
system-coherence preflight and resolved at execution time per Founder
Q-locks Q-G1.3-α through Q-G1.3-σ + V2/V3/V4/V5 patch lineage at
`[CAPSULE-MUTATION-WRITE-SERVICE-QLOCK]` +
`[CAPSULE-MUTATION-WRITE-SERVICE-QLOCK-PATCH]` +
`[CAPSULE-MUTATION-WRITE-SERVICE-V2-CONTENT-NOOP-PATCH]` +
`[CAPSULE-MUTATION-WRITE-SERVICE-V3-FINAL-PATCH-AUTH]` +
`[CAPSULE-MUTATION-WRITE-SERVICE-V4-FINAL-PATCH]` +
`[CAPSULE-MUTATION-WRITE-SERVICE-G1.3-EXECUTE-VERIFY-AUTH]`.

### Correction 1 — Q-G1.3-α: `writeAuditEventForCapsule` conceptual drift

ADR-0042 §Sub-decision Q-γ.1 + §Sub-decision Q-μ reference a
`writeAuditEventForCapsule` helper at write.service.ts L765 as the
target of signature widening. **No such helper exists in substrate.**
The actual substrate contains: (a) inline `writeAuditEvent(...)` calls
at write.service.ts createCapsule SUCCESS path and updateCapsule
SUCCESS path; (b) a private `auditDenial` helper for the DENIAL path
only. G1.3 implements against the actual substrate: widens
`auditDenial` eventType union to the 4 CAPSULE_MUTATION_* literals;
updates inline `writeAuditEvent` literal arguments in createCapsule
(CAPSULE_MUTATION_ADD) and updateCapsule (discriminated
CAPSULE_MUTATION_ADD/UPDATE/MERGE/NOOP per the discriminateMutation
result).

### Correction 2 — Q-G1.3-κ: TS canonical_record already exists

ADR-0042 §Sub-decision Q-ζ references "TS-canonical port from Elixir
audit.ex:146" as forward-substrate work for G1.3. **The TS port
already exists** at `packages/database/src/queries/audit.ts:349` as
`canonicalRecord()` with 14-field byte-equivalent projection matching
Elixir per ADR-0033; 12 fixture pairs at
`apps/cosmp_router/test/fixtures/canonical_record/fixtures.json`
verify cross-language byte-equivalence at every CI run. G1.3 REUSES
the existing audit canonical helper and `canonicalJson` primitive.
NEW `canonicalCapsuleMutationRecord()` is a SEPARATE projection at
write.service.ts (15-field projection focused on mutation-relevant
MemoryCapsule fields, distinct from the audit canonicalRecord field
projection) for the discriminateMutation split-discriminator per
ADR-0042 §Sub-decision Q-ε.

### Correction 3 — Q-G1.3-ζ + V2-CONTENT-NOOP-PATCH

3a. **Encryption is non-deterministic.** `packages/auth/src/crypto.ts:35`
uses `randomBytes(12)` for fresh AES-256-GCM IV per `encrypt(...)` call
(IV-uniqueness GCM safety requirement). The persisted
`MemoryCapsule.content_hash = sha256Hex(ciphertext)` per
processContentForStorage therefore DIFFERS for identical plaintext.

3b. **NOOP detection requires plaintext-to-plaintext hash comparison.**
The persisted ciphertext-derived content_hash cannot be compared to a
proposed plaintext hash. Original Q-ε framing in V1 paste was
substrate-incoherent on this point; corrected at V2.

3c. **Existing content is read+decrypted inside updateCapsule AFTER
permission gates** via `this.contentStore.read(existing.storage_location)`
+ `this.encryption.decrypt(...)`. Proof-of-life pattern at
`apps/api/src/services/cosmp/read.service.ts:581`. The internal
discrimination read is NOT a CAPSULE_CONTENT_READ audit-emitting event;
plaintext is held only in a local variable for `plaintextHash(...)`
computation; never logged; never returned; never persisted; discarded
after hash computation. A write-permitted actor implicitly has
read-for-internal-NOOP-discrimination authority per Q-G1.3-ν ORDER
LOCK (all permission gates fire before discriminateMutation).

3d. **Persisted `MemoryCapsule.content_hash` semantics UNCHANGED** —
remains `sha256Hex(ciphertext)` for at-rest verification anchor per
Founder Q-G1.3-ζ boundary lock. NO new persisted plaintext-hash field;
NO schema change in G1.3.

3e. **Audit metadata uses distinct hash-name suffixes** to prevent
type confusion: `existing_ciphertext_content_hash` (from
existing.content_hash) + `proposed_plaintext_probe_hash` +
`existing_plaintext_probe_hash` (when contentReadable; null otherwise)
+ `existing_canonical_record_hash` + `proposed_canonical_record_hash`.

### Correction 4 — Q-G1.3-λ + Q-G1.3-ρ + V4 Patch 1

`writeAuditEvent` at `audit.ts:541-549` already accepts optional
`tx?: Prisma.TransactionClient`. G1.3 wraps `tx.memoryCapsule.create`
(createCapsule) and `tx.memoryCapsule.update` / `tx.memoryCapsule.
updateMany` + `writeAuditEvent(_, tx)` (updateCapsule) inside
`prisma.$transaction(async (tx) => { ... })` for atomic DB mutation +
audit emission per RULE 4. NO changes to `audit.ts` required.

**`contentStore.write` STAYS OUTSIDE the Prisma transaction** per
Q-G1.3-ρ — Supabase Storage (and any future object storage backend per
ADR-0018) is NOT rollback-able by Prisma transaction abort. Existing
pre-G1.3 substrate at write.service.ts already performs
`contentStore.write` BEFORE the DB write at create path
(`storageLocation = niov://capsule/${capsuleId}` then write then
DB-create) and at update path (`existing.storage_location` then write
then DB-update). If the DB write fails, the storage object is
orphaned. **This is a pre-existing risk, NOT introduced by G1.3.**

**V4 Patch 1 CAS pattern:** when `expected_version` is supplied,
`tx.memoryCapsule.updateMany({ where: { capsule_id, version:
expected_version, deleted_at: null }, data })` is the final CAS
defense inside the transaction; count === 0 throws
`VersionConflictError` for transaction rollback. When
`expected_version` is null/omitted, standard `tx.memoryCapsule.update`
runs (backward-compat last-writer-wins). Both paths emit SUCCESS
audit inside the same transaction as the DB write.

**D-STORAGE-DB-ATOMICITY-BOUNDARY** is canonicalized as a forward-
substrate substrate-state observation. The canonical remediation
pattern is the transactional outbox pattern (per AWS Prescriptive
Guidance + microservices.io + Azure Architecture Center 2026
canonical references) + periodic reconciliation / compensating-delete.
G1.3 does NOT implement outbox/compensating-delete; this is
forward-substrate for a later mini-arc post-Gap 1 closure if Founder
authorizes scope expansion.

### Correction 5 — Q-G1.3-ο: audit details minimalism

G1.3 audit details payload includes `mutation_type` + existing fields
(write_type, capsule_type, content_hash, payload_size_tokens,
previous_version, new_version, content_changed, write_reason) + (for
CAPSULE_VERSION_CONFLICT) expected_version + actual_version + (for
NOOP) existing/proposed content + canonical_record hash pairs +
noopReason + expected_version + (for σ-A override path) reason:
"existing_content_unreadable".

G1.3 does NOT add: large diff summaries, canonical record bodies,
content similarity scores, full before/after payloads, monetization
analytics payloads, Federation export metadata, depersonalized cohort
metadata, plaintext content, decrypted content. These are
forward-substrate per Q-G1.3-ο Founder lock — hive-scale audit-volume
risk per ADR-0039 + premature coupling to COE/Federation analytics +
RULE 0 plaintext-confidentiality boundary.

### Correction 6 — Q-G1.3-π: operator-surface deferral

G1.3 does NOT add operator-tier surfaces: no mutation_type admin query
routes, no operator dashboard changes, no override controls, no kill
switches, no manual mutation correction surfaces, no new privileged
endpoints per ADR-0026. Existing audit query routes
(`org.routes.ts` + `regulator.routes.ts` `auditEvent.findMany`)
already filter by event_type literal; the 4 NEW CAPSULE_MUTATION_*
literals slot in via existing filter mechanism. Operator-tier
mutation_type analytics + override controls + manual correction
surfaces remain forward-substrate per Q-G1.3-π Founder lock.

### Correction 7 — Q-G1.3-ξ: test-reality minimal waiver

`tests/unit/cosmp/write.test.ts` L179 (test description) + L194
(event_type assertion) reference the legacy `CAPSULE_CREATED` literal.
G1.3 transitions emission to `CAPSULE_MUTATION_ADD` per Q-γ.1
clean-transition LOCK; the existing test assertion becomes stale and
would fail at runtime, breaking CI.

Per Founder Q-G1.3-ξ Option β LOCK at `[CAPSULE-MUTATION-WRITE-SERVICE-
QLOCK-PATCH]`: G1.3 applies a minimal 2-line baseline-preservation
update — L179 description string + L194 event_type assertion literal
sync from `CAPSULE_CREATED` to `CAPSULE_MUTATION_ADD`. **This is NOT
G1.5 test expansion.** No new test cases. No additional test file
modifications. The waiver authorizes only stale-literal-reference
auto-update; the test logic is unchanged.

### Correction 8 — Q-G1.3-σ LOCKED at σ-A (conservative-changed)

When `contentStore.read(existing.storage_location)` returns null OR
`encryption.decrypt(...)` throws (auth-tag mismatch / key rotation /
corruption), G1.3 forces `decision.mutationType = "UPDATE"` with
`decision.noopReason = "existing_content_unreadable"` and full
sideEffectsRequired. The user write is NOT failed by default
(preserves current write availability); the storage/decryption
anomaly is surfaced in audit details `reason:
"existing_content_unreadable"` for operator observability. No new
failure code (no `EXISTING_CONTENT_UNREADABLE`); no schema field;
hard-fail policy stricter than current substrate is deferred to a
later disposition per Q-G1.3-σ Founder lock.

### Correction 9 — V4 Patches 2/3/4 substrate-state acknowledgments

**9a (Patch 2):** `contentStore.write` signature preserved verbatim —
create-path uses local `storageLocation` variable = `niov://capsule/
${capsule_id}` (write.service.ts L331+L336 substrate); update-path
uses `existing.storage_location` (write.service.ts L659 substrate
preserved at the new updateCapsule UPDATE branch). G1.3 introduces no
new contentStore method, no new API shape.

**9b (Patch 3):** Canonical CI unit-tier command is `npm run test:unit`
per `.github/workflows/ci.yml:98` + `package.json:14` (=
`vitest --config vitest.unit.config.ts --run`). Local pre-commit
verification Gate 29 runs exactly this command (not `npm run test`,
not `npx vitest run`) to mirror CI behavior.

**9c (Patch 4):** `cosmp.routes.ts:245` PATCH route uses Fastify typed
body `app.patch<{ Params: { id: string }; Body: CapsuleUpdateInput }>`
with NO zod / typebox / runtime schema. `expected_version` flows
through automatically once added to the `CapsuleUpdateInput`
interface; no route-layer DTO addition required beyond the
`statusForCode` 409 case for CAPSULE_VERSION_CONFLICT.

**9d (substrate-state observation, surfaced at execution):**
`MutationType` is not currently re-exported from `@niov/database/index.ts`
(G1.2 added the Prisma enum but did not extend the re-export list).
G1.3 imports `MutationType` directly from `@prisma/client` (matches
existing precedent in `apps/api/src/services/governance/*.ts` files
that import `Prisma`, `TwinConfig`, `Hive` direct from `@prisma/client`).
This preserves the patched Q-G1.3-ν scope lock (no
`packages/database/` changes). A future cleanup commit may consolidate
the `MutationType` re-export via `@niov/database` for consistency
with `CapsuleType` / `DecayType` / `StorageTier` re-export pattern.

### Correction 10 — V5 Patch 1 CAS audit emission LOCK at Option (b)

CAS-race conflicts inside the transaction throw a private
`VersionConflictError` (declared at write.service.ts module level for
this purpose) to unwind the transaction. The DENIED audit emission
happens AFTER rollback via standalone `writeAuditEvent({...})` (NO
`tx` 2nd argument). Rationale: a `writeAuditEvent({...}, tx)` call on
the CAS-conflict path INSIDE the rolled-back transaction would write
its audit row into the transaction's pending changeset, which is then
discarded when `VersionConflictError` is thrown — the audit row would
never persist. Audit-chain integrity per RULE 4 + ADR-0002 requires
the DENIED audit row to persist via a SEPARATE transaction opened by
standalone `writeAuditEvent` (per audit.ts:541-549 internal
`prisma.$transaction` fallback).

**Substrate-state observation:** if standalone `writeAuditEvent` ALSO
fails on the CAS-conflict path, the audit infrastructure is unhealthy.
G1.3 implementation re-throws the audit error to the caller (which
surfaces as 5xx at the route layer) rather than silently swallowing
an audit-chain gap. This is the V5 ABORT trigger 27 + RULE 13 surface.

### G1.3 close authorization lineage

Founder authorization explicit at G1.3 substantive landing per RULE 20
at `[CAPSULE-MUTATION-WRITE-SERVICE-G1.3-EXECUTE-VERIFY-AUTH]`.
Pre-flight discipline lineage:

- G1.3.0 wide preflight per `[CAPSULE-MUTATION-WRITE-SERVICE-PREFLIGHT]`
  surfaced 4 RULE 13 catches (writeAuditEventForCapsule drift +
  canonical_record already exists + encryption-determinism question +
  prisma generate prereq).
- G1.3.0b hawkseye preflight per
  `[CAPSULE-MUTATION-G1.3-HAWKSEYE-SYSTEM-PREFLIGHT]` confirmed
  system-wide substrate coherence across DMW / COSMP / Elixir / COE /
  monetization / operator / RULE 0 boundaries + identified 4 NEW
  Q-lock surfaces (test-reality + audit-details minimalism +
  operator-surface deferral + storage-DB orphan acknowledgment).
- Q-lock disposition fired in waves: Q-G1.3-α through Q-G1.3-ν at
  `[CAPSULE-MUTATION-WRITE-SERVICE-QLOCK]`; Q-G1.3-λ patch +
  Q-G1.3-ξ through Q-G1.3-ρ at
  `[CAPSULE-MUTATION-WRITE-SERVICE-QLOCK-PATCH]`; V2 content-NOOP
  comparison patch at
  `[CAPSULE-MUTATION-WRITE-SERVICE-V2-CONTENT-NOOP-PATCH]`; V3 σ-A
  lock + V4 transaction coherence + contentStore signature +
  canonical CI command + route validation patches at
  `[CAPSULE-MUTATION-WRITE-SERVICE-V3-FINAL-PATCH-AUTH]` +
  `[CAPSULE-MUTATION-WRITE-SERVICE-V4-FINAL-PATCH]`; V5 CAS-audit
  emission Option (b) lock + diff-count gate correction at
  the V5 paste authoring step.

Gap 1 closure remains forward-substrate to optional G1.4 (Elixir;
default SKIP per Q-ι) + G1.5 (full test coverage) + G1.6 (closure
cascade, ADR-0042 Proposed → Accepted) per ADR-0042 §Sub-decision Q-μ.

## G1.4 Formal SKIP Record — CAPSULE-MUTATION-ELIXIR-AUDIT

Status: SKIPPED / NOT REQUIRED
Date: 2026-05-17
Trigger: G1.4.0 wide preflight per
`[CAPSULE-MUTATION-ELIXIR-AUDIT-G1.4-PREFLIGHT]` (read-only substrate
mapping across Elixir COSMP router + DBGI supervisor + cross-language
canonical fixtures + parallel execution boundaries).

### Disposition

G1.4 was canonicalized as a CONDITIONAL mini-arc per ADR-0042
§Sub-decision Q-ι default LOCK Option α: "SKIP G1.4 — Elixir substrate
consumes MutationType as a string at the canonical_record/1
byte-equivalence boundary substantively without substantive Elixir
code change per the Q-ζ TS-canonical-port discipline." The conditional
clause "fires only if grep at G1.4 pre-flight register substantively
proves the Elixir substrate requires substantive change" specified the
SKIP-default may flip only when grep-grounded evidence proves Elixir
code change is required at the `canonical_record/1` field-projection
register substantively.

**The condition did not trigger.** The G1.4.0 preflight grep proved
the SKIP default is substrate-coherent at the current substrate-state
register substantively. **No Elixir code changes are authorized or
required at G1.4 register substantively.** This commit lands as the
formal docs-only SKIP record per Founder authorization at
`[CAPSULE-MUTATION-ELIXIR-AUDIT-G1.4-SKIP-RECORD-AUTH]`.

### Substrate evidence (grep-grounded per RULE 12 / 13)

The G1.4.0 preflight verified the following empirically across
`apps/cosmp_router/lib/` and `apps/dbgi_supervisor/lib/`:

1. **`CosmpRouter.Audit.canonical_record/1`** at
   `apps/cosmp_router/lib/cosmp_router/audit.ex:146-164` treats
   `event_type` as an opaque string parameter (no enum gate; no
   literal-set validation). The 14-field byte-equivalent projection
   per ADR-0033 §Sub-decision 5b-ii is event-type-string-agnostic —
   the audit primitive correctly hashes any literal including the 4
   NEW G1.2 `CAPSULE_MUTATION_*` literals without code change.

2. **`CosmpRouter.Audit.write_audit_event/1`** at audit.ex:252 and
   **`/3`** at audit.ex:272 accept `event_type` as an opaque string;
   no validation against a closed enum. Cross-language byte-equivalence
   per ADR-0033 is preserved by construction for any TS-emitted literal.

3. **`CosmpRouter.Idempotency`** at
   `apps/cosmp_router/lib/cosmp_router/idempotency.ex` caches by
   `(idempotency_key, scope)` tuple. `check/2` at L67 and `record/3`
   at L94 do not inspect `event_type` or `mutation_type` for routing
   or storage decisions. The idempotency layer is event-type-opaque
   and mutation-type-opaque at substrate-state ground truth.

4. **`CosmpRouter.Operations`** at
   `apps/cosmp_router/lib/cosmp_router/operations.ex` emits
   COSMP-namespaced audit literals only: `COSMP_AUTHENTICATE` at L84,
   `COSMP_NEGOTIATE` at L109, `COSMP_READ` at L134, plus
   `COSMP_WRITE` / `COSMP_SHARE` / `COSMP_REVOKE` / `COSMP_AUDIT` at
   subsequent op handlers. The Elixir COSMP router does **NOT** emit
   any `CAPSULE_MUTATION_*` literal; that literal set is exclusively
   TypeScript-side per ADR-0042 §Sub-decision Q-ζ TS-canonical-port
   discipline + Q-γ.1 clean transition LOCK substantively.

5. **`DbgiSupervisor.DMWWorker`** at
   `apps/dbgi_supervisor/lib/dbgi_supervisor/dmw_worker.ex` and
   **`CosmpRouter.GRPC.Server`** at
   `apps/cosmp_router/lib/cosmp_router/grpc/server.ex` are
   dispatcher/supervision substrate per ADR-0038/0039/0040; they
   delegate execution via the `DbgiSupervisor.CosmpExecution`
   behaviour. **Neither writes capsule rows to Postgres directly.**
   TS API at `apps/api/src/services/cosmp/write.service.ts` remains
   the canonical capsule write path post-G1.3 per the
   forward-substrate framing canonical at ADR-0028 §3.

6. **`expected_version` + `CAPSULE_VERSION_CONFLICT`** are TS-side
   write semantics introduced at G1.3 per ADR-0042 §Sub-decision
   Q-η + Q-G1.3-θ LOCKs. The CAS check fires inside the TS-owned
   `prisma.$transaction` via `tx.memoryCapsule.updateMany` per V4 Patch
   1. The CAPSULE_VERSION_CONFLICT denial path emits a standalone
   `writeAuditEvent` post-rollback per V5 Patch 1 LOCK Option (b).
   No Elixir-side cooperation is required for OCC or version conflict
   detection at the current substrate-state register substantively.

7. **`CosmpRouter.MemoryCapsule`** Ecto schema at
   `apps/cosmp_router/lib/cosmp_router/schemas/memory_capsule.ex` does
   **not** include a `mutation_type` field. This is **benign** per
   standard Ecto behavior: fields not declared in the schema are
   silently ignored when reading from the database (Ecto select
   projection is schema-bounded). Insert/update statements emitted by
   Elixir Ecto code never reference `mutation_type` because Elixir
   does not write capsule mutation classifications (TS API owns
   capsule writes per ADR-0042 §Sub-decision Q-θ). The G1.2 Prisma
   schema addition of `mutation_type MutationType?` at schema.prisma:157
   is read-only-ignored at the Elixir register substantively.

8. **`CAPSULE_WRITE`** appears only at
   `apps/cosmp_router/test/cosmp_router/storage/postgres_test.exs`
   lines 190, 200, 221 as a synthetic test-fixture literal for
   verifying `audit_chain_for_capsule/1` ordering. The literal does
   **not** appear in any Elixir lib code. The test is event-type
   literal-vocabulary-agnostic; it verifies audit-chain mechanics
   (hash recomputation + timestamp ordering), not membership in any
   canonical taxonomy. The drift is fixture-only and does not block
   live production.

### Forward-substrate disposition

- **Cross-language `CAPSULE_MUTATION_*` canonical-record fixtures:**
  the existing 12 byte-equivalence fixtures at
  `apps/cosmp_router/test/fixtures/canonical_record/fixtures.json`
  test the canonical-record serialization MECHANISM (sorted-key
  pipe-join with millisecond-truncated timestamp), not the literal
  vocabulary. Extending to mutation-class fixtures (4 NEW pairs, one
  per MutationType variant) is **deferred to G1.5
  `[CAPSULE-MUTATION-TESTS]`** per ADR-0042 §Sub-decision Q-ζ
  ("the existing 10 fixture pairs per ADR-0033 are extended with
  mutation-class fixtures in G1.5"). NOT required for G1.4 SKIP
  record landing.

- **`CAPSULE_WRITE` test-fixture cosmetic cleanup at
  `postgres_test.exs:190/200/221`:** deferred to G1.5 or a separate
  cosmetic cleanup commit (e.g., `[CAPSULE-WRITE-FIXTURE-CLEANUP]`)
  per Founder discretion. NOT blocking G1.4 SKIP record or G1.6
  closure cascade. The synthetic literal does not match any canonical
  taxonomy member (pre-G1.2 or post-G1.2); renaming to
  `CAPSULE_MUTATION_ADD` would be cosmetic alignment with the
  Q-G1.3-ξ Option β pattern extension to Elixir test substrate.

- **G1.5 `[CAPSULE-MUTATION-TESTS]`** remains required for full
  mutation-discrimination test coverage per ADR-0042 §Sub-decision
  Q-μ: TS unit/integration tests covering ADD/UPDATE/MERGE/NOOP
  discrimination + expected_version OCC + CAPSULE_VERSION_CONFLICT +
  σ-A unreadable-existing fallback + plaintext probe non-leakage +
  cross-language canonical-record byte-equivalence fixture extension
  for mutation-class + (optional per Founder) CAPSULE_WRITE fixture
  cosmetic cleanup.

- **G1.6 `[BEAM-CAPSULE-MUTATION-DISCRIMINATION-CLOSURE]`** remains
  required for the docs-only closure cascade: ADR-0042 Status
  Proposed → Accepted + Gap 1 IN FLIGHT → CLOSED at
  `docs/reference/section-12-progress.md` + Gap 1 H3 closure prose at
  `docs/CURRENT_BUILD_STATE.md` + `docs/architecture/README.md`
  ADR-0042 catalog Proposed → Accepted refresh + `CLAUDE.md`
  ADR-0042 catalog entry refresh + ADR-0035 §9 substrate-build
  observation cluster expansion if substrate-build observations
  surface across G1.2-G1.5 that warrant canonical promotion.

### ADR-0033 cross-citation amendment disposition

ADR-0042 §Bidirectional Citation paragraph 2 (line 165) specified
that if G1.4 conditional Elixir support-port fires and surfaces
substrate-state evidence at the `canonical_record/1` register
substantively that warrants an ADR-0033 cross-citation amendment
substantively, that amendment fires at G1.4 register substantively
per the ADR-0035 §Amendment Pattern discipline canonical.

**G1.4 SKIP disposition implication:** no ADR-0033 cross-citation
amendment fires at G1.4 register substantively because Elixir
substrate did not require change. The substrate-state evidence
surfaced at G1.4.0 preflight confirms the existing ADR-0033
cross-language data-ownership canonical disposition holds without
amendment: Prisma owns the MutationType enum + mutation_type column
DDL at the TypeScript canonical register substantively (G1.2); Elixir
consumes MutationType values as opaque strings at the
`canonical_record/1` byte-equivalence boundary substantively (G1.4
SKIP). The Ecto MemoryCapsule schema absence of mutation_type field
is benign forward-substrate per the Q-ι support/verification-role
discipline.

### G1.4 close authorization lineage

Founder authorization explicit at G1.4 SKIP-record substantive landing
per RULE 20 at `[CAPSULE-MUTATION-ELIXIR-AUDIT-G1.4-SKIP-RECORD-AUTH]`.
Preflight discipline lineage:

- G1.4.0 wide preflight per
  `[CAPSULE-MUTATION-ELIXIR-AUDIT-G1.4-PREFLIGHT]` proved the SKIP
  default per Q-ι is substrate-coherent at the current substrate-state
  register substantively. Read-only substrate mapping covered: Elixir
  audit/canonical/idempotency module surface + cross-language fixture
  byte-equivalence mechanism + Elixir parallel execution boundary +
  CAPSULE_WRITE fixture drift scope.

- G1.4 SKIP record commit `[CAPSULE-MUTATION-ELIXIR-AUDIT]` lands as
  the formal substrate-state acknowledgment per Founder authorization.
  G1.4 mini-arc count is 1 commit (docs-only). The CAPSULE prefix per
  Q-ν LOCK is preserved (substantive landing in the mini-arc sequence
  even though the substantive content is the SKIP disposition itself).

Gap 1 closure remains forward-substrate to G1.5 + G1.6 per ADR-0042
§Sub-decision Q-μ. The G1.4 SKIP record DOES NOT close Gap 1 at
canonical-state register substantively. Sub-arc 2 closure remains
forward-substrate per ADR-0041 CL.1 scope patch.

## G1.6 Closure Cascade — Gap 1 IN FLIGHT → CLOSED + ADR-0042 Proposed → Accepted

Status transition: Proposed 2026-05-17 (G1.1) → Accepted 2026-05-17 (G1.6).
Date: 2026-05-17.
Trigger: G1.6 docs-only closure cascade landing per
`[BEAM-CAPSULE-MUTATION-DISCRIMINATION-CLOSURE]` commit per Founder
authorization at `[BEAM-CAPSULE-MUTATION-DISCRIMINATION-G1.6-QLOCK]` +
`[BEAM-CAPSULE-MUTATION-DISCRIMINATION-G1.6-V5-MINIMAL-EXECUTION-REQUEST]`.

### G1 mini-arc landing lineage canonical at canonical-execution register substantively

- **G1.1** `[BEAM-CAPSULE-MUTATION-DISCRIMINATION-ADR]` `2cb0028` — docs-only architectural lock; ADR-0042 NEW Proposed + section-12-progress Sub-arc 2 row IN FLIGHT update + CURRENT_BUILD_STATE Gap 1 H3 NEW + architecture/README + CLAUDE.md ADR-0042 catalog entries NEW.
- **G1.2** `[CAPSULE-MUTATION-PRISMA-MIGRATION]` `dfcbbb1` — substantive Prisma migration: MutationType enum (ADD/UPDATE/MERGE/NOOP) + nullable `mutation_type MutationType?` column on MemoryCapsule + 4 NEW CAPSULE_MUTATION_* literals extending AUDIT_EVENT_TYPE_VALUES per Q-α/Q-β/Q-γ Disposition Q-γ.1 clean-transition LOCKED. Per ADR-0025 schema-push-target discipline (`npm run db:push:test`); NO Prisma Migrate; NO migrations directory created.
- **G1.3** `[CAPSULE-MUTATION-WRITE-SERVICE]` `16c562c` — substantive write.service.ts discrimination: discriminateMutation helper + 3 pure module-level helpers (canonicalCapsuleMutationRecord + plaintextHash + VersionConflictError) + createCapsule ADD persistence + updateCapsule UPDATE/MERGE/NOOP discriminated branches + expected_version opt-in OCC + CAPSULE_VERSION_CONFLICT failure code + auditDenial signature widening + inline writeAuditEvent literal transitions + Prisma `$transaction` wrapping + standalone post-rollback DENIED audit emission on CAS conflict per V5 Patch 1 LOCK Option (b).
- **G1.3-fix** `[CAPSULE-MUTATION-WRITE-SERVICE-G1.3-INTEGRATION-FIX]` `8f047de` — minimal test-tier waiver scope extension to integration tier (6-line literal sync at `tests/integration/jurisdiction-cosmp-enforcement.test.ts`).
- **G1.4** `[CAPSULE-MUTATION-ELIXIR-AUDIT]` `3505fde` — docs-only formal SKIP record per ADR-0042 §Sub-decision Q-ι LOCKED default disposition (SKIP). 8-point grep-grounded evidence preserved.
- **G1.5** `[CAPSULE-MUTATION-TESTS]` `16567eb` — substantive test substrate: 11 NEW unit tests + 2 NEW integration tests + 4 NEW canonical-record fixtures + fixture-count bound widening + cosmetic Elixir test fixture cleanup. CI 4/4 green.
- **G1.6** `[BEAM-CAPSULE-MUTATION-DISCRIMINATION-CLOSURE]` this commit — docs-only closure cascade across 6 files (ADR-0042 + section-12-progress + CURRENT_BUILD_STATE + architecture/README + CLAUDE.md + ADR-0035).

### Post-Closure Implementation Lineage substantively

Gap 1 substrate canonical at canonical-state register substantively:

- MutationType enum (ADD/UPDATE/MERGE/NOOP) defined at Prisma register per §Sub-decision Q-α (LANDED G1.2 `dfcbbb1`).
- `mutation_type MutationType?` nullable column on MemoryCapsule persisted per §Sub-decision Q-β (LANDED G1.2 `dfcbbb1`).
- 4 NEW CAPSULE_MUTATION_ADD/UPDATE/MERGE/NOOP audit-event literals appended to AUDIT_EVENT_TYPE_VALUES per RULE 10 nothing-is-ever-deleted + ADR-0002 append-only audit chain per §Sub-decision Q-γ Disposition Q-γ.1 clean-transition LOCKED (LANDED G1.2).
- createCapsule discriminated ADD path emitting CAPSULE_MUTATION_ADD + persisting mutation_type "ADD" (LANDED G1.3 `16c562c`).
- updateCapsule discriminated UPDATE/MERGE/NOOP branches with split-discriminator strategy per §Sub-decision Q-ε (content_hash via plaintext probe + canonical_record + version/expected_version) (LANDED G1.3).
- NOOP audit-only emission with zero MemoryCapsule write + zero version increment + zero storage write per §Sub-decision Q-δ LOCK (LANDED G1.3).
- Optimistic-concurrency expected_version + CAPSULE_VERSION_CONFLICT envelope per §Sub-decision Q-η RFC 7232 §3.1 If-Match canonical (LANDED G1.3); HTTP 409 mapping at `apps/api/src/routes/cosmp.routes.ts` statusForCode addition (LANDED G1.3).
- discriminateMutation helper at write.service.ts boundary preserving exact `processContentForStorage` substrate name per §Sub-decision Q-θ + RULE 13 ground-truth surface (LANDED G1.3).
- TS-side `canonicalCapsuleMutationRecord` projection helper + reuse of existing audit `canonicalRecord()` at `audit.ts:349` (NOT re-ported) per §Sub-decision Q-ζ + Q-G1.3-κ correction (LANDED G1.3).
- Plaintext-to-plaintext NOOP comparison via `plaintextHash` private helper + read+decrypt existing ciphertext inside updateCapsule per Q-G1.3-ζ + V2-CONTENT-NOOP-PATCH correction (LANDED G1.3). Plaintext never logged, returned, or persisted to audit details per RULE 0 cryptographic-confidentiality discipline.
- σ-A existing-content-unreadable conservative-changed fallback per Q-G1.3-σ LOCK Option α (LANDED G1.3).
- CAS conflict standalone post-rollback DENIED audit emission per V5 Patch 1 LOCK Option (b) audit-chain integrity discipline (LANDED G1.3).
- Elixir audit/canonical/idempotency substrate retains support/verification role only per §Sub-decision Q-ι LOCKED default disposition (SKIP G1.4); no Elixir code changes; 8-point grep-grounded evidence preserved at G1.4 H2 SKIP record (LANDED G1.4 `3505fde`).
- Cross-language canonical_record byte-equivalence verified across 16 fixture pairs (12 baseline + 4 NEW mutation-class) per ADR-0033 cross-language data-ownership discipline (LANDED G1.5 `16567eb`).
- CAPSULE_WRITE fixture-drift cleanup at `apps/cosmp_router/test/cosmp_router/storage/postgres_test.exs` per G1.4 SKIP record forward-substrate disposition (LANDED G1.5).
- Full mutation-discrimination test coverage at unit + integration tiers per Q-G1.5-ζ scope LOCK (LANDED G1.5).

### Forward-substrate at G1.6 closure register substantively

The following items remain forward-substrate (NOT closed at G1.6) per substrate-honest disposition:

- D-PRISMA-ECTO-SCHEMA-OWNERSHIP-BOUNDARY — Prisma `db push` drops Ecto-owned tables (`schema_migrations`, `idempotency_keys`); CI handles via Prisma push → Ecto migrate ordering; local `db:push:test` does not auto-restore. Per G1.2 Correction 4 forward-substrate disposition.
- D-STORAGE-DB-ATOMICITY-BOUNDARY — `contentStore.write` stays outside Prisma `$transaction`; pre-existing storage→DB orphan risk. Per G1.3 Correction 4 + Q-G1.3-ρ LOCK. Transactional outbox pattern is canonical remediation; deferred to later mini-arc if Founder authorizes.
- `@niov/database` MutationType re-export cleanup — G1.3 imports MutationType direct from `@prisma/client`; future cosmetic consolidation via `@niov/database/index.ts` re-export per G1.3 Correction 9d.
- `CapsuleMetadata` mutation_type field extension — `capsule.ts` CapsuleMetadata interface error message "and 6 more" reflects mutation_type now in Prisma client; type-drift cleanup forward-substrate.
- CI unit-tier label staleness — `.github/workflows/ci.yml` labels Unit tier as `(371 tests)` but actual count is 519 post-G1.5; cosmetic cleanup forward-substrate.
- Gate 19 grep false-positive refinement — G1.3 V5 Gate 19 grep pattern `return.*plaintext\b` matched function parameter name `plaintext` in `plaintextHash` helper return statement; substantively PASS by inspection. Future grep-pattern refinement forward-substrate.
- ADR-0042 §Sub-decision Q-μ idempotency_test.exs / write_or_replay/6 reference drift — referenced Elixir wrapper does not exist in current substrate; G1.4 SKIP record + G1.5 Q-G1.5-δ LOCK confirm SKIP. Forward-substrate if Founder later authorizes Elixir-idempotency mini-arc.

### Sub-arc 2 status at Gap 1 closure register substantively

**Gap 1 Capsule Mutation Discrimination CLOSED** substantively at G1.6 register substantively per the 6-commit mini-arc lineage above.

**Sub-arc 2 remains IN FLIGHT** pending Gap 3 (ADR-0043 pgvector Embedding) + Gap 4 (ADR-0044 Decay Execution Formalization) + Gap 5 (ADR-0045 Capsule-Level Staleness Detection) + optional Gap 6 (ADR-0046 AI_AGENT EntityType-Discriminated Capsule Routing) per ADR-0041 CL.1 scope patch register substantively. Final Sub-arc 2 closure cascade awaits all per-gap mini-arcs G1 + G3 + G4 + G5 + optional G6 landing and final Sub-arc 2 closure docs cascade per Founder CL.1 scope patch substantively.

**ADR-0041 amendment at G1.6: NONE** per Q-G1.6-β LOCK. ADR-0041 remains Proposed per CL.1 scope patch; Gap 1 closure progress documented at this ADR-0042 §G1.6 H2 + section-12-progress + CURRENT_BUILD_STATE substantively; no in-place ADR-0041 update fires at G1.6 register substantively.

### G1.6 close authorization lineage

Founder authorization explicit at G1.6 substantive landing per RULE 20 at `[BEAM-CAPSULE-MUTATION-DISCRIMINATION-G1.6-V5-MINIMAL-EXECUTION-REQUEST]`.

Preflight discipline lineage:

- G1.6.0 wide preflight per `[BEAM-CAPSULE-MUTATION-DISCRIMINATION-G1.6-PREFLIGHT]` mapped 5 closure surfaces (ADR-0042 + section-12-progress + CURRENT_BUILD_STATE + architecture/README + CLAUDE.md) + analyzed candidate ADR-0035 cluster expansion observation.
- G1.6 Q-lock disposition fired at `[BEAM-CAPSULE-MUTATION-DISCRIMINATION-G1.6-QLOCK]`: Q-G1.6-α INCLUDE 1 ADR-0035 observation (D-TEST-TIER-WAIVER-SCOPE-PRECISION as 36th canonical) + Q-G1.6-β NO ADR-0041 amendment + Q-G1.6-γ INCLUDE CURRENT_BUILD_STATE H2 header visibility update.
- G1.6 paste-authoring discipline: V1 → V2 → V3 → V4 → V5 redraft cycle applied at substrate-honest pre-execution discipline register per RULE 13; Founder corrections to long prose-heavy pastes drove a switch to a minimal constraint-based execution paste at V5 register substantively.

Gap 1 Capsule Mutation Discrimination CLOSED at canonical-state register substantively. ADR-0042 Status: Accepted 2026-05-17. Sub-arc 2 closure remains forward-substrate per ADR-0041 CL.1 scope patch substantively pending Gap 3/4/5/optional 6 mini-arcs + final Sub-arc 2 closure cascade.
