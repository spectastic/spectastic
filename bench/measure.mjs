#!/usr/bin/env node
/**
 * spectastic perf bench — regression detector, not a microbenchmark.
 *
 * Spawns the built CLI in subprocesses and measures end-to-end wall-clock
 * time across N iterations. Reports p50 + p95. Compares p50 against a
 * budget declared in `bench/baselines.json`; exits non-zero on regression.
 *
 * Run locally:        pnpm bench
 * Update observed:    pnpm bench -- --update
 *
 * The point is to catch order-of-magnitude regressions (e.g. a kernel-
 * extraction change that eager-loads parse5 on every CLI path), not to
 * police single-digit-millisecond variance. Budgets are deliberately
 * permissive — tighten them only when a real perf SLA emerges.
 */

import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');
const BASELINES_FILE = resolve(HERE, 'baselines.json');
const CLI_PATH = 'packages/cli/dist/index.js';

const ITERATIONS = 7;
const WARMUP = 1;

const SCENARIOS = [
  {
    id: 'cli-version-cold-start',
    description: '`spectastic --version` — Node + commander startup; nothing else loaded',
    args: [CLI_PATH, '--version'],
  },
  {
    id: 'init-help-cold-start',
    description: '`spectastic init --help` — init module path; parse5 MUST stay lazy here',
    args: [CLI_PATH, 'init', '--help'],
  },
  {
    id: 'validate-single-cold-start',
    description: '`spectastic validate <one-spec>` — first-doc cost including all rules + parse5',
    args: [CLI_PATH, 'validate', 'specs/005-publish-local-fallback/spec.html'],
  },
  {
    id: 'validate-full-project',
    description:
      '`spectastic validate "specs/**" "examples/**" inbox.html principles.html` — steady-state across the full set',
    args: [CLI_PATH, 'validate', 'specs/**/*.html', 'examples/**/*.html', 'inbox.html', 'principles.html'],
  },
];

function runOnce(args) {
  return new Promise((res, rej) => {
    const start = performance.now();
    const child = spawn('node', args, { cwd: REPO_ROOT, stdio: 'ignore' });
    child.on('close', (code) => {
      if (code !== 0 && code !== null) return rej(new Error(`exit ${code}`));
      res(performance.now() - start);
    });
    child.on('error', rej);
  });
}

async function measure(scenario) {
  const samples = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const ms = await runOnce(scenario.args);
    if (i >= WARMUP) samples.push(ms);
  }
  samples.sort((a, b) => a - b);
  const p50 = samples[Math.floor(samples.length / 2)];
  const p95 = samples[Math.min(Math.floor(samples.length * 0.95), samples.length - 1)];
  return { p50, p95, samples };
}

function fmt(ms) {
  return `${ms.toFixed(0).padStart(4, ' ')}ms`;
}

async function main() {
  if (!existsSync(resolve(REPO_ROOT, CLI_PATH))) {
    process.stderr.write(`✗ ${CLI_PATH} not found. Run \`pnpm -r build\` first.\n`);
    process.exit(2);
  }

  const baselines = JSON.parse(readFileSync(BASELINES_FILE, 'utf8'));
  const updateMode = process.argv.includes('--update');

  process.stderr.write(
    `\nspectastic perf bench · ${ITERATIONS} iters (${WARMUP} warmup), comparing p50 against budget\n`,
  );
  process.stderr.write(`${'─'.repeat(72)}\n`);

  const results = {};
  let regressed = false;

  for (const scenario of SCENARIOS) {
    const baseline = baselines.scenarios[scenario.id];
    if (!baseline) {
      process.stderr.write(`✗ ${scenario.id} — no baseline; add to ${BASELINES_FILE}\n`);
      regressed = true;
      continue;
    }
    process.stderr.write(`  ${scenario.id.padEnd(32)} measuring... `);
    let stats;
    try {
      stats = await measure(scenario);
    } catch (err) {
      process.stderr.write(`✗ failed: ${err.message}\n`);
      regressed = true;
      continue;
    }
    results[scenario.id] = {
      p50_ms: Math.round(stats.p50),
      p95_ms: Math.round(stats.p95),
    };
    const ok = stats.p50 <= baseline.budget_ms;
    if (!ok) regressed = true;
    const status = ok ? '✓' : '✗ OVER BUDGET';
    process.stderr.write(`p50 ${fmt(stats.p50)}  p95 ${fmt(stats.p95)}  budget ${baseline.budget_ms}ms  ${status}\n`);
  }

  process.stderr.write(`${'─'.repeat(72)}\n`);

  if (updateMode) {
    const updated = { ...baselines, captured_at: new Date().toISOString() };
    for (const [id, r] of Object.entries(results)) {
      if (!updated.scenarios[id]) continue;
      updated.scenarios[id] = {
        ...updated.scenarios[id],
        observed: { p50_ms: r.p50_ms, p95_ms: r.p95_ms },
      };
    }
    writeFileSync(BASELINES_FILE, `${JSON.stringify(updated, null, 2)}\n`);
    process.stderr.write(`Updated observed values in ${BASELINES_FILE}\n`);
  }

  if (regressed) {
    process.stderr.write('\nFAIL — at least one scenario exceeded its budget or has no baseline.\n');
    process.exit(1);
  }
  process.stderr.write('\nPASS — all scenarios within budget.\n');
}

main().catch((err) => {
  process.stderr.write(`✗ bench harness crashed: ${err.message}\n`);
  process.exit(2);
});
