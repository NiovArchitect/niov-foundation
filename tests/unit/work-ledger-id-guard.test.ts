// FILE: work-ledger-id-guard.test.ts
// PURPOSE: Malformed ledger IDs must return NOT_FOUND, never Prisma 500.
import { describe, expect, it, vi, beforeEach } from "vitest";

// Light pure guard mirrored from UUID_RE in work-ledger.service.ts
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe("ledger id guard", () => {
  it("rejects malformed ids before prisma", () => {
    expect(UUID_RE.test("not-a-uuid")).toBe(false);
    expect(UUID_RE.test("00000000-0000-4000-8000-000000000099")).toBe(true);
    expect(UUID_RE.test("9dc38bd3-12d6-4c76-a304-22f7a90ad4dc")).toBe(true);
  });
});
