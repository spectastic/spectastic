import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { renderCiWorkflow } from '../src/ci/render.js';

/**
 * `docs/ci-examples/*.yml` are generated, not hand-written (spec
 * 121-init-ci-gate, FR-012). This test is the drift guard: the committed
 * recipes must be byte-equal to the renderer's `example` mode, so they can
 * never diverge from what `init --tools` actually installs — the divergence
 * this spec's grounding stage found (the old GitLab recipe used `reports:
 * sast:`, which expects GitLab's own schema; the renderer correctly uses
 * `reports: sarif:`, per docs.gitlab.com/ci/yaml/artifacts_reports).
 */

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(here, '..', '..', '..');

describe('docs/ci-examples/*.yml', () => {
  it('github-actions.yml is byte-equal to the renderer\'s example mode', () => {
    const onDisk = readFileSync(resolve(REPO_ROOT, 'docs/ci-examples/github-actions.yml'), 'utf8');
    const rendered = renderCiWorkflow('github', { cliVersion: 'latest', mode: 'example' }).content;
    expect(onDisk).toBe(rendered);
  });

  it('gitlab-ci.yml is byte-equal to the renderer\'s example mode', () => {
    const onDisk = readFileSync(resolve(REPO_ROOT, 'docs/ci-examples/gitlab-ci.yml'), 'utf8');
    const rendered = renderCiWorkflow('gitlab', { cliVersion: 'latest', mode: 'example' }).content;
    expect(onDisk).toBe(rendered);
  });
});
