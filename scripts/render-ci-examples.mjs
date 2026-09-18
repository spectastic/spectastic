#!/usr/bin/env node
// Regenerate docs/ci-examples/*.yml from the CI-gate renderer (spec
// 121-init-ci-gate, FR-012). These are the same bytes `init --tools --ci`
// installs, less the marker and pinned to `@latest` instead of a specific
// version — the `example` render mode. Run after `pnpm --filter
// @spectastic/core build`; the drift guard (packages/core/test/ci.render.docs.test.ts)
// fails if these files and the renderer ever disagree.

import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(here, '..');

// The root workspace doesn't wire `@spectastic/core` as an importable package
// name for a root-level script (only member packages resolve it) — import the
// built dist file directly, the same way this repo's other root scripts reach
// into a package's build output rather than assuming the name resolves here.
const { renderCiWorkflow } = await import(resolve(REPO_ROOT, 'packages/core/dist/ci/render.js'));

const FILES = {
  github: resolve(REPO_ROOT, 'docs/ci-examples/github-actions.yml'),
  gitlab: resolve(REPO_ROOT, 'docs/ci-examples/gitlab-ci.yml'),
};

for (const [host, path] of Object.entries(FILES)) {
  const { content } = renderCiWorkflow(host, { cliVersion: 'latest', mode: 'example' });
  writeFileSync(path, content, 'utf8');
  process.stdout.write(`wrote ${path}\n`);
}
