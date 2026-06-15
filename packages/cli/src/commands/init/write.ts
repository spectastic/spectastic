import { copyFile, mkdir } from 'node:fs/promises';
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
    await copyFile(decision.source, decision.destination);
    if (decision.action === 'overwrite') {
      overwrote += 1;
    } else {
      wrote += 1;
    }
  }

  return { wrote, overwrote, skipped };
}
