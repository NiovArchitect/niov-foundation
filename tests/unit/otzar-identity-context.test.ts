// FILE: otzar-identity-context.test.ts (unit)
// PURPOSE: Pure-function coverage for the Phase 1205 identity-context
//          preamble renderer (renderIdentityPreamble). No DB, no LLM,
//          no network -- locks the closed-vocab shape, the privacy
//          invariants, and the title humanization fallbacks.
// CONNECTS TO: apps/api/src/services/otzar/identity-context.ts.

import { describe, expect, it } from "vitest";
import {
  renderIdentityPreamble,
  type IdentityContext,
} from "@niov/api";
import { UNCONFIGURED_PREAMBLE } from "../../apps/api/src/services/otzar/identity-context.js";

function baseCtx(overrides: Partial<IdentityContext> = {}): IdentityContext {
  return {
    viewer: {
      user_id: "viewer-1",
      email: "sadeil@niovlabs.com",
      display_name: "Sadeil",
      title: "FOUNDER",
      org_role: "FOUNDER",
      is_founder_admin: true,
    },
    org: {
      org_id: "org-1",
      name: "NIOV Labs",
      domain: "niovlabs.com",
    },
    twin: {
      twin_id: "twin-1",
      display_name: "Otzar",
      active: true,
    },
    projects: [
      { project_id: "p-1", name: "Foundation", role: "LEAD" },
      { project_id: "p-2", name: "Otzar Control Tower", role: "MEMBER" },
    ],
    authority: {
      can_admin_org: true,
      can_read_capsules: true,
      can_write_capsules: true,
      can_share_capsules: true,
      can_access_external_api: false,
      external_write_policy: "APPROVAL_REQUIRED",
    },
    context_signals: {
      memory_capsules_count: 12,
      transcript_summaries_count: 3,
      collaboration_inbound_count: 1,
      collaboration_outbound_count: 2,
    },
    org_roster: [],
    safety: {
      no_external_write_without_approval: true,
      no_private_data_to_unauthorized_users: true,
      no_raw_audio_storage: true,
      no_raw_transcript_default: true,
    },
    ...overrides,
  };
}

describe("renderIdentityPreamble -- canonical happy path", () => {
  it("opens with [VIEWER IDENTITY] and names the viewer + org + title", () => {
    const out = renderIdentityPreamble(baseCtx());
    expect(out.startsWith("[VIEWER IDENTITY]")).toBe(true);
    expect(out).toContain("Sadeil");
    expect(out).toContain("Founder & CEO");
    expect(out).toContain("NIOV Labs");
  });

  it("includes the twin display name and instructs the LLM to act as the twin", () => {
    const out = renderIdentityPreamble(baseCtx());
    expect(out).toContain('"Otzar"');
    expect(out).toContain("Always speak as their Twin");
  });

  it("renders project memberships as 'name (role)' joined by '; '", () => {
    const out = renderIdentityPreamble(baseCtx());
    expect(out).toContain("Foundation (LEAD); Otzar Control Tower (MEMBER)");
  });

  it("surfaces context-signal counts deterministically", () => {
    const out = renderIdentityPreamble(baseCtx());
    expect(out).toContain("12 memory summaries");
    expect(out).toContain("3 transcript-derived summaries");
    expect(out).toContain("1 inbound collaborations");
    expect(out).toContain("2 outbound collaborations");
  });

  it("ends with a [GOVERNANCE] block that bans the 'no info about this user' fallback", () => {
    const out = renderIdentityPreamble(baseCtx());
    expect(out).toContain("[GOVERNANCE]");
    expect(out).toContain(
      "NEVER answer 'I have no information about this user' when identity context above is populated",
    );
    expect(out).toContain("External writes");
    expect(out).toContain("require approval");
  });
});

