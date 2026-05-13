/**
 * FILE: apps/api/src/services/cosmp-client.ts
 *
 * PURPOSE: gRPC client for the COSMP coordination layer per ADR-0032
 *          (BEAM gRPC Interop Architecture). Wraps the 7
 *          patent-canonical COSMP operations (AUTHENTICATE, NEGOTIATE,
 *          READ, WRITE, SHARE, REVOKE, AUDIT per US 12,517,919) as
 *          typed async methods routing through gRPC to the Elixir
 *          CosmpRouter.Router GenServer at apps/cosmp_router/.
 *
 * PATENT-CANONICAL ROLE: 7 methods mirror the 7 COSMP ops verbatim;
 *          Capsule type carries 7-layer patent structure per ADR-0031
 *          Q-J + US 12,517,919 layer ordering (payload / metadata /
 *          rules / relations / time / permissions / audit).
 *
 * Q-V PARALLEL PATH: This client is ADDITIVE to existing
 *          apps/api/src/services/cosmp/ in-process services
 *          (negotiate.service.ts, read.service.ts, write.service.ts,
 *          share.service.ts). Sub-phase 5b-i does NOT replace existing
 *          services; migration deferred to sub-phase 6 or sub-phase
 *          11+ per operator decision.
 *
 * CONNECTS TO:
 *   apps/cosmp_router/priv/protos/cosmp.proto (canonical schema)
 *   apps/cosmp_router/lib/cosmp_router/grpc/server.ex (Elixir-side
 *     handler functions; one per RPC)
 *
 * LAZY-INIT SINGLETON: gRPC client connection lazy-instantiated on
 *   first call; @grpc/grpc-js handles reconnection internally per
 *   HTTP/2 multiplexing semantics.
 */

import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import * as path from "path";

// Resolve .proto file location relative to this source file.
// Path: apps/api/src/services/cosmp-client.ts
//   → apps/cosmp_router/priv/protos/cosmp.proto
const PROTO_PATH = path.resolve(
  __dirname,
  "../../../cosmp_router/priv/protos/cosmp.proto",
);

const DEFAULT_ADDRESS = "localhost:50051";

// ----------------------------------------------------------------------------
// Typed shapes mirroring cosmp.proto
// ----------------------------------------------------------------------------

export interface CapsuleProto {
  payload?: Buffer | Uint8Array | string;
  metadata?: Record<string, string>;
  rules?: Array<{ name: string; value: string }>;
  relations?: Array<{ kind: string; target_id: string }>;
  time?: { created_at: number; modified_at: number; expires_at: number };
  permissions?: { owner: string; granted_to: string[] };
  audit?: Array<{ event_type: string; actor: string; timestamp: number }>;
}

export interface CosmpError {
  kind: string;
  message: string;
  details?: Record<string, string>;
}

export interface AuthenticateRpcRequest {
  capsule: CapsuleProto;
  principal_id: string;
}

export interface AuthenticateRpcResponse {
  success?: { authenticated: boolean; principal_id: string };
  error?: CosmpError;
}

export interface NegotiateRpcRequest {
  capsule: CapsuleProto;
  requested_scopes: string[];
}

export interface NegotiateRpcResponse {
  success?: { granted_scopes: string[] };
  error?: CosmpError;
}

export interface ReadRpcRequest {
  capsule_id: string;
}

export interface ReadRpcResponse {
  capsule?: CapsuleProto;
  error?: CosmpError;
}

export interface WriteRpcRequest {
  capsule_id: string;
  capsule: CapsuleProto;
}

export interface WriteRpcResponse {
  success?: { capsule_id: string };
  error?: CosmpError;
}

export interface ShareRpcRequest {
  capsule_id: string;
  grantee: string;
}

export interface ShareRpcResponse {
  success?: { capsule_id: string; granted_to: string[] };
  error?: CosmpError;
}

export interface RevokeRpcRequest {
  capsule_id: string;
  grantee: string;
}

export interface RevokeRpcResponse {
  success?: { capsule_id: string; remaining_grantees: string[] };
  error?: CosmpError;
}

export interface AuditRpcRequest {
  capsule_id: string;
}

export interface AuditRpcResponse {
  success?: {
    entries: Array<{ event_type: string; actor: string; timestamp: number }>;
  };
  error?: CosmpError;
}

// ----------------------------------------------------------------------------
// Lazy-init client singleton
// ----------------------------------------------------------------------------

