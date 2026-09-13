import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

/**
 * Drift-proof command adapters for `init --tools` (spec 031, US2 / plan D-001),
 * generalised to a second host target by spec 111-codex-skill-adapters (D-002).
 *
 * The `commands/spectastic.*.md` sources are the single source of truth. An
 * {@link AdapterTarget} says where its adapters land and how each source is
 * *rendered*: the Claude target's render is the identity (a verbatim copy, the
 * original 031 behaviour); the Codex target's render translates the command to
 * an Agent-Skills `SKILL.md` (lives in `adapters-codex.ts`, imported lazily so
 * the translator — and its `yaml` dependency — never loads on the `init` cold
 * path). A per-target `.spectastic-managed` marker scopes the drift gate to the
 * adapters this installer owns.
 *
 * Drift is unified as *render(source) ≠ on-disk*: for Claude the rendered
 * content is the source, so this is byte-for-byte with 031; for Codex it is the
 * freshly-translated skill. Determinism (111 NFR-001) is what makes the
 * comparison well-defined.
 */

/** Marks a target's dest dir as init-tools-managed (scopes the drift gate). */
export const MANAGED_MARKER = '.spectastic-managed';

const COMMAND_PATTERN = /^spectastic\..*\.md$/;

export interface RenderedAdapter {
  /** Path relative to the target's dest dir, e.g. `spectastic.spec.md` or `spectastic-spec/SKILL.md`. */
  readonly relPath: string;
  /** The adapter file's content. */
  readonly content: string;
}

export interface AdapterTarget {
  readonly id: 'claude' | 'codex';
  /** The dest dir relative to the project root, e.g. `.claude/commands`. */
  readonly destSubdir: string;
  /** Matches a top-level dest entry this target owns (for clean removal). */
  readonly owns: RegExp;
  /** Render one command source into its adapter file. Deterministic. */
  render(sourceMd: string, sourceFile: string): RenderedAdapter;
}

/** The default target — a verbatim `.claude/commands` copy (031 behaviour). */
export const CLAUDE_TARGET: AdapterTarget = {
  id: 'claude',
  destSubdir: '.claude/commands',
  owns: COMMAND_PATTERN,
  render: (sourceMd, sourceFile) => ({ relPath: basename(sourceFile), content: sourceMd }),
};

const sourceDir = (cwd: string): string => join(cwd, 'commands');
const destDir = (cwd: string, target: AdapterTarget): string => join(cwd, ...target.destSubdir.split('/'));

/** List `commands/spectastic.*.md` source basenames (empty if no source dir). */
export function adapterSources(cwd: string): string[] {
  const dir = sourceDir(cwd);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => COMMAND_PATTERN.test(f));
}

/** True when `init --tools` manages this project's adapters for `target`. */
export function adaptersManaged(cwd: string, target: AdapterTarget = CLAUDE_TARGET): boolean {
  return existsSync(join(destDir(cwd, target), MANAGED_MARKER));
}

/**
 * Render the adapters from source and stamp the manager marker. Idempotent: the
 * same source yields identical bytes. A project with no `commands/` source (a
 * consumer install, not the dev repo) generates nothing.
 */
export function generateAdapters(cwd: string, target: AdapterTarget = CLAUDE_TARGET): { generated: number } {
  const sources = adapterSources(cwd);
  if (sources.length === 0) return { generated: 0 };
  const dest = destDir(cwd, target);
  mkdirSync(dest, { recursive: true });
  for (const file of sources) {
    const src = readFileSync(join(sourceDir(cwd), file), 'utf8');
    const { relPath, content } = target.render(src, file);
    const out = join(dest, relPath);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, content, 'utf8');
  }
  writeFileSync(join(dest, MANAGED_MARKER), 'init --tools managed\n', 'utf8');
  return { generated: sources.length };
}

/** Remove the managed adapters this target owns + its marker (FR-010 / 031). */
export function removeAdapters(cwd: string, target: AdapterTarget = CLAUDE_TARGET): { removed: number } {
  const dest = destDir(cwd, target);
  if (!adaptersManaged(cwd, target)) return { removed: 0 };
  let removed = 0;
  for (const entry of readdirSync(dest)) {
    if (!target.owns.test(entry)) continue;
    rmSync(join(dest, entry), { recursive: true, force: true });
    removed += 1;
  }
  rmSync(join(dest, MANAGED_MARKER), { force: true });
  return { removed };
}

export interface DriftPair {
  /** Absolute path of the adapter on disk. */
  readonly adapter: string;
  /** Human-readable relative path for the finding. */
  readonly rel: string;
  /** What the adapter should be — render(source). Compared to what is on disk. */
  readonly expected: string;
}

/**
 * The (expected-content, on-disk-path) pairs the drift gate compares. Only
 * meaningful once adapters are managed. Rendering here is what generalises the
 * check to a translated target.
 */
export function driftPairs(cwd: string, target: AdapterTarget = CLAUDE_TARGET): DriftPair[] {
  const dest = destDir(cwd, target);
  const out: DriftPair[] = [];
  for (const file of adapterSources(cwd)) {
    let src: string;
    try {
      src = readFileSync(join(sourceDir(cwd), file), 'utf8');
    } catch {
      continue; // an unreadable source has nothing to compare against
    }
    const { relPath, content } = target.render(src, file);
    out.push({ adapter: join(dest, relPath), rel: `${target.destSubdir}/${relPath}`, expected: content });
  }
  return out;
}
