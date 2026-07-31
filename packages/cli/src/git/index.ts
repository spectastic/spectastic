/**
 * The opt-in git layer (spec 026-git-strategy). A CLI-side module each
 * `register<Verb>` action calls at its tail — after the existing P-6 state-gate
 * passes and the artifact is written — to project the lifecycle onto git:
 * branch = spec slice, commit = `<verb>(NNN): <subject>` (plan D-001).
 *
 * The layer is strictly a projection: it reads artifacts + config and writes
 * git, never mutating an artifact, and it composes AFTER the state-gate and the
 * explore quarantine — reading those signals, never relaxing them (FR-008).
 */

import { loadGitConfig } from './config.js';
import { branchName, commitSubject, shouldCreateBranch } from './derive.js';
import { type GitRunner, gitRunner, type Trailer } from './run.js';
import { gatherTrailers } from './trailers.js';

/** The `git.auto` config switch (spec 026 §4; default `off`, FR-004). */
export type GitAuto = 'off' | 'commit' | 'branch+commit';

/** The eight lifecycle verbs the layer can commit for (the small verb surface). */
export type Verb = 'spec' | 'design' | 'tasks' | 'implement' | 'propose' | 'apply' | 'triage' | 'principles';

/**
 * What a verb action hands the layer. The action already knows its verb, the
 * spec id in the artifact it wrote, and the exact paths it touched — staging is
 * scoped to `paths`, never `git add -A` (D-006), so a commit can't sweep
 * unrelated working-tree changes.
 */
export interface CommitContext {
  /** The lifecycle verb that just ran. */
  verb: Verb;
  /** The repository working directory. */
  cwd: string;
  /** The spec id from the artifact (`NNN-slug`), the commit scope + branch base. */
  specId: string;
  /** The files/dirs this verb wrote or moved — the only paths staged. */
  paths: string[];
  /** The human-readable subject tail (e.g. the spec title); the verb derives `<subject>`. */
  subject: string;
  /** Whether this is a brand-new slice (spec authoring), which may open a branch. */
  newSlice?: boolean;
  /** Per-invocation override of the configured `git.auto` (`--commit` / `--no-commit`, FR-004). */
  override?: 'commit' | 'no-commit';
  /** Provenance link for the `Refs` trailer — the archived proposal/changelog (apply). */
  refs?: string;
  /** The assisting model for `Assisted-by` — set only by AI-coupled verbs (spec 027). */
  model?: string;
  /** The risk-pass dispositioner for `Acked-by` — set by apply (spec 027). */
  dispositioner?: string;
  /** Injected runner (tests); defaults to a real `git` runner over `cwd`. */
  runner?: GitRunner;
}

/** The outcome of a `commitForVerb` call — what (if anything) the layer did. */
export interface CommitOutcome {
  /** True when a commit was created. */
  committed: boolean;
  /** The branch created/switched to, when under `branch+commit`. */
  branch?: string;
  /** The commit subject written, when `committed`. */
  commitSubject?: string;
  /** True when the validate gate refused the commit (FR-001) — caller surfaces loudly. */
  validateFailed?: boolean;
  /** Why the layer did nothing (off, `--no-commit`, or validate refusal). */
  reason?: string;
}

/** Map commander's `--commit`/`--no-commit` boolean to the layer's override (FR-004). */
export function parseCommitOverride(commit?: boolean): 'commit' | 'no-commit' | undefined {
  if (commit === true) return 'commit';
  if (commit === false) return 'no-commit';
  return undefined;
}

/** The slug portion of a spec id (`026-git-strategy` → `git-strategy`), else the id. */
export function slugOf(specId: string): string {
  return specId.replace(/^\d+-/, '') || specId;
}

/**
 * The shared tail every verb action calls after writing its artifact: run the
 * git layer and `process.exit` with its suggested code (0 unless the validate
 * gate refused a requested commit). Spec-less verbs pass `specId: ''` to get the
 * unscoped subject (FR-002/FR-007). Keeps the seven verb wirings to one line each.
 */
export async function commitVerbAndExit(opts: {
  verb: Verb;
  cwd: string;
  specId: string;
  paths: string[];
  subject: string;
  newSlice?: boolean;
  commit?: boolean;
  /** Provenance for the `Refs` trailer (apply). */
  refs?: string;
  /** The assisting model for `Assisted-by` (AI-coupled verbs). */
  model?: string;
  /** The risk-pass dispositioner for `Acked-by` (apply). */
  dispositioner?: string;
}): Promise<never> {
  const override = parseCommitOverride(opts.commit);
  const outcome = await commitForVerb({
    verb: opts.verb,
    cwd: opts.cwd,
    specId: opts.specId,
    paths: opts.paths,
    subject: opts.subject,
    newSlice: opts.newSlice ?? false,
    ...(override ? { override } : {}),
    ...(opts.refs === undefined ? {} : { refs: opts.refs }),
    ...(opts.model === undefined ? {} : { model: opts.model }),
    ...(opts.dispositioner === undefined ? {} : { dispositioner: opts.dispositioner }),
  });
  process.exit(reportGitOutcome(outcome));
}

/** Resolve the effective `git.auto` from config + a per-invocation override (FR-004). */
export function effectiveAuto(configured: GitAuto, override?: 'commit' | 'no-commit'): GitAuto {
  if (override === 'no-commit') return 'off';
  if (override === 'commit') return configured === 'off' ? 'commit' : configured;
  return configured;
}

