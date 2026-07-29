# OTZAR — Slice 2 backend carry-forward ledger

**Status:** OPEN — presentation UI shipped; backend obligations incomplete  
**Slice 2 UI deploy (Control Tower):** `a5287b8e` · bundle `assets/index-DmHKnZFn.js`  
**Foundation at ledger open:** `0167fc5f503b1f6dea7a9526a71f798d4340fdc4`  
**Whole-system recovery:** IN PROGRESS (do not claim Slice 2 backend closure)

This is a durable obligation register. Frontend rebucketing and soft gates do **not**
close these items. Each must be completed before whole-system release closure.

Status vocabulary: `OPEN` · `PARTIAL` · `CLOSED` · `BLOCKED_EXTERNAL`.

| # | Obligation | Status | Why it remains | Owner surface |
| --- | --- | --- | --- | --- |
| S2-1 | Server-side minimum work contract | OPEN | Cards still accept vague PROPOSED follow-ups from the API; CT only rebuckets | Foundation Work Ledger create/update |
| S2-2 | Autonomous AI-Teammate clarification | OPEN | Only partial CE-2 Request; no automatic clarify loop that upgrades unclear work | Foundation Otzar / work-os |
| S2-3 | Source-context enrichment | OPEN | Titles and outcomes still lack authoritative source lineage on create | Foundation enrichment + Python |
| S2-4 | Demo data quarantine and reseed | OPEN | Demo noise still mixes with live work; no quarantine path | Foundation seed / demo ops |
| S2-5 | Required Python enrichment configuration | OPEN | Render/config may leave enrichment off; UI hides failure copy only | Ops + Foundation Python rail |
| S2-6 | Malformed approval quarantine store | OPEN | CT blocks blind approve when recipient missing; server must quarantine bad rows | Foundation Action / approval store |
| S2-7 | My Work 20/20 live reliability | OPEN | Full authenticated multi-scenario matrix not proven at 20/20 | CT + Foundation live bank |
| S2-8 | Multi-persona Talk and Work consistency | OPEN | Talk answers and Work lanes not fully proven across personas | CT Talk + Work OS |
| S2-9 | Server-side title generation at creation time | OPEN | CT `human-work-title` rewrites only on the client; create path still emits vague titles | Foundation ledger create |

## Closed at presentation tier only (not backend)

- Do now / Waiting / Otzar is handling / Suggested work / Done / Meetings lanes (CT)
- Generic follow-ups moved out of active work (CT soft)
- Mark complete blocked for unclear work (CT soft)
- Python failure copy removed from card face (CT hide)
- Employee action UUIDs removed from View/Why (CT)
- Approvals without recipient or safe local body cannot be approved (CT `actionExecutability`)

## Closure rule

An obligation moves to `CLOSED` only when:

1. Server contract or durable store enforces the rule, **and**
2. Automated tests prove it, **and**
3. Live or fixture proof is recorded in `docs/testing/`.

Frontend-only filters, copy hides, and soft rebuckets stay `OPEN` or `PARTIAL`.

## Slice lineage

- Slice 1 (signal recovery): team-status answers before navigation; no false “Opened”
- Slice 2 (this ledger): My Work / Action Center presentation live; backend open
- Slice 3: Connections and OAuth clarity
- Slice 4 (next after Slice 3 gates): Memory, Conversation History, learning, portability

## Caretaker Relay

**Do not touch** Caretaker Relay while closing this ledger.

Last updated: 2026-07-29 (Slice 3 start)
