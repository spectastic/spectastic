import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { validate } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(here, '..', '..', '..');

/**
 * NFR-001: validate() must complete in <100ms p95 per file on a modern
 * laptop for files under 5,000 lines. We run validate() across the
 * canonical reference set, collect timings, and assert p95.
 */
const TARGETS = [
  'examples/spectastic-spec.html',
  'principles.html',
  'specs/002-validate-cli/spec.html',
  'specs/002-validate-cli/plan.html',
  'specs/002-validate-cli/tasks.html',
];

const SAMPLES_PER_FILE = 5;

describe('perf: NFR-001 <100ms p95 per file', () => {
  it('p95 of validate() over the canonical set is under 100ms', async () => {
    const samples: number[] = [];
    for (const file of TARGETS) {
      const html = await readFile(join(REPO_ROOT, file), 'utf8');
      // Warm-up run (not counted) so JIT effects don't poison the first sample.
      validate(html, { file });
      for (let i = 0; i < SAMPLES_PER_FILE; i++) {
        const t0 = performance.now();
        validate(html, { file });
        samples.push(performance.now() - t0);
      }
    }
    samples.sort((a, b) => a - b);
    const idx = Math.min(samples.length - 1, Math.floor(samples.length * 0.95));
    const p95 = samples[idx] ?? 0;
    expect(p95, `p95=${p95.toFixed(1)}ms; samples=[${samples.map((s) => s.toFixed(1)).join(', ')}]`).toBeLessThan(100);
  });
});
