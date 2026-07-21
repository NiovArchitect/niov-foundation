// FILE: google-doc-append.test.ts
// PURPOSE: Typed append failures + idempotency marker + endOfSegment path.
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  grantedScopesMock,
  writeAuditEventMock,
  tokenMock,
  findLedgerMock,
} = vi.hoisted(() => ({
  grantedScopesMock: vi.fn(),
  writeAuditEventMock: vi
    .fn()
    .mockResolvedValue({ audit_id: "00000000-0000-0000-0000-000000000099" }),
  tokenMock: vi.fn(),
  findLedgerMock: vi.fn(),
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

import {
  appendGoogleDocBody,
  changeMarkerLine,
  mapProviderHttpToAppendCode,
} from "../../apps/api/src/services/connector/google-doc.service.js";

const DOC_ID = "1abcdefghijklmnopqrstuvwxyz0123456789ABCD";

beforeEach(() => {
  grantedScopesMock.mockReset();
  writeAuditEventMock.mockClear();
  tokenMock.mockReset();
  findLedgerMock.mockReset();
  // Default: org owns the document (append path under test).
  findLedgerMock.mockResolvedValue({
    ledger_entry_id: "00000000-0000-0000-0000-000000000001",
  });
  vi.unstubAllGlobals();
});

describe("mapProviderHttpToAppendCode", () => {
  it("maps provider HTTP classes to typed codes", () => {
    expect(mapProviderHttpToAppendCode(401)).toBe("DOC_WRITE_PERMISSION_DENIED");
    expect(mapProviderHttpToAppendCode(403)).toBe("DOC_WRITE_PERMISSION_DENIED");
    expect(mapProviderHttpToAppendCode(404)).toBe("DOC_ARTIFACT_NOT_FOUND");
    expect(mapProviderHttpToAppendCode(400)).toBe("DOC_PROVIDER_REQUEST_INVALID");
    expect(mapProviderHttpToAppendCode(409)).toBe("DOC_REVISION_CONFLICT");
    expect(mapProviderHttpToAppendCode(500)).toBe("DOC_PROVIDER_WRITE_FAILED");
  });
});

describe("changeMarkerLine", () => {
  it("sanitizes idempotency keys", () => {
    expect(changeMarkerLine("mat:risk:1")).toContain("otzar-change:");
    expect(changeMarkerLine("a b/c!")).not.toMatch(/[ /!]/);
  });
});

describe("appendGoogleDocBody", () => {
  it("returns DOC_PROVIDER_ID_MISSING when document_id empty", async () => {
    const r = await appendGoogleDocBody({
      actor_entity_id: "a",
      org_entity_id: "o",
      input: { document_id: "", body_text: "x", caller_confirmed: true },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("DOC_PROVIDER_ID_MISSING");
  });

  it("returns BODY_REQUIRED for empty material body", async () => {
    const r = await appendGoogleDocBody({
      actor_entity_id: "a",
      org_entity_id: "o",
      input: {
        document_id: DOC_ID,
        body_text: "   ",
        caller_confirmed: true,
        change_kind: "MATERIAL",
      },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("BODY_REQUIRED");
  });

  it("returns NEEDS_CALLER_CONFIRMATION without confirm", async () => {
    const r = await appendGoogleDocBody({
      actor_entity_id: "a",
      org_entity_id: "o",
      input: { document_id: DOC_ID, body_text: "risk", caller_confirmed: false },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("NEEDS_CALLER_CONFIRMATION");
  });

  it("returns DOC_SCOPE_INSUFFICIENT when scopes lack write", async () => {
    grantedScopesMock.mockResolvedValue([
      "https://www.googleapis.com/auth/calendar.readonly",
    ]);
    tokenMock.mockResolvedValue({ ok: true, access_token: "tok" });
    const r = await appendGoogleDocBody({
      actor_entity_id: "a",
      org_entity_id: "o",
      input: {
        document_id: DOC_ID,
        body_text: "risk",
        caller_confirmed: true,
      },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("DOC_SCOPE_INSUFFICIENT");
  });

  it("appends via endOfSegmentLocation and returns MATERIAL", async () => {
    grantedScopesMock.mockResolvedValue([
      "https://www.googleapis.com/auth/documents",
      "https://www.googleapis.com/auth/drive.file",
    ]);
    tokenMock.mockResolvedValue({ ok: true, access_token: "tok" });
    const fetchMock = vi.fn(async (url: string, init?: { method?: string }) => {
      const u = String(url);
      if (u.includes(":batchUpdate") && init?.method === "POST") {
        return { ok: true, status: 200, json: async () => ({}) };
      }
      if (u.includes("/export")) {
        return { ok: true, status: 200, text: async () => "prior body" };
      }
      return { ok: true, status: 200, json: async () => ({ body: { content: [] } }) };
    });
    vi.stubGlobal("fetch", fetchMock);

    const r = await appendGoogleDocBody({
      actor_entity_id: "a",
      org_entity_id: "o",
      input: {
        document_id: DOC_ID,
        body_text:
          "The project risk register now includes a dependency that must be resolved before the September 18 milestone.",
        caller_confirmed: true,
        change_kind: "MATERIAL",
        idempotency_key: "mat:risk:sep18",
      },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.materiality).toBe("MATERIAL");
      expect(r.already_applied).toBe(false);
      expect(r.body_char_count).toBeGreaterThan(0);
    }
    const batchCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes(":batchUpdate"),
    );
    expect(batchCalls.length).toBeGreaterThanOrEqual(1);
    const body = String((batchCalls[0]?.[1] as { body?: string })?.body ?? "");
    expect(body).toContain("endOfSegmentLocation");
  });

  it("reconciles when idempotency marker already present", async () => {
    grantedScopesMock.mockResolvedValue([
      "https://www.googleapis.com/auth/documents",
      "https://www.googleapis.com/auth/drive.file",
    ]);
    tokenMock.mockResolvedValue({ ok: true, access_token: "tok" });
    const marker = changeMarkerLine("mat:risk:sep18");
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/export")) {
        return {
          ok: true,
          status: 200,
          text: async () => `prior\n${marker}\nalready there`,
        };
      }
      throw new Error("batchUpdate should not run");
    });
    vi.stubGlobal("fetch", fetchMock);
    const r = await appendGoogleDocBody({
      actor_entity_id: "a",
      org_entity_id: "o",
      input: {
        document_id: DOC_ID,
        body_text: "duplicate",
        caller_confirmed: true,
        idempotency_key: "mat:risk:sep18",
      },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.already_applied).toBe(true);
      expect(r.body_char_count).toBe(0);
    }
  });

  it("applies FORMATTING_ONLY via updateTextStyle", async () => {
    grantedScopesMock.mockResolvedValue([
      "https://www.googleapis.com/auth/documents",
    ]);
    tokenMock.mockResolvedValue({ ok: true, access_token: "tok" });
    const fetchMock = vi.fn(async (url: string, init?: { method?: string }) => {
      const u = String(url);
      if (u.includes("documents/") && !u.includes("batchUpdate") && init?.method !== "POST") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            body: { content: [{ endIndex: 40 }, { endIndex: 80 }] },
          }),
        };
      }
      if (u.includes(":batchUpdate")) {
        return { ok: true, status: 200, json: async () => ({}) };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", fetchMock);
    const r = await appendGoogleDocBody({
      actor_entity_id: "a",
      org_entity_id: "o",
      input: {
        document_id: DOC_ID,
        body_text: "",
        caller_confirmed: true,
        change_kind: "FORMATTING_ONLY",
      },
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.materiality).toBe("FORMATTING_ONLY");
    const batch = fetchMock.mock.calls.find((c) =>
      String(c[0]).includes(":batchUpdate"),
    );
    const body = String((batch?.[1] as { body?: string })?.body ?? "");
    expect(body).toContain("updateTextStyle");
    expect(body).toContain("bold");
  });

  it("falls back to Drive rewrite when Docs batchUpdate is 403", async () => {
    grantedScopesMock.mockResolvedValue([
      "https://www.googleapis.com/auth/drive.file",
    ]);
    tokenMock.mockResolvedValue({ ok: true, access_token: "tok" });
    const fetchMock = vi.fn(async (url: string, init?: { method?: string }) => {
      const u = String(url);
      if (u.includes(":batchUpdate")) {
        return { ok: false, status: 403, json: async () => ({ error: "denied" }) };
      }
      if (u.includes("/export")) {
        return { ok: true, status: 200, text: async () => "prior body text" };
      }
      if (u.includes("upload/drive") && init?.method === "PATCH") {
        return { ok: true, status: 200, json: async () => ({ id: DOC_ID }) };
      }
      return { ok: false, status: 500, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", fetchMock);

    const r = await appendGoogleDocBody({
      actor_entity_id: "a",
      org_entity_id: "o",
      input: {
        document_id: DOC_ID,
        body_text:
          "The project risk register now includes a dependency that must be resolved before the September 18 milestone.",
        caller_confirmed: true,
        change_kind: "MATERIAL",
        idempotency_key: "mat:risk:drive-fallback",
      },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.materiality).toBe("MATERIAL");
      expect(r.already_applied).toBe(false);
    }
    const drivePatch = fetchMock.mock.calls.find(
      (c) =>
        String(c[0]).includes("upload/drive") &&
        (c[1] as { method?: string })?.method === "PATCH",
    );
    expect(drivePatch).toBeDefined();
    const patchBody = String((drivePatch?.[1] as { body?: string })?.body ?? "");
    expect(patchBody).toContain("Material change");
    expect(patchBody).toContain("otzar-change:");
  });

  it("FORMATTING_ONLY falls back to Drive HTML rewrite on Docs 403", async () => {
    grantedScopesMock.mockResolvedValue([
      "https://www.googleapis.com/auth/drive.file",
    ]);
    tokenMock.mockResolvedValue({ ok: true, access_token: "tok" });
    const fetchMock = vi.fn(async (url: string, init?: { method?: string }) => {
      const u = String(url);
      // Docs get structure + batchUpdate both denied.
      if (u.includes("docs.googleapis.com")) {
        return { ok: false, status: 403, json: async () => ({}) };
      }
      if (u.includes("/export")) {
        return {
          ok: true,
          status: 200,
          text: async () => "Title line\nBody paragraph",
        };
      }
      if (u.includes("upload/drive") && init?.method === "PATCH") {
        return { ok: true, status: 200, json: async () => ({ id: DOC_ID }) };
      }
      return { ok: false, status: 500, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", fetchMock);

    const r = await appendGoogleDocBody({
      actor_entity_id: "a",
      org_entity_id: "o",
      input: {
        document_id: DOC_ID,
        body_text: "",
        caller_confirmed: true,
        change_kind: "FORMATTING_ONLY",
      },
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.materiality).toBe("FORMATTING_ONLY");
    const drivePatch = fetchMock.mock.calls.find(
      (c) =>
        String(c[0]).includes("upload/drive") &&
        (c[1] as { method?: string })?.method === "PATCH",
    );
    expect(drivePatch).toBeDefined();
    const patchBody = String((drivePatch?.[1] as { body?: string })?.body ?? "");
    expect(patchBody).toContain("<b>");
    expect(patchBody).toContain("Title line");
  });

  it("returns DOC_ARTIFACT_NOT_FOUND when org has no DOCUMENT ledger for id", async () => {
    grantedScopesMock.mockResolvedValue([
      "https://www.googleapis.com/auth/drive.file",
    ]);
    tokenMock.mockResolvedValue({ ok: true, access_token: "tok" });
    findLedgerMock.mockResolvedValue(null);
    const fetchMock = vi.fn(async () => {
      throw new Error("provider must not be called without org ownership");
    });
    vi.stubGlobal("fetch", fetchMock);

    const r = await appendGoogleDocBody({
      actor_entity_id: "a",
      org_entity_id: "foreign-org",
      input: {
        document_id: DOC_ID,
        body_text: "foreign should not append",
        caller_confirmed: true,
      },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("DOC_ARTIFACT_NOT_FOUND");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns typed DOC_WRITE_PERMISSION_DENIED when Docs and Drive both fail", async () => {
    grantedScopesMock.mockResolvedValue([
      "https://www.googleapis.com/auth/drive.file",
    ]);
    tokenMock.mockResolvedValue({ ok: true, access_token: "tok" });
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes(":batchUpdate")) {
        return { ok: false, status: 403, json: async () => ({}) };
      }
      if (String(url).includes("/export")) {
        return { ok: false, status: 403, text: async () => "" };
      }
      return { ok: false, status: 403, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", fetchMock);

    const r = await appendGoogleDocBody({
      actor_entity_id: "a",
      org_entity_id: "o",
      input: {
        document_id: DOC_ID,
        body_text: "material",
        caller_confirmed: true,
      },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("DOC_WRITE_PERMISSION_DENIED");
      expect(r.provider_http_status).toBe(403);
    }
  });
});
