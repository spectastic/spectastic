import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Structural guard for the escape hatch (spec 044 US2, FR-003). The runtime
 * behaviour — a real --model opus run delegating to an Opus subagent while the
 * main loop stays Sonnet — is the manual host check (T-903); this asserts the
 * command markdown documents the mechanism so the model is nudged to it.
 */
const REPO_ROOT = join(__dirname, '..', '..', '..');
const src = readFileSync(join(REPO_ROOT, 'commands', 'spectastic.implement.md'), 'utf8');

describe('implement --model escape hatch (spec 044 FR-003)', () => {
  it('documents the --model flag', () => {
    expect(src).toMatch(/--model\s+<tier>/);
  });

  it('delegates to the spectastic-impl-task subagent rather than swapping the turn model', () => {
    expect(src).toContain('spectastic-impl-task');
    // states the mechanism constraint: a body flag can't change the turn's model
    expect(src.toLowerCase()).toMatch(/can'?t change (it |the model )?mid-turn|delegates the task/);
  });

  it('declares model: sonnet in its own frontmatter (the default the hatch escalates from)', () => {
    const fm = /^---\n([\s\S]*?)\n---/.exec(src)?.[1] ?? '';
    expect(/^model:[ \t]*sonnet/m.test(fm)).toBe(true);
  });
});
