import { describe, expect, it } from 'vitest';
import {
  CourseDraftError,
  deriveSlug,
  findMissingRefs,
  validateCourseDraft,
  verifyGuessability,
} from '../src/commands/course.js';
import { StubAIProvider } from '../src/providers/stub.js';
import type { CourseDraft } from '../src/types.js';

/**
 * T-101 of specs/019-explain-course/tasks.html. Kernel unit tests for the
 * course draft contract (D-002), the existence check (FR-003), and the blind
 * guessability check (FR-004 / D-003).
 */

function quiz(correctIndex: number) {
  return { question: 'Q?', options: ['a', 'b', 'c'], correctIndex };
}

function goodDraft(): CourseDraft {
  return {
    target: '015-ai-stub-injection',
    objectives: [
      { title: 'Stub routing', read: 'The factory routes via the env var.', quiz: quiz(2), refs: ['FR-007'] },
    ],
  };
}

describe('course: draft validation (T-101, D-002)', () => {
  it('accepts a well-formed draft', () => {
    expect(() => validateCourseDraft(goodDraft())).not.toThrow();
  });

  it('rejects a missing target', () => {
    expect(() => validateCourseDraft({ objectives: [] })).toThrow(CourseDraftError);
  });

  it('rejects an empty objectives array', () => {
    expect(() => validateCourseDraft({ target: 'x', objectives: [] })).toThrow(/non-empty array/);
  });

  it('rejects more than 7 objectives (NFR-001)', () => {
    const o = { title: 't', read: 'r', quiz: quiz(0), refs: [] };
    const draft = { target: 'x', objectives: Array.from({ length: 8 }, () => o) };
    expect(() => validateCourseDraft(draft)).toThrow(/cap is 7/);
  });

  it('names the offending path on a bad quiz', () => {
    const draft = {
      target: 'x',
      objectives: [{ title: 't', read: 'r', quiz: { question: 'q', options: ['a'], correctIndex: 0 }, refs: [] }],
    };
    expect(() => validateCourseDraft(draft)).toThrow(/objectives\[0\]\.quiz\.options/);
  });
});

describe('course: reference existence (T-101, FR-003)', () => {
  it('flags refs that are neither a known ID nor an existing path', () => {
    const known = new Set(['FR-001', '019-explain-course']);
    const pathExists = (p: string) => p === 'packages/cli/src/glob.ts';
    const missing = findMissingRefs(
      ['FR-001', 'FR-999', 'packages/cli/src/glob.ts', 'nope/ghost.ts'],
      known,
      pathExists,
    );
    expect(missing).toEqual(['FR-999', 'nope/ghost.ts']);
  });
});

describe('course: blind guessability (T-101, FR-004 / D-003)', () => {
  it('flags an item the blind call answers correctly', async () => {
    const draft = goodDraft(); // correctIndex 2
    const ai = new StubAIProvider({ subagent: [{ output: '2' }] });
    const failures = await verifyGuessability(draft, { cwd: '/tmp', ai });
    expect(failures).toHaveLength(1);
    expect(failures[0]?.kind).toBe('guessable');
  });

  it('passes an item the blind call gets wrong', async () => {
    const draft = goodDraft(); // correctIndex 2
    const ai = new StubAIProvider({ subagent: [{ output: '0' }] });
    const failures = await verifyGuessability(draft, { cwd: '/tmp', ai });
    expect(failures).toHaveLength(0);
  });
});

describe('course: slug (T-101)', () => {
  it('derives a date-prefixed kebab slug from the target', () => {
    const slug = deriveSlug({ target: '015-ai-stub-injection', objectives: [] }, { cwd: '/tmp' });
    expect(slug).toMatch(/^\d{4}-\d{2}-\d{2}-015-ai-stub-injection$/);
  });
});
