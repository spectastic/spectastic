import { describe, expect, it } from 'vitest';
import { compareTags, formatTag, parseTags, selectorFor } from '../src/testtags/grammar.js';
import { readTags } from '../src/testtags/read.js';
import { compareCitation, deriveCitation } from '../src/testtags/resolve.js';

/**
 * Spec 084 — the durable test selector.
 *
 * The failure being closed: 44 of 60 verify views select tests by naming file
 * paths, which is loud when a file is deleted and silent when one is added.
 */

describe('the tag grammar (T-010/T-011)', () => {
  it('parses an unqualified spec tag', () => {
    expect(parseTags('renders the card @084')).toEqual([{ spec: '084' }]);
  });

  it('parses a qualified tag naming the requirement it closes', () => {
    expect(parseTags('renders the card @084:FR-003')).toEqual([{ spec: '084', id: 'FR-003' }]);
  });

  it('finds a tag inside surrounding prose, not just as a whole title', () => {
    // Tags live in sentences. Anchoring the pattern would make the convention
    // unusable in the only place both runners can filter on.
    expect(parseTags('US1 · the block shows captured commands @021:SC-001 in both themes')).toEqual([
      { spec: '021', id: 'SC-001' },
    ]);
  });

  it('rejects a bare requirement id with no spec', () => {
    // FR-001's reason for qualifying: requirement ids are unique only inside
    // their own document, so `@FR-001` has no determinable owner.
    expect(parseTags('closes @FR-001')).toEqual([]);
  });

  it('accepts several tags on one test, since a test may serve two specs', () => {
    expect(parseTags('shared behaviour @021 @084:FR-002')).toEqual([{ spec: '021' }, { spec: '084', id: 'FR-002' }]);
  });

  it('round-trips through its written form', () => {
    expect(formatTag({ spec: '084' })).toBe('@084');
    expect(formatTag({ spec: '084', id: 'T-110' })).toBe('@084:T-110');
  });

  it('offers the bare spec tag as the selector, so a substring match catches qualified tests too', () => {
    // The property that lets the installed runner, which has no boolean tag
    // expressions, still select a whole spec in one filter.
    const selector = selectorFor('084');
    expect(selector).toBe('@084');
    expect('closes it @084:FR-003').toContain(selector);
  });

  it('sorts the unqualified tag ahead of its qualified siblings', () => {
    const sorted = [{ spec: '084', id: 'T-1' }, { spec: '084' }, { spec: '021' }].sort(compareTags);
    expect(sorted).toEqual([{ spec: '021' }, { spec: '084' }, { spec: '084', id: 'T-1' }]);
  });
});

describe('the reader (T-100/T-110)', () => {
  const files = [
    { file: 'b.spec.ts', content: `test('renders @084:FR-003', () => {});\nit('untagged one', () => {});` },
    { file: 'a.test.ts', content: `describe('suite @084', () => { it('inner @084:FR-001', () => {}); });` },
  ];

  it('extracts tags from title literals across declaration forms', () => {
    const r = readTags(files);
    expect(r.tagged.map((t) => t.title)).toEqual(['suite @084', 'inner @084:FR-001', 'renders @084:FR-003']);
  });

  it('counts every declaration, tagged or not, so partiality is measurable', () => {
    expect(readTags(files).totalTests).toBe(4);
  });

  it('reads Playwright structured tags as well as title tokens', () => {
    const r = readTags([
      { file: 'p.spec.ts', content: `test('a browser check', { tag: ['@084:SC-001'] }, async () => {});` },
    ]);
    expect(r.tagged[0]?.tags).toEqual([{ spec: '084', id: 'SC-001' }]);
  });

  it('does not attribute a distant tag: to a test that did not declare it', () => {
    // The scan window is bounded. Without that, an unrelated `tag:` later in
    // the file would silently attach to the previous test.
    const far = `test('first', () => {});\n${'\n'.repeat(300)}\nconst x = { tag: '@084' };`;
    expect(readTags([{ file: 'f.ts', content: far }]).tagged).toEqual([]);
  });

  it('is deterministic — the same tree yields the same order regardless of input order (NFR-001)', () => {
    const forward = readTags(files).tagged.map((t) => `${t.file}:${t.title}`);
    const reversed = readTags([...files].reverse()).tagged.map((t) => `${t.file}:${t.title}`);
    expect(reversed).toEqual(forward);
  });
});

