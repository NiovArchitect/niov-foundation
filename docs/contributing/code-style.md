# Code Style

TypeScript conventions specific to niov-foundation. This file is
not a general TypeScript style guide — it captures the choices
that are load-bearing for the codebase: documentation block
format, naming, imports, service-class shape, error handling,
and logging. Conventions that are *not* documented here are not
load-bearing; defer to TypeScript and Prettier defaults.

## File Headers

Every TypeScript module under `apps/api/src/` opens with a
three-field header comment:

```ts
// FILE: compliance.service.ts
// PURPOSE: Implement the Compliance Router. Lists active frameworks,
//          decides which ones apply to a given target entity,
//          enforces per-framework predicates against an operation,
//          and aggregates compliance audit events into a report.
// CONNECTS TO: AuthService (validates routes' sessions), the
//              compliance_frameworks + entity_compliance_profiles
//              tables, the audit_events table (for reports), and
//              NegotiateService (calls runComplianceChecks before
//              issuing a declaration).
```

(real example from `apps/api/src/services/compliance/compliance.service.ts:1-10`)

`FILE` matches the basename. `PURPOSE` is one-to-three sentences
on what the module does. `CONNECTS TO` names the upstream and
downstream modules so a reader landing in this file can navigate
the dependency graph without grepping for imports.

## Documentation Blocks (JSDoc → TSDoc)

### 2.1 WHAT / INPUT / OUTPUT / WHY (current convention through Section 12C.0)

Every exported function, every public service method, and every
non-trivially-named exported type carries a four-block comment:

```ts
// WHAT: The per-account lockout threshold.
// INPUT: None.
// OUTPUT: A count.
// WHY: The 5th failed login flips the entity to SUSPENDED per spec.
export const FAILED_AUTH_LOCKOUT = 5;
```

(real example from `apps/api/src/services/auth.service.ts:32-36`)

The four blocks are:

- **WHAT.** One-sentence description of the artifact.
- **INPUT.** What it consumes. For types and constants, write
  `None.` or `Used as a parameter type only.` rather than
  omitting the field.
- **OUTPUT.** What it returns. For types, write
  `None -- this is a type, not a value.` rather than omitting.
- **WHY.** The rationale. This is the highest-leverage block —
  it explains the design choice or constraint that future readers
  would otherwise have to reverse-engineer. Cite ADRs by number,
  cite glossary terms in **bold** on first use, cite spec
  sections by item number where relevant.

### 2.2 TSDoc going forward (Section 12C.0.5 onward)

New code from Section 12C.0.5 onward uses standard TSDoc tags
(`@param`, `@returns`, `@throws`, `@example`) so that
`typedoc` can generate browsable API docs in
`docs/_generated/`. The TSDoc migration is **additive-only**:

- Existing WHAT/INPUT/OUTPUT/WHY blocks are NOT retroactively
  rewritten. They remain readable and continue to compile.
- New code uses TSDoc.
- When an existing function is significantly modified, the
  author may convert its block to TSDoc as part of that edit.
  Conversion is per-function, not per-file.

The pattern mirrors the Easier/Harder consequence split in the
ADR-0000 template: additive structural change, no churn on the
historical body.

### 2.3 When to write a doc block

Required:

- Every exported function or class
- Every public method on a service class
- Every exported type whose name does not fully describe its
  shape (`ComplianceCheckInput` needs a block; `LoginRequest`
  with three obvious fields does not)
- Every Prisma model field whose name does not fully describe
  its semantics (consult `packages/database/prisma/schema.prisma`)

Not required:

- Internal helper functions whose names are self-documenting
- Private service-class methods that exist only as decomposition
  of a documented public method
- One-line trivial getters

## Naming Conventions

- **File names.** kebab-case for files
  (`compliance.routes.ts`, `auth.service.ts`,
  `org.routes.ts`). PascalCase reserved for components (none
  in `apps/api/` yet; future-proof note for frontend packages).
- **Function and variable names.** camelCase. Common
  abbreviations are OK (`req`, `res`, `err`, `ctx`); avoid
  novel abbreviations.
- **Type and interface names.** PascalCase, no `I-` prefix
  (`AuthServiceConfig`, not `IAuthServiceConfig`).
- **Constant names.** SCREAMING_SNAKE_CASE for module-level
  constants (`FAILED_AUTH_LOCKOUT`, `OPERATION_TO_CAPABILITY`).
  camelCase for function-local constants.
- **Service classes.** PascalCase, suffixed `Service`
  (`AuthService`, `ComplianceService`, `CoeService`).

## Import Ordering

Imports group in this order, with a blank line between groups:

1. Node built-ins (`node:crypto`, `node:fs`)
2. External packages (`fastify`, `pino`, `jsonwebtoken`)
3. Workspace internal packages (`@niov/database`, `@niov/auth`)
4. Relative imports (`../redis.js`, `./governance/org.js`)

