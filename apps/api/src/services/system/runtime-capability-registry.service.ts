// FILE: runtime-capability-registry.service.ts
// PURPOSE: Phase 1277 — one honest, aggregated view of Otzar's polyglot
//          runtime fabric: TypeScript governance API, Python intelligence
//          worker, BEAM/Elixir coordination fabric, desktop-native
//          capabilities, and the queue/event bus. It REUSES the existing
//          BEAM status client + Python env conventions (no duplicate
//          clients) and reports the truth: an unconfigured runtime is
//          NOT_CONFIGURED, never fake-green. Foundation remains the
//          authority — this surface is observation-only.
// CONNECTS TO: coordination/beam-collaboration-supervisor.service.ts
//          (getBeamRuntimeStatus), Python env (PYTHON_INTELLIGENCE_
//          RUNTIME_URL), system runtime-capabilities route, CT System
//          Health "Runtime Fabric" card.
//
// SECURITY: env KEY NAMES only — never values, never tokens/secrets.

import { getBeamRuntimeStatus } from "../coordination/beam-collaboration-supervisor.service.js";

export type RuntimeStatus =
  | "NOT_CONFIGURED"
  | "CONFIGURED_UNVERIFIED"
  | "HEALTHY"
  | "UNHEALTHY"
  | "DISABLED";

export interface RuntimeView {
  status: RuntimeStatus;
  /** The ENV KEY NAME that configures this runtime — never its value. */
  env_key: string | null;
  configured: boolean;
  capabilities: string[];
  note: string;
  last_checked_at: string | null;
}

export interface RuntimeCapabilitiesView {
  typescript_api: RuntimeView;
  python_worker: RuntimeView;
  beam_fabric: RuntimeView;
  desktop_native: RuntimeView;
  queue_event_bus: RuntimeView;
  /** True when any intelligence/coordination runtime is unavailable and
   *  Foundation's deterministic TypeScript path is serving instead. */
  fallback_active: boolean;
}

const PYTHON_CAPABILITIES = [
  "WORK_SIGNAL_EXTRACTION",
  "TRANSCRIPT_INTELLIGENCE",
  "PRIORITY_SCORING",
  "ALIGNMENT_DRIFT_DETECTION",
  "BLIND_SPOT_SCORING",
  "WORKLOAD_OPTIMIZATION",
  "SCENARIO_SIMULATION",
  "MEMORY_ANALYTICS",
  "VOICE_AUDIO_INTELLIGENCE",
];

const BEAM_CAPABILITIES = [
  "LIVE_WORK_COMMS",
  "COLLABORATION_ACTORS",
  "TWIN_ACTORS",
  "WORKFLOW_ACTORS",
  "NOTIFICATION_FANOUT",
  "PRESENCE",
  "ESCALATION_WATCHDOG",
  "EXECUTION_VERIFICATION_WATCHDOG",
];

const DESKTOP_CAPABILITIES = [
  "DESKTOP_MIC",
  "DESKTOP_NOTIFICATIONS",
  "DESKTOP_SCREEN_CAPTURE",
  "DESKTOP_SECURE_STORE",
];

const TYPESCRIPT_CAPABILITIES = [
  "AUTHORITY_CONTEXT",
  "RBAC_ABAC_POLICY",
  "COMMAND_PLANNING_DETERMINISTIC",
  "ACTION_GOVERNANCE",
  "AUDIT",
  "CONNECTOR_OAUTH",
];

