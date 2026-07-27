# OTZAR — Agency Agents Roster Review

**Campaign:** Otzar first-contact deep initialization  
**Date:** 2026-07-27  
**Agency Agents root:** `/Users/genghishameha/agency-agents`  
**Roster size:** ~274 agent markdown files across 17 divisions  
**Strategy layer:** NEXUS (Full / Sprint / Micro)

**Not modified:** Agency Agents repository (read-only).

---

## 1. Exact instructions read

| Path | Role |
|------|------|
| `/Users/genghishameha/agency-agents/README.md` | Roster overview, install, divisions |
| `/Users/genghishameha/agency-agents/strategy/QUICKSTART.md` | NEXUS-Full / Sprint / Micro activation |
| `/Users/genghishameha/agency-agents/strategy/EXECUTIVE-BRIEF.md` | Coordination, Reality Checker, Dev↔QA |
| `/Users/genghishameha/agency-agents/strategy/nexus-strategy.md` | 7-phase doctrine (partial deep read §§1–2) |
| `/Users/genghishameha/agency-agents/specialized/agents-orchestrator.md` | Pipeline controller, max 3 retries |
| `/Users/genghishameha/agency-agents/divisions.json` | Division catalog source of truth |

---

## 2. Divisions inventoried

academic · design · engineering · finance · game-development · gis · healthcare · marketing · paid-media · product · project-management · sales · security · spatial-computing · specialized · support · testing

**Otzar-relevant primary divisions:** engineering, product, design, security, testing, specialized, project-management.

---

## 3. Recommended specialists for Otzar (next release)

### SELECTED NOW (NEXUS-Micro / discovery complete → first coherent release)

