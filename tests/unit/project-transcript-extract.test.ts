import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  extractProjectSectionsFromTranscript,
  scoreAgainstOracle,
} from "../../apps/api/src/services/otzar/project-transcript-extract.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(
    join(__dirname, "../fixtures/project-coherence-oracle.json"),
    "utf8",
  ),
) as {
  project_name: string;
  transcript: string;
  oracle: {
    decisions_confirmed: string[];
    requirements_proposed: string[];
    meeting_required: boolean;
    speakers_min: number;
  };
};

describe("extractProjectSectionsFromTranscript vs hidden oracle", () => {
  it("extracts useful sections without inventing content", () => {
    const r = extractProjectSectionsFromTranscript({
      transcript: fixture.transcript,
      project_name: fixture.project_name,
    });
    expect(r.body_useful).toBe(true);
    expect(r.meeting_required).toBe(fixture.oracle.meeting_required);
    expect(r.speakers.length).toBeGreaterThanOrEqual(fixture.oracle.speakers_min);
    expect(r.sections.decisions?.length).toBeGreaterThan(0);
    expect(r.sections.compliance?.some((c) => /phi/i.test(c.text))).toBe(true);
  });

  it("scores decisions recall ≥ 0.66 against oracle", () => {
    const r = extractProjectSectionsFromTranscript({
      transcript: fixture.transcript,
      project_name: fixture.project_name,
    });
    const score = scoreAgainstOracle(
      r.decisions_confirmed,
      fixture.oracle.decisions_confirmed,
    );
    expect(score.recall).toBeGreaterThanOrEqual(0.66);
    expect(score.f1).toBeGreaterThan(0.5);
  });

  it("scores SSO requirement against oracle", () => {
    const r = extractProjectSectionsFromTranscript({
      transcript: fixture.transcript,
      project_name: fixture.project_name,
    });
    const score = scoreAgainstOracle(
      r.requirements_proposed,
      fixture.oracle.requirements_proposed,
    );
    expect(score.recall).toBe(1);
  });
});
