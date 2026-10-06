/**
 * The decision-index fetcher adapters (spec 122-decision-index-federation,
 * D-002): a repo-relative path, and `https:`. This is the one file in the
 * decisions feature that touches the network, and only the CLI ever imports
 * it — `decisions/sync.ts` takes a `DecisionIndexFetcher` as data, so the
 * guardrail no-network import scan's meaning extends to the sync path
 * without an edit.
 */

import { readFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import type { DecisionIndexFetcher, FetchResult } from '../decisions/sync.js';

export const FETCH_TIMEOUT_MS = 30_000;
export const MAX_RESPONSE_BYTES = 1024 * 1024; // 1 MiB
const MAX_REDIRECTS = 5;

/** Read a response body up to `MAX_RESPONSE_BYTES`, refusing — never silently
 *  truncating — the moment the stream exceeds the cap. */
async function readCapped(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new Error(`response exceeds the ${MAX_RESPONSE_BYTES}-byte cap`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8');
}

/** One fetch attempt: `ok` with the response, `redirect` with the next URL to
 *  try, or `refused` with a reason — a manual redirect is followed only when
 *  its target shares the current URL's host. */
type AttemptResult =
  | { kind: 'ok'; res: Response }
  | { kind: 'redirect'; next: string }
  | { kind: 'refused'; reason: string };

async function attemptOnce(url: string, token: string | undefined): Promise<AttemptResult> {
  let res: Response;
  try {
    res = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
    });
  } catch (err) {
    return { kind: 'refused', reason: `fetch failed: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (res.status >= 300 && res.status < 400) {
    const location = res.headers.get('location');
    if (!location) return { kind: 'refused', reason: `redirect with no Location header (status ${res.status})` };
    const nextUrl = new URL(location, url);
    if (nextUrl.host !== new URL(url).host) {
      return { kind: 'refused', reason: `refused a cross-host redirect to "${nextUrl.host}"` };
    }
    return { kind: 'redirect', next: nextUrl.toString() };
  }
  if (!res.ok) return { kind: 'refused', reason: `HTTP ${res.status}` };
  return { kind: 'ok', res };
}

/**
 * The generic fetch mechanics — 30 s timeout, the 1 MiB cap, a manual
 * same-host-only redirect follow, a bearer token from the environment that
 * never appears in an error — factored out because they are scheme-agnostic
 * (`fetch` doesn't care whether the URL is `http:` or `https:`), which is
 * what lets this be exercised against a plain local HTTP server in tests
 * without standing up TLS. The public dispatcher below is what actually
 * refuses a plain `http:` SOURCE for real use.
 */
export async function fetchDecisionIndexOverHttp(url: string): Promise<FetchResult> {
  const token = process.env.SPECTASTIC_SOURCE_TOKEN;
  let current = url;
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    const attempt = await attemptOnce(current, token);
    if (attempt.kind === 'refused') return { ok: false, reason: attempt.reason };
    if (attempt.kind === 'redirect') {
      current = attempt.next;
      continue;
    }
    try {
      return { ok: true, text: await readCapped(attempt.res) };
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    }
  }
  return { ok: false, reason: 'too many redirects' };
}

/** A fetcher for a repo-relative path (containment-checked: an absolute
 *  `from` breaks the "repository-relative" contract and is refused before
 *  any read is attempted) and for `https:` (mechanics above). Plain `http:`
 *  is refused outright — never even attempted. */
export function decisionIndexFetcher(cwd: string): DecisionIndexFetcher {
  return {
    async fetch(from: string): Promise<FetchResult> {
      if (from.startsWith('https://')) return fetchDecisionIndexOverHttp(from);
      if (from.startsWith('http://'))
        return { ok: false, reason: 'plain http is refused — declare an https:// source' };
      if (isAbsolute(from)) {
        return { ok: false, reason: `"${from}" is not a repository-relative path — an absolute path is refused` };
      }
      const resolved = resolve(cwd, from);
      try {
        return { ok: true, text: await readFile(resolved, 'utf8') };
      } catch {
        return { ok: false, reason: `could not read "${from}" (resolved to ${resolved})` };
      }
    },
  };
}
