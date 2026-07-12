import { describe, expect, it } from 'vitest';
import { readBundle, renderVerifyHtml, verifyCommand } from '../src/commands/verify.js';
import type { CapturedRun, FileSystem, KernelContext } from '../src/types.js';

/**
 * Unit tests for the §Observables trace (spec 048-verify-slo-trace).
 * readBundle's derivation (T-010, US1) already exists and these pass now;
 * the renderVerifyHtml assertions (T-110, US1) are written test-first and
 * FAIL until T-110 lands, per the plan's D-005 discipline.
 *
 * Render contract T-110 MUST satisfy (mirrors tests/theme.header.spec.ts's
 * pin-the-selectors-first pattern):
 *   <section id="observables">          the trace section
 *   a[href="./spec.html#NFR-NNN"]       each row's NFR id, linked
 *   a loud gap reuses the same visual pattern as the SC trace's TRACE_GAP
 *     (a bold, coloured <strong>), with a message containing "linked" or
 *     "no <spec-slo>" and the NFR id
 *   a quiet gap renders literal text "n/a" — NOT wrapped in the loud style
 *   a bundle with zero <spec-slo> anywhere renders "no SLOs declared"
 *     instead of an empty table (NFR-002)
 * Later tasks (T-210 instrumentation column, T-310 signal cross-check) are
 * NOT asserted here — out of US1's scope.
 */

const NFR_SPEC = (body: string): string =>
  `<!doctype html><html><body><main>
<header><p class="small-caps">Specification · 999-obs</p></header>
${body}
</main></body></html>`;

const EMPTY_TASKS = `<!doctype html><html><body><main></main></body></html>`;

describe('readBundle: the NFR -> SLO observables derivation (T-010, US1)', () => {
  it('lists an NFR with a linked <spec-slo> as traced, with its full field set', () => {
    const spec = NFR_SPEC(`
      <spec-requirement id="NFR-001" priority="must"><p>p95 latency &lt; 200 ms.</p></spec-requirement>
      <spec-slo target="NFR-001" objective="99% &lt; 200ms" window="28d" budgeting="occurrences" signal="latency">fraction under 200ms</spec-slo>
    `);
    const row = readBundle(spec, EMPTY_TASKS, '999-obs').observables.find((r) => r.nfrId === 'NFR-001');
    expect(row?.slos).toEqual([
      {
        target: 'NFR-001',
        objective: '99% < 200ms',
        window: '28d',
        budgeting: 'occurrences',
        signal: 'latency',
        sli: 'fraction under 200ms',
      },
    ]);
    expect(row?.gap).toBeUndefined();
  });

  it('classifies a quantified NFR (prose) with no SLO as a loud gap', () => {
    const spec = NFR_SPEC(`<spec-requirement id="NFR-001" priority="must"><p>p95 latency &lt; 200 ms.</p></spec-requirement>`);
    const row = readBundle(spec, EMPTY_TASKS, '999-obs').observables.find((r) => r.nfrId === 'NFR-001');
    expect(row?.slos).toEqual([]);
    expect(row?.gap).toBe('loud');
  });

  it('classifies a quantified NFR via slo= (light annotation, no element) as a loud gap', () => {
    // A bare slo= satisfies 047's minimal quantified gate but has no SLI/window/
    // signal to trace here — still correctly a gap at this fuller bar.
    const spec = NFR_SPEC(`<spec-requirement id="NFR-001" priority="must" slo="99% &lt; 200ms / 28d"><p>The system must be fast.</p></spec-requirement>`);
    const row = readBundle(spec, EMPTY_TASKS, '999-obs').observables.find((r) => r.nfrId === 'NFR-001');
    expect(row?.gap).toBe('loud');
  });

  it('classifies a non-quantified NFR with no SLO as a quiet n/a', () => {
    const spec = NFR_SPEC(`<spec-requirement id="NFR-001" priority="must"><p>The system must be secure.</p></spec-requirement>`);
    const row = readBundle(spec, EMPTY_TASKS, '999-obs').observables.find((r) => r.nfrId === 'NFR-001');
    expect(row?.slos).toEqual([]);
    expect(row?.gap).toBe('quiet');
  });

  it('never includes a non-NFR requirement (FR-*)', () => {
    const spec = NFR_SPEC(`<spec-requirement id="FR-001" priority="must"><p>The system must be fast.</p></spec-requirement>`);
    expect(readBundle(spec, EMPTY_TASKS, '999-obs').observables).toEqual([]);
  });

  it('lists NFRs in document order, one row per NFR even with multiple SLOs', () => {
    const spec = NFR_SPEC(`
      <spec-requirement id="NFR-001" priority="must"><p>Fast.</p></spec-requirement>
      <spec-requirement id="NFR-002" priority="must"><p>Reliable.</p></spec-requirement>
      <spec-slo target="NFR-001" objective="a" window="7d" budgeting="occurrences">sli-a</spec-slo>
      <spec-slo target="NFR-001" objective="b" window="7d" budgeting="occurrences">sli-b</spec-slo>
    `);
    const rows = readBundle(spec, EMPTY_TASKS, '999-obs').observables;
    expect(rows.map((r) => r.nfrId)).toEqual(['NFR-001', 'NFR-002']);
    expect(rows[0]?.slos).toHaveLength(2);
    expect(rows[1]?.gap).toBe('quiet');
  });
});