describe("renderIdentityPreamble -- partial state", () => {
  it("omits the org sentence when org.name is null but still names the viewer", () => {
    const out = renderIdentityPreamble(
      baseCtx({ org: { org_id: null, name: null, domain: null } }),
    );
    expect(out).toContain("You are talking to Sadeil");
    expect(out).not.toContain(" of NIOV Labs");
  });

  it("omits the twin sentence when twin.display_name is null", () => {
    const out = renderIdentityPreamble(
      baseCtx({ twin: { twin_id: null, display_name: null, active: false } }),
    );
    expect(out).not.toContain("Always speak as their Twin");
  });

  it("omits the projects line when projects is empty", () => {
    const out = renderIdentityPreamble(baseCtx({ projects: [] }));
    expect(out).not.toContain("Current project memberships:");
  });

  it("omits the email line when email is null", () => {
    const out = renderIdentityPreamble(
      baseCtx({
        viewer: {
          user_id: "viewer-1",
          email: null,
          display_name: "Sadeil",
          title: "FOUNDER",
          org_role: "FOUNDER",
          is_founder_admin: true,
        },
      }),
    );
    expect(out).not.toContain("Email:");
  });
});

describe("renderIdentityPreamble -- title humanization", () => {
  const cases: Array<[string, string]> = [
    ["FOUNDER", "Founder & CEO"],
    ["TECH LEAD", "Tech Lead"],
    ["AI UI ENGINEER", "AI UI Engineer"],
    ["AI/NLP ENGINEER", "AI/NLP Engineer"],
    ["GO-TO-MARKET LEAD", "Go-to-Market Lead"],
    ["PRODUCT LEAD", "Product Lead"],
    ["RISK & COMPLIANCE LEAD", "Risk & Compliance Lead"],
    ["MEDIA LEAD", "Media Lead"],
    ["MEMBER", "team member"],
  ];
  for (const [raw, humanized] of cases) {
    it(`humanizes "${raw}" -> "${humanized}"`, () => {
      const out = renderIdentityPreamble(
        baseCtx({
          viewer: {
            user_id: "v",
            email: null,
            display_name: "Test",
            title: raw,
            org_role: raw,
            is_founder_admin: false,
          },
        }),
      );
      expect(out).toContain(humanized);
    });
  }

  it("preserves casing for unrecognized titles", () => {
    const out = renderIdentityPreamble(
      baseCtx({
        viewer: {
          user_id: "v",
          email: null,
          display_name: "Test",
          title: "DEPUTY CHIEF OF STAFF",
          org_role: "DEPUTY CHIEF OF STAFF",
          is_founder_admin: false,
        },
      }),
    );
    expect(out).toContain("DEPUTY CHIEF OF STAFF");
  });
});

