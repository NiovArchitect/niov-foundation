// FILE: work-contract.test.ts
// PURPOSE: Slice 6 — server minimum work contract.

import { describe, expect, it } from "vitest";
import {
  cannotCompleteSafely,
  enforceWorkContract,
  isVagueWorkTitle,
  serverHumanWorkTitle,
} from "../../apps/api/src/services/work-os/work-contract.js";

describe("work-contract", () => {
  it("detects vague follow-ups", () => {
    expect(isVagueWorkTitle("Follow up with Ava")).toBe(true);
    expect(isVagueWorkTitle("circle back with Casey")).toBe(true);
    expect(isVagueWorkTitle("Confirm encryption review for HelioGrid")).toBe(
      false,
    );
  });

  it("demotes vague titles out of active statuses", () => {
    const r = enforceWorkContract({
      title: "Follow up with Ava",
      status: "READY_TO_EXECUTE",
      ledger_type: "FOLLOW_UP",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.demoted).toBe(true);
    expect(r.status).toBe("PROPOSED");
    expect(r.title).toMatch(/Ask Ava/i);
  });

  it("allows specific active work", () => {
    const r = enforceWorkContract({
      title: "Casey: complete encryption checklist before interview invite",
      status: "READY_TO_EXECUTE",
      ledger_type: "TASK",
      summary: "Security gate for application review",
    });
    expect(r.ok && r.demoted === false).toBe(true);
    if (!r.ok) return;
    expect(r.status).toBe("READY_TO_EXECUTE");
  });

  it("blocks complete on vague", () => {
    expect(
      cannotCompleteSafely({ title: "Follow up with Riley", status: "DRAFT" }),
    ).toBe(true);
    expect(
      cannotCompleteSafely({
        title: "Ship security gate proof",
        status: "READY_TO_EXECUTE",
      }),
    ).toBe(false);
  });

  it("server human title rewrites generics", () => {
    expect(serverHumanWorkTitle("Follow up with Sam", null)).toMatch(/Ask Sam/);
  });
});
