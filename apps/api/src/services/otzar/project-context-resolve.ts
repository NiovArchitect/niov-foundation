// FILE: project-context-resolve.ts
// PURPOSE: Deterministic conversation/text → WorkProject resolution without
//          inventing membership. Classifications: exact | likely | multiple |
//          none. Ambiguous never auto-attaches (confidence below threshold).
// CONNECTS TO: project-execution-loop, work-project list, unit oracle tests.

export type ProjectResolveClass =
  | "exact"
  | "likely"
  | "multiple"
  | "none";

export interface ProjectCandidate {
  project_id: string;
  name: string;
}

export interface ProjectResolveResult {
  classification: ProjectResolveClass;
  project_id: string | null;
  confidence: number;
  reason: string;
  candidate_ids: string[];
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// WHAT: Resolve which project a free-text communication likely refers to.
// WHY: Project-centered coherence needs an honest attach decision, not silent
//      wrong-project stamping.
export function resolveProjectFromText(args: {
  text: string;
  projects: ReadonlyArray<ProjectCandidate>;
  /** Minimum confidence to treat as exact/likely auto-attach (default 0.85). */
  auto_attach_min?: number;
}): ProjectResolveResult {
  const text = normalize(args.text);
  const min = args.auto_attach_min ?? 0.85;
  if (text.length === 0 || args.projects.length === 0) {
    return {
      classification: "none",
      project_id: null,
      confidence: 0,
      reason: "no_text_or_projects",
      candidate_ids: [],
    };
  }

  const scored: Array<{ id: string; name: string; score: number; why: string }> =
    [];
  for (const p of args.projects) {
    const name = normalize(p.name);
    if (name.length === 0) continue;
    if (text.includes(name)) {
      scored.push({
        id: p.project_id,
        name: p.name,
        score: 0.95,
        why: "exact_name_substring",
      });
      continue;
    }
    // Token overlap on significant tokens (len>=4)
    const nameTokens = name.split(" ").filter((t) => t.length >= 4);
    if (nameTokens.length === 0) continue;
    const hits = nameTokens.filter((t) => text.includes(t)).length;
    const ratio = hits / nameTokens.length;
    if (ratio >= 0.6) {
      scored.push({
        id: p.project_id,
        name: p.name,
        score: 0.55 + 0.35 * ratio,
        why: "token_overlap",
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  if (scored.length === 0) {
    return {
      classification: "none",
      project_id: null,
      confidence: 0,
      reason: "no_name_match",
      candidate_ids: [],
    };
  }

  const top = scored[0]!;
  const near = scored.filter((s) => s.score >= top.score - 0.05);
  if (near.length > 1 && near[1]!.score >= min - 0.1) {
    return {
      classification: "multiple",
      project_id: null,
      confidence: top.score,
      reason: "ambiguous_multiple_projects",
      candidate_ids: near.map((n) => n.id),
    };
  }
  if (top.score >= min) {
    return {
      classification: top.score >= 0.9 ? "exact" : "likely",
      project_id: top.id,
      confidence: top.score,
      reason: top.why,
      candidate_ids: [top.id],
    };
  }
  return {
    classification: "likely",
    project_id: null,
    confidence: top.score,
    reason: "below_auto_attach_threshold",
    candidate_ids: [top.id],
  };
}