/**
 * Run `validate` over the written artifact(s) AND scan the repo's quarantine
 * markers, in-process (plan D-005). Returns the count of error-severity
 * findings; > 0 means the commit must be refused (FR-001/FR-008). Mirrors what
 * the CLI `validate` action does, so a quarantined exploration can't slip
 * through. Imported lazily so the off-path never pays parse5's cold start.
 */
async function countBlockingFindings(cwd: string, paths: string[]): Promise<number> {
  const htmlFiles = paths.filter((p) => p.endsWith('.html'));
  const [{ validateCommand }, { quarantineFinding }, { expandGlobs }, { readFile }] = await Promise.all([
    import('@spectastic/core/commands/validate'),
    import('@spectastic/core/commands/explore'),
    import('../glob.js'),
    import('node:fs/promises'),
  ]);

  let errors = 0;
  if (htmlFiles.length > 0) {
    const result = await validateCommand({ files: htmlFiles }, { cwd });
    errors += result.findings.filter((f) => f.severity === 'error').length;
  }

  // Quarantine leg (FR-008): an un-graduated exploration must not ship.
  const markers = await expandGlobs([`${cwd}/explorations/**/quarantine.json`]);
  for (const file of markers) {
    try {
      const marker = JSON.parse(await readFile(file, 'utf8')) as {
        id?: string;
        status?: string;
      };
      if (quarantineFinding(marker, file)) errors += 1;
    } catch {
      errors += 1; // a corrupt/unreadable marker still signals a live exploration
    }
  }
  return errors;
}

/**
 * Project a just-completed verb onto git (FR-001..FR-008). Order: resolve the
 * effective auto → off short-circuits → validate gate refuses on any finding →
 * [branch under branch+commit for a new slice] → stage the scoped paths →
 * commit `<verb>(NNN): <subject>`.
 */
export async function commitForVerb(ctx: CommitContext): Promise<CommitOutcome> {
  const cfg = loadGitConfig(ctx.cwd);
  const auto = effectiveAuto(cfg.auto, ctx.override);
  if (auto === 'off') return { committed: false, reason: 'git.auto=off' };

  // Validate gate — the commit is the reward for a clean verb (FR-001/FR-008).
  const blocking = await countBlockingFindings(ctx.cwd, ctx.paths);
  if (blocking > 0) {
    return {
      committed: false,
      validateFailed: true,
      reason: `validate found ${blocking} error-severity finding(s) — not committing`,
    };
  }

  const runner = ctx.runner ?? gitRunner(ctx.cwd);

  let branch: string | undefined;
  if (shouldCreateBranch(ctx.verb, auto, ctx.newSlice ?? false)) {
    branch = branchName(ctx.specId);
    await runner.createBranch(branch);
  }

  await runner.add(ctx.paths);
  const subject = commitSubject(ctx.verb, ctx.specId, ctx.subject);

  // Attribution trailers (spec 027) — only when git.trailers=on.
  const trailers = cfg.trailers === 'on' ? await gatherCommitTrailers(ctx, runner) : [];
  await runner.commit(subject, trailers);

  return {
    committed: true,
    commitSubject: subject,
    ...(branch ? { branch } : {}),
  };
}

/**
 * Gather the attribution trailers for a commit (spec 027): read the artifact's
 * `<spec-meta>` (Owner/Author/Reviewers), the local committer, and the verb's
 * provenance/model/dispositioner from the context. The spec.html is the meta
 * source — the verb's own html path, else `specs/<specId>/spec.html`. A missing
 * source yields no meta (and so no human trailers), never an error.
 */
async function gatherCommitTrailers(ctx: CommitContext, runner: GitRunner): Promise<Trailer[]> {
  const [{ extractSpecMetadata }, { readFile }, { join }] = await Promise.all([
    import('@spectastic/schema'),
    import('node:fs/promises'),
    import('node:path'),
  ]);

  // Attribution (Owner/Reviewers) lives on the spec, so the spec.html is the
  // canonical source whatever verb is committing; spec-less verbs (no specId)
  // fall back to the verb's own html, if any.
  const htmlPath = ctx.specId
    ? join(ctx.cwd, 'specs', ctx.specId, 'spec.html')
    : ctx.paths.find((p) => p.endsWith('.html'));

  let meta: {
    owner: string | null;
    author: string | null;
    reviewers: string | null;
  } = {
    owner: null,
    author: null,
    reviewers: null,
  };
  if (htmlPath) {
    try {
      const md = extractSpecMetadata(await readFile(htmlPath, 'utf8'));
      meta = { owner: md.owner, author: md.author, reviewers: md.reviewers };
    } catch {
      // no readable artifact meta → no human trailers (FR-010)
    }
  }

  const committer = await runner.committer();
  return gatherTrailers({
    meta,
    committer,
    refs: ctx.refs,
    model: ctx.model,
    dispositioner: ctx.dispositioner,
  });
}

/**
 * Surface a `commitForVerb` outcome on the CLI: a one-line confirmation on
 * success, a loud notice on a validate refusal (FR-001). Returns a suggested
 * exit code: non-zero only when the gate refused a requested commit.
 */
export function reportGitOutcome(
  outcome: CommitOutcome,
  write: (s: string) => void = (s) => process.stderr.write(s),
): number {
  if (outcome.committed) {
    const onBranch = outcome.branch ? ` on ${outcome.branch}` : '';
    write(`git: committed ${JSON.stringify(outcome.commitSubject)}${onBranch}.\n`);
    return 0;
  }
  if (outcome.validateFailed) {
    write(`git: NOT committed — ${outcome.reason}. Fix the artifact and re-run, or commit by hand.\n`);
    return 1;
  }
  return 0; // off / --no-commit: silent, nothing to surface
}
