import { describe, expect, it } from 'vitest';
import {
  buildContractNotification,
  notificationMatchesConsumer,
  routeNotification,
} from '../src/contracts/notify.js';

/**
 * Contract-change notification (spec 076-contract-export-handover, US2/US3).
 * Written before the builder exists (T-200/T-201/T-300/T-301) — failing until
 * T-210/T-211/T-310 land.
 *
 * Two shapes carry the design's weight:
 *  - a WITHDRAWAL is a SUBTYPE of breaking (D-003), not a third kind, so a
 *    consumer branching only on breaking-versus-not is still correct;
 *  - the change class is the producer's CLAIM, and the copy says so.
 */

describe('T-200/SC-003 · a promoted change produces exactly 1 notification naming its coordinate', () => {
  it('names the federation-unique coordinate, not a file path', () => {
    const n = buildContractNotification({ project: 'acme/billing', name: 'invoices', changeClass: 'breaking' });
    expect(n.coordinate).toBe('spectastic://acme/billing/contract/invoices');
    // SC-002: a coordinate never carries a file extension, because it names
    // what the contract IS rather than where its file currently sits.
    expect(n.coordinate).not.toMatch(/\.(ya?ml|json|proto|graphqls?)$/i);
  });

  it('a breaking change is distinguishable from a non-breaking one', () => {
    const breaking = buildContractNotification({ project: 'acme/billing', name: 'invoices', changeClass: 'breaking' });
    const nonBreaking = buildContractNotification({
      project: 'acme/billing',
      name: 'invoices',
      changeClass: 'non-breaking',
    });
    expect(breaking.changeClass).toBe('breaking');
    expect(nonBreaking.changeClass).toBe('non-breaking');
    expect(breaking.summary).not.toBe(nonBreaking.summary);
  });

  it("states the class as the producer's CLAIM, never as a verified property", () => {
    const n = buildContractNotification({ project: 'acme/billing', name: 'invoices', changeClass: 'breaking' });
    expect(n.summary).toMatch(/claims/i);
    expect(n.summary).not.toMatch(/\bis verified\b|\bwe verified\b/i);
  });

  it('is pure — identical input, identical output (NFR-001)', () => {
    const input = { project: 'acme/billing', name: 'invoices', changeClass: 'breaking' } as const;
    expect(buildContractNotification(input)).toEqual(buildContractNotification(input));
  });
});

describe('T-201/D-003 · a withdrawal is a SUBTYPE of breaking, not a sibling kind', () => {
  it('is classed breaking, so a consumer branching only on breaking-versus-not is still correct', () => {
    const n = buildContractNotification({
      project: 'acme/billing',
      name: 'invoices',
      changeClass: 'breaking',
      withdrawnReason: 'superseded by the settlements API',
    });
    expect(n.changeClass).toBe('breaking');
  });

  it('carries the withdrawn reason, so a consumer that cares knows there is no successor', () => {
    const n = buildContractNotification({
      project: 'acme/billing',
      name: 'invoices',
      changeClass: 'breaking',
      withdrawnReason: 'superseded by the settlements API',
    });
    expect(n.withdrawnReason).toBe('superseded by the settlements API');
    expect(n.summary).toMatch(/withdrawn/i);
    expect(n.summary).toMatch(/no successor/i);
  });

  it('normalises a withdrawal to breaking even if the caller claims non-breaking', () => {
    // A withdrawal is unambiguously breaking — not the caller's to soften.
    const n = buildContractNotification({
      project: 'acme/billing',
      name: 'invoices',
      changeClass: 'non-breaking',
      withdrawnReason: 'retired',
    });
    expect(n.changeClass).toBe('breaking');
  });

  it('an ordinary change carries no withdrawn reason at all', () => {
    const n = buildContractNotification({ project: 'acme/billing', name: 'invoices', changeClass: 'non-breaking' });
    expect(n.withdrawnReason).toBeUndefined();
    expect(n.summary).not.toMatch(/withdrawn/i);
  });

  it('an empty withdrawal reason is not treated as a withdrawal', () => {
    const n = buildContractNotification({
      project: 'acme/billing',
      name: 'invoices',
      changeClass: 'non-breaking',
      withdrawnReason: '   ',
    });
    expect(n.changeClass).toBe('non-breaking');
    expect(n.withdrawnReason).toBeUndefined();
  });
});