describe('renderVerifyHtml: §Observables trace (T-110, FR-001, SC-001)', () => {
  const render = (specHtml: string, captured?: CapturedRun): string =>
    renderVerifyHtml(readBundle(specHtml, EMPTY_TASKS, '999-obs'), captured);

  it('renders an §observables section', () => {
    const spec = NFR_SPEC(`<spec-requirement id="NFR-001" priority="must"><p>p95 &lt; 200ms.</p></spec-requirement>`);
    expect(render(spec)).toMatch(/<section id="observables">/);
  });

  it('links a traced NFR to its spec anchor', () => {
    const spec = NFR_SPEC(`
      <spec-requirement id="NFR-001" priority="must"><p>p95 &lt; 200 ms.</p></spec-requirement>
      <spec-slo target="NFR-001" objective="99%" window="28d" budgeting="occurrences">sli</spec-slo>
    `);
    expect(render(spec)).toContain('<a href="./spec.html#NFR-001">NFR-001</a>');
  });

  it('renders a loud gap for a quantified NFR with no SLO', () => {
    const spec = NFR_SPEC(`<spec-requirement id="NFR-001" priority="must"><p>p95 &lt; 200 ms.</p></spec-requirement>`);
    const html = render(spec);
    expect(html).toMatch(/<strong[^>]*>[^<]*NFR-001[^<]*<\/strong>|<strong[^>]*>[\s\S]*?<\/strong>/);
    expect(html).toMatch(/no.*(linked|spec-slo)/i);
  });

  it('renders a quiet n/a for a non-quantified NFR with no SLO, not the loud style', () => {
    const spec = NFR_SPEC(`<spec-requirement id="NFR-001" priority="must"><p>The system must be secure.</p></spec-requirement>`);
    const html = render(spec);
    expect(html).toMatch(/n\/a/i);
  });

  it('shows a "no SLOs declared" note when the bundle carries no <spec-slo> at all', () => {
    const spec = NFR_SPEC(`<h1>999-obs</h1>`); // no NFRs, no SLOs
    expect(render(spec)).toMatch(/no SLOs declared/i);
  });
});

/**
 * The instrumentation capture (T-200/T-210, US2, FR-002). Mirrors
 * renderRunBlock's contract exactly (packages/core/test/verify.test.ts):
 * typed elements that stay EMPTY when unrecorded (CSS renders them loudly,
 * FR-009), and a `data-status="suggested"` marker + banner when
 * `verified:false`. Written test-first — FAILS until T-210 lands.
 */
const SLO_SPEC = NFR_SPEC(`
  <spec-requirement id="NFR-001" priority="must"><p>p95 &lt; 200 ms.</p></spec-requirement>
  <spec-slo target="NFR-001" objective="99%" window="28d" budgeting="occurrences" signal="latency">sli</spec-slo>
`);

describe('renderVerifyHtml: the observables capture (T-210, US2, FR-002)', () => {
  const render = (captured?: CapturedRun): string => renderVerifyHtml(readBundle(SLO_SPEC, EMPTY_TASKS, '999-obs'), captured);

  it('writes the captured endpoint and observed signals into typed elements', () => {
    const html = render({
      observables: { endpoint: 'GET /metrics', signals: ['latency', 'errors'], slosCite: ['NFR-001'] },
    });
    expect(html).toContain('<spec-observed-endpoint>GET /metrics</spec-observed-endpoint>');
    expect(html).toContain('<spec-observed-signals>latency, errors</spec-observed-signals>');
  });

  it('leaves the instrumentation fields EMPTY when no capture is present, so CSS renders it loudly (FR-009)', () => {
    const html = render();
    expect(html).toContain('<spec-observed-endpoint></spec-observed-endpoint>');
    expect(html).toContain('<spec-observed-signals></spec-observed-signals>');
  });

  it('marks a verified:false observed block as suggested with a warning', () => {
    const html = render({ observables: { endpoint: 'GET /metrics', signals: ['latency'], verified: false } });
    expect(html).toContain('<spec-observed-block data-status="suggested">');
    expect(html).toMatch(/Suggested — not yet run/);
  });

  it('a verified (default / true) observed block carries no suggested marker', () => {
    expect(render({ observables: { endpoint: 'x', signals: [] } })).toContain('<spec-observed-block>');
    expect(render({ observables: { endpoint: 'x', signals: [] } })).not.toContain('data-status="suggested"');
  });
});

