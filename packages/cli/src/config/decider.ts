/**
 * The `decider` config reader (spec 033-decider-effort D-002). Mirrors
 * git/config.ts: a section in the root `spectastic.json`, read synchronously,
 * fail-fast on a typo. Absent file/section → an empty partial, so the caller's
 * checkpoint-default + the `medium`/`human` fallbacks apply (core resolveDecider).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DeciderConfig, DeciderRole, EffortLevel } from '@spectastic/core/decider';

export class DeciderConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeciderConfigError';
  }
}

const VALID_ROLES: readonly DeciderRole[] = ['human', 'agent', 'panel'];
const VALID_EFFORTS: readonly EffortLevel[] = ['low', 'medium', 'high', 'xhigh', 'max'];

/**
 * Read `<cwd>/spectastic.json` and extract the `decider` section as a partial
 * config (role and/or effort may be absent). Malformed JSON or an out-of-range
 * value throws loudly.
 */
export function loadDeciderConfig(cwd: string): Partial<DeciderConfig> {
  let raw: string;
  try {
    raw = readFileSync(join(cwd, 'spectastic.json'), 'utf8');
  } catch {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (err) {
    throw new DeciderConfigError(`spectastic.json is not valid JSON — ${(err as Error).message}`);
  }

  const section = (parsed as { decider?: unknown }).decider;
  if (section === undefined || section === null) return {};
  if (typeof section !== 'object') {
    throw new DeciderConfigError('spectastic.json "decider" must be an object');
  }

  const out: Partial<DeciderConfig> = {};
  const role = (section as { role?: unknown }).role;
  if (role !== undefined) {
    if (!VALID_ROLES.includes(role as DeciderRole)) {
      throw new DeciderConfigError(`decider.role must be one of ${VALID_ROLES.join(' | ')}`);
    }
    out.role = role as DeciderRole;
  }
  const effort = (section as { effort?: unknown }).effort;
  if (effort !== undefined) {
    if (!VALID_EFFORTS.includes(effort as EffortLevel)) {
      throw new DeciderConfigError(`decider.effort must be one of ${VALID_EFFORTS.join(' | ')}`);
    }
    out.effort = effort as EffortLevel;
  }
  return out;
}