export interface RuntimeRegistryConfig {
  /** Injectable for tests; defaults to process.env reads (NAMES only). */
  pythonUrl?: string | null;
  beamEnabled?: boolean;
  beamUrl?: string | null;
  fetchImpl?: typeof fetch;
  /** Injectable timestamp (Date.now is non-deterministic in some envs). */
  now?: string;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 2_000;

// WHAT: Probe the Python intelligence worker's /health (if configured).
// WHY: NOT_CONFIGURED when no URL is set (the live default); HEALTHY only
//      on a real 200; UNHEALTHY otherwise. Never returns the URL value.
async function probePython(
  cfg: RuntimeRegistryConfig,
  nowIso: string,
): Promise<RuntimeView> {
  const url =
    cfg.pythonUrl ?? process.env.PYTHON_INTELLIGENCE_RUNTIME_URL ?? null;
  const base: Omit<RuntimeView, "status" | "note" | "last_checked_at"> = {
    env_key: "PYTHON_INTELLIGENCE_RUNTIME_URL",
    configured: url !== null && url.length > 0,
    capabilities: PYTHON_CAPABILITIES,
  };
  if (url === null || url.length === 0) {
    return {
      ...base,
      status: "NOT_CONFIGURED",
      note: "Python intelligence worker is not configured. Foundation uses the deterministic TypeScript extractor.",
      last_checked_at: null,
    };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const fetchFn = cfg.fetchImpl ?? fetch;
  try {
    const res = await fetchFn(`${url}/health`, { signal: controller.signal });
    return {
      ...base,
      status: res.ok ? "HEALTHY" : "UNHEALTHY",
      note: res.ok
        ? "Python intelligence worker is live and answering its health check."
        : "Python intelligence worker is configured but failed its health check; deterministic fallback is active.",
      last_checked_at: nowIso,
    };
  } catch {
    return {
      ...base,
      status: "UNHEALTHY",
      note: "Python intelligence worker could not be reached; deterministic fallback is active.",
      last_checked_at: nowIso,
    };
  } finally {
    clearTimeout(timer);
  }
}

// WHAT: Map the existing BEAM collaboration-supervisor status to the
//        unified runtime vocabulary (reuse, no second client).
function mapBeam(
  beamStatus: string,
  configured: boolean,
  nowIso: string,
): RuntimeView {
  const status: RuntimeStatus =
    beamStatus === "ACTIVE"
      ? "HEALTHY"
      : beamStatus === "DISABLED"
        ? "DISABLED"
        : beamStatus === "UNREACHABLE"
          ? "UNHEALTHY"
          : "CONFIGURED_UNVERIFIED"; // READY_NOT_ACTIVE
  return {
    status,
    env_key: "BEAM_RUNTIME_URL",
    configured,
    capabilities: BEAM_CAPABILITIES,
    note:
      status === "HEALTHY"
        ? "BEAM coordination fabric is live (collaboration supervision)."
        : status === "DISABLED"
          ? "BEAM coordination is turned off; Foundation serves coordination directly."
          : status === "UNHEALTHY"
            ? "BEAM coordination runtime is unreachable; Foundation fallback is active."
            : "BEAM coordination is enabled but no runtime address is configured.",
    last_checked_at: nowIso,
  };
}

// WHAT: The aggregated, honest runtime-fabric view.
// INPUT: optional injected config (tests); defaults to env NAME reads.
// OUTPUT: per-runtime status + the fallback flag.
// WHY: System Health must show runtime truth — never claim Python/BEAM
//      are live unless they actually health-check.
export async function getRuntimeCapabilities(
  cfg: RuntimeRegistryConfig = {},
): Promise<RuntimeCapabilitiesView> {
  const nowIso = cfg.now ?? new Date().toISOString();

  const python = await probePython(cfg, nowIso);

  const beamConfigured =
    (cfg.beamUrl ?? process.env.BEAM_RUNTIME_URL ?? "").length > 0;
  const beamRaw = await getBeamRuntimeStatus({
    ...(cfg.beamEnabled !== undefined ? { enabled: cfg.beamEnabled } : {}),
    ...(cfg.beamUrl !== undefined ? { beamUrl: cfg.beamUrl } : {}),
    ...(cfg.fetchImpl !== undefined ? { fetchImpl: cfg.fetchImpl } : {}),
  });
  const beam = mapBeam(beamRaw.collaboration_supervisor, beamConfigured, nowIso);

  const typescript_api: RuntimeView = {
    status: "HEALTHY",
    env_key: null,
    configured: true,
    capabilities: TYPESCRIPT_CAPABILITIES,
    note: "Foundation governance API is the authority for all action, memory, audit, and policy.",
    last_checked_at: nowIso,
  };

  // The API cannot verify desktop-native capabilities (they live in the
  // Tauri shell); it advertises the contract, the desktop reports actual.
  const desktop_native: RuntimeView = {
    status: "CONFIGURED_UNVERIFIED",
    env_key: null,
    configured: true,
    capabilities: DESKTOP_CAPABILITIES,
    note: "Desktop-native capabilities are reported by the Tauri shell; the API advertises the contract only.",
    last_checked_at: nowIso,
  };

  const queue_event_bus: RuntimeView = {
    status: "NOT_CONFIGURED",
    env_key: null,
    configured: false,
    capabilities: ["JOB_DISPATCH", "EVENT_FANOUT", "RETRY"],
    note: "No external queue/event bus is configured; Foundation dispatches inline within the request path.",
    last_checked_at: null,
  };

  const fallback_active =
    python.status !== "HEALTHY" || beam.status !== "HEALTHY";

  return {
    typescript_api,
    python_worker: python,
    beam_fabric: beam,
    desktop_native,
    queue_event_bus,
    fallback_active,
  };
}
