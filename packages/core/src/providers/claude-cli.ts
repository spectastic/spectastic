/**
 * Keyless, in-host implementation of AIProvider. Per D-006 / D-007 of
 * specs/019-explain-course/plan.html (resolves triage T-004): when
 * `explain --course` runs inside an agent host that already carries model
 * access (Claude Code), the kernel's blind checks (FR-004, and 060's
 * analogy-fit check) must run without an `ANTHROPIC_API_KEY` — using that
 * host's session instead of a direct API key.
 *
 * `subagent()` shells to `claude -p <prompt> --output-format text`, one
 * fresh process per call. Blindness is structural (D-007): the process is
 * handed only the caller's prompt string — no course/draft context, no
 * `--resume`/`--continue`/session id — so it cannot leak what it never
 * receives.
 *
 * The `run` seam (constructor option) exists so tests can assert the exact
 * command line without spawning a real process; production code leaves it
 * unset and gets the default `execFile('claude', …)` runner.
 */

import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import type { AIProvider, ChatOpts, Question, SubagentOpts, SubagentResult } from '../types.js';

const execFile = promisify(execFileCb);

export class ClaudeCliProviderError extends Error {
  public override readonly cause?: unknown;
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = 'ClaudeCliProviderError';
    if (options?.cause !== undefined) this.cause = options.cause;
  }
}

export interface ClaudeCliRunResult {
  stdout: string;
}

export interface ClaudeCliProviderOptions {
  /** Override the binary name/path (defaults to `claude`, resolved via PATH). */
  bin?: string;
  /** Override the process runner (testing only). Defaults to a real `execFile`. */
  run?: (argv: ReadonlyArray<string>) => Promise<ClaudeCliRunResult>;
}

export class ClaudeCliProvider implements AIProvider {
  /** Stable id for the `Assisted-by` trailer (spec 027, D-003) — the host session's model is opaque to this provider, so it names the execution path rather than a specific model. */
  readonly model = 'claude-cli';
  private readonly bin: string;
  private readonly run: (argv: ReadonlyArray<string>) => Promise<ClaudeCliRunResult>;

  constructor(options: ClaudeCliProviderOptions = {}) {
    this.bin = options.bin ?? 'claude';
    this.run = options.run ?? ((argv) => this.defaultRun(argv));
  }

  async chat(prompt: string, _opts: ChatOpts = {}): Promise<string> {
    // The CLI's -p/--print mode has no system-prompt/temperature/max-tokens
    // flags to route ChatOpts through; documented limitation of the keyless
    // path (D-006's traded-off latency/quota consequence covers this class
    // of gap). The prompt itself carries any needed framing.
    return this.invoke(prompt);
  }

  async ask<TResult extends Record<string, string>>(questions: ReadonlyArray<Question>): Promise<TResult> {
    const schema = questions.map((q) => ({
      key: q.header,
      question: q.question,
      options: q.options.map((o) => o.label),
    }));

    const prompt = [
      'Answer each question below by picking exactly one option from its provided list.',
      'Return ONLY a JSON object whose keys are the `key` field of each question and whose values are the chosen option label (string). No prose, no code fences.',
      '',
      'Questions:',
      JSON.stringify(schema, null, 2),
    ].join('\n');

    let raw = await this.invoke(prompt);
    let parsed = tryParseAnswers(raw);
    if (!parsed) {
      raw = await this.invoke(
        `${prompt}\n\nYour previous response was not valid JSON. Output ONLY the JSON object, starting with \`{\` and ending with \`}\`, nothing else.`,
      );
      parsed = tryParseAnswers(raw);
      if (!parsed) {
        throw new ClaudeCliProviderError('claude CLI did not return parseable JSON after one retry.');
      }
    }
    return parsed as TResult;
  }

  async subagent(prompt: string, _opts: SubagentOpts = {}): Promise<SubagentResult> {
    const output = await this.invoke(prompt);
    return { output };
  }

  /** Blind by construction (D-007): the argv carries only this prompt — never a --resume/--continue/session flag, never prior output. */
  private async invoke(prompt: string): Promise<string> {
    try {
      const { stdout } = await this.run(['-p', prompt, '--output-format', 'text']);
      return stdout.trim();
    } catch (err) {
      throw new ClaudeCliProviderError(
        `claude CLI invocation failed: ${(err as Error).message}. Confirm the \`claude\` binary is on PATH and its host session has model access.`,
        { cause: err },
      );
    }
  }

  private async defaultRun(argv: ReadonlyArray<string>): Promise<ClaudeCliRunResult> {
    const { stdout } = await execFile(this.bin, [...argv], {
      maxBuffer: 10 * 1024 * 1024,
    });
    return { stdout };
  }
}

function tryParseAnswers(raw: string): Record<string, string> | null {
  const trimmed = raw.trim();
  const stripped = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    const parsed = JSON.parse(stripped) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v !== 'string') return null;
      out[k] = v;
    }
    return out;
  } catch {
    return null;
  }
}
