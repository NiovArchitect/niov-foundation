# ADR-0017: Production Discipline

Status: Active
Date: 2026-05-07
Trigger: Track A Gate 7 + Gate 7-post + Gate 7-post-2 +
G5b-I Resolution (concrete evidence base across 4
commits)

## Context

Track A Gates 1-7 produced operational substrate. The
process of producing it surfaced patterns that distinguish
production-grade substrate work from velocity-grade
substrate work. Today's 4 substrate investigations each
demonstrated a different facet of the discipline:

- **Track A Gate 7** (`78cf1b5`): 6 documented drifts
  (G7-A through G7-PRE-C) showed that comprehensive
  pre-flight review can't catch all drifts; some only
  manifest in execution.
- **Gate 7-post** (`9f8e909`, Drift G7-E): showed
  env-loading patterns must be verified at every
  external-process boundary, not just where the obvious
  external dependency lives.
- **Gate 7-post-2** (`2fbc057`, Drift G7-PRE-C): showed
  apparent flakes often have deterministic root causes
  that code-level proof can identify without running n=10
  statistical reproduction cycles.
- **G5b-I Resolution** (`fbc7942`): showed inferred bug
  premises must be empirically verified before fix design
  — the most economical step in the entire investigation.

These weren't isolated lessons. They formed a coherent
discipline that, applied consistently, produces substrate
that holds up under enterprise/government compliance
review (SOC 2, FedRAMP, ISO 27001) and patent-holder
implementation-record scrutiny.

This ADR codifies the discipline as canonical reference.
Future Foundation substrate work — and any AI agent
helping with that work — applies these principles. The
discipline is non-optional for substrate that touches
production data, patents, audit trails, or compliance
posture.

### Substrate-honesty as discipline vs. as documentation

Documenting drifts is necessary but not sufficient. Drifts
catalogued without root-cause elimination accumulate as
technical debt — readable, but unfixed. The discipline is
not "document drifts as we find them"; it's "document
drifts as we eliminate them." Each resolved drift produces
substrate strength: the encoded prevention (test or
pre-flight check) means that class of bug can never
silently recur. Without prevention, the same drift returns
under a different name.

### The single-founder + AI-tools constraint

