import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PackFetcherError, RealPackFetcher } from '../src/providers/pack-fetcher.js';
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

  it('throws an actionable error naming /plugin install for a remote (object-sourced) plugin', async () => {
    const home = claudeHome();
    mkdirSync(join(home, 'plugins'), { recursive: true });
    const installLocation = join(home, 'plugins', 'marketplaces', 'acme');
    mkdirSync(join(installLocation, '.claude-plugin'), { recursive: true });
    writeFileSync(join(home, 'plugins', 'known_marketplaces.json'), JSON.stringify({ acme: { installLocation } }));
    writeFileSync(
      join(installLocation, '.claude-plugin', 'marketplace.json'),
      JSON.stringify({
        name: 'acme',
        plugins: [{ name: 'remote-thing', source: { source: 'url', url: 'https://example.com/x.git' } }],
      }),
    );

    const fetcher = new RealPackFetcher(home);
    await expect(fetcher.fetch('remote-thing@acme')).rejects.toThrow(PackFetcherError);
    await expect(fetcher.fetch('remote-thing@acme')).rejects.toThrow(/\/plugin install remote-thing@acme/);
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
