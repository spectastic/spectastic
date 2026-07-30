/**
 * Kernel for `spectastic id <spec-id>` (spec 067-spec-project-identity, plan
 * D-003). Resolves the project identity (`@spectastic/corpus`'s
 * `resolveProjectConfig` — the fs reader FR-006 also feeds), confirms the
 * spec exists, and renders the canonical `spectastic://` resource URI via
 * the shared grammar (`@spectastic/schema/project`'s `specResourceUri`,
 * D-004) — FR-004/FR-005.
 *
 * Deliberately plain, not the elaborate `KernelContext`/injectable-`fs`
 * shape most core commands use: `resolveProjectConfig` is itself real-fs-only
 * (no injection seam), so wrapping it in `ctx.fs` would only add an
 * inconsistent extra layer for no testing benefit. A synchronous `cwd`
 * parameter, matching `resolveProjectConfig`'s own shape, is sufficient.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { resolveProjectConfig } from '@spectastic/corpus';
import { specResourceUri } from '@spectastic/schema/project';

export interface IdInput {
  specId: string;
  /** An optional requirement/task id to append as a `#` fragment (FR-004). */
  anchor?: string;
}

export interface IdResult {
  uri: string;
}

/** No `specs/<spec-id>` directory exists — the engine refuses rather than
 * fabricate a coordinate for a spec that isn't there (FR-005). */
export class UnknownSpecError extends Error {
  constructor(public readonly specId: string) {
    super(`No spec found at specs/${specId} — spectastic id only resolves a spec that exists.`);
    this.name = 'UnknownSpecError';
  }
}

/**
 * Resolve `input.specId` to its federation-unique `spectastic://` resource
 * URI. Deterministic: `resolveProjectConfig` reads only persisted config
 * (no live git/clock), so repeated calls against a fixed `cwd` return
 * byte-identical output (NFR-001, SC-002).
 */
export function idCommand(input: IdInput, cwd: string): IdResult {
  const specDir = join(cwd, 'specs', input.specId);
  if (!existsSync(specDir)) throw new UnknownSpecError(input.specId);

  const { project } = resolveProjectConfig(cwd);
  const uri = specResourceUri(project, input.specId, input.anchor);
  return { uri };
}
