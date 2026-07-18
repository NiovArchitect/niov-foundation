// FILE: enterprise-tools.service.ts
// PURPOSE: Phase E.1 — enterprise click-and-play tools catalog + admin
//          inventory. Human capability language (calendars, documents,
//          chat…) maps to real connectors. Employees see what they can
//          connect; admins see org inventory + KPI strip. Never auto-grants.
//          MCP stays advanced-only (not in this catalog vocabulary).
// CONNECTS TO: connector-adapter-registry, connector-oauth.service,
//   connector-binding.service, otzar-enterprise-tools.routes.ts.

import { prisma, writeAuditEvent } from "@niov/database";
import { getOrgEntityId } from "../governance/org.js";
import { listConnectorAdapters } from "../connectors/connector-adapter-registry.js";
import {
  getOAuthStatusForOrg,
  revokeOAuthConnection,
  slugForProvider,
  type OAuthConnectionStatus,
  type OAuthProviderKey,
} from "../connector/connector-oauth.service.js";
import { listConnectorBindingsForOrgService } from "../connector/connector-binding.service.js";
import {
  listConnectorScopeGrants,
  revokeConnectorScopeGrant,
} from "../connector-rails/scope-grant.service.js";
import { createLedgerEntry } from "../work-os/work-ledger.service.js";
import { approveSeed, rejectSeed } from "./dandelion-seed.service.js";
import {
  emptyTwinAccuracyKpis,
  rollupTwinAccuracyKpis,
  type TwinAccuracyKpis,
} from "./twin-accuracy-kpis.js";

export type ToolConnectStatus =
  | "connected"
  | "ready_to_connect"
  | "needs_admin"
  | "not_configured"
  | "blocked"
  | "error_reconnect";

export interface CapabilityProviderOption {
  provider: string;
  label: string;
  oauth_slug: string | null;
  /** Employee may start connect when org app credentials are ready. */
  employee_self_serve: boolean;
}

export interface CapabilityCatalogItem {
  capability_id: string;
  label: string;
  description: string;
  category: string;
  providers: CapabilityProviderOption[];
}

/** Human capability catalog — product vocabulary, not MCP. */
export const ENTERPRISE_CAPABILITY_CATALOG: readonly CapabilityCatalogItem[] = [
  {
    capability_id: "calendars",
    label: "Calendars",
    description: "Meetings, availability, and scheduled work context.",
    category: "Productivity",
    providers: [
      {
        provider: "GOOGLE_WORKSPACE",
        label: "Google Calendar",
        oauth_slug: "google",
        employee_self_serve: true,
      },
      {
        provider: "MICROSOFT_365",
        label: "Microsoft 365 Calendar",
        oauth_slug: "microsoft",
        employee_self_serve: true,
      },
    ],
  },
  {
    capability_id: "documents",
    label: "Documents & files",
    description: "Drive files, docs, and shared work artifacts.",
    category: "Productivity",
    providers: [
      {
        provider: "GOOGLE_WORKSPACE",
        label: "Google Drive / Docs",
        oauth_slug: "google",
        employee_self_serve: true,
      },
      {
        provider: "MICROSOFT_365",
        label: "OneDrive / SharePoint",
        oauth_slug: "microsoft",
        employee_self_serve: true,
      },
    ],
  },
  {
    capability_id: "email",
    label: "Email",
    description: "Inbox context and governed draft proposals.",
    category: "Communications",
    providers: [
      {
        provider: "GOOGLE_WORKSPACE",
        label: "Gmail",
        oauth_slug: "google",
        employee_self_serve: true,
      },
      {
        provider: "MICROSOFT_365",
        label: "Outlook",
        oauth_slug: "microsoft",
        employee_self_serve: true,
      },
    ],
  },
  {
    capability_id: "chat",
    label: "Team chat",
    description: "Channels and DMs as work context. Sending stays approval-gated.",
    category: "Communications",
    providers: [
      {
        provider: "SLACK",
        label: "Slack",
        oauth_slug: "slack",
        employee_self_serve: true,
      },
      {
        provider: "MICROSOFT_365",
        label: "Microsoft Teams",
        oauth_slug: "microsoft",
        employee_self_serve: true,
      },
    ],
  },
  {
    capability_id: "meetings",
    label: "Meetings & recordings",
    description: "Cloud recordings and transcripts into governed work.",
    category: "Communications",
    providers: [
      {
        provider: "ZOOM",
        label: "Zoom",
        oauth_slug: "zoom",
        employee_self_serve: true,
      },
      {
        provider: "GOOGLE_WORKSPACE",
        label: "Google Meet",
        oauth_slug: "google",
        employee_self_serve: true,
      },
    ],
  },
  {
    capability_id: "engineering",
    label: "Code & issues",
    description: "Repos, pull requests, and engineering context.",
    category: "Engineering",
    providers: [
      {
        provider: "GITHUB",
        label: "GitHub",
        oauth_slug: null,
        employee_self_serve: false,
      },
      {
        provider: "JIRA",
        label: "Jira",
        oauth_slug: null,
        employee_self_serve: false,
      },
      {
        provider: "LINEAR",
        label: "Linear",
        oauth_slug: null,
        employee_self_serve: false,
      },
    ],
  },
  {
    capability_id: "voice",
    label: "Voice",
    description: "Talk to Otzar — transcription and spoken replies.",
    category: "AI",
    providers: [
      {
        provider: "ASSEMBLYAI_STT",
        label: "Speech-to-text",
        oauth_slug: null,
        employee_self_serve: false,
      },
      {
        provider: "ELEVENLABS_TTS",
        label: "Voice output",
        oauth_slug: null,
        employee_self_serve: false,
      },
    ],
  },
] as const;

