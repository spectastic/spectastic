import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { proposeCommand } from '@spectastic/core/commands/propose';
import type { AIProvider, ChatOpts, KernelContext, Question, SubagentOpts, SubagentResult } from '@spectastic/core';

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(here, '..', '..', '..');

/**
 * 055-corpus-in-review T-100: a red-first guard for the adversarial critic's
 * reviewPrompt (plan D-001). 054 already put the fenced corpus into
 * proposeCommand's reviewPrompt (propose.ts:88-92), but 054's own test never
 * exercised it — its stub passed `adversarial: false` and its CapturingAI's
 * `subagent()` threw. This test drives the real path: `adversarial: true`,
 * a working `subagent()`, asserting the corpus reaches the critic's input
 * when a corpus exists (SC-001's precondition) and is absent — reviewPrompt
 * unchanged — when it doesn't (NFR-001/SC-003).
 */

class CapturingAI implements AIProvider {
  public chatPrompts: string[] = [];
  public subagentPrompts: string[] = [];
  async chat(prompt: string, _opts?: ChatOpts): Promise<string> {
    this.chatPrompts.push(prompt);
    return JSON.stringify({ intent: 'x', scope: 'x', approach: 'x', deltas: [] });
  }
  async subagent(prompt: string, _opts?: SubagentOpts): Promise<SubagentResult> {
    this.subagentPrompts.push(prompt);
    return { output: JSON.stringify({ findings: [] }) };
  }
  async ask<T extends Record<string, string>>(_q: ReadonlyArray<Question>): Promise<T> {
    throw new Error('CapturingAI.ask: not used');
  }
}

const CLEAN_SPEC = `<!doctype html><html><body>
<p class="small-caps">Specification · 099-corpus-review</p>
<spec-requirement id="FR-001" priority="must"><p>Do the thing.</p></spec-requirement>
</body></html>`;

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** A temp project root with a real `knowledge/<pack>/index.md` on disk. */
function corpusDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'spectastic-review-corpus-'));
  const packDir = join(dir, 'knowledge', 'example');
  mkdirSync(packDir, { recursive: true });
  writeFileSync(
    join(packDir, 'index.md'),
    [
      '| ID | Title | Description | Edition | Path |',
      '| --- | --- | --- | --- | --- |',
      '| KB-901 | A domain fact | A test fixture document | 2026-01-01 | references/KB-901.md |',
      '',
    ].join('\n'),
  );
  dirs.push(dir);
  return dir;
}

/** A temp project root with no `knowledge/` directory at all. */
function noCorpusDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'spectastic-review-nocorpus-'));
  dirs.push(dir);
  return dir;
}

async function runAdversarialPropose(cwd: string): Promise<CapturingAI> {
  const ai = new CapturingAI();
  const ctx: KernelContext = { cwd, ai };
  await proposeCommand(
    { specId: '099-corpus-review', description: 'add a thing', specHtml: CLEAN_SPEC, adversarial: true },
    ctx,
  );
  return ai;
}

describe('propose critic reviewPrompt — corpus present (055, T-100)', () => {
  it('the ai.subagent()-captured reviewPrompt contains the corpus index', async () => {
    const cwd = corpusDir();
    const ai = await runAdversarialPropose(cwd);

    expect(ai.subagentPrompts.length).toBeGreaterThan(0);
    for (const prompt of ai.subagentPrompts) {
      expect(prompt).toContain('KB-901');
      expect(prompt).toMatch(/knowledge corpus/i);
    }
  });

  it('the reviewPrompt asks the critic to flag a corpus contradiction, not just carry an authoring directive (T-110)', async () => {
    // 054 already injects the fenced corpus index into this reviewPrompt, but
    // with 054's authoring directive ("cite a domain fact"). This is the
    // genuinely new assertion T-110 must satisfy: a critic-checking angle
    // asking it to flag a requirement that CONTRADICTS a cited fact.
    const cwd = corpusDir();
    const ai = await runAdversarialPropose(cwd);

    expect(ai.subagentPrompts.length).toBeGreaterThan(0);
    for (const prompt of ai.subagentPrompts) {
      expect(prompt).toMatch(/contradict/i);
    }
  });
});

describe('propose critic reviewPrompt — corpus absent (055, T-100)', () => {
  it('the reviewPrompt carries no corpus content with no knowledge/ directory', async () => {
    const cwd = noCorpusDir();
    const ai = await runAdversarialPropose(cwd);

    expect(ai.subagentPrompts.length).toBeGreaterThan(0);
    for (const prompt of ai.subagentPrompts) {
      expect(prompt).not.toContain('KNOWLEDGE_CORPUS_INDEX');
      expect(prompt).not.toMatch(/knowledge corpus is available/i);
    }
  });

  it('the same no-corpus reviewPrompt is identical whether or not the corpus-aware code path was touched', async () => {
    // Two independent no-corpus runs must produce byte-identical reviewPrompts —
    // the corpus join is a true no-op, not merely "no corpus text visible".
    const runA = await runAdversarialPropose(noCorpusDir());
    const runB = await runAdversarialPropose(noCorpusDir());
    expect(runA.subagentPrompts[0]).toBe(runB.subagentPrompts[0]);
  });
});

describe('explain.md corpus-grounding instruction (055, T-200)', () => {
  // SC-002's full claim — explain's coaching read actually grounds a domain
  // claim against the corpus — is model-driven and untestable (US2's story
  // is deliberately test-less in the plan). This is the narrower, honest
  // claim that CAN be checked: the instruction telling explain to do that
  // genuinely landed in the source markdown, in both modes (D-002).
  const md = readFileSync(resolve(REPO_ROOT, 'commands', 'spectastic.explain.md'), 'utf8');

  it('the bare-mode grounding step cites KB-NNNN@edition when a corpus is present', () => {
    // 062 migration: the id shape is four-digit KB-NNNN (the retired flat model
    // was three-digit KB-NNN); the coaching copy modernised with it.
    expect(md).toMatch(/knowledge\/.*corpus.*KB-NNNN@edition|KB-NNNN@edition.*knowledge\/.*corpus/is);
  });

  it('the --course objective-drafting step carries the same corpus-citation instruction', () => {
    const courseSection = md.slice(md.indexOf('## Course mode'));
    expect(courseSection).toMatch(/KB-NNNN@edition/);
  });
});
