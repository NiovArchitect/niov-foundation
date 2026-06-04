// FILE: approval-detection.ts
// PURPOSE: Phase EDX-4 PR 4 — pure-function approval detection for
//          ConductSession per the [FOUNDER-AUTH — AUTONOMOUS EMPLOYEE
//          DGI STRUCTURAL RUNTIME COMPLETION / NO MORE SIDECAR-ONLY
//          DRIFT] directive. Conservative deterministic verb-scan
//          over the caller's chat message — when the message clearly
//          intends a material action (send / email / post / schedule
//          / delete / approve / share / …), surface
//          `approval_required: true` + a closed-vocab `approval_reason`
//          + a closed-vocab `approval_duration_options` array so the
//          UI can render the right "this will need approval" panel
//          and the user can choose how long to grant authority for.
//
//          ConservativeNES: we never auto-create a TwinAuthorityGrant
//          or auto-execute an action from the chat surface. The
//          detection only FLIPS the EDX-3 envelope booleans + supplies
//          the closed-vocab metadata. Granting authority and executing
//          actions stay on their explicit substrate (PR #270 routes +
//          Section 2 Action runtime).
//
// PRIVACY INVARIANT:
//   - Pure over the already-permitted message string. No DB, no LLM,
//     no chain-of-thought, no external call.
//   - The matched-verb list is INTERNAL to this helper and is NEVER
//     returned to the caller — only the closed-vocab reason +
//     duration_options surface.
//
// CONNECTS TO:
//   - apps/api/src/services/otzar/otzar.service.ts (conductSession
//     consumes the detection result alongside the EDX-3 envelope)
//   - apps/api/src/services/otzar/twin-authority-grant.service.ts
//     (the duration_options array is a strict subset of
//     TwinAuthorityDurationClass values; the UI offers these as
//     the choices when the user opts to grant authority)

import type { TwinAuthorityDurationClass } from "@prisma/client";

// WHAT: Closed-vocab reason the response flagged approval_required.
// INPUT: Used as a value / return type.
// OUTPUT: None.
// WHY: Per the directive vocab. Each value names a specific class
//      of intent the chat surface detected; never carries free-form
//      text. ConductSession surfaces this value on the success
//      response so the UI can render a calm "Approval needed:
//      external write to Slack" rather than guessing.
export type ApprovalReason =
  | "EXTERNAL_WRITE"
  | "SENSITIVE_CONTEXT"
  | "CONNECTOR_ACCESS"
  | "CROSS_TEAM_REQUEST"
  | "CROSS_PROJECT_REQUEST"
  | "POLICY_REQUIRES_APPROVAL"
  | "DUAL_CONTROL_REQUIRED"
  | "LONG_TERM_AUTHORITY"
  | "INDEFINITE_AUTHORITY";

// WHAT: Detection result discriminated by `approval_required`.
// INPUT: Used as a return type.
// OUTPUT: None.
// WHY: Caller can `if (result.approval_required) { … }` to switch
//      on the contract.
export type ApprovalDetectionResult =
  | { approval_required: false }
  | {
      approval_required: true;
      approval_reason: ApprovalReason;
      approval_duration_options: ReadonlyArray<TwinAuthorityDurationClass>;
    };

// WHAT: Verbs that imply an EXTERNAL_WRITE intent (the message asks
//        the Twin to send a message / post / schedule something
//        outside the system).
// WHY: Conservative bias — false positives are recoverable (the user
//      sees an approval card they can dismiss); a missed write would
//      mean an AI action firing without consent.
const EXTERNAL_WRITE_VERBS: ReadonlyArray<string> = [
  "send",
  "email",
  "mail",
  "post",
  "tweet",
  "publish",
  "submit",
  "schedule",
  "book",
  "create ticket",
  "open ticket",
  "file ticket",
  "create issue",
  "open issue",
  "share",
  "forward",
  "broadcast",
];

// WHAT: Verbs that imply SENSITIVE_CONTEXT (destructive or
//        irreversible operations).
const SENSITIVE_VERBS: ReadonlyArray<string> = [
  "delete",
  "remove",
  "wipe",
  "purge",
  "cancel",
  "revoke",
  "approve",
  "deny",
  "reject",
  "terminate",
  "fire",
  "release",
  "transfer funds",
  "send payment",
];

// WHAT: Verbs that imply CONNECTOR_ACCESS — the message names a
//        downstream tool by name (Slack, Gmail, Linear, …) or asks
//        the Twin to use a connector.
const CONNECTOR_KEYWORDS: ReadonlyArray<string> = [
  "slack",
  "gmail",
  "google calendar",
  "google meet",
  "google drive",
  "outlook",
  "teams",
  "microsoft teams",
  "zoom",
  "linear",
  "jira",
  "github",
  "github issue",
  "salesforce",
  "hubspot",
  "asana",
  "notion",
  "trello",
];

