/**
 * Temp-git-repo integration harness — specs/026-git-strategy/tasks.html T-002.
 *
 * The 026 git layer is CLI-side (`packages/cli/src/git/`), shells out to git via
 * `node:child_process.execFile` (plan D-003), and is proven by an integration test
 * that runs a real verb in a throwaway git repo with a stub AIProvider and asserts
 * the REAL branch + commit it produces (plan §2 Testing, D-001/D-005, SC-001..003).
 *
 * This module is the reusable harness those US1 tests (T-100..104) import. It is NOT
 * a test suite — it ships no `describe`/`test` blocks of its own.
 *
 * What it provides:
 *   - `createTmpGitRepo()` — an isolated OS-temp dir, `git init`-ed with a local
 *     `user.name`/`user.email` and an initial branch named `main`, so commits work in
 *     CI with no global git identity. Returns the repo path + state-reading helpers +
 *     a `runVerb()` runner + `cleanup()`.
 *   - State readers: `currentBranch()`, `headSubject()`, `isClean()`, `stagedPaths()`
 *     — enough to assert SC-001 (branch reservation), SC-002 (a developer's own git
 *     flow is untouched when off), SC-003 (no commit without a clean validate), and
 *     the scoped-staging rule (D-006: stage only the verb's paths, never `git add -A`).
 *   - `runVerb()` — runs a CLI verb against the repo with the stub AIProvider wired in
 *     via `SPECTASTIC_AI_STUB` (the repo's established stub-injection mechanism — see
 *     `createAIProvider()` in packages/cli/src/ai-factory.ts and the StubAIProvider in
 *     packages/core/src/providers/stub.ts). No second stub is invented.
 *   - `cleanup()` — `rm -rf` the temp dir, suitable for `afterEach`/`finally`.
 *
 * Git is invoked the exact same way the layer under test will invoke it
 * (`execFile('git', args, { cwd })`), so the harness and the layer agree on porcelain.
 *
 * No new dependencies — node built-ins only.
 */

