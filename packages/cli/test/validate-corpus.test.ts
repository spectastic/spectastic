import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Integration test for the corpus-well-formed CLI scan (051-knowledge-corpus
 * T-102, plan D-003). Spawns the real `spectastic validate` binary against a
 * temp project with a `knowledge/` fixture, mirroring
 * validate.quantified-nfr.integration.test.ts's harness.
 *
 * Written before scanCorpusWellFormed is wired (T-110/T-112) — failing (exit
 * 0 when it should be 1) until then, and needs a fresh build
 * (`pnpm --filter @spectastic/cli build`) to pick up the scan.
 */

const here = dirname(fileURLToPath(import.meta.url));
const CLI = resolve(here, '..', 'bin', 'spectastic');
const RULE = 'corpus-well-formed';

const MINIMAL_SPEC = `<!doctype html>
<html><head><meta charset="utf-8"><title>Fixture · Specification</title></head>
<body><main>
<spec-requirement id="FR-001" priority="must"><p>Placeholder requirement.</p></spec-requirement>
</main></body></html>
`;

interface RunResult {
  stdout: string;
  stderr: string;
  code: number;
}

async function runCLI(args: string[], cwd: string): Promise<RunResult> {
  return new Promise((resolveFn) => {
    const child = spawn('node', [CLI, ...args], {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c: Buffer) => (stdout += c.toString('utf8')));
    child.stderr.on('data', (c: Buffer) => (stderr += c.toString('utf8')));
    child.stdin.end();
    child.on('close', (code) => resolveFn({ stdout, stderr, code: code ?? 0 }));
  });
}

function project(tag: string): string {
  const dir = mkdtempSync(join(tmpdir(), `spectastic-corpus-${tag}-`));
  writeFileSync(join(dir, 'spec.html'), MINIMAL_SPEC, 'utf8');
  return dir;
}

function seedDanglingCorpus(dir: string): void {
  const packDir = join(dir, 'knowledge', 'fixture-pack');
  mkdirSync(join(packDir, 'references'), { recursive: true });
  writeFileSync(join(packDir, 'SKILL.md'), '# fixture-pack\n');
  writeFileSync(
    join(packDir, 'index.md'),
    [
      '| ID | Title | Description | Edition | Path |',
      '| --- | --- | --- | --- | --- |',
      '| KB-002 | Missing doc | A row with no matching file | 2024-01-01 | references/KB-002-missing.md |',
      '',
    ].join('\n'),
    'utf8',
  );
  // Deliberately no references/KB-002-missing.md — a dangling index row.
}

describe('spectastic validate: corpus-well-formed scan (051 T-102)', () => {
  it('errors on a dangling index row referencing a document that does not exist', async () => {
    const dir = project('dangling');
    seedDanglingCorpus(dir);
    const r = await runCLI(['validate', 'spec.html'], dir);
    expect(r.code, r.stdout).not.toBe(0);
    expect(r.stdout).toContain(RULE);
    expect(r.stdout).toContain('KB-002');
  });

  it('is a no-op with no knowledge/ directory at all', async () => {
    const dir = project('no-knowledge-dir');
    const r = await runCLI(['validate', 'spec.html'], dir);
    expect(r.code, r.stdout).toBe(0);
    expect(r.stdout).not.toContain(RULE);
  });
});
