// FILE: no-leak-guard.test.ts (unit)
// PURPOSE: ⭐ CI no-leak guard — ADR-0057 §16 step 2 ⭐
//          Static-scan anchor that asserts zero forbidden response/audit-
//          safe leak tokens appear as object property keys inside the
//          Foundation's response-construction and audit-details-construction
//          surfaces. The same precedent as the RULE 16 no-console anchor
//          (tests/unit/no-console-in-api-src.test.ts): a runtime invariant
//          test rather than a static lint rule, with per-line failure
//          reporting so the fix is mechanical.
//
//          The guard lands BEFORE Section 2 Autonomous Execution Core
//          schema/code work begins, per ADR-0057 §16 step 2 build sequence
//          ordering. It pre-arms CI for the 10 NEW ACTION_* audit literals
//          and the 7 future /actions/* routes documented in ADR-0057 §9 +
//          §10 — any new emitter or route adding a forbidden field as an
//          object property key will fail this anchor before merge.
//
// CONNECTS TO:
//   - ADR-0057 §10 (safe-details allowlist + 13-item forbidden-details list)
//   - ADR-0026 §6 (Phase E candidate-pool non-leak + DUAL_CONTROL_NO_APPROVER_AVAILABLE
//     safe-details shape)
//   - ADR-0050 §Amendment 1 §Break-glass framing preserved (justification
//     never returned in response body)
//   - ADR-0036 (REGULATOR + LawfulBasis audit-chain extension precedent;
//     audit-details discipline)
//   - ADR-0051 + ADR-0054 + ADR-0055 (Otzar mapper-tier safe-projection
//     precedent — projectXxxView / projectXxxResult functions strip
//     forbidden fields by construction)
//   - .husky/pre-commit (the hook runs this guard after the RULE 16
//     no-console anchor)
//   - package.json (the `test:no-leak` script wraps this test)
//   - tests/unit/no-console-in-api-src.test.ts (the parallel runtime-
//     invariant anchor pattern this guard mirrors)
//
// SCAN ROOTS (focused; output-shape-only surfaces):
//   - apps/api/src/routes/**/*.ts          (response construction)
//   - apps/api/src/middleware/**/*.ts      (audit-details construction)
//   - apps/api/src/security/**/*.ts        (privileged-endpoints registry)
//   - apps/api/src/services/otzar/transparency.ts
//   - apps/api/src/services/otzar/conversation-detail.ts
//   - apps/api/src/services/otzar/conversation-corrections.ts
//   - apps/api/src/services/governance/escalation.service.ts
//   - apps/api/src/services/governance/break-glass.service.ts
//
// NOT SCANNED (deliberate; per ADR-0026 §5 + ADR-0033 §Decision 7 layered-
// defense discipline — persistence-tier code legitimately reads/writes
// schema columns, response-shape discipline lives at the API tier):
//   - apps/api/src/services/{coe,feedback,hive,monetization,compliance,
//     llm,personalization,otzar/otzar.service.ts,cosmp}/**
//   - packages/database/src/queries/**
//   - tests/**, docs/**, scripts/**, node_modules/**, dist/**, build/**,
//     coverage/**, .git/**
//
// PATTERN: For each TypeScript file in the scan roots, the guard finds
// every line containing a forbidden token used as a property key (regex
// `\b<token>\s*[:,]` — matches `token:` and `token,` patterns). Comments
// (single-line `//` and JSDoc `*` continuations) are skipped. Lines with
// an explicit `// allow: <token>` opt-out marker are skipped. Specific
// known-legitimate hits documented in KNOWN_LEGITIMATE_HITS below are
// skipped with a substrate-justified reason.
//
// FAILURE REPORTING: Multi-line summary listing every offending
// `path:line  →  token  →  source` so the fix is mechanical for any
// contributor. Mirrors the RULE 16 no-console anchor format.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// WHAT: Repo-root-anchored absolute paths to the focused scan roots.
// INPUT: None.
// OUTPUT: Absolute path strings.
// WHY: vitest runs from the workspace root; resolve once to avoid
//      relative-path drift between tests and the scanner.
const REPO_ROOT = process.cwd();
const SCAN_DIRS = [
  "apps/api/src/routes",
  "apps/api/src/middleware",
  "apps/api/src/security",
].map((p) => resolve(REPO_ROOT, p));
const SCAN_FILES = [
  "apps/api/src/services/otzar/transparency.ts",
  "apps/api/src/services/otzar/conversation-detail.ts",
  "apps/api/src/services/otzar/conversation-corrections.ts",
  "apps/api/src/services/governance/escalation.service.ts",
  "apps/api/src/services/governance/break-glass.service.ts",
].map((p) => resolve(REPO_ROOT, p));

