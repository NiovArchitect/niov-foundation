# Voice-First Implementation Sequence — VF.1 → VF.7

Per ADR-0085 §8. Implementation proceeds through 7 gates. **No gate skips ahead.**

## Gate ladder

### VF.1 — Voice-first doctrine + architecture (this PR)

**Classification:** A (docs-only research+design).

**What this gate produces:**
- ADR-0085 — Voice-first product doctrine + 9 sub-decisions
- `docs/voice-first/README.md` — Index
- `docs/voice-first/doctrine.md` — 4 canonical doctrine lines + governance posture
- `docs/voice-first/interaction-map.md` — 13-surface voice intent catalog
- `docs/voice-first/sesame-readiness-assessment.md` — 10-gate readiness template (PENDING across all gates)
- `docs/voice-first/voice-provider-adapter.md` — Proposed adapter seam architecture
- `docs/voice-first/voice-intent-envelope.md` — Substrate object shape + audit hooks
- `docs/voice-first/risk-tiered-action-model.md` — LOW / MEDIUM / HIGH gates + worked examples
- `docs/voice-first/implementation-sequence.md` — This file
- `docs/voice-first/voice-first.schema.json` — JSON Schema for the interaction-map catalog
- `scripts/validate-voice-first.mjs` — Validator (pure Node ESM; mirrors `validate-dandelion-activation.mjs`)

**What this gate intentionally does NOT do:**
- NO Sesame API call
- NO secrets stored
- NO audio processing
- NO runtime voice code
- NO new audit literal in `AUDIT_EVENT_TYPE_VALUES` (forward-substrate at VF.2)
- NO schema migration
- NO Prisma model changes
- NO CT change
- NO BEAM / Python / LLM runtime change

**Acceptance criteria:**
- `scripts/validate-voice-first.mjs` green
- ADR-0085 + all 7 docs/voice-first/ files exist + validator confirms schema + cross-references
- Typecheck 4-error baseline preserved
- No-leak guard preserved

---

### VF.2 — `VoiceProviderAdapter` interface + `TextOnlyVoiceProvider` + `VoiceIntentEnvelope` type

**Classification:** C (backend runtime).

**What this gate produces:**
- NEW `apps/api/src/services/voice/voice-provider.service.ts` — `VoiceProviderAdapter` interface + `getVoiceProviderAsync` factory (mirrors `connector.service.ts:332`)
- NEW `apps/api/src/services/voice/text-only-voice.provider.ts` — `TextOnlyVoiceProvider` implementing the adapter
- NEW `apps/api/src/services/voice/voice-intent-envelope.ts` — `VoiceIntentEnvelope` TypeScript type + envelope-construction service
- NEW `tests/unit/voice-provider-text-only.test.ts` — Frozen-anchor contract for adapter registry + `TextOnlyVoiceProvider` fixture-mode tests + envelope construction tests
- NEW closed-vocab audit literals in `AUDIT_EVENT_TYPE_VALUES` (per the clean-transition discipline per ADR-0042 §Q-γ.1): `VOICE_INTENT_RECEIVED` + `VOICE_INTENT_CONFIRMED` + `VOICE_INTENT_REJECTED` + `VOICE_INTENT_EXPIRED` + `VOICE_INTENT_REDACTED` + `VOICE_INTENT_DELIVERED`
- Voice intent envelope construction emits at least one audit event per RULE 4 before delivery

**What this gate intentionally does NOT do:**
- NO Sesame API call
- NO secrets stored
- NO audio processing (TextOnlyVoiceProvider accepts typed input only)
- NO new Foundation route (envelope construction is service-tier; route surface lands at VF.4)
- NO CT change

**Acceptance criteria:**
- `npm run test:unit` green
- New audit literals validated by the audit-literal anchor test
- Typecheck 4-error baseline preserved
- No-leak guard preserved

---

### VF.3 — `LocalMockVoiceProvider` + fixture catalog

**Classification:** C (backend runtime).

**What this gate produces:**
- NEW `apps/api/src/services/voice/local-mock-voice.provider.ts` — `LocalMockVoiceProvider` with fixture-key dispatch (mirrors ADR-0014 FixtureBasedLLMProvider)
- NEW `tests/fixtures/voice/` — Fixture catalog
- Integration tests asserting envelope-to-Action-runtime end-to-end

**Acceptance criteria:**
- Integration tests green
- Privacy invariant assertions pass (no Bearer / no secret / no transcript leak in error messages)
- Typecheck 4-error baseline preserved

