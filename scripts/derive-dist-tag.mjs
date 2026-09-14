#!/usr/bin/env node
// Derive the npm dist-tag set for a release (spec 004 FR-006).
//
// The rule is keyed on whether a STABLE release exists, not on the shape of the
// version string. While no bare-semver version has ever been published there is
// nothing safer for `latest` to point at, so a pre-release publishes directly to
// `latest` and the documented bare install (`npm i -g @spectastic/cli`) resolves
// to the newest build. Once a stable exists the guard engages by itself and
// pre-releases go to `next` only.
//
// Every branch resolves to exactly ONE tag — the tag the publish uses as its
// `--tag`, which OIDC authenticates. There is no second tag to mirror: under OIDC
// trusted publishing `npm dist-tag add` is not authenticated (only `npm publish`
// does the OIDC exchange), so the earlier "move `latest` alongside `next`" step is
// retired. While pre-stable this costs nothing — `next` and `latest` would name
// the same version anyway — and `next` simply stops updating until a stable ships.
//
// Keying on existence rather than the version string is deliberate: a
// version-string rule ("major is 0") would send 1.0.0-rc.1 to `next` only and
// re-freeze `latest` on the last 0.x pre-release for the whole RC window — the
// same bug, one version later.
//
// Promoted from the inline bash conditional in .github/workflows/publish.yml,
// which plan D-005 pre-authorised once the rule outgrew "contains a hyphen".
// The derivation is a pure function so every branch is unit-tested; only
// fetchPublishedVersions touches the network.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** A version is a pre-release when it carries a SemVer pre-release part. */
export function isPrerelease(version) {
  return version.includes('-');
}

/**
 * Resolve the dist-tags a publish of `version` should move.
 *
 * @param {string} version           the version being published
 * @param {string[]} publishedVersions  every version already on the registry
 * @returns {string[]} exactly one tag — the `--tag` the OIDC publish uses
 */
export function deriveDistTags(version, publishedVersions) {
  if (!isPrerelease(version)) return ['latest'];

  const hasStableRelease = publishedVersions.some((v) => !isPrerelease(v));
  return hasStableRelease ? ['next'] : ['latest'];
}

/**
 * Every version of `pkg` already published. Throws if the registry state cannot
 * be determined — FR-006 requires failing rather than guessing a tag. A package
 * that has never been published is not a failure: it resolves to no versions.
 */
export async function fetchPublishedVersions(pkg, run = execFileAsync) {
  try {
    const { stdout } = await run('npm', ['view', pkg, 'versions', '--json']);
    const parsed = JSON.parse(stdout);
    // npm returns a bare string when exactly one version exists.
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch (err) {
    const text = `${err?.stderr ?? ''}${err?.message ?? ''}`;
    if (text.includes('E404') || text.includes('404 Not Found')) return [];
    throw new Error(`could not determine published versions for ${pkg}: ${err?.message ?? err}`);
  }
}

/** CLI: derive-dist-tag.mjs <version> <pkg> — prints the tags, one per line. */
async function main(argv) {
  const [version, pkg] = argv;
  if (!version || !pkg) {
    process.stderr.write('usage: derive-dist-tag.mjs <version> <package>\n');
    process.exitCode = 2;
    return;
  }
  const tags = deriveDistTags(version, await fetchPublishedVersions(pkg));
  process.stdout.write(`${tags.join('\n')}\n`);
}

const invokedDirectly = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (invokedDirectly) {
  main(process.argv.slice(2)).catch((err) => {
    process.stderr.write(`${err.message}\n`);
    process.exitCode = 1;
  });
}
