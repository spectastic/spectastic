import { describe, expect, it } from 'vitest';
import { ANNOTATION_CATEGORY_MAP, UNMAPPED, resolveAnnotationCategory } from '../src/visual/annotation-categories.js';

/**
 * Where each design-tool annotation category lands (spec 095, FR-006).
 *
 * The requirement has two halves and the second is the one that matters: name
 * the categories with no home rather than silently dropping them. A table in a
 * document answers the first and cannot answer the second, because nothing
 * reads a table — which is why this is data (design D-005).
 */

describe('categories that map onto the accessibility tree', () => {
  it('resolves a role-bearing category to a role', () => {
    expect(resolveAnnotationCategory('role')).toEqual({ kind: 'role' });
  });

  it('resolves a behaviour category to a state', () => {
    expect(resolveAnnotationCategory('behaviour')).toEqual({ kind: 'aria-state' });
  });

  it('is case-insensitive, since the tools disagree about casing', () => {
    expect(resolveAnnotationCategory('Behaviour')).toEqual(resolveAnnotationCategory('behaviour'));
  });
});

describe('categories with no accessibility analogue', () => {
  it('reports a tracking plan as explicitly unmapped, not as unknown', () => {
    // The distinction is the whole point: "we looked and there is no home" is
    // a different statement from "we have never heard of this".
    expect(resolveAnnotationCategory('tracking')).toEqual({ kind: UNMAPPED, reason: expect.any(String) });
  });

  it('reports a content budget as explicitly unmapped', () => {
    expect(resolveAnnotationCategory('content')).toEqual({ kind: UNMAPPED, reason: expect.any(String) });
  });

  it('gives a reason for every unmapped category, so the gap is legible', () => {
    for (const [name, entry] of Object.entries(ANNOTATION_CATEGORY_MAP)) {
      if (entry.kind !== UNMAPPED) continue;
      expect(entry.reason, name).toBeTruthy();
    }
  });
});

describe('a category nobody enumerated', () => {
  it('is reported by name rather than dropped', () => {
    const resolved = resolveAnnotationCategory('brand-rationale');
    expect(resolved.kind).toBe('unknown');
    expect(resolved).toMatchObject({ name: 'brand-rationale' });
  });
});

describe('the map is data, and stays auditable', () => {
  it('enumerates at least the eight categories the survey audited', () => {
    expect(Object.keys(ANNOTATION_CATEGORY_MAP).length).toBeGreaterThanOrEqual(8);
  });

  it('every mapped entry names a kind the vocabulary actually has', () => {
    for (const [name, entry] of Object.entries(ANNOTATION_CATEGORY_MAP)) {
      expect(['role', 'aria-state', UNMAPPED], name).toContain(entry.kind);
    }
  });
});