---

### VF.4 — CT voice surface scaffolding (text-only)

**Classification:** D (frontend product surface).

**What this gate produces:**
- NEW CT "Talk to my Twin" button on the AI Twin page (or equivalent surface)
- Typed input → `VoiceIntentEnvelope` via the existing `api.*` namespace (mirrors `api.connectors.*`)
- Confirmation modal for MEDIUM-tier intents
- CT tests assert privacy invariant (no token leak; no transcript leak in error UI)

**What this gate intentionally does NOT do:**
- NO microphone access
- NO audio capture
- NO Sesame integration
- NO browser MediaRecorder API
- NO voice synthesis playback

**Acceptance criteria:**
- CT typecheck + lint + build green
- CT tests green
- Forbidden UI copy guard preserved

---

### VF.5 — Sesame readiness assessment completion across 10 gates

**Classification:** A (docs).

**Founder-gated:** Cannot proceed without explicit Founder authorization per `sesame-readiness-assessment.md` closeout.

**What this gate produces:**
- Verification artifacts for each of the 10 readiness gates in `sesame-readiness-assessment.md`
- Each gate transitions from PENDING → VERIFIED or BLOCKED with explicit reasoning per RULE 13

**Unlock condition:** When all 10 gates are VERIFIED, this gate produces the green-light Founder authorization for VF.6.

---

### VF.6 — `SesameVoiceProvider` adapter implementation

**Classification:** J (BEAM / Python / LLM / Voice runtime).

**Founder-gated:** Requires explicit Founder authorization per the VF.5 closeout. Must cite all 10 verified readiness gates.

**What this gate produces:**
- NEW `apps/api/src/services/voice/sesame-voice.provider.ts` — `SesameVoiceProvider` implementing the adapter
- Defensive triple gate (`SESAME_USE_REAL=1` + `binding.config.use_real=true` + `secret_ref` resolves)
- OAuth / API key auth per Sesame docs (verified at VF.5 gate 2)
- Privacy invariant tests asserting no Sesame access token / no raw audio / no transcript leakage

**Acceptance criteria:**
- All 10 VF.5 gates VERIFIED
- Sesame readiness assessment closeout authorization explicit in commit body per RULE 20
- Integration tests assert governance pipeline end-to-end (caller_entity_id + tenant_org_entity_id + audit chain)
- Privacy invariant + no-leak guard preserved

---

### VF.7 — Production voice runtime activation

**Classification:** I (GOVSEC hardening) + J (voice runtime flip).

**Founder-gated per-tenant:** Mirrors the `*_USE_REAL=1` connector pattern. Each tenant deployment receives explicit Founder authorization before the per-tenant flip fires.

**What this gate produces:**
- Per-tenant deployment register flip enabling `SESAME_USE_REAL=1` for the target tenant
- Per-tenant consent posture verified
- Per-tenant audit posture verified
- Per-tenant retention class verified
- Per-tenant runbook + rollback documented

**Acceptance criteria:**
- Per-tenant readiness checklist green
- Per-tenant Founder authorization explicit in deployment register
- Per-tenant rollback runbook tested

---

## Authorization boundary

| Gate | Autonomous-continuation auth | Explicit Founder auth |
|---|---|---|
| VF.1 | ✓ (this PR) | — |
| VF.2 | ✓ (per [FOUNDER-AUTONOMOUS-PRODUCTION-GO-LIVE-AUTH]) | — |
| VF.3 | ✓ | — |
| VF.4 | ✓ | — |
| VF.5 | — | ✓ (Sesame readiness 10-gate closeout) |
| VF.6 | — | ✓ (post-VF.5; cite all 10 verified gates) |
| VF.7 | — | ✓ (per-tenant flip) |

VF.1 + VF.2 + VF.3 + VF.4 are bounded enough to proceed under the autonomous-continuation authorization. VF.5 + VF.6 + VF.7 require explicit Founder authorization per the Sesame readiness assessment closeout.

## Reading

- [ADR-0085 §8](../architecture/decisions/0085-voice-first-product-doctrine.md) — Implementation sequence (canonical decision substrate)
- [sesame-readiness-assessment.md](./sesame-readiness-assessment.md) — 10-gate readiness
- [voice-provider-adapter.md](./voice-provider-adapter.md) — Adapter seam
- [voice-intent-envelope.md](./voice-intent-envelope.md) — Substrate object
- [risk-tiered-action-model.md](./risk-tiered-action-model.md) — Risk tier gates
