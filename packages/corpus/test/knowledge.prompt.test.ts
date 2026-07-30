import { describe, expect, it } from 'vitest';
import { buildCorpusPromptBlock } from '../src/knowledge/prompt.js';
import type { CorpusPack, IndexEntry } from '../src/knowledge/types.js';

/**
 * 054-corpus-in-prompt T-100/T-200/T-300: red-first tests for
 * buildCorpusPromptBlock (plan D-001-D-003) — a pure function rendering the
 * corpus index into a fenced block plus a fixed, unfenced grounding
 * directive. Empty packs -> '' (FR-003/SC-002). Presence-deterministic
 * (NFR-001/SC-003): same packs, same bytes, regardless of caller order.
 */

function entry(overrides: Partial<IndexEntry> = {}): IndexEntry {
  return {
    id: 'KB-001',
    title: 'Foo',
    description: 'Bar',
    edition: '2026-01-01',
    path: 'knowledge/example/references/KB-001-foo.md',
    ...overrides,
  };
}

function pack(overrides: Partial<CorpusPack> = {}): CorpusPack {
  return {
    name: 'example',
    dirPath: 'knowledge/example',
    hasSkillFile: true,
    index: [entry()],
    documents: [],
    supersededEditions: [],
    ...overrides,
  };
}

describe('buildCorpusPromptBlock (054, T-100)', () => {
  it('returns "" for an empty pack list', () => {
    expect(buildCorpusPromptBlock([])).toBe('');
  });

  it('renders every index row, fenced, alongside the grounding directive', () => {
    const block = buildCorpusPromptBlock([pack()]);
    expect(block).toContain('KB-001');
    expect(block).toContain('2026-01-01');
    expect(block).toContain('Foo');
    expect(block).toContain('knowledge/example/references/KB-001-foo.md');
    // The index is fenced through fenceArtifactText — the marker + guard survive.
    expect(block).toMatch(/<<<BEGIN KNOWLEDGE_CORPUS_INDEX DATA>>>/);
    expect(block).toMatch(/<<<END KNOWLEDGE_CORPUS_INDEX DATA>>>/);
    expect(block).toMatch(/untrusted content/i);
    // The grounding directive names the citation form and stays unfenced.
    expect(block).toMatch(/KB-NNNN@edition|cite/i);
    // 2026-07-26-hybrid-corpus-citation T-1005: never the marketplace version.
    expect(block).toMatch(/never a marketplace/i);
  });

  it('renders rows from multiple packs', () => {
    const block = buildCorpusPromptBlock([
      pack({ name: 'a', index: [entry({ id: 'KB-001' })] }),
      pack({ name: 'b', index: [entry({ id: 'KB-002' })] }),
    ]);
    expect(block).toContain('KB-001');
    expect(block).toContain('KB-002');
  });

  it('returns "" when every pack has an empty index', () => {
    expect(buildCorpusPromptBlock([pack({ index: [] })])).toBe('');
  });
});

describe('buildCorpusPromptBlock presence-determinism (054, T-200)', () => {
  it('is byte-identical across repeated calls with the same packs', () => {
    const packs = [
      pack({ name: 'a', index: [entry({ id: 'KB-001' })] }),
      pack({ name: 'b', index: [entry({ id: 'KB-002' })] }),
    ];
    expect(buildCorpusPromptBlock(packs)).toBe(buildCorpusPromptBlock(packs));
  });

  it('is independent of pack and row order (sorts internally)', () => {
    const forward = [
      pack({
        name: 'a',
        index: [entry({ id: 'KB-001' }), entry({ id: 'KB-002' })],
      }),
      pack({ name: 'b', index: [entry({ id: 'KB-003' })] }),
    ];
    const reversed = [
      pack({ name: 'b', index: [entry({ id: 'KB-003' })] }),
      pack({
        name: 'a',
        index: [entry({ id: 'KB-002' }), entry({ id: 'KB-001' })],
      }),
    ];
    expect(buildCorpusPromptBlock(forward)).toBe(buildCorpusPromptBlock(reversed));
  });

  it('the grounding directive text never varies with pack content', () => {
    const withOnePack = buildCorpusPromptBlock([pack()]);
    const withTwoPacks = buildCorpusPromptBlock([pack({ name: 'a' }), pack({ name: 'b' })]);
    const directiveLine = withOnePack.split('\n\n')[0];
    expect(directiveLine).toBeDefined();
    expect(withTwoPacks.startsWith(directiveLine ?? '\0')).toBe(true);
  });
});
