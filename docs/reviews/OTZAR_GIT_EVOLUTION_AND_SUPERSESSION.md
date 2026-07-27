# OTZAR — Git Evolution and Supersession

**Date:** 2026-07-27  
**Foundation tip:** `afe1491` (2026-07-21) — matches live API  
**Control Tower tip:** `96eb954` (2026-07-22-ish PR merges) — live bundle `index-DmQQIMEk.js` may lag tip; always re-verify

---

## 1. Original intent (reconstructed)

1. **Patent substrate first** — COSMP / DMW / audit / three wallets (Sections 1–11 + ADR-0001–0009)
2. **Foundation hardening** — Section 12C, GOVSEC, dual-control, jurisdiction, regulator
3. **BEAM coordination** — Phase 2–3 Elixir scale (ADR-0028–0040)
4. **Capsule accuracy** — mutation, embeddings, decay, staleness, AI_AGENT routing (ADR-0041–0046)
5. **Otzar as DGI Work OS** — doctrine ADR-0052; Twin waves 0051–0055; actions 0057; then massive Work OS / comms / dandelion / connectors expansion through mid-2026
6. **Control Tower UX** — Section 12 frontend → ambient Work OS → RC2 experience recomposition (July 2026)

---

## 2. Recent Foundation evolution (sample of tip commits)

Themes on `main` near HEAD (from `git log --oneline -40`):

| Theme | Example SHAs / PRs |
|-------|---------------------|
| Work OS trust / ledger | #732 `afe1491`, #728, #701–#704 |
| Google Docs writeback | #729–#731 |
| Comms ambient + extraction | #705–#709, #726–#727 |
| Work-style learning E2E | #719 `c593dff` |
| Wallet portability | #709 |
| Dandelion / accuracy packs | #694–#697 |
| Enterprise pressure harness | #711, #720–#723 |
| Holistic acceptance docs | #712–#715, #724 |

**Implication:** Product is deep in **Work OS operationalization**, not greenfield Twin chat only.

---

## 3. Recent Control Tower evolution

RC2 series PR #210–#223:

- Fresh org path, Behance brand, enterprise light/dark shell, Governance / Action Center / Intelligence / Security hubs
- Capability-preservation regression
- Comprehension protocol + copy humanization
- Employee residual copy, Talk ping path

**Supersession:** Visual language iterated multiple times (dark restore, bright enterprise, YC light). Treat **latest main** as visual truth, not June investor screenshots alone.

---

## 4. Superseded approaches (evidence-based)

| Older approach | Superseded by | Evidence |
|----------------|---------------|----------|
| Hash-by-content LLM fixtures (ADR-0012) | Key-based dispatch ADR-0014 | ADR text |
| Hard AI_AGENT → PERSONAL mapping | Dual-context ADR-0046 | ADR-0001/0039/0041 amends |
| Dandelion as separate primary product tab | Organization setup recomposition | RC2 controlling direction |
| Approvals/My Work/Blind Spots as peer primaries | Action Center hub redirects | route-inventory.ts |
| Billing/Marketplace/Federation prominent admin | Hidden for RC2 signal | YC_RC2_STATUS |
| "YC freeze closed" narrative | RC2 reopen for signal/first-use | YC_RC2_STATUS |
| Bare `npx vitest` | Tier configs + fail-closed vitest (ADR-0035 37th) | ADR-0047 PR.2 |
| Chat-only product framing | Work OS + DGI doctrine | ADR-0052 + system map |

---

## 5. Features that advanced then reopened

| Feature | Status note |
|---------|-------------|
| Investor demo readiness (June handoff) | Enterprise-demo ready with caveats → **experience RC2 reopened** |
| Meet integration | Provider paths exist; operational external blocks remain |
| Hierarchy UX | API proven; discoverability + DnD residuals |
| Walkthrough | Multiple iterations; RC2 v3 persistent walkthrough |

---

## 6. Branches / trees

| Repo | Branch | Clean? |
|------|--------|--------|
| niov-foundation | main == origin/main | Yes |
| otzar-control-tower | main == origin/main | Yes (at audit) |
| otzar-relay | main | Yes |
| otzar-control-tower 2 | main at stale SHA | Local duplicate — ignore |

**Other active Otzar writers:** 0 observed (clean working trees on primary repos). Caretaker not inspected.

---

## 7. Regression risks for future work

1. Deleting "admin complexity" that still powers intelligence (RC2 anti-pattern)
2. Treating CT UI hubs as deleting Foundation routes
3. Running full Foundation vitest concurrently (RULE 15)
4. Claiming deploy complete without SHA/bundle match
5. Touching Caretaker repos by broad filesystem search
6. Inventing organizational truth without OrgTruth* models / promote path

---

## 8. Test corpora

- Foundation: 253 unit + 217 integration test files present (not executed full-suite this audit)
- CT: large Playwright live matrix suite + unit tests
- Historical completion reports may cite deleted or renamed tests — re-glob before citing counts
