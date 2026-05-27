# ADR-0021: Capsule Type Extension Protocol

**Status:** Accepted
**Date:** 2026-05-10
**Trigger:** Operator directive following Step 2A glossary canonicalization (74b2765) — future CapsuleType enum additions must not block downstream development; codify the extension protocol as canonical architectural decision and forward-design discipline.

## Context

Foundation's `CapsuleType` enum currently defines 20 values categorizing what kind of intelligence a Memory Capsule contains. Glossary entries for all 20 values are canonicalized at commit 74b2765 ([GLOSSARY-G-3]) along with companion DecayType per-value entries and weight-primitive vocabulary. The enum has evolved once before: Section 11A migration extended the original 9 values with 11 conversation/work-pattern/extracted-intelligence types (CONVERSATION_LEARNING through CORRECTION).

Operator directive (May 2026, post-Step-2A): future Capsule type additions must be operationally non-blocking. New application categories may surface intelligence kinds not represented in the current 20-value enum. The substrate must accommodate manual additions without forcing widespread refactoring or build breakage.

Investigation surfaced that substrate is already largely non-blocking by current architecture:
- Every CapsuleType usage outside one deliberate-blocker surface is type-only (imports, field declarations) or string-literal fixtures
- Zero exhaustive-switch + `assertNever` patterns
- Zero `Object.values(CapsuleType)` dynamic-iteration patterns
- Test fixtures use string literals; new enum values don't auto-include in tests but don't break existing fixtures

One deliberate-blocker surface exists: `PRICING_TABLE` (`Record<CapsuleType, number>` at `apps/api/src/services/monetization/monetization.service.ts:30`). When Section 11A added 11 new types, the resulting exhaustiveness violation was absorbed by the 12-error TypeScript baseline tolerance per ADR-0015 Decision B. The build did not break; pricing decisions for new types could be considered without time pressure.

Foundation uses Prisma `db push` model — no migrations directory exists. Schema-side enum extension is a single mechanical step: edit `packages/database/prisma/schema.prisma` enum + run `npm run db:push`.

## Decision

Codify the **Capsule Type Extension Protocol** as canonical architectural decision record. The protocol governs all future additions to the `CapsuleType` enum:

### Step 1 — Schema layer

Edit `packages/database/prisma/schema.prisma` `enum CapsuleType` to add new value(s). Run `npm run db:push` to propagate to database. No migration files; no separate migration step.

### Step 2 — Glossary layer

Add per-type entry to `docs/reference/glossary.md` following the F-B format precedent established at 74b2765:

```
**<TYPE> Capsule.** A Capsule type carrying [semantic description] —
[concrete content elements]. [Distinguishing characteristic vs adjacent
types where helpful]. See `packages/database/prisma/schema.prisma`
CapsuleType enum.
```

Position alphabetically (case-insensitive) within the appropriate section. Create new section header if the new type starts a previously-empty letter section. Update collective Capsule Type entry pointer only if the entry's framing materially changes.

### Step 3 — Application layer (the one deliberate-blocker surface)

Update `PRICING_TABLE` in `apps/api/src/services/monetization/monetization.service.ts` to include the new type's monetization rate. This is the only required application-layer update for any new CapsuleType.

The 12-error TypeScript baseline tolerance (ADR-0015 Decision B) absorbs temporary exhaustiveness violation while the pricing decision is considered. The build does not break. The deliberate-blocker is intentionally tolerant: pricing decisions warrant deliberate consideration rather than time-pressure expediency.

### Engineering-pattern discipline (forward)

Future code introducing CapsuleType handling must adhere to these patterns:

**Allowed (non-blocking):**
- `type` imports of CapsuleType
- Field declarations using CapsuleType as type annotation
- Hardcoded subset arrays (`[CapsuleType.FOUNDATIONAL, CapsuleType.IDENTITY]`) for deliberate selective handling
- String-literal test fixtures (`capsule_type: "PREFERENCE"`)

**Deliberate-blocker (currently one; future additions require ADR amendment):**
- `Record<CapsuleType, T>` for pricing/configuration tables where exhaustiveness is part of the contract
- Tolerated via 12-error TypeScript baseline; documented as deliberate

