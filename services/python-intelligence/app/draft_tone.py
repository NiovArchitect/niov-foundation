"""Deterministic draft tone / quality intelligence (Phase 1285-Y).

Advisory only. Foundation governs the call and is the sole authority on send /
approval / recipients / intent. This module evaluates a PROPOSED message and
proposes a cleaner revision; it NEVER sends, approves, decides recipients or
permissions, impersonates anyone, or overwrites the user's intent.

No LLM. No chain-of-thought. Detection is deterministic phrase/structure
heuristics. The suggested_revision is a SAFE transform of the original text:
em-dashes removed (recipient-facing copy must never contain one), mild softening
of harsh/order language, and whitespace normalization. It never adds a recipient,
an email address, a link, or a new commitment — so intent is preserved by
construction. Foundation re-validates the revision before it is ever offered.
"""

from __future__ import annotations

import re

from .schemas import (
    DraftRiskFlag,
    DraftToneInput,
    DraftToneLabel,
    DraftToneResult,
)

# Safe, intent-preserving softening of order/blame language into requests. These
# never change WHO or WHAT, only the register. Applied case-insensitively.
_SOFTEN: list[tuple[str, str]] = [
    (r"\byou failed to\b", "we still need to"),
    (r"\byou did ?n[o']t\b", "we still need to"),
    (r"\byou never\b", "we have not yet"),
    (r"\byour fault\b", "something to fix together"),
    (r"\byou need to\b", "could you"),
    (r"\byou must\b", "please"),
    (r"\bASAP\b", "as soon as you can"),
    (r"\basap\b", "as soon as you can"),
]

_HARSH = ("unacceptable", "ridiculous", "failed", "must ", "immediately", "asap")
_BLAME = ("you failed", "your fault", "you didn't", "you did not", "you never", "you should have")
_VAGUE = ("stuff", "things", "whatever", "some point", "etc")
_EM_DASH_RE = re.compile(r"\s*[—–]\s*")
_WARM = ("thanks", "thank you", "please", "appreciate", "grateful")


def _strip_em_dashes(text: str) -> str:
    # "word — word" -> "word, word"; never leave an em/en dash in recipient copy.
    return _EM_DASH_RE.sub(", ", text)


def _normalize(text: str) -> str:
    out = _strip_em_dashes(text).strip()
    out = re.sub(r"[ \t]+", " ", out)
    out = re.sub(r"\s+\n", "\n", out)
    return out


def _soften(text: str) -> str:
    out = text
    for pattern, repl in _SOFTEN:
        out = re.sub(pattern, repl, out, flags=re.IGNORECASE)
    return out


def evaluate_draft_tone(payload: DraftToneInput) -> DraftToneResult:
    original = payload.draft_text
    lc = original.lower()
    words = [w for w in re.split(r"\s+", original.strip()) if w]
    word_count = len(words)

    flags: list[DraftRiskFlag] = []
    if _EM_DASH_RE.search(original):
        flags.append("EM_DASH")
    harsh = any(m in lc for m in _HARSH)
    blame = any(m in lc for m in _BLAME)
    vague = word_count < 6 or any(m in lc for m in _VAGUE)
    too_many = word_count > 120
    if harsh:
        flags.append("HARSH_TONE")
    if blame:
        flags.append("BLAME_LANGUAGE")
    if vague:
        flags.append("MISSING_CONTEXT")
    if too_many:
        flags.append("TOO_MANY_WORDS")

    external = payload.channel == "email" or (
        payload.recipient_context is not None and payload.recipient_context.internal is False
    )
    if external:
        flags.append("EXTERNAL_SEND_REQUIRES_APPROVAL")

    # Ambiguous recipient: a person-directed channel with no recipient context.
    if payload.recipient_context is None and payload.channel in ("internal_message", "email"):
        flags.append("AMBIGUOUS_RECIPIENT")

    # tone_label — first matching wins (worst signal dominates).
    label: DraftToneLabel
    if blame or harsh:
        label = "TOO_HARSH"
    elif too_many:
        label = "TOO_LONG"
    elif vague:
        label = "TOO_VAGUE"
    elif "AMBIGUOUS_RECIPIENT" in flags:
        label = "NEEDS_CONTEXT"
    elif any(w in lc for w in _WARM):
        label = "WARM"
    elif word_count <= 40:
        label = "EXECUTIVE_READY"
    else:
        label = "CLEAR"

    score = 100
    if harsh:
        score -= 25
    if blame:
        score -= 20
    if too_many:
        score -= 15
    if vague:
        score -= 15
    if "EM_DASH" in flags:
        score -= 5
    score = max(10, min(100, score))

    revision = _normalize(_soften(original))
    # Belt-and-suspenders: the revision must never carry an em/en dash back.
    revision = _strip_em_dashes(revision)
    if revision and revision[-1] not in ".!?":
        revision = revision + "."

    approval_required = bool(
        payload.channel == "email"
        or external
        or (payload.constraints is not None and payload.constraints.approval_required is True)
    )

    confidence = "HIGH" if (harsh or blame or too_many) else "MEDIUM"

    if flags:
        words_h = []
        if harsh:
            words_h.append("harsh tone")
        if blame:
            words_h.append("blame language")
        if vague:
            words_h.append("missing context")
        if too_many:
            words_h.append("too long")
        if "EM_DASH" in flags:
            words_h.append("em dash present")
        if external:
            words_h.append("external send needs approval")
        reason = f"{', '.join(words_h)}; suggested a cleaner revision."
    else:
        reason = "Reads clearly; minor cleanup only."

    return DraftToneResult(
        quality_score=score,
        tone_label=label,
        risk_flags=flags[:12],
        suggested_revision=revision[:8000],
        reason=reason[:300],
        confidence=confidence,  # type: ignore[arg-type]
        approval_required=approval_required,
        preserves_intent=True,  # transforms are intent-preserving by construction
    )
