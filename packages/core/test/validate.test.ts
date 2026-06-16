import { describe, expect, it } from 'vitest';
import { validateCommand } from '@spectastic/core/commands/validate';
import type { FileSystem, KernelContext } from '@spectastic/core';

/**
 * Unit tests for validateCommand. Per FR-010 of
 * specs/006-kernel-extraction/spec.html: no process spawn, no real
 * filesystem IO (in-memory ctx.fs stub serves the three fixtures
 * below). Together with the package.json subpath specifier on the
 * import above, this file also satisfies SC-003 (downstream-surface
 * import path works without process spawn).
 */

const CLEAN_FIXTURE = `
<!doctype html>
<html><head><meta charset="utf-8"><title>clean</title></head>
<body><main><header>
<spec-meta><b>Status</b><span><spec-status value="draft">Draft</spec-status></span></spec-meta>
</header>
<section><h2>Out of scope</h2>
<spec-out-of-scope><ul>
  <li defer-to="never">Some intentionally-deferred thing.</li>
</ul></spec-out-of-scope></section>
</main></body></html>
`;

const FINDING_FIXTURE = `
<!doctype html>
<html><head><meta charset="utf-8"><title>broken</title></head>
<body><main><header>
<spec-meta><b>Status</b><span><spec-status value="draft">Draft</spec-status></span></spec-meta>
</header>
<section><h2>Out of scope</h2>
<spec-out-of-scope><ul>
  <li>OAuth login — missing defer-to attribute; no-missing-defer-to should fire.</li>
</ul></spec-out-of-scope></section>
</main></body></html>
`;

/** Build an in-memory FileSystem stub backed by a Map. */
function stubFs(files: Record<string, string>): FileSystem {
  const map = new Map(Object.entries(files));
  return {
    async readFile(path) {
      const content = map.get(path);
      if (content === undefined) {
        const err = new Error(`ENOENT: no such file or directory, open '${path}'`) as Error & {
          code: string;
        };
        err.code = 'ENOENT';
        throw err;
      }
      return content;
    },
    async writeFile() {
      throw new Error('stubFs.writeFile not supported in these tests');
    },
    async readdir() {
      return Array.from(map.keys());
    },
    async stat(path) {
      return { isFile: map.has(path), isDirectory: false };
    },
  };
}

function ctxWith(files: Record<string, string>): KernelContext {
  return { cwd: '/tmp/test', fs: stubFs(files) };
}

describe('validateCommand (FR-004, FR-010)', () => {
  it('returns exitCode 0 + zero error-severity findings on a clean fixture', async () => {
    const ctx = ctxWith({ 'clean.html': CLEAN_FIXTURE });
    const result = await validateCommand({ files: ['clean.html'] }, ctx);

    expect(result.exitCode).toBe(0);
    expect(result.findings.filter((f) => f.severity === 'error')).toEqual([]);
    expect(result.filesValidated).toEqual(['clean.html']);
  });

  it('returns exitCode 1 + at least one error finding on a fixture with a real defect', async () => {
    const ctx = ctxWith({ 'broken.html': FINDING_FIXTURE });
    const result = await validateCommand({ files: ['broken.html'] }, ctx);

    expect(result.exitCode).toBe(1);
    const errors = result.findings.filter((f) => f.severity === 'error');
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((f) => f.rule === 'no-missing-defer-to')).toBe(true);
  });

  it('returns exitCode 2 + errorMessage when a file is unreadable', async () => {
    const ctx = ctxWith({ /* nothing here */ });
    const result = await validateCommand({ files: ['nope.html'] }, ctx);

    expect(result.exitCode).toBe(2);
    expect(result.errorMessage).toBeTruthy();
    expect(result.filesValidated).toEqual([]);
  });

  it('runs cross-file rules across multiple files in one invocation', async () => {
    const ctx = ctxWith({
      'a.html': CLEAN_FIXTURE,
      'b.html': CLEAN_FIXTURE,
    });
    const result = await validateCommand({ files: ['a.html', 'b.html'] }, ctx);

    expect(result.exitCode).toBe(0);
    expect(result.filesValidated).toEqual(['a.html', 'b.html']);
  });
});
