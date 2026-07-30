/**
 * Waiver config reader for the enforcement-relaxation layer (spec 042, FR-011).
 *
 * A downstream project relaxes a single floor category by declaring a waiver in
 * the root `spectastic.json` under `enforce.waivers[]`. This is the fourth typed
 * section-per-feature config (`git`, `decider`, `models` precede it) — not a
 * general settings bag, just one feature's own typed loader.
 *
 * Deliberately fail-SAFE, unlike `loadGitConfig` (which throws on a typo): a
 * malformed waiver is silently dropped, so a broken waiver can never *accidentally
 * disable* a gate (FR-013 secure-by-default). `validate`'s `enforce-waiver-well-formed`
 * scan is the loud half that tells the author their waiver is broken; this side
 * simply refuses to trust anything it can't fully parse.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { EnforcementCategory, EnforceWaiver } from './types.js';

/** Max horizon for a waiver's `until` (FR-011): a waiver can't be written to never expire. */
export const MAX_WAIVER_DAYS = 365;

/** Minimum meaningful reason length — guards the comply-or-explain boilerplate failure mode. */
export const MIN_REASON_LENGTH = 10;

/**
 * Reasons that are technically non-empty but carry no justification. Compared
 * case-insensitively after stripping surrounding punctuation/whitespace.
 */
export const BOILERPLATE_REASONS: readonly string[] = [
  'n/a',
  'na',
  'todo',
  'tbd',
  'temp',
  'temporary',
  'waived',
  'waiver',
  'none',
  'skip',
  'fixme',
  'xxx',
  'because',
];

/** True when a reason is empty, a known boilerplate token, or trivially short. */
export function isBoilerplateReason(reason: string): boolean {
  const trimmed = reason.trim();
  if (trimmed.length === 0) return true;
  const normalized = trimmed
    .toLowerCase()
    .replace(/[.\-_/\\!?,;:'"]/g, '')
    .trim();
  if (BOILERPLATE_REASONS.includes(normalized)) return true;
  return trimmed.length < MIN_REASON_LENGTH;
}

/**
 * Strictly parse an ISO `YYYY-MM-DD` date at UTC midnight. Returns `null` for any
 * other shape (so `2026-1-1`, `2026/01/01`, or garbage never silently parse).
 */
export function parseIsoDate(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const date = new Date(`${s}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  // Round-trip guard: rejects impossible dates like 2026-02-31 that Date rolls over.
  if (date.toISOString().slice(0, 10) !== s) return null;
  return date;
}

/** Whole days from `a` to `b` (positive when `b` is later), at UTC-day resolution. */
export function daysBetween(a: Date, b: Date): number {
  const MS_PER_DAY = 86_400_000;
  const dayA = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const dayB = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  return Math.round((dayB - dayA) / MS_PER_DAY);
}

/** A raw waiver entry as read from JSON, before structural validation. */
export interface RawWaiver {
  category?: unknown;
  reason?: unknown;
  until?: unknown;
  owner?: unknown;
}

/**
 * Read the raw `enforce.waivers[]` array from `<cwd>/spectastic.json` without any
 * validation. Fail-safe to `[]` on an absent/unreadable/malformed file, a missing
 * `enforce` section, or a non-array `waivers`. The loud validation lives in the
 * `validate` scan, which consumes this raw list so it can report structurally
 * broken entries (a missing field) that `loadWaivers` would silently drop.
 */
export function readRawWaivers(cwd: string): RawWaiver[] {
  let raw: string;
  try {
    raw = readFileSync(join(cwd, 'spectastic.json'), 'utf8');
  } catch {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return []; // invalid JSON: the git config reader owns the loud error for that
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return [];
  const enforce = (parsed as Record<string, unknown>).enforce;
  if (enforce === null || typeof enforce !== 'object' || Array.isArray(enforce)) return [];
  const waivers = (enforce as Record<string, unknown>).waivers;
  if (!Array.isArray(waivers)) return [];
  return waivers.filter((w): w is RawWaiver => w !== null && typeof w === 'object' && !Array.isArray(w));
}

/**
 * Load structurally-complete waivers from `<cwd>/spectastic.json`. Any entry
 * missing a string `category`/`reason`/`until`/`owner` is dropped (fail-safe) —
 * a partial waiver never relaxes anything. Policy checks (boilerplate reason,
 * date range, un-relaxable category, expiry) are applied later by
 * `evaluateEnforcement` (runtime) and the validate scan (loud), not here.
 */
export function loadWaivers(cwd: string): EnforceWaiver[] {
  const out: EnforceWaiver[] = [];
  for (const w of readRawWaivers(cwd)) {
    if (
      typeof w.category === 'string' &&
      typeof w.reason === 'string' &&
      typeof w.until === 'string' &&
      typeof w.owner === 'string'
    ) {
      out.push({
        category: w.category as EnforcementCategory,
        reason: w.reason,
        until: w.until,
        owner: w.owner,
      });
    }
  }
  return out;
}
