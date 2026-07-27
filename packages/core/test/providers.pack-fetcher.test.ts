import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PackFetcherError, RealPackFetcher } from '../src/providers/pack-fetcher.js';
import type { GitRunner, GitSource } from '../src/providers/pack-fetcher.js';
import { StubPackFetcher, StubPackFetcherError } from '@spectastic/core/providers/pack-fetcher-stub';

/**
 * 2026-07-26 061-corpus-ingester T-012 (Foundational, red-first): the
 * `PackFetcher` stub — resolves a `<plugin>@<marketplace>` coordinate to a
 * fixture directory, so the install door (US1) and CI never touch a real
 * network (NFR-002). Mirrors `StubAIProvider`'s object-or-file-path
 * constructor shape (015-ai-stub-injection precedent) — a script mapping
 * coordinates to local directories, loaded inline or from a JSON file.
 */
describe('StubPackFetcher (061 T-012, NFR-002)', () => {
  it('resolves a coordinate to its fixture directory', async () => {
    const fetcher = new StubPackFetcher({
      'finance-settlement@spectastic-examples': '/fixtures/finance-settlement',
    });
    await expect(fetcher.fetch('finance-settlement@spectastic-examples')).resolves.toBe(
      '/fixtures/finance-settlement',
    );
  });

  it('throws a descriptive error for a coordinate with no registered fixture', async () => {
    const fetcher = new StubPackFetcher({});
    await expect(fetcher.fetch('unknown@nowhere')).rejects.toThrow(StubPackFetcherError);
    await expect(fetcher.fetch('unknown@nowhere')).rejects.toThrow(/unknown@nowhere/);
  });

  it('loads a script from a JSON file on disk', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pack-fetcher-stub-'));
    const scriptPath = join(dir, 'script.json');
    writeFileSync(scriptPath, JSON.stringify({ 'x@y': '/fixtures/x' }));

    const fetcher = new StubPackFetcher(scriptPath);
    await expect(fetcher.fetch('x@y')).resolves.toBe('/fixtures/x');
  });

  it('throws a descriptive error when the script file is missing', () => {
    expect(() => new StubPackFetcher('/no/such/file.json')).toThrow(/failed to read script.*\/no\/such\/file\.json/);
  });

  it('throws a descriptive error when the script file is not valid JSON', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pack-fetcher-stub-'));
    const scriptPath = join(dir, 'bad.json');
    writeFileSync(scriptPath, '{ not valid json');

    expect(() => new StubPackFetcher(scriptPath)).toThrow(/is not valid JSON/);
  });
});

/**
 * 2026-07-26 061-corpus-ingester T-110 (US1, grounded against the real
 * `~/.claude/plugins/{installed_plugins,known_marketplaces}.json` shape
 * confirmed in the T-100 spike — read here from a fixture `claudeHome`
 * rather than the real one, exactly the host-pluggable seam `detectClaudeCli`
 * established as precedent).
 */
