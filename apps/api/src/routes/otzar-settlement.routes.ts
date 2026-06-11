// FILE: otzar-settlement.routes.ts
// PURPOSE: Phase 1250 — HTTP surface for governed transaction
//          readiness. MOCK ONLY: nothing on this surface can move
//          funds, touch a real rail, or handle a key (ADR-0094 §2
//          bans hold by construction — only MOCK_RAIL is executable
//          and the policy gate refuses every other rail).
//
//          - GET  /api/v1/otzar/settlement/readiness     (org admin)
//          - GET  /api/v1/otzar/settlement/rails         (org admin)
//          - POST /api/v1/otzar/settlement/mock-intents  (org member)
//          - GET  /api/v1/otzar/settlement/mock-intents  (member: own;
//            admin: org)
//          - POST /api/v1/otzar/settlement/mock-intents/:intent_id/approve
//          - POST /api/v1/otzar/settlement/mock-intents/:intent_id/revoke
//          - POST /api/v1/otzar/settlement/mock-intents/:intent_id/settle
//
// CONNECTS TO:
//   - apps/api/src/services/governance/governed-transaction.service.ts
//   - apps/api/src/services/governance/settlement-readiness.service.ts
//   - tests/integration/governed-transaction-walk.test.ts

import type { FastifyInstance } from "fastify";
import type { AuthService } from "../services/auth.service.js";
import {
  approveMockTransactionIntentForCaller,
  getTransactionReadinessForCaller,
  listMockTransactionIntentsForCaller,
  proposeMockTransactionIntentForCaller,
  revokeMockTransactionIntentForCaller,
  settleMockTransactionIntentForCaller,
} from "../services/governance/governed-transaction.service.js";
import { listSettlementRails } from "../services/governance/settlement-readiness.service.js";

function bearerFrom(value: string | string[] | undefined): string | null {
  if (typeof value !== "string" || !value.startsWith("Bearer ")) return null;
  const token = value.slice("Bearer ".length).trim();
  return token.length === 0 ? null : token;
}

const FAILURE_STATUS: Record<string, number> = {
  ACTOR_NOT_FOUND: 404,
  NO_ORG_FOR_CALLER: 404,
  INTENT_NOT_FOUND: 404,
  COUNTERPARTY_NOT_FOUND: 404,
  ADMIN_REQUIRED: 403,
  HUMAN_APPROVER_REQUIRED: 403,
  APPROVER_NOT_ACTIVE: 403,
  SELF_APPROVAL_FORBIDDEN: 403,
  ALREADY_APPROVED_BY_CALLER: 409,
  CROSS_ORG_FORBIDDEN: 403,
  POLICY_FORBIDDEN: 403,
  REVOKE_NOT_ALLOWED: 403,
  SETTLE_NOT_ALLOWED: 403,
  PROPOSER_NOT_ACTIVE: 403,
  INVALID_PURPOSE: 422,
  INTENT_APPROVAL_REQUIRED: 409,
  INTENT_APPROVED: 409,
  INTENT_MOCK_SETTLED: 409,
  INTENT_DENIED: 409,
  INTENT_REVOKED: 409,
  INTENT_EXPIRED: 409,
  INTENT_WRITE_FAILED: 500,
};

function failureStatus(code: string): number {
  return FAILURE_STATUS[code] ?? 403;
}

interface ProposeBody {
  amount_usd?: unknown;
  purpose?: unknown;
  counterparty_label?: unknown;
  counterparty_entity_id?: unknown;
  rail?: unknown;
}

interface IntentParams {
  intent_id: string;
}

