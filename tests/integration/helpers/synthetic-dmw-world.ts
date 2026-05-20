// FILE: synthetic-dmw-world.ts
// PURPOSE: Lifelike multi-DMW synthetic world-builder for the PERS.5b
//          integration simulation (ADR-0048 Phase 3 Sub-Arc 3; Q-PERS.5b).
//          Seeds a living enterprise: 1 COMPANY enterprise DMW (with its
//          project source-of-truth), 5 distinct PERSON employees with their
//          personal DMWs, and 5 AI_AGENT digital twins with their operating
//          memory — all via the REAL Foundation paths (createEntity →
//          createWallet/TAR, WriteService.createCapsule, createPermission,
//          EntityMembership, AuthService.login). The simulation drives the
//          governed working-set spine (createSessionContextResolver →
//          buildPersonalizedWorkingSet) to prove the 8 governance
//          obligations.
//
//          Q-PERS.5b locks honored:
//            - β-1: this is the world-builder; γ-1 the test consumes it.
//            - δ-1: accepted→source-of-truth is fixture-modeled via
//              promoteAcceptedDecision (no schema).
//            - ε-1: twin portability proven read-side + fixture discipline
//              (twin wallets hold only portable, clearance_required=0
//              capsules + an authorized goal summary; never the sensitive
//              enterprise capsule).
//            - ζ-1: no route / no server.ts — drives the service layer.
//            - η-1: real AuthService.login → session → resolver path.
//            - ι-1: real EntityMembership + Permission + clearance + scope.
//            - κ-1: no new audit literals.
//
//          Pre-flight findings encoded here (RULE 13; test-only, no
//          production code changed):
//            - createTwin produces password-less twins → twins are seeded as
//              login-capable AI_AGENT entities via createEntity (synthetic
//              password + PERSONAL wallet override) + manual EntityMembership
//              + TwinConfig.
//            - TAR.clearance_ceiling = defaultCeilingFor(type), NOT
//              createEntity(clearance_level) → per-entity session clearance is
//              set by mutating the TAR (computeTARHash → update) BEFORE login.
//            - capsule content must be written via WriteService.createCapsule
//              (encrypts + writes the content store) so the working set
//              returns content.
//
// CONNECTS TO: @niov/api (service stack + resolver + working-set), @niov/auth
//              (ContentEncryption), @niov/database (createEntity,
//              createPermission, computeTARHash, prisma), ../../helpers.js
//              (makeEntityInput, TEST_PREFIX, cleanupTestData).

import { randomBytes } from "node:crypto";
import {
  AuthService,
  NegotiateService,
  ReadService,
  WriteService,
  COEService,
  WorkingSetService,
  createSessionContextResolver,
  prismaWalletContextLookup,
  FixtureBasedEmbeddingProvider,
  MemoryNonceStore,
  MemoryContentStore,
  type LoginResult,
} from "@niov/api";
import { ContentEncryption } from "@niov/auth";
import {
  createEntity,
  createPermission,
  computeTARHash,
  prisma,
} from "@niov/database";
import { makeEntityInput } from "../../helpers.js";

const TEST_JWT_SECRET = "pers5b-synthetic-dmw-secret-not-for-prod";
const TEST_KEY = randomBytes(32);
const PASSWORD = "synthetic-correct-horse-battery-staple";

// WHAT: The in-test Foundation service stack (mirrors server wiring without
//        a route; shared nonce store + jwtSecret so login tokens validate
//        against the resolver's AuthService).
// WHY: Q-PERS.5b-ζ + blind-spot lock 4 — drive the service layer directly.
export interface ServiceStack {
  readonly auth: AuthService;
  readonly negotiate: NegotiateService;
  readonly read: ReadService;
  readonly write: WriteService;
  readonly coe: COEService;
  readonly workingSet: WorkingSetService;
  readonly contentStore: MemoryContentStore;
}

