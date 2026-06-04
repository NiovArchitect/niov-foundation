/**
 * Unit tests for pure helpers of the Phase 5 McpToolPolicy substrate.
 */
import { describe, expect, it } from "vitest";
import type { McpToolPolicy } from "@prisma/client";
import { findMatchingPolicy } from "../../apps/api/src/services/connector-rails";

function policy(
  overrides: Partial<McpToolPolicy>,
): McpToolPolicy {
  return {
    policy_id: "p-1",
    org_entity_id: "org-1",
    mcp_connection_id: "mcp-1",
    tool_name: "list_files",
    operation_class: "READ",
    outcome: "ALLOW",
    requires_employee_authority: true,
    requires_dmw_scope: true,
    requires_admin_approval: false,
    redaction_policy: null,
    output_retention_policy: null,
    created_by_entity_id: "admin-1",
    created_at: new Date(),
    updated_at: new Date(),
    revoked_at: null,
    ...overrides,
  } as McpToolPolicy;
}

describe("connector-rails / findMatchingPolicy", () => {
  it("returns the policy when tool_name + operation_class match", () => {
    const p = policy({});
    expect(findMatchingPolicy([p], "list_files", "READ")).toBe(p);
  });

  it("returns null when tool name differs", () => {
    const p = policy({});
    expect(findMatchingPolicy([p], "send_email", "READ")).toBeNull();
  });

  it("returns null when operation class differs", () => {
    const p = policy({ operation_class: "READ" });
    expect(findMatchingPolicy([p], "list_files", "WRITE")).toBeNull();
  });

  it("ignores revoked policies", () => {
    const p = policy({ revoked_at: new Date() });
    expect(findMatchingPolicy([p], "list_files", "READ")).toBeNull();
  });

  it("returns the FIRST matching policy when duplicates exist", () => {
    const a = policy({ policy_id: "a", outcome: "ALLOW" });
    const b = policy({ policy_id: "b", outcome: "BLOCK" });
    const match = findMatchingPolicy([a, b], "list_files", "READ");
    expect(match?.policy_id).toBe("a");
  });
});
