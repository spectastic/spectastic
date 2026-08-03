/**
 * Resolving tags against the estate, and deriving a citation (spec 084,
 * FR-003 / FR-004 / FR-005 / FR-007).
 *
 * Two failures look identical if you are careless, and call for opposite
 * responses: a tag naming something that does not exist (a typo — fix the tag)
 * and a requirement with no tagged test (a gap — write or tag a test). A third
 * is the one that matters most during adoption: a requirement whose tests
 * exist but carry no tag, which is neither of the above and must not be
 * reported as untested (FR-004). On the day this ships, almost the entire
 * estate is in that third state.
 */

import { compareTags, formatTag, type TestTag } from './grammar.js';
import type { TaggedTest, ReadResult } from './read.js';

/** What a spec declares, as far as resolution is concerned. */
export interface SpecFacts {
  /** The spec's leading number, e.g. "084". */
  spec: string;
  /** Every requirement and task id the spec defines. */
  ids: readonly string[];
}

export type TagFindingKind = 'unknown-spec' | 'unknown-id';

export interface TagFinding {
  kind: TagFindingKind;
  /** The offending tag, in written form. */
  tag: string;
  file: string;
  title: string;
  message: string;
}

export interface DerivedCitation {
  spec: string;
  /** Ids closed by tagged tests, sorted and de-duplicated. */
  ids: string[];
  /** Tests carrying this spec's tag. */
  taggedTests: number;
  /** Every test declaration seen in the scanned tree. */
  totalTests: number;
  /**
   * True when some of the scanned tree carries no tags at all. A derived
   * citation from a partly-tagged suite is more dangerous than none, because it
   * looks authoritative — so partiality travels with the result rather than
   * being something a reader is expected to infer (FR-007, D-003).
   */
  partial: boolean;
  findings: TagFinding[];
}

/**
 * Derive a spec's citation from a scan.
 *
 * Never throws on an untagged tree: an empty result with `partial` set is the
 * correct answer, not an error (FR-006).
 */
export function deriveCitation(read: ReadResult, facts: SpecFacts, allSpecs: readonly string[]): DerivedCitation {
  const known = new Set(facts.ids);
  const specSet = new Set(allSpecs);
  const ids = new Set<string>();
  const findings: TagFinding[] = [];
  let taggedTests = 0;

  for (const test of read.tagged) {
    let touchesThisSpec = false;
    for (const tag of [...test.tags].sort(compareTags)) {
      if (!specSet.has(tag.spec)) {
        // Reported, never dropped: a typo'd tag is indistinguishable from an
        // untested spec once discarded, and the two call for opposite fixes.
        findings.push({
          kind: 'unknown-spec',
          tag: formatTag(tag),
          file: test.file,
          title: test.title,
          message: `Tag ${formatTag(tag)} names spec ${tag.spec}, which does not exist.`,
        });
        continue;
      }
      if (tag.spec !== facts.spec) continue;
      touchesThisSpec = true;
      if (tag.id === undefined) continue;
      if (!known.has(tag.id)) {
        findings.push({
          kind: 'unknown-id',
          tag: formatTag(tag),
          file: test.file,
          title: test.title,
          message: `Tag ${formatTag(tag)} names ${tag.id}, which spec ${tag.spec} does not define.`,
        });
        continue;
      }
      ids.add(tag.id);
    }
    if (touchesThisSpec) taggedTests++;
  }

  return {
    spec: facts.spec,
    ids: [...ids].sort(),
    taggedTests,
    totalTests: read.totalTests,
    partial: read.tagged.length < read.totalTests,
    findings,
  };
}

/**
 * Compare a derived citation with a hand-authored one (FR-005).
 *
 * The point of the convention: the authored `testsCite` is written into every
 * verify view and read by nothing, so it is a claim verified never. This is what
 * makes the two able to contradict each other.
 */
export function compareCitation(
  derived: readonly string[],
  authored: readonly string[],
): { onlyDerived: string[]; onlyAuthored: string[]; agrees: boolean } {
  const d = new Set(derived);
  const a = new Set(authored);
  const onlyDerived = [...d].filter((x) => !a.has(x)).sort();
  const onlyAuthored = [...a].filter((x) => !d.has(x)).sort();
  return { onlyDerived, onlyAuthored, agrees: onlyDerived.length === 0 && onlyAuthored.length === 0 };
}

/** Tags a single test declares, sorted — small helper for reporting. */
export function tagsOf(test: TaggedTest): TestTag[] {
  return [...test.tags].sort(compareTags);
}
