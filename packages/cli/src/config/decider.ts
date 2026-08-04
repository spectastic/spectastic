/**
 * The `decider` config reader (spec 033-decider-effort D-002). Mirrors
 * git/config.ts: a section in the root `spectastic.json`, read synchronously,
 * fail-fast on a typo. Absent file/section → an empty partial, so the caller's
 * checkpoint-default + the `medium`/`human` fallbacks apply (core resolveDecider).
 */

import { readConfigFile } from '@spectastic/schema/config';
import { join } from 'node:path';
import type { DeciderRole, EffortLevel, RequestedEffort } from '@spectastic/core/decider';

export class DeciderConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeciderConfigError';
  }
}

/** The `decider` file config — effort may be 'auto' (034); floor is a concrete level. */
export interface DeciderFileConfig {
  role?: DeciderRole;
  effort?: RequestedEffort;
  floor?: EffortLevel;
}

const VALID_ROLES: readonly DeciderRole[] = ['human', 'agent', 'panel'];
const VALID_LEVELS: readonly EffortLevel[] = ['low', 'medium', 'high', 'xhigh', 'max'];
const VALID_EFFORTS: readonly RequestedEffort[] = ['low', 'medium', 'high', 'xhigh', 'max', 'auto'];

/**
 * Read `<cwd>/spectastic.json` and extract the `decider` section as a partial
 * config (role, effort, and/or floor may be absent). Malformed JSON or an
 * out-of-range value throws loudly.
 */
export function loadDeciderConfig(cwd: string): DeciderFileConfig {
  // Reads through the canonical reader (086 FR-004). `'throw'` keeps this
  // module's loud-error policy, which the quieter readers depend on.
  let parsed: unknown;
  try {
    parsed = readConfigFile(cwd, 'throw');
  } catch (err) {
    throw new DeciderConfigError((err as Error).message);
  }

  const section = (parsed as { decider?: unknown }).decider;
  if (section === undefined || section === null) return {};
  if (typeof section !== 'object') {
    throw new DeciderConfigError('spectastic.json "decider" must be an object');
  }

  const out: DeciderFileConfig = {};
  const role = (section as { role?: unknown }).role;
  if (role !== undefined) {
    if (!VALID_ROLES.includes(role as DeciderRole)) {
      throw new DeciderConfigError(`decider.role must be one of ${VALID_ROLES.join(' | ')}`);
    }
    out.role = role as DeciderRole;
  }
  const effort = (section as { effort?: unknown }).effort;
  if (effort !== undefined) {
    if (!VALID_EFFORTS.includes(effort as RequestedEffort)) {
      throw new DeciderConfigError(`decider.effort must be one of ${VALID_EFFORTS.join(' | ')}`);
    }
    out.effort = effort as RequestedEffort;
  }
  const floor = (section as { floor?: unknown }).floor;
  if (floor !== undefined) {
    if (!VALID_LEVELS.includes(floor as EffortLevel)) {
      throw new DeciderConfigError(`decider.floor must be one of ${VALID_LEVELS.join(' | ')}`);
    }
    out.floor = floor as EffortLevel;
  }
  return out;
}