Real example, `apps/api/src/services/auth.service.ts:12-30`:

```ts
import { randomUUID } from "node:crypto";
import jwt, { type SignOptions } from "jsonwebtoken";
import { CRYPTO_CONFIG, verifyPassword } from "@niov/auth";
import {
  createSession,
  // …
  type TokenAttributeRepository,
} from "@niov/database";
import type { NonceStore } from "../redis.js";
import { getOrgSettingsOrDefaults } from "./governance/org.js";
```

`type` imports use the inline `type` modifier
(`import type { Foo } from "..."` for whole-module type
imports; `import { type Foo } from "..."` for per-symbol).
Relative imports include the `.js` extension because the
runtime is ESM.

## Service Class Conventions

Service classes inject dependencies through their constructor
using TypeScript's parameter-property syntax:

```ts
constructor(private readonly authService: AuthService) {}
```

(real example from `apps/api/src/services/compliance/compliance.service.ts:244`)

- **No underscore prefix on private fields.** The `private`
  keyword is sufficient. `authService`, not `_authService`.
- **`readonly` by default.** Constructor-injected fields are
  not reassigned; mark them `readonly` to lock that.
- **Public methods document with WHAT/INPUT/OUTPUT/WHY**
  (current) or TSDoc (going forward). Private methods document
  only when the rationale is non-obvious.

### The `ForCaller` pattern (ADR-0004)

When a service method needs a session-token gate, use the
`${operation}ForCaller(token, ...args)` naming pattern. The
service owns auth gating; routes never duplicate the
`validateSession` + `getOrgEntityId` boilerplate. See ADR-0004
(service-owned auth gate pattern) for the full rationale and
canonical implementation
(`getComplianceStateForCaller` at
`apps/api/src/services/compliance/compliance.service.ts:528`).

## Error Handling

### Custom error classes

When a route handler needs to discriminate a service failure,
the service throws a named error class extending `Error`:

```ts
export class TokenBudgetExceededError extends Error {
  readonly detail: TokenBudgetExceededDetail;
  constructor(detail: TokenBudgetExceededDetail) {
    super("TOKEN_BUDGET_EXCEEDED");
    this.name = "TokenBudgetExceededError";
    this.detail = detail;
  }
}
```

(real example from `apps/api/src/services/otzar/truncation.ts:54-61`)

- Set `this.name` explicitly so `instanceof` and name-based
  discrimination both work after JS minification or
  transpilation boundaries
- Carry structured detail as a typed `readonly` field; do not
  serialize details into the message string

### Result-tuple pattern (preferred for expected failures)

When a failure is expected (session invalid, compliance check
failed, validation failed), the service returns a discriminated
result tuple instead of throwing:

```ts
async getComplianceStateForCaller(
  sessionToken: string,
): Promise<
  | { ok: true; state: ComplianceStateReport }
  | { ok: false; code: string }
>;
```

Routes branch on `result.ok` and map `code` to an HTTP status
via a `statusForCode(code)` helper local to the route file
(see `apps/api/src/routes/compliance.routes.ts:21-35`).
Throwing is reserved for truly exceptional conditions.

## Logging

The shared logger is `apps/api/src/logger.ts`. Two contexts:

- **Inside a Fastify request:** use `request.log.*`
  (request-scoped logger with request ID, method, URL fields
  pre-bound).
- **Outside a Fastify request:** import the module-level
  `logger` from `apps/api/src/logger.ts`. This covers
  `server.ts` boot + shutdown, `boot-validation.ts` env
  warnings, governance seed functions, and service-class
  background hook failures.

### No `console.*` in `apps/api/src` (ADR-0005)

`console.log`, `console.warn`, `console.error` are forbidden
inside `apps/api/src/`. The runtime invariant is locked by
`tests/unit/no-console-in-api-src.test.ts` (the DRIFT 2
Option C anchor). Use the structured logger instead. See
ADR-0005 (no `console.*` in `apps/api/src`) for the rationale.

### Structured field schema

The logger redact list and field schema are documented in
`docs/STRUCTURED_LOGGING_SCHEMA.md`. Both the request-scoped
logger (Fastify) and the module-level logger
(`apps/api/src/logger.ts`) use the same redact list, so SIEM
ingestion sees identical output shape from both sources.

## See Also

- ADR-0004 (service-owned auth gate pattern)
- ADR-0005 (no `console.*` in `apps/api/src`)
- `docs/reference/glossary.md` — terminology and capitalization
  conventions
- `docs/STRUCTURED_LOGGING_SCHEMA.md` — logger field schema
- `docs/contributing/testing.md` — test conventions (Phase 2b)
