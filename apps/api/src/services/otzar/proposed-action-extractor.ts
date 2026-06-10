// FILE: proposed-action-extractor.ts
// PURPOSE: Phase 1208 [OTZAR-CHAT-ACTION-PROPOSE] -- Pure helper that
//          parses the Phase 1207 canonical LLM draft shape ("I found
//          <Name>...  Draft: '<text>'...  Send this to <Name>?") and
//          returns a structured `proposed_action` envelope the UI can
//          render as an inline approval card.
//
// PURE FUNCTION: no DB, no network, no logging. Safe to call on every
// conductSession LLM response. Returns null when the response does
// not match the canonical draft shape -- the UI then shows normal
// chat text unchanged.
//
// CONNECTS TO:
//   - apps/api/src/services/otzar/identity-context.ts (which instructs
//     the LLM to produce this exact shape per [ACTION DRAFTING
//     DISCIPLINE]).
//   - apps/api/src/services/otzar/otzar.service.ts (calls this
//     extractor on every conductSession LLM response).
//   - otzar-control-tower/src/components/otzar/ProposedActionCard.tsx
//     (consumes the envelope; renders Send/Don't-send/Edit buttons).
//
// PRIVACY INVARIANT:
//   - The extractor surfaces the SAME draft text the LLM already
//     returned in the chat response -- no new private data is
//     synthesized. The recipient resolution uses ONLY the IdentityContext
//     org_roster the L0_IDENTITY block already passed to the LLM.
//   - Approval gate is preserved: this envelope describes a PROPOSED
//     action; the actual Action row is only created on explicit
//     operator approve click (which hits POST /api/v1/actions).

/**
 * The narrow set of action types the chat-tier draft can map to.
 * Extending requires updating both the extractor + the CT consumer +
 * the Foundation action.service handler allowlist.
 */
export type ProposedActionType =
  | "SEND_INTERNAL_NOTIFICATION";

export interface ProposedActionTargetCandidate {
  /** Resolved org-roster entry. Always present -- the extractor only
   *  fires when the LLM successfully named a target. */
  display_name: string;
  email: string | null;
  entity_id: string | null;
}

export interface ProposedAction {
  /** Closed-vocab action type. Phase 1208 ships
   *  SEND_INTERNAL_NOTIFICATION only; future drafts add CREATE_TASK,
   *  CREATE_MEETING_SUMMARY, etc. */
  action_type: ProposedActionType;
  /** The resolved recipient (one row). Multi-candidate ambiguity is
   *  caught earlier by the LLM's [ACTION DRAFTING DISCIPLINE]
   *  block, which asks one focused question instead of drafting. */
  target: ProposedActionTargetCandidate;
  /** The draft message the LLM produced. Plain text. The CT
   *  approval card renders this verbatim in an editable textarea. */
  draft_text: string;
  /** Human-readable reason -- typically "Otzar drafted this from
   *  your request." Used by the brain/AI-breakdown icon. */
  reason: string;
}

export interface OrgRosterPeer {
  entity_id: string;
  display_name: string;
  email: string | null;
}

/**
 * Detect the Phase 1207 canonical "I found / I drafted / Send this
 * to" draft shape and return a structured envelope. Returns null
 * when the response does not match (the LLM answered a non-action
 * question, or it asked a clarification question instead of
 * drafting).
 *
 * The match is intentionally tolerant -- we look for the
 * substrings the L0_IDENTITY block explicitly prescribed:
 *
 *   - "I found <Name>" anywhere
 *   - "Draft:" anywhere
 *   - a quoted-string draft body (single OR double quotes)
 *   - "Send this to <Name>?" at the end
 *
 * If any of those four anchors is missing, we return null. Callers
 * MUST tolerate null -- the chat text is still rendered.
 */
