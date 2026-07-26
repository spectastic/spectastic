/**
 * PackFetcher — the injectable install-fetch seam (061-corpus-ingester,
 * plan D-002, NFR-002). Mirrors the AIProvider seam's shape
 * (`createAIProvider`, `providers/claude-cli.ts`): one interface, real and
 * stub implementations behind it, selected by a factory
 * (`pack-fetcher-factory.ts`) rather than hard-wired — so `corpus import`'s
 * install door never touches a real network in tests or CI.
 *
 * `fetch(coordinate)` resolves a `<plugin>@<marketplace>` coordinate to a
 * local directory containing the pack.
 *
 * **T-100 spike finding.** Claude Code already maintains a local cache of
 * everything a fetch would otherwise need to re-derive — confirmed by
 * reading the real files on this machine, not assumed:
 *
 *  - `~/.claude/plugins/installed_plugins.json` maps `<plugin>@<marketplace>`
 *    to an `installPath` the user already has on disk (from having run
 *    `/plugin install` in Claude Code). This is the common case and needs
 *    no fetch at all — just read the path.
 *  - `~/.claude/plugins/known_marketplaces.json` maps a marketplace name to
 *    its `installLocation` (a local clone Claude Code already made when the
 *    user ran `/plugin marketplace add`). Its `.claude-plugin/marketplace.json`
 *    lists each plugin's `source` — a bare relative-path string for a
 *    monorepo-style plugin, or a `{source: 'url'|'git-subdir'|'github', ...}`
 *    object for an externally-hosted one (confirmed against both the
 *    official marketplace and spectastic's own real one).
 *
 * `RealPackFetcher` therefore never shells to git itself — it reads Claude
 * Code's own cache. A plugin whose source is the object (remote) form isn't
 * yet fetched here (that would mean re-implementing a git client Claude
 * Code already has); the error names the `/plugin install` command as the
 * documented ceiling, alongside the `--from <path>` escape hatch every
 * caller already has.
 */
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

/** Resolves an acquisition coordinate to a local pack directory. */
export interface PackFetcher {
  /** `<plugin>@<marketplace>` → the local directory the pack now lives in. */
  fetch(coordinate: string): Promise<string>;
}

export class PackFetcherError extends Error {
  public override readonly cause?: unknown;
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = 'PackFetcherError';
    if (options?.cause !== undefined) this.cause = options.cause;
  }
}

interface InstalledPluginsFile {
  plugins?: Record<string, Array<{ installPath?: string }>>;
}

interface KnownMarketplacesFile {
  [name: string]: { installLocation?: string } | undefined;
}

interface RawMarketplacePlugin {
  name?: string;
  source?: string | Record<string, unknown>;
}

interface RawMarketplaceManifest {
  plugins?: RawMarketplacePlugin[];
}

function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch {
    return null;
  }
}

/**
 * The production `PackFetcher` — reads Claude Code's own plugin cache
 * (`installed_plugins.json` / `known_marketplaces.json`) rather than
 * shelling to git itself (T-100 spike finding). `claudeHome` is injectable
 * (host-pluggable, not hard-wired, matching `detectClaudeCli`'s precedent)
 * so tests point it at a fixture directory instead of the real `~/.claude`.
 */
export class RealPackFetcher implements PackFetcher {
  constructor(private readonly claudeHome: string = join(homedir(), '.claude')) {}

  async fetch(coordinate: string): Promise<string> {
    const installed = readJson<InstalledPluginsFile>(join(this.claudeHome, 'plugins', 'installed_plugins.json'));
    const installs = installed?.plugins?.[coordinate];
    const installPath = installs?.at(-1)?.installPath;
    if (installPath) return installPath;

    const at = coordinate.indexOf('@');
    const marketplaceName = at === -1 ? '' : coordinate.slice(at + 1);
    const pluginName = at === -1 ? coordinate : coordinate.slice(0, at);

    const known = readJson<KnownMarketplacesFile>(join(this.claudeHome, 'plugins', 'known_marketplaces.json'));
    const marketplace = known?.[marketplaceName];
    if (!marketplace?.installLocation) {
      throw new PackFetcherError(
        `marketplace "${marketplaceName}" is not known to this Claude Code install — run ` +
          `\`/plugin marketplace add <repo>\` first, then \`/plugin install ${coordinate}\`, or use --from <path>.`,
      );
    }

    const manifestPath = join(marketplace.installLocation, '.claude-plugin', 'marketplace.json');
    const manifest = readJson<RawMarketplaceManifest>(manifestPath);
    const plugin = manifest?.plugins?.find((p) => p.name === pluginName);
    if (!plugin) {
      throw new PackFetcherError(
        `plugin "${pluginName}" was not found in marketplace "${marketplaceName}"'s manifest (${manifestPath}).`,
      );
    }
    if (typeof plugin.source === 'string') {
      return resolve(marketplace.installLocation, plugin.source);
    }
    throw new PackFetcherError(
      `plugin "${coordinate}" is hosted externally (a remote source Claude Code fetches, not spectastic) — ` +
        `run \`/plugin install ${coordinate}\` in Claude Code first so it's cached locally, then retry ` +
        `\`corpus import\`, or use --from <path> to register an existing local checkout.`,
    );
  }
}