describe('RealPackFetcher (061 T-110, plan §3 spike)', () => {
  function claudeHome(): string {
    return mkdtempSync(join(tmpdir(), 'pack-fetcher-real-'));
  }

  it('resolves via installed_plugins.json when the plugin is already installed (the common case, no fetch needed)', async () => {
    const home = claudeHome();
    mkdirSync(join(home, 'plugins'), { recursive: true });
    writeFileSync(
      join(home, 'plugins', 'installed_plugins.json'),
      JSON.stringify({
        plugins: {
          'finance-settlement@spectastic': [{ installPath: '/cache/finance-settlement/1.0.0' }],
        },
      }),
    );

    const fetcher = new RealPackFetcher(home);
    await expect(fetcher.fetch('finance-settlement@spectastic')).resolves.toBe('/cache/finance-settlement/1.0.0');
  });

  it('falls back to known_marketplaces.json + a string-sourced plugin entry', async () => {
    const home = claudeHome();
    mkdirSync(join(home, 'plugins'), { recursive: true });
    const installLocation = join(home, 'plugins', 'marketplaces', 'spectastic');
    mkdirSync(join(installLocation, '.claude-plugin'), { recursive: true });
    writeFileSync(
      join(home, 'plugins', 'known_marketplaces.json'),
      JSON.stringify({ spectastic: { installLocation } }),
    );
    writeFileSync(
      join(installLocation, '.claude-plugin', 'marketplace.json'),
      JSON.stringify({ name: 'spectastic', plugins: [{ name: 'finance-settlement', source: './finance-settlement' }] }),
    );

    const fetcher = new RealPackFetcher(home);
    await expect(fetcher.fetch('finance-settlement@spectastic')).resolves.toBe(
      resolve(installLocation, './finance-settlement'),
    );
  });

  /** A fake GitRunner that records its calls and populates `dest` (at the
   * source's subdir when given) with a minimal two-layer pack — so a clone
   * never touches the network in a test (the seam's whole point). */
  class FakeGitRunner implements GitRunner {
    public readonly calls: Array<{ dest: string; source: GitSource }> = [];
    fetch(dest: string, source: GitSource): void {
      this.calls.push({ dest, source });
      const packDir = source.path ? join(dest, source.path) : dest;
      mkdirSync(join(packDir, 'references'), { recursive: true });
      writeFileSync(join(packDir, 'SKILL.md'), '---\nname: remote-thing\n---\n');
      writeFileSync(join(packDir, 'references', '001-x.md'), '---\nslug: 001-x\n---\n# X\n');
    }
  }

  function marketplaceWith(home: string, name: string, source: unknown): void {
    mkdirSync(join(home, 'plugins'), { recursive: true });
    const installLocation = join(home, 'plugins', 'marketplaces', name);
    mkdirSync(join(installLocation, '.claude-plugin'), { recursive: true });
    writeFileSync(join(home, 'plugins', 'known_marketplaces.json'), JSON.stringify({ [name]: { installLocation } }));
    writeFileSync(
      join(installLocation, '.claude-plugin', 'marketplace.json'),
      JSON.stringify({ name, plugins: [{ name: 'remote-thing', source }] }),
    );
  }

  it('clones a remote (url + sha) plugin via the git seam and returns the cached pack dir', async () => {
    const home = claudeHome();
    marketplaceWith(home, 'acme', { source: 'url', url: 'https://example.com/x.git', sha: 'abc123' });
    const git = new FakeGitRunner();

    const dir = await new RealPackFetcher(home, git).fetch('remote-thing@acme');
    expect(git.calls).toHaveLength(1);
    expect(git.calls[0]?.source).toMatchObject({ url: 'https://example.com/x.git', sha: 'abc123' });
    expect(dir).toContain(join('.spectastic-cache', 'remote-thing@acme@abc123'));
    expect(existsSync(join(dir, 'references', '001-x.md'))).toBe(true);
  });

  it('derives the github clone URL from {source:github, repo}', async () => {
    const home = claudeHome();
    marketplaceWith(home, 'acme', { source: 'github', repo: 'owner/name' });
    const git = new FakeGitRunner();

    await new RealPackFetcher(home, git).fetch('remote-thing@acme');
    expect(git.calls[0]?.source.url).toBe('https://github.com/owner/name.git');
  });

  it('returns the subdir for a git-subdir source', async () => {
    const home = claudeHome();
    marketplaceWith(home, 'acme', { source: 'git-subdir', url: 'https://example.com/r.git', path: 'plugins/thing', sha: 'deadbeef' });
    const git = new FakeGitRunner();

    const dir = await new RealPackFetcher(home, git).fetch('remote-thing@acme');
    expect(dir.endsWith(join('plugins', 'thing'))).toBe(true);
    expect(readFileSync(join(dir, 'SKILL.md'), 'utf8')).toContain('remote-thing');
  });

  it('reuses the cache on a second fetch at the same sha (no re-clone)', async () => {
    const home = claudeHome();
    marketplaceWith(home, 'acme', { source: 'url', url: 'https://example.com/x.git', sha: 'abc123' });
    const git = new FakeGitRunner();
    const fetcher = new RealPackFetcher(home, git);

    await fetcher.fetch('remote-thing@acme');
    await fetcher.fetch('remote-thing@acme');
    expect(git.calls, 'the second fetch is a cache hit').toHaveLength(1);
  });

  it('throws for an unrecognised remote source shape (no url or repo)', async () => {
    const home = claudeHome();
    marketplaceWith(home, 'acme', { source: 'url' }); // no url
    const git = new FakeGitRunner();

    await expect(new RealPackFetcher(home, git).fetch('remote-thing@acme')).rejects.toThrow(PackFetcherError);
    await expect(new RealPackFetcher(home, git).fetch('remote-thing@acme')).rejects.toThrow(/unrecognised remote source/);
    expect(git.calls, 'never attempts a clone for a malformed source').toHaveLength(0);
  });

  it('throws an actionable error naming /plugin marketplace add for an unknown marketplace', async () => {
    const home = claudeHome();
    const fetcher = new RealPackFetcher(home);
    await expect(fetcher.fetch('anything@never-added')).rejects.toThrow(/\/plugin marketplace add/);
  });

  it('throws an actionable error when the marketplace is known but the plugin is absent from its manifest', async () => {
    const home = claudeHome();
    mkdirSync(join(home, 'plugins'), { recursive: true });
    const installLocation = join(home, 'plugins', 'marketplaces', 'spectastic');
    mkdirSync(join(installLocation, '.claude-plugin'), { recursive: true });
    writeFileSync(
      join(home, 'plugins', 'known_marketplaces.json'),
      JSON.stringify({ spectastic: { installLocation } }),
    );
    writeFileSync(
      join(installLocation, '.claude-plugin', 'marketplace.json'),
      JSON.stringify({ name: 'spectastic', plugins: [] }),
    );

    const fetcher = new RealPackFetcher(home);
    await expect(fetcher.fetch('nonexistent@spectastic')).rejects.toThrow(/was not found in marketplace/);
  });
});
