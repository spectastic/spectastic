import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  readBundle,
  renderRunBlock,
  renderTrace,
  renderVerifyHtml,
  verifyCommand,
} from '../src/commands/verify.js';
import type { CapturedRun, FileSystem, KernelContext } from '../src/types.js';

/**
 * Unit tests for the verify engine (spec 021-verify-view). The bundle reader
 * (T-010 / D-002), the Run/Demo block (T-101 / FR-004), the trace (T-201 /
 * FR-002,003), and idempotency (T-301 / NFR-002). Pure functions, no fs stub.
 */

const here = dirname(fileURLToPath(import.meta.url));
const fix = join(here, '..', 'src', 'commands', '__fixtures__', 'verify');
const SPEC = readFileSync(join(fix, 'spec.html'), 'utf8');
const TASKS = readFileSync(join(fix, 'tasks.html'), 'utf8');

const model = () => readBundle(SPEC, TASKS, '999-fixture');

describe('readBundle: the SC -> US join (T-010, D-002)', () => {
  it('lists every success criterion in document order', () => {
    expect(model().scIds).toEqual(['SC-001', 'SC-002']);
  });

  it('joins each SC to its user story and test task via the citing phase', () => {
    const t = model().trace;
    expect(t.find((r) => r.scId === 'SC-001')).toMatchObject({
      usNum: 1,
      usAnchorPresent: true,
      testTaskIds: ['T-100'],
    });
    expect(t.find((r) => r.scId === 'SC-002')).toMatchObject({ usNum: 2, testTaskIds: ['T-200'] });
  });
});

describe('renderRunBlock: captured commands -> typed elements (T-101, FR-004)', () => {
  const captured: CapturedRun = {
    run: 'pnpm --filter @spectastic/core build',
    toggle: 'none',
    tests: 'pnpm vitest run verify',
    testsCite: ['T-100', 'T-101'],
    demo: 'spectastic verify 999-fixture && open verify.html',
    demoCite: ['SC-001'],
  };

  it('writes each captured command into its typed element', () => {
    const html = renderRunBlock(captured);
    expect(html).toContain('<spec-run>pnpm --filter @spectastic/core build</spec-run>');
    expect(html).toContain('<spec-toggle>none</spec-toggle>');
    expect(html).toContain('pnpm vitest run verify');
    expect(html).toContain('spectastic verify 999-fixture');
  });

  it('emits cites attributes from the captured ids (FR-004)', () => {
    const html = renderRunBlock(captured);
    expect(html).toMatch(/<spec-tests cites="T-100 T-101">/);
    expect(html).toMatch(/<spec-demo cites="SC-001">/);
  });

  it('leaves a missing field as an EMPTY element so CSS renders it loudly (FR-009)', () => {
    const html = renderRunBlock({ run: 'only run' });
    expect(html).toContain('<spec-toggle></spec-toggle>');
    expect(html).toContain('<spec-tests></spec-tests>');
    expect(html).toContain('<spec-demo></spec-demo>');
  });

  it('escapes captured content', () => {
    expect(renderRunBlock({ run: 'echo "<a>" & b' })).toContain(
      '<spec-run>echo &quot;&lt;a&gt;&quot; &amp; b</spec-run>',
    );
  });
});

describe('renderVerifyHtml: shell discipline (T-013/T-101)', () => {
  it('carries a derived status and no <spec-status> of its own (FR-007)', () => {
    const html = renderVerifyHtml(model(), undefined);
    expect(html).toContain('Derived status');
    expect(html).not.toContain('<spec-status');
  });

  it('is idempotent on an unchanged bundle (NFR-002)', () => {
    expect(renderVerifyHtml(model(), undefined)).toEqual(renderVerifyHtml(model(), undefined));
  });
});

describe('renderTrace: SC -> acceptance -> test links (T-201, FR-002/003)', () => {
  it('links every SC to its anchor, acceptance (#USn) and closing test task — never copies prose', () => {
    const html = renderTrace(model());
    expect(html).toContain('spec.html#SC-001');
    expect(html).toContain('spec.html#US1');
    expect(html).toContain('tasks.html#T-100');
    expect(html).toContain('spec.html#SC-002');
    expect(html).toContain('spec.html#US2');
    // The SC's prose ("measurably") must NOT be copied — links only.
    expect(html).not.toContain('measurably');
  });

  it('falls back to #scenarios when the US anchor is absent', () => {
    const noAnchor = readBundle(SPEC.replaceAll(' id="US1"', '').replaceAll(' id="US2"', ''), TASKS, '999-fixture');
    expect(renderTrace(noAnchor)).toContain('spec.html#scenarios');
  });
});

/** In-memory FileSystem keyed by path suffix — enough for the verify engine. */
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

const ctxFor = (files: Record<string, string>): KernelContext =>
  ({ cwd: '/repo', fs: memFs(files), ai: undefined as never });

describe('verifyCommand: standalone regen preserves the Run block + idempotency (T-301, FR-006/NFR-002)', () => {
  it('preserves the captured Run block on a links-only regeneration', async () => {
    const captured: CapturedRun = { run: 'pnpm build', tests: 'pnpm test', toggle: 'none', demo: 'open it' };
    // First pass with a captured run.
    const first = await verifyCommand(
      { specId: '999-fixture', capturedRun: captured },
      ctxFor({ '999-fixture/spec.html': SPEC, '999-fixture/tasks.html': TASKS }),
    );
    expect(first.html).toContain('<spec-run>pnpm build</spec-run>');

    // Bare regeneration: no captured run, but the prior verify.html exists.
    const regen = await verifyCommand(
      { specId: '999-fixture' },
      ctxFor({
        '999-fixture/spec.html': SPEC,
        '999-fixture/tasks.html': TASKS,
        '999-fixture/verify.html': first.html,
      }),
    );
    expect(regen.html).toContain('<spec-run>pnpm build</spec-run>'); // preserved
    expect(regen.html).toContain('tasks.html#T-100'); // trace re-derived
  });

  it('is byte-identical on repeated regeneration of an unchanged bundle (NFR-002)', async () => {
    const files = { '999-fixture/spec.html': SPEC, '999-fixture/tasks.html': TASKS };
    const a = await verifyCommand({ specId: '999-fixture' }, ctxFor(files));
    const b = await verifyCommand(
      { specId: '999-fixture' },
      ctxFor({ ...files, '999-fixture/verify.html': a.html }),
    );
    const c = await verifyCommand(
      { specId: '999-fixture' },
      ctxFor({ ...files, '999-fixture/verify.html': b.html }),
    );
    expect(b.html).toEqual(c.html);
  });
});
