/**
 * The dropped-conformance scan (003 T-1005).
 *
 * A MODIFY `<spec-delta>` embeds the requirement's full post-state, which the
 * reviewer reads instead of a diff. That is the format's strength and its one
 * sharp edge: a post-state is *retyped*, not edited, so anything the author
 * does not consciously carry is silently gone — and the "What changes" line
 * records intent rather than diff, so it can honestly say "nothing else"
 * beside a deleted obligation.
 *
 * This happened three times in one working session, in three different
 * proposals, each caught only by an adversarial pass that may not run:
 *
 *   004 FR-007          lost "A stale or missing _bundled/ MUST halt the publish"
 *   003 FR-009          lost the npx / global / symlink parity clause
 *   088 REQ-CHANGE-006  lost "One execution surface per target … archive intact"
 *
 * So the check compares conformance keywords between the live requirement and
 * the delta's post-state, and reports any level that DECREASED.
 *
 * **It would have caught the first two and not the third**, which is worth
 * stating plainly rather than leaving a reader to assume otherwise. 004 and
 * 003 each lost a MUST-bearing sentence, so the count drops and the scan
 * fires — verified by replaying both against the real artifacts. 088 lost
 * rationale prose carrying no conformance keyword at all, and nothing here
 * sees it. The ceiling is exact: this detects a dropped *obligation*, never a
 * dropped *sentence*. Comparing arbitrary prose across a retyped post-state is
 * a diff problem the format deliberately does not have, since the post-state
 * is authored rather than derived — so two thirds is the honest reach, and the
 * remaining third stays review-caught.
 *
 * **Warning, not error, and the reason is the whole design.** Removing an
 * obligation is a legitimate thing for a MODIFY to do — that is what a
 * narrowing change *is*. The defect is never the removal; it is the removal
 * nobody noticed. A warning makes it visible and leaves the judgment where it
 * belongs, which is the honest ceiling: this cannot tell a deliberate
 * narrowing from an accident, and pretending otherwise would train authors to
 * wave it through.
 *
 * A folded CLI scan rather than a schema rule, for the reason that decides
 * every one of these: it needs the live spec *and* the proposal, and the
 * schema engine hands a rule one file.
 */

import type { Finding } from '@spectastic/schema';

/** `<spec-delta op= target=>` with its body — the same shape apply parses. */
const DELTA_RE = /<spec-delta\s+op=["']([^"']+)["'][^>]*\btarget=["']([^"']+)["'][^>]*>([\s\S]*?)<\/spec-delta>/gi;
const RULE_RE = /<spec-rule\b[^>]*>([\s\S]*?)<\/spec-rule>/gi;

/** The conformance levels. */
const LEVELS = ['MUST NOT', 'MUST', 'SHOULD NOT', 'SHOULD', 'MAY'] as const;
type Level = (typeof LEVELS)[number];

/**
 * Count each conformance level in a fragment. Matches the element's own text
 * exactly, so "MUST NOT" can never also register as a "MUST" — otherwise a
 * proposal turning one into the other would look unchanged.
 */
export function countConformance(html: string): Record<Level, number> {
  const counts = Object.fromEntries(LEVELS.map((l) => [l, 0])) as Record<Level, number>;
  for (const m of html.matchAll(RULE_RE)) {
    const text = (m[1] ?? '')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase();
    const level = LEVELS.find((l) => text === l);
    if (level !== undefined) counts[level] += 1;
  }
  return counts;
}

/** A requirement's own markup from a live spec, by id. */
export function requirementById(specHtml: string, id: string): string | null {
  const re = new RegExp(String.raw`<spec-requirement\b[^>]*\bid="${id}"[^>]*>([\s\S]*?)</spec-requirement>`, 'i');
  return re.exec(specHtml)?.[1] ?? null;
}

export interface MustDropInput {
  proposalHtml: string;
  /** Path used in the finding. */
  proposalFile: string;
  /** The live spec the deltas target. */
  specHtml: string;
}

/**
 * Report each MODIFY whose post-state carries fewer conformance keywords at
 * some level than the live requirement it targets.
 */
export function mustDropFindings(input: MustDropInput): Finding[] {
  const findings: Finding[] = [];
  for (const m of input.proposalHtml.matchAll(DELTA_RE)) {
    const [, op, target, body] = m;
    if ((op ?? '').toLowerCase() !== 'modified') continue;
    const live = requirementById(input.specHtml, target ?? '');
    if (live === null) continue; // apply owns an unresolvable target

    const before = countConformance(live);
    const after = countConformance(body ?? '');
    const dropped = LEVELS.filter((l) => after[l] < before[l]);
    if (dropped.length === 0) continue;

    const detail = dropped.map((l) => `${l} ${before[l]} → ${after[l]}`).join(', ');
    const line = input.proposalHtml.slice(0, m.index).split('\n').length;
    findings.push({
      file: input.proposalFile,
      line,
      column: 1,
      rule: 'conformance-dropped',
      severity: 'warning',
      message: `the post-state for ${target ?? ''} carries fewer conformance keywords than the live requirement (${detail})`,
      fixHint:
        'Carry the clause through, or say in the What-changes line that it is being removed and why. A post-state is retyped rather than edited, so an obligation not consciously carried is silently gone — and "nothing else changes" beside a deleted MUST has shipped three times.',
    });
  }
  return findings;
}
