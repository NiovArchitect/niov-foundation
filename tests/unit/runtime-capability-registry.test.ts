// FILE: runtime-capability-registry.test.ts (unit)
// PURPOSE: Phase 1277 — lock the honest polyglot runtime fabric view.
//          Proves: unconfigured runtimes report NOT_CONFIGURED / DISABLED
//          (never fake-green); a healthy mocked Python/BEAM reports
//          HEALTHY; failures map to UNHEALTHY; the response carries env
//          KEY NAMES only (never URL values/secrets); TypeScript API is
//          always the authority + healthy; fallback flag is honest.
// CONNECTS TO: apps/api/src/services/system/runtime-capability-registry.service.ts

import { describe, expect, it } from "vitest";
import { getRuntimeCapabilities } from "../../apps/api/src/services/system/runtime-capability-registry.service.js";

const NOW = "2026-06-13T18:00:00.000Z";

describe("getRuntimeCapabilities", () => {
  it("reports NOT_CONFIGURED / DISABLED when nothing is wired (no fake green)", async () => {
    const r = await getRuntimeCapabilities({
      pythonUrl: null,
      beamEnabled: false,
      beamUrl: null,
      now: NOW,
    });
    expect(r.python_worker.status).toBe("NOT_CONFIGURED");
    expect(r.python_worker.configured).toBe(false);
    expect(r.beam_fabric.status).toBe("DISABLED");
    expect(r.typescript_api.status).toBe("HEALTHY");
    expect(r.fallback_active).toBe(true);
  });

  it("reports HEALTHY for a mocked Python + BEAM that pass /health", async () => {
    const fetchImpl = (async () => ({ ok: true })) as unknown as typeof fetch;
    const r = await getRuntimeCapabilities({
      pythonUrl: "http://python.internal",
      beamEnabled: true,
      beamUrl: "http://beam.internal",
      fetchImpl,
      now: NOW,
    });
    expect(r.python_worker.status).toBe("HEALTHY");
    expect(r.beam_fabric.status).toBe("HEALTHY");
    expect(r.fallback_active).toBe(false);
    expect(r.python_worker.last_checked_at).toBe(NOW);
  });

  it("maps a failing Python health check to UNHEALTHY (fallback active)", async () => {
    const fetchImpl = (async () => {
      throw new Error("connection refused");
    }) as unknown as typeof fetch;
    const r = await getRuntimeCapabilities({
      pythonUrl: "http://python.internal",
      beamEnabled: false,
      beamUrl: null,
      fetchImpl,
      now: NOW,
    });
    expect(r.python_worker.status).toBe("UNHEALTHY");
    expect(r.fallback_active).toBe(true);
  });

  it("maps an enabled-but-unaddressed BEAM to CONFIGURED_UNVERIFIED", async () => {
    const r = await getRuntimeCapabilities({
      pythonUrl: null,
      beamEnabled: true,
      beamUrl: null,
      now: NOW,
    });
    expect(r.beam_fabric.status).toBe("CONFIGURED_UNVERIFIED");
  });

  it("exposes env KEY NAMES only — never URL values or secrets", async () => {
    const r = await getRuntimeCapabilities({
      pythonUrl: "http://secret-python-host:9999/private",
      beamEnabled: true,
      beamUrl: "http://secret-beam-host:4000",
      fetchImpl: (async () => ({ ok: true })) as unknown as typeof fetch,
      now: NOW,
    });
    const serialized = JSON.stringify(r);
    expect(serialized).not.toContain("secret-python-host");
    expect(serialized).not.toContain("secret-beam-host");
    expect(r.python_worker.env_key).toBe("PYTHON_INTELLIGENCE_RUNTIME_URL");
    expect(r.beam_fabric.env_key).toBe("BEAM_RUNTIME_URL");
  });

  it("advertises the capability contracts for each runtime", async () => {
    const r = await getRuntimeCapabilities({ pythonUrl: null, beamEnabled: false, now: NOW });
    expect(r.python_worker.capabilities).toContain("WORK_SIGNAL_EXTRACTION");
    expect(r.beam_fabric.capabilities).toContain("COLLABORATION_ACTORS");
    expect(r.desktop_native.capabilities).toContain("DESKTOP_MIC");
    expect(r.queue_event_bus.status).toBe("NOT_CONFIGURED");
  });
});
