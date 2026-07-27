# OTZAR — Claims vs Code Matrix

**Date:** 2026-07-27

| Claim (source class) | Verified truth | Classification |
|----------------------|----------------|----------------|
| Foundation is backend protocol for Otzar | Yes — Fastify + Prisma + BEAM | PUBLICLY PROVEN (API health + code) |
| app.otzar.ai serves Control Tower | HTTP 200 + render.yaml | PUBLICLY PROVEN |
| api.otzar.ai runs Foundation at HEAD afe1491 | health git_commit match | PUBLICLY PROVEN |
| JWT only in memory | CT README + architecture tests intent | LOCALLY PROVEN (design); live hard-refresh logout known |
| Complete Autonomous Enterprise | Gate B open; scale not proven | DOCUMENTATION OVERCLAIM if asserted |
| YC_RELEASE_CANDIDATE_READY | Explicitly NOT set (YC_RC2_STATUS) | STALE if older handoff says ready |
| FOUNDER_EXPERIENCE_APPROVED | Not claimed | Correctly open |
| All 94 ADRs implemented | Many design/partial | STALE/OVERCLAIM |
| GOVSEC fully closed | ADR-0049 Proposed; program open | DOCUMENTATION-ONLY program |
| Dandelion deleted in RC2 | Explicitly preserved | CONTRADICTS any "remove dandelion" notes |
| Organizational truth only aspirational | Models + promote path exist | CODE REAL; UI PARTIAL |
| Action Center is vapor | Full Action* stack + UI hub | FALSE (exists) |
| Twin is generic chatbot | COE + RULE 0 + authority | FALSE |
| Work-style learning not real | #719/#720 behavioral proof | FALSE |
| Meet fully live for all users | Often SCOPE_REAUTH / external | PARTIAL / EXTERNALLY BLOCKED |
| Cross-tenant isolation | Unit/integration strong; live multi-tenant demo limited | LOCALLY PROVEN (guards); production multi-org not demo-seeded |
| Relay is shipping primary product | Gate C open; provisional app | DOCUMENTATION-FORWARD |
| CURRENT_BUILD_STATE is current | Updated 2026-06-10 | STALE snapshot |
| Holistic gate closed | OPEN pointer docs | Correctly open |
| Session durable across refresh | Intentionally not | KNOWN LIMITATION P2 |
| Python enrichment on every message | Ledger create only | PARTIAL |
| Chat is thread-grounded | System map gap | P0 product gap |

---

## Currently publicly proven

- API up + DB connected + commit fingerprint match Foundation main
- App SPA serves
- (Historical live e2e matrices documented in CT; not re-run full this audit)

## Locally proven only (this campaign)

- Code presence of 103 otzar services, 114 Prisma models, 69 route modules
- Repo cleanliness / SHAs
- Document census counts
- Agent Zero / Agency Agents inventory

## Not proven this campaign

- Full vitest unit/integration suite (RULE 15 + 90–110m; not run)
- Full Playwright live matrix
- Founder live experience approval
- Mix/Elixir full suite
- Staging multi-tenant click-through

## Documentation-only / forward

- Full FedRAMP package
- Full Relay product
- Unconstrained autonomy
- S2500 scale
- Complete GOVSEC closure
