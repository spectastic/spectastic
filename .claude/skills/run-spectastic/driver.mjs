#!/usr/bin/env node
// Smoke driver for the spectastic CLI (@spectastic/cli).
//
// spectastic is a CLI, not a GUI — so "driving" it means invoking the real
// `spectastic` binary with representative args and asserting exit codes +
// output. This script does exactly that: it runs the deterministic verbs
// (--version, --help, validate, init) and one AI-coupled verb (principles)
// through the built-in stub provider, in throwaway temp dirs, and reports a
// pass/fail line per check. Non-zero exit if any check fails.
//
// Usage (from repo root):
//   node .claude/skills/run-spectastic/driver.mjs            # smoke the built CLI
//   node .claude/skills/run-spectastic/driver.mjs --build    # `pnpm build` first
//
// Everything here was run and verified on macOS (node v25, pnpm 9.15).

import { execFileSync, execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL_DIR = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(SKILL_DIR, '..', '..', '..'); // .claude/skills/run-spectastic -> repo root
const CLI = join(REPO, 'packages', 'cli', 'bin', 'spectastic');
const STUB_PRINCIPLES = join(REPO, 'packages', 'cli', 'test', 'fixtures', 'principles-script.json');

let pass = 0;
let fail = 0;
const tmpDirs = [];

function mkTmp(prefix) {
  const d = mkdtempSync(join(tmpdir(), prefix));
  tmpDirs.push(d);
  return d;
}

// Run the CLI. Returns { code, stdout, stderr }. Never throws on non-zero exit.
function cli(args, { cwd = REPO, env = {} } = {}) {
  try {
    const stdout = execFileSync('node', [CLI, ...args], {
      cwd,
      env: { ...process.env, ...env },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, stdout, stderr: '' };
  } catch (e) {
    return { code: e.status ?? 1, stdout: e.stdout?.toString() ?? '', stderr: e.stderr?.toString() ?? '' };
  }
}

function check(name, ok, detail = '') {
  if (ok) {
    pass++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } else {
    fail++;
    console.log(`  \x1b[31m✗\x1b[0m ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

// --- optional build ---------------------------------------------------------
if (process.argv.includes('--build')) {
  console.log('› pnpm build');
  execSync('pnpm build', { cwd: REPO, stdio: 'inherit' });
}

if (!existsSync(CLI)) {
  console.error(`CLI bin not found at ${CLI}. Run \`pnpm build\` (or pass --build) first.`);
  process.exit(2);
}

console.log('spectastic CLI smoke\n');

// --- 1. version + help ------------------------------------------------------
{
  const v = cli(['--version']);
  check('--version prints a version', v.code === 0 && /^\d+\.\d+\.\d+/.test(v.stdout.trim()), v.stdout.trim());

  const h = cli(['--help']);
  check(
    '--help lists the verbs',
    h.code === 0 && ['validate', 'init', 'triage', 'verify'].every((c) => h.stdout.includes(c)),
  );
}

// --- 2. validate: exit 0 / 1 / 2 -------------------------------------------
{
  // Clean, real spec in this repo -> exit 0, "no findings".
  const clean = cli(['validate', 'specs/000-spectastic/spec.html']);
  check('validate clean spec -> exit 0', clean.code === 0 && /no findings/.test(clean.stdout), `code=${clean.code}`);

  // Empty document -> the `empty-document` rule fires -> exit 1.
  const dir = mkTmp('spectastic-validate-');
  const empty = join(dir, 'empty.html');
  writeFileSync(empty, '<!doctype html><html><body></body></html>');
  const bad = cli(['validate', empty]);
  check(
    'validate empty doc -> exit 1 + empty-document finding',
    bad.code === 1 && bad.stdout.includes('empty-document'),
    `code=${bad.code}`,
  );

  // No path matches -> usage error -> exit 2.
  const nomatch = cli(['validate', join(dir, 'nope-*.html')]);
  check('validate no-match -> exit 2', nomatch.code === 2, `code=${nomatch.code}`);

  // JSON + SARIF formats are well-formed JSON.
  const asJson = cli(['validate', 'specs/000-spectastic/spec.html', '--format', 'json']);
  let jsonOk = false;
  try { jsonOk = Array.isArray(JSON.parse(asJson.stdout)); } catch { /* fail below */ }
  check('validate --format json -> valid JSON array', asJson.code === 0 && jsonOk);

  const asSarif = cli(['validate', 'specs/000-spectastic/spec.html', '--format', 'sarif']);
  let sarifOk = false;
  try { sarifOk = JSON.parse(asSarif.stdout).version === '2.1.0'; } catch { /* fail below */ }
  check('validate --format sarif -> SARIF 2.1.0', asSarif.code === 0 && sarifOk);
}

// --- 3. init scaffolds a project -------------------------------------------
let initDir;
{
  initDir = mkTmp('spectastic-init-');
  const r = cli(['init'], { cwd: initDir });
  const scaffolded = existsSync(join(initDir, '.claude')) && existsSync(join(initDir, 'assets'));
  check('init scaffolds a project (.claude/ + assets/)', r.code === 0 && scaffolded, `code=${r.code}`);
}

// --- 3b. init --profile composes principles + AGENTS.md (spec 041) ---------
{
  const dir = mkTmp('spectastic-profile-');
  const r = cli(['init', '--profile', 'verified'], { cwd: dir });
  const principles = join(dir, 'principles.html');
  const ok =
    r.code === 0 &&
    existsSync(principles) &&
    /id="P-1"/.test(readFileSync(principles, 'utf8')) &&
    existsSync(join(dir, 'AGENTS.md')) &&
    existsSync(join(dir, 'CLAUDE.md')) &&
    existsSync(join(dir, '.spectastic', 'profile.json'));
  check('init --profile verified -> composes principles + AGENTS.md + marker', ok, `code=${r.code}`);

  // Unknown profile -> exit 2 listing valid names.
  const bad = cli(['init', '--profile', 'nope'], { cwd: mkTmp('spectastic-profile-bad-') });
  check('init --profile <unknown> -> exit 2', bad.code === 2 && /lean, standard/.test(bad.stderr), `code=${bad.code}`);
}

// --- 4. AI verb via the stub provider (no real LLM) ------------------------
{
  // principles reads its whole conversation from the stub fixture; asserts a
  // real principles.html with P-N anchors lands. Proves the AI path is
  // driveable in CI without a network call.
  const r = cli(['principles'], {
    cwd: initDir,
    env: { SPECTASTIC_AI_STUB: STUB_PRINCIPLES },
  });
  const out = join(initDir, 'principles.html');
  const hasAnchors = existsSync(out) && /id="P-1"/.test(readFileSync(out, 'utf8'));
  check('principles (AI stub) -> writes principles.html with P-N anchors', r.code === 0 && hasAnchors, `code=${r.code}`);
}

// --- cleanup + report -------------------------------------------------------
for (const d of tmpDirs) {
  try { rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
