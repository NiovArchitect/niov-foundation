# Otzar Relay — Boundary & Prerequisite Matrix

## Product picture

| Layer | Role |
|-------|------|
| **Otzar** | Governed intelligence presence with the human (Today, Talk, Needs me) |
| **Otzar Relay** | Primary real-time communications channel (people, DMs, groups, AI Teammate) |
| **Foundation** | Identity, permissions, memory, evidence, truth, audit, execution authority |
| **BEAM** (future) | Presence, delivery, ordering, supervision — not a second truth system |
| **Python** | Bounded classification / ranking / ETL — not identity |

## Experience rule

Users never operate Relay as “Foundation objects.” They chat, call, and act.
Foundation receives structured communication events.

## Communication event (required dimensions)

Every Relay message must carry (or resolve to):

- organization / tenant  
- sender principal  
- represented principal (if Twin drafts)  
- recipients / participants  
- conversation / group id  
- device + session  
- channel = `RELAY`  
- timestamp + timezone  
- privacy class + retention + consent  
- AI involvement flag (human | twin_draft | twin_sent_authorized)  
- correction / supersession ids when applicable  

## First slice (live API)

| Capability | Status |
|------------|--------|
| `POST /api/v1/relay/messages` | Wave-1 (this branch) |
| `GET /api/v1/relay/threads` | Wave-1 |
| `GET /api/v1/relay/threads/:id/messages` | Wave-1 |
| Phone as credential | P1 (not first slice) |
| Multi-org switcher | P1 |
| BEAM realtime | P2 |
| Calls / video | P2 |
| Twin auto-send | Never without authority |

## Boundary

| Relay may | Relay must not |
|-----------|----------------|
| Persist human messages | Invent org truth |
| Request Twin draft | Silently send as human |
| Trigger comms extract under policy | Bypass retention |
| Show delivery state | Hold authority grants |

## P0 gaps still open

1. Global human identity vs phone credential model  
2. Portable professional core separation  
3. Dedicated Relay consent surface  
4. Cross-org group isolation tests  
5. Delivery concurrency at scale  

## Communication → execution path

```
Relay message
  → durable communication event (Foundation)
  → optional extract / ingest
  → obligations | handoffs | calendar | documents (gated)
  → provider receipt
  → Needs me / Today update
  → audit
```