function mapOAuthToConnectStatus(
  status: OAuthConnectionStatus | undefined,
  adapterStatus: string | undefined,
): ToolConnectStatus {
  if (status === "VERIFIED" || status === "CONNECTED_UNVERIFIED") return "connected";
  if (status === "ERROR_NEEDS_RECONNECT") return "error_reconnect";
  if (status === "READY_FOR_CONSENT") return "ready_to_connect";
  if (status === "APP_CREDENTIALS_MISSING") return "not_configured";
  if (status === "REVOKED") return "blocked";
  if (adapterStatus === "CONFIGURED") return "ready_to_connect";
  if (adapterStatus === "BLOCKED_BY_APP_REVIEW") return "needs_admin";
  if (adapterStatus === "BLOCKED_BY_CREDENTIAL") return "not_configured";
  return "not_configured";
}

export type EnterpriseToolsCatalogView = {
  headline: string;
  capabilities: Array<{
    capability_id: string;
    label: string;
    description: string;
    category: string;
    /** Best status across provider options for this capability. */
    status: ToolConnectStatus;
    status_label: string;
    providers: Array<{
      provider: string;
      label: string;
      oauth_slug: string | null;
      employee_self_serve: boolean;
      status: ToolConnectStatus;
      status_label: string;
      connect_action: "oauth_start" | "request_admin" | "none" | "reconnect";
    }>;
  }>;
  generated_at: string;
};

function statusLabel(s: ToolConnectStatus): string {
  switch (s) {
    case "connected":
      return "Connected";
    case "ready_to_connect":
      return "Ready to connect";
    case "needs_admin":
      return "Admin setup needed";
    case "not_configured":
      return "Not set up yet";
    case "blocked":
      return "Blocked";
    case "error_reconnect":
      return "Reconnect needed";
  }
}

function rankStatus(s: ToolConnectStatus): number {
  switch (s) {
    case "connected":
      return 5;
    case "ready_to_connect":
      return 4;
    case "error_reconnect":
      return 3;
    case "needs_admin":
      return 2;
    case "not_configured":
      return 1;
    case "blocked":
      return 0;
  }
}

