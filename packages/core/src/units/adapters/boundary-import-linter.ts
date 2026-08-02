/**
 * The import-linter boundary reader (spec 081, D-002/D-003).
 *
 * Config is INI, in `setup.cfg` or `.importlinter`: an `[importlinter]` section
 * and one `[importlinter:contract:<id>]` per contract. A layers contract carries
 * `type = layers` and `layers = high medium low`, top to bottom, and lower
 * layers may not depend on higher ones — so the ordering is the whole
 * constraint, and expanding it into pairs loses nothing.
 *
 * The INI subset is read directly rather than by dependency (D-003): a section
 * header and a flat `key = value` have exactly one reading, unlike the YAML
 * 079 took a parser for. That asymmetry is deliberate and recorded there.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type BoundaryMap, expandLayerOrder } from '../boundary.js';

const CANDIDATES = ['.importlinter', 'setup.cfg'] as const;

/** Sections as `{ name: { key: value } }`. Flat keys only — the subset in use. */
function parseIniSubset(raw: string): Record<string, Record<string, string>> {
  const sections: Record<string, Record<string, string>> = {};
  let current: string | null = null;
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#') || trimmed.startsWith(';')) continue;
    const header = /^\[(.+)\]$/.exec(trimmed);
    if (header?.[1] !== undefined) {
      current = header[1];
      sections[current] ??= {};
      continue;
    }
    if (current === null) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    const section = sections[current];
    if (section !== undefined) section[key] = value;
  }
  return sections;
}

/** An optional layer is written in parentheses; strip them and treat it normally. */
function normaliseLayer(token: string): string {
  return token.replace(/^\(|\)$/g, '').trim();
}

/**
 * The first layers contract this project declares, or `null`.
 *
 * `null` for absent, unreadable, or declaring no layers contract — a partial
 * read is never a partial map.
 */
export function readImportLinterBoundary(cwd: string): BoundaryMap | null {
  for (const candidate of CANDIDATES) {
    const path = join(cwd, candidate);
    if (!existsSync(path)) continue;
    let raw: string;
    try {
      raw = readFileSync(path, 'utf8');
    } catch {
      continue;
    }

    let sections: Record<string, Record<string, string>>;
    try {
      sections = parseIniSubset(raw);
    } catch {
      continue;
    }

    for (const [name, body] of Object.entries(sections)) {
      if (!name.startsWith('importlinter:contract:')) continue;
      if (body.type !== 'layers') continue;
      const layers = (body.layers ?? '')
        .split(/\s+/)
        .map(normaliseLayer)
        .filter((l) => l !== '');
      if (layers.length === 0) continue;
      return { source: 'import-linter', units: layers, permitted: expandLayerOrder(layers) };
    }
  }
  return null;
}
