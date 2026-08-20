import { resolveTarget } from '@spectastic/core/commands/implement';
import { describe, expect, it } from 'vitest';

/**
 * Target resolution (090 REQ-TOOL-006, T-200).
 *
 * `resolveTarget` is the pure classifier `classifyTarget` becomes: given a
 * bare or qualified target plus the tasks.html/triage-log.html it can be read
 * against, it names what the id actually means — and refuses only the one
 * case REQ-TOOL-006 defines as genuinely ambiguous: an id that names *both*
 * an unchecked task and an open triage card. Today's `classifyTarget` knows
 * nothing of triage logs at all, so every case here is red until T-201 adds
 * this export.
 *
 * Scope is deliberately narrow — id resolution only. Whether a resolved
 * 'triage' target is *dispatchable* (layer=implementation AND regen=pass) is
 * REQ-TOOL-005's question, answered by T-202/T-203; this file never asserts
 * dispatchability.
 */

const tasksWith = (id: string, checked: boolean) => `<!doctype html><html><body>
<spec-task id="${id}"><input type="checkbox"${checked ? ' checked' : ''}> Some task</spec-task>
</body></html>`;

const triageWith = (id: string, open: boolean) => `<!doctype html><html><body>
<spec-triage id="${id}" layer="implementation"${open ? '' : ' data-status="done"'}>
  <span class="regen" data-result="pass"></span>
</spec-triage>
</body></html>`;

describe('qualified forms — never refused on ambiguity, whatever the content says', () => {
  it('task:T-NNN resolves to task even when an open card of the same id exists', () => {
    const r = resolveTarget('task:T-006', {
      tasksHtml: tasksWith('T-006', false),
      triageHtml: triageWith('T-006', true),
    });
    expect(r).toEqual({ kind: 'task', id: 'T-006' });
  });

  it('triage:T-NNN resolves to triage even when an unchecked task of the same id exists', () => {
    const r = resolveTarget('triage:T-006', {
      tasksHtml: tasksWith('T-006', false),
      triageHtml: triageWith('T-006', true),
    });
    expect(r).toEqual({ kind: 'triage', id: 'T-006' });
  });

  it('a qualified form needs no matching content at all to resolve', () => {
    expect(resolveTarget('task:T-999', {})).toEqual({ kind: 'task', id: 'T-999' });
    expect(resolveTarget('triage:T-999', {})).toEqual({ kind: 'triage', id: 'T-999' });
  });
});

describe('the genuinely ambiguous case — refused, per REQ-TOOL-006', () => {
  it('an unchecked task and an open card sharing an id is refused', () => {
    const r = resolveTarget('T-006', {
      tasksHtml: tasksWith('T-006', false),
      triageHtml: triageWith('T-006', true),
    });
    expect(r).toEqual({ kind: 'ambiguous', id: 'T-006' });
  });
});

describe('one candidate actionable, one not — resolves cleanly, never refused', () => {
  it('an unchecked task and a CLOSED card sharing an id resolves to the task', () => {
    const r = resolveTarget('T-006', {
      tasksHtml: tasksWith('T-006', false),
      triageHtml: triageWith('T-006', false),
    });
    expect(r).toEqual({ kind: 'task', id: 'T-006' });
  });

  it('a CHECKED task and an open card sharing an id resolves to the card', () => {
    // The motivating case, in shape: 016's own tasks.html is 52/52 checked, so
    // T-006 there names only a closed-task/open-card pair, never both live.
    const r = resolveTarget('T-006', {
      tasksHtml: tasksWith('T-006', true),
      triageHtml: triageWith('T-006', true),
    });
    expect(r).toEqual({ kind: 'triage', id: 'T-006' });
  });

  it('a bare id present only as an unchecked task resolves as it does today', () => {
    const r = resolveTarget('T-001', { tasksHtml: tasksWith('T-001', false) });
    expect(r).toEqual({ kind: 'task', id: 'T-001' });
  });

  it('a bare id present only as an open card resolves to it, with no tasksHtml at all', () => {
    const r = resolveTarget('T-006', { triageHtml: triageWith('T-006', true) });
    expect(r).toEqual({ kind: 'triage', id: 'T-006' });
  });
});

describe('no candidate — falls through exactly as classifyTarget does today', () => {
  it('a T-NNN shape matching neither classifies as task (execution then fails not-found, unchanged)', () => {
    expect(resolveTarget('T-404', {})).toEqual({ kind: 'task', id: 'T-404' });
  });

  it('an I-NNN target is unaffected by any triage logic', () => {
    expect(resolveTarget('I-012', { triageHtml: triageWith('I-012', true) })).toEqual({
      kind: 'just-do',
      id: 'I-012',
    });
  });

  it('a spec-id target is unaffected by any triage logic', () => {
    expect(resolveTarget('016-theme-support', { triageHtml: triageWith('016-theme-support', true) })).toEqual({
      kind: 'spec',
    });
  });
});
