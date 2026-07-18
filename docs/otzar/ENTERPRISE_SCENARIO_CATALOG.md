# Otzar Enterprise Scenario Catalog

> **Purpose:** Binding product scenarios for state-of-the-art Work OS proof.
> Minimum **30 scenarios per family**. Smoke, design, and engineering must
> map to these IDs — never invent clinical or financial facts in proofs.
>
> **Updated:** 2026-07-18  
> **Families:** User · Collaboration · AI Teammate · Third party  
> **Companion:** `AGENT_CONTINUITY_MEMORY.md`, `scripts/otzar-whole-system-smoke.sh`

### Legend

| Field | Meaning |
|-------|---------|
| **ID** | Stable scenario key (`U-##`, `C-##`, `T-##`, `X-##`) |
| **Primary actor** | Who initiates |
| **Rails** | Product surfaces / APIs involved |
| **Success** | Honest, fail-closed outcome |
| **Proof** | designed · unit · integration · live-smoke · blocked |

### Global invariants (every scenario)

1. Communication is the OS; blank-doc is never the default.
2. Comms ingestion is **ambient/auto** from connected tools; paste is **fallback**.
3. Twins never invent regulated facts; dual-control when accuracy-critical.
4. No silent external tool mutation; connectors gated and honest when missing.
5. Cross-tenant / peer wallet / secrets never leak.
6. Ambient UX — users do not have to live in Otzar for daily work.
7. Wallet portability: personal layer only on exit; org data stays.

---

## 1. User scenarios (U-01 … U-32)

Everyday individual and role-based journeys across industries.

| ID | Title | Primary actor | Rails | Success |
|----|-------|---------------|-------|---------|
| **U-01** | First login lands in ambient Today | Employee | Login, `/app` Today | Persona landing; presence greeting; no empty dashboard maze |
| **U-02** | Talk to Otzar from Today orb | Employee | Ambient bar, conversation | Voice/text opens; Twin answers within role context |
| **U-03** | Needs me shows only actionable items | Employee | Action Center | Approvals/handoffs that need human; calm empty when clear |
| **U-04** | My Work lists owned commitments | Employee | My Work, ledger | Owned `COMMITMENT` rows with `can_complete` when owner |
| **U-05** | Complete a task from My Work | Employee | My Work PATCH | Status → EXECUTED/VERIFIED; drops from active buckets |
| **U-06** | Quiet mode suppresses interruptions | Employee | Presence, notifications | Non-critical ambient quiet; critical still surfaces |
| **U-07** | Ambient Meet auto-sync without opening Comms | Employee/org | Background cron, Meet | Pull when scopes OK; honest SCOPE_REAUTH otherwise |
| **U-08** | Open Comms — primary is sync, not paste | Employee | Comms UI | Ambient hero primary; paste/live capture fallback only |
| **U-09** | Paste transcript fallback when offline | Employee | `/comms/ingest` | Work extracted; same spine as auto path |
| **U-10** | Multi-person meeting fans work to owners | Employee (admin ingest) | Ingest, graph, My Work | David/Vishesh get owned work; not only caller follow-ups |
| **U-11** | Follow-up cards survive navigation | Employee | Comms, FOLLOW_UP ledger | Cards reload from durable rows |
| **U-12** | Send governed internal follow-up | Employee | Comms send, actions | Recipient confirmed; audit trail; no unsafe send |
| **U-13** | Restricted recipient blocked from send | Employee | Recipient governance | Shiney→Shweta class never send-ready |
| **U-14** | View My Twin role template | Employee | My Twin | Real template (not "Digital Twin" shell) |
| **U-15** | Accuracy packs match org industry | Employee/admin | My Twin, org settings | TECH/healthcare/finance packs honest |
| **U-16** | Connect Google Workspace tools | Employee/admin | Tools & Connections | OAuth consent; readiness reflects real connection |
| **U-17** | Missing tool shows human names | Admin | AI Teammates | "Needs Slack, GitHub" not raw tokens |
| **U-18** | Create working notes doc (gated) | Employee | Today, Google Doc write | Doc created only with scope; reconnect honest if missing |
| **U-19** | Projects list memberships | Employee | Projects | Non-empty when MEMBER; empty state routes to twin/comms |
| **U-20** | Manager places structure seed | Manager | Organization Seeding | Ambient placement; employee not forced into admin UI |
| **U-21** | Memory wallet posture visible | Employee | My Memory / My Twin | Portable vs org-retained vs never-export clear |
| **U-22** | Leave org — wallet export filter | Employee (exit) | Wallet export classifier | Only PORTABLE_PERSONAL; secrets/peers excluded |
| **U-23** | Org admin Control Tower home | Admin | Admin shell | Glass CT; deeper tools without terminal chrome |
| **U-24** | Admin enterprise tools inventory | Admin | Tools inventory | Catalog, people, approve/deny/revoke |
| **U-25** | Dual-control accuracy KPI visible | Admin | Tools inventory E.3 | Regulated claims await human verify |
| **U-26** | Healthcare care-plan dual-control | Clinician | Twin work, accuracy | Twin claims; human verifies; no invented clinical facts |
| **U-27** | Finance KYC pack dual-control | Analyst | Twin work, packs | Verification gate; no invented financial facts |
| **U-28** | Insurance prior-auth form path | Ops staff | Twin work, forms | Structural shell only; human evidence required |
| **U-29** | Login without requested_operations fails closed | CLI/API | Auth | `OPERATION_NOT_PERMITTED` — not product bug |
| **U-30** | Employee denied admin inventory | Employee | Enterprise tools | 403 honest; no leak |
| **U-31** | Deep-link back to Action Center after login | Employee | returnTo, login | Same-origin path restored; open-redirect blocked |
| **U-32** | Desktop ambient edge presence | Employee | Edge glow, orb | Non-blocking; work remains foreground |

