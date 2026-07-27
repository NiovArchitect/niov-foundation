# OTZAR — Instruction Precedence Map

**Date:** 2026-07-27  
**Ambiguity status:** RESOLVED for this campaign (see below)

---

## Precedence (highest → lowest)

| Rank | Source | Absolute / relative path | Governs |
|------|--------|--------------------------|---------|
| 0 | **User campaign mandate** | this session prompt | No product edits; no deploy; no Caretaker; audit-only |
| 1 | **Foundation CLAUDE.md RULES 0–21** | `niov-foundation/CLAUDE.md` | Sovereignty, build-forward, tests, audit, permissions order, ADR/RULE modification authority |
| 2 | **Foundation AGENTS.md** | `niov-foundation/AGENTS.md` | Which AI agent type owns work class |
| 3 | **Control Tower AGENTS.md + CLAUDE.md** | `otzar-control-tower/AGENTS.md`, `CLAUDE.md` | UI plan-review gate, six verifications, vocabulary, audit-aware UI |
| 4 | **CT RC2 controlling direction** | `docs/otzar/master/RC2_CONTROLLING_DIRECTION.md` | Experience recomposition laws; live truth vocabulary |
| 5 | **Agent Zero** | `AGENT-ZERO/AGENTS.md` | PLAN→BUILD→QA→APPROVAL state machine; reuse; citations |
| 6 | **Agency Agents** | `/Users/genghishameha/agency-agents/**` | Specialist selection & NEXUS handoffs |
| 7 | **ADRs** | `docs/architecture/decisions/*` | Architectural decisions (Founder-only modify) |
| 8 | **Doctrine / product maps** | `docs/otzar/*`, `docs/product/otzar-*` | Intent; must yield to code when stale |
| 9 | **Historical notes** | CURRENT_BUILD_STATE, old handoffs | Evidence only |

---

## Repository-local instruction files found

### niov-foundation

- `/Users/genghishameha/dev/NIOV Labs/github/niov-foundation/AGENTS.md`
- `/Users/genghishameha/dev/NIOV Labs/github/niov-foundation/CLAUDE.md`
- Nested contributing docs (not full recursive list here): `docs/contributing/*`
- No GROK.md / CODEX.md at root

### otzar-control-tower

- `AGENTS.md` (RC2 pointer + Section 12 discipline)
- `CLAUDE.md` (Section 12 discipline)
- `docs/SECTION_12_DISCIPLINE.md`
- `docs/otzar/master/*` (founder control surface)

### Agent Zero / Agency

- Read-only process + specialists

---

## Contradictions resolved

| Conflict | Decision |
|----------|----------|
| Agent Zero "no new files" vs audit artifacts | User mandate allows `docs/reviews/*` only; no product files |
| Agent Zero Memory Bank missing | Use ADRs + CT master + this audit pack |
| CLAUDE RULE 20 vs agent desire to amend ADRs | Agents propose only; Founder authorizes |
| CT plan-review WAIT vs Agent Zero PLAN | Equivalent; both require human approval before BUILD |
| Historical "done" vs RC2 reopen | RC2_STATUS + live SHA win |

**Proceed condition:** Precedence is **not ambiguous** for product work after this audit. Next BUILD still requires explicit user approval (Agent Zero PLAN exit).
