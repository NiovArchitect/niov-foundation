# ADR-0036: REGULATOR Principal + Lawful-Basis Attestation Pattern

## Status

Proposed 2026-05-15

Transitions to **Accepted** at the Sub-box 3 mini-arc closure commit (sub-phase 7 `[SUB-BOX-3-CLOSURE]` per ADR-0036 §11 Implementation Detail). This sub-phase 1 commit lands the decision substrate; sub-phases 2-7 implement.

## Date

2026-05-15

## Trigger

`docs/COMPLIANCE_ARCHITECTURE_REVIEW.md` Section 2 Dimension 2.1 (REGULATOR Entity Type) and Dimension 2.2 (Lawful-Basis Attestation) both at **RED** status with **Medium (Section 12.5 sub-box)** remediation paired. CAR §Recommended Sequencing names this work as **Sub-box 3** of the dependency-ordered Section 12.5 sub-boxes. CAR §2.2 marks the lawful-basis attestation pattern **PATENT-RELEVANT under Discipline B** at Family 1 — extends US 12,164,537 (COSMP) and US 12,399,904 (DMW) into regulatory-access territory.

This ADR is sub-phase 1 of the 7-sub-phase Sub-box 3 mini-arc per Q3 LOCKED operator-tier authorization at sub-phase 13 closure register. The implementation sub-phases (2-7) extend the audit-chain substrate, schema, services, routes, and tests; this sub-phase 1 documents the substrate-architectural decisions before implementation.

## Context

