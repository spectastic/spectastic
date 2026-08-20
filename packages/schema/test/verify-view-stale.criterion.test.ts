import { describe, expect, it } from 'vitest';
import { validateMany } from '../src/index.js';

/**
 * The drift rule still joins on `<spec-criterion>` (108-success-criteria,
 * T-201, FR-012). Same harness `verify-view-stale.test.ts` already
 * established, with one SC authored as a criterion instead of a
 * requirement — the completeness/drift behaviour must be identical either
 * way, because `specScIds` must see both element types.
 */

const SPEC = (scs: string[]): string =>
  `<!doctype html><html lang="en"><body><main>
<header><p class="small-caps">Specification · 999-y</p></header>
<section id="success">${scs
    .map((id, i) =>
      i === 0
        ? `<spec-criterion id="${id}" actor="reviewer"><p>crit ${id}.</p></spec-criterion>`
        : `<spec-requirement id="${id}" priority="must"><p>crit ${id}.</p></spec-requirement>`,
    )
    .join('')}</section>
</main></body></html>`;

const phase = (n: number, sc: string, testId?: string): string =>
  `<section id="phase-us${n}" class="phase"><h2>US${n}</h2>
<h3>Tests (write &amp; fail first)</h3>
${testId ? `<spec-task id="${testId}"><input type="checkbox"><div><strong>test</strong> <span class="path">fixtures/x/</span></div></spec-task>` : ''}
<h3>Implementation</h3>
<spec-task id="T-${n}90"><input type="checkbox"><div><strong>impl</strong> <span class="path">src/x.ts</span></div></spec-task>
<spec-note><p>Closes <a href="./spec.html#${sc}">${sc}</a>.</p></spec-note></section>`;

const TASKS = (...sections: string[]): string =>
  `<!doctype html><html lang="en"><body><main><header><p class="small-caps">Tasks · 999-y</p></header>${sections.join('')}</main></body></html>`;

const VERIFY = (scs: string[], tasks: string[]): string =>
  `<!doctype html><html lang="en"><body><main><header><h1>999-y verify</h1></header>
<section id="trace"><table><tbody>${scs.map((id) => `<a href="./spec.html#${id}">${id}</a>`).join('')}${tasks.map((id) => `<a href="./tasks.html#${id}">${id}</a>`).join('')}</tbody></table></section>
</main></body></html>`;

function stale(spec: string, tasks: string, verify: string) {
  return validateMany([
    { file: 'specs/999-y/spec.html', html: spec },
    { file: 'specs/999-y/tasks.html', html: tasks },
    { file: 'specs/999-y/verify.html', html: verify },
  ]).filter((f) => f.rule === 'verify-view-stale');
}

describe('verify-view-stale: a criterion-authored SC (108 FR-012)', () => {
  it('fires completeness for a criterion-authored SC with no test task, same as a requirement-authored one would', () => {
    const spec = SPEC(['SC-001', 'SC-002']); // SC-001 is a <spec-criterion>
    const tasks = TASKS(phase(1, 'SC-001'), phase(2, 'SC-002', 'T-200')); // SC-001 has no test task
    const verify = VERIFY(['SC-001', 'SC-002'], ['T-200']);
    const f = stale(spec, tasks, verify);
    expect(f).toHaveLength(1);
    expect(f[0]!.message).toMatch(/SC-001/);
  });

  it('stays clean when a criterion-authored SC has its Tests-subsection task, the same as a requirement-authored one', () => {
    const spec = SPEC(['SC-001']);
    const tasks = TASKS(phase(1, 'SC-001', 'T-100'));
    const verify = VERIFY(['SC-001'], ['T-100']);
    expect(stale(spec, tasks, verify)).toHaveLength(0);
  });
});
