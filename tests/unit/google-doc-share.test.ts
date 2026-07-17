import { beforeEach, describe, expect, it, vi } from "vitest";

const { grantedScopesMock, writeAuditEventMock, tokenMock } = vi.hoisted(() => ({
  grantedScopesMock: vi.fn(),
  writeAuditEventMock: vi
    .fn()
    .mockResolvedValue({ audit_id: "00000000-0000-0000-0000-000000000099" }),
  tokenMock: vi.fn(),
}));

vi.mock("@niov/database", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, writeAuditEvent: writeAuditEventMock };
});

vi.mock(
  "../../apps/api/src/services/connector/connector-oauth.service.js",
  () => ({
    getProviderGrantedScopes: grantedScopesMock,
    getProviderAccessTokenForOrg: tokenMock,
  }),
);

import { shareGoogleDoc } from "../../apps/api/src/services/connector/google-doc-share.service.js";

beforeEach(() => {
  grantedScopesMock.mockReset();
  writeAuditEventMock.mockClear();
  tokenMock.mockReset();
});

describe("shareGoogleDoc", () => {
  it("blocks without confirmation", async () => {
    const r = await shareGoogleDoc({
      actor_entity_id: "a",
      org_entity_id: "o",
      document_id: "doc1",
      email: "x@example.com",
      caller_confirmed: false,
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("x");
    expect(r.code).toBe("NEEDS_CALLER_CONFIRMATION");
  });

  it("shares via Drive permissions and never audits email", async () => {
    grantedScopesMock.mockResolvedValue([
      "https://www.googleapis.com/auth/drive.file",
    ]);
    tokenMock.mockResolvedValue({ ok: true, access_token: "tok" });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: "perm-1" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const r = await shareGoogleDoc({
      actor_entity_id: "a",
      org_entity_id: "o",
      document_id: "doc1",
      email: "teammate@example.com",
      role: "writer",
      caller_confirmed: true,
    });
    vi.unstubAllGlobals();
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("x");
    expect(r.permission_id).toBe("perm-1");
    const audit = writeAuditEventMock.mock.calls.at(-1)?.[0] as {
      details: Record<string, unknown>;
    };
    expect(JSON.stringify(audit.details)).not.toContain("teammate@example.com");
    expect(String(fetchMock.mock.calls[0]![0])).toContain("/permissions");
  });
});
