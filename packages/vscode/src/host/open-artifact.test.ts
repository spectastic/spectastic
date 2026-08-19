import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// open-artifact imports 'vscode', which only exists in the extension host. Mock
// the slice we use so the pure rewrite (plan D-005) runs under vitest.
vi.mock('vscode', () => ({
  Uri: {
    file: (p: string) => ({ fsPath: p, toString: () => `file://${p}` }),
    joinPath: (base: { fsPath: string }, ...segs: string[]) => ({
      fsPath: [base.fsPath, ...segs].join('/'),
      toString: () => `file://${[base.fsPath, ...segs].join('/')}`,
    }),
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

  // The artifact ships its own strict CSP <meta> (spec 045) whose 'self' policy
  // excludes the webview cspSource; if it survives the rewrite it intersects with
  // the webview CSP and blocks the rewritten spec.css / spec.js (page renders
  // unstyled, no JS-built header). The rewrite must strip it, leaving only the
  // webview CSP. (Cross-spec regression: 020 webview × 045 artifact CSP.)
  it("strips the artifact's own CSP meta so it can't block webview-origin assets", () => {
    const withArtifactCsp = `<!doctype html><head>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self'; object-src 'none'; base-uri 'none'">
<link rel="stylesheet" href="../../assets/spec.css">
<script src="../../assets/spec.js"></script></head><body></body></html>`;
    const rewritten = rewriteForWebview(withArtifactCsp, webview, '/repo/specs/099-demo');
    // exactly one CSP meta survives, and it is the webview's (cspSource-scoped)
    expect((rewritten.match(/Content-Security-Policy/g) || []).length).toBe(1);
    expect(rewritten).not.toContain("script-src 'self'");
    expect(rewritten).toContain('script-src vscode-webview://unit');
    // the assets are still linked (so they now actually load under the webview CSP)
    expect(rewritten).toContain('https://webview/repo/assets/spec.css');
    expect(rewritten).toContain('https://webview/repo/assets/spec.js');
  });

  // T-010: the sticky header reads document.body.dataset.docPath in preference
  // to the webview's synthetic location, so the host must stamp the real path.
  it('stamps the spec-relative path onto <body data-doc-path> when given', () => {
    const withPath = rewriteForWebview(html, webview, '/repo/specs/099-demo', '099-demo/tasks.html');
    expect(withPath).toContain('data-doc-path="099-demo/tasks.html"');
  });

  it('omits data-doc-path when no docPath is supplied (backward compatible)', () => {
    expect(out).not.toContain('data-doc-path');
  });

  // T-011: cross-artifact links must NOT be rewritten to escaping vscode-resource
  // URIs; they're marked for the injected interceptor instead.
  describe('cross-artifact link interception (T-011)', () => {
    const withLink = `<!doctype html><head></head><body>
<a href="../001-x/spec.html#SC-002">SC</a>
<a href="./tasks.html">tasks</a>
<a href="../../assets/spec.css">asset</a></body></html>`;
    const rendered = rewriteForWebview(withLink, webview, '/repo/specs/020-demo');

    it('marks a cross-artifact link instead of asWebviewUri-rewriting it', () => {
      expect(rendered).toContain('data-artifact-link="../001-x/spec.html"');
      expect(rendered).toContain('data-anchor="SC-002"');
      expect(rendered).not.toContain('https://webview/repo/specs/001-x/spec.html'); // did not escape
    });

    it('marks a same-dir .html link (no anchor)', () => {
      expect(rendered).toContain('data-artifact-link="./tasks.html"');
    });

    it('still rewrites genuine assets and injects the nonce-authorised interceptor', () => {
      expect(rendered).toContain('https://webview/repo/assets/spec.css'); // asset untouched by link rule
      expect(rendered).toMatch(/<script nonce="[^"]+">/);
      expect(rendered).toContain("type:'openLink'");
      expect(rendered).toContain("script-src vscode-webview://unit 'nonce-");
    });

    it('bakes data-scroll-to onto <body> when an anchor is supplied', () => {
      const scrolled = rewriteForWebview(withLink, webview, '/repo/specs/020-demo', undefined, 'SC-002');
      expect(scrolled).toContain('data-scroll-to="SC-002"');
    });
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
      asWebviewUri: (u: { fsPath: string }) => ({
        toString: () => `https://wv${u.fsPath}`,
      }),
      cspSource: 'x',
      onDidReceiveMessage: vi.fn(),
      postMessage: vi.fn(),
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

  it('brands the panel tab with the favicon when an extensionUri is given (I-037)', async () => {
    const panel = makePanel();
    vi.mocked(vscode.window.createWebviewPanel).mockReturnValue(panel);
    const open = openArtifact as unknown as (
      p: string,
      r: unknown[],
      m: Map<string, unknown> | undefined,
      ext: { fsPath: string },
    ) => Promise<void>;
    await open('/repo/specs/020-vscode-extension/spec.html', [], undefined, {
      fsPath: '/ext',
    });
    expect((panel as { iconPath?: { fsPath: string } }).iconPath?.fsPath).toBe('/ext/media/favicon.svg');
  });

  // T-009: re-opening a reused panel must repaint from the current file, not
  // leave the first render frozen. Uses a real temp file so paint() actually
  // re-reads; the content changes between opens to prove the refresh.
  it('repaints the reused panel from the current file on reopen', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'spectastic-open-'));
    const file = join(dir, 'tasks.html');
    try {
      await writeFile(file, '<!doctype html><head></head><body><h1>VERSION_ONE</h1></body>');
      const panel = makePanel();
      vi.mocked(vscode.window.createWebviewPanel).mockReturnValue(panel);
      const registry = new Map<string, unknown>();
      const open = openArtifact as unknown as (p: string, r: unknown[], m: Map<string, unknown>) => Promise<void>;

      await open(file, [], registry);
      expect(panel.webview.html).toContain('VERSION_ONE');
      expect(panel.webview.html).toContain(`data-doc-path="${basename(dir)}/tasks.html"`);

      await writeFile(file, '<!doctype html><head></head><body><h1>VERSION_TWO</h1></body>');
      await open(file, [], registry);
      expect(vscode.window.createWebviewPanel).toHaveBeenCalledTimes(1); // reused, not stacked
      expect(panel.webview.html).toContain('VERSION_TWO'); // refreshed, not frozen
      expect(panel.webview.html).not.toContain('VERSION_ONE');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
