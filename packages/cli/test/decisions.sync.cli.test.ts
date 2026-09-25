import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * `decisions sync` (spec 122-decision-index-federation, FR-004, T-213):
 * fetch each declared source, validate, write the vendored copy verbatim,
 * record the pin, report fetched/unchanged/moved/refused per source. Only
 * the path fetcher is exercised here (a repo-relative sibling checkout) —
 * the HTTPS mechanics are covered by T-201's fetcher-adapter test.
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

const OWNER_DESIGN = `<!doctype html><html><body>
  <spec-decision id="D-003" status="accepted" posture="block">
    <h4>D-003 · only payments writes the ledger</h4>
    <spec-scope>
      <spec-resource coordinate="spectastic://acme/payments/datastore/ledger" owner="acme/payments" allowed-in="src/**/persistence/**"></spec-resource>
    </spec-scope>
    <spec-reason>Every ledger write must emit LedgerPosted.</spec-reason>
    <spec-enforcement>
      <spec-rule tool="native-content" id="no_ledger_write" pattern="UPDATE\\s+ledger" allowed-in="src/**/persistence/**"></spec-rule>
    </spec-enforcement>
  </spec-decision>
</body></html>`;

/** An owner repo with one exported decision index, and a consumer repo
 *  declaring it as a path source relative to the owner's sibling directory. */
function ownerAndConsumer(): { owner: string; consumer: string } {
  const root = mkdtempSync(join(tmpdir(), 'decisions-sync-'));
  const owner = join(root, 'owner');
  const consumer = join(root, 'consumer');
  mkdirSync(join(owner, 'specs', '002-ledger'), { recursive: true });
  writeFileSync(join(owner, 'spectastic.json'), JSON.stringify({ project: 'acme/payments' }, null, 2), 'utf8');
  writeFileSync(join(owner, 'specs', '002-ledger', 'design.html'), OWNER_DESIGN, 'utf8');
  mkdirSync(consumer, { recursive: true });
  const from = `../${basename(owner)}/specs/decisions.json`;
  writeFileSync(
    join(consumer, 'spectastic.json'),
    JSON.stringify(
      { project: 'acme/reconciliation-service', decisions: { sources: [{ project: 'acme/payments', from }] } },
      null,
      2,
    ),
    'utf8',
  );
  return { owner, consumer };
}

describe('decisions sync', () => {
  it('fetches, vendors the copy verbatim, and records the pin — then reports unchanged on a re-run', async () => {
    const { owner, consumer } = ownerAndConsumer();
    const exported = await runCLI(['decisions', 'export'], owner);
    expect(exported.code).toBe(0);

    const first = await runCLI(['decisions', 'sync'], consumer);
    expect(first.code).toBe(0);
    expect(first.stdout).toMatch(/FETCHED\s+acme\/payments/);

    const vendoredPath = join(consumer, '.spectastic', 'decisions', 'acme--payments.json');
    expect(existsSync(vendoredPath)).toBe(true);
    const vendored = JSON.parse(readFileSync(vendoredPath, 'utf8')) as { project: string; contentHash: string };
    expect(vendored.project).toBe('acme/payments');

    const config = JSON.parse(readFileSync(join(consumer, 'spectastic.json'), 'utf8')) as {
      decisions: { sources: { project: string; pin?: string }[] };
    };
    expect(config.decisions.sources[0]?.pin).toBe(vendored.contentHash);

    const second = await runCLI(['decisions', 'sync'], consumer);
    expect(second.code).toBe(0);
    expect(second.stdout).toMatch(/UNCHANGED\s+acme\/payments/);
  });

  it('a fetch failure leaves the existing copy and pin untouched, and exits non-zero', async () => {
    const { owner, consumer } = ownerAndConsumer();
    await runCLI(['decisions', 'export'], owner);
    await runCLI(['decisions', 'sync'], consumer);
    const vendoredPath = join(consumer, '.spectastic', 'decisions', 'acme--payments.json');
    const before = readFileSync(vendoredPath, 'utf8');
    const configBefore = readFileSync(join(consumer, 'spectastic.json'), 'utf8');

    // Break the source so the second sync's fetch fails.
    const config = JSON.parse(configBefore) as { decisions: { sources: { from: string; pin?: string }[] } };
    config.decisions.sources[0]!.from = './does-not-exist.json';
    writeFileSync(join(consumer, 'spectastic.json'), JSON.stringify(config, null, 2), 'utf8');

    const r = await runCLI(['decisions', 'sync'], consumer);
    expect(r.code).not.toBe(0);
    expect(r.stdout).toMatch(/REFUSED\s+acme\/payments/);
    // The vendored copy is untouched — only spectastic.json's `from` changed above.
    expect(readFileSync(vendoredPath, 'utf8')).toBe(before);
  });

  it('reports "nothing to do" and exits 0 with no sources declared', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'decisions-sync-none-'));
    writeFileSync(join(dir, 'spectastic.json'), JSON.stringify({ project: 'acme/solo' }, null, 2), 'utf8');
    const r = await runCLI(['decisions', 'sync'], dir);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/nothing to do/i);
  });

  it('refuses a source naming the consumer\'s own project (FR-003)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'decisions-sync-self-'));
    writeFileSync(
      join(dir, 'spectastic.json'),
      JSON.stringify(
        { project: 'acme/solo', decisions: { sources: [{ project: 'acme/solo', from: './x.json' }] } },
        null,
        2,
      ),
      'utf8',
    );
    const r = await runCLI(['decisions', 'sync'], dir);
    expect(r.code).not.toBe(0);
    expect(r.stderr).toMatch(/cannot federate with itself/);
  });
});

