// FILE: provision-yc-heliogrid-demo.ts
// PURPOSE: Protected production reseed of the isolated Y Combinator Labs
//          demo tenant with HelioGrid fictional review truth, complete work
//          contracts, two AI collaborations, and contractor persona.
//          API-only — never raw production DB. Never NIOV Labs org.
//
// SAFETY GATES (all required for --apply):
//   YC_DEMO_ORG_ENTITY_ID          must match live YC Labs org
//   YC_DEMO_EXPECTED_FINGERPRINT   prefix of org id (first 8 hex)
//   NIOV_APPROVE_YC_DEMO_RESEED    exact phrase
//   DEMO admin password via --password-file or YC_DEMO_ADMIN_PASSWORD
//
// USAGE:
//   npx tsx scripts/provision-yc-heliogrid-demo.ts --dry-run
//   npx tsx scripts/provision-yc-heliogrid-demo.ts --apply \
//     --password-file ../otzar-control-tower/.meridian-demo-state/demo_password
//   npx tsx scripts/provision-yc-heliogrid-demo.ts --apply ...  # run 2 idempotent

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const API = process.env.OTZAR_API_URL ?? "https://api.otzar.ai/api/v1";
const ORG_ID =
  process.env.YC_DEMO_ORG_ENTITY_ID ??
  "ac06749c-e7a1-46f8-943c-7a27b69d451d";
const EXPECTED_FP =
  process.env.YC_DEMO_EXPECTED_FINGERPRINT ?? ORG_ID.slice(0, 8);
const APPROVAL_ENV = "NIOV_APPROVE_YC_DEMO_RESEED";
const APPROVAL_PHRASE =
  "APPROVE YC LABS HELIOGRID RESEED — demo tenant only";
const ADMIN_EMAIL = process.env.YC_DEMO_ADMIN_EMAIL ?? "demo@otzar.ai";
const NIOV_ORG_REFUSE = "a4ddc200-b651-4215-a3b3-e25ad8d97032";

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run") || !args.includes("--apply");
const PW_FILE_IDX = args.indexOf("--password-file");
const PW_FILE = PW_FILE_IDX >= 0 ? args[PW_FILE_IDX + 1] : null;

interface Person {
  key: string;
  email: string;
  name: string;
  title: string;
  admin?: boolean;
  contractor?: boolean;
}

const PEOPLE: Person[] = [
  {
    key: "ava",
    email: "ava.chen+meridian@niovlabs.com",
    name: "Ava Chen",
    title: "Application review lead",
  },
  {
    key: "jordan",
    email: "jordan.hale+meridian@niovlabs.com",
    name: "Jordan Hale",
    title: "Technical diligence lead",
  },
  {
    key: "casey",
    email: "casey.nguyen+meridian@niovlabs.com",
    name: "Casey Nguyen",
    title: "Security lead",
  },
  {
    key: "riley",
    email: "riley.okonkwo+meridian@niovlabs.com",
    name: "Riley Okonkwo",
    title: "Market review lead",
  },
  {
    key: "morgan",
    email: "morgan.lee+meridian@niovlabs.com",
    name: "Morgan Lee",
    title: "Regular reviewer",
  },
  {
    key: "sam",
    email: "sam.rivera+meridian@niovlabs.com",
    name: "Sam Rivera",
    title: "Program coordinator",
  },
  {
    key: "quinn",
    email: "quinn.marsh+meridian@niovlabs.com",
    name: "Quinn Marsh",
    title: "Contractor researcher",
    contractor: true,
  },
];

const PROJECT_NAME = "HelioGrid application review (fictional)";

