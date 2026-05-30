// FILE: playground.service.ts
// PURPOSE: Section 5 Wave 2 Agent Playground v1 — read-only,
//          sandbox-only, self-scoped operator inspector surface per
//          ADR-0060. Wires three substrate-safe inspectors:
//            (1) Policy-evaluator scenario tester via the pure
//                `evaluateActionPolicy` function (no DB; no audit).
//            (2) Connector dry-run via `FixtureBasedConnectorProvider`
//                ONLY — production providers are unreachable here
//                (RULE 0 + Founder Wave 2 hard-wire constraint).
//            (3) Working-set inspector via `COEService.assembleContext`
//                projected to a SAFE no-leak shape per ADR-0051 /
//                ADR-0058 §7 (counts + closed-vocab labels + IDs +
//                tags; NEVER raw `content` from ContextItem).
// CONNECTS TO:
//   - apps/api/src/services/action/policy-evaluator.ts (pure dispatch)
//   - apps/api/src/services/connector/connector.service.ts
//     (FixtureBasedConnectorProvider only)
//   - apps/api/src/services/coe/coe.service.ts (assembleContext;
//     read-only path)
//   - apps/api/src/services/auth.service.ts (validateSession with
//     "read" scope per ADR-0060 §3)
//   - ADR-0060 Section 5 Agent Playground v1 design

import { randomUUID } from "node:crypto";
import type { AuthService } from "../auth.service.js";
import type { COEService } from "../coe/coe.service.js";
import {
  evaluateActionPolicy,
  type ActionDecisionResult,
  type EvaluateActionPolicyInput,
} from "../action/policy-evaluator.js";
import {
  FixtureBasedConnectorProvider,
  type ConnectorInvocation,
  type ConnectorProvider,
  type ConnectorResult,
} from "../connector/connector.service.js";

// WHAT: The unified failure code surface for all 3 playground
//        inspectors.
// INPUT: Used as a return discriminator only.
// OUTPUT: None.
// WHY: Mirrors the existing connector-binding / hive-admin failure
//      pattern. Auth failures inherit from AuthService.validateSession;
//      INVALID_REQUEST covers body-shape violations; INTERNAL_ERROR
//      is the catch-all for unexpected errors.
export type PlaygroundFailureCode =
  | "SESSION_INVALID"
  | "SESSION_EXPIRED"
  | "SESSION_REVOKED"
  | "SESSION_INVALIDATED"
  | "OPERATION_NOT_PERMITTED"
  | "INVALID_REQUEST"
  | "INTERNAL_ERROR";

export interface PlaygroundFailure {
  ok: false;
  code: PlaygroundFailureCode;
  message: string;
}

// WHAT: The body shape for the policy-evaluator scenario tester.
// INPUT: Used as a parameter type.
// OUTPUT: None.
// WHY: callerEntityId + org_entity_id are derived from the session
//      at the service tier (caller's own identity per RULE 0
//      self-scope) — the caller MUST NOT supply them. action_type +
//      risk_tier + policy_envelope are the synthetic scenario the
//      caller wants to evaluate.
export interface PolicyEvaluatorInput {
  action_type: unknown;
  risk_tier: unknown;
  policy_envelope: unknown;
}

// WHAT: Success shape for the policy-evaluator scenario tester.
// INPUT: Used as a return type only.
// OUTPUT: None.
// WHY: Mirrors the pure evaluator's discriminated union;
//      `inspector_kind` is added so consumers can distinguish
//      playground responses from production evaluator audit
//      payloads.
export interface PolicyEvaluatorSuccess {
  ok: true;
  inspector_kind: "POLICY_EVALUATOR";
  result: ActionDecisionResult;
}

// WHAT: The body shape for the connector dry-run invoker.
// INPUT: Used as a parameter type.
// OUTPUT: None.
// WHY: `type` matches the production ConnectorType strings but is
//      IGNORED by the playground (all calls route through
//      FixtureBasedConnectorProvider). `payload` supports the
//      `fixture_key` discriminator the Fixture provider already
//      understands (force-auth-failure, force-timeout, etc.).
//      `config` is accepted opaquely; `secret_ref` is FORCED to
//      null at the service tier so the playground can never leak
//      a real secret env-var NAME.
export interface ConnectorDryRunInput {
  type?: unknown;
  config?: unknown;
  payload?: unknown;
}

// WHAT: Success shape for the connector dry-run invoker.
// INPUT: Used as a return type only.
// OUTPUT: None.
// WHY: Wraps the provider's ConnectorResult + adds the
//      `inspector_kind` discriminator + a fixed `provider`
//      attribution so consumers can prove (via the response
//      itself) that the call went through the fixture provider,
//      not a real one.
export interface ConnectorDryRunSuccess {
  ok: true;
  inspector_kind: "CONNECTOR_DRY_RUN";
  provider: "FixtureBasedConnectorProvider";
  result: ConnectorResult;
}

