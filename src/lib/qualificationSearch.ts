import { normalizeText } from "./normalize";

/** Standard edit-distance DP, used to tolerate minor spelling mistakes in search queries. */
export function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let previousRow = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const currentRow = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      currentRow[j] = Math.min(previousRow[j] + 1, currentRow[j - 1] + 1, previousRow[j - 1] + cost);
    }
    previousRow = currentRow;
  }
  return previousRow[b.length];
}

/** Lowercase degree abbreviation -> alternative sets of required full words. A qualification
 * title satisfies the abbreviation if any one alternative's words are ALL present (fuzzy/prefix
 * matched). Matched via strict dictionary lookup on the raw query token, never fuzzily, so a
 * mistyped abbreviation (e.g. "phdd") gets no special treatment. */
const ABBREVIATION_EXPANSIONS: Record<string, string[][]> = {
  phd: [["doctor"]],
  bsc: [["bachelor", "science"]],
  ba: [["bachelor", "arts"], ["bachelor", "architecture"]],
  nd: [["national", "diploma"]],
  hnd: [["national", "diploma"]],
  ma: [["master", "arts"]],
  msc: [["master", "science"]],
  it: [["information", "technology"]],
};

function maxAllowedDistance(length: number): number {
  if (length <= 3) return 0;
  if (length <= 6) return 1;
  return 2;
}

/** True if a query word and a title word are "the same" for search purposes: exact, a prefix of
 * each other (guarded to 3+ chars so stray single-character tokens like the "d" in "3-D" can't
 * prefix-match "doctor"), or within a length-scaled edit distance of each other (gated to the
 * same first letter, since real typos rarely change a word's first letter, and without this
 * guard same-length same-ending words like "biology"/"geology" would falsely collide). */
function tokensMatch(queryWord: string, titleWord: string): boolean {
  if (queryWord === titleWord) return true;

  if (Math.min(queryWord.length, titleWord.length) >= 3 && (titleWord.startsWith(queryWord) || queryWord.startsWith(titleWord))) {
    return true;
  }

  if (queryWord[0] !== titleWord[0]) return false;

  const threshold = maxAllowedDistance(queryWord.length);
  if (Math.abs(queryWord.length - titleWord.length) > threshold) return false;
  return levenshteinDistance(queryWord, titleWord) <= threshold;
}

/** Typo-tolerant, word-order-independent match of a search query against a qualification title,
 * with degree-abbreviation expansion (phd, bsc, ba, nd, hnd, ma, msc). Every query word must be
 * satisfied by some title word (directly, or via its abbreviation expansion) for a match — since
 * this is presence-based rather than positional, query word order doesn't matter. */
export function matchesQualificationSearch(title: string, query: string): boolean {
  const titleWords = normalizeText(title).split(" ").filter(Boolean);
  const queryWords = normalizeText(query).split(" ").filter(Boolean);
  if (queryWords.length === 0) return true;

  return queryWords.every((queryWord) => {
    const alternatives = ABBREVIATION_EXPANSIONS[queryWord];
    if (alternatives) {
      return alternatives.some((words) => words.every((word) => titleWords.some((titleWord) => tokensMatch(word, titleWord))));
    }
    return titleWords.some((titleWord) => tokensMatch(queryWord, titleWord));
  });
}