// WHAT: Build the full governed service stack.
// INPUT: None.
// OUTPUT: A ServiceStack wired with the production SessionContextResolver +
//         prismaWalletContextLookup (real DB) over a shared nonce store.
// WHY: η-1 — the WorkingSetService consumes the production resolver so the
//      simulation exercises the real login→session→wallet→working-set path.
export function buildServiceStack(): ServiceStack {
  const sessionStore = new MemoryNonceStore();
  const declarationStore = new MemoryNonceStore();
  const contentStore = new MemoryContentStore();
  const encryption = new ContentEncryption(TEST_KEY);
  const auth = new AuthService({ jwtSecret: TEST_JWT_SECRET, nonceStore: sessionStore });
  const negotiate = new NegotiateService(auth, declarationStore, TEST_JWT_SECRET);
  const read = new ReadService(auth, declarationStore, contentStore, TEST_JWT_SECRET);
  const write = new WriteService(
    auth,
    declarationStore,
    contentStore,
    encryption,
    TEST_JWT_SECRET,
    new FixtureBasedEmbeddingProvider(),
  );
  const coe = new COEService(auth, negotiate, read, encryption);
  const workingSet = new WorkingSetService(
    createSessionContextResolver(auth, prismaWalletContextLookup(prisma)),
    coe,
  );
  return { auth, negotiate, read, write, coe, workingSet, contentStore };
}

// WHAT: A seeded, login-capable principal (employee / twin / enterprise).
export interface Principal {
  readonly entity_id: string;
  readonly wallet_id: string;
  readonly token: string;
  readonly email: string;
  readonly clearance_ceiling: number;
}

// WHAT: One lifelike employee profile (role-specific, behaviorally meaningful).
interface EmployeeProfile {
  readonly key: string;
  readonly name: string;
  readonly role: string;
  readonly department: string;
  readonly hierarchy_level: number;
  readonly clearance: number;
  readonly routine: string;
  readonly work_style: string;
  readonly comms_style: string;
}

// WHAT: The 5 distinct synthetic employees (Q-PERS.5b fidelity lock).
const EMPLOYEES: readonly EmployeeProfile[] = [
  {
    key: "dana",
    name: "Dana Okafor",
    role: "COO / enterprise admin",
    department: "Exec",
    hierarchy_level: 6,
    clearance: 6,
    routine:
      "Early riser (05:30); school run 08:00-09:00; board prep Mon/Thu AM; protects no-meeting Friday afternoons for strategy.",
    work_style:
      "Decisive; delegates execution; reviews only escalations and budget sign-offs; closes loops fast.",
    comms_style: "Async-terse; bullet directives; approves or returns with one question.",
  },
  {
    key: "liang",
    name: "Liang Wei",
    role: "Engineering lead",
    department: "Eng",
    hierarchy_level: 4,
    clearance: 4,
    routine:
      "Late start (10:00); deep-work blocks 10:00-12:00 and 14:00-17:00; gym Tue/Thu 18:00; on-call weekends rotating.",
    work_style: "Detail-heavy; writes design docs; guards deep-work; resolves blockers and risks.",
    comms_style: "Threaded and precise; long written rationale; prefers PRs over meetings.",
  },
  {
    key: "priya",
    name: "Priya Nair",
    role: "Product manager",
    department: "Product",
    hierarchy_level: 3,
    clearance: 3,
    routine:
      "Daily standup 09:15; commute 08:00-09:00; daycare pickup 17:30; travels to design partners on Wednesdays.",
    work_style: "Synthesizing; owns goal + milestone; mediates an unresolved scope debate.",
    comms_style: "Frequent short syncs; crisp summaries; nudges decisions toward acceptance.",
  },
  {
    key: "marco",
    name: "Marco Rossi",
    role: "Designer",
    department: "Design",
    hierarchy_level: 2,
    clearance: 2,
    routine:
      "Studio hours 11:00-19:00; figure-drawing class Monday evenings; quiet, low-interruption mornings.",
    work_style: "Visual; heads-down; low-meeting; contributes design-scope summaries to the milestone.",
    comms_style: "Shows rather than tells; annotated mockups; brief written notes.",
  },
  {
    key: "sara",
    name: "Sara Haddad",
    role: "Sales / customer success lead",
    department: "GTM",
    hierarchy_level: 3,
    clearance: 3,
    routine:
      "Customer calls 09:00-11:00 and 15:00-17:00; CrossFit 07:00; quarterly travel to key accounts.",
    work_style: "Relational; owns a customer commitment; raises a delivery risk from the field.",
    comms_style: "Fast email; warm and direct; relays customer voice into the project.",
  },
];

