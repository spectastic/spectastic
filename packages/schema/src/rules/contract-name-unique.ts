import { readContractDeclarations } from '../contract-shared.js';
import type { Finding, PerFileRule } from '../types.js';

/**
 * `contract-name-unique` (076-contract-export-handover, FR-007).
 *
 * Two `<spec-contract>` declarations resolving to the same coordinate name are
 * an error: the name is a federation key, and two contracts sharing one means a
 * downstream reference resolves to whichever was read last.
 *
 * The case this exists for is not exotic. `contractCoordinateName` prefers an
 * explicit `name=` and otherwise derives one from the path's basename — and the
 * directory is discarded before the key is formed, so `api/v1/openapi.yaml` and
 * `api/v2/openapi.yaml` collide on `openapi`. A versioned contract is the
 * ordinary case, not a corner.
 *
 * Scoped per file, because a design declares the contracts for its own slice.
 * A collision across two designs in one project is a different question and is
 * not checked here — recorded rather than silently implied.
 */
export const contractNameUniqueRule: PerFileRule = {
  id: 'contract-name-unique',
  scope: 'per-file',
  defaultSeverity: 'error',
  description: 'Two <spec-contract> declarations in one design must not resolve to the same coordinate name.',
  check({ doc }) {
    const findings: Finding[] = [];
    // Pass the parsed document, not its source: this rule already holds one,
    // and handing over the string made it re-parse every document in the run.
    const declarations = readContractDeclarations(doc, doc.file);
    // The common case is a design with fewer than two declarations — return
    // before any grouping work, matching the sibling rule's early exit.
    if (declarations.length < 2) return findings;

    const seen = new Map<string, number>();
    for (const decl of declarations) {
      const name = decl.coordinateName;
      if (name === undefined || name === '') continue; // shape="none", or nothing to key on
      const firstLine = seen.get(name);
      if (firstLine === undefined) {
        seen.set(name, decl.line);
        continue;
      }
      findings.push({
        file: doc.file,
        line: decl.line,
        column: decl.column,
        rule: 'contract-name-unique',
        severity: 'error',
        message: `Two contracts resolve to the coordinate name "${name}" (the first is on line ${firstLine}) — a downstream reference cannot tell them apart.`,
        fixHint: 'Give one of them an explicit name= so each contract has its own stable key.',
      });
    }

    return findings;
  },
};
