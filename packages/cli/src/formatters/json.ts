import type { Finding } from '@spectastic/schema';

/**
 * JSON formatter. Emits the Finding[] verbatim as a single JSON array.
 * Implements FR-004 of specs/002-validate-cli/spec.html.
 *
 * Used by CI scripts, the VS Code extension, MCP tool consumers, and
 * anyone who'd rather parse structured output than scrape humans.
 */
export function jsonFormatter(findings: readonly Finding[]): string {
  return `${JSON.stringify(findings, null, 2)}\n`;
}