export async function registerOtzarSettlementRoutes(
  app: FastifyInstance,
  authService: AuthService,
): Promise<void> {
  app.get("/api/v1/otzar/settlement/readiness", async (request, reply) => {
    const token = bearerFrom(request.headers.authorization);
    if (token === null)
      return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
    const session = await authService.validateSession(token, "read");
    if (!session.valid)
      return reply.code(401).send({ ok: false, code: session.code });
    const result = await getTransactionReadinessForCaller({
      callerEntityId: session.entity_id,
    });
    if (result.ok === false)
      return reply.code(failureStatus(result.code)).send(result);
    return reply.code(200).send(result);
  });

  app.get("/api/v1/otzar/settlement/rails", async (request, reply) => {
    const token = bearerFrom(request.headers.authorization);
    if (token === null)
      return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
    const session = await authService.validateSession(token, "read");
    if (!session.valid)
      return reply.code(401).send({ ok: false, code: session.code });
    // Rail truth requires the same admin gate as readiness.
    const gate = await getTransactionReadinessForCaller({
      callerEntityId: session.entity_id,
    });
    if (gate.ok === false)
      return reply.code(failureStatus(gate.code)).send(gate);
    return reply.code(200).send({ ok: true, rails: listSettlementRails() });
  });

  app.post<{ Body: ProposeBody }>(
    "/api/v1/otzar/settlement/mock-intents",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const session = await authService.validateSession(token, "write");
      if (!session.valid)
        return reply.code(401).send({ ok: false, code: session.code });
      const body = request.body ?? {};
      if (typeof body.amount_usd !== "number") {
        return reply.code(422).send({
          ok: false,
          code: "INVALID_REQUEST",
          message: "amount_usd (number) is required",
        });
      }
      if (typeof body.purpose !== "string") {
        return reply.code(422).send({
          ok: false,
          code: "INVALID_REQUEST",
          message: "purpose is required",
        });
      }
      const result = await proposeMockTransactionIntentForCaller({
        callerEntityId: session.entity_id,
        amountUsd: body.amount_usd,
        purpose: body.purpose,
        ...(typeof body.counterparty_label === "string"
          ? { counterpartyLabel: body.counterparty_label }
          : {}),
        ...(typeof body.counterparty_entity_id === "string"
          ? { counterpartyEntityId: body.counterparty_entity_id }
          : {}),
        ...(typeof body.rail === "string" ? { rail: body.rail } : {}),
      });
      if (result.ok === false)
        return reply.code(failureStatus(result.code)).send(result);
      return reply.code(201).send(result);
    },
  );

  app.get("/api/v1/otzar/settlement/mock-intents", async (request, reply) => {
    const token = bearerFrom(request.headers.authorization);
    if (token === null)
      return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
    const session = await authService.validateSession(token, "read");
    if (!session.valid)
      return reply.code(401).send({ ok: false, code: session.code });
    const result = await listMockTransactionIntentsForCaller({
      callerEntityId: session.entity_id,
    });
    if (result.ok === false)
      return reply.code(failureStatus(result.code)).send(result);
    return reply.code(200).send(result);
  });

  app.post<{ Params: IntentParams }>(
    "/api/v1/otzar/settlement/mock-intents/:intent_id/approve",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const session = await authService.validateSession(token, "write");
      if (!session.valid)
        return reply.code(401).send({ ok: false, code: session.code });
      const result = await approveMockTransactionIntentForCaller({
        callerEntityId: session.entity_id,
        intentId: request.params.intent_id,
      });
      if (result.ok === false)
        return reply.code(failureStatus(result.code)).send(result);
      return reply.code(200).send(result);
    },
  );

  app.post<{ Params: IntentParams }>(
    "/api/v1/otzar/settlement/mock-intents/:intent_id/revoke",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const session = await authService.validateSession(token, "write");
      if (!session.valid)
        return reply.code(401).send({ ok: false, code: session.code });
      const result = await revokeMockTransactionIntentForCaller({
        callerEntityId: session.entity_id,
        intentId: request.params.intent_id,
      });
      if (result.ok === false)
        return reply.code(failureStatus(result.code)).send(result);
      return reply.code(200).send(result);
    },
  );

  app.post<{ Params: IntentParams }>(
    "/api/v1/otzar/settlement/mock-intents/:intent_id/settle",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const session = await authService.validateSession(token, "write");
      if (!session.valid)
        return reply.code(401).send({ ok: false, code: session.code });
      const result = await settleMockTransactionIntentForCaller({
        callerEntityId: session.entity_id,
        intentId: request.params.intent_id,
      });
      if (result.ok === false)
        return reply.code(failureStatus(result.code)).send(result);
      return reply.code(200).send(result);
    },
  );
}
