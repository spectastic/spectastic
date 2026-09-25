import { mkdtempSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  FETCH_TIMEOUT_MS,
  MAX_RESPONSE_BYTES,
  decisionIndexFetcher,
  fetchDecisionIndexOverHttp,
} from '@spectastic/core/providers/decision-index-fetcher';

/**
 * The decision-index fetcher adapters (spec 122-decision-index-federation,
 * D-002, T-201). The generic fetch mechanics — timeout, the 1 MiB response
 * cap, same-host-only manual redirects, a bearer token that never leaks —
 * are scheme-agnostic (the `fetch` API doesn't care whether the URL is
 * `http:` or `https:`), so they're exercised here against a real local
 * `http.createServer` rather than standing up TLS. The PUBLIC dispatcher
 * (`decisionIndexFetcher`) is what refuses a plain `http:` source for real
 * use — tested separately below, never issuing a network call for it.
 */

let server: Server;
let baseUrl: string;
let lastRequestHeaders: Record<string, string | string[] | undefined> = {};

beforeEach(async () => {
  lastRequestHeaders = {};
  server = createServer((req, res) => {
    lastRequestHeaders = req.headers;
    if (req.url === '/ok') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"hello":"world"}');
      return;
    }
    if (req.url === '/huge') {
      res.writeHead(200, { 'content-type': 'application/json' });
      // One byte over the cap.
      res.end('a'.repeat(MAX_RESPONSE_BYTES + 1));
      return;
    }
    if (req.url === '/redirect-same-host') {
      res.writeHead(302, { location: '/ok' });
      res.end();
      return;
    }
    if (req.url === '/redirect-cross-host') {
      res.writeHead(302, { location: 'https://example.invalid/elsewhere' });
      res.end();
      return;
    }
    if (req.url === '/error') {
      res.writeHead(500, { 'content-type': 'text/plain' });
      res.end('boom');
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise<void>((resolveFn) => server.listen(0, '127.0.0.1', resolveFn));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('expected a bound TCP address');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  delete process.env.SPECTASTIC_SOURCE_TOKEN;
  await new Promise<void>((resolveFn, reject) => server.close((err) => (err ? reject(err) : resolveFn())));
});

describe('policy constants (the 30 s timeout, the 1 MiB cap)', () => {
  it('FETCH_TIMEOUT_MS is 30 seconds', () => {
    expect(FETCH_TIMEOUT_MS).toBe(30_000);
  });
  it('MAX_RESPONSE_BYTES is 1 MiB', () => {
    expect(MAX_RESPONSE_BYTES).toBe(1024 * 1024);
  });
});

describe('fetchDecisionIndexOverHttp — the generic fetch mechanics', () => {
  it('fetches a normal response', async () => {
    const r = await fetchDecisionIndexOverHttp(`${baseUrl}/ok`);
    expect(r).toEqual({ ok: true, text: '{"hello":"world"}' });
  });

  it('refuses a response over the 1 MiB cap, never silently truncating', async () => {
    const r = await fetchDecisionIndexOverHttp(`${baseUrl}/huge`);
    expect(r.ok).toBe(false);
    expect((r as { reason: string }).reason).toMatch(/cap|exceed|1048576|MiB/i);
  });

  it('follows a same-host redirect', async () => {
    const r = await fetchDecisionIndexOverHttp(`${baseUrl}/redirect-same-host`);
    expect(r).toEqual({ ok: true, text: '{"hello":"world"}' });
  });

  it('refuses a cross-host redirect without following it', async () => {
    const r = await fetchDecisionIndexOverHttp(`${baseUrl}/redirect-cross-host`);
    expect(r.ok).toBe(false);
    expect((r as { reason: string }).reason).toMatch(/cross-host|host/i);
  });

  it('reports a non-2xx status as a refusal', async () => {
    const r = await fetchDecisionIndexOverHttp(`${baseUrl}/error`);
    expect(r.ok).toBe(false);
  });

  it('sends a bearer token from SPECTASTIC_SOURCE_TOKEN when set', async () => {
    process.env.SPECTASTIC_SOURCE_TOKEN = 'super-secret-token';
    await fetchDecisionIndexOverHttp(`${baseUrl}/ok`);
    expect(lastRequestHeaders.authorization).toBe('Bearer super-secret-token');
  });

  it('sends no Authorization header when the token is unset', async () => {
    await fetchDecisionIndexOverHttp(`${baseUrl}/ok`);
    expect(lastRequestHeaders.authorization).toBeUndefined();
  });

  it('never leaks the bearer token into a refusal reason, even on failure', async () => {
    process.env.SPECTASTIC_SOURCE_TOKEN = 'super-secret-token';
    const r = await fetchDecisionIndexOverHttp(`${baseUrl}/error`);
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).not.toContain('super-secret-token');
  });
});

describe('decisionIndexFetcher — public dispatch by scheme', () => {
  it('dispatches https:// (here, over the local server\'s http:// URL is out of scope) — refuses plain http:// without a network call', async () => {
    const fetcher = decisionIndexFetcher('/does-not-matter');
    const r = await fetcher.fetch('http://example.invalid/never-reached');
    expect(r.ok).toBe(false);
    expect((r as { reason: string }).reason).toMatch(/http/i);
  });

  it('dispatches a repo-relative path to a real file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'decision-fetcher-'));
    writeFileSync(join(dir, 'decisions.json'), '{"ok":true}', 'utf8');
    const fetcher = decisionIndexFetcher(dir);
    const r = await fetcher.fetch('./decisions.json');
    expect(r).toEqual({ ok: true, text: '{"ok":true}' });
  });

  it('reports a missing repo-relative path as a refusal, not a throw', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'decision-fetcher-'));
    const fetcher = decisionIndexFetcher(dir);
    const r = await fetcher.fetch('./nope.json');
    expect(r.ok).toBe(false);
  });

  describe('the path adapter\'s containment check', () => {
    it('refuses an absolute path outright — "repo-relative" is the whole contract', async () => {
      const fetcher = decisionIndexFetcher('/does-not-matter');
      const r = await fetcher.fetch('/etc/passwd');
      expect(r.ok).toBe(false);
      expect((r as { reason: string }).reason).toMatch(/absolute|repo-relative/i);
    });

    it('a sibling-escaping relative path (../../owner-placeholder.json) is allowed — sources legitimately live outside the consumer', async () => {
      const root = mkdtempSync(join(tmpdir(), 'decision-fetcher-root-'));
      const consumerDir = join(root, 'consumer', 'nested');
      writeFileSync(join(root, 'owner-placeholder.json'), '{"marker":true}', 'utf8');
      // consumerDir need not exist on disk — resolve() is pure string
      // manipulation; only the FINAL read target needs to be real.
      const fetcher = decisionIndexFetcher(consumerDir);
      const r = await fetcher.fetch('../../owner-placeholder.json');
      expect(r).toEqual({ ok: true, text: '{"marker":true}' });
    });
  });
});
