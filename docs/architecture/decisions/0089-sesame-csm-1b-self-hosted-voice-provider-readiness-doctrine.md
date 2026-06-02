# ADR-0089 — Sesame CSM-1B Self-Hosted Voice Provider Readiness Doctrine (Design-Only)

**Status:** Accepted 2026-06-02

**Authorization:** `[FOUNDER-CORRECTION — OTZAR IS VOICE-FIRST / SESAME IS CORE PRODUCT REQUIREMENT]` + `[FOUNDER-AUTH — W5 + LIVING ENTERPRISE INTELLIGENCE AUTONOMOUS BUILD]` per RULE 20.

## Context

ADR-0085 (Voice-First Product Doctrine LIVE 2026-06-02) canonicalized voice-first product framing. Founder direction explicit:

> "Otzar is voice-first because work should move through natural communication, not endless clicking."
> "Sesame voice is not optional future fluff."
> "Because official Sesame API access is not the right assumption, the cleanest legitimate route is to self-host CSM-1B behind Otzar's VoiceProviderAdapter."
> "Do not use unofficial Sesame web clients. Do not scrape Sesame. Do not use unauthorized private APIs."

Per the LEI sequence direction Step 5: research arc + readiness ADR before any code lands. Per RULE 21 the substrate-architectural paste (an external voice model, cross-language deployment, wire-format implications) requires canonical-authoritative-source research embedded in the paste body.

This ADR is the readiness ADR — **design-only; no code, no schema, no routes, no model weights downloaded, no production inference, no microphone capture, no audio retention.** Every implementation slice VS1-VS10 named in §9 below requires separate per-slice Founder authorization.

Voice substrate already LIVE per ADR-0085:

- VF.1: doctrine ADR-0085 (PR + closeout LIVE)
- VF.2: 6 voice audit literals (`VOICE_INTENT_RECEIVED` / `_CONFIRMED` / `_REJECTED` / `_EXPIRED` / `_REDACTED` / `_DELIVERED`)
- VF.3: VoiceProviderAdapter + TextOnlyVoiceProvider + LocalMockVoiceProvider services
- VF.4a: `POST /api/v1/voice/intents` route (text-only voice intent envelope)
- VF.4b: CT consumer surface for VF.4a

Founder-gated forward-substrate per ADR-0085:

- VF.5: Sesame readiness assessment (this ADR)
- VF.6: SelfHostedCsm1bVoiceProvider implementation
- VF.7: Per-tenant production flip
- VF.8+: Voice runtime production rollout

## Decision

### 1. Sesame CSM-1B is the canonical voice provider for the self-hosted route

Per Founder direction: Foundation uses **Sesame CSM-1B** (the Conversational Speech Model open-sourced by Sesame AI Labs) as the primary voice model for self-hosted production voice. No production-mode FutureSesameOfficialProvider is wired until/unless Sesame ships an official enterprise API. No third-party hosted Sesame proxies are used.

Canonical authoritative sources researched 2026-06-02 (full URLs cited in §3 below):

- GitHub: `https://github.com/SesameAILabs/csm` ("A Conversational Speech Generation Model")
- Hugging Face model card: `https://huggingface.co/sesame/csm-1b`
- Sesame Research blog (CSM design context): `https://www.sesame.com/research/crossing_the_uncanny_valley_of_voice`

### 2. License + commercial-use posture (substantive)

- **License: Apache 2.0** — Sesame blog statement verbatim: *"Our models will be available under an Apache 2.0 license"*; HF card field `License: apache-2.0`.
- **Commercial use:** Apache 2.0 permits commercial use by license terms. The Hugging Face card does NOT explicitly state a commercial-use disposition beyond the license itself.
- **Weights are gated:** HF card requires *"You need to agree to share your contact information to access this model"* and *"This repository is publicly accessible, but you have to accept the conditions to access its files and content."* Login + acceptance is required to download.
- **Operator action required:** model-weight download must be performed by an authorized Foundation operator who accepts the HF terms in writing. Weights MUST be checksum-verified post-download (SHA-256 against a Foundation-pinned hash) and stored inside the same deployment-target secret/security boundary that holds other production-tier model artifacts. Weights are NEVER baked into a public CI build artifact.

### 3. Vendor research findings — RULE 21 research arc embedded

