// FILE: working-set-views.ts
// PURPOSE: Foundation-owned canonical projections of a governed working set
//          into an ADMIN/machine view and a CONSUMER/experience view
//          (ADR-0048 Phase 3 Sub-Arc 3; PERS.5a per Q-PERS.5-γ γ-1). This
//          operationalizes the PERS.4 audience-tier doctrine into one
//          testable place: the admin view carries the full machine truth
//          (the degraded contract, stats, audit_intent, consumer
//          obligations); the consumer view is a graceful subset that strips
//          every raw Foundation diagnostic and exposes only coarse,
//          actionable uncertainty flags. Apps still compose the final UX on
//          top of the consumer view ("apps compose UX").
//
//          Q-PERS.5a locks:
//            - γ-1: Foundation owns this canonical projection (one place,
//              not re-invented per app).
//            - the consumer view is a STRICT subset — it never adds data
//              beyond what the admin/source working set already contains.
//
// CONNECTS TO:
//   - apps/api/src/services/personalization/working-set.service.ts
//     (WorkingSetSuccess — the source this projects)
//   - apps/api/src/services/personalization/degraded-mode-contract.ts
//     (the DegradedContractEntry dispositions the consumer flags derive from)
//   - apps/api/src/services/personalization/permission-envelope.service.ts
//     (ContextDomain)
//   - apps/api/src/services/coe/coe.service.ts (ContextItem — user-facing
//     governed content carried through to the consumer view)
//   - docs/architecture/decisions/0048-personalization-orchestration-substrate.md
//     (§Audience & Disclosure Tiers; Q-PERS.5-γ)
//
// Pure deterministic TypeScript: no I/O, no DB, no audit literal, no route.

import type { WorkingSetSuccess } from "./working-set.service.js";
import type { ContextDomain } from "./permission-envelope.service.js";
import type { ContextItem } from "../coe/coe.service.js";

// WHAT: The admin / Foundation / machine view — the full governed working
//        set with an explicit view tag.
// INPUT: Used as a return type only.
// OUTPUT: None — a type.
// WHY: Agents, Foundation services, and administrators receive the complete
//      machine truth (degraded contract, stats, audit_intent, obligations).
export type AdminWorkingSetView = { view: "admin" } & Omit<
  WorkingSetSuccess,
  "ok"
>;

// WHAT: The consumer / experience view — a graceful subset safe to surface
//        toward an end user, carrying governed content plus coarse
//        uncertainty affordances and NO raw Foundation diagnostics.
// INPUT: Used as a return type only.
// OUTPUT: None — a type.
// WHY: Q-PERS.5-γ + PERS.4 audience doctrine — consumers must not see raw
//      degraded reasons, dispositions, advisories, stats, audit_intent, the
//      permission summary, or moment-field internals; they receive only the
//      governed capsules + coarse flags that improve trust/actionability.
export interface ConsumerWorkingSetView {
  readonly view: "consumer";
  readonly domain: ContextDomain;
  readonly current_time_iso: string;
  readonly timezone_uncertain: boolean;
  readonly capsules: readonly ContextItem[];
  readonly has_uncertainty: boolean;
  readonly has_withheld_context: boolean;
  readonly may_request_permission: boolean;
}

// WHAT: Project a successful working set into the admin/machine view.
// INPUT: A WorkingSetSuccess.
// OUTPUT: An AdminWorkingSetView (full machine truth + view tag).
// WHY: Spreads every working-set field except `ok` so the admin view never
//      drifts from WorkingSetSuccess as it evolves.
export function projectAdminView(ws: WorkingSetSuccess): AdminWorkingSetView {
  const { ok: _ok, ...rest } = ws;
  void _ok;
  return { view: "admin", ...rest };
}

// WHAT: Project a successful working set into the consumer/experience view.
// INPUT: A WorkingSetSuccess.
// OUTPUT: A ConsumerWorkingSetView — governed capsules + coarse uncertainty
//         flags, with all raw diagnostics stripped.
// WHY: Q-PERS.5-γ — an explicit allow-list (deny-by-default): only the named
//      graceful fields pass; the booleans are DERIVED from the degraded
//      contract's dispositions (never the raw reasons/advisories).
export function projectConsumerView(
  ws: WorkingSetSuccess,
): ConsumerWorkingSetView {
  const hasUncertainty = ws.degraded.some(
    (d) =>
      d.disposition === "low_confidence" ||
      d.disposition === "fallback_not_truth",
  );
  const hasWithheld = ws.degraded.some((d) => d.disposition === "withheld");
  const mayRequestPermission = ws.degraded.some(
    (d) => d.may_request_permission,
  );

  return {
    view: "consumer",
    domain: ws.domain,
    current_time_iso: ws.moment.current_time_iso,
    timezone_uncertain:
      ws.moment.timezone.fallback || ws.moment.timezone.uncertain,
    capsules: ws.capsules,
    has_uncertainty: hasUncertainty,
    has_withheld_context: hasWithheld,
    may_request_permission: mayRequestPermission,
  };
}