// WHAT: The runtime-forbidden tokens enumerated per ADR-0057 §10
//        forbidden-audit-details list + the Action/future-executor
//        leak set per ADR-0057 §17 + the planning-QLOCK source list.
// INPUT: None.
// OUTPUT: A readonly tuple of forbidden token strings.
// WHY: One canonical list keeps the scanner, the failure messages, and
//      future widening anchored to ADR-0057 §10 verbatim. Adding a new
//      forbidden token here is the canonical extension point.
const FORBIDDEN_TOKENS = [
  // Capsule content + storage internals (ADR-0026 §6 + ADR-0057 §10)
  "payload_summary",
  "payload_content",
  "target_capsule_id",
  "storage_location",
  "content_hash",
  // Embedding / vector internals (ADR-0043 §G3.9 + ADR-0057 §10)
  "embedding",
  "vector",
  // Permission internals (ADR-0026 §6 candidate-pool + capability flags)
  "capability_flags",
  "candidate_pool",
  // Raw payload / request / response / error (ADR-0057 §10)
  "raw_payload",
  "raw_request",
  "raw_response",
  "raw_error",
  // Action / executor / connector raw passthrough (ADR-0057 §17)
  "action_result_raw",
  "external_response_raw",
  "connector_response_raw",
  "tool_response_raw",
] as const;

// WHAT: Per-file allowlist of substrate-justified legitimate uses of
//        forbidden tokens. Each entry: relative-path → { line, token,
//        reason }. Adding a new entry requires ADR-anchored substrate
//        justification.
// INPUT: None.
// OUTPUT: A frozen lookup map.
// WHY: A small number of substrate-justified sites (Prisma select column
//      reads inside admin routes, input-type annotations on mapper TS
//      types, canonical COSMP write-response hash-chain identifier,
//      service input arguments) legitimately mention forbidden tokens
//      as property keys. Allowlisting them by exact `(path, line, token)`
//      tuple keeps the guard tight without per-file blanket excludes.
//      Each entry cites the substrate (ADR or layered-defense rationale)
//      so a future reader can verify the allowance is still valid.
type LegitimateHit = { line: number; token: string; reason: string };
const KNOWN_LEGITIMATE_HITS: Readonly<Record<string, readonly LegitimateHit[]>> = {
  "apps/api/src/routes/org.routes.ts": [
    {
      line: 898,
      token: "payload_summary",
      reason:
        "Prisma select inside admin route — column read, not response shape; mapper-tier projection strips it before response",
    },
  ],
  "apps/api/src/routes/cosmp.routes.ts": [
    {
      line: 157,
      token: "content_hash",
      reason:
        "COSMP write response — hash-chain identifier per ADR-0009 + ADR-0002 (client uses it for chain-link verification)",
    },
    {
      line: 278,
      token: "content_hash",
      reason:
        "COSMP share/update response — hash-chain identifier per ADR-0009 + ADR-0002 (client uses it for chain-link verification)",
    },
  ],
  "apps/api/src/routes/otzar-observation.routes.ts": [
    {
      line: 153,
      token: "target_capsule_id",
      reason:
        "Service input argument passed to observationService.processCorrection — not a response body or audit-details field",
    },
  ],
  "apps/api/src/services/otzar/conversation-detail.ts": [
    {
      line: 84,
      token: "payload_summary",
      reason:
        "TypeScript type annotation on the ConversationDetailInput.summaryCapsule shape (input only); the projectConversationDetail mapper strips this field from the ConversationDetailView output per ADR-0054",
    },
  ],
};

