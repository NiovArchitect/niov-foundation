# OTZAR — Agent Zero Operating Rules (First-Contact Audit)

**Campaign:** Otzar first-contact deep initialization  
**Date:** 2026-07-27  
**Agent Zero version read:** 2.2 (2025-03-04)  
**Agent Zero HEAD:** `cdbceb1b79121af5b9552cd9143cc0caa9031e54`  
**Mode for this campaign:** Deep Dive discovery (read-only) — PLAN state only; no BUILD

---

## 1. Exact files read

| Path | Purpose |
|------|---------|
| `/Users/genghishameha/dev/NIOV Labs/github/AGENT-ZERO/README.md` | Entry, four sacred rules, workflow overview, Memory Bank, quality gates |
| `/Users/genghishameha/dev/NIOV Labs/github/AGENT-ZERO/AGENTS.md` | Full 1021-line canonical spec §§1–8 |
| `/Users/genghishameha/dev/NIOV Labs/github/AGENT-ZERO/LICENSE` | License only (not operational) |

**No additional process files** exist in AGENT-ZERO beyond README + AGENTS.md (single-file guide architecture). No `memory-bank/` is present in AGENT-ZERO itself; MB is a consumer-repo pattern.

**Not modified:** Agent Zero repository (read-only).

---

## 2. Instructions that govern this campaign

### 2.1 Four Sacred Rules (AGENTS.md §1)

1. **No new files without exhaustive reuse analysis**
2. **No rewrites when refactoring is possible**
3. **No generic advice** — cite `file:line` and concrete integration points
4. **No ignoring existing architecture/patterns**

### 2.2 Non-negotiables

- **Approval gates:** no file changes without explicit user approval
- **Citations:** code as `path:line`; MB as `file.md#Section`
- **Sandbox first:** never edit `main` directly for product work
- **MCP preferred** when available
- **No mock data** in production code; test fixtures OK
- **Context engineering:** keep working context task-focused

### 2.3 State machine (AGENTS.md §4)

```
PLAN → BUILD → DIFF → QA → APPROVAL → APPLY → DOCS
```

- **PLAN exit:** explicit user approval ("approved" / "looks good" / "proceed")
- **BUILD:** implement in sandbox; generate diff; **do not apply**
- **QA:** tests + lint + coverage + build; max **3** BUILD↔QA cycles then STALL
- **APPROVAL:** human gate only
- **APPLY:** only after approval
- **DOCS:** only after approved APPLY

### 2.4 Session startup (Deep Dive)

