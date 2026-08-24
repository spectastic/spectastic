import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * T-1003 (012 FR-016). Through the real binary, because the defect this pins
 * is the documented authoring path meeting the kernel verb — two different
 * generators, which a kernel-level test cannot represent.
 *
 * The fixture is hand-planted deliberately and that is worth stating rather
 * than hiding: no design.html in the estate carries a real <spec-visual>, so
 * there is nothing to copy from. `templates/design.html` scaffolds both
 * elements (the slash-command path fills them in); the kernel renderer emits
 * neither. Before FR-016 landed, one ordinary `spectastic design <id>` took
 * both to 0 occurrences with a successful exit.
 */

const here = dirname(fileURLToPath(import.meta.url));
const CLI = resolve(here, '..', 'bin', 'spectastic');
const STUB = resolve(here, 'fixtures', 'plan-script.json');

async function runCLI(args: string[], cwd: string): Promise<number> {
  return new Promise((res) => {
    const child = spawn('node', [CLI, ...args], {
      cwd,
      env: { ...process.env, SPECTASTIC_AI_STUB: STUB, ANTHROPIC_API_KEY: '' },
    });
    child.on('close', (code) => res(code ?? 0));
  });
}

describe('FR-016 — a design authored from the template survives the kernel verb (T-1003)', () => {
  it('keeps both declarations through an ordinary re-entry', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'spectastic-reentry-'));
    mkdirSync(join(cwd, 'specs', '001-x'), { recursive: true });
    writeFileSync(
      join(cwd, 'specs', '001-x', 'spec.html'),
      '<!doctype html><html><body><main><spec-meta></spec-meta></main></body></html>',
    );
    const design = join(cwd, 'specs', '001-x', 'design.html');
    writeFileSync(
      design,
      `<!doctype html><html><body><main>
<spec-status value="draft">Draft</spec-status>
<spec-contract shape="request-response" name="rates" path="api/openapi.yaml" format="openapi"></spec-contract>
<spec-visual shape="screens" tokens="visual" screens="specs/001-x/visual" source="a design tool"></spec-visual>
</main></body></html>`,
    );

    expect(await runCLI(['design', '001-x', '--no-commit'], cwd)).toBe(0);

    const after = readFileSync(design, 'utf8');
    expect(after, 'the contract declaration was destroyed by re-entry').toContain('<spec-contract');
    expect(after, 'the visual declaration was destroyed by re-entry').toContain('<spec-visual');
    // Carried whole — a declaration stripped of its required attributes is
    // three error-severity findings, so half-preserving one is worse than not.
    expect(after).toContain('api/openapi.yaml');
    expect(after).toContain('specs/001-x/visual');
  }, 30_000);
});
