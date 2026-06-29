// FILE: decision-rights-extraction.test.ts (unit, no DB)
// PURPOSE: Close the "models exist but aren't fed from transcript" gap — extract
//          authority/expertise/dissent signals from transcript text and prove
//          the decision-rights + recommendation behave correctly. Deterministic;
//          names from the transcript only.
// CONNECTS TO: services/otzar/decision-rights-extraction.ts, decision-rights.ts,
//              decision-recommendation.ts.

import { describe, expect, it } from "vitest";
import {
  extractDecisionSignals,
  buildDecisionInputFromTranscript,
  computeDecisionRights,
  recommendDirection,
} from "@niov/api";

function decide(transcript: string, domain: Parameters<typeof buildDecisionInputFromTranscript>[1] = "technical", policyAllows = true) {
  const input = buildDecisionInputFromTranscript(transcript, domain, { policyAllows });
  const decision = computeDecisionRights(input);
  return { input, decision };
}

describe("transcript -> decision-rights signal extraction", () => {
  it("1. founder speed priority shapes the recommendation (modular, not rebuild)", () => {
    const { input, decision } = decide(
      "Sadeil: speed matters more than overbuilding. David will lead the push. Dishant will explore OpenClaw.",
    );
    expect(input.strategicPriority).toMatch(/speed/i);
    const rec = recommendDirection({
      decision,
      proposedDirection: "rebuild the full MVP",
      strategicPriority: input.strategicPriority,
    });
    expect(rec.recommendedDirection).toMatch(/modular|minimal|do not rebuild/i);
  });

  it("2. the meeting lead is extracted as the decision owner (authority)", () => {
    const { decision } = decide("David will lead this push. Shiney owns integration.");
    expect(decision.decisionOwner).toBe("David");
  });

  it("3. a domain expert contradiction lowers confidence + blocks autonomy", () => {
    const { decision } = decide(
      "David will lead. Samiksha: the auth refresh is not complete, we need to confirm logout.",
    );
    expect(decision.confidence).toBe("low");
    expect(decision.autonomyBlocked).toBe(true);
    expect(decision.dissentSignals.length).toBeGreaterThan(0);
  });

  it("4. unresolved dissent blocks autonomy", () => {
    const { decision } = decide("We need to confirm the integration status before proceeding.");
    expect(decision.autonomyBlocked).toBe(true);
  });

  it("5. agreement between lead + owner + evidence raises confidence", () => {
    const { decision } = decide(
      "David will lead. Shiney owns and built the integration. We agreed on the plan.",
    );
    expect(decision.confidence).toBe("high");
    expect(decision.autonomyBlocked).toBe(false);
  });

  it("6. policy outranks hierarchy", () => {
    const { decision } = decide("David will lead. Send the restricted doc.", "security", false);
    expect(decision.autonomyBlocked).toBe(true);
    expect(decision.escalationTarget).toBe("policy approver");
  });

  it("7. a lower-hierarchy expert's evidence is preserved (not overridden)", () => {
    const { decision } = decide("Dana built and tested the auth refresh endpoint.");
    expect(decision.expertiseSignals.length).toBeGreaterThan(0);
    expect(decision.expertiseSignals[0]!.party).toBe("Dana");
  });

  it("8. the recommendation carries direction, confidence, why, risks, alternatives, owner, next action", () => {
    const { decision } = decide(
      "David will lead. Samiksha: auth is not complete. Shiney owns integration.",
    );
    const rec = recommendDirection({ decision });
    expect(rec.recommendedDirection.length).toBeGreaterThan(0);
    expect(["high", "medium", "low"]).toContain(rec.confidence);
    expect(rec.why.length).toBeGreaterThan(0);
    expect(rec.nextBestAction).toBeDefined();
    expect(rec.decisionOwner).toBeDefined();
  });

  it("extractor emits signals only on explicit markers (no fabrication)", () => {
    const sig = extractDecisionSignals("Nothing was decided. Just a status update.");
    expect(sig.authority.length).toBe(0);
    expect(sig.dissent.length).toBe(0);
  });
});
