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
  'design.html',
  'inbox.html',
  'index.html',
  // Single-star on purpose. A nested example project carries its own specs/
  // tree, and the cross-file rules assume they are given exactly one project:
  // spec-id-unique would collide the example's 001- directory with this repo's,
  // and verify-view-missing derives its convention floor from the LOWEST spec
  // number carrying a verify.html — so a nested 001-*/verify.html resets this
  // repo's floor from 021 to 1 and every pre-convention spec reports missing.
  // Nested projects are validated as their own set below, which is the only
  // reading of a cross-file rule that is correct for either project.
  'examples/*.html',
  // The meta-spec is a normal spec bundle now (specs/000-spectastic/), so
  // specs/**/*.html sweeps it with every other slice — no per-file entry.
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
    const files = await glob(PATTERNS, {
      cwd: REPO_ROOT,
      ignore: IGNORE,
      onlyFiles: true,
    });
    expect(files.length, 'expected to find some artifacts to validate').toBeGreaterThan(0);

    const inputs = await Promise.all(
      files.sort().map(async (file) => ({
        html: await readFile(join(REPO_ROOT, file), 'utf8'),
        file,
      })),
    );
    const findings = validateMany(inputs);
    const errors = findings.filter((f) => f.severity === 'error');
    const report = errors.map((f) => `  ${f.file}:${f.line}:${f.column}  ${f.rule}  ${f.message}`).join('\n');
    expect(errors, `expected zero error findings; got ${errors.length}:\n${report}`).toEqual([]);
  });

  // A nested example project is a second project, not more of this one. Its
  // cross-file rules have to run over its own artifacts alone or they answer a
  // question about the wrong estate.
  it('produces zero error findings for each nested example project, validated as its own set', async () => {
    const projects = await glob(['examples/*/spectastic.json'], { cwd: REPO_ROOT, onlyFiles: true });
    expect(projects.length, 'expected at least one nested example project').toBeGreaterThan(0);

    for (const marker of projects) {
      const root = dirname(marker);
      const files = await glob([`${root}/**/*.html`], { cwd: REPO_ROOT, ignore: IGNORE, onlyFiles: true });
      expect(files.length, `expected artifacts under ${root}`).toBeGreaterThan(0);

      const inputs = await Promise.all(
        files.sort().map(async (file) => ({
          html: await readFile(join(REPO_ROOT, file), 'utf8'),
          // Relative to the nested project, so its own specs/ tree is the one
          // the path-shaped cross-file rules see.
          file: file.slice(root.length + 1),
        })),
      );
      const findings = validateMany(inputs);
      const errors = findings.filter((f) => f.severity === 'error');
      const report = errors.map((f) => `  ${root}/${f.file}:${f.line}  ${f.rule}  ${f.message}`).join('\n');
      expect(errors, `expected zero error findings in ${root}; got ${errors.length}:\n${report}`).toEqual([]);
    }
  });
});
