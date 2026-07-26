import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  corpusHintAlreadyShown,
  markCorpusHintShown,
  showCorpusHintOnce,
} from '../src/knowledge/corpus-hint-marker.js';

/**
 * Unit tests for the corpus one-time-hint marker (054-corpus-in-prompt,
 * T-301 / T-312 / D-004). Mirrors init/marker.test.ts's shape.
 */

describe('corpus hint marker: read/write roundtrip', () => {
  it('reads as not-yet-shown when no marker exists', () => {
    const dir = mkdtempSync(join(tmpdir(), 'spectastic-corpus-hint-'));
    expect(corpusHintAlreadyShown(dir)).toBe(false);
  });

  it('reads as already-shown after a write, creating .spectastic/ if absent', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'spectastic-corpus-hint-'));
    expect(corpusHintAlreadyShown(dir)).toBe(false);
    await markCorpusHintShown(dir);
    expect(corpusHintAlreadyShown(dir)).toBe(true);
  });
});

describe('showCorpusHintOnce (054, T-312)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is a no-op when hint is undefined (a corpus exists)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'spectastic-corpus-hint-'));
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    await showCorpusHintOnce(dir, undefined);
    expect(spy).not.toHaveBeenCalled();
    expect(corpusHintAlreadyShown(dir)).toBe(false);
  });

  it('prints once and marks shown; a second call is silent', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'spectastic-corpus-hint-'));
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    await showCorpusHintOnce(dir, 'a hint');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]?.[0]).toContain('a hint');
    expect(corpusHintAlreadyShown(dir)).toBe(true);

    await showCorpusHintOnce(dir, 'a hint');
    expect(spy).toHaveBeenCalledTimes(1); // still 1 — no second print
  });
});
