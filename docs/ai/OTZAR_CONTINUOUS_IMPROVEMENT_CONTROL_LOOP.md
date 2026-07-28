# OTZAR Continuous Improvement Control Loop

**Date:** 2026-07-28  
**Status:** Doctrine + partial substrate (corrections, policies, action outcomes)

## Required loop

```
observe
→ propose a pattern
→ test within bounds
→ measure result
→ accept, refine, or reject
→ update future behavior
→ monitor for drift
→ preserve audit
```

## Inputs that improve Otzar

| Input | Use |
|-------|-----|
| Approvals | Confirm consequential path F / pattern C |
| Denials / rejects | Suppress bad proposals; do not re-ask identically |
| Corrections | Update owner resolution, role truth, summaries |
| Successful executions | Confidence in routine B/C |
| Failed executions | Tool vs reasoning failure; avoid silent retry loops |
| User edits | Preferred format / tone without expanding authority |
| Manager / org policy | Ceilings and explicit ActionPolicy |

## Examples

1. **Repeated calendar routine:** after one meaningful pattern approval → PATH B/C for matching cases; no per-instance nag.  
2. **Repeated owner correction:** update resolution heuristics; measure correction rate down.  
3. **Action failure:** distinguish connector vs policy; notify only affected people; keep failed attempt; no fake success.

## Authority expansion ban

| Allowed to learn | Forbidden to learn silently |
|------------------|------------------------------|
| Timing, formatting, routing, prioritization | Permissions, data visibility |
| Source selection, notification preference | Org access, tool scopes |
| Draft quality, low-risk execution inside policy | External comms rights, financial authority |
| Collaboration pattern *within* envelope | Dual-control / approval authority |

**Learning Authority Expansions target: 0.**

## Live substrate (today)

| Piece | State |
|-------|--------|
| Correction memory / preferences | LIVE (UI + API) |
| Action SUCCEEDED / FAILED / TIMED_OUT | LIVE + honest UI |
| Explicit ActionPolicy | LIVE |
| Pattern detector for PATH C | Forward |
| Automatic “stop asking after N approvals” | Forward (policy-backed) |

## Metrics

- intervention first run vs second run (repeatable win)  
- correction rate after autonomous action  
- exception accuracy  
- denied patterns re-prompted (should fall)  