// WHAT: Regex matching a single-line opt-out marker. Same line as the
//        forbidden token. Format: `// allow: <token> per <reason>`.
// INPUT: Used to test individual lines.
// OUTPUT: None.
// WHY: Mirrors `// eslint-disable-next-line` discipline. A developer adding
//      a legitimate use of a forbidden token can opt out per-line with
//      explicit substrate citation, instead of editing the KNOWN_LEGITIMATE_HITS
//      allowlist constant. Required format: `// allow: <token>`.
const ALLOW_MARKER_RE = /\/\/\s*allow:\s*([a-z_]+)/;

// WHAT: Regex matching a forbidden-token usage as an object property key.
//        Matches `\b<token>\s*[:,]` — the token followed by optional
//        whitespace then `:` (assignment) or `,` (trailing-comma property).
//        Built per-token to capture the matched token in group 1.
// INPUT: Used per-line.
// OUTPUT: None.
// WHY: Property-key context is the canonical leak surface. The pattern
//      does NOT match `body.token` (property access; preceded by `.`),
//      does NOT match `tokenSomething` (different identifier; the `\b`
//      boundary prevents this), and does NOT match `token?:` (optional
//      property type annotation; the `?` is not whitespace, not in `[:,]`).
//      It DOES match `token: value,` and `token,` (shorthand property).
const buildForbiddenRe = (token: string): RegExp =>
  new RegExp(`\\b${token}\\s*[:,]`);

// WHAT: One offending hit recorded by the scanner.
// INPUT: Used as a value type.
// OUTPUT: None — this is a type.
// WHY: The reporter consumes these to build the multi-line failure
//      message.
interface LeakHit {
  path: string;
  line: number;
  token: string;
  source: string;
}

// WHAT: Decide whether a line is purely a comment (single-line `//` or
//        JSDoc block `*` continuation).
// INPUT: A line string.
// OUTPUT: True if the line is comment-only.
// WHY: Forbidden tokens inside comments are documentation (often the
//      forbid-list itself); they MUST be skipped to avoid false positives.
function isCommentLine(line: string): boolean {
  const trimmed = line.replace(/^\s+/, "");
  return trimmed.startsWith("//") || trimmed.startsWith("*");
}

// WHAT: Walk a directory recursively and collect every `.ts` file under
//        it.
// INPUT: An absolute directory path.
// OUTPUT: A flat array of absolute file paths.
// WHY: vitest in this repo does not provide a glob primitive; this is
//      the same recursive-walk shape the RULE 16 no-console anchor uses.
function collectTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      out.push(...collectTsFiles(fullPath));
    } else if (stats.isFile() && fullPath.endsWith(".ts")) {
      out.push(fullPath);
    }
  }
  return out;
}

// WHAT: Scan a single file's lines for forbidden tokens used as property
//        keys, honoring the KNOWN_LEGITIMATE_HITS allowlist and the
//        `// allow:` opt-out marker.
// INPUT: An absolute file path.
// OUTPUT: An array of LeakHit records (one per unhandled occurrence).
// WHY: Per-file scan isolates per-file allowlist lookups and keeps the
//      reporter's path:line output deterministic.
function scanFile(absPath: string): LeakHit[] {
  const text = readFileSync(absPath, "utf-8");
  const lines = text.split("\n");
  const relPath = relative(REPO_ROOT, absPath);
  const fileAllowlist = KNOWN_LEGITIMATE_HITS[relPath] ?? [];
  const hits: LeakHit[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (isCommentLine(line)) continue;
    // `// allow: <token>` opt-out: skip this line entirely (the marker
    // grants per-line indulgence).
    const allowMatch = line.match(ALLOW_MARKER_RE);
    const allowedToken = allowMatch === null ? null : allowMatch[1];
    for (const token of FORBIDDEN_TOKENS) {
      const re = buildForbiddenRe(token);
      if (!re.test(line)) continue;
      // Per-line opt-out wins.
      if (allowedToken === token) continue;
      // Per-file allowlist (line + token must match exactly).
      const allowed = fileAllowlist.some(
        (entry) => entry.line === i + 1 && entry.token === token,
      );
      if (allowed) continue;
      hits.push({
        path: relPath,
        line: i + 1,
        token,
        source: line.trim(),
      });
    }
  }
  return hits;
}