/** In-memory FileSystem keyed by path suffix (mirrors verify.test.ts's memFs). */
function memFs(files: Record<string, string>): FileSystem {
  const find = (p: string): string | undefined => {
    const key = Object.keys(files).find((k) => p.endsWith(k));
    return key ? files[key] : undefined;
  };
  return {
    readFile: async (p) => {
      const v = find(p);
      if (v === undefined) throw new Error(`ENOENT: ${p}`);
      return v;
    },
    writeFile: async () => undefined,
    readdir: async () => [],
    stat: async () => ({ isFile: true, isDirectory: false }),
    rename: async () => undefined,
  };
}
const ctxFor = (files: Record<string, string>): KernelContext => ({ cwd: '/repo', fs: memFs(files), ai: undefined as never });

describe('verifyCommand: standalone regen preserves the observables capture (T-211, NFR-001)', () => {
  it('preserves the captured observables block on a links-only regeneration', async () => {
    const captured: CapturedRun = { observables: { endpoint: 'GET /metrics', signals: ['latency'], slosCite: ['NFR-001'] } };
    const first = await verifyCommand(
      { specId: '999-obs', capturedRun: captured },
      ctxFor({ '999-obs/spec.html': SLO_SPEC, '999-obs/tasks.html': EMPTY_TASKS }),
    );
    expect(first.html).toContain('<spec-observed-endpoint>GET /metrics</spec-observed-endpoint>');

    const regen = await verifyCommand(
      { specId: '999-obs' },
      ctxFor({
        '999-obs/spec.html': SLO_SPEC,
        '999-obs/tasks.html': EMPTY_TASKS,
        '999-obs/verify.html': first.html,
      }),
    );
    expect(regen.html).toContain('<spec-observed-endpoint>GET /metrics</spec-observed-endpoint>'); // preserved
    expect(regen.html).toContain('spec.html#NFR-001'); // observables trace re-derived
  });
});

/**
 * The declared-vs-observed signal cross-check (T-300/T-310, US3, FR-003,
 * D-003). SLO_SPEC's NFR-001 SLO declares signal="latency". Fires only when
 * the capture is verified (run) — a suggested or absent capture's "missing"
 * signal means "not checked", not "not emitted", so no gap. Written
 * test-first — FAILS until T-310 lands.
 */
describe('renderVerifyHtml: the declared-vs-observed signal cross-check (T-310, US3, FR-003)', () => {
  const render = (captured?: CapturedRun): string => renderVerifyHtml(readBundle(SLO_SPEC, EMPTY_TASKS, '999-obs'), captured);

  it('renders no gap when the verified capture observed the declared signal', () => {
    const html = render({ observables: { endpoint: 'GET /metrics', signals: ['latency'] } });
    expect(html).toContain('<code>latency</code>');
    expect(html).not.toMatch(/not observed|unobserved/i);
  });

  it('renders a loud gap when the verified capture did NOT observe the declared signal', () => {
    const html = render({ observables: { endpoint: 'GET /metrics', signals: ['errors'] } }); // latency missing
    expect(html).toMatch(/<strong[^>]*>[\s\S]*?latency[\s\S]*?<\/strong>/);
    expect(html).toMatch(/not observed|unobserved/i);
  });

  it('does NOT gap a suggested (verified:false) capture missing the signal — not checked, not "not emitted"', () => {
    const html = render({ observables: { endpoint: 'GET /metrics', signals: ['errors'], verified: false } });
    expect(html).toContain('<code>latency</code>');
    expect(html).not.toMatch(/not observed|unobserved/i);
  });

  it('does NOT gap when there is no capture at all', () => {
    const html = render();
    expect(html).toContain('<code>latency</code>');
    expect(html).not.toMatch(/not observed|unobserved/i);
  });
});
