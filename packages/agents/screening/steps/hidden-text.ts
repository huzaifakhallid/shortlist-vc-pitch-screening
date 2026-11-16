// §7.2 step 3, §15.2: compare a page's PDF text layer with the text that is
// visible on it (page reading's visible text). Text in the layer that isn't
// visible (white-on-white, tiny, off-page) is a hidden span; a large one
// sets the deal's integrity flag and is shown to the team with its snippet.
// The scorer never sees the text layer.
//
// Method:
// - Words are runs of letters, combining marks and digits (Unicode),
//   compared after NFKC (so PDF ligatures like "ﬁ" match "fi") and
//   lower-casing.
// - A text-layer word is visible when it sits in a run of WINDOW_WORDS
//   consecutive layer words that also occurs consecutively in the visible
//   text. Runs, not single words: hidden text built from common words that
//   happen to be on the slide ("and", "the") is still hidden. Order between
//   runs doesn't matter, so a different reading order isn't hidden text.
//   A visible fragment shorter than WINDOW_WORDS (a one-word title) next to
//   hidden text has no run of its own, so it becomes part of the span.
// - Each maximal sequence of non-visible layer words with at least
//   MIN_HIDDEN_SPAN_WORDS words is a hidden span. Shorter gaps are left as
//   reading noise (a misread word, a hyphenated line break).

// Both thresholds are uncalibrated: a first choice, not from the design
// ("large invisible spans"). Calibrate them on the evaluation set's
// hidden-text decks and the false-flag rate on clean decks (§20). Scripts
// written without spaces between words (Chinese, Japanese, Thai) are weak:
// a whole sentence reads as one word, so a hidden sentence counts as one
// word and rarely reaches the minimum.
export const WINDOW_WORDS = 3;
export const MIN_HIDDEN_SPAN_WORDS = 8;

export type HiddenSpan = {
  // The span as it is in the text layer, from its first to its last word.
  snippet: string;
  words: number;
};

type Word = { normalised: string; start: number; end: number };

export function findHiddenSpans(
  textLayer: string,
  visibleText: string,
): HiddenSpan[] {
  const layer = words(textLayer);
  const visible = words(visibleText).map((word) => word.normalised);

  const visibleRuns = new Set<string>();
  for (let i = 0; i + WINDOW_WORDS <= visible.length; i += 1) {
    visibleRuns.add(visible.slice(i, i + WINDOW_WORDS).join(" "));
  }

  const isVisible = layer.map(() => false);
  for (let i = 0; i + WINDOW_WORDS <= layer.length; i += 1) {
    const run = layer
      .slice(i, i + WINDOW_WORDS)
      .map((word) => word.normalised)
      .join(" ");
    if (visibleRuns.has(run)) {
      isVisible.fill(true, i, i + WINDOW_WORDS);
    }
  }

  const spans: HiddenSpan[] = [];
  let first = 0;
  while (first < layer.length) {
    if (isVisible[first] === true) {
      first += 1;
      continue;
    }
    let last = first;
    while (last + 1 < layer.length && isVisible[last + 1] === false) {
      last += 1;
    }
    const count = last - first + 1;
    const start = layer[first];
    const end = layer[last];
    if (start === undefined || end === undefined) {
      throw new Error("A hidden span falls outside the text layer");
    }
    if (count >= MIN_HIDDEN_SPAN_WORDS) {
      spans.push({
        snippet: textLayer.slice(start.start, end.end),
        words: count,
      });
    }
    first = last + 1;
  }
  return spans;
}

function words(text: string): Word[] {
  return [...text.matchAll(/[\p{L}\p{M}\p{N}]+/gu)].map((match) => ({
    normalised: match[0].normalize("NFKC").toLowerCase(),
    start: match.index,
    end: match.index + match[0].length,
  }));
}
