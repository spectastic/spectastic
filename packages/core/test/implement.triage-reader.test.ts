import { readOpenTriageCards } from '@spectastic/core/commands/implement';
import { describe, expect, it } from 'vitest';

/**
 * The triage-log reader (090 REQ-TOOL-005, T-202).
 *
 * Pure and read-only, matching implementCommand's own IO-free shape — it
 * takes triage-log.html content and returns the open cards, each carrying
 * enough to judge dispatchability without a second pass: `layer`,
 * `regenResult`, and the precomputed `dispatchable` (layer=implementation
 * AND a passing regen result — the fail-safe REQ-TOOL-005 requires when the
 * result is absent or unrecognised).
 */

const card = (id: string, layer: string, opts: { open?: boolean; regen?: string | null } = {}) => {
  const status = opts.open === false ? ' data-status="done"' : '';
  const regenSpan = opts.regen === null ? '' : `<span class="regen" data-result="${opts.regen ?? 'pass'}">code</span>`;
  return `<spec-triage id="${id}" layer="${layer}"${status}>
  <header><h4>title</h4><span class="meta">${regenSpan}</span></header>
</spec-triage>`;
};

describe('readOpenTriageCards', () => {
  it('returns only open cards — a closed one is excluded entirely', () => {
    const html = `<!doctype html><html><body>
      ${card('T-001', 'implementation', { open: true })}
      ${card('T-002', 'implementation', { open: false })}
    </body></html>`;
    const cards = readOpenTriageCards(html);
    expect(cards.map((c) => c.id)).toEqual(['T-001']);
  });

  it('carries layer and regenResult verbatim', () => {
    const html = `<!doctype html><html><body>${card('T-005', 'spec', { regen: 'fail' })}</body></html>`;
    const [c] = readOpenTriageCards(html);
    expect(c).toMatchObject({ id: 'T-005', layer: 'spec', regenResult: 'fail' });
  });

  it('is dispatchable only when layer=implementation AND regen=pass, both present', () => {
    const html = `<!doctype html><html><body>
      ${card('T-001', 'implementation', { regen: 'pass' })}
      ${card('T-002', 'implementation', { regen: 'fail' })}
      ${card('T-003', 'spec', { regen: 'pass' })}
    </body></html>`;
    const byId = Object.fromEntries(readOpenTriageCards(html).map((c) => [c.id, c.dispatchable]));
    expect(byId).toEqual({ 'T-001': true, 'T-002': false, 'T-003': false });
  });

  it('fails safe — an absent regen result is never treated as passing (REQ-TOOL-005)', () => {
    const html = `<!doctype html><html><body>${card('T-001', 'implementation', { regen: null })}</body></html>`;
    const [c] = readOpenTriageCards(html);
    expect(c.regenResult).toBeUndefined();
    expect(c.dispatchable).toBe(false);
  });

  it('fails safe — an unrecognised regen value is never treated as passing', () => {
    const html = `<!doctype html><html><body>${card('T-001', 'implementation', { regen: 'sideways' })}</body></html>`;
    const [c] = readOpenTriageCards(html);
    expect(c.regenResult).toBe('sideways');
    expect(c.dispatchable).toBe(false);
  });

  it('an empty log returns an empty array, not an error', () => {
    expect(readOpenTriageCards('<!doctype html><html><body></body></html>')).toEqual([]);
  });

  it('reads every open card in document order, not just the first', () => {
    const html = `<!doctype html><html><body>
      ${card('T-001', 'spec')}
      ${card('T-002', 'implementation')}
      ${card('T-003', 'cross-spec')}
    </body></html>`;
    expect(readOpenTriageCards(html).map((c) => c.id)).toEqual(['T-001', 'T-002', 'T-003']);
  });
});
