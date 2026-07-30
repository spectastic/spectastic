import type { AIProvider, ChatOpts, Question, SubagentOpts, SubagentResult } from '@spectastic/core';

/**
 * A concurrency-safe stub AIProvider for spec 032-triage-fanout (plan D-004).
 *
 * The shipped stub (providers/stub.ts) consumes responses sequentially by index
 * and has no delay hook — under a concurrent fan-out the response↔item mapping is
 * nondeterministic and SC-001 timing is unmeasurable. This stub instead:
 *   - keys each response by a substring that must appear in the item's prompt, so
 *     the mapping is deterministic regardless of completion order;
 *   - supports an optional per-item delay, so SC-001's slowest-item bound is
 *     measurable and the fan-out's concurrency is observable;
 *   - records peak concurrency + a call-order log, so tests can assert the cap
 *     (FR-007) and that the gate runs after the pass (FR-005).
 */

export interface KeyedResponse {
  /** Substring that must appear in the prompt for this response to match the item. */
  match: string;
  /** The JSON card body returned by chat/subagent (ignored when `throws`). */
  json?: Record<string, unknown>;
  /** Throw instead of returning — simulates a provider/parse failure (SC-003). */
  throws?: boolean;
  /** Optional per-call delay in ms — drives the SC-001 timing assertions. */
  delayMs?: number;
}

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export class KeyedStubAI implements AIProvider {
  readonly model = 'stub-keyed';
  public chatCalls = 0;
  public subagentCalls = 0;
  public askCalls: Question[][] = [];
  /** Ordered log of method invocations: 'chat' | 'subagent' | 'ask'. */
  public readonly callLog: Array<'chat' | 'subagent' | 'ask'> = [];

  private inFlight = 0;
  private peakConcurrency = 0;

  constructor(
    private readonly responses: KeyedResponse[],
    private readonly askResponses: Record<string, string>[] = [],
  ) {}

  /** Highest number of classification calls in flight at once (FR-007 / NFR-001). */
  get observedMaxConcurrency(): number {
    return this.peakConcurrency;
  }

  private async classify(prompt: string): Promise<string> {
    this.inFlight += 1;
    this.peakConcurrency = Math.max(this.peakConcurrency, this.inFlight);
    try {
      const r = this.responses.find((x) => prompt.includes(x.match));
      if (!r) throw new Error(`KeyedStubAI: no response matches prompt: ${prompt.slice(0, 120)}`);
      if (r.delayMs) await delay(r.delayMs);
      if (r.throws) throw new Error(`KeyedStubAI: simulated failure for "${r.match}"`);
      return JSON.stringify(r.json ?? {});
    } finally {
      this.inFlight -= 1;
    }
  }

  async chat(prompt: string, _opts?: ChatOpts): Promise<string> {
    this.chatCalls += 1;
    this.callLog.push('chat');
    return this.classify(prompt);
  }

  async subagent(prompt: string, _opts?: SubagentOpts): Promise<SubagentResult> {
    this.subagentCalls += 1;
    this.callLog.push('subagent');
    return { output: await this.classify(prompt) };
  }

  async ask<TResult extends Record<string, string>>(questions: ReadonlyArray<Question>): Promise<TResult> {
    this.callLog.push('ask');
    this.askCalls.push([...questions]);
    const response = this.askResponses[this.askCalls.length - 1];
    if (!response) throw new Error('KeyedStubAI: no ask response staged');
    return response as TResult;
  }
}
