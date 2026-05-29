// FILE: action-state-machine.test.ts (unit)
// PURPOSE: Pure-function unit tests for the ADR-0057 §1 Action lifecycle
//          state-machine guard at apps/api/src/services/action/
//          state-machine.ts. Verifies every legal transition is allowed,
//          every illegal transition throws ActionInvalidTransitionError,
//          and the 6 canonical terminal statuses are immutable.
// CONNECTS TO: apps/api/src/services/action/state-machine.ts via the
//              "@niov/api" barrel.

import { describe, expect, it } from "vitest";
import {
  ACTION_INVALID_TRANSITION,
  ActionInvalidTransitionError,
  assertActionTransition,
  canTransitionAction,
  isTerminalActionStatus,
} from "@niov/api";
import type { ActionStatus } from "@prisma/client";

const ALL_STATUSES: ActionStatus[] = [
  "PROPOSED",
  "APPROVED",
  "SCHEDULED",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
  "TIMED_OUT",
  "REJECTED",
  "EXPIRED",
];

const TERMINAL_STATUSES: ActionStatus[] = [
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
  "TIMED_OUT",
  "REJECTED",
  "EXPIRED",
];

const NON_TERMINAL_STATUSES: ActionStatus[] = [
  "PROPOSED",
  "APPROVED",
  "SCHEDULED",
  "RUNNING",
];

// Canonical legal edges per ADR-0057 §1. The state-machine module
// preserves these by construction; the test pins them so a future
// edit that adds or removes an edge has to update this list too.
// Note: ADR-0057 §11 keeps the parent Action in RUNNING through
// all attempts (retry happens in-tick), so there is no
// RUNNING → SCHEDULED edge.
const LEGAL_EDGES: Array<[ActionStatus, ActionStatus]> = [
  ["PROPOSED", "APPROVED"],
  ["PROPOSED", "REJECTED"],
  ["PROPOSED", "CANCELLED"],
  ["APPROVED", "SCHEDULED"],
  ["APPROVED", "CANCELLED"],
  ["SCHEDULED", "RUNNING"],
  ["SCHEDULED", "EXPIRED"],
  ["SCHEDULED", "CANCELLED"],
  ["RUNNING", "SUCCEEDED"],
  ["RUNNING", "FAILED"],
  ["RUNNING", "TIMED_OUT"],
  ["RUNNING", "CANCELLED"],
];

describe("ADR-0057 §1 — Action lifecycle state machine", () => {
  describe("isTerminalActionStatus", () => {
    it.each(TERMINAL_STATUSES)("recognizes %s as terminal", (s) => {
      expect(isTerminalActionStatus(s)).toBe(true);
    });
    it.each(NON_TERMINAL_STATUSES)("recognizes %s as non-terminal", (s) => {
      expect(isTerminalActionStatus(s)).toBe(false);
    });
  });

  describe("canTransitionAction (canonical legal edges)", () => {
    it.each(LEGAL_EDGES)("permits %s → %s", (from, to) => {
      expect(canTransitionAction(from, to)).toBe(true);
    });
  });

  describe("canTransitionAction (every other pair is illegal)", () => {
    const legalSet = new Set(LEGAL_EDGES.map(([f, t]) => `${f}->${t}`));
    const pairs: Array<[ActionStatus, ActionStatus]> = [];
    for (const from of ALL_STATUSES) {
      for (const to of ALL_STATUSES) {
        if (legalSet.has(`${from}->${to}`)) continue;
        pairs.push([from, to]);
      }
    }
    it.each(pairs)("rejects %s → %s", (from, to) => {
      expect(canTransitionAction(from, to)).toBe(false);
    });
  });

  describe("assertActionTransition", () => {
    it.each(LEGAL_EDGES)("does not throw on %s → %s", (from, to) => {
      expect(() => assertActionTransition(from, to)).not.toThrow();
    });
    it("throws ActionInvalidTransitionError on illegal edge", () => {
      let caught: unknown;
      try {
        assertActionTransition("APPROVED", "RUNNING");
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(ActionInvalidTransitionError);
      const err = caught as ActionInvalidTransitionError;
      expect(err.name).toBe(ACTION_INVALID_TRANSITION);
      expect(err.from).toBe("APPROVED");
      expect(err.to).toBe("RUNNING");
    });
    it.each(TERMINAL_STATUSES)(
      "rejects every transition out of terminal %s",
      (from) => {
        for (const to of ALL_STATUSES) {
          expect(canTransitionAction(from, to)).toBe(false);
        }
      },
    );
  });

  describe("Scheduler / executor edges (ADR-0057 §1 + §11)", () => {
    it("APPROVED → SCHEDULED is the only admission edge", () => {
      for (const from of ALL_STATUSES) {
        const allowed = canTransitionAction(from, "SCHEDULED");
        if (from === "APPROVED") expect(allowed).toBe(true);
        else expect(allowed).toBe(false);
      }
    });
    it("SCHEDULED → RUNNING is the only executor claim edge", () => {
      for (const from of ALL_STATUSES) {
        const allowed = canTransitionAction(from, "RUNNING");
        if (from === "SCHEDULED") expect(allowed).toBe(true);
        else expect(allowed).toBe(false);
      }
    });
    it("SCHEDULED → EXPIRED is the only expiry edge", () => {
      for (const from of ALL_STATUSES) {
        const allowed = canTransitionAction(from, "EXPIRED");
        if (from === "SCHEDULED") expect(allowed).toBe(true);
        else expect(allowed).toBe(false);
      }
    });
    it("RUNNING → SUCCEEDED / FAILED / TIMED_OUT are only valid from RUNNING", () => {
      for (const term of ["SUCCEEDED", "FAILED", "TIMED_OUT"] as const) {
        for (const from of ALL_STATUSES) {
          const allowed = canTransitionAction(from, term);
          if (from === "RUNNING") expect(allowed).toBe(true);
          else expect(allowed).toBe(false);
        }
      }
    });
  });
});
