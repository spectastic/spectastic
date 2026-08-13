import { describe, expect, it } from 'vitest';
import { validate } from '../src/index.js';

/**
 * `variant-same-resolves` (spec 096, FR-006, design D-004).
 *
 * `<spec-same>` is the element that gives silence one meaning: an unwritten
 * combination means nobody looked, and a written one means somebody looked and
 * found no difference. That only holds if the reference resolves. A same-as
 * naming an axis or context that does not exist reads as diligence and records
 * nothing — the worst failure available to an element whose whole job is to
 * make absence unambiguous.
 */

const RULE = 'variant-same-resolves';
const FILE = '/repo/visual/variants.html';

const doc = (body: string) => `<!doctype html><html><head><title>x</title></head><body>${body}</body></html>`;
const findingsFor = (body: string) => validate(doc(body), FILE).filter((f) => f.rule === RULE);

const AXES = `<spec-axis name="platform" default="ios">
    <spec-context name="ios"></spec-context><spec-context name="macos"></spec-context>
  </spec-axis>
  <spec-axis name="mode" default="light">
    <spec-context name="light"></spec-context><spec-context name="dark"></spec-context>
  </spec-axis>`;
const grid = (same: string) => `<spec-variant-grid>${AXES}${same}</spec-variant-grid>`;

describe('a combination that resolves', () => {
  it('is silent', () => {
    expect(findingsFor(grid('<spec-same axes="platform=macos mode=dark"><p>Checked.</p></spec-same>'))).toEqual([]);
  });

  it('is silent for a single-axis combination', () => {
    expect(findingsFor(grid('<spec-same axes="mode=dark"><p>Checked.</p></spec-same>'))).toEqual([]);
  });
});

describe('a combination that does not', () => {
  it('flags an axis that does not exist', () => {
    const f = findingsFor(grid('<spec-same axes="density=compact"><p>Checked.</p></spec-same>'));
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toMatch(/density/);
    expect(f[0]?.severity).toBe('error');
  });

  it('flags a context that does not exist on an axis that does', () => {
    const f = findingsFor(grid('<spec-same axes="mode=sepia"><p>Checked.</p></spec-same>'));
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toMatch(/sepia/);
  });

  it('flags a malformed pair carrying no context at all', () => {
    const f = findingsFor(grid('<spec-same axes="mode"><p>Checked.</p></spec-same>'));
    expect(f).toHaveLength(1);
  });

  it('flags an empty axes list, which claims to have checked nothing', () => {
    const f = findingsFor(grid('<spec-same axes=""><p>Checked.</p></spec-same>'));
    expect(f).toHaveLength(1);
  });

  it('reports each unresolvable reference once', () => {
    const f = findingsFor(grid('<spec-same axes="density=compact mode=sepia"><p>Checked.</p></spec-same>'));
    expect(f).toHaveLength(2);
  });
});

describe('an unwritten combination', () => {
  it('produces nothing at all — silence means nobody looked, and that is legal', () => {
    expect(findingsFor(grid(''))).toEqual([]);
  });
});

describe('a document with no grid', () => {
  it('is silent', () => {
    expect(findingsFor('<p>ordinary</p>')).toEqual([]);
  });
});