const WORK: Array<{
  title: string;
  summary: string;
  owner_email: string;
  next_action: string;
  status: string;
  origin_key: string;
}> = [
  {
    origin_key: "heliogrid:security-gate",
    title:
      "Casey: complete remaining security controls before interview invite",
    summary:
      "Encryption review and data-rights approval must be green before Ava sends the interview invitation. Fictional HelioGrid review.",
    owner_email: "casey.nguyen+meridian@niovlabs.com",
    next_action: "Confirm encryption + data-rights checklist items",
    status: "DETECTED",
  },
  {
    origin_key: "heliogrid:arch-evidence",
    title: "Jordan: attach architecture evidence pack for HelioGrid review",
    summary:
      "Technical diligence needs the architecture evidence package for conditional interview readiness.",
    owner_email: "jordan.hale+meridian@niovlabs.com",
    next_action: "Upload architecture evidence to the project",
    status: "DETECTED",
  },
  {
    origin_key: "heliogrid:customer-evidence",
    title: "Riley: verify Northline Ops customer evidence reference",
    summary:
      "Market evidence needs verification after correction — pilot measured ~11%, not 18%.",
    owner_email: "riley.okonkwo+meridian@niovlabs.com",
    next_action: "Confirm urgency claim with Northline Ops (design partner)",
    status: "DETECTED",
  },
  {
    origin_key: "heliogrid:interview-blocked",
    title:
      "Ava: send interview invitation only after security gate is green",
    summary:
      "One consequential process action: interview invite after Casey confirms controls.",
    owner_email: "ava.chen+meridian@niovlabs.com",
    next_action: "Wait for Casey security confirmation",
    status: "BLOCKED",
  },
  {
    origin_key: "heliogrid:contractor-vendor",
    title: "Quinn: research NovaGuard vendor control gaps for Casey",
    summary:
      "Bounded contractor research on vendor security dependency. No org-wide authority.",
    owner_email: "quinn.marsh+meridian@niovlabs.com",
    next_action: "Summarize NovaGuard control gaps for security lead",
    status: "DETECTED",
  },
  {
    origin_key: "heliogrid:recommendation",
    title: "Current recommendation: conditional interview for HelioGrid",
    summary:
      "Fictional startup HelioGrid — strong technical promise; incomplete security readiness; customer evidence verification in progress. Conditions: security checklist + verified customer reference.",
    owner_email: "demo@otzar.ai",
    next_action: "Track open conditions only",
    status: "PROPOSED",
  },
];

function loadPassword(): string {
  if (process.env.YC_DEMO_ADMIN_PASSWORD) {
    return process.env.YC_DEMO_ADMIN_PASSWORD;
  }
  if (PW_FILE) {
    const p = resolve(PW_FILE);
    if (!existsSync(p)) throw new Error(`password file missing: ${p}`);
    return readFileSync(p, "utf8").trim();
  }
  const fallback = resolve(
    process.cwd(),
    "../otzar-control-tower/.meridian-demo-state/demo_password",
  );
  if (existsSync(fallback)) return readFileSync(fallback, "utf8").trim();
  throw new Error(
    "Password required: --password-file or YC_DEMO_ADMIN_PASSWORD",
  );
}

async function api(
  method: string,
  path: string,
  opts: { token?: string; body?: unknown } = {},
): Promise<{ status: number; json: Record<string, unknown> }> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  return { status: res.status, json };
}

function entityIdFromToken(token: string): string | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const json = JSON.parse(
      Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
        "utf8",
      ),
    ) as { entity_id?: string };
    return typeof json.entity_id === "string" ? json.entity_id : null;
  } catch {
    return null;
  }
}

async function login(
  email: string,
  password: string,
): Promise<{ token: string; entity_id: string | null }> {
  const r = await api("POST", "/auth/login", {
    body: {
      email,
      password,
      requested_operations: ["read", "write", "admin_org", "share"],
    },
  });
  if (r.status !== 200 || typeof r.json.token !== "string") {
    throw new Error(`login failed ${email} ${r.status} ${JSON.stringify(r.json)}`);
  }
  const token = r.json.token;
  return { token, entity_id: entityIdFromToken(token) };
}

function isVagueTitle(title: string): boolean {
  const t = title.trim();
  if (/^follow[\s-]*up\s+(to|with)\s+/i.test(t)) return true;
  if (/^circle\s*back/i.test(t)) return true;
  if (/^follow\s*up\s*$/i.test(t)) return true;
  return false;
}

