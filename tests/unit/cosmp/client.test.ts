// FILE: client.test.ts (unit)
// PURPOSE: Verify the COSMP gRPC client (cosmp-client.ts) wraps the
//          7 patent-canonical COSMP ops with correct request
//          dispatch, response unwrapping, lazy-init singleton
//          behavior, and error propagation through both the gRPC
//          channel and the CosmpError envelope per ADR-0032.
// CONNECTS TO: apps/api/src/services/cosmp-client.ts (system under
//              test), @grpc/grpc-js + @grpc/proto-loader (mocked).
//              Sub-phase 6 [BEAM-COSMP-INTEGRATION-TESTS] will add
//              the end-to-end register against the live Elixir
//              CosmpRouter gRPC server.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock() is hoisted above the import block by Vitest, so
// cosmp-client.ts sees the mocked @grpc/grpc-js + @grpc/proto-loader
// at module-evaluation time. The factory return exposes internal
// mock handles (__mockClient, __mockCtor) as named exports the
// tests reach via a type-cast on the module namespace.
vi.mock("@grpc/proto-loader", () => ({
  loadSync: vi.fn(() => ({})),
}));

vi.mock("@grpc/grpc-js", () => {
  const mockClient = {
    Authenticate: vi.fn(),
    Negotiate: vi.fn(),
    Read: vi.fn(),
    Write: vi.fn(),
    Share: vi.fn(),
    Revoke: vi.fn(),
    Audit: vi.fn(),
    close: vi.fn(),
  };
  const CosmpRouterCtor = vi.fn(() => mockClient);
  return {
    credentials: { createInsecure: vi.fn(() => ({})) },
    loadPackageDefinition: vi.fn(() => ({
      cosmp: { v1: { CosmpRouter: CosmpRouterCtor } },
    })),
    __mockClient: mockClient,
    __mockCtor: CosmpRouterCtor,
  };
});

import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import {
  audit,
  authenticate,
  negotiate,
  read,
  resetClient,
  revoke,
  share,
  write,
  type AuditRpcRequest,
  type AuditRpcResponse,
  type AuthenticateRpcRequest,
  type AuthenticateRpcResponse,
  type CapsuleProto,
  type CosmpError,
  type NegotiateRpcRequest,
  type NegotiateRpcResponse,
  type ReadRpcRequest,
  type ReadRpcResponse,
  type RevokeRpcRequest,
  type RevokeRpcResponse,
  type ShareRpcRequest,
  type ShareRpcResponse,
  type WriteRpcRequest,
  type WriteRpcResponse,
} from "@niov/api";

type MockedClient = {
  Authenticate: ReturnType<typeof vi.fn>;
  Negotiate: ReturnType<typeof vi.fn>;
  Read: ReturnType<typeof vi.fn>;
  Write: ReturnType<typeof vi.fn>;
  Share: ReturnType<typeof vi.fn>;
  Revoke: ReturnType<typeof vi.fn>;
  Audit: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
};

// WHAT: Reach the mock client object the vi.mock factory exposed
//        via the __mockClient escape hatch.
// INPUT: None.
// OUTPUT: The 7-RPC-method + close() mocked CosmpRpcClient instance.
// WHY: The factory closure cannot surface state into the test scope
//      directly; the named __mockClient export is the only bridge.
function getMockedClient(): MockedClient {
  return (grpc as unknown as { __mockClient: MockedClient }).__mockClient;
}

// WHAT: Reach the mocked CosmpRouter constructor vi.fn.
// INPUT: None.
// OUTPUT: The mocked ctor; .mock.calls tracks instantiations.
// WHY: Lazy-init tests assert the ctor fires exactly once across
//      multiple op invocations and re-fires after resetClient().
function getMockedCtor(): ReturnType<typeof vi.fn> {
  return (grpc as unknown as { __mockCtor: ReturnType<typeof vi.fn> })
    .__mockCtor;
}

beforeEach(() => {
  // Tear down any singleton left by the prior test, then clear all
  // mock call history. mockClear preserves factory-installed
  // implementations; per-test stubs use mockImplementationOnce so
  // they self-consume.
  resetClient();
  vi.clearAllMocks();
});

afterEach(() => {
  resetClient();
});

// ============================================================================
// Module surface — 7 op functions + resetClient exported via @niov/api barrel
// ============================================================================

