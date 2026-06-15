import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { rules, validate } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURES_ROOT = join(here, '..', 'fixtures');

/**
 * Registry-driven harness. For every rule in the registry, we expect
 * a fixtures/<rule.id>/{positive,negative}.html pair. The positive
 * fixture MUST produce at least one finding with rule === rule.id;
 * the negative fixture MUST NOT produce any finding with rule === rule.id.
 *
 * Drives T-100 of specs/002-validate-cli/tasks.html. Also implements
 * SC-002 — every rule has a positive + negative fixture pair.
 */
describe.each(rules.map((r) => ({ id: r.id })))('rule: $id', ({ id }) => {
  it('positive fixture triggers this rule', async () => {
    const html = await readFile(join(FIXTURES_ROOT, id, 'positive.html'), 'utf8');
    const findings = validate(html, { file: `fixtures/${id}/positive.html` });
    const matched = findings.filter((f) => f.rule === id);
    expect(
      matched.length,
      `expected at least one ${id} finding from the positive fixture; got: ${JSON.stringify(findings)}`,
    ).toBeGreaterThan(0);
  });

  it('negative fixture does not trigger this rule', async () => {
    const html = await readFile(join(FIXTURES_ROOT, id, 'negative.html'), 'utf8');
    const findings = validate(html, { file: `fixtures/${id}/negative.html` });
    const matched = findings.filter((f) => f.rule === id);
    expect(
      matched.length,
      `expected zero ${id} findings from the negative fixture; got: ${JSON.stringify(matched)}`,
    ).toBe(0);
  });
});
