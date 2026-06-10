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