export async function getEnterpriseToolsCatalogForCaller(
  callerEntityId: string,
): Promise<
  | { ok: true; catalog: EnterpriseToolsCatalogView }
  | { ok: false; code: "NO_ORG_FOR_CALLER" }
> {
  let orgEntityId: string;
  try {
    orgEntityId = await getOrgEntityId(callerEntityId);
  } catch {
    return { ok: false, code: "NO_ORG_FOR_CALLER" };
  }

  const adapters = listConnectorAdapters();
  const adapterBy = new Map(adapters.map((a) => [a.provider_name, a]));
  const oauth = await getOAuthStatusForOrg(orgEntityId);
  const oauthBy = new Map(oauth.providers.map((p) => [p.provider, p]));

  const capabilities = ENTERPRISE_CAPABILITY_CATALOG.map((cap) => {
    const providers = cap.providers.map((opt) => {
      const adapter = adapterBy.get(opt.provider as never);
      const o = oauthBy.get(opt.provider as OAuthProviderKey);
      const st = mapOAuthToConnectStatus(o?.status, adapter?.status);
      let connect_action: "oauth_start" | "request_admin" | "none" | "reconnect" =
        "none";
      if (st === "connected") connect_action = "none";
      else if (st === "error_reconnect") connect_action = "reconnect";
      else if (
        st === "ready_to_connect" &&
        opt.employee_self_serve &&
        opt.oauth_slug !== null
      ) {
        connect_action = "oauth_start";
      } else if (st === "not_configured" || st === "needs_admin" || st === "blocked") {
        connect_action = "request_admin";
      }
      return {
        provider: opt.provider,
        label: opt.label,
        oauth_slug: opt.oauth_slug,
        employee_self_serve: opt.employee_self_serve,
        status: st,
        status_label: statusLabel(st),
        connect_action,
      };
    });
    const best = providers.reduce(
      (acc, p) => (rankStatus(p.status) > rankStatus(acc) ? p.status : acc),
      "not_configured" as ToolConnectStatus,
    );
    return {
      capability_id: cap.capability_id,
      label: cap.label,
      description: cap.description,
      category: cap.category,
      status: best,
      status_label: statusLabel(best),
      providers,
    };
  });

  const connectedN = capabilities.filter((c) => c.status === "connected").length;
  const readyN = capabilities.filter((c) => c.status === "ready_to_connect").length;
  const headline =
    connectedN > 0
      ? `${connectedN} capability area${connectedN === 1 ? "" : "s"} connected — connect more when work needs them.`
      : readyN > 0
        ? "Tools are ready — connect the ones your role needs in a few clicks."
        : "Ask an admin to enable tools for your organization, then connect what you use.";

  return {
    ok: true,
    catalog: {
      headline,
      capabilities,
      generated_at: new Date().toISOString(),
    },
  };
}

export type EnterpriseToolsInventoryView = {
  headline: string;
  kpis: {
    capabilities_connected: number;
    capabilities_ready: number;
    capabilities_blocked: number;
    oauth_verified: number;
    oauth_ready_for_consent: number;
    org_bindings_enabled: number;
    pending_access_requests: number;
    people_with_open_requests: number;
    active_employee_grants: number;
  };
  tools: Array<{
    provider: string;
    display_name: string;
    category: string;
    adapter_status: string;
    oauth_status: string | null;
    oauth_slug: string | null;
    account_label: string | null;
    last_verified_at: string | null;
    can_write: boolean;
    employee_self_serve: boolean;
    /** Org OAuth can be force-revoked (wipes secrets; never silent). */
    revocable: boolean;
  }>;
  pending_requests: Array<{
    seed_id: string;
    subject_name: string | null;
    subject_entity_id: string | null;
    capability_id: string | null;
    provider: string | null;
    recommended_action: string;
    created_at: string;
  }>;
  /** Phase E.2 — per-person tool footprint (requests + employee scope grants). */
  people: Array<{
    person_entity_id: string;
    display_name: string;
    open_request_count: number;
    active_grant_count: number;
    sample_requests: string[];
    grants: Array<{
      grant_id: string;
      connection_id: string;
      scope_type: string;
      allowed_operations: string[];
    }>;
  }>;
  /** Phase E.3 — Twin accuracy / dual-control KPI rollup (recent ledger). */
  accuracy: TwinAccuracyKpis;
  generated_at: string;
};

