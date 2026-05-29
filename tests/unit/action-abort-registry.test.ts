// FILE: action-abort-registry.test.ts (unit)
// PURPOSE: Pure-function unit tests for the
//          [ADR-0057-RUNNING-CANCEL-BREAK-GLASS] Wave 2 process-local
//          abort registry. Verifies the register/release lifecycle,
//          abort firing, and idempotent release.
// CONNECTS TO: apps/api/src/services/action/abort-registry.ts via
//              the "@niov/api" barrel.

import { describe, expect, it, beforeEach } from "vitest";
import {
  abortAction,
  registerActionAbort,
  releaseActionAbort,
  _testAbortRegistrySize,
} from "@niov/api";

// The registry is a module-level Map. Each test releases its own
// action_id so cross-test pollution is contained, but we also
// snapshot the size at entry/exit to surface any leak immediately.
let baselineSize = 0;

beforeEach(() => {
  baselineSize = _testAbortRegistrySize();
});

describe("abort-registry — lifecycle", () => {
  it("registerActionAbort returns a fresh AbortController + grows the registry", () => {
    const id = `test-${Date.now()}-${Math.random()}`;
    const c = registerActionAbort(id);
    expect(c).toBeInstanceOf(AbortController);
    expect(c.signal.aborted).toBe(false);
    expect(_testAbortRegistrySize()).toBe(baselineSize + 1);
    releaseActionAbort(id);
    expect(_testAbortRegistrySize()).toBe(baselineSize);
  });
  it("releaseActionAbort on unknown id is a no-op", () => {
    expect(_testAbortRegistrySize()).toBe(baselineSize);
    releaseActionAbort("no-such-action-id");
    expect(_testAbortRegistrySize()).toBe(baselineSize);
  });
  it("registering the same id twice replaces the controller", () => {
    const id = `test-${Date.now()}-${Math.random()}`;
    const c1 = registerActionAbort(id);
    const c2 = registerActionAbort(id);
    expect(c1).not.toBe(c2);
    expect(_testAbortRegistrySize()).toBe(baselineSize + 1);
    releaseActionAbort(id);
  });
});

describe("abort-registry — abortAction", () => {
  it("returns false when no controller is registered for the id", () => {
    expect(abortAction("no-such-id")).toBe(false);
  });
  it("returns true + fires the abort signal when a controller is registered", () => {
    const id = `test-${Date.now()}-${Math.random()}`;
    const c = registerActionAbort(id);
    expect(c.signal.aborted).toBe(false);
    const fired = abortAction(id);
    expect(fired).toBe(true);
    expect(c.signal.aborted).toBe(true);
    releaseActionAbort(id);
  });
  it("abortAction's signal carries the reason string", () => {
    const id = `test-${Date.now()}-${Math.random()}`;
    const c = registerActionAbort(id);
    abortAction(id, "TEST_REASON");
    // Node 18+ exposes reason on AbortSignal.
    expect(String(c.signal.reason)).toBe("TEST_REASON");
    releaseActionAbort(id);
  });
  it("default reason is 'ACTION_CANCELLED_VIA_BREAK_GLASS' when not supplied", () => {
    const id = `test-${Date.now()}-${Math.random()}`;
    const c = registerActionAbort(id);
    abortAction(id);
    expect(String(c.signal.reason)).toBe("ACTION_CANCELLED_VIA_BREAK_GLASS");
    releaseActionAbort(id);
  });
  it("aborting after release is a no-op", () => {
    const id = `test-${Date.now()}-${Math.random()}`;
    const c = registerActionAbort(id);
    releaseActionAbort(id);
    const fired = abortAction(id);
    expect(fired).toBe(false);
    expect(c.signal.aborted).toBe(false);
  });
});
