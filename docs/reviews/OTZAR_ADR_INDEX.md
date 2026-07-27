# OTZAR — ADR Index (Foundation)

**Location:** `docs/architecture/decisions/`  
**Count:** 94 files (template `0000` + ADRs; sequence 0001–0094 with **0056 absent**)  
**Audit date:** 2026-07-27  
**Method:** filesystem inventory + status greps + code presence cross-check (not "Accepted ⇒ implemented")

---

## Status summary (approximate)

| Bucket | Count (grep-based) | Notes |
|--------|--------------------|-------|
| Files mentioning Accepted | 79 | Includes historical closure language |
| Files mentioning Proposed | 42 | Includes residual Proposed language (e.g. ADR-0049) |
| Superseded/deprecated mentions | 11 | Partial; many are amendment notes not full supersession |
| Total decision files | 94 | |

**Honest rule:** Status text is not proof of runtime. See compliance matrix.

---

## Domain dependency graph (governing ADRs)

```
RULE 0 / ADR-0001 three-wallet
  ├─ Memory / COSMP: 0002, 0009, 0021, 0033, 0041–0047, 0048
  ├─ Twin routing: 0046, 0001 amend, 0039 amend
  ├─ Otzar product doctrine: 0052 → 0051, 0053, 0054, 0055, 0058, 0068
  ├─ Execution / actions: 0057, 0086
  ├─ Hives: 0059, 0062–0064, 0087
  ├─ Playground: 0060, 0065, 0072–0077
  ├─ Analytics: 0061
  ├─ Dandelion / OOTB: 0080, 0082
  ├─ Connectors / MCP: 0084
  ├─ Voice: 0085, 0089
  ├─ Billing: 0083, 0093
  ├─ Comms intelligence: 0088
  ├─ BEAM expansion: 0028–0035, 0038–0040, 0069, 0091–0092
  ├─ GOVSEC: 0049, 0050, 0070, 0071
  └─ Substrate discipline: 0011–0019, 0020, 0025–0027, 0029, 0035
```

---

## Catalog by number (title + status sketch + Otzar relevance)

| ADR | Title (short) | Status sketch | Otzar relevance |
|-----|---------------|---------------|-----------------|
| 0001 | Three-wallet architecture | Accepted + AI Twin dual-context amend | Core DMW |
| 0002 | Append-only audit chain | Foundational Accepted | All operations |
| 0003–0008 | Config, auth gate, no-console, leak, compliance auth, ECP | Accepted | Platform |
| 0009 | COSMP 7-ops | Patent-locked | Capsule ops |
| 0010–0015 | Test/CI substrate | Active | Engineering |
| 0016–0019 | Pin/optimize, prod discipline, deploy-agnostic, crypto | Active | Ops |
| 0020 | Two-register IP | Accepted | Docs voice |
| 0021 | CapsuleType extension | Accepted | Memory types |
| 0022 | combined_score | Accepted frozen | COE ranking |
| 0023–0027 | Helmet, husky, db push, dual-control, contributor gov | Accepted | Platform |
| 0028–0035 | BEAM phase + substrate discipline | Accepted cluster | Scale runtime |
| 0036 | REGULATOR + LawfulBasis | Accepted | TAR/regulator |
| 0037 | Jurisdiction tagging | Accepted | Sovereignty |
| 0038–0040 | DMWWorker, hive dispatch, DEVICE shard | Accepted | Scale |
| 0041–0047 | Capsule layer + hardening | Accepted | Memory accuracy |
| 0048 | Personalization orchestration | Accepted CLOSED sub-arc | Working set |
| 0049 | GOVSEC umbrella | **Proposed** (program open) | Hardening program |
| 0050 | Break-glass | Accepted (GAP-K1 closed; phase residuals) | Admin emergency |
| 0051 | Chat transparency | Accepted | Twin UX Wave 1 |
| 0052 | DGI doctrine | Accepted **doctrine-only** | Product truth |
| 0053 | Twin role-scope profile | Accepted design → **code later landed** | My Twin |
| 0054 | Conversation look-back | Accepted design → code landed | Continuity |
| 0055 | Correction linkage | Accepted design → code landed | Drift foundations |
| 0057 | Autonomous execution core | Accepted | Actions |
| 0058 | Drift detection coaching | Accepted | Wave 3 drift |
| 0059–0064 | Hives waves | Mix design/impl | Team intelligence |
| 0065–0077 | Playground long-term + waves | Mix | Scenario studio |
| 0066–0068 | Proposed pattern, priming, proactivity | Accepted lineage | Twin learning |
| 0069 | BEAM coherence law | Accepted | Elixir |
| 0070–0071 | Regulator doctrine / audit verify | Doctrine | Compliance |
| 0078–0079 | Conversation context signals / transcript policy | Accepted | Context |
| 0080 | OOTB ontology | Accepted multi-amend | Roles/tools |
| 0081 | Workflows doctrine | Accepted | Workflows |
| 0082 | Dandelion activation | Accepted + cartographer amend | Org seeding |
| 0083 / 0093 | Billing entitlements | Accepted | Monetization |
| 0084 | MCP connector strategy | Accepted | Integrations |
| 0085 / 0089 | Voice doctrine / Sesame readiness | Accepted | Voice |
| 0086 | Action promotion runtime | Accepted | Actions |
| 0087 | Hive intelligence runtime | Accepted | Hives |
| 0088 | Enterprise comms intelligence | Accepted | Comms |
| 0090 | Python intelligence runtime | Accepted | Enrichment |
| 0091–0092 | BEAM living / DMW expansion | Accepted | Runtime |
| 0094 | Governed agent transaction research | Accepted **research** | Future payments |

---

## CT-side decision docs (not Foundation ADR numbers)

Control Tower carries product control documents under `docs/otzar/master/` (MASTER_COMPLETION_CONTRACT, FOUNDER_REQUIREMENTS_REGISTER, YC_RC2_STATUS, RC2_CONTROLLING_DIRECTION). These govern **experience freeze claims**, not Foundation ADR numbering.

---

## Implementation files (entry points)

| Domain | Primary code |
|--------|----------------|
| Twin session | `apps/api/src/services/otzar/otzar.service.ts` |
| COE | `apps/api/src/services/coe/coe.service.ts` |
| COSMP write/read | `apps/api/src/services/cosmp/*` |
| Actions | `apps/api/src/services/action/*` |
| Work OS ledger | `apps/api/src/services/work-os/work-ledger.service.ts` |
| Org truth | `packages/database/src/queries/otzar-org-truth.*` |
| Dandelion | `apps/api/src/services/otzar/dandelion-*.ts`, `governance/dandelion*.ts` |
| Twin grants | `apps/api/src/services/otzar/twin-authority-grant.service.ts` |
| Break-glass | `apps/api/src/services/governance/break-glass.service.ts` |
| Schema | `packages/database/prisma/schema.prisma` |
