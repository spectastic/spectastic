import { describe, it, expect, vi } from 'vitest';

// open-artifact imports 'vscode', which only exists in the extension host. Mock
// the slice we use so the pure rewrite (plan D-005) runs under vitest.
vi.mock('vscode', () => ({
  Uri: {
    file: (p: string) => ({ fsPath: p, toString: () => `file://${p}` }),
  },
  ViewColumn: { Active: 1 },
  window: { createWebviewPanel: vi.fn() },
  Disposable: { from: () => ({ dispose() {} }) },
}));

import { rewriteForWebview } from './open-artifact.js';

const webview = {
  asWebviewUri: (uri: { fsPath: string }) => ({
    toString: () => `https://webview${uri.fsPath}`,
  }),
  cspSource: 'vscode-webview://unit',
} as unknown as Parameters<typeof rewriteForWebview>[1];

describe('rewriteForWebview', () => {
  const html = `<!doctype html><head>
<link rel="stylesheet" href="../../assets/spec.css">
<script src="../../assets/spec.js"></script>
<a href="https://example.com/x">ext</a>
<a href="#anchor">a</a></head><body></body></html>`;

  const out = rewriteForWebview(html, webview, '/repo/specs/099-demo');

  it('rewrites relative asset references to webview URIs', () => {
    expect(out).toContain('https://webview/repo/assets/spec.css');
    expect(out).toContain('https://webview/repo/assets/spec.js');
  });

  it('leaves absolute and in-page links untouched', () => {
    expect(out).toContain('href="https://example.com/x"');
    expect(out).toContain('href="#anchor"');
  });

  it('injects a CSP that scopes resources to the webview origin', () => {
    expect(out).toContain('Content-Security-Policy');
    expect(out).toContain("style-src vscode-webview://unit 'unsafe-inline'");
    expect(out).toContain('script-src vscode-webview://unit');
  });
});
