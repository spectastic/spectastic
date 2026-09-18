import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * `verdict --enforcer-output <path>` (inbox I-092). The path was `join`ed
 * under the cwd, so an absolute path — the shape every CI runner and
 * `mktemp` produce — became `<cwd>/var/folders/…` and was reported as
 * "could not read/parse", a misleading message for a file that parses fine.
 * The read and parse failures also shared one line, so a typo in the path
 * and a malformed SARIF read the same.
 */

const here = dirname(fileURLToPath(import.meta.url));
const CLI = resolve(here, '..', 'bin', 'spectastic');

async function runCLI(args: string[], cwd: string): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolveFn) => {
    const child = spawn('node', [CLI, ...args], { cwd });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c: Buffer) => (stdout += c.toString('utf8')));
    child.stderr.on('data', (c: Buffer) => (stderr += c.toString('utf8')));
    child.on('close', (code) => resolveFn({ stdout, stderr, code: code ?? 0 }));
  });
}

const EMPTY_SARIF = JSON.stringify({ version: '2.1.0', runs: [{ tool: { driver: { name: 'x' } }, results: [] }] });

describe('verdict --enforcer-output path resolution', () => {
  it('accepts an absolute path outside the project', async () => {
    const project = mkdtempSync(join(tmpdir(), 'verdict-project-'));
    const elsewhere = mkdtempSync(join(tmpdir(), 'verdict-sarif-'));
    const sarif = join(elsewhere, 'semgrep.sarif');
    writeFileSync(sarif, EMPTY_SARIF, 'utf8');
    const r = await runCLI(['verdict', '--changed', 'src/a.ts', '--enforcer-output', sarif], project);
    expect(r.stderr).not.toMatch(/could not/);
    expect(r.code).toBe(0);
  });

  it('--out accepts an absolute path too — the same join sat two lines below', async () => {
    const project = mkdtempSync(join(tmpdir(), 'verdict-project-'));
    const elsewhere = mkdtempSync(join(tmpdir(), 'verdict-out-'));
    const out = join(elsewhere, 'verdict.json');
    const r = await runCLI(['verdict', '--changed', 'src/a.ts', '--out', out], project);
    expect(r.code).toBe(0);
    expect(existsSync(out)).toBe(true);
    expect(existsSync(join(project, out))).toBe(false);
  });

  it('still resolves a relative path against the cwd', async () => {
    const project = mkdtempSync(join(tmpdir(), 'verdict-project-'));
    writeFileSync(join(project, 'out.sarif'), EMPTY_SARIF, 'utf8');
    const r = await runCLI(['verdict', '--changed', 'src/a.ts', '--enforcer-output', 'out.sarif'], project);
    expect(r.code).toBe(0);
  });

  it('a missing file is reported as unreadable, naming the resolved path', async () => {
    const project = mkdtempSync(join(tmpdir(), 'verdict-project-'));
    const r = await runCLI(['verdict', '--changed', 'src/a.ts', '--enforcer-output', 'nope.sarif'], project);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/could not read enforcer output/);
    expect(r.stderr).toContain(join(project, 'nope.sarif'));
    expect(r.stderr).not.toMatch(/parse/);
  });

  it('a malformed file is reported as unparseable, distinct from unreadable', async () => {
    const project = mkdtempSync(join(tmpdir(), 'verdict-project-'));
    writeFileSync(join(project, 'bad.sarif'), '{ not json', 'utf8');
    const r = await runCLI(['verdict', '--changed', 'src/a.ts', '--enforcer-output', 'bad.sarif'], project);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/could not parse enforcer output/);
    expect(r.stderr).not.toMatch(/could not read/);
  });
});
