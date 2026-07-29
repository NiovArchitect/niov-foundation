// FILE: approval-quarantine.test.ts
// PURPOSE: Slice 6 — malformed approval quarantine for Needs me.

import { describe, expect, it } from "vitest";
import {
  classifyApprovalForNeedsMe,
  partitionApprovalsForNeedsMe,
} from "../../apps/api/src/services/action/approval-quarantine.js";
import type { SafeActionView } from "../../apps/api/src/services/action/views.js";

function base(over: Partial<SafeActionView> = {}): SafeActionView {
  return {
    action_id: "a1",
    status: "PROPOSED",
    action_type: "SEND_INTERNAL_NOTIFICATION",
    risk_tier: "LOW",
    requires_approval: true,
    escalation_id: "esc-1",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    target_label: "Ava Chen",
    requester_label: "Sam Lead",
    ...over,
  };
}

describe("approval-quarantine", () => {
  it("allows complete PROPOSED with recipient + escalation", () => {
    const q = classifyApprovalForNeedsMe(base());
    expect(q.active_reviewable).toBe(true);
    expect(q.class).toBe("ok");
  });

  it("quarantines missing recipient", () => {
    const q = classifyApprovalForNeedsMe(
      base({ target_label: null }),
    );
    expect(q.active_reviewable).toBe(false);
    expect(q.class).toBe("invalid");
  });

  it("quarantines missing escalation", () => {
    const q = classifyApprovalForNeedsMe(base({ escalation_id: undefined }));
    expect(q.active_reviewable).toBe(false);
  });

  it("quarantines missing requester", () => {
    const q = classifyApprovalForNeedsMe(
      base({ requester_label: null }),
    );
    expect(q.active_reviewable).toBe(false);
    expect(q.class).toBe("repairable");
  });

  it("quarantines missing action preview", () => {
    const q = classifyApprovalForNeedsMe(
      base({ action_type: "UNKNOWN" }),
    );
    expect(q.active_reviewable).toBe(false);
    expect(q.class).toBe("invalid");
  });

  it("partitions reviewable vs quarantined", () => {
    const { reviewable, quarantined } = partitionApprovalsForNeedsMe([
      base({ action_id: "ok" }),
      base({ action_id: "bad", target_label: null }),
    ]);
    expect(reviewable).toHaveLength(1);
    expect(quarantined).toHaveLength(1);
    expect(quarantined[0]?.action_id).toBe("bad");
  });
});
