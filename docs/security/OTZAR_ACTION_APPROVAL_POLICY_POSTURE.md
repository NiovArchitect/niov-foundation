# OTZAR Action Approval Policy Posture

**Date:** 2026-07-27  
**Org:** NIOV Labs demo (`a4ddc200-…`)

## Change under review

| Setting | Before (approx) | After (demo loop) |
|---------|-----------------|-------------------|
| `require_human_approval` | `true` | `false` |
| `auto_approve_low_risk` | `false` | `true` |
| ActionPolicy RECORD_CAPSULE LOW | none | AUTO_APPROVE |
| ActionPolicy SEND_INTERNAL_NOTIFICATION LOW | none | AUTO_APPROVE |

## Why the change was made

With `require_human_approval=true`, the evaluator **Rung 1** forces every action to `REQUIRE_DUAL_CONTROL` **before** ActionPolicy AUTO_APPROVE is considered. Demo org has only one `can_admin_org` principal → dual-control target resolution fails with `DUAL_CONTROL_NO_APPROVER_AVAILABLE`.

## Required production semantics

- **High-risk:** human approval / dual control when policy requires; never global bypass.
- **Low-risk AUTO_APPROVE:** only when **explicit ActionPolicy** + org settings + actor TAR allow; audited.
- **Do not** use a global flag as a silent bypass of all human approval forever without review.

## Recommended steady state for demo org

1. Keep **explicit ActionPolicy AUTO_APPROVE** for bounded low-risk types used in demos.
2. Prefer fixing policy precedence so ActionPolicy AUTO_APPROVE can apply under APPROVAL_REQUIRED without disabling org-wide `require_human_approval` for all classes — **forward repair** if Founder wants HITL default restored globally.
3. Until a second dual-control admin exists: dual-control actions should **block with explanation**, not invent approvers.

## Second approver

No synthetic second admin created. High-risk dual-control remains blocked without a legitimate second human with `can_admin_org`.
