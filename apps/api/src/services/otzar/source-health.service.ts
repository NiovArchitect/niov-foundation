// FILE: source-health.service.ts
// PURPOSE: [SOURCE-HEALTH-SWEEP] The bounded, admin-triggered re-verification
//          pass over ALREADY-IMPORTED Google-Doc DOCUMENT_CONTEXT rows — the
//          org-autonomy-loop addendum that turns the manual, one-at-a-time
//          revalidation probe into a single capped sweep and NOTIFIES the
//          admin when a trusted source's health has actually changed. It is a
//          leaf orchestrator: it reuses revalidateImportedDocForCaller (the
//          per-doc re-fetch → hash-compare → demote → audit, SNAPSHOT-
//          PRESERVING) and the internal notification substrate — it re-checks
//          NOTHING itself and NEVER lists or syncs Drive. Bounded by design:
//          only the 50 most-recent imported rows are probed, and a transient
//          REVALIDATION_UNAVAILABLE (a network blip) is NEVER a health change —
//          it neither demotes a snapshot nor emits a notification.
// CONNECTS TO: document-context.service.ts (revalidateImportedDocForCaller +
//          RevalidateOptions), notification/notification.service.ts
//          (createInternalNotification), governance/org.js (getOrgEntityId),
//          routes/connector-data.routes.ts (POST /api/v1/drive/docs/health-sweep),
//          tests/integration/source-health-sweep.test.ts.

import { prisma } from "@niov/database";
import { getOrgEntityId } from "../governance/org.js";
import { makeNotificationService } from "../notification/notification.service.js";
import {
  revalidateImportedDocForCaller,
  type RevalidateOptions,
} from "./document-context.service.js";
import type { SourceIntegrityState } from "./source-integrity.js";

// The bounded cap: a sweep re-checks at most this many of the org's most-recent
// imported rows. This is a re-verification pass, NOT a crawler — it never lists
// or syncs Drive; it only re-probes rows that were ALREADY imported.
export const SOURCE_HEALTH_SWEEP_MAX = 50;

// The notification_class stamped on every source-health alert. An open String
// on the Notification model — NO schema migration.
export const SOURCE_HEALTH_NOTIFICATION_CLASS = "SOURCE_HEALTH_CHANGED";

export interface SourceHealthSweepSummary {
  /** Rows probed (bounded by SOURCE_HEALTH_SWEEP_MAX). */
  checked: number;
  /** Still AVAILABLE (unchanged upstream). */
  verified: number;
  /** Demoted: upstream content diverged from the trusted snapshot. */
  changed_upstream: number;
  /** Demoted: access to the upstream was revoked (401/403 re-consent). */
  access_revoked: number;
  /** Demoted: the upstream file was deleted. */
  source_deleted: number;
  /** Demoted: the upstream turned empty / binary / unreadable. */
  corrupt: number;
  /** Transient — the source could not be reached; NO demotion, NO notification. */
  unavailable: number;
  /** Admin notifications successfully emitted (one per demoted doc). */
  notified: number;
}

export type SourceHealthSweepResult =
  | { ok: true; summary: SourceHealthSweepSummary }
  | { ok: false; code: "NO_ORG_FOR_CALLER"; message: string };

// The demoted states that warrant ONE calm admin notification. AVAILABLE is
// silence (no noise), and a transient REVALIDATION_UNAVAILABLE never reaches
// this map — a network blip is not a health change.
const NOTIFY_LINE: Record<
  "CHANGED_UPSTREAM" | "ACCESS_REVOKED" | "SOURCE_DELETED" | "CORRUPT_OR_INVALID",
  (title: string) => string
> = {
  CHANGED_UPSTREAM: (title) =>
    `A knowledge source needs attention: "${title}" changed upstream since its last verified import.`,
  ACCESS_REVOKED: (title) =>
    `A knowledge source needs attention: "${title}" — access was revoked upstream.`,
  SOURCE_DELETED: (title) =>
    `A knowledge source needs attention: "${title}" — was deleted upstream.`,
  CORRUPT_OR_INVALID: (title) =>
    `A knowledge source needs attention: "${title}" — its upstream content is no longer readable.`,
};