export async function getEnterpriseToolsInventoryForAdmin(
  callerEntityId: string,
): Promise<
  | { ok: true; inventory: EnterpriseToolsInventoryView }
  | { ok: false; code: "NO_ORG_FOR_CALLER" | "ADMIN_REQUIRED" }
> {
  let orgEntityId: string;
  try {
    orgEntityId = await getOrgEntityId(callerEntityId);
  } catch {
    return { ok: false, code: "NO_ORG_FOR_CALLER" };
  }

  // Soft admin check via TAR (route also gates).
  const tar = await prisma.tokenAttributeRepository.findUnique({
    where: { entity_id: callerEntityId },
    select: { can_admin_org: true },
  });
  if (tar?.can_admin_org !== true) {
    return { ok: false, code: "ADMIN_REQUIRED" };
  }

  const adapters = listConnectorAdapters();
  const oauth = await getOAuthStatusForOrg(orgEntityId);
  const oauthBy = new Map(oauth.providers.map((p) => [p.provider, p]));
  const bindings = await listConnectorBindingsForOrgService({
    org_entity_id: orgEntityId,
  });
  const enabledBindings = bindings.ok
    ? bindings.bindings.filter((b) => b.enabled)
    : [];

  // Self-serve providers from catalog.
  const selfServe = new Set<string>();
  for (const c of ENTERPRISE_CAPABILITY_CATALOG) {
    for (const p of c.providers) {
      if (p.employee_self_serve) selfServe.add(p.provider);
    }
  }

  const tools = adapters
    .filter((a) =>
      [
        "GOOGLE_WORKSPACE",
        "SLACK",
        "MICROSOFT_365",
        "ZOOM",
        "GITHUB",
        "JIRA",
        "LINEAR",
        "SMTP_EMAIL",
        "ELEVENLABS_TTS",
        "ASSEMBLYAI_STT",
      ].includes(a.provider_name),
    )
    .map((a) => {
      const o = oauthBy.get(a.provider_name as OAuthProviderKey);
      const oauthSlug =
        o !== undefined
          ? o.slug
          : a.provider_name === "GOOGLE_WORKSPACE" ||
              a.provider_name === "SLACK" ||
              a.provider_name === "MICROSOFT_365" ||
              a.provider_name === "ZOOM"
            ? slugForProvider(a.provider_name as OAuthProviderKey)
            : null;
      const revocable =
        o !== undefined &&
        (o.status === "VERIFIED" ||
          o.status === "CONNECTED_UNVERIFIED" ||
          o.status === "ERROR_NEEDS_RECONNECT");
      return {
        provider: a.provider_name,
        display_name: a.display_name,
        category: a.category,
        adapter_status: a.status,
        oauth_status: o?.status ?? null,
        oauth_slug: oauthSlug,
        account_label: o?.account_label ?? null,
        last_verified_at: o?.last_verified_at ?? null,
        can_write: a.can_write,
        employee_self_serve: selfServe.has(a.provider_name),
        revocable,
      };
    });

  // Pending tool access seeds (employee requests + structure tool seeds).
  const openSeeds = await prisma.workLedgerEntry.findMany({
    where: {
      org_entity_id: orgEntityId,
      ledger_type: "ORG_SEEDING",
      status: { in: ["SEED_PROPOSED", "SEED_NEEDS_REVIEW"] },
    },
    select: {
      ledger_entry_id: true,
      title: true,
      details: true,
      created_at: true,
    },
    orderBy: { created_at: "desc" },
    take: 50,
  });
  const pending_requests = openSeeds
    .filter((s) => {
      const d = (s.details ?? {}) as Record<string, unknown>;
      const t = d.seed_type;
      return (
        t === "grant_tool_access" ||
        t === "connector_setup" ||
        t === "enterprise_tool_request"
      );
    })
    .map((s) => {
      const d = (s.details ?? {}) as Record<string, unknown>;
      return {
        seed_id: s.ledger_entry_id,
        subject_name:
          typeof d.subject_name === "string" ? d.subject_name : null,
        subject_entity_id:
          typeof d.subject_entity_id === "string" ? d.subject_entity_id : null,
        capability_id:
          typeof d.capability_id === "string" ? d.capability_id : null,
        provider: typeof d.provider === "string" ? d.provider : null,
        recommended_action:
          typeof d.recommended_action === "string"
            ? d.recommended_action
            : s.title,
        created_at: s.created_at.toISOString(),
      };
    });

  // Phase E.2 — employee scope grants + people rollup.
  const allGrants = await listConnectorScopeGrants(orgEntityId);
  const employeeGrants = allGrants.filter((g) => g.scope_type === "EMPLOYEE");

  const orgPeopleEdges = await prisma.entityMembership.findMany({
    where: { parent_id: orgEntityId, is_active: true },
    select: { child_id: true },
    take: 300,
  });
  const personIds = orgPeopleEdges.map((e) => e.child_id);
  const peopleRows =
    personIds.length === 0
      ? []
      : await prisma.entity.findMany({
          where: {
            entity_id: { in: personIds },
            entity_type: "PERSON",
            status: "ACTIVE",
            deleted_at: null,
          },
          select: { entity_id: true, display_name: true },
          orderBy: { display_name: "asc" },
          take: 300,
        });

  const requestsByPerson = new Map<string, typeof pending_requests>();
  for (const req of pending_requests) {
    if (req.subject_entity_id === null) continue;
    const list = requestsByPerson.get(req.subject_entity_id) ?? [];
    list.push(req);
    requestsByPerson.set(req.subject_entity_id, list);
  }
  const grantsByPerson = new Map<string, typeof employeeGrants>();
  for (const g of employeeGrants) {
    if (g.scope_id === null) continue;
    const list = grantsByPerson.get(g.scope_id) ?? [];
    list.push(g);
    grantsByPerson.set(g.scope_id, list);
  }

  const people = peopleRows
    .map((p) => {
      const reqs = requestsByPerson.get(p.entity_id) ?? [];
      const grants = grantsByPerson.get(p.entity_id) ?? [];
      return {
        person_entity_id: p.entity_id,
        display_name: p.display_name,
        open_request_count: reqs.length,
        active_grant_count: grants.length,
        sample_requests: reqs.slice(0, 3).map((r) => r.recommended_action),
        grants: grants.slice(0, 10).map((g) => ({
          grant_id: g.grant_id,
          connection_id: g.connection_id,
          scope_type: g.scope_type,
          allowed_operations: g.allowed_operations as string[],
        })),
      };
    })
    .filter((p) => p.open_request_count > 0 || p.active_grant_count > 0)
    .slice(0, 100);

  const catalog = await getEnterpriseToolsCatalogForCaller(callerEntityId);
  const caps =
    catalog.ok === true ? catalog.catalog.capabilities : [];
  const kpis = {
    capabilities_connected: caps.filter((c) => c.status === "connected").length,
    capabilities_ready: caps.filter((c) => c.status === "ready_to_connect")
      .length,
    capabilities_blocked: caps.filter(
      (c) => c.status === "blocked" || c.status === "error_reconnect",
    ).length,
    oauth_verified: oauth.providers.filter((p) => p.status === "VERIFIED")
      .length,
    oauth_ready_for_consent: oauth.providers.filter(
      (p) => p.status === "READY_FOR_CONSENT",
    ).length,
    org_bindings_enabled: enabledBindings.length,
    pending_access_requests: pending_requests.length,
    people_with_open_requests: people.filter((p) => p.open_request_count > 0)
      .length,
    active_employee_grants: employeeGrants.length,
  };

  // Phase E.3 — Twin accuracy KPIs from recent ledger rows (bounded sample).
  const recentLedger = await prisma.workLedgerEntry.findMany({
    where: { org_entity_id: orgEntityId },
    select: { status: true, details: true },
    orderBy: { updated_at: "desc" },
    take: 500,
  });
  const accuracy = rollupTwinAccuracyKpis(recentLedger);

  const headline =
    accuracy.awaiting_human_verify > 0
      ? `${accuracy.awaiting_human_verify} accuracy-critical Twin item${accuracy.awaiting_human_verify === 1 ? "" : "s"} need human verification.`
      : kpis.pending_access_requests > 0
        ? `${kpis.pending_access_requests} tool request${kpis.pending_access_requests === 1 ? "" : "s"} need a decision.`
        : kpis.capabilities_connected > 0
          ? `${kpis.capabilities_connected} capability area${kpis.capabilities_connected === 1 ? "" : "s"} live — inventory below.`
          : "No tools connected yet. Enable app credentials, then employees can click-and-play.";

  return {
    ok: true,
    inventory: {
      headline,
      kpis,
      tools,
      pending_requests,
      people,
      accuracy,
      generated_at: new Date().toISOString(),
    },
  };
}

