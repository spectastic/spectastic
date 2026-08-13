import { describe, expect, it } from 'vitest';
import { assertTokenSetVersion } from '../src/visual/token-set-guard.js';

/**
 * The amendment guard (spec 098, FR-004, NFR-001, NFR-002, design D-002).
 *
 * A compare-and-swap, cloned from the principles apply. It needs no notion of
 * which version is later — which is the point: NFR-001 caps orderings at zero,
 * because a mechanism claiming to know which version is newer must then
 * enforce that claim forever, and every versioning mechanism in this project
 * has declined to.
 */

const POLICY = '<p>MAJOR when a token is removed; MINOR when one is added; PATCH otherwise, at length.</p>';
const live = (version: string) =>
  `<!doctype html><html><body><spec-token-set version="${version}" binds-from="2.0.0">${POLICY}</spec-token-set></body></html>`;

describe('the compare-and-swap (FR-004)', () => {
  it('accepts an amendment whose from-version equals the live one', () => {
    expect(() => assertTokenSetVersion(live('2.1.0'), '2.1.0')).not.toThrow();
  });

  it('refuses one that does not, naming BOTH values', () => {
    // A reviewer must be able to see what they wrote against and what is there
    // now — one value alone leaves them guessing which moved.
    expect(() => assertTokenSetVersion(live('2.2.0'), '2.1.0')).toThrow(/2\.1\.0[\s\S]*2\.2\.0|2\.2\.0[\s\S]*2\.1\.0/);
  });

  it('refuses a stale amendment even when the declared version looks earlier', () => {
    // Deliberately NOT "is 2.0.0 older than 2.2.0" — the guard never asks.
    expect(() => assertTokenSetVersion(live('2.2.0'), '2.0.0')).toThrow();
  });

  it('refuses one that looks later too, because equality is the only question', () => {
    expect(() => assertTokenSetVersion(live('2.0.0'), '9.9.9')).toThrow();
  });
});

describe('fail closed (NFR-002)', () => {
  it('refuses when the live artifact carries no version', () => {
    expect(() => assertTokenSetVersion('<!doctype html><html><body><p>nothing</p></body></html>', '2.1.0')).toThrow();
  });

  it('refuses when the live version is empty', () => {
    expect(() => assertTokenSetVersion(live(''), '2.1.0')).toThrow();
  });

  it('refuses when the amendment declares no from-version', () => {
    expect(() => assertTokenSetVersion(live('2.1.0'), undefined)).toThrow();
  });

  it('refuses on unreadable input rather than passing it through', () => {
    expect(() => assertTokenSetVersion('', '2.1.0')).toThrow();
  });
});

describe('NFR-001 · no ordering, anywhere', () => {
  it('the guard module contains no version comparison at all', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const { join } = await import('node:path');
    const here = fileURLToPath(import.meta.url);
    const root = here.slice(0, here.indexOf('/packages/core/'));
    const src = readFileSync(join(root, 'packages/core/src/visual/token-set-guard.ts'), 'utf8');
    // Not "does not call a comparator" — contains none. "You are three releases
    // behind" is useful enough that somebody will try to add it.
    expect(src).not.toMatch(/localeCompare|semver|compareVersions|\.sort\(|[<>]=?\s*(?:other|live|declared)/);
  });
});
