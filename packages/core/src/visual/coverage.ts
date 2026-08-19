/**
 * The coverage check (spec 093-design-visual-section, FR-013, applied change
 * 2026-08-13-declare-the-variant-grid).
 *
 * A design may record which of the project's declared contexts a feature
 * addresses. Recording it is optional (FR-012); recording it *wrongly* is not.
 *
 * This is the third cross-file check in the kernel, beside the resolve and the
 * disagreement scans, and it is here rather than in `@spectastic/schema` for a
 * reason worth stating: the obvious implementation — reuse
 * `variantSameResolvesRule`, which already resolves exactly this grammar — is
 * impossible. That rule is `scope: 'per-file'` and returns at its first line on
 * a document carrying no `<spec-variant-grid>`, and a design never carries one;
 * the grid is a separate file at project scope. So the resolution is written
 * here. An adversarial review of the proposal caught the original claim that
 * the rule could be reused, which is why the distinction is written down here.
 *
 * The GRAMMAR was borrowed too, via `parseAxisContextPairs` — and that turned
 * out to be a defect (093/T-003), because a coverage claim may repeat an axis
 * where `<spec-same>` may not. See `claimPairs` below: neither the rule nor
 * the parser is reused now, only the shape of the syntax.
 *
 * Two failure modes, deliberately reported differently in wording though not in
 * severity:
 *
 *  - An UNKNOWN context is a typo, or a rename nobody propagated.
 *  - A DECLINED context is a disagreement. The project stated, with a reason,
 *    that it does not support that context; a feature claiming to address it
 *    contradicts a recorded decision rather than misspelling one.
 *
 * Absence is never a finding. An absent `contexts=` means NOT RECORDED — a
 * third value distinct from "all" and from "none" (FR-012) — and a design that
 * records nothing must stay silent, or every design in the estate would report
 * on the day this landed.
 */

import type { Finding, FileSystem } from '../types.js';

/** The whole-grid claim. A literal, so it can never collide with an axis name:
 *  a pair always contains `=`, and this never does. */
export const WHOLE_GRID = 'all';

/**
 * Split a claim into its `axis=context` pairs, preserving REPEATS.
 *
 * Deliberately not `parseAxisContextPairs` (093/T-003). That function returns
 * `Record<axis, context>` — one slot per axis name — which is correct for
 * `<spec-same axes=…>`, where an axis cannot legitimately repeat. A coverage
 * claim is the opposite case: addressing several contexts on one axis is the
 * normal shape (the real exemplar declares `mode=light mode=dark platform=ios
 * platform=ipados …`). Collapsing that into a record kept only the LAST value
 * per axis, so every earlier one went unchecked — not resolved, and not
 * reported when wrong. A typo in any position but the last passed silently.
 *
 * Malformed tokens are dropped here exactly as the record parser drops them:
 * the caller reports an empty result, the splitter does not throw.
 */
function claimPairs(contexts: string): [string, string][] {
  const pairs: [string, string][] = [];
  for (const token of contexts.trim().split(/\s+/)) {
    if (token === '') continue;
    const eq = token.indexOf('=');
    if (eq <= 0) continue;
    pairs.push([token.slice(0, eq), token.slice(eq + 1)]);
  }
  return pairs;
}

export interface CoverageClaim {
  /** Raw `contexts=` value, as authored. */
  contexts: string;
  /** Project-relative path of the grid the claim is made against. */
  variants: string;
  line: number;
  column: number;
}

/**
 * Resolve each claim against the grid it names. Takes the grid's HTML through a
 * reader rather than a path so the interesting cases are testable without a
 * fixture project per assertion — the shape `visualGatingFindings` already uses.
 */
export async function visualCoverageFindings(
  claims: readonly CoverageClaim[],
  file: string,
  fs: FileSystem,
  cwd: string,
): Promise<Finding[]> {
  const findings: Finding[] = [];
  if (claims.length === 0) return findings;

  const { readVariantGrid } = await import('@spectastic/schema/variant-grid');
  const { parse } = await import('@spectastic/schema/parser');

  // One read per distinct grid, not per claim: a project has one grid and a
  // design carries few declarations, but re-reading it per pair would make the
  // cost quadratic in a file that is already being read for other scans.
  const gridCache = new Map<string, { contexts: Map<string, Set<string>>; declined: Map<string, Set<string>> } | null>();

  for (const claim of claims) {
    const flag = (message: string, fixHint: string): void => {
      findings.push({
        file,
        line: claim.line,
        column: claim.column,
        rule: 'visual-coverage-resolves',
        severity: 'error',
        message,
        fixHint,
      });
    };

    if (claim.contexts.trim() === WHOLE_GRID) continue; // an explicit whole-grid claim resolves against everything

    let grid = gridCache.get(claim.variants);
    if (grid === undefined) {
      try {
        const html = await fs.readFile(`${cwd}/${claim.variants}`);
        const doc = parse(html, claim.variants);
        const read = readVariantGrid(doc);
        const contexts = new Map<string, Set<string>>();
        const declined = new Map<string, Set<string>>();
        for (const axis of read.axes) {
          if (axis.name === undefined) continue;
          const all = new Set<string>();
          const dec = new Set<string>();
          for (const c of axis.contexts) {
            if (c.name === undefined) continue;
            all.add(c.name);
            if (c.declined) dec.add(c.name);
          }
          contexts.set(axis.name, all);
          declined.set(axis.name, dec);
        }
        grid = { contexts, declined };
      } catch {
        // An unreadable grid is the RESOLVE scan's finding, not this one.
        // Reporting it twice would make one broken path read as two problems.
        grid = null;
      }
      gridCache.set(claim.variants, grid);
    }
    if (grid === null) continue;

    const pairs = claimPairs(claim.contexts);
    if (pairs.length === 0) {
      flag(
        `<spec-visual contexts="${claim.contexts}"> names no combination, so it records having addressed nothing`,
        `Set contexts= to space-separated axis=context pairs — for example contexts="platform=ios mode=dark" — or to "${WHOLE_GRID}" for the whole grid, or drop it entirely to record nothing (spec.html FR-012).`,
      );
      continue;
    }

    for (const [axisName, contextName] of pairs) {
      const known = grid.contexts.get(axisName);
      if (known === undefined) {
        flag(
          `<spec-visual contexts=…> names axis "${axisName}", which ${claim.variants} does not declare`,
          'A coverage claim must refer to axes the project\'s grid declares (spec.html FR-013). A claim against nothing reads as coverage and records none.',
        );
        continue;
      }
      if (!known.has(contextName)) {
        flag(
          `<spec-visual contexts=…> names context "${contextName}" on axis "${axisName}", which that axis does not declare`,
          'A coverage claim must refer to contexts that exist (spec.html FR-013) — otherwise a renamed context silently turns a claim into a dangling one.',
        );
        continue;
      }
      if (grid.declined.get(axisName)?.has(contextName) === true) {
        flag(
          `<spec-visual contexts=…> claims to address "${axisName}=${contextName}", which ${claim.variants} declines`,
          'The project declined this context with a reason, so a feature addressing it contradicts a recorded decision rather than mistyping one (spec.html FR-013). Either drop it from the claim, or undecline the context in the grid and say why it changed.',
        );
      }
    }
  }

  return findings;
}
