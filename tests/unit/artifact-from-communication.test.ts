import { describe, expect, it } from "vitest";
import { chooseArtifactFromCommunication } from "../../apps/api/src/services/otzar/artifact-from-communication.js";

describe("chooseArtifactFromCommunication — communication is the OS", () => {
  it("chooses slides when presentation language dominates", () => {
    const a = chooseArtifactFromCommunication({
      text: "Please prepare slides for the board pitch deck next week.",
    });
    expect(a.kind).toBe("SLIDES");
    expect(a.provider_target).toBe("google_slides");
    expect(a.materialize_now).toBe(false); // honest: no slides rail yet
  });

  it("chooses insurance form + INSURANCE accuracy", () => {
    const a = chooseArtifactFromCommunication({
      text: "Caretaker needs to complete the insurance prior-auth form for the patient.",
    });
    expect(a.kind).toBe("INSURANCE_FORM");
    expect(a.accuracy_class).toBe("INSURANCE");
    expect(a.materialize_now).toBe(true);
  });

  it("chooses care plan + REGULATED_HEALTH", () => {
    const a = chooseArtifactFromCommunication({
      text: "Update the care plan for the clinical team after the nursing handoff.",
    });
    expect(a.kind).toBe("CARE_PLAN");
    expect(a.accuracy_class).toBe("REGULATED_HEALTH");
  });

  it("chooses financial pack + REGULATED_FINANCE", () => {
    const a = chooseArtifactFromCommunication({
      text: "Finish the KYC financial documentation pack for onboarding.",
    });
    expect(a.kind).toBe("FINANCIAL_PACK");
    expect(a.accuracy_class).toBe("REGULATED_FINANCE");
  });

  it("defaults to project brief for pilot launch language", () => {
    const a = chooseArtifactFromCommunication({
      text: "We need a brief for the enterprise pilot launch.",
      project_name: "Launch the enterprise customer pilot",
    });
    expect(a.kind).toBe("PROJECT_BRIEF");
    expect(a.materialize_now).toBe(true);
  });
});
