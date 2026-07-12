import { describe, expect, it } from 'vitest';
import { validateMany } from '../src/index.js';

/**
 * The completeness leg of verify-view-stale (021-verify-view, FR-008 as amended by
 * the trace-by-tests-section change): a closed SC that resolves to no test task is a
 * loud gap, gated on the bundle being test-bearing, and identified by the Tests
 * subsection (not file path). The drift leg stays covered by the registry fixtures.
 */

const SPEC = (scs: string[]): string =>
  `<!doctype html><html lang="en"><body><main>
<header><p class="small-caps">Specification · 999-x</p></header>
<section id="success">${scs.map((id) => `<spec-requirement id="${id}" priority="must"><p>crit ${id}.</p></spec-requirement>`).join('')}</section>
</main></body></html>`;

/** A `phase-usN` section closing `sc`; includes a Tests-subsection task only if `testId` is given. */
const phase = (n: number, sc: string, testId?: string): string =>
  `<section id="phase-us${n}" class="phase"><h2>US${n}</h2>
<h3>Tests (write &amp; fail first)</h3>
${testId ? `<spec-task id="${testId}"><input type="checkbox"><div><strong>test</strong> <span class="path">fixtures/x/</span></div></spec-task>` : ''}
<h3>Implementation</h3>
<spec-task id="T-${n}90"><input type="checkbox"><div><strong>impl</strong> <span class="path">src/x.ts</span></div></spec-task>
<spec-note><p>Closes <a href="./spec.html#${sc}">${sc}</a>.</p></spec-note></section>`;

const TASKS = (...sections: string[]): string =>
  `<!doctype html><html lang="en"><body><main><header><p class="small-caps">Tasks · 999-x</p></header>${sections.join('')}</main></body></html>`;

const VERIFY = (scs: string[], tasks: string[]): string =>
  `<!doctype html><html lang="en"><body><main><header><h1>999-x verify</h1></header>
<section id="trace"><table><tbody>${scs.map((id) => `<a href="./spec.html#${id}">${id}</a>`).join('')}${tasks.map((id) => `<a href="./tasks.html#${id}">${id}</a>`).join('')}</tbody></table></section>
</main></body></html>`;

function stale(spec: string, tasks: string, verify: string) {
  return validateMany([
    { file: 'specs/999-x/spec.html', html: spec },
    { file: 'specs/999-x/tasks.html', html: tasks },
    { file: 'specs/999-x/verify.html', html: verify },
  ]).filter((f) => f.rule === 'verify-view-stale');
}

describe('verify-view-stale: completeness (021 FR-008, amended)', () => {
  it('fires when a closed SC resolves to no test task (bundle is test-bearing)', () => {
    const spec = SPEC(['SC-001', 'SC-002']);
    const tasks = TASKS(phase(1, 'SC-001', 'T-100'), phase(2, 'SC-002')); // SC-002 has no test task
    const verify = VERIFY(['SC-001', 'SC-002'], ['T-100']); // consistent → no drift, only completeness
    const f = stale(spec, tasks, verify);
    expect(f).toHaveLength(1);
    expect(f[0]!.message).toMatch(/incomplete/);
    expect(f[0]!.message).toMatch(/SC-002/);
  });

  it('is exempt for a genuinely test-less bundle (no test task anywhere)', () => {
    const spec = SPEC(['SC-001']);
    const tasks = TASKS(phase(1, 'SC-001')); // no test task at all → gated off
    const verify = VERIFY(['SC-001'], []);
    expect(stale(spec, tasks, verify)).toHaveLength(0);
  });

  it('stays clean when every closed SC has a Tests-subsection task', () => {
    const spec = SPEC(['SC-001']);
    const tasks = TASKS(phase(1, 'SC-001', 'T-100'));
    const verify = VERIFY(['SC-001'], ['T-100']);
    expect(stale(spec, tasks, verify)).toHaveLength(0);
  });
});

/** A `phase-usN` with NO Tests subsection — tasks are flat; test-hood decided by path (FR-003 fallback). */
const flatPhase = (
  n: number,
  sc: string,
  opts: { testId?: string; implId?: string },
): string =>
  `<section id="phase-us${n}" class="phase"><h2>US${n}</h2>
${opts.testId ? `<spec-task id="${opts.testId}"><input type="checkbox"><div><strong>test</strong> <span class="path">packages/core/test/x.test.ts</span></div></spec-task>` : ''}
${opts.implId ? `<spec-task id="${opts.implId}"><input type="checkbox"><div><strong>impl</strong> <span class="path">packages/core/src/x.ts</span></div></spec-task>` : ''}
<spec-note><p>Closes <a href="./spec.html#${sc}">${sc}</a>.</p></spec-note></section>`;