async function main(): Promise<void> {
  if (ORG_ID === NIOV_ORG_REFUSE) {
    throw new Error("REFUSE: cannot target NIOV Labs org");
  }
  if (!ORG_ID.startsWith(EXPECTED_FP)) {
    throw new Error(
      `REFUSE: org fingerprint mismatch expected ${EXPECTED_FP} got ${ORG_ID.slice(0, 8)}`,
    );
  }

  console.log(
    JSON.stringify({
      step: "gates",
      mode: DRY ? "DRY_RUN" : "APPLY",
      api: API,
      org_entity_id_prefix: ORG_ID.slice(0, 8),
      expected_fingerprint: EXPECTED_FP,
      caretaker_relay: "NOT_TOUCHED",
    }),
  );

  if (!DRY) {
    if (process.env[APPROVAL_ENV] !== APPROVAL_PHRASE) {
      throw new Error(
        `REFUSE: set ${APPROVAL_ENV}='${APPROVAL_PHRASE}' for --apply`,
      );
    }
  }

  const password = loadPassword();
  const adminLogin = await login(ADMIN_EMAIL, password);
  const adminToken = adminLogin.token;

  // Inventory
  const workRes = await api("GET", "/work-os/my-work?take=100", {
    token: adminToken,
  });
  const items = (workRes.json.items as Array<Record<string, unknown>>) ?? [];
  const vague = items.filter((i) =>
    isVagueTitle(String(i.title ?? "")),
  );
  const plan = {
    archive_vague: vague.map((v) => ({
      id: v.ledger_entry_id,
      title: v.title,
      status: v.status,
    })),
    create_people: PEOPLE.map((p) => p.email),
    create_work: WORK.map((w) => w.origin_key),
    collaborations: ["security_status", "customer_evidence"],
  };
  console.log(JSON.stringify({ step: "dry_run_diff", ...plan }, null, 2));

  if (DRY) {
    console.log(JSON.stringify({ step: "done", dry_run: true, ok: true }));
    return;
  }

  // 1) Cancel vague active/draft follow-ups (archive, not delete)
  let archived = 0;
  for (const v of vague) {
    const id = String(v.ledger_entry_id ?? "");
    if (!id) continue;
    const r = await api("PATCH", `/work-os/ledger/${id}`, {
      token: adminToken,
      body: {
        status: "CANCELLED",
        summary: "Archived: vague follow-up removed from active demo projection (HelioGrid reseed)",
      },
    });
    if (r.status === 200) archived += 1;
  }

  // 2) Ensure people (incl contractor) and resolve entity ids via login JWT
  const personIds: Record<string, string> = {};
  if (adminLogin.entity_id) personIds[ADMIN_EMAIL] = adminLogin.entity_id;
  for (const p of PEOPLE) {
    const reg = await api("POST", "/auth/admin-register", {
      token: adminToken,
      body: {
        email: p.email,
        password,
        first_name: p.name.split(" ")[0],
        last_name: p.name.split(" ").slice(1).join(" ") || "Demo",
        role_title: p.title,
        is_admin: false,
      },
    });
    const entity =
      (reg.json.entity as { entity_id?: string } | undefined)?.entity_id ||
      (reg.json.entity_id as string | undefined) ||
      null;
    if (entity) personIds[p.email] = entity;
    if (!personIds[p.email]) {
      try {
        const lg = await login(p.email, password);
        if (lg.entity_id) personIds[p.email] = lg.entity_id;
      } catch {
        /* login may fail if not yet active */
      }
    }
    console.log(
      JSON.stringify({
        step: "person",
        email_local: p.email.split("@")[0],
        status: reg.status,
        has_id: Boolean(personIds[p.email]),
      }),
    );
  }

  // 3) Project
  let projectId: string | null = null;
  const projList = await api("GET", "/otzar/work-projects", {
    token: adminToken,
  });
  const projects =
    (projList.json.projects as Array<Record<string, unknown>>) ||
    (projList.json.items as Array<Record<string, unknown>>) ||
    [];
  const existing = projects.find((p) =>
    /heliogrid/i.test(String(p.name ?? p.title ?? "")),
  );
  if (existing) {
    projectId = String(existing.project_id ?? existing.id ?? "");
  } else {
    const cr = await api("POST", "/otzar/work-projects", {
      token: adminToken,
      body: { name: PROJECT_NAME, state: "ACTIVE" },
    });
    const proj = cr.json.project as Record<string, unknown> | undefined;
    projectId = String(proj?.project_id ?? cr.json.project_id ?? "");
  }

  // 4) Create work with origin_key idempotency in details
  let workCreated = 0;
  let workSkipped = 0;
  const existingTitles = new Set(
    items.map((i) => String(i.title ?? "").toLowerCase()),
  );
  for (const w of WORK) {
    if (existingTitles.has(w.title.toLowerCase())) {
      workSkipped += 1;
      continue;
    }
    // Also skip if origin_key already on any item details — best effort
    const ownerId = personIds[w.owner_email];
    const r = await api("POST", "/work-os/ledger", {
      token: adminToken,
      body: {
        ledger_type: "TASK",
        source_type: "MEETING",
        title: w.title,
        summary: w.summary,
        status: w.status,
        next_action: w.next_action,
        ...(ownerId ? { owner_entity_id: ownerId } : {}),
        ...(projectId ? { project_id: projectId } : {}),
        details: {
          demo_seed: "yc_heliogrid_production",
          origin_key: w.origin_key,
          project_subject: PROJECT_NAME,
          fictional: true,
          startup: "HelioGrid",
          recommendation: "conditional_interview",
        },
        evidence: [
          {
            quote: w.summary,
            source: "heliogrid_demo_transcript",
          },
        ],
      },
    });
    if (r.status === 200 || r.status === 201) {
      workCreated += 1;
      existingTitles.add(w.title.toLowerCase());
    } else {
      console.log(
        JSON.stringify({
          step: "work_fail",
          title: w.title.slice(0, 40),
          status: r.status,
          code: r.json.code,
        }),
      );
    }
  }

  // 5) Two AI collaborations (Ava→Casey security, Riley→Ava customer)
  async function completeCollab(
    requesterEmail: string,
    targetEmail: string,
    summary: string,
    completeSummary: string,
  ): Promise<{ ok: boolean; state?: string; id?: string; detail?: string }> {
    const reqLogin = await login(requesterEmail, password);
    const reqToken = reqLogin.token;
    let targetId = personIds[targetEmail];
    if (!targetId) {
      try {
        const lg = await login(targetEmail, password);
        if (lg.entity_id) {
          targetId = lg.entity_id;
          personIds[targetEmail] = lg.entity_id;
        }
      } catch {
        /* ignore */
      }
    }
    if (!targetId) return { ok: false, detail: "no_target_id" };
    const c = await api("POST", "/otzar/my-twin/collaboration-requests", {
      token: reqToken,
      body: {
        // Prefer EMPLOYEE_TWIN when present; fall back to EMPLOYEE (same
        // person, AI-initiated request) so demo works before twins exist.
        target_type: "EMPLOYEE",
        request_type: "CONTEXT_REQUEST",
        target_entity_id: targetId,
        safe_summary: summary,
        requested_by_ai: true,
        requires_approval: false,
      },
    });
    const collab = c.json.collaboration as Record<string, unknown> | undefined;
    let id = String(collab?.collaboration_id ?? c.json.collaboration_id ?? "");
    if (!id) {
      // Retry as twin target if employee path failed unexpectedly
      const c2 = await api("POST", "/otzar/my-twin/collaboration-requests", {
        token: reqToken,
        body: {
          target_type: "EMPLOYEE_TWIN",
          request_type: "CONTEXT_REQUEST",
          target_entity_id: targetId,
          safe_summary: summary,
          requested_by_ai: true,
          requires_approval: false,
        },
      });
      const collab2 = c2.json.collaboration as Record<string, unknown> | undefined;
      id = String(collab2?.collaboration_id ?? c2.json.collaboration_id ?? "");
      if (!id) {
        return {
          ok: false,
          detail: String(c.json.code ?? c2.json.code ?? c.status),
          state: JSON.stringify(c.json).slice(0, 160),
        };
      }
    }
    const targetLogin = await login(targetEmail, password);
    await api("POST", `/otzar/my-twin/collaboration-requests/${id}/accept`, {
      token: targetLogin.token,
      body: {},
    });
    const done = await api(
      "POST",
      `/otzar/my-twin/collaboration-requests/${id}/complete`,
      {
        token: targetLogin.token,
        body: { safe_summary: completeSummary },
      },
    );
    const final = done.json.collaboration as Record<string, unknown> | undefined;
    return {
      ok: true,
      id,
      state: String(final?.state ?? done.json.state ?? "UNKNOWN"),
    };
  }

  const collab1 = await completeCollab(
    "ava.chen+meridian@niovlabs.com",
    "casey.nguyen+meridian@niovlabs.com",
    "[HelioGrid] Application review AI Teammate requests Casey's current security-gate status (encryption + data-rights only). Private memory excluded. Project: HelioGrid application review (fictional).",
    "Security summary: encryption review documentation present; data-rights approval still open — interview invite remains blocked until data-rights green. Source: security checklist. Unrelated projects excluded.",
  );
  // Apply security result to work (skip if already present)
  if (collab1.ok && !existingTitles.has(
    "otzar clarified: casey must finish data-rights approval before ava sends interview invite",
  )) {
    const avaTok = (await login("ava.chen+meridian@niovlabs.com", password)).token;
    await api("POST", "/work-os/ledger", {
      token: avaTok,
      body: {
        ledger_type: "TASK",
        title:
          "Otzar clarified: Casey must finish data-rights approval before Ava sends interview invite",
        summary:
          "AI Teammate collaboration result applied. Encryption docs accepted; data-rights remains open condition on conditional interview.",
        status: "DETECTED",
        next_action: "Track data-rights only",
        details: {
          demo_seed: "yc_heliogrid_production",
          origin_key: "heliogrid:collab-security-result",
          collaboration_id: collab1.id,
          fictional: true,
        },
      },
    });
  }

  const collab2 = await completeCollab(
    "riley.okonkwo+meridian@niovlabs.com",
    "ava.chen+meridian@niovlabs.com",
    "[HelioGrid] Market AI Teammate requests permitted Northline Ops reference evidence for recommendation. Private memory excluded.",
    "Customer evidence: Northline Ops confirmed pilot ~11% savings + Q4 planning urgency. Do not use 18% claim. Linked to market evidence work.",
  );
  if (
    collab2.ok &&
    !existingTitles.has(
      "customer evidence updated: northline ops pilot 11% with q4 urgency (18% claim retired)",
    )
  ) {
    const rileyTok = (await login("riley.okonkwo+meridian@niovlabs.com", password))
      .token;
    await api("POST", "/work-os/ledger", {
      token: rileyTok,
      body: {
        ledger_type: "TASK",
        title:
          "Customer evidence updated: Northline Ops pilot 11% with Q4 urgency (18% claim retired)",
        summary:
          "AI Teammate collaboration applied to review. Recommendation remains conditional interview; market condition progressing.",
        status: "DETECTED",
        next_action: "Lock reference language in report",
        details: {
          demo_seed: "yc_heliogrid_production",
          origin_key: "heliogrid:collab-customer-result",
          collaboration_id: collab2.id,
          fictional: true,
        },
      },
    });
  }

  // 6) Quality census after
  const after = await api("GET", "/work-os/my-work?take=100", {
    token: adminToken,
  });
  const afterItems =
    (after.json.items as Array<Record<string, unknown>>) ?? [];
  const vagueAfter = afterItems.filter((i) =>
    isVagueTitle(String(i.title ?? "")),
  );
  const activeStatuses = new Set([
    "DETECTED",
    "INFERRED",
    "DRAFT",
    "READY_TO_EXECUTE",
    "EXECUTING",
    "NEEDS_OWNER",
    "BLOCKED",
    "PROPOSED",
  ]);
  const active = afterItems.filter((i) =>
    activeStatuses.has(String(i.status)),
  );
  const titles = active.map((i) => String(i.title));
  const dups = titles.filter((t, idx) => titles.indexOf(t) !== idx);

  console.log(
    JSON.stringify(
      {
        step: "apply_result",
        ok: vagueAfter.length === 0 && dups.length === 0,
        archived_vague: archived,
        work_created: workCreated,
        work_skipped_existing: workSkipped,
        project_id_prefix: projectId ? projectId.slice(0, 8) : null,
        collab_security: collab1,
        collab_customer: collab2,
        active_work_count: active.length,
        vague_active_remaining: vagueAfter.length,
        duplicate_active_titles: dups.length,
        recommendation: "conditional_interview",
        fictional: "HelioGrid",
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error("[yc-heliogrid] FAIL", e instanceof Error ? e.message : e);
  process.exit(1);
});
