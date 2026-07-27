# OTZAR — Service and Data Flow

**Verified 2026-07-27** from `apps/api/src/services/*`, routes, Prisma models, and product maps.

---

## 1. Primary governed loops

### 1.1 Twin conversation (Wave 1+)

```
POST /api/v1/otzar/conversation/* (otzar.routes + otzar.service)
  → session auth
  → conductSession
  → COE.assembleContext (wallet-scoped capsules)
  → LLM completion
  → transparency projection (optional)
  → audit events
  → OtzarConversation / Turn persistence
```

**Data:** MemoryCapsule, OtzarConversation*, AuditEvent, COEOutcome

### 1.2 Communication → proposed work → Action Center

```
Comms ingest / ambient sync / meeting capture / observe
  → extract (comms-extract, proposed-action-extractor)
  → WorkLedgerEntry / Action / Obligation / Handoff
  → Notification to actors
  → UI Action Center / My Work / Blind Spots
  → approve/reject (EscalationRequest / Action policy)
  → execution attempt + proof (ExecutionAttempt)
```

**Data:** WorkComms*, Action*, EscalationRequest, WorkLedgerEntry, ExecutionAttempt, Notification

### 1.3 Internal human messaging (Work OS)

```
POST /work-os/internal-messages
  → resolveCollaborationTarget (org-scoped names)
  → WorkLedgerEntry(NOTIFICATION) + Notification
  → recipient inbox /app/inbox/:id
  → reply same human-authority path
```

**Known gap (system map):** Otzar chat is **not fully thread-grounded** — asking "what did X say?" may answer from COE/LLM rather than thread SoT.

### 1.4 Organizational truth

```
TruthEvidenceSnapshot (fingerprints / weights)
  → promoteOrgTruth / conflict sets
  → OrgTruthRecord (+ conflict candidates)
  → retract / resolve authority
```

**Code:** `packages/database/src/queries/otzar-org-truth.js`, `truth-weight.service.ts`, routes under otzar.routes for truth/conflict.

### 1.5 Dandelion / org seeding

```
Connector growth / meeting / hierarchy signals
  → dandelion-growth / dandelion-seed / governance dandelion-activation
  → review queue (approve/reject/hold)
  → people / structure / projects materialization
  → CT Organization setup surface (not deleted engine)
```

### 1.6 Work-style learning

```
Policy enable → observation session → candidates
  → human approve/reject
  → durable prefs (human-owned entity)
  → conductSession priming echo
```

**Live proven** per Holistic ledger (#719 / #720) with twin summary ownership fix.

### 1.7 Wallet portability

```
wallet-portability.ts classification
  → portable-only export enforcement (#709)
  → no confidential bleed into portable profile
```

---

## 2. Authority / approval stack

```
Permission (scope, share_forward, duration)
  + TwinAuthorityGrant (time-boxed twin powers)
  + ActionPolicy / policy-evaluator
  + EscalationRequest (dual-control where bound)
  + BreakGlassGrant (time-boxed emergency)
  + LawfulBasis (regulator path)
  → ActionAttempt → ActionResult → audit
```

**TAR:** TokenAttributeRepository model exists; regulator fields per ADR-0036.

---

## 3. Memory stack

```
Write path: COSMP write.service → MemoryCapsule (+ mutation_type, embedding)
Read path: COE.assembleContext + similarity.searchBySimilarity
Decay: lazy-at-read (ADR-0044)
Staleness: embedding_content_hash / embedding_generated_at (ADR-0045)
Correction: CORRECTION capsules + TwinCorrectionMemory + conversation_id link (ADR-0055)
```

---

## 4. BEAM / Python adjacency

| Runtime | When invoked |
|---------|----------------|
| cosmp_router gRPC | COSMP 7-ops coordination; hive/DMW dispatch by wallet_type |
| dbgi_supervisor | DMWWorker / Horde ENTERPRISE hot path |
| collaboration_supervisor | Work-os coordination events |
| python enrichment | Advisory extract on **ledger create** (not yet all message paths) |

---

## 5. End-to-end happy path (investor demo capable)

1. Login employee → Today
2. Comms/capture or ambient connector signal
3. Extraction → owned work cards
4. Action Center decision / send / track
5. Twin conversation with governed memory
6. Correction → later readback
7. Admin sees governance/security hubs without raw unpermitted employee content

**Caveats:** Meet reauth external; production multi-org not seeded; session not cookie-durable; RC2 experience gate not founder-approved.
