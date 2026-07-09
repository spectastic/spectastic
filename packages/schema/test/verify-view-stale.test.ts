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
