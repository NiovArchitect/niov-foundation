// FILE: google-doc-create.test.ts (unit)
// PURPOSE: [GOOGLE-DOCS-WRITE] Locks for gated Google Doc create:
//            1. pure gate ladder priority (policy → title → approval →
//               caller confirm → connect → scope)
//            2. createGoogleDoc blocks DOC_WRITE_SCOPE_MISSING / reconnect
//               and audits DENIED without titles/tokens in details
//            3. SUCCESS only when Docs API returns a documentId
//            4. provider 403 → DOC_WRITE_SCOPE_MISSING (never fake CREATED)
// CONNECTS TO:
//   - apps/api/src/services/connector/google-doc.service.ts
//   - apps/api/src/services/connector/connector-oauth.service.ts

import { beforeEach, describe, expect, it, vi } from "vitest";

const { grantedScopesMock, writeAuditEventMock, tokenMock, ledgerMock } =
  vi.hoisted(() => ({
    grantedScopesMock: vi.fn(),
    writeAuditEventMock: vi
      .fn()
      .mockResolvedValue({ audit_id: "00000000-0000-0000-0000-000000000001" }),
    tokenMock: vi.fn(),
    ledgerMock: vi.fn().mockResolvedValue({ ok: true, entry: {} }),
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

vi.mock("../../apps/api/src/services/work-os/work-ledger.service.js", () => ({
  createLedgerEntry: ledgerMock,
}));

import {
  firstUnmetDocGate,
  createGoogleDoc,
  type GoogleDocCreateInput,
} from "../../apps/api/src/services/connector/google-doc.service.js";

function readyInput(): GoogleDocCreateInput {
  return {
    title: "Collab brief",
    body_text: "Agenda and owners.",
    requires_approval: false,
    approved: false,
    caller_confirmed: true,
  };
}

beforeEach(() => {
  grantedScopesMock.mockReset();
  writeAuditEventMock.mockClear();
  tokenMock.mockReset();
  ledgerMock.mockClear();
});

describe("firstUnmetDocGate (pure ladder)", () => {
  it("blocks on policy first", () => {
    expect(
      firstUnmetDocGate({ ...readyInput(), policy_blocked: true }, true, true),
    ).toBe("POLICY_BLOCKED");
  });

  it("blocks on empty title", () => {
    expect(firstUnmetDocGate({ ...readyInput(), title: "  " }, true, true)).toBe(
      "NEEDS_TITLE",
    );
  });

  it("blocks on required-but-missing approval", () => {
    expect(
      firstUnmetDocGate(
        { ...readyInput(), requires_approval: true, approved: false },
        true,
        true,
      ),
    ).toBe("NEEDS_APPROVAL");
  });

  it("blocks on missing caller confirmation", () => {
    expect(
      firstUnmetDocGate({ ...readyInput(), caller_confirmed: false }, true, true),
    ).toBe("NEEDS_CALLER_CONFIRMATION");
  });

  it("reaches scope gate only after human gates pass", () => {
    expect(firstUnmetDocGate(readyInput(), false, false)).toBe(
      "GOOGLE_RECONNECT_REQUIRED",
    );
    expect(firstUnmetDocGate(readyInput(), false, true)).toBe(
      "DOC_WRITE_SCOPE_MISSING",
    );
  });

  it("returns null (READY) when every gate is satisfied", () => {
    expect(firstUnmetDocGate(readyInput(), true, true)).toBeNull();
  });
});

describe("createGoogleDoc (hard enforcement)", () => {
  it("blocks DOC_WRITE_SCOPE_MISSING when token is read-only", async () => {
    grantedScopesMock.mockResolvedValue([
      "https://www.googleapis.com/auth/drive.readonly",
      "https://www.googleapis.com/auth/calendar.readonly",
    ]);
    const r = await createGoogleDoc({
      actor_entity_id: "actor-1",
      org_entity_id: "org-1",
      input: readyInput(),
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected blocked");
    expect(r.code).toBe("DOC_WRITE_SCOPE_MISSING");
    const audit = writeAuditEventMock.mock.calls[0]![0];
    expect(audit.event_type).toBe("GOOGLE_DOC_CREATE");
    expect(audit.outcome).toBe("DENIED");
    expect(audit.details.reason).toBe("DOC_WRITE_SCOPE_MISSING");
    const s = JSON.stringify(audit);
    expect(s).not.toContain("Collab brief");
    expect(s).not.toContain("Agenda");
  });

  it("blocks GOOGLE_RECONNECT_REQUIRED when not connected", async () => {
    grantedScopesMock.mockResolvedValue(null);
    const r = await createGoogleDoc({
      actor_entity_id: "actor-1",
      org_entity_id: "org-1",
      input: readyInput(),
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected blocked");
    expect(r.code).toBe("GOOGLE_RECONNECT_REQUIRED");
  });

  it("creates a real doc via Drive API when doc-write scope + every gate passed", async () => {
    grantedScopesMock.mockResolvedValue([
      "https://www.googleapis.com/auth/drive.file",
    ]);
    tokenMock.mockResolvedValue({ ok: true, access_token: "tok-doc" });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: "doc-xyz",
          name: "Collab brief",
          webViewLink: "https://docs.google.com/document/d/doc-xyz/edit",
        }),
      })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    const r = await createGoogleDoc({
      actor_entity_id: "actor-1",
      org_entity_id: "org-1",
      input: readyInput(),
    });
    vi.unstubAllGlobals();
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("expected created");
    expect(r.document_id).toBe("doc-xyz");
    expect(r.web_view_link).toContain("doc-xyz");
    expect(fetchMock).toHaveBeenCalled();
    const createCall = fetchMock.mock.calls[0]!;
    expect(String(createCall[0])).toContain("googleapis.com/drive/v3/files");
    const audit = writeAuditEventMock.mock.calls.at(-1)?.[0] as {
      outcome: string;
      details: Record<string, unknown>;
    };
    expect(audit.outcome).toBe("SUCCESS");
    expect(JSON.stringify(audit.details)).not.toContain("tok-doc");
    expect(JSON.stringify(audit.details)).not.toContain("Collab brief");
  });

  it("falls back to Docs API when Drive create is forbidden", async () => {
    grantedScopesMock.mockResolvedValue([
      "https://www.googleapis.com/auth/documents",
    ]);
    tokenMock.mockResolvedValue({ ok: true, access_token: "tok-doc" });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({}),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ documentId: "doc-from-docs", title: "Collab brief" }),
      })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    const r = await createGoogleDoc({
      actor_entity_id: "actor-1",
      org_entity_id: "org-1",
      input: readyInput(),
    });
    vi.unstubAllGlobals();
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("expected created");
    expect(r.document_id).toBe("doc-from-docs");
  });

  it("provider 403 on both create paths → DOC_WRITE_SCOPE_MISSING (never fake CREATED)", async () => {
    grantedScopesMock.mockResolvedValue([
      "https://www.googleapis.com/auth/documents",
    ]);
    tokenMock.mockResolvedValue({ ok: true, access_token: "tok-doc" });
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 403, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    const r = await createGoogleDoc({
      actor_entity_id: "a",
      org_entity_id: "o",
      input: readyInput(),
    });
    vi.unstubAllGlobals();
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected blocked");
    expect(r.code).toBe("DOC_WRITE_SCOPE_MISSING");
  });

  it("blocks empty title before any provider call", async () => {
    grantedScopesMock.mockResolvedValue([
      "https://www.googleapis.com/auth/documents",
    ]);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const r = await createGoogleDoc({
      actor_entity_id: "a",
      org_entity_id: "o",
      input: { ...readyInput(), title: "" },
    });
    vi.unstubAllGlobals();
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected blocked");
    expect(r.code).toBe("NEEDS_TITLE");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
