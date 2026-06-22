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
export async function openArtifact(artifactPath: string, roots: vscode.Uri[]): Promise<void> {
  const artifactDir = path.dirname(artifactPath);
  const title = path.basename(artifactPath, '.html');

  const panel = vscode.window.createWebviewPanel(
    'spectastic.artifact',
    title,
    { viewColumn: vscode.ViewColumn.Active, preserveFocus: false },
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: roots,
    },
  );

  try {
    const raw = await readFile(artifactPath, 'utf8');
    panel.webview.html = rewriteForWebview(raw, panel.webview, artifactDir);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    panel.webview.html = errorPage(panel.webview, artifactPath, message);
  }
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

  return rewritten.replace(/<head>/i, `<head>\n${csp}`);
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