describe("cosmp-client module surface", () => {
  it("exports the 7 patent-canonical COSMP op functions", () => {
    expect(typeof authenticate).toBe("function");
    expect(typeof negotiate).toBe("function");
    expect(typeof read).toBe("function");
    expect(typeof write).toBe("function");
    expect(typeof share).toBe("function");
    expect(typeof revoke).toBe("function");
    expect(typeof audit).toBe("function");
  });

  it("exports resetClient for test-discipline teardown", () => {
    expect(typeof resetClient).toBe("function");
  });
});

// ============================================================================
// 7 op dispatch — request shape correctness + happy-path response
// ============================================================================

describe("Authenticate dispatch", () => {
  it("invokes the gRPC Authenticate method with the request payload", async () => {
    const client = getMockedClient();
    const resp: AuthenticateRpcResponse = {
      success: { authenticated: true, principal_id: "p-1" },
    };
    client.Authenticate.mockImplementationOnce(
      (
        _req: AuthenticateRpcRequest,
        cb: (err: null, r: AuthenticateRpcResponse) => void,
      ) => {
        cb(null, resp);
      },
    );
    const req: AuthenticateRpcRequest = {
      capsule: { payload: "x" },
      principal_id: "p-1",
    };
    await expect(authenticate(req)).resolves.toEqual(resp);
    expect(client.Authenticate).toHaveBeenCalledWith(
      req,
      expect.any(Function),
    );
  });
});

describe("Negotiate dispatch", () => {
  it("invokes the gRPC Negotiate method with the request payload", async () => {
    const client = getMockedClient();
    const resp: NegotiateRpcResponse = {
      success: { granted_scopes: ["read"] },
    };
    client.Negotiate.mockImplementationOnce(
      (
        _req: NegotiateRpcRequest,
        cb: (err: null, r: NegotiateRpcResponse) => void,
      ) => {
        cb(null, resp);
      },
    );
    const req: NegotiateRpcRequest = {
      capsule: { payload: "x" },
      requested_scopes: ["read", "write"],
    };
    await expect(negotiate(req)).resolves.toEqual(resp);
    expect(client.Negotiate).toHaveBeenCalledWith(req, expect.any(Function));
  });
});

describe("Read dispatch", () => {
  it("invokes the gRPC Read method with the capsule_id", async () => {
    const client = getMockedClient();
    const capsule: CapsuleProto = { payload: "x", metadata: { k: "v" } };
    const resp: ReadRpcResponse = { capsule };
    client.Read.mockImplementationOnce(
      (_req: ReadRpcRequest, cb: (err: null, r: ReadRpcResponse) => void) => {
        cb(null, resp);
      },
    );
    const req: ReadRpcRequest = { capsule_id: "c-1" };
    await expect(read(req)).resolves.toEqual(resp);
    expect(client.Read).toHaveBeenCalledWith(req, expect.any(Function));
  });
});

describe("Write dispatch", () => {
  it("invokes the gRPC Write method with the capsule_id + capsule", async () => {
    const client = getMockedClient();
    const resp: WriteRpcResponse = { success: { capsule_id: "c-1" } };
    client.Write.mockImplementationOnce(
      (
        _req: WriteRpcRequest,
        cb: (err: null, r: WriteRpcResponse) => void,
      ) => {
        cb(null, resp);
      },
    );
    const req: WriteRpcRequest = {
      capsule_id: "c-1",
      capsule: { payload: "new" },
    };
    await expect(write(req)).resolves.toEqual(resp);
    expect(client.Write).toHaveBeenCalledWith(req, expect.any(Function));
  });
});

describe("Share dispatch", () => {
  it("invokes the gRPC Share method with the capsule_id + grantee", async () => {
    const client = getMockedClient();
    const resp: ShareRpcResponse = {
      success: { capsule_id: "c-1", granted_to: ["g-1"] },
    };
    client.Share.mockImplementationOnce(
      (
        _req: ShareRpcRequest,
        cb: (err: null, r: ShareRpcResponse) => void,
      ) => {
        cb(null, resp);
      },
    );
    const req: ShareRpcRequest = { capsule_id: "c-1", grantee: "g-1" };
    await expect(share(req)).resolves.toEqual(resp);
    expect(client.Share).toHaveBeenCalledWith(req, expect.any(Function));
  });
});

