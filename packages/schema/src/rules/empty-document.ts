import { findAll, getLocation } from '../parser.js';
import type { Element, Finding, PerFileRule } from '../types.js';

/**
 * Flag a spec.html that is empty or essentially empty — either the raw
 * HTML string is whitespace-only, or the document body has no element
 * children other than `<script>` / `<style>`. An empty input must exit
 * with this single error, not silent success.
 *
 * Implements the "Empty file" edge case of specs/002-validate-cli/spec.html §2.
 */
export const emptyDocumentRule: PerFileRule = {
  id: 'empty-document',
  scope: 'per-file',
  defaultSeverity: 'error',
  description: 'Spec input must not be empty or essentially empty (no body content of substance).',
  check({ doc }) {
    const findings: Finding[] = [];

    const trimmed = doc.html.trim();
    const isWhitespaceOnly = trimmed.length === 0;

    let isBodyEffectivelyEmpty = false;
    if (!isWhitespaceOnly) {
      const body = findAll(doc.ast, 'body')[0];
      if (!body) {
        isBodyEffectivelyEmpty = true;
      } else {
        const substantiveChildren = body.childNodes.filter((node): node is Element => {
          if (!('tagName' in node) || typeof node.tagName !== 'string') return false;
          return node.tagName !== 'script' && node.tagName !== 'style';
        });
        isBodyEffectivelyEmpty = substantiveChildren.length === 0;
      }
    }

    if (isWhitespaceOnly || isBodyEffectivelyEmpty) {
      const body = findAll(doc.ast, 'body')[0];
      const loc = body ? getLocation(body) : { line: 1, column: 1 };
      const line = isWhitespaceOnly ? 1 : loc.line;
      const column = isWhitespaceOnly ? 1 : loc.column;
      findings.push({
        file: doc.file,
        line,
        column,
        rule: 'empty-document',
        severity: 'error',
        message: isWhitespaceOnly ? 'Spec input is empty.' : 'Spec input has no body content of substance.',
        fixHint: 'Add at least a <spec-meta> block with a <spec-status> pill to begin the spec.',
      });
    }

    return findings;
  },
};