// Loose type for proto-loaded gRPC client (dynamic at runtime; specific
// methods asserted via wrapper functions below).
type CosmpRpcClient = {
  Authenticate: (
    req: AuthenticateRpcRequest,
    cb: (err: Error | null, resp: AuthenticateRpcResponse) => void,
  ) => void;
  Negotiate: (
    req: NegotiateRpcRequest,
    cb: (err: Error | null, resp: NegotiateRpcResponse) => void,
  ) => void;
  Read: (
    req: ReadRpcRequest,
    cb: (err: Error | null, resp: ReadRpcResponse) => void,
  ) => void;
  Write: (
    req: WriteRpcRequest,
    cb: (err: Error | null, resp: WriteRpcResponse) => void,
  ) => void;
  Share: (
    req: ShareRpcRequest,
    cb: (err: Error | null, resp: ShareRpcResponse) => void,
  ) => void;
  Revoke: (
    req: RevokeRpcRequest,
    cb: (err: Error | null, resp: RevokeRpcResponse) => void,
  ) => void;
  Audit: (
    req: AuditRpcRequest,
    cb: (err: Error | null, resp: AuditRpcResponse) => void,
  ) => void;
  close: () => void;
};

let _client: CosmpRpcClient | null = null;

function getClient(): CosmpRpcClient {
  if (_client) return _client;

  const packageDef = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  });
  const protoDescriptor = grpc.loadPackageDefinition(packageDef);

  // Navigate to `cosmp.v1.CosmpRouter` per .proto `package cosmp.v1` +
  // `service CosmpRouter`.
  const cosmpV1 = (protoDescriptor as Record<string, unknown>).cosmp as Record<
    string,
    unknown
  >;
  const v1 = cosmpV1.v1 as Record<string, unknown>;
  const CosmpRouterCtor = v1.CosmpRouter as new (
    address: string,
    credentials: grpc.ChannelCredentials,
  ) => CosmpRpcClient;

  const address = process.env.COSMP_ROUTER_ADDRESS ?? DEFAULT_ADDRESS;
  _client = new CosmpRouterCtor(address, grpc.credentials.createInsecure());

  return _client;
}

/**
 * Reset the singleton client. Test-only — production code uses the
 * lazy-init path.
 */
export function resetClient(): void {
  if (_client) {
    _client.close();
    _client = null;
  }
}

// ----------------------------------------------------------------------------
// 7 patent-canonical COSMP op methods (per US 12,517,919)
// ----------------------------------------------------------------------------

function promisify<Req, Resp>(
  rpcName: keyof CosmpRpcClient,
  req: Req,
): Promise<Resp> {
  return new Promise((resolve, reject) => {
    const client = getClient();
    // dispatch the RPC; rpcName is one of the 7 method names
    const rpc = (client as unknown as Record<string, unknown>)[
      rpcName as string
    ] as (req: Req, cb: (err: Error | null, resp: Resp) => void) => void;

    rpc.call(client, req, (err, resp) => {
      if (err) reject(err);
      else resolve(resp);
    });
  });
}

export async function authenticate(
  req: AuthenticateRpcRequest,
): Promise<AuthenticateRpcResponse> {
  return promisify<AuthenticateRpcRequest, AuthenticateRpcResponse>(
    "Authenticate",
    req,
  );
}

export async function negotiate(
  req: NegotiateRpcRequest,
): Promise<NegotiateRpcResponse> {
  return promisify<NegotiateRpcRequest, NegotiateRpcResponse>("Negotiate", req);
}

export async function read(req: ReadRpcRequest): Promise<ReadRpcResponse> {
  return promisify<ReadRpcRequest, ReadRpcResponse>("Read", req);
}

export async function write(req: WriteRpcRequest): Promise<WriteRpcResponse> {
  return promisify<WriteRpcRequest, WriteRpcResponse>("Write", req);
}

export async function share(req: ShareRpcRequest): Promise<ShareRpcResponse> {
  return promisify<ShareRpcRequest, ShareRpcResponse>("Share", req);
}

export async function revoke(
  req: RevokeRpcRequest,
): Promise<RevokeRpcResponse> {
  return promisify<RevokeRpcRequest, RevokeRpcResponse>("Revoke", req);
}

export async function audit(req: AuditRpcRequest): Promise<AuditRpcResponse> {
  return promisify<AuditRpcRequest, AuditRpcResponse>("Audit", req);
}