/** Exported for unit tests / future standalone accuracy route. */
export { emptyTwinAccuracyKpis, rollupTwinAccuracyKpis };

/**
 * Phase E.2 — admin decides a tool access request in place (approve/deny).
 * Approve records governance acknowledgement; it does NOT auto-connect OAuth.
 * Deny closes the seed. Never silent grant.
 */
export async function decideEnterpriseToolRequest(args: {
  adminEntityId: string;
  seedId: string;
  decision: "approve" | "deny";
}): Promise<
  | { ok: true; seed_id: string; decision: "approve" | "deny" }
  | {
      ok: false;
      code:
        | "NO_ORG_FOR_CALLER"
        | "ADMIN_REQUIRED"
        | "NOT_FOUND"
        | "NOT_TOOL_REQUEST"
        | "INVALID_REQUEST";
      message?: string;
    }
> {
  let orgEntityId: string;
  try {
    orgEntityId = await getOrgEntityId(args.adminEntityId);
  } catch {
    return { ok: false, code: "NO_ORG_FOR_CALLER" };
  }
  const tar = await prisma.tokenAttributeRepository.findUnique({
    where: { entity_id: args.adminEntityId },
    select: { can_admin_org: true },
  });
  if (tar?.can_admin_org !== true) {
    return { ok: false, code: "ADMIN_REQUIRED" };
  }
  const row = await prisma.workLedgerEntry.findUnique({
    where: { ledger_entry_id: args.seedId },
    select: {
      ledger_entry_id: true,
      org_entity_id: true,
      ledger_type: true,
      details: true,
      status: true,
    },
  });
  if (
    row === null ||
    row.org_entity_id !== orgEntityId ||
    row.ledger_type !== "ORG_SEEDING"
  ) {
    return { ok: false, code: "NOT_FOUND" };
  }
  const d = (row.details ?? {}) as Record<string, unknown>;
  const seedType = d.seed_type;
  if (
    seedType !== "enterprise_tool_request" &&
    seedType !== "grant_tool_access" &&
    seedType !== "connector_setup"
  ) {
    return {
      ok: false,
      code: "NOT_TOOL_REQUEST",
      message: "That signal is not a tool access request.",
    };
  }
  if (args.decision === "deny") {
    const result = await rejectSeed({
      seedId: args.seedId,
      orgEntityId,
      adminEntityId: args.adminEntityId,
      reason: "Denied from Tools & Connections inventory.",
    });
    if (!result.ok) {
      return { ok: false, code: "INVALID_REQUEST", message: result.message };
    }
    return { ok: true, seed_id: args.seedId, decision: "deny" };
  }
  const result = await approveSeed({
    seedId: args.seedId,
    orgEntityId,
    adminEntityId: args.adminEntityId,
  });
  if (!result.ok) {
    return { ok: false, code: "INVALID_REQUEST", message: result.message };
  }
  return { ok: true, seed_id: args.seedId, decision: "approve" };
}

