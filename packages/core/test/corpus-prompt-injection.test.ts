import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AIProvider, ChatOpts, FileSystem, Question, SubagentOpts, SubagentResult } from '@spectastic/core';
import { graduateExtract } from '@spectastic/core/commands/graduate';
import { planCommand } from '@spectastic/core/commands/plan';
import { proposeCommand } from '@spectastic/core/commands/propose';
import { specCommand } from '@spectastic/core/commands/spec';
import { tasksCommand } from '@spectastic/core/commands/tasks';
import { buildCorpusPromptBlock, loadCorpus } from '@spectastic/corpus';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * 054-corpus-in-prompt T-101/T-300: integration tests for the five-verb
 * corpus join (plan D-001/D-005). A stub AIProvider records every prompt it
 * receives; assertions check whether the corpus block (a known KB id +
 * the grounding-directive marker) appears in it.
 *
 * T-101 (US1): with a real `knowledge/` corpus on disk at ctx.cwd, every one
 * of the five AI-coupled verbs' prompt(s) contains the block.
 *
 * T-300 (US3): with no `knowledge/` directory at ctx.cwd, none of the five
 * verbs' prompts contain any corpus content — byte-identical to the
 * pre-054 behaviour (SC-002).
 */

class CapturingAI implements AIProvider {
  public prompts: string[] = [];
  async chat(prompt: string, _opts?: ChatOpts): Promise<string> {
    this.prompts.push(prompt);
    return '{}';
  }
  async ask<T extends Record<string, string>>(_q: ReadonlyArray<Question>): Promise<T> {
    throw new Error('CapturingAI.ask: not used');
  }
  async subagent(_p: string, _o?: SubagentOpts): Promise<SubagentResult> {
    throw new Error('CapturingAI.subagent: not used');
  }
}

function stubFs(files: Record<string, string>): FileSystem {
  const map = new Map(Object.entries(files));
  return {
    async readFile(path) {
      const content = map.get(path);
      if (content === undefined) throw new Error(`ENOENT: ${path}`);
      return content;
    },
    async writeFile() {
      throw new Error('not used');
    },
    async readdir() {
      return Array.from(map.keys());
    },
    async stat(path) {
      return { isFile: map.has(path), isDirectory: false };
    },
  };
}

const CLEAN_SPEC = `<!doctype html><html><body>
<p class="small-caps">Specification · 099-corpus-inject</p>
<spec-requirement id="FR-001" priority="must"><p>Do the thing.</p></spec-requirement>
</body></html>`;

const PLAN = `<!doctype html><html><body>
<spec-decision id="D-001"><dl><dt>Decision</dt><dd>Use a widget.</dd></dl></spec-decision>
</body></html>`;

const LEDGER = `<!doctype html><html><body>
<spec-runblock>
  <spec-run>pnpm dev</spec-run>
  <spec-toggle>none</spec-toggle>
  <spec-tests></spec-tests>
  <spec-demo>open and click</spec-demo>
</spec-runblock>
</body></html>`;

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** A temp project root with a real `knowledge/<pack>/index.md` on disk. */
function corpusDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'spectastic-corpus-'));
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
  const dir = mkdtempSync(join(tmpdir(), 'spectastic-nocorpus-'));
  dirs.push(dir);
  return dir;
}

async function runAllFive(cwd: string): Promise<{
  ai: CapturingAI;
  tasksResult: Awaited<ReturnType<typeof tasksCommand>>;
}> {
  const ai = new CapturingAI();

  await planCommand({ specId: '099-corpus-inject', specHtml: CLEAN_SPEC }, { cwd, ai });
  await specCommand({ description: 'a corpus-injection test feature' }, { cwd, ai });
  await proposeCommand(
    {
      specId: '099-corpus-inject',
      description: 'add a thing',
      specHtml: CLEAN_SPEC,
      adversarial: false,
    },
    { cwd, ai },
  );
  const fs = stubFs({ '/spec.html': CLEAN_SPEC, '/plan.html': PLAN });
  const tasksResult = await tasksCommand({ specPath: '/spec.html', planPath: '/plan.html' }, { cwd, ai, fs });
  await graduateExtract({ specId: '099-corpus-inject', classification: 'spike', ledger: LEDGER }, { cwd, ai });

  return { ai, tasksResult };
}

describe('corpus prompt injection — present (054, T-101)', () => {
  it("every one of the five AI-coupled verbs' prompt(s) contains the corpus block", async () => {
    const cwd = corpusDir();
    const { ai } = await runAllFive(cwd);

    expect(ai.prompts.length).toBeGreaterThan(0);
    for (const prompt of ai.prompts) {
      expect(prompt).toContain('KB-901');
      expect(prompt).toMatch(/KB-NNN@edition|knowledge corpus/i);
    }
  });
});

describe('corpus prompt injection — absent (054, T-300)', () => {
  it("none of the five verbs' prompts contain any corpus content with no knowledge/ directory", async () => {
    const cwd = noCorpusDir();
    const { ai } = await runAllFive(cwd);

    expect(ai.prompts.length).toBeGreaterThan(0);
    for (const prompt of ai.prompts) {
      expect(prompt).not.toContain('KNOWLEDGE_CORPUS_INDEX');
      expect(prompt).not.toMatch(/knowledge corpus is available/i);
    }
  });
});

describe('corpus prompt injection — byte-identical after extraction (064, T-111, SC-004)', () => {
  it('the injected block for a fixed fixture corpus is byte-identical to its golden baseline', () => {
    // Exercises the real loadCorpus() + buildCorpusPromptBlock() pipeline, both
    // now imported from @spectastic/corpus, against the same on-disk fixture
    // shape corpusDir() builds above. The snapshot is the practical form of
    // "byte-identical before and after the extraction" once the pre-extraction
    // code path no longer exists to diff against directly: any future change to
    // the moved prompt/index/fence logic that alters a single byte of output
    // fails this test loudly.
    const cwd = corpusDir();
    const block = buildCorpusPromptBlock(loadCorpus(cwd));
    expect(block).toMatchSnapshot();
  });
});
