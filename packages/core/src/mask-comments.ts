/**
 * Blank out HTML comments so a raw-regex scanner cannot match inside one.
 *
 * Written after a real design was authored from the shipped template and its
 * contract view silently failed to materialise. The template explains the
 * element by naming it — `<!-- One <spec-contract> per interface … -->` — and
 * the matcher is a regex over raw HTML, so it matched the comment's literal
 * tag, found no `path=`, and skipped. Worse than skipping: the match ran on to
 * the REAL closing tag, so one bogus match consumed the genuine declaration and
 * no view was ever produced. That is the mechanism behind 072's triage T-001,
 * which recorded the symptom without the cause.
 *
 * The sibling visual materialiser escaped only because its comment happens not
 * to spell the element out — a latent version of the same bug, one helpful
 * comment away from firing.
 *
 * Comment CONTENT is replaced with spaces rather than removed, so every offset
 * in the masked string still addresses the same character in the original. A
 * caller matches against the mask and slices the original, which keeps the
 * replacement byte-exact.
 *
 * Not a parser, deliberately. These scanners are regex-based by design and
 * parsing here would change their contract; this closes the one gap that
 * actually bites without touching the rest.
 */
export function maskHtmlComments(html: string): string {
  let out = '';
  let i = 0;
  for (;;) {
    const start = html.indexOf('<!--', i);
    if (start === -1) {
      out += html.slice(i);
      return out;
    }
    let end = html.indexOf('-->', start + 4);
    end = end === -1 ? html.length : end + 3;
    out += html.slice(i, start);
    // Preserve length AND newlines, so line/column reporting is unaffected.
    out += html.slice(start, end).replace(/[^\n]/g, ' ');
    i = end;
  }
}
