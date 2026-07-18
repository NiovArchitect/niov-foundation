import { describe, expect, it } from "vitest";
import { resolveWalletPortabilityPosture } from "../../apps/api/src/services/otzar/wallet-portability.js";

describe("wallet-portability — personal travels, org stays", () => {
  it("exposes three buckets with portable personal layer", () => {
    const p = resolveWalletPortabilityPosture();
    expect(p.leaves_org_without_harm).toBe(true);
    expect(p.takes_only_personal_layer).toBe(true);
    expect(p.buckets.map((b) => b.class)).toEqual([
      "PORTABLE_PERSONAL",
      "ORG_SCOPED",
      "NEVER_EXPORT",
    ]);
    expect(p.portable_summary.toLowerCase()).toMatch(/personal|travel/);
    expect(p.never_export_summary.toLowerCase()).toMatch(/secret|credential|peer/);
  });
});
