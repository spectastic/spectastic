/**
 * Theme bridge (spec FR-012, plan D-007). VS Code tags <body> with vscode-light /
 * vscode-dark / vscode-high-contrast; mirror that onto a data-mode attribute so
 * the canvas's brand tokens pick the right (light vs brightened) set. Surfaces
 * themselves are wired to --vscode-* directly in canvas.css.
 */
export function applyTheme(root: HTMLElement, body: HTMLElement = document.body): void {
  const dark =
    body.classList.contains('vscode-dark') || body.classList.contains('vscode-high-contrast');
  root.dataset.mode = dark ? 'dark' : 'light';
}

/** Observe live theme changes (the user switching VS Code themes). */
export function watchTheme(root: HTMLElement, body: HTMLElement = document.body): MutationObserver {
  const observer = new MutationObserver(() => applyTheme(root, body));
  observer.observe(body, { attributes: true, attributeFilter: ['class'] });
  return observer;
}