Foundation is built by one operator with AI assistance.
This constraint matters because traditional team-based
substrate disciplines (e.g., "have a senior engineer
review every PR") don't apply: there's no senior engineer
to delegate to. The discipline must produce maximum
diagnostic value with minimum operator overhead — but it
cannot relax to "ship fast and document later," because
the operator is also the only person who will catch the
deferred items.

The discipline answers this constraint by making AI
agents trustworthy collaborators within explicit decision
gates. Agents handle investigation rigor, drift framing,
empirical verification, fix scoping, draft surfacing.
Operator handles approval, green-light decisions, scope
calls, push authorization. The discipline's gates are
where the operator actually makes decisions; the work
between gates is where AI agents do the lift.

### The patent-holder implementation-record dimension

Every commit on `origin/main` is contemporaneous evidence
of original implementation by the patent holder. This
dimension elevates substrate-honesty from "good
engineering hygiene" to "legal requirement." A drift
quietly buried via shipping-fast becomes part of the
implementation record; a drift surfaced and resolved with
prevention becomes substrate strength documented in the
record.

### Why "ship fast and document drifts" is insufficient

The velocity-first posture works for substrate that
doesn't face audit, compliance, or patent scrutiny.
Foundation faces all three. The 9 commits on origin/main
today produced 19 catalogued drifts across the 4
investigations; if any of those 19 had been shipped
without resolution + prevention, audit reviewers would
encounter them as latent gaps. The discipline is the
opposite: 19 drifts catalogued, each either resolved
(11) or properly queued with explicit trigger conditions
(8). The implementation record reads: "every gap was
seen, every gap was either eliminated or scheduled for
elimination."

## Decision

The Production Discipline has six core principles. Each
principle is articulated, justified, and accompanied by a
concrete worked example from today's investigations.

### Principle 1: Convert inference to observation before fixing

When a drift's framing rests on inferred behavior rather
than observed behavior, the next step is empirical
verification — not fix design. Fixes built on speculation
ship wrong code; fixes built on observation ship the right
code. The verification step is usually cheap.

**Worked example: G5b-I Resolution Gate.** Original
framing: "Claude returns JSON-fenced output; parser
breaks; users get fallback." This was extrapolated from
fixtures recorded under a different prompt — an inference,
not an observation. Empirical verification (one Anthropic
API call with the production prompt at
`otzar.service.ts:629` against a representative
transcript) returned `"topics: iOS release planning,
feature documentation, onboarding redesign"` — clean
format that the production parser regex extracts cleanly.
The original framing was wrong. The fix scope shifted from
"patch the parser" to "fix the recording script + close
test coverage gaps." Without the verification step,
Foundation would have shipped a production-code change
that didn't fix any production bug.

**Cost analysis:** verification step cost ~$0.001 (one
Anthropic API call) and ~5 seconds. Cost of shipping the
wrong fix would have been: (1) a wrong production code
change in the audit trail, (2) the bug it pretends to fix
remaining in the substrate, (3) the actual recording-script
prompt mismatch remaining unresolved, (4) the test coverage
gaps remaining unaddressed. The verification was the
single most economical step in the entire investigation.

**Operational rule:** drift framings that rest on
inference must be flagged explicitly. The verification
step happens before fix design, not after.

### Principle 2: Reframe symptoms to root causes

When investigation surfaces evidence that a drift's
mechanism is different from its initial framing, the
framing must be updated before fix design proceeds. The
fix targets the actual root cause, not the visible
symptom. If the reframe expands scope, the gate's scope
expands accordingly.

**Worked example: G7-PRE-C investigation.** Original
framing: "intermittent admin-routes flake at ~33% rate,
candidates include rate-limit collision or session-store
race." Investigation traced the failure end-to-end:
`seedSkillPackages` is a no-op stub; `cleanupTestData`
doesn't truncate `SkillPackage`; three tests assume seed
data without creating it. The "33% flake" was the
deterministic fresh-vs-warm-container pattern, not
statistical intermittency. **Reframe:** "deterministic
test bug with three contributing causes, not a flake."
**Fix scope:** defense-in-depth across all three callers
(Option D), not just the visible failure (Option A).
Production-side root cause (no-op `seedSkillPackages`)
queued for Section 9 gate where product decisions can be
made.

**Operational rule:** investigations surface evidence;
evidence reshapes the framing; the framing drives the
fix. Frozen framings produce wrong fixes.

### Principle 3: Pre-flight verification at every external-process boundary

When workflow YAMLs invoke external processes (npm,
prisma, node scripts), the env loading and runtime
configuration each external process needs must be
verified at draft time, not at execution time. This is a
standing pre-flight check for any workflow YAML
modification.

**Worked example: Drift G7-E.** Track A Gate 7's workflow
YAMLs called `npm run db:push` directly. Locally,
`scripts/test-db-up.sh` sources `.env.test` before
invoking prisma. In CI, the workflow skipped that script
(Postgres service is already running) and called
`npm run db:push` directly without sourcing `.env.test`.
Prisma schema validation failed at line 15 looking for
`DIRECT_URL`. Pre-flight YAML review covered Anthropic
env loading (Drift G7-B) thoroughly but didn't extend the
same scrutiny to Prisma env loading. The drift surfaced
at first CI run.

**Operational rule:** every external process invoked by
a workflow step gets explicit env-loading verification at
draft time. The check is: "what env does this process
actually need at runtime?" — answered by reading the
process's config or documentation, not by extrapolation
from one external process to another.

### Principle 4: Determinism enforcement across container lifecycles

Test substrate must be deterministic across both fresh
and warm container states. Fresh-only or warm-only
determinism is brittle determinism. CI runs on fresh
containers; local development runs on warm containers.
Substrate that passes locally but fails in CI (or vice
versa) is undocumented state dependency masquerading as
determinism.

**Worked example: G7-PRE-C resolution.** Pre-fix, the
admin-routes test passed on warm containers (because
prior tests left `SkillPackage` rows behind) and failed
on fresh containers (no seed). The 1/3 local pattern
emerged because `db:test:up` brought a fresh container
and Run 1 failed; Runs 2+3 ran warm. CI runs always-fresh.
The fix made each test own its `SkillPackage` state via
`prisma.skillPackage.create` with `TEST_PREFIX`-prefixed
unique names. After the fix, Foundation produced its
first ever 111/112 result on a freshly-brought-up
Postgres container. Determinism became real, not
contingent.

**Operational rule:** every test must verify on both
fresh container AND warm container before claim of
determinism. Tests that own their state via `create()`
are deterministic; tests that depend on `findFirst()`
against ambient seed are not.

### Principle 5: Substrate-honesty as discipline, not documentation

Drifts catalogued without root-cause elimination
accumulate as technical debt. Drifts catalogued with
root-cause elimination + documentation become substrate
strength — each resolved drift becomes a class of bug
that can never recur. The discipline is not "document
drifts as we find them"; it's "document drifts as we
eliminate them, and encode the elimination as a substrate
test or pre-flight check."

**Worked example: today's 19 catalogued drifts** (G7-A,
G7-B, G7-C, G7-D, G7-E, G7-F, G7-PRE-A, G7-PRE-B,
G7-PRE-C, G5b-H, G5b-I, G5b-I-A, G6-A, plus prior
in-flight drifts each surfaced in their respective
investigation). Each surfaced; each got investigated;
each landed either as a fix in the substrate or a
properly-queued carryforward with explicit trigger
conditions. Production Discipline ADR's drafting itself
encodes the meta-discipline: today's investigations
provide concrete worked examples that future engineers
will reference when applying the same patterns.