**Foundation gap (CAR §2.1 verbatim)**: `schema.prisma:343-350` enumerates 6 `EntityType` values (`PERSON`, `COMPANY`, `AI_AGENT`, `DEVICE`, `APPLICATION`, `GOVERNMENT`). `GOVERNMENT` represents a **tenant** government (a public-sector agency operating Foundation as their own tenant) — not an **external authority** (a SEC examiner, OSHA inspector, HHS auditor, EU DPA official accessing another tenant's data under lawful authority). Conflating the two is a correctness hazard per CAR §2.1: a SEC examiner reading a regulated bank's data must not have the same TAR shape as the SEC's own internal deployment of Foundation. The TAR (Trust Anchor Record at `schema.prisma:184-212`) capability flags are tenant-internal (`can_login`, `can_read_capsules`, etc.); no regulator-jurisdictional or authority-scope fields exist.

**Foundation gap (CAR §2.2 verbatim)**: `AuditEvent` schema at `schema.prisma:261-282` has no `lawful_basis_*` fields. The `details Json @default("{}")` column could carry them as free-Json, but no structured contract exists. The audit chain is robust (Dimension 1.2 GREEN per ADR-0002) but cannot distinguish "the org's own admin read this data" from "the SEC examiner read this data under subpoena 24-cv-1234 valid through 2026-08-01." For regulatory inbound access to be defensible, the lawful basis must be an audit field, not a free-Json key.

**Patent-implementation evidence dimension (CAR §2.2 verbatim under Discipline B)**: "The pattern 'lawful-basis attestation cryptographically linked to a COSMP capsule access record via the existing hash-chain audit-of-record' extends US 12,164,537 (COSMP) and US 12,399,904 (DMW) into regulatory-access territory. The novelty over generic 'log who accessed data' prior art is the *binding* — the lawful basis attestation is included in the canonical hash input ... so regulator authority cannot be retroactively asserted or denied without breaking chain verification."

**Substrate constraints**:
- ADR-0002 append-only audit chain (`audit_events_immutable` BEFORE DELETE trigger) is the foundation; any lawful-basis substrate must extend, not replace.
- ADR-0033 §4a TS↔Elixir byte-equivalence at `canonical_record/1` (12 fields; 10 fixture pairs in CI at every run). Any extension must preserve byte-equivalence at both TypeScript (`packages/database/src/queries/audit.ts:290`) and Elixir (`apps/cosmp_router/lib/cosmp_router/audit.ex:143`) registers.
- ADR-0026 `requireDualControl` middleware + `EscalationType.DUAL_CONTROL_REQUIRED` + privileged-endpoint registry — Sub-box 1 substrate available for regulator-grant-route binding.
- ADR-0019 cryptographic-suite posture — SHA-256 canonical for chain links; post-quantum-ready by primitive selection.
- ADR-0020 two-register IP discipline — Register-2 (concrete form) is patent-implementation evidence; this ADR substantively lands Register-2 evidence for Family 1.

**Dependency-ordering observation**: CAR §Recommended Sequencing lists **Sub-box 2 (Jurisdiction Tagging per CAR 1.6 + 2.4)** as upstream of Sub-box 3. CAR Sub-box 2 substrate (Entity / MemoryCapsule / AuditEvent / OrgSettings jurisdiction fields + `assertJurisdictionalScope()` runtime check) is **NOT YET LANDED** at HEAD `a52d6d8`. Per operator-tier decision at sub-phase 13 closure register (Sub-box 3 pre-flight Q1 LOCKED Option A), Sub-box 3 ships its own `LawfulBasis.jurisdiction_invoked` field as a narrow self-contained jurisdiction primitive; the full CAR Sub-box 2 substrate (Entity/Capsule/Audit jurisdiction tagging at the schema register) remains explicitly QUEUED. ADR-0036 must not claim CAR Sub-box 2 is landed.

The progress tracker `Sub-box 2 Phase 1` (ADR-0026 dual-control middleware) and `Sub-box 2 Phase 2` (Block B BEAM mini-arc per ADR-0028) substantively use the same "Sub-box 2" label but for different scopes than CAR's "Sub-box 2 — Jurisdiction Tagging". This numbering drift is canonical at substrate-state ground truth register per **D-CAR-SUB-BOX-NUMBERING-DRIFT** substrate-build observation promoted at ADR-0035 §9 35th canonical at this commit.

## Decision

Foundation will introduce a REGULATOR principal class **distinct** from GOVERNMENT, a `LawfulBasis` model with cryptographic binding to the COSMP audit chain, three new `event_type` literals (REGULATOR_ACCESS_GRANTED / REVOKED / EXPIRED), and a credentialing-authority verification pattern. Decisions break into 7 sub-decisions, enumerated in §4 below.

The implementation lands across a 7-sub-phase mini-arc per Q3 LOCKED Option α: (1) ADR-0036 (this commit) → (2) Schema substrate → (3) TS service substrate → (4) Audit-chain canonical_record/1 extension + byte-equivalence → (5) Route substrate + dual-control binding → (6) COSMP enforcement + integration tests → (7) Closure cascade.

## Sub-decision 1: REGULATOR EntityType distinct from GOVERNMENT

Foundation will add `REGULATOR` to the `EntityType` enum at `packages/database/prisma/schema.prisma:343-350`. REGULATOR represents an **external authority accessing tenant data under lawful authority** — a SEC examiner, OSHA inspector, HHS auditor, EU DPA official. This is **distinct** from GOVERNMENT, which represents a **tenant** government (a public-sector agency operating Foundation as their own tenant).

**Conflation is a correctness hazard** per CAR §2.1 verbatim: "a SEC examiner reading a regulated bank's data must not have the same TAR shape as the SEC's own internal deployment of Foundation."

Authentication semantics differ: GOVERNMENT entities authenticate via the same flows as PERSON / COMPANY (their own login + TAR + Member status). REGULATOR entities authenticate via credentialed authority (Sub-decision 7).

## Sub-decision 2: Regulator-specific TAR fields

Foundation will add 3 fields to `TokenAttributeRepository` at `schema.prisma:184-212`:
- `regulator_jurisdiction: String[]` — the jurisdictions under which this regulator holds authority (e.g., `["US-FEDERAL"]`, `["EU-DE", "EU-FR"]`).
- `regulator_authority_scope: String[]` — the named authority scopes (e.g., `["HEALTHCARE_HIPAA_AUDIT"]`, `["SECURITIES_EXAMINATION"]`).
- `regulator_credentialed_by: String?` — the credentialing authority name (e.g., `"DOJ"`, `"EU_DPA"`, `"FDA"`). Optional because credentialing source may differ per jurisdiction.

Fields are populated at REGULATOR onboarding and rotated only via dual-control administrative flow per ADR-0026 + Sub-decision 6.

## Sub-decision 3: LawfulBasis Prisma model + LawfulBasisType enum

Foundation will add a NEW Prisma model `LawfulBasis` with the following canonical schema (exact field names + types in sub-phase 2 schema substrate):

- `basis_id: String @id @default(uuid()) @db.Uuid` — primary key
- `basis_type: LawfulBasisType` — enum (see below)
- `basis_reference: String` — case ID, subpoena ID, court order number, DPA request reference, treaty article (per basis_type)
- `jurisdiction_invoked: String` — the jurisdiction under which this basis is invoked (e.g., `"US-FEDERAL"`, `"EU-DE"`)
- `valid_from: DateTime` — when this basis becomes effective (UTC, millisecond precision per ADR-0033 D-5BII-EXEC-2)
- `valid_until: DateTime` — when this basis expires (lawful-basis windows are **always time-bounded** per CAR §2.2; expired-basis detection canonical at sub-phase 6 enforcement register)
- `audit_id: String? @db.Uuid` — optional FK to AuditEvent.audit_id; populated AFTER the access audit event is written (avoids circularity per Sub-decision 5)
- `chain_hash: String` — SHA-256 hash of the canonical LawfulBasis content (see Sub-decision 5); load-bearing for cryptographic binding
- `created_at: DateTime @default(now())`
- `updated_at: DateTime @updatedAt`

NEW `LawfulBasisType` enum with 6 values per CAR §2.2 verbatim:
- `SUBPOENA`
- `REGULATORY_AUTHORITY`
- `COURT_ORDER`
- `DPA_REQUEST`
- `MLAT_REQUEST`
- `CONSENT_OF_DATA_SUBJECT`

**Time-boundedness invariant**: `valid_until` is NOT NULL (no perpetual lawful basis). Database-tier constraint at sub-phase 2 schema register; runtime check at sub-phase 6 enforcement register.

## Sub-decision 4: AuditEvent type literals (REGULATOR_ACCESS_*)

Foundation will add 3 new string literals for the existing `AuditEvent.event_type` String column at `schema.prisma:263`:
- `REGULATOR_ACCESS_GRANTED` — emitted when a regulator access grant is issued (post-dual-control approval per Sub-decision 6)
- `REGULATOR_ACCESS_REVOKED` — emitted when a regulator access grant is revoked before expiration
- `REGULATOR_ACCESS_EXPIRED` — emitted when a regulator access grant reaches `valid_until` (scheduler-emitted at sub-phase 6 enforcement register)

`event_type` is a String column (not enum); these literals are canonical at the documented event-type register. The TS audit allow-list (`packages/database/src/queries/audit.ts` event-type enumeration) and Elixir audit registry will both add these literals at sub-phase 4 audit-chain extension register.

## Sub-decision 5: Hybrid lawful-basis cryptographic binding (lawful_basis_id + lawful_basis_chain_hash)

Foundation will extend `canonical_record/1` at both TypeScript (`packages/database/src/queries/audit.ts:290`) and Elixir (`apps/cosmp_router/lib/cosmp_router/audit.ex:143`) registers to include 2 NEW fields, growing the canonical input from 12 → 14 fields per Q2 LOCKED Option γ (hybrid):

```typescript
// Extended canonical_record/1 — TS register
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
    parts.lawful_basis_id ?? "",          // NEW field 13
    parts.lawful_basis_chain_hash ?? "",  // NEW field 14
  ].join("|");
}
```

**Elixir mirror** (load-bearing for byte-equivalence at substantive register):
```elixir
def canonical_record(parts) do
  [
    # ... 12 existing fields ...
    parts.lawful_basis_id || "",          # NEW field 13
    parts.lawful_basis_chain_hash || ""   # NEW field 14
  ]
  |> Enum.join("|")
end
```

**LawfulBasis content commitment** — `lawful_basis_chain_hash` is computed at LawfulBasis row creation as `sha256_hex(lawful_basis_canonical_record(...))` where `lawful_basis_canonical_record/1` is a NEW canonical function at both registers that serializes the load-bearing LawfulBasis fields (basis_type | basis_reference | jurisdiction_invoked | valid_from-ISO | valid_until-ISO) via pipe-joined canonical form analogous to `canonical_record/1`. The `audit_id` FK is **NOT** included in the LawfulBasis canonical content to avoid circularity (LawfulBasis content hashed BEFORE the AuditEvent that references it is written).

**Backwards-compatibility canonical at substantive register**: prior audit events default to `lawful_basis_id = ""` and `lawful_basis_chain_hash = ""` for the canonical_record/1 input. Existing chain verification produces deterministic output for pre-LawfulBasis events (no chain break; substrate-honest extension).

**Patent-implementation evidence binding (CAR §2.2 Family 1)**: tampering with the LawfulBasis row content changes the `lawful_basis_chain_hash` value. The AuditEvent's `event_hash` is computed from `canonical_record/1` which includes `lawful_basis_chain_hash`. Therefore tampering with LawfulBasis content invalidates the AuditEvent's `event_hash` and breaks chain verification per ADR-0002. This is the cryptographic binding canonical at substantive register.

**Byte-equivalence preservation**: per ADR-0033 §4 + ADR-0035 §9 D-5BII-EXEC-2 millisecond-precision canonical, the 14-field canonical_record/1 must produce byte-identical output at TS and Elixir registers. The 10 fixture pairs at `apps/cosmp_router/test/cosmp_router/audit/canonical_record_test.exs` extend with NEW lawful-basis pairs at sub-phase 4; CI verifies byte-equivalence at every run per ADR-0011 + ADR-0015.

## Sub-decision 6: Dual-control binding for regulator-grant routes

Foundation will wire the `requireDualControl` middleware (ADR-0026 per-route binding discipline at `apps/api/src/middleware/dual-control.middleware.ts`) to the regulator-grant route. Per ADR-0026, the route is added to the `PRIVILEGED_ENDPOINTS` runtime registry at `apps/api/src/security/privileged-endpoints.ts`.

Regulator-grant flow per Sub-decision 6:
1. Caller initiates `POST /api/v1/regulator/grant` with `target_regulator_entity_id`, `LawfulBasis` payload, `target_capsule_ids[]`.
2. `requireDualControl` preHandler intercepts; verifies `APPROVED` `EscalationRequest` with `escalation_type: "DUAL_CONTROL_REQUIRED"` per ADR-0026 §2 verification flow.
3. On APPROVED + valid approver (source ≠ resolver per ADR-0026 §2): handler creates LawfulBasis row → emits `REGULATOR_ACCESS_GRANTED` AuditEvent including `lawful_basis_id` + `lawful_basis_chain_hash` in canonical_record/1.
4. On not-yet-approved: `requireDualControl` creates PENDING EscalationRequest; returns 403 with escalation_id; second approver `APPROVE`s via existing `POST /api/v1/escalations/:id/approve` flow; caller re-issues with escalation_id.

`REGULATOR_ACCESS_REVOKED` route also gates via `requireDualControl`. `REGULATOR_ACCESS_EXPIRED` is scheduler-emitted (system actor; no dual-control gate; expired-basis detection at sub-phase 6 enforcement register).

## Sub-decision 7: REGULATOR authentication flow (credentialing-authority pattern)

Foundation will implement an initial REGULATOR authentication flow at sub-phase 3 service substrate register substantively per Q4 LOCKED Option α:

**Credentialing-authority pattern**:
- REGULATOR onboarding requires a **signed credential** from a trusted credentialing authority. The credential is a JWT or cryptographic signature naming the regulator entity + jurisdiction(s) + authority scope(s) + credentialing authority identifier + valid_until timestamp.
- Credentialing authority identifiers are canonical strings populated at `TokenAttributeRepository.regulator_credentialed_by` (Sub-decision 2). Initial implementation supports a configurable trusted-authority registry; examples may include `"DOJ"` / `"EU_DPA"` / `"FDA"` as documented authority classes but **does not hard-code geopolitical assumptions** per operator-tier directive.
- Verification at authentication time: signature validates against trusted-authority registry; jurisdiction + scope decoded from credential; LawfulBasis `jurisdiction_invoked` verified against `regulator_jurisdiction` at sub-phase 6 enforcement register.

**Forward-queued** (NOT in Sub-box 3 mini-arc; explicitly forward-looking at canonical register):
- National PKI integration (US Federal PKI, UK Government Gateway, etc.)
- EU eIDAS qualified-trust-service integration
- Cross-jurisdictional credential federation
- Real-time credentialing-authority revocation list (CRL) verification

These are concrete external-system integrations; canonical extension lands at a future ADR amendment when production deployment requirements surface.

## Sub-decision 8 (deferred per Q8 LOCKED Option γ): SYSTEM_PRINCIPAL extension

The SYSTEM_PRINCIPAL canonical at substantive register for regulator audit emissions is **explicitly deferred** to sub-phase 3 service-substrate pre-flight register substantively per Q8 LOCKED Option γ operator-tier authorization at canonical decision register.

**Open implementation decision** (to be resolved at sub-phase 3 pre-flight):
- Option α: Add `:cosmp_router_regulator` (or similar) SYSTEM_PRINCIPAL canonical mirroring the cosmp_router 5th-principal precedent per ADR-0033 D-5BII-EXEC-3
- Option β: Reuse existing `:system` SYSTEM_PRINCIPAL for regulator-grant audit events
- Option γ: Other principal shape (e.g., per-regulator dynamic principal)

This ADR explicitly marks no regulator audit-emission principal shape as implementation-proven yet. The choice is load-bearing for actor-of-record discipline + audit-chain attribution canonical at substantive register substantively; sub-phase 3 pre-flight will surface the substrate-architectural decision questions.

## Patent-Implementation Evidence (ADR-0020 Register-2)

Per ADR-0020 two-register IP discipline canonical: Register-2 (concrete form — the implementation record) is patent-implementation evidence. ADR-0036 substantively lands Register-2 evidence for **Family 1** per CAR §Recommended Sequencing.

**Patent claim binding (CAR §2.2 verbatim)**:

> The pattern "lawful-basis attestation cryptographically linked to a COSMP capsule access record via the existing hash-chain audit-of-record" extends US 12,164,537 (COSMP) and US 12,399,904 (DMW) into regulatory-access territory. The novelty over generic "log who accessed data" prior art is the *binding* — the lawful basis attestation is included in the canonical hash input (`audit.ts:178-191`) so regulator authority cannot be retroactively asserted or denied without breaking chain verification. This is specifically a COSMP extension, not a generic audit feature.

**Foundation Register-2 evidence at canonical register substantively (this ADR + sub-phases 2-7 substrate)**:
- LawfulBasis Prisma row (Sub-decision 3)
- `lawful_basis_id` + `lawful_basis_chain_hash` in `canonical_record/1` at TS + Elixir registers (Sub-decision 5; hybrid binding per Q2 LOCKED Option γ)
- `lawful_basis_canonical_record/1` content-hash function at both registers (Sub-decision 5)
- Byte-equivalence verified at 10+ fixture pairs in CI at every run (extended at sub-phase 4)
- REGULATOR_ACCESS_GRANTED/REVOKED/EXPIRED event types (Sub-decision 4)
- COSMP read/share flow lawful-basis enforcement (sub-phase 6)
- Dual-control on regulator-grant route (Sub-decision 6 + ADR-0026 binding)

**Sufficiency at canonical register substantively**: the hybrid binding (Sub-decision 5 Q2 LOCKED Option γ) preserves the patent-evidence binding claim — LawfulBasis content tampering invalidates `lawful_basis_chain_hash`; canonical_record/1 includes `lawful_basis_chain_hash`; AuditEvent `event_hash` breaks on tampering; ADR-0002 BEFORE DELETE trigger prevents deletion. The chain of evidence is intact at substrate-architectural register.

**Patent-evidence scope NOT in Sub-box 3** (forward-queued for future ADRs):
- CAR §3.2 Stage A BBS+ selective disclosure on lawful-basis fields (CAR Sub-box 7 Family 5)
- Stage B zk-SNARK predicate-evaluation proofs (CAR Bucket C item 2)
- Cross-jurisdictional treaty routing operational layer (CAR Bucket C item 3)

## Implementation Detail

**Sub-box 3 mini-arc shape** (7 sub-phases per Q3 LOCKED Option α canonical at substantive register substantively):

1. **Sub-phase 1** `[SUB-BOX-3-ADR]` (this commit) — ADR-0036 + section-12-progress.md CAR Sub-box 2 QUEUED row + ADR-0035 §9 35th promotion + RULE 14 back-citations to ADR-0019/0020/0026/0033. Docs-only.
2. **Sub-phase 2** `[SUB-BOX-3-SCHEMA]` — Prisma schema: REGULATOR EntityType + 3 TAR fields + LawfulBasis model + LawfulBasisType enum + 3 event_type literals (REGULATOR_ACCESS_*). Migration via `db:push:test` per ADR-0025 schema-push-target discipline.
3. **Sub-phase 3** `[SUB-BOX-3-SERVICES]` — TypeScript services: NEW `packages/database/src/queries/regulator.ts` + NEW `packages/database/src/queries/lawful-basis.ts` + NEW `apps/api/src/services/regulator/regulator.service.ts`. SYSTEM_PRINCIPAL decision resolved at this sub-phase pre-flight per Sub-decision 8.
4. **Sub-phase 4** `[SUB-BOX-3-AUDIT-CHAIN]` — Audit-chain extension: MOD `packages/database/src/queries/audit.ts` `canonicalRecord` (12 → 14 fields per Sub-decision 5) + MOD `apps/cosmp_router/lib/cosmp_router/audit.ex` `canonical_record/1` (mirror) + NEW `lawful_basis_canonical_record/1` at both registers + extended fixture pairs at `canonical_record_test.exs`.
5. **Sub-phase 5** `[SUB-BOX-3-ROUTES]` — Route substrate: NEW `apps/api/src/routes/regulator.routes.ts` + MOD `apps/api/src/routes/platform.routes.ts` (dual-control binding per Sub-decision 6) + MOD `apps/api/src/security/privileged-endpoints.ts` (add REGULATOR_ACCESS_GRANT + REGULATOR_ACCESS_REVOKE to PRIVILEGED_ENDPOINTS registry).
6. **Sub-phase 6** `[SUB-BOX-3-COSMP-ENFORCEMENT]` — COSMP enforcement: MOD `apps/api/src/services/cosmp/read.service.ts` + MOD `apps/api/src/services/cosmp/share.service.ts` (require LawfulBasis when `actor.entity_type === "REGULATOR"`; verify `valid_until > now` for time-boundedness; verify `jurisdiction_invoked` ∈ `regulator_jurisdiction`). Integration tests (lawful-basis-required cosmp + dual-control-on-regulator-grant).
7. **Sub-phase 7** `[SUB-BOX-3-CLOSURE]` — Closure cascade: MOD CAR Sub-box 3 status forward → CLOSED + MOD `docs/reference/section-12-progress.md` Sub-box 3 row + MOD `docs/architecture/beam-coordination-canonical-record.md` §11 Forward paths (REGULATOR + lawful-basis substrate moves from forward to landed) + MOD ADR-0036 Status: Proposed → Accepted.

The exact sub-phase decomposition is fixed at canonical register substantively; sub-phase pre-flights may surface refinements per substrate-honest discipline.

## Substrate-Honest Distinctions (what lands in Sub-box 3 vs what stays queued)

**Lands in Sub-box 3 mini-arc (sub-phases 1-7)** at canonical register substantively:
- REGULATOR EntityType + Regulator TAR fields + LawfulBasis model + LawfulBasisType enum
- 3 event_type literals (REGULATOR_ACCESS_GRANTED / REVOKED / EXPIRED)
- Hybrid cryptographic binding (lawful_basis_id + lawful_basis_chain_hash) at TS + Elixir audit registers
- Dual-control gate on regulator-grant routes
- Initial credentialing-authority authentication pattern
- `LawfulBasis.jurisdiction_invoked` field (narrow self-contained jurisdiction primitive for the LawfulBasis row only)

**Stays QUEUED at canonical register substantively** (operator-tier directive at Q1 LOCKED Option A):
- **CAR Sub-box 2 — Jurisdiction Tagging (1.6 + 2.4)**: Entity.jurisdiction + MemoryCapsule.jurisdiction + AuditEvent.jurisdiction + OrgSettings.default_jurisdiction fields are **NOT landed at Sub-box 3**. The schema-level jurisdiction tagging substrate at Entity/MemoryCapsule/AuditEvent/OrgSettings remains explicitly QUEUED per CAR §Recommended Sequencing Sub-box 2 scope. `assertJurisdictionalScope()` runtime check at permission/share/read flows also remains QUEUED.
- National PKI / EU eIDAS / cross-jurisdictional credential federation
- CAR §3.2 Stage A BBS+ selective disclosure
- CAR §3.2 Stage B zk-SNARK predicate proofs
- CAR Bucket C cross-jurisdictional treaty routing operational layer
- CAR Sub-box 7 ComplianceAttestation reports (includes regulator-access subreports per Sub-box 3 → Sub-box 7 downstream dependency)

ADR-0036 must not imply CAR Sub-box 2 is landed. Sub-box 3 ships its own LawfulBasis.jurisdiction_invoked field; broader Entity/Capsule/Audit jurisdiction tagging is its own future mini-arc.

## Consequences

### Easier

- Foundation can defensibly attest to regulatory inbound access at audit-chain register substantively (CAR §2.1 + §2.2 close from RED to GREEN at Sub-box 3 closure).
- Patent-implementation evidence at Family 1 lands at Register-2 (concrete form) per ADR-0020 — substantively load-bearing for prosecution-history continuation work.
- GDPR Article 6 + Article 30 + Schrems II compliance posture is substrate-architecturally established (certifications not claimed; substrate-architectural readiness).
- FedRAMP / SOC 2 audit-tier defensibility extends to regulatory-access scope: the audit chain distinguishes admin-of-record access from regulator access with cryptographic binding.
- Dual-control on regulator-grant routes inherits ADR-0026 substrate; no new dual-control primitive needed.

### Harder

- Audit-chain `canonical_record/1` byte-equivalence rework at TS + Elixir registers; 10+ fixture pairs extended; CI verification rework canonical at substantive register substantively per ADR-0033 substrate-honest discipline.
- Credentialing-authority registry maintenance — initial implementation supports a configurable trusted-authority list; production deployment requires governance over which authorities are trusted at which jurisdictions.
- `LawfulBasis` row lifecycle management — expired-basis detection requires scheduler-emitted REGULATOR_ACCESS_EXPIRED events; periodic-job substrate at sub-phase 6 enforcement register.
- TS↔Elixir byte-equivalence work touches Block B Phase 2 BEAM substrate (CLOSED at 19/19); future canonical_record/1 changes require coordinated TS + Elixir extension.
- SYSTEM_PRINCIPAL decision deferred to sub-phase 3 pre-flight — substrate-architectural decision at canonical register substantively pending; sub-phase 3 pre-flight will resolve.

## Alternatives Considered

### Alternative A — Reuse GOVERNMENT EntityType for regulators (rejected)

Per CAR §2.1 verbatim: "Conflating the two is a correctness hazard: a SEC examiner reading a regulated bank's data must not have the same TAR shape as the SEC's own internal deployment of Foundation." Authentication semantics differ (regulator = external authority via credentialed-authority; GOVERNMENT = tenant via own login + TAR + Member). TAR capability flags differ (regulator needs jurisdiction + authority-scope; GOVERNMENT uses tenant-internal capabilities). REJECTED at substantive register substantively.

### Alternative B — Free-form `AuditEvent.details JSON` for lawful basis (rejected)

Per CAR §2.2 verbatim: "Foundation has no structured lawful-basis primitive. The audit chain is robust (Dimension 1.2 GREEN) but cannot distinguish ... For regulatory inbound access to be defensible, the lawful basis must be an audit field, not a free-Json key." Free-Json prevents structured query (compliance officer cannot SQL-filter by `basis_type`), prevents time-boundedness enforcement (no schema constraint), and prevents cryptographic binding at the canonical-record register substantively without canonical-record/1 changes. REJECTED at substantive register substantively. CAR Tension 5 forward-queue separately for the broader "Json column → typed schema" discipline.

### Alternative C — FK-only binding (lawful_basis_id only, no chain_hash) (rejected per Q2 LOCKED Option γ)

Adds only `lawful_basis_id` to canonical_record/1. LawfulBasis row content is NOT in the audit chain; tampering with LawfulBasis row content does NOT break AuditEvent event_hash. Patent-evidence claim is substantively WEAKER — tampering is detected only at row-content level (existing Prisma update timestamps) not at chain-verification level. Substantively does not satisfy CAR §2.2 "cryptographically linked to a COSMP capsule access record via the existing hash-chain audit-of-record" novelty claim. REJECTED at operator-tier register substantively per Q2 LOCKED.

### Alternative D — Embed all lawful-basis fields directly in canonical_record/1 (rejected per Q2 LOCKED Option γ)

Add 4-6 lawful-basis fields (basis_type + basis_reference + jurisdiction_invoked + valid_from + valid_until + ...) directly to canonical_record/1, growing canonical input from 12 → 18 fields. Maximum cryptographic binding but canonical_record/1 becomes wide + harder to evolve at future ADR amendments; byte-equivalence rework cost grows linearly with field count. REJECTED at operator-tier register substantively per Q2 LOCKED canonical — the hybrid approach (lawful_basis_id + lawful_basis_chain_hash) preserves binding strength via the secondary `lawful_basis_canonical_record/1` content hash while keeping canonical_record/1 narrowly extended (12 → 14 fields).

### Alternative E — Prepend full CAR Sub-box 2 jurisdiction tagging before Sub-box 3 (rejected per Sub-box 3 pre-flight Q1 LOCKED Option A)

Land Entity/MemoryCapsule/AuditEvent/OrgSettings jurisdiction tagging + `assertJurisdictionalScope()` BEFORE Sub-box 3. Cleaner dependency-ordering per CAR §Recommended Sequencing; but pushes Sub-box 3 patent-evidence work back. CAR Sub-box 2 jurisdiction dependency on Sub-box 3 is narrow (only `LawfulBasis.jurisdiction_invoked` field); Sub-box 3 can ship its own self-contained jurisdiction field while broader Entity/Capsule/Audit jurisdiction tagging remains QUEUED. REJECTED at operator-tier register substantively per Q1 LOCKED Option A canonical.

## Forward Queue

- **Sub-box 3 sub-phases 2-7** (this ADR's implementation arc): schema → TS services → audit-chain extension → routes + dual-control binding → COSMP enforcement + tests → closure cascade.
- **SYSTEM_PRINCIPAL decision at sub-phase 3 pre-flight**: Sub-decision 8 resolution.
- **CAR Sub-box 2 — Jurisdiction Tagging (1.6 + 2.4)**: Entity/MemoryCapsule/AuditEvent/OrgSettings jurisdiction tagging + `assertJurisdictionalScope()` runtime check. Independent future mini-arc.
- **National PKI / EU eIDAS integrations** for credentialing-authority verification: forward-queued per Sub-decision 7.
- **CAR Sub-box 7 ComplianceAttestation** (downstream of Sub-box 3 + Sub-box 4 + Sub-box 6): regulator-access subreports in attestation per CAR §3.1.
- **CAR §3.2 Stage A BBS+ selective disclosure** on LawfulBasis fields: forward-queued at CAR Sub-box 7 Family 5.
- **CAR §3.2 Stage B zk-SNARK predicate-evaluation proofs**: forward-queued at CAR Bucket C item 2.
- **CAR Bucket C cross-jurisdictional treaty routing** operational layer: forward-queued.
- **Real-time credentialing-authority revocation (CRL) verification**: forward-queued per Sub-decision 7.

## References

- `docs/COMPLIANCE_ARCHITECTURE_REVIEW.md` §2.1 (REGULATOR Entity Type) + §2.2 (Lawful-Basis Attestation) + §Recommended Sequencing Sub-box 3 — source-of-substance for the architectural why
- ADR-0001 (`docs/architecture/decisions/0001-three-wallet-architecture.md`) — foundational three-wallet architecture; EntityType context
- ADR-0002 (`docs/architecture/decisions/0002-append-only-audit-chain.md`) — `audit_events_immutable` BEFORE DELETE trigger; canonical chain integrity primitive Sub-decision 5 extends
- ADR-0019 (`docs/architecture/decisions/0019-cryptographic-suite-posture.md`) — cryptographic-suite posture; SHA-256 canonical for chain links; post-quantum-ready by primitive selection
- ADR-0020 (`docs/architecture/decisions/0020-two-register-ip-discipline.md`) — two-register IP discipline; Register-2 patent-implementation evidence for Family 1
- ADR-0025 (`docs/architecture/decisions/0025-schema-push-target-discipline.md`) — `db:push:test` discipline for sub-phase 2 schema migration
- ADR-0026 (`docs/architecture/decisions/0026-dual-control-middleware-pattern.md`) — `requireDualControl` + privileged-endpoint registry + per-route binding discipline; Sub-decision 6 binding canonical
- ADR-0027 (`docs/architecture/decisions/0027-contributor-governance.md`) — RULE 20 founder-authorization for this ADR's creation
- ADR-0033 (`docs/architecture/decisions/0033-beam-persistence-idempotency-audit-chain-architecture.md`) — `canonical_record/1` TS↔Elixir byte-equivalence; 10 fixture pairs; D-5BII-EXEC-2 millisecond-precision canonical; Sub-decision 5 hybrid binding extends
- ADR-0035 (`docs/architecture/decisions/0035-substrate-build-discipline-canonical.md`) §9 — substrate-build discipline canonical; D-CAR-SUB-BOX-NUMBERING-DRIFT 35th observation promoted at this commit
- `docs/architecture/beam-coordination-canonical-record.md` §4 (audit-chain cryptographic substrate) + §11 (forward paths) — Block B Phase 2 BEAM mini-arc context; sub-phase 4 audit-chain extension touches `apps/cosmp_router/lib/cosmp_router/audit.ex`
- CLAUDE.md — RULE 4 (audit trail is sacred), RULE 10 (nothing is ever deleted), RULE 11 (Elixir/BEAM wider-knowledge-check at sub-phase 4 audit-chain extension), RULE 13 (substrate-state observation surfacing), RULE 14 (bidirectional citation discipline), RULE 17 (architectural framing load-on-open), RULE 19 (two-register IP discipline), RULE 20 (rule/ADR-modification authority — Founder authorization at this ADR's creation)

**Bidirectional citations (cited from):**

- ADR-0019 §References "cited from" block — ADR-0036 cites ADR-0019 load-bearing at Sub-decision 5 cryptographic binding posture (back-cite landed at this commit per RULE 14)
- ADR-0020 §References "cited from" block — ADR-0036 cites ADR-0020 load-bearing at §Patent-Implementation Evidence Register-2 (back-cite landed at this commit per RULE 14)
- ADR-0026 §References "cited from" block — ADR-0036 cites ADR-0026 load-bearing at Sub-decision 6 dual-control binding (back-cite landed at this commit per RULE 14)
- ADR-0033 §References "cited from" block — ADR-0036 cites ADR-0033 load-bearing at Sub-decision 5 canonical_record/1 byte-equivalence extension (back-cite landed at this commit per RULE 14)
- ADR-0035 §9 35th D-CAR-SUB-BOX-NUMBERING-DRIFT canonical at this commit cites ADR-0036 (the substrate-build observation lineage canonical at substantive register)
- `docs/reference/section-12-progress.md` Sub-box 3 row (forward-queued for Sub-box 3 closure cascade at sub-phase 7) + CAR Sub-box 2 QUEUED row addition at this commit
- `docs/COMPLIANCE_ARCHITECTURE_REVIEW.md` Sub-box 3 status row (forward → CLOSED at sub-phase 7 closure cascade)
