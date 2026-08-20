import type { KernelContext } from '@spectastic/core';
import { implementCommand } from '@spectastic/core/commands/implement';
import { describe, expect, it } from 'vitest';

/**
 * Triage-card dispatch, end to end through `implementCommand` (090
 * REQ-TOOL-005, T-203/T-204). Resolution (T-201) and reading (T-202) are
 * tested in isolation elsewhere; this is the integration — a resolved
 * 'triage' target actually processed, closed, and refused where it
 * shouldn't be.
 */
const ctx: KernelContext = { cwd: '/' };

const triageWith = (id: string, layer: string, regen: string) => `<!doctype html><html><body>
<spec-triage id="${id}" layer="${layer}">
  <header><h4>title</h4><span class="meta"><span class="regen" data-result="${regen}">code</span></span></header>
</spec-triage>
</body></html>`;

describe('dispatching a triage card', () => {
  it('a dispatchable card (layer=implementation, regen=pass) closes on landing', async () => {
    const triageHtml = triageWith('T-002', 'implementation', 'pass');
    const result = await implementCommand({ target: 'triage:T-002', triageHtml }, ctx);
    expect(result.ticked).toEqual({ kind: 'triage', id: 'T-002', file: 'triage-log.html' });
  });

  it('closing sets data-status="done" on the card, and only that card', async () => {
    const triageHtml = `<!doctype html><html><body>
      <spec-triage id="T-001" layer="implementation"><span class="regen" data-result="pass"></span></spec-triage>
      <spec-triage id="T-002" layer="implementation"><span class="regen" data-result="pass"></span></spec-triage>
    </body></html>`;
    const result = await implementCommand({ target: 'triage:T-002', triageHtml }, ctx);
    // Attribute order isn't semantically meaningful (any HTML parser reads
    // it either way) — assert on the card each id belongs to, not a literal
    // attribute sequence.
    const closed = result.closedTriageHtml!;
    const cardFor = (id: string) => new RegExp(`<spec-triage id="${id}"[^>]*>`).exec(closed)![0];
    expect(cardFor('T-002')).toContain('data-status="done"');
    expect(cardFor('T-001')).not.toContain('data-status="done"');
  });

  it('a bare T-NNN that resolves unambiguously to a card dispatches the same way', async () => {
    const triageHtml = triageWith('T-006', 'implementation', 'pass');
    const result = await implementCommand({ target: 'T-006', triageHtml }, ctx);
    expect(result.ticked).toEqual({ kind: 'triage', id: 'T-006', file: 'triage-log.html' });
  });

  it('never drives the bundle flip prompt — cards are not spec tasks', async () => {
    const triageHtml = triageWith('T-002', 'implementation', 'pass');
    const result = await implementCommand({ target: 'triage:T-002', triageHtml }, ctx);
    expect(result.flipPromptFired).toBe(false);
  });
});

describe('refusing a non-dispatchable card, named explicitly', () => {
  it('layer other than implementation is refused, naming the routing', async () => {
    const triageHtml = triageWith('T-002', 'spec', 'pass');
    await expect(implementCommand({ target: 'triage:T-002', triageHtml }, ctx)).rejects.toThrow(/spec/);
  });

  it('a failing regeneration result is refused even at layer=implementation', async () => {
    const triageHtml = triageWith('T-002', 'implementation', 'fail');
    await expect(implementCommand({ target: 'triage:T-002', triageHtml }, ctx)).rejects.toThrow(/regen/i);
  });

  it('an absent regeneration result is refused, never treated as passing', async () => {
    const triageHtml = `<!doctype html><html><body>
<spec-triage id="T-002" layer="implementation">
  <header><h4>title</h4></header>
</spec-triage>
</body></html>`;
    await expect(implementCommand({ target: 'triage:T-002', triageHtml }, ctx)).rejects.toThrow();
  });

  it('a card that does not exist in triageHtml is reported not found', async () => {
    const triageHtml = triageWith('T-002', 'implementation', 'pass');
    await expect(implementCommand({ target: 'triage:T-404', triageHtml }, ctx)).rejects.toThrow(/T-404/);
  });

  it('a target resolving to triage with no triageHtml supplied is a clear error, not a crash', async () => {
    await expect(implementCommand({ target: 'triage:T-002' }, ctx)).rejects.toThrow(/triageHtml/);
  });
});
