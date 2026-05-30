// FILE: hive-events.ts
// PURPOSE: Section 3 Wave 5 producer-only Foundation TypeScript
//          Hive event spine per ADR-0064. Thin wrapper around
//          Node node:events.EventEmitter publishing SAFE-projected
//          envelopes on same-org-scoped topics after every Hive
//          state transition. NO live consumers at v1. NO
//          cross-language paste (RULE 21 does NOT fire). NO
//          external delivery. NO persistence. NO retry. NO claim
//          of multi-node distribution.
// CONNECTS TO:
//   - apps/api/src/services/hive/hive.service.ts (5 publish call sites)
//   - apps/api/src/server.ts (optional default HiveEventBus
//     instantiation at boot)
//   - ADR-0064 Section 3 Wave 5 Hive Events Producer Substrate

import { EventEmitter } from "node:events";

// WHAT: The closed v1 vocabulary of Hive state-transition event
//        names per ADR-0064 Sub-decision 1.
// INPUT: Used as a value array + TS literal-union type.
// OUTPUT: None.
// WHY: 5 v1 events match the 6 producer call sites (removeMember
//      + forceRemoveMember share HIVE_MEMBER_REMOVED).
//      HIVE_GOVERNANCE_ZERO_STATE is named in the vocabulary
//      documentation at ADR-0064 but DEFERRED at v1 wiring per
//      Founder "only if safe and not noisy" direction (zero-state
//      paths fire on every read; no consumer use case yet
//      justifies the volume).
export const HIVE_EVENT_NAMES = [
  "HIVE_CREATED",
  "HIVE_MEMBER_ADDED",
  "HIVE_MEMBER_REMOVED",
  "HIVE_DISSOLVED",
  "HIVE_AGGREGATE_BUILT",
] as const;

export type HiveEventName = (typeof HIVE_EVENT_NAMES)[number];

// WHAT: The closed SAFE projection envelope shape per ADR-0064
//        Sub-decision 3.
// INPUT: Used as a parameter + return type only.
// OUTPUT: None.
// WHY: Type construction enforces the no-leak boundary. Producers
//      cannot accidentally spread raw Hive rows; they MUST build
//      envelopes via this typed interface. The forbidden-field
//      list (raw capsule content, governance_terms object,
//      wallet/permission internals, embeddings, etc.) is
//      enforced BY ABSENCE — the interface does not include
//      those fields.
export interface HiveEventEnvelope {
  event_name: HiveEventName;
  org_entity_id: string;
  hive_id: string;
  actor_entity_id?: string;
  target_entity_id?: string;
  member_count?: number;
  hive_status?: "ACTIVE" | "DISSOLVED";
  aggregate_present?: boolean;
  reason_code?: string;
  source_action?: string;
  timestamp: string;
}

// WHAT: Build the org-scoped topic name for one Hive's org.
// INPUT: The Hive's org_entity_id.
// OUTPUT: Canonical topic string.
// WHY: ADR-0064 Sub-decision 2 — same-org topic schema. The
//      org_entity_id MUST come from the Hive row, never caller
//      context, so cross-org topics are forbidden by construction.
export function orgTopic(orgEntityId: string): string {
  return `foundation:hives:org:${orgEntityId}`;
}

// WHAT: Build the hive-scoped topic name for one Hive.
// INPUT: The hive_id.
// OUTPUT: Canonical topic string.
// WHY: ADR-0064 Sub-decision 2 — per-hive granular subscription
//      complement to the org-scoped topic. Two parallel publishes
//      let consumers choose granularity without producer
//      coupling.
export function hiveTopic(hiveId: string): string {
  return `foundation:hives:hive:${hiveId}`;
}

// WHAT: The Hive event bus — a thin Node EventEmitter wrapper.
// INPUT: Used as a constructor target + parameter type.
// OUTPUT: An instance with publishHiveEvent + subscribe methods.
// WHY: ADR-0064 Sub-decision 4 — producer-only at v1; in-process
//      only; fire-and-forget; no claim of multi-node distribution.
//      Future BEAM-side Phoenix.PubSub bridge will subscribe to
//      these events via a cross-language adapter at its own
//      authorization slice (RULE 21 fires THERE not here).
export class HiveEventBus {
  private readonly emitter: EventEmitter;

  // WHAT: Construct a fresh HiveEventBus.
  // INPUT: None.
  // OUTPUT: A new instance with an internal EventEmitter.
  // WHY: Tests can spin up isolated instances; production server
  //      typically uses a single shared bus passed into
  //      HiveService.
  constructor() {
    this.emitter = new EventEmitter();
    // Generous default to avoid Node's MaxListenersExceededWarning
    // if many test cases attach short-lived subscribers; the bus
    // is internal-only so this is not a security knob.
    this.emitter.setMaxListeners(0);
  }

  // WHAT: Publish a Hive event envelope on both org-scoped and
  //        hive-scoped topics in parallel.
  // INPUT: A constructed HiveEventEnvelope.
  // OUTPUT: void; the publish is fire-and-forget.
  // WHY: ADR-0064 Sub-decision 4 + 6 — fire-and-forget delivery
  //      semantics. Handler failures are swallowed silently to
  //      never block the calling HiveService transaction. The
  //      two-topic publish lets subscribers choose granularity.
  publishHiveEvent(envelope: HiveEventEnvelope): void {
    const orgT = orgTopic(envelope.org_entity_id);
    const hiveT = hiveTopic(envelope.hive_id);
    try {
      this.emitter.emit(orgT, envelope);
    } catch {
      // Swallow per Sub-decision 4 fire-and-forget; never block
      // state transitions on subscriber faults.
    }
    try {
      this.emitter.emit(hiveT, envelope);
    } catch {
      // Same; the hive-scoped publish failure must not affect
      // org-scoped publish (and vice versa via separate try
      // blocks).
    }
  }

  // WHAT: Subscribe a handler to one topic; returns an unsubscribe
  //        closure for lifecycle management.
  // INPUT: The topic name + the handler function.
  // OUTPUT: A zero-arg unsubscribe function.
  // WHY: Tests need deterministic teardown; future consumer
  //      slices need lifecycle hooks. Returning the unsubscribe
  //      function is the canonical Node EventEmitter pattern
  //      adapted to a typed interface.
  subscribe(
    topic: string,
    handler: (envelope: HiveEventEnvelope) => void,
  ): () => void {
    this.emitter.on(topic, handler);
    return () => {
      this.emitter.off(topic, handler);
    };
  }
}
