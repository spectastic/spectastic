/**
 * The Playwright-backed `Renderer` port implementation (spec 106-visual-render,
 * T-113, FR-003/NFR-001).
 *
 * This is the only file in the repo that knows what a browser is —
 * `@spectastic/core` declares the `Renderer` shape (`packages/core/src/types.ts`)
 * and never imports this package, enforced by the `no-core-to-render`
 * dependency-cruiser rule. This file re-declares the same shape structurally
 * rather than importing `@spectastic/core`, so this package builds and tests
 * standalone with no core in its dependency graph — the same boundary the
 * ports-and-adapters decision (design.html D-003) calls for.
 *
 * NFR-001: at most one browser process per run — `render()` launches
 * Chromium exactly once and captures every labelled artboard from that one
 * session, however many the source declares.
 */

import { chromium } from 'playwright';

export interface RenderCapture {
  /** The artboard's own declared label, unmodified — naming/slugging is the
   *  caller's job (render-naming.ts), not this port's. */
  label: string;
  bytes: Uint8Array;
  consoleErrors: string[];
}

export interface RenderRunResult {
  captures: RenderCapture[];
}

export interface Renderer {
  checkEgress(): Promise<boolean>;
  render(location: string): Promise<RenderRunResult>;
}

/**
 * The CDN a Claude Design export's own runtime loads from. Named here
 * because design.html D-001's spike found a blocked `unpkg.com` yields four
 * unexpanded template labels rather than a clean failure — a healthy-looking
 * page that lied. Hard-coding it is a recorded tradeoff (design.html
 * Consequences): it is the design tool's own choice of host, not this
 * verb's, and could change under us.
 */
const RUNTIME_CDN = 'https://unpkg.com';

async function reachable(url: string, timeoutMs = 5000): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { method: 'HEAD', signal: controller.signal });
    // Any response at all (even a 4xx from a HEAD the CDN doesn't like) means
    // the host was reached — only a network failure means it wasn't.
    return response.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Selector every artboard declares itself under — the same
 *  `[data-screen-label]` convention the two-artboards fixture
 *  (packages/render/test/fixtures/two-artboards.html) and design.html §9
 *  name. */
const ARTBOARD_SELECTOR = '[data-screen-label]';

export function playwrightRenderer(): Renderer {
  return {
    async checkEgress() {
      return reachable(RUNTIME_CDN);
    },

    async render(location: string): Promise<RenderRunResult> {
      const browser = await chromium.launch();
      try {
        const page = await browser.newPage();

        // Errors are attributed to the artboard capturing when they fire —
        // reset before each capture, read after it. FR-009's manifest wiring
        // (T-310/T-311) is what actually reports these; this port's job is
        // only to not let them fall on the floor between browser and caller.
        let pending: string[] = [];
        page.on('console', (msg) => {
          if (msg.type() === 'error') pending.push(msg.text());
        });
        page.on('pageerror', (err) => {
          pending.push(String(err));
        });

        // 'networkidle' rather than 'load': design.html's own grounding row
        // ("Artboards exist only after the runtime executes") found a design
        // export's labels are template placeholders until its own script has
        // run and settled, which 'load' alone does not wait for.
        await page.goto(location, { waitUntil: 'networkidle' });

        const artboards = page.locator(ARTBOARD_SELECTOR);
        const labels = await artboards.evaluateAll((elements) =>
          elements.map((el) => el.getAttribute('data-screen-label') ?? ''),
        );

        const captures: RenderCapture[] = [];
        for (let i = 0; i < labels.length; i++) {
          pending = [];
          // Each artboard's OWN bounds, never the page (FR-003) — a locator
          // screenshot crops to the matched element's box.
          const bytes = await artboards.nth(i).screenshot();
          captures.push({
            label: labels[i]!,
            bytes: new Uint8Array(bytes),
            consoleErrors: [...pending],
          });
        }

        return { captures };
      } finally {
        await browser.close();
      }
    },
  };
}
