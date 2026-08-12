import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { UI_DIR_SUFFIXES, UI_SIGNAL_PATHS, detectUserInterface } from '../src/enforce/detect.js';

/**
 * User-interface detection (spec 093-design-visual-section, FR-003 + NFR-003).
 *
 * The population this exists to serve is the one a manifest cannot describe:
 * SwiftUI, UIKit and AppKit ship in the platform SDK and are reached by
 * `import`, never declared, so a dependency-only heuristic classifies a native
 * Apple application as having no interface at all. The only root-level marker
 * is the project directory's own suffix, which is why one bounded read of the
 * root sits beside the fixed-name signals.
 */

function fixture(files: Record<string, string>, dirs: string[] = []): string {
  const dir = mkdtempSync(join(tmpdir(), 'spectastic-detect-ui-'));
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(dir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, body, 'utf8');
  }
  for (const d of dirs) mkdirSync(join(dir, d), { recursive: true });
  return dir;
}

describe('a manifest naming a user-interface framework', () => {
  it('sees a React project', () => {
    const dir = fixture({ 'package.json': '{"dependencies":{"react":"^19"}}' });
    expect(detectUserInterface(dir).detected).toBe(true);
  });

  it('sees a Flutter project', () => {
    const dir = fixture({ 'pubspec.yaml': 'dependencies:\n  flutter:\n    sdk: flutter\n' });
    expect(detectUserInterface(dir).detected).toBe(true);
  });

  it('sees an Android application', () => {
    const dir = fixture({ 'build.gradle': "plugins { id 'com.android.application' }" });
    expect(detectUserInterface(dir).detected).toBe(true);
  });

  it('names the signal that fired, so a finding can say why', () => {
    const dir = fixture({ 'package.json': '{"dependencies":{"svelte":"^5"}}' });
    expect(detectUserInterface(dir).signals).toEqual(['package.json:"svelte"']);
  });
});

describe('a native Apple application, which no manifest describes', () => {
  it('sees a project directory by its suffix', () => {
    const dir = fixture({ 'README.md': '# app' }, ['Converter.xcodeproj']);
    expect(detectUserInterface(dir).detected).toBe(true);
    expect(detectUserInterface(dir).signals).toEqual(['Converter.xcodeproj']);
  });

  it('sees a workspace by its suffix', () => {
    const dir = fixture({ 'README.md': '# app' }, ['Converter.xcworkspace']);
    expect(detectUserInterface(dir).detected).toBe(true);
  });

  it('is NOT fooled by a Package.swift alone, which names no interface', () => {
    const dir = fixture({ 'Package.swift': '// swift-tools-version:6.0\nlet package = Package(name: "lib")' });
    expect(detectUserInterface(dir).detected).toBe(false);
  });
});

describe('failing safe on the antecedent', () => {
  it('reports no interface for a plain library', () => {
    const dir = fixture({ 'package.json': '{"dependencies":{"lodash":"^4"}}' });
    expect(detectUserInterface(dir).detected).toBe(false);
    expect(detectUserInterface(dir).signals).toEqual([]);
  });

  it('reports no interface for a project with nothing readable at all', () => {
    const dir = fixture({});
    expect(detectUserInterface(dir).detected).toBe(false);
  });

  it('does not throw on a project root it cannot read', () => {
    expect(() => detectUserInterface(join(tmpdir(), 'spectastic-does-not-exist-ui'))).not.toThrow();
  });

  it('matches a dependency name exactly rather than by substring', () => {
    // "reactive-forms" must not read as "react".
    const dir = fixture({ 'package.json': '{"dependencies":{"reactive-streams":"^1"}}' });
    expect(detectUserInterface(dir).detected).toBe(false);
  });
});

describe('the bounds are asserted, not trusted (NFR-003 + design D-004)', () => {
  it('stats at most 20 enumerated paths', () => {
    expect(UI_SIGNAL_PATHS.length).toBeLessThanOrEqual(20);
  });

  it('reads no path deeper than 4 segments', () => {
    for (const p of UI_SIGNAL_PATHS) expect(p.split('/').length).toBeLessThanOrEqual(4);
  });

  it('contains no glob in any enumerated path', () => {
    for (const p of UI_SIGNAL_PATHS) expect(p).not.toMatch(/[*?[\]{}]/);
  });

  it('performs at most 1 directory read, and only of the project root', () => {
    // The fourth bound, added by D-004. Without it, "one root read" is an
    // unbounded loosening of NFR-003 rather than a stated one.
    const src = readSource();
    const reads = [...src.matchAll(/readdirSync\(/g)].length;
    expect(reads).toBe(1);
    expect(src).toMatch(/readdirSync\(cwd,/);
  });

  it('matches root entries against a hand-enumerated suffix list', () => {
    expect([...UI_DIR_SUFFIXES]).toEqual(['.xcodeproj', '.xcworkspace']);
  });
});

/** The detector's own source, read once for the structural bound assertions. */
function readSource(): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { readFileSync } = require('node:fs') as typeof import('node:fs');
  const { fileURLToPath } = require('node:url') as typeof import('node:url');
  const here = fileURLToPath(import.meta.url);
  const start = here.slice(0, here.indexOf('/packages/core/'));
  const whole = readFileSync(join(start, 'packages/core/src/enforce/detect.ts'), 'utf8');
  // Scope to the user-interface section — the module has other detectors with
  // their own budgets, and this bound is about this one.
  const from = whole.indexOf('// --- User-interface detection');
  expect(from).toBeGreaterThan(-1);
  return whole.slice(from);
}
