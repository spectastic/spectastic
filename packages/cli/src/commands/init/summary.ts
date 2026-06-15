import pc from 'picocolors';
import type { InitSummary } from './types.js';

/**
 * Print the init summary in the same shape as the Python script:
 *
 *   spectastic init — summary
 *     wrote         16
 *     overwrote      0
 *     skipped        0
 *
 *   Next step:
 *     Open the project in Claude Code and run /spectastic.principles
 *     to author your project's principles.html.
 *
 * Per FR-007 of specs/003-init-node-port/spec.html.
 */
export function printSummary(summary: InitSummary): void {
  const lines: string[] = [];
  lines.push(pc.bold('spectastic init — summary'));
  lines.push(`  ${pad('wrote', summary.wrote)}`);
  lines.push(`  ${pad('overwrote', summary.overwrote)}`);
  lines.push(`  ${pad('skipped', summary.skipped)}`);
  lines.push('');
  lines.push(pc.bold('Next step:'));
  lines.push(
    "  Open the project in Claude Code and run /spectastic.principles",
  );
  lines.push("  to author your project's principles.html.");
  lines.push('');
  process.stdout.write(`${lines.join('\n')}\n`);
}

function pad(label: string, n: number): string {
  // Right-align the count in a fixed-width column to match the Python output.
  const labelCol = label.padEnd(10);
  const countCol = String(n).padStart(4);
  return `${labelCol}${countCol}`;
}
