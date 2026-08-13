import { describe, expect, it } from 'vitest';
import { readChoreographies } from '../src/choreography.js';
import { validate } from '../src/index.js';
import { parse } from '../src/parser.js';

/**
 * Motion as a sequence (102-motion-choreography).
 *
 * Two behaviours whose specification is SILENCE are pinned by assertion,
 * because nothing else can pin them: simultaneity is never reported, and a
 * token reference is never resolved. And one behaviour breaks the family's
 * pattern deliberately — an absent reduced-motion record IS reported.
 */

const FILE = '/repo/specs/001-a/visual/x.screen.html';
const RULE = 'choreography-shape';

const findingsFor = (body: string) =>
  validate(`<!doctype html><html><head><title>x</title></head><body><main>${body}</main></body></html>`, FILE).filter(
    (f) => f.rule === RULE,
  );
const doc = (body: string) => parse(`<!doctype html><html><body><main>${body}</main></body></html>`, FILE);

const RM = '<spec-reduced-motion>Skipped entirely; the values change without the transition.</spec-reduced-motion>';
const CHOREO = (cues: string, rm = RM, origin = 'first paint') =>
  `<spec-choreography id="entrance" origin="${origin}">${rm}${cues}</spec-choreography>`;

describe('reading', () => {
  it('returns cues in source order, which is the whole content', () => {
    const [c] = readChoreographies(
      doc(CHOREO('<spec-cue element="eyebrow" at="0ms"></spec-cue><spec-cue element="heading" at="180ms"></spec-cue>')),
    );
    expect(c?.cues.map((x) => x.element)).toEqual(['eyebrow', 'heading']);
  });

  it('reads offsets verbatim, with their unit', () => {
    const [c] = readChoreographies(doc(CHOREO('<spec-cue element="mark" at="1080ms"></spec-cue>')));
    expect(c?.cues[0]?.at).toBe('1080ms');
  });

  it('treats an empty reduced-motion record as no record at all', () => {
    const [c] = readChoreographies(doc(CHOREO('<spec-cue element="a" at="0ms"></spec-cue>', '<spec-reduced-motion>   </spec-reduced-motion>')));
    expect(c?.reducedMotion).toBeUndefined();
  });
});

describe('what must stay silent', () => {
  it('is silent for a well-formed choreography', () => {
    expect(findingsFor(CHOREO('<spec-cue element="eyebrow" at="0ms"></spec-cue>'))).toEqual([]);
  });

  it('never reports two cues sharing an offset — simultaneity is a choice', () => {
    // Reporting it would push an author into inventing a one-millisecond
    // difference to express something they meant.
    expect(
      findingsFor(CHOREO('<spec-cue element="a" at="0ms"></spec-cue><spec-cue element="b" at="0ms"></spec-cue>')),
    ).toEqual([]);
  });

  it('never resolves a token reference', () => {
    expect(
      findingsFor(CHOREO('<spec-cue element="a" at="0ms" duration="{motion.nonexistent}" easing="{motion.also-not-there}"></spec-cue>')),
    ).toEqual([]);
  });

  it('accepts a raw value, since most projects have no motion scale yet', () => {
    expect(findingsFor(CHOREO('<spec-cue element="a" at="0ms" duration="220ms" easing="ease-out"></spec-cue>'))).toEqual([]);
  });

  it('is silent on a document declaring no choreography', () => {
    expect(findingsFor('<p>an ordinary screen</p>')).toEqual([]);
  });
});

describe('what must report', () => {
  it('reports a missing reduced-motion record — the family\'s one required record', () => {
    const f = findingsFor(CHOREO('<spec-cue element="a" at="0ms"></spec-cue>', ''));
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toContain('reduced motion');
  });

  it('says why it is required, so the exception reads as an argument', () => {
    const [f] = findingsFor(CHOREO('<spec-cue element="a" at="0ms"></spec-cue>', ''));
    expect(f?.fixHint).toMatch(/motion sick|not neutral/i);
  });

  it('reports an empty reduced-motion record, which an attribute could not catch', () => {
    expect(findingsFor(CHOREO('<spec-cue element="a" at="0ms"></spec-cue>', '<spec-reduced-motion></spec-reduced-motion>'))).toHaveLength(1);
  });

  it('reports a choreography with no origin, since an offset without one is a number', () => {
    const f = findingsFor('<spec-choreography id="e">' + RM + '<spec-cue element="a" at="0ms"></spec-cue></spec-choreography>');
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toContain('no origin');
  });

  it('reports a cue with no element and one with no offset', () => {
    expect(findingsFor(CHOREO('<spec-cue at="0ms"></spec-cue>'))).toHaveLength(1);
    expect(findingsFor(CHOREO('<spec-cue element="a"></spec-cue>'))).toHaveLength(1);
  });
});
