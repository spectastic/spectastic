import type { Finding } from '@spectastic/schema';
import pc from 'picocolors';

/**
 * Human-readable terminal output for a Finding[]. Implements FR-003 of
 * specs/002-validate-cli/spec.html.
 *
 * Layout:
 *   file/path.html
 *     LINE:COL  severity  message  rule
 *           → fix hint (if present)
 *   ...
 *   N errors, M warnings
 */
export function humanFormatter(findings: readonly Finding[]): string {
  if (findings.length === 0) {
    return `${pc.green('✓ no findings')}\n`;
  }

  const lines: string[] = [];
  const byFile = new Map<string, Finding[]>();
  for (const f of findings) {
    const list = byFile.get(f.file) ?? [];
    list.push(f);
    byFile.set(f.file, list);
  }

  for (const [file, fs] of byFile) {
    lines.push(pc.underline(file));
    for (const f of fs) {
      const sev = f.severity === 'error' ? pc.red('error') : pc.yellow('warning');
      const loc = pc.dim(`${f.line}:${f.column}`);
      lines.push(`  ${loc}  ${sev}  ${f.message}  ${pc.dim(f.rule)}`);
      if (f.fixHint) lines.push(pc.dim(`        → ${f.fixHint}`));
    }
    lines.push('');
  }

  const errors = findings.filter((f) => f.severity === 'error').length;
  const warnings = findings.filter((f) => f.severity === 'warning').length;
  const summary = `${errors} error${errors === 1 ? '' : 's'}, ${warnings} warning${warnings === 1 ? '' : 's'}`;
  lines.push(errors > 0 ? pc.red(summary) : pc.yellow(summary));
  return `${lines.join('\n')}\n`;
}
