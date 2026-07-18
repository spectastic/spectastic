/**
 * The five deterministic red-flag detectors (spec 049 FR-002, plan D-005).
 * Pure — a function of a diff's patch text + numstat, no git, no clock, no
 * network (NFR-001, NFR-002).
 *
 * Path/pattern-based, not per-language tooling (NFR-002). Ecosystem coverage
 * for the manifest-scoped detectors (install-hook, new-dependency) is v1
 * npm/`package.json` only — grown per ecosystem later, defaulting to
 * no-finding when unsure (plan §8 risk mitigation), never a false-fail.
 */

import type { DiffResult } from './diff.js';
import type { RedFlagFinding } from './types.js';

// ---------------------------------------------------------------------------
// Shared: split a unified patch into per-file hunks.
// ---------------------------------------------------------------------------

interface FileHunk {
  file: string;
  hunk: string;
}

/** Splits a `git diff --no-color` patch into one entry per `b/<file>` touched. */
function splitPatchFiles(patch: string): FileHunk[] {
  const parts = patch.split(/^diff --git a\/.+? b\/(.+)$/m);
  const out: FileHunk[] = [];
  for (let i = 1; i < parts.length; i += 2) {
    out.push({ file: parts[i] ?? '', hunk: parts[i + 1] ?? '' });
  }
  return out;
}

// ---------------------------------------------------------------------------
// 1. binary-blob (HIGH) — a newly-added binary file.
//
// Keyed on the patch's `/dev/null` marker rather than raw `--numstat` (a
// refinement over plan D-005's stated mechanism): numstat's `-\t-` fires for
// any binary touch, added or modified, and can't tell the two apart on its
// own — but FR-002 scopes this detector to a binary "added", so the
// patch-text marker is the precise signal. A modified (already-tracked)
// binary is deliberately out of scope for v1.
// ---------------------------------------------------------------------------

const BINARY_ADD_RE = /Binary files \/dev\/null and b\/(.+?) differ/g;

function detectBinaryBlobs(patch: string): RedFlagFinding[] {
  const out: RedFlagFinding[] = [];
  for (const m of patch.matchAll(BINARY_ADD_RE)) {
    out.push({ category: 'binary-blob', weight: 'high', file: m[1] ?? '', evidence: 'binary file added' });
  }
  return out;
}

// ---------------------------------------------------------------------------
// 2. build-script-edit (MEDIUM) — a build/CI/packaging *surface* file, not a
//    dependency manifest (that's new-dependency's / install-hook's domain —
//    kept disjoint so a routine dependency bump never double-counts).
// ---------------------------------------------------------------------------

const BUILD_CI_PATTERNS: readonly RegExp[] = [
  /^\.github\/workflows\//,
  /^\.circleci\/config\.ya?ml$/,
  /^\.gitlab-ci\.ya?ml$/,
  /(^|\/)Dockerfile$/,
  /(^|\/)Makefile$/,
  /(^|\/)(webpack|rollup|vite|tsup)\.config\.[cm]?[jt]s$/,
];

function detectBuildScriptEdit(file: string): RedFlagFinding[] {
  if (!BUILD_CI_PATTERNS.some((re) => re.test(file))) return [];
  return [{ category: 'build-script-edit', weight: 'medium', file, evidence: 'build/CI/packaging surface changed' }];
}

// ---------------------------------------------------------------------------
// Shared: scan a manifest's JSON block (e.g. "scripts" or "dependencies") for
// added/removed simple string entries — install-hook and new-dependency both
// need this. A block closes at its first bare `}`/`},` line (holds for the
// flat, one-level `scripts`/`dependencies` shape package.json uses).
// ---------------------------------------------------------------------------

