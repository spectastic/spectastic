import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Integration test for the corpus grounding gates (053-corpus-grounding-
 * gates T-101/T-201, plan D-001). Spawns the real `spectastic validate`
 * binary against a temp project with a `knowledge/` fixture, mirroring
 * 052's validate-corpus.test.ts harness.
 *
 * Written before scanCorpusGrounding is wired (T-112) — failing (exit 0
 * when it should be non-zero) until then, and needs a fresh build
 * (`pnpm --filter @spectastic/cli build`) to pick up the scan.
 */

const here = dirname(fileURLToPath(import.meta.url));
const CLI = resolve(here, '..', 'bin', 'spectastic');
const PROVENANCE_RULE = 'corpus-provenance';
const STALENESS_RULE = 'corpus-staleness';

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

const MINIMAL_SPEC = (decisionText: string) => `<!doctype html>
<html><head><meta charset="utf-8"><title>Fixture · Plan</title></head>
<body><main>
<spec-decision id="D-001" grounding="verified">
  <h4>D-001 · A domain decision</h4>
  <dl><dt>Context</dt><dd>Grounded against <code>${decisionText}</code>.</dd></dl>
</spec-decision>
</main></body></html>
`;

function project(tag: string): string {
  return mkdtempSync(join(tmpdir(), `spectastic-corpus-gates-${tag}-`));
}

/** Seeds a pack with a current KB-001@2024-05-28 and a retained superseded
 * KB-001@2017-09-05, matching 052's superseded-loading fixture shape. */
function seedCorpus(dir: string): void {
  const packDir = join(dir, 'knowledge', 'finance');
  mkdirSync(join(packDir, 'references', 'superseded'), { recursive: true });
  writeFileSync(join(packDir, 'SKILL.md'), '# finance\n');
  writeFileSync(
    join(packDir, 'index.md'),
    [
      '| ID | Title | Description | Edition | Path |',
      '| --- | --- | --- | --- | --- |',
      '| KB-001 | Settlement | The cycle | 2024-05-28 | references/KB-001-settlement.md |',
      '',
    ].join('\n'),
    'utf8',
  );
  const doc = (edition: string) => `---
id: KB-001
origin: SEC release
origin-url: https://sec.gov/x
edition: ${edition}
license: CC-BY-4.0
converter: hand-authored
content-hash: sha256:x
status: illustrative-excerpt
---

# Settlement @ ${edition}
`;
  writeFileSync(join(packDir, 'references', 'KB-001-settlement.md'), doc('2024-05-28'), 'utf8');
  writeFileSync(
    join(packDir, 'references', 'superseded', 'KB-001-settlement@2017-09-05.md'),
    doc('2017-09-05'),
    'utf8',
  );
}

describe('spectastic validate: corpus grounding gates (053 T-101/T-201)', () => {
  it('errors on a citation to a KB id with no committed document', async () => {
    const dir = project('dangling');
    seedCorpus(dir);
    writeFileSync(join(dir, 'design.html'), MINIMAL_SPEC('KB-999@2024-05-28'), 'utf8');
    const r = await runCLI(['validate', 'design.html'], dir);
    expect(r.code, r.stdout).not.toBe(0);
    expect(r.stdout).toContain(PROVENANCE_RULE);
    expect(r.stdout).toContain('KB-999');
  });

  it('is a no-op with no knowledge/ directory at all', async () => {
    const dir = project('no-knowledge-dir');
    writeFileSync(join(dir, 'design.html'), MINIMAL_SPEC('KB-999@2024-05-28'), 'utf8');
    const r = await runCLI(['validate', 'design.html'], dir);
    expect(r.code, r.stdout).toBe(0);
    expect(r.stdout).not.toContain(PROVENANCE_RULE);
  });

  it('warns (zero exit) on a citation pinned to a superseded edition', async () => {
    const dir = project('superseded');
    seedCorpus(dir);
    writeFileSync(join(dir, 'design.html'), MINIMAL_SPEC('KB-001@2017-09-05'), 'utf8');
    const r = await runCLI(['validate', 'design.html'], dir);
    expect(r.code, r.stdout).toBe(0);
    expect(r.stdout).toContain(STALENESS_RULE);
  });

  it('still errors on a dangling citation in the same project that also has a superseded one', async () => {
    const dir = project('mixed');
    seedCorpus(dir);
    // Two decisions: one cites the superseded edition, one cites a dangling id.
    const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Fixture · Plan</title></head>
<body><main>
<spec-decision id="D-001" grounding="verified">
  <h4>D-001</h4>
  <dl><dt>Context</dt><dd>Grounded against <code>KB-001@2017-09-05</code>.</dd></dl>
</spec-decision>
<spec-decision id="D-002" grounding="verified">
  <h4>D-002</h4>
  <dl><dt>Context</dt><dd>Grounded against <code>KB-999@2024-05-28</code>.</dd></dl>
</spec-decision>
</main></body></html>
`;
    writeFileSync(join(dir, 'design.html'), html, 'utf8');
    const r = await runCLI(['validate', 'design.html'], dir);
    expect(r.code, r.stdout).not.toBe(0);
    expect(r.stdout).toContain(PROVENANCE_RULE);
    expect(r.stdout).toContain(STALENESS_RULE);
  });
});
