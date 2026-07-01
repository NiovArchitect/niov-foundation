// FILE: tests/unit/identity-reconciliation.test.ts (unit)
// PURPOSE: Slice C — deterministic reconciliation logic. Given a preloaded org
//          member set, an identity hint (name/email/handle) resolves to ONE
//          canonical entity by strict precedence (email → username → name), holds
//          ambiguous names for review, and returns none for unknowns — never a
//          fuzzy guess. (Org-scoping / cross-tenant is covered in integration
//          where the member set is loaded from the DB.)
import { describe, expect, it } from "vitest";
import { reconcileAgainst } from "../../apps/api/src/services/otzar/identity-reconciliation.service.js";

const MEMBERS = [
  { entity_id: "e-david", display_name: "David Odie", email: "david@acme.com", username: "dave" },
  { entity_id: "e-david2", display_name: "David Smith", email: "dsmith@acme.com", username: "dsmith" },
  { entity_id: "e-pratham", display_name: "Pratham Kapoor", email: "pratham@acme.com", username: "pk" },
];

describe("identity reconciliation — deterministic precedence", () => {
  it("resolves by EMAIL first (strongest cross-source key)", () => {
    const r = reconcileAgainst(MEMBERS, { name: "Someone Else", email: "david@acme.com" });
    expect(r.method).toBe("email");
    expect(r.entity_id).toBe("e-david");
  });

  it("resolves by USERNAME/handle (tolerates a leading @)", () => {
    expect(reconcileAgainst(MEMBERS, { handle: "@dave" }).entity_id).toBe("e-david");
    expect(reconcileAgainst(MEMBERS, { handle: "pk" })).toMatchObject({ method: "username", entity_id: "e-pratham" });
  });

  it("resolves by NAME (exact / first-name) when unique", () => {
    expect(reconcileAgainst(MEMBERS, { name: "Pratham" })).toMatchObject({ method: "name", entity_id: "e-pratham" });
  });

  it("holds AMBIGUOUS names for review (two Davids) — never auto-picks", () => {
    const r = reconcileAgainst(MEMBERS, { name: "David" });
    expect(r.method).toBe("ambiguous");
    expect(r.entity_id).toBeNull();
    expect(r.candidates.sort()).toEqual(["David Odie", "David Smith"]);
  });

  it("returns NONE for an unknown identifier (caller holds NEEDS_OWNER, no wrong match)", () => {
    expect(reconcileAgainst(MEMBERS, { name: "Nobody", email: "ghost@nowhere.com", handle: "ghost" })).toMatchObject({ method: "none", entity_id: null });
  });

  it("email precedence beats an otherwise-ambiguous name", () => {
    // "David" alone is ambiguous, but the email disambiguates to exactly one.
    const r = reconcileAgainst(MEMBERS, { name: "David", email: "dsmith@acme.com" });
    expect(r.method).toBe("email");
    expect(r.entity_id).toBe("e-david2");
  });
});
