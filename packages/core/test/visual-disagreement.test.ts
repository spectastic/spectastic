import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { visualDisagreementFindings } from '../src/commands/validate.js';
import { declaredVisualState } from '../src/visual/read.js';

/**
 * One design system, one token set (spec 094-visual-sidecar-convention, FR-004,
 * design D-002).
 *
 * Two designs naming different token paths are two claims about one thing, so
 * this is an error rather than a union — a union is right for N contracts and
 * meaningless here. Computed off the project pass `declaredVisualState` already
 * makes, so it costs no additional filesystem access.
 */

function project(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'spectastic-094-disagree-'));
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, body, 'utf8');
  }
  return root;
}

const design = (tokens: string, specId: string) =>
  `<!doctype html><html><body><spec-status value="accepted">a</spec-status>
<spec-visual shape="screens" tokens="${tokens}" screens="specs/${specId}/visual" source="figma"><p>r</p></spec-visual>
</body></html>`;

describe('agreement is silent', () => {
  it('reports nothing when two designs name the same token path', () => {
    const root = project({
      'specs/001-a/design.html': design('visual/tokens', '001-a'),
      'specs/002-b/design.html': design('visual/tokens', '002-b'),
    });
    expect(visualDisagreementFindings(declaredVisualState(root), 'spectastic.json')).toEqual([]);
  });

  it('reports nothing for a single design', () => {
    const root = project({ 'specs/001-a/design.html': design('visual/tokens', '001-a') });
    expect(visualDisagreementFindings(declaredVisualState(root), 'spectastic.json')).toEqual([]);
  });

  it('reports nothing for a project with no declarations at all', () => {
    const root = project({ 'package.json': '{}' });
    expect(visualDisagreementFindings(declaredVisualState(root), 'spectastic.json')).toEqual([]);
  });
});

describe('disagreement is one error for the project', () => {
  it('reports exactly one finding, not one per design', () => {
    const root = project({
      'specs/001-a/design.html': design('visual/tokens', '001-a'),
      'specs/002-b/design.html': design('design/tokens', '002-b'),
      'specs/003-c/design.html': design('design/tokens', '003-c'),
    });
    const f = visualDisagreementFindings(declaredVisualState(root), 'spectastic.json');
    expect(f).toHaveLength(1);
    expect(f[0]?.severity).toBe('error');
  });

  it('names every disagreeing path and the spec that declared it', () => {
    // A reader told only that paths disagree cannot act on it.
    const root = project({
      'specs/001-a/design.html': design('visual/tokens', '001-a'),
      'specs/002-b/design.html': design('design/tokens', '002-b'),
    });
    const message = visualDisagreementFindings(declaredVisualState(root), 'spectastic.json')[0]?.message ?? '';
    expect(message).toContain('visual/tokens');
    expect(message).toContain('design/tokens');
    expect(message).toContain('001-a');
    expect(message).toContain('002-b');
  });

  it('resolves by neither precedence nor union — it refuses', () => {
    const root = project({
      'specs/001-a/design.html': design('visual/tokens', '001-a'),
      'specs/002-b/design.html': design('design/tokens', '002-b'),
    });
    const hint = visualDisagreementFindings(declaredVisualState(root), 'spectastic.json')[0]?.fixHint ?? '';
    expect(hint).toMatch(/one design system|single|one token set/i);
  });

  it('ignores the screens paths, which legitimately differ per feature', () => {
    const root = project({
      'specs/001-a/design.html': design('visual/tokens', '001-a'),
      'specs/002-b/design.html': design('visual/tokens', '002-b'),
    });
    // Two different screens paths, one token path — silent.
    expect(visualDisagreementFindings(declaredVisualState(root), 'spectastic.json')).toEqual([]);
  });
});