describe("CI no-leak guard — Foundation runtime response/audit-safe surfaces", () => {
  it("⭐ ADR-0057 §16 step 2 ANCHOR: zero forbidden tokens appear as object property keys in scanned output-shape files", () => {
    const allFiles: string[] = [];
    for (const dir of SCAN_DIRS) {
      try {
        allFiles.push(...collectTsFiles(dir));
      } catch (err) {
        // If a scan root is removed, fail loudly — the test substrate
        // depends on these directories existing.
        throw new Error(
          `no-leak guard scan root missing: ${relative(REPO_ROOT, dir)} ` +
            `(${err instanceof Error ? err.message : String(err)})`,
        );
      }
    }
    for (const file of SCAN_FILES) {
      try {
        statSync(file);
        allFiles.push(file);
      } catch (err) {
        throw new Error(
          `no-leak guard scan file missing: ${relative(REPO_ROOT, file)} ` +
            `(${err instanceof Error ? err.message : String(err)})`,
        );
      }
    }
    // Sort for deterministic report ordering across runs.
    allFiles.sort();

    const hits: LeakHit[] = [];
    for (const file of allFiles) {
      hits.push(...scanFile(file));
    }

    if (hits.length > 0) {
      const formatted = hits
        .map(
          (h) =>
            `  ${h.path}:${h.line}  →  ${h.token}  →  ${h.source}`,
        )
        .join("\n");
      const message =
        `Found ${hits.length} forbidden-token leak site(s) in Foundation ` +
        `runtime response/audit-safe surfaces. Each site exposes a field ` +
        `that ADR-0057 §10 + ADR-0026 §6 + ADR-0050 forbid in response ` +
        `bodies, audit details, and error envelopes. Fix each offender by ` +
        `removing the forbidden field, projecting through a safe-view ` +
        `mapper (per the ADR-0051 / ADR-0054 / ADR-0055 precedent), or, ` +
        `when substrate-justified, adding an explicit ` +
        `\`// allow: <token>\` marker on the same line citing the ADR ` +
        `that authorizes the exception.\n\n${formatted}\n`;
      throw new Error(message);
    }
    expect(hits.length).toBe(0);
  });

  // WHAT: Verify the scanner's pattern-matching primitive itself does what
  //        the design intends — a tiny self-test that catches future
  //        regressions in the regex or comment-skip logic. Independent of
  //        the live scan above.
  // INPUT: None.
  // OUTPUT: None.
  // WHY: A scanner that silently stops detecting `// allow:` markers or
  //      stops skipping comments would degrade into a false-clean test.
  //      The self-test asserts the canonical positive + negative cases.
  it("scanner self-test: forbidden-token regex + comment skip + allow-marker behave as designed", () => {
    // Positive: literal property-key usage triggers a match.
    expect(buildForbiddenRe("payload_summary").test("  payload_summary: x,")).toBe(true);
    expect(buildForbiddenRe("payload_summary").test("  payload_summary,")).toBe(true);
    // Negative: property access (preceded by `.`) does NOT trigger.
    expect(buildForbiddenRe("payload_summary").test("  body.payload_summary === ")).toBe(false);
    // Negative: optional-property type annotation (`token?:`) does NOT trigger.
    expect(buildForbiddenRe("target_capsule_id").test("  target_capsule_id?: unknown;")).toBe(false);
    // Negative: longer identifier (the `\b` boundary prevents the prefix match).
    expect(buildForbiddenRe("vector").test("  vectorize_input(x)")).toBe(false);
    // Comment skip works for `//` and `*`-prefix JSDoc.
    expect(isCommentLine("  // payload_summary: x,")).toBe(true);
    expect(isCommentLine("   * embedding internals are private")).toBe(true);
    expect(isCommentLine("   payload_summary: x,")).toBe(false);
    // Allow marker is captured.
    const allow = "  payload_summary: cap.payload_summary, // allow: payload_summary per ADR-XXXX";
    const m = allow.match(ALLOW_MARKER_RE);
    expect(m).not.toBeNull();
    expect(m?.[1]).toBe("payload_summary");
  });
});