Research conducted 2026-06-02 against canonical authoritative sources.

#### 3.1 Inference requirements

- Python: *"Python 3.10 is recommended, but newer versions may be fine."* (GitHub README)
- CUDA: *"CUDA 12.4 and 12.6"* tested; *"may also work on other versions."* (GitHub README)
- Required dependencies: `transformers >= 4.52.1` (native CSM support landed 2025-05-20 per HF card)
- Required text-model backbone: `meta-llama/Llama-3.2-1B` — **a separate gated Llama model download is required**, with its own acceptance terms.
- Audio decoder: Mimi (per HF card)
- **VRAM minimum/recommended is NOT published** by either the GitHub README or the HF card. This is a substrate-honest gap; Foundation will determine empirically at VS3 deployment-pattern slice.
- **Single-GPU vs multi-GPU posture NOT published.** Substrate-honest gap.

#### 3.2 Streaming feasibility + latency

- **No explicit streaming inference support documented.** The README's reference invocation is synchronous: `generator.generate(text=..., speaker=0, context=[], max_audio_length_ms=10_000)` — no streaming-callback / chunked-iterator API.
- Sesame Research blog cites *"low-latency generation"* as a design goal and identifies *"time-to-first-audio scales poorly"* as a prior-art limitation — but **publishes no specific real-time latency metric** for CSM-1B.
- The hosted Hugging Face Space + interactive demo uses **a fine-tuned variant**, NOT the open-sourced 1B base model.
- **Foundation implication:** V1 voice path is synchronous-only (text-in → audio-out as a single completed segment). Interactive turn-taking + streaming is forward-substrate; latency engineering owned at VS3 + VS6.

#### 3.3 Voice consistency / cloning posture

- **The base 1B model is NOT fine-tuned for any specific voice.** HF FAQ verbatim: *"The model open sourced here is a base generation model. It is capable of producing a variety of voices, but it has not been fine-tuned on any specific voice."*
- Voice conditioning is via the `context=[...]` argument (prior segments) + a `speaker` integer.
- **No canonical clone-from-reference-sample workflow** documented in the README.
- **Cross-session voice consistency NOT addressed** on README or HF card. Sesame blog frames *"Consistent personality"* as a goal — not a guarantee.

#### 3.4 Safety statements + technical mitigations

- README + HF card carry a **Misuse and Abuse** statement explicitly prohibiting:
  - *"Impersonation or Fraud: Do not use this model to generate speech that mimics real individuals without their explicit consent."*
  - *"Misinformation or Deception: Do not use this model to create deceptive or misleading content, such as fake news or fraudulent calls."*
  - *"Illegal or Harmful Activities: Do not use this model for any illegal, harmful, or malicious purposes."*
- **No documented in-model refusals, classifiers, or watermarking.** Substrate-honest finding: enforcement is policy-level, NOT technical.
- **Foundation implication:** the technical safety boundary must be enforced at the **Foundation layer** — never delegated to CSM-1B itself. Foundation's RULE 0 + ADR-0085 §2 voice-obeys-Foundation-governance + per-intent consent verification per ADR-0085 §5 are the canonical enforcement substrate.

#### 3.5 Audio retention / data handling guidance

- **NOT addressed** by README, HF card, or the Sesame Research blog.
- **Substrate-honest gap.** Foundation must enforce externally per ADR-0085 §2 (voice obeys retention rules per ADR-0079 transcript policy + per-tenant retention class) + ADR-0079 retention class vocabulary (`STANDARD` / `AGGREGATE_ONLY` / `EPHEMERAL`).

#### 3.6 Deployment pattern / containerization

- **No reference Dockerfile, container image, or recommended serving framework documented.** The only `triton` reference in the README is the unrelated Windows pip note (`pip install triton-windows`), NOT NVIDIA Triton Inference Server.
- **No HTTP / gRPC / WebSocket API boundary documented.** Reference usage is direct Python `generator.generate(...)`.
- **Substrate-honest gap.** Foundation must define its own internal-API boundary, container image, and serving harness — this is the VS3 + VS4 substrate work scope.

### 4. Foundation-enforced gaps (substrate-honest cross-cutting)

Sesame's published substrate does not provide the following — Foundation MUST enforce them at the protocol / runtime tier:

