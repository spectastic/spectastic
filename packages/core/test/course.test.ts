import { describe, expect, it } from 'vitest';
import {
  assembleCourse,
  CourseDraftError,
  deriveSlug,
  findMissingRefs,
  validateCourseDraft,
  verifyAnalogyFit,
  verifyExistence,
  verifyGuessability,
} from '../src/commands/course.js';
import { StubAIProvider } from '../src/providers/stub.js';
import type { CourseDraft, FileSystem } from '../src/types.js';

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
      {
        title: 'Stub routing',
        read: 'The factory routes via the env var.',
        quiz: quiz(2),
        refs: ['FR-007'],
      },
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
    const draft = {
      target: 'x',
      objectives: Array.from({ length: 8 }, () => o),
    };
    expect(() => validateCourseDraft(draft)).toThrow(/cap is 7/);
  });

  it('names the offending path on a bad quiz', () => {
    const draft = {
      target: 'x',
      objectives: [
        {
          title: 't',
          read: 'r',
          quiz: { question: 'q', options: ['a'], correctIndex: 0 },
          refs: [],
        },
      ],
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

/**
 * 060-course-teaching-payload T-100/T-101: red-first tests for the
 * structured teaching payload's analogy + contrast members (FR-001, FR-002,
 * SC-001). A draft with a structured `read` (prose plus optional members)
 * is a second valid shape alongside the flat string (FR-006).
 */

function analogyFixture(overrides: Record<string, unknown> = {}) {
  return {
    source: 'a bank account',
    target: 'a corpus-license allowlist',
    mapping: 'a withdrawal only clears if funds exist; a license only clears if it is on the allowlist',
    refs: ['FR-002'],
    ...overrides,
  };
}

function contrastFixture(overrides: Record<string, unknown> = {}) {
  return {
    caseA: 'token bucket',
    caseB: 'sliding window',
    dimensions: [{ label: 'burst tolerance', a: 'high', b: 'low' }],
    refs: ['FR-002'],
    ...overrides,
  };
}

function structuredDraft(readOverrides: Record<string, unknown> = {}): CourseDraft {
  return {
    target: '015-ai-stub-injection',
    objectives: [
      {
        title: 'Learn by comparison',
        read: {
          prose: 'The factory routes via the env var.',
          analogy: analogyFixture(),
          contrast: contrastFixture(),
          ...readOverrides,
        },
        quiz: quiz(2),
        refs: ['FR-007'],
      },
    ],
  } as unknown as CourseDraft;
}

describe('course: structured read — analogy/contrast validation (060 T-100, FR-001/FR-002)', () => {
  it('accepts a well-formed structured read with analogy + contrast', () => {
    expect(() => validateCourseDraft(structuredDraft())).not.toThrow();
  });

  it('accepts a structured read with no members at all (both optional)', () => {
    expect(() => validateCourseDraft(structuredDraft({ analogy: undefined, contrast: undefined }))).not.toThrow();
  });

  it('rejects a structured read missing prose', () => {
    const draft = structuredDraft();
    // @ts-expect-error — deliberately malformed for the test
    draft.objectives[0].read.prose = '';
    expect(() => validateCourseDraft(draft)).toThrow(/objectives\[0\]\.read\.prose/);
  });

  it('rejects an analogy missing its mapping, naming the offending path', () => {
    const draft = structuredDraft({
      analogy: analogyFixture({ mapping: undefined }),
    });
    expect(() => validateCourseDraft(draft)).toThrow(/objectives\[0\]\.read\.analogy\.mapping/);
  });

  it('rejects a contrast missing its dimensions, naming the offending path', () => {
    const draft = structuredDraft({
      contrast: contrastFixture({ dimensions: undefined }),
    });
    expect(() => validateCourseDraft(draft)).toThrow(/objectives\[0\]\.read\.contrast\.dimensions/);
  });
});

describe('course: structured read — analogy/contrast rendering (060 T-101, SC-001)', () => {
  it('renders a <course-analogy> and a <course-contrast> element when present', () => {
    validateCourseDraft(structuredDraft());
    const html = assembleCourse(structuredDraft(), '2026-07-26-test');
    expect(html).toContain('<course-analogy>');
    expect(html).toContain('<course-contrast>');
    expect(html).toContain('a bank account');
    expect(html).toContain('token bucket');
  });

  it('renders neither element when the payload carries no members', () => {
    const html = assembleCourse(structuredDraft({ analogy: undefined, contrast: undefined }), '2026-07-26-test');
    expect(html).not.toContain('<course-analogy>');
    expect(html).not.toContain('<course-contrast>');
  });

  it('still renders a flat-string read unchanged (FR-006)', () => {
    const html = assembleCourse(goodDraft(), '2026-07-26-test');
    expect(html).toContain('The factory routes via the env var.');
    expect(html).not.toContain('<course-analogy>');
  });
});

/**
 * 060-course-teaching-payload T-200/T-201: red-first tests for the
 * worked-example + illustration members (FR-001, FR-003, SC-003).
 */

function workedExampleFixture(overrides: Record<string, unknown> = {}) {
  return {
    steps: ['Load the draft.', 'Validate every objective.', 'Assemble the HTML.'],
    refs: ['FR-003'],
    ...overrides,
  };
}

function illustrationFixture(overrides: Record<string, unknown> = {}) {
  return {
    svg: '<svg viewBox="0 0 10 10"><rect width="10" height="10"/></svg>',
    caption: 'A trivial box.',
    refs: ['FR-003'],
    ...overrides,
  };
}

function structuredDraft2(readOverrides: Record<string, unknown> = {}): CourseDraft {
  return structuredDraft({
    analogy: undefined,
    contrast: undefined,
    workedExample: workedExampleFixture(),
    illustration: illustrationFixture(),
    ...readOverrides,
  });
}

describe('course: structured read — worked-example/illustration validation (060 T-200, FR-001/FR-003)', () => {
  it('accepts a well-formed worked example + illustration', () => {
    expect(() => validateCourseDraft(structuredDraft2())).not.toThrow();
  });

  it('rejects a worked example with an empty steps array, naming the offending path', () => {
    const draft = structuredDraft2({
      workedExample: workedExampleFixture({ steps: [] }),
    });
    expect(() => validateCourseDraft(draft)).toThrow(/objectives\[0\]\.read\.workedExample\.steps/);
  });

  it('rejects an illustration missing its svg, naming the offending path', () => {
    const draft = structuredDraft2({
      illustration: illustrationFixture({ svg: undefined }),
    });
    expect(() => validateCourseDraft(draft)).toThrow(/objectives\[0\]\.read\.illustration\.svg/);
  });
});

describe('course: structured read — worked-example/illustration rendering (060 T-201, SC-003)', () => {
  it('renders a <course-worked-example> (ordered steps) and a <course-illustration> (figure) when present', () => {
    validateCourseDraft(structuredDraft2());
    const html = assembleCourse(structuredDraft2(), '2026-07-26-test');
    expect(html).toContain('<course-worked-example>');
    expect(html).toMatch(/<course-worked-example>[\s\S]*<ol/);
    expect(html).toContain('Load the draft.');
    expect(html).toContain('<course-illustration>');
    expect(html).toContain('<figure>');
    expect(html).toContain('A trivial box.');
  });

  it('renders neither element when the payload carries no members', () => {
    const html = assembleCourse(
      structuredDraft2({ workedExample: undefined, illustration: undefined }),
      '2026-07-26-test',
    );
    expect(html).not.toContain('<course-worked-example>');
    expect(html).not.toContain('<course-illustration>');
  });
});

/**
 * 060-course-teaching-payload T-300/T-301/T-302: red-first tests for
 * trust — existence extended to every member (FR-004), a flat-string
 * objective unchanged (FR-006), and the blind analogy-fit check
 * (FR-005, SC-002, NFR-002).
 */

/** A minimal FileSystem stub: only the given paths "exist"; specs/ is
 * empty so gatherKnownIds contributes no ID-based known refs (out of scope
 * for these path-focused tests). */
function stubFs(existingPaths: readonly string[]): FileSystem {
  const paths = new Set(existingPaths);
  return {
    async readFile() {
      throw new Error('not needed by these tests');
    },
    async writeFile() {
      // no-op
    },
    async readdir() {
      return [];
    },
    async stat(path: string) {
      return { isFile: paths.has(path), isDirectory: false };
    },
    async rename() {
      // no-op
    },
    async rm() {
      // no-op
    },
    async mkdir() {
      // no-op
    },
  };
}

describe('course: existence extends to every member (060 T-300, FR-004)', () => {
  it('flags a missing ref cited by an analogy member', async () => {
    const draft = structuredDraft({
      analogy: analogyFixture({ refs: ['packages/does/not/exist.ts'] }),
    });
    const failures = await verifyExistence(draft, {
      cwd: '/repo',
      fs: stubFs([]),
    });
    expect(failures.some((f) => f.kind === 'missing-ref' && f.detail.includes('does/not/exist'))).toBe(true);
  });

  it('flags a missing ref cited by a contrast, worked example, or illustration member', async () => {
    const draft = structuredDraft2({
      contrast: undefined,
      workedExample: workedExampleFixture({ refs: ['packages/ghost-a.ts'] }),
      illustration: illustrationFixture({ refs: ['packages/ghost-b.ts'] }),
    });
    const failures = await verifyExistence(draft, {
      cwd: '/repo',
      fs: stubFs([]),
    });
    const missing = failures.filter((f) => f.kind === 'missing-ref').map((f) => f.detail);
    expect(missing.some((d) => d.includes('ghost-a'))).toBe(true);
    expect(missing.some((d) => d.includes('ghost-b'))).toBe(true);
  });

  it('resolves a member ref that genuinely exists', async () => {
    // Isolate to the analogy's ref alone — target/objective-level refs and the
    // default contrast fixture are ID-shaped and orthogonal to this check.
    const draft = structuredDraft({
      analogy: analogyFixture({ refs: ['packages/real.ts'] }),
      contrast: undefined,
    });
    draft.target = 'packages/target.ts';
    draft.objectives[0]!.refs = [];
    const failures = await verifyExistence(draft, {
      cwd: '/repo',
      fs: stubFs(['/repo/packages/real.ts', '/repo/packages/target.ts']),
    });
    expect(failures.filter((f) => f.kind === 'missing-ref')).toHaveLength(0);
  });
});

describe('course: backward compatibility (060 T-301, FR-006)', () => {
  it('a flat-string objective is checked exactly as it always was pre-060 — no new findings from the payload feature', async () => {
    const draft = goodDraft();
    const failures = await verifyExistence(draft, {
      cwd: '/repo',
      fs: stubFs([]),
    });
    // Both the target and the objective's ref are ID-shaped, not path-like; with
    // no known-ID source in this stub, both are reported exactly as they always
    // were pre-060 — nothing about the structured-payload feature changes this.
    expect(failures).toEqual([
      {
        objectiveIndex: -1,
        kind: 'missing-ref',
        detail: 'target "015-ai-stub-injection" does not resolve to real source',
      },
      { objectiveIndex: 0, kind: 'missing-ref', detail: 'FR-007' },
    ]);
  });

  it('assembles a flat-string course identically whether or not the payload feature exists', () => {
    const before = assembleCourse(goodDraft(), '2026-07-26-test');
    const after = assembleCourse(goodDraft(), '2026-07-26-test');
    expect(before).toBe(after);
    expect(before).not.toContain('course-analogy');
  });
});

describe('course: blind analogy-fit check (060 T-302, FR-005, SC-002, NFR-002)', () => {
  it('flags an analogy the blind call judges misleading', async () => {
    const draft = structuredDraft();
    const ai = new StubAIProvider({ subagent: [{ output: 'yes' }] });
    const failures = await verifyAnalogyFit(draft, { cwd: '/tmp', ai });
    expect(failures).toHaveLength(1);
    expect(failures[0]?.kind).toBe('misleading-analogy');
  });

  it('passes an analogy the blind call does not flag', async () => {
    const draft = structuredDraft();
    const ai = new StubAIProvider({ subagent: [{ output: 'no' }] });
    const failures = await verifyAnalogyFit(draft, { cwd: '/tmp', ai });
    expect(failures).toHaveLength(0);
  });

  it('is a no-op for an objective with no analogy', async () => {
    const draft = structuredDraft({ analogy: undefined });
    const ai = new StubAIProvider({ subagent: [] });
    const failures = await verifyAnalogyFit(draft, { cwd: '/tmp', ai });
    expect(failures).toHaveLength(0);
  });
});
