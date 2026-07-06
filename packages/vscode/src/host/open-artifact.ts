import * as vscode from 'vscode';
import { readFile } from 'node:fs/promises';
import * as path from 'node:path';

/**
 * Open a rendered spectastic artifact in a WebviewPanel (spec FR-003, plan D-005).
 *
 * The artifact is a self-contained .html that links shared assets by relative
 * path (`../../assets/spec.css`, …). A webview cannot load `file:` URLs directly,
 * so every relative `href`/`src` is rewritten through `asWebviewUri` and the page
 * is served under a strict CSP scoped to the webview's own resource origin.
 *
 * This started as the T-004 spike that retired the riskiest unknown in the plan
 * and was hardened in T-210 (nonce-free external scripts, read failure surfaced).
 */
/**
 * Panel title that identifies the artifact's spec (FR-003, D-009): the spec id
 * LEADS the title so it survives VS Code's middle-out tab truncation, e.g.
 * `020-vscode-extension · spec`. Falls back to the bare verb off the spec tree.
 */
export function artifactPanelTitle(artifactPath: string): string {
  const verb = path.basename(artifactPath, '.html');
  const specId = /(?:^|\/)specs\/([^/]+)\//.exec(artifactPath)?.[1];
  return specId ? `${specId} · ${verb}` : verb;
}

/**
 * Open a rendered artifact. With a `panels` registry (the provider's), re-opening
 * the same artifact reveals its existing panel instead of stacking a duplicate
 * (FR-003, D-009); panels from other specs stay open (no auto-close).
 */
export async function openArtifact(
  artifactPath: string,
  roots: vscode.Uri[],
  panels?: Map<string, vscode.WebviewPanel>,
  extensionUri?: vscode.Uri,
): Promise<void> {
  const existing = panels?.get(artifactPath);
  if (existing) {
    // Reveal the reused panel AND repaint it from the current file, so a reopen
    // reflects edits made since it was first shown (T-009). D-009's reuse kept
    // the panel but left its content frozen — reveal without re-read is stale.
    existing.reveal();
    await paint(existing, artifactPath);
    return;
  }

  const panel = vscode.window.createWebviewPanel(
    'spectastic.artifact',
    artifactPanelTitle(artifactPath),
    { viewColumn: vscode.ViewColumn.Active, preserveFocus: false },
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: roots,
    },
  );
  // Brand the tab with the spectastic favicon, matching the activity-bar icon (I-037).
  if (extensionUri) {
    panel.iconPath = vscode.Uri.joinPath(extensionUri, 'media', 'favicon.svg');
  }
  panels?.set(artifactPath, panel);
  panel.onDidDispose(() => panels?.delete(artifactPath));

  await paint(panel, artifactPath);
}

/** Read the artifact and render it into the panel (or a loud error page). Shared
 *  by the first open and the reuse-reveal path so both surface read errors and
 *  carry the doc-path identically. */
async function paint(panel: vscode.WebviewPanel, artifactPath: string): Promise<void> {
  try {
    const raw = await readFile(artifactPath, 'utf8');
    panel.webview.html = rewriteForWebview(
      raw,
      panel.webview,
      path.dirname(artifactPath),
      docPathOf(artifactPath),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    panel.webview.html = errorPage(panel.webview, artifactPath, message);
  }
}

/** The artifact's spec-relative path for the in-page sticky header (T-010):
 *  `<spec-id>/<file>`, e.g. `027-git-trailers/tasks.html`. A webview loads the
 *  HTML as a string, so the page's own `location` is synthetic (…/index.html) —
 *  the host must tell the page its real path via `<body data-doc-path>`, which
 *  the shared header JS already prefers over `location.pathname`. */
function docPathOf(artifactPath: string): string {
  return `${path.basename(path.dirname(artifactPath))}/${path.basename(artifactPath)}`;
}

/**
 * Rewrite an artifact's relative asset references to webview URIs and inject a
 * CSP. Absolute schemes (http(s), data, in-page anchors, mailto) are left alone.
 * Exported for the T-200 Playwright check, which asserts that spec.css actually
 * applies once the rewrite has run.
 */
export function rewriteForWebview(
  html: string,
  webview: Pick<vscode.Webview, 'asWebviewUri' | 'cspSource'>,
  artifactDir: string,
  docPath?: string,
): string {
  const toUri = (rel: string): string =>
    webview.asWebviewUri(vscode.Uri.file(path.resolve(artifactDir, rel))).toString();

  const rewritten = html.replace(
    /(href|src)="([^"]+)"/g,
    (match, attr: string, val: string) => {
      if (/^(?:https?:|data:|#|mailto:|vscode-|blob:)/.test(val)) return match;
      return `${attr}="${toUri(val)}"`;
    },
  );

  const csp =
    `<meta http-equiv="Content-Security-Policy" content="` +
    `default-src 'none'; ` +
    `img-src ${webview.cspSource} data: https:; ` +
    `style-src ${webview.cspSource} 'unsafe-inline'; ` +
    `font-src ${webview.cspSource} https: data:; ` +
    `script-src ${webview.cspSource};">`;

  let out = rewritten.replace(/<head>/i, `<head>\n${csp}`);
  // Tell the page its real spec-relative path so the sticky header shows it
  // instead of the webview's synthetic index.html (T-010). The header JS reads
  // document.body.dataset.docPath in preference to location.pathname.
  if (docPath) {
    out = out.replace(
      /<body(\s[^>]*)?>/i,
      (_m, attrs: string | undefined) => `<body${attrs ?? ''} data-doc-path="${escapeHtml(docPath)}">`,
    );
  }
  return out;
}

function errorPage(
  webview: Pick<vscode.Webview, 'cspSource'>,
  artifactPath: string,
  message: string,
): string {
  return (
    `<!doctype html><html><head>` +
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">` +
    `</head><body style="font-family:sans-serif;padding:2rem;color:#353534;background:#f6f5f1;">` +
    `<h2>Could not open artifact</h2>` +
    `<p><code>${escapeHtml(artifactPath)}</code></p>` +
    `<p style="color:#73706d;">${escapeHtml(message)}</p>` +
    `</body></html>`
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;',
  );
}
