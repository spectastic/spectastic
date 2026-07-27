import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import {
  loadCorpusConfig,
  resolveCorpusConfig,
  defaultMarketplaceName,
  DEFAULT_CORPUS_ROOT,
  CorpusConfigError,
} from '../src/config.js';

/**
 * 063-corpus-discoverability T-100: the corpus config reader — a raw partial
 * read (loadCorpusConfig, mirrors loadModelsConfig) plus the resolved value
 * every consumer actually uses (resolveCorpusConfig), which applies the
 * defaults and the deprecated corpus.namespace alias (FR-006, D-003).
 */
describe('loadCorpusConfig (raw partial read)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'spectastic-corpus-config-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  const write = (obj: unknown) => writeFileSync(join(dir, 'spectastic.json'), JSON.stringify(obj));

  it('returns empty when no file / no corpus section', () => {
    expect(loadCorpusConfig(dir)).toEqual({});
    write({ git: { auto: 'commit' } });
    expect(loadCorpusConfig(dir)).toEqual({});
  });

  it('reads an explicit marketplace + root', () => {
    write({ corpus: { marketplace: 'acme', root: 'domain-knowledge' } });
    expect(loadCorpusConfig(dir)).toEqual({ marketplace: 'acme', root: 'domain-knowledge' });
  });

  it('reads the deprecated namespace field verbatim (no alias resolution at this layer)', () => {
    write({ corpus: { namespace: 'legacy-name' } });
    expect(loadCorpusConfig(dir)).toEqual({ namespace: 'legacy-name' });
  });

  it('throws on a non-object corpus section', () => {
    write({ corpus: 'nope' });
    expect(() => loadCorpusConfig(dir)).toThrow(CorpusConfigError);
  });

  it('throws on a non-string marketplace', () => {
    write({ corpus: { marketplace: 42 } });
    expect(() => loadCorpusConfig(dir)).toThrow(/corpus\.marketplace/);
  });

  it('throws on invalid JSON', () => {
    writeFileSync(join(dir, 'spectastic.json'), '{ not json');
    expect(() => loadCorpusConfig(dir)).toThrow(CorpusConfigError);
  });
});

describe('resolveCorpusConfig (resolved value, FR-006)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'spectastic-corpus-resolve-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  const write = (obj: unknown) => writeFileSync(join(dir, 'spectastic.json'), JSON.stringify(obj));

  it('defaults to the repo directory name + "knowledge" when nothing is set', () => {
    expect(resolveCorpusConfig(dir)).toEqual({ marketplace: basename(dir), root: DEFAULT_CORPUS_ROOT });
  });

  it('an explicit corpus.marketplace/root wins over the defaults', () => {
    write({ corpus: { marketplace: 'acme', root: 'domain-knowledge' } });
    expect(resolveCorpusConfig(dir)).toEqual({ marketplace: 'acme', root: 'domain-knowledge' });
  });

  it('a legacy corpus.namespace resolves as marketplace when marketplace itself is unset', () => {
    write({ corpus: { namespace: 'legacy-name' } });
    expect(resolveCorpusConfig(dir)).toEqual({ marketplace: 'legacy-name', root: DEFAULT_CORPUS_ROOT });
  });

  it('an explicit corpus.marketplace wins over a present corpus.namespace (never a second independent value)', () => {
    write({ corpus: { marketplace: 'canonical', namespace: 'legacy-name' } });
    expect(resolveCorpusConfig(dir).marketplace).toBe('canonical');
  });

  it('defaultMarketplaceName is exactly basename(cwd), the same value init already computes', () => {
    expect(defaultMarketplaceName(dir)).toBe(basename(dir));
  });
});