/**
 * The `decision-source-unpinned` / `decision-source-undeclared` fold into
 * the CLI's `validate` (spec 122-decision-index-federation, FR-008/FR-011,
 * T-214) — proven end-to-end against a real `decisions sync` and a real
 * `validate` run, not just the pure kernel functions T-202 already covers.
 */
describe('validate — decision-source gates (T-214)', () => {
  it('errors decision-source-unpinned when a declared source has never been synced', async () => {
    const { consumer } = ownerAndConsumer();
    const r = await runCLI(['validate', 'spectastic.json'], consumer);
    expect(r.stdout).toMatch(/decision-source-unpinned/);
  });

  it('goes clean on decision-source-unpinned once synced, and warns decision-source-undeclared with no matching consumes[] edge', async () => {
    const { owner, consumer } = ownerAndConsumer();
    await runCLI(['decisions', 'export'], owner);
    await runCLI(['decisions', 'sync'], consumer);
    const r = await runCLI(['validate', 'spectastic.json'], consumer);
    expect(r.stdout).not.toMatch(/decision-source-unpinned/);
    expect(r.stdout).toMatch(/decision-source-undeclared/);
  });

  it('goes clean on decision-source-undeclared once a matching consumes[] unit edge is declared', async () => {
    const { owner, consumer } = ownerAndConsumer();
    await runCLI(['decisions', 'export'], owner);
    await runCLI(['decisions', 'sync'], consumer);
    const config = JSON.parse(readFileSync(join(consumer, 'spectastic.json'), 'utf8')) as Record<string, unknown>;
    config.consumes = ['spectastic://acme/payments/unit/payments-lib'];
    writeFileSync(join(consumer, 'spectastic.json'), JSON.stringify(config, null, 2), 'utf8');
    const r = await runCLI(['validate', 'spectastic.json'], consumer);
    expect(r.stdout).not.toMatch(/decision-source-unpinned/);
    expect(r.stdout).not.toMatch(/decision-source-undeclared/);
  });

  it('re-errors decision-source-unpinned once the vendored copy drifts from its pin', async () => {
    const { owner, consumer } = ownerAndConsumer();
    await runCLI(['decisions', 'export'], owner);
    await runCLI(['decisions', 'sync'], consumer);
    const vendoredPath = join(consumer, '.spectastic', 'decisions', 'acme--payments.json');
    const vendored = JSON.parse(readFileSync(vendoredPath, 'utf8')) as { decisions: { reason?: string }[] };
    vendored.decisions[0]!.reason = 'hand-edited, drifted from the pin';
    writeFileSync(vendoredPath, JSON.stringify(vendored, null, 2), 'utf8');
    const r = await runCLI(['validate', 'spectastic.json'], consumer);
    expect(r.stdout).toMatch(/decision-source-unpinned/);
  });
});
