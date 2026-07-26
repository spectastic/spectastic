/**
 * T-301 (spec 019, US3 · NFR-003) — createAIProvider's precedence rung.
 *
 * D-006: SPECTASTIC_AI_STUB (CI) → an explicit ANTHROPIC_API_KEY (ClaudeProvider)
 * → the `claude` binary detected on PATH (the in-host ClaudeCliProvider) → an
 * actionable error naming the options, never a raw provider stack trace.
 * "Detection is host-pluggable, not hard-wired" — tests inject `detectClaudeCli`
 * rather than depending on whatever happens to be on the test-runner's PATH
 * (NFR-002's CI-determinism discipline applies to this unit test too).
 *
 * **Scoped to `verb: 'course'` only.** Every other AI-coupled verb's own
 * command doc states the standing contract: "The CLI requires
 * ANTHROPIC_API_KEY... the slash-command path uses the in-host Claude
 * session and needs no key" — course is the one documented exception (its
 * slash command delegates verification to this CLI; NFR-003 is written as
 * "the course verb's AI-coupled verification", not every verb's). A first
 * pass wired the rung unconditionally and broke six other verbs' CLI
 * integration tests on any host with `claude` on PATH — the
 * "verb unaffected" test below is the regression guard for that mistake.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAIProvider } from '../src/ai-factory.js';
import { ClaudeProviderError } from '@spectastic/core/providers/claude';

describe('createAIProvider — course-scoped precedence rung (spec 019 NFR-003, D-006)', () => {
  let dir: string;
  const saved = {
    stub: process.env['SPECTASTIC_AI_STUB'],
    key: process.env['ANTHROPIC_API_KEY'],
  };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'spectastic-aip-'));
    delete process.env['SPECTASTIC_AI_STUB'];
    delete process.env['ANTHROPIC_API_KEY'];
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    for (const [k, v] of Object.entries({
      SPECTASTIC_AI_STUB: saved.stub,
      ANTHROPIC_API_KEY: saved.key,
    })) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it('rung 1 — SPECTASTIC_AI_STUB wins even when a key and claude-on-PATH are both present', async () => {
    const scriptPath = join(dir, 'script.json');
    writeFileSync(scriptPath, JSON.stringify({ subagent: [{ output: 'stubbed' }] }));
    process.env['SPECTASTIC_AI_STUB'] = scriptPath;
    process.env['ANTHROPIC_API_KEY'] = 'sk-should-be-ignored';

    const ai = await createAIProvider({ verb: 'course', cwd: dir, detectClaudeCli: () => true });
    expect(ai.model).toBe('stub-model');
  });

  it('rung 2 — an explicit ANTHROPIC_API_KEY selects ClaudeProvider even when claude is on PATH', async () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-test-dummy';

    const ai = await createAIProvider({ verb: 'course', cwd: dir, detectClaudeCli: () => true });
    expect(ai.constructor.name).toBe('ClaudeProvider');
  });

  it('rung 3 — no stub, no key, claude detected on PATH, verb=course → the keyless ClaudeCliProvider', async () => {
    const ai = await createAIProvider({ verb: 'course', cwd: dir, detectClaudeCli: () => true });
    expect(ai.constructor.name).toBe('ClaudeCliProvider');
  });

  it('rung 4 — verb=course, none available → an actionable error naming every option, never a raw provider stack trace', async () => {
    await expect(
      createAIProvider({ verb: 'course', cwd: dir, detectClaudeCli: () => false }),
    ).rejects.toThrow(/ANTHROPIC_API_KEY/);
    await expect(
      createAIProvider({ verb: 'course', cwd: dir, detectClaudeCli: () => false }),
    ).rejects.toThrow(/claude/i);
    await expect(
      createAIProvider({ verb: 'course', cwd: dir, detectClaudeCli: () => false }),
    ).rejects.toThrow(/SPECTASTIC_AI_STUB/);

    // Never the raw ClaudeProvider constructor error ("ANTHROPIC_API_KEY is not
    // set...") — the bug this NFR fixes. The message must be actionable *before*
    // any provider is constructed with a missing key.
    let caught: unknown;
    try {
      await createAIProvider({ verb: 'course', cwd: dir, detectClaudeCli: () => false });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeDefined();
    expect(caught).not.toBeInstanceOf(ClaudeProviderError);
  });

  it('detection is host-pluggable for course — a default detector runs when no override is passed', async () => {
    // Outcome depends on the real PATH (claude present or not), so this only
    // asserts the call completes through *some* default detector — either an
    // AIProvider or a clean rung-4 rejection — never a synchronous crash from
    // a missing default (e.g. `opts.detectClaudeCli()` on undefined).
    try {
      const ai = await createAIProvider({ verb: 'course', cwd: dir });
      expect(ai).toBeDefined();
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect(err).not.toBeInstanceOf(TypeError);
    }
  });

  it('regression guard — a non-course verb is unaffected: no key still throws the pre-019 ClaudeProviderError, even with claude on PATH', async () => {
    // This is the exact mistake a first implementation made: wiring the rung
    // unconditionally silently changed every other AI-coupled verb's
    // documented "CLI requires ANTHROPIC_API_KEY" contract on any host with
    // `claude` on PATH, breaking six verbs' CLI integration tests. Pin it so
    // it can't regress silently again.
    await expect(
      createAIProvider({ verb: 'triage', cwd: dir, detectClaudeCli: () => true }),
    ).rejects.toBeInstanceOf(ClaudeProviderError);
    await expect(
      createAIProvider({ verb: 'triage', cwd: dir, detectClaudeCli: () => true }),
    ).rejects.toThrow(/ANTHROPIC_API_KEY is not set/);
  });
});