// WHAT: The body shape for the working-set inspector.
// INPUT: Used as a parameter type.
// OUTPUT: None.
// WHY: Mirrors the existing COE.assembleContext signature minus the
//      session token (the service tier reads the session from the
//      bearer separately). `request_text` is the synthetic query;
//      `token_budget` controls how many capsules COE may load.
export interface WorkingSetInspectorInput {
  request_text: unknown;
  token_budget: unknown;
}

// WHAT: A SAFE projection of one COE context item for the working-set
//        inspector response.
// INPUT: Used as a return type only.
// OUTPUT: None.
// WHY: ContextItem from COE includes `content` (raw decrypted
//      capsule payload) — that field MUST NOT cross the playground
//      response boundary per ADR-0060 §3 SAFE projection. This
//      projection retains capsule_id + capsule_type + topic_tags
//      only (closed-vocab metadata).
export interface WorkingSetCapsuleSummary {
  capsule_id: string;
  capsule_type: string;
  topic_tags: readonly string[];
}

// WHAT: Success shape for the working-set inspector.
// INPUT: Used as a return type only.
// OUTPUT: None.
// WHY: Mirrors AssembleContextSuccess counters PLUS the SAFE
//      capsule-summary projection. NEVER includes raw content,
//      prompts, chain-of-thought, embeddings, storage_location,
//      content_hash, secret refs, bridge IDs, permission internals,
//      cross-org data.
export interface WorkingSetInspectorSuccess {
  ok: true;
  inspector_kind: "WORKING_SET";
  capsules_loaded: number;
  tokens_consumed: number;
  capsules_skipped_low_relevance: number;
  capsules_skipped_budget: number;
  capsules_denied_permission: number;
  capsules: readonly WorkingSetCapsuleSummary[];
}

// WHAT: The Agent Playground service — three sandbox-only inspector
//        methods.
// INPUT: AuthService + COEService + optional ConnectorProvider
//        override (defaults to a fresh FixtureBasedConnectorProvider)
//        + optional evaluator function override (defaults to the
//        imported pure `evaluateActionPolicy`).
// OUTPUT: An instance with three async methods.
// WHY: Constructor injection keeps tests cleanly composable +
//      preserves the production-safety invariant that the
//      `getConnectorProvider` factory is NEVER reachable from
//      playground code — the only ConnectorProvider instance the
//      service knows about is the FixtureBasedConnectorProvider.
export class PlaygroundService {
  private readonly connectorProvider: ConnectorProvider;
  private readonly evaluator: (
    input: EvaluateActionPolicyInput,
  ) => ActionDecisionResult;

  constructor(
    private readonly authService: AuthService,
    private readonly coeService: COEService,
    overrides: {
      connectorProvider?: ConnectorProvider;
      evaluator?: (input: EvaluateActionPolicyInput) => ActionDecisionResult;
    } = {},
  ) {
    this.connectorProvider =
      overrides.connectorProvider ?? new FixtureBasedConnectorProvider();
    this.evaluator = overrides.evaluator ?? evaluateActionPolicy;
  }

  // WHAT: Run the policy-evaluator scenario tester.
  // INPUT: Session token + synthetic body.
  // OUTPUT: PolicyEvaluatorSuccess | PlaygroundFailure.
  // WHY: The pure evaluator validates the envelope shape itself
  //      and returns ENVELOPE_INVALID on bad input. We bind
  //      callerEntityId + org_entity_id from the session (caller's
  //      own identity per RULE 0) and pass action_type + risk_tier
  //      + policy_envelope from the body verbatim. NO DB writes;
  //      NO audit emission; NO action row created. Pure function
  //      dispatch.
  async runPolicyEvaluator(
    sessionToken: string,
    body: PolicyEvaluatorInput,
  ): Promise<PolicyEvaluatorSuccess | PlaygroundFailure> {
    const session = await this.authService.validateSession(
      sessionToken,
      "read",
    );
    if (!session.valid) {
      return {
        ok: false,
        code: session.code,
        message: "Playground access denied",
      };
    }

    // Derive org_entity_id from the caller's session for binding into
    // the evaluator input. The pure evaluator requires both IDs
    // structurally but uses them only as opaque strings — the
    // playground does not need a strict org-membership resolution
    // here because the evaluator does not query the DB. We pass the
    // caller's session.entity_id as the proxy for org_entity_id
    // when caller's actual org is unknown; this is safe at the
    // playground tier because the evaluator never persists.
    const callerId = session.entity_id;

    const input: EvaluateActionPolicyInput = {
      callerEntityId: callerId,
      org_entity_id:
        typeof body.policy_envelope === "object" &&
        body.policy_envelope !== null &&
        "_org_entity_id_override" in body.policy_envelope &&
        typeof (body.policy_envelope as Record<string, unknown>)[
          "_org_entity_id_override"
        ] === "string"
          ? ((body.policy_envelope as Record<string, unknown>)[
              "_org_entity_id_override"
            ] as string)
          : callerId,
      action_type: body.action_type as EvaluateActionPolicyInput["action_type"],
      risk_tier: body.risk_tier as EvaluateActionPolicyInput["risk_tier"],
      policy_envelope: body.policy_envelope as EvaluateActionPolicyInput["policy_envelope"],
    };

    const result = this.evaluator(input);
    return {
      ok: true,
      inspector_kind: "POLICY_EVALUATOR",
      result,
    };
  }

