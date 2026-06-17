"""Deterministic meeting / ambient-perception intelligence (Phase 1285-V).

Advisory only. Foundation's deterministic capture is primary and the sole
policy/ownership/scope authority; Foundation validates, scopes, audits, and
decides what becomes governed work. This module turns a captured perception
stream (meeting transcript / conversation note / imported notes) into
closed-vocab advisory candidates using general phrase + structure heuristics.

No LLM. No chain-of-thought. No raw transcript retained or echoed: each
candidate's ``text`` is a short trimmed line and ``evidence_phrase`` is the
short matched marker. ``summary`` is a concise deterministic synthesis (the
first substantive line, trimmed), never a generative paraphrase.

The same shape is the runway for future glasses/lens ambient packets — a short
"someone committed to follow up" or "a slide says launch is Friday" line enters
exactly this pipeline.
"""

from __future__ import annotations

import re

from .schemas import (
    MeetingCandidateType,
    MeetingIntelligenceCandidate,
    MeetingIntelligenceInput,
    MeetingIntelligenceResult,
)

# Marker phrases per candidate type. First matched marker on a line becomes the
# evidence_phrase. Order of TYPES below is the priority when a line matches more
# than one (a blocker beats a generic follow-up, etc.).
_MARKERS: list[tuple[MeetingCandidateType, tuple[str, ...]]] = [
    ("DECISION", ("we decided", "decision is", "let's go with", "we'll go with",
                  "agreed to", "going with", "final call", "we settled on", "approved to")),
    ("BLOCKER", ("blocked", "waiting on", "waiting for", "can't proceed",
                 "cannot proceed", "stuck on", "held up", "bottleneck", "dependency on")),
    ("RISK", ("risk", "at risk", "concern", "worried", "might slip", "could slip",
              "behind schedule", "may miss", "danger")),
    ("OPEN_QUESTION", ("open question", "still unclear", "not sure", "tbd", "to be decided",
                       "question is", "need to figure out", "unresolved")),
    ("COMMITMENT", ("i'll ", "i will ", "i'm going to", "i am going to", "i commit",
                    "i can have", "i'll take", "i'll handle", "on it")),
    ("ACTION_ITEM", ("action item", "to-do", "to do", "need to", "needs to", "have to",
                     "make sure", "must ", "let's ")),
    ("FOLLOW_UP", ("follow up", "follow-up", "circle back", "check in", "touch base",
                   "loop back", "revisit", "get back to")),
]

_DUE_MARKERS = ("by friday", "by monday", "by tuesday", "by wednesday", "by thursday",
                "by end of", "by eod", "due ", "deadline", "by next", "this week", "next week")


def _confidence(line_lc: str, marker: str, candidate_type: MeetingCandidateType) -> str:
    # Deterministic: a due-date marker alongside the signal, or a second marker
    # of the same family, lifts confidence. A bare single marker is MEDIUM; a
    # weak/ambiguous match is LOW.
    has_due = any(d in line_lc for d in _DUE_MARKERS)
    family = dict(_MARKERS)[candidate_type]
    marker_hits = sum(1 for m in family if m in line_lc)
    if marker_hits >= 2 or (has_due and candidate_type in ("ACTION_ITEM", "COMMITMENT", "FOLLOW_UP")):
        return "HIGH"
    if len(marker) <= 4:  # very short marker => weaker signal
        return "LOW"
    return "MEDIUM"


def _strip_speaker(line: str) -> str:
    # "David: I'll review by Friday" -> "I'll review by Friday" (speaker label
    # is structure, not content). Conservative: only a short leading "Name:".
    m = re.match(r"^\s*[A-Z][A-Za-z .'-]{0,30}:\s*(.+)$", line)
    return m.group(1).strip() if m else line.strip()


def extract_meeting_intelligence(
    payload: MeetingIntelligenceInput,
) -> MeetingIntelligenceResult:
    raw_lines = [ln for ln in re.split(r"[\r\n]+", payload.transcript) if ln.strip()]
    candidates: list[MeetingIntelligenceCandidate] = []
    seen: set[tuple[str, str]] = set()  # (type, text) dedupe

    first_substantive: str | None = None

    for raw in raw_lines:
        content = _strip_speaker(raw)
        if len(content) < 3:
            continue
        if first_substantive is None and len(content) >= 12:
            first_substantive = content
        lc = content.lower()
        for candidate_type, markers in _MARKERS:
            matched = next((m for m in markers if m in lc), None)
            if matched is None:
                continue
            text = content[:280].strip()
            key = (candidate_type, text.lower())
            if key in seen:
                break
            seen.add(key)
            candidates.append(
                MeetingIntelligenceCandidate(
                    candidate_type=candidate_type,
                    text=text,
                    confidence=_confidence(lc, matched, candidate_type),  # type: ignore[arg-type]
                    evidence_phrase=matched.strip()[:160],
                )
            )
            break  # one candidate per line (highest-priority type)

    # Concise, deterministic summary: the first substantive line, trimmed. Never
    # a generative paraphrase; honest about being an extract.
    summary = None
    if first_substantive is not None:
        summary = first_substantive[:600].strip()

    return MeetingIntelligenceResult(summary=summary, candidates=candidates)