// WHAT: The fully seeded synthetic world handle the simulation asserts against.
export interface SyntheticWorld {
  readonly enterprise: Principal & {
    readonly goal_capsule_id: string;
    readonly accepted_decision_id: string;
    readonly sensitive_capsule_id: string;
    readonly goal_summary_source_id: string;
    readonly eng_detail_id: string;
    readonly conflicting_capsule_id: string;
  };
  readonly employees: Record<string, Principal & { readonly clearance_gated_capsule_id: string | null }>;
  readonly twins: Record<string, Principal & { readonly owner_key: string; readonly alignment_summary_id: string }>;
  readonly unaccepted_conversation_id: string;
}

// WHAT: Mutate a TAR's clearance_ceiling BEFORE login (recompute tar_hash).
// WHY: Pre-flight D-5b-2 — session clearance derives from TAR.clearance_ceiling
//      (defaultCeilingFor(type)), not createEntity(clearance_level). Mutating
//      before login means the issued session carries the new hash.
async function setTarCeiling(entityId: string, ceiling: number): Promise<void> {
  const tar = await prisma.tokenAttributeRepository.findUnique({
    where: { entity_id: entityId },
  });
  if (tar === null) throw new Error(`TAR not found for ${entityId}`);
  const tar_hash = computeTARHash({
    can_login: tar.can_login,
    can_read_capsules: tar.can_read_capsules,
    can_write_capsules: tar.can_write_capsules,
    can_share_capsules: tar.can_share_capsules,
    can_create_hives: tar.can_create_hives,
    can_access_external_api: tar.can_access_external_api,
    can_admin_niov: tar.can_admin_niov,
    can_admin_org: tar.can_admin_org,
    clearance_ceiling: ceiling,
    monetization_role: tar.monetization_role,
    compliance_frameworks: tar.compliance_frameworks,
    status: tar.status,
  });
  await prisma.tokenAttributeRepository.update({
    where: { entity_id: entityId },
    data: { clearance_ceiling: ceiling, tar_hash },
  });
}

// WHAT: Create a login-capable entity (synthetic password), set its TAR
//        clearance, and log it in.
// WHY: Real createEntity → createWallet/TAR; real AuthService.login. For
//      twins, wallet_type is forced PERSONAL (twin operating memory).
async function registerAndLogin(
  stack: ServiceStack,
  entityType: "PERSON" | "COMPANY" | "AI_AGENT",
  clearanceCeiling: number,
  walletTypeOverride?: "PERSONAL",
): Promise<Principal> {
  const input = makeEntityInput({
    entity_type: entityType,
    password: PASSWORD,
    ...(walletTypeOverride !== undefined ? { wallet_type: walletTypeOverride } : {}),
  });
  const entity = await createEntity(input);
  await setTarCeiling(entity.entity_id, clearanceCeiling);
  const wallet = await prisma.wallet.findUnique({
    where: { entity_id: entity.entity_id },
    select: { wallet_id: true },
  });
  if (wallet === null) throw new Error(`wallet not found for ${entity.entity_id}`);
  const login = (await stack.auth.login(input.email!, PASSWORD, ["read", "write"], {
    ip_address: null,
  })) as LoginResult;
  if (!login.ok) throw new Error(`login failed for ${entityType}: ${JSON.stringify(login)}`);
  return {
    entity_id: entity.entity_id,
    wallet_id: wallet.wallet_id,
    token: login.token,
    email: input.email!,
    clearance_ceiling: clearanceCeiling,
  };
}

