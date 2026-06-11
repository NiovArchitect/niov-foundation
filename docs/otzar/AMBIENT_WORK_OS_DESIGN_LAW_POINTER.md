# Otzar Ambient Work OS Design Law — Pointer

**Status:** Founder Design Law (Phase 1251, 2026-06-11).
**Canonical document:**
`otzar-control-tower/docs/product/otzar-ambient-work-os-design-law.md`
(the design law lives beside the UI it governs; this pointer keeps
Foundation sessions aware of it).

The three product laws every Otzar-facing slice must respect:

1. **Ambient / Calm UI Law** — Otzar operates in the periphery of
   attention: border/edge/topbar/tray/voice layer; the employee's
   real work stays foreground; progressive disclosure; minimal
   attention demand; multimodal; resilient in failure. Standing
   test: if the UI feels like a crowded dashboard, keep hardening.
   Implemented in CT as the edge-presence system (presence store +
   nine states: IDLE / LISTENING / THINKING / RECOMMENDATION /
   APPROVAL_REQUIRED / SUCCESS / BLOCKED / QUIET / FAILURE — edge
   glow, orb, ambient cards, admin command layer).

2. **Shared Screen / Observe / OCR Law** — Otzar understands any
   app, workflow, or proprietary system the user already sees,
   without a per-platform integration. The boardroom use cases
   (process whisperer, cross-tool bridge, shadow coach, compliance
   guardian, performance helper, eventually do-it-for-me) stay
   governed by Foundation: consent, DMW, COSMP, policy, audit, no
   external write without approval, no unauthorized memory capture.
   Substrate: Phase 1227 Observe/OCR (samples + pasted text PROD;
   cloud OCR credential-gated).

3. **Dandelion Propagation Law** — root-first, authority-aware,
   handoff-aware propagation; never mass invites; never message
   volume over authority; multi-conversation/department reasoning;
   shadow understanding of non-activated users; confidence +
   explainability; every activation reconnects to company root,
   tenant, policies, role scope, governance.

Voice never bypasses governance: identity → DMW authority → COSMP →
policy → approval → governed Action → notification → audit.

See also: `docs/otzar/DOMAIN_GENERAL_INTELLIGENCE_DOCTRINE.md`
(ADR-0052) — the ambient law is the experience half of the same
doctrine.
