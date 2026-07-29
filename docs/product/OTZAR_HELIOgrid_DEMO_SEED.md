# Otzar demo seed — fictional industrial-energy review

**Label:** Fictional startup for YC product demo. Not a real Y Combinator applicant.  
**Product name:** HelioGrid (fictional)  
**Problem:** Industrial computing workloads run when grid power is expensive and constrained.  
**Product:** Software schedules flexible workloads around energy cost and grid conditions.  
**Current review:** Strong technical promise, incomplete security readiness, customer evidence still needing verification.

## Personas (fictional)

| Role | Name | Responsibility |
| --- | --- | --- |
| Organization lead | Morgan Hale | Final judgment, executive report |
| Application review lead | Ava Chen | Review process, interview after conditions |
| Technical diligence lead | Jordan Reyes | Architecture evidence |
| Security lead | Casey Brooks | Security checklist / gate |
| Market lead | Riley Okonkwo | Customer evidence |
| Reviewer | Sam Patel | Normal employee experience |
| Contractor | Quinn Marsh | Bounded research |
| Vendor | NovaGuard Contact | Security dependency |
| Customer / design partner | Northline Ops | Reference urgency |

## Transcript set (5)

Canonical files under `docs/product/demo-transcripts/`:

1. `heliogrid-t1-initial-review.md` — product, founders, questions, owners  
2. `heliogrid-t2-tech-security.md` — checklist, deadline, risk  
3. `heliogrid-t3-market-customer.md` — urgency, correction  
4. `heliogrid-t4-convergence.md` — recommendation, conditions, one human decision  
5. `heliogrid-t5-post-decision-ops.md` — scheduling, report, remaining work  

## Server contract

Active work must pass `enforceWorkContract` (no generic “Follow up with X” as active).  
Routine ambiguities use `autoClarifyRoutineAmbiguity` **only when the title is vague** (never rewrite specific work/document titles).  
Malformed approvals fail `classifyApprovalForNeedsMe` (missing recipient, requester, escalation, or action preview).

## Reset (local only)

```bash
set -a; . ./.env.demo.local; set +a
npx tsx scripts/heliogrid-demo-reset-seed.ts --reset   # DEMO RESET RUN 1
npx tsx scripts/heliogrid-demo-reset-seed.ts --reset   # DEMO RESET RUN 2 — expect duplicate_active: 0
```

Script refuses non-localhost `DATABASE_URL`. Production NIOV Labs demo uses gated provision scripts separately; do not layer smoke-test noise on the live demo tenant without quarantine.
