// FILE: beam-collaboration-supervisor.test.ts (unit)
// PURPOSE: Phase 6 — unit coverage for the BEAM Collaboration Handoff
//          Supervisor wrapper. Mocked prisma + injected runtime
//          config so the BEAM provider can be exercised without a
//          live Erlang node.
// CONNECTS TO: apps/api/src/services/coordination/beam-collaboration-supervisor.service.ts

import { describe, expect, it, beforeEach, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    twinCollaborationRequest: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@niov/database", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    prisma: prismaMock,
  };
});

import {
  deriveNextTickForState,
  getCollaborationSupervisedStatus,
  validateBeamResponse,
} from "../../apps/api/src/services/coordination/beam-collaboration-supervisor.service.js";

const COLLAB_ID = "ffffffff-ffff-ffff-ffff-ffffffffffff";

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.twinCollaborationRequest.findUnique.mockReset();
});

describe("deriveNextTickForState", () => {
  it("returns AWAIT_TARGET_ACCEPT for REQUESTED", () => {
    expect(deriveNextTickForState("REQUESTED", false)).toBe(
      "AWAIT_TARGET_ACCEPT",
    );
  });
  it("returns AWAIT_APPROVAL for NEEDS_APPROVAL", () => {
    expect(deriveNextTickForState("NEEDS_APPROVAL", false)).toBe(
      "AWAIT_APPROVAL",
    );
  });
  it("returns TERMINAL_NO_ACTION for terminal states", () => {
    expect(deriveNextTickForState("COMPLETED", false)).toBe("TERMINAL_NO_ACTION");
    expect(deriveNextTickForState("REJECTED", false)).toBe("TERMINAL_NO_ACTION");
    expect(deriveNextTickForState("EXPIRED", false)).toBe("TERMINAL_NO_ACTION");
    expect(deriveNextTickForState("CANCELED", false)).toBe("TERMINAL_NO_ACTION");
  });
  it("returns NONE when blocked_reason is present (overrides state)", () => {
    expect(deriveNextTickForState("REQUESTED", true)).toBe("NONE");
  });
  it("returns NONE for BLOCKED state regardless", () => {
    expect(deriveNextTickForState("BLOCKED", false)).toBe("NONE");
  });
});

describe("validateBeamResponse", () => {
  it("rejects non-object inputs", () => {
    expect(validateBeamResponse(null)).toBeNull();
    expect(validateBeamResponse(42)).toBeNull();
  });
  it("rejects unknown state literals", () => {
    expect(
      validateBeamResponse({
        state: "EXFILTRATED",
        next_tick: "NONE",
        has_blocked_reason: false,
      }),
    ).toBeNull();
  });
  it("rejects unknown next_tick literals", () => {
    expect(
      validateBeamResponse({
        state: "REQUESTED",
        next_tick: "BYPASS_POLICY",
        has_blocked_reason: false,
      }),
    ).toBeNull();
  });
  it("rejects missing has_blocked_reason boolean", () => {
    expect(
      validateBeamResponse({
        state: "REQUESTED",
        next_tick: "NONE",
      }),
    ).toBeNull();
  });
  it("accepts a well-formed response", () => {
    const r = validateBeamResponse({
      state: "REQUESTED",
      next_tick: "AWAIT_TARGET_ACCEPT",
      has_blocked_reason: false,
    });
    expect(r).not.toBeNull();
    expect(r?.state).toBe("REQUESTED");
  });
});

