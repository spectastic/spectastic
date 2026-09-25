import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The `decisions` command group (spec 122-decision-index-federation, D-005,
 * T-100). `for` and `coverage` are today's `adrs` logic, unchanged; `adrs`
 * itself becomes a hidden alias that forwards to the same action functions,
 * so its output must be byte-identical to `decisions for`/`decisions
 * coverage`. `export` writes the committed index.
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
    const child = spawn('node', [CLI, ...args], { cwd });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c: Buffer) => (stdout += c.toString('utf8')));
    child.stderr.on('data', (c: Buffer) => (stderr += c.toString('utf8')));
    child.on('close', (code) => resolveFn({ stdout, stderr, code: code ?? 0 }));
  });
}

const DESIGN = `<!doctype html><html><body>
  <spec-decision id="D-001" status="accepted" posture="block">
    <h4>D-001 · only the persistence adapter writes the ledger</h4>
    <spec-scope><spec-path>src/**/persistence/**</spec-path></spec-scope>
    <spec-reason>Every ledger write must emit LedgerPosted.</spec-reason>
    <spec-enforcement>
      <spec-rule tool="native-content" id="no_direct_ledger_write" pattern="UPDATE\\s+ledger" allowed-in="src/**/persistence/**"></spec-rule>
    </spec-enforcement>
  </spec-decision>
  <spec-decision id="D-002" status="accepted">
    <h4>D-002 · only payments owns the ledger store</h4>
    <spec-scope>
      <spec-resource coordinate="spectastic://acme/payments/datastore/ledger" owner="acme/payments" allowed-in="src/**/persistence/**"></spec-resource>
    </spec-scope>
    <spec-reason>The ledger store belongs to payments.</spec-reason>
  </spec-decision>
</body></html>`;

function ownerProject(project = 'acme/payments'): string {
  const dir = mkdtempSync(join(tmpdir(), 'decisions-owner-'));
  writeFileSync(join(dir, 'spectastic.json'), JSON.stringify({ project }, null, 2), 'utf8');
  mkdirSync(join(dir, 'specs', '002-ledger'), { recursive: true });
  writeFileSync(join(dir, 'specs', '002-ledger', 'design.html'), DESIGN, 'utf8');
  return dir;
}

describe('decisions for / coverage vs the hidden adrs alias', () => {
  it('decisions for and adrs --for produce byte-identical output', async () => {
    const cwd = ownerProject();
    const a = await runCLI(['decisions', 'for', '--for', 'src/main/persistence/Repo.java'], cwd);
    const b = await runCLI(['adrs', '--for', 'src/main/persistence/Repo.java'], cwd);
    expect(a.stdout).toBe(b.stdout);
    expect(a.code).toBe(b.code);
  });

  it('decisions coverage and adrs --coverage produce byte-identical output', async () => {
    const cwd = ownerProject();
    const a = await runCLI(['decisions', 'coverage'], cwd);
    const b = await runCLI(['adrs', '--coverage'], cwd);
    expect(a.stdout).toBe(b.stdout);
  });

  it('adrs stays hidden from top-level --help', async () => {
    const cwd = ownerProject();
    const r = await runCLI(['--help'], cwd);
    expect(r.stdout).not.toMatch(/\badrs\b/);
    expect(r.stdout).toMatch(/\bdecisions\b/);
  });
});

describe('decisions export', () => {
  it('writes specs/decisions.json from the accepted, scoped decisions', async () => {
    const cwd = ownerProject();
    const r = await runCLI(['decisions', 'export'], cwd);
    expect(r.code).toBe(0);
    const path = join(cwd, 'specs', 'decisions.json');
    expect(existsSync(path)).toBe(true);
    const idx = JSON.parse(readFileSync(path, 'utf8')) as {
      schema: string;
      project: string;
      contentHash: string;
      decisions: { id: string; coordinate: string; resource?: { owner: string } }[];
    };
    expect(idx.schema).toBe('spectastic-decision-index/1');
    expect(idx.project).toBe('acme/payments');
    expect(idx.decisions.map((d) => d.id)).toEqual(['D-001', 'D-002']);
    expect(idx.decisions[1]?.coordinate).toBe('spectastic://acme/payments/decision/002-ledger/D-002');
    expect(idx.decisions[1]?.resource?.owner).toBe('acme/payments');
  });

  it('refuses a bare project identity', async () => {
    const cwd = ownerProject('payments');
    const r = await runCLI(['decisions', 'export'], cwd);
    expect(r.code).not.toBe(0);
    expect(existsSync(join(cwd, 'specs', 'decisions.json'))).toBe(false);
  });

  it('is deterministic — two exports of one estate are byte-identical', async () => {
    const cwd = ownerProject();
    await runCLI(['decisions', 'export'], cwd);
    const first = readFileSync(join(cwd, 'specs', 'decisions.json'), 'utf8');
    // generatedAt differs run to run; compare everything else exactly.
    await new Promise((r) => setTimeout(r, 5));
    await runCLI(['decisions', 'export'], cwd);
    const second = readFileSync(join(cwd, 'specs', 'decisions.json'), 'utf8');
    const strip = (s: string) => s.replace(/"generatedAt": "[^"]*"/, '"generatedAt": ""');
    expect(strip(first)).toBe(strip(second));
  });
});
