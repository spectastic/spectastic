import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { RECOGNISED_STATE_SOURCES } from '../src/visual-vocabulary.js';

/**
 * The stylesheet and the rule must recognise the same values (spec 095, FR-008,
 * design D-004).
 *
 * FR-008 asks for two guards over one gap, and the cost of two is that they can
 * disagree: a value legal to the rule but broken-looking to a reader, or the
 * reverse. Both are worse than either guard alone, because the reader and the
 * pipeline now tell different stories about the same document.
 *
 * Shaped after `format-band-coupling`, which pins a literal in spec.js against
 * the requirement that owns it for the same reason.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const CSS = join(HERE, '..', '..', '..', 'assets', 'spec.css');

describe('the stylesheet and the vocabulary agree on state sources', () => {
  const css = readFileSync(CSS, 'utf8');

  it('the broken-source selector excludes exactly the recognised values', () => {
    // The selector says "not any of these", so every recognised value must
    // appear in it — a value missing from the selector renders as broken while
    // validating clean.
    const selector = /spec-state:not\(\[source\]\)::after,\s*([^{]*)\{\s*content: "MISSING SOURCE"/.exec(css)?.[1];
    expect(selector, 'MISSING SOURCE selector not found in spec.css').toBeTruthy();
    for (const source of RECOGNISED_STATE_SOURCES) {
      expect(selector, `source "${source}" is legal to the rule but not excluded by the stylesheet`).toContain(
        `[source="${source}"]`,
      );
    }
  });

  it('the stylesheet excludes no value the vocabulary does not recognise', () => {
    const selector =
      /spec-state:not\(\[source\]\)::after,\s*([^{]*)\{\s*content: "MISSING SOURCE"/.exec(css)?.[1] ?? '';
    const excluded = [...selector.matchAll(/\[source="([^"]+)"\]/g)].map((m) => m[1]);
    for (const value of excluded) {
      expect(
        RECOGNISED_STATE_SOURCES as readonly string[],
        `stylesheet accepts "${value}" but the rule does not`,
      ).toContain(value);
    }
  });

  it('every source requiring an origin has a MISSING ORIGIN selector', () => {
    for (const source of ['derived', 'field']) {
      expect(css, `no MISSING ORIGIN affordance for source="${source}"`).toContain(
        `spec-state[source="${source}"]:not([from])::after`,
      );
    }
  });
});
