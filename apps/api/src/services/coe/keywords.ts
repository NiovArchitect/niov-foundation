// FILE: keywords.ts
// PURPOSE: Tiny helpers the COE uses to turn a free-text request
//          into a normalized keyword set, then score how well a
//          capsule's topic_tags overlap with those keywords.
// CONNECTS TO: COEService.assembleContext + explicitRecall.

// WHAT: A small stopword list big enough to remove the most common
//        no-signal words from English requests.
// INPUT: Used as a lookup set.
// OUTPUT: A Set<string>.
// WHY: Spec calls for a "simple word frequency approach" for MVP.
//      A bigger list (e.g., scikit-learn ENGLISH_STOP_WORDS) is
//      easy to swap in later; we lock just the obvious ones now.
const STOPWORDS = new Set([
  "a","an","the","is","are","was","were","be","been","being",
  "of","in","on","at","to","for","by","with","from","into","onto",
  "and","or","but","if","then","else","that","this","these","those",
  "what","when","where","who","whom","whose","why","how","which",
  "do","does","did","done","have","has","had",
  "will","would","can","could","should","may","might","must","shall",
  "i","you","he","she","it","we","they","me","him","her","us","them",
  "my","your","his","its","our","their","mine","yours",
  "as","not","no","yes","so","too","very","just","only","about",
  "out","over","under","up","down","between","through",
]);

// WHAT: Pull a deduplicated list of lowercase keyword tokens out of
//        a free-text request.
// INPUT: A user-supplied string.
// OUTPUT: An array of unique keywords in original encounter order.
// WHY: Subsequent scoring needs a clean keyword set with no
//      duplicates and no obvious junk. Splitting on non-alphanumeric
//      gives us a robust enough tokenizer for English MVP usage.
export function extractKeywords(text: string): string[] {
  if (typeof text !== "string" || text.length === 0) return [];
  // We keep dashes and underscores INSIDE tokens because topic_tags
  // are commonly written like "birthday-2019" or "search_results".
  // Splitting on those would fragment tags into pieces that never
  // match Postgres' exact-element array overlap.
  const tokens = text
    .toLowerCase()
    .split(/[^a-z0-9_-]+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
  return Array.from(new Set(tokens));
}

// WHAT: Score how well a capsule's topic_tags match a keyword set.
// INPUT: The capsule's topic_tags array and the keyword array.
// OUTPUT: A score in [0.0, 1.0].
// WHY: Spec says "how many topic_tags match extracted keywords
//      (0.0-1.0)". Normalizing by the number of capsule tags gives
//      a stable score regardless of how many keywords the request
//      pulled in.
export function tagOverlapScore(
  capsuleTags: string[],
  keywords: string[],
): number {
  if (capsuleTags.length === 0 || keywords.length === 0) return 0;
  const lowerTags = capsuleTags.map((t) => t.toLowerCase());
  const keywordSet = new Set(keywords.map((k) => k.toLowerCase()));
  let matches = 0;
  for (const tag of lowerTags) {
    if (keywordSet.has(tag)) matches++;
  }
  return matches / capsuleTags.length;
}

// WHAT: Score a capsule's recency in [0.0, 1.0].
// INPUT: The capsule's last_updated_at and an optional clock for
//        deterministic tests.
// OUTPUT: A number where fresher capsules score higher.
// WHY: Spec says 1.0 if updated within 7 days, scales linearly to
//      0.0 at 90 days. Beyond 90 days we floor at 0.
export function recencyScore(updatedAt: Date, now: Date = new Date()): number {
  const ms = now.getTime() - updatedAt.getTime();
  const days = ms / (24 * 60 * 60 * 1000);
  if (days < 7) return 1.0;
  if (days >= 90) return 0.0;
  return 1.0 - (days - 7) / (90 - 7);
}

// WHAT: Combine the three component scores per spec weights.
// INPUT: Tag overlap, base relevance from the capsule row, recency.
// OUTPUT: A single combined score.
// WHY: Spec: combined = (tag * 0.45) + (base * 0.35) + (recency * 0.20).
//      One helper means the weights live in one place.
export function combinedScore(
  tagOverlap: number,
  baseRelevance: number,
  recency: number,
): number {
  return tagOverlap * 0.45 + baseRelevance * 0.35 + recency * 0.2;
}