1. **In-model refusals / classifiers / watermarking** — Foundation's per-intent consent verification + RULE 0 entity-bound scoping + voice-intent audit chain (VF.2 6 literals) are the canonical substrate.
2. **Audio retention controls** — ADR-0079 retention class + ADR-0001 RULE 0 + ADR-0049 GOVSEC.7 tenant isolation enforce externally.
3. **Consent + recording disclosure** — ADR-0085 §2 voice-obeys-Foundation-governance + Foundation per-intent confirmation per ADR-0085 §5 confirmation state.
4. **Voice-clone protection for non-consenting individuals** — Sesame's policy-only ban becomes Foundation's technical-enforcement boundary: reference samples for voice conditioning MUST be entity-owned (per ADR-0001 RULE 0 + ADR-0048 working-set provenance) + per-purpose scoped + revocable.
5. **VRAM / GPU resourcing guarantees** — Foundation operator-tier deployment decision per ADR-0017 Production Discipline + ADR-0018 Deployment-Target Agnosticism (VRAM minimum + recommended pinned per deployment target at VS3).
6. **Internal API boundary** — Foundation-defined HTTP boundary at VS4 (`POST /internal/voice/generate` consumed by `SelfHostedCsm1bVoiceProvider`; never publicly exposed) per ADR-0084-style isolation discipline.
7. **Container image + serving framework pinning** — Foundation-pinned per ADR-0016 Pin-and-Optimize Framework (five-question template) at VS3.
8. **Latency SLO** — Foundation-defined at VS3 + VS6 against the deployment target's measured time-to-first-audio.

### 5. VoiceProviderAdapter integration architecture

The current LIVE VoiceProviderAdapter substrate (ADR-0085 + VF.3) defines:

- `TextOnlyVoiceProvider` — LIVE; produces a text-only intent envelope for canary/dev (no audio).
- `LocalMockVoiceProvider` — LIVE; deterministic fixture audio for tests.

This ADR adds the future provider seat:

- `SelfHostedCsm1bVoiceProvider` — LANDS at VS5; implements the same `VoiceProvider` interface (`generate(intent)` → `Promise<{audio: Buffer | string; voice_intent_envelope: VoiceIntentEnvelope}>`); composes against the Foundation-internal HTTP boundary from VS4; consumes weights deployed at VS3.

Deferred provider seats per ADR-0085 + this ADR:

- `FutureSesameOfficialProvider` — only wired IF Sesame ships an official enterprise API with terms acceptable to Foundation. Forward-substrate; Founder-gated. Not authorized at this slice.

The adapter pattern preserves the existing voice-intent audit chain (VF.2 6 literals): `VOICE_INTENT_RECEIVED` emits at provider entry; `VOICE_INTENT_CONFIRMED` / `REJECTED` emit per ADR-0085 §5 confirmation-state machinery; `VOICE_INTENT_DELIVERED` emits before audio handoff. The provider implementation MUST NOT bypass any of these emissions.

### 6. Deployment architecture (high-level; pinned at VS3)

The full deployment topology is locked at VS3 per the Pin-and-Optimize Framework. ADR-0089 names the architectural decisions:

- **Isolated service boundary.** The CSM-1B inference runs as a **separate Foundation-internal service**, not embedded in `apps/api`. Foundation API processes do NOT load CSM-1B weights, do NOT load PyTorch, do NOT depend on CUDA. The voice provider invokes the inference service through an internal HTTP boundary defined at VS4.
- **No raw audio over external APIs.** All audio I/O is Foundation-internal. The Sesame model is reached only through the Foundation-internal HTTP boundary; never directly exposed.
- **No production audio retention unless explicitly configured.** Default: `EPHEMERAL` retention class per ADR-0079 (no Foundation-persisted audio; the generated audio is delivered once and discarded). Per-tenant policy MAY raise retention to `STANDARD` / `AGGREGATE_ONLY` (e.g., for accessibility playback) per ADR-0079 + tenant DMW scope.
- **Tenant-safe metadata.** Every voice-intent envelope carries `source_entity_id` + `wallet_id` per ADR-0085 §5; the inference service receives sanitized request payloads (text + optional reference-context per §3.3) without cross-tenant identifiers.
- **No private memory leakage into voice provider.** The provider does NOT receive raw capsule content. Voice-intent input strings are constructed from Foundation-governed working sets per ADR-0048 before reaching the provider boundary.
- **Explicit consent.** Every voice-intent emission is gated by the existing VF.2 confirmation discipline; the provider MUST receive a confirmed envelope before generation.
- **Auditable voice-intent envelope.** Voice intent IDs (UUIDs) thread through every audit emission per VF.2 vocabulary.
- **No connector / action bypass.** Voice never bypasses Section 4 connector governance or Section 2 Action runtime per ADR-0085 §2.

