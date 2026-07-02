// FILE: tests/unit/follow-up-recipient-review.test.ts
// PURPOSE: [PROD-UX-BUGC] Lock the outside-context recipient-review completion
//          on durable FOLLOW_UP rows. Proves the governance rule exactly:
//          confirm unlocks out_of_scope + likely (caller vouches — proof source
//          becomes caller_confirmed, never an Otzar-verified path); select
//          resolves ambiguous (target updated durably); unauthorized and
//          cross_team_needs_approval are NEVER caller-overridable; wrong owner /
//          missing payload / done rows are rejected; the decision persists on
//          the row with an audit pointer. prisma + writeAuditEvent are mocked.
// CONNECTS TO: apps/api/src/services/work-os/comms-artifacts.service.ts
//              (resolveFollowUpRecipient), recipient-governance.ts
//              (EvidenceSource "caller_confirmed").

import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, writeAuditEventMock } = vi.hoisted(() => ({
  prismaMock: {
    workLedgerEntry: { findFirst: vi.fn(), update: vi.fn() },
    entityMembership: { findFirst: vi.fn() },
    entity: { findFirst: vi.fn() },
  },
  writeAuditEventMock: vi.fn(),
}));

vi.mock("@niov/database", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, prisma: prismaMock, writeAuditEvent: writeAuditEventMock };
});

import { resolveFollowUpRecipient } from "../../apps/api/src/services/work-os/comms-artifacts.service.js";
import type { RecipientSafety } from "../../apps/api/src/services/otzar/recipient-governance.js";

const ORG = "11111111-1111-4111-8111-111111111111";
const CALLER = "22222222-2222-4222-8222-222222222222";
const TARGET = "33333333-3333-4333-8333-333333333333";
const OTHER = "44444444-4444-4444-8444-444444444444";
const LEDGER = "55555555-5555-4555-8555-555555555555";

function governance(safety: RecipientSafety, over: Record<string, unknown> = {}) {
  return {
    entity_id: TARGET,
    display_name: "Shiney Thomas",
    email: "shiney@niov.test",
    role: null,
    participantStatus: "unknown",
    mentionStatus: "explicitly_mentioned",
    workConnectionType: "none",
    evidence: { quote: null, source: "fuzzy_only", matchedToken: "shiney", alternativeCandidates: [] },
    roleMatch: "unknown",
    hierarchyConnection: "unknown",
    projectConnection: "unknown",
    policyStatus: "allowed",
    sensitivity: "internal",
    confidence: "low",
    recipientSafety: safety,
    autonomyEligibility: "blocked",
    ...over,
  };
}

function followUpAction(safety: RecipientSafety, over: Record<string, unknown> = {}) {
  return {
    local_id: "fu-1",
    action_type: "SEND_INTERNAL_NOTIFICATION",
    target: { entity_id: TARGET, display_name: "Shiney Thomas", email: "shiney@niov.test" },
    draft_text: "Shiney — please confirm the integration timeline.",
    reason: "Named in the conversation.",
    source_excerpt: "follow up with Shiney about the integration",
    confidence: "MEDIUM",
    resolution_status: "RESOLVED",
    recipient_governance: governance(safety),
    autonomy: { bucket: "NEEDS_REVIEW" },
    ...over,
  };
}

function row(safety: RecipientSafety, over: Record<string, unknown> = {}) {
  const now = new Date("2026-07-02T12:00:00.000Z");
  return {
    ledger_entry_id: LEDGER,
    org_entity_id: ORG,
    ledger_type: "FOLLOW_UP",
    source_type: "TRANSCRIPT",
    conversation_id: "cap-1",
    owner_entity_id: CALLER,
    requester_entity_id: CALLER,
    target_entity_id: TARGET,
    title: "Follow-up to Shiney Thomas",
    summary: "Shiney — please confirm the integration timeline.",
    status: "DRAFT",
    details: { source: "conversation", follow_up: followUpAction(safety) },
    next_action: "Review and send this follow-up.",
    created_at: now,
    updated_at: now,
    ...over,
  };
}

beforeEach(() => {
  prismaMock.workLedgerEntry.findFirst.mockReset();
  prismaMock.workLedgerEntry.update.mockReset();
  prismaMock.entityMembership.findFirst.mockReset();
  prismaMock.entity.findFirst.mockReset();
  writeAuditEventMock.mockReset();
  writeAuditEventMock.mockResolvedValue({ audit_id: "audit-1" });
  // update echoes back the row it was given (merged), like prisma does.
  prismaMock.workLedgerEntry.update.mockImplementation(
    async (args: { where: { ledger_entry_id: string }; data: Record<string, unknown> }) => ({
      ...row("confirmed"),
      ...args.data,
    }),
  );
});

