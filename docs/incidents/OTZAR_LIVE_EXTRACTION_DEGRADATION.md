# OTZAR Live Extraction Degradation

**Date:** 2026-07-27  
**Status:** RECOVERED (live LLM path verified)

## Symptom

Comms ingest returned LOCAL_FALLBACK summary:  
"Otzar captured this conversation but live extraction isn't configured…"

## Root cause (traced)

1. Path: `comms-ingest` → `extractFromCapturedText` (`comms-extract.service.ts`).
2. When `llmProvider` fails or returns unparsable JSON, code sets `fallback_reason` and returns LOCAL_FALLBACK with empty decisions/commitments/risks.
3. Admin probe: `GET /admin/llm-status` → **provider=anthropic, status=CONFIGURED, model=claude-sonnet-4-5**.
4. Render env: `ANTHROPIC_API_KEY` present; default `getLLMProvider()` selects Anthropic.
5. Re-ingest (same production path) returned **extraction_mode=LLM**, **extraction_outcome=EXTRACTION_COMPLETED_WITH_SIGNALS**, **fallback_reason=null**.

**Most likely prior failure class:** transient PROVIDER_ERROR / PROVIDER_MALFORMED_RESPONSE / circuit (not MISSING_KEY). Provider is configured; first degraded run was not a permanent misconfig.

## Secondary defect (code)

Even with successful LLM extraction, ledger work-item **titles** often remained  
`Follow-up owned by X` because `enrichResponsibilityGraphFromExtraction` did not:

- parse colon-form commitments (`Name: deliverable`);
- upgrade empty `workItem` on existing owner nodes.

**Fix:** PR #741 (`a36ad81`).

## Repair actions

| Action | Result |
|--------|--------|
| Verify LLM status endpoint | CONFIGURED |
| Re-ingest strong transcript | LLM success |
| Work-item title enrichment | PR #741 |
| Document path | this file |

## Acceptance evidence (live)

- meeting_capture_id: `3f09d77c-fab6-48fe-8032-be031c376d16`
- decisions: 3
- commitments: 5
- risks: 4
- extraction_mode: LLM