| Exact path | Specialty | Otzar relevance | Phase | Selected | Reason |
|------------|-----------|-----------------|-------|----------|--------|
| `specialized/agents-orchestrator.md` | Pipeline controller | Coordinates PLAN→QA for multi-surface Work OS | All | **YES** | Required for any multi-agent campaign |
| `product/product-manager.md` | Product scope | RC2 surface recomposition vs backend preservation | PLAN | **YES** | Controls journey scope |
| `product/product-sprint-prioritizer.md` | Sprint cut | Prevents multi-release thrash | PLAN | **YES** | One coherent release rule |
| `engineering/engineering-backend-architect.md` | API/schema | Foundation Otzar/work-os/action services | BUILD | **YES** | Primary backend owner |
| `engineering/engineering-frontend-developer.md` | React/Vite | otzar-control-tower SPA | BUILD | **YES** | Primary frontend owner |
| `engineering/engineering-minimal-change-engineer.md` | Surgical diffs | RULE 1 build-forward + RC2 "preserve intelligence" | BUILD | **YES** | Prevents rewrites |
| `engineering/engineering-ai-engineer.md` | AI systems | Twin, conductSession, COE | BUILD | **YES** | Twin pipeline |
| `engineering/engineering-rag-pipeline-engineer.md` | Retrieval | COE + embeddings + context assembly | BUILD/QA | **YES** | Governed retrieval |
| `engineering/engineering-prompt-engineer.md` | Prompts | 8-layer Otzar prompt | BUILD | **YES if touch prompts** | Prompt surface is load-bearing |
| `engineering/engineering-privacy-engineer.md` | Privacy | RULE 0, wallet boundaries | REVIEW | **YES** | Sovereignty |
| `engineering/engineering-identity-access-engineer.md` | IAM | RBAC/ABAC, escalations, dual-control | BUILD/QA | **YES** | Authority paths |
| `engineering/engineering-code-reviewer.md` | Review | Diff quality | QA | **YES** | Independent review |
| `design/design-ux-architect.md` | UX structure | Action Center / Today / Organization hubs | PLAN/BUILD | **YES** | Surface recomposition |
| `design/design-ui-finish-gate-reviewer.md` | UI finish | RC2 signal / copy / brand | QA | **YES** | Founder signal defects |
| `design/design-persona-walkthrough.md` | Persona paths | First-use walkthrough RC2 | QA | **YES** | Fresh-user protocol |
| `security/security-architect.md` | Security architecture | Tenant isolation, dual-control | REVIEW | **YES** | Enterprise posture |
| `security/security-compliance-auditor.md` | Compliance | Audit trail, GOVSEC | REVIEW | **DEFER if not release** | Gate D still open |
| `testing/testing-reality-checker.md` | Production readiness | Defaults NEEDS WORK | QA gate | **YES** | Mandatory before ship claims |
| `testing/testing-evidence-collector.md` | Evidence | Live screenshots / SHA fingerprints | QA | **YES** | LIVE_ROUTE_VERIFIED discipline |
| `testing/testing-api-tester.md` | API tests | Foundation routes | QA | **YES** | Contract proof |
| `testing/testing-test-automation-engineer.md` | Playwright/vitest | CT live e2e matrix | QA | **YES** | Existing harnesses |
| `specialized/specialized-workflow-architect.md` | Workflows | Communication → work movement | PLAN | **YES** | Core product loop |
| `specialized/specialized-codebase-archaeologist.md` | Archaeology | Cross-repo truth vs docs | Discovery | **YES (this campaign)** | Already used as role analogue |
| `specialized/agentic-identity-trust.md` | Agent identity | Twin authority grants | REVIEW | **YES for authority work** | Twin grants |
| `project-management/project-manager-senior.md` | PM | Task list from completion register | PLAN | **YES** | Register-driven delivery |
| `engineering/engineering-desktop-app-engineer.md` | Tauri | src-tauri shell | DEFER | **DEFER** | Web coherence before desktop |
| `engineering/engineering-voice-ai-integration-engineer.md` | Voice | STT/TTS routes | DEFER | **DEFER** | Not first coherent release |
| `engineering/engineering-multi-agent-systems-architect.md` | Multi-agent | Playground / hive | DEFER | **DEFER** | Playground not primary path |
| `engineering/engineering-devops-automator.md` | Deploy | Render app.otzar.ai / api.otzar.ai | APPLY | **YES at deploy** | SHA verification |
| `engineering/engineering-sre.md` | Reliability | Live lag / auto-deploy | OPERATE | **YES if deploy issues** | RC2 deploy lag known |
| `engineering/engineering-data-engineer.md` | Data pipelines | Comms ingest, connectors | DEFER/BUILD | **CONDITIONAL** | If ingestion slice |
| `engineering/engineering-database-reliability-engineer.md` | DB | Prisma / Postgres | DEFER | **DEFER** | No schema work in first surface release |
| `specialized/data-privacy-officer.md` | Privacy officer | Consent, portability | REVIEW | **DEFER** | Unless wallet/consent release |
| `specialized/specialized-fedramp-rmf-compliance.md` | FedRAMP | GOVSEC | DEFER | **DEFER** | Gate D |
| `specialized/change-management-consultant.md` | Change | Org setup | DEFER | **DEFER** | After RC2 signal |
| `specialized/organizational-psychologist.md` | Org design | Dandelion cartography | DEFER | **DEFER** | |
| `design/design-ux-researcher.md` | Research | Fresh tester protocol | QA | **YES for freeze** | Founder RC2 rule |
| `product/product-feedback-synthesizer.md` | Feedback | Founder defect list | PLAN | **YES** | RC2 reopen defects |
| `security/security-appsec-engineer.md` | AppSec | API abuse | DEFER | **DEFER** | Unless security slice |
| `testing/testing-performance-benchmarker.md` | Perf | Scale R-03 | DEFER | **DEFER** | Gate B scale open |
| `engineering/engineering-realtime-collaboration-engineer.md` | Realtime | Relay | DEFER | **DEFER** | Gate C Relay open |

---

## 4. Explicitly NOT selected (wrong product / Caretaker bleed risk)

- Marketing growth/social agents (not product completion)
- Game development, GIS, healthcare specialty agents (out of domain)
- WordPress/Drupal/Solidity agents
- Any Caretaker Relay-specific team compositions (forbidden boundary)

---

## 5. Recommended activation mode for next campaign

**NEXUS-Micro (1–5 days)** for first coherent release after this audit:

```
Orchestrator: specialized/agents-orchestrator.md
PM: product-manager + product-sprint-prioritizer + project-manager-senior
Design: design-ux-architect + design-ui-finish-gate-reviewer + design-persona-walkthrough
Eng: backend-architect + frontend-developer + minimal-change-engineer
    (+ ai-engineer if Twin/chat path)
QA: evidence-collector + reality-checker + api-tester + test-automation-engineer
Deploy gate: devops-automator (SHA verify only after approval)
```

**Do not** activate NEXUS-Full. Otzar is mid-RC2; Full would thrash open gates B/C/D.

---

## 6. Handoff to Agent Zero

Agency Agents define **who** works; Agent Zero defines **when** (state machine) and **reuse discipline**.  
Orchestrator max-3-retries aligns with Agent Zero QA stall detection.
