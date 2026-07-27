# OTZAR — Domain Systems Status (Verified)

**Date:** 2026-07-27  
**Evidence tiers:** CODE (repo) · UNIT (test file present) · INTEG (integration test present) · LIVE (public health/docs) · DOC_ONLY

---

## AI Twin pipeline

| Aspect | Status | Evidence |
|--------|--------|----------|
| conductSession 8-layer prompt | CODE + tests | `otzar.service.ts`, `tests/unit/otzar.test.ts` |
| COE governed retrieval | CODE + tests | `coe.service.ts` |
| Transparency surface | CODE | `transparency.ts`, ADR-0051 |
| My Twin role-scope | CODE + UI | routes + `MyTwin.tsx` |
| Authority grants | CODE + UI | twin-authority-grant, AuthorityGrants page |
| Correction memory | CODE | TwinCorrectionMemory, correction routes |
| Proactivity / drift signals | CODE PARTIAL product | proactivity, drift-*, proposed-pattern |
| Thread-grounded answers | GAP | system map D.1 |

**Overall:** **Strong core, partial ambient intelligence UX**

---

## Organizational truth

| Aspect | Status |
|--------|--------|
| OrgTruthRecord / ConflictSet / Candidate models | CODE (schema) |
| promote/retract/resolve queries | CODE (`otzar-org-truth`) |
| truth-weight + evidence snapshots | CODE services + tests (`otzar-org-truth*`, truth-evidence) |
| Employee-facing "truth UI" | PARTIAL / thin |

**Overall:** **Substrate IMPLEMENTED; product surfacing PARTIAL**

---

## Authority / RBAC / ABAC / TAR

| Aspect | Status |
|--------|--------|
| Permission 3-tuple | CODE + UI discipline |
| Escalation dual-control | CODE + tests |
| Break-glass | CODE ADR-0050 |
| Twin authority grants | CODE |
| TAR model | CODE (TokenAttributeRepository) |
| Regulator lawful basis | CODE ADR-0036 |
| Admin can_admin_org gating | CT AuthGuard + live admin e2e history |

**Overall:** **IMPLEMENTED with residual GOVSEC program open (ADR-0049)**

---

## Action Center

| Aspect | Status |
|--------|--------|
| Action / Attempt / Result / Policy models | CODE |
| action.service + policy-evaluator | CODE |
| Employee Action Center hub | CODE UI + redirects |
| Admin Action Center | CODE UI (RC2 hub) |
| Escalation approve/reject | CODE + UI |

**Overall:** **IMPLEMENTED operationally; UX still RC2 polish**

---

## Ingestion (by source)

| Source | Status |
|--------|--------|
| Paste / demo capture Comms | LIVE path (honest fixture labels) |
| Ambient auto-sync | CODE (#705–#708) primary doctrine |
| Google connectors OAuth | PARTIAL live; app-review / reauth residuals |
| Calendar | PARTIAL–STRONG (claimed provider proven; reauth residual) |
| Docs writeback | PARTIAL–STRONG (recent repair commits) |
| Meet | EXTERNALLY_BLOCKED / SCOPE_REAUTH common |
| Meeting capture models | CODE |
| Observe / OCR | CODE |
| Slack/Gmail full native | PARTIAL adapters; not universal LIVE |

---

## Approval and execution

| Aspect | Status |
|--------|--------|
| Action state machine | CODE |
| EscalationRequest | CODE |
| ExecutionAttempt proof | CODE work-os |
| Dual-control privileged platform ops | CODE ADR-0026 |
| Fully autonomous high-risk execution | CONSTRAINED by design (human gates) |

**Overall:** **IMPLEMENTED governed execution; not unconstrained autonomy**

---

## Memory

| Aspect | Status |
|--------|--------|
| MemoryCapsule + COSMP | IMPLEMENTED |
| Embeddings + similarity | IMPLEMENTED |
| Mutation discrimination | IMPLEMENTED |
| Wallet isolation | IMPLEMENTED |
| Conversation-linked corrections | IMPLEMENTED |

---

## Work-style learning

| Aspect | Status |
|--------|--------|
| Service + routes | CODE |
| E2E lifecycle | LIVE proven per ledger #719/#720 |
| Confidential bait exclusion | Claimed + tests |

**Overall:** **BEHAVIORALLY PROVEN (bounded)**

---

## Consent

| Aspect | Status |
|--------|--------|
| ConsentGrant model | CODE |
| Meeting participant consent | CODE |
| WorkCommsConsentEvent | CODE |
| Marketplace data consent | CODE |
| Unified employee consent UX | PARTIAL |

---

## Digital Work Wallet / DMW / portability

| Aspect | Status |
|--------|--------|
| Three-wallet DMW | IMPLEMENTED |
| wallet-portability classification | CODE |
| Portable-only export enforcement | CODE #709 |
| Phone credential / full professional identity portability product | FORWARD / PARTIAL |

**Note:** "Digital Work Wallet" marketing language maps to DMW/wallet substrate — not a separate blockchain wallet.

---

## Dandelion

| Aspect | Status |
|--------|--------|
| Growth/seed/activation services | CODE |
| CT Organization seeding surface | CODE preserved |
| Primary nav packaging | RECOMPOSED into Organization setup |

**Overall:** **ENGINE LIVE; packaging humanized**

---

## Integrations summary

**live / partial / fixture / external** mix:

- Internal messaging, ledger, twin chat: **live**
- Google suite: **partial live**
- Meet: **external/blocked residual**
- Comms paste: **fixture-capable + real extract**
- AVP² / Federation: **adjacent products**, not core Work OS path

---

## Public deployments

| Service | Domain | Fingerprint |
|---------|--------|-------------|
| API | api.otzar.ai | `git_commit=afe1491…`, database connected |
| App | app.otzar.ai | HTTP 200, bundle `index-DmQQIMEk.js` |