1. Compliance banner: "COMPLIANCE CONFIRMED: Reuse over creation"
2. Load MB if present (Foundation/CT: **no memory-bank/** — use ADRs + `docs/otzar/master/*` + `CURRENT_BUILD_STATE.md` as substitutes)
3. Log mode + context version

### 2.5 Compaction protocol

Persist state at every transition. This audit campaign is documentation-only; state is externalized into `docs/reviews/*` so recovery does not depend on chat context.

### 2.6 Quality gates (AGENTS.md §6)

- Unit + integration tests for new workflows
- Linter clean (warnings justified)
- Coverage thresholds
- Security review checklist
- Absolute prohibitions: no fake production data, no stubbed "complete", no ignoring test failures, no apply without approval

### 2.7 Budgets

- Cycles default 3; tokens/minutes task-specific; stall on two identical diffs

---

## 3. How Agent Zero alters the Otzar orchestration plan

| Agent Zero rule | Effect on this campaign |
|-----------------|-------------------------|
| PLAN-only until approval | **No product code changes**; discovery artifacts only |
| Reuse over creation | Prefer existing ADRs, system maps, master completion register over inventing architecture |
| Citations | All claims must map to repo paths / SHAs / live health fingerprints |
| Deep Dive mode | Read ADRs, doctrine, code, deploy — not README alone |
| No apply without approval | Deploy forbidden; product edits forbidden |
| STALL at 3 retries | Future repair campaign: max 3 fix cycles per task then escalate |
| DOCS after APPLY | Task docs only after future approved code landings |
| Parallel execution of independent work | Future campaign may fan specialists after plan approval |

**This campaign state machine position:** **PLAN (discovery complete → awaiting founder instruction)**

---

## 4. Contradictions: Agent Zero vs repository instructions

| Topic | Agent Zero | niov-foundation CLAUDE.md / AGENTS.md | Precedence decision |
|-------|------------|----------------------------------------|---------------------|
| Who may change RULES/ADRs | Not specified | **RULE 20:** Founder only | **CLAUDE.md wins** for Foundation governance |
| Multi-agent routing | N/A (single guide) | AGENTS.md routes Claude/Codex/Cursor/ChatGPT | **Repo AGENTS.md** for agent selection; Agent Zero for process state machine |
| Test concurrency | Not specified | **RULE 15:** one vitest cycle at a time | **RULE 15 wins** |
| console.log | Not specified | **RULE 16** ban in apps/api/src | **RULE 16 wins** |
| Soft-delete only | Not specified | **RULE 10** | **RULE 10 wins** |
| Memory Bank path | `memory-bank/*` | Absent; uses ADRs + CURRENT_BUILD_STATE + CT master register | **Adapt:** treat `docs/architecture/decisions`, `docs/otzar/*`, CT `docs/otzar/master/*` as MB equivalent |
| Sandbox never main | Required | Foundation merges via PRs; main is integration | **Both:** no direct main product edits; this audit only adds `docs/reviews/*` |
| Approval before docs | DOCS after APPLY | Foundation docs often land with code commits | For **product** work, Agent Zero applies; for this **audit**, user mandate allows docs/reviews only |
| Otzar CT plan-review gate | PLAN then BUILD | CT AGENTS.md: pre-flight → plan-review WAIT → six verifications | **CT AGENTS.md stricter for CT UI work** — combine with Agent Zero PLAN |

---

## 5. Precedence chain (locked for Otzar work)

```
1. Explicit user mandate for the campaign (this session)
2. CLAUDE.md RULES 0–21 (Foundation operational authority)
3. Repository AGENTS.md (multi-LLM routing)
4. Nested package / CT AGENTS.md + CLAUDE.md (frontend discipline)
5. Agent Zero AGENTS.md state machine + reuse + approval gates
6. Agency Agents specialist guidance (when specialists invoked)
7. ADRs + doctrine + master completion register (product truth contracts)
8. Living product maps (otzar-system-map, flow-map) — secondary if they conflict with code
9. Historical completion claims / CURRENT_BUILD_STATE snapshots — evidence only, verify vs HEAD
```

**Conflict resolution:** Higher wins. Surface lower-layer conflicts inline; do not silently patch.

---

## 6. Compliance banner for subsequent Otzar sessions

```
COMPLIANCE CONFIRMED: Reuse over creation

⚠️  GIGO PREVENTION - User Responsibilities:
📋 Clear task objectives | 🔗 Historical context | 🎯 Success criteria
⚙️  Architectural constraints | 🎖️ You lead - clear input = excellent output

Mode: deep | MB substitutes: ADRs + docs/otzar/master + docs/reviews
State: PLAN (until explicit approval of a BUILD plan)
Caretaker Relay: FORBIDDEN boundary
```

---

## 7. Implications for next (post-audit) repair campaign

1. Enter **PLAN** with Task Contract citing this audit’s `docs/reviews/*`
2. Require founder approval before any product BUILD
3. Select Agency Agents via `OTZAR_AGENCY_AGENT_ROSTER_REVIEW.md` (not Caretaker team)
4. One coherent release only (see final recommendation)
5. QA with repo-approved vitest configs (`vitest.unit.config.ts` / `vitest.integration.config.ts` per ADR-0035 §37)
6. Deploy only after explicit approval; verify Render SHA ≠ claim coded
7. Leave zero background workers; never touch Caretaker Relay repos