// WHAT: Re-verify the org's most-recent ALREADY-IMPORTED Google-Doc
//        DOCUMENT_CONTEXT rows against upstream and notify the triggering admin
//        for each source whose health CHANGED (demoted).
// INPUT: the admin caller + an optional injectable fetch seam (tests drive the
//        changed / deleted / revoked branches WITHOUT any real network).
// OUTPUT: { ok:true, summary } with per-outcome tallies, or an honest
//        NO_ORG_FOR_CALLER failure.
// WHY: A trusted snapshot rots silently when its upstream drifts, loses access,
//      is deleted, or turns corrupt. This bounded sweep surfaces that decay to
//      the admin proactively — reusing the manual probe's exact SNAPSHOT-
//      PRESERVING demotion + audit, adding only a best-effort notification.
//      REVALIDATION_UNAVAILABLE (transient/infra) is deliberately NOT a health
//      failure: it neither demotes a good snapshot nor emits noise.
export async function sourceHealthSweepForCaller(
  callerEntityId: string,
  opts?: RevalidateOptions,
  // [INBOUND-RECHECK] notifyMode "always" (default) preserves the admin-triggered
  // route: every demoted source emits one calm notification. "on_transition" (used
  // by the scheduled per-org recheck) notifies ONLY when the state actually changed
  // vs its prior stored state — so a source that stays CHANGED/DELETED/REVOKED
  // across daily runs is not re-notified every day. Same-state repeats stay quiet;
  // an escalation (CHANGED→DELETED) is a transition and DOES notify.
  sweepOpts?: { notifyMode?: "always" | "on_transition" },
): Promise<SourceHealthSweepResult> {
  let orgEntityId: string;
  try {
    orgEntityId = await getOrgEntityId(callerEntityId);
  } catch {
    return { ok: false, code: "NO_ORG_FOR_CALLER", message: "No organization found for the caller." };
  }

  // BOUNDED selection: the org's most-recent DOCUMENT_CONTEXT rows that are
  // (a) not CANCELLED (withdrawn rows are settled history) and (b) carry an
  // external_source.file_id (a Google import — manual seeds have none). The
  // string_starts_with:"" filter matches any row where file_id is a present
  // string. Capped at SOURCE_HEALTH_SWEEP_MAX — this NEVER lists or syncs Drive.
  const rows = await prisma.workLedgerEntry.findMany({
    where: {
      org_entity_id: orgEntityId,
      ledger_type: "DOCUMENT_CONTEXT",
      status: { not: "CANCELLED" },
      details: { path: ["document", "external_source", "file_id"], string_starts_with: "" },
    },
    orderBy: { created_at: "desc" },
    take: SOURCE_HEALTH_SWEEP_MAX,
    select: { ledger_entry_id: true, title: true, details: true },
  });

  const notificationService = makeNotificationService();
  const summary: SourceHealthSweepSummary = {
    checked: 0,
    verified: 0,
    changed_upstream: 0,
    access_revoked: 0,
    source_deleted: 0,
    corrupt: 0,
    unavailable: 0,
    notified: 0,
  };

  for (const row of rows) {
    summary.checked += 1;
    // Reuse the manual probe verbatim (pass the injected fetch straight through
    // so tests inject upstream responses — NO real network).
    const result = await revalidateImportedDocForCaller(callerEntityId, row.ledger_entry_id, opts);

    if (result.ok === false) {
      // REVALIDATION_UNAVAILABLE (and any other honest non-demotion failure) is
      // NOT a health change: no demotion happened, so no notification and no
      // health-failure tally beyond "couldn't verify this pass".
      summary.unavailable += 1;
      continue;
    }

    const state: SourceIntegrityState = result.state;
    if (state === "AVAILABLE" || state === "SNAPSHOTTED") {
      summary.verified += 1;
      continue; // healthy — deliberately no notification (no noise)
    }

    // Demoted — tally the specific outcome, then emit ONE calm notification.
    let line: string | null = null;
    switch (state) {
      case "CHANGED_UPSTREAM":
        summary.changed_upstream += 1;
        line = NOTIFY_LINE.CHANGED_UPSTREAM(row.title);
        break;
      case "ACCESS_REVOKED":
        summary.access_revoked += 1;
        line = NOTIFY_LINE.ACCESS_REVOKED(row.title);
        break;
      case "SOURCE_DELETED":
        summary.source_deleted += 1;
        line = NOTIFY_LINE.SOURCE_DELETED(row.title);
        break;
      case "CORRUPT_OR_INVALID":
        summary.corrupt += 1;
        line = NOTIFY_LINE.CORRUPT_OR_INVALID(row.title);
        break;
      case "UNREADABLE":
        // Reserved demoted state not produced by revalidation today; treat as
        // corrupt for the tally + reuse the readability line.
        summary.corrupt += 1;
        line = NOTIFY_LINE.CORRUPT_OR_INVALID(row.title);
        break;
    }
    if (line === null) continue;

    // [INBOUND-RECHECK] Noise gate: on the scheduled recheck, notify ONLY on a
    // real state transition (result.transitioned) so a persistently-demoted
    // source isn't re-notified every run. The manual sweep ("always") notifies
    // on every demoted result as before.
    const notifyMode = sweepOpts?.notifyMode ?? "always";
    if (notifyMode === "on_transition" && result.transitioned !== true) {
      continue;
    }

    // Best-effort: a notification failure must never abort the sweep or roll
    // back the demotion the probe already committed.
    try {
      const created = await notificationService.createInternalNotification({
        org_entity_id: orgEntityId,
        recipient_entity_id: callerEntityId,
        source_entity_id: callerEntityId,
        notification_class: SOURCE_HEALTH_NOTIFICATION_CLASS,
        body_summary: line,
        action_id: null,
      });
      if (created.ok === true) summary.notified += 1;
    } catch {
      // swallow-and-continue — the health change is already recorded + audited
    }
  }

  return { ok: true, summary };
}
