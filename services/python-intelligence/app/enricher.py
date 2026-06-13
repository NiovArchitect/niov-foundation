"""Deterministic conversation-to-work signal enricher (Phase 1282).

Advisory only. Foundation's TypeScript deterministic extraction is the
primary path and the sole policy/ownership/target authority. This module
surfaces ADDITIONAL closed-vocab work signals from a single safe utterance
using general phrase heuristics — no LLM, no per-employee learning, no
chain-of-thought, no raw memory retained.

Detection is marker-based: each signal type owns a set of lowercase marker
phrases. A match yields one ``WorkSignal`` whose ``evidence_phrase`` is the
matched marker (never the full user utterance). Confidence is deterministic:

- 2+ markers for the same type  -> HIGH
- exactly 1 marker              -> MEDIUM
- a "weak" single marker        -> LOW

``multi_intent`` is True when two or more distinct signal types fire, which
mirrors Foundation's multi-intent planner without ever overriding it.
"""

from __future__ import annotations

from .schemas import (
    WorkSignal,
    WorkSignalExtractionInput,
    WorkSignalExtractionResult,
    WorkSignalType,
)

# Marker phrases per signal type. Order within a type does not matter; the
# first matched marker becomes the evidence_phrase for that type.
_MARKERS: dict[WorkSignalType, tuple[str, ...]] = {
    "FOLLOW_UP": (
        "follow up", "follow-up", "circle back", "check in", "check back",
        "get back to", "touch base", "loop back", "revisit",
    ),
    "COMMITMENT": (
        "i'll ", "i will ", "i am going to", "i'm going to", "let me ",
        "i can ", "i'll take", "i'll handle", "on it", "i commit",
    ),
    "TASK": (
        "need to ", "needs to ", "have to ", "we should ", "must ",
        "to-do", "to do ", "action item", "make sure", "remember to",
    ),
    "DELEGATION": (
        "can you ", "could you ", "please ", "ask ", "have him",
        "have her", "have them", "get him to", "get her to",
        "get them to", "assign ", "delegate ", "hand off",
    ),
    "DECISION": (
        "we decided", "let's go with", "we'll go with", "decision is",
        "agreed to", "we'll use", "going with", "final call",
        "we settled on",
    ),
    "BLOCKER": (
        "blocked", "waiting on", "waiting for", "can't proceed",
        "cannot proceed", "stuck on", "depends on", "dependency on",
        "held up", "bottleneck",
    ),
    "APPROVAL_NEEDED": (
        "need approval", "needs approval", "sign off", "sign-off",
        "approve", "get approval", "approval from", "needs sign",
    ),
}

# Markers that, when they are the SOLE match for their type, are weak enough
# to merit LOW rather than MEDIUM (high false-positive risk in casual speech).
_WEAK_MARKERS: frozenset[str] = frozenset(
    {"please ", "must ", "revisit", "going with"}
)


def extract_work_signals(
    payload: WorkSignalExtractionInput,
) -> WorkSignalExtractionResult:
    text = payload.text.lower()
    signals: list[WorkSignal] = []

    for signal_type, markers in _MARKERS.items():
        matched = [m for m in markers if m in text]
        if not matched:
            continue
        evidence = matched[0].strip()
        if len(matched) >= 2:
            confidence = "HIGH"
        elif matched[0] in _WEAK_MARKERS:
            confidence = "LOW"
        else:
            confidence = "MEDIUM"
        signals.append(
            WorkSignal(
                signal_type=signal_type,
                confidence=confidence,
                evidence_phrase=evidence[:120],
            )
        )

    if not signals:
        return WorkSignalExtractionResult(
            signals=[], primary_signal=None, multi_intent=False
        )

    # Primary = highest confidence, ties broken by detection order (which
    # follows the _MARKERS declaration order = governance priority).
    rank = {"HIGH": 3, "MEDIUM": 2, "LOW": 1}
    primary = max(signals, key=lambda s: rank[s.confidence])
    distinct_types = {s.signal_type for s in signals}

    return WorkSignalExtractionResult(
        signals=signals,
        primary_signal=primary.signal_type,
        multi_intent=len(distinct_types) >= 2,
    )
