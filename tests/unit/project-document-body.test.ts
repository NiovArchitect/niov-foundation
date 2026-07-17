// FILE: project-document-body.test.ts
// PURPOSE: Structured project document body must be non-empty, status-tagged,
//          and fail usefulness gate when thin.

import { describe, expect, it } from "vitest";
import {
  buildProjectDocumentBody,
  isUsefulDocumentBody,
  minUsefulBodyChars,
} from "../../apps/api/src/services/otzar/project-document-body.js";

describe("buildProjectDocumentBody", () => {
  it("builds multi-section useful body with status tags", () => {
    const { body, char_count, section_count } = buildProjectDocumentBody({
      project_name: "Launch the enterprise customer pilot",
      organization_label: "Smoke Co",
      artifact_type: "Project brief",
      sections: {
        objective: "Ship a governed pilot for enterprise customers.",
        decisions: [
          {
            text: "Pilot kickoff is Thursday 16:00 UTC",
            status: "confirmed",
            owner_label: "Product lead",
          },
        ],
        requirements: [
          { text: "SSO for pilot tenants", status: "proposed" },
        ],
        owners: [
          { role: "Owner", name: "Product lead" },
          { role: "Engineering", name: "Eng lead" },
        ],
        open_questions: [
          { text: "Legal redlines on DPA?", status: "unresolved" },
        ],
        next_actions: [
          {
            text: "Circulate brief to compliance",
            status: "confirmed",
            owner_label: "Product lead",
          },
        ],
        source_note: "From smoke transcript oracle (test).",
      },
    });
    expect(section_count).toBeGreaterThanOrEqual(5);
    expect(char_count).toBeGreaterThanOrEqual(minUsefulBodyChars());
    expect(isUsefulDocumentBody(body)).toBe(true);
    expect(body).toContain("[CONFIRMED]");
    expect(body).toContain("[PROPOSED]");
    expect(body).toContain("[UNRESOLVED]");
    expect(body).toContain("Launch the enterprise customer pilot");
    expect(body).not.toContain("undefined");
  });

  it("rejects empty / thin bodies", () => {
    expect(isUsefulDocumentBody("")).toBe(false);
    expect(isUsefulDocumentBody("hi")).toBe(false);
    const thin = buildProjectDocumentBody({
      project_name: "X",
      sections: { objective: "Y" },
    });
    // May still pass section count; force thin string
    expect(isUsefulDocumentBody("# only\n")).toBe(false);
    expect(thin.body.length).toBeGreaterThan(0);
  });
});