### 7. Fixture / mock service boundary

`LocalMockVoiceProvider` (LIVE per VF.3) is the canonical test-mode provider. CI + dev environments NEVER hit the self-hosted CSM-1B inference service. The `VOICE_PROVIDER_USE_REAL` env-flag (forward-substrate per VS5) gates production flip per-tenant — never automatic.

The fixture surface MUST cover the same VoiceIntentEnvelope contract as the production provider. Per VS5 the SelfHostedCsm1bVoiceProvider tests use `LocalMockVoiceProvider` for provider-interface contract coverage; integration against the actual inference service is forward-substrate to VS7 in a contained Foundation-internal test environment.

### 8. Typed voice-intent simulation

ADR-0085 §5 VoiceIntentEnvelope is LIVE per VF.2 + VF.3. CSM-1B inputs/outputs MUST be wrapped in the envelope verbatim — Foundation never accepts a raw audio buffer or unvalidated text payload from a provider boundary.

### 9. Implementation ladder — 10 forward-substrate slices

V1 is doctrine-only at this ADR. Each implementation slice VS1-VS10 requires a separate Founder authorization.

- **VS1 — Foundation operator weight-acceptance ritual** (operational; no code). The authorized operator accepts the Hugging Face terms in writing; downloads `sesame/csm-1b` + `meta-llama/Llama-3.2-1B` weights; checksum-verifies; stores in the deployment-target secret/security boundary. Weight artifacts NEVER touch a public CI build.
- **VS2 — VRAM + GPU sizing study** (operational; no code). Empirical determination of minimum + recommended VRAM + single-GPU vs multi-GPU posture for V1 production target. Records findings in a Foundation-internal ops doc; informs VS3 pinning.
- **VS3 — Deployment architecture pinning** (design ADR; no code). Per ADR-0016 Pin-and-Optimize Framework five-question template: pin container base image + Python pinned version + CUDA pinned version + transformers pinned version + Foundation-internal HTTP boundary spec. Forward-substrate.
- **VS4 — Foundation-internal HTTP boundary spec** (design ADR; no code). Defines `POST /internal/voice/generate` request/response contract (closed-vocab + SAFE projection); request shape includes envelope-id + text + optional reference-context; response shape includes audio + metadata; never publicly exposed.
- **VS5 — `SelfHostedCsm1bVoiceProvider` implementation** (substantive runtime; bounded scope). Implements the `VoiceProvider` interface; composes against VS4 HTTP boundary; preserves VF.2 audit emissions verbatim; passes existing VoiceProvider contract tests using `LocalMockVoiceProvider`.
- **VS6 — Inference service deployment** (substantive operational; container image + serving harness). Builds the Foundation-internal voice inference service from VS3 pins; deploys to staging; latency + VRAM measurement landed in Foundation-internal ops doc.
- **VS7 — Integration tests against staged inference service** (substantive test substrate). Contained Foundation-internal test environment; full request/response contract verified; no public CI exposure of weight artifacts.
- **VS8 — Per-tenant production flip mechanism** (substantive runtime). `VOICE_PROVIDER_USE_REAL=true` per-tenant; default false; flip is Founder-authorized per tenant; audit-emitted; reversible.
- **VS9 — First-tenant production canary** (operational; bounded user opt-in). Per ADR-0085 voice-obeys-Foundation-governance + per-entity consent + EPHEMERAL retention default.
- **VS10 — Multi-tenant production GA** (operational; gated by VS9 success + Founder-tier rollout cadence).

**Microphone capture is NOT in this ladder.** Per Founder direction *"Do not add production microphone capture until consent and retention controls exist"* — microphone capture composes against a separate forward-substrate ADR with its own RULE 21 research arc on browser MediaRecorder + WebRTC + consent UX + retention discipline.

### 10. RULE 0 sovereignty preserved at every tier

