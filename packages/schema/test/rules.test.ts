import { existsSync, readdirSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { rules, validate, validateMany } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURES_ROOT = join(here, '..', 'fixtures');

/**
 * Registry-driven harness. For every rule in the registry, we expect either:
 *
 *   - `fixtures/<rule.id>/{positive,negative}.html` — a single-file fixture
 *     run through `validate()`. Cross-file rules treat the single doc as a
 *     one-element set; this is the common case.
 *
 *   - `fixtures/<rule.id>/{positive,negative}/**\/*.html` — a directory of
 *     two or more files run through `validateMany()`. Required for cross-
 *     file rules whose positive case can't be expressed in a single doc
 *     (e.g. parent-child reciprocity needs both parent and child present).
 *
 * The directory pattern takes precedence over the single-file pattern when
 * both exist. File paths inside the fixture directory are preserved
 * relative to FIXTURES_ROOT so rules that key off the spec-id pattern
 * (`specs/<id>/spec.html`) see file names that match.
 *
 * Drives T-100 of specs/002-validate-cli/tasks.html. Also implements
 * SC-002 — every rule has a positive + negative fixture pair.
 */

async function loadFixture(
  ruleId: string,
  kind: 'positive' | 'negative',
): Promise<{ inputs: { html: string; file: string }[]; multiFile: boolean }> {
  const dirPath = join(FIXTURES_ROOT, ruleId, kind);
  if (existsSync(dirPath) && statSync(dirPath).isDirectory()) {
    const collect = (base: string): string[] => {
      const entries = readdirSync(base, { withFileTypes: true });
      return entries.flatMap((e) => {
        const full = join(base, e.name);
        if (e.isDirectory()) return collect(full);
        if (e.isFile() && e.name.endsWith('.html')) return [full];
        return [];
      });
    };
    const filePaths = collect(dirPath).sort();
    const inputs = await Promise.all(
      filePaths.map(async (fp) => ({
        file: relative(FIXTURES_ROOT, fp).split(sep).join('/'),
        html: await readFile(fp, 'utf8'),
      })),
    );
    return { inputs, multiFile: true };
  }

  const filePath = join(FIXTURES_ROOT, ruleId, `${kind}.html`);
  const html = await readFile(filePath, 'utf8');
  return {
    inputs: [{ file: `fixtures/${ruleId}/${kind}.html`, html }],
    multiFile: false,
  };
}

describe.each(rules.map((r) => ({ id: r.id })))('rule: $id', ({ id }) => {
  it('positive fixture triggers this rule', async () => {
    const { inputs, multiFile } = await loadFixture(id, 'positive');
    const findings = multiFile ? validateMany(inputs) : validate(inputs[0]!.html, { file: inputs[0]!.file });
    const matched = findings.filter((f) => f.rule === id);
    expect(
      matched.length,
      `expected at least one ${id} finding from the positive fixture; got: ${JSON.stringify(findings)}`,
    ).toBeGreaterThan(0);
  });

  it('negative fixture does not trigger this rule', async () => {
    const { inputs, multiFile } = await loadFixture(id, 'negative');
    const findings = multiFile ? validateMany(inputs) : validate(inputs[0]!.html, { file: inputs[0]!.file });
    const matched = findings.filter((f) => f.rule === id);
    expect(
      matched.length,
      `expected zero ${id} findings from the negative fixture; got: ${JSON.stringify(matched)}`,
    ).toBe(0);
  });
});
