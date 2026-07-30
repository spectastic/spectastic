/**
 * `changeRisk` config loader for the change-risk scan (spec 049 NFR-004, plan
 * D-003). Fail-safe, mirroring `enforce/config.ts`'s `loadWaivers`: an
 * absent or malformed `spectastic.json` — or a malformed `changeRisk`
 * section — never throws and never silently disables the scan. It resolves
 * to `{}`, which callers combine with `DEFAULT_BANDS` (secure-by-default,
 * per principles.html P-9).
 *
 * `bands` and `failAt` validate independently: a malformed `bands` object
 * doesn't drop a well-formed `failAt` alongside it, and vice versa — each
 * field is either structurally complete and sane, or absent.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ChangeRiskBands, ChangeRiskConfig } from './types.js';

function isFiniteInRange(v: unknown, min: number, max: number): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
}

/** A well-formed `bands` object: both thresholds numeric, 0–100, amber strictly before red. */
function parseBands(raw: unknown): ChangeRiskBands | undefined {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const { amber, red } = raw as Record<string, unknown>;
  if (!isFiniteInRange(amber, 0, 100) || !isFiniteInRange(red, 0, 100)) return undefined;
  if (amber >= red) return undefined;
  return { amber, red };
}

/** A well-formed `failAt`: numeric, 0–100. */
function parseFailAt(raw: unknown): number | undefined {
  return isFiniteInRange(raw, 0, 100) ? raw : undefined;
}

/** Reads `spectastic.json`'s `changeRisk` section. Absent/malformed → `{}`. */
export function loadChangeRiskConfig(cwd: string): ChangeRiskConfig {
  let raw: string;
  try {
    raw = readFileSync(join(cwd, 'spectastic.json'), 'utf8');
  } catch {
    return {};
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return {};
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const section = (parsed as Record<string, unknown>).changeRisk;
  if (section === null || typeof section !== 'object' || Array.isArray(section)) return {};
  const { bands, failAt } = section as Record<string, unknown>;

  const config: ChangeRiskConfig = {};
  const parsedBands = parseBands(bands);
  if (parsedBands) config.bands = parsedBands;
  const parsedFailAt = parseFailAt(failAt);
  if (parsedFailAt !== undefined) config.failAt = parsedFailAt;
  return config;
}
