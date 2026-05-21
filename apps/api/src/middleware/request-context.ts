// FILE: request-context.ts
// PURPOSE: Extract the minimal client-context fields (ip_address + user_agent)
//          from a Fastify request for AuthService.validateSession. One place so
//          the normal-use callers do not duplicate header/IP extraction.
// CONNECTS TO: auth.service.ts (ValidateSessionContext) and the normal-use
//              validateSession callers (auth.middleware, admin.middleware,
//              developer.routes, working-set.routes, wallet.routes).

import type { FastifyRequest } from "fastify";
import type { ValidateSessionContext } from "../services/auth.service.js";

// WHAT: Build the validateSession client-context from a Fastify request.
// INPUT: The Fastify request.
// OUTPUT: { ip_address, user_agent } -- raw values passed through; the user-agent
//         is hashed (never stored raw) inside AuthService for the advisory
//         GOVSEC.3D-B device-binding comparison; ip_address is NOT used as
//         binding material.
// WHY: GOVSEC.3D-B / GAP-A3 -- thread the client user-agent into the normal-use
//      validateSession callers without duplicating extraction. No normalization
//      or hashing here (that is AuthService.deviceBindingHash's job); no IP
//      binding; no storage.
export function clientContextFrom(request: FastifyRequest): ValidateSessionContext {
  return {
    ip_address: request.ip ?? null,
    user_agent: request.headers["user-agent"] ?? null,
  };
}
