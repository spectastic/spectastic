// Perf check for the canvas data path (spec NFR-001 / SC-003): building a single
// spec's lifecycle (≤ 8 nodes) must stay under 300 ms p95. The dominant cost is
// parsing + extracting + validating each artifact, which this measures directly
// over the real specs/020 files. Run: node bench/canvas-paint.mjs
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { extractHealth, validate } = await import(
  join(root, 'packages', 'schema', 'dist', 'index.js')
);
const specDir = join(root, 'specs', '020-vscode-extension');

const files = [
  join(root, 'principles.html'),
  join(specDir, 'spec.html'),
  join(specDir, 'plan.html'),
  join(specDir, 'tasks.html'),
];

const ITERATIONS = 60;
const samples = [];

for (let i = 0; i < ITERATIONS; i++) {
  const start = performance.now();
  await Promise.all(
    files.map(async (f) => {
      const html = await readFile(f, 'utf8');
      extractHealth(html);
      validate(html, { file: f });
    }),
  );
  samples.push(performance.now() - start);
}

samples.sort((a, b) => a - b);
const p = (q) => samples[Math.min(samples.length - 1, Math.floor(q * samples.length))];
const p50 = p(0.5).toFixed(1);
const p95 = p(0.95).toFixed(1);

console.log(`canvas paint over ${files.length} artifacts × ${ITERATIONS} runs`);
console.log(`  p50 ${p50} ms   p95 ${p95} ms   budget 300 ms (NFR-001)`);

if (Number(p95) > 300) {
  console.error(`FAIL: p95 ${p95} ms exceeds the 300 ms budget`);
  process.exit(1);
}
console.log('PASS');
