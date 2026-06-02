# ADR-0090 — Python Intelligence Runtime Readiness Doctrine (Design-Only)

**Status:** Accepted 2026-06-02

**Authorization:** `[FOUNDER-AUTH — W5 + LIVING ENTERPRISE INTELLIGENCE AUTONOMOUS BUILD]` per RULE 20.

## Context

LEI sequence Step 6 per Founder direction:

> "Python belongs where intelligence-heavy computation is required."
> "Required approach: Audit existing repo Python patterns. Define Python service/job boundary. Keep sensitive data scoped. Use fixtures first. No external model APIs unless separately authorized."
> "First Python slice should likely be: Hive signal scoring or Agent Playground scenario scoring; fixture-only; no sensitive live data; safe scoring output only; audit-friendly result shape."

ADR-0069 §2.4 (Elixir/BEAM Substrate-Coherence Law, Accepted 2026-05-31) already canonicalizes Python's future role:

> *"AI services. Research workloads. Model training / evaluation. Inference / reranking / embedding pipelines. Data pipelines. Simulation / evaluation workloads. Intelligence-heavy computation under Foundation governance."*

ADR-0069 §9 explicitly mandates that **a dedicated service-boundary ADR must exist** before the first Python slice lands, defining: (a) Foundation-scoped input envelope, (b) SAFE projection of outputs, (c) policy/auth gate, (d) audit emission posture, (e) no-leak surface, (f) governance hook.

**ADR-0090 is that ADR.** It is design-only — no code, no schema, no Python dependency added, no `pyproject.toml`, no `requirements.txt`, no Python service deployed.

### Substrate-honest pre-flight (RULE 13)

Repository state 2026-06-02:

- **Zero Python in the codebase.** No `.py` files. No `pyproject.toml` / `requirements*.txt` / `Pipfile` / `setup.py` / `setup.cfg`.
- **Zero Python tooling configured.** Nothing in `.github/workflows/*.yml`, `package.json`, `docker-compose*`, scripts. CI runs typecheck + unit + integration + Elixir tiers only.
- **One ADR-level discussion of Python:** ADR-0069 §2.4 + §9. No implementation ADR exists.
- **Three natural pure-function candidate computations** currently in TypeScript that are mechanically portable to Python (no migration recommended at V1; identified as substrate-honest candidates for the §10 forward-substrate ladder):
  - COE relevance scoring (`apps/api/src/services/coe/keywords.ts` — weighted 0.45 / 0.35 / 0.20 combination)
  - Analytics correction-velocity threshold mapping (`apps/api/src/services/analytics/analytics.service.ts` — ELEVATED ≥ 1.0 / TYPICAL / QUIET ≤ 0.2)
  - Otzar drift-rollup posture aggregation (`apps/api/src/services/otzar/drift-rollup.service.ts` — AT_RISK / NORMAL / INSUFFICIENT_DATA from cross-conversation drift + stale-capsule counts)

Each is pure-function + spec-driven (hard thresholds + closed-vocab outputs) + audit-safe. None are currently LLM-called.

## Decision

### 1. Python Intelligence Runtime is a SUBSTRATE LAYER, not embedded in `apps/api`

Python runs in a **separate Foundation-internal service** with its own deployment lifecycle, its own dependency tree, its own CI tier, and its own resource envelope. Foundation API processes (Fastify TypeScript) NEVER load Python interpreters, NEVER spawn Python subprocesses, NEVER depend on Python packages. Same isolation discipline as ADR-0089 §6 for CSM-1B inference.

Composition path: `apps/api` (TypeScript Fastify) → Foundation-internal HTTP boundary (NEW; defined at PY3) → Python Intelligence Service (NEW; defined at PY4+) → returns SAFE-projected result.

### 2. Allowed use cases (per Founder direction)

Python MAY be used for:

