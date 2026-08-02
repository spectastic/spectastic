import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CorpusConfigError,
  DEFAULT_CORPUS_ROOT,
  defaultMarketplaceName,
  loadCorpusConfig,
  loadProjectConfig,
  marketplaceIdentityFindings,
  projectIdentityFindings,
  resolveCorpusConfig,
  resolveProjectConfig,
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
    expect(loadCorpusConfig(dir)).toEqual({
      marketplace: 'acme',
      root: 'domain-knowledge',
    });
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
    expect(resolveCorpusConfig(dir)).toEqual({
      marketplace: basename(dir),
      root: DEFAULT_CORPUS_ROOT,
    });
  });

  it('an explicit corpus.marketplace/root wins over the defaults', () => {
    write({ corpus: { marketplace: 'acme', root: 'domain-knowledge' } });
    expect(resolveCorpusConfig(dir)).toEqual({
      marketplace: 'acme',
      root: 'domain-knowledge',
    });
  });

  it('a legacy corpus.namespace resolves as marketplace when marketplace itself is unset', () => {
    write({ corpus: { namespace: 'legacy-name' } });
    expect(resolveCorpusConfig(dir)).toEqual({
      marketplace: 'legacy-name',
      root: DEFAULT_CORPUS_ROOT,
    });
  });

  it('an explicit corpus.marketplace wins over a present corpus.namespace (never a second independent value)', () => {
    write({ corpus: { marketplace: 'canonical', namespace: 'legacy-name' } });
    expect(resolveCorpusConfig(dir).marketplace).toBe('canonical');
  });

  it('defaultMarketplaceName is exactly basename(cwd), the same value init already computes', () => {
    expect(defaultMarketplaceName(dir)).toBe(basename(dir));
  });

  // 067-spec-project-identity T-104: resolveCorpusConfig's marketplace
  // precedence gains a project tier (FR-006) — below explicit
  // marketplace/namespace, above the bare basename(cwd) default.
  it('an unset marketplace derives from project (FR-006, unified identity)', () => {
    write({ project: 'acme/widget' });
    expect(resolveCorpusConfig(dir).marketplace).toBe('acme/widget');
  });

  it('an explicit corpus.marketplace still wins over project (the publish-identity escape hatch)', () => {
    write({
      corpus: { marketplace: 'published-name' },
      project: 'acme/widget',
    });
    expect(resolveCorpusConfig(dir).marketplace).toBe('published-name');
  });

  it('the deprecated corpus.namespace alias still wins over project', () => {
    write({ corpus: { namespace: 'legacy-name' }, project: 'acme/widget' });
    expect(resolveCorpusConfig(dir).marketplace).toBe('legacy-name');
  });

  it('falls back to basename(cwd) when neither marketplace/namespace nor project is set (unchanged precedent)', () => {
    expect(resolveCorpusConfig(dir).marketplace).toBe(basename(dir));
  });
});

describe('loadProjectConfig / resolveProjectConfig (067, FR-001/FR-003)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'spectastic-project-config-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  const write = (obj: unknown) => writeFileSync(join(dir, 'spectastic.json'), JSON.stringify(obj));

  it('loadProjectConfig returns empty when no file / no project field', () => {
    expect(loadProjectConfig(dir)).toEqual({});
    write({ corpus: { marketplace: 'x' } });
    expect(loadProjectConfig(dir)).toEqual({});
  });

  it('loadProjectConfig reads the raw project value verbatim', () => {
    write({ project: 'acme/widget' });
    expect(loadProjectConfig(dir)).toEqual({ project: 'acme/widget' });
  });

  it('loadProjectConfig throws on a non-string project', () => {
    write({ project: 42 });
    expect(() => loadProjectConfig(dir)).toThrow(/project/);
  });

  it('resolveProjectConfig returns the persisted value verbatim — never re-derived', () => {
    write({ project: 'acme/widget' });
    expect(resolveProjectConfig(dir)).toEqual({ project: 'acme/widget' });
    // Calling twice is byte-identical — pure read, no git, no clock (NFR-001).
    expect(resolveProjectConfig(dir)).toEqual(resolveProjectConfig(dir));
  });

  it('resolveProjectConfig falls back to basename(cwd) when project is absent', () => {
    expect(resolveProjectConfig(dir)).toEqual({ project: basename(dir) });
  });
});

describe('projectIdentityFindings (067 T-300/T-301/T-302, FR-007)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'spectastic-project-findings-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  const write = (obj: unknown) => writeFileSync(join(dir, 'spectastic.json'), JSON.stringify(obj));

  it('a malformed project id is an error', () => {
    write({ project: '/leading-slash' });
    const findings = projectIdentityFindings(dir);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe('error');
  });

  it('a bare unqualified default is a warning, never an error', () => {
    write({ project: 'spectastic' });
    const findings = projectIdentityFindings(dir);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe('warning');
    expect(findings[0]!.message).toContain('spectastic init');
  });

  it('an absent project is silent (single-repo back-compat)', () => {
    expect(projectIdentityFindings(dir)).toEqual([]);
  });

  it('a well-formed owner-qualified project is silent', () => {
    write({ project: 'acme/widget' });
    expect(projectIdentityFindings(dir)).toEqual([]);
  });
});

/**
 * 078-federated-resource-uri T-400: red-first tests for
 * marketplaceIdentityFindings — mirrors projectIdentityFindings one axis
 * over (FR-011), on the RESOLVED marketplace. Unlike `project`, a
 * marketplace always resolves to SOMETHING (the directory-name default),
 * so "absent" isn't the graceful-absence trigger here — "no evidence the
 * corpus is in use at all" is (an explicit corpus.marketplace/namespace, or
 * at least one pack under knowledge/; neither present stays silent, exactly
 * like corpusWellFormedFindings and its siblings).
 */
describe('marketplaceIdentityFindings (078 T-410, FR-011)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'spectastic-marketplace-findings-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  const write = (obj: unknown) => writeFileSync(join(dir, 'spectastic.json'), JSON.stringify(obj));

  it('a malformed marketplace is an error', () => {
    write({ corpus: { marketplace: '/leading-slash' } });
    const findings = marketplaceIdentityFindings(dir);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe('error');
  });

  it('a bare unqualified marketplace is a warning, never an error', () => {
    write({ corpus: { marketplace: 'spectastic' } });
    const findings = marketplaceIdentityFindings(dir);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe('warning');
  });

  it('a well-formed owner-qualified marketplace is silent', () => {
    write({ corpus: { marketplace: 'acme/widget-pack' } });
    expect(marketplaceIdentityFindings(dir)).toEqual([]);
  });

  it('never fires alongside a name-collision with the project-identity gate (independent scans)', () => {
    write({ project: 'acme/widget', corpus: { marketplace: 'acme/widget-pack' } });
    expect(projectIdentityFindings(dir)).toEqual([]);
    expect(marketplaceIdentityFindings(dir)).toEqual([]);
  });

  it('graceful absence: no config AND no knowledge/ at all is silent — nothing to warn about yet', () => {
    expect(marketplaceIdentityFindings(dir)).toEqual([]);
  });

  it('a real pack present (no explicit config) still fires the directory-name-default warning', () => {
    mkdirSync(join(dir, 'knowledge', 'some-pack'), { recursive: true });
    const findings = marketplaceIdentityFindings(dir);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe('warning');
    expect(findings[0]!.message).toContain(basename(dir));
  });

  it('an explicit config with no pack present still fires — the config itself is the evidence', () => {
    write({ corpus: { marketplace: 'bare-name' } });
    const findings = marketplaceIdentityFindings(dir);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe('warning');
  });
});
