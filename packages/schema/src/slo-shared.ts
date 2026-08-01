/**
 * Shared SLO vocabulary (spec 047-slo-nfr-artifact, plan D-003/D-004).
 *
 * Two small, pure pieces consumed by both the `<spec-slo>` shape rule
 * (`slo-well-formed`, validates `signal=`) and the profile-gated
 * quantified-NFR scan (`@spectastic/core/commands/validate`, judges NFR
 * prose / `slo=`). Kept here rather than duplicated so the two loci agree
 * on what "quantified" and "a golden signal" mean.
 */

/** The Four Golden Signals taxonomy (Google SRE) — the default `signal=` vocabulary. */
export const GOLDEN_SIGNALS = ['latency', 'traffic', 'errors', 'saturation'] as const;

export type GoldenSignal = (typeof GOLDEN_SIGNALS)[number];

/** True if `value` is one of the Four Golden Signals. */
export function isGoldenSignal(value: string): value is GoldenSignal {
  return (GOLDEN_SIGNALS as readonly string[]).includes(value);
}

/**
 * A "carries a number+unit, percentile, or threshold" heuristic — the FR-004
 * quantified-NFR test. Deliberately liberal (D-004): false negatives (a real
 * target the regex misses) are worse than false positives, since this gates a
 * hard error at verified/enterprise. Matches, in order:
 *  - a percentile marker (`p95`, `P99`)
 *  - a comparison against a number (`< 200`, `>= 99%`, `≤ 1s`)
 *  - a number followed by a recognised unit (ms, s, min, rps, …) or a `%`
 *  - a threshold word near a number ("under 200ms", "at least 99%")
 */
const PERCENTILE_RE = /\bp\d{1,3}\b/i;
const COMPARISON_NUMBER_RE = /[<>≤≥]=?\s*\d/;
// Word units take a trailing \b so `200 mins` matches but `200 minsk` does not.
// Non-word units (`%`) MUST NOT: \b asserts a word/non-word transition, and
// after `%` the next character is a space, punctuation, or end of input — never
// a word character — so a trailing \b made the `%` alternative unreachable and
// a bare percentage never counted as quantified (T-002). Keep the two classes
// in separate groups; do not fold `%` back into the word-unit alternation.
const WORD_UNITS =
  'ms|s|sec|secs|second|seconds|min|mins|minute|minutes|hr|hrs|hour|hours|day|days|rps|qps|req/s|requests?/s';
const NUMBER_UNIT_RE = new RegExp(String.raw`\d+(\.\d+)?\s*((${WORD_UNITS})\b|%)`, 'i');
const THRESHOLD_WORD_RE = /\b(under|below|over|above|at least|at most|within)\b.{0,24}?\d/i;

/** True if `text` carries a measurable target by the heuristic above. */
export function isQuantifiedTarget(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return PERCENTILE_RE.test(t) || COMPARISON_NUMBER_RE.test(t) || NUMBER_UNIT_RE.test(t) || THRESHOLD_WORD_RE.test(t);
}
