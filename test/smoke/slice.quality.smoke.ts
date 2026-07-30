import { describe, expect, it } from 'vitest';
// Import the built engine — the repo root isn't a workspace member.
// Requires `pnpm --filter @spectastic/core build`.
import { sliceCommand } from '../../packages/core/dist/commands/slice.js';
import { ClaudeProvider } from '../../packages/core/dist/providers/claude.js';

/**
 * Local-only smoke test for the slicer's *judgment* quality (spec 029, plan
 * D-007). CI can't verify a real decomposition — this exercises the actual LLM,
 * so it self-skips without ANTHROPIC_API_KEY (and when the stub is active). Run
 * with `pnpm test:smoke`.
 */

const live = !!process.env.ANTHROPIC_API_KEY && !process.env.SPECTASTIC_AI_STUB;

// A deliberately over-budget parent: many requirements spanning distinct concerns.
const parentHtml = `<!doctype html><html><body><main>
<p class="small-caps">Specification · 999-smoke-parent</p>
<h1>An over-budget parent</h1>
<spec-requirement id="FR-001" priority="must"><p>Users can register with email and password.</p></spec-requirement>
<spec-requirement id="FR-002" priority="must"><p>Users can log in and receive a session token.</p></spec-requirement>
<spec-requirement id="FR-003" priority="must"><p>Sessions expire after inactivity.</p></spec-requirement>
<spec-requirement id="FR-004" priority="must"><p>Users can reset a forgotten password by email.</p></spec-requirement>
<spec-requirement id="FR-005" priority="must"><p>Admins can list and deactivate user accounts.</p></spec-requirement>
<spec-requirement id="FR-006" priority="must"><p>The system logs every auth event to an audit trail.</p></spec-requirement>
<spec-requirement id="SC-001" priority="must"><p>95% of logins complete in under 500 ms.</p></spec-requirement>
</main></body></html>`;

describe.skipIf(!live)('slicer quality (real LLM)', () => {
  it('decomposes the over-budget parent into ≥2 covering children', async () => {
    const ai = new ClaudeProvider();
    const res = await sliceCommand(
      { parentSpecId: '999-smoke-parent', parentHtml, runCritic: false },
      { cwd: process.cwd(), ai },
    );
    expect(res.model.orderedChildren.length).toBeGreaterThanOrEqual(2);
    // Every parent requirement should land somewhere (total partition).
    expect(res.model.coverage.unassigned).toEqual([]);
  });
});