---

## 2. Collaboration scenarios (C-01 … C-32)

Human↔human, human↔AI, AI↔AI, handoffs, DGI, shared work.

| ID | Title | Primary actor | Rails | Success |
|----|-------|---------------|-------|---------|
| **C-01** | Incoming handoff appears on Today | Recipient | Handoffs, Today | One-tap acknowledge available |
| **C-02** | One-tap handoff acknowledge | Recipient | Handoff ambient ACK | Durable USER turn; version-safe |
| **C-03** | Complete ambient handoff after ACK | Recipient | complete-ambient | Linked obligations complete |
| **C-04** | Incoming collab request accept | Twin owner | Collab requests | State → accepted; inbox updates |
| **C-05** | Collab request needs approval | Approver | Collab NEEDS_APPROVAL | Human approves; Twin does not self-approve regulated |
| **C-06** | Team work visible to manager | Manager | Team Work | Org-scoped open work; non-manager blocked |
| **C-07** | DGI coherence HEALTHY strip | Employee | dgi-coherence | Always-visible; server authority |
| **C-08** | DGI UNPAIRED recovery path | Employee | DGI, My Twin | Clear CTA to resolve twin pairing |
| **C-09** | DGI BLOCKED multi-twin fail-closed | Employee | DGI | No blended twin context |
| **C-10** | Next-best-step from DGI | Employee | Today NBS | Route to Needs me / twin / tools |
| **C-11** | Collaboration plan on Today | Employee | DGI wave-4 | Deterministic plan surface |
| **C-12** | Twin authority posture shown | Employee | DGI authority | Honest autonomy ceiling |
| **C-13** | Multi-person date agreement | Peers | Calendar resolve | Weekday agreement without double-book lie |
| **C-14** | Shared workspace create | Employee | Collab workspaces | Workspace with visibility INTERNAL_ONLY default |
| **C-15** | Workspace EXTERNAL_ALLOWED for client pilot | Admin/lead | Workspaces | External collab allowed under policy |
| **C-16** | Workspace lists counts only | Member | Workspaces list | No payload/transcript leak in list |
| **C-17** | Decision recorded in workspace | Member | Workspace decisions | Owner + evidence; governed |
| **C-18** | Commitment in workspace fans to My Work | Owner | Workspace → ledger | Owner sees commitment on My Work |
| **C-19** | Support role is not owned task | Support person | Responsibility graph | Support edge only; no over-task |
| **C-20** | Lead gets coordination card not IC task | Meeting lead | Graph, Comms | Lead tracks owners; not random task |
| **C-21** | Pairing status between twins | System | Twin pairing | Same-org collab allowed for EMPLOYEE_TWIN |
| **C-22** | Cross-department handoff | Two depts | Handoffs | Org stays; no tenant leak |
| **C-23** | Manager hierarchy confirm | Admin/manager | Seeding B.1 | NEEDS_MANAGER only for true orphans |
| **C-24** | Project membership multi-person | Project owner | Work projects | Members listed by human names |
| **C-25** | Shared doc edit detection | Owner | Twin work C.3b | Drive edit detected; human informed |
| **C-26** | Relay in-thread twin draft | Peers | Relay wave-2 | Draft in thread; extract-work preview |
| **C-27** | Org-truth conflict review | Domain owner | Org-truth | Promote answer; never client invent |
| **C-28** | Authority grant to peer | Grantor | Authority grants | Scoped grant; revocable |
| **C-29** | Revoke peer authority | Grantor | Authority | Immediate deny; audit |
| **C-30** | Clock-out twin collab research | Twins (system) | Playground gated | Research/playground; writes still gated |
| **C-31** | Correction memory learn-loop retarget | Employee | Follow-up priors | Prior org correction helps disambiguate |
| **C-32** | Collaborative kickoff from transcript | Team | Kickoff, twin claim | Project stamp; twin claims; notify humans |

