// Throwaway prototype for exploration 088-sortable-list (spec 023 T-001 fixture).
// Drag-to-reorder built loosely to learn whether pointer-driven reorder feels
// right. NOT production: no tests, no error handling, one file. The graduation
// extract reads this build's demonstrated behaviour into a real spec; classify
// decides whether this code is kept (tracer-bullet) or rebuilt clean (spike).

export interface Row {
  id: string;
  label: string;
}

const STORAGE_KEY = 'sortable-list:order';

/** Wire pointer-driven drag-to-reorder onto a list, persisting order to localStorage. */
export function makeSortable(container: HTMLElement, rows: Row[]): void {
  let order = loadOrder() ?? rows.map((r) => r.id);
  render();

  let dragId: string | null = null;
  container.addEventListener('pointerdown', (e) => {
    const el = (e.target as HTMLElement).closest('[data-row]') as HTMLElement | null;
    dragId = el?.dataset.row ?? null;
  });
  container.addEventListener('pointermove', (e) => {
    if (!dragId) return;
    const over = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    const overId = over?.closest('[data-row]')?.getAttribute('data-row');
    if (overId && overId !== dragId) {
      order = reorder(order, dragId, overId);
      saveOrder(order);
      render();
    }
  });
  container.addEventListener('pointerup', () => {
    dragId = null;
  });

  function render(): void {
    const byId = new Map(rows.map((r) => [r.id, r]));
    container.innerHTML = order
      .map((id) => `<li data-row="${id}">${byId.get(id)?.label ?? id}</li>`)
      .join('');
  }
}

function reorder(order: string[], moved: string, before: string): string[] {
  const next = order.filter((id) => id !== moved);
  next.splice(next.indexOf(before), 0, moved);
  return next;
}

function loadOrder(): string[] | null {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
  } catch {
    return null;
  }
}

function saveOrder(order: string[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(order));
}
