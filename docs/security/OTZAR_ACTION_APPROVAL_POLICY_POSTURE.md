# OTZAR Action Approval Policy Posture

**Date:** 2026-07-27  
**Org:** NIOV Labs demo (`a4ddc200-…`)  
**Status:** PREFERENCE REFINED — Rung 1 no longer globally short-circuits explicit LOW AUTO_APPROVE

## Problem observed (demo loop)

| Setting | Demo loop (temporary) | Preferred steady state |
|---------|----------------------|------------------------|
| `require_human_approval` | `false` | **`true`** (HITL default) |
| `auto_approve_low_risk` | `true` | **`true`** only with explicit ActionPolicy |
| ActionPolicy RECORD_CAPSULE LOW | AUTO_APPROVE | AUTO_APPROVE (explicit) |
| ActionPolicy SEND_INTERNAL_NOTIFICATION LOW | AUTO_APPROVE | AUTO_APPROVE (explicit) |

With **old** Rung 1 semantics, `require_human_approval=true` forced **every** action to `REQUIRE_DUAL_CONTROL` **before** ActionPolicy AUTO_APPROVE was considered. Demo org has only one `can_admin_org` principal → dual-control target resolution fails with `DUAL_CONTROL_NO_APPROVER_AVAILABLE`. Operators therefore flipped the global flag to prove low-risk execution — correct for a demo spike, wrong as a product default.

## Code fix (this arc)

`evaluateActionPolicy` Rung 1 refined in `apps/api/src/services/action/policy-evaluator.ts`:

- **`require_human_approval=true`** remains the organization default for human approval.
- **Exception (bounded only):** when **all** of the following hold, Rung 1 does **not** short-circuit:
  - `risk_tier === LOW`
  - matching ActionPolicy `default_decision === AUTO_APPROVE`
  - `org_auto_approve_low_risk === true`
- Later rungs still apply (APPROVAL_REQUIRED explicit AUTO_APPROVE path, EXECUTIVE_OVERRIDE + Rung 6, CRITICAL floor, FORBIDDEN, OBSERVE_ONLY).
- **MEDIUM / HIGH / CRITICAL** never auto-approve via the Rung 1 exception.
- **HIGH** still dual-control when configured; if no legitimate second approver → block with explanation (no fake admin, no title-based escalations).

Unit coverage: `tests/unit/action-policy-evaluator.test.ts` (LOW+policy under HITL → AUTO_APPROVE; LOW without policy → dual-control; MEDIUM under HITL → dual-control; HIGH under HITL → dual-control).

## Required production semantics (matrix)

| Scenario | Expected |
|----------|----------|
| LOW + explicit ActionPolicy AUTO_APPROVE + org_auto_approve_low_risk | AUTO_APPROVE |
| LOW without matching policy | REQUIRE_DUAL_CONTROL / approval (or fail-closed) |
| MEDIUM | Human approval (dual-control path as configured) |
| HIGH | Dual control if second approver exists; else **honestly blocked** |
| Unauthorized actor | DENIED |
| Title without authority | DENIED |
| Payload change after approval | Re-approval required (existing lifecycle) |
| Global require_human_approval | Does **not** silently bypass ActionPolicy forever |

## Demo org restore steps (after deploy of this fix)

1. Deploy Foundation build containing the Rung 1 refinement.
2. Set `require_human_approval=true` on OrgSettings (restore HITL default).
3. Keep `auto_approve_low_risk=true` **only if** explicit LOW ActionPolicy rows remain for demo-safe types.
4. Keep ActionPolicy AUTO_APPROVE for RECORD_CAPSULE LOW + SEND_INTERNAL_NOTIFICATION LOW (or document removal).
5. Do **not** invent a second dual-control admin. High-risk dual-control stays blocked until a real second `can_admin_org` human exists; UI must explain setup requirement.

## Second approver

No synthetic second admin. High-risk dual-control remains blocked without a legitimate second human with `can_admin_org`.

## Founder claims

Do **not** claim governance fully restored in production until:

1. This code is merged + deployed.
2. Demo org flags are restored as above.
3. Live matrix evidence is re-run (`docs/testing/OTZAR_ACTION_POLICY_MATRIX_RESULTS.json` when produced).