**Operational rule:** every drift produces three artifacts
when resolved:
1. The fix (substrate change)
2. The substrate test or pre-flight check that prevents
   recurrence
3. The documentation (commit body, ADR, or carryforward
   queue) that surfaces the lineage for future readers

Drifts resolved with only the fix have not actually been
resolved per Production Discipline.

### Principle 6: Substrate modification remains a human decision

Even when AI agents (Codex, Claude) help with substrate
work, the decision to modify substrate stays with the
operator. Agents propose; operators approve; agents
execute. The three-approvals discipline (file inventory,
commit body, subject line) is non-optional. The
green-light gate before commit is non-optional. The push
gate separate from commit is non-optional.

This principle is inherited from ADR-0015's framing
("AI-assisted investigation is empowered, AI-driven
commit decisions are not") and elevated here to a
canonical operational rule that applies across all
substrate work, not just CI workflow design.

**Worked example: today's 9 commits.** Every commit went
through three approvals + green light + commit
verification + separate push authorization. The
discipline held even at decision-point pivots: at G5b-I,
when empirical verification revealed the original
framing was wrong, the operator made the scope-shift
decision (test substrate, not production code) — the
agent surfaced the evidence and proposed the reframe,
the operator approved the reframe and the new scope, the
agent executed against the approved scope. At Action 2
(branch protection), the operator correctly recognized
that configuring branch protection on a Free-tier private
repo would create a non-enforced rule (GitHub Free tier
doesn't enforce branch protection on private repos) —
and rejected the action entirely rather than executing a
substrate change with no operational effect. The agent
had surfaced "Action 2 still unblocked" in completion
summaries; the operator's substrate awareness caught what
the agent's status-summary pattern would have produced
if executed naively.

**Operational rule:** the operator is in the loop at
every substrate modification point. Agents work
autonomously between decision points; agents stop at
decision points; agents do not chain into next gates
without operator approval. The patent-holder
implementation record requires this — every commit is
the operator's deliberate decision, not an agent's.

## Worked Example: G5b-I Resolution as End-to-End Discipline Cycle

This single investigation exercised all six principles
in sequence. Walking through the cycle in concrete detail
serves as the canonical demonstration of how the
principles compose.

**Original framing.** Drift G5b-I was originally framed
during Gate 5 commit 5b's investigation as a production
bug: "the parser at `otzar.service.ts:634` expects
`topics: a, b, c` text format; both close-conversation
fixtures recorded JSON-fenced responses (Claude's
natural shape for topic-extraction prompts); production
users currently get `["conversation_summary"]` fallback
whenever LLM fires." This framing rested on extrapolation
from observed fixture content to inferred Claude behavior.

**Principle 1 applied: empirical verification.** Before
designing a parser fix, the gate's investigation phase
asked: is the inferred Claude behavior actually what
Claude does to the production prompt? The verification
step constructed a one-shot script (`/tmp/verify-extract-
topics-prompt.ts`) that loaded `.env.test.local` for the
real Anthropic key, instantiated the production
`AnthropicProvider`, and called `generateResponse` with
the exact production prompt and a representative
transcript. Cost: ~$0.001. Time: ~5 seconds. The
response: `"topics: iOS release planning, feature
documentation, onboarding redesign"`. Clean format. The
production parser regex `/topics:\s*(.+)/i` matched and
extracted three items.

**Principle 2 applied: reframe.** Inference disproven.
The "production parser is broken" framing was wrong.
Investigation surfaced the actual mechanism:
`scripts/record-llm-fixtures.ts` had a different prompt
than production code — the recording script asked Claude
for JSON, while production code asked for `topics: a, b,
c`. Fixtures contained JSON because the recording prompt
asked for JSON; production parser worked correctly
because Claude follows the production prompt. The reframe:
"test substrate misalignment, not production bug."

**Principle 4 applied: defense-in-depth scoping.** The
investigation also surfaced two collateral findings:
(1) zero positive-case tests for the parser (only the
fallback test at `otzar.test.ts:514`); (2) zero real-LLM
test exercising the production prompt + parser path.
Both findings amplified the substrate fragility — even
without G5b-I, future Anthropic model drift would
silently push production users into the fallback path
without detection. Fix scope expanded from "parser
patch" to test-substrate alignment + coverage gap
closure (Option D from the gate's options analysis):
fix the recording script prompt (a), re-record fixtures
(b), add positive-case parser unit test (c), add
real-LLM topic-extraction shape test (d), rewire
fixture-replay tests at `otzar.test.ts:696` and
`otzar-routes.test.ts:173` per Drift G5b-H (e).

**Principle 5 applied: encoded prevention.** Each fix
component was paired with prevention:
- Recording script prompt alignment prevents future
  recording-script-vs-production divergence
- Fixture re-record (idempotent via hash-drift detection
  in the recording script) ensures the fix is checkable
- Positive-case parser unit test prevents future parser
  regression silently passing
- Real-LLM topic-extraction shape test prevents future
  Anthropic model drift silently breaking production —
  the test that would have caught G5b-I's original
  recording-script mismatch is now operational
- Fixture-replay rewires (G5b-H) ensure the fixtures
  actually exercise the parser path now, converting
  forward-looking substrate to runtime-consumed
  substrate

The empirical-verification step, originally an
investigation tool, became the model for the new real-LLM
test — converting the verification pattern itself into
substrate that runs nightly.

**Principle 6 applied: three-approvals + green-light +
push-gate cycle.** The fix landed via the standard
discipline:
1. Investigation surfaced findings; operator approved
   reframe and Option D fix scope.
2. File modifications surfaced inline as diffs before
   write.
3. Pre-commit checks: typecheck (12 baseline preserved),
   gitignore safety, identity verification.
4. Three explicit approvals: file inventory (5 modified
   + 1 new = 6 files), commit body (Drift G5b-I reframe
   + meta-pattern + concrete numbers), subject line.
5. Green-light to commit (operator).
6. Commit executed; verification surface (`git log`,
   `git show --stat`, `git show --format="%an <%ae>"`).
7. Push authorization separate from commit (operator).
8. Auto-CI on push verified end-to-end: 3/3 jobs green;
   nightly retry produced 3/3 real-LLM tests passing
   (was 2/2; +1 new topic-extraction test active).

**Cost ledger.**
- Verification step: ~$0.001
- Fixture re-record: ~$0.002 (2 Anthropic calls)
- Real-LLM test added to nightly: ~$0.001/run × 365 ≈
  $0.37/year ongoing
- Total cost: ~$0.003 + $0.37/year
- Counterfactual cost (shipping the wrong fix): wrong
  production code change in the patent-holder
  implementation record, the actual mismatch unresolved,
  test coverage gaps unaddressed — costs that compound
  rather than amortize

**Meta-pattern documented.** The G5b-I commit body
captured the meta-principle for future Production
Discipline ADR drafting: "Drift framings rest on either
observed behavior or inferred behavior. When framing
rests on inference, the next step is 'convert inference
to observation before fixing'." That sentence became
Principle 1 of this ADR.

**Discipline closure.** Drift G5b-I → resolved via test
substrate alignment + coverage gap closure. Drift G5b-H
→ resolved as side effect (fixture-replay tests now
exercise the parser path with strengthened assertions).
Production parser → confirmed working empirically (no
production code change). Empirical-verification meta-
pattern → encoded as nightly real-LLM test. Investigation
lineage → preserved in commit body and this ADR's
Worked Example for future readers.

The cycle took roughly one operator-attended afternoon
of focused work. The cost-benefit ratio is the discipline
working as designed: cheap verification prevents
expensive wrong fixes; defense-in-depth scoping prevents
follow-on drift; encoded prevention converts each
investigation into substrate strength.

## Decision Template for Future Drift Investigations

When a drift surfaces, the investigation follows this
nine-step template:

1. **Frame the drift**: what's the visible symptom? what's
   the inferred mechanism?
2. **Distinguish observation from inference**: which parts
   of the framing rest on observed evidence? which rest on
   inferred behavior?
3. **Verify inferred premises empirically**: cheap
   verification (one API call, one fresh-container run,
   one targeted log inspection) before fix design.
4. **Reframe based on evidence**: update the framing to
   match what evidence revealed. If reframe expands
   scope, the gate's scope expands accordingly.
5. **Identify root causes**: investigate end-to-end until
   the actual mechanism is mapped (often multiple
   contributing causes; expect 2-3, not 1).
6. **Design fix scope**: defense-in-depth across all
   affected callers, not just the visible symptom.
   Production-side root causes that require product
   decisions get queued explicitly to the appropriate
   gate; test-side fixes land now.
7. **Apply with three-approvals discipline**: file
   inventory, commit body, subject line each approved
   separately by the operator.
8. **Encode prevention**: the resolution must include
   either a substrate test or a pre-flight check that
   prevents the class of bug from recurring. "Document
   for future caution" is not prevention.
9. **Document the lineage**: commit body, ADR, or
   carryforward queue captures the investigation for
   future readers. Documented investigations convert
   into substrate-discipline strength; undocumented
   investigations evaporate.

This template is canonical. Investigations that skip
steps 2-3 ship fixes built on speculation. Investigations
that skip step 6 ship single-symptom fixes that leave
defense-in-depth gaps. Investigations that skip steps
7-9 violate the substrate-modification-remains-human
principle (step 7) or accumulate as undocumented
substrate (steps 8-9).

The five-question template from ADR-0016 applies to
pinning decisions; this nine-step template applies to
drift investigations. Together the two templates
constitute Foundation's substrate-discipline canonical
references.

## Consequences

### Easier

- Drift investigations follow a documented template; no
  re-derivation per drift; consistency improves across
  investigations.
- Compliance reviewers see explicit investigation
  evidence with empirical verification — drift framings
  documented as observation-vs-inference, fixes
  documented as scope-expanded after evidence reframed
  the problem.
- Patent-holder implementation record gains documented
  discipline; every commit becomes deliberate substrate
  evidence rather than ad-hoc engineering judgment.
- Future contributors and AI agents can apply the
  discipline consistently without re-deriving the
  reasoning from first principles. The nine-step
  template is operationally executable.
- Drifts resolved deeply (fix + prevention + lineage)
  become substrate strength rather than tech debt; each
  resolved drift permanently raises substrate quality.
- The discipline is sustainable for single-founder + AI
  scale because the heavy lift (investigation rigor,
  drift framing, evidence gathering, fix surfacing) is
  agent-executable; the operator handles decision gates
  where deliberate human judgment is irreplaceable.
- Investor due diligence on substrate quality answered
  with deployable evidence — pointing at this ADR plus
  today's 4 worked-example commits is itself the answer.
- Operator can move faster within the discipline because
  decision gates are explicit; agents do the lift between
  gates; the operator's attention focuses on the
  decisions that actually require operator judgment.
- The discipline integrates naturally with ADR-0016's
  Pin-and-Optimize Framework as companion document;
  ADR-0016 covers what-to-pin discipline; ADR-0017 covers
  how-to-investigate-drifts discipline. Together the two
  ADRs cover the substrate-quality lifecycle from initial
  pinning to ongoing maintenance.

### Harder

- Every drift requires investigation rigor; the team
  cannot shortcut to fixes even when the fix seems
  obvious. The discipline applies even when "everyone
  knows" what's broken — because empirical verification
  has caught at least one wrong-framing investigation
  (G5b-I) where the obvious fix would have been wrong.
- Empirical verification adds cost. Per-drift the cost
  is small ($0.001 + 5 seconds for G5b-I), but
  accumulates across many drifts. For drifts where
  empirical verification requires more than a one-shot
  script (e.g., reproducing a race condition), the cost
  is larger and may need its own scope decision.
- The 9-step template adds friction to drift cycles.
  Each step is justified, but the template's discipline
  is heavier than ad-hoc investigation. Low-stakes
  drifts still go through the full cycle; the discipline
  doesn't relax for trivial issues.
- Reframe-based scope expansion makes gates larger than
  initially scoped. G5b-I started as "fix parser
  regex"; ended as 6-file commit covering recording
  script + fixtures + tests across three test tiers.
  The operator must accept that initial gate primers
  may understate eventual scope as evidence
  accumulates.
- Determinism verification across fresh + warm
  containers doubles local test cycles. For each
  test:integration run, both `db:test:up` (fresh) and a
  subsequent run on the same warm container must pass.
  This is operationally manageable but doubles per-cycle
  cost.
- The substrate-test-or-pre-flight-check requirement
  adds work beyond just the fix. Drift G7-PRE-C's
  resolution (Option D) added 2 test-file modifications
  + 1 new test file beyond the visible fix. The
  prevention work is non-negotiable per Principle 5,
  but it's real additional cost.
- Three-approvals + green-light + separate push gate
  cycles slow per-commit velocity. A 9-commit day
  required 27 approvals + 9 green-lights + 9 push
  authorizations. The operator's attention is the
  bottleneck; agents cannot bypass the gates.
- The discipline applies even when wrong-axis or
  wrong-scope is selected. The discipline is a reasoning
  scaffold, not a substitute for technical judgment.
  Wrong scope decisions go through the discipline and
  produce documented-but-still-wrong fixes; the
  prevention requirement helps but doesn't eliminate
  the risk.
- Operator burden of staying in the loop at every gate
  scales with substrate growth. Today's 9 commits + 19
  drifts is at the upper bound of what one operator
  can sustain in one focused day. As Foundation grows,
  the gate load grows; the discipline either scales via
  parallel operators (not the current state) or via
  agent capability improvements (Gate 9+ work).
- Substrate-honesty as discipline (not documentation)
  requires more investigation time than discovery time.
  Catching a drift takes seconds; investigating it to
  root cause takes minutes-to-hours; encoding prevention
  takes additional time; documenting lineage adds more.
  The total per-drift discipline cost is significantly
  higher than the discovery cost, and the operator must
  budget for this.
- The framework applies retroactively to existing drift
  carryforward queue. Track A's Gate 8 carryforward
  queue and the per-gate documented drifts each need
  retroactive treatment under this framework — explicit
  trigger conditions, explicit prevention encoded
  somewhere, explicit lineage. This is itself
  multi-gate Gate 8+ work.

## Alternatives Considered

- **Substrate-honesty as documentation only (today's
  pre-Track-A-Gate-7 state)**: rejected. Documentation
  alone preserves drift visibility but doesn't eliminate
  drifts. Without prevention encoded, the same drift
  silently returns under a different name. Today's 19
  catalogued drifts demonstrate why: each one was visible
  somewhere prior to its formal surfacing, but only
  resolved when the discipline cycled through it
  end-to-end with prevention encoded.

- **Velocity-first with retroactive cleanup**: rejected.
  Foundation's audit, compliance, and patent dimensions
  preclude this posture. Shipping fast and cleaning up
  later means the implementation record contains
  drift-by-design periods that audit reviewers will flag.
  The 9-step template's rigor is the price of producing
  compliance-ready substrate from the start.

- **AI-driven autonomous fixes without human approval
  gates**: rejected. The patent-holder implementation
  record requires every commit to be the operator's
  deliberate decision. Agent-driven commits would create
  contemporaneous evidence of agent implementation, not
  patent-holder implementation — a legal-record
  contamination risk. Agents may propose; operators
  approve; agents execute. This is non-negotiable per
  Principle 6.

- **Fix-first investigation (fix the visible symptom,
  defer root-cause analysis to maintenance)**: rejected.
  Visible symptoms are often artifacts of multiple
  contributing causes (G7-PRE-C had three contributing
  causes; G5b-I had a wholly different mechanism than
  its initial framing suggested). Fixing visible symptoms
  without root-cause analysis ships defense-in-depth
  gaps; the gaps eventually surface as new drifts that
  the prevention requirement of Principle 5 would have
  prevented.

- **Statistical-only flake handling (retry logic, skip
  flaky tests)**: rejected. G7-PRE-C demonstrated that
  apparent flakes often have deterministic root causes
  identifiable via code-level proof. Retry logic masks
  the bug; skipping the test loses coverage. Both
  approaches accumulate as substrate debt and violate
  Principle 4's determinism enforcement requirement.

## References

- **ADR-0011** (three-tier test stratification + Gate 6
  reproducibility amendment) — established the empirical
  evidence base that Production Discipline protects.
  Principle 4 (determinism across container lifecycles)
  is the substrate-test-discipline analog of ADR-0011's
  empirical-evidence discipline.
- **ADR-0014** (FixtureBasedLLMProvider key-based
  dispatch) — established the fixture infrastructure
  that G5b-I Resolution validated against production
  behavior. Principle 1 (convert inference to
  observation) leveraged ADR-0014's empirical-recording
  pattern for the verification call.
- **ADR-0015** (CI Workflow Architecture) — diagnostic-
  richness pattern + substrate-modification-remains-
  human-decision principle codified there map to
  Principle 6 here. ADR-0017 elevates the principle to
  canonical operational rule across all substrate work.
- **ADR-0016** (Pin-and-Optimize Framework) — companion
  ADR. ADR-0016 covers what-to-pin discipline; ADR-0017
  covers how-to-investigate-drifts discipline. Together
  the two ADRs form Foundation's substrate-discipline
  canonical references.
- `78cf1b5` (Track A Gate 7) — 6 drifts surfaced (G7-A
  through G7-PRE-C); demonstrates the discipline cycle
  applied to a new-substrate-introduction commit.
- `9f8e909` (Track A Gate 7-post) — Drift G7-E
  demonstrates Principle 3 (pre-flight verification at
  every external-process boundary).
- `2fbc057` (Track A Gate 7-post-2) — Drift G7-PRE-C
  demonstrates Principles 2 + 4 (reframe symptoms to
  root causes; determinism across container lifecycles).
- `fbc7942` (G5b-I Resolution) — demonstrates Principles
  1 + 2 + 5 + 6 explicitly; serves as the Worked Example
  end-to-end discipline cycle in this ADR.

Bidirectional citations (cited from):

- **ADR-0011** + **ADR-0014** — back-references added in
  Track A Gate 8a (this gate). ADR-0011's Bidirectional
  Citations link reproducibility evidence to Principles
  3 + 4; ADR-0014's Bidirectional Citations link fixture
  infrastructure to Principle 1.
- Track A Gate 8c will add ADR-0017 references in
  `CLAUDE.md` and a forthcoming
  `docs/contributing/onboarding.md` when contributor
  onboarding doc lands.
- Future drift investigations will cite ADR-0017 as
  their canonical reference for the nine-step template.
- Future Production Discipline amendments (when discipline
  evolves with operational evidence) will append to this
  ADR rather than producing a new ADR — preserving the
  canonical reference status.
