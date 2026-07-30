#!/usr/bin/env node
// Diff-aware ("patch") coverage gate — 068-enterprise-enforce-floor T-117,
// plan D-002.
//
// spectastic's own stated doctrine (CLAUDE.md, the plan's coverage-threshold
// decision) is explicit: never a single universal project percentage, always
// "≥80% of changed lines, never lower what's touched". vitest's `coverage.
// thresholds` block (vitest.config.ts) is project-level and can't express
// that, so it stays a no-op signal for the enforce detector (T-116) while
// THIS script is the real gate: it cross-references the lines a change
// actually touches (from `git diff`) against per-line hit data (from the
// coverage run's `coverage/lcov.info`) and fails under the floor.
//
// Pure computation is exported and unit-tested (patch-coverage.test.ts);
// only main() touches git/fs/process.
//
// Scope note on "never lower what's touched" (spec FR-003): a MODIFIED line
// that regresses from covered to uncovered is caught here — a diff shows it
// as a new "+" line, and its post-change hit count is exactly what this gate
// scores. What this gate does NOT catch is an UNTOUCHED neighboring line
// losing coverage as a side effect (e.g. a deleted test that happened to
// exercise it) — a full before/after coverage diff would be needed for that,
// which the standard "patch coverage" pattern (Codecov, diff-cover) doesn't
// attempt either. Recorded as a known ceiling, not silently overclaimed.

import { readFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const FLOOR_PERCENT = 80;
// Only the 4 core packages carry the coverage floor (plan §5b / spec scope) —
// vscode, the courses, and loose scripts are out of NFR-002's stated reach.
const SCOPE_RE = /^packages\/(schema|corpus|core|cli)\/src\//;

/**
 * Parse an lcov.info file into `Map<file, Map<lineNumber, hitCount>>`. Only
 * `SF:`/`DA:`/`end_of_record` are read — the subset vitest's v8 lcov reporter
 * emits and the only fields this gate needs.
 */
export function parseLcov(lcovText) {
  /** @type {Map<string, Map<number, number>>} */
  const files = new Map();
  let currentFile = null;
  /** @type {Map<number, number> | null} */
  let currentLines = null;
  for (const rawLine of lcovText.split('\n')) {
    const line = rawLine.trim();
    if (line.startsWith('SF:')) {
      currentFile = line.slice(3);
      currentLines = new Map();
      files.set(currentFile, currentLines);
    } else if (line.startsWith('DA:') && currentLines) {
      const [lineNoStr, hitsStr] = line.slice(3).split(',');
      const lineNo = Number.parseInt(lineNoStr, 10);
      const hits = Number.parseInt(hitsStr, 10);
      if (Number.isFinite(lineNo) && Number.isFinite(hits)) {
        currentLines.set(lineNo, hits);
      }
    } else if (line === 'end_of_record') {
      currentFile = null;
      currentLines = null;
    }
  }
  return files;
}

/**
 * Parse a unified diff (`git diff --unified=0`) into `Map<file, Set<lineNumber>>`
 * of ADDED/modified lines only (the "+" side) — deletions carry no line in the
 * new file to score, and context lines weren't touched by this change.
 * Skips deleted files (no `+++ b/<path>` target, i.e. `/dev/null`).
 */
export function parseChangedLines(diffText) {
  /** @type {Map<string, Set<number>>} */
  const changed = new Map();
  let currentFile = null;
  let nextLine = null;
  for (const line of diffText.split('\n')) {
    if (line.startsWith('+++ ')) {
      const path = line.slice(4).trim();
      currentFile = path === '/dev/null' ? null : path.replace(/^b\//, '');
      if (currentFile && !changed.has(currentFile)) changed.set(currentFile, new Set());
      continue;
    }
    if (line.startsWith('@@')) {
      const m = /\+(\d+)(?:,(\d+))?/.exec(line);
      nextLine = m ? Number.parseInt(m[1], 10) : null;
      continue;
    }
    if (!currentFile || nextLine === null) continue;
    if (line.startsWith('+') && !line.startsWith('+++')) {
      changed.get(currentFile)?.add(nextLine);
      nextLine++;
    } else if (!line.startsWith('-') && !line.startsWith('\\')) {
      // A context line inside a 0-context diff shouldn't occur, but stay
      // correct if it does: it still advances the new-file line cursor.
      nextLine++;
    }
  }
  return changed;
}

/**
 * Cross-reference changed lines against lcov hit data, scoped to `scopeRe`.
 * A changed line lcov never instrumented (blank, comment, a file outside the
 * coverage run) can't be scored and is excluded from the denominator —
 * only lines lcov actually tracked count, matching how patch-coverage tools
 * (Codecov/diff-cover) treat non-executable lines.
 */
export function computePatchCoverage(changedLines, lcovData, scopeRe = SCOPE_RE) {
  let coveredCount = 0;
  let totalCount = 0;
  /** @type {{ file: string, line: number }[]} */
  const uncovered = [];
  for (const [file, lines] of changedLines) {
    if (!scopeRe.test(file)) continue;
    const lcovLines = lcovData.get(file);
    if (!lcovLines) continue;
    for (const lineNo of lines) {
      const hits = lcovLines.get(lineNo);
      if (hits === undefined) continue; // not an executable line lcov tracked
      totalCount++;
      if (hits > 0) {
        coveredCount++;
      } else {
        uncovered.push({ file, line: lineNo });
      }
    }
  }
  const percentage = totalCount === 0 ? 100 : (coveredCount / totalCount) * 100;
  return { coveredCount, totalCount, percentage, uncovered };
}

async function main() {
  const baseArg = process.argv.find((a) => a.startsWith('--base='));
  const base = baseArg ? baseArg.slice('--base='.length) : (process.env.PATCH_COVERAGE_BASE ?? 'HEAD~1');

  let diffText;
  try {
    // A plain directory pathspec (no wildcard) recursively matches everything
    // under it — git's default fnmatch pathspec `*` does NOT cross `/`, so
    // `packages/*/src` would silently match nothing. Scoping to the 4 core
    // packages happens in computePatchCoverage's SCOPE_RE instead.
    const { stdout } = await execFileAsync('git', ['diff', '--unified=0', base, '--', 'packages']);
    diffText = stdout;
  } catch (err) {
    console.error(`patch-coverage: git diff against '${base}' failed — ${err.message}`);
    process.exit(2);
  }

  let lcovText;
  try {
    lcovText = readFileSync('coverage/lcov.info', 'utf8');
  } catch {
    console.error('patch-coverage: coverage/lcov.info not found — run `vitest run --coverage` first.');
    process.exit(2);
  }

  const changed = parseChangedLines(diffText);
  const lcov = parseLcov(lcovText);
  const { coveredCount, totalCount, percentage, uncovered } = computePatchCoverage(changed, lcov);

  if (totalCount === 0) {
    console.log('patch-coverage: no coverable changed lines in packages/{schema,corpus,core,cli}/src — pass.');
    return;
  }

  console.log(
    `patch-coverage: ${coveredCount}/${totalCount} changed lines covered (${percentage.toFixed(1)}%), floor ${FLOOR_PERCENT}%`,
  );
  if (percentage < FLOOR_PERCENT) {
    console.error('patch-coverage: below floor. Uncovered changed lines:');
    for (const { file, line } of uncovered) console.error(`  ${file}:${line}`);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