// WHAT: Seed one capsule via the REAL write path (encrypt + content store).
// WHY: Pre-flight D-5b-4 — only WriteService.createCapsule lands content in
//      the store so the working set returns it.
async function seedCapsule(
  stack: ServiceStack,
  token: string,
  args: {
    capsule_type: string;
    topic_tags: string[];
    payload_summary: string;
    content: string;
    clearance_required?: number;
    ai_access_blocked?: boolean;
    decay_type?: "TIME_BASED" | "FOUNDATIONAL" | "PERMANENT" | "ACCESS_BASED" | "SESSION_ONLY";
  },
): Promise<string> {
  const result = await stack.write.createCapsule(token, {
    capsule_type: args.capsule_type as never,
    topic_tags: args.topic_tags,
    payload_summary: args.payload_summary,
    content: args.content,
    ...(args.clearance_required !== undefined ? { clearance_required: args.clearance_required } : {}),
    ...(args.ai_access_blocked !== undefined ? { ai_access_blocked: args.ai_access_blocked } : {}),
    ...(args.decay_type !== undefined ? { decay_type: args.decay_type as never } : {}),
  });
  if (!result.ok) throw new Error(`createCapsule failed: ${JSON.stringify(result)}`);
  return result.capsule_id;
}

// WHAT: Write the ACCEPTED project decision into the enterprise wallet.
// INPUT: stack + the enterprise principal.
// OUTPUT: the accepted DECISION capsule_id.
// WHY: δ-1 — accepted→source-of-truth is fixture-modeled: ONLY the accepted
//      agreement is promoted into the enterprise DMW. Un-accepted conversation
//      is seeded elsewhere and never promoted here.
export async function promoteAcceptedDecision(
  stack: ServiceStack,
  enterpriseToken: string,
): Promise<string> {
  return seedCapsule(stack, enterpriseToken, {
    capsule_type: "DECISION",
    topic_tags: ["project", "architecture", "accepted"],
    payload_summary: "ACCEPTED: single-wallet working-set assembly; cross-wallet only via scoped NEGOTIATE.",
    content:
      "Decision (accepted 2026-05-18, owner Dana Okafor): adopt single-wallet working-set assembly for v2; cross-wallet access only through scoped NEGOTIATE grants. Supersedes the open thread proposing shared-wallet joins.",
    decay_type: "PERMANENT",
  });
}

