import { describe, expect, it } from 'vitest';
import {
  applyAnswer,
  applyForce,
  type LoopMode,
} from '../../src/commands/init/prompt.js';
import type { FileWriteDecision } from '../../src/commands/init/types.js';

function mkConflict(dest: string): FileWriteDecision {
  return {
    source: `/bundle/${dest}`,
    destination: dest,
    preExisting: true,
    action: 'write',
  };
}

/**
 * T-200 + T-300 of specs/003-init-node-port/tasks.html. Unit tests
 * for the pure decision logic in prompt.ts. The I/O loop is smoke-
 * tested separately in smoke.test.ts.
 */
describe('init: prompt decision logic (T-200, FR-003)', () => {
  it('answer "y" → action="overwrite", mode unchanged', () => {
    const conflict = mkConflict('a.txt');
    const mode: LoopMode = { allOverwrite: false, allSkip: false };
    const next = applyAnswer(conflict, 'y', mode);
    expect(conflict.action).toBe('overwrite');
    expect(next).toEqual(mode);
  });

  it('answer "N" → action="skip", mode unchanged', () => {
    const conflict = mkConflict('a.txt');
    const mode: LoopMode = { allOverwrite: false, allSkip: false };
    const next = applyAnswer(conflict, 'N', mode);
    expect(conflict.action).toBe('skip');
    expect(next).toEqual(mode);
  });

  it('answer "a" → action="overwrite", mode.allOverwrite=true', () => {
    const conflict = mkConflict('a.txt');
    const mode: LoopMode = { allOverwrite: false, allSkip: false };
    const next = applyAnswer(conflict, 'a', mode);
    expect(conflict.action).toBe('overwrite');
    expect(next.allOverwrite).toBe(true);
    expect(next.allSkip).toBe(false);
  });

  it('answer "s" → action="skip", mode.allSkip=true', () => {
    const conflict = mkConflict('a.txt');
    const mode: LoopMode = { allOverwrite: false, allSkip: false };
    const next = applyAnswer(conflict, 's', mode);
    expect(conflict.action).toBe('skip');
    expect(next.allSkip).toBe(true);
    expect(next.allOverwrite).toBe(false);
  });

  it('after mode.allOverwrite, every conflict gets overwrite regardless of answer', () => {
    const conflict = mkConflict('b.txt');
    const mode: LoopMode = { allOverwrite: true, allSkip: false };
    applyAnswer(conflict, 'N', mode); // answer ignored
    expect(conflict.action).toBe('overwrite');
  });

  it('after mode.allSkip, every conflict gets skip regardless of answer', () => {
    const conflict = mkConflict('b.txt');
    const mode: LoopMode = { allOverwrite: false, allSkip: true };
    applyAnswer(conflict, 'y', mode); // answer ignored
    expect(conflict.action).toBe('skip');
  });
});

describe('init: --force handling (T-300, FR-004)', () => {
  it('applyForce mutates every conflict to "overwrite"', () => {
    const conflicts = [mkConflict('a.txt'), mkConflict('b.txt'), mkConflict('c.txt')];
    applyForce(conflicts);
    expect(conflicts.every((c) => c.action === 'overwrite')).toBe(true);
  });

  it('applyForce on empty array is a no-op', () => {
    const conflicts: FileWriteDecision[] = [];
    applyForce(conflicts);
    expect(conflicts).toEqual([]);
  });
});
