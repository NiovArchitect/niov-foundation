"""Deterministic semantic rerank over a Foundation-scoped candidate set (Phase 1285-W).

Advisory only. Foundation assembles a scoped, RBAC/ABAC-checked candidate set and
sends ONLY safe summaries here. This module reranks those candidates by
deterministic lexical relevance to the query, with simple field weighting (the
title and a related person's name matter more than the body). It NEVER returns a
candidate_id that was not in the input, never requests more data, and never
invents relevance — a candidate with zero query-term overlap is dropped, not
given a fabricated score.

No LLM. No chain-of-thought. No embeddings: pure token-overlap scoring. Foundation
re-validates every returned id against the allowed set and treats scores as
advisory.
"""

from __future__ import annotations

import re

from .schemas import (
    RankedCandidate,
    SemanticRerankCandidate,
    SemanticRerankInput,
    SemanticRerankResult,
)

# Function words + common query verbs that carry no retrieval signal. Dropping
# "show / find / related / about" keeps queries like "show blockers related to
# Vishesh" focused on {blockers, vishesh}.
_STOPWORDS = frozenset(
    {
        "the", "a", "an", "and", "or", "but", "is", "are", "was", "were", "be",
        "been", "to", "of", "in", "on", "for", "with", "at", "by", "from", "up",
        "about", "into", "over", "after", "as", "so",
        "what", "which", "who", "whom", "whose", "when", "where", "why", "how",
        "did", "do", "does", "done",
        "i", "you", "we", "they", "he", "she", "it", "me", "my", "our", "your",
        "their", "this", "that", "these", "those", "there", "here",
        "show", "find", "get", "tell", "give", "list", "related", "relating",
        "all", "any", "some", "can", "could", "would", "should", "will", "shall",
        "has", "have", "had", "since", "last", "recent",
    }
)

_TITLE_WEIGHT = 3
_PEOPLE_WEIGHT = 2
_SUMMARY_WEIGHT = 1
_META_WEIGHT = 1
_MAX_RESULTS_DEFAULT = 50


def _tokens(text: str) -> set[str]:
    return {
        t
        for t in re.split(r"[^a-z0-9_-]+", text.lower())
        if len(t) >= 2 and t not in _STOPWORDS
    }


def _score_one(query_tokens: set[str], c: SemanticRerankCandidate) -> tuple[int, str]:
    title_hits = len(query_tokens & _tokens(c.title))
    people_hits = len(query_tokens & _tokens(" ".join(c.related_people)))
    summary_hits = len(query_tokens & _tokens(c.summary or ""))
    meta_hits = len(
        query_tokens
        & _tokens(" ".join(filter(None, [c.candidate_type, c.source_type or "", c.status or ""])))
    )
    score = (
        title_hits * _TITLE_WEIGHT
        + people_hits * _PEOPLE_WEIGHT
        + summary_hits * _SUMMARY_WEIGHT
        + meta_hits * _META_WEIGHT
    )
    if score <= 0:
        return 0, "No lexical match"
    # Closed-ish short reason from the strongest contributing field.
    contributions = [
        (title_hits * _TITLE_WEIGHT, "Matched query terms in the title"),
        (people_hits * _PEOPLE_WEIGHT, "Matched a related person"),
        (summary_hits * _SUMMARY_WEIGHT, "Matched query terms in the summary"),
        (meta_hits * _META_WEIGHT, "Matched the work type or status"),
    ]
    reason = max(contributions, key=lambda x: x[0])[1]
    return score, reason


def rerank_candidates(payload: SemanticRerankInput) -> SemanticRerankResult:
    query_tokens = _tokens(payload.query)
    max_results = payload.max_results or _MAX_RESULTS_DEFAULT

    scored: list[tuple[int, int, RankedCandidate]] = []
    for idx, candidate in enumerate(payload.candidates):
        score, reason = _score_one(query_tokens, candidate)
        if score <= 0:
            continue  # honest: never fabricate relevance for a non-match
        scored.append(
            (score, idx, RankedCandidate(candidate_id=candidate.candidate_id, score=score, reason=reason))
        )

    # Sort by score desc, then original order asc (stable + fully deterministic).
    scored.sort(key=lambda t: (-t[0], t[1]))
    ranked = [rc for _, _, rc in scored[:max_results]]
    return SemanticRerankResult(ranked_candidates=ranked)
