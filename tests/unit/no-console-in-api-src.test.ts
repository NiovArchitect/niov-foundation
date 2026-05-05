// FILE: no-console-in-api-src.test.ts (unit)
// PURPOSE: ⭐ DRIFT 2 OPTION C ARCHITECTURAL ANCHOR ⭐
//          Asserts zero console.{log,error,warn,info,debug} CALL
//          sites in apps/api/src/. All operational logging in
//          Foundation goes through the structured logger
//          (apps/api/src/logger.ts module-level export, OR
//          request.log.* / fastify.log.* via the Fastify pino
//          instance configured in server.ts). New code that adds a
//          console.* call to apps/api/src will fail this test --
//          contributors get the path:line of every offending call
//          so the fix is unambiguous.
// CONNECTS TO: apps/api/src/logger.ts (the shared structured
//              logger), apps/api/src/server.ts (Fastify pino
//              config with redact paths), docs/STRUCTURED_LOGGING_SCHEMA.md
//              (the field-schema documentation).
//
// 12C.0 ITEM 8 / DRIFT 2 OPTION C:
// Foundation does not yet have ESLint configured at the repo level
// (Compliance Architecture Review pre-flight GREP 12 confirmed
// .eslintrc.* and eslint.config.* are absent; no `lint` npm
// script). DRIFT 2 was resolved with Option C: a runtime invariant
// test rather than a static lint rule. This test enforces the same
// no-console invariant ESLint's `no-console` rule would, but
// without requiring the broader ESLint adoption that's deferred to
// a future Foundation lint/format/typecheck CI batch.
//
// PARALLEL DISCIPLINE PATTERN:
// otzar-control-tower has a similar runtime invariant for the
// `pending-foundation-extension` sentinel grep (the placeholder
// audit_event_id pattern that Section 12B.0 closed across 7 of 8
// write endpoints + Section 12C.0 Item 2 closed the last one).
// Both invariants are ad-hoc grep tests over source trees, both
// are runtime-enforced via vitest, and both have the same failure-
// reporting shape: print every offending path:line so contributors
// know exactly what to fix.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// WHAT: Path to apps/api/src under test. Resolved relative to
//        Foundation repo root since the vitest cwd is the workspace
//        root.
// INPUT: None.
// OUTPUT: An absolute path string.
// WHY: The invariant only applies to apps/api/src code. Test code
//      itself (tests/), seed scripts (apps/api/templates/), and
//      tooling (packages/database/scripts/) may legitimately use
//      console.* for operator-readable output that isn't part of
//      the runtime SIEM ingestion path.
const API_SRC_ROOT = resolve(process.cwd(), "apps/api/src");

// WHAT: Pattern that matches actual console method CALLS, not
//        substring mentions in JSDoc / comments.
// INPUT: None.
// OUTPUT: A regular expression.
// WHY: The lookahead-style matcher would be cleaner but multiline
//      regex flags vary; a simple "console.method(" pattern with
//      optional whitespace handles the call-vs-doc-mention
//      distinction correctly. Doc text like "console.error only"
//      lacks the trailing parenthesis and is excluded. Doc text
//      like "console.error(...)" inside a JSDoc block would still
//      match -- but Foundation's JSDoc convention does not include
//      example-call literals like that, so the false-positive risk
//      is zero in practice.
const CONSOLE_CALL_RE = /console\.(?:log|error|warn|info|debug)\s*\(/;

interface ConsoleHit {
  path: string;
  line: number;
  source: string;
}

// WHAT: Recursively walk apps/api/src and collect every line that
//        matches the console-call pattern.
// INPUT: A directory path.
// OUTPUT: An array of { path, line, source } records, one per
//          matching call site.
// WHY: The test reports EVERY hit, not just the first, so a
//      contributor adding multiple console calls gets one
//      consolidated failure message rather than fixing one and
//      hitting the next on rerun.
function findConsoleCallsRecursive(dir: string): ConsoleHit[] {
  const hits: ConsoleHit[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      hits.push(...findConsoleCallsRecursive(fullPath));
    } else if (stats.isFile() && fullPath.endsWith(".ts")) {
      const text = readFileSync(fullPath, "utf-8");
      const lines = text.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? "";
        if (CONSOLE_CALL_RE.test(line)) {
          hits.push({
            path: relative(process.cwd(), fullPath),
            line: i + 1,
            source: line.trim(),
          });
        }
      }
    }
  }
  return hits;
}

describe("apps/api/src structured-logging invariant", () => {
  it("⭐ DRIFT 2 OPTION C ANCHOR: contains zero console.{log,error,warn,info,debug} call sites", () => {
    const hits = findConsoleCallsRecursive(API_SRC_ROOT);
    if (hits.length > 0) {
      // Build a multi-line failure message with every offending
      // path:line + source so the fix is mechanical for any
      // contributor.
      const formatted = hits
        .map((h) => `  ${h.path}:${h.line}  →  ${h.source}`)
        .join("\n");
      const message =
        `Found ${hits.length} console.* call site(s) in apps/api/src/. ` +
        `All operational logging must go through apps/api/src/logger.ts ` +
        `(module-level export) or request.log.* / fastify.log.* (request- ` +
        `scoped). Replace each console.* call with the structured logger:\n` +
        `\n${formatted}\n`;
      throw new Error(message);
    }
    expect(hits.length).toBe(0);
  });
});
