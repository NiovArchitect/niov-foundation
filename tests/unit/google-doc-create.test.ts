// FILE: google-doc-create.test.ts (unit)
// PURPOSE: [GOOGLE-DOCS-WRITE] Non-empty body discipline + gates.

import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  grantedScopesMock,
  writeAuditEventMock,
  tokenMock,
  ledgerMock,
  findLedgerMock,
} = vi.hoisted(() => ({
  grantedScopesMock: vi.fn(),
  writeAuditEventMock: vi
    .fn()
    .mockResolvedValue({ audit_id: "00000000-0000-0000-0000-000000000001" }),
  tokenMock: vi.fn(),
  ledgerMock: vi.fn().mockResolvedValue({ ok: true, entry: {} }),
  findLedgerMock: vi.fn().mockResolvedValue(null),
}));

vi.mock("@niov/database", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    writeAuditEvent: writeAuditEventMock,
    prisma: {
      ...(typeof actual.prisma === "object" && actual.prisma !== null
        ? (actual.prisma as object)
        : {}),
      workLedgerEntry: {
        findFirst: findLedgerMock,
      },
    },
  };
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

const USEFUL_BODY = `# Project brief: Pilot

## 1. Objective
Ship the enterprise pilot.

## 2. Key decisions
- [CONFIRMED] Kickoff Thursday

## 3. Owners
- Owner: Product

## 4. Next actions
- [CONFIRMED] Circulate brief

## 5. Source and revision note
From structured facts only.
`;

function readyInput(over: Partial<GoogleDocCreateInput> = {}): GoogleDocCreateInput {
  return {
    title: "Collab brief",
    body_text: USEFUL_BODY,
    require_body: true,
    requires_approval: false,
    approved: false,
    caller_confirmed: true,
    ...over,
  };
}

beforeEach(() => {
  grantedScopesMock.mockReset();
  writeAuditEventMock.mockClear();
  tokenMock.mockReset();
  ledgerMock.mockClear();
  findLedgerMock.mockReset();
  findLedgerMock.mockResolvedValue(null);
  vi.unstubAllGlobals();
});

describe("firstUnmetDocGate", () => {
  it("requires body when require_body", () => {
    expect(
      firstUnmetDocGate(
        { ...readyInput(), body_text: "", require_body: true },
        true,
        true,
      ),
    ).toBe("BODY_REQUIRED");
  });

  it("returns null when ready", () => {
    expect(firstUnmetDocGate(readyInput(), true, true)).toBeNull();
  });
});

describe("createGoogleDoc", () => {
  it("blocks DOC_WRITE_SCOPE_MISSING", async () => {
    grantedScopesMock.mockResolvedValue([
      "https://www.googleapis.com/auth/drive.readonly",
    ]);
    const r = await createGoogleDoc({
      actor_entity_id: "a",
      org_entity_id: "o",
      input: readyInput(),
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("blocked");
    expect(r.code).toBe("DOC_WRITE_SCOPE_MISSING");
  });

  it("creates with body via Drive multipart and reports body_inserted", async () => {
    grantedScopesMock.mockResolvedValue([
      "https://www.googleapis.com/auth/drive.file",
    ]);
    tokenMock.mockResolvedValue({ ok: true, access_token: "tok-doc" });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: "doc-xyz",
        name: "Collab brief",
        webViewLink: "https://docs.google.com/document/d/doc-xyz/edit",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const r = await createGoogleDoc({
      actor_entity_id: "actor-1",
      org_entity_id: "org-1",
      input: readyInput({ project_id: "proj-1" }),
    });
    vi.unstubAllGlobals();
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("created");
    expect(r.document_id).toBe("doc-xyz");
    expect(r.body_inserted).toBe(true);
    expect(r.body_char_count).toBeGreaterThan(100);
    expect(r.project_id).toBe("proj-1");
    expect(String(fetchMock.mock.calls[0]![0])).toContain(
      "upload/drive/v3/files",
    );
    const audit = writeAuditEventMock.mock.calls.at(-1)?.[0] as {
      outcome: string;
      details: Record<string, unknown>;
    };
    expect(audit.outcome).toBe("SUCCESS");
    expect(audit.details.body_inserted).toBe(true);
    expect(ledgerMock).toHaveBeenCalled();
    const ledgerArg = ledgerMock.mock.calls[0]![0] as {
      project_id?: string;
      details: { body_inserted: boolean };
    };
    expect(ledgerArg.project_id).toBe("proj-1");
    expect(ledgerArg.details.body_inserted).toBe(true);
    expect(r.already_applied).toBe(false);
  });

  it("idempotent create returns prior document without second Drive write", async () => {
    grantedScopesMock.mockResolvedValue([
      "https://www.googleapis.com/auth/drive.file",
    ]);
    tokenMock.mockResolvedValue({ ok: true, access_token: "tok-doc" });
    findLedgerMock.mockResolvedValue({
      title: "Collab brief",
      details: {
        document_id: "doc-prior",
        web_view_link: "https://docs.google.com/document/d/doc-prior/edit",
        body_inserted: true,
        body_char_count: 400,
        idempotency_key: "doc:key:1",
      },
    });
    const fetchMock = vi.fn(async () => {
      throw new Error("provider must not be called on already_applied create");
    });
    vi.stubGlobal("fetch", fetchMock);
    const r = await createGoogleDoc({
      actor_entity_id: "actor-1",
      org_entity_id: "org-1",
      input: readyInput({
        project_id: "proj-1",
        idempotency_key: "doc:key:1",
      }),
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("expected ok");
    expect(r.document_id).toBe("doc-prior");
    expect(r.already_applied).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(ledgerMock).not.toHaveBeenCalled();
  });

  it("BODY_INSERT_FAILED when require_body and both paths leave body empty", async () => {
    grantedScopesMock.mockResolvedValue([
      "https://www.googleapis.com/auth/documents",
    ]);
    tokenMock.mockResolvedValue({ ok: true, access_token: "tok-doc" });
    // Multipart fails; Docs create ok; all batchUpdate fail
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes("upload/drive")) {
        return { ok: false, status: 403, json: async () => ({}) };
      }
      if (u.includes("docs.googleapis.com/v1/documents") && !u.includes("batchUpdate")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ documentId: "doc-empty", title: "T" }),
        };
      }
      // batchUpdate
      return { ok: false, status: 403, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", fetchMock);
    const r = await createGoogleDoc({
      actor_entity_id: "a",
      org_entity_id: "o",
      input: readyInput(),
    });
    vi.unstubAllGlobals();
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected fail");
    expect(r.code).toBe("BODY_INSERT_FAILED");
  });
});