describe("renderIdentityPreamble -- multi-user parametricity (per Founder clarification 2026-06-10)", () => {
  // Per [FOUNDER-CLARIFICATION -- OTZAR MUST BE USER-SCOPED, NOT
  // SADEIL-HARDCODED]: the renderer MUST consume whatever viewer the
  // IdentityContext describes. These tests pass non-Sadeil contexts
  // and prove the output uses THEIR identity, not Sadeil's.

  function ctxFor(
    display_name: string,
    email: string,
    title: string,
    twinName: string,
  ): IdentityContext {
    return baseCtx({
      viewer: {
        user_id: `user-${email}`,
        email,
        display_name,
        title,
        org_role: title,
        is_founder_admin: title === "FOUNDER",
      },
      twin: { twin_id: `twin-${email}`, display_name: twinName, active: true },
      projects: [],
    });
  }

  // Identity-leak assertions are scoped to the [VIEWER IDENTITY]
  // half of the preamble. The [GOVERNANCE] half intentionally names
  // "Sadeil" + "David" once each inside the verbatim anti-assumption
  // guard ("do not assume Sadeil, do not assume David, do not assume
  // anyone") per Founder clarification 2026-06-10.
  function viewerHalf(out: string): string {
    return out.split("[GOVERNANCE]")[0] ?? "";
  }

  it("renders Sadeil correctly when given Sadeil context", () => {
    const out = renderIdentityPreamble(
      ctxFor("Sadeil Lewis", "sadeil@niovlabs.com", "FOUNDER", "Otzar"),
    );
    expect(out).toContain("Sadeil Lewis");
    expect(out).toContain("sadeil@niovlabs.com");
    expect(out).toContain("Founder & CEO");
    const vh = viewerHalf(out);
    expect(vh).not.toContain("David");
    expect(vh).not.toContain("Vishesh");
    expect(vh).not.toContain("Samiksha");
  });

  it("renders David correctly when given David context (NOT Sadeil)", () => {
    const out = renderIdentityPreamble(
      ctxFor("David Odie", "david@niovlabs.com", "TECH LEAD", "David's Twin"),
    );
    expect(out).toContain("David Odie");
    expect(out).toContain("david@niovlabs.com");
    expect(out).toContain("Tech Lead");
    expect(out).toContain('"David\'s Twin"');
    const vh = viewerHalf(out);
    expect(vh).not.toContain("Sadeil");
    expect(vh).not.toContain("Vishesh");
    expect(vh).not.toContain("Founder & CEO");
  });

  it("renders Vishesh correctly when given Vishesh context (NOT Sadeil, NOT David)", () => {
    const out = renderIdentityPreamble(
      ctxFor("Vishesh Kumar", "vishesh@niovlabs.com", "AI/NLP ENGINEER", "Vishesh's Twin"),
    );
    expect(out).toContain("Vishesh Kumar");
    expect(out).toContain("vishesh@niovlabs.com");
    expect(out).toContain("AI/NLP Engineer");
    const vh = viewerHalf(out);
    expect(vh).not.toContain("Sadeil");
    expect(vh).not.toContain("David");
  });

  it("renders Samiksha correctly when given Samiksha context", () => {
    const out = renderIdentityPreamble(
      ctxFor("Samiksha", "samiksha@niovlabs.com", "AI UI ENGINEER", "Samiksha's Twin"),
    );
    expect(out).toContain("Samiksha");
    expect(out).toContain("samiksha@niovlabs.com");
    expect(out).toContain("AI UI Engineer");
    const vh = viewerHalf(out);
    expect(vh).not.toContain("Sadeil");
    expect(vh).not.toContain("David");
  });

  it("[GOVERNANCE] block bans assuming Sadeil/David/anyone as default viewer (session-agnostic LLM guard)", () => {
    const out = renderIdentityPreamble(
      ctxFor("Annie", "annie@niovlabs.com", "RISK & COMPLIANCE LEAD", "Annie's Twin"),
    );
    expect(out).toContain("Do not assume the viewer is any specific person");
    expect(out).toContain("do not assume Sadeil");
    expect(out).toContain("do not assume David");
    expect(out).toContain("Do not answer as a public chatbot");
    expect(out).toContain(
      "do not expose one viewer's private data to another viewer",
    );
  });

  it("never hardcodes any user name into the [GOVERNANCE] block beyond the explicit anti-assumption guard", () => {
    // Pass an UNKNOWN persona and verify no Sadeil/David/Vishesh
    // names leak through from the renderer itself.
    const out = renderIdentityPreamble(
      ctxFor("Walter Carter", "walter@niovlabs.com", "MEMBER", "Walter's Twin"),
    );
    expect(out).toContain("Walter Carter");
    // The only Sadeil/David appearances should be in the
    // anti-assumption guard line, NOT in the viewer identity block.
    const viewerBlock = out.split("[GOVERNANCE]")[0] ?? "";
    expect(viewerBlock).not.toContain("Sadeil");
    expect(viewerBlock).not.toContain("David");
    expect(viewerBlock).not.toContain("Vishesh");
    expect(viewerBlock).not.toContain("Samiksha");
  });
});

describe("renderIdentityPreamble -- unconfigured viewer (wiring-gap copy)", () => {
  it("returns the UNCONFIGURED_PREAMBLE when display_name is the 'Unknown viewer' sentinel", () => {
    const ctx = baseCtx({
      viewer: {
        user_id: "u",
        email: null,
        display_name: "Unknown viewer",
        title: "MEMBER",
        org_role: "MEMBER",
        is_founder_admin: false,
      },
    });
    expect(renderIdentityPreamble(ctx)).toBe(UNCONFIGURED_PREAMBLE);
  });

  it("wiring-gap preamble surfaces the exact operator-readable failure copy", () => {
    expect(UNCONFIGURED_PREAMBLE).toContain(
      "Authenticated identity context was NOT provided by the backend",
    );
    expect(UNCONFIGURED_PREAMBLE).toContain(
      "I am connected to Otzar, but the backend did not provide authenticated identity context",
    );
    expect(UNCONFIGURED_PREAMBLE).toContain("Do NOT guess");
    expect(UNCONFIGURED_PREAMBLE).toContain(
      "Do NOT assume the viewer is any specific person",
    );
  });

  it("wiring-gap preamble does NOT name any specific user", () => {
    expect(UNCONFIGURED_PREAMBLE).not.toContain("Sadeil");
    expect(UNCONFIGURED_PREAMBLE).not.toContain("David");
    expect(UNCONFIGURED_PREAMBLE).not.toContain("Vishesh");
    expect(UNCONFIGURED_PREAMBLE).not.toContain("Samiksha");
  });
});

