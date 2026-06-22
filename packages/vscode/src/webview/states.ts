/**
 * Non-node render states (spec FR-011): a calm empty / first-run panel, and the
 * unknown-node degradation helper. Keeping these out of the hot node path keeps
 * the render loop readable.
 */
export function renderEmpty(reason: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'empty-state';
  const h = document.createElement('h2');
  h.textContent = 'No lifecycle to show';
  const p = document.createElement('p');
  p.textContent = reason;
  el.append(h, p);
  return el;
}
