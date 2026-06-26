import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  buildMarker,
  exploreScaffold,
  renderExploreRunBlock,
  renderLedger,
  ExploreError,
} from '../src/commands/explore.js';
import type { CapturedRun, ExploreInput } from '../src/types.js';

/**
 * Unit tests for the explore scaffolder (spec 022-explore, front half).
 *   T-100 — the kernel returns a thin-floor ledger + a quarantine marker.
 *   T-300 — a CapturedRun renders into the ledger's Run/Demo block (FR-008).
 *   T-901 — structural backstop: the ledger carries its sections, JS-independent.
 * Pure functions, no fs stub.
 */

const here = dirname(fileURLToPath(import.meta.url));
// Couples the test to the real thin-floor template so drift is caught (T-011).
const TEMPLATE = readFileSync(
  join(here, '..', '..', '..', 'templates', 'explore.html'),
  'utf8',
);

const base = (over: Partial<ExploreInput> = {}): ExploreInput => ({
  id: '023-try-a-graph-view',
  intent: 'try a graph view for the canvas',
  created: '2026-06-24',
  template: TEMPLATE,
  ...over,
});

describe('exploreScaffold — T-100 (FR-002, FR-003, FR-007, FR-009)', () => {
  it('builds the quarantine marker with the fixed shape', () => {
    const { marker } = exploreScaffold(base());
    expect(marker).toEqual({
      id: '023-try-a-graph-view',
      intent: 'try a graph view for the canvas',
      status: 'quarantined',
      created: '2026-06-24',
    });
  });

  it('substitutes the id, intent, and date into the ledger', () => {
    const { ledgerHtml } = exploreScaffold(base());
    expect(ledgerHtml).toContain('023-try-a-graph-view');
    expect(ledgerHtml).toContain('try a graph view for the canvas');
    expect(ledgerHtml).toContain('2026-06-24');
    expect(ledgerHtml).not.toContain('[INTENT]');
    expect(ledgerHtml).not.toContain('[EXPLORE_ID]');
    expect(ledgerHtml).not.toContain('[CREATED_DATE]');
  });

  it('rewrites asset paths for the two-levels-deep ledger location', () => {
    const { ledgerHtml } = exploreScaffold(base());
    expect(ledgerHtml).toContain('../../assets/spec.css');
    expect(ledgerHtml).not.toContain('"../assets/spec.css"');
  });

  it('keeps the thin floor: no requirement IDs, INVEST, conformance, or budget', () => {
    const { ledgerHtml } = exploreScaffold(base());
    expect(ledgerHtml).not.toMatch(/\bFR-\d{3}\b/);
    expect(ledgerHtml).not.toMatch(/\bSC-\d{3}\b/);
    expect(ledgerHtml).not.toContain('class="invest"');
    expect(ledgerHtml).not.toContain('spec-conformance');
    expect(ledgerHtml).not.toContain('spec-budget');
  });

  it('escapes HTML in the intent', () => {
    const { ledgerHtml, marker } = exploreScaffold(
      base({ intent: 'render <b>bold</b> & "quotes"' }),
    );
    expect(ledgerHtml).toContain('render &lt;b&gt;bold&lt;/b&gt; &amp; &quot;quotes&quot;');
    // The marker keeps the raw intent (it is JSON, not HTML).
    expect(marker.intent).toBe('render <b>bold</b> & "quotes"');
  });

  it('refuses an empty intent', () => {
    expect(() => exploreScaffold(base({ intent: '   ' }))).toThrow(ExploreError);
  });

  it('refuses a template missing the run-block slot', () => {
    expect(() => renderLedger(base({ template: '<html>no slot</html>' }))).toThrow(ExploreError);
  });
});

describe('renderExploreRunBlock — T-300 (FR-008, SC-003, D-004)', () => {
  it('renders an empty (loud-gap) block when nothing was captured', () => {
    const block = renderExploreRunBlock(undefined);
    expect(block).toContain('<spec-run></spec-run>');
    expect(block).toContain('<spec-toggle></spec-toggle>');
    expect(block).toContain('<spec-tests></spec-tests>');
  });

  it('renders a CapturedRun into the shared verify Run/Demo shape', () => {
    const captured: CapturedRun = {
      run: 'pnpm dev',
      toggle: 'FEATURE_GRAPH=1',
      tests: 'vitest run graph',
      testsCite: ['T-100', 'T-101'],
      demo: 'open the canvas, toggle graph view',
      demoCite: ['SC-001'],
    };
    const block = renderExploreRunBlock(captured);
    expect(block).toContain('<spec-run>pnpm dev</spec-run>');
    expect(block).toContain('<spec-toggle>FEATURE_GRAPH=1</spec-toggle>');
    expect(block).toContain('<spec-tests cites="T-100 T-101">vitest run graph</spec-tests>');
    expect(block).toContain('<spec-demo cites="SC-001">open the canvas, toggle graph view</spec-demo>');
  });

  it('places the captured run into the ledger at scaffold time', () => {
    const { ledgerHtml } = exploreScaffold(base({ capturedRun: { run: 'pnpm build' } }));
    expect(ledgerHtml).toContain('<spec-run>pnpm build</spec-run>');
    expect(ledgerHtml).not.toContain('<!-- RUN_BLOCK -->');
  });
});

describe('ledger structural backstop — T-901 (P-4, P-7)', () => {
  it('carries every section heading as static HTML (no JS dependence)', () => {
    const { ledgerHtml } = exploreScaffold(base());
    expect(ledgerHtml).toContain('1 · Intent');
    expect(ledgerHtml).toContain('2 · What I built / tried / worked / didn');
    expect(ledgerHtml).toContain('3 · What actually ran');
    // The quarantined status is visible in the static document, not injected.
    expect(ledgerHtml).toContain('<spec-status value="quarantined">');
  });

  it('marker round-trips through JSON unchanged', () => {
    const marker = buildMarker(base());
    expect(JSON.parse(JSON.stringify(marker))).toEqual(marker);
  });
});
