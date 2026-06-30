import { describe, it, expect } from 'vitest';
import { orderCommand } from '../commands/order.js';
import type { CorpusEntry } from './types.js';

/**
 * US1 (T-100): the dependency-respecting build order. Every inferred edge is
 * satisfied, every spec appears exactly once, unranked specs are present and
 * flagged, output is deterministic, and ties break by spec id (SC-001, SC-004,
 * SC-005, FR-002, FR-006, NFR-001).
 */

interface SpecOpts {
  parent?: string;
  deferTo?: string[];
  rice?: [number, number, number, number];
  status?: string;
}

function mkSpec(id: string, o: SpecOpts = {}): CorpusEntry {
  const parent = o.parent ? `<spec-parent specid="${o.parent}"></spec-parent>` : '';
  const defers = (o.deferTo ?? []).map((t) => `<li defer-to="${t}">handled there</li>`).join('');
  const oos = defers ? `<spec-out-of-scope><ul>${defers}</ul></spec-out-of-scope>` : '';
  const rice = o.rice
    ? `<spec-rice reach="${o.rice[0]}" impact="${o.rice[1]}" confidence="${o.rice[2]}" effort="${o.rice[3]}"></spec-rice>`
    : '';
  const status = o.status ? `<spec-status value="${o.status}">x</spec-status>` : '';
  return {
    specId: id,
    html: `<!doctype html><html><body><h1>${id} title</h1>${status}${parent}${oos}${rice}</body></html>`,
  };
}

const ctx = { cwd: '.' };

/** Assert no spec precedes one it depends on (SC-001). */
function edgesSatisfied(ids: string[], edges: { from: string; to: string }[]): boolean {
  const pos = new Map(ids.map((id, i) => [id, i]));
  return edges.every((e) => (pos.get(e.from) ?? -1) < (pos.get(e.to) ?? Infinity));
}

describe('topoOrder via orderCommand', () => {
  it('places a parent before its reciprocated children and ranks ready children by RICE', async () => {
    const corpus = [
      mkSpec('001-a', { deferTo: ['002-b', '003-c'] }),
      mkSpec('002-b', { parent: '001-a', rice: [5, 5, 1, 1] }), // value 25
      mkSpec('003-c', { parent: '001-a', rice: [1, 1, 1, 1] }), // value 1
    ];
    const { ids, ordering } = await orderCommand({ corpus }, ctx);
    expect(ids).toEqual(['001-a', '002-b', '003-c']);
    expect(edgesSatisfied(ids, ordering.entries.flatMap((e) => e.unblocks.map((u) => ({ from: e.specId, to: u }))))).toBe(true);
  });

  it('includes every spec exactly once (SC-004)', async () => {
    const corpus = [
      mkSpec('001-a', { deferTo: ['002-b'] }),
      mkSpec('002-b', { parent: '001-a', rice: [2, 2, 1, 1] }),
      mkSpec('003-c', {}), // unranked, no edges
    ];
    const { ids } = await orderCommand({ corpus }, ctx);
    expect(ids.length).toBe(3);
    expect(new Set(ids).size).toBe(3);
  });

  it('keeps an un-RICE spec present and flagged unranked, never dropped (FR-006)', async () => {
    const corpus = [mkSpec('001-a', { rice: [2, 2, 1, 1] }), mkSpec('002-b', {})];
    const { ids, ordering } = await orderCommand({ corpus }, ctx);
    expect(ids).toContain('002-b');
    expect(ordering.entries.find((e) => e.specId === '002-b')?.tag).toBe('unranked');
  });

  it('breaks RICE ties by spec id ascending (NFR-001)', async () => {
    const corpus = [
      mkSpec('003-c', { rice: [2, 2, 1, 1] }),
      mkSpec('001-a', { rice: [2, 2, 1, 1] }),
      mkSpec('002-b', { rice: [2, 2, 1, 1] }),
    ];
    const { ids } = await orderCommand({ corpus }, ctx);
    expect(ids).toEqual(['001-a', '002-b', '003-c']);
  });

  it('is deterministic — identical order and html across runs (SC-005)', async () => {
    const corpus = [
      mkSpec('001-a', { deferTo: ['002-b'] }),
      mkSpec('002-b', { parent: '001-a', rice: [3, 3, 1, 2] }),
      mkSpec('003-c', { rice: [4, 1, 1, 1] }),
    ];
    const a = await orderCommand({ corpus }, ctx);
    const b = await orderCommand({ corpus }, ctx);
    expect(a.ids).toEqual(b.ids);
    expect(a.html).toBe(b.html);
  });

  it('excludes a bare, unreciprocated sibling defer-to from the edges (D-001)', async () => {
    // 001 and 002 defer to each other but neither names the other as <spec-parent>:
    // a see-also, not a precedence edge — so NO cycle and both orderable.
    const corpus = [
      mkSpec('001-a', { deferTo: ['002-b'], rice: [1, 1, 1, 1] }),
      mkSpec('002-b', { deferTo: ['001-a'], rice: [2, 2, 1, 1] }),
    ];
    const { ids, ordering } = await orderCommand({ corpus }, ctx);
    expect(ids.length).toBe(2);
    expect(ordering.entries.flatMap((e) => e.unblocks)).toEqual([]); // zero edges
  });
});

describe('the live corpus (SC-001, SC-004)', () => {
  it('orders every real spec once with every edge satisfied and no cycle', async () => {
    const { nodeFs } = await import('../providers/node-fs.js');
    const { ids, ordering } = await orderCommand({}, { cwd: process.cwd(), fs: nodeFs });
    // Every spec present exactly once.
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThanOrEqual(28);
    // Every inferred edge satisfied.
    const edges = ordering.entries.flatMap((e) => e.unblocks.map((u) => ({ from: e.specId, to: u })));
    expect(edgesSatisfied(ids, edges)).toBe(true);
    // 028 itself is present.
    expect(ids).toContain('028-dependency-ordering');
  });
});
