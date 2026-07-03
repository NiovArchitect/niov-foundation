// FILE: twin-tool-readiness.ts
// PURPOSE: [GAP-H TOOLS] Pure, honest tool-readiness for one twin: the role
//          template's required_tools (provider keys) matched against the
//          org's enabled ConnectorBinding types. Ready ONLY when every
//          required tool has a matching connected binding — no requirements
//          modeled => "not_configured", never a fake ready. Safe scalars
//          only (keys + human labels).
// CONNECTS TO: AgentTemplate.required_tools (seeded from
//          apps/api/templates/roles/*.md frontmatter),
//          ConnectorBinding.type (free-form, e.g. "slack"/"SLACK_WRITE"),
//          GET /org/ai-teammates projection, tests/unit/twin-tool-readiness.

/** Human labels for the provider keys role templates may require. Mirrors
 *  provider-registry display names; falls back to title-case for unknown
 *  keys so a new requirement never renders as a raw token. */
const TOOL_LABELS: Record<string, string> = {
  SLACK: "Slack",
  GOOGLE_WORKSPACE: "Google Workspace",
  MICROSOFT_365: "Microsoft 365",
  JIRA: "Jira",
  LINEAR: "Linear",
  GITHUB: "GitHub",
  GITLAB: "GitLab",
  SALESFORCE: "Salesforce",
  HUBSPOT: "HubSpot",
  ZOOM: "Zoom",
};

export function toolLabel(toolKey: string): string {
  const known = TOOL_LABELS[toolKey.toUpperCase()];
  if (known !== undefined) return known;
  return toolKey
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(" ");
}

// WHAT: Does an org binding type satisfy a required provider key?
// WHY: Binding types are free-form ("slack", "SLACK_WRITE"); requirements
//      are provider keys ("SLACK"). Deterministic normalized match: exact,
//      or the binding is a variant of the provider (SLACK_WRITE ⊇ SLACK).
export function bindingSatisfiesTool(bindingType: string, toolKey: string): boolean {
  const b = bindingType.trim().toUpperCase();
  const t = toolKey.trim().toUpperCase();
  if (b.length === 0 || t.length === 0) return false;
  return b === t || b.startsWith(`${t}_`) || t.startsWith(`${b}_`);
}

export interface TwinToolReadiness {
  status: "ready" | "needs_setup" | "not_configured";
  missing_tools: Array<{ tool_key: string; label: string }>;
  connected_tools_count: number;
  required_tools_count: number;
}

// WHAT: Compute one twin's readiness from its template requirements + the
//        org's enabled binding types.
// WHY: Empty requirements = not modeled = "not_configured" (the honest
//      state the UI renders as "Tool requirements not set yet").
export function computeTwinToolReadiness(
  requiredTools: ReadonlyArray<string>,
  orgBindingTypes: ReadonlyArray<string>,
  connectedToolsCount: number,
): TwinToolReadiness {
  const required = Array.from(
    new Set(requiredTools.map((t) => t.trim().toUpperCase()).filter((t) => t.length > 0)),
  );
  if (required.length === 0) {
    return {
      status: "not_configured",
      missing_tools: [],
      connected_tools_count: connectedToolsCount,
      required_tools_count: 0,
    };
  }
  const missing = required.filter(
    (tool) => !orgBindingTypes.some((b) => bindingSatisfiesTool(b, tool)),
  );
  return {
    status: missing.length === 0 ? "ready" : "needs_setup",
    missing_tools: missing.map((tool_key) => ({ tool_key, label: toolLabel(tool_key) })),
    connected_tools_count: connectedToolsCount,
    required_tools_count: required.length,
  };
}
