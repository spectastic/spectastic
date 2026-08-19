import { describe, expect, it } from 'vitest';
import { detectCollisions, slugLabel } from '../src/visual/render-naming.js';

/**
 * `slugLabel` / `detectCollisions` (106 FR-006/FR-007, SC-005).
 *
 * FR-006 names a capture from its artboard's declared label "reduced to a
 * name the filesystem accepts" — this is that reduction. FR-007 is the
 * companion refusal: two artboards whose labels reduce to the same name
 * must be REPORTED, never let one silently overwrite the other's capture
 * file. `detectCollisions` is the mechanism T-111's caller uses to decide
 * whether a run's requested count and its written-file count are allowed
 * to differ (SC-005: exactly 1 fewer, and the collision reported — never
 * a silent write-then-overwrite).
 */

describe('slugLabel (106 FR-006)', () => {
  it('lowercases and collapses a middle-dot separator (with surrounding spaces) to one hyphen', () => {
    expect(slugLabel('no-rate · light')).toBe('no-rate-light');
  });

  it('collapses spaces within a segment too — no double-hyphens anywhere', () => {
    expect(slugLabel('picker browsing · dark')).toBe('picker-browsing-dark');
    expect(slugLabel('picker browsing · dark')).not.toContain('--');
  });

  it('strips characters a filesystem forbids rather than passing them through', () => {
    const slug = slugLabel('bad/name:here*label"?<edge>|case\\value');
    expect(slug).not.toContain('/');
    expect(slug).not.toContain(':');
    expect(slug).not.toContain('*');
    expect(slug).not.toContain('?');
    expect(slug).not.toContain('"');
    expect(slug).not.toContain('<');
    expect(slug).not.toContain('>');
    expect(slug).not.toContain('|');
    expect(slug).not.toContain('\\');
  });
});

describe('detectCollisions (106 FR-007, SC-005)', () => {
  it('reports two differently-punctuated labels that reduce to the same name, and nothing else', () => {
    const collisions = detectCollisions(['no-rate · light', 'no rate - light', 'converted · dark']);
    expect(collisions.size).toBe(1);
    expect(collisions.get('no-rate-light')).toEqual(['no-rate · light', 'no rate - light']);
    // The unique label's own slug must not appear as a collision key at all.
    expect(collisions.has(slugLabel('converted · dark'))).toBe(false);
  });

  it('returns an empty Map when every label slugs uniquely', () => {
    const collisions = detectCollisions(['no-rate · light', 'converted · dark', 'picker browsing · idle']);
    expect(collisions.size).toBe(0);
  });
});
