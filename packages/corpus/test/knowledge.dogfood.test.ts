import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadCorpus } from '../src/knowledge/index.js';
import { corpusWellFormedFindings } from '../src/knowledge/validate.js';

/**
 * 051-knowledge-corpus T-300: red-first test for the dogfooded reference
 * corpus (FR-007) — spectastic grows a small knowledge/ corpus of its own
 * domain in-repo, proving the format by use rather than by prose. Loads
 * from the real repo root, not a fixture.
 */
const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(here, '..', '..', '..');

describe('the dogfooded spectastic-concepts corpus (051 T-300, FR-007)', () => {
  it('loads at least one pack from the real knowledge/ directory', () => {
    const packs = loadCorpus(REPO_ROOT);
    expect(packs.some((p) => p.name === 'spectastic-concepts')).toBe(true);
  });

  it('validates with zero corpus-well-formed findings', () => {
    const packs = loadCorpus(REPO_ROOT);
    expect(corpusWellFormedFindings(packs)).toEqual([]);
  });
});
