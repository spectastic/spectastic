import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Structural backstop for the spec-budget band value (REQ-FORMAT-004, risk R-3).
 *
 * The `format-band-coupling` schema rule guards the HTML↔HTML coupling
 * (REQ-FORMAT-004 ↔ requirements that restate it), but the validate engine
 * only ever parses HTML — it never sees `assets/spec.js`, where the gauge's
 * band threshold actually lives. This test closes that gap: it reads the JS
 * source directly and asserts its `band()` threshold matches the percentage
 * REQ-FORMAT-004 declares, so the gauge and its requirement owner cannot
 * silently diverge. Lives in vitest because the JS asset is out of every
 * validated bundle.
 */

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(here, '..', '..', '..');
const SPEC_JS = join(REPO_ROOT, 'assets', 'spec.js');
const META_SPEC = join(REPO_ROOT, 'specs', '000-spectastic', 'spec.html');

/** The green upper bound REQ-FORMAT-004 declares ("green ≤ 80%"). */
function reqFormatThreshold(html: string): number | undefined {
  const start = html.indexOf('id="REQ-FORMAT-004"');
  if (start === -1) return undefined;
  const end = html.indexOf('</spec-requirement>', start);
  const block = html.slice(start, end === -1 ? undefined : end);
  const m = /green[^%]{0,12}?(\d{1,3})\s*%/i.exec(block);
  return m ? Number(m[1]) : undefined;
}

/** The green upper bound assets/spec.js bands at ("pct <= 80 ? 'green'"). */
function specJsThreshold(js: string): number | undefined {
  const m = /pct\s*<=\s*(\d{1,3})\s*\?\s*['"]green['"]/.exec(js);
  return m ? Number(m[1]) : undefined;
}

describe('spec-budget band value', () => {
  it('assets/spec.js bands at the threshold REQ-FORMAT-004 declares', async () => {
    const [js, html] = await Promise.all([readFile(SPEC_JS, 'utf8'), readFile(META_SPEC, 'utf8')]);

    const jsThreshold = specJsThreshold(js);
    const reqThreshold = reqFormatThreshold(html);

    expect(jsThreshold, 'could not read the band() threshold from assets/spec.js').toBeDefined();
    expect(reqThreshold, 'could not read the band threshold from REQ-FORMAT-004').toBeDefined();
    expect(jsThreshold, 'assets/spec.js band must match REQ-FORMAT-004 — update both together').toBe(
      reqThreshold,
    );
    // Anchor the absolute value too, so a coordinated drift of *both* is still caught.
    expect(jsThreshold).toBe(80);
  });

  it('assets/spec.js carries no fabricated "Larson … 1,500 words" citation', async () => {
    const js = await readFile(SPEC_JS, 'utf8');
    // REQ-FORMAT-004 removed this invented citation (Larson never set a word count).
    expect(js).not.toMatch(/Larson/i);
    expect(js).not.toMatch(/1,?500 words must/i);
  });
});
