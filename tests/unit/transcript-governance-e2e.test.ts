// FILE: transcript-governance-e2e.test.ts (unit, no DB, no LLM)
// PURPOSE: End-to-end transcript acceptance for the recipient-governance gate
//          via the real wiring (governExtraction). Feeds a SIMULATED LLM mistake
//          — the LLM mapped "Shiney" to "Shweta" for integration work — over the
//          founder's fixture transcript and proves the 15 acceptance criteria.
//          Deterministic: no DB, no LLM. Names are fixture data only.
// CONNECTS TO: services/otzar/comms-extract.service.ts (governExtraction),
//              responsibility-graph.ts, recipient-governance.ts.

import { describe, expect, it } from "vitest";
import {
  governExtraction,
  type PreGovExtraction,
  type PreGovSuggestedAction,
  type RosterEntry,
} from "@niov/api";

const ROSTER: RosterEntry[] = [
  { entity_id: "e-david", display_name: "David Odie", email: "david@x.com", title: "Tech Lead" },
  { entity_id: "e-shiney", display_name: "Shiney Mathew", email: "shiney@x.com", title: "Integration Engineer" },
  { entity_id: "e-samiksha", display_name: "Samiksha Sharma", email: "samiksha@x.com", title: "Backend Engineer" },
  { entity_id: "e-pratham", display_name: "Pratham Singh", email: "pratham@x.com", title: "Frontend Engineer" },
  { entity_id: "e-dishant", display_name: "Dishant Roy", email: "dishant@x.com", title: "Research Engineer" },
  { entity_id: "e-will", display_name: "Will Carter", email: "will@x.com", title: "Engineer" },
  { entity_id: "e-vishesh", display_name: "Vishesh Kumar", email: "vishesh@x.com", title: "Designer" },
  { entity_id: "e-shweta", display_name: "Shweta Rao", email: "shweta@x.com", title: "Marketing Manager" },
];

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

function action(over: Partial<PreGovSuggestedAction> & { local_id: string; target: PreGovSuggestedAction["target"] }): PreGovSuggestedAction {
  return {
    action_type: "SEND_INTERNAL_NOTIFICATION",
    draft_text: "draft",
    reason: "Otzar drafted this from the captured conversation.",
    source_excerpt: null,
    confidence: "HIGH",
    resolution_status: "RESOLVED",
    ...over,
  };
}

// What the (buggy) LLM produced: it mapped Shiney -> Shweta for the integration
// follow-up, plus correct follow-ups to Shiney and Samiksha.
const PRE: PreGovExtraction = {
  summary: "YC demo integration push. Shiney owns integration; Samiksha auth; Pratham UI.",
  decisions: [],
  commitments: [],
  risks_or_blockers: [],
  extraction_mode: "LLM",
  suggested_actions: [
    action({
      local_id: "a-shweta",
      target: { display_name: "Shweta Rao", email: "shweta@x.com", entity_id: "e-shweta" },
      source_excerpt: "Shiney is going to lead the team on the YC demo integration.",
    }),
    action({
      local_id: "a-shiney",
      target: { display_name: "Shiney Mathew", email: "shiney@x.com", entity_id: "e-shiney" },
      source_excerpt: "Shiney, you are the focal point.",
    }),
    action({
      local_id: "a-samiksha",
      target: { display_name: "Samiksha Sharma", email: "samiksha@x.com", entity_id: "e-samiksha" },
      source_excerpt: "Samiksha will support the auth token sessions.",
    }),
  ],
};

describe("transcript governance end-to-end — 15 acceptance criteria", () => {
  const out = governExtraction(PRE, TRANSCRIPT, ROSTER);
  const byId = new Map(out.suggested_actions.map((a) => [a.local_id, a]));
  const shweta = byId.get("a-shweta")!;
  const shiney = byId.get("a-shiney")!;
  const samiksha = byId.get("a-samiksha")!;

  it("1. NO card to Shweta — out_of_scope, downgraded, not send-ready", () => {
    expect(shweta.recipient_governance.recipientSafety).toBe("out_of_scope");
    expect(shweta.recipient_governance.mentionStatus).toBe("not_mentioned");
    expect(shweta.resolution_status).toBe("RESTRICTED"); // downgraded from RESOLVED
  });

  it("2. Shiney is selected for integration (confirmed, send-ready)", () => {
    expect(shiney.recipient_governance.recipientSafety).toBe("confirmed");
    expect(shiney.recipient_governance.mentionStatus).toBe("explicitly_mentioned");
    expect(shiney.resolution_status).toBe("RESOLVED");
  });

  it("3 + 4. David is the meeting lead and gets a coordinator card (not an IC task)", () => {
    expect(out.responsibility_graph.lead?.name).toBe("David");
    expect(out.lead_card?.lead).toBe("David");
    expect(out.lead_card?.body).toMatch(/David is leading/i);
    expect(out.lead_card?.body).toMatch(/Shiney/);
  });

  it("5-9. responsibility roles are grounded", () => {
    const role = (n: string) => out.responsibility_graph.nodes.find((x) => x.name === n)?.role;
    expect(role("Samiksha")).toBe("support"); // 5 auth support
    expect(role("Pratham")).toBe("support"); // 6 UI support
    expect(role("Dishant")).toBe("owner"); // 7 OpenClaw owner
    expect(role("Will")).toBe("support"); // 8 setup support
    expect(role("Vishesh")).toBe("optional_advisor"); // 9 optional UI
    expect(samiksha.recipient_governance.recipientSafety).toBe("confirmed");
  });

  it("10. Shweta is excluded — no proof path, not in the responsibility graph", () => {
    expect(out.responsibility_graph.nodes.find((n) => n.name === "Shweta")).toBeUndefined();
    expect(shweta.recipient_governance.workConnectionType).toBe("none");
  });

  it("11. every card carries an evidence/proof path", () => {
    for (const a of out.suggested_actions) {
      expect(a.recipient_governance).toBeDefined();
      expect(a.recipient_governance.evidence).toHaveProperty("source");
      expect(a.recipient_governance).toHaveProperty("participantStatus");
      expect(a.recipient_governance).toHaveProperty("workConnectionType");
    }
  });

  it("12 + 13. unsafe card is not send-ready; autonomy eligibility is false unless safe", () => {
    // Send-ready === recipientSafety confirmed.
    expect(shweta.recipient_governance.recipientSafety).not.toBe("confirmed");
    expect(shweta.recipient_governance.autonomyEligibility).toBe("blocked");
    // The confirmed recipient is at most "eligible" (future) but UI still approves.
    expect(["eligible", "draft_only"]).toContain(shiney.recipient_governance.autonomyEligibility);
  });

  it("a roster WITHOUT Shiney still never routes integration to Shweta", () => {
    const rosterNoShiney = ROSTER.filter((p) => p.entity_id !== "e-shiney");
    const preNoShiney: PreGovExtraction = {
      ...PRE,
      suggested_actions: [PRE.suggested_actions[0]!], // only the Shweta mistake
    };
    const res = governExtraction(preNoShiney, TRANSCRIPT, rosterNoShiney);
    const a = res.suggested_actions[0]!;
    expect(a.recipient_governance.recipientSafety).toBe("out_of_scope");
    expect(a.resolution_status).toBe("RESTRICTED");
  });
});
