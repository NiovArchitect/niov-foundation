// FILE: queries/otzar-obligation-validation.ts
// PURPOSE: [OTZAR STAGE-2 HARDENING D+H] Canonical runtime allowlists + type guards for every
//          obligation enum-like field (replace blind `as never` casts), and one recursive
//          safe-JSON validator for structured obligation content (details / completion_evidence /
//          reassignment metadata). Enforcement, not comments: unknown enum → caller returns 422;
//          a forbidden/oversized JSON shape → caller rejects before persistence.
// SAFETY: the safe-JSON validator prevents OPERATIONAL SECRET LEAKAGE into stored/audited JSON.
//          It is NOT a substitute for patient/PHI authorization (that is a separate control).
// CONNECTS TO: otzar-obligations.ts (intake + transitions), otzar.service.ts, otzar.routes.ts.

import type { ObligationType, ObligationState } from "./otzar-obligations.js";

// ── Canonical allowlists (kept in sync with the service-tier unions via `satisfies`) ──────────

export const OBLIGATION_TYPES = [
  "QUESTION_RESPONSE", "ACTION_CONFIRMATION", "FOLLOW_UP", "BLOCKED_TASK",
  "CLARIFICATION", "SAFETY_CONCERN", "HANDOFF", "ESCALATION_ACK", "PROVIDER_REVIEW",
] as const satisfies readonly ObligationType[];

export const OBLIGATION_STATES = [
  "OPEN", "AWAITING_RESPONSE", "ACKNOWLEDGED", "IN_PROGRESS", "BLOCKED",
  "ESCALATED", "COMPLETED", "CANCELLED", "SUPERSEDED", "EXPIRED",
] as const satisfies readonly ObligationState[];

/** States a client may NOT create an obligation directly in — only an internal governed
 *  projection/repair path may seed a terminal state. */
export const TERMINAL_STATES = ["COMPLETED", "CANCELLED", "SUPERSEDED", "EXPIRED"] as const;

export const OBLIGATION_PRIORITIES = ["ROUTINE", "ELEVATED", "URGENT", "CRITICAL"] as const;
export const REQUIRED_RESPONSE_CLASSES = ["CONFIRMATION", "ANSWER", "ACK", "COMPLETION", "REVIEW"] as const;
export const SOURCE_CHANNELS = ["CHAT", "VOICE", "AMBIENT", "SYSTEM"] as const;
export const PROVENANCE_CLASSES = ["CONVERSATION", "PROVIDER", "INBOUND_SIGNAL", "SYSTEM"] as const;
export const VISIBILITY_SCOPES = ["SUBJECT", "TEAM", "ORG"] as const;

const asSet = (xs: readonly string[]): ReadonlySet<string> => new Set(xs);
const TYPE_SET = asSet(OBLIGATION_TYPES);
const STATE_SET = asSet(OBLIGATION_STATES);
const TERMINAL_SET = asSet(TERMINAL_STATES);
const PRIORITY_SET = asSet(OBLIGATION_PRIORITIES);
const RRC_SET = asSet(REQUIRED_RESPONSE_CLASSES);
const CHANNEL_SET = asSet(SOURCE_CHANNELS);
const PROVENANCE_SET = asSet(PROVENANCE_CLASSES);
const VISIBILITY_SET = asSet(VISIBILITY_SCOPES);

export const isObligationType = (v: unknown): v is ObligationType => typeof v === "string" && TYPE_SET.has(v);
export const isObligationState = (v: unknown): v is ObligationState => typeof v === "string" && STATE_SET.has(v);
export const isTerminalState = (v: string): boolean => TERMINAL_SET.has(v);
export const isObligationPriority = (v: unknown): boolean => typeof v === "string" && PRIORITY_SET.has(v);
export const isRequiredResponseClass = (v: unknown): boolean => typeof v === "string" && RRC_SET.has(v);
export const isSourceChannel = (v: unknown): boolean => typeof v === "string" && CHANNEL_SET.has(v);
export const isProvenanceClass = (v: unknown): boolean => typeof v === "string" && PROVENANCE_SET.has(v);
export const isVisibilityScope = (v: unknown): boolean => typeof v === "string" && VISIBILITY_SET.has(v);

