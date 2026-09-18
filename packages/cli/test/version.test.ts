import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CI_NODE_VERSION, ACTION_PINS } from '@spectastic/core/ci/render';
import { describe, expect, it } from 'vitest';
import { cliVersion } from '../src/version.js';

/** Unit tests for the CLI version reader (spec 121-init-ci-gate, T-012). */

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(here, '..', '..', '..');

describe('cliVersion', () => {
  it('equals the CLI package\'s own version', () => {
    const pkg = JSON.parse(readFileSync(resolve(here, '..', 'package.json'), 'utf8')) as {
      version: string;
    };
    expect(cliVersion()).toBe(pkg.version);
  });
});

describe('CI renderer pins, cross-checked against this repo\'s own CI', () => {
  it('CI_NODE_VERSION satisfies the CLI\'s engines.node floor', () => {
    const pkg = JSON.parse(readFileSync(resolve(here, '..', 'package.json'), 'utf8')) as {
      engines: { node: string };
    };
    expect(pkg.engines.node).toBe('>=20');
    expect(Number(CI_NODE_VERSION)).toBeGreaterThanOrEqual(20);
  });

  it('each ACTION_PINS major matches this repo\'s own .github/workflows/ci.yml', () => {
    const ciYml = readFileSync(resolve(REPO_ROOT, '.github/workflows/ci.yml'), 'utf8');
    for (const pin of Object.values(ACTION_PINS)) {
      expect(ciYml).toContain(pin);
    }
  });
});
