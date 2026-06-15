import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { glob } from 'tinyglobby';
import { describe, expect, it } from 'vitest';
import { validateMany } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(here, '..', '..', '..');

/**
 * SC-001 of the spec: running validate against every real artifact in
 * the repository produces zero error-severity findings on a clean checkout.
 *
 * We deliberately exclude archived and withdrawn proposals (which by
 * design carry copies of stable IDs that would collide), node_modules,
 * dist output, and the schema fixtures (which intentionally violate rules).
 */
const PATTERNS = [
  'principles.html',
  'plan.html',
  'inbox.html',
  'index.html',
  'examples/spectastic-spec.html',
  'examples/triage-log.html',
  'specs/**/*.html',
  // Templates are scaffolds with bracket-placeholder IDs ([NEW_REQ_ID], etc.)
  // by design — they're tools, not artifacts. Exclude.
];

const IGNORE = [
  '**/changes/archive/**',
  '**/changes/withdrawn/**',
  '**/node_modules/**',
  '**/packages/**',
  '**/dist/**',
];

describe('integration: every real artifact validates clean (SC-001)', () => {
  it('produces zero error findings across the canonical artifact set', async () => {
    const files = await glob(PATTERNS, { cwd: REPO_ROOT, ignore: IGNORE, onlyFiles: true });
    expect(files.length, 'expected to find some artifacts to validate').toBeGreaterThan(0);

    const inputs = await Promise.all(
      files.sort().map(async (file) => ({
        html: await readFile(join(REPO_ROOT, file), 'utf8'),
        file,
      })),
    );
    const findings = validateMany(inputs);
    const errors = findings.filter((f) => f.severity === 'error');
    const report = errors
      .map((f) => `  ${f.file}:${f.line}:${f.column}  ${f.rule}  ${f.message}`)
      .join('\n');
    expect(errors, `expected zero error findings; got ${errors.length}:\n${report}`).toEqual([]);
  });
});
