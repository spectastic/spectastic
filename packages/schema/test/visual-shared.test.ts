import { describe, expect, it } from 'vitest';
import { readVisualDeclarations } from '../src/visual-shared.js';

/**
 * `readVisualDeclarations` — the grid and coverage attributes (093 FR-005,
 * FR-012, applied change 2026-08-13-declare-the-variant-grid).
 *
 * The reader stays pure and stays dumb: it reports what the attribute says and
 * judges none of it. Whether an absent grid is a finding belongs to the shape
 * rule, and whether a named context exists belongs to a kernel scan that can
 * read a second file — neither is this function's business.
 */
describe('readVisualDeclarations — variants and contexts', () => {
  const wrap = (attrs: string) => `<main><spec-visual ${attrs}><p>x</p></spec-visual></main>`;

  it('reads the declared variant grid path', () => {
    const [d] = readVisualDeclarations(
      wrap('shape="screens" tokens="visual/tokens" variants="visual/variants.html" screens="specs/001/visual" source="Figma"'),
    );
    expect(d?.variants).toBe('visual/variants.html');
  });

  it('reads the addressed contexts verbatim, without splitting or judging them', () => {
    const [d] = readVisualDeclarations(
      wrap('shape="screens" tokens="t" variants="v" screens="s" source="x" contexts="platform=ios mode=dark"'),
    );
    expect(d?.contexts).toBe('platform=ios mode=dark');
  });

  it('leaves both undefined when neither is declared, since absence is not a finding here', () => {
    const [d] = readVisualDeclarations(wrap('shape="screens" tokens="t" screens="s" source="x"'));
    expect(d?.variants).toBeUndefined();
    expect(d?.contexts).toBeUndefined();
  });

  it('reads a whole-grid coverage claim as the value it carries, not as absence', () => {
    // FR-012 makes "addresses all of them" an explicit claim precisely so it
    // never has to be inferred from silence; the reader must not collapse it.
    const [d] = readVisualDeclarations(wrap('shape="screens" tokens="t" screens="s" source="x" contexts="all"'));
    expect(d?.contexts).toBe('all');
  });

  it('reports each declaration separately when a document carries several', () => {
    const html = `<main>${wrap('shape="screens" tokens="t" variants="a.html" screens="s" source="x"')}${wrap('shape="screens" tokens="t" variants="b.html" screens="s" source="x"')}</main>`;
    expect(readVisualDeclarations(html).map((d) => d.variants)).toEqual(['a.html', 'b.html']);
  });
});
