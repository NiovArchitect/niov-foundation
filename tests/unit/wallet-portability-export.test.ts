// FILE: wallet-portability-export.test.ts
// PURPOSE: Enforce wallet export filter — portable personal only;
//          org work and secrets never leave with the person.
import { describe, expect, it } from "vitest";
import {
  classifyWalletExportItem,
  filterWalletExportPackage,
} from "../../apps/api/src/services/otzar/wallet-portability.js";

describe("wallet export enforcement", () => {
  it("includes personal skills and corrections", () => {
    const d = classifyWalletExportItem({
      kind: "twin_skill",
      ref_id: "s1",
      label: "Summary tone",
    });
    expect(d.include_in_export).toBe(true);
    expect(d.class).toBe("PORTABLE_PERSONAL");
  });

  it("retains org work and never exports secrets/peers", () => {
    expect(
      classifyWalletExportItem({
        kind: "work_project",
        ref_id: "p1",
        label: "Pilot",
      }).include_in_export,
    ).toBe(false);
    expect(
      classifyWalletExportItem({
        kind: "oauth_token",
        ref_id: "t1",
        label: "Google",
      }).class,
    ).toBe("NEVER_EXPORT");
    expect(
      classifyWalletExportItem({
        kind: "peer_memory",
        ref_id: "m1",
        label: "Other twin",
      }).include_in_export,
    ).toBe(false);
  });

  it("packages only portable layer", () => {
    const pkg = filterWalletExportPackage([
      { kind: "correction_memory", ref_id: "c1", label: "Prefer short briefs" },
      { kind: "work_ledger", ref_id: "w1", label: "Ship UI" },
      { kind: "api_key", ref_id: "k1", label: "secret" },
      { kind: "personal_preference", ref_id: "pr1", label: "Quiet hours" },
    ]);
    expect(pkg.portable_count).toBe(2);
    expect(pkg.org_retained_count).toBe(1);
    expect(pkg.never_export_count).toBe(1);
    expect(pkg.included.every((i) => i.include_in_export)).toBe(true);
    expect(pkg.excluded.some((e) => e.kind === "api_key")).toBe(true);
  });
});