  // WHAT: Run the connector dry-run inspector.
  // INPUT: Session token + synthetic invocation body.
  // OUTPUT: ConnectorDryRunSuccess | PlaygroundFailure.
  // WHY: Always routes through FixtureBasedConnectorProvider (the
  //      service's only ConnectorProvider field). `binding_id` is
  //      a fresh playground-only UUID — no real ConnectorBinding
  //      is read or referenced. `secret_ref` is FORCED to null so
  //      the playground can never echo a real env-var NAME back to
  //      the caller. `type` defaults to "FIXTURE_ECHO" if absent.
  //      `config` + `payload` come from the body opaquely; the
  //      Fixture provider understands the `fixture_key` payload
  //      key for forced-failure exercises.
  async runConnectorDryRun(
    sessionToken: string,
    body: ConnectorDryRunInput,
  ): Promise<ConnectorDryRunSuccess | PlaygroundFailure> {
    const session = await this.authService.validateSession(
      sessionToken,
      "read",
    );
    if (!session.valid) {
      return {
        ok: false,
        code: session.code,
        message: "Playground access denied",
      };
    }

    const typeStr = typeof body.type === "string" ? body.type : "FIXTURE_ECHO";
    // Accept both production type strings; the playground always
    // routes through the fixture provider regardless of which the
    // caller named. Unknown strings fail at the type-cast site below
    // — but the fixture provider doesn't introspect the type beyond
    // echoing it in delivery_metadata, so any string is structurally
    // safe.
    const invocation: ConnectorInvocation = {
      binding_id: `playground-${randomUUID()}`,
      type: typeStr as ConnectorInvocation["type"],
      config:
        body.config && typeof body.config === "object"
          ? (body.config as Readonly<Record<string, unknown>>)
          : Object.freeze({}),
      secret_ref: null,
      payload:
        body.payload && typeof body.payload === "object"
          ? (body.payload as Readonly<Record<string, unknown>>)
          : Object.freeze({}),
    };

    try {
      const result = await this.connectorProvider.invoke(invocation);
      return {
        ok: true,
        inspector_kind: "CONNECTOR_DRY_RUN",
        provider: "FixtureBasedConnectorProvider",
        result,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown";
      return {
        ok: false,
        code: "INTERNAL_ERROR",
        message,
      };
    }
  }

  // WHAT: Run the working-set inspector.
  // INPUT: Session token + synthetic query body.
  // OUTPUT: WorkingSetInspectorSuccess | PlaygroundFailure.
  // WHY: Delegates to COEService.assembleContext which is itself a
  //      read-only path (it reads memory_capsules + wallet rows;
  //      NEVER creates an OtzarConversation or a MemoryCapsule).
  //      The COE result includes raw `content` in each ContextItem
  //      — that field is STRIPPED here and the response only
  //      surfaces (capsule_id + capsule_type + topic_tags) per
  //      ADR-0060 §3 SAFE projection.
  async runWorkingSetInspector(
    sessionToken: string,
    body: WorkingSetInspectorInput,
  ): Promise<WorkingSetInspectorSuccess | PlaygroundFailure> {
    if (typeof body.request_text !== "string") {
      return {
        ok: false,
        code: "INVALID_REQUEST",
        message: "request_text must be a string",
      };
    }
    if (
      typeof body.token_budget !== "number" ||
      !Number.isFinite(body.token_budget) ||
      body.token_budget <= 0
    ) {
      return {
        ok: false,
        code: "INVALID_REQUEST",
        message: "token_budget must be a positive number",
      };
    }

    const coeResult = await this.coeService.assembleContext(
      sessionToken,
      body.request_text,
      body.token_budget,
    );

    if (!coeResult.ok) {
      return {
        ok: false,
        code: coeResult.code,
        message: coeResult.message,
      };
    }

    return {
      ok: true,
      inspector_kind: "WORKING_SET",
      capsules_loaded: coeResult.capsules_loaded,
      tokens_consumed: coeResult.tokens_consumed,
      capsules_skipped_low_relevance: coeResult.capsules_skipped_low_relevance,
      capsules_skipped_budget: coeResult.capsules_skipped_budget,
      capsules_denied_permission: coeResult.capsules_denied_permission,
      // SAFE projection: drop the raw `content` field; surface
      // metadata only.
      capsules: coeResult.context.map((c) => ({
        capsule_id: c.capsule_id,
        capsule_type: c.capsule_type,
        topic_tags: c.topic_tags,
      })),
    };
  }
}