// WHAT: Build the entire lifelike synthetic world.
// INPUT: A freshly built ServiceStack.
// OUTPUT: A SyntheticWorld handle (principals, tokens, capsule ids).
// WHY: One seeded world reused across all scenarios (Q-PERS.5b-λ + cycle cost).
export async function buildSyntheticWorld(stack: ServiceStack): Promise<SyntheticWorld> {
  // --- Enterprise (COMPANY) DMW + project source-of-truth -----------------
  const ent = await registerAndLogin(stack, "COMPANY", 6); // sovereign over its own SoT
  const goal_capsule_id = await seedCapsule(stack, ent.token, {
    capsule_type: "DOMAIN_KNOWLEDGE",
    topic_tags: ["project", "goal", "q3"],
    payload_summary: "Q3 goal: ship v2 governance API to 3 design-partner enterprises.",
    content:
      "Project goal (Q3): ship the v2 governance API to 3 design-partner enterprises; success = <50ms p95 working-set assembly and zero cross-tenant leakage.",
    decay_type: "FOUNDATIONAL",
  });
  const accepted_decision_id = await promoteAcceptedDecision(stack, ent.token);
  const sensitive_capsule_id = await seedCapsule(stack, ent.token, {
    capsule_type: "COMPLIANCE_RECORD",
    topic_tags: ["m&a", "confidential"],
    payload_summary: "Sensitive: M&A financials (restricted).",
    content:
      "CONFIDENTIAL M&A: acquiring Lattice Data for $42M; expected close Aug 15; not for distribution outside the deal team.",
    clearance_required: 6,
    ai_access_blocked: true,
    decay_type: "PERMANENT",
  });
  const goal_summary_source_id = await seedCapsule(stack, ent.token, {
    capsule_type: "DOMAIN_KNOWLEDGE",
    topic_tags: ["project", "goal", "summary", "shareable"],
    payload_summary: "Shareable goal summary: align teams to the Q3 v2 governance API milestone.",
    content:
      "Shareable summary (non-sensitive): the team is aligning to ship the v2 governance API to design partners this quarter; focus on latency and zero leakage.",
    clearance_required: 0,
  });
  const eng_detail_id = await seedCapsule(stack, ent.token, {
    capsule_type: "WORK_PATTERN",
    topic_tags: ["eng", "architecture", "detail"],
    payload_summary: "Engineering detail: single-wallet retrieval internals.",
    content:
      "Eng detail: working-set assembly resolves a single wallet by session entity; NEGOTIATE+READ is the only cross-wallet path; HNSW iterative scan tuned for p95.",
    clearance_required: 3,
  });
  const conflicting_capsule_id = await seedCapsule(stack, ent.token, {
    capsule_type: "DOMAIN_KNOWLEDGE",
    topic_tags: ["project", "architecture", "stale"],
    payload_summary: "Stale proposal: shared-wallet joins (superseded).",
    content:
      "Stale/superseded note: an earlier thread proposed shared-wallet joins for cross-team reads. This conflicts with the accepted decision and must not override source-of-truth.",
    clearance_required: 0,
  });
  // Seed a HIGH-clearance personal item in the enterprise wallet for S8 reference.

  // --- Employees + twins ---------------------------------------------------
  const employees: Record<string, Principal & { clearance_gated_capsule_id: string | null }> = {};
  const twins: Record<string, Principal & { owner_key: string; alignment_summary_id: string }> = {};
  let unaccepted_conversation_id = "";

  for (const p of EMPLOYEES) {
    const emp = await registerAndLogin(stack, "PERSON", p.clearance);
    await seedCapsule(stack, emp.token, {
      capsule_type: "PREFERENCE",
      topic_tags: ["routine", "calendar", p.key],
      payload_summary: `${p.name} routine + calendar`,
      content: `${p.name} — ${p.routine}`,
      clearance_required: 0,
    });
    await seedCapsule(stack, emp.token, {
      capsule_type: "BEHAVIORAL_PATTERN",
      topic_tags: ["work-style", p.key],
      payload_summary: `${p.name} work style`,
      content: `${p.name} — ${p.work_style}`,
      clearance_required: 0,
    });
    await seedCapsule(stack, emp.token, {
      capsule_type: "COMMUNICATION_PREF",
      topic_tags: ["comms", p.key],
      payload_summary: `${p.name} communication style`,
      content: `${p.name} — ${p.comms_style}`,
      clearance_required: 0,
    });

    // S8 clearance fixture: a personal capsule above some employees' ceilings.
    let clearanceGated: string | null = null;
    if (p.key === "dana" || p.key === "liang") {
      clearanceGated = await seedCapsule(stack, emp.token, {
        capsule_type: "IDENTITY",
        topic_tags: ["restricted", p.key],
        payload_summary: `${p.name} clearance-gated personal note`,
        content: `${p.name} — personal note tagged clearance 5 (visible only at ceiling >= 5).`,
        clearance_required: 5,
      });
    }

    // Un-accepted conversation lives in Priya's personal wallet — NEVER promoted.
    if (p.key === "priya") {
      unaccepted_conversation_id = await seedCapsule(stack, emp.token, {
        capsule_type: "CONVERSATION_LEARNING",
        topic_tags: ["project", "scope", "unresolved"],
        payload_summary: "Unresolved scope debate (not accepted).",
        content:
          "Open thread: should v2 include cross-team shared-wallet joins? No agreement reached; NOT accepted; must not enter enterprise source-of-truth.",
        clearance_required: 0,
      });
    }

    employees[p.key] = { ...emp, clearance_gated_capsule_id: clearanceGated };

    // EntityMembership(enterprise -> employee) with role/department/hierarchy.
    await prisma.entityMembership.create({
      data: {
        parent_id: ent.entity_id,
        child_id: emp.entity_id,
        role_title: p.role,
        department: p.department,
        hierarchy_level: p.hierarchy_level,
        is_admin: p.key === "dana",
        is_active: true,
      },
    });

    // Twin: login-capable AI_AGENT with PERSONAL wallet (pre-flight D-5b-1).
    const twin = await registerAndLogin(stack, "AI_AGENT", 2, "PERSONAL");
    await seedCapsule(stack, twin.token, {
      capsule_type: "SESSION_LEARNING",
      topic_tags: ["twin", "operating", p.key],
      payload_summary: `${p.name} twin operating note`,
      content: `Twin operating memory: ${p.name} prefers ${p.comms_style.toLowerCase()} and ${p.work_style.toLowerCase()}`,
      clearance_required: 0,
    });
    await seedCapsule(stack, twin.token, {
      capsule_type: "WORK_PATTERN",
      topic_tags: ["twin", "productivity", p.key],
      payload_summary: `${p.name} twin productivity pattern`,
      content: `Twin learned pattern: schedule deep work around ${p.name}'s routine; surface nudges, never store enterprise-sensitive data.`,
      clearance_required: 0,
    });
    // Authorized portable scoped-summary of the project goal (alignment artifact).
    const alignment_summary_id = await seedCapsule(stack, twin.token, {
      capsule_type: "DOMAIN_KNOWLEDGE",
      topic_tags: ["project", "goal", "summary", "twin"],
      payload_summary: "Authorized goal summary (portable, non-sensitive).",
      content:
        "Authorized scoped summary: align to the Q3 v2 governance API goal; latency + zero leakage. (Non-sensitive; no M&A or financial detail.)",
      clearance_required: 0,
    });

    await prisma.entityMembership.create({
      data: {
        parent_id: emp.entity_id,
        child_id: twin.entity_id,
        role_title: "Digital Twin",
        department: p.department,
        hierarchy_level: p.hierarchy_level,
        is_admin: false,
        is_active: true,
      },
    });
    await prisma.twinConfig.create({
      data: {
        twin_id: twin.entity_id,
        autonomy_level: "APPROVAL_REQUIRED",
        role_template: p.role,
        is_admin_twin: false,
        approver_entity_id: emp.entity_id,
      },
    });

    twins[p.key] = { ...twin, owner_key: p.key, alignment_summary_id };

    // Grants: COMPANY -> employee + twin, SUMMARY scope on the shareable
    // goal summary, SESSION_ONLY (sovereignty-safe: COMPANY grantor).
    await createPermission({
      capsule_id: goal_summary_source_id,
      grantor_entity_id: ent.entity_id,
      grantee_entity_id: emp.entity_id,
      access_scope: "SUMMARY",
      duration_type: "SESSION_ONLY",
      conditions: { department: p.department },
    });
    await createPermission({
      capsule_id: goal_summary_source_id,
      grantor_entity_id: ent.entity_id,
      grantee_entity_id: twin.entity_id,
      access_scope: "SUMMARY",
      duration_type: "SESSION_ONLY",
      conditions: { department: p.department, twin_of: emp.entity_id },
    });
  }

  // ABAC: only the Eng lead (Liang) gets FULL on the eng-detail capsule.
  await createPermission({
    capsule_id: eng_detail_id,
    grantor_entity_id: ent.entity_id,
    grantee_entity_id: employees["liang"]!.entity_id,
    access_scope: "FULL",
    duration_type: "SESSION_ONLY",
    conditions: { department: "Eng" },
  });

  return {
    enterprise: {
      ...ent,
      goal_capsule_id,
      accepted_decision_id,
      sensitive_capsule_id,
      goal_summary_source_id,
      eng_detail_id,
      conflicting_capsule_id,
    },
    employees,
    twins,
    unaccepted_conversation_id,
  };
}
