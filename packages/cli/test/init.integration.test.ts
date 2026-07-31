import { spawn } from 'node:child_process';
import { mkdtempSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isExtended, type VerbManifest, verbFromDestination } from '../src/commands/init/manifest.js';

/**
 * T-300 of specs/018-explain/tasks.html. The opt-in extended-verb packaging
 * seam (FR-009 / plan D-002): the eight core verbs install by default; an
 * extended verb (explain) installs only via `init --with <verb>`; a command
 * file in neither tier defaults to core.
 *
 * The spawn cases require a fresh build (prebuild copies commands.json into
 * _bundled/ — T-312); run `pnpm --filter @spectastic/cli build` first.
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

function listFilesRecursive(dir: string, base = dir): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...listFilesRecursive(full, base));
    else out.push(full.slice(base.length + 1));
  }
  return out;
}

const commandFiles = (files: string[]) => files.filter((f) => f.startsWith('.claude/commands/'));

describe('init: extended-verb tiering (T-300, FR-009)', () => {
  describe('manifest classification', () => {
    const manifest: VerbManifest = {
      core: ['spec', 'design'],
      extended: ['explain'],
    };

    it('extracts the verb from a command destination path', () => {
      expect(verbFromDestination('.claude/commands/spectastic.explain.md')).toBe('explain');
      expect(verbFromDestination('.claude/commands/spectastic.spec.md')).toBe('spec');
      expect(verbFromDestination('assets/spec.css')).toBeNull();
    });

    it('treats a listed extended verb as extended', () => {
      expect(isExtended('explain', manifest)).toBe(true);
    });

    it('treats a core verb as not extended', () => {
      expect(isExtended('spec', manifest)).toBe(false);
    });

    it('defaults an unlisted verb to core (fail-safe)', () => {
      expect(isExtended('future-verb', manifest)).toBe(false);
    });
  });

  describe('install behaviour (spawn — needs a fresh build)', () => {
    it('default install excludes explain — 8 core commands, no explain.md', async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'spectastic-init-default-'));
      const r = await runCLI(['init'], tmpDir);
      expect(r.code, `stderr: ${r.stderr}`).toBe(0);

      const files = listFilesRecursive(tmpDir);
      expect(files).not.toContain('.claude/commands/spectastic.explain.md');
      expect(commandFiles(files).length).toBe(8);
    });

    it('`init --with explain` includes it — 9 commands, explain.md present', async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'spectastic-init-with-'));
      const r = await runCLI(['init', '--with', 'explain'], tmpDir);
      expect(r.code, `stderr: ${r.stderr}`).toBe(0);

      const files = listFilesRecursive(tmpDir);
      expect(files).toContain('.claude/commands/spectastic.explain.md');
      expect(commandFiles(files).length).toBe(9);
    });
  });
});
