import { describe, expect, it } from 'vitest';
import {
  countConformance,
  mustDropFindings,
  rationaleDropFindings,
  requirementById,
} from '../src/change/must-drop.js';

/**
 * `conformance-dropped` (003 T-1005).
 *
 * The rule exists because three proposals in one session shipped a MODIFY
 * post-state that silently lost an obligation, each caught only by an
 * adversarial pass. The property under test is asymmetric on purpose: a
 * DECREASE is reported, an increase is not, and neither is a rewording that
 * keeps the same obligations.
 */

const spec = (body: string) => `<main><spec-requirement id="FR-001" priority="must">${body}</spec-requirement></main>`;
const delta = (body: string) => `<spec-delta op="modified" target="FR-001">${body}</spec-delta>`;
const run = (live: string, post: string) =>
  mustDropFindings({ proposalHtml: delta(post), proposalFile: 'p.html', specHtml: spec(live) });

const TWO = '<p>A <spec-rule>MUST</spec-rule> happen. B <spec-rule>MUST</spec-rule> also happen.</p>';

describe('countConformance', () => {
  it('counts each level separately', () => {
    const c = countConformance(
      '<spec-rule>MUST</spec-rule><spec-rule>MUST NOT</spec-rule><spec-rule level="should">SHOULD</spec-rule>',
    );
    expect(c.MUST).toBe(1);
    expect(c['MUST NOT']).toBe(1);
    expect(c.SHOULD).toBe(1);
  });

  // The ordering trap: "MUST NOT" contains "MUST", so a substring match would
  // double-count it and a MUST → MUST NOT change would look like no change.
  it('never counts a MUST NOT as a MUST', () => {
    const c = countConformance('<spec-rule>MUST NOT</spec-rule>');
    expect(c['MUST NOT']).toBe(1);
    expect(c.MUST).toBe(0);
  });
});

describe('mustDropFindings', () => {
  it('reports a post-state that loses a MUST', () => {
    const f = run(TWO, '<p>A <spec-rule>MUST</spec-rule> happen.</p>');
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toContain('MUST 2 → 1');
    expect(f[0]?.rule).toBe('conformance-dropped');
  });

  // Warning, not error: removing an obligation is what a narrowing MODIFY IS.
  // The defect is the removal nobody noticed, which a warning surfaces without
  // pretending the tool can tell intent from accident.
  it('reports at warning severity, because a deliberate narrowing is legitimate', () => {
    expect(run(TWO, '<p>A <spec-rule>MUST</spec-rule> happen.</p>')[0]?.severity).toBe('warning');
  });

  it('is silent when every obligation is carried through', () => {
    expect(run(TWO, TWO)).toEqual([]);
  });

  it('is silent when the post-state ADDS an obligation', () => {
    expect(run(TWO, `${TWO}<p>C <spec-rule>MUST</spec-rule> too.</p>`)).toEqual([]);
  });

  it('is silent on a rewording that keeps the same obligations', () => {
    expect(run(TWO, '<p>Something else <spec-rule>MUST</spec-rule> X. And <spec-rule>MUST</spec-rule> Y.</p>')).toEqual(
      [],
    );
  });

  it('catches a MUST downgraded to a SHOULD, which reads as a rewording', () => {
    const f = run(TWO, '<p>A <spec-rule>MUST</spec-rule> happen. B <spec-rule level="should">SHOULD</spec-rule>.</p>');
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toContain('MUST 2 → 1');
  });

  it('ignores ADD and REMOVE deltas — only a MODIFY retypes a post-state', () => {
    for (const op of ['added', 'removed', 'renamed']) {
      const html = `<spec-delta op="${op}" target="FR-001"><p>nothing</p></spec-delta>`;
      expect(mustDropFindings({ proposalHtml: html, proposalFile: 'p.html', specHtml: spec(TWO) })).toEqual([]);
    }
  });

  it('stays silent on a target the live spec does not carry — apply owns that refusal', () => {
    const html = '<spec-delta op="modified" target="FR-999"><p>x</p></spec-delta>';
    expect(mustDropFindings({ proposalHtml: html, proposalFile: 'p.html', specHtml: spec(TWO) })).toEqual([]);
  });

  // The recorded ceiling, asserted so it cannot be mistaken for a bug later.
  it('does NOT see a dropped sentence carrying no conformance keyword', () => {
    const live = `${TWO}<p>Accepted work belongs in the tracked list, not the inbox.</p>`;
    expect(run(live, TWO)).toEqual([]);
  });
});

