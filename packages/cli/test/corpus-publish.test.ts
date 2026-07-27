import { spawn } from 'node:child_process';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';

/**
 * 063-corpus-discoverability T-202/T-213: `corpus publish` generates a
 * missing `marketplace.json` for the resolved `corpus.root`, named from
 * `corpus.marketplace` (defaulting to the repo dir name, per T-101's init
 * writer); a second run is idempotent (FR-004).
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
    const child = spawn('node', [CLI, ...args], { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c: Buffer) => (stdout += c.toString('utf8')));
    child.stderr.on('data', (c: Buffer) => (stderr += c.toString('utf8')));
    child.stdin.end();
    child.on('close', (code) => resolveFn({ stdout, stderr, code: code ?? 0 }));
  });
}

function project(tag: string): string {
  return mkdtempSync(join(tmpdir(), `spectastic-corpus-publish-${tag}-`));
}

describe('spectastic corpus publish (063 T-202/T-213, FR-004)', () => {
  it('generates a missing marketplace.json for a pre-existing registry (a corpus populated before publish existed)', async () => {
    const dir = project('generate');
    // Simulate a registry populated by something other than the current CLI
    // doors — every write door now syncs automatically (T-212), so the
    // "missing manifest" case this tests is a corpus whose index.md
    // predates that wiring (a hand-edited or pre-063 registry).
    const { mkdirSync, writeFileSync } = await import('node:fs');
    const knowledgeDir = join(dir, 'knowledge');
    mkdirSync(join(knowledgeDir, 'ops-knowledge', 'references'), { recursive: true });
    writeFileSync(
      join(knowledgeDir, 'ops-knowledge', 'references', '001-fact.md'),
      '---\nslug: 001-fact\n---\n\n# A fact\n\nBody.\n',
      'utf8',
    );
    writeFileSync(
      join(knowledgeDir, 'index.md'),
      '| KB-NNNN | Marketplace | Plugin | Slug | Title | Edition | Path | Status |\n' +
        '| --- | --- | --- | --- | --- | --- | --- | --- |\n' +
        '| KB-0001 | in-house | ops-knowledge | 001-fact | A fact | 2026-07-27 | ops-knowledge/references/001-fact.md |  |\n',
      'utf8',
    );

    const r = await runCLI(['corpus', 'publish'], dir);
    expect(r.code, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toContain('generated');

    const manifestPath = join(knowledgeDir, 'marketplace.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { name: string; plugins: Array<{ name: string }> };
    expect(manifest.name).toBe(basename(dir));
    expect(manifest.plugins.map((p) => p.name)).toContain('ops-knowledge');
  });

  it('a second run reports a refresh (idempotent — changes nothing)', async () => {
    const dir = project('idempotent');
    const src = join(dir, 'src-pack');
    const { mkdirSync, writeFileSync } = await import('node:fs');
    mkdirSync(join(src, 'references'), { recursive: true });
    writeFileSync(join(src, 'references', '001-fact.md'), '# A fact\n\nBody.\n', 'utf8');
    // corpus import already syncs (T-212), so the manifest exists after this —
    // both publish calls below exercise the refresh path, which is exactly
    // the idempotence this test is about.
    await runCLI(['corpus', 'import', 'ops-knowledge@in-house', '--from', src], dir);

    const manifestPath = join(dir, 'knowledge', 'marketplace.json');
    const before = readFileSync(manifestPath, 'utf8');

    const r = await runCLI(['corpus', 'publish'], dir);
    expect(r.code, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toContain('refreshed');
    expect(readFileSync(manifestPath, 'utf8')).toBe(before);
  });
});
