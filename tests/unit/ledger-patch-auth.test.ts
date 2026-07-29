// FILE: ledger-patch-auth.test.ts
// PURPOSE: Field-level Work Ledger PATCH authorization matrix.
// CONNECTS TO: ledger-patch-auth.ts

import { describe, expect, it } from "vitest";
import {
  authorizeLedgerPatch,
  resolveLedgerActorRole,
} from "../../apps/api/src/services/work-os/ledger-patch-auth.js";

const OWNER = "owner-1";
const REQUESTER = "req-1";
const TARGET = "tgt-1";
const OTHER = "other-1";
const MGR = "mgr-1";

describe("resolveLedgerActorRole", () => {
  it("prefers manager", () => {
    expect(
      resolveLedgerActorRole({
        caller_entity_id: MGR,
        is_manager: true,
        owner_entity_id: OWNER,
        requester_entity_id: REQUESTER,
        target_entity_id: TARGET,
      }),
    ).toBe("manager");
  });

  it("detects owner / requester / target_only / non_party", () => {
    expect(
      resolveLedgerActorRole({
        caller_entity_id: OWNER,
        is_manager: false,
        owner_entity_id: OWNER,
        requester_entity_id: REQUESTER,
        target_entity_id: TARGET,
      }),
    ).toBe("owner");
    expect(
      resolveLedgerActorRole({
        caller_entity_id: REQUESTER,
        is_manager: false,
        owner_entity_id: OWNER,
        requester_entity_id: REQUESTER,
        target_entity_id: TARGET,
      }),
    ).toBe("requester");
    expect(
      resolveLedgerActorRole({
        caller_entity_id: TARGET,
        is_manager: false,
        owner_entity_id: OWNER,
        requester_entity_id: REQUESTER,
        target_entity_id: TARGET,
      }),
    ).toBe("target_only");
    expect(
      resolveLedgerActorRole({
        caller_entity_id: OTHER,
        is_manager: false,
        owner_entity_id: OWNER,
        requester_entity_id: REQUESTER,
        target_entity_id: TARGET,
      }),
    ).toBe("non_party");
  });
});

describe("authorizeLedgerPatch", () => {
  it("denies non_party with NOT_FOUND", () => {
    const r = authorizeLedgerPatch({
      caller_entity_id: OTHER,
      is_manager: false,
      owner_entity_id: OWNER,
      requester_entity_id: REQUESTER,
      target_entity_id: TARGET,
      fields: ["status"],
      next_status: "PROPOSED",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("NOT_FOUND");
  });

  it("denies target_only all fields", () => {
    const r = authorizeLedgerPatch({
      caller_entity_id: TARGET,
      is_manager: false,
      owner_entity_id: OWNER,
      requester_entity_id: REQUESTER,
      target_entity_id: TARGET,
      fields: ["priority", "next_action"],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("FORBIDDEN");
  });

  it("allows owner complete and progress", () => {
    expect(
      authorizeLedgerPatch({
        caller_entity_id: OWNER,
        is_manager: false,
        owner_entity_id: OWNER,
        requester_entity_id: REQUESTER,
        target_entity_id: TARGET,
        fields: ["status", "next_action"],
        next_status: "EXECUTED",
      }).ok,
    ).toBe(true);
  });

  it("denies requester complete", () => {
    const r = authorizeLedgerPatch({
      caller_entity_id: REQUESTER,
      is_manager: false,
      owner_entity_id: OWNER,
      requester_entity_id: REQUESTER,
      target_entity_id: TARGET,
      fields: ["status"],
      next_status: "EXECUTED",
    });
    expect(r.ok).toBe(false);
  });

  it("allows requester cancel and next_action clarify", () => {
    expect(
      authorizeLedgerPatch({
        caller_entity_id: REQUESTER,
        is_manager: false,
        owner_entity_id: OWNER,
        requester_entity_id: REQUESTER,
        target_entity_id: TARGET,
        fields: ["status", "next_action"],
        next_status: "CANCELLED",
      }).ok,
    ).toBe(true);
  });

  it("denies requester priority", () => {
    const r = authorizeLedgerPatch({
      caller_entity_id: REQUESTER,
      is_manager: false,
      owner_entity_id: OWNER,
      requester_entity_id: REQUESTER,
      target_entity_id: TARGET,
      fields: ["priority"],
    });
    expect(r.ok).toBe(false);
  });

  it("allows manager priority, project_id, complete", () => {
    expect(
      authorizeLedgerPatch({
        caller_entity_id: MGR,
        is_manager: true,
        owner_entity_id: OWNER,
        requester_entity_id: REQUESTER,
        target_entity_id: TARGET,
        fields: ["priority", "project_id", "status"],
        next_status: "VERIFIED",
      }).ok,
    ).toBe(true);
  });

  it("denies non-manager project_id", () => {
    const r = authorizeLedgerPatch({
      caller_entity_id: OWNER,
      is_manager: false,
      owner_entity_id: OWNER,
      requester_entity_id: REQUESTER,
      target_entity_id: TARGET,
      fields: ["project_id"],
    });
    expect(r.ok).toBe(false);
  });
});