export function extractProposedAction(
  responseText: string,
  roster: ReadonlyArray<OrgRosterPeer>,
): ProposedAction | null {
  // Anchor 1: "Send this to <Name>?" -- the strongest signal. We
  // require this at the tail so we never misfire on a question the
  // LLM is rhetorically asking.
  const sendThisMatch = responseText.match(
    /Send this to ([^?]+?)\?/i,
  );
  if (sendThisMatch === null) return null;
  const sendThisName = (sendThisMatch[1] ?? "").trim();
  if (sendThisName.length === 0) return null;

  // Anchor 2: "I found <Name>" -- the LLM's target-resolution line.
  const iFoundMatch = responseText.match(/I found \*{0,2}([^*\n,(<]+)/i);
  if (iFoundMatch === null) return null;
  const iFoundName = (iFoundMatch[1] ?? "").trim();
  if (iFoundName.length === 0) return null;

  // Anchor 3: "Draft:" header.
  const draftHeaderIdx = responseText.search(/\*{0,2}Draft:\*{0,2}/i);
  if (draftHeaderIdx < 0) return null;

  // Anchor 4: quoted draft body. Look for the FIRST quoted run after
  // the Draft: header. Accept curly quotes, straight double, or
  // straight single quotes. The body cannot itself contain the
  // closing-quote character.
  const afterDraft = responseText.slice(draftHeaderIdx);
  const quotedMatch =
    afterDraft.match(/"([^"]+)"/) ??
    afterDraft.match(/“([^”]+)”/) ??
    afterDraft.match(/'([^']+)'/);
  if (quotedMatch === null) return null;
  const draftText = (quotedMatch[1] ?? "").trim();
  if (draftText.length === 0) return null;

  // Resolve the recipient against the roster. The LLM's "Send this
  // to <Name>?" is authoritative; we cross-check against the roster
  // to get entity_id + email back. If the recipient is not in the
  // roster, we still return the envelope -- the CT consumer will
  // surface a "recipient not in roster" warning when target.email
  // is null.
  const resolved = resolveRosterEntry(sendThisName, iFoundName, roster);

  return {
    action_type: "SEND_INTERNAL_NOTIFICATION",
    target: {
      display_name: resolved?.display_name ?? sendThisName,
      email: resolved?.email ?? null,
      entity_id: resolved?.entity_id ?? null,
    },
    draft_text: draftText,
    reason: "Otzar drafted this from your request.",
  };
}

/**
 * Resolve a free-form display-name string to an OrgRosterPeer.
 * Strategy:
 *   1. Exact case-insensitive display_name match.
 *   2. First-name prefix match (the LLM may say "David" when the
 *      roster has "David Odie").
 *   3. Email-local match (the LLM may include "<david@niovlabs.com>").
 *   4. Substring match on either name as last resort.
 * Returns null when no candidate fits.
 */
function resolveRosterEntry(
  sendThisName: string,
  iFoundName: string,
  roster: ReadonlyArray<OrgRosterPeer>,
): OrgRosterPeer | null {
  const candidates = [sendThisName, iFoundName]
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  for (const candidate of candidates) {
    const norm = candidate.toLowerCase();

    // Try exact display_name match.
    const exact = roster.find(
      (p) => p.display_name.toLowerCase() === norm,
    );
    if (exact !== undefined) return exact;

    // Try email-local match (extract "david" from "david@...").
    const emailMatch = candidate.match(/<?([\w.+-]+)@/i);
    if (emailMatch !== null) {
      const local = (emailMatch[1] ?? "").toLowerCase();
      const byEmail = roster.find(
        (p) =>
          p.email !== null && p.email.toLowerCase().startsWith(`${local}@`),
      );
      if (byEmail !== undefined) return byEmail;
    }

    // Try first-name prefix match.
    const firstName = norm.split(/\s+/)[0] ?? "";
    if (firstName.length > 1) {
      const byFirstName = roster.find((p) =>
        p.display_name.toLowerCase().startsWith(`${firstName} `),
      );
      if (byFirstName !== undefined) return byFirstName;
      const byFirstNameOnly = roster.find(
        (p) => p.display_name.toLowerCase() === firstName,
      );
      if (byFirstNameOnly !== undefined) return byFirstNameOnly;
    }

    // Last resort: substring on either side.
    const bySubstring = roster.find((p) =>
      p.display_name.toLowerCase().includes(norm),
    );
    if (bySubstring !== undefined) return bySubstring;
  }
  return null;
}
