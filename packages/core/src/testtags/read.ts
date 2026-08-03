/**
 * Reading test tags from source (spec 084, FR-002 / D-002).
 *
 * Parses; never executes. The alternative — running the suite with a reporter —
 * would make every consumer of this information as slow and as fragile as the
 * suite itself, and would be useless in the case where traceability is most
 * wanted: a suite that is currently red (NFR-002).
 *
 * The cost of parsing is recorded rather than hidden: a title built at runtime
 * (a template literal, a loop over cases) is invisible here. Such a test can
 * carry a literal tag on its enclosing `describe`, and the reader reports what
 * it can see rather than guessing at what it cannot.
 */

import { parseTags, type TestTag } from './grammar.js';

/** One test found in the tree, with whatever tags its title declared. */
export interface TaggedTest {
  /** Path of the file it was found in, as given to the reader. */
  file: string;
  /** The title text the tags were parsed from. */
  title: string;
  /** Tags declared by this test, in written order. */
  tags: TestTag[];
}

/** What a scan found — including what it could NOT attribute (FR-007). */
export interface ReadResult {
  /** Every test carrying at least one tag, ordered deterministically. */
  tagged: TaggedTest[];
  /** How many test declarations were seen in total, tagged or not. */
  totalTests: number;
}

// `test('…')`, `it('…')`, `describe('…')` — and Playwright's `test('…', { tag })`
// form, whose title is still the first argument. Quotes may be ' " or `.
const DECL_RE = /\b(?:test|it|describe)(?:\.\w+)*\s*\(\s*(['"`])((?:\\.|(?!\1).)*)\1/g;
// Playwright's structured form: tag: '@084' or tag: ['@084', '@084:FR-001'].
const PW_TAG_RE = /\btag\s*:\s*(\[[^\]]*\]|(['"`])(?:\\.|(?!\2).)*\2)/g;

/**
 * Scan already-read file contents for tagged tests.
 *
 * Takes contents rather than paths so the kernel stays free of filesystem
 * access — the same ports-and-adapters split the rest of core uses, and what
 * makes this testable without a fixture tree on disk.
 */
export function readTags(files: ReadonlyArray<{ file: string; content: string }>): ReadResult {
  const tagged: TaggedTest[] = [];
  let totalTests = 0;

  for (const { file, content } of files) {
    for (const m of content.matchAll(DECL_RE)) {
      totalTests++;
      const title = m[2] ?? '';
      const tags = parseTags(title);

      // Playwright's structured tags sit in the options object just after the
      // title. Scan a bounded window rather than the rest of the file, so a
      // later unrelated `tag:` cannot be attributed to this test.
      const windowText = content.slice(m.index + m[0].length, m.index + m[0].length + 200);
      for (const t of windowText.matchAll(PW_TAG_RE)) {
        tags.push(...parseTags(t[1] ?? ''));
      }

      if (tags.length > 0) tagged.push({ file, title, tags });
    }
  }

  // Deterministic ordering (NFR-001): filesystem enumeration order must never
  // reach the output, or two scans of one tree disagree. Sorted by file only —
  // `matchAll` already yields source order within a file, and the sort is
  // stable, so tests stay in the order they are written. Sorting by title too
  // would be equally deterministic and would scramble a suite's reading order
  // for no gain.
  tagged.sort((a, b) => (a.file === b.file ? 0 : a.file < b.file ? -1 : 1));
  return { tagged, totalTests };
}
