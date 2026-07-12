import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validate } from '@spectastic/schema';
import { expandGlobs } from '../src/glob.js';

/**
 * Corpus-clean security gate (spec 046-security-review-ci, FR-003).
 *
 * The red-team (packages/schema) proves the rule catches a hostile document.
 * This proves the complement: no SHIPPED artifact carries executable content —
 * a security regression in a real spec/example is caught, not just a synthetic one.
 *
 * Scanned corpus = the same glob the CI dogfood scans (specs/**, examples/*, and the
 * root artifacts). docs/** is deliberately excluded here as it is from the dogfood — a
 * recorded ceiling (046 out-of-scope → TBD-docs-security-scan), not a silent gap. The
 * adversarial fixtures under packages/schema/fixtures are hostile by design and never
 * in this glob.
 */

const REPO_ROOT = join(__dirname, '..', '..', '..');
const RULE = 'no-executable-content';

// Mirrors the ci.yml dogfood glob. Keep in sync if the dogfood corpus changes.
const CORPUS = [
  'specs/**/*.html',
  'examples/*.html',
  'principles.html',
  'inbox.html',
  'index.html',
];

describe('security corpus: no shipped artifact carries executable content (FR-003)', () => {
  it('every corpus artifact is clean of no-executable-content findings', async () => {
    const files = await expandGlobs(CORPUS.map((p) => join(REPO_ROOT, p)));
    expect(files.length).toBeGreaterThan(0); // the glob actually resolved something

    const offenders: string[] = [];
    for (const file of files) {
      const html = readFileSync(file, 'utf8');
      const hits = validate(html, file).filter((f) => f.rule === RULE);
      for (const h of hits) {
        offenders.push(`${file.replace(REPO_ROOT + '/', '')}:${h.line} — ${h.message}`);
      }
    }

    // A non-empty list is a hard failure: executable content reached a shipped artifact.
    expect(offenders, `executable content in shipped artifacts:\n${offenders.join('\n')}`).toEqual([]);
  });
});
