# OTZAR — ADR Compliance Matrix

**Date:** 2026-07-27  
**Method:** Code path existence + route/service presence + test file presence + live API SHA match.  
**Legend:** IMPLEMENTED = substantial runtime code; PARTIAL = design landed + incomplete product surface or open residuals; DOCS_ONLY = doctrine/research without runtime claim; OPEN = program still open; SUPERSEDED = replaced framing (verify both).

| ADR | Domain | Runtime evidence | Tests | Deploy follows? | Verdict |
|-----|--------|------------------|-------|-----------------|---------|
| 0001 | Wallets | Wallet model + defaultWalletTypeFor + dual-context docs | unit twin/wallet | Yes | IMPLEMENTED |
| 0002 | Audit chain | audit.ts + trigger | integration audit | Yes live audit | IMPLEMENTED |
| 0004 | Service auth gate | *ForCaller patterns | many | Yes | IMPLEMENTED |
| 0005/0016 | no-console | anchor test | yes | Yes | IMPLEMENTED |
| 0006 | Cross-org | filter narrowing + govsec tests | isolation tests | Yes | IMPLEMENTED |
| 0009 | COSMP 7-ops | cosmp services + BEAM router | cosmp tests | Yes | IMPLEMENTED |
| 0011–0015 | Test/CI | vitest tiers + workflows | meta | Yes | IMPLEMENTED |
| 0022 | combined_score | coe/keywords | coe tests | Yes | IMPLEMENTED (frozen) |
| 0026 | Dual-control | requireDualControl + privileged endpoints | dual-control tests | Yes | IMPLEMENTED |
| 0033–0040 | BEAM persist/dispatch | Elixir apps present | mix tests offline here | Deployed with API | IMPLEMENTED (complex) |
| 0041–0047 | Capsule layer | write/similarity/embedding fields | G3 tests + more | Yes | IMPLEMENTED |
| 0048 | Personalization | coe + personalization services | unit/integration | Yes | IMPLEMENTED core; WS API may partial |
| 0049 | GOVSEC program | matrix + phased gaps | partial gap suite | Ongoing | **OPEN / Proposed** |
| 0050 | Break-glass | break-glass.service + routes + model | BG tests claimed | Yes | IMPLEMENTED core |
| 0051 | Transparency | transparency.ts + conductSession fields | otzar-transparency tests | Yes | IMPLEMENTED |
| 0052 | DGI doctrine | docs only by design | N/A | N/A | DOCS_ONLY (controlling) |
| 0053 | My Twin profile | my-twin routes + CT MyTwin | twin tests | Yes | IMPLEMENTED (beyond design ADR) |
| 0054 | Look-back | conversation-detail service + routes | conversation tests | Yes | IMPLEMENTED |
| 0055 | Corrections link | conversation_id on capsules + routes | correction tests | Yes | IMPLEMENTED |
| 0057 | Actions | action/* full stack | action tests | Yes | IMPLEMENTED |
| 0058/0068 | Drift/proactivity | drift-*.ts, proactivity.service | drift tests | Yes | PARTIAL→IMPLEMENTED features; full coaching product open |
| 0059–0064/0087 | Hives | hive services/routes | hive tests | Yes | PARTIAL product surface |
| 0060/0065/72–77 | Playground | playground services + CT route | playground tests | Yes | PARTIAL (hidden from primary nav RC2) |
| 0066–0067 | Proposed pattern | proposed-pattern service | tests | Yes | IMPLEMENTED |
| 0078–0079 | Context signals | conversation services | tests | Yes | PARTIAL |
| 0080 | OOTB ontology | templates/roles + ootb catalog CT | tests | Yes | PARTIAL depth |
| 0082 | Dandelion | dandelion services + CT seeding | dandelion tests | Yes | IMPLEMENTED engine; UX recomposed |
| 0083/0093 | Billing | billing services + CT preview | partial | Partial | PARTIAL (nav de-emphasized RC2) |
| 0084 | MCP/connectors | connector* + Mcp* models | connector tests | Partial live OAuth | PARTIAL |
| 0085/0089 | Voice | voice routes/services | voice tests | Partial providers | PARTIAL |
| 0086 | Action promotion | action + proposed-action | tests | Yes | IMPLEMENTED |
| 0088 | Comms intelligence | ambient-comms*, work-comms models | comms tests | Yes ambient sync | PARTIAL→strong |
| 0090 | Python runtime | python services + worker compose | scripts | Advisory path | PARTIAL |
| 0091–0092 | BEAM expansion | BEAM apps | mix | Yes | PARTIAL ongoing |
| 0094 | Agent tx research | docs | N/A | N/A | DOCS_ONLY research |

### Aggregate (audit judgment)

| Verdict | Approx count |
|---------|--------------|
| IMPLEMENTED (core) | ~55–65 of 93 numbered ADRs |
| PARTIAL | ~20–25 |
| DOCS_ONLY / research / doctrine | ~8–12 |
| OPEN program (GOVSEC umbrella etc.) | ~3–5 |
| SUPERSEDED framing | few (e.g. ADR-0012 dispatch → 0014; some GOVSEC.5 text amended) |

**Do not ship claims of "all ADRs done."** Many Accepted ADRs are design locks with later partial productization.
