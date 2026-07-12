// FILE: tests/unit/otzar-handoff-validation.test.ts
// PURPOSE: [OTZAR STAGE-2 §L/§19] Handoff enum allowlists + lifecycle helpers.
// CONNECTS TO: packages/database/src/queries/otzar-handoffs.ts

import { describe, expect, it } from "vitest";
import {
  HANDOFF_STATES, HANDOFF_DISPOSITIONS, TERMINAL_HANDOFF_STATES, OPEN_HANDOFF_STATES,
  isHandoffState, isHandoffDisposition, isTerminalHandoffState,
} from "@niov/database";

describe("handoff enum allowlists + helpers (§19)", () => {
  it("state allowlist: every canonical value accepted; unknown/casing/empty/non-string rejected", () => {
    for (const s of HANDOFF_STATES) expect(isHandoffState(s)).toBe(true);
    for (const bad of ["NOPE", "drafted", "", null, undefined, 1, {}]) expect(isHandoffState(bad)).toBe(false);
    // The 9 §L states exactly.
    expect([...HANDOFF_STATES].sort()).toEqual(["ACKNOWLEDGED", "CLARIFICATION_REQUIRED", "COMPLETED", "DRAFTED", "ESCALATED", "READY_FOR_REVIEW", "RECEIVED", "SENT", "SUPERSEDED"].sort());
  });

  it("disposition allowlist: canonical accepted; unknown rejected", () => {
    for (const d of HANDOFF_DISPOSITIONS) expect(isHandoffDisposition(d)).toBe(true);
    for (const bad of ["NOPE", "accepted", "", null]) expect(isHandoffDisposition(bad)).toBe(false);
    expect([...HANDOFF_DISPOSITIONS].sort()).toEqual(["ACCEPTED", "PENDING", "REASSIGNED", "RETAINED", "SUPERSEDED"].sort());
  });

  it("terminal/open helpers: COMPLETED + SUPERSEDED terminal; the rest open", () => {
    expect([...TERMINAL_HANDOFF_STATES].sort()).toEqual(["COMPLETED", "SUPERSEDED"]);
    for (const t of TERMINAL_HANDOFF_STATES) expect(isTerminalHandoffState(t)).toBe(true);
    for (const o of OPEN_HANDOFF_STATES) expect(isTerminalHandoffState(o)).toBe(false);
    // Every state is either terminal or open, exactly once.
    for (const s of HANDOFF_STATES) {
      const inTerminal = (TERMINAL_HANDOFF_STATES as readonly string[]).includes(s);
      const inOpen = (OPEN_HANDOFF_STATES as readonly string[]).includes(s);
      expect(inTerminal !== inOpen).toBe(true);
    }
  });
});
