import { describe, expect, it } from 'vitest';

/**
 * T-905 (specs/004-npm-publish-workflow): a deliberately failing assertion,
 * committed on a throwaway branch, to confirm the publish.yml `dry-run` job's
 * Test step fails BEFORE its Dry-run publish step ever runs. This file — and
 * the branch/PR carrying it — is never merged to main; do not keep this test.
 */
describe('T-905 smoke: dry-run job fails before publish-dry-run', () => {
  it('deliberately fails', () => {
    expect(true).toBe(false);
  });
});
