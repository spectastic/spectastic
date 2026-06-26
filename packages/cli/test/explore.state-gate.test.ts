import type { promises as fsPromises } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { gateOnQuarantine } from '../src/state-gate.js';

/**
 * T-201 (spec 022-explore, FR-006 / FR-009 / SC-002). The state-gate leg: the
 * core verbs refuse to advance an id that names a live quarantined exploration.
 * Graduation (deferred) is the only bridge into the spec lifecycle; the other
 * exit is deletion. fs-injected, so this is a pure unit test.
 */

/** A fake fs.readFile that serves canned contents per path, else ENOENT. */
function fakeFs(files: Record<string, string>): typeof fsPromises {
  return {
    async readFile(path: string): Promise<string> {
      const hit = files[path];
      if (hit === undefined) throw new Error(`ENOENT: ${path}`);
      return hit;
    },
  } as unknown as typeof fsPromises;
}

const marker = (status: string): string => JSON.stringify({ id: '023-x', status });
const PATH = '/repo/explorations/023-x/quarantine.json';

describe('gateOnQuarantine', () => {
  it('refuses when a quarantined marker exists for the id', async () => {
    const fs = fakeFs({ [PATH]: marker('quarantined') });
    const decision = await gateOnQuarantine(fs, '/repo', '023-x');
    expect(decision?.refused).toBe(true);
    expect(decision?.message).toContain('023-x');
    expect(decision?.message).toContain('graduate');
  });

  it('lets the verb proceed when no exploration marker exists', async () => {
    const fs = fakeFs({});
    expect(await gateOnQuarantine(fs, '/repo', '021-verify-view')).toBeNull();
  });

  it('lets the verb proceed when the marker is no longer quarantined', async () => {
    const fs = fakeFs({ [PATH]: marker('graduated') });
    expect(await gateOnQuarantine(fs, '/repo', '023-x')).toBeNull();
  });

  it('refuses loudly on a present-but-corrupt marker', async () => {
    const fs = fakeFs({ [PATH]: '{ not json' });
    const decision = await gateOnQuarantine(fs, '/repo', '023-x');
    expect(decision?.refused).toBe(true);
    expect(decision?.message).toContain('unreadable');
  });
});