describe('requirementById', () => {
  it('returns null for an id the spec does not carry', () => {
    expect(requirementById(spec(TWO), 'FR-404')).toBeNull();
  });
});


/**
 * `rationale-dropped` — the second loss, and the one the conformance count
 * cannot see by construction, since rationale carries no <spec-rule>.
 *
 * The comparison is by SENTENCE rather than by paragraph, and that is the whole
 * design: an apply replaces the entire <spec-requirement> element including
 * <details>, and a legitimate rewrite reflows paragraph boundaries while keeping
 * the argument. Matching paragraphs exactly reported every reflow as a loss and
 * was useless.
 */
const RAT = (body: string) =>
  `<p>A thing <spec-rule>MUST</spec-rule> happen.</p><details><summary>Rationale</summary>${body}</details>`;
const ARG =
  '<p>The first argument is long enough to count as an argument rather than a fragment.</p>' +
  '<p>The second argument is also long enough to count, and says something different.</p>';

const runRat = (live: string, post: string) =>
  rationaleDropFindings({
    proposalHtml: `<spec-delta op="modified" target="FR-001">${post}</spec-delta>`,
    proposalFile: 'p.html',
    specHtml: `<main><spec-requirement id="FR-001" priority="must">${live}</spec-requirement></main>`,
  });

describe('rationaleDropFindings', () => {
  it('reports rationale the post-state does not carry', () => {
    const f = runRat(RAT(ARG), RAT('<p>Something entirely different and quite long enough to count.</p>'));
    expect(f).toHaveLength(1);
    expect(f[0]?.rule).toBe('rationale-dropped');
    expect(f[0]?.message).toContain('2 rationale sentence(s)');
  });

  it('is silent when the rationale is carried verbatim', () => {
    expect(runRat(RAT(ARG), RAT(ARG))).toEqual([]);
  });

  it('is silent when rationale is carried and added to — the correct shape for an amendment', () => {
    expect(runRat(RAT(ARG), RAT(`${ARG}<p>A third argument, added by this change and long enough to count.</p>`))).toEqual(
      [],
    );
  });

  // Paragraph boundaries move in an ordinary rewrite; the argument does not.
  it('is silent when carried sentences are merged into one paragraph', () => {
    const merged =
      '<p>The first argument is long enough to count as an argument rather than a fragment. ' +
      'The second argument is also long enough to count, and says something different.</p>';
    expect(runRat(RAT(ARG), RAT(merged))).toEqual([]);
  });

  it('tolerates an edit inside a carried sentence, since a typo fix is not a loss', () => {
    const edited = ARG.replace('says something different', 'says something rather different');
    expect(runRat(RAT(ARG), RAT(edited))).toEqual([]);
  });

  it('is silent when the live requirement carries no rationale at all', () => {
    expect(runRat('<p>Bare.</p>', RAT(ARG))).toEqual([]);
  });

  it('reports at warning severity — retiring a stale argument is legitimate', () => {
    expect(runRat(RAT(ARG), RAT('<p>Replaced wholesale with something else long enough.</p>'))[0]?.severity).toBe(
      'warning',
    );
  });

  it('ignores ADD and REMOVE deltas', () => {
    for (const op of ['added', 'removed']) {
      expect(
        rationaleDropFindings({
          proposalHtml: `<spec-delta op="${op}" target="FR-001">${RAT('')}</spec-delta>`,
          proposalFile: 'p.html',
          specHtml: `<main><spec-requirement id="FR-001" priority="must">${RAT(ARG)}</spec-requirement></main>`,
        }),
      ).toEqual([]);
    }
  });
});
