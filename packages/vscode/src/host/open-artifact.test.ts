import { describe, it, expect, vi, beforeEach } from 'vitest';

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

import * as vscode from 'vscode';
import { openArtifact, rewriteForWebview } from './open-artifact.js';

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

// T-501 (spec FR-003, plan D-009). Write-and-fail-first for artifact-panel
// identity + reuse: the panel title leads with the spec id (survives tab
// truncation), and re-opening the same artifact reveals the existing panel
// instead of stacking a duplicate. Fails against the current basename title +
// stateless openArtifact.
function makePanel(reveal: ReturnType<typeof vi.fn> = vi.fn()): vscode.WebviewPanel {
  return {
    webview: {
      html: '',
      asWebviewUri: (u: { fsPath: string }) => ({ toString: () => `https://wv${u.fsPath}` }),
      cspSource: 'x',
    },
    reveal,
    onDidDispose: vi.fn(),
  } as unknown as vscode.WebviewPanel;
}

describe('panel identity + reuse (FR-003, D-009)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('titles the panel "<spec-id> · <verb>", spec id leading', async () => {
    vi.mocked(vscode.window.createWebviewPanel).mockReturnValue(makePanel());
    await openArtifact('/repo/specs/020-vscode-extension/spec.html', []);
    const title = vi.mocked(vscode.window.createWebviewPanel).mock.calls[0]?.[1];
    expect(title).toBe('020-vscode-extension · spec');
  });

  it('reuses one panel per artifact — re-opening reveals, does not stack a duplicate', async () => {
    const reveal = vi.fn();
    vi.mocked(vscode.window.createWebviewPanel).mockReturnValue(makePanel(reveal));
    const registry = new Map<string, unknown>();
    // The reuse map is threaded in by T-504; reference the intended 3-arg shape.
    const open = openArtifact as unknown as (p: string, r: unknown[], m: Map<string, unknown>) => Promise<void>;
    await open('/repo/specs/020-vscode-extension/spec.html', [], registry);
    await open('/repo/specs/020-vscode-extension/spec.html', [], registry);
    expect(vscode.window.createWebviewPanel).toHaveBeenCalledTimes(1);
    expect(reveal).toHaveBeenCalledTimes(1);
  });
});