---

## 3. AI Teammate scenarios (T-01 … T-32)

Twin provisioning, claim, execute, verify, tools, autonomy, accuracy.

| ID | Title | Primary actor | Rails | Success |
|----|-------|---------------|-------|---------|
| **T-01** | Twin provisioned with role template | System/admin | createTwin | Human role_title + template not shell |
| **T-02** | Repair null role templates | Admin | repair endpoint | All teammates have real templates |
| **T-03** | CEO twin accuracy packs (TECH) | Founder twin | My Twin packs | Ranked packs; never invent facts |
| **T-04** | Engineer twin tool requirements | Eng twin | AgentTemplate | required_tools modeled; readiness honest |
| **T-05** | Twin claims work from comms | Twin | twin-work claim | EXECUTING; human notified |
| **T-06** | Twin notifies on claim (no dual effort) | Human | Notifications | Human sees "Twin working on this" |
| **T-07** | Twin completes and notifies | Twin | twin-work complete | Status complete; human informed |
| **T-08** | Accuracy-critical complete gated | Twin + human | C.3c verify | Cannot complete without verify |
| **T-09** | Human verifies accuracy work | Human | Today Verify | complete_after path when allowed |
| **T-10** | Twin requests collaboration | Twin | Collab request | Honest request; no silent join |
| **T-11** | Twin blocked without connector | Twin | execution plan | connector_required visible blocker |
| **T-12** | Twin CONNECTOR_UPDATE claim | Twin | twin-work | Claims wait state; never silent write |
| **T-13** | Google Doc twin materialization | Twin | Google docs write | Gated create; scope reauth honest |
| **T-14** | Slides claim without rail | Twin | artifact claim | Honest claim; no fake slides file |
| **T-15** | Twin conversation with CEO context | Employee | conversation/message | Role-aware response |
| **T-16** | Twin calibration preferences | Employee | Twin calibration | Consent-gated preference shape |
| **T-17** | Risky content guardrail | System | CS-4 guardrail | Risky calibration blocked server-side |
| **T-18** | Twin skill equip | Employee/admin | Twin skills | Skills on personal wallet layer |
| **T-19** | Autonomy APPROVAL_REQUIRED default | Twin | TwinConfig | No auto-send external |
| **T-20** | Autonomy ceiling from role template | System | role template | Template default + org cap |
| **T-21** | Admin twin flag | Admin twin | TwinConfig | is_admin_twin provenance honest |
| **T-22** | Twin work appears on Today C.3 | Human | Today twin_working | EXECUTING list; open My Work |
| **T-23** | Twin same-org collab only | Twin | collab sameorg | External twin collab denied |
| **T-24** | Twin playground scenario (gated) | Twin | Playground | Scenario against org goals; no free write |
| **T-25** | Twin refuses invented clinical note | Healthcare twin | Accuracy pack | Fail closed; human evidence required |
| **T-26** | Twin refuses invented KYC numbers | Finance twin | Accuracy pack | Structural pack only |
| **T-27** | Twin draft message in Relay | Twin | Relay draft | In-thread draft; human send gate |
| **T-28** | Twin observes without over-writing | Twin | Observation | Learns portable preferences; not org secrets |
| **T-29** | Twin tool readiness OAuth union | System | tool readiness | Google OAuth + bindings merged |
| **T-30** | Twin accuracy KPI rollup | Admin | E.3 inventory | Counts regulated / await verify |
| **T-31** | Twin handoff complete ambient | Twin + human | Handoff complete | Obligations finish under governance |
| **T-32** | Multi-twin org roster list | Admin | AI Teammates | All people + twin posture; no UUID primary UI |