describe('deriving a citation (T-200/T-210/T-211)', () => {
  const facts = { spec: '084', ids: ['FR-001', 'FR-003', 'T-110'] };
  const allSpecs = ['021', '084'];

  it('derives the ids that tagged tests actually close', () => {
    const read = readTags([
      { file: 'a.test.ts', content: `it('one @084:FR-001', () => {});\nit('two @084:FR-003', () => {});` },
    ]);
    expect(deriveCitation(read, facts, allSpecs).ids).toEqual(['FR-001', 'FR-003']);
  });

  it('reports a tag naming a spec that does not exist rather than dropping it (FR-003)', () => {
    const read = readTags([{ file: 'a.test.ts', content: `it('typo @999:FR-001', () => {});` }]);
    const d = deriveCitation(read, facts, allSpecs);
    expect(d.findings.map((f) => f.kind)).toEqual(['unknown-spec']);
    // The reason it must not be dropped: silently discarded, this looks exactly
    // like a spec with no tests, and the two need opposite fixes.
    expect(d.ids).toEqual([]);
  });

  it('reports a tag naming an id its spec does not define (FR-003)', () => {
    const read = readTags([{ file: 'a.test.ts', content: `it('wrong @084:FR-999', () => {});` }]);
    const d = deriveCitation(read, facts, allSpecs);
    expect(d.findings[0]?.kind).toBe('unknown-id');
    expect(d.findings[0]?.message).toContain('does not define');
  });

  it('a test added later under an existing tag is picked up with no command change (SC-001)', () => {
    // The whole point. A path list would have needed editing here.
    const before = readTags([{ file: 'a.test.ts', content: `it('one @084:FR-001', () => {});` }]);
    const after = readTags([
      { file: 'a.test.ts', content: `it('one @084:FR-001', () => {});` },
      { file: 'new.test.ts', content: `it('added later @084:T-110', () => {});` },
    ]);
    expect(deriveCitation(before, facts, allSpecs).ids).toEqual(['FR-001']);
    expect(deriveCitation(after, facts, allSpecs).ids).toEqual(['FR-001', 'T-110']);
  });

  it('a renamed file changes nothing about the derived citation', () => {
    const a = readTags([{ file: 'old-name.test.ts', content: `it('x @084:FR-001', () => {});` }]);
    const b = readTags([{ file: 'new-name.test.ts', content: `it('x @084:FR-001', () => {});` }]);
    expect(deriveCitation(a, facts, allSpecs).ids).toEqual(deriveCitation(b, facts, allSpecs).ids);
  });
});

describe('adopting without a flag day (T-300/T-301)', () => {
  const facts = { spec: '084', ids: ['FR-001'] };

  it('an untagged tree yields an empty result, never an error (FR-006, SC-003)', () => {
    const read = readTags([{ file: 'a.test.ts', content: `it('nothing tagged here', () => {});` }]);
    const d = deriveCitation(read, facts, ['084']);
    expect(d.ids).toEqual([]);
    expect(d.findings).toEqual([]);
    expect(d.taggedTests).toBe(0);
  });

  it('labels a partly-tagged tree as partial (FR-007)', () => {
    // A citation covering 1 of 3 tests looks as authoritative as one covering
    // all 3. Partiality has to travel with the result.
    const read = readTags([
      {
        file: 'a.test.ts',
        content: `it('tagged @084:FR-001', () => {});\nit('bare one', () => {});\nit('bare two', () => {});`,
      },
    ]);
    const d = deriveCitation(read, facts, ['084']);
    expect(d.partial).toBe(true);
    expect(d.taggedTests).toBe(1);
    expect(d.totalTests).toBe(3);
  });

  it('a fully-tagged tree is not flagged partial', () => {
    const read = readTags([{ file: 'a.test.ts', content: `it('tagged @084:FR-001', () => {});` }]);
    expect(deriveCitation(read, facts, ['084']).partial).toBe(false);
  });
});

describe('contradicting an authored citation (FR-005)', () => {
  it('agrees when the two match', () => {
    expect(compareCitation(['FR-001', 'T-110'], ['T-110', 'FR-001']).agrees).toBe(true);
  });

  it('names what each side has that the other does not', () => {
    const c = compareCitation(['FR-001'], ['FR-001', 'T-900']);
    expect(c.agrees).toBe(false);
    expect(c.onlyAuthored).toEqual(['T-900']);
    expect(c.onlyDerived).toEqual([]);
  });
});