- analytics aggregation that exceeds Section 6's pure-TS expressiveness
- forecasting / time-series projection
- optimization (linear / convex / combinatorial)
- machine learning (training + offline evaluation)
- simulation / scenario modeling
- recommendation scoring (e.g., COE rerank candidates)
- Hive signal scoring (Hive Intelligence Runtime forward queue)
- semantic classification (e.g., communication-tier work-vs-non-work classification, when E4 ECIL substrate authorizes consent-bound content summaries)
- meeting / communication signal extraction research (ECIL Tier 2+ forward-substrate)
- Agent Playground best-path scoring (ADR-0076 forward queue)
- offline evaluation jobs (e.g., drift signal calibration)

### 3. Forbidden use cases (per Founder direction)

Python MUST NOT be used for:

- CRUD operations (these stay in TypeScript)
- normal HTTP API routes (these stay in `apps/api`)
- Control Tower / frontend screens
- simple validation (closed-vocab enum check, UUID format, etc.)
- **governance enforcement** (RULE 0 sovereignty, policy evaluation, dual-control middleware, audit chain integrity — all stay in TypeScript/Foundation core per RULE 9 + ADR-0069 §9 governance-is-Foundation-only)
- direct database mutation (Python service is read-mostly; any writes flow through Foundation-internal HTTP boundary back to TypeScript service tier which writes via Prisma)
- secret material access (Python service receives sanitized envelopes; never connects directly to the deployment-target secret manager)
- LLM provider calls without explicit per-call Founder authorization

### 4. Foundation-scoped input envelope (ADR-0069 §9 (a))

Every Python invocation MUST carry a typed Foundation-scoped input envelope:

```json
{
  "envelope_version": "1.0",
  "request_id": "<UUID>",
  "caller_entity_id": "<UUID>",
  "org_entity_id": "<UUID>",
  "purpose": "<closed-vocab purpose enum>",
  "consent_proof": "<consent-chain reference per ADR-0048 forward-substrate>",
  "scope_envelope": {
    "tenant_isolation": "<org_entity_id; never multi-tenant>",
    "dmw_scope": "<DMW scope per ADR-0001>",
    "retention_class": "<STANDARD | AGGREGATE_ONLY | EPHEMERAL per ADR-0079>"
  },
  "payload_safe": "<SAFE-projected input data; never raw capsule content; never PII unless explicitly bound to this purpose>",
  "no_leak_assertions": {
    "no_employee_scoring": true,
    "no_manager_surveillance": true,
    "no_psychological_inference": true,
    "no_protected_attribute_inference": true,
    "no_political_inference": true,
    "no_health_inference": true,
    "no_relationship_inference": true
  }
}
```

The envelope is constructed by the TypeScript service tier per the Python-aware service's contract; Python never builds it. The Python service validates the envelope at entry; any envelope failing the no_leak_assertions or missing required fields is rejected with a typed failure code (no inference fired).

### 5. SAFE projection of outputs (ADR-0069 §9 (b))

Every Python output MUST follow the Section 6 SAFE projection pattern (ADR-0061 §1.a):

- closed-vocab fields only
- closed-vocab signal labels (no raw numeric scores presented as ranks; integer counts + derived rates per ADR-0061 §1.a allowance)
- `honest_note` field explaining what the signal IS and is NOT
- `org_entity_id` echo for caller verification
- `redacted: boolean` when k=5 (or per-computation minimum) gate triggers
- no per-actor attribution
- no per-team attribution that could re-identify
- no raw input data echoed back

For computations that produce richer structures (e.g., simulation results), the SAFE projection MAY be a closed-vocab record with derived aggregate fields — never raw probabilities, never per-individual predictions, never feature-importance breakdowns that could re-identify.

### 6. Policy / auth gate (ADR-0069 §9 (c))

Python invocation MUST pass:

