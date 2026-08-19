import { readFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * One browser process per run (106-visual-render, US1 / T-105, NFR-001).
 *
 * NFR-001's literal wording: capturing every artboard from one design source
 * MUST happen in one browser session. spec.html's rationale for the rule is
 * blunt about the alternative — "a session per artboard turns a
 * twenty-two-state gallery into twenty-two browser launches" — and D-007
 * (design.html) commits the whole suite to proving this against a real
 * Chromium rather than a stub, since the feature's entire value is that a
 * real browser produces a real image.
 *
 * This test proves NFR-001 directly: it spies on `chromium.launch` from the
 * `playwright` package — the exact module specifier the adapter itself is
 * expected to import from (design.html §9's project structure names
 * `packages/render/src/index.ts` as "the only thing that knows what a
 * browser is") — and asserts it is called exactly once despite the fixture
 * declaring two artboards. `vi.spyOn` wraps without replacing the
 * implementation, so the real browser still launches; only the call count
 * is intercepted.
 *
 * `playwrightRenderer` does not exist yet — T-113 implements it in
 * packages/render/src/index.ts. Importing it here is expected to fail until
 * then; that import failure is the correct red state for this task.
 */

const FIXTURE_PATH = fileURLToPath(new URL('./fixtures/two-artboards.html', import.meta.url));

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const html = await readFile(FIXTURE_PATH);
  server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(html);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('expected the test server to bind a TCP address');
  }
  baseUrl = `http://127.0.0.1:${address.port}/`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

describe('NFR-001 · one browser process per run', () => {
  it('launches Chromium exactly once while capturing both artboards from one design source', async () => {
    const { playwrightRenderer } = await import('../src/index.js');
    const launchSpy = vi.spyOn(chromium, 'launch');

    try {
      const result = await playwrightRenderer().render(baseUrl);

      // The heart of NFR-001: one design source, one browser process, no
      // matter how many artboards it declares.
      expect(launchSpy).toHaveBeenCalledTimes(1);

      // Both artboards were still found and captured in that one session.
      expect(result.captures).toHaveLength(2);
      const labels = result.captures.map((capture) => capture.label).sort();
      expect(labels).toEqual(['first', 'second']);
    } finally {
      launchSpy.mockRestore();
    }
  });
});
