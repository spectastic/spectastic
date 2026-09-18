import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The CLI's own installed version (spec 121-init-ci-gate, D-005). Lifted out of
 * `index.ts` so a second caller — the CI-gate drift scan in
 * `commands/validate.ts`, which runs inside a helper function with no
 * `Command` instance in reach, and `scripts/render-ci-examples.mjs`, which has
 * no commander at all — can read it without threading `program.version()`
 * through three call sites.
 *
 * The path resolves from the compiled `dist/version.js` (production install)
 * and from `src/version.ts` (dev), both of which sit one level under the
 * package root — the same resolution `index.ts` already relied on.
 */
export function cliVersion(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const pkg = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8')) as {
    version: string;
  };
  return pkg.version;
}
