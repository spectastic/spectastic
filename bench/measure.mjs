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
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');
const BASELINES_FILE = resolve(HERE, 'baselines.json');
const CLI_PATH = 'packages/cli/dist/index.js';

const ITERATIONS = 7;
const WARMUP = 1;

// The one-document fixture `validate-single-cold-start` runs against.
//
// The scenario used to point at a spec inside this repo, which meant it was
// never measuring what its name says. `validate` runs cross-file rules
// (spec-id-unique, verify-view-missing, the variant-coverage scans), and those
// read the WHOLE specs/ tree however few files you name — so the reading was
// first-doc cost plus a full-estate scan, i.e. O(estate). Measured on the same
// binary and the same document: 450ms inside this repo's 363-doc estate, 100ms
// in a directory holding that one file. It had become a tighter-capped
// duplicate of validate-full-project, which is the scenario that legitimately
// owns estate scaling, and it went stale every time the estate grew — three
// budget raises in six weeks, the last of which (350 -> 500) recorded the
// suspicion in baselines.json without yet having this measurement.
//
// Copied at run time rather than committed, so there is one source of truth
// for the document and no checked-in duplicate to drift.
const SINGLE_DOC_SPEC = 'specs/005-publish-local-fallback/spec.html';

function makeSingleDocFixture() {
  const dir = mkdtempSync(resolve(tmpdir(), 'spectastic-bench-'));
  const dest = resolve(dir, SINGLE_DOC_SPEC);
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(resolve(REPO_ROOT, SINGLE_DOC_SPEC), dest);
  // The artifact's stylesheet, script and favicon come with it. An artifact
  // copied away from its assets is genuinely broken — REQ-FORMAT-010 says so
  // and `asset-resolve` reports it — so without this the scenario measures a
  // failing validate rather than a passing one, and `runOnce` rejects on the
  // non-zero exit. Caught by the check itself the day it landed.
  cpSync(resolve(REPO_ROOT, 'assets'), resolve(dir, 'assets'), { recursive: true });
  return dir;
}

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
    // Runs in a directory holding only this document (see makeSingleDocFixture)
    // so the number is the first-doc cost its rationale claims, and not the
    // size of whatever estate the bench happens to be run from.
    args: [resolve(REPO_ROOT, CLI_PATH), 'validate', SINGLE_DOC_SPEC],
    cwd: 'single-doc-fixture',
  },
  {
    id: 'validate-full-project',
    description:
      '`spectastic validate "specs/**" "examples/*" inbox.html principles.html` — steady-state across the full set',
    // Single-star on examples/ for the same reason the integration test uses it:
    // a nested example project carries its own specs/ tree, and the cross-file
    // rules assume one project. Sweeping it in here makes validate exit non-zero
    // (spec-id-unique collides the 001- directories; verify-view-missing resets
    // this repo's convention floor to the nested spec's number), which the bench
    // reads as a failed scenario rather than as the rule collision it is.
    args: [CLI_PATH, 'validate', 'specs/**/*.html', 'examples/*.html', 'inbox.html', 'principles.html'],
  },
];

function runOnce(args, cwd = REPO_ROOT) {
  return new Promise((res, rej) => {
    const start = performance.now();
    const child = spawn('node', args, { cwd, stdio: 'ignore' });
    child.on('close', (code) => {
      if (code !== 0 && code !== null) return rej(new Error(`exit ${code}`));
      res(performance.now() - start);
    });
    child.on('error', rej);
  });
}

async function measure(scenario, cwd) {
  const samples = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const ms = await runOnce(scenario.args, cwd);
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
  // Built once and removed in the finally below, so a scenario needing an
  // isolated estate costs one copy rather than one per iteration.
  const singleDocFixture = makeSingleDocFixture();

  try {
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
        stats = await measure(scenario, scenario.cwd === 'single-doc-fixture' ? singleDocFixture : REPO_ROOT);
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
  } finally {
    rmSync(singleDocFixture, { recursive: true, force: true });
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