// WHAT: Phrases that imply CROSS_TEAM_REQUEST.
const CROSS_TEAM_PHRASES: ReadonlyArray<string> = [
  "ask another team",
  "loop in another team",
  "loop in engineering",
  "loop in product",
  "loop in legal",
  "loop in finance",
  "loop in security",
  "loop in marketing",
  "loop in sales",
  "loop in design",
  "loop in support",
  "handoff to",
  "hand off to",
];

// WHAT: Phrases that imply CROSS_PROJECT_REQUEST.
const CROSS_PROJECT_PHRASES: ReadonlyArray<string> = [
  "another project",
  "different project",
  "across projects",
  "from the other project",
  "move to project",
];

function containsAny(
  haystack: string,
  needles: ReadonlyArray<string>,
): boolean {
  for (const n of needles) {
    if (haystack.includes(n)) return true;
  }
  return false;
}

function containsVerbWord(
  haystack: string,
  verbs: ReadonlyArray<string>,
): boolean {
  // Match the verb either as a standalone word or as a multi-word
  // phrase ("create ticket"). For single-word verbs we use a word-
  // boundary check; for multi-word phrases we fall back to plain
  // includes.
  for (const v of verbs) {
    if (v.includes(" ")) {
      if (haystack.includes(v)) return true;
    } else {
      const re = new RegExp(`\\b${v}\\b`);
      if (re.test(haystack)) return true;
    }
  }
  return false;
}

// WHAT: Run the detection over a caller message.
// INPUT: The raw user message (already permitted by the auth gate
//        upstream).
// OUTPUT: ApprovalDetectionResult.
// WHY: Conservative deterministic verb-scan. Priority (first match
//      wins) is:
//        1. CONNECTOR_ACCESS    — naming a downstream tool is the
//                                 strongest signal.
//        2. SENSITIVE_CONTEXT   — destructive/irreversible verbs.
//        3. EXTERNAL_WRITE      — outbound communication verbs.
//        4. CROSS_TEAM_REQUEST  — coordination across teams.
//        5. CROSS_PROJECT_REQUEST — coordination across projects.
//      The duration_options the UI offers depends on the reason —
//      destructive / sensitive actions only offer
//      SENSITIVE_CASE_BY_CASE + ONE_TIME (never LONG_TERM); external
//      writes offer the standard ad-hoc trio (ONE_TIME / SESSION /
//      SHORT_TERM). The CLOSED_VOCAB is intentional: future EDX-4
//      slices may refine the bias, but they must keep the union
//      stable so consumers can switch on it.
export function detectApprovalRequirement(
  message: string,
): ApprovalDetectionResult {
  if (typeof message !== "string" || message.length === 0) {
    return { approval_required: false };
  }
  const lower = message.toLowerCase();

  if (containsAny(lower, CONNECTOR_KEYWORDS)) {
    return {
      approval_required: true,
      approval_reason: "CONNECTOR_ACCESS",
      approval_duration_options: [
        "ONE_TIME",
        "SESSION",
        "SHORT_TERM",
        "SENSITIVE_CASE_BY_CASE",
      ],
    };
  }

  if (containsVerbWord(lower, SENSITIVE_VERBS)) {
    return {
      approval_required: true,
      approval_reason: "SENSITIVE_CONTEXT",
      approval_duration_options: ["SENSITIVE_CASE_BY_CASE", "ONE_TIME"],
    };
  }

  if (containsVerbWord(lower, EXTERNAL_WRITE_VERBS)) {
    return {
      approval_required: true,
      approval_reason: "EXTERNAL_WRITE",
      approval_duration_options: ["ONE_TIME", "SESSION", "SHORT_TERM"],
    };
  }

  if (containsAny(lower, CROSS_TEAM_PHRASES)) {
    return {
      approval_required: true,
      approval_reason: "CROSS_TEAM_REQUEST",
      approval_duration_options: [
        "ONE_TIME",
        "SESSION",
        "PROJECT_SCOPED",
      ],
    };
  }

  if (containsAny(lower, CROSS_PROJECT_PHRASES)) {
    return {
      approval_required: true,
      approval_reason: "CROSS_PROJECT_REQUEST",
      approval_duration_options: [
        "ONE_TIME",
        "PROJECT_SCOPED",
        "SHORT_TERM",
      ],
    };
  }

  return { approval_required: false };
}
