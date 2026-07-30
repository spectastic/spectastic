import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * T-112 of specs/014-core-implement/tasks.html. CLI integration tests for
 * `spectastic implement`. The verb is fully deterministic (no AI in v1
 * outside the bundled-flip prompt), so we cover real happy paths for both
 * T-NNN (tasks.html tick) and I-NNN (inbox.html tick) plus the documented
 * error / usage modes.
 */

const here = dirname(fileURLToPath(import.meta.url));
const CLI = resolve(here, '..', 'bin', 'spectastic');

interface RunResult {
  stdout: string;
  stderr: string;
  code: number;
}

async function runCLI(args: string[], cwd: string): Promise<RunResult> {
  return new Promise((resolveFn) => {
    const child = spawn('node', [CLI, ...args], { cwd, env: process.env });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('close', (code) => resolveFn({ stdout, stderr, code: code ?? 0 }));
  });
}

function buildTasksFixture(taskIds: string[]): string {
  const tasks = taskIds
    .map(
      (id) =>
        `<spec-task id="${id}"><input type="checkbox"><div><strong>Task ${id}</strong> <span class="path">src/${id}.ts</span></div></spec-task>`,
    )
    .join('\n');
  return `<!doctype html><html><body><main>
<header><spec-meta><b>Status</b><span><spec-status value="draft">Draft</spec-status></span></spec-meta></header>
<section><spec-tldr><p>Test fixture.</p></spec-tldr></section>
<section id="phase-setup"><h2>Phase</h2>
${tasks}
</section>
<section id="changelog"><spec-changelog><ol><li><time datetime="2026-06-17">17 Jun 2026</time><span>Test fixture.</span></li></ol></spec-changelog></section>
</main></body></html>
`;
}

function buildInboxFixture(cards: { id: string; status?: string }[]): string {
  const triageBlocks = cards
    .map(
      (c) =>
        `<spec-triage id="${c.id}" layer="just-do"${c.status ? ` data-status="${c.status}"` : ''}>
  <header><h4>Card ${c.id}</h4></header>
  <p class="headline">Test card ${c.id}.</p>
  <dl><dt>Target</dt><dd>nowhere</dd><dt>Why small</dt><dd>test</dd></dl>
</spec-triage>`,
    )
    .join('\n');
  return `<!doctype html><html><body><main>
<header><spec-meta></spec-meta></header>
<section><spec-tldr><p>Test inbox.</p></spec-tldr></section>
<section id="cards"><h2>Cards</h2>
<spec-triage-log>
${triageBlocks}
</spec-triage-log>
</section>
<section id="changelog"><spec-changelog><ol><li><time datetime="2026-06-17">17 Jun 2026</time><span>Test fixture.</span></li></ol></spec-changelog></section>
</main></body></html>
`;
}

describe('CLI integration: implement (T-112)', () => {
  it('ticks a T-NNN task in specs/<id>/tasks.html and writes the file', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'spectastic-implement-task-'));
    const specDir = join(cwd, 'specs', 'foo-bar');
    mkdirSync(specDir, { recursive: true });
    const tasksPath = join(specDir, 'tasks.html');
    writeFileSync(tasksPath, buildTasksFixture(['T-001', 'T-002']));

    const r = await runCLI(['implement', 'T-001'], cwd);
    expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);
    expect(r.stdout).toContain('Ticked T-001');

    const after = readFileSync(tasksPath, 'utf8');
    // T-001 ticked, T-002 untouched.
    expect(after).toContain('id="T-001"><input type="checkbox" checked>');
    expect(after).toContain('id="T-002"><input type="checkbox">');
    expect(after).not.toContain('id="T-002"><input type="checkbox" checked>');
  });

  it('ticks an I-NNN inbox card and writes data-status="done"', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'spectastic-implement-inbox-'));
    writeFileSync(join(cwd, 'inbox.html'), buildInboxFixture([{ id: 'I-001' }, { id: 'I-002' }]));

    const r = await runCLI(['implement', 'I-001'], cwd);
    expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);
    expect(r.stdout).toContain('Ticked I-001');

    const after = readFileSync(join(cwd, 'inbox.html'), 'utf8');
    expect(after).toContain('id="I-001" data-status="done"');
    expect(after).toContain('id="I-002"');
    expect(after).not.toContain('id="I-002" data-status="done"');
  });

  it('refuses T-NNN that does not exist in any tasks.html with exit 2', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'spectastic-implement-notfound-'));
    mkdirSync(join(cwd, 'specs'), { recursive: true });

    const r = await runCLI(['implement', 'T-999'], cwd);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('not found in any specs/**/tasks.html');
  });

  it('refuses unrecognised target shape (not T-NNN or I-NNN) with exit 2', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'spectastic-implement-badshape-'));

    const r = await runCLI(['implement', 'banana-001'], cwd);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('not recognised');
    expect(r.stderr).toContain('T-NNN');
    expect(r.stderr).toContain('I-NNN');
  });

  it('refuses drain modes with deferral message', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'spectastic-implement-drain-'));

    const r = await runCLI(['implement', 'T-001', '--all'], cwd);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('Drain modes');
    expect(r.stderr).toContain('deferred');
    expect(r.stderr).toContain('Single-task only');
  });
});
