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

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { loadRegistry, resolveProjectConfig } from '@spectastic/corpus';
import { contractCoordinateName, readContractDeclarations } from '@spectastic/schema/contract';
import { resourceUri, specResourceUri } from '@spectastic/schema/project';

/** The kinds `id` can address. Every kind in `RESOURCE_KINDS`, so the flag
 *  cannot silently lag the grammar. */
export type IdKind = 'spec' | 'screen' | 'contract' | 'corpus' | 'unit';

export interface IdInput {
  specId: string;
  /** Which kind the name denotes. Defaults to `spec`, so every existing
   *  invocation is unchanged. */
  kind?: IdKind;
  /** An optional requirement/task id to append as a `#` fragment (FR-004). */
  anchor?: string;
}

export interface IdResult {
  uri: string;
}

/** The named resource does not exist — the engine refuses rather than
 * fabricate a coordinate for something that isn't there (FR-005).
 *
 * Generalised past its original spec-only shape when `--kind` landed. The
 * refusal is the whole point of the command: a coordinate that resolves to
 * nothing is worse than no coordinate, because it is quotable. */
export class UnknownSpecError extends Error {
  constructor(
    public readonly specId: string,
    message?: string,
  ) {
    super(message ?? `No spec found at specs/${specId} — spectastic id only resolves a spec that exists.`);
    this.name = 'UnknownSpecError';
  }
}

/** Every `<spec-screen name>` declared behind a spec's declared screens path. */
function declaredScreenNames(cwd: string, specId: string): string[] {
  const design = join(cwd, 'specs', specId, 'design.html');
  if (!existsSync(design)) return [];
  const html = readFileSync(design, 'utf8');
  const screensPath = /<spec-visual\b[^>]*\bscreens=["']([^"']+)["']/i.exec(html)?.[1];
  if (screensPath === undefined) return [];
  const abs = join(cwd, screensPath);
  if (!existsSync(abs)) return [];
  const files = statSync(abs).isDirectory()
    ? readdirSync(abs)
        .filter((f) => f.endsWith('.html'))
        .map((f) => join(abs, f))
    : [abs];
  const names: string[] = [];
  for (const f of files) {
    for (const m of readFileSync(f, 'utf8').matchAll(/<spec-screen\b[^>]*>/gi)) {
      const name = /\bname="([^"]*)"/i.exec(m[0])?.[1];
      if (name !== undefined && name !== '') names.push(name);
    }
  }
  return names;
}

/**
 * Resolve `input.specId` to its federation-unique `spectastic://` resource
 * URI. Deterministic: `resolveProjectConfig` reads only persisted config
 * (no live git/clock), so repeated calls against a fixed `cwd` return
 * byte-identical output (NFR-001, SC-002).
 */
export function idCommand(input: IdInput, cwd: string): IdResult {
  const kind = input.kind ?? 'spec';
  const { project } = resolveProjectConfig(cwd);
  const name = input.specId;

  if (kind === 'spec') {
    if (!existsSync(join(cwd, 'specs', name))) throw new UnknownSpecError(name);
    return { uri: specResourceUri(project, name, input.anchor) };
  }

  if (kind === 'screen') {
    // `<spec-id>/<screen-name>` — two segments, because a screen's name is
    // unique within its spec and nowhere else.
    const slash = name.indexOf('/');
    if (slash === -1) {
      throw new UnknownSpecError(name, `A screen is addressed as <spec-id>/<name> — "${name}" names no spec.`);
    }
    const specId = name.slice(0, slash);
    const screenName = name.slice(slash + 1);
    if (!existsSync(join(cwd, 'specs', specId))) throw new UnknownSpecError(specId);
    if (!declaredScreenNames(cwd, specId).includes(screenName)) {
      throw new UnknownSpecError(
        name,
        `No screen addressed as "${screenName}" in specs/${specId} — check the screen's name=, which is separate from its id=.`,
      );
    }
    return { uri: resourceUri(project, 'screen', name, input.anchor) };
  }

  if (kind === 'contract') {
    // A contract is declared by a design, so the search is over designs. The
    // coordinate name prefers an explicit name= and falls back to the basename
    // (076 FR-007) — reused rather than re-derived, so `id` and the resolve
    // gate agree by construction.
    const specsDir = join(cwd, 'specs');
    const found = existsSync(specsDir)
      ? readdirSync(specsDir).some((d) => {
          const design = join(specsDir, d, 'design.html');
          if (!existsSync(design)) return false;
          return readContractDeclarations(readFileSync(design, 'utf8'), design).some(
            (decl) => (decl.coordinateName ?? contractCoordinateName(undefined, decl.path)) === name,
          );
        })
      : false;
    if (!found) {
      throw new UnknownSpecError(name, `No contract addressed as "${name}" is declared by any design under specs/.`);
    }
    return { uri: resourceUri(project, 'contract', name, input.anchor) };
  }

  if (kind === 'corpus') {
    // `<plugin>/<slug>`, checked against the registry that already owns which
    // documents exist and at which edition.
    if (!loadRegistry(cwd).some((e) => `${e.plugin}/${e.slug}` === name)) {
      throw new UnknownSpecError(name, `No corpus document addressed as "${name}" is in the registry.`);
    }
    return { uri: resourceUri(project, 'corpus', name, input.anchor) };
  }

  // `unit` is in RESOURCE_KINDS because 079 widened the grammar, but 079 itself
  // is unbuilt — there is no declared-unit reader to check against. Refusing is
  // the only honest answer: composing here would emit a coordinate this tool
  // cannot confirm denotes anything, which is precisely what FR-005 forbids.
  throw new UnknownSpecError(
    name,
    `The unit kind has no resolver yet, so a unit coordinate cannot be confirmed to denote anything. ` +
      `The grammar accepts it; nothing yet declares units.`,
  );
}
