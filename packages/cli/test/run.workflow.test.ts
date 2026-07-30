import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * 037 SC-004 (structural) — the Workflow home drives the SAME pipeline as the CLI
 * home. Executing a Claude Workflow needs the harness runtime, so CI asserts the
 * script's structure: it invokes `spectastic run` (the shared runPipeline, plan
 * D-001) with the resolved decider, so both homes make the same decisions by role.
 * Execution is a local/harness smoke.
 */

const here = dirname(fileURLToPath(import.meta.url));
const scriptPath = join(here, '..', '..', '..', 'workflows', 'hands-off.workflow.js');
const src = readFileSync(scriptPath, 'utf8');

describe('hands-off Workflow home (037 US4 / FR-008)', () => {
  it('declares a pure meta literal with a phase', () => {
    expect(src).toMatch(/export const meta = \{/);
    expect(src).toContain("name: 'hands-off'");
    expect(src).toMatch(/phases:\s*\[\{ title: 'Run' \}\]/);
  });

  it('drives the same pipeline via `spectastic run` with the resolved decider', () => {
    // src is a file read, not a template literal being authored — this asserts the
    // literal `${...}` interpolation syntax appears in the generated workflow script.
    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal source text, see above.
    expect(src).toContain('spectastic run ${specId}');
    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal source text, see above.
    expect(src).toContain('--decider=${decider}');
    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal source text, see above.
    expect(src).toContain('--checkpoints=${checkpoints}');
  });

  it('defaults to an unattended agent decider (never human)', () => {
    expect(src).toMatch(/decider = args\?\.decider \?\? 'agent'/);
  });
});
