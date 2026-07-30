import { getLocation, walk } from '../parser.js';
import type { CrossFileRule, Finding, Location } from '../types.js';

/**
 * Cross-branch spec-id collision detection (spec 025-id-uniqueness, FR-001).
 *
 * Spec directory ids (`specs/<NNN>-slug/`) are minted by scanning + incrementing
 * with no atomicity (`resolveNextId`), so two developers on two branches can both
 * grab `025`. That collision is invisible on either branch alone — it only appears
 * when the branches meet. This rule makes it LOUD at merge: when two *distinct*
 * `specs/<NNN>-slug/` directories share the same numeric `NNN` prefix, every
 * participating document gets an error citing the others.
 *
 * `explorations/` is excluded for free — it is not under `specs/`, so the path
 * regex never matches it (graduation reuses the id by design). Archived and
 * withdrawn proposals are already excluded upstream at the CLI glob
 * (`packages/cli/src/glob.ts`).
 *
 * The branch-model engine of git-strategy `G-001`; mirrors `no-duplicate-ids`.
 */
const SPEC_FILE = /(?:^|\/)specs\/([^/]+)\/spec\.html$/;
const NNN_PREFIX = /^(\d+)-/;

export const specIdUniqueRule: CrossFileRule = {
  id: 'spec-id-unique',
  scope: 'cross-file',
  defaultSeverity: 'error',
  description: 'Two distinct specs/<NNN>-slug/ directories must not share the same numeric NNN prefix.',
  check({ docs }) {
    // number → (distinct dir name → first site seen in that dir)
    const byNumber = new Map<string, Map<string, Location>>();
    for (const doc of docs) {
      const dirMatch = SPEC_FILE.exec(doc.file);
      if (!dirMatch?.[1]) continue;
      const dir = dirMatch[1];
      const numMatch = NNN_PREFIX.exec(dir);
      if (!numMatch?.[1]) continue;
      const num = numMatch[1];

      // Anchor the finding at the document root (line 1) — the collision is a
      // property of the directory, not any element inside it.
      let line = 1;
      let column = 1;
      walk(doc.ast, (el) => {
        if (el.tagName === 'html') {
          const loc = getLocation(el);
          line = loc.line;
          column = loc.column;
        }
      });

      const dirs = byNumber.get(num) ?? new Map<string, Location>();
      if (!dirs.has(dir)) dirs.set(dir, { file: doc.file, line, column });
      byNumber.set(num, dirs);
    }

    const findings: Finding[] = [];
    for (const [num, dirs] of byNumber) {
      if (dirs.size < 2) continue;
      const sites = [...dirs.values()];
      for (let i = 0; i < sites.length; i++) {
        const here = sites[i];
        if (!here) continue;
        const others = sites.filter((_, j) => j !== i);
        findings.push({
          file: here.file,
          line: here.line,
          column: here.column,
          rule: 'spec-id-unique',
          severity: 'error',
          message: `spec id "${num}" is claimed by ${dirs.size} different directories (${[...dirs.keys()].join(', ')}) — two branches grabbed the same number`,
          fixHint:
            'Renumber the newer slice (and rename its directory + branch) to the next free NNN. Stable ids are never reused (P-3).',
          relatedLocations: others,
        });
      }
    }
    return findings;
  },
};
