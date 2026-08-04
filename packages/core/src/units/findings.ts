/**
 * The declared-edge validate scan (spec 080-unit-edge-authoring, FR-007/FR-008).
 *
 * A folded CLI scan rather than a schema rule, following `enforceWaiverFindings`
 * and the marketplace-identity scan: the schema engine reads HTML artifacts and
 * this reads `spectastic.json`. The CLI wraps it in a `scan*` and merges the
 * result with the artifact findings.
 *
 * Two things it reports, and one it deliberately does not:
 *
 *   reports  — a malformed coordinate, and one naming its own declaring unit;
 *              both are knowably wrong from the config alone.
 *   silent   — a well-formed coordinate whose target is merely absent (FR-008).
 *              Most consumers do not have their providers checked out, so
 *              erroring would make the ordinary federated case unvalidatable.
 *              079 already reports that honestly, as an unverified edge.
 */

import { existsSync, readFileSync } from 'node:fs';
import { readConfigFile } from '@spectastic/schema/config';
import { dirname, join } from 'node:path';
import type { Finding } from '@spectastic/schema';
import { parseResourceUri } from '@spectastic/schema/project';
import { selfUnitCoordinate } from './read.js';

const RULE = 'unit-edge-well-formed';
const CONFIG_FILE = 'spectastic.json';

/** `consumes` as declared, or `[]` when the config is missing or unusable. */
function readRawConsumes(cwd: string): string[] {
  const path = join(cwd, CONFIG_FILE);
  if (!existsSync(path)) return [];
  try {
    const parsed: unknown = readConfigFile(dirname(path));
    if (typeof parsed !== 'object' || parsed === null) return [];
    const consumes = (parsed as { consumes?: unknown }).consumes;
    if (!Array.isArray(consumes)) return [];
    return consumes.filter((c): c is string => typeof c === 'string');
  } catch {
    // Malformed JSON is the config reader's finding to report, not this scan's.
    // Reporting it from both would double-count one defect.
    return [];
  }
}

export function declaredEdgeFindings(cwd: string): Finding[] {
  const entries = readRawConsumes(cwd);
  if (entries.length === 0) return [];

  const self = selfUnitCoordinate(cwd);
  const findings: Finding[] = [];

  for (const entry of entries) {
    const parsed = parseResourceUri(entry.trim());
    if (!parsed.ok) {
      findings.push({
        file: CONFIG_FILE,
        line: 1,
        column: 1,
        rule: RULE,
        severity: 'error',
        message: `Declared dependency "${entry}" is not a well-formed coordinate — ${parsed.reason}.`,
        fixHint: 'Correct the coordinate, or remove the entry.',
      });
      continue;
    }
    if (self !== null && entry.trim() === self) {
      findings.push({
        file: CONFIG_FILE,
        line: 1,
        column: 1,
        rule: RULE,
        severity: 'error',
        message: `Declared dependency "${entry}" names this project's own unit — a unit is never its own dependency.`,
        fixHint: 'Remove the entry.',
      });
    }
    // A well-formed coordinate whose target is absent is deliberately not a
    // finding (FR-008): absence says nothing about whether the unit exists.
  }

  return findings;
}
