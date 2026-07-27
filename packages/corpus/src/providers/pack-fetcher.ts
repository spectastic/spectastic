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
 * `RealPackFetcher` reads Claude Code's own cache for the common cases (an
 * installed plugin, or a string-sourced monorepo plugin in an added
 * marketplace). A plugin whose source is the object (remote) form is
 * git-cloned (061 FR-008 remote-source clone, triage T-001): the marketplace was added by
 * the user, so the URL in its manifest is within their trust boundary, and the
 * clone is hardened (shallow, no submodules, hooks disabled) and pinned to the
 * manifest's `sha` when present. The one network touch lives behind the
 * `GitRunner` seam so CI never clones (the `--from <path>` escape hatch still
 * bypasses fetching entirely). An unknown marketplace still errors — there is
 * no URL to clone from until `/plugin marketplace add`.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync } from 'node:fs';
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

/** A resolved remote git source for a plugin: the clone URL, an optional
 * immutable `sha` (preferred — pinning to it is the supply-chain integrity
 * win), an optional `ref` (tag/branch), and an optional `path` subdir the pack
 * lives under inside the repo. */
export interface GitSource {
  url: string;
  ref?: string;
  sha?: string;
  path?: string;
}

/**
 * The injectable git seam (061 FR-008 remote-source clone, triage T-001). A remote-sourced
 * plugin is fetched by cloning its git source; this interface is the only
 * thing that touches the network, so a test injects a fake that populates
 * `dest` from a fixture and CI never clones (the same stub-in-CI discipline
 * `PackFetcher` itself follows).
 */
export interface GitRunner {
  /**
   * Fetch `source` into the empty directory `dest`, hardened: shallow
   * (`--depth 1`), no tags, no submodule recursion, hooks disabled. Checks out
   * the pinned `sha` when given (immutable), else the `ref`, else the default
   * branch.
   */
  fetch(dest: string, source: GitSource): void;
}

/** The production `GitRunner` — shells to a hardened `git`. The one place
 * spectastic touches a network for `corpus import`; kept behind the seam so
 * it's never exercised in a test. */
export class RealGitRunner implements GitRunner {
  fetch(dest: string, source: GitSource): void {
    // `-c core.hooksPath=` neutralises any repo-supplied hook; a plain clone
    // never recurses submodules, so no remote code runs on a fetch.
    const hard = ['-c', 'core.hooksPath=/dev/null', '-c', 'advice.detachedHead=false'];
    const run = (args: string[], cwd?: string): void => {
      execFileSync('git', [...hard, ...args], { stdio: ['ignore', 'ignore', 'pipe'], ...(cwd ? { cwd } : {}) });
    };
    try {
      if (source.sha) {
        // Fetch exactly the pinned commit (GitHub allows reachable-SHA1 wants),
        // so the tree is byte-for-byte the reviewed one — never a moving ref.
        mkdirSync(dest, { recursive: true });
        run(['init', '-q', dest]);
        run(['remote', 'add', 'origin', source.url], dest);
        run(['fetch', '-q', '--depth', '1', 'origin', source.sha], dest);
        run(['checkout', '-q', source.sha], dest);
      } else if (source.ref) {
        run(['clone', '-q', '--depth', '1', '--no-tags', '--single-branch', '--branch', source.ref, source.url, dest]);
      } else {
        run(['clone', '-q', '--depth', '1', '--no-tags', '--single-branch', source.url, dest]);
      }
    } catch (err) {
      const rev = source.sha ?? source.ref;
      const at = rev ? `@${rev}` : '';
      const stderr = (err as { stderr?: Buffer }).stderr?.toString('utf8').trim();
      const detail = stderr ? `: ${stderr}` : '';
      throw new PackFetcherError(`git fetch of ${source.url}${at} failed${detail}`, { cause: err });
    }
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

/** Resolve a plugin's object `source` (the remote forms confirmed against the
 * real official + spectastic marketplaces) into a `GitSource`, or `null` if
 * the shape carries no usable URL:
 *  - `{source:'github', repo:'owner/name'}` → `https://github.com/owner/name.git`
 *  - `{source:'url'|'git-subdir', url, ref?, sha?, path?}` → its `url` (+ subdir).
 */
function parseGitSource(source: Record<string, unknown>): GitSource | null {
  const str = (v: unknown): string | undefined => (typeof v === 'string' && v.length > 0 ? v : undefined);
  const kind = str(source['source']);
  const ref = str(source['ref']);
  const sha = str(source['sha']);
  const path = str(source['path']);
  let url: string | undefined;
  if (kind === 'github') {
    const repo = str(source['repo']);
    if (repo) url = `https://github.com/${repo}.git`;
  } else {
    url = str(source['url']);
  }
  if (!url) return null;
  return { url, ...(ref ? { ref } : {}), ...(sha ? { sha } : {}), ...(path ? { path } : {}) };
}

/** A filesystem-safe cache key for a cloned pack — the coordinate plus the
 * exact revision, so a `sha`-pinned fetch is immutable-by-key (same sha → same
 * cached tree, reused; a new sha → a new dir). */
function cacheKey(coordinate: string, source: GitSource): string {
  const rev = source.sha ?? source.ref ?? 'HEAD';
  return `${coordinate}@${rev}`.replace(/[^\w.@-]+/g, '-');
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
  constructor(
    private readonly claudeHome: string = join(homedir(), '.claude'),
    private readonly gitRunner: GitRunner = new RealGitRunner(),
  ) {}

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

    // Remote (object) source: clone it (061 FR-008 remote-source clone, triage T-001). The
    // marketplace was added by the user via `/plugin marketplace add`, so the
    // URL in its manifest is already within their trust boundary; the fetch is
    // hardened + pinned to the manifest's `sha` when present. Cached under a
    // spectastic-managed dir keyed by coordinate + revision, so a repeat import
    // at the same sha reuses the clone offline.
    const gitSource = plugin.source && typeof plugin.source === 'object' ? parseGitSource(plugin.source) : null;
    if (!gitSource) {
      throw new PackFetcherError(
        `plugin "${coordinate}" has an unrecognised remote source in ${manifestPath} ` +
          `(no github repo or git url) — use --from <path> to register a local checkout.`,
      );
    }

    const cacheRoot = join(this.claudeHome, 'plugins', '.spectastic-cache');
    const cacheDir = join(cacheRoot, cacheKey(coordinate, gitSource));
    if (!existsSync(cacheDir) || readdirSync(cacheDir).length === 0) {
      // Clone into a sibling `.partial` then atomically rename, so an
      // interrupted clone never leaves a half-populated dir that a later run
      // would mistake for a cache hit.
      const partial = `${cacheDir}.partial`;
      rmSync(partial, { recursive: true, force: true });
      rmSync(cacheDir, { recursive: true, force: true });
      mkdirSync(cacheRoot, { recursive: true });
      this.gitRunner.fetch(partial, gitSource);
      renameSync(partial, cacheDir);
    }
    return gitSource.path ? join(cacheDir, gitSource.path) : cacheDir;
  }
}