// ── Recursive safe-JSON validator (H) ─────────────────────────────────────────────────────────

export interface SafeJsonLimits {
  maxDepth: number;
  maxKeys: number; // total keys across the whole structure
  maxStringLength: number; // per-string ceiling
  maxSerializedBytes: number; // total JSON size ceiling
}

export const DEFAULT_SAFE_JSON_LIMITS: SafeJsonLimits = {
  maxDepth: 6,
  maxKeys: 200,
  maxStringLength: 4000,
  maxSerializedBytes: 16_384,
};

// Keys (at any nesting depth) that indicate an operational secret / raw provider surface and
// must never be stored in obligation JSON. Matched case-insensitively as substrings.
const FORBIDDEN_KEY_PATTERNS: readonly RegExp[] = [
  /passw/i, // password, passwd, passwords, …
  /secret/i,
  /token/i, // substring: catches access_token, oauth_token, api_token, refresh_token, …
  /authorization/i,
  /cookie/i,
  /api[_-]?key/i,
  /oauth/i,
  /private[_-]?key/i,
  /sealed/i,
  /raw[_-]?(response|payload|body|request|error)/i,
  /provider[_-]?raw/i,
  /stack[_-]?trace/i,
  /(database|db)[_-]?url/i,
  /connection[_-]?string/i,
  /bearer/i,
];

export type SafeJsonResult = { ok: true } | { ok: false; reason: string };

/**
 * Validate a structured value is safe to persist as obligation JSON: no forbidden secret-bearing
 * keys at any depth, and within depth/key-count/string-length/total-size limits. Rejects
 * NON-plain values (functions, bigint) too. Prevents secret LEAKAGE only — not a PHI control.
 */
export function validateSafeJson(value: unknown, limits: SafeJsonLimits = DEFAULT_SAFE_JSON_LIMITS): SafeJsonResult {
  let keyCount = 0;

  const walk = (node: unknown, depth: number): string | null => {
    if (depth > limits.maxDepth) return `nesting deeper than ${limits.maxDepth}`;
    if (node === null) return null;
    const t = typeof node;
    if (t === "string") {
      return (node as string).length > limits.maxStringLength ? `string longer than ${limits.maxStringLength}` : null;
    }
    if (t === "number" || t === "boolean") return null;
    if (t === "bigint" || t === "function" || t === "symbol" || t === "undefined") return `unsupported value type: ${t}`;
    if (Array.isArray(node)) {
      for (const item of node) {
        const err = walk(item, depth + 1);
        if (err !== null) return err;
      }
      return null;
    }
    if (t === "object") {
      // Reject non-plain objects (Date/Map/etc.) — only plain JSON objects are allowed.
      const proto = Object.getPrototypeOf(node);
      if (proto !== Object.prototype && proto !== null) return "non-plain object";
      for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
        keyCount += 1;
        if (keyCount > limits.maxKeys) return `more than ${limits.maxKeys} keys`;
        for (const pat of FORBIDDEN_KEY_PATTERNS) {
          if (pat.test(key)) return `forbidden key: ${key}`;
        }
        const err = walk(child, depth + 1);
        if (err !== null) return err;
      }
      return null;
    }
    return `unsupported value type: ${t}`;
  };

  const err = walk(value, 0);
  if (err !== null) return { ok: false, reason: err };

  // Total serialized-size ceiling (after structural checks).
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return { ok: false, reason: "not serializable" };
  }
  if (Buffer.byteLength(serialized, "utf8") > limits.maxSerializedBytes) {
    return { ok: false, reason: `serialized JSON larger than ${limits.maxSerializedBytes} bytes` };
  }
  return { ok: true };
}
