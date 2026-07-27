import { describe, expect, it } from 'vitest';
import { grep, rgAvailable } from '../src/read/grep.js';
import type { CorpusPack } from '../src/knowledge/types.js';

/**
 * 064-corpus-package-extraction, US3 (T-302, FR-005, plan D-005): grep<pattern> matches over
 * document bodies — ripgrep when present on PATH, else a pure-Node scan. The two paths MUST
 * return identical, normalised hit sets for the same input (plan §8's named risk) —
 * asserted here directly against the same fixture with each mode forced, rather than trusting
 * environment auto-detection to exercise both.
 */

function pack(overrides: Partial<CorpusPack> = {}): CorpusPack {
  return {
    name: 'example',
    dirPath: 'knowledge/example',
    hasSkillFile: true,
    index: [],
    documents: [
      {
        id: 'KB-501',
        filePath: 'knowledge/example/references/KB-501.md',
        provenance: { edition: '2026-01-01' },
        missingFields: [],
        hasFrontmatter: true,
        body: '# Settlement window\n\nSettles in one business day.\nA second line mentioning Business Day again.\n',
      },
      {
        id: 'KB-502',
        filePath: 'knowledge/example/references/KB-502.md',
        provenance: { edition: '2026-01-01' },
        missingFields: [],
        hasFrontmatter: true,
        body: '# Unrelated\n\nNothing to see here.\n',
      },
    ],
    supersededEditions: [],
    ...overrides,
  };
}

describe('grep — rg/Node parity (064, T-302)', () => {
  it('the two forced modes return byte-identical hit sets for the same fixture', () => {
    const nodeHits = grep('business day', [pack()], { mode: 'node' });
    const rgHits = grep('business day', [pack()], { mode: 'rg' });
    expect(nodeHits).toEqual(rgHits);
  });

  it('matches are case-insensitive in both modes', () => {
    expect(grep('BUSINESS DAY', [pack()], { mode: 'node' }).length).toBeGreaterThan(0);
    expect(grep('BUSINESS DAY', [pack()], { mode: 'rg' }).length).toBeGreaterThan(0);
  });

  it('returns every matching line (not just the first) per document, in both modes', () => {
    const nodeHits = grep('business day', [pack()], { mode: 'node' });
    expect(nodeHits.filter((h) => h.id === 'KB-501').length).toBe(2);
  });

  it('returns an empty array (never throws) for no match, in both modes', () => {
    expect(grep('no-such-pattern-xyz', [pack()], { mode: 'node' })).toEqual([]);
    expect(grep('no-such-pattern-xyz', [pack()], { mode: 'rg' })).toEqual([]);
  });

  it('skips a document with no id, in both modes', () => {
    const noIdPack = pack({
      documents: [
        { id: null, filePath: 'knowledge/example/references/no-id.md', provenance: {}, missingFields: ['id'], hasFrontmatter: false, body: 'business day mention' },
      ],
    });
    expect(grep('business day', [noIdPack], { mode: 'node' })).toEqual([]);
    expect(grep('business day', [noIdPack], { mode: 'rg' })).toEqual([]);
  });

  it('returns an empty array on an empty corpus (FR-007 graceful absence)', () => {
    expect(grep('anything', [], { mode: 'node' })).toEqual([]);
  });

  it('auto mode (no forced mode) picks rg when available on this machine', () => {
    // This dev/CI environment has ripgrep on PATH (grounded, not assumed).
    expect(rgAvailable()).toBe(true);
    expect(grep('business day', [pack()])).toEqual(grep('business day', [pack()], { mode: 'rg' }));
  });
});
