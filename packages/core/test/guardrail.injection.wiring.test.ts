import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { designCommand } from '../src/commands/design.js';
import { nodeFs } from '../src/providers/node-fs.js';
import type { AIProvider, ChatOpts, Question, SubagentOpts, SubagentResult } from '../src/types.js';

/**
 * Slice 4 wiring exercise (spec 116, T-112, SC-002/FR-002/FR-003): the prompt
 * `design` assembles includes the governing-decision block when a decision
 * governs the declared surface, and omits it when none does. Real-fs, because
 * loadDecisions walks specs/<id>/design.html.
 */

class CapturingAI implements AIProvider {
  public prompts: string[] = [];
  async chat(prompt: string, _o?: ChatOpts): Promise<string> {
    this.prompts.push(prompt);
    return '{"approach":"x","decisions":[],"alternatives":[],"risks":[],"principles":[]}';
  }
  async ask<T extends Record<string, string>>(_q: ReadonlyArray<Question>): Promise<T> {
    throw new Error('unused');
  }
  async subagent(_p: string, _o?: SubagentOpts): Promise<SubagentResult> {
    throw new Error('unused');
  }
}

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function projectWithGoverningDecision(): string {
  const dir = mkdtempSync(join(tmpdir(), 'guardrail-inject-'));
  dirs.push(dir);
  const govDir = join(dir, 'specs', '002-pay');
  mkdirSync(govDir, { recursive: true });
  writeFileSync(
    join(govDir, 'design.html'),
    `<spec-status value="accepted">Accepted</spec-status>
     <section id="decisions">
     <spec-decision id="D-001" status="accepted" posture="block">
       <spec-scope><spec-path>src/pay/**</spec-path></spec-scope>
       <spec-enforcement><spec-rule tool="archunit" id="pay_boundary"></spec-rule></spec-enforcement>
       <spec-reason>Only the payment adapter may write positions.</spec-reason>
       <h4>D-001</h4>
     </spec-decision></section>`,
  );
  return dir;
}

const SPEC = '<p class="small-caps">Specification · 009-recon</p><spec-requirement id="FR-001" priority="must"><p>x</p></spec-requirement>';
const designTouching = (tree: string) =>
  `<section id="project-structure"><pre><code>${tree}</code></pre></section>`;

describe('design injects the governing block for its declared surface (SC-002)', () => {
  it('includes the block when the surface is governed', async () => {
    const cwd = projectWithGoverningDecision();
    const ai = new CapturingAI();
    await designCommand(
      { specHtml: SPEC, existingDesign: designTouching('src/pay/Charge.java') },
      { cwd, fs: nodeFs, ai },
    );
    expect(ai.prompts[0]).toMatch(/GOVERNING_DECISIONS/);
    expect(ai.prompts[0]).toMatch(/002-pay\/D-001/);
  });

  it('omits the block when the surface is ungoverned', async () => {
    const cwd = projectWithGoverningDecision();
    const ai = new CapturingAI();
    await designCommand(
      { specHtml: SPEC, existingDesign: designTouching('src/unrelated/Thing.java') },
      { cwd, fs: nodeFs, ai },
    );
    expect(ai.prompts[0]).not.toMatch(/GOVERNING_DECISIONS/);
  });
});