describe("renderIdentityPreamble -- Phase 1207 [ACTION DRAFTING DISCIPLINE]", () => {
  // Per [FOUNDER-AUTH -- REDUCE OTZAR QUESTION FRICTION /
  // CONTEXT-FIRST ACTION DRAFTING]: the LLM was answering
  // "Send David a note..." with a 4-question clarification cascade.
  // The preamble must (a) surface the org roster so the LLM has the
  // facts to resolve "David" -> "David Odie", and (b) include an
  // explicit infer-first / draft-first / ask-only-on-real-ambiguity
  // discipline block.

  function rosterPeer(
    name: string,
    title: string,
    shared = 0,
    collab = 0,
    email: string | null = null,
  ): IdentityContext["org_roster"][number] {
    return {
      entity_id: `id-${name.toLowerCase().replace(/\s+/g, "-")}`,
      display_name: name,
      email: email ?? `${name.split(" ")[0]?.toLowerCase()}@niovlabs.com`,
      title,
      shared_project_count: shared,
      recent_collab_count: collab,
    };
  }

  it("emits an [ORG ROSTER] block when peers exist", () => {
    const out = renderIdentityPreamble(
      baseCtx({
        org_roster: [
          rosterPeer("David Odie", "TECH LEAD", 3, 5),
          rosterPeer("Vishesh Sharma", "AI UI ENGINEER", 2, 1),
        ],
      }),
    );
    expect(out).toContain("[ORG ROSTER]");
    expect(out).toContain("David Odie <david@niovlabs.com>");
    expect(out).toContain("Tech Lead");
    expect(out).toContain("Vishesh Sharma");
    expect(out).toContain("AI UI Engineer");
  });

  it("omits the rendered roster bullet list when org_roster is empty (governance block may still reference [ORG ROSTER])", () => {
    const out = renderIdentityPreamble(baseCtx({ org_roster: [] }));
    // The discipline block legitimately CITES "[ORG ROSTER]" as the
    // table the LLM should consult. What must NOT appear is the
    // actual bullet-list output (which starts with "  - ").
    expect(out).not.toMatch(/\[ORG ROSTER\]\n {2}- /);
  });

  it("sorts roster by (shared_project_count DESC, recent_collab_count DESC, name ASC)", () => {
    const out = renderIdentityPreamble(
      baseCtx({
        org_roster: [
          rosterPeer("Annie", "RISK & COMPLIANCE LEAD", 0, 0),
          rosterPeer("David Odie", "TECH LEAD", 3, 5),
          rosterPeer("Walter", "MEDIA LEAD", 1, 0),
          rosterPeer("Vishesh", "AI UI ENGINEER", 2, 1),
        ],
      }),
    );
    const davidIdx = out.indexOf("David Odie");
    const visheshIdx = out.indexOf("Vishesh");
    const walterIdx = out.indexOf("Walter");
    const annieIdx = out.indexOf("Annie");
    expect(davidIdx).toBeGreaterThan(-1);
    expect(davidIdx).toBeLessThan(visheshIdx);
    expect(visheshIdx).toBeLessThan(walterIdx);
    expect(walterIdx).toBeLessThan(annieIdx);
  });

  it("surfaces shared_project + recent_collab signals so the LLM can disambiguate", () => {
    const out = renderIdentityPreamble(
      baseCtx({
        org_roster: [rosterPeer("David Odie", "TECH LEAD", 3, 5)],
      }),
    );
    expect(out).toContain("3 shared projects");
    expect(out).toContain("5 recent collaborations");
  });

  it("singularizes the signal labels for count of 1", () => {
    const out = renderIdentityPreamble(
      baseCtx({
        org_roster: [rosterPeer("David Odie", "TECH LEAD", 1, 1)],
      }),
    );
    expect(out).toContain("1 shared project,");
    expect(out).toContain("1 recent collaboration");
  });

  it("preamble includes the explicit [ACTION DRAFTING DISCIPLINE] block", () => {
    const out = renderIdentityPreamble(baseCtx());
    expect(out).toContain("[ACTION DRAFTING DISCIPLINE]");
  });

  it("discipline block explicitly bans the multi-question clarification cascade", () => {
    const out = renderIdentityPreamble(baseCtx());
    // The exact regression we're closing: "which David / which channel / what tone"
    // questionnaire in response to a simple "send David a note" intent.
    expect(out).toContain("INFER FIRST, DRAFT FIRST, ASK ONLY ON REAL AMBIGUITY");
    expect(out).toMatch(/FORBIDDEN: asking multiple clarification questions/i);
    expect(out).toMatch(/never a questionnaire/i);
  });

  it("discipline block instructs the LLM to resolve target via [ORG ROSTER] using shared_project + recent_collab tiebreak", () => {
    const out = renderIdentityPreamble(baseCtx());
    expect(out).toMatch(/use \[ORG ROSTER\]/i);
    expect(out).toContain("shared_project_count");
    expect(out).toContain("recent_collab_count");
  });

  it("discipline block instructs the LLM to default channel = internal Otzar proposed-action / internal note (not ask)", () => {
    const out = renderIdentityPreamble(baseCtx());
    expect(out).toMatch(/default to an internal Otzar proposed-action/i);
    expect(out).toMatch(/Do not ask which channel first/i);
  });

  it("discipline block instructs the LLM to default tone = direct but professional (not ask)", () => {
    const out = renderIdentityPreamble(baseCtx());
    expect(out).toMatch(/default to direct but professional/i);
    expect(out).toMatch(/Do not ask which tone first/i);
  });

  it("discipline block preserves the approval gate (never send without approval)", () => {
    const out = renderIdentityPreamble(baseCtx());
    expect(out).toMatch(/never send/i);
    expect(out).toMatch(/never create an external write without explicit approval/i);
  });

  it("discipline block prescribes the EXACT 'I found / I drafted / Send this to' canonical response shape", () => {
    const out = renderIdentityPreamble(baseCtx());
    expect(out).toContain("I found");
    expect(out).toContain("I drafted");
    expect(out).toContain("I will not send it until you approve");
    expect(out).toContain("Send this to");
  });

  it("never leaks raw TAR / wallet / capsule data through the roster (privacy invariant)", () => {
    const out = renderIdentityPreamble(
      baseCtx({
        org_roster: [rosterPeer("David Odie", "TECH LEAD", 3, 5)],
      }),
    );
    expect(out).not.toMatch(/tar[_-]?hash/i);
    expect(out).not.toMatch(/wallet[_-]?id/i);
    expect(out).not.toMatch(/capsule[_-]?id/i);
    expect(out).not.toMatch(/can_admin/i);
    expect(out).not.toMatch(/clearance_ceiling/i);
  });
});

