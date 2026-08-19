import { describe, expect, it } from 'vitest';
import { declaredSupersedes, markSupersededPhase } from '../src/commands/apply.js';

/**
 * `supersedes=` and the phase retirement (088 REQ-CHANGE-010).
 *
 * The properties that matter are the two refusals to act: a CHECKED task is
 * never touched, and a MISSING phase is never an error. Both were found by
 * building rather than by specifying — the first because 095's phase 9 carries
 * a ticked task a whole-phase sweep would have silently unticked, the second
 * because REQ-CHANGE-003 regenerates the tracker on a large change, so keying
 * the refusal on a surviving phase would have made the rule unsatisfiable.
 */

const TRACKER = `<!doctype html><html><body><main>
<section id="phase-2026-08-13-address-a-screen" class="phase">
<h2>7 · Address a screen <span class="par">(applied change <a href="x">2026-08-13-address-a-screen</a>)</span></h2>
<p>Folded from the applied proposal's §6 (the archive is frozen).</p>
<spec-task id="T-1100">
  <input type="checkbox">
  <div>Add the screen kind to the coordinate grammar.</div>
</spec-task>
<spec-task id="T-1101">
  <input type="checkbox" checked>
  <div>A task that was actually done.</div>
</spec-task>
<spec-task id="T-1102">
  <input type="checkbox">
  <div>Link each screen in the materialised view.</div>
</spec-task>
</section>
<section id="phase-other" class="phase">
<spec-task id="T-1200">
  <input type="checkbox">
  <div>An unrelated phase that must not be touched.</div>
</spec-task>
</section>
</main></body></html>`;

const mark = (t = TRACKER) =>
  markSupersededPhase(t, '2026-08-13-address-a-screen', '2026-08-14-use-the-anchor', 'Use the anchor that already exists');

describe('declaredSupersedes', () => {
  it('reads the attribute off the wrapper', () => {
    expect(declaredSupersedes('<spec-change id="a" status="approved" supersedes="2026-08-13-x">')).toBe('2026-08-13-x');
  });
  it('is undefined for the overwhelming majority of proposals, which declare none', () => {
    expect(declaredSupersedes('<spec-change id="a" status="approved">')).toBeUndefined();
  });
});

describe('markSupersededPhase (REQ-CHANGE-010)', () => {
  it('marks the unchecked tasks and reports how many', () => {
    const r = mark();
    expect(r?.marked).toBe(2);
    expect(r?.out).toContain('<spec-task id="T-1100" data-status="superseded">');
    expect(r?.out).toContain('<spec-task id="T-1102" data-status="superseded">');
  });

  it('leaves a CHECKED task exactly as it stands', () => {
    const r = mark();
    expect(r?.out).toContain('<spec-task id="T-1101">');
    expect(r?.out).not.toContain('<spec-task id="T-1101" data-status');
    // and it is still checked — never unticked to tidy a count
    expect(r?.out).toMatch(/id="T-1101"[\s\S]*?checkbox" checked/);
  });

  it('annotates with the retiring change and a reason', () => {
    const r = mark();
    expect(r?.out).toContain('2026-08-14-use-the-anchor');
    expect(r?.out).toContain('Use the anchor that already exists');
  });

  it('never deletes or renumbers a task', () => {
    const r = mark();
    for (const id of ['T-1100', 'T-1101', 'T-1102']) expect(r?.out).toContain(`id="${id}"`);
    expect(r?.out).toContain('<div>Add the screen kind to the coordinate grammar.</div>');
  });

  it('touches no other phase', () => {
    const r = mark();
    expect(r?.out).toContain('<spec-task id="T-1200">');
    expect(r?.out).not.toContain('<spec-task id="T-1200" data-status');
  });

  // The deadlock case. Absence is not an error: REQ-CHANGE-003 regenerates the
  // tracker on a large change and takes every folded phase with it.
  it('returns null when the phase is absent, rather than failing', () => {
    expect(markSupersededPhase(TRACKER, '2026-01-01-never-folded', 'x', 'y')).toBeNull();
  });

  it('is idempotent — a second run marks nothing new', () => {
    const first = mark();
    const second = mark(first?.out);
    expect(second?.marked).toBe(0);
    expect(second?.out).toBe(first?.out);
  });

  // The guard must key on the attribute, not its position. Both orderings are
  // real: the estate carries 2189 of the first and 106 of the second.
  it('leaves a task checked in EITHER attribute order', () => {
    const t = TRACKER.replace('<input type="checkbox" checked>', '<input checked type="checkbox">');
    const r = markSupersededPhase(t, '2026-08-13-address-a-screen', 'x', 'y');
    expect(r?.marked).toBe(2);
    expect(r?.out).toContain('<spec-task id="T-1101">');
    expect(r?.out).not.toContain('<spec-task id="T-1101" data-status');
  });
});

describe('a superseded task is closed as well as marked (REQ-CHANGE-010, amended)', () => {
  it('closes the box, so an unchecked box means exactly "open"', () => {
    const r = mark();
    expect(r?.out).toMatch(/<spec-task id="T-1100"[^>]*data-status="superseded"[^>]*>\s*<input type="checkbox" checked>/);
    expect(r?.out).toMatch(/<spec-task id="T-1102"[^>]*data-status="superseded"[^>]*>\s*<input type="checkbox" checked>/);
  });

  it('leaves an already-closed task exactly as it stands', () => {
    // The clause that protects a real result: a task genuinely done keeps its
    // status, and supersession never rewrites work that happened.
    const r = mark();
    expect(r?.out).toMatch(/<spec-task id="T-1101">\s*<input type="checkbox" checked>/);
    expect(r?.out).not.toMatch(/<spec-task id="T-1101"[^>]*data-status/);
  });

  it('closes a box whose attributes are in the other order', () => {
    // The estate carries both forms; an order-sensitive rewrite would leave
    // this one open and reintroduce the ambiguity this change removes.
    const t = TRACKER.replace('<input type="checkbox">\n  <div>Add the screen kind', '<input class="x" type="checkbox">\n  <div>Add the screen kind');
    const r = mark(t);
    expect(r?.out).toMatch(/<input class="x" type="checkbox" checked>/);
  });

  it('leaves an unrelated phase untouched', () => {
    const r = mark();
    expect(r?.out).toMatch(/<spec-task id="T-1200">\s*<input type="checkbox">/);
  });
});
