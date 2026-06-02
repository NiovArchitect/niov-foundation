# Sesame Readiness Assessment

Per ADR-0085 §6. Sesame is the **intended primary voice partner** at the product layer. Live Sesame integration requires explicit Founder authorization conditioned on all 10 readiness gates being VERIFIED.

**Current state (2026-06-02):** PENDING across all 10 gates. No Sesame API call has been made; no secrets are stored; no audio data has been processed.

## The 10 readiness gates

| # | Gate | Status | Verification artifact |
|---|---|---|---|
| 1 | Official Sesame docs / SDK / API availability verified | PENDING | Capture official docs URL + API surface inventory; record version pinning per ADR-0016 |
| 2 | Authentication model verified (OAuth / API key / mTLS / etc.) | PENDING | Document auth shape; lock secret_ref env-var NAME pattern per ADR-0019 + ADR-0024 |
| 3 | Data handling posture documented (what Sesame retains; what's deleted; jurisdiction) | PENDING | Vendor data handling commitment + jurisdiction (per ADR-0037) |
| 4 | Audio retention posture documented (per-utterance retention class enforceable) | PENDING | Per-utterance retention class enforcement at Sesame side + Foundation side |
| 5 | Transcript retention posture documented (transcripts deleted with same lifecycle as voice memory capsules) | PENDING | Per ADR-0079 transcript substrate policy alignment |
| 6 | Enterprise consent implications documented (per-tenant consent boundary; per-user opt-in) | PENDING | Consent model: per-tenant administrative consent + per-user runtime opt-in |
| 7 | Self-hosting or enterprise-control posture verified (sovereign-cloud / on-premise / air-gapped per ADR-0018) | PENDING | Deployment-target portability per ADR-0018; air-gapped fallback path documented |
| 8 | Security / privacy posture verified (encryption-in-transit + at-rest; key management) | PENDING | Per ADR-0019 cryptographic-suite posture; document Sesame's encryption profile |
| 9 | Tenant-scoped usage verified (cross-tenant leakage structurally impossible) | PENDING | Per GOVSEC.7 tenant isolation hardening; verify Sesame tenant boundary mapping |
| 10 | Output auditability verified (every Sesame call surfaces in `audit_events`) | PENDING | Voice intent envelope hooked to RULE 4 audit chain; verify-chain coverage |

## What this assessment is

A pre-flight inventory of what must be verified BEFORE live Sesame integration. The assessment is NOT a binding commitment that Sesame will be the production voice runtime — it is a readiness gate that, if passed, unlocks the option.

## What this assessment is NOT

- NOT a recommendation to integrate Sesame today
- NOT a vendor evaluation against alternative voice providers (forward-substrate via the `VoiceProviderAdapter` seam)
- NOT a legal opinion on Sesame's data handling
- NOT a security audit
- NOT a compliance certification
- NOT a guarantee that Sesame meets all 10 gates — until verified, every gate is PENDING

## Verification workflow

Each gate is verified by:

1. Founder-authorized research arc (per RULE 21) producing a written verification artifact
2. Citation of the official Sesame documentation / contract / security posture / data handling commitment
3. Substrate-honest discipline (per RULE 13) recording the gate as VERIFIED or BLOCKED with explicit reasoning
4. RULE 14 bidirectional citation between this assessment doc + ADR-0085 §6 + the Sesame adapter implementation (VF.6)

## Gates → VF.5 closure

When all 10 gates are VERIFIED, this document graduates from PENDING to READY. That graduation is the prerequisite for VF.6 (`SesameVoiceProvider` adapter implementation) per the implementation sequence in ADR-0085 §8.

If a gate cannot be verified, the gate is recorded as BLOCKED with the specific reason. Blocked gates can be unblocked by:

- Sesame publishing the missing documentation
- Sesame's data handling posture changing to meet the gate
- The Founder authorizing an alternative path (e.g., self-hosting Sesame in a sovereign-cloud deployment per ADR-0018)
- Adopting a different concrete `VoiceProviderAdapter` (FutureVoiceProvider) if Sesame cannot meet the gate

## Reading

- [ADR-0085 §6](../architecture/decisions/0085-voice-first-product-doctrine.md) — Sesame readiness assessment 10 gates (canonical decision substrate)
- [ADR-0018](../architecture/decisions/0018-deployment-target-agnosticism-posture.md) — Deployment-target agnosticism (sovereign / on-premise / air-gapped path)
- [ADR-0019](../architecture/decisions/0019-cryptographic-suite-posture.md) — Cryptographic-suite posture (Sesame encryption profile alignment)
- [ADR-0024](../architecture/decisions/0024-pre-commit-hook-posture.md) — Secret env-var-NAME pattern
- [ADR-0049](../architecture/decisions/0049-government-grade-hardening-and-gap-closure-program-for-foundation-cosmp.md) — GOVSEC umbrella
- [ADR-0079](../architecture/decisions/0079-transcript-substrate-policy-for-conversation-context-signals.md) — Transcript substrate policy
- [voice-provider-adapter.md](./voice-provider-adapter.md) — Adapter seam architecture
