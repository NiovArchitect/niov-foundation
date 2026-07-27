# OTZAR — Document Map

**Date:** 2026-07-27  
**Companion machine census:** `OTZAR_DOCUMENT_CENSUS.json`

---

## How to navigate (priority order)

1. **This audit pack** — `docs/reviews/OTZAR_*` (current-truth initialization)
2. **CT founder control** — `otzar-control-tower/docs/otzar/master/RC2_CONTROLLING_DIRECTION.md`
3. **CT completion register** — `MASTER_COMPLETION_CONTRACT.md` + `FOUNDER_REQUIREMENTS_REGISTER.json`
4. **YC experience freeze status** — `YC_RC2_STATUS.md` (NOT release-ready)
5. **DGI doctrine** — Foundation `docs/otzar/DOMAIN_GENERAL_INTELLIGENCE_DOCTRINE.md` + ADR-0052
6. **ADRs** — `docs/architecture/decisions/` (see OTZAR_ADR_INDEX.md)
7. **System/flow maps** — `docs/product/otzar-system-map.md`, `otzar-flow-map.md` (verify vs code)
8. **Holistic gate/ledger** — pointers; re-verify SHAs
9. **CURRENT_BUILD_STATE.md** — historical snapshot (2026-06-10) — do not treat as HEAD truth

---

## Foundation documentation tree (roles)

| Area | Path | Type | Trust |
|------|------|------|-------|
| Operating rules | `CLAUDE.md`, `AGENTS.md` | instructions | **Authoritative ops** |
| ADRs | `docs/architecture/decisions/` | decisions | Authoritative decisions; verify impl |
| Architecture framing | `docs/architecture/dynamic-flow-architecture.md` | RAA framing | RULE 17 load; Register-1 care |
| Otzar doctrine | `docs/otzar/*` | product doctrine | High for intent |
| Product maps | `docs/product/otzar-*.md` | living maps | Medium — verify |
| Contributing | `docs/contributing/*` | process | High for engineering |
| Ops | `docs/operations/*` | runbooks | High when current |
| Glossary | `docs/reference/glossary.md` | vocabulary | High |
| Progress trackers | `docs/reference/section-12-progress.md` | tracker | May lag |

---

## Control Tower documentation tree (roles)

| Area | Path | Type | Trust |
|------|------|------|-------|
| RC2 direction | `docs/otzar/master/RC2_CONTROLLING_DIRECTION.md` | founder | **Highest for UX** |
| Master completion | `docs/otzar/master/MASTER_*` | gates | Highest for freeze claims |
| Requirements | `FOUNDER_REQUIREMENTS_REGISTER.*` | register | Highest |
| YC RC2 status | `YC_RC2_STATUS.md` | release | Highest experience |
| PRDs / models | `docs/otzar/PRD-*`, `OTZAR_*_MODEL.md` | specs | Medium–high |
| Smoke / demo | `LIVE_*`, `demo/`, `simulation/` | evidence | Verify dates |
| Discipline | `docs/SECTION_12_DISCIPLINE.md` | process | High for CT work |
| Deploy | `docs/RENDER_DEPLOY_NOTES.md`, `render.yaml` | deploy | High |

---

## Adjacent product docs

| Repo | Key docs |
|------|----------|
| otzar-relay | README only — boundary table |
| niov-avp | `docs/protocol/avp2-v0.1.md` |
| niov-federation-cloud | README layering table (Foundation / Otzar / Federation) |
| AGENT-ZERO | AGENTS.md process |

---

## Supersession rules

| When older doc says… | Prefer… |
|----------------------|---------|
| "YC ready / FOUNDER_EXPERIENCE_APPROVED" without live proof | `YC_RC2_STATUS.md` + founder confirmation |
| Fixed SHAs in June handoffs | Live `git_commit` + live bundle hash |
| Accepted ADR = fully shipped product | Compliance matrix + route inventory |
| CURRENT_BUILD_STATE Phase 1209 | Git log from June–July 2026 + this audit |
| "Delete Dandelion" | RC2 controlling direction (preserve; recompose) |