async function resolve(
  decision: "confirm" | "select",
  recipientEntityId?: string,
) {
  return resolveFollowUpRecipient({
    org_entity_id: ORG,
    caller_entity_id: CALLER,
    ledger_entry_id: LEDGER,
    decision,
    ...(recipientEntityId !== undefined ? { recipient_entity_id: recipientEntityId } : {}),
  });
}

describe("resolveFollowUpRecipient — confirm (caller vouches on a knowledge gap)", () => {
  it("confirm unlocks out_of_scope: governance -> confirmed, proof source caller_confirmed, target preserved", async () => {
    prismaMock.workLedgerEntry.findFirst.mockResolvedValue(row("out_of_scope"));
    const r = await resolve("confirm");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const g = r.follow_up.action.recipient_governance;
    expect(g.recipientSafety).toBe("confirmed");
    expect(g.evidence.source).toBe("caller_confirmed"); // a distinct human proof source
    expect(g.autonomyEligibility).toBe("draft_only"); // vouching never earns auto-eligibility
    expect(r.follow_up.action.target.entity_id).toBe(TARGET); // target untouched
    expect(r.follow_up.action.resolution_status).toBe("RESOLVED");
  });

  it("confirm unlocks likely (judgment call) the same way", async () => {
    prismaMock.workLedgerEntry.findFirst.mockResolvedValue(row("likely"));
    const r = await resolve("confirm");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.follow_up.action.recipient_governance.recipientSafety).toBe("confirmed");
    expect(r.follow_up.action.recipient_governance.evidence.source).toBe("caller_confirmed");
  });

  it("the decision PERSISTS on the row: update carries the mutated payload + the audit pointer", async () => {
    prismaMock.workLedgerEntry.findFirst.mockResolvedValue(row("out_of_scope"));
    const r = await resolve("confirm");
    expect(r.ok).toBe(true);
    const updateArg = prismaMock.workLedgerEntry.update.mock.calls[0]![0];
    expect(updateArg.where.ledger_entry_id).toBe(LEDGER);
    const persisted = updateArg.data.details.follow_up;
    expect(persisted.recipient_governance.recipientSafety).toBe("confirmed");
    expect(persisted.recipient_governance.evidence.source).toBe("caller_confirmed");
    expect(updateArg.data.audit_event_id).toBe("audit-1"); // proof pointer on the row
  });

  it("an audit event records the decision (ADMIN_ACTION / FOLLOW_UP_RECIPIENT_RESOLVED, actor = caller)", async () => {
    prismaMock.workLedgerEntry.findFirst.mockResolvedValue(row("likely"));
    const r = await resolve("confirm");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.audit_event_id).toBe("audit-1");
    const audit = writeAuditEventMock.mock.calls[0]![0];
    expect(audit.event_type).toBe("ADMIN_ACTION");
    expect(audit.actor_entity_id).toBe(CALLER);
    expect(audit.target_entity_id).toBe(TARGET);
    expect(audit.details.action).toBe("FOLLOW_UP_RECIPIENT_RESOLVED");
    expect(audit.details.decision).toBe("confirm");
    expect(audit.details.previous_safety).toBe("likely");
  });

  it("confirm on an AMBIGUOUS name is refused — the ambiguity must be resolved by choosing", async () => {
    prismaMock.workLedgerEntry.findFirst.mockResolvedValue(row("ambiguous"));
    const r = await resolve("confirm");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("INVALID_REQUEST");
    expect(r.message).toMatch(/choose/i);
  });

  it("confirm with no resolved person is refused (nothing to vouch for)", async () => {
    prismaMock.workLedgerEntry.findFirst.mockResolvedValue(
      row("out_of_scope", {
        details: {
          follow_up: followUpAction("out_of_scope", {
            target: { entity_id: null, display_name: "Shiney", email: null },
          }),
        },
      }),
    );
    const r = await resolve("confirm");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("INVALID_REQUEST");
  });
});

