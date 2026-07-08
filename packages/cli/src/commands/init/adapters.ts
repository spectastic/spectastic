import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, join } from 'node:path';

/**
 * Drift-proof Claude Code command adapters for `init --tools` (spec 031, US2 /
 * plan D-001). The installed `.claude/commands/spectastic.*.md` are generated
 * from the `commands/spectastic.*.md` source verbatim (FR-008), and a manager
 * marker records that they are init-tools-managed — so the `commands-drift`
 * gate (validate) only judges adapters this installer owns, never a project's
 * hand-managed `.claude/commands`.
 *
 * Generate-on-demand realises FR-007's "can't ship stale": the drift gate blocks
 * a commit while a managed adapter diverges from source; regenerating (re-running
 * `init --tools --commands-only`) clears it.
 */

const ADAPTER_PATTERN = /^spectastic\..*\.md$/;
/** Marks `.claude/commands` as init-tools-managed (scopes the drift gate). */
export const MANAGED_MARKER = '.spectastic-managed';

const sourceDir = (cwd: string): string => join(cwd, 'commands');
const adapterDir = (cwd: string): string => join(cwd, '.claude', 'commands');

/** True when `init --tools` manages this project's command adapters. */
export function adaptersManaged(cwd: string): boolean {
  return existsSync(join(adapterDir(cwd), MANAGED_MARKER));
}

/** List `commands/spectastic.*.md` source basenames (empty if no source dir). */
export function adapterSources(cwd: string): string[] {
  const dir = sourceDir(cwd);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => ADAPTER_PATTERN.test(f));
}

/**
 * Generate the adapters from source verbatim and stamp the manager marker.
 * Idempotent: re-running rewrites identical content (FR-001). A project with no
 * `commands/` source (a consumer install, not the dev repo) generates nothing.
 */
export function generateAdapters(cwd: string): { generated: number } {
  const sources = adapterSources(cwd);
  if (sources.length === 0) return { generated: 0 };
  const dest = adapterDir(cwd);
  mkdirSync(dest, { recursive: true });
  for (const file of sources) {
    writeFileSync(join(dest, file), readFileSync(join(sourceDir(cwd), file), 'utf8'), 'utf8');
  }
  writeFileSync(join(dest, MANAGED_MARKER), 'init --tools managed (spec 031)\n', 'utf8');
  return { generated: sources.length };
}

/** Remove the managed adapters + the marker (FR-010). Leaves a project's own,
 *  non-managed `.claude/commands` untouched when there is no marker. */
export function removeAdapters(cwd: string): { removed: number } {
  const dest = adapterDir(cwd);
  if (!adaptersManaged(cwd)) return { removed: 0 };
  let removed = 0;
  for (const file of readdirSync(dest)) {
    if (ADAPTER_PATTERN.test(file)) {
      rmSync(join(dest, file));
      removed += 1;
    }
  }
  rmSync(join(dest, MANAGED_MARKER), { force: true });
  return { removed };
}

/**
 * Pairs of (source path, expected adapter path, basename) for the drift gate to
 * compare. Only meaningful once adapters are managed.
 */
export function driftPairs(cwd: string): { source: string; adapter: string; rel: string }[] {
  return adapterSources(cwd).map((file) => ({
    source: join(sourceDir(cwd), file),
    adapter: join(adapterDir(cwd), file),
    rel: `.claude/commands/${basename(file)}`,
  }));
}