describe('T-300/FR-005 · routing matches a consumer by coordinate, exactly', () => {
  const notification = buildContractNotification({
    project: 'acme/billing',
    name: 'invoices',
    changeClass: 'breaking',
  });

  it('a consumer declaring the coordinate is matched', () => {
    expect(notificationMatchesConsumer(notification, ['spectastic://acme/billing/contract/invoices'])).toBe(true);
  });

  it('a consumer of a DIFFERENT coordinate is not matched', () => {
    expect(notificationMatchesConsumer(notification, ['spectastic://acme/billing/contract/settlements'])).toBe(false);
  });

  it('a consumer of the same name under a different project is not matched', () => {
    expect(notificationMatchesConsumer(notification, ['spectastic://other/billing/contract/invoices'])).toBe(false);
  });

  it('routes to exactly the consumers that declared it', () => {
    const consumers = [
      { id: 'a', consumes: ['spectastic://acme/billing/contract/invoices'] },
      { id: 'b', consumes: ['spectastic://acme/billing/contract/settlements'] },
      { id: 'c', consumes: ['spectastic://acme/billing/contract/invoices', 'spectastic://x/y/contract/z'] },
      { id: 'd' },
    ];
    expect(routeNotification(notification, consumers).map((c) => c.id)).toEqual(['a', 'c']);
  });
});

describe('T-301/NFR-002 · a monorepo needs no consumes entry and incurs 0 additional steps', () => {
  const notification = buildContractNotification({
    project: 'acme/billing',
    name: 'invoices',
    changeClass: 'breaking',
  });

  it('a project declaring no consumes at all simply matches nothing — no error, no ceremony', () => {
    expect(notificationMatchesConsumer(notification, undefined)).toBe(false);
    expect(() => notificationMatchesConsumer(notification, undefined)).not.toThrow();
  });

  it('an empty consumes array behaves identically to an absent one', () => {
    expect(notificationMatchesConsumer(notification, [])).toBe(notificationMatchesConsumer(notification, undefined));
  });

  it('routing over a set of monorepo projects with no consumes yields an empty list', () => {
    const monorepo = [{ id: 'producer' }, { id: 'consumer-in-same-repo' }];
    expect(routeNotification(notification, monorepo)).toEqual([]);
  });
});

describe('T-310/D-004 · the consumes array is optional and fails soft', () => {
  const read = (files: Record<string, string>) => (path: string) => {
    const v = files[path];
    if (v === undefined) throw new Error(`ENOENT: ${path}`);
    return v;
  };

  it('reads declared coordinates', async () => {
    const { readConsumes } = await import('../src/contracts/notify.js');
    const files = { '/repo/spectastic.json': '{"consumes":["spectastic://acme/billing/contract/invoices"]}' };
    expect(readConsumes('/repo', read(files))).toEqual(['spectastic://acme/billing/contract/invoices']);
  });

  it('absent by default — no config file yields an empty list, not an error (NFR-002)', async () => {
    const { readConsumes } = await import('../src/contracts/notify.js');
    expect(readConsumes('/repo', read({}))).toEqual([]);
  });

  it('a config with no consumes key yields an empty list', async () => {
    const { readConsumes } = await import('../src/contracts/notify.js');
    expect(readConsumes('/repo', read({ '/repo/spectastic.json': '{"project":"acme/billing"}' }))).toEqual([]);
  });

  it('malformed JSON fails soft rather than crashing a route', async () => {
    const { readConsumes } = await import('../src/contracts/notify.js');
    expect(readConsumes('/repo', read({ '/repo/spectastic.json': '{not json' }))).toEqual([]);
  });

  it('a non-array consumes fails soft', async () => {
    const { readConsumes } = await import('../src/contracts/notify.js');
    expect(readConsumes('/repo', read({ '/repo/spectastic.json': '{"consumes":"a-string"}' }))).toEqual([]);
  });

  it('drops non-string and blank entries rather than propagating them', async () => {
    const { readConsumes } = await import('../src/contracts/notify.js');
    const files = { '/repo/spectastic.json': '{"consumes":["spectastic://a/b/contract/c", 42, "", "  ", null]}' };
    expect(readConsumes('/repo', read(files))).toEqual(['spectastic://a/b/contract/c']);
  });
});