describe("Revoke dispatch", () => {
  it("invokes the gRPC Revoke method with the capsule_id + grantee", async () => {
    const client = getMockedClient();
    const resp: RevokeRpcResponse = {
      success: { capsule_id: "c-1", remaining_grantees: [] },
    };
    client.Revoke.mockImplementationOnce(
      (
        _req: RevokeRpcRequest,
        cb: (err: null, r: RevokeRpcResponse) => void,
      ) => {
        cb(null, resp);
      },
    );
    const req: RevokeRpcRequest = { capsule_id: "c-1", grantee: "g-1" };
    await expect(revoke(req)).resolves.toEqual(resp);
    expect(client.Revoke).toHaveBeenCalledWith(req, expect.any(Function));
  });
});

describe("Audit dispatch", () => {
  it("invokes the gRPC Audit method with the capsule_id", async () => {
    const client = getMockedClient();
    const resp: AuditRpcResponse = {
      success: {
        entries: [{ event_type: "WRITE", actor: "a-1", timestamp: 100 }],
      },
    };
    client.Audit.mockImplementationOnce(
      (
        _req: AuditRpcRequest,
        cb: (err: null, r: AuditRpcResponse) => void,
      ) => {
        cb(null, resp);
      },
    );
    const req: AuditRpcRequest = { capsule_id: "c-1" };
    await expect(audit(req)).resolves.toEqual(resp);
    expect(client.Audit).toHaveBeenCalledWith(req, expect.any(Function));
  });
});

// ============================================================================
// Full 7-layer CapsuleProto round-trip — validates patent layer carriage
// ============================================================================

describe("CapsuleProto 7-layer round-trip", () => {
  it("carries all 7 patent layers through an AuthenticateRpcRequest", async () => {
    const full: CapsuleProto = {
      payload: Buffer.from("layer-1"),
      metadata: { lang: "en" },
      rules: [{ name: "ttl", value: "3600" }],
      relations: [{ kind: "child", target_id: "c-2" }],
      time: { created_at: 1, modified_at: 2, expires_at: 3 },
      permissions: { owner: "owner-1", granted_to: ["g-1", "g-2"] },
      audit: [{ event_type: "WRITE", actor: "a-1", timestamp: 100 }],
    };
    const client = getMockedClient();
    client.Authenticate.mockImplementationOnce(
      (
        _req: AuthenticateRpcRequest,
        cb: (err: null, r: AuthenticateRpcResponse) => void,
      ) => {
        cb(null, { success: { authenticated: true, principal_id: "p-1" } });
      },
    );
    await authenticate({ capsule: full, principal_id: "p-1" });
    const callArgs = client.Authenticate.mock.calls[0] as
      | [AuthenticateRpcRequest, unknown]
      | undefined;
    expect(callArgs).toBeDefined();
    expect(callArgs![0]!.capsule).toEqual(full);
  });
});

// ============================================================================
// Error propagation — gRPC channel + CosmpError envelope
// ============================================================================

describe("error propagation", () => {
  it("rejects the promise when the gRPC callback emits an Error", async () => {
    const client = getMockedClient();
    const grpcError = new Error("transport failure");
    client.Read.mockImplementationOnce(
      (
        _req: ReadRpcRequest,
        cb: (err: Error, r: undefined) => void,
      ) => {
        cb(grpcError, undefined);
      },
    );
    await expect(read({ capsule_id: "c-1" })).rejects.toBe(grpcError);
  });

  it("surfaces CosmpError envelope in the success Response without rejecting", async () => {
    const client = getMockedClient();
    const errEnvelope: CosmpError = {
      kind: "PERMISSION_DENIED",
      message: "denied",
      details: { reason: "no scope" },
    };
    const errResp: ReadRpcResponse = { error: errEnvelope };
    client.Read.mockImplementationOnce(
      (_req: ReadRpcRequest, cb: (err: null, r: ReadRpcResponse) => void) => {
        cb(null, errResp);
      },
    );
    const resp = await read({ capsule_id: "c-2" });
    expect(resp).toEqual(errResp);
    expect(resp.error).toEqual(errEnvelope);
    expect(resp.capsule).toBeUndefined();
  });
});

// ============================================================================
// Lazy-init singleton + resetClient — indirect via mock call counts
// ============================================================================

