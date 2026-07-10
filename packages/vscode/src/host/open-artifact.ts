import * as vscode from 'vscode';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
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
  anchor?: string,
): Promise<void> {
  const existing = panels?.get(artifactPath);
  if (existing) {
    // Reveal the reused panel AND repaint it from the current file, so a reopen
    // reflects edits made since it was first shown (T-009). D-009's reuse kept
    // the panel but left its content frozen — reveal without re-read is stale.
    existing.reveal();
    await paint(existing, artifactPath, anchor);
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

  // Intra-corpus link interception (spec 020 T-011): a cross-artifact link
  // clicked inside this webview posts { openLink } instead of escaping to a
  // vscode-resource URL. Resolve it against THIS artifact's dir and open the
  // target in the extension, scrolling to the anchor. Handler closes over this
  // panel's artifactPath, so each panel resolves links against its own file.
  panel.webview.onDidReceiveMessage((msg: unknown) => {
    const m = msg as { type?: string; link?: string; anchor?: string } | null;
    if (m?.type === 'openLink' && typeof m.link === 'string') {
      const target = path.resolve(path.dirname(artifactPath), m.link);
      void openArtifact(target, roots, panels, extensionUri, m.anchor || undefined);
    }
  });

  await paint(panel, artifactPath, anchor);
}

/** Read the artifact and render it into the panel (or a loud error page). Shared
 *  by the first open and the reuse-reveal path so both surface read errors and
 *  carry the doc-path identically. */
async function paint(
  panel: vscode.WebviewPanel,
  artifactPath: string,
  anchor?: string,
): Promise<void> {
  try {
    const raw = await readFile(artifactPath, 'utf8');
    panel.webview.html = rewriteForWebview(
      raw,
      panel.webview,
      path.dirname(artifactPath),
      docPathOf(artifactPath),
      anchor,
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
  anchor?: string,
): string {
  const toUri = (rel: string): string =>
    webview.asWebviewUri(vscode.Uri.file(path.resolve(artifactDir, rel))).toString();

  const rewritten = html.replace(
    /(href|src)="([^"]+)"/g,
    (match, attr: string, val: string) => {
      if (/^(?:https?:|data:|#|mailto:|vscode-|blob:)/.test(val)) return match;
      // Cross-artifact link (spec 020 T-011): a relative href to a .html artifact
      // (optionally #anchor). Rewriting it through asWebviewUri produces a
      // vscode-resource URL that escapes the panel when clicked. Instead, mark it
      // for the injected interceptor and neutralise native navigation.
      const link = attr === 'href' ? /^([^#]*\.html)(?:#(.+))?$/.exec(val) : null;
      if (link) {
        const rel = link[1] ?? '';
        const frag = link[2] ?? '';
        return `href="#" data-artifact-link="${escapeHtml(rel)}" data-anchor="${escapeHtml(frag)}"`;
      }
      return `${attr}="${toUri(val)}"`;
    },
  );

  const nonce = randomBytes(16).toString('base64');
  const csp =
    `<meta http-equiv="Content-Security-Policy" content="` +
    `default-src 'none'; ` +
    `img-src ${webview.cspSource} data: https:; ` +
    `style-src ${webview.cspSource} 'unsafe-inline'; ` +
    `font-src ${webview.cspSource} https: data:; ` +
    `script-src ${webview.cspSource} 'nonce-${nonce}';">`;

  let out = rewritten.replace(/<head>/i, `<head>\n${csp}`);
  // Tell the page its real spec-relative path so the sticky header shows it
  // instead of the webview's synthetic index.html (T-010), and — when the panel
  // was opened by following a cross-artifact link — the anchor to scroll to
  // (T-011). Both ride on <body data-*>; the header JS reads data-doc-path.
  const bodyAttrs =
    (docPath ? ` data-doc-path="${escapeHtml(docPath)}"` : '') +
    (anchor ? ` data-scroll-to="${escapeHtml(anchor)}"` : '');
  if (bodyAttrs) {
    out = out.replace(
      /<body(\s[^>]*)?>/i,
      (_m, attrs: string | undefined) => `<body${attrs ?? ''}${bodyAttrs}>`,
    );
  }
  // Inject the link interceptor (T-011). Intercepts clicks on marked
  // cross-artifact links → postMessage to the host; on load, scrolls to a baked
  // data-scroll-to target. Nonce-authorised against the CSP above.
  out = out.replace(
    /<\/body>/i,
    `<script nonce="${nonce}">${LINK_INTERCEPTOR}</script>\n</body>`,
  );
  return out;
}

/**
 * Webview-side link interceptor (spec 020 T-011). Runs inside the artifact panel:
 * a click on a marked cross-artifact link posts { openLink } to the host instead
 * of navigating; on load, scrolls to the body's data-scroll-to anchor (set when
 * the panel was opened by following such a link). Kept as a string so it ships
 * inline under a CSP nonce — no separate bundle.
 */
const LINK_INTERCEPTOR = `(function(){
  var vscode = acquireVsCodeApi();
  document.addEventListener('click', function(e){
    var t = e.target;
    var a = t && t.closest ? t.closest('a[data-artifact-link]') : null;
    if(!a) return;
    e.preventDefault();
    vscode.postMessage({ type:'openLink', link: a.getAttribute('data-artifact-link'), anchor: a.getAttribute('data-anchor') || '' });
  }, true);
  function scrollToTarget(){
    var id = document.body && document.body.dataset ? document.body.dataset.scrollTo : '';
    if(!id) return;
    var el = document.getElementById(id);
    if(el) el.scrollIntoView({ behavior:'smooth', block:'start' });
  }
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', function(){ setTimeout(scrollToTarget, 0); });
  } else { setTimeout(scrollToTarget, 0); }
})();`;

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