describe('verify-view-stale: path fallback for subsection-less phases (021 FR-003, mirrors the generator)', () => {
  it('recognises a flat .test. task by path, so a consistent view stays clean', () => {
    const spec = SPEC(['SC-001']);
    const tasks = TASKS(flatPhase(1, 'SC-001', { testId: 'T-100', implId: 'T-110' }));
    const verify = VERIFY(['SC-001'], ['T-100']); // proof leg = T-100 by path; T-110 excluded
    expect(stale(spec, tasks, verify)).toHaveLength(0);
  });

  it('fires completeness when a subsection-less phase resolves to only an impl task', () => {
    // Bundle is test-bearing (phase 1 has a .test. task) but SC-002's phase is impl-only.
    const spec = SPEC(['SC-001', 'SC-002']);
    const tasks = TASKS(
      flatPhase(1, 'SC-001', { testId: 'T-100' }),
      flatPhase(2, 'SC-002', { implId: 'T-210' }),
    );
    const verify = VERIFY(['SC-001', 'SC-002'], ['T-100']);
    const f = stale(spec, tasks, verify);
    expect(f).toHaveLength(1);
    expect(f[0]!.message).toMatch(/SC-002/);
  });
});

/**
 * The observables-drift leg (048-verify-slo-trace, FR-004): the expected NFR
 * id set — every NFR referenced by a `<spec-slo target>` in spec.html — must
 * match the NFR ids `verify.html`'s §observables section links. Written
 * test-first (T-101): the drift case FAILS until the rule widens (T-111); an
 * empty set (no SLOs) means no finding either way, so those cases already
 * hold and stay held once the rule lands.
 */
const NFR_SPEC = (nfrId: string, hasSlo: boolean): string =>
  `<!doctype html><html lang="en"><body><main>
<header><p class="small-caps">Specification · 999-x</p></header>
<spec-requirement id="${nfrId}" priority="must"><p>p95 latency &lt; 200 ms.</p></spec-requirement>
${hasSlo ? `<spec-slo target="${nfrId}" objective="99%" window="28d" budgeting="occurrences">sli</spec-slo>` : ''}
</main></body></html>`;

const NO_NFR_SPEC = `<!doctype html><html lang="en"><body><main>
<header><p class="small-caps">Specification · 999-x</p></header>
</main></body></html>`;

// A traced row: 4 plain <td>s, no colspan — mirrors the real generator's
// sloRow output (packages/core/src/commands/verify.ts).
const OBSERVABLES_VERIFY = (nfrIds: string[]): string =>
  `<!doctype html><html lang="en"><body><main><header><h1>999-x verify</h1></header>
<section id="observables"><table><tbody>${nfrIds
    .map(
      (id) =>
        `<tr><td><a href="./spec.html#${id}">${id}</a></td><td>obj</td><td>sli</td><td>—</td></tr>`,
    )
    .join('')}</tbody></table></section>
</main></body></html>`;

describe('verify-view-stale: observables drift (048 FR-004)', () => {
  it('fires when the spec’s <spec-slo target> NFR set does not match what §observables links', () => {
    const spec = NFR_SPEC('NFR-001', true);
    const verify = OBSERVABLES_VERIFY([]); // NFR-001 has an SLO; the view links nothing
    const f = stale(spec, TASKS(), verify);
    expect(f).toHaveLength(1);
    expect(f[0]!.message).toMatch(/stale/i);
    expect(f[0]!.message).toMatch(/NFR-001/);
  });

  it('stays clean when the §observables links match the spec’s <spec-slo> targets', () => {
    const spec = NFR_SPEC('NFR-001', true);
    const verify = OBSERVABLES_VERIFY(['NFR-001']);
    expect(stale(spec, TASKS(), verify)).toHaveLength(0);
  });

  it('is exempt for a bundle with no <spec-slo> at all (NFR-002 — no false positive)', () => {
    const verify = OBSERVABLES_VERIFY([]);
    expect(stale(NO_NFR_SPEC, TASKS(), verify)).toHaveLength(0);
  });

  // Regression: a gap row STILL links its NFR id (readers can jump to the
  // requirement even with no SLO — the real generator's observablesGapRow),
  // so a naive any-anchor scan would wrongly count it as "linked with an
  // SLO" and false-positive drift on a spec whose NFRs simply have no SLOs
  // yet — caught live on 048's own dogfooded verify.html.
  const GAP_ROW_VERIFY = (nfrIds: string[]): string =>
    `<!doctype html><html lang="en"><body><main><header><h1>999-x verify</h1></header>
<section id="observables"><table><tbody>${nfrIds
      .map((id) => `<tr><td><a href="./spec.html#${id}">${id}</a></td><td colspan="3">n/a</td></tr>`)
      .join('')}</tbody></table></section>
</main></body></html>`;

  it('a gap row’s NFR anchor link is NOT counted as "linked with an SLO" (regression)', () => {
    const spec = NFR_SPEC('NFR-001', false); // NFR-001 exists but has no <spec-slo>
    const verify = GAP_ROW_VERIFY(['NFR-001']); // the real generator still links the gap row's id
    expect(stale(spec, TASKS(), verify)).toHaveLength(0);
  });
});
