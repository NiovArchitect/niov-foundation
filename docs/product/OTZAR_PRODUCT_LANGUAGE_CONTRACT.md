# OTZAR Product Language Contract

**Status:** FROZEN for RC2 Signal Freeze  
**Date:** 2026-07-27

## Customer-facing (required)

| Use | Never in ordinary UI |
|-----|----------------------|
| People / Members | Entity |
| AI Teammate | Twin (data-model only in code/comments) |
| Knowledge items | Capsule |
| Access / permissions (plain) | Permission internals, bridge IDs |
| Needs me / Action Center | Dual-control engineering labels |
| Connections / Tools | MCP primary copy |
| Organization setup / Otzar found | "Run Dandelion" as primary CTA |
| Continue walkthrough / Skip for now / Restart walkthrough | "Dismiss forever" without restart |

## Status vocabulary (ship claims)

coded → tested → PR → merged → deployed → live bundle verified → LIVE_ROUTE_VERIFIED → FOUNDER_VISIBLE  
Never claim FOUNDER_EXPERIENCE_APPROVED without founder.

## Connection honesty

- Connected and syncing  
- Needs attention / reconnect  
- App review pending  
- Externally blocked (e.g. Meet reauth)  
Never: "Connected" without verified live status.

## Em dashes

Prefer plain hyphens or rewrite sentences. Unit tests reject `—` / `–` in walkthrough copy.