Every CSM-1B-derived audio output inherits same-org boundary (ADR-0049 GOVSEC.7), entity-bound scoping (RULE 0), no AI clearance raise (RULE 0), per-intent confirmation (ADR-0085 §5), per-purpose scope, per-tenant retention class, no cross-tenant fusion.

Voice-clone protection: reference samples used to condition CSM-1B MUST be entity-owned per ADR-0001 RULE 0. Cloning a non-consenting third party's voice is forbidden by Foundation policy AND Foundation technical enforcement (provider boundary rejects reference samples whose source entity is not the speaker per ADR-0048 working-set provenance).

### 11. NO code / schema / runtime / audit literal at this ADR

This is a design-only ADR. No code lands. No `AUDIT_EVENT_TYPE_VALUES` extension (the 6 voice audit literals from VF.2 already cover the substrate). No new Prisma model. No new route. No new dependency. No PyTorch / CUDA / transformers / Llama-3.2-1B / Mimi pulled into Foundation API.

## Consequences

**Positive.**

- The Sesame CSM-1B self-hosted readiness posture is named, bounded, and locked at the doctrine tier. The vendor's published substrate is research-arc-cited per RULE 21.
- The 8 substrate-honest gaps Sesame does not document (VRAM sizing + streaming + latency metric + voice cloning protection + audio retention + serving framework + API boundary + safety mitigations) are enumerated. Foundation enforces each externally; the canonical enforcement substrate for each is named.
- The 10-slice forward-substrate ladder VS1-VS10 is bounded. Each slice has defined scope + per-slice Founder authorization gate.
- Existing voice substrate (VF.1-VF.4 LIVE, VoiceProviderAdapter, 6 audit literals, VoiceIntentEnvelope) is preserved verbatim — the SelfHostedCsm1bVoiceProvider lands as an additional adapter seat, not a replacement.
- License posture (Apache 2.0 + commercial use permitted + gated download requiring operator acceptance) is clear and operator-action-bound. No license ambiguity blocks future production deployment.
- Substrate-honest gaps are surfaced rather than papered over; future slices inherit a clean per-gap enforcement plan.

**Negative.**

- The 10-slice ladder is long. Each slice requires per-slice Founder authorization. Throughput depends on Founder cadence.
- Several substrate-honest gaps require empirical determination at deployment time (VRAM sizing; latency SLO; serving framework choice). These can't be canonicalized at ADR tier; they land at VS2 + VS3 + VS6.
- CSM-1B is research-grade — the open-sourced 1B model is NOT the interactive-demo model. Production voice quality may differ from the public demo experience; user-facing copy must not over-promise.

**Forward-substrate (NOT authorized by this ADR).**

