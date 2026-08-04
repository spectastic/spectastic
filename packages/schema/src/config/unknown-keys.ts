/**
 * Reporting a key the tool does not recognise (spec 087, FR-005 / FR-006 /
 * FR-007 / D-004).
 *
 * The silence this closes is specific: misspell a key today and nothing
 * happens. No warning, no error, no effect. The user believes they overrode a
 * default and did not, and cannot tell that from the outside — which is where
 * "not dogmatic" stops being true whatever the code permits.
 *
 * Deliberately does NOT validate against the generated schema. The question is
 * whether a key is *declared*, which the registry answers directly as a
 * set-membership test — no validator dependency, no schema file, no network.
 * That independence is the point: the schema helps only inside an editor that
 * resolves it, and a user without one would otherwise get nothing.
 *
 * Advisory, not fatal (D-003). A typo and a key belonging to a newer version of
 * the tool are the same observation, and nothing available here separates them;
 * failing the build for a colleague on a later release would be worse than the
 * silence being fixed.
 */

import { CONFIG_REGISTRY, type SectionName } from './registry.js';

/** Metadata a validator reads, not part of the configuration surface (FR-006). */
const NOT_CONFIGURATION = new Set(['$schema']);

export interface UnknownKeyFinding {
  /** Dotted path of the offending key, e.g. `validate.quantifedNfrFloor`. */
  key: string;
  /** The declared key it most likely should have been, when one is close. */
  suggestion?: string;
  message: string;
}

/**
 * Damerau-Levenshtein distance — edits plus adjacent transposition.
 *
 * Transposition counts as ONE, and that choice is load-bearing rather than
 * fussy: `enfroce` for `enforce` is the single commonest way to mistype a word,
 * and plain Levenshtein scores it 2. Under a threshold tight enough to keep
 * `role` from being "corrected" to `root`, a transposition would go
 * unsuggested — which is the case the suggestion exists for.
 *
 * Small and local rather than a dependency: it decides only whether two short
 * key names are close enough to mention.
 */
function distance(a: string, b: string): number {
  if (a === b) return 0;
  const rows: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(
        (rows[i]?.[j - 1] ?? 0) + 1,
        (rows[i - 1]?.[j] ?? 0) + 1,
        (rows[i - 1]?.[j - 1] ?? 0) + cost,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, (rows[i - 2]?.[j - 2] ?? 0) + 1);
      }
      const row = rows[i];
      if (row !== undefined) row[j] = best;
    }
  }
  return rows[a.length]?.[b.length] ?? 0;
}

/**
 * The closest declared name, when it is close enough to be worth naming.
 *
 * Threshold scales with length so a short key is not "corrected" to an
 * unrelated short key — `root` and `role` differ by one character and mean
 * entirely different things.
 */
function nearest(name: string, candidates: readonly string[]): string | undefined {
  let best: string | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const c of candidates) {
    const d = distance(name.toLowerCase(), c.toLowerCase());
    if (d < bestDistance) {
      bestDistance = d;
      best = c;
    }
  }
  const limit = Math.max(1, Math.floor(name.length / 4));
  return best !== undefined && bestDistance <= limit ? best : undefined;
}

/**
 * Every key in a configuration that the registry does not declare.
 *
 * Checks nested keys as well as sections, because a key misspelt *inside* a
 * real section is the likelier typo and would otherwise pass unnoticed.
 */
export function unknownKeyFindings(config: Record<string, unknown>): UnknownKeyFinding[] {
  const findings: UnknownKeyFinding[] = [];
  const sections = Object.keys(CONFIG_REGISTRY);

  for (const [name, value] of Object.entries(config)) {
    if (NOT_CONFIGURATION.has(name)) continue;

    if (!(name in CONFIG_REGISTRY)) {
      const suggestion = nearest(name, sections);
      findings.push({
        key: name,
        ...(suggestion !== undefined ? { suggestion } : {}),
        message:
          suggestion !== undefined
            ? `"${name}" is not a setting spectastic recognises — did you mean "${suggestion}"?`
            : `"${name}" is not a setting spectastic recognises, so it has no effect.`,
      });
      continue;
    }

    // A declared section: check the keys inside it too. A top-level scalar is
    // modelled as a one-key section, so its value is not an object and there is
    // nothing further to walk.
    const declared = Object.keys(CONFIG_REGISTRY[name as SectionName]);
    if (declared.includes(name)) continue;
    if (typeof value !== 'object' || value === null || Array.isArray(value)) continue;

    for (const key of Object.keys(value as Record<string, unknown>)) {
      if (declared.includes(key)) continue;
      const suggestion = nearest(key, declared);
      findings.push({
        key: `${name}.${key}`,
        ...(suggestion !== undefined ? { suggestion } : {}),
        message:
          suggestion !== undefined
            ? `"${name}.${key}" is not a setting spectastic recognises — did you mean "${name}.${suggestion}"?`
            : `"${name}.${key}" is not a setting spectastic recognises, so it has no effect.`,
      });
    }
  }

  return findings.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}
