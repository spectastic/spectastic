import { describe, expect, it } from 'vitest';
import { carryForward } from '../src/commands/design.js';

/**
 * Unit coverage for re-entry preservation (012 FR-011 + FR-016).
 *
 * Imports from `../src/` deliberately, not the package subpath. The re-entry
 * suite next door goes through `@spectastic/core/commands/design`, which is
 * the built bundle — so it exercises `dist` while coverage instruments source,
 * and these branches read as untouched however thoroughly they are driven.
 * The behavioural assertions live there; the branch-by-branch cases live here.
 */

const wrap = (body: string) => `<!doctype html><html><body><main>${body}</main></body></html>`;
const DECISION = (id: string) => `<spec-decision id="${id}"><h4>${id}</h4></spec-decision>`;

describe('carryForward — ADR preservation (FR-011)', () => {
  it('returns the rendered document untouched when there is no prior design', () => {
    const rendered = wrap('<section id="decisions"></section>');
    expect(carryForward(rendered, undefined)).toBe(rendered);
  });

  it('carries an ADR the rendered document lacks', () => {
    const out = carryForward(wrap('<section id="decisions"></section>'), wrap(DECISION('D-007')));
    expect(out).toContain('D-007');
  });

  it('does not duplicate an ADR the rendered document already has', () => {
    const rendered = wrap(`<section id="decisions">${DECISION('D-007')}</section>`);
    const out = carryForward(rendered, wrap(DECISION('D-007')));
    expect(out.match(/id="D-007"/g)).toHaveLength(1);
  });

  it('creates a decisions section when the rendered document has none', () => {
    const out = carryForward(wrap('<p>no decisions here</p>'), wrap(DECISION('D-007')));
    expect(out).toContain('<section id="decisions">');
    expect(out).toContain('D-007');
  });
});

describe('carryForward — declaration preservation (FR-016)', () => {
  const CONTRACT = '<spec-contract shape="request-response" path="api/openapi.yaml"></spec-contract>';
  const VISUAL = '<spec-visual shape="screens" tokens="visual" screens="specs/x/visual" source="a tool"></spec-visual>';

  it('carries both declarations across, whole', () => {
    const out = carryForward(wrap('<section id="decisions"></section>'), wrap(CONTRACT + VISUAL));
    // Whole matters: a declaration stripped of its required attributes is
    // three error-severity findings, so a partial carry is worse than none.
    expect(out).toContain('api/openapi.yaml');
    expect(out).toContain('specs/x/visual');
  });

  it('carries declarations even when no ADR needed carrying', () => {
    // The path where the ADR set is already complete — the declarations must
    // still survive, which is a distinct return branch.
    const rendered = wrap(`<section id="decisions">${DECISION('D-001')}</section>`);
    const out = carryForward(rendered, wrap(`${DECISION('D-001')}${VISUAL}`));
    expect(out).toContain('<spec-visual');
  });

  it('leaves a declaration the generator itself emitted alone', () => {
    const rendered = wrap(`<spec-visual shape="none"></spec-visual><section id="decisions"></section>`);
    const out = carryForward(rendered, wrap(VISUAL));
    // The generator's own wins; the prior one is not appended beside it.
    expect(out.match(/<spec-visual/g)).toHaveLength(1);
    expect(out).toContain('shape="none"');
  });

  it('is a no-op when the prior design carries neither', () => {
    const rendered = wrap('<section id="decisions"></section>');
    expect(carryForward(rendered, wrap('<p>nothing to keep</p>'))).toBe(rendered);
  });
});