/**
 * Phase E.2 — force-revoke org OAuth connection (wipes secrets). Audited.
 */
export async function revokeEnterpriseOrgTool(args: {
  adminEntityId: string;
  provider_slug: string;
}): Promise<
  | { ok: true }
  | {
      ok: false;
      code:
        | "NO_ORG_FOR_CALLER"
        | "ADMIN_REQUIRED"
        | "UNKNOWN_PROVIDER"
        | "NOT_CONNECTED"
        | "REVOKE_FAILED";
      message?: string;
    }
> {
  let orgEntityId: string;
  try {
    orgEntityId = await getOrgEntityId(args.adminEntityId);
  } catch {
    return { ok: false, code: "NO_ORG_FOR_CALLER" };
  }
  const tar = await prisma.tokenAttributeRepository.findUnique({
    where: { entity_id: args.adminEntityId },
    select: { can_admin_org: true },
  });
  if (tar?.can_admin_org !== true) {
    return { ok: false, code: "ADMIN_REQUIRED" };
  }
  const result = await revokeOAuthConnection({
    provider_slug: args.provider_slug,
    org_entity_id: orgEntityId,
    actor_entity_id: args.adminEntityId,
  });
  if (result.ok === true) return { ok: true };
  if (result.code === "UNKNOWN_PROVIDER") {
    return { ok: false, code: "UNKNOWN_PROVIDER" };
  }
  if (result.code === "NOT_CONNECTED") {
    return { ok: false, code: "NOT_CONNECTED", message: "Nothing to revoke." };
  }
  return {
    ok: false,
    code: "REVOKE_FAILED",
    message: result.message ?? "Could not revoke that connection.",
  };
}

