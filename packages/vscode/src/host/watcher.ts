import * as vscode from 'vscode';
import type { HostMessage } from './messaging.js';
import { buildGraph, type ScanContext } from './scanner.js';

/**
 * Keep the canvas live (spec FR-009, NFR-002). Watches the spec's artifacts plus
 * the shared principles.html; on any add/change/delete it debounces, rebuilds the
 * graph, and posts it. Debounce coalesces editor save-storms and stays well under
 * the 500 ms freshness budget; the webview reconciles by node id so there is no
 * full-canvas reload flicker.
 */
export function watchLifecycle(ctx: ScanContext, post: (message: HostMessage) => void): vscode.Disposable {
  const specWatcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(ctx.specDir, '*.html'));
  const principlesWatcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(ctx.workspaceRoot, 'principles.html'),
  );

  let timer: ReturnType<typeof setTimeout> | undefined;
  const refresh = (): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      void buildGraph(ctx).then((graph) => post({ type: 'graph', graph }));
    }, 80);
  };

  const subscriptions = [
    specWatcher.onDidChange(refresh),
    specWatcher.onDidCreate(refresh),
    specWatcher.onDidDelete(refresh),
    principlesWatcher.onDidChange(refresh),
  ];

  return vscode.Disposable.from(specWatcher, principlesWatcher, ...subscriptions, {
    dispose: () => {
      if (timer) clearTimeout(timer);
    },
  });
}