describe("getCollaborationSupervisedStatus — provider modes", () => {
  it("returns COLLABORATION_NOT_FOUND when no row exists", async () => {
    prismaMock.twinCollaborationRequest.findUnique.mockResolvedValue(null);
    const r = await getCollaborationSupervisedStatus(COLLAB_ID);
    expect(r).toEqual({ ok: false, code: "COLLABORATION_NOT_FOUND" });
  });

  it("DISABLED when BEAM_RUNTIME_ENABLED is not true", async () => {
    prismaMock.twinCollaborationRequest.findUnique.mockResolvedValue({
      collaboration_id: COLLAB_ID,
      state: "REQUESTED",
      blocked_reason: null,
    });
    const r = await getCollaborationSupervisedStatus(COLLAB_ID, {
      enabled: false,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.status.provider_mode).toBe("DISABLED");
    expect(r.status.next_tick).toBe("AWAIT_TARGET_ACCEPT");
  });

  it("READY_NOT_ACTIVE when enabled but no URL configured", async () => {
    prismaMock.twinCollaborationRequest.findUnique.mockResolvedValue({
      collaboration_id: COLLAB_ID,
      state: "NEEDS_APPROVAL",
      blocked_reason: null,
    });
    const r = await getCollaborationSupervisedStatus(COLLAB_ID, {
      enabled: true,
      beamUrl: null,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.status.provider_mode).toBe("READY_NOT_ACTIVE");
    expect(r.status.next_tick).toBe("AWAIT_APPROVAL");
  });

  it("UNREACHABLE when fetch throws", async () => {
    prismaMock.twinCollaborationRequest.findUnique.mockResolvedValue({
      collaboration_id: COLLAB_ID,
      state: "REQUESTED",
      blocked_reason: null,
    });
    const failingFetch: typeof fetch = (() => {
      return Promise.reject(new Error("ECONNREFUSED"));
    }) as typeof fetch;
    const r = await getCollaborationSupervisedStatus(COLLAB_ID, {
      enabled: true,
      beamUrl: "http://beam:4369",
      fetchImpl: failingFetch,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.status.provider_mode).toBe("UNREACHABLE");
  });

  it("UNREACHABLE when BEAM returns malformed response", async () => {
    prismaMock.twinCollaborationRequest.findUnique.mockResolvedValue({
      collaboration_id: COLLAB_ID,
      state: "REQUESTED",
      blocked_reason: null,
    });
    const badFetch: typeof fetch = (() => {
      return Promise.resolve(
        new Response(JSON.stringify({ junk: true }), { status: 200 }),
      );
    }) as typeof fetch;
    const r = await getCollaborationSupervisedStatus(COLLAB_ID, {
      enabled: true,
      beamUrl: "http://beam:4369",
      fetchImpl: badFetch,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.status.provider_mode).toBe("UNREACHABLE");
  });

  it("ACTIVE when BEAM returns a well-formed supervised response", async () => {
    prismaMock.twinCollaborationRequest.findUnique.mockResolvedValue({
      collaboration_id: COLLAB_ID,
      state: "REQUESTED",
      blocked_reason: null,
    });
    const okFetch: typeof fetch = (() => {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            state: "IN_PROGRESS",
            next_tick: "AWAIT_TARGET_RESPONSE",
            has_blocked_reason: false,
          }),
          { status: 200 },
        ),
      );
    }) as typeof fetch;
    const r = await getCollaborationSupervisedStatus(COLLAB_ID, {
      enabled: true,
      beamUrl: "http://beam:4369",
      fetchImpl: okFetch,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.status.provider_mode).toBe("ACTIVE");
    expect(r.status.state).toBe("IN_PROGRESS");
    expect(r.status.next_tick).toBe("AWAIT_TARGET_RESPONSE");
  });

  it("blocked_reason on the row drives next_tick=NONE in the fallback", async () => {
    prismaMock.twinCollaborationRequest.findUnique.mockResolvedValue({
      collaboration_id: COLLAB_ID,
      state: "BLOCKED",
      blocked_reason: "MISSING_PROJECT_MEMBERSHIP",
    });
    const r = await getCollaborationSupervisedStatus(COLLAB_ID, {
      enabled: false,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.status.has_blocked_reason).toBe(true);
    expect(r.status.next_tick).toBe("NONE");
  });
});
