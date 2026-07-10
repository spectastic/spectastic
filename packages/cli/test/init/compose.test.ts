import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  PRINCIPLES_END,
  combinedPrinciples,
  composeArtifacts,
  renderAgentsMd,
  renderClaudeMd,
  renderPrinciplesHtml,
  spliceUpgrade,
} from '../../src/commands/init/compose.js';
import { loadProfiles, resolveProfile } from '../../src/commands/init/profiles.js';

/**
 * Unit tests for the profile composer (spec 041 T-101 / T-301 / T-900).
 * bundleRoot = repo root, which carries templates/principles.html + profiles.json.
 */

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(here, '..', '..', '..', '..');
const manifest = loadProfiles(REPO_ROOT);

function opts(profileName: string) {
  return {
    bundleRoot: REPO_ROOT,
    manifest,
    profile: resolveProfile(manifest, profileName),
    cwd: '/tmp/does-not-matter',
    projectName: 'demo',
    date: '2026-07-09',
    displayDate: '09 Jul 2026',
  };
}

describe('compose: combinedPrinciples', () => {
  it('lean = base only; verified adds beyond base', () => {
    const lean = combinedPrinciples(manifest, resolveProfile(manifest, 'lean'));
    const verified = combinedPrinciples(manifest, resolveProfile(manifest, 'verified'));
    expect(lean.length).toBe(manifest.base.principles.length);
    expect(verified.length).toBeGreaterThan(lean.length);
    expect(verified.some((p) => p.name === 'Done means verified')).toBe(true);
  });

  it('dedupes by name (verified names are unique)', () => {
    const verified = combinedPrinciples(manifest, resolveProfile(manifest, 'verified'));
    const names = verified.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('compose: renderPrinciplesHtml', () => {
  it('numbers principles P-1..P-N sequentially with the end sentinel', () => {
    const html = renderPrinciplesHtml(opts('verified'));
    const ids = [...html.matchAll(/id="P-(\d+)"/g)].map((m) => Number(m[1]));
    expect(ids).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(html).toContain(PRINCIPLES_END);
  });

  it('leaves no [PLACEHOLDER] tokens', () => {
    const html = renderPrinciplesHtml(opts('standard'));
    expect(html).not.toMatch(/\[[A-Z_]+/);
  });
});

describe('compose: AGENTS.md + CLAUDE.md', () => {
  it('CLAUDE.md points at AGENTS.md', () => {
    expect(renderClaudeMd(manifest)).toContain('AGENTS.md');
  });

  it('every profile AGENTS.md stays within the 150-line / 32 KiB ceiling (NFR-002)', () => {
    for (const name of Object.keys(manifest.profiles)) {
      const md = renderAgentsMd(manifest, resolveProfile(manifest, name));
      expect(md.split('\n').length, name).toBeLessThanOrEqual(150);
      expect(Buffer.byteLength(md, 'utf8'), name).toBeLessThanOrEqual(32 * 1024);
    }
  });
});

describe('compose: spliceUpgrade (FR-007)', () => {
  it('appends fresh principles before the sentinel, renumbering', () => {
    const lean = renderPrinciplesHtml(opts('lean'));
    const verifiedPrinciples = combinedPrinciples(manifest, resolveProfile(manifest, 'verified'));
    const merged = spliceUpgrade(lean, verifiedPrinciples);
    expect(merged).not.toBeNull();
    const ids = [...merged!.matchAll(/id="P-(\d+)"/g)].map((m) => Number(m[1]));
    expect(ids).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(merged).toContain('Done means verified');
  });

  it('preserves content above the sentinel (user edits survive)', () => {
    const lean = renderPrinciplesHtml(opts('lean')).replace('<h1>', '<!-- USER --><h1>');
    const merged = spliceUpgrade(lean, combinedPrinciples(manifest, resolveProfile(manifest, 'verified')));
    expect(merged).toContain('<!-- USER -->');
  });

  it('returns null when the sentinel is absent (hand-authored file)', () => {
    expect(spliceUpgrade('<html><h3 id="P-1">P-1 · X</h3></html>', [])).toBeNull();
  });

  it('is idempotent when nothing is fresh', () => {
    const verified = renderPrinciplesHtml(opts('verified'));
    const same = spliceUpgrade(verified, combinedPrinciples(manifest, resolveProfile(manifest, 'verified')));
    expect(same).toBe(verified);
  });
});

describe('compose: composeArtifacts', () => {
  it('emits three content-based decisions (no source path)', () => {
    const decisions = composeArtifacts(opts('standard'));
    expect(decisions.map((d) => d.destination.split('/').pop())).toEqual([
      'principles.html',
      'AGENTS.md',
      'CLAUDE.md',
    ]);
    for (const d of decisions) {
      expect(d.content).toBeTypeOf('string');
      expect(d.source).toBeUndefined();
    }
  });
});
