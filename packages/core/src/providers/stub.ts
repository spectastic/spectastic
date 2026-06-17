/**
 * Stub `AIProvider` for CI integration tests. Reads a JSON script of
 * canned responses; consumes them sequentially per method.
 *
 * Per feedback memory `feedback-ai-in-ci-uses-stubs`: spectastic CI MUST
 * use a stub provider for determinism; real LLMs (Claude / Ollama) belong
 * in a separate `pnpm test:smoke` tier that's local-only.
 *
 * Activation in the CLI: set `SPECTASTIC_AI_STUB=path/to/script.json`.
 * The CLI's `createAIProvider()` factory picks Stub over Claude when set.
 *
 * Script shape:
 *
 *   {
 *     "chat":     [ "first response", "second response", ... ],
 *     "ask":      [ { "Header": "Selected Label" }, ... ],
 *     "subagent": [ { "output": "..." }, ... ]
 *   }
 *
 * Each method consumes its array sequentially. Overflow throws a
 * descriptive error so a test-fixture gap surfaces loudly instead of
 * masquerading as an LLM-side bug.
 */

import { readFileSync } from 'node:fs';
import type {
  AIProvider,
  ChatOpts,
  Question,
  SubagentOpts,
  SubagentResult,
} from '../types.js';

export class StubAIProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StubAIProviderError';
  }
}

export interface StubScript {
  chat?: string[];
  ask?: Record<string, string>[];
  subagent?: { output: string }[];
}

export class StubAIProvider implements AIProvider {
  private chatIdx = 0;
  private askIdx = 0;
  private subagentIdx = 0;
  private readonly script: Required<StubScript>;

  /**
   * Construct from a filesystem path to a JSON script, or from an inline
   * StubScript object (for unit tests that don't want to touch disk).
   */
  constructor(scriptPathOrInline: string | StubScript) {
    let parsed: unknown;
    if (typeof scriptPathOrInline === 'string') {
      let raw: string;
      try {
        raw = readFileSync(scriptPathOrInline, 'utf8');
      } catch (err) {
        throw new StubAIProviderError(
          `StubAIProvider: failed to read script at ${scriptPathOrInline} — ${(err as Error).message}`,
        );
      }
      try {
        parsed = JSON.parse(raw) as unknown;
      } catch (err) {
        throw new StubAIProviderError(
          `StubAIProvider: script at ${scriptPathOrInline} is not valid JSON — ${(err as Error).message}`,
        );
      }
    } else {
      parsed = scriptPathOrInline;
    }
    // Load-time validation per FR-005 of specs/015-ai-stub-injection/spec.html:
    // surface fixture shape mistakes loudly, before the test runs.
    validateStubScript(parsed);
    this.script = {
      chat: parsed.chat ?? [],
      ask: parsed.ask ?? [],
      subagent: parsed.subagent ?? [],
    };
  }

  async chat(_prompt: string, _opts?: ChatOpts): Promise<string> {
    if (this.chatIdx >= this.script.chat.length) {
      throw new StubAIProviderError(
        `StubAIProvider: chat() invoked ${this.chatIdx + 1} times; script only defines ${this.script.chat.length} response(s). Extend the script's "chat" array.`,
      );
    }
    const response = this.script.chat[this.chatIdx];
    this.chatIdx++;
    return response as string;
  }

  async ask<T extends Record<string, string>>(
    _questions: ReadonlyArray<Question>,
  ): Promise<T> {
    if (this.askIdx >= this.script.ask.length) {
      throw new StubAIProviderError(
        `StubAIProvider: ask() invoked ${this.askIdx + 1} times; script only defines ${this.script.ask.length} response(s). Extend the script's "ask" array.`,
      );
    }
    const response = this.script.ask[this.askIdx];
    this.askIdx++;
    return response as T;
  }

  async subagent(_prompt: string, _opts?: SubagentOpts): Promise<SubagentResult> {
    if (this.subagentIdx >= this.script.subagent.length) {
      throw new StubAIProviderError(
        `StubAIProvider: subagent() invoked ${this.subagentIdx + 1} times; script only defines ${this.script.subagent.length} response(s). Extend the script's "subagent" array.`,
      );
    }
    const response = this.script.subagent[this.subagentIdx];
    this.subagentIdx++;
    return response as SubagentResult;
  }
}

/**
 * Hand-rolled recursive validator per FR-004 + FR-005 + D-001 of
 * specs/015-ai-stub-injection/. Walks the parsed object; throws on first
 * shape mismatch with the offending JSON path included so the test author
 * can locate the fixture error directly.
 *
 * Rejected alternative: Zod. The schema is three top-level keys with simple
 * shapes; Zod's ~70 KB doesn't earn its keep for a surface this narrow.
 * Revisit if the schema grows beyond ~5 keys with branching shapes.
 */
function validateStubScript(parsed: unknown): asserts parsed is StubScript {
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new StubAIProviderError(
      `StubAIProvider: script root must be an object (got ${describeType(parsed)})`,
    );
  }
  const obj = parsed as Record<string, unknown>;

  if (obj['chat'] !== undefined) {
    const chat = obj['chat'];
    if (!Array.isArray(chat)) {
      throw new StubAIProviderError(
        `StubAIProvider: script chat must be an array (got ${describeType(chat)})`,
      );
    }
    chat.forEach((item, i) => {
      if (typeof item !== 'string') {
        throw new StubAIProviderError(
          `StubAIProvider: script chat[${i}] must be a string (got ${describeType(item)})`,
        );
      }
    });
  }

  if (obj['ask'] !== undefined) {
    const ask = obj['ask'];
    if (!Array.isArray(ask)) {
      throw new StubAIProviderError(
        `StubAIProvider: script ask must be an array (got ${describeType(ask)})`,
      );
    }
    ask.forEach((item, i) => {
      if (item === null || typeof item !== 'object' || Array.isArray(item)) {
        throw new StubAIProviderError(
          `StubAIProvider: script ask[${i}] must be an object (got ${describeType(item)})`,
        );
      }
      for (const [k, v] of Object.entries(item as Record<string, unknown>)) {
        if (typeof v !== 'string') {
          throw new StubAIProviderError(
            `StubAIProvider: script ask[${i}].${k} must be a string (got ${describeType(v)})`,
          );
        }
      }
    });
  }

  if (obj['subagent'] !== undefined) {
    const subagent = obj['subagent'];
    if (!Array.isArray(subagent)) {
      throw new StubAIProviderError(
        `StubAIProvider: script subagent must be an array (got ${describeType(subagent)})`,
      );
    }
    subagent.forEach((item, i) => {
      if (item === null || typeof item !== 'object' || Array.isArray(item)) {
        throw new StubAIProviderError(
          `StubAIProvider: script subagent[${i}] must be an object (got ${describeType(item)})`,
        );
      }
      const subItem = item as Record<string, unknown>;
      if (typeof subItem['output'] !== 'string') {
        throw new StubAIProviderError(
          `StubAIProvider: script subagent[${i}].output must be a string (got ${describeType(subItem['output'])})`,
        );
      }
    });
  }
}

function describeType(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}
