import { describe, expect, it } from 'vitest';
import { decisionIndexMissingFinding, decisionIndexStaleFinding } from '../src/commands/validate.js';

/**
 * `decision-index-stale` and `decision-index-missing` (spec
 * 122-decision-index-federation, FR-002, T-101). Clones `ciGateDriftFinding`'s
 * shape: pure functions the CLI's validate folds in, comparing an expected
 * value against what's on disk.
 */
const FILE = 'specs/decisions.json';

describe('decisionIndexStaleFinding', () => {
  it('is clean when the committed hash matches the recomputed one', () => {
    const committed = JSON.stringify({ contentHash: 'sha256:abc' });
    expect(decisionIndexStaleFinding('sha256:abc', committed, FILE)).toBeNull();
  });

  it('errors when the committed hash disagrees with the recomputed one', () => {
    const committed = JSON.stringify({ contentHash: 'sha256:stale' });
    const f = decisionIndexStaleFinding('sha256:fresh', committed, FILE);
    expect(f?.rule).toBe('decision-index-stale');
    expect(f?.severity).toBe('error');
    expect(f?.fixHint).toContain('decisions export');
  });

  it('errors when the committed file is not valid JSON', () => {
    const f = decisionIndexStaleFinding('sha256:fresh', '{ not json', FILE);
    expect(f?.rule).toBe('decision-index-stale');
  });

  it('is a no-op when there is no committed file — missing is a separate finding', () => {
    expect(decisionIndexStaleFinding('sha256:fresh', null, FILE)).toBeNull();
  });
});

describe('decisionIndexMissingFinding', () => {
  it('warns when a scoped decision exists and no index does', () => {
    const f = decisionIndexMissingFinding(true, false, FILE);
    expect(f?.rule).toBe('decision-index-missing');
    expect(f?.severity).toBe('warning');
  });

  it('is clean when no scoped decision exists', () => {
    expect(decisionIndexMissingFinding(false, false, FILE)).toBeNull();
  });

  it('is clean when the index already exists', () => {
    expect(decisionIndexMissingFinding(true, true, FILE)).toBeNull();
  });
});
