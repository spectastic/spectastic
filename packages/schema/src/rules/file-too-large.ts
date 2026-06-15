import type { Finding, PerFileRule } from '../types.js';

/**
 * Flag spec.html inputs whose line count exceeds 5,000. NFR-001 caps the
 * performance guarantee at files under 5,000 lines; beyond that the parser
 * still works but timing is no longer guaranteed. A single warning at the
 * top of the document is enough — the file size is a whole-file property,
 * not a per-line one.
 *
 * Implements the file-too-large edge case in specs/002-validate-cli/spec.html
 * §2 Edge cases (NFR-001).
 */
export const fileTooLargeRule: PerFileRule = {
  id: 'file-too-large',
  scope: 'per-file',
  defaultSeverity: 'warning',
  description:
    'Spec files over 5,000 lines parse but lose the NFR-001 performance guarantee.',
  check({ doc }) {
    const findings: Finding[] = [];
    const lineCount = doc.html.split('\n').length;
    if (lineCount > 5000) {
      findings.push({
        file: doc.file,
        line: 1,
        column: 1,
        rule: 'file-too-large',
        severity: 'warning',
        message: `File has ${lineCount} lines; NFR-001 performance guarantee only holds under 5,000.`,
        fixHint: 'Split the spec into smaller siblings, or accept that validation may run slower than the NFR-001 budget.',
      });
    }
    return findings;
  },
};
