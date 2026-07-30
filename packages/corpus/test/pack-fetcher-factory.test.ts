/**
 * 2026-07-26 061-corpus-ingester T-012 (Foundational, red-first):
 * createPackFetcher's precedence — mirrors createAIProvider's rung shape
 * (spec 019 NFR-003 / D-006): an env-selected stub wins for CI determinism
 * (feedback: AI in CI uses stubs), a --from path bypasses the fetcher
 * entirely for a local checkout, and the real fetcher is the fallback.
 * `--from` and env are tested for precedence against each other explicitly,
 * since a caller could plausibly set both by accident.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPackFetcher } from '../src/pack-fetcher-factory.js';

describe('createPackFetcher (061 T-012, mirrors createAIProvider precedence)', () => {
  let dir: string;
  const saved = { stub: process.env.SPECTASTIC_PACK_STUB };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'spectastic-pack-fetcher-'));
    delete process.env.SPECTASTIC_PACK_STUB;
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    if (saved.stub === undefined) delete process.env.SPECTASTIC_PACK_STUB;
    else process.env.SPECTASTIC_PACK_STUB = saved.stub;
  });

  it('rung 1 — SPECTASTIC_PACK_STUB selects the stub fetcher, resolving a scripted coordinate', async () => {
    const scriptPath = join(dir, 'script.json');
    writeFileSync(scriptPath, JSON.stringify({ 'x@y': '/fixtures/x' }));
    process.env.SPECTASTIC_PACK_STUB = scriptPath;

    const fetcher = createPackFetcher();
    await expect(fetcher.fetch('x@y')).resolves.toBe('/fixtures/x');
  });

  it('rung 1 wins over --from — the stub is selected even when --from is also passed', async () => {
    const scriptPath = join(dir, 'script.json');
    writeFileSync(scriptPath, JSON.stringify({ 'x@y': '/fixtures/x' }));
    process.env.SPECTASTIC_PACK_STUB = scriptPath;

    const fetcher = createPackFetcher({ from: '/some/local/checkout' });
    await expect(fetcher.fetch('x@y')).resolves.toBe('/fixtures/x');
  });

  it('rung 2 — --from <path> resolves any coordinate to that local path, no fetch involved', async () => {
    const fetcher = createPackFetcher({ from: '/some/local/checkout' });
    await expect(fetcher.fetch('anything@anywhere')).resolves.toBe('/some/local/checkout');
  });

  it('rung 3 — no stub, no --from, resolves to a real fetcher instance', () => {
    const fetcher = createPackFetcher();
    expect(fetcher).toBeDefined();
    expect(typeof fetcher.fetch).toBe('function');
  });
});
