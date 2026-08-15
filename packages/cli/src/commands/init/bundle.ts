import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pc from 'picocolors';
import type { BundleInventory } from './types.js';

/**
 * Resolve the bundle root, preferring the production location
 * (_bundled/ next to the compiled binary) and falling back to the
 * workspace root for dev mode when prebuild hasn't run.
 *
 * Per D-003 of specs/003-init-node-port/design.html.
 */
export function resolveBundle(): BundleInventory {
  const productionRoot = productionBundleRoot();
  if (existsSync(productionRoot)) {
    return inventoryAt(productionRoot, 'production');
  }
  const devRoot = devBundleRoot();
  if (devRoot && existsSync(devRoot)) {
    process.stderr.write(
      pc.dim(
        `init: dev fallback — using workspace root at ${devRoot} (run \`pnpm --filter @spectastic/cli build\` to populate _bundled/)\n`,
      ),
    );
    return inventoryAtDev(devRoot);
  }
  throw new Error(
    `init: bundle not found. Expected _bundled/ at ${productionRoot} or workspace root with commands/, assets/, templates/. Reinstall @spectastic/cli.`,
  );
}

/**
 * Resolve to `<package-root>/_bundled/`. The compiled binary lives at
 * `<package-root>/dist/index.js`; `import.meta.url` for THIS file (after
 * compilation) is `<package-root>/dist/index.js`, so `..` once → package root.
 */
function productionBundleRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, '..', '_bundled');
}

/**
 * Dev fallback: from `<package-root>/dist/` (or `src/commands/init/` in
 * tsx-driven dev) walk up to the workspace root where commands/, assets/,
 * templates/ live.
 */
function devBundleRoot(): string | null {
  const here = dirname(fileURLToPath(import.meta.url));
  // Try walking up to 6 levels looking for the workspace markers.
  let dir = here;
  for (let i = 0; i < 6; i++) {
    const commandsDir = join(dir, 'commands');
    const assetsDir = join(dir, 'assets');
    const templatesDir = join(dir, 'templates');
    if (existsSync(commandsDir) && existsSync(assetsDir) && existsSync(templatesDir)) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

/**
 * Walk a production bundle root (with `.claude/commands/`, `.claude/agents/`,
 * `assets/`, `templates/` already in the destination layout) and build the
 * inventory.
 */
function inventoryAt(root: string, origin: 'production' | 'dev-fallback'): BundleInventory {
  const files = [
    ...listFiles(root, '.claude/commands'),
    ...listFiles(root, '.claude/agents'),
    ...listFiles(root, 'assets'),
    ...remapKnowledgeScaffold(listFiles(root, 'templates')),
  ];
  return { root, origin, files };
}

/**
 * Walk a dev workspace root (with `commands/`, `agents/`, `assets/`,
 * `templates/`) and translate to the destination layout (commands/ →
 * .claude/commands/, agents/ → .claude/agents/).
 */
function inventoryAtDev(root: string): BundleInventory {
  const files = [
    // Source path uses `commands/`; destination path uses `.claude/commands/`.
    ...listFiles(root, 'commands').map((f) => ({
      source: f.source,
      relativeDestination: f.relativeDestination.replace(/^commands\//, '.claude/commands/'),
    })),
    // Same remap for the subagent definitions.
    ...listFiles(root, 'agents').map((f) => ({
      source: f.source,
      relativeDestination: f.relativeDestination.replace(/^agents\//, '.claude/agents/'),
    })),
    ...listFiles(root, 'assets'),
    ...remapKnowledgeScaffold(listFiles(root, 'templates')),
  ];
  return { root, origin: 'dev-fallback', files };
}

/**
 * The knowledge/ corpus scaffold (051-knowledge-corpus FR-006) is authored
 * under `templates/knowledge/` so prebuild bundles it with no config change
 * — but unlike every other `templates/` entry (a template a later
 * spec-authoring verb copies FROM), it must land as a real, immediately
 * usable `knowledge/` directory at project root, not nested inside the
 * user's `templates/` folder. Mirrors the `commands/` → `.claude/commands/`
 * remap above for the same reason: the source layout and the destination
 * layout intentionally diverge for one subtree.
 */
function remapKnowledgeScaffold(
  files: Array<{ source: string; relativeDestination: string }>,
): Array<{ source: string; relativeDestination: string }> {
  return files.map((f) => ({
    source: f.source,
    relativeDestination: f.relativeDestination.replace(/^templates\/knowledge\//, 'knowledge/'),
  }));
}

function listFiles(root: string, subdir: string): Array<{ source: string; relativeDestination: string }> {
  const out: Array<{ source: string; relativeDestination: string }> = [];
  const dir = join(root, subdir);
  if (!existsSync(dir)) return out;
  walk(dir, (file) => {
    out.push({
      source: file,
      relativeDestination: relative(root, file),
    });
  });
  return out;
}

function walk(dir: string, visitor: (file: string) => void): void {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) walk(full, visitor);
    else if (s.isFile()) visitor(full);
  }
}
