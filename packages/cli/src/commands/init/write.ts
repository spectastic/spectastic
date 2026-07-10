import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { FileWriteDecision, InitSummary } from './types.js';

/**
 * Execute the finalised plan in a single pass. Per D-005 of the plan,
 * Ctrl-C during the prompt loop exits before this function is called,
 * so partial writes are impossible from interactive cancellation.
 *
 * Per FR-008 + FR-002 of specs/003-init-node-port/spec.html.
 */
export async function executeWrites(
  plan: readonly FileWriteDecision[],
): Promise<InitSummary> {
  let wrote = 0;
  let overwrote = 0;
  let skipped = 0;

  for (const decision of plan) {
    if (decision.action === 'skip') {
      skipped += 1;
      continue;
    }
    await mkdir(dirname(decision.destination), { recursive: true });
    // Composed artifacts (spec 041) carry literal content and have no source
    // path; copy-based decisions carry a source. Prefer content when present.
    if (decision.content !== undefined) {
      await writeFile(decision.destination, decision.content, 'utf8');
    } else if (decision.source !== undefined) {
      await copyFile(decision.source, decision.destination);
    } else {
      throw new Error(
        `init: write decision for ${decision.destination} has neither source nor content`,
      );
    }
    if (decision.action === 'overwrite') {
      overwrote += 1;
    } else {
      wrote += 1;
    }
  }

  return { wrote, overwrote, skipped };
}
