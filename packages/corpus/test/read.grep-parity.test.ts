import { describe, expect, it } from 'vitest';
import { grep, rgAvailable } from '../src/read/grep.js';
import type { CorpusPack } from '../src/knowledge/types.js';

/**
 * 064-corpus-package-extraction, US3 (T-302, FR-005, plan D-005): grep<pattern> matches over
 * document bodies — ripgrep when present on PATH, else a pure-Node scan. The two paths MUST
 * return identical, normalised hit sets for the same input (plan §8's named risk).
 *
 * ripgrep is an OPTIONAL runtime accelerator — grep.ts auto-detects it and falls back to a
 * pure-Node scan when it's absent, so the tests must NOT hard-require it (triage 064 T-001: a
 * runner without `rg` on PATH turned the whole build red). The Node-mode correctness tests
 * always run; the rg-parity tests skip cleanly when rg is absent (CI installs ripgrep so they
 * still exercise real parity there); and a fallback test covers the no-rg auto path.
 */
const HAS_RG = rgAvailable();

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

const noIdPack = () =>
  pack({
    documents: [
      { id: null, filePath: 'knowledge/example/references/no-id.md', provenance: {}, missingFields: ['id'], hasFrontmatter: false, body: 'business day mention' },
    ],
  });

// Node mode is always available (no external binary) — these run in every environment.
describe('grep — Node mode (064, T-302)', () => {
  it('matches are case-insensitive', () => {
    expect(grep('BUSINESS DAY', [pack()], { mode: 'node' }).length).toBeGreaterThan(0);
  });

  it('returns every matching line (not just the first) per document', () => {
    const nodeHits = grep('business day', [pack()], { mode: 'node' });
    expect(nodeHits.filter((h) => h.id === 'KB-501').length).toBe(2);
  });

  it('returns an empty array (never throws) for no match', () => {
    expect(grep('no-such-pattern-xyz', [pack()], { mode: 'node' })).toEqual([]);
  });

  it('skips a document with no id', () => {
    expect(grep('business day', [noIdPack()], { mode: 'node' })).toEqual([]);
  });

  it('returns an empty array on an empty corpus (FR-007 graceful absence)', () => {
    expect(grep('anything', [], { mode: 'node' })).toEqual([]);
  });
});

// The parity guarantee (plan §8's named risk) can only be exercised where ripgrep is on
// PATH; skipped cleanly otherwise (never a red build). CI installs ripgrep so this runs there.
describe.skipIf(!HAS_RG)('grep — rg/Node parity (064, T-302) — requires ripgrep on PATH', () => {
  it('the two forced modes return byte-identical hit sets for the same fixture', () => {
    const nodeHits = grep('business day', [pack()], { mode: 'node' });
    const rgHits = grep('business day', [pack()], { mode: 'rg' });
    expect(nodeHits).toEqual(rgHits);
  });

  it('rg mode is case-insensitive', () => {
    expect(grep('BUSINESS DAY', [pack()], { mode: 'rg' }).length).toBeGreaterThan(0);
  });

  it('rg mode returns an empty array (never throws) for no match', () => {
    expect(grep('no-such-pattern-xyz', [pack()], { mode: 'rg' })).toEqual([]);
  });

  it('rg mode skips a document with no id', () => {
    expect(grep('business day', [noIdPack()], { mode: 'rg' })).toEqual([]);
  });

  it('auto mode (no forced mode) picks rg when available on this machine', () => {
    expect(rgAvailable()).toBe(true);
    expect(grep('business day', [pack()])).toEqual(grep('business day', [pack()], { mode: 'rg' }));
  });
});

// The complementary path: with no rg, auto mode must fall back to the Node scan (never throw).
describe.skipIf(HAS_RG)('grep — auto mode falls back to Node when ripgrep is absent', () => {
  it('auto mode returns the Node hit set without throwing', () => {
    expect(rgAvailable()).toBe(false);
    expect(grep('business day', [pack()])).toEqual(grep('business day', [pack()], { mode: 'node' }));
  });
});
