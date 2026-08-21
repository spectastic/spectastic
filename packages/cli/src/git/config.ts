/**
 * The `git.auto` config reader for the opt-in git layer (spec 026-git-strategy,
 * plan D-002). No config mechanism existed in the codebase before this slice, so
 * this introduces the smallest one that satisfies FR-004: a root `spectastic.json`
 * with a `git` section. An absent file or key means every value defaults — and the
 * single default that matters is `git.auto = off`, so a developer running their own
 * git flow is never surprised.
 *
 * Deliberately NOT a general config system: only the `git` section, read
 * synchronously (the file is tiny and read once per verb). The `init --tools`
 * sibling owns the writer half.
 */

import { readConfigFile } from '@spectastic/schema/config';
import type { GitAuto } from './index.js';

export class GitConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GitConfigError';
  }
}

/** `git.trailers` (spec 027-git-trailers, FR-001): attribution trailers in the
 * commit footer. Default `off`; takes effect only when `git.auto` commits. */
export type GitTrailers = 'off' | 'on';

export interface GitConfig {
  auto: GitAuto;
  trailers: GitTrailers;
}

const VALID_AUTO: readonly GitAuto[] = ['off', 'commit', 'branch+commit'];
const VALID_TRAILERS: readonly GitTrailers[] = ['off', 'on'];

/** The defaults applied when `spectastic.json` (or its `git` section) is absent. */
export const DEFAULT_GIT_CONFIG: GitConfig = { auto: 'off', trailers: 'off' };

/**
 * Read `<cwd>/spectastic.json` and extract the `git` section. Absent file →
 * defaults (off). Present-but-malformed JSON, or an out-of-range `git.auto`,
 * throws loudly (a config typo should fail fast, not silently disable the layer).
 */
export function loadGitConfig(cwd: string): GitConfig {
  // Reads through the canonical reader (086 FR-004). `'throw'` keeps this
  // module's loud-error policy, which the quieter readers depend on.
  let parsed: unknown;
  try {
    parsed = readConfigFile(cwd, 'throw');
  } catch (err) {
    throw new GitConfigError((err as Error).message);
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new GitConfigError('spectastic.json must contain a JSON object at its root.');
  }

  const git = (parsed as Record<string, unknown>).git;
  if (git === undefined) return { ...DEFAULT_GIT_CONFIG };
  if (git === null || typeof git !== 'object' || Array.isArray(git)) {
    throw new GitConfigError('spectastic.json "git" must be an object.');
  }

  const gitObj = git as Record<string, unknown>;

  const auto = gitObj.auto ?? 'off';
  if (typeof auto !== 'string' || !VALID_AUTO.includes(auto as GitAuto)) {
    throw new GitConfigError(
      `spectastic.json "git.auto" must be one of ${VALID_AUTO.join(', ')} (got ${JSON.stringify(auto)}).`,
    );
  }

  const trailers = gitObj.trailers ?? 'off';
  if (typeof trailers !== 'string' || !VALID_TRAILERS.includes(trailers as GitTrailers)) {
    throw new GitConfigError(
      `spectastic.json "git.trailers" must be one of ${VALID_TRAILERS.join(', ')} (got ${JSON.stringify(trailers)}).`,
    );
  }

  return { auto: auto as GitAuto, trailers: trailers as GitTrailers };
}
