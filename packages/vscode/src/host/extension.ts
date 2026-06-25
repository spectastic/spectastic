import * as vscode from 'vscode';
import * as path from 'node:path';
import { buildGraph, listSpecs, type ScanContext } from './scanner.js';
import { watchLifecycle } from './watcher.js';
import { openArtifact } from './open-artifact.js';
import type { HostMessage, Orientation, WebviewMessage } from './messaging.js';

/**
 * Extension host entry (spec FR-008, FR-009). Registers the canvas webview view
 * and the "select spec" command, builds the LifecycleGraph for the active spec,
 * keeps it live via the watcher, and routes node clicks to the artifact webview
 * (FR-003 / T-212). Read-only throughout — never writes an artifact.
 */
const VIEW_ID = 'spectastic.lifecycleCanvas';
const ORIENTATION_KEY = 'spectastic.orientation';

export function activate(context: vscode.ExtensionContext): void {
  const provider = new CanvasViewProvider(context);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(VIEW_ID, provider),
    vscode.commands.registerCommand('spectastic.selectSpec', () => provider.promptForSpec()),
    vscode.commands.registerCommand('spectastic.toggleOrientation', () =>
      provider.toggleOrientation(),
    ),
  );
}

export function deactivate(): void {
  /* disposables are owned by context.subscriptions */
}

class CanvasViewProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;
  private specId: string | undefined;
  private watcher: vscode.Disposable | undefined;
  private orientation: Orientation;
  /** Open artifact panels keyed by path — reuse one per artifact (FR-003, D-009). */
  private readonly panels = new Map<string, vscode.WebviewPanel>();

  constructor(private readonly context: vscode.ExtensionContext) {
    this.orientation =
      context.workspaceState.get<Orientation>(ORIENTATION_KEY) ?? 'vertical';
  }

  /** Flip vertical ↔ horizontal, persist per workspace, and re-render (spec FR-013). */
  async toggleOrientation(): Promise<void> {
    this.orientation = this.orientation === 'vertical' ? 'horizontal' : 'vertical';
    await this.context.workspaceState.update(ORIENTATION_KEY, this.orientation);
    await this.refresh();
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'dist')],
    };
    view.webview.html = this.html(view.webview);

    view.webview.onDidReceiveMessage((message: WebviewMessage) => {
      if (message.type === 'ready') void this.refresh();
      else if (message.type === 'open') void this.handleOpen(message.path);
    });

    view.onDidDispose(() => this.watcher?.dispose());
  }

  async promptForSpec(): Promise<void> {
    const root = workspaceRoot();
    if (!root) return;
    const specs = await listSpecs(path.join(root, 'specs'));
    if (specs.length === 0) {
      void vscode.window.showInformationMessage('No specs found under specs/.');
      return;
    }
    const items: vscode.QuickPickItem[] = specs.map((id) => ({
      label: id,
      description: id === this.specId ? '$(check) showing now' : '',
    }));
    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select a spec to show in the lifecycle canvas',
    });
    if (!picked) return;
    this.specId = picked.label;
    await this.refresh();
  }

  private async refresh(): Promise<void> {
    const root = workspaceRoot();
    if (!root || !this.view) return;
    const specsRoot = path.join(root, 'specs');

    if (!this.specId) this.specId = await defaultSpec(specsRoot);
    if (!this.specId) {
      this.post({ type: 'empty', reason: 'No specs found under specs/. Create one to begin.' });
      return;
    }

    const ctx: ScanContext = {
      specId: this.specId,
      specDir: path.join(specsRoot, this.specId),
      specsRoot,
      workspaceRoot: root,
    };

    this.watcher?.dispose();
    this.watcher = watchLifecycle(ctx, (m) => this.post(m));

    const graph = await buildGraph(ctx);
    this.post({ type: 'graph', graph });
  }

  private async handleOpen(artifactPath: string): Promise<void> {
    const root = workspaceRoot();
    const roots = root ? [vscode.Uri.file(root)] : [];
    await openArtifact(artifactPath, roots, this.panels);
  }

  private post(message: HostMessage): void {
    // Stamp the active orientation onto every graph post — including the watcher's —
    // so a horizontal toggle survives live updates (spec FR-004/FR-013).
    const stamped: HostMessage =
      message.type === 'graph' ? { ...message, orientation: this.orientation } : message;
    void this.view?.webview.postMessage(stamped);
  }

  private html(webview: vscode.Webview): string {
    const dist = vscode.Uri.joinPath(this.context.extensionUri, 'dist');
    const script = webview.asWebviewUri(vscode.Uri.joinPath(dist, 'webview.global.js'));
    const style = webview.asWebviewUri(vscode.Uri.joinPath(dist, 'webview.css'));
    const nonce = makeNonce();
    const csp =
      `default-src 'none'; ` +
      `img-src ${webview.cspSource} data:; ` +
      `font-src ${webview.cspSource} https: data:; ` +
      `style-src ${webview.cspSource} 'unsafe-inline'; ` +
      `script-src 'nonce-${nonce}';`;
    return `<!doctype html><html><head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<link rel="stylesheet" href="${style.toString()}">
</head><body>
<div id="canvas-root"></div>
<script nonce="${nonce}" src="${script.toString()}"></script>
</body></html>`;
  }
}

function workspaceRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

/** Most-recently-modified spec, matching the lifecycle's "active spec" convention. */
async function defaultSpec(specsRoot: string): Promise<string | undefined> {
  const specs = await listSpecs(specsRoot);
  let best: { id: string; mtime: number } | undefined;
  for (const id of specs) {
    try {
      const stat = await vscode.workspace.fs.stat(
        vscode.Uri.file(path.join(specsRoot, id, 'spec.html')),
      );
      if (!best || stat.mtime > best.mtime) best = { id, mtime: stat.mtime };
    } catch {
      // skip
    }
  }
  return best?.id;
}

function makeNonce(): string {
  let text = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) text += chars.charAt(Math.floor(Math.random() * chars.length));
  return text;
}