/**
 * Phase E.2 — soft-revoke an employee-scoped connector grant.
 */
export async function revokeEnterpriseEmployeeGrant(args: {
  adminEntityId: string;
  grantId: string;
}): Promise<
  | { ok: true; grant_id: string }
  | {
      ok: false;
      code: "NO_ORG_FOR_CALLER" | "ADMIN_REQUIRED" | "GRANT_NOT_FOUND";
    }
> {
  let orgEntityId: string;
  try {
    orgEntityId = await getOrgEntityId(args.adminEntityId);
  } catch {
    return { ok: false, code: "NO_ORG_FOR_CALLER" };
  }
  const tar = await prisma.tokenAttributeRepository.findUnique({
    where: { entity_id: args.adminEntityId },
    select: { can_admin_org: true },
  });
  if (tar?.can_admin_org !== true) {
    return { ok: false, code: "ADMIN_REQUIRED" };
  }
  const result = await revokeConnectorScopeGrant(orgEntityId, args.grantId);
  if (!result.ok) return { ok: false, code: "GRANT_NOT_FOUND" };
  await writeAuditEvent({
    event_type: "ADMIN_ACTION",
    outcome: "SUCCESS",
    actor_entity_id: args.adminEntityId,
    target_entity_id: result.grant.scope_id ?? args.adminEntityId,
    details: {
      action: "ENTERPRISE_EMPLOYEE_GRANT_REVOKED",
      org_entity_id: orgEntityId,
      grant_id: args.grantId,
      connection_id: result.grant.connection_id,
    },
  });
  return { ok: true, grant_id: args.grantId };
}

/**
 * Employee (or admin) requests a tool for a capability. Lands as ORG_SEEDING
 * so admin confirms — never auto-connects. Ambient non-blocking.
 */