import { execFile, execFileSync, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Path to the built CLI entry (`packages/cli/bin/spectastic`, an ESM shim that
 * imports `dist/index.js`). The CLI must be built (`pnpm -C packages/cli build`)
 * before these tests run — same precondition as the existing CLI integration tests.
 */
const CLI_BIN = resolve(here, '..', '..', 'packages', 'cli', 'bin', 'spectastic');

/**
 * The StubAIProvider script shape (mirrors `StubScript` in
 * packages/core/src/providers/stub.ts). Each method consumes its array in order.
 */
export interface StubScript {
  chat?: string[];
  ask?: Record<string, string>[];
  subagent?: { output: string }[];
}

/** Result of spawning a CLI verb against the temp repo. */
export interface VerbResult {
  stdout: string;
  stderr: string;
  /** Process exit code; 0 on success. */
  code: number;
}

/** Options for {@link TmpGitRepo.runVerb}. */
export interface RunVerbOptions {
  /**
   * Stub AIProvider responses. When given, the script is written into the repo
   * and `SPECTASTIC_AI_STUB` is pointed at it so the verb runs deterministically
   * without `ANTHROPIC_API_KEY` (the repo's stub-injection contract). Omit to run
   * a verb that needs no AI (e.g. asserting the off-path / config gate).
   */
  stub?: StubScript;
  /** Extra environment variables, merged over `process.env`. */
  env?: Record<string, string>;
}

/** A throwaway git repo plus helpers to drive it and read its state back. */
export interface TmpGitRepo {
  /** Absolute path to the repo root (and the verb's cwd). */
  readonly dir: string;

  /**
   * Run a `spectastic` verb against this repo with the stub AIProvider wired in.
   * Resolves with the captured stdout/stderr/exit-code; never rejects on a
   * non-zero exit (the test asserts the code), only on spawn failure.
   */
  runVerb(args: string[], options?: RunVerbOptions): Promise<VerbResult>;

  /**
   * Run an arbitrary git porcelain command in the repo and return trimmed stdout.
   * Escape hatch for assertions the named readers below don't cover. Throws on a
   * non-zero git exit.
   */
  git(...args: string[]): Promise<string>;

  /**
   * Current branch name. Uses `git symbolic-ref --short HEAD` so it works on an
   * UNBORN branch too (a fresh `git init` with no commit yet — the SC-002 case
   * where git is off and the verb makes no commit; `rev-parse --abbrev-ref HEAD`
   * errors there). Falls back to the short HEAD sha when detached.
   */
  currentBranch(): Promise<string>;

  /**
   * Subject line of the HEAD commit (`git log -1 --format=%s`). Throws if there
   * is no commit yet — guard with a try/finally or assert a commit was expected.
   */
  headSubject(): Promise<string>;

  /** Number of commits reachable from HEAD; `0` when the repo has no commits. */
  commitCount(): Promise<number>;

  /** True when the working tree + index are clean (`git status --porcelain` empty). */
  isClean(): Promise<boolean>;

  /**
   * Paths currently staged in the index (added/modified/renamed vs HEAD), so a test
   * can assert scoped staging (D-006) — that only the verb's reported paths landed
   * and unrelated dirty files stayed out. Empty when nothing is staged.
   */
  stagedPaths(): Promise<string[]>;

  /**
   * Write a file relative to the repo root (creating parent dirs is the caller's
   * job — pass a flat path, or use {@link git} for anything fancier). Convenience
   * for seeding an unrelated dirty working-tree file in the scoped-staging test.
   */
  writeFile(relPath: string, contents: string): void;

  /**
   * Seed a minimal spectastic project (spectastic.json, a commands/ source, and
   * an Accepted + a Draft spec artifact) so `init --tools` (spec 031) has a real
   * project to install into. Parent dirs are created automatically.
   */
  seedProject(): void;

  /** `rm -rf` the temp dir. Idempotent; safe to call in `afterEach`/`finally`. */
  cleanup(): void;
}

/**
 * Create an isolated temp git repo. Caller MUST `cleanup()` when done
 * (typically in an `afterEach` or a `try/finally`).
 */
export function createTmpGitRepo(): TmpGitRepo {
  const dir = mkdtempSync(join(tmpdir(), 'spectastic-git-026-'));

  // git() must exist before init runs the config commands below; declare it first.
  const git = async (...args: string[]): Promise<string> => {
    const { stdout } = await execFileAsync('git', args, { cwd: dir });
    return stdout.trim();
  };

  // Initialise with an explicit `main` so the test is independent of the host's
  // `init.defaultBranch`, and set a repo-local identity so commits succeed in CI
  // where no global git identity is configured.
  initRepoSync(dir);

  const runVerb = async (args: string[], options: RunVerbOptions = {}): Promise<VerbResult> => {
    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
      // Default the key empty so a stray real key in the dev env can't leak into a
      // test run; the stub path below overrides the provider entirely when present.
      ANTHROPIC_API_KEY: '',
      ...(options.env ?? {}),
    };
    if (options.stub) {
      const scriptPath = join(dir, '.stub-ai.json');
      writeFileSync(scriptPath, JSON.stringify(options.stub), 'utf8');
      env['SPECTASTIC_AI_STUB'] = scriptPath;
    }
    return spawnNode([CLI_BIN, ...args], dir, env);
  };

  const currentBranch = async (): Promise<string> => {
    try {
      // Works on an unborn branch (no commit yet); reports the branch ref name.
      return await git('symbolic-ref', '--short', 'HEAD');
    } catch {
      // Detached HEAD → no symbolic ref; report the short sha instead.
      return git('rev-parse', '--short', 'HEAD');
    }
  };

  const headSubject = () => git('log', '-1', '--format=%s');

  const commitCount = async (): Promise<number> => {
    try {
      const out = await git('rev-list', '--count', 'HEAD');
      return Number.parseInt(out, 10) || 0;
    } catch {
      // No commits yet → `rev-list HEAD` errors; report zero.
      return 0;
    }
  };

  const isClean = async (): Promise<boolean> => {
    const out = await git('status', '--porcelain');
    return out.length === 0;
  };

  const stagedPaths = async (): Promise<string[]> => {
    // --cached = index vs HEAD; --name-only = bare paths; -z would need parsing,
    // newline split is fine for test fixtures (no embedded newlines in paths).
    let out: string;
    try {
      out = await git('diff', '--cached', '--name-only');
    } catch {
      // Pre-first-commit there's no HEAD to diff against; fall back to the index.
      out = await git('diff', '--cached', '--name-only', '--no-renames', '4b825dc642cb6eb9a060e54bf8d69288fbee4904');
    }
    return out.length === 0 ? [] : out.split('\n');
  };

  const writeFile = (relPath: string, contents: string): void => {
    const abs = resolve(dir, relPath);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, contents, 'utf8');
  };

  /**
   * Seed a minimal spectastic project into the repo — a `spectastic.json`, a
   * `commands/spectastic.spec.md` source, and two spec artifacts (one Accepted,
   * one Draft) — enough for the 031 `init --tools` tests to install into and for
   * the gate to have both a status that gates open questions and one that doesn't.
   */
  const seedProject = (): void => {
    writeFile('spectastic.json', JSON.stringify({ version: 1 }, null, 2));
    writeFile(
      'commands/spectastic.spec.md',
      '---\ndescription: Write a feature specification.\ntriggers: [spec]\nuse-when: "starting a feature"\nsibling-boundary: "not plan"\n---\n\n# spectastic.spec\n',
    );
    const artifact = (status: string, body: string): string =>
      `<!doctype html><html><head><meta charset="utf-8"><title>t</title></head><body><main>` +
      `<header><spec-meta><b>Status</b><span><spec-status value="${status}">${status}</spec-status></span></spec-meta></header>` +
      `${body}</main></body></html>`;
    writeFile('specs/900-accepted/spec.html', artifact('accepted', '<section id="questions"><spec-questions><p>None.</p></spec-questions></section>'));
    writeFile('specs/901-draft/spec.html', artifact('draft', '<section id="questions"><spec-questions><p>None.</p></spec-questions></section>'));
  };

  const cleanup = (): void => {
    rmSync(dir, { recursive: true, force: true });
  };

  return {
    dir,
    runVerb,
    git,
    currentBranch,
    headSubject,
    commitCount,
    isClean,
    stagedPaths,
    writeFile,
    seedProject,
    cleanup,
  };
}

/** Synchronous `git init` + local identity, so the repo is usable the moment
 * {@link createTmpGitRepo} returns (no await needed at the call site). */
function initRepoSync(dir: string): void {
  // execFileSync via the child_process require keeps this file's async surface
  // clean while the constructor stays synchronous.
  const run = (args: string[]): void => {
    execFileSync('git', args, { cwd: dir, stdio: 'pipe' });
  };
  run(['init', '--initial-branch=main']);
  run(['config', 'user.name', 'Spectastic Test']);
  run(['config', 'user.email', 'test@spectastic.invalid']);
  // Keep commits deterministic and free of signing prompts in CI.
  run(['config', 'commit.gpgsign', 'false']);
}

/**
 * Spawn `node <args>` in `cwd`, capturing stdout/stderr. Resolves with the exit
 * code (never rejects on non-zero) — matches the existing CLI integration tests'
 * `runCLI` so assertions read the same way.
 */
function spawnNode(args: string[], cwd: string, env: Record<string, string>): Promise<VerbResult> {
  return new Promise<VerbResult>((resolveFn) => {
    const child = spawn('node', args, { cwd, env });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('close', (code: number | null) => resolveFn({ stdout, stderr, code: code ?? 0 }));
  });
}
