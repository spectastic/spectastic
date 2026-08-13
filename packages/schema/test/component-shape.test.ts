import { describe, expect, it } from 'vitest';
import { validate } from '../src/index.js';
import { COMPONENT_MATURITIES } from '../src/visual-vocabulary.js';

/**
 * `component-shape` (spec 097, FR-001/FR-005/FR-006/FR-011).
 *
 * The guard that matters most here is the one asserting maturity uses the
 * project's EXISTING six status values. FR-005 forbids a parallel vocabulary,
 * and the way that requirement gets violated is not by someone declaring
 * "we need a new taxonomy" — it is by quietly adding "stable" as a synonym for
 * accepted, because it reads better to a design-system audience.
 */

const RULE = 'component-shape';
const FILE = '/repo/visual/components.html';

const doc = (body: string) => `<!doctype html><html><head><title>x</title></head><body>${body}</body></html>`;
const findingsFor = (body: string) => validate(doc(body), FILE).filter((f) => f.rule === RULE);

const OK = '<spec-component name="badge" scope="project" maturity="accepted" origin="authored"/>';

describe('a document with no components', () => {
  it('is silent — an empty set is never a gap (FR-010)', () => {
    // The 77-gap-rows lesson: a project consuming everything from a library
    // legitimately authors none, and must not be told it is incomplete.
    expect(findingsFor('<p>a project that consumes everything</p>')).toEqual([]);
  });
});

describe('a well-formed component', () => {
  it('is silent', () => {
    expect(findingsFor(OK)).toEqual([]);
  });
});

describe('the three properties', () => {
  it('flags a missing name', () => {
    expect(findingsFor('<spec-component scope="project" maturity="accepted" origin="authored"/>')).toHaveLength(1);
  });

  it('flags an unrecognised scope', () => {
    const f = findingsFor('<spec-component name="b" scope="shared" maturity="accepted" origin="authored"/>');
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toMatch(/shared/);
  });

  it('flags an unrecognised origin', () => {
    const f = findingsFor('<spec-component name="b" scope="project" maturity="accepted" origin="borrowed"/>');
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toMatch(/borrowed/);
  });

  it('reports each wrong property separately, not the component once', () => {
    expect(findingsFor('<spec-component name="b" scope="shared" maturity="stable" origin="borrowed"/>')).toHaveLength(
      3,
    );
  });
});

describe('maturity uses no parallel vocabulary (FR-005)', () => {
  it('rejects "stable" — the synonym a design-system author reaches for', () => {
    const f = findingsFor('<spec-component name="b" scope="project" maturity="stable" origin="authored"/>');
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toMatch(/stable/);
  });

  it("accepts every one of the project's own status values", () => {
    for (const maturity of COMPONENT_MATURITIES) {
      // replaced-by is supplied throughout: `deprecated` legitimately warns
      // without one (FR-011), and this test is about the maturity vocabulary
      // rather than about deprecation hygiene.
      expect(
        findingsFor(
          `<spec-component name="b" scope="project" maturity="${maturity}" origin="authored" replaced-by="c"/>`,
        ),
        maturity,
      ).toEqual([]);
    }
  });

  it('the maturity list IS the styled status set — a seventh value cannot be added here alone', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const { join } = await import('node:path');
    const here = fileURLToPath(import.meta.url);
    const root = here.slice(0, here.indexOf('/packages/schema/'));
    const css = readFileSync(join(root, 'assets/spec.css'), 'utf8');
    const styled = new Set([...css.matchAll(/spec-status\[value="([a-z]+)"\]/g)].map((m) => m[1]));
    expect([...COMPONENT_MATURITIES].sort()).toEqual([...styled].sort());
  });
});

describe('deprecation (FR-011)', () => {
  it('warns when a deprecated component names no replacement', () => {
    const f = findingsFor('<spec-component name="b" scope="project" maturity="deprecated" origin="authored"/>');
    expect(f).toHaveLength(1);
    expect(f[0]?.severity).toBe('warning');
  });

  it('is silent when it names one', () => {
    expect(
      findingsFor('<spec-component name="b" scope="project" maturity="deprecated" origin="authored" replaced-by="c"/>'),
    ).toEqual([]);
  });
});