export async function requestEnterpriseToolAccess(args: {
  callerEntityId: string;
  capability_id: string;
  provider?: string;
}): Promise<
  | { ok: true; seed_id: string }
  | {
      ok: false;
      code: "NO_ORG_FOR_CALLER" | "UNKNOWN_CAPABILITY" | "ALREADY_OPEN" | "CREATE_FAILED";
      message?: string;
    }
> {
  let orgEntityId: string;
  try {
    orgEntityId = await getOrgEntityId(args.callerEntityId);
  } catch {
    return { ok: false, code: "NO_ORG_FOR_CALLER" };
  }
  const cap = ENTERPRISE_CAPABILITY_CATALOG.find(
    (c) => c.capability_id === args.capability_id,
  );
  if (cap === undefined) {
    return { ok: false, code: "UNKNOWN_CAPABILITY", message: "Unknown capability." };
  }
  const providerOpt =
    typeof args.provider === "string" && args.provider.length > 0
      ? cap.providers.find((p) => p.provider === args.provider) ?? cap.providers[0]
      : cap.providers[0];
  if (providerOpt === undefined) {
    return { ok: false, code: "UNKNOWN_CAPABILITY" };
  }

  const caller = await prisma.entity.findUnique({
    where: { entity_id: args.callerEntityId },
    select: { display_name: true },
  });
  const who = caller?.display_name ?? "A teammate";

  // Idempotent open request for same person + capability.
  const open = await prisma.workLedgerEntry.findMany({
    where: {
      org_entity_id: orgEntityId,
      ledger_type: "ORG_SEEDING",
      status: { in: ["SEED_PROPOSED", "SEED_NEEDS_REVIEW"] },
    },
    select: { ledger_entry_id: true, details: true },
    take: 100,
  });
  for (const row of open) {
    const d = (row.details ?? {}) as Record<string, unknown>;
    if (
      d.seed_type === "enterprise_tool_request" &&
      d.subject_entity_id === args.callerEntityId &&
      d.capability_id === args.capability_id
    ) {
      return { ok: false, code: "ALREADY_OPEN", message: "You already asked for this tool." };
    }
  }

  const action = `Enable ${providerOpt.label} for ${who} (${cap.label})`;
  const made = await createLedgerEntry({
    org_entity_id: orgEntityId,
    ledger_type: "ORG_SEEDING",
    source_type: "TRANSCRIPT",
    owner_entity_id: args.callerEntityId,
    title: action,
    summary: `${who} asked to connect ${providerOpt.label} for ${cap.label}. Admin enables org credentials / policy — never auto-granted.`,
    status: "SEED_PROPOSED",
    priority: "ROUTINE",
    extraction_source: "TYPESCRIPT_DETERMINISTIC",
    next_action: "Admin: enable credentials or approve connect path in Tools & Connections",
    evidence: [{ quote: `Employee requested ${cap.capability_id} / ${providerOpt.provider}` }],
    details: {
      seed_type: "enterprise_tool_request",
      subject_name: who,
      subject_entity_id: args.callerEntityId,
      recommended_action: action,
      capability_id: args.capability_id,
      provider: providerOpt.provider,
      confidence: "high",
      approval_required: true,
      policy_status: "needs_review",
      sensitivity: "internal",
      risk_if_ignored: "Work that needs this tool stays blocked or manual.",
      discovery_source: "employee_click_and_play",
    },
  });
  if (!made.ok) {
    return { ok: false, code: "CREATE_FAILED", message: "Could not file the request." };
  }
  await writeAuditEvent({
    event_type: "ADMIN_ACTION",
    outcome: "SUCCESS",
    actor_entity_id: args.callerEntityId,
    target_entity_id: args.callerEntityId,
    details: {
      action: "ENTERPRISE_TOOL_ACCESS_REQUESTED",
      org_entity_id: orgEntityId,
      capability_id: args.capability_id,
      provider: providerOpt.provider,
      seed_id: made.entry.ledger_entry_id,
    },
  });
  return { ok: true, seed_id: made.entry.ledger_entry_id };
}
