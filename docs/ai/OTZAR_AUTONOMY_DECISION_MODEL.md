# OTZAR Autonomy Decision Model

**Date:** 2026-07-28  
**Status:** Canonical decision paths A–G mapped to live substrate  
**Purpose:** Route every extracted signal / proposed action without inventing an approval occupation

## Dimensions (not one global confidence number)

| Dimension | Questions |
|-----------|-----------|
| **Confidence** | Source quality, attribution, project resolution, consistency with accepted truth, correction history |
| **Impact** | Informational → internal low → team → org-wide → external / financial / legal / access |
| **Authority** | User, AI Teammate, manager, functional approver, admin, dual-control, policy |
| **Reversibility** | Easy · reverse with notify · costly · irreversible |
| **Sensitivity** | Public · internal · confidential · restricted · personal memory · regulated |

## Paths A–G

### PATH A — Observe and organize automatically

**Use for:** source preservation, attribution, grouping, duplicate detection, project association above threshold, nonconsequential summaries, metric refresh, informational status.

**Human:** none.  
**Live:** Today signal compression, collab receipt projection, team-work samples, extract → structure (where already implemented).

### PATH B — Autonomous low-risk execution

**Use when:** explicit ActionPolicy AUTO_APPROVE + LOW risk + org `auto_approve_low_risk` + TAR authority + bounded scope + auditable.

**Human:** none each time.  
**Live:** `evaluateActionPolicy` Rung 1 refined; demo RECORD_CAPSULE LOW AUTO_APPROVE proven SUCCEEDED under `require_human_approval=true`.

### PATH C — Learned routine

**Use when:** prior approval of the *workflow pattern*, repeated success, no invalidating corrections, context match, policy still allows.

**Human:** one meaningful policy/pattern approval; not every instance.  
**Live:** forward for pattern detection; corrections + work-style candidates are partial precursors.

### PATH D — Silent draft / recommendation

**Use when:** useful prep without publish/execute (draft reply, proposed calendar change, suggested reassignment, executive brief draft).

**Human:** reviews when ready; not forced into Needs me.

### PATH E — Exception review

**Use for:** ambiguity, conflicts, low confidence, sensitive truth, owner uncertainty, material correction, medium risk, changed payload, unclear authority.

**Human:** Accept / Correct / Reject (or equivalent).  
**Product host:** Action Center / OrgTruth / transcript review — **exception queue only**.

### PATH F — Consequential approval

**Use for:** high risk, financial, impactful external comms, legal/compliance, access change, irreversible, dual-control.

**Human:** explicit approval / dual-control.  
**Live:** dual-control when second admin exists; else **honest block** (no fake approver).

### PATH G — Deny or block

**Use for:** unauthorized, cross-tenant, out of tool scope, policy forbid, untrusted source, personal-memory violation, verification impossible.

**Human:** do not ask to approve something that must be denied — explain.

## Mapping to Needs me

| Path | Appears in Needs me? |
|------|----------------------|
| A, B, C (happy path) | No |
| D | Optional “drafts when ready” — not primary Needs me |
| E | Yes — with **why you are uniquely needed** |
| F | Yes — approval / dual-control |
| G | Blocked / denied with reason — not “please approve” |

## Learning constraint

Learning may improve timing, formatting, routing, prioritization, preparation, low-risk execution **within existing policy**.  
Learning **must not** silently expand permissions, visibility, tool scopes, external rights, financial authority, dual-control, or portability.

## Cross-links

- Attention budget: `docs/product/OTZAR_HUMAN_ATTENTION_AND_AUTONOMY_MODEL.md`  
- Continuous improvement: `docs/ai/OTZAR_CONTINUOUS_IMPROVEMENT_CONTROL_LOOP.md`  
- Policy posture: `docs/security/OTZAR_ACTION_APPROVAL_POLICY_POSTURE.md`  
