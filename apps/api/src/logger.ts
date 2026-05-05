// FILE: logger.ts
// PURPOSE: Shared pino logger instance for service-level + boot-time
//          structured logging in apps/api/src. Fastify's request-
//          scoped logger (request.log.*) covers the request path;
//          this module-level instance covers everything that runs
//          OUTSIDE a Fastify request context: server.ts main() boot
//          + shutdown, boot-validation.ts env warnings, governance
//          seed functions, and service-class hook failures
//          (CoeService Loop 1, ReadService Loop 5, OtzarService
//          auto-close failures).
// CONNECTS TO: server.ts (Fastify is configured with the same level
//              + redact list so request logs match service logs in
//              SIEM ingestion), apps/api/src/services/* (service
//              classes import this for non-request logging),
//              tests/unit/no-console-in-api-src.test.ts (the DRIFT
//              2 Option C anchor that asserts zero console.* in
//              apps/api/src).
//
// 12C.0 ITEM 8 + DRIFT 13:
// Redact paths cover credentials AND user PII AND data-subject PII.
// The redact list is the same as the Fastify request-logger redact
// list -- structured logs from any source produce identical SIEM
// output shape.

import pino from "pino";

// WHAT: The single shared logger instance for module-level + boot-
//        time usage in apps/api/src.
// INPUT: None.
// OUTPUT: A pino logger.
// WHY: Service classes can import this directly without needing a
//      Fastify request scope. Output format matches Fastify's
//      request logger (level field + ISO timestamp + JSON-line
//      output) so SIEM ingestion treats both sources uniformly.
//      Test mode silences output (level: "silent") so the test
//      suite's stdout stays clean for vitest's reporter.
export const logger = pino({
  level:
    process.env.NODE_ENV === "test"
      ? "silent"
      : (process.env.LOG_LEVEL ?? "info"),
  formatters: {
    level: (label: string) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});
