// FILE: action-list-query.test.ts (unit)
// PURPOSE: Pure-function unit tests for validateListActionsQuery
//          per ADR-0057 §9. Covers default behavior, clamping,
//          enum-list parsing, and INVALID_FIELD branches.
// CONNECTS TO: apps/api/src/services/action/list.service.ts via
//              the "@niov/api" barrel.

import { describe, expect, it } from "vitest";
import {
  DEFAULT_ACTIONS_PAGE_SIZE,
  MAX_ACTIONS_PAGE_SIZE,
  validateListActionsQuery,
} from "@niov/api";

describe("ADR-0057 §9 — validateListActionsQuery", () => {
  describe("defaults", () => {
    it("undefined query yields self-scope + default pagination", () => {
      const r = validateListActionsQuery(undefined);
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.normalized.org_scope).toBe(false);
        expect(r.normalized.page).toBe(1);
        expect(r.normalized.page_size).toBe(DEFAULT_ACTIONS_PAGE_SIZE);
        expect(r.normalized.status).toBeUndefined();
        expect(r.normalized.risk_tier).toBeUndefined();
        expect(r.normalized.action_type).toBeUndefined();
      }
    });
    it("empty object yields the same defaults", () => {
      const r = validateListActionsQuery({});
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.normalized.page).toBe(1);
        expect(r.normalized.page_size).toBe(DEFAULT_ACTIONS_PAGE_SIZE);
      }
    });
  });

  describe("org_scope", () => {
    it("string 'true' → true", () => {
      const r = validateListActionsQuery({ org_scope: "true" });
      if (r.ok) expect(r.normalized.org_scope).toBe(true);
      else throw new Error("expected ok");
    });
    it("boolean true → true", () => {
      const r = validateListActionsQuery({ org_scope: true });
      if (r.ok) expect(r.normalized.org_scope).toBe(true);
      else throw new Error("expected ok");
    });
    it("string 'false' → false", () => {
      const r = validateListActionsQuery({ org_scope: "false" });
      if (r.ok) expect(r.normalized.org_scope).toBe(false);
      else throw new Error("expected ok");
    });
    it("unknown string → INVALID_FIELD", () => {
      const r = validateListActionsQuery({ org_scope: "maybe" });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.invalid_fields).toContain("org_scope");
    });
  });

  describe("page + page_size", () => {
    it("string '3' → 3", () => {
      const r = validateListActionsQuery({ page: "3" });
      if (r.ok) expect(r.normalized.page).toBe(3);
      else throw new Error("expected ok");
    });
    it("page < 1 → INVALID_FIELD", () => {
      const r = validateListActionsQuery({ page: 0 });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.invalid_fields).toContain("page");
    });
    it("page non-integer → INVALID_FIELD", () => {
      const r = validateListActionsQuery({ page: 1.5 });
      expect(r.ok).toBe(false);
    });
    it("page_size exactly MAX accepted", () => {
      const r = validateListActionsQuery({ page_size: MAX_ACTIONS_PAGE_SIZE });
      if (r.ok) expect(r.normalized.page_size).toBe(MAX_ACTIONS_PAGE_SIZE);
      else throw new Error("expected ok");
    });
    it("page_size over MAX → INVALID_FIELD", () => {
      const r = validateListActionsQuery({
        page_size: MAX_ACTIONS_PAGE_SIZE + 1,
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.invalid_fields).toContain("page_size");
    });
    it("page_size = 0 → INVALID_FIELD", () => {
      const r = validateListActionsQuery({ page_size: 0 });
      expect(r.ok).toBe(false);
    });
  });

  describe("enum filters", () => {
    it("single status string accepted", () => {
      const r = validateListActionsQuery({ status: "APPROVED" });
      if (r.ok) expect(r.normalized.status).toEqual(["APPROVED"]);
      else throw new Error("expected ok");
    });
    it("comma-separated status list accepted", () => {
      const r = validateListActionsQuery({
        status: "APPROVED,SCHEDULED,SUCCEEDED",
      });
      if (r.ok) {
        expect(r.normalized.status).toEqual([
          "APPROVED",
          "SCHEDULED",
          "SUCCEEDED",
        ]);
      } else throw new Error("expected ok");
    });
    it("array status list accepted", () => {
      const r = validateListActionsQuery({
        status: ["APPROVED", "REJECTED"],
      });
      if (r.ok) expect(r.normalized.status).toEqual(["APPROVED", "REJECTED"]);
      else throw new Error("expected ok");
    });
    it("unknown status value → INVALID_FIELD", () => {
      const r = validateListActionsQuery({ status: "MADE_UP" });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.invalid_fields).toContain("status");
    });
    it("risk_tier mix accepted", () => {
      const r = validateListActionsQuery({ risk_tier: "LOW,MEDIUM" });
      if (r.ok) expect(r.normalized.risk_tier).toEqual(["LOW", "MEDIUM"]);
      else throw new Error("expected ok");
    });
    it("unknown risk_tier → INVALID_FIELD", () => {
      const r = validateListActionsQuery({ risk_tier: "EXTREME" });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.invalid_fields).toContain("risk_tier");
    });
    it("action_type accepted", () => {
      const r = validateListActionsQuery({
        action_type: "RECORD_CAPSULE",
      });
      if (r.ok) {
        expect(r.normalized.action_type).toEqual(["RECORD_CAPSULE"]);
      } else throw new Error("expected ok");
    });
    it("unknown action_type → INVALID_FIELD", () => {
      const r = validateListActionsQuery({ action_type: "FAKE_TYPE" });
      expect(r.ok).toBe(false);
    });
    it("empty string after trim → INVALID_FIELD", () => {
      const r = validateListActionsQuery({ status: "," });
      expect(r.ok).toBe(false);
    });
    it("multiple invalid fields surfaced together", () => {
      const r = validateListActionsQuery({
        status: "MADE_UP",
        risk_tier: "EXTREME",
        page: -1,
      });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.invalid_fields).toContain("status");
        expect(r.invalid_fields).toContain("risk_tier");
        expect(r.invalid_fields).toContain("page");
      }
    });
  });
});
