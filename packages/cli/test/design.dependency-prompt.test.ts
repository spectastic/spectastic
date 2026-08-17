import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The Dependencies interview prompt (080-unit-edge-authoring, FR-005 / SC-004).
 *
 * SC-004 has a checkable half and an uncheckable one, and this tests only the
 * first. Whether the model *asks* the question is harness-native — `T-009` and
 * `P-8` both exclude command markdown as a place a guarantee may live — so what
 * is asserted is the authored trigger condition: that the source states when the
 * question fires and, more importantly, when it does not.
 *
 * The negative half is the load-bearing one. 080 declines to prompt a
 * single-module project with no interface on the explicit reasoning that a
 * speculative question trains authors to dismiss the prompt, which would cost
 * the answer in every project that does have dependencies. A test that only
 * checked the question exists would pass on a version that asked everyone.
 *
 * Reads `commands/` rather than `.claude/commands/` — the latter is a
 * gitignored one-time copy that does not auto-sync, so asserting against it
 * would let a stale mirror pass.
 */

const here = dirname(fileURLToPath(import.meta.url));
const COMMAND_MD = resolve(here, '..', '..', '..', 'commands', 'spectastic.design.md');

function commandMd(): string {
  return readFileSync(COMMAND_MD, 'utf8');
}

/** The Dependencies bullet, isolated from the interview list around it. */
function dependenciesPrompt(): string {
  const md = commandMd();
  const start = md.indexOf('- **Dependencies**');
  expect(start, 'the design interview declares no Dependencies prompt').toBeGreaterThan(-1);
  const next = md.indexOf('\n   - **', start + 1);
  return md.slice(start, next === -1 ? undefined : next);
}

describe('the design interview asks about dependencies (080 FR-005, SC-004)', () => {
  it('declares a Dependencies prompt at all', () => {
    expect(dependenciesPrompt()).toContain('**Dependencies**');
  });

  it('cites the requirement that owns it, so the prompt is traceable to its spec', () => {
    expect(dependenciesPrompt()).toMatch(/080-unit-edge-authoring, FR-005/);
  });

  it('fires on a multi-unit workspace', () => {
    expect(dependenciesPrompt()).toMatch(/more than one unit in the workspace/i);
  });

  it('fires on a declared interface contract', () => {
    expect(dependenciesPrompt()).toMatch(/declared interface contract/i);
  });

  // The half that would be missed by a test asserting only that the question
  // exists — and the half 080 argued for explicitly.
  it('does NOT fire on a single-module project with no interface', () => {
    const prompt = dependenciesPrompt();
    expect(prompt).toMatch(/single-module project with no interface is \*not\* asked/i);
  });

  it('records why the negative case matters, rather than only stating it', () => {
    expect(dependenciesPrompt()).toMatch(/speculative question trains authors to dismiss the prompt/i);
  });
});