---

## 4. Third-party scenarios (X-01 … X-32)

Clients, consultants, partners, external orgs — SoT without cross-tenant leak.

| ID | Title | Primary actor | Rails | Success |
|----|-------|---------------|-------|---------|
| **X-01** | Register external organization label | Admin | External org | company_name / organization_label accepted |
| **X-02** | Add external collaborator identity | Admin | External collab | EXTERNAL_TRACKED honest; no auto consent |
| **X-03** | Client pilot collab workspace | Lead | Workspaces EXTERNAL_ALLOWED | Workspace exists; counts only in list |
| **X-04** | Invite external to workspace | Lead | Workspace members | Scoped membership; no wallet share |
| **X-05** | External sees only shared workspace | External | Workspace detail | No org-wide My Work / seeds |
| **X-06** | External cannot read org inventory | External | Enterprise tools | 403 / no route |
| **X-07** | External cannot export peer wallets | External | Wallet | NEVER_EXPORT enforced |
| **X-08** | Meeting with client name in roster gap | Employee | Ingest | Unresolved name → NEEDS_OWNER / external tracked |
| **X-09** | Resolve external name later | Admin | Identity reconcile | T-2.5 external state named; no silent assign |
| **X-10** | Consultant as EXTERNAL_ALLOWED member | Admin | Collab | Can contribute decisions under scope |
| **X-11** | Partner handoff into workspace | Employee | Handoff + workspace | Artifact scoped; no full org memory |
| **X-12** | Client commitment owned by internal | Internal owner | Graph | Owner internal; client as participant only |
| **X-13** | Vendor cannot trigger dual-control bypass | Vendor twin? | Accuracy | Dual-control still required |
| **X-14** | Multi-tenant parent/child org | Platform | Multi-tenant | Nested tenant isolation |
| **X-15** | Standalone org no parent leak | Org A | Tenancy | No data from Org B |
| **X-16** | Shared project with Acme external | NIOV + Acme | Collab SoT smoke | Workspace + external collab live-proven pattern |
| **X-17** | External email never auto-sent | System | Actions | SEND_INTERNAL only unless connector approved |
| **X-18** | External Slack channel gated | Admin | Connector policy | Opt-in binding; default deny |
| **X-19** | Remove external collaborator | Admin | External collab | Immediate loss of access; audit |
| **X-20** | External leave — no residual tokens | System | Revoke | Credentials/scopes not retained for them |
| **X-21** | Client document in workspace only | Member | Workspace docs | Not in personal wallet export |
| **X-22** | Professional services engagement | PM | Projects + external | Mission + client in graph separately |
| **X-23** | Healthcare external lab (metadata only) | Clinic | External org | Labels only; no PHI invention |
| **X-24** | Finance external auditor read-scoped | Auditor | Authority grant | Scoped read; no write twin |
| **X-25** | Insurance adjuster external track | Ops | External identity | EXTERNAL_TRACKED until proven |
| **X-26** | Joint venture dual-org workspace | Two orgs | Future multi-tenant | Fail closed until substrate ready |
| **X-27** | Marketplace discovery no auto-install | Admin | Marketplace | Browse only; install gated |
| **X-28** | MCP advanced-only for third tools | Power user | Connectors | Click-and-play first; MCP not primary IA |
| **X-29** | External in responsibility graph support | Ingest | Graph | Support edge; never auto owner |
| **X-30** | Third-party SoT smoke workspace present | Smoke | collab workspaces | ≥1 workspace for pilot path |
| **X-31** | Label alias organization_label | API | External org API | Alias accepted (#703) |
| **X-32** | External calendar invitee not roster | Calendar | Scheduled meeting | Safe roster projection; unresolved honest |

---

## 5. Coverage matrix (industries × families)

| Industry | User | Collab | Twin | Third party |
|----------|------|--------|------|-------------|
| Tech SaaS | U-01–U-15, U-31–32 | C-01–C-14, C-32 | T-01–T-15, T-29–32 | X-01–X-07, X-16, X-28–31 |
| Healthcare | U-26 | C-27 | T-25 | X-23 |
| Finance / KYC | U-27 | C-27 | T-26 | X-24 |
| Insurance | U-28 | C-18 | T-08–T-09 | X-25 |
| Professional services | U-19–U-20 | C-14–C-18 | T-05–T-07 | X-03–X-12, X-22 |
| Multi-tenant | U-23 | C-22 | T-23 | X-14–X-15, X-26 |

---

## 6. Smoke mapping (minimum continuous)

Run after every deploy (`scripts/otzar-whole-system-smoke.sh` + live probes):

| Smoke probe | Scenarios covered |
|-------------|-------------------|
| Health + login ops | U-01, U-29 |
| my-twin role + packs + wallet | U-14, U-15, U-21, T-01–T-03 |
| employee projects | U-19 |
| collab workspaces ≥1 | X-03, X-16, X-30, C-14 |
| ambient sources + ambient-sync | U-07, U-08 |
| multi-person ingest fan-out | U-10, C-18, T-05 |
| employee inventory 403 | U-30 |

### Scenario harness (next automation)

Prefer scenario IDs in smoke output, e.g. `PASS U-10 fan-out`, `PASS X-30 collab workspace`. Expand `otzar-whole-system-smoke.sh` and live e2e to tag IDs explicitly.

---

## 7. Explicit non-goals / anti-scenarios

| Anti-ID | Never do |
|---------|----------|
| **A-01** | Invent clinical findings or diagnoses |
| **A-02** | Invent financial balances or KYC outcomes |
| **A-03** | Auto-send external email/Slack without connector + policy |
| **A-04** | Export peer wallets or org secrets with employee exit |
| **A-05** | Blend multi-twin contexts when unpaired/blocked |
| **A-06** | Treat paste as primary ingestion path in product copy |
| **A-07** | Jira-first or broad MCP marketplace as default IA |
| **A-08** | Force users to live in Otzar for routine work |

---

## 8. Change control

- Add scenarios with new stable IDs; never renumber.
- Mark **Proof** as live-smoke only when authenticated live green.
- On each Phase ship, tick scenarios that moved proof level in PR description.
