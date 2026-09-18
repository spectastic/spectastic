import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { describe, expect, it } from 'vitest';
import { firstInternalId } from '../src/commands/validate.js';
import {
  CI_ARTIFACT_GLOBS,
  CI_FILE_PATHS,
  CI_MANAGED_MARKER,
  CI_NODE_VERSION,
  type CiHost,
  isCiManaged,
  renderCiWorkflow,
} from '../src/ci/render.js';

/** Unit tests for the CI gate renderer (spec 121-init-ci-gate, T-010 / T-200). */

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(here, '..', '..', '..');
const CLI_ENGINES_NODE = JSON.parse(
  readFileSync(resolve(REPO_ROOT, 'packages/cli/package.json'), 'utf8'),
) as { engines: { node: string } };

const HOSTS: CiHost[] = ['github', 'gitlab'];
const VERSION = '3.2.1';

describe('renderCiWorkflow', () => {
  it('is deterministic — two renders of the same input are byte-identical (NFR-001)', () => {
    for (const host of HOSTS) {
      const a = renderCiWorkflow(host, { cliVersion: VERSION });
      const b = renderCiWorkflow(host, { cliVersion: VERSION });
      expect(a.content).toBe(b.content);
      expect(a.relPath).toBe(CI_FILE_PATHS[host]);
    }
  });

  it('parses as YAML on both hosts (NFR-002)', () => {
    for (const host of HOSTS) {
      const { content } = renderCiWorkflow(host, { cliVersion: VERSION });
      expect(() => parseYaml(content)).not.toThrow();
    }
  });

  it('pins the version on all 3 CLI steps per host (NFR-002)', () => {
    // Count only executable lines — a commented example line (the FR-012-adjacent
    // "pass your own enforcer output" hint) may repeat the pin without being a
    // fourth step, per the spec's out-of-scope note.
    for (const host of HOSTS) {
      const { content } = renderCiWorkflow(host, { cliVersion: VERSION });
      const executable = content
        .split('\n')
        .filter((line) => !line.trim().startsWith('#'))
        .join('\n');
      const matches = executable.match(new RegExp(`@spectastic/cli@${VERSION}`, 'g'));
      expect(matches?.length).toBe(3);
    }
  });

  it('carries the marker on line 1 in managed mode', () => {
    for (const host of HOSTS) {
      const { content } = renderCiWorkflow(host, { cliVersion: VERSION, mode: 'managed' });
      expect(content.split('\n')[0]).toBe(CI_MANAGED_MARKER);
    }
  });

  it('carries no marker and pins @latest in example mode', () => {
    for (const host of HOSTS) {
      const { content } = renderCiWorkflow(host, { cliVersion: 'latest', mode: 'example' });
      expect(content.split('\n')[0]).not.toBe(CI_MANAGED_MARKER);
      expect(content).toContain('@spectastic/cli@latest');
      expect(content).not.toContain(CI_MANAGED_MARKER);
    }
  });

  it('defaults to managed mode when mode is omitted', () => {
    const { content } = renderCiWorkflow('github', { cliVersion: VERSION });
    expect(content.split('\n')[0]).toBe(CI_MANAGED_MARKER);
  });

  it('runs every gate step regardless of an earlier step\'s outcome', () => {
    for (const host of HOSTS) {
      const { content } = renderCiWorkflow(host, { cliVersion: VERSION });
      if (host === 'github') {
        // GitHub: every step after the first carries a run-regardless condition.
        const cancelledCount = (content.match(/!cancelled\(\)/g) ?? []).length;
        expect(cancelledCount).toBeGreaterThanOrEqual(3);
      } else {
        // GitLab: one script accumulates a failure flag across all three commands
        // rather than an `if:` per step — the run-regardless property is that no
        // command short-circuits the ones after it.
        expect(content).toMatch(/FAILED/);
      }
    }
  });

  it('T-200: isolates each named step — enforce, verdict, and both uploads all run independent of validate\'s exit', () => {
    // GitHub: name each step and assert its own run-regardless condition —
    // not just a raw count, so a step silently missing its condition (while
    // some other step's count kept the total the same) would be caught.
    const { content: gh } = renderCiWorkflow('github', { cliVersion: VERSION });
    const ghSteps = gh.split(/^      - name: /m).slice(1); // one chunk per named step
    const stepBody = (namePrefix: string): string => {
      const chunk = ghSteps.find((s) => s.startsWith(namePrefix));
      expect(chunk, `no GitHub step named "${namePrefix}…"`).toBeDefined();
      return chunk ?? '';
    };
    expect(stepBody('Upload findings to code scanning')).toMatch(/if: \$\{\{ !cancelled\(\) \}\}/);
    expect(stepBody('Enforce the profile floor')).toMatch(/if: \$\{\{ !cancelled\(\) \}\}/);
    expect(stepBody('Merge verdict for the changed paths')).toMatch(/if: \$\{\{ !cancelled\(\) && /);
    expect(stepBody('Upload the verdict')).toMatch(/if: \$\{\{ !cancelled\(\) && /);
    expect(stepBody('Upload the verdict')).toMatch(/if-no-files-found: ignore/);

    // GitLab: the SARIF report and the verdict artifact are both declared
    // `when: always`, and the script's own `|| FAILED=1` per command is what
    // stops one command's non-zero exit from skipping the next (no `&&` chain).
    const { content: gl } = renderCiWorkflow('gitlab', { cliVersion: VERSION });
    expect(gl).toMatch(/artifacts:\s*\n\s*when: always/);
    expect(gl).toMatch(/validate .* \|\| FAILED=1/);
    expect(gl).toMatch(/enforce \|\| FAILED=1/);
    expect(gl).not.toMatch(/&&\s*npx/); // no command is gated on the previous one's success
  });

  it('carries 0 internal ids anywhere in the rendered content (NFR-003)', () => {
    for (const host of HOSTS) {
      for (const mode of ['managed', 'example'] as const) {
        const { content } = renderCiWorkflow(host, { cliVersion: VERSION, mode });
        expect(firstInternalId(content)).toBeNull();
      }
    }
  });

  it('CI_NODE_VERSION satisfies the CLI\'s own engines.node floor', () => {
    expect(CLI_ENGINES_NODE.engines.node).toBe('>=20');
    expect(Number(CI_NODE_VERSION)).toBeGreaterThanOrEqual(20);
  });

  it('renders the artifact globs the pre-commit hook also validates', () => {
    const { content } = renderCiWorkflow('github', { cliVersion: VERSION });
    for (const glob of CI_ARTIFACT_GLOBS) {
      expect(content).toContain(glob);
    }
  });
});

describe('isCiManaged', () => {
  it('is true only when the first line is the exact marker', () => {
    expect(isCiManaged(`${CI_MANAGED_MARKER}\nname: spectastic\n`)).toBe(true);
    expect(isCiManaged('name: spectastic\n')).toBe(false);
    expect(isCiManaged('')).toBe(false);
  });
});
