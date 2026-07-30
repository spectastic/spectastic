import { describe, expect, it } from 'vitest';
import { flagStale } from './stale.js';

// US3 / T-302 (spec FR-007, plan D-006). A node is stale when an upstream
// artifact was modified more recently than it.
describe('flagStale', () => {
  it('flags a downstream artifact older than an upstream one', () => {
    const stale = flagStale([
      { id: 'spec', orderIndex: 1, mtimeMs: 100 },
      { id: 'plan', orderIndex: 2, mtimeMs: 50 }, // older than spec → stale
      { id: 'tasks', orderIndex: 3, mtimeMs: 200 }, // newer than all upstream → fresh
    ]);
    expect(stale.has('plan')).toBe(true);
    expect(stale.has('tasks')).toBe(false);
    expect(stale.has('spec')).toBe(false);
  });

  it('never flags the most-upstream artifact', () => {
    const stale = flagStale([
      { id: 'spec', orderIndex: 1, mtimeMs: 10 },
      { id: 'plan', orderIndex: 2, mtimeMs: 20 },
    ]);
    expect(stale.has('spec')).toBe(false);
  });

  it('treats equal mtimes as fresh (only strictly-newer upstream is stale)', () => {
    const stale = flagStale([
      { id: 'spec', orderIndex: 1, mtimeMs: 100 },
      { id: 'plan', orderIndex: 2, mtimeMs: 100 },
    ]);
    expect(stale.size).toBe(0);
  });
});
