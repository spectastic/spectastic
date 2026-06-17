/**
 * Claude implementation of AIProvider. Per D-001 / D-002 / D-005 of
 * specs/007-core-triage/plan.html.
 *
 * Lazy-loaded only — never imported from packages/core/src/index.ts.
 * The bench's `init-help-cold-start` scenario is the regression guard
 * for that discipline; if it fires, `@anthropic-ai/sdk` has crept
 * onto an init-time path through a stray top-level import.
 *
 * `ask<T>()` is implemented via structured-prompt + JSON parse + one
 * stricter-prompt retry (D-002). The Anthropic tool-use API would be
 * stricter but ties the kernel surface to specific SDK versions; the
 * chosen approach works on any SDK that ships `messages.create`.
 *
 * `subagent()` ships as a stub throwing "not implemented; lands with
 * 013-core-propose" — the forward-looking interface (006 FR-007 +
 * D-004) requires it to be declared so 013's PR is additive.
 *
 * ANTHROPIC_API_KEY redaction (D-005, NFR-002): every error from
 * SDK calls is rewrapped as ClaudeProviderError with the key value
 * scrubbed from `.message` + `.stack` substrings. Unit-tested.
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  AIProvider,
  ChatOpts,
  Question,
  SubagentOpts,
  SubagentResult,
} from '../types.js';

const DEFAULT_MODEL = 'claude-sonnet-4-6';

export class ClaudeProviderError extends Error {
  public override readonly cause?: unknown;
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = 'ClaudeProviderError';
    if (options?.cause !== undefined) this.cause = options.cause;
  }
}

export interface ClaudeProviderOptions {
  /** Override the API key; defaults to process.env.ANTHROPIC_API_KEY. */
  apiKey?: string;
  /** Override the default model. */
  model?: string;
  /** Override the SDK client (testing only). */
  client?: Anthropic;
}

export class ClaudeProvider implements AIProvider {
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly apiKey: string;

  constructor(options: ClaudeProviderOptions = {}) {
    const apiKey = options.apiKey ?? process.env['ANTHROPIC_API_KEY'];
    if (!apiKey) {
      throw new ClaudeProviderError(
        'ANTHROPIC_API_KEY is not set. Provide it via the env var or the apiKey option.',
      );
    }
    this.apiKey = apiKey;
    this.model = options.model ?? DEFAULT_MODEL;
    this.client = options.client ?? new Anthropic({ apiKey });
  }

  async chat(prompt: string, opts: ChatOpts = {}): Promise<string> {
    try {
      const response = await this.client.messages.create({
        model: opts.model ?? this.model,
        max_tokens: opts.maxTokens ?? 4096,
        temperature: opts.temperature ?? 0,
        ...(opts.system ? { system: opts.system } : {}),
        messages: [{ role: 'user', content: prompt }],
      });
      const block = response.content[0];
      if (!block || block.type !== 'text') {
        throw new ClaudeProviderError('Claude returned no text block');
      }
      return block.text;
    } catch (err) {
      throw this.wrap(err);
    }
  }

  async ask<TResult extends Record<string, string>>(
    questions: ReadonlyArray<Question>,
  ): Promise<TResult> {
    const schema = questions.map((q) => ({
      key: q.header,
      question: q.question,
      options: q.options.map((o) => o.label),
    }));

    const prompt = [
      'Answer each question below by picking exactly one option from its provided list.',
      'Return ONLY a JSON object whose keys are the `key` field of each question and whose values are the chosen option label (string).',
      '',
      'Questions:',
      JSON.stringify(schema, null, 2),
    ].join('\n');

    const system =
      'You are a deterministic answer-picker. Output is parsed by a program. Return ONLY a JSON object with the answers; no prose, no explanation, no code fences.';

    let raw = await this.chat(prompt, { temperature: 0, system });
    let parsed = tryParseAnswers(raw);
    if (!parsed) {
      // Retry once with stricter system prompt.
      raw = await this.chat(prompt, {
        temperature: 0,
        system:
          system +
          ' Your previous response was not valid JSON. Output ONLY the JSON object, starting with `{` and ending with `}`, nothing else.',
      });
      parsed = tryParseAnswers(raw);
      if (!parsed) {
        throw new ClaudeProviderError(
          'Claude did not return parseable JSON after one retry. Consider switching to the SDK tool-use API for stricter contracts.',
        );
      }
    }

    return parsed as TResult;
  }

  async subagent(prompt: string, opts: SubagentOpts = {}): Promise<SubagentResult> {
    // Per 013 D-001: separate messages.create call with a critic system prompt.
    // No streaming; deterministic temperature.
    try {
      const response = await this.client.messages.create({
        model: opts.model ?? this.model,
        max_tokens: 2048,
        temperature: 0,
        system:
          'You are a focused sub-agent invoked for a specialised task. Stay narrowly scoped to the user prompt. Output is consumed by a program; prefer JSON when the task specifies a structured shape.',
        messages: [{ role: 'user', content: prompt }],
      });
      const block = response.content[0];
      const output = block && block.type === 'text' ? block.text : '';
      return { output };
    } catch (err) {
      throw this.wrap(err);
    }
  }

  /**
   * Rewrap any error so the API key value can never appear in surfaced
   * messages / stacks / serialised forms. Defence-in-depth: even if the
   * SDK changes how it formats errors, the scrub stays effective.
   */
  private wrap(err: unknown): ClaudeProviderError {
    const original = err instanceof Error ? err : new Error(String(err));
    const scrubbedMessage = scrub(original.message, this.apiKey);
    const wrapped = new ClaudeProviderError(scrubbedMessage, { cause: err });
    if (original.stack) {
      wrapped.stack = scrub(original.stack, this.apiKey);
    }
    return wrapped;
  }
}

function scrub(text: string, key: string): string {
  if (!key) return text;
  // Replace exact key + any URL-encoded form.
  const replaced = text.split(key).join('[REDACTED]');
  return replaced.split(encodeURIComponent(key)).join('[REDACTED]');
}

function tryParseAnswers(raw: string): Record<string, string> | null {
  const trimmed = raw.trim();
  // Strip any surrounding code-fence / language tag.
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
