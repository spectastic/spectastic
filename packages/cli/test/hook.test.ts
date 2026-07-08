import { describe, it, expect } from 'vitest';
import { ARTIFACT_GLOBS, HOOK_MARKER, buildHookScript } from '../src/commands/init/hook.js';

/**
 * T-103 of specs/031-init-tools/tasks.html. The generated pre-commit hook script
 * (plan D-002/D-003) is well-formed: it chains a preserved prior hook, runs
 * `spectastic validate` over the corpus, and adds no custom bypass.
 */
describe('buildHookScript', () => {
  const script = buildHookScript('/abs/cli/bin/spectastic');

  it('starts with a bash shebang', () => {
    expect(script.startsWith('#!/usr/bin/env bash\n')).toBe(true);
  });

  it('carries the managed marker (so re-install is idempotent, uninstall precise)', () => {
    expect(script).toContain(HOOK_MARKER);
  });

  it('chains a preserved prior hook first, propagating its exit (FR-006)', () => {
    expect(script).toContain('pre-commit.prior');
    expect(script).toContain('|| exit $?');
  });

  it('runs the CLI validate over every corpus glob (FR-002)', () => {
    expect(script).toContain('validate');
    expect(script).toContain('/abs/cli/bin/spectastic');
    for (const g of ARTIFACT_GLOBS) expect(script).toContain(g);
  });

  it('adds no custom bypass — --no-verify is git\'s own (FR-005)', () => {
    expect(script.toLowerCase()).not.toContain('no-verify');
  });
});