describe("lazy-init singleton behavior", () => {
  it("calls protoLoader.loadSync exactly once across N op invocations", async () => {
    const client = getMockedClient();
    const okResp: AuthenticateRpcResponse = {
      success: { authenticated: true, principal_id: "p" },
    };
    const handler = (
      _req: AuthenticateRpcRequest,
      cb: (err: null, r: AuthenticateRpcResponse) => void,
    ): void => cb(null, okResp);
    client.Authenticate.mockImplementationOnce(handler)
      .mockImplementationOnce(handler)
      .mockImplementationOnce(handler);

    await authenticate({ capsule: {}, principal_id: "p" });
    await authenticate({ capsule: {}, principal_id: "p" });
    await authenticate({ capsule: {}, principal_id: "p" });

    expect(vi.mocked(protoLoader.loadSync)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(grpc.loadPackageDefinition)).toHaveBeenCalledTimes(1);
    expect(getMockedCtor()).toHaveBeenCalledTimes(1);
    expect(client.Authenticate).toHaveBeenCalledTimes(3);
  });

  it("resetClient closes the prior client and forces re-init on next op", async () => {
    const client = getMockedClient();
    const okResp: AuthenticateRpcResponse = {
      success: { authenticated: true, principal_id: "p" },
    };
    const handler = (
      _req: AuthenticateRpcRequest,
      cb: (err: null, r: AuthenticateRpcResponse) => void,
    ): void => cb(null, okResp);
    client.Authenticate.mockImplementationOnce(handler).mockImplementationOnce(
      handler,
    );

    await authenticate({ capsule: {}, principal_id: "p" });
    expect(vi.mocked(protoLoader.loadSync)).toHaveBeenCalledTimes(1);
    expect(client.close).not.toHaveBeenCalled();

    resetClient();
    expect(client.close).toHaveBeenCalledTimes(1);

    await authenticate({ capsule: {}, principal_id: "p" });
    expect(vi.mocked(protoLoader.loadSync)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(grpc.loadPackageDefinition)).toHaveBeenCalledTimes(2);
    expect(getMockedCtor()).toHaveBeenCalledTimes(2);
  });

  it("resetClient is a no-op when no client has been instantiated", () => {
    const client = getMockedClient();
    resetClient();
    expect(client.close).not.toHaveBeenCalled();
  });
});

// ============================================================================
// Address resolution — env override + default fallback
// ============================================================================

describe("address resolution", () => {
  it("passes COSMP_ROUTER_ADDRESS to the gRPC ctor when set", async () => {
    const prior = process.env.COSMP_ROUTER_ADDRESS;
    process.env.COSMP_ROUTER_ADDRESS = "test-host:9999";
    try {
      const client = getMockedClient();
      client.Authenticate.mockImplementationOnce(
        (
          _req: AuthenticateRpcRequest,
          cb: (err: null, r: AuthenticateRpcResponse) => void,
        ) => {
          cb(null, { success: { authenticated: true, principal_id: "p" } });
        },
      );
      await authenticate({ capsule: {}, principal_id: "p" });
      expect(getMockedCtor()).toHaveBeenCalledWith(
        "test-host:9999",
        expect.anything(),
      );
    } finally {
      if (prior === undefined) {
        delete process.env.COSMP_ROUTER_ADDRESS;
      } else {
        process.env.COSMP_ROUTER_ADDRESS = prior;
      }
    }
  });

  it("falls back to localhost:50051 when COSMP_ROUTER_ADDRESS is unset", async () => {
    const prior = process.env.COSMP_ROUTER_ADDRESS;
    delete process.env.COSMP_ROUTER_ADDRESS;
    try {
      const client = getMockedClient();
      client.Authenticate.mockImplementationOnce(
        (
          _req: AuthenticateRpcRequest,
          cb: (err: null, r: AuthenticateRpcResponse) => void,
        ) => {
          cb(null, { success: { authenticated: true, principal_id: "p" } });
        },
      );
      await authenticate({ capsule: {}, principal_id: "p" });
      expect(getMockedCtor()).toHaveBeenCalledWith(
        "localhost:50051",
        expect.anything(),
      );
    } finally {
      if (prior !== undefined) process.env.COSMP_ROUTER_ADDRESS = prior;
    }
  });
});