- Caller authentication at the TypeScript service tier (per existing `requireAuth` / `requireAdminCapability` middleware)
- Per-purpose authorization (the `purpose` enum in §4 envelope is checked against the caller's PermissionBundle per ADR-0080)
- Section 2 policy evaluator if the Python output will be used to propose a Section 2 Action (per ADR-0057)
- Dual-control if the purpose maps to a privileged endpoint per ADR-0026 (e.g., model retraining; PY10+ forward-substrate)
- W5 promotion path if the Python output proposes a W4 catalog action (per ADR-0086)

Python never authenticates a caller. Python never decides policy. Python receives a verified envelope from TypeScript and computes a SAFE-projected result.

### 7. Audit emission posture (ADR-0069 §9 (d))

Each Python invocation emits at the TypeScript service tier (NOT inside Python) two `ADMIN_ACTION` audit events:

- **Entry:** `ADMIN_ACTION` + `details.action = "PYTHON_COMPUTATION_INVOKED"` + `details.purpose` (closed-vocab) + `details.request_id` + caller scoping. Emitted BEFORE the Python service is called per RULE 4.
- **Exit:** `ADMIN_ACTION` + `details.action = "PYTHON_COMPUTATION_COMPLETED"` + `details.purpose` + `details.request_id` + `details.outcome` (closed-vocab: `SUCCESS` / `DENIED_ENVELOPE_INVALID` / `DENIED_NO_LEAK_FAILED` / `FAILED_TIMEOUT` / `FAILED_INTERNAL`) + `details.redacted: boolean`. Emitted AFTER the Python service returns or fails.

**No new audit literal** required — both rides existing `ADMIN_ACTION + details.action` discriminator pattern (precedent: all 7 Section 6 aggregates use `ANALYTICS_READ` discriminator). The audit literal extension is deferred until a Python-specific lifecycle event surfaces that the discriminator can't cleanly express.

### 8. No-leak surface (ADR-0069 §9 (e))

Foundation enforces the no-leak invariant at four boundaries:

1. **Envelope construction** (TypeScript service tier) — SAFE projection BEFORE the envelope crosses the Python boundary. Raw capsule content, raw PII, secret material, vendor tokens, OAuth headers NEVER enter the envelope.
2. **Envelope validation at Python entry** — Python rejects any envelope with `no_leak_assertions` missing or false.
3. **Output projection at Python exit** — Python returns only the SAFE projection per §5. Raw model outputs, raw feature importance, raw embeddings, raw probability distributions stay inside the Python service or are reduced to closed-vocab labels before exit.
4. **TypeScript receipt** — the TypeScript caller validates the Python response shape against the registered output schema for the purpose; unknown fields or oversize payloads are rejected.

### 9. Governance hook (ADR-0069 §9 (f))

Foundation remains the source of governance truth at every tier:

- **RULE 0 sovereignty** — same-org boundary at envelope construction (org_entity_id scoping) + Python service has no cross-tenant visibility
- **DMW scope** — envelope carries DMW scope per ADR-0001; Python never accesses capsules outside the envelope
- **W5 promotion path** — if Python output proposes a Section 2 Action, the promotion flows through `promoteProposedActionForCaller` per ADR-0086. Python NEVER creates Section 2 Actions directly.
- **Section 2 execution authority** — Python proposes; Foundation governs; Section 2 executes
- **ADR-0026 dual-control** — privileged purposes (e.g., model retraining at PY10+) require dual-control wrapping per ADR-0026 route-bound static posture
- **ADR-0049 GOVSEC.7 tenant isolation** — Python service has tenant-bounded service identity; cross-tenant fusion is structurally impossible
- **ADR-0070 regulator-readiness** — Python invocations + outcomes are auditable via §7 chain; LawfulBasis per ADR-0036 applies when REGULATOR-tier purpose is used

### 10. Implementation ladder — 10 forward-substrate slices

V1 is doctrine-only at this ADR. Each implementation slice PY1-PY10 requires separate Founder authorization.

- **PY1 — Python service repo scaffold + CI tier add** (operational; no Python code yet). `services/python/` directory NEW; `pyproject.toml` NEW with `python = ">=3.11"` + `pytest` + `ruff` + `mypy` strict; `.github/workflows/python-tier.yml` NEW with typecheck (mypy) + lint (ruff) + test (pytest). Zero source code; just the substrate scaffold.
- **PY2 — Foundation-internal HTTP boundary spec (TypeScript side)** (design ADR; no code). Defines `POST /internal/python/compute` request/response contract; closed-vocab purpose enum; SAFE envelope per §4; SAFE response per §5; never publicly exposed.
- **PY3 — Foundation-internal HTTP server (Python side)** (substantive code; fixture-only). FastAPI / Starlette server (RULE 21 pin choice at PY3); listens on Foundation-internal port; rejects requests without internal-network origin; per-request envelope validation. Returns a single deterministic SAFE fixture per purpose; no real intelligence yet.
- **PY4 — TypeScript client wrapper** (substantive code). `apps/api/src/services/python/python-client.ts` NEW; wraps the HTTP boundary; emits `PYTHON_COMPUTATION_INVOKED` + `_COMPLETED` audit events per §7; validates response shape.
- **PY5 — First Hive Intelligence Runtime Python signal (fixture-only)** (substantive code; per Founder direction). Python implements a fixture-deterministic scoring of one Hive coordination signal (e.g., approval-backlog Tier 1 weighting). No real data ingestion; fixture inputs + fixture outputs only. Compose against ADR-0087 §9 forward queue + ADR-0086 W5 promotion path.
- **PY6 — Test substrate + evaluation fixtures** (substantive test substrate). Foundation-internal fixture catalog for Python evaluation; CI tier exercises against fixtures only; no production data.
- **PY7 — First real-data Python computation (per-tenant opt-in)** (substantive runtime; Founder-gated). The first Python signal that consumes real Foundation data (still through the envelope per §4); per-tenant opt-in; per-purpose scope; revocable.
- **PY8 — Agent Playground best-path scoring slice** (substantive runtime; Founder-gated). Composes against ADR-0076 forward queue.
- **PY9 — ML model training infrastructure** (substantive operational; bounded scope; Founder-gated). Per-tenant training data envelope; no cross-tenant fusion; model artifacts pinned per ADR-0016.
- **PY10 — Production GA across multiple purposes** (operational; Founder-gated). Multiple Python purposes in production; per-tenant rollout cadence.

**External model APIs (OpenAI / Anthropic / HuggingFace Inference / etc.) NOT in this ladder.** Per Founder direction *"No external model APIs unless separately authorized"* — composes against a separate forward-substrate ADR per provider with its own RULE 21 research arc.

### 11. First Python slice candidate (per Founder direction)

Per Founder direction: *"First Python slice should likely be: Hive signal scoring or Agent Playground scenario scoring; fixture-only; no sensitive live data; safe scoring output only; audit-friendly result shape."*

The recommended PY5 slice candidate when Founder authorizes is **Hive signal scoring (fixture-only)** — specifically, port the existing `APPROVAL_BACKLOG` Tier 1 weighting (LIVE per ADR-0087 §3) into Python as a parity test. This serves as:

1. The minimum viable end-to-end Python boundary exercise
2. A parity check: Python implementation must produce identical labels to the TypeScript reference for every fixture
3. A foundation for future real signals (PY7+) where Python's expressiveness (e.g., weighted multi-signal scoring, dimensionality reduction) exceeds Section 6's pure-TS substrate

If Founder authorizes a different first slice (e.g., Agent Playground scenario scoring per ADR-0076 forward queue), the same envelope + SAFE projection + audit posture apply.

### 12. NO code / schema / dependency / runtime / audit literal at this ADR

This is a design-only ADR. No `services/python/` directory. No `pyproject.toml`. No `.github/workflows/python-tier.yml`. No `python-client.ts`. No `AUDIT_EVENT_TYPE_VALUES` extension. No Python interpreter installed in CI. No Python package downloaded. No `pip` invocation. The ADR locks the doctrine; PY1 lands the scaffold; PY3 lands the first Python source code.

### 13. RULE 0 sovereignty preserved at every tier

Every Python computation inherits same-org boundary (envelope `org_entity_id` scoping enforced at TypeScript service tier + verified at Python entry per §6), entity-bound scoping (caller_entity_id in envelope), no AI clearance raise (RULE 0; Python's outputs respect caller's existing capability tier), no cross-tenant fusion (envelope is single-org by construction; Python service has no multi-tenant accumulation surface).

## Consequences

**Positive.**

- The Python Intelligence Runtime substrate boundary is named, bounded, and locked at the doctrine tier per ADR-0069 §9's explicit requirement.
- The 6 ADR-0069 §9 sub-substrate concerns are enumerated + answered: input envelope (§4) + SAFE projection (§5) + auth gate (§6) + audit posture (§7) + no-leak surface (§8) + governance hook (§9).
- The 10-slice forward-substrate ladder PY1-PY10 is bounded. Each slice has defined per-slice Founder authorization.
- Foundation's existing 8 substrate registers (Section 1-7 + Hive Intelligence Runtime + W4 + W5 + ECIL Doctrine + Voice Doctrine) compose cleanly with the Python boundary — Python becomes an extension point under governance rather than a parallel runtime.
- Zero Python footprint at this slice means no CI cost increase, no dependency footprint expansion, no surface-area widening until PY1 lands.
- The 3 candidate computations (COE / analytics / drift-rollup) named in pre-flight stay forward-substrate; the TypeScript implementations remain canonical until PY5+ parity verification.

**Negative.**

- The 10-slice ladder is long. Each slice requires per-slice Founder authorization. Python footprint enters the repo gradually rather than as a single landing.
- Foundation-internal HTTP boundary adds a network hop per Python invocation. Latency-sensitive computations may require in-process caching at the TypeScript tier or batching at PY3+.
- Python's dependency tree is famously sprawling. RULE 21 pin discipline at PY1 + ADR-0016 Pin-and-Optimize Framework at every dependency addition is mandatory to keep the substrate honest.

**Forward-substrate (NOT authorized by this ADR).**

- All 10 implementation slices PY1-PY10.
- External model APIs (OpenAI / Anthropic / HuggingFace / Cohere / etc.) — each requires separate per-provider ADR + RULE 21 research arc.
- Real-time streaming Python inference (vs. request/response).
- Cross-tenant Python aggregation (would violate §13 + GOVSEC.7).
- BEAM-Python coordination (composes against ADR-0028 forward queue + ADR-0069 §2.4 Python role).
- Python-side capsule writes (Python is read-only; writes flow through TypeScript per §3).
- Container-image-based Python deployment topology (locked at PY3 per ADR-0016).
- Multi-language voice signal extraction (composes against ADR-0088 ECIL E5/E6/E7 + this ADR; both gated).

## Alternatives

**Alternative A: Embed Python in `apps/api` as child process / FFI.** Rejected — same isolation argument as ADR-0089 §6 for CSM-1B. Process boundary preserves runtime separation, dependency isolation, and CI tier discipline.

**Alternative B: Use Elixir/BEAM instead of Python for the intelligence runtime.** Rejected per ADR-0069 §2.3 vs §2.4 division of labor: Elixir/BEAM is for long-running coordination + fault tolerance + supervised actor lifecycles (§2.3); Python is for intelligence-heavy computation + ML + forecasting + optimization (§2.4). The two are complementary, not interchangeable.

**Alternative C: Skip readiness ADR; land PY1 scaffold directly.** Rejected — ADR-0069 §9 explicitly mandates the service-boundary ADR before the first Python slice. RULE 21 binding for substrate-architectural pastes.

**Alternative D: Bundle PY1-PY3 into V1 (scaffold + HTTP boundary + first Python source).** Rejected — keeps the per-slice authorization granularity per the Founder direction. PY1 is operational (no source); PY3 is the first source-code commit; both require explicit Founder gates.

**Alternative E: Allow Python to call LLM providers in V1 without per-provider authorization.** Rejected per Founder direction: *"No external model APIs unless separately authorized."* Each LLM provider requires its own ADR + RULE 21 research arc + Founder authorization.

## Cross-references

ADR-0001 (three-wallet; entity-bound scoping inherited) ·
ADR-0002 (append-only audit chain; preserved) ·
ADR-0016 (Pin-and-Optimize Framework; Python dependency pins at PY1 + every addition) ·
ADR-0017 (Production Discipline; Python deployment per deployment target) ·
ADR-0018 (Deployment-Target Agnosticism; Python runtime per deployment target) ·
ADR-0020 (two-register IP discipline; patent-implementation evidence) ·
ADR-0021 (CapsuleType extension protocol; not used at this ADR) ·
ADR-0026 (dual-control; privileged Python purposes use route-bound posture) ·
ADR-0028 (BEAM coordination forward queue; BEAM-Python coordination at forward-substrate) ·
ADR-0036 (LawfulBasis; regulator-tier Python purposes) ·
ADR-0048 (working-set provenance; envelope per-capsule binding at PY7+) ·
ADR-0049 (GOVSEC.7 tenant isolation) ·
ADR-0050 (Break-Glass; Python never bypasses) ·
ADR-0052 §8 (Otzar DGI doctrine; Python respects same Twin-to-Twin bounds) ·
ADR-0057 (Section 2 Action runtime; Python proposes; Section 2 executes) ·
ADR-0058 (no manager surveillance; Python signals inherit) ·
ADR-0059 + ADR-0061 (Section 3 + 6 substrate patterns Python composes against) ·
ADR-0069 §2.4 + §9 (Elixir/BEAM Substrate-Coherence Law — ADR-0090 closes the §9 sub-substrate-ADR slot) ·
ADR-0070 (Regulator-Ready doctrine; preserved) ·
ADR-0076 (Section 5 Wave 9 Agent Playground; PY8 forward-substrate composes against) ·
ADR-0077 §8.4 (Foundation-first cadence; CT Python consumer surface at forward-substrate) ·
ADR-0079 (Retention Class; Python envelope carries) ·
ADR-0080 (PermissionBundle; Python purpose authorization) ·
ADR-0084 (Section 4 connector strategy; Python does NOT bypass connector governance) ·
ADR-0086 (W5 Action Promotion Runtime; Python proposes via W5) ·
ADR-0087 (Hive Intelligence Runtime V1; first Python slice candidate at PY5) ·
ADR-0088 (Enterprise Communication Intelligence Layer Doctrine; ECIL E4+ Tier 2+ signals are natural Python parity candidates at forward-substrate) ·
ADR-0089 (Sesame CSM-1B Self-Hosted Voice Provider Readiness Doctrine; sibling isolation-boundary ADR; precedent for runtime separation).

## RULE references

RULE 0 (humans always sovereign; envelope per-org scoping inherited) + RULE 4 (audit chain integrity; §7 entry + exit emissions) + RULE 9 (modular service-tier connections; Python is a service with HTTP boundary) + RULE 10 (soft-delete; preserved) + RULE 11 (Elixir/BEAM canonical patterns; relevant at BEAM-Python coordination forward-substrate) + RULE 13 (substrate-honest pre-flight; embedded above as the repo Python audit + candidate computation enumeration) + RULE 14 (bidirectional citation; this ADR cites and is cited by ADR-0069 + ADR-0085-0089 catalog entries) + RULE 16 (no console.* in apps/api/src; preserved — no code in this slice) + RULE 20 (Founder-only RULE/ADR modification; this ADR lands per `[FOUNDER-AUTH — W5 + LIVING ENTERPRISE INTELLIGENCE AUTONOMOUS BUILD]`) + RULE 21 (substrate-architectural research arc; this ADR's research arc IS the substrate-honest pre-flight per §Context — Python's published ecosystem doesn't require external vendor research; the canonical substrate research is ADR-0069 §2.4 + §9 internal reference + the repo audit).