- All 10 implementation slices VS1-VS10 above.
- Microphone capture (separate forward-substrate ADR + RULE 21 research arc required).
- FutureSesameOfficialProvider (only wired if Sesame ships an official enterprise API).
- Real-time streaming inference (composes against future streaming-API research arc; CSM-1B's published synchronous-only posture is V1 baseline).
- Fine-tuned voice variants (the interactive-demo voice; requires research arc on fine-tuning posture + licensing of training data).
- Multi-language voice support (requires research arc on CSM-1B language coverage).
- Voice consistency across sessions (requires research arc on Sesame's roadmap for this capability OR Foundation fine-tuning).
- Voice-watermarking integration (no Sesame-published watermarking; would require Foundation-defined watermark scheme).

## Alternatives

**Alternative A: Use Sesame's hosted Hugging Face Space / interactive demo for V1 production.** Rejected per Founder direction: *"Do not use unofficial Sesame web clients."* The hosted Space is for testing; production must self-host per Apache 2.0 license terms + operator-acceptance ritual.

**Alternative B: Use a competing voice model (ElevenLabs / OpenAI TTS / Cartesia / etc.) for V1.** Rejected per Founder direction: *"Sesame voice is not optional future fluff."* Foundation commits to Sesame as the canonical voice provider. A competing model could be a deferred fallback IF Sesame's terms change adversely — that's not authorized at this slice.

**Alternative C: Embed CSM-1B inference inside `apps/api` directly.** Rejected — would force PyTorch + CUDA + transformers + Llama-3.2-1B + Mimi into the API process. Isolated service boundary per §6 is the canonical Foundation discipline for production runtime separation.

**Alternative D: Skip the readiness doctrine ADR; land VS5 `SelfHostedCsm1bVoiceProvider` directly.** Rejected — LEI sequence direction explicitly requires research-arc-first when a substrate-architectural paste touches an external model + cross-language boundary + container deployment topology. RULE 21 binding.

**Alternative E: Bundle microphone capture into the V1 readiness doctrine.** Rejected per Founder direction: *"Do not add production microphone capture until consent and retention controls exist."* Microphone capture is forward-substrate to a separate ADR with its own RULE 21 research arc.

## Cross-references

ADR-0001 (three-wallet; entity-bound scoping inherited) ·
ADR-0002 (append-only audit chain; preserved) ·
ADR-0016 (Pin-and-Optimize Framework; container/runtime pins at VS3) ·
ADR-0017 (Production Discipline; VRAM sizing empirical at VS2) ·
ADR-0018 (Deployment-Target Agnosticism; VRAM/CUDA pinning per deployment target) ·
ADR-0019 (Cryptographic-Suite Posture; weights checksum verification at VS1) ·
ADR-0020 (two-register IP discipline; patent-implementation evidence trail) ·
ADR-0021 (CapsuleType extension protocol; not used at this ADR) ·
ADR-0026 (dual-control; preserved through Foundation governance pipeline) ·
ADR-0028 (BEAM coordination forward queue; not used at this ADR) ·
ADR-0048 (working-set provenance; reference-sample-ownership enforcement) ·
ADR-0049 (GOVSEC.7 tenant isolation) ·
ADR-0050 (Break-Glass; voice never bypasses) ·
ADR-0052 §8 (Otzar DGI doctrine; voice composes against same Twin-to-Twin bounds) ·
ADR-0057 (Section 2 Action runtime; preserved as execution authority for voice-triggered actions) ·
ADR-0058 (no manager surveillance; voice-derived signals inherit) ·
ADR-0070 (Regulator-Ready doctrine; preserved) ·
ADR-0077 §8.4 (Foundation-first cadence; CT voice consumer surface at VS5+) ·
ADR-0079 (Retention Class; EPHEMERAL default for voice; STANDARD/AGGREGATE_ONLY per-tenant opt) ·
ADR-0080 (PermissionBundle; voice scope inherited) ·
ADR-0083 §1 (forbidden categories; voice inherits) ·
ADR-0084 (Section 4 connector strategy; voice does NOT bypass connector governance) ·
ADR-0085 (Voice-First Product Doctrine; sibling — ADR-0089 closes the VF.5 readiness slot ADR-0085 §8 reserved) ·
ADR-0086 (W5 Action Promotion Runtime; voice-triggered W5 promotion is forward-substrate at VS8+) ·
ADR-0087 (Hive Intelligence Runtime V1; voice-derived coordination signals compose against ECIL at forward-substrate) ·
ADR-0088 (Enterprise Communication Intelligence Layer Doctrine; voice sessions named as a V1 canonical surface).

## RULE references

RULE 0 (humans always sovereign; voice-clone enforcement inherits) + RULE 4 (audit chain integrity; voice-intent audit chain preserved) + RULE 10 (soft-delete; audio retention defaults to EPHEMERAL per ADR-0079) + RULE 11 (Elixir/BEAM canonical patterns; relevant at future streaming coordination forward-substrate) + RULE 13 (substrate-honest pre-flight; embedded above as §3 vendor research + §4 Foundation-enforced gaps) + RULE 14 (bidirectional citation; this ADR cites and is cited by ADR-0085 + ADR-0088 catalog entries) + RULE 16 (no console.* in apps/api/src; preserved — no code in this slice) + RULE 20 (Founder-only RULE/ADR modification; this ADR lands per `[FOUNDER-CORRECTION — OTZAR IS VOICE-FIRST / SESAME IS CORE PRODUCT REQUIREMENT]` + `[FOUNDER-AUTH — W5 + LIVING ENTERPRISE INTELLIGENCE AUTONOMOUS BUILD]`) + RULE 21 (substrate-architectural research arc against canonical authoritative source BEFORE drafting paste body; embedded above as §3 vendor research findings with URL citations to GitHub README + Hugging Face card + Sesame Research blog).