describe("resolveFollowUpRecipient — select (resolve an ambiguous name)", () => {
  it("select resolves ambiguous: target + payload + governance all move to the chosen org member", async () => {
    prismaMock.workLedgerEntry.findFirst.mockResolvedValue(row("ambiguous"));
    prismaMock.entityMembership.findFirst.mockResolvedValue({ membership_id: "m-1" });
    prismaMock.entity.findFirst.mockResolvedValue({
      entity_id: OTHER,
      display_name: "Shaini Verma",
      email: "shaini@niov.test",
    });
    const r = await resolve("select", OTHER);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.follow_up.action.target.entity_id).toBe(OTHER);
    expect(r.follow_up.action.target.display_name).toBe("Shaini Verma");
    const g = r.follow_up.action.recipient_governance;
    expect(g.recipientSafety).toBe("confirmed");
    expect(g.entity_id).toBe(OTHER);
    expect(g.evidence.source).toBe("caller_confirmed");
    // The row's own target column moves too (My Work / scoping stay coherent).
    const updateArg = prismaMock.workLedgerEntry.update.mock.calls[0]![0];
    expect(updateArg.data.target_entity_id).toBe(OTHER);
  });

  it("select requires a recipient_entity_id", async () => {
    prismaMock.workLedgerEntry.findFirst.mockResolvedValue(row("ambiguous"));
    const r = await resolve("select");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("INVALID_REQUEST");
  });

  it("select rejects a person who is NOT an active member of the org (no cross-org injection)", async () => {
    prismaMock.workLedgerEntry.findFirst.mockResolvedValue(row("ambiguous"));
    prismaMock.entityMembership.findFirst.mockResolvedValue(null);
    const r = await resolve("select", OTHER);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("INVALID_REQUEST");
    expect(r.message).toMatch(/isn't an active member/i);
    expect(prismaMock.workLedgerEntry.update).not.toHaveBeenCalled();
  });

  it("select on a NON-ambiguous verdict is refused (confirm is the right verb)", async () => {
    prismaMock.workLedgerEntry.findFirst.mockResolvedValue(row("likely"));
    const r = await resolve("select", OTHER);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("INVALID_REQUEST");
  });
});

describe("resolveFollowUpRecipient — boundaries the caller can NEVER override", () => {
  it("unauthorized (policy denies) rejects with human copy; nothing is written", async () => {
    prismaMock.workLedgerEntry.findFirst.mockResolvedValue(row("unauthorized"));
    const r = await resolve("confirm");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("POLICY_DENIES");
    expect(r.message).toMatch(/policy/i);
    expect(r.message).not.toMatch(/POLICY_DENIES/); // human copy, not a raw code
    expect(prismaMock.workLedgerEntry.update).not.toHaveBeenCalled();
    expect(writeAuditEventMock).not.toHaveBeenCalled();
  });

  it("cross_team_needs_approval rejects with the approval-boundary copy; nothing is written", async () => {
    prismaMock.workLedgerEntry.findFirst.mockResolvedValue(row("cross_team_needs_approval"));
    const r = await resolve("confirm");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("APPROVAL_REQUIRED");
    expect(r.message).toMatch(/approver/i);
    expect(prismaMock.workLedgerEntry.update).not.toHaveBeenCalled();
  });
});

describe("resolveFollowUpRecipient — ownership, payload, lifecycle guards", () => {
  it("a caller who does not OWN the row is refused (FORBIDDEN)", async () => {
    prismaMock.workLedgerEntry.findFirst.mockResolvedValue(row("out_of_scope", { owner_entity_id: OTHER }));
    const r = await resolve("confirm");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("FORBIDDEN");
  });

  it("a missing row (or another org's row — scoped in the query) is NOT_FOUND", async () => {
    prismaMock.workLedgerEntry.findFirst.mockResolvedValue(null);
    const r = await resolve("confirm");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("NOT_FOUND");
    // Tenant isolation is in the query itself, not post-filtering.
    const where = prismaMock.workLedgerEntry.findFirst.mock.calls[0]![0].where;
    expect(where.org_entity_id).toBe(ORG);
    expect(where.ledger_type).toBe("FOLLOW_UP");
  });

  it("a payload-less row is refused (MISSING_PAYLOAD) — never fabricates a review", async () => {
    prismaMock.workLedgerEntry.findFirst.mockResolvedValue(row("out_of_scope", { details: { source: "conversation" } }));
    const r = await resolve("confirm");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("MISSING_PAYLOAD");
  });

  it("a done/dismissed row is refused (no review after send/cancel)", async () => {
    prismaMock.workLedgerEntry.findFirst.mockResolvedValue(row("out_of_scope", { status: "CANCELLED" }));
    const r = await resolve("confirm");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("INVALID_REQUEST");
    expect(r.message).toMatch(/already sent or dismissed/i);
  });

  it("an already-confirmed recipient is refused (nothing to review)", async () => {
    prismaMock.workLedgerEntry.findFirst.mockResolvedValue(row("confirmed"));
    const r = await resolve("confirm");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("ALREADY_CONFIRMED");
  });
});