**Forbidden going forward (would silently block legitimate extensions):**
- Exhaustive `switch` statements over CapsuleType with `assertNever` defaults
- `Object.values(CapsuleType)` / `Object.keys(CapsuleType)` iteration patterns where the iteration semantics change with new types
- Hardcoded type-count assertions (`expect(types.length).toBe(20)`)

If future application-layer requirements demand exhaustiveness for a new surface, the surface joins PRICING_TABLE as a documented deliberate-blocker and ADR-0021 is amended to enumerate it.

### Invariant — extensions only; no removals or renames

The existing 20 CapsuleType values are substrate vocabulary referenced by:
- US 12,517,919 patent claims (COSMP/DMW protected mechanism — Capsule type categorization is part of the patented architecture)
- COSMP specification operations
- RAA 12.7 §3.3 (FOUNDATIONAL retrieval-privilege class)
- Glossary canonical entries (74b2765 — 20 per-type entries)
- Substrate code paths in apps/api/src/services/

The 20 existing values cannot be removed, renamed, or have their semantics altered. They are immutable canonical record on origin/main — patent-implementation-evidence per the cryptographically-timestamped commit history. Extensions extend the record; nothing rewrites it.

This invariant is non-negotiable. Removal or renaming would break:
- Patent-implementation-evidence continuity (the substrate's contemporaneous record of practicing the patented invention)
- Cross-document canonical citations (RAA 12.7, glossary, ADRs, future RAAs)
- Application-layer code paths that match on specific type values
- Test fixtures asserting specific type semantics

If a value's semantics need to evolve, the path is: add a new value with the refined semantics; deprecate the old value via documentation and application-layer migration; the old value persists in the enum indefinitely as part of the canonical record.

## Rationale

**Why ADR-0021 distinct from ADR-0009.** ADR-0009 locks the COSMP 7-operation enumeration: reductions forbidden, additions require patent counsel review and a superseding ADR. The COSMP operations enum is protocol-layer — the 7-operation count IS the protocol surface, and the count itself is part of patent claim coverage.

CapsuleType is a different category. CapsuleType is content-classification-layer — the substrate categorizes intelligence into types, and the type set evolves as application categories surface new intelligence kinds. Patent claim coverage applies at the substrate architecture level (the existence of typed Capsules within a Three-Wallet Architecture; the COSMP operations governing them; the retrieval/decay/feedback dynamics) rather than at the enumeration count level.

Both enums are patent-relevant. They have different evolution disciplines. ADR-0021 establishes the parallel discipline for CapsuleType's content-classification category.

**Why canonicalize existing posture.** Substrate is already largely non-blocking by current architecture. ADR-0021's primary value is preventing future contributors (human or AI) from accidentally introducing exhaustive patterns that would break the implicit posture. Without canonical record, the discipline is folk knowledge subject to drift. With ADR-0021, the discipline is canonical and verifiable.

**Why preserve the deliberate-blocker.** PRICING_TABLE's exhaustiveness is intentional — pricing for monetization is application-layer policy that benefits from explicit consideration of every Capsule type's economic value. The 12-error baseline tolerance is the right mechanism: TypeScript flags the gap; CI passes via baseline tolerance; pricing decisions happen on architectural-decision time horizons rather than schema-edit time horizons.

**Why the existing 20 values are immutable.** Adversarial-actor protection. Per memory entry #12, every commit on origin/main is contemporaneous patent-implementation evidence. The existing 20 values are part of the cryptographically-timestamped implementation record. If an adversarial actor (such as one attempting to build the patented architecture without licensing) later claims the substrate "doesn't really cover" some category of intelligence, the canonical record on origin/main shows the substrate has carried that category since the relevant commit. Removal or renaming would weaken this evidence chain.

## Consequences

**Easier:**
- Forward velocity preserved — new CapsuleType values can be added with single-step schema edit + glossary entry + PRICING_TABLE update
- Application-layer pricing decisions can defer via 12-error baseline while considered
- Future contributors have canonical guidance on engineering patterns
- Patent-implementation-evidence chain continuous (extensions extend; nothing rewrites)
- Glossary canonicalization protocol established (74b2765 precedent referenced)

**Harder:**
- One deliberate-blocker surface (PRICING_TABLE) to track when extending the enum
- Future contributors must internalize engineering-pattern guidance to avoid silent blockers
- ADR-0021 must be referenced (or its discipline known) when reviewing PRs that introduce CapsuleType handling

**Neutral but worth noting:**
- The 20 existing values are now formally immutable; semantic evolution requires additive paths
- New surfaces requiring exhaustiveness become deliberate-blocker additions with ADR amendment

## Alternatives Considered

**ADR-0009-style locked enum.** Rejected. CapsuleType extensions are operationally normal (Section 11A precedent: 11-value extension); locking would prevent legitimate forward evolution. CapsuleType's patent-claim coverage is at the substrate-architecture level rather than the enumeration-count level.

**Per-type configuration table.** Deferred to RAA 12.8 (Weighting Architecture). If RAA 12.8 introduces per-type baseline weights as substrate property, it may necessitate a per-type configuration table that becomes a second deliberate-blocker surface. ADR-0021 will be amended at that time to enumerate the additional surface.

**Exhaustive-switch enforcement everywhere.** Rejected. Would block legitimate extensions silently. Exhaustiveness in TypeScript is a tool for specific situations (pricing tables, compliance-critical code paths) — it should be deliberate, not pervasive.

**Permitting renames of existing values.** Rejected. Breaks patent-implementation-evidence continuity, breaks cross-document canonical citations, breaks application-layer pattern matching. Additive evolution only.

## Forward implications

ADR-0021's discipline propagates to:

- **RAA 12.8 (Weighting Architecture, queued).** When per-type baseline weights are designed, the new configuration table becomes a deliberate-blocker surface; ADR-0021 amendment enumerates it.
- **Step 2F glossary refresh (queued).** When RAA 12.8 ships and substrate carries richer per-type weight semantics, the 20 glossary entries refresh; the F-B format and citation discipline established in 74b2765 hold.
- **Otzar application development (queued, post-Foundation-completion per memory entry #27).** Otzar may surface new intelligence kinds requiring CapsuleType extensions. ADR-0021 governs the additions.
- **Future ADRs introducing CapsuleType-handling patterns.** New ADRs reference ADR-0021's engineering-pattern discipline rather than re-litigating the patterns.
- **Patent counsel review for CapsuleType extensions.** Unlike ADR-0009's COSMP enum, CapsuleType extensions do not require patent counsel review per-extension. The patent claim coverage is at substrate-architecture level. However, extensions that alter substrate architecture (e.g., introducing a new wallet type, changing retrieval semantics) would require ADR + counsel review separately.

## References

- ADR-0001 (Three-Wallet Architecture — substrate context for CapsuleType)
- ADR-0009 (COSMP 7-Operation Enum Lock — parallel pattern; locked-enum vs extensible-enum distinction)
- ADR-0015 Decision B (12-error TypeScript baseline; mechanism for deliberate-blocker tolerance)
- ADR-0020 (Two-Register IP Discipline; Register 2 voice applied throughout this ADR)
- 74b2765 ([GLOSSARY-G-3]; canonicalized 20 CapsuleType per-type entries — extension protocol must include glossary step)
- RAA 12.7 §3.3 (FOUNDATIONAL retrieval-privilege class — patent-relevant invariant)
- RAA 12.8 Weighting Architecture (queued; future per-type baseline weight design)
- `packages/database/prisma/schema.prisma` — CapsuleType enum (canonical source of truth)
- `apps/api/src/services/monetization/monetization.service.ts:30` — PRICING_TABLE (the deliberate-blocker surface)
- US 12,517,919 — COSMP/DMW patent (substrate-architecture coverage)

Bidirectional citations (cited from):

- ADR-0051 (Otzar Chat Transparency and COE-Governed Retrieval Surfacing) — cites this ADR for the CapsuleType extension protocol; ADR-0051 introduces **no new CapsuleType or source enum** in Wave 1 (ingestion stays on the existing `POST /cosmp/capsule` write path), preserving this ADR's extension-only invariant.