const MANIFEST_FILE_RE = /(^|\/)package\.json$/;
const BLOCK_ENTRY_RE = /^([+\- ])\s*"([^"]+)"\s*:\s*"[^"]*"\s*,?\s*$/;
const INLINE_ENTRY_RE = /"([^"]+)"\s*:\s*"[^"]*"/g;

/**
 * Registers a block-entry `key` against `sign` ('+' adds, '-' removes,
 * anything else — a context line — is ignored).
 */
function registerEntry(sign: string, key: string, added: Map<string, true>, removed: Set<string>): void {
  if (sign === '+') added.set(key, true);
  else if (sign === '-') removed.add(key);
}

interface BlockAccumulator {
  added: Map<string, true>;
  removed: Set<string>;
}

/**
 * Handles one line while *outside* a block: either a fully inline block
 * (`"scripts": { "postinstall": "…" }` on one line — the D-005 spike's own
 * fixture shape) whose entries register immediately, or a multi-line
 * block's open line. Returns whether a multi-line block was entered.
 */
function scanBlockStartLine(
  line: string,
  inlineBlockRe: RegExp,
  blockOpenRe: RegExp,
  acc: BlockAccumulator,
): boolean {
  const inlineMatch = inlineBlockRe.exec(line);
  if (inlineMatch) {
    const sign = inlineMatch[1] ?? '';
    const inner = inlineMatch[2] ?? '';
    for (const em of inner.matchAll(INLINE_ENTRY_RE)) {
      registerEntry(sign, em[1] ?? '', acc.added, acc.removed);
    }
    return false;
  }
  return blockOpenRe.test(line);
}

/** Handles one line while *inside* a multi-line block. Returns whether the block just closed. */
function scanBlockBodyLine(line: string, acc: BlockAccumulator): boolean {
  const trimmed = line.replace(/^[+\- ]/, '').trim();
  if (trimmed === '}' || trimmed === '},') return true;
  const m = BLOCK_ENTRY_RE.exec(line);
  if (m) registerEntry(m[1] ?? '', m[2] ?? '', acc.added, acc.removed);
  return false;
}

/**
 * Scans a manifest's JSON block (e.g. `"scripts"` or `"dependencies"`) for
 * added/removed simple string entries. Handles both shapes package.json
 * uses: a multi-line block (an open line, one entry per line, a close line)
 * and a fully inline block on one line. A block closes at its first bare
 * `}`/`},` line (holds for the flat, one-level shape both use).
 */
function scanJsonBlock(hunk: string, blockKeys: readonly string[]): BlockAccumulator {
  const keys = blockKeys.join('|');
  const inlineBlockRe = new RegExp(String.raw`^([+\- ]?)\s*"(?:${keys})"\s*:\s*\{(.*)\}\s*,?\s*$`);
  const blockOpenRe = new RegExp(String.raw`^[+\- ]?\s*"(?:${keys})"\s*:\s*\{\s*$`);
  const acc: BlockAccumulator = { added: new Map(), removed: new Set() };
  let inBlock = false;

  for (const line of hunk.split('\n')) {
    if (inBlock) {
      if (scanBlockBodyLine(line, acc)) inBlock = false;
    } else {
      inBlock = scanBlockStartLine(line, inlineBlockRe, blockOpenRe, acc);
    }
  }
  return acc;
}

// ---------------------------------------------------------------------------
// 3. install-hook (HIGH) — an added/changed pre|post-install script.
// ---------------------------------------------------------------------------

const INSTALL_HOOK_KEYS = ['preinstall', 'install', 'postinstall'] as const;

function detectInstallHook(file: string, hunk: string): RedFlagFinding[] {
  if (!MANIFEST_FILE_RE.test(file)) return [];
  const { added } = scanJsonBlock(hunk, ['scripts']);
  const out: RedFlagFinding[] = [];
  for (const key of INSTALL_HOOK_KEYS) {
    if (added.has(key)) {
      out.push({ category: 'install-hook', weight: 'high', file, evidence: `scripts.${key} added or changed` });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 4. entropy-payload (HIGH) — a long contiguous base64/hex run on an added
//    line. Threshold (400) is well past a sha256/sha512 lockfile hash
//    (≤128 chars) and a small base64 data-URI icon — conservative per the
//    plan §8 false-positive mitigation, tuned against the T-103 fixtures.
// ---------------------------------------------------------------------------

const BASE64_RUN_RE = /[A-Za-z0-9+/]{400,}={0,2}/;
const HEX_RUN_RE = /[A-Fa-f0-9]{400,}/;

function detectEntropyPayload(file: string, hunk: string): RedFlagFinding[] {
  for (const line of hunk.split('\n')) {
    if (!line.startsWith('+') || line.startsWith('+++')) continue;
    const body = line.slice(1);
    if (BASE64_RUN_RE.test(body) || HEX_RUN_RE.test(body)) {
      return [{ category: 'entropy-payload', weight: 'high', file, evidence: 'long high-entropy/base64 payload added' }];
    }
  }
  return [];
}

// ---------------------------------------------------------------------------
// 5. new-dependency (LOW) — a genuinely new manifest dependency key. A
//    version-bump-only edit (same key removed and re-added) fires nothing.
// ---------------------------------------------------------------------------

const DEPENDENCY_BLOCK_KEYS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'] as const;

function detectNewDependency(file: string, hunk: string): RedFlagFinding[] {
  if (!MANIFEST_FILE_RE.test(file)) return [];
  const { added, removed } = scanJsonBlock(hunk, DEPENDENCY_BLOCK_KEYS);
  const out: RedFlagFinding[] = [];
  for (const key of added.keys()) {
    if (!removed.has(key)) {
      out.push({ category: 'new-dependency', weight: 'low', file, evidence: `dependency "${key}" added` });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------

/** Scans a diff for the five red-flag categories. No I/O. */
export function scan(diff: DiffResult): RedFlagFinding[] {
  const findings: RedFlagFinding[] = [...detectBinaryBlobs(diff.patch)];
  for (const { file, hunk } of splitPatchFiles(diff.patch)) {
    findings.push(
      ...detectBuildScriptEdit(file),
      ...detectInstallHook(file, hunk),
      ...detectEntropyPayload(file, hunk),
      ...detectNewDependency(file, hunk),
    );
  }
  return findings;
}
