/**
 * Slice-shaped convenience over the canonical {@link StubAIProvider} for the
 * slicer's orchestration tests (spec 029, plan D-007). The deterministic stub
 * already scripts chat/ask/subagent sequentially; this wraps it so a test reads
 * as "this decomposition, this RICE confirmation, this critic verdict" instead
 * of hand-serialising JSON into the raw script arrays.
 *
 * Test-only — never imported by production code (it constructs no real provider).
 */

import { StubAIProvider } from '../providers/stub.js';
import type { StubScript } from '../providers/stub.js';

export interface SliceStubScript {
  /** Each entry becomes one `chat()` response, JSON-stringified — a drafted decomposition. */
  decompositions?: unknown[];
  /** Each entry becomes one `ask()` response — a RICE confirmation (e.g. `{ RICE: 'Accept' }`). */
  confirmations?: Record<string, string>[];
  /** Each entry becomes one `subagent()` response — a critic/scorer output (raw string). */
  agents?: string[];
}

/**
 * Build a {@link StubAIProvider} scripted for a slicer run. `decompositions`
 * feed `chat`, `confirmations` feed `ask`, `agents` feed `subagent` (the
 * critic and the scorer panel), each consumed in order.
 */
export function sliceStub(script: SliceStubScript = {}): StubAIProvider {
  const stub: StubScript = {
    chat: (script.decompositions ?? []).map((d) => JSON.stringify(d)),
    ask: script.confirmations ?? [],
    subagent: (script.agents ?? []).map((output) => ({ output })),
  };
  return new StubAIProvider(stub);
}
