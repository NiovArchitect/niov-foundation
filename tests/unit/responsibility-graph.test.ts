// FILE: responsibility-graph.test.ts (unit, no DB)
// PURPOSE: Prove Otzar understands the WORK STRUCTURE of a transcript — lead,
//          owners, supporters, optional advisors — and that the meeting lead
//          gets a coordination card, not a random IC task. Names are fixture
//          data only; the extractor is deterministic and never invents people.
// CONNECTS TO: services/otzar/responsibility-graph.ts.

import { describe, expect, it } from "vitest";
import {
  buildResponsibilityGraph,
  buildLeadCoordinationCard,
  enrichResponsibilityGraphFromExtraction,
} from "@niov/api";

// Encodes the founder-described meeting: Sadeil hands to David (lead); Shiney
// owns integration; Samiksha auth support; Pratham UI support; Dishant OpenClaw;
// Will setup support; Vishesh optional. Shweta is NOT in the transcript at all.
const TRANSCRIPT = [
  "Sadeil handed the call to the team and set the founder context.",
  "David will lead this push.",
  "Shiney is going to lead the team on the YC demo integration.",
  "Shiney, you are the focal point.",
  "Samiksha will support the auth token sessions.",
  "Pratham will support the UI and frontend work.",
  "Dishant is responsible for the OpenClaw exploration.",
  "Will can support the OpenClaw setup.",
  "Vishesh is optional for UI context.",
].join(" ");

function role(graph: ReturnType<typeof buildResponsibilityGraph>, name: string): string | undefined {
  return graph.nodes.find((n) => n.name === name)?.role;
}

describe("responsibility graph — work structure", () => {
  const graph = buildResponsibilityGraph(TRANSCRIPT);

  it("detects David as the meeting lead (Sadeil handed off, David leads)", () => {
    expect(graph.lead?.name).toBe("David");
    expect(role(graph, "David")).toBe("meeting_lead");
  });

  it("recognizes Sadeil as founder/context authority, not an IC owner", () => {
    expect(graph.founderAuthority?.name).toBe("Sadeil");
  });

  it("Shiney is the integration owner (not mis-read as meeting lead)", () => {
    expect(role(graph, "Shiney")).toBe("owner");
    const shiney = graph.nodes.find((n) => n.name === "Shiney");
    expect(shiney?.workItem ?? "").toMatch(/integration/i);
  });

  it("Samiksha / Pratham / Will are support; Dishant owns; Vishesh optional", () => {
    expect(role(graph, "Samiksha")).toBe("support");
    expect(role(graph, "Pratham")).toBe("support");
    expect(role(graph, "Will")).toBe("support");
    expect(role(graph, "Dishant")).toBe("owner");
    expect(role(graph, "Vishesh")).toBe("optional_advisor");
  });

  it("Shweta is NOT in the graph — never connected to the work", () => {
    expect(graph.nodes.find((n) => n.name === "Shweta")).toBeUndefined();
  });

  it("the lead coordination card tracks the team, not a random task", () => {
    const card = buildLeadCoordinationCard(graph);
    expect(card?.lead).toBe("David");
    expect(card?.body).toMatch(/David is leading/i);
    // It references the people David must track.
    expect(card?.body).toMatch(/Shiney/);
    expect(card?.body).toMatch(/Samiksha/);
    // Sadeil (founder authority) is not tracked as an IC.
    expect(card?.tracks.find((t) => t.name === "Sadeil")).toBeUndefined();
    expect(card?.tracks.find((t) => t.name === "Shiney")?.role).toBe("owner");
  });
});

describe("responsibility graph — enterprise-natural ownership fan-out", () => {
  it("places owners for will-complete / will-ship commitments", () => {
    const t = [
      "Sadeil: David will complete the UI flow review by Friday.",
      "David: Agreed, I own the UI flow review.",
      "Sadeil: Vishesh will ship ambient orb polish this week.",
    ].join(" ");
    const g = buildResponsibilityGraph(t);
    expect(g.nodes.find((n) => n.name === "David")?.role).toBe("owner");
    expect(g.nodes.find((n) => n.name === "Vishesh")?.role).toBe("owner");
  });

  it("enrichment from commitment strings fills graph when patterns miss", () => {
    const empty = buildResponsibilityGraph("random chatter with no roles.");
    const enriched = enrichResponsibilityGraphFromExtraction(empty, {
      commitments: [
        "David will complete the UI flow review by Friday",
        "Vishesh will ship ambient orb polish this week",
      ],
      suggested_actions: [
        {
          target: {
            display_name: "David Odie",
            entity_id: "id-david",
          },
          source_excerpt: "David will complete the UI flow review",
          draft_text: "Hi David",
          resolution_status: "RESOLVED",
        },
      ],
    });
    expect(enriched.nodes.find((n) => n.name === "David")?.role).toBe("owner");
    expect(enriched.nodes.find((n) => n.name === "Vishesh")?.role).toBe("owner");
  });
});

describe("responsibility graph — synthetic roster handles + project-loop ownership", () => {
  const PROJECT_LOOP = [
    "[2026-07-21 09:13] R03P4: engineering is blocked on the compliance memo — not ready for 2026-09-11.",
    "[2026-07-21 09:15] R03P1: correction — product owns the brief; engineering owns the runtime cutover only.",
    "[2026-07-21 09:18] R03P4: ok then lock 2026-09-18 for the go/no-go. Reject auto-booking 2026-09-11.",
    "[2026-07-21 09:19] R03P0: decision: 2026-09-18 is final. R03P1 owns the brief; R03P4 owns cutover readiness.",
  ].join("\n");

  it("places R03P1 / R03P4 as owners from explicit 'owns' language (digit handles)", () => {
    const g = buildResponsibilityGraph(PROJECT_LOOP);
    expect(g.nodes.find((n) => n.name === "R03P1")?.role).toBe("owner");
    expect(g.nodes.find((n) => n.name === "R03P4")?.role).toBe("owner");
  });

  it("enrichment accepts LLM 'to deliver' commitments and decision ownership lines", () => {
    const empty = buildResponsibilityGraph("side chat with no role language.");
    const enriched = enrichResponsibilityGraphFromExtraction(empty, {
      commitments: [
        "R03P1 to deliver the pilot brief",
        "R03P4 to ensure cutover readiness by 2026-09-18",
        "R03P1 owns the pilot brief",
        "R03P4 owns cutover readiness",
      ],
    });
    expect(enriched.nodes.find((n) => n.name === "R03P1")?.role).toBe("owner");
    expect(enriched.nodes.find((n) => n.name === "R03P4")?.role).toBe("owner");
  });
});
