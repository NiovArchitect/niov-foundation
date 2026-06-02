# `docs/voice-first/` — Otzar Voice-First Substrate

Per `[FOUNDER-CORRECTION — OTZAR IS VOICE-FIRST / SESAME IS CORE PRODUCT REQUIREMENT]` (2026-06-02).

This directory holds the canonical voice-first product doctrine substrate. The architectural decision is canonicalized in [`../architecture/decisions/0085-voice-first-product-doctrine.md`](../architecture/decisions/0085-voice-first-product-doctrine.md).

## Files

| File | Purpose |
|---|---|
| `README.md` | This index. |
| `doctrine.md` | The 4 canonical doctrine lines verbatim + governance posture. Pure reference. |
| `interaction-map.md` | Per-surface voice intent catalog across the 13 Otzar product surfaces; risk tier per intent. |
| `sesame-readiness-assessment.md` | The 10-gate readiness assessment for live Sesame integration. PENDING across all 10 gates at 2026-06-02. |
| `voice-provider-adapter.md` | Proposed `VoiceProviderAdapter` interface + 4 concrete adapter slots (TextOnly / LocalMock / Sesame / Future). |
| `voice-intent-envelope.md` | `VoiceIntentEnvelope` substrate object + field semantics + governance hooks. |
| `risk-tiered-action-model.md` | LOW / MEDIUM / HIGH risk classification + governance gate per tier + worked examples. |
| `implementation-sequence.md` | The 7-gate VF.1 → VF.7 ladder; what each gate produces + what each gate intentionally does NOT do. |
| `voice-first.schema.json` | JSON Schema for the per-surface interaction-map and risk-tier catalogs (consumed by `scripts/validate-voice-first.mjs`). |

## Doctrine summary (canonical — do not paraphrase)

1. **Otzar is voice-first because work should move through natural communication, not endless clicking.**
2. **Users should be able to talk to their AI Twin the way they would talk to a trusted teammate.**
3. **Voice reduces friction, increases adoption, and makes governed intelligence feel alive.**
4. **Voice is an interface layer over Foundation governance, not a bypass around it.**

## What this directory does NOT do

- Does not call Sesame API
- Does not store secrets
- Does not process audio
- Does not run runtime voice code
- Does not bypass any governance pipeline
- Does not introduce voice-only surfaces (every voice intent has a typed equivalent)

## Implementation status (2026-06-02)

| Gate | Description | Status |
|---|---|---|
| VF.1 | Voice-first product doctrine + ADR-0085 + interaction map + adapter architecture + governance + risk model + sequence | **LANDED 2026-06-02 (PR #210 `dcffc3c`)** |
| VF.2 | `VoiceProviderAdapter` interface + `VoiceIntentEnvelope` type + `TextOnlyVoiceProvider` + 6 NEW closed-vocab audit literals + 44 unit tests | **LANDED 2026-06-02 (this PR)** |
| VF.3 | `LocalMockVoiceProvider` + fixture catalog | Forward-substrate |
| VF.4 | CT voice surface scaffolding (text-only talk button on AI Twin page) | Forward-substrate |
| VF.5 | Sesame readiness assessment completion across 10 gates | Forward-substrate (Founder-gated) |
| VF.6 | `SesameVoiceProvider` adapter implementation | Forward-substrate (explicit Founder authorization) |
| VF.7 | Production voice runtime activation per-tenant flip | Forward-substrate (per-tenant Founder authorization) |

## Validator

The `scripts/validate-voice-first.mjs` validator (pure Node ESM; mirrors `scripts/validate-dandelion-activation.mjs`) verifies:

- Schema conformance for `interaction-map.md`'s per-surface catalog
- Cross-references against ADR-0085 §7 13-surface inventory
- Doctrine line verbatim presence in `doctrine.md`
- Implementation sequence gate ordering matches ADR-0085 §8

## References

- [ADR-0085](../architecture/decisions/0085-voice-first-product-doctrine.md) — Voice-first product doctrine (canonical)
- [ADR-0052](../architecture/decisions/0052-otzar-domain-general-intelligence-and-governed-synchronicity.md) — Otzar DGI doctrine
- [ADR-0049](../architecture/decisions/0049-government-grade-hardening-and-gap-closure-program-for-foundation-cosmp.md) — GOVSEC umbrella
- [ADR-0079](../architecture/decisions/0079-transcript-substrate-policy-for-conversation-context-signals.md) — Transcript substrate policy
- [`../reference/glossary.md`](../reference/glossary.md) — Glossary