describe("renderIdentityPreamble -- privacy invariants (Wave 1205)", () => {
  it("never emits raw memory text, raw transcripts, or vectors", () => {
    const out = renderIdentityPreamble(baseCtx());
    expect(out).not.toMatch(/transcript[_-]?body/i);
    expect(out).not.toMatch(/payload[_-]?content/i);
    expect(out).not.toMatch(/embedding/i);
    expect(out).not.toMatch(/vector/i);
  });

  it("never emits TAR hash, session token, or password material", () => {
    const out = renderIdentityPreamble(baseCtx());
    expect(out).not.toMatch(/password/i);
    expect(out).not.toMatch(/session[_-]?token/i);
    expect(out).not.toMatch(/tar[_-]?hash/i);
    expect(out).not.toMatch(/bearer/i);
  });

  it("never emits clearance ceilings, permission_ids, bridge ids, or grant ids", () => {
    const out = renderIdentityPreamble(baseCtx());
    expect(out).not.toMatch(/clearance[_-]?ceiling/i);
    expect(out).not.toMatch(/permission[_-]?id/i);
    expect(out).not.toMatch(/bridge[_-]?id/i);
    expect(out).not.toMatch(/grant[_-]?id/i);
  });

  it("surfaces counts only -- never the underlying payload_summary text", () => {
    const out = renderIdentityPreamble(baseCtx());
    expect(out).not.toMatch(/\[TRANSCRIPT-FATHOM\]/);
  });
});
