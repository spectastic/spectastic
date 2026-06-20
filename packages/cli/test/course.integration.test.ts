import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * T-100 of specs/019-explain-course/tasks.html. Stub-driven integration over
 * `spectastic course` (the 015 pattern): the agent's draft is piped on stdin;
 * the kernel verifies (reference existence FR-003/SC-001, blind guessability
 * FR-004/SC-002), assembles, and writes under .spectastic/courses/. The blind
 * guessability call is routed through SPECTASTIC_AI_STUB.
 */

const here = dirname(fileURLToPath(import.meta.url));
const CLI = resolve(here, '..', 'bin', 'spectastic');

interface RunResult {
  stdout: string;
  stderr: string;
  code: number;
}

function runCourse(
  args: string[],
  cwd: string,
  stdin: string,
  stubPath: string,
): Promise<RunResult> {
  return new Promise((resolveFn) => {
    const child = spawn('node', [CLI, 'course', ...args], {
      cwd,
      env: { ...process.env, SPECTASTIC_AI_STUB: stubPath, ANTHROPIC_API_KEY: '' },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c: Buffer) => (stdout += c.toString('utf8')));
    child.stderr.on('data', (c: Buffer) => (stderr += c.toString('utf8')));
    child.on('close', (code) => resolveFn({ stdout, stderr, code: code ?? 0 }));
    child.stdin.write(stdin);
    child.stdin.end();
  });
}

/** A tmp project with one fixture spec carrying id="FR-001". */
function fixtureProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'spectastic-course-'));
  mkdirSync(join(dir, 'specs', '999-fixture'), { recursive: true });
  writeFileSync(
    join(dir, 'specs', '999-fixture', 'spec.html'),
    '<!doctype html><html><body><spec-requirement id="FR-001"><p>A fixture requirement.</p></spec-requirement></body></html>',
  );
  return dir;
}

function stubFile(dir: string, blindAnswer: string): string {
  const p = join(dir, 'stub.json');
  writeFileSync(p, JSON.stringify({ subagent: [{ output: blindAnswer }] }));
  return p;
}

function draft(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    target: '999-fixture',
    title: 'Fixture course',
    outcome: 'understand the fixture',
    objectives: [
      {
        title: 'The fixture requirement',
        read: 'This objective grounds in FR-001 of the fixture spec.',
        quiz: { question: 'What does FR-001 cover?', options: ['nothing', 'auth', 'a fixture requirement'], correctIndex: 2, feedback: ['', '', 'right'] },
        teachBack: 'Explain FR-001 in your own words.',
        refs: ['FR-001'],
      },
    ],
    ...overrides,
  });
}

function listFiles(dir: string, base = dir): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...listFiles(full, base));
    else out.push(full.slice(base.length + 1));
  }
  return out;
}

describe('course CLI (T-100, FR-003/FR-004/SC-001/SC-002)', () => {
  it('clean draft → writes a course.html under .spectastic/courses/, git-ignored', async () => {
    const dir = fixtureProject();
    const r = await runCourse(['--target', '999-fixture'], dir, draft(), stubFile(dir, '0')); // blind wrong ⇒ not guessable
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);

    const files = listFiles(dir);
    const course = files.find((f) => f.startsWith('.spectastic/courses/') && f.endsWith('course.html'));
    expect(course, `files: ${files.join(', ')}`).toBeTruthy();
    expect(files).toContain('.spectastic/.gitignore');

    const html = readFileSync(join(dir, course as string), 'utf8');
    expect(html).toContain('The fixture requirement'); // objective title
    expect(html).toContain('What does FR-001 cover?'); // quiz question
    expect(html).toContain('<spec-task'); // mastery ledger
    expect(html).toContain('class="quiz"');
  });

  it('a cited ref that does not resolve → refused, no course written (SC-001)', async () => {
    const dir = fixtureProject();
    const bad = draft({
      objectives: [
        { title: 'Ghost', read: 'cites a ghost', quiz: { question: 'q', options: ['a', 'b'], correctIndex: 0 }, refs: ['FR-999'] },
      ],
    });
    const r = await runCourse(['--target', '999-fixture'], dir, bad, stubFile(dir, '1'));
    expect(r.code).not.toBe(0);
    expect(r.stderr + r.stdout).toMatch(/FR-999|missing/i);
    expect(listFiles(dir).some((f) => f.endsWith('course.html'))).toBe(false);
  });

  it('a guessable quiz item → refused (SC-002)', async () => {
    const dir = fixtureProject();
    const r = await runCourse(['--target', '999-fixture'], dir, draft(), stubFile(dir, '2')); // blind picks correctIndex 2
    expect(r.code).not.toBe(0);
    expect(r.stderr + r.stdout).toMatch(/guessable/i);
    expect(listFiles(dir).some((f) => f.endsWith('course.html'))).toBe(false);
  });

  it('an unresolvable target → refused (FR-002)', async () => {
    const dir = fixtureProject();
    const r = await runCourse(['--target', 'ghost-spec'], dir, draft({ target: 'ghost-spec' }), stubFile(dir, '0'));
    expect(r.code).not.toBe(0);
    expect(listFiles(dir).some((f) => f.endsWith('course.html'))).toBe(false);
  });

  it('the generated course degrades with JS off — gate is an enhancement (T-200, SC-003)', async () => {
    const dir = fixtureProject();
    const r = await runCourse(['--target', '999-fixture'], dir, draft(), stubFile(dir, '0'));
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
    const course = listFiles(dir).find((f) => f.endsWith('course.html')) as string;
    const html = readFileSync(join(dir, course), 'utf8');

    // The quiz gate ships as an inline enhancement script…
    expect(html).toMatch(/querySelectorAll\(['"]\.quiz['"]\)/);
    // …but the no-JS baseline must not dead-end: the mastery checkbox stays
    // directly markable (never disabled) and the answer renders inline.
    expect(html).not.toMatch(/type="checkbox"\s+disabled/);
    expect(html).toContain('<details class="quiz-answer">');
  });
});
